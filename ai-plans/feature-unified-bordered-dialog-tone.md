# Feature Plan: Unified Bordered Dialog with `tone` attribute

> Status: DRAFT — awaiting user approval (PROCEED keyword).
> Repo: `primebrick-fe-v3`
> Date: 2026-07-24 (re-verified against current code)
> Mode: PLAN (no source code changes until approval)

---

## 1. Objective

Create a **single reusable dialog component** that unifies the current dialog
visual strategies (top-strip `BorderedDialog`, full-gradient-border
`SessionExpiredDialog`/`AuthMethodsPromptDialog`) behind one API driven by two
orthogonal attributes:

- **`severity`** (renamed from `color`): `primary | info | success | warning | destructive | neutral`
  — the semantic color of the dialog. `primary` is NEW and uses the brand gradient
  (sky-400 → indigo-400) instead of a solid `bg-primary`.
- **`tone`**: `""` (default, empty) | `"soft"`.
  - `""`  → **top-only** colored/gradient accent (current `BorderedDialog` look).
  - `"soft"` → **full-around** gradient border (current `SessionExpired`/`AuthMethodsPrompt` look),
    valid for ALL severities.

Then migrate every existing dialog to the unified component so the look'n'feel can
be changed centrally with minimal effort.

---

## 2. Empirical findings (re-verified 2026-07-24 against current code)

### 2.1 Existing dialog components & their strategies (CURRENT state)

| File | Strategy | Evidence |
|------|----------|----------|
| `src/lib/components/ui/dialog-bordered.svelte` | Top colored STRIP `h-2 w-full rounded-t-xl {colorClass}` (NOT a border). `color` prop: primary/info/warning/success/destructive/neutral. **UNCHANGED** since first plan. | Lines 45-59 `colorClass`, line 67 the strip div. |
| `src/lib/components/auth/SessionExpiredDialog.svelte` | `Dialog.Content` direct + `border-primary-gradient-popover` (full gradient border, popover fill). **UNCHANGED.** | Line 34. |
| `src/lib/components/auth/AuthMethodsPromptDialog.svelte` | **NEW** (replaced `PasskeyPromptDialog`). `Dialog.Content` direct + `border-primary-gradient-popover` (full gradient border) + persistent (no close, `escapeKeydownBehavior="ignore"`, `onInteractOutside` bump). Unified passkey+MFA enforcer. | Lines 99-105. |
| `src/lib/components/auth/MfaStepUpDialog.svelte` | **NEW**. `Dialog.Content` direct, `sm:max-w-md`, NO border accent (plain). Step-up authorization dialog (re-verify identity before destructive actions). **NOT mounted in any route** — only referenced in a doc-comment of `useMfaStepUp.svelte.ts`. | Lines 115-116; composable at `src/lib/composables/useMfaStepUp.svelte.ts`. |
| `src/lib/components/auth/MfaManagement.svelte` | **NEW**. Contains 2 inline `DialogContent` (enrollment QR + delete-confirm), both `sm:max-w-md`, NO border accent (plain). Mounted in `profile/+page.svelte`. | Lines 266-267, 355-356. |
| `src/lib/components/auth/MfaEnrollmentSection.svelte` | **NEW**. Inline SECTION (NOT a dialog) rendered inside `AuthMethodsPromptDialog` when user picks MFA. Already wired. Not a migration target (it is content inside the enforcer dialog). | Rendered at `AuthMethodsPromptDialog.svelte` line 168. |
| `src/lib/components/auth/MfaChallenge.svelte` | **NEW**. Inline component in `LoginForm` (TOTP challenge). NOT a dialog. Out of scope. | `LoginForm.svelte` line 136. |
| `src/lib/components/ui/rfc-error-dialog.svelte` | `BorderedDialog` color="destructive", full-screen layout. **UNCHANGED.** | Lines 107-112. |
| 8 entity-list-table dialogs | `BorderedDialog` with destructive/warning/primary. **UNCHANGED.** | See §2.3. |
| `src/lib/components/ui/command/command-dialog.svelte` | `Dialog.Content` direct, command palette. **OUT OF SCOPE.** | Lines 35-41. |

> **Key change since first plan**: `PasskeyPromptDialog.svelte` was DELETED and
> replaced by `AuthMethodsPromptDialog.svelte`. The `(app)/+layout.svelte` now
> mounts `<AuthMethodsPromptDialog />` (line 68) instead of `<PasskeyPromptDialog />`.

