# Access axis `access.{app}.{module}.{page}` + single `/modules` discovery payload

> Continuation of the module-ownership / breadcrumb / `label_key` workstream.
> Two coupled changes: (A) consolidate the three nav-data endpoints into ONE
> access-filtered discovery payload; (B) introduce the hierarchical
> `access.{app}.{module}.{page}` grant grammar — same permission pipeline as
> entity RBAC, separate vocabulary, `is_admin` inherits `access.system.*` only.

## Status: � DONE — Plan date: 2026-10-21 01:47 UTC / 03:47 CEST · updated 04:40 UTC

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | BE: `ModuleInfo`/`ModuleNav` payload gains `home` (per-root `nav[0].href`), `nav`, `routes` — emitted by `/api/v1/modules` | ✅ done | 2026-10-21 | `ModuleDiscoveryService.list(user)` — one payload feeds launcher+sidebar+breadcrumb+census |
| 2 | BE: `/modules` demoted to `AUTHENTICATED_USER` + per-module/nav/route access filtering via grants (`access.*` namespace) | ✅ done | 2026-10-21 | filter server-side, deny-first; FE never sees what you can't reach |
| 3 | BE: `access` requirement fields on `ModuleNavWithPrefixes`/`PageRouteDeclaration`/`ModuleNavLink` + validator (`validateNavDeclaration`) | ✅ done | 2026-10-21 | keys namespace-enforced to `access.{partOf}.{code}` (collapse when `part_of === code`) |
| 4 | BE: `isAccessGranted(grants, is_admin, key)` — admin implies `access.system.*` ONLY, all other roots explicit | ✅ done | 2026-10-21 | lives in SDK `src/auth/access.ts`, exported; BE consumes via `@primebrick/sdk` |
| 5 | BE: settings `MODULE_NAV` declares `access: "access.system.settings"`; job/crm declare their own `access.*` on registration payload | ✅ done | 2026-10-21 | settings declared; job/crm undeclared = open (backward compat) |
| 6 | BE: retire `/modules/:code/meta` (hard cut) — FE reads nav from `/modules` | ✅ done | 2026-10-21 | removed from index.ts |
| 7 | BE: retire `/system/routes` — census derived client-side from the modules payload (`routesCensusFromModules`) | ✅ done | 2026-10-21 | `routes-census.service.ts` deleted; Guide `search_routes` + remote `component_url` + create-CTA derive from one payload |
| 8 | FE: `shellNav` stores the enriched payload; `module_nav` per module read from it — no second fetch, kills the async-nav race | ✅ done | 2026-10-21 | `fetchModuleMeta`/`fetchRoutesCensus` removed; `selectModule` is sync on the payload |
| 9 | FE: `hasAccess(key)` helper wrapping `isPermissionGranted` + admin-system-only rule | ✅ done | 2026-10-21 | `src/lib/permissions.svelte.ts` — mirrors SDK evaluator locally (no SDK import in FE) |
| 10 | FE: module breadcrumb segment becomes dropdown — items = sibling modules' `home[root]` via `modulesForRoot` | ✅ done | 2026-10-21 | `moduleBreadcrumbSegments` emits module menu + page menu; symmetric Finder |
| 11 | SDK/validators: `access` field accepted on register payload nav/routes (service-declared) | ✅ done | 2026-10-21 | core `PageRouteDeclaration`/`ModuleNavLink`/`ModuleNavDeclaration` carry `access?`; register path preserves `endpoints.nav` verbatim |
| 12 | E2E: normal-user role (`test-role`) sees only granted modules; admin sees system via inheritance; module dropdown switches module | ✅ done | 2026-10-21 | `access-filtering.spec.ts` 5/5 green; ephemeral `e2e_user` actor minted in globalSetup (+Redis role-mapping cache bust) |
| 13 | Docs sync: module-navigation.mdx + app-page-breadcrumb.mdx (access grammar + module dropdown + single endpoint) | ✅ done | 2026-10-21 | module-navigation.mdx (access axis + consumers), app-shell.mdx (consolidated payload + launcher semantics), sdk authentication.mdx (`isAccessGranted`), api-reference regenerated (sdk + core) |
| 14 | Commits | done | 2026-10-21 | core `e901b39` . sdk `f5cc093` . be `ce1e616` . fe `fe5ecaa` . workspace `c94d86d` |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — the API overlap (today, verified)

Three endpoints project the same source (`service_registry` row +
`resolveModuleNavMeta`):

- `GET /api/v1/modules` — `MODULES_READ_ALL` (accidentally admin-only: a
  normal role without `modules.read.all` gets 403 and the whole shell
  dies). Emits registry fields + `route_prefixes`. **No nav.**
