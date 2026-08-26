# Plan: Card Content Layout Standard + Credentials Page Refactor

**Date:** 2026-08-21
**Scope:** FE (`primebrick-fe-v3`) only
**Mode:** PLAN — awaiting `PROCEED` keyword before any code change.

---

## 1. Objective

Establish a **Card Content Layout Standard** that codifies the internal
structure of a `<Card>` based on its content type (FORM, LIST, TABLE,
KANBAN). Apply it to the credentials page's 3 cards and extract the
change-password card into a reusable component.

This standard will be codified in:
- `.devin/rules/card-content-layout.md` (always-on Devin rule)
- `docs/ai/patterns.md` (agent-facing docs)
- `docs/user-guide/ui-patterns.mdx` (external developer docs)

---

## 2. Card Content Layout Standard

### 2.1 The 4 content types

| Type | Internal layout | Column management |
|------|----------------|-------------------|
| **FORM** | At least 2 columns (`grid grid-cols-2 gap-6`) | Managed by the form's grid |
| **LIST** | Single column | Managed by each `<li>` item |
| **TABLE** | Single column | Managed by the table component |
| **KANBAN** | Single column | Managed by the kanban component |

### 2.2 The 3-zone vertical structure

Every card follows a vertical 3-zone structure:

```
┌─────────────────────────────────┐
│  CardHeader                     │  ← Zone 1: identity
│  (icon + title + description)   │
├─────────────────────────────────┤
│                                 │
│  CardContent                    │  ← Zone 2: content
│  (form / list / empty state)    │     (NO CTAs here)
│                                 │
├─────────────────────────────────┤
│  CardFooter                     │  ← Zone 3: actions
│  [secondary] [primary]          │     (justify-end, grouped right)
└─────────────────────────────────┘
```

### 2.3 CTA placement rules

- **ALL CTAs go in `CardFooter`**, never in `CardContent`.
- **All CTAs are right-aligned** (`justify-end`). Secondary and primary
  CTAs are grouped together on the right, ordered left-to-right:
  secondary first, primary last (rightmost). This differs from dialogs,
  where secondary CTAs are pushed to the far left (`justify-between`) for
  a strong visual separation — cards do NOT use this separation.
- CardFooter standard class: `bg-muted/50 border-t p-4 flex justify-end gap-2`.
  This aligns visually with the existing footer patterns in the codebase:
  - `DialogFooter` uses `bg-muted/50 border-t p-4 sm:justify-end`
  - `FormPageLayout` footer uses `bg-muted/50 border-t p-4`
  - The default shadcn `CardFooter` (`flex items-center px-6 [.border-t]:pt-6`)
    is overridden with these classes for visual consistency.
- If a card has no action, `CardFooter` is omitted entirely.

### 2.3.1 When NOT to use CardFooter

CardFooter is the correct footer for **cards**. Other contexts have their
own footer components for structural reasons and must NOT be replaced:

| Context | Footer | Why CardFooter breaks it |
|---------|--------|--------------------------|
| **BorderedDialog** | `DialogFooter` | DialogFooter has `-mx-4 -mb-4 rounded-b-xl` to bleed to dialog content edges and match its `rounded-xl`. CardFooter lacks these — it would float detached inside the dialog. |
| **FormPageLayout** | Custom 50/50 grid footer | The footer is a `grid grid-cols-2` with audit box on the left and actions on the right. CardFooter is a simple flex row — it cannot host the audit box structure. |

This is DRY by context: each context (card, dialog, form-page) has its
own footer with the correct structural properties. The **visual style**
(`bg-muted/50 border-t p-4`) is shared across all three.

### 2.4 FORM type — field ordering and 2-col grid

When `CardContent` is a FORM:
- The form uses `grid grid-cols-2 gap-6`.
- Fields are distributed across the 2 columns following the reading flow
  (top-to-bottom, col 1 before col 2).
- Validation feedback (e.g. PasswordChecklist) is placed in the column
  **opposite** to its related input, aligned with that input's row via
  CSS grid `row-start` / `row-span` placement.
- The form is wrapped in the card; the card does NOT use `FormPageLayout`
  (that is a page-level layout, not a card-level one).

### 2.5 FORM type — validation scoping

- Each card that contains a form uses its own `superForm()` instance with
  `SPA: true` mode — completely independent from the page and from other
  cards.
