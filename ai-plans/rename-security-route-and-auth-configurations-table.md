# Plan: `/security`→`/configurations` route + `auth_configurations`→`config_entries` table + API entity segments → singular (cross-repo)

## Objective

1. FE route `/system/settings/security` → `/system/settings/configurations` (incl. `/create` subroute).
2. BE table `public.auth_configurations` → `public.config_entries`, audit → `config_entries_audit`. **`config_entries` is the new cross-schema standard name** for the per-module Config Table (key/value dictionary): default when a module doesn't declare its own name; renamable per schema if a module legitimately needs a different one.
3. **API entity segments → singular everywhere** (per `api-path-conventions.md`): `/entities/config_entries` → `/entities/config_entry`, `/entities/user_profiles` → `/entities/user_profile`, `/entities/role_mappings` → `/entities/role_mapping`, `/entities/providers` → `/entities/provider` (emailsender), plus any other plural stragglers (`entities/customers` dup → `customer`, `entities/items` → verify). This is a **breaking change** — plan includes compat/alias strategy + consumer sweep (FE api.ts, MCP dispatch, E2E, docs).
4. Align de-standardized microservices: `emailsender.config` → `emailsender.config_entries`, `ai.config` → `ai.config_entries`.
5. Rewrite ALL historical `fire-and-forget` SQL scripts that reference `auth_configurations` (user decision: full-repo consistency, no dead references).
6. DRY: extract the shared "Config Table standard" surface (entity naming, DAL conventions, FE ConfigList wiring) so modules stop drifting.

## Decisions (user-confirmed)

| Decision | Choice |
|---|---|
| New table name | `config_entries` — PG tables stay plural per naming convention; entity API segment becomes singular `config_entry`. |
| New FE route | `/system/settings/configurations` — tab label becomes "Configurations" (nav `id`/`label_key` updated). |
| Historical SQL scripts | Rewrite all of them to the new name. |
| API entity segment | **Singular everywhere** — full refactor per `api-path-conventions.md`, `config_entry` included. |

### Naming standard going forward (documented in AGENTS.md)

| Layer | Name | Example |
|---|---|---|
| PG table (any schema) | `config_entries` (plural) | `public.config_entries`, `emailsender.config_entries`, `ai.config_entries` |
| Audit table | `config_entries_audit` | `public.config_entries_audit` |
| API entity segment | `config_entry` (**singular**) | `/api/v1/entities/config_entry/...` |
| OpenAPI operationId | snake_case plural-ish verbs | `list_config_entries`, `get_config_entry` (match existing style: `list_providers`/`get_provider` — verify) |
| FE ConfigList page | route-specific | `/system/settings/configurations`, `/system/settings/modules/[code]` |
| Module override | allowed per schema | a module MAY declare a different table name, but the DEFAULT is `config_entries` |

### Empirical API-segment audit (current state — the debt)

Singular (rule-conformant): `customer`, `organization`, `ai_model`, `translation`.
Plural (debt): `config_entries`, `user_profiles`, `role_mappings`, `providers` (emailsender), `customers` (6 occorrenze — verify if duplicate/alias of `customer`), `items` (2 occorrenze — verify what it is).

| Current | New | Verb set |
|---|---|---|
| `/entities/config_entries/*` | `/entities/config_entry/*` | meta, list, :uuid, POST, PUT, bulk-update, DELETE, bulk-delete, restore, audit |
| `/entities/user_profiles/*` | `/entities/user_profile/*` | meta, list, :uuid, PUT, restore, audit, change-password |
| `/entities/role_mappings/*` | `/entities/role_mapping/*` | verify verb set |
| `/entities/providers/*` (emailsender) | `/entities/provider/*` | per `api-path-conventions.md` migration table |
| `/entities/customers` (6 hits) | `/entities/customer` | verify if real route or alias |
| `/entities/items` (2 hits) | TBD | verify what registers it |

**Breaking-change strategy** (user-decided): **hard cut, atomic cross-repo** — singular only, all consumers (FE api.ts, MCP, E2E, docs agent + user-guide) updated in the same coordinated commit set. No dual-registration aliases.

