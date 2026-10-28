# Per-service user-guide docs generation (repo-local, metadata-driven)

> Sub-plan extracted from `metadata-driven-page-system.md` deferred items
> **D2** (user-guide pipeline stale — must read declared routes, not scan FS),
> **D4** (per-service page-doc render — cross-repo forbidden by design) and
> **D5** (ghost `[...path]` emission). Every claim below was verified
> empirically on 2026-10-26 against source, live regeneration, and DB schema.

## Status: 🔴 BLOCKED — Plan date: 2026-10-26 14:54 UTC

> **Blocked on `metadata-driven-page-system.md`** (the plan governing the new
> page archetypes). The archetype metadata — incl. form-field declarations —
> is the intended source for create/edit doc facts; generating before it
> lands would build throwaway extraction machinery. Completable after that
> plan; too early to execute now.
>
> **Dependency chain refined 2026-10-28:** concretely, task 5 waits on the
> `page_props.form`/`FormPageDecl` contract reaching coverage parity — piloted
> for `job_rule` create (`entity-form-archetype-pilot.md` ✅) but not yet
> generalized across entities (`metadata-driven-page-system` tasks 3, 8, 18
> still open). The `description_key` route-level contract (task 2 input) is
> already live census-side via `root-page-skeleton`. Nothing else in this
> plan blocks other work — it is a leaf consumer.
>
> **Decisions 2026-10-26** (all five resolved):
> Q1 → wait for `metadata-driven-page-system` — form facts come from the
> archetype metadata it produces; no interim extractor.
> Q2 → docs follow ENTITY ownership; paths from the census in
> `service_registry.endpoints.nav`; declarer≠owner is a contract violation
> (crm→customer is documented debt, migration planned per its index.ts).
> Q3 → standalone generated page per `kind:"page"` route AND per declared
> sheet (same dignity as CRUD create/update pages).
> Q4 → shared engine in `@primebrick/sdk`, thin script per service.
> Q5 → entities without nav routes are documented *through* their managing
> surfaces — the console page + sheet pages (Q3) — no separate entity page.

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | SDK shared engine `src/docs-gen/`: port extract+render logic (901+229 lines) parameterized `{meta_globs, router_globs, nav_decl, fe_src_dir, translation_schemas, out_dir, service_code}`; hard repo-root guard — `path.resolve` prefix check fails the run if any input escapes the repo root (enforcement, not verification) | ⏳ | — | Precedent: `src/docs-pack/build-docs-pack.ts` is already the SDK docs home |
| 2 | Census adapter: enumerate pages from DECLARED routes — service `src/nav-declaration.ts` imported as TS (generator runs inside owning repo, bun/tsx loads TS natively) + BE `module-nav-meta.ts` `MODULE_NAV`; kinds `list/detail/create/page`; never scans `routes/` FS | ⏳ | — | Replaces `docs-extract`'s `FE_DIR` walk — kills D2 root cause |
| 3 | Entity/route-fact collectors: parse BOTH declaration shapes — BE `makeEntityRouter({entityName, permissions:{…Permission.X literal}, metaExtraScans, extraScans})` and US `entities-route.ts` `EntityRouteDecl[]` (perms via `readPerms`/`writePerms` const identifiers → resolver must follow identifier→array, not only literal `Permission.X`) | ⏳ | — | Verified: `job-handler/src/controllers/http/entities-route.ts` uses `meta: readPerms` — literal-only regex silently loses perms |
| 4 | Service-local remote extraction: `component_url` routes → `<svc>/fe/src/pages.ts` `PAGES` dispatch map → mapped `.svelte` AST scan (same fact set as today's extract); sheets via `nav.sheets[]` keys → sheet components | ⏳ | — | Verified: `ai/fe/src/pages.ts` `PAGES` is the route→component truth, same-repo |
| 5 | **[BLOCKED on parent plan]** Form-field facts for create/edit pages — source = the archetype/form metadata produced by `metadata-driven-page-system` (Q1 resolved as: wait for it, build no interim extractor) | ⏳ | — | Byte-parity of `users-create/edit` Fields table achievable only with `meta.form`-grade declarations |
| 6 | Per-service thin script `scripts/generate-page-docs.ts` + wire into `generate:docs` BEFORE `build-docs-pack`: be-v3, ai, job-handler, emailsender; crm/webhook only if a docs surface exists | ⏳ | — | `buildDocsPack` already `cpSync`s whole `docs/` → `generated/` ships automatically via existing prebuild + `ServiceRegistrar` `docs_pack` advertisement |
| 7 | Translations: per-service schema scope `[own_schema, system, public, custom]` (own first — first-writer-wins on `??=`), `en-GB`; still `DATABASE_URL`-backed; NOTE dependency: `module-installation-process` per-schema roles may later need read grants on shared schemas | ⏳ | — | Verified: DB has 7 schemas — ai, crm, custom, emailsender, job, public, system — current renderer reads only 3, so `ai.*`/`job.*`/`crm.*` label_keys can never resolve today |
| 8 | `kind:"page"` + sheets render templates — **resolved**: one standalone generated page per declared `kind:"page"` route and one per declared sheet (same dignity as create/update pages); new doc surface, no baseline exists | ⏳ | — | ai console/docs-index, remote sheets `ai.*`/`job.runDetail` |
| 9 | Gates: (a) regression harness — regen diff vs `dbd2eb2` baseline, the 17 files must stay byte-identical per Q1 outcome; (b) documentability rule — routes containing `[`-segments or undeclared in census are never documentable (ghost `[...path]` dies by construction + explicit guard); (c) ownership isolation — crm run emits zero entity docs; (d) no-cross-repo guard test; (e) coverage census warns on declared-but-undocumented routes | ⏳ | — | Baseline byte-parity VERIFIED today: regen of all 17 files = diff-zero vs `dbd2eb2` (mod CRLF) |
| 10 | Deprecation: delete `ai/scripts/docs-{extract,render,generate}.ts` + `docs:*` package scripts; update `docs-user-pages.md` rule + dev-guide notes (BE+US); keep `ai` `index-docs`/`reindex-packs` (KB ingestion is ai's own job — legal) | ⏳ | — | |
| 11 | GitFlow: one `feature/` branch per repo touched; commits ONLY on explicit user instruction | ⏳ | — | |

<!-- Status values: ✅ done · ⏳ not done · 🚫 dropped. -->

---

## Verified current state (2026-10-26)

**Pipeline lives in the wrong repo.** `primebrick-us-v3/ai/scripts/` holds the
whole page-manual generator as *manual* scripts (`docs:extract`, `docs:render`,
`docs:generate` — NOT wired into any build; `generate:docs` = `build-docs-pack.ts`
only):

- `docs-extract.ts` (229 ln): `FE_DIR` default `../../../primebrick-fe-v3`;
  AST-scans `fe-v3/src/routes/(app)/**/+page.svelte` loading `typescript` +
  `svelte/compiler` from the FE's node_modules → `pages.json`.
- `docs-render.ts` (901 ln): `BE_DIR` default `../../../primebrick-be-v3`;
  loads `pg`/`typescript` from BE's node_modules; queries translations in
  `system`/`public`/`custom` only; scans BE `src/modules/**/*.meta.ts`
  (transpiled via `ts.transpileModule` + local-require) and
  `src/controllers/http/**/*.router.ts` (regex on `makeEntityRouter` configs);
  Permission enum read from **BE's** `node_modules/@primebrick/sdk/dist`.
- `docs-generate.ts` (48 ln): extract → render → default OUT
  `be-v3/docs/user-guide/generated`. The cross-repo chain end to end.

**Baseline is safe.** Regeneration today reproduced all 17 generated files
byte-identical to `dbd2eb2` (mod CRLF), including `users-create/edit.mdx`.

**Ghost confirmed.** `[...path].mdx` re-emitted on regen; source = physical
`/docs/[...path]` docs-viewer page that carries extractable facts. Prior fix
(`429c2d0`) deleted the file and relied on `_order.json`'s `[` guard — that
guards nav LISTING, not emission. Under declared-census enumeration the route
is never declared → ghost dies by construction; explicit guard still required
as defense in depth.

**Remote modules are structurally invisible.** `kind:"list"`+remote creates
live behind `esm-mount` `component_url`; their `.svelte` sources are in
`<svc>/fe/src` — outside any host scan. job entities additionally hit the
`foreign` skip (job-handler has no pipeline at all). Result: ai/job produce
ZERO user-guide pages today.

**Route truth exists.** `PAGE_ROUTE_KINDS = {list, detail, create, page}`;
`entityPaths()` is the only route constructor; `MODULE_NAV` (BE-owned
`settings` only) + per-service `src/nav-declaration.ts` → persisted in
`service_registry.endpoints.nav`. `page-resolver`: exact>template,
`component_url`→remote, declared-without-component→contract error until
Phase-B host archetypes exist (physical pages still carry settings/*,
crm/customers+create+pipeline, emailsender lists, job lists, dev/rc,
docs-viewer).

**Declarations differ BE vs US.** BE: `makeEntityRouter` config literals.
US: `EntityRouteDecl[]` in `entities-route.ts` — `schemas:{createBody,updateBody}`
on job entities is a permissive `entityBody` cast → **no field-level zod
server-side**; their form facts live ONLY in `fe/src/*.svelte`.

**Dynamic schemas.** `user_profile` CRUD is read-only at entity-router level;
writes are RPC `/api/v1/auth/users` via `makeCreateUserSchema(policy)` — a
runtime factory fed by `public.config_entries` password policy. Static AST
cannot extract it; runtime import+eval can (generator executes inside the
owning repo — also removes the `transpileModule` meta hack).

**Field-table provenance (the crux).** `users-create.mdx` "Notes" column =
widget-type labels ("validated input", "checkbox", "select") + constraints +
tooltips. Widget types exist ONLY in the fe-v3 `.svelte` template
(`AsyncValidatedInput`/`Checkbox`/`ComboSelect`...). `EntityMeta` (core
`entity-meta.ts`) today carries columns/tooltips/table/actions — **no form
section**.

## Decisions

- **Q1 — form-field facts for create/edit pages. RESOLVED (deferred)**: no
  interim extractor. Source = the form/archetype metadata produced by
  `metadata-driven-page-system` (e.g. `meta.form`). This is why the whole
  plan is blocked on it — building zod-eval or degraded-widget machinery now
  would be throwaway work.
- **Q2 — route declarer ≠ entity owner. RESOLVED (paradigm-forced)**:
  docs follow ENTITY ownership; paths come from the shared census
  (`service_registry.endpoints.nav` — each generator reads only its own DB).
  A module declaring routes over an entity it does not own is a contract
  violation, not a supported topology. The verified live case is documented
  debt: `crm` declares `entity: "customer"` routes (`/crm/customers*`,
  `/system/crm/pipeline`) but `customer`'s meta/service/entity/router all
  live in `be-v3` — `crm/src/index.ts` states the entity API
  ownership migrates "in a later phase" (crm is a self-declared PLAYGROUND
  for the module-ownership architecture). **Resolution LANDED
  (2026-10-26)**: `feature-crm-customer-ownership.md` completed the
  migration — crm now owns entity+meta+routes+docs and the violation is
  gone. BE's user-guide generator emits no `customers*.mdx` (the stale
  generated page + `_order.json` entry were removed); crm currently ships
  an openapi-only docs pack (`pnpm generate:docs`), so customer user-guide
  coverage is a known gap until per-service generated pages exist there.
  **Derived findings**: (i) enrollment validator gap — `entity:` refs are
  shape-checked but never checked against the service's own `entityRegistry`
  (crm registered only `config_entry` yet declared `entity: "customer"`);
  an ownership check at enrollment would have caught this — record as a
  separate hardening candidate for the SDK validator; (ii) `part_of` is
  virtual app attribution only — it changes route prefixes, never ownership
  (`route_prefixes: ["/crm", "/system/crm"]` are both crm-owned).
- **Q3 — new doc surfaces. RESOLVED**: standalone generated page per
  `kind:"page"` route AND per declared sheet — same dignity as CRUD
  create/update pages.
- **Q4 — shared impl home. RESOLVED**: shared engine in `@primebrick/sdk`
  (`src/docs-gen/` beside `src/docs-pack/`); thin per-service script.
- **Q5 — entities without nav routes. RESOLVED (via Q3)**: `ai_models` /
  `ai_cerebellum` are managed through the console + sheets — documented by
  those standalone pages (Q3); no separate entity-CRUD page.

## Acceptance criteria

- `pnpm generate:docs` in each service emits into `<svc>/docs/user-guide/generated/` with ZERO filesystem reads outside the service dir (guard-tested).
- BE run reproduces the 17-file baseline byte-identically for the kind coverage decided in Q1; every intentional diff is listed in the task notes.
- No `[...path]`/bracket-segment file can ever be emitted.
- crm/webhook runs emit nothing (isolation); ai/job-handler/emailsender emit their declared routes incl. remotes and sheets.
- `service_registry.endpoints.nav` census coverage = 100% declared routes either documented or explicitly skipped with reason.
