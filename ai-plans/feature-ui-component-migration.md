# UI Component Migration — incremental, `/ai`-first (`$lib` → `@primebrick/ui`)

> Continuation of `feature-ai-pages-module-ownership.md` task 1d (D4 decision)
> and the `feature/table-pages-merge` stream. User direction 2026-10-21:
> **one component at a time — empirically verified on 2-3 distinct real
> usage contexts — fix drift — then next.** Not all components at once:
> only those mandatory for `/ai` now; the rest progressively until zero
> drift. Scope: FE `primebrick-fe-v3` + package `primebrick-v3-ui`.

> Hard constraint (carried over): `/ai` keeps its exact current UX — every
> migrated component must render/behave identically in EVERY context that
> already uses it. A component is "done" only after live verification, not
> after type-check.

## Status: ⚪ TODO — Plan date: 2026-10-21

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 0 | Foundations — ui deps (bits-ui/tv/lucide), bridges (i18n/sheet/service-api), host-Api ctx bridge, `@source` for ui in app.css, `.svelte.ts` packaging proof | ⏳ not done | — | blocks EVERYTHING — tailwind classes in ui dist are invisible to the FE scan without `@source` (silent unstyled drift) |
| 1 | Leaf libs — ai types, test-scores, cerebellum, etag-store, resumable-fetch, badge colors, format-bytes | ⏳ not done | — | pure; enables E2–E5 |
| 2 | Leaf AI components — ScoreGauge, ModelIcon(+8), RankMeter, StorageBreakdownBar | ⏳ not done | — | first i18n consumers (StorageBreakdownBar) prove `bindI18n` |
| 3 | Composables — useSelection, useAiModels, useAiCerebellum, useModelCache, useConfigEntries | ⏳ not done | — | service-api binding; `useModelCache` is the heavy verification |
| 4 | Widget primitives — button→badge→button-group→checkbox→popover→command→dialog→refresh-button→number-ticker→toolbar→combo-select→deletion-filter-toggle→**otp-input** | ⏳ not done | — | strict dependency order, one at a time. **otp-input carries a MANDATORY doc migration in the same move** (doc-audit-repair#2/D2 — "docs move WITH the component"): rule `password-input-standard.md` §Exceptions, ai doc, dev-guide `ui-patterns.mdx` OTP references → all to `primebrick-v3-ui` |
| 5 | AI composites — AiModelOption, CerebellumRecommendationBadge, AiModelTestReport, ModelCachePanel, ModelCacheSection, MachineCapabilitiesSection(+GpuVendorIcon, useMachineCapabilities) | ⏳ not done | — | needs E2–E4 complete |
| 6 | Residual contracts — DeleteDialog path (mount_host vs helper), `api_host` for BE-path reads (useConfigEntries/updateConfigEntry), sheet-open inside ui (bound bridge) | ⏳ not done | — | decided per-gap during execution |
| 7 | Doc note — "new reusable components land in `@primebrick/ui` at creation" → AGENTS.md + dev-guide | ⏳ not done | — | user-requested rule |

---

## Method — the per-component loop (MANDATORY, every epic row)

1. **Move** the file(s) into `primebrick-v3-ui/src/lib/…`, adapting:
   - `$lib/…` imports → package-relative paths
   - `$t(key)` → `getT()(key)` (bridge, never a prop drill)
   - `apiFetch`/`fetchX` → `getServiceApi('ai'|'host')` injected fetch
   - `openSheet(...)` → `getOpenSheet()(...)` (bound bridge)
   - `browser` (`$app/environment`) → `typeof localStorage !== 'undefined'` /
    `typeof document !== 'undefined'` (ui is env-neutral)
   - `tailwindcss/colors` and any other FE-only dep → decide per case, ask
     before adding a dependency to ui
2. **Rewire** every call site in FE (`grep` the import path — all consumers
   move their import to `@primebrick/ui`, nothing else changes).
3. **Build** `pnpm -C primebrick-v3-ui build`, then `pnpm -C primebrick-fe-v3 vendor:build`
   so the vendored copy carries the new piece, and `svelte-check` is green.
4. **Verify empirically** on the running dev server — open EVERY real usage
   context listed for the component (2-3 minimum), compare against the
   pre-move behavior: rendered output, interactions, console/network. If the
   dev server is running, restart it after vendor rebuild (stale optimizer
   lesson — the running server caches the dep graph).
5. **Fix drift** (missing class → check `@source`/tokens; missing label →
   check `bindI18n` order; wrong state → check realm split) before touching
   the next component.

Drift types to hunt, known in advance: **visual** (tailwind classes not
generated for ui source — `@source` coverage), **i18n** (unbound `getT`),
**state** (vendored-vs-host realm split — in-memory singletons exist once
per realm; browser-level stores (localStorage/Cache API/IndexedDB) are
shared), **api** (wrong service base → 404/502).

---

## E0 — Foundations (no components move; everything depends on it)

| # | Piece | Detail |
|---|-------|--------|
| F1 | ui package deps | add `bits-ui@2.19.5`, `tailwind-variants@3.3.1`, `@lucide/svelte@1.59.0` (exact FE versions — verify `pnpm view` before adding); `tailwindcss`/`clsx`/`tailwind-merge` only if actually imported by moved code (cn already lives in ui) |
| F2 | `src/lib/bridges.ts` | `bindI18n(t)`/`getT()`, `bindSheet(fn)`/`getOpenSheet()`, `bindServiceApi(name, fn)`/`getServiceApi(name)` — named slots: `'ai'` = `/ws/ai`-relative, `'host'` = full-path apiFetch. Unbound getter throws a descriptive error (no fake fallback) |
| F3 | FE binding init | one module (e.g. `src/lib/host-bindings.ts`, imported at app boot — root layout import or `$lib/api` init): `bindI18n`, `bindSheet(openSheet)`, `bindServiceApi('host', apiFetch)`, `bindServiceApi('ai', (p,i)=>apiFetch('/ws/ai'+p,i))`. Remote binds its own vendor-realm copies at mount from ctx |
| F4 | `@source` in FE `app.css` | Tailwind v4 auto-scan does NOT cover `node_modules`/linked dist → add `@source "../primebrick-v3-ui"` (or dist path) so moved components' classes are generated. **Verify**: a ui component with `text-muted-foreground`/`bg-background` renders styled — this is the silent-drift vector #1 |
| F5 | `.svelte.ts` in ui | `svelte-package` must emit rune modules consumable by FE dev + vendor build — prove with `useSelection` or a dummy before mass moves |
| F6 | `ctx.components.hostApi` | new built-in bridge in `host-bridges.ts` = plain `apiFetch` — remotes reach BE-owned paths (`/api/v1/entities/config_entry/*`) which `ctx.api` (ws-bound) cannot |
| F7 | Element types | `WithElementRef`/`WithoutChildrenOrChild` from `$lib/utils` — needed by button/checkbox wrappers → move to `ui/lib/utils/types.ts` |

**E0 acceptance**: ui builds + svelte-check 0/0; a throwaway ui component
with tailwind classes + `getT()` label renders styled+translated on a real
FE page; `getServiceApi('ai')` call from a ui composable hits `/ws/ai/…` and
returns data (DevTools network proof).

---

## E1 — Leaf libs (pure, no widget deps)

| # | Piece (FE source) | LOC | Internal deps | Consumers (= live test contexts) | Notes |
|---|-------------------|-----|---------------|----------------------------------|-------|
| L1 | `ai/types.ts` ← `api-types.ts` (AiModel, AiCerebellum, ExecutionConfig, modelVariantKey) + `DeletionFilterMode` | ~60 of 471 | none | type-check + every site compiles; FE `api-types.ts` re-exports (barrel — single source stays ui) | pure types + 1 fn |
| L2 | `ai/ai-model-test-scores.ts` | 255 | none | `ai-model-test-scores.test.ts` (move with it), RankMeter, AiModelTestReport, +page rankExplanation | exports `summarizeTestScores`, `testCaseLabel`, `turnSpeedScore`, `rankColor` |
| L3 | `ai/ai-cerebellum.ts` | 79 | types only | +page (effective params), AiCerebellumPanel | `resolveEffectiveParams`, `tuningOverriddenKeys` |
| L4 | `cache/etag-store.ts` ← `fe-cache-store.ts` | 104 | `$app/environment`→`typeof` | `api.ts` apiFetch (304 round-trip on any list page), useAiModels, useAiCerebellum | localStorage wrapper — check DevTools `If-None-Match` still flows |
| L5 | `ai/resumable-fetch.ts` | 565 | none | `resumable-fetch.test.ts` (move), useModelCache | model download/resume path |
| L6 | `colors/badge.ts` (`badgeClassesFromToken`) | 124 | `tailwindcss/colors` ⚠ | ComboSelect only | `tailwindcss` import inside ui — decide: dep vs inlined palette |
| L7 | `utils/format-bytes.ts` | ~40 | none | RankMeter/StorageBreakdownBar if imported — confirm during E2 | move only if pulled in |

## E2 — Leaf AI components

| # | Component (FE source) | LOC | deps needed first | Live test contexts |
|---|----------------------|-----|-------------------|--------------------|
| C1 | `ScoreGauge` + `gaugeColor` | 89 | none | /ai model rows · AiModelTestReport (until moved, keep both call paths) · MachineCapabilitiesSection |
| C2 | `ModelIcon` + Qwen/Meta/Microsoft/Nvidia/Ibm/Gemma/DeepSeek/HuggingFace icons | 73+8f | none | /ai model rows · AiModelImportPanel (sheet) |
| C3 | `RankMeter` | ~60 | L2 (`rankColor`), cn | ModelCacheSection · AiModelImportPanel · AiModelOption |
| C4 | `StorageBreakdownBar` | ~80 | F2 (`getT` — first i18n consumer) | ModelCacheSection · ModelCachePanel — **verify label translations** |

## E3 — Composables (service-api binding)

| # | Composable | LOC | deps needed first | Live test contexts | Binding |
|---|-----------|-----|-------------------|--------------------|---------|
| S1 | `useSelection` | 73 | F5 (.svelte.ts proof) | ConfigList · ModelCacheSection | none — also the `.svelte.ts`-in-ui proof |
| S2 | `useAiModels` | 200 | L1,L4 + `getServiceApi('ai')` | /ai page · ai-chat-panel · ModelCachePanel/Section | `'ai'` slot; `fetchAiModels`/`fetchAiCerebellum` fetchers move beside it (service-relative paths) — FE `api.ts` wrappers delegate so non-migrated call sites keep working |
| S3 | `useAiCerebellum` | 96 | L1,L4 + `'ai'` | ai-chat-panel · use-ai-assistant | same |
| S4 | `useModelCache` (+ `friendlyModelName`) | 445 | L5 | ModelCacheSection · ModelCachePanel · ai-chat-panel · ai-model-details-popover | none (browser APIs) — **verify download/persist/delete round-trips**; realm split = in-memory progress diverges between host panel and remote section, Cache API/IndexedDB stay consistent |
| S5 | `useConfigEntries` | 86 | L4 + `getServiceApi('host')` | /ai page (default model) · configurations page · CurrencySelectPanel | `'host'` slot — remote needs `ctx.components.hostApi` (F6) |

## E4 — Widget primitives (STRICT order — each unblocks the next layer)

| # | Widget (dir) | Key deps | Live test contexts |
|---|-------------|----------|--------------------|
| W1 | `button/` (+`buttonVariants`, index) | cn, `tv`, F7 types | ~97 sites — pick 3 diverse: toolbar CTA · dialog action · sheet panel |
| W2 | `badge/` | `tv`, cn | /ai default-model badge · ComboSelect chips · docs-index status badges |
| W3 | `button-group/` | `tv`, cn | /ai fits-machine segmented toggle · DeletionFilterToggle |
| W4 | `checkbox/` | bits-ui, cn, F7 | ModelCacheSection selection checkboxes |
| W5 | `popover/` (5 files) | bits-ui, cn | CerebellumRecommendationBadge · AiModelTestReport · ComboSelect dropdown |
| W6 | `command/` (10 files) | bits-ui, cn | ComboSelect option list only |
| W7 | `dialog/` + `dialog-bordered` | bits-ui, cn | DeleteDialog flow · cache delete confirm · MfaStepUpDialog (host-stays) |
| W8 | `refresh-button/` | Button + `getT` | models toolbar · cache section · machine caps |
| W9 | `number-ticker/` | `svelte/motion`, cn | MachineCapabilitiesSection |
| W10 | `toolbar/` (3 files) | bits-ui, cn, RefreshButton, Snippet | /ai models toolbar — the snippet-group API is THE consumer to re-prove |
| W11 | `combo-select/` (632L — heaviest) | W5+W6+W2, L6, `getT` | /ai cerebellum assistant selector · AiCerebellumPanel · smart-regex ModelCachePanel triggers |
| W12 | `deletion-filter-toggle` | W1+W3, `getT` | /ai models toolbar (deleted filter) |

## E5 — AI composites

| # | Component | LOC | deps needed first | Live test contexts |
|---|-----------|-----|-------------------|--------------------|
| A1 | `AiModelOption` | ~80 | C2+C3+L1 | AiCerebellumPanel · ai-model-selector |
| A2 | `CerebellumRecommendationBadge` | 106 | W5+`getT`+lucide | /ai model rows · AiCerebellumPanel |
| A3 | `AiModelTestReport` | 104 | W5+`buttonVariants`+`getOpenSheet`+L1/L2 | /ai rows (popover) · `shell.aiModelTestReport` sheet — **sheet bridge inside ui** |
| A4 | `ModelCachePanel` (popover, smart-regex-input) | ~90 | C2+C3+C4+S2+S4+W1+`getOpenSheet` | ai-model-selector popover in chat contexts — opens `shell.aiModelCache` via bridge |
| A5 | `ModelCacheSection` | 454 | S2+S4+S1, W1+W4+W7+W8, C2–C4 | /ai page bottom section · `shell.aiModelCache` sheet (AiModelCachePanel wraps it — must stay identical) |
| A6 | `MachineCapabilitiesSection` + `GpuVendorIcon` + `useMachineCapabilities` (563L) | 197+563 | C1, W8+W9, navigator.gpu/`performance` probes | /ai page top section only — single-use but page-mandatory |

## E6 — Residual contracts (decide at execution, not assumptions)

| # | Gap | Options | Constraint |
|---|-----|---------|-----------|
| R1 | `DeleteDialog` + `EntityConfirmQuestion` — coupled to `getEntitiesNsContext` (entity-list context) | a) `ctx.components.deleteDialog(opts)` host helper · b) `ctx.mount_host` per delete · c) decouple to explicit props in ui | entity-list-table infra used app-wide — do NOT drag the table workstream in; (a) is consistent with mfaStepUp/openSheet |
| R2 | `openSheet` inside ui components (A3/A4) | `getOpenSheet()` bound bridge (F2) — host binds real fn, remote binds `ctx.components.openSheet` | chosen pattern |
| R3 | BE-path reads/writes from remote (`useConfigEntries`, `updateConfigEntry` for `ai_assistant_model`) | `ctx.components.hostApi` (F6) + `getServiceApi('host')` | chosen pattern |
| R4 | `tailwindcss/colors` in `badgeClassesFromToken` (L6) | ui dep vs inlined palette | decide when W11 lands |

---

## Doc note (user-requested, epic rule)

> **Every new component judged reusable lands in `@primebrick/ui` at
> creation — never in `$lib/components/ui`.** To be written into
> `primebrick-v3-ui` AGENTS.md + FE `AGENTS.md` + `docs/dev-guide` (module
> pages can only consume vendored packages — anything FE-local is
> unreachable to remotes, so "reusable" and "FE-local" are now
> contradictory by definition).

## Acceptance (plan-level)

1. Every listed component/composable/lib lives in `primebrick-v3-ui`,
   FE call sites import it from `@primebrick/ui`, and each was verified
   live on its listed contexts with zero visual/behavioral drift.
2. `/ai` page runs on ui-owned pieces end-to-end — the remote-section
   composition (ai-pages plan tasks 4–6) then ships as pure decl+chunk
   work, no more FE-internal dependencies.
3. No `pnpm install` inside a single repo (workspace rule); ui deps added
   at workspace root with pinned versions.
