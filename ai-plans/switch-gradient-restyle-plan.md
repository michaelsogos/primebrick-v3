# Plan: Switch Component Gradient Restyle

**Status:** DRAFT — awaiting approval (revised)
**Date:** 2026-08-28
**Scope:** `primebrick-fe-v3` only
**Mode:** PLAN (no code changes until "PROCEED")

## 1. Objective

Adapt the `Switch` UI primitive so it follows the new Primebrick primary gradient
identity (sky-400 → indigo-400), matching the already-adapted `Checkbox` and the
primary CTA `Button`. Today the Switch uses a **solid** `--primary` color for the
checked pill and a neutral `border-input` for the unchecked pill. The thumb is
always `bg-background` with a `border-input` ring.

### Desired behavior (per user spec)

| State | Pill background | Pill border | Thumb (handler) background |
|-------|-----------------|-------------|----------------------------|
| **FALSE (unchecked)** | white / `--background` (unchanged) | **gradient** (sky-400 → indigo-400) | **primary gradient** (like primary CTA: `bg-linear-to-br from-sky-400 to-indigo-400`) |
| **TRUE (checked)** | **gradient** (sky-400 → indigo-400) | transparent | **white** (`bg-background`) |

This mirrors the Checkbox checked treatment and the Button `default` variant.

**DRY principle:** reuse existing CSS utilities and established class patterns.
No inline walls of utility classes to reproduce what already exists.

## 2. Empirical findings (no assumptions)

### 2.1 Switch component definition

**File:** `primebrick-fe-v3/src/lib/components/ui/switch/switch.svelte` (53 lines)
**Barrel:** `primebrick-fe-v3/src/lib/components/ui/switch/index.ts` — exports `Root` and `Switch`.

Current class strings (verbatim from the file):

Root (pill), lines 23-34:
```
"group/switch peer relative inline-flex h-5 w-11 shrink-0 cursor-pointer items-center rounded-full px-1 shadow-xs outline-hidden ring-offset-background transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
// Neutral palette (unchecked)
"border border-input bg-background dark:bg-input/30",
"hover:border-ring/40 hover:bg-muted/40 dark:hover:bg-input/38",
"disabled:hover:border-input disabled:hover:bg-background dark:disabled:hover:bg-input/30",
// Checked palette — use primary (neutral)
"data-[state=checked]:border-primary data-[state=checked]:bg-primary",
"data-[state=checked]:hover:border-primary/80 data-[state=checked]:hover:bg-primary/90",
"data-[state=checked]:disabled:hover:border-primary data-[state=checked]:disabled:hover:bg-primary",
```

Thumb (handler), lines 39-46:
```
"pointer-events-none relative z-10 flex size-4 translate-x-0 items-center justify-center rounded-full border bg-background text-foreground shadow-xs ring-0 transition-[transform,background-color,border-color,color]",
"border-input",
"group-hover/switch:border-ring/40",
"data-[state=checked]:border-primary",
"group-hover/switch:data-[state=checked]:border-primary/80",
"data-[state=checked]:translate-x-[18px]"
```

The component accepts an optional `thumbIcons` snippet (rendered inside the thumb):
```svelte
{#if thumbIcons}
  {@render thumbIcons({ checked })}
{/if}
```

### 2.2 Reference: Checkbox (already gradient-adapted)

**File:** `primebrick-fe-v3/src/lib/components/ui/checkbox/checkbox.svelte`

Checked treatment (primary tone), line 11:
```
"data-[state=checked]:bg-linear-to-br data-[state=checked]:from-sky-400 data-[state=checked]:to-indigo-400 data-[state=checked]:text-white data-[state=checked]:border-transparent"
```
This is the canonical "primary gradient fill" pattern in the codebase — the DRY
convention for a full-opacity sky→indigo gradient surface.

### 2.3 Reference: Button primary CTA

