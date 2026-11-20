# Feature: Bulk Editor — ELT first, then DICT

## Status

| Task | Status | Commit |
|---|---|---|
| TIC census — bulk update usage today | ✅ done | n/a (analysis) |
| Design fork decision (apply-to-all vs per-row) | ⏳ **user gate** | — |
| Wire contract decision (standard route vs client loop) | ⏳ **user gate** | — |
| BE route + op vocabulary | ⏳ | — |
| FE editor page + CTA slot | ⏳ | — |
| E2E spec | ⏳ | — |

---

## 1. Empirical census — "how is bulk update used today" (TIC, done)

**The premise is wrong: the facade does NOT generate a bulk-edit route.**

Canonical vocabulary `STANDARD_OPS` (`primebrick-v3-core/src/entity-meta.ts:185-198`):
`meta, get, create.single, update.single, delete.single, purge.single,
restore.single, read.audit, export, delete.bulk, restore.bulk, duplicate.bulk`
— **no `update.bulk` exists.**

Auto-generated routes (`primebrick-v3-sdk/src/http/entity-router.ts:563-745`):
`meta, list, export, create, duplicate (/duplicate), bulkDelete
(POST /bulk-delete), bulkRestore (POST /bulk-restore), get, update (PUT
single), purge, delete, restore, audit` — **no `/bulk-update`.**

Wire-level bulk update — exactly ONE hand-rolled case:
- `PUT /api/v1/entities/config_entry/bulk-update`
  (`primebrick-be-v3/src/controllers/http/auth/config-entries.router.ts:191,262`)
  → `ConfigEntriesService.bulkUpdateEntries`
  (`src/modules/auth/services/config-entries.service.ts:593,669`) →
  `this.svc.bulkUpdate(items)`
- FE consumer: `ConfigList.svelte:132` via `bulkUpdateConfigEntries`
  (`src/lib/api.ts:728`).

Internal plumbing that already exists (never wired):
- `svc.bulkUpdate(items: BulkUpdateItem[])` — `entity-service.ts:311`
  (impl :1111), proxied by `DomainService.bulkUpdate`
  (`domain-service.ts:196`). TSDoc: *"Internal bulk ops — NOT wire
  actions (no route registers on them)"* — used for config batch writes
  and retention purges.
- `svc.bulkPurge` — same internal class (`entity-service.ts:312`).
- Entity events vocabulary already includes `bulk_update`
  (`dal-v3/src/entity/events.ts:43,148`); the repository emits it from
  `svc.bulkUpdate` (`repository.ts:3949`) — **job-handler consumers of
  bulk edits are already wired for free**.
- `primebrick-be-v3/src/http/entity-service.ts:123` exposes
  `bulkUpdate` in the BE service facade map.

Generic bulk surface (wired but unused):
- `meta.table.bulk_custom_actions` (core `entity-meta.ts:819-858`) —
  selection-aware CTAs dispatched to `entity_op`-declared routes with
  `{uuids}` body, confirm-gated via `runEntityOp`
  (`useBulkActions.svelte.ts:317-365`). **Zero entities declare it in
  db-meta today** (grep: 0 hits).

DICT "bulk save" is NOT a bulk endpoint: `EntityDictPage.saveAll`
(`EntityDictPage.svelte:882-937`) loops `PUT {base}/{uuid}` per tainted
row (`{entity:{...editableFields, version}}`) + `POST {base}` per
pending — progressive commit, per-row CAS.

## 2. Existing components to assemble

