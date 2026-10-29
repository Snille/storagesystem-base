# Shared search log

Implemented in 0.29.0, not yet deployed. Open **Search & answers → Search log**
(Swedish: **Sökningar och svar → Söklogg**). This is the initial tab. Filter by
received search text and source, refresh the newest page or browse older entries.
Dates are displayed in the browser's local timezone. Expand Matching boxes for
the labels and human-readable locations returned at the time of the request.

## What is recorded

| Source | Requests |
| --- | --- |
| Web | Management inventory search, including browser dictation after transcription |
| API / Home Assistant | Public REST search and `/ask`; the existing HA client uses this API |
| MCP | `search_inventory` tool calls, including batches |
| Preview | Search & answers management decision previews |

Each accepted request gets a separate entry, even if it repeats the previous query
or returns zero matches. Internal inventory lookups, box/location/photo reads,
unauthorized requests and reading the log do not create entries. The GUI can issue
multiple searches while someone types or refreshes a filtered map; these are
individual server requests, not a count of distinct spoken questions.

Records contain an ID, completion time, source/mode, received query, language,
duration, outcome, returned count and match snapshots (box ID, label and readable
location). Public `/ask` records its final AI-phrased answer or local fallback;
plain search has no generated answer. Preview answers are marked separately.
MCP returns candidates to its caller, so the caller's later prose is not recorded.

This log does not contain microphone audio or what the person intended to say.
An HA entry shows the already transcribed text. API requests cannot currently be
attributed specifically to HA, nor to an individual device, user or conversation.
Earlier searches cannot be reconstructed from this table.

## Persistence and limits

Schema 4 adds `search_history` in the application's SQLite database, separate from
inventory and the legacy print journal. Schema 1/2/3 databases migrate in order.
Entries have no foreign-key dependency on current boxes: snapshots survive later
inventory moves/updates. Journal writes do not notify the embedding worker or
rewrite inventory rows. If recording fails, search still returns its result and
a generic console warning identifies the recording failure; logging is best effort.

Keep at most 10,000 entries and 90 days. The next write removes expired/overflow
rows atomically with insertion; listing always hides expired entries. Query text
is bounded to 2,000 characters, answers to 4,000 and matches to 25, with text
truncation flags displayed in the GUI. Match fields are also bounded. No credentials,
headers, signed photo URLs, image bytes or raw exception/provider messages are
copied. Text/answers themselves remain private application data.

Full SQLite backups and controlled restore include the log. Inventory JSON export
and legacy import do not. The integrity audit validates records and normalized
filter keys. Use an isolated copy for migration/restore testing. Schema-3 images
cannot open a schema-4 database; rollback requires a compatible backup and handling
any inventory edits since that backup. Production has not been migrated by this work.

## Management API

`GET /api/manage/search-history` uses the configured management access mode and
origin/allowed-host rules. Public read keys do not grant access to this endpoint.
Optional query parameters:

- `q`: case-insensitive normalized substring of received query, up to 2,000 characters.
- `source`: `web`, `api`, `mcp` or `preview`; omitted means all sources.
- `before`: positive sequence cursor returned by the previous page's `next` value.

Response: `{entries, next, retentionDays: 90, maxEntries: 10000}`. Pages contain up
to 50 entries, newest first. `next: null` marks the last page. Keep filters unchanged
when following a cursor; new inserts do not shift an older page. `entries` contain
`id`, `createdAt`, `source`, `mode`, `query`, `queryTruncated`, `language`, `outcome`,
`durationMs`, `answer`, `answerTruncated`, `answerSource`, `count` and `matches`.
Outcome is `complete` or `error`; failed requests do not persist error details.
There is no public write/delete API or MCP tool for the log.

## Verification

`test/search-history.test.js` covers source capture, repeated/no-result questions,
protected access, safe failures, snapshots, Unicode filters, cursor races, retention,
text bounds, migration, audit and both full-restore paths. The AI test verifies that
the logged answer is the final phrased response. Ordinary offline tests never use
production data, live inference or printing.
