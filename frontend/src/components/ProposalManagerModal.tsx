'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, ClipboardIcon, XIcon } from '@/components/icons';
import {
  addTeamNote,
  deleteTeamFile,
  deleteTeamMessage,
  deleteTeamNote,
  deleteTeamProposal,
  downloadTeamFile,
  getTeamProposal,
  sendTeamMessage,
  updateTeamProposal,
  uploadTeamFiles,
} from '@/lib/api';
import { MANAGER_STATUS_PILLS as STATUS_PILLS, pillStyle, proposalRef } from '@/lib/format';
import type { ManagerStatus, TeamProposalDetail } from '@/types';

const TABS = ['OverView', 'Notes', 'Files', 'Messages', 'Templates'] as const;
type Tab = (typeof TABS)[number];

// What the Edit button lets the team change from the OverView tab
interface Draft {
  budget: string;
  timelineWeeks: string;
  projectType: string;
  details: string;
}

// The proposal manager's View popup: one proposal across five tabs —
// overview (with edit), internal notes, files, the client message thread,
// and linked templates. Opened from the proposals table; every change is
// reported up so the table stays in sync.
export default function ProposalManagerModal({
  submissionId,
  statusColors,
  categories,
  budgetRanges,
  onClose,
  onChanged,
  onDeleted,
}: {
  submissionId: string;
  // Settings-driven pill colors and edit-form suggestions (defaults apply
  // when the caller doesn't have them yet)
  statusColors?: Record<string, string>;
  categories?: string[];
  budgetRanges?: string[];
  onClose: () => void;
  onChanged: (detail: TeamProposalDetail) => void;
  onDeleted: (id: string) => void;
}) {
  const [detail, setDetail] = useState<TeamProposalDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('OverView');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // OverView editing
  const [draft, setDraft] = useState<Draft | null>(null);

  // Actions dropdown
  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Per-tab selections and compose boxes
  const [selectedNotes, setSelectedNotes] = useState<ReadonlySet<string>>(new Set());
  const [noteDraft, setNoteDraft] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<ReadonlySet<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedMessages, setSelectedMessages] = useState<ReadonlySet<string>>(new Set());
  const [messageDraft, setMessageDraft] = useState('');

  useEffect(() => {
    let active = true;
    getTeamProposal(submissionId)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch(() => {
        if (active) setLoadError('Could not load this proposal.');
      });
    return () => {
      active = false;
    };
  }, [submissionId]);

  function apply(updated: TeamProposalDetail) {
    setDetail(updated);
    onChanged(updated);
  }

  function toggle(
    set: ReadonlySet<string>,
    update: (next: ReadonlySet<string>) => void,
    id: string
  ) {
    const next = new Set(set);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    update(next);
  }

  // --- OverView: edit and save ---

  function startEditing() {
    if (!detail) return;
    setDraft({
      budget: detail.budget,
      timelineWeeks: String(detail.timelineWeeks),
      projectType: detail.projectType,
      details: detail.details,
    });
    setTab('OverView');
    setError('');
  }

  async function saveEdit() {
    if (!detail || !draft) return;

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
      const updated = await updateTeamProposal(detail.id, {
        budget_range: draft.budget.trim(),
        timeline_weeks: weeks,
        project_type: draft.projectType.trim(),
        description: draft.details.trim(),
      });
      apply(updated);
      setDraft(null);
    } catch {
      setError('Could not save your changes.');
    } finally {
      setBusy(false);
    }
  }

  // --- Actions: status changes and delete ---

  async function setStatus(status: ManagerStatus) {
    if (!detail) return;
    setActionsOpen(false);
    if (status === detail.status) return;

    setError('');
    setBusy(true);
    try {
      apply(await updateTeamProposal(detail.id, { status }));
    } catch {
      setError('Could not update the status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProposal() {
    if (!detail) return;
    setError('');
    setBusy(true);
    try {
      await deleteTeamProposal(detail.id);
      onDeleted(detail.id);
    } catch {
      setError('Could not delete this proposal.');
      setBusy(false);
    }
  }

  // --- Notes ---

  async function handleAddNote() {
    if (!detail || noteDraft.trim() === '') return;
    setError('');
    setBusy(true);
    try {
      const note = await addTeamNote(detail.id, noteDraft.trim());
      setDetail({ ...detail, notes: [...detail.notes, note] });
      setNoteDraft('');
    } catch {
      setError('Could not add the note.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteNotes() {
    if (!detail) return;
    setError('');
    setBusy(true);
    try {
      await Promise.all([...selectedNotes].map((id) => deleteTeamNote(id)));
      setDetail({ ...detail, notes: detail.notes.filter((n) => !selectedNotes.has(n.id)) });
      setSelectedNotes(new Set());
    } catch {
      setError('Could not delete the selected note(s).');
    } finally {
      setBusy(false);
    }
  }

  // --- Files ---

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!detail || picked.length === 0) return;

    setError('');
    setBusy(true);
    try {
      const added = await uploadTeamFiles(detail.id, picked);
      setDetail({ ...detail, files: [...detail.files, ...added] });
    } catch {
      setError('Could not upload the selected file(s).');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadFiles() {
    if (!detail) return;
    setError('');
    setBusy(true);
    try {
      for (const file of detail.files.filter((f) => selectedFiles.has(f.id))) {
        await downloadTeamFile(file.id, file.name);
      }
      setSelectedFiles(new Set());
    } catch {
      setError('Could not download the selected file(s).');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFiles() {
    if (!detail) return;
    setError('');
    setBusy(true);
    try {
      await Promise.all([...selectedFiles].map((id) => deleteTeamFile(id)));
      setDetail({ ...detail, files: detail.files.filter((f) => !selectedFiles.has(f.id)) });
      setSelectedFiles(new Set());
    } catch {
      setError('Could not delete the selected file(s).');
    } finally {
      setBusy(false);
    }
  }

  // --- Messages ---

  async function handleSendMessage() {
    if (!detail || messageDraft.trim() === '') return;
    setError('');
    setBusy(true);
    try {
      const message = await sendTeamMessage(detail.id, messageDraft.trim());
      setDetail({ ...detail, messages: [...detail.messages, message] });
      setMessageDraft('');
    } catch {
      setError('Could not send the message.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMessages() {
    if (!detail) return;
    setError('');
    setBusy(true);
    try {
      await Promise.all([...selectedMessages].map((id) => deleteTeamMessage(id)));
      setDetail({
        ...detail,
        messages: detail.messages.filter((m) => !selectedMessages.has(m.id)),
      });
      setSelectedMessages(new Set());
    } catch {
      setError('Could not delete the selected message(s).');
    } finally {
      setBusy(false);
    }
  }

  const clientInitials = detail
    ? detail.client.name
        .split(/\s+/)
        .map((part) => part[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'CL'
    : 'CL';

  const pill = detail ? STATUS_PILLS[detail.status] : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
      <div className="bg-gray-200 rounded-2xl max-w-3xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">

        {/* Close button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-md bg-red-500 border border-red-700 flex items-center justify-center"
          >
            <XIcon className="w-4 h-4 text-white" />
          </button>
        </div>

        {loadError && <p className="text-red-600 py-8 text-center">{loadError}</p>}
        {!detail && !loadError && (
          <p className="text-gray-600 py-8 text-center">Loading proposal...</p>
        )}

        {detail && pill && (
          <>
            {/* Header: title, id, edit, actions, status */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-black">{detail.title}</h2>
                <p className="text-sm text-gray-600 mt-1">#{proposalRef(detail.id)}</p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={startEditing}
                    disabled={busy}
                    className="bg-white text-black font-semibold text-sm px-5 py-1.5 rounded-md border border-gray-300"
                  >
                    Edit
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen((prev) => !prev);
                        setConfirmingDelete(false);
                      }}
                      disabled={busy}
                      className="bg-white text-black font-semibold text-sm px-4 py-1.5 rounded-md border border-gray-300 flex items-center gap-2"
                    >
                      Actions
                      <span className="bg-blue-950 rounded p-0.5">
                        <ChevronDownIcon className="w-3 h-3 text-white" />
                      </span>
                    </button>
                    {actionsOpen && (
                      <div className="absolute right-0 mt-1 bg-white rounded-md shadow-lg border border-gray-300 py-1 w-48 z-10">
                        {(Object.keys(STATUS_PILLS) as ManagerStatus[])
                          .filter((status) => status !== detail.status)
                          .map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => setStatus(status)}
                              className="block w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-100"
                            >
                              Mark as {STATUS_PILLS[status].label}
                            </button>
                          ))}
                        <hr className="border-gray-200 my-1" />
                        {confirmingDelete ? (
                          <button
                            type="button"
                            onClick={handleDeleteProposal}
                            className="block w-full text-left px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                          >
                            Confirm delete?
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingDelete(true)}
                            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            Delete Proposal
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <span
                  style={detail && statusColors?.[detail.status] ? pillStyle(statusColors[detail.status]) : undefined}
                  className={`${detail && statusColors?.[detail.status] ? '' : pill.className} font-semibold text-xs px-4 py-1.5 rounded-full`}
                >
                  {pill.label}
                </span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 border-b border-gray-400 mt-4">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`pb-2 font-bold text-sm ${
                    tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-black'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

            {/* --- OverView tab --- */}
            {tab === 'OverView' && (
              <div className="mt-4">
                {draft ? (
                  <>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                      <div>
                        <p className="font-bold text-black text-sm">Project Budget</p>
                        <input
                          type="text"
                          value={draft.budget}
                          onChange={(e) => setDraft({ ...draft, budget: e.target.value })}
                          disabled={busy}
                          list="budget-suggestions"
                          className="w-full mt-1 rounded-md bg-white text-black text-sm px-3 py-2 border border-gray-300"
                        />
                        <datalist id="budget-suggestions">
                          {(budgetRanges ?? []).map((range) => (
                            <option key={range} value={range} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <p className="font-bold text-black text-sm">Time Line (weeks)</p>
                        <input
                          type="number"
                          min={1}
                          value={draft.timelineWeeks}
                          onChange={(e) => setDraft({ ...draft, timelineWeeks: e.target.value })}
                          disabled={busy}
                          className="w-full mt-1 rounded-md bg-white text-black text-sm px-3 py-2 border border-gray-300"
                        />
                      </div>
                      <div>
                        <p className="font-bold text-black text-sm">Project Type</p>
                        <input
                          type="text"
                          value={draft.projectType}
                          onChange={(e) => setDraft({ ...draft, projectType: e.target.value })}
                          disabled={busy}
                          list="category-suggestions"
                          className="w-full mt-1 rounded-md bg-white text-black text-sm px-3 py-2 border border-gray-300"
                        />
                        <datalist id="category-suggestions">
                          {(categories ?? []).map((category) => (
                            <option key={category} value={category} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                    <div className="mt-4">
                      <p className="font-bold text-black text-sm">Project Summary</p>
                      <textarea
                        value={draft.details}
                        onChange={(e) => setDraft({ ...draft, details: e.target.value })}
                        disabled={busy}
                        rows={4}
                        className="w-full mt-2 rounded-md bg-white text-gray-700 text-sm p-4 border border-gray-300"
                      />
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={busy}
                        className="bg-blue-950 text-white font-semibold text-sm px-6 py-2 rounded-full disabled:opacity-60"
                      >
                        {busy ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraft(null)}
                        disabled={busy}
                        className="bg-gray-100 text-black font-semibold text-sm px-6 py-2 rounded-full disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                      <div>
                        <p className="font-bold text-black text-sm">Client</p>
                        {detail.client.company && (
                          <p className="text-black text-sm mt-1">{detail.client.company}</p>
                        )}
                        <p className="text-black text-sm">{detail.client.name}</p>
                        <a
                          href={`mailto:${detail.client.email}`}
                          className="text-blue-600 text-sm underline break-all"
                        >
                          {detail.client.email}
                        </a>
                        {detail.client.phone && (
                          <p className="text-black text-sm">{detail.client.phone}</p>
                        )}
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="font-bold text-black text-sm">Project Budget</p>
                          <p className="text-black text-sm mt-1">{detail.budget}</p>
                        </div>
                        <div>
                          <p className="font-bold text-black text-sm">Project Type</p>
                          <p className="text-black text-sm mt-1">{detail.projectType}</p>
                        </div>
                      </div>
                      <div>
                        <p className="font-bold text-black text-sm">Time Line</p>
                        <p className="text-black text-sm mt-1">{detail.timelineWeeks} Weeks</p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="font-bold text-black text-sm">Project Summary</p>
                      <p className="bg-gray-100 text-gray-700 text-sm rounded-md p-4 mt-2">
                        {detail.details}
                      </p>
                    </div>

                    <div className="flex justify-between mt-6 text-sm font-bold text-black">
                      <span>Created: {detail.created}</span>
                      <span>Updated: {detail.updated}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* --- Notes tab --- */}
            {tab === 'Notes' && (
              <div className="mt-4">
                <div className="bg-blue-600 text-white text-sm font-bold rounded-md px-3 py-2 flex items-center gap-3">
                  <span className="w-4" />
                  <span className="w-10">Sender</span>
                  <span className="flex-1 text-center">Note</span>
                  <span className="w-16 text-right">Posted</span>
                </div>
                <div className="space-y-2 mt-2 max-h-56 overflow-y-auto">
                  {detail.notes.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">
                      No internal notes yet.
                    </p>
                  ) : (
                    detail.notes.map((note) => (
                      <div
                        key={note.id}
                        className="bg-sky-300 rounded-lg px-3 py-2 flex items-center gap-3"
                      >
                        <span className="w-4 flex justify-center">
                          <input
                            type="checkbox"
                            checked={selectedNotes.has(note.id)}
                            onChange={() => toggle(selectedNotes, setSelectedNotes, note.id)}
                            aria-label="Select note"
                          />
                        </span>
                        <span className="w-10 flex justify-center">
                          <span className="w-9 h-9 rounded-full bg-blue-950 flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-xs">{note.sender}</span>
                          </span>
                        </span>
                        <p className="flex-1 text-center text-xs font-bold text-black">
                          {note.text}
                        </p>
                        <span className="w-16 text-right text-xs font-bold text-black">
                          {note.posted}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex items-center justify-between mt-4">
                  <h3 className="font-bold text-gray-700 text-lg">Note</h3>
                  <button
                    type="button"
                    onClick={handleDeleteNotes}
                    disabled={selectedNotes.size === 0 || busy}
                    className="bg-red-500 text-white font-semibold text-sm py-1.5 px-6 rounded-full disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add an internal note (clients never see these)..."
                  className="w-full bg-gray-100 rounded-md p-3 mt-2 text-sm text-black resize-none"
                />
                <div className="flex justify-end mt-3">
                  <button
                    type="button"
                    onClick={handleAddNote}
                    disabled={noteDraft.trim() === '' || busy}
                    className="bg-black text-white font-semibold text-sm py-1.5 px-8 rounded-full disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* --- Files tab --- */}
            {tab === 'Files' && (
              <div className="mt-4">
                <div className="flex justify-end mb-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="bg-blue-950 text-white font-semibold text-sm px-6 py-1.5 rounded-full disabled:opacity-50"
                  >
                    Upload
                  </button>
                </div>
                <div className="bg-blue-600 text-white text-sm font-bold rounded-md px-3 py-2 grid grid-cols-[1rem_1fr_5rem_5rem_6rem] gap-3 items-center">
                  <span />
                  <span>File Name</span>
                  <span>Type</span>
                  <span>Size</span>
                  <span className="text-right">Uploaded</span>
                </div>
                <div className="space-y-1 mt-1 max-h-56 overflow-y-auto">
                  {detail.files.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">No files yet.</p>
                  ) : (
                    detail.files.map((file) => (
                      <div
                        key={file.id}
                        className="bg-white rounded-md px-3 py-2 grid grid-cols-[1rem_1fr_5rem_5rem_6rem] gap-3 items-center text-sm text-black"
                      >
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.id)}
                          onChange={() => toggle(selectedFiles, setSelectedFiles, file.id)}
                          aria-label={`Select ${file.name}`}
                        />
                        <span className="font-semibold truncate">{file.name}</span>
                        <span>{file.type}</span>
                        <span>{file.size}</span>
                        <span className="text-right">{file.uploaded}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={handleDownloadFiles}
                    disabled={selectedFiles.size === 0 || busy}
                    className="bg-blue-950 text-white font-semibold text-sm px-6 py-1.5 rounded-full disabled:opacity-50"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteFiles}
                    disabled={selectedFiles.size === 0 || busy}
                    className="bg-red-500 text-white font-semibold text-sm px-6 py-1.5 rounded-full disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            {/* --- Messages tab --- */}
            {tab === 'Messages' && (
              <div className="mt-4">
                <div className="bg-blue-600 text-white text-sm font-bold rounded-md px-3 py-2 flex items-center gap-3">
                  <span className="w-4" />
                  <span className="w-10">Sender</span>
                  <span className="flex-1 text-center">Message</span>
                  <span className="w-16 text-right">Sent</span>
                </div>
                <div className="space-y-2 mt-2 max-h-56 overflow-y-auto">
                  {detail.messages.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">No messages yet.</p>
                  ) : (
                    detail.messages.map((message) => {
                      const isTeam = message.from === 'team';
                      return (
                        <div
                          key={message.id}
                          className={`${
                            isTeam ? 'bg-sky-300' : 'bg-blue-500'
                          } rounded-lg px-3 py-2 flex items-center gap-3`}
                        >
                          {/* Only the team's side of the thread is deletable */}
                          <span className="w-4 flex justify-center">
                            {isTeam && (
                              <input
                                type="checkbox"
                                checked={selectedMessages.has(message.id)}
                                onChange={() =>
                                  toggle(selectedMessages, setSelectedMessages, message.id)
                                }
                                aria-label="Select message"
                              />
                            )}
                          </span>
                          <span className="w-10 flex justify-center">
                            <span className="w-9 h-9 rounded-full bg-blue-950 flex items-center justify-center shrink-0">
                              <span className="text-white font-bold text-xs">
                                {isTeam ? 'TQ' : clientInitials}
                              </span>
                            </span>
                          </span>
                          <p className="flex-1 text-center text-xs font-bold text-black">
                            {message.text}
                          </p>
                          <span className="w-16 text-right text-xs font-bold text-black">
                            {message.sent}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex items-center justify-between mt-4">
                  <h3 className="font-bold text-gray-700 text-lg">Message</h3>
                  <button
                    type="button"
                    onClick={handleDeleteMessages}
                    disabled={selectedMessages.size === 0 || busy}
                    className="bg-red-500 text-white font-semibold text-sm py-1.5 px-6 rounded-full disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={messageDraft}
                  onChange={(e) => setMessageDraft(e.target.value)}
                  placeholder="Type a message to the client..."
                  className="w-full bg-gray-100 rounded-md p-3 mt-2 text-sm text-black resize-none"
                />
                <div className="flex justify-end mt-3">
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={messageDraft.trim() === '' || busy}
                    className="bg-black text-white font-semibold text-sm py-1.5 px-8 rounded-full disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}

            {/* --- Templates tab --- */}
            {tab === 'Templates' && (
              <div className="mt-4 py-10 text-center">
                <ClipboardIcon className="w-10 h-10 text-gray-400 mx-auto" />
                <p className="text-gray-600 font-semibold mt-3">No templates linked yet.</p>
                <p className="text-gray-500 text-sm mt-1">
                  Template management is coming soon.
                </p>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
