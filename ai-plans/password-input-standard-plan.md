# Plan: Password Input Visibility Toggle Standard

**Date:** 2026-08-21
**Scope:** FE (`primebrick-fe-v3`) only
**Mode:** PLAN — awaiting `PROCEED` keyword before any code change.

---

## 1. Objective

1. **Fix the CSS visibility issue** where the eye toggle icon on
   `Password.PasswordInput` is present in the DOM but not visually
   visible on the ChangePasswordCard.
2. **Audit all password inputs** in the codebase to ensure they all use
   `Password.PasswordInput` (which includes the eye toggle).
3. **Fix the one outlier** (`email-providers/+page.svelte`) that uses a
   plain `Input type="password"` without the toggle.
4. **Codify the standard** in Devin rules and agent docs: all password
   inputs MUST use `Password.PasswordInput`, never plain `Input
   type="password"`.

---

## 2. Empirical Evidence

### 2.1 PasswordInput component architecture (CONFIRMED)

The password component system lives in `src/lib/components/ui/password/`:

- **`index.ts`** — exports `Root`, `Input`, `Strength`, `Copy`,
  `ToggleVisibility`, `PasswordInputField` (aliased as `PasswordInput`).
- **`password-input-field.svelte`** — the main component used everywhere.
  Wraps `Password.Root` + `Password.Input` + `Password.ToggleVisibility`.
  The toggle is **automatically included** — callers do NOT need to add
  it manually.
- **`password-toggle-visibility.svelte`** — renders a `<Toggle>` button
  with `EyeIcon` (when hidden) / `EyeOffIcon` (when visible). Uses
  `inputTrailingIconButtonClasses` for positioning (`absolute top-1/2
  right-0 -translate-y-1/2 size-7`).
- **`password-input.svelte`** — the actual `<input>` element. Dynamically
  switches `type` between `"password"` and `"text"` based on
  `state.root.opts.hidden.current`. Adds `pr-9` padding when toggle is
  mounted to make room for the eye icon.
- **`password.svelte`** — root wrapper, renders `<div class="flex
  flex-col gap-2">`.
- **`password.svelte.ts`** — state management (Context-based). Tracks
  `hidden`, `toggleMounted`, `copyMounted`, `strengthMounted`, `tainted`.

### 2.2 The eye icon IS in the DOM but NOT visible (CONFIRMED via Playwright)

**Root cause identified empirically using Playwright browser inspection.**

The `<button>` element with the eye SVG is present in the DOM with
correct computed styles (`visibility: visible`, `opacity: 1`, `color:
rgb(100, 116, 139)` — a visible slate gray). The SVG itself is also
`display: block`, `visibility: visible`, `stroke: rgb(100, 116, 139)`.

**The problem is z-index stacking.** Playwright computed-style inspection
revealed:

| Element | `position` | `z-index` | Right edge | Left edge |
|---------|-----------|-----------|------------|-----------|
| `<input>` | `relative` | **`1`** | 1064.5px | — |
| `<button>` (eye) | `absolute` | **`auto`** (0) | 1064.5px | 1036.5px |

- `buttonCovered: true` — the input's right edge (1064.5px) extends past
  the button's left edge (1036.5px) by 28px (the entire button width).
- The input has `z-index: 1` which places it **above** the toggle button
  (`z-index: auto` = 0). The input's background covers the button.
- The `pr-9` (36px) padding on the input creates visual space inside the
  input, but the input **element itself** still extends to its full width
  and its background paints over the button.

**This is a universal issue, not specific to the credentials page.**
The same overlap was confirmed on the LoginForm dialog password field
(`overlap: true`, same `z-index: 1` on input, same `z-index: auto` on
button). The eye icon is covered everywhere — it was just less noticeable
on smaller inputs like the LoginForm.

### 2.3 Root cause source (CONFIRMED)

**File:** `src/lib/components/ui/input/input.svelte` (line 45)

```svelte
class={cn(
  "selection:bg-primary selection:text-primary-foreground ring-offset-background
   placeholder:text-muted-foreground relative z-1 flex h-9 w-full min-w-0
   rounded-md border-primary-gradient px-3 py-1 text-base shadow-xs
   transition-all outline-hidden ...",
  ...
)}
```

