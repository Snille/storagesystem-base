# Project instructions

- Write code, comments, documentation, logs, and commit messages in English. English is the default UI language; additional languages may be supported.
- Read README.md, docs/ARCHITECTURE.md, and docs/ROADMAP.md before implementation. The application is in production; use docs/STATUS.md and current source to distinguish delivered behavior from preview-only and planned features.
- Keep VERSION as the version source until a deliberate documented transition to an application manifest. Update docs/HISTORY.md with meaningful implementation changes.
- Use the existing Storage System application and storagesystem-ha integration as compatibility references. Verify their current contracts from source, not assumptions.
- Keep inventory behavior shared between the UI, REST API, and MCP. Preserve existing identifiers during migration.
- Test against isolated temporary data. Never modify or restart an existing production installation as part of local development.
- Do not commit runtime inventory, credentials, real app settings, database files, or backups.
- Add appropriate runnable checks and a data integrity audit with the implementation. A successful container start is not proof of HA integration or physical printing; verify those paths separately.