## Evidence gathered (empirical)

### BE (`primebrick-be-v3`)

**Files referencing `auth_configurations` / `AuthConfigurations`** (24 code/doc files):
- `src/modules/auth/auth_configurations_dal.ts` — DAL class `AuthConfigurationsDal`, errors `ReservedConfigError`/`ReservedConfigTypeError`, Redis key `"dal:auth_configurations:list"`
- `src/modules/auth/auth_configuration_entity.ts` — `@Entity("auth_configurations")` (mikro-orm? verify ORM)
- `src/modules/auth/config-repo.ts` — `loadAuthConfig` reads table via DAL; error strings `[auth] ... missing in auth_configurations table`
- `src/modules/auth/routers/config-entries.router.ts` — thin controller, `tableName: "auth_configurations_audit"` for audit endpoint, 10 routes under `/entities/config_entries/*` (→ singular)
- `src/modules/auth/config-entries.meta.ts` — entity meta `entity: "config_entries"` → must become `"config_entry"` (entity name drives MCP dispatch + meta endpoint)
- `src/modules/auth/router.ts` — mounts the router
- `src/modules/auth/sdk-auth-ports.ts`, `password-policy.ts`, `services/{auth-session,casdoor,invitation,mfa}.service.ts` — DAL consumers/comments
- `src/modules/ai-models/ai_models_dal.ts` — references (verify what — probably the same table for `ai_assistant_model` key reads)
- `src/cache/cache-port-holder.ts`, `src/db/repository-factory.ts`, `src/http/api-errors.ts`, `src/index.ts` — wiring
- Tests: `src/modules/auth/__tests__/config-entries-router.test.ts`, `services/__tests__/mfa-service.test.ts`
- Docs: `docs/user-guide/{authentication,environment-configuration,collaboration,overview}.mdx`, `AGENTS.md` (Config Table Standard section)

**SQL surface**:
- `db-meta/patches/00000000000000_init_database.sql` — CREATE TABLE `auth_configurations` + `auth_configurations_audit` + 3 indexes + partman parent registration + seed INSERT + audit seed. **Patch is hash-registered** in `primebrick_database_patches` — editing it requires a sha256 registry update script (precedent exists: `fire-and-forget/update_init_patch_sha256_consolidate.sql`).
- ~15 `db-meta/fire-and-forget/*.sql` referencing the table (seed_ai_assistant_model, change_default_ai_model_*, consolidate_config_error_keys, rename_*_config_type, add_config_table_standard_columns, migrate_to_transformersjs_models, etc.) — rewrite all.

**Nav**: `src/modules/module-nav-meta.ts:38` — `{ id: "security", label_key: "system.settings.tabs.security", href: "/system/settings/security", icon: "settings-2" }`. Settings nav is BE-owned; FE renders it dynamically (no hardcoded hrefs in FE nav — verified `settings-breadcrumb.ts` reads `shellNav.moduleNav`).

### FE (`primebrick-fe-v3`)

- `src/routes/(app)/system/settings/security/+page.svelte` — ConfigList page; `$t('system.settings.security.*')` keys; navigates to `/system/settings/security/create`
- `src/routes/(app)/system/settings/security/create/{+page.svelte,+layout@(app).svelte}`
- i18n keys: `system.settings.security.*` (BE translations, seeded in `patches/0000000000000{1..6}_seed_translations_*.sql` + fire-and-forget); `system.settings.tabs.security` (nav label); `en-GB-fallback.json` (2 matches — verify if app.* only per rule)
- E2E: `smart-regex-model-selector.spec.ts`, `config-create-validation.spec.ts`, `config-typed-values.spec.ts` hardcode `/system/settings/security[/create]`
- `SelectableToolbar.svelte` comment mentions `/security`
- `src/lib/api.ts` — calls `/api/v1/entities/config_entries/*` (5 fns: fetchConfigEntries, createConfigEntry, updateConfigEntry, bulkUpdateConfigEntries, deleteConfigEntry, bulkDeleteConfigEntries, restoreConfigEntry) + `fetchModuleConfig`/`updateModuleConfigKey` → `/ws/{code}/entities/config_entries` — **all URLs → singular**
- `modules/[code]/+page.svelte` — module config page using same ConfigList + `fetchModuleConfig` — shared pattern already in place
- Any other FE callers of plural entity paths (`user_profiles`, `role_mappings` in api.ts / composables / e2e) — full sweep in Phase 3b

