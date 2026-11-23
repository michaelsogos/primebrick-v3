# Bugfix: i18n_key suggestion taints edit forms + created-value anatomy in single ComboSelect

> Plan-first workflow — named at every turn; ledger updated per turn with
> ✅ + commit hash or ⏳ + residuals. Deviation → STOP, update plan first.

## Status: 🟡 IN PROGRESS — Plan date: 2026-11-23

## TIC evidence

### Bug 1 — form born tainted (race confirmed)

`FormFieldDispatcher.svelte:683-690` — a `$effect` auto-assigns
`i18nKeySuggestion` when the bound `format:"i18n_key"` value is empty.
The assignment fires AFTER `EntityFormSurface` computed its baseline
(`initial` → `v ?? ''`, update mode): `$formData` mutates post-baseline →
field reads tainted → `useUnsavedChangesGuard` fires `window.confirm` on
sheet close even with zero user edits. Sequence `description_key`
(`format:"i18n_key"` in dal-pg `sequence-decl.ts:82`) is the reported
surface; EVERY empty i18n_key field in an edit form is affected.

### Bug 2 — created value renders as Badge in single mode

`combo-select.svelte:637-659` — single-mode, value not in the options
vocabulary → `<Badge variant="outline">` + muted "New" suffix. Badge
anatomy belongs to MULTI mode (`:707-708` created badges) — single
selections render icon+text. Prior work `29272a4` shipped the chip in
single too — wrong surface.

## Locked decisions (user)

1. **Taint → (a) baseline-seeded suggestion**: the suggestion IS the
   initial value for empty `format:"i18n_key"` fields — computed in the
   form's `initial` (baseline), not by a post-baseline effect. Suggestion
   UX preserved in create AND update; empty stored value + suggestion =
   pre-filled, un-tainted.
2. **Created-single anatomy = field icon**: created value renders the
   FIELD's icon (i18n: `languages`/`sky-500` via `I18N_KEY_OPTION_ICON/
   I18N_KEY_OPTION_COLOR` constants) + text + muted mini "Nuovo" — same
   anatomy as a normal selection plus the marker. Multi badges unchanged.

## Tasks

| # | Task | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | `dict-suggestion.ts`: `i18nKeySuggestionFor(translationKey?, codeOrName)` — ONE formula (tk → `custom.entities.<tk>.rows.<slug>`; no tk → `custom.entities.<slug\|my_custom_code>`; empty slug w/ tk → `''`) shared by surface + dispatcher | ⏳ | — | extract from dispatcher's inline derived |
| 2 | `EntityFormSurface` `initial`: `format:"i18n_key"` empty → `i18nKeySuggestionFor(meta.translation_key, record?.code ?? record?.name) \|\| <type default>` — baseline carries the suggestion; both modes | ⏳ | — | post-baseline mutation eliminated |
| 3 | `FormFieldDispatcher`: `i18nKeySuggestion` derives from the shared helper (single source) | ⏳ | — | tracking effect unchanged (source-moves divergence = real edit) |
| 4 | ui `ComboSelect`: `createdIcon`/`createdIconColor` props → created-single raw synth carries iconField → standard icon pipeline; render icon+text+muted-"Nuovo" instead of Badge | ⏳ | — | multi unchanged |
| 5 | fe `FormFieldDispatcher` i18n branch + dict `TranslationKeyCell` ComboSelects: pass the I18N icon constants | ⏳ | — | consistent surface |
| 6 | E2E headed persistent spec: sequence edit sheet opens un-tainted (no confirm on close, suggestion pre-filled) + created i18n key renders icon+text+"Nuovo" | ⏳ | — | `sequences.spec.ts` or dedicated — canonical location |
| 7 | docs: combo-select dev-guide (createdIcon props + single anatomy) + entity-form i18n_key baseline semantics | ⏳ | — | |

## Risks / edges

- Create mode with no code/name yet AND a translation_key → suggestion
  `''` → baseline `''`, effect no-ops — field empty, correct.
- Explicit clear → `''` ≠ suggestion baseline → tainted = correct.
- Rebaseline on record morph recomputes the suggestion — consistent.
- `selectedSnippet` consumers bypass the new anatomy BY DESIGN (custom
  renderers own their surface).
