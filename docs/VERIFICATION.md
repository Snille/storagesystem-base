# Verification and acceptance

Reviewed 2026-10-29 for 0.28.0. This page separates current checks, recorded live
acceptance and outstanding work. Historical release details are in [History](HISTORY.md)
and the [migration record](archive/PORTAINER-MIGRATION-2026-10.md).

## Current verification

On 2026-10-29 an initial `npm run check` passed all 110 tests on Windows Node
26.12.1. Two later parallel runs hit `EADDRINUSE` in the existing open-management
security test, which binds a second server to the first server's port plus one.
The full suite then passed 110/110 with `node --test --test-concurrency=1
--test-timeout=20000`; syntax and Git whitespace checks also pass. No application
or test code was changed for this documentation maintenance. LAN and public `/healthz` returned 0.28.0.
The production schema-3 audit passed with 166 boxes, 256 sessions, 320 historical/
current photo references and 166 registered locations. The map returned 19 units.
Semantic indexing was disabled. Box/location/unit landscape and portrait templates
were listed and configured at the live label service.

Only read-only production requests were made for this review. No AI inference,
print submission, inventory change, service restart, Docker build or physical HA
test was performed. A health check is not proof of those paths.

## Offline checks

```powershell
npm run check
```

`scripts/check.js` checks JavaScript syntax under src/scripts/test/web, runs Node's
isolated test runner and checks Git whitespace. Tests use synthetic in-memory data
or unique temporary directories. They do not call live AI, photo or printer services.
The Docker test stage runs the same suite with pinned Node 24.14.

If the existing adjacent-port test collides under parallel execution, run the full
suite serially to distinguish that harness issue from a behavior failure:

```powershell
node --test --test-concurrency=1 --test-timeout=20000
git diff --check
```

The port-allocation assumption remains a test-harness follow-up; serial success
does not fix it. Syntax is checked by `npm run check` before its test phase.

Coverage includes ID/history-preserving import/export/backup/restore; schema 1→2→3
migrations; relationship/shape/integrity checks; atomic session writes and occupancy;
management/public authorization, open-mode host/origin restrictions and key privacy;
REST/MCP contracts and shared search; photo assignment, previews, source revisions,
unit photos and cover choices; AI drafts/updates/fallback/answer phrasing; language
catalog coverage; template-driven printing and stale/deduplicated submission;
semantic cache, native adapter, answer rules and identity-verification guards.

## Containers and database restoration

```powershell
docker build -t storagesystem-base:local .
.\scripts\verify-container.ps1
```

The harness uses a uniquely named temporary container/volume and random loopback
port. It checks writes, restart persistence, audit, consistent backup, fresh-file
restore and MCP, then removes only its own resources. `-Image` selects another
image. The runtime is non-root; `/healthz` also queries SQLite.

Recorded release verification through 0.28.0 includes real Portainer updates and
isolated restoration of production backup copies. Do not repeat the obsolete claim
that no schema upgrade or Portainer deployment has been tested. Each future schema
still needs fixtures from every supported earlier version and a backup-copy rehearsal.
See [Deployment](DEPLOYMENT.md) for the release procedure. Do not test against the
production volume or assume a successful start proves integration behavior.

## Browser acceptance

```powershell
node scripts/browser-fixture.js
```

The fixture serves synthetic in-memory inventory/photo/AI responses at localhost:3212
with disposable management key `ui-fixture-admin`; it does not use a real photo server
or printer. Use its canonical URL for Origin checks and stop with Ctrl+C.

Recorded browser checks include editor/history and album workflow, multi-photo
review/apply/save, cover/photo viewing and zoom, location occupancy, language and
appearance settings, search rules, backup restore, panorama points, editable AI/photo
descriptions, and the template-based label dialogs. These records describe the
versions tested; no claim is made that every browser/device has been accepted.

## Live Immich and AI checks

