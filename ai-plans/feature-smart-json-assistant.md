# Feature: Smart JSON Config Assistant + Cerebellum (assistant×model tuning)

## Objective

Add a second AI assistant to the config builder: a browser-local (ONNX/WebGPU) assistant that helps users write `type_config` JSON — via natural language → validated JSON (validate-and-repair loop) and a schema-driven cascade explorer (option B hybrid). Alongside, introduce the **cerebellum** concept: per-assistant, per-model tuned generation parameters persisted in a bridge table.

This is also the moment for the **DRY refactor** of the AI chat UI: the regex panel UI (~1100 lines) must be extracted into shared `smart-ai` components that any assistant consumes — no copy-paste of model loading, chat UX, footer model selector, or microchip popover.

## Verified facts (empirical)

- `AiIcon` (`src/lib/components/ui/ai-icon/ai-icon.svelte`) — reusable gradient sparkles icon (sky→indigo→violet = primary gradient). Same visual identity for every AI assistant. Regex brain CTA testid: `smart-regex-brain-cta`.
- `regex-ai-chat-panel.svelte` — ~1100 lines: chat scroll, message list, RegexChoice cards, model dropdown (RankMeter, sort sub-menu), Microchip popover (model details + params + ScoreGauges), composer. All i18n under `app.smart.regex.ai.*`.
- `use-regex-ai.svelte.ts` (~1169 lines) — composable: worker lifecycle (load/progress/generate/dispose), history window, `buildSystemPrompt()` (regex-specific), `detectIntent()` (regex-specific), `RegexChoice` type, VRAM measurement, `measure` events.
- Worker: `src/lib/ai/regex-ai-worker.ts` — ONNX load + streaming generation, engine-agnostic in mechanics.
- `ai_models` (BE entity `src/modules/ai-models/ai_model_entity.ts`) already carries **default** sampling params per model: `temperature, top_p, max_tokens, repetition_penalty, enable_thinking` + `execution_config` JSONB (kv_cache_reuse, sliding_window, max_history_turns, intent_detection) + `test_scores` JSONB + `rank` (quality*0.8 + speed*0.2).
- `test_scores` JSONB is **keyed by test case name**: `{ "regex_test_score": {runs, score, method, updated_at}, ... }`. A new case key does NOT overwrite regex scores. `summarizeTestScores()` (`src/lib/ai/ai-model-test-scores.ts`) computes `summary.score` as the **mean of all case scores** → quality = media dei test cases, confirmed.
- `/system/settings/ai` page already renders per-case scores via `summarizeTestScores` + `testCaseLabel` → a new `json_editor_with_schema_test_score` case appears automatically (label: "json editor with schema").
- Current default/best model: `onnx-community/Qwen2.5-Coder-3B-Instruct#q4f16` — rank 5.0, COMPATIBLE, ONNX. Confirmed user intuition ("code 3b").
- `typeConfigJsonSchema` (zod `z.toJSONSchema`) exists — embeddable in the system prompt; `typeConfigSchema.safeParse()` gives structured validation errors for the repair loop.
- `JsonCodeBlock` exists — reusable for rendering proposed JSON inside AI choice cards.

## Revision 2 — type_capabilities as shared design data (approved, path A)

**Problem found in review**: the right-column form (`ValidationRulesSection` + `WidgetConfigSection`) is driven by hardcoded per-type `if` checks scattered in components (`isNumericType`, `isStringType`, `isUrlType`, `isMoney`, `isBadge`, `isSelect`). The schema explorer I built is therefore *agnostic* — it enumerates global `type_config` props instead of asking only questions pertinent to the actual `ConfigEntryType`.

**Canonical home (verified)**: `@primebrick/sdk` already owns the type knowledge — `src/config/iconfig-entity.ts` (`ConfigType` vocabulary) and `src/config/config-validator.ts` (type families: string-derived, numeric, etc.). The FE **cannot** import the SDK (Node.js package — existing convention: standalone mirrors, see `type-config-schema.ts` header). The data is design-time, static — **not DB data**.