- Zod schemas are defined inside the card component, not at page level.
- Validation triggers only on user interaction (tainted fields) — errors
  do NOT appear on page load or when interacting with other cards.
- The `onUpdate` callback handles the API call and error mapping locally.

---

## 3. Empirical Evidence

### 3.1 CardFooter component (CONFIRMED — exists, never used yet)
- **File:** `src/lib/components/ui/card/card-footer.svelte`
- Default class: `flex items-center px-6 [.border-t]:pt-6`.
- Exported as `CardFooter` from `$lib/components/ui/card`.
- **No usage anywhere in the codebase** — this will be the first adoption.
- The default class will be **overridden** with `bg-muted/50 border-t p-4
  flex justify-end gap-2` to match the visual style of existing footers
  (see §3.2 and §3.3 below).

### 3.2 DialogFooter — footer pattern for dialogs (CONFIRMED — in use)
- **File:** `src/lib/components/ui/dialog/dialog-footer.svelte`
- Class: `bg-muted/50 -mx-4 -mb-4 rounded-b-xl border-t p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`.
- Used by: `MfaManagement.svelte` (delete dialog), all `BorderedDialog`
  components that have actions.
- **Why CardFooter cannot replace DialogFooter:** the `-mx-4 -mb-4` negative
  margins bleed the footer to the dialog content edges (which has `p-4`
  internal padding), and `rounded-b-xl` matches the dialog's `rounded-xl`.
  CardFooter lacks both — it would float detached inside the dialog.

### 3.3 FormPageLayout footer — footer pattern for form pages (CONFIRMED — in use)
- **File:** `src/lib/components/FormPageLayout.svelte` (lines 69-195)
- Class: `bg-muted/50 shrink-0 border-t p-4` with inner `grid grid-cols-2 gap-4`.
- Left column: audit box (version badge, timestamps, entity ID).
- Right column: `footerActions` snippet (`flex items-center justify-end`).
- Used by: profile, users/create, users/[uuid], organizations/create,
  organizations/[uuid], modules/[code].
- **Why CardFooter cannot replace FormPageLayout footer:** the footer is a
  50/50 grid with structural audit-box content on the left. CardFooter is
  a simple flex row — it cannot host the audit box layout.

### 3.4 Shared visual pattern across all 3 footers (CONFIRMED)
All three footer implementations share the same visual base:
- `bg-muted/50` — muted background
- `border-t` — top border separator
- `p-4` — padding (TableFooter uses `px-3 py-2` for compactness)
- `justify-end` — action alignment (cards group all CTAs on the right;
  dialogs use `justify-between` for strong secondary/primary separation)

The Card Content Layout Standard adopts these same classes for
`CardFooter`, ensuring visual consistency across cards, dialogs, and
form pages without using the wrong structural component.

### 3.5 SuperForm SPA pattern (CONFIRMED — used in LoginForm)
- **File:** `src/lib/components/auth/LoginForm.svelte` (lines 56-128)
- Pattern: `superForm(defaults(zod4(schema)), { SPA: true, validators: zod4(schema), onUpdate })`.
- No `load` function needed. No page-level coupling.
- `const { form, message, enhance, submitting } = superFormObj`.
- Used inside a component, not a page — exactly the scoping model we need.

### 3.6 FormSnap components (CONFIRMED — available)
- **File:** `src/lib/components/ui/form/index.ts`
- Exports: `FormField`, `FormControl`, `FormLabel`, `FormFieldErrors`,
  `TranslatedFormFieldErrors`, `FormDescription`, etc.
- Used in: profile, users/create, users/[uuid], organizations/create,
  organizations/[uuid], LoginForm.

### 3.7 PasswordChecklist (CONFIRMED — separate component, dynamic)
- **File:** `src/lib/components/forms/PasswordChecklist.svelte`
- Props: `password: string`, `rules: PasswordChecklistRule[]`, `specialChars?: string`.
- Rules are dynamic from BE (`usePasswordPolicy` composable fetches
  `GET /api/v1/system/password-policy`).
- 4 policies with 1-5 rules each:
  - `alpha_numeric`: 1 rule (LENGTH)
  - `letter_and_number`: 3 rules
  - `letter_number_special` (default): 4 rules
  - `mixed_case_special`: 5 rules
- Renders `<ul class="space-y-1 mt-2">` with check icons per rule.

