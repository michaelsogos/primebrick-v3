# EmailSender Pages — Module Ownership Migration (Settings → `emailsender` service)

> Continuation of `feature-ai-pages-module-ownership.md` (DONE). Decisions
> confirmed by user 2026-10-24:
> - **Q1 = B** — providers page becomes `kind:"list"` host-rendered
>   `EntityTablePage` (standard archetype via `/ws/emailsender` proxy);
>   create/edit are REMOTE form pages in `emailsender-pages.js` (JH model).
> - **Q2 = YES** — module-level `access` becomes MANDATORY when a service
>   declares nav (validator + lint). JH conforms (`access.system.job`).
> - **Q3 = YES** — job-handler gets `config-route.ts` (modules/[code] config
>   tab stops 404ing).
> Scope: the single custom page `email-providers` only. `email_template`/
> `sender_log` entities have no UI today — future pages are a later sub-plan.
>
> **2026-10-24 PM — BLOCKED-BY `feature-access-axis-redesign.md`**: the
> access model deepened mid-review — item `access` dies (keys are derived
> pure), module gate becomes derived visibility, `default` leaf replaces
> `home`, bare-prefix routes become illegal, coverage is exact|wildcard.
> The emailsender nav decl lands on the FINAL contract (providers leaf +
> `default` flag), not the interim one.

## Status: � DONE — Plan date: 2026-10-24 — all tasks landed + live-verified in browser. Task 17 docs regen SKIPPED per explicit user instruction; commits landed on `feature/table-pages-merge` in sdk/be/us/fe/workspace

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| **S0 — access contract (SDK + lint + JH)** |
| 1 | SDK `validateNavDeclaration` — module-level `access` REQUIRED when decl publishes `nav`/`routes`/`sheets`; value must equal `accessNamespace(code, partOf)` | ✅ done | 2026-10-24 | absorbed by access-axis redesign (task 2 there) — plus strictlyUnderAny + exactly-one-`default` + item-access rejection |
| 2 | `check-standards.ts` new gated rule — scan `nav-declaration.ts` files, fail when nav declared without `access:` | ✅ done | 2026-10-24 | `nav-decl-access` rule — proven both directions |
| 3 | JH: `access: "access.system.job"` on `JOB_NAV` + decl test update | ✅ done | 2026-10-24 | + `default:true` on job-schedules; re-registered online |
| 4 | JH: `config-route.ts` (emailsender/ai pattern — list/get on `job.config_entries`) wired in `makeServiceRoutes` | ✅ done | 2026-10-24 | wired in `service-routes.ts`; JH tsc clean |
| 5 | `.devin/check-standards.json` for `emailsender` AND `ai` — `i18n_namespaces` activates `i18n-key-ns` patch lint | ✅ done | 2026-10-24 | `["app","system","emailsender"]` / `["app","system","ai"]` |
| **S1 — emailsender service side (us-v3)** |
| 6 | `emailsender/src/nav-declaration.ts` + `nav`/`labelKey` in `index.ts` | ✅ done | 2026-10-24 | `access.system.emailsender`, `default:true` on providers leaf; decl test 6/6 |
| 7 | Routes census: `entityPaths` list/create/`[uuid]` — list host-rendered, create+detail remote `emailsender-pages.js` | ✅ done | 2026-10-24 | `[uuid]` params ride `ctx.components.params` — live getter + `{#key}` remount in shim (no core contract change) |
| 7a | `provider` → canonical `EntityRouteDecl` (no-op `auditPort`, `auditable:false`, api_key masked in list) | ✅ done | 2026-10-24 | `providers.service.ts` + `provider.meta.ts` + `entities-route.ts`; `providers-route.ts` deleted; tsc clean |
| 7b | `module-assets-route.ts` (JH clone) wired into `composite-route.ts` | ✅ done | 2026-10-24 | serves `fe/dist` at `/api/v1/module-assets/*` |
| 7c | `src/db/entity-repo.ts` + nav-declaration test | ✅ done | 2026-10-24 | 6/6 green |
| 8 | `emailsender/fe/` scaffold — vite lib, `host-contract.ts`, `ProviderFormPage.svelte`, `emailsender-pages.js` + deps.json | ✅ done | 2026-10-24 | fe:build ✓ (9.7kB), fe:check 0/0 |
| 9 | db-meta patch `20261024230000_providers_pages_ownership.sql` — 22 `system.settings.emailProviders.*` keys → `emailsender.providers.*`, `tabs.emailProviders` → `emailsender.nav.providers`, +`emailsender.module.name`, +`emailsender.entities.provider.*` (10 keys ×7) | ✅ done | 2026-10-24 | signed dev-micha-2, applied: 154+70+14 rows, 0 stale system keys |
| 10 | Redis invalidation — `DEL translations:i18n:{system,emailsender,ai}:*` | ✅ done | 2026-10-24 | system+ai deleted (emailsender never cached) |
| **S2 — FE side** |
| 11 | `ENTITY_SERVICE_MAP` += `provider: 'emailsender'` (api.ts) | ✅ done | 2026-10-24 | |
| 12 | Thin routes: providers list (EntityTablePage), create + `[uuid]` RemotePageMount shells, `/system/emailsender/+page.ts` redirectToModuleDefault shim | ✅ done | 2026-10-24 | svelte-check 0/0, FE unit 474/474 |
| 13 | Hard cut: `settings/email-providers/` deleted + MODULE_NAV nav-item + census route removed | ✅ done | 2026-10-24 | BE modules 274/274; zero references left |
| **S3 — verify + close** |
| 14 | Service restart → registration online; `/modules` shows emailsender nav gated `access.system.emailsender` | ✅ done | 2026-10-24 | port 3003, registry `online`, nav carries default leaf + component_url on create/detail |
| 15 | Live: list via proxy, create→remote form, edit→remote form (uuid param), delete via standard dialog; dict `emailsender` resolves from route_prefix | ✅ done | 2026-10-24 | browser-verified (e2e_verify_admin, deleted after): list/create/edit/delete full cycle; list masks api_key (absent), get preserves it; `/system/emailsender`→`/providers` default-leaf redirect; legacy `email-providers` URL → 404 |
| 16 | Tests: svelte-check 0/0, FE unit, US decl tests (new access rule), BE nav 7/7, lint new rule green | ✅ done | 2026-10-24 | svelte-check 0/0, FE 474/474, BE modules 274/274, emailsender 31/31, check:standards green |
| 16a | FIX landed during verify: `ssr = false` on ALL module-root shims (settings/job/ai/crm/emailsender) — apiFetch doesn't forward cookies in SSR; + `editPath` census-derived on providers list (`[uuid]`→`:uuid`) | ✅ done | 2026-10-24 | defect of the access-axis shim sweep, surfaced by emailsender live verify |
| 17 | Commits per repo (sdk `fc943da`, be `279027b`, us `15d2ea5`, fe `dbee2ea`, workspace) — docs regen SKIPPED per explicit user instruction | ✅ done | 2026-10-24 | docs defer to a future docs pass |

