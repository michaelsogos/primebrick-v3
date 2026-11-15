# Plan: Fix Svelte 5 compiler warnings (combo-select + regex-ai-chat-panel)

## Objective

Resolve two `vite-plugin-svelte` warnings emitted by the dev server:

1. `element_invalid_self_closing_tag` — `combo-select.svelte:398:16`
   `<div ... />` used for a non-void element.
2. `non_reactive_update` — `regex-ai-chat-panel.svelte:88:6`
   `scrollContainer` is assigned via `bind:this` but is not declared with
   `$state(...)`, so the binding update does not correctly trigger updates.

Both are one-line fixes. No architectural changes, no signature changes.

## Impacted files

| File | Line | Change |
|------|------|--------|
| `primebrick-fe-v3/src/lib/components/ui/combo-select/combo-select.svelte` | 398 | `<div ... />` → `<div ...></div>` |
| `primebrick-fe-v3/src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte` | 88 | `let scrollContainer: HTMLElement \| null = null;` → `$state` declaration |

Verified: line 398 is the **only** self-closing non-void element in
`combo-select.svelte` (grep for `<(div|span|p|button|...).../>` → 1 match).

## Fix 1 — `combo-select.svelte:398`

Current:

```svelte
<div class="combo-select-checkbox h-4 w-4 rounded border border-input shrink-0" />
```

Proposed:

```svelte
<div class="combo-select-checkbox h-4 w-4 rounded border border-input shrink-0"></div>
```

Rationale: `div` is not a void element; self-closing syntax is ambiguous in
Svelte 5 and warns. Expanding to open/close tags is the documented fix.

## Fix 2 — `regex-ai-chat-panel.svelte:88`

Current (line 88):

```ts
let scrollContainer: HTMLElement | null = null;
```

Proposed:

```ts
let scrollContainer = $state<HTMLElement | null>(null);
```

Rationale: `scrollContainer` is mutated by `bind:this` (line 389) and read
inside `$effect` (lines 185–196). Per Svelte 5 runes, a variable updated by a
binding must be `$state` so the binding write is tracked. This is also the
correctness fix: with `$state`, the auto-scroll `$effect` will re-run once
when the element first binds, not only on subsequent message changes —
matching the intended "scroll to bottom on mount" behaviour.

The read sites (`bind:this`, `scrollContainer.scrollTop`) require no changes.

## Execution steps

1. Apply the two edits above.
2. Per AGENTS.md rule 7, pass both edited `.svelte` snippets through the
   `svelte-autofixer` MCP tool and resolve any returned `issues`.
3. Run `pnpm run check` in `primebrick-fe-v3` (typecheck + svelte-check) —
   expect zero warnings for these two files.
4. Watch the running dev server output (port 5173 — do NOT restart it; the
   warnings appear via HMR). Confirm both warnings are gone after HMR of the
   two files.

## Acceptance criteria

- `element_invalid_self_closing_tag` no longer emitted for `combo-select.svelte`.
- `non_reactive_update` no longer emitted for `regex-ai-chat-panel.svelte`.
- `pnpm run check` clean for both files.
- Auto-scroll in the AI chat panel still works (messages view scrolls to
  bottom when a new message/stream chunk arrives).
- Multi-mode "create item" row in ComboSelect still renders the checkbox
  square correctly.

## Out of scope

- No other components touched; no dependency or config changes.
- No commit (per AGENTS.md: never commit without explicit instruction).