### 3.8 usePasswordPolicy composable (CONFIRMED)
- **File:** `src/lib/composables/usePasswordPolicy.svelte.ts`
- Exposes: `state` (DeepReadonly), `regex` ($derived), `load()`.
- `state.checklistRules` — array of active rules.
- `state.specialChars` — string of special chars.
- `state.loaded` — boolean, true after successful fetch.

### 3.9 Current credentials page (CONFIRMED — to refactor)
- **File:** `src/routes/(app)/system/settings/credentials/+page.svelte`
- 229 lines. Contains inline change-password form with manual state
  management (`$state`, `$derived`, `apiFetch`).
- No SuperForm, no Zod, no FormSnap — uses raw `use:enhance` with
  `SubmitFunction` and manual validation.
- CTA is inside CardContent (col 2, `flex justify-end`).
- Form is `grid grid-cols-2 gap-6` but field distribution is asymmetric
  (col 1: current + new, col 2: confirm + CTA).

### 3.10 PasskeyEnrollment (CONFIRMED — CTA to move)
- **File:** `src/lib/components/auth/PasskeyEnrollment.svelte`
- CTA ("Add passkey") is at the end of CardContent (line 298-309),
  left-aligned, no CardFooter.
- List items use `border-primary-gradient`.
- Empty state uses `pb-watermark-empty` + `size-20` icon.

### 3.11 MfaManagement (CONFIRMED — CTA to move)
- **File:** `src/lib/components/auth/MfaManagement.svelte`
- CTA ("Enroll") is at the end of CardContent (line 270-277),
  left-aligned, no CardFooter.
- Same list/empty-state patterns as Passkey.

### 3.12 Dependencies (CONFIRMED — all available)
- `sveltekit-superforms`: `2.30.2`
- `formsnap`: `2.0.1`
- `zod`: `4.4.3`

---

## 4. Implementation Plan (atomic, ordered)

### Step 1 — Create `ChangePasswordCard.svelte` component
**File (new):** `src/lib/components/auth/ChangePasswordCard.svelte`

A self-contained card component that encapsulates:
- SuperForm (SPA mode) with Zod validation
- PasswordChecklist aligned with the "new password" field
- CardFooter with the primary CTA
- `usePasswordPolicy` for dynamic validation rules

