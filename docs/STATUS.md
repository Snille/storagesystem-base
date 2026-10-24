# Continue development

## Latest verification: 2026-10-24

Version 0.14.0-dev adds per-format label text sizes and text direction (portrait or
landscape) and location-only labels (see PRINTING.md). Default box-label output is
unchanged (old/new output comparison is identical). All 101 tests pass locally.
The owner physically accepted one rotated location label: S0722550 / 19 x 51 mm
landscape, CUPS job 121 (queue idle/empty afterward). The preview was checked in the browser against a synthetic
in-memory fixture with no printer. The 3212 preview has saved per-format settings, which
older images cannot validate; it and its temporary SSH tunnels are stopped. A
private backup taken before that change is `preview-before-0.14-20261024.sqlite`
in `data/search-settings-preview-20261023/`.

The Docker Desktop development stack (`storagesystem-base-dev`, port 3210) now runs
0.14.0-dev. Its image build ran the full pinned Node 24.14 test suite, and
`verify-container.ps1` passes. At the owner's request, its database was then
replaced with a consistent copy of the port-3212 preview database: the 2026-10-20
live inventory snapshot (164 boxes, 249 sessions, 306 photo references, 164
locations), its photo/search/printing settings and the 8-entry print journal.
Audit and SQLite integrity pass, all 164 boxes list, search answers and the real
Immich album (294 assets) is reachable from the container. The earlier small test
database is kept privately in `data/docker-dev-backups/` (before and after the
0.14 migration), together with the imported copy. The previous image is tagged
`storagesystem-base:0.9.1-rollback`; it cannot open schema 2. Printing settings
still point at the laptop's stopped SSH tunnels, so the container has no CUPS route yet.

### Previous verification: 2026-10-23

Read [the session handoff](HANDOFF-2026-10-23.md) first for verified results, current runtime state and the recommended next slice.

Version 0.13.1-dev includes manual roll reading, four explicit media presets and
correct reservation cleanup for a granted device-error reply with no active job.
The printer reported jammed before image transfer during failed tests 116/117.
The owner identified and corrected a backwards roll with the label side facing
incorrectly. The unchanged 25 x 54 mm test then completed as CUPS job 118;
queue idle/empty, reasons none. The owner accepted physical text/orientation and confirmed solid power. The supplied photo shows legible Swedish glyphs, correct portrait layout and unclipped text.
Supported presets: S0722540 (57 x 32), S0722550 (19 x 51), S0722520 (25 x 54),
S0722430 (54 x 101 mm). All four presets have owner-accepted physical output: S0722540, S0722520,
S0722430 and S0722550. Article/count come from
the printer; dimensions use explicit article presets, not CUPS defaults.
All 98 tests pass locally and in pinned Docker. Separate image:
`storagesystem-base:roll-reader-0.13.1`. Inventory audit passes. Only the isolated
port-3212 preview was restarted; production configuration/services are unchanged.
The preview uses temporary SSH routes, not final LXC networking. See PRINTING.md.

### Previous queue-status verification

Version 0.12.1-dev clarifies CUPS queue status versus physical printer state.
A proposed direct DYMO version/status adapter failed live acceptance: the owner
reported renewed blinking. The adapter/route/settings/UI were withdrawn and its
temporary direct-printer tunnel stopped. No new labels or reset/feed/end-job
commands were submitted. Root cause/error 0x1000 remains open. Do not reuse the
legacy status endpoint (it requests a print lock). All 90 tests pass locally and
in pinned Docker; separate image `storagesystem-base:printing-status-0.12.1`.
Inventory audit passes with 164 boxes, 249 sessions and 306 photo references;
exactly two recorded submissions remain. See PRINTING.md.


Version 0.12.0-dev implements the first label-printing workflow. See PRINTING.md.
The isolated preview submitted exactly one 57 x 32 mm test label through CUPS:
job 114 completed, queue idle/empty, roll counter 679 -> 678. Physical text/orientation
was approved by the owner and checked against the supplied photo. Main schema 2 adds a durable print journal; the isolated
preview was backed up privately before migration. Existing production app, printer
configuration, drivers and service lifecycle remain unchanged. The development
preview uses a temporary CUPS SSH tunnel, not a final LXC route.
All 89 tests pass locally and in pinned Node 24.14 Docker. Separate image:
`storagesystem-base:printing-preview-0.12.0`; existing service/image/volume preserved.

