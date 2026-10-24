# History

## 0.23.0 - 2026-10-25

- **Open management (owner decision).** `STORAGE_MANAGEMENT_ACCESS=open` lets the page and management API work without a key, like the reference application, which is open on the LAN and behind Authelia with MFA from outside. It requires `APP_ALLOWED_HOSTS`: requests for other host names are refused (DNS rebinding), and the origin check still stops other websites from changing data. The public API keeps its key, so Home Assistant and MCP are unchanged. The page opens the inventory directly when the server needs no key. `APP_ALLOWED_HOSTS` also allows the second public name (`hylla.snille.net`) for browser changes.
- Home Assistant's integration uses `https://verkstad.snille.net` (config entry unique ID), so it follows the NPM switch; NPM proxy host 11 serves both `verkstad.snille.net` and `hylla.snille.net`, and its MCP and OAuth exceptions use the same forward target.

- **Spoken answers for Home Assistant.** `POST /api/public/ask` now has the answer phrased by AI from the top five matches, like the reference application: in the requested language, one or two short sentences, locations repeated word for word, no internal IDs. It uses the image task's route and fallback (OmniRoute `cx/gpt-6-luna`, then Ollama01) with 15 s per route. An answer that speaks a box or location ID, is empty or fails falls back to the local answer (`source: "search"`); the response contract is unchanged.
- Owner gate for the switch: voice answers at least as good as the old system's. Compared on the 50 owner-reviewed questions against the live system (read-only `/ask` calls): the expected place was named in 32 of 43 answerable questions (old 30), both used AI for 40 answers, about 1.2 s (old 0.9 s) per answer. New answers are full sentences (about 89 characters, old 55). Both systems miss the same 11 questions where lexical search finds nothing (for example "Ikeapåsar", "Skrivdragare", descriptions without the item's word); semantic search is the next improvement there. Clarification questions (several kinds of cables or screws) get a short list of places in both.

## 0.22.0-dev - 2026-10-24

- **Fallback AI connection.** Image settings can name a fallback connection and model. When the first route cannot be reached, is rate limited, rejects its key or returns an unusable answer (429/502), the same analysis is sent to the fallback; changed settings or inventory (409) are never retried. Results show when the fallback answered and why. Both fields are set together or not at all.
- Owner decision after the comparison: `cx/gpt-6-luna` through OmniRoute as the default image route (with its own OmniRoute key for Storage System) and Ollama01 `qwen3-vl:8b-instruct-16k` as the fallback. Configured in the development copy: two boxes through Luna in 3-5 s (it read "FX-888D" correctly), and a deliberately wrong model name answered through Ollama01 with the reason shown.

## 0.21.0-dev - 2026-10-24

- **AI route without the laptop.** Image analysis can use Ollama01 (TowerCube GPU, LAN) with `qwen3-vl:8b-instruct-16k` through an OpenAI-compatible connection; it needs neither GSA nor paid calls and is reachable from Portainer. Server changes are recorded in EMBEDDING-SERVICE.md.
- OpenAI-compatible connections now get the strict JSON schema too (llama.cpp keeps `json_object`). The schema requires exactly one photo row per selected photo with indices 1..n, and a non-empty name and summary: without these Ollama returned no rows or empty names for single-photo boxes.
- 15-box evaluation, new box / update (Spark v4, OpenRouter qwen3-vl-8b, Ollama01): failed answers 2 / 3 / **0**; role agreement 18/19, 17/20, **20/23**; update failures 0 / 2 / **0** with no saved keyword lost; average time 25 / 6 / 16 s per box. Weak points of the 8B model remain: wrong model numbers (Hakko FX-889A for FX-888D), occasional English or odd words, a name "inget" for a box of filament plates, colours as keywords. Drafts still need the owner's review.
- Same 15 boxes through OmniRoute (owner-approved, 0.20 USD budget, measured with a logging proxy): `cx/gpt-6-luna` (ChatGPT team, no per-call charge) and `openrouter/anthropic/claude-haiku-5.5` answered all 31 calls each. Luna: 4.4 s, about 7,600 tokens in and 260 out per call; Haiku: 9.4 s, about 9,100 in and 1,160 out, 0.0462 USD in total (checked on the OpenRouter account), about 0.0015 USD per box. Quality versus Ollama01: role agreement 20 / 21 / 20 of 23 (Luna / Haiku / Ollama01), saved keywords found 35 / 43 / 25 of 88, name words 18 / 18 / 13 of 24, colours as keywords 7 / 2 / 14, no English answers from Luna or Haiku. Haiku named the vacuum cleaner's brand (Bruksbo) and both read "Hakko lödstation" correctly. `google/gemma-4-31b-it:free` answered none of 20 calls: the free queue stayed in cooldown.

## 0.20.1-dev - 2026-10-24

- **Move and turn overview points.** In edit mode a point can be dragged to a new place (the click that ends a drag does not remove it), and **Turn all points** moves every point 1 or 5 degrees left or right, for a new photo taken facing another direction. Turning saves once after the clicks stop.
- **Points follow a new image.** An overview image that never had points saved is offered the points of the image saved most recently (`copiedFrom`, shown as a note); they are saved for the new image at the first change. Saving an empty list counts as the image's own choice. The settings record `overviewPointsSource` remembers that latest image.
- Layout, at the owner's request: the header reads "Storage System – A place for everything" at one size; the action buttons start at the left with **Appearance** moved there from the header (between Album inbox and Add box); the INVENTORY label sits just above the totals; the overview is titled "Your workshop at a glance."
- Storage units are listed alphabetically by their shown name (numbers in numeric order) on the storage map and in the overview point form. Dropdown lists use the accent colour where the browser supports customizable selects (`appearance: base-select`, recent Chrome and Edge): the hovered row is filled, the chosen row has accent text and a check mark. Other browsers keep their own list.
- Verified on the development copy, which already held the owner's 15 points on the new 360 degree cover: a test point was dragged (yaw 42.85 -> 48.44, the owner's points unchanged), turning moved every point exactly 5 degrees, and the owner's 15 points were then saved back identically (checked against a copy taken first).

