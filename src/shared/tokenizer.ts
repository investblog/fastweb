import { RU_TO_LAT, TLD_STOP } from './constants';
import type { Prefs, AlternatesMap } from './types';

export function ruToLat(s: string): string {
  return String(s || '').toLowerCase().replace(/[\u0400-\u04FF]/g, ch => RU_TO_LAT[ch] ?? ch);
}

export function tokenizeQuery(q: string, prefs?: Partial<Prefs>): string[] {
  const str = String(q || '').toLowerCase();
  let splitter: RegExp | null = null;

  if (!prefs || prefs.useUnicodeTokenize !== false) {
    try { splitter = new RegExp('[^\\p{L}\\p{N}-]+', 'u'); } catch { splitter = null; }
  }
  if (!splitter) splitter = /[^a-z0-9\u0400-\u04FF-]+/i;

  const raw = str.split(splitter).map(t => t.trim()).filter(Boolean);
  const out = new Set<string>();
  const minTok = Math.max(1, Math.min(10, prefs?.minBrandLength ?? 2));

  for (const t of raw) {
    if (t.length >= minTok && !TLD_STOP.has(t)) out.add(t);
    const tl = ruToLat(t);
    if (tl && tl !== t && tl.length >= minTok && !TLD_STOP.has(tl)) out.add(tl);
  }
  return Array.from(out);
}

export function matchAlternatesByBrandTokens(tokens: string[], map: AlternatesMap): string[] {
  const seen = new Set<string>();
  const scored: { key: string; score: number }[] = [];

  for (const dom of Object.keys(map || {})) {
    const d = String(dom || '').toLowerCase().replace(/^www\./, '');
    const sld = d.split('.')[0] || d;
    let score = 0;
    for (const t of tokens) {
      if (!t) continue;
      if (t === sld) score = Math.max(score, 3);
      else if (sld.includes(t)) score = Math.max(score, 2);
      else if (t.includes(sld)) score = Math.max(score, 1);
    }
    if (score > 0 && !seen.has(d)) { seen.add(d); scored.push({ key: d, score }); }
  }

  scored.sort((a, b) => b.score - a.score || a.key.length - b.key.length);
  return scored.map(x => x.key).slice(0, 8);
}

function sld(dom: string): string {
  const d = String(dom || '').toLowerCase().replace(/^www\./, '');
  return d.split('.')[0] || d;
}

export function matchesBrand(tokens: string[], dom: string, alts: string[]): boolean {
  const d = String(dom || '').toLowerCase();
  const dSLD = sld(d);
  const altArr = Array.isArray(alts) ? alts : [];
  const pool = [d, dSLD, ...altArr.map(a => String(a).toLowerCase()), ...altArr.map(a => sld(a))];

  for (const token of tokens) {
    for (const cand of pool) {
      if (!token || !cand) continue;
      if (cand.includes(token) || token.includes(cand)) return true;
      const candTL = ruToLat(cand);
      if (candTL.includes(token) || token.includes(candTL)) return true;
    }
  }
  return false;
}
