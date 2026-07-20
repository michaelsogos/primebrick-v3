# Feature Plan: Unified Bordered Dialog with `tone` attribute

> Status: DRAFT — awaiting user approval (PROCEED keyword).
> Repo: `primebrick-fe-v3`
> Date: 2026-07-17
> Mode: PLAN (no source code changes until approval)

---

## 1. Objective

Create a **single reusable dialog component** that unifies the three current dialog
visual strategies (top-strip `BorderedDialog`, full-gradient-border
`SessionExpiredDialog`/`PasskeyPromptDialog`) behind one API driven by two
orthogonal attributes:

- **`severity`** (renamed from `color`): `primary | info | success | warning | destructive | neutral`
  — the semantic color of the dialog. `primary` is NEW and uses the brand gradient
  (sky-400 → indigo-400) instead of a solid `bg-primary`.
- **`tone`**: `""` (default, empty) | `"soft"`.
  - `""`  → **top-only** colored/gradient accent (current `BorderedDialog` look).
  - `"soft"` → **full-around** gradient border (current `SessionExpired`/`PasskeyPrompt` look),
    valid for ALL severities.

Then migrate every existing dialog to the unified component so the look'n'feel can
be changed centrally with minimal effort.

---

## 2. Empirical findings (evidence gathered this session)

### 2.1 Existing dialog components & their strategies

| File | Strategy | Evidence |
|------|----------|----------|
| `src/lib/components/ui/dialog-bordered.svelte` | Top colored STRIP `h-2 w-full rounded-t-xl {colorClass}` (NOT a border). `color` prop: primary/info/warning/success/destructive/neutral. | Lines 45-59 `colorClass`, line 67 the strip div. |
| `src/lib/components/auth/SessionExpiredDialog.svelte` | `Dialog.Content` direct + `border-primary-gradient-popover` (full gradient border, popover fill). | Line 34. |
| `src/lib/components/auth/PasskeyPromptDialog.svelte` | `Dialog.Content` direct + `border-primary-gradient-popover` (full gradient border) + persistent (no close, `escapeKeydownBehavior="ignore"`, `onInteractOutside` bump). | Lines 159-164. |
| `src/lib/components/ui/rfc-error-dialog.svelte` | `BorderedDialog` color="destructive", full-screen layout. | Lines 107-112. |
| 8 entity-list-table dialogs | `BorderedDialog` with destructive/warning/primary. | See §2.3. |
| `src/lib/components/ui/command/command-dialog.svelte` | `Dialog.Content` direct, command palette. **OUT OF SCOPE.** | Lines 35-41. |

### 2.2 Dead code / inconsistencies found

- **DEAD CODE**: `borderColor` derived in `dialog-bordered.svelte` (lines 29-43) is
  computed but NEVER referenced in the template. Only `colorClass` is used. The
  `border-t-primary`/`border-t-info`/... classes have no effect (no `border-width`
  is set; `Dialog.Content` uses `ring-1`, not border). **Action: remove.**
- **Inconsistency**: `BorderedDialog` `primary` uses solid `bg-primary` for the top
  strip, while every other "primary" surface in the app (default Button, outline
  button border, Checkbox checked) uses the **sky→indigo gradient**. The user
  explicitly wants `primary` to be gradient.
- **Inconsistency**: `SessionExpiredDialog` title is `text-destructive` (red) even
  though the dialog border is the primary gradient — mixed semantics.
- **Missing CSS utilities**: gradient-border utilities exist only for `primary`
  (`border-primary-gradient`, `-popover`, `-soft`) and `destructive`
  (`border-destructive-gradient`). There are **NO** gradient-border utilities for
  `info`, `success`, `warning`. These are required for `tone="soft"` to work across
  all severities.

### 2.3 Full usage inventory (BorderedDialog consumers)

All files importing `dialog-bordered.svelte` (verified via grep):

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

Direct `Dialog.Content` (non-bordered) consumers to migrate to the unified component:

