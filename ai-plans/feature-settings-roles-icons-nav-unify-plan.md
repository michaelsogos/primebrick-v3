# Plan: Settings Roles — Icons, Unified Nav Source of Truth, Translations, EntityListTable Refactor

**Date:** 2026-07-20
**Status:** DRAFT — awaiting approval
**Repos impacted:** `primebrick-be-v3`, `primebrick-fe-v3`

## 1. Objectives

Address five issues raised about the Settings → Roles area:

1. **Profile page icon** → `lucide square-user`
2. **Roles page icon** → `lucide user-key`
3. **Unify the source of truth** for the settings page menu so that what appears in the app sidebar also appears in the settings breadcrumb dropdown (and vice‑versa). Today the sidebar reads BE module nav meta, but the breadcrumb dropdown uses a hardcoded FE array that is missing `roles`.
4. **Add all missing `shell.settings.roles.*` translations** across all 6 locales.
5. **Refactor the roles list page to use the shared `EntityListTable` pattern** (same as customers / organizations / users), and add the corresponding BE entity‑meta + list endpoints. Add an enforcing rule so any new settings entity list page MUST reuse `EntityListTable` and MUST ask before introducing a new layout.

## 2. Key findings from analysis (evidence)

### 2.1 The divergence (issue #3 root cause)

- **BE already defines the settings module nav, including roles.**
  `D:/git/primebrick/primebrick-be-v3/src/modules/module-nav-meta.ts` → `buildModuleNavMeta("settings")` returns a `nav` array with 8 items: profile, organizations, users, **roles**, security, modules, templates, email‑providers. Each item has `id`, `label_key`, `href`, `icon`. Roles currently has `icon: "shield"`. Profile currently has `icon: "user"`.
- **FE sidebar already consumes this** via `shellNav.moduleNav?.nav` in `D:/git/primebrick/primebrick-fe-v3/src/lib/components/AppSidebar.svelte` (line 26) and renders icons via `DynamicIcon` (lines 123, 135, 149).
- **FE breadcrumb dropdown does NOT consume this.** `D:/git/primebrick/primebrick-fe-v3/src/lib/breadcrumb/settings-breadcrumb.ts` (lines 11‑47) hardcodes a 7‑item array that is missing `roles`. This is the divergence.
- **Conclusion:** the source of truth already exists in the BE (`module-nav-meta.ts`). The fix is to make the FE breadcrumb dropdown read from the same `shellNav` store (the "settings" module nav) instead of the hardcoded array, and delete the hardcoded array.

### 2.2 Icons (issues #1, #2)

- Both icons verified present in the installed `@lucide/svelte@1.24.0`:
  `node_modules/@lucide/svelte/dist/icons/square-user.svelte`
  `node_modules/@lucide/svelte/dist/icons/user-key.svelte`
- Both verified on https://lucide.dev/icons/square-user and https://lucide.dev/icons/user-key.
- Icons are referenced by **string name** in `module-nav-meta.ts` (e.g. `icon: "shield"`) and rendered by `DynamicIcon` which `import.meta.glob`s `@lucide/svelte/dist/icons/*.svelte`. So changing the icon = changing the string in `module-nav-meta.ts`. No FE import changes needed for the sidebar.
- The breadcrumb dropdown currently renders **text only** — `AppBreadcrumbMenuSegment.items` has no `icon` field (`D:/git/primebrick/primebrick-fe-v3/src/lib/breadcrumb/types.ts` lines 3‑9). To show icons in the dropdown we must add an optional `icon?: string` field and render it via `DynamicIcon` in `AppPageBreadcrumb.svelte`.

### 2.3 Missing translations (issue #4)

