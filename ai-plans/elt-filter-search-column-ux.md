# ELT: filter/search wire-contract unification + column-picker select-all + persistent loading strip

> Scope: items 1 (select-all), 1.1 (search silent no-op), 4 (persisted-filter
> 400 poison), 5 (served-meta ↔ wire filterable mismatch), 1.2/1.3 (progress
> bar on every reload). Item 1.4 (JetStream list latency) is EXCLUDED — explained
> separately, executed on explicit approval.

## Status: 🟠 WIP — Plan date: 2026-11-15

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | DAL: `list.meta: EntityMeta` + internal derivation of searchable/filterable sets; keys → optional narrowing; strict `search_in` ValidationError | ✅ | c90782c | `entity-service.ts`; `deriveListWireSets` exported for custom query paths |
| 2 | DAL tests: derivation + strict search_in + narrowing semantics | ✅ | c90782c | 12 tests `entity-service-meta-derivation.test.ts`; validation runs BEFORE the needle gate |
| 3 | us-v3 migrate services → `list: { meta }`, delete hand arrays | ✅ | 42a31e1 + 17d33c5 | job-handler + crm(16)+ai(2)+emailsender(2); all manual ⊆ derived verified |
| 4 | be-v3 migrate services → `list: { meta }`, delete `deriveSearchableKeys` call-sites | ✅ | 4a3c8cd | 5 services migrated; 6 headless stay legacy; `search-keys.ts` deleted; user.service custom path now uses `deriveListWireSets` |
| 5 | job.meta.ts: `schedule_type` → `filterable:true` + comment rewrite | ✅ | 42a31e1 | wire admits it (preset); UI exclusion derived from preset |
| 6 | FE: `filterableColumns` minus preset-owned fields | ✅ | c9d84e0 | `presetOwnedFields` derived from `filter_presets[].options[].where[].field` |
| 7 | FE: post-meta sanitize of persisted filter/search state + dev-gated console.warn | ✅ | c9d84e0 | `sanitizeListState` + init() between loadMeta/loadRows; drops poisoned keys before first wire call |
| 8 | FE: ColumnsPanel select-all toolbar row + count badge | ✅ | c9d84e0 | toolbar snippet; tri-state; deselect → declared defaults (decision 1.a); badge = rendered/selected |
| 9 | FE: loading strip under ELT header on `rowsLoading` | ✅ | c9d84e0 | `elt-reload-strip` h-0.5 slot between header and content |
| 10 | Tests: FE unit (sanitize/select-all), e2e locks | ✅ | c9d84e0 | `sanitize-list-state.test.ts` 5/5; e2e `elt-columns-filter-ux.spec.ts` 4/4 live |
| 11 | Gates: tsc + suites + live probe matrix + docs-check + commits | 🟠 | | dal/us/be committed; fe committed — restano make-docs + probe matrix finale + cleanup EntityServiceConfig narrowing review |

---

## Verified root causes (TIC evidence, all empirical on live stack)

- **`search=e2e` works** (3 rows via `searchableKeys`), but `search_in=[target_subject]` / `[status,kind,run_as]` → **total:5 (all rows)** — keys silently dropped at `entity-service.ts:533-556`, `ors` empty, no filter applied.
- **Filters 400** proved: `target_subject`, `job_name`, `next_run_at` → `Invalid filter field — allowed: armed_by, created_by, kind, run_as, schedule_subject, schedule_type, service_code, status, updated_by`. Served `filterable` defaults ON for every column (`column-constraints.ts:804`), wire allowlist is a hand-maintained parallel set.
- **Item 4 (panel-open 400)**: `filterValues`/`advancedFilters`/`searchInKeys`/`visibleKeys`/`sort`/`presetSelections` all persist in localStorage (`useEntityList:268,321,338-341`). One invalid criterion poisons EVERY later list call; panel fetch calls all verified healthy (`audit-actors`, ref `job_trigger/list`).
- **`schedule_type`** is `filterable:false` authored BUT in `SCHEDULE_FILTERABLE` — the `schedule_kind` preset filters on it. The flag today means "UI-only exclusion", not "wire-forbidden".
- **No persistent loading indicator**: `LoadingBar` renders only when `rows.length===0` (`TableBody.svelte:132`); `rowsLoading` is true on every `refreshRows` but invisible with populated rows.
- **`entity.columns` sheet props** flow through `useSheetPanels.svelte.ts:60` — `onVisibleKeysChange` is already injected (line 14).
- **Select-all style** (BulkActionsToolbar:122-133): `Checkbox` + `indeterminate` + label `text-xs font-medium text-muted-foreground` + divider. `SheetPanelLayout` has a `toolbar()` snippet (`shrink-0 border-b px-3 py-2`) — fixed, non-scrolling.

## Design — single source of truth = authored meta (derivation total, approved)

