'use client';

import { useState } from 'react';
import { PencilIcon, UserIcon } from '@/components/icons';
import { updateMe } from '@/lib/api';
import type { ClientProfile } from '@/types';

// Right-hand card on the client portal showing the signed-in client's contact
// info. One Edit button switches the whole card into a form; Save Changes
// persists it through the portal API. Email is shown but never editable —
// it's the login identity.
export default function MyDetailsCard({
  client,
  onUpdated,
}: {
  client: ClientProfile;
  onUpdated: (client: ClientProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(client);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function startEditing() {
    setDraft(client);
    setError('');
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError('');
  }

  async function save() {
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError('First and last name are required.');
      return;
    }

    setError('');
    setBusy(true);
    try {
      const updated = await updateMe({
        first_name: draft.firstName.trim(),
        last_name: draft.lastName.trim(),
        phone: draft.phone.trim(),
        company_name: draft.companyName.trim(),
      });
      onUpdated(updated);
      setEditing(false);
    } catch {
      setError('Could not save your changes.');
    } finally {
      setBusy(false);
    }
  }

  const fields: { label: string; key: keyof ClientProfile; locked?: boolean }[] = [
    { label: 'First Name', key: 'firstName' },
    { label: 'Last Name', key: 'lastName' },
    { label: 'Email', key: 'email', locked: true },
    { label: 'Phone', key: 'phone' },
    { label: 'Company Name', key: 'companyName' },
  ];

  return (
    <aside className="rounded-2xl overflow-hidden shadow-md">
      <div className="bg-blue-950 px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <UserIcon className="w-6 h-6 text-white" />
          <h2 className="text-xl font-bold text-white">My Details</h2>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="bg-white text-blue-950 font-semibold text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5"
          >
            <PencilIcon className="w-3 h-3" /> Edit
          </button>
        )}
      </div>

      <div className="bg-gradient-to-b from-blue-500 to-blue-400 px-6 py-6 space-y-4">
        {fields.map((field) => (
          <div key={field.label}>
            <p className="font-bold text-black text-sm">{field.label}</p>
            {editing && !field.locked ? (
              <input
                type={field.key === 'phone' ? 'tel' : 'text'}
                value={draft[field.key]}
                onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                disabled={busy}
                className="w-full mt-1 rounded-md bg-white text-black text-sm px-3 py-2"
              />
            ) : (
              <p className="text-white text-sm break-words">{client[field.key]}</p>
            )}
            {editing && field.locked && (
              <p className="text-blue-100 text-xs mt-0.5">Used to sign in, so it can&apos;t be changed here.</p>
            )}
          </div>
        ))}

        {error && <p className="text-sm font-semibold text-red-900">{error}</p>}

        {editing && (
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex-1 bg-blue-950 text-white font-semibold text-sm py-2 rounded-full disabled:opacity-60"
            >
              {busy ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="flex-1 bg-gray-200 text-black font-semibold text-sm py-2 rounded-full disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
