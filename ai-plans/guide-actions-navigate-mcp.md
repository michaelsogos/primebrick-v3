# Guide Assistant — actionable answers: in-app navigation + MCP tool CTA

> Continuation of `guide-assistant-kb-plan.md` — Guide is live and verified
> (Qwen 2.5 Coder 3B, cerebellum `guide`, retrieval RAG working). This plan
> adds two interaction capabilities: **navigate CTA** (go to the page, no
> new tab) and **action CTA** (execute an MCP-mapped action).

## Status: 🟡PARTIALLY DONE — Plan date: 2026-10-01 02:30 UTC / 02:30 +02:00

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Shared `AiAction` type + `actions` on ChatMessage/ProcessedResponse | ✅ done | 2026-10-01 | incl. `page_route` on tool actions |
| 2 | Guide system prompt: action contract (`navigate` + MCP tools catalog) | ✅ done | 2026-10-01 | static block → KV cache preserved |
| 3 | `process_response`: parse fenced ````action` JSON block → `actions` | ✅ done | 2026-10-01 | malformed → dropped, fail-safe; cap 5 |
| 4 | Shared panel: render action chips/CTA under assistant message | ✅ done | 2026-10-01 | `ai-action-chips.svelte` under `sources` |
| 5 | `navigate` executor → reuse `invokeClientTool` (goto, no new tab) | ✅ done | 2026-10-01 | `registerBuiltinClientTools()` + registry |
| 6 | MCP `tools/call` REST shim on BE (controller → service → dispatch.ts) | ✅ done | 2026-10-01 | `invokeGenericTool` shares the SAME 12 handlers with MCP — zero duplication |
| 7 | FE `callMcpTool` in api.ts + confirm dialog (meta-driven form, entity-resolution card + `_blank` edit link) | ✅ done | 2026-10-01 | resolve phase → entity card → editable/read-only args per tool kind |
| 8 | i18n keys ×6 + EN fallback; svelte-check + lint + manual E2E | ⏳ partial | 2026-10-01 | 84 keys seeded + Redis invalidated; svelte-check 0 err, eslint clean; **manual E2E pending** |
| 9 | (optional) ingest entity/API catalog doc into docs_kb | ⏳ not done | — | improves tool-arg grounding; not blocking — dialog fetches `get_entity_meta` |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Analysis — what exists (verified)

- **`client-tool-registry.ts`** (`src/lib/shell/ai-chat/`) already implements
  exactly the `navigate` client tool (`goto(route?query)`). It was built for
  the global assistant's SSE orchestrator — **reusable as-is by the Guide**:
  `registerBuiltinClientTools()` + `invokeClientTool('navigate', {route})`.
- **MCP tools on BE** (`/mcp`, `generic-tools.ts`): 12 generic entity tools —
  `list_entities`, `get_entity`, `create_entity`, `update_entity`,
  `delete_entity`, `restore_entity`, `get_entity_audit`,
  `list_available_entities`, `get_entity_meta`, `bulk_entity_action`,
  `manage_service`, `search_docs`. All dispatch through `dispatch.ts` → the
  same services behind `/api/v1/entities/:entity`.
- **Shared panel** renders `sources` as external doc chips; message body is
  plain text (`{message.content}`), no markdown.
- **Shared composable** supports `process_response` returning extra fields —
  same pattern used for `sources`. `choices` machinery exists but is
  card-oriented (apply/discard semantics); actions are simpler chips.

## Design

### Contract (model → FE)

System prompt gains a compact tool catalog + output contract. Model appends
**at the end** of the answer 1..N fenced blocks (cap: **5**):

```
```action
{"kind":"navigate","route":"/system/settings/users","label":"Apri Utenti"}
```
```action
{"kind":"tool","tool":"create_entity","args":{"module":"auth","entity":"user",
 "data":{"email":"test@x.com"}},"label":"Crea l'utente"}
```
```

`process_response` strips the blocks from `content` (display text) and stores
parsed actions on the message — identical lifecycle to `sources`. Malformed
JSON → ignored, plain answer (fail-safe).

### Action types (shared, DRY)

```ts
export type AiAction =
  | { kind: 'navigate'; route: string; query?: Record<string,string>; label: string }
  | { kind: 'tool'; tool: string; args: Record<string,unknown>; label: string; confirm?: boolean };
```

- `navigate` → `invokeClientTool('navigate', …)` → `goto` — same-tab, no new window.
- `tool` → FE calls the thin BE REST endpoint `POST /api/v1/system/mcp/call`
  `{tool, args}` → controller → **existing** `dispatch.ts` functions.

### HARD RULE — no AI backdoors

Existing endpoints are **enforced standards**: never modified, never
customized for the AI. The shim only re-exposes the SAME dispatch path; the
model fills args for the STANDARD contract — if the data isn't there, the
flow degrades to entity resolution / navigate, never to a custom endpoint.

### Entity resolution (update/delete/restore — deterministic)

The model rarely has a `uuid`. Execution for mutating entity tools is ALWAYS
preceded by deterministic resolution:

1. **Page context**: if `page.url.pathname` matches a detail route
   `{entity_route}/<uuid>` (e.g. `/system/settings/users/abc-…`) and the
   entity matches the action target → uuid taken from the URL.
2. **Else search**: FE calls `list_entities` (or `get_entity`) through the
   shim to find candidates matching the user's words (name/email…).
3. **Entity card** shown in the confirm dialog: summary fields (from
   `get_entity_meta` — pick display fields deterministically) + a link to the
   entity's **edit page in a `_blank` tab** (`{entity_route}/{uuid}` — same
   convention used by existing update flows), so the user can open the record
   and verify. Buttons: **Confirm & Execute** | **Cancel** (+ the edit link
   is an escape hatch: "I'll do it myself").
4. Ambiguous matches (N>1) → the dialog lists candidates, user picks one —
   never a silent guess.

### Meta-driven decisions

`get_entity_meta` is the deterministic oracle: required fields, field types,
labels. The confirm dialog renders **meta-driven fields** (typed inputs) for
`create`/`update` — model's args pre-fill them, user completes/fixes — NOT a
raw JSON textarea. If meta fetch fails → dialog degrades to read-only args +
"open the page instead" option.

### Tool catalog for the model

Static compact list injected in the **system prompt** (stable prefix → KV
cache preserved):

```
ACTIONS — you may append ONE ```action block at the end of the reply:
- navigate {route,label}: opens an app page (use real app routes only).
- tool {tool,args,label}: propose executing a server action after user
  confirmation. Available tools: create_entity{module,entity,data},
  update_entity{module,entity,uuid,data}, delete_entity{module,entity,uuid},
  list_entities{module,entity,filters?}, get_entity_meta{module,entity}.
Only propose a tool when the documentation describes that exact procedure
and you can fill args from meta/context. NEVER invent field names — if unsure
about required fields, propose navigate to the page instead.
```

