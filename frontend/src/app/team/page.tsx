'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProposalManagerModal from '@/components/ProposalManagerModal';
import { ChevronDownIcon, ChevronRightIcon, EyeIcon } from '@/components/icons';
import {
  ApiError,
  deleteTeamProposal,
  getSessionUser,
  getTeamProposals,
  getTeamSettings,
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

// The team's proposal manager: every submission in one table, filterable by
// status, sortable by date, with bulk delete and a View popup per row.
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

  const initials = (() => {
    const user = getSessionUser();
    if (!user) return 'TQ';
    return `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() || 'TQ';
  })();

  useEffect(() => {
    let active = true;

    function load() {
      Promise.all([getTeamProposals(), getTeamSettings()])
        .then(([list, payload]) => {
          if (!active) return;
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

    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

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

  if (loading) {
    return <p className="text-gray-600 bg-gray-100 rounded-2xl p-8">Loading proposals...</p>;
  }

  return (
    <div className="space-y-4">

      {/* Page header: title and the signed-in member's initials */}
      <div className="bg-gray-100 rounded-2xl px-6 py-4 flex items-center justify-between shadow-md">
        <h1 className="text-2xl font-bold text-black tracking-wide">PROPOSALS</h1>
        <div className="w-12 h-12 rounded-full bg-blue-950 flex items-center justify-center">
          <span className="text-white font-bold text-lg">{initials}</span>
        </div>
      </div>

      {/* Status filters and date sort */}
      <div className="flex items-center gap-3 flex-wrap px-2">
        {FILTERS.slice(0, 3).map((f) => (
          <button
            key={f.status}
            type="button"
            onClick={() => switchFilter(f.status)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full ${
              filter === f.status ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {f.label} <span className="text-blue-600">{counts[f.status] ?? 0}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setNewestFirst((prev) => !prev)}
          title={newestFirst ? 'Newest first' : 'Oldest first'}
          className="text-xs font-bold px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 flex items-center gap-1"
        >
          DATE <ChevronDownIcon className={`w-3 h-3 ${newestFirst ? '' : 'rotate-180'}`} />
        </button>
        {FILTERS.slice(3).map((f) => (
          <button
            key={f.status}
            type="button"
            onClick={() => switchFilter(f.status)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full ${
              filter === f.status ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {f.label} <span className="text-blue-600">{counts[f.status] ?? 0}</span>
          </button>
        ))}
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
              <th className="px-4 py-3 w-28" />
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
                    <td className="px-2 py-3 font-semibold text-black">{row.title}</td>
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
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setViewing(row.id)}
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

    </div>
  );
}
