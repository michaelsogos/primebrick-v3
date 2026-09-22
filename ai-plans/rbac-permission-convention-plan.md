# RBAC Permission Convention — Unification & Enforcement Plan

**Status:** DRAFT — awaiting approval
**Scope:** `primebrick-v3-sdk`, `primebrick-be-v3`, `primebrick-us-v3` (emailsender), `primebrick-fe-v3` (meta consumption), `primebrick-v3-docs` (user-guide mdx)
**Date:** 2026-09-19

---

## 1. Objectives

1. Make the permission namespace **mechanically derivable** from the entity name:
   `{module_prefix?}.{entity}.{action}.{qualifier}` — so that future entity-generation
   (codegen of SQL patches, endpoints, meta, permissions) is deterministic.
2. **Delete** dead permissions (`profile.*`) and **rename** off-standard ones
   (`users.*`, `userprofile.*`, `translations.manage`, `emailsender.providers.*`,
   `role_mappings.*`, `auth_events.*`, `organizations.*`, `customers.*` stay as decided below).
3. **Pre-create the full standard permission set for every entity**, even when no
   endpoint uses it yet (admin-gating remains the enforcement posture until
   coordinators/roles exist — per owner decision).
4. Add a **CI route-audit test** that walks every declared route and asserts the
   permission strings follow the convention + sentinel rules.
5. Add **`supported_operations` to entity meta** (BE + US) and have the FE
   `EntityListTable`/`BulkActions` consume it — fixing the current bug where bulk
   buttons appear on org/user pages and hit non-existent endpoints (404).

---

## 2. Empirical findings (verified 2026-09-19)

### 2.1 Source of truth layers

| Layer | File / location | Role |
|---|---|---|
| Permission catalog | `primebrick-v3-sdk/src/auth/permissions.ts` (`Permission` const) | Compile-time registry; served to FE via `GET /api/v1/system/permissions` → `listNonSentinelPermissions()` (`system-router.ts:64-89`) |
| Role→perm grants | `public.role_mappings.permissions` (jsonb) + `public.api_keys.permissions` (jsonb) | Runtime grants; supports `*` wildcards |
| Endpoint declarations | BE: `rbacHandler([...])` per route; US: `enforceHttpRbac`/`enforceNatsRbac` | Required perms per route |
| MCP dispatch | `primebrick-be-v3/src/modules/mcp/tools/entity-registry.ts` | module+entity → op → perms |

### 2.2 Usage map (current → per entity)

| Entity (path segment) | Current perms used | Endpoint locations |
|---|---|---|
| `customer` | `customers.*` full set (13 perms) | `customers/router.ts` — complete template incl. bulk/export/duplicate |
| `organization` | `organizations.{read.all,read.single,read.audit,create.single,update.single,delete.single,restore.single}` (7) | `organizations.router.ts` — **no bulk/export endpoints** |
| `user_profile` | `users.{read.all,read.single,create.single,update.single,delete.single,restore.single}` + `userprofile.read.audit` | `user-profiles.router.ts` (6 routes), `users.router.ts` (`/api/v1/auth/users` create/update — special non-entity path), `auth-invitation.router.ts` (revoke/resend → `USERS_UPDATE_SINGLE`) — **no bulk endpoints** |
| `auth_event` | `auth_events.read.all` (plural) | No HTTP router — MCP `entity-registry.ts` only (list/aggregate/meta) |
| `role_mapping` | `role_mappings.{read.all,read.single,read.audit,create,update,delete}` (plural, no `.single`) | `role-mappings.router.ts` — `/api/v1/entities/role_mapping/...` + `/api/v1/system/role-mappings` alias routes |
| `translation` | `translations.manage` (coarse, plural) | `translations-router.ts` — `/api/v1/entities/translation/...` (list/create/update/delete/restore; `?module=` query param, per-module schemas) |
| `provider` (emailsender) | `emailsender.providers.{read.all,read.single,create,update,delete}` (plural) | `primebrick-us-v3/emailsender/src/server/providers-route.ts` — `/api/v1/entities/provider/...` |
| `config_entry` (emailsender) | `modules.config.read`, `modules.config.update` | `primebrick-us-v3/emailsender/src/server/config-route.ts` — `/api/v1/entities/config_entry/...` |
| modules registry | `modules.{read.all,read.single,update.single,delete.single}` | `system-router.ts`, `index.ts` — `/api/v1/modules`, `/api/v1/modules/:code/meta` (NOT entity paths) |
| n/a (action perms) | `emailsender.send` (NATS handler), `emailsender.log.create` (webhook) | `emailsender/src/nats/handlers.ts`, `webhook-route.ts` |
| n/a (dead) | `profile.read`, `profile.update` | **Nowhere** — `/api/v1/auth/me` uses `AUTHENTICATED_USER` |