**Decision (approved)**: single canonical definition in SDK, served to the FE through the **existing** `GET /api/v1/entities/config_entry/meta` endpoint (meta payload already fetched by the FE for the configurations page — zero new endpoints).

### Type capabilities contract

```ts
// primebrick-v3-sdk/src/config/type-capabilities.ts
export type ValidationCapability = 'required' | 'min' | 'max' | 'regex' | 'url_protocols';
export type WidgetCapability = 'placeholder' | 'currency' | 'badge_values' | 'select_source';

export type TypeCapabilities = {
  validation: {
    required: boolean;
    min?: 'length' | 'value';   // string-family → length; numeric/money → value
    max?: 'length' | 'value';
    regex?: boolean;
    url_protocols?: boolean;
  };
  widget: Partial<Record<WidgetCapability, boolean>>;
};
export const TYPE_CAPABILITIES: Record<ConfigType, TypeCapabilities>;
```

Derived from the SAME constants already used by `config-validator.ts` (string-derived family etc.) — not a second hand-written list, to avoid drift.

### Consumption

1. **BE**: `config-entries.meta.ts` adds `type_capabilities` (imported from SDK) to the meta payload.
2. **FE**: `api-types.ts` gains `TypeCapabilities` type; the meta fetch already exists.
3. **Form refactor (mandatory, no tech debt)**: `ValidationRulesSection`/`WidgetConfigSection` replace the scattered `isXxx` deriveds with reads from the capability object for the row's `type` — same rendered output.
4. **Assistant explorer**: topics/questions generated from `TYPE_CAPABILITIES[type]` — only pertinent entries ("Min length", "Regex pattern", "Allowed URL protocols"…) with i18n keys; the agnostic JSON-path explorer is removed/replaced.
5. **System prompt**: includes only the schema subset applicable to the current `type` (smaller prompt, fewer hallucinations).

## Architecture

```
src/lib/components/ui/smart-ai/            ← NEW shared dir (Smart prefix rule)
  ai-chat-panel.svelte                     ← generic panel shell (scroll, states, header)
  ai-message-list.svelte                   ← message rendering, user/assistant bubbles
  ai-composer.svelte                       ← input + send + stop
  ai-model-selector.svelte                 ← footer dropdown (RankMeter, sort)
  ai-model-details-popover.svelte          ← Microchip popover (resolved params, better layout)
  ai-cerebellum-selector.svelte            ← footer circuit-board dropdown (tuning switch)
  ai-choice-card.svelte                    ← generic choice card container
  use-ai-assistant.svelte.ts               ← generic composable (worker lifecycle, history, params)
  ai-assistant.types.ts                    ← ChatMessage, Choice base, ResolvedParams
  ai-worker.ts                             ← renamed/generalized ONNX worker
src/lib/components/ui/smart-regex-input/
  use-regex-ai.svelte.ts                   ← thin wrapper: regex system prompt + intent + parse
  regex-ai-chat-panel.svelte               ← thin wrapper: binds shared panel + regex choices
src/lib/components/ui/smart-json-config/   ← NEW assistant
  use-json-config-ai.svelte.ts             ← system prompt w/ schema + validate-and-repair
  json-config-chat-panel.svelte            ← binds shared panel + JSON choices/explorer
  json-config-preview-card.svelte          ← choice card w/ JsonCodeBlock + "Apply" CTA
  schema-explorer.svelte                   ← TYPE-AWARE topics from type_capabilities (not raw schema paths)
  json-config-assistant.ts                 ← assistant manifest (id, i18n ns, system prompt)

primebrick-v3-sdk/src/config/
  type-capabilities.ts                     ← canonical TYPE_CAPABILITIES (from validator families)
primebrick-be-v3/src/modules/auth/
  config-entries.meta.ts                   ← meta gains `type_capabilities`
primebrick-fe-v3/src/lib/config/
  type-capabilities.ts                     ← FE accessor over meta payload (typed, cached)
```

