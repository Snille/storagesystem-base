# Deployment and operations

Production: 0.29.0, deployed 2026-10-29; source: 0.30.0-dev, not deployed.
First production cutover: 2026-10-25. Last read-only health/audit
check: 2026-10-29. [VERSION](../VERSION) is authoritative. Historical rollout hashes,
counts and pre-update backup evidence are in the
[dated migration record](archive/PORTAINER-MIGRATION-2026-10.md).

## Existing deployment

| Component | Deployment |
| --- | --- |
| Application | Portainer stack `storagesystem`, ID 13, endpoint 2; `10.0.0.25:3210` |
| Image | `mrsnille/storagesystem-base:0.29.0`, public Docker Hub repository |
| App data | Named volume `storagesystem_app-data`, database `/data/storage.sqlite` |
| Public names | `https://verkstad.snille.net`, `https://hylla.snille.net`; NPM proxy host 11 |
| Management | `STORAGE_MANAGEMENT_ACCESS=open`, explicit `APP_ALLOWED_HOSTS`; trusted LAN and external Authelia |
| HA/MCP | Existing public address and public API key retained at cutover |
| Printing | Separate label-service stack, `http://10.0.0.25:3230`, own client key |
| Image AI and answer phrasing | Configured OmniRoute `cx/gpt-6-luna`, fallback Ollama01 `qwen3-vl:8b-instruct-16k` |
| Semantic runtime | Disabled in production; management preview only when explicitly enabled |

Outside authentication and physical speaker acceptance remain outstanding. HTTP
health through the public hostname was checked from the LAN, not an external network.
Do not put actual settings, credentials, databases or backups into Git or images.

## Fresh install

Use [compose.portainer.yaml](../compose.portainer.yaml). Set `STORAGE_IMAGE` to a
released tag or digest and `APP_BASE_URL` to the browser/HA reachable HTTPS address.
Set a public read API key. For management either configure a separate admin key,
or deliberately select `open` with `APP_ALLOWED_HOSTS` on a trusted network behind
an authenticating proxy. Set optional label-service environment values or save the
connection in the UI. Saved configuration takes precedence for that connection.

Keep SQLite on local persistent storage, never SMB/NFS. This is a single-instance
application. HTTPS/authenticating proxy behavior is external to the container.
For remote MCP retain the working `/api/mcp` and OAuth well-known proxy exceptions
while preserving API authentication. Original photos stay in Immich/PhotoPrism.

The first startup creates an empty schema-4 database. Import legacy inventory and
settings only into an empty database, or restore an audited SQLite backup through
Security → Data & maintenance. Separate legacy language files are not imported.
Verify health, audit, photos, API/MCP and HA before directing clients to a new host.
Never point a development instance at the production volume.

## Release and update

1. Inspect Git status and the current deployment. Several agents may share this
   checkout; include only the intended files. Change VERSION and History for an
   application release; documentation-only maintenance does not require a new image.
2. Run `npm run check`. Build the release from `git archive <commit>` in an isolated
   build directory so private data and unrelated working changes cannot enter it.
   The Dockerfile runs tests with pinned Node 24.14 before producing the runtime.
3. Run `scripts/verify-container.ps1` against the built image. Download a consistent
   production backup and test a private copy in an isolated container, including
   integrity audit and any schema migrations. Never mount the live volume for testing.
4. Publish the approved image as `mrsnille/storagesystem-base:<version>` and `:latest`.
   Record the digest. Publishing/updating is a distinct action from committing docs.
5. Save the current stack configuration and a pre-update database backup. Update
   only `STORAGE_IMAGE` using the existing Compose and environment values. The
   recorded API procedure is `PUT /api/stacks/13?endpointId=2` with `RepullImageAndRedeploy: true` in the JSON body (Portainer 2.45.3);
   preserve all unrelated values. Check the current Portainer contract before use.
6. Check LAN/public `/healthz`, authenticated inventory/audit, images, MCP, HA and a
   label preview. Check API-key/host rejection. Physical print or paid inference
   needs its own applicable authorization; health alone does not test either.
7. Record version, image digest, verification and backup outcome in the release
   record. Keep backup files private; do not commit live settings or inventory.

