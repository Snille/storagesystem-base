# Moving Storage System to Portainer

Plan written 2026-10-24. Nothing in this plan has been carried out yet. Steps marked
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
