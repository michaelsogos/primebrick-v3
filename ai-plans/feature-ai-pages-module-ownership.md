# AI Pages — Module Ownership Migration (Settings → `ai` service)

> Sub-plan of `metadata-driven-page-system.md` task 19 (partial) and the
> `feature/table-pages-merge` stream. Precedent established by job-handler:
> service-owned `nav-declaration.ts` → `endpoints.nav` → `/modules` payload →
> remote `esm-mount` chunks served via `/ws/ai/api/v1/module-assets/*`.
> Scope is **AI pages only** — `email-providers`/`templates`/`migrations` and
> other settings pages are out (same pattern, later sub-plans).

## Status: � PARTIALLY DONE — Plan date: 2026-10-23 (page migration executed end-to-end: decl+pages+shells+config+preload all landed; **2 env blockers**: patch 0008 unsigned — dev-micha keyfile missing; FE dev server (PID 93920) holds a stale `@primebrick/ui` exports map — needs user restart before e2e)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Decision gate — user resolves D1–D9 (Part D) | ✅ done | 2026-10-21 | see "D1–D9 decisions taken" below — D8/D9 resolved to the JOB precedent (no access field, hard route cut) |
| 1b | Vendor-plane spike (D13) — host bundles + importmap + externalized job chunk + live mount proof | ✅ done | 2026-10-21 | Part F.10 — 102 KB → 14.34 KB; blob+importmap resolution proven live in browser |
| 1c | ctx extensions: `components.mfaStepUp` (D5) + `components.openSheet` (D6) | ✅ done | 2026-10-21 | `MfaStepUpFn`/`OpenSheetFn`/`HostApiFn` built-ins in core `ModuleHostComponents` + `bindStepUp`/`getOpenSheet`/`getServiceApi('host')` bridges in ui (remote-sheets tranche) |
| 1d | D4 — promote multi-use parts to `@primebrick/ui` | ✅ done | 2026-10-23 | page-surface landed: toolbar/, button-group/, separator/, stat-card/, number-ticker/, entity-list/ (entities-ns-context+EntityConfirmQuestion+DeleteDialog+DeletionFilterToggle), composables/useMachineCapabilities + ai/service-api docs-index+config fetchers; new `./cache` + `./bridges` leaf subpaths (test-env barrel cost) |
| 2 | `ai/src/nav-declaration.ts` — routes + nav links + access | ✅ done | 2026-10-23 | `route_prefixes:['/system/ai']`, `access:'access.system.ai'` (module-level gate), `nav[]` 2 links (`ai.nav`/`ai.nav.docs_index`), `routes[]` 2×`kind:'page'`→`ai-pages.js` esm-mount; validator+6/6 unit tests |
| 3 | Wire decl into `createMicroservice({ nav })` in `ai/src/index.ts` | ✅ done | 2026-10-21 | wired with sheets decl (task 7); `partOf:"system"` already set |
| 4 | `ai/fe/` remote-chunk scaffold (vite lib build + `module-assets` route) | ✅ done | 2026-10-21 | task 7 tranche — vite lib build, module-assets route, `ai-sheets.js` entry |
| 4b | `ai-pages.js` second chunk entry | ✅ done | 2026-10-23 | multi-entry vite config + per-chunk deps.json; `pages.ts` `mountPage` dispatch on `ctx.nav.route` → `mountModuleContent` (ambient providers) |
| 5 | Migrate the AI console page surface — single `mountPage` remote page | ✅ done | 2026-10-23 | `AiSettingsPage.svelte` + `ai-model-test-report`/`machine-capabilities-section`/`gpu-vendor-icon` in ai/fe; host breadcrumb via `ctx.mount_host(AppPageBreadcrumb)` + `moduleBreadcrumbSegments` |
| 5b | Config domain move — `ai_assistant_model`: `public` → `ai.config_entries` | ⏳ partial | — | `controllers/http/config-route.ts` (emailsender pattern + secret masking) exposes `/entities/config_entry/*`; host chrome rewired (`ai-chat-panel`→`fetchModuleConfig('ai')`); **patch 0008 written but UNSIGNED — dev-micha keyfile missing (user input needed)** |
| 5c | `entities_ns:'ai'` on ai_model + ai_cerebellum metas | ✅ done | 2026-10-23 | `entities_ns` added to `EntityMeta` type + both metas; `system.entities.ai_*`→`ai.entities.ai_*` moved by patch 0008 |
| 6 | Migrate `/system/settings/docs-index` page → `/system/ai/docs-index` (D7) | ✅ done | 2026-10-23 | `DocsIndexPage.svelte` via `fetchDocsIndexStatus`/`reindexDocsPacks` (ui ai service-api, `ctx.api`-bound) |
| 7 | FE route moves — **HARD CUT (D9)** | ✅ done | 2026-10-23 | `settings/ai`+`settings/docs-index` deleted; thin shells `/system/ai` + `/system/ai/docs-index` (job precedent, RemotePageErrorPanel on resolution failure); `module-nav-meta` −2 nav/−2 routes (7/7 BE tests); e2e/dev-rc repointed; dead code removed (`hf-model-search`, smart-ai page trio, FE useMachineCapabilities, api.ts ai/docs fetchers) |
| 8 | i18n: `system.settings.*`/`system.entities.ai_*` → `ai.*` module dict + signed db patch | ⏳ partial | — | patch 0008 performs full INSERT…SELECT moves (all locales) + `ai.translations` table + `ai.module.name` + `ai.nav*` + `ai.config.*`; **unsigned — same key blocker**; host chrome `ai-model-details-popover` repointed to `ai.entities.ai_model.*` |
| 8b | Remote-chunk preload — `warmRemoteModules` | ✅ done | 2026-10-23 | `Map<url,Promise>` cache in remote-loader + `warmRemoteModules` post-`fetchModules()` idle prefetch of every decl `component_url` (sheets+pages); mounts reuse the cached pipeline |
| 9 | Access namespace — `access:'access.system.ai'` module-level | ✅ done | 2026-10-23 | on `AI_NAV`; validator-approved ns derived from `partOf:'system'`; admins inherit via `access.system` |
| 10 | Tests: decl validator (US) + unit (FE) + E2E | ⏳ partial | — | US 16/16 + decl 6/6; BE nav 7/7; FE unit 467/467 (matchMedia stub + leaf subpath imports + i18n bridge bound in vitest-setup); **live e2e pending dev-server restart** |
| 11 | Docs sync (module-navigation, app-shell, ai docs) + commit | ⏳ not done | — | `make-docs` skill per repo; commits per repo with model trailer |
| 12 | `vendor_requires` runtime handshake — remote-loader fetches `<chunk>.deps.json`, compares vs `vendor-manifest.json`, graceful panel on mismatch | ✅ done | 2026-10-21 | `verifyVendorDeps` in remote-loader before chunk fetch; `diffVendorRequirements` (exact-match) + `RemoteDepsManifest`/`VendorManifest` types in core vendor-plane (FE via ui, us via sdk); new `vendor` error kind + i18n; 404 deps = self-contained chunk proceeds |
| 13 | Serve `<chunk>.deps.json` via `module-assets` (job + ai) | ✅ done | 2026-10-21 | **already satisfied** — route is generic (any file under `fe/dist`, traversal-protected, `.json`→`application/json`, `no-cache` for unhashed names); added enforcement tests proving deps.json resolves + revalidates |
| 14 | `layout.sections` decl + grid container + `remote:`/`host:` dispatch (D11) | ✅ done | 2026-10-21 | ONE layout archetype: CSS grid (user correction — stack/split/tabs were over-engineering; stack = grid 1-col). `page_props.layout` in core, `PageSectionSlot` per-cell isolation + error panel, host registry in FE, `validatePageLayout` in sdk. Chunkless all-`host:` descriptor pages supported |
| 15 | `@huggingface/transformers` vendor entry — resolved via `@primebrick/ui/transformers` subpath (D12) | ✅ done | 2026-10-21 | ui owns dep `4.3.1` + `./transformers` export; FE migrated; direct `@huggingface/transformers` import = `reject` via `VENDOR_BLOCKED_PACKAGES`; vendor = prebuilt `transformers.web.min.js` 454KB + ort sibling; host main-thread never imports it (worker realm keeps own copy) → no app-build externalization needed |