- i18n is a custom Svelte‑store implementation at `D:/git/primebrick/primebrick-fe-v3/src/lib/i18n/`.
- 6 locale files in `D:/git/primebrick/primebrick-fe-v3/src/lib/i18n/messages/`: `en-GB.json`, `it-IT.json`, `fr-FR.json`, `es-ES.json`, `de-DE.json`, `pt-PT.json`. (`en-US` reuses `en-GB`.)
- The **entire `shell.settings.roles` namespace is missing** from all 6 files.
- 38 keys are referenced by the three roles pages (`roles/+page.svelte`, `roles/[idp_role]/+page.svelte`, `roles/create/+page.svelte`) but do not exist. The pages currently render raw key strings.
- Also need `shell.settings.tabs.roles` (used by the BE nav `label_key` for the roles tab) — currently missing, so even the sidebar shows the raw key.
- `docs/ai/i18n.md` states: CRITICAL — always add translations immediately when adding labels.

### 2.4 Roles list page not using EntityListTable (issue #5)

- `D:/git/primebrick/primebrick-fe-v3/src/routes/(app)/system/settings/roles/+page.svelte` (203 lines) uses raw `Table`/`TableRow`/... from `$lib/components/ui/table` + a custom `useRoleMappings` composable hitting `GET /api/v1/system/role-mappings`.
- `customers`, `organizations`, `users` all use `EntityListTable` from `$lib/components/entity-list-table`, driven by `GET /api/v1/entities/{entity}/meta` + `GET /api/v1/entities/{entity}/list`.
- BE entity `RoleMappingEntity` is already registered in `D:/git/primebrick/primebrick-be-v3/src/domain/entities/registry.ts` (line 17). Primary key is `id: bigint` (NOT `uuid`). `idp_role` is `@Unique()` and immutable. No soft‑delete column (hard delete only). `permissions` is `jsonb` array.
- BE has no `role_mappings.meta.ts` and no `/api/v1/entities/role_mappings/meta` or `/list` endpoints. The role‑mappings router (`D:/git/primebrick/primebrick-be-v3/src/modules/auth/routers/role-mappings.router.ts`) only exposes the CRUD endpoints under `/api/v1/system/role-mappings`.

## 3. Architectural decisions

### 3.1 Source of truth = BE `module-nav-meta.ts` (the "settings" reserved module)

- The "settings" module is already reserved (`is_reserved: true`) and already returns the 8 settings tabs including roles.
- The FE `shellNav` store (`D:/git/primebrick/primebrick-fe-v3/src/lib/shell/modules-shell.svelte.ts`) already loads the active module's nav into `shellNav.moduleNav` via `selectModule(id)`.
- **Decision:** the settings breadcrumb dropdown will read from `shellNav.moduleNav?.nav` (filtered to the settings module) instead of the hardcoded array. The hardcoded `settings-breadcrumb.ts` array is deleted.
- This means: adding a settings tab in BE `module-nav-meta.ts` automatically makes it appear in **both** the sidebar and the breadcrumb dropdown. Single source of truth achieved.
- Required FE wiring: ensure the "settings" module nav is loaded when on a `/system/settings/*` route (the app layout already calls `syncModuleFromRoute`; verify it resolves the settings module from the route prefix and loads its nav). If not, add an explicit `shellNav.selectModule("settings")` in the settings layout/load.

### 3.2 Icons in both places

- **Sidebar:** already renders icons from BE nav via `DynamicIcon`. Change is purely in `module-nav-meta.ts`: profile → `square-user`, roles → `user-key`.
- **Breadcrumb dropdown:** add optional `icon?: string` to `AppBreadcrumbMenuSegment.items[]` and `AppBreadcrumbPlainSegment`, render via `DynamicIcon` in `AppPageBreadcrumb.svelte`. The settings dropdown items will carry the icon strings coming from the BE nav.

### 3.3 Roles list → EntityListTable (FE + BE)

