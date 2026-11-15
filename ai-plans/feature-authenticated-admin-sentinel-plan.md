# Feature Plan: `AUTHENTICATED_ADMIN` RBAC Sentinel

**Status:** Draft — awaiting approval
**Scope:** SDK + BE + FE
**Out of scope:** MFA step-up enforcer (separate follow-up plan)

---

## 1. Objective & Scope

### Objective

Introduce a new RBAC sentinel `Permission.AUTHENTICATED_ADMIN` in the SDK, and use it to protect the admin "change password" operation **by design** on both the backend (BE middleware + route) and the frontend (FE meta-driven rendering).

Today the change-password route is gated by `Permission.USERS_UPDATE_SINGLE`, which is a CRUD-update permission that can be granted to non-admin operators. Change-password is a **high-risk, non-CRUD** operation that must be **admin-only**. This plan replaces (not augments) that permission with a dedicated sentinel that maps directly to the `req.user.isAdmin` boolean derived from `role_mappings.is_admin`.

### In scope

- Add `AUTHENTICATED_ADMIN` as a third sentinel in the SDK `Permission` enum (alongside `PUBLIC` and `AUTHENTICATED_USER`).
- Extend `isPermissionSentinel()` to recognize it.
- Extend the BE `rbac.middleware.ts` sanity check to enforce that `AUTHENTICATED_ADMIN` must appear **alone** in the perms array.
- Add the RBAC short-circuit branch: `AUTHENTICATED_ADMIN` → allowed iff `req.user.isAdmin === true`.
- Switch the route `POST /api/v1/entities/user_profiles/:uuid/change-password` from `rbacHandler([Permission.USERS_UPDATE_SINGLE])` to `rbacHandler([Permission.AUTHENTICATED_ADMIN])`.
- Add a `requiredPermission?: string` field to the `customActions` meta contract (BE meta + FE type).
- Set `requiredPermission: "AUTHENTICATED_ADMIN"` on the `changePassword` custom action in `user-profiles.meta.ts`.
- Add a small FE permission helper (no `@primebrick/sdk` import) that maps `requiredPermission` strings to checks against `userProfileStore.current.is_admin`.
- Filter `customActions` in `TableRow.svelte` so non-admin users do not see the "Change password" menu item.

### Explicitly out of scope (follow-up plans)

- **MFA step-up enforcer** — the in-app step-up authentication flow. This plan only introduces the by-design admin gate; MFA builds on top later.
- **Old-password verification** on self-service change-password.
- **Email notification** when an admin changes another user's password.
- **Audit trail** for password changes.
- **Password policy unification** between self-service and admin endpoints.
- **Log cleanup** — removal of password fields from Casdoor client logs.

---

## 2. Empirical Evidence Summary

All facts below are verified. Do **not** re-verify during implementation.

### SDK — `primebrick-v3-sdk/src/auth/`

- `permissions.ts` lines 26-86: `Permission` enum object with sentinels `PUBLIC: "_public"` and `AUTHENTICATED_USER: "_authenticated_user"`.
- `permissions.ts` lines 94-96: `isPermissionSentinel(p)` returns `p === Permission.PUBLIC || p === Permission.AUTHENTICATED_USER`.
- `permissions.ts` lines 156-177: `expandPermissions(roles, getRoleMappingFn)` returns `{ patterns, isAdmin }` where `isAdmin` becomes `true` if ANY of the user's roles has `is_admin=true` in `role_mappings` table.
- `rbac.ts` lines 41-43: `AUTHENTICATED_USER` → `{ allowed: true }`.
- `rbac.ts` lines 46-48: `if (user.isAdmin) return { allowed: true }` (admin bypass).
- `types.ts` line 51: `AuthUser.isAdmin: boolean`.
- `token-normalizer.ts` lines 117-135: `buildAuthUser(...)` sets `isAdmin` from the expanded permissions.

### BE — `primebrick-be-v3/src/modules/auth/`

- `rbac.middleware.ts` lines 76-85: sanity check — `PUBLIC` and `AUTHENTICATED_USER` must appear ALONE in the perms array.
- `rbac.middleware.ts` lines 132-135: `isAuthenticatedOnly` short-circuit calls `next()` without RBAC check.
- `auth.middleware.ts`: populates `req.user` via SDK `verifyAuth()`. `req.user.isAdmin` is already populated from `role_mappings.is_admin`.
- `user-profiles.router.ts` lines 179-184: route `POST /api/v1/entities/user_profiles/:uuid/change-password` currently uses `rbacHandler([Permission.USERS_UPDATE_SINGLE])`. **This is the WRONG permission.**
- `user-profiles.router.ts` lines 109-138: the `changePassword` handler validates body against `makeChangePasswordSchema(policy)` and calls `service.changePassword(uuid, newPassword)`.
- `user-profiles.meta.ts` lines 63-71: `customActions` array contains `{ actionName: "changePassword", translationKey: "shell.settings.users.changePassword", icon: "key-round", textColor: "", disabledWhenDeleted: true }`. **No `permission` field exists.**
- `user-profiles.meta.ts` is returned by `GET /api/v1/entities/user_profiles/meta` (see `user-profiles.router.ts` lines 53-55, 142-146).

### FE — `primebrick-fe-v3/src/`

- `lib/user-profile-store.svelte.ts` line 14: `UserProfile` interface HAS `is_admin?: boolean`. Lines 44-64: `userProfileStore` with `current` getter and `set()`/`clear()`.
- `routes/(app)/+layout.svelte` line 29: reads `data.profile.is_admin` from `/api/v1/auth/me` response and stores it via `userProfileStore.set({ ..., is_admin: data.profile.is_admin, ... })`. **The FE already knows `is_admin` of the current user.**
- `lib/components/entity-list-table/types.ts` lines 83-88: `customActions` type is `Array<{ actionName: string; translationKey: string; icon: string; textColor?: string; disabledWhenDeleted?: boolean }>`. **No `permission` field.**
- `lib/components/entity-list-table/components/TableRow.svelte` lines 299-304: renders ALL `entityRowActions.customActions` with NO permission check — every user who can see the list sees the "Change password" menu item.
- `lib/components/entity-list-table/composables/useRowActions.svelte.ts` lines 275-291: `handleCustomAction(action, row)` dispatches to registered handlers; no permission filtering.
- `lib/components/entity-list-table/dialogs/ChangePasswordDialog.svelte` line 72: calls `apiFetch('/api/v1/entities/user_profiles/${uuid}/change-password', ...)`.
- `lib/api-ext.ts` lines 10-12: **FE does NOT import `@primebrick/sdk`** — "FE standalone implementation — it does NOT depend on @primebrick/sdk". So the FE cannot reference the `Permission` enum directly; the meta must carry a **string** value and the FE maps it locally.

