# Plan: Restore CSS Colors from Pre-Neutral-Palette Commit

## Problem Analysis

The current branch has incorrect CSS colors because commit `1ffe0af` ("feat(ui): align dark mode with neutral palette") changed the entire dark mode color scheme from sky/slate tint to neutral gray. This affects all UI elements.

### Root Cause
Commit `1ffe0af` changed dark mode colors from sky/slate tint to neutral gray:
- Background: from `222.2 84% 4.9%` (sky tint) to `0 0% 3.9%` (neutral gray)
- All surface colors changed from sky-based to neutral-based
- This affects primary colors, borders, inputs, rings, chrome elements

### Solution
Restore all dark mode CSS variables from commit `1ffe0af^` (pre-neutral-palette) to `src/app.css`.

## Detailed Color Changes Required

### Dark Mode (:root .dark) - Restore from pre-neutral-palette

```css
/* CURRENT (WRONG - neutral gray) */
.dark {
  --background: 0 0% 3.9%;
  --foreground: 0 0% 98%;
  --card: 0 0% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --accent: 0 0% 14.9%;
  --accent-foreground: 0 0% 98%;
  --border: 0 0% 14.9%;
  --input: 0 0% 14.9%;
  --ring: 0 0% 83.1%;
  --sidebar-chrome: 0 0% 12%;
  --topbar-chrome: 0 0% 11%;
}

/* RESTORE TO (CORRECT - sky/slate tint) */
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --popover: 222.2 84% 4.9%;
  --popover-foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 201 90% 34%;
  --ring: 212.7 26.8% 83.9%;
  --sidebar-chrome: 222 47% 12%;
  --topbar-chrome: 222 47% 11%;
}
```

## Implementation Steps

### Step 1: Replace entire .dark block in src/app.css

File: `d:\git\primebrick\primebrick-fe-v3\src\app.css`

Replace lines 119-178 (the entire `.dark` block) with:

```css
  .dark {
    color-scheme: dark;
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;

    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;

    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;

    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;

    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;

    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;

    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;

    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;

    /* Slightly lifted vs dark `destructive`; still clearly red, not a bright scarlet chip. */
    --critical: 0 64% 38%;
    --critical-foreground: 210 40% 98%;

    --success: 142.1 70.6% 45.3%;
    --success-foreground: 222.2 84% 4.9%;
    --warning: 47.9 95.8% 53.1%;
    --warning-foreground: 222.2 84% 4.9%;
    --info: 199 89% 60%;
    --info-foreground: 222.2 84% 4.9%;

    --border: 217.2 32.6% 17.5%;
    /* Dark counterpart to light `sky-200` input border (~sky-800); also feeds `dark:bg-input/30` on inputs & outline buttons. */
    --input: 201 90% 34%;
    --ring: 212.7 26.8% 83.9%;

    /* Sidebar tokens (match shadcn-svelte docs "first example"). */
    --sidebar: 0.205 0 0;
    --sidebar-foreground: 0.985 0 0;
    --sidebar-primary: 0.488 0.243 264.376;
    --sidebar-primary-foreground: 0.985 0 0;
    --sidebar-accent: 0.269 0 0;
    --sidebar-accent-foreground: 0.985 0 0;
    /* Border: use a subtle neutral edge (not raw L=1 white, which reads as a harsh line in dark). */
    --sidebar-border: 0.32 0 0;
    --sidebar-ring: 0.439 0 0;

    /* Dark-mode chrome (keep slightly different from background). */
    --sidebar-chrome: 222 47% 12%;
    --sidebar-chrome-foreground: 210 40% 98%;
    /* Topbar: slightly lifted from page background so the bar reads clearly in dark. */
    --topbar-chrome: 222 47% 11%;
    --topbar-chrome-foreground: 210 40% 98%;
  }
```

### Step 2: Update warning card colors (if needed)

The warning card colors also changed in commit 1ffe0af. Check if current warning cards match the old colors:

Current (develop):
```css
.pb-shell-error-card--warning {
  border: 1px solid hsl(38, 92%, 84%) !important;
  background: hsl(38, 92%, 97%) !important;
  color: hsl(38, 92%, 45%) !important;
}
```

Pre-neutral-palette:
```css
.pb-shell-error-card--warning {
  border: 1px solid hsl(49, 91%, 84%) !important;
  background: hsl(49, 100%, 97%) !important;
  color: hsl(31, 92%, 45%) !important;
}
```

If needed, update these as well.

## Acceptance Criteria

- Dark mode background is sky tint (`222.2 84% 4.9%`) not neutral gray
- Primary color in dark mode is correct (`210 40% 98%`)
- All borders, inputs, and rings use sky/slate tint instead of neutral gray
- Dropdown separators have proper background color
- Focus rings on inputs are correct color
- All UI elements match pre-neutral-palette appearance
