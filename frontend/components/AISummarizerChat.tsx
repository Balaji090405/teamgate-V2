'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Project, Role } from '@/lib/api';

interface AISummarizerChatProps {
  projects: Project[];
  role: Role;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

interface ExtractedDocument {
  projectId: string;
  projectName: string;
  fileName: string;
  fileType: string;
  fileData: string;
  mimeType?: string;
}

export default function AISummarizerChat({ projects, role }: AISummarizerChatProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('first');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryOutput, setSummaryOutput] = useState<string | null>(null);
  const [isPreviewMinimized, setIsPreviewMinimized] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [pageIndex] = useState(1);

  // Extract uploaded documents across projects
  function extractDocuments(): ExtractedDocument[] {
    const docs: ExtractedDocument[] = [];

    for (const project of projects) {
      if (project.attachment && project.attachment.fileName) {
        const fn = project.attachment.fileName;
        const ft = project.attachment.fileType || 'application/pdf';
        const fd = project.attachment.fileData || '';

        docs.push({
          projectId: project.id,
          projectName: project.name,
          fileName: fn,
          fileType: ft,
          fileData: fd,
          mimeType: ft,
        });
      }
    }

    return docs;
  }

  const uploadedDocs = extractDocuments();

  // Active Selected Document
  const activeDoc =
    selectedProjectId === 'first' || !selectedProjectId
      ? uploadedDocs[0]
      : uploadedDocs.find((d) => d.projectId === selectedProjectId) || uploadedDocs[0];

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'ai',
      text: activeDoc
        ? `Document indexed: ${activeDoc.fileName}. Ask me any question based strictly on this document!`
        : 'No document uploaded yet. Attach a file (.pdf, .docx, .png, .jpg) to a project to ask grounded questions.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  // Generate Document RAG Summary
  async function handleSummarizeDocument() {
    if (!activeDoc) return;
    setIsSummarizing(true);
    let summary = '';

    try {
      const resp = await fetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'summary',
          fileName: activeDoc.fileName,
          fileType: activeDoc.fileType,
          fileData: activeDoc.fileData,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.reply) {
          summary = data.reply;
        } else if (data.error) {
          summary = `⚠️ ${data.error}`;
        }
      } else {
        const errData = await resp.json().catch(() => ({}));
        if (errData.error) {
          summary = `⚠️ ${errData.error}`;
        }
      }
    } catch (err) {
      console.error('Groq API route summary error:', err);
      summary = '⚠️ Network error communicating with server.';
    }

    if (!summary) {
      summary = 'Unable to generate summary for the document.';
    }

    setSummaryOutput(summary);
    setIsSummarizing(false);
  }

  // Clear / New Chat
  function handleClearChat() {
    setMessages([
      {
        id: Date.now().toString(),
        sender: 'ai',
        text: activeDoc
          ? `Chat cleared. Ask any question grounded in ${activeDoc.fileName}.`
          : 'Chat cleared.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }

  // RAG Chatbot Handler
  async function handleSendMessage(queryText?: string) {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isThinking) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInputQuery('');
    setIsThinking(true);

    if (!activeDoc && uploadedDocs.length === 0) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'ai',
            text: 'No response is found from the document.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        setIsThinking(false);
      }, 400);
      return;
    }

    let aiReply = '';

    if (activeDoc) {
      try {
        const resp = await fetch('/api/groq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'qa',
            userQuery: textToSend,
            fileName: activeDoc.fileName,
            fileType: activeDoc.fileType,
            fileData: activeDoc.fileData,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data.reply) {
            aiReply = data.reply;
          } else if (data.error) {
            aiReply = `⚠️ ${data.error}`;
          }
        } else {
          const errData = await resp.json().catch(() => ({}));
          if (errData.error) {
            aiReply = `⚠️ ${errData.error}`;
          }
        }
      } catch (err) {
        console.error('Groq API QA call error:', err);
      }
    }

    if (!aiReply) {
      aiReply = 'No response is found from the document.';
    }

    setMessages((prev) => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: aiReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setIsThinking(false);
  }

  // Render Markdown Response in Chat Bubble / Summary Drawer
  function renderAIResponse(text: string) {
    if (text === 'No response is found from the document.') {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs font-semibold text-amber-900 shadow-xs">
          ⚠️ No response is found from the document.
        </div>
      );
    }

    return (
      <div className="space-y-2 text-xs text-slate-800 leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="text-sm font-bold text-slate-900 mt-3 mb-1.5">{children}</h1>,
            h2: ({ children }) => <h2 className="text-xs font-bold text-slate-900 mt-2.5 mb-1.5">{children}</h2>,
            h3: ({ children }) => <h3 className="text-xs font-bold text-indigo-950 mt-2 mb-1">{children}</h3>,
            p: ({ children }) => <p className="mb-2 text-xs leading-relaxed text-slate-700">{children}</p>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 text-xs text-slate-700">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 text-xs text-slate-700">{children}</ol>,
            li: ({ children }) => <li className="text-xs text-slate-700">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
            em: ({ children }) => <em className="italic text-slate-800">{children}</em>,
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto rounded-xl border border-purple-200 bg-white shadow-xs">
                <table className="w-full border-collapse text-left text-xs">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-purple-100/70 text-indigo-950 font-bold border-b border-purple-200">{children}</thead>,
            tbody: ({ children }) => <tbody className="divide-y divide-purple-100 text-slate-700">{children}</tbody>,
            tr: ({ children }) => <tr className="hover:bg-purple-50/40">{children}</tr>,
            th: ({ children }) => <th className="border-b border-purple-200 px-3.5 py-2 font-semibold text-indigo-950">{children}</th>,
            td: ({ children }) => <td className="border-b border-purple-100 px-3.5 py-2">{children}</td>,
            code: ({ children }) => <code className="rounded bg-purple-100/80 px-1 py-0.5 font-mono text-[11px] text-purple-900">{children}</code>,
            pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-100">{children}</pre>,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-4">
      {/* Top Document Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-200/60 bg-white px-6 py-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="text-sm">📄</span>
          <div className="flex items-center gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-purple-400"
            >
              {uploadedDocs.length === 0 ? (
                <option value="none">No documents uploaded yet</option>
              ) : (
                uploadedDocs.map((doc) => (
                  <option key={doc.projectId} value={doc.projectId}>
                    {doc.fileName} ({doc.projectName})
                  </option>
                ))
              )}
            </select>

            {activeDoc && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                Ready
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1 rounded-full border border-purple-200">
            Role: {role}
          </span>
        </div>
      </div>

      {/* Main Dual Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ========================================================
            LEFT PANE: Document Preview & Summarizer Card
        ======================================================== */}
        <div className="rounded-3xl border border-purple-200/60 bg-white p-5 shadow-xs flex flex-col min-h-[620px]">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📄</span>
              <h3 className="text-sm font-semibold text-slate-800">Document Preview</h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPreviewMinimized((prev) => !prev)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                {isPreviewMinimized ? 'Expand Preview' : 'Minimize Preview'}
              </button>

              <button
                onClick={handleSummarizeDocument}
                disabled={isSummarizing || !activeDoc}
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:opacity-95 transition disabled:opacity-50"
              >
                {isSummarizing ? 'Summarizing...' : 'Summarize Document'}
              </button>
            </div>
          </div>

          {/* Document Viewer Container */}
          {!isPreviewMinimized && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 flex-1 flex flex-col">
              {/* PDF Toolbar */}
              <div className="flex items-center justify-between bg-[#23242e] px-4 py-2.5 text-xs text-slate-200 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <span className="cursor-pointer">☰</span>
                  <div className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[11px]">
                    <span>{pageIndex}</span>
                    <span className="text-slate-400">/ 5</span>
                  </div>
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                    className="hover:text-white"
                  >
                    −
                  </button>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
                    className="hover:text-white"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={handleSummarizeDocument}
                  className="flex items-center gap-1.5 rounded-lg bg-purple-600/40 px-3 py-1 text-[11px] font-semibold text-purple-200 border border-purple-500/40 hover:bg-purple-600/60"
                >
                  <span>✨</span>
                  <span>Summarize</span>
                </button>
              </div>

              {/* Viewer Body */}
              <div className="relative flex-1 bg-slate-800 flex items-center justify-center p-2 min-h-[420px]">
                {activeDoc && activeDoc.fileData ? (
                  activeDoc.fileType.includes('pdf') || activeDoc.fileData.includes('application/pdf') ? (
                    <iframe
                      src={activeDoc.fileData}
                      title={activeDoc.fileName}
                      className="w-full h-[450px] rounded-lg bg-white border-0"
                      style={{ zoom: `${zoomLevel}%` }}
                    />
                  ) : activeDoc.fileType.startsWith('image/') || activeDoc.fileData.includes('data:image') ? (
                    <img
                      src={activeDoc.fileData}
                      alt={activeDoc.fileName}
                      className="max-h-[450px] w-auto rounded-lg object-contain"
                    />
                  ) : (
                    <div className="w-full h-[450px] overflow-y-auto rounded-lg bg-white p-6 text-xs text-slate-800 font-mono whitespace-pre-wrap">
                      <p className="font-bold text-slate-900 border-b pb-2 mb-3">📄 {activeDoc.fileName}</p>
                      Document preview ready
                    </div>
                  )
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    <p className="text-2xl mb-2">📁</p>
                    <p className="text-xs font-semibold text-slate-300">No document preview available</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Upload a file (.pdf, .docx, .png, .jpg) when creating a project above.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RAG Summary Output Drawer */}
          {summaryOutput && (
            <div className="mt-4 rounded-2xl border border-purple-200 bg-purple-50/60 p-4 text-xs text-slate-800">
              <div className="flex items-center justify-between mb-3 border-b border-purple-200/60 pb-2">
                <span className="font-bold text-indigo-900 flex items-center gap-1.5 text-xs">
                  <span>✨</span>
                  <span>AI RAG Summary</span>
                </span>
                <button
                  onClick={() => setSummaryOutput(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs px-1.5 py-0.5 rounded hover:bg-purple-100 transition"
                >
                  ✕
                </button>
              </div>
              {renderAIResponse(summaryOutput)}
            </div>
          )}
        </div>

        {/* ========================================================
            RIGHT PANE: Ask Grounded Questions (RAG Chatbot Card)
        ======================================================== */}
        <div className="rounded-3xl border border-purple-200/60 bg-white p-5 shadow-xs flex flex-col min-h-[620px]">
          {/* Header */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">💬</span>
              <h3 className="text-sm font-semibold text-slate-800">Ask Grounded Questions</h3>
              <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200">
                RAG Active
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleClearChat}
                className="rounded-xl border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 transition"
              >
                + New Chat
              </button>

              <button
                onClick={handleClearChat}
                className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition"
              >
                Clear Chat
              </button>
            </div>
          </div>

          {/* Chat Messages List */}
          <div className="flex-1 h-[450px] overflow-y-auto rounded-2xl border border-purple-100 bg-slate-50/50 p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-xs font-bold text-white shadow-xs">
                    ✨
                  </div>
                )}

                <div
                  className={`max-w-[85%] text-xs ${
                    msg.sender === 'user'
                      ? 'bg-slate-100 text-slate-900 rounded-2xl rounded-br-none px-4 py-2.5 font-medium shadow-2xs'
                      : 'bg-white border border-purple-200/80 rounded-2xl rounded-bl-none p-4 shadow-2xs'
                  }`}
                >
                  {msg.sender === 'ai' ? (
                    <div>
                      <div className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                        <span>✨</span>
                        <span>ANSWER</span>
                      </div>
                      {renderAIResponse(msg.text)}
                    </div>
                  ) : (
                    <p>{msg.text}</p>
                  )}

                  <span
                    className={`mt-1.5 block text-[10px] ${
                      msg.sender === 'user' ? 'text-slate-400 text-right' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>

                {msg.sender === 'user' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                    A
                  </div>
                )}
              </div>
            ))}

            {isThinking && (
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  ✨
                </div>
                <div className="rounded-2xl rounded-bl-none bg-white px-4 py-3 text-xs border border-purple-200 text-slate-500 flex items-center gap-2">
                  <span className="h-2 w-2 animate-ping rounded-full bg-purple-500" />
                  Retrieving grounded answer from document...
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="mt-4 flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask any question grounded in the document..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              className="flex-1 rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-xs text-slate-900 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />

            <button
              type="submit"
              disabled={isThinking || !inputQuery.trim()}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:opacity-95 disabled:opacity-50 shadow-xs"
            >
              Ask Document
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
