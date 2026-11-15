# Module root level (`part_of`) + uniform module routing, breadcrumbs, toolbar create CTA

> User-requested unification: every service is a module under a ROOT LEVEL.
> System services (settings, job, ai, emailsender, webhook) live under
> `system`; CRM is its own root level. URL = `/{part_of}/{code}/...`
> (code verbatim — `/system/job`, `/crm/customers`). Hard cut — no legacy
> redirects. Sidebar gains an always-visible root-level selector.
> Breadcrumb becomes `{root} / {module} / {Page} | {Entity} / {Page}`.
> Also: NEW-entity CTA becomes meta-driven inside the table toolbar —
> page-level `headerActions` CTAs are retired on entity pages.

## Status: 🟢 DONE — Plan date: 2026-10-21 00:15 UTC / 02:15 CEST — verified 2026-10-21 (svelte-check 0/0 · eslint clean · check-standards clean ×7 · db:check clean · E2E 21/21)

| # | Task (detail level) | Status | When | Notes |
|---|---------------------|--------|------|-------|
| 1 | BE patch: `service_registry.part_of` text NOT NULL; backfill settings/job/ai/emailsender/webhook→`system`, crm→`crm` — signed | ✅ done | 2026-10-21 | `20261021001500_service_registry_part_of.sql` + signed MANIFEST |
| 2 | BE registration: `part_of` declared in register payload → stored; validate `endpoints.nav.route_prefixes` ⊆ `/{part_of}/{code}` and every `nav[].href`/`routes[].route` starts with it | ✅ done | 2026-10-21 | `validateNavDeclaration(code, decl, partOf)`; collapse rule when `part_of===code` (`/crm`, not `/crm/crm`); 6 unit tests |
| 3 | BE `/modules` response emits `part_of` per module (for sidebar grouping + breadcrumb) | ✅ done | 2026-10-21 | `index.ts` modules assembly |
| 4 | BE MODULE_NAV settings: `/system/migrations` → `/system/settings/migrations` (own prefix rule); `route_prefixes` → `["/system/settings"]` | ✅ done | 2026-10-21 | `/system` catch-all removed |
| 5 | BE i18n: root-level label keys (`system`, `crm`) — system-owned namespace | ✅ done | 2026-10-21 | `20261021003000_seed_translations_root_levels.sql` |
| 6 | US job-handler: `part_of:"system"` at register; nav/routes → `/system/job`, `/system/job/runs`, `/system/job/rules`, `/system/job/new`, `/system/job/rules/new` | ✅ done | 2026-10-21 | `src/index.ts`; remote chunk dispatch updated |
| 7 | US crm: `part_of:"crm"`; nav/routes → `/crm/customers`, `/crm/pipeline` | ✅ done | 2026-10-21 | service index |
| 8 | US ai/emailsender/webhook: `part_of:"system"` in registration payloads | ✅ done | 2026-10-21 | no nav today |
| 9 | FE route moves (hard cut): `(app)/jobs/*`→`(app)/system/job/*`; `(app)/system/customers*`→`(app)/crm/customers*`; `(app)/crm/pipeline` stays; `(app)/system/migrations`→`(app)/system/settings/migrations` | ✅ done | 2026-10-21 | all goto/href literals swept; legacy shims deleted |
| 10 | FE `ModuleInfo` gains `part_of`; `resolveModuleIdFromPrefixes` resolves `/{part_of}/{code}` | ✅ done | 2026-10-21 | `api-types.ts` + `modules-shell.svelte.ts` |
| 11 | FE sidebar: root-level selector (always visible) above module switcher; module list filtered by selected `part_of` | ✅ done | 2026-10-21 | `SidebarRootSwitcher.svelte` |
| 12 | FE breadcrumb: prepend root segment → `System / Job Handler / Schedules`; module segment keeps dropdown; page leaf = longest-match nav item | ✅ done | 2026-10-21 | auto-prepend in `AppPageBreadcrumb`; manual `app.system` segments removed |
| 13 | FE create CTA: derive createPath from census `kind:"create"` route for the entity; label/icon from census route — `headerActions` create retired on jobs + customers pages | ✅ done | 2026-10-21 | `create_cta` prop chain; `PageRouteDeclaration.label_key/icon` |
| 14 | FE E2E: update all paths; assert root selector, `System / Job Handler` breadcrumb, toolbar NEW on /system/job + /crm/customers | ✅ done | 2026-10-21 | **21/21 green** (jobs 13 + migrations 3 + ownership 5) |
| 15 | Docs sync: module-navigation.mdx (part_of + namespace), entity-list-table.mdx + patterns.md (census-derived CTA), adding-a-service.mdx (partOf), settings.mdx + i18n/patterns/rules path sweep, app-shell.mdx + app-page-breadcrumb.mdx (root switcher/segment), navigation-map.mdx regenerated | ✅ done | 2026-10-21 | extractions rerun: fe 360/0, be generate:docs, core api.json |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Part A — Answers to user's questions (verified, not assumed)

### A1. Is `job_schedule` deletable? — **No, and the missing toggle is correct**

`JobScheduleEntity extends Auditable(EntityBase)` — no `Deletable()` mixin
(`us-v3/job-handler/src/domain/entities/job_schedule_entity.ts:21`) → no
`deleted_at`/`deleted_by` columns → `hasSoftDelete` in
`EntityListTable.svelte:152` is false → `DeletionFilterToggle` correctly
hidden; the `/jobs` page also passes `deletionFilter={false}` (skips the
`deleted_records` count query). Schedules arm/disarm via `status`, not
soft-delete. Adding soft-delete would be a DAL change (`Deletable` mixin +
columns patch + meta columns), not a UI bug.

