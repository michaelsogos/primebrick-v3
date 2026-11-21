# Feature: Bulk Editor — ELT first, then DICT

## Status

| Task | Status | Commit |
|---|---|---|
| TIC census — bulk update usage today | ✅ done | n/a (analysis) |
| TIC anatomy + wire contract (user-refined) | ✅ done | n/a (analysis) |
| CORE: `update.bulk` in STANDARD_OPS | ✅ done | core `84065e5` |
| SDK: `POST /bulk-update` route + OpenAPI `bulk_update` + EntityServiceLike | ✅ done | sdk `1222ddc` |
| BE: Express route + entity-actions scan + spec op | ✅ done | be `5a3bf38` |
| BE+SDK: served `update.bulk` chrome (primary/square-pen/confirm_key) | ✅ done | be `8273426`, sdk `8a8a97c` |
| US: `bulkUpdate` permission wiring — 17 bulk-capable entities | ✅ done | us `10684a7` |
| BE: bulk-editor i18n patch (signed devin-bulk-editor, applied) | ✅ done | be `8273426` |
| FE: bulk `edit` CTA in BulkActionsToolbar + export recolor | ✅ done | fe `09c63a6` |
| FE: `entity.bulkEditor` sheet — builder + distribution + drill-down | ✅ done | fe `09c63a6` |
| DICT port: field-set apply → values[]/tainted (no new wire) | ⏳ later | — |
| E2E spec | ⏳ | — |

## Decisions (user-approved)

- **Semantics**: apply-to-all patch — pick fields, set ONE value each,
  applied to every selected row. NOT a full form — a targeted builder
  (FiltersPanel-advanced anatomy: `{field → widget}` rows).
- **Surface**: `entity.bulkEditor` sheet (SheetPanelLayout), selection
  kept in memory — no census route, no URL serialization.
- **Records**: selected rows only. No scope=all.
- **Guard**: FE disables CTA when `selectedKeys > 100`; route validates
  `items.length ≤ 100` → 400.
- **Colors**: edit CTA = `primary`; export/export_html recolor `default`→`info`
  (frees primary); duplicate violet, delete destructive, restore warning.
- **Forecast is display-only** — the payload always carries ALL selected
  uuids; diff-audit/update logic owns actual-change truth. The wire
  shape `{items, set}` makes per-row payload divergence impossible.
- **Version**: required per row on auditable entities — same CAS
  contract as bulk delete (`updateMany` → `extractExpectedVersions`).

---

## 1. Empirical census (TIC, done)

**The facade does NOT generate a bulk-edit route.**

`STANDARD_OPS` (`primebrick-v3-core/src/entity-meta.ts:185-198`): `meta,
get, create.single, update.single, delete.single, purge.single,
restore.single, read.audit, export, delete.bulk, restore.bulk,
duplicate.bulk` — **no `update.bulk`.**

Auto-generated routes (`primebrick-v3-sdk/src/http/entity-router.ts:563-745`):
`/bulk-delete`, `/bulk-restore`, `/duplicate` — **no `/bulk-update`.**

Wire bulk update — ONE hand-rolled case:
`PUT /api/v1/entities/config_entry/bulk-update`
(`config-entries.router.ts:191,262`) → `bulkUpdateEntries`
(`config-entries.service.ts:593`) → `svc.bulkUpdate`. FE consumer:
`ConfigList.svelte:132`.

Internal plumbing already present:
- `svc.bulkUpdate(items: BulkUpdateItem[])` → `repo.updateMany`
  (`entity-service.ts:311,1111`) — TSDoc: "NOT wire actions".
- `updateMany` (`repository.ts:3702-3910`): TEMP TABLE strategy,
  `extractExpectedVersions` — strict per-row CAS on auditable entities
  (:3732-3739), `updateKeys` derived from the FIRST row → uniform set
  by construction (:3741-3747), `UnknownColumnError` on stray keys
  (:3753-3757), returns `BulkResult {received, affected}`, rollback +
  diagnostic on concurrent-version rows (:3905).