### Previous Search & answers verification

Version 0.11.0-dev adds Search & answers with persisted native embedding settings,
model/digest discovery, worker reconfiguration, index status/retry, structured
owner rules and saved-settings decision preview. Default embeddings remain off;
rules can be tried without them. Keys are redacted and destination-bound, saves
and in-flight previews use revision checks, and all settings participate in the
main backup/import/audit/restore validation. No public retrieval or identity
inference is activated. See README and SEMANTIC-RUNTIME.md.

Browser acceptance used a separate local snapshot with the six already approved
owner rules. Network cable now returns the exact finished-cable question; extension
lead returns both accepted destinations. The browser test caught a Swedish
cable-plural evidence gap, fixed with a bounded inflection family and an exact
question/code-guard regression. Offline replay of existing verified evidence
retains original 27/30, owner 20/20, source 30/30 and zero incorrect confident
answers. Evidence is private in `data/search-settings-preview-20261023/`; no
new identity-model inference or paid request was run. This is regression evidence.
All 81 automated tests pass locally and in pinned Node 24.14 Docker. A separate
`storagesystem-base:search-settings-0.11.0` image is built; the existing development
image/service/volume was not replaced.

Printing was subsequently implemented and physically submitted; see the latest verification above.

Remaining search gates: approved authenticated native deployment route,
identity-model/threshold/latency configuration, independent acceptance and public
activation. Conversational follow-up and speech normalization remain planned;
speech-error work is still deferred. OpenRouter comparison includes Qwen and
GPT-6 Luna, with no paid benchmark or provider switch performed.

The entries below are prior verification stages:

Version 0.10.2-dev adds optional background semantic indexing, persisted in a
separate SQLite cache with current session/content/profile and immutable model
digest checks. Native Ollama requests reject truncation. Authenticated management
status/retry/decision-preview endpoints are disabled by default and do not alter
public UI/REST/MCP/HA behavior. See SEMANTIC-RUNTIME.md for configuration, failure
behavior and deployment gates. The semantic work retained schema 1; printing now adds schema 2 as described above.

Live retrieval regression over the isolated frozen inventory indexed 164/164
boxes: old answer cases 23/24 top-1, 24/24 top-5; owner answer cases 18/19 top-1,
19/19 top-5. The current-content serializer differs from the earlier corpus.
Native overlength input was rejected; source inventory remained unchanged.
Evidence is private under `runtime-native-v4/`; offline audit checks cached
sessions/content/profiles, all vectors/rankings/metrics and source/archived-code
hashes. All 73 automated tests pass locally and in pinned Docker.

The authenticated LAN gateway returns 404 for both native tags/embed paths.
Live testing used a temporary localhost SSH tunnel; no gateway/server settings
were changed. Validate an approved authenticated native route from the future
LXC before deployment activation. Next local product work is reviewed rule/GUI
configuration plus independent acceptance and the identity endpoint/latency
decision. Speech remains deferred. OpenRouter model comparison (including Qwen)
is planned for LXC migration; no paid benchmark or provider switch has occurred.

The entries below are prior verification stages:

Version 0.10.1-dev adds an optional source-bound local identity verifier for
semantic-only decision previews. The thermal-camera/heat-gun failure is repaired
in regression: source cases 30/30, owner cases 20/20 with existing owner rules
and the already confirmed drill/driver intent, old cases 27/30. Pure similarity
cannot authorize an answer; unavailable verification causes abstention.
Current query/session/source guards are rechecked after inference. All 63
automated tests pass locally and in pinned Docker. See ANSWER-POLICY.md and the
verified identity regression section in SEMANTIC-EVALUATION.md.

The existing Spark llama.cpp model was tested with bounded text requests only;
no service/model/settings change occurred. Warm checks add about 1.4-4.2 s and
an early generic cold chat probe took 29.4 s. Default timeout is 15 s; evaluation
explicitly allowed 60 s. No runtime endpoint or verifier dependency is enabled.
A new synthetic held-out probe found a brushed/brushless failure; the frozen
first result is retained and a negative-property guard repairs the repeated
suite. Those repaired results are regression evidence, not independent acceptance.