### US (`primebrick-us-v3`)

- `emailsender`: table `emailsender.config` (no `type`/`type_config`/`reserved`/`group_key` columns — verify against Config Table standard!), indexes `config_*_uq/idx`, entity `ConfigEntryEntity`, route `config-route.ts` exposing `config_entries` API already.
- `ai`: table `ai.config` — same shape (verify columns).
- Both need: table rename migration + entity/DAL table-name update. API paths unchanged.
- Check other US services for stray config tables during impl (`grep CREATE TABLE` across all `db-meta/patches`).

## Execution plan

### Phase 0 — inventory verification (no writes)

- [ ] `grep -rn "auth_configurations\|AuthConfigurations" src/` in BE → build the definitive file list (started above — re-run fresh).
- [ ] `grep -rn "system.settings.security\|settings/security" src/` in FE.
- [ ] `grep -rln "auth_configurations" db-meta/` in BE → every SQL file to rewrite.
- [ ] Verify ORM used for `auth_configuration_entity.ts` (decorator style) and whether table name appears anywhere else (migrations, partman config, pg triggers).
- [ ] Check `emailsender`/`ai` US services for a config audit table (emailsender has none? verify) and whether they conform to Config Table standard columns (`type`, `type_config`, `reserved`, `group_key`) — if not, that's a second de-standardization to note (schema upgrade, not just rename). → **open point: include column alignment or rename only?**

### Phase 1 — DB migration (BE)

1. New fire-and-forget script `rename_auth_configurations_to_config_entries.sql`:
   ```sql
   ALTER TABLE public.auth_configurations RENAME TO config_entries;
   ALTER TABLE public.auth_configurations_audit RENAME TO config_entries_audit;
   ALTER INDEX auth_configurations_key_uq RENAME TO config_entries_key_uq;
   ALTER INDEX auth_configurations_deleted_at_idx RENAME TO config_entries_deleted_at_idx;
   ALTER INDEX auth_configurations_audit_entity_uuid_idx RENAME TO config_entries_audit_entity_uuid_idx;
   ALTER INDEX auth_configurations_audit_action_idx RENAME TO config_entries_audit_action_idx;
   -- pg_partman: update parent registration
   UPDATE partman.part_config SET parent_table = 'public.config_entries_audit'
     WHERE parent_table = 'public.auth_configurations_audit';
   -- (verify partman template/table naming — may need template table rename too)
   ```
   Also handle any FK/trigger names referencing the old table (inspect `init_database.sql` triggers — audit trigger function name probably `auth_configurations_audit_fn` or generic).
2. Update `00000000000000_init_database.sql` in place (new DBs get the right name directly) + sha256 registry update script (`update_init_patch_sha256_*.sql` pattern).
3. Rewrite all `fire-and-forget/*.sql` references: `auth_configurations` → `config_entries`, `auth_configurations_audit` → `config_entries_audit` (careful with `public.` schema-qualified and quoted variants `"public"."auth_configurations"`).

### Phase 2 — BE code rename

- Rename files: `auth_configurations_dal.ts` → `config_entries_dal.ts`, `auth_configuration_entity.ts` → `config_entry_entity.ts`.
- Class: `AuthConfigurationsDal` → `ConfigEntriesDal`.
- `@Entity("auth_configurations")` → `@Entity("config_entries")`.
- Redis key `"dal:auth_configurations:list"` → `"dal:config_entries:list"` (self-healing — old key expires, no migration).
- Audit `tableName` → `config_entries_audit`.
- Error messages/comments/AGENTS.md/docs: `auth_configurations` → `config_entries`.
- Tests: update mocks + assertions.
- `module-nav-meta.ts`: `{ id: "configurations", label_key: "system.settings.tabs.configurations", href: "/system/settings/configurations", icon: "settings-2" }` — decide icon. → **open point**.
- Translations: fire-and-forget renaming keys `system.settings.security.*` → `system.settings.configurations.*` + `system.settings.tabs.security` → `system.settings.tabs.configurations` (+ all 6 seed patches). Verify translations PK/immutability first.