---

## Part G — Execution decisions (user-confirmed 2026-10-21, second round)

| # | Decision | Confirmed choice |
|---|---|---|
| E1 | Entity label namespace | `entities_ns:'ai'` on `ai_model`+`ai_cerebellum` metas; keys `system.entities.ai_*` → `ai.entities.ai_*` (hard cut — dead keys die, job precedent) |
| E2 | Access | `access:'access.system.ai'` module-level on `AI_NAV` — ns derived via `accessNamespace(code, partOf)`, enforced at enrollment; admins inherit via `access.system`; no DB seed (access keys are grant tokens, NOT seeded entities). Rejected: `access.system.settings` reuse (outside ns → validator rejects) |
| E3 | Routes | `/system/ai` (console) + `/system/ai/docs-index` — JH shape: thin FE shells → decl census → `RemotePageMount`; settings links/routes cut from `module-nav-meta.ts` |
| E4 | Config ownership | module configs are module-owned per schema (`ai.config_entries` — ALREADY exists+seeded). `ai_assistant_model` moves `public.config_entries` → `ai.config_entries` via single signed patch (INSERT…SELECT + DELETE). `config_entry` decl added to ai entities-route. Host chrome reads via `getServiceApi('ai')` (`fetchModuleConfig`/`updateModuleConfigKey` already exist). `useConfigEntries` does NOT migrate — page uses `ctx.api` |
| E5 | Chunks + preload | TWO chunks: `ai-sheets.js` (existing) + `ai-pages.js` (new) → parallel background download. `warmRemoteModules(modules)` in remote-loader: post-`fetchModules()` idle prefetch of every decl `component_url` through the full `loadRemoteModule` pipeline → `Map<url, Promise>` cache → mounts instant, zero loading flash; silent failures evicted |

### Execution order (confirmed)

1. `ai/db-meta` patch — config move + `entities_ns` metas + `ai.*`/`ai.entities.*`/`ai.config.*` translations (signed)
2. ai `entities-route` — `config_entry` decl
3. `@primebrick/ui` — remaining components/composables/api helpers (task 1d list)
4. `ai/fe` — pages + components + `ai-pages.js` entry
5. `ai/src/nav-declaration.ts` — routes/nav/access (task 2 completion)
6. `remote-loader` — `warmRemoteModules` + promise cache
7. FE — shells + hard cut + `module-nav-meta` + host chrome config rewire + residue cleanup
8. BE — `system.settings.ai*`/`docsIndex*`/`ai entities` key removal patch
9. Tests + docs + commits

