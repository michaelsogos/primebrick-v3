# User Manager UI Fixes Plan

**Date:** 2026-06-20
**Stack:** SvelteKit + Svelte 5 + TypeScript + shadcn-svelte
**Scope:** Frontend (primebrick-fe-v3) and limited backend (primebrick-be-v3) changes.

---

## Supported languages (translation policy)

**Every translation change in this plan MUST be applied to ALL 6 language files** in `primebrick-fe-v3/src/lib/i18n/messages/`:

| File | Language | Notes |
|---|---|---|
| `en-GB.json` | British English | Default; also serves `en-US` |
| `it-IT.json` | Italian | |
| `fr-FR.json` | French | |
| `es-ES.json` | Spanish | |
| `de-DE.json` | German | |
| `pt-PT.json` | Portuguese | |

Source of truth: `primebrick-fe-v3/src/lib/i18n/languages.ts` line 5 — `UI_LANGS = ['en-GB', 'en-US', 'it-IT', 'fr-FR', 'es-ES', 'de-DE', 'pt-PT']`. Note: `en-US` shares the `en-GB.json` message file, so there are 6 JSON files, not 7.

**Rule:** Whenever a section below says "add key X" or "change key X", it means: add/change key X in **all 6 files** (`en-GB.json`, `it-IT.json`, `fr-FR.json`, `es-ES.json`, `de-DE.json`, `pt-PT.json`), with the appropriate localized value for each language. No language file may be left behind.

---

## 1. Profile menu item click area

### Deep empirical analysis

#### How dropdown menu items are implemented across the project

I searched every usage of `DropdownMenu.Item` in the codebase (16 files, ~50+ usages). There are **two distinct patterns**:

**Pattern A — `onclick` / `onSelect` handler (the project standard, used everywhere except the profile menu):**

The `DropdownMenu.Item` renders its own clickable row (via `DropdownMenuPrimitive.Item` in `dropdown-menu-item.svelte` lines 18–32, which applies `relative flex cursor-pointer ... px-2 py-1.5`). The click is handled by the primitive's own `onclick` / `onSelect`, and the inner content is just visual (icon + span). No `<a>` tag is used.

Examples:

1. **TableRow.svelte** (lines 252–307) — row action menu (edit, duplicate, delete, restore):
```svelte
<DropdownMenu.Item
  onclick={(e) => { e.stopPropagation(); if (isRowDeleted(row)) return; onEditRow(row); }}
  class={isRowDeleted(row) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
>
  <div class="flex items-center gap-2">
    <Pencil class="size-4 opacity-70" />
    <span>{$t('common.edit')}</span>
  </div>
</DropdownMenu.Item>
```

2. **CardActions.svelte** (lines 122–177) — identical pattern to TableRow, card view row actions.

3. **LangSelect.svelte** (lines 53–62) — language switcher uses `onSelect`:
```svelte
<DropdownMenu.Item
  onSelect={() => setUiLang(lang.code)}
  closeOnSelect={true}
  class={dropdownMenuItemWithSelectedClass('flex items-center gap-2', lang.code === $uiLang)}
>
  <span class={`fi fi-${lang.flagCode} ...`} aria-hidden="true"></span>
  <span class="min-w-0 flex-1 truncate">{lang.label}</span>
</DropdownMenu.Item>
```

4. **AppPageBreadcrumb.svelte** (lines 43–50) — breadcrumb menu uses `onSelect` + `goto()` for navigation (no `<a>` tag):
```svelte
<DropdownMenu.Item
  class={dropdownMenuSelectedItemClass(item.current)}
  onSelect={() => {
    if (!item.current) void goto(item.href);
  }}
>
  {item.label}
</DropdownMenu.Item>
```

5. **AppSidebar.svelte** org switcher (lines 238–265) — uses `onSelect`:
```svelte
<DropdownMenu.Item
  class={cn('gap-2', dropdownMenuSelectedItemClass(selectedOrgId === 'acme'))}
  closeOnSelect={true}
  onSelect={() => { selectedOrgId = 'acme'; }}
>
  ...
</DropdownMenu.Item>
```

6. **AppSidebar.svelte** logout (line 513) — uses `onclick`:
```svelte
<DropdownMenu.Item variant="destructive" onclick={handleLogout}>
  <LogOut />
  <span>{$t('shell.userMenu.itemSignOut')}</span>
</DropdownMenu.Item>
```

**Pattern B — `asChild` + inner `<a>` tag (NON-standard, used in exactly ONE place):**

A `grep` for `DropdownMenu\.Item asChild` across the entire `src/` tree returns **only 1 match**: `AppSidebar.svelte` line 499. This is the profile "Settings" menu item — the one with the bug.

```svelte
<DropdownMenu.Item asChild>
  <a href="/system/settings/profile" class="flex items-center gap-2">
    <Settings />
    <span>{$t('shell.userMenu.itemSettings')}</span>
  </a>
</DropdownMenu.Item>
```

#### Root cause

With `asChild`, bits-ui's `DropdownMenuPrimitive.Item` merges its props/attributes onto the child element (the `<a>`). The `<a>` receives the `relative flex cursor-pointer ... px-2 py-1.5` classes from the primitive (see `dropdown-menu-item.svelte` line 24), so the `<a>` itself IS the full-width row. However, the inner content (`<Settings />` + `<span>`) does not fill the `<a>` — the icon and text only occupy their natural width, leaving the right padding area of the `<a>` as clickable space.

Wait — that means the `<a>` should be fully clickable. The actual issue is more subtle: when `asChild` is used, bits-ui renders the `<a>` as the menu item, but the `onSelect` / close-on-click behavior is attached to the primitive's internal logic. When you click the padding area of the `<a>`, bits-ui fires `onSelect` (which closes the menu) but the native `<a>` click navigation may be **intercepted/swallowed** by bits-ui's event handling before the browser navigates. When you click directly on the icon/text, the event target is a child element and the navigation proceeds normally.

This is a known class of issue with `asChild` + interactive child elements in bits-ui: the primitive's pointer-event handling can race with the native `<a>` click.

#### The project's own convention proves this

Every other navigation-using dropdown in the project (breadcrumb, org switcher) uses **`onSelect` + `goto()`** — NOT `asChild` + `<a>`. The breadcrumb explicitly does this:
```svelte
onSelect={() => { if (!item.current) void goto(item.href); }}
```

This avoids the `asChild` event race entirely because the primitive handles the click and calls `goto()` programmatically.

#### Change — align with project standard (Pattern A)

Replace the `asChild` + `<a>` pattern with the project's standard `onSelect` + `goto()` pattern, matching `AppPageBreadcrumb.svelte`:

**BEFORE** (`AppSidebar.svelte` lines 498–504):
```svelte
<DropdownMenu.Group>
  <DropdownMenu.Item asChild>
    <a href="/system/settings/profile" class="flex items-center gap-2">
      <Settings />
      <span>{$t('shell.userMenu.itemSettings')}</span>
    </a>
  </DropdownMenu.Item>
  <DropdownMenu.Item disabled>
    <Bell />
    <span>{$t('shell.userMenu.itemNotifications')}</span>
  </DropdownMenu.Item>
</DropdownMenu.Group>
```