Guardrail: model needs field names for create/update. `get_entity_meta` exists
but the guide has no multi-turn tool loop — v1 instructs the model to prefer
`navigate` unless the docs give concrete field names; the confirm dialog lets
the user inspect/edit payload before sending (payload shown as editable JSON).

### BE shim (controller-boundary compliant)

- `controllers/http/mcp-call.router.ts`: `POST /api/v1/system/mcp/call` →
  `rbacHandler(AUTHENTICATED_USER)` → zod `{tool:string, args:object}` →
  **one** service call `callMcpTool(tool,args,ctx)` → invokes the matching
  `dispatch.ts` function → returns `{ok,result|error}`.
- **All 12 tools exposed** — `manage_service` included (service registry:
  list/get/toggle `is_enabled`/update metadata/hard-delete). RBAC already
  gates every dispatch; a whitelist adds nothing. `search_docs` stays unused
  from the browser (its REST sibling exists) but works anyway.
- Service-layer reuse: the shim maps `tool` → dispatch function via the same
  table the MCP server uses — single source of truth.

### Panel rendering

Under `sources` chips, render `message.actions`:

- **`len == 1`** → single inline CTA chip (compact, same row rhythm as sources).
- **`len > 1`** → stacked list of action cards (one per row: icon + label +
  kind badge) — max 5 enforced at parse time.
- `navigate` → click executes `goto` immediately (harmless, same tab).
- `tool` → click opens the confirm dialog:
  - **Read tools** (`list_entities`, `get_entity`, `get_entity_meta`,
    `get_entity_audit`) → no dialog, execute on click, result rendered as a
    local assistant message.
  - **Create** → meta-driven form pre-filled from model args; user completes
    and executes.
  - **Update/delete/restore/bulk** → **entity-resolution flow first**
    (page context → search → entity card + `_blank` edit-page link), then
    confirm. Update fields meta-driven/editable; delete/restore read-only —
    confirmation is about *what*, not *how*.
  - `manage_service` → read-only args + confirm (code is the identifier).
- On result: `addLocalAssistantMessage` with outcome; executed action gets
  `resolution` marker → chip renders disabled with ✓/✗.

### Files

| File | Change |
|---|---|
| `ai-assistant.types.ts` | `AiAction` type; `actions?` on `ChatMessage` + `ProcessedResponse` |
| `use-ai-assistant.svelte.ts` | pass `actions` through `process_response` result → message (1-line, mirrors `sources`) |
| `ai-chat-panel.svelte` | render `actions` chips + confirm dialog (shared — regex/json unaffected, they never emit actions) |
| `use-guide-ai.svelte.ts` | system prompt catalog; `process_response` parses ````action` block; strip from content |
| `client-tool-registry.ts` | reuse — Guide calls `registerBuiltinClientTools()` on init |
| `src/lib/mcp-call.ts` or api.ts | `callMcpTool(tool,args)` → `POST /api/v1/system/mcp/call` |
| BE `mcp-call.router.ts` + service | thin shim over `dispatch.ts`, tool whitelist |
| translations | `app.smart.guide.ai.action.*` ×6 + EN fallback (`confirm`, `execute`, `result ok/error`…) |

## Resolved decisions (from review)

1. **Tool scope**: ALL tools, `manage_service` included (it's the service
   registry of registered microservices — list/get/toggle/update/hard-delete).
   RBAC denies what the user can't do anyway.
2. **Args editing**: per-tool — editable for `create`/`update` (model may omit
   fields; dialog enriches with `get_entity_meta`), read-only for
   delete/restore/bulk/manage, no dialog for read tools.
3. **Multi-action**: 1..5 actions per reply; `len==1` → inline chip,
   `len>1` → stacked action cards.

## Optional (non-blocking)

- Ingest a generated "entities & fields catalog" doc into `docs_kb` so the
  model can pre-fill tool args more accurately. Only needed if tests show the
  model proposing wrong field names often.

## Acceptance criteria

- [ ] "come rendo admin un utente" → answer + `Vai a Utenti` chip → goto
      `/system/settings/users` same tab
- [ ] "crea un utente test@x.com" → CTA chip → confirm dialog w/ payload →
      POST executes via dispatch → success message in chat
- [ ] Malformed action JSON → ignored, plain text answer (fail-safe)
- [ ] Model never fabricates fields → prefers navigate when unsure
- [ ] No new tabs anywhere; citation chips unchanged
- [ ] svelte-check 0 errors; BE tsc clean; translations ×6
