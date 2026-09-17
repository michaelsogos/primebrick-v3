# Plan: New `ai_model` entity + refactor `ai_assistant_model` config to API SOURCES

> **Date**: 2026-09-10
> **Type**: Feature (new entity + refactor + new settings page)
> **Repos impacted**: `primebrick-be-v3`, `primebrick-fe-v3` (no SDK change)
> **Status**: Awaiting approval

---

## Decisions

1. **Permissions**: `AUTHENTICATED_USER` for reads, `AUTHENTICATED_ADMIN` for writes. No SDK change.
2. **DB patch**: New patch file `00000000000008_create_ai_models.sql` (incremental — last existing patch is `00000000000007`).
3. **FE module**: Delete `$lib/ai-models/index.ts` entirely. Replace with new composable `useAiModels.svelte.ts`.
4. **Settings page**: Create a new "Impostazioni AI" page (`/system/settings/ai`) with a generic AI label (NOT "AI Models"). Move the model cache management section from `/system/settings/security` to this new page. The page hosts the `ai_model` entity list (CRUD) + the model cache management section. Label is generic because future AI config (not just models) will live here.
5. **`useRegexAi` signature**: Pass `model_id` only; the composable looks up params internally via `useAiModels()` (lazy-loading).

---

## Objectives

1. **Create a new `ai_model` entity** in the BE following the standard entity
   pattern (Entity → DAL → Service → Router → Meta), with Redis caching.
   This entity is the single source of truth for WebLLM model parameters:
   WebLLM model ID, user-facing name, power level, `enable_thinking`,
   `temperature`, `top_p`, `max_tokens`, `repetition_penalty`, `is_enabled`.

2. **Differentiate sampling parameters per model family**: Qwen3 (hybrid
   thinking) gets thinking-mode params (T=0.6, TopP=0.95); Qwen2.5 (Instruct,
   non-thinking) gets deterministic params (T=0.3, TopP=0.8). These live as
   columns on the entity, not hardcoded in FE.

3. **Refactor the `ai_assistant_model` config row** `type_config` from
   `values_source: "ai_models"` (FE-hardcoded array) to `api_url` pointing
   to the new entity list endpoint (`API SOURCES` pattern). The
   `model_levels` map is removed from `type_config` — `power_level` is now
   a column on the entity.

4. **Migrate the FE** to fetch model data from the BE entity endpoint instead
   of the hardcoded `$lib/ai-models/index.ts` array. Delete the file.
   Both consumers (`ConfigValueInput.svelte` settings dropdown via `api_url`
   + `regex-ai-chat-panel.svelte` AI panel dropdown via `useAiModels`)
   read from the BE.

5. **Wire the FE `useRegexAi` composable** to pass per-model sampling
   parameters (from the entity) to the WebLLM `chat.completions.create` call,
   fixing the hallucination root cause identified in the analysis
   (`analysis-webllm-webgpu-regex-quality.md`). The composable receives
   `model_id` and looks up params via `useAiModels()`.

6. **Create a new "Impostazioni AI" settings page** at
   `/system/settings/ai` that hosts:
   - The `ai_model` entity list (admin CRUD for managing models)
   - The model cache management section (moved from `/system/settings/security`)
   - Future AI-related config (extensible — label is generic "AI", not "AI Models")

---

## Architecture

### Entity naming (per `api-path-conventions.md`)

| Layer | Name | Example |
|-------|------|---------|
| PG table | `ai_models` (plural) | `SELECT * FROM ai_models` |
| TS entity class | `AiModelEntity` (PascalCase singular) | `class AiModelEntity` |
| API URL segment | `ai_model` (singular) | `/api/v1/entities/ai_model/...` |
| Translation key segment | `ai_model` (singular) | `entities.ai_model.title` |
| Meta `entity` field | `"ai_model"` | — |
| Meta `translationKey` field | `"ai_model"` | — |

### Entity schema (`ai_models` table)

