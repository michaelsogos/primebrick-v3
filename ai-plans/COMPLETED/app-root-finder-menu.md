# App root level = "Applicazione" — declared default module + Finder-style cascade switcher

> Continuation of `module-root-level-system-routes.md` (done).
> A root level IS an application: `system` = internal core app, `crm` =
> another app. `part_of` stays **open** — any registered service may declare
> any root level; a new `part_of` value automatically produces a root entry
> (no core-only guard: external modules may legitimately live under
> `system`, e.g. settings-like pages of a third-party service).
> Selecting an app loads its DECLARED default module and that module's
> default page (`nav[0].href`) — same default-chain semantics as today.
> The root dropdown becomes a macOS-Finder-style 3-column menu
> (Apps → Modules → Pages) that REPLACES the separate module switcher.

## Status: 🟢 DONE — Plan date: 2026-10-21 08:40 UTC / 10:40 CEST

| # | Task (detail level) | Status | When | Notes |
|---|---------------------|--------|------|-------|
| 1 | BE patch: `service_registry.is_default boolean NOT NULL DEFAULT false`; backfill `settings`→true (system default), `crm`→true (crm default) — signed | ✅ done | 2026-10-21 | `20261021020000_service_registry_is_default.sql` signed+applied |
| 2 | BE register: accept `is_default` in payload → stored; conflict policy = keep existing winner, incoming demoted to `false` + warn (never reject registration — a default flag must not kill a service boot) | ✅ done | 2026-10-21 | `service-lifecycle-subscriber.ts` — upgrade-only claim |
| 3 | BE `/api/v1/modules` emits `is_default`; `updateService` admin path can flip it (with same ≤1-per-part_of enforcement on the write path) | ✅ done | 2026-10-21 | index.ts + service-registry.service.ts |
| 4 | SDK: `ServiceRegisterPayload.is_default?` + `createMicroservice` option `isDefault?` | ✅ done | 2026-10-21 | service-lifecycle-subjects + service-registrar + create-microservice |
| 5 | US: job-handler declares `isDefault: true`? — NO: default of `system` is `settings`. Only declare when a service should be its root's landing app | ✅ done | 2026-10-21 | no code needed — DB backfill covers |
| 6 | FE `ModuleInfo.is_default`; `shellNav.defaultModuleForRoot(root)` | ✅ done | 2026-10-21 | api-types + modules-shell |
| 7 | FE Finder cascade: `SidebarAppLauncher.svelte` — 3 columns [Apps \| Modules \| Pages]; hover previews; click app → `is_default` module → first page under that app; click module → home under previewed app; click page → direct goto | ✅ done | 2026-10-21 | Popover-based (not DropdownMenu); lazy `fetchModuleMeta` + `loadModuleTranslations` per hovered module |
| 8 | FE: unmount `SidebarModuleSwitcher` + `SidebarRootSwitcher` (cascade replaces both) — files deleted, not kept as dead exports | ✅ done | 2026-10-21 | AppSidebar.svelte |
| 9 | FE E2E: cascade columns; app click → declared default; module click → home under that app; multi-root slice scoping; existing ownership suite updated (launcher testids) | ✅ done | 2026-10-21 | module-ownership 7/7, jobs 13/13, migrations 3/3 = 23/23 |
| 10 | Docs: module-navigation.mdx (extra-prefix + is_default contracts), app-shell.mdx (cascade), app-page-breadcrumb.mdx (route-derived root), extractions rerun | ✅ done | 2026-10-21 | FE sveld 359/0, BE generate:docs |

### Multi-root experiment (added mid-flight, user request)

"Un piede in 2 scarpe" — crm declares `route_prefixes: ["/crm", "/system/crm"]`
and moved pipeline to `/system/crm/pipeline` (nav + census updated).
Validator: primary prefix required, extras must be `/{root}/{code}` —
code stays the URL's second segment under every root. FE semantics:
- `roots` = `part_of` ∪ first segment of every declared prefix.
- `modulesForRoot(root)` = `part_of` members + extra-prefix members.
- `rootForRoute(pathname)` = URL's first segment when it's a known root —
  the shown app is where the page LIVES, not where the module registered.
- Sidebar nav + breadcrumb module menu + launcher Pages column are all
  scoped to the route's root (a multi-root module only shows its slice).
- `is_default` claims apply only to the module's OWN `part_of` root.

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Bugfixes already applied this session (pre-plan)

- **pt-PT missing**: seed `20261021003000` covered 6 langs, convention is 7 —
  new patch `20261021010000_root_level_ptpt_and_app_label.sql` adds pt-PT and
  relabels `app.nav.rootLevel` → "Applicazione"/"Application"/… per user's
  app semantics. Signed + applied.
- **`/crm/customers` empty**: all 172 `public.customers` rows were
  soft-deleted (bulk deletes by E2E actors on 2026-09-30 and 2026-10-19) —
  table correctly rendered 0, no hidden error. All 172 restored via
  `deleted_at/deleted_by = NULL, version+1`.

