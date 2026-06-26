# User Manager UI Fixes Plan — v3

**Date:** 2026-06-23 (updated 2026-06-24 after BE router refactoring)
**Stack:** SvelteKit + Svelte 5 + TypeScript + shadcn-svelte + bits-ui (frontend) + Express + PostgreSQL (backend)
**Scope:** Frontend (`primebrick-fe-v3`) + backend (`primebrick-be-v3`)
**Previous sessions:** `user-manager-ui-fixes-plan.md` (v1), `user-manager-ui-fixes-plan-v2.md` (v2) — both implemented.

---

## BE router refactoring (2026-06-24 update)

The monolithic `src/modules/auth/router.ts` (1600 lines) has been refactored into a thin aggregator that mounts 4 specialized routers, each backed by a request-context-free service:

| Router file | Endpoints | Service |
|---|---|---|
| `routers/auth-session.router.ts` | login / refresh / me / me/meta | `AuthSessionService` |
| `routers/auth-check.router.ts` | check-email / check-username | `UserService` |
| `routers/users.router.ts` | POST/PATCH/DELETE /auth/users | `UserService` |
| `routers/user-profiles.router.ts` | user_profiles entity CRUD (meta/list/get/restore/audit/put) | `UserService` |

**Impact on this plan:** Several BE changes from v2 are now ALREADY DONE as part of the refactoring:
- ✅ check-username endpoint: `idp_org` is now REQUIRED (no env-var fallback) — `auth-check.router.ts` line 55-58
- ✅ check-username uses `listUsers` + filter DSL (not raw SQL) — `user.service.ts` `checkUsernameAvailability()` lines 345-375
- ✅ `getByUsernameAndOrg` raw SQL method removed — replaced by `listUsers` with `idp_username` + `idp_org` filters
- ✅ `idp_username` and `idp_org` added to DAL `allowedFields` — `user-profiles-dal.ts` line 320
- ✅ `/api/v1/auth/me/meta` has `columns` array with tooltip metadata — `auth-session.router.ts` lines 54-58
- ✅ `/api/v1/entities/user_profiles/meta` extracted to `user-profiles.meta.ts` with tooltip metadata — lines 26-28
- ✅ `/api/v1/auth/me` returns `roles` in profile (via `UserProfileDetailDto` which includes `roles?: string[]`) — `user-profiles-dal.ts` line 26

**Remaining BE changes needed:**
- Issue 3: Add `idp_name` to orgs/active DTO in `system-router.ts` (1-line addition)
- Issue 16b: Migration patch to seed org avatar paths in DB

---

## User decisions (confirmed this session)

| Decision | Choice |
|---|---|
| #4 Form validity → save button | **Page controls button** — each page derives `canSave` from `$allErrors` + async status and sets `disabled` on the save button directly. No FormPageLayout changes. |
| #15 Readonly roles on PROFILE | **Disabled ComboSelect (multi mode)** — reuse the new unified ComboSelect with `mode="multi" disabled=true`. If ComboSelect is not yet migrated, use existing MultiSelect with `disabled=true` temporarily. |
| #1b ComboSelect option model | **No DTO conversion** — accept any object shape; use `valueField`/`labelField` props (dot-path) + `isLabelTranslated` bool. If no field specified, use the option itself as both value and label. |
| #2 Hint color | **No new component** — just change `text-muted-foreground` to `text-info` on existing hint elements. |
| #7 display_name | **Required field** — change from optional to required in CREATE/EDIT/PROFILE schemas. |
| #11 Health badge | **Fix root cause** — Svelte 5 compiler unwraps `$derived` with `$.get()` at composable return point, producing frozen snapshots. Fix: refactor `useHealthChip` to return pure functions + `backendState` reference (Option A); components declare their own `$derived`. |
| #16a sharp | **Install globally** — `pnpm add -g sharp`, generate images, leave or remove after. |
| #16b migration | **One-time SQL patch** — run directly, don't add migration files to project repo. |
| #16 Org avatar images | **FE public/ folder** — generate WEBP images in `primebrick-fe-v3/public/org-avatars/`, store path like `/org-avatars/<idp_name>.webp` in DB `avatar` field. |

---

## Translation policy

Every translation change MUST be applied to **ALL 6 language files** in `primebrick-fe-v3/src/lib/i18n/messages/`:
`en-GB.json`, `it-IT.json`, `fr-FR.json`, `es-ES.json`, `de-DE.json`, `pt-PT.json`

---

## Empirical evidence summary

| Fact | Source |
|---|---|
| Custom `Select` component uses `<Input readonly>` as trigger — only used in CREATE user page | `src/lib/components/ui/select/select.svelte` |
| `MultiSelect` uses a `<div>` trigger with badges — used in CREATE and EDIT | `src/lib/components/ui/multi-select/multi-select.svelte` |
| `Input` has `display: flex` class but no `text-center` | `src/lib/components/ui/input/input.svelte` |
| bits-ui Popover.Content is NOT portaled (no Portal in popper-layer) | `node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-layer-inner.svelte` |
| bits-ui Tooltip.Content is NOT portaled either (same PopperLayer) | `node_modules/bits-ui/dist/bits/tooltip/components/tooltip-content.svelte` |
| Page content container in AppShell: `<div class="relative z-0 ...">` creates stacking context | `src/lib/components/AppShell.svelte` line 93 |
| Sidebar is `fixed z-10` | `src/lib/components/ui/sidebar/sidebar.svelte` line 76 |
| Popover content is `z-120` but bounded by parent `z-0` stacking context | `src/lib/components/ui/popover/popover-content.svelte` line 20 |
| `PriorityTooltipContent` HINT maps to `text-warning` (should be `text-info`) | `src/lib/components/ui/tooltip/priority-tooltip-content.svelte` line 51 |
| `PriorityTooltipContent` children div uses `text-background/80` (slightly transparent) | same file line 77 |
| Standard `Tooltip.Content` uses fully opaque `text-background` | `src/lib/components/ui/tooltip/tooltip-content.svelte` line 18 |
| MultiSelect badge remove button: `hover:bg-destructive/20` (destructive hover) | `src/lib/components/ui/multi-select/multi-select.svelte` line 113 |
| MultiSelect clear-all button: `hover:bg-destructive/10 hover:text-destructive` (destructive hover) | same file line 125 |
| CREATE page: org dropdown value = `o.idp_code` (e.g. "admin/acme") — WRONG, should be `o.idp_name` (e.g. "acme") | `src/routes/(app)/system/settings/users/create/+page.svelte` line 49 |
| BE orgs/active endpoint returns `{ uuid, idp_code, display_name, avatar }` — does NOT return `idp_name` (but `OrganizationDetailDto` HAS `idp_name`, just not mapped in DTO) | `primebrick-be-v3/src/modules/system/system-router.ts` lines 23-28; `organizations_dal.ts` line 20 |
| BE check-username: `idp_org` is REQUIRED, uses `listUsers` + filter DSL, Casdoor fallback with `${idpOrg}/${username}` query | `routers/auth-check.router.ts` lines 52-68; `services/user.service.ts` lines 345-375 |
| BE create-user uses `idp_org` as Casdoor `owner` field (org name, not idp_code) | `services/user.service.ts` line 59 (`owner: idpOrg`) |
| Organization entity has `idp_code` (="admin/acme"), `idp_owner` (="admin"), `idp_name` (="acme") | `primebrick-be-v3/src/modules/auth/organization_entity.ts` lines 43-49 |
| BE `/api/v1/auth/me` returns `roles` in profile via `UserProfileDetailDto` (includes `roles?: string[]`) | `user-profiles-dal.ts` line 26; `auth-session.service.ts` `getMe()` line 192-199 |
| BE `/api/v1/auth/me/meta` has `columns` array with tooltip metadata for is_admin/is_verified/email_verified | `routers/auth-session.router.ts` lines 54-58 |
| BE `/api/v1/entities/user_profiles/meta` extracted to `user-profiles.meta.ts` with tooltip metadata | `user-profiles.meta.ts` lines 26-28 |
| `display_name` in CREATE schema: `.optional().or(z.literal(''))` — already NOT required | `users/create/+page.svelte` lines 144-148 |
| superforms provides `allErrors: Readable<{path, messages}[]>` — can derive validity | `node_modules/sveltekit-superforms/dist/client/superForm.d.ts` |
| SidebarHealthBadge tooltip uses `health?.version` from `useHealthChip()` → `backendState.health` | `src/lib/components/sidebar/SidebarHealthBadge.svelte` line 68 |
| VersionsPanel uses same `backendState.health` — user reports panel works but tooltip shows "—" | `src/lib/shell/sheets/panels/VersionsPanel.svelte` line 73 |
| SidebarOrgSwitcher: when `avatar` is null, shows `AvatarFallback` with initials (WRONG — should show image-off icon) | `src/lib/components/sidebar/SidebarOrgSwitcher.svelte` lines 88-93 |
| Health badge "Loading..." label = `healthChip === 'loading'` = `backendState.health === null` | `src/lib/composables/useHealthChip.svelte.ts` lines 20-22 |
| **ROOT CAUSE (Issue 11):** Svelte 5 compiler unwraps `$derived` with `$.get()` at return point of composable function — returned values are frozen snapshots, not reactive signals | Verified by compiling `useHealthChip.svelte.ts` with `svelte/compiler` `compileModule()` on Svelte 5.56.0 |
| Composable compiled: `return { health: $.get(health), ... }` — `$.get()` reads value ONCE at call time, no ongoing reactivity | Svelte 5.56.0 compiler output |
| Component-level `$derived` compiled: `$.template_effect(() => $.set_text(text, $.get(health)?.version))` — `$.get()` inside reactive effect, re-runs on signal change | Svelte 5.56.0 compiler output |
| **RULE:** Cannot return `$derived` values from a composable function in `.svelte.ts` — compiler unwraps them at return point, killing reactivity | Svelte 5 compiler behavior |
| AppShell polling stops when healthy: `if (!offline && !dbDown && !idpDown) return` | `src/lib/components/AppShell.svelte` lines 49-57 |
| BE has no static file serving (no express.static) | grep confirmed |
| FE public/ has only `favicon.svg` and `icons.svg` | `primebrick-fe-v3/public/` |
| Profile page: no roles field at all (cannot see assigned roles) | `src/routes/(app)/system/settings/profile/+page.svelte` |
| Edit user page: roles via MultiSelect (editable), IDP fields readonly | `src/routes/(app)/system/settings/users/[uuid]/+page.svelte` |

