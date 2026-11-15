# Plan — "Guida/Lighthouse" AI Assistant (KB-only, local-first) + DRY realignment

## 0. Decisions locked by the user

- **Model**: Guide uses the SHARED global default `ai_assistant_model`
  (currently `onnx-community/Qwen2.5-Coder-3B-Instruct#q4f16`) — no dedicated
  config key. Specialization lives in the `guide` cerebellum only.
- **Embedding worker**: SEPARATE worker from `ai-worker.ts` (chat = WebGPU,
  embedder = WASM/CPU, no contention).
- **Icon**: `lighthouse` — bump `@lucide/svelte` to a pinned version ≥1.40.0.
- **Sheet/i18n standards** (verified in `docs/ai/`): panel id `shell.aiGuide`
  registered in `SheetHost` + `SheetPanelId`; i18n namespace
  `app.smart.guide.ai.*` → BE `system.translations` seeds (all languages) +
  EN-only keys in `en-GB-fallback.json`.

- **Two separate assistants.** Topbar `MessageSquare` = global assistant
  (server LLM, KB + MCP data, conversations/feedback/citations). New topbar
  **`Lighthouse`** icon ("I guide you on the way") = dedicated **Guide
  assistant**, KB-only, specialized like every other Smart assistant.
- **The AI docker machine (us/ai + mistral.rs) is OPTIONAL.** Default =
  LOCAL generation in the browser worker. The global assistant remains the
  "backend" power mode for later; the Guide must work with zero AI-service
  uptime.
- **Retrieval compute on PG**: the BE must not run an embedding runtime —
  no ML garbage in BE memory. Vector math happens inside Postgres (pgvector
  HNSW, `<=>` cosine).
- **Ingestion stays 100% manual** — no CI hooks, no schedulers, no pull-based
  fetchers. Existing `POST /api/v1/ai/reindex` (or equivalent manual trigger).
- **Cerebellum = specialization layer**: a NEW `assistant_key='guide'`
  cerebellum preset on the SAME base model (no base param changes).
- **DRY is mandatory**: the shared `smart-ai` panel/composable standard is the
  only allowed way to build chat panels.

---

## 1. Corrected terminology

- **MiniLM-L6-v2 = embedding model only** (query/doc → 384-dim vector),
  currently default in `us/ai/embedding-provider.ts`. It is NOT a chat model.
- **Server chat LLM** (global assistant): `Qwen3-4B-Instruct-2507` via
  OpenAI-compatible (`llm-provider.ts`) — intentionally similar to our local
  Qwen3-4B, since testing showed local models are weak at long multi-turn
  recall but fine for bounded tasks.
- **FE AI engine** = `ai-worker.ts` (Transformers.js/ONNX WebGPU) + `ai_models`
  catalog + `ai_cerebellum` per-assistant tunings. The Guide uses THIS.

### Verified live state (queried on the real DB — do not re-derive from migrations)

- **Default model**: `config_entries.key='ai_assistant_model'` →
  `onnx-community/Qwen2.5-Coder-3B-Instruct#q4f16` (the ONLY `is_enabled=true`
  row in `ai_models`). Resolution chain: that config key →
  `ai-chat-panel.svelte` reads it → optional per-assistant override in
  `sessionStorage[<assistant_id>-switch-model]`.
- **Cerebellum rows**: one row per `(assistant_key, model_id)`; existing
  `regex` + `json_config` both target the Coder-3B model. `is_default` was
  removed — do NOT reintroduce it.
- **KB live data**: `ai.docs_kb` = 1349 chunks / 108 docs, `vector(384)`,
  HNSW cosine index.

## 2. Architecture — where embeddings live

### Split of responsibilities

