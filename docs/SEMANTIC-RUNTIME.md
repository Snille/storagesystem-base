# Shared semantic search and decision preview

Current source/production: 0.30.0, reviewed 2026-10-30. Production has ordinary semantic search enabled and 166/166 current vectors.
Management-only means the configured management access mode (key or explicitly
open management), not a separate mandatory key in every deployment.

Version 0.10.2-dev introduced an optional background vector index and management-only
decision preview. Version 0.11.0-dev adds saved model/rule configuration and the
Search & answers dialog. Source 0.30.0 adds a separate explicit ordinary-search activation switch. When
disabled, public/browser/HA/MCP paths retain their previous behavior. When enabled,
all use the same supported selections and saved rules.

## Ordinary search (0.30.0)

`searchWorkspace.publicEnabled` defaults to false and is independent of embedding
indexing. Enabling requires configured/enabled embedding and identity verification
settings, including explicit thresholds. Older clients omitting the flag retain it;
unknown or nonboolean values are rejected. The WebGUI offers the separate switch
under Search & answers → Embedding model. Turning it off restores legacy behavior.

When enabled, web search, public REST search/ask and MCP search all call
`SearchService.search`. Answers use only selected current boxes; exact filenames
retain their explicit lookup path. Ambiguity returns a short question/candidates,
unsupported requests return no claimed matches. Missing/stale/busy/unavailable
embeddings use current direct text evidence and saved rules without semantic scores.
Identity failure cannot authorize a semantic-only answer. Settings/content races
fail closed. MCP instructions require preserving the decision rather than choosing
another candidate. The enabled ask path skips legacy AI answer rephrasing.

Payloads preserve query/count/matches and add answer, `source: semantic`, decision,
reason and semanticAvailable (plus a safe fallback category when needed). Match
limits remain 1–25. The journal records the shared final answer once per request.
A preferred rule selects exactly one current supported box; all selects two, any
accepts alternatives and clarify asks the saved question. No inventory-specific
rules ship as defaults. Swedish cable compound/order normalization applies only
to evidence: different query phrasings can still intentionally trigger different
owner rules. Session reanalysis automatically replaces indexed evidence; old
sessions cannot authorize answers. Conversational yes/no state is not implemented.

Fourteen owner-labelled cases are frozen privately in
`owner-search-20261029T225316Z/questions-v2.json` (SHA-256
`8651868d083f42d868557d6567b9f24d161411865955e7afb2b102334a8c754d`).
The release config preserves five existing rules, updates one and adds four (ten
in total). All 56 transport checks and the real HA HTTP client mapping pass on
an isolated 166-box backup. `verify-shared-search.js BACKUP CONFIG_JSON QUESTIONS_JSON
NEW_PRIVATE_OUTPUT` accepts expected answer/clarify/no-supported decisions, exact
clarification text and location sets. Optional `STORAGE_HA_SOURCE` and
`STORAGE_TEST_PYTHON` enable the actual reference client. Keys come from the same
explicit environment variables as verify-runtime-preview, not config files.
These configured snapshot checks and seven supplementary source/regression cases
are not a claim of general unseen model accuracy. Physical voice remains separate.

## Source and cache boundaries

`semanticDocument` version `current-contents-v1` uses the shared inventory
projection: label, current-session summary and keywords, and current-photo notes.
Historical contents, filenames, IDs, locations and free-form box/session notes
are excluded. This serializer differs from the earlier offline corpus; results
are a new regression measurement, not an unchanged reproduction of that corpus.

Vectors live in a separate SQLite file, defaulting to
`<inventory database path>.semantic.sqlite`. The cache is independent of the main inventory database (currently schema 4);
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

**Native route verified 2026-10-29:** the authenticated LAN gateway now permits
Storage System `GET /api/tags` and `POST /api/embed`, using the existing
Storage-only authorization map. A synthetic probe from the actual production app
container returned 200/200, 1024 dimensions and a 32 ms embedding response.
Unauthenticated tags returned 401, Mimers Brain's key returned 403 for native tags,
native model administration stayed 404, and GET embed was denied. Mimers Brain's
existing compatible embedding route still returned a valid 1024-vector.
Nginx was backed up, syntax-checked and reloaded; Ollama was not restarted.
The earlier localhost-tunnel runs remain dated evidence. The adapter still does
not fall back to the truncating compatible API. See [Embedding service](EMBEDDING-SERVICE.md).

