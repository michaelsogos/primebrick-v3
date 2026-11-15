# Plan — /ai page toolbar/KPI + derived `power_level` (agnostic, HF-data driven)

## Part 0 — Empirical findings (verified this session)

### Power level: current state
- `ai_models.power_level` int 1-5, default 3. Comment entity: "Power indicator
  1-5, drives the 5-bar UI. NOT part of rank."
- Values are **hand-assigned** per model_id in seed/reclassify SQL. Never
  derived from HF data. `docs/modules/ai-models.md` documents a manual
  "params × quantization" table.
- Agnostic HF-derived columns already exist and are backfilled:
  `working_set_mb` (weights + KV @ ctx 8192), `kv_cache_bytes_per_token`,
  `flops_per_token`.
- Machine rank (FE `useMachineCapabilities.svelte.ts:76-78,505-514`):
  `free = memory_fast_mb - 1536 (headroom)`;
  `rank = max{ lvl | free >= LEVEL_REQUIREMENT_MB[lvl] }` with
  `LEVEL_REQUIREMENT_MB = {1:1200, 2:2200, 3:4000, 4:7000, 5:9500}`.
  → `power_level = smallest lvl such that working_set_mb <=
  LEVEL_REQUIREMENT_MB[lvl]` makes the two indicators directly comparable:
  `power_level <= machine_rank` means "fits" (advisory, never blocking).

### engine_type: three spellings, one standard
| value | meaning | rows |
|---|---|---|
| `webllm` | WebLLM/MLC stack | 26 (all deleted, `working_set_mb` NULL) |
| `onnx` | Transformers.js + onnxruntime-web | 96 (65 with ws, 31 NULL — all deleted) |
| `transformersjs` | **same engine, wrong literal** from 5 post-rename scripts | 47 (all with ws) |

- Standard = `onnx` (rename script 2026-09-14: `transformers_js → onnx`).
- `transformersjs` is invalid per DTO `z.enum(["webllm","onnx"])` and unmapped
  in the badge meta → renders raw.
- Stale comment: entity says "`webllm` or `transformers_js`".

### Before/after analysis (queried live DB, 169 rows)
Formula applied to all non-webllm rows with `working_set_mb NOT NULL`:
- 112 computable → **38 change, all `2 → 1`** (working_set < 1200 MB).
  Coincidence: those rows happen to be deleted/NOT_COMPATIBLE — the formula
  is agnostic, applied to ALL rows regardless of status.
- **All 12 alive models (9 COMPATIBLE + 3 NOT_COMPATIBLE): zero changes.**
- 31 onnx rows NULL ws (all deleted) → skipped, keep current value.
- 26 webllm rows → skipped (no ws, user decision: MCL excluded).

### Toolbar toggle + KPI (unchanged from previous review)
- Switch in `+page.svelte:329-345` violates the documented toolbar pattern
  (`ViewModeToggle`/`DeletionFilterToggle`: segmented ButtonGroup + ghost
  icon-sm + aria-pressed).
- Machine metrics too small (`size-3`/`text-xs`); GPU name already cleaned
  by `parseGpuRenderer`.
- No E2E spec touches `ai-models-fits-machine-switch` or power levels
  (verified: 0 hits in `src/e2e/`).

## Part 1 — engine_type normalization + power_level derivation (BE)

### 1.1 Canonical helper — `src/modules/ai-models/power-level.ts` (new)

```ts
/** Top working_set_mb per level — CANONICAL source.
 *  Mirrored by FE useMachineCapabilities LEVEL_REQUIREMENT_MB
 *  (keep in sync — machine rank uses the same buckets). */
export const LEVEL_REQUIREMENT_MB: Record<number, number> =
  { 1: 1200, 2: 2200, 3: 4000, 4: 7000, 5: 9500 };

/** Agnostic power level from working_set_mb. Returns null when ws is
 *  unknown (webllm/MCL rows — power_level stays manual). >9500 → 5. */
export function powerLevelFromWorkingSet(ws: number | null | undefined): number | null {
  if (ws == null) return null;
  for (const lvl of [1, 2, 3, 4, 5]) if (ws <= LEVEL_REQUIREMENT_MB[lvl]) return lvl;
  return 5;
}
```

### 1.2 Apply at write path — `ai_models.service.ts`
- `createAiModel`: `if (derived = powerLevelFromWorkingSet(body.working_set_mb))
  body.power_level = derived` — derived wins over provided when ws present.
