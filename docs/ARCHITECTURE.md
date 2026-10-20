# Architecture direction

This document separates the implemented development foundation from the remaining target architecture. See README and the roadmap for feature availability.

## Initial implementation decisions

The first vertical slice uses Node.js 24.14, native ECMAScript modules, `node:http`, `node:sqlite` (`DatabaseSync`), and a small browser client served as static assets. There are no external runtime packages or frontend compilation steps. The HTTP layer is deliberately small and transport-only; it can later move to a framework without changing the inventory service. The built-in SQLite API is experimental in Node 24, so the container pins its runtime by version and image digest and tests it during the build.

- `src/store.js`: SQLite, migration version 1, transactions, import/export, backup and audit.
- `src/inventory.js`: current-session selection, inventory writes, search, local answers and location presentation.
- `src/server.js`: HTTP transport and management authentication.
- `src/mcp.js`: stateless JSON-RPC tool transport using the same inventory service.
- `src/photos.js`: provider-specific image retrieval using stored settings.
- `src/catalog.js`: album adapters, short-lived preview grants and validated image attachment without network I/O in transactions.
- `src/settings.js`: redacted settings views and transactional source/credential editing.
- `src/ai.js`: named AI connections, task settings, bounded OpenRouter/compatible HTTP adapter and validated single/multi-photo drafts without inventory writes.
- `src/search.js`: reference-style ranked search shared by browser, REST and MCP, using current contents and retained filename history.
- `src/storage-map.js` / `web/storage-map.js`: shared sparse map of registered positions and current box occupancy; no inferred storage capacity.
- `web/box-draft.js`: selected-photo role editing, combined suggestion review and explicit transfer to a new-box editor or the open existing-box editor. Updates include current editor context, before/after review and optional name changes; shared session saves guard the expected current session.
- `web/`: English/Swedish inventory UI; all searches call the shared server service.

SQLite separates locations, boxes, sessions, photos and settings into relational tables with foreign keys and a unique current-session index. Each record also retains its legacy JSON payload so optional and future fields survive migration. Constraints tie JSON identifiers to relational columns. The audit validates complete record shapes and relationships as well as SQLite integrity. Location identifiers are preserved exactly. Empty storage-unit design and spatial layout are still future work.

Known storage positions use the existing `locations` table. Inventory imports and session saves register their referenced IDs; explicit management registration also permits empty positions. Moving boxes does not remove old positions. `Inventory.positions` supplies exact IDs, readable labels (without box-ID inference) and occupancy through management-only endpoints. The browser location editor uses the shared `src/locations.js` parser/builder to compose category/unit/row/slot/letter selections; new destinations use the ordinary session save. Existing saved IDs remain unchanged until explicit location editing. Session save remains the same shared service consumed by REST/MCP reads; the legacy MCP storage-unit grouping contract is unchanged. Unused positions are included in SQLite backup/restore but not in the legacy inventory-only JSON format. No schema migration is needed.

For this initial small-inventory implementation, writes validate a snapshot and replace inventory rows inside one short `BEGIN IMMEDIATE` transaction. This favors atomic behavior and a narrow service surface; it is not an efficient strategy for large inventories. Before supporting larger datasets, replace it with targeted statements and measure latency. SQLite operations and snapshots run synchronously on the application thread; backups temporarily pause request handling. No network I/O occurs inside write transactions.

The schema uses `PRAGMA user_version`. Version 0 is initialized transactionally, version 1 is reopened, and newer unknown versions are rejected. Future changes must add ordered transactional migrations rather than edit an already deployed schema. `VERSION` remains authoritative for application version; package.json deliberately has no duplicate version.

Management uses a separate environment key sent in a header, never query authentication. Public read authentication and per-photo HMAC signatures follow the reference contract. No management session is persisted in the browser. Origin checking rejects cross-site browser requests; no permissive CORS is enabled.

The photo settings API exposes credential-presence flags and a SHA-256 source revision, never stored keys or unrelated settings. A source change invalidates previews, cached catalog metadata and pending new attachments. Moving an existing key to another host/provider is prevented by clearing credentials on identity changes. Sources cannot switch servers once photos are associated, because legacy references do not yet encode server identity.