### 2.3 DB state

- Seeded `role_mappings`: only `administrators` (`is_admin=true`, `[]`) and
  `auth_auditor` (`["auth_events.read.all"]`) — `init_database.sql:692,716`.
- Live DBs may contain admin-created rows holding old strings.
- **OWNER DECISION: DO NOT migrate DB data.** No fire-and-forget SQL on
  `role_mappings.permissions` or `api_keys.permissions`. Old strings become
  inert after the rename — they simply never match a declared endpoint
  permission, so affected roles lose those grants until an admin edits and
  re-saves the role in the Settings > Roles UI (which writes the new strings
  picked from the `/api/v1/system/permissions` catalog). Same for API keys:
  re-issue/edit via the normal management flow.
- The `auth_auditor` seed must be updated in `init_database.sql` to
  `["auth_event.read.all"]` for fresh installs (seed source edit only — not a
  data migration on existing DBs).

### 2.4 FE state

- **Zero hardcoded permission strings** — role form renders catalog from
  `GET /api/v1/system/permissions`; label keys `system.settings.roles.permissions.{perm}`
  (no per-perm translation keys seeded → no seed updates strictly required).
- `BulkActions.svelte` visibility is driven by `meta.list.rowActions.{delete,duplicate,export}`;
  `bulkRestore` button is **unconditional**. `useBulkActions` calls
  `/api/v1/entities/{entity}/bulk-delete|bulk-restore|duplicate` generically →
  org/user_profile pages **currently offer buttons that 404**.
- `supported_operations` exists ONLY in the US emailsender `config_entry` meta
  (`config-route.ts:94`); BE metas (`customerMeta`, `organizationMeta`,
  `userProfileMeta`, `role_mappings.meta`) do not declare it.

### 2.5 Docs containing permission strings (need updates)

- `primebrick-be-v3/docs/user-guide/rbac.mdx` (canonical permission tables + migration example)
- `primebrick-be-v3/docs/user-guide/authentication.mdx` (lines 71,104 use `users.*`)
- `primebrick-be-v3/docs/user-guide/api-conventions.mdx` (line 66: `translations.manage.*`)
- `primebrick-be-v3/docs/modules/auth-rbac.md` (stale: `CUSTOMERS_LIST`, `AUDIT_READ`, `CUSTOMERS_DELETE` — pre-existing drift, fix in passing)
- `primebrick-v3-sdk/docs/user-guide/api-reference.mdx` (TypeDoc-generated enum dump — regenerate via `pnpm extract-docs`)
- `primebrick-us-v3/docs/user-guide/services/emailsender.mdx`, `architecture.mdx`
- `primebrick-be-v3/db-meta/fire-and-forget/add_emailsender_permissions.sql` (comment-only doc)

---

## 3. Decisions (confirmed with owner)

| # | Question | Decision |
|---|---|---|
| 1 | US entity namespace | `emailsender.provider.*` — module prefix + **singular** entity |
| 2 | Missing perms | **Full standard set for every entity now** (perms exist even if unused); bulk endpoints NOT implemented in this change |
| 3 | translations.manage | Replace with full `translation.*` set |
| 4 | Enforcement | **Both**: CI route-audit test + `supported_operations` in meta consumed by FE |

---

## 4. The standard (to be documented as convention)

### 4.1 Permission grammar — ROP/WOP split

```
{scope}.{action}.{cardinality}

scope       = the ENTITY (the object you grant on — never the collection):
              snake_case SINGULAR, identical to the entity path segment.
              You give permission to an entity, not to entities —
              `customer.read.all` = "read all customer objects", not
              "permission on the customers collection".
              For microservice entities, module-prefixed: {module}.{entity}
action      = read | export            → ROPs (read operations)
              create | update | delete | restore | duplicate → WOPs (write operations)
cardinality = BOUNDED PER ACTION — not free-form (see table)
action-perms (non-entity) = {module}.{verb} e.g. emailsender.send, emailsender.log.create
sentinels = _public | _authenticated_user | _authenticated_admin (unchanged)
core specials (non-entity) = modules.* | modules.config.* (registry + module config)
```