### Phase 2b — BE API singularization (breaking)

- `config-entries.router.ts`: all 10 paths `/entities/config_entries/*` → `/entities/config_entry/*`; meta `entity: "config_entries"` → `"config_entry"`.
- `user-profiles.router.ts`: `/entities/user_profiles/*` → `/entities/user_profile/*` (+ meta `entity` field, `change-password` sub-action).
- `role-mappings` router: same treatment (find file + verify verb set).
- `entities/customers` 6 hits → verify if real second registration or comments/tests; if real alias, drop in favor of `customer`.
- `entities/items` → identify owner, rename to singular.
- MCP server: verify how tool dispatch builds entity paths (`src/modules/mcp/tools/openapi-discovery.ts` reads OpenAPI `operationId`/paths?) — singularization must flow through automatically; add test.
- OpenAPI spec: regenerate/verify `operationId`s stay snake_case consistent.

### Phase 2c — Non-standard endpoint surface (full de-standardization sweep)

Empirical dump of ALL registered BE paths (`grep path:`) — beyond plural segments, these deviate from the 4-category convention:

**1. `/api/v1/auth/*` — parallel namespace outside `/entities` and `/actions`** (31 paths): `login`, `refresh`, `me`, `mfa/*`, `webauthn/*`, `welcome/*`, `invitations/:uuid/resend|revoke`, `users`. **DECIDED (user, option B)**: bless `auth` as a documented domain namespace — `auth/users` is lifecycle *orchestration* (Casdoor identity + local profile + invitation_uuid), not row CRUD. Convention gains a Category 5: "Domain namespaces" — `/api/v1/<domain>/*` allowed for cross-resource orchestration domains (auth). Document the boundary rule: `entities/*` = row CRUD, `auth/*` = lifecycle/domain orchestration.
- `/auth/config` verified empirically: returns ONLY `{enable_webauthn, passkey_required, enable_mfa}` — pure auth-topic → **stays**. (Public translations are already correctly under `/api/v1/system/translations/public/:language` — different endpoint, correct namespace.)

**2. `/api/v1/system/role-mappings[/:idp_role]`** — **DECIDED (user)**: keep as documented. It is a full duplicate CRUD keyed by `idp_role` (Casdoor name) used by FE create/edit forms — NOT RPC. Documented in the convention as a legacy/lookup exception: entity CRUD by uuid lives at `/entities/role_mapping`, `system/role-mappings` is the idp_role-keyed operational surface. Note: rename its plural sibling `entities/role_mappings` → `entities/role_mapping` anyway (Phase 2b) — the two coexist by design.

**3. Entity sub-actions — DECIDED (user)**: codify as legitimate Category-1 extensions in `api-path-conventions.md` + AGENTS.md:
   - `POST /entities/:entity/:uuid/<verb>` — instance action (`change-password`, `restore`)
   - `GET|POST /entities/:entity/<verb>` — collection action (`check-availability`, `duplicate`, `export`, `meta`, `list`, `bulk-*`)
   - Verb rule: `bulk-update` **stays PUT** (semantically an update); `bulk-delete`/`bulk-restore` stay POST (lifecycle ops). Document the intentional difference: PUT = content mutation, POST = state transition/action.

**4. Root `path: "/"`** in one router — verify it's a mount/health alias, not a real endpoint (Phase 0).

### Phase 3 — FE route rename

