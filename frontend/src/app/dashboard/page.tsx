'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MyDetailsCard from '@/components/MyDetailsCard';
import ProposalCard from '@/components/ProposalCard';
import ProposalDetailsForm from '@/components/ProposalDetailsForm';
import { ClipboardIcon, XIcon } from '@/components/icons';
import {
  ApiError,
  getMe,
  getPortalDisplaySettings,
  getProposals,
  submitProposal,
} from '@/lib/api';
import { usePortalTheme } from '@/lib/theme';
import type {
  ClientProfile,
  PortalStatusColors,
  Proposal,
  ProposalDetails,
  ProposalStatus,
} from '@/types';

// The three status tabs plus the New Proposal form
type Tab = ProposalStatus | 'new';

const TABS: { label: string; tab: Tab }[] = [
  { label: 'Active', tab: 'active' },
  { label: 'Completed', tab: 'completed' },
  { label: 'Declined', tab: 'declined' },
  { label: 'New Proposal', tab: 'new' },
];

// The client portal: each client's view of their own proposals, loaded from
// the backend for whoever is signed in. Unauthenticated visitors are bounced
// to the sign-in page.
export default function DashboardPage() {
  const router = useRouter();
  const theme = usePortalTheme();

  const [client, setClient] = useState<ClientProfile | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [statusColors, setStatusColors] = useState<PortalStatusColors | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New Proposal tab
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // Confirmation shown above the list after a request goes through
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [me, list, colors] = await Promise.all([
          getMe(),
          getProposals(),
          // Display-only; the default palette still applies if this fails
          getPortalDisplaySettings().catch(() => null),
        ]);
        if (!active) return;
        setClient(me);
        setProposals(list);
        setStatusColors(colors);
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

  function switchTab(next: Tab) {
    setTab(next);
    setNotice('');
  }

  // New Proposal tab: the same request the public intake form sends, made
  // for the signed-in client. It lands under Active once it's through.
  async function handleNewProposal(values: ProposalDetails) {
    setSubmitError(false);
    setSubmitting(true);
    try {
      await submitProposal(values);
      setProposals(await getProposals());
      setTab('active');
      setNotice('Your proposal has been sent. It now shows under Active, and our team will be in touch.');
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="max-w-6xl mx-auto px-6 py-16 text-gray-600">Loading your portal...</p>;
  }

  if (error) {
    return <p className="max-w-6xl mx-auto px-6 py-16 text-red-600">{error}</p>;
  }

  const visible = tab === 'new' ? [] : proposals.filter((p) => p.status === tab);

  return (
    <div className="min-h-full bg-gray-100">

      {/* Hero banner */}
      <div className={theme.banner}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold text-white">My Proposals</h1>
            <p className={`${theme.bannerText} mt-1`}>
              Welcome back {client?.firstName} {client?.lastName}!
            </p>
          </div>
          <span className="text-2xl font-bold text-white">Client Portal</span>
        </div>
      </div>

      {/* Status tabs, plus New Proposal */}
      <div className="bg-gray-200 border-b border-gray-300">
        <div className="max-w-6xl mx-auto px-6 flex">
          {TABS.map((t) => (
            <button
              key={t.tab}
              type="button"
              onClick={() => switchTab(t.tab)}
              className={
                tab === t.tab
                  ? `${theme.tabActive} text-white font-bold px-8 py-3`
                  : `text-black font-bold px-8 py-3 ${theme.tabHover}`
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Proposals (or the new request form) on the left, client details on the right */}
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-2 space-y-6">

          {notice && (
            <div className="bg-green-100 border border-green-300 text-green-900 text-sm font-semibold rounded-2xl px-6 py-4 flex items-start justify-between gap-4">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {tab === 'new' ? (
            client && (
              <section className="rounded-2xl overflow-hidden shadow-md">
                <div className={`${theme.banner} px-6 py-4 flex items-center gap-3`}>
                  <ClipboardIcon className="w-6 h-6 text-white" />
                  <h2 className="text-xl font-bold text-white">New Proposal Request</h2>
                </div>
                <div className="bg-gray-50 p-6">
                  <p className="text-sm text-gray-600 mb-5">
                    Tell us about your next project. Your contact details are filled in from
                    your account.
                  </p>
                  <ProposalDetailsForm
                    variant="portal"
                    initial={{
                      firstName: client.firstName,
                      lastName: client.lastName,
                      email: client.email,
                      companyName: client.companyName,
                    }}
                    lockEmail
                    requireConsent={false}
                    submitClassName={`${theme.button} text-white font-semibold text-sm px-8 py-2.5 rounded-full disabled:opacity-50`}
                    onSubmit={handleNewProposal}
                    isSubmitting={submitting}
                    submitError={submitError}
                  />
                </div>
              </section>
            )
          ) : visible.length === 0 ? (
            <p className="text-gray-600 bg-gray-50 rounded-2xl p-8 text-center">
              No {tab} proposals yet.
            </p>
          ) : (
            visible.map((proposal, index) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                statusColors={statusColors}
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