---

## Part A — Audit findings (2026-10-24)

### A.1 Current state

- FE page: `src/routes/(app)/system/settings/email-providers/+page.svelte`
  — custom inline-CRUD (list + create/edit form + confirm delete), calls
  `apiFetchExt('/ws/emailsender/api/v1/entities/provider/*')` with
  `{entity}` write envelope; i18n `system.settings.emailProviders.*`.
- BE `module-nav-meta.ts` settings slice: nav link
  `{id:"email-providers", label_key:"system.settings.tabs.emailProviders", href:"/system/settings/email-providers", icon:"mail"}`
  + route `{route:"/system/settings/email-providers", kind:"list", entity:"email_provider"}`
  — the `entity` name is **stale/wrong** (service serves `provider`);
  dies with the cut.
- emailsender service: `partOf:"system"` (prefix `/system/emailsender`,
  ns `access.system.emailsender`), NO `nav`, NO `labelKey`, NO `fe/` dir.
  Already has `controllers/http/config-route.ts` (the precedent copied by
  AI) + `providers-route.ts`; entities: `provider`, `email_template`,
  `sender_log`, `config_entry`. Port **3003**.
- `emailsender.translations` table EXISTS but EMPTY;
  `system.translations` holds 161 keys
  (`system.settings.emailProviders.*` + `system.settings.tabs.emailProviders`,
  23 keys × 7 languages).
- Translations serving: `fetchModuleTranslations('emailsender')` →
  `GET /api/v1/system/translations/emailsender/:lang` — resolves the
  `<ns>.translations` table via `service_registry` auto-discovery
  (`translations.service.ts:151-176`, `MODULE_ENTITIES` static only for
  app/system/settings/custom). **Zero BE change needed.**

### A.2 JH gap analysis (vs the AI model)

| Aspect | JH state | AI state | Gap? |
|--------|----------|----------|------|
| `entities_ns` | `"job"` on all 3 metas | `"ai"` | ✅ no |
| translations | `job.translations` owned, 0 residue | `ai.translations` owned | ✅ no |
| `labelKey` | `job.module.name` | `ai.module.name` | ✅ no |
| nav-declaration | routes+sheets+component_url | same | ✅ no |
| deps manifest | `jobs-page.deps.json` | per-chunk deps.json | ✅ no |
| module-assets route | present | present | ✅ no |
| **`access` module-level** | **absent — module ungated** | `access.system.ai` | ⚠️ **YES → task 1-3** |
| config route | **absent** — config tab 404 | `config-route.ts` | ⚠️ **YES → task 4** |
| chunk split | single `jobs-page.js` | `ai-pages.js`+`ai-sheets.js` | no — warms identically |
| `.devin/check-standards.json` | `i18n_namespaces:["app","system","job"]` | **missing** (also emailsender) | ⚠️ **YES → task 5** |

