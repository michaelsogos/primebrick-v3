# Plan: Live score aggregation + `json_editor_with_schema` E2E spec

Date: 2026-09-21 · Scope: `primebrick-fe-v3` + `primebrick-be-v3` (DB only)

## Context

`ai_models.test_scores` currently stores a **precomputed** `score_detail.score`
(= `quality·0.8 + speed·0.2`, stored also as `rank`). Verified empirically that
all formulas are deterministic functions of the per-turn evidence:

```
per-turn score:  5=correct, 3=partial, 2=wrong, 0=fail
speed per turn:  ≤3s→5, ≤5s→4, ≤7s→3, ≤9s→2, ≤10s→1, >10s→0
quality = mean(turn scores)·0.6 + (success_count/total)·5·0.4   (success = score≥4)
speed   = mean(per-turn speed buckets)
score   = quality·0.8 + speed·0.2
```

Bug: `summarizeTestScores` gives `score_detail.score` absolute precedence, so the
mean-across-cases path is dead code — a second test case would never affect the
displayed score.

DB anomalies found (all on disabled models): spurious nested keys
(`e2e_5turn_s1_fixed_v2`, `initial_run_temp07`, `prior_smoke_test`, `weights`,
`baseline_temp_07`, `retest_temp0_partial`) that the current "any object = case"
heuristic would miscount once live aggregation is on.

## Decisions (approved)

- **No more precomputed score**: all aggregates computed on the fly from `turns`.
- **Option A — mean of per-case composites**: each test case computes its own
  `quality/speed/score`; global score = `mean(case.score)`. Each case weighs
  equally (matches existing unit test: regex 5 + json 3 → 4).
- Existing measurements **unchanged** — on-the-fly computation reproduces the
  stored numbers exactly (verified: gemma-E2B 2.39, Phi-3.5 score 3.5, etc.).

## Work items

### 1. Canonical `test_scores` shape (DB cleanup)

Target shape — every case under a `*_test_score` key, evidence only:

```json
{
  "regex_test_score": {
    "protocol": "e2e_5turn_s2_poll6s_x10",
    "turns": [ { "n":1, "prompt":"…", "expected":"…", "actual":"…",
                 "actual_response":"…", "score":5, "verdict":"pass",
                 "reason":"exact", "response_s":2.84,
                 "tokens_per_second":7.8, "kv_cache_hit_ratio":0 } ],
    "generation_config": {...}, "execution_config": {...},
    "load": {...}, "note": "…", "tested_at": "…",
    "load_ok": true, "generation_ok": true
  },
  "json_editor_with_schema_test_score": { "…same shape…" }
}
```

- Fire-and-forget SQL `normalize_test_scores_cases.sql`:
  - For each row: wrap flat evidence (`turns`, `protocol`, `score_detail`,
    `generation_config`, `execution_config`, `load`, `note`, `tested_at`,
    `load_ok`, `generation_ok`, `perf`, `score`) into `regex_test_score` object.
  - Drop `score_detail`, `score`, `perf` top-level keys (derivable / redundant).
  - Rename/merge legacy nested keys: `e2e_5turn*` objects become part of
    `regex_test_score.runs` history OR are dropped into a `_legacy` sub-object —
    **decision needed per row**; simplest: if row also has flat `turns`, keep
    flat as authoritative case, move legacy objects under `regex_test_score.prior_runs`.
  - Non-case keys (`error`, `failure`, `outcome`, `reason`, `q8_policy`,
    `load_error`, `crash*`, `strategy`) stay top-level as run metadata.
- Backup table `ai_models_test_scores_backup_20260921` before rewrite.

### 2. Parser refactor — `src/lib/ai/ai-model-test-scores.ts`

- `summarizeTestScores` treats **only** `*_test_score` keys as cases (whitelist
  by suffix, not "any object"). Flat-shape rows handled by a compat shim that
  synthesizes a `regex_test_score` case from top-level `turns` (so FE works
  before/without DB migration).
- Per case compute on the fly: `quality`, `speed`, `score`, `success`,
  `avg_response_s` using the documented formulas. Extend `ScoreCase` with
  `quality`, `speed`, `turns` (typed `TestTurn`).
- `summary.score` = mean of `case.score` — no `score_detail` precedence.
  `summary.quality`/`summary.speed` = mean across cases (for the existing
  mini-badges), `summary.avg_response_s` = pooled mean of turn times.
- Remove `score_detail` reading entirely.
- Unit tests: flat-shape → same numbers as stored today (assert e.g.
  gemma-E2B-like input → score 2.39); nested multi-case → mean; load-failure
  rows → score 0 case or no case, no crash; spurious keys ignored.

### 3. `/ai` popover — per-case report sections

Current report block reads flat `ts.turns`. Change to iterate
`summary.cases` → for each case a labelled section (title =
`testCaseLabel(case.key)`) with its own header metrics + expandable turn rows.
Flat compat: synthetic case labelled "regex". Load-failure case → red banner
inside its section.

### 4. Playwright E2E spec — `json_editor_with_schema`

New `src/e2e/ai-json-schema-quality.spec.ts`, mirroring the established
interactive protocol as committed code:

- Reuse `global.setup.ts` auth + WebGPU skip (`navigator.gpu.requestAdapter`).
- Drive the smart-json assistant path: load active model via the worker (same
  entry points used interactively — inspect `use-json-config-ai.svelte` /
  `use-json-schema-ai.svelte` send API during implementation; do **not**
  duplicate chat plumbing).
- 5 deterministic turns against `typeConfigJsonSchema` (proposals below —
  final prompts to be confirmed before coding):
  1. "aggiungi validazione required" → `{"validation":{"required":true}}`
  2. "aggiungi regola min lunghezza 3" → `rules.min` con `{"value":3,...}`
  3. "rimuovi required" → `{"validation":{"required":false}}` o senza required
  4. "aggiungi regex solo numeri" → `rules.regex.pattern: "^[0-9]+$"`
  5. "cambia colore badge" or equivalent widget turn
- Validation per turn: `extractJsonCandidate` → `validateCandidate` +
  `findUnknownJsonKeys` + semantic check vs expected path/value.
- Same scoring rubric (5/3/2/0) + same speed buckets. Success = score ≥4.
- Persist: PUT entity `ai_model/:uuid` merging `test_scores.json_editor_with_schema_test_score`
  (snake_case, single write at end, include per-turn evidence + configs +
  `tested_at`). Update `rank` = recomputed composite mean in the same write.
- NO changes to existing regex protocols, prompts, or measurements.

### 5. Docs

- `docs/modules/ai-models.md`: mark `score_detail`/`score` keys as removed;
  document canonical case shape + live-aggregation rule + json_editor protocol.

## Acceptance criteria

- `svelte-check` 0 errors; `vitest` score tests green incl. regression asserts
  reproducing today's stored numbers.
- `/ai` popover: identical scores for all models post-migration; two sections
  when a model has both cases; load-failure rows render banner, no crash.
- Playwright spec runs on a WebGPU machine, persists
  `json_editor_with_schema_test_score`, and the popover shows the second case
  affecting `summary.score` as `mean(cases)`.
- SQL patch idempotent (`ON CONFLICT`/existence checks), backup table created.

## Open items for user

1. JSON test turns: confirm the 5 proposed prompts/expected (or provide your
   canonical set — you know which flows matter).
2. Legacy nested keys on disabled models: drop into `prior_runs` or delete?
3. `rank` column: keep stored (recomputed at write time) or also derive in FE?
   Keeping it is required for cheap list sorting — recommend keep.
