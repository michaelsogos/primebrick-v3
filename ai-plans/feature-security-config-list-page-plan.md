# Plan: Security Page — Config Table Standard + Reusable Config List UI

> Status: IMPLEMENTED — all 7 phases completed (SDK, DAL, BE DB+entity+DAL, BE router+MFA+masking, FE types+API, FE components, FE Security page+i18n, docs).
> Based on empirical codebase investigation across `primebrick-be-v3`, `primebrick-fe-v3`, `primebrick-v3-sdk`, `primebrick-dal-v3`, `primebrick-us-v3`.
> Builds on the foundation of `feature-auth-config-standard-typed-config-loader-plan.md` (SDK `ConfigLoader<TResult>` + DAL `ConfigEntityBase` + `type`/`type_config` columns) and specializes it for the **Security page UI** (list-style, not table) + `reserved` field + bulk actions + step-up MFA delete.

## 1. Objective

Build the **Security** settings page as a reusable, metadata-driven configuration editing UI for `auth_configurations` (and, by extension, every future Config Table implementation). The page is a **list** (not a table) where each row has:

- **Left**: bulk-select checkbox (non-reserved only) + translated **title** (`label_key`) + translated **description** (`description_key`).
- **Center**: a **dynamic input** chosen from the row's `type` metadata (boolean → switch, badge → dropdown with inline values from `type_config`, list → dropdown with options fetched from a BE API URL in `type_config`, number → numeric input, date/datetime/time → wheel datepicker, secret → masked password, else → text input). The value is always stored as `TEXT` in the DB; the FE coerces to string before saving and the BE validates on upsert.
- **Right**: a **CTA** column — at minimum a trash icon for **logical (soft, restorable) delete** with a confirm dialog + **step-up MFA**.

Standardize `auth_configurations` to the Config Table standard (add `type`, `type_config`, `label_key`, `description_key`, and a new **`reserved`** boolean). `type_config` is a JSONB-text column holding extra per-type configuration (e.g. inline badge values, or the API URL+verb for `list` type). All currently-seeded `auth_configurations` rows are **reserved**: they can be **edited** but **not deleted**. Non-reserved rows (future, module-defined) are deletable and bulk-deletable.

The reusable components (page layout + row + dynamic input + bulk bar) become the standard for **every** future Config Table page (auth, emailsender, future modules).

## 2. Empirical Evidence Gathered (no assumptions)

### 2.1 `auth_configurations` current schema (CONFIRMED)
- **File:** `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql` (lines 344–362, 521–546).
- Columns: `id`, `uuid`, `key` (varchar **50**), `value` (text **NOT NULL**), `description` (text), audit fields, `deleted_at`/`deleted_by`.
- **MISSING vs Config Table standard:** `type`, `type_config`, `label_key`, `description_key`, **`reserved`**.
- `value` is `NOT NULL` today; Config Table standard wants `value` nullable (`null` = "not set").
- `key` is varchar(50); standard wants varchar(100).
- `description` column is a free-text Italian string; standard replaces it with `description_key` (i18n key).

### 2.2 Currently-seeded keys (CONFIRMED — all will become `reserved=true`)
From init patch + fire-and-forget patches:
- `casdoor_endpoint` (url), `casdoor_organization` (string), `casdoor_client_id` (string), `casdoor_admin_username` (string), `casdoor_admin_role` (string)
- `oidc_issuer_url` (url), `oidc_issuer_type` (badge: casdoor/keycloak/auth0 — inline values in `type_config`), `oidc_client_id` (string), `oidc_client_secret` (secret — note: not in init seed but referenced in `config-repo.ts` `AuthConfigDb`)
- `enable_email_verification_check` (boolean), `enable_formauth` (boolean), `enable_webauthn` (boolean), `passkey_required` (boolean), `enable_mfa` (boolean)
- `password_policy` (badge: alpha_numeric/letter_and_number/letter_number_special/mixed_case_special — inline values in `type_config`)
- `auth_mode` (badge: STANDALONE/GATEWAY — inline values in `type_config`), `auth_roles_path` (string)
- `invitation_expiry_days` (integer), `admin_contact_email` (string), `notification_alert_secret` (secret), `frontend_url` (url)
- `redis_url` (url), `mfa_challenge_token_ttl_seconds` (integer), `mfa_challenge_signing_secret` (secret)
- Additional keys referenced in `config-repo.ts` `AuthConfigDb` but not in seed: `casdoor_admin_password` (secret), `casdoor_builtin_client_id` (string), `casdoor_builtin_client_secret` (secret), `oidc_audience` (string), `gateway_*` (11 string/secret fields).

### 2.3 SDK `IConfigEntity` (CONFIRMED — partial)
- **File:** `primebrick-v3-sdk/src/config/iconfig-entity.ts`.
- Has `key`, `value`, `label_key`, `description_key`.
- **MISSING:** `type`, `type_config`, `reserved`.

### 2.4 DAL `ConfigEntityBase` (CONFIRMED — does not exist yet)
- Proposed in the prior plan. Does not exist in `primebrick-dal-v3` today.
- emailsender `ConfigEntryEntity` (`primebrick-us-v3/emailsender/src/domain/entities/config_entry_entity.ts`) is hand-written with `label_key`/`description_key` but **no** `type`/`type_config`/`reserved`.

### 2.5 BE — no entity CRUD endpoints for `auth_configurations` (CONFIRMED)
- `system-router.ts` exposes `/api/v1/system/*` (organizations, roles, permissions, password-policy, services) but **no** `config_entries` CRUD.
- `config-repo.ts` exposes `loadAuthConfigFromDb` (read) + `updateAuthConfig` (write) but no list/get-by-uuid/delete/restore HTTP endpoints.
- The public `GET /api/v1/auth/config` (in `auth-session.router.ts`) returns only safe boolean flags — stays unchanged.

