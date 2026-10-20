# Isolated semantic-search evaluation

Status on 2026-10-20: real inventory snapshot imported and verified; 30 draft
evaluation questions and an initial lexical baseline are prepared. The user has
accepted all questions and proposed labels; the reviewed set is frozen. No embedding
model has been selected, no embeddings have been generated, and no inventory
text has been sent to an embedding provider. Runtime application version remains
0.9.1-dev. See [VOICE-SEARCH.md](VOICE-SEARCH.md) for the proposed search and
short-answer contract.

## Local snapshot

The user authorized importing live data as evaluation material. A read-only GET
to the old application's `/api/settings/backup` endpoint returned its ZIP export.
The archive was decoded in memory; only `inventoryData` was saved. `appSettings`
and the original archive were not persisted or logged. Production was not written,
restarted or reconfigured. Existing development inventory/settings were not changed.

Private local directory (ignored by Git):

`data/evaluation/live-2026-10-20-40bea18b/`

| File | Purpose |
| --- | --- |
| `inventory.json` | Inventory-only source snapshot, preserving original records and history |
| `inventory.sqlite` | Independently imported test database; settings table is empty |
| `manifest.json` | Source/export/capture times, scope, record counts and source JSON SHA-256 |
| `search-corpus.json` | Derived current-session search text, stable IDs and per-document text hashes |
| `verification.json` | Integrity audit, preservation checks, corpus counts and unconfigured embedding status |
| `questions-v1.json` | 30 provisional questions, source hashes, expected behavior, stable IDs and current destinations |
| `questions-v1.review.md` | Human-readable questions, proposed answers, source excerpts and lexical baseline |
| `lexical-baseline-v1.json` | Existing shared search rankings, bound to dataset and corpus hashes |
| `questions-v1.reviewed.json` | Frozen user-reviewed dataset; original questions, expected behavior and destinations unchanged |
| `questions-v1.reviewed.md` | Accepted questions and destinations for convenient review |
| `lexical-baseline-v1.reviewed.json` | Unchanged baseline rankings bound to the reviewed dataset hash |
| `questions-v1.reviewed.validation.json` | Reproduced rankings, source/ID/location checks and SQLite audit |

The directory is not a shared repository fixture. Do not stage it, attach it to
issues or embed its contents in tracked tests. Refresh into a new directory;
never overwrite the source snapshot or redirect the normal development app at
this database as an incidental test step.

## Verified scope and counts

- 164 boxes and 164 associated exact location IDs (17 storage units).
- 249 inventory sessions, including history.
- 306 photo references across all sessions; 293 in the selected current sessions.
- 164 search documents, one per current box.
- 97,067 UTF-16 code units in the generated search text, including current photo
  notes. This is broader than the earlier 18,941-character measurement of only
  names, summaries and keywords.

The importer used the ordinary `Store.importLegacy` path against a fresh SQLite
database. Its audit passed with no errors. The database inventory was compared
with every original source record/field after sorting each collection by its ID;
all matched. The saved source JSON SHA-256 matched the manifest, and the imported
settings were verified to be `{}`. Git ignore checks passed for all five files.

Photo references preserve asset IDs and roles; image binaries remain in the
external photo service. No photo credentials were imported and this dataset is
not an image-browsing installation. No synthetic dates, box IDs or replacement
locations were invented for the import.

## Search-corpus derivation

Current sessions are selected by the same `Inventory.list`/`currentSession`
rules used by the application, REST and MCP. Each document contains `boxId`,
`label`, `locationId`, `sessionId`, `text` and `textSha256`.

The text combines the label, current summary, keywords, box notes, current session
notes and current photo notes. Historical contents are preserved in the snapshot
but excluded from the corpus. Location is separate metadata, so an embedding
result can always resolve to the current stored destination. Multiple photographs
do not create duplicate candidate boxes.

This corpus is a starting baseline, not confirmed ground truth. Old AI photo
interpretations can be inaccurate or mention outdated labels. The evaluation
must check whether indexing those notes improves retrieval or introduces false
matches; compare a reviewed summary-only variant where useful.

## Reviewed questions and lexical baseline

The private draft contains 24 questions with a proposed destination: six exact
names, ten functional descriptions, four product-code/size requests, three
synthetic transcription variants and one English question. Three additional
questions require clarification; three request items without supporting literal
evidence in the current corpus. Absence of a term is not proof of physical
absence or of missing synonyms. Erik accepted all questions and proposed boxes
in the project conversation, and explicitly confirmed the three unsupported
items are absent. This records user review, not an independent physical audit.
The original draft is preserved; use `questions-v1.reviewed.json` for comparisons.

Expected destinations were checked against the current inventory, independently
of box IDs. Some boxes have moved; neither the box ID nor old photographed labels
determine the answer. Each supported case records its current session, location,
document hash and literal source excerpt. Synthetic transcription variants are
authored robustness probes, not recorded STT results.

The unchanged shared lexical search placed the proposed box first in 13/24
answer cases and among the first five in 17/24. This measures agreement with a
user-reviewed exploratory set, not an independent holdout. The six clarification/no-support
cases have no speech-decision score: ranking alone does not implement the proposed
clarification/abstention policy. No embedding model or external model was called.

This is an exploratory comparison set, not an untouched holdout. Related wording
variants share a group ID; keep groups together when splitting data. Do not enrich
indexed documents or add question-specific synonyms before measuring the baseline.
Collect an independent holdout before making generalization claims.

## Next work

1. Use the frozen reviewed version and its source hashes for comparisons. Record
   any later corrections as a new version rather than overwriting this baseline.
2. Choose two locally runnable multilingual embedding candidates. Verify the
   runtime/model compatibility, service reachability, licensing, and available
   resources without replacing the existing production AI service.
3. Evaluate lexical, semantic-only and hybrid retrieval on the same snapshot.
   Measure top-1 correctness, incorrect confident answers, clarification/abstention
   and end-to-end latency. Keep score thresholds model-specific.
4. Record model/version, dimensions, text format/hash and evaluation-set version
   with each result. Do not mistake a database audit for retrieval-quality evidence.
5. Implement the winning approach and short spoken-answer policy only after the
   comparison. Test through the disposable HA runtime before a hardware session.

Snapshot preparation, user review and an initial lexical measurement are
complete. Embedding comparisons remain open. No semantic scores
or model-quality claims are available yet.
