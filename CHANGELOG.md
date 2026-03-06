# Changelog

All notable changes to FastWeb are documented in this file.

## [0.11.0] — 2026-03-06

### Added
- **Welcome page** — local onboarding page on install with feature overview, tips (pin to toolbar, lightning icon), and "Open Settings" button
- **Uninstall feedback URL** — locale-aware redirect to feedback form (fastweb.su for ru/uk, fastweb.cam for others)
- **24 manifest locales** — global store reach: en, ru, uk, tr, es, de, fr, pt_BR, fa, id, zh_CN, ar, hi, vi, it, pl, nl, ja, ko, th, ro, cs, sv, hu
- **SVG sprite** — unified icon system with `<symbol>` + `<use>` pattern for sidebar UI
- **Unified popup** — single `sidepanel.html` serves as Chrome sidePanel, Firefox sidebar + popup, Opera sidebar + popup (distinguished by `#sidebar` hash)

### Changed
- **Slogan-first appDesc** — all locales now lead with "Revives dead links. Accelerates live ones." followed by features
- **Compact toggle switches** — slimmed from 44×24 to 36×20 to match sidebar proportions
- **Chip icon sync** — SERP panel mode chip icon updates dynamically from dropdown selection

### Fixed
- **Opera prefetch crash** — changed `redirect: 'manual'` to `redirect: 'follow'` in background fetch
- **Favicon loading for subdomains** — `faviconHost()` now resolves correctly
- **sidePanel.open() on install** — Chrome requires user gesture; solved via local welcome page with button click

## [0.10.0] — 2026-02-18

### Added
- Icon-only SERP mode with dropdown UI
- Unified Firefox smart click (re-expand dismissed panel)
- Opera smart click and popup height fix
- `no-floating-promises` ESLint rule
- Prefetch icon flash and auto-warm Top N
- Full CI check (tsc + eslint) in release workflow

### Fixed
- Opera smart click and popup height
- Badge flash timing and restore logic

## [0.9.0] — 2026-02-14

### Added
- Smart icon click — re-expand dismissed SERP panel before opening settings
- Bundle CDN migration to `bundle.fastweb.cam`
- Dismiss persistence across page loads
- Runtime guards for missing APIs

## [0.8.1] — 2026-02-14

### Fixed
- Opera store URL slug correction
- Added MIT license

## [0.8.0] — 2026-02-13

### Added
- Opera browser support with sidebar_action
- Link prefetch with concurrency queue
- Prefetch badge flash (lightning icon)
- Dark/light theme with system preference detection

## [0.7.0] — 2026-02-13

### Added
- Domain bundles with daily auto-sync
- Import/export domains as JSON
- SERP panel on DuckDuckGo and Yandex
- Firefox sidebar support

## [0.6.0] — 2026-02-12

### Added
- Initial release
- Alternate domains panel on Google and Bing SERP
- Smart bookmarks alongside search results
- Chrome sidePanel for settings
- Multi-locale support (en, ru)