**File:** `primebrick-fe-v3/src/lib/components/ui/button/button.svelte`, line 12 (`default` variant):
```
"bg-linear-to-br from-sky-400 to-indigo-400 text-white shadow-xs hover:from-sky-500 hover:to-indigo-500 hover:brightness-105"
```
Same DRY pattern as the Checkbox — `bg-linear-to-br from-sky-400 to-indigo-400` is
the established way to express a full primary gradient fill in this codebase.

### 2.4 Reference: gradient border utility (DRY — reuse this)

**File:** `primebrick-fe-v3/src/app.css`

- `border-primary-gradient` (lines 106-111): double-background trick —
  `border: 1px solid transparent` +
  `background: linear-gradient(hsl(var(--background)), hsl(var(--background))) padding-box,
   linear-gradient(to bottom right, #38bdf8, #818cf8) border-box`.
  This gives a **gradient 1px border on a white (`--background`) fill** — exactly
  the desired unchecked pill treatment. This is the DRY utility to reuse.
- `border-readonly-gradient` (lines 217-222): 50%-opacity gradient border (disabled
  look) — candidate for the disabled unchecked pill.
- `border-primary-gradient-soft` (lines 129-134): tenue gradient fill + gradient
  border — candidate for hover.
- All gradient utilities are registered in the `@source inline(...)` list (line 3)
  so Tailwind v4 emits them on demand.
- There is **no** full-opacity `bg-primary-gradient` utility (only the `-soft` tenue
  variant). The full gradient fill is expressed via the DRY
  `bg-linear-to-br from-sky-400 to-indigo-400` pattern (per Button/Checkbox).

### 2.5 Complete inventory of Switch usages (7 sites)

Found via `<Switch` and `Switch.Root` grep across `src/`. **7 usages** confirmed
(IANA toggles excluded from this plan per user instruction).

