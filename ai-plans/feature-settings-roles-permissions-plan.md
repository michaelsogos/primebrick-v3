# Feature Plan: Settings — Roles & Permissions Management Page

**Status:** Draft — awaiting approval
**Scope:** SDK + BE + FE
**Out of scope:** Casdoor role sync UI, role-to-user assignment matrix, audit trail UI for role changes

---

## 1. Objective & Scope

### Objective

Add a new **Roles** settings page (alongside Organizations and Users) that lists all
role mappings from the `role_mappings` table, and a create/update form with **two tabs**:

1. **Details tab** — classic form: `idp_role` (code), `label_key`, `is_admin` toggle.
2. **Permissions tab** — a table grouped per module showing every available permission
   with add/remove controls, so the operator can compose the `permissions[]` array
   visually instead of typing dotted strings.

### Two design questions answered (empirically verified)

#### Q1 — Where do we get the list of all permissions of all modules?

**Source of truth:** the `Permission` enum in
`primebrick-v3-sdk/src/auth/permissions.ts` (lines 26-86). It is the single registry
already cited in `primebrick-be-v3/AGENTS.md` ("Source of truth: `Permission` enum").

**Current state (verified):** there is **NO** BE endpoint that exposes this catalog to
the FE. The FE does NOT import `@primebrick/sdk` (see `primebrick-fe-v3/src/lib/api-ext.ts`
lines 10-12: "FE standalone implementation — it does NOT depend on @primebrick/sdk").
So the FE cannot read the enum directly.

**Solution:** add a new BE endpoint `GET /api/v1/system/permissions` that:
- Iterates `Object.values(Permission)`.
- Filters out sentinels with `isPermissionSentinel(p)` (PUBLIC / AUTHENTICATED_USER,
  and the planned AUTHENTICATED_ADMIN).
- Groups the remaining permissions by **module** = the substring before the first `.`
  (e.g. `customers.read.all` → module `customers`; `emailsender.providers.create`
  → module `emailsender`; `modules.read.all` → module `modules`).
- Returns a stable, sorted payload so the FE can render the grouped table without
  any SDK dependency.

This is consistent with the existing FE pattern: all metadata (entity meta, password
policy, active roles) is fetched from the BE, never imported from the SDK.

#### Q2 — Tabs visibility metadata toggle (hide vs. show-all anchor mode)

**Current state (verified):**
- The FE tab component is `primebrick-fe-v3/src/lib/components/ui/tabs/` built on
  `bits-ui`. Its default behavior is **hide non-selected content** (standard).
- There is **NO** existing "UI preferences" / "user preferences" store in the FE.
  The closest analogues are `uiLang` (sessionStorage, `lib/i18n/store.svelte.ts`)
  and per-entity view-mode persistence (`useViewMode.svelte.ts`, localStorage).
- The modules config page (`routes/(app)/system/settings/modules/[code]/+page.svelte`
  lines 132-140) already uses `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` — this is
  the reference pattern to extend.

**Solution:** introduce a FE-only UI preference (NOT a server setting — it is a
personal view behavior, like theme/lang):

