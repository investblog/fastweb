# FastWeb — Search Accelerator Browser Extension

## Overview
WXT + TypeScript browser extension (Chrome + Firefox). Shows official alternate domains, related bookmarks, and search tips on SERP pages. Includes link prefetch for faster navigation.

## Tech Stack
- **Framework**: WXT ^0.19 (web extension framework)
- **Language**: TypeScript ^5.7
- **Build**: `npm run build` (Chrome), `npm run build:firefox` (Firefox)
- **Dev**: `npm run dev` / `npm run dev:firefox`

## Project Structure
```
src/
  entrypoints/          # WXT entrypoints (auto-discovered)
    background.ts       # Service worker
    serp-helper.content.ts  # SERP overlay panel
    prefetch.content.ts     # Link prefetch on hover
    sidepanel/          # Settings UI (Chrome sidePanel / Firefox sidebar)
    popup/              # Action popup
  shared/               # Shared modules
    types/index.ts      # TypeScript types
    constants.ts        # Default prefs, stop words, patterns
    url-utils.ts        # URL parsing, SERP host detection
    tokenizer.ts        # Query tokenization, brand matching
    ui-helpers.ts       # DOM helpers (createIcon, escapeHtml)
    i18n.ts             # chrome.i18n wrapper
    messaging/          # Type-safe message passing
  public/               # Static assets copied to dist
    _locales/           # en, ru
    icons/              # PNG + SVG
    bundle.json         # Sample alternates bundle
```

## Key Commands
- `npm run dev` — dev build + load unpacked in Chrome
- `npm run typecheck` — TypeScript check (run after `npx wxt prepare`)
- `npm run zip:all` — build Chrome + Firefox zips

## Storage Keys (backward compatible with unlock-sbs)
- `alternates` — `Record<string, string[]>` domain→alternates map
- `prefs` — `Prefs` object (extended with `enablePrefetch`)

## Conventions
- Path aliases: `@shared/` → `src/shared/`, `@/` → `src/`
- Content scripts use `defineContentScript()`, background uses `defineBackground()`
- CSS for SERP panel is injected inline (scoped via `#ah-root`)
- Firefox compatibility: sidePanel → sidebarAction fallback in background
