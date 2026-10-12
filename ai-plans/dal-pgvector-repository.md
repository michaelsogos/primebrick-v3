# DAL — repeatable pgvector support in Repository

> Context: `.devin/rules/dal-usage.md` mandates `getDal()`/`Repository` as the
> ONLY DB access; `getPool()` is infra-only. Today `ai.docs_kb` (and
> `ai.conversation*`) bypass the DAL with raw `pool.query` because pgvector
> types and the `<=>` operator are not supported by the metadata-driven DAL.
> This is the sanctioned reason those files violate the rule — and the reason
> the rule stays unenforceable: as long as one legitimate raw-SQL use case
> exists, `getPool()` must stay public and any consumer can abuse it.
> Closing the hole requires DAL-native vector support first, then removing
> the raw repositories.

## Status: ⚪ TODO — Plan date: 2026-10-12

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `pgType: "vector(N)"` support in entity meta + type adapter (number[] ↔ `[v1,v2,...]` literal) | ⏳ not done | — | |
| 2 | `Repository.vectorSearch(entity, vectorField, queryVector, opts)` — parameterized top-k similarity query | ⏳ not done | — | DSL-safe, honors schema/tableName/projections/filters |
| 3 | Port `ai/docs-kb-repository.ts` to Repository (upsertDocChunk, vectorSearch, deletes, getDocHashes) | ⏳ not done | — | removes 10 `pool.query` |
| 4 | Port `ai/conversation-repository.ts` to Repository | ⏳ not done | — | removes 8 `pool.query` |
| 5 | Remove `getPool()` from consumer surface (DAL hardening) + lint check banning `getPool`/`pg` imports outside `src/db/` | ⏳ not done | — | after 3-4 land; updates affected unit tests |
| 6 | **Ext-JSON sweep**: audit every `JSON.stringify`/`res.end(JSON.stringify(...))` on response paths across BE/US/FE and replace with `extJsonStringify` — ai/composite-route (5×) + docs-search-route (1×) DONE 2026-10-12; restano BE, emailsender, webhook, altri US | ⏳ partial | 2026-10-12 | NOTA: le 6 fix nel servizio AI sono standardizzazione, NON bugfix — verificato: `ai_conversations` ha PK `uuid`, `ai_feedback` RETURNING omette `id` → nessun payload conteneva bigint, nessun crash latente |
| 6b | **Ext-JSON enforcement**: shared standards-check script (ban `JSON.stringify`/`JSON.parse`/`getPool()`/`from "pg"` in `src/**`, exemptions via `// standards-exempt: reason`), wired in `build`/`test` + CI | ⏳ not done | — | design below |

---

## Ext-JSON enforcement (task 6 detail)

The wire serialization standard is `extJsonStringify`/`extJsonParse`
(`@primebrick/sdk/json/ext-json`, FE `src/lib/api-ext.ts`): every integer is
`bigint` on both ends, no `number|bigint` ambiguity, and `JSON.stringify`
CANNOT substitute it (it throws on bigint). The rpc-router already
serializes handler returns via `extJsonStringify` — so handlers must NEVER
call `res.end(JSON.stringify(...))` manually and services must never
"defensively" `Number()`-normalize DAL values.

Known violations to fix:

- `ai/src/controllers/http/composite-route.ts` — `res.end(JSON.stringify(...))`
  at ~5 sites (error envelopes, conv/feedback, mapped proxy body)
- `ai/src/controllers/http/docs-search-route.ts` — 1 site
- `ai/src/services/conversation-repository.ts` — `JSON.stringify(content)`
  for a jsonb column (legit storage use — allowlist class)
- Hash-input `JSON.stringify` in `docs-drift.ts`/`embedding-pipeline.ts`
  (legit — deterministic content hash, allowlist class)

Enforcement design (task 6b — decision: FULL ban, not just wire paths):

