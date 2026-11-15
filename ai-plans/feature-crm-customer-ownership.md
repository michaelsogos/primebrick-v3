# Complete crm module ownership — migrate `customer` entity from be-v3

> Closes the documented debt in `primebrick-us-v3/crm/src/index.ts:12-14`:
> *"The customer entity pages themselves stay BE-served for now … entity API
> ownership migrates to this service in a later phase."* Under the
> module-ownership paradigm a module owns entity + meta + routes + docs —
> crm declaring `entity: "customer"` over a BE-owned entity is a contract
> violation (its `entityRegistry` registers only `config_entry`).
> All paths/claims below verified empirically 2026-10-26.

## Status: 🟢 DONE — Session 3 (2026-10-26): all 14 tasks complete — code + docs + verification green (e2e 6/6 lifecycle + 8/8 module-ownership, BE 366/367 pre-existing fail, DAL 488/488, svelte-check 0 everywhere)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | us-v3/crm: port `be-v3/src/modules/customers/` → `crm/src/` in the **pure DomainService shape**: `domain/entities/customer_entity.ts` (US entity location convention), `modules/customers/{customers.service.ts, customers.meta.ts, schemas.ts, list-config.ts}`. `CustomersService extends DomainService` (the SDK-bound base from task 1b — `actor: requireActor` injected in `buildConfig()`); `dto.ts` → **`schemas.ts`** (zod + types only — no DTO classes); **`audit-transformer.ts` DROPPED** (git `-S` proves it was never imported by any file in any commit — dead on arrival since `efd48a5`, its consumer `customers_dal.ts` deleted in the dal-pg migration); **`debugCode` DROPPED** (`PB_CUSTOMERS_FORCE_*` dev toggles — env-policy bans `process.env` reads outside bootstrap); **NO `entity-repo.ts`/`*-repo.ts`** (banned per `dal-usage.md` — legacy debt shape) | ✅ | 2026-10-26 | REVISED: not a facade port — `DomainService` per `dal-usage.md:20` + `AGENTS.md` ("new services extend DomainService"; `*Dal`/`*Repo` wrappers banned) |
| 1a | **dal-v3** (`feature/crm-customer-ownership` ✓ created) — display names STATIC-HARDCODED in the LIB: `src/entities/user-profile-ref-entity.ts` = `@Entity({schema:"public", tableName:"user_profiles"})` read-only projection `uuid`/`display_name`/`idp_code` (platform contract — `AuditLogEntity` precedent; `UserProfileEntity` CRUD stays BE-owned); `entity-service.ts` — **`userEntity` config REMOVED**, `joinsFor()` = `isAuditableEntity(meta) ? buildAuditableJoinsSelective(entity, UserProfileRefEntity, {includeDeleter: hasDeletedBy}) : []` (auditable guard — non-auditable entities never join), `audit()` always passes it; `query-builder.ts` → `COALESCE(alias.display_name, <base>.<field>_by)`; `audit-query.ts` → `COALESCE(creator.display_name, audit.changed_by)`; `schema-domain.ts` — `user_profiles` = built-in always-shared table (public is a platform domain, not a module domain) | ✅ | 2026-10-26 | REVISED after user correction: `public`/`custom` are cross-app platform domains — the join is an INVARIANT, not config. Zero initDal changes, zero SDK entity, zero params |
| 1b | **sdk** — export port ONLY: `"export"` → `EntityAction`, `export?: EntityExportConfig` + `schemas.exportQuery` → `EntityRouterConfig`, `stream` → `EntityServiceLike` (already on dal `EntityService`), `streamEntityExport` + csv/xlsx/html writers ported from `be/src/http/entity-export.ts` + `src/lib/export/`, spec op in `makeServiceRoutes`, template convention `templates/<entity>_export_template.{xlsx,html}` service-local, `translationModule` resolves `<schema>.translations` | ✅ | 2026-10-26 | REVISED: no UserIdentityEntity/DomainService base needed — dal owns the join statically. BRANCH ANOMALY: sdk on unrelated open `feature/shield-stale-snapshot-recovery` — awaiting decision |
| 1c | **be-v3 binding cleanup**: `src/db/domain-service.ts` + `src/http/entity-service.ts` drop `userEntity` injection (compile break → fix by deletion); `audit-query-helper.ts` keeps `UserProfileEntity` join (BE-local path, works) | ✅ | 2026-10-26 | US initDal needs NOTHING — the exemption is built into the lib |
| 2 | us-v3/crm: `src/controllers/http/entities-route.ts` — `EntityRouteDecl[]` for `customer` with the SAME permission literals (`Permission.CUSTOMER_*` — SDK enum unchanged) and `schemas:{createBody,updateBody,exportQuery}` from the ported `schemas.ts` (real zod, NOT the `entityBody` permissive cast job-handler uses) | ✅ | 2026-10-26 | BE router currently enables FULL optional set: export, duplicate, bulk delete/restore — export arrives via task 1b SDK op (meta-derived config, ONE declaration → route+perm+meta+OpenAPI) |
| 3 | us-v3/crm: `src/service-routes.ts` — `makeServiceRoutes({info, serverUrl, tags, entities:[customer], rpc:[…]})` (job-handler `service-routes.ts` precedent); wire `routeHandler:` in `index.ts`; update the stale header comment (remove "BE-served for now") | ✅ | 2026-10-26 | crm today exposes ONLY /health + built-in surface — no routes at all; verify port (services run 3003–3007, likely 3007) |
| 4 | us-v3/crm: `domain/entities/registry.ts` += `CustomerEntity` (joins `ConfigEntryEntity`); `db-meta/patches/0005_*.sql` — `ALTER TABLE public.customers SET SCHEMA crm` + `public.customers_audit` → `crm` (zero-copy, rows preserved); regen `db-meta/snapshot-entities.json` (`db:check`) | ✅ | 2026-10-26 | **Enforced, not optional**: `assertEntitySchemaDomain` (dal-pg `schema-domain-assert.ts`) runs at boot on `entityRegistry` — entity tables must live in the service's declared schemas or boot fails |
| 5 | be-v3: delete `src/modules/customers/` + `src/controllers/http/customers.router.ts`; unmount in `src/modules/index.ts:19,29`; unregister in `src/domain/entities/registry.ts:19,35` | ✅ | 2026-10-26 | |
| 6 | be-v3: `src/openapi/openapi.ts` — remove `Customers` tag + all `/api/v1/entities/customer*` paths + `Customer*`/`EntityListResponseCustomer`/`CustomerStatus` schemas (hand-maintained spec — does NOT auto-regenerate) | ✅ | 2026-10-26 | |
| 7 | be-v3 MCP: `entity-registry.ts` — remove `registerLocalEntity("be", customer)` block (~line 194); `dispatch.ts` — remove ~8 `case "customer"` in-process factory blocks + `CustomersService`/`customerMeta` imports. **No MCP loss**: on crm registration `service-lifecycle-subscriber.registerMcpEntities` → `discoverEntitiesFromService` fetches crm's `/api/v1/openapi.json` and auto-registers `customer` as `handler_type: "proxy"` — generic tools, zero manual wiring | ✅ | 2026-10-26 | Verified: discovery is OpenAPI-driven; `makeServiceRoutes` emits `/api/v1/entities/customer/*` → auto-proxy. RBAC enforced by the microservice |
| 8 | be-v3 leftover refs (comments only — role_mapping_entity, audit-query-helper, meta-assembler, export/example, bulk-action-runner, list-query): leave or sweep — sweep for accuracy | ✅ | 2026-10-26 | Verified: all are comment/example mentions, no functional deps |
| 9 | fe-v3: `api.ts` `ENTITY_SERVICE_MAP` += `customer: 'crm'`; `/crm/customers/+page.svelte` → `basePath={entityApiBase('customer')}` (job-schedules page already does this) | ✅ | 2026-10-26 | generic composables (useBulkActions/useExport/useRowActions) already route via `entityApiBase(entity)` — map entry fixes them all |
| 10 | us-v3/crm `fe/` remote scaffold (ai/fe pattern): `vite.config.ts` + `fe/package.json` + `fe/src/pages.ts` (`PAGES` dispatch + `mountPage` + `bindRemoteCtx`) + components — `CustomerCreatePage` (ports the stub content; real form is NOT this plan — Q2) + `PipelinePage` (ports the 39-ln i18n scaffold); `crm/src/controllers/http/module-assets-route.ts` serves `fe/dist`; `service-routes.ts` rpc += moduleAssetsRoutes | ✅ | 2026-10-26 | **RESOLVED Q1**: create/pipeline go remote — no form archetype exists yet, `kind:"page"` is never an archetype. List stays `kind:"list"` physical (host archetype when metadata-driven-page-system lands) |
| 10a | crm `nav-declaration.ts`: create + pipeline routes gain `component_url: "/ws/crm/api/v1/module-assets/crm-pages.js"` + `component_format: "esm-mount"`; fe-v3: delete physical `crm/customers/create/+page.svelte` + `system/crm/pipeline/+page.svelte` | ✅ | 2026-10-26 | Verified format from AI_NAV/JOB_NAV; physical files must go or they shadow the remote resolution |
| 11 | fe-v3 e2e: `entity-crud-lifecycle.spec.ts` customer `BASE` → `/ws/crm/api/v1/entities` (`AI_BASE` precedent at line 28); `access-filtering.spec.ts` customer perm tests same; run `module-ownership.spec.ts` | ✅ | 2026-10-26 | |
| 12 | Translations: `system.entities.customer.*` keys MOVE to `crm.translations` renamed `crm.entities.customer.*` + `entities_ns: "crm"` in meta — **job precedent**: `0006_job_entities_ns.sql` renamed `system.entities.job_*.*` → `job.entities.*` inside `job.translations` when `entities_ns` landed. Cross-schema DELETE+INSERT in one crm patch is legal (translations = governed shared table). FE resolves `<ns>.entities.*` via `meta.entities_ns` → module-load pull of `crm.translations`. Export templates: `be-v3/templates/customer_export_template.{html,xlsx,_2.xlsx}` → `crm/templates/` | ✅ | 2026-10-26 | REVISED: earlier "keys stay" was wrong — job's `entities_ns` precedent means module-owned entities use `<module>.entities.*` keys in the module's own table |
| 13 | Verify: crm boots (`assertEntitySchemaDomain`+`checkDrift` green), `GET /ws/crm/api/v1/entities/customer/meta|list` live, FE `/crm/customers` loads, vitest BE+US, e2e specs | ✅ | 2026-10-26 | |
| 14 | Docs: `crm/docs/dev-guide` update (entity surface now real); be dev-guide customer mentions swept; update `docs-generation-per-service-split.md` Q2 note (debt closed); crm `package.json` — add `generate:docs` script (missing today) | ✅ | 2026-10-26 | crm index.mdx rewritten (real HTTP surface: entities-route/composite/module-assets, remote pages, 0005 patch); crm `generate:docs` → openapi-only docs pack; BE docs swept — architecture/api-conventions/overview/collaboration/translations/entity-router-factory/controller-boundary/dal-usage updated to organizations + customer refs removed; stale `generated/customers.mdx` + `_order.json` entry deleted (regenerator no longer emits it); broken `scripts/seed-customers.ts` + `db:seed:customers` deleted (imported the deleted module); dal entity-service/audit-trail docs updated (userEntity → hardcoded UserProfileRefEntity + COALESCE); sdk entity-router.mdx documents the export op; fe i18n examples swapped to organization. **Gap**: crm emits no user-guide pages today (openapi-only pack) — customer end-user docs coverage is recorded debt in the docs-split plan |
| 15 | GitFlow: `feature/crm-customer-ownership` in us-v3 ✓ + be-v3 ✓ + fe-v3 ✓ + dal-v3 ✓ + **sdk ✓** (parallel feature — user decision "decidi tu procedi": shield feature is published/inactive, rule bans two ACTIVE dev features) — commits only on explicit instruction | ✅ | 2026-10-26 | |

