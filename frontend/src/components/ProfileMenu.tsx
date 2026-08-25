'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  clearSession,
  getSessionSnapshot,
  subscribeSession,
  type SessionUser,
} from '@/lib/api';

// Avatar button used in the client nav and team headers: shows the signed-in
// user's initials and opens a small menu with Settings and Logout. Renders
// nothing when no one is signed in (callers show their own sign-in link).
export default function ProfileMenu({ settingsHref }: { settingsHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const raw = useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
  const user = useMemo<SessionUser | null>(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionUser;
    } catch {
      return null;
    }
  }, [raw]);

  function handleLogout() {
    setOpen(false);
    clearSession();
    router.push('/login');
  }

  if (!user) return null;

  const initials =
    `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() || 'ME';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Account menu"
        aria-expanded={open}
        className="w-12 h-12 rounded-full bg-blue-950 flex items-center justify-center"
      >
        <span className="text-white font-bold text-lg">{initials}</span>
      </button>

      {open && (
        <>
          {/* Invisible backdrop so clicking anywhere else closes the menu */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 mt-2 w-40 bg-white rounded-md shadow-lg border border-gray-300 py-1 z-20">
            <Link
              href={settingsHref}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm font-semibold text-black hover:bg-gray-100"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2 text-sm font-semibold text-black hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
