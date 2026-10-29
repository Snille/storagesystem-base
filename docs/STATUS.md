# Current status

Reviewed 2026-10-29 against the source, release records and read-only production endpoints.
Application version: **0.28.0** (see [VERSION](../VERSION)). This application has been
production since 2026-10-25. Start here for continuation; use [TODO](../TODO.md) for
remaining actions and [Deployment](DEPLOYMENT.md) for operations.

## Verified now

| Check | Result on 2026-10-29 |
| --- | --- |
| LAN and public `/healthz` | Healthy, 0.28.0 |
| Production integrity audit | Pass, schema 3, no errors |
| Inventory | 166 boxes, 256 sessions, 320 photo references across history, 166 registered locations |
| Storage map | 19 storage units |
| Semantic preview | Disabled (`enabled: false`) |
| Label templates | Box, location and storage unit; landscape and portrait choices configured |
| Local checks | 110 tests pass serially on Windows Node 26.12.1; syntax/whitespace pass. Parallel check hit the existing adjacent-port collision; see Verification |

These counts are a dated observation, not a fixture or an expected constant. No
production inventory/settings were changed, no inference or printing was requested,
and no service was restarted for this review. Docker and physical HA/printing
acceptance were not repeated; their earlier evidence is summarized in
[Verification](VERIFICATION.md).

## Available

- Inventory creation/update, current sessions and history; automatic stable box IDs,
  location occupancy guards, registered vacant positions and a storage map.
- Immich album inbox, photo roles, assignment/release, photo viewer and card images.
  Storage units can have album photos; the album cover supplies the panorama overview
  with saved clickable/movable points.
- AI single/multi-photo drafts and existing-box updates with editable suggestions,
  editable photo descriptions and explicit inventory save. Named connections and
  fallback are supported.
- Shared lexical search across browser, REST and five read-only MCP tools.
  `/api/public/ask` phrases candidate-based answers with AI and falls back locally.
- Browser speech recognition where supported. The HA API/client/runtime and card
  have passed isolated acceptance; physical speech is a separate outstanding check.
- English/Swedish interface, independent external/AI response languages, appearance,
  accent/background settings, security settings and UI backup/export/import/restore.
- Printing through label-service, with templates per label type and a remembered
  non-standard box template. This app does not connect to CUPS or the printer.
- Optional management-only semantic indexing, answer rules and decision preview.
  Source-bound identity verification exists as an isolated service/evaluation path;
  the management preview does not wire it into requests.

## Deployment and continuation

Portainer stack `storagesystem` (13, endpoint 2) runs at `10.0.0.25:3210` with volume
`storagesystem_app-data`. `verkstad.snille.net` and `hylla.snille.net` route to it.
Management is open on the trusted LAN, with Authelia intended for outside access;
public API/MCP authentication remains separate. The configured AI route recorded
at deployment is OmniRoute `cx/gpt-6-luna`, fallback Ollama01
`qwen3-vl:8b-instruct-16k`; printing uses `10.0.0.25:3230`.

The former Docker Desktop development stack was removed on 2026-10-25. Recreate
isolated development with an empty temporary database or a private backup copy;
never use production as a test target. Several agents may share the checkout:
review status and stage only the intended files.

Next: independently accept and integrate semantic answers, verify external access
and physical speech, and decide retirement of the old system after dependency checks.
The old `hyllsystem-live` installation is retained as a rollback source according to
the deployment record; its current process state was not rechecked. Existing rollback
data predates subsequent inventory edits and must be reconciled before switching back.

Historical handoffs for 2026-10-23 through 2026-10-25 were consolidated here and in
Deployment, Printing and Verification. Release evidence stays in [History](HISTORY.md)
and the [dated migration record](archive/PORTAINER-MIGRATION-2026-10.md).
