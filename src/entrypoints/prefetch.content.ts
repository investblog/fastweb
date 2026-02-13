import { DEFAULT_PREFS, STORAGE_DEFAULTS } from '@shared/constants';
import { detectSerpContext } from '@shared/url-utils';
import type { Prefs, SerpContext } from '@shared/types';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_end',

  main() {
    // --- SERP-only gate: bail immediately if not a search results page ---
    const serpCtx = detectSerpContext();
    if (!serpCtx) return;

    chrome.storage.sync.get(STORAGE_DEFAULTS, (data) => {
      const prefs: Prefs = (data?.prefs as Prefs) || DEFAULT_PREFS;
      if (!prefs.enablePrefetch) return;

      const topN = Math.max(1, Math.min(15, prefs.prefetchTopN || 5));
      const hoverDelay = Math.max(50, Math.min(2000, prefs.prefetchHoverDelay || 200));

      setupSerpHoverPrefetch(serpCtx, topN, hoverDelay);
    });

    function setupSerpHoverPrefetch(ctx: SerpContext, topN: number, hoverDelayMs: number): void {
      const warmed = new Set<string>();
      let hoverTimer: ReturnType<typeof setTimeout> | undefined;

      // Collect candidate result links based on engine-specific selectors
      function collectResultLinks(): HTMLAnchorElement[] {
        let selector: string;
        switch (ctx.engine) {
          case 'google':
            selector = '#search a[href]:not([role="button"]), #rso a[href]';
            break;
          case 'bing':
            selector = '#b_results h2 a[href], .b_algo h2 a[href]';
            break;
          case 'ddg':
            selector = '[data-testid="result"] a[data-testid="result-title-a"], .result__a';
            break;
          case 'yandex':
            selector = '.serp-item a.link, .serp-item a.OrganicTitle-Link';
            break;
          default:
            return [];
        }

        const links: HTMLAnchorElement[] = [];
        const seen = new Set<string>();
        for (const el of document.querySelectorAll<HTMLAnchorElement>(selector)) {
          if (!el.href) continue;
          try {
            const url = new URL(el.href);
            // Skip non-http, internal SERP links, anchors
            if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
            if (url.hostname === location.hostname) continue;
            const key = url.origin + url.pathname + url.search;
            if (seen.has(key)) continue;
            seen.add(key);
            links.push(el);
            if (links.length >= topN) break;
          } catch { /* skip invalid URLs */ }
        }
        return links;
      }

      function isResultCandidate(anchor: HTMLAnchorElement): boolean {
        const candidates = collectResultLinks();
        return candidates.some(c => c === anchor || c.href === anchor.href);
      }

      function warmupUrl(href: string): void {
        if (warmed.has(href)) return;
        warmed.add(href);
        // Warm up DNS + TCP + TLS via background fetch (bypasses page CSP)
        try {
          chrome.runtime.sendMessage({ type: 'PREFETCH_URL', url: href });
        } catch { /* ignore */ }
      }

      // --- Event listeners ---
      document.addEventListener('mouseover', (e) => {
        const target = (e.target as Element)?.closest?.('a') as HTMLAnchorElement | null;
        if (!target?.href) return;
        if (warmed.has(target.href)) return;
        if (!isResultCandidate(target)) return;

        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          warmupUrl(target.href);
        }, hoverDelayMs);
      }, { passive: true });

      document.addEventListener('mouseout', () => {
        clearTimeout(hoverTimer);
      }, { passive: true });

      document.addEventListener('touchstart', (e) => {
        const target = (e.target as Element)?.closest?.('a') as HTMLAnchorElement | null;
        if (!target?.href) return;
        if (!isResultCandidate(target)) return;
        warmupUrl(target.href);
      }, { passive: true });
    }
  },
});
