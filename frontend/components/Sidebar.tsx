'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { logout } from '@/lib/auth';
import type { Role } from '@/lib/api';

interface SidebarProps {
  role: Role;
  email: string;
  onToggle?: (isOpen: boolean) => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

export default function Sidebar({
  role,
  email,
  onToggle,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(true);

  function handleToggle() {
    const next = !isOpen;
    setIsOpen(next);
    onToggle?.(next);
  }

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: '▦',
    },
    {
      label: 'Projects',
      href: '/projects',
      icon: '▤',
    },
    {
      label: 'Documents',
      href: '/documents',
      icon: '📄',
    },
  ];

  if (role === 'ADMIN' || role === 'MANAGER') {
    navItems.push({
      label: 'Team',
      href: '/team',
      icon: '♙',
    });
  }

  async function handleLogout() {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      router.push('/');
      router.refresh();
    }
  }

  const initial =
    email.trim().charAt(0).toUpperCase() || 'U';

  return (
    <>
      {/* Toggle button - always visible */}
      <button
        type="button"
        onClick={handleToggle}
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
        className={`fixed left-5 top-6 z-50 flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-black text-xl font-semibold text-white shadow-md transition-all duration-300 ${
          isOpen
            ? 'left-[31px]'
            : 'left-5'
        }`}
      >
        T
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-300 ${
          isOpen
            ? 'w-[318px] translate-x-0'
            : 'w-0 -translate-x-full overflow-hidden'
        }`}
      >
        {/* Header */}
        <div className="flex h-[101px] min-w-[318px] items-center border-b border-gray-200 px-7">
          <div className="flex items-center gap-4">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-black text-xl font-semibold text-white opacity-0">
              T
            </div>

            <div>
              <h1 className="text-[23px] font-semibold tracking-tight text-slate-900">
                TeamGate
              </h1>

              <p className="text-sm text-slate-400">
                Project workspace
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="min-w-[318px] flex-1 px-5 pt-8">
          <p className="mb-4 px-3 text-sm font-medium uppercase tracking-[0.08em] text-slate-400">
            Workspace
          </p>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-[60px] items-center gap-5 rounded-xl px-5 text-[17px] transition ${
                    active
                      ? 'bg-[var(--bg-active)] font-bold text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="w-5 text-center text-base">
                    {item.icon}
                  </span>

                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom section */}
        <div className="min-w-[318px] border-t border-gray-200 px-5 pb-5 pt-6">
          <Link
            href="/settings"
            className={`mb-4 flex h-[60px] items-center gap-5 rounded-xl px-5 text-[17px] transition ${
              pathname === '/settings'
                ? 'bg-[var(--bg-active)] font-bold text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span className="w-5 text-center">
              ⚙
            </span>

            <span>Settings</span>
          </Link>

          <div className="mb-4 flex min-h-[54px] items-center rounded-xl bg-slate-50 border border-gray-200 px-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-purple-600">
                {role}
              </p>

              <p className="mt-1 max-w-[240px] truncate text-xs text-slate-600">
                {email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition hover:bg-red-500/10"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-lg font-medium text-white">
              {initial}
            </div>

            <span className="text-[16px] font-semibold text-red-500">
              Logout
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}