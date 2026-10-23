# Doc Audit Repair — cross-repo documentation fixes

> Standalone plan from the 2026-10-21/22 full-corpus audit (9 repos, ~150 doc
> files read by 4 parallel auditors). Fixes documentation discrepancies found
> doc↔doc and doc↔code. Executed in tranches of ~10 items per session.
> **Nothing here touches product code except where explicitly marked.**

## Status: 🟡 PARTIALLY DONE (tranche 1-2-4 done; task 14 → decided `pnpm deploy`; tranche 3 done earlier; tranche 5 + decisions 35/38/45 pending) — Plan date: 2026-10-22 19:00 UTC / 2026-10-22 21:00 CET — Updated: 2026-10-23

| # | Task (detail level) | Status | When | Notes |
|---|---------------------|--------|------|-------|
| **TRANCHE 1 — Rules & governance (contradictions that steer the agent)** |
| 1 | Dev-server rule: rewrite per-repo (all repos except website/docs) with empirical PID-owner logic; shrink workspace AGENTS.md to pointer-only; add "workspace = pointers, never normative" clause | ✅ done | 2026-10-22 | D1: option B + anti-workspace safeguard |
| 2 | OTP input: fix `password-input-standard.md` §Exceptions + `ui-patterns.mdx:311` → point to `OtpInput`; register mandatory doc migration of ALL OTP docs to `primebrick-v3-ui` when the component moves (link to feature-ui-component-migration) | ✅ done | 2026-10-22 | D2: option A — docs move WITH the component |
| 3 | Env-policy rule: replicate into every repo except website/docs (be exists already; add to fe/us/sdk/dal/ui/core); rewrite `environment-configuration.mdx` around the closed set | ✅ done | 2026-10-22 | D3: approved; .env.example also missing → fix |
| 4 | DAL pattern: remove `*_dal.ts / *-repo.ts` line from `controller-boundary.md` diagram; reinforce `dal-usage.md` concept in BE+US (+any repo with a service layer); ensure the rule is REACHABLE from README/index without grep | ✅ done | 2026-10-22 | D4: decided — reinforce + reachability |
| 5 | db-meta: DECIDED — patches+MANIFEST+keys = source (commit); diff = regenerable (ignore). Fix `.gitignore` (unignore MANIFEST.json+keys.json), fix `docs/ai/WORKFLOWS.md`, align `db-patches.md` — in EVERY repo with db-meta | ✅ done | 2026-10-22 | D5: resolved — manifest/keys are signed provenance, engine is fail-closed without them |
| 6 | Port-kill logic: rewrite `detecting-port-conflicts.md` (BE) + port sections of dev-server rules → empirical "who started it" test, never assumption; Windows commands; `pnpm dev:kill` | ✅ done | 2026-10-22 | D6: user's logic specified below |
| 7 | SSE rule: rewrite "microservices do NOT expose SSE" → "SSE is BE-owned by default; no SSE abuse; documented exceptions (ai chat stream)" | ✅ done | 2026-10-22 | D7: clarified below — confirm wording |
| 8 | Smart engine: `.devin/rules/smart-components.md` WebLLM/Qwen → Transformers.js (`@primebrick/ui/transformers`, WebGPU-only); fix 5 stale source comments (`smart-regex-input.svelte:8`, `ModelCacheSection.svelte:3`, `ModelCachePanel.svelte:3`, `api.ts:448`, `api-types.ts:230,328`) | ✅ done | 2026-10-22 | D8: WebLLM deprecated confirmed |
| 9 | Gitflow location: canonical = `docs/gitflow.md` in EVERY repo (must survive without Devin); `.devin/rules/gitflow.md` → 1-line pointer or removed; sdk gets the doc + base-rule decision (#38) | ✅ done | 2026-10-22 | D9: decided — docs/ tree, not devin-only |
| 10 | Service doc path: `<svc>/docs/…` wins; extend the full 3-tier doc anatomy (`docs/dev-guide` + `docs/user-guide` + `docs/ai` + per-service subdirs) as THE standard anatomy for every repo; fix the 3 stale rule/skill files; move job-handler; scaffold crm | ✅ done | 2026-10-22 | D10: decided — anatomy uniform across repos |
| **TRANCHE 2 — Backend doc & script fixes** |
| 11 | `setup-casdoor.ts` step 7: dead `../src/modules/auth/config-repo.js` import inside try/catch → whole config_entries + user_profiles + audit block silently skipped. FIXED 2026-10-22: config writes rewritten via `ConfigEntriesService` (governed + audited); `user_profiles` insert + audit row remain manual SQL bootstrap per user decision. tsc clean | ✅ done | 2026-10-22 | import dead → ConfigEntriesService |
| 12 | **USER DECISION: NO `admin` credentials documented anywhere** — only "tests use ad-hoc ephemeral users". DONE: rules already conform; curl examples cleaned | ✅ done | 2026-10-22 | |
| 12b | **config_entries seed-gap (USER DECISION: `be_base_url` stays MANDATORY, seed it).** DONE 2026-10-22: patches created+signed — `emailsender/0005` (be_base_url+shield_key), `webhook/0004` (be_base_url), `ai/0007` (shield_key), BE `20261021040000` (nats_url) + `20261021041000` (service_client_shield_key — verified REQUIRED: `backend-identity.ts:50` fail-loud if missing, all proxied calls die). BE `src/index.ts` NATS read swapped to `findByKey("nats_url")` after `refreshAuthConfig` (order verified). `service_key_derivation_secret` NOT seeded — verified it's an OR-alternative to shield key (`service-registrar.ts:163`), every service now has shield key → not needed. All 4 manifests re-signed `dev-micha` (be 41 patches) | ✅ done | 2026-10-22 | live DB had values out-of-band; fresh clone was broken |
| 13 | `docs/modules/auth-rbac.md` — DELETED (env-var instructions would crash boot under assertDbEnv). Useful details folded into `authentication.mdx` (auth config_entries section: auth_mode/gateway/roles_path/OIDC keys, session-context via `@primebrick/sdk`) + `environment-configuration.mdx` key table | ✅ done | 2026-10-22 | |
| 14 | **Closed-set env (`.env` = DATABASE_URL+DATABASE_SCHEMA only).** DONE: 7 `.env.example` deleted; non-contract reads removed (`PORT`→3001 fixed, `CASDOOR_*`→config_entries-only, `PUBLIC_FE_URL`→`frontend_url` config, `PUBLIC_BASE_URL`/`PORT`→request-derived in oauth-metadata router, sdk nats-client env fallback→explicit arg). `NODE_ENV` kept + documented in all 7 `docs/ai/env-policy.md` ("Platform variables" section: secure cookies + allowedTrust gates, Dockerfile `ENV` only). `PB_UUID_DEFAULT_PROVIDER` removed → hardcoded `gen_random_uuid()` (dal entity-decorators). `PUBLIC_API_ORIGIN` documented as FE-only carve-out. Dockerfiles created for webhook/job-handler/crm/BE with `ENV NODE_ENV=production`. emailsender compose dead `SERVICE_BASE_URL` removed. **BLOCKER for user:** Dockerfile `COPY package.json pnpm-lock.yaml` can't work — service dirs lack lockfiles (real lockfile = `primebrick-workspace/pnpm-lock.yaml`, `workspace:*` deps need the monorepo context); emailsender's own lockfile is stale (predates @primebrick deps) and BE's resolves `sdk` as `^0.5.0`/`dal-pg` as `file:../` — all would fail `--frozen-lockfile`. Needs decision: workspace-root build context vs published versions | ⏳ partial | 2026-10-22 | code+docs done; Docker build-context strategy undecided |
| 15 | Stale class names `ConfigEntriesDal`/`TranslationsDal` → `ConfigEntriesService`/`TranslationsService` in 3 files | ✅ done | 2026-10-22 | |
| 16 | Stale paths → `controllers/http` real locations (4 files) | ✅ done | 2026-10-22 | |
| 17 | Generated user-guide stale — DONE: `customers.mdx` regenerated w/ update ENABLED (matches `PUT` route + meta); `entities-crud.mdx` moved to `docs/dev-guide/` + `_order.json` files updated; `entity-api-catalog` stays generated; `docs-render.ts` `HANDWRITTEN_SLUGS` → links emit `/docs/dev-guide/entities-crud` (verified in regenerated output). **NEW FINDING:** extractor knows nothing about shell pages (`EntityTablePage`/`EntityFormPage` not in docs-extract.ts) — shell-wrapped pages yield `endpoints:[]` → generated docs lose endpoints/fields/procedures (roles-edit "is admin" note + users-edit "grant admin rights" section vanished in regen). Extractor must learn the shell contract (entity prop → BE meta) — follow-up task | ✅ done | 2026-10-22 | + new extractor-gap task |
| 18 | Wrong API paths — fixed: translations `/api/v1/system/translations/…`, collaboration `/entities/customer/` singular ×4, mcp `/api/v1/system/mcp/*` | ✅ done | 2026-10-22 | |
| 19 | `?id=` dispute — RESOLVED (master vs machine creds) | ✅ resolved | 2026-10-22 | |
| 20 | `docs/ai/README.md` broken CLAUDE.md link — created `CLAUDE.md` pointer→AGENTS.md; README links updated after auth-rbac.md deletion | ✅ done | 2026-10-22 | |
| 20b | `index-docs.ts` bug (found during verification): called `getDal()` without `initDal()` → `docs:generate` index step always crashed `config is required on the first call`. Fixed → pipeline now reaches live DB (embedding in progress) | ✅ done | 2026-10-22 | |
| **TRANCHE 3 — Frontend doc fixes** |
| 21 | `SidebarModuleSwitcher` zombie — done: page deleted, `_order.json` slug → `sidebar-app-launcher`, refs fixed in `app-shell.mdx` (mermaid node), `app-sidebar.mdx`, `index.mdx`, `ui-components.mdx`, `api-reference.mdx`, `component-provenance.json`. NEW page `components/sidebar-app-launcher.mdx` written (select-vs-activate semantics, 3-col cascade). 2 BONUS zombies found+fixed: `FormLabelWithHelp` (api-ref section deleted) + `PasskeyPromptDialog` (provenance → `auth-methods-prompt-dialog`). `pnpm extract-docs` clean (360/360) | ✅ done | 2026-10-21 | verified: rename→different component |
| 22 | `.devin/rules/i18n-translation-sources.md:63` "app + custom only" → `CORE_DICT_MODULES` (app,custom,system) with single-source pointer | ✅ done | 2026-10-21 | |
| 23 | README `frontend/`→repo root, `tailwind.config.js`→`@tailwindcss/vite` v4 note, `frontend/AGENTS.md`→`AGENTS.md`; getting-started "Paraglide-based"→"custom module-scoped dictionary store"; i18n.mdx endpoint →`/api/v1/system/translations/{module}/{lang}` | ✅ done | 2026-10-21 | |
| 24 | Comment sweep done: `test-admin`/`test-user`→`e2e_test_admin`/`e2e_test_user`, "Seeded"→"Ephemeral" in 7 specs + `db.ts` ×3 + `e2e-testid-convention.md:73` + auth-login-boot mock. Legit "seeded" uses (passkey creds, dict seed) kept | ✅ done | 2026-10-21 | comments only, code conforms |
| 25 | `playwright.config.ts:37` + `global.setup.ts:6,105` → `.devin/rules/dev-server.md` | ✅ done | 2026-10-21 | |
| 26 | `error-handling.mdx` rewritten around `pushNotification` contract (NotificationInput|RFC7807 auto-detect, always-toast, appErrors for impact≠NONE, impact→toast map, api.ts auto-push, ErrorsPanel/RfcErrorDialog). `WORKFLOWS.md` "Error Center"→pushNotification | ✅ done | 2026-10-21 | |
| 27 | `components/index.mdx` full rewrite: 81 custom units across 11 sections (added config-list, config-builder, anchor-tabs, remote-page×5, error-page, otp-input, shell-infra, ui-custom inputs/smart/display, 7 missing auth); wrapped count →6 (added button+slider); primitives →30 (+accordion+input-otp). provenance.json +24 entries, −2 zombies, button customized→true | ✅ done | 2026-10-21 | |
| 28 | `mermaid` pinned exact `12.1.0` (was `^12.1.0`; lockfile already resolved 12.1.0 — no lockfile delta) | ✅ done | 2026-10-21 | CODE change |
| 29 | `settings.mdx` +6 missing routes (clients list/create/edit, credentials, docs-index, translations); broken kebab imports → `useHealthChip.svelte.ts`/`useFormGuard.svelte.ts`; `composables.mdx` convention → `use<Purpose>.svelte.ts` camelCase | ✅ done | 2026-10-21 | |
| 30 | `docs/ai/README.md` +5 missing pages (i18n, sheets, field-hints, icon-conventions, input-anatomy); `{#render`→`{@render` at `AGENTS.md:25`; `.windsurfintructions` deleted (stale Italian duplicate, English-only rule) | ✅ done | 2026-10-21 | |
| 30b | `host-env.ts` `export *` ambiguity (clsx/tailwind-merge `ClassValue`) — FIXED + refactored per praxis: vendor plane moved to `@primebrick/ui` (`src/lib/vendor.ts` + `vendor-bits.ts`, subpath exports `./vendor`/`./vendor-bits`, deps +tailwind-variants/@lucide/svelte/bits-ui aligned to FE). Explicit `export type { ClassValue } from 'clsx'` resolves the ambiguity inside vendor.ts. FE shims now `export * from '@primebrick/ui/vendor'` / `vendor-bits`. ui check 0 err, fe check 0 err | ✅ done | 2026-10-22 | remote modules now consume the shared vendor contract |
| **TRANCHE 4 — US + libs + workspace** |
| 31 | US `overview.mdx`: add ai(3004)/webhook(3005)/crm(3007) to catalog+Mermaid; `ai/docs` `AI`→`ai` service code; port sources documented (db-meta seeds only place) | ✅ done | 2026-10-23 | catalog 5 services + Mermaid all-nodes + port-source note (`db-meta` seeds = only source); all 5→PG verified (webhook+crm own schemas) |
| 32 | `DB_SCHEMA`→`DATABASE_SCHEMA` ×3 (ai/emailsender/webhook index.mdx) + mark required (boot crashes without) | ✅ done | 2026-10-23 | already conform — zero `DB_SCHEMA` occurrences repo-wide; all 3 index.mdx document `DATABASE_SCHEMA` required. No edit needed |
| 33 | `emailsender/docs/dev-guide/index.mdx`: stale `POST /webhook` route + diagram (real flow = JetStream `webhook.emailsender.received`); `api-path-conventions.md` migration table stale; webhook "DB-less" claims wrong (has schema+patches) | ✅ done | 2026-10-23 | emailsender: mermaid→webhook-ingress→JetStream, 3→2 HTTP route groups, `POST /webhook`×2→durable consumer, "openapi (public)"→shielded. api-path-conventions: migration table→completed record, webhook row→removed/JetStream, canonical spec file `controllers/http/openapi-route.ts`. webhook index: "no database"→owns `webhook` schema (5 patches). AGENTS.md "DB-less router"→same fix |
| 34 | US `AGENTS.md`: "Fastify (or Express)" → Bun + createMicroservice; `docs/gitflow.md` "no version sync" → version-sync.mjs exists; `cd microservices`→`primebrick-us-v3` | ✅ done | 2026-10-23 | stack→Bun+createMicroservice/createHttpServer; gitflow.md→version-sync.mjs in prebuild (release/hotfix branches auto-bump all services); repo name `primebrick-v3-microservices`→`primebrick-us-v3` |
| 35 | OpenAPI mandate vs reality — **VERIFIED DEEP**: NOT automatic. `createMicroservice` never mounts a spec; per-service manual composition (`buildOpenApiSpec`+`rpcSpec`/`entityCrudSpec`→`makeOpenApiHandler`). ai+emailsender mounted; webhook (metadata present, no handler), job-handler (no handler), crm (no routes at all — by design). Load-bearing: BE `discoverEntitiesFromService` fetches `/api/v1/openapi.json` on register → MCP entity-registry + aggregated spec. Options presented to user (a/c/b) | ⏳ awaiting user | — | DECISION NEEDED — evidence delivered |
| 36 | ui + core `docs-sync-on-close.md` = verbatim DAL copy ("For this repo (DAL library)" + `src/query/` paths) → replace with repo-specific or genericize | ✅ done | 2026-10-23 | ui→component/vendor-surface/composable bullets; core→contracts/wire-shape/domain-type bullets (real src trees) |
| 37 | core `AGENTS.md` "single runtime dependency" vs `json-bigint` present → amend invariant or drop dep; core/ui/sdk/dal README stale export/feature tables → reduce READMEs to pointers into dev-guide | ✅ done | 2026-10-23 | invariant→"two deps: @primebrick/decimal + json-bigint (ext-json codec)". 4 READMEs→pointer form (dal kept identity paragraph + commands) |
| 38 | sdk: missing entire base-rule pack — rule-by-rule summary delivered to user for per-rule decision (sdk=library like dal/ui/core which all have the pack; `data-model-conventions` is its home turf — wire contracts) | ⏳ awaiting user | — | DECISION NEEDED — evidence delivered |
| 39 | Broken-link sweep | ✅ done | 2026-10-23 | sdk `docs/gitflow.md` EXISTS (ref already fine); `cross-repo-release-order.md` replicated from docs repo → 8 repos; deep-dives: ui+core `docs-dev-guide`→`overview.mdx`, core `data-model-conventions`→`entity-meta.mdx`, ui→`overview.mdx`; ui `_order.json` dead slug `api-reference` removed. **2 flagged**: `cleanup-fake-files.mjs` script missing (8 repos ref it — create tool or drop ref?), be user-guide `generated/clients-*` unlisted in _order.json (intentional?) |
| 40 | `repos.mjs` (docs repo): ui + core absent though their AGENTS.md claim sync to docs.primebrick.dev → add or drop claim | ✅ done | 2026-10-23 | USER: docs repo IS ours. Added core (`braces`)+ui (`component`) as dev-guide-only library entries — claim now true |
| 41 | Workspace hygiene: `D:\git\primebrick\temp\` ~90 leftover files (violates own temp-files rule); `.devin/config.local.json:25` contains a live DB password inside a permission string → scrub | ✅ done | 2026-10-23 | temp 397→4 entries (kept `pw-edge-profile` [live, referenced by edge-context.ts], `pw-edge-profile.bak-*` [flag], `node_modules` [temp toolbox — flag]); root `.devin/config.local.json` is NOT git-tracked (root dir isn't a repo) — scrubbed the postgres:// permission line |
| 42 | Website AGENTS.md: sync-scripts + content-collections + `output:'hybrid'` sections describe a removed architecture — flag to owner | ✅ done | 2026-10-23 | VERIFIED stale: `scripts/` has no sync-repo-docs.mjs/sync-deepwiki.mjs; `astro.config.mjs` = `output:'static'` (not hybrid). MEMO written in plan/report — owner's call on their product docs |
| **TRANCHE 5 — Doctrine & structure** |
| 43 | Write "Documentation is the contract — code is the proof" doctrine into every repo's AGENTS.md (text below); workspace AGENTS.md keeps a pointer line only | ⏳ not done | — | THE user's note |
| 44 | Complete `docs/ai/README.md` indexes everywhere + add e2e rules to FE AGENTS.md "Where to look" | ⏳ not done | — | prevents "doc exists but unread" |
| 45 | Single-source shared rules: decide sync mechanism for rules duplicated across 6 repos (canonical in workspace now; repo-local copies later when workspace dies — OR repo-scoped only with a sync check) | ⏳ not done | — | DECISION NEEDED — ties to D1 |
| 46 | Extend `check-docs-drift.mjs` (exists, undocumented, docs repo) → internal-link + dead-slug checks across repos — REQUIRED for the pointer-rule below (pointers rot without a check) | ⏳ not done | — | long-term |
| 47 | **NEW RULE — `.devin/rules/` = pointers only**: every rule file containing doc CONTENT migrates its body to `docs/ai/` (agent audience) or `docs/dev-guide/` (developer audience); the rule file keeps ONLY trigger/scope metadata + link + 1-line enforcement sentence. Apply to all our repos | ⏳ not done | — | USER MANDATE 2026-10-22 — "niente doc in devin rules, solo puntatori" |
| 48 | Create `docs/ai/` in repos missing it (sdk, us) as the canonical target for migrated rule content — part of D10 anatomy | ⏳ not done | — | dependency of #47 |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Decisions recorded (from user, 2026-10-22)

| D | Item | Decision |
|---|------|----------|
| D14 | Docker build context | **c) `pnpm deploy`** — each service's deployed package.json rewrites `workspace:*` deps to pinned versions; self-contained build, no monorepo context needed (workspace will cease to exist). |
| D40 | `repos.mjs` | **Add ui+core** — the docs repo IS ours (owner = user+agent); only the Zudoku product code isn't "our product". Sync claim in their AGENTS.md must be true. |
| D45 | Shared-rules sync | **Repo-scoped + drift check** — canonical copies live in each repo; `check-docs-drift.mjs` (task 46) extends to cross-repo rule drift. Workspace is pointers-only and dies eventually. |
| D1 | Dev-server lifecycle | **B** — strengthen in every repo; workspace must contain ONLY pointers to repo-internal docs (workspace will cease to exist; every repo must be independently developable). Also: prevent the agent from writing into workspace AGENTS.md/rules — workspace forces the pointer, never holds normative text. |
| D2 | OTP input contradiction | **A** — all OTP docs (rule + ai doc + dev-guide) move to `primebrick-v3-ui` when the component migrates there. MANDATORY step in `feature-ui-component-migration` — docs move WITH the component. Until then, fix the FE contradiction now. |
| D3 | Env policy | **A** — the closed-set rule (`DATABASE_URL`+`DATABASE_SCHEMA` only in `.env`) replicated in every repo EXCEPT website/docs (not our product). |
| D4 | DAL pattern | Reinforce `dal-usage.md` concept in BE+US (+any repo with a service layer); fix the stale diagram line. **Every rule/doc must be reachable at first shot via README/index/devin-rules listing — NEVER via grep. If you have to search, the index failed.** |
| D5 | db-meta | **RESOLVED**: patches + `MANIFEST.json` + `keys.json` are committed source (signed provenance; the dal-pg engine is fail-closed without them — a fresh clone cannot boot). `diff-entities-vs-database.json` is regenerable → ignored. Current `.gitignore` entries for MANIFEST/keys are a bug → remove in every repo with db-meta. |
| D6 | Port kill | New logic EVERYWHERE (all repos except website/docs): services running that were started by IDE terminals → ask permission before killing; PIDs NOT started by IDE terminals are orphans → agent-owned, kill freely. The "not started by the user" check MUST be empirical (identify the owning process/terminal), never assumed from "the port is busy". |
| D7 | SSE | Intent = "don't abuse SSE", not "don't use SSE". Rule rewrite: BE-owned by default; microservice SSE allowed only as a documented exception (ai chat stream exists today). |
| D8 | Smart engine | WebLLM is DEPRECATED — everything runs on Transformers.js. Docs + stale source comments updated. |
| D9 | Gitflow location | **Canonical = `docs/gitflow.md` in every repo** — it must NOT depend on Devin existing (we may stop using Devin). `.devin/rules/gitflow.md` copies become 1-line pointers (or are removed). Memo for future: website + docs are NOT our product (other owner) — but GitFlow is respected for all repos and works IDENTICALLY everywhere. |
| D10 | Service doc path | `<svc>/docs/…` wins in US — AND the full **3-tier doc anatomy** (`docs/dev-guide` + `docs/user-guide` + `docs/ai`, plus per-service subdirs) becomes THE uniform standard for every repo. |
| D11 | `.devin/rules/` = pointers only | **USER MANDATE**: no doc content inside rule files — only trigger/scope metadata + link to canonical doc (in `docs/ai/` or `docs/dev-guide/`) + 1-line enforcement sentence. Makes `docs/` the single source to read AND maintain; kills duplication drift at the root. Requires: `docs/ai/` in every repo (#48) + link-integrity check (#46). |

## Clarifications (details for decisions the user asked to expand)

### D4 — DAL pattern (controller-boundary vs dal-usage)
- `.devin/rules/controller-boundary.md` architecture diagram still shows
  `modules/<domain>/ *_dal.ts / *-repo.ts # data access — imported ONLY by services`
- `.devin/rules/dal-usage.md` says the per-domain `*_dal.ts`/`*-repo.ts` wrapper
  layer **was removed** (2026-10-16, service-layer-oop-consolidation) and creating
  new ones is forbidden. Domain queries are METHODS on the owning
  `DomainService` (`this.dal` / `this.svc`).
- The boundary diagram teaches a pattern that is now banned → agents reading it
  will recreate the removed layer. Fix = delete that line from the diagram
  (services call `this.dal`/`this.svc`; no per-domain wrapper files).

### D5 — db-meta (three statements, three truths)
- `docs/ai/WORKFLOWS.md:15`: "Generate meta diff: `pnpm run db:meta:compare`
  (writes **gitignored** `db-meta/`)" — implies the whole dir is throwaway.
- `db-patches.md` + workspace `AGENTS.md`: "commit patch + `MANIFEST.json` +
  snapshots together" — implies everything is committed.
- `.gitignore` reality: `db-meta/MANIFEST.json`, `keys.json`,
  `diff-entities-vs-database.json` ignored; **44 patch .sql files tracked**.
- So BOTH docs were wrong in opposite directions. **Resolved**: the dal-pg
  engine (`src/migrations/manifest.ts`) is fail-closed — no MANIFEST → refuse,
  patch not in MANIFEST → refuse; `keys.json` is the "committed keyring".
  Commit: patches + MANIFEST + keys. Ignore: diff only. `.gitignore` entries
  for MANIFEST/keys are a bug (fresh clone fails closed at boot).

### D7 — SSE (what actually uses it)
- Rule text today: "Microservices do NOT expose SSE — only the BE does" +
  Forbidden "Exposing SSE endpoints on microservices (BE only)".
- Reality: `primebrick-us-v3/ai/src/controllers/http/composite-route.ts:112`
  declares `streaming: "sse"` on `POST /api/v1/ai/chat` — the AI chat token
  stream. That's an SSE endpoint ON a microservice, violating the letter of the
  rule.
- User intent: SSE is fine where it belongs (chat streaming, MCP-ish flows) —
  the rule should say "SSE endpoints default to BE; a microservice MAY expose
  SSE only as a documented, justified exception" — i.e. **no SSE abuse**, not a
  ban. Wording to confirm.

### D9 — Gitflow locations today
- `docs/gitflow.md` in: dal, ui, core, be, us.
- `.devin/rules/gitflow.md` in: fe, docs, website.
- **sdk has NEITHER** — and its `docs-sync-on-close`/`make-docs` reference
  `docs/gitflow.md` (broken link).
- Library variant vs site variant text differ legitimately (version-sync vs
  Cloudflare deploy). **Decided**: canonical home = `docs/gitflow.md` in every
  repo — Devin-independent (`.devin/` may not exist in the future). The
  `.devin/rules/gitflow.md` copies become 1-line pointers (or are removed).
- Memo: website/docs are someone else's product — we keep our hands off their
  doc content; gitflow mechanics stay identical across all repos regardless.

### D10 — Service doc path (three-way convention mismatch)
- `docs-order.md` + `docs-sync-on-close.md` + `make-docs/SKILL.md`: pages at
  `docs/dev-guide/services/<service>.mdx`.
- `AGENTS.md` + `docs-dev-guide.md` + `adding-a-service.mdx`: pages at
  `<service>/docs/dev-guide/index.mdx`.
- Reality: ai/emailsender/webhook use the NEW layout (`<svc>/docs/…`);
  job-handler sits at root `docs/dev-guide/job-handler.mdx` (neither); crm has
  nothing. **Decided**: new layout wins, AND the 3-tier doc anatomy
  (`docs/dev-guide` + `docs/user-guide` + `docs/ai` + per-service subdirs)
  becomes the uniform standard applied to every repo.

### setup-casdoor verification (disputed point — RESOLVED with evidence)
- User correction accepted: ephemeral test actors ARE documented
  (`.devin/rules/e2e-test-users.md` in BE — minted per run, destroyed in
  teardown; `admin` explicitly forbidden for tests). My earlier "nothing
  documented" was wrong.
- But the script IS broken: `scripts/setup-casdoor.ts:337` does
  `await import("../src/modules/auth/config-repo.js")` — `config-repo.ts` does
  not exist (deleted in the DAL consolidation; `config-entries.service.ts:15`
  documents the merge). The import throws inside the try at line 335 → caught
  at 396 → logs "Errore salvataggio DB Core" → script prints COMPLETATO.
  Everything after the import — 8 `updateAuthConfig` calls + the
  `user_profiles` INSERT + the audit row — never executes.
- What is genuinely undocumented: the **human first-login password**
  (`admin`/`admin`, `setup-casdoor.ts:20`). Tests don't need it (they use
  ephemeral actors) but a human running setup can't discover the password
  without reading source.

