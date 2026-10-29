# Semantic runtime preview

Current for 0.28.0, reviewed 2026-10-29. Production reports `enabled: false`.
Management-only means the configured management access mode (key or explicitly
open management), not a separate mandatory key in every deployment.

Version 0.10.2-dev introduced an optional background vector index and management-only
decision preview. Version 0.11.0-dev adds saved model/rule configuration and the
Search & answers dialog. Public search/ask, MCP, browser search and HA retain their
existing behavior. This does not complete independent acceptance or enable the
voice assistant's new decision policy.

## Source and cache boundaries

`semanticDocument` version `current-contents-v1` uses the shared inventory
projection: label, current-session summary and keywords, and current-photo notes.
Historical contents, filenames, IDs, locations and free-form box/session notes
are excluded. This serializer differs from the earlier offline corpus; results
are a new regression measurement, not an unchanged reproduction of that corpus.

Vectors live in a separate SQLite file, defaulting to
`<inventory database path>.semantic.sqlite`. The cache is independent of the main inventory database (schema 4 in development; deployed 0.28.0 uses schema 3);
semantic settings/indexing introduce no main-schema migration. Each cache row carries the box ID, current session ID, content hash,
dimension and profile hash. The profile includes document version, endpoint,
model, immutable model digest and native API protocol. Keys and original source
text are not saved in the cache. Vectors are derived private data and must remain
outside Git. Cache audit checks SQLite integrity, metadata and finite unit vectors.
An inventory or unrelated database cannot be opened as a cache.

After each committed inventory/settings transaction, a background worker checks
for changed documents. Unchanged vectors are reused; deleted boxes are pruned.
Inference happens outside the transaction. Before storing a result, the worker
rechecks the current document/session and discards stale work. A failing worker
cannot roll back or fail an already committed inventory save. Failures stop the
pass; a management retry or later commit can retry, without an automatic retry loop.

Queries require the complete current corpus and profile, so missing/stale/corrupt
vectors cannot silently remove competitors and inflate a decision margin. A query
rechecks the inventory after inference. One query runs at a time; a background
worker can overlap a query after an inventory commit, which then fails closed if
the indexed content changes. Unavailable retrieval returns no semantic scores and
the management response includes the unchanged lexical search as fallback.

The inventory backup/export excludes the separate cache. Restore the inventory,
then rebuild the cache. Stop the preview worker before removing its cache file.
No cache is needed when preview is disabled.

## Native Ollama and length handling

