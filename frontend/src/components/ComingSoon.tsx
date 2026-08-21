'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionSnapshot, subscribeSession } from '@/lib/api';

// Drop-in placeholder for /dashboard routes that don't have real content yet.
export default function ComingSoon({ title }: { title: string }) {
  const router = useRouter();
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
  const authorized = session !== null;

  useEffect(() => {
    if (!authorized) router.replace('/login');
  }, [authorized, router]);

  if (!authorized) return null;

  return (
  <div className="min-h-full flex flex-col items-center justify-center px-6 py-16">
    <div className="border-2 border-blue-950 rounded-lg px-10 py-8 text-center">
      <h1 className="text-2xl font-bold text-black">{title}</h1>
      <p className="mt-2 text-gray-600">This page is a work in progress. Check back soon.</p>
    </div>
  </div>
  );
}
