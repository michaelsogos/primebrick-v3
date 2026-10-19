# Table Pages Merge — `EntityListPage` + `useEntityList` v2 (sub-plan)

> Continuation of `metadata-driven-page-system.md` — details tasks 5, 6, 17:
> consolidate the 5 core `EntityListTable` pages (+ `JobEntityTable`) into ONE
> metadata-driven `EntityListPage` without losing any capability.
> Empirical basis: all 5 pages + `JobEntityTable` + `useEntityList` read in full
> (≈3 600 LOC); capability diff in Part B; bug list in Part C — every claim
> cites file:line. No assumptions.
> Naming: `PageRouteDeclaration` / `ModuleRouteDeclaration` (no `Decl`
> abbreviations — user decision 2026-10-19).

## Status: 🟡 PARTIALLY DONE — Plan date: 2026-10-19 00:12 UTC / 02:12 CEST (last update 2026-10-20 ~04:00 CEST — tasks 18–21 done: jobs is the first module-owned remote page end-to-end (chunk built + served + shim mounted); cross-boundary contract decided empirically = `mount_host` separate-root + host snippets + `cell` override w/ live IANA args; live browser smoke pending)

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Lift shared helpers into `$lib/entity-list/`: `ApiListError`/`readApiErrorDetails`/`asApiListError`/`isBackendGatewayUnreachable`/`backendOfflineTags` (verbatim-duplicated ×5), search-gate fn, meta `globalThis` cache+in-flight keyed per basePath | ✅ done | 2026-10-19 | fixes users' in-flight-never-cleared bug |
| 2 | Refactor `useEntityList` → v2: AGENTS.md composable pattern (`_state` + `DeepReadonly` + mutators — current file violates it), new options, fix `sortRestored`/`persistState` bug | ✅ done | 2026-10-19 | signature in Part D.1 |
| 3 | Add deletion filter to `useEntityList`: `deletionFilterMode` state + `deleted_records` param (EXCLUDED/ONLY/INCLUDED) + handler | ✅ done | 2026-10-19 | BE default = EXCLUDED (user.service.ts:496, dispatch.ts:126); send it explicitly |
| 4 | Add AbortController + `clampPage` + sort_key fallback + echo `page`/`page_size` to list fetch | ✅ done | 2026-10-19 | customers' implementation is canonical |
| 5 | Add `sync_channel` + `onConnectivityRestored` re-bootstrap + `bootstrapped` gate options | ✅ done | 2026-10-19 | re-bootstrap (customers variant) > plain refresh (users/roles variant) |
| 6 | Add search gate option (≥3 real chars OR escaped wildcard `\*`/`\?` w/ ≥1 real char) + configurable debounce | ✅ done | 2026-10-19 | canonical: customers' `searchShouldQuery` + 350 ms default; see decision F.3 |
| 7 | Persistence medium: single canonical medium + legacy-prefix support | ✅ done | 2026-10-19 | decision F.1 — recommend sessionStorage |
| 8 | Build `EntityListPage.svelte` (props in Part D.2) | ✅ done | 2026-10-19 | renders scaffold + breadcrumb + title + header actions + `EntityListTable` + page snippets |
| 9 | Thread `api_base` through `EntityListTable` for `/ws/` entities OR add `job_*` to `ENTITY_SERVICE_MAP` | ✅ done | 2026-10-19 | decision F.5 — recommend `api_base` prop (census `service_code` arrives later) |
| 9b | **Per-op endpoint resolution** — `EntityAction` gains `endpoint` (method+path the BE already knows while scanning routes incl. `metaExtraScans`); ELT ops stop computing `entityApiBase(entity)/uuid` and use the declared endpoint | ✅ done | 2026-10-19 | **DECIDED — real extension, not fallback (user 2026-10-19)**; breaking change allowed, fix call sites; type updated in BE `entity-actions.ts` + FE `entity-list/types.ts` copies — single source of truth arrives with `@primebrick/core` (task 22), promote it right after review gate to minimize drift |
| 9c | **Rewire `useFilterPersistence` inside `EntityListTable`** — regression from `bc42ad7` (Phase 10 refactor dropped all 6 call sites; the instance survived, the calls didn't) | ✅ done | 2026-10-19 | **mandatory bug fix, not optional (user 2026-10-19)** — restores persisted `filterValues`/`advancedFilters` under `storage_key_prefix`; previously-working feature silently lost |
| 10 | Migrate **users** page → `EntityListPage` — FIRST per user decision 2026-10-19 (richest surface: custom action + dialog + popup nav + sync channel + explicit deleted_records) | ✅ done | 2026-10-19 | checklist E.1; **full parity rule — no feature lost, escalate instead of compromising** |
| 10a | **REVIEW GATE** — STOP after users migration: user inspects the migrated page + `EntityListPage`/`useEntityList` v2 before any further page migration | ✅ done | 2026-10-19 | user reviewed live; reported empty row menu for unprivileged sessions → fixed (see below); approved continuation. **Rename:** component shipped as `EntityTablePage.svelte` (route→archetype semantics: route list can host table/list/future live-table; table is default) |
| 10b | Row-menu UX + parity fixes found at review: suppress ⋮ trigger when zero permitted row actions (was: openable 10px empty popover); `restore` ungated from `delete` (role with restore-only now sees Ripristina on deleted rows); custom row actions (e.g. Cambia Password) threaded through card chain → parity table/cards/cards-list | ✅ done | 2026-10-19 | root cause of user report was correct fail-closed gating (session actor was non-admin w/ `permissions:[]`), NOT a regression — verified with real pointer clicks for admin vs non-admin |
| 11 | Migrate organizations page | ✅ done | 2026-10-19 | 719→~45 LOC; popup nav, `primebrick_organizations_sync`, debounce normalized 450→350ms, verified live (6 rows, menu 4 items, popup→new tab) |
| 12 | Migrate clients page | ✅ done | 2026-10-19 | 718→~49 LOC; popup nav, `primebrick_client_registry_sync`, SvelteURLSearchParams normalized via v2, verified live (7 rows) |
| 13 | Migrate roles page (`goto` nav + `<svelte:head>`) — fixes 4 real bugs | ✅ done | 2026-10-19 | 538→~63 LOC; goto nav + `· Primebrick` title kept; `primebrick_roles_sync` receiver + page-level sender for `notifyParentRefresh`; `deletionFilter:false` (no audited deleted cols — purge-driven entity); the 4 bugs fixed by v2 (filter refetch, connector passthrough, search-scope refetch guard, unified notification pipeline) |
| 14 | Migrate customers page (href CTA, no edit route) | ✅ done | 2026-10-19 | 744→~49 LOC; CRM breadcrumb + `headerActions` snippet → `Button href="/system/customers/new"` gated on `create.single`; dead edit CTA preserved verbatim (F.4); vestigial datetimeIana binds dropped (owned by EntityTablePage); dead `statusFilter` removed |
| 15 | Migrate jobs page (4 `useEntityList` instances + cell snippet + no row actions) | ⏳ not done | — | checklist E.6 |
| 16 | Delete dead code surfaced by migration (D-list) + `pnpm check` + smoke | ✅ done | 2026-10-19 | verified-inventory cleanup — see "Task 16 dead-code ledger"; `useFilterPersistence` deleted (v2 owns persistence — F.7 closed by reimplementation); svelte-check 0/0 |
| 17 | Update `.devin/rules/entity-list-pages.md` + `docs/ai/patterns.md` + `entity-metadata.mdx` with the `EntityTablePage` canonical pattern | ✅ done | 2026-10-20 | all audiences covered — agent rules (`entity-list-pages.md`, `entity-meta-schema.md` BE), dev-guide (`entity-list-table.mdx`, `entity-metadata.mdx`, `composables.mdx`, `patterns.md`, `components/index`, `settings`, `ui-patterns`, `component-provenance`), BE dev-guide (`api-conventions`, `entity-crud-pipeline` + `deleted_records` param); extraction rerun (`components.json`, ETP 32 props); `api-reference.mdx` stale rows removed — rendered blocks regenerate at docs build; user-guide untouched (behavior unchanged) |
| 18 | `RemotePageMount` loader component: `import(/* @vite-ignore */ component_url)` + loading/error/404 states + CSS `<link>` injection + optional sha256 integrity check. **Graceful-only failures: shell stays, in-content PageError panel (never full-page system 404/400)** — distinguish network fail (retryable) / asset 404-400 / integrity mismatch / mount throw | ✅ done | 2026-10-20 | `fe/src/lib/components/remote-page/`: `remote-loader.ts` (probe-fetch for real HTTP status → `RemoteLoadError` kinds network/http/integrity/import/contract/mount; sha256 hex+SRI-base64 via WebCrypto → blob-URL import of verified bytes; `deriveStylesheetUrl`+`ensureStylesheet` dedupe; `disposeMounted` dispose-fn-or-`unmount`) + `RemotePageMount.svelte` (loading skeleton / in-content localized error panel + retry / always-DOM mount target; ctx = `ModulePageHost` w/ `api` bound to `/ws/<code>` parsed from `component_url`, per-call `t`, `pushNotification`; `$effect` reloads on `component_url` change; generation guard). 32 tests green (loader 21 + component 11: loading/mount/ctx.api-bind/default-fallback/http/network/integrity/contract/mount-throw/retry/unmount-dispose) |
| 19 | Extend `PageRouteDeclaration` with `component_url` / `component_format: 'esm-mount'` / `integrity`; component resolution = FE registry key OR remote URL | ✅ done | 2026-10-20 | Canonical type created in `core/src/page-route.ts` (`PageRouteDeclaration` + `PageRouteComponentFormat` + `ModulePageHost` + `MountPageFn` + `ModulePageNotifyInput`, exported via index + `./page-route` subpath). BE `ModuleRouteDecl` → alias over `@primebrick/sdk` re-export; `routes-census.service.ts` spreads decl so remote fields flow to FE census; FE `CensusRoute extends PageRouteDeclaration { module }`. `kind` (archetype) orthogonal to `component_url` (delivery) — no table-permanence baked in |
| 20 | Jobs page remote pilot: `fe/` sources in the `job` service → vite lib chunk → served via `/ws/job/api/v1/module-assets/…` → route decl → FE renders it | ✅ done | 2026-10-20 | First module-owned page live end-to-end. **job-handler**: `fe/` sources (vite lib → `dist/jobs-page.js` 121.6kB/37.3kB gz, self-contained svelte+@primebrick/ui); `fe:build` chained into `prebuild`; `GET /api/v1/module-assets/:file*` static route (traversal guard, immutable-hash/no-cache-entry policy, 9 unit tests). **BE**: `/system/jobs` decl gains `component_url`+`component_format`. **FE**: `/system/jobs/+page.svelte` → shim (census → decl → `RemotePageMount` + components map; resolve failures → in-content `RemotePageErrorPanel`, extracted for reuse); `src/lib/components/jobs/` deleted (module owns UI). **Remote page**: `remote-list.svelte.ts` (remote-owned mirror of useEntityList — same wire contract/prefs via bundled core fns + ctx.api+timeout), `JobsPage.svelte` (4 lists + schedule dialog remote-owned + breadcrumb mount + host_button snippets + cell override), `RunStatsSparkline` module-owned, `mountPage(el,ctx)` entry. Verified: svelte-check 0err, chunk builds, service boots clean w/ route registered. **Live browser smoke pending** (needs authed session) |
| 21 | Decide cell/snippet cross-boundary mechanism (host registry key vs remote component prop) | ✅ done | 2026-10-20 | **DECIDED — and CORRECTED by live E2E**: (a) host components → `ctx.mount_host(comp, el, props)` separate-root + `HostMountHandle{update,destroy}` — works, incl. leaf granularity via remote `<HostLeaf>` helper; (b) ~~host snippets in ctx.components~~ **SNIPPETS DO NOT CROSS** — a snippet invoked under the other bundle's render reads its own runtime's `active_effect` (null) → `Cannot read properties of null (reading 'nodes')`. Spike passed only by synchronous-mount coincidence; live E2E proved it (mount error on `{@render host_button}`). Replacement for remote-inside-host: host-owned shim snippet (e.g. `jobs_cell`, safe — invoked under host render) routes module cells to `<RemoteMountSlot>` → calls chunk's `cell_mount(el, props)` export → remote mounts its OWN root. Contract: `components.remote` = loaded module namespace (RPM assigns after load). `CellArgs` still gained live IANA fields (forwarded for host-rendered overrides). Fixed collaterals: remote meta fetch = plain JSON (ext-json bigint broke `Array.sort` on `order`); job-handler `job-run-stats` GROUP BY on parameterized date_trunc → grouped on select alias (was 500 always). Canonical types + docs updated in core |
| 22 | `@primebrick/core` + `@primebrick/ui` packages: extract shared types first, then merged components/composables when stable — first real consumer = jobs remote pilot | ⏳ partial | 2026-10-20 | **Repos bootstrapped + consumer rewiring done (uncommitted)**: `primebrick-v3-core` + `primebrick-v3-ui` cloned, `develop` live on origin, scaffold committed (aef9b74 / 2d7edb8). Core ships unified contract + `@primebrick/decimal` passthrough (env-neutral, `types:["node"]` removed). Workspace `link:` overrides resolve core/ui pre-publish; manifests keep real versions for npm. Rewired: sdk re-exports core barrel, dal decimals via core + re-export, ui re-exports core, BE `entity-actions.ts`/`entity-meta.types.ts` are facades over `@primebrick/sdk`, FE `entity-list/types.ts` + `useEntityList` ListResponse + tooltip `TooltipPriority` via `@primebrick/ui`. Verified: sdk+dal+ui builds, dal 488 tests, BE tsc+7 action tests, FE svelte-check 0 err. Fixes: core `MetaColumn` is a type alias (implicit index sig → assignable to `Record<string,unknown>` for cell-snippet args) with open `type: MetaColumnType \| string` (module cell types like `run_stats_sparkline`); 3× `filter.value !== null` guards (typeof null==="object" → real `in`-operator TypeError hazard). **Both published to npm**: `@primebrick/core@3.0.0`, `@primebrick/ui@3.0.0` (verified `npm view` resolvable). **Next**: extract ui components when stable, jobs remote pilot |
| 23 | **Dependency upgrade sweep** (side-quest authorized by user): nats → `@nats-io/*` 3.4.0 migration, dotenv 18, MCP betas → stable, safe patch bumps | ✅ done | 2026-10-19 | **nats** (sdk `b6339db`, be `f3a42fd`, us `e0f3e2f`): deprecated meta-package → modular `@nats-io/transport-node`+`@nats-io/jetstream` 3.4.0; wire protocol unchanged, **no server upgrade** (server 2.14.3 covers msg scheduling ≥2.14); migrated surface = connect, typed `allow_msg_schedules`, Consumers fetch `max_messages`, `deliveryCount`, inbox/respond; v3 adds first-class `ScheduleSpec`/`cancelSchedule` typed API that composes with custom `headers` — optional `job-schedule.ts` refactor later (our header convention still valid). Verified live: 5/5 probe round-trips vs real nats-server 2.14.3 + 376 sdk / 326 be / 488 dal tests. **dotenv 18.0.8** all repos (be `3380099`, dal `0084434`, us `589b65c`) — only `import "dotenv/config"` used. **MCP** server 2.3.1/node 2.1.1/express 2.0.2 (in `3380099`) — tsc clean, 69/69 mcp tests; transport runtime pending dev-server restart. **Deferred to follow-up plan**: sveltekit 3 (~1940 `$lib`→`#lib` rewrites, config→vite plugin), superforms 3 (compat-release, formsnap peer override), vitest 5 (`clearMocks:true` default), `@types/node` 26, jsdom 30, jest-dom 7, mermaid 12 |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Evidence base

Read in full (no sampling):

| File | LOC |
|---|---|
| `routes/(app)/system/settings/users/+page.svelte` | 630 |
| `routes/(app)/system/customers/+page.svelte` | 744 |
| `routes/(app)/system/settings/organizations/+page.svelte` | 719 |
| `routes/(app)/system/settings/roles/+page.svelte` | 538 |
| `routes/(app)/system/settings/clients/+page.svelte` | 718 |
| `components/jobs/JobEntityTable.svelte` + `routes/(app)/system/jobs/+page.svelte` | ~350 |
| `composables/useEntityList.svelte.ts` | 272 |
| `composables/useEntityMetadata.svelte.ts` | 106 |
| `entity-list-table/types.ts` (`EntityListTableProps`) | ~117 |

Cross-verified: `api.ts` (`entityApiBase`/`ENTITY_SERVICE_MAP` :41–49), BE
`user.service.ts:496` + `dispatch.ts:126` (`deleted_records` default `EXCLUDED`),
storage prefixes + sync channels via grep over `src/routes`.

## Part B — Capability matrix (the merge contract)

**Parity rule (user mandate 2026-10-19, non-negotiable):** the merge must
preserve **every** `EntityListTable` capability and **every** form-side
feature/contract (e.g. the `primebrick_*_sync` sender contract the child
pages rely on stays verbatim). `EntityListPage` is a *host*, not a reduced
ELT — every ELT prop/snippet a merged page needs must be reachable. If any
capability cannot be expressed through the page-level props/snippets, **STOP
and escalate to the user** — never silently drop or compromise it. Repeatable
code gets unified; differentiating behavior gets included/embedded, not cut.

`●` = full, `◐` = partial/divergent, `—` = absent.

| Capability | users | customers | orgs | roles | clients | jobs |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| direct `/api/v1/entities/{e}` API | ● | ● | ● | ● | ● | — `/ws/job` |
| `deleted_records` param | ● +EXCLUDED | ● no EXCLUDED | ● | — | ● | — |
| deletionFilterMode↔table wiring | ◐ cb only | ● | ● | — | ● | — |
| AbortController | — | ● | ● | — | ● | — |
| clampPage | — param ignored | ● | ● | — | ● | — |
| meta `globalThis` cache+in-flight | ● | ● | ● | ● | ● | — 4 fetches |
| prefs → localStorage | ● | — | — | ● | — | ◐ restore-only bug |
| prefs → sessionStorage | — | ● | ● | — | ● | — |
| search gate (≥3ch/escaped-wc) | — 300ms | ● 450ms | ● 450ms | — 350ms | ● 450ms | — 350ms |
| create/edit: `window.open` | ● | — | ● | — | ● | — |
| create/edit: `goto` | — | — | — | ● | — | — |
| page-level gated CTA | — | ● href `/new` | — | — | — | ● schedule dlg |
| row edit path | ● | — **no-op bug** | ● | ● | ● | — |
| BroadcastChannel receiver | `_users_sync` | — | `_organizations_sync` | `_roles_sync` | `_client_registry_sync` | — |
| customActionHandlers / extra dialog | `change_password`+dlg | — | — | — | — | schedule dlg |
| `{#snippet cell}` override | — | — | — | — | — | ● sparkline+duration |
| filterValues/advancedFilters props | — | ● | ● | — | ● | ● |
| `bind:filtersOpen` | — | ● | ● | — | ● | ◐ one-way |
| guarded `translationKey` | ● | — | — | ● | — | ● fb=entity |
| `entity` from meta | ● | hardcoded | hardcoded | ● | hardcoded | ● |
| selectionLabel keys | hardcoded | hardcoded | hardcoded | hardcoded | hardcoded | dynamic from `translation_key` |
| `<svelte:head>` | — | — | — | ● | — | ● |
| breadcrumb | settings-3 | crm-menu | settings-3 | settings-3 | settings-3 | settings-3 |
| RFC7807 tags internalCode+instance | — | ● | ● | legacy API | ● | — |
| connectivity-restored | refresh | re-boot | re-boot | refresh | re-boot | re-init |
| `bootstrapped` gate | — | ● | ● | — | ● | — |
| fixedFilters / onRowsLoaded | — | — | — | — | — | ● |
| dead `status` param | — | ● dead | — | — | — | — |

**Free inside `EntityListTable`** (do NOT re-implement): all dialogs
(delete/restore/bulk/duplicate/export/html-export/confirm-question),
`claimDocsContext`, fail-closed `meta.actions` gating, PreviewPanel, FiltersPanel
via SheetHost, FilterBar chips, DeletionFilterToggle (auto-hidden when
`!hasSoftDelete`), sessionStorage for `columnOrder`/`viewMode`/`deletionFilter`,
view modes table/cards/cards_list, sticky+audited column grouping, range
selection + "show selected", keyboard nav, IANA datetime toggle, internal op
endpoints via `entityApiBase(entity)`.

## Part C — Bugs found (fixed by the merge, not preserved)

| # | Page | Bug | Fix in merge |
|---|---|---|---|
| 1 | `useEntityList` | `sortRestored` set before meta loads → `meta.table.default_sort` **never applied**; `persistState` only called from `onVisibleKeysChange` → restored sort/searchInKeys never re-persisted | correct ordering; persist on every mutation |
| 2 | `useEntityList` | returns raw `$state` via flat get/set — violates the mandated `_state`+`DeepReadonly`+mutators pattern | refactor (task 2) |
| 3 | users | `refreshRows({clampPage})` accepted, silently ignored; callers pass it | implement clamp (customers' version) |
| 4 | users | `onDeleteRow`/`onRestoreRow` (~50 lines, `/api/v1/auth/users/{uuid}`) — **NOT dead code: never-wired CORRECT handlers** (born in `0cca7bf`). Verified: `/api/v1/entities/user_profile` is READ-ONLY (meta/list/get/audit — `user-profiles.router.ts`); all writes live under `/api/v1/auth/users/*` with critical Casdoor ordering (delete=Casdoor disable FIRST, restore=local-first); `metaExtraScans` reports those ops `enabled` in `meta.actions` → **the wired ELT path (`entityApiBase('user_profile')/{uuid}` → generic DELETE) hits a nonexistent route → users-page delete/restore are a latent 404 bug TODAY**. Also dead-in-users: `arrayEq` (copy-paste leftover — siblings use it in visibleKeys-reconcile, users uses `ensureVisibleKeys`), `filtersOpen`, `defaultSortKey`/`defaultSortDir`, `UserProfileMeta` alias; `clampPage` accepted+ignored; `filterValues`/`advancedFilters`/`deletionFilterMode`/`filtersOpen` not passed → FilterBar/FiltersPanel blind; meta-init failure untranslated | **wire the auth endpoints via the per-op endpoint mechanism (task 9b / F.10)** — do NOT drop the handlers' intent; drop only true dead code; pass full bound props; unified meta-error path |
| 5 | customers | **row edit CTA is a no-op** (`update.single` allowed, no handler); 7 unused imports (incl. `FiltersPanel`); dead `statusFilter`; fresh-fetch sets `sortKey=null` not `defSort.key`; no `translationKey` prop | drop dead code; fix fresh-fetch sort; decision F.4 for edit |
| 6 | organizations | same fresh-fetch `sortKey=null` divergence | same fix |
| 7 | roles | `onFilterValuesChange` never refetches (quick filters inert); `onAdvancedFiltersChange` drops `connector` → OR impossible; `onSearchInKeysChange` refetches on empty search; legacy `message`/`scope` notifications; `notifyParentRefresh` posts to a sender-less channel | unified handlers + error pipeline fix all |
| 8 | jobs | `job_schedule` meta fetched twice (no cache); `filtersOpen` one-way → state diverges; `ENTITY_SERVICE_MAP` has no `job` → internal ops would hit `/api/v1/entities/job_*` | meta cache; `bind:`; `api_base` threading (F.5) |
| 9 | ELT | `useFilterPersistence` **regression**: fully wired in `62a7c04` (6 read/write call sites), all removed by refactor `bc42ad7` (Phase 10 PreviewPanelWrapper extraction — diff shows only `-` lines) → instantiation survived, calls lost. `filterValuesStorageKey`/`advancedFiltersStorageKey` props inert | **wire it back** — restores silently-lost behavior, not a new feature |
| 10 | cross | `search` trimmed ×3, untrimmed ×2; `SvelteURLSearchParams` once; popup-blocked `alert` hardcoded Italian; 5-page-verbatim error helpers | normalize all |

## Part D — Target design

### D.1 `useEntityList` v2 (extended options)

```ts
export interface UseEntityListOptions<TRow> {
  basePath: string;                    // unchanged — full meta/list base
  storageKeyPrefix: string;            // unchanged — caller passes legacy prefix
  persist?: 'session' | 'local';       // default 'session' — decision F.1
  fixedFilters?: FixedFilter[];        // unchanged
  onRowsLoaded?: (rows: TRow[]) => void;
  searchGate?: (raw: string) => boolean;   // default: ≥3 real chars OR escaped wildcard
  searchDebounceMs?: number;               // default 350
  deletionFilter?: boolean;                // default true — owns deletionFilterMode + param
  syncChannel?: string;                    // LEGACY family name → dual-listen during transition; auto-subscribe to `primebrick_entity_sync` filtered on `{entity}` always on (decision A — root plan Part J)
  refetchOnConnectivity?: boolean;         // default true — re-bootstrap variant
}
```

Fetch gains: `AbortController` (cancel superseded), `clampPage` on total shrink,
`sort_key` fallback `sortKey ?? meta.table.default_sort?.key`, always-explicit
`deleted_records`, echo `page`/`page_size` applied.
Meta gains: `globalThis` cache `{data,inFlight}` keyed by `basePath` (one fetch
per entity across N page instances — fixes jobs' double fetch).
Return shape: `_state`+`DeepReadonly`+mutators per AGENTS.md composable rule.

### D.2 `EntityListPage.svelte` props

```ts
type EntityListPageProps<TRow> = {
  // bootstrap only — NOTHING entity-descriptive (that all comes from meta — D.4)
  entity: string;                            // required — drives meta fetch + pre-meta fallback
  base_path?: string;                        // default: entityApiBase(entity)
  storage_key_prefix?: string;               // default `pb:${entity}:list:`; migrated pages pass legacy
  scope_key?: string;                        // default `app.common.errors.scope.${entity}List` — error notification scope
  // page chrome
  breadcrumb: { kind: 'settings_tab' } | { kind: 'crm_module' } | { segments: AppBreadcrumbSegment[] };
  title?: string;                            // escape hatch — default entityPageTitle(meta,'list',$t)
  svelte_head?: boolean;
  header_actions?: Snippet;                  // customers New CTA / jobs schedule CTA (caller gates via isEntityOpAllowed)
  // navigation
  create_path?: string;                      // presence enables page-CTA/row create wiring
  edit_path?: (row: TRow) => string;
  nav_strategy?: 'popup' | 'goto' | 'href' | 'none';   // 'popup' = window.open+focus+i18n blocked-alert
  // behaviors
  sync_channel?: string;                     // LEGACY family channel name — dual-listen while unmigrated senders still post `'refresh'` (e.g. 'primebrick_users_sync'); structured `{entity}` subscription is automatic — decision A, root plan Part J
  fixed_filters?: FixedFilter[];
  on_rows_loaded?: (rows: TRow[]) => void;
  custom_action_handlers?: Record<string, (row: TRow) => void>;
  // pass-throughs to EntityListTable
  cell?: Snippet;                            // jobs sparkline/duration_ms
  extra_dialogs?: Snippet;                   // page-owned dialogs after table (ChangePasswordDialog)
};
```

Derived internally: `translationKey` (guarded `isSnakeCaseSingular` → fallback
`entity`), `selectionLabel*Key` = `system.entities.${translation_key}.{singular,plural}`
(JobEntityTable dynamic pattern — kills 5 hardcoded key pairs), `uid` =
`meta?.uid ?? 'uuid'`, all `meta.table.*` props, `columnOrderStorageKey` =
`storage_key_prefix + 'columnOrder'`.

### D.3 What each merged `+page.svelte` becomes

```svelte
<EntityListPage entity="organization"
  base_path="/api/v1/entities/organization"          <!-- derivable, omit -->
  storage_key_prefix="pb:organizations:list:"        <!-- legacy pref preservation -->
  breadcrumb={{ kind: 'settings_tab' }}
  sync_channel="primebrick_organizations_sync"
  create_path="/system/settings/organizations/create"
  edit_path={(r) => `/system/settings/organizations/${r.uuid}`}
  nav_strategy="popup" />
```

≈15–40 lines vs 500–750 today. jobs keeps its 4 instances + `cell`/`header_actions`
snippets — still compact.

### D.4 Metadata boundary — what lives where (user constraint 2026-10-19)

Rule: **nothing already served by `GET /entities/{e}/meta` may be re-declared
as a page prop, composable option, or `PageRouteDeclaration.page_props` field.**
Entity meta is the shared layer (reusable across table/form/kanban/… pages of
the same entity); the page level carries only page-identity and page-behavior
that a *different* page on the same entity could legitimately want different.

| Input | Home | Why |
|---|---|---|
| `entity`, `translation_key`, `uid`, `display_field`, `display_name`, `title_key` | **entity meta** | identity — every page type shares it |
| `columns[]` + all `MetaColumn` flags (sortable/searchable/filterable/hideable/default_visible/sticky/audited/badge/tooltips/`datetime_iana_toggle`) | **entity meta** | transversal by design (form tooltips already prove it) |
| `table.default_view`, `default_sort`, `default_page_size`, `page_size_options` | **entity meta** (`meta.table`) | shared by every list-shaped view of the entity |
| `table.row_custom_actions` (CTA declaration) | **entity meta** | the CTA's existence/label/icon/permission is entity config; **the handler binding is code** — `custom_action_handlers` prop (function map in code) or registry key in JSON decl |
| `actions` capability contract, `actions_overrides`, `collaboration` | **entity meta** | served/injected at meta time |
| `service_code` / `api_base` | **bootstrap** — decl/`base_path` prop; *also* injectable into meta at serve time | chicken-and-egg: needed *before* meta fetch → lives in decl/props. But it is entity-level knowledge (every page type of that entity needs the same base) → candidate for `meta.service` injected by `assembleMeta`, killing `ENTITY_SERVICE_MAP` for post-meta consumers (ELT row ops, export, audit). |
| `has_soft_delete` | **derived** | already derived from audited columns — no meta field needed |
| `selectionLabel*` keys, `title` | **derived** | `system.entities.{translation_key}.{singular,plural}` + `entityPageTitle` — props only as escape hatches, never required |
| `storage_key_prefix` | **page** | prefs namespace per page instance (jobs: 4 sections on related entities, own prefixes) — NOT per-entity |
| `sync_channel` | **internal constant + legacy input** | decision A (root plan Part J): structured `primebrick_entity_sync` filtered on `{entity}` is automatic — the prop only keeps the legacy family name for dual-listen during transition |
| `nav_strategy` (`popup`/`goto`/`href`), `create_path`, `edit_path` | **page** | route behavior — users/clients/orgs popup, roles goto, customers href; varies per route, not per entity |
| `breadcrumb`, `svelte_head`, `header_actions` | **page** | route chrome |
| `fixed_filters` | **page** | scoping — same entity may appear under different page scopes |
| `scope_key` (error notifications) | **page** | per-page i18n scope (`app.common.errors.scope.usersList`) |
| `search_gate`/`debounce` | **internal constant** | uniform today (350 ms + gate); promote to prop only if a page diverges |
| `persist` medium | **internal canonicalization** (F.1) + legacy prefix input | implementation detail, not metadata |
| rows/loading/search/sort/page/filters/visibleKeys/selectedKeys/`filtersOpen`/`deletionFilterMode`/datetime-iana modes | **runtime state** | never metadata |
| `custom_action_handlers`, `cell`, `extra_dialogs`, `header_actions`, `on_rows_loaded` | **code** (page prop = functions/snippets; JSON decl = registry key strings) | behavior bindings cannot be JSON — decl carries serializable keys, FE registry resolves them |

Consequences for the components:

- `EntityListPage` accepts **zero meta-descriptive props** — `columns`/`uid`/
  `defaultSort`/`defaultView`/`pageSizeOptions`/`entityCustomActions`/
  `entityActions`/`translationKey`/`selectionLabel*` are all derived internally
  from the fetched meta (props exist only as escape hatches where noted).
  Passing any of them by hand is a boundary violation.
- `useEntityList` v2 options stay bootstrap+behavior only: `basePath`,
  `storageKeyPrefix`, `fixedFilters`, `onRowsLoaded`, `syncChannel`, gates —
  nothing entity-descriptive.
- `PageRouteDeclaration.page_props` = page-level keys only (`storage_key_prefix`,
  `sync_channel`, `nav_strategy`, `create_path`, `edit_path`, `breadcrumb`,
  `fixed_filters`, `component_key`/`component_url`, handler/snippet **registry
  keys**). Never `columns`, `actions`, `table.*` — the decl references the
  entity; the meta speaks for it.
- Per-page table overrides (two list pages on one entity needing different
  `default_view`) are the only legit exception → `page_props.table_overrides`
  pattern, added only when a real second page needs it (YAGNI today).

## Part E — Per-page merge checklist (preserve / drop / fix)

**Order (user decision 2026-10-19): users FIRST → REVIEW GATE → then the rest.**

### E.1 users (FIRST — user reviews before continuing)

Deep-verified 2026-10-19 (630 LOC, read in full):
- **Preserve**: `change_password` custom handler + `ChangePasswordDialog` (via
  `custom_action_handlers` + `extra_dialogs`); `primebrick_users_sync`
  **receiver** (`users/create` + `users/[uuid]` are the senders — channel name
  is a route-family contract, stays verbatim); `window.open` popup nav
  (`nav_strategy:'popup'`, blocked-popup `alert`→i18n); `deleted_records`
  always explicit incl. EXCLUDED; localStorage prefs `pb:users:list:*` (see F.1);
  guarded `translationKey` (`isSnakeCaseSingular` → inside EntityListPage);
  `settingsTabMenuSegment` settings-3 breadcrumb; `onConnectivityRestored` →
  refresh; meta `globalThis` cache+in-flight (folded into composable);
  `entityPageTitle(meta,'list')`.
- **⚠️ WRITE OPS ARE ENTITY-SPECIAL**: `user_profile` is read-only on the
  generic path — create/update/delete/restore/change-password live under
  `/api/v1/auth/users/*` (Casdoor-coordinated: delete = IDP-disable FIRST,
  restore = local-first then re-enable). `meta.actions` reports them enabled
  via `metaExtraScans` but carries NO endpoint → the ELT-computed generic URL
  is a latent 404. Fix via F.10 (`EntityAction.endpoint`) or per-page op
  overrides — the never-wired `onDeleteRow`/`onRestoreRow` handlers were the
  correct implementation. `duplicate` is disabled at entity level
  (`duplicate:false` → `duplicate.bulk` hidden).
- **Drop (dead — verified zero references)**: `arrayEq` (defined, unused);
  `filtersOpen` (declared, never bound); `defaultSortKey`/`defaultSortDir`
  deriveds; `UserProfileMeta` alias; `readApiErrorDetails`-cluster → shared
  helper. The old `onDeleteRow`/`onRestoreRow` **functions** go away, but
  their *endpoints* become the F.10 wiring.
- **Fix**: pass `filterValues`/`advancedFilters`/`deletionFilterMode`/
  `filtersOpen` bound (FilterBar+panel currently blind); sort-restore order
  (default_sort applies only when no stored sort); `search_in` gate
  (`onSearchInKeysChange` refetch only when `appliedSearch` non-empty);
  meta-init error → unified i18n path; in-flight cleared on success+failure.
- **Note (verified topology)**: the channel is origin-wide BroadcastChannel —
  child form pages are senders and fire only after create/update/rotate-key;
  **no child window ever performs delete/restore** (all row delete/restore run
  inside the list via ELT internal dialogs → `entityApiBase`). The dead
  `notifyParentRefresh` in users' `onDeleteRow`/`onRestoreRow` would have
  reached **sibling list windows** (other tabs on the same channel), not
  "the parent". **Resolved by decision A** (root plan Part J): the structured
  `primebrick_entity_sync` channel covers sibling lists automatically —
  `sync_channel` here is the legacy family name kept only for dual-listen
  while unmigrated senders still post `'refresh'`.
- **GATE**: user reviews migrated page before tasks 11–15 proceed.

### E.2 organizations
Preserve: window.open nav, `_organizations_sync` receiver, sessionStorage,
search gate 450→350ms, full deletion wiring, abort, clamp, RFC7807 tags,
settings-3 breadcrumb.
Fix: fresh-fetch `sortKey=null`→`defSort.key`; hardcoded `entity`→meta-driven.

### E.3 clients
Same as E.2 + normalize `SvelteURLSearchParams`→`URLSearchParams`;
`_client_registry_sync`.

### E.4 roles
Preserve: `goto` nav, `<svelte:head>`, `pb:role_mappings:` prefix (plural!),
`_roles_sync` receiver.
Fix (4 real bugs): `onFilterValuesChange` no-refetch → refetch; dropped
`connector` → pass through; `onSearchInKeysChange` empty-refetch → gate;
legacy notifications → unified pipeline. Add `deleted_records` wiring **only if**
`role_mapping` meta ships audited soft-delete columns — verify in implementation
(subagent could not confirm).
Open: `notifyParentRefresh` with no senders — F.6.

### E.5 customers
Preserve: page-level `href="/system/customers/new"` CTA gated
`create.single` (→ `header_actions` snippet), sessionStorage, abort, clamp,
RFC7807 tags, connectivity re-bootstrap, crm-menu breadcrumb.
Drop: 7 unused imports, dead `statusFilter`, ignored response echo.
Fix: fresh-fetch `sortKey`; add `translationKey`.
Open: **no edit route exists** (`/system/customers/[uuid]` absent — only `/new`
stub) → edit CTA is dead. Decision F.4.

### E.6 jobs
Preserve: 4 `useEntityList` instances (`pb:jobs:{recurring,once,runs,rules}:`),
`fixedFilters` ×2, `onRowsLoaded` sparkline enrichment, `cell` snippet
(`run_stats_sparkline`, `duration_ms`), no row actions (`entityActions` only —
verify `rowActionsEnabled=false` intent), one-way→`bind:filtersOpen`,
"Schedule new" `header_actions`, `<svelte:head>`, `onConnectivityRestored`→init.
Fix: meta double-fetch (cache); `/ws/job` base for internal ops (F.5).

## Part F — Decisions (recommendations, awaiting confirmation)

| # | Decision | Recommendation |
|---|---|---|
| F.1 | Persistence medium: localStorage (users/roles/jobs) vs sessionStorage (customers/orgs/clients) | **sessionStorage** — newest pages converge there; popups share localStorage across tabs → per-tab prefs fit the popup workflow. Legacy prefixes still honored; stale localStorage keys orphaned (harmless; optional one-time cleanup). |
| F.2 | `deleted_records` send policy | Always explicit (`EXCLUDED`/`ONLY`/`INCLUDED`) — BE default is EXCLUDED anyway (verified user.service.ts:496); explicit beats implicit and matches users. |
| F.3 | Search gate canonicalization | Adopt customers' gate (≥3 real chars OR escaped wildcard) + **350 ms** — changes users/roles/jobs behavior (fewer requests). Flag as intentional change. |
| F.4 | customers dead edit CTA | `edit_path` absent → do NOT wire `onEditAction`; separately decide BE-side `actions_overrides: { "update.single": {enabled:false} }` OR add the edit route. Confirm intent. |
| F.5 | `/ws/` entity internal ops (`entityApiBase` gap) | Thread `api_base` prop through EntityListTable (explicit, works with future census `service_code`) instead of growing `ENTITY_SERVICE_MAP`. |
| F.6 | roles `notifyParentRefresh` (sender-less broadcast) | Keep receiver only; drop the sender call — harmless but dead. |
| F.7 | `useFilterPersistence` dead inside ELT | **DECIDED — wire it (user 2026-10-19, task 9c)**: regression from `bc42ad7`, a previously-working feature silently lost → mandatory fix. Rewire persisted `filterValues`/`advancedFilters` under `storage_key_prefix`. |
| F.8 | Popup-blocked alert | i18n key (`app.common.popupBlocked`?) — currently hardcoded Italian. |
| F.9 | Sibling-list sync on delete/restore | **RESOLVED — decision A (root plan Part J)**: structured `primebrick_entity_sync` channel `{entity, uuid?, op, at}` posted on every confirmed write → sibling lists refresh automatically; `sync_channel` prop becomes the legacy family name for dual-listen during transition only. |
| F.10 | Per-op endpoint resolution (`user_profile` writes live under `/api/v1/auth/users` — generic entity DELETE doesn't exist → latent 404 today) | **DECIDED — real extension (user 2026-10-19)**: `EntityAction` gains `endpoint` `{method, path}` emitted by `deriveEntityActions` from the route scan (incl. `metaExtraScans` routers); ELT ops call the declared endpoint, `entityApiBase` convention becomes fallback-for-absent-field only. Breaking change sanctioned — no backward-compat shims, fix call sites. Type lives in BE `entity-actions.ts` + FE `entity-list/types.ts` until `@primebrick/core` unifies (task 22, promote post-gate). Also kills `ENTITY_SERVICE_MAP` + enables `/ws/` module ops. |

## Part G — Acceptance & verification

Per migrated page (checklist run in the running app):
1. **Full parity (parity rule, Part B)**: same columns, defaults, views,
   toolbar, dialogs, pagination — and every differentiating feature exercised
   (users: change_password dialog + flow, popup nav + blocked-alert, sync
   receiver from a real child-form save, explicit `deleted_records`).
2. Every preserved capability from Part E exercised once (create nav, edit nav,
   sync-channel refresh from a popup save, deletion filter, search gate,
   persisted sort/visible/order across reload).
3. `meta.actions` gating unchanged (fail-closed) + write ops hit the declared
   `endpoint` (users: `/api/v1/auth/users/*`, not the generic prefix).
4. No regression on `/ws/` jobs entities.
5. `pnpm run check` clean; `pnpm lint` clean; no new compiler warnings.
6. LOC budget: each migrated `+page.svelte` ≤ ~50 lines; net repo delta ≤ −2 000 LOC.

## Part I — Module-provided page delivery (the jobs question)

User requirement (2026-10-19): `/system/jobs` is **wrongly a core page** — it
belongs to the `job` module. This part covers how module-owned pages reach the
FE, including the `.pbm` package vision from earlier plans. Empirically
validated by a live spike before writing this section.

### I.1 Verified transport facts

- The `/ws/:serviceCode/*` proxy forwards the path **verbatim** —
  `be-v3/src/modules/proxy/proxy-service.ts:176-178`
  (`req.url.replace(/^\/ws\/[^/]+/,"")` → `{base_url}{path}`). The comment says
  "governed routes under /api/v1/*" but the code does not enforce it → a
  service can already serve static assets, reachable same-origin at
  `/ws/<code>/api/v1/module-assets/…`. **Same-origin ⇒ no CORS/CSP work.**
- Vite lib mode emits predictable names — `build.lib.fileName`/`cssFileName`,
  `output.chunkFileNames`/`assetFileNames` (official docs, confirmed in spike).
- Svelte 5: `mount()` + dynamic components are public API; components are
  values (dynamic by default in runes mode).

### I.2 Spike results (temp spike, run & verified 2026-10-19, cleaned after)

Recipe: `vite build` lib mode, `formats:['es']`, `fileName:'jobs-page.js'`,
`cssFileName:'jobs-page'`; component with `$state` + props + `<style>`;
`export function mountPage(el, ctx) { return mount(Page, {target: el, props:{ctx}}) }`.

| Assertion | Result |
|---|---|
| Predictable output names | ✅ `dist/jobs-page.js` 36.8 kB (11.6 gzip) + `dist/assets/jobs-page.css` |
| Self-contained chunk | ✅ svelte runtime bundled — zero host-version coupling |
| Runtime remote import | ✅ `await import('/jobs-page.js')` in a real browser (playwright) |
| Self-mount | ✅ `mod.mountPage(el, ctx)` renders live DOM |
| Host → remote props | ✅ `title`, `count_start` honored |
| Remote → host callback | ✅ `ctx.onAction` reached host (`42` after 2 clicks) |

Conclusion: **precompiled ESM chunk + self-mount contract is proven viable
today** — the only missing pieces are the loader component, the decl fields,
and the serving convention.

### I.3 Options evaluated

| Option | Verdict |
|---|---|
| Remote ESM chunk + `mountPage(el, ctx)` self-mount | **Recommended v1** — spike-proven, same-origin via `/ws/`, no shared-runtime coupling |
| Module federation (`@module-federation/vite`/`vite-plugin-federation`) | Deferred — solves dep-sharing we don't need (ctx contract); known SvelteKit SSR stub friction |
| Runtime-compiled `.svelte` sources (`svelte/compiler` in browser) | Rejected v1 — import remapping burden, compile cost, debugging pain |
| Custom elements (`customElement:true`) | Rejected v1 — shadow DOM severs Tailwind/tokens; props/events bridging friction |
| Descriptor-only pages (no code shipped) | **Complementary** — preferred whenever an archetype covers the need; zero code shipped |

### I.4 Contract design

```ts
// PageRouteDeclaration additions (custom/remote pages)
component_url?: string;            // e.g. '/ws/job/api/v1/module-assets/pages/jobs-page.js'
component_format?: 'esm-mount';    // chunk exports `mountPage(el, ctx)` OR default component
integrity?: string;                // sha256 — manifest-declared; FE verifies via fetch+WebCrypto
                                   // before import (import() has no SRI)
```

`ModulePageHost` (versioned `host_version`) — **plain values + functions
only**; UI building blocks come from `@primebrick/ui`, not from ctx:

```ts
type ModulePageHost = {
  host_version: 1;
  nav: PageRouteDeclaration;
  meta?: EntityMeta;
  api: (path: string, init?: RequestInit) => Promise<Response>; // apiFetch bound to the service's /ws base
  i18n: { t: (key: string) => string; locale: string };
  notify: typeof pushNotification;
  components?: Record<string, Component>; // optional — host-coupled needs only
};
```

⚠️ **Rune boundary (hard constraint)**: `$state`/`$derived`/`$effect` are
per-bundle — host rune-composables (`useEntityList`, `$t` if rune-backed)
**cannot** be shared as live objects into remote components. **But the
`@primebrick/core` + `@primebrick/ui` package layer (user decision
2026-10-19) dissolves most of this**: the remote chunk bundles its own copy
of the ui lib + its own svelte copy → the remote page imports
`useEntityList`/`EntityListPage` directly and everything is coherent inside
the remote bundle. ctx shrinks to transport glue + callbacks; `components`
stays only for host-coupled cases. Remote-inside-host component rendering
remains a separate unproven case — task 21.

CSS: predictable `cssFileName`, manifest lists it, host injects `<link>`
(alternative: `vite-plugin-css-injected-by-js` — evaluate).

**Chunk economics (clarified 2026-10-19)**: chunks are **self-contained** —
rollup inlines ALL imports incl. svelte runtime and module-only libs; no
`external` for svelte/ui (bare specifiers can't resolve in-browser without
an import map). Weight measured: 36.8 kB / 11.6 gzip baseline page; expect
40–80 kB raw per real page. Loading: (a) route-level split for free —
chunk fetched only on navigation; (b) dynamic `import()` inside the module
source stays dynamic → hash-named sub-chunks fetched on-demand, resolved
relative to the chunk's own `/ws/` URL; (c) CSS `<link>` injected
immediately → CSS+JS travel in parallel. Content-hashed names ⇒
`Cache-Control: immutable` on `module-assets`; optional future
`modulepreload` on nav-hover.

### I.5 Delivery paths (both coexist)

| Path | Mechanism | When |
|---|---|---|
| **Pull — service-served** | module serves `/api/v1/module-assets/*` → `/ws/<code>/…` | live registered services; module offline ⇒ page gone (coherent with its APIs) |
| **Push — registration-deposited** | `.pbm` zip → installer deposits `fe/` chunks to a BE-served location | central install without a running service; ties to `module-installation-process.md` |

`.pbm` layout target (from the earlier vision): `module.json` (manifest —
`code`, `version`, `schemas`, `nav`, `pages:[{route, page_type|component_url,
integrity}]`, `fe_assets`) + `us/` (compiled service) + `fe/` (compiled
chunks) + `db-meta/` (patches) + `docs/`. This plan only needs `fe/` + the
manifest `pages` mapping.

### I.6 The jobs page pilot — two tracks

- **Merge track (task 15)**: jobs becomes 4 `EntityListPage` instances in core
  FE — immediate dedup AND produces the exact building block the remote page
  consumes (`ctx.components.EntityListPage` × 4 + its own schedule dialog).
- **Module track (task 20)**: `job` service gains `fe/` sources built against
  `@primebrick/ui` + `@primebrick/core` (its vite lib build bundles them into
  the chunk — task 22 is the prerequisite) → `jobs-page.js` → decl
  `{route:'/system/jobs', page_type:'custom',
  component_url:'/ws/job/api/v1/module-assets/pages/jobs-page.js'}` →
  `RemotePageMount` renders it. The sparkline cell is the one hard piece
  (snippet can't cross the boundary — task 21 decides registry-key vs remote
  component prop).
- If task 20 lands cleanly, task 15's in-core migration can be **skipped** for
  jobs entirely — decide at that point; keeping both in the plan is deliberate
  (merge de-risks the remote content either way).

## Part H — Out of scope (main-plan phases)

Route-level catch-all dispatch (main-plan tasks 4, 21); form/kanban/timeline
types; presence; the full module self-description protocol (register payload
extension, installer deposit — only the serving path is piloted here with
jobs). This plan makes `EntityListPage`/`useEntityList` v2 + `RemotePageMount`
real and migrates the 6 pages — the *renderer* half of `PageType.Table` plus
the *delivery* half of module `custom` pages, both usable inside existing
static routes.

## Part K — Execution notes (users tranche, 2026-10-19)

Naming: the page host shipped as **`EntityTablePage.svelte`** (not
`EntityListPage`) — the list ROUTE hosts multiple page archetypes (table =
default, list, future live-table); `useEntityList` keeps its name because it
is the shared list STATE layer, not the archetype.

### Pre-existing bugs surfaced by the migration (fixed 2026-10-19)

1. **`restoreUser` 404 dead-on-arrival** — `user.service.ts` used the
   active-scoped `getByUuid` for the existence check, so
   `POST /auth/users/:uuid/restore` could never succeed on a soft-deleted
   row. Fixed via `getByUuidIncludingDeleted` (`deletedRecords:"INCLUDED"`).
   Verified live: restore → 200, row re-activates.
2. **`deriveSearchableKeys` dropped every `varchar(N)` column** —
   `inferredPgType` returns parameterized types (`varchar(255)`);
   `TEXTLIKE_PG_TYPES` only lists bare forms → `has()` failed → default
   search scope collapsed to `["uuid"]`. Any `search_in` carrying the
   meta-declared fields filtered to an empty set → `Filter.group([], "OR")`
   → `()` in SQL → 500. Fixed by stripping `(...)` before the set lookup +
   skipping empty search groups in `listUsers`. Same bug also silenced the
   default search scopes of `role.service`/`organizations.service`
   (both consume `deriveSearchableKeys`).
3. **`EntityTablePage` initial wiring gap (found in-browser)** — bound
   `deletionFilterMode` but the composable notifies via the separate
   `onDeletionFilterModeChange` callback prop (the bindable prop is
   init-only). Fixed: prop + callback wiring, matching pre-migration
   semantics. Verified: toggle refetches with `deleted_records=ONLY`.

### Empirical verification log (Playwright, live FE+BE)

- meta emits `endpoint` for every discovered op (delete/restore/create/
  update/change-password under `/api/v1/auth/users*`, list/get/audit under
  `/api/v1/entities/user_profile*`); disabled ops carry no endpoint.
- DELETE `/api/v1/auth/users/:uuid?version=1` → 200 (was a latent-404
  convention path before the endpoint dispatch).
- POST `/api/v1/auth/users/:uuid/restore?version=2` → 200 (after fix 1).
- Search `search=test&search_in=display_name,idp_code,email,idp_org,
  idp_username` → 200 (was 500 before fix 2); `search=prime` → 1 row.
- Sort `sort_key=email&sort_dir=asc` → 200; persisted to
  `pb:users:list:sort` (sessionStorage).
- Filter `email=test-user` applied + persisted to
  `pb:users:list:columnOrder:filterValues`; survives reload (F.7 fix).
- Views: table/cards-grid/cards-list all render; columns panel, filters
  panel, preview panel, version-history (audit), change-password custom
  dialog, create popup (`/system/settings/users/create` in new tab) all OK.
- Bulk bar correctly absent (all bulk ops disabled in user_profile meta).
- Console: 0 errors post-fixes.
- Test actor: ephemeral `e2e_test_admin` minted via
  `src/e2e/helpers/test-users.ts` (dev `admin` has MFA — cannot automate
  its login); actor destroyed after the session.

## Task 16 dead-code ledger (verified inventory, 2026-10-19)

Every candidate was checked against real consumers (repo-wide greps, git
pickaxe across all branches, dynamic-access sweeps). Outcomes:

**Deleted files**
- `useFilterPersistence.svelte.ts` — first-gen filter persistence; call
  sites removed by `bc42ad7`; v2 owns `filterValues`/`advancedFilters`
  persistence (`skFilterValues`/`skAdvancedFilters`) — verified live.
- `useSorting.svelte.ts`, `useFilters.svelte.ts` (+`useAdvancedFilters`) —
  first-gen list-state composables, zero consumers (v2 owns).
- `useSelection.svelte.ts` (ELT-internal copy) — zero consumers; the
  shared `lib/composables/useSelection.svelte.ts` stays (ConfigList,
  ModelCacheSection) — 145-line different impl.
- `*.webllm.bak.ts` ×3 (`lib/ai/sw-manager`, `use-model-cache`,
  `smart-regex-input/use-regex-ai`) — WebLLM-era snapshots, unreferenced.

**Unexported (kept as internals — no external consumer)**
- `entity-list/index.ts`: `asSnakeCaseSingular`, `TableMeta`,
  `CollaborationMeta`, `formatDatetimeIanaListCell`,
  `httpTagForGatewayFailure` dropped from the barrel; all still used
  internally or alive as documented helpers.
- ELT props `filterValuesStorageKey`/`advancedFiltersStorageKey` removed
  (were inputs to the deleted composable; ELT never destructured them).

**useEntityList public surface — commented out (concept = removed)**
- Zero readers verified incl. dynamic access: getters `appliedSearch`,
  `globalConnector`, `bootstrapped`, `metaLoaded`, `defaultSortKey`,
  `defaultSortDir`, `effectiveSearchInKeys`; methods `persistState`
  (internal `$effect` calls it), `toggleFilters` (superseded by
  `setFiltersOpen`), `setRows` (superseded by `onRowsLoaded`).
- `get state()` stays — AGENTS DeepReadonly contract.

**Type consolidation**
- `DeletionFilterMode` had 4 identical declarations → canonical in
  `lib/entity-list/types.ts`, re-exported by `useEntityList`,
  `entity-list-table/types.ts`, `useDeletionFilter`; `useAiModels` now
  imports it.

**Kept — with tracking obligations**
- `clearEntityMetaCache` — designed test/debug escape hatch for the
  `globalThis` meta cache. TRACKED: adopt it in `useEntityList` unit
  tests and/or a meta-invalidation flow when meta becomes mutable —
  before that it's intentionally dormant API.
- `use-url-filters-sync.svelte.ts` — consumer half of the AI deep-link
  feature (born in `73a9191`, never wired in any commit). The `navigate`
  client tool already accepts `query` — AI can emit `?filters[0]...` but
  no page parses it. Kept as documented WIP: wire into
  `useEntityList.init()` (URL filters take precedence over persisted
  state) when the AI module work lands.

**Latent bug found, not fixed**
- `FiltersPanel` owns a local `globalConnector = 'AND'` — it never
  receives the current connector, so an applied `OR` resets visually on
  reopen. Track: pass the connector as a panel prop.

**Out of scope here**: jobs internals (task 15), ELT escape-hatch props
(`rowActions` snippet, `metaLoadingView`, `rowsLoadingView`, `emptyView`,
`errorView`, `loadingMessage`, `noRecordsMessage` — kept as documented
API), ETP passthroughs `searchGate`/`searchDebounceMs` (config knobs,
unused by current routes), `useEntityMetadata` (alive — 6 form pages),
`useHealthChip.ts` shim (resolves extensionless imports).