## Explicit configuration and management API

Search & answers now saves embedding configuration, optional identity-verification configuration and owner rules as
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

- `GET/PUT /api/manage/search-settings`: redacted configuration/revision and complete optimistic writes. Blank keys retain existing credentials, changing server clears them, and explicit clearing is supported independently for embedding/verification connections. Omitted `verification` retains its previous value for older clients. New/changed rules must reference existing boxes. Unchanged imported rules may remain stale; they cannot authorize answers without current evidence.
- `POST /api/manage/search-settings/models`: explicit saved-revision native model discovery. Only the saved endpoint/key are used. The response contains names/digests, not a claim of embedding support. No inventory is sent. Concurrent catalog requests are bounded and stale settings/provider errors fail safely.
- `GET /api/manage/semantic`: enabled/state/current coverage, model metadata and cache audit.
- `POST /api/manage/semantic/rebuild`: schedule an incremental reconcile/retry; returns 202 without waiting for inference. A valid existing cache is reused.
- `POST /api/manage/semantic/preview?lang=sv`: JSON `{ "query": "...", "revision": "saved revision" }`; returns the shared decision preview using saved rules, full current semantic ranking and lexical fallback on unavailable retrieval. With verification explicitly enabled, threshold-qualified semantic-only candidates require a source-bound identity check. Works with embeddings disabled. The UI always sends the revision; omitted revision uses the current snapshot for compatibility. Request-supplied thresholds, rules, intent aliases and identity proofs are rejected. Scores alone cannot authorize answers. `verification` response metadata contains enabled/outcome, never keys or upstream error text.

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

Source 0.30.0 attaches the optional identity verifier through saved
`verification`: `enabled`, compatible `baseUrl`, `model`, `timeoutMs`, `similarity`,
`margin`, and optional private `apiKey`. The UI exposes these under Embedding model.
Old databases default to disabled, blank endpoint/model and null thresholds;
there is no automatic model, key reuse or threshold calibration. The timeout
defaults to 15000 ms, with an explicit allowed range of 100–90000 ms. Similarity
must be in [-1,1], margin in [0,2]; both must be supplied before enabling.
Changing the verification API base clears its key. These settings are validated
on save/import/audit/restore and included in private SQLite backups.

Only the best candidate's bounded current text and the question reach the verifier;
locations, IDs and photos do not. Direct evidence does not invoke it. Busy,
unavailable, invalid, oversized or unsupported verification cannot authorize an
answer. Settings are rechecked after verification, and a current-content snapshot
also guards changes to other ranking competitors. Identity settings/rules do not
invalidate valid embedding vectors. Ordinary semantic activation is separate from index/verification setup. Broader
quality measurement and physical voice acceptance remain separate checks.

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

## Isolated runtime check (2026-10-29)

`scripts/verify-runtime-preview.js BACKUP CONFIG_JSON QUESTIONS_JSON NEW_PRIVATE_OUTPUT`
reads a backup without writes and imports inventory only into memory. Config JSON
contains explicit embedding/verification fields and rules; keys come exclusively
from `STORAGE_EMBEDDING_KEY` / `STORAGE_VERIFICATION_KEY`. Questions are a JSON array
of `{ id, query, language }`. It creates a new derived cache/report directory,
archives code hashes/source, audits inventory/cache and verifies the original backup
and inventory hashes are unchanged. It does not change deployed settings.

A 166-box backup indexed via the authenticated native gateway in 16097 ms.
Seven development queries all obtained complete semantic rankings. Qwen
`qwen3-vl:8b-instruct-16k` verified two English knee-pad queries as Knäskydd;
first verification took 10699 ms including retrieval, next 1376 ms. A thermal-camera
query was refused (1613 ms). `Masterenhet` used direct evidence; `mat enhet` remained
unsupported. The run reused the old regression thresholds (0.46485787630081177 /
0.011070549488067627) explicitly in its private test config, without production
calibration or deployment. Evidence is under the canonical private backup directory
`semantic-preview-20261029T221927Z/evidence`. Fresh owner-labelled acceptance is
deferred at the owner's request until more hands-on testing.