| Column | PG type | Nullable | Default | Description |
|--------|---------|----------|---------|-------------|
| `id` | bigint | NO | — | PK (`@Key()`) |
| `uuid` | uuid | NO | — | Unique (`@Unique()`) |
| `model_id` | varchar(100) | NO | — | WebLLM model ID passed to `CreateMLCEngine` (e.g. `Qwen3-1.7B-q4f16_1-MLC`). Unique. |
| `name` | varchar(100) | NO | — | Short display name (e.g. `Qwen3 1.7B`). Not translated — model names are language-neutral. |
| `label_key` | varchar(200) | YES | — | i18n key for the full tier label (e.g. `system.entities.ai_model.qwen3_1.7b.label` → "Qwen3 1.7B (Lower)"). |
| `description_key` | varchar(200) | YES | — | i18n key for the model description/hint. |
| `power_level` | int | NO | 3 | Power indicator 1-5 (1=Lowest, 5=Highest). Drives the 5-bar UI. |
| `is_enabled` | boolean | NO | true | If false, the model is not shown in dropdowns / not available for selection. |
| `enable_thinking` | boolean | NO | false | Whether to pass `enable_thinking: true` to WebLLM for this model. |
| `temperature` | numeric(3,2) | NO | 0.70 | Sampling temperature (0.10-2.00). |
| `top_p` | numeric(3,2) | NO | 0.90 | Nucleus sampling top_p (0.01-1.00). |
| `max_tokens` | int | NO | 256 | Max generation tokens. |
| `repetition_penalty` | numeric(3,2) | NO | 1.10 | Repetition penalty (1.00-2.00). |
| `sort_order` | int | NO | 100 | Display order (ascending). |
| audit + soft-delete | — | — | — | Standard `@AuditTrail()` + `@DeletableField()` columns |

### Seed data (3 models)

| model_id | name | power_level | is_enabled | enable_thinking | temperature | top_p | max_tokens | repetition_penalty | sort_order |
|----------|------|-------------|------------|-----------------|-------------|-------|------------|---------------------|------------|
| `Qwen3-1.7B-q4f16_1-MLC` | Qwen3 1.7B | 2 | true | **true** | 0.60 | 0.95 | 768 | 1.10 | 10 |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | Qwen2.5 1.5B | 3 | true | false | 0.30 | 0.80 | 256 | 1.10 | 20 |
| `Qwen3-4B-q4f16_1-MLC` | Qwen3 4B | 4 | true | **true** | 0.60 | 0.95 | 768 | 1.10 | 30 |

**Rationale for params** (from the analysis — `analysis-webllm-webgpu-regex-quality.md`):
- Qwen3 models are **hybrid thinking** → `enable_thinking: true` + Qwen-recommended thinking params (T=0.6, TopP=0.95). `max_tokens: 768` accounts for thinking tokens (~200-400) + regex output (~100).
- Qwen2.5-1.5B-Instruct is **non-thinking** → `enable_thinking: false` + deterministic params (T=0.3, TopP=0.8). `max_tokens: 256` (no thinking overhead).
- `repetition_penalty: 1.10` for all — prevents repetitive pattern hallucination.

### Redis caching

**Yes, cache in Redis.** This is reference data that changes rarely (only when
an admin adds/edits a model). Follow the exact pattern from
`AuthConfigurationsDal`:

- Entity decorator: `@Cached(300_000)` (5 min TTL — same as other entities)
- DAL: manual list cache with `CacheEntry` + `wrapCacheEntry` + ETag support
  - Cache key: `dal:ai_models:list`
  - Cache TTL: `300_000` (5 min)
  - `findAllWithCache()` returns `CacheEntry<AiModelEntity[]>` for ETag middleware
- **Cache invalidation**: on create/update/delete/restore, delete the Redis
  key `dal:ai_models:list` so the next read re-fetches from DB. Mirror the
  `AuthConfigurationsDal` write-invalidation pattern.

### Permissions

- Read endpoints (meta, list, single, audit): `Permission.AUTHENTICATED_USER`
  — any logged-in user can see available models (needed for the AI panel
  dropdown and the settings page).
- Write endpoints (create, update, delete, restore):
  `Permission.AUTHENTICATED_ADMIN` — only admins can manage models.

### Config row refactor: `values_source` → `api_url`

The `ai_assistant_model` config row's `type_config` changes from:

