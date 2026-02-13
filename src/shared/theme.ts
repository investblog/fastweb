/**
 * Theme management for FastWeb
 * Supports: dark, light, auto (system preference)
 * Syncs via chrome.storage.sync so SERP panel and sidepanel share the same theme.
 */

const THEME_STORAGE_KEY = 'fastweb_theme';
const SYNC_KEY = 'theme';

export type Theme = 'dark' | 'light';
export type ThemePreference = Theme | 'auto';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Get the current effective theme (dark or light)
 */
export function getTheme(): Theme {
  const root = document.documentElement;
  const explicit = root.dataset.theme as Theme | undefined;
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return systemTheme();
}

/**
 * Resolve preference to effective theme
 */
export function resolveTheme(pref: ThemePreference): Theme {
  return pref === 'auto' ? systemTheme() : pref;
}

/**
 * Get the stored theme preference (dark, light, or auto)
 */
export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    if (stored === 'dark' || stored === 'light' || stored === 'auto') return stored;
  } catch { /* localStorage may be blocked */ }
  return 'auto';
}

/**
 * Apply a theme to the document (sidepanel context)
 */
export function setTheme(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;
}

/**
 * Save theme preference, apply it, and sync to chrome.storage
 */
export function setThemePreference(preference: ThemePreference): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* ignore */ }

  if (preference === 'auto') setTheme(null);
  else setTheme(preference);

  // Sync to chrome.storage.sync so content scripts can read it
  try { chrome.storage?.sync?.set({ [SYNC_KEY]: preference }); } catch { /* ignore */ }
}

/**
 * Toggle between dark and light themes
 */
export function toggleTheme(): void {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setThemePreference(next);
}

/**
 * Initialize theme system (sidepanel context)
 */
export function initTheme(): void {
  const preference = getThemePreference();

  if (preference === 'auto') setTheme(null);
  else setTheme(preference);

  // Sync initial value from localStorage → chrome.storage
  try { chrome.storage?.sync?.set({ [SYNC_KEY]: preference }); } catch { /* ignore */ }

  try {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', () => {
      if (getThemePreference() === 'auto') {
        document.dispatchEvent(new CustomEvent('themechange', { detail: getTheme() }));
      }
    });
  } catch { /* matchMedia may not be available */ }
}
