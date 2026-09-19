import { NextResponse } from 'next/server';
import zlib from 'zlib';

// Polyfill DOMMatrix for Node.js serverless runtime (Vercel / AWS Lambda)
if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrixMock {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(init?: unknown) {
      if (Array.isArray(init) && init.length >= 6) {
        this.a = init[0]; this.b = init[1]; this.c = init[2];
        this.d = init[3]; this.e = init[4]; this.f = init[5];
      }
    }
    multiply() { return this; }
    translate() { return this; }
    scale() { return this; }
    rotate() { return this; }
    inverse() { return this; }
    transformPoint(p: unknown) { return p; }
  }
  (globalThis as unknown as { DOMMatrix: typeof DOMMatrixMock }).DOMMatrix = DOMMatrixMock;
}

interface DocumentPage {
  pageNumber: number;
  text: string;
}

interface DocumentChunk {
  chunkId: string;
  pageNumber: number;
  text: string;
}

// Stop words list for term tokenization
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in', 'into', 'is', 'it',
  'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the', 'their', 'then', 'there', 'these',
  'they', 'this', 'to', 'was', 'will', 'with', 'what', 'where', 'when', 'who', 'how', 'why',
  'which', 'can', 'could', 'would', 'should', 'tell', 'me', 'about', 'explain', 'show', 'list',
  'give', 'find', 'does', 'do', 'did', 'has', 'have', 'had', 'from', 'out', 'up', 'down',
]);

// Pure JS PDF Stream Text Extractor (Native Node.js zlib stream decompressor fallback)
function extractPdfTextPureJs(pdfBuffer: Buffer): DocumentPage[] {
  const pages: DocumentPage[] = [];
  const pdfString = pdfBuffer.toString('binary');
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/gi;
  let match: RegExpExecArray | null;
  let pageNum = 1;

  while ((match = streamRegex.exec(pdfString)) !== null) {
    const rawStream = match[1];
    let decompressed = '';

    try {
      const streamBuf = Buffer.from(rawStream, 'binary');
      decompressed = zlib.inflateSync(streamBuf).toString('binary');
    } catch {
      decompressed = rawStream;
    }

    if (decompressed) {
      const textPieces: string[] = [];

      // Match (text) Tj or (text) TJ text instructions
      const tjMatches = decompressed.match(/\(([^()\\]|\\[\s\S])*\)\s*T[jJ]/g) || [];
      for (const m of tjMatches) {
        const clean = m.replace(/\)\s*T[jJ]$/, '').slice(1).replace(/\\([()\\])/g, '$1').trim();
        if (clean.length >= 1 && !/^(FlateDecode|Font|DeviceRGB|Helvetica|Times|Type1|TrueType|Catalog|Pages)/i.test(clean)) {
          textPieces.push(clean);
        }
      }

      // Match [(text) (text)] TJ array instructions
      const tjArrayMatches = decompressed.match(/\[\s*(\(([^()\\]|\\[\s\S])*\)\s*|-?\d+\s*)+\]\s*TJ/g) || [];
      for (const m of tjArrayMatches) {
        const subPieces = m.match(/\(([^()\\]|\\[\s\S])*\)/g) || [];
        for (const sub of subPieces) {
          const clean = sub.slice(1, -1).replace(/\\([()\\])/g, '$1').trim();
          if (clean.length >= 1 && !/^(FlateDecode|Font|DeviceRGB|Helvetica|Times|Type1|TrueType|Catalog|Pages)/i.test(clean)) {
            textPieces.push(clean);
          }
        }
      }

      // Fallback text string extraction inside decompressed stream
      if (textPieces.length === 0) {
        const generalMatches = decompressed.match(/\(([^()\\]|\\[\s\S])*\)/g) || [];
        for (const m of generalMatches) {
          const clean = m.slice(1, -1).replace(/\\([()\\])/g, '$1').trim();
          if (clean.length >= 2 && /[a-zA-Z0-9]/.test(clean) && !/^(FlateDecode|Font|DeviceRGB|Helvetica|Times|Type1|TrueType|Catalog|Pages)/i.test(clean)) {
            textPieces.push(clean);
          }
        }
      }

      if (textPieces.length > 0) {
        const pageText = textPieces.join(' ').replace(/\s+/g, ' ').trim();
        if (pageText.length > 5) {
          pages.push({ pageNumber: pageNum++, text: pageText });
        }
      }
    }
  }

  return pages;
}

