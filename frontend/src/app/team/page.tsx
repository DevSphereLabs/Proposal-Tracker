'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfileMenu from '@/components/ProfileMenu';
import ProposalManagerModal from '@/components/ProposalManagerModal';
import { ChevronDownIcon, ChevronRightIcon, EyeIcon, XIcon } from '@/components/icons';
import {
  ApiError,
  deleteTeamProposal,
  getTeamProposals,
  getTeamSettings,
  updateTeamProposal,
} from '@/lib/api';
import { MANAGER_STATUS_PILLS as STATUS_PILLS, pillStyle, proposalRef } from '@/lib/format';
import type { ManagerStatus, TeamProposalRow, TeamSettings } from '@/types';

const FILTERS: { label: string; status: ManagerStatus | 'all' }[] = [
  { label: 'ALL', status: 'all' },
  { label: 'NEW', status: 'new' },
  { label: 'IN PROGRESS', status: 'in_progress' },
  { label: 'ACCEPTED', status: 'accepted' },
  { label: 'DECLINED', status: 'declined' },
];

const PAGE_SIZE = 8;

// How often to check for new submissions while the page is open
const POLL_MS = 30_000;
// How long a "new proposal" toast stays up
const TOAST_MS = 12_000;
// New proposals the team has already looked at, so the unseen count only
// covers what's actually new to them. Per-browser.
const SEEN_KEY = 'team_seen_proposals';

function loadSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

// A proposal that arrived while the page was open
interface Toast {
  id: string;
  title: string;
  clientName: string;
}

