# Development verification

## Search settings preview (0.11.0-dev)

All 81 automated tests pass on Windows and pinned Node 24.14 Docker. New coverage
includes settings revision/key/destination boundaries, atomic rule validation,
saved rules without embeddings, native metadata-only discovery, model changes
without app restart, stale in-flight preview rejection, backup/restore and public
API behavior. No production data or physical output is used by these tests.

Browser verification used a separate local snapshot with the owner's six already
approved rules: opening/editing/saving the network-cable rule, obtaining the exact
finished-cable clarification, obtaining both extension-lead destinations, saving
disabled model settings and handling a server without native model metadata.
The browser test exposed a cable-plural evidence gap; the fixed policy has a
specific question-text and code-constraint regression. Offline replay of prior
source-bound identity evidence retains original 27/30, owner 20/20 and source
30/30, with zero incorrect confident answers. No new identity inference or paid
request ran. Private evidence is under `data/search-settings-preview-20261023/`.
These checks are regression evidence, not independent production acceptance.

Printer access was confirmed on 2026-10-23. Read-only CUPS preflight found
`DYMO_5XL` idle/enabled; new-system physical printing remains unverified.

## Fitted album previews on 2026-10-20 (0.7.1-dev)

- Browser acceptance uses synthetic 640×360 landscape and 320×480 portrait images with a visible perimeter. Both load through the album preview rendition and compute to `object-fit: contain`; all perimeter edges are visible in the inbox.
- The shared album-card layout also applies to the AI test-album picker. Original aspect ratios are preserved in a consistent 180-pixel image frame. Selection behavior is unchanged.
- All 42 host checks and pinned-image checks passed. Development Compose runs 0.7.1-dev and serves the fitted-image CSS. Inventory/settings/position hashes matched before/after; audits passed. The synthetic browser fixture was stopped.

## Languages and released photos on 2026-10-20 (0.7.0-dev)

- All 42 host checks and all 42 checks in the pinned Docker build passed. Isolated tests verify UI/external/AI language independence, explicit AI override, preserved photo credentials, management authorization, stale edits, unsupported interface choices and language persistence through SQLite backup/fresh restore.
- Photo acceptance assigns an image, saves a new session without it, observes no current assignment, reassigns it to another box and confirms the historical reference remains. Historical-only reattachments require current source/album validation; a new current owner blocks reassignment atomically.
- Browser acceptance passed English → Swedish → English, Swedish persistence across reload/sign-in, translated editor/album controls and language guidance. Box name `Photo settings` and summary `Label` stayed unchanged while the surrounding UI and location labels changed language.
- Browser removal/save acceptance returned the photo to the checked unassigned-only album list. Two sessions and the historical photo reference remained. All browser writes used the synthetic in-memory fixture; no live AI or photo calls were needed.
- AI language help explicitly displays both the external-default rule and its resolved language; explicit language selections state that they do not change interface or existing inventory text.
- Development Compose runs 0.7.0-dev. Before/after hashes of retained inventory, settings and positions matched; both data audits passed. The interface-language endpoint and Swedish catalog are served successfully. The temporary browser fixture was stopped.

## Draft photos and occupied positions on 2026-10-20 (0.6.9-dev)

- Host checks pass, including rendition-bound album thumbnail/preview/original grants, upstream rendition verification, tamper rejection and no inventory writes during viewing.
- New HTTP acceptance covers concurrent double assignment, equivalent legacy location IDs, rejected moves with exact snapshot rollback, retaining the current location and freeing a location after movement.
- Synthetic browser acceptance passed from two-photo AI draft to the review editor: thumbnails open the existing viewer using the original rendition, zoom/navigation controls work, cover-write controls are hidden, and Esc returns with manually edited text and photo selections intact.
- Synthetic browser acceptance confirmed an occupied exact position is disabled and marked occupied, with visible guidance to choose another position or letter.
- All 40 checks passed in the host suite and pinned Docker build. Development Compose runs 0.6.9-dev; before/after inventory/settings/position hashes matched and both data audits passed. The temporary browser fixture was stopped.

## Automatic IDs and disabled controls on 2026-10-20 (0.6.7-dev)