- `bulk_update` entity events emitted (`repository.ts:3949`,
  `events.ts:43,148`) — job-handler consumers wired for free.
- `meta.table.bulk_custom_actions` exists (`entity-meta.ts:819-858`),
  consumed by `useBulkActions.handleBulkCustomAction` — **zero entities
  declare it** (db-meta grep: 0).

DICT `saveAll` (`EntityDictPage.svelte:882-937`): client loop of
`update.single` PUT + `create.single` POST — no bulk endpoint.

**List rows carry ALL columns**: `projectAllExceptSurrogateId`
(`entity-service.ts:828`) when no aggregates/calculated — the selected
rows in memory are a complete snapshot (version + every editable field)
for the forecast. Edge case: entities with `list.aggregates`/calculated
project a reduced shape — non-projected fields are excluded from the
builder (or fetched; decided per-entity at meta level if needed).

## 2. FE anatomy — `entity.bulkEditor` sheet

Entry: `BulkActionsToolbar` new `bulkCapabilities.edit` +
`onBulkEdit` CTA (`primary`), positioned before delete.
`selectedKeys.length > 100` → disabled.

```
HEAD:    "Modifica massiva" + entity label + chip "N righe selezionate"
CONTENT: [+ Aggiungi modifica] → builder rows (precedent: FiltersPanel
         advanced tab — field combo + dispatcher widget in the value slot)

  ┌─ [Field: update-editable MetaColumn combo] [FormFieldDispatcher widget] [🗑]
  │  Distribution strip (live, from selectedRows in memory):
  │    · "active" ×67 · "pending" ×22 · "(empty)" ×11
  │    → setting "suspended" — impatta 94 righe (6 già conformi)
  │    [chip drill-down ▸ popover: row titles holding that value]
  └─
FOOT:    summary "N righe · M campi"
         [Annulla] [Applica a N righe] (primary, runEntityOp-gated)
```

- Field options = update-mode editable set (`editable_columns` minus
  `immutable`, uid/`code`-unique, `label_key` i18n pointers) — same
  derivation the dict uses for `updateEditableColumns`.
- Value widget = `FormFieldDispatcher` on the MetaColumn — identical to
  the single-record form (ref combos, enums, booleans, i18n fields for
  free).
- Distribution = `groupBy(selectedRows, r => r[field.key])` → count per
  distinct value + chip drill-down listing row titles.
- Impacted count = rows where `row[field] !== newValue` — forecast only.
- One field → one set entry; duplicate field picks merge/blocked.

## 3. Wire contract

```
POST {entityApiBase}/bulk-update            op: update.bulk
{ items: [{uuid, version}, …],              // ALL selected, CAS per row
  set:   { <col>: <value>, … } }            // uniform — one apply-to-all
→ { received, affected } + partial errors   // updateMany BulkResult
```

- `update.bulk` added to `STANDARD_OPS` (core) + `entity-router` route
  (SDK) + permission `<entity>.update.bulk` + `meta.actions` capability
  gate — same anatomy as `delete.bulk` (op-declared, endpoint
  overridable, chrome via `meta.actions`).
- Route handler: validate items ≤100, set keys ⊆ update-editable columns
  (meta-derived allowlist — never trust the wire), expand to
  `{uuid,version,...set}` items → `svc.bulkUpdate`.
- `entity-write.ts:17` already exempts bulk ops from the single-write
  envelope rule.

## 4. DICT port (later)

Dict bulk edit needs NO wire: apply writes into `values[uid][col]`
for selected rows → rows tainted → existing `saveAll` progressive-commit
persists. Same builder UX, zero new endpoints.

## 5. Components reused

`runEntityOp` (confirm+step-up gate) · `BulkActionsToolbar` (CTA slot) ·
`useBulkActions` (`selectedRows`, `rowByKey`, `resolveOpUrl`) ·
`FiltersPanel` anatomy (field combo + dispatcher slot) ·
`FormFieldDispatcher`/`EntityFormField` · `SheetPanelLayout` ·
`findActionEndpoint` · duplicate-style partial-error reporting.

