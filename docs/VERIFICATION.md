# Development verification

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
- Additional live AI providers, broader image/model accuracy, AI-assisted updates to existing boxes and generated inventory answers.
- A fully running isolated Home Assistant instance.
- Spreadsheet catalog round-trip and separate legacy language-file migration.
- Real Portainer installation/update and future database schema upgrades.
- Printer filters, print queue/status and physical label/sheet output. All physical printer testing is deferred until the user has access again.

No existing production installation has been modified or restarted.
