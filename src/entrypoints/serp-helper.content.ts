import { detectSerpContext, getQuery, getQueryFromDom, findDomainsInQuery, toHref, toHost } from '@shared/url-utils';
import { tokenizeQuery, matchAlternatesByBrandTokens, ruToLat } from '@shared/tokenizer';
import { DEFAULT_PREFS, STORAGE_DEFAULTS, TLD_STOP, BADGE_COLORS } from '@shared/constants';
import { createIcon } from '@shared/ui-helpers';
import { _ } from '@shared/i18n';
import type { Prefs, AlternatesMap, BookmarkEntry } from '@shared/types';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_end',

  main() {
    if (!detectSerpContext()) return;

    let __prefs: Prefs = { ...DEFAULT_PREFS };
    let __theme: 'dark' | 'light' | 'auto' = 'auto';

    function resolveTheme(): 'dark' | 'light' {
      if (__theme === 'dark' || __theme === 'light') return __theme;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(): void {
      const el = document.getElementById('ah-root');
      if (!el) return;
      if (resolveTheme() === 'light') el.classList.add('ah-light');
      else el.classList.remove('ah-light');
    }

    function makeSvg(markup: string): SVGElement {
      const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement as unknown as SVGElement;
      svg.setAttribute('aria-hidden', 'true');
      return svg;
    }
    const BOLT_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M9.09 7.7v1.39h3.42l-1.6 3.21v-1.39H7.49zM10.91 0 4.544 12.727H9.09V20l6.364-12.727h-4.546z" fill="currentColor"/></svg>';
    const BOOKMARK_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.273 0h9.09a1.82 1.82 0 0 1 1.819 1.818v14.546l-1.818-.791V1.818H5.454A1.82 1.82 0 0 1 7.274 0m5.454 17.273V5.455h-9.09v11.818l4.545-1.982zm0-13.637c1.01 0 1.818.819 1.818 1.819V20l-6.363-2.727L1.818 20V5.455a1.82 1.82 0 0 1 1.818-1.819z" fill="currentColor"/></svg>';
    const THEME_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5.795.51a6.28 6.28 0 0 0-2.883 5.285 6.24 6.24 0 0 0 2.912 5.286C2.874 11.081.51 8.717.51 5.795A5.286 5.286 0 0 1 5.795.51m11.12 1.441 1.374 1.374L3.325 18.29l-1.374-1.374zm-5.94 2.335-1.422-.893-1.384.96.404-1.633L7.237 1.7l1.682-.115L9.476 0l.644 1.567 1.663.028-1.298 1.086zm-3.171 3.47-1.115-.702-1.076.75.326-1.269-1.047-.797 1.307-.087.432-1.24.49 1.22 1.308.03-1.01.836zm9.044 3.806a5.286 5.286 0 0 1-8.42 4.257l7.391-7.39a5.27 5.27 0 0 1 1.029 3.133m-4.23 6.324 2.663-1.106-.23 3.22zm4.162-2.595 1.106-2.662L20 15.069zm1.106-4.767L16.79 7.852l3.21.23zM7.842 16.78l2.663 1.106-2.432 2.104z" fill="currentColor"/></svg>';

    function hasRuntime(): boolean {
      try {
        return typeof chrome !== 'undefined' && !!(chrome.runtime?.id);
      } catch { return false; }
    }

    function getPrefsAndAlternates(callback: (data: { alternates: AlternatesMap; prefs: Prefs }) => void): void {
      const fallback = { alternates: {} as AlternatesMap, prefs: DEFAULT_PREFS };
      try {
        if (!hasRuntime() || !chrome.storage?.sync) throw new Error('no storage');
        chrome.storage.sync.get({ ...STORAGE_DEFAULTS, theme: 'auto' }, (data) => {
          try {
            const payload = data && typeof data === 'object' ? data : fallback;
            const t = (payload as Record<string, unknown>).theme;
            __theme = (t === 'dark' || t === 'light') ? t : 'auto';
            callback({
              alternates: (payload.alternates || {}) as AlternatesMap,
              prefs: (payload.prefs || DEFAULT_PREFS) as Prefs,
            });
          } catch { /* ignore */ }
        });
      } catch {
        try { callback(fallback); } catch { /* ignore */ }
      }
    }

    // --- Panel styles ---
    const PANEL_STYLE_ID = 'ah-serp-style';

    function ensurePanelStyles(): void {
      if (document.getElementById(PANEL_STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = PANEL_STYLE_ID;
      style.textContent = `
      #ah-root {
        --ah-bg: #050812;
        --ah-bg-gradient: radial-gradient(circle at top left, #111827 0, #050812 50%);
        --ah-card: #0b1020;
        --ah-card-soft: #101625;
        --ah-border-subtle: rgba(255,255,255,.04);
        --ah-border-strong: #252c3c;
        --ah-text: #E7E9F0;
        --ah-muted: #9BA3B4;
        --ah-accent: #5E8BFF;
        --ah-accent-soft: rgba(94,139,255,.16);
        --ah-radius: 12px;
        --ah-radius-pill: 999px;
        --ah-shadow-soft: 0 18px 45px rgba(0,0,0,.55);
        --ah-font: system-ui, -apple-system, "Segoe UI", sans-serif;
        --ah-font-size: 13px;
      }
      #ah-root.ah-light {
          --ah-bg: #f8fafc;
          --ah-bg-gradient: radial-gradient(circle at top left, #e2e8f0 0, #f8fafc 55%);
          --ah-card: #ffffff;
          --ah-card-soft: #f1f5f9;
          --ah-border-subtle: rgba(15,23,42,.08);
          --ah-border-strong: rgba(15,23,42,.16);
          --ah-text: #0f172a;
          --ah-muted: #475569;
          --ah-accent: #2563eb;
          --ah-accent-soft: rgba(37,99,235,.12);
          --ah-shadow-soft: 0 16px 40px rgba(15,23,42,.12);
      }
      #ah-root {
        position: fixed; top: 64px; inset-inline-end: 86px; z-index: 999999;
        font-family: var(--ah-font); font-size: var(--ah-font-size); color: var(--ah-text);
        min-width: 0;
      }
      #ah-root * { box-sizing: border-box; font-family: inherit; }
      #ah-root button { background: none; border: none; padding: 0; color: inherit; font: inherit; }
      #ah-root .ah-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        padding: 6px 12px; border-radius: var(--ah-radius-pill); border: 1px solid transparent;
        cursor: pointer; font-weight: 600;
        transition: border-color .15s ease, color .15s ease, background .15s ease, filter .15s ease;
      }
      #ah-root .ah-btn:focus-visible { outline: 2px solid var(--ah-accent); outline-offset: 2px; }
      #ah-root .ah-btn-outline { background: transparent; border-color: var(--ah-border-strong); color: var(--ah-text); }
      #ah-root .ah-btn-outline:hover { color: var(--ah-accent); border-color: var(--ah-accent); background: var(--ah-accent-soft); }
      #ah-root .ah-btn-ghost { background: var(--ah-card-soft); border-color: var(--ah-border-subtle); color: var(--ah-muted); }
      #ah-root .ah-btn-ghost:hover { color: var(--ah-text); border-color: var(--ah-accent); }
      .ah-icon { display: inline-flex; width: 16px; height: 16px; vertical-align: middle; flex: 0 0 auto; }
      .ah-icon img, .ah-icon svg { width: 100%; height: 100%; display: block; }
      .ah-icon--sm { width: 14px; height: 14px; }
      .ah-icon--lg { width: 20px; height: 20px; }
      #ah-root .ah-panel {
        background: var(--ah-card); border-radius: var(--ah-radius);
        border: 1px solid var(--ah-border-subtle); box-shadow: var(--ah-shadow-soft);
        padding: 14px 18px; max-width: 90vw; width: 360px;
        max-height: min(70vh, 520px); overflow-y: auto;
      }
      #ah-root.ah-root--collapsed .ah-panel { display: none; }
      #ah-root .ah-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      #ah-root .ah-panel-close {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; border-radius: 6px;
        color: var(--ah-muted); transition: color .15s ease, background .15s ease;
      }
      #ah-root .ah-panel-close:hover { color: var(--ah-text); background: var(--ah-accent-soft); }
      #ah-root .ah-panel-close:focus-visible { outline: 2px solid var(--ah-accent); outline-offset: 2px; }
      #ah-root .ah-panel-close svg { width: 16px; height: 16px; }
      #ah-root .ah-panel-title { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--ah-text); }
      #ah-root .ah-section { display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--ah-border-subtle); }
      #ah-root .ah-section.active { display: block; }
      #ah-root .ah-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; font-weight: 600; color: var(--ah-muted); }
      #ah-root .ah-pill-row { display: flex; flex-wrap: wrap; gap: 10px; }
      #ah-root .ah-pill {
        display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px;
        border-radius: var(--ah-radius-pill); border: 1px solid var(--ah-border-subtle);
        background: var(--ah-card-soft); color: var(--ah-text); text-decoration: none; font-size: 12px;
        transition: border-color .15s ease, color .15s ease, background .15s ease;
      }
      #ah-root .ah-pill:hover { border-color: var(--ah-accent); color: var(--ah-accent); }
      #ah-root .ah-pill:focus-visible { outline: 2px solid var(--ah-accent); outline-offset: 2px; }
      #ah-root .ah-pill-label { display: inline-flex; align-items: center; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #ah-root .ah-pill-arrow { color: var(--ah-muted); font-size: 12px; }
      #ah-root .ah-pill-icon { border-radius: calc(var(--ah-radius) / 2); width: 16px; height: 16px; object-fit: cover; }
      #ah-root .ah-search { position: relative; padding: 0 0 8px; }
      #ah-root .ah-search-input {
        width: 100%; padding-block: 6px; padding-inline: 10px 30px; border-radius: var(--ah-radius-pill);
        border: 1px solid var(--ah-border-subtle); background: var(--ah-card-soft);
        color: var(--ah-text); font-family: inherit; font-size: 12px; outline: none;
      }
      #ah-root .ah-search-input:focus { border-color: var(--ah-accent); }
      #ah-root .ah-search-clear {
        position: absolute; inset-inline-end: 6px; top: 50%; transform: translateY(calc(-50% - 4px));
        display: none; align-items: center; justify-content: center;
        width: 20px; height: 20px; border-radius: 4px;
        color: var(--ah-muted); cursor: pointer; transition: color .15s ease, background .15s ease;
      }
      #ah-root .ah-search-clear:hover { color: var(--ah-text); background: var(--ah-accent-soft); }
      #ah-root .ah-search-clear:focus-visible { outline: 2px solid var(--ah-accent); outline-offset: 2px; }
      #ah-root .ah-search-clear svg { width: 12px; height: 12px; }
      #ah-root .ah-search.has-value .ah-search-clear { display: inline-flex; }
      #ah-root .ah-section-note { margin: 0 0 6px; color: var(--ah-muted); }
      #ah-root .ah-footer {
        margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--ah-border-subtle);
        display: flex; align-items: center; justify-content: flex-end; gap: 6px;
      }
      #ah-root .ah-footer-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
        color: var(--ah-muted); transition: color .15s ease, background .15s ease;
      }
      #ah-root .ah-footer-btn:hover { color: var(--ah-text); background: var(--ah-accent-soft); }
      #ah-root .ah-footer-btn:focus-visible { outline: 2px solid var(--ah-accent); outline-offset: 2px; }
      #ah-root .ah-footer-btn.is-active { color: var(--ah-accent); }
      #ah-root #ah-bolt.is-active { color: #F48120; }
      #ah-root .ah-footer-btn.is-disabled { opacity: 0.4; cursor: default; }
      #ah-root .ah-footer-btn svg { width: 16px; height: 16px; }
      #ah-root.ah-root--inline-hidden { display: none; }
    `;
      (document.head || document.documentElement).appendChild(style);
    }

    // --- Panel state ---
    const DISMISS_KEY = 'fw:dismissed';
    let userDismissed = isDismissedForQuery();

    function currentQuery(): string {
      return (getQuery() || getQueryFromDom() || '').trim().toLowerCase();
    }
    function isDismissedForQuery(): boolean {
      try {
        const stored = sessionStorage.getItem(DISMISS_KEY);
        return stored !== null && stored === currentQuery();
      } catch { return false; }
    }

    function setPanelExpanded(el: HTMLElement, expanded: boolean): void {
      if (expanded) el.classList.remove('ah-root--collapsed');
      else el.classList.add('ah-root--collapsed');
    }
    function collapsePanel(el: HTMLElement): void { setPanelExpanded(el, false); }
    function reportSerpState(state: 'expanded' | 'dismissed' | 'none'): void {
      try {
        if (hasRuntime()) void chrome.runtime?.sendMessage?.({ type: 'SET_SERP_STATE', state });
      } catch { /* ignore */ }
    }

    function dismissPanel(el: HTMLElement): void {
      userDismissed = true;
      try { sessionStorage.setItem(DISMISS_KEY, currentQuery()); } catch { /* ignore */ }
      collapsePanel(el);
      reportSerpState('dismissed');
    }

    function setBadge(count: number, altsCount: number, bmCount: number): void {
      try {
        if (!hasRuntime()) return;
        if (__prefs.showBadge === false) {
          // Clear any previously-set badge
          void chrome.runtime?.sendMessage?.({ type: 'SET_BADGE', count: 0, color: BADGE_COLORS.alts, title: '' });
          return;
        }
        const color = altsCount > 0 && bmCount > 0
          ? BADGE_COLORS.mixed
          : bmCount > 0
            ? BADGE_COLORS.bm
            : BADGE_COLORS.alts;
        const parts: string[] = [];
        if (altsCount > 0) parts.push(_('badgeAlts', `${altsCount} alts`, [String(altsCount)]));
        if (bmCount > 0) parts.push(_('badgeBookmarks', `${bmCount} bookmarks`, [String(bmCount)]));
        const title = parts.length ? `FastWeb: ${parts.join(', ')}` : '';
        void chrome.runtime?.sendMessage?.({ type: 'SET_BADGE', count: Math.max(0, count || 0), color, title });
      } catch { /* ignore */ }
    }

    // --- Bookmarks cache ---
    let __bmCache: BookmarkEntry[] | null = null;
    function fetchBookmarksOnce(): Promise<BookmarkEntry[]> {
      return new Promise((resolve) => {
        if (__bmCache) return resolve(__bmCache);
        try {
          if (!hasRuntime()) throw new Error('no-runtime');
          chrome.runtime?.sendMessage?.({ type: 'GET_BOOKMARKS' }, (resp: any) => {
            const list = resp?.ok && Array.isArray(resp.items) ? resp.items : [];
            __bmCache = list;
            resolve(list);
          });
        } catch { resolve([]); }
      });
    }

    // --- Inject panel (DOM-only, no innerHTML) ---
    const COG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M9.73 13.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46a.49.49 0 0 0-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98L12.23.42a.506.506 0 0 0-.5-.42h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L2.3 9c-.04.34-.07.67-.07 1s.03.65.07.97L.19 12.63c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64z" fill="currentColor"/></svg>';

    function h(tag: string, attrs: Record<string, string>, ...children: (Node | string)[]): HTMLElement {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') el.className = v;
        else el.setAttribute(k, v);
      }
      for (const c of children) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
      return el;
    }

    function injectPanel(): HTMLElement {
      ensurePanelStyles();
      let el = document.getElementById('ah-root');
      if (el) return el;
      searchFilterBound = false;

      const titleSpan = h('span', {}, _('serpPanelTitle', 'FastWeb'));
      const titleDiv = h('div', { className: 'ah-panel-title' }, titleSpan);
      const closeTip = _('serpHide', 'Hide');
      const closeBtn = h('button', { id: 'ah-close-x', className: 'ah-panel-close', type: 'button', 'aria-label': closeTip, title: closeTip });
      closeBtn.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M17 4.41 15.59 3 10 8.59 4.41 3 3 4.41 8.59 10 3 15.59 4.41 17 10 11.41 15.59 17 17 15.59 11.41 10z" fill="currentColor"/></svg>';
      const header = h('div', { className: 'ah-panel-header' }, titleDiv, closeBtn);

      const searchInput = h('input', { type: 'text', placeholder: _('serpFilterPlaceholder', 'Filter...'), className: 'ah-search-input', 'aria-label': _('searchLabel', 'Filter domains') });
      const searchClear = h('button', { type: 'button', className: 'ah-search-clear', 'aria-label': 'Clear' });
      searchClear.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M17 4.41 15.59 3 10 8.59 4.41 3 3 4.41 8.59 10 3 15.59 4.41 17 10 11.41 15.59 17 17 15.59 11.41 10z" fill="currentColor"/></svg>';
      const searchWrap = h('div', { id: 'ah-search', className: 'ah-search', hidden: '' }, searchInput, searchClear);

      const mirrors = h('div', { id: 'ah-mirrors', className: 'ah-section' });
      const bookmarks = h('div', { id: 'ah-bookmarks', className: 'ah-section' });

      const boltTip = _('accelOn', 'Acceleration');
      const boltBtn = h('button', { id: 'ah-bolt', className: 'ah-footer-btn', type: 'button', 'aria-label': boltTip, title: boltTip, 'aria-pressed': 'false' });
      boltBtn.appendChild(makeSvg(BOLT_MARKUP));
      const bmTip = _('prefShowBookmarks', 'Bookmarks');
      const bmBtn = h('button', { id: 'ah-bm-toggle', className: 'ah-footer-btn', type: 'button', 'aria-label': bmTip, title: bmTip, 'aria-pressed': 'false' });
      bmBtn.appendChild(makeSvg(BOOKMARK_MARKUP));
      const themeTip = _('themeBtn', 'Toggle theme');
      const themeBtn = h('button', { id: 'ah-theme', className: 'ah-footer-btn', type: 'button', 'aria-label': themeTip, title: themeTip });
      themeBtn.appendChild(makeSvg(THEME_MARKUP));
      const settingsTip = _('settingsBtn', 'Settings');
      const settingsBtn = h('button', { id: 'ah-settings', className: 'ah-footer-btn', type: 'button', 'aria-label': settingsTip, title: settingsTip });
      settingsBtn.appendChild(makeSvg(COG_MARKUP));
      const footer = h('div', { className: 'ah-footer' }, boltBtn, bmBtn, themeBtn, settingsBtn);

      const panel = h('div', { className: 'ah-panel' }, header, searchWrap, mirrors, bookmarks, footer);
      el = h('div', { id: 'ah-root', className: 'ah-root ah-serp-root' }, panel);
      try {
        const lang = chrome.i18n?.getUILanguage?.() || '';
        if (/^(ar|fa|he|ur|yi|ps|sd|ku)/i.test(lang)) el.dir = 'rtl';
      } catch { /* ignore */ }
      document.documentElement.appendChild(el);

      closeBtn.addEventListener('click', () => dismissPanel(el!));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && el && !el.classList.contains('ah-root--collapsed')) dismissPanel(el);
      });

      // Bolt: toggle acceleration (prefetch)
      boltBtn.addEventListener('click', () => {
        __prefs.enablePrefetch = !__prefs.enablePrefetch;
        const on = !!__prefs.enablePrefetch;
        boltBtn.classList.toggle('is-active', on);
        boltBtn.setAttribute('aria-pressed', String(on));
        try { void chrome.storage?.sync?.set({ prefs: { ...__prefs } }); } catch { /* ignore */ }
      });

      // Bookmark: toggle bookmarks on SERP
      bmBtn.addEventListener('click', () => {
        __prefs.showSerpBookmarks = !__prefs.showSerpBookmarks;
        const on = __prefs.showSerpBookmarks !== false;
        bmBtn.classList.toggle('is-active', on);
        bmBtn.setAttribute('aria-pressed', String(on));
        try { void chrome.storage?.sync?.set({ prefs: { ...__prefs } }); } catch { /* ignore */ }
        // Re-render to show/hide bookmarks section
        __bmCache = null;
        el!.remove();
        renderTips();
      });

      // Theme toggle
      themeBtn.addEventListener('click', () => {
        __theme = resolveTheme() === 'dark' ? 'light' : 'dark';
        applyTheme();
        try { void chrome.storage?.sync?.set({ theme: __theme }); } catch { /* ignore */ }
      });

      // Settings — Firefox/Opera can't open sidebar/popup programmatically from content script,
      // so disable the button and show a hint instead.
      const noInPageSettings = /Firefox\//i.test(navigator.userAgent) || /OPR\//i.test(navigator.userAgent);
      if (noInPageSettings) {
        settingsBtn.classList.add('is-disabled');
        settingsBtn.title = _('serpOpenSidebar', 'Open via toolbar icon');
        settingsBtn.setAttribute('aria-label', _('serpOpenSidebar', 'Open via toolbar icon'));
      } else {
        settingsBtn.addEventListener('click', () => {
          try { void chrome.runtime?.sendMessage?.({ type: 'OPEN_SETTINGS' }); } catch { /* ignore */ }
        });
      }

      titleDiv.prepend(createIcon('brand', 'sm', 'main'));
      applyTheme();

      return el;
    }

    // --- Search filter for SERP popup ---
    let searchFilterBound = false;
    function initSearchFilter(el: HTMLElement, totalItems: number): void {
      const wrap = el.querySelector('#ah-search') as HTMLElement;
      if (!wrap) return;
      if (totalItems <= 10) { wrap.hidden = true; return; }
      wrap.hidden = false;
      if (searchFilterBound) return;
      searchFilterBound = true;
      const input = wrap.querySelector('input')!;
      const clearBtn = wrap.querySelector('.ah-search-clear') as HTMLElement | null;

      function doFilter(): void {
        const q = input.value.toLowerCase().trim();
        wrap.classList.toggle('has-value', input.value.length > 0);
        el.querySelectorAll('.ah-pill').forEach(pill => {
          const text = pill.textContent?.toLowerCase() || '';
          (pill as HTMLElement).style.display = (!q || text.includes(q)) ? '' : 'none';
        });
        el.querySelectorAll('.ah-section.active').forEach(sec => {
          const visible = sec.querySelectorAll('.ah-pill:not([style*="display: none"])').length;
          (sec as HTMLElement).style.display = visible ? '' : 'none';
        });
      }

      input.addEventListener('input', doFilter);
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          input.value = '';
          doFilter();
          input.focus();
        });
      }
    }

    // --- Main render ---
    let lastUrl = location.href;
    let lastQuery = currentQuery();

    function renderTips(): void {
      if (!detectSerpContext()) return;
      lastUrl = location.href;

      getPrefsAndAlternates((data) => {
        __prefs = data.prefs || DEFAULT_PREFS;
        let q = getQuery();
        if (!q) q = getQueryFromDom();
        const map = data.alternates || {};
        const tokens = tokenizeQuery(q, __prefs);
        const matchedKeys = matchAlternatesByBrandTokens(tokens, map);
        const domainTokens = findDomainsInQuery(q).map(s => s.toLowerCase());
        for (const d of domainTokens) {
          const dk = map[d] ? d : map['www.' + d] ? 'www.' + d : null;
          if (dk && !matchedKeys.includes(dk)) matchedKeys.push(dk);
        }

        // Resolve key → actual map key (handles www. mismatch)
        function resolveKey(key: string): string[] {
          const k = map[key] || map[key.replace(/^www\./, '')] || map['www.' + key.replace(/^www\./, '')];
          return Array.isArray(k) ? k : [];
        }

        // Only keep keys that have actual alternates
        const keysWithAlts = matchedKeys.filter(key => resolveKey(key).length > 0);

        const existing = document.getElementById('ah-root');
        if (!keysWithAlts.length) {
          setBadge(0, 0, 0);
          if (existing) existing.remove();
          reportSerpState('none');
          return;
        }

        const el = injectPanel();
        // Respect user's manual dismiss — keep collapsed on pagination
        setPanelExpanded(el, !userDismissed);
        reportSerpState(userDismissed ? 'dismissed' : 'expanded');

        // Update footer toggle states
        const boltEl = el.querySelector('#ah-bolt');
        if (boltEl) {
          const on = !!__prefs.enablePrefetch;
          boltEl.classList.toggle('is-active', on);
          boltEl.setAttribute('aria-pressed', String(on));
        }
        const bmToggleEl = el.querySelector('#ah-bm-toggle');
        if (bmToggleEl) {
          const on = __prefs.showSerpBookmarks !== false;
          bmToggleEl.classList.toggle('is-active', on);
          bmToggleEl.setAttribute('aria-pressed', String(on));
        }

        const mirrorsWrap = el.querySelector('#ah-mirrors') as HTMLElement | null;
        const bmWrap = el.querySelector('#ah-bookmarks') as HTMLElement | null;

        if (mirrorsWrap) { mirrorsWrap.replaceChildren(); mirrorsWrap.classList.remove('active'); }
        if (bmWrap) { bmWrap.replaceChildren(); bmWrap.classList.remove('active'); }

        // Count total individual alternates for search threshold
        let totalAltsCount = 0;
        keysWithAlts.forEach(key => {
          const alts = resolveKey(key);
          totalAltsCount += Array.isArray(alts) ? alts.length : 0;
        });

        setBadge(keysWithAlts.length, keysWithAlts.length, 0);

        // Render alternates as mini-cards with favicons
        if (mirrorsWrap) {
          let showedMirrors = false;
          keysWithAlts.forEach((key) => {
            const alts = resolveKey(key);
            if (Array.isArray(alts) && alts.length) {
              if (!showedMirrors) {
                showedMirrors = true;
                mirrorsWrap.classList.add('active');
                const hdr = document.createElement('div');
                hdr.className = 'ah-header';
                hdr.textContent = _('altsHeading', 'Alternates');
                mirrorsWrap.appendChild(hdr);
              }
              const note = document.createElement('div');
              note.className = 'ah-section-note';
              note.textContent = key.replace(/^www\./, '');
              mirrorsWrap.appendChild(note);

              const row = document.createElement('div');
              row.className = 'ah-pill-row';
              alts.forEach((a: string) => {
                const obj = toHref(a);
                if (!obj.href) return;
                const link = document.createElement('a');
                link.className = 'ah-pill ah-pill-rich';
                link.href = obj.href; link.target = '_blank'; link.rel = 'noreferrer'; link.title = obj.href;
                const img = document.createElement('img');
                img.src = `https://icons.duckduckgo.com/ip3/${obj.host}.ico`;
                img.className = 'ah-pill-icon'; img.alt = '';
                img.loading = 'lazy'; img.onerror = () => { img.removeAttribute('src'); img.style.display = 'none'; };
                const span = document.createElement('span');
                span.className = 'ah-pill-label';
                span.textContent = obj.host;
                const arrow = document.createElement('span');
                arrow.textContent = '\u2B62'; arrow.className = 'ah-pill-arrow'; arrow.setAttribute('aria-hidden', 'true');
                link.append(img, span, arrow);
                row.appendChild(link);
              });
              mirrorsWrap.appendChild(row);
            }
          });
        }

        // Render bookmarks
        if (__prefs.showSerpBookmarks !== false) {
          void fetchBookmarksOnce().then(list => {
            try {
              const kw = new Set<string>(tokens);
              const addKw = (s: string) => {
                const v = String(s || '').toLowerCase();
                if (v && !TLD_STOP.has(v)) {
                  kw.add(v);
                  const t = ruToLat(v);
                  if (t && t !== v && !TLD_STOP.has(t)) kw.add(t);
                  if (v.includes('.')) {
                    const sl = v.replace(/^www\./, '').split('.')[0];
                    if (sl && !TLD_STOP.has(sl)) {
                      kw.add(sl);
                      const ts = ruToLat(sl);
                      if (ts && ts !== sl && !TLD_STOP.has(ts)) kw.add(ts);
                    }
                  }
                }
              };

              const slds = new Set<string>();
              keysWithAlts.forEach((key) => {
                addKw(key);
                slds.add((key.split('.')[0] || key).toLowerCase());
                const alts = resolveKey(key);
                (alts as string[]).forEach((a: string) => { const d = toHost(a); addKw(d); slds.add((d.split('.')[0] || d)); });
              });
              slds.forEach(addKw);

              const bookmarkHits: BookmarkEntry[] = [];
              const seen = new Set<string>();
              for (const n of list) {
                const url = n.url || '';
                if (!/^https?:/i.test(url)) continue;
                const lcurl = url.replace(/^[a-z]+:\/\/?/i, '').toLowerCase();
                let ok = false;
                for (const k of kw) { if (k && lcurl.includes(k)) { ok = true; break; } }
                if (!ok) continue;
                const key = `${n.title}|${url}`;
                if (seen.has(key)) continue;
                seen.add(key);
                bookmarkHits.push({ title: n.title || url, url });
                if (bookmarkHits.length >= 6) break;
              }

              const totalCount = keysWithAlts.length + bookmarkHits.length;
              setBadge(totalCount, keysWithAlts.length, bookmarkHits.length);

              if (bookmarkHits.length && bmWrap) {
                bmWrap.classList.add('active');
                const bmHdr = document.createElement('div');
                bmHdr.className = 'ah-header';
                bmHdr.textContent = _('bookmarksHeading', 'Related bookmarks');
                bmWrap.appendChild(bmHdr);
                const row = document.createElement('div');
                row.className = 'ah-pill-row';
                bookmarkHits.forEach(h => {
                  const a = document.createElement('a');
                  a.className = 'ah-pill ah-pill-rich';
                  a.href = h.url; a.target = '_blank'; a.rel = 'noreferrer'; a.title = h.url;
                  const img = document.createElement('img');
                  let host = '';
                  try { host = new URL(h.url).hostname; } catch { /* ignore */ }
                  img.src = `https://icons.duckduckgo.com/ip3/${host}.ico`;
                  img.className = 'ah-pill-icon'; img.alt = '';
                  img.loading = 'lazy'; img.onerror = () => { img.removeAttribute('src'); img.style.display = 'none'; };
                  const span = document.createElement('span');
                  span.className = 'ah-pill-label';
                  const t = h.title?.trim() || ((() => { try { return new URL(h.url).hostname; } catch { return h.url; } })());
                  span.textContent = t.length > 28 ? t.slice(0, 25) + '\u2026' : t;
                  const arrow = document.createElement('span');
                  arrow.textContent = '\u2B62'; arrow.className = 'ah-pill-arrow'; arrow.setAttribute('aria-hidden', 'true');
                  a.append(img, span, arrow);
                  row.appendChild(a);
                });
                bmWrap.appendChild(row);
              }

              // Show search filter when >10 total items
              initSearchFilter(el, totalAltsCount + bookmarkHits.length);
            } catch { /* ignore */ }
          });
        } else {
          // Bookmarks disabled — activate search based on alternates alone
          initSearchFilter(el, totalAltsCount);
        }

      });
    }

    // --- Re-render when storage changes (e.g. bundle loaded from sidepanel) ---
    let storageDebounce: ReturnType<typeof setTimeout> | undefined;
    try {
      if (chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'sync') return;
          if (changes.theme) {
            const v = changes.theme.newValue;
            __theme = (v === 'dark' || v === 'light') ? v : 'auto';
            applyTheme();
          }
          if (changes.alternates || changes.prefs) {
            clearTimeout(storageDebounce);
            storageDebounce = setTimeout(() => {
              __bmCache = null; // invalidate bookmark cache
              document.getElementById('ah-root')?.remove();
              renderTips();
            }, 300);
          }
        });
      }
    } catch { /* ignore */ }

    // --- Listen for TOGGLE_SERP_PANEL from background (icon click) ---
    try {
      if (chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener((msg: any) => {
          if (msg?.type === 'TOGGLE_SERP_PANEL') {
            const el = document.getElementById('ah-root');
            if (el && el.classList.contains('ah-root--collapsed')) {
              userDismissed = false;
              try { sessionStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
              setPanelExpanded(el, true);
              reportSerpState('expanded');
            }
          }
        });
      }
    } catch { /* ignore */ }

    // --- Init & URL change detection ---
    renderTips();

    function onUrlMaybeChanged(): void {
      if (location.href !== lastUrl) {
        const prevQuery = lastQuery;
        document.getElementById('ah-root')?.remove();
        lastUrl = location.href;
        lastQuery = currentQuery();
        // Reset dismiss only when query actually changed
        if (lastQuery !== prevQuery) {
          userDismissed = false;
          try { sessionStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
        } else {
          userDismissed = isDismissedForQuery();
        }
        renderTips();
      }
    }

    const _push = history.pushState;
    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      _push.apply(this, args);
      setTimeout(onUrlMaybeChanged, 0);
    };

    const _replace = history.replaceState;
    history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
      _replace.apply(this, args);
      setTimeout(onUrlMaybeChanged, 0);
    };

    window.addEventListener('popstate', onUrlMaybeChanged);
    // Fallback poll — pushState/popstate hooks handle most SPA navigations;
    // this only catches edge-cases (e.g. location.assign, hash changes).
    setInterval(onUrlMaybeChanged, 4000);

  },
});
