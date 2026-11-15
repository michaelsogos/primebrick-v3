# Plan: Command Input Polish (X button, gap, border style)

## Problem

1. **X clear button** — currently toggles with the search icon inside a
   single right-side `InputGroup.Addon`. Should follow the standard
   `TextInput` pattern: absolute-positioned X on the right inside a
   `relative` wrapper, using `inputTrailingIconButtonClasses`.

2. **Gap between search input and first item** — `command-input.svelte`
   wrapper has `p-1 pb-0` (no bottom padding). Items start immediately
   after the input with no visual separation.

3. **Search input border style** — `command-input.svelte` uses
   `border-input/30` (shadcn gray default). The rest of the FE uses
   `border-primary-gradient` (sky→indigo gradient) on all inputs.

## Empirical findings: FE input border styles

### Standard 1: `border-primary-gradient` (PRIMARY standard)

Used by:
- `input.svelte` (base Input) — `border-primary-gradient`
- `text-input.svelte` — inherits from Input
- `combo-select.svelte` trigger — `border-primary-gradient`
- `numeric-input.svelte` (with currency) — `border-primary-gradient`
- `switch.svelte` — `border-primary-gradient`

This is the **dominant standard** — every user-facing input border.

### Standard 2: `border-input` (shadcn default, gray)

Used by:
- `input-group.svelte` — `border-input` (shadcn default, never customized)
- `command-input.svelte` — inherits `border-input/30` from InputGroup

This is the **shadcn skeleton default** — used only inside composite
components that were not customized to the project's primary gradient.

### Standard 3: `border-readonly-gradient` (disabled/readonly)

Used by:
- `text-input.svelte` — for readonly/disabled mode only

### Conclusion

**One primary standard**: `border-primary-gradient`.
The `command-input.svelte` should be updated to match.

## Trailing icon standard

`inputTrailingIconButtonClasses` (from `input-chrome.ts`):
```
absolute top-1/2 right-0 -translate-y-1/2 size-7 min-w-0
+ inputTrailingIconColorClasses (muted→foreground, no bg, cursor-pointer)
```

This is used by `TextInput` for its X clear button. The command input
should use the same pattern.

## Solution

### command-input.svelte changes

1. **X button**: Move from `InputGroup.Addon` to an absolute-positioned
   button inside a `relative` wrapper, using `inputTrailingIconButtonClasses`.
   Keep the search icon in a left-side `InputGroup.Addon` (inline-start).

2. **Gap**: Change wrapper from `p-1 pb-0` to `p-1 pb-1`.

3. **Border**: Change `InputGroup.Root` from `border-input/30` to
   `border-primary-gradient`. Add `shadow-xs` and `hover:brightness-105`
   to match the standard Input hover behavior.

4. **Input padding**: Add `pr-8` when `value` is non-empty so text
   doesn't overlap with the absolute X button.

## Impacted Files

| File | Change |
|------|--------|
| `src/lib/components/ui/command/command-input.svelte` | Fix X position, add gap, apply primary gradient border |

## Acceptance Criteria

1. X clear button is absolute-positioned on the right inside the input
   border (same as TextInput clear button)
2. Search icon stays on the left side of the input
3. There is a visible gap between the search input and the first dropdown
   item
4. Search input border uses `border-primary-gradient` (sky→indigo)
5. All existing tests pass
6. svelte-check: 0 errors
