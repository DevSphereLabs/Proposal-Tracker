'use client';

import { useState } from 'react';
import FileManager from '@/components/FileManager';
import MessageModal from '@/components/MessageModal';
import { ChatIcon, CircleDotIcon, EyeIcon, PencilIcon } from '@/components/icons';
import { updateProposal } from '@/lib/api';
import { pillStyle, proposalRef } from '@/lib/format';
import type { PortalStatusColors, Proposal, ProposalStatus } from '@/types';

const STATUS_STYLES: Record<ProposalStatus, { label: string; className: string }> = {
  active: { label: 'In Progress', className: 'bg-sky-400' },
  completed: { label: 'Completed', className: 'bg-green-500' },
  declined: { label: 'Declined', className: 'bg-red-500' },
};

// One read-only field inside the expanded proposal details
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-bold text-black">{label}</p>
      <p className="text-black text-sm mt-0.5">{value}</p>
    </div>
  );
}

// What the client can change about their proposal, held while the details
// section is in edit mode. Timeline is edited as a number of weeks.
interface ProposalDraft {
  budget: string;
  timelineWeeks: string;
  projectType: string;
  details: string;
}

// One proposal on the client portal: a summary header that's always visible,
// and a details panel (project info plus the file manager) that "View Details"
// expands and collapses so several projects fit on the page. Active proposals
// get a single Edit section covering budget, timeline, type, and details.
export default function ProposalCard({
  proposal,
  statusColors,
  defaultExpanded = false,
  onUpdated,
}: {
  proposal: Proposal;
  // Pill colors from the team's settings; the default palette applies
  // when they haven't loaded
  statusColors?: PortalStatusColors | null;
  defaultExpanded?: boolean;
  onUpdated: (proposal: Proposal) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [messageOpen, setMessageOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = STATUS_STYLES[proposal.status];

  function startEditing() {
    setDraft({
      budget: proposal.budget,
      timelineWeeks: String(parseInt(proposal.timeline, 10) || ''),
      projectType: proposal.projectType,
      details: proposal.details,
    });
    setError('');
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError('');
  }

  async function save() {
    if (!draft) return;

    const weeks = parseInt(draft.timelineWeeks, 10);
    if (!draft.budget.trim() || !draft.projectType.trim() || !draft.details.trim()) {
      setError('All fields are required.');
      return;
    }
    if (!Number.isFinite(weeks) || weeks < 1) {
      setError('Time line must be at least 1 week.');
      return;
    }

    setError('');
    setBusy(true);
    try {
      const updated = await updateProposal(proposal.id, {
        budget_range: draft.budget.trim(),
        timeline_weeks: weeks,
        project_type: draft.projectType.trim(),
        description: draft.details.trim(),
      });
      onUpdated(updated);
      setEditing(false);
    } catch {
      setError('Could not save your changes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl overflow-hidden shadow-md">

      {/* Summary header: always visible */}
      <div className="bg-gray-100 p-6 flex items-start justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-black">{proposal.title}</h2>
          <p className="text-sm text-gray-600 mt-1">#{proposalRef(proposal.id)}</p>
          <p className="text-sm text-black mt-6">
            Last updated: {proposal.lastUpdated}
          </p>
        </div>

        <div className="flex flex-col gap-2 w-40 shrink-0">
          <span
            style={statusColors ? pillStyle(statusColors[proposal.status]) : undefined}
            className={`${statusColors ? '' : `${status.className} text-white`} font-semibold text-sm py-1.5 rounded-full flex items-center justify-center gap-2`}
          >
            <CircleDotIcon className="w-4 h-4" /> {status.label}
          </span>
          <button
            type="button"
            onClick={() => setMessageOpen(true)}
            className="bg-gray-300 text-black font-semibold text-sm py-1.5 rounded-full flex items-center justify-center gap-2"
          >
            <ChatIcon className="w-4 h-4" /> Message
          </button>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="bg-gray-300 text-black font-semibold text-sm py-1.5 rounded-full flex items-center justify-center gap-2"
          >
            <EyeIcon className="w-4 h-4" /> {expanded ? 'Hide Details' : 'View Details'}
          </button>
        </div>
      </div>

      {/* Details panel: project info and the file manager */}
      {expanded && (
        <div className="bg-gradient-to-b from-blue-400 to-blue-300 p-6">

          {/* Only active proposals are editable; completed and declined ones
              are a record of what was agreed */}
          {proposal.status === 'active' && !editing && (
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={startEditing}
                className="bg-blue-950 text-white font-semibold text-sm px-4 py-1.5 rounded-full flex items-center gap-2"
              >
                <PencilIcon className="w-3.5 h-3.5" /> Edit Details
              </button>
            </div>
          )}

          {editing && draft ? (
            <>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <p className="font-bold text-black">Budget</p>
                  <input
                    type="text"
                    value={draft.budget}
                    onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
                    disabled={busy}
                    className="w-full mt-1 rounded-md bg-white text-black text-sm px-3 py-2"
                  />
                </div>
                <div>
                  <p className="font-bold text-black">Time Line (weeks)</p>
                  <input
                    type="number"
                    min={1}
                    value={draft.timelineWeeks}
                    onChange={(e) => setDraft({ ...draft, timelineWeeks: e.target.value })}
                    disabled={busy}
                    className="w-full mt-1 rounded-md bg-white text-black text-sm px-3 py-2"
                  />
                </div>
                <div>
                  <p className="font-bold text-black">Project Type</p>
                  <input
                    type="text"
                    value={draft.projectType}
                    onChange={(e) => setDraft({ ...draft, projectType: e.target.value })}
                    disabled={busy}
                    className="w-full mt-1 rounded-md bg-white text-black text-sm px-3 py-2"
                  />
                </div>
              </div>

              <div className="mt-4">
                <p className="font-bold text-black">Project Details</p>
                <textarea
                  value={draft.details}
                  onChange={(e) => setDraft({ ...draft, details: e.target.value })}
                  disabled={busy}
                  rows={4}
                  className="w-full mt-2 rounded-md bg-white text-gray-700 text-sm p-4"
                />
              </div>

              {error && <p className="text-sm font-semibold text-red-900 mt-2">{error}</p>}

              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="bg-blue-950 text-white font-semibold text-sm px-6 py-2 rounded-full disabled:opacity-60"
                >
                  {busy ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={busy}
                  className="bg-gray-200 text-black font-semibold text-sm px-6 py-2 rounded-full disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Budget" value={proposal.budget} />
                <Field label="Time Line" value={proposal.timeline} />
                <Field label="Project Type" value={proposal.projectType} />
              </div>

              <div className="mt-4">
                <p className="font-bold text-black">Project Details</p>
                <p className="bg-gray-100 text-gray-700 text-sm rounded-md p-4 mt-2">
                  {proposal.details}
                </p>
              </div>
            </>
          )}

          <FileManager proposalId={proposal.id} initialFiles={proposal.files} />
        </div>
      )}

      {/* Message thread popup */}
      {messageOpen && (
        <MessageModal proposal={proposal} onClose={() => setMessageOpen(false)} />
      )}

    </section>
  );
}