Cardinality is closed per operation class — the audit test validates against
this table, not an open list:

| Action | Class | Allowed cardinality | Forbidden (grammar-level) |
|---|---|---|---|
| `read` | ROP | `single`, `all`, `audit` | `bulk` (use `export` — bulk read is a different representation, not a read variant) |
| `export` | ROP | *(none — inherently set-scoped)* | `single`, `all`, `bulk` (qualifier adds noise) |
| `create` | WOP | `single`, `bulk` | `all`, `audit` |
| `update` | WOP | `single`, `bulk` | `all`, `audit` |
| `delete` | WOP | `single`, `bulk` | `all`, `audit` |
| `restore` | WOP | `single`, `bulk` | `all`, `audit` |
| `duplicate` | WOP | `single`, `bulk` | `all`, `audit` (duplicate creates rows → it is a write op) |

### 4.2 Canonical 14-permission set per CRUD entity

```
ROPs:  {E}.read.single   {E}.read.all    {E}.read.audit   {E}.export
WOPs:  {E}.create.single {E}.create.bulk
       {E}.update.single {E}.update.bulk
       {E}.delete.single {E}.delete.bulk
       {E}.restore.single {E}.restore.bulk
       {E}.duplicate.single {E}.duplicate.bulk
```

Where `{E}` = entity path segment (e.g. `customer`, `organization`,
`user_profile`, `role_mapping`, `translation`, `auth_event`,
`emailsender.provider`).

### 4.3 Rename map (SDK `Permission` const)

**Naming rules (both are part of the standard — mechanical, not free choice):**

- Permission **string** (runtime value — DB, JWT check, FE catalog):
  always `lowercase.dotted` — e.g. `user_profile.read.all`
- TypeScript **const name** (compile-time identifier only, never serialized):
  always `UPPER_SNAKE`, mechanically derived:
  `CONST = string.toUpperCase().replaceAll('.', '_')` —
  e.g. `emailsender.provider.create.single` → `EMAILSENDER_PROVIDER_CREATE_SINGLE`

