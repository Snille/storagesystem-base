# Development backlog

Read docs/STATUS.md for the current handover and docs/ROADMAP.md for the full scope. Unchecked items are not delivered; order below is suggested, not a promise of implementation.

## Next product work

- [x] Import a private inventory-only live snapshot into a separate SQLite evaluation database and derive current-session search documents; see [evaluation preparation](docs/SEMANTIC-EVALUATION.md).
- [x] Draft 30 private workshop evaluation questions with proposed current destinations, clarification/no-support cases and an initial lexical baseline; see [evaluation preparation](docs/SEMANTIC-EVALUATION.md).
- [x] Obtain user review of all 30 questions/proposed boxes and three absent-item cases; freeze the reviewed dataset with unchanged answers and a reproducible lexical baseline.
- [x] Compare two local embedding candidates against lexical/hybrid search using the frozen reviewed dataset; BGE-M3 dense leads this exploratory comparison. See [results and limitations](docs/SEMANTIC-EVALUATION.md).
- [x] Repeat the frozen Storage System comparison through Ollama01 GPU: unchanged top-1 results, 22/24 top-1 and 24/24 top-5; see the 2026-10-22 endpoint results in SEMANTIC-EVALUATION.md.
- [x] Handle silent truncation explicitly in the optional runtime adapter: use native Ollama `truncate: false`, check immutable model digests and reject oversized inputs. The compatible route remains unused by this runtime; an approved native deployment route is still required. See SEMANTIC-RUNTIME.md.
- [x] Collect and freeze 20 owner-authored/reviewed short questions before inference; measure unchanged BGE-M3 and lexical retrieval plus a policy fitted only to the original dataset. BGE gets 18/19 top-1 and 19/19 top-5, but fixed-policy decisions get 15/20. See SEMANTIC-EVALUATION.md.
- [x] Implement shared `Inventory.previewAnswer` with current whole-word evidence, explicit owner interaction rules, stale-session/code guards and deterministic location formatting. Regression results: user set 20/20 with six explicit owner rules; generic logic alone 14/20, first candidate correct in 19/19 answer cases; old set 27/30 without rules. See ANSWER-POLICY.md.
- [x] Freeze the implementation and run 30 new source-derived cases without new rules or tuning: 29/30 correct, but the zero-incorrect-confident-answer gate fails because a thermal-camera query selects a heat gun. See the acceptance-v3 section in SEMANTIC-EVALUATION.md. This is not human-labelled independent acceptance.
- [x] Add a source-bound local identity-verification preview for semantic-only matches, with near-name/negative-property guards, current-session checks and unavailable-service abstention. Frozen failure repaired in regression: source set 30/30, owner set 20/20 with six explicit rules plus the already confirmed intent, old set 27/30. Preserve all failed runs; this is not fresh independent acceptance.
- [ ] Independently validate identity checking and select its production endpoint/latency budget before activation. Warm local verification adds roughly 1.4-4.2 seconds when required, and the first standalone chat probe took 29.4 seconds. No automatic Spark dependency or app setting has been enabled; shorter timeout behavior is covered by fixtures.
- [ ] Obtain fresh independent acceptance for the revised decisions, including unsupported cases; new questions are now regression evidence. The preview is not activated in public interfaces. Generic logic alone does not infer the owner's equivalence/type distinctions; settings/rule management remains needed. Keep equal-weight RRF disabled.

- [ ] Implement and evaluate [voice-first hybrid retrieval](docs/VOICE-SEARCH.md): one supported destination, short clarification/no-match responses, detailed candidates on screen. Keep physical-button activation and SQLite; do not enable semantic search before measuring top-1/abstention quality.
- [x] Provision a separate shared Ollama01 staging LXC on MiniCube and verify authenticated BGE-M3 API access and synthetic Mimer vector compatibility; see [service staging](docs/EMBEDDING-SERVICE.md).
- [x] Migrate Ollama01 to TowerCube; verify GPU execution, authenticated API, startup and a Proxmox Note while retaining the stopped MiniCube copy.
- [x] Mimer acceptance/cutover is recorded in EMBEDDING-SERVICE.md; Storage System's frozen endpoint comparison passes. Untouched questions and application runtime acceptance remain required for Storage System.
- [x] Add optional versioned background embeddings without blocking inventory saves, persisted in a separate rebuildable SQLite cache with model/session/content binding, complete-corpus gating, query race checks and management-only preview. Explicit environment configuration, disabled by default. See SEMANTIC-RUNTIME.md.
- [x] Add Search & answers UI with persisted native embedding configuration, redacted/retained credentials, model/digest discovery, hot runtime reconfiguration, editable owner rules and a saved-settings decision preview. Swedish cable inflections preserve the owner's finished-cable clarification. Rule previews also work with embeddings disabled; public retrieval is unchanged.
- [ ] Verify the authenticated native embedding-service route from the future LXC. Existing gateway returns 404 for native tags/embed; temporary SSH-tunnel tests do not establish deployment readiness. Identity model/threshold configuration, public activation and independent acceptance remain separate gates.
- [ ] Add bounded, conversation-specific clarification context through compatible HA/API extensions; retain button activation for the reply.
- [ ] Later, at the owner's request: evaluate real microphone-to-Whisper transcription errors and add conservative inventory-aware normalization for splits/misspellings such as `Nuimo` / `nu imo`. Preserve raw text and protect product codes/dimensions. Defer this work; continue text-search development first. Piper output/physical speech acceptance remains separate.

