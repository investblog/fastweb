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
      return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement as unknown as SVGElement;
    }
    const SUN_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="4" fill="currentColor"/><path d="M10 1v2m0 14v2M3.5 3.5l1.4 1.4m10.2 10.2l1.4 1.4M1 10h2m14 0h2M3.5 16.5l1.4-1.4m10.2-10.2l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    const MOON_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M17.3 12.3A7.5 7.5 0 0 1 7.7 2.7 7.5 7.5 0 1 0 17.3 12.3z" fill="currentColor"/></svg>';

    function updateThemeIcon(el: HTMLElement): void {
      const btn = el.querySelector('#ah-theme');
      if (!btn) return;
      btn.replaceChildren(makeSvg(resolveTheme() === 'dark' ? SUN_MARKUP : MOON_MARKUP));
    }

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
    const TOAST_ID = 'ah-serp-toast';

    function normalizePanelMode(mode: string): 'open' | 'badge-only' {
      return mode === 'badge-only' ? 'badge-only' : 'open';
    }

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
        position: fixed; top: 64px; right: 86px; z-index: 999999;
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
      #ah-root .ah-btn-ghost { background: rgba(255,255,255,.03); border-color: var(--ah-border-subtle); color: var(--ah-muted); }
      #ah-root .ah-btn-ghost:hover { color: var(--ah-text); border-color: rgba(94,139,255,.4); }
      .ah-icon { display: inline-flex; width: 16px; height: 16px; vertical-align: middle; flex: 0 0 auto; }
      .ah-icon img, .ah-icon svg { width: 100%; height: 100%; display: block; }
      .ah-icon--sm { width: 14px; height: 14px; }
      .ah-icon--lg { width: 20px; height: 20px; }
      #ah-root .ah-panel {
        background: var(--ah-card); border-radius: var(--ah-radius);
        border: 1px solid var(--ah-border-subtle); box-shadow: var(--ah-shadow-soft);
        padding: 14px 18px; max-width: 90vw; width: 360px;
      }
      #ah-root.ah-root--collapsed .ah-panel { display: none; }
      #ah-root .ah-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      #ah-root .ah-panel-close { width: 28px; height: 28px; border-radius: var(--ah-radius); }
      #ah-root .ah-panel-title { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--ah-text); }
      #ah-root .ah-section { display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--ah-border-subtle); }
      #ah-root .ah-section.active { display: block; }
      #ah-root .ah-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--ah-muted); }
      #ah-root .ah-pill-row { display: flex; flex-wrap: wrap; gap: 10px; }
      #ah-root .ah-pill {
        display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px;
        border-radius: var(--ah-radius-pill); border: 1px solid var(--ah-border-subtle);
        background: rgba(255,255,255,.02); color: var(--ah-text); text-decoration: none; font-size: 12px;
        transition: border-color .15s ease, color .15s ease, background .15s ease;
      }
      #ah-root .ah-pill:hover { border-color: rgba(94,139,255,.8); color: var(--ah-accent); }
      #ah-root .ah-pill-rich { background: rgba(255,255,255,.04); }
      #ah-root .ah-pill-label { display: inline-flex; align-items: center; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #ah-root .ah-pill-arrow { color: var(--ah-muted); font-size: 12px; }
      #ah-root .ah-pill-icon { border-radius: calc(var(--ah-radius) / 2); width: 16px; height: 16px; object-fit: cover; }
      #ah-root .ah-section-note { margin: 0 0 6px; color: var(--ah-muted); }
      #ah-root .ah-footer {
        margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--ah-border-subtle);
        display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--ah-muted);
      }
      #ah-root .ah-footer-status { display: inline-flex; align-items: center; gap: 4px; }
      #ah-root .ah-footer-status svg { width: 12px; height: 12px; flex-shrink: 0; }
      #ah-root .ah-footer-status--on svg { color: #22c55e; }
      #ah-root .ah-footer-status--off svg { color: #64748b; }
      #ah-root .ah-footer-cog {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border-radius: 4px; cursor: pointer;
        color: var(--ah-muted); transition: color .15s ease;
      }
      #ah-root .ah-footer-cog:hover { color: var(--ah-accent); }
      #ah-root .ah-footer-cog svg { width: 14px; height: 14px; }
      #ah-root .ah-footer-actions { display: inline-flex; align-items: center; gap: 4px; }
      #ah-root.ah-root--inline-hidden { display: none; }
      #ah-serp-toast {
        position: fixed; top: 16px; right: 16px; z-index: 999999;
        background: var(--ah-card); color: var(--ah-text); border: 1px solid var(--ah-border-strong);
        border-radius: var(--ah-radius); padding: 8px 12px; box-shadow: var(--ah-shadow-soft);
        opacity: 0; transform: translateY(-8px); transition: opacity .16s ease, transform .16s ease;
        pointer-events: none; font-family: var(--ah-font); font-size: var(--ah-font-size);
      }
      #ah-serp-toast.visible { opacity: 1; transform: translateY(0); }
    `;
      (document.head || document.documentElement).appendChild(style);
    }

    // --- Toast ---
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    function showToast(message: string): void {
      if (!message) return;
      ensurePanelStyles();
      let toast = document.getElementById(TOAST_ID);
      if (!toast) {
        toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.documentElement.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.add('visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast!.classList.remove('visible'), 2400);
    }

    function showNoTipsToast(): void {
      showToast(_('serpNoTips', 'No tips right now'));
    }

    // --- Panel state ---
    let userDismissed = false;

    function setPanelExpanded(el: HTMLElement, expanded: boolean): void {
      if (expanded) el.classList.remove('ah-root--collapsed');
      else el.classList.add('ah-root--collapsed');
    }
    function collapsePanel(el: HTMLElement): void { setPanelExpanded(el, false); }
    function dismissPanel(el: HTMLElement): void { userDismissed = true; collapsePanel(el); }
    function togglePanel(el: HTMLElement): void { setPanelExpanded(el, !el.classList.contains('ah-root--collapsed')); }

    function setBadge(count: number, altsCount: number, bmCount: number): void {
      try {
        if (!hasRuntime()) return;
        if (__prefs.showBadge === false) {
          // Clear any previously-set badge
          chrome.runtime.sendMessage({ type: 'SET_BADGE', count: 0, color: BADGE_COLORS.alts, title: '' });
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
        chrome.runtime.sendMessage({ type: 'SET_BADGE', count: Math.max(0, count || 0), color, title });
      } catch { /* ignore */ }
    }

    // --- Bookmarks cache ---
    let __bmCache: BookmarkEntry[] | null = null;
    function fetchBookmarksOnce(): Promise<BookmarkEntry[]> {
      return new Promise((resolve) => {
        if (__bmCache) return resolve(__bmCache);
        try {
          if (!hasRuntime()) throw new Error('no-runtime');
          chrome.runtime.sendMessage({ type: 'GET_BOOKMARKS' }, (resp: any) => {
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

      const titleSpan = h('span', {}, _('serpPanelTitle', 'FastWeb'));
      const titleDiv = h('div', { className: 'ah-panel-title' }, titleSpan);
      const closeBtn = h('button', { id: 'ah-close-x', className: 'ah-btn ah-btn-ghost ah-panel-close', type: 'button', 'aria-label': _('serpHide', 'Hide') }, '\u00d7');
      const header = h('div', { className: 'ah-panel-header' }, titleDiv, closeBtn);

      const mirrors = h('div', { id: 'ah-mirrors', className: 'ah-section' });
      const bookmarks = h('div', { id: 'ah-bookmarks', className: 'ah-section' });

      const status = h('span', { id: 'ah-status', className: 'ah-footer-status' });
      const themeBtn = h('button', { id: 'ah-theme', className: 'ah-footer-cog', type: 'button', 'aria-label': 'Theme' });
      const settingsBtn = h('button', { id: 'ah-settings', className: 'ah-footer-cog', type: 'button', 'aria-label': _('settingsBtn', 'Settings') });
      settingsBtn.appendChild(makeSvg(COG_MARKUP));
      const footerActions = h('div', { className: 'ah-footer-actions' }, themeBtn, settingsBtn);
      const footer = h('div', { className: 'ah-footer' }, status, footerActions);

      const panel = h('div', { className: 'ah-panel' }, header, mirrors, bookmarks, footer);
      el = h('div', { id: 'ah-root', className: 'ah-root ah-serp-root' }, panel);
      document.documentElement.appendChild(el);

      closeBtn.addEventListener('click', () => dismissPanel(el!));
      settingsBtn.addEventListener('click', () => {
        try { if (hasRuntime()) chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' }); } catch { /* ignore */ }
      });
      themeBtn.addEventListener('click', () => {
        __theme = resolveTheme() === 'dark' ? 'light' : 'dark';
        applyTheme();
        updateThemeIcon(el!);
        try { chrome.storage?.sync?.set({ theme: __theme }); } catch { /* ignore */ }
      });

      titleDiv.prepend(createIcon('brand', 'sm', 'main'));
      applyTheme();
      updateThemeIcon(el);

      return el;
    }

    // --- Main render ---
    let lastUrl = location.href;

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
          if (map[d] && !matchedKeys.includes(d)) matchedKeys.push(d);
        }

        // Only keep keys that have actual alternates
        const keysWithAlts = matchedKeys.filter(key => {
          const alts = map[key] || map[key.replace(/^www\./, '')] || [];
          return Array.isArray(alts) && alts.length > 0;
        });

        const existing = document.getElementById('ah-root');
        if (!keysWithAlts.length) {
          setBadge(0, 0, 0);
          if (existing) existing.remove();
          return;
        }

        const panelMode = normalizePanelMode(__prefs.panelMode || 'open');
        const isOpenMode = panelMode === 'open';
        const el = injectPanel();
        // Respect user's manual dismiss — don't re-expand on SPA navigation
        if (!userDismissed) setPanelExpanded(el, isOpenMode);

        // Update acceleration status footer
        const statusEl = el.querySelector('#ah-status') as HTMLElement | null;
        if (statusEl) {
          const on = !!__prefs.enablePrefetch;
          const cls = on ? 'ah-footer-status--on' : 'ah-footer-status--off';
          statusEl.className = `ah-footer-status ${cls}`;
          const label = on
            ? _('accelOn', 'Acceleration on')
            : _('accelOff', 'Acceleration off');
          const bolt = makeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 0v11h3v9l7-12H9l4-8m2 13h2v2h-2zm0-8h2v6h-2z" fill="currentColor"/></svg>');
          statusEl.replaceChildren(bolt, label);
        }

        const mirrorsWrap = el.querySelector('#ah-mirrors') as HTMLElement | null;
        const bmWrap = el.querySelector('#ah-bookmarks') as HTMLElement | null;

        if (mirrorsWrap) { mirrorsWrap.replaceChildren(); mirrorsWrap.classList.remove('active'); }
        if (bmWrap) { bmWrap.replaceChildren(); bmWrap.classList.remove('active'); }

        setBadge(keysWithAlts.length, keysWithAlts.length, 0);

        // Render alternates as mini-cards with favicons
        if (mirrorsWrap) {
          let showedMirrors = false;
          keysWithAlts.forEach((key) => {
            const alts = map[key] || map[key.replace(/^www\./, '')] || [];
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
              note.textContent = key;
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
                img.onerror = () => { img.style.display = 'none'; };
                const span = document.createElement('span');
                span.className = 'ah-pill-label';
                span.textContent = obj.host;
                const arrow = document.createElement('span');
                arrow.textContent = '\u2B62'; arrow.className = 'ah-pill-arrow';
                link.append(img, span, arrow);
                row.appendChild(link);
              });
              mirrorsWrap.appendChild(row);
            }
          });
        }

        // Render bookmarks
        if (__prefs.showSerpBookmarks !== false) {
          fetchBookmarksOnce().then(list => {
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
                const alts = map[key] || map[key.replace(/^www\./, '')] || [];
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
                  img.onerror = () => { img.style.display = 'none'; };
                  const span = document.createElement('span');
                  span.className = 'ah-pill-label';
                  const t = h.title?.trim() || ((() => { try { return new URL(h.url).hostname; } catch { return h.url; } })());
                  span.textContent = t.length > 28 ? t.slice(0, 25) + '\u2026' : t;
                  const arrow = document.createElement('span');
                  arrow.textContent = '\u2B62'; arrow.className = 'ah-pill-arrow';
                  a.append(img, span, arrow);
                  row.appendChild(a);
                });
                bmWrap.appendChild(row);
              }
            } catch { /* ignore */ }
          });
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
            const el = document.getElementById('ah-root');
            if (el) updateThemeIcon(el);
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

    // --- Init & URL change detection ---
    renderTips();

    function onUrlMaybeChanged(): void {
      if (location.href !== lastUrl) {
        userDismissed = false; // new search → reset dismiss
        document.getElementById('ah-root')?.remove();
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

    // --- Listen for TOGGLE_SERP_PANEL from background ---
    try {
      if (hasRuntime() && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
          if (msg?.type === 'TOGGLE_SERP_PANEL') {
            try {
              const panel = document.getElementById('ah-root');
              if (panel) {
                togglePanel(panel);
                sendResponse?.({ ok: true, hasTips: true });
              } else {
                showNoTipsToast();
                sendResponse?.({ ok: true, hasTips: false });
              }
            } catch {
              sendResponse?.({ ok: false });
            }
          }
        });
      }
    } catch { /* ignore */ }
  },
});
