# Continue development

Updated 2026-10-20 for the 0.9.1-dev wider Photo settings; includes the storage map, improved search and real HA acceptance. Read this file, README.md, ARCHITECTURE.md and ../TODO.md before continuing. VERSION is authoritative; this remains a development preview, not the production replacement.

## Evening handover: start here next session

The user stopped after accepting all 30 search evaluation questions and proposed
boxes, and confirming that the last three requested items are absent. No more
user review is needed for version 1. Do not recreate the questions, repeat the
production export or ask the user to approve the same labels again.

Immediate objective: compare two locally runnable multilingual embedding models
with existing lexical search and hybrid ranking, before implementing semantic
search or changing the spoken-answer behavior. SQLite is a settled decision.
The assistant is button-activated; the target is one short supported destination,
otherwise one short clarification/no-match response, without spoken alternatives.

Read [SEMANTIC-EVALUATION.md](SEMANTIC-EVALUATION.md) for input files and procedure,
then [VOICE-SEARCH.md](VOICE-SEARCH.md) for the current/proposed HA contract. The
full previous conversation is not needed. Read README/ARCHITECTURE/ROADMAP before
implementation, but avoid broad repo/history scans just to resume evaluation.

Private local input directory: `data/evaluation/live-2026-10-20-40bea18b/`.
Use `questions-v1.reviewed.json`, `search-corpus.json` and
`lexical-baseline-v1.reviewed.json`. The original draft remains for provenance;
`questions-v1.reviewed.validation.json` confirms hashes, IDs/current destinations,
reproduced rankings and SQLite integrity. These ignored files exist only on this
computer and are intentionally absent from Git. Preserve them, the isolated
`inventory.sqlite`, source inventory and manifests; they are evaluation inputs,
not disposable cleanup artifacts. If missing on another checkout, report that
instead of silently substituting demo data or exporting production again.

Verified baseline: 164 current-box documents; 30 accepted cases (24 answer,
three clarify, three unsupported). Lexical top-1 is 13/24 and top-5 is 17/24.
This is an exploratory set, not an independent holdout. Clarification/false
confidence metrics are not implemented by the ranking baseline. Some stable
box IDs differ from current locations: resolve destinations from inventory.

Next actions, in order:

1. Reproduce the frozen baseline locally if source/input hashes have changed:
   `node data/evaluation/live-2026-10-20-40bea18b/validate-questions.mjs --reviewed`.
2. Inspect available local compute/runtimes read-only. Reuse the established
   Spark access where appropriate, but do not replace its running image model.
   No embedding model, runtime or endpoint has been selected or configured.
   Check official model documentation, multilingual support, licensing, memory,
   document/query formatting, truncation and production network reachability.
3. Run both candidates in isolation. Compare lexical, semantic-only and hybrid
   retrieval on the frozen questions/corpus; save model revisions, dimensions,
   source hashes, top-1/top-5 and latency with each private result. Keep related
   question groups together; do not tune synonyms to the test questions.
4. Evaluate a separate short-answer/clarification policy, prioritizing avoidance
   of incorrect confident answers. Tune thresholds per model; collect untouched
   questions before claiming general quality. Do not count retrieval-only scores
   as successful speech decisions.
5. Only after measuring, implement the selected approach through shared UI/REST/
   MCP services, with derived versioned vectors separate from inventory rewrites.
   Verify through disposable real HA before any authorized hardware session.

No embeddings were generated and no inventory text was sent to an embedding
provider. No production settings, HA/ESPHome configuration or existing development
inventory were changed by evaluation preparation. Local app version remains
0.9.1-dev. Evening checks: `npm run check` passed all 48 tests; reviewed-data
validation and SQLite audit passed. These checks do not retest physical audio,
printing or live external services. No registry publishing destination is set.

## Working implementation