// Extract page-by-page text from PDF buffer or plain text string (Max 20 pages)
async function extractDocumentPages(
  fileData: string | undefined,
  fileName: string | undefined,
  fileType: string | undefined,
  documentText: string | undefined
): Promise<DocumentPage[]> {
  let pages: DocumentPage[] = [];

  let base64String = '';
  if (fileData) {
    if (fileData.includes('base64,')) {
      base64String = fileData.split('base64,')[1];
    } else {
      base64String = fileData;
    }
  }

  const isPdf =
    (fileName && fileName.toLowerCase().endsWith('.pdf')) ||
    (fileType && fileType.toLowerCase().includes('pdf'));

  if (base64String && isPdf) {
    const buffer = Buffer.from(base64String, 'base64');

    // 1. Primary: Use pdf-parse library
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const res = await parser.getText();
      await parser.destroy();

      if (res && res.pages && res.pages.length > 0) {
        for (let i = 0; i < res.pages.length; i++) {
          const p = res.pages[i];
          const cleaned = (p.text || '').replace(/[^\x20-\x7E\x0A\x0D\x09]/g, ' ').replace(/[ \t]+/g, ' ').trim();
          if (cleaned.length > 0) {
            pages.push({ pageNumber: p.num || (i + 1), text: cleaned });
          }
        }
      } else if (res && res.text) {
        const cleaned = res.text.replace(/[^\x20-\x7E\x0A\x0D\x09]/g, ' ').replace(/[ \t]+/g, ' ').trim();
        if (cleaned) {
          pages.push({ pageNumber: 1, text: cleaned });
        }
      }
    } catch (err) {
      console.error('pdf-parse library extraction attempt error:', err);
    }

    // 2. Secondary fallback: Pure JS zlib stream extractor
    if (pages.length === 0) {
      try {
        pages = extractPdfTextPureJs(buffer);
      } catch (err) {
        console.error('Pure JS stream extraction error:', err);
      }
    }
  } else if (base64String) {
    // Plain text / plain file base64
    try {
      const buffer = Buffer.from(base64String, 'base64');
      const text = buffer.toString('utf-8').replace(/[^\x20-\x7E\x0A\x0D\x09]/g, ' ').replace(/[ \t]+/g, ' ').trim();
      if (text) {
        pages.push({ pageNumber: 1, text });
      }
    } catch (err) {
      console.error('Plain text base64 conversion error:', err);
    }
  }

  if (pages.length === 0 && documentText) {
    const cleaned = documentText.replace(/[^\x20-\x7E\x0A\x0D\x09]/g, ' ').replace(/[ \t]+/g, ' ').trim();
    if (cleaned) {
      pages.push({ pageNumber: 1, text: cleaned });
    }
  }

  // Enforce max 20 pages limit per assignment specification
  if (pages.length > 20) {
    pages = pages.slice(0, 20);
  }

  return pages;
}

// Split pages into chunk items (~300 words with 50 word overlap)
function chunkDocumentPages(pages: DocumentPage[]): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let globalChunkCounter = 1;

  for (const page of pages) {
    const words = page.text.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const chunkSize = 300;
    const overlap = 50;
    let start = 0;

    while (start < words.length) {
      const end = Math.min(start + chunkSize, words.length);
      const chunkWords = words.slice(start, end);
      const chunkText = chunkWords.join(' ');

      chunks.push({
        chunkId: `chunk_${globalChunkCounter++}`,
        pageNumber: page.pageNumber,
        text: chunkText,
      });

      if (end >= words.length) break;
      start += chunkSize - overlap;
    }
  }

  return chunks;
}

