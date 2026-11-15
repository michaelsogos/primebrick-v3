# Job Rules — Callable Targets & Payload Mapping

> Continuation of `jobs-orchestration-architecture.md` (COMPLETED). Scope: replace
> the `jobs.due.*` invention with direct calls to services' own NATS subjects
> (census `callables`), and give rules a form-built payload map (DST). The
> scheduler stays a dumb trigger — services never learn the word "schedule".

## Status: 🟢 DONE — archived 2026-11-05 (tasks 1–10 E2E-verified; task 11 extracted to `crm-semantic-events.md` — different workstream, kept alive there) — Plan date: 2026-10-31 / CET

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | sdk: `payload_schema` + `label_key` + `description_key` on `NatsRoute`/`NatsRequestRoute` (additive); `payload_schema` may generate `validate` | ✅ done | 2026-10-31 | auto-collect via callable-registry; kind pub/request recorded; wildcards rejected |
| 2 | sdk: publish `callables` in service_registry via the existing registration channel (like `emits`/nav) — mandatory `payload_schema` to be listed | ✅ done | 2026-10-31 | post-onReady re-register; BE enrollment validator `validateCallablesDeclaration` gated like nav/events |
| 3 | core: types `CallableDecl`, `PayloadMap`/`PayloadMapEntry` (DST `{kind:'const'|'path'|'meta'}`) | ✅ done | 2026-10-31 | `src/payload-map.ts` — types + pure `applyPayloadMap` resolver (shared FE/JH) |
| 4 | JH: `job_rule.payload_map` column (jsonb + authored `json_schema` DST) — REPLACES `payload_mode`; migration patch for the column swap | ✅ done | 2026-10-31 | patch signed `dev-micha-2`; db:check clean; `payload_mode` never existed → add-only |
| 5 | JH: `target_subject` validation → must exist in `census.callables`; engine applies `payload_map` then publishes verbatim to the target subject; write `job_runs.dispatched` directly (no due-tap) | ✅ done | 2026-10-31 | `due-forwarder.ts` trampoline (JS target must be stream-captured); `callable-catalog.ts` cache via `service.register` broadcasts + `service.registry.get` cold-start; `beforeCreate`/`beforeUpdate` reject unknown targets |
| 6 | emailsender: `payload_schema` on `emailsender.send` route (contract already known) | ✅ done | 2026-10-31 | live-verified in service_registry.endpoints.callables |
| 7 | FE: `options_source:"census.callables"` vocabulary + `subject_combo` on `target_subject` | ✅ done | 2026-10-31 | ComboSelect `allowCreate=false`; callable `label_key`/`description_key` resolved via census-module dict loading |
| 8 | FE: `payload_map` widget in closed `CONTROLS` — config-entry anatomy: dynamic rows right / `JsonValueEditor` last field bottom | ✅ done | 2026-10-31 | `PayloadMapEditor` in `@primebrick/ui`; bidirectional builder⇄JSON sync; rows driven by `target_schema`/`source_schema` props |
| 9 | FE: schema-derived editor seed (`array`→`[]`, `object`→`{}`) on edit-open, non-propagating until first real edit | ✅ done | 2026-10-31 | in `JsonValueEditor` edit-open; `[]`≡`null`≡match-all in engine |
| 10 | FE: permission warn-in-form when target route's `permissions` exceed the rule actor's set | ✅ done | 2026-10-31 | warn rendered under callable combo; enforcement stays on the route (verified live) |
| 11 | CRM sales-logic boundary → semantic event `crm.customer_high_value` (subscriber separate from CRUD) | ➡️ moved | 2026-11-05 | extracted to `crm-semantic-events.md` — separate workstream (CRM sales-logic ownership), not this plan's scope; nothing lost |

### E2E verified 2026-10-31 (rule `e2e-callable-dispatch`, `emailsender.response.*` → `emailsender.send`, `@every 15s`)

- **System lane**: `dispatched` rows in `job_runs` (`lane: system`, `initiator: rule:e2e-callable-dispatch`, `report.target: emailsender.send`); callable reached and denied `AUTH_CLIENT_SHIELD_SECRET_INVALID` — **intentional governance** (user-context route rejects service-only call).
- **User lane**: event published with serialized AuthUser + rotating secret → `jobs.due.user.job.forward.<uuid>` armed with `forwardHeaders` → forwarder republished with user auth → `emailsender.send` accepted → template rendered → provider POST → `sender_log: sent` + `job_runs: dispatched` (`lane: user`) every 15s.
- **Anti-loop**: callable's own `emailsender.response.*` publishes carry no auth → user-lane rule refuses re-arm (warn logged), no feedback storm.
- **Disarm**: rule disabled + `jobs.ctl.rules.changed` → `job_schedules.status: disarmed`.
- `job_schedules.target_subject` mirrors `emailsender.send` (not the trampoline).

Pre-existing issues found (not caused by this work): `client_shield_registry.reload` fails with `SyntaxError` in service logs (stale cache risk); Brevo provider row pointed at a dead wiremock port.

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Architecture

### The decoupling rule (user-mandated)