- All 39 host checks passed, including concurrent automatic-ID allocation, collision handling, movement with stable identity, MCP retrieval and integrity audit.
- Synthetic browser acceptance confirmed that Box ID is read-only, updates its proposal after location choices and saves a selected album image under the server-generated ID.
- Browser inspection confirmed the disabled Use selected photos button has computed cursor `not-allowed`; selecting a photo enables it and updates the visible next-step guidance.
- The pinned Docker build passed all 39 checks. Development Compose runs 0.6.7-dev; before/after hashes of inventory, settings and positions matched, with healthy integrity audits.

## Structured locations on 2026-10-20 (0.6.6-dev)

- All 37 host checks passed, including reference-compatible structured IDs for all three categories, optional letters, name normalization, invalid/missing choices, exact saved alias retention and movement with intact history/audit.
- Browser acceptance with synthetic in-memory data passed for shelving unit A, shelf 2, position 1, letter A, ordinary session save, saved-location retention, explicit Change location, switching to bench surfaces, selecting Under with no letter and cancelling back to the original saved location.
- No live photo/AI requests or production changes were needed.
- The pinned Docker build passed all 37 checks. The development Compose app runs 0.6.6-dev; before/after hashes covering inventory, settings and registered positions matched and both integrity audits passed.

## Results on 2026-10-20 (0.6.5-dev)

- All 35 host checks passed, as did all 35 checks in the pinned Node 24.14 Docker build.
- New isolated checks cover management authorization, empty/invalid/duplicate position registration, exact IDs and translations, movement with preserved box IDs/history, shared REST/MCP location results, vacated positions and SQLite backup/fresh restore including unused positions.
- Browser acceptance on the synthetic in-memory fixture passed: empty installation guidance, blank registration validation, first position registration, required selection, new box save, existing position preselection, new destination registration and movement. The same box ID remained and session count increased from one to two; the old position remained selectable with zero boxes.
- Disposable container acceptance passed for non-root startup, HTTP write/read, restart persistence, audit, backup, fresh restore and MCP. Its container and volume were removed by the acceptance script.
- The existing development Compose app now runs 0.6.5-dev. Before/after inventory exports and settings hashes matched, the integrity audit passed and the management position list returned two known positions. No acceptance writes used the retained development inventory.
- Full HA, real PhotoPrism, production migration, Portainer and physical printing were not exercised in this increment.

## Results on 2026-10-19

| Check | Result |
| --- | --- |
| Host syntax/tests/whitespace, Windows Node 26.5.1 | Passed |
| Image build with pinned Linux Node 24.14 runtime | Passed; database/HTTP/photo fixture suite passed |
| Isolated non-root container, persistent volume and restart | Passed |
| Container backup, fresh-file restore, restored audit and MCP | Passed |
| Actual storagesystem-ha HTTP client and result mapping | Passed against development container with synthetic demo data |
| Browser login, empty state, create/update, search, history and audit | Passed |
| Browser JSON export and SQLite backup downloads | Passed; no browser errors captured |
| Live Immich with dedicated account and isolated inventory | Passed: album/images, browser save, REST, MCP and data audit |
| Production migration, full HA, real PhotoPrism, physical printer | Not performed |

Wrap-up at 0.6.4-dev reran all 33 host checks, the pinned Docker build, isolated container persistence/backup/restore/MCP acceptance and the real HA client/result mapper successfully. The retained development database passed its audit with 2 boxes, 6 sessions, 8 photo references and 2 locations. The isolated container and volume were removed; development data was retained.

### Album/settings increment (0.3.0-dev)

- Isolated settings/catalog HTTP checks pass for redacted credentials, preserved blank keys, explicit clearing, source revisions, album pagination, preview grants and membership/assignment checks.
- Browser acceptance passes against the in-memory fixture: saving settings with masked credentials, loading/selecting an album, selecting images, assigning distinct roles, saving a box, hiding assigned images, adding another image without losing draft text, and removing an image only from the next session. Earlier sessions retain their photo references. Thumbnails load successfully.
- The dedicated Immich account and configured runtime key are verified against the supplied private environment file without printing values. The designated test album contains seven images. The running Docker instance reads that album and serves an expiring preview successfully.
- Live acceptance in a separate in-memory inventory passes: album discovery, actual thumbnails, validated association of three images, public REST search/detail, signed thumbnail/original retrieval without API headers, MCP search/get_box/get_box_photo and integrity audit. No development inventory is modified by this test.
- Browser acceptance with real test-album images also passes: thumbnails render with nonzero dimensions, an unassigned photo can be selected, and a new temporary box/session can be saved. Use the exact canonical URL printed by the acceptance script, because the Origin check follows APP_BASE_URL.
- No Immich photos, albums, permissions or service settings are changed by acceptance. PhotoPrism remains fixture-tested only.

