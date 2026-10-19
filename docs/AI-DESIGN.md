# AI settings design proposal

Status: wider design direction with initial settings/single-photo implementation in 0.4.0-dev and multi-photo new-box draft review/edit/save in 0.5.0-dev. Available now: overview, named connections, task settings/extra instructions and combined analysis of one to six photos with per-photo roles and interpretations. AI updates to existing boxes, inventory answers, translation drafting and legacy customization mapping remain planned. This design replaces the organization of the reference settings rather than copying that form.

## Findings from the reference implementation

Reviewed `app/settings/settings-form.tsx`, `lib/config.ts`, `lib/analysis/index.ts`, `lib/public-api.ts`, `lib/types.ts` and `lib/translation-draft.ts` in the existing Storage System source.

- The model picker and model ID field both edit the active connection's model.
- Photo role detection, individual photo descriptions, whole-box suggestions and inventory answers use the primary AI configuration. Translation has a separate configuration with implicit credential fallback.
- Prompt editing combines general defaults, provider/model overrides, role-specific system/user pairs, answer prompts, translation instructions and output cleanup lists.
- Inventory search itself is local. AI can phrase an answer from the resulting matches; it does not perform the underlying inventory lookup.

These implementation layers should not determine the normal settings navigation.

## Navigation and ownership

Use three sections under Settings > AI:

1. **Overview**: what AI can help with, whether each task is enabled, its selected connection/model, and the last explicit test result. No invented capability or connection status.
2. **Connections**: provider, endpoint and credentials, entered once per named connection. Reuse connections across tasks. Explain whether requests go to the configured local service or a remote provider. Connection tests are explicit actions.
3. **Tasks**: Image inventory, Inventory answers, and Interface translation. Each task explains when it runs, what it receives, what it produces and which connection/model it uses.

A provider describes the service. A connection describes one configured endpoint/account. A model is chosen once per task, with a single picker that also accepts an exact ID when discovery is unavailable. Do not show a second field for the same value.

Start with one connection and Image inventory. Additional connections and task-specific models are optional. Avoid mandatory configuration for unused tasks. Never infer model image support solely from its name; distinguish reported capabilities from a successful image test.

## Task copy and normal controls

| Task | Explanation shown in the UI | Normal controls |
| --- | --- | --- |
| Image inventory | "Turn selected photos into a draft box description and searchable keywords. Review the draft before saving." | Enable, connection, model, output language, suggest photo roles |
| Inventory answers | "Write a short answer using matching boxes from your inventory. Search also works with this turned off." | Enable, connection, model, answer language, short or detailed answer |
| Interface translation | "Create draft translations for interface text. This does not translate your stored box descriptions." | Connection, model, target language, explicit draft action |

Interface translation belongs with language maintenance, with a link from the AI task list. It is not part of daily box inventory. Existing public/voice answer distinctions remain available as advanced options within Inventory answers, preserving external API behavior.

Where a language follows the application's language, show both the rule and the current resolved language. Never encode inheritance as an unexplained blank input.

## Image workflow

Show these stages in the analysis screen, with a brief explanation at each stage:

1. Select photos and assign or suggest roles.
2. Describe photos using their roles: label, storage location, inside, spread-out contents or detail.
3. Build a box draft with suggested label, location, description and keywords.
4. Review, edit and explicitly save a new inventory session.

This is the proposed new workflow, not a claim that the reference always executes those stages in that order. A manually assigned role takes precedence unless the user explicitly requests a new suggestion. Explain the chosen role next to the image rather than requiring a visit to prompt settings.

Suggested role help: **Label** - "Read visible labels and codes." **Storage location** - "Describe where the box is stored." **Inside** - "Identify visible contents inside the box." **Spread-out contents** - "Identify items laid out for inspection." **Detail** - "Describe one item or a close-up."

AI actions must show which selected photos or inventory text will be sent to which connection before running. Image tests send only explicitly selected test material and do not save inventory. Never describe a local connection as a guarantee about that service's onward data handling.

## Advanced instructions

Provide one collapsed **Advanced instructions** area per task. For Image inventory, split it into Photo roles, Photo descriptions and Box draft. Show an editable extra-instructions field first, for example: "Mention dimensions only when visible. Keep product codes exactly as written."

Keep required output formats, identifier validation and integrity rules application-owned. Advanced raw prompt templates, if supported, must explicitly show the task/stage, effective instructions and restore-default action. System/user separation is expert detail rather than the initial editing experience. Mark changed instructions as Custom; default instructions are visible and inspectable.

Do not recreate implicit provider/model prompt switching in the normal UI. If reusable instruction profiles are needed later, select a named profile explicitly for a task and display that selection next to its model. Merely changing models must not silently change instructions.

Legacy cleanup lists remain compatibility data until evaluated against representative outputs. Prefer structured output validation over adding user-maintained cleanup phrases to the basic UI. Do not silently delete imported customization or assume structured output makes every cleanup rule obsolete.

## Tests, feedback and migration

- Separate Test connection from Try image analysis and Preview answer. A reachable service is not proof that the selected model accepts images or follows the required response format.
- A test preview shows its input, connection/model, output and errors. Only display latency/token/cost information actually returned or measured; label estimates explicitly.
- Keep AI failure recoverable: inventory editing and local search remain usable. Preserve the draft, explain which stage failed and offer an explicit retry.
- Resolve one immutable task configuration at the beginning of a request and pass it through the adapter; do not reread mutable global settings partway through a job. Never hold a database transaction during external requests.
- Before migrating existing settings, present the effective legacy connection, model and instruction overrides for each task. Preserve original imported settings and require an explicit mapping for ambiguous customizations. Avoid implicit credential inheritance between connections.
- First implement connection setup and a single isolated image-analysis preview. Add box draft review/save next, then optional answer phrasing. Interface translation follows separately.

Acceptance checks must cover redacted credentials, configuration changes during requests, explicit instruction inheritance, image-model failures, preservation of user drafts, review before save, and the same saved inventory behavior through UI, REST and MCP. Use disposable inventory data; no production updates or physical printer tests are part of this work.

## Adapter references

The initial adapter follows OpenRouter's official [image input](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding), [model catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) and [current API key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key) contracts. Image input uses a base64 thumbnail in a chat content array. The initial implementation requests JSON object output and validates the fields in application code; it does not claim server-enforced strict JSON Schema support for every compatible service/model.
