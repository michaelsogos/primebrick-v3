# Plan: AI Model Affidability, Rank, Test Scores

## Objective
Add `affidability` (1-5), `rank` (computed 0.0-5.0), and `test_scores` (JSONB) to `ai_models`. Display as donut gauges on `/ai`, with a CTA dropdown for test scores. Order by rank descending.

## Scoring Model

### Case score (multiple runs of same test case)
- **Method**: arithmetic mean of all runs
- **Rationale**: trimmed mean penalizes good latest runs; gaussian is overthinking with N=5-10 and LLM output is bimodal not normal; simple mean weighs every run equally — a real failure counts, a real success counts
- **Storage**: full `runs[]` array in JSONB (not just last result) so methodology can change later and drift is detectable

### Final score (combine different test cases)
- **Method**: arithmetic mean of all case scores
- **Rationale**: all test cases are user-facing functions at the same level (regex, excerpt, email helper, etc.) — no weighting

### Affidability (derived, not manual)
- `affidability = round(final_score)`
- Single source of truth is `test_scores` JSONB

### Rank (derived)
- `rank = round((affidability * 0.7 + power_level * 0.3) * 10) / 10`
- Affidability weighs 70% (correctness > power), power weighs 30%

### JSONB structure
```json
{
  "regex_test_score": {
    "runs": [5, 5, 4, 5, 4],
    "score": 4.6,
    "method": "mean",
    "updated_at": "2026-09-11T10:00:00Z"
  }
}
```

### Update flow (when new test run arrives)
1. Append run to `test_scores[case_key].runs`
2. Recompute `test_scores[case_key].score = mean(runs)`
3. Recompute `final_score = mean(all case scores)`
4. Update `affidability = round(final_score)`
5. Recompute `rank = round((affidability * 0.7 + power_level * 0.3) * 10) / 10`

## Initial Values (7 compatible models)

Based on 5-turn regex regression test:

| Model | Power | Affidability | Rank | regex_test_score runs | score |
|-------|------:|-------------:|-----:|-----------------------|------:|
| Qwen2.5 Coder 3B | 3 | 5 | 4.4 | [5,4,5,4,5] | 4.6 |
| Qwen3.5 4B | 4 | 4 | 4.0 | [4,4,5,3,4] | 4.0 |
| Qwen3.5 2B | 3 | 4 | 3.7 | [4,4,3,5,4] | 4.0 |
| Qwen3 4B | 4 | 3 | 3.3 | [3,4,3,4,4] | 3.6 |
| Qwen2.5 Coder 1.5B | 1 | 4 | 3.1 | [4,3,4,3,4] | 3.6 |
| Qwen2.5 1.5B | 1 | 3 | 2.4 | [3,3,2,4,3] | 3.0 |
| Qwen3 1.7B | 1 | 2 | 1.7 | [1,2,2,1,2] | 1.6 |

## DB Changes

### Fire-and-forget patch: `add_affidability_rank_test_scores.sql`
```sql
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS affidability int NOT NULL DEFAULT 1;
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS rank numeric(3,1) NOT NULL DEFAULT 1.0;
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS test_scores jsonb;

-- Update 7 compatible models with values
UPDATE ai_models SET
  affidability=5, rank=4.4,
  test_scores='{"regex_test_score":{"runs":[5,4,5,4,5],"score":4.6,"method":"mean","updated_at":"2026-09-11T10:00:00Z"}}'::jsonb
WHERE model_id='Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC';
-- ... etc for all 7
```

## BE Changes

### `ai_model_entity.ts`
- Add `affidability: number` (int, default 1)
- Add `rank: number` (numeric, default 1.0)
- Add `test_scores?: Record<string, TestCaseScore>` (jsonb, nullable)

### `ai_models_dal.ts`
- Add `affidability`, `rank`, `test_scores` to `AiModelDetailRow`
- Add to `projectAllExceptId()`
- Add to `createAiModel()` body

### `dto.ts`
- Add to create/update body schemas

### `list-config.ts`
- Add `affidability`, `rank` to filterable + sort keys

## FE Changes

### New: `ScoreGauge.svelte` (donut chart)
- SVG donut with value 0-5 at center
- Props: `value: number`, `max?: number`, `label?: string`, `color?: string`
- Color scale: red (0-1) → orange (2) → yellow (3) → lime (4) → green (5)

### Update: `/system/settings/ai/+page.svelte`
- Replace `PowerLevelBars` + text metadata with 3 donut gauges: POWER, AFFIDABILITY, RANK
- Add test scores CTA button (icon: `FlaskConical` or `ClipboardTest`) with mini dropdown
- Dropdown shows `test_scores` JSON keys/values as labeled rows
- Sort models by `rank` DESC (top ranked first)

### Update: `api.ts` — `AiModel` type
- Add `affidability: number`, `rank: number`, `test_scores?: Record<string, TestCaseScore>`

## Acceptance Criteria
1. DB has 3 new columns with correct values for 7 compatible models
2. BE entity/DAL/DTO expose new fields
3. FE shows 3 donut gauges per model (POWER, AFFIDABILITY, RANK)
4. Test scores CTA opens dropdown showing `regex_test_score` etc.
5. Models ordered by rank DESC
6. `pnpm check` passes
7. Browser shows gauges + CTA + correct ordering