The browser fixture is reproducible with `node scripts/browser-fixture.js`, serving only synthetic data in memory on `http://localhost:3212`. Its disposable management key is `ui-fixture-admin`. Stop it with Ctrl+C when finished. It never connects to a real photo server.

## Reproduce live Immich acceptance

Configure the test album in the development app first. Supply `IMMICH_API_KEY` through the process environment or a private environment file, plus the development instance's `STORAGE_ADMIN_KEY`:

```powershell
$env:STORAGE_ADMIN_KEY = 'development-preview'
node --env-file=/path/to/private.env scripts/verify-immich.js --container storagesystem-base-dev-app-1
```

The script first checks the running container's configured key (MATCH/DIFFERENT only), album metadata and preview, then uses a fresh in-memory application for the inventory write/REST/MCP round-trip. `--base-url` selects a different development instance; omit `--container` when running without Docker. `--hold` keeps the in-memory instance available at the printed URL for browser acceptance. Its management key is the disposable `isolated-admin-fixture`. Stop with Ctrl+C to discard it. Never point this test at a production inventory.

## Reproduce live AI preview acceptance

Supply `OPENROUTER_API_KEY`, `IMMICH_API_KEY`, `STORAGE_ADMIN_KEY` and `AI_TEST_MODEL` through a private environment file or the process environment. Use only the configured test album and a model you authorize for a paid image request:

```powershell
node --env-file=/path/to/private.env scripts/verify-ai.js
```

This test verifies redacted settings, actual OpenRouter key authentication, the current image-model catalog, analysis of one selected album preview image and validated output, using a fresh in-memory database. It asserts that no inventory sessions were saved and that the integrity audit passes. `--asset-index` selects a different test-album image. `--hold` keeps the temporary browser instance available at its printed address; `--configure-development` explicitly copies the tested AI connection/model into the local development preview and checks that inventory counts remain unchanged. Neither option changes the external photo service or an existing production application.

Verified on 2026-10-19 with `qwen/qwen3-vl-8b-instruct`: two live test-album thumbnails returned valid Swedish descriptions/keywords, one through the browser. Model discovery and manual role/language/instruction editing were also exercised against the synthetic browser fixture. Its output is labeled as fixture data. The browser blocks a new analysis while task settings have unsaved edits. Thumbnails can lose fine label text; semantic/OCR accuracy still requires human review. LM Studio/Open WebUI behavior remains fixture-tested; real llama.cpp acceptance is documented below. Multi-photo drafting/save is covered below; AI answer phrasing and translation remain unimplemented.

## Spark llama.cpp acceptance

The Spark's authenticated model catalog is reachable from both the Windows host and the development Docker container through the existing GSA route. The already loaded `qwen3.8-flash-next-uncensored` model was used; no remote service configuration, model installation or explicit model switch was performed.

The initial WebP thumbnail request failed image decoding. Immich's larger `size=preview` rendition returned JPEG and was accepted. With template thinking enabled by default the response was truncated; the explicit llama.cpp adapter now requests `chat_template_kwargs.enable_thinking=false`, as supported by the [server API](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md). An isolated image preview then returned a validated Swedish draft in approximately 16 seconds, with no inventory writes and a passing integrity audit. This verifies transport and response shape, not every object identification or OCR result. A browser-driven test through the updated Docker app also passed in 8.8 seconds and selected the role `spread` for the spread-out components. Inventory counts remained unchanged. The standard model variant remains untested.

To reproduce against a compatible service, supply `AI_BASE_URL`, optional `AI_API_KEY`, `AI_TEST_MODEL`, `IMMICH_API_KEY` and `STORAGE_ADMIN_KEY` in the environment, then run:

```powershell
node scripts/verify-ai.js --provider llamacpp --connection-id local-ai --connection-name "Local AI"
```

Use `--provider compatible` for other OpenAI-compatible services. The script requires a listed model and confirms image support with an actual preview when catalog capabilities are unreported. In 0.4.1-dev, AI acceptance sends a larger preview image rather than the small thumbnails used in the earlier OpenRouter acceptance.

## Multi-photo box draft acceptance

The 0.5.0-dev workflow was verified with three real Immich views of the same box: label, inside and spread-out contents. One combined request returned valid per-photo interpretations and a common Swedish description/keywords. Manual roles were retained. Browser acceptance exercised the Album inbox selection, role assignment, combined analysis, transfer to the ordinary editor, user correction and explicit save using an isolated in-memory inventory. Public REST search/detail, MCP get_box, signed photo delivery and integrity checks passed for the saved temporary box. No acceptance box was written to the development inventory, and no photo source or remote model service settings were changed.

To reproduce, add `--box-draft` to the AI acceptance command and supply `AI_TEST_PHOTOS` as a JSON array, for example `[{"fileName":"label.jpg","role":"label"},{"fileName":"contents.jpg","role":"inside"}]`. Each name must identify exactly one configured-album image. `--hold` keeps the isolated app available for browser review/save testing. Closing the test process discards that temporary inventory.

The automated suite also rejects duplicate/missing input photos, invalid roles, excess selections, missing/duplicate/out-of-range model photo indices, changes of photo configuration during inference and accidental replacement of an existing box ID. Single-photo tests and combined analysis share the per-process busy guard. Analysis and transfer do not write inventory; the ordinary explicit session save performs membership/ownership checks again.

## Automated suite

Run `npm run check` on the host. The same database/HTTP test suite runs inside `docker build -t storagesystem-base:local .` using the pinned Node 24 runtime. Host verification uses Node 26.5.1 on Windows. All data is synthetic, in memory or in uniquely named temporary directories.

Coverage includes:

- Legacy IDs, unknown record fields, relationships, history and settings surviving import/backup/fresh restore.
- Atomic rejection of duplicate IDs/current sessions, orphan relationships and invalid input, with no partial changes.
- SQL foreign keys and current-session uniqueness, rollback of failed session writes and prevention of session reassignment.
- Integrity audit detecting externally introduced orphan records and rejecting unknown schema versions.
- REST health, language presentation, search/ask/box payloads, malformed input and authentication.
- Shared management/REST/MCP search results and preserved session history.
- All five MCP tools, initialization, batches, notifications, missing tools/boxes and parse failures.
- Image signature binding, usable proxy responses, external URL configuration, upstream authentication, Immich shared links, PhotoPrism preview resolution, MIME/size restrictions.
- AI management authorization, key redaction/preservation, credential clearing on destination changes, stale edits/results, manual role precedence, resolved language, selected-image-only requests, malformed output/provider-error handling, concurrent-call bounds and absence of inventory writes during previews.

## Container verification

Run `./scripts/verify-container.ps1` after building. It creates a unique container and volume, then verifies HTTP writes, restart persistence, CLI audit, consistent SQLite backup, restoration to a fresh file, and MCP search. It cleans only resources created by that invocation. The final image runs as the `node` user, and the Docker health check calls `/healthz`.

This verifies the current schema's initial startup and restart. There is no older application schema to upgrade yet; future migration upgrades require fixtures for each prior version. Registry publication and a real Portainer deployment have not been tested.

## Real HA client verification

