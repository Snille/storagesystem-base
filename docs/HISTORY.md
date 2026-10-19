# History

## 0.6.4-dev - 2026-10-19

- Recorded the complete implementation state, runtime continuation instructions, verified boundaries and prioritized backlog for a new development session.
- Reconciled roadmap and verification documentation with the implemented photo/AI workflows and the user's retained development inventory.
- Prepared the first runnable implementation for repository handoff; container publication and production deployment remain separate future work.

## 0.6.3-dev - 2026-10-19

- Anchor click-to-zoom to the clicked image detail, keeping it under the pointer where image boundaries permit. Toolbar zoom preserves the detail at the viewport center.

## 0.6.2-dev - 2026-10-19

- Added pointer dragging to pan zoomed photos, with pointer capture, grab/grabbing cursors and disabled native image dragging.
- Clicking a zoomed photo now preserves zoom. Fit image and photo navigation retain explicit reset behavior; clicking a fitted image still opens actual size.

## 0.6.1-dev - 2026-10-19

- Show uncropped preview images in box details, preserving portrait and landscape proportions, with signed preview URLs and an 8 MiB delivery limit.
- Added photo zoom controls, actual-size viewing, fit-to-window reset and scrollable detail inspection; switching photos resets zoom.
- Collapsed inventory history by default while retaining explicit expansion.
- Extended signed-image tests to verify preview delivery and variant-bound authorization.

## 0.6.0-dev - 2026-10-19

- Added box-card photos with a default preference for inside/spread/detail images and an explicit cover choice from the in-app photo viewer.
- Added previous/next and arrow-key photo browsing, captions, loading/error feedback and Esc return to box details, without opening new tabs.
- Store cover choices as optional box metadata, restricted to current-session photos. Cover changes do not create inventory sessions; removing a chosen image in a later session restores automatic selection and retains history.
- Added management authorization, current-photo validation, REST consistency, backup/reopen and cover-removal tests; verified viewer navigation and cover selection with isolated browser data.

## 0.5.0-dev - 2026-10-19

- Added shared multi-photo box analysis for one to six album images with explicit roles, indexed per-photo interpretations, one combined description/keywords and conflict/uncertainty notes.
- Added an Album inbox action to build an AI draft, review the combined suggestion and transfer it into the editable new-box form. Only explicit session save writes inventory; identifiers are entered by the user.
- Preserved manually assigned roles and source metadata; limited aggregate preview data to 16 MiB and retained stale-configuration, album-membership and shared concurrency guards.
- Added atomic protection against an AI new-box draft overwriting an existing box ID, plus isolated analysis/review/save/REST/MCP tests and browser fixtures.
- Verified the three real test-album views (label, inside and spread) together on Spark, then exercised browser review/edit/save in an isolated in-memory inventory. Saved roles, filenames and photo descriptions, REST/MCP retrieval, signed image delivery and the integrity audit passed. The development inventory was not used for acceptance writes.

## 0.4.1-dev - 2026-10-19

- Fetch Immich's larger preview rendition for AI analysis instead of its small WebP thumbnail, with an 8 MiB limit and unchanged small gallery thumbnails. This resolves image decoding failures with the Spark llama.cpp server and provides more label detail.
- Generalized live AI acceptance to named OpenAI-compatible connections, retaining redaction and isolated inventory checks.
- Added an explicit llama.cpp connection type that disables template thinking for direct image descriptions without sending vendor-specific options to other providers.
- Verified a real Immich preview through the Spark's already loaded `qwen3.8-flash-next-uncensored` model, returning a valid Swedish inventory suggestion with no inventory writes. The remote service configuration was unchanged.

## 0.4.0-dev - 2026-10-19

- Added task-based AI assistance with separate overview, reusable named connections and image-inventory settings; other AI tasks are explicitly marked as planned.
- Added OpenRouter and OpenAI-compatible adapters, redacted credentials, stale-edit protection, explicit model discovery and task-scoped extra instructions without hidden model overrides.
- Added a single-photo preview from the configured album: explicit destination disclosure, automatic or manual photo role, language selection, validated descriptions/keywords/uncertainties and no inventory writes.
- Added isolated AI HTTP tests and reproducible live acceptance. Verified two real test-album thumbnails through OpenRouter, including a browser-driven preview, with an in-memory inventory. Small label text remains subject to thumbnail resolution and model interpretation errors.
- Updated the local development container while retaining its inventory and photo configuration. Physical printer testing remains deferred.

## 0.3.0-dev - 2026-10-19

- Documented a proposed task-based AI settings design after reviewing the reference implementation; the first implementation is recorded under 0.4.0-dev.

- Added authenticated photo settings with masked credential status, blank-key preservation, explicit credential clearing and stale-source checks.
- Added Immich and PhotoPrism album discovery and paginated image catalogs, plus Immich shared-link album access.
- Added an album inbox, selection of unassigned photos, photo roles and session photo editing while preserving earlier history.
- Added short-lived preview grants, verified album membership on attachment, and rejection of cross-box image reuse and source switching with existing references.
- Preserved source filenames on new photo associations and included them in inventory search.
- Added isolated settings/catalog HTTP tests and an in-memory browser acceptance fixture.
- Added reproducible live Immich acceptance using the dedicated account: album/preview access in the running container and an isolated inventory round-trip through browser, REST and MCP, including original images and integrity audit.

## 0.2.0-dev - 2026-10-19

- Added a runnable Node/SQLite development preview with shared inventory services for browser management, public REST and read-only MCP.
- Added relational identifiers/constraints with preserved legacy record payloads, versioned schema initialization, atomic validated import and a data integrity audit.
- Added manual box/session editing, current inventory search, location filtering and history in an English UI with system-aware dark/light themes.
- Added inventory JSON export, online SQLite snapshot backup, download and restore into a fresh database; full UI restore remains planned.
- Captured reference API contracts and workflow gaps from the existing Storage System and HA source revisions.
- Added isolated HTTP/database/photo-adapter tests, a pinned non-root Docker image, Compose development stack and a Portainer template.
- Verified the real HA HTTP client against an isolated running development container; a full HA installation and real photo providers remain unverified.
- Deferred physical printer testing until the user has printer access. No existing installation was changed.

## 0.1.0-dev - 2026-10-19

- Created an independent repository for the Docker/Portainer implementation.
- Recorded the SQLite, backup, migration, REST/MCP compatibility, and general CUPS printing direction.
- Added project instructions, version source, and exclusions for runtime data and credentials.
- No application or deployment artifacts are implemented in this foundation.