| Old string | New string | Old const | New const |
|---|---|---|---|
| `users.read.all` | `user_profile.read.all` | `USERS_READ_ALL` | `USER_PROFILE_READ_ALL` |
| `users.read.single` | `user_profile.read.single` | `USERS_READ_SINGLE` | `USER_PROFILE_READ_SINGLE` |
| `users.create.single` | `user_profile.create.single` | `USERS_CREATE_SINGLE` | `USER_PROFILE_CREATE_SINGLE` |
| `users.update.single` | `user_profile.update.single` | `USERS_UPDATE_SINGLE` | `USER_PROFILE_UPDATE_SINGLE` |
| `users.delete.single` | `user_profile.delete.single` | `USERS_DELETE_SINGLE` | `USER_PROFILE_DELETE_SINGLE` |
| `users.restore.single` | `user_profile.restore.single` | `USERS_RESTORE_SINGLE` | `USER_PROFILE_RESTORE_SINGLE` |
| `userprofile.read.audit` | `user_profile.read.audit` | `USER_PROFILE_READ_AUDIT` | (value change only) |
| `auth_events.read.all` | `auth_event.read.all` | `AUTH_EVENTS_READ_ALL` | `AUTH_EVENT_READ_ALL` |
| `role_mappings.read.all` | `role_mapping.read.all` | `ROLE_MAPPINGS_READ_ALL` | `ROLE_MAPPING_READ_ALL` |
| `role_mappings.read.single` | `role_mapping.read.single` | `ROLE_MAPPINGS_READ_SINGLE` | `ROLE_MAPPING_READ_SINGLE` |
| `role_mappings.read.audit` | `role_mapping.read.audit` | `ROLE_MAPPINGS_READ_AUDIT` | `ROLE_MAPPING_READ_AUDIT` |
| `role_mappings.create` | `role_mapping.create.single` | `ROLE_MAPPINGS_CREATE` | `ROLE_MAPPING_CREATE_SINGLE` |
| `role_mappings.update` | `role_mapping.update.single` | `ROLE_MAPPINGS_UPDATE` | `ROLE_MAPPING_UPDATE_SINGLE` |
| `role_mappings.delete` | `role_mapping.delete.single` | `ROLE_MAPPINGS_DELETE` | `ROLE_MAPPING_DELETE_SINGLE` |
| `translations.manage` | *(deleted — replaced by `translation.*` set)* | `TRANSLATIONS_MANAGE` | — |
| `organizations.*` | `organization.*` (all 7 existing) | `ORGANIZATIONS_*` | `ORGANIZATION_*` |
| `customers.*` | `customer.*` (all 13) | `CUSTOMERS_*` | `CUSTOMER_*` |
| `emailsender.providers.read.all` | `emailsender.provider.read.all` | `EMAILSENDER_PROVIDERS_READ_ALL` | `EMAILSENDER_PROVIDER_READ_ALL` |
| `emailsender.providers.read.single` | `emailsender.provider.read.single` | `EMAILSENDER_PROVIDERS_READ_SINGLE` | `EMAILSENDER_PROVIDER_READ_SINGLE` |
| `emailsender.providers.create` | `emailsender.provider.create.single` | `EMAILSENDER_PROVIDERS_CREATE` | `EMAILSENDER_PROVIDER_CREATE_SINGLE` |
| `emailsender.providers.update` | `emailsender.provider.update.single` | `EMAILSENDER_PROVIDERS_UPDATE` | `EMAILSENDER_PROVIDER_UPDATE_SINGLE` |
| `emailsender.providers.delete` | `emailsender.provider.delete.single` | `EMAILSENDER_PROVIDERS_DELETE` | `EMAILSENDER_PROVIDER_DELETE_SINGLE` |
| `profile.read`, `profile.update` | **deleted** | `PROFILE_READ`, `PROFILE_UPDATE` | — |
| `modules.*`, `modules.config.*`, `emailsender.send`, `emailsender.log.create` | unchanged | — | — |

> **RESOLVED:** `customers.*` → `customer.*` and `organizations.*` →
> `organization.*` are singularized. The scope is the object granted on, not
> the collection — permission scope == entity path segment, always singular.

### 4.4 New permissions to add (unused-but-registered)

| Entity | Additions to reach the full 14-perm set |
|---|---|
| `customer` | `duplicate.single` (1) — everything else exists |
| `organization` | `create.bulk`, `update.bulk`, `delete.bulk`, `restore.bulk`, `export`, `duplicate.single`, `duplicate.bulk` (7) |
| `user_profile` | `read.audit` (rename of `userprofile.read.audit`), `create.bulk`, `update.bulk`, `delete.bulk`, `restore.bulk`, `export`, `duplicate.single`, `duplicate.bulk` |
| `role_mapping` | `create.bulk`, `update.bulk`, `delete.bulk`, `restore.single`, `restore.bulk`, `export`, `duplicate.single`, `duplicate.bulk` — **note:** role_mappings uses HARD DELETE (documented deviation); `restore.*` may be semantically void — owner to confirm whether to include anyway for set-uniformity or declare entity-level exceptions |
| `auth_event` | read-only audit entity → owner decision: full set anyway (uniform codegen) vs restricted set `{read.single, read.all, read.audit, export}` (ROPs only — the ROP/WOP split makes "read-only entity" a natural restricted profile, not a bespoke exception) |
| `translation` | full set; routes map: list→`read.all`, create→`create.single`, update→`update.single`, delete→`delete.single`, restore→`restore.single` |
| `emailsender.provider` | `read.audit`, `create.bulk`, `update.bulk`, `delete.bulk`, `restore.single`, `restore.bulk`, `export`, `duplicate.single`, `duplicate.bulk` |
| `config_entry` | **exception by design** — stays `modules.config.read`/`modules.config.update` (core concept, not entity-derived) |

> The ROP/WOP split also gives a clean vocabulary for restricted entities:
> `read-only` profile = the 4 ROPs; `no-bulk` profile = ROPs + `*.single` WOPs;
> `full` profile = all 14. These profiles can become the codegen knob for the
> future entity-creation page.

---

## 5. Implementation phases

### Phase A — SDK (`primebrick-v3-sdk`)