The shared composable owns: worker boot/load/progress, streaming, history window, resolved generation params (model defaults ← cerebellum override), dispose. Assistant wrappers own: system prompt, response parsing → typed choices, validation loops.

## Cerebellum (BE)

New bridge table `ai_cerebellum` — "the tuned brain of an assistant on a model":

| Column | Notes |
|---|---|
| `uuid`, `id` | standard |
| `assistant_key` | e.g. `smart_regex`, `smart_json_config` — unique with model |
| `ai_model_id` | FK → `ai_models.id` |
| `temperature/top_p/max_tokens/repetition_penalty/enable_thinking` | NULL = inherit model default |
| `execution_config` | JSONB override (kv_cache_reuse etc.), NULL = inherit |
| `label_key/description_key` | i18n |
| `sort_order`, `is_enabled` | standard |

Resolution (FE): assistant opens → model = `ai_assistant_model` config default → fetch cerebellum rows for `(assistant_key, model)` → if found, merge over model defaults (NULL fields fall back); else pure defaults. No tuning = works exactly like today → zero regression for regex.

Footer: `CircuitBoard` icon CTA next to Microchip → dropdown listing cerebellum tunings for the selected model (+ "Default"). Selecting one re-resolves params live → the Microchip popover shows **resolved** params (source-tagged: default vs tuning name).

Microchip popover restyle: group params by meaning — *Sampling* (T, top_p, rep_penalty), *Limits* (max_tokens, context), *Behavior* (thinking on/off, kv cache strategy) — hide rows that are not applicable to the active engine instead of printing raw flags.

`/system/settings/ai`: surface cerebellum configs (expandable row section listing tunings per assistant). The default-model config row stays global; cerebellum is the per-assistant layer.

## Test case persistence

- New case key: `json_editor_with_schema_test_score` in `ai_models.test_scores` — same shape: `{runs:[], score, method:'mean', updated_at, success_count, total_turns, turns:[{prompt, expected, actual, score, response_s, failure_reason}]}`.
- Persisted via the same fire-and-forget SQL patch mechanism used by existing `update_test_scores_*.sql` patches.
- Quality/rank recomputes automatically (mean of cases → score_detail → rank formula unchanged).
- Per-cerebellum-tuning scores: store under case key suffixed by tuning id, or a `by_tuning` sub-object — decided at implementation; requirement: tuning experiments must not corrupt the base case score.

## Phases

### Phase 0 — Shared smart-ai extraction (DRY, zero-regression)
Extract generic panel/composer/model-selector/microchip/composable/worker into `smart-ai/`; regex assistant becomes thin wrappers. Regex UI must look/behave identically (verify live + testids unchanged).

### Phase 1 — Cerebellum BE
Entity + migration (init + fire-and-forget), module routes, seed entries for `smart_regex` (mapping current defaults as explicit tunings where meaningful), i18n. Endpoint consumed via entity list API like `ai_models`.

### Phase 2 — Cerebellum FE integration
Resolved-params layer in `use-ai-assistant`; cerebellum selector in footer; microchip popover restyle; /ai page cerebellum visibility.

### Phase 3 — Smart JSON config assistant
- Brain CTA (AiIcon, same gradient) in `JsonPreviewEditor` toolbar — right of Preview CTA with visible gap; `data-testid="tcb-ai-assistant-cta"`.
- `use-json-config-ai`: system prompt = compact `typeConfigJsonSchema` + rules + few-shot; response = JSON candidate → `typeConfigSchema.safeParse` → on failure feed errors back (max 2 repairs) → only valid JSON reaches a choice card.
- `json-config-preview-card`: JsonCodeBlock preview + Apply CTA → writes into `JsonEditor` (rawJsonInput) + builder.
- `schema-explorer` (hybrid B): deterministic cascade tree built from `typeConfigJsonSchema` properties+descriptions — "what can I configure?" answered without model; selecting a leaf injects a guided prompt/inserts a snippet.
- Panel opens via shared `ai-chat-panel`; lazy model load on first open (same pattern).

