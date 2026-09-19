'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import {
  changeRole,
  deleteUser,
  getMe,
  getTeam,
  inviteUser,
  type Role,
  type TeamMember,
} from '@/lib/api';

export default function TeamPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [currentRole, setCurrentRole] = useState<Role>('EMPLOYEE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Invite modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('EMPLOYEE');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [createdInviteUrl, setCreatedInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadTeam();
  }, []);

  async function loadTeam() {
    try {
      setLoading(true);
      setError('');

      const me = await getMe();
      const role = me.user.role ?? me.workspace.role;

      setCurrentUserId(me.user.id);
      setCurrentEmail(me.user.email);
      setCurrentRole(role);

      if (role !== 'ADMIN' && role !== 'MANAGER') {
        setError('Only ADMIN and MANAGER users can access Team.');
        return;
      }

      const team = await getTeam();
      setMembers(team);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'Failed to load team.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(member: TeamMember, newRole: Role) {
    if (member.id === currentUserId) {
      return;
    }

    try {
      setSavingId(member.id);
      setError('');
      setSuccess('');

      await changeRole(member.id, newRole);

      setMembers((current) =>
        current.map((item) =>
          item.id === member.id ? { ...item, role: newRole } : item,
        ),
      );
      setSuccess(`Role updated for ${member.email}`);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'Failed to change role.',
      );
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteUser(member: TeamMember) {
    if (member.id === currentUserId || member.isOwner) {
      return;
    }

    if (!confirm(`Are you sure you want to delete ${member.email}?`)) {
      return;
    }

    try {
      setDeletingId(member.id);
      setError('');
      setSuccess('');

      await deleteUser(member.id);

      setMembers((current) =>
        current.filter((item) => item.id !== member.id),
      );
      setSuccess(`User ${member.email} deleted successfully.`);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'Failed to delete user.',
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!inviteEmail.trim()) {
      setInviteError('Email is required.');
      return;
    }

    try {
      setInviting(true);
      setInviteError('');
      setError('');
      setSuccess('');

      const res = await inviteUser({
        email: inviteEmail.trim(),
        name: inviteName.trim() || undefined,
        role: inviteRole,
      });

      if (res.invitation?.invitationUrl) {
        setCreatedInviteUrl(res.invitation.invitationUrl);
      }
      setSuccess(`Invitation link generated for ${inviteEmail}.`);

      // Refresh list
      const team = await getTeam();
      setMembers(team);
    } catch (err) {
      console.error(err);
      setInviteError(
        err instanceof Error ? err.message : 'Failed to invite user.',
      );
    } finally {
      setInviting(false);
    }
  }

  function closeInviteModal() {
    setIsInviteOpen(false);
    setCreatedInviteUrl('');
    setInviteEmail('');
    setInviteName('');
    setInviteRole('EMPLOYEE');
    setInviteError('');
    setCopied(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Sidebar
          role={currentRole}
          email={currentEmail}
          onToggle={(open) => setSidebarOpen(open)}
        />
        <main className={`min-h-screen px-8 py-10 transition-all duration-300 ${sidebarOpen ? 'lg:pl-[318px]' : 'pl-0'}`}>
          <p className="text-slate-500">Loading team...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        role={currentRole}
        email={currentEmail}
        onToggle={(open) => setSidebarOpen(open)}
      />

      <main className={`min-h-screen px-8 py-10 transition-all duration-300 ${sidebarOpen ? 'lg:pl-[318px]' : 'pl-0'}`}>
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="mb-2 text-sm font-medium uppercase tracking-wider text-slate-400">
                Administration
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
                Team
              </h1>
              <p className="mt-2 text-slate-500">
                Manage registered users, assign roles, or invite team members.
              </p>
            </div>

            {currentRole === 'ADMIN' && (
              <button
                onClick={() => setIsInviteOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Invite User
              </button>
            )}
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Workspace members
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Users who belong to this workspace.
                </p>
              </div>

              <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                {members.length} users
              </div>
            </div>

            {members.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-500">
                No users found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        User
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Role
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Status
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {members.map((member) => {
                      const isSelf = member.id === currentUserId;
                      const managerProtected =
                        currentRole === 'MANAGER' && member.role === 'ADMIN';

                      return (
                        <tr
                          key={member.id}
                          className="border-b border-slate-100 last:border-b-0"
                        >
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-4">
                              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                                {member.email.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-slate-900">
                                  {member.name ?? member.email.split('@')[0]}
                                </p>
                                <p className="text-sm text-slate-500">
                                  {member.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-5">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                member.role === 'ADMIN'
                                  ? 'bg-purple-100 text-purple-700'
                                  : member.role === 'MANAGER'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {member.role}
                            </span>
                          </td>

                          <td className="px-6 py-5">
                            <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                              <span className="h-2 w-2 rounded-full bg-green-500" />
                              {member.status ?? 'Active'}
                            </span>
                          </td>

                          <td className="px-6 py-5 text-right">
                            {currentRole !== 'ADMIN' ||
                            isSelf ||
                            member.isOwner ||
                            managerProtected ? (
                              <span className="text-sm font-medium text-slate-400">
                                Protected
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-3">
                                <select
                                  value={member.role}
                                  disabled={
                                    savingId === member.id ||
                                    deletingId === member.id
                                  }
                                  onChange={(e) =>
                                    handleRoleChange(
                                      member,
                                      e.target.value as Role,
                                    )
                                  }
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-slate-400"
                                >
                                  <option value="ADMIN">ADMIN</option>
                                  <option value="MANAGER">MANAGER</option>
                                  <option value="EMPLOYEE">EMPLOYEE</option>
                                </select>

                                <button
                                  onClick={() => handleDeleteUser(member)}
                                  disabled={
                                    savingId === member.id ||
                                    deletingId === member.id
                                  }
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                                >
                                  {deletingId === member.id ? 'Deleting...' : 'Delete'}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Invite User Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Invite Team Member
              </h3>
              <button
                onClick={closeInviteModal}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {inviteError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {inviteError}
              </div>
            )}

            {createdInviteUrl ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Invitation Link Generated
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    Share this invitation link with <strong>{inviteEmail}</strong> to grant access:
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdInviteUrl}
                      className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-mono text-slate-800 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdInviteUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      {copied ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={closeInviteModal}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Full Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="EMPLOYEE">EMPLOYEE</option>
                  </select>
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeInviteModal}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {inviting ? 'Generating Link...' : 'Generate Invite Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}