The Input component has `relative z-1` hardcoded. This `z-1` puts every
input above sibling absolutely-positioned elements (like the eye toggle
button) within the same stacking context.

### 2.4 The fix

The toggle button needs `z-10` (or any value > 1) to appear above the
input. The fix goes in `password-toggle-visibility.svelte` by adding
`z-10` to the button's class, ensuring the eye icon is always above the
input regardless of the input's `z-1`.

This is a **one-line fix** in the password toggle component — no changes
needed to the Input component (which is used in many other contexts).

### 2.3 All password inputs in the codebase (CONFIRMED — 11 total)

| # | File | Field | Uses PasswordInput? | Has eye toggle? |
|---|------|-------|---------------------|-----------------|
| 1 | `LoginForm.svelte` | password | ✅ Yes | ✅ Yes (works) |
| 2 | `ChangePasswordCard.svelte` | current_password | ✅ Yes | ⚠️ In DOM, not visible |
| 3 | `ChangePasswordCard.svelte` | new_password | ✅ Yes | ⚠️ In DOM, not visible |
| 4 | `ChangePasswordCard.svelte` | confirm_password | ✅ Yes | ⚠️ In DOM, not visible |
| 5 | `ChangePasswordDialog.svelte` | new password | ✅ Yes | ✅ Yes |
| 6 | `ChangePasswordDialog.svelte` | confirm password | ✅ Yes | ✅ Yes |
| 7 | `welcome/+page.svelte` | new_password | ✅ Yes | ✅ Yes |
| 8 | `welcome/+page.svelte` | confirm_password | ✅ Yes | ✅ Yes |
| 9 | `security/+page.svelte` | oidcClientSecret | ✅ Yes | ✅ Yes |
| 10 | `users/create/+page.svelte` | password | ✅ Yes | ✅ Yes |
| 11 | `email-providers/+page.svelte` | api_key | ❌ No (plain Input) | ❌ No |

**10 out of 11** already use `Password.PasswordInput`. The only outlier
is `email-providers/+page.svelte` which uses `<Input type="password">`.

### 2.4 LoginForm vs ChangePasswordCard — identical pattern (CONFIRMED)

Both use the same structure:
```svelte
<FormField form={superFormObj} name="...">
  <FormControl>
    {#snippet children({ props })}
      <div class="space-y-2">
        <FormLabel for={props.id}>...</FormLabel>
        <Password.PasswordInput
          {...props}
          bind:value={$form...}
          placeholder={...}
        />
        <TranslatedFormFieldErrors />
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

The LoginForm eye toggle works. The ChangePasswordCard eye toggle is in
the DOM but not visible. The code pattern is identical — the issue must
be CSS/contextual, not structural.

### 2.5 inputTrailingIconButtonClasses (CONFIRMED)

**File:** `src/lib/components/ui/input/input-chrome.ts`

```ts
export const inputTrailingIconColorClasses =
  'inline-flex items-center justify-center p-0.5 ' +
  'text-muted-foreground hover:text-foreground hover:bg-transparent ' +
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ' +
  'transition-colors cursor-pointer';

export const inputTrailingIconButtonClasses =
  'absolute top-1/2 right-0 -translate-y-1/2 size-7 min-w-0 ' +
  inputTrailingIconColorClasses;
```

The button uses `text-muted-foreground` as the base color. The SVG
inherits via `stroke="currentColor"`.

---

## 3. Implementation Plan (atomic, ordered)

### Step 1 — Fix the eye icon z-index issue
**File:** `src/lib/components/ui/password/password-toggle-visibility.svelte`

Add `z-10` to the toggle button's class so it appears above the input
(which has `z-1` from the Input component).

Current (line 18-23):
```svelte
class={cn(
  inputTrailingIconButtonClasses,
  'data-[state=on]:bg-transparent',
  {
    'right-9 max-w-6': state.root.passwordState.copyMounted
  },
  className
)}
```

Fix:
```svelte
class={cn(
  inputTrailingIconButtonClasses,
  'z-10',
  'data-[state=on]:bg-transparent',
  {
    'right-9 max-w-6': state.root.passwordState.copyMounted
  },
  className
)}
```

This is a one-line addition (`'z-10'`) that fixes the eye icon
visibility on ALL password inputs in the codebase (11 total), not just
the credentials page.

### Step 2 — Fix the email-providers outlier
**File:** `src/routes/(app)/system/settings/email-providers/+page.svelte`

Replace:
```svelte
<Input id="api_key" type="password" bind:value={formData.api_key}
  placeholder={...} />
