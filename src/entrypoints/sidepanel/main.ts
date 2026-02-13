import { applyI18n, _ } from '@shared/i18n';
import { normalizeKeyDomain, normalizeAlt } from '@shared/url-utils';
import { tokenizeQuery, matchesBrand, ruToLat } from '@shared/tokenizer';
import { TLD_STOP, DEFAULT_PREFS } from '@shared/constants';
import { initTheme, toggleTheme } from '@shared/theme';
import { getStoreInfo } from '@shared/store-links';
import type { Prefs, AlternatesMap, BookmarkEntry } from '@shared/types';

const $ = (s: string) => document.querySelector(s);

// --- Tab navigation ---
type ViewName = 'domains' | 'preferences';

function showView(viewName: ViewName): void {
  document.querySelectorAll('[data-view-content]').forEach(el => {
    (el as HTMLElement).hidden = true;
  });
  const target = document.querySelector(`[data-view-content="${viewName}"]`);
  if (target) (target as HTMLElement).hidden = false;

  const controls = document.getElementById('panelControls');
  if (controls) controls.hidden = (viewName !== 'domains');
}

function initNavigation(): void {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab') as ViewName;
      if (!tabName) return;
      tabs.forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      showView(tabName);
    });
  });
}

// --- Inline message ---
let MSG_TIMER: ReturnType<typeof setTimeout> | null = null;
function showInlineMessage(text: string): void {
  const box = document.querySelector('#ah-inline-msg') as HTMLElement | null;
  if (!box) return;
  if (MSG_TIMER) clearTimeout(MSG_TIMER);
  if (text) {
    box.textContent = text;
    box.classList.add('is-visible');
    MSG_TIMER = setTimeout(() => { box.classList.remove('is-visible'); box.textContent = ''; }, 5000);
  } else {
    box.textContent = '';
    box.classList.remove('is-visible');
  }
}

// --- Storage helpers ---
function getMap(): Promise<AlternatesMap> {
  return new Promise(r => chrome.storage.sync.get({ alternates: {} }, d => r((d.alternates || {}) as AlternatesMap)));
}
function saveMap(map: AlternatesMap): Promise<void> {
  return new Promise(r => chrome.storage.sync.set({ alternates: map }, r));
}

