# List Filter Presets — `meta.table.filter_presets` + typed `sparkline` column + jobs page merge

> Sub-plan of `table-pages-merge.md` task 15 (jobs page migration) — the jobs
> page stops being a 4-table custom surface and becomes standard list
> archetypes. The "3 tables" were filters on the same entity: they become ONE
> `job_schedule` table + a new **standard, meta-declared toolbar control**
> selecting a mutually-exclusive WHERE preset. Rules move to their own page.
> Sparkline column becomes a typed column kind (like `badge`) — reusable.
>
> Empirical basis (all read, no assumptions):
> - `fe/src/JobsPage.svelte` (remote chunk): 4 × `useRemoteEntityList` —
>   `job_schedule` with `fixedFilters` `schedule_type=recurring|once`,
>   `job_rule`, `job_run`; `onRowsLoaded → loadRunStats(ctx, rows)` POSTs
>   `/api/v1/actions/job-run-stats` `{schedule_subjects:[…]}` →
>   `{bucket_unit, stats:{subject: buckets[]}}`; cells via `cell_mount`.
> - `useEntityList.svelte.ts` (host) + `remote-list.svelte.ts` (remote):
>   identical `fixedFilters: {field,op,value}[]` mechanism — emitted as
>   `filters[i][field|op|value], connector=AND` before user filters.
> - `list-filter-params.ts` (core): canonical `filters[i]` serializer —
>   zero BE work needed, the wire format already carries everything.
> - `entity-meta.ts` (core): `TableMeta{default_view,default_sort,
>   default_page_size,page_size_options,row_custom_actions}` — closed schema.
> - `EntityListToolbar.svelte`: DeletionFilterToggle = ButtonGroup segmented,
>   icon-only + `title` tooltip — the exact visual precedent the user cites.
> - `job.meta.ts`: `job_schedule` has `schedule_type` badge col (`filterable`)
>   + `run_stats` col `type:"run_stats_sparkline"`; entities_ns:"job".
> - `ENTITY_SERVICE_MAP` (fe api.ts): entity → `/ws/<svc>` mapping, today only
>   ai entities — job entities must be added for host-rendered rules page.
> - `action-endpoints.ts`: declared per-op endpoints (task 9b) — write ops on
>   job entities already resolve through meta.actions, not entityApiBase.

## Status: 🟢DONE — Plan date: 2026-10-21 (implemented + live-verified)