Next: independent identity acceptance, production endpoint/latency decision,
then versioned runtime vectors with length/failure handling and rule management.
Public UI/REST/MCP/HA still use their prior behavior. Speech work remains deferred.

The entries below are prior verification stages and failed baselines:

The next frozen-policy check (`acceptance-v3`) has completed: 30 agent-authored
source-derived cases were locked after freezing the implementation and before
inference. All 15 documented-item cases and five default-clarification cases
pass; nine of ten unsupported cases pass. One thermal-camera query confidently
selects a heat gun, so the preregistered zero-incorrect-confident-answer gate
FAILS despite 29/30 total correct. No rule/threshold/implementation adjustment
was made after inspecting this result. Full vector/ranking/decision/source and
SQLite audits pass. This is prospective source-derived checking, not independent
human-labelled acceptance. See SEMANTIC-EVALUATION.md for evidence and limits.

Immediate next work: require evidence for requested object identity/type before
a semantic-only candidate can become a confident answer. Keep the failed check
as regression evidence and validate changes on new cases. Do not activate the
semantic runtime or interpret the earlier configured 20/20 as release acceptance.

Version 0.10.0-dev adds an isolated shared answer-decision preview, not semantic
runtime activation. Current whole-word evidence reranks all 19 user answer cases
correctly. With six explicit owner-reviewed interaction rules, decisions and
required destination selections pass 20/20, including both extension-lead
locations and finished-cable clarification. Generic logic alone gets 14/20
decisions; the owner rules are essential and are not a model-generalization
claim. The old 30 cases get 27/30 decisions with zero incorrect confident
answers. See ANSWER-POLICY.md and the development regression section in
SEMANTIC-EVALUATION.md. Frozen baselines are retained. All 54 tests pass on
Windows and in pinned Node 24.14 Docker; saved decision audits pass.

Next: independently validate the revised policy, then integrate versioned
runtime vectors with explicit length/failure handling and owner-rule management.
The owner deferred speech/transcription work on 2026-10-22. Keep real Whisper
error capture and conservative split-name normalization in the later backlog;
text probes are not microphone/STT acceptance. Continue text-search work first.
The preview is available only as `Inventory.previewAnswer` for trusted callers;
public ask/search, browser, MCP and HA have not been switched. No service was
restarted and no application settings/inventory were changed.

The following paragraphs record the preceding frozen baseline, not the revised
preview results:

The owner supplied and confirmed a further 20 short queries before inference.
The prospective test gives BGE-M3 18/19 top-1 and 19/19 top-5 versus lexical
14/19 and 15/19. However, the fixed policy trained only on the old 30 questions
makes 15/20 correct selection/decision cases. It unnecessarily declines some
correct short-query matches and misses the owner's required finished-vs-bulk
network-cable clarification. Extension leads should include both relevant
destinations; both are retrieved but speech is not verified. See the prospective
comparison in SEMANTIC-EVALUATION.md. Next work is improved evidence/decision
logic with these cases retained as regression tests, followed by fresh independent
acceptance; the current score/margin policy is not ready for activation.

The frozen Storage System comparison now passes against the exact Ollama01 GPU
endpoint: 22/24 top-1, 24/24 top-5, identical first-ranked boxes to the previous
BGE-M3 run, and 25/30 correct grouped decisions with zero observed incorrect
confident answers. Query HTTP p50/p95 is 29.4/44.2 ms; corpus encoding took
2.55 s. See [SEMANTIC-EVALUATION.md](SEMANTIC-EVALUATION.md) for evidence.

The endpoint silently truncates at 2048 tokens despite HTTP 200; current corpus
documents max out at 869 tokens. Explicit length handling is required before
runtime integration. Untouched labelled questions remain the next quality gate,
followed by shared runtime retrieval and isolated HA acceptance. No semantic
feature or application connection was enabled by this test.

The older resume checklist below predates this verification and the Mimers Brain
cutover already recorded in EMBEDDING-SERVICE.md. Do not repeat that cutover.
Frozen hashes, vectors, rankings, grouped policies, reviewed-data/SQLite audit
and all 48 application checks pass. Changes remain uncommitted.