The measured compatible `/v1/embeddings` route silently truncates at 2048 tokens.
This adapter deliberately uses native `POST /api/embed` with `truncate: false`.
Ollama documents that this returns an error when the context limit is exceeded:
[native embedding API](https://docs.ollama.com/api/embed).
The application also rejects inputs above 65536 UTF-8 bytes before the request;
that is a transport bound, not an estimate of token count. No automatic chopping
or chunking is performed. A rejected document keeps the incomplete index unusable
for semantic ranking until corrected; lexical search remains available.

Before every embedding request, `GET /api/tags` must confirm the configured model
name and immutable digest. A replaced alias cannot mix new query vectors with the
old cache. Responses must identify the requested model and contain exactly one
finite, nonzero vector of the configured dimension. Redirects, malformed/oversized
responses, context rejection and timeouts fail closed. Provider errors and keys
are not exposed through HTTP. Each upstream request has a 15-second timeout.

**Deployment route still pending:** on 2026-10-23 the existing authenticated LAN
gateway returned 404 for both native paths. That route has not been reverified
from production; later vision-route provisioning does not establish native access. The live test
used a temporary localhost SSH tunnel to the existing Ollama process. That proves
the application adapter/model path, not the eventual authenticated LXC route.
An approved route for these two paths is required before enabling this preview
in a deployment; the adapter does not fall back to the truncating compatible API.

## Explicit configuration and management API

Search & answers now saves embedding configuration and owner rules as
`searchWorkspace` in the ordinary settings table. The main database backup retains
these settings and credentials; inventory-only JSON does not. Environment values
below are the fallback only until a search configuration has been saved. The UI
explicitly indicates an active environment fallback before replacing it. Nothing
is enabled or migrated automatically. Cache location remains server-only; the
current Compose templates do not forward the optional environment fallback values.

| Variable | Meaning |
|---|---|
| `STORAGE_SEMANTIC_PREVIEW` | Exactly `1` enables the optional worker; otherwise disabled |
| `STORAGE_EMBEDDING_URL` | Explicit native Ollama HTTP(S) origin, without `/v1`, credentials or query |
| `STORAGE_EMBEDDING_MODEL` | Exact model name as listed by native tags |
| `STORAGE_EMBEDDING_REVISION` | Required 64-character immutable model digest from native tags |
| `STORAGE_EMBEDDING_DIMENSIONS` | Defaults to 1024 |
| `STORAGE_EMBEDDING_KEY` | Optional bearer key for the approved gateway, never returned |
| `STORAGE_EMBEDDING_CACHE` | Optional separate SQLite cache path |

Existing management authentication and origin checks protect these endpoints:

- `GET/PUT /api/manage/search-settings`: redacted configuration/revision and complete optimistic writes. Blank keys retain existing credentials, changing server clears them, and explicit clearing is supported. New/changed rules must reference existing boxes. Unchanged imported rules may remain stale; they cannot authorize answers without current evidence.
- `POST /api/manage/search-settings/models`: explicit saved-revision native model discovery. Only the saved endpoint/key are used. The response contains names/digests, not a claim of embedding support. No inventory is sent. Concurrent catalog requests are bounded and stale settings/provider errors fail safely.
- `GET /api/manage/semantic`: enabled/state/current coverage, model metadata and cache audit.
- `POST /api/manage/semantic/rebuild`: schedule an incremental reconcile/retry; returns 202 without waiting for inference. A valid existing cache is reused.
- `POST /api/manage/semantic/preview?lang=sv`: JSON `{ "query": "...", "revision": "saved revision" }`; returns the shared decision preview using saved rules, full current semantic ranking and lexical fallback on unavailable retrieval. Works with embeddings disabled. The UI always sends the revision; omitted revision uses the current snapshot for compatibility. Request-supplied thresholds, rules, intent aliases and identity proofs are rejected. Semantic-only scores cannot authorize answers here.

Changing saved embedding settings replaces the worker outside inventory
transactions, invalidates old-profile reuse and applies without restarting the
app. The service serializes replacements and safely closes its previous cache.
Rules-only changes do not rebuild valid vectors. A preview checks the saved
settings revision again after inference; changes cannot return an old-policy
answer. Index status describes cache coverage, not a continuous service health
probe. Model discovery and inference happen only through explicit actions or an
explicitly enabled worker.

The panel offers structured rule editing with one query per line, current box
choices and localized clarification questions. A bounded Swedish cable inflection
family (`kabel`, `kabeln`, `kablar`, `kablarna`, including compounds) lets current
network-cable evidence support the owner's finished-versus-bulk clarification.
This is linguistic inflection, not speech-error correction. Deleted or changed
inventory cannot be overridden by a saved rule. Conflicts/missing evidence are
explained in the preview. No predefined workshop-specific rules are shipped.

This preview does not attach the optional identity verifier or configure semantic
thresholds. Independent acceptance, identity model/latency configuration,
deployment routing and public-interface activation remain separate work.

## Verification

Run `npm run check` for the automated checks, including the native adapter,
nonblocking/incremental background work, persistence, profile invalidation,
stale-result/query races, corrupt cache, deletion, provider/length failures,
model digest changes and HTTP/auth/public-behavior boundaries. All test inventory
is synthetic and all persistent test data uses isolated temporary directories.

`scripts/verify-semantic-live.js` explicitly selects a native origin/model/digest,
imports only the frozen evaluation snapshot into memory and writes a new private
result directory. It archives source/code hashes, cache, query vectors and full
rankings; refuses to overwrite evidence; checks source/inventory integrity; and
requires a real native context-length rejection. It does not use paid models.

```text
node scripts/verify-semantic-live.js ROOT NEW_OUTPUT NATIVE_ORIGIN MODEL MODEL_DIGEST
node scripts/verify-semantic-live.js --audit ROOT OUTPUT
```

The audit replays every cosine score/ranking and retrieval metric offline, checks
source/current-and-archived-code hashes and binds cached vectors to the exact
current sessions/content/profile. Previously collected questions are regression
evidence. Neither retrieval metrics nor a cache audit establish independent
decision, Home Assistant speech or production acceptance.
