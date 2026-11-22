# Sequence registry — uuid-everywhere + code→name rename (TOC)

All decisions confirmed. `code` dies as a functional key; the registry
column becomes `name` (plain text, NOT unique — user's business);
uuid is the only identity everywhere. Census proved zero legitimate
`{seq:{code}}` use cases (triggers/payload_map/seeds: none; `fire_seq`,
JetStream `seq`, pattern token `{seq:5}` are unrelated) → the form was
our mistake and is REMOVED, not aliased.

## Decision record

| # | Decision | Value |
|---|---|---|
| 1 | `{seq:{code}}` | **REMOVE from grammar** — 3 forms remain: `{seq:"<uuid>"}` \| `{seq:{uuid}}` \| `{seq:decl}`. In-flight code payloads → loud 400 |
| 2 | Provisioning idempotency | **Deterministic uuid** — `detUuid(ns\|bound_name)` via existing `sha256Hex` → uuid-format; `ON CONFLICT ("uuid")`. Bound uuid computable at decoration time, before the row exists |
| 3 | `forecast`/`analyze` params | **uuid only** — `code` param removed from wire validators + OpenAPI schemas |
| 4 | `UNIQUE(name)` | **DROPPED** — name is free-text display; ambiguity is the operator's business |
| 5 | `tz` column | **DEFERRED** — user has a different idea; column stays as-is |
| 6 | `label_key` | **DROPPED** — `name` is the single human name (plain text); `description_key` stays (`i18n_key`, hidden-toggleable, doubles as option tooltip) |

## Deterministic uuid

`detUuid(seed)` = `sha256Hex(ns + "|" + seed)` → first 32 hex chars
reformatted `8-4-4-4-12` with version/variant bits set (v5-style, not
RFC — deterministic, uuid-valid). `ns` = fixed literal
`"primebrick.sequence"`. Bound rows: `detUuid("<table>.<field>")`.
Expr rows: `detUuid("<table>.<field>|expr|<decl-hash>")` — the
`@expr_<hash>` name suffix dies as a key; it survives only as the row's
display `name` (operator legibility).

## TOC — files by repo

### core (`primebrick-v3-core`)
- `src/sequence.ts` — `SequenceDirective` union: drop `{seq:{code}}`
  member; context (sez/at) stays on `{uuid}`+`decl` forms.
- `src/field-validation.ts` — `parseSequenceDirective`: drop the code
  branch.
- `src/entity-meta.ts` — `MetaColumn.seq` shape: `code` →
  `uuid`/`name` (served binding = derived uuid + display name).
- `src/field-validation.test.ts` — seq block: 4-forms → 3-forms; code
  cases → null/reject cases.

### dal (`primebrick-dal-v3`)
- `src/entities/sequence-entity.ts` — `code`→`name` (drop `unique`),
  drop `label_key`; `description_key` stays; fix stale docblock
  (`{sequence:""}` never existed).
- `src/meta/entity-decorators.ts` — `SequenceBound` =
  `SequenceDecl & { uuid: string; name: string }`; derivation at
  decoration (`name = "<table>.<field>"`, `uuid = detUuid(name)`);
  docblocks (`code`→`name`, `{seq:{code}}` gone).
- `src/meta/column-constraints.ts` — served `seq: { uuid, name }`;
  error message :538.
- `src/repository/repository.ts` —
  - `loadSequence`/`querySequence`: `{uuid}` only (drop code arm);
  - `materializeSequenceRow(q, uuid, name, decl)`: insert derived
    uuid, `ON CONFLICT ("uuid")`, re-read by uuid;
  - `materializeExprSequence`: `detUuid(bound.name + "|expr|" + hash)`,
    row name = `<bound>@expr_<hash>` for display;
  - `loadOrMaterializeBound` → `querySequence({uuid: bound.uuid})`;
  - `sequenceSpecFor`: drop `"code" in s` branch — bound default only
    via `dir === null`;
  - `sequenceAllocate`/`sequenceSet`/`sequenceAnalyze`: `spec.seq:
    {uuid}`; analyze target derivation `s.name.split(".")` (bound rows
    still carry `<table>.<field>` as their NAME value — parse works);
  - `SequenceNotFoundError(identity)` — uuid in message.
- `src/builtin/sequence-decl.ts` —
  - `SEQUENCE_WRITE_KEYS` → `["name","pattern","step","start","tz",
    "description_key","version"]`; `vWriteEntity` `need("name")`;
  - `vForecastBody`/`vAnalyzeBody`: `uuid` required, `code` param gone;
  - `SequencesService.forecast`: `get(uuid)` only (drop find-by-code);
    response `{uuid, name, ...}`;
  - `analyze` handler: `{uuid}` only;
  - OpenAPI requestSchemas: drop `code`; responseSchema `code`→`name`;
  - column contract below.
- `src/repository` + `src/builtin` tests — seq suites updated.

### Column contract (sequence-decl `columns` array)

| order | key | label VALUE (i18n patch) | flags |
|---|---|---|---|
| 0 | `name` | Name | sticky, immutable, `display_field` |
| 1 | `step` | Increment | |
| 2 | `start` | Initial Value | |
| 3 | `value_actual` | Current | virtual |
| 4 | `value_next` | Next | virtual |
| 5 | `pattern` | Pattern | |
| 6 | `emitted_actual` | Sequenza Attuale | virtual |
| 7 | `emitted_next` | Prossima Sequenza | virtual |
| 8 | `tz` | Timezone | unchanged (deferred) |
| 9 | `description_key` | — | `format:"i18n_key"`, `default_visible:false` |
| audit | `last_alloc_at` / `last_alloc_by` | — | `audited:true` (virtual, first of audit band) |

### ui (`primebrick-v3-ui`)
- `sequence-input.svelte` — `value: row.uuid`; `label: row.name`;
  `_desc = $t(row.description_key)` fallback `row.pattern` (option
  tooltip); emit `{seq:{uuid: selUuid, ...ctx}}`; `selCode`→`selUuid`;
  forecast/analyze bodies `{uuid}`; bound meta `seq.uuid`/`seq.name`
  ("auto of <name>" placeholder); **fix `row.next`→`row.emitted_next`**
  regression (sub-label + forecast fast-path); `SequenceRow` type.

### us (`primebrick-us-v3/crm` — only brick with the table)
- `db-meta/patches/<ts>_sequence_name_uuid.sql` — `ALTER TABLE
  crm.sequences RENAME COLUMN code TO name`; `DROP CONSTRAINT` on the
  `code` unique; `DROP COLUMN label_key`. Sign manifest, apply.
- `db-meta/patches/<ts>_i18n_sequence_labels.sql` — label VALUES per
  the table above ×7 locales (same migration-sequences-i18n shape).

### be / fe
- be: check `db-meta` i18n keys referencing `label_key`/widget copy —
  update seeds if any.
- fe `src/e2e/sequences.spec.ts` — meta asserts (`name` col,
  `description_key` format, no `label_key`), badge test (desc only),
  `entity.name` reads, order/flags asserts.

### docs
- `dal-conventions.md` + `entity-meta-schema.md`: codify "uuid is the
  only sequence identity; `name` is display/provisioning-name data,
  never a reference; seq-bound fields store emitted literals only".
- `api-reference.mdx` regen via typedoc (core/dal/sdk).

## Verification
- `tsc` core→dal→us-crm→be→ui chain (rebuild dist order).
- core `field-validation.test.ts` seq block green; dal seq suites.
- crm boot (patch applied, sequences table renamed, boot clean).
- `sequences.spec.ts` e2e: registry columns/order/labels, i18n_key
  badge on description_key, bound write via customers.code (uuid chain
  asserted via forecast `{uuid}`), `SequenceInput` emits `{seq:{uuid}}`
  (network assert), `{seq:{code}}` payload → 400.

## Status — EXECUTED (2026-11-22)

All stages landed and verified end-to-end:

- **core** — `{seq:{code}}` removed from `SequenceDirective` (3 forms:
  uuid-string, `{uuid}` object, inline decl). `MetaColumn.seq` serves
  `{uuid, name}`. Tests 58/58, dist rebuilt, api-reference regenerated.
- **dal** — `SequenceEntity.code`→`name` (no `@Unique`), `label_key`
  dropped. `SequenceBound = decl & {uuid, name}`; `sequenceBoundUuid()`
  = sha256(`primebrick.sequence|<seed>`) uuid-v5-style. Repo is
  uuid-only: `materializeSequenceRow` does `INSERT … ON CONFLICT
  ("uuid")` then re-reads (operator rows stay authoritative); expr rows
  seed `…|expr|<hash16>`; `forecast`/`analyze` wire validators +
  OpenAPI are `{uuid}`-only. Columns: name/step/start/value_actual/
  value_next/pattern/emitted_actual/emitted_next/tz/description_key
  (i18n_key, default_visible:false) + last_alloc_* audited. Tests
  164/164, dist rebuilt.
- **ui** — `SequenceInput` emits `{seq:{uuid}}`; options value=uuid,
  label=`name`, tooltip=`$t(description_key)` fallback `pattern`,
  `_sub`=`emitted_next` (rename regression fixed); bound placeholder
  via `seq.name`; forecast fast-path keyed on uuid. svelte-check 0/0,
  dist rebuilt, sequence-input.mdx updated.
- **us-crm** — 3 signed patches applied live: code→name rename +
  unique-index drop + `label_key` drop; i18n label values (Increment /
  Initial Value / Current / Next / Current Sequence / Next Sequence +
  `fields.name`, `fields.label_key` deleted); **deterministic-uuid
  re-key** of the two materialized rows (uuidv7 → `sequenceBoundUuid`),
  `sequence_counters` + `sequences_audit` followed — counters
  preserved (193 / 9023). Manifest re-signed (30 patches),
  user-guide docs regenerated.
- **fe** — `sequences.spec.ts` rewritten for uuid/name semantics +
  NEW test "uuid is the sole sequence identity — `{seq:{code}}` is
  rejected" (400) vs `{seq:{uuid}}` accepted (201 + allocated
  literal). Column-toggle flow asserted for `description_key`.
  **9/9 green** against the live stack.