## 6. Verified contracts (round 2)

**Atomicity — all-or-nothing with per-row diagnosis.** `updateMany`
runs one transaction: temp-table → ambiguity guard (ERR10) →
stale-diagnose pre-check → UPDATE → race guard → audit insert →
COMMIT (`repository.ts:3856-3953`). Any guard failure = full ROLLBACK;
partial writes are impossible by construction — correct for a uniform
set. The diagnose pre-check raises pg_raise carrying
`{stale, rows[≤10]}` — each row `{row_ix, match:{uuid},
expected_version, actual_version, vanished, code}`:
ERR01 stale → **409**, ERR03 vanished → **404**, ERR10 incoherent →
**400/409**. `dal-error-mapper` maps them to RFC7807 with
`extra.issues` — the FE `RfcErrorDialog` **already renders
`extra.issues`** (config-bulk precedent): the user sees exactly which
rows conflicted and why → targeted refresh + retry.

**Two-sheet stack.** `openSheet(id, props, {stack: true})` — max 2
panes; stacked opens put the new panel right, left keeps state
(`sheet-manager.svelte.ts:52-58,314-321`). Distribution-chip
drill-down opens a stacked pane listing the rows holding that value
(precedent: ref-cell drill-through).

**Immutable/audit visibility** — `EntityRecordSheetBody` partition:
uid glyph at top (never a widget), normal fields middle, `audited`
columns pinned to a bottom `system.common.sections.audit` Accordion
rendered as VALUES (`TableCell`), `version` included. The bulk sheet
reuses the same partition: immutable columns visible read-only at
top, audit columns in the bottom accordion (informational across N
rows), builder zone in the middle.

## 7. Open residuals

- Aggregates/calculated entities: non-projected fields excluded from
  builder (default) vs fetched — default: exclude, revisit per-entity.
- `update.bulk` default-on (like delete.bulk) vs opt-in per entity —
  default-on, chrome overridable via `meta.actions`.

## 8. Delivered — status ledger (2026-12-26)

| Layer | Commit | State |
|---|---|---|
| core | `84065e5` `update.bulk` op · `4f67423` `columnSchemaLeaf` (replaces invented icon maps — wire-shape leaf → shared `schemaTypeIcon`; badge→tags, ref→file-key) | pushed |
| sdk | `1222ddc` route+validator+allowlist+OpenAPI · `8a8a97c` chrome | pushed |
| be | `5a3bf38` Express route · `8273426` chrome + i18n patch (signed devin-bulk-editor, applied) | pushed |
| us | `10684a7` bulkUpdate permission ×17 · `5e66652` revert code-immutable + `customers_code_alive_uidx` partial unique (applied 1/0) | pushed |
| fe | `09c63a6` CTA+panel · `056d264` iconField · `568bb3e`→`e537737` icons via `schemaTypeIcon` | pushed |
| e2e | `src/e2e/bulk-editor.spec.ts` — 3/3 headed (meta contract, CTA→sheet→confirm→rows updated, cleanup) | green |

`crm.customers.code` stays **editable** (user decision — never immutable);
uniqueness enforced by `UNIQUE (code) WHERE deleted_at IS NULL`.

## 9. NEXT — `assign` sequencer for unique columns (user directive 2026-12-26)

Problem: a uniform `set` on a unique column cannot update >1 row — `code`
is editable+unique, so bulk `code` needs **per-row generated values**.

Design direction (user): a sequence mechanism —

- **Persistent sequences** table: `{key, pattern, counter, step}` — user
  picks a registered sequence; the tx consumes N codes atomically.
- **Ad-hoc pattern**: `{pattern, start, step}` with NO persisted counter —
  codes generated at save.
- FE always computes a deterministic preview (first..last of N) for the
  forecast — SAME pure function the BE generation semantics mirror.

Open design points →
1. wire: extend bulk-update body `{items, set, assign: {code: {...}}}` —
   `assign` fields resolve per-item inside the tx; `set` stays uniform.
   `BulkUpdateItem = {uuid, version, ...fields}` already carries per-item
   fields — the DAL path needs no change.
