import { browser } from 'wxt/browser';
import type { BookmarkEntry } from '@shared/types';
import type { RequestMessage } from '@shared/messaging';
import { BADGE_COLORS } from '@shared/constants';

export default defineBackground(() => {
  // browser.action (MV3 Chrome/Edge) vs browser.browserAction (Firefox MV2)
  // WXT polyfill returns native browser object on Firefox, which only has browserAction in MV2.
  const actionApi: typeof browser.action =
    (browser as any).action || (browser as any).browserAction;

  // --- Prefetch concurrency queue ---
  const PREFETCH_CONCURRENCY = 2;
  const prefetchQueue: string[] = [];
  const queuedUrls = new Set<string>();
  let activePrefetch = 0;

  function drainPrefetchQueue(): void {
    if (activePrefetch >= PREFETCH_CONCURRENCY) return;
    const next = prefetchQueue.shift();
    if (!next) return;
    queuedUrls.delete(next);
    activePrefetch += 1;
    fetch(next, { mode: 'no-cors', credentials: 'omit', redirect: 'manual' })
      .catch(() => {})
      .finally(() => {
        activePrefetch = Math.max(0, activePrefetch - 1);
        drainPrefetchQueue();
      });
  }

  function enqueuePrefetch(url: string): void {
    if (queuedUrls.has(url)) return;
    queuedUrls.add(url);
    prefetchQueue.push(url);
    drainPrefetchQueue();
  }

  // --- Side panel / sidebar ---
  // Chrome/Edge: icon click → side panel opens directly (no onClicked needed)
  if (!import.meta.env.FIREFOX) {
    try {
      (browser as any).sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
    } catch { /* not available */ }
  }

  // Firefox: onClicked fires → open sidebar (has user gesture)
  if (import.meta.env.FIREFOX && actionApi?.onClicked) {
    actionApi.onClicked.addListener(async () => {
      try {
        await (browser as any).sidebarAction.open();
      } catch { /* ignore */ }
    });
  }

  function flattenBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]): BookmarkEntry[] {
    const flat: BookmarkEntry[] = [];
    const walk = (arr: chrome.bookmarks.BookmarkTreeNode[]) => {
      for (const x of arr) {
        if (x.url) flat.push({ title: x.title || '', url: x.url });
        if (x.children) walk(x.children);
      }
    };
    walk(nodes || []);
    return flat;
  }

  // --- Bundle sync (remote-first, daily auto-update) ---
  const BUNDLE_ALARM = 'bundle-sync';
  const BUNDLE_URL = 'https://raw.githubusercontent.com/investblog/fastweb/main/src/public/bundle.json';

  async function syncBundle(bundle: Record<string, unknown>): Promise<void> {
    if (!bundle || typeof bundle !== 'object') return;
    const data = await browser.storage.sync.get({ alternates: {}, bundleDomains: [] });
    const map = (data.alternates || {}) as Record<string, string[]>;
    const oldBundleKeys = new Set<string>(
      Array.isArray(data.bundleDomains) ? data.bundleDomains : [],
    );
    const newBundleKeys: string[] = [];

    // Remove domains that were part of old bundle but absent from new one
    for (const key of oldBundleKeys) {
      if (!bundle[key]) delete map[key];
    }

    // Add/overwrite all domains from new bundle
    for (const [key, alts] of Object.entries(bundle)) {
      if (Array.isArray(alts)) {
        newBundleKeys.push(key);
        if (oldBundleKeys.has(key) || !map[key]) {
          map[key] = alts as string[];
        }
      }
    }

    await browser.storage.sync.set({
      alternates: map,
      bundleDomains: newBundleKeys,
      bundleLastSync: Date.now(),
    });
  }

  async function fetchAndSyncBundle(): Promise<void> {
    try {
      const resp = await fetch(BUNDLE_URL, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      await syncBundle(await resp.json());
    } catch {
      // Offline fallback — use local copy shipped with extension
      try {
        const local = await fetch(browser.runtime.getURL('/bundle.json'));
        await syncBundle(await local.json());
      } catch { /* silent */ }
    }
  }

  // Daily alarm — sync bundle every 24 h
  browser.alarms.create(BUNDLE_ALARM, { periodInMinutes: 24 * 60 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BUNDLE_ALARM) fetchAndSyncBundle();
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install' || reason === 'update') {
      fetchAndSyncBundle();
    }
  });

  // --- Unified message handler ---
  browser.runtime.onMessage.addListener(
    ((msg: RequestMessage, sender: any, sendResponse: (r?: any) => void) => {
      if (!msg?.type) return;

      switch (msg.type) {
        case 'OPEN_SETTINGS': {
          if (import.meta.env.FIREFOX) {
            // Firefox: try sidebarAction.open() — resolves but may not open without user gesture.
            try { (browser as any).sidebarAction.open(); } catch { /* ignore */ }
          } else {
            // Chrome/Edge: sidePanel.open() works without user gesture.
            const sp = (browser as any).sidePanel;
            if (sp?.open && sender?.tab?.id) {
              sp.open({ tabId: sender.tab.id }).catch(() => {});
            }
          }
          break;
        }

        case 'GET_BOOKMARKS':
          try {
            chrome.bookmarks.getTree((nodes) => {
              sendResponse({ ok: true, items: flattenBookmarks(nodes || []) });
            });
            return true; // async
          } catch {
            sendResponse({ ok: false, items: [] });
          }
          break;

        case 'PREFETCH_URL': {
          const url = msg.url;
          if (url && /^https?:\/\//.test(url)) {
            enqueuePrefetch(url);
          }
          sendResponse?.({ ok: true });
          break;
        }

        case 'SET_BADGE': {
          const n = Math.max(0, parseInt(String(msg.count || 0), 10) || 0);
          const tabId = sender?.tab?.id;
          try {
            if (actionApi?.setBadgeText) {
              const opts = tabId ? { tabId } : {};
              actionApi.setBadgeBackgroundColor({ ...opts, color: msg.color || BADGE_COLORS.alts });
              actionApi.setBadgeText({ ...opts, text: n > 0 ? String(n) : '' });
              if (actionApi.setTitle) {
                actionApi.setTitle({ ...opts, title: msg.title || '' });
              }
            }
          } catch { /* ignore */ }
          sendResponse?.({ ok: true });
          break;
        }
      }
    }) as (...args: any[]) => void,
  );
});