```json
{
  "values_source": "ai_models",
  "value_field": "id",
  "label_field": "label_key",
  "validation": { "required": true, ... },
  "model_levels": { "Qwen3-1.7B-q4f16_1-MLC": 2, ... }
}
```

To:

```json
{
  "api_url": "/api/v1/entities/ai_model/list",
  "api_verb": "GET",
  "value_field": "model_id",
  "label_field": "label_key",
  "validation": { "required": true, "required_error_label_key": "app.common.validation.required", "rules": {} }
}
```

**What's removed:**
- `values_source: "ai_models"` → replaced by `api_url` (the entity endpoint)
- `model_levels` map → replaced by the `power_level` column on the entity

**What's kept:**
- `value_field: "model_id"` — the config value stores the WebLLM model ID
- `label_field: "label_key"` — the dropdown shows the i18n label
- `validation` — unchanged

**Note on `value_field`**: currently it's `"id"` (the FE array used `id` as
the value field). The entity uses `model_id` as the natural key. The config
value column already stores the WebLLM model ID string (e.g.
`Qwen2.5-1.5B-Instruct-q4f16_1-MLC`), so `value_field: "model_id"` is
consistent. No data migration of the `value` column is needed — it already
contains the model_id string.

---

## CRUD endpoints

All under `/api/v1/entities/ai_model/...` (singular entity segment).

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/api/v1/entities/ai_model/meta` | AUTHENTICATED_USER | Entity metadata |
| GET | `/api/v1/entities/ai_model/list` | AUTHENTICATED_USER | All models (paginated) |
| GET | `/api/v1/entities/ai_model/:uuid` | AUTHENTICATED_USER | Single model |
| POST | `/api/v1/entities/ai_model` | AUTHENTICATED_ADMIN | Create model |
| PUT | `/api/v1/entities/ai_model/:uuid` | AUTHENTICATED_ADMIN | Update model |
| DELETE | `/api/v1/entities/ai_model/:uuid` | AUTHENTICATED_ADMIN | Soft-delete model |
| POST | `/api/v1/entities/ai_model/:uuid/restore` | AUTHENTICATED_ADMIN | Restore model |
| GET | `/api/v1/entities/ai_model/:uuid/audit` | AUTHENTICATED_ADMIN | Audit history |

**Notes:**
- No bulk operations, no export, no duplicate, no aggregate — this is a small
  reference table (~3-10 rows). Keep the CRUD surface minimal.
- The `list` endpoint returns all models (not just enabled). The FE filters
  by `is_enabled: true` client-side for the AI panel dropdown.

---

## New FE settings page: "Impostazioni AI"

### Route

`/system/settings/ai` → `src/routes/(app)/system/settings/ai/+page.svelte`

### Label

Generic "AI" — NOT "AI Models". The page will host:
- The `ai_model` entity list (admin CRUD — `EntityListTable` for managing models)
- The model cache management section (moved from `/system/settings/security`)
- Future AI-related config (extensible)

### Translation keys

- `system.settings.ai.title` — "Impostazioni AI" / "AI Settings"
- `system.settings.ai.description` — description of the page
- `system.settings.ai.models_section.title` — "Modelli AI" / "AI Models"
- `system.settings.ai.cache_section.title` — "Gestione cache modelli" / "Model cache management"

### What moves from `/system/settings/security`

The `ModelCacheSection` component and its wrapper div (currently at the
bottom of the security page, after the `ConfigList`) are **removed** from
`/system/settings/security/+page.svelte` and **moved** to the new
`/system/settings/ai/+page.svelte`.

### Navigation

Add a new entry in the settings navigation (wherever the settings sub-pages
are linked — check the settings index page or the app navigation config).
The entry uses a generic AI icon (e.g. `BrainCircuit` or `Sparkles`).

---

## Impacted files

### BE (`primebrick-be-v3`)

#### New files

1. **`src/modules/ai-models/ai_model_entity.ts`** — entity class with
   `@Entity("ai_models")`, `@AuditTrail()`, `@Cached(300_000)`, all columns
   decorated per DAL conventions.
2. **`src/modules/ai-models/ai_models_dal.ts`** — DAL with `findAll()`,
   `findAllWithCache()` (Redis + ETag), `findByUuid()`, `findByModelId()`,
   `create()`, `update()`, `delete()`, `restore()`. Cache invalidation on
   writes (delete key `dal:ai_models:list`).
3. **`src/modules/ai-models/ai_models.service.ts`** — service layer with
   business logic (validation, cache invalidation delegation).
4. **`src/modules/ai-models/ai_models.meta.ts`** — meta JSON with
   `entity: "ai_model"`, `translationKey: "ai_model"`, field metadata.
5. **`src/modules/ai-models/router.ts`** — thin controller with
   `registerRoutes()` for all CRUD endpoints.
6. **`src/modules/ai-models/dto.ts`** — Zod schemas for create/update/list
   query bodies.
7. **`src/modules/ai-models/list-config.ts`** — list columns, searchable
   keys, filterable keys, default sort, default view (for the admin entity
   list page).

#### Modified files

8. **`src/modules/index.ts`** — import + mount `aiModelsRouter()` in
   `mountModules(app)`.
9. **`src/modules/mcp/tools/entity-registry.ts`** — register the `ai_model`
   entity for MCP tool-calling (optional — can be deferred).

#### DB patches

10. **`db-meta/patches/00000000000008_create_ai_models.sql`** — `CREATE TABLE
    ai_models (...)` + seed 3 rows + audit trail entries. Incremental patch
    (last existing patch is `00000000000007`).

11. **`db-meta/fire-and-forget/refactor_ai_assistant_model_type_config.sql`**
    — update the `ai_assistant_model` config row's `type_config` from
    `values_source: "ai_models"` to `api_url: "/api/v1/entities/ai_model/list"`.
    Remove the `model_levels` key. Idempotent.

12. **`db-meta/fire-and-forget/add_ai_model_translations.sql`** — seed
    translation keys for `entities.ai_model.*` and
    `system.settings.ai.*` and `system.entities.ai_model.*` for all
    supported languages (en-GB, it-IT, fr-FR, es-ES, de-DE, pt-PT, en-US).

### FE (`primebrick-fe-v3`)

#### New files

13. **`src/lib/composables/useAiModels.svelte.ts`** — singleton composable
    that fetches `GET /api/v1/entities/ai_model/list` once, caches in
    `$state`. Exposes `getEnabledModels()`, `getModelByModelId()`,
    `ensureLoaded()`, `invalidate()`. Follows the `useConfigEntries`
    pattern.

14. **`src/routes/(app)/system/settings/ai/+page.svelte`** — new "Impostazioni
    AI" settings page. Hosts:
    - `EntityListTable` for the `ai_model` entity (admin CRUD)
    - `ModelCacheSection` (moved from security page)
    - Future AI config sections

15. **`src/routes/(app)/system/settings/ai/+page.ts`** — load function if
    needed (auth guard, etc.).

#### Modified files

16. **`src/lib/api-types.ts`** — add `AiModel` interface with all snake_case
    fields matching the entity.

17. **`src/lib/api.ts`** — add `fetchAiModels()` function that calls
    `GET /api/v1/entities/ai_model/list` and returns `{ rows: AiModel[] }`.

18. **`src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte`** —
    replace `getAllAiModels()` import with `useAiModels()` composable.
    `availableModels` becomes `$derived(aiModels.getEnabledModels())`.
    Power levels come from each model's `power_level` field (remove
    `getModelPowerLevels()` call and `modelPowerLevels` state).

19. **`src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`** —
    **the critical fix**: `sendMessage()` looks up the selected model's
    params via `useAiModels().getModelByModelId(_state.model_id)` and
    passes them to `engine.chat.completions.create()`:

    ```typescript
    // Current (broken — no params):
    const request = {
      messages: [...],
      stream: true,
      enable_thinking: false,  // hardcoded off for all models
    };

    // New (per-model params from entity via useAiModels):
    const aiModels = useAiModels();
    const modelParams = aiModels.getModelByModelId(_state.model_id);
    const request = {
      messages: [...],
      stream: true,
      enable_thinking: modelParams?.enable_thinking ?? false,
      temperature: modelParams?.temperature ?? 0.7,
      top_p: modelParams?.top_p ?? 0.9,
      max_tokens: modelParams?.max_tokens ?? 256,
      repetition_penalty: modelParams?.repetition_penalty ?? 1.1,
    };
    ```

20. **`src/lib/components/config-list/ConfigValueInput.svelte`** — remove
    the `values_source: "ai_models"` branch (lines 124-128 — dead code
    after the `type_config` refactor). The `api_url` branch (lines 130-145)
    already handles the new flow.

21. **`src/routes/(app)/system/settings/security/+page.svelte`** — **remove**
    the `ModelCacheSection` import and the wrapper div at the bottom of the
    page. Remove the `modelPowerLevels` state and `getModelPowerLevels`
    import (no longer needed on this page).

22. **`src/lib/components/ui/smart-regex-input/ModelCachePanel.svelte`** —
    update to use `useAiModels()` instead of `getAllAiModels()` for the
    model list.

23. **`src/lib/components/ui/smart-regex-input/ModelCacheSection.svelte`** —
    update to use `useAiModels()` instead of `getAllAiModels()` for the
    model list.

#### Deleted files

24. **`src/lib/ai-models/index.ts`** — **DELETE entirely**. All consumers
    migrated to `useAiModels()` composable. The `getModelPowerLevels()`
    function is removed (power levels come from the entity's `power_level`
    field).

#### FE fallback translations

25. **`src/lib/i18n/messages/en-GB-fallback.json`** — add English-only
    fallbacks for `app.*` keys related to the new settings page and
    ai_model entity (if any `app.*` keys are introduced; `system.*` keys
    are BE-owned).

#### Navigation

26. **Settings navigation** — add a link to `/system/settings/ai` in the
    settings navigation (wherever `security`, `users`, `roles` etc. are
    linked). Check the settings index page or the app nav config for the
    exact location.

---

## Detailed implementation steps

### Step 1: BE — create the entity module

Create the 7 new files under `src/modules/ai-models/`:

**`ai_model_entity.ts`** — follow `CustomerEntity` pattern:
```typescript
@Entity("ai_models")
@AuditTrail()
@Cached(300_000)
export class AiModelEntity implements IAuditableEntity, IExposableEntity {
  @Key()
  id: bigint;

