# User Manager UI Fixes Plan — v4

**Date:** 2026-06-24
**Stack:** SvelteKit + Svelte 5 + TypeScript + shadcn-svelte + bits-ui (FE `primebrick-fe-v3`) + Express + PostgreSQL (BE `primebrick-be-v3`)
**Previous:** v1, v2, v3 plans (all implemented). This plan addresses 12 new follow-up issues reported after v3 (Issue 1 — sidebar tooltip badge size — deferred per user request).

---

## Translation policy

Every translation change MUST be applied to **ALL 6 language files** in `primebrick-fe-v3/src/lib/i18n/messages/`:
`en-GB.json`, `it-IT.json`, `fr-FR.json`, `es-ES.json`, `de-DE.json`, `pt-PT.json`

---

## Empirical evidence summary (this session)

| Fact | Source |
|---|---|
| ComboSelect declares `itemSnippet` as a **prop**, not a child snippet named `item` | `combo-select.svelte` line 28, 60, 322-328 |
| CREATE page passes the org two-line snippet as `{#snippet item(...)}` → becomes `item` prop, NOT `itemSnippet` → silently ignored, falls back to single-line label | `users/create/+page.svelte` lines 516-521 |
| ComboSelect renders `itemSnippet` only; `item` is swallowed by `...restProps` and never rendered | `combo-select.svelte` line 322 |
| SidebarHealthBadge tooltip: shell + BE version badges use identical classes `bg-background text-foreground font-mono text-[10px] font-medium tabular-nums` | `SidebarHealthBadge.svelte` lines 66-68, 72-74 |
| VersionsPanel content area uses `px-2` (very tight, no vertical padding) | `VersionsPanel.svelte` lines 63, 123 |
| display_name in CREATE: schema is `.min(2)` (effectively required) but label uses manual `<span class="text-destructive">*</span>`; idpUsername/password/roles labels have NO asterisk → inconsistent | `users/create/+page.svelte` lines 139-141, 450, 534, 566, 483 |
| FormLabel uses `data-[fs-error]:text-destructive` (turns red on error) but has NO native required-field styling | `form-label.svelte` line 19 |
| BE `roles` column is `pgType: "jsonb"` | `user_profile_entity.ts` line 72-73 |
| BE `createUser` stringifies roles: `roles ? JSON.stringify(roles) : null` (works) | `user.service.ts` line 100 |
| BE `updateUserProfile` passes `roles` array directly to `dal.updateProfile` → `repo.update` → pg driver serializes JS array as PG array literal `{"administrators","HR"}` → jsonb column tries to parse as JSON → `invalid input syntax for type json` (`Expected ":", but found ","`) | `user.service.ts` line 314; `repository.ts` line 527; error log detail `JSON data, line 1: {"administrators",...` |
| BE `updateUser` (auth users endpoint) has the SAME bug: `updateBody.roles = body.roles` (raw array) | `user.service.ts` line 128, 179 |
| BE Casdoor `updateUser` does NOT send `password` field (no password change support yet) | `casdoor-api-client.ts` lines 116-136 |
| BE roles/active endpoint returns `{ idp_role, label_key }` per role — `label_key` is available for two-line snippet | `system-router.ts` lines 43-46 |
| CREATE page discards `label_key`: `availableRoles = data.roles.map(r => r.idp_role)` | `users/create/+page.svelte` line 94 |
| Row dropdown menu is hardcoded in `TableRow.svelte` (edit/duplicate/versionHistory/preview/delete/restore); `entityRowActions` meta only toggles booleans; no extension point for custom items | `TableRow.svelte` lines 251-309; `entity-list/types.ts` lines 79-84 |
| Dialog standard: separate components in `entity-list-table/dialogs/` using `DialogBordered` (color prop) + `Dialog.Header` + `Dialog.Footer` | `dialogs/DeleteDialog.svelte` |
| Users list page opens create/edit in `window.open` (child window), uses BroadcastChannel sync; delete/restore handled by EntityListTable internal composable | `users/+page.svelte` lines 473-492, 566-611 |
| DropdownMenu.Content default has no `align` prop set → bits-ui defaults to `center` alignment | `dropdown-menu-content.svelte`; `TableRow.svelte` line 250 uses `align="end"`; `AppPageBreadcrumb.svelte` line 41 uses `align="start"` |
| FormLabelWithPriorityHelp: priority set → `PriorityTooltipContent` (bg-foreground text-background, opaque); no priority → fallback `Tooltip.Content` (also bg-foreground text-background, opaque) | `FormLabelWithPriorityHelp.svelte` lines 21-28; `priority-tooltip-content.svelte` line 63; `tooltip-content.svelte` line 18 |
| CREATE breadcrumb: `Sistema / Impostazioni / Crea Utente` (missing "Utenti") | `users/create/+page.svelte` lines 367-371 |
| EDIT breadcrumb: `Sistema / Impostazioni / Modifica Utente` (missing "Utenti") | `users/[uuid]/+page.svelte` lines 330-334 |
| Dark-mode sky/blue usage in core form + settings: `switch.svelte` (sky borders), `settings/+layout.svelte` active tab (sky border), `FormPageLayout.svelte` version badge (sky border), `security/+page.svelte` (sky borders) | grep results |
| `settingsTabMenuSegment` already produces a dropdown with all settings tabs (Profile/Organizations/Users/Security/Modules/Templates) — reusable for breadcrumb middle element | `settings-breadcrumb.ts` |

---

## Issue 2: Missing points from previous plans (review)