---

## Part A — Inventory (verified 2026-10-21)

### Pages to move (currently declared in BE `MODULE_NAV.settings`)

| Page (today) | kind | Data endpoints | Ownership evidence |
|---|---|---|---|
| `/system/settings/ai` | `page` (721 LOC, `fe/src/routes/(app)/system/settings/ai/+page.svelte`) | `/ws/ai/api/v1/entities/ai_model/list`, `ai_cerebellum/list`, config_entries, browser-local model cache | comment in page header: "Full admin CRUD … handled by the AI microservice via BE proxy"; `ENTITY_SERVICE_MAP: { ai_model: 'ai' }` (api.ts:43) |
| `/system/settings/docs-index` | `page` | `GET /ws/ai/api/v1/ai/docs/index-status`, `POST /ws/ai/api/v1/ai/reindex` | page header: "documentation knowledge base (AI docs_kb / pgvector)" — pure AI-service admin surface |

### AI-owned entities & modules (already migrated BE→US, `ai-ownership-migration` DONE)

- `ai_model` — `us-v3/ai/src/modules/ai-models/` (meta, dto, service, list-config, power-level)
- `ai_cerebellum` — `us-v3/ai/src/modules/ai-cerebellum/` (meta, dto, service, list-config)
- docs pipeline internals — `src/services/`: `docs-search-*`, `docs-index-status`, `docs-drift`, `docs-pack-ingest`, `docs-pack-reindex`, `docs-kb-repository`, `docs-loader`, `embedding-*`, `conversation-repository`, `feedback-repository`, `rate-limiter`, `orchestrator`, `llm-provider`
- Route handlers already composed: `openapiRouteHandler`, `compositeRouteHandler`, `aiEntityRouteHandler`, `docsSearchRouteHandler` (index.ts:56)
- **Missing**: no `nav:` argument in `createMicroservice` — the service has zero page declarations today

### `/system/settings/ai` — the 721-LOC surface (what the remote chunk must replace)

| Section | Host deps it uses | Boundary class |
|---|---|---|
| ai_model catalog table | `useAiModels`, `EntityListTable` dialogs (`DeleteDialog`), `DeletionFilterToggle`, badges, `modelVariantKey` | could become host-rendered `EntityTablePage` (kind:list, entity:ai_model) OR remote-owned list |
| WebLLM model cache | `ModelCacheSection`, `ModelCachePanel`, `StorageBreakdownBar`, `use-model-cache.svelte` | **shared with shell**: `AiModelCachePanel` sheet panel uses the same components |
| Cerebellum | `useAiCerebellum`/fetch, `cerebellum-recommendation-badge`, `CerebellumSelector`, `resolveEffectiveParams`, `tuningOverriddenKeys` | shared with assistant/model selectors |
| Machine capabilities | `useMachineCapabilities`, `MachineCapabilitiesSection`, gpu icons | browser-local probe — relocatable |
| Test scores/report | `AiModelTestReport`, `summarizeTestScores`, `ScoreGauge` | ai-page + model details popover |
| Cross-cutting | `useMfaStepUp` + `MfaStepUpDialog`, `openSheet`, `moduleBreadcrumbSegments`, `AppPageScaffold`, `useConfigEntries`, `pushNotification` | scaffold/breadcrumb come free via remote shim; **MFA/sheets have no ctx equivalent today** |

### Stays FE-owned (NOT pages — global shell features consuming `/ws/ai`)

`ai-chat-panel`, `ai-model-selector`/`option`/`details-popover`, `use-ai-assistant`, guide loop, smart-regex model selector — assistant UX lives in the shell; only **pages** move.

---

## Part B — Target state

```
/service_registry: code=ai, part_of=system  →  prefix /system/ai

nav-declaration.ts (ai):
  route_prefixes: ["/system/ai"]
  nav:  [ { href: <D1 models/console home> }, { href: <D7 docs-index> } ]
  routes: entityPaths("/system/ai", "<D1 leaf>") + docs-index page decl
  access: "access.system.ai" (+ per-page where declared)

FE:  /system/settings/ai → 307 → /system/ai/<home>   (settings nav entries removed)
     /system/settings/docs-index → 307 → /system/ai/docs-index (if D7=yes)
```

Settings `MODULE_NAV` loses `ai`, `docs-index` nav links + their `kind:"page"` route decls (module-nav-meta.ts:65-66, 90-91) — same cut as job removal from settings.

---

## Part C — Gotchas & breaks detected

