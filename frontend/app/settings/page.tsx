'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { getMe, type MeResponse } from '@/lib/api';

export type ThemeOption = 'light' | 'dark' | 'theme-indigo' | 'theme-emerald' | 'theme-amber' | 'system';

export default function SettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [theme, setTheme] = useState<ThemeOption>('system');

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(console.error);

    const saved = localStorage.getItem('teamgate-theme') as ThemeOption | null;
    if (saved) {
      setTheme(saved);
      applyTheme(saved);
    }
  }, []);

  function applyTheme(value: ThemeOption) {
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-indigo', 'theme-emerald', 'theme-amber');

    if (value === 'dark') {
      root.classList.add('dark');
    } else if (value === 'theme-indigo') {
      root.classList.add('dark', 'theme-indigo');
    } else if (value === 'theme-emerald') {
      root.classList.add('dark', 'theme-emerald');
    } else if (value === 'theme-amber') {
      root.classList.add('dark', 'theme-amber');
    } else if (value === 'system') {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      }
    }
  }

  function changeTheme(value: ThemeOption) {
    setTheme(value);
    localStorage.setItem('teamgate-theme', value);
    applyTheme(value);
  }

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center font-medium text-slate-600">
        Loading settings...
      </div>
    );
  }

  const themeOptions: Array<{ id: ThemeOption; icon: string; title: string; desc: string }> = [
    { id: 'light', icon: '☀️', title: 'Light Mode', desc: 'Clean, high-contrast light workspace interface' },
    { id: 'dark', icon: '🌙', title: 'Dark Mode', desc: 'Sleek dark theme reducing eye strain in low light' },
    { id: 'theme-indigo', icon: '🔮', title: 'Cyber Indigo', desc: 'Modern deep purple & indigo neon aesthetic' },
    { id: 'theme-emerald', icon: '🌿', title: 'Tech Emerald', desc: 'Calming deep emerald green developer layout' },
    { id: 'theme-amber', icon: '🔥', title: 'Sunset Amber', desc: 'Warm amber & stone dark mode palette' },
    { id: 'system', icon: '💻', title: 'System Default', desc: 'Match your operating system color preferences' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 transition-colors">
      <Sidebar
        role={me.workspace.role}
        email={me.user.email}
        onToggle={(open) => setSidebarOpen(open)}
      />

      <main className={`flex-1 p-8 transition-all duration-300 ${sidebarOpen ? 'lg:pl-[318px]' : 'pl-0'}`}>
        <div className="mx-auto max-w-4xl space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="mt-1 text-sm text-gray-500">Manage your TeamGate workspace preferences and visual theme.</p>
          </div>

          <div className="space-y-6">
            {/* Account Info */}
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xs transition-colors">
              <h2 className="text-lg font-bold text-gray-900">Account</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Email Address</p>
                  <p className="mt-1 font-bold text-gray-900">{me.user.email}</p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Workspace Role</p>
                  <p className="mt-1 font-extrabold text-[var(--accent-color)]">{me.workspace.role}</p>
                </div>
              </div>
            </section>

            {/* Appearance & Themes */}
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xs transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Appearance & Themes</h2>
                  <p className="mt-1 text-sm text-gray-500">Choose a color theme to customize your workspace appearance.</p>
                </div>
                <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
                  {themeOptions.find((t) => t.id === theme)?.title || 'Selected'}
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => changeTheme(opt.id)}
                    className={`group relative flex flex-col justify-between rounded-2xl p-4 text-left transition-all ${
                      theme === opt.id
                        ? 'border-2 border-[var(--accent-color)] bg-[var(--bg-input)] shadow-md ring-2 ring-[var(--accent-color)]/20'
                        : 'border border-gray-200 bg-white hover:border-purple-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{opt.icon}</span>
                        {theme === opt.id && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-color)] text-[10px] text-white font-bold">
                            ✓
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 text-sm font-bold text-gray-900">{opt.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Workspace Info */}
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xs transition-colors">
              <h2 className="text-lg font-bold text-gray-900">Workspace Details</h2>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Workspace Identifier</p>
                <p className="mt-2 break-all rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-xs text-gray-700">
                  {me.workspace.workspaceId || me.workspace.id}
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}