# Architecture

Current source: 0.30.0 (prepared); production: 0.29.0. Reviewed 2026-10-30. Preview-only semantic behavior is identified separately below. See [Status](STATUS.md) and [Roadmap](ROADMAP.md) for availability and remaining scope.

## Runtime and service boundaries

The container runtime uses Node.js 24.14, native ECMAScript modules, `node:http`, `node:sqlite` (`DatabaseSync`), and a small browser client served as static assets. There are no external runtime packages or frontend compilation steps. The HTTP layer is deliberately small and transport-only; it can later move to a framework without changing the inventory service. The built-in SQLite API is experimental in Node 24, so the container pins its runtime by version and image digest and tests it during the build.

- `src/store.js`: SQLite schema 4 with ordered migrations, transactions, import/export, backup and audit.
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

The schema uses `PRAGMA user_version`: version 1 holds inventory/settings/locations, version 2 adds the legacy print journal, and version 3 adds background media, and version 4 adds the separate search journal. Empty databases initialize and migrate transactionally; supported older databases migrate in order. Unknown versions above 4 are rejected. Future changes must add ordered transactional migrations rather than edit an already deployed schema. `VERSION` remains authoritative for application version; package.json deliberately has no duplicate version.

Management normally uses a separate environment key sent in a header, never query authentication. Explicit `STORAGE_MANAGEMENT_ACCESS=open` permits keyless management with required allowed hosts; production uses this mode on the trusted LAN behind the authenticating proxy. `APP_ALLOWED_HOSTS` restricts API hosts and browser origins; the public API/MCP key remains independent. Public read authentication and per-photo HMAC signatures follow the reference contract. No management session is persisted in the browser. Origin checking rejects cross-site browser requests; no permissive CORS is enabled.

The photo settings API exposes credential-presence flags and a SHA-256 source revision, never stored keys or unrelated settings. A source change invalidates previews, cached catalog metadata and pending new attachments. Moving an existing key to another host/provider is prevented by clearing credentials on identity changes. Sources cannot switch servers once photos are associated, because legacy references do not yet encode server identity.

Album previews for images not yet in inventory use an independent per-process HMAC grant bound to asset ID, source revision and a 15-minute expiration. They do not contain management keys or upstream credentials. New image attachments must still belong to the configured album, are checked before the short database transaction, and cannot already belong to a different box. Retained associations require no network round-trip. Photo roles and filenames are stored in the same legacy-compatible photo records; no schema migration is needed for this increment.