| # | Task (detail level) | Status | When | Notes |
|---|---------------------|--------|------|-------|
| 1 | **Core contract**: `TableMeta.filter_presets?: FilterPreset[]` + `FilterPreset`/`FilterPresetOption`/`FilterCondition` types in `entity-meta.ts`; `MetaColumn.type` gains `"sparkline"` + `sparkline?` config block; doc comments | ✅ | 2026-10-21 | closed-schema → compile error anywhere until declared |
| 2 | **Shared helper (core)**: `resolvePresetConditions(meta, selections) → FilterCondition[]` (active option → its `where[]`; invalid/missing id → `default_option`) + `serviceApiBase(basePath)` (strips `/entities/<e>`) | ✅ | 2026-10-21 | pure fns, host+remote share via @primebrick/ui |
| 3 | **useEntityList (host)**: `_state.presetSelections` + `sparklineData`; emit `fixedFilters ++ presetConditions` at `filters[0..]`; `onPresetChange(presetId, optionId)` → `page=1` + `refreshRows(clampPage)`; selection persisted `{prefix}filterPresets` (sessionStorage, validated vs options on restore); auto sparkline fetch post-loadRows for `type==="sparkline"` cols | ✅ | 2026-10-21 | selection survives everything; reset does NOT clear it (scope, not filter) |
| 4 | **useRemoteEntityList (job fe)**: same engine mirror — presetSelections + sparklineData via ctx.api | ✅ | 2026-10-21 | temporary duplication until useEntityList extraction (task 22) — acceptable: same core helpers |
| 5 | **`FilterPresetToolbar.svelte`**: one control per preset — `button_group` → `ButtonGroup segmented` (icon + label, `title`=tooltip, aria-pressed, click-active=no-op); `combobox` → `combo-select` (items enriched w/ icon + tooltip line). No "clear" affordance — single-select enforced | ✅ | 2026-10-21 | DeletionFilterToggle is the visual precedent |
| 6 | **ELT + Toolbar wiring**: ELT props `filter_presets`, `presetSelections`, `onPresetChange`; toolbar renders presets right after DeletionFilterToggle cluster (own divider) — "in tandem with the soft-delete group" | ✅ | 2026-10-21 | prop chain ETP → ELT → EntityListToolbar |
| 7 | **EntityTablePage**: reads `meta.table.filter_presets` → passes to ELT; exposes `list.presetSelections`/`onPresetChange` | ✅ | 2026-10-21 | zero change for entities without presets |
| 8 | **Sparkline cell**: `SparklineBars` presentational comp → `@primebrick/ui` (from `RunStatsSparkline.svelte`, generic on `series`); `TableCell` builtin branch `type==="sparkline"` reads `sparklineData[col.key]?.[row[row_key]]`; `CellArgs`/ELT prop threading; jobs `cell_mount`/RemoteCellShell/`run-stats.svelte.ts` deleted | ✅ | 2026-10-21 | works host+remote free (remote mounts host ELT) |
| 9 | **job.meta.ts**: `jobScheduleMeta.table.filter_presets` = schedule_type scope (options recurring/once/all); `schedule_type` col `filterable` → dropped (preset owns the field — prevents contradictory AND); `run_stats` col → `type:"sparkline"` + `sparkline:` config | ✅ | 2026-10-21 | i18n keys `job.entities.job_schedule.presets.*` |
| 10 | **job translations 0007**: preset label/tooltip keys + `job.rules.nav` + rules page title — all 7 UI langs incl. en-US/en-GB parity | ✅ | 2026-10-21 | signed patch via job-handler db-meta + `primebrick-db sign` |
| 11 | **job-handler nav/routes**: nav gains `{id:"rules", label_key:"job.rules.nav", href:"/system/jobs/rules"}`; routes gains `{route:"/system/jobs/rules", kind:"list", entity:"job_rule"}` | ✅ | 2026-10-21 | route_prefixes unchanged (`/system/jobs` covers it) |
| 12 | **FE rules page**: `src/routes/(app)/system/jobs/rules/+page.svelte` → `EntityTablePage basePath="/ws/job/api/v1/entities/job_rule"` `deletionFilter={false}` + breadcrumb; `ENTITY_SERVICE_MAP` += job_rule/job_schedule/job_run → 'job' | ✅ | 2026-10-21 | same pattern as /system/customers static route |
| 13 | **Remote JobsPage rework**: drop `once` list + `rules` list; ONE schedules list (no fixedFilters — preset does it); keep runs list + schedule dialog/CTA + breadcrumb; delete remote-list sparkline wiring (engine does it via meta) | ✅ | 2026-10-21 | chunk rebuild (`pnpm fe:build` in job-handler) |
| 14 | **Unit tests**: core `resolvePresetConditions` (default/invalid/empty-where/multi-preset); useEntityList preset serialization + persistence + reset-preserves-selection | ✅ | 2026-10-21 | vitest, both suites where applicable |
| 15 | **E2E**: module-ownership spec (or new) — preset button group visible w/ default active; switch `all` → both types listed + `filters[0][field]=schedule_type` absent; switch `once` → only once; selection persists after refresh; `/system/jobs/rules` renders standard table; sparkline column renders | ✅ | 2026-10-21 | live vs job service |
| 16 | Plan/docs: status updates; `entity-meta-schema.md` rule + dev-guide rows for `filter_presets`/`sparkline` (same session as impl, NOT deferred) | ✅ | 2026-10-21 | extraction rerun for components.json |

