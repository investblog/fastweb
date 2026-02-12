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
}

export interface SetBadgeResponse {
  ok: boolean;
}

export interface ToggleSerpPanelRequest {
  type: 'TOGGLE_SERP_PANEL';
}

export interface ToggleSerpPanelResponse {
  ok: boolean;
  hasTips?: boolean;
}

// ============================================================================
// Union Types
// ============================================================================

export type RequestMessage =
  | OpenSettingsRequest
  | GetBookmarksRequest
  | SetBadgeRequest
  | ToggleSerpPanelRequest;

// ============================================================================
// Response Mapping
// ============================================================================

export type ResponseMap = {
  OPEN_SETTINGS: void;
  GET_BOOKMARKS: GetBookmarksResponse;
  SET_BADGE: SetBadgeResponse;
  TOGGLE_SERP_PANEL: ToggleSerpPanelResponse;
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