Open residuals (deliberate): `tz` redesign deferred to the user's own
idea; `{seq:"<uuid>"}` string form retained (same identity, compact
literal); `sequenceAllocate` public API kept (orphan primitive — no
callers, no route).

## Follow-up — stale persisted list criteria self-heal (fe `83546b0`)

The `code→name` rename exposed a live-profile hazard: persisted ELT
state (`pb:*:list:sort`, filters, `search_in`) still referencing `code`
made every `/list` call 400 — page unusable. Delivered a two-layer heal:

- `sanitizeListState` now also drops a stale persisted `sortKey`
  (bootstrap layer — stale keys never leave the browser).
- A `/list` 400 carrying the fail-closed FIELD rejection
  (`internal_code` VALIDATION + `detail` matching
  `sort_key|search_in|filter|BETWEEN`, or UNKNOWN_COLUMN) ⇒ the served
  meta itself is stale ⇒ `invalidateEntityMeta(basePath)` (data +
  in-flight), re-fetch, re-sanitize, retry ONCE (`healing` recursion
  guard — never a loop). `isStaleFieldRejection` in
  `api-list-error.ts` keeps the gate narrow: envelope rejections
  (page/page_size/deleted_records) never heal.
- `sequences.spec.ts` +3 tests (bootstrap heal, mid-session heal via
  injected 400, non-field no-retry) and `mode:"serial"` — shared DB
  state + route interception raced under parallel workers. **12/12**.

Ops note surfaced during this turn: an orphan agent-shell `tsx watch`
tree had stolen `:3001` from the dev-stack-tracked be (watcher alive,
server child dead — EADDRINUSE). Orphans reaped via
`dev-stack.ps1 reap` + be restarted tracked; stack verified 7/7.
