# Storage System Base

A fresh implementation of [Storage System](https://github.com/Snille/storagesystem), designed for Docker and Portainer, with SQLite storage.

## Status

For the next development session, start with [current state and continuation notes](docs/STATUS.md) and [the prioritized backlog](TODO.md).

A runnable development preview is available. The version is defined only in [VERSION](VERSION).

Implemented: manual box inventory with session history; photo source settings and an album inbox; a shared inventory service for the browser, REST and MCP; SQLite storage and schema migration; validated legacy inventory/settings import into an empty database; inventory JSON export; consistent SQLite backup and restore to a new database; data integrity audit; and a non-root Docker image with local Compose and a Portainer stack template.

This is **not a production replacement**. AI connections, single-photo tests and multi-photo new-box drafts with explicit review/edit/save are available. AI answer phrasing, full settings/translation editing, spreadsheet catalog migration, label design and printing remain planned. The Immich album-to-inventory flow is verified live with a dedicated account, including browser selection/save, REST and MCP image retrieval, using an isolated in-memory inventory. Single-photo AI is verified live through OpenRouter and Spark llama.cpp. PhotoPrism remains fixture-tested only. REST/MCP shape compatibility is tested; full legacy search and language parity and a running Home Assistant installation still require acceptance testing. See [Compatibility](docs/COMPATIBILITY.md) and [Verification](docs/VERIFICATION.md).

The existing application is the functional reference. This repository has independent Git history and is not a GitHub fork. The existing installation remains the production system while this implementation is developed and verified separately.

## Intended capabilities

- Inventory boxes, storage locations, inventory sessions, photo references, and history.
- Read album photos from Immich or PhotoPrism.
- AI-assisted inventory and search.
- SQLite storage with transactions, schema migrations, and integrity checks.
- Downloadable backup and restore, readable JSON export, and migration from the existing JSON files.
- Compatible public REST API for the existing [Home Assistant integration](https://github.com/Snille/storagesystem-ha).
- Read-only MCP tools compatible with the existing application.
- Label design and general printing through CUPS, with optional printer-specific capabilities such as DYMO roll status.
- A prebuilt application image and Compose stack suitable for Portainer; optional CUPS service or connection to an existing print server.

## Run locally

Requires Node.js 24.14 or newer (the Docker runtime pins Node 24.14). No npm install or build step is needed: there are no external runtime dependencies.

PowerShell, for a **loopback-only development preview with disposable credentials**:

```powershell
$env:STORAGE_ADMIN_KEY = 'development-preview'
$env:STORAGE_API_KEY = 'development-readonly'
npm start
```

Open [localhost:3210](http://localhost:3210) and enter the management key. The first start creates an empty database under `data/`. Each box save creates a new inventory session. Existing sessions and photo references remain in history. The UI is English; public location labels and local answers support English, Swedish and German. Theme follows the operating system and can be switched for the current tab.

Configuration:

| Variable | Purpose |
| --- | --- |
| `STORAGE_DB` | Database file; default `./data/storage.sqlite`, `/data/storage.sqlite` in Docker |
| `HOST` | Default `127.0.0.1`, `0.0.0.0` inside Docker |
| `PORT` | Application port, default `3210` |
| `STORAGE_ADMIN_KEY` | Separate key for browser management, imports, exports and backups; management is disabled when empty |
| `STORAGE_API_KEY` | Public read API/MCP key; empty permits unauthenticated public reads, matching the legacy behavior |
| `APP_BASE_URL` | Externally reachable base URL used for image links; required for HA outside the same origin |

The imported `security.publicApiKey` takes precedence over `STORAGE_API_KEY`. The legacy `LAGERSYSTEM_API_KEY` environment fallback is also accepted. `APP_BASE_URL` takes precedence over the imported base URL. A different management key is recommended; the read API key must not authorize writes.

## Photo setup and album workflow

After opening the inventory, choose **Photo settings**. Enter the Immich or PhotoPrism server URL (without `/api`), the access mode and a read-only key/token. **Save & load albums**, choose an album, then **Save settings**. API keys are stored in the runtime database but are never returned by the settings endpoint. Blank key fields retain existing credentials; clearing requires an explicit checkbox. Changing server/provider/access mode clears credentials. Existing photo references prevent switching to a different server/provider, because legacy asset IDs do not identify their originating server.

For Immich, use a dedicated service account with a key granting `album.read`, `asset.read`, `asset.view` and `asset.download`. Its album must be accessible to that account; when another user owns it, share it with the service account as a viewer. A public shared link is not required for API-key mode. Immich shared-link mode is also supported using its key. PhotoPrism uses a Bearer access token.

Open **Album inbox**, select images, and use them in a new box, or choose **Choose from album** while editing an existing box. Assign each image a role before saving. The inbox hides assigned photos by default. Removing a photo from the draft only changes the next session; earlier sessions and original images stay intact. Existing associations can be retained without contacting the photo service, but new attachments are checked against the current album before saving.

Album preview links expire after 15 minutes or a server/settings change; refresh the inbox to renew them. The catalog supports up to 20000 images with bounded pagination. Video entries are excluded. Manual inventory and AI draft review use the same final session save.

## Box photos and card images

Box details show complete preview images in their original proportions. Inventory history is collapsed initially; expand its heading to inspect earlier sessions. In the photo viewer, use **+ / −** to zoom, **Actual size · 100%** to inspect original pixels and **Fit image** to return to the fitted view. Click a detail in a fitted image to zoom in at that point, then hold and drag to explore. Toolbar zoom keeps the viewport's center detail in place. Clicking a zoomed image keeps its zoom; use Fit image or switch photos to reset. Each photo starts fitted.

Box cards show a photo from the current inventory session. Automatic selection prefers Inside, then Spread, Detail, Label and Storage location; this retains the reference application's preference for an inside photo. Open a box and select a photo to view it inside the app. **Previous/Next** and the left/right arrow keys cycle through the box's current images. **Esc** closes the viewer and returns to the box; photos do not open new tabs.

In the viewer, **Use as card image** saves the displayed image as the box's cover. **Automatic card image** restores the default selection. This changes only cover metadata, without creating an inventory session or editing the original photo. If the chosen image is removed from a later current session, the card falls back automatically; earlier session photos remain intact. Boxes without photos retain the placeholder.

## AI assistance

Choose **AI assistance** for an overview, **Connections** for service addresses/keys, and **Image inventory** for the model, output language and optional extra instructions. Start with one named connection. OpenRouter uses its fixed API base; llama.cpp and OpenAI-compatible services use their configured API base, including `/v1` when required. Select **llama.cpp (local)** for that server: inventory requests disable its template thinking phase so the output budget is used for the description. Other compatible services receive no llama.cpp-specific options. Other provider protocols are not implemented. Changing connection identity clears its key; a blank key otherwise retains the saved value. Legacy AI settings remain preserved but are not automatically activated.

**Test saved connection & list models** checks the saved endpoint/model catalog (and OpenRouter key authentication). It does not confirm image capability. Choose an image model once per task, through the model suggestions or an exact ID, and save. **Advanced instructions** adds task-specific preferences; changing models does not silently change them. Read the built-in instructions there.

Under **Try a photo**, load the configured album, select one image and optionally assign its role. The disclosure names the destination/model before **Analyze selected photo** sends its preview image. Immich analysis uses the larger `preview` rendition (verified as JPEG on the live source), with an 8 MiB limit, while the album grid keeps small thumbnails. PhotoPrism still uses its existing preview tile. JPEG, PNG and WebP are accepted by the app, but compatible servers may support fewer formats. It returns a suggested label, description, keywords, role and uncertainty; inspect these against the photo. No inventory is saved. Only explicit analysis actions send photos to AI, and paid services may charge. There are no automatic retries. One analysis runs at a time per process, with a 90-second AI timeout. Configuration changes invalidate pending results.

### Create a box from several photos

In **Album inbox**, select one to six unassigned photos of the same box, then choose **Create AI draft**. Set each role: Label, Inside a box, Spread-out contents, Storage location or Detail; automatic suggestions are optional. The disclosure identifies the saved image connection/model and the number of photos before **Analyze photos together** sends them in one request. Manual roles are preserved. The model combines complementary views, avoids counting repeated views as different items and reports uncertain or conflicting observations. These instructions guide the model; they do not guarantee identification or quantity accuracy.

Review the combined label, description, keywords and uncertainty, and expand each photo's interpretation if useful. **Review & edit in box form** transfers the suggestion and photos into the ordinary new-box editor without saving. Correct the text, review uncertainty notes and roles, and enter the box ID and location ID yourself. Only **Save inventory session** creates the box/session. An existing box ID is rejected for this new-box workflow. AI assistance for updating an existing box remains future work; use its manual Update inventory flow meanwhile.

Total preview image data is limited to 16 MiB per analysis, in addition to the 8 MiB per-image bound. Photos and source configuration are revalidated when attaching them on final save. No inventory writes occur during analysis or transfer to the editor. Closing the editor discards the unsaved form.

AI answer phrasing and translation drafting remain planned. Local search and manual inventory work without AI. See [AI design](docs/AI-DESIGN.md) for the wider direction.

## Docker and Portainer

```powershell
$env:STORAGE_ADMIN_KEY = 'development-preview'
$env:STORAGE_API_KEY = 'development-readonly'
docker compose up -d --build
```

The development stack binds only `127.0.0.1:3210`. Its named volume is independent of the existing application. Tests run in the image build before the runtime image is produced. Change `STORAGE_PORT` and `APP_BASE_URL` together if changing the published port. Use `docker compose stop` to stop the preview while retaining data.

For Portainer, build and publish this image to your own registry, then use [compose.portainer.yaml](compose.portainer.yaml). Set `STORAGE_IMAGE` to an immutable published tag or digest, set distinct non-development keys, and set `APP_BASE_URL` to a URL reachable by HA and browsers. No registry image has been published by this project yet. The stack template is not a tested production deployment. Put the database volume on local storage, never SMB/NFS.

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

The UI offers inventory JSON import/export, data audit and SQLite backup download. Full SQLite restore currently uses the offline CLI; it is intentionally unavailable as an overwrite action in the UI.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Compatibility](docs/COMPATIBILITY.md)
- [Verification](docs/VERIFICATION.md)
- [History](docs/HISTORY.md)
- [License](LICENSE)