| # | Gotcha | Break risk |
|---|---|---|
| C1 | **Cross-bundle snippet ban** (core `page-route.ts:175-188`, live-E2E-proven): host dialogs/snippets can't render inside remote markup. `DeleteDialog`, `DeletionFilterToggle`, `Popover` menus must be bundled in the chunk (`@primebrick/ui` copies) or host-mounted via `mount_host` | hard break if assumed working |
| C2 | **`ctx` lacks `openSheet` and MFA step-up**: `ModulePageHost` = `{nav, meta, api, i18n, notify, components, mount_host}` (page-route.ts:148-208). The page calls `useMfaStepUp` + `openSheet` — no bridge exists; needs ctx extension (e.g. `components.mfa`/`components.openSheet` as host-bound fns) or UX change | feature loss if ignored |
| C3 | **ModelCacheSection dual ownership**: used by the settings page AND `src/lib/shell/sheets/panels/AiModelCachePanel.svelte` (shell sheet). Moving it into the remote chunk strands the sheet; keeping it FE-side strands the page (needs a bundled copy → duplication) | duplication or broken sheet |
| C4 | **useConfigEntries** — page reads config for cache/model prefs; remote must call `ctx.api` → `/ws/ai` config-entry endpoints (ai schema) — verify which keys/schema today | silent config regressions |
| C5 | **Access namespace shift**: today the pages inherit `access.system.settings` (settings decl). Under the ai module they require `access.system.ai` — admins unaffected (`access.system.*` inheritance), **non-admins with a settings grant lose the pages** unless grants are migrated | visibility regression for non-admin roles |
| C6 | **Route cut**: `/system/settings/ai` + `docs-index` get redirects (hard cut = 404 for bookmarks; job precedent = single redirect page) | bookmarked links |
| C7 | **i18n namespace**: `system.settings.tabs.ai`, `system.settings.tabs.docsIndex` + in-page keys move to `ai.*` module dict served via `service_registry` translations (job precedent) | untranslated labels until patch lands |
| C8 | **`useAiModels`/`useAiCerebellum` composables** stay in FE for assistant/chat — the remote page needs a bundled copy (job's `remote-list.svelte.ts` precedent) or plain `ctx.api` calls | duplication accepted by precedent |
| C9 | **Machine capabilities probe** is browser-local (WebGPU) — relocates cleanly into the chunk; no API dependency | none |
| C10 | **ai_model CRUD target**: page header says admin CRUD via `/ws/ai/api/v1/entities/ai_model/*` — if the list becomes a host `EntityTablePage` (kind:list), writes need `meta.actions`/endpoints declared — verify `ai_models.meta.ts` exposes them | edit/create surface |
| C11 | **`module-assets` route must exist in ai service** (job-handler built one — traversal guard + immutable-hash policy, `job-handler/src/controllers/http/module-assets-route.ts`) | remote page 404 |
| C12 | E2E specs referencing `/system/settings/ai` (model-cache, ai-quality specs) must be repointed | red suite |

---

## Part D — Decisions for the user

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | **Page name + route leaf** for the AI console | a) `/system/ai/models` ("Models") b) `/system/ai/console` c) `/system/ai/overview` | a — leaf plural conforming to R1 if it hosts the ai_model list; "Models/Modelli" wording |
| D2 | **Delivery mode** | a) remote `esm-mount` chunk (full module ownership, job precedent) b) host-rendered `EntityTablePage` for the model list + remote page only for cache/console parts c) host-rendered custom page under `/system/ai` (keeps code in FE repo — NOT true module ownership) | b — the catalog is a standard entity list; only cache/cerebellum/caps are custom → smallest remote surface |
| D3 | **Page decomposition** | a) keep one composite page b) split: `models` list (host ETP) + `console`/`cache` custom page | b — matches D2b; splits the 721 LOC cleanly |
| D4 | **ModelCacheSection owner** | a) module chunk (sheet panel keeps FE copy → two impls) b) promote to `@primebrick/ui` (both consume it) c) keep FE-only, drop from module page | b — single source; ui package already exists for exactly this |
| D5 | **MFA step-up for remote ops** (delete model etc.) | a) extend ctx: `components.mfaStepUp()` host-bound helper b) defer — remote ops that need MFA stay host-rendered for now | a — small ctx extension, closes the gap for ALL future modules |
| D6 | **Sheets from remote pages** (`openSheet`) | a) extend ctx: `components.openSheet(panel_key, props)` b) inline sections instead of sheets | a if needed; b acceptable since sections are already inline today |
| D7 | **docs-index in scope** | a) yes → `/system/ai/docs-index` (remote, small page) b) later | a — pure ai-owned surface, low risk second passenger on the same chunk |
| D8 | **Access migration** | a) DB patch mapping `access.system.settings`→`access.system.ai` for existing role_mappings b) admins-only until grants UI (D1 deferred item) exists | a — preserves non-admin visibility parity |
| D9 | **Legacy redirect** | a) single redirect `/system/settings/ai`→new (job precedent) b) hard cut | a — precedent + bookmarks survive |

---

## Part E — Execution outline (post-decisions)

1. `us-v3/ai/src/nav-declaration.ts` + `nav-declaration.test.ts` (validator gate at write-time)
2. `ai/fe/` scaffold: vite lib entry `mountPage`, `module-assets` controller copy, `fe:build` in prebuild
3. Remote pages per D3 (+ host `EntityTablePage` route decl if D2b)
4. `ai/src/index.ts`: `nav: AI_NAV`
5. BE `MODULE_NAV.settings`: drop `ai`/`docs-index` links+route decls
6. FE: route dirs `system/settings/ai`, `docs-index` → redirect `+page.ts` files
7. `ai/db-meta/patches/0015_*` translations (en/it/etc.) + sign manifest
8. ctx extensions per D5/D6 (core `ModulePageHost` + FE loader) if approved
9. Tests: US decl test, FE census/ownership unit tests, repoint E2E specs, new `system-ai-*.spec.ts`
10. Live verify: ai service re-register accepted; pages render; access filter behaves (admin vs test user)
11. Docs + commit (stream branch `feature/table-pages-merge`, all repos)