- New composable `primebrick-fe-v3/src/lib/composables/useTabsMode.svelte.ts`:
  - Persists to `localStorage` under key `pb.tabs.mode`.
  - Values: `'hide'` (standard bits-ui, hide non-selected) | `'show-all'` (anchor
    mode, all content visible, triggers act as in-page `href="#..."` links).
  - **Default = `'show-all'`** (per the user's request: "this will our default").
  - Follows the composable state-exposure pattern from `AGENTS.md`
    (`_state` + `get state(): DeepReadonly<...>` + mutator function).

- New wrapper component `primebrick-fe-v3/src/lib/components/ui/anchor-tabs/`:
  - `AnchorTabs.svelte` — wraps the existing `Tabs` primitive but accepts a `mode`
    prop (`'hide' | 'show-all'`) and a `showToggle` boolean.
  - In `'hide'` mode: renders standard `Tabs` + `TabsContent` (delegates to bits-ui,
    unchanged behavior).
  - In `'show-all'` mode:
    - Renders ALL `TabsContent` blocks stacked (each with an `id="tab-<value>"`).
    - Renders `TabsTrigger`s as `<a href="#tab-<value>">` anchor links.
    - Active state is driven by an `IntersectionObserver` on each section, so
      scrolling updates the highlighted trigger, and clicking a trigger smooth-
      scrolls to the section.
  - The visibility-mode **switch button** is rendered on the right of the
    `TabsList` when `showToggle` is true. It reads/writes `useTabsMode` so the
    choice is remembered across pages and sessions.

This keeps the existing `ui/tabs/*` components untouched (no scope creep on the
shared primitive) and isolates the new behavior in a dedicated wrapper.

### In scope

**SDK**
- (Optional, recommended) Add a helper `listNonSentinelPermissions(): string[]` in
  `permissions.ts` that returns `Object.values(Permission).filter(p => !isPermissionSentinel(p))`,
  so the BE endpoint does not duplicate the sentinel-filtering logic.

**BE**
- New endpoint `GET /api/v1/system/permissions` → returns the permission catalog
  grouped by module. RBAC: `Permission.AUTHENTICATED_USER` (any authenticated user
  can read the catalog; writes are still gated by the role CRUD permission below).
- New permission constants in the SDK `Permission` enum:
  - `ROLE_MAPPINGS_READ_ALL: "role_mappings.read.all"`
  - `ROLE_MAPPINGS_READ_SINGLE: "role_mappings.read.single"`
  - `ROLE_MAPPINGS_CREATE: "role_mappings.create"`
  - `ROLE_MAPPINGS_UPDATE: "role_mappings.update"`
  - `ROLE_MAPPINGS_DELETE: "role_mappings.delete"`
- **Casdoor role sync (CRITICAL — roles must exist in Casdoor to be emitted in
  JWTs; a role created only in `role_mappings` is dead).** This mirrors the
  existing `UserService` / `OrganizationsService` pattern:
  - Extend `CasdoorApiClient` with a `CasdoorRole` interface and four methods:
    `getRole(name)`, `addRole(role)`, `updateRole(role)`, `deleteRole(name)`.
    These call Casdoor's REST role endpoints, mirroring the existing
    `getUser`/`addUser`/`updateUser`/`deleteUser` and
    `getOrganization`/`addOrganization`/`updateOrganization`/`deleteOrganization`
    methods. **The implementer MUST verify the exact Casdoor REST endpoints
    (`/api/get-role`, `/api/add-role`, `/api/update-role`, `/api/delete-role`)
    against the configured Casdoor version** — do not guess URLs (per
    `.windsurfrules` external-dependency verification protocol).
  - New `RoleService` (`modules/auth/services/role.service.ts`) that coordinates
    Casdoor sync + local `role_mappings` DB writes, exactly like
    `UserService`/`OrganizationsService` coordinate Casdoor + local DB. The
    service is request-context-free (no `req`/`res`); it takes a `Pool` and a
    `CasdoorService` in its constructor.
  - **Sync policy (confirmed with user):**
    - **Create**: Casdoor `addRole` FIRST (non-best-effort). If it fails →
      return an error, do NOT write to `role_mappings`. On success → upsert
      `role_mappings` with `last_synced_at = now()`.
    - **Update**: Casdoor `updateRole` FIRST (non-best-effort). If it fails →
      return an error, do NOT update `role_mappings`. On success → update
      `role_mappings` (only `label_key`, `is_admin`, `permissions[]` are
      editable; `idp_role` is read-only) with `last_synced_at = now()`.
    - **Delete**: Casdoor `deleteRole` FIRST (non-best-effort). If it fails →
      return an error, do NOT delete locally. On success →
      `role_mappings` hard delete.
    - **`permissions[]` is NOT synced to Casdoor** — it is Primebrick-local
      only. Casdoor only knows the role name (and optionally displayName). This
      matches the user's statement: "Only permissions aren't synced with
      Casdoor."
  - **`idp_role` is read-only on update** (confirmed with user). Casdoor role
    names are immutable identifiers referenced by user assignments; renaming
    would require delete+recreate in Casdoor and reassigning all users — out of
    scope. The update endpoint rejects requests that change `idp_role`.
- New router `primebrick-be-v3/src/modules/auth/routers/role-mappings.router.ts`
  exposing CRUD on `role_mappings`. The router calls `RoleService`, NOT
  `RoleMappingRepo` directly (the service owns the Casdoor+DB coordination):
  - `GET    /api/v1/system/role-mappings`           → list (array with id, version, …)
  - `GET    /api/v1/system/role-mappings/:idp_role` → single
  - `POST   /api/v1/system/role-mappings`           → create (Casdoor addRole + local upsert)
  - `PUT    /api/v1/system/role-mappings/:idp_role` → update (Casdoor updateRole + local update; idp_role read-only)
  - `DELETE /api/v1/system/role-mappings/:idp_role` → delete (Casdoor deleteRole + local hard delete)
- Extend `RoleMappingRepo` with:
  - `listAllDetailed()` → returns array including `id`, `version`, audit fields
    (the existing `loadAllMappings()` returns a Map without id/version, which is
    fine for auth expansion but insufficient for a CRUD UI with optimistic locking).
  - `findByIdpRole(idpRole)` → single row with id/version.
  - **Add `last_synced_at` and `idp_org` columns** to `RoleMappingEntity`
    (and a DB patch via `pnpm run db:meta:compare` then `pnpm run db:migrate`).
    `last_synced_at` records when Casdoor was last successfully synced (mirrors
    `user_profiles.last_synced_at`). `idp_org` stores the Casdoor
    organization/owner the role belongs to (selected from the org combobox in
    the FE form, same field as `user_profiles.idp_org`). The unique constraint
    stays on `idp_role` alone (the RBAC lookup is by role name, not by
    `(org, name)` — see Risks section).
- Mount the new router in `primebrick-be-v3/src/modules/auth/router.ts`.
- No seed row needed for the new `ROLE_MAPPINGS_*` permissions: the
  `administrators` role has `is_admin=true` and bypasses RBAC. Document this in
  the commit message. (If a non-admin role should manage role mappings, seed the
  permission into that role's `permissions[]` via a SQL patch — out of scope for v1.)

**FE**
- New settings nav entry in `primebrick-be-v3/src/modules/module-nav-meta.ts`:
  `{ id: "roles", label_key: "shell.settings.tabs.roles", href: "/system/settings/roles", icon: "shield" }`
  (placed between `users` and `security`).
- New i18n keys in all 6 locale files (`de-DE`, `en-GB`, `es-ES`, `fr-FR`, `it-IT`,
  `pt-PT`) under `shell.settings.tabs.roles` and a new `shell.settings.roles.*`
  namespace for the list/create/update/permissions-tab labels.
- New routes:
  - `routes/(app)/system/settings/roles/+page.svelte` — list page (mirrors
    `organizations/+page.svelte` structure: EntityListTable-style or simple table
    with columns idp_role, label_key, is_admin, permissions count, audit).
  - `routes/(app)/system/settings/roles/create/+page.svelte` — create form with
    two tabs (Details + Permissions).
  - `routes/(app)/system/settings/roles/[idp_role]/+page.svelte` — update form
    with two tabs (Details + Permissions). Uses `idp_role` as the URL key (it is
    `@Unique()` in the entity; URL-encode it since role names are snake_case).
- New composable `useTabsMode.svelte.ts` (FE-only UI preference, localStorage).
- New component `lib/components/ui/anchor-tabs/AnchorTabs.svelte` (+ sub-components
  `AnchorTabsList.svelte`, `AnchorTabsTrigger.svelte`, `AnchorTabsContent.svelte`,
  `AnchorTabsModeSwitch.svelte`).
- New composable `usePermissionsCatalog.svelte.ts` — fetches
  `/api/v1/system/permissions` and exposes the grouped catalog
  (`{ modules: Array<{ code: string; label_key: string; permissions: Array<{ code: string; label_key: string }> }> }`).
- New composable `useRoleMappings.svelte.ts` (or extend `useActiveRoles`) — CRUD
  client for `/api/v1/system/role-mappings`.
- The Permissions tab renders a table per module with a checkbox/add-remove control
  per permission; the selected set is bound to the form's `permissions` field.

### Explicitly out of scope

- Role-to-user assignment matrix (users still get roles from the IDP JWT; the FE
  user form already lets you pick from `useActiveRoles` which reads
  `/api/v1/system/roles/active`).
- Role rename (changing `idp_role` on an existing role). Casdoor role names are
  immutable identifiers; renaming would require delete+recreate in Casdoor and
  reassigning all users. The update endpoint makes `idp_role` read-only.
- Audit trail UI for role changes (audit fields are stored on the entity but no
  dedicated timeline panel in this iteration).
- Bulk permission import/export.
- Wildcard permission editor (e.g. typing `customers.*`); the UI only toggles
  individual permissions from the catalog. Wildcards remain supported by the RBAC
  engine but are not authored via this UI in v1.

---

## 2. Empirical Evidence Summary

All facts below are verified. Do **not** re-verify during implementation.

### SDK — `primebrick-v3-sdk/src/auth/`

- `permissions.ts` lines 26-86: `Permission` enum object. Sentinels `PUBLIC` and
  `AUTHENTICATED_USER` (lines 29-31). Module groups: `modules.*`, `profile.*`,
  `userprofile.*`, `users.*`, `organizations.*`, `customers.*`, `emailsender.*`.
- `permissions.ts` lines 94-96: `isPermissionSentinel(p)` returns true for
  `PUBLIC` and `AUTHENTICATED_USER`.
- `permissions.ts` lines 156-177: `expandPermissions(roles, getRoleMappingFn)`
  reads `role_mappings` via a port; sets `isAdmin=true` if any role has
  `is_admin=true`.
- `index.ts` line 21: exports `Permission`, `isPermissionSentinel`, etc.
- `src/index.ts` line 74: `export * from "./auth/index.js"` — so the BE already
  imports `Permission` from `@primebrick/sdk`.

### BE — `primebrick-be-v3/src/`

- `modules/auth/role_mapping_entity.ts` lines 15-48: `RoleMappingEntity` with
  `id` (bigint Key), `idp_role` (Unique, string 255), `label_key` (string 255,
  nullable), `permissions` (jsonb string[]), `is_admin` (boolean), audit fields
  (`created_at/by`, `updated_at/by`, `version`).
- `modules/auth/role-mapping-repo.ts` lines 18-83: `RoleMappingRepo` with
  `loadAllMappings()` (returns `Map<idp_role, {permissions, is_admin, label_key}>`
  — NO id/version), `upsertMapping(idpRole, permissions, isAdmin, labelKey?)`,
  `deleteMapping(idpRole)`. **Missing:** `listAllDetailed()`, `findByIdpRole()`.
- `modules/system/system-router.ts` lines 42-59: existing
  `GET /api/v1/system/roles/active` returns roles for form dropdowns (used by FE
  `useActiveRoles`). This stays as-is (read-only, for user-form dropdowns).
- `modules/system/system-router.ts`: NO `/permissions` endpoint exists.
- `modules/auth/router.ts` lines 27-48: `authRouter()` aggregator mounts
  `authSessionRouter`, `authWebauthnRouter`, `authInvitationRouter`,
  `authCheckRouter`, `usersRouter`, `userProfilesRouter`. **No role-mappings
  router yet.**
- `modules/index.ts` lines 24-29: `mountModules(app)` mounts `systemRouter()`
  then `authRouter()`.
- `modules/module-nav-meta.ts` lines 32-40: settings nav entries (profile,
  organizations, users, security, modules, templates, email-providers). **No
  roles entry.**
- `AGENTS.md` "RBAC Permission System" section confirms: source of truth is the
  `Permission` enum; role mappings live in `role_mappings`; admin bypass via
  `is_admin=true`.
- `modules/auth/casdoor-api-client.ts`: `CasdoorApiClient` has methods for
  **users** (`getUser` line 69, `updateUser` line 105, `addUser` line 197,
  `deleteUser` line 233), **organizations** (`getOrganization` line 272,
  `updateOrganization` line 303, `addOrganization` line 346, `deleteOrganization`
  line 380), and **applications** (`getApplication` line 449, `updateApplication`
  line 477, `addApplication` line 504). **There are NO role methods** — no
  `getRole`/`addRole`/`updateRole`/`deleteRole`, and no `CasdoorRole` interface.
  The only role reference is `CasdoorUser.roles?: Array<{ name, displayName? }>`
  (line 23) — roles are a *field* on a user, not a managed entity. This is the
  gap the plan fills.
- `modules/auth/services/casdoor.service.ts` lines 29-77: `CasdoorService` is the
  lazy singleton wrapper that returns a `CasdoorApiClient | null` (null when
  builtin credentials are not configured). `RoleService` will take a
  `CasdoorService` in its constructor, same as `UserService` and
  `OrganizationsService`.
- `modules/auth/services/user.service.ts`: `UserService` coordinates Casdoor +
  local DB. `createUser` (line 45): Casdoor `addUser` first (non-best-effort,
  throws "Casdoor user creation did not return a UUID" on failure), then local
  DB insert with `last_synced_at`. `updateUser` (line 168): Casdoor
  `updateUser` first (non-best-effort, throws "Casdoor sync failed" on failure),
  then local update with `last_synced_at`. `deleteUser` (line 239): Casdoor
  disable is **best-effort** (logs "Casdoor disable failed (non-critical)").
  `changePassword` (line 381): Casdoor password change is non-best-effort.
  **This is the exact pattern `RoleService` must follow** — except the user
  chose non-best-effort on delete too (hard delete in Casdoor, block local on
  failure).
- `modules/auth/services/organizations.service.ts`: `OrganizationsService`
  follows the same pattern — `createOrganization` (line 88) does Casdoor
  `updateOrganization` or `addOrganization` first (non-best-effort),
  `updateOrganization` (line 189) and `deleteOrganization` (line 246) likewise.
  Confirms the convention.
- `modules/auth/role-mapping-repo.ts`: `RoleMappingRepo` has `upsertMapping` and
  `deleteMapping` but **no router calls them today** — they exist for the SDK
  port pattern and seed scripts. There is **no `RoleService` and no role CRUD
  router** currently. The `role_mappings` table is managed only via DB
  seed/SQL today.
- `scripts/setup-casdoor.ts` lines 200-214: the Casdoor setup script creates
  roles via `/add-role?id=${ORG_NAME}/${ROLE_ADMINISTRATORS}` with body
  `{ owner: ORG_NAME, name: ROLE_ADMINISTRATORS, displayName: "...",
  isEnabled: true }`. This confirms: (a) Casdoor roles ARE org-scoped
  (`owner` = org name, URL id = `<org>/<name>`), and (b) the REST endpoint is
  `/add-role` (the implementer must verify `/get-role`, `/update-role`,
  `/delete-role` against the configured Casdoor version).
- `db-meta/patches/00000000000000_init_database.sql` lines 223-237: the
  `role_mappings` table has NO `idp_org` column — only `id, idp_role, label_key,
  permissions, is_admin, ...`. Unique index `role_mappings_idp_role_uq` on
  `idp_role` alone. Lines 387-434: seed roles (administrators, sales,
  customer_service, hr, ops) have no org. **The `idp_org` column must be added
  (nullable, for backward compat with existing seeds).**
- `sdk-auth-ports.ts` line 105: `getRoleMapping(role: string)` looks up by role
  name alone in a cache built from `loadAllMappings()`. The JWT `roles_path`
  provides role names as plain strings. **This is why the unique constraint
  stays on `idp_role` alone** — the RBAC lookup is name-based, not
  `(org, name)`-based.
- `routes/(app)/system/settings/users/create/+page.svelte` lines 57-104,
  464-480: the user create form has an **org combobox** (`idp_org` field) that
  fetches `/api/v1/system/organizations/active` and renders a combo-select
  with org avatar + display_name + idp_name. The selected `idp_org` is sent in
  the POST body and becomes the Casdoor `owner` (user.service.ts line 56:
  `idp_org || cfg.casdoor_organization!`, line 64: `owner: idpOrg`). **The
  role create form must follow the exact same pattern.**

### FE — `primebrick-fe-v3/src/`

- `lib/api-ext.ts` lines 10-12: FE does NOT import `@primebrick/sdk`. All
  metadata comes via API.
- `lib/composables/useActiveRoles.svelte.ts` lines 25-52: `useActiveRoles()`
  fetches `/api/v1/system/roles/active`, exposes `state.roles` and `roleNames`.
  Pattern to follow for `usePermissionsCatalog` and `useRoleMappings`.
- `lib/components/ui/tabs/` (tabs.svelte, tabs-list.svelte, tabs-content.svelte,
  tabs-trigger.svelte, index.ts): built on `bits-ui`. Default behavior hides
  non-selected content. `Tabs` root takes `value` (bindable) and standard
  `TabsPrimitive.RootProps`.
- `routes/(app)/system/settings/modules/[code]/+page.svelte` lines 132-140:
  reference usage of `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`.
- `routes/(app)/system/settings/organizations/+page.svelte`: list page template
  (EntityListTable, meta-driven columns, pagination, filters, sync channel).
- `routes/(app)/system/settings/organizations/create/+page.svelte`: create form
  template (superForm + zod4, `apiFetch` POST, `useSyncChannel` to notify
  parent, `useUnsavedChangesGuard`, `FormPageLayout`).
- `routes/(app)/system/settings/organizations/[uuid]/+page.svelte`: update form
  template (loads entity + meta, `useEntityMetadata`, audit data).
- `lib/i18n/store.svelte.ts`: `uiLang` writable persisted to `sessionStorage`
  under `pb.lang`. Reference pattern for `useTabsMode` (but use `localStorage`
  since the tabs-mode preference should survive session restart).
- `lib/i18n/messages/en-GB.json` lines 266-277: `shell.settings.tabs.*` keys
  (profile, organizations, users, security, modules, templates, emailProviders).
  **No `roles` key.** Lines 316-343: `shell.settings.organizations.create/update`
  namespace — reference structure for `shell.settings.roles.*`.
- `routes/(app)/system/settings/+page.svelte`: redirects to `/system/settings/profile`.

### How role identity flows (empirically confirmed)

- `role_mappings.idp_role` is the exact role name emitted by the IDP (Casdoor) in
  the JWT (case-sensitive). It is the natural primary key for URL segments and
  the RBAC lookup key.
- **A role must exist in Casdoor to be useful**: Casdoor only emits roles in the
  JWT that exist in Casdoor and are assigned to the user there. A
  `role_mappings` row whose `idp_role` does not exist in Casdoor is dead — no
  user will ever match it. This is why role CRUD must sync to Casdoor.
- **Casdoor roles are org-scoped**: the Casdoor role identity is
  `(owner, name)` = `(idp_org, idp_role)`. The `owner` is selected from an org
  combobox in the FE form (same pattern as user create). `role_mappings.idp_org`
  stores this owner for Casdoor sync. The RBAC lookup, however, is by
  `idp_role` alone (the JWT provides role names as strings) — so `idp_role`
  remains globally unique.
- `role_mappings.is_admin=true` → RBAC bypass (super-user). The UI must show this
  as a toggle with a clear warning that enabling it makes the `permissions[]`
  array irrelevant at runtime.
- The `administrators` role is seeded with `is_admin=true` (per AGENTS.md), so it
  bypasses the new `ROLE_MAPPINGS_*` permissions too — no seed row needed for the
  new permission constants to be usable by admins.

---

## 3. Architecture

### Data flow

```
┌──────────────────────────────────────────────────────────────────────┐
│ SDK (primebrick-v3-sdk/src/auth/permissions.ts)                       │
│  Permission enum = single source of truth for the permission catalog  │
│  + listNonSentinelPermissions() helper (NEW, optional)                │
│  + 5 new ROLE_MAPPINGS_* constants (NEW)                              │
└──────────────────────────────────────────────────────────────────────┘
                                   │
            ┌──────────────────────┴──────────────────────┐
            ▼                                             ▼
┌────────────────────────────────────────────┐   ┌─────────────────────────────────┐
│ BE system-router.ts (NEW endpoint) │   │ BE role-mappings.router.ts (NEW)│
│  GET /api/v1/system/permissions    │   │  GET    /role-mappings          │
│   → { modules: [{ code, perms }] } │   │  GET    /role-mappings/:idp_role│
│   RBAC: AUTHENTICATED_USER         │   │  POST   /role-mappings          │
│                                    │   │  PUT    /role-mappings/:idp_role│
│                                    │   │  DELETE /role-mappings/:idp_role│
│                                    │   │   RBAC: ROLE_MAPPINGS_*         │
└────────────────────────────────────┘   └─────────────────────────────────┘
            │                                             │
            ▼                                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ FE                                                                    │
│  usePermissionsCatalog  ← /api/v1/system/permissions                  │
│  useRoleMappings        ← /api/v1/system/role-mappings                │
│  useTabsMode            ← localStorage('pb.tabs.mode') = 'show-all'   │
│                                                                       │
│  routes/(app)/system/settings/roles/                                  │
│    +page.svelte              (list)                                   │
│    create/+page.svelte       (Details tab + Permissions tab)          │
│    [idp_role]/+page.svelte   (Details tab + Permissions tab)          │
│                                                                       │
│  AnchorTabs.svelte  (mode='hide' | 'show-all', with mode switch)      │
└──────────────────────────────────────────────────────────────────────┘
```

### Role CRUD sync flow (BE — NEW)

```
FE (org combobox) ──POST──▶ role-mappings.router.ts
   idp_org = selected org        │
   idp_role = role name          ▼
                            RoleService (NEW)
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
        CasdoorApiClient (NEW)        RoleMappingRepo (extended)
        getRole(name, owner)          listAllDetailed / findByIdpRole /
        addRole({owner, name, ...})   upsertMapping / deleteMapping
        updateRole({owner, name, ...})
        deleteRole(name, owner)
                   │                           │
                   ▼                           ▼
             Casdoor REST              role_mappings table
        id=<owner>/<name>            (idp_role, idp_org, label_key,
                                      is_admin, permissions[],
                                      last_synced_at)
```

**`owner` = `idp_org`** (selected from the org combobox in the FE form, same
pattern as the user create form). For existing seed rows without `idp_org`,
`RoleService` falls back to `cfg.casdoor_organization`.

**Sync order (non-best-effort on ALL operations — confirmed with user):**
- **Create**: Casdoor `addRole({owner: idp_org, name: idp_role, ...})` → on
  success, local `upsertMapping` with `idp_org` and `last_synced_at = now()`.
  On Casdoor failure → error response, NO local write.
- **Update**: Casdoor `updateRole({owner: existing.idp_org, name: idpRole, ...})`
  (only `displayName` from `label_key`; `idp_role`/`idp_org` immutable) → on
  success, local update of `label_key`/`is_admin`/`permissions[]` with
  `last_synced_at = now()`. On Casdoor failure → error response, NO local write.
- **Delete**: Casdoor `deleteRole(idpRole, existing.idp_org)` → on success,
  local `deleteMapping`. On Casdoor failure → error response, NO local delete.
- **`permissions[]` is NEVER sent to Casdoor** — it is Primebrick-local. The
  Casdoor role object only carries `owner` (= `idp_org`), `name` (= `idp_role`),
  and `displayName` (resolved from `label_key`, or the raw key). This matches
  the user's statement: "Only permissions aren't synced with Casdoor."
- **`idp_org` is immutable on update** — the Casdoor role identity
  `(owner, name)` is fixed at creation. The PUT endpoint rejects a body
  containing `idp_org` or `idp_role`.
- **Casdoor not configured** (`CasdoorService.getClient()` returns `null`):
  the service returns a clear error ("Casdoor is not configured; cannot manage
  roles via API"). Role CRUD is NOT available in dev setups without IDP —
  same behavior as user/org creation today.

### Permissions tab UX

- The catalog is rendered as **one table per module**, each table titled with the
  module code (translated via `shell.settings.roles.permissions.module.<code>`).
- Each row = one permission: a checkbox (add/remove) + the permission code
  (mono) + a translated description.
- Checking a row adds the permission string to the form's `permissions` array;
  unchecking removes it.
- The `is_admin` toggle on the Details tab, when ON, disables the Permissions
  tab with a notice ("Admin roles bypass all permission checks — the permissions
  list is ignored at runtime") but keeps the array in the form payload untouched.

### AnchorTabs mode switch UX

- A `Switch` component (existing `lib/components/ui/switch/`) sits at the right
  of the `TabsList`.
- ON  = `'show-all'` (default): all tab contents stacked, triggers are anchor
  links, smooth-scroll on click, active trigger follows scroll via
  IntersectionObserver.
- OFF = `'hide'`: standard bits-ui behavior (only the selected tab's content is
  visible).
- The switch has `aria-label` = `$t('shell.settings.roles.tabs.modeToggle')`
  and a tooltip explaining the two modes.
- The preference is global (shared across all pages that use `AnchorTabs`),
  persisted in `localStorage` under `pb.tabs.mode`.

---

## 4. Detailed Action Plan

### Phase 1 — SDK

1. **`primebrick-v3-sdk/src/auth/permissions.ts`**
   - Add to the `Permission` object (after the `EMAILSENDER_*` block):
     ```ts
     // --- Role mappings module (admin) ---
     ROLE_MAPPINGS_READ_ALL: "role_mappings.read.all",
     ROLE_MAPPINGS_READ_SINGLE: "role_mappings.read.single",
     ROLE_MAPPINGS_CREATE: "role_mappings.create",
     ROLE_MAPPINGS_UPDATE: "role_mappings.update",
     ROLE_MAPPINGS_DELETE: "role_mappings.delete",
     ```
   - Add helper:
     ```ts
     /**
      * Returns all non-sentinel permission strings (i.e. the real RBAC
      * permissions, excluding PUBLIC / AUTHENTICATED_USER / AUTHENTICATED_ADMIN).
      * Used by the BE to build the permissions catalog for the FE.
      */
     export function listNonSentinelPermissions(): string[] {
       return Object.values(Permission).filter(
         (p) => !isPermissionSentinel(p)
       );
     }
     ```
   - Export `listNonSentinelPermissions` from `auth/index.ts` and (transitively)
     from `src/index.ts` (already re-exports `* from "./auth/index.js"`).

2. Build the SDK (`pnpm run build`) so the BE can consume the new exports.

### Phase 2 — BE

3. **`primebrick-be-v3/src/modules/auth/role_mapping_entity.ts`**
   - Add a `last_synced_at` column (nullable `Date`), mirroring
     `user_profiles.last_synced_at` and `organizations.last_synced_at`:
     ```ts
     @Column({ nullable: true })
     last_synced_at?: Date;
     ```
   - Add an `idp_org` column (nullable `string`, length 255) to store the
     Casdoor organization/owner the role belongs to — same field as
     `user_profiles.idp_org` and `organizations.idp_code`. This is the value
     selected in the role create form's org combobox and passed as `owner` to
     Casdoor `addRole`/`updateRole`/`deleteRole`:
     ```ts
     @Column({ length: 255, nullable: true })
     idp_org?: string;
     ```
     Nullable for backward compat with existing seed rows (which have no org);
     `RoleService` falls back to `cfg.casdoor_organization` when `idp_org` is
     null. New roles created via the UI MUST have `idp_org` (form validation).
   - **Keep the existing `@Unique()` on `idp_role` alone** (do NOT change to a
     composite `(idp_org, idp_role)` unique). Rationale: the RBAC lookup
     (`sdk-auth-ports.ts` `getRoleMapping(role)` line 105, and SDK
     `expandPermissions`) looks up by role name alone because the JWT
     `roles_path` provides role names as plain strings. Making
     `(idp_org, idp_role)` the unique key would require changing the JWT role
     format and the entire RBAC lookup flow — out of scope for this feature.
     `idp_org` is stored for Casdoor sync purposes only; the RBAC expansion
     path is unchanged.
   - Run `pnpm run db:meta:compare` to refresh snapshots and generate the patch
     file under `db-meta/patches/`, then `pnpm run db:migrate` to apply it.
     Follow `.devin/rules/patch-sha256-management.md` if any sha256 mismatch arises.

4. **`primebrick-be-v3/src/modules/auth/role-mapping-repo.ts`**
   - Add `listAllDetailed()`:
     ```ts
     async listAllDetailed(): Promise<Array<{
       id: bigint; idp_role: string; idp_org?: string; label_key?: string;
       permissions: string[]; is_admin: boolean; last_synced_at?: Date;
       version: number; created_at: Date; created_by: string;
       updated_at: Date; updated_by: string;
     }>> { /* findAll with full projection, sorted by idp_role */ }
     ```
   - Add `findByIdpRole(idpRole)`:
     ```ts
     async findByIdpRole(idpRole: string): Promise<{ id, idp_role, idp_org,
       label_key, permissions, is_admin, last_synced_at, version, created_at,
       created_by, updated_at, updated_by } | null> { /* Filter by idp_role */ }
     ```
   - Keep `upsertMapping` and `deleteMapping` as-is (they already exist); the
     service will set `last_synced_at` and `idp_org` via the upsert body.

5. **`primebrick-be-v3/src/modules/auth/casdoor-api-client.ts`**
   - Add a `CasdoorRole` interface (camelCase fields are dictated by Casdoor's
     REST API — external adapter boundary exception, per BE data-model rule):
     ```ts
     export interface CasdoorRole {
       owner: string;          // = idp_org (the Casdoor organization name)
       name: string;           // = idp_role
       displayName?: string;   // = resolved label (or label_key)
       description?: string;
       isEnabled?: boolean;
       createdTime?: string;
       [key: string]: unknown;
     }
     ```
   - Add four methods mirroring `getUser`/`addUser`/`updateUser`/`deleteUser`.
     Each takes an explicit `owner` parameter (= `idp_org` from the form, NOT
     `this.orgName` as a hardcoded fallback) — same pattern as `getUser` which
     takes `owner?` and falls back to `this.orgName` only when not provided:
     - `getRole(name: string, owner?: string): Promise<CasdoorRole | null>` —
       `GET /api/get-role?id=<owner>/<name>` (verify exact endpoint against the
       configured Casdoor version before implementing). `owner` defaults to
       `this.orgName` when not provided (for backward compat with seed roles
       that have no `idp_org`).
     - `addRole(role: Partial<CasdoorRole> & { name: string; owner: string }): Promise<CasdoorRole | null>` —
       `POST /api/add-role?id=<owner>/<name>` with the role object in the body.
     - `updateRole(role: Partial<CasdoorRole> & { name: string; owner: string }): Promise<boolean>` —
       `POST /api/update-role?id=<owner>/<name>` with the role object in the body.
     - `deleteRole(name: string, owner: string): Promise<boolean>` —
       `POST /api/delete-role?id=<owner>/<name>`.
   - Use the existing `buildUrl()` helper and the same fetch + JSON parse pattern
     as the user/org methods. Add unit tests in
     `__tests__/casdoor-api-client.test.ts` mirroring the existing user/org tests
     (mock `fetch`, assert URL + body, parse response).

6. **`primebrick-be-v3/src/modules/auth/services/role.service.ts` (NEW)**
   - `RoleService` class, constructor `(pool: Pool, casdoor: CasdoorService)`.
     Request-context-free (no `req`/`res`) — same pattern as `UserService` /
     `OrganizationsService`.
   - Methods:
     - `listRoles()` → `repo.listAllDetailed()` → returns array (snake_case).
     - `getRole(idpRole)` → `repo.findByIdpRole(idpRole)` → 404 if missing.
     - `createRole({ idp_role, idp_org, label_key?, is_admin, permissions })`:
       1. `const cd = await casdoor.getClient();` — if `null`, throw an
          ApiError ("Casdoor is not configured; cannot create role").
       2. **`idp_org` is required** for create (form validation enforces this).
          Resolve the Casdoor owner: `const owner = idp_org;`
       3. Check `cd.getRole(idp_role, owner)` — if it already exists in Casdoor,
          throw a 409 conflict error (do NOT silently overwrite).
       4. `const created = await cd.addRole({ owner, name: idp_role,
          displayName: label_key, isEnabled: true });` — if `null`/falsy,
          throw ApiError ("Casdoor role creation did not return a role",
          non-best-effort).
       5. `await repo.upsertMapping(idp_role, permissions, is_admin, label_key)`
          with `idp_org` and `last_synced_at = new Date()`.
       6. Return the created `role_mappings` row (via `findByIdpRole`).
     - `updateRole(idpRole, { label_key?, is_admin?, permissions? })`:
       1. `const cd = await casdoor.getClient();` — if `null`, throw ApiError.
       2. Load the existing row to get `idp_org` (the Casdoor owner). Fallback:
          `const owner = existing.idp_org || cfg.casdoor_organization!`.
       3. `const syncSuccess = await cd.updateRole({ owner, name: idpRole,
          displayName: label_key });` — if `!syncSuccess`, throw
          ApiError("Casdoor sync failed", non-best-effort).
       4. `await repo.upsertMapping(idpRole, permissions, is_admin, label_key)`
          with `last_synced_at = new Date()`.
       5. Return the updated row.
       - **`idpRole` (the URL param) is the source of truth for the role name;
         the body MUST NOT contain `idp_role` or `idp_org`.** Both are immutable
         on update (the Casdoor role identity `(owner, name)` is fixed at
         creation). If the body contains either, reject with 400.
     - `deleteRole(idpRole)`:
       1. `const cd = await casdoor.getClient();` — if `null`, throw ApiError.
       2. Load the existing row to get `idp_org` (the Casdoor owner). Fallback:
          `const owner = existing.idp_org || cfg.casdoor_organization!`.
       3. `const syncSuccess = await cd.deleteRole(idpRole, owner);` — if
         `!syncSuccess`, throw ApiError("Casdoor delete failed",
         non-best-effort). **Do NOT delete locally if Casdoor delete fails.**
       4. `await repo.deleteMapping(idpRole)`.
       5. Return `{ deleted: true }`.
   - All errors use the existing ApiError shape with `impact` field (per BE
     AGENTS.md "API errors: Use stable error codes with `impact` field").

7. **`primebrick-be-v3/src/modules/auth/routers/role-mappings.router.ts` (NEW)**
   - `makeProtectedRouter()` with:
     - `GET    /api/v1/system/role-mappings`           → `rbacHandler([Permission.ROLE_MAPPINGS_READ_ALL])` → `service.listRoles()` → `res.json({ roles })`.
     - `GET    /api/v1/system/role-mappings/:idp_role` → `rbacHandler([Permission.ROLE_MAPPINGS_READ_SINGLE])` → `service.getRole(idp_role)` → 404 if missing.
     - `POST   /api/v1/system/role-mappings`           → `rbacHandler([Permission.ROLE_MAPPINGS_CREATE])` → validate body → `service.createRole(body)` → 201 with the created row.
     - `PUT    /api/v1/system/role-mappings/:idp_role` → `rbacHandler([Permission.ROLE_MAPPINGS_UPDATE])` → validate (reject body containing `idp_role`) → `service.updateRole(idp_role, body)` → 200 with updated row.
     - `DELETE /api/v1/system/role-mappings/:idp_role` → `rbacHandler([Permission.ROLE_MAPPINGS_DELETE])` → `service.deleteRole(idp_role)` → 200 `{ deleted: true }`.
   - The router instantiates `RoleService(getPool(), new CasdoorService(getPool()))`
     (or reuses a shared `CasdoorService` instance if the module already
     provides one — check `auth/router.ts` for an existing singleton).
   - Body validation:
     - **Create**: `idp_role` non-empty string ≤255 matching `^[a-z0-9_]+$`,
       `idp_org` non-empty string ≤255 (the Casdoor owner/org, selected from
       the form combobox), `permissions` array of strings each matching
       `^[a-z_]+\.[a-z_]+(\.[a-z_]+)*$`, `is_admin` boolean, `label_key`
       optional string ≤255. Reject sentinels in `permissions` (use
       `isPermissionSentinel` from the SDK).
     - **Update**: body MUST NOT contain `idp_role` or `idp_org` (both immutable
       on update — the Casdoor role identity `(owner, name)` is fixed at
       creation). Only `label_key`, `is_admin`, `permissions` are editable.
   - All JSON responses are `snake_case` (per BE data-model rule). Return the
     full entity shape (id, idp_role, idp_org, label_key, permissions, is_admin,
     last_synced_at, version, created_at, created_by, updated_at, updated_by).

8. **`primebrick-be-v3/src/modules/auth/router.ts`**
   - Import `roleMappingsRouter` from `./routers/role-mappings.router.js`.
   - Add `router.use(roleMappingsRouter());` inside `authRouter()`.

9. **`primebrick-be-v3/src/modules/system/system-router.ts`**
   - Add `GET /api/v1/system/permissions`:
     ```ts
     router.get(
       "/api/v1/system/permissions",
       rbacHandler([Permission.AUTHENTICATED_USER]),
       asyncHandler(async (_req, res) => {
         const all = listNonSentinelPermissions(); // from SDK
         const modulesMap = new Map<string, string[]>();
         for (const p of all) {
           const mod = p.split(".")[0];
           if (!modulesMap.has(mod)) modulesMap.set(mod, []);
           modulesMap.get(mod)!.push(p);
         }
         const modules = Array.from(modulesMap.entries())
           .map(([code, perms]) => ({
             code,
             label_key: `shell.settings.roles.permissions.module.${code}`,
             permissions: perms.sort().map((code2) => ({
               code: code2,
               label_key: `shell.settings.roles.permissions.${code2}`,
             })),
           }))
           .sort((a, b) => a.code.localeCompare(b.code));
         res.json({ modules });
       })
     );
     ```
   - Import `listNonSentinelPermissions` from `@primebrick/sdk`.

10. **`primebrick-be-v3/src/modules/module-nav-meta.ts`**
    - Add to the `settings` nav array (between `users` and `security`):
      ```ts
      { id: "roles", label_key: "shell.settings.tabs.roles", href: "/system/settings/roles", icon: "shield" },
      ```

11. No DB patch required for the new `ROLE_MAPPINGS_*` permission *constants*:
    the `administrators` role has `is_admin=true` and bypasses RBAC. Document
    this in the commit message. (The `last_synced_at` column patch from step 3
    IS required — that is a schema change, not a permission seed.) If a non-admin
    role should manage role mappings, seed the permission into that role's
    `permissions[]` via a SQL patch — out of scope for v1.

### Phase 3 — FE

12. **`primebrick-fe-v3/src/lib/composables/useTabsMode.svelte.ts` (NEW)**
    - `localStorage` key `pb.tabs.mode`, default `'show-all'`.
    - Follows the composable state-exposure pattern (`_state`, `get state()`,
      mutator `setMode(m)`).
    - Exposes `mode: 'hide' | 'show-all'` reactively.

13. **`primebrick-fe-v3/src/lib/components/ui/anchor-tabs/` (NEW)**
    - `AnchorTabs.svelte` — props: `{ mode, showToggle, value, onModeChange, children }`.
      Renders the `TabsList` + optional `AnchorTabsModeSwitch` on the right, then
      either delegates to bits-ui `Tabs`/`TabsContent` (hide mode) or renders
      stacked anchored sections (show-all mode).
    - `AnchorTabsList.svelte` — flex row containing the triggers + the switch.
    - `AnchorTabsTrigger.svelte` — in hide mode renders `TabsTrigger`; in
      show-all mode renders `<a href="#tab-<value>">` with smooth-scroll.
    - `AnchorTabsContent.svelte` — in hide mode renders `TabsContent`; in
      show-all mode renders a `<section id="tab-<value>">` (always visible).
    - `AnchorTabsModeSwitch.svelte` — `Switch` bound to `useTabsMode`, with
      tooltip + aria-label.
    - `index.ts` — barrel export.
    - Use `IntersectionObserver` in `AnchorTabs.svelte` to track the active
      section in show-all mode and highlight the corresponding trigger.

14. **`primebrick-fe-v3/src/lib/composables/usePermissionsCatalog.svelte.ts` (NEW)**
    - Fetches `/api/v1/system/permissions` on mount.
    - Exposes `state.catalog` (`{ modules: Array<{ code, label_key, permissions: Array<{ code, label_key }> }> }`)
      and `state.loading`.
    - Helper `permissionCodes(): string[]` — flat list of all permission codes
      (used to validate the form's `permissions` array).

15. **`primebrick-fe-v3/src/lib/composables/useRoleMappings.svelte.ts` (NEW)**
    - CRUD client for `/api/v1/system/role-mappings`.
    - Methods: `list()`, `get(idpRole)`, `create(body)`, `update(idpRole, body)`,
      `remove(idpRole)`.
    - Uses `apiFetch` from `$lib/api`; errors routed through
      `pushNotification` (per FE AGENTS.md error-notification rule).

16. **`primebrick-fe-v3/src/routes/(app)/system/settings/roles/+page.svelte` (NEW)**
    - Mirrors `organizations/+page.svelte` structure but simpler (no
      EntityListTable meta needed unless we add a `role_mappings` entity meta —
      v1 uses a plain table).
    - Columns: `idp_role`, `idp_org` (org display name), `label_key` (translated),
      `is_admin` (badge), `permissions` (count badge), `last_synced_at`,
      `updated_at`, `version`.
    - Row click → `goto('/system/settings/roles/<url-encoded-idp_role>')`.
    - "New role" button → `goto('/system/settings/roles/create')`.
    - `useSyncChannel('primebrick_roles_sync', { mode: 'receiver' })` to refresh
      after create/update from child windows.

17. **`primebrick-fe-v3/src/routes/(app)/system/settings/roles/create/+page.svelte` (NEW)**
    - `FormPageLayout` + `superForm` + `zod4` schema:
      ```ts
      const schema = z.object({
        idp_role: z.string().min(1).max(255).regex(/^[a-z0-9_]+$/),
        idp_org: z.string().min(1, { message: 'validation.orgRequired' }).max(255),
        label_key: z.string().max(255).optional().or(z.literal('')),
        is_admin: z.boolean().default(false),
        permissions: z.array(z.string()).default([]),
      });
      ```
    - **Organization combobox** — same pattern as
      `users/create/+page.svelte` lines 57-104, 464-480: fetch
      `/api/v1/system/organizations/active` on mount, render a combo-select
      with org avatar + display_name + idp_name, bind to `$form.idp_org`.
      The selected org is sent as `idp_org` in the POST body and becomes the
      Casdoor `owner` for the new role.
    - `AnchorTabs` with `showToggle`:
      - Tab 1 "Details": `idp_org` (combobox), `idp_role` (text input),
        `label_key`, `is_admin` switch.
      - Tab 2 "Permissions": `usePermissionsCatalog` → grouped tables with
        checkboxes bound to `permissions`.
    - On submit → `useRoleMappings.create()` → notify parent via
      `useSyncChannel('primebrick_roles_sync', { mode: 'sender' })` →
      `goto('/system/settings/roles/<idp_role>')`.
    - `useUnsavedChangesGuard` for both tabs (the guard covers the whole form
      regardless of which tab is visible — important in show-all mode where
      both tabs are in the DOM).

18. **`primebrick-fe-v3/src/routes/(app)/system/settings/roles/[idp_role]/+page.svelte` (NEW)**
    - Same form as create, pre-filled from `useRoleMappings.get(idpRole)`.
    - `idp_role` AND `idp_org` are **read-only** on update (the Casdoor role
      identity `(owner, name)` is immutable). Both fields are rendered disabled
      with a tooltip explaining why. The org is shown as a read-only display
      (org name + avatar) rather than a combobox.
    - On submit → `useRoleMappings.update(idpRole, body)` → notify parent.
    - Delete button (gated by `ROLE_MAPPINGS_DELETE` — but the FE does not
      import the SDK; the BE returns 403 if not allowed, and the FE shows/hides
      the button based on a meta flag returned by `GET /role-mappings/:idp_role`
      → add `can_delete: boolean` to that response, derived from `req.user`).
    - Delete confirmation dialog must warn that the role will ALSO be deleted
      in Casdoor (hard delete, non-best-effort).

19. **i18n — all 6 locale files** (`lib/i18n/messages/*.json`)
    - Add `shell.settings.tabs.roles` (e.g. "Roles" / "Ruoli" / ...).
    - Add `shell.settings.roles.*` namespace:
      - `title`, `create.title`, `update.title`
      - `fields.idpRole`, `fields.idpOrg`, `fields.idpOrgPlaceholder`,
        `fields.labelKey`, `fields.isAdmin`, `fields.permissions`
      - `tabs.details`, `tabs.permissions`, `tabs.modeToggle`,
        `tabs.modeToggleHelp`
      - `permissions.module.<code>` (one per module: customers, users,
        organizations, modules, profile, userprofile, emailsender,
        role_mappings)
      - `permissions.<permission_code>` (one per permission — verbose but
        consistent with the i18n-always rule in FE AGENTS.md; can be auto-
        generated from the catalog for the English base and translated later).
      - `isAdminWarning` ("Admin roles bypass all permission checks...")
      - `casdoorSyncWarning` ("This action also modifies the role in Casdoor.")
      - `deleteCasdoorWarning` ("Deleting this role will ALSO delete it in
        Casdoor. Users assigned to this role in Casdoor will lose it.")
      - `casdoorNotConfigured` ("Casdoor is not configured; role management
        is unavailable.")
      - `unsavedChanges`
    - ⚠️ Per FE AGENTS.md: "always add translations immediately when adding
      labels". Add at least the English base for all keys; provide Italian
      translations too (primary user language). Other locales can fall back to
      English until translated.

20. **`primebrick-fe-v3/src/lib/breadcrumb/settings-breadcrumb.ts`**
    - Add the `roles` segment to the settings breadcrumb menu (mirror the
      existing `users` / `organizations` entries).

### Phase 4 — Verification

21. **BE**
    - `pnpm run build` (TypeScript compile).
    - `pnpm test` — run the new `casdoor-api-client.test.ts` role method tests
      and any new `role.service.test.ts`.
    - Manual curl checks (with Casdoor configured):
      - `GET /api/v1/system/permissions` → 200, grouped payload.
      - `GET /api/v1/system/role-mappings` → 200, array.
      - `POST /api/v1/system/role-mappings` with a test role → 201, AND verify
        the role appears in Casdoor (via Casdoor UI or `cd.getRole`).
      - `PUT /api/v1/system/role-mappings/:idp_role` → 200, AND verify the
        Casdoor role `displayName` changed.
      - `DELETE /api/v1/system/role-mappings/:idp_role` → 200, AND verify the
        role is gone from Casdoor.
      - **Casdoor failure simulation**: stop Casdoor (or use bad credentials)
        and verify POST/PUT/DELETE return an error AND the local
        `role_mappings` table is NOT modified (non-best-effort).
      - **Casdoor not configured**: in a dev setup without builtin credentials,
        verify POST/PUT/DELETE return a clear "Casdoor is not configured" error.
    - Verify a non-admin user without `ROLE_MAPPINGS_*` gets 403 on writes.
    - Verify the `administrators` role (is_admin=true) can perform all CRUD.

22. **FE**
    - `pnpm run check` (typecheck).
    - `pnpm run build`.
    - Manual flow:
      - Settings sidebar shows "Roles".
      - List page renders existing roles.
      - Create page: Details tab + Permissions tab; toggle the mode switch →
        tabs switch between hide and show-all; permissions checkboxes update
        the form state; submit creates the role and navigates to the update page.
      - Update page: pre-filled; changing permissions and saving works; delete
        works (when allowed).
      - Reload the page → the tabs-mode preference is remembered (localStorage).
      - Unsaved-changes guard triggers when navigating away with dirty form in
        BOTH tab modes.

23. **E2E (optional, recommended)**
    - Add `src/e2e/settings-roles.spec.ts` covering: list → create → update →
      delete, and the tabs-mode toggle persistence. Use the `data-testid`
      convention from FE AGENTS.md (e.g. `roles-list-table`,
      `roles-create-submit`, `roles-permissions-tab`, `tabs-mode-switch`).
    - E2E tests assume Casdoor is configured in the test environment (role
      create/delete hit Casdoor). If the E2E env has no Casdoor, skip the
      create/update/delete tests and only cover the list page + tabs-mode toggle.

---

## 5. Acceptance Criteria

1. `GET /api/v1/system/permissions` returns the full non-sentinel permission
   catalog grouped by module, sorted, with `label_key`s.
2. `GET/POST/PUT/DELETE /api/v1/system/role-mappings` perform CRUD on
   `role_mappings`, gated by the new `ROLE_MAPPINGS_*` permissions; admins
   bypass.
3. **Role create/update/delete sync to Casdoor** (non-best-effort on all three):
   - Create: Casdoor `addRole` succeeds → local row created with
     `last_synced_at`. Casdoor fails → error, no local row.
   - Update: Casdoor `updateRole` succeeds → local row updated with
     `last_synced_at`. Casdoor fails → error, no local change.
   - Delete: Casdoor `deleteRole` succeeds → local row deleted. Casdoor fails →
     error, no local delete.
   - `permissions[]` is NEVER sent to Casdoor (Primebrick-local only).
4. **`idp_role` and `idp_org` are read-only on update** — the PUT endpoint
   rejects a body containing `idp_role` or `idp_org`; the FE renders both as
   disabled. The Casdoor role identity `(owner, name)` is immutable.
5. **The role create form has an org combobox** (same pattern as the user
   create form) that fetches `/api/v1/system/organizations/active`; the
   selected org is stored as `idp_org` in `role_mappings` and passed as
   `owner` to Casdoor `addRole`/`updateRole`/`deleteRole`.
6. The FE Roles list page renders all roles with their org, permission count,
   admin badge, and `last_synced_at`.
7. The create/update form has two tabs (Details + Permissions) rendered via
   `AnchorTabs`.
8. The `AnchorTabsModeSwitch` toggles between hide and show-all mode; the choice
   persists in `localStorage` across pages and reloads; default is `show-all`.
9. In show-all mode, all tab content is visible, triggers are anchor links,
   smooth-scroll works, and the active trigger follows scroll.
10. The Permissions tab shows one table per module with checkboxes; checking/
    unchecking updates the form's `permissions` array; submitting persists it.
11. Enabling `is_admin` disables the Permissions tab with a clear warning.
12. All new labels have i18n entries in all 6 locale files (English + Italian
    fully translated; others at least English base), including the Casdoor
    sync/delete warnings.
13. `pnpm run check` and `pnpm run build` pass on FE; `pnpm run build` passes
    on BE and SDK; `pnpm test` passes on BE (including new Casdoor role method
    tests).
14. No SDK import is added to the FE (FE stays standalone).
15. All new TS interfaces / JSON responses use `snake_case` (per data-model
    rules in both BE and FE AGENTS.md). The `CasdoorRole` interface is the
    documented external-adapter exception (camelCase dictated by Casdoor REST).

---

## 6. Risks & Open Questions

- **Casdoor REST role endpoints**: the plan assumes Casdoor exposes
  `/api/get-role`, `/api/add-role`, `/api/update-role`, `/api/delete-role`
  (standard Casdoor admin API, confirmed by `scripts/setup-casdoor.ts` lines
  202-214 which calls `/add-role?id=${ORG_NAME}/${ROLE_ADMINISTRATORS}`). The
  implementer MUST verify the exact request/response shapes against the
  configured Casdoor version before writing `CasdoorApiClient` role methods
  (per `.windsurfrules` external-dependency verification protocol). If the
  endpoints differ, adapt the client methods — the `RoleService` orchestration
  logic stays the same.
- **`idp_org` is NOT part of the RBAC lookup key**: the unique constraint stays
  on `idp_role` alone (not `(idp_org, idp_role)`) because the JWT `roles_path`
  provides role names as plain strings and `expandPermissions` /
  `getRoleMapping` look up by name alone. This means you cannot have the same
  role name in two different orgs with different permissions — if multi-org
  role scoping is needed later, the JWT role format and RBAC lookup flow must
  change (out of scope for this feature). `idp_org` is stored for Casdoor sync
  purposes only.
- **Delete when users still have the role**: hard-deleting a Casdoor role that
  is still assigned to users may fail at the Casdoor level (Casdoor may reject
  or cascade). The non-best-effort policy means the local delete is blocked too,
  which is the safe behavior. The FE error message should surface the Casdoor
  error detail so the operator knows to unassign the role from users first.
  (Future enhancement: a "role in use" pre-check — out of scope for v1.)
- **Permission label explosion**: adding a translation key per permission
  (~40 keys × 6 locales) is verbose. Alternative: ship only module-level labels
  in v1 and render the permission code as-is (mono) with a tooltip. **Recommend
  the verbose approach** to comply with the FE i18n-always rule, but auto-
  generate the English base from the catalog to save time.
- **URL encoding of `idp_role`**: role names are snake_case (safe), but the
  route param should still be `encodeURIComponent`-encoded on the FE and
  decoded on the BE (Express decodes automatically). Verified: no conflict
  with SvelteKit routing for snake_case segments.
- **Wildcards in `permissions[]`**: the UI only toggles individual permissions
  from the catalog. If a role already has wildcards (e.g. `customers.*`), the
  Permissions tab will show them as "extra" rows not present in the catalog —
  display them in a separate "Advanced / raw permissions" section under the
  permissions tab, editable as a free-text list. (Decide during implementation
  whether to include this in v1 or defer.)
- **Tabs-mode switch placement**: the user asked for the switch "on the right
  of the tabs line". In show-all mode the triggers are anchor links (not a
  bits-ui TabsList), so the switch is rendered in the same flex row as the
  triggers, right-aligned. This is handled by `AnchorTabsList.svelte`.

---

## 7. File Inventory

### New / modified files
- `primebrick-v3-sdk/src/auth/permissions.ts` (modified — add 5 constants + helper)
- `primebrick-v3-sdk/src/auth/index.ts` (modified — export `listNonSentinelPermissions`)
- `primebrick-be-v3/src/modules/auth/role_mapping_entity.ts` (modified — add `last_synced_at` column)
- `primebrick-be-v3/src/modules/auth/role-mapping-repo.ts` (modified — add `listAllDetailed`, `findByIdpRole`)
- `primebrick-be-v3/src/modules/auth/casdoor-api-client.ts` (modified — add `CasdoorRole` interface + 4 role methods)
- `primebrick-be-v3/src/modules/auth/__tests__/casdoor-api-client.test.ts` (modified — add role method tests)
- `primebrick-be-v3/src/modules/auth/services/role.service.ts` (NEW — Casdoor+DB coordination)
- `primebrick-be-v3/src/modules/auth/routers/role-mappings.router.ts` (NEW)
- `primebrick-be-v3/src/modules/auth/router.ts` (modified — mount new router)
- `primebrick-be-v3/src/modules/system/system-router.ts` (modified — add /permissions)
- `primebrick-be-v3/src/modules/module-nav-meta.ts` (modified — add roles nav entry)
- `primebrick-be-v3/db-meta/patches/<new-patch>.sql` (NEW — `last_synced_at` column; generated by `db:meta:compare`)
- `primebrick-fe-v3/src/lib/composables/useTabsMode.svelte.ts`
- `primebrick-fe-v3/src/lib/composables/usePermissionsCatalog.svelte.ts`
- `primebrick-fe-v3/src/lib/composables/useRoleMappings.svelte.ts`
- `primebrick-fe-v3/src/lib/components/ui/anchor-tabs/AnchorTabs.svelte`
- `primebrick-fe-v3/src/lib/components/ui/anchor-tabs/AnchorTabsList.svelte`
- `primebrick-fe-v3/src/lib/components/ui/anchor-tabs/AnchorTabsTrigger.svelte`
- `primebrick-fe-v3/src/lib/components/ui/anchor-tabs/AnchorTabsContent.svelte`
- `primebrick-fe-v3/src/lib/components/ui/anchor-tabs/AnchorTabsModeSwitch.svelte`
- `primebrick-fe-v3/src/lib/components/ui/anchor-tabs/index.ts`
- `primebrick-fe-v3/src/routes/(app)/system/settings/roles/+page.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/roles/create/+page.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/roles/[idp_role]/+page.svelte`
- `primebrick-fe-v3/src/lib/i18n/messages/*.json` (6 files modified)
- `primebrick-fe-v3/src/lib/breadcrumb/settings-breadcrumb.ts` (modified)

### Untouched (no scope creep)
- `primebrick-fe-v3/src/lib/components/ui/tabs/*` (the existing bits-ui wrapper
  stays as-is; `AnchorTabs` composes it, does not modify it).
- `primebrick-be-v3/src/modules/system/system-router.ts` existing endpoints
  (`/roles/active`, `/password-policy`, `/services*`).
- `primebrick-fe-v3/src/lib/composables/useActiveRoles.svelte.ts` (still used
  by user forms; the new `useRoleMappings` is separate).
- `primebrick-be-v3/src/modules/auth/services/user.service.ts` and
  `organizations.service.ts` (reference patterns only; not modified).
