// Shared display formatting so the client portal and the team's proposal
// manager render the same values the same way. Anything shown on both
// dashboards should be formatted here, not inline in a component.
import type { ManagerStatus } from '@/types';

// Short reference form of a submission's UUID, shown wherever an ID appears
// (e.g. "PR-0714A114").
export function proposalRef(id: string): string {
  return `PR-${id.slice(0, 8).toUpperCase()}`;
}

// Whole-dollar display for proposal values and totals (e.g. "$12,000").
const MONEY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function formatMoney(value: number): string {
  return MONEY.format(value);
}

// Status pill label and colors for the manager's status vocabulary. The
// className palette is the default; when the team picks custom colors on
// the Settings page, pills render those via pillStyle() instead.
export const MANAGER_STATUS_PILLS: Record<
  ManagerStatus,
  { label: string; className: string }
> = {
  new: { label: 'New', className: 'bg-gray-300 text-black' },
  in_progress: { label: 'In Progress', className: 'bg-sky-400 text-white' },
  accepted: { label: 'Accepted', className: 'bg-green-500 text-white' },
  declined: { label: 'Declined', className: 'bg-red-500 text-white' },
};

// Inline pill styling for a settings-picked hex color, with black or white
// text chosen for contrast against it.
export function pillStyle(hex: string): { backgroundColor: string; color: string } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return { backgroundColor: hex, color: luminance > 150 ? '#000000' : '#ffffff' };
}