1. Rewrite `src/auth/permissions.ts` `Permission` const per §4.3–4.4 (renames,
   deletions, additions). Keep sentinel block and `modules.*`/`modules.config.*`
   unchanged. Order by entity for readability.
2. Add a `PERMISSION_GRAMMAR` doc comment block describing §4.1–4.2 (the contract
   codegen will target).
3. Update `src/auth/__tests__/permissions.test.ts` and `rbac.test.ts` for renamed
   values.
4. `pnpm run build && pnpm test`; `pnpm extract-docs` to refresh
   `docs/user-guide/_extracted/api.json` + `api-reference.mdx`.

### Phase B — BE (`primebrick-be-v3`)

1. Mechanical rename of `Permission.*` constants across:
   - `src/modules/auth/routers/user-profiles.router.ts` (7 sites)
   - `src/modules/auth/routers/users.router.ts` (3 sites)
   - `src/modules/auth/routers/auth-invitation.router.ts` (`USERS_UPDATE_SINGLE` ×2)
   - `src/modules/auth/routers/organizations.router.ts` (9 sites)
   - `src/modules/auth/routers/role-mappings.router.ts` (12 sites)
   - `src/modules/auth/routers/config-entries.router.ts` (sentinels only — no change)
   - `src/modules/customers/router.ts` (12 sites)
   - `src/modules/system/translations-router.ts` (`TRANSLATIONS_MANAGE` ×5 →
     `TRANSLATION_*` per-route: list→`READ_ALL`, create→`CREATE_SINGLE`,
     update→`UPDATE_SINGLE`, delete→`DELETE_SINGLE`, restore→`RESTORE_SINGLE`)
   - `src/modules/system/system-router.ts` (`MODULES_*` unchanged)
   - `src/modules/mcp/tools/entity-registry.ts` (customer/organization/
     user_profile/auth_event blocks)
   - `src/index.ts` (`MODULES_READ_ALL` unchanged)
   - tests: `rbac-admin-gate.test.ts`, `rbac-middleware.test.ts`
2. **`actions` array in `/meta` — derived, not hand-written.** See Phase D.1
   for the full model: `/meta` emits `actions: [{op, permissions, enabled}]`
   computed from registered routes + `actions_overrides` deltas from `*.meta.ts`
   (`rowActions`/`enableCreateAction` migrated into overrides and removed —
   breaking meta-shape change, BE+FE ship together). The US emailsender
   `config-route.ts` `supported_operations` (hand-written string list) is
   migrated to the same `actions` shape — or kept hand-written but asserted
   against registered handlers in its test suite (US services lack the
   `PERMISSION_DECLARED` marker machinery; simplest path: declare + CI-assert).
3. **Seed source update only (NO data migration):** edit the `auth_auditor`
   seed in `db-meta/patches/00000000000000_init_database.sql:716` from
   `["auth_events.read.all"]` to `["auth_event.read.all"]`. Per the repo's
   sha256 rule, editing a shipped patch requires updating the registry hash
   on existing DBs — follow `.devin/rules/patch-sha256-management.md`.
   Existing deployments keep their old strings untouched (inert grants —
   see §2.3).
4. Update `docs/user-guide/{rbac,authentication,api-conventions}.mdx` +
   `docs/modules/auth-rbac.md` stale examples.

### Phase C — US (`primebrick-us-v3`)

1. `emailsender/src/server/providers-route.ts` — rename 7 `EMAILSENDER_PROVIDERS_*`
   → `EMAILSENDER_PROVIDER_*` (+`.single` suffixes).
2. `config-route.ts`, `webhook-route.ts`, `nats/handlers.ts` — `MODULES_CONFIG_*`,
   `EMAILSENDER_LOG_CREATE`, `EMAILSENDER_SEND` unchanged.
3. Update `emailsender/db-meta/fire-and-forget/add_emailsender_permissions.sql`
   comments (or supersede with the BE rename script).
4. Update `docs/user-guide/services/emailsender.mdx` + `architecture.mdx`.

### Phase D — FE (`primebrick-fe-v3`) — unified `actions` model

Refactors entity meta from per-component config (`rowActions` was designed for
`EntityListTable` only) to a **per-entity action contract**. One array, each
entry self-describing; three axes collapse into three states per op:

