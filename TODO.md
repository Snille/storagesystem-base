# Development backlog

Read docs/STATUS.md for the current handover and docs/ROADMAP.md for the full scope. Unchecked items are not delivered; order below is suggested, not a promise of implementation.

## Next product work

- [x] Import a private inventory-only live snapshot into a separate SQLite evaluation database and derive current-session search documents; see [evaluation preparation](docs/SEMANTIC-EVALUATION.md).
- [x] Draft 30 private workshop evaluation questions with proposed current destinations, clarification/no-support cases and an initial lexical baseline; see [evaluation preparation](docs/SEMANTIC-EVALUATION.md).
- [x] Obtain user review of all 30 questions/proposed boxes and three absent-item cases; freeze the reviewed dataset with unchanged answers and a reproducible lexical baseline.
- [ ] Compare two local embedding candidates against lexical/hybrid search using the frozen reviewed dataset before choosing a model.

- [ ] Implement and evaluate [voice-first hybrid retrieval](docs/VOICE-SEARCH.md): one supported destination, short clarification/no-match responses, detailed candidates on screen. Keep physical-button activation and SQLite; do not enable semantic search before measuring top-1/abstention quality.
- [ ] Add versioned background embeddings and model settings without blocking inventory saves; validate the production embedding-service route.
- [ ] Add bounded, conversation-specific clarification context through compatible HA/API extensions; retain button activation for the reply.

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
- [ ] Implement label design, general print configuration and optional CUPS/DYMO support; physical printer tests remain deferred until the user has access.

## Out of scope

- Excel catalog import/export was retired by Erik on 2026-10-20. It was a one-time initial label import and is not a migration or release gate. Inventory JSON import/export remains supported.