---

## Previously skipped / deferred items (from v1 & v2 plans)

| Item | Status | Action |
|---|---|---|
| `casdoor_admin_role` config unused | Dead code — NOW INCLUDED in this plan | **Issue 17 (new):** Remove from `config-repo.ts` |
| `is_verified` not enforced | By design (future KYC) | Skip — no change needed |
| Section 15 (AppSidebar refactoring) | Implemented in v2 | Already done — sub-components extracted |
| Org dropdown endpoint concern: "admin may need ALL orgs" | Noted as risk in v2 | Current endpoint returns all active orgs (page_size=100) — acceptable for now |

---

## Issue-by-issue plan

### Issue 1: Org dropdown selected value appears centered (should be left-aligned)

**Root cause:** The custom `Select` component (`src/lib/components/ui/select/select.svelte`) uses `<Input readonly>` as its Popover trigger. This is a hand-rolled component — NOT the official shadcn-svelte/bits-ui Select (which uses a `<button>` trigger). The `<Input readonly>` with `flex` display causes inconsistent text alignment. The project has two separate custom dropdown components with different trigger patterns:
- `Select` → `<Input readonly>` trigger (used ONLY for org dropdown in CREATE)
- `MultiSelect` → `<div>` trigger (used for roles in CREATE/EDIT)

**Immediate fix (Phase 1):** Refactor `Select` trigger from `<Input readonly>` to `<div>`, matching the MultiSelect pattern.

**File:** `src/lib/components/ui/select/select.svelte`

**Changes:**
- Replace the `<Input readonly>` trigger with a `<div>` styled identically to the MultiSelect trigger:
  ```svelte
  <div
    {...triggerProps}
    {id}
    {name}
    class={cn(
      "min-h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background",
      "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "cursor-pointer flex items-center text-left",
      "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
    )}
  >
    <span class={cn("flex-1 truncate text-left", !selectedOption && "text-muted-foreground")}>
      {selectedOption?.label || placeholder}
    </span>
  </div>
  ```
- Move the chevron/loading spinner inside the div (right-aligned with `ml-auto`)
- Remove the `Input` import (no longer needed)
- This makes Select visually consistent with MultiSelect

**Why this prevents recurrence:** Both single-select and multi-select dropdowns now use the same `<div>`-based trigger pattern. No `<Input readonly>` is used for dropdown triggers anywhere.

---

### Issue 1b: New unified `ComboSelect` component (replaces both Select and MultiSelect)

**Goal:** Create a single reusable component that handles BOTH single-select and multi-select modes, with a `<div>` trigger, optional search, customizable item rendering, and support for string arrays, object notation, and i18n labelKey.

**New file:** `src/lib/components/ui/combo-select/combo-select.svelte`

#### Component API

```typescript
type ComboSelectMode = "single" | "multi";

type Props = {
  // --- Selection ---
  mode: ComboSelectMode;                    // "single" | "multi"
  value: $bindable<string | string[]>;      // string for single, string[] for multi
  onChange?: (value: string | string[]) => void;

  // --- Options ---
  // Accept ANY shape: string[], or array of complex objects (no DTO conversion needed).
  // The component uses valueField/labelField to extract value and label from objects.
  // If options is string[], each string is both the value and the label.
  options: string[] | Record<string, any>[];

  // --- Field selection (for object options) ---
  // Which property to use as the option's value. Dot-path supported (e.g. "idp_name").
  // If omitted AND options is string[], the string itself is the value.
  // If omitted AND options is object[], the entire object is used as value (rare, but supported).
  valueField?: string;

  // Which property to use as the option's display label. Dot-path supported (e.g. "display_name").
  // If omitted, the value itself is used as the label (even if it's an object — toString'd).
  labelField?: string;

  // If true, the resolved label is wrapped in $t() for i18n translation.
  // Useful when labelField points to a labelKey (e.g. "label_key" from BE role_mappings).
  isLabelTranslated?: boolean;              // default: false

  // --- Display ---
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  name?: string;

  // --- Search ---
  searchable?: boolean;                     // default: true — show/hide the Command.Input search box
  searchPlaceholder?: string;

  // --- Item rendering ---
  // Optional snippet to customize item content INSIDE the dropdown.
  // For multi mode: the checkbox is ALWAYS rendered by the component (before the snippet).
  // For single mode: no checkbox — the snippet (or default text) fills the row.
  // If no snippet is provided, default behavior renders the resolved label text.
  // The snippet receives the RAW option object (whatever was passed in the options array)
  // plus `selected` boolean and `resolvedLabel` string (pre-resolved using labelField/isLabelTranslated).
  itemSnippet?: Snippet<[{
    option: string | Record<string, any>;
    selected: boolean;
    resolvedLabel: string;
    resolvedValue: string;
  }]>;

  // --- Trigger display (for single mode) ---
  // Optional snippet to customize what shows in the trigger div when an item is selected.
  // If omitted, shows the resolved label text.
  selectedSnippet?: Snippet<[{
    option: string | Record<string, any>;
    resolvedLabel: string;
    resolvedValue: string;
  }]>;

  // --- ARIA / formsnap ---
  'aria-invalid'?: boolean | "true" | "false";
  'aria-describedby'?: string;
  'aria-required'?: boolean | "true" | "false";
  'data-fs-error'?: string;
  [key: string]: unknown;
};
```