11. `src/lib/components/auth/SessionExpiredDialog.svelte` — primary gradient border (→ `severity="primary" tone="soft"`).
12. `src/lib/components/auth/PasskeyPromptDialog.svelte` — primary gradient border, persistent (→ `severity="primary" tone="soft"` + persistent props).

Hosts / mount points (no visual change, just wiring):

- `src/routes/+layout.svelte` — mounts `<SessionExpiredDialog />`.
- `src/routes/(app)/+layout.svelte` — mounts `<PasskeyPromptDialog />`.
- `src/lib/components/entity-list-table/components/EntityListTableDialogs.svelte` — hosts the 8 entity dialogs.
- `src/routes/(app)/system/settings/modules/+page.svelte` — uses `<DeleteDialog>` directly (lines 355-361).
- `src/routes/(app)/system/settings/users/+page.svelte` — uses `<ChangePasswordDialog>` (lines 627-631).

### 2.4 Existing `tone` attribute precedent

`src/lib/components/ui/checkbox/checkbox.svelte` already defines a `tone` prop
(`CheckboxTone = "primary" | "destructive" | "warning"`) using
`data-[state=checked]:bg-linear-to-br from-* to-*` gradients. This establishes
`tone` as an accepted naming convention in the codebase for color intent. The new
dialog `tone` reuses the same name but with a different semantic axis
(`""` vs `"soft"` = border style, not color), keeping `severity` for color.

### 2.5 CSS gradient utilities (app.css) — current state

```
border-primary-gradient          → full gradient border, bg-background fill
border-primary-gradient-popover  → full gradient border, bg-popover fill   ← used by SessionExpired/PasskeyPrompt
border-primary-gradient-soft     → gradient border + tenue gradient bg     ← used by soft-primary buttons
border-readonly-gradient         → grey gradient border
border-destructive-gradient      → red gradient border
```

Gradient color pairs (from `button.svelte` variants, the canonical source):
- primary:   `from-sky-400 to-indigo-400`  (top strip / border)
- destructive: `from-rose-400 to-red-600`
- warning:   `from-yellow-300 to-yellow-500`
- success:   (no button variant yet — propose `from-emerald-400 to-emerald-600`)
- info:      (no button variant yet — propose `from-sky-400 to-blue-600`)
- neutral:   `from-gray-400 to-gray-500` (matches `border-readonly-gradient`)

### 2.6 Dialog primitive structure (for the unified wrapper)

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

### 3.1 New file

