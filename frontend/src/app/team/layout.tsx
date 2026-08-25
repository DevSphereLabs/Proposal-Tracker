'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import TeamSidebar from '@/components/TeamSidebar';
import {
  getSessionSnapshot,
  getSessionUser,
  subscribeSession,
  type SessionUser,
} from '@/lib/api';

// Layout for the internal (team-only) pages: sidebar on the left, page
// content on the right. Visitors without a team session are bounced before
// anything renders — clients back to their portal, everyone else to sign-in.
// The backend enforces this too: /api/team/* rejects non-team tokens.
export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Signed-in user from the session store. Server-renders as null (no
  // localStorage) and updates on sign-in/out via the store subscription.
  const raw = useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
  const user = useMemo<SessionUser | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionUser;
    } catch {
      return null;
    }
  }, [raw]);

  const authorized = user !== null && user.role !== 'CLIENT';

  useEffect(() => {
    // Re-read the session here rather than using `user`: on a full page
    // load the store's hydration pass briefly reports null before the real
    // snapshot lands, and redirecting on that would bounce a signed-in
    // member to the login page on every reload
    const current = getSessionUser();
    if (!current) {
      router.replace('/login');
    } else if (current.role === 'CLIENT') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-gray-300 p-6">
      <div className="max-w-7xl mx-auto flex gap-6 items-stretch">
        <TeamSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
