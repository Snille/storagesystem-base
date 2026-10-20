# History

## 0.9.1-dev - 2026-10-20

- Added an evening handover with frozen local evaluation paths, accepted labels, reproduced baseline, ordered model-comparison steps and production safety boundaries. Re-ran all 48 checks and reviewed-data validation; no new runtime feature/version change for this documentation step.

- Recorded user acceptance of all 30 evaluation questions, proposed boxes and three absent-item cases. Froze a separate reviewed dataset while preserving the draft; reproduced the unchanged lexical baseline and integrity checks. Embedding comparison remains pending.

- Drafted 30 private, source-bound workshop search questions with current destination checks, functional/code/transcription cases and clarification/unsupported expectations. Recorded existing lexical rankings (13/24 top-1, 17/24 top-5 against provisional labels). Human review and embedding comparison remain pending; no model calls or runtime changes.

- Prepared a user-authorized, inventory-only live snapshot in Git-ignored evaluation storage: 164 boxes, 249 sessions and 306 photo references. Verified isolated SQLite import and exact record preservation; derived 164 current-session search documents. No credentials/image binaries were persisted and no embedding model was called. Documented evaluation inputs and next steps.

- Documented the current button-activated workshop voice path, observed multi-location answers, proposed hybrid retrieval/short-answer/clarification contract and SQLite capacity decision. Read-only production scale: 164 boxes and 293 current photo references. Semantic search and follow-up context remain planned; no production settings or firmware were changed.

- Widened Photo settings to the shared 1000px dialog width, capped at 94vw on smaller screens, matching box details, AI views and the album inbox.

## 0.9.0-dev - 2026-10-20

- Added a storage map for shelving units, benches and cabinets using shared registered positions/current box locations. Show separate letters, free registered positions, unregistered gaps and unmapped boxes. Search highlights matching boxes and opens their unit; clicking a box opens its ordinary details.
- Restored reference-style Swedish suffix variants, RC/car synonyms, short adjacent-letter transpositions and field-weighted ranking in the shared UI/REST/MCP search. Explicit filename lookups prioritize exact retained current/historical filenames and return current inventory. No photo-service lookup is needed during search.
- Retired Excel catalog import/export from scope at Erik's request; it was a one-time initial label import. Inventory JSON operations remain supported.
- Added a disposable Docker acceptance harness using real Home Assistant 2026.10.2 and the unmodified reference integration, with synthetic inventory and no discovery or TTS.

## 0.8.1-dev - 2026-10-20

- Widened box details from 650px to 1000px using the shared wide-dialog layout. Small screens remain limited to 94vw; fitted photo proportions and image viewing are unchanged.

## 0.8.0-dev - 2026-10-20

- Added selected-photo AI updates from the box editor, including newly attached Spread/detail images or existing photos. Send the current editor description as context to preserve prior useful contents, with explicit before/after review and apply/save steps.
- Keep the box name unless explicitly selected, preserve identity/location/manual notes/unselected photos, and create history only on final session save. Retained current photos can be analyzed outside the album.
- Reject stale existing-box analyses and optimistic session saves when another client changes the current session. Added isolated coverage for context, retained/new photos, concurrency and REST/MCP/history consistency.
- Added an explicit live local-AI update acceptance script that reads settings from a read-only database and writes inventory only in memory.

## 0.7.1-dev - 2026-10-20

- Show album inbox and AI test-album photos fitted without CSS cropping, preserving portrait/landscape proportions in a consistent image frame. Use the larger album preview rather than the thumbnail when available.
- Added synthetic portrait/landscape browser-fixture images with a visible perimeter for crop verification.

## 0.7.0-dev - 2026-10-20

- Added a dedicated Languages dialog with independent interface and external-response languages. English remains the default; Swedish UI catalogs cover inventory, locations, photos, viewer, settings and AI workflows. Language selection persists across reloads without translating user inventory or model output.
- Renamed AI output language and its inherited setting to explicitly identify the external-response default; kept existing stored settings and explicit caller overrides compatible. Moved response-language settings out of photo configuration.
- Clarified that extra AI instructions supplement the read-only built-in instructions and renamed their reset action to Clear extra instructions.
- Released photos removed from current inventory back to the unassigned album inbox after saving. Historical references remain intact and no longer prevent reassignment; current ownership and source/membership checks remain enforced in the shared inventory service.
- Added independent-language, settings-preservation, stale-edit and release/reassignment/history checks with isolated data.

## 0.6.9-dev - 2026-10-20

- Made session-photo thumbnails clickable in manual and AI-review editors. Open unsaved or retained photos in the existing zoom/pan/previous/next viewer, without cover writes or losing the draft.
- Added expiring, rendition-bound album grants for preview/original images so labels can be inspected at full resolution before inventory is saved. Display URLs are excluded from saved photo records.
- Mark occupied position/letter choices unavailable, excluding the current box's own position. Refresh occupancy after save conflicts while keeping form contents.
- Enforce exact position uniqueness inside the shared session transaction, comparing equivalent legacy location formats and rejecting concurrent double assignment without partial writes. Moving away frees the position; different letters remain separate positions.

## 0.6.8-dev - 2026-10-20

- Reduced Box ID to a small read-only metadata line below the editor's save action, removing the prominent form field and explanation. Automatic allocation and stable existing identifiers are unchanged.
- Simplified the save confirmation so it focuses on the inventory session rather than the internal identifier.

## 0.6.7-dev - 2026-10-20

- Made Box ID visible but read-only, with a location-based proposed ID for new boxes. The shared inventory service allocates the final unique ID atomically on save; moved boxes keep their identifiers and concurrent new-box saves cannot overwrite each other.
- Replaced the generic waiting cursor on disabled buttons with an unavailable cursor. Album selection explains the required photo choice and the six-photo AI limit. Actual session saves explicitly mark the button busy.
- Added automatic-ID collision, concurrent HTTP save, movement and MCP consistency checks.

## 0.6.6-dev - 2026-10-20

- Restored the reference location workflow: category, suggested/free-entry unit, shelf or bench surface, position 1-12 and optional letter A-Z. New locations are composed automatically and saved with the inventory session.
- Replaced the flat position selector and separate registration form with structured controls; existing boxes retain exact saved locations until Change location, with an explicit cancel action.
- Shared location parsing/building between browser and inventory presentation, preserving legacy identifiers and supporting named shelving units. Added format/validation and alias-preservation checks.

## 0.6.5-dev - 2026-10-20

- Replaced free-text box location entry with a required selector of known storage positions, showing exact IDs, readable labels and occupancy. Box identity stays independent of the selected position.
- Added explicit position registration for empty installations and new positions. Reuse the existing SQLite locations table; registered and vacated positions remain selectable without creating inventory sessions.
- Added shared inventory-service position listing/registration with management-only endpoints, plus isolated move/history, REST/MCP consistency and backup/fresh-restore checks.
- Position registration persists immediately. SQLite backup includes unused positions; the legacy inventory-only JSON format continues to export box-associated positions only. Full storage-unit layout management remains planned.

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