Updated 2026-10-21 at the end of the evening after the embedding comparison and shared GPU service migration. Read this file, README.md, ARCHITECTURE.md and ../TODO.md before continuing. VERSION is authoritative; this remains a development preview, not the production replacement.

## Resume checklist for the next session

The shared GPU server is ready for application acceptance; the application
cutovers are still pending. Start with [EMBEDDING-SERVICE.md](EMBEDDING-SERVICE.md).

1. In a Mimers Brain session, back up the instance and record its current
   embedding settings, thresholds and baseline recall/contradiction results.
   Test the same cases through Ollama01, then switch its embedding endpoint
   after acceptance and owner approval. This is the same BGE-M3 model on a
   different host/device, not an intended model-family change. Do not assume
   moving CPU inference to GPU requires regenerating stored vectors.
2. In this repository, repeat the frozen 164-document/30-question evaluation
   through the exact Ollama endpoint. Preserve the existing baseline and labels;
   compare retrieval, long inputs and latency before adding runtime embeddings.
3. Collect untouched labelled questions and validate answer/clarification/no-match
   thresholds before enabling semantic voice search. Server acceptance alone
   does not satisfy these product gates.

Use the separate client credentials from the owner's central secret store; never copy secret values into this repository or memory. Keep the
existing Mimer CPU service available for rollback. MiniCube CT 141 is a stopped
server fallback with the same network identity: never start it alongside the
TowerCube copy. The requested Mimer test-and-switch task is also saved in Mimers
Brain for a separate project session. These session changes remain uncommitted.

## Embedding comparison handover: start here next session

The evening objective is complete: both pinned local multilingual embedding
candidates were compared with the frozen lexical baseline and equal-weight RRF
hybrid. Read [SEMANTIC-EVALUATION.md](SEMANTIC-EVALUATION.md) for method,
results, limitations and reproduction, then [VOICE-SEARCH.md](VOICE-SEARCH.md)
for the intended HA contract. No semantic runtime feature has been enabled.

Private inputs and results remain under `data/evaluation/live-2026-10-20-40bea18b/`.
Preserve this directory, its inventory SQLite/source/manifests, reviewed questions,
rankings, vectors and exact evaluator snapshots. Do not re-export production,
recreate questions or ask the user to approve the same 30 labels again.

Measured top-1/top-5 on the 24 answer cases:

- Shared lexical: 13/24 and 17/24.
- E5-small dense: 21/24 and 23/24; lexical RRF: 19/24 and 23/24.
- BGE-M3 dense: 22/24 and 24/24; lexical RRF: 20/24 and 23/24.

BGE dense is the leading candidate for further evaluation. Its separate
leave-one-group-out decision policy makes 25/30 correct decisions: 19 correct
confident answers, all three clarification cases and all three unsupported cases.
It declines five answerable requests and has zero observed incorrect confident
answers here. Each other model/method has one incorrect confident answer.
This is a small exploratory set, not an untouched holdout or production guarantee.
Do not enable the tested RRF approach merely because hybrid search was proposed.

Warm single-query CPU p50/p95: E5 16/20 ms, BGE 89/107 ms (excluding HTTP,
network, STT, TTS and loading). The unchanged full corpus contains 164 documents;
E5 truncates one document at 512 tokens; BGE truncates none. Both use pinned
MIT-licensed public weights, downloaded for local inference. No inventory text
was uploaded to a provider.

Next actions:

1. Collect untouched user-labelled questions before selecting production
   thresholds. Keep related wording groups together; cover functional misses,
   similar codes, ambiguity and absent items without tuning the existing corpus.
2. Re-evaluate BGE dense and the short-answer/clarification policy. Retain lexical
   identifier/fallback capability; any different fusion needs a fresh comparison.
3. Run full Mimer recall and Storage System retrieval checks against the new
   Ollama01 GPU endpoint before either application changes its connection.
   Spark was inspected read-only and left running its image model. From the
   existing production host, Spark's corporate hostname did not resolve. The new
   Ollama01 GPU endpoint on TowerCube is now verified independently, including
   authenticated network access. Application-specific acceptance is pending.
