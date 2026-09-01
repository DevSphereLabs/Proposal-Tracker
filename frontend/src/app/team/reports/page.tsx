'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProfileMenu from '@/components/ProfileMenu';
import StatTile from '@/components/StatTile';
import { ApiError, getTeamReport, getTeamSettings } from '@/lib/api';
import { MANAGER_STATUS_PILLS as STATUS_PILLS, formatMoney, pillStyle } from '@/lib/format';
import type { ManagerStatus, ReportBucket, TeamReport, TeamSettings } from '@/types';

const STATUS_ORDER: ManagerStatus[] = ['new', 'in_progress', 'accepted', 'declined'];

// Every chart on this page plots one measure in one hue; the team's status
// colors appear only on the status breakdown, always beside a text label.
const BAR = 'bg-blue-600 group-hover:bg-blue-700 group-focus-visible:bg-blue-700';

// A chart card with a "Table" toggle, so every number a chart shows is also
// readable as plain rows without hovering
function ChartCard({
  title,
  subtitle,
  rows,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  // The table view: one row per bucket
  rows: { label: string; count: number; value: number }[];
  empty: boolean;
  children: React.ReactNode;
}) {
  const [table, setTable] = useState(false);

  return (
    <section className="bg-gray-100 rounded-2xl p-5 shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-black">{title}</h2>
          {subtitle && <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>}
        </div>
        {!empty && (
          <button
            type="button"
            onClick={() => setTable((prev) => !prev)}
            aria-pressed={table}
            className="text-xs font-bold px-3 py-1 rounded-full bg-white border border-gray-300 text-gray-700 shrink-0"
          >
            {table ? 'Chart' : 'Table'}
          </button>
        )}
      </div>

      <div className="mt-4">
        {empty ? (
          <p className="text-sm text-gray-500 py-8 text-center">No proposals yet.</p>
        ) : table ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-600">
                <th className="py-1.5 font-bold">Bucket</th>
                <th className="py-1.5 font-bold text-right">Proposals</th>
                <th className="py-1.5 font-bold text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-gray-200">
                  <td className="py-1.5 text-black">{row.label}</td>
                  <td className="py-1.5 text-right text-black">{row.count}</td>
                  <td className="py-1.5 text-right text-black">{formatMoney(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// Hover/focus readout for one mark: the value leads, the label follows
function Tip({ label, count, value }: { label: string; count: number; value: number }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block group-focus-visible:block bg-black text-white text-xs rounded-md px-2.5 py-1.5 whitespace-nowrap z-10"
    >
      <span className="font-bold">{count} proposal{count === 1 ? '' : 's'}</span>
      <span className="text-gray-300"> · {formatMoney(value)} · {label}</span>
    </span>
  );
}

// Column chart of the last twelve months. Bars are capped at 24px wide,
// rounded at the data end, and grow from a hairline baseline; the peak
// month carries its value, the rest live in the hover readout and table.
function MonthColumns({ months }: { months: TeamReport['byMonth'] }) {
  const max = Math.max(1, ...months.map((m) => m.count));
  const peak = months.findIndex((m) => m.count === max);
  const ticks = max >= 2 ? [max, Math.round(max / 2), 0] : [max, 0];

  return (
    <div className="flex gap-3">
      {/* Y axis: the values not carried by direct labels */}
      <div className="relative w-6 h-40 text-[10px] text-gray-500">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${100 - (t / max) * 100}%` }}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex-1">
        <div className="relative h-40">
          {/* Recessive hairline gridlines at the tick values */}
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-gray-300"
              style={{ top: `${100 - (t / max) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end">
            {months.map((m, i) => (
              <div
                key={m.month}
                tabIndex={0}
                className="group relative flex-1 h-full flex flex-col items-center justify-end outline-none"
              >
                <Tip label={`${m.label} ${m.year}`} count={m.count} value={m.value} />
                {i === peak && m.count > 0 && (
                  <span className="text-xs font-bold text-black mb-1">{m.count}</span>
                )}
                <div
                  className={`${BAR} w-full max-w-6 rounded-t-[4px]`}
                  style={{ height: `${(m.count / max) * 100}%`, minHeight: m.count > 0 ? 3 : 0 }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex mt-1.5">
          {months.map((m) => (
            <span key={m.month} className="flex-1 text-center text-[10px] text-gray-600">
              {m.label}
              {m.label === 'Jan' && <span className="block text-gray-400">{m.year}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Horizontal bars for a breakdown, longest first, count at the tip
function BreakdownBars({ buckets }: { buckets: ReportBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <ul className="space-y-2.5">
      {buckets.map((b) => (
        <li key={b.label} tabIndex={0} className="group relative outline-none">
          <Tip label={b.label} count={b.count} value={b.value} />
          <div className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-xs text-gray-700 truncate" title={b.label}>
              {b.label}
            </span>
            <div className="flex-1 flex items-center gap-2">
              <div
                className={`${BAR} h-4 rounded-r-[4px]`}
                style={{ width: `${(b.count / max) * 100}%`, minWidth: 3 }}
              />
              <span className="text-xs font-bold text-black">{b.count}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// The pipeline as one segmented bar in the team's status colors, with a
// legend carrying every label, count, and value in text (the colors come
// from Settings, so they're never the only cue)
function StatusBreakdown({
  totals,
  values,
  colors,
}: {
  totals: TeamReport['totals'];
  values: Record<ManagerStatus, number>;
  colors?: Record<string, string>;
}) {
  const present = STATUS_ORDER.filter((s) => totals[s] > 0);

  return (
    <div>
      <div className="flex h-6 gap-[2px] rounded-md overflow-hidden">
        {present.map((s) => {
          const color = colors?.[s];
          return (
            <div
              key={s}
              title={`${STATUS_PILLS[s].label}: ${totals[s]}`}
              style={{
                flexBasis: `${(totals[s] / totals.all) * 100}%`,
                ...(color ? { backgroundColor: color } : {}),
              }}
              className={color ? '' : STATUS_PILLS[s].className.split(' ')[0]}
            />
          );
        })}
      </div>
      <ul className="mt-4 space-y-2">
        {STATUS_ORDER.map((s) => {
          const color = colors?.[s];
          return (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span
                style={color ? pillStyle(color) : undefined}
                className={`${color ? '' : STATUS_PILLS[s].className} w-3 h-3 rounded-sm shrink-0`}
              />
              <span className="text-black w-24">{STATUS_PILLS[s].label}</span>
              <span className="font-bold text-black w-8 text-right">{totals[s]}</span>
              <span className="text-gray-600 text-xs">
                {totals.all ? Math.round((totals[s] / totals.all) * 100) : 0}% · {formatMoney(values[s])}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The Reports page: the pipeline at a glance — headline numbers, the last
// twelve months, the status mix, what kinds of work come in, who it comes
// from, and the latest arrivals.
export default function TeamReportsPage() {
  const router = useRouter();

  const [report, setReport] = useState<TeamReport | null>(null);
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([getTeamReport(), getTeamSettings()])
      .then(([r, payload]) => {
        if (!active) return;
        setReport(r);
        setSettings(payload.settings);
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace('/login');
          return;
        }
        if (active) setError('Could not load reports. Please try again.');
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (error) {
    return <p className="text-red-600 bg-gray-100 rounded-2xl p-8">{error}</p>;
  }
  if (!report) {
    return <p className="text-gray-600 bg-gray-100 rounded-2xl p-8">Loading reports...</p>;
  }

  const empty = report.totals.all === 0;
  const statusValues: Record<ManagerStatus, number> = {
    new: report.value.new,
    in_progress: report.value.in_progress,
    accepted: report.value.won,
    declined: report.value.lost,
  };

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="bg-gray-100 rounded-2xl px-6 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-wide">REPORTS</h1>
          <p className="text-xs text-gray-600">As of {report.generatedAt}</p>
        </div>
        <ProfileMenu settingsHref="/team/settings" />
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatTile label="Proposals" value={report.totals.all}>
          <p className="text-xs text-gray-500 mt-1">
            {report.totals.new} new · {report.totals.in_progress} in progress
          </p>
        </StatTile>
        <StatTile
          label="Open pipeline"
          value={formatMoney(report.value.pipeline)}
          hint="New and in-progress value"
        />
        <StatTile label="Won" value={formatMoney(report.value.won)} hint={`${report.totals.accepted} accepted`} />
        <StatTile
          label="Win rate"
          value={report.winRate === null ? '—' : `${Math.round(report.winRate * 100)}%`}
          hint={
            report.winRate === null
              ? 'No decided proposals yet'
              : `${report.totals.accepted} of ${report.totals.accepted + report.totals.declined} decided`
          }
        />
        <StatTile
          label="Avg timeline"
          value={`${report.avgTimelineWeeks} wks`}
          hint={`Avg value ${formatMoney(report.avgValue)}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Proposals by month"
          subtitle="Last twelve months"
          rows={report.byMonth.map((m) => ({ label: `${m.label} ${m.year}`, count: m.count, value: m.value }))}
          empty={empty}
        >
          <MonthColumns months={report.byMonth} />
        </ChartCard>

        <ChartCard
          title="Status breakdown"
          subtitle="Share of all proposals"
          rows={STATUS_ORDER.map((s) => ({
            label: STATUS_PILLS[s].label,
            count: report.totals[s],
            value: statusValues[s],
          }))}
          empty={empty}
        >
          <StatusBreakdown totals={report.totals} values={statusValues} colors={settings?.status_colors} />
        </ChartCard>

        <ChartCard
          title="By project type"
          subtitle="What kind of work comes in"
          rows={report.byProjectType}
          empty={empty}
        >
          <BreakdownBars buckets={report.byProjectType} />
        </ChartCard>

        <ChartCard
          title="By budget range"
          subtitle="As entered on the request"
          rows={report.byBudgetRange}
          empty={empty}
        >
          <BreakdownBars buckets={report.byBudgetRange} />
        </ChartCard>

        {/* Top clients */}
        <section className="bg-gray-100 rounded-2xl p-5 shadow-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-black">Top clients by value</h2>
              <p className="text-xs text-gray-600 mt-0.5">Priced proposals, otherwise budget estimates</p>
            </div>
            <Link href="/team/clients" className="text-xs font-bold text-blue-700 shrink-0">
              All clients →
            </Link>
          </div>
          {report.topClients.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No clients yet.</p>
          ) : (
            <table className="w-full text-sm mt-4">
              <thead>
                <tr className="text-left text-xs text-gray-600">
                  <th className="py-1.5 font-bold w-6">#</th>
                  <th className="py-1.5 font-bold">Client</th>
                  <th className="py-1.5 font-bold text-right">Proposals</th>
                  <th className="py-1.5 font-bold text-right">Total</th>
                  <th className="py-1.5 font-bold text-right">Won</th>
                </tr>
              </thead>
              <tbody>
                {report.topClients.map((c, i) => (
                  <tr key={c.id} className="border-t border-gray-200">
                    <td className="py-2 text-gray-600 font-bold">{i + 1}</td>
                    <td className="py-2">
                      <p className="font-semibold text-black">{c.name}</p>
                      {c.company && <p className="text-xs text-gray-600">{c.company}</p>}
                    </td>
                    <td className="py-2 text-right text-black">{c.proposalCount}</td>
                    <td className="py-2 text-right font-semibold text-black">{formatMoney(c.totalValue)}</td>
                    <td className="py-2 text-right text-black">{formatMoney(c.wonValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Latest arrivals */}
        <section className="bg-gray-100 rounded-2xl p-5 shadow-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-black">Recent proposals</h2>
              <p className="text-xs text-gray-600 mt-0.5">Newest first</p>
            </div>
            <Link href="/team" className="text-xs font-bold text-blue-700 shrink-0">
              All proposals →
            </Link>
          </div>
          {report.recent.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No proposals yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-200">
              {report.recent.map((row) => {
                const color = settings?.status_colors[row.status];
                return (
                  <li key={row.id} className="py-2 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-black truncate">{row.title}</p>
                      <p className="text-xs text-gray-600 truncate">{row.clientName} · {row.created}</p>
                    </div>
                    <span
                      style={color ? pillStyle(color) : undefined}
                      className={`${color ? '' : STATUS_PILLS[row.status].className} font-semibold text-xs px-3 py-1 rounded-full shrink-0`}
                    >
                      {STATUS_PILLS[row.status].label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

    </div>
  );
}