### 2.6 BE — step-up MFA infrastructure (CONFIRMED)
- **File:** `primebrick-be-v3/src/modules/auth/mfa-step-up.middleware.ts` — middleware that validates an `x-mfa-challenge-token` header.
- `mfa.service.ts` issues challenge tokens; `auth-mfa.router.ts` exposes challenge/verify endpoints.
- Pattern: FE obtains a challenge token → user verifies OTP → token sent in header on the protected request.

### 2.7 FE — dynamic input rendering reference (CONFIRMED)
- **File:** `primebrick-fe-v3/src/lib/components/entity-list-table/panels/FiltersPanel.svelte`.
- `renderFilterInput(col)` switches on `col.type`:
  - `badge` + `col.badge.values` → multi-select dropdown (badge chips).
  - `date` / `datetime` → `DateWheelPicker` (`$lib/components/date-dropper/date-wheel-picker.svelte`).
  - else → text `Input`.
- `MetaColumn.type` vocabulary: `text | badge | date | datetime | color | string` (`primebrick-fe-v3/src/lib/entity-list/types.ts` line 71).
- `DateWheelPicker` already imported and used for date/datetime filters — **reusable** for config date/datetime/time inputs.

### 2.8 FE — list-row layout reference (CONFIRMED)
- **File:** `primebrick-fe-v3/src/routes/(app)/system/settings/modules/+page.svelte` (lines 218–334).
- Pattern: `flex items-center justify-between rounded-lg border p-3` → left `flex items-center gap-3 min-w-0` (icon + title + badges + description), right `flex items-center gap-2 shrink-0` (status badge + switch + icon buttons).
- `is_reserved` already handled: reserved modules hide the toggle/config/delete buttons (lines 310–331). **Direct precedent for the `reserved` field behavior.**

### 2.9 FE — card list with gradient border (CONFIRMED)
- `PasskeyEnrollment.svelte` / `MfaManagement.svelte` use `rounded-md border-primary-gradient px-3 py-2` for list items (per `feature-credentials-page-plan.md` §2.5/§2.6).
- `border-primary-gradient` is the standard for "list item with primary-tinted border".

### 2.10 FE — `DeleteDialog` (CONFIRMED)
- **File:** `primebrick-fe-v3/src/lib/components/entity-list-table/dialogs/DeleteDialog.svelte`.
- Props: `open`, `onOpenChange`, `isDeleting`, `onConfirm`, `onCancel`. Uses `DialogBordered` with `severity="destructive"`.
- **Reusable** for single-row delete confirm. Bulk delete uses `BulkDeleteDialog.svelte` (same folder).

### 2.11 FE — existing Security page (CONFIRMED — to be rewritten)
- **File:** `primebrick-fe-v3/src/routes/(app)/system/settings/security/+page.svelte`.
- Currently: a mock OIDC form (3 inputs) + delete-account footer. Uses `AppPageScaffold`.
- **No real BE integration** — `handleSubmit` and `handleDeleteAccount` are `console.log` stubs.
- This page will be **rewritten** to render the config list.

### 2.12 FE — existing module config tab (CONFIRMED — reference + future refactor target)
- **File:** `primebrick-fe-v3/src/routes/(app)/system/settings/modules/[code]/+page.svelte` (lines 208–242).
- Renders `ModuleConfigEntry[]` with label/description + a plain `Input` for every row (no type-aware widget).
- `ModuleConfigEntry` type (`api-types.ts` lines 70–76): `uuid, key, value, label_key, description_key` — **no** `type`/`type_config`/`reserved`.
- **Future refactor target:** replace the inline rendering with the reusable `ConfigList` component once US microservices return `type`/`type_config`.

### 2.13 FE — `api-types.ts` (CONFIRMED)
- `ModuleConfigEntry` exists (lines 70–76) but lacks `type`, `type_config`, `reserved`, `version`.
- No `ConfigEntry` / `ConfigEntryType` types exist.

### 2.14 BE — nav meta (CONFIRMED)
- **File:** `primebrick-be-v3/src/modules/module-nav-meta.ts` — `buildModuleNavMeta("settings")` returns the settings tabs array.
- `security` entry already exists (current Security page). **No new nav entry needed** — the Security page is reused.

### 2.15 BE — `AuthConfigurationsDal` (CONFIRMED)
- **File:** `primebrick-be-v3/src/modules/auth/auth_configurations_dal.ts`.
- Has `findAll`, `findByKey`, `add`, `upsert`. **MISSING:** `update` (by uuid/id), `softDelete`, `bulkSoftDelete`, `restore`, `findByUuid`.
- `reloadCache()` invalidates the in-memory auth config cache after writes.

## 3. Gaps to Close

| # | Gap | Layer |
|---|-----|-------|
| 1 | `auth_configurations` missing `type`, `type_config`, `label_key`, `description_key`, `reserved` columns | DB |
| 2 | `value` is `NOT NULL`; `key` is varchar(50) | DB |
| 3 | `description` column is free-text Italian; should be `description_key` (i18n) | DB |
| 4 | SDK `IConfigEntity` missing `type`, `type_config`, `reserved` | SDK |
| 5 | DAL `ConfigEntityBase` does not exist | DAL |
| 6 | BE `AuthConfigurationEntity` missing new columns | BE |
| 7 | BE `AuthConfigurationsDal` missing update/delete/restore/bulk methods | BE |
| 8 | BE has no `config_entries` entity CRUD HTTP endpoints | BE |
| 9 | BE delete/bulk-delete not protected by step-up MFA | BE |
| 10 | BE list/get does not mask `secret` values | BE |
| 11 | FE has no `ConfigEntry` / `ConfigEntryType` types | FE |
| 12 | FE has no reusable `ConfigList` / `ConfigListRow` / `ConfigValueInput` / `ConfigBulkActionBar` | FE |
| 13 | FE Security page is a mock; needs full rewrite to config list | FE |
| 14 | FE has no MFA-challenge-then-delete flow helper for config entries | FE |
| 15 | i18n missing `config.auth.*` label/description keys for every auth config row | FE |

