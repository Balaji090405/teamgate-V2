'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { acceptInvitation, getInvitation, type InvitationDetails } from '@/lib/api';
import { getCurrentUser, logout } from '@/lib/auth';

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!token) {
        setError('No invitation token provided.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        // 1. Fetch invitation details
        const details = await getInvitation(token);
        setInvitation(details);

        // 2. Check current auth state
        try {
          const user = await getCurrentUser();
          if (user && user.email) {
            setUserEmail(user.email);
            setIsAuthenticated(true);
          }
        } catch {
          setIsAuthenticated(false);
          setUserEmail(null);
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load invitation details.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [token]);

  async function handleAccept() {
    if (!token) return;

    try {
      setAccepting(true);
      setError('');
      setSuccess('');

      await acceptInvitation(token);
      setSuccess('Invitation accepted successfully! Redirecting to dashboard...');
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to accept invitation.');
    } finally {
      setAccepting(false);
    }
  }

  function handleSwitchAccount() {
    logout();
    window.location.href = `/?returnTo=${encodeURIComponent(`/accept-invite?token=${token}`)}`;
  }

  function handleLoginRedirect() {
    window.location.href = `/?returnTo=${encodeURIComponent(`/accept-invite?token=${token}`)}`;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-500">Loading invitation...</p>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 font-bold text-red-600">
            !
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Invalid Invitation</h2>
          <p className="text-sm text-slate-600 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <img
            src="/logo.png"
            alt="TeamGate Logo"
            className="mx-auto mb-3 h-12 w-12 rounded-xl bg-white p-1 object-contain shadow-md"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Workspace Invitation
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            You have been invited to join an organization on TeamGate.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {invitation && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Organization:</span>
                <span className="font-semibold text-slate-900">{invitation.workspaceName || invitation.workspaceId}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Role:</span>
                <span className="inline-flex rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold text-blue-700">
                  {invitation.role}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Invited Email:</span>
                <span className="font-mono text-slate-800 text-xs">{invitation.invitedEmail}</span>
              </div>
            </div>

            {!isAuthenticated ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-slate-600">
                  Please sign in with <strong>{invitation.invitedEmail}</strong> to accept this invitation.
                </p>
                <button
                  onClick={handleLoginRedirect}
                  className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Sign In
                </button>
              </div>
            ) : userEmail?.toLowerCase() === invitation.invitedEmail.toLowerCase() ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 text-center">
                  Logged in as <strong className="text-slate-700">{userEmail}</strong>
                </p>
                <button
                  onClick={handleAccept}
                  disabled={accepting || !!success}
                  className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {accepting ? 'Accepting Invitation...' : 'Accept Invitation'}
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                  Logged in as <strong>{userEmail}</strong>, but this invitation is for <strong>{invitation.invitedEmail}</strong>.
                </div>
                <button
                  onClick={handleSwitchAccount}
                  className="w-full rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Switch Account
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-500">Loading...</p>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}
