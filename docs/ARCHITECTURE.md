# Architecture direction

This document records the agreed direction, not an implemented system. Application framework, database driver, and library choices remain open until the initial implementation is designed.

## Boundaries

Separate inventory rules, persistence, external integrations, transport endpoints, and user interface. UI actions, REST endpoints, and MCP tools should call the same application services.

External integrations include album photo sources, AI providers, and printing. Keep provider-specific behavior behind explicit adapters.

## Persistence

Use SQLite for a single application instance, with the active database on local storage in a persistent Docker volume. Do not place the active database on SMB or NFS.

Model boxes, sessions, photo references, and related data with tables, foreign keys, constraints, and transactions. Store user settings and translation overrides in the database; ship default language catalogs as application resources. Original images remain in the configured photo service.

Use versioned schema migrations. Provide an integrity audit whose exit status is zero only when required checks pass. Keep database transactions short and free of external network calls.

## Compatibility

The existing application's public REST API and the current storagesystem-ha client are the compatibility references. Capture methods, authentication, parameters, response fields, language behavior, error behavior, and usable image URLs in contract tests before replacing behavior.

Preserve the existing /api/mcp endpoint and read-only tools: search_inventory, get_box, list_locations, list_boxes_at_location, and get_box_photo. Preserve supported authentication and transport behavior verified from the reference implementation.

Home Assistant and browsers must be able to reach returned image URLs. Internal Compose service names must not leak into externally consumed URLs.

## Backup and migration

Provide consistent online SQLite backups, downloadable backup and controlled restore in the UI, and readable JSON export. Backups of app data do not back up original photos in external photo services.

Import legacy inventory and settings with validation, preserving IDs, history, photo associations, and relevant user configuration. Compare record counts and relationships, retain source files, and prove restoration into a fresh instance before considering migration complete.

Review the existing Excel import/export path: its Python scripts currently access inventory.json directly and cannot be copied unchanged.

## Printing

Separate label layout and document generation from print submission and printer capabilities. Support label printers and ordinary printers through CUPS; A4 label sheets need explicit geometry and start-position handling.

Offer an optional CUPS container or a configured existing CUPS server. Ship required printer filters in the print image, with reproducible source versions and patches. DYMO-specific roll detection and remaining-label status are optional capabilities, not requirements for other printers.

The reference repository includes raster2dymolw_nolm.cpp, an adaptation of the DYMO filter that disables post-print LanguageMonitor polling. Its equivalence to the installed production binary has not yet been established. Review and physically verify the working print path before packaging it.

## Deployment

Target a prebuilt application image, a Compose stack usable in Portainer, a persistent application-data volume, and optional persistent print-service configuration. Document fresh install, updates, backup, restore, and health checks.

Develop and verify this service separately from the existing installation. Do not couple it to an existing host's systemd service or checkout layout.