**Finding:** The v3 plan acceptance criterion "ComboSelect itemSnippet: Custom item rendering works (e.g. org two-line item with label + idp_name)" (line 1032) was **never actually working** — this is exactly Issue 6 below. The snippet was passed with the wrong name and silently ignored. No other v3 items are obviously unimplemented based on the codebase state, but a full re-verification of the v3 checklist (lines 1028-1057) should be done after this plan is implemented.

**Action:** Include a "v3 checklist re-verification" step at the end of implementation.

---

## Issue 3: Click badge online (expanded + collapsed) opens version history

**Current state:** `SidebarHealthBadge.svelte` already wraps the badge in a `<button onclick={() => openSheet('shell.versions', ...)}>` inside `Tooltip.Trigger`. The click handler is present.

**Investigation needed:** In collapsed mode the tooltip trigger may intercept/stop the click, or the button's clickable area is reduced by `group-data-[collapsible=icon]` sizing. Verify empirically that clicking the chip in collapsed mode fires `openSheet`.

**Fix (if broken):** Ensure the `<button>` `onclick` calls `e.preventDefault()` before `openSheet` so the tooltip-trigger wrapper does not swallow it, and that the button covers the full badge area in collapsed mode (it already uses `size-8` via `group-data-[collapsible=icon]`). If the tooltip dismisses the click, move `openSheet` to also fire on the tooltip trigger's `onclick` or use `onpointerdown`.

**File:** `src/lib/components/sidebar/SidebarHealthBadge.svelte` (lines 27-55)

---

## Issue 4: VersionsPanel no padding in content area below header

**Root cause:** Content blocks use `px-2` with no vertical padding (`VersionsPanel.svelte` lines 63, 123). The header has no bottom padding either.

**Fix:** Change content container padding from `px-2` to `px-4 py-3` for the first block (line 63), keep separator, and `px-4 py-3` for the browser info block (line 123). Add `pb-4` to the outer scroll container so content doesn't touch the bottom edge.

**File:** `src/lib/shell/sheets/panels/VersionsPanel.svelte` (lines 61-63, 117-125)

---

## Issue 5: display_name required-field styling inconsistent

**Root cause:** display_name and idp_org use a manual `<span class="text-destructive">*</span>` next to the label, while other required fields (idpUsername, password, roles) have NO asterisk. The project has no unified required-field convention; FormLabel only styles errors (`data-[fs-error]:text-destructive`).

**Fix:** Introduce a consistent required-field convention:
1. Add a `required?: boolean` prop to `FormLabel` (`src/lib/components/ui/form/form-label.svelte`). When true, append a `<span class="text-destructive">*</span>` after children AND add `font-medium text-foreground` to the label (so required labels read stronger than optional `text-muted-foreground` labels).
2. Remove the manual `<span class="text-destructive">*</span>` from display_name and idp_org in CREATE, and from display_name in EDIT.
3. Add `required` to ALL required fields' FormLabel: display_name, idp_org, idpUsername, password, roles (CREATE); display_name (EDIT); display_name, email (PROFILE — profile schema marks these required).
4. Optional fields (email in CREATE/EDIT) keep the default label (no asterisk, muted).

**Files:**
- `src/lib/components/ui/form/form-label.svelte` — add `required` prop
- `src/routes/(app)/system/settings/users/create/+page.svelte` — use `required` on FormLabel, remove manual asterisks (lines 450, 504)
- `src/routes/(app)/system/settings/users/[uuid]/+page.svelte` — use `required` on display_name FormLabel
- `src/routes/(app)/system/settings/profile/+page.svelte` — use `required` on display_name + email FormLabel

---

## Issue 6: Lost organizations two-line snippet in CREATE page

**Root cause:** ComboSelect expects the custom item renderer as the `itemSnippet` **prop**. The CREATE page passes it as `{#snippet item(...)}`, which Svelte 5 binds to the `item` prop — swallowed by `...restProps` and never rendered. ComboSelect falls back to the single-line label, so the org `idp_name` second line is lost.

**Fix:** Rename the snippet from `item` to `itemSnippet` in the CREATE page org ComboSelect so it binds to the correct prop.

**File:** `src/routes/(app)/system/settings/users/create/+page.svelte` (lines 516-521)

```svelte
<ComboSelect ...>
  {#snippet itemSnippet({ option, resolvedLabel }: { option: Record<string, any>; resolvedLabel: string })}
    <div class="flex flex-col">
      <span class="font-medium">{resolvedLabel}</span>
      <span class="text-xs text-muted-foreground">{option.idp_name}</span>
    </div>
  {/snippet}
</ComboSelect>
```

---

## Issue 7: Application roles two-line snippet (proposal + impl)

**Goal:** Give the roles dropdown a two-line item like orgs. Line 1 = display label (`label_key` translated, coalesced with `idp_role` when `label_key` is absent). Line 2 = `idp_role` machine name in italic muted style, matching the audit bar footer in `FormPageLayout.svelte` (`italic text-muted-foreground`).

**BE state:** `/api/v1/system/roles/active` already returns `{ idp_role, label_key }` per role. `label_key` is an i18n key (e.g. `roles.administrators`). Not all roles have a `label_key` — when missing, line 1 falls back to `idp_role`.

**Fix:**
1. In CREATE and EDIT pages, stop discarding `label_key`: store full role objects `availableRoles = data.roles` (array of `{ idp_role, label_key }`).
2. Pass `options={availableRoles}`, `valueField="idp_role"`, `labelField="label_key"`, `isLabelTranslated={true}` to the roles ComboSelect so the resolved label is `$t(label_key)`. When `label_key` is absent, ComboSelect falls back to `idp_role` as the label.
3. Pass an `itemSnippet` that renders two lines:
   - Line 1 (font-medium): `option.label_key ? $t(option.label_key) : option.idp_role` — coalesced display label
   - Line 2 (italic text-muted-foreground): `option.idp_role` — machine name in italic, matching the audit bar value style from `FormPageLayout.svelte` (class `italic text-muted-foreground`, see lines 96, 101, 113)
