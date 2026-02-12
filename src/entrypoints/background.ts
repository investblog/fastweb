import type { TabHintData, BookmarkEntry } from '@shared/types';
import type { RequestMessage } from '@shared/messaging';
import { BADGE_COLOR } from '@shared/constants';

export default defineBackground(() => {
  const tabHints = new Map<number, TabHintData>();

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
        chrome.action.getBadgeText({ tabId }, (text) => {
          if (chrome.runtime.lastError) return resolve(0);
          const n = parseInt(text || '', 10);
          resolve(Number.isFinite(n) ? n : 0);
        });
      } catch { resolve(0); }
    });
  }

  function requestSerpPanel(tabId: number): Promise<{ ok: boolean }> {
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, { type: 'SHOW_SERP_PANEL' }, (resp) => {
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

  // --- Action click ---
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab?.id) return;
    try {
      if (isEmptyTab(tab)) {
        await openSettingsInSidePanel(tab.id);
        return;
      }
      const badgeCount = await getBadgeCount(tab.id);
      if (badgeCount > 0) {
        const resp = await requestSerpPanel(tab.id);
        if (!resp?.ok) await openSettingsInSidePanel(tab.id);
      } else {
        await openSettingsInSidePanel(tab.id);
      }
    } catch {
      await openSettingsInSidePanel(tab.id!);
    }
  });

  // --- Unified message handler ---
  chrome.runtime.onMessage.addListener(
    (msg: RequestMessage, sender: chrome.runtime.MessageSender, sendResponse) => {
      if (!msg?.type) return;

      switch (msg.type) {
        case 'OPEN_SETTINGS':
          if (sender?.tab?.id) openSettingsInSidePanel(sender.tab.id);
          break;

        case 'HINTS_UPDATED': {
          const tabId = sender?.tab?.id ?? msg.tabId;
          if (tabId != null) {
            tabHints.set(tabId, { url: msg.url, hints: msg.hints });
          }
          break;
        }

        case 'GET_HINTS_FOR_TAB': {
          const data = tabHints.get(msg.tabId) || null;
          sendResponse({ data });
          return true;
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

        case 'SET_BADGE': {
          const n = Math.max(0, parseInt(String(msg.count || 0), 10) || 0);
          try {
            chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
            chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
          } catch { /* ignore */ }
          sendResponse?.({ ok: true });
          break;
        }
      }
    },
  );

  // --- Cleanup on tab close ---
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabHints.delete(tabId);
  });
});
