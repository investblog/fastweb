# FastWeb — Search Accelerator

Browser extension that enhances search engine result pages (SERP) with official alternate domains, related bookmarks, and smart tips. Optional **Acceleration Mode** prefetches top results on hover for instant page loads.

Works on **Google, Bing, DuckDuckGo, Yandex**. Chrome + Firefox.

> Formerly [Unlock.SBS](https://unlock.sbs) v0.5.x — rewritten with WXT + TypeScript.

## Features

- **Alternate domains** — add official mirrors / alternate URLs for any domain; they appear as chips on the SERP when the query matches
- **Related bookmarks** — surfaces your bookmarks matching the current search query
- **Search tips** — spelling hints, `site:` suggestions, archive links, cross-engine search
- **Acceleration Mode** (off by default) — prefetches top N result links on hover using `<link rel="prefetch">`, SERP pages only
- **Badge** — shows hint count on the extension icon
- **Privacy** — runs entirely locally, no tracking, no data collection, no remote servers (except optional sample bundle download)

## Install

### From source

```bash
git clone https://github.com/investblog/fastweb.git
cd fastweb
npm install
npx wxt prepare
npm run dev          # Chrome dev mode
npm run dev:firefox  # Firefox dev mode
```

### Build

```bash
npm run build          # Chrome (dist/chrome-mv3/)
npm run build:firefox  # Firefox (dist/firefox-mv2/)
npm run zip:all        # Both zips for distribution
```

## How it works

The extension activates **only on search result pages** (SERP). A runtime gate (`detectSerpContext()`) checks the current URL against known search engine patterns and bails immediately on non-SERP pages.

| Engine | Host pattern | Query param |
|--------|-------------|-------------|
| Google | `www.google.*` | `q` |
| Bing | `www.bing.com` | `q` |
| DuckDuckGo | `duckduckgo.com` | `q` |
| Yandex | `yandex.*`, `ya.ru` | `text` |

### Acceleration Mode

When enabled in settings, prefetches top N search result links when you hover over them (configurable delay, default 200ms). Uses standard `<link rel="prefetch">` with a concurrency limit of 2. Only works on SERP pages — never on regular websites.

## Project structure

```
src/
  entrypoints/
    background.ts            # Service worker
    serp-helper.content.ts   # SERP overlay panel (tips, alternates, bookmarks)
    prefetch.content.ts      # Acceleration Mode (hover prefetch)
    sidepanel/               # Settings UI (Chrome sidePanel / Firefox sidebar)
    popup/                   # Extension popup
  shared/
    types/                   # TypeScript interfaces
    constants.ts             # Default prefs, patterns
    url-utils.ts             # SERP detection, URL normalization
    tokenizer.ts             # Query tokenization, brand matching
    messaging/               # Type-safe chrome.runtime messaging
    ui-helpers.ts            # DOM helpers
    i18n.ts                  # chrome.i18n wrapper
  public/
    _locales/{en,ru}/        # Localization
    icons/                   # PNG + SVG assets
    bundle.json              # Sample alternates bundle
```

## Tech stack

- [WXT](https://wxt.dev) ^0.19 — web extension framework with HMR
- TypeScript ^5.7
- Chrome MV3 + Firefox MV2 dual build
- Zero runtime dependencies

## Storage

Data is stored in `chrome.storage.sync` with two keys:

- `alternates` — `Record<string, string[]>` mapping domains to their alternates
- `prefs` — user preferences (panel mode, badge, prefetch settings, etc.)

Storage keys are backward-compatible with Unlock.SBS v0.5.x — existing user data migrates automatically.

## License

MIT
