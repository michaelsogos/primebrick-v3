# AI Pages — Module Ownership Migration (Settings → `ai` service)

> Sub-plan of `metadata-driven-page-system.md` task 19 (partial) and the
> `feature/table-pages-merge` stream. Precedent established by job-handler:
> service-owned `nav-declaration.ts` → `endpoints.nav` → `/modules` payload →
> remote `esm-mount` chunks served via `/ws/ai/api/v1/module-assets/*`.
> Scope is **AI pages only** — `email-providers`/`templates`/`migrations` and
> other settings pages are out (same pattern, later sub-plans).

## Status: ⚪ TODO — Plan date: 2026-10-21 (inventory verified live in code)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Decision gate — user resolves D1–D9 (Part D) | ⏳ not done | — | **blocking**: route names, delivery mode, component ownership |
| 2 | `ai/src/nav-declaration.ts` — `entityPaths`-derived routes + nav links + `access.system.ai.*` decls | ⏳ not done | — | same file shape as `job-handler/src/nav-declaration.ts` |
| 3 | Wire decl into `createMicroservice({ nav })` in `ai/src/index.ts` | ⏳ not done | — | `partOf:"system"` already set (index.ts:31) |
| 4 | `ai/fe/` remote-chunk scaffold (vite lib build + `module-assets` route) | ⏳ not done | — | clone job-handler `fe/` layout + its module-assets controller |
| 5 | Migrate the AI console page surface (per D2/D3) | ⏳ not done | — | 721 LOC today — see Part C inventory of host deps |
| 6 | Migrate `/system/settings/docs-index` page (per D7) | ⏳ not done | — | all data endpoints already `/ws/ai/*` |
| 7 | FE route moves + compatibility redirects | ⏳ not done | — | `/system/settings/ai` → redirect (job `/system/job` precedent) |
| 8 | i18n: `system.settings.tabs.ai`/`docsIndex` → `ai.*` module dict + signed db patch | ⏳ not done | — | job patch `0014_job_schedules_page_label` precedent |
| 9 | Access namespace migration `access.system.ai.*` (per D8) | ⏳ not done | — | grant surface changes for non-admins |
| 10 | Tests: decl validator test (US) + census/ownership unit (FE) + E2E | ⏳ not done | — | reuse `nav-declaration.test.ts` shape |
| 11 | Docs sync (module-navigation, app-shell, ai docs) + commit | ⏳ not done | — | `make-docs` skill per repo |

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