- **BE entity model — align `RoleMappingEntity` to the standard entity pattern.** Both `OrganizationEntity` and `UserProfileEntity` follow the same convention (see `organization_entity.ts` and `user_profile_entity.ts`):
  1. `id: bigint` — `@Key()` — internal bigserial PK, **never exposed externally**, only for FK joins. (Per `user_profile_entity.ts` line 18: *"Following the project rule that bigserial PKs are never exposed externally, `id` is internal-only (joins, FKs); only `uuid` is ever surfaced via API."*)
  2. `uuid: string` — `@Unique()` — the internal Primebrick UUID, **used for all operations, audit fields, API endpoints**. This is the standard `uid` for `EntityListTable` and entity API paths.
  3. `idp_code: string` — `@Unique()` — the Casdoor external identifier, used for sync, immutable after creation.
  4. `deleted_at` / `deleted_by` — `@DeletableField` — soft delete.

  `RoleMappingEntity` currently VIOLATES this standard:
  - ❌ Missing `uuid` column — must be ADDED (`@Unique()`, generated on insert like orgs/users)
  - ✅ `idp_role` already exists as `@Unique()` — this IS the Casdoor unique key (analogous to `idp_code` for orgs/users). No rename needed; `idp_role` is the role name as emitted by the IDP in the JWT.
  - **Soft‑delete columns (`deleted_at`/`deleted_by`) are NOT added.** Rationale: Casdoor role deletion is irreversible — there is no Casdoor "restore role" API. Soft‑deleting locally + restoring would create IDP drift (role exists locally but not in Casdoor). Therefore role_mappings uses **hard delete only**, matching the existing `RoleMappingRepo.deleteMapping` which already calls `repo.hardDelete`. `rowActions.restore: false` in the meta. This is a deliberate, documented deviation from the org/user soft‑delete pattern, justified by the Casdoor sync constraint.

  **Changes to `RoleMappingEntity`:**
  - Add `@Unique() uuid: string;` (generated UUID, the external-facing key)
  - Implement `IAuditableEntity` interface (like org/user entities do)
  - `idp_role` stays as the Casdoor sync key (immutable after creation, like `idp_code`)
  - No `deleted_at`/`deleted_by` (hard delete only — see rationale above)

  **DB migration required:** run `pnpm run db:meta:compare` to generate the patch snapshot for the new `uuid`, `deleted_at`, `deleted_by` columns on `role_mappings`, then `pnpm run db:migrate` to apply. Existing rows need UUIDs backfilled (generate `gen_random_uuid()` for existing rows in the migration SQL).

- **BE meta + endpoints — use `uuid` as `uid`, key routes by `:uuid`:**
  - Create `D:/git/primebrick/primebrick-be-v3/src/modules/auth/role-mappings.meta.ts` exporting `roleMappingsMeta` (`uid: "uuid"`, columns for `uuid` (hidden), `idp_role` (sticky, the Casdoor key), `idp_org`, `label_key`, `is_admin` (badge), `permissions` (count/text), `last_synced_at` (datetime), auditing columns `created_at`/`created_by`/`updated_at`/`updated_by`/`version`; `rowActions: { edit: true, delete: true, duplicate: false, preview: false, restore: false }`; `enableCreateAction: true`; `defaultSort: { key: "idp_role", dir: "asc" }`; `viewVisibility` for table/cards/cards_list). `restore` and `duplicate` are `false` (hard delete only — Casdoor irreversible; `idp_role` unique).
  - Add a `RoleMappingsDal` (mirror `OrganizationsDal`) with `listRoleMappings(query)` that calls `this.repo.findByPage(RoleMappingEntity, page, page_size, fields, { filters, sorting })` — the generic DAL helper at `primebrick-dal-v3/src/repository/repository.ts:236‑272`. No `deletedRecords` (hard delete only). Also add `getByUuid(uuid)` for the entity get endpoint.
  - Add a `RoleMappingsService` mirroring `OrganizationsService` (list, get by uuid, create, update, delete, restore, audit).
  - Add the full entity CRUD route set to `role-mappings.router.ts` (keyed by `:uuid`, the standard uid), mirroring organizations:
    | Method | Path | Permission |
    |--------|------|------------|
    | GET | `/api/v1/entities/role_mappings/meta` | `ROLE_MAPPINGS_READ_ALL, ROLE_MAPPINGS_READ_SINGLE` |
    | GET | `/api/v1/entities/role_mappings/list` | `ROLE_MAPPINGS_READ_ALL` |
    | GET | `/api/v1/entities/role_mappings/:uuid` | `ROLE_MAPPINGS_READ_SINGLE` |
    POST | `/api/v1/entities/role_mappings` | `ROLE_MAPPINGS_CREATE` |
    | PUT | `/api/v1/entities/role_mappings/:uuid` | `ROLE_MAPPINGS_UPDATE` |
    | DELETE | `/api/v1/entities/role_mappings/:uuid` | `ROLE_MAPPINGS_DELETE` |
    | GET | `/api/v1/entities/role_mappings/:uuid/audit` | `ROLE_MAPPINGS_READ_AUDIT` |
    The `DELETE /api/v1/entities/role_mappings/:uuid` endpoint is **required** because `EntityListTable`'s `useRowActions` composable (`primebrick-fe-v3/src/lib/components/entity-list-table/composables/useRowActions.svelte.ts:109‑111`) hardcodes `DELETE /api/v1/entities/{entity}/{uid}`. The entity‑path delete/put/post handlers resolve `uuid → idp_role` via `RoleMappingsDal.getByUuid` then delegate to the existing `RoleService` (which owns the Casdoor sync). `restore`/`duplicate` endpoints are NOT added (`rowActions.restore: false`, `rowActions.duplicate: false` — hard delete only, Casdoor irreversible).
  - Verify the exact `Permission` constants in `src/modules/auth/permissions.ts` (`ROLE_MAPPINGS_READ_ALL`, `ROLE_MAPPINGS_READ_SINGLE`, `ROLE_MAPPINGS_CREATE`, `ROLE_MAPPINGS_UPDATE`, `ROLE_MAPPINGS_DELETE`, `ROLE_MAPPINGS_READ_AUDIT`); add any missing ones to the enum. (`ROLE_MAPPINGS_RESTORE_SINGLE` is NOT needed — no restore.)
  - Migrate the existing `/api/v1/system/role-mappings/:idp_role` CRUD endpoints to also accept `:uuid` (or deprecate them in favor of the entity‑path ones). The FE create/edit pages will switch from `idp_role`‑keyed routes to `uuid`‑keyed routes (see FE section).