4. Implement shared UI/REST/MCP retrieval and derived versioned background vectors
   only after those quality/route checks, then verify in disposable real HA.

The assistant remains button-activated, with one short supported destination or
one short clarification/no-match response as the target. SQLite remains settled.
The current application's search and /ask behavior are unchanged.

Verification: both saved-vector result audits, reviewed hash/location/ranking
validation and SQLite integrity pass; Python compilation and policy safety
probes pass; all 48 application checks pass. Application version remains
0.9.1-dev. No app settings, development inventory, production service, HA/ESPHome
configuration, physical audio or printing was changed. No registry destination
is configured. The isolated Python runtime/model cache stays under ignored data/.

## Shared GPU embedding service (2026-10-21)

[Ollama01](EMBEDDING-SERVICE.md) now runs on TowerCube as CT 141 at
10.0.0.47: 4 vCPU, 8 GiB RAM, 40 GiB `local-lvm`, unprivileged Ubuntu 26.04.
The MiniCube build copy is retained stopped with onboot disabled. Migration used
`NAS:backup/vzdump-lxc-141-2026_10_21-20_59_44.tar.zst`. The existing Sunday 01:00
NAS job includes the target (last two backups, stop mode). Its Proxmox Note was
approved, written through Notes MCP and read back.

Native Ollama 0.40.6 reports 100% RTX 4000 Ada GPU for `bge-m3:cpu4`, matching
the existing Mimer model digest. NVIDIA devices and matching read-only host
libraries are exposed; Plex/OpenWebUI and the host driver were not changed.
`GGML_CUDA_DISABLE_GRAPHS=1` removes observed multi-second first-input delays;
14 synthetic varied-length requests then took 17-100 ms over authenticated LAN.
Separate client keys remain outside the repository. Standard base acceptance,
SSH/Webmin/Postfix, startup warm-up, API authentication and test mail pass.

No existing application has been switched and no Mimer vectors were regenerated.
Three CPU/GPU smoke vectors are nearly identical; full recall/retrieval acceptance
remains pending. Keep the current Mimer CPU service available through those checks.
The Ollama deployment is not the same runtime artifact used in the Hugging Face
comparison; repeat it before applying scores/thresholds. Network reachability is
verified from Mimer and Portainer without relying on the laptop/GSA route.

Monitoring was checked as `snille`: `nvidia-smi` sees the RTX card and a fresh
btop 1.4.6 shows GPU utilization, memory and temperature. Restarting the old
btop session resolved the missing GPU row; the owner confirmed the display.

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
- Live Immich, OpenRouter, Spark, three-photo drafting and the real HA HTTP client/result mapper were checked during the 2026-10-20 session. See VERIFICATION.md for evidence and reproduction. Real HA 2026.10.2 config flow, entities, services, events, conversation, reload persistence, card delivery and signed images now pass in disposable Docker. Browser tests also exercised the actual Lovelace card and thumbnail. Physical Assist/speech, real PhotoPrism and Portainer remain open.
- Recent browser checks used the actual test images without acceptance writes: portrait proportions, collapsed/expanded history, cover browsing, 100% pixels, drag panning, click retention and click-anchored zoom. The clicked point remained within one pixel of its screen position after zoom.
- Production Storage System and its HA integration remain untouched. Reference checkouts are siblings `Storagesystem` and `storagesystem-ha`; reviewed commits are in COMPATIBILITY.md.
- Printer access was subsequently authorized; the first printing UI/backend and job 114 test are described in PRINTING.md.
- Local Docker image only: no registry destination, image publication or real Portainer deployment is configured. Production access to Spark without the laptop's GSA is unresolved.

## Suggested next session

Follow the comparison handover above: untouched questions and a verified production embedding route are the next gates. Structured location selection matching the reference workflow is implemented. Excel catalog import/export is retired from scope (one-time initial label import); do not reintroduce it as a release gate. Inventory/location models must stay shared between browser, REST and MCP. Box IDs and location IDs are different concepts; do not silently derive one from the other.

