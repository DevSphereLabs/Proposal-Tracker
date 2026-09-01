'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProfileMenu from '@/components/ProfileMenu';
import { PencilIcon, XIcon } from '@/components/icons';
import {
  ApiError,
  createTeamTemplate,
  deleteTeamTemplate,
  getTeamProposal,
  getTeamProposals,
  getTeamSettings,
  getTeamTemplates,
  updateTeamTemplate,
} from '@/lib/api';
import { proposalRef } from '@/lib/format';
import type { TeamProposalRow, TeamSettings, TeamTemplate } from '@/types';

// What the editor holds — for a new template, or one being edited in place
interface Draft {
  name: string;
  projectType: string;
  budget: string;
  timelineWeeks: string;
  details: string;
}

const EMPTY: Draft = { name: '', projectType: '', budget: '', timelineWeeks: '', details: '' };

const INPUT =
  'w-full mt-1 rounded-md bg-white border border-gray-300 text-black text-sm px-3 py-2 disabled:opacity-60';

function fromTemplate(t: TeamTemplate): Draft {
  return {
    name: t.name,
    projectType: t.projectType,
    budget: t.budget,
    timelineWeeks: String(t.timelineWeeks),
    details: t.details,
  };
}

function validate(d: Draft): string {
  if (!d.name.trim()) return 'Name is required.';
  if (!d.projectType.trim() || !d.budget.trim() || !d.details.trim()) {
    return 'Project type, budget, and details are required.';
  }
  const weeks = parseInt(d.timelineWeeks, 10);
  if (!Number.isFinite(weeks) || weeks < 1) return 'Time line must be at least 1 week.';
  return '';
}

function toPayload(d: Draft) {
  return {
    name: d.name.trim(),
    project_type: d.projectType.trim(),
    budget_range: d.budget.trim(),
    timeline_weeks: parseInt(d.timelineWeeks, 10),
    description: d.details.trim(),
  };
}

