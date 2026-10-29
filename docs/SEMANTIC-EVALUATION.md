# Isolated semantic-search evaluation

This is a **dated experimental evidence record**, covering the frozen 2026-10-20
snapshot and subsequent comparisons/failed and repaired policy runs. Statements
about application versions, missing features and deployment status describe the
named experiment, not current production. Preserve failed results and source hashes.

As of 2026-10-29 the app is production 0.28.0; optional indexing/rules/decision
previews exist, but production embeddings are disabled and public semantic retrieval
is not activated. Current implementation is in [Semantic runtime](SEMANTIC-RUNTIME.md)
and [Answer policy](ANSWER-POLICY.md); remaining acceptance is in [TODO](../TODO.md).
The old datasets are regression evidence, not untouched independent acceptance.

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
clarification/abstention policy. This original lexical preparation called no model.

This is an exploratory comparison set, not an untouched holdout. Related wording
variants share a group ID; keep groups together when splitting data. Do not enrich
indexed documents or add question-specific synonyms before measuring the baseline.
Collect an independent holdout before making generalization claims.

## Comparison method and reproduction (2026-10-21)

The isolated CPU runtime uses Python 3.13.5, PyTorch 2.9.1+cpu,
Sentence Transformers 5.1.2 and Transformers 4.57.3. Direct dependency pins
are in `scripts/evaluation-requirements.txt`; the full resolved lock is private
at `data/evaluation/embedding-requirements.lock.txt`. These dependencies are
not added to the application or Docker image.

Candidates use the unchanged full current-session corpus:

| Candidate | Revision | Dimensions | Token limit | Input format |
| --- | --- | ---: | ---: | --- |
| intfloat/multilingual-e5-small | 614241f622f53c4eeff9890bdc4f31cfecc418b3 | 384 | 512 | `query: ` / `passage: ` |
| BAAI/bge-m3, dense only | 5617a9f61b028005a4858fdac845db406aefb181 | 1024 | 8192 | Plain text, no instruction prefix |

