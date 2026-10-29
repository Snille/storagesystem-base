# Current status

Reviewed 2026-10-29 against the source and live production. Source:
**0.30.0-dev** (see [VERSION](../VERSION)); production: **0.29.0** in Portainer. This app
has been production since 2026-10-25. Use [TODO](../TODO.md) for outstanding actions,
[Deployment](DEPLOYMENT.md) for operations and [History](HISTORY.md) for releases.

## Prepared next: 0.30.0-dev (not deployed)

- Management preview now connects the optional identity verifier, with saved,
  redacted independent credentials, explicit similarity/margin and timeout settings.
  It rejects configuration/content races, including changes to ranking competitors.
  Verification and thresholds remain unset/disabled unless explicitly configured.
- Ollama01's authenticated native tags/embed routes were added and verified from
  the actual production application container. Only the Storage System key gains
  these routes; Mimers Brain's existing compatible embeddings still work.
- On an isolated read-only production-backup import, all 166 boxes indexed in
  16.1 s. Seven development queries completed with semantic retrieval; two English
  knee-pad queries selected Knäskydd through verification (10.7 s first, 1.4 s next).
  Thermal-camera substitution was refused. `mat enhet` still has no supported match;
  transcription repair is not implemented. These are functional/regression results,
  not independent acceptance or calibrated production thresholds.
- Fresh owner-labelled questions are deferred at the owner's request until more
  hands-on voice testing. Public browser/REST/MCP/HA search remains unchanged and
  production still has embeddings disabled. No app deployment occurred in this work.
- All 121 tests pass serially on Windows and pinned Node 24.14 Docker; syntax and
  language checks pass. The existing parallel security-test port collision remains.

## Latest production verification: 0.29.0, 2026-10-29

| Check | Result |
| --- | --- |
| LAN and public `/healthz` | Healthy, 0.29.0 |
| Production integrity audit | Pass, schema 4, no errors |
| Inventory | 166 boxes, 256 sessions, 320 photo references across history, 166 registered locations |
| Storage map | 19 storage units; larger uncropped photo verified live on shelving unit E |
| Shared search log | Web/API/MCP requests recorded and visible in Search & answers → Search log |
| Search compatibility | Public REST and MCP return the same tested box order |
| Photos/printing | Live thumbnail 200; box label preview printable, no physical print submitted |
| API guards | Public read without key 401; unlisted API Host 403 |
| Semantic preview | Disabled (`enabled: false`) |
| Automated checks | 116 pass serially on Windows and in pinned Node 24.14 Docker; syntax/catalog/whitespace pass |
| Backup/migration | Private production copy migrated 3→4; inventory/settings/positions/old journal/background preserved; log survives backup/restore |

The image was built from release commit `7b51415`, published as
`mrsnille/storagesystem-base:0.29.0` and `:latest`, digest
`sha256:7401c56980218f03c99a90e23d48c1f0efdf78b4068569c11da9233f84d69121`.
Only stack 13's `STORAGE_IMAGE` changed; the other seven environment values and
Compose content were preserved. Pre/post-update backups are private. Counts are
a dated observation, not constants. Test searches created log entries but no
inventory edits. Real Assist/physical printing were not replayed for this update;
the owner reports that voice searches generally work, with transcription errors.

The old Windows adjacent-port test can still fail during parallel `npm run check`;
the full serial suite and pinned Docker suite pass. See [Verification](VERIFICATION.md).

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
  In production 0.29.0 the identity verifier remains an isolated evaluation path;
  source 0.30.0-dev connects it to the management preview as described above.

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