## Design

### `is_default` contract

```ts
// SDK — service registration options
{ code: 'crm', partOf: 'crm', isDefault: true }  // → service_registry.is_default
```

- **One default per root level**, enforced as a soft invariant:
  - register: if another enabled module in the same `part_of` already holds
    `is_default`, the incoming flag is stored as `false` + warn log — the
    service still registers (a display preference must never gate a service).
  - admin flip via modules page: setting `is_default=true` demotes the
    previous holder in the same `part_of` (single transaction).
- **Fallback**: `modulesForRoot(root).find(m => m.is_default) ?? modulesForRoot(root)[0]`
  — a root with no declared default still lands somewhere sane.
- Backfill: `settings`=true (system root → Settings is the landing app of
  the core app), `crm`=true (crm root → CRM module).

### Finder cascade (replaces root + module switchers)

```
[trigger: <icon> {current app label} ⌄]
┌───────────┬──────────────┬─────────────────┐
│ Apps      │ Modules      │ Pages           │
│ ▸ System  │ ▸ Settings   │ ▸ Profile       │
│ ▸ CRM     │   Job Handler│ ▸ Users         │
│           │   AI         │ ▸ …             │
│           │ ▸ Email S…   │                 │
│           │   Webhook    │                 │
└───────────┴──────────────┴─────────────────┘
```

- Columns populated by hover (Finder semantics) — hovered app previews its
  modules; hovered module previews its `nav[]` pages (lazy `fetchModuleMeta`
  per module, cached in shell state; a module with no nav → pages column
  shows nothing / disabled state).
- Click app → select root + declared default module + `goto(nav[0].href)`.
- Click module → select module + `goto(nav[0].href)`.
- Click page → select root+module + `goto(page.href)`.
- Current selections highlighted in all three columns.
- The module switcher component is unmounted from the sidebar; the
  sidebar nav tree below still reflects the selected module (unchanged).
- i18n: trigger aria-label stays `app.nav.rootLevel` ("Applicazione");
  column headers reuse existing keys — no new keys needed except an
  optional `app.nav.apps` column header (decide in impl; keep minimal).

## Acceptance

- `/crm` app select → lands on `/crm/customers` (declared default crm →
  `nav[0].href`), not "first in array".
- `/system` app select → lands on settings default page.
- Cascade menu shows live modules+pages for each app; click-through works.
- Sidebar has ONE selector; module still auto-resolves from route (unchanged
  `syncModuleFromRoute`).
- pt-PT + "Applicazione" labels visible.
- svelte-check 0/0 · eslint clean · E2E green incl. updated ownership spec.

---

## Follow-up (2026-10-21 late): `label_key` unification + "Vai a"

Status: 🟢 DONE — verified E2E 20/20.

User-approved option (a): `service_registry.label_key` as the single
localized module-name source, consumed by EVERY surface.

- **DB**: `service_registry.label_key VARCHAR(255)` (patch
  `20261021030000` — backfill settings→`system.settings.title`,
  job→`job.module.name`, crm→`crm.module.name`); `app.nav.goTo` seeded
  in all 7 languages (patch `20261021031000` — "Vai a"/"Go to"/…).
- **BE**: entity + `ServiceRegistryEntry` + FULL_PROJECTION + register
  payload field (`registerFields.label_key`) + `/modules` and
  `/modules/:code/meta` emit + admin `PUT /services` zod whitelist.
- **SDK**: `labelKey` option on `createMicroservice`/`ServiceRegistrarConfig`
  → `label_key` in service.register.
- **US**: job declares `job.module.name`, crm declares `crm.module.name`;
  both keys seeded in the service-owned `*.translations` schemas.
- **FE**: `resolveModuleLabel(m, t)` in `$lib/shell/module-label` —
  `t(label_key)` with `name` as the only fallback (unresolved key ⇒ miss).
  Consumers: launcher trigger + Modules column, `moduleMenuSegment`
  (breadcrumb), settings modules admin list + `[code]` detail breadcrumb
  and h1. CTA aria-labels + keyboard footer moved to `app.nav.goTo`;
  `app.nav.open` kept on the sidebar open-trigger (literal action there).
- **E2E**: launcher rows expose `data-app-root`/`data-module-id`
  (label-agnostic selection); contract asserts the LOCALIZED label via
  `expectedModuleLabel` (same dict endpoint the shell uses).

### Incident note — degraded latch

While landing this, the job service went DEGRADED: a `bun --hot` reload
fired between writing `0013_job_module_label.sql` and signing its
MANIFEST (~90s window) → fail-closed "not in MANIFEST" at boot →
degraded latch (domain routes 503) until remediation. Diagnosed via
`/db-migration/status` (`last_error`), recovered by a plain hot reload
once the manifest was valid. Lesson: **sign the manifest immediately
after writing a patch** — the file is live the moment it lands in
`db-meta/patches/` on a hot-reloaded service.