`src/lib/components/ui/dialog-bordered.svelte` — **refactor in place** (keep the
same path/import name so consumers only need to add `tone`/rename `color`→`severity`).
A thin re-export is NOT needed; we evolve the existing file.

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
  // allow pass-through of bits-ui Content props (for persistent dialogs)
  [key: string]: unknown;
} = $props();
```

**Backward-compat shim**: to avoid a big-bang rename, accept the legacy `color`
prop as an alias for `severity` during migration (deprecation warning in dev
console), then remove after all consumers are migrated. This keeps each migration
step atomic and lint-clean.

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

This exactly reproduces the current `SessionExpired`/`PasskeyPrompt` look for
`severity="primary" tone="soft"`, and generalizes it to every severity.

### 3.5 Persistent-dialog support (PasskeyPrompt)

The unified component forwards `...restProps` to `Dialog.Content`, so
`PasskeyPromptDialog` keeps its persistent behavior by passing:
`showCloseButton={false}`, `escapeKeydownBehavior="ignore"`,
`onInteractOutside={handleInteractOutside}`, and the `dialog-bump` class via
`class`. No special-casing inside the unified component.

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
  `<BorderedDialog severity="primary" tone="soft" bind:open={...} class="max-w-md">`.
- Move header/body/footer inside the unified component's children (same DOM as today).
- Fix the semantic inconsistency: title icon/text no longer forced `text-destructive`
  (the dialog is primary-toned now); keep the `ShieldUser` icon but use `text-primary`
  or keep destructive only if business wants the urgency — **decision point for user**.
- **Verify**: `pnpm run check` + visual check of session-expired flow.

### Step 4 — Migrate `PasskeyPromptDialog` to the unified component
- Replace direct `Dialog.Content` + `border-primary-gradient-popover` with
  `<BorderedDialog severity="primary" tone="soft" bind:open showCloseButton={false}
  escapeKeydownBehavior="ignore" onInteractOutside={handleInteractOutside}
  class="sm:max-w-md {bump ? 'dialog-bump' : ''}">`.
- All persistent-dialog props flow through `...restProps`.
- **Verify**: `pnpm run check` + visual check (bump animation, no close, no escape).

### Step 5 — Remove the deprecated `color` alias
- Once all consumers use `severity`, remove the `color` alias from
  `dialog-bordered.svelte`.
- **Verify**: `pnpm run check` (will catch any remaining `color=` usage).

### Step 6 (optional) — Docs extraction
- Run `pnpm extract-docs` to regenerate `docs/user-guide/_extracted/components.json`
  with the new `severity`/`tone` props for `BorderedDialog`.
- Update `docs/user-guide/*.mdx` if BorderedDialog is documented (check
  `docs/user-guide/_extracted/components.json` for existing entries — grep showed
  `SessionExpired` references in `authentication.mdx`/`api-reference.mdx`).

---

## 6. Acceptance criteria

1. `pnpm run check` passes after every step.
2. `dialog-bordered.svelte` exposes `severity` + `tone`; no dead `borderColor` code.
3. `tone=""` reproduces the current top-strip look for all severities; `primary`
   top strip is now gradient (sky→indigo), matching the default Button.
4. `tone="soft"` reproduces the current `SessionExpired`/`PasskeyPrompt`
   full-gradient-border look for `severity="primary"`, and generalizes it to
   info/success/warning/destructive/neutral via the new CSS utilities.
5. `SessionExpiredDialog` and `PasskeyPromptDialog` render identically to today
   (same border, same persistent behavior for passkey) but via the unified
   component.
6. All 10 BorderedDialog consumers use `severity=` (no `color=` left).
7. No new runtime errors; persistent-dialog props (`escapeKeydownBehavior`,
   `onInteractOutside`, `showCloseButton={false}`) still work.
8. Changing the look of all dialogs is achievable by editing only
   `dialog-bordered.svelte` + the CSS utilities.

---

## 7. Risks & open questions

- **Q1 (SessionExpired title color)**: today the title is `text-destructive` while
  the border is primary gradient. After migration to `severity="primary" tone="soft"`,
  should the title icon/text become `text-primary`, or stay destructive to convey
  urgency? → **Needs user decision.**
- **Q2 (gradient color source)**: new utilities use hardcoded hex (matches existing
  convention). If the team wants token-driven gradient stops, that's a separate
  refactor of ALL gradient utilities — out of scope.
- **Q3 (success/info button variants)**: there are no `success`/`info` Button
  variants yet. The plan proposes gradient pairs but does NOT add Button variants.
  If dialogs with `severity="success"`/`"info"` need matching gradient CTA buttons,
  that's a follow-up (add `success`/`info` to `buttonVariants`).
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

---

## 8. Out of scope

- `command-dialog.svelte` (command palette — different UX, no border accent).
- Sheets (`SheetHost`, panels) — separate component family.
- Adding `success`/`info` Button variants (follow-up if needed).
- Token-driven gradient color refactor (all gradient utilities use hex today).

---

## 9. Files touched (summary)

| File | Change |
|------|--------|
| `src/app.css` | +5 `border-*-gradient-popover` utilities; update `@source inline`. |
| `src/lib/components/ui/dialog-bordered.svelte` | Refactor: `severity`+`tone`+`restProps`, remove dead code, two render modes. |
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
| `src/lib/components/auth/PasskeyPromptDialog.svelte` | Use `BorderedDialog severity="primary" tone="soft"` + persistent props. |
| `docs/user-guide/_extracted/components.json` | Regenerate via `pnpm extract-docs` (Step 6, optional). |

**No route/host file changes needed** — mounts stay the same; only the dialog
components' internals change.
