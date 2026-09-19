'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import { useRouter } from 'next/navigation';

import Sidebar from '@/components/Sidebar';

import {
  getMe,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  type Project,
  type Role,
  type MeResponse,
} from '@/lib/api';

export default function ProjectsPage() {
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [me, setMe] =
    useState<MeResponse | null>(null);

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [creating, setCreating] =
    useState(false);

  const [updating, setUpdating] =
    useState(false);

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState('');

  const [message, setMessage] =
    useState('');

  const [name, setName] =
    useState('');

  const [description, setDescription] =
    useState('');

  const [fileAttachment, setFileAttachment] =
    useState<{
      fileName: string;
      fileType: string;
      fileData: string;
    } | null>(null);

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      setFileAttachment(null);
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowed = ['jpg', 'jpeg', 'png', 'pdf', 'docx'];

    if (!ext || !allowed.includes(ext)) {
      setError(
        'Invalid file format. Accepted formats: JPG, PNG, PDF, DOCX.',
      );
      event.target.value = '';
      setFileAttachment(null);
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('File size must be under 2MB.');
      event.target.value = '';
      setFileAttachment(null);
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setFileAttachment({
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileData: dataUrl,
        });
      }
    };
    reader.readAsDataURL(file);
  }

  const [editingProject, setEditingProject] =
    useState<Project | null>(null);

  async function loadData() {
    try {
      setError('');

      const currentUser =
        await getMe();

      setMe(currentUser);

      const projectList =
        await getProjects();

      setProjects(projectList);
    } catch (err) {
      console.error(err);

      if (
        err instanceof Error &&
        (
          err.message.includes(
            'authenticated',
          ) ||
          err.message.includes(
            'Unauthorized',
          )
        )
      ) {
        router.push('/');
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load projects.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!name.trim()) {
      setError(
        'Project name is required.',
      );
      return;
    }

    setCreating(true);
    setError('');
    setMessage('');

    try {
      await createProject({
        name: name.trim(),
        description:
          description.trim(),
        status: 'PLANNING',
        ...(fileAttachment ? { attachment: fileAttachment } : {}),
      });

      setName('');
      setDescription('');
      setFileAttachment(null);

      setMessage(
        'Project created successfully.',
      );

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create project.',
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!editingProject) {
      return;
    }

    if (!editingProject.name.trim()) {
      setError(
        'Project name is required.',
      );
      return;
    }

    setUpdating(true);
    setError('');
    setMessage('');

    try {
      await updateProject(
        editingProject.id,
        {
          name:
            editingProject.name.trim(),

          description:
            (
              editingProject.description ??
              ''
            ).trim(),

          status:
            editingProject.status ??
            'PLANNING',
        },
      );

      setEditingProject(null);

      setMessage(
        'Project updated successfully.',
      );

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update project.',
      );
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete(
    projectId: string,
  ) {
    const confirmed =
      window.confirm(
        'Are you sure you want to delete this project?',
      );

    if (!confirmed) {
      return;
    }

    setDeletingId(projectId);
    setError('');
    setMessage('');

    try {
      await deleteProject(
        projectId,
      );

      setMessage(
        'Project deleted successfully.',
      );

      await loadData();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to delete project.',
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />

          <p className="text-sm text-slate-500">
            Loading projects...
          </p>
        </div>
      </main>
    );
  }

  if (!me) {
    return null;
  }

  const role: Role =
    me.workspace.role;

  const canCreate =
    role === 'ADMIN' ||
    role === 'MANAGER';

  const canEdit =
    role === 'ADMIN' ||
    role === 'MANAGER';

  const canDelete =
    role === 'ADMIN';

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        role={role}
        email={me.user.email}
        onToggle={(open) => setSidebarOpen(open)}
      />

      <main className={`min-h-screen transition-all duration-300 ${sidebarOpen ? 'lg:pl-[318px]' : 'pl-0'}`}>
        {/* ==========================================
            HEADER
        ========================================== */}

        <header className="border-b border-slate-200 bg-white">
          <div className="flex min-h-[101px] items-center justify-between px-10">
            <div>
              <p className="text-sm font-medium text-slate-400">
                Workspace
              </p>

              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                Projects
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Projects shared across your workspace.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
              <p className="text-xs text-slate-400">
                Your role
              </p>

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
          {/* ========================================
              MESSAGES
          ======================================== */}

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
              ADMIN CREATE PROJECT
          ======================================== */}

          {canCreate && (
            <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900">
                  Create a project
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Projects you create are automatically
                  visible to everyone in this workspace.
                </p>
              </div>

              <form
                onSubmit={handleCreate}
                className="space-y-5"
              >
                <div>
                  <label
                    htmlFor="project-name"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Project name
                  </label>

                  <input
                    id="project-name"
                    type="text"
                    value={name}
                    onChange={(event) =>
                      setName(
                        event.target.value,
                      )
                    }
                    placeholder="Enter project name"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="project-description"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Description
                  </label>

                  <textarea
                    id="project-description"
                    value={description}
                    onChange={(event) =>
                      setDescription(
                        event.target.value,
                      )
                    }
                    placeholder="Describe the project"
                    rows={4}
                    className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="project-file"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Attach file (Accepted: JPG, PNG, PDF, DOCX)
                  </label>

                  <input
                    id="project-file"
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.docx"
                    onChange={handleFileChange}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-800"
                  />

                  <p className="mt-1 text-xs text-slate-400">
                    Max file size: 2MB. Supported formats: .jpg, .jpeg, .png, .pdf, .docx
                  </p>

                  {fileAttachment && (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
                      <span className="truncate font-medium">
                        📎 {fileAttachment.fileName}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setFileAttachment(null)
                        }
                        className="font-semibold text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating
                    ? 'Creating...'
                    : 'Create project'}
                </button>
              </form>
            </section>
          )}

          {/* ========================================
              PROJECT LIST
          ======================================== */}

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-7 py-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  All projects
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {projects.length}{' '}
                  {projects.length === 1
                    ? 'project'
                    : 'projects'}{' '}
                  in this workspace
                </p>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="px-7 py-20 text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
                  ▤
                </div>

                <h3 className="text-lg font-semibold text-slate-900">
                  No projects yet
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  {canCreate
                    ? 'Create your first project above.'
                    : 'No projects have been created in this workspace yet.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {projects.map(
                  (project) => (
                    <article
                      key={project.id}
                      className="px-7 py-6 transition hover:bg-[var(--bg-input)]"
                    >
                      {editingProject?.id ===
                      project.id ? (
                        /* ==================================
                           EDIT FORM
                        ================================== */

                        <form
                          onSubmit={
                            handleUpdate
                          }
                          className="space-y-5"
                        >
                          <div>
                            <label
                              htmlFor={`edit-name-${project.id}`}
                              className="mb-2 block text-sm font-medium text-slate-700"
                            >
                              Project name
                            </label>

                            <input
                              id={`edit-name-${project.id}`}
                              type="text"
                              value={
                                editingProject.name
                              }
                              onChange={(
                                event,
                              ) =>
                                setEditingProject(
                                  {
                                    ...editingProject,
                                    name: event
                                      .target
                                      .value,
                                  },
                                )
                              }
                              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor={`edit-description-${project.id}`}
                              className="mb-2 block text-sm font-medium text-slate-700"
                            >
                              Description
                            </label>

                            <textarea
                              id={`edit-description-${project.id}`}
                              value={
                                editingProject.description ??
                                ''
                              }
                              onChange={(
                                event,
                              ) =>
                                setEditingProject(
                                  {
                                    ...editingProject,
                                    description:
                                      event
                                        .target
                                        .value,
                                  },
                                )
                              }
                              rows={4}
                              className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                            />
                          </div>

                          <div className="flex gap-3">
                            <button
                              type="submit"
                              disabled={
                                updating
                              }
                              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {updating
                                ? 'Saving...'
                                : 'Save changes'}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setEditingProject(
                                  null,
                                )
                              }
                              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        /* ==================================
                           PROJECT DISPLAY
                        ================================== */

                        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-lg font-semibold text-slate-900">
                                {project.name}
                              </h3>

                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                                  project.status ===
                                  'COMPLETED'
                                    ? 'border-green-200 bg-green-100 text-green-700'
                                    : project.status ===
                                        'ACTIVE'
                                      ? 'border-blue-200 bg-blue-100 text-blue-700'
                                      : project.status ===
                                          'ARCHIVED'
                                        ? 'border-slate-200 bg-slate-100 text-slate-700'
                                        : 'border-amber-200 bg-amber-100 text-amber-700'
                                }`}
                              >
                                {project.status ??
                                  'PLANNING'}
                              </span>
                            </div>

                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                              {project.description ||
                                'No description provided.'}
                            </p>

                            <div className="mt-4 flex flex-wrap gap-5 text-xs text-slate-400">
                              {project.createdAt && (
                                <span>
                                  Created{' '}
                                  {new Date(
                                    project.createdAt,
                                  ).toLocaleDateString()}
                                </span>
                              )}

                              {project.updatedAt && (
                                <span>
                                  Updated{' '}
                                  {new Date(
                                    project.updatedAt,
                                  ).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ==============================
                              ACTIONS
                          ============================== */}

                          {(canEdit ||
                            canDelete) && (
                            <div className="flex shrink-0 gap-3">
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingProject(
                                      {
                                        ...project,
                                        description:
                                          project.description ??
                                          '',
                                      },
                                    )
                                  }
                                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                                >
                                  Edit
                                </button>
                              )}

                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDelete(
                                      project.id,
                                    )
                                  }
                                  disabled={
                                    deletingId ===
                                    project.id
                                  }
                                  className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {deletingId ===
                                  project.id
                                    ? 'Deleting...'
                                    : 'Delete'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  ),
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}