// --- Rendering ---
function render(map: AlternatesMap): void {
  const list = $('#list') as HTMLElement;
  list.replaceChildren();
  const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  for (const [dom, alts] of entries) {
    const wrap = document.createElement('div'); wrap.className = 'domain-item';
    const header = document.createElement('div'); header.className = 'domain-item__header';
    const left = document.createElement('div'); left.className = 'domain-item__name'; left.textContent = dom;
    const del = document.createElement('button'); del.className = 'btn btn--outline-danger btn--sm'; del.type = 'button';
    del.textContent = _('deleteBtn', 'Delete');
    del.addEventListener('click', async () => { const cur = await getMap(); delete cur[dom]; await saveMap(cur); CACHE = cur; applyFilterAndRender(); });
    header.append(left, del);
    const mid = document.createElement('div'); mid.className = 'pill-row';
    (Array.isArray(alts) ? alts : []).forEach((a: string) => {
      const clean = String(a).replace(/^https?:\/\//, '');
      const link = document.createElement('a');
      link.href = `https://${clean}`; link.target = '_blank'; link.rel = 'noreferrer'; link.className = 'pill';
      const linkText = document.createTextNode(a + ' ');
      const linkArrow = document.createElement('span');
      linkArrow.className = 'pill__arrow';
      linkArrow.textContent = '\u2B62';
      link.append(linkText, linkArrow);
      mid.appendChild(link);
    });
    wrap.append(header, mid); list.appendChild(wrap);
  }
  if (!entries.length) {
    const empty = document.createElement('div'); empty.className = 'text-muted';
    empty.textContent = _('listEmpty', 'List is empty.');
    list.appendChild(empty);
  }
}

// --- Bookmarks ---
let BM_CACHE: BookmarkEntry[] | null = null;
function fetchBookmarks(): Promise<BookmarkEntry[]> {
  return new Promise((res) => {
    if (BM_CACHE) return res(BM_CACHE);
    try {
      chrome.bookmarks.getTree((nodes) => {
        const flat: BookmarkEntry[] = [];
        const walk = (arr: chrome.bookmarks.BookmarkTreeNode[]) => {
          for (const x of (arr || [])) {
            if (x.url) flat.push({ title: x.title || '', url: x.url });
            if (x.children) walk(x.children);
          }
        };
        walk(nodes || []);
        BM_CACHE = flat; res(flat);
      });
    } catch {
      try {
        chrome.runtime.sendMessage({ type: 'GET_BOOKMARKS' }, (resp: any) => {
          const list = resp?.ok && Array.isArray(resp.items) ? resp.items : [];
          BM_CACHE = list; res(list);
        });
      } catch { res([]); }
    }
  });
}

function renderBookmarks(tokens: string[]): void {
  const sec = $('#bmSection') as HTMLElement | null;
  const box = $('#bmResults') as HTMLElement | null;
  if (!sec || !box) return;
  fetchBookmarks().then(list => {
    box.replaceChildren();
    if (!tokens?.length) { sec.classList.add('is-hidden'); return; }
    const hits: BookmarkEntry[] = []; const seen = new Set<string>();
    const kw = new Set<string>(tokens);
    const add = (v: string) => { const s = String(v || '').toLowerCase(); if (s) { kw.add(s); const t = ruToLat(s); if (t && t !== s) kw.add(t); } };
    for (const n of list) {
      const url = n.url || ''; if (!/^https?:/i.test(url)) continue;
      const lcurl = url.replace(/^[a-z]+:\/\//i, '').toLowerCase();
      let ok = false; for (const k of kw) { if (k && lcurl.includes(k)) { ok = true; break; } }
      if (!ok) continue;
      const key = `${n.title}|${url}`; if (seen.has(key)) continue; seen.add(key);
      hits.push({ title: n.title || url, url });
      if (hits.length >= 10) break;
    }
    if (!hits.length) { sec.classList.add('is-hidden'); return; }
    sec.classList.remove('is-hidden');
    hits.forEach(h => {
      const a = document.createElement('a'); a.className = 'pill pill--rich'; a.href = h.url; a.target = '_blank'; a.rel = 'noreferrer';
      const img = document.createElement('img');
      try { img.src = `https://icons.duckduckgo.com/ip3/${new URL(h.url).hostname}.ico`; } catch { img.src = ''; }
      img.width = 16; img.height = 16; img.className = 'pill__icon';
      const span = document.createElement('span');
      const t = h.title?.trim() || (() => { try { return new URL(h.url).hostname; } catch { return h.url; } })();
      span.textContent = t.length > 28 ? t.slice(0, 25) + '\u2026' : t;
      const arrow = document.createElement('span'); arrow.textContent = '\u2B62'; arrow.className = 'pill__arrow';
      a.append(img, span, arrow); box.appendChild(a);
    });
  });
}

// --- Filter ---
let CACHE: AlternatesMap = {};
let TOKENS: string[] = [];
function applyFilterAndRender(): void {
  const q = (($('#search') as HTMLInputElement)?.value || '').trim();
  TOKENS = tokenizeQuery(q);
  const form = $('.domain-form') as HTMLElement | null;
  if (form) form.hidden = TOKENS.length > 0;
  if (!TOKENS.length) { render(CACHE); renderBookmarks([]); return; }
  const subset: AlternatesMap = {};
  for (const [dom, alts] of Object.entries(CACHE)) { if (matchesBrand(TOKENS, dom, alts)) subset[dom] = alts; }
  render(subset); renderBookmarks(TOKENS);
}

// --- Import/Export ---
interface AlternateEntry { key: string; alts: string[] }

function parseAlternatesPayload(obj: unknown): AlternateEntry[] {
  const entries: AlternateEntry[] = [];
  const pushEntry = (rawKey: unknown, rawAlts: unknown) => {
    const key = normalizeKeyDomain(String(rawKey || '')); if (!key) return;
    const arr = Array.isArray(rawAlts) ? rawAlts.map(s => normalizeAlt(String(s))).filter(Boolean) : [];
    if (!arr.length) return;
    entries.push({ key, alts: Array.from(new Set(arr)) });
  };

  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) pushEntry(k, v);
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      if (Array.isArray(item) && item.length >= 2) pushEntry(item[0], item[1]);
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        pushEntry(o.domain || o.key || '', o.alternates || o.values || o.alts);
      }
    }
  }
  return entries;
}