`EntityServiceConfig.list` gains `meta: EntityMeta`; the DAL derives all wire
sets internally — `searchableKeys`/`filterableKeys` become OPTIONAL narrowings
(the `sortableKeys` pattern extended to all three). Hand-authored arrays are
deleted across all consumers.

**A. DAL derivation (entity-service.ts)**

```ts
list: {
  meta?: EntityMeta;               // resolved meta — source of truth
  searchableKeys?: readonly string[];   // OPTIONAL narrowing (was required)
  filterableKeys?: ReadonlySet<string>; // OPTIONAL narrowing (was required)
  sortableKeys?: ReadonlySet<string>;   // unchanged (already optional)
}
```
- `searchableScope` = `searchableTextColumns(meta.columns)` ∩ pg-ILIKE-safe
  (`getEntityPersistenceMeta(cfg.entity)` — `deriveSearchableKeys` logic moves
  into the DAL) ∪ `uuid` ∪ nameJoins
- `searchableAllowed` = same set — `search_in` key outside → `ValidationError`
  (fail-closed, mirrors `filters[i][field]` and `sort_key`)
- `filterableAllowed` = `isColumnFilterable` columns ∩ (physical ∪ calculated)
  ∪ `uuid` — hidden:true columns stay admitted (hidden = not rendered, not
  wire-blocked → `service_code` preserved)
- `searchableKeys`/`filterableKeys` present → intersect the derived universe
  (deliberate narrowing only); `meta` absent (headless entities) → keys
  required (unchanged legacy path)
- `schedule_type` → `filterable:true` authored (it IS wire-filterable — preset
  needs it). UI exclusion derived from preset ownership (see C).

**C. FE: preset-owned fields excluded from filterableColumns (derived)**

`EntityListTable.svelte`: `presetOwnedFields = union(meta.table.filter_presets[].options[].where[].field)` → `filterableColumns = allColumns.filter(isColumnFilterable && !presetOwned.has(key))`. `schedule_type` disappears from the panel because the preset owns the UX slot — no second flag.

**D. Item 4 — post-meta sanitize (`useEntityList.init()`)**

After `loadMeta()`, before first `loadRows`: new pure util `sanitizeListState(columns, state)`:
- `filterValues` → keep only served-filterable keys
- `advancedFilters` → drop criteria w/ unknown field or op ∉ `getOperatorsForColumnType(type)`
- `searchInKeys` → ∩ searchableColumns keys
- (persist effect rewrites the cleaned state automatically)

**E. Item 1 — select-all in ColumnsPanel toolbar**

`useSheetPanels` `entity.columns` props += `onToggleAllColumns(checked: boolean)`:
`checked` → `onVisibleKeysChange(allKeys)`; unchecked → `onVisibleKeysChange(alwaysOnKeys)` (`hideable===false` keys). Panel `{#snippet toolbar()}`: Checkbox (checked = all toggleable visible, `indeterminate` = partial) + `select_all`/`deselect_all` label (existing i18n) + Badge `{n}/{total}` (toggleable only). Style = BulkActionsToolbar select-all.

**F. Items 1.2/1.3 — persistent strip**

`EntityListTable.svelte` between `EntityListTableHeader` (ends ~L770) and `EntityListTableContent`:
```svelte
<div class="h-0.5 shrink-0" data-testid="elt-loading-strip">
  {#if rowsLoading}<LoadingBar class="h-full" />{/if}
</div>
```
Reserved height → no layout shift; covers sort, preset/view switch, filters, pagination, refresh — every `refreshRows`.

## Impacted files

- `primebrick-us-v3/job-handler/src/lib/list-keys.ts` (new)
- `primebrick-us-v3/job-handler/src/modules/jobs/{job.meta.ts, jobs.service.ts}` + generated mdx
- `primebrick-dal-v3/src/entity/entity-service.ts` (+types, tests)
- `primebrick-fe-v3/src/lib/entity-list/{sanitize-list-state.ts (new), sheets/panels/ColumnsPanel.svelte}`
- `primebrick-fe-v3/src/lib/composables/useEntityList.svelte.ts`
- `primebrick-fe-v3/src/lib/components/entity-list-table/{EntityListTable.svelte, composables/useSheetPanels.svelte.ts}`
- specs: job-handler `__tests__`, fe-v3 unit + `src/e2e/jobs-pages.spec.ts` locks

## Acceptance criteria

- Every served-`filterable` column accepts a criterion (no 400); `filterable:false` columns reject.
- `search_in=[target_subject]` filters (total < all); `search_in=version` → 400.
- FiltersPanel does not list `schedule_type`; preset still filters.
- Poisoned localStorage state is cleaned at bootstrap (list succeeds).
- ColumnsPanel select-all checks/indeterminate/counts correctly; deselect keeps `hideable:false`.
- Loading strip visible during any populated-table reload.
- dal-v3 suite, job-handler suite + docs-check, fe-v3 svelte-check + affected e2e green.
