# Plan — Guide Assistant: bounded agentic tool loop (replaces passive RAG preflight)

> Continuation of `guide-assistant-kb-plan.md` + `guide-actions-navigate-mcp.md`.
> Supersedes the passive single-shot retrieval design (transform→inject→generate).
> Empirically diagnosed on 2026-10-02: the current Guide returns `actions:[]`
> on every turn — NOT a model-size problem, NOT truncation (verified: raw
> output is valid JSON, 134 tokens at max_new_tokens=256 and 1024), but a
> structurally unsatisfiable contract: routes must literally appear in
> retrieved excerpts AND docs don't contain them.

## Status: 🟡 PARTIALLY DONE — Plan date: 2026-10-02 ~10:30 UTC / ~12:30 +02:00 · updated 2026-10-02 ~15:00 UTC

> **Sequencing rule (user decision 2026-10-02): the AGENTIC LOOP IS the
> baseline.** The current passive flow is already proven broken — it is not
> the reference. Build the loop first, measure quality + latency → that IS
> baseline v1. Only then iterate, ONE variable at a time.

### Phase 1 — Build the agentic loop (= baseline v1)
| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1.1 | Extend `temp/guide-raw-harness.mjs` into loop simulator (stages S0–S5 + tool executors, no FE, Node + onnxruntime-node + pg) → `temp/guide-loop-harness.mjs` | ✅ done | 2026-10-02 | full loop works end-to-end offline |
| 1.2 | `search_docs` tool executor in harness (embed → pgvector, real DB) | ✅ done | 2026-10-02 | same SQL two-phase ranking as DAL |
| 1.3 | `search_routes` tool + BE `GET /api/v1/system/routes` runtime census (service_registry + module nav meta + entity_route convention, Redis-cached) | ✅ done | 2026-10-02 | `routes-census.service.ts` + router mounted; 401 unauthenticated verified; cache = in-process 30s (Redis deferred — aggregation is sub-ms); module meta gained `ModuleRouteDecl` + real route decls for settings/crm |
| 1.4 | Entity tools wrappers (`get_entity_meta`, `list_entities`, `get_entity`) over existing `POST /system/mcp/call` | ⏳ not done | — | no new BE surface; not yet needed by loop turns |
| 1.5 | Bounded loop orchestrator in use-guide-ai (stages S0–S5, guards: max_iterations, token caps, whitelist, output-space-closed JSON) | ✅ done | 2026-10-02 | new `guide-loop.ts`; S0–S2 via `generate_preflight` in transform, S3 = streaming main generation, S4 via `regenerate` in `process_response` (§J option A); model-emitted actions never trusted — only `selectActions` output survives |
| 1.6 | Action selection (not generation): `action_ids` validated vs census/entity-meta | ✅ done | 2026-10-02 | full-census selection works: "admin"→users, "create user"→users+users/create; FE validates route ∈ census |
| 1.7 | Harness suite on quality questions → record quality + latency per stage → **baseline v1** | ✅ done | 2026-10-02 | results artifact: `ai-plans/guide-loop-baseline-v1-results.md` |
| 1.8 | **WebGPU parity check** — baseline is CPU q4; prod runs q4f16 WebGPU. Same tokenizer/template but different numerics → verify S0/S2/S4 JSON validity, action selection, no-doc path on the real engine BEFORE E2E | ✅ done | 2026-10-02 | `ai-guide-loop-parity.spec.ts` PASSED — 15.1/15.1/5.0s per turn (~6× faster than CPU), 0 stage parse failures, chip→goto verified. Findings: S2 still pessimistic+noisy (polluted admin answer toward organizations), S4 emits filler actions, KV cache always cold (`using_cache:false` — preflights invalidate; irrelevant at these latencies), S0 DOES translate to EN on WebGPU (unlike CPU) |
| 1.9 | Live E2E quality spec on the loop (headed Playwright, ephemeral actor) | ✅ done | 2026-10-02 | `ai-guide-quality.spec.ts` PASSED 5/5 turns, score=4.00 persisted. Latencies 16.6/16.6/36.6/26.6/6.5s; every covered turn ≥1 action chip + 4 sources; no-doc turn correct. Fixes landed: `actions` optional in parseGuideResponse + truncation salvage, cerebellum max_tokens=256→512 (DB+seed), spec scoping/keyword-alternate/noDoc-regex/timeout fixes; stale `ai-guide-rag.spec.ts` (dead single-shot contract) deleted |

