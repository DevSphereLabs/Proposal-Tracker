'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GearIcon, HomeIcon, LogoutIcon, MenuIcon } from '@/components/icons';
import {
  clearSession,
  getSessionSnapshot,
  subscribeSession,
  type SessionUser,
} from '@/lib/api';

// The pages a client can reach. Clients only ever see their own dashboard
// and settings, so these live in the menu rather than as tabs on the nav.
const MENU_LINKS = [
  { label: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { label: 'Settings', href: '/dashboard/settings', icon: GearIcon },
];

// Hamburger button on the client nav. Opens a dropdown that greets the
// signed-in client by name, lists their pages, and offers Logout. Renders
// nothing when no one is signed in (the nav shows a sign-in link instead).
export default function ClientMenu() {
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Menu"
        aria-expanded={open}
        className="w-12 h-12 rounded-full bg-blue-950 flex items-center justify-center"
      >
        <MenuIcon className="w-6 h-6 text-white" />
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
          <div className="absolute right-0 mt-2 w-52 bg-white rounded-md shadow-lg border border-gray-300 py-1 z-20">

            {/* Greeting */}
            <p className="px-4 py-2 text-sm font-bold text-black border-b border-gray-200">
              Hi {user.firstName || 'there'}
            </p>

            {MENU_LINKS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm font-semibold text-black hover:bg-gray-100"
              >
                <item.icon className="w-4 h-4 text-gray-600" /> {item.label}
              </Link>
            ))}

            <div className="border-t border-gray-200 my-1" />

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 w-full text-left px-4 py-2 text-sm font-semibold text-black hover:bg-gray-100"
            >
              <LogoutIcon className="w-4 h-4 text-gray-600" /> Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