## 4. Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Page style | **List** (not `EntityListTable`) | User explicit: "La lista non è una tabella". Rows with title/description left, input center, CTA right — like modules page + MFA/Passkey cards. |
| Row border | `border-primary-gradient` | Matches MFA/Passkey card items + modules list aesthetic. |
| Dynamic input source | **`type` column in the DB row** (metadata-driven) | Same pattern as `FiltersPanel.renderFilterInput(col)` switching on `col.type`. Self-describing data; works for any future Config Table. |
| Date input | **`DateWheelPicker`** (reuse from FiltersPanel) | User explicit: "wheel datepicker se è un date o datetime o time". Component already exists and is used for filters. |
| `reserved` field | **New boolean column**, default `false`; all existing rows seeded `true` | User explicit: "tutti i campi presenti ora in auth_configurations sono reserved". Reserved = editable, not deletable, not bulk-selectable. |
| Delete semantics | **Logical soft-delete** (restorable) | User explicit: "eliminazione logica restorable". Uses existing `deleted_at`/`deleted_by` columns. |
| Delete protection | **Confirm dialog + step-up MFA** | User explicit. BE middleware `mfa-step-up.middleware.ts` already exists. |
| Bulk actions | **Left-side checkbox** per non-reserved row + bulk action bar | User explicit: "selettore sulla sinistra per abilitare le BULK ACTION". |
| Reusability | **Generic `ConfigList` components** (no auth-specific logic) | User explicit: "diventerà non solo uno standard per le pagine config, ma anche per le future volte che un modulo dovesse implementare la classe Config Table". |
| SDK/DAL foundation | **Reuse `feature-auth-config-standard-typed-config-loader-plan.md`** SDK `ConfigLoader<TResult>` + DAL `ConfigEntityBase` work | This plan extends that foundation with `reserved` + the list UI + step-up MFA delete. The SDK/DAL phases of the prior plan are a **prerequisite**. |
| Table rename | **Do NOT rename `auth_configurations` → `config` in this plan** | The prior plan proposed a rename; this plan keeps the existing table name to minimize blast radius. The `reserved`/`type`/`type_config`/`label_key`/`description_key` columns are added in place. Rename can happen in a follow-up. |

## 5. Type Vocabulary (extends prior plan)

The `type` column drives both SDK coercion and FE widget selection. A companion `type_config` column (JSONB stored as text) holds extra per-type configuration. This plan **extends** the prior plan's vocabulary with `badge`/`list` (replacing `enum`) and date/time types (user-requested wheel datepicker):

| `type` | `type_config` contents | SDK coercion | FE widget | Notes |
|--------|------------------------|--------------|-----------|-------|
| `string` | null | string as-is | `Input` type=text | Single-line text. |
| `text` | null | string as-is | `Textarea` | Multi-line text. |
| `boolean` | null | `value === "true"` | `Switch` | DB stores `"true"` / `"false"`. Save immediately on toggle. |
| `integer` | `{ min?, max? }` | `parseInt(value, 10)` | `Input` type=number (integer) | Empty/null stays null. |
| `number` | `{ min?, max?, step? }` | `parseFloat(value)` | `Input` type=number | Empty/null stays null. |
| `badge` | `{ "values": { "VALUE": { "label_key": "...", "color": "emerald-300" } } }` | string, validated against `type_config.values` keys | `ComboSelect` mode="single" with inline options | Static set of options defined inline in the DB row. Mirrors the `badge.values` shape from `customers/list-config.ts`. Each value has a `label_key` (i18n) and optional `color`. |
| `list` | `{ "api_url": "/api/v1/system/roles/active", "api_verb": "GET", "value_field": "idp_role", "label_field": "label_key" }` | string as-is (BE validates against its own catalog) | `ComboSelect` mode="single" with options fetched from `api_url` | Dynamic set of options loaded from a BE API at runtime. The FE calls `api_verb api_url` and maps `value_field`/`label_field` from the response. The BE validates the value against its own catalog code (not via HTTP self-call). |
| `url` | null | string as-is | `Input` type=url | Validated at write path. |
| `secret` | null | string as-is | `Password` (masked) | **Never returned in clear to FE**; BE masks in list/get; empty PUT = leave unchanged. |
| `json` | null | `JSON.parse(value)` | `Textarea` | FE stringifies on save. |
| `date` | null | ISO date string | `DateWheelPicker` (date-only) | **NEW** — wheel datepicker. |
| `datetime` | null | ISO datetime string | `DateWheelPicker` (date + time) | **NEW** — wheel datepicker with time. |
| `time` | null | HH:mm:ss string | `DateWheelPicker` (time-only) | **NEW** — wheel datepicker time mode. |

> **`enum` type is NOT used.** The prior plan proposed `enum` with an `enum_values` JSON string array column. That approach is rejected: it carries only raw strings (no per-value `label_key`/`color`), duplicates allowed-values between DB and BE code, and generates fragile i18n keys by string concatenation. Instead, `badge` (inline rich values in `type_config`) and `list` (BE API-loaded catalog) cover all select-from-options use cases.

> **Open question for the user:** Does `DateWheelPicker` support a time-only mode today? If not, a thin time-only variant or a mode prop is needed. This will be verified at implementation start by reading `date-wheel-picker.svelte`.

## 6. Standard Config Data Model (this plan's additions)

### 6.1 `auth_configurations` schema after this plan

```sql
-- Columns added by this plan (in-place ALTER, no rename):
ALTER TABLE "public"."auth_configurations"
  ADD COLUMN "type" varchar(50) NOT NULL DEFAULT 'string',
  ADD COLUMN "type_config" text,
  ADD COLUMN "label_key" varchar(100),
  ADD COLUMN "description_key" varchar(100),
  ADD COLUMN "reserved" boolean NOT NULL DEFAULT false;

-- Align with Config Table standard:
ALTER TABLE "public"."auth_configurations" ALTER COLUMN "value" DROP NOT NULL;
ALTER TABLE "public"."auth_configurations" ALTER COLUMN "key" TYPE varchar(100);
ALTER TABLE "public"."auth_configurations" DROP COLUMN "description";
```