Both model cards specify multilingual support and MIT licensing; E5 explicitly
lists Swedish. See the official [E5 card](https://huggingface.co/intfloat/multilingual-e5-small)
and [BGE-M3 card](https://huggingface.co/BAAI/bge-m3). E5 has approximately
118 million parameters; BGE-M3's published PyTorch weight file is 2.27 GB.
The local machine has approximately 63.4 GiB RAM; inference uses CPU float32
and eight intra-operation threads. No GPU or endpoint performance is inferred.
E5 loads safetensors; this BGE revision supplies a PyTorch checkpoint, loaded
through PyTorch's default weights-only path, with remote model code disabled.

Semantic ranking uses normalized vectors, cosine similarity and stable box-ID
tie-breaking. Hybrid ranking uses equal-weight reciprocal rank fusion with
k=60 and at most 25 candidates per source, fixed before inspecting outcomes.
Its lexical source is the actual shared `Inventory.search`, not BM25 or
BGE's native sparse output. The bridge first reproduces the frozen top-five
rankings, then records the application's top-25 limit and query timings.
No question-specific synonyms or inventory text changes are introduced.

The separate experimental decision policy returns no-supported-match below a
similarity threshold, clarification below a margin threshold, otherwise one
answer. Hybrid gates use the selected candidate's semantic similarity and its
semantic margin over the second fused candidate, not an RRF confidence score.
Thresholds are calibrated separately for each model/method with leave-one-group-out
cross-validation (25 groups). Every wording variant stays with its group.
Training first minimizes incorrect confident answers, then maximizes correct
three-way decisions and correct answers, using conservative threshold tie-breaks.
A wrong destination counts as an incorrect confident answer even when the
expected kind is answer. This policy has no runtime or speech integration.

Private outputs in the existing snapshot directory:

- `lexical-top25.json`: shared-search rankings, timings and code hashes.
- `comparison-{e5-small,bge-m3}-v1.json`: model revision, dimensions, package
  versions, input/code hashes, token lengths, rankings, timings, grouped
  calibration folds and separate retrieval/decision metrics.
- `vectors-{e5-small,bge-m3}-v1.npz`: normalized document/query vectors,
  checked by SHA-256 in the associated report.
- `evaluate-embeddings-<sha256>.py`: exact evaluator source for each run.

To reproduce in a fresh ignored evaluation copy with the same frozen inputs
and a read-only snapshot database (existing result files are intentionally
never overwritten):

```powershell
python -m venv data/evaluation/.venv
$dataPython = 'data/evaluation/.venv/Scripts/python.exe'
& $dataPython -m pip install torch==2.9.1 --index-url https://download.pytorch.org/whl/cpu
& $dataPython -m pip install -r scripts/evaluation-requirements.txt
$evaluationDirectory = 'data/evaluation/live-2026-10-20-40bea18b'
node scripts/evaluation-lexical.js $evaluationDirectory
& $dataPython -X utf8 scripts/evaluate-embeddings.py $evaluationDirectory --model e5-small
& $dataPython -X utf8 scripts/evaluate-embeddings.py $evaluationDirectory --model bge-m3
```

Run models sequentially for uncontended query timing. Public weights are cached
under ignored `data/evaluation/model-cache/`; no corpus is sent to Hugging Face.
The saved-source hash identifies the exact evaluator used, including a minor
checkpoint-format adjustment between the two original runs. The evaluator now
archives its source automatically before inference; existing run snapshots remain
unchanged.

To audit existing results without rerunning inference or accessing a provider:

```powershell
& $dataPython -X utf8 scripts/audit-embedding-comparison.py $evaluationDirectory
node data/evaluation/live-2026-10-20-40bea18b/validate-questions.mjs --reviewed
npm run check
```

The comparison audit independently recomputes rankings/metrics from saved vectors,
checks finite unit-normalized dimensions, source/vector/evaluator hashes, current
stored destinations, fusion and held-out group isolation. The reviewed-data
validator also reproduces lexical results and audits SQLite. None proves physical
speech, HTTP endpoint latency, printing or a usable production embedding route.

## Measured results (2026-10-21)

All retrieval scores use the same 24 user-reviewed answer cases; the six
non-answer cases are excluded from retrieval accuracy and included separately
in decision metrics.

| Method | Correct top-1 / 24 | Hit in top-5 / 24 | Warm query p50 / p95 |
| --- | ---: | ---: | ---: |
| Existing lexical | 13 | 17 | 7.7 / 12.0 ms |
| E5-small dense | 21 | 23 | 16.1 / 20.1 ms |
| E5-small + lexical RRF | 19 | 23 | 23.5 / 29.2 ms estimated sequential |
| BGE-M3 dense | 22 | 24 | 88.7 / 107.0 ms |
| BGE-M3 + lexical RRF | 20 | 23 | 98.1 / 115.3 ms estimated sequential |

Timing covers warm CPU tokenization, single-query encoding, cosine comparison
and ranking over 164 documents. It excludes HTTP/network, model loading, STT
and TTS. Hybrid timing adds separately measured lexical and fusion time.
Corpus encoding took 6.4 seconds for E5 and 70.9 seconds for BGE. E5 truncated
one of 164 documents (maximum 871 tokens vs its 512-token limit); BGE truncated
none (maximum 869 tokens vs 8192). Neither truncated a question. Results compare
the models' normal documented token limits, not identical retained token counts.

Experimental policy results use held-out groups, with per-fold training thresholds:

| Method | Correct decisions / 30 | Correct confident answers / 24 answer cases | Incorrect confident answers | Clarification cases correct / 3 | No-support cases correct / 3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| E5-small dense | 19 | 16 | 1 | 0 | 3 |
| E5-small + lexical RRF | 14 | 11 | 1 | 0 | 3 |
| BGE-M3 dense | 25 | 19 | 0 | 3 | 3 |
| BGE-M3 + lexical RRF | 22 | 17 | 1 | 2 | 3 |

BGE dense declines five answerable questions (two clarifications and three
no-support decisions). Its zero observed incorrect confident answers is not a
production guarantee. E5's unsafe answer was a clarification case; BGE hybrid
also answered a clarification case confidently. The frozen set has only three
cases per non-answer class and was authored from this corpus. These are
exploratory comparisons, not proof of generalization or working speech.

**Recommendation:** carry BGE-M3 dense forward to an untouched question set,
including both missed functional requests, near-neighbor product codes, broad
ambiguous requests and absent items. E5-small remains a useful low-resource
fallback candidate, but its simple policy performs worse here. Retain lexical
search for identifiers and outages; this measurement does not justify enabling
the tested equal-weight RRF fusion, which reduces top-1 for both models. A future
hybrid needs evidence-aware exact-match handling and separate measurement.
Do not tune synonyms, fusion or thresholds against these same labels and then
claim an independent improvement.

Read-only runtime inspection found the Spark reachable over existing SSH with
about 12 GiB available shared RAM and an existing llama-server occupying roughly
37 GB resident memory. No process, image or model there was changed. CPU execution
on the laptop avoided interference with that service. A read-only DNS/TCP probe
from the existing production host could not resolve Spark's configured corporate
hostname; the TCP connection therefore could not be established. This proves
that this hostname is unusable from that host at measurement time, not that
all possible Spark routes are impossible. No embedding HTTP service was created
or tested during that comparison. The subsequent [Ollama01 staging setup](EMBEDDING-SERVICE.md)
now has a verified authenticated CPU API reachable from Mimer and Portainer;
GPU production migration and application acceptance remain deployment gates.

Validation: frozen reviewed baseline and SQLite audit pass; both saved-vector
comparison audits pass; Python compilation and policy safety probes pass;
`npm run check` passes all 48 application tests. The probe verifies that a high
similarity ambiguous result counts as an unsafe answer and calibration prioritizes
avoiding it. No application, HA configuration, physical audio, printer or
production inventory was changed. Keep the private inputs, vectors and reports.

## Ollama GPU endpoint comparison (2026-10-22)

Ran the unchanged frozen 164-document/30-question set through the authenticated
`http://10.0.0.47:11434/v1/embeddings` endpoint with `bge-m3:cpu4`.
Private reports, vectors and archived evaluators are in
`data/evaluation/live-2026-10-20-40bea18b/ollama-20261022T210450Z/`.
The earlier probe run is retained separately; no baseline was overwritten.

- Retrieval: 22/24 correct top-1 and 24/24 top-5. All 30 first-ranked boxes
  match the prior Hugging Face BGE-M3 run, including the non-answer cases.
- Grouped decision policy: 25/30 correct, 19 correct confident answers, zero
  incorrect confident answers. All three clarification and three unsupported
  cases are correct; five answerable requests are declined. Transferring the
  original held-out-fold thresholds unchanged gives the same metrics.
- Sequential LAN HTTP query p50/p95/max: 29.4/44.2/47.5 ms. Encoding all
  documents in batches of eight took 2.55 s. These timings exclude STT/TTS,
  local ranking and concurrent application traffic. A preceding run had
  p50/p95/max 28.0/49.5/78.3 ms and identical retrieval/decision metrics.
- Minimum corresponding vector cosine versus the prior runtime: 0.999784
  for documents and 0.999980 for queries. Vectors are finite, normalized and
  1024-dimensional. The longest real document is 869 tokens; single/batch
  cosine is 0.9999993. All 164 documents fit the measured endpoint limit.
- **Long-input limitation:** this OpenAI-compatible route silently truncates
  at 2048 tokens, returning HTTP 200. Inputs of 2049-4302 local tokenizer
  tokens report 2048 used tokens. A changed tail beyond the boundary and
  an input ending at 2048 tokens produce identical vectors (maximum component
  difference zero). Do not infer this route's effective input length from
  the loaded Ollama context or the model's 8192-token architecture. Runtime
  integration must explicitly detect/handle oversized documents, or separately
  verify a changed service configuration before relying on longer inputs.

Reproduce using the existing evaluation environment and an external credential
file containing `STORAGESYSTEM_API_KEY` (the script never prints its value):

```powershell
& data/evaluation/.venv/Scripts/python.exe -X utf8 scripts/evaluate-ollama.py `
  data/evaluation/live-2026-10-20-40bea18b --secrets-file $credentialFile
```

Each execution creates a new result directory and archives both evaluators.
It uses the already cached pinned BGE-M3 tokenizer without downloads.
To audit saved evidence without credentials or endpoint access:

```powershell
& data/evaluation/.venv/Scripts/python.exe -X utf8 scripts/evaluate-ollama.py `
  data/evaluation/live-2026-10-20-40bea18b `
  --audit data/evaluation/live-2026-10-20-40bea18b/ollama-20261022T210450Z
```

Saved-vector/hash/ranking/group-policy audits, frozen reviewed-data/SQLite
validation and all 48 application checks pass. Missing API key returns 401.
This passes the frozen endpoint comparison for the current corpus; it does not
satisfy untouched-question, application integration, failure recovery or speech
acceptance. No application settings, inventory, production service, HA or
printer configuration was changed. Application version remains 0.9.1-dev.

## Next work

1. The prospective user-query comparison below is complete. Keep its baseline
   frozen; it is now development/regression evidence, not a fresh holdout for
   subsequent policy changes. Retain separate unseen acceptance questions,
   including unsupported items, before claiming generalization.
2. The 0.10.1-dev verified identity preview below repairs the known object-type
   failure in regression. Independently validate it and decide the production
   verifier/latency budget before runtime activation. All failed baselines remain
   preserved; repaired repetitions are not fresh acceptance.
3. The Ollama01 route and frozen endpoint comparison are verified. Before runtime
   integration, enforce explicit input-length handling for its measured 2048-token
   limit and test failure/recovery and representative concurrent load. Do not
   replace the Spark image model.
4. Only then implement versioned background vectors and decisions through the
   shared UI/REST/MCP services, followed by disposable real-HA acceptance.

## Prospective user-query comparison (2026-10-22)

The owner supplied 20 questions in their usual short spoken style, mostly one
word, before any retrieval run on those queries. Proposed labels were derived
from the frozen source and then confirmed/corrected by the owner before inference.
Exact written queries are retained, including `Skrivdragare`, whose intended
meaning was confirmed as drill/driver. This is not an audio/STT test.

Private source-bound labels: `questions-v2.user-reviewed.json` in the existing
evaluation directory. Draft labels remain unchanged separately. The new dataset
has 19 answer cases and one clarification case, with no unsupported cases.
Some topics/candidate boxes overlap the original evaluation: do not characterize
the whole set as independent semantic groups.

Owner-confirmed response distinctions:

- Extension leads: include both the power-strip inventory and the long extension
  leads. This is an explicit exception to the default one-destination voice
  target; short relevant alternatives are wanted here. Euro extensions were not
  included in this interpretation of the owner's "both" correction.
- Solder: either documented destination is acceptable.
- Network cable: ask whether a finished cable is wanted, distinguishing it from
  bulk cable used to make cables. The written query was intended to mean finished
  cable, but the requested interaction still includes that clarification.
- The remaining proposed labels were accepted. Drill bits, nails and M4 screws
  accept either listed location; the specifically named appliance-cable inventory
  is the primary label for that query.

Before querying the new set, a single similarity/margin policy was selected
using only all 30 old reviewed questions and their saved Ollama endpoint scores,
with the existing conservative calibration algorithm. Thresholds were saved in
the run's preflight file before inference: similarity 0.4648578763, margin
0.0110705495. No threshold was fitted to the new questions. Saved corpus vectors
were reused; a live sentinel document cosine above 0.99999 checked compatibility.
The production application and shared search implementation were not changed.

Results saved in `user-ollama-20261022T213348Z/`:

| Measurement | Result |
| --- | ---: |
| Lexical top-1 / answer cases | 14/19 |
| Lexical top-5 / answer cases | 15/19 |
| BGE-M3 endpoint top-1 / answer cases | 18/19 |
| BGE-M3 endpoint top-5 / answer cases | 19/19 |
| Fixed-policy correct selection/decision cases | 15/20 |
| Correct confident answers | 15 |
| Incorrect confident decisions | 1 |
| Query HTTP p50 / p95 / max | 16.9 / 29.8 / 40.5 ms |

The incorrect confident decision is network cable: it selects the intended
finished-cable box but fails the explicitly required clarification. Nails has
an incorrect first candidate (wood screws), with an accepted nail destination
in the top five; the policy declines it. LED strips and drill bits have correct
first candidates but are declined. Extension leads has both requested boxes
in the top five, but the policy asks for clarification instead of answering.
Top-1/decision metrics do not verify that both destinations are actually spoken;
speech generation/runtime is still unimplemented and untested.

**Conclusion:** retrieval improves substantially for the owner's short queries,
but the original score/margin-only decision policy does not pass product
acceptance. Short-query exact evidence, related item types, acceptable multiple
destinations and meaningful clarification need explicit shared application rules.
Keep the observed failure cases as regression evidence; preserve independent
questions for validating any revised policy.

Reproduce lexical rankings once (exclusive output), then run the endpoint test
with a new exclusive result directory:

```powershell
node scripts/evaluate-user-lexical.js data/evaluation/live-2026-10-20-40bea18b
& data/evaluation/.venv/Scripts/python.exe -X utf8 scripts/evaluate-user-questions.py `
  data/evaluation/live-2026-10-20-40bea18b --secrets-file $credentialFile
```

Skip the lexical command when `lexical-user-v2.json` already exists; it refuses
to overwrite it. Saved evidence can be audited without endpoint access:

```powershell
& data/evaluation/.venv/Scripts/python.exe -X utf8 scripts/evaluate-user-questions.py `
  data/evaluation/live-2026-10-20-40bea18b `
  --audit data/evaluation/live-2026-10-20-40bea18b/user-ollama-20261022T213348Z
```

## Shared decision preview regression (0.10.0-dev)

`src/answer-policy.js`, called through `Inventory.previewAnswer`, now separates
current direct evidence from supplied semantic candidates and from explicit
owner interaction rules. No production thresholds or query-specific synonyms
were added to shared search. The prior-only similarity/margin values remain
unchanged. The original corpus, endpoint vectors and question labels are reused
read-only; no new inference or inventory enrichment was used for this step.
See [ANSWER-POLICY.md](ANSWER-POLICY.md) for service behavior and limits.

Whole-word label/keyword/summary evidence now puts an acceptable candidate first
in all 19 user answer cases, including nails. Literal current evidence prevents
the generic score floor from discarding the unambiguous LED-strip match.
However, literal evidence cannot establish what alternatives the owner accepts:
six explicit rules encode the previously confirmed distinctions for extension
leads, solder, finished/bulk network cable, drill bits, nails and M4 screws.
These private rules are supplied by the evaluation caller, not hardcoded in the
shared module or saved to the running app's settings.

| Development regression | Correct decisions / cases | Incorrect confident answers | Accepted first candidate / answer cases |
| --- | ---: | ---: | ---: |
| New user questions, generic logic only | 14/20 | 1 | 19/19 |
| New user questions, six explicit owner rules | 20/20 | 0 | 19/19 |
| Original questions, generic logic only | 27/30 | 0 | 22/24 |

The configured 20/20 result includes both required extension-lead destinations
in the actual returned answer text and the finished-network-cable question.
The generic-only result must be reported alongside it: owner preferences are
configuration, not evidence of learned generalization. Without those rules,
multiple direct matches cause conservative clarification, while a literal
network-cable label still fails the required type-clarification interaction.

Three old cases remain declined: functional plastic cable ties (Q07), collecting
workshop shavings (Q09) and the English dimension-specific heat-shrink request
(Q24). No old clarification/unsupported case becomes a confident incorrect
answer. These are known remaining limitations, not omitted acceptance failures.

Final private reports are `policy-v5-user-generic/`,
`policy-v5-user-configured/` and `policy-v5-original-generic/`. Earlier development
runs are retained separately. Each report stores source hashes, archived shared
service/evaluator code, thresholds, every selected ID, reason and formatted
answer. The evaluator verifies source sessions/current locations, database
integrity and absence of inventory changes. It checks the complete response
selection, including the required two destinations, rather than only top-1.

Reproduce with a new output-directory name each time:

```powershell
$evaluationRoot = 'data/evaluation/live-2026-10-20-40bea18b'
node scripts/evaluate-answer-policy.js $evaluationRoot `
  questions-v2.user-reviewed.json user-ollama-20261022T213348Z/report.json `
  "$evaluationRoot/policy-new-user-configured" answer-rules.user-reviewed.json
```

Omit the rules argument to measure the generic policy. For the old questions,
use `questions-v1.reviewed.json` and `ollama-20261022T210450Z/report.json`.
Saved reports can be audited with the matching current code, without inference:

```powershell
node scripts/evaluate-answer-policy.js --audit $evaluationRoot `
  "$evaluationRoot/policy-v5-user-configured"
```

All three saved audits pass. Six new synthetic decision tests pass alongside
the existing suite (54 total), also in the pinned Node 24.14 Docker build using
the separate `storagesystem-base:decision-preview-0.10.0` tag. The existing
development container/image/volume was not replaced or restarted.

These results were obtained after inspecting the question failures and are
development/regression evidence, not an independent holdout. New unseen cases
must validate the revised policy. Public ask/search, browser, REST/MCP and HA
retain their existing behavior. Runtime vectors, length/failure handling,
persisted owner-rule management, follow-up context and physical speech acceptance
remain planned.

## Frozen-policy source-derived check: acceptance-v3

After the development preview was frozen, 30 new questions were authored from
the unchanged inventory source, with no duplicate query strings from either
previous set. Labels, source evidence and acceptance criteria were saved before
any retrieval scores were obtained. No new owner interaction rules were supplied
and the policy files/thresholds were not changed after seeing the result.

The set has 15 documented-item cases (including current moved locations), five
cases with several directly documented destinations, and ten unsupported-item
or near-neighbor-code probes. Some topics are related to previous questions;
this is not a fully disjoint semantic-group sample. Expected clarification is
the documented conservative default, not a newly confirmed owner preference.
Unsupported labels mean no supporting inventory evidence after source review,
not proof that the objects are physically absent. Literal-absence checks cannot
exclude every synonym. The same agent authored the policy and source-derived
cases: this check is prospective but is **not independent human-labelled
acceptance**. No microphone/STT work was performed.

Preregistered criteria: at least 27/30 correct decisions, **zero incorrect
confident answers**, unchanged inventory and a passing database integrity audit.

| Expected behavior | Correct / cases |
| --- | ---: |
| Supported answer | 15/15 |
| Default clarification | 5/5 |
| No supported match | 9/10 |
| Total | 29/30 |

**Product gate: FAIL.** The thermal-camera query (`Värmekamera`) selects the
small heat gun (`Värmepistol (liten)`) and formats a confident location answer.
That is a different object type with no supporting thermal-camera inventory
evidence. A high semantic score/margin does not establish identity. Preserve
this failure as regression evidence; do not retune the global threshold on the
new labels and call the repeated run independent acceptance. The next policy
change needs evidence for requested identity/type or must clarify/abstain.

Live query HTTP p50/p95/max was 16.5/38.1/46.2 ms. Existing document vectors were
reused with corpus/vector hashes and an endpoint sentinel compatibility check;
all new query vectors are finite normalized 1024-dimensional vectors. No new
inference was used to change inventory descriptions, labels or expected answers.

Private evidence under the existing evaluation directory:

- `acceptance-v3/freeze.json`: policy source hashes and prior-only thresholds,
  saved before authoring the questions.
- `acceptance-v3/questions.json`: source-evidence labels, limits and preregistered
  criteria, saved before inference.
- `acceptance-v3/endpoint-20261022T215227Z/`: new vectors, all semantic rankings,
  source hashes, archived inference evaluator and timings.
- `acceptance-v3/decision-first-run/`: initial failed result, preserved.
- `acceptance-v3/decision-audited-run/`: identical failed decisions with full
  reproduction/answer audit metadata and archived policy/verifier source.

Reproduce query inference with a fresh exclusive output directory (external
credential path supplied via `$credentialFile`):

```powershell
$evaluationRoot = 'data/evaluation/live-2026-10-20-40bea18b'
& data/evaluation/.venv/Scripts/python.exe -X utf8 scripts/evaluate-source-acceptance.py `
  $evaluationRoot --secrets-file $credentialFile
```

Score a saved inference report with a fresh output name. Exit status 1 indicates
that the preregistered product gate failed, not an infrastructure/tool failure:

```powershell
node scripts/verify-source-acceptance.js $evaluationRoot `
  acceptance-v3/endpoint-20261022T215227Z/report.json `
  "$evaluationRoot/acceptance-v3/decision-new-run"
```

Audit saved evidence without credentials, inference or inventory writes:

```powershell
& data/evaluation/.venv/Scripts/python.exe -X utf8 scripts/evaluate-source-acceptance.py `
  $evaluationRoot --audit "$evaluationRoot/acceptance-v3/endpoint-20261022T215227Z"
node scripts/verify-source-acceptance.js --audit $evaluationRoot `
  "$evaluationRoot/acceptance-v3/decision-audited-run"
```

Both audits pass and reproduce the failed gate. Existing source/labels and the
decision implementation remain unchanged. All 54 application checks still pass;
passing unit checks does not override the failed product check. No production,
development runtime settings, inventory, HA, printer or service configuration
was changed. Version remains 0.10.0-dev for this validation-only step.

## Verified identity preview regression (0.10.1-dev, 2026-10-23)

The former semantic-only fallback treated a high similarity/margin as sufficient
to assert an object's location. It now requires current source-bound identity
evidence. `Inventory.verifiedPreviewAnswer` obtains that evidence through an
explicit injected verifier, while `previewAnswer` alone abstains without it.
Current direct evidence and owner rules are unchanged. See ANSWER-POLICY.md for
protocol bounds and the trusted-caller boundary.

Live text-only tests reused the already running Spark llama.cpp service and
`qwen3.8-flash-next-uncensored`. No remote service/model, image-analysis setting,
inventory, HA or production configuration changed. There were no paid provider
calls and no image downloads. The verifier receives label, summary, keywords
and current photo-note text, with no box IDs or location fields. It must return
a same-item verdict and an exact source quotation. Application code binds the
proof to query, any explicitly confirmed intent, box/session and current text,
then formats the existing stored location. Quotes prove source provenance, not
logical truth; the model can still make classification mistakes.

Initial development checks exposed two such mistakes: interpreting light-level
meter as sound-level meter (11/12 on the first synthetic suite) and brushed motor
as brushless motor (7/8 on the first new synthetic probe). Both failed runs remain
saved. General near-name substitution and explicit negative-property guards
were added. Automatic speech normalization is still deferred; the owner set's
pre-existing confirmed `Skrivdragare` intent is supplied explicitly, rather than
silently correcting an unconfirmed object name.

Final saved regressions with the updated verifier:

| Set | Correct decisions / cases | Incorrect confident answers | Identity calls |
| --- | ---: | ---: | ---: |
| Former failed source-derived check | 30/30 | 0 | 1 |
| Owner questions, six owner rules and one confirmed intent | 20/20 | 0 | 5 |
| Original reviewed questions | 27/30 | 0 | 14 |

The unchanged old Q07/Q09/Q24 cases remain declined because the existing
similarity/margin gates do not authorize verification. The new default without
a verifier is deliberately more conservative; the table above requires the
explicit local verifier and, for the owner set, the confirmed rules/intent.
It must not be presented as a general model-quality gain with no extra dependency.

The repaired synthetic regression suite passes 12/12 and the repeated held-out
probe passes 8/8. The latter is now regression evidence after the failure and
fix; it is not an independent passed holdout. These same-agent synthetic/source
checks do not replace human-labelled independent acceptance.

Warm source verification observed roughly 1.4-4.2 seconds per call across the
live runs, in addition to retrieval. Direct current evidence needs no verifier
call. An early standalone chat probe took 29.4 seconds and the first 15-second
identity attempt timed out; the model catalog/health endpoint alone did not
establish inference latency. Evaluation explicitly used 60 seconds, while the
adapter defaults to 15 seconds. Unknown, busy, oversized, malformed and timed-out
checks cannot authorize a semantic-only answer. Production latency, cold starts,
concurrency/shared image-model load and a route independent of laptop/GSA remain
open. No production verifier endpoint has been chosen or activated.

Final private reports in the existing evaluation directory:

- `verified-identity-source-v5/`, `verified-identity-user-v5/` and
  `verified-identity-original-v5/`: live responses reduced to validated source
  evidence, every decision, model/config metadata, source/code hashes and replay
  inputs. The model is not queried during offline replay.
- `verified-identity-synthetic-v1/`: preserved first 11/12 synthetic failure.
- `verified-identity-synthetic-v2/`: repaired 12/12 regression.
- `verified-identity-holdout-v1/`: preserved first 7/8 new probe failure.
- `verified-identity-holdout-regression-v2/`: repaired 8/8 regression.

All results are exclusive new directories; prior model/corpus/vector/question
baselines are retained. Source notes remain the frozen inventory's text, not
newly verified physical facts. No threshold was retuned or inventory text enriched.

Reproduce explicitly with an external key file and chosen local base/model:

```powershell
$evaluationRoot = 'data/evaluation/live-2026-10-20-40bea18b'
node scripts/evaluate-verified-policy.js $evaluationRoot `
  questions-v2.user-reviewed.json user-ollama-20261022T213348Z/report.json `
  "$evaluationRoot/verified-identity-new-run" `
  $identityKeyFile $identityBaseUrl $identityModel answer-rules.user-reviewed.json
```

Replay and verify saved identity evidence/decisions without credentials or inference:

```powershell
node scripts/evaluate-verified-policy.js --audit $evaluationRoot `
  "$evaluationRoot/verified-identity-user-v5"
```

The same command audits the source/original v5 directories. All three reproduce
their full decisions and source/code hashes; SQLite integrity and no-write
checks pass. `scripts/verify-identity-live.js` explicitly runs synthetic model
checks, with `holdout` selecting the additional eight cases; every run writes
its cases/code hashes before inference and refuses to overwrite evidence.

All 63 automated tests pass locally and in the pinned Node 24.14 Docker build
under `storagesystem-base:identity-preview-0.10.1`. Unit tests use synthetic HTTP
sources and include quotes, stale sessions, current-vs-historical photos,
confirmed-intent binding, API failure, timeout, busy guard and property/name
distinctions. Public browser/REST/MCP/HA behavior is unchanged. Runtime vectors,
settings/alias management, identity endpoint/latency selection and fresh
independent acceptance remain required before activation.

## Native runtime retrieval regression (0.10.2-dev, 2026-10-23)

The optional runtime now builds `current-contents-v1` documents directly from the
shared inventory projection: label, current summary/keywords and current-photo
notes, without historical text, IDs, locations or filenames. This differs from
the earlier frozen corpus serialization, so this is a new retrieval regression.
No decision thresholds or owner labels were changed.

The final saved run is private `runtime-native-v4/` under the existing evaluation
root. Its preflight hashes and archived code were written before inference;
source inventory/dataset hashes and the in-memory inventory were unchanged after
the run. Native BGE-M3 (`bge-m3:cpu4`, digest
`9e26be65788ce58be5d2e767ee06b01fa3d31881346fc18b57909442268e4e7a`)
indexed all 164 current documents into a separate SQLite cache in about 5.02 s.

| Dataset | Answer cases | Top-1 | Top-5 |
|---|---:|---:|---:|
| Original reviewed questions | 24 | 23 | 24 |
| Owner's short questions | 19 | 18 | 19 |

These are candidate retrieval results, not spoken-answer decisions. Clarification
and unsupported-item cases are not counted as answer retrieval cases. Existing
questions are regression evidence, not new independent acceptance. The optional
management decision preview has no configured semantic thresholds/identity proofs
or private owner rules and does not authorize semantic-only answers.

Native requests use `truncate: false`; the model digest is checked before every
request. A 10000-word input produced an actual HTTP 400 context-length rejection
and the adapter returned no vector. Cache metadata binds every vector to its
document version/content/current session/model profile. Cached/query vectors,
full rankings, source/code hashes and metrics are saved. Offline audit reproduced
every cosine score/ranking and metric and checked current sessions/content/profile
and both archived/current code hashes without network access:

```powershell
node scripts/verify-semantic-live.js --audit $evaluationRoot `
  "$evaluationRoot/runtime-native-v4"
```

The native test used a temporary localhost SSH tunnel to the existing Ollama
process. Both authenticated LAN native routes returned 404; no gateway/service
configuration was changed. Deployment routing remains open, with no fallback to
the silently truncating compatible endpoint. The temporary tunnel was closed
after testing. See SEMANTIC-RUNTIME.md for runtime configuration and limits.

All 73 automated tests pass on Windows and pinned Node 24.14 Docker. A separate
`storagesystem-base:semantic-preview-0.10.2` image was built; the existing dev
service/image/volume was not replaced. Preview is disabled by default and limited
to management endpoints. Public browser/REST/MCP/HA behavior remains unchanged.
