import type { BookmarkEntry } from '../types';

// ============================================================================
// Request Messages
// ============================================================================

export interface OpenSettingsRequest {
  type: 'OPEN_SETTINGS';
}

export interface GetBookmarksRequest {
  type: 'GET_BOOKMARKS';
}

export interface GetBookmarksResponse {
  ok: boolean;
  items: BookmarkEntry[];
}

export interface SetBadgeRequest {
  type: 'SET_BADGE';
  count: number;
  color: string;
  title: string;
}

export interface SetBadgeResponse {
  ok: boolean;
}

export interface PrefetchUrlRequest {
  type: 'PREFETCH_URL';
  url: string;
}

export interface PrefetchUrlResponse {
  ok: boolean;
}

export interface ToggleSerpPanelRequest {
  type: 'TOGGLE_SERP_PANEL';
}

// Background → content script (fire-and-forget), no response expected.
// Content script reports state changes via SET_SERP_STATE instead.

export interface SetSerpStateRequest {
  type: 'SET_SERP_STATE';
  state: 'expanded' | 'dismissed' | 'none';
}

// ============================================================================
// Union Types
// ============================================================================

export type RequestMessage =
  | OpenSettingsRequest
  | GetBookmarksRequest
  | SetBadgeRequest
  | PrefetchUrlRequest
  | ToggleSerpPanelRequest
  | SetSerpStateRequest;

// ============================================================================
// Response Mapping
// ============================================================================

export type ResponseMap = {
  OPEN_SETTINGS: void;
  GET_BOOKMARKS: GetBookmarksResponse;
  SET_BADGE: SetBadgeResponse;
  PREFETCH_URL: PrefetchUrlResponse;
  TOGGLE_SERP_PANEL: void;
  SET_SERP_STATE: void;
};

// ============================================================================
// Send Message Function
// ============================================================================

export function sendMessage<T extends RequestMessage>(
  message: T,
): Promise<ResponseMap[T['type']]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: ResponseMap[T['type']]) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}
