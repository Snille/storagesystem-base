# Compatibility inventory

Current application contracts reviewed against 0.30.0 source on 2026-10-30.
This application is already in production. Historical reference commits below identify
the original comparison; they are not a claim of a new exhaustive parity review.

## Source baseline

Reviewed on 2026-10-19 from local source, without modifying or restarting the existing application:

- `Snille/storagesystem`, commit `a92ed1d22f5bfb3e61a168e29bdae0b1ea04aadb`.
- `Snille/storagesystem-ha`, commit `15e4daa9633e5507421f3a48390e4760546f0318`.

Reference application files: `lib/types.ts`, `lib/data-store.ts`, `lib/search.ts`, `lib/public-api.ts`, `lib/public-api-auth.ts`, `lib/mcp-server.ts`, `lib/location-schema.ts`, `lib/location-presentation.ts`, `lib/shelf-map.ts`, public and MCP route handlers, photo adapters, catalog scripts, and `docs/MANUAL.md`. HA reference files: `api.py`, `result.py`, and `binary_sensor.py` under `custom_components/storagesystem`.

Reusable behavior includes current-session precedence, structured location grammar, per-photo signature format, and the public/tool response shapes. These rules are implemented behind the new service boundary; the old JSON persistence, UI, AI runtime and printing implementation are not copied wholesale.

## User workflows

| Reference workflow | Current implementation |
| --- | --- |
| Search contents and browse boxes | Implemented through shared inventory services |
| Storage map for shelving units, benches and cabinets | Location labels, filters, MCP unit browsing and a shared-position storage map implemented; full geometry/layout editing pending |
| Create/update a box and its inventory session | Manual and reviewed AI-assisted entry implemented; prior sessions retained |
| Review box photos and history | Implemented; draft removal affects only the next session and retains earlier associations |
| Album inbox and photo selection | Implemented for Immich/PhotoPrism with selected album, roles and unassigned filtering |
| AI photo roles, analysis, matching and corrections | Single-photo tests, multi-photo new-box drafts and selected-photo existing-box updates implemented with explicit review/edit/save; manual roles retained; automatic matching remains pending |
| AI-generated natural answers | AI phrasing of lexical candidates with local fallback; semantic decision policy is preview-only |
| Settings, prompts and per-model overrides | Photo source, independent UI/external/AI language, named AI connections and task extra instructions implemented; Search & answers adds embedding settings and saved owner rules for preview and explicitly enabled shared search. Full prompt management closed by owner; legacy customizations preserved but inactive |
| Language catalogs and translation tool | API location labels/local answers in en/sv/de; catalog/override editing and separate-file migration pending |
| Label designer and printer selection/status | Box/location/unit labels use label-service templates and status. Physical box output through the service accepted; designer/media/sheets/QR belong to label-service |
| Excel catalog import/export | Retired from scope on 2026-10-20 at Erik's request; one-time initial label import, no future use |

## REST contract

Public routes use `x-api-key`, Bearer authentication, or the legacy `?key=` fallback in that order. A configured key is compared without timing-sensitive string comparison. Wrong/missing keys return HTTP 401 with `{"error":"Invalid or missing API key."}`. If no public key is configured, public reads are open, matching the reference. Management routes require a separate header key unless explicitly configured open management with an allowed-host list. Query credentials never authorize management. Browser origin checks apply in both modes. Production deliberately uses open management behind its network/proxy boundary.

| Route | Verified behavior |
| --- | --- |
| `GET /api/public/health` | `{ok, service:"lagersystem", date}` |
| `GET /api/public/search?q=...&limit=...&lang=...` | Trimmed query; default limit 10, clamp 1–25, nonfinite fallback; `{query,count,matches}`; missing q → 400 |
| `POST /api/public/ask` | `{query,language?}` → `{query,answer,source,count,matches}`; source is `semantic` in enabled decision mode; otherwise `ai` for provider phrasing or `search` for local fallback |
| `GET /api/public/boxes/:boxId?lang=...` | One box; unknown identifier → 404; optional fields omitted when absent |
| `GET /api/public/assets/:assetId/thumbnail`, `/preview` or `/original` | Public API authentication or per-asset/per-variant `?sig=` authentication; configured provider retrieval |

Matches preserve `boxId`, `label`, `locationId`, `location:{system,shelf,slot}`, box/session notes, session ID/date, summary, itemKeywords, photos and score. Photo metadata preserves photo ID, `immichAssetId`, role, optional capture date/notes, and thumbnail/preview/original URLs. Additive box fields include resolved `coverAssetId`, `coverIsAutomatic` and optional `labelTemplate`. Images use `APP_BASE_URL` when configured; they never derive a public URL from an internal container service name or forward the upstream key. Without an external base URL, links are relative and may be unsuitable for HA.

The signature is HMAC-SHA256 of `public-asset:VARIANT:ASSET_ID`, encoded as base64url using the public API key. It grants access only to that asset variant. Changing the API key invalidates existing signed links.

