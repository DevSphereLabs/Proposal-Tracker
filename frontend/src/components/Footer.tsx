import Link from 'next/link';
import { ShieldIcon } from '@/components/icons';

// Footer shown on every dashboard page (wired in via app/dashboard/layout.tsx).
// Mirrors the header styling: brand on the left, quick links in the middle,
// and a copyright line underneath.
const FOOTER_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Settings', href: '/dashboard/settings' },
];

export default function Footer() {
  return (
    <footer className="bg-gray-200 border-t border-gray-300">
      <div className="max-w-6xl mx-auto px-6 py-6">

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-700 border-2 border-blue-900 flex items-center justify-center shrink-0">
              <ShieldIcon className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-black text-sm">TECH SQUAD</span>
          </div>

          {/* Quick links */}
          <div className="flex items-center gap-6">
            {FOOTER_LINKS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-sm text-gray-800 hover:text-blue-600"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Contact placeholder until a real support inbox exists */}
          <p className="text-sm text-gray-800">support@techsquad.com</p>

        </div>

        {/* Copyright line */}
        <p className="text-xs text-gray-600 text-center mt-4">
          &copy; {new Date().getFullYear()} Tech Squad. All rights reserved.
        </p>

      </div>
    </footer>
  );
}
