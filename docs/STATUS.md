# Continue development

Updated 2026-10-19 for the 0.6.4-dev session wrap-up. Read this file, README.md, ARCHITECTURE.md and ../TODO.md before continuing. VERSION is authoritative; this remains a development preview, not the production replacement.

## Working implementation

- Native Node HTTP/ES modules and SQLite, no external runtime packages. Shared inventory service for browser, REST and all five legacy-compatible read-only MCP tools.
- Manual box/session inventory, history, search, data audit, legacy JSON/settings import, inventory export, SQLite backup and CLI restore into a fresh file. IDs and optional legacy fields are preserved.
- Authenticated Immich/PhotoPrism configuration and album inbox; explicit photo selection, roles and filename retention; validated attachments and signed image delivery. Real Immich is verified; PhotoPrism is fixture-tested only.
- AI assistance is divided into overview, named connections and image inventory. OpenRouter, generic OpenAI-compatible and llama.cpp connections work through the same bounded service. Single-photo previews and combined one-to-six-photo new-box drafts support explicit review/edit/save. AI updates to existing boxes are not implemented.
- Box cards have automatic or user-selected cover photos. Cover metadata changes do not create inventory sessions. Box details show complete portrait/landscape previews and collapsed history.
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

- `npm run check`: syntax, 33 automated checks and Git whitespace validation. Docker build runs the same isolated suite with pinned Node 24.14; host is Windows Node 26.5.1.
- Container acceptance checks persistence, audit, backup, fresh restore and MCP using a unique disposable container/volume: `./scripts/verify-container.ps1`. This passed again at wrap-up, as did the real HA HTTP client/result mapper; temporary acceptance resources were removed by the script.
- Live Immich, OpenRouter, Spark, three-photo drafting and the real HA HTTP client/result mapper were checked earlier in this session. See VERIFICATION.md for evidence and reproduction. Full Home Assistant, PhotoPrism and Portainer acceptance remain open.
- Recent browser checks used the actual test images without acceptance writes: portrait proportions, collapsed/expanded history, cover browsing, 100% pixels, drag panning, click retention and click-anchored zoom. The clicked point remained within one pixel of its screen position after zoom.
- Production Storage System and its HA integration remain untouched. Reference checkouts are siblings `Storagesystem` and `storagesystem-ha`; reviewed commits are in COMPATIBILITY.md.
- Do not test the physical printer until the user says it is available again. No printing UI/backend has been implemented.
- Local Docker image only: no registry destination, image publication or real Portainer deployment is configured. Production access to Spark without the laptop's GSA is unresolved.

## Suggested next session

Start with the user's current UI feedback, then choose a bounded item from ../TODO.md. Location selection is an explicitly requested improvement: use known positions rather than free-text location IDs, with clear empty-state handling. Inventory/location models must stay shared between browser, REST and MCP. Box IDs and location IDs are different concepts; do not silently derive one from the other.

No browser tab or old temporary process is required to resume. Start/rebuild the existing Compose app, inspect current runtime settings, and use isolated fixtures for write acceptance. `scripts/browser-fixture.js` serves synthetic in-memory data on port 3212; `verify-immich.js` and `verify-ai.js` can hold isolated live-image fixtures when explicitly run. Stop those fixtures when finished.