---

## Part F — Delivery economics: how remote pages stay thin (verified 2026-10-21)

### F.0 The problem (measured)

`job-handler/fe/dist/jobs-page.js` = **102 KB raw / ~30.5 KB gz** for just 2
form pages — the bundle is ~fully self-contained (zero external imports:
rolldown inlines svelte runtime + `@primebrick/ui` + icons + page code). Per the
vite config comment: *"NO external: every import is bundled — bare specifiers
would fail in the browser (no import map)"*.

Scaling that to AI (a 721-LOC composite page with Dialog/Checkbox/Toolbar/
composables/icons, plus `@huggingface/transformers@4.3.1` — an FE dep measured
in MBs) → a naive remote chunk is **300-500 KB+**, and worse: heavy product
runtime (WebLLM/transformers cache manager) would be *duplicated*, not shared.

The user directive: find the mechanism BEFORE moving AI — the AI page is the
inverse of jobs (jobs was retrofitted to the arch; AI is natively custom).

### F.1 Three delivery planes + one policy

| Plane | What it ships | Who owns it | Granularity |
|---|---|---|---|
| **Vendor plane** (import map) | by-design libraries: `svelte`, `svelte/internal/client`, `@primebrick/core`, `@primebrick/ui`, `@lucide/svelte` | FE host, versioned once | shared by ALL remote chunks |
| **Module chunk** | module-authored components + module-only small libs | the service | per-module `fe/` build |
| **Host registry** | host-owned section components + scaffold | FE bundle | zero download |
| **Capability bridge** | heavy product libs already in host (`@huggingface/transformers` → model cache manager) — remote calls `ctx.components.*` handles, never imports the lib | host | function handles |

### F.2 Vendor plane — mechanics (recommended: import map, no rewrite plugin)

- FE build emits `/vendor/<name>.<contenthash>.js` ESM prebundles +
  `vendor-manifest.json` `{name: {url, version}}` — a dedicated `vite vendor`
  build in fe-v3.
- `app.html` (or boot) carries a static `<script type="importmap">` mapping the
  closed specifier list → those URLs. Import maps are native (Chrome 89+/FF
  108+/Safari 16.4+) — no loader framework, no runtime wiring.
- Module `fe/` vite config: `build.rollupOptions.external` for the by-design
  specifier list → rollup leaves bare imports; browser resolves them via the
  map. Compiled Svelte imports `* as $ from 'svelte/internal/client'` —
  namespace import, so the vendor bundle is a plain `export *` re-export.
- **Isolation stays deliberate**: the vendor svelte is a THIRD instance —
  host keeps its private bundled runtime (unchanged), remote chunks share the
  vendor one among themselves. The cross-bundle snippet ban still holds
  host↔remote; remote↔remote roots can interop for free.
- Version handshake: chunk manifest / route decl carries `vendor_requires`
  (semver per vendor name) → `RemotePageMount` checks against
  `vendor-manifest.json` before `import()` → mismatch = graceful panel
  (existing error-panel infra). No silent ABI drift — `svelte/internal/*` is
  NOT a stable API across versions, so pinning is mandatory, not optional.
- Weight math (estimate, to be confirmed by the F.5 spike): svelte internals +
  primebrick/ui ≈ 60-80 KB of the 102 KB chunk → externalized job chunk ≈
  **15-30 KB**; AI page ≈ **40-80 KB** vs 300-500 KB bundled.

### F.3 Section-level mounting — "compile only the frame we care about"

`RemoteMountSlot` already exists (`remote-page/RemoteMountSlot.svelte`) — a
remote root inside host DOM, proven primitive. Extend from page-granular to
section-granular:

- Chunk exports named mounts beyond `mountPage` — e.g.
  `mountModelCache(el, ctx)`, `mountCerebellumPanel(el, ctx)`.
- Route decl gains a section layout (fits `page_props` on the existing
  `PageRouteDeclaration` — closed-schema extension):

  ```ts
  { route: "/system/ai/models", kind: "page",
    page_props: { sections: [
      { component: "host:model_cache" },        // host registry
      { component: "remote:models_panel" }      // chunk export
    ] } }
  ```
- Host renders scaffold + sections in order; `remote:` sections mount via
  `RemoteMountSlot` + `components.remote[export_name]`. **The page frame is
  never in the chunk** — scaffold, breadcrumb, page chrome stay host.

### F.4 Descriptor-only pages — zero-download custom

