# Payload-map value validation — zod as the single declaration source

## Status: DECISIONS LOCKED (2026-11-02) — Plan date: 2026-11-01

> **Reworked after the closed-vocabulary challenge.** The original Part D
> asked "which JSON-Schema keywords may `payload_schema` declare" — wrong
> question. The platform precedent was live all along:
> `type-config-schema.ts:82` does `z.toJSONSchema(typeConfigSchema)` —
> **zod IS the declaration, JSON Schema is the extracted transport.**
> Empirically verified on zod 4.6.7 (pinned in fe/jh/be/ui):
>
> | zod source | `z.toJSONSchema()` emits |
> |---|---|
> | `z.array(z.string().email()).min(1).max(50)` | `minItems/maxItems` + `items:{format:"email", pattern:"…"}` |
> | `z.string().uuid()` / `.regex(/…/)` | `format:"uuid"+pattern` / `pattern` |
> | `z.number().int().min(0)` | `type:"integer"`, `minimum`,`maximum` |
> | `z.enum([…])` / `z.literal` | `enum` / `const` |
> | `.meta({x_inject:"uuid", x_not_editable:true, description})` | **x_* annotations verbatim in the schema** |
> | `.refine()/.transform()/.superRefine()` | **silently degrades** to bare `type` — the non-portable layer |
> | object | `required:[…]` + `additionalProperties:false` |
>
> The vocabulary is therefore closed *by construction*: a consumer must
> honor exactly what `toJSONSchema` can emit (JSON Schema draft 2020-12
> emittable subset). Nothing invented; nothing silently dropped.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Inventory existing validation architecture | ✅ done | Part A |
| 2 | Empirics: zod 4.6.7 `toJSONSchema`/`meta()` emission table | ✅ done | table above |
| 3 | **zod-source pilot**: emailsender `SEND_EMAIL_REQUEST_SCHEMA` → `SendEmailSchema` zod — `z.infer` kills the manual `SendEmailRequest` mirror; `x_*` via `.meta()`; `payload_schema` = `toJSONSchema`; `route.validate` = `schema.parse` | ⏳ not done | emailsender needs zod dep added (4.6.7, pinned convention) |
| 4 | **Portable checker in core**: extend `jsonValueMatchesSchema` semantics into a canonical `payloadSchemaCheck(schema) → errors[]` honoring the emittable subset (type/properties/required/items/enum/const/format-map/pattern/min*/max*/additionalProperties) — pure, dep-free, shared FE+US | ⏳ not done | the "one way to read" — same posture as `isColumn*` predicates |
| 5 | **Design-time** (widget) — **DECIDED: mark**: `const` leaf/chip values checked via shared checker → standard invalid state on the row input (destructive ring + hint below — the normed control pattern, only wiring); the field error also lands on the superform `payload_map` path → `updateForm.valid === false` blocks submit (tainted-but-invalid cannot submit — existing mechanism, no workaround) | ⏳ open | Q3 resolved |
| 6 | **Submit-time** (form) — **DECIDED: block**: `payload_map_conformance` cross-field validator (closed registry, same precedent as `job_trigger_shape`) + `buildEntityFormSchema(meta, decl, env)` env-injected `resolveCallable` — runs inside `validators: zod4(...)` per-pass, reads `data.target_subject` live, parses the payload_map JSON **string**, honors `'' = absent = verbatim`; required-unmapped surfaces as field error on `payload_map` AND per-row invalid state on the unmapped required row (asterisk convention already renders `*` on required labels) | ⏳ open | Q4 resolved |
| 7 | **Runtime** (owner) — **DECIDED: architectural invariant, not opt-in**: `payload_schema` accepts the **zod schema itself** on `NatsRoute`/`NatsRequestRoute`; `makeNatsRoutes` derives `z.toJSONSchema` (census) AND wires `schema.parse` as mandatory validation — a callable contract without runtime validation becomes impossible to declare. `route.validate` remains for private routes / post-contract checks. Breaking surface: `email-send.ts` + `crm/fake-event-emitter.ts` only | ⏳ open | Q5 resolved — enforced once in the factory, zero drift possible |
| 8 | **Server-side mirror** (no drift): JH entity write path gains `assertPayloadMapConformance` hook in `jobs.service.ts` `beforeCreate/beforeUpdate` — resolves the callable decl + runs the SAME core `payloadSchemaCheck`; `callable-catalog` extended from subject-set to `subject → payload_schema` (register payload + census row already carry it). BE entity path uses the same hook seam (`validateBody`+hooks pattern) | ⏳ open | verified: `schemas:{entityBody}` is envelope-only today; catalog stores subjects only |
| 9 | **i18n**: error label keys for widget marks + submit errors (`job.entities.job_trigger.fields.payload_map.errors.*` + `app.widgets.payload_map.*`) ×7 languages | ⏳ open | translation patch per convention |

