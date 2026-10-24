# Moving Storage System to Portainer

Plan written 2026-10-24. Parts A, B and C were carried out on 2026-10-24 (see
[Results](#results-2026-10-24-parts-a-c)); part D has not started. Steps marked
**Approval** change something outside this repository and wait for the owner's yes.

## Starting point

| Part | Now | After the move |
| --- | --- | --- |
| Application | Old Storage System v1.6.1 on `hyllsystem-live` (10.0.0.33:3000) | This application as Portainer stack `storagesystem` on 10.0.0.25:3210 |
| Public address | `verkstad.snille.net` through Nginx Proxy Manager (10.0.0.7) with Authelia; `/api/mcp` and OAuth well-known paths are excepted | Same address, new backend |
| Data | JSON files under `/opt/lagersystem/data` | SQLite volume, schema 3 |
| Photos | Immich album (unchanged) | Same album, same read-only key |
| Printing | Old system's own CUPS | Label service, stack 12 (10.0.0.25:3230) |
| Image AI | OpenRouter `qwen/qwen3-vl-8b-instruct` | OmniRoute `cx/gpt-6-luna`, fallback Ollama01 `qwen3-vl:8b-instruct-16k` |
| Home Assistant | `storagesystem-ha` against the public address | Unchanged, if the public API key stays the same |

Checked on 2026-10-24: port 3210 is free on Portainer (stacks: immich, avatar-studio,
proxmox-notes, label-service); Docker Hub has no `mrsnille/storagesystem-base` repository yet.

## A. Preparation (local only)

1. Decide the release version (for example `0.22.0` or `1.0.0`), set `VERSION`, run `npm run check`.
2. Build the image locally and run the suite inside the build; check that the image contains no
   `data/`, keys or inventory (`.dockerignore` already limits it to `src`, `web`, `test`, `package.json`, `VERSION`).
3. Create a new management key for production and store it in
   `C:\Users\eripet\Coding\_secrets_\storagesystem-base\secrets.env` (never in the repository).

## B. Publish and start an empty instance

4. **Approval:** push `mrsnille/storagesystem-base:<version>` and `:latest` to Docker Hub. The
   repository will be public like the label service images; it contains code only.
5. **Approval:** create Portainer stack `storagesystem` from `compose.portainer.yaml` with
   `STORAGE_IMAGE`, the new `STORAGE_ADMIN_KEY`, `STORAGE_API_KEY`, `APP_BASE_URL=http://10.0.0.25:3210`
   and a named volume. It starts with an empty database and does not touch the old system.
6. Check: `/healthz`, sign-in, and from inside the stack that OmniRoute (`omni.snille.net:20128`, or
   10.0.0.42 if the name does not resolve there), Ollama01 (10.0.0.47:11434), Immich and the label
   service answer. Label preview only, no printing.

## C. Rehearse the data move

7. Copy the old system's data read-only from `hyllsystem-live` (no change or restart there).
8. Build the move database locally: legacy import of inventory and settings into an empty
   SQLite file (keeps box, session and photo identifiers and the public API key), then add the
   settings made in the development copy: AI connections and fallback, label service, appearance and
   background image, overview points. Run the audit.
9. Restore that file into the Portainer instance with **Data & maintenance → Restore**
   (checked upload, typed `RESTORE`).
10. Check against the old system: box, session and photo counts, a few searches, photos, MCP tools,
    a print preview and one AI draft. Keep the rehearsal running for review.

## Gate before the switch: voice answers

Home Assistant's voice flow asks `POST /api/public/ask` through the same public address. The old
system phrases that answer with AI (`source: "ai"`, separate prompts for voice and public use) and
falls back to a local answer. This application currently answers with a local template only and may
list several boxes, so voice answers would get worse at the switch. Decide before step 11 whether
spoken answers must match or improve first (see VOICE-SEARCH.md and ANSWER-POLICY.md).

Owner decision: switch only when voice answers are at least as good. Status 2026-10-24: `/ask` now
phrases answers with AI like the old system and named the expected place in 32 of 43 reviewed
questions against the old system's 30 (see HISTORY). The gate is met on the measured questions; the
owner confirms by listening through Home Assistant after the rehearsal.

## D. Switch over

11. **Owner decides the time.** Stop editing in the old system, take a final read-only copy and
    repeat steps 7-9 so no change made after the rehearsal is lost.
12. **Approval (owner changes it in NPM):** point `verkstad.snille.net` to 10.0.0.25:3210 and keep
    Authelia with the same exceptions for `/api/mcp` and the OAuth well-known paths. Set
    `APP_BASE_URL=https://verkstad.snille.net` in the stack and redeploy (photo links for Home
    Assistant and the browser origin check use it).
13. Check through the public address: Home Assistant search and ask with card images, the
    storagesystem MCP tools, the browser.
14. **Rollback:** point the NPM proxy host back to 10.0.0.33:3000. The old system is untouched
    until step E.

## E. Afterwards

15. After a period agreed with the owner: check that nothing else uses the old system or its CUPS,
    then stop it. Not part of this move.

## Open points for the owner

- Release version for the first production image.
- Docker Hub repository public (like the label service) or private.
- Who changes the NPM proxy host in step 12 (normally the owner through the NPM web page).
- The old system's edited translation files are not imported; this application has its own texts.

## Results 2026-10-24 (parts A-C)

Part D was not started: NPM, `verkstad.snille.net` and the old system are unchanged. The old
system was only read (`lagersystem` still active, `inventory.json` still dated 2026-10-20).

### A. Preparation

- Release `0.22.0`. The image was built from a clean export of commit `2cabd05` with `VERSION`
  set to `0.22.0`, so uncommitted work in the checkout was not included. `npm run check` passed
  there (102 tests) and the Docker build ran the suite again.
- `docker buildx build --platform linux/amd64 -t mrsnille/storagesystem-base:0.22.0 -t mrsnille/storagesystem-base:latest`.
  The image holds only `src`, `web`, `package.json` and `VERSION`; `/data` is empty and no
  `.sqlite`, `.env`, settings or inventory files are present.
- A new production management key is stored as `STORAGE_ADMIN_KEY_PROD` beside the other
  Storage System Base secrets (outside the repository).

### B. Publish and empty instance

- Docker Hub `mrsnille/storagesystem-base` (public): `0.22.0` and `latest`, both
  `sha256:4f7b853dc431c471518d90898dab31b9f8912e6a5d5a97fecb0d276f32f1d4e3`.
- Portainer stack `storagesystem` (id 13, endpoint 2) from `compose.portainer.yaml`:
  `STORAGE_IMAGE=mrsnille/storagesystem-base:0.22.0`, `APP_BASE_URL=http://10.0.0.25:3210`,
  the new management key, `STORAGE_API_KEY` = the old system's public API key (so Home Assistant
  keeps its key), `LABEL_SERVICE_URL=http://10.0.0.25:3230` with this system's label client key.
  Named volume `storagesystem_app-data`.
- `/healthz` → `{"ok":true,"version":"0.22.0"}`, container healthy.
- From inside the container: `omni.snille.net` resolves (10.0.0.42); OmniRoute, Ollama01 and the
  label service answer (401 without a key, which proves the network path); Immich `/api/server/ping` 200.

### C. Rehearsal data move

- Copied `/opt/lagersystem/data` (inventory.json, app-settings.json, languages/) with `scp` into
  `data/migration-2026-10-24/` (git-ignored); SHA-256 of both JSON files matches the server.
- Legacy import into an empty `move.sqlite` with the 0.22.0 code: 164 boxes, 249 sessions,
  306 photos. The imported public API key matches the old system's key.
- Added from a copy of the development database: `aiWorkspace`, `labelService`, `overviewPoints`,
  `overviewPointsSource`, `searchWorkspace`; `appearance` merged (imported theme and fonts,
  development background `hills` and interface language, imported language `sv` kept). The
  development database has no `background` media row, so none was copied. The `printing` row was
  not copied. Audit: ok, schema 3, no errors.
- Restored through `POST /api/manage/restore/upload` and `POST /api/manage/restore`: audit ok,
  164 / 249 / 306 / 164 locations. Safety backup of the empty database inside the volume:
  `restore-backups/before-restore-2026-10-24T21-51-40-171Z.sqlite`.

Checks against the restored instance:

| Check | Result |
| --- | --- |
| Box / session / photo counts | 164 / 249 / 306, equal to the old system's `inventory.json` |
| Public search (`skruv`, `lödtenn`, `kabel`, `batteri`) | Sensible boxes, for example `BENCH-2-UNDER-P1-A` Träskruvar, `IVAR-G-H6-P1-A` Lödutrustning |
| Photos | Signed thumbnail 200 `image/webp`, preview 200 `image/jpeg`, links use `http://10.0.0.25:3210` |
| MCP `/api/mcp` with the public key | 5 tools; `search_inventory` returns boxes |
| Label service | Enabled, status idle, DYMO LabelWriter 5XL; one box preview 200. Nothing was printed |
| AI draft (2 photos, not saved) | 200 in 5.3 s via OmniRoute `cx/gpt-6-luna`; fallback set to Ollama01 `qwen3-vl:8b-instruct-16k` |

Notes and open points:

- `searchWorkspace` and `aiWorkspace` came from development, so the instance also lists the
  development connections (`spark`, OpenRouter) and their saved keys. Remove what production
  should not use in **Settings**.
- The legacy `ai` and `translationAi` rows (OpenRouter) were imported unchanged with the old
  system's settings.
- Voice answers (`/api/public/ask`) still use the local template; the gate before part D applies.
- `data/migration-2026-10-24/` holds the old data, `move.sqlite` and the development copy,
  which include keys. Keep it local and delete it after the switch.

Rollback for this stage: nothing outside Portainer changed. To remove the rehearsal, delete stack
`storagesystem` (id 13) and its volume `storagesystem_app-data` in Portainer; the Docker Hub tags
can stay. To redo the rehearsal, restore a new move database the same way; every restore keeps
a safety backup of the replaced database in the volume.
