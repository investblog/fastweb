import { browser } from 'wxt/browser';
import { applyI18n } from '@shared/i18n';
import { initTheme } from '@shared/theme';

initTheme();
applyI18n();

const SITE_LOCALES = new Set(['en', 'ru', 'uk', 'tr', 'es', 'id', 'fa']);

function getLocaleUrl(path: string): string {
  const lang = (chrome.i18n.getUILanguage() || 'en').split(/[-_]/)[0].toLowerCase();
  const isRuUk = lang === 'ru' || lang === 'uk';
  const base = isRuUk ? 'https://fastweb.su' : 'https://fastweb.cam';
  if (isRuUk) return `${base}${path}`;
  if (!SITE_LOCALES.has(lang) || lang === 'en') return `${base}${path}`;
  return `${base}/${lang}${path}`;
}

// Set learn-more link to locale-aware welcome page
try {
  const link = document.getElementById('learnMore') as HTMLAnchorElement | null;
  if (link) link.href = getLocaleUrl('/welcome');
} catch { /* ignore */ }

// Open Settings button → open sidebar/sidePanel
document.getElementById('openSettings')?.addEventListener('click', () => {
  // Firefox: try sidebarAction directly (extension page has access)
  try {
    const sa = (browser as any).sidebarAction;
    if (sa?.open) { sa.open(); return; }
  } catch { /* not Firefox or no access */ }
  // Chrome/Edge/Opera: relay to background
  browser.runtime.sendMessage({ type: 'OPEN_SETTINGS' }).catch(() => {});
});
