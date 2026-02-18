import { DEFAULT_PREFS, STORAGE_DEFAULTS } from '@shared/constants';
import { detectSerpContext } from '@shared/url-utils';
import type { Prefs, SerpContext } from '@shared/types';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_end',

  main() {
    const serpCtx = detectSerpContext();
    if (!serpCtx) return;

    // Live prefs — updated via storage.onChanged
    let enabled = false;
    let topN = 5;
    let hoverDelayMs = 200;

    const warmed = new Set<string>();
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    let listenersAttached = false;

    function getSelector(): string {
      switch (serpCtx!.engine) {
        case 'google':
          return '#search a[href]:not([role="button"]), #rso a[href]';
        case 'bing':
          return '#b_results h2 a[href], .b_algo h2 a[href]';
        case 'ddg':
          return '[data-testid="result"] a[data-testid="result-title-a"], .result__a';
        case 'yandex':
          return '.serp-item a.link, .serp-item a.OrganicTitle-Link';
        default:
          return '';
      }
    }

    function collectResultLinks(limit?: number): HTMLAnchorElement[] {
      const selector = getSelector();
      if (!selector) return [];

      const links: HTMLAnchorElement[] = [];
      const seen = new Set<string>();
      for (const el of document.querySelectorAll<HTMLAnchorElement>(selector)) {
        if (!el.href) continue;
        try {
          const url = new URL(el.href);
          if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
          if (url.hostname === location.hostname) continue;
          const key = url.origin + url.pathname + url.search;
          if (seen.has(key)) continue;
          seen.add(key);
          links.push(el);
          if (limit && links.length >= limit) break;
        } catch { /* skip */ }
      }
      return links;
    }

    function isResultLink(anchor: HTMLAnchorElement): boolean {
      const all = collectResultLinks();
      return all.some(c => c === anchor || c.href === anchor.href);
    }

    function warmupUrl(href: string): void {
      if (warmed.has(href)) return;
      warmed.add(href);
      try {
        if (chrome.runtime?.id) chrome.runtime.sendMessage({ type: 'PREFETCH_URL', url: href });
      } catch { /* ignore */ }
    }

    function autoWarmTopN(): void {
      const links = collectResultLinks(topN);
      for (const link of links) warmupUrl(link.href);
    }

    function attachListeners(): void {
      if (listenersAttached) return;
      listenersAttached = true;

      document.addEventListener('mouseover', (e) => {
        if (!enabled) return;
        const target = (e.target as Element)?.closest?.('a') as HTMLAnchorElement | null;
        if (!target?.href) return;
        if (warmed.has(target.href)) return;
        if (!isResultLink(target)) return;

        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          warmupUrl(target.href);
        }, hoverDelayMs);
      }, { passive: true });

      document.addEventListener('mouseout', () => {
        clearTimeout(hoverTimer);
      }, { passive: true });
    }

    function applyPrefs(prefs: Prefs): void {
      const wasEnabled = enabled;
      enabled = !!prefs.enablePrefetch;
      topN = Math.max(1, Math.min(15, prefs.prefetchTopN || 5));
      hoverDelayMs = Math.max(50, Math.min(2000, prefs.prefetchHoverDelay || 200));

      if (enabled) {
        attachListeners();
        // Auto-warm when toggled on (or on first load)
        if (!wasEnabled) autoWarmTopN();
      }
    }

    // Initial load
    chrome.storage.sync.get(STORAGE_DEFAULTS, (data) => {
      applyPrefs((data?.prefs as Prefs) || DEFAULT_PREFS);
    });

    // Live updates — react to pref changes without reload
    try {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.prefs?.newValue) {
          applyPrefs(changes.prefs.newValue as Prefs);
        }
      });
    } catch { /* ignore */ }
  },
});