// The template fields, shared by the new-template editor and in-place edits.
// Project type and budget suggest the lists from Settings but accept anything.
function TemplateFields({
  draft,
  onChange,
  disabled,
  settings,
  idPrefix,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  disabled: boolean;
  settings: TeamSettings | null;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="font-bold text-black text-sm">Name</p>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          disabled={disabled}
          placeholder="e.g. Standard e-commerce build"
          className={INPUT}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <p className="font-bold text-black text-sm">Project Type</p>
          <input
            type="text"
            list={`${idPrefix}-types`}
            value={draft.projectType}
            onChange={(e) => onChange({ ...draft, projectType: e.target.value })}
            disabled={disabled}
            className={INPUT}
          />
          <datalist id={`${idPrefix}-types`}>
            {(settings?.categories ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <p className="font-bold text-black text-sm">Budget</p>
          <input
            type="text"
            list={`${idPrefix}-budgets`}
            value={draft.budget}
            onChange={(e) => onChange({ ...draft, budget: e.target.value })}
            disabled={disabled}
            className={INPUT}
          />
          <datalist id={`${idPrefix}-budgets`}>
            {(settings?.budget_ranges ?? []).map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <div>
          <p className="font-bold text-black text-sm">Time Line (weeks)</p>
          <input
            type="number"
            min={1}
            value={draft.timelineWeeks}
            onChange={(e) => onChange({ ...draft, timelineWeeks: e.target.value })}
            disabled={disabled}
            className={INPUT}
          />
        </div>
      </div>
      <div>
        <p className="font-bold text-black text-sm">Project Details</p>
        <textarea
          rows={4}
          value={draft.details}
          onChange={(e) => onChange({ ...draft, details: e.target.value })}
          disabled={disabled}
          className={`${INPUT} resize-none`}
        />
      </div>
    </div>
  );
}

// Templates: reusable starting points for proposals. Make one from a
// proposal the team has already worked on (pick it and the fields fill in)
// or from scratch; edit or delete existing ones. Applying a template to a
// proposal happens on the proposal's Templates tab.
export default function TeamTemplatesPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<TeamTemplate[]>([]);
  const [proposals, setProposals] = useState<TeamProposalRow[]>([]);
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // New template editor: the proposal it starts from ('' = blank) and the fields
  const [sourceId, setSourceId] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [note, setNote] = useState('');

  // An existing template being edited in place, and one awaiting delete confirmation
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([getTeamTemplates(), getTeamProposals(), getTeamSettings()])
      .then(([list, rows, payload]) => {
        if (!active) return;
        setTemplates(list);
        setProposals(rows.sort((a, b) => b.createdSort.localeCompare(a.createdSort)));
        setSettings(payload.settings);
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace('/login');
          return;
        }
        if (active) setError('Could not load templates. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router]);

  // Picking a proposal fills the editor from it
  async function pickSource(id: string) {
    setSourceId(id);
    setNote('');
    setError('');
    if (!id) {
      setDraft(EMPTY);
      return;
    }
    setBusy(true);
    try {
      const d = await getTeamProposal(id);
      setDraft({
        name: `${d.title} template`,
        projectType: d.projectType,
        budget: d.budget,
        timelineWeeks: String(d.timelineWeeks),
        details: d.details,
      });
    } catch {
      setError('Could not load that proposal.');
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const problem = validate(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setNote('');
    setBusy(true);
    try {
      const created = await createTeamTemplate({
        ...toPayload(draft),
        ...(sourceId ? { source_submission_id: sourceId } : {}),
      });
      setTemplates((prev) => [created, ...prev]);
      setDraft(EMPTY);
      setSourceId('');
      setNote(`Saved "${created.name}".`);
    } catch {
      setError('Could not save the template.');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(t: TeamTemplate) {
    setEditingId(t.id);
    setEditDraft(fromTemplate(t));
    setConfirmingDelete(null);
    setError('');
  }

  async function saveEdit() {
    if (!editingId) return;
    const problem = validate(editDraft);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setBusy(true);
    try {
      const updated = await updateTeamTemplate(editingId, toPayload(editDraft));
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingId(null);
    } catch {
      setError('Could not save your changes.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError('');
    setBusy(true);
    try {
      await deleteTeamTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) setEditingId(null);
    } catch {
      setError('Could not delete the template.');
    } finally {
      setBusy(false);
      setConfirmingDelete(null);
    }
  }

  if (loading) {
    return <p className="text-gray-600 bg-gray-100 rounded-2xl p-8">Loading templates...</p>;
  }

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="bg-gray-100 rounded-2xl px-6 py-4 flex items-center justify-between shadow-md">
        <h1 className="text-2xl font-bold text-black tracking-wide">TEMPLATES</h1>
        <ProfileMenu settingsHref="/team/settings" />
      </div>

      {/* New template */}
      <section className="bg-gray-100 rounded-2xl p-6 shadow-md">
        <h2 className="font-bold text-black">New template</h2>
        <p className="text-xs text-gray-600 mt-0.5">
          Start from a proposal you&apos;ve already worked on and the fields fill in, or write
          one from scratch. Apply templates from any proposal&apos;s Templates tab.
        </p>

        <div className="mt-4">
          <p className="font-bold text-black text-sm">Start from</p>
          <select
            value={sourceId}
            onChange={(e) => pickSource(e.target.value)}
            disabled={busy}
            className={`${INPUT} sm:w-96`}
          >
            <option value="">Blank template</option>
            {proposals.map((row) => (
              <option key={row.id} value={row.id}>
                {proposalRef(row.id)} · {row.title} · {row.clientName}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <TemplateFields
            draft={draft}
            onChange={setDraft}
            disabled={busy}
            settings={settings}
            idPrefix="new"
          />
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          {note && <span className="text-green-700 text-sm font-semibold">{note}</span>}
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="bg-black text-white font-bold text-sm px-8 py-2 rounded-full disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </section>

      {error && <p className="text-red-600 text-sm px-2">{error}</p>}

      {/* Saved templates */}
      <div className="flex items-baseline justify-between px-2">
        <h2 className="font-bold text-black">
          Saved templates <span className="text-gray-500 font-semibold">{templates.length}</span>
        </h2>
      </div>

      {templates.length === 0 ? (
        <p className="text-gray-600 bg-gray-100 rounded-2xl p-8 text-center">
          No templates yet. Save one above, or from the Templates tab of any proposal.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {templates.map((t) =>
            editingId === t.id ? (
              <section key={t.id} className="bg-gray-100 rounded-2xl p-5 shadow-md border-2 border-blue-600">
                <TemplateFields
                  draft={editDraft}
                  onChange={setEditDraft}
                  disabled={busy}
                  settings={settings}
                  idPrefix={`edit-${t.id}`}
                />
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={busy}
                    className="bg-black text-white font-semibold text-sm px-6 py-1.5 rounded-full disabled:opacity-50"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    disabled={busy}
                    className="bg-white border border-gray-300 text-black font-semibold text-sm px-6 py-1.5 rounded-full disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </section>
            ) : (
              <section key={t.id} className="bg-gray-100 rounded-2xl p-5 shadow-md flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-black truncate">{t.name}</h3>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {t.sourceTitle
                        ? `From ${t.sourceTitle}${t.sourceId ? ` (${proposalRef(t.sourceId)})` : ''}`
                        : 'Written from scratch'}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      disabled={busy}
                      aria-label={`Edit ${t.name}`}
                      className="w-8 h-8 rounded-full bg-white border border-gray-300 inline-flex items-center justify-center disabled:opacity-50"
                    >
                      <PencilIcon className="w-3.5 h-3.5 text-black" />
                    </button>
                    {confirmingDelete === t.id ? (
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        disabled={busy}
                        className="bg-red-600 text-white font-bold text-xs px-3 rounded-full disabled:opacity-50"
                      >
                        Delete?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(t.id)}
                        disabled={busy}
                        aria-label={`Delete ${t.name}`}
                        className="w-8 h-8 rounded-full bg-white border border-gray-300 inline-flex items-center justify-center disabled:opacity-50"
                      >
                        <XIcon className="w-3.5 h-3.5 text-red-600" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {[t.projectType, t.budget, `${t.timelineWeeks} wks`].map((chip) => (
                    <span
                      key={chip}
                      className="bg-white border border-gray-300 rounded-full px-3 py-1 text-xs font-semibold text-black"
                    >
                      {chip}
                    </span>
                  ))}
                </div>

                <p className="bg-white text-gray-700 text-sm rounded-md p-3 mt-3 line-clamp-3 flex-1">
                  {t.details}
                </p>

                <p className="text-xs text-gray-500 mt-3">
                  by {t.createdBy} · updated {t.updated}
                </p>
              </section>
            )
          )}
        </div>
      )}

    </div>
  );
}
