import { applyI18n } from '@shared/i18n';
import { createIcon } from '@shared/ui-helpers';
import type { TabHintData, HintPayload, BookmarkEntry } from '@shared/types';

applyI18n();

const hintsBox = document.getElementById('popup-hints');

// --- Open settings ---
const openBtn = document.querySelector('[data-action="open-settings"]');
if (openBtn) {
  openBtn.addEventListener('click', () => {
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
    } catch { /* ignore */ }
    window.close();
  });
}

// --- Pill helper ---
function createPill(href: string, text: string): HTMLAnchorElement {
  const pill = document.createElement('a');
  pill.className = 'ah-pill';
  pill.href = href;
  pill.target = '_blank';
  pill.rel = 'noreferrer';
  const label = document.createElement('span');
  label.className = 'ah-pill-label';
  label.textContent = text;
  const arrow = document.createElement('span');
  arrow.className = 'ah-pill-arrow';
  arrow.textContent = '\u2B62';
  pill.append(label, arrow);
  return pill;
}

// --- Renderers ---
function renderEmpty(): void {
  if (!hintsBox) return;
  hintsBox.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'popup-hints-empty';
  empty.textContent = 'Open a search results page (Google, Yandex, Bing) to see tips.';
  hintsBox.appendChild(empty);
}

function renderWaiting(): void {
  if (!hintsBox) return;
  hintsBox.innerHTML = '';
  const note = document.createElement('div');
  note.className = 'popup-hints-empty';
  note.textContent = 'Loading hints\u2026';
  hintsBox.appendChild(note);
}

function renderHints(data: TabHintData | null): void {
  if (!hintsBox) return;
  if (!data?.hints || !(data.hints.count > 0)) { renderEmpty(); return; }

  const { url, hints } = data;
  const alternates = Array.isArray(hints.alternates) ? hints.alternates : [];
  const bookmarks: BookmarkEntry[] = Array.isArray(hints.bookmarks) ? hints.bookmarks : [];
  const tips: string[] = Array.isArray(hints.tips) ? hints.tips : [];

  hintsBox.innerHTML = '';
  const groups: HTMLElement[] = [];

  if (alternates.length) {
    const g = document.createElement('div');
    g.className = 'popup-hints-group';
    const title = document.createElement('div');
    title.className = 'popup-hints-title';
    title.prepend(createIcon('unlocked', 'sm', 'ok'));
    title.appendChild(document.createTextNode('Official alternates'));
    g.appendChild(title);
    alternates.forEach((alt) => {
      const note = document.createElement('div');
      note.className = 'ah-muted';
      note.textContent = alt.domain;
      const row = document.createElement('div');
      row.className = 'ah-pill-row';
      (alt.alternates || []).forEach((a) => {
        const link = createPill(a, a.replace(/^https?:\/\//i, ''));
        link.title = a;
        row.appendChild(link);
      });
      g.append(note, row);
    });
    groups.push(g);
  }

  if (bookmarks.length) {
    const g = document.createElement('div');
    g.className = 'popup-hints-group';
    const title = document.createElement('div');
    title.className = 'popup-hints-title';
    title.prepend(createIcon('brand', 'sm', 'main'));
    title.appendChild(document.createTextNode('Related bookmarks'));
    g.appendChild(title);
    const row = document.createElement('div');
    row.className = 'ah-pill-row';
    bookmarks.forEach((b) => {
      row.appendChild(createPill(b.url, b.title || b.url));
    });
    g.appendChild(row);
    groups.push(g);
  }

  if (tips.length) {
    const g = document.createElement('div');
    g.className = 'popup-hints-group';
    const title = document.createElement('div');
    title.className = 'popup-hints-title';
    title.prepend(createIcon('brand', 'sm', 'muted'));
    title.appendChild(document.createTextNode('Query tips'));
    g.appendChild(title);
    tips.forEach((t) => {
      const tipEl = document.createElement('div');
      tipEl.className = 'ah-tip';
      tipEl.innerHTML = t;
      g.appendChild(tipEl);
    });
    groups.push(g);
  }

  if (url) {
    const g = document.createElement('div');
    g.className = 'popup-hints-group';
    const btn = document.createElement('a');
    btn.className = 'ah-btn ah-btn-outline';
    btn.href = `https://web.archive.org/web/*/${encodeURIComponent(url)}`;
    btn.target = '_blank';
    btn.rel = 'noreferrer';
    btn.textContent = 'Open in Wayback Machine';
    btn.prepend(createIcon('unlocked', 'sm', 'ok'));
    g.appendChild(btn);
    groups.push(g);
  }

  if (!groups.length) { renderEmpty(); return; }
  groups.forEach((g) => hintsBox.appendChild(g));
}

// --- Load hints for current tab ---
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs?.[0];
  if (!tab) { renderEmpty(); return; }

  renderWaiting();
  try {
    chrome.runtime.sendMessage(
      { type: 'GET_HINTS_FOR_TAB', tabId: tab.id },
      (res: { data: TabHintData | null } | undefined) => {
        if (chrome.runtime.lastError) { renderEmpty(); return; }
        renderHints(res?.data ?? null);
      },
    );
  } catch {
    renderEmpty();
  }
});