- Native Node HTTP/ES modules and SQLite, no external runtime packages. Shared inventory service for browser, REST and all five legacy-compatible read-only MCP tools.
- Manual box/session inventory, history, shared reference-style Swedish word variants/synonyms/short transpositions and filename search, data audit, legacy JSON/settings import, inventory export, SQLite backup and CLI restore into a fresh file. IDs and optional legacy fields are preserved.
- Box editors use category, unit, shelf/surface, position and optional letter, matching the reference workflow. Known units are suggested; new names are allowed and locations are assembled on session save. Existing positions are retained until Change location is chosen. Box identity is independent of position. Box ID is a small read-only metadata line below the save action, with a proposed ID for new boxes and atomic final allocation on save. Disabled buttons use an unavailable cursor; album selection explains prerequisites. SQLite backup preserves unused positions; legacy inventory JSON does not. Full storage-unit layout management remains planned.
- Storage map groups current boxes and registered positions into shelving units, benches and cabinets; separate letters, registered vacancies, unregistered gaps and unrecognized box locations remain distinct. Search highlights matching boxes and opens a matching unit; click a box for ordinary details. Full layout geometry editing remains planned.
- Independent interface language (English/Swedish), external response default (English/Swedish/German) and AI description language. Header Languages settings preserve existing response defaults; UI translations never rewrite stored inventory text.
- Removing a current photo and saving releases it to the unassigned album inbox. Historical associations remain intact; current-session ownership still prevents two active boxes sharing an image.
- Album inbox and AI test-album images use fitted, uncropped previews with preserved portrait/landscape proportions.
- Authenticated Immich/PhotoPrism configuration and album inbox; explicit photo selection, roles and filename retention; validated attachments and signed image delivery. Real Immich is verified; PhotoPrism is fixture-tested only.
- AI assistance is divided into overview, named connections and image inventory. OpenRouter, generic OpenAI-compatible and llama.cpp connections work through the same bounded service. Single-photo previews and combined one-to-six-photo new-box drafts support explicit review/edit/save. Existing-box editors support selected-photo AI updates using the current description as context, with before/after review, optional name changes and explicit apply/save. Existing identifiers, location, manual notes, other photos and session history are preserved. Concurrent session changes reject stale analyses/saves.
- Session-photo thumbnails in manual/AI-review editors open the zoom/pan viewer without saving or losing the draft. Unsaved album photos have expiring rendition-bound original/preview grants.
- Exact position/letter occupancy is enforced in the shared save transaction, including equivalent legacy IDs. Occupied choices are unavailable; the current box may retain its own position.
- Box cards have automatic or user-selected cover photos. Cover metadata changes do not create inventory sessions. Box details use a 1000px maximum width (94vw on smaller screens), with complete portrait/landscape previews and collapsed history.
- The in-app viewer supports previous/next, arrows, Esc, fit, actual size and +/- zoom. Clicking a fitted image anchors zoom at that detail; toolbar zoom preserves the center detail. Zoomed images can be grabbed and dragged, and ordinary clicks retain zoom. Fit or photo switching resets the view. Images stay in the app.

## Local development state

- Browser: http://localhost:3210/; Docker Compose project `storagesystem-base-dev`, container `storagesystem-base-dev-app-1`, image `storagesystem-base:local`.
- Persistent named volume: `storagesystem-base-dev_app-data`; database inside the container: `/data/storage.sqlite`. Keep the volume and configured settings when rebuilding. Never use `docker compose down -v`.
- Development-only management/read keys and launch commands are in README.md. Browser authentication lives in tab memory and must be entered again after reload.
- The wrap-up audit had 2 boxes, 6 inventory sessions, 8 photo references and 2 locations. This includes a synthetic demo and the user's real test-box inventory. These are runtime data, not repository fixtures. Recheck counts; the user can edit them independently.
- Photo settings already contain the dedicated Immich service account and the `Storage System Test` album. Do not start photo setup over. Its seven images included the three views below.
- The current test box is `IVAR-A-H2-P1-A`, at `A-H2-P1-A`, containing SSD/HDD devices and adapters. Related filenames: `PXL_20260426_174011709.MP.jpg` (label), `PXL_20260426_171723378.MP.jpg` (inside), `PXL_20260426_171534733.MP.jpg` (spread). Inspect the current saved session rather than resaving just to test.
- The configured Spark connection uses the already running authenticated llama.cpp service and its loaded `qwen3.8-flash-next-uncensored` model. The Windows host and Docker have reached it through the laptop's existing GSA connection. Ollama was installed on the Spark, but the verified image-analysis path is llama.cpp. Remote service configuration/models were not changed.
- Canonical credentials are outside this repository in the user's central secret store. Read that store's README to locate the dedicated account, Spark key and authorized existing OpenRouter key. Runtime copies live in the private app database. Never print or commit credentials, app settings, inventory or full database backups.
- Existing OpenRouter key reuse was explicitly authorized. Prefer the configured Spark for experimentation; additional paid requests should be deliberate. No paid call is required for routine UI checks.

## Verification and boundaries

- `npm run check`: syntax, 48 automated checks and Git whitespace validation. Docker build runs the same isolated suite with pinned Node 24.14; host is Windows Node 26.5.1.
- Container acceptance checks persistence, audit, backup, fresh restore and MCP using a unique disposable container/volume: `./scripts/verify-container.ps1`. This passed again at wrap-up, as did the real HA HTTP client/result mapper; temporary acceptance resources were removed by the script.
- Live Immich, OpenRouter, Spark, three-photo drafting and the real HA HTTP client/result mapper were checked earlier in this session. See VERIFICATION.md for evidence and reproduction. Real HA 2026.10.2 config flow, entities, services, events, conversation, reload persistence, card delivery and signed images now pass in disposable Docker. Browser tests also exercised the actual Lovelace card and thumbnail. Physical Assist/speech, real PhotoPrism and Portainer remain open.
- Recent browser checks used the actual test images without acceptance writes: portrait proportions, collapsed/expanded history, cover browsing, 100% pixels, drag panning, click retention and click-anchored zoom. The clicked point remained within one pixel of its screen position after zoom.
- Production Storage System and its HA integration remain untouched. Reference checkouts are siblings `Storagesystem` and `storagesystem-ha`; reviewed commits are in COMPATIBILITY.md.
- Do not test the physical printer until the user says it is available again. No printing UI/backend has been implemented.
- Local Docker image only: no registry destination, image publication or real Portainer deployment is configured. Production access to Spark without the laptop's GSA is unresolved.