#### Value & label resolution (no DTO conversion)

The component accepts ANY object shape — no need to convert API responses to a `{ value, label }` format. Instead, the consumer tells the component which fields to use:

**Case 1 — Array of strings (e.g. roles):**
```typescript
options={["administrators", "sales", "hr"]}
// No valueField/labelField needed — each string is both value and label
```

**Case 2 — Array of objects with field paths (e.g. orgs):**
```typescript
options={availableOrgs}  // raw API response: [{ uuid, idp_code, idp_name, display_name, avatar }, ...]
valueField="idp_name"    // use idp_name as the value
labelField="display_name" // use display_name as the label
// No DTO conversion — pass the API response directly
```

**Case 3 — Array of objects with i18n labelKey (e.g. roles with label_key from BE):**
```typescript
options={availableRoles}  // raw API response: [{ idp_role: "administrators", label_key: "roles.administrators" }, ...]
valueField="idp_role"     // use idp_role as the value
labelField="label_key"    // use label_key as the label
isLabelTranslated={true}  // wrap label in $t() → $t("roles.administrators")
```

**Case 4 — No labelField specified:**
```typescript
options={["admin", "acme"]}
// value = "admin", label = "admin" (the value itself)
```

**Resolution order:**
1. If `labelField` is specified → extract value via dot-path from the option object
2. If `isLabelTranslated` is true → wrap the extracted value in `$t()`
3. If `labelField` is NOT specified → use the resolved value as the label (even if it's an object, use `String(value)`)
4. If options is `string[]` → each string is both value and label (no field extraction needed)

#### Search behavior (client-side by default, server-side optional)

**Current state:** The bits-ui `Command.Root` component does **client-side filtering** via a `filter` function and `shouldFilter` boolean (verified in `node_modules/bits-ui/dist/bits/command/command.svelte.d.ts`). Both existing components (Select and MultiSelect) use `Command.Input` + `Command.List` with client-side filtering.

**New component design:**
- `searchable={true}` (default): Shows the `Command.Input` search box. Filtering is **client-side** via the existing bits-ui Command filter mechanism. This is the same behavior as the current Select and MultiSelect.
- `searchable={false}`: Hides the `Command.Input` entirely. All options are shown without filtering. The `Command.Root` `shouldFilter` is set to `false`.
- **Server-side search (future extension):** If a `onSearch` callback prop is provided, the component delegates search to the parent: it shows the search box, but instead of client-side filtering, it calls `onSearch(query)` and the parent updates the `options` prop. The component sets `shouldFilter={false}` on `Command.Root` to prevent double-filtering. This is NOT implemented in the initial version — documented as a future extension point.

#### Item rendering rules

**Single mode:**
- No checkbox
- Row content = `itemSnippet` (if provided) OR default label text
- Clicking a row selects it and closes the dropdown
- Example: org dropdown shows `{label: "Acme Corp", idp_name: "acme"}` as a two-line item (label + sub-label) via `itemSnippet`

**Multi mode:**
- Checkbox is ALWAYS rendered by the component (left side, before the snippet/content)
- Row content after checkbox = `itemSnippet` (if provided) OR default label text
- Clicking a row toggles selection (does NOT close the dropdown)
- Badges in the trigger show selected values (same as current MultiSelect)
- The clear-all X button and per-badge X button work as in current MultiSelect

#### Trigger display

**Single mode:**
- `<div>` trigger shows the selected option's resolved label (or `selectedSnippet` if provided)
- Text is left-aligned (`text-left` class on the trigger div)
- Chevron/loading spinner on the right (`ml-auto`)
- Clear X button appears next to chevron when a value is selected and `disabled` is false

**Multi mode:**
- `<div>` trigger shows badges for each selected value (same as current MultiSelect)
- Badges are left-aligned, wrapping with `flex-wrap`
- Clear-all X button + chevron on the right (`ml-auto`)

#### Migration plan (after initial fix)

1. **Phase 1 (immediate):** Fix the existing `Select` trigger to `<div>` (Issue 1 fix above)
2. **Phase 2 (new component):** Create `ComboSelect` component with full API
3. **Phase 3 (migration — roles):** Replace `MultiSelect` usage in CREATE and EDIT pages with `<ComboSelect mode="multi">`
4. **Phase 4 (migration — orgs):** Replace `Select` usage in CREATE page org dropdown with `<ComboSelect mode="single">` using `valueField="idp_name"` and `labelField="display_name"` (raw API response, no DTO conversion)
5. **Phase 5 (cleanup):** Remove old `Select` and `MultiSelect` components once all usages are migrated
6. **Phase 6 (PROFILE):** Use `<ComboSelect mode="multi" disabled>` for readonly roles display (Issue 15)

#### Usage examples

**Org dropdown (single-select, raw API response, custom item snippet):**
```svelte
<ComboSelect
  mode="single"
  bind:value={$form.idp_org}
  options={availableOrgs}
  valueField="idp_name"
  labelField="display_name"
  searchable={true}
  placeholder={$t('shell.settings.users.create.idpOrgPlaceholder')}
  onChange={onOrgChange}
>
  {#snippet item({ option, resolvedLabel })}
    <div class="flex flex-col">
      <span class="font-medium">{resolvedLabel}</span>
      <span class="text-xs text-muted-foreground">{option.idp_name}</span>
    </div>
  {/snippet}
</ComboSelect>
```

**Roles (multi-select, string array, no custom snippet):**
```svelte
<ComboSelect
  mode="multi"
  bind:value={$form.roles}
  options={availableRoles}
  placeholder={$t('shell.settings.users.create.rolesPlaceholder')}
/>
```

**Roles with i18n labelKey (raw API response, no DTO conversion):**
```svelte
<ComboSelect
  mode="multi"
  bind:value={$form.roles}
  options={availableRoles}          // [{ idp_role: "administrators", label_key: "roles.administrators" }, ...]
  valueField="idp_role"
  labelField="label_key"
  isLabelTranslated={true}
  placeholder={$t('shell.settings.users.create.rolesPlaceholder')}
/>
```

**Readonly roles on PROFILE (disabled multi-select):**
```svelte
<ComboSelect
  mode="multi"
  bind:value={$form.roles}
  options={availableRoles}
  disabled={true}
  placeholder={$t('shell.settings.profile.rolesPlaceholder')}
/>
```

---

### Issue 2: Hint text should use INFO color (standard behavior)

**Root cause:** The hint "Devi selezionare un'organizzazione prima di inserire il nome utente." uses `text-muted-foreground` (neutral gray). The user wants non-error hints to use INFO color, and this should be a standard pattern.

**Fix:** No new component needed. Simply change the CSS class on existing hint elements from `text-muted-foreground` to `text-info`. This is a one-line change per hint element.

**Files to modify:**
- `src/routes/(app)/system/settings/users/create/+page.svelte` — line 534: change `<p class="text-muted-foreground text-xs">` to `<p class="text-info text-xs">`
- Apply the same `text-muted-foreground` → `text-info` change to any similar non-error hints in EDIT and PROFILE pages

**Standard behavior:** Any non-validation-error hint uses `text-info` color. Validation errors continue using `text-destructive` via `TranslatedFormFieldErrors`.

---

### Issue 3: check-username sends `idp_org` as idp_code instead of org name

**Root cause:** The CREATE page org dropdown uses `o.idp_code` (e.g. "admin/acme") as the option value. This value is sent as `idp_org` in the check-username request. But the BE expects `idp_org` to be the Casdoor org name (e.g. "acme" = `idp_name`), used both for local DB filter (`idp_org = ?`) and Casdoor query (`${idp_org}/${username}`).

**BE status (already fixed in router refactoring):**
- ✅ `auth-check.router.ts` requires both `username` and `idp_org` (no env-var fallback)
- ✅ `user.service.ts` `checkUsernameAvailability()` uses `listUsers` with filter DSL on `idp_username` + `idp_org`
- ✅ Casdoor fallback uses `${idpOrg}/${username}` query (line 367)

**Remaining BE fix:** Add `idp_name` to the orgs/active endpoint DTO so the FE can use it as the dropdown value.

**BE file:** `primebrick-be-v3/src/modules/system/system-router.ts` lines 23-28
- Add `idp_name` to the orgs/active DTO:
  ```typescript
  const orgs = result.rows.map((org) => ({
    uuid: org.uuid,
    idp_code: org.idp_code,
    idp_name: org.idp_name,   // NEW — already in OrganizationDetailDto, just not mapped
    display_name: org.display_name,
    avatar: org.avatar ?? null,
  }));
  ```

**FE file:** `src/routes/(app)/system/settings/users/create/+page.svelte`
- Update `availableOrgs` type to include `idp_name`:
  ```typescript
  let availableOrgs = $state<Array<{ uuid: string; idp_code: string; idp_name: string; display_name: string; avatar: string | null }>>([]);
  ```
- Change `orgOptions` to use `idp_name` as the value:
  ```typescript
  const orgOptions = $derived(
    availableOrgs.map(o => ({ value: o.idp_name, label: o.display_name, idp_name: o.idp_name }))
  );
  ```
- The `idp_org` form field now stores the org name (e.g. "acme"), which is sent correctly to both check-username and create-user endpoints.

**SidebarOrgSwitcher** (`src/lib/components/sidebar/SidebarOrgSwitcher.svelte`):
- Update `ActiveOrg` type to include `idp_name`
- The switcher currently uses `idp_code` for selection — this is fine for display purposes (it's just a local selection key), but update the type to include `idp_name` for avatar path construction (issue #16).

---

### Issue 4: Disable SAVE button when form has validation errors

**Root cause:** Save button is only disabled when `!hasChanges`. Validation errors don't disable it.

**Fix (Page controls button approach):** Each page derives a `canSave` value from superforms `$allErrors` + async validation status, and sets `disabled` on the save button.

**Files to modify:**

**CREATE page** (`src/routes/(app)/system/settings/users/create/+page.svelte`):
```typescript
const { form, errors, allErrors, enhance, tainted, reset, isTainted } = superFormObj;

const hasValidationErrors = $derived($allErrors.length > 0);
const hasAsyncError = $derived(usernameValidationStatus === 'not-valid');
const canSave = $derived(hasChanges && !hasValidationErrors && !hasAsyncError);
```
Save button: `disabled={!canSave}`

**EDIT page** (`src/routes/(app)/system/settings/users/[uuid]/+page.svelte`):
```typescript
const { form, errors, allErrors, enhance, tainted, reset, isTainted } = superFormObj;
const hasValidationErrors = $derived($allErrors.length > 0);
const canSave = $derived(hasChanges && !hasValidationErrors);
```
Save button: `disabled={!canSave}`

**PROFILE page** (`src/routes/(app)/system/settings/profile/+page.svelte`):
```typescript
const { form, errors, allErrors, enhance, tainted, reset, isTainted } = superFormObj;
const hasValidationErrors = $derived($allErrors.length > 0);
const canSave = $derived(hasChanges && !hasValidationErrors);
```
Save button: `disabled={!canSave}`

---

### Issue 5: Clear button hover on roles MultiSelect should be neutral (not destructive)

**Root cause:** Badge remove button and clear-all button use `hover:bg-destructive/20` and `hover:bg-destructive/10 hover:text-destructive`.

**File:** `src/lib/components/ui/multi-select/multi-select.svelte`

**Changes:**
- Badge remove button (line 113): change `hover:bg-destructive/20` → `hover:bg-muted`
- Clear-all button (line 125): change `hover:bg-destructive/10 hover:text-destructive` → `hover:bg-muted hover:text-foreground`

---

### Issue 6: Apply fixes consistently to PROFILE and EDIT pages

**Analysis:** The three pages (CREATE, EDIT, PROFILE) share similar structure but have key differences:
- CREATE: all fields editable, org dropdown, username async validation
- EDIT: display_name/email/avatar_color/roles editable; IDP fields readonly; no org/username editing
- PROFILE: display_name/email/avatar_color editable; ALL IDP fields readonly; roles not shown (fix in #15)

**Consistency checks to apply:**
- Issue 2 (hint color): change `text-muted-foreground` to `text-info` on all three pages where non-error hints exist
- Issue 4 (canSave): apply to all three pages
- Issue 5 (neutral hover): MultiSelect is shared component — fix applies everywhere
- Issue 8 (HINT tooltip priority): applies to all pages using FormLabelWithPriorityHelp
- Issue 14 (tooltip transparency): applies to all pages using tooltips
- Issue 7 (display_name required): make required in all three pages (CREATE, EDIT, PROFILE)

**Differences to preserve:**
- CREATE: org dropdown + username async validation (not in EDIT/PROFILE)
- EDIT: IDP fields as readonly inputs with CopyButton (not in CREATE)
- PROFILE: IDP fields as readonly inputs with CopyButton + Tooltip; roles as disabled MultiSelect (#15)

---

### Issue 7: display_name must be a required field

**Current state:** The CREATE schema has `display_name: z.string().min(2).max(255).optional().or(z.literal(''))` — it is currently OPTIONAL (can be empty string or undefined). The user wants it to be REQUIRED.

**Fix:** Change the schema in CREATE, EDIT, and PROFILE pages to make `display_name` required.

**CREATE page** (`src/routes/(app)/system/settings/users/create/+page.svelte`):
```typescript
// BEFORE:
display_name: z.string().min(2, { message: 'validation.tooShort' }).max(255, { message: 'validation.tooLong' }).optional().or(z.literal('')),

// AFTER:
display_name: z.string().min(2, { message: 'validation.tooShort' }).max(255, { message: 'validation.tooLong' }),
```

**EDIT page** (`src/routes/(app)/system/settings/users/[uuid]/+page.svelte`):
- Apply the same change — remove `.optional().or(z.literal(''))` from `display_name`

**PROFILE page** (`src/routes/(app)/system/settings/profile/+page.svelte`):
- Apply the same change to the `display_name` field in the profile update schema

**FormLabel:** Add a required indicator (asterisk `*`) to the FormLabel for `display_name` in all three pages, using the project's standard pattern for required fields (if one exists). If no standard pattern exists, append `<span class="text-destructive">*</span>` after the label text.

---

### Issue 8: Move HINT tooltip priority from WARNING to INFO

**File:** `src/lib/components/ui/tooltip/priority-tooltip-content.svelte`

**Change (line 51):**
```typescript
// BEFORE:
HINT: "text-warning",
// AFTER:
HINT: "text-info",
```

This changes all HINT-priority tooltips (used via `FormLabelWithPriorityHelp` with `priority="HINT"`) from warning color to info color. Also changes the icon from `Lightbulb` (warning-ish) to `BadgeInfo` (info) — or keep `Lightbulb` but change color. Decision: keep `Lightbulb` icon but change color to `text-info` for semantic clarity (a hint is informational, not a warning).

**Also update icon map (line 42):** Keep `Lightbulb` for HINT — it's semantically appropriate. Only the color changes.

---

### Issue 9: Org dropdown required + clearable with X next to chevron

**Note:** This issue is implemented as part of the ComboSelect component (Issue 1b). The clearable X button is a built-in feature of ComboSelect's single mode. The `required` validation is handled by the Zod schema on the page.

**ComboSelect built-in clear button:** The ComboSelect component (single mode) includes a clear X button next to the chevron, visible when a value is selected and `disabled` is false. This is part of the component, not a per-page change.

**CREATE page schema change:** Make `idp_org` required:
```typescript
// BEFORE:
idp_org: z.string().optional().or(z.literal('')),
// AFTER:
idp_org: z.string().min(1, { message: 'validation.orgRequired' }),
```

**New i18n key** `validation.orgRequired` — ALL 6 files:
| File | Value |
|---|---|
| en-GB | "Organization is required" |
| it-IT | "L'organizzazione è obbligatoria" |
| fr-FR | "L'organisation est requise" |
| es-ES | "La organización es obligatoria" |
| de-DE | "Organisation ist erforderlich" |
| pt-PT | "A organização é obrigatória" |

---

### Issue 10: Color picker popover z-index lower than sidebar

**Root cause:** AppShell wraps page content in `<div class="relative z-0 ...">` (line 93). This creates a stacking context at z-0. The popover content (z-120) is rendered inside this container (bits-ui Popover does NOT portal by default). Since z-120 is bounded by the parent's z-0 stacking context, the sidebar (`fixed z-10`) paints over the popover.

**Fix:** Remove `z-0` from the page content container in AppShell. Keep `relative` for positioning context. Without `z-0`, no stacking context is created, and the popover's z-120 competes at the root level (above sidebar's z-10).

**File:** `src/lib/components/AppShell.svelte` line 93

**Before:**
```html
<div class="relative z-0 min-h-0 min-w-0 flex-1 overflow-auto">
```
**After:**
```html
<div class="relative min-h-0 min-w-0 flex-1 overflow-auto">
```

**Safety:** The topbar is `relative z-40` (line 88). Without z-0 on the page content, the topbar (z-40) still paints above page content (z-auto). The popover (z-120) paints above both. The sidebar (z-10) is below the popover (z-120). No regression expected.

---

### Issue 11: Health badge always shows "Loading..." / BE version shows "—" in tooltip

**Root cause (proven with compiler output):** The `useHealthChip()` composable in `useHealthChip.svelte.ts` declares `$derived` values and returns them. The Svelte 5 compiler unwraps `$derived` signals with `$.get()` at the return point of the function, producing **frozen snapshot values** — not reactive references.

**Compiler output proof (Svelte 5.56.0):**

Source:
```typescript
export function useHealthChip() {
  const health = $derived(backendState.health);
  const healthChip = $derived(backendState.healthChip);
  const healthChipLabel = $derived.by(() => { ... });
  const healthChipClass = $derived(healthChip === 'ok' ? 'green' : 'muted');
  return { health, healthChip, healthChipLabel, healthChipClass, ... };
}
```

Compiled:
```javascript
function useHealthChip() {
  const health = $.derived(() => backendState.health);
  const healthChip = $.derived(() => backendState.healthChip);
  const healthChipLabel = $.derived(() => { ... });
  const healthChipClass = $.derived(() => $.get(healthChip) === 'ok' ? 'green' : 'muted');
  return {
    health: $.get(health),           // ← FROZEN: reads value ONCE at call time
    healthChip: $.get(healthChip),   // ← FROZEN
    healthChipLabel: $.get(healthChipLabel),   // ← FROZEN
    healthChipClass: $.get(healthChipClass),   // ← FROZEN
    ...
  };
}
```

**Contrast with component-level `$derived` (works correctly):**

Source (inside a `.svelte` component):
```svelte
<script lang="ts">
  const health = $derived(backendState.health);
</script>
<div>{health?.version}</div>
```

Compiled:
```javascript
const health = $.derived(() => backendState.health);
$.template_effect(() => $.set_text(text, $.get(health)?.version));
//     ↑ $.get() is inside a reactive effect — re-runs when signal changes
```

**The full chain of failure:**
1. `SidebarHealthBadge` mounts → calls `useHealthChip()` during component initialization
2. At this moment, `backendState.health` is `null` (probe hasn't completed yet) and `backendState.healthChip` is `'loading'`
3. `$.get(health)` returns `null` → returned `health` is `null` (plain value, frozen)
4. `$.get(healthChip)` returns `'loading'` → returned `healthChip` is `'loading'` (plain string, frozen)
5. `$.get(healthChipLabel)` returns `$t('common.loading')` → returned label is "Loading..." (frozen)
6. Later, `probeHealth()` completes → `backendState.health = r.payload` → `backendState.healthChip = 'ok'`
7. The `$state` mutation fires, the internal `$.derived` signals are marked dirty...
8. **But nobody is reading them.** The component holds plain snapshot values from steps 3-5, not signal references
9. Badge shows "Loading..." forever. Tooltip shows "—" forever.

**Why VersionsPanel works:** It declares `const health = $derived(backendState.health)` **directly in the component's `<script>` block**, not via a composable. The compiler keeps it as a signal and inserts `$.get()` inside `$.template_effect()` at each usage site in the template — reactive.

**The rule:** You cannot return `$derived` values from a composable function in a `.svelte.ts` file. The compiler will unwrap them at the return point with `$.get()`, killing reactivity. This is not a bug — it's how the Svelte 5 compiler handles module-level `$derived` in function return statements.

**Fix — Option A: Refactor composable to return pure functions + state reference**

The composable should NOT return `$derived` values. Instead, it returns:
- A reference to `backendState` (the `$state` object — always current)
- Pure helper functions that map chip state → label/classes (no reactivity needed, called from component-level `$derived`)

**File 1:** `src/lib/composables/useHealthChip.svelte.ts`

```typescript
import { get } from 'svelte/store';
import { backendState, type HealthChipState } from '$lib/backend-availability';
import { t } from '$lib/i18n';
import { APP_VERSION } from '$lib/version';

export type HealthChip = HealthChipState;

/** Pure function: maps chip state → i18n label string */
export function chipLabel(chip: HealthChipState): string {
  const tt = get(t);
  return chip === 'backend_offline'
    ? tt('shell.health.beOffline')
    : chip === 'db_offline'
      ? tt('shell.health.dbOffline')
      : chip === 'idp_offline'
        ? tt('shell.health.idpOffline')
        : chip === 'ok'
          ? tt('shell.health.beOnline')
          : tt('common.loading');
}

/** Pure function: maps chip state → CSS class string */
export function chipClass(chip: HealthChipState): string {
  return chip === 'backend_offline'
    ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
    : chip === 'db_offline'
      ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
      : chip === 'idp_offline'
        ? 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
        : chip === 'ok'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-border/60 bg-muted/30 text-muted-foreground';
}

/** Pure function: maps chip state → text CSS class string */
export function chipTextClass(chip: HealthChipState): string {
  return chip === 'backend_offline'
    ? 'text-destructive'
    : chip === 'db_offline'
      ? 'text-destructive'
      : chip === 'idp_offline'
        ? 'text-warning'
        : chip === 'ok'
          ? 'text-success'
          : 'text-muted-foreground';
}

/**
 * Composable: returns backendState reference + pure helper functions.
 * Consumers create their own $derived in the component script block.
 */
export function useHealthChip() {
  return { backendState, chipLabel, chipClass, chipTextClass, APP_VERSION };
}
```

**File 2:** `src/lib/components/sidebar/SidebarHealthBadge.svelte`

```typescript
import { backendState } from '$lib/backend-availability';
import { useHealthChip, chipLabel, chipClass, chipTextClass } from '$lib/composables/useHealthChip';

// Component-level $derived — reactive because declared in component, not in composable
const healthChip = $derived(backendState.healthChip as HealthChip);
const healthChipLabel = $derived(chipLabel(healthChip));
const healthChipClass = $derived(chipClass(healthChip));
const healthChipTextClass = $derived(chipTextClass(healthChip));
```

Template uses `backendState.health` directly for the version:
```svelte
{backendState.health?.version ? `v${backendState.health.version}` : '—'}
```

**File 3:** `src/lib/shell/sheets/panels/VersionsPanel.svelte`

```typescript
import { backendState } from '$lib/backend-availability';
import { useHealthChip, chipLabel, chipClass } from '$lib/composables/useHealthChip';

const healthOffline = $derived(backendState.offline);
const healthChip = $derived(backendState.healthChip as HealthChip);
const healthChipLabel = $derived(chipLabel(healthChip));
const healthChipClass = $derived(chipClass(healthChip));
```

Template uses `backendState.health` directly:
```svelte
{backendState.health?.version ? `v${backendState.health.version}` : '—'}
{#if backendState.health?.idp?.ok}
  {backendState.health.idp.type || 'Casdoor'}
  {backendState.health.idp.version || 'unknown'}
{/if}
{#if backendState.health?.modules?.length}
  {#each backendState.health.modules as m (m.id)}
    ...
  {/each}
{/if}
```

**Why this works:**
- `backendState` is a module-level `$state` object — always returns current values when read
- `$derived` declarations are in the **component** script block, so the compiler wraps `$.get()` inside `$.template_effect()` — reactive
- `chipLabel`/`chipClass`/`chipTextClass` are pure functions called from component-level `$derived` — they execute fresh on each reactive update
- No frozen snapshots anywhere in the chain

**No polling changes needed.** The existing polling in AppShell (every 5s when offline/db-down/idp-down) is sufficient. The issue was the composable returning frozen `$derived` snapshots, not a polling problem.

---

### Issue 12: Tooltip badges in health badge should enforce white bg color (standardize across all version badges)

**Root cause:** The `Badge` component with `variant="outline"` uses `text-foreground` which inherits the tooltip's `text-background` (light text on dark tooltip). The badges inside the tooltip need explicit `bg-background text-foreground` to be readable.

**File:** `src/lib/components/sidebar/SidebarHealthBadge.svelte`

**Change:** Add `bg-background text-foreground` to the Badge components inside the tooltip content (lines 61, 67):
```svelte
<Badge variant="outline" class="bg-background text-foreground font-mono text-[10px] font-medium tabular-nums">
  v{APP_VERSION}
</Badge>
```

**Standardize:** Audit all version badge usages in tooltips across the project and apply the same `bg-background text-foreground` classes. Files to check:
- `src/lib/components/sidebar/SidebarHealthBadge.svelte` (tooltip badges)
- `src/lib/shell/sheets/panels/VersionsPanel.svelte` (panel badges — these are on light bg already, no change needed)
- Any other tooltip that contains Badge components

---

### Issue 13: BE version shows "—" in health badge tooltip but correct in version panel

**Root cause:** Same as issue #11 — the composable returns a frozen `$.get(health)` snapshot at call time (when `backendState.health` is still `null`). The tooltip reads this frozen `null` value, showing "—". The VersionsPanel works because it declares `$derived` directly in the component, so the compiler wraps it in a reactive `$.template_effect`.

**Fix:** Resolved by the Issue 11 refactoring (composable returns pure functions + `backendState` reference; components declare their own `$derived` and read `backendState.health` directly in templates). Once the tooltip content reads `backendState.health?.version` via a component-level `$derived`, it will show the correct version reactively.

---

### Issue 14: Tooltip transparency inconsistency between PROFILE and CREATE pages

**Root cause:** Two different tooltip content components are used:
- `Tooltip.Content` (standard): `text-background` (fully opaque) — used for copy buttons in PROFILE
- `PriorityTooltipContent`: children div has `text-background/80` (80% opacity) — used for FormLabelWithPriorityHelp in CREATE/EDIT/PROFILE

**Fix:** Standardize both to use the same opacity. Remove the `/80` from PriorityTooltipContent to make it fully opaque, matching the standard tooltip.

**File:** `src/lib/components/ui/tooltip/priority-tooltip-content.svelte` line 77

**Before:**
```html
<div class="text-background/80 leading-relaxed">
```
**After:**
```html
<div class="text-background leading-relaxed">
```

This makes all tooltips fully opaque. Both `Tooltip.Content` and `PriorityTooltipContent` now have identical text opacity.

---

### Issue 15: Readonly application roles on PROFILE page (disabled ComboSelect)

**Root cause:** The PROFILE page does not show the user's assigned roles at all. The user wants to see their roles in a read-only way.

**Fix:** Add a disabled `<ComboSelect mode="multi">` to the PROFILE page, populated with the user's roles from the profile data. (If ComboSelect is not yet implemented, use the existing MultiSelect with `disabled={true}` as a temporary measure until Phase 3b migration.)

**File:** `src/routes/(app)/system/settings/profile/+page.svelte`

**Changes:**
1. Add `roles` to the profile schema (as readonly, not submitted):
   ```typescript
   const profileSchema = z.object({
     // ... existing fields ...
     roles: z.array(z.string()).optional().default([]),
   });
   ```
2. Load roles from the profile API response. The `/api/v1/auth/me` endpoint returns `roles` in the profile data (verify this).
3. Add the ComboSelect in the form, disabled:
   ```svelte
   <FormField form={superFormObj} name="roles">
     <FormControl>
       {#snippet children({ props })}
         <div class="space-y-2">
           <FormLabel for={props.id}>{$t("shell.settings.profile.roles")}</FormLabel>
           <ComboSelect
             {...props}
             mode="multi"
             bind:value={$form.roles}
             options={availableRoles}
             disabled={true}
             placeholder={$t("shell.settings.profile.rolesPlaceholder")}
           />
         </div>
       {/snippet}
     </FormControl>
   </FormField>
   ```
   (If ComboSelect is not yet migrated, use `<MultiSelect disabled={true}>` temporarily.)
4. Fetch available roles in `onMount` (same as CREATE/EDIT pages).
5. Add `roles` to the `loadProfile()` reset call.
6. Exclude `roles` from the PATCH request body (already excluded — only `display_name`, `email`, `avatar_color`, `avatar_initials` are sent).

**New i18n keys** — ALL 6 files:
| Key | en-GB | it-IT |
|---|---|---|
| `shell.settings.profile.roles` | "Application roles" | "Ruoli applicativi" |
| `shell.settings.profile.rolesPlaceholder` | "No roles assigned" | "Nessun ruolo assegnato" |

(French, Spanish, German, Portuguese values to be added similarly.)

**BE status (already done):** `/api/v1/auth/me` returns `roles` in the profile response via `UserProfileDetailDto` (which includes `roles?: string[]`). The `getMe()` method in `auth-session.service.ts` calls `this.dal.getByUuid(userUuid)` which returns the full DTO. No BE change needed.

---

### Issue 16: Organization avatars in sidebar org switcher

**Root cause:** All orgs have `avatar: null` (field recently introduced). The SidebarOrgSwitcher shows fake avatars using initials (AvatarFallback), but org avatars should be logos/brands, not initials. When avatar is null, should show an image-off icon instead of fake initials.

**Fix (multi-step):**

#### 16a. Generate WEBP images per org (128x128)

- Create images in `primebrick-fe-v3/public/org-avatars/` named `<idp_name>.webp`
- Install `sharp` globally: `pnpm add -g sharp` (or `npm install -g sharp`)
- Write a temporary Node.js script in `d:\git\primebrick\temp\` that:
  1. Queries the BE database (or uses a hardcoded list of orgs) to get `idp_name` values
  2. Generates a simple branded placeholder image (128x128) for each org with the org name text
  3. Saves as WEBP to `primebrick-fe-v3/public/org-avatars/<idp_name>.webp`
- Run the script once, then delete it from temp directory
- `sharp` can be left installed globally for future use, or removed with `pnpm remove -g sharp`

#### 16b. Persist avatar paths in DB (one-time, no project pollution)

- Run a one-time SQL UPDATE directly against the database (via psql, pgAdmin, or a temp script in `d:\git\primebrick\temp\`):
  ```sql
  UPDATE organizations SET avatar = '/org-avatars/' || idp_name || '.webp' WHERE avatar IS NULL;
  ```
- Do NOT add migration patch files to `primebrick-be-v3/db-meta/patches/` — this is a one-time data update, not a schema migration
- Do NOT add seed endpoints to the BE — this is a one-time operation
- Verify the update with: `SELECT idp_name, avatar FROM organizations;`

#### 16c. Fix SidebarOrgSwitcher to show image-off icon when avatar is null

**File:** `src/lib/components/sidebar/SidebarOrgSwitcher.svelte`

**Changes:**
- Import `ImageOff` from lucide: `import ImageOff from '@lucide/svelte/icons/image-off';`
- Replace the AvatarFallback (initials) with ImageOff icon when avatar is null:
  ```svelte
  <Avatar class="size-6 rounded-none">
    {#if org.avatar}
      <img src={org.avatar} alt={org.display_name} class="size-6 rounded-none object-cover" />
    {:else}
      <AvatarFallback class="rounded-none flex items-center justify-center">
        <ImageOff class="size-3.5 text-muted-foreground" />
      </AvatarFallback>
    {/if}
  </Avatar>
  ```
- Apply the same fix to the selected org display in the trigger (lines 53-59):
  ```svelte
  {#if selectedOrg?.avatar}
    <Avatar class="size-8 rounded-md">
      <img src={selectedOrg.avatar} alt={selectedOrg.display_name} class="size-8 rounded-md object-cover" />
    </Avatar>
  {:else}
    <ImageOff class="size-4 opacity-90" aria-hidden="true" />
  {/if}
  ```
  (Replace the current `Building2` fallback with `ImageOff` for consistency — Building2 is a generic building icon, but the user specifically wants image-off to indicate "no avatar set".)

---

### Issue 17: Remove unused `casdoor_admin_role` config (dead code cleanup)

**Root cause:** The `casdoorAdminRole` field is loaded from the `auth_configurations` table in `config-repo.ts` but is NEVER referenced anywhere else in the codebase. It's dead code that adds confusion.

**File:** `primebrick-be-v3/src/modules/auth/config-repo.ts`

**Changes:**
1. Remove `casdoorAdminRole: string;` from the `AuthConfigDb` interface (line 8)
2. Remove `casdoorAdminRole: settings.casdoor_admin_role || "administrators",` from the return object (line 38)

**Safety check:** Grep confirms `casdoorAdminRole` is ONLY referenced in `config-repo.ts` (2 matches: the interface property and the assignment). No other file imports or uses this field.

**Note:** The `casdoor_admin_role` key may still exist in the `auth_configurations` DB table — that's fine, it's just not loaded anymore. No DB migration needed.

### Phase 1: Backend changes (primebrick-be-v3)
1. **Issue 3 BE** — Add `idp_name` to orgs/active endpoint DTO in `system-router.ts` (1-line addition; check-username endpoint already fixed in router refactoring)
2. **Issue 15 BE** — Already done: `/api/v1/auth/me` returns `roles` via `UserProfileDetailDto` (no change needed)
3. **Issue 17** — Remove unused `casdoorAdminRole` from `config-repo.ts` (dead code cleanup)
4. **Issue 16b** — One-time SQL UPDATE to seed org avatar paths (run directly, no migration files)

### Phase 2: Frontend foundational changes (1-liners)
5. **Issue 8** — Change HINT priority color from warning to info (1 line in `priority-tooltip-content.svelte`)
6. **Issue 14** — Remove `/80` opacity from PriorityTooltipContent (1 line)
7. **Issue 10** — Remove `z-0` from AppShell page content container (1 line)
8. **Issue 2** — Change `text-muted-foreground` to `text-info` on hint elements in CREATE/EDIT/PROFILE (no new component)

### Phase 3: Frontend component changes (immediate fixes)
9. **Issue 1 (immediate fix)** — Refactor existing Select trigger from `<Input readonly>` to `<div>` (matches MultiSelect pattern, fixes centering)
10. **Issue 5** — Change MultiSelect hover from destructive to neutral
11. **Issue 16c** — Fix SidebarOrgSwitcher avatar fallback (ImageOff icon)

### Phase 3b: New unified ComboSelect component (after immediate fix is verified)
12. **Issue 1b** — Create `ComboSelect` component with mode="single"|"multi", searchable prop, valueField/labelField/isLabelTranslated, itemSnippet, selectedSnippet, client-side search via bits-ui Command
13. **Issue 1b migration (roles)** — Replace MultiSelect usage in CREATE and EDIT with `<ComboSelect mode="multi">`
14. **Issue 1b migration (orgs)** — Replace Select usage in CREATE org dropdown with `<ComboSelect mode="single" valueField="idp_name" labelField="display_name">` (raw API response, no DTO conversion)
15. **Issue 1b cleanup** — Remove old Select and MultiSelect components once all usages migrated
16. **Issue 9** — Org required in schema + ComboSelect clear button (built-in feature of ComboSelect single mode)

### Phase 4: Frontend page changes
17. **Issue 3 FE** — Update CREATE page orgOptions to use idp_name (or pass raw orgs to ComboSelect with valueField)
18. **Issue 4** — Add `canSave` derived + disable save buttons in CREATE/EDIT/PROFILE
19. **Issue 7** — Make display_name required in CREATE/EDIT/PROFILE schemas + add required indicator
20. **Issue 15** — Add `<ComboSelect mode="multi" disabled>` for readonly roles on PROFILE page

### Phase 5: Health badge reactivity fix (no polling)
21. **Issue 11** — Refactor `useHealthChip`: replace `$derived` returns with pure functions (`chipLabel`, `chipClass`, `chipTextClass`) + `backendState` reference; update SidebarHealthBadge and VersionsPanel to declare `$derived` in component scope and read `backendState.health` directly in templates (fix frozen `$.get()` snapshots)
22. **Issue 13** — Resolved by Issue 11 fix
23. **Issue 12** — Add `bg-background text-foreground` to tooltip badges

### Phase 6: Org avatar assets (fire and forget)
24. **Issue 16a** — Install sharp globally, generate WEBP images in `public/org-avatars/`, delete temp script

---

## Files to modify

### Backend (primebrick-be-v3)
- `src/modules/system/system-router.ts` — Add `idp_name` to orgs/active DTO (1 line)
- `src/modules/auth/config-repo.ts` — Remove unused `casdoorAdminRole` from interface and return object (Issue 17)
- **No migration files** — org avatar paths updated via one-time SQL UPDATE (Issue 16b)
- **No changes needed to auth routers** — check-username, create-user, and `/api/v1/auth/me` already correct after refactoring

### Frontend (primebrick-fe-v3)
- `src/lib/components/ui/select/select.svelte` — **Phase 3:** Refactor trigger from `<Input readonly>` to `<div>` (Issue 1). **Phase 3b cleanup:** Removed after ComboSelect migration.
- `src/lib/components/ui/multi-select/multi-select.svelte` — **Phase 3:** Neutral hover on clear/remove buttons (Issue 5). **Phase 3b cleanup:** Removed after ComboSelect migration.
- `src/lib/components/ui/combo-select/combo-select.svelte` — **NEW (Phase 3b):** Unified ComboSelect component (replaces Select + MultiSelect)
- `src/lib/components/ui/combo-select/index.ts` — **NEW:** Export barrel
- `src/lib/components/ui/tooltip/priority-tooltip-content.svelte` — HINT color → info (Issue 8), remove /80 opacity (Issue 14)
- `src/lib/components/AppShell.svelte` — Remove z-0 from page content container (Issue 10)
- `src/lib/components/sidebar/SidebarOrgSwitcher.svelte` — ImageOff fallback, update type for idp_name (Issue 16c)
- `src/lib/composables/useHealthChip.svelte.ts` — **Refactor:** replace `$derived` returns with pure functions (`chipLabel`, `chipClass`, `chipTextClass`) + `backendState` reference (Issue 11 — fix frozen `$.get()` snapshots)
- `src/lib/components/sidebar/SidebarHealthBadge.svelte` — Declare `$derived` in component scope; read `backendState.health` directly in tooltip (Issue 11); bg-background on tooltip badges (Issue 12)
- `src/lib/shell/sheets/panels/VersionsPanel.svelte` — Declare `$derived` in component scope using pure functions from composable; read `backendState.health` directly in template (Issue 11 consistency)
- `src/routes/(app)/system/settings/users/create/+page.svelte` — Org uses idp_name, canSave, hint text-info, display_name required, org required; **Phase 3b:** migrate to ComboSelect
- `src/routes/(app)/system/settings/users/[uuid]/+page.svelte` — canSave, hint text-info, display_name required; **Phase 3b:** migrate to ComboSelect
- `src/routes/(app)/system/settings/profile/+page.svelte` — canSave, hint text-info, display_name required, `<ComboSelect mode="multi" disabled>` for roles
- `src/lib/i18n/messages/*.json` (6 files) — New keys: `validation.orgRequired`, `shell.settings.profile.roles`, `shell.settings.profile.rolesPlaceholder`
- `public/org-avatars/` — NEW: generated WEBP avatar images

---

## Verification

- [ ] BE: `pnpm run build` succeeds (primebrick-be-v3)
- [ ] FE: `pnpm run check` passes (no type errors)
- [ ] FE: `pnpm run build` succeeds
- [ ] **Issue 17:** `casdoorAdminRole` removed from `config-repo.ts` — BE builds without errors
- [ ] **Phase 3 — Select trigger fix:** Org dropdown selected value is left-aligned (not centered)
- [ ] **Phase 3b — ComboSelect single mode:** Behaves identically to fixed Select (left-aligned, clearable, searchable)
- [ ] **Phase 3b — ComboSelect multi mode:** Behaves identically to MultiSelect (badges, checkboxes, clear-all, per-badge X)
- [ ] **Phase 3b — ComboSelect searchable=false:** Search box is hidden, all options shown
- [ ] **Phase 3b — ComboSelect itemSnippet:** Custom item rendering works (e.g. org two-line item with label + idp_name)
- [ ] **Phase 3b — ComboSelect valueField/labelField:** Raw API response objects work without DTO conversion
- [ ] **Phase 3b — ComboSelect isLabelTranslated:** Label is wrapped in $t() when true
- [ ] **Phase 3b — ComboSelect disabled:** Multi mode with `disabled=true` shows badges but no X buttons, no toggle
- [ ] Org dropdown: selected value left-aligned, clearable with X, required validation
- [ ] Check-username: payload sends `idp_org: "acme"` (org name, not idp_code)
- [ ] Hint text: INFO color (blue/info), not muted gray
- [ ] Save button: disabled when validation errors exist, enabled when valid + has changes
- [ ] display_name: required field — cannot be empty, shows required indicator
- [ ] MultiSelect clear/remove buttons: neutral hover (not red/destructive)
- [ ] Color picker popover: fully visible above sidebar (z-index fixed)
- [ ] Health badge: shows "Online" (not "Loading...") after probe completes
- [ ] Health badge tooltip: BE version shows correctly (not "—") — verify by hovering after probe completes
- [ ] VersionsPanel: BE version shows correctly (consistency with tooltip after refactoring)
- [ ] `useHealthChip` no longer returns `$derived` values — returns pure functions + `backendState` reference
- [ ] Compile check: `useHealthChip.svelte.ts` compiled output shows NO `$.get()` at return point
- [ ] SidebarHealthBadge: `$derived` declarations are in component `<script>`, not from composable
- [ ] Health badge tooltip: badges have white bg, readable
- [ ] Tooltips: consistent opacity (fully opaque) across PROFILE and CREATE
- [ ] HINT tooltips: info color (not warning)
- [ ] PROFILE page: shows assigned roles in disabled ComboSelect (multi mode)
- [ ] Org switcher: shows ImageOff icon when avatar is null, shows image when avatar is set
- [ ] Test in at least IT + EN languages

## Risks / Considerations

- **Issue 1 (Select refactor — Phase 3):** Changing from Input to div trigger may affect form validation propagation. The Select is used inside FormField/FormControl which passes `props` including `aria-invalid`. The div trigger must handle these props correctly (pass them through). The MultiSelect already does this successfully — follow the same pattern.
- **Issue 1b (ComboSelect — Phase 3b):** The new unified component must preserve ALL existing behavior from both Select and MultiSelect. Risk of regression in org dropdown, roles dropdown, and readonly roles display. Mitigation: Phase 3 fix is done first and verified; ComboSelect is built and verified in parallel before migration; old components are only removed after all usages are migrated and verified.
- **Issue 1b (option model):** The `valueField`/`labelField`/`isLabelTranslated` approach means NO DTO conversion is needed — raw API responses can be passed directly. Edge case: if `isLabelTranslated` is true but the label value isn't a valid i18n key, `$t()` returns the key string itself (graceful degradation).
- **Issue 1b (search behavior):** The bits-ui Command component does client-side filtering by default. The `searchable=false` prop hides the search box and sets `shouldFilter=false` on Command.Root. Server-side search is documented as a future extension (via `onSearch` callback) but NOT implemented in the initial version to keep scope manageable.
- **Issue 7 (display_name required):** Making display_name required on EDIT means existing users with empty display_name will fail validation when edited. This is intentional per user decision. The BE already supports empty display_name (Casdoor sync), but the FE will now enforce it.
- **Issue 11 (health badge reactivity — ROOT CAUSE FOUND):** The Svelte 5 compiler unwraps `$derived` values with `$.get()` at the return point of composable functions in `.svelte.ts` files, producing frozen snapshots — not reactive references. This is proven by compiler output: `return { health: $.get(health) }` reads the value ONCE at call time. The fix refactors `useHealthChip` to return pure functions + `backendState` reference instead of `$derived` values. Components declare their own `$derived` in the component script block, where the compiler correctly wraps `$.get()` inside `$.template_effect()` for reactivity. **This is a general Svelte 5 rule:** never return `$derived` from a composable function in `.svelte.ts` — always return `$state` references and/or pure functions, and let the consuming component create `$derived` declarations.
- **Issue 17 (casdoor_admin_role):** Removing the field from `AuthConfigDb` is safe — grep confirms it's only referenced in `config-repo.ts`. The DB key may still exist but won't be loaded. No migration needed.
- **Issue 3 (idp_org):** Changing the org dropdown value from idp_code to idp_name affects the CREATE form submission. The BE create-user endpoint (`user.service.ts` line 51/59) already expects `idp_org` as the org name (used as Casdoor `owner`). The BE check-username endpoint (`auth-check.router.ts`) already requires `idp_org` as the org name. This is a fix, not a breaking change. The only BE change needed is adding `idp_name` to the orgs/active DTO in `system-router.ts`.
- **Issue 10 (z-0 removal):** Removing z-0 changes the stacking context. Verify that the topbar (z-40) still paints above page content and that no other z-index issues arise. The popover (z-120) and dropdown-menu (z-120) will now correctly paint above the sidebar (z-10).
- **Issue 11 (health badge):** The root cause requires runtime investigation. The proposed fix (periodic poll) is a safety net. If the issue is a Svelte 5 reactivity bug with module-level $state, a more targeted fix may be needed.
- **Issue 16 (org avatars):** Generating WEBP images requires an image processing library. If `sharp` is not available, use SVG instead (simpler, no dependencies). The "fire and forget" nature means this can be done last and independently.
- **Atomic commits:** Per code-guardrails rule, apply changes iteratively and run linter/build after each module. Max 2 self-correction attempts before halting.