- **FE:** rewrite `roles/+page.svelte` to mirror `users/+page.svelte` structure: fetch meta from `/api/v1/entities/role_mappings/meta`, fetch rows from `/api/v1/entities/role_mappings/list`, build columns via `orderedColumnsFromListMeta`, wire `EntityListTable` with `entity="role_mappings"`, `uid="uuid"`, `onCreateAction={() => goto('/system/settings/roles/create')}`, `onEditAction={(row) => goto('/system/settings/roles/' + encodeURIComponent(row.uuid))}`. Add `useSyncChannel('primebrick_roles_sync', ...)`. Remove the custom `Table`/`Skeleton`/delete‑dialog markup (EntityListTable provides loading/empty/error states and the delete flow).
- **FE edit route rename:** rename `src/routes/(app)/system/settings/roles/[idp_role]/` → `src/routes/(app)/system/settings/roles/[uuid]/` to match the users/orgs pattern (`users/[uuid]`). Update `useRoleMappings` composable: `get(idp_role)` → `get(uuid)` hitting `GET /api/v1/entities/role_mappings/:uuid`; `update`/`remove` similarly switch to `:uuid` entity endpoints. The `idp_role` remains the Casdoor sync key shown in the form (immutable after creation, like `idp_code`), but the URL/API key is `uuid`.

### 3.4 Enforcing rule (issue #5 second part)

- Add a new rule file `D:/git/primebrick/primebrick-fe-v3/.devin/rules/entity-list-pages.md` (always‑on) stating:
  - Any settings or module page that lists entity rows MUST use `EntityListTable` from `$lib/components/entity-list-table`.
  - Introducing a new list layout requires explicit user approval in the plan step.
  - The BE counterpart MUST expose `/api/v1/entities/{entity}/meta` and `/list`.
- Append a pointer to this rule in `D:/git/primebrick/primebrick-fe-v3/AGENTS.md` under a "List pages" section.

## 4. Impacted files

### Backend (`primebrick-be-v3`)