### Phase 2 — Post-baseline refinements (one variable at a time)
| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 2.1 | Move XX→EN translation/keyword extraction to BE (`query_text` on `/docs/search`); FE drops rewrite preflight | 🚫 dropped (tested, rejected with evidence) | 2026-10-02 | BE has no LLM → keyword extraction would need static stopword lists (rejected: not scalable across languages). A/B measured via `temp/guide-kw-ab.mjs`: keywords only rerank inside the candidate set (navigation-map.mdx jumped #3→#1 for "creare utente" — real value, zero cost since S0 emits them for free). EN-embedded queries score ~+0.15 sim vs IT on English docs → S0's EN queries are the part of translation that PAYS. Decision: keywords stay LLM-produced inside S0, passed verbatim to `searchDocs`; no BE extraction, no stopwords, no `query_text` param. Bonus finding: "IDP Code" retrieves irrelevant chunks in BOTH languages — KB content gap, not a search problem |
| 2.2 | Compress/parallelize stages for latency (only after baseline) | ⏳ partial | 2026-10-02 | S2 redesigned first: titles-only digest → **inspect stage** (model reads ~350-char excerpt contents, emits free-form `searches` executed in parallel by the orchestrator). Evidence: `sufficient:true` finally observed (IDP turn, closed loop at iter0), admin answer no longer drifts to organizations, per-stage `[guide-loop]` telemetry added (ms/queries/new_chunks/decisions). Residual: model still emits junk searches ("create organization") on uncovered subtopics — bounded by early-exit. Next candidates: drop S2 (A) or fold S4 into S3 (B) |
| 2.3 | Retrieval/KB quality study (T1–T6 audit, no model) | ⏳ partial | 2026-10-02 | T1–T3 executed via `temp/guide-retrieval-audit.mjs` (paraphrase matrix × {raw, +kw, +ctboost}, top-15, golden-set recall). Results below in §2.3-AUDIT. Verdict: **ranking defect confirmed** — `+ctboost` (tutorial +0.08 / api −0.10) lifts golden chunks in top-4 from 4→11 for create-user; **two real KB content gaps** found: "IDP Code" has no semantic definition anywhere (only `idp_code` column in field tables) and "make user admin" has no UI procedure (roles documented, assignment not). User semantic review: titles-only and inspect both FAIL on create-user/admin; inspect preferred (on-topic) |
| 2.4 | Decide fate of the 2 prior plans (merge/supersede) | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## A. Diagnosis — what is actually broken (empirical, measured 2026-10-02)

Raw model output captured via offline harness (`temp/guide-raw-harness.mjs`,
Qwen2.5-Coder-3B-Instruct q4 CPU, same prompt+excerpts as prod):

```json
{"answer_markdown":"Per rendere un utente admin, l'amministratore deve ... `is_admin` ... `true`.",
 "actions":[]}
```

- `actions:[]` at BOTH `max_new_tokens=256` and `1024` → **not truncation**.
- JSON valid → **not a parse failure** — the model correctly follows the
  contract: `navigate` requires "routes explicitly present in the retrieved
  documentation" AND `parseAction` enforces `grounding_context.includes(route)`
  → since doc prose contains no app routes, the only legal output is `[]`.
- Retrieval for "come rendo un utente admin?" returns authentication.mdx /
  login / rbac.mdx / auth-me (sim 0.447–0.503) — **no UI-workflow doc** →
  model fills the gap with `is_admin=true` (plausible, wrong granularity).

**Two separate faults**: (1) action contract unsatisfiable, (2) procedural
questions retrieve API refs, not user-guide docs. The agentic loop fixes (1)
structurally and gives (2) a second retrieval chance.

## B. Architecture — bounded agentic loop (thinking OFF, Qwen2.5 fixed)

Current: `transform_user_content` = rewrite→embed→search→inject (passive,
model never calls anything). Target: the model **drives tool calls** inside
a bounded loop — our loops ARE the reasoning (thinking stays off for now;
Qwen3-thinking evaluation deferred per user decision).

Each iteration = one serialized `generate_preflight` (worker is already
single-generation-serialized; loop reuses that guarantee) + one deterministic
tool executor call. Model output per stage is a **closed-space JSON** — same
philosophy that makes regex/json assistants reliable: the model selects,
never invents.

```
user text
  └─► S0 decompose   preflight → {"queries":["...",...≤3],"lang":"it"}
  └─► S1 retrieve    deterministic: embed each query → search_docs ×N (parallel)
  └─► S2 coverage    preflight → {"sufficient":bool,"missing":["..."]}
                     loop S1↔S2 max MAX_RETRIEVAL_ITERATIONS (start: 2)
  └─► S3 answer      main generation → prose only (no JSON envelope)
  └─► S4 actions     preflight → SELECT from candidate set:
                       candidates = route census hits (S1) ∪ entity_meta ∪
                                    MCP tool args grounded in excerpts
                     output: {"action_ids":[...≤5]} — ids, not objects
  └─► S5 compose     deterministic: message = answer + validated actions +
                     citations (from S1 hits)
```

Failure semantics (unchanged): any infra failure → turn errors; zero
retrieval hits after loop → deterministic localized "Non lo so"; malformed
stage JSON → one bounded repair via regenerate, else graceful degradation
(actions=[] is FINE here — selection from empty candidate set).

### Async/reactivity (user requirement #1)

The loop must NOT block the UI thread or serialize unrelated work:
- Embed worker + searchDocs + tool calls run via `await` inside
  `transform_user_content` — the typing indicator already stays up.
- S1 query fan-out uses `Promise.all` (real parallelism).
- No sync waits; the single-worker constraint is only on *generation* —
  everything else (embed, REST, ranking) overlaps freely.
- UX: `ai_status='thinking'` covers the whole loop; optionally surface a
  per-stage hint later (not v1).

## C. Tool inventory (client tools, loop-callable)

All are **FE-side client tools** (functions the loop calls between
generations). Transport to BE = existing REST only — NO SSE, NO new MCP
transport in the browser. The browser never talks MCP directly.

| Tool | Executor | Transport | RBAC | Returns |
|------|----------|-----------|------|---------|
| `search_docs` | embed worker + `searchDocs()` | `POST /api/v1/system/docs/search` | `AUTHENTICATED_USER` (exists) | ranked chunks {repo,path,title,sim,content} |
| `search_routes` | in-memory census (see below) | none — local | n/a | [{route,entity,kind,label}] |
| `get_entity_meta` | `callMcpTool('get_entity_meta')` | `POST /api/v1/system/mcp/call` (exists) | per-dispatch RBAC (exists) | fields, entity_route, required |
| `list_entities` | `callMcpTool('list_entities')` | same | same | entity candidates |
| `get_entity` | `callMcpTool('get_entity')` | same | same | one entity |
| `list_available_entities` | `callMcpTool` | same | same | entity registry |

Mutating tools (`create/update/delete/restore/bulk/manage_service`) are
**never called in the loop** — they stay behind the confirm dialog, emitted
as `action` proposals only (unchanged flow from plan 2).

### `search_routes` census — data source decision

Routes exist in THREE places:
1. `navigation-map.mdx` in docs_kb — auto-generated, route→entity table
   (verified live: 26 routes mapped). Already indexed but **retrieval ranks
   it poorly** and it's a doc chunk, not a queryable structure.
2. SvelteKit `src/routes/**/+page.svelte` — 27 pages, static truth.
3. `shellNav.modules[].route_prefixes` + `fetchModuleMeta` `ModuleNav`
   links — runtime truth incl. self-registered modules.

**Proposal (user decision 2026-10-02 — NO build-time static manifest)**:
route census aggregated **at runtime** by a BE endpoint
`GET /api/v1/system/routes`, merging three sources of truth that already
exist in PG/registry:

1. `service_registry` / `ModuleInfo.route_prefixes` — covers remote
   self-registered microservice frontends (their routes live in a file
   only they can see — a build-time FE scan would NEVER see them).
2. Module `meta` nav links (`fetchModuleMeta` → `ModuleNavLink.href`).
3. Entity registry `entity_route` convention → derived list/detail/create
   patterns (`{entity_route}`, `{entity_route}/[uuid]`, `…/create`).

Redis is only a cache of the aggregation (invalidated on
service_registry/module-meta change) — source of truth stays in
PG/registry. No CI artifact, no Vite static file.

**MANDATE (must be documented + enforced going forward)**: every module's
meta MUST declare ALL its FE routes — including non-entity pages not
derivable from nav links or the entity_route convention. Today such
routes may not exist in any case — leave a tracked reminder:

> TODO(KB/AI): for the AI knowledge base it is MANDATORY to introduce a
> census of all FE paths not deducible from navs or entities — convention:
> modules must expose every non-standard route in their module meta.
> If no such route exists today, still add the mechanism.

**Known coverage gaps to verify in tests**:
- `[uuid]`/`[code]` dynamic segments — derived from `entity_route`
  convention; action CTA fills param via entity resolution (plan-2 flow).
- Sheet panels / drawer-only surfaces with no route — NOT in census
  (e.g. guide sheet itself); acceptable, document.
- Module routes not declared in meta — uncovered by design; the mandate
  above is the fix, enforced by convention not code.
- Auth-gated routes — census returns them regardless; navigate may bounce
  to login (acceptable, existing behavior).

## D. Keyword-boost SQL — what it is (answer to user question #3)

`docs-search-dal.ts` two-phase ranking:
1. **Phase 1 (HNSW)**: `ORDER BY embedding <=> $1 LIMIT k*4` — pure cosine,
   fetches oversampled candidates (index requires this exact ordering).
2. **Phase 2 (re-rank)**: on the ~24-row candidate set, counts ILIKE matches
   of caller-supplied `keywords` against title/path/content, adds
   `0.05 * keyword_hits` to the score.

Purpose: rescue **literal identifiers** ("IDP Code", `x-user-is-admin`, config
keys) that embeddings rank poorly — vector similarity is fuzzy, exact-term
presence is a strong relevance signal. Keywords today come from the EN-rewrite
preflight (`buildSearchQuery` → `{query, keywords}`).

**Outcome (task 2.1, resolved 2026-10-02): REJECTED.** BE-side extraction
would require static stopword lists per language — not scalable and
explicitly ruled out. Measured A/B (`temp/guide-kw-ab.mjs`, real pgvector):
keyword boost only reorders the oversampled candidate set (helps when the
literal term exists, no-op otherwise) and is a free byproduct of S0.
Additionally, EN-formulated queries embed ~+0.15 similarity higher on
English docs — the EN translation inside S0 is the valuable part and stays.
Final: keywords = LLM-picked inside S0 → passed verbatim; no BE changes.

## E. Action validation — selection, not generation (task 6)

Current `parseAction` does `grounding_context.includes(route)` — brittle
substring check that silently drops valid actions. New contract:

- `navigate` action: route must exist in the `search_routes` census result
  set the loop actually produced (id or exact route match) → always valid
  by construction.
- `tool` action: tool name must be in the whitelist; `args` validated
  against `get_entity_meta` fields retrieved in the loop; `page_route`
  validated against census the same way.
- Cap 5 (unchanged). Model emits `{"action_ids":[...]}`; FE maps ids→objects.

## F. Empirical test plan — no FE required (tasks 1,5,9)

Extend `temp/guide-raw-harness.mjs` into `guide-loop-harness.mjs`:
- Node + `@huggingface/transformers` (onnxruntime-node, q4 CPU) — already
  proven: embeds + generates with the real pipeline.
- Simulates EVERY stage: decompose → multi-query pgvector search (real
  `ai.docs_kb`) → coverage JSON → answer → action-selection.
- Asserts: loop terminates ≤ max_iterations; every emitted action validates;
  latency per stage; determinism across reruns.
- Test set = the 5 quality questions + adversarial ("come faccio una torta",
  English variants, ambiguous "system").
- Anticipated bugs to probe: model emitting non-whitelisted tool names,
  queries array >cap, `sufficient:false` forever (loop cap), JSON in fenced
  blocks (parser), empty candidate set → actions must be `[]` not error.

## G. Acceptance criteria

- [ ] Offline harness: all 5 quality questions produce actions where
      grounded (navigate ≥1 for page-bound answers), no-doc fallback on
      uncovered question, loop ≤ max_iterations, total latency recorded.
- [ ] `search_routes` finds `/system/settings/users` for admin/user queries.
- [ ] Live E2E: ≥1 rendered `ai-action-*` chip on grounded turns; navigate
      CTA lands on the right route same-tab; "Non lo so" unchanged.
- [ ] A/B rewrite numbers recorded (recall delta + seconds saved) → decision.
- [ ] No change to regex/json assistants; their E2E stays green.
- [ ] `model_content` raw output logged/inspectable in harness AND a debug
      flag in FE (already `console.debug('[ai-raw]')` exists — reuse).

## I. Baseline v1 — measured results (2026-10-02, CPU q4, 5 questions)

| Question | Chunks | Deepen iters | Answer quality | Actions | Total (CPU) |
|---|---|---|---|---|---|
| creare un utente | 10 | 2 (+1,+0) | ✅ correct UI procedure + route | navigate→users, users/create ✅ | 85.6s |
| IDP Code | 4 | 1 (+0) | ✅ plausible, cited | navigate→modules/[code] ✅ | 69.5s |
| permessi/RBAC | 7 | 2 (+1,+1) | ✅ grounded in rbac docs | [] (acceptable — no clear page) | 92.5s |
| come faccio una torta | 0 | — | ✅ deterministic no_docs | — | 21.1s |
| configure MFA (EN) | 5 | 2 (+1,+0) | ✅ correct MFA doc procedure | [] (profile/security route would be nice) | 116.2s |

Stage latency profile (CPU q4 — WebGPU expected ~3-4× faster):
S0 ~15-25s · S1 ~0.6-0.9s · S2 ~9s/iter · S3 ~35-65s · S4 ~8-9s

**Bugs found & fixed in harness**: S2 deepened with vague queries adding
0 chunks → early-exit guard added; S4 fuzzy route matching failed
("utente" vs "/users") → replaced with full-census selection (census is
small, ~17 routes — closed-space selection works perfectly).

**Observations for refinement phases**:
- S2 `sufficient=false` on every covered question — the coverage check is
  too pessimistic; its deepen queries are doc-names not search queries.
  Either tighten prompt or accept as a bounded "second retrieval chance".
- S3 dominates latency (~50-70% of turn). Answer length cap helps.
- S0 does NOT translate to English (kept Italian queries) — multilingual
  embedder coped fine; supports dropping translation later (Phase 2.1).
- S4 selecting `modules/[code]` for IDP Code shows template-param actions
  need resolution rules (or exclusion) in the FE contract.

## J. FE/BE implementation plan + CPU↔WebGPU parity risk

### Why CPU results are not automatically valid on WebGPU

The baseline ran `q4` on `onnxruntime-node` (CPU). The FE runs `q4f16` on
`onnxruntime-web`/WebGPU. Tokenizer and chat template are identical, but:

- **fp16 accumulation vs fp32** → different logits → different greedy picks.
  On closed-space JSON outputs the risk is moderate but real: a divergent
  first token (e.g. ```` ```json ```` fence vs `{`) can flip a stage's parse.
- **WebGPU kernel coverage**: some ops fall back differently; the worker
  already handles this via `session.release()`/pipeline config, so the
  model itself is proven — the *stage prompts* are the unverified variable.
- **KV cache reuse**: on WebGPU with `kv_cache_reuse` the stage sequence
  shares the worker; preflight calls already invalidate the cache after
  each one-off (`generatePreflightOneOff` does `invalidate_cache`) — the
  loop reuses exactly that mechanism, so cache correctness is preserved.
- **Latency profile differs**: CPU baseline ratios (S3 dominant) hold
  roughly, but absolute numbers will drop ~3-4× — measure, don't assume.

**Acceptance gate**: task 1.8 = run the loop in the real worker (via a
minimal browser-driven check or the E2E spec itself) and diff stage-by-stage
behavior vs baseline v1: JSON parse rate per stage, actions emitted, no-doc
path. Divergences get fixed in prompts/guards, not in the model.

### FE implementation (task 1.5) — concrete design

The loop lives inside `transform_user_content` in `use-guide-ai.svelte.ts`
— no composable changes needed: `ctx.generate_preflight` already provides
serialized one-off generations inside the busy turn, and tools are plain
async functions. The transform becomes:

```ts
transform_user_content: async (text, ctx) => {
  const loop = await runGuideLoop(text, ctx, {   // new file: guide-loop.ts
    search_docs, search_routes, get_entity_meta, list_entities,
  });
  if (!loop.found) return { kind: 'local_response', response: noDoc };
  // S3 answer runs as the MAIN generation (streams to user!);
  // S4 runs as a preflight AFTER… 
}
```

Open sequencing detail: S3 is the only streaming-visible generation — it
should be the *main* `runGeneration` (so the user watches the answer being
written), while S0/S1/S2/S4 are `generate_preflight` calls. But S4 logically
comes after the answer. Two options:

- **A**: loop does S0-S2 in transform; S3 = main generation; S4 =
  `process_response`'s `regenerate` (a second generation round on the same
  turn — already supported). Answer streams, then actions resolve ~3-4s
  later. Chips appear after the answer — acceptable UX, shows progress.
- **B**: all stages inside transform (S3 non-streaming via preflight),
  `local_response` carries the composed message. Simpler but the answer
  doesn't stream — worse UX on a 10-15s generation.

**Choose A**: main generation stays the streaming answer; action selection
rides `regenerate` (validated candidates passed via closure). This needs NO
new worker/composable machinery — all existing primitives.

### BE work (task 1.3)

`GET /api/v1/system/routes` — controller → one service → aggregation:
`service_registry.route_prefixes` ∪ module meta nav hrefs ∪ entity
`entity_route` patterns. Redis-cached (invalidate on registry/module-meta
change). `AUTHENTICATED_USER`. Response shape snake_case:
`{routes:[{route, entity, module, kind:'list'|'detail'|'create'|'page'}]}`.

## H. Explicitly out of scope (deferred)

- Thinking-mode models (Qwen3 enable_thinking) — evaluate after baseline.
- Stage compression for latency — only after baseline is green.
- Conversational memory of prior retrievals across turns.
- Backend-side agent loop / SSE orchestrator for the global assistant —
  this plan is Guide-only (the global assistant keeps its own orchestrator).

## §2.3-AUDIT — Retrieval/KB quality study (measured 2026-10-02, NO answer model)

Harness: `temp/guide-retrieval-audit.mjs` — real `ai.docs_kb` (1494 chunks),
MiniLM-L12-v2 q8, 5 intents × 15 paraphrases, top-15 dump, golden-set recall.
Variants per query: `raw` (pure cosine), `+kw` (keyword ILIKE boost on
title/path/heading_path), `+ctboost` (+0.08 tutorial / +0.03 conceptual /
−0.10 api on top of kw boost).

### Indexing pipeline facts (verified in code, `primebrick-us-v3/ai/src/services/chunking.ts`)

- Chunking IS heading-aware: split by `#`..`######`, then paragraphs, then
  sentences; max ~1800 chars, 200-char overlap.
- Frontmatter stripped; `title`, `heading_path`, `content_type`
  (tutorial/reference/conceptual/api), `source` (mdx/openapi) kept in metadata.
- Embedding input = `title + "\n\n" + heading_path + "\n\n" + content`.
- Corpus: 762 tutorial · 610 reference · 90 conceptual · 32 api chunks.
- **No dedicated MDX/AST parser needed yet** — the current splitter preserves
  headings+heading_path correctly; defect is downstream (ranking) not parsing.

### Golden set (verified by direct DB inspection)

- create-user → `frontend/guide/settings.mdx#1` (Pages table:
  `/system/settings/users/create`) + `#5` (Users section) +
  `backend/guide/authentication.mdx#6` (**User invitations** — POST
  /auth/invitations, user_invitations table, one-time token) +
  `backend/guide/navigation-map.mdx#7`
- idp-code → `backend/guide/entity-field-reference.mdx#2/#4` (idp_code column)
- rbac → `backend/guide/rbac.mdx`, `backend/guide/overview.mdx#6`
- make-admin → `backend/guide/rbac.mdx`, `api/rbac.mdx#7` (Admin bypass),
  `frontend/guide/settings.mdx`
- offtopic → nothing (control)

### Summary matrix — golden chunks in top-4 (out of N paraphrase×4 slots)

| intent | raw | +kw | +ctboost | found in top-15 |
|---|---|---|---|---|
| create-user | 4 | 5 | **11** | 5/5 |
| idp-code | 0 | 0 | 0 | **0/3 — KB gap** |
| rbac | 5 | 5 | **7** | 3/3 |
| make-admin | 0 | 0 | 1 | 2/3 → 3/3 |
| offtopic | 0 | 0 | 0 | 0/2 ✅ (sims <0.30, under MIN_SIM anyway) |

### Diagnosis (evidence-backed)

1. **Ranking defect (fixable)**: OpenAPI/conceptual chunks outrank user-guide
   tutorials on how-to questions. `system#GET /auth/me` (sim 0.55) beats
   `settings.mdx#Users` (0.41–0.51) on every create-user paraphrase. With
   `ctboost`, ALL 3 golden docs reach top-4 on every paraphrase →
   meaning-determinism achieved for create-user and rbac.
2. **KB content gap #1 — "IDP Code"**: `idp_code` appears only as a column
   name in field-reference/filter-syntax tables. No doc defines it as
   "the IdP organization code". Sim too low in all variants → golden never
   surfaces. Model bluff answer was actually a reasonable inference.
3. **KB content gap #2 — "make user admin"**: docs describe roles (`admin`
   = `*.*.*`, Admin bypass) but NO UI procedure for assigning admin to a
   user. Retrieval can't surface what isn't written.
4. **Invitation flow IS documented** (`authentication.mdx#6`): POST
   /auth/invitations (admin-only), expiry, one-time token — matches the
   user's expected meaning (Settings→Users→Nuovo Utente → invitation →
   email onboarding).
5. Keywords: confirmed second-order effect; keep (free from S0).
6. Suggested next variables (one at a time): (a) `ctboost` in
   `docs-search-dal` re-rank SQL; (b) doc additions for IDP Code definition
   + admin assignment UI procedure; (c) re-audit.

### §2.3-AUDIT follow-up — variables A+B landed (2026-10-02)

**A — ctboost in `docs-search-dal.ts`**: `CASE content_type` added to the
Phase-2 re-rank (+0.08 tutorial / +0.03 conceptual / −0.10 api). Scoped to
the Guide only (global assistant uses the ai-microservice `vectorSearch`,
separate code path). Router tests 4/4 green.

**B — user-manual pages** (end-user docs, written from real FE code):
`primebrick-fe-v3/docs/user-guide/manual/{users,organizations,roles-and-permissions}.mdx`
— mirrored to `pages/frontend/guide/manual/` (sync-source = FE repo;
`pages/user-guide/` orphan dir removed). `frontend/guide/settings.mdx`
updated (roles rows in Pages table + interlinks). Facts verified in code:
users list opens create in a NEW TAB (`window.open`), `send_invitation`
makes password optional + invitation email + `user_invitations` one-time
token, org-scoped async username check, `is_admin` editable ONLY at create
time (disabled on edit page → admin path for existing users = admin-flagged
role), roles page exists at `/system/settings/roles` (was undocumented).
Reindex: +27 chunks, 1514 total.

**IDP Code**: gap confirmed but doc NOT written — user decision: answers
already good, IdP doc deferred until the feature is ready.

**Re-audit (golden set updated to include manual pages):**

| intent | raw | +kw | +ctboost | before (raw/ctboost) |
|---|---|---|---|---|
| create-user | **15** | 15 | **16** | 4 / 11 |
| idp-code | 0 | 0 | 0 | 0 / 0 (KB gap, deferred) |
| rbac | **9** | 10 | **10** | 5 / 7 |
| make-admin | **8** | 8 | **8** | 0 / 1 |
| offtopic | 0 | 0 | 0 | 0 / 0 ✅ |

`manual/users.mdx#Creating a user` hits sim **0.776** on
"come faccio a creare un utente?" — vs ~0.55 of the API endpoints that used
to win. Meaning-determinism achieved on all covered intents.

**E2E live re-run (ai-guide-quality.spec.ts, 2026-10-02, WebGPU q4f16):
5/5 PASS, guide_test_score=4.00 rank 4.4.** Semantic review of prose:
- create-user → "Impostazioni → Utenti → pulsante creazione →
  `/system/settings/users/create`, compila il form e salva" — CORRECT UI
  procedure (was API endpoint before)
- make-admin → "assegna un ruolo amministrativo dalla pagina di modifica;
  ruoli admin hanno badge System Administrator" — CORRECT real procedure
- RBAC → grounded (role_mappings, pattern matching)
- IDP Code → valid; torta → deterministic "Non lo so"
- Latencies 16.6/11.6/21.6/21.6/6.5s; S2 inspect now productive (extra
  searches return relevant chunks, not noise, because good content exists).

## §2.5 — Deterministic MDX page generator (users/roles/organizations)

**Pipeline (temp, da formalizzare)**: `extract-page-docs.mjs` (Svelte AST +
TS AST → `pages.json`: route, zod fields, `$state` fields bound in markup,
endpoints, navigations `goto`/`window.open`, customActionHandlers,
composables, i18n keys) → `render-page-docs.mjs` (pages.json + BE `*.meta.ts`
via ts.transpile+eval + `system.translations` DB + `makeEntityRouter` configs
→ MDX). Output: `pages/frontend/guide/manual/*.mdx` (9 pagine) +
`entities-crud.mdx`.

**Fonti di verità (nessun dizionario custom — rimosso dopo review)**:
- `system.entities.<e>.{singular,plural,title}` → nomi entità
- `system.entities.<e>.fields.<col>` → label colonne
- `system.entities.<e>.hints.<col>` → descrizioni lunghe (solo alcune)
- `system.settings.<leaf>.{create,update}.{title}` / `settings.roles.{create,edit}Title` → titoli pagina
- `system.settings.<leaf>.{subtitle,createSubtitle,editSubtitle}` → descrizioni pagina
- `settings.roles.field<Name>Hint` → hint campo su pagine custom
- `*.meta.ts` → columns (flags), row_custom_actions (perm+flags), title_key
- `makeEntityRouter` config → `permissions:<op>` = route registrata + permessi,
  `duplicate:false`, `metaExtraScans` (es. auth/users con rbacHandler perms),
  `actionMiddlewares` → requireMfaStepUp per op
- Verità emersa: route registrata **iff** `permissions.<op>` presente nel
  config; `purge` senza `delete` = hard-delete-only (role_mapping)

**E2E runs**: v1 deterministico 5/5 ma T4 errato ("set is_admin in edit");
v2 con dizionario 5/5 T4 migliorato (verdetto invalidato: dizionario = oracolo);
v3 senza dizionario + meta/translations reali: da testare.

**Open decisions**:
- Title format: "Users List" pattern CRUD vs "Users" (vero H1 da
  `settings.tabs.users`) — l'utente vuole il pattern; valutare chiave
  `entities.<e>.pages.list.title` = "{plural} List" (i18n supporta {var}
  via interpolateTemplate — provato da `invitationSent={email}` ecc.)
- Tabella vs embedding: le tabelle perdono associazione riga↔header nel
  retrieval → aggiungere "semantic digest" prosa post-tabelle (frasi
  deterministiche: "The create action is enabled for User and creates a new
  user — opens in a new browser tab. Required permissions: X.")
- Residui: Password widget "checkbox" errato; perms `—` per ops extra-scan
  (risolvibile parsando users.router.ts); label `IDP Owner` su idp_org
  (traduzione DB, non nostra)

## §2.6 — Page-title canonical standard (FE + MDX, fonte unica)

**Censimento binding H1 (9 pagine, verificato)**: users list →
`settings.tabs.users` ("Users"); users create → `settings.users.create.title`;
users edit → `resolvePageTitle(display_name)` + fallback
`settings.users.update.title`; roles list → `settings.roles.title` (non tabs!);
roles create/edit → `settings.roles.{createTitle,editTitle}`; organizations
list → `settings.tabs.organizations`; org create → `settings.organizations.
create.title` ("**New** Organization" — rompe il pattern); org edit →
`resolvePageTitle` + `settings.organizations.update.title`.
Incoerenze: 3 stili di naming, nessun "List", verb irregolare su org create.

**Standard**: 3 chiavi template generiche interpolate via
`interpolateTemplate()` (esiste, `{var}` syntax provata):
- `system.entities.page_title.list`  en `"{entity_plural} List"` / it `"Lista {entity_plural}"`
- `system.entities.page_title.create` en `"Create {entity_singular}"` / it `"Crea {entity_singular}"`
- `system.entities.page_title.edit`   en `"Edit {entity_singular}"` / it `"Modifica {entity_singular}"`
- helper FE `entityPageTitle(meta, 'list'|'create'|'edit', t)`; i 9 binding
  sostituiti; `meta.title_key` rimappa su `page_title.list` per generic list.
- `settings.tabs.*` resta (label nav/breadcrumb, contesto diverso).
- Shrink candidato (approvato): settings.{users.create,users.update,
  roles.createTitle,roles.editTitle,organizations.create,organizations.update}
  .title + entities.organization.create.title → 7 chiavi rimosse.
- Decisioni utente: "New Organization" → "Create Organization" (uniformato);
  edit H1 su record page → standard "Edit {singular}" (nome record va nel
  breadcrumb/display, non nell'H1 standard) — da verificare in review.
- Doc: standard documentato in `entities-crud.mdx` + regola agente FE.

## §2.7 — Semantic digest (uniform sentence pattern)

Sotto ogni tabella, frasi deterministiche generate dalle righe. Pattern unico:

- **Actions**: `"{Gerund subject} is {available|not available} on this page
  — {behavior/desc} and requires the {perm} permission{, and step-up
  authentication is required}{, unavailable on deleted rows}."`
  Soggetto = gerund del primo verbo del desc template (create→Creating,
  purge→Permanently deleting, audit→Viewing the change history of).
  Desc+perm presenti **in entrambi i casi**: disabled → "if enabled, it would
  require the X permission". Perm derivato per convenzione
  `<entity>.<op>.<scope>` verificato contro l'enum Permission del SDK.
  Separatore `—`, mai `:` schematico.
- **Columns**: `"The {Label} column is {shown|hidden} by default and
  {can|cannot} be sorted{ and filtered}. — {hint desc se esiste}"`
  Esempio Admin: `"The Admin column is shown by default and can be sorted and
  filtered — the Identity Administrator flag allows ..."`.

Esempi approvati:
- "Creating a new user is available on this page — the create action opens
  the create form in a new browser tab and requires the
  `user_profile.create.single` permission."
- "Permanently deleting a user is not available on this page — if enabled,
  it would require the `user_profile.delete.single` permission."
- "Changing a user's password is available on this page — set a new password
  for this user; they will need it on next login — it requires the
  `AUTHENTICATED_ADMIN` permission, and step-up authentication is required."
- "The Admin column is shown by default and can be sorted and filtered — the
  Identity Administrator flag allows the user to access the IDP system to
  make administrative-level changes, but does not grant administration rights
  to this application."

### Phase 2.5 — Deterministic MDX generator (eseguita 2026-10-02)
| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.5.1 | Titoli canonici `system.entities.page_title.{list,create,edit}` — SQL fire-and-forget + 18 righe in `system.translations` (6 lingue) | ✅ done | `add_page_title_translations.sql` |
| 2.5.2 | FE `entityPageTitle(metaOrKey, kind, $t)` in `entity-meta.ts` + refactor 10 pagine (users/roles/organizations ×3 + customers list) | ✅ done | svelte-check clean; breadcrumb edit = nome record |
| 2.5.3 | Shrink 7 chiavi ridondanti (soft-delete, 49 righe) | ✅ done | zero riferimenti residui in FE/US |
| 2.5.4 | Standard documentato: sezioni "Page titles" + "API existence" in entities-crud.mdx + rule `.devin/rules/page-title-standard.md` | ✅ done | |
| 2.5.5 | Generator: due tabelle azioni + Step-Up col + perms da extra routers + audit ENABLED + changePasswordDescription + digest prosa | ✅ done | 9 MDX pubblicati |
| 2.5.6 | Reindex docs + E2E live | ✅ done | 2026-10-03 | 1559→2560 chunk (atomic bullets + heading_path context, paraphrase-multilingual-MiniLM-L12-v2). E2E finale 5/5 PASS score=4.00 rank=4.4, latenze 16.6/16.6/21.6/21.6/6.6s. Incidents risolti: (a) primo run con all-MiniLM-L6-v2 ≠ modello FE → vettori incompatibili, T2-T4 "Non lo so" → reindex col modello giusto; (b) graph expansion senza floor → T5 "torta" aveva 4 sources e risposta fabbricata → `min_similarity` propagato FE→BE, expansion solo da hit ≥ soglia. Nuovo: `metadata.links` estratto a index-time, `expandDocGraph` in docs-search-dal (best chunk per pagina linkata, flag `graph_expanded` bypassa il floor FE), `env.allowLocalModels`+`EMBEDDING_LOCAL_ONLY` nel provider |
| 2.5.7 | Retrieval quality: contextual chunking + doc-graph expansion | ✅ done | 2026-10-03 | chunking.ts: heading_path gerarchico + bullet `- ` atomici; docs-loader: extractDocLinks (→metadata.links); docs-search-dal: expandDocGraph; guide-loop: bypass floor per graph_expanded. Probe: IDP Code ora risponde grounded (idp_code→JWT sub da api-reference), admin→users.mdx Admin column 0.57 + graph tira users-edit/roles |
| 2.5.8 | S4 action bias: entity-scoped route candidates | ✅ done | 2026-10-03 | Root cause: S4 riceveva ~30 route grezze senza contesto → sempre `users/create`. Fix: `entity` canonico (`meta.entity`) nel frontmatter MDX → metadata KB; census allineato (`user_profiles`→`user_profile`, `role`→`role_mapping`); guide-loop filtra `route_candidates` per entity delle sources (vuoto → nessuna azione); prompt S4 annota kind+entity; chip espone `data-route` |
| 2.5.9 | Baseline onesta E2E: expected_sources + allowed_actions | ✅ done | 2026-10-03 | spec registra `source_hrefs`/`action_routes`/`src_hits`/`action_off` per turno (evidenza, non-scoring). Run: 5/5 score=4.00 rank=4.4, src_hits 1/1 su tutti i turni coperti, action_off vuoto. Azioni: T1→users/create ✅, T2→nessuna ✅, T3→nessuna ✅, T4→roles ✅, T5→nessuna ✅ |
| 2.5.10 | Loop knobs → cerebellum execution_config | ✅ done | 2026-10-03 | guide-loop: `resolveLoopConfig(exec_config)` — max_context_chunks(4), max_chunk_chars(1500), inspect_chunk_chars(350), max_retrieval_iterations(2), max_actions(3), preflight_temperature(0), preflight_max_tokens(160); i preflight restano deterministici a prescindere dalla temp S3/S4 |
| 2.5.11 | Hybrid search vera: canale FTS + lexical_match | ✅ done | 2026-10-03 | docs-search-dal: `lex` CTE con `websearch_to_tsquery('simple', keywords)` unito ai candidati vector; `lexical_score` (ts_rank_cd) nel re-rank (boost 0.15); `lexical_match` (lex-only + rank≥0.1) bypassa il floor FE come graph_expanded. Probe: "IDP Code" tira entity-field-reference e audit-trail (sim~0, assenti dal top-24 vector); "torta" lex=0, fallback intatto |
| 2.5.12 | Cerebellum tuning: temperature 0→0.7 (esperimento creatività) | ✅ done | 2026-10-03 | `tune_guide_cerebellum_temperature.sql` (riga id=25). Effetto su S3+S4 (effective_params), preflight invariati. E2E 5/5 score=4.00: risposte più lunghe/verbose ma degradazione grammaticale IT ("Gli permessi sono verificate", "tracabilità") + T4 troncata a 512 tok + 2 azioni (roles+roles/create). Verdict: 0.7 troppo alto per il 3B multilingua; candidato 0.2-0.3 |
| 2.5.13 | De-hardcodizzazione completa guide path + temp 0.2 | ✅ done | 2026-10-03 | Loop caps residui → exec_config (max_queries 3, max_keywords 8, inspect_digest_size 6, max_searches 3); rank knobs DAL → request opts docs/search (keyword_boost .05, lexical_boost .15, lex_match_min .1, oversample 4, graph_max_paths 6) forwardati da guide-loop via exec_config; zod bounded. temp→0.2: E2E 5/5 4.00, grammatica OK, T3 più dettagliata (firma isPermissionGranted), ma T3/T4 troncate a 512 tok e T4 ancora 2 azioni (roles+roles/create spurio) |
| 2.5.14 | Tuning finale: temp 0.1 + max_tokens 640 | ✅ done | 2026-10-03 | E2E 5/5 4.00. T1 migliore di sempre (procedura completa con route, 11.6s); T4 spurio `roles/create` sparito (solo `roles`); T3/T4 ancora chiudono la frase a metà. Verdict: compromesso migliore finora — risposte più narrative senza disastri grammaticali |

### Phase 3 — Real agentic loop on WebGPU (eseguita 2026-10-06, sessione sera)

Sostituito il retrieval orchestrato S0-S2 con loop model-driven
`generate → tool_call → execute → append tool message → DONE` nel browser.
Modello `onnx-community/Qwen2.5-Coder-3B-Instruct#q4f16` WebGPU, tools nel
chat template nativo Qwen (`has_tools=true` verificato nel prompt renderizzato).

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Tool registry {docs_search, docs_fetch, list_routes} + BE `POST /system/docs/document` (metadata inclusa) | ✅ done | fetchDoc in api.ts; getDocByPath riunisce i chunk per path |
| 3.2 | Multi-dialect tool-call parser | ✅ done | WebGPU non emette `<tool_call>` JSON canonico ma shorthand: `docs_search "q"`, `docs_search(q)`, `docs_search: "q"`, `docs_search(query="q")` — tutti parsati |
| 3.3 | Guards onesti e telemetrati | ✅ done | `agent_premature_done` (DONE a turno 0 senza search → reprompt 1×); `agent_shallow_done` (DONE con hit ma zero fetch → reprompt 1×); seed-search solo se 0 call totali |
| 3.4 | Coverage deterministica | ✅ done | `found` = searchHitCount>0; docs_fetch arricchisce ma non crea copertura (evita fabbricazioni su "torta"); NO_COVERAGE come parola terminale testato e REVERTED (il 3B la emetteva anche dopo fetch corretti) |
| 3.5 | Digest per-documento + policy corpus | ✅ done | digest dedup per path (12 candidati), campo `entity` esposto, similarity rimossa (il modello sceglieva il numero più alto, non la policy); boost +0.25 a `frontend/guide/`; corpus filtrato a `frontend/guide/` — esclusi dev refs (backend/api/sdk) |
| 3.6 | PRIMARY SOURCE condizionale + entity scoping S3 | ✅ done | marker solo se l'entity del fetch ∈ entity dei search hit; contesto S3 ristretto alle entity dei doc fetchati confermati |
| 3.7 | Contenuto docs | ✅ done | nuovo `manual/permissions-rbac.mdx` (RBAC user-facing — prima esistevano solo reference dev); users-create/users-edit: step di ingresso nella procedura admin |

E2E finale (WebGPU): score 4.00, rank 4.4, 5/5 pass.
Evidenza chiave: T3 mostra retry autonomo genuino — `docs_search "RBAC
permissions explanation"` → `[]` (filtro guida) → il modello riformula
`docs_search "Role-Based Access Control (RBAC) explained"` →
`docs_fetch permissions-rbac.mdx` → DONE → risposta user-facing corretta.

Commit: FE 17d1bf8, BE 9e44519, docs c692dd1.