- `git mv src/routes/(app)/system/settings/security src/routes/(app)/system/settings/configurations` (incl. `create/`).
- Update: `security/+page.svelte` navigation URL, all `$t('system.settings.security.*')` → `system.settings.configurations.*`, `SelectableToolbar.svelte` comment, E2E URLs (3 spec files), `en-GB-fallback.json` keys if present.
- Breadcrumb/nav: automatic (nav-driven) — no FE nav code change.
- **Redirect**: old `/system/settings/security` bookmarks → add a `+page.server.ts` redirect or a stub route? → **open point for user** (probably not needed, dev-stage product).

### Phase 3b — FE plural-entity sweep

- `src/lib/api.ts`: `config_entries` → `config_entry` in all 7 config fns + `fetchModuleConfig`/`updateModuleConfigKey`; `user_profiles` → `user_profile`, `role_mappings` → `role_mapping`, `providers` → `provider` wherever called.
- Sweep `src/` for remaining `entities/<plural>` literals (grep list above) — composables, stores, E2E helpers.
- E2E: update any hardcoded API URLs in specs.

### Phase 4 — US alignment

- `emailsender`: migration `ALTER TABLE emailsender.config RENAME TO config_entries` + index renames + entity/DAL table-name update + initial patch update + sha registry script. **AND full schema alignment** (user decision): `ALTER TABLE ... ADD COLUMN IF NOT EXISTS type varchar(30) DEFAULT 'string', type_config jsonb, reserved boolean DEFAULT false, group_key varchar(100)` (+ audit table if the standard requires it — check emailsender has none today: `emailsender.config` has no `_audit`; decide whether to create `config_entries_audit` partitioned like public's — the Config Table standard in BE AGENTS.md implies audit is part of it → include). **AND** path singularization: `/entities/config_entries/*` → `/entities/config_entry/*`, `/entities/providers/*` → `/entities/provider/*`.
- `ai` service: same (table rename + verify its entity paths are singular).
- Sweep all US services: `grep -rn "CREATE TABLE" db-meta/patches | grep -i config` → any config table not named `config_entries` gets renamed; `grep -rn "entities/" src/server` → any plural segment gets singularized.
- `api-path-conventions.md`: add `config_entry` row to the migration table; the rule already mandates singular — no doc exception needed anymore.

### Phase 5 — DRY / standard enforcement

- BE `AGENTS.md`: retitle "Config Table Standard (`auth_configurations`)" → `config_entries`; add naming table (Phase-0 decisions) + "default name across schemas" rule.
- Add a lint/architecture note: new microservice config tables MUST be `config_entries` unless explicitly overridden (document the override mechanism — e.g. entity meta field `table_name` if it exists, else just doc).
- Verify `ConfigEntryEntity` shape parity between BE and US (emailsender lacks `type`/`type_config`/`reserved`/`group_key`?) → if divergent, that IS the de-standardization the user warned about; plan a column-alignment migration (add missing columns with defaults) — flag as separate sub-task with its own migration script.

### Phase 6 — verification

- `pnpm run check` (FE) 0 errors; BE `tsc`/tests green; US `pnpm build` green.
- Apply rename migration to dev DB; verify `config_entries` readable, audit partition intact, Redis key fresh.
- Manual: `/system/settings/configurations` renders, tab label correct in all seeded locales, create page works, E2E specs pass.
- **Regression sweep**: every FE caller of a renamed API path verified end-to-end (config list, module config, user profiles, role mappings, providers).

## Resolved decisions (user)

| # | Topic | Decision |
|---|---|---|
| 1 | Breaking strategy | **Hard cut, atomic cross-repo** — no aliases; docs (agent + user-guide) updated in the same pass |
| 2 | US schema alignment | **Full alignment** — emailsender/ai `config` tables get rename + missing standard columns (`type`, `type_config`, `reserved`, `group_key`) in the same migration |
| 3 | `system/role-mappings` | **Keep as documented legacy** — idp_role-keyed operational surface for FE forms; convention documents it as an exception |
| 4 | `auth/*` namespace | **Blessed domain namespace** — `auth/users` stays (lifecycle orchestration ≠ row CRUD); convention gains Category 5 "Domain namespaces" |
| 5 | Sub-actions + bulk verb | **Codify `:uuid/<verb>` and `<entity>/<verb>`** as Category-1 extensions; `bulk-update` stays PUT (content mutation) vs bulk-delete/restore POST (state transitions) — documented |
| 6 | Tab icon | `settings-2` (keep) |
| 7 | Redirect old route | **No** — dev-stage, 404 acceptable |
| 8 | Tab label | "Configurations" / "Configurazioni" — real translated strings in all 6 locales |
| 9 | `auth/config` | **Stays** — verified: returns only `enable_webauthn`/`passkey_required`/`enable_mfa`, pure auth topic |
| 10 | `entities/customers` + `items` | **Resolved** — exist only in `mcp/__tests__/openapi-discovery.test.ts` fixtures; update fixtures to singular for consistency |

## Remaining open points

None — all resolved. Ready for PROCEED.

---

## Implementation log (2026-07 — executed)

### Discovered during implementation

- **`system.settings.security.*` namespace was overloaded**: it served BOTH the
  configurations page keys AND credentials-page keys (password change card,
  OIDC card, delete-account). Split applied:
  - → `system.settings.configurations.*`: title, description, reservedBadge,
    lastUpdatedPrefix/ByMid, selected, bulkDelete, noEntries, changesPending*,
    noChanges, addConfigKey, create.*
  - stays `system.settings.security.*`: changePassword*, currentPassword*,
    newPassword*, confirmPassword*, changingPassword, passwordsDoNotMatch,
    passwordChanged*, oidc*, deleteAccount*, confirmDeleteAccount
    (used by `ChangePasswordCard` on `/system/settings/credentials`)
- **MFA `target_resource` uses the table name** (`config_entries`), not the API
  entity segment — FE keeps sending `config_entries` for continuity with
  existing `mfa_action_authorizations` rows.
- **`patch_id` in `primebrick_database_patches` = filename without `.sql`** —
  migration scripts use `0001_initial_schema`, not `0001_initial_schema.sql`.
- **MCP entity `auth_event`**: registered singular; dispatch aggregate check
  aligned (SQL table stays `auth_events`).
- **JSON response keys** (`{ config_entries: rows }`, `{ providers: rows }`)
  keep the plural collection name — response shape convention, unchanged.

### Changed

- BE: `auth_configurations`(+`_audit`) → `config_entries`(+`_audit`) table,
  `AuthConfigurationEntity`/`AuthConfigurationsDal` → `ConfigEntryEntity`/
  `ConfigEntriesDal`, `dal:config_entries:list` cache key; `be:auth_config:all`
  kept (runtime auth cache, not table). Nav meta → `/system/settings/configurations`,
  `tabs.configurations`. All entity paths singular: `config_entry`,
  `user_profile`, `role_mapping`, `auth_event`.
- BE migration `rename_auth_configurations_to_config_entries.sql`: table+index
  renames, translation key moves (config keys only), patch-registry sha256 for
  init + 6 seed patches.
- FE: route dir `security` → `configurations`, all i18n refs →
  `configurations.*` (config-list components + pages + e2e), `entities/*`
  singular, `entity=` props, emailsender providers path → `entities/provider`.
- US emailsender: `emailsender.config` → `config_entries` + standard columns
  (`type`, `type_config`, `reserved`, `group_key`, key→varchar(100));
  `entities/config_entries`→`config_entry`, `entities/providers`→`provider`;
  migration `rename_config_to_config_entries.sql`.
- US ai: `ai.config` → `config_entries` + same standard columns; migration added.
- Docs: AGENTS.md (BE+FE), api-path-conventions rule (sub-actions, bulk-update
  PUT note, auth orchestration namespace, legacy system/role-mappings),
  user-guide mdx files updated in BE/FE/US.

### Verification status

- BE `tsc --noEmit`: clean. Vitest: 219/222 pass; 3 failures pre-existing on
  HEAD (mfa-step-up-middleware `.rejects` non-promise bug, mfa-integration
  requires live dev server).
- FE `pnpm check`: 0 errors (4 pre-existing warnings).
- US emailsender + ai `tsc --noEmit`: clean.
- Pending runtime: apply migrations to dev DB, manual page check.