2. generation authority: BE-only inside the tx (persistent counter MUST
   be consumed under `FOR UPDATE`; FE-sent codes would skip the counter
   and race). FE role = pure preview only.
3. pattern grammar: to define — e.g. `PREFIX-{n:WIDTH}` (`CUST-{n:5}` →
   `CUST-00042`); closed vocabulary, no free interpolation.
4. sequences table ownership/schema (`system.sequences`?), management
   surface (dict? config?), and whether `create.single` consumes it later.
5. assign order = items order as sent (selection order preserved).
6. does `code` also stay in uniform `set`? (1-row rename is legit —
   set+assign mutually exclusive per column.)

## 9bis. Sequencer — concurrency + ownership design (user directives)

- Pattern: multiple segments incl. date tokens — state of the art.
- Table = DOMAIN ENTITY (NOT `system.*` — that breaks ownership).
- Interpolation in bun: projection yields `counter/step/pattern`, the
  renderer computes `current` (counter as-allocated), `next`
  (counter+step) — preview reads WITHOUT increment.
- Allocation reads WITH increment: `UPDATE ... RETURNING` — single
  atomic statement, row lock serializes concurrent claimers; lives in
  the CONSUMING tx so rollback returns the range (no holes, no doubles —
  unlike PG `nextval` which can gap).
- Attribution without trail: `last_alloc_at/by/count` columns.
- NO CACHE — counter always read fresh in-tx; invoice-grade semantics.
- Open: table shared-kernel (entity_events precedent — every service's
  tx may allocate) + entity facade owned by one service? per-period
  counters when pattern carries date tokens? pattern grammar final.

## 9ter. Who-does-what — the two sequence kinds (user demanded mechanical clarity)

RUNTIME (ad-hoc, no persistenza): input {pattern,start,step}; start IS the
first counter — zero state. FE previews via shared core fn; BE generates
final codes in-tx (ONE authority — no FE-emitted codes on the wire).

PERSISTED (counter in DB — `seq.counters` row {sequence_id, period_key,
counter=next-to-emit, last_alloc_*}): 
  preview = SELECT → next=counter, range=counter..counter+(n-1)*step
  claim = ONE statement in the consuming tx:
    INSERT..ON CONFLICT DO UPDATE counter=counter+n*step
    RETURNING counter-n*step AS first, counter-step AS last
  → row lock serializes claimers; rollback returns the range (no holes).
  render = bun loop over the range (string concat, sub-ms even ×1000).
  assign = per-item fields into the EXISTING updateMany temp-table write.
SQL moves integers only; string interpolation is NEVER in SQL.

## 10. TIC — sequence entity anatomy (user questions, 2026-12-26)

**Entity kind**: NORMAL declared entity — full anatomy per module:
`domain/entities/sequence_entity.ts` (shaper/DAL class) +
`modules/sequences/{sequence.meta.ts,list-config.ts,dto.ts,sequences.service.ts}`
+ registration in `controllers/http/entities-route.ts` via makeServiceRoutes.
ONE `sequence` registry entity per module that needs it — each service
declares its own (`crm.sequences`, …); no global/shared one ever.

**Cross-module access**: READ = governed entity ops (`sequence.list/get`
permission → own `/list|/get|/meta` — usable by other modules' UIs via
the normal entity API). INCREMENT = impossible by construction — the
allocate statement exists only as an in-tx primitive inside the owning
service; no route/RPC endpoint for it exists. Table lives in owner schema.

**Visibility**: standard surface — module nav entry + ELT page (key,
pattern, step, next preview, last_alloc_*) + record sheet + audit +
`sequence.*` permissions + i18n. Where in nav: TBD per module.

**Sezionali (Italian-invoice partitions)**: counter PK becomes
`(sequence_id, period_key, partition_key)` — partition_key='' default.
Pattern gains `{sez}` token rendering the partition value; assign
directive carries `partition:"A"`. One def → N independent counters.
Alternative (no grammar change): one sequence row per sezionale.

