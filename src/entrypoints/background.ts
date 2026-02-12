import { browser } from 'wxt/browser';
import type { BookmarkEntry } from '@shared/types';
import type { RequestMessage } from '@shared/messaging';
import { BADGE_COLORS } from '@shared/constants';

export default defineBackground(() => {
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
  if (browser?.action?.onClicked) {
    browser.action.onClicked.addListener(async () => {
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

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') autoLoadBundle();
  });

  // --- Unified message handler ---
  browser.runtime.onMessage.addListener(
    ((msg: RequestMessage, sender: any, sendResponse: (r?: any) => void) => {
      if (!msg?.type) return;

      switch (msg.type) {
        case 'OPEN_SETTINGS':
          // Firefox: sidebarAction works from onMessage (no gesture needed)
          try {
            if ((browser as any).sidebarAction?.open) {
              (browser as any).sidebarAction.open();
              break;
            }
          } catch { /* ignore */ }
          // Chrome/Edge: sidePanel is already openable via icon click (setPanelBehavior).
          // From onMessage we open a compact popup window as fallback.
          browser.windows.create({
            url: browser.runtime.getURL('/sidepanel.html'),
            type: 'popup',
            width: 420,
            height: 700,
          });
          break;

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

        case 'SET_BADGE': {
          const n = Math.max(0, parseInt(String(msg.count || 0), 10) || 0);
          const tabId = sender?.tab?.id;
          try {
            if (browser?.action?.setBadgeText) {
              const opts = tabId ? { tabId } : {};
              browser.action.setBadgeBackgroundColor({ ...opts, color: msg.color || BADGE_COLORS.alts });
              browser.action.setBadgeText({ ...opts, text: n > 0 ? String(n) : '' });
              if (browser.action.setTitle) {
                browser.action.setTitle({ ...opts, title: msg.title || '' });
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
