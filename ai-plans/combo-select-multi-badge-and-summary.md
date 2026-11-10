# ComboSelect — multiBadge icon anatomy + multiSummaryAt counter — Plan

## Status: 🟢 DONE — implemented 2026-11-09 (last decision: per-option icon miss → label fallback + DEV warn)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `multiBadge` prop with dependent-props union — `'icon'` impossible by construction without `iconField`/`flagField` | ✅ done | 2026-11-09 | union variants declare both fields (TS narrowing fix); probe proved `multiBadge="icon"` w/o fields = callsite TS error |
| 2 | `multiSummaryAt` prop — collapsed "N selected" chip past threshold | ✅ done | 2026-11-09 | **DEFAULT = 1 per user order — every multi combobox collapses at 2+ selections**; chip destructive when ≥1 invalid value; e2e-pinned via the update-langs combo ("2 selected") |
| 3 | `app.common.selected_count` i18n key ×7 → be patch + sign + apply | ✅ done | 2026-11-09 | `20261213000000_combo_select_selected_count.sql`, signed dev-micha-2, applied; plural via `{count === 1 ? …}` expression |
| 4 | Callsite: update-langs combo in TranslationEditorPanel → `multiBadge="icon"` + flagField (flags+X badges) | ✅ done | 2026-11-09 | flagField was already wired; one prop added |
| 5 | E2E pins: badge anatomy per mode, summary collapse, construction-error paths | ✅ done | 2026-11-09 | icon-mode flags+X (1 sel) AND default-1 summary collapse ("2 selected" chip, flags gone) pinned in entity-dict-page 3/3; union-type rejection proven via svelte-check probe |

---

## Context

Driven by the translation-editor update-langs combobox: its selected
badges should read `flag + X`, not `label + X`. Generalizes into a
component contract: per-badge anatomy is opt-in via one prop; icon-only
requires the icon source to be declared — **impossible by construction**,
no silent fallback.

## TIC evidence (empirical)

- Multi-mode badge render today: `{opt?.label ?? val}` + X only
  (`combo-select.svelte` ~L588-609). `resolveIcon`/`resolveFlag` serve
  option rows + single-mode selected display only — multi badges ignore
  `iconField`/`flagField` entirely.
- **The "N selected" counter does NOT exist** — checked ComboSelect
  source, all 8 multi call-sites (profile roles included), git pickaxe
  on ui/fe/us/sdk (badge/cap/more/overflow), SelectableToolbar
  (different feature: row selection), PresenceAvatars (`+{hiddenCount}`,
  avatars not combobox). Treat as new work — threshold dynamic via prop.
- Label always resolvable (`resolveLabel` → `resolveValue` fallback) —
  "label is safe" verified. Icon is per-option nullable
  (`showIcons`/field/value all gate it) — the union type guards the
  prop, the per-option edge needs the DEV warn (below).
- Precedence `iconField > flagField` already established in option rows.
- `$t` interpolation `{count}` exists (`bulk_scope_selected_title`
  precedent) — the summary chip needs ONE new key.

## Locked design (user-approved 2026-11-09)

```ts
type Props = CommonProps & (
  | { multiBadge?: 'icon-label' | 'label'; iconField?: string; flagField?: string }
  | ({ multiBadge: 'icon' } & ({ iconField: string } | { flagField: string }))
);
```

| Rule | Behavior |
|---|---|
| `multiBadge='icon-label'` (default) | resolved icon/flag + label + X — adds icon vs today |
| `multiBadge='label'` | exactly current render |
| `multiBadge='icon'` | icon/flag + X only — TS error without iconField/flagField |
| icon/flag precedence | `resolveIcon ?? resolveFlag` (option-row contract) |
| option w/o resolvable icon under `'icon'` | DEV `console.warn` + label render — **visible** degradation, never silent (confirmed: last open micro-decision, warn-not-silent satisfies "no fallback silente") |
| `multiSummaryAt=N` (**default 1** — user: "per tutti") | `selectedValues.length > N` → ONE summary chip `$t('app.common.selected_count',{count})` replaces the badge list; trailing eraser still clears all; per-item remove via the dropdown |
| summary + `isValueInvalid` | summary chip `variant="destructive"` when ≥1 selected value is invalid |

## Out of scope / explicitly rejected

- Silent fallback per-option (banned — warn + visible label instead)
- Lint rule for the icon contract — union type already fails the build;
  lint would be redundant (surface if the type proves insufficient)
- `selectedSnippet` for multi — stays single-mode; the prop is the
  sanctioned path for badge anatomy

## New i18n keys (be patch)

`app.common.selected_count` — e.g. `{count} selected` /
`{count} selezionati` ×7 langs. Verify no reuse first
(`system.entities.list.selected*` are row-toolbar scoped — wrong ns).