### How "admin" is determined (empirically confirmed)

- **Source of truth:** `role_mappings.is_admin` column (DB).
- `expandPermissions()` sets `isAdmin=true` if ANY of the user's roles has `is_admin=true`.
- `req.user.isAdmin` is populated from this.
- The role NAME `administrators` is a seed convention (per AGENTS.md), but the actual gate is the `is_admin` **boolean** on the role mapping, NOT the role name.
- The `user_profiles.is_admin` column is a separate display/sync field (set from Casdoor `isAdmin`), NOT the RBAC bypass source.

---

## 3. Architecture

The sentinel flows in one direction: **SDK → BE middleware → BE route → BE meta → FE types → FE rendering**.

```
┌─────────────────────────────────────────────────────────────────────┐
│ SDK (primebrick-v3-sdk/src/auth/)                                    │
│  Permission.AUTHENTICATED_ADMIN = "_authenticated_admin"             │
│  isPermissionSentinel() recognizes it                                │
│  rbac.ts: AUTHENTICATED_ADMIN → allowed iff user.isAdmin === true    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BE middleware (rbac.middleware.ts)                                   │
│  sanity check: AUTHENTICATED_ADMIN must appear ALONE in perms[]      │
│  short-circuit: if req.user.isAdmin === true → next()                │
│  else → 403                                                          │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BE route (user-profiles.router.ts)                                   │
│  POST /:uuid/change-password                                         │
│  rbacHandler([Permission.AUTHENTICATED_ADMIN])  ← REPLACES old perm  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BE meta (user-profiles.meta.ts)                                      │
│  customActions[].requiredPermission = "AUTHENTICATED_ADMIN"          │
│  served by GET /api/v1/entities/user_profiles/meta                   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FE types (entity-list-table/types.ts)                                │
│  customActions[].requiredPermission?: string                         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FE helper (lib/permissions.svelte.ts)  — NO @primebrick/sdk import   │
│  hasRequiredPermission("AUTHENTICATED_ADMIN") → is_admin === true    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FE rendering (TableRow.svelte)                                       │
│  filter customActions by hasRequiredPermission(action.requiredPerm)  │
│  non-admin → "Change password" menu item hidden                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key design points:**

1. The sentinel value is a string (`"_authenticated_admin"`) in the SDK enum. The BE route references the SDK `Permission` enum. The BE meta emits the **human-readable name** `"AUTHENTICATED_ADMIN"` (not the underscore value) so the FE can match it without importing the SDK.
2. The FE never imports `@primebrick/sdk`. It receives `requiredPermission: "AUTHENTICATED_ADMIN"` as a plain string from the meta and maps it locally to `userProfileStore.current.is_admin === true`.
3. The BE remains the authoritative gate. The FE hiding the menu item is a UX courtesy, not a security control — the API returns 403 for non-admins regardless.

---

## 4. Detailed Changes Per Repo

### 4.1 SDK — `primebrick-v3-sdk/src/auth/`

#### 4.1.1 `permissions.ts` — add the sentinel enum value

**File:** `primebrick-v3-sdk/src/auth/permissions.ts`
**Lines:** 26-86 (enum body)

**Before (excerpt around existing sentinels):**
```ts
export const Permission = {
  PUBLIC: "_public",
  AUTHENTICATED_USER: "_authenticated_user",
  // ... CRUD permissions ...
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];
```

**After:**
```ts
export const Permission = {
  PUBLIC: "_public",
  AUTHENTICATED_USER: "_authenticated_user",
  AUTHENTICATED_ADMIN: "_authenticated_admin",
  // ... CRUD permissions ...
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];
```

**Why:** Introduces the third sentinel following the exact same pattern as the existing two.

---

#### 4.1.2 `permissions.ts` — extend `isPermissionSentinel()`

**File:** `primebrick-v3-sdk/src/auth/permissions.ts`
**Lines:** 94-96

**Before:**
```ts
export function isPermissionSentinel(p: string): boolean {
  return p === Permission.PUBLIC || p === Permission.AUTHENTICATED_USER;
}
```

**After:**
```ts
export function isPermissionSentinel(p: string): boolean {
  return (
    p === Permission.PUBLIC ||
    p === Permission.AUTHENTICATED_USER ||
    p === Permission.AUTHENTICATED_ADMIN
  );
}
```

**Why:** The BE sanity check uses `isPermissionSentinel()` to enforce "must appear alone". Without this, `AUTHENTICATED_ADMIN` would not be treated as a sentinel and could be silently combined with other perms.

---

#### 4.1.3 `rbac.ts` — add the `AUTHENTICATED_ADMIN` branch

**File:** `primebrick-v3-sdk/src/auth/rbac.ts`
**Lines:** 41-48 (near the `AUTHENTICATED_USER` and admin-bypass branches)

**Before (excerpt):**
```ts
  // AUTHENTICATED_USER sentinel
  if (perm === Permission.AUTHENTICATED_USER) {
    return { allowed: true };
  }

  // Admin bypass
  if (user.isAdmin) {
    return { allowed: true };
  }
```

**After:**
```ts
  // AUTHENTICATED_USER sentinel
  if (perm === Permission.AUTHENTICATED_USER) {
    return { allowed: true };
  }

  // AUTHENTICATED_ADMIN sentinel — allowed only for admins
  if (perm === Permission.AUTHENTICATED_ADMIN) {
    return { allowed: user.isAdmin === true };
  }

  // Admin bypass
  if (user.isAdmin) {
    return { allowed: true };
  }
```

**Why:** The sentinel must resolve to `allowed: true` only when `user.isAdmin === true`. Placing it **before** the admin bypass is harmless (the bypass would also return `allowed: true` for admins), but explicit is better — and for non-admins the early return produces `allowed: false` instead of falling through to pattern matching.

---

### 4.2 BE — `primebrick-be-v3/src/modules/auth/`

#### 4.2.1 `rbac.middleware.ts` — extend sanity check to include `AUTHENTICATED_ADMIN`

**File:** `primebrick-be-v3/src/modules/auth/rbac.middleware.ts`
**Lines:** 76-85

**Before (excerpt):**
```ts
  // Sanity check: PUBLIC and AUTHENTICATED_USER must appear ALONE in the perms array
  const sentinels = [Permission.PUBLIC, Permission.AUTHENTICATED_USER];
  const sentinelCount = perms.filter((p) => sentinels.includes(p)).length;
  if (sentinelCount > 0 && perms.length > 1) {
    throw new Error(
      `Sentinel permissions (${sentinels.join(", ")}) must appear alone in the perms array`,
    );
  }