  @Unique()
  uuid: string;

  @Unique()
  @Column({ length: 100, nullable: false })
  model_id: string;

  @Column({ length: 100, nullable: false })
  name: string;

  @Column({ length: 200, nullable: true })
  label_key?: string;

  @Column({ length: 200, nullable: true })
  description_key?: string;

  @Column({ nullable: false, defaultSql: "3" })
  power_level: number;

  @Column({ pgType: "boolean", nullable: false, defaultSql: "true" })
  is_enabled: boolean;

  @Column({ pgType: "boolean", nullable: false, defaultSql: "false" })
  enable_thinking: boolean;

  @Column({ nullable: false, defaultSql: "0.70" })
  temperature: number;

  @Column({ nullable: false, defaultSql: "0.90" })
  top_p: number;

  @Column({ nullable: false, defaultSql: "256" })
  max_tokens: number;

  @Column({ nullable: false, defaultSql: "1.10" })
  repetition_penalty: number;

  @Column({ nullable: false, defaultSql: "100" })
  sort_order: number;

  @AuditableField(AuditableFieldType.CREATED_AT)
  created_at: Date;
  // ... rest of audit fields (created_by, updated_at, updated_by, version, deleted_at, deleted_by)
}
```

**`ai_models_dal.ts`** — follow `AuthConfigurationsDal` pattern with Redis:
```typescript
const LIST_CACHE_KEY = "dal:ai_models:list";
const LIST_CACHE_TTL = 300_000;