- **Mechanism**: zero-dep script `tools/check-standards.ts` in
  `primebrick-v3-sdk` (run via `bun`/`tsx`, no eslint needed — BE/US/SDK/DAL
  have NO eslint today; only FE has `eslint.config.js`). Scans `src/**`
  for banned call sites:
  `JSON.stringify`, `JSON.parse`, `getPool()`, `from "pg"`, `pool.query(`.
- **Exemptions**: inline comment `// standards-exempt: <rule> <reason>` on
  the same/previous line — REQUIRED reason text so every bypass is
  review-visible in git diff. Expected legit classes today: deterministic
  hash inputs (`docs-drift`, `embedding-pipeline`), jsonb column payloads,
  external-API request bodies (non-Primebrick wire), dev scripts/stdout.
- **Wiring**: each repo gets `"check:standards": "bun <sdk>/tools/check-standards.ts"`
  and it runs in `prebuild` + `test` + CI → any `JSON.stringify` = build
  error, not a warning.
- **FE**: same rule added to `eslint.config.js` via `no-restricted-syntax`
  (`CallExpression[callee.object.name='JSON']`) — eslint already exists
  there and gives IDE-level errors inline.
- **Why script over eslint**: single source of truth across 5 repos, no new
  dev-deps in 4 repos, the same check covers `getPool`/`pg` (task 5) for free.
- If a legit `JSON.stringify` need emerges: the fix is either an
  `extJson-exempt` helper (e.g. `hashCanonical()`) or a documented exemption
  — never silent use.

## pgvector — dynamic-entity pattern compliance (added after review)

`vectorSearch` and the write path MUST follow the existing
`<TEntity extends object, TResult = TEntity>(entity: EntityClass, ...)`
signature convention of `findAll`/`add` — the entity carries schema,
tableName, soft-delete scoping and projections; nothing is hardcoded to
`docs_kb`. The vector field is passed as `FieldRef` (from `field(Entity,
"embedding")`), the query vector is always a `$n` parameter, and the
returned shape is `TResult & { similarity: number }` — same contract as
finders (caller projects what it needs, `tableName` override still works).
Any entity declaring `@Column({ pgType: "vector(N)" })` gets search+write
for free — no per-table code.

---

## Current state — what the raw repositories do and why

### `ai/src/services/docs-kb-repository.ts` (10 raw queries)

| Function | SQL feature the DAL lacks today |
|---|---|
| `upsertDocChunk` | `ON CONFLICT (repo,path,chunk_idx) DO UPDATE` + `vector` literal cast |
| `vectorSearch` | `embedding <=> $1::vector`, `1 - (embedding <=> $1)` similarity, `ORDER BY embedding <=> $1` |
| `getDocHashes` | plain select — portable now via `findAll` |
| `deleteStaleChunks` | `NOT (chunk_idx = ANY($3::int[]))` — `Filter.raw` or `Filter` with array operand? |
| `getAllDocPaths` | `SELECT DISTINCT` — `groupBy` works today |
| `deleteDoc` / `deleteRepoDocs` / `wipeIndex` | `Repository.delete` with filters — portable now |

### `ai/src/services/conversation-repository.ts` (8 raw queries)

Conversations/messages tables — needs analysis but likely portable via
`findAll`/`add`/`update` once vector columns aren't involved.

### Infra uses that legitimately stay raw

`HealthCheckAdapter` (`SELECT 1`), `pgServerBanner`, snapshot/migration
builders (`build-database-snapshot`), the `entity-repo.ts` `Repository`
constructor, seed scripts. These are `src/db/` / adapter-layer concerns and
are the only sanctioned `getPool()` callers.

## Proposed repeatable model in `@primebrick/dal-pg`

### 1. Vector column type

```ts
@Column({ pgType: "vector(1024)" })
embedding!: number[];   // was: string
```

- New `VectorColumn` handling in entity meta: `pgType: "vector(N)"` stores
  `number[]` in TS, serializes to `'[v1,v2,...]'` (or binary) on write and
  parses on read — registered alongside the INT8→bigint / NUMERIC→number
  adapters in `dal.ts`.