No browser tab or old temporary process is required to resume. The frozen offline evaluation does not require rebuilding the app, loading its settings or contacting photo/AI providers. When application acceptance is needed, use the existing Compose app and isolated fixtures. `scripts/browser-fixture.js` serves synthetic in-memory data on port 3212; `verify-immich.js` and `verify-ai.js` can hold isolated live-image fixtures when explicitly run. Stop those fixtures when finished.

## Isolated HA verification

Run `./scripts/verify-ha-container.ps1` after building the local app image. It uses pinned real HA 2026.10.2, the reference integration mounted read-only, a unique Docker network/config volume and seeded synthetic inventory. Ports 3215/3216 bind only to loopback; discovery and TTS are disabled. The normal run cleans its own resources. `-Hold` keeps it available for browser review at `http://localhost:3215/lovelace/storage`, fixture account `acceptance` / `isolated-fixture-only`. Stop the specifically named HA test container to exit and trigger cleanup. This never targets production HA or real storage data.

## Primary voice-search direction (documented 2026-10-20)

Read [VOICE-SEARCH.md](VOICE-SEARCH.md) before implementing semantic retrieval or answer phrasing. The workshop assistant is activated by a physical button, not a wake word; its Verkstan pipeline uses conversation.storage_system, faster-whisper and Piper, with ESPHome forwarding synthesized audio to Mediaplayer 01's announcement pipeline. Live HA reads confirmed selectors/pipeline/current integration code and recent multi-location answers; physical button/audio behavior was checked in source, not retested on hardware.

The intended spoken behavior is one short, supported destination, otherwise one short clarification or no-match response. Keep detailed candidates on screen; never present the first weak hit as certainty. Current /ask still uses a local multi-match template, and semantic retrieval/voice decisions/follow-up context remain unimplemented. Existing HA sends only query and speaks answer, so adding an unused speech field would not fix it.

Read-only production measurement: 164 unique boxes, all with summaries, in 17 storage units; live overview confirms 164 with pictures, zero without, and 293 current photo references. Even a conservative 328 boxes/586 references does not justify changing SQLite. Adding Spread photos can update the same per-box embeddings. Mimers Brain uses PostgreSQL 17/pgvector, but semantic quality does not depend on that storage choice. Keep derived vectors outside inventory snapshot rewrites, evaluate realistic questions and abstention, and verify the embedding endpoint's production reachability before activation.

## Prepared live-data evaluation snapshot (2026-10-20)

The user authorized importing live inventory for semantic-search tests. See [SEMANTIC-EVALUATION.md](SEMANTIC-EVALUATION.md). The Git-ignored directory `data/evaluation/live-2026-10-20-40bea18b/` contains inventory-only JSON, a separate `inventory.sqlite`, capture/hash manifest, current-session search corpus and verification report. Import through the shared Store passed integrity and exact field/record-preservation checks: 164 boxes, 249 sessions, 306 total photo references, 164 exact locations; 293 photo references are current. No app settings/keys or original image binaries were persisted. The existing development app was not redirected or modified.

`search-corpus.json` has 164 current-box documents and 97,067 UTF-16 code units including current photo notes. Historical contents are excluded. The same private directory now contains `questions-v1.json`, `questions-v1.review.md` and `lexical-baseline-v1.json`: 30 draft questions (24 proposed single-box answers, three clarifications, three unsupported requests), with source hashes and verified current destinations. Shared lexical search agrees with draft labels at top 1 for 13/24 answer cases and top 5 for 17/24; speech decisions are not scored. Erik accepted all 30 questions/proposed boxes and confirmed the three absent items. Frozen inputs are questions-v1.reviewed.json and lexical-baseline-v1.reviewed.json; original drafts are preserved. Reviewed hash/location/ranking checks and SQLite audit pass. The set remains exploratory, not a holdout. The original next step was the now-completed two-model lexical/semantic/hybrid comparison. The original preparation called no model. The subsequent local embedding comparison is complete; see the handover above. Semantic runtime search remains unimplemented. Keep all real evaluation data under ignored runtime paths.

Roll-change observation: after the owner confirmed the replacement was loaded, the app read S0722520 / 25 x 54 mm / 413 labels. The saved format already matched. A fresh preview with a visible format caption was checked without printing. The owner confirmed the size/count and solid power with no extra feed after this replacement read.