export class AiModelsDal {
  private repo: ReturnType<typeof createRepository>;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
    this.repo = createRepository(pool);
  }

  async findAllWithCache(): Promise<CacheEntry<AiModelEntity[]>> {
    const port = getCachePort();
    if (port) {
      try {
        const cached = await port.get<CacheEntry<AiModelEntity[]>>(LIST_CACHE_KEY);
        if (cached && typeof cached === "object" && "data" in cached && "etag" in cached) {
          return cached;
        }
      } catch { /* fall through to DB */ }
    }
    const rows = await this.repo.findAll<AiModelEntity, AiModelEntity>(
      AiModelEntity, null,
      {
        deletedRecords: "EXCLUDED",
        sorting: [Sort.by(field(AiModelEntity, "sort_order" as any), "ASC")],
      }
    );
    const entry = wrapCacheEntry(rows as AiModelEntity[]);
    if (port) {
      try { await port.set(LIST_CACHE_KEY, entry, LIST_CACHE_TTL); } catch {}
    }
    return entry;
  }

  async invalidateCache(): Promise<void> {
    const port = getCachePort();
    if (port) {
      try { await port.delete(LIST_CACHE_KEY); } catch {}
    }
  }

  // findByUuid, findByModelId, create, update, delete, restore...
  // Each write method calls this.invalidateCache() after the DB operation.
}
```

**`ai_models.service.ts`** — follow `CustomersService` pattern:
- `listAiModels()` → calls `dal.findAllWithCache()`, returns `{ rows }`
- `getAiModel(uuid)` → calls `dal.findByUuid()`
- `createAiModel(body)` → validates, calls `dal.create()`, invalidates cache
- `updateAiModel(uuid, body)` → validates, calls `dal.update()`, invalidates cache
- `deleteAiModel(uuid)` → calls `dal.delete()`, invalidates cache
- `restoreAiModel(uuid)` → calls `dal.restore()`, invalidates cache

**`ai_models.meta.ts`** — follow `customers.meta.ts`:
```typescript
export const aiModelMeta = {
  entity: "ai_model",
  translationKey: "ai_model",
  titleKey: "system.entities.ai_model.title",
  uid: "uuid",
  list: {
    searchPlaceholderKey: "system.entities.list.searchPlaceholder",
    defaultPageSize: 25,
    pageSizeOptions: [10, 25, 50, 100],
    columns: AI_MODEL_LIST_COLUMNS,
    rowActions: { delete: true, edit: true },
    defaultSort: { key: "sort_order", dir: "asc" },
  },
} as const;
```

**`router.ts`** — follow `customers/router.ts` pattern with `registerRoutes()`:
```typescript
export function aiModelsRouter() {
  const router = makeProtectedRouter();
  const service = new AiModelsService();

  const getMeta: RequestHandler = (_req, res) => {
    res.json(assembleMeta(aiModelMeta, AiModelEntity));
  };

  const list: RequestHandler = asyncHandler(async (req, res) => {
    const result = await service.listAiModels();
    res.json(result);
  });

  // ... create, getSingle, update, remove, restore, getAudit

  registerRoutes(router, [
    { method: "get", path: "/api/v1/entities/ai_model/meta",
      permission: rbacHandler([Permission.AUTHENTICATED_USER]), handler: getMeta },
    { method: "get", path: "/api/v1/entities/ai_model/list",
      permission: rbacHandler([Permission.AUTHENTICATED_USER]), handler: list },
    { method: "get", path: "/api/v1/entities/ai_model/:uuid",
      permission: rbacHandler([Permission.AUTHENTICATED_USER]),
      middlewares: [validateUuidParam], handler: getSingle },
    { method: "post", path: "/api/v1/entities/ai_model",
      permission: rbacHandler([Permission.AUTHENTICATED_ADMIN]),
      middlewares: [validateBody(AiModelCreateBodySchema)], handler: create },
    { method: "put", path: "/api/v1/entities/ai_model/:uuid",
      permission: rbacHandler([Permission.AUTHENTICATED_ADMIN]),
      middlewares: [validateUuidParam, validateBody(AiModelUpdateBodySchema)], handler: update },
    { method: "delete", path: "/api/v1/entities/ai_model/:uuid",
      permission: rbacHandler([Permission.AUTHENTICATED_ADMIN]),
      middlewares: [validateUuidParam], handler: remove },
    { method: "post", path: "/api/v1/entities/ai_model/:uuid/restore",
      permission: rbacHandler([Permission.AUTHENTICATED_ADMIN]),
      middlewares: [validateUuidParam], handler: restore },
    { method: "get", path: "/api/v1/entities/ai_model/:uuid/audit",
      permission: rbacHandler([Permission.AUTHENTICATED_ADMIN]),
      middlewares: [validateUuidParam], handler: getAudit },
  ]);

  return router;
}
```

### Step 2: BE — register the router

In `src/modules/index.ts`:
```typescript
import { aiModelsRouter } from "./ai-models/router.js";