| File | Change |
|------|--------|
| `src/modules/module-nav-meta.ts` | Change profile icon `"user"` → `"square-user"`; roles icon `"shield"` → `"user-key"`. (lines ~31, ~34 in the settings case) |
| `src/modules/auth/role_mapping_entity.ts` | **MODIFY** — add `@Unique() uuid: string`; implement `IAuditableEntity`. Aligns to the org/user standard: `id` (bigint, internal FK only), `uuid` (external API key), `idp_role` (Casdoor sync key). No soft‑delete columns (hard delete only — Casdoor irreversible). |
| `src/modules/auth/role-mappings.meta.ts` | **NEW** — `roleMappingsMeta` constant following `organizations.meta.ts` pattern. `uid: "uuid"`. |
| `src/modules/auth/routers/role-mappings.router.ts` | Add the full entity CRUD route set under `/api/v1/entities/role_mappings/...` (meta, list, get, create, update, delete, restore, audit) keyed by `:uuid`. Import `roleMappingsMeta`. Wire to `RoleMappingsService`. Migrate/deprecate existing `/api/v1/system/role-mappings/:idp_role` routes. |
| `src/modules/auth/role-mappings-dal.ts` | **NEW** — `RoleMappingsDal` mirroring `organizations_dal.ts`; `listRoleMappings(query)` calls `this.repo.findByPage(RoleMappingEntity, ...)`. No custom DAL logic. |
| `src/modules/auth/services/role-mappings.service.ts` | **NEW** (or extend existing `role.service.ts`) — `RoleMappingsService` mirroring `OrganizationsService` (list, get by uuid, create, update, delete, restore, audit). |
| `src/modules/auth/permissions.ts` (in `@primebrick/sdk`) | Verify `ROLE_MAPPINGS_READ_ALL`, `ROLE_MAPPINGS_READ_SINGLE`, `ROLE_MAPPINGS_CREATE`, `ROLE_MAPPINGS_UPDATE`, `ROLE_MAPPINGS_DELETE`, `ROLE_MAPPINGS_READ_AUDIT` constants exist; add any missing to the `Permission` enum. (`ROLE_MAPPINGS_RESTORE_SINGLE` NOT needed.) |
| `db-meta/patches/` (new patch file) | **NEW** — generated by `pnpm run db:meta:compare`; adds `uuid` column to `role_mappings` + backfills `gen_random_uuid()` for existing rows. Applied via `pnpm run db:migrate`. (No `deleted_at`/`deleted_by` — hard delete only.) |
| `src/modules/mcp/tools/entity-registry.ts` | (Optional) register `role_mappings` with `supported_operations: ["list","get","create","update","delete","meta"]`. |

### Frontend (`primebrick-fe-v3`)

| File | Change |
|------|--------|
| `src/lib/breadcrumb/types.ts` | Add `icon?: string` to `AppBreadcrumbPlainSegment` and to `AppBreadcrumbMenuSegment.items[]`. |
| `src/lib/components/AppPageBreadcrumb.svelte` | Render `DynamicIcon` for plain segments (if `icon` set) and for each menu item (if `item.icon` set), before the label. |
| `src/lib/breadcrumb/settings-breadcrumb.ts` | **Rewrite** `settingsTabMenuSegment()` to build items from `shellNav.moduleNav?.nav` (the settings module nav) instead of the hardcoded array. Delete the hardcoded 7‑item array. Map each `ModuleNavLink` to `{ label: $t(item.label_key), href: item.href, icon: item.icon, current: pathname === item.href \|\| pathname.startsWith(item.href + '/') }`. Fallback label = first item's label. If nav not loaded yet, render a loading/empty menu (rare; nav loads in layout). |
| `src/lib/shell/modules-shell.svelte.ts` | Verify `syncModuleFromRoute` resolves the "settings" module for `/system/settings/*` paths. If not, add a mapping from the `/system/settings` prefix → module id "settings" so the nav is loaded on settings routes. |
| `src/routes/(app)/+layout.svelte` (or settings layout) | Ensure `shellNav.selectModule("settings")` (or route‑sync) runs on settings routes so `shellNav.moduleNav` is populated before the breadcrumb renders. |
| `src/routes/(app)/system/settings/roles/+page.svelte` | **Rewrite** to use `EntityListTable` (mirror `users/+page.svelte`). Fetch meta + list, build columns, wire row actions, sync channel. `uid="uuid"`, `entity="role_mappings"`. Remove custom table/skeleton/delete dialog. |
| `src/routes/(app)/system/settings/roles/[idp_role]/` → `src/routes/(app)/system/settings/roles/[uuid]/` | **RENAME** the edit route folder from `[idp_role]` to `[uuid]` to match the users/orgs pattern (`users/[uuid]`). Update the page to look up by `uuid` via the entity endpoint. |
| `src/lib/composables/useRoleMappings.svelte.ts` | **MODIFY** — switch `get`/`update`/`remove` from `:idp_role` system endpoints to `:uuid` entity endpoints (`GET/PUT/DELETE /api/v1/entities/role_mappings/:uuid`). Add `restore(uuid)` hitting `POST /api/v1/entities/role_mappings/:uuid/restore`. `idp_role` stays as a form field (Casdoor sync key, immutable after creation), not as the URL/API key. |
| `src/lib/i18n/messages/en-GB.json` | Add `shell.settings.tabs.roles` + full `shell.settings.roles.*` subtree (38 keys). |
| `src/lib/i18n/messages/it-IT.json` | Same keys, Italian translations. |
| `src/lib/i18n/messages/fr-FR.json` | Same keys, French translations. |
| `src/lib/i18n/messages/es-ES.json` | Same keys, Spanish translations. |
| `src/lib/i18n/messages/de-DE.json` | Same keys, German translations. |
| `src/lib/i18n/messages/pt-PT.json` | Same keys, Portuguese translations. |
| `.devin/rules/entity-list-pages.md` | **NEW** — enforcing rule that list pages must use `EntityListTable`. |
| `AGENTS.md` | Append "List pages" section pointing to the new rule. |