async function importAlternatesPayload(payload: unknown, opts: { skipExistingDomains?: boolean; strict?: boolean } = {}): Promise<{ addedDomains: number }> {
  const entries = parseAlternatesPayload(payload);
  if (opts.strict && !entries.length) throw new Error('Invalid alternates payload');
  if (!entries.length) return { addedDomains: 0 };
  const current = await getMap();
  const next = { ...current };
  let addedDomains = 0;

  for (const { key, alts } of entries) {
    if (!key || !alts.length) continue;
    if (opts.skipExistingDomains && current[key]) continue;
    const prev = Array.isArray(next[key]) ? next[key] : [];
    const merged = Array.from(new Set([...prev, ...alts]));
    if (!prev.length && merged.length) addedDomains += 1;
    next[key] = merged;
  }

  await saveMap(next);
  CACHE = next;
  applyFilterAndRender();
  return { addedDomains };
}

async function applyBundle(bundle: unknown): Promise<void> {
  const { addedDomains } = await importAlternatesPayload(bundle, { skipExistingDomains: true, strict: true });
  const addedMsg = chrome.i18n.getMessage('bundleApplied', [String(addedDomains)]) || `Added ${addedDomains} new domains from sample.`;
  const noneMsg = _('bundleAppliedNone', 'No new domains from the sample bundle.');
  showInlineMessage(addedDomains > 0 ? addedMsg : noneMsg);
}

// --- Preferences ---
function loadPrefs(): Promise<Prefs> {
  return new Promise(resolve => {
    chrome.storage.sync.get({ prefs: DEFAULT_PREFS }, data => resolve((data.prefs || DEFAULT_PREFS) as Prefs));
  });
}
function savePrefs(p: Prefs): Promise<void> { return new Promise(r => chrome.storage.sync.set({ prefs: p }, r)); }