<!-- Status values: ✅ done · ⏳ not done · 🚫 dropped. -->

---

## Verified migration surface (2026-10-26)

### What moves be-v3 → us-v3/crm

| Artifact | From | To | Size |
|---|---|---|---|
| Entity def | `be/src/modules/customers/customer_entity.ts` | `crm/src/modules/customers/` | 98 ln — `@Entity("customers")`, `Deletable(Auditable(EntityBase))`, `IExposable+IClonable`, `@Cached(300s)` |
| Meta | `customers.meta.ts` | same | 28 ln |
| Service | `customers.service.ts` | same — `makeEntityService` facade | 128 ln |
| DTOs/zod | `dto.ts` | same | 209 ln — real field-level schemas |
| List config | `list-config.ts` | same | 116 ln — searchable/filterable/sort |
| Audit transformer | `audit-transformer.ts` | same | 129 ln |
| Router → decl | `controllers/http/customers.router.ts` | → `crm/.../entities-route.ts` `EntityRouteDecl` | 91 ln → decl |

### Capability set to preserve (be router, verified)

`meta, list, export, create, duplicate, bulkDelete, bulkRestore, get, update,
delete, restore, audit` — all 12 perms `Permission.CUSTOMER_*` (SDK enum —
shared, unchanged). Methods map preserved via `EntityRouteDecl`.