4. The selected badge (multi mode) shows the coalesced label (ComboSelect already uses `opt.label` for badges — ensure `opt.label` resolves to the translated `label_key` when present, else `idp_role`).

**Files:**
- `src/routes/(app)/system/settings/users/create/+page.svelte` (lines 41, 94, 484-490)
- `src/routes/(app)/system/settings/users/[uuid]/+page.svelte` (roles ComboSelect)
- Add missing role `label_key` translations to all 6 language files if any role keys are not already present (verify `roles.administrators`, `roles.hr`, `roles.sales`, `roles.customer_service`, `roles.ops`).

---

## Issue 8: "Cambia Password" row action + warning dialog

**Goal:** Add a "Cambia Password" item to the users list row dropdown. Clicking opens a warning dialog with a password input (eye toggle), primary CTA enabled only when the password passes the strong regex. On confirm, call a new BE endpoint that calls Casdoor to change the password. Add a code comment for posterity: when Casdoor confirms the operation (NOT just 200 — must check `data.status === "ok"`), send a transactional email via a microservice (deferred — separate project). Implement all logic except the email.

**Password regex (Strong 8/4):** `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$`
- Verifies: min 8 chars, max 64 chars, at least 1 lowercase, 1 uppercase, 1 digit, 1 special (non-alphanumeric) character.

### Architecture decision: metadata-driven `customActions` (Option C)

The existing row menu items (edit, duplicate, versionHistory, preview, delete/restore) are driven by BE entity metadata: `meta.list.rowActions` is a boolean toggle object (`{ duplicate?, delete?, edit?, preview? }`) consumed by `TableRow.svelte`, which hardcodes the corresponding `DropdownMenu.Item` for each toggle. There is no extension point for entity-specific actions.

"Change Password" is a user-profile-specific action, not a generic entity action. Adding it as a hardcoded item in the shared `TableRow.svelte` would pollute the generic component with entity-specific logic. Instead, we introduce a **`customActions` array** in the metadata `rowActions` object, keeping the BE as the single source of truth for which actions exist (including icon name, translation key, text color) while the FE provides only the click handler via a handler map.

**Why metadata-driven (not a FE snippet):** The icon name, label, and styling come from BE metadata — so adding a new custom action to any entity requires only a BE meta change + a FE handler registration. No cross-repo coordination for icons (the icon is loaded dynamically from the metadata string, see `DynamicIcon.svelte` below). No silent failures from forgetting to import an icon in FE.

### BE changes

**1. Extend `rowActions` in user-profiles meta** — `src/modules/auth/user-profiles.meta.ts` (line 58-63):
```ts
rowActions: {
  duplicate: false,
  delete: true,
  edit: true,
  preview: true,
  customActions: [
    {
      actionName: 'changePassword',
      translationKey: 'shell.settings.users.changePassword',
      icon: 'KeyRound',
      textColor: undefined,               // optional Tailwind class, e.g. 'text-warning'
      disabledWhenDeleted: true,          // optional — grey out for soft-deleted rows
    },
  ],
},
```