async function initPrefsUI(): Promise<void> {
  // --- Panel mode dropdown ---
  const modeDropdown = document.getElementById('panelModeDropdown');
  const modeChipLabel = document.getElementById('panelModeChipLabel');
  const modeItems = modeDropdown ? Array.from(modeDropdown.querySelectorAll<HTMLButtonElement>('.dropdown__item')) : [];
  let currentMode: 'open' | 'badge-only' = 'open';

  function setMode(val: string): void {
    currentMode = val === 'badge-only' ? 'badge-only' : 'open';
    modeItems.forEach(it => {
      it.classList.toggle('is-active', it.dataset.value === currentMode);
    });
    const active = modeItems.find(it => it.dataset.value === currentMode);
    if (modeChipLabel && active) modeChipLabel.textContent = active.textContent || '';
  }

  // Dropdown toggle
  if (modeDropdown) {
    const trigger = modeDropdown.querySelector('.dropdown__trigger');
    trigger?.addEventListener('click', () => {
      const open = modeDropdown.classList.toggle('dropdown--open');
      trigger.setAttribute('aria-expanded', String(open));
    });
    modeItems.forEach(item => {
      item.addEventListener('click', () => {
        setMode(item.dataset.value || 'open');
        modeDropdown.classList.remove('dropdown--open');
        trigger?.setAttribute('aria-expanded', 'false');
        debouncedSave(snapshot());
      });
    });
    document.addEventListener('click', (e) => {
      if (!modeDropdown.contains(e.target as Node)) {
        modeDropdown.classList.remove('dropdown--open');
        trigger?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const els = {
    min: document.querySelector('#ah-minBrand') as HTMLInputElement,
    minVal: document.querySelector('#ah-minBrand-value') as HTMLElement,
    unicode: document.querySelector('#prefUnicode') as HTMLInputElement,
    showBm: document.querySelector('#prefShowBookmarks') as HTMLInputElement,
    badge: document.querySelector('#prefShowBadge') as HTMLInputElement,
    prefetch: document.querySelector('#prefPrefetch') as HTMLInputElement,
    prefetchTopN: document.querySelector('#ah-prefetchTopN') as HTMLInputElement,
    prefetchTopNVal: document.querySelector('#ah-prefetchTopN-value') as HTMLElement,
    prefetchDelay: document.querySelector('#ah-prefetchDelay') as HTMLInputElement,
    prefetchDelayVal: document.querySelector('#ah-prefetchDelay-value') as HTMLElement,
    prefetchOptions: document.querySelector('#prefetch-options') as HTMLElement,
  };
  if (!els.min) return;
  const prefs = await loadPrefs();
  if (prefs.panelMode !== 'open' && prefs.panelMode !== 'badge-only') {
    prefs.panelMode = 'open';
    chrome.storage.sync.set({ prefs: { ...prefs } });
  }
  const minBrand = Math.max(1, Math.min(10, prefs.minBrandLength ?? 2));
  els.min.value = String(minBrand);
  els.minVal.textContent = String(minBrand);
  els.unicode.checked = !!prefs.useUnicodeTokenize;
  els.showBm.checked = !!prefs.showSerpBookmarks;
  els.badge.checked = !!prefs.showBadge;
  els.prefetch.checked = !!prefs.enablePrefetch;
  const topN = Math.max(1, Math.min(15, prefs.prefetchTopN ?? 5));
  els.prefetchTopN.value = String(topN);
  els.prefetchTopNVal.textContent = String(topN);
  const delay = Math.max(50, Math.min(2000, prefs.prefetchHoverDelay ?? 200));
  els.prefetchDelay.value = String(delay);
  els.prefetchDelayVal.textContent = String(delay);
  if (els.prefetchOptions) els.prefetchOptions.hidden = !els.prefetch.checked;
  setMode(prefs.panelMode);

  const debouncedSave = (() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    return (next: Prefs) => { if (t) clearTimeout(t); t = setTimeout(async () => { await savePrefs(next); }, 250); };
  })();

  function snapshot(): Prefs {
    return {
      minBrandLength: (() => {
        const n = parseInt(els.min.value, 10);
        if (!Number.isFinite(n)) return 2;
        return Math.max(1, Math.min(10, n));
      })(),
      useUnicodeTokenize: !!els.unicode.checked,
      showSerpBookmarks: !!els.showBm.checked,
      showBadge: !!els.badge.checked,
      enablePrefetch: !!els.prefetch.checked,
      prefetchTopN: (() => {
        const n = parseInt(els.prefetchTopN.value, 10);
        if (!Number.isFinite(n)) return 5;
        return Math.max(1, Math.min(15, n));
      })(),
      prefetchHoverDelay: (() => {
        const n = parseInt(els.prefetchDelay.value, 10);
        if (!Number.isFinite(n)) return 200;
        return Math.max(50, Math.min(2000, n));
      })(),
      panelMode: currentMode,
    };
  }

  els.min.addEventListener('input', () => {
    let val = parseInt(els.min.value, 10);
    if (!Number.isFinite(val)) val = 1;
    val = Math.max(1, Math.min(10, val));
    els.min.value = String(val);
    els.minVal.textContent = String(val);
    debouncedSave(snapshot());
  });
  [els.unicode, els.showBm, els.badge].forEach(ch => ch.addEventListener('change', () => debouncedSave(snapshot())));
  els.prefetch.addEventListener('change', () => {
    if (els.prefetchOptions) els.prefetchOptions.hidden = !els.prefetch.checked;
    debouncedSave(snapshot());
  });
  els.prefetchTopN.addEventListener('input', () => {
    let val = parseInt(els.prefetchTopN.value, 10);
    if (!Number.isFinite(val)) val = 5;
    val = Math.max(1, Math.min(15, val));
    els.prefetchTopN.value = String(val);
    els.prefetchTopNVal.textContent = String(val);
    debouncedSave(snapshot());
  });
  els.prefetchDelay.addEventListener('input', () => {
    let val = parseInt(els.prefetchDelay.value, 10);
    if (!Number.isFinite(val)) val = 200;
    val = Math.max(50, Math.min(2000, val));
    els.prefetchDelay.value = String(val);
    els.prefetchDelayVal.textContent = String(val);
    debouncedSave(snapshot());
  });
}

// --- Event listeners ---
function setupEventListeners(): void {
  $('#add')?.addEventListener('click', async () => {
    const dom = normalizeKeyDomain(($('#domain') as HTMLInputElement)?.value);
    const alts = (($('#alts') as HTMLInputElement)?.value || '').split(',').map(s => normalizeAlt(s)).filter(Boolean);
    if (!dom || !alts.length) return;
    const map = await getMap(); map[dom] = Array.from(new Set(alts));
    await saveMap(map);
    ($('#domain') as HTMLInputElement).value = '';
    ($('#alts') as HTMLInputElement).value = '';
    CACHE = map; applyFilterAndRender();
  });

  $('#exportBtn')?.addEventListener('click', async () => {
    const map = await getMap(); const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'alternates.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  $('#importBtn')?.addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async () => {
      try {
        const f = input.files?.[0]; if (!f) return;
        const text = await f.text();
        const obj = JSON.parse(text);
        await importAlternatesPayload(obj);
      } catch (e) { console.error('Import failed', e); }
    };
    input.click();
  });

  document.getElementById('ah-load-bundle')?.addEventListener('click', async () => {
    try {
      const remoteUrl = 'https://raw.githubusercontent.com/investblog/fastweb/main/src/public/bundle.json';
      const remoteData = await fetch(remoteUrl, { cache: 'no-store' }).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      const bundleKeys = Object.keys(remoteData);
      await applyBundle(remoteData);
      await new Promise<void>(r => chrome.storage.sync.set({ bundleDomains: bundleKeys }, r));
    } catch {
      try {
        const localUrl = chrome.runtime.getURL('bundle.json');
        const localData = await fetch(localUrl).then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        });
        const bundleKeys = Object.keys(localData);
        await applyBundle(localData);
        await new Promise<void>(r => chrome.storage.sync.set({ bundleDomains: bundleKeys }, r));
      } catch {
        showInlineMessage(_('bundleLoadFailed', 'Could not load sample bundle.'));
      }
    }
  });

  document.getElementById('ah-delete-bundle')?.addEventListener('click', async () => {
    const { bundleDomains = [] } = await new Promise<Record<string, string[]>>(r =>
      chrome.storage.sync.get({ bundleDomains: [] }, r));
    if (!bundleDomains.length) {
      showInlineMessage(_('bundleNone', 'No bundle loaded'));
      return;
    }
    const map = await getMap();
    let removed = 0;
    for (const key of bundleDomains) {
      if (map[key]) { delete map[key]; removed++; }
    }
    await saveMap(map);
    CACHE = map;
    await new Promise<void>(r => chrome.storage.sync.set({ bundleDomains: [] }, r));
    const msg = chrome.i18n.getMessage('bundleDeleted', [String(removed)]) || `Removed ${removed} bundle domains`;
    showInlineMessage(msg);
    applyFilterAndRender();
  });

  // Theme toggle
  document.querySelector('[data-action="toggle-theme"]')?.addEventListener('click', () => {
    toggleTheme();
  });
}