### Data layer

- `public.customers` + `public.customers_audit` — created by be
  `init_database.sql` (SHIPPED patch — never edit; the schema move lives in
  crm's new patch; fresh installs still work: be creates → crm moves).
- No FK references to `customers` found in any patch — safe to move.
- crm already owns `crm` schema + `crm.translations` + `db-meta` chain.

### Routing/proxy — zero new infra needed

`entityApiBase()` (`fe-v3/src/lib/api.ts:41`): `customer: 'crm'` → all generic
entity layers resolve `/ws/crm/api/v1/entities/customer/*`; BE mounts
`/ws/:serviceCode` proxy automatically from registration. E2E precedent:
`AI_BASE = "/ws/ai/api/v1/entities"` already in the suite.

### Translations — narrower than feared

`system.entities.customer.*` keys stay in `system.translations` — the
`system.entities.*` convention applies to entity field labels regardless of
owner (verified: `system.entities.job_schedule.fields.*` is system-owned too).
`crm.*` nav keys already live in `crm.translations` (0003 patch, 7 langs).

## Decisions (2026-10-26 — all resolved)

- **Q1 — module-owned FE. RESOLVED**: create + pipeline become `component_url`
  remotes in new `crm/fe/` — no form archetype exists yet (archetypes =
  list/detail/… per `metadata-driven-page-system`) and `kind:"page"` is never
  an archetype. The list stays `kind:"list"` — physical host page today, host
  archetype when that plan lands. (Task 10/10a)
- **Q2 — scope. RESOLVED**: ownership close only — the create page moves
  carrying its current stub content; the real create form is separate feature
  work. Entity API create is live and e2e-covered regardless.
- **Q3 — MCP. RESOLVED (no loss)**: generic tools + proxy dispatch are
  entity-agnostic; `registerMcpEntities` auto-discovers `customer` from
  crm's OpenAPI at registration (`handler_type: "proxy"`, RBAC by the
  microservice). Removal = delete the in-process `registerLocalEntity` +
  factory cases only. (Task 7)
