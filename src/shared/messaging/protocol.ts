import type { HintPayload, BookmarkEntry, TabHintData } from '../types';

// ============================================================================
// Request Messages
// ============================================================================

export interface OpenSettingsRequest {
  type: 'OPEN_SETTINGS';
}

export interface HintsUpdatedRequest {
  type: 'HINTS_UPDATED';
  url: string;
  hints: HintPayload;
  tabId?: number;
}

export interface GetHintsForTabRequest {
  type: 'GET_HINTS_FOR_TAB';
  tabId: number;
}

export interface GetHintsForTabResponse {
  data: TabHintData | null;
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
}

export interface SetBadgeResponse {
  ok: boolean;
}

export interface ShowSerpPanelRequest {
  type: 'SHOW_SERP_PANEL';
}

export interface ShowSerpPanelResponse {
  ok: boolean;
  hasTips?: boolean;
}

// ============================================================================
// Union Types
// ============================================================================

export type RequestMessage =
  | OpenSettingsRequest
  | HintsUpdatedRequest
  | GetHintsForTabRequest
  | GetBookmarksRequest
  | SetBadgeRequest
  | ShowSerpPanelRequest;

// ============================================================================
// Response Mapping
// ============================================================================

export type ResponseMap = {
  OPEN_SETTINGS: void;
  HINTS_UPDATED: void;
  GET_HINTS_FOR_TAB: GetHintsForTabResponse;
  GET_BOOKMARKS: GetBookmarksResponse;
  SET_BADGE: SetBadgeResponse;
  SHOW_SERP_PANEL: ShowSerpPanelResponse;
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
