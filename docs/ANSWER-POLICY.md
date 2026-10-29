# Inventory answer decision preview

Implemented in 0.10.0-dev with a verified preview added in 0.10.1-dev, not activated
in public search/ask, browser, REST, MCP or Home Assistant. Its purpose is to
evaluate selection and answer behavior before public activation. Optional runtime
embeddings arrived in 0.10.2-dev; saved rule/model configuration and management UI
arrived in 0.11.0-dev. See SEMANTIC-RUNTIME.md.

Source 0.30.0-dev now connects the verifier to the management preview through
optional saved endpoint/model/key, timeout and explicit thresholds. Old settings
default to disabled with no thresholds. Production remains 0.29.0 with embeddings
disabled; the implementation is not public-search activation. See the runtime
document for the isolated 166-box functional/latency check and its acceptance limits.

## Service boundary

`Inventory.previewAnswer(query, options, language)` reads current inventory and
calls `previewAnswerDecision` in `src/answer-policy.js`. Options contain:

- `semanticMatches`: unique `{ boxId, sessionId, similarity }` records supplied
  by a trusted retrieval caller. Unknown boxes, stale sessions, duplicate IDs,
  non-finite scores or scores outside [-1, 1] are rejected.
- `thresholds`: explicit `{ similarity, margin }` values. No production values
  are built into the module. Without thresholds, only direct evidence can answer.
- `rules`: explicit owner-reviewed interaction rules, described below.

The result contains `query`, short `answer`, `decision`, `reason`, selected box
IDs, detailed `matches` and source `decision-preview`. Decisions are `answer`,
`clarify` and `no_supported_match`. `matches` are evidence-aware candidate
rankings; they are not the unchanged public lexical search ranking. Returned
locations always come from current stored box locations, never candidate/model
location fields. No network call, persistent setting or inventory write occurs.

## Evidence and decisions

Whole-word evidence is checked across current labels, item keywords and summaries.
Swedish inflections, accents and compound spacing are normalized; short fuzzy
substrings are not treated as direct evidence. Exact identifiers/labels take
precedence over keyword and combined-field matches. Several equally direct
matches cause clarification unless an explicit rule establishes acceptable
alternatives. Direct evidence may support a short query even when its cosine
falls below a threshold calibrated on longer sentences.

Product codes/numbers must retain exact supported values, with common attached
measurement units separated for matching. Current photo notes can support code
presence but cannot independently create direct evidence. Candidates with a
matching negated clause in the current summary or keywords are excluded.
Negation detection is conservative lexical handling, not full language parsing.
Historical contents are not searched by this preview. The 0.11.0-dev rule editor
shares rule validation with settings import/audit/restore and the policy. A
bounded Swedish cable inflection family handles `kabel`/`kablar` (and compounds)
without spelling correction or relaxing product-code constraints. This ensures a
saved finished-cable clarification is actually used rather than merely returning
a generic clarification with the same decision category.

Without direct evidence, thresholds only qualify a semantic candidate for
verification. A high score/margin alone no longer authorizes an answer. Filtering
code mismatches does not increase the margin: the best original competitor still
constrains it. Without a comparison candidate, the service abstains. Existing
lexical filename/history search is a separate public path and has not been
replaced by this preview.

## Optional item identity verification (0.10.1-dev)

`Inventory.verifiedPreviewAnswer(query, options, verifier, language)` first runs
the synchronous policy. Only a candidate passing the unchanged semantic gates
but lacking direct object evidence is sent to `verifier.verify`. The model gets
the query, label, summary, keywords and current photo-note text, without IDs,
locations, credentials, image binaries or historical contents. No image is
downloaded or analyzed for this check. Existing photo notes may themselves contain
earlier AI mistakes; source quotation is not physical verification.

`src/identity-verifier.js` implements a bounded local OpenAI-compatible text
adapter, tested against the existing Spark llama.cpp model. It requires a
structured same-item verdict and an exact contiguous quote from the supplied
current source. Related objects, unknown qualifiers and invented quotes cannot
authorize an answer. Deterministic guards reject near same-length item-name
substitutions and unsupported negative properties (`-lös`, `-fri`, `less`, `free`)
instead of letting the model silently reinterpret them. The latter guard is
conservative and can reject legitimate cross-language property synonyms.

The application binds evidence to the original query, current session, optional
confirmed intent and exact source quote. It re-reads inventory after inference;
changed sessions or removed photo notes invalidate the result. Model outputs
never choose a new box or format a location. A valid quote checks provenance,
not logical entailment: identity checking remains probabilistic and requires
independent acceptance.

