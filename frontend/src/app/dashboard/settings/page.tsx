'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GearIcon, UserIcon } from '@/components/icons';
import { ApiError, getMe, updateMe } from '@/lib/api';
import {
  PORTAL_THEMES,
  setPortalTheme,
  usePortalTheme,
  usePortalThemeId,
} from '@/lib/theme';
import type { ClientProfile } from '@/types';

const TABS = ['Profile', 'Theme'] as const;
type Tab = (typeof TABS)[number];

// Inline result of a save: green when it worked, red when it didn't
type Note = { text: string; ok: boolean };

const INPUT =
  'w-full mt-1 rounded-md bg-white border border-gray-300 text-black text-sm px-3 py-2 disabled:opacity-60';

// Settings for the client portal, covering what a client controls: their own
// details (the team sees the current version on every request they've
// sent), a password change, and the portal's color theme. Laid out like the
// dashboard so it reads as the same place.
export default function ClientSettingsPage() {
  const router = useRouter();
  const theme = usePortalTheme();
  const themeId = usePortalThemeId();

  const [tab, setTab] = useState<Tab>('Profile');
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileNote, setProfileNote] = useState<Note | null>(null);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordNote, setPasswordNote] = useState<Note | null>(null);

  useEffect(() => {
    let active = true;

    getMe()
      .then((me) => {
        if (active) setProfile(me);
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace('/login');
          return;
        }
        if (active) setLoadError('Could not load your settings. Please try again.');
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function saveProfile() {
    if (!profile) return;
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      setProfileNote({ text: 'First and last name are required.', ok: false });
      return;
    }

    setProfileNote(null);
    setBusy(true);
    try {
      setProfile(
        await updateMe({
          first_name: profile.firstName.trim(),
          last_name: profile.lastName.trim(),
          phone: profile.phone.trim(),
          company_name: profile.companyName.trim(),
        })
      );
      setProfileNote({ text: 'Your details are saved.', ok: true });
    } catch {
      setProfileNote({ text: 'Could not save your details.', ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setPasswordNote(null);
    if (newPassword.length < 8) {
      setPasswordNote({ text: 'New password must be at least 8 characters.', ok: false });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNote({ text: 'New passwords do not match.', ok: false });
      return;
    }

    setBusy(true);
    try {
      await updateMe({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNote({ text: 'Password updated.', ok: true });
    } catch (err) {
      setPasswordNote({
        text:
          err instanceof ApiError && err.status === 403
            ? 'Current password is incorrect.'
            : 'Could not update the password.',
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  }

  function noteText(note: Note) {
    return (
      <p className={`text-sm font-semibold ${note.ok ? 'text-green-700' : 'text-red-600'}`}>
        {note.text}
      </p>
    );
  }

  return (
    <div className="min-h-full bg-gray-100">

      {/* Banner, matching the dashboard's */}
      <div className={theme.banner}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold text-white">Settings</h1>
            <p className={`${theme.bannerText} mt-1`}>Your details and how your portal looks.</p>
          </div>
          <span className="text-2xl font-bold text-white">Client Portal</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-gray-200 border-b border-gray-300">
        <div className="max-w-6xl mx-auto px-6 flex">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? `${theme.tabActive} text-white font-bold px-8 py-3`
                  : `text-black font-bold px-8 py-3 ${theme.tabHover}`
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {loadError ? (
          <p className="text-red-600 bg-gray-50 rounded-2xl p-8">{loadError}</p>
        ) : !profile ? (
          <p className="text-gray-600 bg-gray-50 rounded-2xl p-8">Loading your settings...</p>
        ) : (
          <section className="rounded-2xl overflow-hidden shadow-md max-w-2xl">

            {/* Card header */}
            <div className={`${theme.banner} px-6 py-4 flex items-center gap-3`}>
              {tab === 'Profile' ? (
                <UserIcon className="w-6 h-6 text-white" />
              ) : (
                <GearIcon className="w-6 h-6 text-white" />
              )}
              <h2 className="text-xl font-bold text-white">
                {tab === 'Profile' ? 'My Details' : 'Color Theme'}
              </h2>
            </div>

            <div className="bg-gray-50 p-6">

              {tab === 'Profile' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Keep these current — our team sees them on every request you send.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="font-bold text-black text-sm">First Name</p>
                      <input
                        type="text"
                        value={profile.firstName}
                        onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                        disabled={busy}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <p className="font-bold text-black text-sm">Last Name</p>
                      <input
                        type="text"
                        value={profile.lastName}
                        onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                        disabled={busy}
                        className={INPUT}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="font-bold text-black text-sm">Email</p>
                    <p className="text-gray-700 text-sm mt-1">{profile.email}</p>
                    <p className="text-gray-500 text-xs">Used to sign in, so it can&apos;t be changed here.</p>
                  </div>

                  <div>
                    <p className="font-bold text-black text-sm">Phone</p>
                    <input
                      type="tel"
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      disabled={busy}
                      className={INPUT}
                    />
                  </div>

                  <div>
                    <p className="font-bold text-black text-sm">Company Name</p>
                    <input
                      type="text"
                      value={profile.companyName}
                      onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                      disabled={busy}
                      className={INPUT}
                    />
                  </div>

                  {profileNote && noteText(profileNote)}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={saveProfile}
                      disabled={busy}
                      className={`${theme.button} text-white font-semibold text-sm px-8 py-2.5 rounded-full disabled:opacity-50`}
                    >
                      {busy ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>

                  {/* Password change */}
                  <p className="font-bold text-black text-sm border-b border-gray-300 pb-1 pt-4">
                    Change Password
                  </p>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    disabled={busy}
                    className={INPUT}
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 8 characters)"
                    disabled={busy}
                    className={INPUT}
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    disabled={busy}
                    className={INPUT}
                  />

                  {passwordNote && noteText(passwordNote)}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={changePassword}
                      disabled={busy || !currentPassword || !newPassword}
                      className={`${theme.button} text-white font-semibold text-sm px-8 py-2.5 rounded-full disabled:opacity-50`}
                    >
                      Update Password
                    </button>
                  </div>
                </div>
              )}

              {tab === 'Theme' && (
                <div>
                  <p className="text-sm text-gray-600 mb-5">
                    Color theme for your portal. Applies to this browser only.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {Object.entries(PORTAL_THEMES).map(([id, t]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPortalTheme(id)}
                        aria-pressed={themeId === id}
                        className={`rounded-xl border-2 p-3 bg-white ${
                          themeId === id ? 'border-black' : 'border-gray-300'
                        }`}
                      >
                        {/* Preview: banner over card colors */}
                        <span className="block w-28 h-14 rounded-md overflow-hidden">
                          <span className={`block h-1/2 ${t.banner}`} />
                          <span className={`block h-1/2 ${t.card}`} />
                        </span>
                        <span className="block font-semibold text-sm text-black mt-2">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </section>
        )}
      </div>

    </div>
  );
}