A `kind:"page"` decl whose `sections` are ALL `host:` renders with **no chunk
at all** — the declaration IS the page (the "instructions for how to mount at
runtime" option). This is also the answer to root-plan task 14
(`component_key` registry): the registry becomes section-level — pages compose
registered sections instead of registering whole pages.

### F.5 Third-party policy (non-design libs)

| Lib class | Rule | Enforcement |
|---|---|---|
| by-design (closed list: svelte, core, ui, lucide) | import-map vendor — never in chunk | `check-standards` on `fe/` builds: grep bundled marker |
| heavy product lib already hosted (`@huggingface/transformers`) | vendor entry OR `ctx.components.<capability>` handles — NEVER duplicated | shared-deps manifest check |
| module-only small lib | may bundle into chunk | module's weight budget |

Chunk manifest (served next to the chunk or inside route decl):
`{ vendor_requires: {...}, shared_deps: {name: semver}, exports: ["mountPage", ...] }`.

### F.6 Additional decisions for the user

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D10 | Vendor resolution | a) static importmap in app.html b) URL-rewrite plugin at module build (bare→`/vendor/x.hash.js`) | a — native, no plugin coupling; b only if map support becomes an issue |
| D11 | Remote granularity | a) page-mount only b) section-mount standard (`layout.sections`) | b — the AI page is literally a section list; smallest custom surface |
| D12 | Initial vendor set | `svelte`, `svelte/internal/client`, `core`, `ui`, `@lucide/svelte` + `@huggingface/transformers`? | include transformers — host already loads it; remote sharing its instance kills the duplication problem AND the cache-manager split |
| D13 | Spike before AI move | rebuild `jobs-page.js` with externals → measure → mount via importmap | yes — validates F.2 end-to-end on the smallest existing chunk before AI depends on it |

### F.7 What this changes in the AI plan

- D2/D3 resolved direction changes: the AI page decomposes into sections;
  `ai_model` list = host `EntityTablePage` (already decided); custom sections
  ship as SMALL remote mounts (not a 721-LOC monolith page).
- `ModelCacheSection` choice (D4) gains a fourth option: host-registered
  section (`host:model_cache`) — the sheet panel keeps working because the
  component never leaves the host.
- New implementation tasks precede the move: vendor build + importmap (FE),
  `vendor_requires` handshake (core types + remote-loader), `layout.sections`
  decl (core `PageRouteDeclaration.page_props`), `RemoteMountSlot` export
  dispatch, spike on job chunk (D13).

### F.8 Security & XSS threat model (asked 2026-10-21)

**Remote code is not sandboxed** — a chunk runs in the host realm with full
DOM/session access. The trust model is *first-party*: only services that
completed shielded `service.register` may publish declarations; `component_url`
comes from the authenticated `service_registry` payload, never from user input;
the asset itself is served same-origin through `/ws/<code>` behind
`AUTHENTICATED_USER` + client-shield.

| Vector | Mitigation (status) |
|---|---|
| Tampered asset in transit/CDN | `integrity` (sha256) on the decl — loader probe-fetches, hashes, imports verified bytes via blob URL (already implemented in remote-loader) |
| Rogue URL in decl | loader only imports `component_url` from census decl — no arbitrary import path exists |
| Malicious import map | map is emitted by server-rendered `app.html` (host-owned, closed specifier list) — injecting a hostile map requires document injection = full XSS already; first-registered mapping wins |
| Hostile `bare specifier` smuggled into a chunk | check-standards scan: emitted chunk must contain zero bare imports outside the vendor allowlist → build fails |
| XSS inside remote DOM | same realm as host components — Svelte escaping applies; `{@html}` is banned by standards; no new injection class |
| Cross-chunk interference | vendor instance shared among remotes — first-party trust applies; a hostile remote could touch shared module state (accepted for same-owner modules) |
| Untrusted/marketplace modules (future) | **this model is insufficient** — requires a real sandbox (iframe/worker realm); different architecture, explicitly out of scope |

CSP notes: chunk import uses blob URL → `script-src` must allow `blob:`;
inline importmap needs a CSP hash or nonce (keep it server-rendered in
app.html). `module-assets` traversal guard already exists (job-handler).

### F.9 Decisions taken 2026-10-21 (user)

| # | Decision | Outcome |
|---|---|---|
| D10 | Vendor resolution | **import map in app.html** — accepted as the standard mechanism (W3C spec, same technique as microfrontend ecosystems), not a workaround |
| D11 | Granularity | **section-mount as primitive** — a page decl carries `layout.sections`; 1..N sections per page, each an independent remote `mount*` OR host-registered component. A single-section page = today's page-mount as the degenerate case. /ai may be 3 sections or 1 — layout decl chooses. **Placement is metadata**: `layout` IS the grid descriptor (one archetype — `columns`/`rows`/`gap` + per-section `span`/`col`/`row`); no layout enum — stack = `columns:"1fr"` auto-flow, split = `columns:"280px 1fr"`. User correction: stack/split/tabs as separate kinds conflated layout with page-archetype and UI widgets |
| D12 | Vendor set | **includes transformers — resolved via `@primebrick/ui/transformers` subpath** (user direction: "si installa come dep di UI"). UI owns `@huggingface/transformers@4.3.1` as its dep and re-exports the full API + types through the `./transformers` subpath — module devs `import { pipeline, env } from '@primebrick/ui/transformers'` with real DX, no HF install in their package. `VENDOR_BLOCKED_PACKAGES` makes direct `@huggingface/transformers` imports a build `reject`. Vendor asset = HF's own prebuilt `transformers.web.min.js` copied verbatim + `ort-wasm-simd-threaded.jsep.mjs` sibling. **Empirical correction to the "shared-class" constraint**: FE main-thread imports transformers NOWHERE (only the Web Worker — separate realm, bundles its own copy by design — and a Node E2E helper). So no host app-build externalization is needed: the vendored copy IS the single main-thread instance; worker cache still shared at browser level (Cache API/IndexedDB) |
| D-layout | **NO layout changes on `/ai`** (hard constraint, user-stated twice) | the page keeps its exact current UX — gauges, asymmetric model cards/lists, cache UI. Correction to earlier plan text: `ai_model` surface does NOT become `EntityTablePage` — **LISTE ≠ TABELLE**; `kind:"list"` today is a misnomer (it renders the table archetype); the real List archetype is root-plan task 9. The models section ships as remote-owned custom list sections, not a host table |