- **Q4 — boundary. CONFIRMED**: entity API + table + code ownership + FE
  routing + e2e + docs; archetypes and docs-split stay separate and consume
  this result.

## Decisions (2026-10-26 session 2 — A1–A4)

- **A1 — export → SDK. RESOLVED (a)**: export becomes a first-class SDK op
  (task 1b) — `"export"` joins `EntityAction`, `EntityRouterConfig.export`
  + `schemas.exportQuery`, `EntityServiceLike.stream`, `streamEntityExport`
  + writers ported to SDK, `makeServiceRoutes` emits route + permission +
  `meta.actions` + OpenAPI op from the ONE decl. `STANDARD_OPS` already
  advertises `"export"` — the route completes the vocabulary.
- **A2 — display names. RESOLVED (final design)**: `public`/`custom` are
  cross-app **platform domains**, not module domains — `user_profiles` is
  platform infrastructure, so the display-name join is an INVARIANT and
  lives STATIC-HARDCODED in dal-v3. dal owns `UserProfileRefEntity`
  (read-only `public.user_profiles` projection — `AuditLogEntity`
  precedent); `entity-service.joinsFor()` auto-joins whenever
  `isAuditableEntity(meta)`; `userEntity` config param REMOVED;
  `user_profiles` = built-in always-shared table in `schema-domain`;
  COALESCE projections ("system"/orphan actors render). BE keeps
  `UserProfileEntity` for CRUD/routes — only its join-target role moves.
  Verified side-fact: `AuditLogEntity` declares no schema → audit rows land
  in the audited service's PRIMARY domain schema (`job.job_rules_audit`
  works today → `crm.customers_audit` automatically post-SET SCHEMA).