**AFTER:**
```svelte
<DropdownMenu.Group>
  <DropdownMenu.Item
    closeOnSelect={true}
    onSelect={() => { void goto('/system/settings/profile'); }}
  >
    <Settings class="size-4 shrink-0" />
    <span>{$t('shell.userMenu.itemSettings')}</span>
  </DropdownMenu.Item>
  <DropdownMenu.Item disabled>
    <Bell class="size-4 shrink-0" />
    <span>{$t('shell.userMenu.itemNotifications')}</span>
  </DropdownMenu.Item>
</DropdownMenu.Group>
```

This requires adding `goto` to the imports (already imported in some routes; in `AppSidebar.svelte` we need to add `import { goto } from '$app/navigation'` — note: `afterNavigate` is already imported from `$app/navigation` on line 17, so we extend that import).

**Import change** (`AppSidebar.svelte` line 17):
```svelte
// BEFORE
import { afterNavigate } from '$app/navigation';
// AFTER
import { afterNavigate, goto } from '$app/navigation';
```

#### Why not just add `w-full` to the `<a>`?

Adding `w-full` to the inner `<a>` would make the link fill the row visually, but it does NOT fix the bits-ui `asChild` event race — the primitive's `onSelect` can still intercept the click before navigation. The project's own convention (breadcrumb) deliberately avoids `asChild` + `<a>` for navigation and uses `onSelect` + `goto()` instead. We follow the same convention.

#### Audit: other `asChild` + `<a>` usages

A project-wide `grep` for `DropdownMenu\.Item asChild` returns **only 1 match** (the profile settings item). No other dropdown menu item uses `asChild` with an `<a>` tag. Therefore this is the only place that needs fixing.

### Verification
- Click anywhere on the "Settings" menu item row (including padding area outside icon/text); it should navigate to `/system/settings/profile`.
- Click the "Sign Out" item (already uses `onclick`); it should still work.
- Open the org switcher and breadcrumb menus; they should still work (unchanged, already use Pattern A).

---

## 2. Tooltip on collapsed sidebar health badge

### Evidence
`AppSidebar.svelte` line 529 uses the browser tooltip:

```svelte
<Badge
  variant="outline"
  class={cn(...)}
  title={healthChipLabel}
>
```

### Change
Wrap the badge with `Tooltip.Root` (from `$lib/components/ui/tooltip`) and use a translated string:

```svelte
<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <Badge variant="outline" class={cn(...)} {...props}>
        ...
      </Badge>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content>
    {$t('shell.health.statusTooltip', { status: healthChipLabel, version: APP_VERSION })}
  </Tooltip.Content>
</Tooltip.Root>
```

### New i18n keys — ALL 6 language files

| File | Value |
|---|---|
| `en-GB.json` | `"STATUS: {status} \| Version: {version}"` |
| `it-IT.json` | `"STATO: {status} \| Versione: {version}"` |
| `fr-FR.json` | `"STATUT : {status} \| Version : {version}"` |
| `es-ES.json` | `"ESTADO: {status} \| Versión: {version}"` |
| `de-DE.json` | `"STATUS: {status} \| Version: {version}"` |
| `pt-PT.json` | `"ESTADO: {status} \| Versão: {version}"` |

Key path in all files: `shell.health.statusTooltip`

### Verification
- Collapse the sidebar.
- Hover the cloud icon badge; a styled tooltip should appear with status and version.

---

## 3. Missing translations in Create User AND Edit User pages

### Deep empirical analysis

Both pages were inspected line-by-line. There are **three distinct categories of problems**:

1. **Hardcoded English strings** (no `$t()` call at all)
2. **`$t()` calls referencing non-existent keys** (key returns the raw key path as text)
3. **Wrong error component used** (`FormFieldErrors` instead of `TranslatedFormFieldErrors`, so Zod validation keys like `validation.invalidUrl` show as raw key paths)

---

#### Problem A: `common.create` key missing — CREATE page save button shows raw key

**Evidence:** The CREATE page (line 516) uses `$t('common.create')` for the primary save button. But `common.create` does **NOT exist** in any of the 6 i18n files. The `common` section (en-GB.json lines 29–84) has `save` (line 41) but no `create`.

The i18n fallback logic (`primebrick-fe-v3/src/lib/i18n/index.ts` line 47) returns the key itself when no translation is found:
```ts
const template = getPath($dict, key) ?? getPath(enGB as Dict, key) ?? key;
```

So `$t('common.create')` returns the string `"common.create"` — which is exactly what the user sees on the button.

**Note:** The organization CREATE page (`organizations/create/+page.svelte` line 416) already uses `$t('common.save')` — so the user create page is the outlier. Adding a new `common.create` key would just create a new inconsistency. The correct fix is to align the user create page with the rest of the project and use `common.save`.

**Fix:** Change `$t('common.create')` → `$t('common.save')` in `users/create/+page.svelte` line 516. No new i18n keys needed — `common.save` already exists in all 6 language files.

---

#### Problem B: Wrong error component — validation hints show as raw keys

**Evidence:** The project has two error display components in `primebrick-fe-v3/src/lib/components/ui/form/`:

1. `form-field-errors.svelte` — renders error strings **as-is** (no translation)
2. `translated-field-errors.svelte` — checks if error starts with `validation.` and translates it via `$t()`

Both are exported from `index.ts` (lines 30–31):
```ts
FieldErrors as FormFieldErrors,
TranslatedFieldErrors as TranslatedFormFieldErrors,
```

**Audit of which pages use which component:**

| Page | Imports `TranslatedFormFieldErrors`? | Uses `<FormFieldErrors />` (non-translated) | Uses `<TranslatedFormFieldErrors />` (translated) | Status |
|---|---|---|---|---|
| `users/create/+page.svelte` | Yes (line 16) but **unused** | 6 usages (lines 362, 379, 395, 414, 430, 447) | 0 | ❌ BROKEN |
| `users/[uuid]/+page.svelte` | Yes (line 23) but **unused** | 3 usages (lines 395, 412, 428) | 0 | ❌ BROKEN |
| `profile/+page.svelte` | **No** (not imported) | 2 usages (lines 419, 439) | 0 | ❌ BROKEN |
| `organizations/create/+page.svelte` | Yes (line 15) | 0 | 4 usages (lines 304, 320, 372, 394) | ✅ CORRECT |
| `organizations/[uuid]/+page.svelte` | Yes (line 15) | 0 | 2 usages (lines 290, 306) | ✅ CORRECT |

**Root cause:** User pages and profile page use `<FormFieldErrors />` (the non-translated version) instead of `<TranslatedFormFieldErrors />`. The Zod schema produces error messages as translation keys (e.g., `validation.tooShort`, `validation.invalidUrl`), but `FormFieldErrors` renders them verbatim — so the user sees `validation.tooShort` instead of "Must be at least 5 characters".

