'use client';

import { useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import ClientMenu from '@/components/ClientMenu';
import { ShieldIcon } from '@/components/icons';
import {
  getSessionSnapshot,
  subscribeSession,
  type SessionUser,
} from '@/lib/api';

// Top bar shown on every client page (wired in via app/dashboard/layout.tsx):
// the Tech Squad brand on the left and the client's menu on the right. The
// pages a client can reach live in that menu rather than as tabs here, since
// clients only ever see their own dashboard and settings.
export default function DashboardNav() {
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

        {/* Brand: logo badge plus company name. Goes to the proposal request
            form, so a signed-in client can start a new request from anywhere */}
        <Link href="/" className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-700 border-2 border-blue-900 flex items-center justify-center shrink-0">
            <ShieldIcon className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-black text-lg leading-tight">
            TECH<br />SQUAD
          </span>
        </Link>

        {/* Signed-in client's menu, or a sign-in link when there's no session */}
        {user ? (
          <ClientMenu />
        ) : (
          <Link href="/login" className="font-bold text-gray-800 hover:text-blue-600">
            Sign in
          </Link>
        )}

      </div>
    </nav>
  );
}