- **A3 — audit-transformer. RESOLVED (drop)**: `git log -S
  "transformAuditEntr"` across all history = only its creation commit
  `efd48a5`; never imported by any file in any commit — dead on arrival.
  Its consumer `customers_dal.ts` was deleted in the dal-pg migration.
  Version-history panel consumes `GET /:uuid/audit` raw rows +
  `changed_by_display_name` — transformer never in the chain.
- **A4 — debugCode. RESOLVED (drop)**: `PB_CUSTOMERS_FORCE_EMPTY|ERROR=1`
  env toggles in the BE `DomainService.list()` override — fake empty/500
  list responses for manual UI-state preview. User confirmed: never needed.
  Also unenforceable in US — env-policy bans `process.env` outside
  bootstrap.
- **entities_ns. RESOLVED**: `crm.entities.customer.*` in `crm.translations`
  (task 12) — the only coherent form per the job `entities_ns` precedent.

## Verified implementation contract (2026-10-26 — reference = ai + job-handler + emailsender)

**Service shell** — `createMicroservice({…, nav: X_NAV, routeHandler, dbPatches:{…, entityRegistry}, …})`.
crm already passes `nav: CRM_NAV` (index.ts:59); it lacks `routeHandler` and
exposes only `/health` + built-in surface today.

**Route surface** — `src/service-routes.ts`:
`makeServiceRoutes({info:{title, version: detectPackageIdentity().version ?? "0.0.0",
description}, serverUrl: "http://localhost:<http_port>", tags: [...],
entities: EntityRouteDecl[], rpc: [...]})` — ONE declaration produces routers
+ `/api/v1/openapi.json`; `.spec` is consumed by `scripts/build-docs-pack.ts`.
crm port = **3007** (`crm.config_entries` seeds `http_port`/`service_base_url`,
patch 0002); `DATABASE_SCHEMA=crm`.

**Entity decls** — `src/controllers/http/entities-route.ts` exports
`EntityRouteDecl[]` (SDK `src/http/service-routes.ts:46`, extends
`EntityRouterConfig`). Precedent: job-handler uses `readPerms`/`writePerms`
const arrays of `Permission.X`. Customer keeps its FULL literal perms from the
BE router — 12 ops: meta/list/export/create/duplicate/bulkDelete/bulkRestore/
get/update/delete/restore/audit. `schemas.{createBody,updateBody}` = real zod
from the ported `dto.ts` (NOT the `entityBody` permissive cast job uses —
customer ships a real contract). `duplicate`/`auditable` flags preserved.

**Service impl** — `modules/customers/customers.service.ts` =
`class CustomersService extends DomainService<CustomerRow>` (SDK-bound base —
`buildConfig()` injects `actor: requireActor`; `this.svc` composes the generic
EntityService lazily). cfg = `{entity, list: {searchableKeys, filterableKeys,
defaultSort, extraFilters}, hooks}` — the variation lives in config; domain
queries become methods using `this.dal.*`. NO `*Dal`/`*Repo` files (banned —
`dal-usage.md`), NO `makeEntityService` facade, NO `entity-repo.ts`.
`userEntity` arrives via `DalConfig.userEntity` default (task 1a/1c) — zero
per-module wiring.

**module-assets** — `src/controllers/http/module-assets-route.ts` is a
verbatim-copy convention (3-way diff: only chunk names/paths differ);
serves `fe/dist` with `no-cache` on predictable entry names.