Physical test job 116: the owner confirmed the 25 x 54 mm test label emerged, but reported blinking power afterward. CUPS still showed processing / `com.dymo.slot-status-error`. This is not full acceptance of alternate-format printing; text/orientation and clean job completion remain unconfirmed. No additional label, cancellation, reset or direct roll query was sent during the active job.

Job 116 physical correction: the owner clarified that the label was blank, with blinking power. This is a failed alternate-format print, not accepted output. The actual CUPS spool PostScript renders the expected Swedish text. Offline CUPS conversion (raster destination only, no printer backend) produced one 271 x 593 RGB page with 18,360 non-white bytes, including black pixels. The installed filter is the LanguageMonitor-enabled `raster2dymolw_v2`, not a verified no-monitor patch. CUPS first reported `com.dymo.slot-status-error`, then the socket backend failed with `Broken pipe` and busy-error; those observations do not establish the physical cause. Only test job 116 was canceled to prevent retry; no incomplete jobs remain. No additional print, raw device query, reset, production driver/configuration change or service restart was performed. The owner confirmed solid power after cancellation. This links the blinking to the failed print cycle, but does not identify why the label was blank. Evidence remains in the ignored preview diagnostics.

Repeat physical test 117: unchanged S0722520 / 25 x 54 mm test, explicitly authorized by the owner to check initial feeding. The owner reported no label and blinking power. CUPS again reported `com.dymo.slot-status-error`. Only test job 117 was canceled; the queue is empty/idle, with a printer-not-ready message. No reset, raw read, driver/configuration change or further print was performed. The repeat failure argues against a single initial-feed event, but does not distinguish roll seating/sensing from driver/protocol behavior.

0.13.1 follow-up: a bounded A1 probe returned engine 2, job ID 0, bay 9 (jammed), SKU S0722520, count 413, and error-ID zero. This is a granted host response in the protocol, despite being an error state. The reader previously treated only engine zero as owned; cleanup now also releases a granted engine-2 reservation with no active job, while reporting the error before reading NFC. A regression test confirms Q-only cleanup, no U/feed/reset and no release for a nonzero active job ID. The corrected live reader reports the label jam and sends release. The owner reported that reloading and pressing the printer's own feed button did not restore normal feeding/solid readiness. A control test with the previously accepted 57 x 32 mm roll is pending; no more software print jobs have been submitted.

The owner subsequently found the replacement roll was installed backwards, with the label side facing the wrong way, preventing correct sensing. The owner corrected the loading and authorized a fresh test. Previous driver/protocol suspicions are not an established root cause of the physical failures; this loading error is owner-verified. The separate error-reservation cleanup fix remains valid.

After corrected roll loading, app reading returned S0722520 / 25 x 54 mm / 411 labels. A fresh test was submitted once as CUPS job 118. It completed promptly; queue idle, zero queued jobs, reasons none. No media/layout/production driver change was needed. The owner accepted physical text/orientation and solid power, supported by the supplied photo.

Final physical acceptance for job 118: the owner confirmed clear, correctly oriented, unclipped text and solid power. The supplied photo confirms Swedish glyphs and the 25 x 54 mm portrait layout. Two formats now have accepted real output (57 x 32 and 25 x 54 mm); 19 x 51 and 54 x 101 mm have synthetic layout checks only. The roll-loading error resolved the reported print failure; no production driver/configuration changes were needed.

S0722430 / 54 x 101 mm accepted physically: test job 119 completed and the owner confirmed good text/layout with solid power. The supplied photo confirms legible Swedish glyphs and no clipping. Three formats now have real output acceptance: 57 x 32, 25 x 54 and 54 x 101 mm. Only 19 x 51 mm remains physically unverified among the four presets.

Final acceptance for job 120: the owner confirmed legible, correctly oriented, unclipped text and solid power. All four explicit formats now have real owner-accepted test output: S0722540 (57 x 32 mm; jobs 114/115), S0722520 (25 x 54 mm; job 118), S0722430 (54 x 101 mm; job 119), and S0722550 (19 x 51 mm; job 120). This verifies the tested layouts on this 5XL/CUPS route, not every inventory label or other printer. Description size is currently 6 points for the smallest format; text sizes are shared settings, not per-format profiles.