## 5. Translation keys to add (all 6 locales)

Under `shell.settings.tabs`:
- `roles` — "Roles" (en), "Ruoli" (it), "Rôles" (fr), "Roles" (es), "Rollen" (de), "Funções" (pt)

Under `shell.settings.roles` (38 keys):
- `title`, `subtitle`, `create`, `createTitle`, `createSubtitle`, `editTitle`, `editSubtitle`, `searchPlaceholder`, `empty`, `notFound`
- `colIdpRole`, `colIdpOrg`, `colLabel`, `colAdmin`, `colPermissions`, `colLastSynced`, `colActions`
- `admin`, `edit`, `delete`
- `deleteConfirmTitle`, `deleteConfirmBody` (interpolation `{role}`)
- `tabDetails`, `tabPermissions`
- `modeShowAll`, `modeHide`
- `fieldIdpRole`, `fieldIdpRoleHint`, `fieldIdpRoleImmutable`, `fieldIdpOrg`, `fieldIdpOrgHint`, `fieldIdpOrgPlaceholder`, `fieldIdpOrgImmutable`, `fieldLabelKey`, `fieldLabelKeyHint`, `fieldIsAdmin`, `fieldIsAdminHint`, `lastSynced`
- `permissionsLoading`, `permissionsEmpty`
- `validation.idpRoleRequired`, `validation.idpRoleFormat`, `validation.idpOrgRequired`

Exact English source strings will be authored from the existing page labels; other locales translated accordingly. (The `entities.roleMapping.*` keys for the EntityListTable column headers will be added too, sourced from `roleMappingsMeta.labelKey` values — see BE meta file.)

## 6. Acceptance criteria

1. ✅ Settings sidebar shows profile with `square-user` icon and roles with `user-key` icon (verified visually + by reading `module-nav-meta.ts`).
2. ✅ Settings breadcrumb dropdown shows the same 8 items as the sidebar, **including roles**, each with the correct icon. Adding a 9th item in `module-nav-meta.ts` makes it appear in both places with no FE code change.
3. ✅ `settings-breadcrumb.ts` no longer contains a hardcoded item array; it reads from `shellNav`.
4. ✅ All `shell.settings.roles.*` and `shell.settings.tabs.roles` keys exist in all 6 locale files; the roles pages render translated text (no raw key strings) in en‑GB and at least one other locale.
5. ✅ Roles list page renders via `EntityListTable` with meta from `/api/v1/entities/role_mappings/meta` and rows from `/api/v1/entities/role_mappings/list`; pagination, sort, search, column visibility, and row actions (edit/delete) work; create button navigates to the existing create page; edit navigates to the existing `[idp_role]` page.
6. ✅ `pnpm run check` passes in FE; BE builds (`pnpm run build`) passes; no new lint errors.
7. ✅ New rule `.devin/rules/entity-list-pages.md` exists and is referenced from `AGENTS.md`.
8. ✅ No dev servers were killed or duplicated during the work (per dev‑server rule).

