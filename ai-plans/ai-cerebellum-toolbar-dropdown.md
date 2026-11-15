# Plan — Cerebellum: toolbar dropdown + create sheet, remove tuning section

## Decisions confirmed with user

1. **Dropdown scope** = per-assistant. In the models-section toolbar, a dropdown
   selects an *assistant* (cerebellum owner). Default = "Model defaults" (no
   override). When an assistant is selected, each model row shows params
   resolved with that assistant's tuning for that model; models without a
   tuning for that assistant keep showing model defaults. **Scores/rank/test
   gauges are never touched.**
2. **Create cerebellum** = inline sheet panel via the global sheet manager
   (`openSheet` + `SheetPanelLayout`), not a route.
3. **The current "Cerebellum" section at the bottom of /ai is removed.**

## Current state (empirical)

- `/ai` page: `src/routes/(app)/system/settings/ai/+page.svelte`
  - `cerebellumRows` fetched via `fetchAiCerebellum()` (all rows, no filter).
  - `cerebellumGroups` derived groups rows by `assistant_key`.
  - Bottom section (lines ~509-550) renders groups with `tuningOverrides()`
    + `resolveEffectiveParams()` — to be removed.
  - Model rows render `model.temperature / top_p / max_tokens /
    repetition_penalty / enable_thinking` directly (lines ~339-366).