### F.10 Spike results — D13 executed (2026-10-21, verified live)

**Outcome: mechanism works end-to-end.** Implementation:

| Piece | Where | What |
|---|---|---|
| Closed allowlist | `@primebrick/core` `src/vendor-plane.ts` | `VENDOR_SPECIFIERS` (5 specifiers) + `resolveVendorSpecifier()` → `external`/`reject`/`bundle` — single source for host AND module builds |
| Host vendor build | `primebrick-fe-v3/vendor/vite.vendor.config.ts` | `pnpm vendor:build` → `static/vendor/{svelte,primebrick-core,primebrick-ui}.js` + `vendor-manifest.json` (specifier→{url,version}) |
| Union-per-package | `vendor/entries/svelte.ts` | `export * from 'svelte'` + `export * from 'svelte/internal/client'` + `import 'svelte/internal/disclose-version'` → ONE file, 215 exports, `mount`/`onMount`/`effect`/`template_effect`/`component`/`createRawSnippet`/`hydrate` all present |
| Import map | `src/app.html` | all 3 svelte specifiers → `/vendor/svelte.js` (browser dedupes by URL → single runtime instance); core/ui → own files |
| Lifecycle | `package.json` | `dev`/`build` run `vendor:build` first; `static/vendor/` gitignored (generated, deterministic) |
| Chunk externals | `job-handler/fe/vite.config.ts` | `vendorPlane()` plugin: allowlist→`external`, vendor-pkg non-allowlisted→**build error**, else bundle + `generateBundle` emit-gate (any non-allowlisted bare specifier in output = error) + `jobs-page.deps.json` `vendor_requires` {specifier: version} |
| FE↔core layering | `vite.vendor.config.ts` | **NO `@primebrick/core` package dep on FE** (hard rule: FE→ui, US→sdk). Vendor config imports the contract via sibling-repo `../primebrick-v3-core/dist` file path + `resolve.alias` maps `@primebrick/core`→`../primebrick-v3-core` for physical bundling — build-tool wiring, not a package dependency |

**Measured:**

- `jobs-page.js`: **102 KB → 14.34 KB** (30.5 → 3.49 KB gz) — the estimate held
- emitted bare imports (complete list): `svelte`, `svelte/internal/client`,
  `svelte/internal/disclose-version`, `@primebrick/ui` — all allowlisted
- vendor bundle sizes: `svelte.js` 131.6 KB (38.4 gz) · `primebrick-core.js` 47.3 KB · `primebrick-ui.js` 41.5 KB — fetched once, cached, shared by every future chunk

**Live browser proof** (playwright on the real `:5173` app — dev server serves `static/vendor` + the importmap with no restart needed):

- all 4 specifiers resolve through the document importmap — including from a **blob: URL** (the integrity path: fetch→sha256→import verified bytes) — `mount`/`untrack`/`effect`/`template_effect`/`component`/`extJsonStringify` all `function`
- `import('svelte') === import('svelte/internal/client')` → **dedup proved** — one svelte instance
- `window.__svelte.v = ["5"]` → disclose-version ran inside the vendored copy
- console clean; the only errors were the unrelated unauthenticated refresh-token probe on /login

**Build-time discoveries worth recording:**

- Vite **app-mode drops entry export signatures** (entries are script roots) —
  vendor bundles must build in `lib` mode or the `export *` facades emit empty
- pnpm `.pnpm/` paths contain **two** `/node_modules/` segments — the
  importer→package attribution regex must match the LAST segment
- `@primebrick/core` must NOT be an FE package dep (layering rule: FE consumes
  core only via `@primebrick/ui` re-export). A first attempt adding a `link:`
  dep was user-rejected. Correct approach: sibling-path import of the contract
  file + `resolve.alias` for bundling (config-time only)
- rolldown `preserveEntrySignatures` is not a valid key in vite 8 — moot in lib mode
- **`workspace:*` hazard found (70 svelte-check errors)**: ui/sdk/dal declared
  `"@primebrick/core": "3.0.0"` and core `"@primebrick/decimal": "3.0.1"` —
  plain semver. Running `pnpm install` inside one repo dir re-resolved it from
  npm → the published 3.0.0 (stale, missing filter_presets/sparkline/vendor-plane)
  replaced the workspace link → ui's `export * from '@primebrick/core'` d.ts
  resolved the stale copy → 70 missing-export errors in FE. Fix: all four
  converted to `workspace:*` (the us-v3/be convention — links locally, pnpm
  rewrites to real version at publish). Never install inside a single repo dir;
  run `pnpm install` at `primebrick-workspace/` root |

