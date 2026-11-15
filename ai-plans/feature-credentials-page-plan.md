# Plan: New "Credentials" Settings Page

**Date:** 2026-07-26
**Scope:** FE (`primebrick-fe-v3`) + BE (`primebrick-be-v3`) nav meta + i18n
**Mode:** PLAN — awaiting `PROCEED` keyword before any code change.

---

## 1. Objective

Create a new settings page **"Credenziali"** (`/system/settings/credentials`) that
consolidates the **currently-logged-in user's** credential management:

1. **Change password** card (uses `/api/v1/auth/me/change-password` — already exists in BE).
2. **Passkey** card (moved out of the Profile page).
3. **MFA** card (moved out of the Profile page).

The Profile page keeps only profile fields (display name, email, avatar, IDP info,
audit). The Security page loses the legacy password-change mockup (it is user-scoped,
not system-scoped — Security is for system-wide security configuration).

A new **design rule** about primary CTA placement on detail pages is also codified
into the agent docs / Devin rules.

---

## 2. Empirical Evidence Gathered (no assumptions)

### 2.1 Backend — password change endpoint (CONFIRMED)
- **File:** `primebrick-be-v3/src/modules/auth/routers/auth-session.router.ts`
- **Method/Path:** `POST /api/v1/auth/me/change-password`
- **Permission:** `AUTHENTICATED_USER`
- **Request body:** `{ current_password: string, newPassword: string }`
  (`newPassword` must match the password-policy regex).
- **Response (success):** `{ success: true }`
- **Response (error):** RFC7807 with `internal_code` like `WRONG_PASSWORD` /
  `CASDOOR_CHANGE_PASSWORD_FAILED`.
- **Service:** `user.service.ts` → `changeOwnPassword()` (verifies current pw
  against Casdoor, changes via Casdoor API, sends notification email).
- **Policy:** `primebrick-be-v3/src/modules/auth/password-policy.ts`
  default `LETTER_NUMBER_SPECIAL` (8–64 chars, ≥1 letter, ≥1 number, ≥1 special
  from `*-_.#@!|?^:`).
- **No BE code change required** for the endpoint itself — it already exists and
  is already used by the Security page.

### 2.2 Settings nav — source of truth (CONFIRMED)
- **File:** `primebrick-be-v3/src/modules/module-nav-meta.ts`
- `buildModuleNavMeta("settings")` returns the `nav` array (lines 33–40).
- FE never hardcodes tabs: `src/lib/breadcrumb/settings-breadcrumb.ts` reads from
  `shellNav.moduleNav` (fetched from BE `/api/v1/modules/:code/meta`).
- Current order: `profile, organizations, users, roles, security, modules,
  templates, email-providers`.
- **User decision:** new `credentials` entry goes **immediately after `profile`**.

### 2.3 Existing Security page (CONFIRMED — to be cleaned up)
- **File:** `primebrick-fe-v3/src/routes/(app)/system/settings/security/+page.svelte`
- Contains: (a) change-password form (lines 147–201), (b) OIDC params block
  (lines 204–238), (c) Delete Account (footer, lines 295–306).
- Uses `AppPageScaffold` (NOT `FormPageLayout`).
- The change-password form is the **only** part to remove; OIDC params and
  Delete Account stay (system-scoped).

### 2.4 Existing Profile page (CONFIRMED — to be cleaned up)
- **File:** `primebrick-fe-v3/src/routes/(app)/system/settings/profile/+page.svelte`
- Uses `FormPageLayout` with `footerActions` snippet containing the primary
  "Save" button (lines 561–565) — this is the **"TUTTO FORM"** layout.
- Currently embeds `<PasskeyEnrollment />` (line 553) and `<MfaManagement />`
  (line 556) **after** the form, inside the same `space-y-6` container.
- These two imports + usages must be **removed** from the profile page.

### 2.5 PasskeyEnrollment component (CONFIRMED — to be restyled)
- **File:** `primebrick-fe-v3/src/lib/components/auth/PasskeyEnrollment.svelte`
- Card title: **NO icon** (line 205–207) — must add one (`Fingerprint`).
- CardDescription: present (`auth.passkeys.description`).
- List item: `rounded-md border-primary-gradient px-3 py-2` (gradient border ✓).
- Item icon: `size-5 text-muted-foreground shrink-0 mt-0.5`.
- Delete button: `variant="ghost" size="sm"` with `Trash2 size-4`.
- Empty state (line 217): `<p class="text-sm text-muted-foreground py-2">` —
  **plain text, no huge icon, no animation**. Must be upgraded.