### 2.2 Dead code / inconsistencies found (re-confirmed)

- **DEAD CODE**: `borderColor` derived in `dialog-bordered.svelte` (lines 29-43) is
  computed but NEVER referenced in the template. Only `colorClass` is used. The
  `border-t-primary`/`border-t-info`/... classes have no effect (no `border-width`
  is set; `Dialog.Content` uses `ring-1`, not border). **Action: remove.**
- **DEAD MOUNT**: `MfaStepUpDialog.svelte` is not rendered by any route. The
  composable `useMfaStepUp.svelte.ts` is ready (sets `dialogOpen`, exposes
  `pendingAction`/`pendingTargetResource`/`handleAuthorized`), but no consumer
  renders `<MfaStepUpDialog bind:open={stepUp.dialogOpen} ... />`. Migrating it to
  the unified component keeps it consistent for when routes wire it; **flagging
  the missing mount as a separate follow-up** (out of this plan's scope to wire it).
- **Inconsistency**: `BorderedDialog` `primary` uses solid `bg-primary` for the top
  strip, while every other "primary" surface in the app (default Button, outline
  button border, Checkbox checked) uses the **sky→indigo gradient**. The user
  explicitly wants `primary` to be gradient.
- **Inconsistency**: `SessionExpiredDialog` title is `text-destructive` (red) even
  though the dialog border is the primary gradient — mixed semantics.
- **Missing CSS utilities**: gradient-border utilities exist only for `primary`
  (`border-primary-gradient`, `-popover`, `-soft`) and `destructive`
  (`border-destructive-gradient`). There are **NO** gradient-border utilities for
  `info`, `success`, `warning`, `neutral`. These are required for `tone="soft"` to
  work across all severities. **Re-confirmed: still missing.**

### 2.3 Full usage inventory (re-verified)

**BorderedDialog consumers** (10 files, all import `dialog-bordered.svelte`):

1. `src/lib/components/ui/rfc-error-dialog.svelte` — `color="destructive"`, full-screen.
2. `src/lib/components/entity-list-table/dialogs/DeleteDialog.svelte` — `color="destructive"`.
3. `src/lib/components/entity-list-table/dialogs/BulkDeleteDialog.svelte` — `color="destructive"`.
4. `src/lib/components/entity-list-table/dialogs/RestoreDialog.svelte` — `color="warning"`.
5. `src/lib/components/entity-list-table/dialogs/BulkRestoreDialog.svelte` — `color="warning"`.
6. `src/lib/components/entity-list-table/dialogs/DuplicateDialog.svelte` — `color="warning"`.
7. `src/lib/components/entity-list-table/dialogs/HtmlExportDialog.svelte` — `color="warning"`.
8. `src/lib/components/entity-list-table/dialogs/ExportDialog.svelte` — `color="warning"`.
9. `src/lib/components/entity-list-table/dialogs/ExportPreviewDialog.svelte` — `color="primary"`, full-screen.
10. `src/lib/components/entity-list-table/dialogs/ChangePasswordDialog.svelte` — `color="warning"`.

**Direct `Dialog.Content` (non-bordered) consumers to migrate:**

11. `src/lib/components/auth/SessionExpiredDialog.svelte` — primary gradient border → `severity="primary" tone="soft"`.
12. `src/lib/components/auth/AuthMethodsPromptDialog.svelte` — primary gradient border, persistent → `severity="primary" tone="soft"` + persistent props.
13. `src/lib/components/auth/MfaStepUpDialog.svelte` — plain, auth/security family → `severity="primary" tone="soft"` (per user: auth-flow dialogs are soft primary). NOT currently mounted.
14. `src/lib/components/auth/MfaManagement.svelte` — 2 inline `DialogContent`:
    - 14a. Enrollment QR dialog → `severity="primary" tone="soft"` (auth enrollment family).
    - 14b. Delete-confirm dialog → `severity="destructive"` (coherent with DeleteDialog/BulkDeleteDialog).

**Hosts / mount points (no visual change, just wiring — re-verified):**

- `src/routes/+layout.svelte` — mounts `<SessionExpiredDialog />` (line 20). **UNCHANGED.**
- `src/routes/(app)/+layout.svelte` — mounts `<AuthMethodsPromptDialog />` (line 68). **CHANGED** (was PasskeyPromptDialog).
- `src/lib/components/entity-list-table/components/EntityListTableDialogs.svelte` — hosts the 8 entity dialogs. **UNCHANGED.**
- `src/routes/(app)/system/settings/modules/+page.svelte` — uses `<DeleteDialog>` directly (lines 355-361). **UNCHANGED.**
- `src/routes/(app)/system/settings/users/+page.svelte` — uses `<ChangePasswordDialog>` (lines 627-631). **UNCHANGED.**
- `src/routes/(app)/system/settings/profile/+page.svelte` — renders `<PasskeyEnrollment />` and `<MfaManagement />` (lines 553, 556). **NEW.**

### 2.4 Existing `tone` attribute precedent (re-confirmed)

`src/lib/components/ui/checkbox/checkbox.svelte` defines a `tone` prop
(`CheckboxTone = "primary" | "destructive" | "warning"`) using
`data-[state=checked]:bg-linear-to-br from-* to-*` gradients. This establishes
`tone` as an accepted naming convention in the codebase for color intent. The new
dialog `tone` reuses the same name but with a different semantic axis
(`""` vs `"soft"` = border style, not color), keeping `severity` for color.

### 2.5 CSS gradient utilities (app.css) — CURRENT state (re-verified)

```
border-primary-gradient          → full gradient border, bg-background fill
border-primary-gradient-popover  → full gradient border, bg-popover fill   ← used by SessionExpired/AuthMethodsPrompt
border-primary-gradient-soft     → gradient border + tenue gradient bg     ← used by soft-primary buttons
border-readonly-gradient         → grey gradient border
border-destructive-gradient      → red gradient border (bg-background fill)
hover-border-primary-gradient-soft → hover variant for toggles
```

**CHANGE since first plan**: `dialog-bump` is now a regular class `.dialog-bump`
(NOT `@utility dialog-bump`) and the animation changed from a shake (translateX)
to a **scale pulse** (`scale: 1 → 1.03 → 1`, 0.3s ease-out, `!important`). See
`app.css` lines 168-175. The `@source inline(...)` directive still lists
`dialog-bump` so it is emitted. The plan must preserve this class name as-is.

**NEW observation**: the gradient-border pattern has SPREAD to non-dialog
components since the first plan — `VersionsPanel.svelte`, `login/+page.svelte`
(Alert + Card), `textarea.svelte`, `input.svelte`, `text-input.svelte`,
`combo-select.svelte`, `SearchBar.svelte`, `menu-row-chrome.ts`,
`ViewModeToggle.svelte`, `DeletionFilterToggle.svelte`. This reinforces the value
of centralizing dialog borders via reusable utilities (the new
`border-*-gradient-popover` utilities will benefit future components too).

Gradient color pairs (from `button.svelte` variants, the canonical source):
- primary:   `from-sky-400 to-indigo-400`  (top strip / border)
- destructive: `from-rose-400 to-red-600`
- warning:   `from-yellow-300 to-yellow-500`
- success:   (no button variant yet — propose `from-emerald-400 to-emerald-600`)
- info:      (no button variant yet — propose `from-sky-400 to-blue-600`)
- neutral:   `from-gray-400 to-gray-500` (matches `border-readonly-gradient`)

### 2.6 Dialog primitive structure (for the unified wrapper) — re-confirmed

- `Dialog.Content` (`dialog-content.svelte`): `bg-popover text-popover-foreground ring-1 rounded-xl p-4`,
  supports `showCloseButton`, `portalProps`, and spreads `...restProps` to the
  bits-ui `DialogPrimitive.Content` (so `escapeKeydownBehavior`, `onInteractOutside`,
  etc. pass through).
- `Dialog.Header`: `gap-2 flex flex-col`.
- `Dialog.Footer`: `bg-muted/50 -mx-4 -mb-4 rounded-b-xl border-t p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`.
- The current `BorderedDialog` wraps `Dialog.Content` with `p-0` and injects the
  strip + an inner `p-4` wrapper. The unified component must preserve this
  structure for `tone=""` and switch to a border-based approach for `tone="soft"`.

---

## 3. Design: the unified component

### 3.1 File

`src/lib/components/ui/dialog-bordered.svelte` — **refactor in place** (keep the
same path/import name so consumers only need to add `tone`/rename `color`→`severity`).

### 3.2 Props (new API)

```ts
type DialogSeverity = 'primary' | 'info' | 'success' | 'warning' | 'destructive' | 'neutral';
type DialogTone = '' | 'soft';

let {
  open = $bindable(),
  severity = 'primary',      // renamed from `color`; default primary
  tone = '',                 // NEW: '' (top accent) | 'soft' (full gradient border)
  showCloseButton = true,
  class: className = '',
  children,
  ...restProps               // NEW: forwarded to Dialog.Content (escapeKeydownBehavior, onInteractOutside, etc.)
}: {
  open?: boolean;
  severity?: DialogSeverity;
  tone?: DialogTone;
  showCloseButton?: boolean;
  class?: string;
  children: Snippet;
  [key: string]: unknown;    // allow pass-through of bits-ui Content props
} = $props();
```

**Backward-compat shim**: accept the legacy `color` prop as an alias for `severity`
during migration (deprecation warning in dev console), then remove after all
consumers are migrated. This keeps each migration step atomic and lint-clean.

### 3.3 Visual matrix

| severity | tone="" (top accent) | tone="soft" (full border) |
|----------|----------------------|---------------------------|
| primary | top strip: gradient `from-sky-400 to-indigo-400` (NEW, replaces solid `bg-primary`) | `border-primary-gradient-popover` (existing) |
| info | top strip: gradient `from-sky-400 to-blue-600` | NEW `border-info-gradient-popover` |
| success | top strip: gradient `from-emerald-400 to-emerald-600` | NEW `border-success-gradient-popover` |
| warning | top strip: gradient `from-yellow-300 to-yellow-500` (animated pan, current) | NEW `border-warning-gradient-popover` |
| destructive | top strip: gradient `from-rose-400 to-red-600` (animated pan, current) | NEW `border-destructive-gradient-popover` |
| neutral | top strip: `bg-neutral-500` (current) | NEW `border-neutral-gradient-popover` (grey) |

### 3.4 Implementation strategy (two rendering modes)

**`tone=""` (top accent)** — preserve current `BorderedDialog` DOM:
```svelte
<Dialog.Root {open} onOpenChange={(e) => open = e}>
  <Dialog.Content class={cn('p-0', className)} {showCloseButton} {...restProps}>
    <div class="h-2 w-full rounded-t-xl {topStripClass}"></div>
    <div class="p-4">
      {@render children()}
    </div>
  </Dialog.Content>
</Dialog.Root>
```
where `topStripClass` is a derived map severity → gradient/solid class. `primary`
now uses `bg-linear-to-br from-sky-400 to-indigo-400` (gradient), aligning with
the default Button.

**`tone="soft"` (full gradient border)** — apply the gradient-border utility
directly on `Dialog.Content` (no inner strip, keep `p-4` from `Dialog.Content`
base):
```svelte
<Dialog.Root {open} onOpenChange={(e) => open = e}>
  <Dialog.Content class={cn(softBorderClass, className)} {showCloseButton} {...restProps}>
    {@render children()}
  </Dialog.Content>
</Dialog.Root>
```
where `softBorderClass` is severity → `border-<sev>-gradient-popover`.

This exactly reproduces the current `SessionExpired`/`AuthMethodsPrompt`
full-gradient-border look for `severity="primary" tone="soft"`, and generalizes
it to every severity.

### 3.5 Persistent-dialog support (AuthMethodsPrompt)

The unified component forwards `...restProps` to `Dialog.Content`, so
`AuthMethodsPromptDialog` keeps its persistent behavior by passing:
`showCloseButton={false}`, `escapeKeydownBehavior="ignore"`,
`onInteractOutside={handleInteractOutside}`, and the `dialog-bump` class via
`class`. No special-casing inside the unified component. The `.dialog-bump` class
(scale pulse) stays as-is in `app.css`.

---

## 4. CSS additions (app.css)

Add the missing gradient-border utilities for the `soft` tone, following the
existing `border-primary-gradient-popover` pattern (double-background trick,
`--popover` fill). Add to `src/app.css` after `border-destructive-gradient`:

```css
@utility border-info-gradient-popover {
  border: 1px solid transparent;
  background:
    linear-gradient(hsl(var(--popover)), hsl(var(--popover))) padding-box,
    linear-gradient(to bottom right, #38bdf8, #2563eb) border-box;
}
@utility border-success-gradient-popover {
  border: 1px solid transparent;
  background:
    linear-gradient(hsl(var(--popover)), hsl(var(--popover))) padding-box,
    linear-gradient(to bottom right, #34d399, #059669) border-box;
}
@utility border-warning-gradient-popover {
  border: 1px solid transparent;
  background:
    linear-gradient(hsl(var(--popover)), hsl(var(--popover))) padding-box,
    linear-gradient(to bottom right, #fde047, #eab308) border-box;
}
@utility border-destructive-gradient-popover {
  border: 1px solid transparent;
  background:
    linear-gradient(hsl(var(--popover)), hsl(var(--popover))) padding-box,
    linear-gradient(to bottom right, #fb7185, #dc2626) border-box;
}
@utility border-neutral-gradient-popover {
  border: 1px solid transparent;
  background:
    linear-gradient(hsl(var(--popover)), hsl(var(--popover))) padding-box,
    linear-gradient(to bottom right, #9ca3af, #6b7280) border-box;
}
```

Also update the `@source inline(...)` directive at the top of `app.css` to include
the new class names so Tailwind v4 emits them:
```
@source inline("{border-primary-gradient,border-primary-gradient-popover,border-primary-gradient-soft,border-readonly-gradient,border-destructive-gradient,border-info-gradient-popover,border-success-gradient-popover,border-warning-gradient-popover,border-destructive-gradient-popover,border-neutral-gradient-popover,dialog-bump,hover-border-primary-gradient-soft}");
```

> Note: the gradient color stops are hardcoded hex (matching the existing
> `border-primary-gradient-popover` style which uses `#38bdf8, #818cf8`). This is
> the established convention in this file; we follow it for consistency. If the
> team prefers token-driven colors, that's a separate refactor of all gradient
> utilities (out of scope here).

---

## 5. Migration plan (atomic, ordered)

Each step is a self-contained, lint-clean change. Run `pnpm run check` after each.

### Step 0 — CSS utilities (no component change)
- Add the 5 new `border-*-gradient-popover` utilities to `app.css`.
- Update `@source inline(...)` to include them.
- **Verify**: `pnpm run check` (no component uses them yet, but classes must be
  emitted).

### Step 1b — Add `success` and `info` Button variants + tone + soft compounds

Add full `success` and `info` support to `src/lib/components/ui/button/button.svelte`
so CTA buttons in `severity="success"`/`"info"` dialogs have matching gradient
buttons, and the `soft` tone works for all severities.

**Button variant additions** (in the `variant` map, after `warning`):
```ts
success:
  "bg-linear-to-br from-emerald-400 to-emerald-600 text-white shadow-xs hover:from-emerald-500 hover:to-emerald-700 hover:brightness-105",
info:
  "bg-linear-to-br from-sky-400 to-blue-600 text-white shadow-xs hover:from-sky-500 hover:to-blue-700 hover:brightness-105",
```

**Button `tone` additions** (in the `tone` map):
```ts
tone: {
  primary: "",
  destructive: "",
  warning: "",
  success: "",   // NEW
  info: "",      // NEW
},
```

**Compound variants additions** (soft + success, soft + info):
```ts
{ variant: "soft", tone: "success", class: "border-success-gradient-soft text-foreground hover:brightness-105" },
{ variant: "soft", tone: "info",    class: "border-info-gradient-soft text-foreground hover:brightness-105" },
```

**Light/dark theme verification** (empirical, from `app.css` tokens):
- The existing gradient variants (`default`, `destructive`, `warning`) use FIXED
  hex gradients with NO dark-specific overrides — the same gradient renders in
  both light and dark mode. `success` and `info` follow the same pattern.
- Proposed hex pairs (verified against the success/info token families):
  - success: `from-emerald-400 (#34d399) to-emerald-600 (#059669)` — aligns with
    `--success` light `142.1 76.2% 36.3%` / dark `142.1 70.6% 45.3%` (emerald family).
  - info: `from-sky-400 (#38bdf8) to-blue-600 (#2563eb)` — aligns with `--info`
    light `199 89% 48%` / dark `199 89% 60%` (sky/blue family).
- `text-white` works in both themes on these gradient backgrounds (matches
  `destructive` which also uses `text-white` in both modes).
- **No `.dark` overrides needed** — consistent with existing variants.

**CSS utility additions** (in `app.css`, alongside the Step 0 `-popover` utilities):
```css
@utility border-success-gradient {
  border: 1px solid transparent;
  background:
    linear-gradient(hsl(var(--background)), hsl(var(--background))) padding-box,
    linear-gradient(to bottom right, #34d399, #059669) border-box;
}
@utility border-info-gradient {
  border: 1px solid transparent;
  background:
    linear-gradient(hsl(var(--background)), hsl(var(--background))) padding-box,
    linear-gradient(to bottom right, #38bdf8, #2563eb) border-box;
}
@utility border-success-gradient-soft {
  border: 1px solid transparent;
  background:
    linear-gradient(to bottom right, #a7f3d0, #a7f3d0) padding-box,
    linear-gradient(to bottom right, #34d399, #059669) border-box;
}
@utility border-info-gradient-soft {
  border: 1px solid transparent;
  background:
    linear-gradient(to bottom right, #bae6fd, #bfdbfe) padding-box,
    linear-gradient(to bottom right, #38bdf8, #2563eb) border-box;
}
```
(soft variants use a tenue tinted fill like `border-primary-gradient-soft` does
with `#bae6fd, #c7d2fe`; emerald-200 `#a7f3d0` for success, sky-200 `#bae6fd` +
blue-200 `#bfdbfe` for info.)

Update `@source inline(...)` to also include `border-success-gradient`,
`border-info-gradient`, `border-success-gradient-soft`, `border-info-gradient-soft`.

**Verify**: `pnpm run check`. No existing button usage breaks (new variants are
additive; `tone` defaults remain `primary`).

### Step 1 — Refactor `dialog-bordered.svelte` to the unified component
- Rename `color` → `severity` (keep `color` as deprecated alias).
- Add `tone` prop (`'' | 'soft'`).
- Remove dead `borderColor` derived.
- Implement two rendering modes (§3.4).
- Forward `...restProps` to `Dialog.Content`.
- Update `topStripClass`: `primary` → gradient `bg-linear-to-br from-sky-400 to-indigo-400`.
- **Verify**: `pnpm run check`. Existing consumers still pass `color="..."` →
  still work via alias.

### Step 2 — Migrate the 8 entity-list-table dialogs + rfc-error-dialog
For each of the 10 BorderedDialog consumers, rename `color=` → `severity=`. No
`tone` needed (they keep the top-accent look, `tone=""` default).
Files (one edit each, mechanical):
- `dialogs/DeleteDialog.svelte`, `BulkDeleteDialog.svelte` → `severity="destructive"`
- `dialogs/RestoreDialog.svelte`, `BulkRestoreDialog.svelte`, `DuplicateDialog.svelte`,
  `HtmlExportDialog.svelte`, `ExportDialog.svelte`, `ChangePasswordDialog.svelte` → `severity="warning"`
- `dialogs/ExportPreviewDialog.svelte` → `severity="primary"`
- `ui/rfc-error-dialog.svelte` → `severity="destructive"`
- **Verify**: `pnpm run check`.

### Step 3 — Migrate `SessionExpiredDialog` to the unified component
- Replace direct `Dialog.Content` + `border-primary-gradient-popover` with
  `<BorderedDialog severity="destructive" tone="soft" bind:open={...} class="max-w-md">`.
  This uses the new `border-destructive-gradient-popover` utility (rose→red full
  gradient border) — a VISUAL CHANGE from the current primary sky→indigo border,
  intentional per Q1: destructive severity emphasizes that the session is expired.
- Move header/body/footer inside the unified component's children (same DOM as today).
- Keep the title icon/text as `text-destructive` (red) — now coherent with the
  destructive border (no longer a mixed-semantics inconsistency).
- **Verify**: `pnpm run check` + visual check of session-expired flow (border is
  now red gradient, title is red, LoginForm inside).

### Step 4 — Migrate `AuthMethodsPromptDialog` to the unified component (replaces old PasskeyPrompt step)
- Replace direct `Dialog.Content` + `border-primary-gradient-popover` with
  `<BorderedDialog severity="primary" tone="soft" bind:open showCloseButton={false}
  escapeKeydownBehavior="ignore" onInteractOutside={handleInteractOutside}
  class="sm:max-w-md {bump ? 'dialog-bump' : ''}">`.
- All persistent-dialog props flow through `...restProps`.
- The inline `MfaEnrollmentSection` / `PasskeyEnrollmentSection` stay as children
  content (no change to them — they are sections, not dialogs).
- **Verify**: `pnpm run check` + visual check (bump scale-pulse, no close, no escape,
  method selector + enrollment sections render inside the soft-primary border).

### Step 5 — Migrate `MfaStepUpDialog` to the unified component
- Replace direct `Dialog.Content` (plain `sm:max-w-md`) with
  `<BorderedDialog severity="primary" tone="soft" bind:open class="sm:max-w-md">`.
- Auth/security family → soft primary (per user rule).
- **NOTE**: this dialog is NOT currently mounted in any route. The migration makes
  it consistent for when routes wire it via `useMfaStepUp`. **Wiring the mount is a
  SEPARATE follow-up task, out of this plan's scope.**
- **Verify**: `pnpm run check`.

### Step 6 — Migrate `MfaManagement` inline dialogs to the unified component
- 14a. Enrollment QR dialog: replace `<DialogContent class="sm:max-w-md">` with
  `<BorderedDialog severity="primary" tone="soft" bind:open={enrollDialogOpen}
  class="sm:max-w-md">` (auth enrollment family → soft primary).
- 14b. Delete-confirm dialog: replace `<DialogContent class="sm:max-w-md">` with
  `<BorderedDialog severity="destructive" bind:open={deleteDialogOpen}
  class="sm:max-w-md">` (coherent with DeleteDialog/BulkDeleteDialog top-accent
  destructive).
- **Verify**: `pnpm run check` + visual check in profile page.

### Step 7 — Remove the deprecated `color` alias
- Once all consumers use `severity`, remove the `color` alias from
  `dialog-bordered.svelte`.
- **Verify**: `pnpm run check` (will catch any remaining `color=` usage).

### Step 8 (optional) — Docs extraction
- Run `pnpm extract-docs` to regenerate `docs/user-guide/_extracted/components.json`
  with the new `severity`/`tone` props for `BorderedDialog`.
- Update `docs/user-guide/*.mdx` if BorderedDialog is documented (grep
  `docs/user-guide/_extracted/components.json` for existing entries).

---

## 6. Acceptance criteria

1. `pnpm run check` passes after every step.
2. `dialog-bordered.svelte` exposes `severity` + `tone`; no dead `borderColor` code.
3. `tone=""` reproduces the current top-strip look for all severities; `primary`
   top strip is now gradient (sky→indigo), matching the default Button.
4. `tone="soft"` reproduces the current `SessionExpired`/`AuthMethodsPrompt`
   full-gradient-border look for `severity="primary"`, and generalizes it to
   info/success/warning/destructive/neutral via the new CSS utilities.
5. `AuthMethodsPromptDialog` renders identically to today (same primary soft
   border, same persistent behavior) but via the unified component.
   `SessionExpiredDialog` renders with a **destructive soft border** (rose→red
   gradient, was primary sky→indigo) — intentional per Q1, via the unified
   component. Both use the unified `BorderedDialog`.
6. `MfaStepUpDialog` and `MfaManagement`'s 2 inline dialogs use the unified
   component (soft-primary for auth enrollment, destructive top-accent for delete).
7. All 10 BorderedDialog consumers use `severity=` (no `color=` left).
8. No new runtime errors; persistent-dialog props (`escapeKeydownBehavior`,
   `onInteractOutside`, `showCloseButton={false}`) still work; `.dialog-bump`
   scale-pulse animation preserved.
9. Changing the look of all dialogs is achievable by editing only
   `dialog-bordered.svelte` + the CSS utilities.

---

## 7. Risks & open questions

- **Q1 (SessionExpired severity + tone)**: RESOLVED — the dialog uses
  `severity="destructive" tone="soft"`. The `tone="soft"` is the full-around
  gradient-border style used by the login/auth dialog family; the
  `severity="destructive"` makes that gradient border RED (rose→red) to emphasize
  that the session is expired. This is a VISUAL CHANGE from today (current border
  is the primary sky→indigo gradient); the new border is the destructive
  rose→red gradient via the new `border-destructive-gradient-popover` utility
  (added in Step 0). The title icon/text stays `text-destructive` (now coherent
  with the destructive border).
- **Q2 (gradient color source)**: new utilities use hardcoded hex (matches existing
  convention). If the team wants token-driven gradient stops, that's a separate
  refactor of ALL gradient utilities — out of scope.
- **Q3 (success/info button variants)**: RESOLVED — the plan NOW includes adding
  `success` and `info` Button variants + `tone` entries + soft compound variants
  + the matching CSS gradient utilities (including `-soft` variants), with
  light/dark theme verification. See new Step 1b below.
- **R1 (full-screen dialogs)**: `rfc-error-dialog` and `ExportPreviewDialog` use
  aggressive `!w-[95vw] !h-[95vh] !p-0 ...` overrides on BorderedDialog. The
  refactor must preserve the `class` pass-through and the `p-0` + inner `p-4`
  structure for `tone=""`. Verified: their classes target
  `[&>div:nth-child(2)]` which assumes the strip+inner-wrapper DOM — preserved in
  `tone=""` mode. **Soft tone is NOT used by these full-screen dialogs**, so no
  conflict.
- **R2 (Tailwind v4 `@source inline`)**: the new utility classes must be listed in
  `@source inline(...)` or they won't be emitted (they're constructed dynamically
  via `cn`). Step 0 covers this.
