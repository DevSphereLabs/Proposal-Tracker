'use client';

import { useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChartIcon,
  ClipboardIcon,
  GearIcon,
  HelpIcon,
  HomeIcon,
  LogoutIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/icons';
import { clearSession } from '@/lib/api';
import { DEFAULT_THEME, TEAM_THEMES, getThemeSnapshot, subscribeTheme } from '@/lib/theme';

type IconComponent = (props: { className?: string }) => React.ReactElement;

// Sidebar tabs. Items without an href render dimmed until their pages exist.
const NAV_ITEMS: { label: string; icon: IconComponent; href?: string }[] = [
  { label: 'Dashboard', icon: HomeIcon, href: '/team' },
  { label: 'Proposal', icon: ClipboardIcon, href: '/team' },
  { label: 'Clients', icon: UsersIcon, href: '/team/clients' },
  { label: 'Templates', icon: ClipboardIcon },
  { label: 'Reports', icon: ChartIcon, href: '/team/reports' },
  { label: 'Settings', icon: GearIcon, href: '/team/settings' },
];

const ACTIVE_BY_PATH: Record<string, string> = {
  '/team/settings': 'Settings',
  '/team/clients': 'Clients',
  '/team/reports': 'Reports',
};

// Left-hand navigation for the internal (team-only) pages, per the proposal
// manager mockup: brand block on top, tabs in the middle, help/logout pinned
// to the bottom. Colors come from the theme chosen on Settings > Theme.
export default function TeamSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const themeId = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => DEFAULT_THEME);
  const theme = TEAM_THEMES[themeId] ?? TEAM_THEMES[DEFAULT_THEME];

  // Which tab lights up for the current page ("Dashboard" shares /team with
  // "Proposal", which is the one the mockup highlights there)
  const activeLabel = ACTIVE_BY_PATH[pathname] ?? 'Proposal';

  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  return (
    <aside className={`w-64 shrink-0 rounded-2xl overflow-hidden flex flex-col ${theme.sidebar} shadow-lg`}>

      {/* Brand block: back to the team's home page, or a refresh when
          already there */}
      <button
        type="button"
        onClick={() => {
          if (pathname === '/team') {
            window.location.reload();
          } else {
            router.push('/team');
          }
        }}
        className={`${theme.brand} px-6 py-5 flex items-center gap-3 w-full text-left`}
      >
        <div className="w-11 h-11 rounded-full bg-blue-700 border-2 border-blue-400 flex items-center justify-center shrink-0">
          <ShieldIcon className="w-6 h-6 text-white" />
        </div>
        <span className="font-bold text-white text-lg leading-tight">
          TECH<br />SQUAD
        </span>
      </button>

      {/* Nav tabs */}
      <nav className="flex-1 py-6 space-y-1">
        {NAV_ITEMS.map((item) =>
          item.href ? (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-3 font-bold text-white ${
                item.label === activeLabel ? theme.active : theme.hover
              }`}
            >
              <item.icon className="w-5 h-5" /> {item.label}
            </Link>
          ) : (
            <span
              key={item.label}
              title="Coming soon"
              className="flex items-center gap-3 px-6 py-3 font-bold text-white/50 cursor-not-allowed"
            >
              <item.icon className="w-5 h-5" /> {item.label}
            </span>
          )
        )}
      </nav>

      {/* Bottom links */}
      <div className="pb-6 space-y-1">
        <span
          title="Coming soon"
          className="flex items-center gap-3 px-6 py-2.5 font-bold text-white/50 cursor-not-allowed"
        >
          <HelpIcon className="w-5 h-5" /> Help
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-6 py-2.5 font-bold text-white ${theme.hover}`}
        >
          <LogoutIcon className="w-5 h-5" /> Logout
        </button>
      </div>

    </aside>
  );
}
