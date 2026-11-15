# Guide score recalibration + re-test candidates

> Continuation of the guide-assistant quality campaign. Scope: deterministic scoring redesign for the `guide` assistant (react + orch cases) and re-test queue. No regex/json in scope.

Status: 🟢DONE — Plan date: 2026-10-07 · updated 2026-10-09

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Re-test `onnx-community/Qwen2.5-Coder-3B-Instruct#q4` guide react | ✅ done | 2026-10-07 | score=3.81 (was 1.60) — retrieval/prompt fixes changed behavior: no more false-IDK/cake fabrication |
| 2 | Re-test `onnx-community/Qwen3-4B-instruct-2507-ONNX#q4f16` guide react | ✅ done | 2026-10-07 | score=3.47 quality=4.34 — see §2507 fix below |
| 3 | Re-test `onnx-community/Qwen3-4B-ONNX#q4f16` guide react | ✅ done | 2026-10-07 | score=2.53 — debris `"} ` on 4/5 turns confirmed REAL model behavior (post-fix run), correctly penalized |
| 4 | Implement deterministic per-turn scoring v2 (below) | ✅ done | 2026-10-07 | Implemented in `ai-guide-quality.spec.ts` scoreTurn + `semantic-scorer.ts` correctness_max |
| 5 | Keep speed buckets unchanged | ✅ done | — | User decision: scale is correct; 20-50s = real slowness, not a scoring bug |
| 6 | Decide guide→rank integration | ✅ done | 2026-10-09 | `guide_react_test_score` now rank-eligible in `test-scores.ts`; `guide_orch` stays excluded (ReAct is the chosen engine). All `ai_models.rank` recomputed — see `guide-react-refinement.md` results |
| 7 | Retest `Qwen3-4B#q4f16` post parser-debris fix | ✅ done | 2026-10-08 | `2.53 → 3.92` persisted — `"} ` residue was a salvage-parser bug, fixed in `guide-response.ts` + unit test |
| 8 | Retest `Coder-3B#q4f16` with v2 scorer | ✅ done | 2026-10-08 | 3.49 persisted (5/5, q~4.59) |
| 9 | New-model guide tests: `Qwen3-4B#fp16`, `Llama-3.2-3B#fp16` | ✅ done | 2026-10-08 | 3.89 and 3.92 persisted — both 5/5, zero debris |

## User-calibrated target ordering

| Model | dtype | case | Old score | User judgement |
|---|---|---|---|---|
| Qwen2.5-Coder-3B | q4 | react | 1.52 | ~1.6 — factually bad |
| Qwen2.5-Coder-3B | q4f16 | react | 3.36 | < 4.0 — good but typos/inventions ("barra laterale") |
| Qwen2.5-Coder-3B | q4f16 | orch | 3.48 | ~4.6 — clearly better than its react twin |
| Qwen3-4B-instruct-2507 | q4f16 | react | 3.36 | ~4.9 — all correct, minor EN mix |
| Qwen3-4B | fp16 | orch | 2.56 | ~4.8-4.9 — very good |
| Qwen3-4B | q4f16 | react | 3.36 | ~4.8-4.9 (pending re-test, current run invalid) |

## Scoring v2 — FINAL (approved via simulation on persisted runs)

Per-turn score (0..5), all deterministic — no LLM judge:

```
covered answered turn:
  base = 0.35·faithfulness + 0.45·corr_max + 0.20·entity_precision
  pen  = 1.2·debris + 1.0·spuria + 0.6·lang_mix + 0.5·prose
  turn = clamp(1.8 + 4.5·base − pen, 0, 5)
uncovered ("torta") turn:
  fabricated answer        → 0.0
  correct "Non lo so"      → 5.0
  idk + spurious citation  → 3.5   (approved: penalità media)
covered turn answered with "Non lo so" (doc exists):
  false-IDK                → 1.0   (prudence, not hallucination)
quality = mean(turn scores)
speed   = existing bucket (unchanged — user: scale is correct, slowness is real)
final   = 0.8·quality + 0.2·speed
```

Signals (all computable from persisted turn data + DB):

- `faithfulness` — per-sentence max cosine(answer claim, cited docs_kb chunks), MiniLM embedder (unchanged).
- `corr_max` — max cosine over answer sentences vs expected reference (replaces whole-answer cosine: doesn't punish detailed correct answers).
- `entity_precision` — fraction of quoted/CamelCase/ALLCAPS/path entities in the answer present in `ai.docs_kb` chunks **or `system.translations` values** (ground truth for UI labels; fixes false-misses on localized labels like "Nuovo"/"Salva").
- `debris` — trailing `"} `, leaked `Thought:`/`Action:`/`Observation:`/`Final:` (catches pre-fix runs; Qwen3-4B q4f16 scored debris on 4/5 turns).
- `spuria` — sources rendered but `src_hits === 0` (all citations off-target).
- `lang_mix` — EN function-word ratio outside quoted spans (label whitelist via quote stripping).
- `prose` — 0.5 if >400 chars, 1.0 if >600 (over-verbose vs guide contract).

## Simulated results (variant F + cap 3.5)

| Run | old quality | v2 quality | target |
|---|---|---|---|
| Coder-3B q4 react | 1.60 | 2.31 | ~1.6 |
| Coder-3B q4f16 react | 4.20 | 4.63 | <4.0 |
| Coder-3B q4f16 orch | 4.20 | 4.75 | ~4.6 ✅ |
| 2507 q4f16 react | 4.20 | 4.69 | ~4.9 ✅ |
| Qwen3-4B q4f16 react | 4.20 | 3.85 | run invalid (debris) — retest |
| Qwen3-4B fp16 orch | 3.20 | 4.36 → **4.56** w/ cap 3.5 | ~4.8 |

Known residuals: q4f16-react sits ~4.6 not <4.0 (its factual errors are typos — would need IT dictionary signal, dropped by user); 2507-vs-orch separation is below sample-size resolution.
