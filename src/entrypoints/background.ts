import { browser } from 'wxt/browser';
import type { BookmarkEntry } from '@shared/types';
import type { RequestMessage } from '@shared/messaging';
import { BADGE_COLORS } from '@shared/constants';

export default defineBackground(() => {
  // --- Side panel / sidebar ---
  // sidePanel.open() requires user gesture — only works from onClicked, NOT from onMessage.
  // For onMessage (Settings button) we always open in a new tab.

  async function openSidePanelWithGesture(tabId: number): Promise<void> {
    // Chrome/Edge: sidePanel API
    try {
      if ((browser as any).sidePanel?.open) {
        await (browser as any).sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true });
        try {
          await (browser as any).sidePanel.open({ tabId });
          return;
        } catch {
          // tabId might be a chrome:// page — try windowId fallback
          const win = await browser.windows.getCurrent();
          if (win?.id) {
            await (browser as any).sidePanel.open({ windowId: win.id });
            return;
          }
        }
      }
    } catch { /* fallback */ }

    // Firefox: sidebarAction (always available in onClicked context)
    try {
      if ((browser as any).sidebarAction?.open) {
        await (browser as any).sidebarAction.open();
        return;
      }
    } catch { /* fallback */ }

    // Last resort: open as tab
    await browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') });
  }

  function openSettingsInTab(): void {
    browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') });
  }

  // --- Badge ---
  function getBadgeCount(tabId: number): Promise<number> {
    return new Promise((resolve) => {
      try {
        if (!browser?.action?.getBadgeText) return resolve(0);
        browser.action.getBadgeText({ tabId }).then(
          (text) => {
            const n = parseInt(text || '', 10);
            resolve(Number.isFinite(n) ? n : 0);
          },
          () => resolve(0),
        );
      } catch { resolve(0); }
    });
  }

  function requestTogglePanel(tabId: number): Promise<{ ok: boolean }> {
    return new Promise((resolve) => {
      try {
        browser.tabs.sendMessage(tabId, { type: 'TOGGLE_SERP_PANEL' }).then(
          (resp: any) => resolve(resp && typeof resp === 'object' ? resp : { ok: false }),
          () => resolve({ ok: false }),
        );
      } catch {
        resolve({ ok: false });
      }
    });
  }

  function isEmptyTab(tab: { url?: string }): boolean {
    const url = String(tab?.url || '').trim();
    if (!url) return true;
    return (
      /^about:(blank|newtab|home)/i.test(url) ||
      /^(chrome|edge|moz-extension):\/\//i.test(url) ||
      /^chrome-search:\/\//i.test(url)
    );
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

  // --- Action click (has user gesture → sidePanel.open works) ---
  if (browser?.action?.onClicked) {
    browser.action.onClicked.addListener(async (tab) => {
      if (!tab?.id) return;
      try {
        if (isEmptyTab(tab)) {
          await openSidePanelWithGesture(tab.id);
          return;
        }
        const badgeCount = await getBadgeCount(tab.id);
        if (badgeCount > 0) {
          const resp = await requestTogglePanel(tab.id);
          if (!resp?.ok) await openSidePanelWithGesture(tab.id);
        } else {
          await openSidePanelWithGesture(tab.id);
        }
      } catch {
        await openSidePanelWithGesture(tab.id!);
      }
    });
  }

  // --- Unified message handler ---
  browser.runtime.onMessage.addListener(
    ((msg: RequestMessage, sender: any, sendResponse: (r?: any) => void) => {
      if (!msg?.type) return;

      switch (msg.type) {
        case 'OPEN_SETTINGS':
          // No user gesture in onMessage → sidePanel.open() won't work.
          // Firefox sidebarAction is always visible once registered, so just toggle it.
          try {
            if ((browser as any).sidebarAction?.open) {
              (browser as any).sidebarAction.open();
              break;
            }
          } catch { /* ignore */ }
          openSettingsInTab();
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
            }
          } catch { /* ignore */ }
          sendResponse?.({ ok: true });
          break;
        }
      }
    }) as (...args: any[]) => void,
  );
});