The BE serves this meta as-is via `res.json(userProfileMeta)` (no type changes needed in the BE meta serving endpoint — it's a plain object).

**2. Casdoor client — dedicated `changePassword` method** — `src/modules/auth/casdoor-api-client.ts`:

Instead of reusing the generic `updateUser` (which returns a boolean and hides the Casdoor response), add a dedicated method that returns the raw response data so the caller can explicitly verify `data.status === "ok"`:

```ts
/**
 * POST /api/update-user — password-only update.
 * Returns the raw Casdoor response so the caller can explicitly check
 * data.status === "ok" rather than trusting a boolean wrapper.
 */
async changePassword(userId: string, password: string): Promise<{ status: string; success?: boolean; msg?: string }> {
  const finalOwner = userId.includes('/') ? userId.split('/')[0] : this.orgName;
  const finalName = userId.includes('/') ? userId.slice(userId.indexOf('/') + 1) : userId;
  const queryId = `${finalOwner}/${finalName}`;

  const url = this.buildUrl(`/api/update-user?id=${encodeURIComponent(queryId)}`);

  const requestBody = {
    id: userId,
    owner: finalOwner,
    name: finalName,
    password,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Casdoor HTTP ${response.status}: ${text}`);
  }

  return response.json();
}
```

**3. New service method** — `src/modules/auth/services/user.service.ts`:
```ts
async changeUserPassword(uuid: string, password: string): Promise<void> {
  const existing = await this.dal.getByUuid(uuid);
  if (!existing) throw new NotFoundError("User profile not found", { internal_code: "USER_NOT_FOUND" });
  const cdClient = await this.casdoor.getClient();
  if (!cdClient) throw new ApiError("/errors/internal-error", "Casdoor not configured", 503, "IDP unavailable", { internal_code: "IDP_UNAVAILABLE" });

  const result = await cdClient.changePassword(existing.idp_code, password);

  // Casdoor returns 200 with a JSON body — but a 200 alone does NOT mean the
  // password was accepted. The response body contains a `status` field that
  // must be explicitly "ok". Casdoor may return 200 with status !== "ok"
  // when the password is rejected by the org's password policy.
  if (result.status !== "ok") {
    throw new ApiError(
      "/errors/internal-error",
      "Casdoor password change failed",
      502,
      `Casdoor rejected the new password: ${result.msg ?? result.status}`,
      { internal_code: "CASDOOR_PASSWORD_CHANGE_FAILED", severity: "HIGH" },
    );
  }

  // TODO(future): publish a "password-changed" event to the notification
  // microservice (primebrick-us-v3) so it sends a transactional email to the
  // user informing them their password was changed. Tracked in a separate
  // project. The event should only be published AFTER this point — i.e. only
  // when result.status === "ok" is confirmed.
  await this.dal.updateProfile(uuid, { last_synced_at: new Date() } as any);
}
```

**4. New endpoint** — add to `src/modules/auth/routers/users.router.ts`:
- `POST /api/v1/auth/users/:uuid/change-password`
- Body schema: `z.object({ password: z.string().min(8).max(64) })` (BE re-validates; FE also validates with the strong regex).
- Permission: `rbacHandler([Permission.USERS_UPDATE_SINGLE])`.
- Calls `service.changeUserPassword(uuid, body.password)`.

### FE changes

**1. Extend `EntityListListMeta` type** — `src/lib/entity-list/types.ts` (line 79-84):
```ts
rowActions?: {
  duplicate?: boolean;
  delete?: boolean;
  edit?: boolean;
  preview?: boolean;
  customActions?: Array<{
    actionName: string;
    translationKey: string;
    icon: string;                // Lucide icon name in PascalCase (e.g. 'KeyRound')
    textColor?: string;          // optional Tailwind class (e.g. 'text-warning')
    disabledWhenDeleted?: boolean;
  }>;
};
```

**2. New `DynamicIcon.svelte` component** — `src/lib/components/ui/DynamicIcon.svelte`:
Generic icon component that lazy-loads a Lucide icon by name via Vite dynamic import. This keeps the icon fully metadata-driven — no FE static import coordination needed when a new custom action is added in BE meta.

```svelte
<script lang="ts">
  import type { Component } from 'svelte';

  let { name, size = 16, class: className = '' }: { name: string; size?: number; class?: string } = $props();

  let IconComponent = $state<Component<any> | null>(null);
  let error = $state(false);

  $effect(() => {
    const currentName = name;
    error = false;
    // PascalCase → kebab-case to match @lucide/svelte icon file names
    // e.g. 'KeyRound' → 'key-round', 'ArrowUpFromLine' → 'arrow-up-from-line'
    const kebabName = currentName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    import(`@lucide/svelte/icons/${kebabName}`)
      .then((module) => {
        if (currentName !== name) return;  // stale — discard (race guard)
        IconComponent = module.default;
      })
      .catch(() => {
        console.warn(`[DynamicIcon] Unknown icon "${currentName}" — check BE metadata. Expected a PascalCase Lucide icon name, e.g. "KeyRound".`);
        error = true;
        IconComponent = null;
      });
  });
</script>