---

## Part A — The contract (`@primebrick/core/src/entity-meta.ts`)

### A.1 `TableMeta` extension

```ts
/** One WHERE condition of a preset — serialized verbatim as a
 *  `filters[i]` entry (same vocabulary as the /list qs). */
export type FilterCondition = {
  field: string;
  op: string;                 // wire ops: '=', '!=', 'IN', 'ILIKE', 'BETWEEN', …
  value: string | number | boolean | (string | number | boolean)[];
};

/** A single selectable option of a filter preset. */
export type FilterPresetOption = {
  /** Stable option id — persisted selection key, never an i18n value. */
  id: string;
  /** i18n key for the option label. */
  label_key: string;
  /** Lucide icon name — button_group: shown with the label;
   *  combobox: enriches the dropdown item. */
  icon?: string;
  /** i18n key for the tooltip — button_group: `title`;
   *  combobox: secondary line of the item. */
  tooltip_key?: string;
  /** AND-ed conditions appended to EVERY /list call while selected.
   *  Omit or `[]` = "all" escape option — a valid selection, no filter. */
  where?: FilterCondition[];
};

/** A mutually-exclusive preset filter group rendered in the table toolbar.
 *  Exactly one option is always active — there is no "clear" affordance. */
export type FilterPreset = {
  /** Preset id — unique within the entity; keys toolbar group + persisted
   *  selection (`{storageKeyPrefix}filterPresets[presetId]`). */
  id: string;
  /** Render mode. */
  display: "button_group" | "combobox";
  /** i18n key labeling the whole group (a11y + combobox placeholder). */
  label_key?: string;
  /** ≥2 options. */
  options: FilterPresetOption[];
  /** Option id selected before any user choice and as invalid-selection
   *  fallback — REQUIRED, must exist in `options`. */
  default_option: string;
};
```

`TableMeta` gains:

```ts
  /** Mutually-exclusive preset WHERE filters — each rendered as its own
   *  toolbar control (tandem with the deletion-filter group); the active
   *  option's conditions AND into every list request. */
  filter_presets?: FilterPreset[];
```

Semantics locked by the user's spec:
- **One option always selected** — init = persisted ?? `default_option`;
  restore validates the id against `options` (unknown → `default_option`).
- **Cannot be unset** — no deselect UI; clicking the active button is a no-op.
- **"all" escape** — an option with `where: []`/omitted applies no condition;
  it is still a real selection (preset stays single-select).
- **Always applied** — conditions occupy `filters[0..k-1]` alongside
  `fixedFilters` on EVERY call: refresh, pagination, page_size, sort,
  search, quick filters, advanced filters, deleted_records — all combine.
- **Not a user filter** — `onResetFilters`/filter chips never touch it.

### A.2 Jobs concrete decl (`jobScheduleMeta.table.filter_presets`)

```ts
filter_presets: [{
  id: "schedule_kind",
  display: "button_group",
  label_key: "job.entities.job_schedule.presets.schedule_kind.label",
  default_option: "recurring",
  options: [
    { id: "recurring", label_key: "…presets.schedule_kind.recurring",
      icon: "repeat", tooltip_key: "…presets.schedule_kind.recurring_tip",
      where: [{ field: "schedule_type", op: "=", value: "recurring" }] },
    { id: "once", label_key: "…presets.schedule_kind.once",
      icon: "timer", tooltip_key: "…presets.schedule_kind.once_tip",
      where: [{ field: "schedule_type", op: "=", value: "once" }] },
    { id: "all", label_key: "…presets.schedule_kind.all",
      icon: "layers", tooltip_key: "…presets.schedule_kind.all_tip",
      where: [] },
  ],
}]
```

(icons verified on lucide.dev at impl time — `.windsurfrules` requirement.)

### A.3 `MetaColumn` typed sparkline

