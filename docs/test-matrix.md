# Cross-browser Test Matrix

## Environments
- Chrome Stable (MV3 build)
- Edge Stable (MV3 build)
- Firefox Stable (MV2 build)

## Build + artifact checks
- [ ] `npm run build`
- [ ] `npm run build:firefox`
- [ ] Verify `dist/chrome-mv3/manifest.json` uses localized name/description and expected permissions.
- [ ] Verify `dist/firefox-mv2/manifest.json` uses localized name/description and Firefox-specific settings.
- [ ] Verify locale payloads copied to:
  - `dist/chrome-mv3/_locales/en/messages.json`
  - `dist/chrome-mv3/_locales/ru/messages.json`
  - `dist/firefox-mv2/_locales/en/messages.json`
  - `dist/firefox-mv2/_locales/ru/messages.json`

## Installation baseline
- [ ] Fresh profile install.
- [ ] Open settings panel.
- [ ] Confirm **Acceleration Mode is OFF by default**.

## SERP engine scenarios
For each browser and each engine (Google/Bing/DDG/Yandex):
- [ ] Open a normal SERP query.
- [ ] Confirm SERP panel renders and remains non-destructive (does not rewrite result links/content).
- [ ] Confirm tips/mirrors/bookmarks can render when data matches.
- [ ] With Acceleration OFF: no prefetch warm-up messages expected.
- [ ] Turn Acceleration ON: hover top results and confirm warm-up behavior triggers only for Top N candidates.
- [ ] Hover same link repeatedly: confirm dedupe (single warm-up per URL).
- [ ] Rapid-hover many results: confirm queue/concurrency remains low (no uncontrolled burst).

## Non-SERP sanity
For each browser:
- [ ] Open arbitrary non-search sites (news/blog/docs pages).
- [ ] Confirm no FastWeb panel UI injected.
- [ ] Confirm no SERP observers/listeners behavior and no prefetch activity.

## SPA navigation on SERP
For engines with dynamic navigation updates:
- [ ] Change query from the same tab without full reload.
- [ ] Confirm panel refreshes for new query.
- [ ] Confirm Acceleration behavior follows current setting after navigation.

## Regression checks
- [ ] Settings persist after browser restart.
- [ ] Badge behavior unaffected by prefetch changes.
- [ ] Firefox sidebar open path still works from toolbar icon.