## The doctrine note (task 43) — text to place in every repo AGENTS.md

```markdown
## Documentation is the contract — code is the proof

- Docs (AGENTS.md, .devin/rules/, docs/ai/, docs/dev-guide/, docs/user-guide/)
  are the source of truth for HOW things work. Source code is NEVER
  documentation: pages are composed dynamically (mountPage, remote chunks,
  layout.sections, runtime wiring) — reading a +page.svelte alone tells you
  little about what actually renders.
- Need to know how to do something (tests, auth, dev servers, conventions)?
  Find it in the doc FIRST. Read code only as the "prova del 9" — to verify
  the code behaves as the doc says. Never the reverse.
- Doc and code disagree? Report the discrepancy — the doc is probably stale.
  Do NOT fix docs silently and do NOT create new files in .devin/rules/,
  docs/, or AGENTS.md on your own initiative: propose the text, write only
  after approval.
- Before claiming "a doc is missing", check the indexes:
  docs/ai/README.md, .devin/rules/, docs/dev-guide/_order.json.
  The missing doc is usually a doc you haven't read.
```

## Working rules for this plan's execution

- ~10 fixes per session; update the task table after every tranche.
- **`.devin/rules/` files are POINTERS, not docs (user mandate)**: a rule file
  holds trigger/scope metadata + a link to the canonical doc + at most a
  1-line enforcement sentence. Content lives in `docs/ai/` or
  `docs/dev-guide/`. When fixing a rule file, migrate its body — never leave
  duplicate content behind.
- Doc edits in governed areas (`.devin/rules/`, `AGENTS.md`, `docs/`) are
  executed ONLY for items listed here — no opportunistic doc writing.
- Code changes (tasks 11, 28, 35) require explicit approval before touching.
- website/docs repo fixes are flagged to their owner, not written by us
  (except gitflow mechanics which are identical).
- **Reachability acceptance criterion (user mandate)**: every doc and rule
  touched by this plan must be reachable at first shot through the indexes —
  `AGENTS.md` "Where to look", `docs/ai/README.md`, `.devin/rules/` listing,
  `docs/dev-guide/_order.json`. If finding it requires grep, the INDEX is
  broken — fix the index too. A doc you must search for is a doc that
  produces assumptions instead of facts.
