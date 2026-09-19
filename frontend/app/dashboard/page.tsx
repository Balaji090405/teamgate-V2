'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import Sidebar from '@/components/Sidebar';
import {
getDashboard,
getMe,
getProjects,
type DashboardResponse,
type MeResponse,
type Project,
} from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAllProjects, setShowAllProjects] = useState(false);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setError('');

        const [meData, dashboardData, projectData] = await Promise.all([
          getMe(),
          getDashboard(),
          getProjects(),
        ]);

        setMe(meData);
        setDashboard(dashboardData);
        setProjects(projectData);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to load the dashboard.';

        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  function getProjectDocuments(project: Project): { fileName: string; fileType?: string }[] {
    const docs: { fileName: string; fileType?: string }[] = [];
    if (Array.isArray(project.documents)) {
      for (const d of project.documents) {
        if (d.fileName) docs.push({ fileName: d.fileName, fileType: d.fileType });
      }
    }
    if (project.attachment && project.attachment.fileName) {
      if (!docs.some((d) => d.fileName === project.attachment?.fileName)) {
        docs.push({
          fileName: project.attachment.fileName,
          fileType: project.attachment.fileType,
        });
      }
    }
    return docs;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <div className="hidden md:block">
          <Sidebar role="EMPLOYEE" email="" />
        </div>

        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
            <p className="mt-4 text-sm text-gray-500">Loading dashboard...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <div className="hidden md:block">
          <Sidebar role="EMPLOYEE" email="" />
        </div>

        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <span className="text-xl text-red-600">!</span>
            </div>

            <h1 className="mt-4 text-xl font-semibold text-gray-900">
              Unable to load dashboard
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              {error || 'Your account information could not be loaded.'}
            </p>

            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-6 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  const totalProjects =
    dashboard?.stats?.totalProjects ?? projects.length;

  const activeProjects =
    dashboard?.stats?.activeProjects ??
    projects.filter(
      (project) =>
        project.status?.toLowerCase() === 'active',
    ).length;

  const completedProjects =
    dashboard?.stats?.completedProjects ??
    projects.filter(
      (project) =>
        project.status?.toLowerCase() === 'completed',
    ).length;

  const roleLabel =
    me.workspace.role === 'ADMIN'
      ? 'Admin'
      : me.workspace.role === 'MANAGER'
        ? 'Manager'
        : 'Employee';

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        role={me.workspace.role}
        email={me.user.email}
        onToggle={(open) => setSidebarOpen(open)}
      />

      <main className={`min-w-0 flex-1 transition-all duration-300 ${sidebarOpen ? 'lg:pl-[318px]' : 'pl-0'}`}>
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Dashboard</p>

                <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                  Welcome back
                </h1>

                <p className="mt-1 text-sm text-gray-500">
                  Here&apos;s what&apos;s happening in your workspace.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2">
                  <p className="text-xs text-gray-500">Your role</p>

                  <p className="mt-0.5 text-sm font-semibold text-gray-900">
                    {roleLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Total projects</p>

              <p className="mt-2 text-3xl font-bold text-gray-900">{totalProjects}</p>

              <p className="mt-2 text-xs text-gray-500">Projects in your workspace</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Active projects</p>

              <p className="mt-2 text-3xl font-bold text-gray-900">{activeProjects}</p>

              <p className="mt-2 text-xs text-gray-500">Currently in progress</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Completed projects</p>

              <p className="mt-2 text-3xl font-bold text-gray-900">{completedProjects}</p>

              <p className="mt-2 text-xs text-gray-500">Successfully completed</p>
            </div>
          </section>

          <section className="mt-8">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Workspace</h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Your current workspace information.
                  </p>
                </div>

                <span className="inline-flex w-fit items-center rounded-full border border-purple-200 bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
                  {roleLabel}
                </span>
              </div>

              <div className="grid gap-6 p-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Workspace name
                  </p>

                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {me.workspace.name}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Workspace status
                  </p>

                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {me.workspace.isOwner ? 'Workspace owner' : 'Workspace member'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Workspace ID
                  </p>

                  <p className="mt-2 break-all text-xs text-gray-500">
                    {me.workspace.workspaceId ?? me.workspace.id}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Account email
                  </p>

                  <p className="mt-2 break-all text-sm text-gray-700">{me.user.email}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {showAllProjects ? 'All projects in this workspace' : 'Recent projects'}
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    {showAllProjects
                      ? 'Complete list of projects and their attached documents.'
                      : 'Projects available in your workspace.'}
                  </p>
                </div>

                {projects.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllProjects((prev) => !prev)}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    {showAllProjects ? 'Show less' : 'View all'}
                  </button>
                )}
              </div>

              {projects.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                    <span className="text-lg text-gray-400">+</span>
                  </div>

                  <h3 className="mt-4 text-sm font-semibold text-gray-900">No projects yet</h3>

                  <p className="mt-1 text-sm text-gray-500">
                    Create a project to get started.
                  </p>

                  {(me.workspace.role === 'ADMIN' ||
                  me.workspace.role === 'MANAGER') && (
                    <button
                      type="button"
                      onClick={() => router.push('/projects')}
                      className="mt-5 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
                    >
                      Create project
                    </button>
                  )}
                </div>
              ) : !showAllProjects ? (
                <div className="divide-y divide-gray-100">
                  {projects.slice(0, 5).map((project) => (
                    <div
                      key={project.id}
                      className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-gray-900">
                          {project.name}
                        </h3>

                        <p className="mt-1 truncate text-sm text-gray-500">
                          {project.description ?? 'No description'}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        {project.status && (
                          <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                            {project.status}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => router.push('/projects')}
                          className="text-sm font-medium text-gray-900 hover:underline"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-gray-200 p-6 space-y-6">
                  {projects.map((project) => {
                    const docs = getProjectDocuments(project);
                    return (
                      <div
                        key={project.id}
                        className="rounded-xl border border-gray-200 bg-gray-50/50 p-5 shadow-xs"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <h3 className="text-base font-semibold text-gray-900">
                                {project.name}
                              </h3>
                              {project.status && (
                                <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                                  {project.status}
                                </span>
                              )}
                            </div>

                            <p className="mt-1.5 text-sm text-gray-600">
                              {project.description ?? 'No description'}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => router.push('/projects')}
                            className="inline-flex items-center rounded-lg bg-white border border-gray-200 px-3.5 py-1.5 text-sm font-medium text-gray-900 shadow-xs hover:bg-gray-50 transition shrink-0"
                          >
                            Open
                          </button>
                        </div>

                        {/* Nested Documents Section */}
                        <div className="mt-4 pt-4 border-t border-gray-200/80">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                            Documents
                          </p>

                          {docs.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">
                              No documents uploaded
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {docs.map((doc, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 w-fit shadow-2xs"
                                >
                                  <span className="text-base">📄</span>
                                  <span className="font-medium text-gray-900">{doc.fileName}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}