The following script loads the real integration's `api.py` and `result.py` from a read-only reference checkout. It calls the running development container over HTTP; it does not mock aiohttp or substitute a test client. The target must contain synthetic fixture data matching the query.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install aiohttp
$env:STORAGE_API_KEY = 'development-readonly'
.\.venv\Scripts\python.exe scripts/verify-ha-client.py --source ../storagesystem-ha --base-url http://localhost:3210 --query demo
```

Verified: actual client health, search, ask and single-box calls; result mapping used by entities/card; authentication error classification. This is active client integration verification, **not** a running Home Assistant test. Config flow, coordinator/entities, services, conversation agent and Lovelace card remain acceptance gates.

## Browser verification

0.6.0-dev isolated browser acceptance also covers automatic card photos, setting a different card image from the viewer, next/previous, circular arrow-key navigation and Esc returning to box details. Automated checks cover management-only authorization, rejection of historical/unrelated assets, no added session history, shared REST cover resolution, unchanged MCP photos, backup/reopen persistence and automatic fallback after current-session removal.

The development preview is served at `http://localhost:3210`. Browser checks exercise login, empty inventory, new-box creation, session update/history, search and maintenance controls. The retained preview now contains a synthetic demo plus the user's saved test-box inventory. Acceptance writes use separate disposable inventories. The UI does not contain a printer action.

Versions 0.6.1–0.6.3 were also checked with the real test images: uncropped portrait/landscape previews, initially collapsed history and explicit expansion, original-size zoom, fit reset, photo navigation, pointer drag panning and zoom retention after a click. Click-to-zoom preserved the clicked image coordinate within one pixel of its screen position; toolbar zoom preserves the viewport-center detail. These browser checks did not write inventory or cover metadata. The automated suite has 33 passing checks.

## Remaining external verification

- Real PhotoPrism access.
- Additional live AI providers, broader image/model accuracy and generated inventory answers.
- Physical Assist/speech/satellite acceptance; real isolated HA runtime and card have passed.
- Separate legacy language-file migration. Excel catalog round-trip was retired from scope on 2026-10-20.
- Real Portainer installation/update and future database schema upgrades.
- Alternate media/sheets and fresh printer driver installations remain unverified. The first new-system 57 x 32 mm label, queue/status and owner physical acceptance are verified below.

No existing production installation has been modified or restarted.

## Printing verification - 2026-10-23

See PRINTING.md for the schema migration, eight synthetic printing cases, exact live CUPS route and physical acceptance limits. Browser submission created one job (114), CUPS completed, queue returned idle/empty, loaded S0722540 roll decreased 679 -> 678. The owner approved physical output and supplied a photo confirming legible Swedish glyphs, correct orientation and unclipped text. No production configuration or service restart was performed.

## CUPS status follow-up - 0.12.1-dev

Expanded queue-state/reason/media presentation and fixture coverage; no direct DYMO query ships. A proposed raw version/status adapter passed transport fixtures but failed physical acceptance when the owner observed renewed white power-lamp blinking. It was withdrawn, its config removed and tunnel stopped. No new print submission, reset, feed or end-job command was sent. Root cause remains unresolved. See PRINTING.md.

Final 0.12.1 checks: 90/90 tests pass locally and in pinned Docker. Separate image `storagesystem-base:printing-status-0.12.1` was built without replacing an existing service. Browser verification shows idle CUPS, zero queued jobs and explicit default/app-media distinction. Inventory audit passes and rows/registered locations match the private pre-print backup. Two journal entries remain. Missing local photo credentials were restored from the canonical store; a signed image request returned HTTP 200 WebP. A comparison assertion accidentally exposed a photo credential in tool output; do not reproduce it in diagnostics or docs. Credential rotation is recommended.


## 0.13.0 manual roll reader

97 local tests pass, including seven added protocol/layout/concurrency cases. The owner confirmed solid white power and no feed after the complete experimental cycle and the new app button. App metadata: S0722540, 677 remaining, preset 57 x 32 mm. A portrait 25 x 54 mm test preview was prepared without printing. A real change to S0722520 was owner-accepted with solid power and no feed; alternate-format output acceptance remains pending. No new print jobs or production changes. The Immich key was subsequently rotated by the owner and refreshed from the canonical secrets file; the earlier credential rotation recommendation is resolved.

Roll-change observation: after the owner confirmed the replacement was loaded, the app read S0722520 / 25 x 54 mm / 413 labels. The saved format already matched. A fresh preview with a visible format caption was checked without printing. The owner confirmed the size/count and solid power with no extra feed after this replacement read.

Final checks: 97/97 tests pass locally and in pinned Node 24.14 Docker. Separate image `storagesystem-base:roll-reader-0.13.0` built successfully. Inventory audit passes; inventory and registered locations match the private pre-print backup. Exactly two historical print submissions remain.

