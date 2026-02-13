import { browser } from 'wxt/browser';
import type { BookmarkEntry } from '@shared/types';
import type { RequestMessage } from '@shared/messaging';
import { BADGE_COLORS } from '@shared/constants';

export default defineBackground(() => {
  // browser.action (MV3 Chrome/Edge) vs browser.browserAction (Firefox MV2)
  // WXT polyfill returns native browser object on Firefox, which only has browserAction in MV2.
  const actionApi: typeof browser.action =
    (browser as any).action || (browser as any).browserAction;

  // --- Side panel / sidebar ---
  // Chrome/Edge: setPanelBehavior({ openPanelOnActionClick: true }) — icon click opens side panel.
  // Firefox: sidebarAction.open() from onClicked (has user gesture).

  // Chrome/Edge: icon click → side panel opens directly (no onClicked needed)
  try {
    if ((browser as any).sidePanel?.setPanelBehavior) {
      (browser as any).sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch { /* not available */ }

  // Firefox: onClicked fires (no sidePanel API) → open sidebar
  if (actionApi?.onClicked) {
    actionApi.onClicked.addListener(async () => {
      try {
        if ((browser as any).sidebarAction?.open) {
          await (browser as any).sidebarAction.open();
          return;
        }
      } catch { /* fallback */ }
      // Fallback: open as tab
      await browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') });
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

  // --- Auto-load bundle on first install ---
  async function autoLoadBundle(): Promise<void> {
    try {
      const resp = await fetch('https://raw.githubusercontent.com/investblog/fastweb/main/src/public/bundle.json', { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const bundle = await resp.json();
      await mergeBundle(bundle);
    } catch {
      try {
        const local = await fetch(browser.runtime.getURL('/bundle.json'));
        const bundle = await local.json();
        await mergeBundle(bundle);
      } catch { /* silent */ }
    }
  }

  async function mergeBundle(bundle: Record<string, unknown>): Promise<void> {
    if (!bundle || typeof bundle !== 'object') return;
    const data = await browser.storage.sync.get({ alternates: {} });
    const map = (data.alternates || {}) as Record<string, string[]>;
    const bundleKeys: string[] = [];
    for (const [key, alts] of Object.entries(bundle)) {
      bundleKeys.push(key);
      if (!map[key] && Array.isArray(alts)) {
        map[key] = alts as string[];
      }
    }
    await browser.storage.sync.set({ alternates: map, bundleDomains: bundleKeys });
  }

  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'install') {
      autoLoadBundle();
    } else if (reason === 'update') {
      // Auto-load bundle on update/reload if alternates are empty
      try {
        const data = await browser.storage.sync.get({ alternates: {} });
        if (!data.alternates || !Object.keys(data.alternates).length) {
          autoLoadBundle();
        }
      } catch { /* ignore */ }
    }
  });

  // --- Unified message handler ---
  browser.runtime.onMessage.addListener(
    ((msg: RequestMessage, sender: any, sendResponse: (r?: any) => void) => {
      if (!msg?.type) return;

      switch (msg.type) {
        case 'OPEN_SETTINGS': {
          // Async: sidebarAction.open() returns a promise that rejects without user gesture
          (async () => {
            // Firefox: sidebarAction.open() — works only if user gesture context
            try {
              if ((browser as any).sidebarAction?.open) {
                await (browser as any).sidebarAction.open();
                return;
              }
            } catch { /* no gesture — fall through */ }
            // Chrome/Edge: sidePanel.open({ tabId }) — no gesture needed
            try {
              if ((browser as any).sidePanel?.open && sender?.tab?.id) {
                await (browser as any).sidePanel.open({ tabId: sender.tab.id });
                return;
              }
            } catch { /* ignore */ }
            // Fallback: open as tab
            browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') });
          })();
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
            // redirect: 'manual' — warmup only needs DNS+TCP+TLS, don't follow redirect chains
            fetch(url, { mode: 'no-cors', credentials: 'omit', redirect: 'manual' }).catch(() => {});
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