| # | File | Line | Context / Location | thumbIcons? | Notes |
|---|------|------|--------------------|-------------|-------|
| 1 | `src/lib/components/config-list/ConfigValueInput.svelte` | 162 | Config List row — boolean config entry value input (card body) | No | `checked={value === 'true'}`, `onCheckedChange={handleBooleanChange}` |
| 2 | `src/routes/(app)/system/settings/security/create/+page.svelte` | 344 | Config create form — "reserved" toggle (form field, FormPageLayout) | No | `checked={$form.reserved}` |
| 3 | `src/routes/(app)/system/settings/modules/+page.svelte` | 311 | Modules page — module enable/disable toggle (card row, next to status badges) | No | `checked={module.is_enabled}`, `disabled` when reserved |
| 4 | `src/lib/components/anchor-tabs/anchor-tabs-mode-switch.svelte` | 43 | AnchorTabs mode toggle (inline toolbar, show-all/hide tabs) | No | `bind:checked` |
| 5 | `src/lib/components/entity-list-table/panels/PreviewPanel.svelte` | 171 | Preview sheet header actions — edit-mode toggle | No | `checked={previewEditMode}`, `disabled={rowDeleted}` |
| 6 | `src/lib/components/entity-list-table/panels/FiltersPanel.svelte` | 673 | Filters sheet (advanced tab) — AND/OR global connector toggle | **Yes** — colored dot span: `bg-amber-200/85` (checked) / `bg-sky-200/80` (unchecked) | Used by `EntityListTableHeader` |
| 7 | `src/lib/entity-list/sheets/panels/FiltersPanel.svelte` | 674 | Filters sheet (advanced tab) — AND/OR global connector toggle (DUPLICATE of #6) | **Yes** — same colored dot span as #6 | Used by `SheetHost.svelte` and `customers/+page.svelte` |

Imports: sites 1-5 import via `import { Switch } from "$lib/components/ui/switch"`
(barrel). Sites 6-7 import via `import Switch from "$lib/components/ui/switch/switch.svelte"`
(default, direct path).

## 3. Proposed change (single file, DRY)

**Only `primebrick-fe-v3/src/lib/components/ui/switch/switch.svelte` is modified.**
No call-site changes are required for the 5 usages without `thumbIcons` — they
inherit the new look automatically.

### 3.1 Pill (Root) — unchecked

Replace the neutral unchecked block:
```
"border border-input bg-background dark:bg-input/30",
"hover:border-ring/40 hover:bg-muted/40 dark:hover:bg-input/38",
"disabled:hover:border-input disabled:hover:bg-background dark:disabled:hover:bg-input/30",
```
with the **`border-primary-gradient` utility** (existing, DRY — white fill from
`--background` + sky→indigo gradient 1px border):
```
"border-primary-gradient dark:bg-input/30",
"hover:border-primary-gradient-soft dark:hover:bg-input/38",
"disabled:hover:border-primary-gradient dark:disabled:hover:bg-input/30",
```

**Dark-mode note:** `border-primary-gradient` hardcodes `hsl(var(--background))`
as the padding-box fill. The `dark:bg-input/30` override may not apply cleanly
because the utility sets the `background` shorthand. This must be verified
empirically in dark mode during execution. If it doesn't override, a
`border-primary-gradient-popover`-style dark variant utility may be needed (small
addition to `app.css`, following the existing pattern).

### 3.2 Pill (Root) — checked

Replace:
```
"data-[state=checked]:border-primary data-[state=checked]:bg-primary",
"data-[state=checked]:hover:border-primary/80 data-[state=checked]:hover:bg-primary/90",
"data-[state=checked]:disabled:hover:border-primary data-[state=checked]:disabled:hover:bg-primary",
```
with the full gradient fill (DRY — matches Button `default` + Checkbox checked,
same `bg-linear-to-br from-sky-400 to-indigo-400` pattern):
```
"data-[state=checked]:border-transparent data-[state=checked]:bg-linear-to-br data-[state=checked]:from-sky-400 data-[state=checked]:to-indigo-400",
"data-[state=checked]:hover:from-sky-500 data-[state=checked]:hover:to-indigo-500 data-[state=checked]:hover:brightness-105",
"data-[state=checked]:disabled:hover:from-sky-400 data-[state=checked]:disabled:hover:to-indigo-400",
```

### 3.3 Thumb — unchecked

Replace:
```
"border-input",
"group-hover/switch:border-ring/40",
```
with a primary-gradient fill + transparent border (DRY — same
`bg-linear-to-br from-sky-400 to-indigo-400` pattern as the primary CTA Button):
```
"border-transparent bg-linear-to-br from-sky-400 to-indigo-400 text-white",
"group-hover/switch:from-sky-500 group-hover/switch:to-indigo-500 group-hover/switch:brightness-105",
```
The base thumb string already contains `bg-background text-foreground`; the
unchecked gradient classes are appended after and override via specificity / order.

### 3.4 Thumb — checked

Replace:
```
"data-[state=checked]:border-primary",
"group-hover/switch:data-[state=checked]:border-primary/80",
```
with white surface + transparent border:
```
"data-[state=checked]:border-transparent data-[state=checked]:bg-background data-[state=checked]:text-foreground",
"group-hover/switch:data-[state=checked]:bg-muted",
```
Keep `data-[state=checked]:translate-x-[18px]` unchanged.

### 3.5 Disabled state

The existing `disabled:opacity-50` on the Root remains. For the disabled unchecked
pill, consider switching to `border-readonly-gradient` (50% opacity gradient
border, existing utility) to match the disabled-checkbox convention — **decision
needed (§5.2)**.

## 4. Impact on `thumbIcons` usages (needs decision)

Two call sites render custom content inside the thumb. Making the unchecked thumb
a primary gradient fill changes how that content reads.

### 4.1 FiltersPanel AND/OR connector (#6, #7)

The `thumbIcons` snippet renders a **colored dot** that is itself the visual
indicator:
```svelte
<span class="size-4 flex items-center justify-center rounded-full
  {checked ? 'bg-amber-200/85 dark:bg-amber-900/55' : 'bg-sky-200/80 dark:bg-sky-900/55'}">
</span>
```
- Unchecked: a `bg-sky-200/80` dot on a **sky→indigo gradient** thumb → low
  contrast (sky on sky). The dot currently sits on a white thumb, where it pops.
- Checked: a `bg-amber-200/85` dot on a **white** thumb → still fine.

**This is a real visual conflict.** Options (§5.3):
1. Keep the dot but recolor/restyle it for the new thumb backgrounds.
2. Drop the dot and rely on the switch pill gradient + thumb color alone (the
   AND/OR labels next to the switch already communicate state).
3. Leave `thumbIcons` usages untouched and accept the contrast change.

## 5. Open decisions (require user input before PROCEED)

1. **§3.1 Dark-mode unchecked pill** — if `dark:bg-input/30` does not override the
   `border-primary-gradient` utility's `background` shorthand, add a small
   `border-primary-gradient-dark` variant utility to `app.css` (mirroring the
   existing `-popover` variant pattern)? Or accept the `--background` fill in dark
   mode (consistent with Checkbox, which also uses the fixed gradient)?
2. **§3.5 Disabled unchecked pill** — use `border-readonly-gradient` (50% opacity,
   existing utility) or keep full gradient border with `disabled:opacity-50`?
3. **§4.1 FiltersPanel colored-dot `thumbIcons`** — recolor, remove, or leave?
   (Affects 2 of the 7 call sites.)
4. **Hover affordance on unchecked pill** — currently `hover:bg-muted/40` tints the
   white fill. Replaced with `hover:border-primary-gradient-soft` (tenue gradient
   fill on hover, existing utility) — confirm this is the desired hover state?

## 6. Files touched

| File | Change |
|------|--------|
| `primebrick-fe-v3/src/lib/components/ui/switch/switch.svelte` | Restyle Root + Thumb class strings (§3.1–3.5) |
| `primebrick-fe-v3/src/app.css` | **Maybe** — add `border-primary-gradient-dark` variant ONLY if dark-mode override fails (§5.1) |
| `primebrick-fe-v3/src/lib/components/entity-list-table/panels/FiltersPanel.svelte` | **Maybe** — only if decision §5.3 chooses to recolor/remove the dot |
| `primebrick-fe-v3/src/lib/entity-list/sheets/panels/FiltersPanel.svelte` | **Maybe** — same as above (duplicate) |

No other call site needs changes (the 5 plain usages inherit the new look).

## 7. Acceptance criteria

1. Switch unchecked: pill shows a sky→indigo gradient 1px border (via
   `border-primary-gradient` utility), white fill, and a sky→indigo gradient thumb
   (handler) with white icons.
2. Switch checked: pill shows a sky→indigo gradient fill (via
   `bg-linear-to-br from-sky-400 to-indigo-400`, matching Checkbox/Button),
   transparent border, and a white thumb.
3. Behavior is identical to the Checkbox checked treatment and Button primary CTA
   (same `from-sky-400 to-indigo-400` gradient).
4. All 7 call sites render correctly; the 2 `thumbIcons` usages remain legible
   (per decision §5.3).
5. Dark mode renders correctly (gradient border visible, thumb contrast OK).
6. Disabled state is visually distinct and consistent with the disabled Checkbox.
7. `pnpm run check` passes (no type errors).
8. No E2E `data-testid` attributes are changed or removed.
9. No inline walls of utility classes that reproduce existing utilities — DRY.

## 8. Verification steps (after approval, during execution)

1. Confirm dev server on port 5173 (reuse if running — per `.devin/rules/dev-server.md`).
2. Visit each of the 7 call-site locations in the browser and toggle:
   - Config List boolean row (any Config List page, e.g. Security settings)
   - Config create form "reserved" toggle (`/system/settings/security/create`)
   - Modules page enable/disable (`/system/settings/modules`)
   - AnchorTabs mode switch (any page with AnchorTabs)
   - Preview panel edit-mode toggle (open preview on any entity list)
   - Filters sheet AND/OR connector (open advanced filters on any entity list)
3. Run `pnpm run check`.
4. Visually confirm light + dark mode.
5. Pass the final `switch.svelte` through the `svelte-autofixer` MCP tool (per
   `AGENTS.md` Svelte 5 rule) before considering the change complete.