<!-- Status values: ✅ done · ⏳ not done · 🚫 dropped. -->

---

## Part A — Existing architecture (verified, NOT reinvented)

**FE → entity forms**: `primebrick-fe-v3/src/lib/entity-form/build-entity-form-schema.ts`
- zod object per `page_props.form` from served `EntityMeta`: physical from
  class-derived projection (`nullable`, `max_length`, `pg_type`); semantic
  from `meta.columns` (`format`, `pattern`, `min_length`, `max_length`,
  `min`, `max`, `required`, `json_schema`).
- Cross-field via closed `CROSS_FIELD_VALIDATORS` (e.g. `job_trigger_shape`).
- `jsonValueMatchesSchema` — minimal structural JSON-Schema checker already
  used for `filter`/`payload_map` `json_schema` columns (type/items/
  required/enum — NOT the constraint keywords).

**FE → config entries**: `type-config-schema.ts` — `configValidationSchema`
is **zod-declared**: `z.infer` types, `z.toJSONSchema()` for JSON Schema —
the declaration IS the validation. **The precedent this plan adopts.**

**Callable contract**: `email-send.ts` `SEND_EMAIL_REQUEST_SCHEMA` —
hand-written JSON Schema "mirroring `SendEmailRequest` 1:1" (manual
lockstep); `x_inject`/`x_semantic`/`x_not_editable`/`x_options`/`x_map_keys`
annotations validated fail-closed at enrollment by
`callables-declaration.ts` `validateSchemaAnnotations`. `NatsRoute.validate`
runtime hook exists (`nats-routes.ts:86`) — emailsender doesn't use it.

**Pattern learned**: *the system never validates ad hoc — a declaration
surface is projected into zod, one vocabulary, closed registries.*

## Part B — The single-source architecture

```
          OWNING SERVICE (e.g. emailsender)
┌──────────────────────────────────────────────────┐
│  SendEmailSchema = z.object({                    │
│    to: z.array(z.string().email()).min(1),       │
│    requestId: z.string().uuid()                  │
│      .meta({x_inject:"uuid", x_not_editable}),   │
│    …                                             │
│  })                                              │
│                                                  │
│  z.infer              → SendEmailRequest type    │
│  z.toJSONSchema       → payload_schema (census)  │
│  .meta({x_*})         → annotations ride inside  │
│  schema.parse         → route.validate (runtime) │
└────────┬──────────────────────┬──────────────────┘
         │ JSON Schema          │ zod (full power)
         ▼                      ▼
   CENSUS / FE / DOCS      SERVICE RUNTIME
   portable subset only    portable + non-portable
   (form rows, submit      (refine/transform/etc.
    checks, doc tables)     all run in the owner)
```

**Answers to "are we limiting ourselves?"** — the ceiling is JSON Schema
transport, not vocabulary: anything non-portable still runs at runtime
via `schema.parse` in the owner. One declaration, two layers, zero loss.

## Part C — Enforcement points (one shared checker)

1. **Declaration** (service): zod source + `.meta()` for `x_*`; enrollment
   validator `validateSchemaAnnotations` keeps working UNCHANGED — the
   `x_*` keys land in the persisted schema identically (verified:
   `.meta()` emits them verbatim).
