# FastWeb Audit (Phase 1)

Date: 2026-02-13
Scope: full repository review with focus on SERP runtime gate strictness, Acceleration Mode behavior, copy/UX alignment, and Chrome MV3 vs Firefox MV2 behavior.

## Severity legend
- **P0**: must fix before release
- **P1**: important correctness / UX issue
- **P2**: minor inconsistency, docs mismatch, or improvement

## Findings

### P0-1 — Acceleration Mode defaults to ON instead of OFF
- **Expected:** clean install must have Acceleration Mode disabled.
- **Actual:** `DEFAULT_PREFS.enablePrefetch` is `true`, so first-run state is enabled.
- **Pointer:** `src/shared/constants.ts:9`
- **Impact:** violates acceptance criterion and user expectation.

### P1-1 — Prefetch path has no concurrency limiting
- **Expected:** low, explicit concurrency limit for warm-up requests.
- **Actual:** `PREFETCH_URL` directly fires `fetch()` for every message with no queue/limit.
- **Pointer:** `src/entrypoints/background.ts:116-121`
- **Impact:** bursty traffic if many links are hovered quickly.

### P1-2 — Acceleration is not strictly hover-only (touchstart triggers immediate warm-up)
- **Expected:** prefetch behavior should be top N + hover with delay.
- **Actual:** `touchstart` event triggers `warmupUrl()` immediately, bypassing hover-delay semantics.
- **Pointer:** `src/entrypoints/prefetch.content.ts:98-103`
- **Impact:** behavior differs from stated model and can generate extra traffic unexpectedly.

### P1-3 — In-app copy does not clearly disclose OFF-by-default + optional + extra traffic
- **Expected:** text should explicitly state optional, OFF by default, SERP-only, and may generate extra traffic.
- **Actual:** current warning text mentions SERP-only but not OFF-by-default or extra traffic implications.
- **Pointer:** `src/public/_locales/en/messages.json:83-94`, `src/public/_locales/ru/messages.json:83-94`
- **Impact:** incomplete user disclosure for acceleration behavior.

### P2-1 — Store short description punctuation mismatch vs requested canonical text
- **Expected:** exact short description string with trailing period.
- **Actual:** English `appDesc` lacks final period.
- **Pointer:** `src/public/_locales/en/messages.json:5-7`
- **Impact:** minor copy mismatch.

### P2-2 — README implementation details stale vs code path
- **Expected:** docs should match implementation.
- **Actual:** README claims `<link rel="prefetch">` and concurrency limit of 2, while code uses background `fetch(..., { no-cors, redirect: 'manual' })` with no concurrency control.
- **Pointer:** `README.md:52`, `src/entrypoints/background.ts:116-121`
- **Impact:** developer confusion / inaccurate technical docs.

## Expected vs Actual by required category

## 1) SERP-only runtime gating (strict)
- **Expected:** scripts may match broadly, but non-SERP pages must exit before any listeners/observers/UI/prefetch logic.
- **Actual:** both content entrypoints gate at start using `detectSerpContext()` and return early when false.
  - `serp-helper.content.ts` gate: `src/entrypoints/serp-helper.content.ts:13`
  - `prefetch.content.ts` gate: `src/entrypoints/prefetch.content.ts:11-12`
- **Assessment:** mostly correct; no P0/P1 issue found in gate strictness itself.

## 2) Acceleration Mode (default OFF, top N + hover, dedupe, concurrency)
- **Expected:** OFF by default; warm top N results on hover delay only; dedupe; low concurrency.
- **Actual:**
  - default is ON (**P0**) (`src/shared/constants.ts:9`)
  - top N is applied via selectors + cap (`src/entrypoints/prefetch.content.ts:18, 29-62`)
  - dedupe exists (`seen` and `warmed` sets) (`src/entrypoints/prefetch.content.ts:49, 73-75`)
  - hover delay exists (`src/entrypoints/prefetch.content.ts:88-91`)
  - touchstart immediate warm-up violates strict hover-only interpretation (**P1**) (`src/entrypoints/prefetch.content.ts:98-103`)
  - no fetch concurrency control in background (**P1**) (`src/entrypoints/background.ts:116-121`)

## 3) Copy / UX alignment (store + in-app strings)
- **Expected:**
  - Name: **FastWeb — Search Accelerator**
  - Short description: **Speed up opening search results with smart tips, mirrors/bookmarks, and optional hover prefetch.**
  - Clearly communicate optional, OFF by default, SERP-only, and may generate extra traffic.
- **Actual:**
  - Name already aligned (`src/public/_locales/en/messages.json:2-4`)
  - Description is close but missing final period (`src/public/_locales/en/messages.json:5-7`)
  - Prefetch copy mentions SERP-only but does not clearly mention OFF-by-default and possible extra traffic (`src/public/_locales/en/messages.json:83-94`, `src/public/_locales/ru/messages.json:83-94`)

## 4) Cross-browser notes (Chrome MV3 vs Firefox MV2)
- **Expected:** side panel handling should be browser-appropriate; behavior parity for core features.
- **Actual:**
  - Chrome/Edge uses `sidePanel` with MV3 action behavior (`src/entrypoints/background.ts:13-18`)
  - Firefox MV2 fallback uses `browserAction`/`sidebarAction` (`src/entrypoints/background.ts:7-8, 21-26`)
  - From SERP panel, settings button is disabled on Firefox with hint text (user gesture constraint) (`src/entrypoints/serp-helper.content.ts:367-381`)
- **Assessment:** cross-browser panel opening strategy is intentional and acceptable; no P0/P1 issue here.

## Proposed Phase 2 scope (P0/P1 only)
1. Set Acceleration default to OFF.
2. Implement low-concurrency queue for `PREFETCH_URL` in background.
3. Remove non-hover immediate warm-up path (`touchstart`) to enforce top N + hover delay behavior.
4. Update i18n copy to clearly disclose optional/OFF-by-default/SERP-only/extra-traffic implications.