**Fix:** Replace all `<FormFieldErrors />` with `<TranslatedFormFieldErrors />` in:
- `users/create/+page.svelte` — 6 replacements (lines 362, 379, 395, 414, 430, 447)
- `users/[uuid]/+page.svelte` — 3 replacements (lines 395, 412, 428)
- `profile/+page.svelte` — 2 replacements (lines 419, 439) + add import of `TranslatedFormFieldErrors`

**BEFORE** (e.g., `users/create/+page.svelte` line 362):
```svelte
<FormFieldErrors />
```

**AFTER:**
```svelte
<TranslatedFormFieldErrors />
```

**Profile page also needs import fix** (`profile/+page.svelte` line 14):
```svelte
// BEFORE
FormFieldErrors,
// AFTER
FormFieldErrors,
TranslatedFormFieldErrors,
```

---

#### Problem C: Hardcoded English strings

##### CREATE page (`users/create/+page.svelte`) — 2 hardcoded placeholders

Almost all labels use `$t('shell.settings.users.create.*')` keys. Only 2 strings are hardcoded:

| Line | Hardcoded string | Should be |
|---|---|---|
| 393 | `placeholder="Select roles..."` | `$t('shell.settings.users.create.rolesPlaceholder')` |
| 412 | `placeholder="Select organization..."` | `$t('shell.settings.users.create.idpOrgPlaceholder')` |

All other labels/placeholders in CREATE are already translated via `$t()`.

##### EDIT page (`users/[uuid]/+page.svelte`) — almost EVERYTHING is hardcoded

The EDIT page has widespread hardcoded English strings. Here is the full audit:

| Line | Hardcoded string | Should be (key) |
|---|---|---|
| 314 | `Loading...` | `$t('common.loading')` |
| 353 | `Avatar Color` | `$t('shell.settings.users.update.avatarColor')` |
| 365 | `'Select color'` | `$t('shell.settings.users.update.selectColorPlaceholder')` (NEW key) |
| 389 | `Display Name` | `$t('shell.settings.users.update.displayName')` |
| 393 | `placeholder="Display name"` | `$t('shell.settings.users.update.displayNamePlaceholder')` |
| 405 | `Email` | `$t('shell.settings.users.update.email')` |
| 410 | `placeholder="email@example.com"` | `$t('shell.settings.users.update.emailPlaceholder')` |
| 422 | `Roles` | `$t('shell.settings.users.update.roles')` |
| 426 | `placeholder="Select roles..."` | `$t('shell.settings.users.update.rolesPlaceholder')` (NEW key) |
| 438 | `IDP Code` | `$t('shell.settings.users.update.idpCode')` |
| 450 | `IDP Organization` | `$t('shell.settings.users.update.idpOrg')` (NEW key) |
| 462 | `IDP Username` | `$t('shell.settings.users.update.idpUsername')` (NEW key) |
| 474 | `Issuer` | `$t('shell.settings.users.update.issuer')` (NEW key) |
| 488 | `Is Active` | `$t('shell.settings.users.update.isActive')` |
| 493 | `Is Admin` | `$t('shell.settings.users.update.isAdmin')` |
| 498 | `Is Verified` | `$t('shell.settings.users.update.isVerified')` (NEW key) |
| 503 | `Email Verified` | `$t('shell.settings.users.update.emailVerified')` (NEW key) |

#### Existing i18n keys in `users.update` section (en-GB.json lines 255–275)

```
title, username, displayName, displayNamePlaceholder, email, emailPlaceholder,
avatarInitials, avatarInitialsPlaceholder, avatarColor, isActive, isAdmin,
roles, idpCode, copyIdpCode, idpOwner, copyIdpOwner, idpName, copyIdpName,
unsavedChanges
```

#### Missing keys in `users.update` section (need to be added to ALL 6 files)

| Key | Reason |
|---|---|
| `idpOrg` | EDIT page has "IDP Organization" readonly field (line 450) |
| `idpUsername` | EDIT page has "IDP Username" readonly field (line 462) |
| `issuer` | EDIT page has "Issuer" readonly field (line 474) |
| `isVerified` | EDIT page has "Is Verified" readonly checkbox (line 498) |
| `emailVerified` | EDIT page has "Email Verified" readonly checkbox (line 503) |
| `rolesPlaceholder` | EDIT page has hardcoded "Select roles..." placeholder (line 426) |
| `selectColorPlaceholder` | EDIT page has hardcoded "Select color" text (line 365) |

#### Missing keys in `users.create` section (need to be added to ALL 6 files)

| Key | Reason |
|---|---|
| `rolesPlaceholder` | CREATE page has hardcoded "Select roles..." placeholder (line 393) |
| `idpOrgPlaceholder` | CREATE page has hardcoded "Select organization..." placeholder (line 412) |

#### Key differences between CREATE and EDIT pages

| Aspect | CREATE page | EDIT page |
|---|---|---|
| IDP fields | Editable (idp_org select, idpUsername input, password input) | Readonly (idp_code, idp_org, idp_username, issuer) |
| Checkboxes | Editable (is_active, is_admin, is_verified, email_verified) | Readonly (is_active, is_admin, is_verified, email_verified) |
| Password field | Present (editable) | Not present |
| Color picker label | `$t('shell.settings.users.create.avatarColor')` ✓ | Hardcoded "Avatar Color" ❌ |
| Loading state | No loading state (form starts empty) | `Loading...` hardcoded ❌ |
| Key namespace | `shell.settings.users.create.*` | `shell.settings.users.update.*` |
| Translation coverage | ~90% (only 2 placeholders missing) | ~10% (almost everything hardcoded) |

**Note:** The `idpName` key in the `users.update` section is currently labeled "IDP Username" in EN (line 272) which is misleading — it should be `idpUsername` for the username field. The `idpName` key appears to be a copy-paste error from the organization form. We will add a proper `idpUsername` key and keep `idpName` for backward compatibility (or repurpose it).

### Changes

#### 3a. Fix CREATE page save button — use `common.save` instead of missing `common.create`

The CREATE user page save button (line 516) uses `$t('common.create')` but this key does not exist. Change it to `$t('common.save')` to align with the organization create page and avoid adding a redundant key.

**BEFORE** (`users/create/+page.svelte` line 516):
```svelte
{$t('common.create')}
```

**AFTER:**
```svelte
{$t('common.save')}
```

No new i18n keys needed — `common.save` already exists in all 6 language files.

#### 3b. Replace `<FormFieldErrors />` with `<TranslatedFormFieldErrors />` in user pages and profile

| File | Lines to change | Also needs import fix? |
|---|---|---|
| `users/create/+page.svelte` | 362, 379, 395, 414, 430, 447 | No (already imported, just unused) |
| `users/[uuid]/+page.svelte` | 395, 412, 428 | No (already imported, just unused) |
| `profile/+page.svelte` | 419, 439 | Yes — add `TranslatedFormFieldErrors` to import (line 14) |

**BEFORE** (any of the lines above):
```svelte
<FormFieldErrors />
```

**AFTER:**
```svelte
<TranslatedFormFieldErrors />
```

