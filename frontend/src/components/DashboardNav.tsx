'use client';

import { useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ProfileMenu from '@/components/ProfileMenu';
import { ShieldIcon } from '@/components/icons';
import {
  getSessionSnapshot,
  subscribeSession,
  type SessionUser,
} from '@/lib/api';

// Top navigation bar shown on every dashboard page (wired in via
// app/dashboard/layout.tsx). Each tab maps to a route under /dashboard.
const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Proposal', href: '/dashboard/proposals' },
  { label: 'Clients', href: '/dashboard/clients' },
  { label: 'Templates', href: '/dashboard/templates' },
  { label: 'Reports', href: '/dashboard/reports' },
  { label: 'Settings', href: '/dashboard/settings' },
];

export default function DashboardNav() {
  // Current URL path, used to highlight the active tab
  const pathname = usePathname();

  // Signed-in client, read from the session store. Server-renders as null
  // (no localStorage) and updates on sign-in/out via the store subscription.
  const raw = useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
  const user = useMemo<SessionUser | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionUser;
    } catch {
      return null;
    }
  }, [raw]);

  return (
    <nav className="bg-gray-200 border-b border-gray-300">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

        {/* Brand: logo badge plus company name. Goes to the home page, or
            refreshes when already on the dashboard */}
        <Link
          href="/"
          onClick={(e) => {
            if (pathname === '/dashboard') {
              e.preventDefault();
              window.location.reload();
            }
          }}
          className="flex items-center gap-3"
        >
          <div className="w-12 h-12 rounded-full bg-blue-700 border-2 border-blue-900 flex items-center justify-center shrink-0">
            <ShieldIcon className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-black text-lg leading-tight">
            TECH<br />SQUAD
          </span>
        </Link>

        {/* Nav tabs: the tab matching the current path is highlighted blue */}
        <div className="flex items-center gap-8">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={
                pathname === item.href
                  ? 'font-bold text-blue-600'
                  : 'font-bold text-gray-800 hover:text-blue-600'
              }
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Signed-in client's avatar with the Settings/Logout menu, or a
            sign-in link when there's no session */}
        {user ? (
          <ProfileMenu settingsHref="/dashboard/settings" />
        ) : (
          <Link href="/login" className="font-bold text-gray-800 hover:text-blue-600">
            Sign in
          </Link>
        )}

      </div>
    </nav>
  );
}
