'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfileMenu from '@/components/ProfileMenu';
import ProposalManagerModal from '@/components/ProposalManagerModal';
import StatTile from '@/components/StatTile';
import { ChevronDownIcon, EyeIcon } from '@/components/icons';
import { ApiError, getTeamClients, getTeamSettings } from '@/lib/api';
import {
  MANAGER_STATUS_PILLS as STATUS_PILLS,
  formatMoney,
  pillStyle,
  proposalRef,
} from '@/lib/format';
import type { ManagerStatus, TeamClientSummary, TeamSettings } from '@/types';

type SortKey = 'value' | 'won' | 'proposals' | 'timeline' | 'recent' | 'name';

// How the list can be ranked: what each option orders by. Everything but
// name ranks highest first by default.
const SORTS: { key: SortKey; label: string; pick: (c: TeamClientSummary) => number | string }[] = [
  { key: 'value', label: 'VALUE', pick: (c) => c.totalValue },
  { key: 'won', label: 'WON', pick: (c) => c.wonValue },
  { key: 'proposals', label: 'PROPOSALS', pick: (c) => c.proposalCount },
  { key: 'timeline', label: 'TIMELINE', pick: (c) => c.avgTimelineWeeks },
  { key: 'recent', label: 'RECENT', pick: (c) => c.lastCreatedSort },
  { key: 'name', label: 'NAME', pick: (c) => c.name.toLowerCase() },
];

const STATUS_ORDER: ManagerStatus[] = ['new', 'in_progress', 'accepted', 'declined'];

