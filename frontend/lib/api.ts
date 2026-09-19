import { getIdToken } from '@/lib/auth';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL!;

export type Role =
  | 'ADMIN'
  | 'MANAGER'
  | 'EMPLOYEE';

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: Role;
}

export interface Workspace {
  id: string;
  workspaceId?: string;
  name: string;
  role: Role;
  ownerId?: string;
  isOwner: boolean;
}

export interface MeResponse {
  user: User;
  workspace: Workspace;
}

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  members?: number;
}

export interface ProjectAttachment {
  fileName: string;
  fileType: string;
  fileData: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  ownerId?: string;
  workspaceId?: string;
  attachment?: ProjectAttachment;
  documents?: { fileName: string; fileType?: string; fileData?: string }[];
}

export interface DashboardResponse {
  user?: User;
  workspace: Workspace;
  projects: Project[];
  recentProjects?: Project[];
  stats?: DashboardStats;
}

export interface TeamMember {
  id: string;
  userId?: string;
  email: string;
  name?: string;
  role: Role;
  isOwner?: boolean;
  status?: string;
}

export type Member = TeamMember;

export interface TeamResponse {
  members: TeamMember[];
}

/* =========================================================
   GENERIC API REQUEST
   ========================================================= */

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    await getIdToken();

  if (!token) {
    throw new Error(
      'You are not authenticated.',
    );
  }

  const response =
    await fetch(
      `${API_URL}${path}`,
      {
        ...options,

        headers: {
          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${token}`,

          ...(options.headers ?? {}),
        },
      },
    );

  const text =
    await response.text();

  let data: unknown = null;

  if (text) {
    try {
      data =
        JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return data as T;
}

/* =========================================================
   ME
   ========================================================= */

export async function getMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>(
    '/me',
  );
}

/* =========================================================
   DASHBOARD
   ========================================================= */

export async function getDashboard(): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>(
    '/dashboard',
  );
}

/* =========================================================
   PROJECTS
   ========================================================= */

export async function getProjects(): Promise<Project[]> {
  const response =
    await apiRequest<
      Project[] | {
        projects?: Project[];
      }
    >('/projects');

  if (
    Array.isArray(response)
  ) {
    return response;
  }

  return response.projects ?? [];
}

export async function createProject(
  project: {
    name: string;
    description?: string;
    status?: string;
    attachment?: ProjectAttachment;
  },
): Promise<Project> {
  return apiRequest<Project>(
    '/projects',
    {
      method: 'POST',

      body:
        JSON.stringify(project),
    },
  );
}

export async function updateProject(
  id: string,
  project: {
    name?: string;
    description?: string;
    status?: string;
    attachment?: ProjectAttachment;
  },
): Promise<Project> {
  return apiRequest<Project>(
    `/projects/${id}`,
    {
      method: 'PUT',

      body:
        JSON.stringify(project),
    },
  );
}

export async function deleteProject(
  id: string,
): Promise<{
  message: string;
}> {
  return apiRequest<{
    message: string;
  }>(
    `/projects/${id}`,
    {
      method: 'DELETE',
    },
  );
}

/* =========================================================
   TEAM
   ========================================================= */

export async function getTeam(): Promise<TeamMember[]> {
  const response =
    await apiRequest<
      TeamMember[] | TeamResponse
    >('/team');

  if (
    Array.isArray(response)
  ) {
    return response;
  }

  return response.members ?? [];
}

export async function changeRole(
  userId: string,
  role: Role,
): Promise<{
  message: string;
  userId: string;
  role: Role;
}> {
  return apiRequest<{
    message: string;
    userId: string;
    role: Role;
  }>(
    `/team/${userId}/role`,
    {
      method: 'PUT',

      body:
        JSON.stringify({
          role,
        }),
    },
  );
}

export async function updateUserRole(
  userId: string,
  role: Role,
) {
  return changeRole(
    userId,
    role,
  );
}

export interface InviteResponse {
  message: string;
  invitation: {
    rawToken: string;
    invitationUrl: string;
    invitedEmail: string;
    role: Role;
    expiresAt: string;
  };
}

export interface InvitationDetails {
  valid: boolean;
  invitedEmail: string;
  role: Role;
  workspaceId: string;
  workspaceName: string;
  expiresAt: string;
}

export async function inviteUser(data: {
  email: string;
  name?: string;
  role: Role;
}): Promise<InviteResponse> {
  return apiRequest('/team', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getInvitation(token: string): Promise<InvitationDetails> {
  const response = await fetch(`${API_URL}/invitations/${token}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const msg = typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
      ? data.message : 'Invalid or expired invitation.';
    throw new Error(msg);
  }
  return data as InvitationDetails;
}

export async function acceptInvitation(token: string): Promise<{ message: string; workspaceId: string; role: Role }> {
  return apiRequest('/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}



export async function deleteUser(
  userId: string,
): Promise<{
  message: string;
  userId: string;
}> {
  return apiRequest(`/team/${userId}`, {
    method: 'DELETE',
  });
}

/* =========================================================
   ACTIVITY
   ========================================================= */

export async function getActivity(): Promise<
  Record<string, unknown>[]
> {
  return apiRequest<
    Record<string, unknown>[]
  >('/activity');
}

/* =========================================================
   GENERIC HELPERS
   ========================================================= */

export async function apiGet<T>(
  path: string,
): Promise<T> {
  return apiRequest<T>(path);
}

export async function apiPost<T>(
  path: string,
  body: unknown,
): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: 'POST',

      body:
        JSON.stringify(body),
    },
  );
}

export async function apiPut<T>(
  path: string,
  body: unknown,
): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: 'PUT',

      body:
        JSON.stringify(body),
    },
  );
}

export async function apiDelete<T>(
  path: string,
): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: 'DELETE',
    },
  );
}