**Profile page import fix** (`profile/+page.svelte` line 14):
```svelte
// BEFORE
FormFieldErrors,
// AFTER
FormFieldErrors,
TranslatedFormFieldErrors,
```

#### 3c. CREATE page — fix 2 hardcoded placeholders

**BEFORE** (`users/create/+page.svelte`):
```svelte
<!-- line 393 -->
placeholder="Select roles..."
<!-- line 412 -->
placeholder="Select organization..."
```

**AFTER:**
```svelte
placeholder={$t('shell.settings.users.create.rolesPlaceholder')}
placeholder={$t('shell.settings.users.create.idpOrgPlaceholder')}
```

#### 3d. EDIT page — replace ALL hardcoded strings with `$t()` calls

**BEFORE** (`users/[uuid]/+page.svelte`, selected examples):
```svelte
<!-- line 314 -->
<div class="text-muted-foreground">Loading...</div>
<!-- line 353 -->
Avatar Color
<!-- line 365 -->
{$form.avatar_color || 'Select color'}
<!-- line 389 -->
<FormLabel for={props.id}>Display Name</FormLabel>
<!-- line 393 -->
placeholder="Display name"
<!-- line 438 -->
<label for="idp-code" class="text-sm font-medium">IDP Code</label>
<!-- line 488 -->
<label for="is-active" class="text-sm font-medium">Is Active</label>
```

**AFTER:**
```svelte
<!-- line 314 -->
<div class="text-muted-foreground">{$t('common.loading')}</div>
<!-- line 353 -->
{$t('shell.settings.users.update.avatarColor')}
<!-- line 365 -->
{$form.avatar_color || $t('shell.settings.users.update.selectColorPlaceholder')}
<!-- line 389 -->
<FormLabel for={props.id}>{$t('shell.settings.users.update.displayName')}</FormLabel>
<!-- line 393 -->
placeholder={$t('shell.settings.users.update.displayNamePlaceholder')}
<!-- line 438 -->
<label for="idp-code" class="text-sm font-medium">{$t('shell.settings.users.update.idpCode')}</label>
<!-- line 488 -->
<label for="is-active" class="text-sm font-medium">{$t('shell.settings.users.update.isActive')}</label>
```

(Full replacement applies to all 17 hardcoded strings listed in the table above.)

### New i18n keys — ALL 6 language files

#### `shell.settings.users.create.rolesPlaceholder`

| File | Value |
|---|---|
| `en-GB.json` | `"Select roles..."` |
| `it-IT.json` | `"Seleziona ruoli..."` |
| `fr-FR.json` | `"Sélectionner des rôles..."` |
| `es-ES.json` | `"Seleccionar roles..."` |
| `de-DE.json` | `"Rollen auswählen..."` |
| `pt-PT.json` | `"Selecionar papéis..."` |

#### `shell.settings.users.create.idpOrgPlaceholder`

| File | Value |
|---|---|
| `en-GB.json` | `"Select organization..."` |
| `it-IT.json` | `"Seleziona organizzazione..."` |
| `fr-FR.json` | `"Sélectionner une organisation..."` |
| `es-ES.json` | `"Seleccionar organización..."` |
| `de-DE.json` | `"Organisation auswählen..."` |
| `pt-PT.json` | `"Selecionar organização..."` |

#### `shell.settings.users.update.rolesPlaceholder`

| File | Value |
|---|---|
| `en-GB.json` | `"Select roles..."` |
| `it-IT.json` | `"Seleziona ruoli..."` |
| `fr-FR.json` | `"Sélectionner des rôles..."` |
| `es-ES.json` | `"Seleccionar roles..."` |
| `de-DE.json` | `"Rollen auswählen..."` |
| `pt-PT.json` | `"Selecionar papéis..."` |

#### `shell.settings.users.update.selectColorPlaceholder`

| File | Value |
|---|---|
| `en-GB.json` | `"Select color"` |
| `it-IT.json` | `"Seleziona colore"` |
| `fr-FR.json` | `"Sélectionner une couleur"` |
| `es-ES.json` | `"Seleccionar color"` |
| `de-DE.json` | `"Farbe auswählen"` |
| `pt-PT.json` | `"Selecionar cor"` |

#### `shell.settings.users.update.idpOrg`

| File | Value |
|---|---|
| `en-GB.json` | `"Organization"` |
| `it-IT.json` | `"Organizzazione"` |
| `fr-FR.json` | `"Organisation"` |
| `es-ES.json` | `"Organización"` |
| `de-DE.json` | `"Organisation"` |
| `pt-PT.json` | `"Organização"` |

#### `shell.settings.users.update.idpUsername`

| File | Value |
|---|---|
| `en-GB.json` | `"Username"` |
| `it-IT.json` | `"Nome Utente"` |
| `fr-FR.json` | `"Nom d'utilisateur"` |
| `es-ES.json` | `"Nombre de usuario"` |
| `de-DE.json` | `"Benutzername"` |
| `pt-PT.json` | `"Nome de utilizador"` |

#### `shell.settings.users.update.issuer`

| File | Value |
|---|---|
| `en-GB.json` | `"Identity Issuer"` |
| `it-IT.json` | `"Emittente dell'Identità"` |
| `fr-FR.json` | `"Émetteur de l'identité"` |
| `es-ES.json` | `"Emisor de la identidad"` |
| `de-DE.json` | `"Identitäts-Aussteller"` |
| `pt-PT.json` | `"Emissor da identidade"` |

#### `shell.settings.users.update.isVerified`

| File | Value |
|---|---|
| `en-GB.json` | `"Identity Verified"` |
| `it-IT.json` | `"Identità Verificata"` |
| `fr-FR.json` | `"Identité vérifiée"` |
| `es-ES.json` | `"Identidad verificada"` |
| `de-DE.json` | `"Identität verifiziert"` |
| `pt-PT.json` | `"Identidade verificada"` |

#### `shell.settings.users.update.emailVerified`

| File | Value |
|---|---|
| `en-GB.json` | `"Email Verified"` |
| `it-IT.json` | `"Email Verificata"` |
| `fr-FR.json` | `"E-mail vérifiée"` |
| `es-ES.json` | `"Email verificado"` |
| `de-DE.json` | `"E-Mail verifiziert"` |
| `pt-PT.json` | `"E-mail verificada"` |

### Verification
- Switch UI language to each of the 6 locales (EN, IT, FR, ES, DE, PT).
- Open `/system/settings/users/create`:
  - Save button shows "Save" (EN) / "Salva" (IT) / etc. — NOT "common.create"
  - No hardcoded English strings remain
  - Trigger a validation error (e.g., type a short username) — error shows translated text like "Must be at least 5 characters", NOT "validation.tooShort"
- Open `/system/settings/users/{uuid}` (edit):
  - No hardcoded English strings remain; "Loading..." is translated
  - Trigger a validation error — error shows translated text, NOT raw key
- Open `/system/settings/profile`:
  - Trigger a validation error — error shows translated text, NOT raw key
- Compare CREATE and EDIT pages side by side — labels for the same fields use equivalent translations (create namespace vs update namespace).

---

## 4. "IDP Attivo" → "Abilitato" / "Enable" everywhere

