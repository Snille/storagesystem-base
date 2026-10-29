# Label printing

Current for 0.28.0, reviewed 2026-10-29. All printing goes through the separate
[label-service](https://github.com/Snille/label-service). It owns templates, layout,
formats, CUPS, driver, roll reading, preview tokens, deduplication and the print
journal. Storage System sends label content using its own client key; it never
opens a CUPS or raw printer connection.

## Operator workflow

**Printing** in the header contains connection settings, printer status, standard
and additional templates per label type, and recent jobs. Save the service origin
and client key under **Label service connection**. A blank key retains the saved
one; explicit clearing or changing the address drops it. Alternatively set
`LABEL_SERVICE_URL` and `LABEL_SERVICE_KEY`; saved settings take precedence.

**Check printer connection** reads the service's queue and selected format.
**Open label service** opens roll/format/template administration. Check the loaded
roll there. Direction belongs to the template; there is no per-label direction
selector in this app. Test prints are made on the service's own page.

Print from **Print label** on a box, **Print location label** on the map, or
**Print storage unit label** for a shelving unit, bench or cabinet. A separate
dialog shows the preview immediately and offers the configured templates as
buttons. **Change the text on this label** edits just the template's fields;
regenerate the preview before printing. Inventory text is not changed.

| Label type | Fields supplied by this app |
| --- | --- |
| Box | `title`, `description`, `location`, `boxId` |
| Location | `location`, `locationId` |
| Storage unit | `unit`, `kind`, `name`, `unitId` |

For units, `unit` is the full display name, `kind` the translated category,
`name` the unit name and `unitId` the map slug. `kind`/`unit` follow the UI language.
Only templates whose requested fields are supplied by that label type are offered.
A template for another roll is marked and cannot be printed on the current roll.

Choose standard and additional templates per type under Printing. A box remembers
its last non-standard printed template in `labelTemplate`; printing the standard
one clears the preference. A removed remembered template falls back to the
configured standard, then the type's built-in template if present. A missing
explicit choice fails. There is no built-in unit template; publish/configure one
in label-service. On 2026-10-29 production has `storage-unit-landscape` and
`storage-unit-portrait` configured, alongside box/location landscape/portrait.

**Print one label** rechecks settings, expiry and the current box/session/location
(or existence of a unit/registered location). It submits a preview token and UUID
request ID. The service deduplicates the ID after ambiguous responses; do not
invent a new ID as an automatic retry. Overflow blocks printing. **Check print
job** reads delivery state; completed CUPS status does not prove physical quality.

## Management API

Endpoints use the configured management access mode and browser origin protection:
admin key by default, or deliberately configured open management with allowed hosts.
Keys are never returned.

- `GET/PUT /api/manage/printing`: redacted `config`, `revision`, locations,
  template `functions` and environment-fallback flag; writes accept
  `{revision, config: {enabled, url, apiKey?, clearKey?}}`.
- `GET /api/manage/printing/status`: service queue status and selected media.
- `GET /api/manage/printing/templates`: `templates`, saved `functions` and `media`.
  Template entries include ID/name, fields, suitable functions and `fitsRoll`.
- `PUT /api/manage/printing/templates`: `{functions: {box: {default, extra: []},
  location: {default, extra: []}, unit: {default, extra: []}}}`; up to ten extras
  per type, validated by the shared settings schema.
- `POST /api/manage/printing/preview?lang=sv`: `{revision, kind: 'box', boxId,
  template?, fields?}`, or `kind: 'location'` with `locationId`, or `kind: 'unit'`
  with `unitId`. Editable fields are the displayed text; identifiers come from
  the server. The API also retains `{revision, kind?, test: true, template?}` for
  fixed sample text; the current browser does not offer test-label selection.
- `PUT /api/manage/boxes/<boxId>/label-template`: `{templateId}` or `null` to clear.
- `POST /api/manage/printing/submit`: `{token, requestId}`, both UUIDs.
- `GET /api/manage/printing/jobs` and `/jobs/<requestId>`: this client's service jobs.

Previews are process-local and expire within ten minutes or the service expiry,
whichever comes first. Service submission deduplication is durable at the service;
the app still requires a valid local preview. Template settings and box preferences
survive inventory backups; the service's templates/journal require its own backup.

## Physical acceptance and historical boundary

Versions 0.12-0.14 used direct CUPS. Owner-approved output on the tested DYMO 5XL:
S0722540 57 x 32 mm (jobs 114/115), S0722520 25 x 54 (118), S0722430 54 x 101 (119),
S0722550 19 x 51 (120), and a rotated 19 x 51 location label (121). Failed jobs
116/117 preceded owner-confirmed correction of a backwards roll; no driver/layout
change was needed for successful job 118. Do not carry forward a speculative
network/driver cause for those failures. Raw status experiments also caused
blinking; the old lock-acquiring status endpoint must not be reused as passive
monitoring. Protocol work and hardware acceptance belong to label-service now.

On 2026-10-24 this app printed an unedited real box label through label-service
0.3.0 as its CUPS job 2; the owner accepted legibility, orientation, clipping and
solid power. All five formats, including shipping article 2166659 (102 x 210 mm),
were accepted through label-service itself as recorded at handoff. This is not
physical acceptance of every later template. Current location/unit templates from
this app still need owner-observed output when required; none was printed during
the 2026-10-29 documentation review.

The legacy `printing` settings and schema-2 `print_jobs` journal remain validated
for audit/backup/restore but are no longer used for submission. Detailed past
implementation evidence is in [History](HISTORY.md) and Git history. Designer,
QR codes, sheets, new printer models and media acceptance belong to label-service.