{#if IconComponent}
  <IconComponent {size} class={className} />
{:else}
  <span style="width:{size}px;height:{size}px;display:inline-block" class={className}></span>
{/if}
```

**Package note:** The project uses `@lucide/svelte` (v1.17.0), not `lucide-svelte`. The subpath export `@lucide/svelte/icons/*` maps to `dist/icons/*.js` (kebab-case filenames). Existing static imports in `TableRow.svelte` use `import KeyRound from '@lucide/svelte/icons/key-round'` — the dynamic import follows the same resolution path.

**3. Extend `useRowActions` composable with custom action handling** — `src/lib/components/entity-list-table/composables/useRowActions.svelte.ts`:

The composable already handles all built-in row actions (edit, delete, restore, duplicate, preview, versionHistory) and already imports `pushRFC7807Error` + `pushImpactError`. Add custom action handling here so the view stays clean.

Add `customActionHandlers` to `RowActionsOptions`:
```ts
export interface RowActionsOptions<TRow extends Record<string, unknown>> {
  // ... existing fields ...
  customActionHandlers?: Record<string, (row: TRow) => void>;
}
```

Add the handler function inside the composable:
```ts
function handleCustomAction(action: { actionName: string; translationKey: string }, row: TRow) {
  const handler = customActionHandlers?.[action.actionName];
  if (handler) {
    handler(row);
  } else {
    // No handler registered for this action — show a "not implemented"
    // toast so the user sees the action exists but isn't wired yet.
    // This makes it immediately obvious to developers that they forgot
    // to register a handler in customActionHandlers.
    pushRFC7807Error({
      type: '/errors/not-implemented',
      title: tFn('errors.notImplemented.title'),
      status: 501,
      detail: tFn('errors.notImplemented.detail', { action: action.actionName }),
      instance: `customAction:${action.actionName}`,
      internal_code: 'CUSTOM_ACTION_NO_HANDLER',
      severity: 'LOW',
    });
  }
  closeRowDropdown?.();
}
```

Expose it in the return:
```ts
return {
  // ... existing exports ...
  handleCustomAction,
};
```

**4. Thread `customActionHandlers` through the component chain:**

- `src/lib/components/entity-list-table/EntityListTable.svelte` — accept `customActionHandlers?: Record<string, (row: TRow) => void>`, pass to `useRowActions` options, pass `handleCustomAction` down
- `src/lib/components/entity-list-table/components/EntityListTableContent.svelte` — thread `handleCustomAction`
- `src/lib/components/entity-list-table/components/EntityListTableTableView.svelte` — thread `handleCustomAction`
- `src/lib/components/entity-list-table/components/TableRow.svelte` — receive `handleCustomAction` as a prop. After the preview item and before the delete separator, render custom actions:
```svelte
{#if entityRowActions?.customActions}
  {#each entityRowActions.customActions as action}
    {@const isDisabled = action.disabledWhenDeleted && isRowDeleted(row)}
    <DropdownMenu.Item
      onclick={(e) => { e.stopPropagation(); if (isDisabled) return; handleCustomAction(action, row); }}
      class={isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : (action.textColor ?? '')}
    >
      <div class="flex items-center gap-2">
        <DynamicIcon name={action.icon} size={16} class="opacity-70" />
        <span>{$t(action.translationKey)}</span>
      </div>
    </DropdownMenu.Item>
  {/each}
{/if}
```

`TableRow.svelte` does NOT import `pushRFC7807Error` — all error logic lives in the composable.

**Placement in dropdown:** Custom actions render after the built-in view actions (edit, duplicate, versionHistory, preview) and before the delete separator. No separator between preview and custom actions — they're all non-destructive. The existing separator before delete/restore stays as the visual divider between safe and destructive actions.

**Missing handler behavior:** If a custom action is declared in BE meta but no handler is registered in `customActionHandlers` for that `actionName`, the menu item **is still rendered** (icon + label visible). Clicking it calls `handleCustomAction` in the `useRowActions` composable, which finds no handler and fires a `pushRFC7807Error` toast with an RFC7807 "Not Implemented" error (HTTP 501, severity LOW, `internal_code: CUSTOM_ACTION_NO_HANDLER`). All error logic lives in the composable — `TableRow.svelte` just calls `handleCustomAction(action, row)` and stays clean.

**4. ChangePasswordDialog component** — co-locate with the users route (user-specific, not a generic entity dialog):
- `src/routes/(app)/system/settings/users/ChangePasswordDialog.svelte`
- Pattern: `DialogBordered color="warning"` + `Dialog.Header` (title + description) + password `Input` with eye toggle button + `Dialog.Footer` (cancel + confirm).
- State: `password = $state('')`, `showPassword = $state(false)`, `isSubmitting = $state(false)`.
- `isValid = $derived(PASSWORD_REGEX.test(password))`.
- Confirm button `disabled={!isValid || isSubmitting}`.
- Props: `open: boolean`, `onOpenChange`, `user: { uuid, display_name } | null`, `onConfirm: (password: string) => Promise<void>`.
- Eye toggle: button swapping `type="password"` ↔ `type="text"` with `Eye`/`EyeOff` lucide icons (statically imported — these are dialog-specific, not metadata-driven).

**5. Users list page wiring** — `src/routes/(app)/system/settings/users/+page.svelte`:
- Add `passwordDialogOpen = $state(false)`, `passwordUser = $state<{uuid, display_name}|null>(null)`.
- Pass `customActionHandlers` to `EntityListTable`:
```ts
customActionHandlers={{
  changePassword: (row) => { passwordUser = { uuid: row.uuid, display_name: row.display_name }; passwordDialogOpen = true; }
}}
```
- Render `<ChangePasswordDialog>` at the bottom of the page.
- `onConfirm` handler:
```ts
async function handlePasswordChange(password: string) {
  if (!passwordUser) return;
  isSubmitting = true;
  try {
    const res = await apiFetch(`/api/v1/auth/users/${passwordUser.uuid}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Password change failed');
    }
    // IMPORTANT FOR POSTERITY:
    // The BE endpoint returns success only when Casdoor confirms the password
    // change — the BE explicitly checks result.status === "ok" in the Casdoor
    // response (see user.service.ts changeUserPassword). A 200 from our BE
    // already guarantees Casdoor accepted the new password.
    // The BE is responsible for publishing a "password-changed" event to the
    // notification microservice (primebrick-us-v3) so it sends a transactional
    // email to the user. The FE does NOT trigger the email directly — it only
    // shows a success toast to the admin who performed the change.
    // TODO(future): when the BE event + email microservice are wired, verify
    // the email is sent by checking the notification service logs, not here.
    toast.success($t('shell.settings.users.changePasswordSuccess'));
    passwordDialogOpen = false;
    passwordUser = null;
  } catch (err) {
    toast.error($t('shell.settings.users.changePasswordFailed'));
  } finally {
    isSubmitting = false;
  }
}
```

**6. Translations** — add to all 6 language files:
- `shell.settings.users.changePassword` → "Cambia Password" / "Change Password" / etc.
- `shell.settings.users.changePasswordTitle` → dialog title
- `shell.settings.users.changePasswordDescription` → warning description (mention the user will be logged out / notified)
- `shell.settings.users.changePasswordSuccess` → success toast
- `shell.settings.users.changePasswordFailed` → error toast
- `validation.passwordWeak` → "Password must be 8-64 chars with uppercase, lowercase, digit and special char"
- `errors.notImplemented.title` → "Not implemented" / "Non implementato" / etc.
- `errors.notImplemented.detail` → "Action '{action}' is not yet available." / "L'azione '{action}' non è ancora disponibile." / etc. (uses `{action}` interpolation for the actionName)

---

## Issue 9: Dropdown menu alignment — left or right (not center)

**Root cause:** `DropdownMenu.Content` defaults to bits-ui `align="center"` when no `align` prop is passed. Several usages omit `align`.

**Fix:**
1. Set the default alignment in the shared `dropdown-menu-content.svelte` is NOT possible (align is a bits-ui prop consumed by the primitive). Instead, audit all `DropdownMenu.Content` usages and set `align="start"` (left-align) explicitly. bits-ui auto-flips to the right side when left-align would overflow the viewport (collision detection), which satisfies "left, or right if out of viewport, never center".
2. Audit and set `align="start"` on every `<DropdownMenu.Content>` that currently has no `align` or uses `align="center"`. Keep `align="end"` where it is intentionally used (e.g. `TableRow.svelte` row actions — the actions column is on the right edge, so `end` is correct there; verify it flips correctly).

**Files:** grep all `DropdownMenu.Content` usages in `src/` and set `align="start"` where missing. Key files:
- `src/lib/components/ui/dropdown-menu/dropdown-menu-content.svelte` (no change — passes through)
- `src/lib/components/AppPageBreadcrumb.svelte` line 41 (already `align="start"` ✓)
- `src/lib/components/entity-list-table/components/TableRow.svelte` line 250 (`align="end"` — keep, right-edge column)
- All other usages: set `align="start"` if currently centered/missing.

**Verification:** `rg "DropdownMenu\.Content" src/ --no-heading | rg -v "align="` → every match must get `align="start"` or `align="end"`.

---

## Issue 10: Checkbox tooltip transparency (deep investigation + definitive fix)

**Report:** The tooltip on checkbox form fields with `FormLabelWithPriorityHelp` is transparent in some forms (profile/edit) but opaque in the CREATE page, despite using the same component.

**Empirical analysis to perform during implementation:**
1. Both `PriorityTooltipContent` and the fallback `Tooltip.Content` use `bg-foreground text-background` (fully opaque). So the component itself is NOT transparent.
2. The difference must be in the **page context**:
   - CREATE page: checkboxes live in a plain `<form>` inside `FormPageLayout` children (`<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">`).
   - PROFILE/EDIT pages: same `FormPageLayout` wrapper.
   - Check whether PROFILE/EDIT wrap the checkbox section in an extra container with `opacity-*`, `backdrop-blur`, or a `transform`/`filter` that creates a stacking context where the tooltip's `bg-foreground` is composited against a semi-transparent ancestor.
3. Check whether the checkbox tooltips in PROFILE/EDIT actually receive a `priority` prop. If `getColMeta('is_admin')?.tooltipPriority` is `undefined` in PROFILE meta but defined in CREATE meta, PROFILE uses the fallback `Tooltip.Content` (still opaque) — so this alone doesn't explain transparency, but it changes the rendered DOM.
4. Inspect the rendered tooltip in the browser devtools during implementation: check computed `background-color`, `opacity`, and whether a parent has `opacity < 1` or `filter`.

**Most likely root cause (hypothesis):** A parent container in PROFILE/EDIT applies `opacity-90`/`backdrop-blur`/`filter` which makes the otherwise-opaque `bg-foreground` tooltip composite as semi-transparent. The CREATE page lacks that wrapper.

**Definitive fix (regardless of root cause):** Make the tooltip robust against ancestor compositing:
1. In `PriorityTooltipContent` and `Tooltip.Content`, the `bg-foreground` is already solid. Add an explicit `opacity-100` and ensure the content is portaled out of any transparent ancestor. bits-ui Tooltip.Content is NOT portaled by default (confirmed in v3 plan). 
2. **Primary fix:** Wrap the tooltip content rendering in a `<Portal>` (bits-ui `Portal`) so it mounts at the document body, escaping any ancestor `opacity`/`filter`/stacking context. This is the definitive remediation: portal the tooltip content to `<body>` so no ancestor can make it transparent.
3. Apply the Portal fix in both `tooltip-content.svelte` and `priority-tooltip-content.svelte` (and verify the Popover content, which has the same issue, is also portaled — `popover-content.svelte` already uses `PopoverPortal`).

**Files:**
- `src/lib/components/ui/tooltip/tooltip-content.svelte` — wrap in `Portal`
- `src/lib/components/ui/tooltip/priority-tooltip-content.svelte` — wrap in `Portal`
- Verify `src/lib/components/ui/tooltip/tooltip-portal.svelte` exists (or create it mirroring `dropdown-menu-portal.svelte`).

**Verification:** After the fix, hover the checkbox help icon on PROFILE, EDIT, and CREATE pages — all three tooltips must render with a fully opaque `bg-foreground` background, regardless of page context.

---

## Issue 11: BE error `invalid input syntax for type json` on edit user

**Root cause:** The `roles` column is `jsonb`. On update, `UserService.updateUserProfile` (line 314) and `UserService.updateUser` (line 128/179) pass the JS array directly to `dal.updateProfile` → `repo.update` → pg parameter. The pg driver serializes a JS array as a PG array literal `{"administrators","HR"}`, but the column expects JSON, so Postgres tries to parse `{"administrators","HR"}` as JSON and fails (`Expected ":", but found ","`).

`createUser` works because it explicitly `JSON.stringify(roles)` (line 100).

**Fix:** Stringify `roles` to a JSON string before passing to the repository, in both update paths. The repository already passes the value as a parameter; a JSON string is valid `jsonb` input.

**Files:**
- `src/modules/auth/services/user.service.ts`:
  - `updateUserProfile` (line 314): `if (body.roles !== undefined) updateBody.roles = JSON.stringify(body.roles);`
  - `updateUser` (line 128): `if (body.roles !== undefined) updateBody.roles = JSON.stringify(body.roles);`
- **Defensive:** Also fix `UserProfilesDal.updateProfile` to stringify if a non-string `roles` is passed (belt-and-suspenders), OR keep the fix in the service only (preferred — single responsibility).

**Verification:** Edit an existing user, add a role, save → no `22P02` error; verify the `roles` jsonb column in DB contains a valid JSON array after update.

---

## Issue 12: Breadcrumb missing middle element on CREATE/EDIT of Users and Orgs

**AS IS:** `Sistema / Impostazioni / Crea Utente`
**TO BE:** `Sistema / Impostazioni / Utenti / Crea Utente`

**Root cause:** CREATE/EDIT breadcrumbs hardcode 3 segments and skip the entity-list middle segment (`Utenti` / `Organizations`). The user wants the middle segment present so they can navigate back to the list via the breadcrumb, and because the route root is still `/users` or `/organizations`.

**Fix:** Insert the entity list segment (with `href` to the list page) between the settings tab segment and the create/edit title segment. Use the `settingsTabMenuSegment` dropdown for the "Impostazioni" segment so users can also jump between settings tabs (the "hidden feature" the user mentioned).

**Files:**
- `src/routes/(app)/system/settings/users/create/+page.svelte` (lines 366-372):
  ```svelte
  <AppPageBreadcrumb
    segments={[
      { label: $t('shell.system') },
      settingsTabMenuSegment({ pathname: $page.url.pathname, searchParams: $page.url.searchParams, t: $t }),
      { label: $t('shell.settings.tabs.users'), href: '/system/settings/users' },
      { label: $t('shell.settings.users.create.title') }
    ]}
  />
  ```
- `src/routes/(app)/system/settings/users/[uuid]/+page.svelte` (lines 329-334): same pattern with `shell.settings.tabs.users` + `shell.settings.users.update.title`.
- Apply the same fix to the ORG create/edit pages (find them under `src/routes/(app)/system/settings/organizations/...`).

**Note:** `$page` is already imported in both pages (`import { page } from '$app/state'`). `settingsTabMenuSegment` is already imported in the EDIT page (line 31); add the import to the CREATE page.

---

## Issue 13: Dark-mode blue/sky → neutral palette (core form + settings)

**Scope (per user decision):** Refactor `switch.svelte`, `settings/+layout.svelte` active tab, `FormPageLayout.svelte` version badge, `security/+page.svelte`. Leave `event-card`, `avatar-chrome-palette`, `FiltersPanel` hovers, `VersionHistoryPanel`, `AppTopbar`, `ErrorsPanel` for a later pass.

**Why it regressed:** These components were authored with a sky/amber "browser vs record" semantic palette (switch) and sky "active" accents (settings tab, version badge, security). The project's dark palette decision is neutral-based, so these sky accents break the neutral dark theme.

**Fix — replace sky with neutral in dark mode (keep light mode usable):**

1. **`src/lib/components/ui/switch/switch.svelte`** (lines 26-44): replace `sky-*` with neutral equivalents:
   - `border-sky-200/80 dark:border-sky-900/55` → `border-input dark:border-input/60`
   - `hover:border-sky-300/85 hover:bg-sky-50/45 dark:hover:border-sky-700/70` → `hover:border-ring/40 hover:bg-muted/40 dark:hover:border-ring/40`
   - Keep the amber "checked" palette (amber is a semantic "record/active" color, not blue) OR also neutralize it — per user "neutral palette", neutralize checked too: `data-[state=checked]:bg-primary data-[state=checked]:border-primary` (use primary, which is neutral). **Decision:** use `bg-primary`/`border-primary` for checked state (neutral primary), removing amber too.
   - Thumb border: same neutral replacements.

2. **`src/routes/(app)/system/settings/+layout.svelte`** (line 61): replace `border-sky-200/80 dark:border-sky-900/55` active tab → `border-input dark:border-input/60` (or `border-ring/40`).

3. **`src/lib/components/FormPageLayout.svelte`** (line 84): replace `border-sky-600 dark:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/20` → `border-input dark:border-input/60 hover:bg-muted/40`.

4. **`src/routes/(app)/system/settings/security/+page.svelte`** (lines 158, 165): replace `border-sky-600 dark:border-sky-400` → `border-input dark:border-input/60`.

**Verification:** Toggle dark mode, open settings pages + a form with Switch + the FormPageLayout version badge — no blue/sky accents remain in those surfaces.

---

## Implementation order

1. **Issue 11** (BE jsonb fix) — 1-line-ish, unblocks editing users.
2. **Issue 6** (ComboSelect snippet rename) — 1 line, restores org two-line item.
3. **Issue 7** (roles two-line snippet) — depends on understanding ComboSelect itemSnippet (same as #6).
4. **Issue 5** (required-field convention) — FormLabel prop + page edits.
5. **Issue 3** (click badge opens panel) — verify + small fix.
6. **Issue 4** (VersionsPanel padding) — small CSS.
7. **Issue 12** (breadcrumb middle element) — users + orgs create/edit.
8. **Issue 9** (dropdown alignment) — audit + set align.
9. **Issue 10** (tooltip transparency) — Portal fix in tooltip content components.
10. **Issue 13** (dark-mode neutral) — switch + settings + FormPageLayout + security.
11. **Issue 8** (Change Password) — largest: metadata `customActions` + `DynamicIcon.svelte` + `customActionHandlers` prop + FE dialog + BE endpoint + Casdoor password.
12. **Issue 2** (v3 checklist re-verification) — final pass.

---

## Files to modify

### Frontend (`primebrick-fe-v3`)
- `src/lib/components/sidebar/SidebarHealthBadge.svelte` — #3
- `src/lib/shell/sheets/panels/VersionsPanel.svelte` — #4
- `src/lib/components/ui/form/form-label.svelte` — #5
- `src/routes/(app)/system/settings/users/create/+page.svelte` — #5, #6, #7, #12
- `src/routes/(app)/system/settings/users/[uuid]/+page.svelte` — #5, #7, #12
- `src/routes/(app)/system/settings/profile/+page.svelte` — #5
- `src/routes/(app)/system/settings/users/+page.svelte` — #8 (customActionHandlers + dialog wiring)
- `src/routes/(app)/system/settings/users/ChangePasswordDialog.svelte` — **NEW** #8
- `src/lib/components/ui/DynamicIcon.svelte` — **NEW** #8 (lazy Lucide icon loader)
- `src/lib/entity-list/types.ts` — #8 (extend `EntityListListMeta.rowActions` with `customActions`)
- `src/lib/components/entity-list-table/EntityListTable.svelte` — #8 (customActionHandlers prop + pass to useRowActions)
- `src/lib/components/entity-list-table/composables/useRowActions.svelte.ts` — #8 (handleCustomAction + default "not implemented" fallback)
- `src/lib/components/entity-list-table/components/EntityListTableContent.svelte` — #8
- `src/lib/components/entity-list-table/components/EntityListTableTableView.svelte` — #8
- `src/lib/components/entity-list-table/components/TableRow.svelte` — #8 (render custom actions, calls handleCustomAction), #9
- `src/lib/components/ui/tooltip/tooltip-content.svelte` — #10 (Portal)
- `src/lib/components/ui/tooltip/priority-tooltip-content.svelte` — #10 (Portal)
- `src/lib/components/ui/tooltip/tooltip-portal.svelte` — **NEW or verify exists** #10
- `src/lib/components/ui/switch/switch.svelte` — #13
- `src/routes/(app)/system/settings/+layout.svelte` — #13
- `src/lib/components/FormPageLayout.svelte` — #13
- `src/routes/(app)/system/settings/security/+page.svelte` — #13
- `src/routes/(app)/system/settings/organizations/create/+page.svelte` — #12 (verify path)
- `src/routes/(app)/system/settings/organizations/[uuid]/+page.svelte` — #12 (verify path)
- All 6 i18n message files — #7, #8

### Backend (`primebrick-be-v3`)
- `src/modules/auth/user-profiles.meta.ts` — #8 (add `customActions` to `rowActions`)
- `src/modules/auth/services/user.service.ts` — #11 (stringify roles), #8 (changeUserPassword)
- `src/modules/auth/casdoor-api-client.ts` — #8 (send password in updateUser)
- `src/modules/auth/routers/users.router.ts` — #8 (new endpoint)
- `src/modules/auth/dto.ts` — #8 (ChangePasswordBody schema)

---

## Verification

- [ ] `pnpm run check` (FE) passes
- [ ] `pnpm run build` (BE) passes
- [ ] Edit user, add role, save → no `22P02` jsonb error; DB `roles` column holds valid JSON array (#11)
- [ ] CREATE user: org dropdown shows two-line items (display_name + idp_name) (#6)
- [ ] CREATE user: roles dropdown shows two-line items (translated label + idp_role) (#7)
- [ ] CREATE/EDIT: all required fields show consistent asterisk + stronger label; optional fields don't (#5)
- [ ] Click sidebar health badge (expanded + collapsed) opens VersionsPanel (#3)
- [ ] VersionsPanel content has comfortable padding (#4)
- [ ] Breadcrumb on users/orgs CREATE/EDIT shows `Sistema / Impostazioni / <Entity> / <Action>` (#12)
- [ ] All dropdown menus align left (or right when left overflows), never center (#9)
- [ ] Checkbox help tooltips are fully opaque on PROFILE, EDIT, CREATE (#10)
- [ ] Dark mode: switch, settings tabs, version badge, security page show no blue/sky (#13)
- [ ] Users list row dropdown shows "Cambia Password" item (icon loaded dynamically from BE meta `icon: 'KeyRound'`); clicking opens dialog; strong password validation; BE calls Casdoor; success toast (#8)
- [ ] Custom action with no registered handler renders in the menu and shows a "Not Implemented" RFC7807 toast on click (no silent skip) (#8)
- [ ] Custom action on a soft-deleted row with `disabledWhenDeleted: true` is greyed out (#8)
- [ ] v3 plan checklist re-verified (#2)

---

## Risks / considerations

- **Issue 8 (customActions metadata + DynamicIcon):** Threading `customActionHandlers` through 4 components touches the shared EntityListTable — must not break existing pages (customers, organizations) that don't pass it. The prop is optional; default behavior unchanged. `DynamicIcon.svelte` uses Vite dynamic import — verify the bundler creates separate chunks per icon (not one giant chunk) and that the `@lucide/svelte/icons/*` subpath resolves correctly at build time. If a BE meta defines a custom action with an icon name that doesn't exist in Lucide, the dev console shows a warning and the menu item renders with an empty icon span — visible immediately in dev, not a silent production failure.
- **Issue 8 (missing handler behavior):** If BE meta declares a `customAction` but the FE route doesn't register a handler for that `actionName`, the item is still rendered and clicking it calls `handleCustomAction` in `useRowActions`, which fires a `pushRFC7807Error` toast (HTTP 501, `CUSTOM_ACTION_NO_HANDLER`, severity LOW). All error logic is centralized in the composable — `TableRow.svelte` has no error imports. The `errors.notImplemented.*` translation keys must be added to all 6 language files.
- **Issue 10 (Portal):** Portaling tooltip content changes its DOM location to `<body>`. Verify CSS variables (theme tokens) still resolve at the portal target — shadcn tokens are defined on `:root`/`.dark`, so they will. Verify positioning still works (bits-ui PopperLayer handles portal positioning).
- **Issue 11 (stringify roles):** Must also verify the `roles` value read back from DB is still parsed as an array by the FE (pg returns jsonb as a JS array by default — unchanged).
- **Issue 13 (switch neutralization):** Removing amber "checked" state in favor of `bg-primary` changes a visible semantic. Confirm with user during implementation if amber should stay (amber is not blue, so it may be acceptable). Plan currently neutralizes both per "neutral palette" decision.
- **Issue 5 (required prop):** Adding a prop to the shared `FormLabel` is backward-compatible (optional prop). Verify formsnap's `FormPrimitive.Label` passes through unknown props without error.
