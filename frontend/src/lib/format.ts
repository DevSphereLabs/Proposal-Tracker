// Shared display formatting so the client portal and the team's proposal
// manager render the same values the same way. Anything shown on both
// dashboards should be formatted here, not inline in a component.
import type { ManagerStatus } from '@/types';

// Short reference form of a submission's UUID, shown wherever an ID appears
// (e.g. "PR-0714A114").
export function proposalRef(id: string): string {
  return `PR-${id.slice(0, 8).toUpperCase()}`;
}

// Status pill label and colors for the manager's status vocabulary. The
// client portal's pills reuse the same palette for the shared states
// (In Progress sky, green for won, red for declined).
export const MANAGER_STATUS_PILLS: Record<
  ManagerStatus,
  { label: string; className: string }
> = {
  new: { label: 'New', className: 'bg-gray-300 text-black' },
  in_progress: { label: 'In Progress', className: 'bg-sky-400 text-white' },
  accepted: { label: 'Accepted', className: 'bg-green-500 text-white' },
  declined: { label: 'Declined', className: 'bg-red-500 text-white' },
};