**fe/ scaffold** — `fe/vite.config.ts`: canonical plugins `vendorPlane()`
(allowlist externals via SDK `resolveVendorSpecifier` + lucide barrel rewrite
+ emit gate), `stylesheetStub()` (empty `.css` for the host probe),
`depsManifest()` (`<chunk>.deps.json` + `<chunk>.sha256`) — chunk name
hardcoded in ~5 places (fileName/cssFileName/stub/manifest/plugin names).
`fe/tsconfig.json` verbatim. `fe/src/index.ts`: `mountPage(el, ctx:
ModulePageHost)` (+`mountSheet` if sheets) → `mountModuleContent(el, ctx,
Component)` from `@primebrick/ui/remote-mount`; detail-route uuids arrive via
`ctx.components.params`. `fe/src/host-contract.ts`: remote-side view of
`ctx.components`/`ctx.mount_host`.
`bindRemoteCtx(ctx, {service:'<code>'})` — used ONLY where the remote needs
service-scoped bridges (i18n own-schema/service-api/notify/sheet/step-up):
ai yes, job/emailsender no — **crm needs it** (`crm.pipeline.*` keys live in
`crm.translations`).
Dispatch micro-variance (same contract): ai `PAGES` map / job ternary /
emailsender `startsWith` → chosen **PAGES map**; hardening candidate =
`makePageDispatcher(PAGES)` helper in `@primebrick/ui` + lint.

**Build chain** — `prebuild`: `version-sync && check:standards && db:check &&
generate:docs && fe:build`; `fe:build` = `vite build fe`; `fe:check` =
`cd fe && svelte-check`; `fe/dist` is git-ignored (built, never committed).
fe deps pinned identically across services: `@primebrick/ui workspace:*`,
`svelte 5.57.2`, `svelte-check 4.3.4`, `vite 8.3.4`,
`@sveltejs/vite-plugin-svelte 7.3.1`.

**Nav remote fields** — `component_url: "/ws/<code>/api/v1/module-assets/
<chunk>.js"` + `component_format: "esm-mount"` on `routes[]` entries
(AI_NAV/JOB_NAV verbatim format); `sheets[]` keys are `<code>.<name>`
namespaced. `validateNavDeclaration` runs at enrollment AND via
`src/__tests__/nav-declaration.test.ts` (crm has it — free regression net).

**MCP** — fully dynamic: `registerMcpEntities` on service registration →
`discoverEntitiesFromService` fetches `/api/v1/openapi.json` →
`registerProxyEntity(code,…)`. crm exposing `customer` via makeServiceRoutes
auto-registers it as `handler_type:"proxy"`. BE work = delete
`registerLocalEntity("be", customer)` + the in-process factory `case`s.

## Derived findings (recorded for follow-up)

- `ENTITY_SERVICE_MAP` (`fe-v3/src/lib/api.ts:41`) is a hardcoded
  entity→service map — every service-owned entity must be added by hand.
  The census (`service_registry.endpoints.nav` → entity fields on routes,
  or a dedicated entity→service resolution) should own this; candidate
  hardening in `metadata-driven-page-system` / module-discovery work.
- `service-lifecycle-subscriber` MCP discovery retries only on registration
  — if crm registers before exposing entities, `registeredServices.add(code)`
  marks it done and customer stays invisible to MCP until next restart.
  Worth verifying during task 13 verification (registration order).
- **US display-name gap (global)** — zero US service injects `userEntity`;
  every `created_by_name`/`updated_by_name`/`changed_by_name` returns NULL
  today. Fixed by tasks 1a/1b/1c for all four services — display names
  appear on job/emailsender/ai entities too (behavioral change = fix, not
  break).
- **Validator gap (already noted)**: enrollment validates route SHAPE but
  not `entity` ∈ service `entityRegistry` — crm's `entity: "customer"`
  passed while registered entities held only `config_entry`. Hardening
  candidate: SDK `validateNavDeclaration` cross-check vs registry.
- `userEntity` join target IS domain-checked — `field()` resolution calls
  `resolveEntitySchema` (`entity-decorators.ts:599`), `sharedTables` exempts
  by `meta.tableName` (`schema-domain.ts:93`). `user_profiles` becomes the
  2nd governed shared table after `translations`.