export function mountModules(app: Express): void {
  app.use(customersRouter());
  // ...
  app.use(aiModelsRouter());  // ← add
  // ...
}
```

### Step 3: BE — DB patch + seed + translations

Create `db-meta/patches/00000000000008_create_ai_models.sql` with the table
DDL + seed 3 rows + audit entries. Run `pnpm run db:meta:compare` to refresh
snapshots, then `pnpm run db:migrate` to apply.

Create fire-and-forget scripts:
- `refactor_ai_assistant_model_type_config.sql` — update the config row
- `add_ai_model_translations.sql` — seed translations for all languages

### Step 4: FE — new composable `useAiModels`

Create `src/lib/composables/useAiModels.svelte.ts` — singleton composable
that fetches `GET /api/v1/entities/ai_model/list` once, caches in `$state`:

```typescript
import type { DeepReadonly } from '$lib/types/deep-readonly';
import { apiFetch } from '$lib/api';
import { clearCachedETag } from '$lib/cache/fe-cache-store';
import type { AiModel } from '$lib/api-types';

const AI_MODELS_URL = '/api/v1/entities/ai_model/list';

// Module-level singleton — shared across all callers.
// svelte-ignore state_referenced_locally — module-level $state, intentionally shared.
const _state = $state({
  models: [] as AiModel[],
  loading: false,
  error: null as string | null,
  fetched: false,
});

let fetchPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (_state.fetched || _state.loading || fetchPromise) {
    return fetchPromise ?? Promise.resolve();
  }
  _state.loading = true;
  _state.error = null;
  fetchPromise = (async () => {
    try {
      const res = await apiFetch(AI_MODELS_URL);
      if (!res.ok) throw new Error(`AI models fetch failed (${res.status})`);
      const data = await res.json();
      _state.models = data.rows as AiModel[];
      _state.fetched = true;
    } catch (err) {
      _state.error = err instanceof Error ? err.message : 'Failed to load AI models';
    } finally {
      _state.loading = false;
      fetchPromise = null;
    }
  })();
  return fetchPromise;
}

export function useAiModels() {
  return {
    get state(): DeepReadonly<typeof _state> {
      return _state as DeepReadonly<typeof _state>;
    },
    getEnabledModels(): AiModel[] {
      void ensureLoaded();
      return _state.models
        .filter((m) => m.is_enabled)
        .sort((a, b) => a.sort_order - b.sort_order);
    },
    getModelByModelId(model_id: string): AiModel | undefined {
      void ensureLoaded();
      return _state.models.find((m) => m.model_id === model_id);
    },
    ensureLoaded,
    invalidate(): void {
      clearCachedETag(AI_MODELS_URL);
      _state.fetched = false;
    },
  };
}
```

### Step 5: FE — new settings page `/system/settings/ai`

Create `src/routes/(app)/system/settings/ai/+page.svelte`:

```svelte
<script lang="ts">
  import AppPageScaffold from '$lib/components/layout/AppPageScaffold.svelte';
  import ModelCacheSection from '$lib/components/ui/smart-regex-input/ModelCacheSection.svelte';
  import { useAiModels } from '$lib/composables/useAiModels.svelte';
  // EntityListTable import for the ai_model CRUD (if we build the admin table)

  const aiModels = useAiModels();

  // On mount, ensure models are loaded
  // The ModelCacheSection reads from aiModels.state
</script>

<AppPageScaffold title={$t('system.settings.ai.title')}>
  <!-- AI Models management section -->
  <!-- For now: EntityListTable for ai_model entity (admin CRUD) -->
  <!-- Future: other AI config sections -->

  <!-- Model cache management (moved from /security) -->
  <div class="mt-6 rounded-lg border border-border/60 p-4">
    <ModelCacheSection />
  </div>