- `updateAiModel`: same when `body.working_set_mb` is being set.
- NULL ws → `power_level` keeps provided/manual value (MCL path preserved).

### 1.3 Working-set formula — VERIFIED exact on 65/65 existing rows
```
working_set_mb = COALESCE(vram_mb, download_size_mb)
               + kv_cache_bytes_per_token × 8192 / 1048576
kv_cache_bytes_per_token = 2 × num_hidden_layers × num_key_value_heads
                         × head_dim × 2 (fp16 KV dtype)
```
(verified: Qwen3-4B → 2×36×8×128×2 = 147456 = DB value)

### 1.4 Fill ALL onnx rows — deterministic, one-shot, no hybrid leftovers
Target state: **every `engine_type='onnx'` row has working_set_mb +
computed power_level.** The 31 NULL rows split:

- **Group A (~14, dtype q8/bnb4)** — `kv_cache_bytes_per_token` already
  present → ws computable in pure SQL, zero network.
- **Group B (~17: Qwen3.5, gemma-4, Nemotron-3, EXAONE-3.5, Llama-3.2
  q8/bnb4, Qwen2.5-* q8/bnb4…)** — `kv_cache_bytes_per_token` NULL →
  one-shot Node script in `d:\git\primebrick\temp\` (temp-files rule, NOT
  in repo) fetches `huggingface.co/<repo>/resolve/main/config.json` per
  model_id (strip `#dtype`), computes `kv_cache_bytes_per_token` +
  `flops_per_token` (from safetensors metadata when exposed), and EMITS
  the UPDATE statements into the SQL file — the fire-and-forget stays a
  static, auditable artifact; the generator is disposable.

### 1.5 Fire-and-forget — `normalize_engine_recompute_power_level.sql`
```sql
BEGIN;
-- 0. Source tracking columns (see plan: latent double-count fix)
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS working_set_source varchar(20)
  NOT NULL DEFAULT 'hf_estimate';
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS working_set_detail jsonb;
COMMENT ON COLUMN ai_models.working_set_source IS
 'hf_estimate=COALESCE(vram_mb,download)+kv*8192; e2e_measured=GPUBuffer-tracked total (KV already inside, never re-add)';
COMMENT ON COLUMN ai_models.working_set_detail IS
 '{weights_mb,kv_mb,ctx_ref,measured_vram_bytes,measured_at,measured_ctx_tokens}';

-- 1. Normalize wrong literal (same engine, post-rename typo)
UPDATE ai_models SET engine_type='onnx', updated_at=now()
 WHERE engine_type='transformersjs';

-- 2. Generated UPDATEs: kv/flops for group B (from config.json one-shot)
UPDATE ai_models SET kv_cache_bytes_per_token=…, flops_per_token=… WHERE model_id=…;

-- 3. Fill working_set_mb everywhere it's derivable (groups A + B)
UPDATE ai_models
SET working_set_mb = round(COALESCE(vram_mb, download_size_mb)
     + kv_cache_bytes_per_token * 8192 / 1048576.0),
    updated_at=now(), updated_by='system_ws_backfill', version=version+1
WHERE engine_type='onnx' AND working_set_mb IS NULL
  AND kv_cache_bytes_per_token IS NOT NULL;

-- 4. Recompute power_level — agnostic, EVERY onnx row
UPDATE ai_models
SET power_level = CASE
  WHEN working_set_mb <= 1200 THEN 1 WHEN working_set_mb <= 2200 THEN 2
  WHEN working_set_mb <= 4000 THEN 3 WHEN working_set_mb <= 7000 THEN 4
  ELSE 5 END,
    updated_at=now(), updated_by='system_power_level_recompute', version=version+1
WHERE engine_type='onnx' AND working_set_mb IS NOT NULL
  AND power_level <> CASE … END;
COMMIT;
```
Header: dry-run preview SELECT + expected counts (38 power changes, all
2→1; 31 ws filled). REDIS CACHE INVALIDATION: `dal:ai_models*`.

### 1.4 Entity + DTO additions
- `ai_model_entity.ts`: `working_set_source` (`@Column varchar(20)
  defaultSql "'hf_estimate'"`), `working_set_detail` (`@Column jsonb
  nullable`), comment: source decides how ws was produced.