### Phase 4 — Test case + measurement
Define `json_editor_with_schema_test_score` cases (NL→JSON tasks: boolean set, regex rule, enum choice, nested validation); run harness per model; persist scores; verify /ai shows the new case.

### Phase 5 — type_capabilities end-to-end (Revision 2, mandatory refactor)
1. SDK: `src/config/type-capabilities.ts` — `TYPE_CAPABILITIES` derived from the same family constants as `config-validator.ts`; export from `src/config` barrel + package index; vitest covering every `ConfigType`.
2. BE: add `type_capabilities` to `config_entry` meta payload (`config-entries.meta.ts` / meta-assembler); verify `GET /api/v1/entities/config_entry/meta` returns it.
3. FE: `TypeCapabilities` in `api-types.ts`; accessor reading the meta payload (single fetch, already performed by the configurations page).
4. **Form refactor**: `ValidationRulesSection` + `WidgetConfigSection` — replace `isNumericType/isStringType/isUrlType/isMoney/isBadge/isSelect` deriveds with capability lookups (`caps.validation.min === 'length'`, `caps.widget.badge_values`…). Rendered output must be identical for every `ConfigEntryType`.
5. Assistant: `schema-explorer` rebuilt as type-aware topic tree (macro = validation/widget, micro = concrete params for THIS type); system prompt pruned to applicable schema subset; `use-json-config-ai` receives `type` prop.

### Phase 6 — Ops & closure
1. Apply migrations to dev DB: `create_ai_cerebellum.sql` + `add_ai_cerebellum_translations.sql` (+ any pending fire-and-forget). Verify registry rows.
2. `/system/settings/ai`: per-assistant cerebellum view (expandable section per assistant_key → tunings with resolved params + override badges).
3. Missing translations: seed all new `app.smart.json.ai.*` + cerebellum keys in BE translation tables (all 6 languages), not only the en-GB fallback.
4. Live verification (Playwright): open JSON assistant on a `string` config entry → topics are string-pertinent only; NL→JSON apply; cerebellum dropdown changes resolved params.
5. Update plan/status, commit per-repo with required trailers, push.

## Acceptance criteria

1. `pnpm check` 0 errors; regex assistant visually/functionally unchanged after refactor.
2. CTA AI in toolbar con gap e testid stabile; E2E-reachable.
3. "cosa posso configurare?" → topics pertinenti al `ConfigEntryType` corrente (type-aware via `type_capabilities`), senza modello.
3b. Form colonna destra: nessun check per-type hardcoded nei componenti — tutto deriva da `TYPE_CAPABILITIES` servito dal meta; rendering identico per ogni type.
4. NL "campo nomi e cognomi, no numeri, max 5 parole" → JSON candidato valido proposto in preview card; Apply lo scrive nell'editor.
5. JSON proposto invalido → repair loop, mai JSON invalido applicato.
6. Footer: cerebellum dropdown cambia i resolved params; microchip popover li mostra raggruppati e risolti.
7. `test_scores["json_editor_with_schema_test_score"]` persistito senza toccare `regex_test_score`; score medio aggiornato.
8. Zero duplicazione: nessun file >~400 righe nel nuovo assistant; shared UI in `smart-ai/`.

## Open decisions (to confirm in implementation)

- Whether cerebellum entries are created per (assistant, model) only on demand, or seeded for every enabled model — lean: seed only for `smart_json_config` on the default model + a couple of alternates.
- Tuning-aware score storage shape (`by_tuning` sub-object vs suffixed keys).
- Whether Apply writes pretty JSON into the editor seed (consistent with editor working format) — yes.
