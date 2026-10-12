# Docs KB — Module-aware ingestion + source-of-truth audit

> Trigger: the AI KB was indexing `primebrick-v3-docs/pages` (generated
> Zudoku output), so it was stale vs the real source of truth
> (`docs/user-guide/` in each code repo). Goal: dynamic per-module
> ingestion triggered by service registration, plus an audit of doc
> coverage/misplacement across repos.

## Status: 🟢 DONE — Plan date: 2026-10-11 02:10 UTC / 04:10 CEST · updated 2026-10-13

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Empirical audit of `docs/user-guide` coverage per repo | ✅ done | 2026-10-11 | see Part A |
| 2 | Decide doc remediation (stale/missing pages) with user | ✅ done | 2026-10-12 | BE missing pages produced: dev-guide mcp/proxy/secrets-engine (dev topics), user-guide modules + security-and-mfa (end-user topics). All other Part B items closed by tasks 4-10 |
| 3 | Design docs-pack contract (manifest + content, no vectors) | ✅ decided | 2026-10-11 | Part C — user approved |
| 4 | FE: split `docs/user-guide` → `user-guide` (manual) + `dev-guide` | ✅ done | 2026-10-11 | superseded 2026-10-12: FE is dev-only — user-guide removed entirely; manual/users+organizations → BE user-guide/manual; roles page superseded by BE rbac.mdx; button-styles→dev-guide; gitflow→.devin/rules; .obsidian dropped |
| 5 | DAL/SDK: rename `docs/user-guide` → `docs/dev-guide` (not end-user) | ✅ done | 2026-10-11 | extract-docs scripts, AGENTS, rules renamed docs-dev-guide.md |
| 6 | Add `.devin/rules/docs-audience.md` guardrail per repo | ✅ done | 2026-10-11 | all 5 code repos (be/fe/us/dal/sdk) |
| 7 | us-v3: move `docs/user-guide/services/<svc>.mdx` → `<svc>/docs/` | ✅ done | 2026-10-11 | → `<svc>/docs/dev-guide/index.mdx` (dev tier — corrected from decision 2: these are dev docs, not end-user); shared pages → `docs/dev-guide/` |
| 8 | SDK `docs-pack` module: manifest+schema, `buildDocsPack`, `serveDocsPack`, `GenerateDocsFn` runner, `docsPackClient`, auto-capability in `ServiceRegistrar` | ✅ done | 2026-10-12 | SDK module (manifest/build/serve/fetch + auto docs_pack capability); wired in BE (s2s shield route + DocsPackService + generate:docs) and AI (route + script). Packs verified building on both repos |
| 9 | AI: subscribe `service.register`, pull pack, per-repo ingest; delete on unregister | ✅ done | 2026-10-12 | docs-pack-subscriber: register→fetchDocsPack→ingestDocsPack (repo-scoped), unregister→deleteRepoDocs, BE pack at startup + gateway_online; ingest core extracted from embedding-pipeline |
| 10 | Pack includes `openapi.json` (self-contained); retire `openapi_path` | ✅ done | 2026-10-12 | buildDocsPack: openapi object option + optional docsDir (openapi-only packs for dev-only svcs). Standard: runtime spec via buildOpenApiSpec/entityCrudSpec/rpcSpec — BE+AI+emailsender+webhook all build packs (webhook spec created from its RpcRoute table). openapi_path fully retired from AI |
| 11 | BE: platform aggregator serves FE manual pack (`repo=frontend`) | 🚫 dropped | 2026-10-12 | golden rule: FE is dev-only (presentation layer speaks only to devs, like DAL/SDK). No FE pack exists — manuals now live in BE user-guide |
| 12 | Update stale `services/ai.mdx` (post-B3 rewrite) | ✅ done | 2026-10-12 | ai/docs/dev-guide/index.mdx rewritten: inference-only, caller-driven tool loop, real routes incl. embed+docs search, be_base_url annotated |
| 13 | Retire `docs_path` → v3-docs/pages coupling | ✅ done | 2026-10-12 | docs_fs_pipeline opt-in fallback (startup + reindex gated); FS stale-delete scoped to source repos so packs cannot be wiped |
| 14 | Zudoku: add `dev-guide` sync pass → `pages/<repo>/dev/` | ✅ done | 2026-10-12 | sync-repo-docs.mjs tiered (guide+dev), absent tier removes stale pages; generate-nav wraps dev items in Developer Guide category; generate-reference-docs.mjs retired. Verified against main: dev dirs populate once feature branch merges |
| 15 | Move `generate-reference-docs` generators into owning repos (`generate:docs` → `docs/user-guide/generated/`) | ✅ done | 2026-10-12 | BE scripts/generate-reference-docs.ts: 4 pages from repo-local sources (meta imports, dal-pg decl, MODULE_NAV registry + listModuleNavCodes). Generated committed for Zudoku as-is sync. v3-docs generate-reference-docs.mjs can now be retired |
| 16 | Per-repo: create missing dev-guide docs; agent docs reference dev-guide (no duplication) | ✅ done | 2026-10-12 | Page gaps closed repo-by-repo — SDK: docs-pack, openapi-generation, client-shield-and-secrets, migrations, translations, currency, microservice-anatomy, entity-router (+mfa-step-up section); US: adding-a-service, ai/docs-kb, emailsender/providers, conventions tooling; BE: entity-crud-pipeline, module-navigation, service-registry, translations; DAL: entity-service; FE: i18n, ai-tool-loop, error-handling, composables. Agent-rules sweep: 40 rule files across 5 repos got `## Deep dive` footers linking dev-guide counterparts (rules stay self-contained/injected); BE docs-audience.md user-guide path bug fixed |
| 17 | E2E infra verification: packs → lifecycle → KB ingest, repo-scoped delete + GUIDE quality E2E | ✅ done | 2026-10-12 | Full lifecycle verified live: 4 services register w/ auto docs_pack capability, AI pulls+embeds all packs (backend 173, ai 51, emailsender 10, webhook 1 — 0 missing embeddings). Bugs fixed: openapi-only pack 500 (serve-docs-pack), openapi chunks hardcoded repo:"api" → now pack repo (repo-scoped delete safe), stale orphans cleaned. Prova del nove: modules.mdx/security-and-mfa.mdx/generated/navigation-map.mdx all chunked+embedded. Index reset → pack-only corpus (4 repos). GUIDE E2E (Qwen2.5-Coder-3B q4f16, ReAct): regression found post-reset — FE hardcoded path_prefix 'frontend/guide/' filtered all pack paths → 0 hits (score 1.18). Fixed: removed prefix + updated prompts/guideRows filter/dedup/citation URLs ({repo}/guide/{path}) + bounded NO_MATCH-after-fetch reprompt (model judged NO_MATCH with evidence in hand). Final run PASSED 5/5 — score 2.48 rank 3.9 (T1 3.94 T2 2.75 T3 3.09 T4 4.4 T5 5). vs legacy-corpus baseline 3.49: retrieval works, prose scores lower on T1-T3 (denser docs, no actions emitted) — corpus quality now measurable purely on pack content |
| 18 | Live E2E (agent-run): BE+US up, register, docs_pack capability, fetch→ingest→embed; sample-check last-3-changed docs present in `ai.docs_kb` | ✅ done | 2026-10-12 | All 4 services registered w/ docs_pack; AI pulled+ingested all packs (backend 173, ai 21+31, emailsender 10, webhook 1 chunks); repo-scoped stale delete replaced legacy backend/guide/* rows; sample check: modules.mdx (10c), security-and-mfa.mdx (15c), generated/navigation-map.mdx (29c) all embedded. Fixes shipped en route: serve-docs-pack tolerates openapi-only packs; openapi chunks now land under pack repo (was hardcoded 'api' → repo-scoped delete would orphan them); createMicroservice auto-mounts pack route. Graceful unregister→delete not triggerable via Windows taskkill (code-reviewed; watchdog stale→going_live proven instead) |
| 19 | GUIDE E2E regression: run guide test with default model, capture raw Q&A BEFORE (old corpus) vs AFTER (pack corpus), diff and report to user | ✅ done | 2026-10-12 | ai-guide-quality.spec.ts vs live RAG: 5/5 pass, score 3.49 rank 4.2 (Qwen2.5-Coder-3B q4f16). Scores identical to stored baseline (4.38/3.69/4.9/5/5) — no regression. NOTE: guide still cites legacy repo='frontend' corpus — old FS-pipeline rows (frontend/dal/sdk/microservices/getting-started/api/pages) coexist with pack docs and will drift; cleanup decision pending |

| 20 | Incremental ingest empirical verification (delta, not full re-embed) | ✅ done | 2026-10-13 | rbac.mdx 18→32 chunks; all embedded; 0 duplicate (path,chunk_idx); 0 missing embeddings (backend 567 rows); 0 stale manual/* paths; new "How a permission is written" section present in a new chunk. Hash-diff confirmed working end-to-end |
| 21 | rbac.mdx content expansion from verified code facts | ✅ done | 2026-10-13 | Permission grammar {scope}.{action}.{cardinality} (singular snake_case scope — old doc was wrong), canonical 14-permission set, '*' cross-segment wildcards, IDP role→role_mapping→patterns flow, Administrator flag = full bypass, step-by-step assignment linking generated/roles-create, roles-edit, users-edit. Committed dd9585c |
| 22 | Guide E2E scorer path bugs (dishonest measurement) | ✅ done | 2026-10-13 | citedContexts() now strips `<repo>/guide/` prefix from hrefs (was silently zeroing ctx+faithfulness on every turn); expected_sources → generated/* paths. Score 1.89 → 3.43 → 3.53, same model same answers — it was the measurement. FE commit 5db2106 |
| 23 | avatar_color mandatory at DB (bug found via bubble chrome) | ✅ done | 2026-10-13 | 2/3 users had NULL avatar_color (column nullable, insert paths outside createUser eluded it). BE createUser now defaults to FE-palette deterministic color by initials; fire-and-forget patch backfills NULLs via hashtext palette + SET NOT NULL. BE commit d3c6ae1 |
| 24 | Shared chat avatar/bubble chrome (all assistants) | ✅ done | 2026-10-13 | chat-avatar-chrome.ts single source: user bubble = sidebar avatar + 8%-alpha avatar-gradient fill + gradient ring (new .gradient-ring mask utility — double-background can't do transparent fills, border layer bleeds through); AI bubble = 8% primary + primary ring; BotIcon shared gradient-stroke icon-only; max-w-[80%]→max-w-full. Verified in live DOM via ai-bubble-chrome.spec.ts. FE commit a515d97 |
| 25 | Last-round reprompt guards (false "Non lo so") | ✅ done | 2026-10-13 | agent_shallow_done/bare_prose/blind-seed reprompts now require a subsequent round (round+1 < max_agent_turns); on final round falls through to auto_seed_fetch or honest refusal. Unit tests 13/13. FE commit 5db2106 |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Residual / next

- **Legacy FS-pipeline corpus cleanup** (from task 19 note): old `repo='frontend'` FS-pipeline rows may still coexist with pack docs and will drift — cleanup decision still pending.
- **Guide E2E remaining gaps** (not KB, model behavior): T3/T4 synthesis — model answers on-topic but generalizes (roles page vs Edit User→Application Roles) and skips docs_fetch until guards force it. Scores now honest (T3 3.8 partial).
- **Global AI chat panel** (`shell.aiChat`): POC, does NOT share the smart-ai skeleton — the day it's productized it becomes a remote-engine assistant on the shared panel (engine:'remote' composable + hide WebLLM chrome). Until then it shares only chat-avatar-chrome.

---

## Part A — Empirical audit (executed 2026-10-11)

### A.1 Source-of-truth map

| Repo | `docs/user-guide` | Pages | Verdict |
|------|-------------------|-------|---------|
| `primebrick-be-v3` | ✅ | 8 mdx | Under-covered vs module surface (see A.3) |
| `primebrick-fe-v3` | ✅ | ~90 mdx (components/, pages/, guides) | Richest; covers component lib, manual, smart-guide |
| `primebrick-dal-v3` | ✅ | 14 mdx | Adequate (getting-started, entities, repository, query-dsl, audit, clone, optimistic-lock, changelog) |
| `primebrick-v3-sdk` | ✅ | 14 mdx | Adequate (config, nats, rpc-router, service-registration, telemetry, ext-json, presence, sse) |
| `primebrick-us-v3` | ✅ | 6 mdx | overview/architecture/conventions + `services/{ai,emailsender,webhook}` — **all 3 services documented** |
| `primebrick-v3-docs` | ❌ empty | — | Correct: it is the Zudoku publication output, not a source. `pages/` is generated by `scripts/sync-repo-docs.mjs` (clones GitHub `main`, copies `docs/user-guide` → `pages/<repo>/guide/`, destructive `rmSync` per repo dir) |

**User suspicion check — webhook:** ❌ wrong. `us-v3/docs/user-guide/services/webhook.mdx` (119 lines) documents `POST /webhook/{service_code}/{intent...}`, JetStream payload shape, API-key auth, error table, mTLS/Caddy production notes. Coverage matches its single-route surface — adequate.

**User suspicion check — AI docs stranded in BE:** ❌ mostly wrong. The only AI mentions in BE docs are *correct boundary notes*:
- `api-conventions.mdx:57-60` — `duplicate` disabled on `ai_model`/`ai_cerebellum`, explicitly noted as "served by the AI microservice via the `/ws/ai` proxy" → documents the BE surface, correct.
- `api-conventions.mdx:251` — `POST /ws/ai/api/v1/system/docs/search` cited as an authenticated RPC example → proxy-boundary doc, correct.
- `architecture.mdx` — proxy/lifecycle/registry mechanics → BE domain.

So the AI logic does NOT leak into BE docs. The real problem found: **AI's own doc is stale** (A.2) and **BE is under-documented** (A.3).

### A.2 `services/ai.mdx` — STALE (post-B3, this session)

Documents things that no longer exist:
- §"MCP client integration" — orchestrator connecting to `BE /mcp` → removed in B3 (tools are now caller-supplied, inference-only).
- `be_base_url` env/config row → key deleted, then restored only because `ServiceRegistrar` requires it (dead for MCP).
- `/chat` request body documented as `{message, conversation_uuid}` → now also accepts `tools[]`, `tool_results[]`, optional-continuation message.
- SSE event table missing/behind current client-tool-loop semantics.
- Missing routes: `POST /api/v1/ai/embed`, `POST /api/v1/system/docs/search`, `POST /api/v1/system/docs/document`, `POST /api/v1/actions/reindex`.
- "Local development" prerequisite "Backend running on port 3001 (for MCP client)" → no longer true.

### A.3 BE coverage gaps

8 mdx pages vs modules `auth, collaboration, customers, mcp, proxy, secrets, system` + cross-cutting concerns. Missing/thin:
- **mcp** — protocol surface (`/mcp`, `/system/mcp/tools`, `/system/mcp/call`, generic tools catalog) — only passing mentions in `api-conventions.mdx`.
- **proxy** — `/ws/:code/*` mechanics, client-shield/gateway headers, forwarding rules — scattered in `architecture.mdx`.
- **secrets** — rotating secret engine (per-service scope, gateway secret) — no page.
- **service registry / lifecycle** — register/stale/offline model — inside `architecture.mdx` only.
- **MFA step-up** — action-token flow (B9 infra) — not documented user-facing.
- **translations/i18n pipeline, audit** — fragments only.

### A.4 us-v3 doc model vs pack design

Docs live at **repo level** (`us-v3/docs/user-guide/services/*.mdx`), one file per service — while the pack design wants **per-service** packs. Options: (a) move each service's doc into `<svc>/docs/` (matches "module owns its docs"), or (b) repo-level build script splits by path convention. (a) is cleaner and matches monorepo-with-autonomous-services.

### A.5 Existing generation automatisms (v3-docs CI — verified)

| Script | Behavior | Notes |
|--------|----------|-------|
| `sync-repo-docs.mjs` | clone main → `docs/user-guide/**` → `pages/<repo>/guide/` (destructive) | takes ONLY `user-guide` — `dev-guide` tier needs a new sync pass |
| `fetch-openapi.mjs` | extracts OpenAPI specs via tsx import from cloned repos (`system.json` BE, `*/src/server/openapi-route.ts` per US) → `apis/` + `generated-apis.ts` | static extraction from source, not runtime — same info available per-service at build time |
| `generate-reference-docs.mjs` | auto-generates 4 metadata-derived docs into `pages/backend/guide/`: `entity-field-reference` (from `*.meta.ts`), `filter-operator-reference` (from `dsl.ts`), `filter-syntax-guide`, `navigation-map` (FE routes↔entity) | marked `<!-- AUTO-GENERATED -->`; must move into owning repos as `generate:docs` step so packs include them |
| `generate-nav.mjs` / compliance / VPAT | nav fragment + compliance reports | publication-only, unchanged |

**Not yet implemented**: entity list/create/update page auto-generation from metadata — only `dynamic-form-pages-pre-plan.md` (PRE-PLAN). Metadata-derived *reference docs* exist (above); metadata-driven *pages* do not.

### A.6 What the KB actually contained before the fix

- AI indexed `v3-docs/pages` = last manual sync/commit → KB was stale by ~weeks of doc work → **guide E2E were testing a stale corpus** (user's intuition confirmed).
- Reindex incrementality verified empirically twice: `0 embedded/2727 skipped` (no-op) and `880 embedded/1847 skipped/19 deleted` (restore) — content-hash pipeline works; only the *source* was wrong.

---

## Part B — Doc remediation (decide with user)

| Item | Proposal |
|------|----------|
| `services/ai.mdx` stale sections | Rewrite post-B3: inference-only orchestrator, `tools[]`/`tool_results[]` contract, client-tool loop, `search_docs` local, new routes (`/embed`, `docs/search`, `docs/document`, `actions/reindex`) |
| BE missing pages | Add: `mcp.mdx`, `proxy.mdx`, `secrets.mdx` (rotating engine), `service-registry.mdx`, `mfa-step-up.mdx` — decide scope |
| us-v3 layout | Move `services/<svc>.mdx` → `<svc>/docs/user-guide/*.mdx` so each service ships its own pack (Part C); keep repo-level `overview/architecture/conventions` as shared us-v3 pack or drop from KB |
| FE/DAL/SDK/BE packs | Each repo already has `docs/user-guide` at root → pack = the dir as-is |
| `_order.json` | Include in pack as nav metadata (harmless, useful for site) |

---

## Part C — Docs-pack ingestion design (agreed direction, refined)

### C.1 Contract

Each service/repo **builds a docs pack at build time**:

```
dist/docs-pack/
  manifest.json     # { schema: 1, repo: "<code>", generated_at, embedder_hint? }
  docs/...          # raw .mdx/.md files + _order.json (verbatim source)
  openapi.json      # optional — service OpenAPI spec
```

- **No precomputed vectors** as contract: embeddings are model-bound (content_hash includes provider identity; vector dim is schema-fixed). Optional `embeddings.bin` *cache* allowed only if it carries `{provider, model, dim}` — AI accepts it iff identical to its own provider, else re-embeds from text. Text is always the source of truth.
- Content-hash incremental semantics unchanged: identical chunks skip, changed re-embed, missing → delete.

### C.1b Where the logic lives — SDK-shared, zero copy-paste

| Layer | Owner | Contents |
|-------|-------|----------|
| **Contract + framework** | `primebrick-v3-sdk` → `docs-pack` module | `DocsPackManifest` + zod schema, `DOCS_PACK_CAPABILITY`, `buildDocsPack({repo, docsDir, outDir, generators})`, `serveDocsPack(router)` shielded handler, `GenerateDocsFn` engine + runner (successor of `generate-reference-docs`), `docsPackClient.fetch(baseUrl)` pull client |
| **Auto-capability** | SDK `ServiceRegistrar` | adds `docs_pack` to `capabilities` when a pack exists at build → zero manual config |
| **Content extractors** | each repo | BE: `*.meta.ts`→entity-field-reference, `dsl.ts`→filter-ops, FE-routes→navigation-map (moved from v3-docs `generate-reference-docs.mjs`). US services: mostly raw docs only |
| **Ingest + KB** | AI service only | `service.register`/`unregister` subscriber → `docsPackClient.fetch` → `loadPack` → existing hash-diff pipeline |
| **Publication** | v3-docs CI | unchanged + new `dev-guide` pass |

Rule: anything crossing a repo boundary lives in the SDK once; only doc *content* and *domain extractors* live in repos.

### C.2 Transport — pull over HTTP, triggered by registration (not push, not NATS)

- Service serves `GET /api/v1/system/docs/pack` (shield-protected, service-to-service; or static `dist/docs-pack` file).
- Service registration already carries `capabilities[]` (from `package.json`) → a service owning docs declares capability **`docs_pack`**.
- **AI subscribes to `service.register`** (already has lifecycle subscriber). On register of a service with `docs_pack` → AI `fetch(base_url + /api/v1/system/docs/pack)` → ingest under `repo = <service code>`.
- On `service.unregister` → AI deletes `repo = <code>` docs (module removal cleans the KB).
- **No BE orchestration, no "BE waits for AI"**: fire-and-forget, idempotent via content-hash; AI re-pulls on every re-registration → self-healing after AI restart (`gateway_online` → re-register → re-ingest; hashes make it cheap).
- The BE is just another `docs_pack` producer (its own docs incl. the adopted FE manuals under `user-guide/manual/`). **Golden rule (2026-10-12): FE, DAL and SDK are dev-only repos** — they produce NO user pack at all; their docs are entirely dev-guide → Zudoku only, never the KB, never any pack. Only BE and US services produce docs packs.

### C.3 AI changes

- `docs-loader` gains `loadPack(packDirOrBuffer, repoCode)` → same `DocSource {repo, path}` shape.
- `embedding-pipeline` unchanged (hash-diff already per-repo).
- Lifecycle subscriber: `service.register`/`unregister` handlers.
- `reindex` admin route: re-pull all registered `docs_pack` services instead of filesystem scan (filesystem mode kept as fallback for dev).
- `docs_path`/`openapi_path` config: demoted to optional dev fallback; default becomes "pull from registry".

### C.4 What stays

- `primebrick-v3-docs` CI (pull-from-main → Zudoku → deploy) **unchanged** — publication pipeline only.
- `docs/user-guide/` in each repo remains the authoring location = source of truth.
- Agent docs (`.devin/`, `docs/ai/`, `AGENTS.md`) never enter packs.

### C.5 Acceptance

- New module with `docs_pack` capability + pack endpoint → appears in KB within seconds of `service.register`, searchable via `docs_search`.
- Unregister → its docs gone from KB.
- Re-registration → `skipped` chunks dominate (idempotent).
- AI restart → full re-ingest from registered services, zero filesystem coupling to v3-docs.
- Guide E2E run against the *real* complete corpus.

---

## Decisions (user, 2026-10-11)

1. **3-tier doc convention** — `docs/user-guide/` = end-user only → pack→KB+Zudoku; `docs/dev-guide/` = dev → Zudoku dev section (optional), never KB; `.devin/`, `docs/ai/`, `AGENTS.md` = agent only.
2. us-v3: move `services/<svc>.mdx` → `<svc>/docs/user-guide/` ✅.
3. Pack endpoint: **shielded route** `GET /api/v1/system/docs/pack` ✅.
4. `openapi.json` **inside the pack** — retire `openapi_path` ✅.
5. Non-runtime repos: BE platform aggregator serves FE `manual` pack; DAL/SDK have no user-guide at all after the split (dev-guide only) → nothing to ingest.
6. Guardrail: `.devin/rules/docs-audience.md` in every repo documenting the tiers so docs never pollute the KB again.
7. Generated docs: `generate-reference-docs` logic moves into owning repos as `pnpm generate:docs` emitting `docs/user-guide/generated/*.mdx` (AUTO-GENERATED marker preserved) — same output feeds the pack AND Zudoku's user-guide sync, single standard. `fetch-openapi` replaced by each service serving its own spec in the pack; Zudoku keeps `apis/` extraction for the site catalog.
8. Zudoku CI: add `dev-guide` sync pass (`docs/dev-guide/**` → `pages/<repo>/dev/` + nav section) — additive, existing flow untouched.
9. Doc agente ↔ dev-guide: agent docs may reference dev-guide for deep-dives; knowledge lives in ONE place (dev-guide), agent docs only link.