### A.3 FE/BE dead-code audit (post-AI refactor)

- FE: **clean**. `smart-ai/` consumed internally by `ai-chat-panel`;
  `useConfigEntries` legit (settings/configurations); `fetchDocsIndex`
  legit (host DocsPanel consumes `/ws/ai` docs domain). Cosmetic only:
  `smart-ai/index.ts` over-exports 3 components used only internally.
- BE: **clean** for AI residue. Stale-by-design (dies with this migration):
  `entity:"email_provider"` in nav-meta; `system.settings.tabs.emailProviders`;
  e2e `module-ownership.spec.ts` "headless" comments.
- **Route archetype reality-check** (this session): no generic
  meta-driven form exists host-side — host create/edit pages are bespoke
  (users, configurations). Lists ARE generic (`EntityTablePage` thin
  route, census `kind:"list"`, `entityApiBase` → `/ws/<svc>`).
  `ENTITY_SERVICE_MAP` in `src/lib/api.ts:41` needs `provider:'emailsender'`.
- Remote `kind:"detail"` (leaf `[param]`) is valid in the census grammar
  (`DETAIL_LEAF_RE`, `entityPaths` derives it). JH declares list+create
  only, so no remote page has consumed route params yet — but NO contract
  change is needed: `ModuleHostComponents` is an open record
  (`[key:string]: unknown`, plain values documented —
  `appendListFilterParams`, `settingsTabMenuSegment` precedents). The
  `[uuid]` shim `+page.svelte` reads SvelteKit `page.params` and injects
  `components.params`; the remote chunk reads `ctx.components.params.uuid`.
- **providers CRUD → canonical `EntityRouteDecl`** (verified): the
  hand-rolled `providers-route.ts` serves meta `{entity,module,fields[]}`
  and list `{providers:[...]}` — BOTH non-conformant (`EntityMetaResponse`
  needs `translation_key`/`uid`/`display_field`/`columns`/`actions`/
  `collaboration`; `useEntityList` needs `page`/`page_size`/`total` +
  search/filter/sort). The controller also calls `getDal()` directly —
  a controller-boundary violation. Migration is REQUIRED for the
  `EntityTablePage` archetype, not optional.
- **Audit trail (verified — NO schema change)**: `provider` is
  `Auditable`-columns (created_by/updated_at/version stamped via `actor`)
  with NO `providers_audit` table — BY REQUIREMENT, entities may be
  audit-columned without a trail. `makeEntityService` default
  `makeTableAuditPort` would attempt the missing `_audit` insert — caught
  by the repo's fire-and-forget `.catch(logger)` so writes still succeed,
  but it would log `[DAL Audit Error]` per write. Inject a no-op
  `auditPort` via `EntityServiceConfig` (the documented per-entity
  variation seam). Decl `auditable:false` → `collaboration.enabled:false`,
  no `/audit` route — `EntityTablePage` renders non-trailed entities fine.

## Part B — Resolved decisions (2026-10-24, user-confirmed)

- **Providers archetype = B**: `kind:"list"` host `EntityTablePage` at
  `/system/emailsender/providers` + remote `ProviderFormPage` for
  create (`/providers/create`) and edit (`/providers/[uuid]`) in
  `emailsender-pages.js`. Old custom page dies entirely — list becomes
  config, only the form stays custom.
- **Access mandatory**: `validateNavDeclaration` rejects nav-decl without
  module `access` (must equal `accessNamespace(code,partOf)`); lint rule
  in check-standards scans decl files. JH conforms.
- **JH config-route**: emailsender-pattern `config-route.ts` on `job`.
- **Route shape**: `/system/emailsender/providers` (module root redirects;
  room for `templates`/`logs` pages later — JH naming).
- **`access` = `access.system.emailsender`** (derived `partOf:'system'` +
  `code:'emailsender'` — never free-chosen).

## Part C — i18n key mapping (patch)

```
system.settings.emailProviders.<x>   → emailsender.providers.<x>
system.settings.tabs.emailProviders  → emailsender.nav.providers
(new)                                → emailsender.module.name      ("Email Sender" ×7 langs)
(new)                                → emailsender.entities.provider.singular|.plural ×7
(new)                                → system.entities.page_title.* reused (list/create/edit templates — no new keys)
```

Leaf names inside `emailProviders.*` keep verbatim — only the prefix is
rewritten. DELETE moved keys from `system.translations` (move, not copy).
After apply: `redis-cli DEL translations:i18n:system:* translations:i18n:emailsender:*`
(+ `ai:*` — pending invalidation debt from 0008 manual apply).

## Part D — Ops debt carried

- `translations:i18n:system:*` + `ai:*` Redis invalidation (0008 applied
  manually without DEL — stale `system.ai.*` keys may be served ≤6h).
- `ai` `.devin/check-standards.json` missing → `i18n-key-ns` inactive on
  ai SQL patches (task 5 fixes alongside emailsender).
