'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { XIcon } from '@/components/icons';
import {
  ApiError,
  getSessionUser,
  getTeamProfile,
  getTeamSettings,
  updateTeamProfile,
  updateTeamSettings,
} from '@/lib/api';
import { MANAGER_STATUS_PILLS, pillStyle } from '@/lib/format';
import {
  DEFAULT_THEME,
  TEAM_THEMES,
  getThemeSnapshot,
  setTeamTheme,
  subscribeTheme,
} from '@/lib/theme';
import { useSyncExternalStore } from 'react';
import type { ClientProfile, ManagerStatus, TeamSettings } from '@/types';

const TABS = ['Status', 'Categories', 'File Types', 'Profile', 'Budget', 'Theme'] as const;
type Tab = (typeof TABS)[number];

const BUILTIN_STATUSES = Object.keys(MANAGER_STATUS_PILLS) as ManagerStatus[];

function statusLabel(key: string): string {
  return key in MANAGER_STATUS_PILLS
    ? MANAGER_STATUS_PILLS[key as ManagerStatus].label
    : key;
}

// Add/remove editor shared by the Categories and Budget tabs
function ListEditor({
  title,
  placeholder,
  items,
  onChange,
  disabled,
}: {
  title: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const value = draft.trim();
    if (!value || items.includes(value)) return;
    onChange([...items, value]);
    setDraft('');
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="bg-white border border-gray-300 rounded-full px-4 py-1.5 text-sm font-semibold text-black flex items-center gap-2"
          >
            {item}
            <button
              type="button"
              onClick={() => onChange(items.filter((i) => i !== item))}
              disabled={disabled || items.length === 1}
              aria-label={`Remove ${item}`}
              className="disabled:opacity-30"
            >
              <XIcon className="w-3 h-3 text-gray-500" />
            </button>
          </span>
        ))}
      </div>

      <p className="font-bold text-black text-sm border-b border-gray-400 pb-1 mt-6">{title}</p>
      <div className="flex gap-2 mt-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="rounded-md bg-gray-100 border border-gray-300 text-black text-sm px-3 py-2 w-64"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled || draft.trim() === ''}
          className="bg-black text-white font-bold text-sm px-5 py-1.5 rounded-lg disabled:opacity-50"
        >
          ADD
        </button>
      </div>
    </div>
  );
}

