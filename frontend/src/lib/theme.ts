// Theme presets for the internal (team) pages, chosen on Settings > Theme.
// The choice is per-browser: it lives in localStorage and is read through an
// external store so the sidebar updates the moment it changes.

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

const THEME_KEY = 'team_theme';

const listeners = new Set<() => void>();

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getThemeSnapshot(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const stored = localStorage.getItem(THEME_KEY);
  return stored && stored in TEAM_THEMES ? stored : DEFAULT_THEME;
}

export function setTeamTheme(id: string) {
  if (!(id in TEAM_THEMES)) return;
  localStorage.setItem(THEME_KEY, id);
  listeners.forEach((onChange) => onChange());
}
