![FastWeb](assets/banner-1400x560.jpg)

# FastWeb

Search accelerator browser extension — alternate domains, bookmarks & link prefetch right on search results pages.

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ldimjibdnbccpjgndkealkhojebhjdbh)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-FF7139?logo=firefox&logoColor=white)](https://addons.mozilla.org/firefox/addon/fastweb/)
[![Edge Add-ons](https://img.shields.io/badge/Edge-Add--ons-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/apmjcckdjbblamplalcnnapejapjaobe)
[![Opera Add-ons](https://img.shields.io/badge/Opera-Add--ons-FF1B2D?logo=opera&logoColor=white)](https://addons.opera.com/extensions/details/fastweb-search-accelerator/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Features

- **Alternate domains** — maintain your own list or use the built-in bundle of known mirrors and official alternates
- **Bookmarks on SERP** — see related bookmarks right on the search page, no digging through folders
- **Link acceleration** — DNS/TCP/TLS connection prefetch on hover so pages load faster when you click
- **Works everywhere** — Google, Bing, DuckDuckGo, and Yandex
- **Flexible display** — full panel or compact icon-only badge on search results
- **Dark & light theme** — with auto-detection
- **Import/export** — domain list as JSON, curated bundles with daily auto-sync
- **24 languages** — global store coverage
- **Fully local** — no accounts, no tracking, no data leaves your browser

## Install

| Browser | Link |
|---------|------|
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/ldimjibdnbccpjgndkealkhojebhjdbh) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/fastweb/) |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/apmjcckdjbblamplalcnnapejapjaobe) |
| Opera | [Opera Add-ons](https://addons.opera.com/extensions/details/fastweb-search-accelerator/) |

## How it works

When you search on a supported engine, FastWeb checks if any results have known alternate domains or mirrors. If so, a compact panel appears with direct links — saving you clicks and helping you reach the right site faster.

Link acceleration (enabled by default) pre-establishes DNS/TCP/TLS connections when you hover over links, making page loads noticeably faster. Watch for the lightning icon in the toolbar when it's active.

## Development

```bash
git clone https://github.com/investblog/fastweb.git
cd fastweb
npm install

npm run dev            # Chrome dev build
npm run dev:firefox    # Firefox dev build
npm run build          # Chrome production
npm run build:firefox  # Firefox production
npm run zip:all        # Build all platforms
npm run typecheck      # TypeScript check (run npx wxt prepare first)
```

## Tech stack

- [WXT](https://wxt.dev) ^0.19 — web extension framework with HMR
- TypeScript ^5.7
- Chrome MV3 + Firefox MV2 + Opera MV3 builds
- Zero runtime dependencies

## Privacy

FastWeb runs entirely in your browser. It does not collect, transmit, or store any personal data. The only network requests beyond normal browsing are a daily bundle sync from bundle.fastweb.cam and favicon loading from DuckDuckGo's public icon service.

Full privacy policy: [PRIVACY.md](PRIVACY.md)

## License

[MIT](LICENSE)

---

Built by [investblog](https://github.com/investblog) with [Claude](https://claude.ai)