// Settings for the internal dashboard, per the mockup: one card per tab,
// with a Save button that persists everything staged on the settings tabs.
// Profile and Theme apply on their own.
export default function TeamSettingsPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('Status');
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [availableFileTypes, setAvailableFileTypes] = useState<string[]>([]);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Status tab controls
  const [selectedStatus, setSelectedStatus] = useState<string>('new');
  const [pickedColor, setPickedColor] = useState('#38bdf8');
  const [newStatusName, setNewStatusName] = useState('');
  const colorInputRef = useRef<HTMLInputElement>(null);

  // Password change (Profile tab)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordNote, setPasswordNote] = useState('');

  const themeId = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => DEFAULT_THEME);

  const initials = (() => {
    const user = getSessionUser();
    if (!user) return 'TQ';
    return `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() || 'TQ';
  })();

  useEffect(() => {
    let active = true;

    Promise.all([getTeamSettings(), getTeamProfile()])
      .then(([payload, me]) => {
        if (!active) return;
        setSettings(payload.settings);
        setAvailableFileTypes(payload.available_file_types);
        setProfile(me);
        setPickedColor(payload.settings.status_colors['new'] ?? '#d1d5db');
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace('/login');
          return;
        }
        if (active) setLoadError('Could not load settings. Please try again.');
      });

    return () => {
      active = false;
    };
  }, [router]);

  function stage(changes: Partial<TeamSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...changes } : prev));
    setSaved(false);
  }

  function selectStatus(key: string) {
    if (!settings) return;
    setSelectedStatus(key);
    setPickedColor(
      settings.status_colors[key] ??
        settings.custom_statuses.find((s) => s.name === key)?.color ??
        '#9ca3af'
    );
  }

  function setStatusColor() {
    if (!settings) return;
    stage({
      status_colors: { ...settings.status_colors, [selectedStatus]: pickedColor },
      custom_statuses: settings.custom_statuses.map((s) =>
        s.name === selectedStatus ? { ...s, color: pickedColor } : s
      ),
    });
  }

  function createStatus() {
    if (!settings) return;
    const name = newStatusName.trim();
    if (!name) return;
    const exists =
      name in MANAGER_STATUS_PILLS ||
      settings.custom_statuses.some((s) => s.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setError('That status already exists.');
      return;
    }
    setError('');
    stage({ custom_statuses: [...settings.custom_statuses, { name, color: '#9ca3af' }] });
    setNewStatusName('');
    selectStatus(name);
    setSelectedStatus(name);
    setPickedColor('#9ca3af');
  }

  function removeCustomStatus(name: string) {
    if (!settings) return;
    const colors = { ...settings.status_colors };
    delete colors[name];
    stage({
      custom_statuses: settings.custom_statuses.filter((s) => s.name !== name),
      status_colors: colors,
    });
    if (selectedStatus === name) selectStatus('new');
  }

  async function saveSettings() {
    if (!settings) return;
    setError('');
    setBusy(true);
    try {
      const payload = await updateTeamSettings(settings);
      setSettings(payload.settings);
      setSaved(true);
    } catch {
      setError('Could not save the settings.');
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!profile) return;
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      setProfile(
        await updateTeamProfile({
          first_name: profile.firstName.trim(),
          last_name: profile.lastName.trim(),
          phone: profile.phone.trim(),
        })
      );
      setSaved(true);
    } catch {
      setError('Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setPasswordNote('');
    if (newPassword.length < 8) {
      setPasswordNote('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNote('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await updateTeamProfile({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNote('Password updated.');
    } catch (err) {
      setPasswordNote(
        err instanceof ApiError && err.status === 403
          ? 'Current password is incorrect.'
          : 'Could not update the password.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return <p className="text-red-600 bg-gray-100 rounded-2xl p-8">{loadError}</p>;
  }
  if (!settings) {
    return <p className="text-gray-600 bg-gray-100 rounded-2xl p-8">Loading settings...</p>;
  }

  const allStatuses = [
    ...BUILTIN_STATUSES.map((key) => ({ key, custom: false })),
    ...settings.custom_statuses.map((s) => ({ key: s.name, custom: true })),
  ];

  const settingsTab = tab === 'Status' || tab === 'Categories' || tab === 'File Types' || tab === 'Budget';

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="bg-gray-100 rounded-2xl px-6 py-4 flex items-center justify-between shadow-md">
        <h1 className="text-2xl font-bold text-black tracking-wide">SETTINGS</h1>
        <div className="w-12 h-12 rounded-full bg-blue-950 flex items-center justify-center">
          <span className="text-white font-bold text-lg">{initials}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-gray-400 px-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`pb-2 font-bold ${
              tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-black'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab card */}
      <div className="bg-gray-200 border border-gray-400 rounded-2xl p-6 shadow-md">

        {tab === 'Status' && (
          <div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="font-bold text-black text-sm mb-1">Status</p>
                <select
                  value={selectedStatus}
                  onChange={(e) => selectStatus(e.target.value)}
                  className="rounded-md bg-gray-100 border border-gray-300 text-black text-sm px-3 py-2 w-48"
                >
                  {allStatuses.map(({ key }) => (
                    <option key={key} value={key}>
                      {statusLabel(key)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="font-bold text-black text-sm mb-1">Color</p>
                <div className="flex items-center gap-2">
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={pickedColor}
                    onChange={(e) => setPickedColor(e.target.value)}
                    aria-label="Status color"
                    className="w-28 h-9 rounded-md border border-gray-300 bg-gray-100 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => colorInputRef.current?.click()}
                    className="bg-blue-950 text-white font-bold text-sm px-5 py-2 rounded-lg"
                  >
                    Pick
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={setStatusColor}
                className="bg-black text-white font-bold text-sm px-6 py-2 rounded-full"
              >
                Set
              </button>
            </div>

            {/* Preview of every pill with its (staged) color */}
            <div className="flex flex-wrap items-center gap-2 mt-5">
              {allStatuses.map(({ key, custom }) => {
                const color =
                  settings.status_colors[key] ??
                  settings.custom_statuses.find((s) => s.name === key)?.color ??
                  '#9ca3af';
                return (
                  <span
                    key={key}
                    style={pillStyle(color)}
                    className="font-semibold text-xs px-3 py-1 rounded-full flex items-center gap-1.5"
                  >
                    {statusLabel(key)}
                    {custom && (
                      <button
                        type="button"
                        onClick={() => removeCustomStatus(key)}
                        aria-label={`Remove ${key}`}
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>

            <p className="font-bold text-black text-sm border-b border-gray-400 pb-1 mt-8">
              Create Status
            </p>
            <p className="font-bold text-black text-sm mt-4 mb-1">New Status</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newStatusName}
                onChange={(e) => setNewStatusName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createStatus();
                }}
                disabled={busy}
                className="rounded-md bg-gray-100 border border-gray-300 text-black text-sm px-3 py-2 w-64"
              />
              <button
                type="button"
                onClick={createStatus}
                disabled={busy || newStatusName.trim() === ''}
                className="bg-black text-white font-bold text-sm px-5 py-1.5 rounded-lg disabled:opacity-50"
              >
                CREATE
              </button>
            </div>
            <p className="text-gray-600 text-xs mt-3">
              Custom statuses are saved here and will become assignable to proposals in a
              future update.
            </p>
          </div>
        )}

        {tab === 'Categories' && (
          <ListEditor
            title="Create Category"
            placeholder="New category"
            items={settings.categories}
            onChange={(categories) => stage({ categories })}
            disabled={busy}
          />
        )}

        {tab === 'File Types' && (
          <div>
            <p className="text-black text-sm mb-4">
              File types clients and the team can upload to a proposal.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {availableFileTypes.map((ext) => {
                const enabled = settings.file_types.includes(ext);
                return (
                  <label
                    key={ext}
                    className="flex items-center gap-2 bg-white border border-gray-300 rounded-md px-3 py-2 text-sm font-semibold text-black"
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={busy || (enabled && settings.file_types.length === 1)}
                      onChange={() =>
                        stage({
                          file_types: enabled
                            ? settings.file_types.filter((f) => f !== ext)
                            : [...settings.file_types, ext],
                        })
                      }
                    />
                    .{ext}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'Profile' && profile && (
          <div className="max-w-md space-y-4">
            <div>
              <p className="font-bold text-black text-sm">First Name</p>
              <input
                type="text"
                value={profile.firstName}
                onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                disabled={busy}
                className="w-full mt-1 rounded-md bg-white border border-gray-300 text-black text-sm px-3 py-2"
              />
            </div>
            <div>
              <p className="font-bold text-black text-sm">Last Name</p>
              <input
                type="text"
                value={profile.lastName}
                onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                disabled={busy}
                className="w-full mt-1 rounded-md bg-white border border-gray-300 text-black text-sm px-3 py-2"
              />
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
                className="w-full mt-1 rounded-md bg-white border border-gray-300 text-black text-sm px-3 py-2"
              />
            </div>
            <button
              type="button"
              onClick={saveProfile}
              disabled={busy}
              className="bg-black text-white font-bold text-sm px-8 py-2 rounded-full disabled:opacity-50"
            >
              Save Profile
            </button>

            <p className="font-bold text-black text-sm border-b border-gray-400 pb-1 pt-4">
              Change Password
            </p>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              disabled={busy}
              className="w-full rounded-md bg-white border border-gray-300 text-black text-sm px-3 py-2"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              disabled={busy}
              className="w-full rounded-md bg-white border border-gray-300 text-black text-sm px-3 py-2"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              disabled={busy}
              className="w-full rounded-md bg-white border border-gray-300 text-black text-sm px-3 py-2"
            />
            {passwordNote && (
              <p
                className={`text-sm font-semibold ${
                  passwordNote === 'Password updated.' ? 'text-green-700' : 'text-red-600'
                }`}
              >
                {passwordNote}
              </p>
            )}
            <button
              type="button"
              onClick={changePassword}
              disabled={busy || !currentPassword || !newPassword}
              className="bg-black text-white font-bold text-sm px-8 py-2 rounded-full disabled:opacity-50"
            >
              Update Password
            </button>
          </div>
        )}

        {tab === 'Budget' && (
          <ListEditor
            title="Create Budget Range"
            placeholder="New budget range"
            items={settings.budget_ranges}
            onChange={(budget_ranges) => stage({ budget_ranges })}
            disabled={busy}
          />
        )}

        {tab === 'Theme' && (
          <div>
            <p className="text-black text-sm mb-4">
              Color theme for the internal dashboard. Applies to this browser only.
            </p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(TEAM_THEMES).map(([id, theme]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTeamTheme(id)}
                  className={`rounded-xl border-2 p-3 bg-white ${
                    themeId === id ? 'border-blue-600' : 'border-gray-300'
                  }`}
                >
                  <span className={`block w-24 h-12 rounded-md ${theme.sidebar}`} />
                  <span className="block font-semibold text-sm text-black mt-2">
                    {theme.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {error && <p className="text-red-600 text-sm px-2">{error}</p>}

      {/* Save persists everything staged on the settings tabs */}
      {settingsTab && (
        <div className="flex justify-end items-center gap-3">
          {saved && <span className="text-green-700 text-sm font-semibold">Saved</span>}
          <button
            type="button"
            onClick={saveSettings}
            disabled={busy}
            className="bg-black text-white font-bold text-sm px-10 py-2 rounded-full disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}

    </div>
  );
}