```
With:
```svelte
<Password.PasswordInput
  id="api_key"
  bind:value={formData.api_key}
  placeholder={...}
/>
```

Add the import: `import * as Password from '$lib/components/ui/password';`

### Step 3 — Codify the standard
**File (new):** `.devin/rules/password-input-standard.md`

Always-on Devin rule:
- ALL password-type inputs MUST use `Password.PasswordInput` from
  `$lib/components/ui/password`.
- NEVER use `<Input type="password">` for password fields — the plain
  Input component does not include the visibility toggle.
- `Password.PasswordInput` automatically includes the eye toggle
  (`ToggleVisibility` with `EyeIcon`/`EyeOffIcon`). Do NOT add it
  manually.
- The toggle is accessibility-compliant: `aria-label` switches between
  "Show password" and "Hide password", `tabindex="-1"` (not in tab
  order, click/focus only).
- For OTP/code inputs (6-digit codes), use plain `Input` with
  `type="text" inputmode="numeric" autocomplete="one-time-code"` — these
  are NOT password fields and should NOT use `Password.PasswordInput`.

**File (edit):** `docs/ai/patterns.md`

Add a "Password inputs" subsection under the Forms section:
- Always use `Password.PasswordInput` for password fields.
- The component includes an eye toggle for show/hide.
- Never use `<Input type="password">`.
- OTP fields are NOT password fields — use plain `Input` with
  `inputmode="numeric"`.

### Step 4 — Verify
- `pnpm run check` — must pass with 0 errors.
- Manual: navigate to `/system/settings/credentials`, verify the eye
  icon is visible on all 3 password fields and toggles work.
- Manual: navigate to `/system/settings/email-providers`, verify the
  API key field now has the eye toggle.
- Manual: verify LoginForm still works (no regression).

---

## 4. Acceptance Criteria

1. ✅ Eye toggle icon is **visually visible** on all 3 password fields
   in the ChangePasswordCard.
2. ✅ Clicking the eye icon toggles between hidden/visible password text.
3. ✅ `email-providers/+page.svelte` uses `Password.PasswordInput`
   instead of plain `Input type="password"`.
4. ✅ No regression on LoginForm, ChangePasswordDialog, welcome page,
   security page, users/create page.
5. ✅ `pnpm run check` passes with 0 errors.
6. ✅ `.devin/rules/password-input-standard.md` exists with the standard.
7. ✅ `docs/ai/patterns.md` documents the password input standard.

---

## 5. Files Touched

**FE — edited:**
- `src/lib/components/ui/password/password-toggle-visibility.svelte`
  (add `z-10` to fix eye icon visibility)
- `src/routes/(app)/system/settings/email-providers/+page.svelte`
  (replace plain `Input type="password"` with `Password.PasswordInput`)
- `docs/ai/patterns.md`

**FE — new:**
- `.devin/rules/password-input-standard.md`

**No BE changes.**
**No i18n changes.**

---

## 6. Open Questions

- **Q1:** Is the eye icon invisible on ALL `Password.PasswordInput`
  instances on the credentials page, or only on specific fields? The
  user said "alle input" (all), suggesting all 3.
- **Q2:** Does the eye icon work on the LoginForm? The user said "forse
  nella login dialog" suggesting it might work there. If it works on
  LoginForm but not ChangePasswordCard, the issue is contextual to the
  card/credentials page.
- **Q3:** Could the issue be that the `Password.Root` wrapper (`<div
  class="flex flex-col gap-2">`) inside the FormField structure creates
  a layout conflict? The LoginForm has the same structure, so this is
  unlikely, but should be verified.