```

**After:**
```ts
  // Sanity check: sentinels (PUBLIC, AUTHENTICATED_USER, AUTHENTICATED_ADMIN)
  // must appear ALONE in the perms array
  const sentinels = [
    Permission.PUBLIC,
    Permission.AUTHENTICATED_USER,
    Permission.AUTHENTICATED_ADMIN,
  ];
  const sentinelCount = perms.filter((p) => sentinels.includes(p)).length;
  if (sentinelCount > 0 && perms.length > 1) {
    throw new Error(
      `Sentinel permissions (${sentinels.join(", ")}) must appear alone in the perms array`,
    );
  }
```

**Why:** Same invariant as the other two sentinels — combining `AUTHENTICATED_ADMIN` with CRUD perms would be semantically meaningless (it already resolves to a boolean admin check) and would hide intent.

> **Note:** If the existing sanity check already calls `isPermissionSentinel()` from the SDK instead of hardcoding the list, then change #4.1.2 alone covers this and change #4.2.1 is a no-op. Inspect the actual implementation at lines 76-85 and apply only the relevant edit. Both paths must end with `AUTHENTICATED_ADMIN` recognized as a lone-sentinel.

---

#### 4.2.2 `rbac.middleware.ts` — add the `AUTHENTICATED_ADMIN` short-circuit

**File:** `primebrick-be-v3/src/modules/auth/rbac.middleware.ts`
**Lines:** 132-135 (near `isAuthenticatedOnly` short-circuit)

**Before (excerpt):**
```ts
  // AUTHENTICATED_USER short-circuit
  if (isAuthenticatedOnly) {
    return next();
  }
```

**After:**
```ts
  // AUTHENTICATED_USER short-circuit
  if (isAuthenticatedOnly) {
    return next();
  }

  // AUTHENTICATED_ADMIN short-circuit — admin-only gate
  const isAdminOnly = perms.length === 1 && perms[0] === Permission.AUTHENTICATED_ADMIN;
  if (isAdminOnly) {
    if (req.user?.isAdmin === true) {
      return next();
    }
    return res.status(403).json({ error: "Forbidden: admin only" });
  }
```

**Why:** Mirrors the `AUTHENTICATED_USER` short-circuit pattern. The BE is the authoritative security gate — even if the FE fails to hide the menu item, the API returns 403 for non-admins. Using `req.user?.isAdmin === true` (strict equality) avoids truthy coercion of `undefined`.

> **Note:** The SDK `rbac.ts` change (#4.1.3) is the fallback evaluator. The BE short-circuit is an explicit, early, auditable gate that does not depend on the full RBAC pattern-matching path. Both must agree.

---

#### 4.2.3 `user-profiles.router.ts` — switch the change-password route permission

**File:** `primebrick-be-v3/src/modules/auth/user-profiles.router.ts`
**Lines:** 179-184

**Before:**
```ts
router.post(
  "/:uuid/change-password",
  rbacHandler([Permission.USERS_UPDATE_SINGLE]),
  changePassword,
);
```

**After:**
```ts
router.post(
  "/:uuid/change-password",
  rbacHandler([Permission.AUTHENTICATED_ADMIN]),
  changePassword,
);
```

**Why:** This is the core fix. Change-password is admin-only by design, NOT a CRUD-update operation. This is a **replacement**, not an addition — `USERS_UPDATE_SINGLE` is removed entirely from this route. Non-admins who happen to hold `USERS_UPDATE_SINGLE` will now get 403.

---

#### 4.2.4 `user-profiles.meta.ts` — add `requiredPermission` to the `changePassword` custom action

**File:** `primebrick-be-v3/src/modules/auth/user-profiles.meta.ts`
**Lines:** 63-71

**Before:**
```ts
{
  actionName: "changePassword",
  translationKey: "shell.settings.users.changePassword",
  icon: "key-round",
  textColor: "",
  disabledWhenDeleted: true,
},
```

**After:**
```ts
{
  actionName: "changePassword",
  translationKey: "shell.settings.users.changePassword",
  icon: "key-round",
  textColor: "",
  disabledWhenDeleted: true,
  requiredPermission: "AUTHENTICATED_ADMIN",
},
```

**Why:** The meta is the contract between BE and FE for entity-list rendering. By declaring `requiredPermission` here, the FE can hide the menu item for non-admins without importing the SDK. The value is the **human-readable name** (`"AUTHENTICATED_ADMIN"`), not the underscore sentinel value (`"_authenticated_admin"`), so the FE can match it as a plain string.

---

### 4.3 FE — `primebrick-fe-v3/src/`

#### 4.3.1 `entity-list-table/types.ts` — add `requiredPermission?` to `customActions`

**File:** `primebrick-fe-v3/src/lib/components/entity-list-table/types.ts`
**Lines:** 83-88

**Before:**
```ts
customActions: Array<{
  actionName: string;
  translationKey: string;
  icon: string;
  textColor?: string;
  disabledWhenDeleted?: boolean;
}>;
```

**After:**
```ts
customActions: Array<{
  actionName: string;
  translationKey: string;
  icon: string;
  textColor?: string;
  disabledWhenDeleted?: boolean;
  requiredPermission?: string;
}>;
```

**Why:** Extends the FE type to carry the new meta field. Optional so existing custom actions without a permission gate continue to render unchanged.

---

#### 4.3.2 New file: `lib/permissions.svelte.ts` — FE permission helper

**File:** `primebrick-fe-v3/src/lib/permissions.svelte.ts` (NEW)

```ts
import { userProfileStore } from "./user-profile-store.svelte";

/**
 * FE-local permission helper.
 *
 * The FE does NOT import @primebrick/sdk (see lib/api-ext.ts). The BE meta
 * emits `requiredPermission` as a plain string (the human-readable sentinel
 * name). This helper maps that string to a check against the current user's
 * profile in `userProfileStore`.
 *
 * Extend this map as new sentinels are introduced. For now only
 * "AUTHENTICATED_ADMIN" is supported.
 */
const permissionChecks: Record<string, () => boolean> = {
  AUTHENTICATED_ADMIN: () => userProfileStore.current?.is_admin === true,
};