// Every client (and unregistered lead) with their proposals rolled up:
// ranked by value, proposals, timeline, or recency, searchable, and each
// row expands to the proposals behind the numbers.
export default function TeamClientsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<TeamClientSummary[]>([]);
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Bumped to reload after a change made in the View popup
  const [refreshKey, setRefreshKey] = useState(0);

  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [desc, setDesc] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([getTeamClients(), getTeamSettings()])
      .then(([list, payload]) => {
        if (!active) return;
        setClients(list);
        setSettings(payload.settings);
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace('/login');
          return;
        }
        if (active) setError('Could not load clients. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router, refreshKey]);

  function pickSort(key: SortKey) {
    if (key === sortKey) {
      setDesc((prev) => !prev);
    } else {
      setSortKey(key);
      setDesc(key !== 'name');
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const sort = SORTS.find((s) => s.key === sortKey) ?? SORTS[0];
  const needle = search.trim().toLowerCase();
  const ranked = clients
    .filter(
      (c) =>
        !needle ||
        c.name.toLowerCase().includes(needle) ||
        c.company.toLowerCase().includes(needle) ||
        c.email.toLowerCase().includes(needle)
    )
    .sort((a, b) => {
      const x = sort.pick(a);
      const y = sort.pick(b);
      const cmp =
        typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return desc ? -cmp : cmp;
    });

  const totalValue = clients.reduce((sum, c) => sum + c.totalValue, 0);
  const wonValue = clients.reduce((sum, c) => sum + c.wonValue, 0);

  function statusPill(status: ManagerStatus, count: number) {
    const color = settings?.status_colors[status];
    return (
      <span
        key={status}
        style={color ? pillStyle(color) : undefined}
        className={`${color ? '' : STATUS_PILLS[status].className} inline-block font-semibold text-[11px] px-2 py-0.5 rounded-full`}
      >
        {count} {STATUS_PILLS[status].label}
      </span>
    );
  }

  if (loading) {
    return <p className="text-gray-600 bg-gray-100 rounded-2xl p-8">Loading clients...</p>;
  }

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="bg-gray-100 rounded-2xl px-6 py-4 flex items-center justify-between shadow-md">
        <h1 className="text-2xl font-bold text-black tracking-wide">CLIENTS</h1>
        <ProfileMenu settingsHref="/team/settings" />
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Clients" value={clients.length} />
        <StatTile label="With portal accounts" value={clients.filter((c) => c.hasAccount).length} />
        <StatTile
          label="Total value"
          value={formatMoney(totalValue)}
          hint="Priced proposals, otherwise budget estimates"
        />
        <StatTile label="Won value" value={formatMoney(wonValue)} />
      </div>

      {/* Rank by, plus search */}
      <div className="flex items-center gap-3 flex-wrap px-2">
        <span className="text-xs font-bold text-gray-600">RANK BY</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => pickSort(s.key)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1 ${
              sortKey === s.key ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {s.label}
            {sortKey === s.key && (
              <ChevronDownIcon className={`w-3 h-3 ${desc ? '' : 'rotate-180'}`} />
            )}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, company, email"
          className="ml-auto rounded-full bg-gray-100 border border-gray-300 text-black text-sm px-4 py-1.5 w-64"
        />
      </div>

      {/* Clients table */}
      <div className="bg-gray-100 rounded-2xl overflow-hidden shadow-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-200 text-left text-black">
              <th className="px-4 py-3 font-bold w-12">#</th>
              <th className="px-2 py-3 font-bold">Client</th>
              <th className="px-2 py-3 font-bold">Proposals</th>
              <th className="px-2 py-3 font-bold text-right">Total value</th>
              <th className="px-2 py-3 font-bold text-right">Won</th>
              <th className="px-2 py-3 font-bold text-right">Avg timeline</th>
              <th className="px-2 py-3 font-bold">Last activity</th>
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-600">
                  {needle ? 'No clients match that search.' : 'No clients yet.'}
                </td>
              </tr>
            ) : (
              ranked.map((client, index) => {
                const open = expanded.has(client.id);
                return (
                  <Fragment key={client.id}>
                    <tr className="border-t border-gray-300 bg-white">
                      <td className="px-4 py-3 font-bold text-gray-600">{index + 1}</td>
                      <td className="px-2 py-3">
                        <p className="font-semibold text-black">{client.name}</p>
                        <p className="text-xs text-gray-600">
                          {client.company ? `${client.company} · ` : ''}
                          {client.email}
                          {!client.hasAccount && (
                            <span className="ml-2 bg-gray-200 text-gray-700 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">
                              lead
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-2 py-3">
                        <p className="font-semibold text-black">{client.proposalCount}</p>
                        <p className="flex flex-wrap gap-1 mt-1">
                          {STATUS_ORDER.filter((s) => client.counts[s] > 0).map((s) =>
                            statusPill(s, client.counts[s])
                          )}
                        </p>
                      </td>
                      <td className="px-2 py-3 text-right font-semibold text-black">
                        {formatMoney(client.totalValue)}
                      </td>
                      <td className="px-2 py-3 text-right text-black">{formatMoney(client.wonValue)}</td>
                      <td className="px-2 py-3 text-right text-black">{client.avgTimelineWeeks} wks</td>
                      <td className="px-2 py-3 text-black">{client.lastCreated}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(client.id)}
                          aria-label={open ? 'Hide proposals' : 'Show proposals'}
                          aria-expanded={open}
                          className="w-8 h-8 rounded-full bg-gray-200 inline-flex items-center justify-center"
                        >
                          <ChevronDownIcon className={`w-4 h-4 text-black ${open ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                    </tr>

                    {/* The proposals behind the numbers */}
                    {open && (
                      <tr className="bg-gray-50">
                        <td />
                        <td colSpan={7} className="px-2 pb-4 pt-1">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-600 text-xs">
                                <th className="px-2 py-2 font-bold">ID</th>
                                <th className="px-2 py-2 font-bold">Project</th>
                                <th className="px-2 py-2 font-bold">Status</th>
                                <th className="px-2 py-2 font-bold">Budget</th>
                                <th className="px-2 py-2 font-bold text-right">Value</th>
                                <th className="px-2 py-2 font-bold text-right">Timeline</th>
                                <th className="px-2 py-2 font-bold">Created</th>
                                <th className="px-2 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {client.proposals.map((p) => {
                                const color = settings?.status_colors[p.status];
                                return (
                                  <tr key={p.id} className="border-t border-gray-200">
                                    <td className="px-2 py-2 font-semibold text-black">{proposalRef(p.id)}</td>
                                    <td className="px-2 py-2 font-semibold text-black">{p.title}</td>
                                    <td className="px-2 py-2">
                                      <span
                                        style={color ? pillStyle(color) : undefined}
                                        className={`${color ? '' : STATUS_PILLS[p.status].className} inline-block font-semibold text-xs px-3 py-1 rounded-full`}
                                      >
                                        {STATUS_PILLS[p.status].label}
                                      </span>
                                    </td>
                                    <td className="px-2 py-2 text-black">{p.budget}</td>
                                    <td className="px-2 py-2 text-right text-black">{formatMoney(p.value)}</td>
                                    <td className="px-2 py-2 text-right text-black">{p.timelineWeeks} wks</td>
                                    <td className="px-2 py-2 text-black">{p.created}</td>
                                    <td className="px-2 py-2 text-right">
                                      <button
                                        type="button"
                                        onClick={() => setViewing(p.id)}
                                        className="bg-gray-200 text-black font-semibold text-xs px-3 py-1 rounded-full inline-flex items-center gap-1.5"
                                      >
                                        <EyeIcon className="w-3.5 h-3.5" /> View
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {error && <p className="text-red-600 text-sm px-2">{error}</p>}

      {/* View popup, shared with the proposals page. Any change reloads the
          rollups so the numbers stay honest */}
      {viewing && (
        <ProposalManagerModal
          submissionId={viewing}
          statusColors={settings?.status_colors}
          categories={settings?.categories}
          budgetRanges={settings?.budget_ranges}
          onClose={() => setViewing(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onDeleted={() => {
            setViewing(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

    </div>
  );
}
