# FastWeb — Search Accelerator Browser Extension

## Overview
WXT + TypeScript browser extension (Chrome, Firefox, Edge, Opera). Shows official alternate domains, related bookmarks, and accelerates link loading on SERP pages via DNS/TCP/TLS prefetch.

## Tech Stack
- **Framework**: WXT ^0.19 (web extension framework)
- **Language**: TypeScript ^5.7
- **Linting**: ESLint ^9 + typescript-eslint
- **Build**: `npm run build` (Chrome), `npm run build:firefox`, `npm run build:edge`, `npm run build:opera`
- **Dev**: `npm run dev` / `npm run dev:firefox` / `npm run dev:edge` / `npm run dev:opera`

## Project Structure
```
src/
  entrypoints/                  # WXT entrypoints (auto-discovered)
    background.ts               # Service worker: bundle sync, prefetch queue, badge, smart click
    serp-helper.content.ts      # SERP overlay panel (alternates + bookmarks)
    prefetch.content.ts         # Link prefetch on hover (content script)
    sidepanel/                  # Settings UI — serves as Chrome sidePanel, Firefox sidebar, Opera sidebar, and Firefox/Opera popup
      index.html
      main.ts
    welcome/                    # Local welcome page shown on install
      index.html
      main.ts
  shared/                       # Shared modules
    types/index.ts              # TypeScript types (Prefs, AlternatesMap, SerpEngine, etc.)
    constants.ts                # Default prefs, stop words, badge colors, SERP host patterns
    url-utils.ts                # URL parsing, SERP host detection
    tokenizer.ts                # Query tokenization, brand matching
    ui-helpers.ts               # DOM helpers (createIcon, escapeHtml)
    i18n.ts                     # chrome.i18n wrapper + applyI18n() for data-i18n
    theme.ts                    # Theme system (dark/light/auto), syncs via chrome.storage
    store-links.ts              # Per-browser store URLs (Chrome/Firefox/Edge/Opera)
    messaging/
      index.ts                  # Re-export
      protocol.ts               # Typed message protocol (RequestMessage, ResponseMap, sendMessage)
  assets/css/                   # Stylesheets
    theme.css                   # CSS variables for dark/light themes
    panel.css                   # SERP panel styles (scoped via #ah-root)
    components.css              # Sidebar UI components (toggles, chips, dropdowns)
  public/                       # Static assets copied to dist
    _locales/                   # 10 locales: en, ru, uk, tr, es, de, fr, pt_BR, fa, id
    icons/                      # PNG (sizes 16–256) + SVG (brand, store, lock icons)
    bundle.json                 # Fallback local bundle (used on first install)
    suggest.html + suggest.js   # Omnibox suggestion page
```

## Key Commands
- `npm run dev` — dev build + load unpacked in Chrome
- `npm run build` / `build:firefox` / `build:edge` / `build:opera` — production build
- `npm run zip:all` — build + zip all 4 browsers
- `npm run typecheck` — TypeScript check (run `npx wxt prepare` first to regenerate types)
- `npm run lint` — ESLint
- `npm run check` — tsc + eslint combined

## Storage Keys
All stored in `chrome.storage.sync`:
- `alternates` — `Record<string, string[]>` domain-to-alternates map (user + bundle combined)
- `prefs` — `Prefs` object: `minBrandLength`, `showSerpBookmarks`, `showBadge`, `useUnicodeTokenize`, `enablePrefetch`, `prefetchTopN`, `prefetchHoverDelay`, `serpPanelMode`
- `bundleDomains` — `string[]` list of domain keys that came from bundle (vs user-added)
- `bundleLastSync` — `number` timestamp of last successful bundle sync
- `bundleDisabledUntil` — `number` timestamp; when user deletes bundle, set to now + 30 days to suppress auto-sync
- `theme` — `'dark' | 'light' | 'auto'` theme preference, synced across contexts

## Bundle System
Domain bundles provide curated alternate domain lists. The flow:

### On install (`reason === 'install'`)
1. Load local fallback `/bundle.json` (shipped with extension)
2. Merge into `alternates` storage via `syncBundle()`
3. Open local `welcome.html` page

### On update (`reason === 'update'`) and daily alarm
1. Check `bundleDisabledUntil` — if set and not expired, skip (user deleted bundle)
2. Fetch remote bundle from `https://bundle.fastweb.cam/bundle/{locale}.json`
3. If locale-specific fetch fails, fall back to `en.json`
4. Merge via `syncBundle()`

### syncBundle() merge logic
- Reads current `alternates` map and `bundleDomains` (old bundle keys)
- **Removes** domains that were in old bundle but absent from new bundle
- **Adds/overwrites** domains from new bundle (only if key was previously from bundle or doesn't exist yet — preserves user customizations)
- Saves updated `alternates`, new `bundleDomains` list, and `bundleLastSync` timestamp

### User deletes bundle
- All `bundleDomains` keys are removed from `alternates`
- `bundleDisabledUntil` set to `Date.now() + 30 days`
- Daily alarm respects cooldown; after 30 days auto-sync resumes

## Conventions
- Path aliases: `@shared/` -> `src/shared/`, `@/` -> `src/`
- Content scripts use `defineContentScript()`, background uses `defineBackground()`
- CSS for SERP panel is injected inline (scoped via `#ah-root`)
- i18n: `data-i18n` attributes on elements, applied by `applyI18n()`. Place `data-i18n` on `<span>` children (not parent) to avoid `textContent` destroying sibling SVG elements.
- SVG sprite pattern: `<symbol>` definitions with `<use href="#id"/>` references
- **Settings must ONLY open in the sidebar panel** (Chrome `sidePanel.open()`, Firefox `sidebarAction.open()`, Opera `sidebar_action`). Never fall back to `tabs.create` or `windows.create` — if the sidebar can't be opened programmatically (e.g. no user gesture in Firefox), do nothing or show a toast instead.

### Browser-specific behavior (wxt.config.ts hooks)
- **Chrome/Edge**: icon click -> `sidePanel.open()` (no default_popup). Smart click: if SERP panel was dismissed, re-expands it instead.
- **Firefox**: `sidepanel.html` serves as both `default_popup` and `sidebar_action.default_panel` (distinguished by `#sidebar` hash). Popup cleared dynamically when SERP panel dismissed so `onClicked` fires for smart re-expand.
- **Opera**: same popup/sidebar pattern as Firefox. No `sidePanel` API — uses `sidebar_action` (Opera proprietary).
- `sidepanel.html#sidebar` hash distinguishes sidebar mode from popup mode.

### Install / Uninstall
- **Install**: opens local `welcome.html` with onboarding tips + "Open Settings" button (provides user gesture for `sidePanel.open()`)
- **Uninstall**: opens locale-aware feedback URL (`fastweb.su` for ru/uk, `fastweb.cam/{locale}/` for others) with `#contact` anchor

### Localization
- 10 locales in manifest: en, ru, uk, tr, es, de, fr, pt_BR, fa, id
- Full UI translation: en, ru, uk, tr, es, fa, id (all keys including welcome page)
- Manifest-only (appName + appDesc): de, fr, pt_BR
- Firefox AMO hard limit: appName max 50 chars (blocks upload if ANY locale exceeds)
- Chrome Web Store: appDesc max 132 chars