- [x] Use reference-style category, unit, shelf/surface, position and optional letter controls, with known-unit suggestions and automatic location IDs. Preserve saved IDs until explicit movement; full storage-unit layout management remains below.
- [x] Add the registered-position storage map with box navigation and search highlighting.
- [x] Improve shared search with reference Swedish variants, RC synonyms, short transpositions and historical filenames.
- [ ] Continue hands-on review of inventory/AI workflows with the current test album; improve explanatory text where the user finds it unclear.
- [x] Add AI-assisted updates to existing boxes with explicit review and preserved inventory history.
- [ ] Evaluate other local image models only when requested; compare real image/OCR results rather than trusting capability labels. Reuse the current Spark connection before setting up new infrastructure.

## Before production migration

- [ ] Complete legacy search/language parity and separate translation-file import; acceptance-test real migration and restore.
- [ ] Add controlled full SQLite restore to the UI; current restore is CLI-only into a new file.
- [ ] Complete location/storage-unit management and remaining application settings.
- [ ] Verify real PhotoPrism.
- [x] Verify actual Home Assistant config flow, entities, services, result events, conversation and card delivery in disposable Docker.
- [x] Verify the actual HA Lovelace card in the browser: Swedish question, RC synonym, no-result clearing and thumbnail rendering.
- [ ] Verify physical Assist/speech only when available.
- [ ] Choose a registry/image publishing workflow and verify a real Portainer deployment/update. Current image is local only.
- [ ] Resolve a production AI route reachable from Proxmox/Portainer without the development laptop's GSA connection, or choose a different endpoint.
- [ ] Before the server LXC migration, compare OpenRouter candidates, including Qwen models and GPT-6 Luna, against the current Qwen workflows and select the lowest measured cost among models that pass quality, safety and latency gates. Evaluate real inventory photos, OCR and multiple-photo requests separately from text-only item identity verification. Different models may serve these roles. Measure full request cost, including image/reasoning tokens and retries; listed token prices or image support alone do not establish equivalence. Keep BGE-M3 embeddings on their separate Ollama route. This is planned evaluation, not a model selection or authorization for paid benchmarks.
- [ ] Plan removal of Open WebUI after checking all consumers and verifying direct replacement routes. Read-only production settings inspection on 2026-10-23 found both legacy AI roles already select OpenRouter: primary `qwen/qwen3-vl-8b-instruct`, translation `qwen/qwen3.5-flash-02-23`. An unselected Open WebUI configuration remains saved. This does not establish that other services no longer use Open WebUI. Ollama embeddings alone do not replace image/text generation; verify suitable generation models and each application's direct API compatibility before retirement. No production settings or service state were changed.
- [x] Implement initial CUPS printing and optional manual DYMO roll reading; all four configured formats have owner-accepted physical output.
- [ ] Next printing slice: per-format layout/text profiles and practical box/location labels; preserve preview/overflow/idempotency guards. See HANDOFF-2026-10-23.md.

## Out of scope

- Excel catalog import/export was retired by Erik on 2026-10-20. It was a one-time initial label import and is not a migration or release gate. Inventory JSON import/export remains supported.

- [x] Add first 57 x 32 mm CUPS/IPP label workflow and durable print journal; browser test job 114 completed and counter decreased by one.
- [x] Obtain physical test-label quality/orientation confirmation and inspect the owner photo, including Swedish glyphs and clipping.
- [ ] Finish designer/media/sheets/QR scope and verify the final LXC CUPS route. See docs/PRINTING.md.

- [x] Clarify CUPS queue status/reasons/default media versus app media and physical lamp/roll readiness.
- [ ] Investigate DYMO raw protocol without reusing lock-acquiring legacy status. Experimental version/status monitoring failed live acceptance (white lamp blinked) and was withdrawn; no further raw queries or recovery actions are automated.

- [x] Implement manual DYMO 5XL roll reading with owner-confirmed solid lamp/no feed and explicit article-backed formats.
- [x] Accept an actual roll change to S0722520 / 413 labels with solid power and no feed.
- [x] Physically accept all four configured formats; see PRINTING.md and HANDOFF-2026-10-23.md.

- [x] Physically accept S0722520 / 25 x 54 mm after corrected roll loading: job 118 completed, queue idle/empty, owner-approved output/photo and solid power.
- [x] Physically accept S0722430 / 54 x 101 mm: job 119 completed, owner-approved output/photo and solid power.
- [x] Physically accept S0722550 / 19 x 51 mm: job 120 completed with a 6-point description, owner-approved text and solid power.
- [ ] Add further article mappings only with verified geometry and per-format physical checks.