**Template persistence**: `crm.sequences.pattern` stores the authored
string verbatim; interpolation stays in bun (locked).

**Counters table**: `crm.sequence_counters` — machine state, never an
entity row: {sequence_id fk→sequences, period_key, partition_key,
counter bigint (next-to-emit), last_alloc_at, last_alloc_by,
last_alloc_count}.

Open: `{sez}` token vs per-sezionale rows? nav placement? `next` preview
as calculated projection vs computed in record sheet?

## 11. TIC answers — round 2 (user directives)

1. ONE `sequences` + ONE `sequence_counters` table per module — like
   config_entry: many rows, different domains live in different MODULES
   not different tables. Row lock only (UPDATE..RETURNING on the single
   counter row); table lock never enters the design.
2. `sequences.code` — unique per module, addressable on the wire:
   `assign:{code:{sequence:"customer_code"}}` resolves by code, not uuid
   (uuid stays internal PK). Single-seq state = entity facade /get|list.
3. Nav placement: `/crm/settings/sequences` under the "Impostazioni"
   sibling module node — settings-domain data, same tree section as the
   dicts (CRM_NAV convention: dictDecl + entityPaths).
4. Sezionali = partition_key column + `{sez}` pattern token (partition
   value may be composite: "IT-GOODS"). The rendered year comes from the
   SEQUENCE's period — `at` (business/document date) travels on the
   assign directive (default now()): period_key AND date tokens both
   derive from `at`, so a Jan-issued invoice CAN allocate into the Dec
   period and render /26. Periods never "close": counter rows are
   per-period append-only, auto-created on first allocation of a period
   (INSERT..ON CONFLICT) — the old period row IS the immutable record
   of where that year ended. No deleted/closed flag needed.
5. Token spelling aligned to the user's grammar: `{seq:W}` counter
   token (was {n:W}), `{yy}`/`{yyyy}` year tokens.

## 12. TIC answers — round 3 (user directives)

1. **SequenceEntity is construction-sealed** — unlike config_entry (where
   subclassing into a new table is legal), the SEQ entity class must be
   non-inheritable: `new.target !== SequenceEntity → throw` in the
   constructor. Enforcement by construction (not lint, not docs): a
   cloned seq table would fork the counter namespace and break the
   one-registry-per-module ownership contract.
4. **Up to 3 sezionali, any position, non-consecutive** — tokens
   `{sez}` `{sez2}` `{sez3}` render directive fields sez/sez2/sez3
   positionally. partition_key = the used slots joined in slot order
   (deterministic; values validated: non-empty, no separator chars).
   `{sez3}` alone is legal — PK is slot-ordered join, gaps stay
   meaningful. PK: (sequence_id, period_key, partition_key).

## 12bis. TOC step 1 done — core engine final grammar (commit pending)

sequence.ts: `{seq:W}` + `{sez}|{sez2}|{sez3}` + date tokens + `at`
(business date, drives period AND render) + fixed 3-slot partition tuple.
43-test matrix green.

## 12ter. TOC step 2 done — dal sequence primitive (commit pending)

`SequenceEntity` (sequences def, sealed) + `SequenceCounterEntity`
(machine state, sealed, events off) in dal-pg `entities/` — concrete
shared classes, schema resolves per service domain. `Repository.
sequenceAllocate`: INSERT..ON CONFLICT DO UPDATE..RETURNING first/last —
row lock serializes claims, rollback frees ranges, partition+period
identity isolated. 11-test spec on real PG: concurrency disjoint, back-
dated periods, sealed construction, fail-closed validation. 763/763.

## 12quater. TIC CORRECTION — shared concrete classes were wrong

Empirical answer on config_entry ownership: `crm.ConfigEntryEntity` is
a LOCAL class with `@Entity("config_entries","crm")` — the schema pin
lives in the per-module entity decorator; `ConfigEntityBase` is only an
OPTIONAL abstract column shape (crm re-declares its columns). Sealed
concrete classes in dal resolved `public` under compare → wrong by
construction. REVISED MODEL:
- dal: `SequenceEntityBase` + `SequenceCounterEntityBase` = abstract,
  canonical column contract (no @Entity on them, or schema-less)