## 7. Execution order (when approved)

1. **BE first** (so FE has endpoints to call):
   a. `module-nav-meta.ts` icon changes.
   b. `role-mappings.meta.ts` + `RoleMappingsDal` (using `findByPage`) + `RoleMappingsService` + full entity CRUD routes + permissions check.
   c. `pnpm run build` to verify BE compiles.
2. **FE translations** (independent, parallelizable with BE):
   a. Add all keys to all 6 locale files.
   b. `pnpm run check`.
3. **FE nav unification + icons**:
   a. `breadcrumb/types.ts` icon field.
   b. `AppPageBreadcrumb.svelte` icon rendering.
   c. `settings-breadcrumb.ts` rewrite to read from `shellNav`.
   d. Verify `shellNav` loads settings module nav on settings routes.
   e. `pnpm run check` + visual check on a running dev server (reuse existing, do not start a new one).
4. **FE roles list refactor**:
   a. Rewrite `roles/+page.svelte` to `EntityListTable` pattern.
   b. `pnpm run check` + manual click‑through on the existing dev server.
5. **Enforcing rule**:
   a. Create `.devin/rules/entity-list-pages.md`.
   b. Append pointer in `AGENTS.md`.
6. **Final verification**: `pnpm run check` (FE), `pnpm run build` (BE). Report results. Do NOT commit (per AGENTS.md — wait for user).

## 8. Risks / open questions

- **`shellNav` load timing on settings routes:** if the settings module nav is not loaded before the breadcrumb renders, the dropdown will be empty on first paint. Mitigation: ensure the app layout (or a settings `+layout.ts` load function) awaits `shellNav.selectModule("settings")` before rendering children. Need to confirm during execution how `syncModuleFromRoute` currently treats `/system/settings/*`.
- **`role_mappings` list paging — RESOLVED:** the DAL generic helper `findByPage` at `primebrick-dal-v3/src/repository/repository.ts:236‑272` works with any entity having `@Key()` and returns `{ entities, total_records }` with paging/sort/filter/search via `FindOptions`. `RoleMappingEntity` has `@Key()` on `id: bigint`. The implementation mirrors `OrganizationsDal.listOrganizations()` → `repo.findByPage()` exactly. No custom repo method, no custom DAL. Now that `deleted_at` is added, `deletedRecords` filtering works fully (matching orgs/users).
- **Entity key standard — RESOLVED:** `RoleMappingEntity` was missing the standard `uuid` column and soft‑delete columns that both `OrganizationEntity` and `UserProfileEntity` have. Per the project rule (`user_profile_entity.ts` line 18: *"bigserial PKs are never exposed externally, `id` is internal-only; only `uuid` is ever surfaced via API"*), the entity CRUD routes and `EntityListTable.uid` MUST use `uuid`, NOT `id`. The plan now adds `uuid` + `deleted_at` + `deleted_by` to `RoleMappingEntity` (with a DB migration + backfill) and keys all entity routes by `:uuid`. `idp_role` remains as the Casdoor sync key (analogous to `idp_code`), shown in the form, immutable after creation — but it is NOT the API/URL key.
- **`permissions` jsonb column in EntityListTable:** the column type for a jsonb array is not a standard `MetaColumn` type. Plan: render it as a count (`permissions.length`) in the list, with the detailed array visible only on the edit page. Confirm `MetaColumn.type` supports a suitable type (e.g. `text` with a custom cell snippet) during execution.
- **Translations quality:** non‑English translations will be authored by the AI; if a human translator review is required, flag it. The plan adds them so the UI is not broken; review can happen post‑merge.
