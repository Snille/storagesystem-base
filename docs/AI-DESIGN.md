# AI behavior and remaining design

Current for 0.28.0. Image inventory and candidate-based public answer phrasing are
implemented. Translation drafting, an independent Inventory answers task/settings
panel and automatic photo-to-box matching are not implemented. Semantic selection
has a separate [preview policy](ANSWER-POLICY.md) and is not enabled publicly.

## Implemented ownership and controls

**AI assistance** provides an overview, named **Connections** and **Image inventory**
settings. Connections hold provider, endpoint and credentials once; the task selects
its model, output language, role suggestions, extra instructions and optional fallback
connection/model. Supported adapters are OpenRouter, llama.cpp and OpenAI-compatible
services. Changing connection identity clears credentials; views redact saved keys.
Tests/model discovery are explicit and do not prove image capability.

The deployed route chosen after the recorded 15-box comparison is OmniRoute
`cx/gpt-6-luna`, with Ollama01 `qwen3-vl:8b-instruct-16k` as fallback. Evaluation,
cost and model limitations are recorded in [History](HISTORY.md), versions 0.15.2,
0.21 and 0.22. Optional future comparisons require real photo/OCR and multiple-photo
measurements; model names or token prices alone are insufficient.

The interface and external-response default are independent. AI language can be
English, Swedish, German or follow the external-response default (`app` legacy
value). It does not translate saved contents. See [README](../README.md#languages).

## Image workflow

1. Select one to six photos and assign label/inside/spread/location/detail roles.
   Manual roles are retained. Explicit analysis shows the route and selected photos.
2. Send bounded preview images and, for an existing box, the open editor's contents.
   Return a combined name, summary, keywords, uncertainty and one interpretation
   per selected image. Model indices are mapped back to the selected assets.
3. Review/edit suggestions and photo descriptions. Transfer them to the ordinary
   editor or explicitly apply them to the existing box draft. Name replacement for
   an existing box is optional. This does not save inventory.
4. Save an inventory session through the shared service, rechecking source,
   membership, ownership and current-session guards. IDs/locations come from app
   logic and owner choices, not model-generated destinations.

Immich uses its larger JPEG preview, not the small WebP thumbnail. Each image is
bounded to 8 MiB, total 16 MiB. Analysis has a 90-second timeout and a process busy
guard. Requests bind task/source snapshots; changed configuration or inventory
invalidates results. No network call occurs inside an inventory transaction.

The fallback is explicit: route/model must be configured together. Selected route
failures or unusable output can invoke it; a stale-settings/inventory conflict
cannot. Results show when fallback was used. There is no unbounded retry loop.

## Instructions and validation

Built-in instructions remain inspectable but read-only; task extra instructions
are editable. Full prompt management was closed by the owner on 2026-10-24.
Do not restore per-model/role raw prompt editors as unfinished required work.
Legacy AI/prompts/customization records remain preserved but inactive; they are
not silently converted into active settings.

OpenRouter and compatible requests send a strict output schema; the application
also validates non-empty text, exact photo-index coverage and unusable CJK output.
Existing-box updates retain saved keywords and de-duplicate them. llama.cpp disables
template thinking explicitly. These guards reduce malformed output; they do not
verify quantities, OCR, object identity or factual accuracy. The owner must review.

## Public answers and future selection

`POST /api/public/ask` runs shared lexical inventory search, then can phrase the top
five matches with the image task's route/fallback, in the requested language. Routes
have a 15-second answer timeout. Empty/unusable output or an answer speaking internal
box/location IDs falls back to the local answer. The response contract remains
`{query, answer, source, count, matches}`; `source` can be `ai` or `search`.

This is answer phrasing, not semantic lookup or independently verified destination
selection. The proposed stricter one-destination/clarification/abstention policy
belongs in application logic; optional phrasing must respect its selected stored
locations. Public phrasing today is not proof that this future policy is active.
See [Voice search](VOICE-SEARCH.md) for button activation and follow-up requirements.

## Deferred tasks

- Independent answer-task connection/model controls, if needed; current phrasing
  shares the image route.
- Translation editing/drafts/export in language maintenance, keeping inventory text
  separate and reviewed before saving.
- Compatible handling of imported language overrides if still wanted.
- Runtime identity configuration and independent acceptance before semantic answers.

Manual inventory and lexical search remain usable when AI is unavailable. Provider
errors must not expose credentials/raw upstream bodies. Test with synthetic or
isolated inventory; real provider calls are separate from ordinary offline checks.