Recreate a separate development instance and configure its test album first. The
old Docker Desktop development stack no longer exists. Supply credentials through
the environment/private env file and never print values. For example:

```powershell
node --env-file=/path/to/private.env scripts/verify-immich.js --base-url http://localhost:3210
node --env-file=/path/to/private.env scripts/verify-ai.js --base-url http://localhost:3210
```

Immich acceptance requires `IMMICH_API_KEY` and the development `STORAGE_ADMIN_KEY`.
`--container` optionally checks the key against a named development container using
MATCH/DIFFERENT only. It reads the configured album and uses a fresh in-memory app
for the inventory/REST/MCP round trip. It never edits the photo service.

AI acceptance also requires `AI_TEST_MODEL` and provider credentials:
`OPENROUTER_API_KEY`, or `AI_BASE_URL`/optional `AI_API_KEY` with `--provider compatible`
or `--provider llamacpp`. This makes real inference requests; use an authorized test
album/provider and account for possible cost. `--asset-index` chooses a photo;
`--box-draft` and `AI_TEST_PHOTOS` select a combined draft. `--hold` retains an isolated
browser instance at the printed URL. `--configure-development` explicitly writes the
tested AI setup to the supplied instance; use it only for an intended development
configuration change, never as part of a read-only check.

Recorded acceptance includes Immich album discovery, previews, session save and
signed REST/MCP images; OpenRouter and Spark image analysis; multi-photo new-box
review/save and existing-box updates. Later 15-box comparisons covered Spark,
OpenRouter, Ollama01, Luna and Haiku, including OCR/role/keyword/failure/cost limits.
The owner chose Luna with Ollama01 fallback; see History 0.15.2/0.21/0.22. These are
measured examples, not proof of correct recognition for every inventory image.
PhotoPrism remains synthetic-fixture-tested only.

## Home Assistant

```powershell
.\scripts\verify-ha-container.ps1
```

After building `storagesystem-base:local`, this harness starts pinned real HA
2026.10.2 and a synthetic application on a unique network. It mounts the sibling
`storagesystem-ha` integration read-only, checks config flow, entities, services,
result events, conversation, persistence, bundled card delivery and signed images,
then removes its own resources. Ports 3215/3216 must be free. `-IntegrationSource`
changes the source path; `-Hold` keeps the runtime for browser review. Discovery and
TTS are disabled; it does not connect to production HA/inventory.

The actual Lovelace card was browser-accepted with a Swedish query, RC synonym,
no-result clearing and thumbnails. The real Python API/client mapper was also
checked separately using `scripts/verify-ha-client.py` with aiohttp, a synthetic
instance and a read-only sibling checkout. That client-only test does not replace
the real-HA harness or physical button/STT/Piper/announcement acceptance.

## Semantic and printing evidence

[Semantic evaluation](SEMANTIC-EVALUATION.md) preserves frozen datasets, failed
runs and reproduction/audit commands. Retrieval accuracy and revised 30/30 policy
regression are not fresh independent decision acceptance. The management preview
is optional, public semantic search is not active, and identity verification is
not attached to the runtime preview. See [Semantic runtime](SEMANTIC-RUNTIME.md).

[Printing](PRINTING.md) records owner-accepted 5XL formats and the real box label
printed from this app through label-service. Queue completion, available templates
and a correct preview do not establish physical quality of later location/unit
layouts. Driver/media/designer work belongs in label-service.

## Still unverified

- Real external-network Authelia flow and physical HA speech/announcement quality.
- Fresh independent semantic selection/abstention acceptance and the authenticated
  native embedding route from production; verifier/threshold integration.
- Real PhotoPrism, full legacy language overrides and remaining ranking/language parity.
- Physical current location/unit templates from this app, when needed.
- Automatic production backup schedule/retention and old-system consumer retirement.

The exact action list lives in [TODO](../TODO.md). Historical test counts and failed
experiments in History/evaluation records describe those dates, not today's suite.
