# Roadmap

All unchecked items are planned, not delivered.

## 1. Capture behavior and contracts

- [ ] Inventory the existing user workflows and features.
- [ ] Capture REST and MCP contracts from the existing application and HA client.
- [ ] Define isolated fixtures and acceptance criteria, including image URLs and language behavior.
- [ ] Identify reusable logic after review; avoid copying the old application wholesale.

## 2. Implement the core

- [ ] Select the application framework and SQLite driver.
- [ ] Add schema, migrations, application services, integrity audit, and automated checks.
- [ ] Implement validated legacy import preserving identifiers and relationships.
- [ ] Implement consistent backup, restore, and JSON export; test a restoration into an empty instance.

## 3. Implement interfaces and integrations

- [ ] Implement inventory UI, settings, photo integrations, and AI workflows.
- [ ] Implement compatible REST and MCP endpoints.
- [ ] Adapt catalog import/export to the new persistence layer.
- [ ] Verify the actual HA integration against an isolated running instance.

## 4. Package and verify deployment

- [ ] Add reproducible Docker builds, health checks, and a Portainer-compatible Compose stack.
- [ ] Verify first startup, data persistence, upgrades, backup, and restore.
- [ ] Review printer driver sources and patches; provide optional CUPS packaging.
- [ ] Implement general print configuration, label sheets, and optional DYMO capabilities.
- [ ] Verify physical print output and queue/status behavior.
- [ ] Document supported printers based on testing, not assumed CUPS compatibility.