Structure:
```svelte
<script lang="ts">
  import { z } from 'zod';
  import { superForm, defaults } from 'sveltekit-superforms';
  import { zod4 } from 'sveltekit-superforms/adapters';
  import { t } from '$lib/i18n';
  import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '$lib/components/ui/card';
  import { FormField, FormControl, FormLabel, TranslatedFormFieldErrors } from '$lib/components/ui/form';
  import { Button } from '$lib/components/ui/button';
  import * as Password from '$lib/components/ui/password';
  import PasswordChecklist from '$lib/components/forms/PasswordChecklist.svelte';
  import { usePasswordPolicy } from '$lib/composables/usePasswordPolicy.svelte';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { onMount } from 'svelte';
  import KeyRound from '@lucide/svelte/icons/key-round';

  const passwordPolicy = usePasswordPolicy();

  // Zod schema — regex is dynamic from BE policy
  const schema = $derived.by(() => {
    const regex = passwordPolicy.regex;
    return z.object({
      current_password: z.string().min(1),
      new_password: z.string().min(1).regex(regex),
      confirm_password: z.string().min(1),
    }).refine(
      (data) => data.new_password === data.confirm_password,
      { path: ['confirm_password'], message: 'passwordsDoNotMatch' },
    );
  });

  const superFormObj = $derived.by(() =>
    superForm(defaults(zod4(schema)), {
      SPA: true,
      validators: zod4(schema),
      invalidateAll: false,
      async onUpdate({ form, cancel }) {
        if (!form.valid) return;
        try {
          const resp = await apiFetch('/api/v1/auth/me/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              current_password: form.data.current_password,
              newPassword: form.data.new_password,
            }),
          });
          if (resp.ok) {
            pushNotification({
              impact: 'NONE',
              message: $t('shell.settings.security.passwordChangedSuccess'),
              scope: 'auth',
            });
            form.reset();
          } else {
            const err = await resp.json();
            pushNotification({ ...err, toast: false });
            cancel();
          }
        } catch (error) {
          console.error('Failed to change password:', error);
          pushNotification({
            impact: 'HIGH',
            message: $t('shell.settings.security.passwordChangedError'),
            scope: 'auth',
          });
          cancel();
        }
      },
    }),
  );

  const { form, enhance, submitting } = superFormObj;

  onMount(() => { void passwordPolicy.load(); });
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <KeyRound class="size-5" />
      {$t('shell.settings.credentials.changePassword.title')}
    </CardTitle>
    <CardDescription>
      {$t('shell.settings.credentials.changePassword.description')}
    </CardDescription>
  </CardHeader>
  <CardContent>
    <form method="POST" use:enhance class="grid grid-cols-2 gap-6" data-testid="credentials-change-password-form">
      <!-- Row 1: current password (col 1) -->
      <FormField form={superFormObj} name="current_password" class="col-start-1 row-start-1">
        <FormControl>
          {#snippet children({ props })}
            <div class="space-y-2">
              <FormLabel for={props.id}>{$t('shell.settings.security.currentPassword')}</FormLabel>
              <Password.PasswordInput
                {...props}
                bind:value={$form.current_password}
                autocomplete="current-password"
                data-testid="credentials-current-password-input"
              />
              <TranslatedFormFieldErrors />
            </div>
          {/snippet}
        </FormControl>
      </FormField>

      <!-- Row 2: new password (col 1) + checklist (col 2, spans rows 2-3) -->
      <FormField form={superFormObj} name="new_password" class="col-start-1 row-start-2">
        <FormControl>
          {#snippet children({ props })}
            <div class="space-y-2">
              <FormLabel for={props.id}>{$t('shell.settings.security.newPassword')}</FormLabel>
              <Password.PasswordInput
                {...props}
                bind:value={$form.new_password}
                autocomplete="new-password"
                data-testid="credentials-new-password-input"
              />
              <TranslatedFormFieldErrors />
            </div>
          {/snippet}
        </FormControl>
      </FormField>

      <!-- Checklist: col 2, aligned with new password row, spans to row 3 -->
      {#if $form.new_password && passwordPolicy.state.loaded}
        <div class="col-start-2 row-start-2 row-span-2">
          <PasswordChecklist
            password={$form.new_password}
            rules={[...passwordPolicy.state.checklistRules]}
            specialChars={passwordPolicy.state.specialChars}
          />
        </div>
      {/if}

      <!-- Row 3: confirm password (col 1) -->
      <FormField form={superFormObj} name="confirm_password" class="col-start-1 row-start-3">
        <FormControl>
          {#snippet children({ props })}
            <div class="space-y-2">
              <FormLabel for={props.id}>{$t('shell.settings.security.confirmPassword')}</FormLabel>
              <Password.PasswordInput
                {...props}
                bind:value={$form.confirm_password}
                autocomplete="new-password"
                data-testid="credentials-confirm-password-input"
              />
              <TranslatedFormFieldErrors />
            </div>
          {/snippet}
        </FormControl>
      </FormField>
    </form>
  </CardContent>
  <CardFooter class="bg-muted/50 border-t p-4 justify-end gap-2">
    <Button type="submit" form="change-password-form" disabled={submitting} data-testid="credentials-change-password-button">
      {submitting
        ? $t('shell.settings.security.changingPassword')
        : $t('shell.settings.credentials.changePassword.button')}
    </Button>
  </CardFooter>
</Card>
```

Notes:
- The form `id` must be set so the CardFooter button can reference it via `form="change-password-form"`.
- The Zod schema is `$derived.by` because `passwordPolicy.regex` is reactive.
- The `superForm` call is also `$derived.by` to react to schema changes.
- `form.reset()` clears fields after success.
- The checklist only renders when `$form.new_password` is non-empty AND
  the policy is loaded — same conditional as the current implementation.

**IMPORTANT — SuperForm + $derived note:**
SuperForm creates internal state that should NOT be recreated on every
reactive change. If `$derived.by` causes issues with SuperForm's internal
state management, the fallback is to initialize SuperForm once with a
static schema and validate the password policy regex separately in a
custom `onUpdate` or via `setError`. This will be verified during
implementation — if `$derived.by` + `superForm` causes state loss, switch
to the fallback approach.

### Step 2 — Refactor credentials page to use the component
**File:** `src/routes/(app)/system/settings/credentials/+page.svelte`

Remove all inline change-password state, imports, and form. Replace with:
```svelte
<ChangePasswordCard />
```

The page shrinks from ~229 lines to ~40 lines (just the scaffold + 3
component imports).

### Step 3 — Move PasskeyEnrollment CTA to CardFooter
**File:** `src/lib/components/auth/PasskeyEnrollment.svelte`