### A2. Two create-CTA standards — motivation + unification path

Both mechanisms already coexist in `EntityTablePage`:
- **Toolbar create** (`onCreateAction` → `entity-create-cta` labeled button
  in `EntityListToolbar:134`): gated by `opAllowed('create.single')` +
  page prop `createPath`. Used by `/jobs/rules` → remote `RuleFormPage`.
- **`headerActions` snippet**: free-form slot beside the title. `/jobs`
  uses it for the "Schedule" CTA (domain label `job.jobs.scheduleNew` →
  remote workflow `/jobs/new`); `/system/customers` uses it for a generic
  "New" — gratuitous duplication.

**Unification (chosen)**: the route census already declares
`kind:"create"` routes per entity (`/system/job/rules/new` for `job_rule`,
`/system/job/new` for the schedule workflow). `EntityTablePage` can derive
`createPath` from the resolved module's `routes` census — no page prop.
Label/icon come from meta (`actions` entries already carry
`translation_key`/`icon` for custom actions — extend to the `create`
op or add `table.create_label_key`). Result: NEW always in toolbar,
meta-driven, `headerActions` retired on entity pages (prop kept for
genuinely bespoke extras).

### A3. Route chaos confirmed by live data

`service_registry` today: `crm` nav mixes `/system/customers` +
`/crm/pipeline`; `job` uses `/jobs/*`; `settings` is `/system/settings`.
`code` already = module code; `endpoints.nav.route_prefixes` already =
declared FE prefix. Only missing piece: the root level.

## Part B — Design (existing architecture only)

### B1. `service_registry.part_of` — the ROOT LEVEL

- New column `part_of text NOT NULL` — declared by the service in its
  registration payload (self-declaration → registry row = single source).
  Reserved `settings` seed row backfilled to `'system'` via patch.
- **No default** — a service must state its level explicitly (data-model
  rule: no fake config defaults).
- Module route prefix is DERIVED, never free-declared:
  `/{part_of}/{code}` → `/system/job`, `/system/settings`, `/crm/customers`.

### B2. Registration validation (`validateNavDeclaration`, `module-nav-meta.ts`)

- Require `part_of` in the register payload.
- `route_prefixes` must equal `["/{part_of}/{code}"]` (one prefix per module).
- Every `nav[].href` and `routes[].route` must start with
  `/{part_of}/{code}`.
- Consequence already flagged to user: settings' own
  `/system/migrations` violates its `/system/settings` prefix → moves to
  `/system/settings/migrations`.

### B3. Route + nav changes per module

| Module | part_of | Old paths | New paths |
|--------|---------|-----------|-----------|
| settings | system | `/system/settings/*`, `/system/migrations` | `/system/settings/*`, `/system/settings/migrations` |
| job | system | `/jobs`, `/jobs/new`, `/jobs/runs`, `/jobs/rules`, `/jobs/rules/new` | `/system/job`, `/system/job/new`, `/system/job/runs`, `/system/job/rules`, `/system/job/rules/new` |
| crm | crm | `/system/customers`, `/crm/pipeline` | `/crm/customers`, `/crm/pipeline` |
| ai / emailsender / webhook | system | (no nav) | `part_of` declared, no routes yet |

Hard cut — no redirect shims. `nav[0].href` stays the module-home source
(`/system/job`, `/crm/customers`).

### B4. Sidebar

Root-level selector above the existing module switcher — always visible
(roots: `System`, `CRM` from day one). Selecting a root filters
`shellNav.modules` by `part_of`; selecting a module behaves exactly as
today (only that module's declared nav pages). Root labels via i18n keys.

### B5. Breadcrumb

`{root_label} / {module_menu_segment} / {page_leaf}`:
`System / Job Handler ▾ / Schedules`, `CRM / CRM ▾ / Customers`,
`System / Job Handler ▾ / Job Rules / New`. Root segment prepended in
`AppPageBreadcrumb`/`moduleMenuSegment`; module segment unchanged
(longest-match current item already implemented); remote-mounted pages get
the root segment through the existing mount-host breadcrumb API.

### B6. NEW CTA meta-driven in toolbar

- `EntityTablePage` derives `createPath` from `moduleNav.routes` where
  `kind:"create"` and `entity` matches (falls back to explicit `createPath`
  prop during transition).
- Create button label/icon: meta-driven (action `translation_key`/`icon`
  on `create`, else generic `system.entities.list.new`).
- Retire `headerActions` create usages (`/system/job`, `/crm/customers`);
  prop stays for non-create extras.
- Also fix: `/jobs` today lacks the toolbar create at all (headerActions
  instead) → after unification `/system/job` gets a proper toolbar
  "Schedule" CTA pointing at the remote workflow page.

## Part C — Impacts & verification

- **E2E**: every path in `jobs-pages.spec.ts` changes (`/jobs`→`/system/job`
  etc.); census ownership tests assert the new prefixes; new assertions for
  root selector + breadcrumb; CTA assertions move to toolbar
  `entity-create-cta`.
- **i18n**: root labels (`system`, `crm`) need keys — system-owned
  namespace (roots are cross-module); module labels unchanged.
- **API paths unchanged**: `entityApiBase`/`/ws/job` are transport routes,
  not UI routes.
- **DB**: one signed patch (`part_of` + backfill + translations seed).
- **Checks**: svelte-check, eslint, check-standards (be/us), db:check,
  Playwright suite.
- **Docs**: module-navigation.mdx (root-level model), entity-metadata.mdx
  (create CTA), adding-a-service.mdx (`part_of` declaration), extraction
  rerun via make-docs.