Consistent online backup uses SQLite [`VACUUM INTO`](https://www.sqlite.org/lang_vacuum.html), with an exclusively reserved destination, instead of copying a live `.sqlite` file and ignoring its WAL. The Node asynchronous backup path stalled intermittently under the Windows Node 26.5.1 test runner, so it is not used. CLI restoration audits a snapshot and creates a new file, refusing an existing destination. The separate `RestoreService` supports controlled UI replacement: bounded upload, validation/migration on a private copy, expiring token, typed confirmation, a consistent safety backup and one audited restore transaction. Schemas 1-4 are supported.

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

Model boxes, sessions, photo references, and related data with tables, foreign keys, constraints, and transactions. User settings live in the database; default language catalogs ship as application resources. A translation-override editor/import is not implemented. Original images remain in the configured photo service.

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

Decision 2026-10-24: printing belongs to the separate label service (Snille/label-service), its own Portainer stack with a CUPS container (official DYMO driver) and a LAN API. It is the only program that talks to the printer, including roll reading, because two programs that each reserve the printer can collide. It owns label layout, formats, text sizes and direction, preview, one-copy submission, deduplication and the print journal.

This application is a client with its own key: it builds label content from inventory data (box or registered location), lets each label type (box, location, storage unit) use a standard template and other templates from the service (settings record `labelTemplates`; a box keeps its last non-standard choice as `labelTemplate`), shows the service's preview, re-checks that the box is unchanged before printing, and submits with a request identifier the service deduplicates. Label design and further printer capabilities belong to that service. The stock DYMO filter (with LanguageMonitor) is used; the reference `raster2dymolw_nolm.cpp` patch was not needed.

## Deployment

A prebuilt public Docker Hub image and the Portainer Compose stack are deployed in production. The app uses a persistent local data volume; label-service has its own deployment/state. See [Deployment](DEPLOYMENT.md) for installation, releases, backup/restore and rollback.

Develop and verify this service separately from the existing installation. Do not couple it to an existing host's systemd service or checkout layout.

New sessions may omit box/session box IDs together (or send both empty). The inventory service assigns an available location-based identifier inside its write transaction, falling back to a UUID-based ID for unparsed locations. Explicit IDs remain supported for compatibility. The browser shows a read-only proposed ID but sends an empty ID for new boxes; final allocation rechecks all existing box identifiers, including moved boxes.

Session-photo viewers retain original/preview URLs through album and AI-draft transfer but exclude them from inventory writes. Unsaved album image grants bind asset, rendition, source revision and expiration; the existing adapter bounds previews to 8 MiB and originals to 32 MiB. Draft viewing hides cover-management controls. Exact position occupancy is checked in the shared save transaction using a canonical comparison key for known legacy formats; stored IDs are preserved. The current box is excluded from conflicts.

## Language boundaries and photo assignment

`appearance.uiLanguage` controls English/Swedish application text. The existing `appearance.language` remains the default for external local answers and location labels. AI task language `app` keeps its existing resolution to this external default, but the UI names that dependency explicitly. Interface management reads pass their UI language explicitly, independently of external defaults. Language-only edits use a dedicated management endpoint with optimistic revision checks and preserve photo credentials and source revision.

Interface text lives in `web/locales/en.js` and `web/locales/sv.js`. Keys are the English strings used in the code; each file maps them to that language's text, so English wording can change without code edits and a future translation tool has a complete catalog. `test/i18n.test.js` fails when a string in the code or `index.html` is missing from either file or when the two files have different keys. Product names, addresses and sample input are listed there as untranslated.

Appearance also stores the shared `accent` colour (default `#95c200`) and validates its format; text contrast adjusts in the browser. Theme remains per-tab. The page background is chosen in the Appearance dialog: `appearance.background` is `hills`, `pegboard`, `blueprint` (SVGs in `web/backgrounds`), `none` or `custom`. It is public (`GET /api/appearance`) because the page shows it before anyone enters a key; changes go through `PUT /api/manage/appearance` with an optimistic revision. An uploaded image (JPEG, PNG or WebP, at most 5 MiB, bytes checked against the type) is stored in the `media` table added by schema 3, so SQLite backups and restores include it; the inventory JSON export does not. The audit checks each image's hash and type and that a selected custom background has an image. The start page shows the photo album's cover (`GET /api/manage/overview`, signed preview URLs, Immich only) and counts storage units from current box locations. The cover is shown as a panorama with the vendored Pannellum viewer (`web/overview.js`): a 2:1 image is a full sphere, a wider one a 180 degree panorama. Clickable points (`overviewPoints` settings record, keyed by the image's asset ID: `yaw`, `pitch`, storage unit slug) open that unit on the storage map; `PUT /api/manage/overview/points` saves them with an optimistic revision. A new cover that never had points saved is offered the latest saved image's points (`overviewPointsSource`), saved for it at the first change; the old image's points stay saved. Points can be dragged and all turned together in edit mode. To update Pannellum, replace the files in `web/vendor/pannellum` from the npm tarball and check them the same way.

The interface loads a bundled source-language catalog and Swedish translations through `web/i18n.js`. Only initial application-owned text/attributes and explicit UI text helpers are translated. Later inventory text, filenames, provider/model names and AI results are not automatically scanned or translated. The public interface-language endpoint returns only the configured interface language for the sign-in view. English remains the fallback for unmapped technical messages.

Album assignment and write ownership use the same effective current-session selection as inventory reads, rather than all historical photo rows. Saving a session without a photo releases its current ownership while leaving prior photo records untouched. Attaching an image referenced only in history is a new attachment and must pass the current source/album checks; another box's current ownership is still checked inside the final transaction.

## Proposed semantic retrieval and voice decisions

[VOICE-SEARCH.md](VOICE-SEARCH.md) documents the existing physical-button-to-HA-to-Piper-to-announcement path and proposed runtime retrieval/answer contract. `src/answer-policy.js` implements a synchronous decision preview used by `Inventory.previewAnswer`. It combines current literal evidence with externally supplied, current-session-bound semantic scores, and validates explicit owner rules separately. It performs no network calls or writes, and formats selected destinations from current inventory records. The public ask/search and MCP/browser paths retain their previous behavior; no semantic runtime is activated. See [ANSWER-POLICY.md](ANSWER-POLICY.md) for evidence precedence, limits, configuration and evaluation.

Retain SQLite for the observed 164 boxes/293 current photo references and their conservative doubled scenario. Store derived, versioned embeddings separately from inventory rows and compare this small corpus directly before considering a vector extension or PostgreSQL. Original image files stay in the external photo service. Revisit the database choice on measured concurrency/corpus growth rather than treating PostgreSQL as a requirement for semantic quality. The earlier compatible Ollama route was measured but silently truncates at 2048 tokens; the optional runtime below uses a native adapter with explicit rejection instead. Native routing was verified on 2026-10-29; independent decision acceptance remains an activation gate.

The 0.10.1-dev `verifiedPreviewAnswer` service adds an optional injected identity
verifier for semantic-only candidates. `identity-verifier.js` sends bounded
current source text to an explicitly configured local model and returns exact
source-bound evidence. Similarity alone cannot produce a confident answer.
Evidence is checked again against query, confirmed intent and current session
after inference. IDs/locations stay in application code; unavailable verification
causes abstention. This is an isolated preview with live local tests, not an
enabled application setting or deployment decision. See ANSWER-POLICY.md.

Version 0.10.2-dev adds `semantic-index.js` with a separate derived SQLite cache,
post-commit background reconciliation and full-current-corpus ranking. Cached rows
bind exact current session/content to document version, endpoint, model digest and
dimension. Results are rechecked after inference; stale/incomplete indexes yield
no semantic scores. `embeddings.js` uses native Ollama with `truncate: false` and
checks the model digest before each request. `semantic-runtime.js` is explicitly
enabled by server environment configuration, disabled by default and used only
by authenticated management preview endpoints. No public search/ask/MCP behavior
changes. The native deployment route was verified on 2026-10-29 and source
0.30.0-dev integrates runtime identity verification; independent acceptance and
public activation remain open. See SEMANTIC-RUNTIME.md.

Version 0.11.0-dev adds `SearchSettings` and `SearchService` over the same store
and inventory service. `searchWorkspace` persists embedding configuration and
owner answer rules in the existing settings table; they need no additional schema
migration (the source now uses schema 4). Shared validation runs on save/import/audit/restore. Settings views redact keys
and writes require an optimistic revision, preserve unrelated sections and clear
credentials when the destination changes. Native model discovery uses only the
saved endpoint/key and returns names/digests without inference or source text.

The service replaces the optional embedding worker/cache on configuration
changes, serializing transitions outside inventory transactions; rules-only
changes reuse vectors. Requests read one settings snapshot and reject results
after a revision change. Management preview uses saved rules even with embeddings
disabled, while public UI/REST/MCP/HA search remains unchanged. The Search & answers
dialog edits structured rules and model settings without exposing raw JSON or
provider errors. Identity model/threshold selection and independent acceptance
remain separate activation gates. No speech normalization is enabled.

Source 0.30.0-dev adds optional `searchWorkspace.verification` with independent
compatible endpoint/model/key, explicit similarity/margin and bounded timeout.
Missing configuration means disabled and no preset thresholds. Management preview
passes saved thresholds to `Inventory.verifiedPreviewAnswer` only with complete
retrieval and verification enabled. A stable verifier instance bounds concurrency;
requests report safe outcome categories. Configuration and all current semantic
document hashes are rechecked after inference, including competitors. A changed
policy or corpus cannot return the old semantic answer. Valid cached vectors are
reused on verification/rule changes; public search still uses its original path.

### Historical direct printing (0.12-0.14, removed from runtime)

Direct IPP/PostScript layout and DYMO roll reading moved out in 0.15.0.
The schema-2 `print_jobs` journal and old `printing` settings are retained only for
validation, backup and restore; new jobs are owned by label-service. There is no
raw printer polling, reset, recovery or direct CUPS endpoint in this application.
See [Printing](PRINTING.md) and [History](HISTORY.md) for physical acceptance limits.

## Storage-unit photos and current AI answers

`unitPhotos` settings map storage-unit slugs to album asset IDs. The management
storage-map response includes signed image URLs; choosing/clearing a photo uses
`PUT /api/manage/storage-units/<slug>/photo`. Catalog validation requires an existing
unit and current album membership, and treats these photos as assigned (`assignedUnits`)
so they cannot also be newly attached to a box. The image stays in the photo service;
SQLite backups include the assignment, not the external image.

AI drafts/per-photo descriptions are editable before ordinary session save. Named
connections and the image task's optional fallback are stored in `aiWorkspace`.
`Ai.phraseAnswer` also uses this route/fallback for public `/ask`: lexical selection
comes from Inventory, then at most five matches are phrased with bounded output and
internal-ID rejection. Failure returns the local answer. This public behavior is
separate from `SearchService.preview`, which applies saved rules/optional embeddings
and, in source 0.30.0-dev, optional saved identity verification. It does not alter
public search.

## Search journal

`SearchHistory` wraps accepted transport searches/answers once, after final answer
phrasing. It stores bounded query/answer/match snapshots in schema-4 `search_history`,
with 90-day/10,000-entry retention. The server owns attribution; HA and REST share
the API source. MCP captures search only, not the caller's later response. Access is
management-only, with cursor/text/source filtering. Journal transactions skip store
notifications so they do not trigger semantic reconciliation. Backup/full restore
include the table; inventory snapshots/JSON exclude it. See [Search log](SEARCH-LOG.md).