| Stage | Who | Where | Runs when ai-service down? |
|---|---|---|---|
| **Ingestion** (docs → chunks → embeddings → `ai.docs_kb`) | `ai` microservice `runEmbeddingPipeline` (manual `/reindex`) | ai container | ❌ no — acceptable: manual, rare, admin-triggered |
| **Query embedding** (user question → vector) | **Browser worker** (Transformers.js `feature-extraction`, quantized MiniLM) — executed inside a `search_docs` **client tool call** | FE | ✅ yes |
| **Vector + keyword search** (`embedding <=> $1`, HNSW + ILIKE keyword boost, no extra index) | **Postgres** — pure SQL | shared PG instance | ✅ yes |
| **Search endpoint** | **BE** — thin pass-through, floats in → rows out | BE 3001 | ✅ yes |
| **Answer generation** | **Browser model** (catalog Qwen3-4B + `guide` cerebellum) | FE | ✅ yes |
| Global assistant search | **same BE DAL fn**, exposed as MCP tool `search_docs` on BE `/mcp` — ai service embeds text → calls tool with the vector | BE `/mcp` | n/a (needs ai anyway) |

BE and `ai` share the same Postgres database (`DATABASE_URL` → db `primebrick`,
ai uses schema `ai`), so the BE can query `ai.docs_kb` directly — no
replication, no second store.

### Retrieval flow: `search_docs` as a FE client tool

The local LLM drives retrieval through a client tool call — this makes
query translation and keyword extraction **free** (the LLM writes the args):

1. User asks (any language) → model emits `search_docs` tool_call with
   `{query_en, keywords[]}` — query already translated to English, jargon
   terms kept literal in `keywords` ("IDP", "x-user-is-admin").
2. FE executes the tool: embeds `query_en` in the worker →
   `POST /api/v1/system/docs/search {embedding, keywords, k}`.
3. PG returns chunks → fed back as tool result → model writes the answer
   with `[source: …]` citations.

Consequences:

- **MiniLM stays sufficient** — it only ever embeds English text. The
  multilingual embedder is dropped from v1 (revisit only if we later add a
  no-LLM docs search box).
- **No second index needed for keyword matching.** `docs_kb` is tiny
  (~thousands of chunks) — a sequential `ILIKE` costs ms. One SQL query
  blends vector + exact-term boost:

  ```sql
  ORDER BY (embedding <=> $1)
         - $4 * (SELECT count(*) FROM unnest($3::text[]) kw
                 WHERE content ILIKE '%' || kw || '%')
  ```
- **Ingestion tweak (free recall win)**: embed `title + heading_path +
  content` so identifiers/headings weigh more in the vector.

### Why client-side query embedding is the right trade-off

- **Zero BE memory garbage**: BE never loads an ML runtime; it receives
  `number[384]` + keywords and runs one indexed SQL query.
- **Zero extra server dependency**: no embeddings HTTP service needed.
- Model is small and cached: `Xenova/all-MiniLM-L6-v2` quantized (q8) ≈ **23
  MB** download (Cache API / service worker), WASM/CPU ≈ 10–50 ms per query.
- Contract risk (managed): **the query-side model MUST match the
  ingestion-side model**. `config_entries` row `ai_embedding_model` read by
  BOTH the FE worker and the ai ingestion pipeline — they cannot diverge.

### Rejected: BE-side query embedding

Running transformers.js inside the BE costs ~100–200 MB RSS plus GC pressure
on every query — exactly the "garbage on BE memory" to avoid. Also adds a
model-download lifecycle to the API process. PG-side compute + client-side
embedding is strictly better here.

## 3. BE work (primebrick-be-v3) — one DAL function, two surfaces

**Core**: `searchDocsKb({embedding, keywords?, k?, repo?})` in a new
`src/modules/docs/` (or `system`) module — the SQL in §2 plus the
`min_similarity` floor → `{chunks, found}`.

**Surface A — REST** `POST /api/v1/system/docs/search` (`AUTHENTICATED_USER`):
consumed by the FE Guide composable (same-process client tool — MCP handshake
in the browser would be pure overhead). `GET /api/v1/system/docs/tree` for
guide browsing.