- `GET /api/v1/modules/:code/meta` — `MODULES_READ_ALL`. Emits
  `{module, nav, routes, label_key}` for one module. Fetched lazily per
  selected module (shell nav, launcher pages column, safe-home, crm
  loader).
- `GET /api/v1/system/routes` — `AUTHENTICATED_USER`. Flattens
  `routes` + nav hrefs + owning module (30s in-process cache). Used by
  the Guide `search_routes` tool, remote-page `component_url` resolution,
  and entity-list create-CTA derivation.

Costs of the split: 1+N fetches, nav arriving after first paint (the
breadcrumb race already had to be patched), sibling-module homes
unavailable (why the module segment is a bare link today), and the route
census exposed to every authenticated user even for modules they can't
see.

`/api/v1/system/services*` stays separate on purpose: that is the admin
CRUD plane over `service_registry` — not discovery data.

## Part B — consolidation

`GET /api/v1/modules` becomes THE discovery document:

```ts
{
  id, name, label_key, icon, part_of, is_default, is_reserved, enabled,
  route_prefixes: string[],
  home: Record<root, string>,   // nav[0].href of each root slice, post-filter
  nav: ModuleNavLink[],         // access-filtered
  routes: ModuleRouteDecl[],    // access-filtered
}
```

- `/modules/:code/meta` retired — `shellNav` derives `moduleNav` from the
  boot payload (same object the launcher already holds).
- `/system/routes` retired — `routesCensusFromModules(modules)` flattens
  `{...decl, module}` client-side; identical output, already filtered.
- `home` per root = `nav[0].href` **of the access-filtered slice** — the
  home is the first page you're actually allowed to see.
- One service function produces the projection (`ModuleDiscoveryService`
  or extend `ServiceRegistryService`); the endpoint is a thin controller
  over it.

## Part C — the `access.*` grammar

Hierarchical grant grammar, deny-first, wildcards at every level — same
`isPermissionGranted` wildcard matcher the entity grammar already uses:

```
access.{app}.{module}.{page}
access.system.*            → the whole System app
access.system.job          → Job module (all pages)
access.system.job.*        → same, explicit
access.system.job.rules    → one page (nav item id)
```

Root collapse mirrors the URL rule: when `part_of === code` the module
segment collapses, so a crm page is `access.crm.customers`
(`{app}.{page}`, module==root) — not `access.crm.crm.customers`.

Concrete mapping to the agreed scenarios:

- admin sees System → `is_admin` implies `access.system.*` (built into the
  evaluator, not a role grant)
- normal user sees only Job → grant `access.system.job`
- only some Job pages → grant `access.system.job.runs` etc.; a page grant
  implies the module row shows (module visible iff ≥1 reachable page)
- entity API yes, page no → `customer.read.*` without `access.crm.customers`
  — independent axes by construction
- RPC-only service → declares `access.system.myservice.mypage` on routes,
  no fake entity

**is_admin rule:** `is_admin` bypass stays for entity RBAC unchanged. For
the access axis the evaluator hardcodes: `is_admin` ⇒ granted
`access.system.*` — and NOTHING else. `access.crm.*`, `access.shop.*`…
require explicit role grants even for admins.

**Defaults:** a module/nav-link/route without `access` is visible to any
authenticated user (backward compat — everything is open today). First
non-open declaration: settings gets `access.system.settings` in the
static `MODULE_NAV` (admin-only effectively, via inheritance).

**Server-side filtering** (never trust the client): the `/modules`
handler filters modules (drop entirely if unreachable), then nav[] and
routes[] per-page. `home` computed after filtering. Backend API routes
keep their own `rbacHandler` — access.axis is the discovery plane, not
API enforcement.

**FE:** `hasAccess(grants, is_admin, key)` mirrors the BE rule. Launcher,
sidebar, breadcrumb, safe-home all read the already-filtered payload —
no extra client filtering for discovery; the helper still guards
direct-route edge cases.

## Part D — breadcrumb module dropdown

With `home` in the payload the module segment becomes a menu segment:
items = `shellNav.modulesForRoot(root)` mapped to `{label:
resolveModuleLabel(m), href: m.home[root], icon: m.icon}` — dropdown
renders when the root has >1 module. Symmetric with root and page menus.
`moduleBreadcrumbSegments` gains the third segment shape internally;
pages still write the same one-liner.

## Part E — migration & acceptance

- New role_mappings rows grant `access.*` as needed; existing rows
  unchanged (default-open keeps behavior identical for entities/pages
  that declare nothing).
- Acceptance: `test-role` user logs in → sees only modules/pages granted;
  admin sees System subtree via inheritance, NOT crm unless granted;
  `/system/job/*` URLs still 403 for unauthorized (API rbac unchanged);
  breadcrumb module dropdown navigates to sibling module homes; suite
  `module-ownership` + `jobs-pages` green.
