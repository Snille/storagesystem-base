# History

## 0.13.1-dev - 2026-10-23

- Corrected manual roll-reader cleanup for a granted error response (engine 2, no active job). Report the device error and release the same connection's reservation; never release an active/foreign job or feed/reset.
- Added regression coverage for error/jammed reservations and active error jobs.
- Diagnosed printer-reported bay 9 (jammed) before image transfer during tests 116/117. The owner found the roll was backwards and corrected it. Unchanged 25 x 54 mm test job 118 then completed with an idle/empty, error-free queue; the owner accepted physical text/orientation and solid power, with a matching photo.
- All 98 tests pass locally and in pinned Docker. Built separate `storagesystem-base:roll-reader-0.13.1` image; no production driver, configuration or service changes.

## 0.13.0-dev - 2026-10-23

- Added explicit DYMO 5XL roll reading using a bounded same-socket ownership/read/release cycle. The owner confirmed solid power and no feeding both after the experimental cycle and after the app button read S0722540 / 677 labels.
- Added four article-backed media presets, shared dynamic SVG/PostScript layouts, detected-format selection and a bounded portrait preview with its format caption. Dimensions are preset lookups; unknown articles never inherit CUPS default dimensions.
- Added seven protocol/layout/concurrency cases; 97 local tests pass. A real change to S0722520 / 413 labels was owner-accepted with solid power and no feed; alternate-format physical printing remains pending. No new print jobs or production configuration changes.

## 0.12.1-dev - 2026-10-23

- Expanded English/Swedish printing status to show CUPS queue state/reasons, acceptance, queued jobs, model, configured default media and the application's explicit label format. Explain that queue status cannot diagnose the physical lamp or determine the loaded roll/count/temperature.
- Investigated optional direct DYMO status without submitting a label. The owner reported renewed white power-lamp blinking after the version/status sequence, despite successful protocol fixtures. Withdrew the experimental adapter, route, settings and controls; direct diagnostic settings are rejected. No new direct printer connection remains in the application. Production code/driver/configuration was not changed.
- Existing test and longer current-box labels have owner/photo acceptance. The earlier legacy status function requests a print lock and must not be reused for passive monitoring. Query 0 alone previously coincided with the lamp returning to solid, but the combined experiment disproved readiness of the proposed diagnostic path; root cause and error-field 0x1000 remain unresolved. Further hardware protocol investigation is deferred.

- All 90 tests pass locally and in pinned Node 24.14 Docker; built a separate `storagesystem-base:printing-status-0.12.1` image.

## 0.12.0-dev - 2026-10-23

- Added management-only CUPS/IPP label printing: saved connection/font settings, queue status, test/current-box labels, shared SVG/PostScript layout, editable label-only text, overflow rejection and explicit one-label submission. Initial format is S0722540 / 57 x 32 mm, with Swedish Latin-1 glyphs; other formats, QR codes, sheets and the full designer remain pending.
- Added durable print-request/token deduplication, a pre-submission journal, stale content/configuration guards, strict IPP response checks and no automatic print retries. Ambiguous submissions remain unknown and must be inspected. No queue clearing, cancellation, driver changes or production service restart is performed.
- Main SQLite schema migrates transactionally from 1 to 2 to add the print journal. Inventory/settings/identifiers are preserved, schema-1 evaluation snapshots remain readable, and backups/audits/restores include the journal. A private backup preceded migration of the isolated preview.
- Browser-submitted DYMO_5XL CUPS job 114 completed; queue returned idle/empty and the physical roll counter fell from 679 to 678. Loaded SKU S0722540 matched the explicit w162h90 media despite an incorrect CUPS default. The owner approved physical legibility/orientation and supplied a photo confirming Swedish glyphs and unclipped text. See PRINTING.md.

- All 89 tests pass locally and in pinned Node 24.14 Docker; built a separate `storagesystem-base:printing-preview-0.12.0` image.

## 0.11.0-dev - 2026-10-23

- Added the English/Swedish Search & answers dialog with saved native embedding settings, explicit model/digest discovery, index status/retry, structured owner rule editing and a saved-settings answer preview. Rules support either acceptable location, both (maximum two), or a localized clarification. Previews work without embeddings; no workshop-specific rules are shipped.
- Added shared validation for settings import/audit/restore, redacted/retained credentials, destination-bound key clearing, optimistic revisions and stale-preview rejection. Model changes reconfigure the optional worker outside inventory transactions without restarting the app; rules-only changes reuse valid vectors. Public UI/REST/MCP/HA search and paid-model behavior are unchanged.
- Browser testing with an isolated frozen inventory and six already approved rules exposed `nätverkskabel`/`nätverkskablar` not supporting all rule destinations, causing a generic question. Added bounded Swedish cable inflection handling and an exact saved-question regression; verified the finished-cable question and two-location extension-lead response in the UI. Replayed previous source-bound identity evidence offline: original 27/30, owner 20/20, source 30/30, with no incorrect confident answers. This is regression, not independent acceptance or new model inference.
- The owner confirmed physical printer access. Read-only CUPS preflight found `DYMO_5XL` idle/enabled; the new print path and physical output remain to be built/tested. Existing production settings, queues and services were not changed.
- All 81 automated tests pass locally and in pinned Node 24.14 Docker; a separate `storagesystem-base:search-settings-0.11.0` image was built without replacing the existing development image/service/volume. Browser verification used a separate persisted local database, including rule save, model settings save, unavailable native catalog handling and exact short-answer/clarification output.

