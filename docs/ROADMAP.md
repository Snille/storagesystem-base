# Roadmap

Reviewed for production 0.29.0 / prepared source 0.30.0 on 2026-10-30. [TODO](../TODO.md) is the single
outstanding-action list; this page records milestones and boundaries.

| Area | Delivered | Remaining direction |
| --- | --- | --- |
| Core | Node/SQLite schema 4, shared inventory service, preserved IDs/history, validated import, audit, JSON export and SQLite backup/restore | Measure larger-corpus/concurrency needs; add ordered migration fixtures with each future schema |
| Inventory UI | Manual and AI-assisted sessions, location occupancy, history, photo viewer/covers, storage map, unit photos | Further location/unit editor and optional matching workflows |
| Photos | Immich live acceptance, album inbox, assignment/release and PhotoPrism adapter fixtures | Real PhotoPrism acceptance |
| AI | Named connections, task instructions/languages, reviewed editable image drafts/updates, fallback, AI-phrased public answers | Independent identity verification acceptance; optional new model comparisons |
| Search | Shared lexical mode; explicit shared semantic retrieval/decision mode, saved rules/verifier/threshold controls and owner-case acceptance in source 0.30.0 | Controlled deployment, broader fresh acceptance and conversation continuation |
| Voice | Compatible HA API, isolated real-HA/card acceptance, browser microphone input | Physical speech acceptance, bounded clarification context, optional browser playback; STT normalization deferred |
| Languages/settings | English/Swedish catalogs, external en/sv/de, independent AI language, appearance, security and maintenance UI | Translation tooling, optional German UI and legacy overrides |
| Printing | Label-service client, box/location/unit templates, separate print dialog, per-box remembered template; earlier physical box output accepted | Current location/unit template physical acceptance; designer/sheets/QR belong in label-service |
| Deployment | Docker Hub image, Portainer production since 2026-10-25, updates through 0.29.0, tested backup-copy restores and schema migrations | External authentication check, recurring backup-policy verification, owner-approved old-system retirement |

## Semantic activation milestone

Source 0.30.0 provides explicit shared activation after native routing, verifier/
threshold setup and isolated acceptance. Fourteen owner cases pass all four
transports with the prepared configuration; seven supplementary cases cover
synonyms, rejection and ambiguity. These are scoped measurements, not general
unseen quality guarantees. Production remains 0.29.0 until controlled deployment.
Physical voice acceptance and bounded clarification continuation remain follow-up.

Keep SQLite and separate rebuildable embeddings at the measured inventory scale.
Model/ranking quality, rather than a database replacement, is the current problem.
See [Answer policy](ANSWER-POLICY.md) and [Semantic runtime](SEMANTIC-RUNTIME.md).

## Scope decisions

Excel catalog import/export is retired. Full prompt editing is closed in favor of
built-in instructions and task extras. Printer protocols, drivers and label design
belong to label-service. Real speech normalization remains deferred. Optional work
is not an unmet gate for the already completed production migration.

## Search-log milestone (0.29.0, deployed)

The shared SQLite search journal covers browser, public REST/HA, MCP and preview
requests, with WebGUI filters/history under Search & answers. It does not enable
semantic search or correct transcription. See [Search log](SEARCH-LOG.md).