JH and every other service share **zero knowledge**. A service declares its own
domain NATS routes (`makeNatsRoutes` — e.g. `emailsender.send`); the scheduler
is a dumb trigger that, at fire time, publishes a payload to a subject it does
not understand. There is no `due`/`jobs` vocabulary anywhere in service
declarations — the previous `jobs.due.<lane>.<svc>.<action>` tree forced every
executor to know scheduling existed. Retired as the target surface.

```
customer CRUD ──pub──> crm.customer_changed            [domain fact]
        │
        ▼  (separate subscriber — sales logic, NOT in CRUD code)
   emits crm.customer_high_value                        [semantic event, in `emits`]
        │
        ▼
   job_rule: source=crm event=customer_high_value
            filter=[...] schedule=@every …
            target_subject='emailsender.send'           [from census.callables]
            payload_map={templateCode:const, to:path,…} [DST on the row]
        │
        ▼  fire time — JH resolves map → publishes to emailsender.send
   emailsender handles it like ANY caller. It never saw a schedule.
```

### Callable census (`census.callables`)

`NatsRoute`/`NatsRequestRoute` gain optional-but-required-for-listing fields:

```ts
{
  subject: 'emailsender.send',
  queue: 'emailsender',
  permissions: [Permission.EMAILSENDER_SEND],
  payload_schema: { …JSON Schema of SendEmailRequest… },
  label_key: 'emailsender.callable.send.label',
  description_key: 'emailsender.callable.send.desc',
  handler: …
}
```

- `payload_schema` is the contract the form needs — **mandatory to appear in
  the census** (a callable without a contract is not mappable; widen later only
  on expressed need).
- Registration rides the existing `service_registry` channel that already
  carries `emits`/nav — services describe themselves; nothing scheduler-shaped
  is declared.
- Symmetric: `emits` entries also gain optional `payload_schema` so the
  path-picker shows real source-event fields (not hand-typed JSONPath).

### Payload map (DST)

`job_rule.payload_map` — jsonb column, authored `json_schema` = the DST shape:

```jsonc
{
  "templateCode": { "kind": "const", "value": "customer_high_value_notice" },
  "languageIso":  { "kind": "const", "value": "it" },
  "to":           { "kind": "path",  "path": "$.customer.account_manager_email" },
  "entityUuid":   { "kind": "path",  "path": "$.customer.uuid" },
  "entityTable":  { "kind": "const", "value": "crm.customers" },
  "initiatedBy":  { "kind": "meta",  "meta": "actor_uuid" }
}
```

Kinds: `const` (literal) · `path` (JSONPath into the source event payload,
`$` = whole payload passthrough) · `meta` ∈ `{actor_uuid, rule_id, fired_at}`.
Three kinds only — nothing else until a need is expressed.

`payload_map` **replaces `payload_mode`** (verbatim/source_ref): an absent map
forwards the event payload verbatim (same default as before).

### Fire path

1. Event on `event_subject` + `matchFilter` (unchanged — `[]`≡`null`≡match-all,
   `rules-engine.ts:41`).
2. Schedule fires → JH resolves `payload_map` against the event payload
   (const/path/meta interpolation) → publishes to `target_subject` with the
   stored identity (user lane = serialized user auth, system lane =
   service-shield — `execution_context` picks the publisher identity, not the
   subject).
3. `job_runs.dispatched` written directly by JH (it is the publisher — no
   `jobs.due.>` tap). `succeeded`/`failed` where a response channel exists;
   `jobs.result.*` stays opt-in.

### Form (metadata-driven, config-entry anatomy)

- `payload_map` = entity column → widget `payload_map` registered in the closed
  `CONTROLS` set (unknown-widget → throw posture unchanged).
- Anatomy = config-entry standard: **static fields left / dynamic builder
  right / `JsonValueEditor` as the last field at the bottom**.
- Rows derive from `callables[target].payload_schema`: required/optional
  flags, per-row kind picker + input (const input · source-field path picker ·
  meta select). Path picker lists real source-event properties from
  `emits[source].payload_schema`.
- `target_subject` = `subject_combo` fed by `census.callables` (same
  page-resolved prop pattern as `emitsOptions` — EntityFormPage resolves,
  dispatcher consumes).
- Permission warn: if the target route declares `permissions` the rule actor
  lacks → inline warn; enforcement stays on the route at fire time.
- Editor seed: empty/null JSON column opens with the schema-root base set
  (`[]`/`{}`), non-propagating until first real edit (uses the existing
  `applyingExternal` gate — opening the editor never taints the form).

## Locked decisions (user)

| Point | Decision |
|---|---|
| payload_mode vs payload_map | replaced |
| permission mismatch | warn in form, route enforces |
| payload_schema on routes | mandatory for census listing |
| DST kinds | const · path · meta ($ root allowed) |
| vocabulary name | `census.callables` |
| widget name | `payload_map` |
| form layout | config-entry standard (static L / dynamic R / JSON last) |
| semantic event name | `crm.customer_high_value` |

## Acceptance

- A rule created end-to-end in the form: source `crm`, event
  `customer_high_value`, target `emailsender.send` picked from the combo,
  map built by rows only → publishes a valid `SendEmailRequest`; emailsender
  processes it with zero schedule awareness.
- `filter` editor: `null`/`{}` flagged by schema lint (already verified live);
  edit-open on empty seeds `[]`.
- Gates: svelte-check 0/0 · vitest green · JH tsc clean · patch signed.