### 6.2 `reserved` field semantics

- `reserved = true`: row is **system-critical**. FE hides the delete CTA and the bulk-select checkbox. BE rejects `DELETE` and `bulk-delete` with a `403 reserved_config_cannot_be_deleted` error. The **value can still be edited** via `PUT`.
- `reserved = false`: row is **user/module-managed**. FE shows delete CTA + checkbox. BE allows soft-delete (with step-up MFA) and bulk-delete.
- All currently-seeded rows are `reserved = true`.

## 7. Backend Changes

### 7.1 DB patch (fire-and-forget + init patch update)

Per `patch-sha256-management.md`: **never create a new initial patch**. Update `00000000000000_init_database.sql` in place (add the new columns to the `CREATE TABLE` + seed `type`/`label_key`/`description_key`/`type_config`/`reserved` for every row) and create a **fire-and-forget** script for existing databases:

**New file:** `primebrick-be-v3/db-meta/fire-and-forget/add_config_table_standard_columns.sql`

```sql
-- Fire-and-forget: add type/type_config/label_key/description_key/reserved to auth_configurations.
BEGIN;

ALTER TABLE "public"."auth_configurations"
  ADD COLUMN IF NOT EXISTS "type" varchar(50) NOT NULL DEFAULT 'string',
  ADD COLUMN IF NOT EXISTS "type_config" text,
  ADD COLUMN IF NOT EXISTS "label_key" varchar(100),
  ADD COLUMN IF NOT EXISTS "description_key" varchar(100),
  ADD COLUMN IF NOT EXISTS "reserved" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."auth_configurations" ALTER COLUMN "value" DROP NOT NULL;
ALTER TABLE "public"."auth_configurations" ALTER COLUMN "key" TYPE varchar(100);
ALTER TABLE "public"."auth_configurations" DROP COLUMN IF EXISTS "description";

-- Seed type/type_config/label_key/description_key/reserved for every existing key.
-- All existing auth_configurations rows are reserved.
UPDATE "public"."auth_configurations" SET "reserved" = true WHERE "reserved" = false;

UPDATE "public"."auth_configurations" SET
  "type" = 'url',
  "label_key" = 'config.auth.casdoor_endpoint.label',
  "description_key" = 'config.auth.casdoor_endpoint.description'
WHERE "key" = 'casdoor_endpoint';

UPDATE "public"."auth_configurations" SET
  "type" = 'string',
  "label_key" = 'config.auth.casdoor_organization.label',
  "description_key" = 'config.auth.casdoor_organization.description'
WHERE "key" = 'casdoor_organization';

-- ... (exhaustive UPDATE for every key — boolean, integer, badge, secret, url, string)
-- badge examples (inline values in type_config):
UPDATE "public"."auth_configurations" SET
  "type" = 'badge',
  "type_config" = '{"values":{"STANDALONE":{"label_key":"config.auth.auth_mode.standalone","color":"sky-300"},"GATEWAY":{"label_key":"config.auth.auth_mode.gateway","color":"amber-300"}}}',
  "label_key" = 'config.auth.auth_mode.label',
  "description_key" = 'config.auth.auth_mode.description'
WHERE "key" = 'auth_mode';

UPDATE "public"."auth_configurations" SET
  "type" = 'badge',
  "type_config" = '{"values":{"alpha_numeric":{"label_key":"config.auth.password_policy.alpha_numeric"},"letter_and_number":{"label_key":"config.auth.password_policy.letter_and_number"},"letter_number_special":{"label_key":"config.auth.password_policy.letter_number_special"},"mixed_case_special":{"label_key":"config.auth.password_policy.mixed_case_special"}}}',
  "label_key" = 'config.auth.password_policy.label',
  "description_key" = 'config.auth.password_policy.description'
WHERE "key" = 'password_policy';

UPDATE "public"."auth_configurations" SET
  "type" = 'badge',
  "type_config" = '{"values":{"casdoor":{"label_key":"config.auth.oidc_issuer_type.casdoor"},"keycloak":{"label_key":"config.auth.oidc_issuer_type.keycloak"},"auth0":{"label_key":"config.auth.oidc_issuer_type.auth0"}}}',
  "label_key" = 'config.auth.oidc_issuer_type.label',
  "description_key" = 'config.auth.oidc_issuer_type.description'
WHERE "key" = 'oidc_issuer_type';

-- boolean keys: enable_email_verification_check, enable_formauth, enable_webauthn,
-- passkey_required, enable_mfa
-- integer keys: invitation_expiry_days, mfa_challenge_token_ttl_seconds
-- secret keys: oidc_client_secret, casdoor_admin_password, casdoor_builtin_client_secret,
--   mfa_challenge_signing_secret, notification_alert_secret
-- url keys: casdoor_endpoint, oidc_issuer_url, frontend_url, redis_url

COMMIT;
```

The init patch `00000000000000_init_database.sql` is also updated in place (CREATE TABLE includes the new columns; seed INSERTs include the new columns) and its SHA256 is re-registered via the standard fire-and-forget hash-update script.

### 7.2 Entity (`AuthConfigurationEntity`)

Add columns:

```typescript
@Column({ length: 50, nullable: false })
type!: string;

@Column({ nullable: true })
type_config?: string | null;

@Column({ length: 100, nullable: true })
label_key?: string;

@Column({ length: 100, nullable: true })
description_key?: string;

@Column({ nullable: false, default: false })
reserved!: boolean;
```

