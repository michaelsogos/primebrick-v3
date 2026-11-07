# Plan: Action chrome contract + bulk scope choicebox dialogs

> Workstream from sessions 2026-11-05/06: semantic `ActionColor` contract
> (exec-stop/exec-start icons, icon↔label anti-drift), menu ordering, and
> the bulk delete/restore Choicebox scope + meta-driven confirm copy
> ("Disattiva" instead of hardcoded "Elimina").

## Status: � DONE (pending only docs proposal) — Plan date: 2026-11-06 12:15 UTC / 13:15 CET

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | `text_color`→`color` closed `ActionColor` enum (core+SDK+meta+FE consumers+openapi) | ✅ done | 2026-11-05 | core 112/112, JH 102/102, tsc clean. `ActionColor = neutral\|primary\|info\|success\|warning\|destructive` |
| 2 | Semantic icons `ExecStop`/`ExecStart` gradient-filled + `SEMANTIC_ICONS` registry + `DynamicIcon` lookup | ✅ done | 2026-11-05 | `color-mix(currentColor)` — zero baked hex, drift impossible by construction |
| 3 | Icon↔label anti-drift: removed `[&_svg]:text-muted-foreground` from dropdown-menu-item + sub-trigger, removed all `opacity-70` on menu icons | ✅ done | 2026-11-05 | E2E certifies computedStyle equality icon=label per menuitem |
| 4 | `update.single` default `color:"primary"` + menu order (Modifica→Duplica→custom→Delete/Restore→divisore→Registro/Anteprima) TableRow+CardActions | ✅ done | 2026-11-05 | E2E proven |
| 5 | `EntityOpCta`/`EntityAction`/`ActionsOverrides`/`EntityCustomOp`/`EntityActionMeta` + `confirm_key`/`busy_key` contract — core types + SDK merge in `deriveActions`/`withSynthesizedCtas` | ✅ done | 2026-11-06 | SDK 501/501 |
| 6 | `job.meta.ts` — 4 ops declare label/icon/color/**confirm_key**/**busy_key** (disable/enable keys) | ✅ done | 2026-11-06 | lines 170-173; JH test asserts keys present |
| 7 | `ActionChrome` type + `opChrome()` extended with `confirm_key`/`busy_key`; `bulkDeleteChrome`/`bulkRestoreChrome` wired to `EntityListTableDialogs` | ✅ done | 2026-11-06 | EntityListTable.svelte:468-472,796-810 |
| 8 | `useBulkActions` — `deleteScope`/`restoreScope` state + setters + `enumerateMatchingItems()` (`/list` wire, same filters, `deleted_records` EXCLUDED/ONLY) + scope branch in confirm impls | ✅ done | 2026-11-06 | all getters wired from EntityListTable:405-414 |
| 9 | `BulkDeleteDialog`/`BulkRestoreDialog` — Choicebox scope + chrome-driven title/message/button/severity | ✅ done | 2026-11-06 | scope props OPTIONAL (standalone call sites keep plain dialog — configurations page) |
| 10 | `DeleteDialog` (UI pkg) + `RestoreDialog` (FE) + `EntityConfirmQuestion` — `chrome` prop, `confirm_key` replaces whole question incl. "cannot be undone" tail | ✅ done | 2026-11-06 | |
| 11 | Scope reset on dialog open — `handleBulkDelete`/`handleBulkRestore` reset to 'selected'/'all' by selection (export precedent) | ✅ done | 2026-11-06 | restore reset applied after interrupt |
| 12 | BE patch `20261119000000_bulk_scope_choicebox_keys.sql` signed + applied | ✅ done | 2026-11-06 | signed dev-micha-2; 28 rows live in public.translations |
| 13 | JH patch `20261119000000_job_trigger_confirm_busy_keys.sql` signed + applied | ✅ done | 2026-11-06 | signed dev-micha-2; 42 rows live in job.translations |
| 14 | Rebuild chain: core → sdk → ui → FE vendor bundle | ✅ done | 2026-11-06 | all exit 0 |
| 15 | svelte-check (3 errors fixed) + JH/BE tsc | ✅ done | 2026-11-06 | 0/0; fixed: MetaColumn import path, searchInKeys nullable, optional scope props |
| 16 | SDK: resolved-pair divergence enforced at CONSTRUCTION (eager `deriveActions` in `makeEntityRouter`) | ✅ done | 2026-11-06 | was lazy (first /meta) — now boot-fails |
| 17 | Bulk CTA `selectedKeys<2`→`<1` — scope=all is a legit entry with 1 row selected | ✅ done | 2026-11-06 | E2E-proven |
| 18 | **E2E** `job-triggers-deletion-filter.spec.ts` — new test: meta copy (Disattiva not Elimina), no "cannot be undone", Choicebox 2 radios + counts, all-scope enumerate(EXCLUDED)→{items[uuid,version]}×total | ✅ done | 2026-11-06 | **3/3 + 12/12 jobs-pages green** |
| 19 | SDK tests: override confirm/busy→meta.actions, cta confirm/busy→crud_action merge, resolved-pair divergence throws at construction | ✅ done | 2026-11-06 | service-routes-cta.test.ts 8/8; JH 103/103 |
| 20 | Docs: entity-meta-schema dev-guide — `confirm_key`/`busy_key` + scope-choicebox convention | ⏳ not done | — | RULE: propose text, write after user approval — text drafted below |
| 21 | Pre-existing flags: BE openapi.ts schema-honest-format 9 violations + `job.config_entries.id` text/int8 drift — STILL OPEN, flag to user | ⏳ not done | — | unrelated, carried over |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Contract summary (what's on the wire)

`meta.actions[op]` entries now carry the full chrome:

```ts
// job.meta.ts actions_overrides — THE reference implementation
"delete.single":  { label_key: "...actions.disable",  icon: "exec-stop",  color: "destructive",
                    confirm_key: "...actions.disable_confirm",          busy_key: "...actions.disabling" }
"delete.bulk":    { ..., confirm_key: "...disable_entities_confirm" /* {count}{entity} tpl */ }
"restore.single": { label_key: "...actions.enable",   icon: "exec-start", color: "success", ... }
"restore.bulk":   { ..., confirm_key: "...enable_entities_confirm" }
```

- **`confirm_key`** — single templates use `{entity}{name}` markers
  (EntityConfirmQuestion splits on sentinels → bold entity + quoted name);
  bulk templates use `{count} {entity}`. Absent → `app.common.{delete,restore}Entity[ies]Confirm`.
  When present it REPLACES the whole question — including the delete-only
  "cannot be undone" tail.
- **`busy_key`** — in-flight confirm-button label. Absent → `app.common.{deleting,restoring}`.
- **`color`** — drives `BorderedDialog` severity AND `actionColorButtonVariant()`.
- **Dialog title** = `$t(label_key)` + entity name — one construction for every override.

## Bulk scope mechanics

- Choicebox mirrors `ExportDialog`; renders only when `selectedCount>0` AND
  caller passes a scope setter (standalone call sites keep the plain dialog).
- `scope='selected'` → `{items:[{uuid,version}]}` from selected rows.
- `scope='all'` → `enumerateMatchingItems(EXCLUDED|ONLY)` pages `/list` (200/page)
  with the SAME search/search_in/filterValues/advancedFilters wire the table uses.
- Dispatch rides `findActionEndpoint('delete.bulk')` else `/bulk-delete` convention;
  MFA step-up, notifications, selection clear, refresh unchanged.
- Scope resets on each open; bulk CTA enables at ≥1 selection (was ≥2).

## Verification ledger

| Suite | Result |
|---|---|
| core | 112/112 |
| SDK | 501/501 (+3 CTA wire tests) |
| JH | 103/103 (+1 declarations test) |
| UI | 49/49 + check-standards clean |
| FE svelte-check | 0 errors, 0 warnings |
| E2E deletion-filter | 3/3 |
| E2E jobs-pages | 12/12 |

## Key files

- SDK: `src/http/entity-router.ts` (EntityActionMeta:128-131, merge:404-417, eager check ~695), `src/http/service-routes.ts` (EntityOpCta:158-159,249), test `src/http/__tests__/service-routes-cta.test.ts`
- Core: `src/entity-meta.ts` (76-92, 557)
- FE: `useBulkActions.svelte.ts`, `EntityListTableDialogs.svelte`, `dialogs/Bulk{Delete,Restore}Dialog.svelte`, `dialogs/RestoreDialog.svelte`, `EntityListTable.svelte`, `BulkActionsToolbar.svelte`, `src/e2e/job-triggers-deletion-filter.spec.ts`
- UI: `entity-list/DeleteDialog.svelte`, `EntityConfirmQuestion.svelte`, `icons/semantic-icons.ts`, `dialog-bordered.svelte`
- Meta: `job-handler/src/modules/jobs/job.meta.ts:170-173`
- Patches (signed+applied): `be-v3/db-meta/patches/20261119000000_bulk_scope_choicebox_keys.sql`, `job-handler/db-meta/patches/20261119000000_job_trigger_confirm_busy_keys.sql`

## #20 — Docs proposal (write only after approval)

`entity-meta-schema` dev-guide additions:

- `actions_overrides[op]` accepts `confirm_key` / `busy_key`:
  - `confirm_key` — dialog message template. Single: `{entity}{name}`
    markers (styled entity + record name). Bulk: `{count} {entity}`.
    Replaces the convention question entirely, including the delete
    "cannot be undone" tail — a disable-style op MUST provide its own
    message or users see "elimina" copy on a non-delete action.
  - `busy_key` — confirm-button label while the call is in flight.
- Bulk delete/restore dialogs render a scope Choicebox when the table
  supplies a scope setter: "only the N selected" vs "all N rows matching
  the current filters" — 'all' enumerates `{uuid,version}` via `/list`
  with the identical filter wire (`deleted_records=EXCLUDED` for delete,
  `ONLY` for restore).

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
