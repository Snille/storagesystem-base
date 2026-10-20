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
- [ ] Add versioned background embeddings in SQLite and a verified production embedding-service route; add compatible bounded clarification context for HA with button activation retained.
- [ ] Add optional AI answer phrasing and translation drafting; application logic controls destination selection and speech constraints.
- [ ] Implement compatible REST and MCP endpoints.
- [x] Implement public REST shapes and all five read-only MCP tools.
- [ ] Close search/language parity gaps recorded in COMPATIBILITY.md.
- Excel catalog import/export is out of scope (one-time initial label import, retired 2026-10-20).
- [x] Verify the actual HA integration runtime against an isolated real Home Assistant Docker instance.
- [x] Verify the actual HA HTTP client and result mapper against the development container.
- [x] Verify HA config flow, entities, services, events, conversation and Lovelace card in isolated real HA.
- [ ] Verify physical Assist/speech when available.

## 4. Package and verify deployment

- [x] Add pinned Docker builds, health checks, and a Portainer-compatible Compose template.
- [x] Verify local container startup, volume persistence, backup and fresh-file restore.
- [ ] Verify future schema upgrades and production migration; initial startup/persistence/backup/fresh restore are already checked locally.
- [ ] Publish an image and test Portainer deployment/updates and future schema upgrades.
- [ ] Choose a production AI endpoint/network route reachable from Portainer without relying on the development laptop's GSA connection.
- [ ] Review printer driver sources and patches; provide optional CUPS packaging.
- [ ] Implement general print configuration, label sheets, and optional DYMO capabilities.
- [ ] Verify physical print output and queue/status behavior.
- Physical printer tests are deferred until the user has printer access again.
- [ ] Document supported printers based on testing, not assumed CUPS compatibility.