Job 116 physical correction: the owner clarified that the label was blank, with blinking power. This is a failed alternate-format print, not accepted output. The actual CUPS spool PostScript renders the expected Swedish text. Offline CUPS conversion (raster destination only, no printer backend) produced one 271 x 593 RGB page with 18,360 non-white bytes, including black pixels. The installed filter is the LanguageMonitor-enabled `raster2dymolw_v2`, not a verified no-monitor patch. CUPS first reported `com.dymo.slot-status-error`, then the socket backend failed with `Broken pipe` and busy-error; those observations do not establish the physical cause. Only test job 116 was canceled to prevent retry; no incomplete jobs remain. No additional print, raw device query, reset, production driver/configuration change or service restart was performed. The owner confirmed solid power after cancellation. This links the blinking to the failed print cycle, but does not identify why the label was blank. Evidence remains in the ignored preview diagnostics.

Repeat physical test 117: unchanged S0722520 / 25 x 54 mm test, explicitly authorized by the owner to check initial feeding. The owner reported no label and blinking power. CUPS again reported `com.dymo.slot-status-error`. Only test job 117 was canceled; the queue is empty/idle, with a printer-not-ready message. No reset, raw read, driver/configuration change or further print was performed. The repeat failure argues against a single initial-feed event, but does not distinguish roll seating/sensing from driver/protocol behavior.

0.13.1 follow-up: a bounded A1 probe returned engine 2, job ID 0, bay 9 (jammed), SKU S0722520, count 413, and error-ID zero. This is a granted host response in the protocol, despite being an error state. The reader previously treated only engine zero as owned; cleanup now also releases a granted engine-2 reservation with no active job, while reporting the error before reading NFC. A regression test confirms Q-only cleanup, no U/feed/reset and no release for a nonzero active job ID. The corrected live reader reports the label jam and sends release. The owner reported that reloading and pressing the printer's own feed button did not restore normal feeding/solid readiness. A control test with the previously accepted 57 x 32 mm roll is pending; no more software print jobs have been submitted.

0.13.1 validation: all 98 tests pass locally and in pinned Node 24.14 Docker; separate image `storagesystem-base:roll-reader-0.13.1`. Only the isolated port-3212 helper was restarted to load the correction. Inventory integrity audit passes (164 boxes, 249 sessions, 306 photo references, 164 locations).

The owner subsequently found the replacement roll was installed backwards, with the label side facing the wrong way, preventing correct sensing. The owner corrected the loading and authorized a fresh test. Previous driver/protocol suspicions are not an established root cause of the physical failures; this loading error is owner-verified. The separate error-reservation cleanup fix remains valid.

After corrected roll loading, app reading returned S0722520 / 25 x 54 mm / 411 labels. A fresh test was submitted once as CUPS job 118. It completed promptly; queue idle, zero queued jobs, reasons none. No media/layout/production driver change was needed. The owner accepted physical text/orientation and solid power, supported by the supplied photo.

Final physical acceptance for job 118: the owner confirmed clear, correctly oriented, unclipped text and solid power. The supplied photo confirms Swedish glyphs and the 25 x 54 mm portrait layout. Two formats now have accepted real output (57 x 32 and 25 x 54 mm); 19 x 51 and 54 x 101 mm have synthetic layout checks only. The roll-loading error resolved the reported print failure; no production driver/configuration changes were needed.

S0722430 / 54 x 101 mm accepted physically: test job 119 completed and the owner confirmed good text/layout with solid power. The supplied photo confirms legible Swedish glyphs and no clipping. Three formats now have real output acceptance: 57 x 32, 25 x 54 and 54 x 101 mm. Only 19 x 51 mm remains physically unverified among the four presets.

Final acceptance for job 120: the owner confirmed legible, correctly oriented, unclipped text and solid power. All four explicit formats now have real owner-accepted test output: S0722540 (57 x 32 mm; jobs 114/115), S0722520 (25 x 54 mm; job 118), S0722430 (54 x 101 mm; job 119), and S0722550 (19 x 51 mm; job 120). This verifies the tested layouts on this 5XL/CUPS route, not every inventory label or other printer. Description size is currently 6 points for the smallest format; text sizes are shared settings, not per-format profiles.
