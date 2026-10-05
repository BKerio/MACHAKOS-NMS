import { useSyncExternalStore } from 'react';

/**
 * Appearance: light / dark / follow the system, plus an accent colour that
 * recolours buttons, links, focus rings and highlights.
 *
 * Applied as attributes on <html> (`data-theme`, `data-accent`) that index.css
 * keys the palette off. Saved per browser in localStorage. `initTheme()` runs
 * before React renders (main.tsx) so pages never flash the wrong theme.
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type Accent = 'default' | 'mono' | 'green' | 'purple' | 'orange' | 'rose' | 'teal' | 'flash';

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'default', label: 'County', swatch: '#1B5FAC' },
  { id: 'mono', label: 'Mono', swatch: 'linear-gradient(135deg, #15211B 50%, #FFFFFF 50%)' },
  { id: 'green', label: 'Green', swatch: '#15803D' },
  { id: 'teal', label: 'Teal', swatch: '#0F766E' },
  { id: 'purple', label: 'Purple', swatch: '#7C3AED' },
  { id: 'rose', label: 'Rose', swatch: '#E11D48' },
  { id: 'orange', label: 'Orange', swatch: '#EA580C' },
  { id: 'flash', label: 'Flash', swatch: '#D9F31F' },
];

const MODE_KEY = 'theme';
const ACCENT_KEY = 'accent';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

let mode: ThemeMode = read<ThemeMode>(MODE_KEY, ['light', 'dark', 'system'], 'light');
let accent: Accent = read<Accent>(ACCENT_KEY, ACCENTS.map((a) => a.id), 'default');
const listeners = new Set<() => void>();

export function resolvedTheme(m: ThemeMode = mode): 'light' | 'dark' {
  return m === 'system' ? (media?.matches ? 'dark' : 'light') : m;
}

function apply() {
  const root = document.documentElement;
  const resolved = resolvedTheme();
  root.dataset.theme = resolved;
  root.dataset.accent = accent;
  root.style.colorScheme = resolved; // native inputs, scrollbars, date pickers
}

function emit() {
  apply();
  listeners.forEach((l) => l());
}

export function setThemeMode(next: ThemeMode) {
  mode = next;
  try { localStorage.setItem(MODE_KEY, next); } catch { /* private mode */ }
  emit();
}

export function setAccent(next: Accent) {
  accent = next;
  try { localStorage.setItem(ACCENT_KEY, next); } catch { /* private mode */ }
  emit();
}

/** Call once before the first render. */
export function initTheme() {
  apply();
  media?.addEventListener('change', () => mode === 'system' && emit());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Current appearance; re-renders when it changes (including system flips). */
export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, () => `${mode}|${accent}|${resolvedTheme()}`);
  const [m, a, r] = snapshot.split('|') as [ThemeMode, Accent, 'light' | 'dark'];
  return { mode: m, accent: a, resolved: r };
}