- `dto.ts`: `working_set_source: z.enum(["hf_estimate","e2e_measured"])
  .optional()`, `working_set_detail: z.record(...).optional()` in base
  schema; DAL field list + create/update mapping add both columns.
- Stale comment fixes: `engine_type` → "`webllm` or `onnx`";
  `power_level` → "Derived from working_set_mb via
  powerLevelFromWorkingSet(); manual only when ws unknown (webllm).";
  `vram_mb` comment → "Curated in-memory weight estimate (hf_estimate
  input); measured totals go to working_set_mb via working_set_source".

## Part 2 — FE (toolbar toggle + KPI + comment sync)

### 2.1 `fits_machine` → segmented toggle (`+page.svelte`)
Replace `<label>+<Switch>` with segmented ButtonGroup, ghost icon-sm,
aria-pressed, disabled when `machineRank === null`. Icons `LayoutGrid` +
`Gauge` (verify on lucide.dev). Preserve `data-testid="ai-models-fits-machine-switch"`
on the fits segment. Remove `Switch` import.

### 2.2 KPI restyle (`machine-capabilities-section.svelte`)
Centered KPI strip: icon `size-5`, value `text-base font-semibold`, caption
`text-[10px] uppercase`. Identity block left (vendor icon size-6 + gpu_name
+ vendor/arch subtitle), ScoreGauge right unchanged. Semantic colors already
applied (amber GB/s, sky TFLOPS/RAM/threads, VRAM emerald/orange/red).

### 2.3 `useMachineCapabilities.svelte.ts`
Update `LEVEL_REQUIREMENT_MB` comment → "Canonical source:
BE src/modules/ai-models/power-level.ts — keep in sync."

### 2.4 `use-ai-assistant.svelte.ts` — persistVram repoint
- `persistVram(vram_bytes)` stops writing `vram_mb`; writes
  `working_set_mb = round(vram_bytes/1MB)`, `working_set_source:
  'e2e_measured'`, `working_set_detail: {measured_vram_bytes, measured_at,
  measured_ctx_tokens: <kv_cache_seq_length at measure time>}` via the
  same PUT entity call (same best-effort semantics).
- Comment updated: measured total already includes KV — goes to ws, never
  vram_mb (which stays the curated weight estimate).

### 2.5 `src/e2e/helpers/test-scores.ts` — measured ws in the same write
- `mergeTestScoreTurns` signature: optional `measured?: {vram_bytes,
  ctx_tokens}`; when present the UPDATE also sets `working_set_mb`,
  `working_set_source='e2e_measured'`, `working_set_detail` in the same
  pool query (single atomic write with test_scores+rank).
- Specs pass the post-test `vram_bytes` captured from the last `measure`
  message (KV grown to real context — most honest footprint).

## Part 3 — Tests

### 3.1 Unit — `src/modules/ai-models/__tests__/power-level.test.ts` (new)
Boundary table (vitest, same style as `dto.test.ts`):

| ws | expected |
|---|---|
| null/undefined | null |
| 0, 8, 1200 | 1 |
| 1201, 2200 | 2 |
| 2201, 4000 | 3 |
| 4001, 7000 | 4 |
| 7001, 9500 | 5 |
| 9501, 50000 | 5 (cap) |

### 3.2 Service derivation test (extend `__tests__` — same file or dto.test.ts)
- create with `working_set_mb: 1500` + `power_level: 5` → stored 2 (derived wins).
- create with `working_set_mb: undefined` + `power_level: 4` → stored 4 (manual kept).
- update with `working_set_mb: 5000` → power_level recomputed to 4.
- dto: `working_set_source` enum validation; `working_set_detail` record.

### 3.3 FE — vitest for persistVram repoint (existing composable tests if present)
- measured `vram_bytes` → PUT body carries `working_set_mb` +
  `working_set_source:'e2e_measured'` + detail; `vram_mb` untouched.

### 3.3 E2E
No new specs needed (0 existing hits on these selectors). Testid preserved.

## Part 4 — Docs

| File | Change |
|---|---|
| `be docs/modules/ai-models.md` | replace "power_level conventions" manual table with formula + LEVEL_REQUIREMENT_MB; engine list → `onnx`/`webllm` only; document working_set_source semantics + double-count rule (measured ws already contains KV — never re-add) |
| `ai_model_entity.ts` comments | engine_type + power_level + vram_mb semantics (see 1.4) |
| FE `useMachineCapabilities.svelte.ts` | cross-ref comment (2.3) |
| `docs/ai/` test-harness docs (if referenced by e2e helpers) | update mergeTestScoreTurns signature note |
| Agent rules / user-guide | none — no ai-models user-guide page exists; meta schema untouched |