- **R3 (MfaStepUpDialog not mounted)**: migrating it is safe (no runtime impact
  since nothing renders it), but it won't be visually verifiable until a route
  wires it. The plan flags the missing mount as a follow-up.
- **R4 (MfaManagement inline dialogs)**: these are nested inside a `<Card>` in the
  profile page. Migrating them to `BorderedDialog` changes them from plain
  `DialogContent` to bordered dialogs — a visible change. The user confirmed they
  want both migrated. Enrollment → soft primary; delete → destructive top-accent.
- **R5 (`.dialog-bump` is a class, not `@utility`)**: the bump animation is now a
  scale pulse defined as `.dialog-bump { animation: ... !important; }`. The unified
  component must keep accepting this class via the `class` prop (no change needed —
  it's just a pass-through class on `Dialog.Content`).

---

## 8. Out of scope

- `command-dialog.svelte` (command palette — different UX, no border accent).
- Sheets (`SheetHost`, panels) — separate component family.
- Adding `success`/`info` Button variants (follow-up if needed).
- Token-driven gradient color refactor (all gradient utilities use hex today).
- **Wiring `MfaStepUpDialog` into routes** (the composable is ready; mounting the
  dialog in consuming routes is a separate task).
- `MfaChallenge.svelte` (inline TOTP challenge in LoginForm — not a dialog).
- `MfaEnrollmentSection.svelte` / `PasskeyEnrollmentSection.svelte` (inline
  sections inside `AuthMethodsPromptDialog` — content, not dialogs).

---

## 9. Files touched (summary)

| File | Change |
|------|--------|
| `src/app.css` | +5 `border-*-gradient-popover` utilities (info/success/warning/destructive/neutral) + 4 `border-*-gradient`/`-soft` utilities (success/info); update `@source inline`. |
| `src/lib/components/ui/dialog-bordered.svelte` | Refactor: `severity`+`tone`+`restProps`, remove dead `borderColor`, two render modes. |
| `src/lib/components/ui/button/button.svelte` | Add `success`/`info` variants + `tone` entries + soft compound variants (Step 1b). |
| `src/lib/components/ui/rfc-error-dialog.svelte` | `color=` → `severity=`. |
| `src/lib/components/entity-list-table/dialogs/DeleteDialog.svelte` | `color=` → `severity=`. |
| `src/lib/components/entity-list-table/dialogs/BulkDeleteDialog.svelte` | `color=` → `severity=`. |
| `src/lib/components/entity-list-table/dialogs/RestoreDialog.svelte` | `color=` → `severity=`. |
| `src/lib/components/entity-list-table/dialogs/BulkRestoreDialog.svelte` | `color=` → `severity=`. |
| `src/lib/components/entity-list-table/dialogs/DuplicateDialog.svelte` | `color=` → `severity=`. |
| `src/lib/components/entity-list-table/dialogs/HtmlExportDialog.svelte` | `color=` → `severity=`. |
| `src/lib/components/entity-list-table/dialogs/ExportDialog.svelte` | `color=` → `severity=`. |
| `src/lib/components/entity-list-table/dialogs/ExportPreviewDialog.svelte` | `color=` → `severity=`. |
| `src/lib/components/entity-list-table/dialogs/ChangePasswordDialog.svelte` | `color=` → `severity=`. |
| `src/lib/components/auth/SessionExpiredDialog.svelte` | Use `BorderedDialog severity="primary" tone="soft"`. |
| `src/lib/components/auth/AuthMethodsPromptDialog.svelte` | Use `BorderedDialog severity="primary" tone="soft"` + persistent props. |
| `src/lib/components/auth/MfaStepUpDialog.svelte` | Use `BorderedDialog severity="primary" tone="soft"`. |
| `src/lib/components/auth/MfaManagement.svelte` | 2 inline `DialogContent` → `BorderedDialog` (enrollment soft-primary; delete destructive). |
| `docs/user-guide/_extracted/components.json` | Regenerate via `pnpm extract-docs` (Step 8, optional). |

**No route/host file changes needed** — mounts stay the same; only the dialog
components' internals change. (`(app)/+layout.svelte` already mounts
`AuthMethodsPromptDialog`; `profile/+page.svelte` already renders `MfaManagement`.)
