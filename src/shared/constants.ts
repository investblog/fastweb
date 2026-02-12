import type { Prefs, StorageData } from './types';

export const DEFAULT_PREFS: Prefs = {
  minBrandLength: 2,
  showSerpBookmarks: true,
  showBadge: true,
  useUnicodeTokenize: true,
  panelMode: 'chip',
  enablePrefetch: false,
  prefetchTopN: 5,
  prefetchHoverDelay: 200,
};

export const STORAGE_DEFAULTS: StorageData = {
  alternates: {},
  prefs: DEFAULT_PREFS,
};

export const TLD_STOP = new Set([
  'www', 'com', 'ru', 'net', 'org', 'info', 'io',
  'co', 'app', 'dev', 'site', 'online', 'top', 'xyz',
]);

export const BADGE_COLOR = '#3b82f6';

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