// The team's proposal manager: every submission in one table, filterable by
// status, sortable by date, with bulk delete and a View popup per row. New
// submissions are announced as they come in, and can be approved (moved to
// In Progress) or declined straight from their row.
export default function TeamProposalsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<TeamProposalRow[]>([]);
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState<ManagerStatus | 'all'>('all');
  const [newestFirst, setNewestFirst] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  // Review inbox: which new proposals the team has looked at, toasts for
  // ones that arrived while the page was open, and the row an inline
  // Approve/Decline is acting on
  const [seen, setSeen] = useState<Set<string>>(loadSeen);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  // IDs from the previous load, to spot arrivals (null until the first load)
  const knownIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    let active = true;

    function load() {
      Promise.all([getTeamProposals(), getTeamSettings()])
        .then(([list, payload]) => {
          if (!active) return;

          // Anything that wasn't there last time arrived since — announce it
          const previous = knownIds.current;
          if (previous) {
            const arrivals = list.filter((row) => row.status === 'new' && !previous.has(row.id));
            if (arrivals.length > 0) {
              setToasts((prev) => [
                ...prev,
                ...arrivals.map((row) => ({ id: row.id, title: row.title, clientName: row.clientName })),
              ]);
              for (const row of arrivals) {
                setTimeout(() => {
                  setToasts((prev) => prev.filter((toast) => toast.id !== row.id));
                }, TOAST_MS);
              }
            }
          }
          knownIds.current = new Set(list.map((row) => row.id));

          setRows(list);
          setSettings(payload.settings);
        })
        .catch((err) => {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            router.replace('/login');
            return;
          }
          if (active) setError('Could not load proposals. Please try again.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    load();

    // Refresh whenever the tab regains focus, so edits made on the client
    // portal show up without a manual reload
    function refresh() {
      if (document.visibilityState === 'visible') load();
    }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    // And keep checking in the background, so a new submission shows up —
    // and the tab title updates — even while nobody is looking at the page
    const timer = setInterval(load, POLL_MS);

    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      clearInterval(timer);
    };
  }, [router]);

  // New proposals nobody on the team has opened yet
  const unseen = rows.filter((row) => row.status === 'new' && !seen.has(row.id));

  // Show the unseen count in the tab title, so it's visible from another tab
  useEffect(() => {
    document.title = unseen.length > 0 ? `(${unseen.length}) Proposal Tracker` : 'Proposal Tracker';
    return () => {
      document.title = 'Proposal Tracker';
    };
  }, [unseen.length]);

  function markSeen(ids: string[]) {
    // Keep only IDs that still exist, so the stored list doesn't grow forever
    const existing = new Set(rows.map((row) => row.id));
    const next = new Set([...seen, ...ids].filter((id) => existing.has(id)));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
    setSeen(next);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  function openView(id: string) {
    setViewing(id);
    markSeen([id]);
  }

  // Approve (move to In Progress) or decline a new proposal from its row
  async function quickStatus(id: string, status: ManagerStatus) {
    setError('');
    setActing(id);
    try {
      const detail = await updateTeamProposal(id, { status });
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status: detail.status } : row)));
      markSeen([id]);
      dismissToast(id);
    } catch {
      setError('Could not update the status.');
    } finally {
      setActing(null);
    }
  }

  const counts: Record<string, number> = { all: rows.length };
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;

  const visible = rows
    .filter((row) => filter === 'all' || row.status === filter)
    .sort((a, b) =>
      newestFirst
        ? b.createdSort.localeCompare(a.createdSort)
        : a.createdSort.localeCompare(b.createdSort)
    );

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const allSelected = paged.length > 0 && paged.every((row) => selected.has(row.id));

  function switchFilter(status: ManagerStatus | 'all') {
    setFilter(status);
    setPage(1);
    setSelected(new Set());
    setConfirmingDelete(false);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setConfirmingDelete(false);
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(paged.map((row) => row.id)));
    setConfirmingDelete(false);
  }

  async function handleDelete() {
    setError('');
    setBusy(true);
    try {
      const ids = [...selected];
      await Promise.all(ids.map((id) => deleteTeamProposal(id)));
      setRows((prev) => prev.filter((row) => !selected.has(row.id)));
      setSelected(new Set());
    } catch {
      setError('Could not delete the selected proposal(s).');
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  // One status filter chip; NEW also carries the unseen count
  function filterChip(f: (typeof FILTERS)[number]) {
    return (
      <button
        key={f.status}
        type="button"
        onClick={() => switchFilter(f.status)}
        className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${
          filter === f.status ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-700'
        }`}
      >
        {f.label} <span className="text-blue-600">{counts[f.status] ?? 0}</span>
        {f.status === 'new' && unseen.length > 0 && (
          <span
            title={`${unseen.length} not yet reviewed`}
            className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none"
          >
            {unseen.length}
          </span>
        )}
      </button>
    );
  }

  if (loading) {
    return <p className="text-gray-600 bg-gray-100 rounded-2xl p-8">Loading proposals...</p>;
  }

  return (
    <div className="space-y-4">

      {/* Page header: title and the signed-in member's account menu */}
      <div className="bg-gray-100 rounded-2xl px-6 py-4 flex items-center justify-between shadow-md">
        <h1 className="text-2xl font-bold text-black tracking-wide">PROPOSALS</h1>
        <ProfileMenu settingsHref="/team/settings" />
      </div>

      {/* New proposals waiting on a first look */}
      {unseen.length > 0 && (
        <div className="bg-blue-100 border border-blue-300 rounded-2xl px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm font-semibold text-blue-950">
            {unseen.length} new proposal{unseen.length === 1 ? '' : 's'} waiting for review
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchFilter('new')}
              className="bg-blue-950 text-white font-semibold text-xs px-4 py-1.5 rounded-full"
            >
              Show new
            </button>
            <button
              type="button"
              onClick={() => markSeen(unseen.map((row) => row.id))}
              className="bg-white text-black font-semibold text-xs px-4 py-1.5 rounded-full border border-gray-300"
            >
              Mark all seen
            </button>
          </div>
        </div>
      )}

      {/* Status filters and date sort */}
      <div className="flex items-center gap-3 flex-wrap px-2">
        {FILTERS.slice(0, 3).map(filterChip)}
        <button
          type="button"
          onClick={() => setNewestFirst((prev) => !prev)}
          title={newestFirst ? 'Newest first' : 'Oldest first'}
          className="text-xs font-bold px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 flex items-center gap-1"
        >
          DATE <ChevronDownIcon className={`w-3 h-3 ${newestFirst ? '' : 'rotate-180'}`} />
        </button>
        {FILTERS.slice(3).map(filterChip)}
      </div>

      {/* Proposals table */}
      <div className="bg-gray-100 rounded-2xl overflow-hidden shadow-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-200 text-left text-black">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all proposals on this page"
                  disabled={paged.length === 0}
                />
              </th>
              <th className="px-2 py-3 font-bold">ID</th>
              <th className="px-2 py-3 font-bold">Project Name</th>
              <th className="px-2 py-3 font-bold">Client</th>
              <th className="px-2 py-3 font-bold">Status</th>
              <th className="px-2 py-3 font-bold">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-600">
                  No {filter === 'all' ? '' : STATUS_PILLS[filter].label.toLowerCase() + ' '}
                  proposals yet.
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const pill = STATUS_PILLS[row.status];
                const color = settings?.status_colors[row.status];
                const isUnseen = row.status === 'new' && !seen.has(row.id);
                return (
                  <tr key={row.id} className="border-t border-gray-300 bg-white">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        aria-label={`Select ${row.title}`}
                      />
                    </td>
                    <td className="px-2 py-3 font-semibold text-black">{proposalRef(row.id)}</td>
                    <td className="px-2 py-3 font-semibold text-black">
                      <span className="inline-flex items-center gap-2">
                        {isUnseen && (
                          <span
                            title="Not yet reviewed"
                            className="w-2 h-2 rounded-full bg-blue-600 shrink-0"
                          />
                        )}
                        {row.title}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-black">{row.clientName}</td>
                    <td className="px-2 py-3">
                      <span
                        style={color ? pillStyle(color) : undefined}
                        className={`${color ? '' : pill.className} inline-block font-semibold text-xs px-3 py-1 rounded-full`}
                      >
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-black">{row.created}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {/* New proposals can be approved or declined right here */}
                      {row.status === 'new' && (
                        <>
                          <button
                            type="button"
                            onClick={() => quickStatus(row.id, 'in_progress')}
                            disabled={acting === row.id}
                            className="bg-blue-950 text-white font-semibold text-sm px-4 py-1.5 rounded-full mr-2 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => quickStatus(row.id, 'declined')}
                            disabled={acting === row.id}
                            className="bg-red-500 text-white font-semibold text-sm px-4 py-1.5 rounded-full mr-2 disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => openView(row.id)}
                        className="bg-gray-200 text-black font-semibold text-sm px-4 py-1.5 rounded-full inline-flex items-center gap-2"
                      >
                        <EyeIcon className="w-4 h-4" /> View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {error && <p className="text-red-600 text-sm px-2">{error}</p>}

      {/* Bulk actions on the checked rows */}
      <div className="flex justify-end gap-2 px-2">
        {confirmingDelete ? (
          <>
            <span className="text-sm font-semibold text-black self-center">
              Delete {selected.size} proposal{selected.size === 1 ? '' : 's'} permanently?
            </span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="bg-red-600 text-white font-semibold text-sm px-6 py-2 rounded-full disabled:opacity-50"
            >
              {busy ? 'Deleting...' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              className="bg-gray-200 text-black font-semibold text-sm px-6 py-2 rounded-full disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={selected.size === 0 || busy}
            className="bg-red-500 text-white font-semibold text-sm px-8 py-2 rounded-full disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex justify-center items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            aria-label="Previous page"
            className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center disabled:opacity-40"
          >
            <ChevronRightIcon className="w-4 h-4 rotate-180 text-blue-600" />
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={`w-9 h-9 rounded-md font-bold text-sm ${
                n === currentPage ? 'bg-blue-600 text-white' : 'bg-gray-100 text-blue-600'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage === pageCount}
            aria-label="Next page"
            className="w-9 h-9 rounded-md bg-gray-100 flex items-center justify-center disabled:opacity-40"
          >
            <ChevronRightIcon className="w-4 h-4 text-blue-600" />
          </button>
        </div>
      )}

      {/* View popup */}
      {viewing && (
        <ProposalManagerModal
          submissionId={viewing}
          statusColors={settings?.status_colors}
          categories={settings?.categories}
          budgetRanges={settings?.budget_ranges}
          onClose={() => setViewing(null)}
          onChanged={(detail) =>
            setRows((prev) =>
              prev.map((row) =>
                row.id === detail.id
                  ? { ...row, title: detail.title, status: detail.status }
                  : row
              )
            )
          }
          onDeleted={(id) => {
            setRows((prev) => prev.filter((row) => row.id !== id));
            setViewing(null);
          }}
        />
      )}

      {/* Arrivals since the page was opened */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40 w-80 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="bg-white border border-blue-300 rounded-xl shadow-lg px-4 py-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">New proposal</p>
                <p className="text-sm font-bold text-black truncate">{toast.title}</p>
                <p className="text-xs text-gray-600 truncate">from {toast.clientName}</p>
                <button
                  type="button"
                  onClick={() => {
                    dismissToast(toast.id);
                    openView(toast.id);
                  }}
                  className="mt-2 bg-blue-950 text-white font-semibold text-xs px-4 py-1 rounded-full"
                >
                  Review
                </button>
              </div>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
                <XIcon className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
