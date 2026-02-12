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
      const prefetched = new Set<string>();
      let hoverTimer: ReturnType<typeof setTimeout> | undefined;
      let inflight = 0;
      const MAX_CONCURRENT = 2;

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

      function prefetchUrl(href: string): void {
        if (prefetched.has(href)) return;
        if (inflight >= MAX_CONCURRENT) return;
        prefetched.add(href);
        inflight++;
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        link.onload = link.onerror = () => { inflight = Math.max(0, inflight - 1); };
        document.head.appendChild(link);
      }

      // --- Event listeners ---
      document.addEventListener('mouseover', (e) => {
        const target = (e.target as Element)?.closest?.('a') as HTMLAnchorElement | null;
        if (!target?.href) return;
        if (prefetched.has(target.href)) return;
        if (!isResultCandidate(target)) return;

        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          prefetchUrl(target.href);
        }, hoverDelayMs);
      }, { passive: true });

      document.addEventListener('mouseout', () => {
        clearTimeout(hoverTimer);
      }, { passive: true });

      document.addEventListener('touchstart', (e) => {
        const target = (e.target as Element)?.closest?.('a') as HTMLAnchorElement | null;
        if (!target?.href) return;
        if (!isResultCandidate(target)) return;
        prefetchUrl(target.href);
      }, { passive: true });
    }
  },
});
