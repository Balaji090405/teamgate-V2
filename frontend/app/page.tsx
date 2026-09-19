'use client';

import { FormEvent, useState } from 'react';
import type { CognitoUser } from 'amazon-cognito-identity-js';
import {
  completeNewPasswordChallenge,
  confirmForgotPassword,
  confirmSignUp,
  forgotPassword,
  login,
  resendConfirmationCode,
  signUp,
} from '@/lib/auth';

type AuthMode =
  | 'login'
  | 'signup'
  | 'confirm-signup'
  | 'forgot-password'
  | 'reset-password'
  | 'set-new-password';

function EyeIcon({ hidden }: { hidden: boolean }) {
  if (hidden) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
        className="h-5 w-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.98 8.223A10.477 10.477 0 001.5 12c1.563 4.145 5.5 7 10.5 7 1.69 0 3.282-.4 4.69-1.11M6.228 6.228A10.45 10.45 0 0112 5c5 0 8.937 2.855 10.5 7a10.51 10.51 0 01-4.047 5.15M6.228 6.228L3 3m3.228 3.228l12.544 12.544M9.88 9.88a3 3 0 104.24 4.24"
        />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      className="h-5 w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 5 12 5c4.64 0 8.577 2.51 9.964 6.678a1.012 1.012 0 010 .644C20.577 16.49 16.64 19 12 19c-4.64 0-8.577-2.51-9.964-6.678z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-11 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />

      <button
        type="button"
        onClick={() => setShowPassword((current) => !current)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        title={showPassword ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <EyeIcon hidden={!showPassword} />
      </button>
    </div>
  );
}

function PasswordRequirementItem({
  valid,
  label,
}: {
  valid: boolean;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-xs transition-colors ${
        valid ? 'font-medium text-teal-700' : 'text-slate-500'
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] transition-all ${
          valid
            ? 'border-teal-600 bg-teal-600 text-white'
            : 'border-slate-300 bg-white text-transparent'
        }`}
      >
        ✓
      </span>
      <span>{label}</span>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<AuthMode>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [confirmationCode, setConfirmationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challengeCognitoUser, setChallengeCognitoUser] = useState<CognitoUser | null>(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function clearMessages() {
    setMessage('');
    setError('');
  }

  function switchMode(newMode: AuthMode) {
    clearMessages();
    setMode(newMode);
    setPassword('');
    setConfirmPassword('');
    setNewPassword('');
    setConfirmationCode('');
    setChallengeCognitoUser(null);
  }

  /*
   * Password validation for Workspace Signup
   */
  const passwordRequirements = {
    minLength: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    match: password.length > 0 && confirmPassword.length > 0 && password === confirmPassword,
  };

  const isCognitoPasswordValid =
    password.length >= 8 &&
    passwordRequirements.uppercase &&
    passwordRequirements.lowercase &&
    passwordRequirements.number;

  /*
   * Handlers
   */
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const res = await login(email.trim(), password);
      if (res.type === 'NEW_PASSWORD_REQUIRED') {
        setChallengeCognitoUser(res.cognitoUser);
        setMode('set-new-password');
        setMessage('You must set a new permanent password to complete sign-in.');
        setNewPassword('');
        setConfirmPassword('');
        return;
      }
      window.location.href = '/dashboard';
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Login failed. Please check your email and password.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSetNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    if (!challengeCognitoUser) {
      setError('Session expired. Please sign in again.');
      setMode('login');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    const validNewPassword =
      /[A-Z]/.test(newPassword) &&
      /[a-z]/.test(newPassword) &&
      /[0-9]/.test(newPassword);

    if (!validNewPassword) {
      setError('New password must contain uppercase, lowercase, and a number.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await completeNewPasswordChallenge(challengeCognitoUser, newPassword);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not update password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    if (!isCognitoPasswordValid) {
      setError(
        'Password must be at least 8 characters and contain uppercase, lowercase, and a number.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await signUp(email.trim(), password);
      setMessage(
        'Account created successfully. A verification code has been sent to your email.'
      );
      setMode('confirm-signup');
      setConfirmationCode('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Signup failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      await confirmSignUp(email.trim(), confirmationCode.trim());
      setMessage('Email verified successfully. You can now sign in.');
      setMode('login');
      setConfirmationCode('');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Verification failed. Please check the code.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    clearMessages();
    setLoading(true);

    try {
      await resendConfirmationCode(email.trim());
      setMessage('A new verification code has been sent to your email.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not resend the verification code.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    if (!email.trim()) {
      setError('Please enter your work email address.');
      return;
    }

    setLoading(true);

    try {
      await forgotPassword(email.trim());
      setMessage('A password reset code has been sent to your email.');
      setMode('reset-password');
      setConfirmationCode('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start password reset.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    if (confirmationCode.trim().length === 0) {
      setError('Please enter the verification code.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    const validNewPassword =
      /[A-Z]/.test(newPassword) &&
      /[a-z]/.test(newPassword) &&
      /[0-9]/.test(newPassword);

    if (!validNewPassword) {
      setError('New password must contain uppercase, lowercase, and a number.');
      return;
    }

    setLoading(true);

    try {
      await confirmForgotPassword(
        email.trim(),
        confirmationCode.trim(),
        newPassword
      );
      setMessage('Password reset successfully. You can now sign in.');
      setMode('login');
      setConfirmationCode('');
      setNewPassword('');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not reset your password.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 transition-colors">
      <div className="grid min-h-screen lg:grid-cols-2">

        {/* =======================================================
            LEFT SIDE - BRANDING (KEPT UNCHANGED AS IN ORIGINAL)
        ======================================================= */}
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-900 to-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          {/* Background decoration */}
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl" />

          {/* Logo */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-xl font-bold text-blue-700 shadow-lg">
              T
            </div>
            <span className="text-2xl font-bold">TeamGate</span>
          </div>

          {/* Main content */}
          <div className="relative z-10 max-w-xl">
            <div className="mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm backdrop-blur">
              Secure team workspace
            </div>

            <h2 className="text-5xl font-bold leading-tight">
              Manage your team.
              <br />
              Manage your projects.
            </h2>

            <p className="mt-6 max-w-lg text-lg leading-8 text-blue-100">
              TeamGate is a role-based project management platform built with AWS services and secure authentication.
            </p>

            {/* Features */}
            <div className="mt-10 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  ✓
                </div>
                <div>
                  <p className="font-semibold">Role-based access</p>
                  <p className="text-sm text-blue-100">
                    Admin, Manager and Employee permissions
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  ✓
                </div>
                <div>
                  <p className="font-semibold">Secure authentication</p>
                  <p className="text-sm text-blue-100">
                    Powered by Amazon Cognito
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  ✓
                </div>
                <div>
                  <p className="font-semibold">Cloud based</p>
                  <p className="text-sm text-blue-100">
                    Built on AWS serverless architecture
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="relative z-10 text-sm text-blue-200">
            TeamGate © 2026
          </div>
        </section>

        {/* =======================================================
            RIGHT SIDE - AUTHENTICATION PANEL
        ======================================================= */}
        <section className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 sm:px-8">
          <div className={`w-full ${mode === 'signup' ? 'max-w-xl' : 'max-w-md'}`}>

            {/* Mobile logo */}
            <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-xl font-bold text-white shadow-md">
                T
              </div>
              <span className="text-2xl font-bold text-slate-900">
                TeamGate
              </span>
            </div>

            {/* Authentication Card */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/50">

              {/* Messages */}
              {message && (
                <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {message}
                </div>
              )}

              {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* =========================================================
                  SIGN IN SCREEN
              ========================================================= */}
              {mode === 'login' && (
                <>
                  <div className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                      Welcome back
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                      Sign in to pick up where your team left off.
                    </p>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-5">
                    {/* Work email */}
                    <div>
                      <label
                        htmlFor="login-email"
                        className="mb-2 block text-sm font-medium text-slate-700"
                      >
                        Work email
                      </label>
                      <input
                        id="login-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        autoComplete="email"
                        required
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                      />
                    </div>

                    {/* Password */}
                    <div>
                      <label
                        htmlFor="login-password"
                        className="mb-2 block text-sm font-medium text-slate-700"
                      >
                        Password
                      </label>
                      <PasswordInput
                        id="login-password"
                        value={password}
                        onChange={setPassword}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                      />
                    </div>

                    {/* Keep me signed in & Forgot password */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pt-1">
                      <div>
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={keepSignedIn}
                            onChange={(e) => setKeepSignedIn(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span>Keep me signed in on this device</span>
                        </label>
                        <p className="text-xs text-slate-400 mt-0.5 pl-6">
                          Don&apos;t use this on a shared or public computer.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => switchMode('forgot-password')}
                        className="text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline shrink-0"
                      >
                        Forgot password?
                      </button>
                    </div>

                    {/* Submit button */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-full bg-teal-600 py-3.5 px-6 font-semibold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 text-base"
                    >
                      {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                  </form>

                  <div className="mt-8 text-center text-sm text-slate-600">
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-semibold text-teal-600 hover:text-teal-700 hover:underline"
                    >
                      Create an account
                    </button>
                  </div>
                </>
              )}

              {/* =========================================================
                  SET NEW PASSWORD (FIRST LOGIN CHALLENGE)
              ========================================================= */}
              {mode === 'set-new-password' && (
                <>
                  <div className="mb-6">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                      Set your new password
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                      Please create a permanent password for your TeamGate account to complete sign-in.
                    </p>
                  </div>

                  <form onSubmit={handleSetNewPassword} className="space-y-5">
                    <div>
                      <label
                        htmlFor="challenge-new-password"
                        className="mb-2 block text-sm font-medium text-slate-700"
                      >
                        New password
                      </label>
                      <PasswordInput
                        id="challenge-new-password"
                        value={newPassword}
                        onChange={setNewPassword}
                        placeholder="Create a new password"
                        autoComplete="new-password"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="challenge-confirm-password"
                        className="mb-2 block text-sm font-medium text-slate-700"
                      >
                        Confirm new password
                      </label>
                      <PasswordInput
                        id="challenge-confirm-password"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-full bg-teal-600 py-3.5 px-6 font-semibold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 text-base"
                    >
                      {loading ? 'Updating password...' : 'Set password & Sign in'}
                    </button>
                  </form>
                </>
              )}

              {/* =========================================================
                  CREATE WORKSPACE SCREEN (SIGNUP)
              ========================================================= */}
              {mode === 'signup' && (
                <>
                  <div className="mb-6">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                      Create an account
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                      Sign up to get started and manage your team and projects.
                    </p>
                  </div>

                  <form onSubmit={handleSignUp} className="space-y-5">
                    {/* 2-Column Grid on Desktop */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Full Name */}
                      <div>
                        <label
                          htmlFor="signup-fullname"
                          className="mb-2 block text-sm font-medium text-slate-700"
                        >
                          Full name
                        </label>
                        <input
                          id="signup-fullname"
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Jane Doe"
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                        />
                      </div>

                      {/* Work Email */}
                      <div>
                        <label
                          htmlFor="signup-email"
                          className="mb-2 block text-sm font-medium text-slate-700"
                        >
                          Work email
                        </label>
                        <input
                          id="signup-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          autoComplete="email"
                          required
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                        />
                      </div>

                      {/* Password */}
                      <div>
                        <label
                          htmlFor="signup-password"
                          className="mb-2 block text-sm font-medium text-slate-700"
                        >
                          Password
                        </label>
                        <PasswordInput
                          id="signup-password"
                          value={password}
                          onChange={setPassword}
                          placeholder="Create a password"
                          autoComplete="new-password"
                        />
                      </div>

                      {/* Confirm Password */}
                      <div>
                        <label
                          htmlFor="signup-confirm-password"
                          className="mb-2 block text-sm font-medium text-slate-700"
                        >
                          Confirm password
                        </label>
                        <PasswordInput
                          id="signup-confirm-password"
                          value={confirmPassword}
                          onChange={setConfirmPassword}
                          placeholder="Confirm your password"
                          autoComplete="new-password"
                        />
                      </div>
                    </div>

                    {/* Password Requirements */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                        Password requirements
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <PasswordRequirementItem
                          valid={passwordRequirements.minLength}
                          label="At least 12 characters"
                        />
                        <PasswordRequirementItem
                          valid={passwordRequirements.uppercase}
                          label="One uppercase letter"
                        />
                        <PasswordRequirementItem
                          valid={passwordRequirements.lowercase}
                          label="One lowercase letter"
                        />
                        <PasswordRequirementItem
                          valid={passwordRequirements.number}
                          label="One number"
                        />
                        <PasswordRequirementItem
                          valid={passwordRequirements.match}
                          label="Passwords match"
                        />
                      </div>
                    </div>

                    {/* Terms of Service Checkbox */}
                    <div>
                      <label className="inline-flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={agreedToTerms}
                          onChange={(e) => setAgreedToTerms(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span>
                          I agree to the{' '}
                          <a href="#" onClick={(e) => e.preventDefault()} className="text-teal-600 hover:underline font-medium">
                            Terms of Service
                          </a>{' '}
                          and{' '}
                          <a href="#" onClick={(e) => e.preventDefault()} className="text-teal-600 hover:underline font-medium">
                            Privacy Policy
                          </a>
                          .
                        </span>
                      </label>
                    </div>

                    {/* Submit button */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-full bg-teal-600 py-3.5 px-6 font-semibold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 text-base"
                    >
                      {loading ? 'Creating account...' : 'Create account'}
                    </button>
                  </form>

                  <div className="mt-8 text-center text-sm text-slate-600">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="font-semibold text-teal-600 hover:text-teal-700 hover:underline"
                    >
                      Sign in
                    </button>
                  </div>
                </>
              )}

              {/* =========================================================
                  CONFIRM SIGNUP SCREEN
              ========================================================= */}
              {mode === 'confirm-signup' && (
                <>
                  <div className="mb-6 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-2xl font-bold">
                      ✉
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">
                      Verify your email
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      We sent a verification code to
                    </p>
                    <p className="mt-1 break-all font-semibold text-slate-800">
                      {email}
                    </p>
                  </div>

                  <form onSubmit={handleConfirmSignUp} className="space-y-5">
                    <div>
                      <label
                        htmlFor="confirmation-code"
                        className="mb-2 block text-sm font-medium text-slate-700"
                      >
                        Verification code
                      </label>
                      <input
                        id="confirmation-code"
                        type="text"
                        value={confirmationCode}
                        onChange={(e) => setConfirmationCode(e.target.value)}
                        placeholder="Enter code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-lg tracking-[0.35em] text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-full bg-teal-600 py-3.5 px-6 font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60 text-base"
                    >
                      {loading ? 'Verifying...' : 'Verify email'}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={loading}
                    className="mt-4 w-full rounded-full border border-slate-300 py-3 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Resend verification code
                  </button>

                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="mt-6 w-full text-center text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline"
                  >
                    Back to sign in
                  </button>
                </>
              )}

              {/* =========================================================
                  FORGOT PASSWORD SCREEN
              ========================================================= */}
              {mode === 'forgot-password' && (
                <>
                  <div className="mb-6 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-2xl">
                      🔑
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">
                      Forgot password?
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Enter your work email and we&apos;ll send you a password reset code.
                    </p>
                  </div>

                  <form onSubmit={handleForgotPassword} className="space-y-5">
                    <div>
                      <label
                        htmlFor="forgot-email"
                        className="mb-2 block text-sm font-medium text-slate-700"
                      >
                        Work email
                      </label>
                      <input
                        id="forgot-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        autoComplete="email"
                        required
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-full bg-teal-600 py-3.5 px-6 font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60 text-base"
                    >
                      {loading ? 'Sending code...' : 'Send reset code'}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="mt-6 w-full text-center text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline"
                  >
                    Back to sign in
                  </button>
                </>
              )}

              {/* =========================================================
                  RESET PASSWORD SCREEN
              ========================================================= */}
              {mode === 'reset-password' && (
                <>
                  <div className="mb-6 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-2xl">
                      🔐
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">
                      Reset password
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Enter the code sent to your email and create a new password.
                    </p>
                  </div>

                  <form onSubmit={handleResetPassword} className="space-y-5">
                    <div>
                      <label
                        htmlFor="reset-code"
                        className="mb-2 block text-sm font-medium text-slate-700"
                      >
                        Verification code
                      </label>
                      <input
                        id="reset-code"
                        type="text"
                        value={confirmationCode}
                        onChange={(e) => setConfirmationCode(e.target.value)}
                        placeholder="Enter code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-lg tracking-[0.3em] text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="reset-password"
                        className="mb-2 block text-sm font-medium text-slate-700"
                      >
                        New password
                      </label>
                      <PasswordInput
                        id="reset-password"
                        value={newPassword}
                        onChange={setNewPassword}
                        placeholder="Create a new password"
                        autoComplete="new-password"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-full bg-teal-600 py-3.5 px-6 font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60 text-base"
                    >
                      {loading ? 'Resetting password...' : 'Reset password'}
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="mt-6 w-full text-center text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline"
                  >
                    Back to sign in
                  </button>
                </>
              )}

            </div>

            {/* Security Footer */}
            <p className="mt-6 text-center text-xs text-slate-400">
              Secured with AWS Cognito authentication &bull; TeamGate &copy; 2026
            </p>

          </div>
        </section>

      </div>
    </main>
  );
}