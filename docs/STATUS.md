# Current status

Reviewed 2026-10-30 against source and live production. Version **0.30.0** is
published and deployed to Portainer, with ordinary semantic search enabled.
VERSION owns the source version; TODO contains outstanding work. History preserves
release evidence and Deployment describes update/backup/rollback procedures.

## Latest verification (0.30.0)

| Check | Result |
| --- | --- |
| LAN/public health | 0.30.0 on LAN, verkstad.snille.net and hylla.snille.net |
| Main audit | Pass, schema 4; 166 boxes, 256 sessions, 320 historical photo references, 166 registered positions |
| Shared semantic index | 166/166 current vectors, cache audit passes |
| Owner cases | 14/14 on web, REST, ask and MCP: 56 live checks |
| Absence/clarification | Both absent objects refused; exact saved cable question and three intended candidate locations |
| Model-only smoke | English knee-pad query verified at the right place (1327 ms); thermal-camera substitution refused (1756 ms) |
| Automated checks | npm run check and all 126 tests pass; same 126 pass in pinned Node 24.14 image build |
| Actual HA client | HTTP search/ask/box, auth classification and result mapping pass against isolated server |
| Image/container | Non-root persistence, restart, audit, backup/fresh restore and MCP pass |
| Data preservation | Six inventory/media/old-journal tables and every non-search settings row have unchanged hashes |
| Public guards/media | Missing read key 401; unlisted Host 403; signed WebP thumbnail 200; box-label preview printable |

The release image is `mrsnille/storagesystem-base:0.30.0` / `:latest`, linux/amd64,
built from `08dc1645894057f5cba5a3595c140d4e0345fa04`, digest
`sha256:6f781b1b039a733daa6fa0bae5ad8eff9faf10fe034d4d308ca2aba85270a494`.
Portainer stack 13, endpoint 2 retained Compose and the other seven environment
values. Only searchWorkspace settings changed: five old rules preserved, one
network trigger updated and four new rules (ten total). No inventory writes.
Pre/post backups and reports remain private in the canonical backup directory.
These are scoped owner/configuration checks, not general unseen accuracy claims.

## Search behavior

Browser, REST/HA and MCP use the same supported selections and short deterministic
location answers. Single words work; owner rules may select one preferred box,
return two places, accept alternatives or ask a short saved clarification.
BGE-M3 (`bge-m3:cpu4`, native digest pinned) retrieves candidates on Ollama01;
Qwen `qwen3-vl:8b-instruct-16k` verifies semantic-only identity within 15 s.
Direct current evidence bypasses identity inference. Scores alone never authorize
an answer; missing/stale/busy/unavailable embeddings use current text/rules.
Reanalysis updates the separate current-content/session-bound cache automatically.
Old descriptions cannot keep authorizing answers. Exact filename lookup still
locates the current box, including references retained from older sessions.

Semantic mode is separately switchable under Search & answers → Embedding model.
Turning it off restores lexical selection and the legacy AI-phrasing path. Image
analysis continues to use the saved Luna/OmniRoute connection with Ollama fallback.
The shared SQLite search log records final answers and historical match snapshots.

## Available application and operations

Inventory/manual and AI-assisted sessions, album workflow, current/history photos,
occupancy guards, storage map/unit photos, panorama points, English/Swedish UI,
appearance/security, validated import/export and SQLite backup/restore remain
available. Printing is handled by the separate label-service. Immich is live-tested;
PhotoPrism is fixture-tested only. IDs and existing HA/public credentials are preserved.

The app runs at 10.0.0.25:3210 with volume storagesystem_app-data; public names route
through the existing proxy. Management is open on the trusted LAN with external
Authelia; public API/MCP authentication stays independent. The old installation is
retained as a rollback source, with later inventory reconciliation required.

## Next

- Test real button/Whisper/Piper/speaker behavior using the new supported answers.
- Accept the clarification reply on the real satellite. The app (unreleased) and
  storagesystem-ha 1.0.8 (not deployed) keep the question per device for 120 s;
  satellite firmware 1.8.0 (not flashed) listens again after a spoken question.
- Continue fresh acceptance after reanalysis; the frozen cases are regression data.
- Verify external authentication, automatic backup schedule/retention and physical
  location/unit printing separately. See TODO for compatibility/optional work.

## Next-session handover (2026-10-30)

Erik plans hands-on workshop testing before continuing. Start with his results,
then inspect Search & answers → Search log, filtering API / Home Assistant and
the relevant search text/time. The journal contains received STT text, not audio
or intended speech. Separate a mishearing from retrieval, selection and spoken
output problems. Preserve the raw query; automatic STT repair remains deferred.

The saved cable clarification is deliberately different from the two-place
network-cable answer. A later yes/no reply has no retained question context yet.
If implementing that next, inspect the actual HA conversation/API reference first;
bound lifetime and device/conversation isolation, and retain button activation for
each reply. Do not turn a bare yes/no into an inventory lookup or a global alias.

Reanalysis should use ordinary reviewed session saves. The index follows current
sessions/content automatically; do not change identifiers, manually rewrite vectors
or reuse retired descriptions. The ten owner rules remain editable settings, not
hardcoded destinations. Keep the original frozen cases as regression evidence;
record a new snapshot/expected result when legitimate inventory changes invalidate
an old expectation. Read/write private JSON explicitly as UTF-8.

Private inputs/reports are in the canonical secret store under
`storagesystem-base/database-backups/owner-search-20261029T225316Z`:
`questions-v2.json` (14 cases), `release-config.json` (redacted ten-rule input),
`release-acceptance/report.json` and supplementary reports. Deployment snapshots,
stack records, check/build/push logs and live/data-preservation reports are under
`release-0.30.0-20261030`. Backups contain credentials; keep these outside Git.

The local UI test process and one-off Docker containers are stopped. Automatic
approval review refused recursive removal of the owned local build/test folders;
the ignored `data/ha-client-check/.venv` and temporary build tree were preserved.
`data/release-0.30.0-build.json` records the build path. The test Python can be reused
for the real HA client check if still present. Active unrelated Docker containers,
named volumes, rollback images and private evidence were preserved. Cleanup is
optional and must not block workshop testing or trigger production changes.

Behavioral rollback is the ordinary-semantic switch. An image-only downgrade is
not an audited rollback because older validators do not understand the new saved
configuration and semantic journal source. Preserve/reconcile data before restoring
an older compatible backup/image pair.