- Import `CardFooter` from `$lib/components/ui/card`.
- Move the "Add passkey" `<Button>` from the end of `CardContent` into a
  new `<CardFooter class="bg-muted/50 border-t p-4 justify-end gap-2">`.
- Keep `data-testid="passkey-enrollment-add-button"` stable.
- Keep the `Plus` icon and `Spinner` loading state.

### Step 4 — Move MfaManagement CTA to CardFooter
**File:** `src/lib/components/auth/MfaManagement.svelte`

- Import `CardFooter` from `$lib/components/ui/card`.
- Move the "Enroll" `<Button>` from the end of `CardContent` into a
  new `<CardFooter class="bg-muted/50 border-t p-4 justify-end gap-2">`.
- Keep `data-testid="mfa-enroll-button"` stable.
- Keep the `Plus` icon and `Spinner` loading state.

### Step 5 — Codify the Card Content Layout Standard
**File (new):** `.devin/rules/card-content-layout.md`

Always-on Devin rule with the full standard from §2 above.

**File (edit):** `docs/ai/patterns.md`

Append a "Card Content Layout Standard" subsection under the existing
"Detail-page primary CTA placement" section.

**File (edit):** `docs/user-guide/ui-patterns.mdx`

Update the existing page to include the Card Content Layout Standard
with:
- The 4 content types table
- The 3-zone vertical structure diagram
- CTA placement rules
- FORM type field ordering and validation scoping
- A Mermaid diagram showing the decision flow

### Step 6 — Verify
- `pnpm run check` (typecheck) — must pass with 0 errors.
- Manual: navigate to `/system/settings/credentials`, verify:
  - 3 cards render with CardFooter CTAs.
  - Change-password form: 2-col grid, checklist aligned with new password.
  - Validation triggers only on user interaction, not page load.
  - Passkey/MFA CTAs are in CardFooter, right-aligned.
  - Empty states still show huge-icon pattern.
  - List items still use `border-primary-gradient`.
- E2E testids preserved:
  - `credentials-change-password-form`
  - `credentials-change-password-button`
  - `credentials-current-password-input`
  - `credentials-new-password-input`
  - `credentials-confirm-password-input`
  - `passkey-enrollment-add-button`
  - `passkey-enrollment-empty`
  - `passkey-enrollment-item`
  - `mfa-enroll-button`
  - `mfa-management-empty`
  - `mfa-management-item`

---

## 5. Acceptance Criteria

1. ✅ `ChangePasswordCard.svelte` exists as a self-contained component
   with its own SuperForm (SPA mode) + Zod validation.
2. ✅ Change-password form uses 2-col grid with:
   - Col 1: current password (row 1), new password (row 2), confirm
     password (row 3).
   - Col 2: PasswordChecklist aligned with new password row, spanning
     rows 2-3.
3. ✅ Change-password CTA is in `CardFooter`, right-aligned.
4. ✅ Validation triggers only on user interaction (tainted fields) —
   no errors on page load or when interacting with other cards.
5. ✅ PasskeyEnrollment CTA is in `CardFooter`, right-aligned.
6. ✅ MfaManagement CTA is in `CardFooter`, right-aligned.
7. ✅ All 3 cards share identical CardFooter styling:
   `flex bg-muted/50 border-t p-4 justify-end gap-2`.
8. ✅ Credentials page is under ~50 lines (just scaffold + 3 components).
9. ✅ All E2E `data-testid` attributes preserved.
10. ✅ `pnpm run check` passes with 0 errors.
11. ✅ `.devin/rules/card-content-layout.md` exists with the full standard.
12. ✅ `docs/ai/patterns.md` documents the Card Content Layout Standard.
13. ✅ `docs/user-guide/ui-patterns.mdx` includes the standard for
    external developers.

---

## 6. Files Touched

**FE — new:**
- `src/lib/components/auth/ChangePasswordCard.svelte`
- `.devin/rules/card-content-layout.md`

**FE — edited:**
- `src/routes/(app)/system/settings/credentials/+page.svelte`
- `src/lib/components/auth/PasskeyEnrollment.svelte`
- `src/lib/components/auth/MfaManagement.svelte`
- `docs/ai/patterns.md`
- `docs/user-guide/ui-patterns.mdx`

**No BE changes.**
**No i18n changes** (all keys already exist from the previous release).