- "Add passkey" CTA (line 284): `variant="soft" tone="primary"` — **already
  SOFT PRIMARY**, but per the new rule, since there is NO primary in any footer
  on the credentials page, this must become **DEFAULT primary** (`variant="default"`
  with default `tone="primary"`).

### 2.6 MfaManagement component (CONFIRMED — to be restyled)
- **File:** `primebrick-fe-v3/src/lib/components/auth/MfaManagement.svelte`
- Card title: **HAS icon** `ShieldCheck size-5` (line 196) — keep.
- CardDescription: present (`auth.mfa.description`) — user says **"MFA subtitle
  da migliorare"** → rewrite the i18n `auth.mfa.description` copy.
- List item (line 217): `rounded-md border border-border px-3 py-2` —
  **NO gradient border**. Must switch to `border-primary-gradient` to match
  Passkey.
- Item icon: `Smartphone size-4` — bump to `size-5 mt-0.5` to match Passkey.
- Delete button: `variant="ghost" size="icon"` — switch to `size="sm"` to match
  Passkey.
- Empty state (lines 206–213): plain `<p class="text-sm text-muted-foreground">`
  + an inline enroll button. Must be upgraded to the huge-icon pattern; the
  enroll button moves to the card footer CTA slot.
- "Enroll another" CTA (line 258): `variant="outline"` — must become
  **DEFAULT primary** to match Passkey (same rule: no footer primary on the
  credentials page).
