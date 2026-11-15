# Plan: Gradient Background for Primary Buttons (Test on ACCEDI)

## Objective

Apply a gradient background to primary buttons matching the PB logo gradient
(oblique direction: top-left → bottom-right). As a first step, test the effect
**only on the ACCEDI button** of the login page before promoting it to the
standard `default` button variant.

## Analysis (real-time evidence)

### 1. PB Logo gradient

Source: `primebrick-fe-v3/static/logo-full-dark.svg`

```svg
<linearGradient id="pb-text-grad-dark-full" x1="36" y1="0" x2="170" y2="32"
  gradientUnits="userSpaceOnUse">
  <stop offset="0" stop-color="#38bdf8"/>   <!-- sky-400 -->
  <stop offset="1" stop-color="#818cf8"/>   <!-- indigo-400 -->
</linearGradient>
```

- **Text gradient**: `#38bdf8` (sky-400) → `#818cf8` (indigo-400)
- **Direction**: top-left → bottom-right (oblique, `x1=36 y1=0` → `x2=170 y2=32`)
- **Icon bricks** (for reference): `#0ea5e9` (sky-500) → `#4f46e5` (indigo-600),
  same diagonal direction.

### 2. Tailwind version

- `tailwindcss`: **4.3.2** (Tailwind v4)
- In Tailwind v4 the gradient utility is `bg-linear-to-br` (the legacy
  `bg-gradient-to-br` still works as a deprecated alias).

### 3. Current primary button (default variant)

Source: `primebrick-fe-v3/src/lib/components/ui/button/button.svelte` (lines 11-12)

```ts
default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
```

Theme tokens (`primebrick-fe-v3/src/app.css`):
- **Light mode**: `--primary: 200 98% 39%` (sky-700-ish), `--primary-foreground: 210 40% 98%` (near-white)
- **Dark mode**: `--primary: 210 40% 98%` (near-white), `--primary-foreground: 222.2 47.4% 11.2%` (dark navy) — **inverted!**

> ⚠️ Important: in dark mode the primary button is white background with dark
> text. A sky→indigo gradient with white text works in both modes, but we must
> force `text-white` to override the dark-mode `text-primary-foreground`.

### 4. ACCEDI button location

Source: `primebrick-fe-v3/src/lib/components/auth/LoginForm.svelte` (line 134)

```svelte
<Button type="submit" class="w-full" disabled={$submitting}>
  {#if $submitting}
    <Spinner class="mr-2" />
  {/if}
  {$submitting ? $t('login.buttonLoading') : $t('login.button')}
</Button>
```

## Implementation (test phase — ACCEDI only)

### Change

File: `primebrick-fe-v3/src/lib/components/auth/LoginForm.svelte` (line 134)

**Before:**
```svelte
<Button type="submit" class="w-full" disabled={$submitting}>
```

**After:**
```svelte
<Button
  type="submit"
  class="w-full bg-linear-to-br from-sky-400 to-indigo-400 text-white shadow-sm hover:from-sky-500 hover:to-indigo-500 hover:brightness-105"
  disabled={$submitting}
>
```

### Rationale for the classes

| Class | Purpose |
|-------|---------|
| `bg-linear-to-br` | Oblique gradient, top-left → bottom-right (Tailwind v4 syntax) |
| `from-sky-400 to-indigo-400` | Matches logo text gradient (`#38bdf8` → `#818cf8`) |
| `text-white` | Overrides `text-primary-foreground` (needed for dark mode where foreground is dark) |
| `shadow-sm` | Slightly stronger shadow to give depth to the gradient |
| `hover:from-sky-500 hover:to-indigo-500` | Visible hover state (the default `hover:bg-primary/90` is invisible under a gradient) |
| `hover:brightness-105` | Subtle brightness lift on hover |

### Why `cn()` / tailwind-merge handles this correctly

- `bg-linear-to-br` is a **background-image** utility; `bg-primary` is a
  **background-color** utility. tailwind-merge keeps both (they don't conflict),
  and the gradient renders on top of the solid color. ✅
- `text-white` overrides `text-primary-foreground` (same group). ✅
- `hover:from-*` / `hover:to-*` add new hover stops; the old `hover:bg-primary/90`
  remains but is invisible under the gradient. Acceptable for the test. ✅

### What is NOT changed

- `button.svelte` — the `default` variant stays unchanged (this is a test only).
- No other buttons are affected.
- No CSS file changes.
- No i18n changes (button label unchanged).

## Acceptance criteria (test phase)

1. The ACCEDI button on the login page shows a sky-400 → indigo-400 diagonal
   gradient (top-left → bottom-right), visually consistent with the PB logo.
2. White text is readable on the gradient in both light and dark mode.
3. Hover produces a visible darkening (sky-500 → indigo-500) + slight brightness lift.
4. The button keeps its full width (`w-full`) and disabled state behaviour.
5. No other button in the app is affected.
6. `pnpm run check` passes with no new type errors.

## Future (out of scope for this test — awaiting approval)

Once the visual is approved:
- Promote the gradient into the `default` variant in `button.svelte`, replacing
  `bg-primary ... hover:bg-primary/90` with the gradient classes.
- Handle dark mode explicitly (decide whether to keep the same gradient or use
  a dark-mode-specific variant).
- Audit all usages of `<Button>` (default variant) across the app for
  contrast/readability on gradient backgrounds.
