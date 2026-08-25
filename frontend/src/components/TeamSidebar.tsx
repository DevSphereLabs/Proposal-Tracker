'use client';

import { useRouter } from 'next/navigation';
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

type IconComponent = (props: { className?: string }) => React.ReactElement;

// Sidebar tabs. Only the proposal manager is built so far — the rest render
// dimmed until their pages exist.
const NAV_ITEMS: { label: string; icon: IconComponent; href?: string }[] = [
  { label: 'Dashboard', icon: HomeIcon, href: '/team' },
  { label: 'Proposal', icon: ClipboardIcon, href: '/team' },
  { label: 'Clients', icon: UsersIcon },
  { label: 'Templates', icon: ClipboardIcon },
  { label: 'Reports', icon: ChartIcon },
  { label: 'Settings', icon: GearIcon },
];

// Left-hand navigation for the internal (team-only) pages, per the proposal
// manager mockup: brand block on top, tabs in the middle, help/logout pinned
// to the bottom.
export default function TeamSidebar() {
  const router = useRouter();

  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  return (
    <aside className="w-64 shrink-0 rounded-2xl overflow-hidden flex flex-col bg-indigo-500 shadow-lg">

      {/* Brand block */}
      <div className="bg-blue-950 px-6 py-5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-blue-700 border-2 border-blue-400 flex items-center justify-center shrink-0">
          <ShieldIcon className="w-6 h-6 text-white" />
        </div>
        <span className="font-bold text-white text-lg leading-tight">
          TECH<br />SQUAD
        </span>
      </div>

      {/* Nav tabs */}
      <nav className="flex-1 py-6 space-y-1">
        {NAV_ITEMS.map((item) =>
          item.href ? (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-3 font-bold text-white ${
                item.label === 'Proposal' ? 'bg-blue-700' : 'hover:bg-indigo-400'
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
          className="w-full flex items-center gap-3 px-6 py-2.5 font-bold text-white hover:bg-indigo-400"
        >
          <LogoutIcon className="w-5 h-5" /> Logout
        </button>
      </div>

    </aside>
  );
}
