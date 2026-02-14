# Privacy Policy — FastWeb

**Last updated:** February 2026

## Summary

FastWeb is a browser extension that runs entirely on your device. It does not collect, transmit, or store any personal data on external servers.

## What data does FastWeb access?

### Search queries (read-only, local)
FastWeb reads the current search query on supported search engines (Google, Bing, DuckDuckGo, Yandex) to match it against your list of alternate domains. This data is processed locally in your browser and is never transmitted anywhere.

### Bookmarks (read-only, local)
If the "Show bookmarks on SERP" option is enabled, FastWeb reads your browser bookmarks to display relevant matches on search results pages. Bookmark data stays in your browser and is never transmitted.

### Storage
FastWeb uses `chrome.storage.sync` to save your settings and domain list. This data syncs between your devices through your browser account (Google/Firefox account) — FastWeb has no access to or control over this sync mechanism.

## Network requests

FastWeb makes the following network requests beyond your normal browsing:

1. **Bundle updates** — Once per day, the extension checks a public GitHub repository for updates to the built-in domain list. This request contains no personal data — it is a simple GET request to a static JSON file. Users can disable this by deleting the bundle in settings.

2. **Acceleration Mode** (optional, off by default in the panel) — When enabled, FastWeb warms up DNS/TCP/TLS connections for top search results when you hover over them. This creates brief network handshakes to destination servers but does **not** download any page content. No personal data is included in these requests.

3. **Favicons** — The extension loads site icons from `icons.duckduckgo.com` to display in the panel. These are standard HTTP requests for publicly available favicon images.

## What FastWeb does NOT do

- Does not collect analytics or telemetry
- Does not track browsing history
- Does not inject ads
- Does not modify search results or web page content (beyond its own overlay panel)
- Does not communicate with any server owned by FastWeb developers (bundle updates come from GitHub's public CDN)
- Does not use cookies or fingerprinting
- Does not sell or share any data

## Permissions explained

| Permission | Why it's needed |
|-----------|----------------|
| `storage` | Save your settings and domain list |
| `bookmarks` | Show related bookmarks on search pages |
| `tabs` | Read the current tab URL to detect search pages |
| `alarms` | Schedule daily bundle update checks |
| `sidePanel` | Open the settings panel (Chrome/Edge) |
| `host_permissions: *://*/*` | Run on search engine pages to display the panel |

## Third-party services

- **GitHub** (`raw.githubusercontent.com`) — bundle update checks
- **DuckDuckGo** (`icons.duckduckgo.com`) — favicon images

## Open source

FastWeb is open source. You can review the complete source code at:
https://github.com/investblog/fastweb

## Changes to this policy

If this privacy policy changes, the updated version will be published in the repository above.

## Contact

For questions or concerns about privacy, please open an issue at:
https://github.com/investblog/fastweb/issues
