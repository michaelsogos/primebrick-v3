# Payload-map value validation — zod as the single declaration source

## Status: � ARCHITECTURE DECIDED (2026-11-02) — Plan date: 2026-11-01

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
| 5 | **Design-time** (widget): `const` leaf/chip values checked against the field's prop — `propConstraint` on the shared checker | ⏳ open | needs Q3 |
| 6 | **Submit-time** (form): required-destination-unmapped + non-conforming const surfaces as field error via the shared checker; needs `validators` signature extension or editor-side error channel (target schema is dynamic per `target_subject`) | ⏳ open | needs Q4 |
| 7 | **Runtime** (owner): `route.validate = schema.parse` on every callable carrying `payload_schema` — explicit 1-liner, NOT auto-derive (JSON Schema alone is lossy: refine/transform already gone) | ⏳ open | roll out per service, emailsender first |
| 8 | **Lint** "declared but unvalidated": every callable's `payload_schema` should pair a `validate` — schema-completeness lint scoped to the declaring service | ⏳ open | Q5 — feasible as check-standards rule on `payload_schema` without `validate` in same route object |

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

## Part D — Remaining decisions (reduced set)

- **Q3 — design-time posture**: invalid `const` in chip/text — refuse
  insertion (hard) or insert + red mark (soft)? *Recommend: mark — hard
  blocks paste/raw-JSON workflows; the row already has an error surface
  to grow.*
- **Q4 — submit-time posture**: required destination field unmapped —
  block submit or warn-only? *Recommend: block — an unmapped required
  field is a guaranteed runtime failure; the checker can compute it
  cheaply (schema.required − mapped ∪ inject/semantic-resolved).*
- **Q5 — lint**: `payload_schema` present but no `validate` on the same
  route → check-standards warning (scoped to declaring service).
  *Recommend: warn — some schemas are form-only contracts.*
- **Format map**: FE honors `format` values emitted by zod (`email`,
  `uuid`, `date-time`, `uri`…) via a shared format→check map inside the
  core checker — NOT a second `MetaColumnFormat` registry.