## 0.20.0-dev - 2026-10-24

- **Clickable points in the 3D overview.** A green point shows a storage unit's name on hover and opens that unit on the storage map. **Edit points** turns on an edit mode: a still click in the image (not a drag) asks which storage unit to place there, and a click on a point removes it after confirmation. Points are saved per overview image in the `overviewPoints` settings record (direction and unit slug), so a new 360 degree cover starts empty and the old image's points remain saved.
- New `PUT /api/manage/overview/points`; `GET /api/manage/overview` also returns the image's points. The storage map can open on a given unit.
- Verified on the development copy with the current 360 degree cover: placed a point on the cabinets (Skåp 1), it opened Skåp 1 on the map, then removed it again; no points are left saved.

## 0.19.0-dev - 2026-10-24

- **Restore from backup in the interface.** Under Data & maintenance, upload an SQLite backup. The server checks it (SQLite header, this application's schema 1-3, migration of older schemas, full audit including images) and shows the current and backup totals. Typing `RESTORE` replaces every table in one transaction; a failed audit inside the transaction rolls everything back. The current database is saved first as `restore-backups/before-restore-<time>.sqlite` beside the database. Uploads are limited to 512 MiB, kept only until restore or the next upload, and expire after 10 minutes.
- New `POST /api/manage/restore/upload` (raw SQLite body) and `POST /api/manage/restore` (`{token, confirm: "RESTORE"}`).
- Verified on the development copy: downloaded a backup and restored it through the interface; the audit passes (164 boxes, 249 sessions, 306 photos), the label service and AI settings are intact, and the safety backup exists. A separate copy was taken first: `data/docker-dev-backups/before-0.19-20261024.sqlite`.

## 0.18.0-dev - 2026-10-24

- **Security dialog.** Set the public base URL and the public API key (type one or generate one, show or hide it, or remove the saved key to fall back to `STORAGE_API_KEY`). Keys are never returned, only where the active one comes from. `APP_BASE_URL` on the server still wins and is shown read-only. The management key stays a server setting. New `GET/PUT /api/manage/security` with an optimistic revision.
- **Photo analysis text.** Photos with saved analysis text get a green check; hovering or focusing a photo in the box view shows the text, and the photo viewer shows it below the photo for touch screens. Box cards show the check on their cover.
- **`?lang=en` / `?lang=sv`** in the address fixes the interface language on a shared device, for example from a QR code, without changing the saved setting. Saving the language settings removes it.
- Prompt management is closed as not needed (owner decision after the evaluation). Releasing a photo from a box already works through **Remove** in the editor.

## 0.17.0-dev - 2026-10-24

- **3D overview.** The start page overview is a panorama you turn by dragging and zoom with the wheel, a pinch or the + / - buttons, with a full-screen button; "Open as flat image" keeps the photo viewer. It uses Pannellum 2.5.6 (MIT), vendored in `web/vendor/pannellum` from the npm tarball (integrity matched the registry; no eval or remote code; hotspot text is escaped).
- A 2:1 image is shown as a full 360 x 180 degree sphere. A wider image, like the current album cover (15104 x 3136), is shown as a 180 degree panorama about 37 degrees high; zoom and tilt stop at the image edge so no empty area shows. Replacing the album cover with a 360 degree photo needs no code change.
- The full image loads only when the overview is on screen and is scaled down in the browser when it exceeds the graphics card's texture limit (at most 16384 pixels).
- The page policy now allows `data:` and `blob:` images, for the viewer's icons and scaled panoramas. Scripts are still limited to this application.

## 0.16.1-dev - 2026-10-24

- The album inbox, the editor's album picker and the AI test photos leave out the album cover, since it is the start page's overview image, as in the reference application. A cover that a box already uses stays listed. If the cover cannot be read, every photo is listed. Development copy: 294 -> 293 album photos.

## 0.16.0-dev - 2026-10-24

- **Page backgrounds.** The Languages dialog is now **Appearance** and adds a background choice: green hills (new artwork in the style of the reference application, default), tool pegboard, blueprint, none, or an uploaded image. The background shows on every page, also before login, in dark and light themes. Changes save at once.
- **Schema 3** adds a `media` table for the uploaded image (JPEG, PNG or WebP, at most 5 MiB, bytes checked against the type, SHA-256 stored). Databases from schema 1 and 2 migrate on start; backups and restores include the image; the audit checks it. Older application versions cannot open a schema 3 database.
- **Start page.** Six totals instead of four: storage units with a shelving/bench/cabinet breakdown and boxes with photos (and without) are new. The photo album's cover is shown as the overview image and opens in the photo viewer, as in the reference application.
- The file upload uses a translated button instead of the browser's own file control text.
- Development copy: backed up to `data/docker-dev-backups/before-0.16-20261024.sqlite` before the schema upgrade; the audit passes on schema 3 with 164 boxes. Test uploads were removed again; the background is back to hills.

## 0.15.2-dev - 2026-10-24

- Built-in image-analysis instructions now say what a good result looks like: a two-to-four-word box name (never only a product code or a generic word), a summary and 6-15 keywords about the contents only (no container, shelf or position words), common synonyms, plain wording, and clearer photo roles (items standing on a shelf are `inside`). Updates of existing boxes keep facts the owner added that photos cannot show, such as quantities and hidden items.
- Why: a read-only evaluation on 15 real boxes from the development copy, through Spark `qwen3.8-flash-next-uncensored` with the app's own draft endpoint (nothing saved), found names like "Låda: Innehåll" or a bare product code, container/shelf keywords and shelf positions in summaries. After the change: container keywords 9 -> 1, summaries naming a shelf 5 -> 2, role agreement 18/23 -> 19/23, more keywords per box (8.1 -> 11.5). One run per prompt; the model varies between runs.
- Still open from the same evaluation: the model sometimes invents brands or words ("Metabo" for Bosch, "Hasseltång"), misspells Swedish, adds colours as keywords and once returned Chinese characters. In update mode it kept "två RC-Bilar" but often dropped saved keywords (for example `schuko`, `abs`, `petg`). The reference application edited sessions in place, so the saved descriptions mix AI output with owner knowledge; keyword recall against them understates quality.
- Same 15 boxes with the new instructions on the production model `qwen/qwen3-vl-8b-instruct` through OpenRouter (owner-approved, 30 calls, 0.0527 USD): about 3.5 times faster than Spark (6.4 s vs 22 s per box), but 3 of 15 new-box drafts failed (invalid JSON or cut short), 4 returned an empty name, and some text was wrong (a soldering station described as "svarvare", duplicated keywords). In update mode it kept almost every saved keyword (1 of 78 lost, 2 failures) where Spark dropped 27 of 88. Neither model is ready to choose; no model setting was changed in production.
- Code guards for AI drafts, whatever the model: an update keeps every saved keyword (first, the model only adds), keywords are de-duplicated (case-insensitive), an empty box name or CJK text is rejected as an invalid answer, and OpenRouter requests use a strict JSON schema with `require_parameters` so they only go to providers that enforce it. Rerun on Spark with the same 15 boxes: in update mode 0 of 88 saved keywords are missing from the suggestion (45 of 88 before), no duplicates; new-box drafts are otherwise unchanged (roles 19/22, one answer rejected by the guards). Colours were still common keywords (15); a follow-up rule allows colours only when they tell otherwise identical items apart, such as filament, which brought them to 9 (5 of them filament) with two answers rejected by the guards.
- Printing: the box view has a **Print label** button and every storage map position a **Print location label** button; both open the print dialog with that box or location chosen. Job texts say "printer job" instead of "CUPS", since the label service prints. Removed 31 unused Swedish strings left from the removed CUPS/DYMO code; new strings have Swedish translations.
- New English language file `web/locales/en.js` with every interface string (549), used by the interface like the Swedish file. A test checks that every string in the code and page exists in both files and that both have the same keys. Three strings that had no Swedish text were added ("Loading models…", the page footer and "Version").
- The page header shows the running version from `VERSION` (served into `index.html`).
- All dialogs share one width, `--dialog-width` in `web/style.css` (the photo viewer stays wider). The Add box and Languages dialogs were narrower before.

## 0.15.1-dev - 2026-10-24

- The print dialog has a **Text direction** choice for each label: the label format's setting (default), landscape or portrait. The choice is sent with the preview and needs label service 0.4.0 or later; older services refuse it. The saved format setting in the label service is not changed.

## 0.15.0-dev - 2026-10-24

- Printing now goes through the separate label service (Snille/label-service), the only program that talks to the printer. This application sends the label content (box, registered location or test label) with its own client key, shows the service's preview, re-checks that the box is unchanged and submits with a request identifier the service deduplicates.
- New `labelService` settings (address and client key, never returned; kept for the same address, dropped when the address changes) or `LABEL_SERVICE_URL` / `LABEL_SERVICE_KEY`. Recent jobs and job checks come from the label service.
- Removed direct CUPS/IPP printing, DYMO roll reading, label layout and the CUPS/format/size settings from this application (`ipp.js`, `dymo-roll.js`, `labels.js`, `label-media.js`; the roll endpoint is gone). Roll reading, formats, text sizes and direction live on the label service's page. Their tests moved to the label service.
- The 0.12-0.14 `printing` settings and `print_jobs` journal stay valid for audit, backup and restore but are no longer used or written.
- 87 tests pass, including a stand-in label service for previews, submission, deduplication, stale boxes and settings, error mapping and key privacy.
- End-to-end physical acceptance: the Docker Desktop development app (real inventory) printed the unedited box label for `BENCH-1-UNDER-P1-A` ("Dammsugare") through the live label service 0.3.0 in Portainer on S0722540 / 57 x 32 mm, after reading the roll (672 labels). Label service journal: client `storagesystem`, kind `box`, CUPS job 2, completed. The owner confirmed legible, correctly facing, unclipped text and solid power.

- Each label format now keeps its own text sizes. Switching format shows that format's sizes. Defaults are the owner-accepted values (6-point description only for S0722550 / 19 x 51 mm). A pre-0.14 shared style is read as the style of the format selected when it was saved.
- Added location labels: a registered location (or test text) printed as one large, centered block that shrinks to fit. Long location codes break after hyphens only when needed. Print journal records store the label kind and location.
- Each format also keeps a text direction (landscape along the long side, portrait across it). Defaults match each format's accepted output; the other direction lays text out on the turned label and rotates only the PostScript drawing, keeping the physical page size.
- Existing box-label layouts are unchanged: an old/new comparison over all four formats, three size sets and three texts produced identical output.
- Three new tests cover per-format sizes and direction, legacy migration, rotated PostScript, location layout on every format and location-label submission. All 101 tests pass. Browser preview checked against a synthetic in-memory fixture with no printer.
- Physically accepted one rotated location label: S0722550 / 19 x 51 mm in landscape, CUPS job 121, from the isolated port-3212 preview. The owner confirmed legible, correctly facing, unclipped text. The preview database was backed up privately before its settings moved to the per-format format.
- Updated the Docker Desktop development stack to 0.14.0-dev with its named volume kept (schema 1 -> 2 migration, audit passing, private backup first). The pinned Docker test stage and `verify-container.ps1` pass. The stack's database was then replaced with a consistent copy of the isolated preview database (2026-10-20 live snapshot, 164 boxes); audit and integrity pass and the real Immich album is reachable from the container.

## 0.13.1-dev - 2026-10-23

- Corrected manual roll-reader cleanup for a granted error response (engine 2, no active job). Report the device error and release the same connection's reservation; never release an active/foreign job or feed/reset.
- Added regression coverage for error/jammed reservations and active error jobs.
- Diagnosed printer-reported bay 9 (jammed) before image transfer during tests 116/117. The owner found the roll was backwards and corrected it. Unchanged 25 x 54 mm test job 118 then completed with an idle/empty, error-free queue; the owner accepted physical text/orientation and solid power, with a matching photo.
- All 98 tests pass locally and in pinned Docker. Built separate `storagesystem-base:roll-reader-0.13.1` image; no production driver, configuration or service changes.

## 0.13.0-dev - 2026-10-23

- Added explicit DYMO 5XL roll reading using a bounded same-socket ownership/read/release cycle. The owner confirmed solid power and no feeding both after the experimental cycle and after the app button read S0722540 / 677 labels.
- Added four article-backed media presets, shared dynamic SVG/PostScript layouts, detected-format selection and a bounded portrait preview with its format caption. Dimensions are preset lookups; unknown articles never inherit CUPS default dimensions.
- Added seven protocol/layout/concurrency cases; 97 local tests pass. A real change to S0722520 / 413 labels was owner-accepted with solid power and no feed; alternate-format physical printing remains pending. No new print jobs or production configuration changes.

## 0.12.1-dev - 2026-10-23

- Expanded English/Swedish printing status to show CUPS queue state/reasons, acceptance, queued jobs, model, configured default media and the application's explicit label format. Explain that queue status cannot diagnose the physical lamp or determine the loaded roll/count/temperature.
- Investigated optional direct DYMO status without submitting a label. The owner reported renewed white power-lamp blinking after the version/status sequence, despite successful protocol fixtures. Withdrew the experimental adapter, route, settings and controls; direct diagnostic settings are rejected. No new direct printer connection remains in the application. Production code/driver/configuration was not changed.
- Existing test and longer current-box labels have owner/photo acceptance. The earlier legacy status function requests a print lock and must not be reused for passive monitoring. Query 0 alone previously coincided with the lamp returning to solid, but the combined experiment disproved readiness of the proposed diagnostic path; root cause and error-field 0x1000 remain unresolved. Further hardware protocol investigation is deferred.

- All 90 tests pass locally and in pinned Node 24.14 Docker; built a separate `storagesystem-base:printing-status-0.12.1` image.

## 0.12.0-dev - 2026-10-23

- Added management-only CUPS/IPP label printing: saved connection/font settings, queue status, test/current-box labels, shared SVG/PostScript layout, editable label-only text, overflow rejection and explicit one-label submission. Initial format is S0722540 / 57 x 32 mm, with Swedish Latin-1 glyphs; other formats, QR codes, sheets and the full designer remain pending.
- Added durable print-request/token deduplication, a pre-submission journal, stale content/configuration guards, strict IPP response checks and no automatic print retries. Ambiguous submissions remain unknown and must be inspected. No queue clearing, cancellation, driver changes or production service restart is performed.
- Main SQLite schema migrates transactionally from 1 to 2 to add the print journal. Inventory/settings/identifiers are preserved, schema-1 evaluation snapshots remain readable, and backups/audits/restores include the journal. A private backup preceded migration of the isolated preview.
- Browser-submitted DYMO_5XL CUPS job 114 completed; queue returned idle/empty and the physical roll counter fell from 679 to 678. Loaded SKU S0722540 matched the explicit w162h90 media despite an incorrect CUPS default. The owner approved physical legibility/orientation and supplied a photo confirming Swedish glyphs and unclipped text. See PRINTING.md.

- All 89 tests pass locally and in pinned Node 24.14 Docker; built a separate `storagesystem-base:printing-preview-0.12.0` image.

## 0.11.0-dev - 2026-10-23

- Added the English/Swedish Search & answers dialog with saved native embedding settings, explicit model/digest discovery, index status/retry, structured owner rule editing and a saved-settings answer preview. Rules support either acceptable location, both (maximum two), or a localized clarification. Previews work without embeddings; no workshop-specific rules are shipped.
- Added shared validation for settings import/audit/restore, redacted/retained credentials, destination-bound key clearing, optimistic revisions and stale-preview rejection. Model changes reconfigure the optional worker outside inventory transactions without restarting the app; rules-only changes reuse valid vectors. Public UI/REST/MCP/HA search and paid-model behavior are unchanged.
- Browser testing with an isolated frozen inventory and six already approved rules exposed `nätverkskabel`/`nätverkskablar` not supporting all rule destinations, causing a generic question. Added bounded Swedish cable inflection handling and an exact saved-question regression; verified the finished-cable question and two-location extension-lead response in the UI. Replayed previous source-bound identity evidence offline: original 27/30, owner 20/20, source 30/30, with no incorrect confident answers. This is regression, not independent acceptance or new model inference.
- The owner confirmed physical printer access. Read-only CUPS preflight found `DYMO_5XL` idle/enabled; the new print path and physical output remain to be built/tested. Existing production settings, queues and services were not changed.
- All 81 automated tests pass locally and in pinned Node 24.14 Docker; a separate `storagesystem-base:search-settings-0.11.0` image was built without replacing the existing development image/service/volume. Browser verification used a separate persisted local database, including rule save, model settings save, unavailable native catalog handling and exact short-answer/clarification output.

## 0.10.2-dev - 2026-10-23

- Added optional background semantic indexing and authenticated management preview, disabled by default. Store derived vectors in a separate rebuildable SQLite cache; preserve the main schema and inventory backups. Bind vectors to document version, current content/session, endpoint, immutable model digest and dimensions. Incremental post-commit work never waits for inference inside inventory writes; recheck source after inference and exclude stale/incomplete/corrupt rankings.
- Added native Ollama embedding requests with `truncate: false`, model digest validation, bounded requests/responses and safe provider failure handling. Management preview retains lexical fallback and does not accept caller rules, thresholds or identity proofs. Public search/ask, MCP, browser and HA behavior are unchanged.
- Live-tested the revised current-content serializer against the frozen private inventory with existing Ollama through a temporary SSH tunnel: all 164 boxes indexed; old answer cases 23/24 top-1 and 24/24 top-5; owner answer cases 18/19 top-1 and 19/19 top-5. A 10000-word native input was rejected with a context-length error. This is retrieval regression evidence, not independent decision acceptance. The existing authenticated LAN gateway returns 404 for native tags/embed and was not changed.
- Added persisted-cache/hash/session/vector/ranking audits and isolated concurrency, persistence, corruption, model/length/provider, HTTP authentication and public-behavior tests. All 73 automated tests pass locally and in pinned Docker; built a separate `storagesystem-base:semantic-preview-0.10.2` image without replacing the existing development service/volume. Rule/GUI settings, approved deployment route and independent acceptance remain open.

## 0.10.1-dev - 2026-10-23

- Require source-bound item evidence before semantic-only candidates can become confident preview answers. Added optional `verifiedPreviewAnswer` and a bounded local text identity verifier; model outputs cannot choose IDs/locations or write inventory. Recheck query, confirmed intent, session and current source quotes after inference; unavailable or invalid verification causes abstention.
- Added near item-name substitution and negative-property guards after live synthetic checks exposed sound/light-meter and brushed/brushless substitutions. Retained the initial failed runs and all prior baselines. Uses the owner's already confirmed drill/driver interpretation without enabling automatic speech normalization.
- Verified against the existing local Spark model without changing its configuration: source regression 30/30, owner regression 20/20 with six owner rules and the pre-existing confirmed intent, old regression 27/30. Warm checks add seconds, and an early cold probe was much slower; runtime identity endpoint/latency and independent acceptance remain open. Public interfaces and production remain unchanged.
- Added offline evidence replay, explicit live synthetic suites, failure/staleness/quote fixtures and pinned Docker verification. All 63 automated tests pass; built a separate `storagesystem-base:identity-preview-0.10.1` image without replacing the development service/image/volume.

## 0.10.0-dev - 2026-10-22

- Froze the decision implementation before authoring 30 new source-derived cases and locked labels/criteria before endpoint inference. Result: 29/30, including all 15 documented answers and five default clarifications, but one unsupported thermal-camera query confidently selected a heat gun. The zero-incorrect-confident-answer gate therefore fails. Preserved source/vector/ranking/decision evidence and added read-only reproduction/audits; no policy, thresholds, runtime settings or version adjustment for this validation step. This is not independent human-labelled acceptance.
- Recorded the owner's decision to defer real speech/transcription testing and inventory-aware split-name normalization until later; keep it on the roadmap while text-search development continues. No runtime/version change for this planning update.
- Added `Inventory.previewAnswer` and an isolated shared answer policy: current whole-word label/keyword/summary evidence, exact code/dimension guards, stale/invalid semantic candidate rejection, explicit owner interaction rules and current-location answer formatting. No public interface or runtime inference is activated.
- Re-evaluated saved private retrieval through the real read-only inventory service. All 19 user answer cases now have an accepted first candidate. Six explicit owner rules yield 20/20 correct decisions/required selections; generic logic alone yields 14/20. Old questions yield 27/30 correct decisions with no incorrect confident answers. Retained all earlier baselines; these are development regression results, not untouched acceptance.
- Added six synthetic tests (54 total), reproducible exclusive-result evaluation and a hash/source/SQLite/decision audit. Verified the pinned Node 24.14 Docker build under a separate preview tag. No app settings, runtime inventory, deployment, production or physical speech/printing changes.

## 0.9.1-dev - 2026-10-22

- Froze 20 owner-authored short queries with confirmed source-bound labels before inference. Compared the unchanged shared lexical search with Ollama BGE-M3 using saved corpus vectors and thresholds selected only from the original 30 reviewed questions. Semantic top-1/top-5 is 18/19 and 19/19 versus lexical 14/19 and 15/19; fixed-policy decisions are 15/20. Recorded missing clarification, overly conservative short-query decisions and the owner's dual-destination extension-lead requirement. Added private evidence/audits and reproducible read-only tools; no runtime activation or threshold tuning on the new set.

- Added a reproducible read-only Ollama endpoint evaluator with exclusive private result directories, archived evaluator sources and saved-vector/hash/ranking/policy audit. Reused the frozen reviewed corpus without changing labels or the prior baseline.
- Verified the exact Ollama01 GPU route: 22/24 top-1, 24/24 top-5, unchanged first-ranked boxes, 25/30 correct decisions and no observed incorrect confident answers. Original fold thresholds retain the same decision metrics. Query HTTP p50/p95 was 29.4/44.2 ms; all 164 documents encoded in 2.55 s.
- Confirmed silent 2048-token truncation on the compatible route using boundary inputs and changed-tail vectors. Current documents fit (maximum 869 tokens); explicit length handling remains a runtime integration gate. Untouched questions and HA/speech acceptance remain open; no application settings, inventory, service configuration or version change.

## 0.9.1-dev - 2026-10-21

- Finalized the evening handover with separate Mimer and Storage System acceptance/cutover steps, backup and rollback boundaries. Verified operator GPU monitoring and recorded the owner-confirmed btop restart resolution. No application endpoint or stored vector changes.

- Migrated Ollama01 through a stopped NAS backup to TowerCube, preserving the stopped MiniCube source. Verified RTX GPU inference, authenticated API and nearly identical synthetic Mimer CPU/GPU vectors. Disabled CUDA graphs after varied input lengths exposed multi-second delays; 14 follow-up requests took 17-100 ms. Created and read back the user-approved Proxmox Note. Existing application connections and Mimer vectors are unchanged.

- Provisioned a shared authenticated BGE-M3 staging endpoint on MiniCube (Ollama01, CT 141), with pinned native Ollama, standard host verification and separate client keys outside the repository. Verified network access from Mimer/Portainer and nearly identical synthetic Mimer vectors. The subsequent TowerCube/GPU migration is recorded above; application endpoint changes remain pending. Application version and runtime behavior are unchanged.

- Added isolated, pinned CPU evaluation tooling and saved-vector integrity checks. Reproduced the frozen shared lexical baseline and compared E5-small/BGE-M3 dense and lexical RRF over the 164-document private snapshot. BGE dense leads at 22/24 top-1 and 24/24 top-5; the tested hybrids reduce top-1.
- Evaluated short-answer decisions separately with grouped cross-validation: BGE dense makes 25/30 correct decisions with 19 correct confident answers and zero observed incorrect confident answers; five answerable cases are declined. This remains exploratory evidence, with untouched questions and a production endpoint still required.
- Preserved private source-bound vectors/results and exact evaluator snapshots under ignored data paths. Production and development runtime behavior/configuration remain unchanged; no application version bump or semantic feature activation.

## 0.9.1-dev - 2026-10-20

- Added an evening handover with frozen local evaluation paths, accepted labels, reproduced baseline, ordered model-comparison steps and production safety boundaries. Re-ran all 48 checks and reviewed-data validation; no new runtime feature/version change for this documentation step.

- Recorded user acceptance of all 30 evaluation questions, proposed boxes and three absent-item cases. Froze a separate reviewed dataset while preserving the draft; reproduced the unchanged lexical baseline and integrity checks. Embedding comparison remains pending.

- Drafted 30 private, source-bound workshop search questions with current destination checks, functional/code/transcription cases and clarification/unsupported expectations. Recorded existing lexical rankings (13/24 top-1, 17/24 top-5 against provisional labels). Human review and embedding comparison remain pending; no model calls or runtime changes.

- Prepared a user-authorized, inventory-only live snapshot in Git-ignored evaluation storage: 164 boxes, 249 sessions and 306 photo references. Verified isolated SQLite import and exact record preservation; derived 164 current-session search documents. No credentials/image binaries were persisted and no embedding model was called. Documented evaluation inputs and next steps.

- Documented the current button-activated workshop voice path, observed multi-location answers, proposed hybrid retrieval/short-answer/clarification contract and SQLite capacity decision. Read-only production scale: 164 boxes and 293 current photo references. Semantic search and follow-up context remain planned; no production settings or firmware were changed.

- Widened Photo settings to the shared 1000px dialog width, capped at 94vw on smaller screens, matching box details, AI views and the album inbox.

## 0.9.0-dev - 2026-10-20

- Added a storage map for shelving units, benches and cabinets using shared registered positions/current box locations. Show separate letters, free registered positions, unregistered gaps and unmapped boxes. Search highlights matching boxes and opens their unit; clicking a box opens its ordinary details.
- Restored reference-style Swedish suffix variants, RC/car synonyms, short adjacent-letter transpositions and field-weighted ranking in the shared UI/REST/MCP search. Explicit filename lookups prioritize exact retained current/historical filenames and return current inventory. No photo-service lookup is needed during search.
- Retired Excel catalog import/export from scope at Erik's request; it was a one-time initial label import. Inventory JSON operations remain supported.
- Added a disposable Docker acceptance harness using real Home Assistant 2026.10.2 and the unmodified reference integration, with synthetic inventory and no discovery or TTS.

## 0.8.1-dev - 2026-10-20

- Widened box details from 650px to 1000px using the shared wide-dialog layout. Small screens remain limited to 94vw; fitted photo proportions and image viewing are unchanged.

## 0.8.0-dev - 2026-10-20

- Added selected-photo AI updates from the box editor, including newly attached Spread/detail images or existing photos. Send the current editor description as context to preserve prior useful contents, with explicit before/after review and apply/save steps.
- Keep the box name unless explicitly selected, preserve identity/location/manual notes/unselected photos, and create history only on final session save. Retained current photos can be analyzed outside the album.
- Reject stale existing-box analyses and optimistic session saves when another client changes the current session. Added isolated coverage for context, retained/new photos, concurrency and REST/MCP/history consistency.
- Added an explicit live local-AI update acceptance script that reads settings from a read-only database and writes inventory only in memory.

## 0.7.1-dev - 2026-10-20

- Show album inbox and AI test-album photos fitted without CSS cropping, preserving portrait/landscape proportions in a consistent image frame. Use the larger album preview rather than the thumbnail when available.
- Added synthetic portrait/landscape browser-fixture images with a visible perimeter for crop verification.

## 0.7.0-dev - 2026-10-20

- Added a dedicated Languages dialog with independent interface and external-response languages. English remains the default; Swedish UI catalogs cover inventory, locations, photos, viewer, settings and AI workflows. Language selection persists across reloads without translating user inventory or model output.
- Renamed AI output language and its inherited setting to explicitly identify the external-response default; kept existing stored settings and explicit caller overrides compatible. Moved response-language settings out of photo configuration.
- Clarified that extra AI instructions supplement the read-only built-in instructions and renamed their reset action to Clear extra instructions.
- Released photos removed from current inventory back to the unassigned album inbox after saving. Historical references remain intact and no longer prevent reassignment; current ownership and source/membership checks remain enforced in the shared inventory service.
- Added independent-language, settings-preservation, stale-edit and release/reassignment/history checks with isolated data.

## 0.6.9-dev - 2026-10-20

- Made session-photo thumbnails clickable in manual and AI-review editors. Open unsaved or retained photos in the existing zoom/pan/previous/next viewer, without cover writes or losing the draft.
- Added expiring, rendition-bound album grants for preview/original images so labels can be inspected at full resolution before inventory is saved. Display URLs are excluded from saved photo records.
- Mark occupied position/letter choices unavailable, excluding the current box's own position. Refresh occupancy after save conflicts while keeping form contents.
- Enforce exact position uniqueness inside the shared session transaction, comparing equivalent legacy location formats and rejecting concurrent double assignment without partial writes. Moving away frees the position; different letters remain separate positions.

## 0.6.8-dev - 2026-10-20

- Reduced Box ID to a small read-only metadata line below the editor's save action, removing the prominent form field and explanation. Automatic allocation and stable existing identifiers are unchanged.
- Simplified the save confirmation so it focuses on the inventory session rather than the internal identifier.

## 0.6.7-dev - 2026-10-20

- Made Box ID visible but read-only, with a location-based proposed ID for new boxes. The shared inventory service allocates the final unique ID atomically on save; moved boxes keep their identifiers and concurrent new-box saves cannot overwrite each other.
- Replaced the generic waiting cursor on disabled buttons with an unavailable cursor. Album selection explains the required photo choice and the six-photo AI limit. Actual session saves explicitly mark the button busy.
- Added automatic-ID collision, concurrent HTTP save, movement and MCP consistency checks.

## 0.6.6-dev - 2026-10-20

- Restored the reference location workflow: category, suggested/free-entry unit, shelf or bench surface, position 1-12 and optional letter A-Z. New locations are composed automatically and saved with the inventory session.
- Replaced the flat position selector and separate registration form with structured controls; existing boxes retain exact saved locations until Change location, with an explicit cancel action.
- Shared location parsing/building between browser and inventory presentation, preserving legacy identifiers and supporting named shelving units. Added format/validation and alias-preservation checks.

## 0.6.5-dev - 2026-10-20

- Replaced free-text box location entry with a required selector of known storage positions, showing exact IDs, readable labels and occupancy. Box identity stays independent of the selected position.
- Added explicit position registration for empty installations and new positions. Reuse the existing SQLite locations table; registered and vacated positions remain selectable without creating inventory sessions.
- Added shared inventory-service position listing/registration with management-only endpoints, plus isolated move/history, REST/MCP consistency and backup/fresh-restore checks.
- Position registration persists immediately. SQLite backup includes unused positions; the legacy inventory-only JSON format continues to export box-associated positions only. Full storage-unit layout management remains planned.

## 0.6.4-dev - 2026-10-19

- Recorded the complete implementation state, runtime continuation instructions, verified boundaries and prioritized backlog for a new development session.
- Reconciled roadmap and verification documentation with the implemented photo/AI workflows and the user's retained development inventory.
- Prepared the first runnable implementation for repository handoff; container publication and production deployment remain separate future work.

## 0.6.3-dev - 2026-10-19

- Anchor click-to-zoom to the clicked image detail, keeping it under the pointer where image boundaries permit. Toolbar zoom preserves the detail at the viewport center.

## 0.6.2-dev - 2026-10-19

- Added pointer dragging to pan zoomed photos, with pointer capture, grab/grabbing cursors and disabled native image dragging.
- Clicking a zoomed photo now preserves zoom. Fit image and photo navigation retain explicit reset behavior; clicking a fitted image still opens actual size.

## 0.6.1-dev - 2026-10-19

- Show uncropped preview images in box details, preserving portrait and landscape proportions, with signed preview URLs and an 8 MiB delivery limit.
- Added photo zoom controls, actual-size viewing, fit-to-window reset and scrollable detail inspection; switching photos resets zoom.
- Collapsed inventory history by default while retaining explicit expansion.
- Extended signed-image tests to verify preview delivery and variant-bound authorization.

## 0.6.0-dev - 2026-10-19

- Added box-card photos with a default preference for inside/spread/detail images and an explicit cover choice from the in-app photo viewer.
- Added previous/next and arrow-key photo browsing, captions, loading/error feedback and Esc return to box details, without opening new tabs.
- Store cover choices as optional box metadata, restricted to current-session photos. Cover changes do not create inventory sessions; removing a chosen image in a later session restores automatic selection and retains history.
- Added management authorization, current-photo validation, REST consistency, backup/reopen and cover-removal tests; verified viewer navigation and cover selection with isolated browser data.

## 0.5.0-dev - 2026-10-19

- Added shared multi-photo box analysis for one to six album images with explicit roles, indexed per-photo interpretations, one combined description/keywords and conflict/uncertainty notes.
- Added an Album inbox action to build an AI draft, review the combined suggestion and transfer it into the editable new-box form. Only explicit session save writes inventory; identifiers are entered by the user.
- Preserved manually assigned roles and source metadata; limited aggregate preview data to 16 MiB and retained stale-configuration, album-membership and shared concurrency guards.
- Added atomic protection against an AI new-box draft overwriting an existing box ID, plus isolated analysis/review/save/REST/MCP tests and browser fixtures.
- Verified the three real test-album views (label, inside and spread) together on Spark, then exercised browser review/edit/save in an isolated in-memory inventory. Saved roles, filenames and photo descriptions, REST/MCP retrieval, signed image delivery and the integrity audit passed. The development inventory was not used for acceptance writes.

## 0.4.1-dev - 2026-10-19

- Fetch Immich's larger preview rendition for AI analysis instead of its small WebP thumbnail, with an 8 MiB limit and unchanged small gallery thumbnails. This resolves image decoding failures with the Spark llama.cpp server and provides more label detail.
- Generalized live AI acceptance to named OpenAI-compatible connections, retaining redaction and isolated inventory checks.
- Added an explicit llama.cpp connection type that disables template thinking for direct image descriptions without sending vendor-specific options to other providers.
- Verified a real Immich preview through the Spark's already loaded `qwen3.8-flash-next-uncensored` model, returning a valid Swedish inventory suggestion with no inventory writes. The remote service configuration was unchanged.

## 0.4.0-dev - 2026-10-19

- Added task-based AI assistance with separate overview, reusable named connections and image-inventory settings; other AI tasks are explicitly marked as planned.
- Added OpenRouter and OpenAI-compatible adapters, redacted credentials, stale-edit protection, explicit model discovery and task-scoped extra instructions without hidden model overrides.
- Added a single-photo preview from the configured album: explicit destination disclosure, automatic or manual photo role, language selection, validated descriptions/keywords/uncertainties and no inventory writes.
- Added isolated AI HTTP tests and reproducible live acceptance. Verified two real test-album thumbnails through OpenRouter, including a browser-driven preview, with an in-memory inventory. Small label text remains subject to thumbnail resolution and model interpretation errors.
- Updated the local development container while retaining its inventory and photo configuration. Physical printer testing remains deferred.

## 0.3.0-dev - 2026-10-19

- Documented a proposed task-based AI settings design after reviewing the reference implementation; the first implementation is recorded under 0.4.0-dev.

- Added authenticated photo settings with masked credential status, blank-key preservation, explicit credential clearing and stale-source checks.
- Added Immich and PhotoPrism album discovery and paginated image catalogs, plus Immich shared-link album access.
- Added an album inbox, selection of unassigned photos, photo roles and session photo editing while preserving earlier history.
- Added short-lived preview grants, verified album membership on attachment, and rejection of cross-box image reuse and source switching with existing references.
- Preserved source filenames on new photo associations and included them in inventory search.
- Added isolated settings/catalog HTTP tests and an in-memory browser acceptance fixture.
- Added reproducible live Immich acceptance using the dedicated account: album/preview access in the running container and an isolated inventory round-trip through browser, REST and MCP, including original images and integrity audit.

## 0.2.0-dev - 2026-10-19

- Added a runnable Node/SQLite development preview with shared inventory services for browser management, public REST and read-only MCP.
- Added relational identifiers/constraints with preserved legacy record payloads, versioned schema initialization, atomic validated import and a data integrity audit.
- Added manual box/session editing, current inventory search, location filtering and history in an English UI with system-aware dark/light themes.
- Added inventory JSON export, online SQLite snapshot backup, download and restore into a fresh database; full UI restore remains planned.
- Captured reference API contracts and workflow gaps from the existing Storage System and HA source revisions.
- Added isolated HTTP/database/photo-adapter tests, a pinned non-root Docker image, Compose development stack and a Portainer template.
- Verified the real HA HTTP client against an isolated running development container; a full HA installation and real photo providers remain unverified.
- Deferred physical printer testing until the user has printer access. No existing installation was changed.

## 0.1.0-dev - 2026-10-19

- Created an independent repository for the Docker/Portainer implementation.
- Recorded the SQLite, backup, migration, REST/MCP compatibility, and general CUPS printing direction.
- Added project instructions, version source, and exclusions for runtime data and credentials.
- No application or deployment artifacts are implemented in this foundation.

Roll-change observation: after the owner confirmed the replacement was loaded, the app read S0722520 / 25 x 54 mm / 413 labels. The saved format already matched. A fresh preview with a visible format caption was checked without printing. The owner confirmed the size/count and solid power with no extra feed after this replacement read.

0.13.1 validation: all 98 tests pass locally and in pinned Node 24.14 Docker; separate image `storagesystem-base:roll-reader-0.13.1`. Only the isolated port-3212 helper was restarted to load the correction. Inventory integrity audit passes (164 boxes, 249 sessions, 306 photo references, 164 locations).

Final physical acceptance for job 118: the owner confirmed clear, correctly oriented, unclipped text and solid power. The supplied photo confirms Swedish glyphs and the 25 x 54 mm portrait layout. Two formats now have accepted real output (57 x 32 and 25 x 54 mm); 19 x 51 and 54 x 101 mm have synthetic layout checks only. The roll-loading error resolved the reported print failure; no production driver/configuration changes were needed.

S0722430 / 54 x 101 mm accepted physically: test job 119 completed and the owner confirmed good text/layout with solid power. The supplied photo confirms legible Swedish glyphs and no clipping. Three formats now have real output acceptance: 57 x 32, 25 x 54 and 54 x 101 mm. Only 19 x 51 mm remains physically unverified among the four presets.

Final acceptance for job 120: the owner confirmed legible, correctly oriented, unclipped text and solid power. All four explicit formats now have real owner-accepted test output: S0722540 (57 x 32 mm; jobs 114/115), S0722520 (25 x 54 mm; job 118), S0722430 (54 x 101 mm; job 119), and S0722550 (19 x 51 mm; job 120). This verifies the tested layouts on this 5XL/CUPS route, not every inventory label or other printer. Description size is currently 6 points for the smallest format; text sizes are shared settings, not per-format profiles.
