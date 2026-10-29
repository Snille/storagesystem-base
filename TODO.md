# Remaining work

Reviewed 2026-10-30 for production/source 0.30.0. This file contains outstanding actions
only; delivered behavior is in [Status](docs/STATUS.md) and [History](docs/HISTORY.md).
Order is suggested. Optional work is not a production blocker.

## Search follow-up

- [ ] Add bounded per-conversation clarification context through compatible HA/API
  extensions, with expiry, device isolation and a new button press for each reply.
  The saved clarification question works; yes/no continuation is not implemented.
- [ ] Continue fresh owner/source acceptance after reanalysis, covering ambiguity,
  absent/related objects and real latency. The fourteen owner cases and seven
  supplementary cases are now regression evidence for their frozen snapshot/config.
  Keep equal-weight RRF disabled unless a new measurement supports it.

See [Semantic runtime](docs/SEMANTIC-RUNTIME.md), [Answer policy](docs/ANSWER-POLICY.md)
and [evaluation evidence](docs/SEMANTIC-EVALUATION.md).

## Operational acceptance and retirement

- [ ] Check access through Authelia from a real external network; LAN/public health
  checks do not prove the external authentication flow.
- [ ] Listen to real HA Assist/Piper/speaker answers and verify button, repeat and
  announcement behavior. Isolated real-HA runtime/card acceptance already passed.
- [ ] When needed, physically accept location and storage-unit labels from this
  app with the current templates. Live templates/previews and earlier box-label
  acceptance do not prove every new layout on paper.
- [ ] After an owner-agreed retention period, check every consumer of the old app
  and CUPS before retiring `hyllsystem-live`. Reconcile newer inventory first if
  rollback is needed. Remove private migration copies containing credentials only
  when their retention is no longer needed; the owner decides retirement.
- [ ] Establish/document the production backup schedule and retention, or verify an
  existing schedule. Manual downloads and pre-release backups do not prove an
  automatic backup policy. Periodically rehearse restoration on an isolated copy.

## Remaining compatibility and product work

- [ ] Verify real PhotoPrism access; adapters currently have synthetic coverage only.
- [ ] Review remaining search/language differences against current reference source,
  including live filename enrichment for imports without names, ranking/error wording,
  German labels and separate legacy language-file/override import if still needed.
  Inventory/settings migration and production deployment are complete.
- [ ] Translation editor, AI translation drafts, export and optional German interface.
  The existing interface has English and Swedish; external labels/local answers also
  support German. Preserve saved inventory text.
- [ ] Define further storage-unit/location management (remove unused positions,
  rename units, geometry/layout) before implementing it. Map, automatic locations,
  unit photos and unit labels already exist; a full editor is additional scope.
- [ ] Continue hands-on inventory/AI review with real photos; keep model suggestions
  editable and require explicit save. Automatic photo-to-box matching is not delivered.
- [ ] Optional: browser playback/Read answer for typed or dictated questions.
  Browser microphone input already exists; it does not speak an answer.

## Deferred or separate scope

- Real Whisper transcription measurement and conservative inventory-aware spelling/
  split-name normalization are deferred by the owner. Preserve raw queries and exact
  product codes/dimensions; text-search development can continue independently.
- Compare larger/local image models only when requested, measuring real photos, OCR,
  multiple photos, failures, latency and full cost. The initial comparison and the
  production Luna/Ollama fallback choice are complete; no new paid benchmark is implied.
- Label designer, sheets, QR codes, media mappings and printer drivers belong in
  [label-service](https://github.com/Snille/label-service), not this app.
- Open WebUI retirement is infrastructure work: inspect its actual state and all
  consumers before any action. It is not required for this app's configured routes.
- Excel catalog import/export was retired from scope on 2026-10-20.
- Full legacy prompt management was closed as unnecessary on 2026-10-24; built-in
  instructions plus task extra instructions remain the supported approach.