**Surface B — MCP tool** `search_docs` on the BE `/mcp` server: input schema
`{embedding: number[384], keywords?: string[], k?, repo?}` → calls the same
DAL function. Rationale: the ai-service orchestrator already merges BE MCP
tools, so the **global assistant inherits KB search for free**, and its local
`search_docs` wrapper shrinks to "embed text → call MCP tool". The BE never
embeds text — embeddings arrive as vectors from whoever computed them
(FE worker for Guide, ai-service provider for Global).

New `config_entries` seeds: `ai_embedding_model`,
`ai_docs_search_min_similarity`, `ai_docs_search_keyword_boost`.

## 4. FE work (primebrick-fe-v3) — all Smart-standard

### 4.1 Guide assistant = new Smart component

- `src/lib/components/ui/smart-guide/`:
  - `use-guide-ai.svelte.ts` — wraps `useAiAssistant`, `assistant_key: 'guide'`
    - `transform_user_content`: ① embed query via worker feature-extraction
      pipeline → ② `POST /api/v1/system/docs/search` → ③ inject top chunks +
      page context (`route`, `module_code`) into the prompt.
    - `process_response`: extract `[source: …]` citations → `citations` on the
      message for chip rendering; empty retrieval → force the honest
      "Non lo so / not documented" answer path.
  - `guide-ai-chat-panel.svelte` — thin wrapper over shared `AiChatPanel`
    (like `regex-ai-chat-panel.svelte`), plus a `citations`/`browse` snippet.
- Worker: extend `ai-worker.ts` (or a second lazy worker) with a
  `feature-extraction` pipeline — model id from `ai_embedding_model` config.
- Cerebellum: new `ai_cerebellum` rows `assistant_key='guide'` (same base
  model, tuning-only overrides — no base param changes).
- Sheet + CTA: register `shell.aiGuide` in `sheet-manager`/`SheetHost`; topbar
  button **before** the chat icon.

### 4.2 Icon — verification result

`lighthouse` exists in Lucide but was **added in v1.40.0**; installed
`@lucide/svelte` is **1.26.0**. Either:
- bump `@lucide/svelte` to a fixed version ≥1.40.0 (check `pnpm view
  @lucide/svelte version` at implementation time; per package-versioning rule
  pin exact, prefer ≥7 days old), or