| Piece | Where | Role in bulk editor |
|---|---|---|
| `runEntityOp` | `src/lib/entity-list/use-entity-op.svelte.ts` | Governed dispatch: confirm dialog, `scopeChoice` selected/all Choicebox, step-up MFA, busy lock, one-gate-at-a-time |
| `BulkActionsToolbar` | `src/lib/components/entity-list-table/toolbar/BulkActionsToolbar.svelte` | CTA slot: new `bulkCapabilities.edit` + `onBulkEdit` — renders before `delete` (neutral ops first, destructive last) |
| `useBulkActions` | `.../composables/useBulkActions.svelte.ts` | `enumerateMatchingItems` (scope=all → uuid+version via `/list` pages of 200), `resolveOpUrl`, `selectedRows` |
| `EntityFormPage` | `src/lib/entity-form/EntityFormPage.svelte` | The single-record contract: `kind:'detail'` → GET prefill + PUT `{entity:{...fields,version}}`. The bulk editor reuses its layout + dispatcher, not its wire |
| `FormFieldDispatcher` / `EntityFormField` / `DictFieldCell` | `src/lib/entity-form/`, `entity-dict-page/` | Per-`MetaColumn` control render — never hand-rolled (`form-field-standard.md`) |
| `updateEditableColumns` | derived in `EntityDictPage.svelte` | Update-mode editable set: `editable_columns` minus `immutable` (create-only) minus uid — the bulk field list = same derivation |
| `FormPageLayout` | `src/lib/components/FormPageLayout.svelte` | Full-page chrome ("layout pieno e degno") |
| `findActionEndpoint` / `entity_op` | `src/lib/entity-list/action-endpoints.ts` | Route resolution from `meta.actions` — the bulk op rides the same endpoint-declaration contract as other ops |
| Sheets (`SheetPanelLayout`, `openSheet`) | `src/lib/shell/sheets/` | Alternative surface to a page if a lighter presentation is preferred (`sheets.md`) |
| Optimistic-concurrency result shape | `duplicate.bulk` handler (`useBulkActions:253-299`) | `{uuids, errors:[{uuid,error}]}` partial-failure reporting precedent |

## 3. Design fork — USER GATE (doubt protocol, not guessed)

### Option A — Apply-to-all patch (classic bulk edit)

Page à la `EntityFormPage` opened with the selection in context:
each update-editable column renders as a field with an **enable toggle**;
enabled fields produce `set: {col: value}` applied identically to every
target row. Wire (new standard route):

```
POST {entityApiBase}/bulk-update
{ items: [{uuid, version, set: {...}}, ...] }   // per-row CAS
→ { updated: n, errors: [{uuid, error}] }      // duplicate-style partial
```

Or `{uuids, set}` if the server expands — decide in TOC.

### Option B — Per-row grid (spreadsheet)

Multi-row inline editor where each row carries its own values — i.e. the
dict-page pattern generalized. Save = client loop of `update.single`
(dict precedent) or the same `/bulk-update` route with per-row sets.

**Note: option B already exists in substance** (EntityDictPage) — option A
is the missing product.

### Wire fork (orthogonal)

1. **New standard route** `POST {base}/bulk-update` + `update.bulk` in
   `STANDARD_OPS` + `meta.actions` capability gate — mirrors
   bulk-delete anatomy exactly (op gated by `meta.actions`, permission
   `<entity>.update.bulk`, endpoint overridable). `svc.bulkUpdate`
   already exists — the route is a thin wire over it. Bulk ops are
   actor-propagating: `entity-write.ts:17` already exempts bulk ops from
   the single-record write envelope rule.
2. **Client loop** of `update.single` (dict precedent) — zero BE work,
   works on every entity today; non-atomic, N requests, per-row CAS —
   acceptable for "selected" scope, wrong for scope=all.

Recommendation: A + 1 — a real product primitive, one route, reuses the
existing internal `svc.bulkUpdate` + `bulk_update` events.

## 4. Relation to the single-record form

- Same field set (`updateEditableColumns`), same dispatchers
  (`FormFieldDispatcher`/`EntityFormField`), same chrome (`FormPageLayout`).
- Different wire: single PUT `{entity}` → bulk POST `{items:[{uuid,version,set}]}`.
- The editor is a **new form kind** (e.g. `kind:'bulk'` in the page
  archetype resolver OR a dedicated component) reusing `page_props.form`
  layout where it exists.

## 5. Open questions for the gate

1. Option A (apply-to-all) or B (per-row grid)?
2. Wire 1 (standard `/bulk-update` + `update.bulk` op) or 2 (client
   loop) — recommendation 1.
3. Surface: full page (FormPageLayout) or sheet (SheetPanelLayout)?
4. Scope: "selected" only, or also "all matching filters" via
   `enumerateMatchingItems` like delete/restore?
5. Which columns are NEVER bulk-editable beyond `immutable`/`uid` —
   e.g. unique columns (`code` on dicts), refs with FK cardinality,
   `label_key` i18n pointers? Proposed default rule: bulk-editable =
   update-editable minus `immutable`, `uid`, `code`, `label_key`
   (i18n per-row), columns flagged unique in meta.
6. Does `update.bulk` default ON (like delete.bulk) or opt-in per entity?
