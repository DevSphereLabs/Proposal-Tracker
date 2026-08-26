'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MyDetailsCard from '@/components/MyDetailsCard';
import ProposalCard from '@/components/ProposalCard';
import { ApiError, getMe, getProposals } from '@/lib/api';
import type { ClientProfile, Proposal, ProposalStatus } from '@/types';

const TABS: { label: string; status: ProposalStatus }[] = [
  { label: 'Active', status: 'active' },
  { label: 'Completed', status: 'completed' },
  { label: 'Declined', status: 'declined' },
];

// The client portal: each client's view of their own proposals, loaded from
// the backend for whoever is signed in. Unauthenticated visitors are bounced
// to the sign-in page.
export default function DashboardPage() {
  const router = useRouter();

  const [client, setClient] = useState<ClientProfile | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [tab, setTab] = useState<ProposalStatus>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [me, list] = await Promise.all([getMe(), getProposals()]);
        if (!active) return;
        setClient(me);
        setProposals(list);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace('/login');
          return;
        }
        if (active) setError('Could not load your dashboard. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    // Refresh whenever the tab regains focus, so changes made by the team
    // (status moves, edits, replies) show up without a manual reload
    function refresh() {
      if (document.visibilityState === 'visible') load();
    }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  if (loading) {
    return <p className="max-w-6xl mx-auto px-6 py-16 text-gray-600">Loading your portal...</p>;
  }

  if (error) {
    return <p className="max-w-6xl mx-auto px-6 py-16 text-red-600">{error}</p>;
  }

  const visible = proposals.filter((p) => p.status === tab);

  return (
    <div className="min-h-full bg-gray-100">

      {/* Hero banner */}
      <div className="bg-blue-950">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold text-white">My Proposals</h1>
            <p className="text-blue-100 mt-1">
              Welcome back {client?.firstName} {client?.lastName}!
            </p>
          </div>
          <span className="text-2xl font-bold text-white">Client Portal</span>
        </div>
      </div>

      {/* Status tabs */}
      <div className="bg-gray-200 border-b border-gray-300">
        <div className="max-w-6xl mx-auto px-6 flex">
          {TABS.map((t) => (
            <button
              key={t.status}
              type="button"
              onClick={() => setTab(t.status)}
              className={
                tab === t.status
                  ? 'bg-blue-600 text-white font-bold px-8 py-3'
                  : 'text-black font-bold px-8 py-3 hover:text-blue-600'
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Proposals on the left, client details on the right */}
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-6">
          {visible.length === 0 ? (
            <p className="text-gray-600 bg-gray-50 rounded-2xl p-8 text-center">
              No {tab} proposals yet.
            </p>
          ) : (
            visible.map((proposal, index) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                defaultExpanded={index === 0}
                onUpdated={(updated) =>
                  setProposals((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                }
              />
            ))
          )}
        </div>

        {client && <MyDetailsCard client={client} onUpdated={setClient} />}
      </div>

    </div>
  );
}