Raw `identityEvidence` is trusted internal data and must never be accepted from
public request bodies. `verifiedPreviewAnswer` rejects caller-supplied evidence.
`confirmedIntent` is likewise trusted caller configuration for an explicitly
confirmed interpretation. The evaluation uses the owner's pre-existing
`Skrivdragare` → `Skruvdragare` confirmation; there is no new automatic STT
normalization or persisted alias setup.

The adapter uses a single-instance busy guard, no retries/redirects, a 64 KiB
response cap, 256 output tokens, bounded source fields, and a 15-second default
timeout. Unavailable, timed-out, malformed or unsupported verification cannot
authorize a semantic-only answer; direct inventory evidence still works. No
provider/model/key is enabled or persisted automatically. Evaluation explicitly
uses a 60-second timeout against the already running local model. Production
model/threshold acceptance, rule/intent configuration, latency budget and resource
sharing acceptance with image analysis remain open. Native deployment reachability
was verified on 2026-10-29; management runtime wiring exists in source 0.30.0-dev.

## Owner interaction rules

Rules are explicit configuration, not hardcoded inventory identities or hidden
synonyms in the policy. Each has an ID, query aliases, current box IDs and action:

```json
{
  "id": "connector-kind",
  "queries": ["connector"],
  "boxIds": ["CONNECTOR-PARTS", "ASSEMBLED-CONNECTORS"],
  "action": "clarify",
  "question": {
    "en": "Do you need a finished connector?",
    "sv": "Behöver du en färdig kontakt?"
  }
}
```

`clarify` asks the localized question; `any` permits one of the confirmed
equivalent destinations; `all` includes both required destinations. Rules are
bounded to 100, with up to 30 aliases and 25 unique boxes per rule. `all` is
limited to two destinations for short answers. Every configured box must have
current direct evidence for the query; absent/changed contents cause generic
clarification rather than blindly following a stored rule. Conflicting matching
rules also cause clarification. Missing translations use a generic question in
the requested language, not an unannounced language switch.

The six evaluation rules remain private test evidence, not shipped defaults.
Rule-management UI and configuration persistence are implemented through Search &
answers (`searchWorkspace` settings); saving a rule affects the management preview,
not public answers. Follow-up conversation handling and runtime identity/threshold
configuration remain planned. Do not assume evaluation rules were saved to production.
The module does not infer which alternatives a person considers equivalent.

## Verification

`npm run check` includes decision and verifier fixtures alongside the existing
suite. The 0.29.0 application has 116 tests as of 2026-10-29; 63 was the
count at the initial verifier implementation. They check evidence versus wrong semantic candidates,
current locations/read-only behavior, identifiers and units, competing
destinations, rule failure/translation behavior, stale sessions, historical and
negated contents, source-bound identity proofs, unavailable verification and
concurrent inventory changes. The pinned Node 24.14 Docker build runs the same tests.

`scripts/evaluate-answer-policy.js` runs the real shared service over the
read-only private evaluation SQLite database with saved, source-bound semantic
scores. It writes new exclusive result directories with archived source and
hashes. `--audit ROOT OUTPUT_DIRECTORY` recomputes every selection, response and
metric, verifies source/code hashes and runs SQLite audit without inference.
See [SEMANTIC-EVALUATION.md](SEMANTIC-EVALUATION.md) for exact results.

These are development regression results after inspecting failures, not a fresh
independent holdout. Optional endpoint ingestion, versioned vectors, long-input
rejection and failure handling are now implemented in the management-only runtime.
Production native-route verification, verifier/threshold integration, fresh acceptance
and physical speech acceptance remain required before semantic voice activation.

A subsequent frozen-policy source-derived check (30 new questions) scored 29/30
but failed its zero-incorrect-confident-answer gate: a thermal-camera request
selected a heat gun. Pure semantic similarity and margin do not establish object
identity. The implementation was deliberately unchanged while that failed result
was recorded; the next section describes its subsequent verified-preview repair. This remains a preview, not release acceptance; see the acceptance-v3
section in SEMANTIC-EVALUATION.md.

The 0.10.1-dev verified preview repairs that failure in regression: 30/30 on
the source-derived set, 20/20 on the owner set with six explicit rules and one
previously confirmed intent, and 27/30 on the old set. The same three old
functional/English cases remain declined. A new synthetic probe found a
brushed/brushless confusion; its first failed result is retained and the new
negative-property guard repairs it in regression. These repeated results are
not fresh independent acceptance. See SEMANTIC-EVALUATION.md for all runs,
source hashes, remaining limits and actual inference timings.