## Acceptance
- `tsc --noEmit` clean; `pnpm check` clean
- `power-level.test.ts` green; dto tests green
- Script dry-run preview matches analysis (38 updates, all 2→1)
- All alive models keep identical power_level (verified in analysis)
- Segmented toggle identical to ViewModeToggle pattern; KPI strip centered
- No E2E regressions

## Resolved decisions (user-confirmed)
- ALL `engine_type='onnx'` rows get ws + computed power_level — no skip,
  no hybrid path. webllm rows untouched (no data, engine retired).
- ws > 9500 → cap at 5 (domain is 1-5; machine rank caps at 5 too).
- Derived wins over provided power_level whenever ws is known — write
  path derives; manual only where ws is unknowable (webllm).

## Speed comparability (question 1 — answered, separate feature)
- `flops_per_token` (HF-derived, already in DB) vs measured `gflops` →
  `est_tok_s = gflops×1e9×eff / flops_per_token` IS computable in-browser.
- Decision: NOT in power_level — the level is a capacity question
  (fits-or-not). Estimated speed is a future separate indicator on the
  model card. Group-B backfill computes flops_per_token anyway.

## working_set source tracking (question 2 — REAL measurement exists)

### Verified: the measurement infrastructure is already live
- `ai-worker.ts:104-135` — `installVramTracking()` wraps
  `GPUDevice.createBuffer`/`GPUBuffer.destroy` → `vram_tracked_bytes` =
  REAL live GPU footprint (weights + KV + scratch). Emitted in `loaded`
  and every `measure` message as `vram_bytes`.
- `use-ai-assistant.svelte.ts:577 persistVram()` — already persists the
  measured footprint to the DB row via PUT entity (best-effort, admin).
- `src/e2e/helpers/test-scores.ts mergeTestScoreTurns()` — E2E already
  writes `test_scores` + `rank` to DB via direct pg pool (`updated_by='e2e'`).

### LATENT BUG confirmed (user's double-count intuition)
`persistVram` overwrites `vram_mb` with a measurement that ALREADY
contains KV+scratch. The ws formula `COALESCE(vram_mb,download)+kv×8192`
would then double-count KV as soon as update-path derivation is live.
Fix = source tracking + semantic split:

### New columns
```sql
ALTER TABLE ai_models ADD COLUMN working_set_source varchar(20)
  NOT NULL DEFAULT 'hf_estimate';          -- 'hf_estimate'|'e2e_measured'
ALTER TABLE ai_models ADD COLUMN working_set_detail jsonb;
-- detail: {weights_mb, kv_mb, ctx_ref:8192, measured_vram_bytes,
--          measured_at, measured_ctx_tokens}
```

### Semantics
- `vram_mb` stays the CURATED weight estimate (hf_estimate input only).
- `'e2e_measured'` → `working_set_mb = measured_vram_bytes` DIRECTLY —
  KV already inside, NEVER re-added. `detail.measured_ctx_tokens` records
  the context length at measure time for transparency.
- `power_level` always derives from `working_set_mb`, source-agnostic.

### Wiring (measurement → DB, automatic)
- `persistVram()` (use-ai-assistant): stops writing `vram_mb`; writes
  `working_set_mb` + `working_set_source='e2e_measured'` +
  `working_set_detail` via the same PUT (measure at loaded+fingerprint).
- `mergeTestScoreTurns` (e2e helper): extends the same UPDATE to also set
  ws+source+detail when the spec passes `vram_bytes` captured post-test
  (KV grown to real ctx — the most honest footprint).
- Write-path derivation (service): when `working_set_mb` present →
  power_level derived. Persist paths set ws, derivation follows.

## Machine rank — how it actually works (verified, single signal)
`memory_fast_mb` is measured by VRAM probing (knee point / probe
footprint). `free = memory_fast_mb - 1536 (HEADROOM)`;
`machineRank = max{ lvl : free >= LEVEL_REQUIREMENT_MB[lvl] }`.
GFLOPS/bandwidth are DISPLAYED but do NOT enter the rank. So machine rank
is already a single synthetic value on the same unit/scale as the model
side: "largest working set that fits". `power_level <= machine_rank`
= advisory fit check, never blocking.