## Backup and restore

Download `/api/manage/backup` or use the CLI `backup` command. SQLite `VACUUM INTO`
produces a consistent snapshot; copying only the live database file can miss WAL
changes. Backups contain settings/credentials and the custom background. Inventory
JSON export excludes settings, registered empty positions and background media.
Neither format contains original external photos or the derived semantic cache.

UI restore accepts schemas 1-4 and migrates older backups on a private copy,
requires typed `RESTORE`, writes a safety backup under `/data/restore-backups`, and
replaces data in one audited transaction. CLI restore refuses an existing output
file. Test restores on separate data. A newer schema may not be readable by an
older image: pair rollback code with a compatible backup, and reconcile later edits.

Pre-release downloads and restore rehearsals are documented. An automatic production
backup schedule/retention has not been established by the reviewed evidence; verify
an existing policy or set one up separately. Prune safety/migration copies only after
checking their contents, retention needs and owner decisions.

## Old system and rollback

The former app at `hyllsystem-live` (`10.0.0.33:3000`, `/opt/lagersystem`,
`lagersystem.service`) was retained at cutover. The historical network rollback is
to point NPM host 11 back there. It is a snapshot of the older inventory, so simply
switching back can hide later edits; confirm data reconciliation and current host
health before any rollback. Current old-host process state was not rechecked here.

Only label-service may reserve/print on the DYMO. Do not print through the old CUPS
or start a second label-service while the live service is used. Check all old-app
and CUPS consumers before owner-approved retirement. Private migration files under
ignored `data/migration-2026-10-24/` include credentials; review retention before
removing them. The original Docker Desktop development stack was removed on
2026-10-25; `compose.yaml` recreates a separate empty development instance.

## Operational pitfalls

- Browser writes require an allowed host/origin; open the configured canonical URL.
- AI/image routes and native embedding routes are different. The vision fallback
  working does not establish `/api/tags` or `/api/embed` support.
- Ollama01 also serves Mimers Brain. Its last documented configuration is 16 GiB
  container RAM, 14 GiB service limit and two loaded models; inspect before changing
  shared resources. See [Embedding service](EMBEDDING-SERVICE.md).
- Close SQLite handles before removing Windows test folders. Do not run broad
  cleanup commands over shared Docker resources or private backup directories.
- PowerShell piped SSH scripts can acquire CRLF; preserve LF for remote shell code.

## Latest release: 0.29.0 (2026-10-29)

Image built from `git archive 7b51415` for linux/amd64; tags `0.29.0` and `latest`:
`sha256:7401c56980218f03c99a90e23d48c1f0efdf78b4068569c11da9233f84d69121`.
All 116 tests pass on pinned Node 24.14, and the isolated container harness passes.
A private production backup copy migrated 3→4 with matching inventory/settings/
positions/old-journal/background digests. A synthetic log entry survived full backup
and restoration. A final pre-update backup matched the tested snapshot; it and a
post-update schema-4 backup are retained privately.

The existing stack's Compose content and environment list were read again before
update. Only `STORAGE_IMAGE` changed, keeping the other seven values. Portainer
2.45.3's update is asynchronous: success of PUT is acceptance, not proof that the
new app is running. The current body uses `RepullImageAndRedeploy: true` and
`Prune: false`; `PullImage` is a deprecated compatibility field. Contract checked
against the [2.45.3 handler](https://github.com/portainer/portainer/blob/2.45.3/api/http/handler/stacks/stack_update.go).
All requests used a pinned certificate with full TLS/name verification.

Subsequent LAN/public health shows 0.29.0 and the schema-4 audit passes with
166 boxes, 256 sessions, 320 photo references and 166 locations. Live thumbnails,
REST/MCP ranking, log entries from Web/API/MCP and box-label preview work; public
API/Host rejection remains 401/403. Browser acceptance verified the log and the
uncropped photo on shelving unit E. No inventory edit, AI request or physical
print was made. Semantic indexing stays disabled.

Schema-3 images cannot open schema 4. Keep the compatible pre-update backup and
reconcile newer inventory changes before a rollback; the old system is not a
current copy of the post-cutover inventory. See the rollback section above.
