# Storage System Base

A fresh implementation of [Storage System](https://github.com/Snille/storagesystem), designed for Docker and Portainer, with SQLite storage.

## Status

Project foundation only. There is no runnable application, Docker image, or deployment stack yet. The version is defined in [VERSION](VERSION).

The existing application is the functional reference. This repository has independent Git history and is not a GitHub fork. The existing installation remains the production system while this implementation is developed and verified separately.

## Intended capabilities

- Inventory boxes, storage locations, inventory sessions, photo references, and history.
- Read album photos from Immich or PhotoPrism.
- AI-assisted inventory and search.
- SQLite storage with transactions, schema migrations, and integrity checks.
- Downloadable backup and restore, readable JSON export, and migration from the existing JSON files.
- Compatible public REST API for the existing [Home Assistant integration](https://github.com/Snille/storagesystem-ha).
- Read-only MCP tools compatible with the existing application.
- Label design and general printing through CUPS, with optional printer-specific capabilities such as DYMO roll status.
- A prebuilt application image and Compose stack suitable for Portainer; optional CUPS service or connection to an existing print server.

## Development and verification

Clone this repository and read [Architecture](docs/ARCHITECTURE.md) and [Roadmap](docs/ROADMAP.md) before implementing features.

The current documentation-only foundation can be checked with:

```sh
git diff --check
git status --short
```

Application build, test, data audit, backup, restore, and deployment commands must be added alongside their implementations. Nothing in this repository should be deployed to replace an existing installation yet.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [History](docs/HISTORY.md)
- [License](LICENSE)
