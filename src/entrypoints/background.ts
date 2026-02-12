import type { BookmarkEntry } from '@shared/types';
import type { RequestMessage } from '@shared/messaging';
import { BADGE_COLORS } from '@shared/constants';

export default defineBackground(() => {
  // --- Cross-browser action API (MV3: chrome.action, MV2: chrome.browserAction) ---
  const actionAPI: typeof chrome.action | null = (() => {
    try {
      if (typeof chrome !== 'undefined') {
        if (chrome.action) return chrome.action;
        if ((chrome as any).browserAction) return (chrome as any).browserAction;
      }
      if (typeof browser !== 'undefined') {
        if ((browser as any).action) return (browser as any).action;
        if ((browser as any).browserAction) return (browser as any).browserAction;
      }
    } catch { /* ignore */ }
    return null;
  })();

  async function openSettingsInSidePanel(tabId: number): Promise<void> {
    try {
      if (
        typeof chrome !== 'undefined' &&
        chrome.sidePanel &&
        typeof chrome.sidePanel.open === 'function'
      ) {
        await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true });
        await chrome.sidePanel.open({ tabId });
        return;
      }
    } catch { /* fallback */ }

    try {
      if (
        typeof browser !== 'undefined' &&
        (browser as any).sidebarAction
      ) {
        (browser as any).sidebarAction.open();
        return;
      }
    } catch { /* fallback */ }

    await chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
  }

  function getBadgeCount(tabId: number): Promise<number> {
    return new Promise((resolve) => {
      try {
        if (!actionAPI) return resolve(0);
        actionAPI.getBadgeText({ tabId }, (text) => {
          if (chrome.runtime.lastError) return resolve(0);
          const n = parseInt(text || '', 10);
          resolve(Number.isFinite(n) ? n : 0);
        });
      } catch { resolve(0); }
    });
  }

  function requestTogglePanel(tabId: number): Promise<{ ok: boolean }> {
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_SERP_PANEL' }, (resp) => {
          if (chrome.runtime.lastError) return resolve({ ok: false });
          resolve(resp && typeof resp === 'object' ? resp : { ok: false });
        });
      } catch {
        resolve({ ok: false });
      }
    });
  }

  function isEmptyTab(tab: chrome.tabs.Tab): boolean {
    const url = String(tab?.url || '').trim();
    if (!url) return true;
    return (
      /^about:blank$/i.test(url) ||
      /^(chrome|edge):\/\/newtab\/?/i.test(url) ||
      /^chrome-search:\/\/local-ntp\//i.test(url)
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
        const local = await fetch(chrome.runtime.getURL('bundle.json'));
        const bundle = await local.json();
        await mergeBundle(bundle);
      } catch { /* silent */ }
    }
  }

  async function mergeBundle(bundle: Record<string, unknown>): Promise<void> {
    if (!bundle || typeof bundle !== 'object') return;
    const { alternates = {} } = await new Promise<Record<string, unknown>>((r) =>
      chrome.storage.sync.get({ alternates: {} }, r));
    const map = (alternates || {}) as Record<string, string[]>;
    const bundleKeys: string[] = [];
    for (const [key, alts] of Object.entries(bundle)) {
      bundleKeys.push(key);
      if (!map[key] && Array.isArray(alts)) {
        map[key] = alts as string[];
      }
    }
    await new Promise<void>((r) =>
      chrome.storage.sync.set({ alternates: map, bundleDomains: bundleKeys }, () => r()));
  }

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') autoLoadBundle();
  });

  // --- Action click ---
  if (actionAPI) {
    actionAPI.onClicked.addListener(async (tab: chrome.tabs.Tab) => {
      if (!tab?.id) return;
      try {
        if (isEmptyTab(tab)) {
          await openSettingsInSidePanel(tab.id);
          return;
        }
        const badgeCount = await getBadgeCount(tab.id);
        if (badgeCount > 0) {
          const resp = await requestTogglePanel(tab.id);
          if (!resp?.ok) await openSettingsInSidePanel(tab.id);
        } else {
          await openSettingsInSidePanel(tab.id);
        }
      } catch {
        await openSettingsInSidePanel(tab.id!);
      }
    });
  }

  // --- Unified message handler ---
  chrome.runtime.onMessage.addListener(
    (msg: RequestMessage, sender: chrome.runtime.MessageSender, sendResponse) => {
      if (!msg?.type) return;

      switch (msg.type) {
        case 'OPEN_SETTINGS':
          if (sender?.tab?.id) {
            openSettingsInSidePanel(sender.tab.id).catch(() => {
              chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
            });
          }
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
            if (actionAPI) {
              const opts = tabId ? { tabId } : {};
              actionAPI.setBadgeBackgroundColor({ ...opts, color: msg.color || BADGE_COLORS.alts });
              actionAPI.setBadgeText({ ...opts, text: n > 0 ? String(n) : '' });
            }
          } catch { /* ignore */ }
          sendResponse?.({ ok: true });
          break;
        }
      }
    },
  );
});
