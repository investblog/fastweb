# Bundle CDN Worker — Technical Specification

## Goal

Replace GitHub raw file hosting for bundle JSON files with a Cloudflare Worker.
Benefits: edge delivery (faster), download counters, admin UI for safe editing.

---

## Architecture

```
Extension (background.ts)
    │
    │  GET /bundle/{locale}.json
    ▼
┌──────────────────────────────┐
│   CF Worker (bundle-cdn)     │
│                              │
│   /bundle/{locale}.json      │  ← public, cached 1h
│   /admin                     │  ← admin UI (token-protected)
│   /api/bundles               │  ← CRUD API (token-protected)
│   /api/stats                 │  ← download counters
└──────────┬───────────────────┘
           │
     ┌─────┴─────┐
     │  CF KV    │
     └───────────┘
```

---

## Storage (Cloudflare KV)

### Namespace: `BUNDLES`

| Key | Value | Description |
|-----|-------|-------------|
| `bundle:en` | `{"speedtest.net":["https://fast.com"], ...}` | Bundle JSON per locale |
| `bundle:ru` | `{...}` | |
| `bundle:uk` | `{...}` | |
| `bundle:tr` | `{...}` | |
| `bundle:es` | `{...}` | |
| `bundle:id` | `{...}` | |
| `bundle:fa` | `{...}` | |
| `meta:locales` | `["en","ru","uk","tr","es","id","fa"]` | Available locales |
| `stats:downloads` | `{"en":1234,"ru":567,...}` | Download counters by locale |
| `stats:daily:{YYYY-MM-DD}` | `{"en":12,"ru":5,...}` | Daily breakdown (optional) |

---

## API Endpoints

### Public

#### `GET /bundle/{locale}.json`

Returns bundle for the given locale. Fallback to `en` if locale not found.

- Response: `application/json`
- Cache: `Cache-Control: public, max-age=3600` (1 hour edge cache)
- Side effect: increment download counter
- CORS: `*` (extension needs cross-origin access)

### Admin (protected by `Authorization: Bearer {ADMIN_TOKEN}`)

#### `GET /api/bundles`

List all locales with domain count and last update time.

```json
{
  "locales": [
    { "code": "en", "domains": 42, "updatedAt": "2026-02-13T..." },
    { "code": "ru", "domains": 58, "updatedAt": "2026-02-13T..." }
  ]
}
```

#### `GET /api/bundles/{locale}`

Full bundle JSON for a locale.

#### `PUT /api/bundles/{locale}`

Replace entire bundle for a locale. Body: JSON object.
Worker validates before saving:
- Must be a valid JSON object
- All keys must be non-empty strings (domain format)
- All values must be arrays of strings (URLs starting with `https://`)
- Returns 400 with specific error if validation fails

#### `PATCH /api/bundles/{locale}`

Partial update — add/update/delete individual domains.

```json
{
  "set": { "example.com": ["https://mirror.example.com"] },
  "delete": ["old-domain.com"]
}
```

#### `GET /api/stats`

Download counters (total + daily).

```json
{
  "total": { "en": 1234, "ru": 567 },
  "today": { "en": 12, "ru": 5 }
}
```

---

## Admin UI

Minimal HTML page served by the same Worker at `/admin`. No framework, vanilla JS.
Protected by token (entered once, saved in localStorage).

### Features

1. **Locale selector** — tabs or dropdown for each locale
2. **Domain list** — table with columns: Domain | Alternates | Actions
3. **Add domain** — two fields: domain input + alternates textarea (one URL per line)
4. **Edit domain** — click row → inline edit alternates
5. **Delete domain** — button with confirmation
6. **Bulk import** — paste JSON, worker validates before saving
7. **Stats view** — download counters per locale, total and today

### Why UI instead of raw JSON editing

- Worker validates every write — impossible to save broken JSON
- Domain format validation (no typos like `htps://`)
- URL format validation (must start with `https://`)
- No duplicate domains
- Confirmation on destructive actions

---

## Validation Rules

On every write (`PUT` / `PATCH`):

```
domain key:
  - non-empty string
  - matches /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i
  - auto-lowercased
  - no trailing slash

alternate URL:
  - non-empty string
  - starts with https://
  - valid URL (new URL() doesn't throw)
  - no duplicates within same domain
```

---

## Extension Changes (background.ts)

Minimal change — only update the base URL:

```typescript
// Before
const BUNDLE_BASE = 'https://raw.githubusercontent.com/investblog/fastweb/main/data';

// After
const BUNDLE_BASE = 'https://bundle.fastweb.cam';
```

URL pattern stays the same: `{BASE}/bundle/{locale}.json`

---

## Seed Script

One-time script to migrate existing bundles from `data/*.json` to KV:

```bash
# For each locale file
for locale in en ru uk tr es id fa; do
  wrangler kv key put --binding=BUNDLES "bundle:$locale" --path="data/bundle-$locale.json"
done
wrangler kv key put --binding=BUNDLES "meta:locales" '["en","ru","uk","tr","es","id","fa"]'
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ADMIN_TOKEN` | Bearer token for admin API/UI |

## KV Namespaces

| Binding | Description |
|---------|-------------|
| `BUNDLES` | All bundle data, metadata, and stats |

---

## Deployment

```bash
# wrangler.toml
name = "bundle-cdn"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[vars]
# ADMIN_TOKEN set via wrangler secret

[[kv_namespaces]]
binding = "BUNDLES"
id = "..."

# Custom domain
[[routes]]
pattern = "bundle.fastweb.cam/*"
```

---

## Migration Plan

1. Deploy Worker with existing bundle data seeded into KV
2. Verify `/bundle/{locale}.json` returns correct data
3. Update `BUNDLE_BASE` in FastWeb extension
4. Release extension update — old GitHub URL keeps working as fallback
5. After 1-2 update cycles, remove `data/` folder from GitHub repo
