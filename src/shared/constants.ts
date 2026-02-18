import type { Prefs, StorageData } from './types';

export const DEFAULT_PREFS: Prefs = {
  minBrandLength: 2,
  showSerpBookmarks: true,
  showBadge: true,
  useUnicodeTokenize: true,
  enablePrefetch: true,
  prefetchTopN: 5,
  prefetchHoverDelay: 200,
  serpPanelMode: 'panel',
};

export const STORAGE_DEFAULTS: StorageData = {
  alternates: {},
  prefs: DEFAULT_PREFS,
};

export const TLD_STOP = new Set([
  'www', 'com', 'ru', 'net', 'org', 'info', 'io',
  'co', 'app', 'dev', 'site', 'online', 'top', 'xyz',
]);

export const BADGE_COLORS = {
  alts:     '#3b82f6',  // blue — alternates only
  mixed:    '#16a34a',  // green — alternates + bookmarks
  bm:       '#8b5cf6',  // violet — bookmarks only
  prefetch: '#F48120',  // orange — prefetch flash (301-ui --orange-500)
};

export const RU_TO_LAT: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
  'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
  'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch',
  'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
  'э': 'e', 'ю': 'yu', 'я': 'ya',
};

export const SERP_HOST_PATTERNS = {
  isGoogle: (h: string) => h.startsWith('www.google.'),
  isBing: (h: string) => h === 'www.bing.com',
  isDDG: (h: string) => h === 'duckduckgo.com',
  isYandex: (h: string) => /^yandex\./i.test(h) || /(^|\.)ya\.ru$/i.test(h),
};
