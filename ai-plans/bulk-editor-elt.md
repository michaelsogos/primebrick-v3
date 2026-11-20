# Feature: Bulk Editor — ELT first, then DICT

## Status

| Task | Status | Commit |
|---|---|---|
| TIC census — bulk update usage today | ✅ done | n/a (analysis) |
| TIC anatomy + wire contract (user-refined) | ✅ done | n/a (analysis) |
| FE: bulk `edit` CTA in BulkActionsToolbar + export recolor | ⏳ | — |
| FE: `entity.bulkEditor` sheet — builder + distribution + drill-down | ⏳ | — |
| BE: `update.bulk` op + `POST {base}/bulk-update` route | ⏳ | — |
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

## 6. Open residuals

- Aggregates/calculated entities: non-projected fields excluded from
  builder (default) vs fetched — default: exclude, revisit per-entity.
- `update.bulk` default-on (like delete.bulk) vs opt-in per entity —
  default-on, chrome overridable via `meta.actions`.
