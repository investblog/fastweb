import type { HrefResult, SerpContext, SerpEngine } from './types';
import { SERP_HOST_PATTERNS } from './constants';

/**
 * Detects whether the current page is a SERP and returns context with engine + query.
 * Uses host matching + URL path/query + DOM signatures.
 * Returns null if not a SERP — callers must bail immediately.
 */
export function detectSerpContext(): SerpContext | null {
  const h = location.host;
  const path = location.pathname;
  const params = new URLSearchParams(location.search);

  // --- Google ---
  if (SERP_HOST_PATTERNS.isGoogle(h)) {
    // Must be /search, /webhp, or root with q= param
    const q = params.get('q');
    if (!q) return null;
    if (path === '/search' || path === '/webhp' || path === '/') {
      return { engine: 'google', query: q };
    }
    // Google Images/Videos/News also count
    if (/^\/(images|videosearch|news)/.test(path)) {
      return { engine: 'google', query: q };
    }
    return null;
  }

  // --- Bing ---
  if (SERP_HOST_PATTERNS.isBing(h)) {
    const q = params.get('q');
    if (!q) return null;
    if (path === '/search' || path === '/images/search' || path === '/videos/search' || path === '/news/search') {
      return { engine: 'bing', query: q };
    }
    return null;
  }

  // --- DuckDuckGo ---
  if (SERP_HOST_PATTERNS.isDDG(h)) {
    const q = params.get('q');
    if (q && (path === '/' || path === '')) {
      return { engine: 'ddg', query: q };
    }
    // DDG also uses ?q= on root
    return null;
  }

  // --- Yandex (yandex.ru/com/kz/by/..., ya.ru) ---
  if (SERP_HOST_PATTERNS.isYandex(h)) {
    const q = params.get('text');
    if (!q) return null;
    if (/^\/(search|yandsearch)/.test(path) || path === '/') {
      return { engine: 'yandex', query: q };
    }
    // Yandex images/video
    if (/^\/(images|video)\/search/.test(path)) {
      return { engine: 'yandex', query: q };
    }
    return null;
  }

  return null;
}

export function toHref(input: string | undefined | null): HrefResult {
  const t = String(input || '').trim();
  if (!t) return { href: '', host: '' };
  try {
    const u = new URL(t);
    if (!/^https?:$/i.test(u.protocol)) throw new Error('unsupported');
    return { href: u.href, host: u.hostname.replace(/^www\./i, '').toLowerCase() };
  } catch { /* fallback */ }
  const clean = t.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const host = clean.replace(/^www\./i, '').toLowerCase();
  if (!host) return { href: '', host: '' };
  return { href: `https://${host}`, host };
}

export function toHost(input: string | undefined | null): string {
  return toHref(input).host;
}

export function isSerpHost(): boolean {
  const h = location.host;
  return (
    SERP_HOST_PATTERNS.isGoogle(h) ||
    SERP_HOST_PATTERNS.isBing(h) ||
    SERP_HOST_PATTERNS.isDDG(h) ||
    SERP_HOST_PATTERNS.isYandex(h)
  );
}

export function getQuery(): string {
  const u = new URL(location.href);
  const host = location.host;
  if (SERP_HOST_PATTERNS.isGoogle(host)) return u.searchParams.get('q') || '';
  if (SERP_HOST_PATTERNS.isBing(host)) return u.searchParams.get('q') || '';
  if (SERP_HOST_PATTERNS.isDDG(host)) return u.searchParams.get('q') || '';
  if (SERP_HOST_PATTERNS.isYandex(host)) return u.searchParams.get('text') || '';
  return '';
}

export function getQueryFromDom(): string {
  try {
    const sels = ["input[name='q']", "input[name='text']", "form[role='search'] input", '#text'];
    for (const sel of sels) {
      const el = document.querySelector<HTMLInputElement>(sel);
      if (el?.value) return el.value;
    }
  } catch { /* ignore */ }
  return '';
}

export function findDomainsInQuery(q: string): string[] {
  const out = new Set<string>();
  const rx = /([a-z0-9-]+\.[a-z.]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(q)) !== null) out.add(m[1].replace(/^www\./i, ''));
  return Array.from(out);
}

export function normalizeKeyDomain(s: string | undefined | null): string {
  const t = String(s || '').trim();
  try {
    const u = new URL(t);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch { /* fallback */ }
  return t.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
}

export function normalizeAlt(s: string | undefined | null): string {
  const t = String(s || '').trim();
  try {
    const u = new URL(t);
    if (!/^https?:$/i.test(u.protocol)) throw 0;
    return u.href;
  } catch { /* fallback */ }
  const host = t.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
  return host || '';
}
