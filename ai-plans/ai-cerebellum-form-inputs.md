# AI Cerebellum form — badge combobox + slider-only params + sort_order removal

## Empirical findings (verified)

### sort_order is dead weight on ai_cerebellum

- DB unique index `ai_cerebellum_assistant_model_uq` on `(assistant_key, model_id)
  WHERE deleted_at IS NULL` — **at most ONE cerebellum per pair**. There can never
  be two tunings to order within a (assistant, model) scope.
- `useAiCerebellum.getTuningsForModel()` filters by `model_id` then sorts by
  `sort_order` — the array can contain at most 1 row per assistant → the sort is
  a no-op. The "first by sort_order" auto-selection in `use-ai-assistant` always
  picks the only possible row.
- `ai_model.sort_order` is meaningful (orders the /ai catalog) — the field was
  likely copied to ai_cerebellum by entity-template habit.
- **Removal impact**: column drop + remove from entity/DTO/DAL, panel field,
  and the `.sort()` in `getTuningsForModel`. Zero functional change.
- Decision: **remove** the field from the form now; drop the column via a
  fire-and-forget patch (kept nullable-safe: remove reads first, drop after).

### ComboSelect freedom problem

- `itemSnippet`/`selectedSnippet` are escape hatches; every caller reinvents
  option markup (users roles badge, config two-line key+value, AiModelOption…).
- Goal: a **template prop** so common renders are declarative — dev picks a
  template, ComboSelect knows which fields to read. Snippets remain for truly
  custom layouts.

### Slider mess

- Panel currently pairs `Slider` + `Input` per param; NULL parks the slider at
  0 → looks like a stray radio. User wants ONE component: slider + reactive
  value label, **no text input**.

## Design

### A. ComboSelect — declarative `display` templates

Add optional props to `combo-select.svelte` (backward compatible — snippets keep
working and take precedence):

```ts
/** Declarative option renderer — checked before falling back to plain label. */
display?: 'default' | 'badge';
/** For display='badge': field on the option carrying the color token (e.g. 'emerald-500'). */
colorField?: string;
```

- `display="badge"`: each item renders `<Badge>` colored via
  `badgeClassesFromToken(option[colorField])` with `resolvedLabel` inside —
  same look as `FiltersPanel` badge filters. `selectedSnippet`-less selected
  state also renders the badge in the trigger.
- This covers ALL "state/enum" selects (recommendation, thinking, config badge
  type, status filters…) without snippets.
- Complex layouts (two-line, model option card) keep using snippets.

Docs: record in `docs/ai/` (component patterns) + extract-docs — rule: "for
enum/state options use `display='badge'` + `colorField`; snippets are for
layout, not for coloring states".

### B. `SliderField` — single reusable nullable-range component (NO input)

`src/lib/components/ui/slider-field/slider-field.svelte`:

```ts
let {
  value = $bindable<number | null>(null), // null = inherit
  min, max, step = 1, decimals = 0,
  label, testid,
} = $props();
```

Rendering (single row):
- bits-ui `Slider` (existing `ui/slider` wrapper) — always enabled.
- Right side: reactive label — the value (`v.toFixed(decimals)`) or a muted
  "inherit" chip when `null`. No `<input>`.
- When `value !== null`, a small ghost `X` icon-button next to the label resets
  to `null` (inherit). When null, dragging the slider sets the value.
- Internally slider gets `value ?? min` for position only; the displayed label
  shows "inherit" so there's no fake 0.

Applied to: `temperature` (0–2, step 0.1, 1 decimal), `top_p` (0.01–1, step
0.01, 2 dec), `repetition_penalty` (1–2, step 0.01, 2 dec). `max_tokens` stays
`NumericInput` (1–32768 — linear slider useless). `enable_thinking` stays
ComboSelect with `display`… actually 3-state enum → `display="badge"`.

Verified live with **playwright MCP** against the running dev server
(persistent profile/CDP if available) — open the cerebellum sheet, drag, check
label reactivity and inherit reset.

### C. Remove sort_order from cerebellum

- Panel: delete the field + `sort_order` from payload (BE keeps column for now).
- `useAiCerebellum.getTuningsForModel`: drop `.sort()` (≤1 row anyway).
- BE patch `db-meta/fire-and-forget/drop_ai_cerebellum_sort_order.sql`:
  `ALTER TABLE ai_cerebellum DROP COLUMN sort_order;` + remove from
  entity/DTO/DAL select list.

## Files touched

- `src/lib/components/ui/combo-select/combo-select.svelte` — `display`/`colorField`
- `src/lib/components/ui/slider-field/{slider-field.svelte,index.ts}` — NEW
- `src/lib/shell/sheets/panels/AiCerebellumPanel.svelte` — badge combobox + SliderField, drop sort_order
- `src/lib/composables/useAiCerebellum.svelte.ts` — drop sort
- BE: `ai_cerebellum_entity.ts`, `dto.ts`, DAL select, fire-and-forget patch
- Docs: `docs/user-guide` AI section + `docs/ai` component rule + `pnpm extract-docs`

## Acceptance criteria

- Enum/state comboboxes render colored badges via `display="badge"` — zero snippets.
- SliderField is the only param-range widget; no numeric input for ranged params.
- sort_order gone from cerebellum form and entity; /ai unaffected.
- `pnpm check` clean; playwright-verified interaction.