### Evidence
`primebrick-fe-v3/src/lib/i18n/messages/it-IT.json` line 249:
```json
"shell.settings.users.create.idpActive": "IDP Attivo"
```

User list column labels use `entities.userProfile.fields.is_active`:
```json
"is_active": "Attivo",
"is_active_false": "Non attivo"
```

### Affected keys
- `shell.settings.users.create.idpActive`
- `shell.settings.users.update.isActive`
- `entities.userProfile.fields.is_active`
- `entities.userProfile.fields.is_active_false`

### Change — ALL 6 language files

| Key | en-GB | it-IT | fr-FR | es-ES | de-DE | pt-PT |
|---|---|---|---|---|---|---|
| `shell.settings.users.create.idpActive` | Enable | Abilitato | Activé | Habilitado | Aktiviert | Ativado |
| `shell.settings.users.update.isActive` | Enable | Abilitato | Activé | Habilitado | Aktiviert | Ativado |
| `entities.userProfile.fields.is_active` | Enable | Abilitato | Activé | Habilitado | Aktiviert | Ativado |
| `entities.userProfile.fields.is_active_false` | Disable | Disabilitato | Désactivé | Deshabilitado | Deaktiviert | Desativado |

### Pages affected
- `/system/settings/users` (list column header)
- `/system/settings/users/create` (checkbox label)
- `/system/settings/users/[uuid]` (readonly checkbox label)

### Verification
- Open `/system/settings/users` and check the active column header shows "Abilitato" (IT) / "Enable" (EN).
- Open `/system/settings/users/create` and check the active checkbox label.

---

## 5. Simplify all IDP-prefixed labels — remove "IDP" and "sync IDP", use plain meaning

### Rationale
The previous plan proposed adding "(sync IDP)" suffixes to all IDP-related labels. The user has decided to **simplify** instead: remove all "IDP" prefixes and "sync IDP" suffixes, and use plain, meaningful labels that describe what the field actually is. Some fields also get a **form description** (help tooltip) to explain their meaning.

### Affected forms
- Profile (`/system/settings/profile`)
- Users Create (`/system/settings/users/create`)
- User Edit (`/system/settings/users/[uuid]`)
- Organization Create (`/system/settings/organizations/create`)
- Organization Edit (`/system/settings/organizations/[uuid]`)

### Label changes — ALL 6 language files

#### User-related keys

| Key | en-GB | it-IT | fr-FR | es-ES | de-DE | pt-PT |
|---|---|---|---|---|---|---|
| `shell.settings.users.create.idpActive` | Enable | Abilitato | Activé | Habilitado | Aktiviert | Ativado |
| `shell.settings.users.create.idpAdmin` | System Administrator | Amministratore di Sistema | Administrateur système | Administrador del sistema | Systemadministrator | Administrador do sistema |
| `shell.settings.users.create.idpVerified` | Identity Verified | Identità Verificata | Identité vérifiée | Identidad verificada | Identität verifiziert | Identidade verificada |
| `shell.settings.users.create.idpEmailVerified` | Email Verified | Email Verificata | E-mail vérifiée | Email verificado | E-Mail verifiziert | E-mail verificada |
| `shell.settings.users.create.idpOrg` | Organization | Organizzazione | Organisation | Organización | Organisation | Organização |
| `shell.settings.users.create.idpUsername` | Username | Nome Utente | Nom d'utilisateur | Nombre de usuario | Benutzername | Nome de utilizador |
| `shell.settings.users.create.idpPassword` | Password | Password | Mot de passe | Contraseña | Passwort | Palavra-passe |
| `shell.settings.users.create.roles` | Application Roles | Ruoli Applicativi | Rôles applicatifs | Roles de aplicación | Anwendungsrollen | Papéis da aplicação |

#### Profile-related keys

| Key | en-GB | it-IT | fr-FR | es-ES | de-DE | pt-PT |
|---|---|---|---|---|---|---|
| `shell.settings.profile.idpCode` | Identity ID | ID Identità | ID d'identité | ID de identidad | Identitäts-ID | ID de identidade |
| `shell.settings.profile.idpOwner` | Identity Owner | Proprietario Identità | Propriétaire de l'identité | Propietario de la identidad | Identitäts-Eigentümer | Proprietário da identidade |
| `shell.settings.profile.idpName` | Identity Name | Nome Identità | Nom de l'identité | Nombre de la identidad | Identitäts-Name | Nome da identidade |
| `shell.settings.profile.idpAdmin` | System Administrator | Amministratore di Sistema | Administrateur système | Administrador del sistema | Systemadministrator | Administrador do sistema |
| `shell.settings.profile.idpVerified` | Identity Verified | Identità Verificata | Identité vérifiée | Identidad verificada | Identität verifiziert | Identidade verificada |
| `shell.settings.profile.idpEmailVerified` | Email Verified | Email Verificata | E-mail vérifiée | Email verificado | E-Mail verifiziert | E-mail verificada |
| `shell.settings.profile.idpIssuer` | Identity Issuer | Emittente dell'Identità | Émetteur de l'identité | Emisor de la identidad | Identitäts-Aussteller | Emissor da identidade |

#### User edit-related keys (users.update namespace)

| Key | en-GB | it-IT | fr-FR | es-ES | de-DE | pt-PT |
|---|---|---|---|---|---|---|
| `shell.settings.users.update.idpCode` | Identity ID | ID Identità | ID d'identité | ID de identidad | Identitäts-ID | ID de identidade |
| `shell.settings.users.update.idpOwner` | Identity Owner | Proprietario Identità | Propriétaire de l'identité | Propietario de la identidad | Identitäts-Eigentümer | Proprietário da identidade |
| `shell.settings.users.update.idpName` | Identity Name | Nome Identità | Nom de l'identité | Nombre de la identidad | Identitäts-Name | Nome da identidade |
| `shell.settings.users.update.idpOrg` | Organization | Organizzazione | Organisation | Organización | Organisation | Organização |
| `shell.settings.users.update.idpUsername` | Username | Nome Utente | Nom d'utilisateur | Nombre de usuario | Benutzername | Nome de utilizador |
| `shell.settings.users.update.issuer` | Identity Issuer | Emittente dell'Identità | Émetteur de l'identité | Emisor de la identidad | Identitäts-Aussteller | Emissor da identidade |
| `shell.settings.users.update.isActive` | Enable | Abilitato | Activé | Habilitado | Aktiviert | Ativado |
| `shell.settings.users.update.isAdmin` | System Administrator | Amministratore di Sistema | Administrateur système | Administrador del sistema | Systemadministrator | Administrador do sistema |
| `shell.settings.users.update.isVerified` | Identity Verified | Identità Verificata | Identité vérifiée | Identidad verificada | Identität verifiziert | Identidade verificada |
| `shell.settings.users.update.emailVerified` | Email Verified | Email Verificata | E-mail vérifiée | Email verificado | E-Mail verifiziert | E-mail verificada |
| `shell.settings.users.update.roles` | Application Roles | Ruoli Applicativi | Rôles applicatifs | Roles de aplicación | Anwendungsrollen | Papéis da aplicação |