```
actions: [
  { op: "list",          permissions: ["organization.read.all"],                             enabled: true  },
  { op: "get",           permissions: ["organization.read.single","organization.read.all"],  enabled: true  },
  { op: "delete.single", permissions: ["organization.delete.single"],                        enabled: true  },
  { op: "delete.bulk",   permissions: ["organization.delete.bulk"],                          enabled: false },
  // "duplicate.*" absent entirely → no endpoint exists
]
```

| State | Meaning | CTA result |
|---|---|---|
| op absent | no endpoint exists (existence axis) | never rendered |
| `enabled: false` | endpoint exists, product hides it for everyone (visibility axis) | never rendered |
| `enabled: true` | endpoint exists + shown | rendered; per-user `is_admin \|\| perm match` → enabled or disabled-with-tooltip (enablement axis) |

**D.1 BE — derived actions + overrides.** `/meta` computes `actions` by walking
the entity's registered routes (`PERMISSION_DECLARED` data; `method + path
suffix → op`: `GET /list`→`list`, `GET /:uuid`→`get`, `POST /`→`create.single`,
`PUT /:uuid`→`update.single`, `DELETE /:uuid`→`delete.single`,
`POST /:uuid/restore`→`restore.single`, `POST /bulk-delete`→`delete.bulk`,
`POST /bulk-restore`→`restore.bulk`, `GET /export`→`export`,
`POST /duplicate`→`duplicate.bulk`, `GET /:uuid/audit`→`read.audit`).
`permissions` are copied verbatim from the route declaration (OR-groups like
`get` → `[read.single, read.all]` preserved — FE never infers perms from op
names). `enabled` defaults `true`; `*.meta.ts` keeps a small hand-written
`actions_overrides: { "delete.bulk": { enabled: false } }` delta for product
visibility. Legacy `rowActions`/`enableCreateAction` fields are migrated into
overrides and removed (breaking change to meta shape — FE ships in the same
release). US services without `PERMISSION_DECLARED` machinery keep hand-written
`actions` but must pass a test asserting `meta.actions ⊆ registered handlers`.

**D.2 BE — embed caller permissions in `/auth/me`.** `getMe` response gains
`permissions: string[]` (the expanded set already computed by `authMiddleware` —
reuse it, no extra DB work) alongside the existing `is_admin` flag in profile.
`userProfileStore` type gains `permissions?: string[]`; sessionStorage payload
refreshes on next `/auth/me` fetch (acceptable: role changes take effect on
next login/refresh — same staleness window as today).

**D.3 FE — extend `permissions.svelte.ts` (the existing, currently orphaned
helper — complete it, don't parallel it).**

```ts
// permissionChecks keeps sentinel support (AUTHENTICATED_ADMIN → is_admin)
// AND gains real-perm evaluation against profile.permissions:
enabled = is_admin || required.some(p => isPermissionGranted(userPerms, p))
```

- `isPermissionGranted` (exact + `*` wildcard) is ported to FE — ~15 lines,
  mirrors SDK (FE does not import `@primebrick/sdk` per `lib/api-ext.ts`).
- Signature generalizes: `hasRequiredPermission(required?: string | string[])`
  — single string or OR-array; `undefined` → true, unknown sentinel AND
  non-matching perm → false (fail-closed, unchanged semantics).

**D.4 FE — wire the checker into every CTA (it has zero consumers today).**

- `types.ts`/`TableRow.svelte`: add `requiredPermission?: string | string[]` to
  `customActions` entries (field already emitted by BE meta but stripped by the
  type — bug) and to standard row actions; render when `hasRequiredPermission`.
- `BulkActions.svelte`/`useBulkActions.svelte.ts`: each bulk CTA maps to its op
  (`delete.bulk`, `restore.bulk`, `duplicate.bulk`, `export`); rendered only if
  `actions[op]?.enabled`, enabled per user perms. `bulkRestore` becomes
  conditional like the others (currently unconditional — bug).
- Row dropdown items (preview/edit/delete/restore) map to their ops the same way.
- Legacy fallback when meta has no `actions` (old BE): **fail-closed** for bulk
  CTAs (hide — they 404 anyway), keep row actions as today (fail-open, since
  single ops were historically declared via `rowActions`). **Owner confirm.**

**D.5 `customActions` stay standalone** (own lifecycle: `actionName`, icon,
`disabledWhenDeleted`, `requiredPermission`) — they share only the permission
checker, not the `actions` array. `requiredPermission` accepts sentinel names
AND real perm strings/OR-arrays after D.3.

### Phase E — Convention enforcement test (BE)

New test file `src/modules/auth/__tests__/rbac-convention.test.ts`:

1. Collect every route's declared perms via `PERMISSION_DECLARED` marker
   (already injected by `rbacHandler`) — walk all routers built by
   `makeProtectedRouter()`/route tables.
2. Assert for each non-sentinel declared perm:
   - it exists in `listNonSentinelPermissions()`;
   - its scope (everything before the action segment) equals the entity segment
     of the route path (`/api/v1/entities/{entity}/...`), or is in an explicit
     allowlist of non-entity scopes (`modules`, `modules.config`, action perms);
   - its `{action}.{cardinality}` suffix is valid per the ROP/WOP table in §4.1
     — i.e. `read.bulk`, `create.all`, `export.single`, `*.audit` on WOPs are
     rejected even though they are structurally well-formed.
3. Assert sentinels appear alone (already runtime-enforced — belt & braces).
4. Assert every perm in `listNonSentinelPermissions()` that is entity-scoped
   matches the grammar (guards the registry itself, not just routes).

### Phase F — Docs / registration contract

- Document §4 as the binding convention in `primebrick-be-v3/docs/user-guide/rbac.mdx`
  and the US `api-path-conventions` rule file — this becomes the spec the future
  entity-generation page + NATS module registration must emit.

---

## 6. Risks & edge cases

| Risk | Mitigation |
|---|---|
| Live DBs hold old strings in `role_mappings`/`api_keys` → those grants stop matching after rename (inert, NOT migrated by design) | Accepted behavior: admin re-saves the role via Settings > Roles UI to re-grant with new strings; document in release notes |
| `users.*` / `translations.manage` wildcards in live roles | Become inert like exact strings — same re-grant path via UI |
| `role_mapping.restore.*` / `auth_event.*` full set semantically void | **Owner decision** — uniform set vs declared exceptions |
| `actions` array is a breaking meta-shape change (replaces `rowActions`/`enableCreateAction`) | BE+FE ship in the same release; US metas migrated in the same change |
| FE perms staleness: `/auth/me` payload cached in sessionStorage — role changes take effect on next login/refresh | Same staleness window as today's role_names; document |
| US services run older SDK version during rolling deploy | Version coordination: SDK release first, BE+US bump together |
| `role_mapping` hard-delete entity — `restore.*` in catalog shown in FE role UI | Acceptable (perm exists, no endpoint), consistent with "perms precede endpoints" principle |

## 7. Acceptance criteria

- [ ] `pnpm test` green in SDK, BE, US
- [ ] New `rbac-convention.test.ts` passes and **fails** if an off-standard perm is declared (verified by a deliberate negative case in the test)
- [ ] `GET /api/v1/system/permissions` returns only convention-compliant strings
- [ ] Org list page: bulk-delete button hidden (supported_operations-driven), no 404 path reachable from UI
- [ ] `init_database.sql` `auth_auditor` seed updated; registry hash updated per patch-sha256 rule on existing DBs
- [ ] `docs/user-guide/rbac.mdx` documents the grammar + canonical set

## 8. Open questions for owner

1. ~~Singularize `customers.*`→`customer.*` and `organizations.*`→`organization.*`?~~ **RESOLVED — YES.** Scope names the entity object, not the collection; always singular, always equal to the entity path segment.
2. `role_mapping` restore perms: include for uniformity or declare entity exception?
3. `auth_event`: full 14-perm set, ROP-only profile (`read.single/.all/.audit` + `export`), or declared exception?
4. ~~`translations.manage` grants in live DBs → map to wildcard or expand?~~ **RESOLVED — no DB migration; grants go inert and are re-granted via UI.**
5. FE legacy-meta fallback (meta without `actions` — old BE during rolling deploy): plan proposes **fail-closed for bulk CTAs** (they'd 404 anyway), **fail-open for row actions** (historically declared via `rowActions`) — confirm.
6. Non-standard ops like `organization/check-availability`: do they get `op` entries in `actions` (free-form op names beyond the canonical set), or stay outside the contract?