- use an existing-in-1.26.0 metaphor: `signpost`, `waypoints`, `telescope`,
  `life-buoy`. **Lighthouse via version bump is preferred** (user's pick).

### 4.3 DRY realignment (mandatory, separate concern)

- Extract the common `AssistantEngine` interface (`state`, `messages`,
  `send`, `stop`) implemented by `useAiAssistant` (worker) and a new
  `useSseAssistant` (wraps `aiChatStore`).
- Move server-only features into the shared panel as optional snippets:
  citations, feedback, conversations sidebar, tool-confirm bar.
- Rewrite `shell/sheets/panels/AiChatPanel.svelte` as a thin wrapper —
  deletes ~300 duplicated lines. The `aiSource: 'local'|'backend'` stub in
  the shared panel becomes real.

## 5. Cost analysis — embeddings vs baseline (no embeddings)

| Resource | Cost | Notes |
|---|---|---|
| Client disk | ~23 MB (q8 MiniLM) or ~45 MB fp32 | cached via SW/Cache API like chat models; eviction via `useModelCache` |
| Client RAM | ~60–120 MB transient in worker | load on demand, unload with panel close (`dispose`) — same lifecycle rules as chat models |
| Client CPU/GPU | ~10–50 ms/query on WASM CPU; WebGPU optional | negligible vs chat generation |
| BE memory/CPU | **~0** | floats in, indexed SQL out |
| PG storage | ~10–25 MB for ~3–6k chunks | 384 floats = 1.5 KB/row vector + ~2 KB text + HNSW (~1–1.5× vectors) |
| PG CPU | ms-scale per query | HNSW search + ILIKE seq-scan boost (tiny table, no extra index) |

## 6. Grounding / "Non lo so"

- `min_similarity` floor + `found:false` contract (server-side).
- Guide system prompt (cerebellum/prompt hooks): answer ONLY from injected
  chunks, cite `[source: repo/path]`, 1–3 short paragraphs, user's locale,
  explicit "Non lo so" when `found:false`.
- Eval later: extend `ai/eval/dataset.ts` with the user's real question set +
  adversarial no-answer questions; calibrate floor.

## 7. Ingestion — unchanged, manual

`runEmbeddingPipeline` stays in the ai service; `POST /api/v1/ai/reindex`
(admin) is the only trigger. `DOCS_PATH`/`OPENAPI_PATH` remain filesystem
inputs. No CI, no cron, no pull-loader.

## 8. Work breakdown — phased

### Phase 1 — Guide assistant (primary scope)

| # | Task | Repo | Size |
|---|---|---|---|
| 1 | `POST /api/v1/system/docs/search` + `GET /docs/tree` + config rows | be | S–M |
| 2 | Worker `feature-extraction` pipeline + `ai_embedding_model` config read | fe | M |
| 3 | `smart-guide/` composable (client tool `search_docs`, context injection, citation parsing) + thin panel + `shell.aiGuide` sheet + Lighthouse CTA | fe | M |
| 4 | `ai_cerebellum` seed rows `assistant_key='guide'` | be (patch) | S |
| 5 | Lucide bump ≥1.40.0 for `Lighthouse` (or fallback icon) | fe | XS |

### Phase 2 — DRY migration of the global assistant (same scaffolding, deferred OK)

| # | Task | Repo | Size |
|---|---|---|---|
| 6 | `AssistantEngine` interface + `useSseAssistant` adapter wrapping `aiChatStore` | fe | M |
| 7 | Port citations/feedback/conversations/tool-confirm into shared panel as optional snippets (citation snippet is shared with Guide) | fe | M |
| 8 | Rewrite `shell/sheets/panels/AiChatPanel.svelte` as thin wrapper (~−300 duplicated lines); `aiSource:'backend'` becomes real | fe | S |

### Phase 3 — quality (later)

| # | Task | Repo | Size |
|---|---|---|---|
| 9 | Similarity floor calibration + eval dataset (real + adversarial questions) | us/ai | M |

Note: the Guide does NOT depend on phase 2 — it is a local-engine Smart
assistant. Phase 2 only deletes duplication and brings the global assistant
onto the same standard; the two assistants stay separate (different system
prompts, toolsets, engines) exactly via the existing `create_composable` +
hooks + optional-snippet extension points.

## 9. Acceptance criteria

- Guide CTA (Lighthouse) opens a dedicated Smart-standard assistant that works
  with the ai container **stopped**: browse docs, ask KB questions, get
  cited answers or an explicit "Non lo so".
- BE memory profile unchanged (no ML runtime); search = one HNSW query +
  ILIKE boost.
- `assistant_key='guide'` cerebellum tunings work without touching base model.
- (Phase 2) `shell.aiChat` rebuilt on the shared panel — no duplicated chat UI;
  global assistant keeps its own system prompt/tools, only the shell is shared.

## 10. Open questions

1. OK to bump `@lucide/svelte` to ≥1.40.0 for `Lighthouse`, or prefer an
   icon already in 1.26.0?
2. Guide conversations: ephemeral (local) or reuse `ai_conversations`
   persistence (needs ai service → conflicts with "optional")? Default plan:
   ephemeral/local-first.
3. Embedding model id shared via `config_entries` — OK to seed
   `ai_embedding_model = Xenova/all-MiniLM-L6-v2` now and evaluate a
   multilingual variant later?