- "Add 2FA factor" CTA in empty state (line 209): default Button — must become
  **DEFAULT primary** and move out of the empty state into the card footer
  CTA slot (same position as Passkey's "Add passkey").

### 2.7 Moduli page — empty-state reference pattern (CONFIRMED)
- **File:** `primebrick-fe-v3/src/routes/(app)/system/settings/modules/+page.svelte`
  (lines 203–216).
- Pattern:
  ```svelte
  <div class="grid min-h-56 place-items-center p-3">
    <div class="relative flex flex-col items-center gap-2 text-center">
      <div class="pb-watermark-empty">
        <TriangleAlert class="size-20 text-warning" />
      </div>
      <div class="text-sm font-medium text-muted-foreground">
        {$t('shell.settings.modules.noModules')}
      </div>
      <div class="text-xs text-muted-foreground">
        {$t('shell.settings.modules.noModulesHint')}
      </div>
    </div>
  </div>
  ```
- `pb-watermark-empty` is defined in `src/app.css` (lines 867–923) — bounce +
  opacity pulse animation. Reusable.
- **User decision:** Passkey & MFA empty states adopt this exact pattern
  (huge icon `size-20` + `pb-watermark-empty` + primary text + hint text),
  with a card-appropriate icon color (e.g. `text-muted-foreground` instead of
  `text-warning`, since "no passkey" is not a warning state).

### 2.8 Button variants (CONFIRMED)
- **File:** `primebrick-fe-v3/src/lib/components/ui/button/button.svelte`
- `variant="default"` + default `tone="primary"` ⇒ full sky→indigo gradient,
  white text — the **DEFAULT PRIMARY**.
- `variant="soft" tone="primary"` ⇒ gradient border + subtle background, dark
  text — the **SOFT PRIMARY**.
- **Rule recap (user-stated):**
  - Detail page that is **TUTTO FORM 2-col with DEFAULT PRIMARY in footer** ⇒
    no other primary button inside the content; footer may hold multiple CTAs.
  - Detail page that is **UN PO' FORM + UN PO' ALTRO** ⇒ no primary in the
    footer; each card's CTA becomes a **DEFAULT primary** button inside the
    content. The form keeps 2-col grid, validation, etc., and is wrapped in a
    **card box**.
- The credentials page is the second case → 3 cards, each with a DEFAULT
  primary CTA inside, **no footer primary**.

### 2.9 Layout scaffold choice (CONFIRMED)
- `FormPageLayout` **requires** `footerActions` snippet (non-optional prop) and
  always renders the audit footer. Not appropriate for the credentials page
  (no single entity audit box; no footer primary desired).
- `AppPageScaffold` (`src/lib/components/AppPageScaffold.svelte`) is the right
  shell: it provides the outer `rounded-md border bg-background` card wrapper
  and a `children` snippet with no forced footer. The Security page already
  uses it.
- **Decision:** Credentials page uses `AppPageScaffold`. Inside `children`,
  render a `space-y-6` stack with 3 `<Card>` boxes (password, passkey, MFA).
  The change-password form lives inside its own `<Card>` (per the rule: form
  wrapped in a card box when the page is mixed).

### 2.10 i18n — existing keys (CONFIRMED)
- **File:** `primebrick-fe-v3/src/lib/i18n/messages/en-GB.json` (+ `de-DE`,
  `es-ES`, `fr-FR`, `it-IT`, `pt-PT`).
- `shell.settings.tabs.*` — needs new `credentials` entry.
- `shell.settings.security.*` — password-change keys already exist
  (`currentPassword`, `newPassword`, `confirmPassword`, `changePasswordButton`,
  `passwordsDoNotMatch`, `passwordChangedSuccess`, `passwordChangedError`,
  `changingPassword`). **Reuse them** for the credentials page (same endpoint,
  same UX). Optionally alias under `shell.settings.credentials.*` for clarity —
  see §4.3.
- `auth.passkeys.title` / `auth.passkeys.description` / `auth.passkeys.empty`
  — `empty` copy must change to "Nessuna passkey trovata" style + add a hint
  key.
- `auth.mfa.title` / `auth.mfa.description` / `auth.mfa.empty` — `description`
  to be improved; `empty` to "Nessun fattore MFA trovato" style + hint key.
- **Translation-key convention rule:** snake_case singular. New keys:
  - `shell.settings.tabs.credentials`
  - `shell.settings.credentials.title`
  - `shell.settings.credentials.description`
  - `shell.settings.credentials.changePassword.title`
  - `shell.settings.credentials.changePassword.description`
  - `shell.settings.credentials.changePassword.button` (or reuse
    `shell.settings.security.changePasswordButton`)
  - `auth.passkeys.emptyTitle` + `auth.passkeys.emptyHint`
  - `auth.mfa.emptyTitle` + `auth.mfa.emptyHint`

### 2.11 Icons (CONFIRMED via lucide.dev)
- `key-round` — valid Lucide icon; already imported in
  `PasskeyEnrollmentSection.svelte`. Use for the **credentials nav tab**.
- `fingerprint` — valid; already used in `PasskeyEnrollmentSection.svelte`.
  Use for the **Passkey card title icon** (currently missing).
- `shield-check` — valid; already used in `MfaManagement.svelte`. Keep for the
  **MFA card title icon**.
- `key-round` or `lock-keyhole` — for the **Change Password card title icon**.
  Prefer `key-round` for consistency with the nav tab.

---

## 3. Design Rule to Codify (user-requested)

Add to the FE agent docs (and a Devin rule) the following rule, verbatim in
intent:

> **Detail-page primary CTA placement rule**
>
> A "detail page" is any non-table page (form page, settings sub-page, etc.).
> Two layouts are allowed:
>
> 1. **TUTTO FORM** — entire content is a 2-column form (`grid grid-cols-2
>    gap-6`), no other sections. In this case the **DEFAULT primary button
>    lives in the footer** (`FormPageLayout` `footerActions` snippet). No
>    other primary button may appear inside the content. The footer may
>    contain multiple CTAs (primary + secondary) if needed. The form is NOT
>    wrapped in an extra `<Card>` because `FormPageLayout` already provides
>    the card wrapper.
>
> 2. **UN PO' FORM + UN PO' ALTRO** — the page mixes a form with other
>    content (lists, boxes, etc.). In this case the **footer primary no
>    longer makes sense**: each card that needs an action puts its own
>    **DEFAULT primary button inside the card content**. The form keeps all
>    its characteristics (2-col grid, validation, `use:enhance`, etc.) and
>    is wrapped in a `<Card>` box. The page uses `AppPageScaffold` (not
>    `FormPageLayout`) because there is no single footer primary.
>
> **Soft primary** (`variant="soft" tone="primary"`) is used for in-card CTAs
> **only when** a DEFAULT primary already exists in the footer (case 1 with
> extra in-card actions). When there is no footer primary (case 2), in-card
> CTAs are **DEFAULT primary**.

**Files to update:**
- `primebrick-fe-v3/docs/ai/patterns.md` — append a "Detail-page primary CTA
  placement" subsection under Forms.
- `primebrick-fe-v3/.devin/rules/detail-page-cta-placement.md` — new always-on
  Devin rule with the same content (so agents are forced to follow it).

---

## 4. Implementation Plan (atomic, ordered)

### Step 1 — BE: add `credentials` nav entry
**File:** `primebrick-be-v3/src/modules/module-nav-meta.ts`
- Insert immediately after the `profile` entry (line 33):
  ```ts
  { id: "credentials", label_key: "shell.settings.tabs.credentials", href: "/system/settings/credentials", icon: "key-round" },
  ```
- No other BE change. The endpoint already exists.

### Step 2 — FE i18n: add new keys (all 6 locale files)
**Files:** `primebrick-fe-v3/src/lib/i18n/messages/{en-GB,de-DE,es-ES,fr-FR,it-IT,pt-PT}.json`

Add (English shown; other locales translated accordingly):
```json
"shell": {
  "settings": {
    "tabs": {
      "credentials": "Credentials"
    },
    "credentials": {
      "title": "Credentials",
      "description": "Manage your sign-in credentials: password, passkeys, and two-factor authentication.",
      "changePassword": {
        "title": "Change Password",
        "description": "Update the password you use to sign in. You will receive a notification email after a successful change.",
        "button": "Change password"
      }
    }
  }
}
```
And under `auth.passkeys`:
```json
"emptyTitle": "No passkey found",
"emptyHint": "Add a passkey to sign in faster without a password."
```
And under `auth.mfa`:
```json
"description": "Add an authenticator app as a second layer of security. Even if your password is leaked, your account stays protected.",
"emptyTitle": "No MFA factor found",
"emptyHint": "Add an authenticator app to protect your account with a second factor."
```
Keep the legacy `empty` keys for backward compat or remove if no other usage
(grep first — see §6 verification).

### Step 3 — FE: restyle `PasskeyEnrollment.svelte`
**File:** `primebrick-fe-v3/src/lib/components/auth/PasskeyEnrollment.svelte`
- Add `Fingerprint` import from `@lucide/svelte/icons/fingerprint`.
- Add `<Fingerprint class="size-5" />` inside `CardTitle` before the title text.
- Replace the empty-state `<p>` (line 217) with the moduli-style huge-icon
  pattern:
  ```svelte
  <div class="grid min-h-56 place-items-center p-3" data-testid="passkey-enrollment-empty">
    <div class="relative flex flex-col items-center gap-2 text-center">
      <div class="pb-watermark-empty">
        <Fingerprint class="size-20 text-muted-foreground" />
      </div>
      <div class="text-sm font-medium text-muted-foreground">
        {$t("auth.passkeys.emptyTitle")}
      </div>
      <div class="text-xs text-muted-foreground">
        {$t("auth.passkeys.emptyHint")}
      </div>
    </div>
  </div>
  ```
- Change the "Add passkey" button (line 284) from
  `variant="soft" tone="primary"` → **DEFAULT primary** (remove both props,
  since `default`/`primary` are the defaults). Keep `data-testid` and
  `disabled`.

### Step 4 — FE: restyle `MfaManagement.svelte`
**File:** `primebrick-fe-v3/src/lib/components/auth/MfaManagement.svelte`
- Keep `ShieldCheck` title icon.
- List item (line 217): change `border border-border` → `border-primary-gradient`
  to match Passkey.
- Item icon (line 223): change `Smartphone class="size-4 ..."` →
  `Smartphone class="size-5 text-muted-foreground shrink-0 mt-0.5"`.
- Delete button (line 241): change `size="icon"` → `size="sm"` to match Passkey.
- Empty state (lines 206–213): replace with the huge-icon pattern (icon:
  `ShieldCheck class="size-20 text-muted-foreground"`), using
  `auth.mfa.emptyTitle` / `auth.mfa.emptyHint`. Remove the inline enroll
  button from the empty state.
- "Enroll another" button (line 258): change `variant="outline"` → DEFAULT
  primary. Keep `data-testid`.
- The empty-state enroll button (line 209) is removed; the card-level CTA
  (the "enroll another" / "Add 2FA factor" button) is the single DEFAULT
  primary CTA for the card, rendered after the list (same position as
  Passkey's "Add passkey"). When the list is empty, the same CTA renders
  below the empty state — so the empty state shows the huge icon + texts,
  and the DEFAULT primary button sits underneath, exactly like Passkey.

### Step 5 — FE: create the credentials route
**File (new):** `primebrick-fe-v3/src/routes/(app)/system/settings/credentials/+page.svelte`

Structure (Svelte 5 runes, snake_case, no toast, `pushNotification` only):
```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import * as Password from '$lib/components/ui/password';
  import { apiFetch } from '$lib/api';
  import { pushNotification } from '$lib/errors/app-errors';
  import { usePasswordPolicy } from '$lib/composables/usePasswordPolicy.svelte';
  import PasswordChecklist from '$lib/components/forms/PasswordChecklist.svelte';
  import { onMount } from 'svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import PasskeyEnrollment from '$lib/components/auth/PasskeyEnrollment.svelte';
  import MfaManagement from '$lib/components/auth/MfaManagement.svelte';

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let changingPassword = $state(false);

  const passwordPolicy = usePasswordPolicy();
  const passwordValid = $derived(
    passwordPolicy.state.loaded && passwordPolicy.regex.test(newPassword),
  );
  const canChangePassword = $derived(
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    passwordValid &&
    newPassword === confirmPassword &&
    !changingPassword,
  );

  async function handleChangePassword() {
    if (!canChangePassword) return;
    changingPassword = true;
    try {
      const resp = await apiFetch('/api/v1/auth/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, newPassword }),
      });
      if (resp.ok) {
        pushNotification({
          impact: 'NONE',
          message: $t('shell.settings.security.passwordChangedSuccess'),
          scope: 'auth',
        });
        currentPassword = ''; newPassword = ''; confirmPassword = '';
      } else {
        const err = await resp.json();
        pushNotification({ ...err, toast: false });
      }
    } catch (error) {
      console.error('Failed to change password:', error);
      pushNotification({
        impact: 'HIGH',
        message: $t('shell.settings.security.passwordChangedError'),
        scope: 'auth',
      });
    } finally {
      changingPassword = false;
    }
  }

  onMount(() => { void passwordPolicy.load(); });
</script>

<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.credentials.title')}</h1>
    </div>
  {/snippet}

  {#snippet children()}
    <div class="flex-1 overflow-auto p-4">
      <div class="space-y-6">
        <!-- Card 1: Change password (form, wrapped in Card per mixed-page rule) -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <KeyRound class="size-5" />
              {$t('shell.settings.credentials.changePassword.title')}
            </CardTitle>
            <CardDescription>{$t('shell.settings.credentials.changePassword.description')}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <form id="change-password-form" use:enhance={handleChangePassword} class="grid grid-cols-2 gap-6">
              <div class="space-y-4">
                <div class="space-y-2">
                  <label for="currentPassword" class="text-sm font-medium leading-none">
                    {$t('shell.settings.security.currentPassword')}
                  </label>
                  <Password.PasswordInput
                    id="currentPassword"
                    bind:value={currentPassword}
                    placeholder={$t('shell.settings.security.currentPasswordPlaceholder')}
                    autocomplete="current-password"
                  />
                </div>
                <div class="space-y-2">
                  <label for="newPassword" class="text-sm font-medium leading-none">
                    {$t('shell.settings.security.newPassword')}
                  </label>
                  <Password.PasswordInput
                    id="newPassword"
                    bind:value={newPassword}
                    placeholder={$t('shell.settings.security.newPasswordPlaceholder')}
                    autocomplete="new-password"
                  />
                  {#if newPassword && passwordPolicy.state.loaded}
                    <PasswordChecklist
                      password={newPassword}
                      rules={[...passwordPolicy.state.checklistRules]}
                      specialChars={passwordPolicy.state.specialChars}
                    />
                  {/if}
                </div>
              </div>
              <div class="space-y-4">
                <div class="space-y-2">
                  <label for="confirmPassword" class="text-sm font-medium leading-none">
                    {$t('shell.settings.security.confirmPassword')}
                  </label>
                  <Password.PasswordInput
                    id="confirmPassword"
                    bind:value={confirmPassword}
                    placeholder={$t('shell.settings.security.confirmPasswordPlaceholder')}
                    autocomplete="new-password"
                  />
                  {#if confirmPassword.length > 0 && newPassword !== confirmPassword}
                    <p class="text-sm text-destructive mt-1">
                      {$t('shell.settings.security.passwordsDoNotMatch')}
                    </p>
                  {/if}
                </div>
                <!-- DEFAULT primary CTA inside the card (no footer primary on this page) -->
                <div class="flex justify-end">
                  <Button type="submit" form="change-password-form" disabled={!canChangePassword} data-testid="credentials-change-password-button">
                    {changingPassword
                      ? $t('shell.settings.security.changingPassword')
                      : $t('shell.settings.credentials.changePassword.button')}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        <!-- Card 2: Passkeys (moved from profile page) -->
        <PasskeyEnrollment />

        <!-- Card 3: MFA (moved from profile page) -->
        <MfaManagement />
      </div>
    </div>
  {/snippet}
</AppPageScaffold>
```

Notes:
- The change-password form is a 2-col grid (`grid grid-cols-2 gap-6`) per the
  form standard, wrapped in `<Card>` per the mixed-page rule.
- The submit button is DEFAULT primary and lives inside the card (col 2,
  right-aligned) — no footer primary.
- `use:enhance` is used on the form; `handleChangePassword` returns void and
  calls `pushNotification` (no toast).
- Reuses existing `shell.settings.security.*` password keys to avoid i18n
  duplication; new `shell.settings.credentials.*` keys only for the page
  title/description and the card title/description/button label.

### Step 6 — FE: remove passkey/MFA from the Profile page
**File:** `primebrick-fe-v3/src/routes/(app)/system/settings/profile/+page.svelte`
- Remove the two imports (lines 42–43):
  `import PasskeyEnrollment ...` and `import MfaManagement ...`.
- Remove the two usages (lines 552–556):
  `<!-- Passkey / WebAuthn ... --> <PasskeyEnrollment />` and
  `<!-- MFA / 2FA ... --> <MfaManagement />`.
- The profile page becomes a pure "TUTTO FORM" page: 2-col form + footer
  primary Save. The footer primary stays — it is now the only primary on the
  page, which is correct per the rule.

### Step 7 — FE: remove the legacy password mockup from the Security page
**File:** `primebrick-fe-v3/src/routes/(app)/system/settings/security/+page.svelte`
- Remove the change-password block (lines 147–201): the
  `<h3>changePassword</h3>`, the three `Password.PasswordInput` fields, the
  `PasswordChecklist`, the change-password button, and the wrapping
  `<div class="space-y-4 rounded-lg border p-4">`.
- Remove the now-unused state: `currentPassword`, `newPassword`,
  `confirmPassword`, `changingPassword`, `passwordPolicy`, `passwordValid`,
  `canChangePassword`, `handleChangePassword`, and the
  `usePasswordPolicy` / `PasswordChecklist` / `Password` imports **only if**
  they are not used elsewhere in the file (verify with grep before removing
  imports).
- Remove the `passwordPolicy.load()` call in `onMount` if no longer needed.
- The Security page keeps: OIDC params block, Delete Account footer button,
  Save footer button (for OIDC). The `handleSubmit` TODO stays (it was already
  a TODO).

### Step 8 — FE: codify the design rule
**File (new):** `primebrick-fe-v3/.devin/rules/detail-page-cta-placement.md`
**File (edit):** `primebrick-fe-v3/docs/ai/patterns.md` — append the rule text
from §3 above under the Forms section.

### Step 9 — Verify
- `pnpm run check` (typecheck) in `primebrick-fe-v3`.
- `pnpm run check` in `primebrick-be-v3` (only the nav meta line changed —
  should be trivial).
- Manual / E2E: navigate to `/system/settings/credentials`, verify the 3
  cards render, the change-password flow works, passkey add/delete works,
  MFA enroll/delete works, empty states show the huge-icon pattern, and the
  Profile + Security pages no longer show the moved/removed sections.
- Existing E2E tests `src/e2e/auth-password.spec.ts` and
  `src/e2e/auth-passkey.spec.ts` may need testid/path updates — check and
  update only if they break.

---

## 5. Acceptance Criteria

1. ✅ New settings link "Credentials" appears in the app sidebar immediately
   after "Profile", with the `key-round` icon.
2. ✅ `/system/settings/credentials` renders 3 cards: Change Password, Passkeys,
   MFA.
3. ✅ Change-password card uses `POST /api/v1/auth/me/change-password`, 2-col
   form grid, `PasswordChecklist`, DEFAULT primary submit button inside the
   card (no footer primary on the page).
4. ✅ Passkey card has `Fingerprint` icon in the title, gradient-border list
   items, huge-icon empty state (`size-20` + `pb-watermark-empty`), DEFAULT
   primary "Add passkey" CTA.
5. ✅ MFA card has `ShieldCheck` icon in the title, gradient-border list items
   (matching Passkey), improved `auth.mfa.description` copy, huge-icon empty
   state, DEFAULT primary enroll CTA.
6. ✅ Passkey & MFA cards share identical structural styling (icon in title,
   subtitle, gradient-border items, trash button `size="sm"`, huge-icon empty
   state with title + hint, DEFAULT primary CTA).
7. ✅ Profile page no longer renders Passkey/MFA cards; it is a pure 2-col form
   with footer primary Save.
8. ✅ Security page no longer renders the change-password mockup; OIDC params
   and Delete Account remain.
9. ✅ No `toast.*` calls; all notifications via `pushNotification`.
10. ✅ All new i18n keys added to all 6 locale files, snake_case singular.
11. ✅ `pnpm run check` passes in both FE and BE.
12. ✅ New Devin rule `detail-page-cta-placement.md` exists and
    `docs/ai/patterns.md` documents the rule.

---

## 6. Open Questions / Verification Before Execution

- **Q1:** Are the legacy `auth.passkeys.empty` and `auth.mfa.empty` keys used
  anywhere else (E2E tests, other components)? → Grep before removing. If
  unused, remove; if used, keep and add the new `emptyTitle`/`emptyHint` keys
  alongside.
- **Q2:** Do the existing E2E specs (`auth-password.spec.ts`, `auth-passkey.spec.ts`)
  target the Security/Profile pages? If yes, update selectors/paths to the new
  credentials page.
- **Q3:** Should the change-password card reuse `shell.settings.security.*`
  keys or should we duplicate them under `shell.settings.credentials.*`? Plan
  reuses them to avoid duplication; user to confirm on PROCEED if not OK.

---

## 7. Files Touched (summary)

**BE:**
- `primebrick-be-v3/src/modules/module-nav-meta.ts` (1 line added)

**FE — new:**
- `primebrick-fe-v3/src/routes/(app)/system/settings/credentials/+page.svelte`
- `primebrick-fe-v3/.devin/rules/detail-page-cta-placement.md`

**FE — edited:**
- `primebrick-fe-v3/src/lib/components/auth/PasskeyEnrollment.svelte`
- `primebrick-fe-v3/src/lib/components/auth/MfaManagement.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/profile/+page.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/security/+page.svelte`
- `primebrick-fe-v3/docs/ai/patterns.md`
- `primebrick-fe-v3/src/lib/i18n/messages/en-GB.json`
- `primebrick-fe-v3/src/lib/i18n/messages/de-DE.json`
- `primebrick-fe-v3/src/lib/i18n/messages/es-ES.json`
- `primebrick-fe-v3/src/lib/i18n/messages/fr-FR.json`
- `primebrick-fe-v3/src/lib/i18n/messages/it-IT.json`
- `primebrick-fe-v3/src/lib/i18n/messages/pt-PT.json`

**Possibly updated (if E2E breaks):**
- `primebrick-fe-v3/src/e2e/auth-password.spec.ts`
- `primebrick-fe-v3/src/e2e/auth-passkey.spec.ts`