- `@Entity` consumers declare the dimension once; `vector(N)` validation
  stays a DDL concern (migration), not a runtime check.

### 2. Similarity query — one canonical method

```ts
const hits = await repo.vectorSearch(DocsKbEntity, field(DocsKbEntity, "embedding"), queryVec, {
  topK: 8,
  filters: [Filter.fieldValue(field(DocsKbEntity, "repo"), "=", repo)],
  fields: standardProjections,          // reused entity projections
  distance: "<=>",                      // cosine; "<->" L2, "<#>" inner product
  similarityAlias: "similarity",        // SELECT adds `1 - (emb <=> $n)`
});
```

- Emits parameterized SQL: `ORDER BY "embedding" <=> $N::vector LIMIT $N+1`
  — never interpolates the vector (parameterized → index ivfflat/hnsw
  friendly).
- Honors `tableSchema`/`tableName`, soft-delete scoping, `search_path`.
- Returns `Array<TEntity & { similarity: number }>`.

### 3. Writes — DECISION (user-directed, 2026-10-12)

NO upsert anywhere (deliberately banned pattern in this codebase) and NO
soft-delete in the ingestion/indexing context — derived-index rows are
physically deleted. `docs_kb` stays a **non-auditable** entity, so
`delete`/`deleteMany` are already physical `DELETE`s; `hardDelete` exists
for deletable entities elsewhere if ever needed.

The upsert is replaced by an explicit diff → bulk pattern, which matches
how ingestion already works (hash-diff per chunk):

| Today (raw) | DAL port |
|---|---|
| `upsertDocChunk` (INSERT … ON CONFLICT DO UPDATE) | `getDocHashes` → `findAll` diff → **`addMany`** for new/changed chunks; `updateMany`/`update` by `{repo,path,chunk_idx}` match for changed-only re-embeds (decide at implementation: addMany+deleteMany of changed set vs updateMany — prefer updateMany to preserve `id`/`created_at`) |
| `deleteStaleChunks` (`NOT (chunk_idx = ANY($n))`) | `deleteMany` with match rows `{repo,path,chunk_idx}` per stale chunk (computed in JS from the hash map — no ANY filter needed) |
| `deleteDoc` / `deleteRepoDocs` / `wipeIndex` | `delete`/`deleteMany` with match `{repo,path}` / `{repo}` — physical by default on non-deletable entity |
| `getDocHashes` / `getAllDocPaths` | `findAll` (+ `groupBy` for DISTINCT pairs) |
| `vectorSearch` | `repo.vectorSearch` (task 2) |

`addMany`/`deleteMany`/`updateMany` are the bulk paths the user pointed at:
one round-trip per batch instead of per-chunk — strictly better than the
current per-chunk `pool.query` loop for ingestion.

### 4. Then the enforcement layer becomes enforceable

With zero legitimate consumer raw-SQL cases left:

- `getPool()` restricted: rename/move to an infra-only export
  (`@primebrick/dal-pg/infra` or `getInfraPool()`), consumed only by
  `src/db/`, health adapters, snapshot tooling.
- Repo lint check (script or CI step):
  `rg -l "getPool\(|from ['\"]pg['\"]|\.query\(" src/ --glob '!src/db/**' --glob '!**/adapters/health*'` → non-empty = fail.
- Update affected unit tests (health adapter mocks pool today; snapshot
  tests) — run full suite, no regressions.

## Acceptance

1. `docs-kb-repository.ts` deleted; every caller uses `Repository` methods.
2. `vectorSearch` result identical to raw SQL version (same top-k, same
   similarity) — verify empirically with a known query embedding.
3. `conversation-repository.ts` deleted likewise.
4. Zero `getPool()`/`pool.query`/`pg` imports outside the allowlist —
   enforced by the lint check.
5. New consumers needing vector columns write `@Column({pgType:"vector(N)"})`
   and call `vectorSearch` — no new raw repositories possible.
