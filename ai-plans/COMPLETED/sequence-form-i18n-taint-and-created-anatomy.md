# Bugfix: i18n_key suggestion taints edit forms + created-value anatomy in single ComboSelect

> Plan-first workflow — named at every turn; ledger updated per turn with
> ✅ + commit hash or ⏳ + residuals. Deviation → STOP, update plan first.

## Status: ✅ COMPLETED — all tasks shipped 2026-11-23 — Plan date: 2026-11-23

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
| 1 | `dict-suggestion.ts`: `i18nKeySuggestionFor(translationKey?, codeOrName)` — ONE formula shared by surface + dispatcher | ✅ | fe `0a24385` | tk → `custom.entities.<tk>.rows.<slug>`; no tk → `custom.entities.<slug\|my_custom_code>`; empty slug w/ tk → `''` |
| 2 | `EntityFormSurface.buildInitial`: `format:"i18n_key"` empty → `i18nKeySuggestionFor(meta.translation_key, servedRecord?.code ?? .name)` — baseline carries the suggestion, both modes | ✅ | fe `0a24385` | `servedRecord` (baseline record), not `$form` — the dispatcher's `bind:record={$form}` tracks live values; divergence only on real edits |
| 3 | `FormFieldDispatcher`: `i18nKeySuggestion` derives from the shared helper | ✅ | fe `0a24385` | tracking effect unchanged |
| 4 | ui `ComboSelect`: `createdIcon`/`createdIconColor` props → synthesized into iconField → standard icon pipeline; icon+text+muted-"Nuovo" replaces Badge | ✅ | ui `cc93fb8` | multi unchanged; `selectedSnippet` consumers bypass by design |
| 5 | fe call sites: `FormFieldDispatcher` i18n + dict `TranslationKeyCell` pass I18N constants; other allowCreate sites (census, validation rules) carry no field icon → left unset (text+Nuovo, correct) | ✅ | fe `0a24385` | consistent surface |
| 6 | E2E headed `elt-i18n-key-form.spec.ts` (persistent): untouched edit sheet closes WITHOUT confirm + suggestion pre-filled + icon/text/Nuovo anatomy; real edit STILL fires the guard | ✅ | fe `0a24385` | **2/2 green** — 9.9s + 10.3s |
| 7 | docs: `entity-metadata.mdx` i18n_key baseline-seeded note; `combo-select.mdx` createdIcon props + single anatomy | ✅ | fe `c7afee3` | |

## Verified

- svelte-check fe 0/0, ui 0/0; ui build clean.
- Headed spec: sheet with empty `description_key` → `custom.entities.`
  suggestion in trigger (icon + text + muted marker, `[data-slot='badge']`
  count 0) → Escape closes with **no `dialog` event**.
- Guard probe: real edit (step 1→2) → Escape → `window.confirm` fires —
  `useUnsavedChangesGuard` intact.