// --- Store link ---
function initStoreLink(): void {
  const info = getStoreInfo();
  if (!info) return;
  const rateLink = document.getElementById('rate-link') as HTMLAnchorElement | null;
  const rateIcon = document.getElementById('rate-icon') as HTMLImageElement | null;
  if (rateLink) {
    rateLink.href = info.url;
    if (rateIcon) rateIcon.src = info.icon;
    rateLink.hidden = false;
  }
}

// --- Header scroll (tier 2 collapse) ---
function initHeaderScroll(): void {
  const body = document.querySelector('.panel__body') as HTMLElement | null;
  const controls = document.getElementById('panelControls');
  if (!body || !controls) return;

  const SCROLL_DELTA = 5;
  let lastScrollTop = 0;

  body.addEventListener('scroll', () => {
    const st = body.scrollTop;
    const delta = st - lastScrollTop;
    if (st <= 0) { controls.classList.remove('controls-hidden'); lastScrollTop = st; return; }
    if (Math.abs(delta) < SCROLL_DELTA) return;
    if (delta > 0) controls.classList.add('controls-hidden');
    else controls.classList.remove('controls-hidden');
    lastScrollTop = st;
  }, { passive: true });
}

// --- Boot ---
(async function boot(): Promise<void> {
  initTheme();
  applyI18n();
  initNavigation();
  initStoreLink();
  initHeaderScroll();
  await initPrefsUI();
  setupEventListeners();
  CACHE = await getMap();
  const s = $('#search') as HTMLInputElement | null;
  if (s) s.addEventListener('input', applyFilterAndRender);
  applyFilterAndRender();
})();
