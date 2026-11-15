# Plan — Multi-model JSON quality E2E (serial, one browser)

## Objective

Run the JSON-schema quality harness against N models **serially inside a
single persistent Edge session** — no browser restart between models. Each
model gets the full 5-turn conversation phase, turns scored and persisted via
`mergeTestScoreTurns` under `json_editor_with_schema_test_score` (same case,
per-model `model_id` key — all scores coexist in `ai_models.test_scores`).

## Empirical evidence

- `AiModelSelector` (`ai-model-selector.svelte`) already switches models at
  runtime: `on_switch` → `handleSwitchModel` → `ai.switchModel`
  (`ai-chat-panel.svelte:182`) — worker-per-model teardown, same page, no
  reload. Menu item testid: `smart-json-ai-model-{model_id}`.
- `ai-json-schema-quality.spec.ts` currently: attaches/launches persistent
  Edge (CDP :9333) → opens sheet → waits `data-ai-phase="ready"` (8min
  download budget, warm cache ~10s) → discovers selected `model_id` via
  `font-semibold` menu item → 5 turns → `mergeTestScoreTurns` in `finally`.
- Model switch resets messages/pending state (`switchModel` clears
  `_state.messages`) → each model starts clean; a `new-session` click is a
  cheap extra guard.

## Design

Refactor `ai-json-schema-quality.spec.ts` — model list from env:

```
AI_E2E_MODEL_IDS="id1,id2"  npx playwright test ai-json-schema-quality.spec.ts
```

- `AI_E2E_MODEL_IDS` unset/empty → current behavior (default model only).
- Set → loop per `model_id`:
  1. First iteration: sheet opens as today.
  2. Open model trigger, click `[data-testid="smart-json-ai-model-{id}"]`,
     `waitPanelPhase("ready")` (download budget per model).
  3. `new-session` click + ready wait.
  4. Run the 5 TURNS, score each turn.
  5. `mergeTestScoreTurns(model_id, "json_editor_with_schema_test_score",
     "conversation", turns)` — in `finally` per model so a mid-loop failure
     still persists completed models.
  6. Per-model summary log + aggregate table at end.
- Test-level: keep ONE playwright test containing the loop (worker restart
  between tests would spawn new contexts); timeout scaled by models count
  (`test.setTimeout` dynamic).
- Skip a model (not fail suite) when its menu item is missing/disabled
  (incompatible models aren't selectable anyway); record score=0 only when
  the model loaded but turns failed — never fake data.

## Files

- `src/e2e/ai-json-schema-quality.spec.ts` — model loop (sole change).
- `docs/ai/e2e-browser-session.md` — document `AI_E2E_MODEL_IDS`.

## Validation

- `pnpm check` — spec is TS, typechecked.
- Run 1: `AI_E2E_MODEL_IDS` unset → identical behavior to today.
- Run 2 (requested): default Qwen `onnx-community/Qwen2.5-Coder-3B-Instruct#q4f16`
  — either env-set explicitly or default path; verify merged score persisted
  and `model_id` logged matches.
- Optional later: `AI_E2E_MODEL_IDS="…/Llama-3.2-3B…#q4f16,…/Qwen2.5-Coder-3B…#q4f16"`
  serial run in one browser.

## Non-goals

- No changes to navigation/pending-actions specs (they stay single-model).
- No score reset/cleanup of existing test_scores history.