```ts
/** `type: "sparkline"` — per-row stacked mini-histogram fed by ONE batch
 *  POST per page load. Virtual column: no DB field expected. */
sparkline?: {
  /** POST path RELATIVE TO THE SERVICE API BASE — e.g.
   *  `/actions/job-run-stats` → `/ws/job/api/v1/actions/job-run-stats`
   *  (or `/api/v1/…` for BE entities). */
  endpoint: string;
  /** Request body field receiving the collected row keys
   *  (e.g. `schedule_subjects`). */
  request_field: string;
  /** Row field supplying each key (e.g. `schedule_subject`). */
  row_key: string;
  /** Response field holding the `{key: buckets[]}` map — default `"stats"`. */
  response_field?: string;
  /** Bucket time field for axis labels — default `"bucket_start"`. */
  bucket_field?: string;
  /** Optional response field for the bucket unit label — default
   *  `"bucket_unit"`. */
  bucket_unit_field?: string;
  /** Stacked series bottom→top; `color` = tailwind fill-* class. */
  series: { field: string; color: string; label_key?: string }[];
};
```

`MetaColumnType` union gains `"sparkline"`.

Engine flow (generic — replaces per-page `loadRunStats`):
1. `loadRows` success → for each column `type==="sparkline"`: collect
   `row[col.sparkline.row_key]` values → POST `${serviceApiBase(basePath)}${endpoint}`
   `{[request_field]: keys}` → store response map in
   `_state.sparklineData[col.key] = {by_key, bucket_unit}`.
2. ELT receives `sparklineData` prop → `TableCell` builtin branch
   `type==="sparkline"` → `<SparklineBars buckets={…} series={col.sparkline.series} …/>`.
3. Remote pages get it FREE — the remote mounts the host ELT; its list
   engine does the same generic fetch via `ctx.api` (serviceApiBase of the
   remote basePath = `/api/v1` — ctx.api prefixes `/ws/job` itself).
4. `job_schedule.run_stats` column becomes:
   `{ key:"run_stats", type:"sparkline", order:70, label_key: F("job_schedule","run_stats"),
      sparkline: { endpoint:"/actions/job-run-stats", request_field:"schedule_subjects",
        row_key:"schedule_subject", series:[
          {field:"succeeded",color:"fill-emerald-500",label_key:…},
          {field:"failed",color:"fill-red-500",label_key:…},
          {field:"skipped",color:"fill-amber-400",label_key:…}] } }`

## Part B — Engine & UI mechanics

### B.1 useEntityList additions (mirrored in remote-list)

```ts
_state.presetSelections: Record<string,string>   // presetId → optionId
_state.sparklineData: Record<string,{by_key:Record<string,unknown[]>,bucket_unit?:string}>
```
- After `loadMeta`: for each `meta.table.filter_presets` → selection =
  persisted ?? `default_option` (validated against `options`).
- `loadRows`: `fi` emits `fixedFilters` then `resolvePresetConditions()`
  (leading AND slots, before user filters — same as today).
- `onPresetChange(id,opt)`: set → persist → `page=1` →
  `refreshRows({clampPage:true})`.
- Reset semantics: `onResetFilters` clears filterValues/advancedFilters —
  **presets untouched** (scope control, not a filter).

### B.2 Toolbar anatomy

`EntityListToolbar` after the DeletionFilterToggle block:
```svelte
{#if filter_presets?.length}
  <div class="h-6 w-px divider-primary-gradient"></div>
  {#each filter_presets as preset (preset.id)}
    <FilterPresetToolbar {preset} selected={presetSelections[preset.id]}
      onSelect={(opt) => onPresetChange(preset.id, opt)} />
  {/each}
{/if}
```
- `button_group`: `ButtonGroup segmented` — per option `Button variant="ghost"
  size="sm"` icon + `<span class="hidden lg:inline">{label}</span>`,
  `title`/`aria-pressed` as DeletionFilterToggle.
