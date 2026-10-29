# Storage System Base

A fresh implementation of [Storage System](https://github.com/Snille/storagesystem), designed for Docker and Portainer, with SQLite storage.

## Status

For the next development session, start with [current state and continuation notes](docs/STATUS.md) and [the prioritized backlog](TODO.md).

This application has been **production since 2026-10-25**. Version **0.29.0** is
running in Portainer and at `verkstad.snille.net` / `hylla.snille.net`; [VERSION](VERSION)
is the single application version source (currently **0.30.0**, prepared for deployment). The previous application is retained as
a rollback source, not the active backend. This repository has independent Git history.

Implemented: box inventory/session history, Immich album/photo workflows, reviewed
editable AI drafts and updates with fallback, shared lexical UI/REST/MCP search,
AI-phrased public answers, browser microphone input, storage map/unit photos and
labels, panorama overview points, English/Swedish UI, appearance/security settings,
validated migration, audit, export, SQLite backup/restore and template-based printing
through the separate label service. Home Assistant runtime/card acceptance has passed
in isolation. PhotoPrism is fixture-tested only.

Source 0.30.0 adds explicitly enabled shared semantic search and answer rules for
browser, REST/HA and MCP, with current-text fallback and source-bound identity
verification. Production remains 0.29.0 until the controlled update. Translation tooling and further location management are also unfinished.
See [remaining work](TODO.md), [verification boundaries](docs/VERIFICATION.md),
[compatibility](docs/COMPATIBILITY.md) and [deployment](docs/DEPLOYMENT.md).

## Capabilities

- Inventory boxes, storage locations, inventory sessions, photo references, and history.
- Read album photos from Immich or PhotoPrism.
- AI-assisted inventory and search.
- SQLite storage with transactions, schema migrations, and integrity checks.
- Downloadable backup and restore, readable JSON export, and migration from the existing JSON files.
- Compatible public REST API for the existing [Home Assistant integration](https://github.com/Snille/storagesystem-ha).
- Read-only MCP tools compatible with the existing application.
- Label printing through the separate label service (CUPS and the DYMO driver live there); label design in a later designer on the same service.
- A prebuilt application image and Compose stack suitable for Portainer.

## Run locally

Requires Node.js 24.14 or newer (the Docker runtime pins Node 24.14). No npm install or build step is needed: there are no external runtime dependencies.

PowerShell, for a **loopback-only development preview with disposable credentials**:

```powershell
$env:STORAGE_ADMIN_KEY = 'development-preview'
$env:STORAGE_API_KEY = 'development-readonly'
npm start
```

Open [localhost:3210](http://localhost:3210) and enter the management key. The first start creates an empty database under `data/`. Each box save creates a new inventory session. Existing sessions and photo references remain in history. The interface defaults to English and also supports Swedish; public location labels and local answers support English, Swedish and German. Theme follows the operating system and can be switched for the current tab.

Configuration:

| Variable | Purpose |
| --- | --- |
| `STORAGE_DB` | Database file; default `./data/storage.sqlite`, `/data/storage.sqlite` in Docker |
| `HOST` | Default `127.0.0.1`, `0.0.0.0` inside Docker |
| `PORT` | Application port, default `3210` |
| `STORAGE_ADMIN_KEY` | Separate key for browser management, imports, exports and backups; management is disabled when empty, unless `STORAGE_MANAGEMENT_ACCESS` is `open` |
| `STORAGE_MANAGEMENT_ACCESS` | `open` lets anyone who reaches the app manage it without a key, like the reference application. Use it only on a trusted LAN with an authenticating proxy for outside access; it requires `APP_ALLOWED_HOSTS`. Other websites still cannot change data (origin check) |
| `APP_ALLOWED_HOSTS` | Comma-separated `host[:port]` names the app answers to besides `APP_BASE_URL`, for example `hylla.snille.net,10.0.0.25:3210`. When set, requests for other host names are refused (protects against DNS rebinding) |
| `STORAGE_API_KEY` | Public read API/MCP key; empty permits unauthenticated public reads, matching the legacy behavior |
| `APP_BASE_URL` | Externally reachable base URL used for image links; required for HA outside the same origin |

The imported `security.publicApiKey` takes precedence over `STORAGE_API_KEY`. The legacy `LAGERSYSTEM_API_KEY` environment fallback is also accepted. `APP_BASE_URL` takes precedence over the imported base URL. A different management key is recommended; the read API key must not authorize writes.

## Languages

Open **Appearance → Languages** after opening the inventory. **Interface language** controls the application's menus, buttons and guidance (English or Swedish). The choice is saved for this instance and is restored before sign-in on reload. Saved box names, descriptions, keywords and photo filenames are never translated by the interface catalog.

**Default language for external responses** controls generated local answers and location names returned to Home Assistant, REST and MCP when a caller does not specify a language (English, Swedish or German). It does not control the interface or translate saved contents. Existing `appearance.language` settings retain this meaning; the interface uses the separate `appearance.uiLanguage` setting.

Under **AI assistance → Image inventory**, **AI description language** independently selects English, Swedish or German, or **Use the external response language**. The help text displays the resolved language. This choice affects new analyses only; existing inventory text is unchanged. The legacy task value `app` is retained for compatibility and now has an explicit external-response-language label.

**Extra instructions** are appended to the built-in instructions, which remain read-only. **Clear extra instructions** removes only these additions. Prompt text and technical service errors may remain in English regardless of the interface language.

## Storage positions

Choose the current location using the same parts as the reference application: **Location category** (Shelving unit, Bench or Cabinet), a unit name, **Shelf** or bench **Surface** (On top / Under), **Position** and an optional **Letter**. Shelf and position choices are 1-12; letters are A-Z or None. Existing imported values outside those ranges remain available when editing.

The unit field suggests known units (plus shelving units A-G) and accepts a new name. The location ID is assembled automatically, for example `A-H2-P1-A`, `BENCH:SVARV:UNDER:P2` or `CABINET:3D-PRINT:H1:P3:B`. New destinations are registered by the ordinary inventory session save; no separate position-registration step is needed.

Existing boxes keep their exact saved location until you choose **Change location**. **Keep saved location** cancels the location edit. Box ID appears as a small read-only metadata line below the save action. New boxes show a proposed location-based ID, allocated uniquely by the server when saving; existing box IDs stay unchanged when moving the box. Existing unrecognized location IDs are retained until explicitly replaced. An exact location, including its optional letter, can belong to only one box. Occupied choices are marked unavailable; the server rechecks inside the save transaction, including equivalent legacy IDs. Moving a box frees its old location.

SQLite backups include all registered positions, including vacated ones. Legacy inventory JSON contains box-associated positions only. Open **Storage map** to browse shelving units, benches and cabinets by shelf/surface and position. Letters have separate occupancy, registered vacant places are marked Free and gaps are Not registered. Click a box to open its details. An active search highlights matches and opens a matching unit. The map refreshes inventory when opened. It reflects saved positions rather than assuming empty capacity; storage-unit geometry/layout editing remains planned.

Search supports Swedish word endings, reference RC/car synonyms, short adjacent-letter transpositions, accent-insensitive matching and field-weighted ranking. The same service serves the UI, REST and MCP. Filename searches prioritize exact matches and can find retained filenames from earlier sessions while showing current contents. Legacy imports without filename metadata are not automatically enriched from the live album.

## Photo setup and album workflow

After opening the inventory, choose **Photo settings**. Enter the Immich or PhotoPrism server URL (without `/api`), the access mode and a read-only key/token. **Save & load albums**, choose an album, then **Save settings**. API keys are stored in the runtime database but are never returned by the settings endpoint. Blank key fields retain existing credentials; clearing requires an explicit checkbox. Changing server/provider/access mode clears credentials. Existing photo references prevent switching to a different server/provider, because legacy asset IDs do not identify their originating server.

For Immich, use a dedicated service account with a key granting `album.read`, `asset.read`, `asset.view` and `asset.download`. Its album must be accessible to that account; when another user owns it, share it with the service account as a viewer. A public shared link is not required for API-key mode. Immich shared-link mode is also supported using its key. PhotoPrism uses a Bearer access token.

Album inbox images are fitted without cropping, preserving portrait/landscape proportions and showing the full available preview. Open **Album inbox**, select images, and use them in a new box, or choose **Choose from album** while editing an existing box. Click a selected session photo to inspect its full-resolution image in the zoom/pan viewer without leaving the editor. Previous/Next and Esc retain the unsaved form. Assign each image a role before saving. The inbox hides photos used in current box inventories by default. Removing a photo and saving the next inventory session releases it back to the unassigned inbox, where it can be used for another box. Earlier session references remain in history and do not reserve the photo. Removing a photo from the draft only changes the next session; earlier sessions and original images stay intact. Existing associations can be retained without contacting the photo service, but new attachments are checked against the current album before saving.

Album preview links expire after 15 minutes or a server/settings change; refresh the inbox to renew them. The catalog supports up to 20000 images with bounded pagination. Video entries are excluded. Manual inventory and AI draft review use the same final session save.

## Box photos and card images

Box details show complete preview images in their original proportions. Inventory history is collapsed initially; expand its heading to inspect earlier sessions. In the photo viewer, use **+ / −** to zoom, **Actual size · 100%** to inspect original pixels and **Fit image** to return to the fitted view. Click a detail in a fitted image to zoom in at that point, then hold and drag to explore. Toolbar zoom keeps the viewport's center detail in place. Clicking a zoomed image keeps its zoom; use Fit image or switch photos to reset. Each photo starts fitted.

Box cards show a photo from the current inventory session. Automatic selection prefers Inside, then Spread, Detail, Label and Storage location; this retains the reference application's preference for an inside photo. Open a box and select a photo to view it inside the app. **Previous/Next** and the left/right arrow keys cycle through the box's current images. **Esc** closes the viewer and returns to the box; photos do not open new tabs.

In the viewer, **Use as card image** saves the displayed image as the box's cover. **Automatic card image** restores the default selection. This changes only cover metadata, without creating an inventory session or editing the original photo. If the chosen image is removed from a later current session, the card falls back automatically; earlier session photos remain intact. Boxes without photos retain the placeholder.

## Voice search and semantic-search direction

See [workshop voice flow and proposed semantic design](docs/VOICE-SEARCH.md) for the current button-activated HA/ESPHome/Piper/announcement path, short answers, clarification behavior and the SQLite capacity decision. A [shared decision preview](docs/ANSWER-POLICY.md) combines current literal evidence, supplied semantic candidates and explicit owner rules. `Inventory.verifiedPreviewAnswer` additionally supports an optional bounded local identity check before a semantic-only match can become an answer. An explicitly enabled [semantic runtime preview](docs/SEMANTIC-RUNTIME.md) adds background vectors in a separate SQLite cache, immutable model/content/session binding and native Ollama requests that reject truncation. It is disabled by default; ordinary search has a separate explicit activation switch; the authenticated native tags/embed route was verified from the production container on 2026-10-29. With ordinary semantic search enabled, browser, public search/ask, MCP and HA share supported selections and deterministic location answers; disabled mode retains legacy lexical search and AI answer phrasing. Saved embedding settings and answer-rule editing are available through **Search & answers**; source 0.30.0 includes saved identity/threshold settings. Fourteen owner cases pass across all four transports. Conversational follow-up state remains planned. The read-only production measurement on 2026-10-20 found 164 boxes and 293 current photo references; doubling that scale does not require a PostgreSQL migration.

Open **Search & answers → Answer rules** to choose **Use this location** (one preferred box), **Either location is fine**, **Return both locations** (two boxes), or **Ask which type** with a short question. Select current boxes by name/location and save the rule. Rules require current inventory evidence; an unsupported destination cannot create an answer. **Try a question** uses saved rules even with embeddings disabled. It displays the short answer/clarification plus detailed candidates without changing inventory. For example, an explicitly configured network-cable rule can ask whether a finished cable is needed; follow-up conversation is not implemented yet.

Under **Embedding model**, save the native Ollama origin/key, then explicitly **Load saved server models**. Choosing a listed name fills its immutable digest; check dimensions before enabling **Build the semantic search index**. Enabling sends current descriptions to that server and starts background indexing. A model list does not prove embedding support. A blank key retains it; changing server clears it. Configuration changes apply without restarting inventory. In source 0.30.0, the same panel also offers **Item identity verification** with a separate compatible endpoint/key, model, timeout and explicit thresholds. It defaults to disabled with no thresholds; enabling it may send the question and one candidate's bounded current text to that server. Model identity checks can incur provider charges when a paid service is explicitly configured. Enable **Use semantic search in web, API, MCP and Home Assistant** only after checking the preview. No model is chosen automatically. See SEMANTIC-RUNTIME.md for routing, boundaries and API details.

## Search log

Open **Search & answers → Search log** to browse the shared SQLite log
for web, REST/HA, MCP searches and decision previews. It shows the received text,
returned matches, server answer, timestamp, source and duration, with text/source
filters and older pages. Keeps 90 days/up to 10,000 entries; SQLite backups include
it and JSON export does not. Earlier requests were not recorded. This feature is deployed in production 0.29.0.
See [Search log](docs/SEARCH-LOG.md) for attribution and retention limits.

## AI assistance

Choose **AI assistance** for an overview, **Connections** for service addresses/keys, and **Image inventory** for the model, output language and optional extra instructions. Start with one named connection. OpenRouter uses its fixed API base; llama.cpp and OpenAI-compatible services use their configured API base, including `/v1` when required. Select **llama.cpp (local)** for that server: inventory requests disable its template thinking phase so the output budget is used for the description. Other compatible services receive no llama.cpp-specific options. Other provider protocols are not implemented. Changing connection identity clears its key; a blank key otherwise retains the saved value. Legacy AI settings remain preserved but are not automatically activated.

**Test saved connection & list models** checks the saved endpoint/model catalog (and OpenRouter key authentication). It does not confirm image capability. Choose an image model once per task, through the model suggestions or an exact ID, and save. **Advanced instructions** adds task-specific preferences; changing models does not silently change them. Read the built-in instructions there.

Under **Try a photo**, load the configured album, select one image and optionally assign its role. The disclosure names the destination/model before **Analyze selected photo** sends its preview image. Immich analysis uses the larger `preview` rendition (verified as JPEG on the live source), with an 8 MiB limit, while the album grid keeps small thumbnails. PhotoPrism still uses its existing preview tile. JPEG, PNG and WebP are accepted by the app, but compatible servers may support fewer formats. It returns a suggested label, description, keywords, role and uncertainty; inspect these against the photo. No inventory is saved. Only explicit analysis actions send photos to AI, and paid services may charge. A configured fallback can answer selected route/output failures; stale settings or inventory never trigger it. There is no unbounded retry loop. One analysis runs at a time per process, with a 90-second AI timeout. Configuration changes invalidate pending results.

### Create a box from several photos

In **Album inbox**, select one to six unassigned photos of the same box, then choose **Create AI draft**. Set each role: Label, Inside a box, Spread-out contents, Storage location or Detail; automatic suggestions are optional. The disclosure identifies the saved image connection/model and the number of photos before **Analyze photos together** sends them in one request. Manual roles are preserved. The model combines complementary views, avoids counting repeated views as different items and reports uncertain or conflicting observations. These instructions guide the model; they do not guarantee identification or quantity accuracy.

Review and edit the combined label, description, keywords, uncertainty and each photo description before applying the suggestion. Photo descriptions can also be edited in the box form. **Review & edit in box form** transfers the suggestion and photos into the ordinary new-box editor without saving. Correct the text, review uncertainty notes and roles, and choose the storage position. The box ID is generated automatically. Only **Save inventory session** creates the box/session. An existing box ID is rejected for this new-box workflow. For an existing box, use the update workflow below.

Total preview image data is limited to 16 MiB per analysis, in addition to the 8 MiB per-image bound. Photos and source configuration are revalidated when attaching them on final save. No inventory writes occur during analysis or transfer to the editor. Closing the editor discards the unsaved form.

To add evidence to an existing box, open it and choose **Update inventory**. Attach any new photos via **Choose from album**, set their roles (for example Spread), and select **Include in AI analysis** on one to six current or newly attached photos. New attachments start selected; existing photos can be selected too. Choose **Analyze selected photos**, confirm the destination/roles, then **Analyze photos together**. The current editor name, contents description and keywords accompany the selected photos as context. The model is instructed to preserve useful prior contents and flag contradictions; an item missing from a close-up is not evidence of removal. Review the current description beside the complete proposal. **Apply suggestion to open editor** replaces the draft description/keywords and selected-photo interpretations; the box name changes only if explicitly selected (or previously empty). Location, box ID, manual notes and unselected photos remain intact. Edit the resulting fields and choose **Save inventory session** to persist a new historical session. Analysis and applying a suggestion do not save inventory. Changes by another client invalidate a stale analysis/save. Current photos can be analyzed even if removed from the source album; new attachments still require album membership.

Public `/api/public/ask` already phrases the top lexical matches with the image task's AI route/fallback, returning `source: "ai"` or the local `source: "search"` fallback. It does not use the semantic preview or its stricter selection policy. Translation drafting remains planned. Local search and manual inventory work without AI. See [AI design](docs/AI-DESIGN.md) for the wider direction.

## Docker and Portainer

```powershell
$env:STORAGE_ADMIN_KEY = 'development-preview'
$env:STORAGE_API_KEY = 'development-readonly'
docker compose up -d --build
```

The development stack binds only `127.0.0.1:3210`. Its named volume is independent of the existing application. Tests run in the image build before the runtime image is produced. Change `STORAGE_PORT` and `APP_BASE_URL` together if changing the published port. Use `docker compose stop` to stop the preview while retaining data.

For Portainer, use the published `mrsnille/storagesystem-base` image and [compose.portainer.yaml](compose.portainer.yaml). Pin `STORAGE_IMAGE` to a released tag or digest, configure real access settings, and set `APP_BASE_URL` to a URL reachable by HA and browsers. Production installation and updates through 0.29.0 are verified. Follow [Deployment](docs/DEPLOYMENT.md) for fresh install, release, backup and rollback. Put the database volume on local storage, never SMB/NFS.

Do not use the disposable keys above for real data or network exposure. The application is a single-instance service. A reverse proxy should provide HTTPS for network use.

## Checks

```powershell
npm run check
docker build -t storagesystem-base:local .
.\scripts\verify-container.ps1
```

`npm run check` checks JavaScript syntax, runs isolated database/HTTP tests, and checks Git whitespace. `verify-container.ps1` creates a uniquely named test container and volume, verifies writes, restart persistence, backup, restore and MCP, and removes only those test resources. [Verification](docs/VERIFICATION.md) describes active HA client verification and remaining acceptance work.

## Data operations

All commands below use `STORAGE_DB`. Import requires an empty database, validates all records before committing, preserves legacy IDs and record fields, and never changes the source files.

```powershell
$env:STORAGE_DB = './data/migration-test.sqlite'
npm run inventory -- import /path/to/inventory.json /path/to/app-settings.json
npm run audit:data
npm run inventory -- export ./inventory-export.json
npm run inventory -- backup ./storage-backup.sqlite
npm run inventory -- restore ./storage-backup.sqlite ./data/restored.sqlite
```

Restore validates the backup and refuses to overwrite an existing file. Stop the target instance and point it at the newly restored database after verification. Audit the new file by setting `STORAGE_DB` to its path. A backup contains inventory **and settings/credentials**; keep it private. JSON export contains inventory only. Neither includes original photos from external services. Settings import retains provider configuration, prompts, label templates and other existing sections without claiming their features are implemented. Separate legacy language files are not imported yet.

The UI offers inventory JSON import/export, data audit, SQLite backup download and a controlled full restore under **Security → Data & maintenance**. A restore uploads the backup, checks it (only this application's schemas 1-4, older ones are migrated, the audit must pass) and shows the current and backup totals. Only after you type `RESTORE` does it replace all inventory, settings, keys and the background image in one transaction. The current database is saved first in `restore-backups` beside the database file (`/data/restore-backups` in Docker); remove old safety backups there yourself. The offline CLI restore into a new file still works.

## Documentation

- [Current status](docs/STATUS.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Remaining work](TODO.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Compatibility](docs/COMPATIBILITY.md)
- [Verification](docs/VERIFICATION.md)
- [History](docs/HISTORY.md)
- [License](LICENSE)

## Isolated Home Assistant acceptance

Run `./scripts/verify-ha-container.ps1` after building the application image. It starts real HA 2026.10.2 and a synthetic application on a unique Docker network, mounts the existing integration read-only, verifies its config flow, entities, services, events, conversation, card delivery and signed images, then removes its own containers/network/config volume. Discovery and TTS are disabled. Loopback ports 3215/3216 must be free. `-Hold` keeps the disposable runtime available for browser review; it does not connect to the production HA or inventory.

Excel catalog import/export is retired from scope (2026-10-20): the historical one-time label import is no longer needed.

## Label printing

All printing uses the separate [label-service](https://github.com/Snille/label-service).
**Printing** in the header configures its connection and standard/additional templates
per label type. **Print label** on a box, **Print location label** and **Print storage
unit label** on the map open a separate dialog with the service's preview and template
buttons. Edit just the label text there. A box remembers its non-standard template.
Direction is defined by the template, not a setting in this app. Test prints, roll
reading, media and printer administration belong to the service.

Save the connection/client key in the UI or set `LABEL_SERVICE_URL` and
`LABEL_SERVICE_KEY`. Physical box-label output through the service has owner acceptance;
current location/unit templates still need their own physical check when used.
See [Printing](docs/PRINTING.md) for API, deduplication and acceptance boundaries.

## Overview and storage-unit photos

The album cover supplies the panoramic overview with clickable points that open a
storage unit on the map. Edit points to place, drag or turn them together. Point sets
are saved per image; a new cover can inherit the latest saved set before its first edit.

On the storage map **Choose photo** assigns an album image to that unit, and clicking
it opens the photo viewer. In 0.29.0, Change/Remove controls sit below the title
and the uncropped photo uses up to 400 x 220 px: landscape images can be wider than
portraits. On narrow screens the image moves below the heading and controls. Unit photos count as assigned in the album inbox and cannot
also be newly attached to a box. The photo remains in the external service; settings
store its asset ID. The album cover is kept out of ordinary new photo selection.
