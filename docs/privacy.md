# FastWeb Privacy Policy

*Last updated: February 2026*

## Data Collection

FastWeb does not collect any user data. We have no servers, no analytics, and no tracking.

## Data Storage

The following data is stored locally on your device using browser's `storage.sync`:

- **Domain alternates** — your custom list of domain-to-alternate mappings
- **Settings** (preferences) — panel mode, badge visibility, acceleration mode, sensitivity, etc.

If you are signed in to your browser, `storage.sync` may sync this data across your devices through your browser account. This is a standard browser feature and is not controlled by FastWeb.

## Bookmarks Access

FastWeb requests the `bookmarks` permission to display related bookmarks on search result pages. Bookmarks are read locally and never transmitted anywhere.

## External Connections

The extension connects to:

- **icons.duckduckgo.com** — to fetch website favicons displayed in the SERP panel
- **raw.githubusercontent.com** — to download the sample domain bundle on first install (one-time, optional)

No other external connections are made. No data is sent to any server.

## Acceleration Mode

When enabled, Acceleration Mode uses the browser's built-in `<link rel="prefetch">` to preload top search results on hover. This creates direct connections between your browser and the target websites — the same as if you clicked the link. FastWeb does not proxy, intercept, or log these connections.

## Permissions

| Permission | Purpose |
|------------|---------|
| `bookmarks` | Read bookmarks to show related ones on SERP |
| `storage` | Save your settings and domain alternates |
| `tabs` | Set badge count per tab |
| `sidePanel` | Open settings panel (Chrome/Edge) |
| `host_permissions: *://*/*` | Inject content script on search engine pages |

## Data Deletion

Uninstalling the extension removes all locally stored data. You can also clear data manually from the settings panel (delete individual domains or the entire bundle).

## Open Source

FastWeb is open source. You can review the code at [GitHub](https://github.com/investblog/fastweb).

## Contact

For questions about this privacy policy, please open an issue on [GitHub](https://github.com/investblog/fastweb/issues).
