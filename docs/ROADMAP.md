# Roadmap

All unchecked items are planned, not delivered.

## 1. Capture behavior and contracts

- [x] Inventory the existing user workflows and features.
- [x] Capture REST and MCP contracts from the existing application and HA client.
- [x] Define isolated fixtures and acceptance criteria, including image URLs and language behavior.
- [x] Identify reusable logic after review; avoid copying the old application wholesale.

## 2. Implement the core

- [x] Select the application framework and SQLite driver (native Node HTTP and SQLite for the first vertical slice).
- [x] Add schema, migrations, application services, integrity audit, and automated checks.
- [x] Import legacy inventory and app-settings into an empty database with preserved IDs/history and atomic validation.
- [ ] Complete separate language-file and translation-override import and full migration acceptance.
- [x] Implement consistent backup, restore, and JSON export; test a restoration into an empty instance.
- [ ] Add controlled full SQLite restore to the UI (CLI fresh-file restore currently implemented).

## 3. Implement interfaces and integrations

AI settings direction: [task-based AI design](AI-DESIGN.md). Named connections, task settings, single-photo tests and multi-photo new-box drafts and existing-box photo updates with review/edit/save are implemented. Other tasks remain planned.

- [ ] Implement inventory UI, settings, photo integrations, and AI workflows.
- [x] Implement manual inventory UI, session history and shared server-side search.
- [x] Add a storage map from registered positions/current box locations, with search highlighting and box navigation.
- [x] Restore reference-style Swedish word variants, RC synonyms, short transpositions and retained historical filename search.
- [x] Separate interface language (English/Swedish), external-response defaults and AI description language; preserve stored inventory text.
- [x] Release photos removed from current inventories back to the unassigned album while retaining history.
- [x] Add automatic/selectable box-card photos and in-app photo browsing without opening tabs.
- [x] Add photo retrieval adapters tested against synthetic HTTP sources.
- [x] Add redacted photo settings, album discovery/inbox, image selection, roles and validated attachments.
- [x] Verify live Immich album selection, previews, session save, REST and MCP with a dedicated account and isolated test inventory.
- [ ] Verify a real PhotoPrism instance and implement remaining settings sections.
- [x] Implement task-based AI connection/settings UI and a single-photo analysis preview without inventory writes.
- [x] Verify live OpenRouter image analysis from the Immich test album, including a browser-driven preview with isolated inventory.
- [x] Add multi-photo new-box drafts with explicit review/edit/save through the shared session service.
- [x] Add AI-assisted updates to existing boxes with selected photos, current-description context and explicit review/apply/save.
- [ ] Implement and evaluate the [voice-first hybrid retrieval and answer contract](VOICE-SEARCH.md): one supported destination or short clarification/no-match answer, without reading candidate lists.
- [x] Implement and regression-test an isolated shared answer-decision preview with direct current evidence, explicit compatible-destination/type-clarification rules and current-location formatting. Runtime activation and fresh acceptance remain open; see ANSWER-POLICY.md.
- [x] Add and live-test an optional source-bound local identity verifier for semantic-only preview candidates, with current-session/quote guards and abstention on failures. This remains a preview; identity model choice, latency and independent acceptance are not release-complete.
- [x] Add optional versioned background embeddings in a separate SQLite cache, native no-truncation Ollama adapter with immutable digest checks, and authenticated management-only ranking/decision preview with lexical fallback. Disabled by default; no public activation. See SEMANTIC-RUNTIME.md.
- [x] Add Search & answers UI with saved embedding configuration, native model/digest discovery, credential protection, editable reviewed rules and saved-settings preview. Changes reconfigure the optional worker without restarting inventory; rule previews also work with embeddings disabled.
- [ ] Verify the authenticated native embedding-service route from the deployment, select/configure identity verification and thresholds, complete independent acceptance, then enable shared public retrieval; add compatible bounded clarification context for HA with button activation retained.
- [ ] Add optional AI answer phrasing and translation drafting; application logic controls destination selection and speech constraints.
- [ ] Implement compatible REST and MCP endpoints.
- [x] Implement public REST shapes and all five read-only MCP tools.
- [ ] Close search/language parity gaps recorded in COMPATIBILITY.md.
- Excel catalog import/export is out of scope (one-time initial label import, retired 2026-10-20).
- [x] Verify the actual HA integration runtime against an isolated real Home Assistant Docker instance.
- [x] Verify the actual HA HTTP client and result mapper against the development container.
- [x] Verify HA config flow, entities, services, events, conversation and Lovelace card in isolated real HA.
- [ ] Verify physical Assist/speech when available.
- [ ] Later: measure real Whisper transcription errors and evaluate conservative inventory-aware text normalization, including split names. The owner deferred this work on 2026-10-22; it does not block isolated text-search development. Preserve raw queries and exact code/dimension handling.

## 4. Package and verify deployment

- [x] Add pinned Docker builds, health checks, and a Portainer-compatible Compose template.
- [x] Verify local container startup, volume persistence, backup and fresh-file restore.
- [ ] Verify future schema upgrades and production migration; initial startup/persistence/backup/fresh restore are already checked locally.
- [ ] Publish an image and test Portainer deployment/updates and future schema upgrades.
- [ ] Choose a production AI endpoint/network route reachable from Portainer without relying on the development laptop's GSA connection.
- [ ] Review printer driver sources and patches; provide optional CUPS packaging.
- [ ] Implement general print configuration, label sheets, and optional DYMO capabilities.
- [ ] Verify physical print output and queue/status behavior.
- [x] Implement the first CUPS/IPP printing slice: connection/status, 57 x 32 mm test/box previews, label-only text edits, durable one-job submission and schema-1-to-2 migration tests.
- Browser test job 114 completed and the physical roll counter decreased 679 to 678. The owner approved physical legibility/orientation and supplied a matching photo. See PRINTING.md.
- [ ] Document supported printers based on testing, not assumed CUPS compatibility.

- [x] Expose CUPS status/reasons with explicit queue-versus-physical scope.
- Direct DYMO monitoring failed live acceptance and was withdrawn in 0.12.1; require owner-observed non-interference before another integration.

- [x] Read DYMO 5XL article/count through a bounded manual ownership/read/release cycle, physically accepted without feed or blinking.
- [x] Add four explicit media presets and dynamic preview/PostScript geometry.
- [x] Verify a real roll change to S0722520: 25 x 54 mm, 413 labels, owner-confirmed solid power/no feed.
- [ ] Physically accept alternate-format printed output.

- [x] Physically accept S0722520 / 25 x 54 mm after corrected roll loading: job 118 completed, queue idle/empty, owner-approved output/photo and solid power.
- [x] Physically accept S0722430 / 54 x 101 mm: job 119 completed, owner-approved output/photo and solid power.
- [x] Physically accept S0722550 / 19 x 51 mm: job 120 completed with a 6-point description, owner-approved text and solid power.
- [ ] Add further article mappings only with verified geometry and per-format physical checks.