## 0.10.2-dev - 2026-10-23

- Added optional background semantic indexing and authenticated management preview, disabled by default. Store derived vectors in a separate rebuildable SQLite cache; preserve the main schema and inventory backups. Bind vectors to document version, current content/session, endpoint, immutable model digest and dimensions. Incremental post-commit work never waits for inference inside inventory writes; recheck source after inference and exclude stale/incomplete/corrupt rankings.
- Added native Ollama embedding requests with `truncate: false`, model digest validation, bounded requests/responses and safe provider failure handling. Management preview retains lexical fallback and does not accept caller rules, thresholds or identity proofs. Public search/ask, MCP, browser and HA behavior are unchanged.
- Live-tested the revised current-content serializer against the frozen private inventory with existing Ollama through a temporary SSH tunnel: all 164 boxes indexed; old answer cases 23/24 top-1 and 24/24 top-5; owner answer cases 18/19 top-1 and 19/19 top-5. A 10000-word native input was rejected with a context-length error. This is retrieval regression evidence, not independent decision acceptance. The existing authenticated LAN gateway returns 404 for native tags/embed and was not changed.
- Added persisted-cache/hash/session/vector/ranking audits and isolated concurrency, persistence, corruption, model/length/provider, HTTP authentication and public-behavior tests. All 73 automated tests pass locally and in pinned Docker; built a separate `storagesystem-base:semantic-preview-0.10.2` image without replacing the existing development service/volume. Rule/GUI settings, approved deployment route and independent acceptance remain open.

## 0.10.1-dev - 2026-10-23

- Require source-bound item evidence before semantic-only candidates can become confident preview answers. Added optional `verifiedPreviewAnswer` and a bounded local text identity verifier; model outputs cannot choose IDs/locations or write inventory. Recheck query, confirmed intent, session and current source quotes after inference; unavailable or invalid verification causes abstention.
- Added near item-name substitution and negative-property guards after live synthetic checks exposed sound/light-meter and brushed/brushless substitutions. Retained the initial failed runs and all prior baselines. Uses the owner's already confirmed drill/driver interpretation without enabling automatic speech normalization.
- Verified against the existing local Spark model without changing its configuration: source regression 30/30, owner regression 20/20 with six owner rules and the pre-existing confirmed intent, old regression 27/30. Warm checks add seconds, and an early cold probe was much slower; runtime identity endpoint/latency and independent acceptance remain open. Public interfaces and production remain unchanged.
- Added offline evidence replay, explicit live synthetic suites, failure/staleness/quote fixtures and pinned Docker verification. All 63 automated tests pass; built a separate `storagesystem-base:identity-preview-0.10.1` image without replacing the development service/image/volume.

## 0.10.0-dev - 2026-10-22

- Froze the decision implementation before authoring 30 new source-derived cases and locked labels/criteria before endpoint inference. Result: 29/30, including all 15 documented answers and five default clarifications, but one unsupported thermal-camera query confidently selected a heat gun. The zero-incorrect-confident-answer gate therefore fails. Preserved source/vector/ranking/decision evidence and added read-only reproduction/audits; no policy, thresholds, runtime settings or version adjustment for this validation step. This is not independent human-labelled acceptance.
- Recorded the owner's decision to defer real speech/transcription testing and inventory-aware split-name normalization until later; keep it on the roadmap while text-search development continues. No runtime/version change for this planning update.
- Added `Inventory.previewAnswer` and an isolated shared answer policy: current whole-word label/keyword/summary evidence, exact code/dimension guards, stale/invalid semantic candidate rejection, explicit owner interaction rules and current-location answer formatting. No public interface or runtime inference is activated.
- Re-evaluated saved private retrieval through the real read-only inventory service. All 19 user answer cases now have an accepted first candidate. Six explicit owner rules yield 20/20 correct decisions/required selections; generic logic alone yields 14/20. Old questions yield 27/30 correct decisions with no incorrect confident answers. Retained all earlier baselines; these are development regression results, not untouched acceptance.
- Added six synthetic tests (54 total), reproducible exclusive-result evaluation and a hash/source/SQLite/decision audit. Verified the pinned Node 24.14 Docker build under a separate preview tag. No app settings, runtime inventory, deployment, production or physical speech/printing changes.

## 0.9.1-dev - 2026-10-22