2. **Portable checker** (`@primebrick/core`): one pure
   `payloadSchemaCheck(schema)` honoring the emittable subset —
   consumed by the widget (design-time), the form (submit-time), and
   available to services that don't wire zod. Core stays dep-free →
   a checker, not a zod projection.
3. **Runtime** (owner): `route.validate = (raw) => SendEmailSchema.parse(raw)`
   — full zod, explicit, per-route opt-in today via `NatsRoute.validate`.
4. **Enrollment**: unchanged x_* validation + the emitted-schema contract
   documented ("consumers honor the `toJSONSchema`-emittable subset").

## Part D — Runtime-form contract (verified adaptations — do NOT break)

The entity form is **runtime-generated** on zod + sveltekit-superforms
(`EntityFormPage.svelte`). Its conventions constrain how validation can
attach — verified empirically:

- **Schema built once** from `meta` + `page_props.form` (`buildEntityFormSchema`
  in `$derived.by`) → the zod object is STATIC; anything that depends on
  user-chosen values (the selected callable's `payload_schema`) cannot be
  baked into a column schema.
- `superForm(..., { SPA: true, validators: zod4(schema), dataType: 'json' })`
  → superRefines run **per validation pass** receiving the FULL `data`
  object — which already contains sibling fields (`target_subject`).
- `payload_map` binds a JSON **string** (`extJsonStringify` on load,
  `JSON.parse` at submit, `'' → undefined` for absent) — a validator
  must parse safely, never assume an object.
- `''`/absent map = verbatim passthrough — meaningful state, not "empty".
- Declared automation (`x_inject`/`x_semantic`) is **already seeded into
  the map** by the pair-keyed `seededFor` effect before validation runs —
  "required field mapped" must count machine-seeded entries as mapped.
- `reset({newState})`/tainted dance exists — validators must be pure and
  side-effect-free (no writes into `$form`).

**The seam**: cross-field rules already exist (`CROSS_FIELD_VALIDATORS`,
e.g. `job_trigger_shape`); they receive `(data, ctx)` — `data` includes
`target_subject`. What they lack is census access → extend
`buildEntityFormSchema(meta, decl, env?)` with an injected
`resolveCallable(subject)` (EntityFormPage passes a lookup over
`callableDecls`). The `payload_map_conformance` validator stays a closed
registry entry, resolves the schema per pass, and runs the shared core
checker — static schema, dynamic data, zero new error channels.

## Part E — Decisions LOCKED (2026-11-02, user)

- **Q3 → mark**: invalid `const` marks the row input (standard invalid
  state + hint) AND the error lands on the superform `payload_map` path —
  tainted-but-invalid cannot submit (`updateForm.valid` gate already
  exists; no workaround). Design-time is the early signal, submit is the
  authoritative gate.
- **Q4 → block**: required-unmapped blocks submit. The unmapped required
  ROW gets the normed invalid state (destructive ring + hint under the
  input — same convention as every other field; the `*` asterisk on
  required labels already renders). Field-level error on `payload_map`.
  Only applies when `target_subject` resolves to a census callable.
- **Q5 → architectural invariant**: no lint — `payload_schema` on a route
  accepts the **zod schema**; the route factory derives the census JSON
  Schema AND the mandatory runtime `validate` in one place
  (`makeNatsRoutes`/`makeNatsRequestRoute`). Declaring a callable contract
  without runtime validation is impossible by construction — "once only,
  never drift". Only 2 files declare `payload_schema` today
  (`emailsender/email-send.ts`, `crm/fake-event-emitter.ts`) — trivial
  migration.
- **Server-side mirror**: the entity write path validates the stored
  `payload_map` against the same core checker + census schema (JH hook +
  catalog carrying `subject → payload_schema`) — FE and BE/US never drift
  because both consume the SAME checker and the SAME schema.
- **Format map**: the core checker honors `format` values emitted by zod
  (`email`, `uuid`, `date-time`, `uri`…) via a shared format→check map —
  NOT a second `MetaColumnFormat` registry.

## Part F — Shared validation engine placement (empirical re-verification 2026-11-02)

### What exists today (verified in code)

- `config_entry` **already has meta-driven server-side validation**:
  `validateConfigValue(type, type_config, value)` in `sdk/src/config/config-validator.ts`,
  invoked at service layer (`config-entries.service.ts:857`) — type-derived
  checks (email regex, url, phone, bigint, min/max length-vs-value, unsigned,
  regex rules) driven by `TYPE_CAPABILITIES` (`sdk/src/config/type-capabilities.ts`).
  `EMAIL_REGEX` is explicitly shared with the FE "Zod refine" (in-file comment).
  This is the "same rules both sides" precedent — scoped to the config type model.
- Generic entity writes are **not** meta-validated server-side: BE
  `makeEntityRouter` mounts `validateBody` only when `config.schemas.createBody`
  is supplied (hand-written per-router DTOs — drift-prone by construction);
  US `entities-route.ts` passes `entityBody` = bare cast (envelope only).
- Documented lib layering (core AGENTS.md + dev-guide/overview.mdx):
  `core` = root, env-neutral contracts — **two runtime deps only**
  (`@primebrick/decimal`, `json-bigint`), "no other dependencies allowed";
  re-exported through `@primebrick/ui` (FE, US remote bundles) and
  `@primebrick/sdk` (BE/US). `sdk` is **deliberately zod-free**: route
  `schemas` are plain `(raw) => T` validators; services inject `schema.parse`
  bound to their own zod. `ui` already deps `zod 4.6.7`.

### Consequence — engine anatomy (no zod in core, no FE reach into sdk)

- **core** hosts the single rule source as pure, dep-free functions:
  `entityFieldConstraints(meta)` → declarative IR per field
  (type/required/format/pattern/bounds/enum/json_schema) and
  `checkEntityFields(meta, entity)` → `FieldIssue[]` (path, code,
  error_label_key). Plus context-free cross-field impls
  (`jobTriggerShapeIssues(entity)`), shared by both registries.
- **ui** binds the IR to zod for superform (`fieldSpecToZod`,
  `buildEntityFormSchema` refactored to consume it) — ui already owns
  zod 4.6.7 and is the FE's primebrick façade; remote bundles can reuse it.
- **sdk** adds `entityFieldValidator(meta)` returning the documented
  `(raw) => entity` plain validator (zod-free) — becomes the DEFAULT
  `schemas.createBody`/`updateBody` in the sdk entity-router when a service
  passes no explicit schema (enforcement by default, DTOs still override).
- **BE** keeps `validateBody`/`entityWriteBody` for hand DTOs; for
  meta-driven default, `makeEntityRouter` gets the same core checker via a
  thin `z.unknown().superRefine` adapter in `src/http/validation.ts`.
- Owner validates: BE for BE entities, US when BE proxies — each side runs
  the same core predicates; FE runs the same predicates inside zod.
- Shared fixture matrix in core tests → consumed by FE/BE/US unit tests;
  e2e: raw-API invalid write → 400, matching UI rejection.

### Clarifications (user-requested)

- "Two projections": the wire schema and the form schema are NOT identical
  by design — in the form, JSON columns are bound as STRINGS (superform
  `dataType:'json'` + `JSON.parse` at submit) and `''` means "absent";
  on the wire the entity arrives already parsed. One rule source
  (core predicates on the PARSED value); the form wrapper adds only
  string-binding adaptations on top — rule drift impossible.
- "Context validators, shared but injected": the CHECK function is core-
  pure and shared; the DATA it needs is supplied per side. Example —
  `payload_map_conformance(map, callable_schema)` is one pure function in
  core; FE injects `resolveCallable` reading its live census store, JH
  injects one reading callable-catalog (extended to carry payload_schema).
  Same check code, different data source — no duplicated logic.
