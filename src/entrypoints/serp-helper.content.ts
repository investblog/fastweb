import { detectSerpContext, getQuery, getQueryFromDom, findDomainsInQuery, toHref, toHost } from '@shared/url-utils';
import { tokenizeQuery, matchAlternatesByBrandTokens, ruToLat } from '@shared/tokenizer';
import { DEFAULT_PREFS, STORAGE_DEFAULTS, TLD_STOP, BADGE_COLORS } from '@shared/constants';
import { createIcon, createSectionHeader, escapeHtml } from '@shared/ui-helpers';
import { _ } from '@shared/i18n';
import type { Prefs, AlternatesMap, BookmarkEntry } from '@shared/types';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_end',

  main() {
    if (!detectSerpContext()) return;

    let __prefs: Prefs = { ...DEFAULT_PREFS };

    function hasRuntime(): boolean {
      try {
        return typeof chrome !== 'undefined' && !!(chrome.runtime?.id);
      } catch { return false; }
    }

    function getPrefsAndAlternates(callback: (data: { alternates: AlternatesMap; prefs: Prefs }) => void): void {
      const fallback = { alternates: {} as AlternatesMap, prefs: DEFAULT_PREFS };
      try {
        if (!hasRuntime() || !chrome.storage?.sync) throw new Error('no storage');
        chrome.storage.sync.get(STORAGE_DEFAULTS, (data) => {
          try {
            const payload = data && typeof data === 'object' ? data : fallback;
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
      :root {
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
      @media (prefers-color-scheme: light) {
        :root {
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
      #ah-root .ah-panel-body { font-size: var(--ah-font-size); color: var(--ah-text); }
      #ah-root .ah-tip { margin: 4px 0; }
      #ah-root .ah-inline-link { color: var(--ah-accent); text-decoration: none; }
      #ah-root .ah-inline-link:hover { text-decoration: underline; }
      #ah-root .ah-panel-actions {
        margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--ah-border-subtle);
        display: flex; flex-wrap: nowrap; gap: 8px; justify-content: space-between; align-items: center;
      }
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
    function setPanelExpanded(el: HTMLElement, expanded: boolean): void {
      if (expanded) el.classList.remove('ah-root--collapsed');
      else el.classList.add('ah-root--collapsed');
    }
    function collapsePanel(el: HTMLElement): void { setPanelExpanded(el, false); }
    function togglePanel(el: HTMLElement): void { setPanelExpanded(el, !el.classList.contains('ah-root--collapsed')); }

    function setBadge(count: number, altsCount: number, bmCount: number): void {
      try {
        if (__prefs.showBadge !== false && hasRuntime()) {
          const color = altsCount > 0 && bmCount > 0
            ? BADGE_COLORS.mixed
            : bmCount > 0
              ? BADGE_COLORS.bm
              : BADGE_COLORS.alts;
          chrome.runtime.sendMessage({ type: 'SET_BADGE', count: Math.max(0, count || 0), color });
        }
      } catch { /* ignore */ }
    }

    // --- Link helpers ---
    function makePlainLink(href: string, text: string): string {
      return `<a href="${href}" target="_blank" rel="noreferrer" class="ah-inline-link">${escapeHtml(text)}</a>`;
    }
    function makePillLink(href: string, text: string): string {
      return `<a href="${href}" target="_blank" rel="noreferrer" class="ah-pill"><span class="ah-pill-label">${escapeHtml(text)}</span><span class="ah-pill-arrow">\u2B62</span></a>`;
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

    // --- Inject panel ---
    function injectPanel(): HTMLElement {
      ensurePanelStyles();
      let el = document.getElementById('ah-root');
      if (el) return el;

      const box = document.createElement('div');
      box.innerHTML = `
        <div id="ah-root" class="ah-root ah-serp-root">
          <div class="ah-panel">
            <div class="ah-panel-header">
              <div class="ah-panel-title"><span>${_('serpPanelTitle', 'Search tips')}</span></div>
              <button id="ah-close-x" class="ah-btn ah-btn-ghost ah-panel-close" type="button" aria-label="${_('serpHide', 'Hide')}">\u00d7</button>
            </div>
            <div id="ah-mirrors" class="ah-section"></div>
            <div id="ah-bookmarks" class="ah-section"></div>
            <div id="ah-body" class="ah-panel-body"></div>
            <div id="ah-actions" class="ah-panel-actions">
              <button id="ah-settings" class="ah-btn ah-btn-outline" type="button">${_('settingsBtn', 'Settings')}</button>
              <button id="ah-close" class="ah-btn ah-btn-outline" type="button">${_('serpHide', 'Hide')}</button>
            </div>
          </div>
        </div>`;

      el = box.firstElementChild as HTMLElement;
      document.documentElement.appendChild(el);

      const collapse = () => collapsePanel(el!);
      el.querySelector('#ah-close-x')?.addEventListener('click', collapse);
      el.querySelector('#ah-close')?.addEventListener('click', collapse);
      el.querySelector('#ah-settings')?.addEventListener('click', () => {
        try { if (hasRuntime()) chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' }); } catch { /* ignore */ }
      });

      const panelTitle = el.querySelector('.ah-panel-title');
      if (panelTitle) panelTitle.prepend(createIcon('brand', 'sm', 'main'));

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

        const existing = document.getElementById('ah-root');
        if (!matchedKeys.length) {
          setBadge(0, 0, 0);
          if (existing) existing.remove();
          return;
        }

        const panelMode = normalizePanelMode(__prefs.panelMode || 'open');
        const isOpenMode = panelMode === 'open';
        const el = injectPanel();
        setPanelExpanded(el, isOpenMode);

        const body = el.querySelector('#ah-body');
        const mirrorsWrap = el.querySelector('#ah-mirrors') as HTMLElement | null;
        const bmWrap = el.querySelector('#ah-bookmarks') as HTMLElement | null;

        if (mirrorsWrap) { mirrorsWrap.innerHTML = ''; mirrorsWrap.classList.remove('active', 'ah-panel-section--alternates'); }
        if (bmWrap) { bmWrap.innerHTML = ''; bmWrap.classList.remove('active'); }

        setBadge(matchedKeys.length, matchedKeys.length, 0);

        // Render alternates
        if (mirrorsWrap) {
          let showedMirrors = false;
          matchedKeys.forEach((key) => {
            const alts = map[key] || map[key.replace(/^www\./, '')] || [];
            if (Array.isArray(alts) && alts.length) {
              if (!showedMirrors) {
                showedMirrors = true;
                mirrorsWrap.classList.add('active', 'ah-panel-section--alternates');
              }
              const note = document.createElement('div');
              note.className = 'ah-section-note';
              note.textContent = key;
              mirrorsWrap.appendChild(note);

              const row = document.createElement('div');
              row.className = 'ah-pill-row';
              alts.forEach((a: string) => {
                const obj = toHref(a);
                const pill = document.createElement('span');
                pill.innerHTML = makePillLink(obj.href, obj.host);
                const anchor = pill.firstElementChild as HTMLElement;
                if (anchor?.tagName === 'A') (anchor as HTMLAnchorElement).title = obj.href;
                row.appendChild(anchor);
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
              matchedKeys.forEach((key) => {
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

              const totalCount = matchedKeys.length + bookmarkHits.length;
              setBadge(totalCount, matchedKeys.length, bookmarkHits.length);

              if (bookmarkHits.length && bmWrap) {
                bmWrap.classList.add('active');
                bmWrap.appendChild(createSectionHeader('brand', _('bookmarksHeading', 'Related bookmarks'), 'sm', 'main'));
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

        // Tips
        const tips: string[] = [];
        tips.push(_('serpTipCheck', 'Check spelling, try a more precise phrase, or use quotes for exact match.'));

        const host = location.host;
        const isYandex = /^yandex\./i.test(host) || /(^|\.)ya\.ru$/i.test(host);
        if (!isYandex && domainTokens.length) {
          const d = domainTokens[0];
          const hasSiteOrHost = /\b(?:site|host):\S+/i.test(q);
          if (!hasSiteOrHost) {
            const cleanedOnce = q.replace(/\b(?:site|host):\S+/gi, ' ').trim();
            const escapedD = d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const cleaned = cleanedOnce.replace(new RegExp(escapedD, 'gi'), ' ').replace(/\s{2,}/g, ' ').trim();
            const newQ = cleaned ? `site:${d} ${cleaned}` : `site:${d}`;
            tips.push(`${_('serpTipRestrict', 'Try restricting the search to domain:')} <span>${makePlainLink(`https://www.google.com/search?q=${encodeURIComponent(newQ)}`, `site:${d}`)}</span>.`);
          }
        }

        if (body) {
          body.innerHTML = tips.map(t => `<div class="ah-tip">${t}</div>`).join('');
        }
      });
    }

    // --- Init & URL change detection ---
    renderTips();

    function onUrlMaybeChanged(): void {
      if (location.href !== lastUrl) {
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
    setInterval(onUrlMaybeChanged, 800);

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