#### Organization-related keys

| Key | en-GB | it-IT | fr-FR | es-ES | de-DE | pt-PT |
|---|---|---|---|---|---|---|
| `shell.settings.organizations.create.idpCode` | Identity ID | ID Identità | ID d'identité | ID de identidad | Identitäts-ID | ID de identidade |
| `shell.settings.organizations.create.idpOwner` | Identity Owner | Proprietario Identità | Propriétaire de l'identité | Propietario de la identidad | Identitäts-Eigentümer | Proprietário da identidade |
| `shell.settings.organizations.create.idpName` | Identity Name | Nome Identità | Nom de l'identité | Nombre de la identidad | Identitäts-Name | Nome da identidade |
| `shell.settings.organizations.update.idpCode` | Identity ID | ID Identità | ID d'identité | ID de identidad | Identitäts-ID | ID de identidade |
| `shell.settings.organizations.update.idpOwner` | Identity Owner | Proprietario Identità | Propriétaire de l'identité | Propietario de la identidad | Identitäts-Eigentümer | Proprietário da identidade |
| `shell.settings.organizations.update.idpName` | Identity Name | Nome Identità | Nom de l'identité | Nombre de la identidad | Identitäts-Name | Nome da identidade |

### New form description keys (help tooltips) — ALL 6 language files

These keys provide a help tooltip (rendered via `FormLabelWithHelp.svelte`, see point 6/7) next to the checkbox label.

#### `shell.settings.users.create.idpAdminHint` (already in point 6)

| File | Value |
|---|---|
| `en-GB.json` | `"TIPS: We suggest using Application Roles to determine user access. The Administrator flag is not a role and is subject to associated permissions, but a master key to access any entity in the system."` |
| `it-IT.json` | `"SUGGERIMENTO: Si consiglia di utilizzare i Ruoli Applicativi per determinare gli accessi di un utente. Il flag Amministratore non è un ruolo e quindi soggetto ai permessi associati, ma un passpartout per accedere indiscriminatamente a qualunque entità del sistema."` |
| `fr-FR.json` | `"SUGGESTION : Nous conseillons d'utiliser les Rôles applicatifs pour déterminer les accès d'un utilisateur. L'indicateur Administrateur n'est pas un rôle et donc soumis aux permissions associées, mais un passe-partout pour accéder indifféremment à toute entité du système."` |
| `es-ES.json` | `"SUGERENCIA: Sugerimos utilizar los Roles de aplicación para determinar los accesos de un usuario. El indicador Administrador no es un rol y por lo tanto está sujeto a los permisos asociados, sino un pase universal para acceder indiscriminadamente a cualquier entidad del sistema."` |
| `de-DE.json` | `"HINWEIS: Wir empfehlen, Anwendungsrollen zu verwenden, um die Zugriffsrechte eines Benutzers zu bestimmen. Das Administrator-Kennzeichen ist keine Rolle und unterliegt den zugehörigen Berechtigungen, sondern ein Universalschlüssel für den uneingeschränkten Zugriff auf jede Entität des Systems."` |
| `pt-PT.json` | `"SUGESTÃO: Aconselhamos utilizar os Papéis da aplicação para determinar os acessos de um utilizador. O indicador Administrador não é um papel e portanto sujeito às permissões associadas, mas um passe universal para aceder indiscriminadamente a qualquer entidade do sistema."` |

#### `shell.settings.users.create.idpVerifiedHint` (NEW)

| File | Value |
|---|---|
| `en-GB.json` | `"Indicates whether the identity verification process has been successfully completed. It may depend on a KYC process or other type of verification."` |
| `it-IT.json` | `"Identifica se il processo di riconoscimento dell'identità è stato concluso positivamente o meno. Può dipendere da un processo KYC o di altro genere."` |
| `fr-FR.json` | `"Indique si le processus de vérification d'identité a été conclu avec succès. Il peut dépendre d'un processus KYC ou d'un autre type de vérification."` |
| `es-ES.json` | `"Indica si el proceso de verificación de identidad se ha completado con éxito. Puede depender de un proceso KYC o de otro tipo de verificación."` |
| `de-DE.json` | `"Gibt an, ob der Identitätsverifizierungsprozess erfolgreich abgeschlossen wurde. Es kann von einem KYC-Prozess oder einer anderen Art der Verifizierung abhängen."` |
| `pt-PT.json` | `"Identifica se o processo de reconhecimento da identidade foi concluído positivamente ou não. Pode depender de um processo KYC ou de outro género."` |

#### `shell.settings.users.create.idpEmailVerifiedHint` (NEW)

| File | Value |
|---|---|
| `en-GB.json` | `"Indicates whether the email has been verified, typically via a link sent to the email inbox that is presumed to be readable only by the user whose profile we are configuring."` |
| `it-IT.json` | `"Identifica se la mail è stata verificata, tipicamente tramite un link inviato via email alla casella di posta accessibile che si presume sia leggibile solo dall'utente di cui stiamo configurando il profilo."` |
| `fr-FR.json` | `"Indique si l'e-mail a été vérifié, généralement via un lien envoyé à la boîte de réception qui est censée être lisible uniquement par l'utilisateur dont nous configurons le profil."` |
| `es-ES.json` | `"Indica si el email ha sido verificado, típicamente mediante un enlace enviado por email a la bandeja de entrada accesible que se presume que solo el usuario cuyo perfil estamos configurando puede leer."` |
| `de-DE.json` | `"Gibt an, ob die E-Mail verifiziert wurde, typischerweise über einen Link, der an das E-Mail-Postfach gesendet wurde, von dem angenommen wird, dass es nur vom Benutzer, dessen Profil wir konfigurieren, lesbar ist."` |
| `pt-PT.json` | `"Identifica se o email foi verificado, tipicamente através de um link enviado por email para a caixa de correio acessível que se presume ser legível apenas pelo utilizador cujo perfil estamos a configurar."` |

### Verification
- Visit each form (Profile, Users Create, User Edit, Organization Create, Organization Edit).
- No label should contain "IDP" prefix or "(sync IDP)" suffix.
- Labels should show plain meaning: "Abilitato", "Amministratore di Sistema", "Identità Verificata", "Email Verificata", "Organizzazione", "Nome Utente", "Password", "Ruoli Applicativi".
- Hover the help icon next to "Amministratore di Sistema", "Identità Verificata", "Email Verificata" — tooltip shows the form description text.
- Switch UI to each of the 6 locales and confirm all labels are translated.

---

## 6. `is_admin` checkbox first + help icon

### Evidence
`primebrick-fe-v3/src/routes/(app)/system/settings/users/create/+page.svelte` lines 453–477 order is `is_active`, `is_admin`, `is_verified`, `email_verified`.
`primebrick-fe-v3/src/routes/(app)/system/settings/profile/+page.svelte` lines 618–664 order is `is_verified`, `email_verified`, `is_admin`.

### Change
Create `FormLabelWithHelp.svelte` and reorder. In user create, `is_admin` becomes the first checkbox, with help tooltips on `is_admin`, `is_verified`, and `email_verified`:

```svelte
<FormField name="is_admin">
  <Checkbox {...props} bind:checked={$form.is_admin} id="is_admin" />
  <label for="is_admin" class="inline-flex items-center gap-1">
    {$t('shell.settings.users.create.idpAdmin')}
    <FormLabelWithHelp text={$t('shell.settings.users.create.idpAdminHint')} />
  </label>
</FormField>
<FormField name="is_active">...</FormField>
<FormField name="is_verified">
  <Checkbox {...props} bind:checked={$form.is_verified} id="is_verified" />
  <label for="is_verified" class="inline-flex items-center gap-1">
    {$t('shell.settings.users.create.idpVerified')}
    <FormLabelWithHelp text={$t('shell.settings.users.create.idpVerifiedHint')} />
  </label>
</FormField>
<FormField name="email_verified">
  <Checkbox {...props} bind:checked={$form.email_verified} id="email_verified" />
  <label for="email_verified" class="inline-flex items-center gap-1">
    {$t('shell.settings.users.create.idpEmailVerified')}
    <FormLabelWithHelp text={$t('shell.settings.users.create.idpEmailVerifiedHint')} />
  </label>
</FormField>
```

### New i18n keys — ALL 6 language files

The `idpAdminHint` key is defined here. The `idpVerifiedHint` and `idpEmailVerifiedHint` keys are defined in phase 5 (they are listed there because they belong to the same simplification effort).

**Key:** `shell.settings.users.create.idpAdminHint`

| File | Value |
|---|---|
| `en-GB.json` | `"TIPS: We suggest using Application Roles to determine user access. The Administrator flag is not a role and is subject to associated permissions, but a master key to access any entity in the system."` |
| `it-IT.json` | `"SUGGERIMENTO: Si consiglia di utilizzare i Ruoli Applicativi per determinare gli accessi di un utente. Il flag Amministratore non è un ruolo e quindi soggetto ai permessi associati, ma un passpartout per accedere indiscriminatamente a qualunque entità del sistema."` |
| `fr-FR.json` | `"SUGGESTION : Nous conseillons d'utiliser les Rôles applicatifs pour déterminer les accès d'un utilisateur. L'indicateur Administrateur n'est pas un rôle et donc soumis aux permissions associées, mais un passe-partout pour accéder indifféremment à toute entité du système."` |
| `es-ES.json` | `"SUGERENCIA: Sugerimos utilizar los Roles de aplicación para determinar los accesos de un usuario. El indicador Administrador no es un rol y por lo tanto está sujeto a los permisos asociados, sino un pase universal para acceder indiscriminadamente a cualquier entidad del sistema."` |
| `de-DE.json` | `"HINWEIS: Wir empfehlen, Anwendungsrollen zu verwenden, um die Zugriffsrechte eines Benutzers zu bestimmen. Das Administrator-Kennzeichen ist keine Rolle und unterliegt den zugehörigen Berechtigungen, sondern ein Universalschlüssel für den uneingeschränkten Zugriff auf jede Entität des Systems."` |
| `pt-PT.json` | `"SUGESTÃO: Aconselhamos utilizar os Papéis da aplicação para determinar os acessos de um utilizador. O indicador Administrador não é um papel e portanto sujeito às permissões associadas, mas um passe universal para aceder indiscriminadamente a qualquer entidade do sistema."` |

**Key:** `shell.settings.users.create.idpVerifiedHint` — see phase 5 table.

**Key:** `shell.settings.users.create.idpEmailVerifiedHint` — see phase 5 table.

### Verification
- `is_admin` is the first checkbox in the IDP column.
- Clicking the question icon shows the tooltip.

---

## 7. Metadata-driven description tooltips (standard)

### Evidence
`primebrick-fe-v3/src/lib/entity-list/types.ts` `MetaColumn` (lines 21–45) has no `formDescription`/`listDescription` fields.
`primebrick-be-v3/src/openapi/openapi.ts` `EntityMetaResponse` (lines 562–658) does not define them either.

### Change

**Frontend `MetaColumn`:**
```ts
export type MetaColumn = {
  key: string;
  labelKey: string;
  type: 'text' | 'badge' | 'date' | 'datetime' | 'color' | string;
  formDescription?: string;  // i18n key shown next to form labels
  listDescription?: string;  // i18n key shown next to table/card headers
  // ...existing flags
};
```

**Backend OpenAPI schema** (`primebrick-be-v3/src/openapi/openapi.ts`):
```ts
formDescription: { type: "string", description: "i18n key for form help tooltip" },
listDescription: { type: "string", description: "i18n key for list header help tooltip" },
```

**Backend metadata endpoints:**
Add `formDescription`/`listDescription` to relevant columns in:
- `primebrick-be-v3/src/modules/auth/router.ts` (user_profiles/meta, lines 1339–1420)
- `primebrick-be-v3/src/modules/auth/organizations_router.ts` (organization/meta, lines 47–118)

Example:
```ts
{ key: "is_admin", labelKey: "entities.userProfile.fields.is_admin", type: "boolean", formDescription: "entities.userProfile.hints.is_admin", listDescription: "entities.userProfile.hints.is_admin" }
```

**UI:**
- `FormLabelWithHelp.svelte` renders a help icon when `formDescription` is present.
- `primebrick-fe-v3/src/lib/components/entity-list-table/table/TableHeader.svelte` renders a help icon next to the header text when `col.listDescription` is present.
- Card view headers (`primebrick-fe-v3/src/lib/components/entity-list-table/cards/CardField.svelte`) use the same component.

### Verification
- Load a form with a metadata-provided `formDescription`; icon appears.
- Load a list with a metadata-provided `listDescription`; icon appears in the header.

---

## 8. (MERGED into phase 5) IDP Verificato → "Identità Verificata"

This was previously a separate phase. It is now part of phase 5 — see the `idpVerified` rows in the phase 5 tables.

**Keys affected:** `shell.settings.profile.idpVerified`, `shell.settings.users.create.idpVerified`, `shell.settings.users.update.isVerified`

**New values:** "Identity Verified" (EN) / "Identità Verificata" (IT) / etc. — no "IDP" prefix, no "(sync IDP)" suffix.

**New form description key:** `shell.settings.users.create.idpVerifiedHint` — see phase 5.

---

## 9. (MERGED into phase 5) IDP Email Verificata → "Email Verificata"

This was previously a separate phase. It is now part of phase 5 — see the `idpEmailVerified` rows in the phase 5 tables.

**Keys affected:** `shell.settings.profile.idpEmailVerified`, `shell.settings.users.create.idpEmailVerified`, `shell.settings.users.update.emailVerified`

**New values:** "Email Verified" (EN) / "Email Verificata" (IT) / etc. — no "IDP" prefix, no "(sync IDP)" suffix.

**New form description key:** `shell.settings.users.create.idpEmailVerifiedHint` — see phase 5.

---

## 10. (MERGED into phase 5) IDP Organizzazione → "Organizzazione"

This was previously a separate phase. It is now part of phase 5 — see the `idpOrg` rows in the phase 5 tables.

