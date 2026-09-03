// Theme presets for the internal (team) pages and the client portal, each
// chosen on its own Settings > Theme. The choice is per-browser: it lives in
// localStorage and is read through an external store so the page updates the
// moment it changes.
import { useSyncExternalStore } from 'react';

// --- Team ---

export interface TeamTheme {
  label: string;
  // Tailwind classes per sidebar region (literal strings so Tailwind sees them)
  sidebar: string;
  brand: string;
  active: string;
  hover: string;
}

export const TEAM_THEMES: Record<string, TeamTheme> = {
  indigo: {
    label: 'Indigo',
    sidebar: 'bg-indigo-500',
    brand: 'bg-blue-950',
    active: 'bg-blue-700',
    hover: 'hover:bg-indigo-400',
  },
  ocean: {
    label: 'Ocean',
    sidebar: 'bg-blue-900',
    brand: 'bg-blue-950',
    active: 'bg-blue-600',
    hover: 'hover:bg-blue-800',
  },
  forest: {
    label: 'Forest',
    sidebar: 'bg-emerald-700',
    brand: 'bg-emerald-950',
    active: 'bg-emerald-500',
    hover: 'hover:bg-emerald-600',
  },
  slate: {
    label: 'Slate',
    sidebar: 'bg-slate-700',
    brand: 'bg-slate-900',
    active: 'bg-slate-500',
    hover: 'hover:bg-slate-600',
  },
};

export const DEFAULT_THEME = 'indigo';

// --- Client portal ---

export interface PortalTheme {
  label: string;
  // Tailwind classes per region of the portal (literal strings so Tailwind
  // sees them)
  banner: string;      // hero banner and card headers
  bannerText: string;  // secondary text on the banner and cards
  accentText: string;  // the banner color as text (e.g. the Edit pill)
  tabActive: string;   // selected tab, table headers
  tabHover: string;    // hover color on the other tabs
  card: string;        // My Details body
  panel: string;       // expanded proposal details
  bubble: string;      // the client's own messages in a thread
  button: string;      // primary buttons
}

export const PORTAL_THEMES: Record<string, PortalTheme> = {
  navy: {
    label: 'Navy',
    banner: 'bg-blue-950',
    bannerText: 'text-blue-100',
    accentText: 'text-blue-950',
    tabActive: 'bg-blue-600',
    tabHover: 'hover:text-blue-600',
    card: 'bg-gradient-to-b from-blue-500 to-blue-400',
    panel: 'bg-gradient-to-b from-blue-400 to-blue-300',
    bubble: 'bg-blue-500',
    button: 'bg-blue-950',
  },
  teal: {
    label: 'Teal',
    banner: 'bg-teal-900',
    bannerText: 'text-teal-100',
    accentText: 'text-teal-900',
    tabActive: 'bg-teal-600',
    tabHover: 'hover:text-teal-600',
    card: 'bg-gradient-to-b from-teal-500 to-teal-400',
    panel: 'bg-gradient-to-b from-teal-400 to-teal-300',
    bubble: 'bg-teal-500',
    button: 'bg-teal-900',
  },
  forest: {
    label: 'Forest',
    banner: 'bg-emerald-950',
    bannerText: 'text-emerald-100',
    accentText: 'text-emerald-950',
    tabActive: 'bg-emerald-600',
    tabHover: 'hover:text-emerald-600',
    card: 'bg-gradient-to-b from-emerald-500 to-emerald-400',
    panel: 'bg-gradient-to-b from-emerald-400 to-emerald-300',
    bubble: 'bg-emerald-500',
    button: 'bg-emerald-950',
  },
  plum: {
    label: 'Plum',
    banner: 'bg-purple-950',
    bannerText: 'text-purple-100',
    accentText: 'text-purple-950',
    tabActive: 'bg-purple-600',
    tabHover: 'hover:text-purple-600',
    card: 'bg-gradient-to-b from-purple-500 to-purple-400',
    panel: 'bg-gradient-to-b from-purple-400 to-purple-300',
    bubble: 'bg-purple-500',
    button: 'bg-purple-950',
  },
  slate: {
    label: 'Slate',
    banner: 'bg-slate-900',
    bannerText: 'text-slate-200',
    accentText: 'text-slate-900',
    tabActive: 'bg-slate-600',
    tabHover: 'hover:text-slate-600',
    card: 'bg-gradient-to-b from-slate-500 to-slate-400',
    panel: 'bg-gradient-to-b from-slate-400 to-slate-300',
    bubble: 'bg-slate-500',
    button: 'bg-slate-900',
  },
};

export const DEFAULT_PORTAL_THEME = 'navy';

// --- Stores ---

// One store per side, sharing the subscribe/snapshot/set mechanics
function createThemeStore(key: string, themes: Record<string, unknown>, fallback: string) {
  const listeners = new Set<() => void>();

  return {
    subscribe(onChange: () => void): () => void {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot(): string {
      if (typeof window === 'undefined') return fallback;
      const stored = localStorage.getItem(key);
      return stored && stored in themes ? stored : fallback;
    },
    set(id: string) {
      if (!(id in themes)) return;
      localStorage.setItem(key, id);
      listeners.forEach((onChange) => onChange());
    },
  };
}

const teamStore = createThemeStore('team_theme', TEAM_THEMES, DEFAULT_THEME);
export const subscribeTheme = teamStore.subscribe;
export const getThemeSnapshot = teamStore.getSnapshot;
export const setTeamTheme = teamStore.set;

const portalStore = createThemeStore('client_theme', PORTAL_THEMES, DEFAULT_PORTAL_THEME);
export const subscribePortalTheme = portalStore.subscribe;
export const getPortalThemeSnapshot = portalStore.getSnapshot;
export const setPortalTheme = portalStore.set;

// The portal's current theme id, for components that need to know which is
// selected (the Theme tab)
export function usePortalThemeId(): string {
  return useSyncExternalStore(subscribePortalTheme, getPortalThemeSnapshot, () => DEFAULT_PORTAL_THEME);
}

// The portal's current theme classes, for components that render with them
export function usePortalTheme(): PortalTheme {
  const id = usePortalThemeId();
  return PORTAL_THEMES[id] ?? PORTAL_THEMES[DEFAULT_PORTAL_THEME];
}