> **Note:** If the prior plan's `ConfigEntityBase` is implemented first in the DAL, `AuthConfigurationEntity` should extend it. This plan does not **require** the DAL base class to exist first — it can add the columns directly to `AuthConfigurationEntity` and migrate to `ConfigEntityBase` later. The recommendation is to implement the DAL base class as Phase 0 (per prior plan) and have `AuthConfigurationEntity extends ConfigEntityBase` here.

### 7.3 DAL (`AuthConfigurationsDal`)

Add methods:

```typescript
async findByUuid(uuid: string): Promise<AuthConfigurationEntity | null>;
async update(uuid: string, value: string, updatedBy: string): Promise<void>; // validates type/type_config
async softDelete(uuid: string, deletedBy: string): Promise<void>; // rejects if reserved
async bulkSoftDelete(uuids: string[], deletedBy: string): Promise<void>; // rejects reserved rows
async restore(uuid: string, updatedBy: string): Promise<void>;
```

Each write method calls `reloadCache()` at the end (existing pattern).

`update` must validate the incoming string against `type` / `type_config` before writing:
- `boolean`: value must be `"true"` or `"false"`.
- `integer`: `Number.isInteger(parseInt(value, 10))`.
- `number`: `!isNaN(parseFloat(value))`.
- `badge`: value must be a key in `JSON.parse(type_config).values`.
- `list`: value is accepted as-is (the BE validates against its own catalog code, not via HTTP self-call — the `type_config.api_url` is for FE use only).
- `url`: `new URL(value)` does not throw.
- `secret`: non-empty string (empty string = "leave unchanged" → skip write).
- `json`: `JSON.parse(value)` does not throw.

### 7.4 CRUD router (new)

**New file:** `primebrick-be-v3/src/modules/auth/routers/config-entries.router.ts`

Endpoints (all admin-only — `rbacHandler([Permission.AUTHENTICATED_ADMIN])` or a new `settings.update.config` permission; exact permission to confirm during implementation):

```
GET    /api/v1/entities/config_entries/meta              → entity metadata (fields, types)
GET    /api/v1/entities/config_entries/list              → all rows (secrets masked, deleted excluded)
GET    /api/v1/entities/config_entries/:uuid             → single row (secret masked)
PUT    /api/v1/entities/config_entries/:uuid             → update value (validates type; invalidates cache)
DELETE /api/v1/entities/config_entries/:uuid             → soft-delete (rejects reserved; step-up MFA)
POST   /api/v1/entities/config_entries/bulk-delete       → bulk soft-delete (rejects reserved; step-up MFA)
POST   /api/v1/entities/config_entries/:uuid/restore     → restore soft-deleted row
```

**Secret masking:** in `list` and `:uuid` responses, rows with `type = 'secret'` have `value` set to `null` (or a fixed mask `"••••"`). The FE renders a `Password` input with a placeholder and only sends a value when the user types a new one. An empty PUT body for a secret means "leave unchanged".

**Step-up MFA:** `DELETE` and `bulk-delete` handlers are wrapped with `mfa-step-up.middleware`. The FE must obtain an MFA challenge token (via the existing `auth-mfa.router.ts` challenge/verify flow) and send it in the `x-mfa-challenge-token` header.

**Reserved protection:** `DELETE` and `bulk-delete` check `row.reserved === true` and return `403` with `internal_code: reserved_config_cannot_be_deleted` if the row is reserved.

