# Per-service user-guide docs generation (repo-local, metadata-driven)

> Sub-plan extracted from `metadata-driven-page-system.md` deferred items
> **D2** (user-guide pipeline stale — must read declared routes, not scan FS),
> **D4** (per-service page-doc render — cross-repo forbidden by design) and
> **D5** (ghost `[...path]` emission). Every claim below was verified
> empirically on 2026-10-26 against source, live regeneration, and DB schema.

## Status: ✅ IMPLEMENTED (2026-11-02) — Plan date: 2026-10-26 14:54 UTC · updated 2026-11-02

> **Landed** — engine in `@primebrick/sdk/src/docs-gen/` (branch
> `feature/docs-gen-engine`), wired generators in `primebrick-us-v3`
> (`feature/docs-gen-wiring`: job-handler + ai) and `primebrick-be-v3`
> (`feature/docs-gen-wiring`). Legacy ai `docs-{extract,render,generate}`
> retired. Output verified: jh 7 pages, ai 6 pages/sheets (100% coverage),
> be 21 pages incl. the 4 recovered settings `kind:"page"` docs.
> Implementation deltas vs this plan: foreign = *other services' census
> claims* (never "meta missing locally" — fixed modules.mdx regression);
> remote extractor covers ui-bound helpers (`$t`/`getT`/ui fetch wrappers)
> + `openSheet()` inside template markup; `RouterScanResult`/context fully
> snake_case; keep_files compare is extension-less.
>
> **Post-review findings (2026-11-02, empirically verified)**:
> F1 ✅ — widget collector missed member-tags (`<Password.PasswordInput>`
> never became a `PasswordInput` widget) + `widgetType` fallback crossed
> FormField boundaries (password doc showed "checkbox" from `is_admin`).
> FIXED in extract-svelte (member-tag leaf normalization + member-expr
> attr resolution) and render (fallback bounded by next FormField).
> F2 ✅ done — **column flags have ONE canonical contract that the
> renderer violated**: runtime reads `sortable`/`filterable`/
> `searchable`/`default_visible` as `!== false` (absent = enabled —
> `entity-meta.ts` documents "default true"; `core/columns.ts:69,87`,
> ~20 inline sites in fe entity-list-table + ai list-config). Renderer
> used truthy checks → every defaulting column documented as
> hidden/non-sortable/non-filterable (rules.mdx all-"no", missing "Each
> row shows" intro). Implemented: canonical predicates
> `isColumnVisible/isColumnSortable/isColumnFilterable/isColumnSearchable`
> in `core/src/columns.ts` (typed on `Pick<MetaColumn>` subsets so loose
> structural meta flows through; `defaultVisibleColumnKeys`/
> `searchableTextColumns` re-express over them; `columns.test.ts` pins
> the contract). Migrated to the predicates: FE entity-list-table
> (5 files), ai-cerebellum/ai-models/customers list-config (ai-models
> and customers also had `c.sortable` TRUTHY reads — absent flags
> silently unsortable, same bug class as the renderer), be
> `deriveSearchableKeys` (now composes `searchableTextColumns`); docs-gen
> `render.ts` consumes them and dropped its loose local MetaColumn for
> the real core type. Verified: regenerated rules.mdx — 7 columns
> shown, only filter/payload_map/created_at (explicit
> `default_visible: false`) hidden, intro "Each row shows…" restored.
> ONE way to read, shared by runtime, docs, and the future form
> builder (same opt-out family as `nullable === false` → required).
> Enforced: new check-standards rule `column-flag-defaults` (always-on,
> consumer+lib profiles, vendored copies synced in core/dal/ui;
> core/src/columns.ts exempt as the canonical implementation) — clean
> on all repos.

> **Unblocked 2026-10-28** — the intended form-fact source is LIVE:
> `page_props.form`/`FormPageDecl` on the route declaration (pilot:
> `/system/job/rules/create` + `/system/job/rules/[uuid]`, shared
> `RULE_FORM`, `entity-form-archetype-pilot.md` ✅). Facts come from field
> **placements × evaluated `meta.columns`** — richer than the `meta.form`
> shape originally anticipated: placement carries `col/span/row/row_span/
> section/default_value/placeholder_key/required/readonly/widget/
> options_source/allow_create` (closed set, enrollment-validated) +
> `validators` closed registry. NOT every entity has a form decl yet —
> remote `component_url` pages keep the decl+meta+fe-src extraction leg.
>
> **Decisions 2026-10-26** (all five resolved):
> Q1 → wait for `metadata-driven-page-system` — form facts come from the
> archetype metadata it produces; no interim extractor. **LANDED** as
> `page_props.form` (route-level) — see task 5.
> Q2 → docs follow ENTITY ownership; paths from the census in
> `service_registry.endpoints.nav`; declarer≠owner is a contract violation
> (crm→customer is documented debt, migration planned per its index.ts).
> Q3 → standalone generated page per `kind:"page"` route AND per declared
> sheet (same dignity as CRUD create/update pages).
> Q4 → shared engine in `@primebrick/sdk`, thin script per service.
> Q5 → entities without nav routes are documented *through* their managing
> surfaces — the console page + sheet pages (Q3) — no separate entity page.
>
> **Refinements 2026-10-28** (user-reviewed):
> R1 → wire `be-v3`, `ai`, `job-handler` ONLY. emailsender/crm/webhook are
> remote `component_url` custom surfaces slated for archetype migration —
> documenting their custom forms is throwaway; wiring is deferred until
> they are runtime-generated. AI `kind:"page"` routes ARE documented —
> custom is the correct permanent kind for them.
> R2 → ghost `.mdx` in `generated/` is AUTO-DELETED on regen (the dir is
> pipeline-owned; kills `[...path].mdx` + the stale BE `customers.mdx` by
> construction) + regression diff vs `HEAD:docs/user-guide/generated/`
> committed files — intentional diffs listed in the run report.
> R3 → sheet docs = standalone pages with FULL prose (multiple sections),
> referenced/linked from the parent pages that open them.
> R4 → no facts JSON artifact — the thin script imports the service's own
> TS natively (bun/tsx) and passes evaluated objects to the engine.

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | SDK shared engine `src/docs-gen/`: port extract+render logic (901+229 lines) parameterized `{meta_globs, router_globs, nav_decl, fe_src_dir, translation_schemas, out_dir, service_code}`; hard repo-root guard — `path.resolve` prefix check fails the run if any input escapes the repo root (enforcement, not verification) | ✅ | 2026-11-02 | Precedent: `src/docs-pack/build-docs-pack.ts` is already the SDK docs home |
| 2 | Census adapter: enumerate pages from DECLARED routes — service `src/nav-declaration.ts` imported as TS (generator runs inside owning repo, bun/tsx loads TS natively) + BE `module-nav-meta.ts` `MODULE_NAV`; kinds `list/detail/create/page`; never scans `routes/` FS | ✅ | 2026-11-02 | Replaces `docs-extract`'s `FE_DIR` walk — kills D2 root cause |
| 3 | Entity/route-fact collectors: parse BOTH declaration shapes — BE `makeEntityRouter({entityName, permissions:{…Permission.X literal}, metaExtraScans, extraScans})` and US `entities-route.ts` `EntityRouteDecl[]` (perms via `readPerms`/`writePerms` const identifiers → resolver must follow identifier→array, not only literal `Permission.X`) | ✅ | 2026-11-02 | Verified: `job-handler/src/controllers/http/entities-route.ts` uses `meta: readPerms` — literal-only regex silently loses perms |
| 4 | Service-local remote extraction: `component_url` routes → `<svc>/fe/src/pages.ts` `PAGES` dispatch map → mapped `.svelte` AST scan (same fact set as today's extract); sheets via `nav.sheets[]` keys → sheet components | ✅ | 2026-11-02 | Verified: `ai/fe/src/pages.ts` `PAGES` is the route→component truth, same-repo |
| 5 | Form-field facts for create/edit — source = `page_props.form` placements × evaluated `meta.columns` (UNBLOCKED: contract live since pilot). Renders: label/hint from `<schema>.translations`, required (`placement.required ?? nullable===false`), `default_value` prefill prose, `widget` name, `options_source` → enumerated census options w/ label+desc, format semantics (`nats_subject`/`schedule_spec`/`json`+`json_schema`), placement→layout notes; detail kind adds collaboration/optimistic-version/tainted-guard archetype prose | ✅ | 2026-11-02 | Verified 2026-10-28: `bun -e import('./src/controllers/http/entities-route.ts')` in job-handler resolves meta (`varchar(200)`, `nullable:false`) + perms (`_authenticated_admin`) + auditable in one import; `job.translations` holds 33 `job.entities.job_rule.*` keys |
| 6 | Per-service thin script `scripts/generate-page-docs.ts` + wire into `generate:docs` BEFORE `build-docs-pack`: **be-v3, ai, job-handler only** (R1: emailsender/crm/webhook deferred until runtime-generated) | ✅ | 2026-11-02 | `buildDocsPack` already `cpSync`s whole `docs/` → `generated/` ships automatically via existing prebuild + `ServiceRegistrar` `docs_pack` advertisement; job-handler gains `docsDir` + `docs/user-guide/` (crm precedent) |
| 7 | Translations: page-prose scope `[own_schema, system, public, custom]` (own first — `??=`), `en-GB`, `DATABASE_URL`-backed; PLUS census-option lexicon pass over ALL `service_registry.schemas` (emit/callable `label_key`/`description_key` live in the EMITTING module's namespace — `crm.*`, `emailsender.*`; keys are namespace-prefixed so no collision) | ✅ | 2026-11-02 | Verified 2026-10-28: `ai.translations` has `ai.console.title`/`ai.docs.description`; 7 schemas in DB — renderer today reads only 3 |
| 8 | `kind:"page"` + sheets render templates — standalone page per declared `kind:"page"` route (structural + fe-src extracted internals where wired) and one FULL-prose page per declared sheet (R3: multiple sections; referenced/linked from the parent pages that `openSheet(key)` them — detected via AST of the service's own `fe/src` + host callers) | ✅ | 2026-11-02 | ai console/docs-index + 4 ai sheets + `job.runDetail`; slug = kebab sheet name (`run-detail`, `model-test-report`, `cerebellum`, `model-import`, `model-cache`) |
| 9 | Gates: (a) regression harness — diff vs `HEAD` committed generated files (was `dbd2eb2` baseline): byte-parity expected for unchanged sources, intentional diffs listed; (b) documentability — routes containing `[...` catch-all segments or undeclared are never documentable (explicit guard — `[param]` detail segments are fine); (c) ownership isolation — service run emits only own-declared routes; (d) no-cross-repo guard test (fe_src_dir sanctioned for be↔fe host pair only — see note); (e) ghost `.mdx` AUTO-DELETED (R2) + coverage census warns on declared-but-undocumented | ✅ | 2026-11-02 | fe↔be seam: BE-owned host pages' `.svelte` facts live in fe-v3 — `fe_src_dir` param is the declared companion input; guard enforces us-v3 service isolation |
| 10 | Deprecation: delete `ai/scripts/docs-{extract,render,generate}.ts` + `docs:*` package scripts; update `docs-user-pages.md` rule + dev-guide notes (BE+US); keep `ai` `index-docs`/`reindex-packs` (KB ingestion is ai's own job — legal) | ✅ | 2026-11-02 | |
| 11 | GitFlow: one `feature/` branch per repo touched; commits ONLY on explicit user instruction | ✅ | 2026-11-02 | |

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

- `pnpm generate:docs` in each wired service emits into `<svc>/docs/user-guide/generated/` with ZERO filesystem reads outside the service dir (guard-tested; `fe_src_dir` is the declared exception — be↔fe host pair only).
- BE run reproduces the 17-file baseline byte-identically except the intentional diffs listed in the run report (nav-sync prose already landed; `customers.mdx` ghost is auto-deleted).
- No `[...path]`/catch-all file can ever be emitted; `[param]` detail segments emit normally.
- emailsender/crm/webhook are NOT wired — their remote custom pages stay undocumented until archetype migration (their routes would emit for free once wired, same as JH).
- job-handler emits `rules.mdx` + `rules-create.mdx` + `rules-edit.mdx` + `job-schedules*.mdx` + `runs.mdx` + `run-detail.mdx` (sheet) into `job-handler/docs/user-guide/generated/`; the pack carries them via `docsDir`.
- ai emits `console.mdx` + `docs-index.mdx` + the 4 sheet pages.
- `service_registry.endpoints.nav` census coverage = 100% declared routes in wired services either documented or explicitly skipped with reason.

## Verified mechanics (2026-10-28 — all proven, nothing assumed)

- **In-service eval works**: `bun -e "import('./src/controllers/http/entities-route.ts')"` inside `job-handler/` resolves `jobEntityDecls` fully — `withColumnConstraints` evaluated (`nullable:false`, `pg_type:"varchar(200)"`), `Permission.*` enums resolved to strings, `auditable:true`. The thin script therefore just `import`s its declaration modules and passes OBJECTS to the engine — no transpile-eval, no stub-require, no regex on enum names. BE metas stay importable literals (tsx proven on `module-nav-meta.ts`: `MODULE_NAV.settings` = 21 routes incl. the 4 `kind:"page"` settings pages the old pipeline lost).
- **Registry verbatim**: `service_registry.endpoints` = `{nav, events, health, callables}` — nav carries the complete `page_props.form`; emits/callables carry `label_key`, `description_key`, `payload_schema`, `permissions`, `entity` pointer. Callables exist ONLY in registry (auto-collected inside subscription functions — not importable by design; registry read is the sanctioned source).
- **Remote internals are AST-extractable**: `ai/fe/src/pages.ts` `PAGES` map (route→component), `job-handler/fe/src/index.ts` (`mountPage`→SchedulePage, `mountSheet`→RunDetailSheet). Remote sources use `ctx.api`/`ctx.i18n.t`/`ctx.sheet.props`/`ctx.nav.route` instead of host `apiFetch`/`$t` — the extractor needs a remote-source variant (same fact set, different callees).
- **Translations**: `job.translations` = 99 en-GB keys (33 `job.entities.job_rule.*` incl. hints); `ai.translations` holds `ai.console.title`/`ai.docs.description`. Page-prose scope `[own, system, public, custom]`; census-option labels need the union of all service schemas (emit/callable keys live in the EMITTING module's namespace — namespace-prefixed, no collision).
- **`job.runDetail` has no production opener** (2026-10-28): declared + e2e-verified mount, but nothing in production UI calls `openSheet('job.runDetail')` — the runs list is a plain `EntityTablePage` with no detail row action. The sheet doc page still emits (it's a declared surface); record the missing opener as a separate product finding — likely a pending row-action wiring on `job_run`.
- **Dispatch shapes verified**: `ai/fe/src/pages.ts` `PAGES` = route→component map; `job-handler/fe/src/index.ts` `mountPage` always mounts `SchedulePage` (single remote surface), `mountSheet`→`RunDetailSheet`; `RunDetailSheet` consumes `ctx.sheet.props.run_uuid` and fetches `ctx.api('/api/v1/entities/job_run/:uuid')` — its doc prose can enumerate the run fields it displays from `job.entities.job_run.fields.*` keys.
- **`_order.json`**: `generate-reference-docs.ts` already reconciles `generated/*.mdx` on disk → manifest; the reconcile must generalize per-pack (each service's `generate:docs` syncs its own `_order.json`).