Album previews for images not yet in inventory use an independent per-process HMAC grant bound to asset ID, source revision and a 15-minute expiration. They do not contain management keys or upstream credentials. New image attachments must still belong to the configured album, are checked before the short database transaction, and cannot already belong to a different box. Retained associations require no network round-trip. Photo roles and filenames are stored in the same legacy-compatible photo records; no schema migration is needed for this increment.

Consistent online backup uses SQLite [`VACUUM INTO`](https://www.sqlite.org/lang_vacuum.html), with an exclusively reserved destination, instead of copying a live `.sqlite` file and ignoring its WAL. The Node asynchronous backup path stalled intermittently under the Windows Node 26.5.1 test runner, so it is not used. Restoration audits a snapshot and creates a new file; it never replaces the running database.

## AI image renditions

Inventory photo responses also include a signed `previewUrl` for uncropped box-detail images. Its signature binds both asset and rendition, and the adapter limits it to 8 MiB. The photo viewer loads the bounded original rendition and implements fit, actual-size and relative zoom through image dimensions inside a scrollable viewport. History expansion is browser-only state.

AI analysis uses the photo adapter's internal `analysis` variant: Immich's larger `size=preview` image, or PhotoPrism's existing preview tile, limited to 8 MiB. Gallery and signed public thumbnail retrieval retain their existing 2 MiB small-thumbnail behavior. This avoids sending Immich's WebP thumbnail to compatible servers that cannot decode it, without downloading unbounded originals. The upstream photo source remains read-only.

## Boundaries

Multi-photo analysis uses the same AI service and busy guard as single-photo tests. It accepts one to six distinct current-album asset references, reads each preview with a single source snapshot and bounds the total to 16 MiB. Model photo indices must form an exact permutation of the selected input positions; application code maps them back to source identifiers and preserves manual roles. No model-generated box/location identifier is accepted. Combined text and per-photo notes are returned as an unsaved suggestion, not persisted.

The browser transfers a reviewed suggestion to the existing editor and session service. The final save rechecks album membership/source revision and photo ownership. For AI new-box drafts, `expectNewBox` is checked atomically within the inventory transaction to prevent replacement of an existing identifier, including a concurrent creation. No additional persistence schema or AI-specific inventory write path is introduced.

AI configuration is stored in the `aiWorkspace` settings record without a relational schema change. Legacy `ai`, `translationAi`, `prompts` and `modelPrompts` records remain preserved and inactive. Management-only AI endpoints redact keys and use a configuration revision for stale writes and pending-result checks. A preview resolves its AI task and photo source once, checks current album membership and fetches only the selected preview image with those credentials. It validates the model output before returning the draft, never writes inventory, never follows provider redirects and never forwards raw provider errors. Connection tests/model discovery are distinct from an explicit image test. Last connection-test status is ephemeral and invalidated by settings edits or process restart. Credentials in full SQLite backups must be treated as private, just like photo credentials.

Separate inventory rules, persistence, external integrations, transport endpoints, and user interface. UI actions, REST endpoints, and MCP tools should call the same application services.

External integrations include album photo sources, AI providers, and printing. Keep provider-specific behavior behind explicit adapters.

## Persistence

Optional box `coverAssetId` metadata records an explicit current-photo cover choice. The inventory service resolves a current photo for cards, returning additive REST fields `coverAssetId` and `coverIsAutomatic`. A management-only cover endpoint validates current-session membership and changes metadata atomically, without creating history. Session saves clear a cover removed from the new current photos. SQLite payload storage already preserves this metadata; no schema change is required. MCP's existing photo projections and default contents-photo preference remain unchanged.

Use SQLite for a single application instance, with the active database on local storage in a persistent Docker volume. Do not place the active database on SMB or NFS.

Model boxes, sessions, photo references, and related data with tables, foreign keys, constraints, and transactions. Store user settings and translation overrides in the database; ship default language catalogs as application resources. Original images remain in the configured photo service.

Use versioned schema migrations. Provide an integrity audit whose exit status is zero only when required checks pass. Keep database transactions short and free of external network calls.

## Compatibility

The existing application's public REST API and the current storagesystem-ha client are the compatibility references. Capture methods, authentication, parameters, response fields, language behavior, error behavior, and usable image URLs in contract tests before replacing behavior.

Preserve the existing /api/mcp endpoint and read-only tools: search_inventory, get_box, list_locations, list_boxes_at_location, and get_box_photo. Preserve supported authentication and transport behavior verified from the reference implementation.

Home Assistant and browsers must be able to reach returned image URLs. Internal Compose service names must not leak into externally consumed URLs.

## Backup and migration

Provide consistent online SQLite backups, downloadable backup and controlled restore in the UI, and readable JSON export. Backups of app data do not back up original photos in external photo services.

Import legacy inventory and settings with validation, preserving IDs, history, photo associations, and relevant user configuration. Compare record counts and relationships, retain source files, and prove restoration into a fresh instance before considering migration complete.

Excel catalog import/export is excluded: Erik retired the one-time label-import workflow on 2026-10-20. It is not a migration or release requirement.

## Printing

Separate label layout and document generation from print submission and printer capabilities. Support label printers and ordinary printers through CUPS; A4 label sheets need explicit geometry and start-position handling.

Offer an optional CUPS container or a configured existing CUPS server. Ship required printer filters in the print image, with reproducible source versions and patches. DYMO-specific roll detection and remaining-label status are optional capabilities, not requirements for other printers.

The reference repository includes raster2dymolw_nolm.cpp, an adaptation of the DYMO filter that disables post-print LanguageMonitor polling. Its equivalence to the installed production binary has not yet been established. Review and physically verify the working print path before packaging it.

## Deployment

Target a prebuilt application image, a Compose stack usable in Portainer, a persistent application-data volume, and optional persistent print-service configuration. Document fresh install, updates, backup, restore, and health checks.

Develop and verify this service separately from the existing installation. Do not couple it to an existing host's systemd service or checkout layout.

New sessions may omit box/session box IDs together (or send both empty). The inventory service assigns an available location-based identifier inside its write transaction, falling back to a UUID-based ID for unparsed locations. Explicit IDs remain supported for compatibility. The browser shows a read-only proposed ID but sends an empty ID for new boxes; final allocation rechecks all existing box identifiers, including moved boxes.

Session-photo viewers retain original/preview URLs through album and AI-draft transfer but exclude them from inventory writes. Unsaved album image grants bind asset, rendition, source revision and expiration; the existing adapter bounds previews to 8 MiB and originals to 32 MiB. Draft viewing hides cover-management controls. Exact position occupancy is checked in the shared save transaction using a canonical comparison key for known legacy formats; stored IDs are preserved. The current box is excluded from conflicts.

## Language boundaries and photo assignment

`appearance.uiLanguage` controls English/Swedish application text. The existing `appearance.language` remains the default for external local answers and location labels. AI task language `app` keeps its existing resolution to this external default, but the UI names that dependency explicitly. Interface management reads pass their UI language explicitly, independently of external defaults. Language-only edits use a dedicated management endpoint with optimistic revision checks and preserve photo credentials and source revision.

The interface loads a bundled source-language catalog and Swedish translations through `web/i18n.js`. Only initial application-owned text/attributes and explicit UI text helpers are translated. Later inventory text, filenames, provider/model names and AI results are not automatically scanned or translated. The public interface-language endpoint returns only the configured interface language for the sign-in view. English remains the fallback for unmapped technical messages.

Album assignment and write ownership use the same effective current-session selection as inventory reads, rather than all historical photo rows. Saving a session without a photo releases its current ownership while leaving prior photo records untouched. Attaching an image referenced only in history is a new attachment and must pass the current source/album checks; another box's current ownership is still checked inside the final transaction.

## Proposed semantic retrieval and voice decisions

[VOICE-SEARCH.md](VOICE-SEARCH.md) documents the existing physical-button-to-HA-to-Piper-to-announcement path and the proposed hybrid retrieval/one-destination answer contract. This is design work, not an implemented feature. Retain SQLite for the observed 164 boxes/293 current photo references and their conservative doubled scenario. Store derived, versioned embeddings separately from inventory rows and compare this small corpus directly before considering a vector extension or PostgreSQL. Original image files stay in the external photo service. Revisit the database choice on measured concurrency/corpus growth rather than treating PostgreSQL as a requirement for semantic quality. The production route to an embedding service remains an explicit deployment gate.
