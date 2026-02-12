/** Map of domain → array of alternate URLs/domains */
export type AlternatesMap = Record<string, string[]>;

export interface Prefs {
  minBrandLength: number;
  showSerpBookmarks: boolean;
  showBadge: boolean;
  useUnicodeTokenize: boolean;
  panelMode: 'chip' | 'open';
  enablePrefetch: boolean;
  prefetchTopN: number;
  prefetchHoverDelay: number;
}

export type SerpEngine = 'google' | 'bing' | 'ddg' | 'yandex';

export interface SerpContext {
  engine: SerpEngine;
  query: string;
}

export interface HintPayload {
  brands: string[];
  alternates: { domain: string; alternates: string[] }[];
  bookmarks: BookmarkEntry[];
  tips: string[];
  count: number;
  timestamp: number;
  query: string;
}

export interface BookmarkEntry {
  title: string;
  url: string;
}

export interface TabHintData {
  url: string;
  hints: HintPayload;
}

export interface HrefResult {
  href: string;
  host: string;
}

export interface StorageData {
  alternates: AlternatesMap;
  prefs: Prefs;
}