</AppPageScaffold>
```

### Step 6: FE — update `regex-ai-chat-panel.svelte`

Replace the synchronous `getAllAiModels()` with the composable:
```typescript
import { useAiModels } from '$lib/composables/useAiModels.svelte';

const aiModels = useAiModels();

// Reactive list of enabled models for the dropdown
const availableModels = $derived(aiModels.getEnabledModels());

// Power levels come directly from each model's power_level field
// (no more getModelPowerLevels from type_config)
```

### Step 7: FE — update `use-regex-ai.svelte.ts` (the critical fix)

The composable receives `model_id` and looks up params internally via
`useAiModels()`:

```typescript
import { useAiModels } from '$lib/composables/useAiModels.svelte';

export function useRegexAi(model_id: string, initial_regex: string = '', initial_flags: string = '') {
  const aiModels = useAiModels();
  // ... existing state ...

  async function sendMessage(text: string): Promise<void> {
    // ... existing message building ...

    // Look up the selected model's params from the BE entity
    const modelParams = aiModels.getModelByModelId(_state.model_id);

    const request = {
      messages: [...],
      stream: true,
      enable_thinking: modelParams?.enable_thinking ?? false,
      temperature: modelParams?.temperature ?? 0.7,
      top_p: modelParams?.top_p ?? 0.9,
      max_tokens: modelParams?.max_tokens ?? 256,
      repetition_penalty: modelParams?.repetition_penalty ?? 1.1,
    };

    // ... existing streaming logic ...
  }
}
```

### Step 8: FE — cleanup

- **Delete** `$lib/ai-models/index.ts` entirely.
- **Remove** the `values_source: "ai_models"` branch from
  `ConfigValueInput.svelte` (dead code after DB refactor).
- **Remove** `ModelCacheSection` and `modelPowerLevels` from
  `/system/settings/security/+page.svelte`.
- **Update** `ModelCachePanel.svelte` and `ModelCacheSection.svelte` to use
  `useAiModels()` instead of `getAllAiModels()`.
- **Add** navigation entry for `/system/settings/ai`.

---

## Acceptance criteria

1. **BE entity**: `GET /api/v1/entities/ai_model/list` returns 3 seeded
   models with all sampling parameters. Redis cache hit on second call
   (verify via ETag 304).

2. **BE CRUD**: Admin can create/update/delete/restore ai_model rows via
   the standard entity endpoints. Non-admin users get 403 on write
   endpoints. Cache is invalidated on writes.

3. **Config refactor**: The `ai_assistant_model` config row's `type_config`
   uses `api_url: "/api/v1/entities/ai_model/list"` instead of
   `values_source: "ai_models"`. The settings page dropdown still works
   (populated from the BE entity).

4. **FE AI panel**: The model dropdown in `regex-ai-chat-panel.svelte`
   shows models from the BE, filtered by `is_enabled`, sorted by
   `sort_order`, with the 5-bar power indicator reading from `power_level`.

5. **FE sampling params (the fix)**: When the user selects Qwen3-1.7B and
   sends a message, the WebLLM request includes `enable_thinking: true,
   temperature: 0.6, top_p: 0.95, max_tokens: 768, repetition_penalty: 1.10`.
   When the user selects Qwen2.5-1.5B, the request includes
   `enable_thinking: false, temperature: 0.3, top_p: 0.8, max_tokens: 256,
   repetition_penalty: 1.10`. Verify via browser console.

6. **New settings page**: `/system/settings/ai` renders with:
   - The `ai_model` entity list (admin CRUD)
   - The model cache management section (moved from security)
   - Generic "AI" label (not "AI Models")

7. **Security page cleanup**: `/system/settings/security` no longer has
   the `ModelCacheSection` at the bottom. No `modelPowerLevels` state.

8. **Deleted file**: `$lib/ai-models/index.ts` no longer exists. No imports
   of it remain in the codebase.

9. **No regressions**: The model cache management popover (MRU,
   auto-eviction) still works with the new data source.

10. **Typecheck**: `pnpm run check` passes in FE. `pnpm run build` passes
    in BE.

11. **DB migration**: `pnpm run db:meta:compare` shows no drift after the
    patch is applied. `pnpm run db:migrate` applies cleanly.