// Tokenize text into lowercased terms
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400 });
    }

    const {
      prompt,
      systemPrompt,
      userQuery,
      documentText,
      fileData,
      fileName,
      fileType,
      mode,
    } = body;

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY environment variable is not configured on the server.' },
        { status: 500 }
      );
    }

    const pages = await extractDocumentPages(fileData, fileName, fileType, documentText);

    // If file/document data was provided but text extraction returned 0 pages, fail with HTTP 400
    if (pages.length === 0 && (fileData || documentText)) {
      return NextResponse.json(
        { error: 'Unable to extract text from the PDF document.' },
        { status: 400 }
      );
    }

    if (pages.length === 0) {
      return NextResponse.json(
        { error: 'No document data or text provided.' },
        { status: 400 }
      );
    }

    const chunks = chunkDocumentPages(pages);
    const fullDocContent = chunks.map((c) => `[Page ${c.pageNumber}] ${c.text}`).join('\n\n');

    if (mode === 'summary') {
      const messages = [
        {
          role: 'system',
          content:
            `You are a document summarization assistant for TeamGate.
Summarize ONLY the content provided in the document.
Create a concise, accurate and well-structured summary.

Formatting requirements:
- Use Markdown headings (###) for major sections.
- Use bullet points for lists.
- Use numbered lists where appropriate.
- Use Markdown tables when comparing multiple items or listing structured details.
- Preserve important names, dates, numbers and technical terms.
- Do not add information that is not present in the document.
- Do not repeat information unnecessarily.
- Keep the summary easy to scan.
- End the summary with a source citation line: [Source: ${fileName || 'Uploaded Document'}].`,
        },
        {
          role: 'user',
          content: `Document Name: ${fileName || 'Uploaded Document'}\n\nContent:\n${fullDocContent.slice(0, 8000)}\n\nPlease summarize the key scope, task requirements, and purpose of this document.`,
        },
      ];

      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages,
          temperature: 0.1,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('Groq API error (summary):', resp.status, errText);
        return NextResponse.json(
          { error: `Groq API returned status ${resp.status}` },
          { status: resp.status }
        );
      }

      const data = await resp.json();
      let reply = data.choices?.[0]?.message?.content?.trim() || '';
      if (fileName && !reply.includes(`[Source:`)) {
        reply += `\n\n[Source: ${fileName}]`;
      }
      return NextResponse.json({ reply });
    }

    // QA Mode
    const query = userQuery || prompt || '';
    const queryTokens = tokenize(query);

    // Fast local relevance check: if query has terms but document has zero matching tokens or characters
    const docTextLower = fullDocContent.toLowerCase();
    const matchingChunk = chunks.find((c) => {
      const cLower = c.text.toLowerCase();
      return queryTokens.some((t) => cLower.includes(t));
    });
    const hasAnyMatch = queryTokens.some((t) => docTextLower.includes(t));

    // If query contains terms like 'capital', 'recipe', 'football' that are 100% absent from document text
    if (queryTokens.length > 0 && !hasAnyMatch) {
      return NextResponse.json({ reply: 'No response is found from the document.' });
    }

    const matchedPageNum = matchingChunk ? matchingChunk.pageNumber : (pages[0]?.pageNumber || 1);

    const defaultSystemPrompt = `You are TeamGate's document-grounded assistant.

Answer only from the supplied excerpts from the selected document.

Do not use outside knowledge.
Do not invent information.
Do not infer unsupported facts.

If the supplied document does not contain enough information to answer the question, return exactly:

No response is found from the document.`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt || defaultSystemPrompt,
      },
      {
        role: 'user',
        content: `Target File: ${fileName || 'Document'}\n\nDocument Content:\n${fullDocContent.slice(0, 8000)}\n\nUser Question: ${query}`,
      },
    ];

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages,
        temperature: 0.1,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Groq API error (QA):', resp.status, errText);
      return NextResponse.json(
        { error: `Groq API returned status ${resp.status}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    let reply = data.choices?.[0]?.message?.content?.trim() || '';

    if (
      reply &&
      reply !== 'No response is found from the document.' &&
      !reply.includes('[Source:') &&
      fileName
    ) {
      reply += `\n\n[Source: ${fileName}, Page: ${matchedPageNum}]`;
    }

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('API /api/groq error:', error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}