**Wired since:** task 12 — loader-side `verifyVendorDeps` handshake
(`<chunk>.deps.json` → `diffVendorRequirements` exact-match vs host
`vendor-manifest.json` → `vendor` error kind + graceful panel; 404 deps =
self-contained chunk, legal); task 13 — deps serving needed no change
(`module-assets` route is generic + traversal-safe; enforcement tests added);
task 15 — transformers vendor entry; task 14 — `layout.sections` section
composition: ONE grid archetype (`page_props.layout` in core,
`PageSectionSlot` per-cell error isolation, `host:` registry in FE,
`validatePageLayout` in sdk; chunkless descriptor pages supported). **Vendor
plane + section composition complete — AI migration unblocked pending
D1–D9 decisions.**

## Part G — D1–D9 decisions taken (2026-10-21, user)

| # | Decision | Outcome |
|---|---|---|
| D1 | Route leaf | **`/system/ai/models`** — leaf plural conforming to R1 (the models catalog is the page's primary content); `/system/ai` root → 307 → `/system/ai/models` (job `/system/job` → `/system/job/job-schedules` precedent) |
| D2/D3 | Delivery + decomposition | already resolved by D11 + D-layout: remote `esm-mount` chunk, `layout.sections`; `ai_model` surface stays remote-owned custom list sections — NOT `EntityTablePage` (LISTE ≠ TABELLE) |
| D4 | Shared components | **used-by-≥2 rule**: everything consumed by ≥2 call sites promotes to `@primebrick/ui` NOW (incl. `useModelCache`/`useAiModels`/`useSelection`/`useAiCerebellum` composables — vendored ui module is the shared singleton across host+remotes; api/i18n deps injected, no `$lib` imports inside ui). Single-use/non-common (`MachineCapabilitiesSection`, `useMachineCapabilities`, `GpuVendorIcon`) stays FE-local — deferred |
| D5 | MFA step-up | **`ctx.components.mfaStepUp(requestFn, {action, target_resource}) → Promise<Response>`** — host-bound fn mirroring `useMfaStepUp.executeWithToken`; dialog rendered host-side (own root, no rune state crosses) |
| D6 | Sheets | **`ctx.components.openSheet(panelKey, props)`** — host-bound fn delegating to the real `openSheet`; panels stay host-owned; props are plain values (+ callback fns, which cross) |
| D7 | docs-index | **in scope** → `/system/ai/docs-index`. User correction: the whole point is that AI pages are in the WRONG place — wrong route, wrong nav, wrong visibility. `partOf:"system"` is already correct in `index.ts`; the invisible module is caused by the missing `endpoints.nav` decl (job registers `JOB_NAV`; ai registers nothing) — task 3 fixes it |
| D8 | Access namespace | **JOB precedent — NO `access` field** on `AI_NAV` (verified: `JOB_NAV`/`CRM_NAV` declare none); module visible to any authenticated user; NO DB patch, NO `access.system.ai.*` grants |
| D9 | Legacy routes | **HARD CUT — JOB precedent** (verified: zero `job` dirs remain under `settings/`): delete `settings/ai/` + `settings/docs-index/` dirs + their BE `MODULE_NAV.settings` entries; NO redirect pages — breaking change accepted |

**D4 move list (verified call-site counts):**

| Piece | Consumers | → ui |
|---|---|---|
| `ModelIcon` + Qwen/Meta/Microsoft/Nvidia/IBM/Gemma/DeepSeek/HF icons | page, AiModelImportPanel | ✅ |
| `ScoreGauge` + `gaugeColor` | MachineCapabilitiesSection, AiModelTestReport | ✅ |
| `CerebellumRecommendationBadge` | page, AiCerebellumPanel | ✅ |
| `AiModelTestReport` | page, AiModelTestReportPanel | ✅ |
| `RankMeter` | AiModelOption, ModelCachePanel, ModelCacheSection, AiModelImportPanel | ✅ |
| `StorageBreakdownBar` | ModelCacheSection, ModelCachePanel | ✅ |
| `ModelCacheSection` | page, `shell.aiModelCache` sheet content | ✅ |
| `AiModelOption` | ai-model-selector, AiCerebellumPanel | ✅ |
| `ai-model-test-scores.ts`, `ai-cerebellum.ts`, `modelVariantKey` + AiModel/AiCerebellum/ExecutionConfig types | page + panels (type boundary must be importable by the chunk → ui re-export) | ✅ |
| `useModelCache` (445 LOC) | ModelCacheSection, ModelCachePanel, ai-chat-panel, ai-model-details-popover | ✅ |
| `useAiModels` (200 LOC) | page, ModelCacheSection, ModelCachePanel, ai-chat-panel, use-ai-assistant, useAiCerebellum | ✅ |
| `useSelection` | ModelCacheSection, ConfigList | ✅ |
| `useAiCerebellum` | ai-chat-panel, use-ai-assistant | ✅ |
| `MachineCapabilitiesSection`, `useMachineCapabilities`, `GpuVendorIcon` | AI page only | ⏸ deferred |
| `useConfigEntries`, `NumberTicker`, `resumable-fetch` | generic infra — moved only if pulled in by a moved dep | case-by-case |