## Suggested next session

Follow the evening handover above: embedding comparison is the next agreed task. Structured location selection matching the reference workflow is implemented. Excel catalog import/export is retired from scope (one-time initial label import); do not reintroduce it as a release gate. Inventory/location models must stay shared between browser, REST and MCP. Box IDs and location IDs are different concepts; do not silently derive one from the other.

No browser tab or old temporary process is required to resume. The frozen offline evaluation does not require rebuilding the app, loading its settings or contacting photo/AI providers. When application acceptance is needed, use the existing Compose app and isolated fixtures. `scripts/browser-fixture.js` serves synthetic in-memory data on port 3212; `verify-immich.js` and `verify-ai.js` can hold isolated live-image fixtures when explicitly run. Stop those fixtures when finished.

## Isolated HA verification

Run `./scripts/verify-ha-container.ps1` after building the local app image. It uses pinned real HA 2026.10.2, the reference integration mounted read-only, a unique Docker network/config volume and seeded synthetic inventory. Ports 3215/3216 bind only to loopback; discovery and TTS are disabled. The normal run cleans its own resources. `-Hold` keeps it available for browser review at `http://localhost:3215/lovelace/storage`, fixture account `acceptance` / `isolated-fixture-only`. Stop the specifically named HA test container to exit and trigger cleanup. This never targets production HA or real storage data.

## Primary voice-search direction (documented 2026-10-20)

Read [VOICE-SEARCH.md](VOICE-SEARCH.md) before implementing semantic retrieval or answer phrasing. The workshop assistant is activated by a physical button, not a wake word; its Verkstan pipeline uses conversation.storage_system, faster-whisper and Piper, with ESPHome forwarding synthesized audio to Mediaplayer 01's announcement pipeline. Live HA reads confirmed selectors/pipeline/current integration code and recent multi-location answers; physical button/audio behavior was checked in source, not retested on hardware.

The intended spoken behavior is one short, supported destination, otherwise one short clarification or no-match response. Keep detailed candidates on screen; never present the first weak hit as certainty. Current /ask still uses a local multi-match template, and semantic retrieval/voice decisions/follow-up context remain unimplemented. Existing HA sends only query and speaks answer, so adding an unused speech field would not fix it.

Read-only production measurement: 164 unique boxes, all with summaries, in 17 storage units; live overview confirms 164 with pictures, zero without, and 293 current photo references. Even a conservative 328 boxes/586 references does not justify changing SQLite. Adding Spread photos can update the same per-box embeddings. Mimers Brain uses PostgreSQL 17/pgvector, but semantic quality does not depend on that storage choice. Keep derived vectors outside inventory snapshot rewrites, evaluate realistic questions and abstention, and verify the embedding endpoint's production reachability before activation.

## Prepared live-data evaluation snapshot (2026-10-20)

The user authorized importing live inventory for semantic-search tests. See [SEMANTIC-EVALUATION.md](SEMANTIC-EVALUATION.md). The Git-ignored directory `data/evaluation/live-2026-10-20-40bea18b/` contains inventory-only JSON, a separate `inventory.sqlite`, capture/hash manifest, current-session search corpus and verification report. Import through the shared Store passed integrity and exact field/record-preservation checks: 164 boxes, 249 sessions, 306 total photo references, 164 exact locations; 293 photo references are current. No app settings/keys or original image binaries were persisted. The existing development app was not redirected or modified.

`search-corpus.json` has 164 current-box documents and 97,067 UTF-16 code units including current photo notes. Historical contents are excluded. The same private directory now contains `questions-v1.json`, `questions-v1.review.md` and `lexical-baseline-v1.json`: 30 draft questions (24 proposed single-box answers, three clarifications, three unsupported requests), with source hashes and verified current destinations. Shared lexical search agrees with draft labels at top 1 for 13/24 answer cases and top 5 for 17/24; speech decisions are not scored. Erik accepted all 30 questions/proposed boxes and confirmed the three absent items. Frozen inputs are questions-v1.reviewed.json and lexical-baseline-v1.reviewed.json; original drafts are preserved. Reviewed hash/location/ranking checks and SQLite audit pass. The set remains exploratory, not a holdout. Next: compare two local embedding candidates against lexical/hybrid search, and assess top-1/clarification/abstention/latency. No embedding model was configured or called, and semantic search remains unimplemented. Keep all real evaluation data under ignored runtime paths.