- per module: `@Entity("sequences","crm") class SequenceEntity extends
  SequenceEntityBase {}` + `@Entity("sequence_counters","crm") class
  SequenceCounterEntity extends SequenceCounterEntityBase {}` in
  domain/entities — the module contributes table+schema ONLY
- `sequenceAllocate(spec, counterEntity)` — caller passes its module's
  concrete counter class (ownership explicit at the call site)
- annotation extraction works again (local concrete class flattens
  inherited .d.ts props) → drop the redundant pgType pins; the
  *_by semantic pins added to entity-ts-to-pg stay (correct for any
  annotation-less consumer)

## 12quater-B. TIC CORRECTION v2 — boilerplate construction (not subclass-per-module)

The REAL config_entries mechanism: `primebrick-us-v3/boilerplate/` is the
module template — it carries `domain/entities/config_entry_entity.ts`
(`@Entity("config_entries","boilerplate")`, "rename the schema token on
clone"), config routes, service, registry entry and the DDL patch.
Every module is cloned with the table + management routes INCLUDED BY
CONSTRUCTION — the dev never hand-copies anything.

REVISED SEQ MODEL (mirror of config_entries):
- dal: `SequenceEntityBase` + `SequenceCounterEntityBase` = ABSTRACT
  bases holding the full canonical column contract (no hand-copying)
- boilerplate: `sequence_entity.ts`/`sequence_counter_entity.ts` =
  `@Entity("sequences","<module>")` thin classes extending the bases —
  schema token renamed at clone, IDENTICAL mechanism to config_entries
- boilerplate gains the full module anatomy (service/meta/list-config/
  dto), registry entries, route decl, nav, DDL patch — every cloned
  module owns sequences + counters + management surface by construction
- crm (existing module) receives the same boilerplate files once — as
  config_entries already exists there
- `sequenceAllocate(spec, counterEntity)` takes the caller module's
  concrete counter class — ownership explicit at the call site
- seal semantics: bases stay abstract (uninstantiable alone); shape
  integrity comes from the boilerplate-stable thin classes, not from a
  constructor guard

## 12quater-C. TIC FINAL — framework mounting (NOT boilerplate, NOT subclass)

Requirement locked: seq is mounted ONLY by construction at boot by
facades+createMicroservice — never a module-declared entity, never a
subclass. Boilerplate/convention is eludible → rejected. The schema
comes from the module's own domain (DATABASE_SCHEMA → schemas[0] →
domain.primary at runtime; `--schema` flag or domain config for CLI).

THE CONSTRUCTION:
- dal: SequenceEntity/SequenceCounterEntity — shared CONCRETE sealed
  classes, no schema pin → resolve domain.primary (module schema) at
  runtime; already correct
- sdk builtin: SequencesService (DomainService over SequenceEntity) +
  meta (entities_ns = module code) + dto — lives in sdk, never in a
  module
- makeServiceRoutes auto-mounts a builtin `sequence` decl on every
  service (like the auto health route); consumer decl with
  entityName "sequence" → BOOT ERROR (existing collision pattern)
- permissions derived as `<module>.sequence.<op>.<scope>` strings —
  decl type is readonly string[], no static enum needed
- primebrick-db compare/check learn the builtin entity set internally
  (not via per-module registry convention) + `--schema` flag (symmetric
  with `apply --schema`) configuring the domain before snapshotting
- i18n/permission seed rows remain per-module patches (crm.* keys)

## 12quinquies. TOC step — framework mounting foundation (in progress)

`BUILTIN_ENTITIES` in dal — the canonical platform-owned entity set
(sequence registry + counters), consumed by primebrick-db compare/check
and later by the sdk facade mount. CLI: `--schema` / DATABASE_SCHEMA
configures the schema domain so un-pinned builtins resolve the module
schema (crm.* emitted, not public.*); a builtin in a module registry →
hard error. Composite-unique uuid members no longer get uuidv7()
default; sequence_id → sequence_uuid (ref naming). 763/763.
