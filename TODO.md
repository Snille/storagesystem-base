# Development backlog

Read docs/STATUS.md for the current handover and docs/ROADMAP.md for the full scope. Unchecked items are not delivered; order below is suggested, not a promise of implementation.

## Next product work

- [ ] Replace free-text location entry with selection from known storage positions. Explain box identity versus location and handle missing/empty locations explicitly. User requested dropdown choices for real use.
- [ ] Continue hands-on review of inventory/AI workflows with the current test album; improve explanatory text where the user finds it unclear.
- [ ] Add AI-assisted updates to existing boxes with explicit review and preserved inventory history.
- [ ] Evaluate other local image models only when requested; compare real image/OCR results rather than trusting capability labels. Reuse the current Spark connection before setting up new infrastructure.

## Before production migration

- [ ] Complete legacy search/language parity and separate translation-file import; acceptance-test real migration and restore.
- [ ] Add controlled full SQLite restore to the UI; current restore is CLI-only into a new file.
- [ ] Complete location/storage-unit management and remaining application settings.
- [ ] Verify real PhotoPrism, full isolated Home Assistant config/entities/services/conversation/card, and spreadsheet catalog round-trip.
- [ ] Choose a registry/image publishing workflow and verify a real Portainer deployment/update. Current image is local only.
- [ ] Resolve a production AI route reachable from Proxmox/Portainer without the development laptop's GSA connection, or choose a different endpoint.
- [ ] Implement label design, general print configuration and optional CUPS/DYMO support; physical printer tests remain deferred until the user has access.