**Cache invalidation:** after a successful `PUT` / `DELETE` / `bulk-delete` / `restore`, the handler calls the existing `reloadCache()` path (or the new `ConfigLoader.invalidate() + load()` if the prior plan's loader is in place).

Wire the router into `src/index.ts`.

### 7.5 Meta endpoint

`GET /api/v1/entities/config_entries/meta` returns the entity metadata shape consumed by the FE for dynamic rendering (and by the MCP server). It mirrors the BE `*.meta.ts` pattern. The `list` endpoint already returns `type`/`type_config`/`label_key`/`description_key`/`reserved` per row, so the FE has everything it needs without a separate meta call — but the meta endpoint is required for MCP compatibility and the api-path-conventions rule.

## 8. Frontend Changes

### 8.1 Types (`src/lib/api-types.ts`)

```typescript
export type ConfigEntryType =
  | 'string' | 'text' | 'boolean' | 'integer' | 'number'
  | 'badge' | 'list' | 'url' | 'secret' | 'json'
  | 'date' | 'datetime' | 'time';

export type ConfigEntry = {
  uuid: string;
  key: string;
  value: string | null;
  type: ConfigEntryType;
  type_config?: string | null;
  label_key?: string;
  description_key?: string;
  reserved: boolean;
  version: number;
};
```

`ModuleConfigEntry` is kept for backward compat with the existing module config tab; it will be migrated to `ConfigEntry` in a follow-up once US microservices return `type`/`type_config`.

### 8.2 API helpers (`src/lib/api.ts`)

```typescript
export async function fetchConfigEntries(): Promise<ConfigEntry[]>;
export async function updateConfigEntry(uuid: string, value: string, version: number): Promise<void>;
export async function deleteConfigEntry(uuid: string, mfaChallengeToken: string): Promise<void>;
export async function bulkDeleteConfigEntries(uuids: string[], mfaChallengeToken: string): Promise<void>;
export async function restoreConfigEntry(uuid: string): Promise<void>;
```

MFA challenge helpers: reuse the existing MFA flow (request challenge → verify OTP → get token). If a `useMfaChallenge` composable does not exist, create a thin one in `$lib/composables/useMfaChallenge.svelte.ts` that wraps the `auth-mfa.router.ts` endpoints.

### 8.3 Reusable components (`src/lib/components/config-list/`)

**`ConfigList.svelte`** — top-level list. Props:

```typescript
type Props = {
  entries: ConfigEntry[];
  loading?: boolean;
  error?: string | null;
  onSave: (entry: ConfigEntry, value: string) => Promise<void>;
  onDelete: (entry: ConfigEntry) => void;        // opens confirm + MFA flow
  onBulkDelete: (entries: ConfigEntry[]) => void;
  translationPrefix?: string;                     // fallback for missing label_key
};
```

Renders:
- Loading / error / empty states (reuse `pb-watermark-empty` / `pb-watermark-loading` patterns from modules page).
- `ConfigBulkActionBar` (visible when ≥1 non-reserved row selected).
- `{#each entries as entry}` → `ConfigListRow`.

**`ConfigListRow.svelte`** — single row. Layout:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [☐]  Title (translated label_key)          [dynamic input]    [🗑]      │
│      Description (translated description_key)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

- Container: `flex items-center justify-between rounded-lg border border-primary-gradient p-3 gap-4`.
- Left: `flex items-start gap-3 min-w-0`:
  - Checkbox (only if `!entry.reserved`) — `Checkbox` from `$lib/components/ui/checkbox`.
  - `div.min-w-0`: `<p class="font-medium truncate">{entry.label_key ? $t(entry.label_key) : entry.key}</p>` + `<p class="text-sm text-muted-foreground">{entry.description_key ? $t(entry.description_key) : ''}</p>`.
- Center: `flex-1 flex justify-center` → `<ConfigValueInput {entry} onSave />`.
- Right: `flex items-center gap-2 shrink-0`:
  - Trash button (only if `!entry.reserved`): `Button variant="ghost" size="icon"` with `Trash2 class="size-4 text-destructive"`, `data-testid="config-row-delete-{entry.key}"`, onclick → `onDelete(entry)`.

**`ConfigValueInput.svelte`** — dynamic input renderer. Switch on `entry.type`:

| `type` | Component | Save trigger | Coercion to string |
|--------|-----------|--------------|--------------------|
| `boolean` | `Switch` | immediate `onCheckedChange` | `'true'` / `'false'` |
| `badge` | `ComboSelect` mode="single" (options from `JSON.parse(entry.type_config).values`, each with `label_key` + optional `color`) | `onchange` | as-is |
| `list` | `ComboSelect` mode="single" (options fetched from `type_config.api_url` via `type_config.api_verb`, mapped by `value_field`/`label_field`) | `onchange` | as-is |
| `integer` / `number` | `Input type="number"` | `onblur` | `String(value)` |
| `date` | `DateWheelPicker` (date mode) | `onchange` | ISO date string |
| `datetime` | `DateWheelPicker` (datetime mode) | `onchange` | ISO datetime string |
| `time` | `DateWheelPicker` (time mode) | `onchange` | `HH:mm:ss` |
| `secret` | `Password.PasswordInput` + inline save `Button` | button click | as-is (empty = skip) |
| `url` | `Input type="url"` | `onblur` | as-is |
| `text` / `json` | `Textarea` | `onblur` | as-is (`JSON.stringify` for json) |
| `string` | `Input type="text"` | `onblur` | as-is |

Reference for the switch-on-type pattern: `FiltersPanel.renderFilterInput(col)` (`primebrick-fe-v3/src/lib/components/entity-list-table/panels/FiltersPanel.svelte` line 270).

**`ConfigBulkActionBar.svelte`** — sticky bar above the list when ≥1 row selected. Shows "N selected" + a destructive "Delete" button → `onBulkDelete(selectedEntries)`.

**`index.ts`** — barrel export.

### 8.4 Security page route (rewrite)

**File:** `primebrick-fe-v3/src/routes/(app)/system/settings/security/+page.svelte` (full rewrite).

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import AppPageScaffold from '$lib/components/AppPageScaffold.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { settingsTabMenuSegment } from '$lib/breadcrumb/settings-breadcrumb';
  import { ConfigList } from '$lib/components/config-list';
  import { fetchConfigEntries, updateConfigEntry, deleteConfigEntry, bulkDeleteConfigEntries } from '$lib/api';
  import { useMfaChallenge } from '$lib/composables/useMfaChallenge.svelte';
  import { DeleteDialog } from '$lib/components/entity-list-table/dialogs/DeleteDialog.svelte';
  import { pushNotification } from '$lib/errors/app-errors';
  import type { ConfigEntry } from '$lib/api-types';

  let entries = $state<ConfigEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Single delete state
  let deleteTarget = $state<ConfigEntry | null>(null);
  let deleteDialogOpen = $state(false);
  let isDeleting = $state(false);

  // Bulk delete state
  let bulkTargets = $state<ConfigEntry[]>([]);
  let bulkDeleteDialogOpen = $state(false);
  let isBulkDeleting = $state(false);

  const mfa = useMfaChallenge();

  onMount(loadEntries);

  async function loadEntries() { /* fetchConfigEntries → entries */ }

  async function handleSave(entry: ConfigEntry, value: string) {
    try {
      await updateConfigEntry(entry.uuid, value, entry.version);
      entries = entries.map(e => e.uuid === entry.uuid ? { ...e, value } : e);
      pushNotification({ impact: 'NONE', messageKey: 'common.saveSuccess', scope: $t('shell.settings.security.title') });
    } catch (e) { pushNotification({ impact: 'HIGH', messageKey: 'common.saveFailed', scope: $t('shell.settings.security.title'), detail: ... }); }
  }

  async function handleDelete(entry: ConfigEntry) {
    deleteTarget = entry;
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    isDeleting = true;
    try {
      const token = await mfa.requestAndVerify(); // step-up MFA
      await deleteConfigEntry(deleteTarget.uuid, token);
      entries = entries.filter(e => e.uuid !== deleteTarget!.uuid);
      deleteDialogOpen = false; deleteTarget = null;
      pushNotification({ impact: 'NONE', messageKey: 'common.deleteSuccess', scope: ... });
    } catch (e) { pushNotification(...); }
    finally { isDeleting = false; }
  }

  async function handleBulkDelete(selected: ConfigEntry[]) {
    bulkTargets = selected;
    bulkDeleteDialogOpen = true;
  }

  async function confirmBulkDelete() { /* similar, bulkDeleteConfigEntries */ }
</script>

<AppPageScaffold>
  {#snippet header()}
    <!-- breadcrumb + title (existing pattern) -->
  {/snippet}

  <div class="flex-1 overflow-auto p-4">
    <ConfigList
      {entries} {loading} {error}
      onSave={handleSave}
      onDelete={handleDelete}
      onBulkDelete={handleBulkDelete}
    />
  </div>
</AppPageScaffold>

<DeleteDialog open={deleteDialogOpen} onOpenChange={...} isDeleting={isDeleting} onConfirm={confirmDelete} onCancel={...} />
<!-- BulkDeleteDialog similar -->
```

### 8.5 i18n (all 6 locale files)

Add under `config.auth.*` (snake_case singular per translation-key convention):

```json
"config": {
  "auth": {
    "casdoor_endpoint": { "label": "Casdoor endpoint", "description": "Base URL of the Casdoor server." },
    "auth_mode": { "label": "Authentication mode", "description": "STANDALONE = API validates JWT via OIDC discovery; GATEWAY = trusted reverse proxy forwards identity via headers." },
    ...
  }
}
```

One `label` + `description` pair per auth config key. The DB `label_key` / `description_key` columns reference these keys (e.g. `config.auth.casdoor_endpoint.label`).

Add under `shell.settings.security.*`:

```json
"shell": {
  "settings": {
    "security": {
      "title": "Security",
      "description": "System-wide authentication and security configuration.",
      "bulkDelete": "Delete selected",
      "reservedBadge": "Reserved"
    }
  }
}
```

## 9. Phased Execution Plan

### Phase 0 — Prerequisite: SDK + DAL foundation (from prior plan)
1. SDK: add `type`, `type_config`, `reserved` to `IConfigEntity`.
2. DAL: create `ConfigEntityBase` with all columns including `reserved`.
3. **Blocker:** SDK + DAL must build and be available to BE/FE before Phase 1.

### Phase 1 — BE DB + entity + DAL
1. Create fire-and-forget patch `add_config_table_standard_columns.sql` (add columns + seed all existing rows with `type`/`type_config`/`label_key`/`description_key`/`reserved=true`).
2. Update init patch `00000000000000_init_database.sql` in place + fire-and-forget SHA256 update script.
3. Update `AuthConfigurationEntity` with new columns (or extend `ConfigEntityBase` if Phase 0 done).
4. Add `findByUuid`, `update` (with type validation), `softDelete` (reserved check), `bulkSoftDelete`, `restore` to `AuthConfigurationsDal`.
5. **Verify:** `pnpm run db:meta:compare`; `pnpm run db:migrate`; BE starts without throwing; `SELECT key, type, reserved FROM auth_configurations` returns correct values.

### Phase 2 — BE CRUD router + step-up MFA + masking
1. Create `config-entries.router.ts` with `meta`, `list`, `:uuid`, `PUT`, `DELETE`, `bulk-delete`, `restore`.
2. Implement secret masking in `list` / `:uuid`.
3. Wrap `DELETE` + `bulk-delete` with `mfa-step-up.middleware`.
4. Implement reserved-row rejection in `DELETE` + `bulk-delete`.
5. Wire router into `src/index.ts`.
6. **Verify:** curl `GET /api/v1/entities/config_entries/list` with admin → rows include `type`/`type_config`/`label_key`/`description_key`/`reserved`; secrets masked. `DELETE` on a reserved row → 403. `DELETE` on a non-reserved row without MFA token → 401/403. `PUT` with invalid badge value (not in `type_config.values`) → 400.

### Phase 3 — FE types + API helpers + MFA composable
1. Add `ConfigEntry` / `ConfigEntryType` to `api-types.ts`.
2. Add `fetchConfigEntries` / `updateConfigEntry` / `deleteConfigEntry` / `bulkDeleteConfigEntries` / `restoreConfigEntry` to `api.ts`.
3. Create `useMfaChallenge.svelte.ts` composable (request + verify + return token) if it does not exist.
4. **Verify:** `pnpm run check` passes.

### Phase 4 — FE reusable components
1. Create `ConfigValueInput.svelte` (dynamic input switch on `type`).
2. Create `ConfigListRow.svelte` (left/center/right layout + checkbox + delete CTA).
3. Create `ConfigBulkActionBar.svelte`.
4. Create `ConfigList.svelte` (states + wires rows + bulk bar).
5. Create `index.ts` barrel.
6. Run Svelte MCP autofixer on each component.
7. **Verify:** `pnpm run check` passes; render in isolation if a playground route exists.

### Phase 5 — FE Security page rewrite + i18n
1. Rewrite `security/+page.svelte` to use `ConfigList`.
2. Wire `handleSave` / `handleDelete` / `handleBulkDelete` with MFA flow + `DeleteDialog` / `BulkDeleteDialog`.
3. Add all `config.auth.*` + `shell.settings.security.*` translation keys to all 6 locale files.
4. **Verify:** `pnpm run check`; open `/system/settings/security` in browser; confirm rows render with correct widgets; toggle a boolean → saves; edit a string → saves on blur; delete CTA hidden on reserved rows; bulk select appears only on non-reserved rows; delete flow triggers MFA.

### Phase 6 — Documentation
1. Update `docs/user-guide/config-tables.mdx` (SDK) with the `reserved` field + date/time types + the reusable `ConfigList` FE component.
2. Update `docs/ai/patterns.md` (FE) with the config-list page pattern.
3. Add a Devin rule `.devin/rules/config-list-pages.md` (FE) codifying the reusable pattern.

## 10. Acceptance Criteria

- [ ] `auth_configurations` has `type`, `type_config`, `label_key`, `description_key`, `reserved` columns; `value` is nullable; `key` is varchar(100); `description` column dropped.
- [ ] All existing `auth_configurations` rows have `reserved = true` and correct `type` / `label_key` / `description_key` / `type_config`.
- [ ] `GET /api/v1/entities/config_entries/list` returns rows with `type`, `type_config`, `label_key`, `description_key`, `reserved`; `secret` values are masked.
- [ ] `PUT /api/v1/entities/config_entries/:uuid` updates the value, validates against `type`/`type_config`, invalidates the in-memory cache.
- [ ] `DELETE` on a reserved row returns `403 reserved_config_cannot_be_deleted`.
- [ ] `DELETE` on a non-reserved row soft-deletes (sets `deleted_at`/`deleted_by`) and requires a valid MFA challenge token.
- [ ] `POST /api/v1/entities/config_entries/bulk-delete` soft-deletes only non-reserved rows and requires MFA.
- [ ] `POST /api/v1/entities/config_entries/:uuid/restore` restores a soft-deleted row.
- [ ] FE `ConfigList` / `ConfigListRow` / `ConfigValueInput` / `ConfigBulkActionBar` are generic (no auth-specific logic) and reusable.
- [ ] `ConfigValueInput` renders the correct widget per `type` (boolean → Switch, badge → ComboSelect with inline values from `type_config`, list → ComboSelect with options fetched from `type_config.api_url`, integer/number → numeric Input, date/datetime/time → DateWheelPicker, secret → Password, url → url Input, text/json → Textarea, string → text Input).
- [ ] FE Security page renders the list with title/description (left), dynamic input (center), delete CTA (right).
- [ ] Reserved rows show no delete CTA and no bulk-select checkbox.
- [ ] Bulk select + bulk delete works for non-reserved rows with confirm dialog + step-up MFA.
- [ ] All `config.auth.*` + `shell.settings.security.*` translations exist in all 6 locales.
- [ ] `pnpm run check` passes in FE; `pnpm run build` passes in BE.

## 11. Risks and Open Questions

1. **`DateWheelPicker` time-only mode:** Needs verification that the component supports a `time`-only mode. If not, a thin variant or a `mode` prop is added. Verified at implementation start by reading `date-wheel-picker.svelte`.
2. **MFA challenge composable:** A `useMfaChallenge` composable may not exist yet. The plan includes creating a thin one; the existing `auth-mfa.router.ts` endpoints (challenge/verify) are the BE side.
3. **Permission for config endpoints:** The exact `Permission` enum value for admin-only config CRUD needs confirmation during implementation. Candidate: `Permission.AUTHENTICATED_ADMIN` (sentinel, admin-only) or a new `settings.update.config`.
4. **Init patch SHA256:** Updating `00000000000000_init_database.sql` in place requires a fire-and-forget SHA256 update script for existing databases (per `patch-sha256-management.md`).
5. **SDK/DAL prerequisite:** Phase 0 (SDK `IConfigEntity` + DAL `ConfigEntityBase`) is a blocker. If the user prefers to skip the SDK/DAL generalization for now, the BE can add the columns directly to `AuthConfigurationEntity` without `ConfigEntityBase`, and the SDK `IConfigEntity` update can be deferred — but this reduces reusability for future modules.
6. **`oidc_client_secret` and other secrets not in seed:** Some secrets referenced in `AuthConfigDb` are not in the init seed. The fire-and-forget patch only updates rows that exist; missing rows are not created. This is acceptable — they will be created when first needed.
7. **Table rename deferred:** This plan does NOT rename `auth_configurations` → `config` (the prior plan proposed it). The rename is a follow-up to minimize blast radius. The `reserved`/`type`/`type_config`/`label_key`/`description_key` columns are added in place.

## 12. Files Expected to Change

### SDK (`primebrick-v3-sdk`) — Phase 0
- `src/config/iconfig-entity.ts` — add `type`, `type_config`, `reserved`.
- `src/index.ts` — export new types.

### DAL (`primebrick-dal-v3`) — Phase 0
- `src/entities/config-entity-base.ts` (new) — base class with all columns including `reserved`.
- `src/index.ts` — export.

### BE (`primebrick-be-v3`)
- `db-meta/fire-and-forget/add_config_table_standard_columns.sql` (new).
- `db-meta/fire-and-forget/update_init_patch_sha256.sql` (update existing or new variant).
- `db-meta/patches/00000000000000_init_database.sql` (in-place update: CREATE TABLE + seed).
- `src/modules/auth/auth_configuration_entity.ts` — add columns (or extend `ConfigEntityBase`).
- `src/modules/auth/auth_configurations_dal.ts` — add `findByUuid`, `update`, `softDelete`, `bulkSoftDelete`, `restore` + type validation.
- `src/modules/auth/routers/config-entries.router.ts` (new) — CRUD + step-up MFA + masking.
- `src/index.ts` — wire router.

### FE (`primebrick-fe-v3`)
- `src/lib/api-types.ts` — `ConfigEntry`, `ConfigEntryType`.
- `src/lib/api.ts` — config entry helpers.
- `src/lib/composables/useMfaChallenge.svelte.ts` (new, if not existing).
- `src/lib/components/config-list/ConfigList.svelte` (new).
- `src/lib/components/config-list/ConfigListRow.svelte` (new).
- `src/lib/components/config-list/ConfigValueInput.svelte` (new).
- `src/lib/components/config-list/ConfigBulkActionBar.svelte` (new).
- `src/lib/components/config-list/index.ts` (new).
- `src/routes/(app)/system/settings/security/+page.svelte` (rewrite).
- `src/lib/i18n/messages/{en-GB,de-DE,es-ES,fr-FR,it-IT,pt-PT}.json` — `config.auth.*` + `shell.settings.security.*`.

### Docs
- `primebrick-v3-sdk/docs/user-guide/config-tables.mdx` — `reserved` + date/time types + FE `ConfigList`.
- `primebrick-fe-v3/docs/ai/patterns.md` — config-list page pattern.
- `primebrick-fe-v3/.devin/rules/config-list-pages.md` (new) — reusable pattern rule.

---

*Planning complete. This plan will be refined during execution if any of the open questions require a different direction.*
---