- `combobox`: `combo-select` — item shows icon + label (+ tooltip as
  description line); trigger shows active icon+label.

## Part C — Page topology after merge

```
/system/jobs           → remote chunk (stays): schedules table (ONE —
                          preset-driven) + runs table + schedule CTA/dialog
/system/jobs/rules     → NEW static host route: EntityTablePage on job_rule
                         via /ws/job (standard list, zero custom code)
job nav                → [Jobs → /system/jobs] + [Rules → /system/jobs/rules]
```

- Remote `useRemoteEntityList` instances: 4 → 2 (schedules + runs);
  `fixedFilters` dropped from both.
- `jobs_cell` shim: `run_stats_sparkline` branch dies (builtin);
  `duration_ms` humanize stays (optional follow-up: `type:"duration"` builtin
  — flagged, not in this scope).
- `ENTITY_SERVICE_MAP`: `job_rule/job_schedule/job_run → 'job'` (interim
  until census-driven api_base — root task 19; matches ai_model precedent).

## Part D — Open decisions (default = my recommendation)

| # | Question | Proposal |
|---|----------|----------|
| D1 | Preset selection persisted in sessionStorage like other prefs? | YES — consistent w/ sort/columns; `{prefix}filterPresets` |
| D2 | Reset-filters restores `default_option` or leaves selection? | LEAVES — preset is scope not filter (documented) |
| D3 | `schedule_type` stays `filterable` in the filter sheet? | NO — preset owns the field; avoids contradictory ANDs (still AND-valid if a meta keeps both) |
| D4 | Where does `filter_presets` live? | `meta.table` — table-scoped, beside `row_custom_actions` |
| D5 | `duration_ms` typed column too? | Not now — keep shim; separate tiny follow-up if wanted |
| D6 | Rules page host static route vs remote chunk? | HOST static (EntityTablePage + `/ws/job` base) — the "standard list" the feature exists to prove |
| D7 | Naming | `filter_presets` / `FilterPreset` / `where` (user's word) / `conditions` type alias `FilterCondition` |

## Acceptance criteria

1. `/system/jobs` shows ONE schedules table with a 3-option button group in
   the toolbar (default `recurring` active); runs table + schedule dialog
   unchanged visually.
2. Every `/list` request for job_schedule carries the active preset's
   `filters[0]` condition (or none when `all` selected) — verified on the
   wire for refresh/pagination/sort/user-filters combinations.
3. Selection cannot be cleared; survives refresh + session re-entry.
4. `/system/jobs/rules` renders the standard EntityTablePage on `job_rule`.
5. `type:"sparkline"` renders the same histogram as today with zero
   per-page wiring — the fetch is engine-driven from meta.
6. `svelte-check` 0/0; vitest green; check-standards clean; E2E live green.

---

## EOD implementation notes (2026-10-21)

All 16 tasks done and verified live (FE :5173 + BE :3001 + job :3006):

- **Contract**: core `entity-meta.ts` — `MetaColumnType += "sparkline"` +
  `sparkline` config block, `FilterPreset`/`FilterPresetOption`/`FilterCondition`,
  `TableMeta.filter_presets` (all nested arrays readonly — DeepReadonly-safe).
  Helpers in `filter-presets.ts` (exported): `resolvePresetSelection`,
  `resolvePresetConditions`, `serviceApiBase`.
- **Engines**: host `useEntityList` + remote `remote-list` mirror — identical
  semantics: presetSelections persisted at `{prefix}filterPresets` (session),
  validated vs meta on applyDefaults; conditions emitted at `filters[0..]` AND
  before user filters; onPresetChange → page=1 + clamped refresh; reset
  does NOT touch presets. `loadSparklines` auto-fires post-loadRows for
  every `type:"sparkline"` column (one POST/column via serviceApiBase +
  declared endpoint; best-effort).
- **UI**: `SparklineBars` shipped from `@primebrick/ui` (generic on
  `series`, bottom→top array order); `TableCell` builtin branch;
  `FilterPresetToolbar` (button_group→ButtonGroup segmented, combobox→
  combo-select detailed w/ icon+tooltip line); toolbar renders presets right
  after the deletion-filter group with own divider. Threading:
  ETP→ELT→Header→Toolbar / ELT→Content→TableView→Body→Row→CellRenderer→Cell.
- **job.meta**: `schedule_type` filterable dropped (preset owns the field);
  `run_stats` → type:"sparkline" + declarative endpoint/series config;
  `filter_presets.schedule_kind` button_group (recurring default/once/all).
- **Patches**: job 0007 (preset keys + nav_rules, 7 langs) + 0008
  (sections.schedules, 7 langs) — signed (dev-micha) + applied.
- **Nav**: job declares nav rules link + route `kind:"list"` for
  `/system/jobs/rules`; ENTITY_SERVICE_MAP += job_* → 'job'; host static
  route `/system/jobs/rules/+page.svelte` renders EntityTablePage via
  entityApiBase('job_rule') → /ws/job.
- **Remote rework**: JobsPage = 1 schedules list (preset-driven, no
  fixedFilters) + runs list; cell_mount/RemoteCellShell/RunStatsSparkline/
  run-stats deleted — sparkline now builtin via sparklineData prop.
  `jobs_cell` keeps only the duration_ms humanizer.
- **Verified**: svelte-check 0/0, vitest 417/417, core 10/10, job
  check:standards clean, fe:build ok; E2E system-jobs-remote **7/7** +
  module-ownership **4/4** live (preset AND-ing verified on the wire:
  filters[0][field]=schedule_type, switching once/all; sparkline POST +
  svg cells; rules page renders host table; i18n dict re-fetched post
  cache flush — no raw keys).

Deviations from the plan: none structural — `RemoteMountSlot` kept as the
generic remote-content-in-host primitive (documented, unused by jobs now).

## Post-implementation correction (2026-10-21 evening — user review)

The first cut left the jobs page as a custom remote surface under
`/system/*` — wrong on three counts the user caught immediately. Fixed:

- **`/jobs` is now a standard `EntityTablePage`** (kind:"list",
  `entity:"job_schedule") — ONE table, preset toolbar + builtin sparkline
  as designed. The remote chunk survives ONLY for the module's genuinely
  custom surface: manual schedule creation at **`/jobs/new`** (kind:"page"
  esm-mount — the form composes subject/target, not a plain entity form).
- **`job_run` and `job_rule` got their own standard list pages** at
  `/jobs/runs` and `/jobs/rules` — every entity its own /list, nav has 3
  links. Remote `JobsPage.svelte` + `remote-list.svelte.ts` deleted.
- **Routes moved off `/system`** — job declares `route_prefixes:["/jobs"]`
  (like crm's `/crm`); `/system/jobs*` now 307-redirects to `/jobs*`.
- **Breadcrumb fixed** — new generic `moduleMenuSegment` helper
  (`src/lib/breadcrumb/module-breadcrumb.ts`) renders the owning module's
  nav menu (label = module display name), replacing the copy-pasted
  settings segment. Usable by any module page.
- **Sidebar single-active fixed** — `isLinkActive` is now longest-match
  among ALL declared nav hrefs (a prefix-sibling never shares active);
  parent groups also light when a child is active.
- **E2E rewritten** (`jobs-pages.spec.ts`, 10/10): one-table assertion,
  preset wire behavior, sparkline, runs/rules pages, exactly-one-active
  nav, job-module breadcrumb, ownership, remote `/jobs/new` mount +
  asset-failure recovery. `module-ownership.spec.ts` 4/4 (+ hardened a
  DynamicIcon lazy-load flake).
- New patch `0009_job_nav_runs.sql` (nav_runs, 7 langs) — signed+applied.
- Icon `history` does not exist in the installed lucide set → `play`.
