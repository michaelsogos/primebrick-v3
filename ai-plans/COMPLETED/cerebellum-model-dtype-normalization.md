# ai_cerebellum — normalize (model_id, dtype) variant identity

> Continuation of ai-guide workstream. Scope: be-v3, dal-v3 (comment only), fe-v3 (minimal match fix).

Status: �DONE — Plan date: 2026-10-03

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `ai_cerebellum.dtype` column + backfill from `model#dtype` (join ai_models when no `#`) | ✅ done | | e2e/lifecycle row resolved via ai_models → q4f16 |
| 2 | Non-partial unique `(assistant_key, model_id, dtype)` NULLS NOT DISTINCT | ✅ done | | `ai_cerebellum_assistant_model_dtype_uq`; drop-2col BEFORE backfill (sibling variants collide) |
| 3 | Entity: `dtype` field + composite `@Unique` group (orders 0/1/2) | ✅ done | | ERR04/ERR05 w/ uuid via conflict CTE (`IS NOT DISTINCT FROM`, null-safe) |
| 4 | dto.ts (dtype nullish), list-config dtype column + field translations | ✅ done | | |
| 5 | service `beforeCreate`: scope name-uniqueness per (assistant, model, dtype) | ✅ done | | |
| 6 | FE: `AiCerebellum.dtype` + `getTuningsForModel` variant-key match | ✅ done | | match via modelVariantKey() — accepts bare or `repo#dtype` |
| 7 | Seed f-f scripts (add_guide_cerebellum, add_llama_cerebellum_rows, add_missing_cerebellum_json_regex, recommendation, tune) | ✅ done | | all `model#dtype` literals → (model_id, dtype) pairs |
| 8 | Dead FK DDL in create_ai_cerebellum.sql removed + index/column canonicalized | ✅ done | | FK was never applied anyway (normalize_ai_model_id_dtype dropped it) |
| 9 | `ON CONFLICT (key,language) WHERE deleted_at IS NULL` → plain `(key,language)` in 88 f-f scripts + init patch indexes non-partial + sha256 registry | ✅ done | | partial-arbiter would error vs non-partial index; translations uidx now non-partial too |
| 10 | Verify: 23505 live/deleted/NULL-dtype dups; svelte-check 0; tsc 0; E2E T=0/768 5/5 | ✅ done | | |

## Design

- `ai_cerebellum.model_id` becomes the **bare** model repo id; `dtype` holds the
  quantization (`q4f16`, `fp16`, `int8`, `q8`; NULL for WebLLM models) — identical
  semantics to `ai_models` (variant identity = `model_id` + `dtype`, composed at
  runtime as `model_id#dtype` via `modelVariantKey()`).
- Unique: `(assistant_key, model_id, dtype)` **non-partial**, `NULLS NOT DISTINCT`
  so a NULL-dtype (WebLLM) variant still enforces the pair. Deleted rows reserve
  the key: recreate → ERR05 (restore flow), never a duplicate.
- DAL `add()` conflict CTE uses `IS NOT DISTINCT FROM` — null-safe group match,
  returns the conflicting row uuid → ERR05 detail carries uuid for restore.
- FE: `getTuningsForModel(variantKey)` compares `modelVariantKey(t)` — no other
  FE change (payload gains `dtype` via generic entity serializer).

## Backfill

```sql
ALTER TABLE ai_cerebellum ADD COLUMN IF NOT EXISTS dtype varchar(40);
UPDATE ai_cerebellum c SET
  dtype = COALESCE(
    NULLIF(split_part(c.model_id, '#', 2), ''),
    (SELECT m.dtype FROM ai_models m
      WHERE m.model_id = c.model_id AND m.deleted_at IS NULL LIMIT 1)),
  model_id = split_part(c.model_id, '#', 1);
DROP INDEX IF EXISTS ai_cerebellum_assistant_model_uq;
CREATE UNIQUE INDEX ai_cerebellum_assistant_model_dtype_uq
  ON ai_cerebellum (assistant_key, model_id, dtype) NULLS NOT DISTINCT;
```
