# Payload-map value validation — declared contract → zod, no new engine

## Status: 🟠 WIP — Plan date: 2026-11-01 16:20 UTC / 17:20 CET

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Inventory existing validation architecture (entity-form zod builder, config-entry type_config builder, closed validators registry) | ✅ done | 2026-11-01 | See Part A |
| 2 | Decide which JSON-Schema keywords `payload_schema` may declare for value constraints (`format`, `pattern`, `minItems`, `maxItems`, `enum`, `const`, `minLength`, `maxLength`) — closed vocabulary | ⏳ not done | — | Awaiting user decision (Q1) |
| 3 | Decide `format` vocabulary — reuse entity-meta `format` set (`email`,`url`,`nats_subject`,`schedule_spec`,…)? Same closed registry? | ⏳ not done | — | Awaiting user decision (Q2) |
| 4 | Widget-side design-time validation: `const` values checked against `prop`/`prop.items` constraints — decide block-on-insert vs mark-with-error | ⏳ not done | — | Awaiting user decision (Q3) |
| 5 | Submit-time rule: required destination fields unmapped + non-conforming const — block submit vs warn | ⏳ not done | — | Awaiting user decision (Q4) |
| 6 | BE/US runtime validation — the callable owner validates resolved payload against `payload_schema` (emailsender already the authority; contract shared, no new validation style invented) | ⏳ not done | — | Needs Part C decision |
| 7 | Lint rule "declared but unvalidated" — decide whether feasible/needed | ⏳ not done | — | Part D analysis |

---

## Part A — Existing architecture (verified, NOT reinvented)

**FE → entity forms**: `primebrick-fe-v3/src/lib/entity-form/build-entity-form-schema.ts`
- Builds a `zod` object per `page_props.form` from served `EntityMeta`.
- Physical constraints from class-derived projection (`nullable`, `max_length`, `pg_type`).
- Semantic rules authored on `meta.columns`: `format` (`'email' | 'url' | 'nats_subject' | 'schedule_spec' | 'json' | 'number' | 'money'`), `pattern`, `min_length`, `max_length`, `min`, `max`, `required`.
- Cross-field: `validators` names a **closed registry** `CROSS_FIELD_VALIDATORS` — unknown key = declaration bug.
- Optional strings: format checks only fire when non-empty (`''` binds, not `undefined`).

**FE → config entries**: `primebrick-fe-v3/src/lib/config/type-config-schema.ts`
- `configValidationSchema` is **zod-declared**: `required`, `unsigned`, `rules.{url,email,regex}` each carrying `error_label_key`.
- zod is the single source: types via `z.infer`, JSON Schema via `z.toJSONSchema()` — the declaration IS the validation.

**Pattern learned**: *the system never validates ad hoc — a declaration surface (meta columns / type_config / payload_schema) is projected into zod, one vocabulary at a time, closed registries everywhere.*

## Part B — Where payload_map value validation must live

`payload_schema` (callable-side JSON Schema, e.g. emailsender `to.items`) is the **declaration surface** — it already exists, drives the widget rows, ships to the FE inside `targetCallable.payload_schema`. Adding value constraints means allowing the same keywords the entity-form builder already honours:

| JSON Schema keyword | Maps to zod | Today |
|---|---|---|
| `format: "email"` | `s.email()` | ❌ not declared on `to.items` |
| `pattern` | `s.regex()` | ❌ |
| `minItems`/`maxItems` | `arr.min()/arr.max()` | ❌ |
| `enum`/`const` | `z.enum()/z.literal()` | ❌ |
| `minLength`/`maxLength` | `s.min()/s.max()` | ❌ |

**SDK validator** (`callables-declaration.ts`) must accept the chosen subset — closed vocabulary, unknown `format` rejected.

## Part C — Three enforcement points (all reuse existing patterns)

1. **Design-time (widget)**: `const` leaf values + chip-composer entries checked against `prop`/`prop.items` — a small `propConstraint` helper (NOT a new validator engine — mirrors `build-entity-form-schema` field rules, or literally reuses a shared core helper `jsonSchemaToZod(prop)` in `@primebrick/core` so FE and BE share the projection).
2. **Submit-time (form)**: `payload_map` column validated inside the same zod schema the form builder already produces — required destination fields with no entry AND non-conforming `const` values surface as field errors (same Superforms path as every other field — no new UI channel).
3. **Runtime (US owner)**: the receiving callable validates the *resolved* payload against its own `payload_schema` — the service remains the authority on its contract; nothing invented, it's the same schema already published in the census.

## Part D — Open questions for the user (TIC gate)

- **Q1**: which keywords are in-vocabulary for `payload_schema` constraints? Proposal: `format`, `pattern`, `minItems`, `maxItems`, `enum`, `const`, `minLength`, `maxLength`.
- **Q2**: `format` vocabulary — reuse the entity-meta set (`email`, `url`, `nats_subject`, `schedule_spec`, `number`, `money`, `json`) verbatim, or a JSON-Schema-standard superset (`email`, `uri`, `uuid`, `date-time`, `hostname`)?
- **Q3**: invalid `const` typed in the chip composer — refuse insertion (hard) or insert + red mark (soft)?
- **Q4**: required destination field left unmapped — block submit or warn-only?
- **Q5**: "every field validated somehow" lint — feasible only as *schema-completeness* lint (e.g. `items` of email-bearing fields must declare `format`), scoped to the service that owns the callable — wanted or out of scope?
