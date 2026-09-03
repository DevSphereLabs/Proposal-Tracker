'use client';

import { useState } from 'react';
import { XIcon } from '@/components/icons';
import { deleteMessage, getSessionUser, sendMessage } from '@/lib/api';
import { usePortalTheme } from '@/lib/theme';
import { proposalRef } from '@/lib/format';
import type { Proposal, ProposalMessage } from '@/types';

// Initials on the message avatars: the team shows as "TQ"; the client's come
// from the signed-in session.
const TEAM_INITIALS = 'TQ';

// Message thread popup for one proposal, opened from the card's "Message"
// button. Connects the client with the team; messages are persisted by the
// backend. Clients may only delete messages they sent themselves.
export default function MessageModal({
  proposal,
  onClose,
}: {
  proposal: Proposal;
  onClose: () => void;
}) {
  const session = getSessionUser();
  const clientInitials = session
    ? `${session.firstName[0] ?? ''}${session.lastName[0] ?? ''}`.toUpperCase()
    : 'ME';

  const theme = usePortalTheme();
  const [messages, setMessages] = useState<ProposalMessage[]>(proposal.messages);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Only the client's own messages are selectable (deletable)
  const ownMessages = messages.filter((m) => m.from === 'client');
  const allSelected = ownMessages.length > 0 && selected.size === ownMessages.length;

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
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ownMessages.map((m) => m.id)));
  }

  async function handleDelete() {
    setError('');
    setBusy(true);
    try {
      const ids = [...selected];
      await Promise.all(ids.map((id) => deleteMessage(id)));
      setMessages((prev) => prev.filter((m) => !selected.has(m.id)));
      setSelected(new Set());
    } catch {
      setError('Could not delete the selected message(s).');
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    const text = draft.trim();
    if (text === '') return;

    setError('');
    setBusy(true);
    try {
      const created = await sendMessage(proposal.id, text);
      setMessages((prev) => [...prev, created]);
      setDraft('');
    } catch {
      setError('Could not send your message.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
      <div className="bg-gray-200 rounded-2xl max-w-2xl w-full p-6 shadow-xl">

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

        {/* Which proposal this thread belongs to */}
        <h2 className="text-2xl font-bold text-black">{proposal.title}</h2>
        <p className="text-sm text-gray-600 mt-1">#{proposalRef(proposal.id)}</p>

        <hr className="border-gray-300 my-4" />

        {/* Thread header row */}
        <div className={`${theme.tabActive} text-white text-sm font-bold rounded-md px-3 py-2 flex items-center gap-3`}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all your messages"
            disabled={ownMessages.length === 0}
          />
          <span className="w-10">Sender</span>
          <span className="flex-1 text-center">Message</span>
          <span className="w-16 text-right">Sent</span>
        </div>

        {/* Message history */}
        <div className="space-y-2 mt-2 max-h-64 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No messages yet.</p>
          ) : (
            messages.map((message) => {
              const isClient = message.from === 'client';
              return (
                <div
                  key={message.id}
                  className={`${
                    isClient ? theme.bubble : 'bg-sky-300'
                  } rounded-lg px-3 py-2 flex items-center gap-3`}
                >
                  {/* Only own messages can be selected for deletion */}
                  <span className="w-4 flex justify-center">
                    {isClient && (
                      <input
                        type="checkbox"
                        checked={selected.has(message.id)}
                        onChange={() => toggleSelected(message.id)}
                        aria-label="Select message"
                      />
                    )}
                  </span>
                  <span className="w-10 flex justify-center">
                    <span className={`w-9 h-9 rounded-full ${theme.button} flex items-center justify-center shrink-0`}>
                      <span className="text-white font-bold text-xs">
                        {isClient ? clientInitials : TEAM_INITIALS}
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

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

        {/* Compose box, with Delete acting on the checked messages */}
        <div className="flex items-center justify-between mt-4">
          <h3 className="font-bold text-gray-700 text-lg">Message</h3>
          <button
            type="button"
            onClick={handleDelete}
            disabled={selected.size === 0 || busy}
            className="bg-red-500 text-white font-semibold text-sm py-1.5 px-6 rounded-full disabled:opacity-50"
          >
            Delete
          </button>
        </div>
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message to the team..."
          className="w-full bg-gray-100 rounded-md p-3 mt-2 text-sm text-black resize-none"
        />
        <div className="flex justify-end mt-3">
          <button
            type="button"
            onClick={handleSend}
            disabled={draft.trim() === '' || busy}
            className="bg-black text-white font-semibold text-sm py-1.5 px-8 rounded-full disabled:opacity-50"
          >
            Send
          </button>
        </div>

      </div>
    </div>
  );
}
