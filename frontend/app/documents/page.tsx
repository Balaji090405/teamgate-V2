'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import Sidebar from '@/components/Sidebar';
import AISummarizerChat from '@/components/AISummarizerChat';

import {
  getMe,
  getProjects,
  updateProject,
  type Project,
  type Role,
  type MeResponse,
} from '@/lib/api';

interface ExtractedDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileData: string;
  projectId: string;
  projectName: string;
  projectStatus?: string;
  projectDescription?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function DocumentsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [previewingDoc, setPreviewingDoc] = useState<ExtractedDocument | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadData() {
    try {
      setError('');
      const currentUser = await getMe();
      setMe(currentUser);

      const projectList = await getProjects();
      setProjects(projectList);
    } catch (err) {
      console.error(err);
      if (
        err instanceof Error &&
        (err.message.includes('authenticated') || err.message.includes('Unauthorized'))
      ) {
        router.push('/');
        return;
      }
      setError(
        err instanceof Error ? err.message : 'Unable to load workspace documents.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function extractAllDocuments(projectList: Project[]): ExtractedDocument[] {
    const docs: ExtractedDocument[] = [];
    for (const project of projectList) {
      if (project.attachment && project.attachment.fileName) {
        docs.push({
          id: `att-${project.id}`,
          fileName: project.attachment.fileName,
          fileType: project.attachment.fileType || 'application/pdf',
          fileData: project.attachment.fileData || '',
          projectId: project.id,
          projectName: project.name,
          projectStatus: project.status,
          projectDescription: project.description,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        });
      }
      if (Array.isArray(project.documents)) {
        project.documents.forEach((d, idx) => {
          if (
            d.fileName &&
            (!project.attachment || d.fileName !== project.attachment.fileName)
          ) {
            docs.push({
              id: `doc-${project.id}-${idx}`,
              fileName: d.fileName,
              fileType: d.fileType || 'application/pdf',
              fileData: d.fileData || '',
              projectId: project.id,
              projectName: project.name,
              projectStatus: project.status,
              projectDescription: project.description,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            });
          }
        });
      }
    }
    return docs;
  }

  async function handleDeleteDocument(doc: ExtractedDocument) {
    const confirmed = window.confirm(
      `Are you sure you want to delete the document "${doc.fileName}"?`,
    );
    if (!confirmed) return;

    setDeletingId(doc.id);
    setError('');
    setMessage('');

    try {
      const parentProject = projects.find((p) => p.id === doc.projectId);
      if (parentProject) {
        await updateProject(doc.projectId, {
          name: parentProject.name,
          description: parentProject.description,
          status: parentProject.status,
          attachment: undefined,
        });
      }

      setMessage(`Document "${doc.fileName}" deleted successfully.`);
      await loadData();
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'Failed to delete document.',
      );
    } finally {
      setDeletingId(null);
    }
  }

  function handleOpenChat(_doc: ExtractedDocument) {
    const ragSection = document.getElementById('ai-rag-section');
    if (ragSection) {
      ragSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
          <p className="text-sm text-slate-500">Loading documents...</p>
        </div>
      </main>
    );
  }

  if (!me) {
    return null;
  }

  const role: Role = me.workspace.role;
  const canDelete = role === 'ADMIN';

  const documents = extractAllDocuments(projects);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        role={role}
        email={me.user.email}
        onToggle={(open) => setSidebarOpen(open)}
      />

      <main
        className={`min-h-screen transition-all duration-300 ${
          sidebarOpen ? 'lg:pl-[318px]' : 'pl-0'
        }`}
      >
        {/* ==========================================
            HEADER
        ========================================== */}
        <header className="border-b border-slate-200 bg-white">
          <div className="flex min-h-[101px] items-center justify-between px-10">
            <div>
              <p className="text-sm font-medium text-slate-400">Workspace</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                Documents
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                All documents in your workspace
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
              <p className="text-xs text-slate-400">Your role</p>
              <p className="mt-1 font-semibold text-slate-900">
                {role === 'ADMIN'
                  ? 'Admin'
                  : role === 'MANAGER'
                    ? 'Manager'
                    : 'Employee'}
              </p>
            </div>
          </div>
        </header>

        {/* ==========================================
            CONTENT
        ========================================== */}
        <div className="mx-auto max-w-[1400px] px-10 py-8">
          {message && (
            <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-medium text-green-700">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          {/* ========================================
              DOCUMENTS LIST SECTION
          ======================================== */}
          <section className="mb-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-7 py-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Workspace Documents
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {documents.length}{' '}
                  {documents.length === 1 ? 'document' : 'documents'} in this workspace
                </p>
              </div>
            </div>

            {documents.length === 0 ? (
              <div className="px-7 py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                  📄
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  No documents yet
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Attach files to projects when creating them on the Projects page.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {documents.map((doc) => {
                  const isPdf = doc.fileName.toLowerCase().endsWith('.pdf');
                  const isDocx = doc.fileName.toLowerCase().endsWith('.docx');
                  const icon = isPdf ? '📄' : isDocx ? '📝' : '🖼️';

                  return (
                    <article
                      key={doc.id}
                      className="px-7 py-6 transition hover:bg-slate-50/60"
                    >
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        {/* Left: Document & Parent Project Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{icon}</span>
                            <h3 className="text-lg font-semibold text-slate-900 break-all">
                              {doc.fileName}
                            </h3>
                          </div>

                          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <span className="font-semibold text-slate-700">
                                Project:{' '}
                              </span>
                              <span className="text-slate-900 font-medium">
                                {doc.projectName}
                              </span>
                            </div>

                            {doc.projectStatus && (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700">
                                  Status:{' '}
                                </span>
                                <span
                                  className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                                    doc.projectStatus === 'COMPLETED'
                                      ? 'border-green-200 bg-green-100 text-green-700'
                                      : doc.projectStatus === 'ACTIVE'
                                        ? 'border-blue-200 bg-blue-100 text-blue-700'
                                        : doc.projectStatus === 'ARCHIVED'
                                          ? 'border-slate-200 bg-slate-100 text-slate-700'
                                          : 'border-amber-200 bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {doc.projectStatus}
                                </span>
                              </div>
                            )}
                          </div>

                          {doc.projectDescription && (
                            <p className="mt-2.5 max-w-3xl text-sm leading-6 text-slate-500">
                              {doc.projectDescription}
                            </p>
                          )}

                          <div className="mt-4 flex flex-wrap gap-5 text-xs text-slate-400">
                            {doc.createdAt && (
                              <span>
                                Created{' '}
                                {new Date(doc.createdAt).toLocaleDateString()}
                              </span>
                            )}
                            {doc.updatedAt && (
                              <span>
                                Updated{' '}
                                {new Date(doc.updatedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: Actions (Open, Download, Chat, Delete) */}
                        <div className="flex shrink-0 flex-wrap items-center gap-3">
                          {doc.fileData && (
                            <button
                              type="button"
                              onClick={() => setPreviewingDoc(doc)}
                              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 shadow-2xs"
                            >
                              Open
                            </button>
                          )}

                          {doc.fileData && (
                            <a
                              href={doc.fileData}
                              download={doc.fileName}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 shadow-2xs"
                            >
                              <span>↓</span>
                              <span>Download</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenChat(doc)}
                            className="rounded-xl bg-purple-50 border border-purple-200 px-4 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-100 shadow-2xs"
                          >
                            💬 Chat
                          </button>

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(doc)}
                              disabled={deletingId === doc.id}
                              className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 shadow-2xs"
                            >
                              {deletingId === doc.id ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* ========================================
              AI SUMMARIZER & CHATBOT SECTION
          ======================================== */}
          <div id="ai-rag-section" className="scroll-mt-6">
            <AISummarizerChat projects={projects} role={role} />
          </div>
        </div>
      </main>

      {/* ==========================================
          DOCUMENT PREVIEW MODAL
      ========================================== */}
      {previewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">📄</span>
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {previewingDoc.fileName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Project: {previewingDoc.projectName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewingDoc(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto bg-slate-900 p-4 flex items-center justify-center min-h-[400px]">
              {previewingDoc.fileType.includes('pdf') ||
              previewingDoc.fileData.includes('application/pdf') ? (
                <iframe
                  src={previewingDoc.fileData}
                  title={previewingDoc.fileName}
                  className="h-[600px] w-full rounded-xl bg-white border-0"
                />
              ) : previewingDoc.fileType.startsWith('image/') ||
                previewingDoc.fileData.includes('data:image') ? (
                <img
                  src={previewingDoc.fileData}
                  alt={previewingDoc.fileName}
                  className="max-h-[600px] w-auto rounded-xl object-contain"
                />
              ) : (
                <div className="w-full h-[400px] overflow-y-auto rounded-xl bg-white p-6 text-xs text-slate-800 font-mono whitespace-pre-wrap">
                  <p className="font-bold text-slate-900 border-b pb-2 mb-3">
                    📄 {previewingDoc.fileName}
                  </p>
                  Preview not directly renderable as PDF/Image. Download to view.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
              <a
                href={previewingDoc.fileData}
                download={previewingDoc.fileName}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                <span>↓ Download file</span>
              </a>

              <button
                type="button"
                onClick={() => setPreviewingDoc(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
