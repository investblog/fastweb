import { browser } from 'wxt/browser';
import type { BookmarkEntry } from '@shared/types';
import type { RequestMessage } from '@shared/messaging';
import { BADGE_COLORS } from '@shared/constants';

export default defineBackground(() => {
  // browser.action (MV3 Chrome/Edge) vs browser.browserAction (Firefox MV2)
  // WXT polyfill returns native browser object on Firefox, which only has browserAction in MV2.
  const actionApi: typeof browser.action =
    (browser as any).action || (browser as any).browserAction;

  // --- Badge flash state ---
  interface BadgeState { text: string; color: string; title: string }
  const badgeBase = new Map<number, BadgeState>();       // resting badge per tab
  const prefetchTimer = new Map<number, ReturnType<typeof setTimeout>>(); // flash restore timer

  function applyBadge(tabId: number, state: BadgeState): void {
    try {
      if (!actionApi?.setBadgeText) return;
      const opts = { tabId };
      void actionApi.setBadgeBackgroundColor({ ...opts, color: state.color });
      void actionApi.setBadgeText({ ...opts, text: state.text });
      if (actionApi.setTitle) void actionApi.setTitle({ ...opts, title: state.title });
      // Ensure white text on colored badges (Chrome 110+)
      if ((actionApi as any).setBadgeTextColor) {
        void (actionApi as any).setBadgeTextColor({ ...opts, color: '#FFFFFF' });
      }
    } catch { /* ignore */ }
  }

  const BOLT_ICON = {
    16: '/icons/icon-bolt-16.png',
    32: '/icons/icon-bolt-32.png',
    48: '/icons/icon-bolt-48.png',
    64: '/icons/icon-bolt-64.png',
  };
  const WARM_ICON = {
    16: '/icons/icon-warm-16.png',
    32: '/icons/icon-warm-32.png',
    48: '/icons/icon-warm-48.png',
    64: '/icons/icon-warm-64.png',
  };
  const DEFAULT_ICON = {
    16: '/icons/icon-16.png',
    32: '/icons/icon-32.png',
    48: '/icons/icon-48.png',
    64: '/icons/icon-64.png',
  };

  function flashPrefetch(tabId: number): void {
    // Clear existing restore timer (debounce)
    const prev = prefetchTimer.get(tabId);
    if (prev) clearTimeout(prev);

    // Swap icon to orange bolt + hide badge text during flash
    try {
      void actionApi?.setIcon?.({ tabId, path: BOLT_ICON });
      void actionApi?.setBadgeText?.({ tabId, text: '' });
    } catch { /* ignore */ }

    // Restore after 1.5 s
    const timer = setTimeout(() => {
      prefetchTimer.delete(tabId);
      const base = badgeBase.get(tabId);
      if (base && base.text) {
        // Has alternates — restore default icon + badge
        try { void actionApi?.setIcon?.({ tabId, path: DEFAULT_ICON }); } catch { /* ignore */ }
        applyBadge(tabId, base);
      } else {
        // No alternates — show blue "warm" icon (acceleration active)
        try { void actionApi?.setIcon?.({ tabId, path: WARM_ICON }); } catch { /* ignore */ }
      }
    }, 1500);
    prefetchTimer.set(tabId, timer);
  }

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
    void fetch(next, { mode: 'no-cors', credentials: 'omit', redirect: 'manual' })
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
  const OPERA = import.meta.env.BROWSER === 'opera';

  // Track SERP panel state per tab for smart icon click.
  // Content script reports 'expanded' | 'dismissed' | 'none' via SET_SERP_STATE.
  // This lets onClicked decide *synchronously* — no async gap before sidePanel.open().
  const serpState = new Map<number, 'expanded' | 'dismissed'>();
  try {
    browser.tabs.onRemoved.addListener((tabId) => {
      serpState.delete(tabId);
      badgeBase.delete(tabId);
      const t = prefetchTimer.get(tabId);
      if (t) { clearTimeout(t); prefetchTimer.delete(tabId); }
    });
  } catch { /* ignore */ }

  // Chrome/Edge: icon click
  if (!import.meta.env.FIREFOX && !OPERA && actionApi?.onClicked) {
    actionApi.onClicked.addListener((tab) => {
      if (tab?.id && serpState.get(tab.id) === 'dismissed') {
        // Re-expand dismissed SERP panel (fire-and-forget)
        browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_SERP_PANEL' }).catch(() => {});
        serpState.set(tab.id, 'expanded');
      } else {
        // Open settings side panel
        try {
          const sp = (browser as any).sidePanel;
          if (sp?.open && tab?.id) sp.open({ tabId: tab.id }).catch(() => {});
        } catch { /* ignore */ }
      }
    });
  }

  // Firefox & Opera: default_popup is set in manifest → dynamically cleared
  // when SERP panel is dismissed so onClicked fires for smart re-expand.
  if ((import.meta.env.FIREFOX || OPERA) && actionApi?.onClicked) {
    actionApi.onClicked.addListener((tab) => {
      if (tab?.id && serpState.get(tab.id) === 'dismissed') {
        browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_SERP_PANEL' }).catch(() => {});
        serpState.set(tab.id, 'expanded');
        // Restore popup so next click opens settings again
        try { void actionApi.setPopup({ tabId: tab.id, popup: 'sidepanel.html' }); } catch { /* ignore */ }
      }
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
  const BUNDLE_BASE = 'https://bundle.fastweb.cam';

  function getBrowserLocale(): string {
    try {
      const lang = chrome.i18n.getUILanguage();
      return (lang || 'en').split(/[-_]/)[0].toLowerCase();
    } catch { return 'en'; }
  }

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

  async function fetchRemoteBundle(): Promise<void> {
    const locale = getBrowserLocale();
    const urls = [
      `${BUNDLE_BASE}/bundle/${locale}.json`,
      ...(locale !== 'en' ? [`${BUNDLE_BASE}/bundle/en.json`] : []),
    ];
    for (const url of urls) {
      try {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) continue;
        await syncBundle(await resp.json());
        return;
      } catch { /* try next */ }
    }
  }

  async function loadLocalBundle(): Promise<void> {
    try {
      const local = await fetch(browser.runtime.getURL('/bundle.json'));
      await syncBundle(await local.json());
    } catch { /* silent */ }
  }

  async function fetchAndSyncBundle(): Promise<void> {
    // Respect cooldown — user deleted bundle, retry after 30 days
    try {
      const data = await browser.storage.sync.get({ bundleDisabledUntil: 0 });
      const until = Number(data.bundleDisabledUntil) || 0;
      if (until && Date.now() < until) return;
      // Cooldown expired — clear flag and proceed
      if (until) {
        await browser.storage.sync.set({ bundleDisabledUntil: 0 });
      }
    } catch { /* ignore */ }

    await fetchRemoteBundle();
  }

  // Daily alarm — sync bundle every 24 h
  void browser.alarms.create(BUNDLE_ALARM, { periodInMinutes: 24 * 60 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BUNDLE_ALARM) void fetchAndSyncBundle();
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      void loadLocalBundle();
    } else if (reason === 'update') {
      void fetchAndSyncBundle();
    }
  });

  // --- Unified message handler ---
  browser.runtime.onMessage.addListener(
    ((msg: RequestMessage, sender: any, sendResponse: (r?: any) => void) => {
      if (!msg?.type) return;

      switch (msg.type) {
        case 'OPEN_SETTINGS': {
          if (import.meta.env.FIREFOX) {
            try { (browser as any).sidebarAction.open(); } catch { /* ignore */ }
          } else if (!OPERA) {
            // Chrome/Edge: sidePanel.open()
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
            // Flash ⚡ on the tab badge
            const tabId = sender?.tab?.id;
            if (tabId) flashPrefetch(tabId);
          }
          sendResponse?.({ ok: true });
          break;
        }

        case 'SET_SERP_STATE': {
          const tabId = sender?.tab?.id;
          if (tabId) {
            const st = (msg as any).state;
            if (st === 'none') serpState.delete(tabId);
            else serpState.set(tabId, st);
            // Firefox & Opera: clear popup when dismissed so onClicked fires; restore otherwise
            if (import.meta.env.FIREFOX || OPERA) {
              try {
                void actionApi?.setPopup?.({
                  tabId,
                  popup: st === 'dismissed' ? '' : 'sidepanel.html',
                });
              } catch { /* ignore */ }
            }
          }
          break;
        }

        case 'SET_BADGE': {
          const n = Math.max(0, parseInt(String(msg.count || 0), 10) || 0);
          const tabId = sender?.tab?.id;
          const base: BadgeState = {
            text: n > 0 ? String(n) : '',
            color: msg.color || BADGE_COLORS.alts,
            title: msg.title || '',
          };
          // Always save base state
          if (tabId) badgeBase.set(tabId, base);
          // Apply visually only if no active flash
          if (!tabId || !prefetchTimer.has(tabId)) {
            applyBadge(tabId || 0, base);
          }
          sendResponse?.({ ok: true });
          break;
        }
      }
    }) as (...args: any[]) => void,
  );
});