- Reusable pieces already built (reuse, don't reinvent):
  - `resolveEffectiveParams(model, tuning)` + `tuningOverriddenKeys(tuning)`
    in `src/lib/ai/ai-cerebellum.ts`.
  - `ai-cerebellum-selector.svelte` — DropdownMenu + CircuitBoard + chevron
    trigger anatomy and `dropdownMenuItemWithSelectedClass` helper.
  - `useAiCerebellum.svelte.ts` — per-assistant cache (not needed here: the
    page already fetches all rows once).
  - `SheetPanelLayout` + `SheetHeaderAction` + `openSheet` registry.
  - `ComboSelect` exists for select-like fields (verify usage in forms).
- BE already supports full CRUD on `ai_cerebellum`
  (`POST/PUT /api/v1/entities/ai_cerebellum`, envelope `{entity, translations?}`,
  ADMIN permission; delete requires MFA step-up).
  - Create schema (`AiCerebellumCreateBodySchema`): required `assistant_key`
    (1-60), `model_id` (1-100), `name` (1-80); optional `description_key`,
    `enable_thinking`, `temperature` (0-2), `top_p` (0.01-1), `max_tokens`
    (1-32768), `repetition_penalty` (1-2), `execution_config`, `is_enabled`
    (default true), `sort_order` (default 100). NULL params = inherit model.
- Existing `assistant_key` values in DB: `regex`, `json_config` (also `guide`
  exists in code: `use-guide-ai.svelte.ts` passes `assistant_key: 'guide'`).

## Changes

### 1. `/ai` page — toolbar dropdown (`+page.svelte`)

- Add `let selectedAssistantKey = $state<string | null>(null)` (null = model
  defaults).
- Toolbar (right of "AI Models" title, before DeletionFilterToggle): a
  DropdownMenu mirroring `ai-cerebellum-selector.svelte` anatomy:
  - Trigger: `CircuitBoard` icon + selected label + `ChevronDown`.
  - Item 1: "Model defaults" (`app.smart.ai.cerebellum.model_defaults` key,
    already exists) → `selectedAssistantKey = null`.
  - Separator + one item per distinct `assistant_key` found in `cerebellumRows`
    (enabled, non-deleted). Label = `$t(name)` of the first row of that group
    (the name i18n key is shared per assistant — verified in DB) — fallback to
    the raw `assistant_key` when $t doesn't resolve.
  - Separator + final item "New cerebellum" (Plus icon, new i18n key) →
    `openSheet('shell.aiCerebellum', {})`.
  - testids: `ai-cerebellum-assistant-trigger`, `…-defaults`,
    `…-assistant-{key}`, `…-create-cta`.
- Per-model-row params: compute per row
  `const tuning = tuningFor(row.model_id, selectedAssistantKey)` (lookup in
  `cerebellumRows` by `(assistant_key, model_id)`, enabled & non-deleted);
  `const eff = resolveEffectiveParams(model, tuning)` and render `eff.*`
  instead of `model.*` for temperature / top_p / max_tokens /
  repetition_penalty / enable_thinking rows. Optionally dim or badge
  overridden keys via `tuningOverriddenKeys(tuning)` (e.g. wrap overridden
  values in a `text-primary` span — to confirm visually).
- Remove: cerebellum `<section>` block, `cerebellumGroups`, `tuningOverrides`,
  `CircuitBoard`/`resolveEffectiveParams` imports if unused after refactor.
- Keep `cerebellumRows` fetch (now feeding the dropdown + per-row resolution).

### 2. New sheet panel `shell.aiCerebellum` — cerebellum create form

- New file `src/lib/shell/sheets/panels/AiCerebellumPanel.svelte`:
  - `SheetPanelLayout` with icon `CircuitBoard` + title
    `system.entities.ai_cerebellum.create_title` (new i18n key; verify whether
    `ai_cerebellum` entity keys already exist — meta titleKey is
    `system.entities.ai_cerebellum.title`, likely already translated).
  - CONTENT = form fields:
    - `assistant_key` — **closed** ComboSelect of known assistants
      (regex / json_config / guide). No free text: the displayed name is a
      translation derived from the assistant, so an unknown key would render
      raw text.
    - `model_id` — ComboSelect over `aiModels.getEnabledModels()` (label =
      `model.name`, value = `model_id`).
    - `name` — **NOT a user input**. Cerebellum rows have no custom name: it
      is the assistant's i18n key (`app.smart.<ns>.ai.cerebellum_name`),
      derived from `assistant_key`. Implementation: look up the `name` of any
      existing row for that assistant in `cerebellumRows`; if the assistant
      has no rows yet, build `app.smart.{ns}.ai.cerebellum_name` and ship its
      translations through the `translations` envelope of the create body.
    - Param overrides — numeric inputs for temperature / top_p / max_tokens /
      repetition_penalty + `enable_thinking` switch; empty = NULL = inherit
      model default (show model defaults as placeholder/helper).
    - `sort_order`, `is_enabled` (default true).
  - FOOT (or header-less footer actions): Cancel + Save
    (`variant="outline" tone="primary"` / `variant="default"` per
    button-variant standard; order per `dialog-footer-cta-order` rule).
  - Save: `POST /api/v1/entities/ai_cerebellum` with
    `{entity: {...}}` via `apiFetch`; on success `closeSheet()` + reload
    `cerebellumRows` (expose a reload via callback prop passed through
    `openSheet` props, or `aiModels`-style invalidation).
  - Errors via `pushNotification` (never toast directly).
- Register in `sheet-manager.svelte.ts` (`SheetPanelId` +
  `SheetPanelPropsMap`: `{ onCreated?: () => void }`) and `SheetHost.svelte`.
- Later (follow-up, not this plan): edit existing cerebellum rows reusing the
  same panel with a `tuning` prop.

### 3. Translations (BE fire-and-forget SQL, ×6 languages)

- `system.entities.ai_cerebellum.create_title` — "New cerebellum" / "Nuovo
  cervelletto" / …
- `system.settings.ai.cerebellum_section.*` keys — check usage; remove keys
  only if nothing else references them (they become dead translations; leaving
  them is harmless — decide).
- `app.smart.ai.cerebellum.new_cta` or reuse existing "create" key.
- Form field labels: reuse `system.entities.ai_model.fields.*` keys where the
  field names match (temperature, top_p, max_tokens, repetition_penalty,
  enable_thinking, sort_order, is_enabled/name fields if present in the
  `ai_cerebellum` namespace — verify existing keys first).

### 4. Docs

- Update `docs/ai/sheets.md` panel list (new panel id) if such a list exists.
- Update `docs/user-guide` only if a page documents the /ai settings sections.

## Out of scope / notes

- Scores, rank, gauges: untouched by design.
- Cerebellum `name` is never user-editable — it is derived from the
  assistant's i18n namespace (verified: all rows per assistant share the same
  `app.smart.<ns>.ai.cerebellum_name` key).
- Edit/delete of existing cerebellum rows: not requested — create only.
- The `ai-cerebellum-selector` inside chat footers is unchanged (it selects a
  tuning per assistant+model inside the assistant panels — different scope).

## Acceptance criteria

- /ai toolbar shows cerebellum dropdown; default = model defaults.
- Selecting `regex` shows resolved params on `Qwen2.5-Coder-3B#q4f16`
  (the only regex tuning) and defaults elsewhere; scores unchanged.
- "+ New cerebellum" opens the standard 384px sheet; create POSTs and the
  dropdown lists the new assistant immediately after reload.
- Old cerebellum section gone; `pnpm check` 0 errors; new testids present.