**Key affected:** `shell.settings.users.create.idpOrg`, `shell.settings.users.update.idpOrg`

**New values:** "Organization" (EN) / "Organizzazione" (IT) / etc. — no "IDP" prefix, no "(sync IDP)" suffix.

---

## 11. Organization switcher from active DB organizations with avatar

### Evidence
`AppSidebar.svelte` lines 45–50 uses a hard-coded demo switcher:

```ts
type DemoOrgId = 'acme' | 'johnDoe';
let selectedOrgId = $state<DemoOrgId>('acme');
const selectedOrgLabel = $derived(
  selectedOrgId === 'acme' ? $t('shell.org.acme') : $t('shell.org.johnDoe')
);
```

`primebrick-be-v3/src/modules/auth/organization_entity.ts` currently has no `is_active` or `avatar` fields.

### Required changes

**Backend:**
- Add `is_active?: boolean` and `avatar?: string` (base64) to `OrganizationEntity`.
- Add `listActiveOrganizations()` to `OrganizationsDal`.
- Expose `GET /api/v1/entities/organization/active` (or filtered `/list`).
- Sync `defaultAvatar` from Casdoor during create/update in `casdoor-api-client.ts`.

**Frontend `AppSidebar.svelte`:**
- Replace demo switcher with an API call.
- Replace `Building2` with an `Avatar` rendering `organization.avatar`.
- For each `DropdownMenu.Item`, show the org avatar on the left.

**BEFORE:**
```svelte
<div class="flex size-8 ...">
  <Building2 class="size-4 opacity-90" />
</div>
```

**AFTER:**
```svelte
<div class="flex size-8 ...">
  <Avatar class="size-8 rounded-none">
    {#if org.avatar}
      <img src={org.avatar} alt={org.display_name} />
    {:else}
      <AvatarFallback>{org.initials}</AvatarFallback>
    {/if}
  </Avatar>
</div>
```

### Verification
- Sidebar top switcher shows real organizations.
- Each menu item shows the org avatar.
- Only active organizations appear.

---

## 12. App Top Bar border / shadow

### Evidence
`primebrick-fe-v3/src/lib/components/AppTopbar.svelte` line 118 has both `border-b border-border` and `shadow-sm`:

```svelte
<header
  class="sticky top-0 z-30 min-w-0 w-full overflow-visible border-b border-border bg-background text-foreground shadow-sm dark:border-border/60 dark:bg-muted/25 dark:backdrop-blur-xs"
>
```

This creates a visible border + a subtle shadow, giving the "double border" appearance.

### Proposed change
Remove the border and use a slightly larger shadow:

```svelte
<header
  class="sticky top-0 z-30 min-w-0 w-full overflow-visible bg-background text-foreground shadow-md dark:bg-muted/25 dark:backdrop-blur-xs"
>
```

If the user prefers a border instead, use `border-b border-sidebar-border` and remove `shadow-sm`.

### Verification
- The top bar has a single visible separator with a wider shadow.

---

## Files to modify

### Frontend
- `primebrick-fe-v3/src/lib/components/AppSidebar.svelte`
- `primebrick-fe-v3/src/lib/components/AppTopbar.svelte`
- `primebrick-fe-v3/src/lib/components/entity-list-table/table/TableHeader.svelte`
- `primebrick-fe-v3/src/lib/components/entity-list-table/cards/CardField.svelte`
- `primebrick-fe-v3/src/lib/components/forms/FormLabelWithHelp.svelte` (new)
- `primebrick-fe-v3/src/lib/entity-list/types.ts`
- `primebrick-fe-v3/src/lib/i18n/messages/de-DE.json`
- `primebrick-fe-v3/src/lib/i18n/messages/en-GB.json`
- `primebrick-fe-v3/src/lib/i18n/messages/es-ES.json`
- `primebrick-fe-v3/src/lib/i18n/messages/fr-FR.json`
- `primebrick-fe-v3/src/lib/i18n/messages/it-IT.json`
- `primebrick-fe-v3/src/lib/i18n/messages/pt-PT.json`
- `primebrick-fe-v3/src/routes/(app)/system/settings/profile/+page.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/users/create/+page.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/users/[uuid]/+page.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/organizations/create/+page.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/organizations/[uuid]/+page.svelte`

### Backend
- `primebrick-be-v3/src/modules/auth/organization_entity.ts`
- `primebrick-be-v3/src/modules/auth/organizations_dal.ts`
- `primebrick-be-v3/src/modules/auth/organizations_router.ts`
- `primebrick-be-v3/src/modules/auth/router.ts`
- `primebrick-be-v3/src/openapi/openapi.ts`
- `primebrick-be-v3/src/modules/auth/casdoor-api-client.ts`

---

## Verification checklist

- [ ] `pnpm run check` passes in `primebrick-fe-v3`
- [ ] `pnpm run build` passes in `primebrick-fe-v3`
- [ ] Profile menu item navigates when clicking outside icon/label
- [ ] Collapsed health badge shows styled tooltip
- [ ] Create User save button shows "Save" (not "common.create")
- [ ] Create User placeholders are translated
- [ ] Validation errors show translated text (not raw `validation.*` keys) on: Users Create, User Edit, Profile
- [ ] No page shows "IDP Attivo", "IDP Active", or any "IDP" prefix or "(sync IDP)" suffix
- [ ] Labels show simplified meanings: "Abilitato", "Amministratore di Sistema", "Identità Verificata", "Email Verificata", "Organizzazione", "Nome Utente", "Password", "Ruoli Applicativi"
- [ ] Help tooltips appear next to "Amministratore di Sistema", "Identità Verificata", "Email Verificata" with form description text
- [ ] `is_admin` is first checkbox and shows help tooltip
- [ ] Metadata-driven help icons appear in forms and list headers
- [ ] Organization switcher shows real active organizations with avatars
- [ ] App Top Bar has a clean single shadow without double border
- [ ] **ALL 6 language files updated** — verify each key exists in `en-GB.json`, `it-IT.json`, `fr-FR.json`, `es-ES.json`, `de-DE.json`, `pt-PT.json`
- [ ] **No missing translations** — switch UI language to each of the 6 supported locales and verify no raw key paths or English fallbacks appear on: Profile, Users Create, User Edit, Organization Create, Organization Edit, Users List, sidebar health badge tooltip, help tooltips

---

## Risks / considerations

1. **Point 7** changes the shared metadata contract. The new fields are optional, so it is backward compatible.
2. **Point 11** requires DB schema changes for `organizations`. If migrations are not desired in this batch, we can first show non-deleted organizations with a generated avatar fallback and add the real Casdoor sync in a follow-up.
3. **Points 4, 5, 8, 9, 10** change many translation values but keep the same keys, so no code references need updating. The i18n key names still contain "idp" (e.g., `shell.settings.users.create.idpActive`) but the **displayed values** no longer contain "IDP" — this is intentional, the key names are internal identifiers.

---

## Approval

Reply with **PROCEED** to start implementation. If you want to adjust the label wording for point 5 or the Top Bar approach for point 12, tell me now.