- Froze 20 owner-authored short queries with confirmed source-bound labels before inference. Compared the unchanged shared lexical search with Ollama BGE-M3 using saved corpus vectors and thresholds selected only from the original 30 reviewed questions. Semantic top-1/top-5 is 18/19 and 19/19 versus lexical 14/19 and 15/19; fixed-policy decisions are 15/20. Recorded missing clarification, overly conservative short-query decisions and the owner's dual-destination extension-lead requirement. Added private evidence/audits and reproducible read-only tools; no runtime activation or threshold tuning on the new set.

- Added a reproducible read-only Ollama endpoint evaluator with exclusive private result directories, archived evaluator sources and saved-vector/hash/ranking/policy audit. Reused the frozen reviewed corpus without changing labels or the prior baseline.
- Verified the exact Ollama01 GPU route: 22/24 top-1, 24/24 top-5, unchanged first-ranked boxes, 25/30 correct decisions and no observed incorrect confident answers. Original fold thresholds retain the same decision metrics. Query HTTP p50/p95 was 29.4/44.2 ms; all 164 documents encoded in 2.55 s.
- Confirmed silent 2048-token truncation on the compatible route using boundary inputs and changed-tail vectors. Current documents fit (maximum 869 tokens); explicit length handling remains a runtime integration gate. Untouched questions and HA/speech acceptance remain open; no application settings, inventory, service configuration or version change.

## 0.9.1-dev - 2026-10-21

- Finalized the evening handover with separate Mimer and Storage System acceptance/cutover steps, backup and rollback boundaries. Verified operator GPU monitoring and recorded the owner-confirmed btop restart resolution. No application endpoint or stored vector changes.

- Migrated Ollama01 through a stopped NAS backup to TowerCube, preserving the stopped MiniCube source. Verified RTX GPU inference, authenticated API and nearly identical synthetic Mimer CPU/GPU vectors. Disabled CUDA graphs after varied input lengths exposed multi-second delays; 14 follow-up requests took 17-100 ms. Created and read back the user-approved Proxmox Note. Existing application connections and Mimer vectors are unchanged.

- Provisioned a shared authenticated BGE-M3 staging endpoint on MiniCube (Ollama01, CT 141), with pinned native Ollama, standard host verification and separate client keys outside the repository. Verified network access from Mimer/Portainer and nearly identical synthetic Mimer vectors. The subsequent TowerCube/GPU migration is recorded above; application endpoint changes remain pending. Application version and runtime behavior are unchanged.

- Added isolated, pinned CPU evaluation tooling and saved-vector integrity checks. Reproduced the frozen shared lexical baseline and compared E5-small/BGE-M3 dense and lexical RRF over the 164-document private snapshot. BGE dense leads at 22/24 top-1 and 24/24 top-5; the tested hybrids reduce top-1.
- Evaluated short-answer decisions separately with grouped cross-validation: BGE dense makes 25/30 correct decisions with 19 correct confident answers and zero observed incorrect confident answers; five answerable cases are declined. This remains exploratory evidence, with untouched questions and a production endpoint still required.
- Preserved private source-bound vectors/results and exact evaluator snapshots under ignored data paths. Production and development runtime behavior/configuration remain unchanged; no application version bump or semantic feature activation.

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

Roll-change observation: after the owner confirmed the replacement was loaded, the app read S0722520 / 25 x 54 mm / 413 labels. The saved format already matched. A fresh preview with a visible format caption was checked without printing. The owner confirmed the size/count and solid power with no extra feed after this replacement read.

0.13.1 validation: all 98 tests pass locally and in pinned Node 24.14 Docker; separate image `storagesystem-base:roll-reader-0.13.1`. Only the isolated port-3212 helper was restarted to load the correction. Inventory integrity audit passes (164 boxes, 249 sessions, 306 photo references, 164 locations).

Final physical acceptance for job 118: the owner confirmed clear, correctly oriented, unclipped text and solid power. The supplied photo confirms Swedish glyphs and the 25 x 54 mm portrait layout. Two formats now have accepted real output (57 x 32 and 25 x 54 mm); 19 x 51 and 54 x 101 mm have synthetic layout checks only. The roll-loading error resolved the reported print failure; no production driver/configuration changes were needed.

S0722430 / 54 x 101 mm accepted physically: test job 119 completed and the owner confirmed good text/layout with solid power. The supplied photo confirms legible Swedish glyphs and no clipping. Three formats now have real output acceptance: 57 x 32, 25 x 54 and 54 x 101 mm. Only 19 x 51 mm remains physically unverified among the four presets.

Final acceptance for job 120: the owner confirmed legible, correctly oriented, unclipped text and solid power. All four explicit formats now have real owner-accepted test output: S0722540 (57 x 32 mm; jobs 114/115), S0722520 (25 x 54 mm; job 118), S0722430 (54 x 101 mm; job 119), and S0722550 (19 x 51 mm; job 120). This verifies the tested layouts on this 5XL/CUPS route, not every inventory label or other printer. Description size is currently 6 points for the smallest format; text sizes are shared settings, not per-format profiles.
