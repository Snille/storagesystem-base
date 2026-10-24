# Label printing

Since 0.15.0-dev this application prints through the separate **label service** ([Snille/label-service](https://github.com/Snille/label-service)), a LAN service with its own CUPS container and the official DYMO driver. The label service is the only program that talks to the printer. It owns label layout, formats, per-format text sizes and direction, roll reading, preview tokens, one-copy submission, request deduplication and the print journal. This application holds no printer settings and opens no printer or CUPS connection.

## Operator workflow

Open **Printing**, expand **Label service connection**, enable printing and save the label service address (an HTTP(S) origin such as `http://10.0.0.25:3230`) and this system's client key. The key is never shown again; leave the field blank to keep it, or tick **Clear saved key**. Changing the address drops the saved key. Alternatively set `LABEL_SERVICE_URL` and `LABEL_SERVICE_KEY` in the environment; saved settings take precedence.

**Check printer connection** shows the label service's CUPS queue and the selected label format. The selected format must match the loaded roll. **Open label service** opens the service's own page, where the admin reads the roll, selects the format and sets text sizes and direction.

Choose a **Label type**. A **Box label** uses **Test label** or a current inventory box; title, description and current location are prefilled. A **Location label** uses **Test label** or a registered location and prints only the location text, large. **Text direction** keeps the label format's saved direction, or sets landscape or portrait for this label only (label service 0.4.0 or later). **Prepare label preview** sends the content to the label service and shows its layout. Edits affect only the label, never saved inventory. Text must be Latin-1 (Swedish letters work); text that does not fit cannot be printed.

**Print one label** rechecks that the print settings and the box (contents, session and location) are unchanged since the preview, then sends the preview token with a request identifier. The label service prints exactly one copy and deduplicates the identifier, so resending after a lost response returns the original job instead of printing again. **Check print job** and **Recent print submissions** read this system's jobs from the label service. A completed CUPS job proves delivery to the driver, not legibility; check the physical label.

Verified 2026-10-24: a real, unedited box label (`BENCH-1-UNDER-P1-A`, "Dammsugare", 57 x 32 mm) printed from this application through the live label service 0.3.0 as its CUPS job 2; the owner accepted the physical label. Location labels from this application have been previewed against the live service but not yet printed.

## Management API

All endpoints require the management key and same-origin write protection:

- `GET /api/manage/printing`: `{config: {enabled, url, apiKeyConfigured}, revision, locations}`. The key is never returned.
- `PUT /api/manage/printing`: `{revision, config: {enabled, url, apiKey?, clearKey?}}`.
- `GET /api/manage/printing/status`: the label service's queue status plus the selected format.
- `POST /api/manage/printing/preview?lang=sv`: `{revision, kind?, test: true}`, `{revision, kind?: 'box', boxId, fields?}` or `{revision, kind: 'location', locationId, fields?}`, each with optional `orientation` (`portrait` or `landscape`).
- `POST /api/manage/printing/submit`: `{token, requestId}` (UUIDs); returns the label service's job record.
- `GET /api/manage/printing/jobs`, `GET /api/manage/printing/jobs/<requestId>`: this system's jobs from the label service.

Errors from the label service are passed on with their message; a rejected key is reported as a configuration problem (502).

## Earlier direct CUPS printing (0.12-0.14)

Versions 0.12-0.14 printed directly through CUPS and read the roll themselves. The physically accepted layouts, formats and roll-reading protocol moved into the label service. Their settings (`printing`) and the eight-entry `print_jobs` journal (CUPS jobs 114-121) stay in the database for audit, backup and restore; nothing reads or writes them any more. The records below document that implementation.

## Verification on 2026-10-23

Eight synthetic printing tests cover generation/escaping, HTTP IPP wire serialization, explicit media/copies, malformed responses, stale settings/content, timeout ambiguity, durable deduplication/restart, schema migration, audit/backup/restore and management authentication. The whole application suite has 89 tests.

Live testing used only the isolated persisted preview on port 3212. The existing application/queue/driver configuration was not changed. The actual loaded roll reported S0722540, 57 x 32 mm, 679 labels. The queue default was a different large size, so the job explicitly used w162h90. The PostScript was rendered with existing Ghostscript before printing and Swedish glyphs were visually checked.

One browser submission created CUPS job 114, which completed. The queue returned idle with no pending jobs and the physical roll counter reported 678. The owner confirmed the physical label looks good and supplied a photo: Swedish glyphs are legible, orientation is correct and no text is clipped. This does not verify every box/description, alternate media, sheets, QR labels, PhotoPrism or a new driver installation.

Direct CUPS access from the development computer was unavailable; a temporary SSH localhost tunnel on port 18463 through the existing host was used. The preview's saved origin points at that temporary tunnel. It is not a final LXC deployment route. Production deployment still needs a restricted, reachable CUPS endpoint and explicit cutover approval. No driver packaging or permanent network changes were made.

A subsequent owner-selected current-box label was submitted once from the browser as CUPS job 115. The unedited title, three-line description and current location fitted without layout warnings. The job completed, queue returned idle/empty and the roll counter decreased 678 -> 677. The owner approved this longer box label and supplied a photo showing legible, unclipped text and the correct location. No inventory fields were changed. The owner then reported the white power-button lamp blinking; CUPS remained idle with no incomplete jobs. This hardware indication is unresolved and is not covered by queue completion.


### Direct status investigation after the blinking lamp report

A direct TCP query `ESC A 0` returned 32 bytes with engine status 5 (Unlock), job ID 0, thermal head 0 (OK), bay 8 (media OK), and error-ID field 4096 (0x1000). The technical manual defines the field but does not enumerate this code. Other fields in this Unlock response were zero; do not interpret them as an empty roll or failed supply. The physical cause remains unconfirmed. No reset, end-job, feed or print command was sent during this inspection.

Source review found that the legacy `lib/dymo-status.ts` uses `ESC A 1` for its nominal read-only status request, including its fallback. The official DYMO driver identifies that argument as a lock request before a print job. Earlier counter checks used that legacy endpoint; therefore they may have changed print-engine ownership. The causal link to blinking is not established. Do not reuse that legacy endpoint for passive diagnostics or copy its query into the new app. Production source/configuration was not modified.

References: [DYMO technical manual](https://download.dymo.com/dymo/user-guides/LabelWriter/LW550Series/LW%20550%20Technical%20Reference.pdf), [official driver lock handling](https://github.com/dymosoftware/Drivers/blob/main/LW5xx_Linux/src/lw/LabelWriterLanguageMonitorV2.cpp). Private direct-response evidence is retained with the local preview diagnostics. A safe device-status adapter and model/response validation remain future work; the app currently displays CUPS status only.

The owner subsequently confirmed the power lamp returned to solid white without pressing any buttons or restarting the printer, after the direct `ESC A 0` query. This temporal sequence supports a transient interface-lock/ownership explanation, but does not prove the root cause or define error 0x1000. No additional physical recovery action was needed. Avoid the legacy lock-acquiring status endpoint; future status support must explicitly distinguish passive queries from acquiring/releasing ownership.


## 0.12.1 follow-up: direct diagnostics withdrawn

An optional experimental adapter identified the 5XL using `ESC V`, then sent `ESC A 0` on a separate connection after checking the CUPS queue was idle/empty. The actual firmware returns ASCII `2A` in the two-byte product field. The 32-byte reply had engine Unlock, head/media OK, error field 4096 and unavailable roll/supply values. Synthetic tests verified bounded transport, no lock request, model checks and unknown-value handling, but did not establish physical non-interference.

After the browser called that sequence, the owner reported that the white power lamp blinked again. This fails the real hardware acceptance gate. The experimental adapter, endpoint, settings and UI were removed from runnable source; private diagnostic evidence remains only in ignored local data. Its temporary direct-printer SSH tunnel was stopped. There is no automatic query/retry and no raw-printer command is exposed by the application. No reset, feed, end-job or new print command was sent. The queue still has exactly the two recorded submissions (114 and 115). Root cause is unresolved; neither `ESC A 0` nor the version/status sequence can currently be described as physically harmless.

The shipped **Check printer connection** action uses only CUPS IPP attributes. Its panel names the source, shows queue state/reasons, acceptance and pending jobs, and distinguishes CUPS default media from the app's explicit label format. It does not report roll count, physical readiness, lamp state or temperature. A driver fixture verifies that this action issues only Get-Printer-Attributes, never Print-Job. Unavailable direct diagnostic routes/settings have authentication/origin/rejection coverage. Further raw protocol work must include explicit user-observed hardware acceptance before integration.


## 0.13.0: manual roll reading and selectable formats

The earlier withdrawal above records a superseded experiment. A bounded same-connection sequence is now implemented for the tested DYMO 5XL: request ownership with `ESC A 1`, retry at most three times only while idle and awaiting ownership, read the 64-byte NFC metadata with `ESC U` after verified ownership, and send `ESC Q` before closing. No version query, `ESC A 0`, feed, reset, print-data or job-start command is used. Release is sent only after this connection has proven ownership; an ambiguous or foreign lock is never released. The response indicates that release was requested, not a firmware acknowledgement.

The owner observed solid white power and no extra label movement after the complete experimental read cycle and again after **Read loaded roll** in the app. The app read S0722540 with 677 labels remaining. An isolated `ESC A 0` query had reproduced blinking; synthetic transport checks alone were insufficient to establish physical behavior. Error 0x1000 remains undocumented here.

Enable **DYMO roll reader** only with the intended printer TCP host/port (normally 9100). Use **Read loaded roll** explicitly after changing rolls, with no other host printing. This temporarily reserves the printer and releases it; it is not passive monitoring. The CUPS preflight and app busy guard cannot prevent a different application from racing. Counts are timestamped snapshots and may be zero. No background polling, inventory write or print job is created.

The article and remaining count come from the printer. Nominal dimensions come from the explicit article-to-format presets verified against the legacy template source, not from the CUPS default or undocumented raw dimension units. Unknown articles return unknown size. Choose **Use detected format**, then save print settings and prepare a fresh preview. The selected format is visible above the preview. A new read is required after another roll change; the app does not infer a physical roll change automatically. Overflow still blocks printing.

Only S0722540 has physically accepted printed output so far. The other three formats have layout/PostScript checks; their physical output remains pending. A real change to S0722520 was accepted by the owner with the correct 25 x 54 mm / 413-label result, solid power and no extra feed. The isolated preview uses temporary SSH routes for CUPS and direct printer access; these are not the future LXC deployment configuration. Production application, driver, queue settings and services were not changed.

Seven new synthetic cases cover exact same-socket sequencing, bounded lock attempts, refusal to release foreign/ambiguous locks, release after metadata failure, malformed/unknown/zero-count responses, all four page geometries, settings validation and concurrent/revision guards. Full local suite: 97 passing tests.

Roll-change observation: after the owner confirmed the replacement was loaded, the app read S0722520 / 25 x 54 mm / 413 labels. The saved format already matched. A fresh preview with a visible format caption was checked without printing. The owner confirmed the size/count and solid power with no extra feed after this replacement read.

Owner-authorized alternate-format test: the stale browser preview was rejected before submission, then regenerated. One S0722520 / 25 x 54 mm test label was submitted as CUPS job 116. Physical output acceptance is pending.

Job 116 follow-up: CUPS remained processing and reported `com.dymo.slot-status-error`. Ghostscript exited without errors; the socket backend was still active. No second job, cancellation, reset or raw status read was sent. Physical outcome and the cause of this queue reason remain pending.

Physical test job 116: the owner confirmed the 25 x 54 mm test label emerged, but reported blinking power afterward. CUPS still showed processing / `com.dymo.slot-status-error`. This is not full acceptance of alternate-format printing; text/orientation and clean job completion remain unconfirmed. No additional label, cancellation, reset or direct roll query was sent during the active job.

Job 116 physical correction: the owner clarified that the label was blank, with blinking power. This is a failed alternate-format print, not accepted output. The actual CUPS spool PostScript renders the expected Swedish text. Offline CUPS conversion (raster destination only, no printer backend) produced one 271 x 593 RGB page with 18,360 non-white bytes, including black pixels. The installed filter is the LanguageMonitor-enabled `raster2dymolw_v2`, not a verified no-monitor patch. CUPS first reported `com.dymo.slot-status-error`, then the socket backend failed with `Broken pipe` and busy-error; those observations do not establish the physical cause. Only test job 116 was canceled to prevent retry; no incomplete jobs remain. No additional print, raw device query, reset, production driver/configuration change or service restart was performed. The owner confirmed solid power after cancellation. This links the blinking to the failed print cycle, but does not identify why the label was blank. Evidence remains in the ignored preview diagnostics.

The owner proposed incomplete roll feeding after replacement and explicitly authorized one more test. With CUPS idle/empty, the app generated a fresh same-format preview and submitted exactly one S0722520 / 25 x 54 mm test as job 117. Physical outcome and queue completion are pending; no change to layout, media, driver or device configuration was made between jobs 116 and 117.

Repeat physical test 117: unchanged S0722520 / 25 x 54 mm test, explicitly authorized by the owner to check initial feeding. The owner reported no label and blinking power. CUPS again reported `com.dymo.slot-status-error`. Only test job 117 was canceled; the queue is empty/idle, with a printer-not-ready message. No reset, raw read, driver/configuration change or further print was performed. The repeat failure argues against a single initial-feed event, but does not distinguish roll seating/sensing from driver/protocol behavior.

0.13.1 follow-up: a bounded A1 probe returned engine 2, job ID 0, bay 9 (jammed), SKU S0722520, count 413, and error-ID zero. This is a granted host response in the protocol, despite being an error state. The reader previously treated only engine zero as owned; cleanup now also releases a granted engine-2 reservation with no active job, while reporting the error before reading NFC. A regression test confirms Q-only cleanup, no U/feed/reset and no release for a nonzero active job ID. The corrected live reader reports the label jam and sends release. The owner reported that reloading and pressing the printer's own feed button did not restore normal feeding/solid readiness. A control test with the previously accepted 57 x 32 mm roll is pending; no more software print jobs have been submitted.

The owner subsequently found the replacement roll was installed backwards, with the label side facing the wrong way, preventing correct sensing. The owner corrected the loading and authorized a fresh test. Previous driver/protocol suspicions are not an established root cause of the physical failures; this loading error is owner-verified. The separate error-reservation cleanup fix remains valid.

After corrected roll loading, app reading returned S0722520 / 25 x 54 mm / 411 labels. A fresh test was submitted once as CUPS job 118. It completed promptly; queue idle, zero queued jobs, reasons none. No media/layout/production driver change was needed. The owner accepted physical text/orientation and solid power, supported by the supplied photo.

Final physical acceptance for job 118: the owner confirmed clear, correctly oriented, unclipped text and solid power. The supplied photo confirms Swedish glyphs and the 25 x 54 mm portrait layout. Two formats now have accepted real output (57 x 32 and 25 x 54 mm); 19 x 51 and 54 x 101 mm have synthetic layout checks only. The roll-loading error resolved the reported print failure; no production driver/configuration changes were needed.

Third-format test: the app read S0722430 / 54 x 101 mm / 219 labels. At the owner's request, the detected format was selected and saved, a fresh warning-free test preview was generated, and one label was submitted as CUPS job 119. CUPS reports completed. The owner approved physical layout/text and confirmed solid power. The supplied photo shows legible Swedish glyphs, correct portrait orientation and unclipped text. No production driver, queue configuration or service change.

Physical acceptance now covers three formats: S0722540 (57 x 32 mm), S0722520 (25 x 54 mm), and S0722430 (54 x 101 mm). S0722550 (19 x 51 mm) remains untested physically.

Fourth-format test: the app read S0722550 / 19 x 51 mm / 470 remaining. The initial fixed sample preview correctly blocked printing because its description did not fit at 8 points. The description setting was reduced to 6 points through the normal UI; a fresh preview had no warnings. Exactly one test was submitted as CUPS job 120, which completed. The owner confirmed legible, correctly oriented, unclipped text and solid power. The isolated preview remains configured for this format with descriptionSize 6 (settings are shared, not saved per media preset).

Final acceptance for job 120: the owner confirmed legible, correctly oriented, unclipped text and solid power. All four explicit formats now have real owner-accepted test output: S0722540 (57 x 32 mm; jobs 114/115), S0722520 (25 x 54 mm; job 118), S0722430 (54 x 101 mm; job 119), and S0722550 (19 x 51 mm; job 120). This verifies the tested layouts on this 5XL/CUPS route, not every inventory label or other printer. Description size is currently 6 points for the smallest format; text sizes are shared settings, not per-format profiles.