export function hasRequiredPermission(requiredPermission?: string): boolean {
  if (!requiredPermission) {
    // No permission declared → always visible (backward compatible)
    return true;
  }
  const check = permissionChecks[requiredPermission];
  if (!check) {
    // Unknown permission → fail closed (hide the action)
    return false;
  }
  return check();
}
```

**Why:**
- Keeps the FE standalone (no `@primebrick/sdk` import).
- Centralizes the string → check mapping so future sentinels (e.g. `AUTHENTICATED_USER`) can be added in one place.
- **Fails closed**: an unknown `requiredPermission` string hides the action rather than showing it.
- Backward compatible: `undefined` / omitted `requiredPermission` returns `true` so existing custom actions keep rendering.

---

#### 4.3.3 `TableRow.svelte` — filter `customActions` by `requiredPermission`

**File:** `primebrick-fe-v3/src/lib/components/entity-list-table/components/TableRow.svelte`
**Lines:** 299-304

**Before (excerpt):**
```svelte
{#each entityRowActions.customActions as action}
  <!-- renders the menu item for every custom action -->
{/each}
```

**After:**
```svelte
{#each entityRowActions.customActions as action}
  {#if hasRequiredPermission(action.requiredPermission)}
    <!-- renders the menu item only when the current user satisfies requiredPermission -->
  {/if}
{/each}
```

And add the import at the top of `<script>`:
```ts
import { hasRequiredPermission } from "$lib/permissions.svelte";
```

**Why:** This is the FE UX gate. Non-admins no longer see the "Change password" menu item. The BE 403 remains the authoritative security control; this is defense-in-depth + good UX.

> **Note:** If `TableRow.svelte` already filters `customActions` through a composable (e.g. `useRowActions`), apply the filter inside that composable instead, at the point where `customActions` are resolved into renderable actions (`useRowActions.svelte.ts` lines 275-291). Either location is acceptable; pick the one that avoids double-filtering. The acceptance criterion is: a non-admin does not see the "Change password" menu item.

---

## 5. The Meta Contract Change

The `customActions` array in entity meta is the BE→FE contract for per-row action menu items. Today it has no permission field. This plan adds an **optional** `requiredPermission?: string` field.

| Field                | Type     | Required | Description                                                                                          |
| -------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `actionName`         | string   | yes      | Existing. Handler key.                                                                               |
| `translationKey`     | string   | yes      | Existing. i18n key.                                                                                  |
| `icon`               | string   | yes      | Existing. Icon name.                                                                                 |
| `textColor`          | string   | no       | Existing.                                                                                             |
| `disabledWhenDeleted`| boolean  | no       | Existing.                                                                                             |
| `requiredPermission` | string   | **no**   | **NEW.** Human-readable sentinel name (`"AUTHENTICATED_ADMIN"`). FE maps it locally. Omit = visible. |

**Rules:**
1. The value is the **human-readable name** (e.g. `"AUTHENTICATED_ADMIN"`), NOT the SDK underscore value (`"_authenticated_admin"`). This keeps the FE SDK-free.
2. The field is optional. Existing custom actions without it remain visible to all users who can see the list (backward compatible).
3. The FE helper **fails closed** for unknown values — an unrecognized `requiredPermission` hides the action.
4. Only **sentinel** names are valid values. CRUD permission names (e.g. `USERS_UPDATE_SINGLE`) are NOT valid here — the FE does not have the user's full permission set, only `is_admin`. A CRUD permission on a custom action would require a different mechanism (a future plan).

---

## 6. FE Permission Helper

See change **4.3.2** for the full implementation of `lib/permissions.svelte.ts`.

**Design:**
- Single exported function: `hasRequiredPermission(requiredPermission?: string): boolean`.
- Internal map: `permissionChecks: Record<string, () => boolean>`.
- Currently one entry: `"AUTHENTICATED_ADMIN"` → `userProfileStore.current?.is_admin === true`.
- Designed to **extend later** — adding `AUTHENTICATED_USER` or MFA-related sentinels is a one-line addition to the map.
- **No `@primebrick/sdk` import** (per `lib/api-ext.ts` lines 10-12).
- **Fail-closed** on unknown strings.
- **Backward compatible** on `undefined` / omitted.

**Why a map and not a switch:** a map is trivially extensible and keeps the dispatch O(1) and declarative. Future sentinels (e.g. for MFA step-up) can be registered without touching the call sites.

---

## 7. Acceptance Criteria

All criteria are empirical and testable.

| #  | Criterion                                                                                                              | How to verify                                                                                                                                                       |
| -- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a  | A non-admin user who holds `USERS_UPDATE_SINGLE` gets **403** on `POST /api/v1/entities/user_profiles/:uuid/change-password`. | Seed a role with `is_admin=false` and `USERS_UPDATE_SINGLE` in `role_mappings`/`role_permissions`. Log in as that user, call the endpoint with a valid body → expect 403. |
| b  | An admin user (`is_admin=true`) succeeds on the same endpoint.                                                         | Log in as a user whose role has `is_admin=true`. Call the endpoint with a valid body → expect 200 (or 204) and the password changed.                                |
| c  | A non-admin user does **NOT** see the "Change password" menu item in the users list.                                   | Log in as the non-admin from (a). Open the users list. Assert the "Change password" action is absent from the row menu.                                             |
| d  | An admin user **sees** the "Change password" menu item.                                                                | Log in as the admin from (b). Open the users list. Assert the "Change password" action is present in the row menu.                                                  |
| e  | `isPermissionSentinel(Permission.AUTHENTICATED_ADMIN)` returns `true`.                                                 | SDK unit test in `primebrick-v3-sdk/src/auth/__tests__/permissions.test.ts`: `assert(isPermissionSentinel(Permission.AUTHENTICATED_ADMIN) === true)`.                                                                             |
| f  | The BE sanity check **rejects** `AUTHENTICATED_ADMIN` combined with other perms.                                       | BE unit test in `primebrick-be-v3/src/modules/auth/__tests__/rbac-middleware.test.ts`: mount a dummy route with `rbacHandler([Permission.AUTHENTICATED_ADMIN, Permission.USERS_UPDATE_SINGLE])` → expect the middleware to throw (or 500) at startup/request. |
| j  | `checkRbac` with `AUTHENTICATED_USER` allows a **non-admin** authenticated user; `checkRbac` with `AUTHENTICATED_ADMIN` **denies** the same non-admin user. | SDK unit test in `primebrick-v3-sdk/src/auth/__tests__/rbac.test.ts`: build a non-admin `AuthUser` (`isAdmin: false`), assert `checkRbac(user, [AUTHENTICATED_USER]).allowed === true` and `checkRbac(user, [AUTHENTICATED_ADMIN]).allowed === false`. |
| k  | `checkRbac` with `AUTHENTICATED_ADMIN` allows an **admin** user (`isAdmin: true`).                                      | SDK unit test in `primebrick-v3-sdk/src/auth/__tests__/rbac.test.ts`: build an admin `AuthUser` (`isAdmin: true`), assert `checkRbac(user, [AUTHENTICATED_ADMIN]).allowed === true`. |
| l  | `checkRbac` with `AUTHENTICATED_ADMIN` does **not** fall through to pattern matching for a non-admin with `USERS_UPDATE_SINGLE` in their permission set. | SDK unit test: non-admin `AuthUser` with `permissions: Set(["users.update.single"])`, assert `checkRbac(user, [AUTHENTICATED_ADMIN]).allowed === false` (the sentinel short-circuits before pattern matching). |
| g  | `requiredPermission: "AUTHENTICATED_ADMIN"` appears in the `changePassword` entry of `GET /api/v1/entities/user_profiles/meta`. | `curl /api/v1/entities/user_profiles/meta` → assert `customActions` contains the `changePassword` entry with `requiredPermission === "AUTHENTICATED_ADMIN"`.       |
| h  | A custom action with **no** `requiredPermission` still renders for all users (backward compatibility).                 | Inspect any existing custom action without the field → assert it renders for both admin and non-admin.                                                              |
| i  | An unknown `requiredPermission` string fails closed (action hidden) on the FE.                                         | Temporarily set `requiredPermission: "BOGUS"` on a custom action in meta → assert the FE hides it for all users.                                                    |

---

## 8. Out of Scope / Follow-ups

These are explicitly deferred to separate plans that build on top of this one:

1. **MFA step-up enforcer** — an in-app step-up authentication flow that requires recent MFA verification before high-risk operations (including admin change-password). This plan only introduces the admin gate; MFA will layer on top of `AUTHENTICATED_ADMIN`-gated routes.
2. **Old-password verification on self-service change-password** — the self-service endpoint should require the current password; the admin endpoint should not. This plan does not touch self-service.
3. **Email notification on admin change-password** — notify the target user when an admin changes their password.
4. **Audit trail for password changes** — record who changed whose password, when, and from where.
5. **Password policy unification** between self-service and admin endpoints — ensure both use the same `makeChangePasswordSchema(policy)` derivation consistently.
6. **Removal of password from Casdoor client logs** — log hygiene; ensure no plaintext passwords leak into Casdoor or BE logs.

---

## 9. Risk Analysis

| Risk                                                                 | Likelihood | Impact | Mitigation                                                                                                                                                         |
| -------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Existing callers of `isPermissionSentinel()`** behave differently. | Low        | Medium | `isPermissionSentinel()` only grows its return set (returns `true` for one more value). No existing caller that returned `true` before will return `false` now. Search all usages before merging. |
| **A route accidentally combines `AUTHENTICATED_ADMIN` with other perms.** | Low        | High   | The BE sanity check (#4.2.1) throws at request/startup time. Acceptance criterion (f) covers this. The same invariant that protects `PUBLIC` and `AUTHENTICATED_USER` protects the new sentinel. |
| **FE meta cache serves stale meta without `requiredPermission`.**    | Medium     | Low    | The FE filter is backward compatible: a stale meta without `requiredPermission` renders the action for everyone (old behavior). The BE 403 still protects the API. Cache invalidation should be verified but is not security-critical. |
| **`userProfileStore.current` is null at render time** (e.g. logout race). | Medium     | Low    | The helper uses optional chaining (`current?.is_admin === true`). When `current` is null, `is_admin` is `undefined`, `=== true` is `false` → action hidden (fail closed). |
| **Non-admin with `USERS_UPDATE_SINGLE` loses change-password access (regression for existing operators).** | **Intended** | Medium | This is the **desired** behavior, not a regression. Change-password was incorrectly gated by a CRUD permission. Communicate this change to operators. If a non-admin genuinely needs to reset passwords, that is a separate product decision (delegated admin), out of scope here. |
| **BE sanity check implementation diverges from `isPermissionSentinel()`.** | Low        | Medium | If the BE hardcodes the sentinel list (change #4.2.1) AND the SDK exports `isPermissionSentinel()` (change #4.1.2), both must list `AUTHENTICATED_ADMIN`. Keep them in sync; prefer delegating to the SDK function if the BE already imports it. |
| **FE helper fails closed on a typo'd sentinel name in meta.**        | Low        | Low    | Acceptance criterion (i) covers this. The fail-closed behavior is intentional; a typo hides the action rather than exposing it. A BE meta test should assert the exact string `"AUTHENTICATED_ADMIN"`. |
| **`expandPermissions` / `buildAuthUser` changes.**                   | None       | —      | This plan does NOT touch `expandPermissions` or `buildAuthUser`. `isAdmin` is already populated correctly from `role_mappings.is_admin`. No changes to the auth token pipeline. |

---

## 10. Implementation Order

Recommended order to keep each repo green:

1. **SDK** — add enum value, extend `isPermissionSentinel()`, add `rbac.ts` branch. Add unit tests (`permissions.test.ts`, `rbac.test.ts`). Run `pnpm test` (acceptance criteria e, j, k, l). Run `pnpm extract-docs` to regenerate `api.json` + `api-reference.mdx` excerpts. Update `docs/user-guide/authentication.mdx`.
2. **BE** — extend sanity check, add short-circuit, switch route permission, update meta. Add unit tests (`rbac-middleware.test.ts`, `user-profiles-router-permission.test.ts`). Run `pnpm test` (acceptance criteria a, b, f). Update `docs/modules/auth-rbac.md` and `AGENTS.md`.
3. **FE** — extend type, add `lib/permissions.svelte.ts`, filter in `TableRow.svelte`. Run FE manually / e2e (acceptance criteria c, d, h, i).

Each layer is independently testable. The SDK change is purely additive. The BE change is the security fix. The FE change is the UX fix.

---

## 11. Files Touched (Summary)

| Repo | File | Change |
| ---- | ---- | ------ |
| SDK | `primebrick-v3-sdk/src/auth/permissions.ts` | Add `AUTHENTICATED_ADMIN` enum value; extend `isPermissionSentinel()`. |
| SDK | `primebrick-v3-sdk/src/auth/rbac.ts` | Add `AUTHENTICATED_ADMIN` → `allowed: user.isAdmin === true` branch. |
| BE | `primebrick-be-v3/src/modules/auth/rbac.middleware.ts` | Extend sanity check; add `AUTHENTICATED_ADMIN` short-circuit (403 if not admin). |
| BE | `primebrick-be-v3/src/modules/auth/user-profiles.router.ts` | Switch change-password route from `USERS_UPDATE_SINGLE` to `AUTHENTICATED_ADMIN`. |
| BE | `primebrick-be-v3/src/modules/auth/user-profiles.meta.ts` | Add `requiredPermission: "AUTHENTICATED_ADMIN"` to `changePassword` custom action. |
| FE | `primebrick-fe-v3/src/lib/components/entity-list-table/types.ts` | Add `requiredPermission?: string` to `customActions` type. |
| FE | `primebrick-fe-v3/src/lib/permissions.svelte.ts` | **NEW.** FE-local permission helper (no SDK import, fail-closed). |
| FE | `primebrick-fe-v3/src/lib/components/entity-list-table/components/TableRow.svelte` | Filter `customActions` by `hasRequiredPermission(action.requiredPermission)`. |
| SDK | `primebrick-v3-sdk/docs/user-guide/authentication.mdx` | Add `AUTHENTICATED_ADMIN` to the sentinels list. |
| SDK | `primebrick-v3-sdk/docs/user-guide/_extracted/api.json` | Regenerated by `pnpm extract-docs` (do NOT hand-edit). |
| SDK | `primebrick-v3-sdk/docs/user-guide/api-reference.mdx` | Regenerated/updated excerpts listing the `Permission` enum and `isPermissionSentinel`. |
| BE | `primebrick-be-v3/docs/modules/auth-rbac.md` | Add admin-only sentinel wiring example. |
| BE | `primebrick-be-v3/AGENTS.md` | Document `AUTHENTICATED_ADMIN` sentinel in the RBAC section. |
| SDK | `primebrick-v3-sdk/src/auth/__tests__/permissions.test.ts` | **NEW.** Unit tests for the sentinel enum + `isPermissionSentinel()`. |
| SDK | `primebrick-v3-sdk/src/auth/__tests__/rbac.test.ts` | **NEW.** Unit tests for `checkRbac` — AUTHENTICATED_USER vs AUTHENTICATED_ADMIN asymmetry. |
| BE | `primebrick-be-v3/src/modules/auth/__tests__/rbac-middleware.test.ts` | **NEW.** Unit tests for the sanity check (sentinel must appear alone). |
| BE | `primebrick-be-v3/src/modules/auth/__tests__/user-profiles-router-permission.test.ts` | **NEW.** Route-level permission gate tests (403 for non-admin, 200 for admin). |

---

## 12. Documentation Updates

All documentation that mentions the existing sentinels (`PUBLIC`, `AUTHENTICATED_USER`) MUST be updated to include the new `AUTHENTICATED_ADMIN` sentinel. The updates are empirical — each file below was verified to reference the sentinel list.

### 12.1 SDK user-guide — `primebrick-v3-sdk/docs/user-guide/authentication.mdx`

**File:** `primebrick-v3-sdk/docs/user-guide/authentication.mdx`
**Line:** 158 (verified — the sentinels list)

**Before (excerpt):**
```mdx
Two sentinels are handled specially:

- `Permission.PUBLIC` — endpoint reachable without authentication
- `Permission.AUTHENTICATED_USER` — any authenticated caller passes
```

**After:**
```mdx
Three sentinels are handled specially:

- `Permission.PUBLIC` — endpoint reachable without authentication
- `Permission.AUTHENTICATED_USER` — any authenticated caller passes
- `Permission.AUTHENTICATED_ADMIN` — only callers with `isAdmin === true` pass (admin-only operations, e.g. admin change-password)
```

**Why:** This is the source-of-truth MDX that gets synced to `docs.primebrick.dev` by the docs repo CI (`sync-repo-docs.mjs`). Updating it here ensures the public docs reflect the new sentinel without hand-editing the docs repo.

---

### 12.2 BE module doc — `primebrick-be-v3/docs/modules/auth-rbac.md`

**File:** `primebrick-be-v3/docs/modules/auth-rbac.md`
**Line:** 129 (verified — the `AUTHENTICATED_USER` example in "Wiring an endpoint")

**Before (excerpt, around line 128-131):**
```md
// Authenticated endpoint (any valid token passes, regardless of roles)
router.get("/api/v1/user/profile", rbacHandler([Permission.AUTHENTICATED_USER]), asyncHandler(async (req, res) => {
  res.json({ id: req.user!.id, email: req.user!.email });
}));
```

**After (add a new example block after the AUTHENTICATED_USER one):**
```md
// Admin-only endpoint (only callers with isAdmin === true pass)
// Use for high-risk non-CRUD operations like admin change-password.
router.post(
  "/api/v1/entities/user_profiles/:uuid/change-password",
  rbacHandler([Permission.AUTHENTICATED_ADMIN]),
  asyncHandler(async (req, res) => {
    // ... handler ...
  })
);
```

**Why:** This is the BE-internal RBAC wiring guide. Developers copying the pattern need to see the admin-only sentinel example. This doc is NOT synced to the public docs site (it lives in `docs/modules/`, not `docs/user-guide/`), so it is hand-edited in the BE repo.

---

### 12.3 BE `AGENTS.md` — RBAC Permission Structure section

**File:** `primebrick-be-v3/AGENTS.md`
**Lines:** 161, 179 (verified — the "RBAC Permission System" section describes sentinels and admin bypass)

**Before (excerpt around the sentinel description):**
```md
- **Admin bypass**: Users with `is_admin=true` bypass all permission checks
```

**After (add a note about the dedicated sentinel):**
```md
- **Admin bypass**: Users with `is_admin=true` bypass all permission checks.
  For high-risk non-CRUD operations that must be **explicitly** admin-only
  (not just bypassed), use the `Permission.AUTHENTICATED_ADMIN` sentinel.
  This sentinel requires `req.user.isAdmin === true` and must appear alone
  in the permission array (same rule as `PUBLIC` and `AUTHENTICATED_USER`).
  Example: `POST /api/v1/entities/user_profiles/:uuid/change-password`.
```

**Why:** `AGENTS.md` is the first file AI agents and new developers read. Documenting the sentinel here prevents future agents from accidentally using `USERS_UPDATE_SINGLE` (or any CRUD perm) on sensitive admin-only routes.

---

### 12.4 SDK `api-reference.mdx` and docs repo synced copies

**Files:**
- `primebrick-v3-sdk/docs/user-guide/api-reference.mdx` (lines 698, 755, 758, 763, 1055, 1057 — verified references to `AUTHENTICATED_USER` / `isPermissionSentinel`)
- `primebrick-v3-docs/pages/sdk/guide/api-reference.mdx` (synced copy — DO NOT hand-edit, regenerated by `sync-repo-docs.mjs`)
- `primebrick-v3-docs/pages/sdk/guide/authentication.mdx` (synced copy — DO NOT hand-edit)

**Action:** The `api-reference.mdx` in the SDK repo is partially auto-generated by `pnpm extract-docs` (TypeDoc). After the SDK code changes (§4.1), run `pnpm extract-docs` in the SDK repo to regenerate `docs/user-guide/_extracted/api.json` and the `api-reference.mdx` excerpts that list the `Permission` enum members and `isPermissionSentinel` signature. The docs repo copies will be updated automatically by the CI sync script on the next cron run.

**Manual check:** After extraction, verify that `api-reference.mdx` lists `AUTHENTICATED_ADMIN` as a member of the `Permission` enum and that the `isPermissionSentinel` documentation mentions all three sentinels.

---

### 12.5 SDK `docs/user-guide/_extracted/api.json`

**File:** `primebrick-v3-sdk/docs/user-guide/_extracted/api.json` (lines 1351, 1414, 2508, 2558, 2573, 2585, 18999, 19219, 19224 — verified references)

**Action:** Regenerated by `pnpm extract-docs` (TypeDoc). Do NOT hand-edit. The regeneration is triggered by the same step as §12.4.

---

## 13. Unit Tests

This plan introduces unit tests in two repos: **SDK** (sentinel + `checkRbac` logic) and **BE** (middleware sanity check + route permission). The FE has no unit test infrastructure for this logic (it is covered by e2e specs in `src/e2e/`); FE coverage is via acceptance criteria (c, d, h, i) verified manually or via e2e.

### 13.1 SDK — new test files

The SDK `src/auth/` directory currently has **no** `__tests__/` subdirectory (verified — `find_file_by_name` for `**/*.test.ts` under `src/auth/` returned no results). Two new test files are introduced.

#### 13.1.1 `primebrick-v3-sdk/src/auth/__tests__/permissions.test.ts`

**File:** `primebrick-v3-sdk/src/auth/__tests__/permissions.test.ts` (NEW)

```ts
import { describe, it, expect } from "vitest";
import { Permission, isPermissionSentinel } from "../permissions.js";

describe("Permission enum", () => {
  it("exposes the AUTHENTICATED_ADMIN sentinel", () => {
    expect(Permission.AUTHENTICATED_ADMIN).toBe("_authenticated_admin");
  });

  it("keeps the existing sentinels unchanged", () => {
    expect(Permission.PUBLIC).toBe("_public");
    expect(Permission.AUTHENTICATED_USER).toBe("_authenticated_user");
  });
});

describe("isPermissionSentinel", () => {
  it("returns true for PUBLIC", () => {
    expect(isPermissionSentinel(Permission.PUBLIC)).toBe(true);
  });

  it("returns true for AUTHENTICATED_USER", () => {
    expect(isPermissionSentinel(Permission.AUTHENTICATED_USER)).toBe(true);
  });

  it("returns true for AUTHENTICATED_ADMIN", () => {
    expect(isPermissionSentinel(Permission.AUTHENTICATED_ADMIN)).toBe(true);
  });

  it("returns false for CRUD permissions", () => {
    expect(isPermissionSentinel("users.update.single")).toBe(false);
    expect(isPermissionSentinel("customers.read.all")).toBe(false);
  });

  it("returns false for unknown strings", () => {
    expect(isPermissionSentinel("BOGUS")).toBe(false);
    expect(isPermissionSentinel("")).toBe(false);
  });
});
```

**Why:** Directly covers acceptance criteria (e). Verifies the sentinel is registered and recognized by the helper that the BE sanity check relies on.

---

#### 13.1.2 `primebrick-v3-sdk/src/auth/__tests__/rbac.test.ts`

**File:** `primebrick-v3-sdk/src/auth/__tests__/rbac.test.ts` (NEW)

This is the **core** test file requested by the user: it asserts that `AUTHENTICATED_USER` and `AUTHENTICATED_ADMIN` behave differently for the same non-admin user.

```ts
import { describe, it, expect } from "vitest";
import { checkRbac } from "../rbac.js";
import { Permission } from "../permissions.js";
import type { AuthUser } from "../types.js";

/** Build a minimal AuthUser for tests. */
function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "uuid-1",
    idp_code: "idp-1",
    email: "u@example.com",
    name: "u",
    roles: [],
    permissions: new Set<string>(),
    isAdmin: false,
    isSystem: false,
    idp_org: null,
    idp_username: null,
    ...overrides,
  } as AuthUser;
}

describe("checkRbac — AUTHENTICATED_USER vs AUTHENTICATED_ADMIN", () => {
  const nonAdmin = makeUser({ isAdmin: false });
  const admin = makeUser({ isAdmin: true });

  it("AUTHENTICATED_USER allows a non-admin authenticated user", () => {
    const result = checkRbac(nonAdmin, [Permission.AUTHENTICATED_USER]);
    expect(result.allowed).toBe(true);
  });

  it("AUTHENTICATED_ADMIN denies a non-admin authenticated user", () => {
    const result = checkRbac(nonAdmin, [Permission.AUTHENTICATED_ADMIN]);
    expect(result.allowed).toBe(false);
  });

  it("AUTHENTICATED_USER allows an admin user", () => {
    const result = checkRbac(admin, [Permission.AUTHENTICATED_USER]);
    expect(result.allowed).toBe(true);
  });

  it("AUTHENTICATED_ADMIN allows an admin user", () => {
    const result = checkRbac(admin, [Permission.AUTHENTICATED_ADMIN]);
    expect(result.allowed).toBe(true);
  });

  it("AUTHENTICATED_ADMIN does NOT fall through to pattern matching for a non-admin with USERS_UPDATE_SINGLE", () => {
    // A non-admin who happens to hold users.update.single must NOT pass the
    // admin-only gate. The sentinel short-circuits before pattern matching.
    const nonAdminWithUpdate = makeUser({
      isAdmin: false,
      permissions: new Set(["users.update.single"]),
    });
    const result = checkRbac(nonAdminWithUpdate, [Permission.AUTHENTICATED_ADMIN]);
    expect(result.allowed).toBe(false);
  });

  it("AUTHENTICATED_USER does NOT grant admin-only access to a non-admin", () => {
    // Symmetric check: holding AUTHENTICATED_USER must not imply AUTHENTICATED_ADMIN.
    const result = checkRbac(nonAdmin, [Permission.AUTHENTICATED_ADMIN]);
    expect(result.allowed).toBe(false);
  });
});

describe("checkRbac — sentinel isolation", () => {
  it("PUBLIC always allows, even for a non-admin", () => {
    const result = checkRbac(makeUser({ isAdmin: false }), [Permission.PUBLIC]);
    expect(result.allowed).toBe(true);
  });

  it("system API key (isSystem) bypasses AUTHENTICATED_ADMIN", () => {
    // System keys are trusted infrastructure; they bypass all checks.
    const systemUser = makeUser({ isSystem: true, isAdmin: false });
    const result = checkRbac(systemUser, [Permission.AUTHENTICATED_ADMIN]);
    expect(result.allowed).toBe(true);
  });
});
```

**Why:** Directly covers acceptance criteria (j, k, l). The key assertion is the **asymmetry**: the same non-admin user passes `AUTHENTICATED_USER` but fails `AUTHENTICATED_ADMIN`. This is the security guarantee — a non-admin with `USERS_UPDATE_SINGLE` cannot change passwords.

---

### 13.2 BE — new test file

The BE has an existing test `primebrick-be-v3/src/modules/auth/__tests__/user-service-change-password.test.ts` (service-level, mocks Casdoor). There is **no** test for the `rbac.middleware.ts` sanity check or the route permission declaration. A new test file is introduced.

#### 13.2.1 `primebrick-be-v3/src/modules/auth/__tests__/rbac-middleware.test.ts`

**File:** `primebrick-be-v3/src/modules/auth/__tests__/rbac-middleware.test.ts` (NEW)

```ts
import { describe, it, expect } from "vitest";
import { Permission } from "@primebrick/sdk";
import { rbacHandler } from "../rbac.middleware.js";

describe("rbacHandler — sentinel sanity check", () => {
  it("accepts AUTHENTICATED_ADMIN alone", () => {
    // Building the handler must NOT throw.
    const handler = rbacHandler([Permission.AUTHENTICATED_ADMIN]);
    expect(typeof handler).toBe("function");
  });

  it("rejects AUTHENTICATED_ADMIN combined with USERS_UPDATE_SINGLE", () => {
    // The sanity check runs at handler-build time (or first request).
    // Expect a throw — combining a sentinel with a CRUD perm is a bug.
    expect(() =>
      rbacHandler([Permission.AUTHENTICATED_ADMIN, Permission.USERS_UPDATE_SINGLE]),
    ).toThrow();
  });

  it("rejects AUTHENTICATED_USER combined with USERS_UPDATE_SINGLE (existing invariant)", () => {
    // Regression guard: the existing sentinel must still be enforced.
    expect(() =>
      rbacHandler([Permission.AUTHENTICATED_USER, Permission.USERS_UPDATE_SINGLE]),
    ).toThrow();
  });

  it("accepts a non-sentinel permission alone", () => {
    const handler = rbacHandler([Permission.USERS_UPDATE_SINGLE]);
    expect(typeof handler).toBe("function");
  });
});
```

**Why:** Covers acceptance criterion (f). The sanity check is the guardrail that prevents a future developer from accidentally writing `rbacHandler([Permission.AUTHENTICATED_ADMIN, Permission.USERS_UPDATE_SINGLE])`, which would silently degrade the admin-only gate into an OR with a CRUD perm.

> **Note:** The exact throw point (build-time vs first-request) depends on the `rbac.middleware.ts` implementation (verified at lines 76-85 — the sanity check runs inside `build()`, which is called by `rbacHandler(...)` at module-eval time). If the throw happens at first-request instead, adjust the test to invoke the handler with a mock `req`/`res`/`next`. The acceptance criterion is: the combination is rejected, not when.

---

### 13.3 BE — extend the existing change-password test

**File:** `primebrick-be-v3/src/modules/auth/__tests__/user-service-change-password.test.ts`

The existing test covers `UserService.changePassword` at the service level (mocks Casdoor). It does **not** cover the route permission. Two options:

- **Option A (preferred):** Add a new test file `primebrick-be-v3/src/modules/auth/__tests__/user-profiles-router-permission.test.ts` that mounts the router with a mocked `UserService` and asserts: (1) a non-admin request gets 403, (2) an admin request reaches the handler. This tests the full middleware → route → handler chain.
- **Option B:** Extend the existing service test with a comment noting that route-permission coverage lives in the new file.

**Recommendation:** Option A. The service test stays focused on service logic; the new file tests the permission gate. This matches the existing separation of concerns in the `__tests__/` directory.

**Sketch for Option A:**
```ts
// primebrick-be-v3/src/modules/auth/__tests__/user-profiles-router-permission.test.ts
import { describe, it, expect, vi } from "vitest";
// ... mocks for UserService, CasdoorService, loadAuthConfigFromDb ...

describe("POST /api/v1/entities/user_profiles/:uuid/change-password — permission gate", () => {
  it("returns 403 for a non-admin user (even if they hold USERS_UPDATE_SINGLE)", async () => {
    // Build a request with req.user.isAdmin = false, permissions = Set(["users.update.single"])
    // Assert response status 403
  });

  it("returns 200 for an admin user (isAdmin = true)", async () => {
    // Build a request with req.user.isAdmin = true
    // Assert the handler is reached and returns success
  });
});
```

**Why:** This is the end-to-end proof that the route permission switch (§4.2.3) actually takes effect. Covers acceptance criteria (a, b).

---

### 13.4 Test execution

| Repo | Command | New test files |
| ---- | ------- | -------------- |
| SDK | `pnpm test` | `src/auth/__tests__/permissions.test.ts`, `src/auth/__tests__/rbac.test.ts` |
| BE | `pnpm test` | `src/modules/auth/__tests__/rbac-middleware.test.ts`, `src/modules/auth/__tests__/user-profiles-router-permission.test.ts` |

Both repos use `vitest` (verified — existing tests import from `vitest`). The new test files follow the existing `__tests__/` directory convention.