Image URLs, headers and bytes are tested against local HTTP fixtures. Live Immich acceptance verifies the dedicated account's album catalog, previews, session attachment, REST and MCP, including signed thumbnails and originals. The test inventory is in memory, separate from development and production data. Actual PhotoPrism access is not verified. Only raster image MIME types are served, redirects are rejected, and thumbnail/preview/original responses are bounded to 2/8/32 MiB.

## MCP contract

`POST /api/mcp` uses public API authentication and stateless JSON-RPC 2.0 with JSON responses. Supported initialize protocol values follow the reference: `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`. Notifications receive HTTP 202 without a body. Batch requests return a response array with notifications omitted. GET/DELETE return 405 with `Allow: POST`. Malformed JSON returns HTTP 400 and JSON-RPC -32700. Unsupported methods use -32601; unknown tools use -32602. Tool failures use `isError:true` text content.

| Tool | Arguments |
| --- | --- |
| `search_inventory` | query, optional limit 1–25 and language |
| `get_box` | box_id, optional language |
| `list_locations` | optional language |
| `list_boxes_at_location` | location slug, optional language |
| `get_box_photo` | box_id, optional photo_id or role |

MCP text results contain text JSON and structuredContent. Photo metadata excludes URLs and upstream credentials. `get_box_photo` returns a base64 thumbnail, choosing inside/spread/detail/label/location in that order unless explicitly selected. Locations group boxes by storage unit and order positions by row, slot and variant.

## Remaining differences and verification boundaries

- Search now includes reference-style Swedish suffix variants, RC/car synonym expansion, short adjacent-letter swaps and weighted field ranking. Retained current/historical filename lookups prioritize exact names. Live album filename enrichment for imported references without saved names remains pending; exhaustive ranking parity is not claimed.
- Current-session selection retains reference precedence: isCurrent, photo count, then creation date. Import rejects duplicate current sessions or broken references instead of guessing a repair.
- Malformed `/ask` payloads now return 400 rather than the reference handler's possible 500. Error wording, multiple-match answers and German labels do not yet have complete parity tests.
- Actual HA client calls and result mapping are verified. The real-HA Docker harness additionally verifies config flow, entities, services, events, conversation, reload persistence, bundled card delivery and signed images. Browser acceptance covers a Swedish question, RC synonym, no-result clearing and thumbnail rendering in the actual Lovelace card. Physical speech/satellites remain outside this isolated test.
- Legacy settings are retained; appearance response language, public security configuration and photo source/album settings are consumed. New UI-language and task-based AI settings are separate from legacy translation files and legacy AI prompts. Separate language files require a later migration step.

## Photo management endpoints

All `/api/manage/*` routes use the configured management access mode described above. `GET/PUT /api/manage/settings` exposes and edits the photo source, with redacted credentials and an optimistic source revision. Independent UI/external-response languages use `GET/PUT /api/manage/languages`. `GET /api/manage/albums` discovers albums; `GET /api/manage/album?refresh=true` returns the selected album's image metadata, assignment flags (including `assignedUnits`) and expiring preview URLs. `GET /api/manage/storage-map` includes unit photos; `PUT /api/manage/storage-units/<slug>/photo` assigns/clears one. Unit photos are reserved from new box attachments. `POST /api/manage/session` requires the catalog's `photoSourceRevision` when attaching previously unused images, and verifies current album membership before writing.

Immich album images use paginated `POST /api/search/metadata` with `albumIds`, `size` and `page`, matching the reference rather than relying on embedded album assets. Shared-link mode reads `/api/shared-links/me`. PhotoPrism lists `/api/v1/albums` and searches `/api/v1/photos` with album `s`, `count` and `offset`. All calls are read-only even where the metadata search method is POST. Adapter errors do not expose upstream response bodies or credentials.

## Deployment and printing boundary

Inventory/settings migration and Portainer cutover completed on 2026-10-25, with
updates through 0.29.0. Remaining translation/ranking differences are follow-up
work, not an uncompleted production migration. External Authelia and physical speech
checks remain separate from isolated HA/card acceptance. See [Verification](VERIFICATION.md).

This app no longer implements CUPS, driver selection or DYMO protocol access.
[Printing](PRINTING.md) describes the label-service API and actual owner-accepted
output. Current location/unit templates still require physical acceptance when
needed. Storage-unit photos/labels and additional position management are extensions,
not requirements inherited from the reference app.

## Shared search journal (0.29.0)

Public REST/MCP response shapes and lexical ranking are unchanged. Accepted search
and answer requests now also write bounded private snapshots to a separate SQLite
table, readable only through management `GET /api/manage/search-history`. HA shares
the public API source; no client/header change is needed. Schema 4/SQLite backups
include the log; inventory-only JSON does not. See [Search log](SEARCH-LOG.md).
