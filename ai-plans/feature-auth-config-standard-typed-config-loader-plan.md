# Plan: Auth Config Table Standardization + Reusable Config Table UI

> Status: DRAFT — awaiting approval before implementation.  
> Based on empirical codebase investigation across `primebrick-be-v3`, `primebrick-us-v3`, `primebrick-v3-sdk`, `primebrick-dal-v3`, and `primebrick-fe-v3`.

## 1. Objective

Create a single, DRY standard for Primebrick "dictionary-style" configuration tables and a reusable Frontend page to edit them.

- Refactor the BE auth configuration table (`public.auth_configurations`) to match the emailsender `config` table pattern (key/value + `label_key`/`description_key`), and rename it to `public.config`.
- Add a `type` column (plus supporting `enum_values`) to every config table so the SDK can **automatically coerce** `TEXT` values into typed primitives at load time.
- Introduce a generic `ConfigLoader<TResult>` in the SDK that reads the `type`/`enum_values` metadata and returns a strongly-typed `TResult` object whose field names match the DB keys.
- Add a `ConfigEntityBase` in the DAL so any new module gets the standard config table shape for free.
- Build a reusable `ConfigTable` Svelte component/page layout in the FE that renders a two-column table (left: translated label + description, right: widget chosen from `type`) and works for any config table (auth, emailsender, future modules).
- Add a new Settings sub-page **Auth Config** (`/system/settings/auth-config`) that uses the reusable layout to edit auth settings.
- Back-fill the emailsender `config` table with `type`/`enum_values` and migrate it to the same SDK/DAL standard.

## 2. Architectural decisions confirmed with the user

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `type` metadata source | **Add `type` (and `enum_values`) column to the config table itself** | Self-describing data; works for any new module automatically; aligns with the "Filter Panel inherits field type from metadata" pattern but stores metadata in the DB instead of hard-coding it. |
| Table name / schema | **Keep `public` schema, rename table to `config`** (`public.config`) | User explicit choice. *Risk noted*: in the monolithic BE, a single `public.config` table can only hold one module's config without collision; future BE modules should use schema-qualified tables (e.g. `billing.config`) or a prefixed name. |
| Cache / typed loader | **Generic `ConfigLoader<TResult>` in SDK** that auto-coerces string values using the DB `type` column and fills the consumer's `TResult` shape. | User wants typed result like `AuthConfig` but with `ConfigLoader<AuthConfig>`. `TResult` is consumer-defined (BE, US). |
| Scope | **One plan, phased execution** | BE table + SDK/DAL standard first, then FE reusable layout + page, then emailsender alignment. |

## 3. Standard config data model (applies to every config table)

### 3.1 Table schema

```sql
CREATE TABLE "<schema>"."config" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(100) NOT NULL,
  "value" text,                         -- raw TEXT; null means "not set"
  "type" varchar(50) NOT NULL,          -- see type vocabulary below
  "enum_values" text,                   -- JSON array of allowed strings, only for type='enum'
  "label_key" varchar(100),             -- i18n key for the setting title
  "description_key" varchar(100),       -- i18n key for the explanatory text
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text,
  "version" integer DEFAULT 1,
  "deleted_at" timestamptz,
  "deleted_by" text,
  CONSTRAINT "config_key_uq" UNIQUE ("key")
);
```

### 3.2 Type vocabulary (single source of truth for SDK coercion and FE widgets)

| `type` value | SDK coercion | FE widget | Notes |
|--------------|--------------|-----------|-------|
| `string` | string as-is | `Input` type=text | Single-line text. |
| `text` | string as-is | `Textarea` | Multi-line text. |
| `boolean` | `value === "true"` | `Switch` | DB only stores `"true"` / `"false"`; FE sends `"true"` / `"false"`. |
| `integer` | `parseInt(value, 10)` | `Input` type=number (integer) | Empty/null stays null. |
| `number` | `parseFloat(value)` | `Input` type=number | Empty/null stays null. |
| `enum` | string, validated against `enum_values` | `ComboSelect` | `enum_values` is a JSON string array. FE options are translated via `{label_key}.{value}` when a translation exists, falling back to the raw value. |
| `url` | string as-is | `Input` type=url | Validation at write/upsert path. |
| `secret` | string as-is | `Password` (masked input) | **Never returned in full to the FE in list responses**; BE returns `null` or a mask (`"••••"`) for reads, accepts updates only. |
| `json` | `JSON.parse(value)` | `Textarea` | FE stringifies on save. |

### 3.3 Data-quality rules

- **Read path (SDK `ConfigLoader`)**: only real type conversions (`string → boolean/integer/number/json`); no lowercasing, trimming, or fallback defaults. Missing keys result in `undefined` in the typed result; `null` rows result in `null`.
- **Write path**: FE and BE upsert validate per `type`/`enum_values` before writing. Secrets are write-only from the FE perspective (masked reads).
- **No fake defaults**: if a mandatory config is missing, `load()` throws a clear error (preserves current BE behavior for `auth_mode`, `auth_roles_path`, mode-specific OIDC/gateway fields).

## 4. SDK standardization

### 4.1 `IConfigEntity` extension (`primebrick-v3-sdk/src/config/iconfig-entity.ts`)

Add `type` and `enum_values`:

```typescript
export interface IConfigEntity {
  key: string;
  value: string | null;
  type: ConfigType;                 // NEW
  enum_values?: string | null;      // NEW — JSON array string, only for type='enum'
  label_key?: string;
  description_key?: string;
}

export type ConfigType =
  | "string"
  | "text"
  | "boolean"
  | "integer"
  | "number"
  | "enum"
  | "url"
  | "secret"
  | "json";
```

### 4.2 `ConfigRepositoryPort` extension (`primebrick-v3-sdk/src/ports/config-repository-port.ts`)

Return full metadata rows:

```typescript
export interface ConfigRepositoryPort {
  findAll(): Promise<Array<IConfigEntity>>;
}
```

### 4.3 Generic `ConfigLoader<TResult>` (`primebrick-v3-sdk/src/config/config-loader.ts`)

Replace the string-only loader with a generic, typed loader. Backward compatibility is maintained by existing `getTyped`/`requireTyped` consumers migrating to `ConfigLoader<TheirConfig>`.

```typescript
export class ConfigLoader<TResult extends Record<string, unknown>> {
  private cache: Map<string, unknown> | null = null;

  constructor(private readonly repo: ConfigRepositoryPort) {}

  /** Load all rows, coerce per `type`/`enum_values`, build TResult by key-name match. */
  async load(): Promise<TResult> {
    const rows = await this.repo.findAll();
    this.cache = new Map();
    const result = {} as TResult;

    for (const row of rows) {
      const coerced = coerceConfigValue(row);
      (result as Record<string, unknown>)[row.key] = coerced;
      this.cache.set(row.key, coerced);
    }

    return result;
  }

  get<K extends keyof TResult>(key: K): TResult[K] | null {
    if (this.cache === null) throw new Error("ConfigLoader.load() must be called first");
    return (this.cache.get(key as string) as TResult[K] | undefined) ?? null;
  }

  require<K extends keyof TResult>(key: K): TResult[K] {
    const value = this.get(key);
    if (value === null || value === undefined) {
      throw new Error(`Missing required config key: ${String(key)}`);
    }
    return value;
  }

  /** Convenience: get a typed value for a consumer-defined key that may not be in TResult. */
  getTyped<T>(key: string, converter: (v: string) => T): T | null { /* backward compat */ }
  requireTyped<T>(key: string, converter: (v: string) => T): T { /* backward compat */ }

  getAll(): Record<string, unknown> { /* returns coerced map */ }

  invalidate(): void { this.cache = null; }
}
```

Key implementation details:

- `coerceConfigValue(row: IConfigEntity): unknown` is a new exported SDK helper.
- For `type === "enum"`, parse `enum_values` JSON and throw if `value` is not in the allowed list.
- For `type === "json"`, `JSON.parse(value)` and throw on invalid JSON.
- For `type === "boolean"`, `value === "true"` (strict); invalid values throw at load time.
- Missing value (`null`) stays `null` for optional keys; mandatory checks happen after `load()` in consumer code or in a post-load validator.

### 4.4 Typed `AuthConfig` (consumer-defined in SDK or BE?)

The user said `TResult` is the consumer's responsibility. `AuthConfig` currently lives in `primebrick-v3-sdk/src/auth/types.ts` because both BE and microservices share it. Keep `AuthConfig` in the SDK as the typed consumer shape for the BE auth module, but **flatten it** so its keys match the DB keys exactly.

Current `AuthConfig` is nested (`mode`, `roles_path`, `oidc: { ... }`, `gateway: { ... }`). To make `ConfigLoader<AuthConfig>` work automatically, refactor `AuthConfig` to top-level fields:

```typescript
export interface AuthConfig {
  auth_mode: AuthMode;
  auth_roles_path: string;

  casdoor_endpoint?: string;
  casdoor_organization?: string;
  casdoor_client_id?: string;
  casdoor_admin_username?: string;
  casdoor_admin_password?: string;
  casdoor_builtin_client_id?: string;
  casdoor_builtin_client_secret?: string;

  oidc_issuer_url?: string;
  oidc_issuer_type?: string;
  oidc_client_id?: string;
  oidc_client_secret?: string;
  oidc_audience?: string;

  enable_email_verification_check: boolean;
  enable_webauthn: boolean;
  enable_formauth: boolean;
  passkey_required: boolean;
  password_policy?: string;

  enable_mfa: boolean;
  mfa_challenge_token_ttl_seconds: number;
  mfa_challenge_signing_secret?: string;

  gateway_secret?: string;
  gateway_secret_header?: string;
  gateway_public_secret?: string;
  gateway_public_secret_header?: string;
  gateway_header_user_id?: string;
  gateway_header_email?: string;
  gateway_header_name?: string;
  gateway_header_roles?: string;
  gateway_header_idp_code?: string;
  gateway_header_idp_org?: string;
  gateway_header_idp_username?: string;

  invitation_expiry_days?: number;
  admin_contact_email?: string;
  notification_alert_secret?: string;
  frontend_url?: string;
}
```

> **Open decision point**: If preserving the nested `oidc` / `gateway` grouping is preferred, we can keep `AuthConfig` nested and instead pass a lightweight `transform: (raw: Record<string, unknown>) => TResult` function to `ConfigLoader.load()`. This still auto-coerces raw values from the DB, but the consumer arranges them into the final shape. The plan recommends **flattening** for maximum type safety and adherence to snake-case/no-renaming conventions; the transform approach is documented as the fallback if flattening is rejected.

### 4.5 Remove `AuthConfigCache` (or keep as thin re-export)

`primebrick-v3-sdk/src/auth/auth-config-cache.ts` currently caches a typed `AuthConfig` via `AuthConfigPort`. Replace it with `ConfigLoader<AuthConfig>`:

- Delete `AuthConfigPort`.
- Provide `initAuthConfig(loader: ConfigLoader<AuthConfig>)` / `loadAuthConfig()` / `getAuthConfig()` / `invalidateAuthConfig()` as thin re-exports that delegate to the loader.
- This preserves the existing `getAuthConfig()` API used by ~15 files in the BE, while the underlying cache becomes the generic `ConfigLoader`.

## 5. DAL standardization

### 5.1 Add `ConfigEntityBase` to `@primebrick/dal-pg`

New file: `primebrick-dal-v3/src/entities/config-entity-base.ts`.

```typescript
import {
  Column,
  Entity,
  Key,
  Unique,
  AuditableField,
  AuditableFieldType,
  DeletableField,
  DeletableFieldType,
  AuditTrail,
  type IAuditableEntity,
} from "@primebrick/dal-pg";
import type { IConfigEntity } from "@primebrick/sdk";

@AuditTrail()
export abstract class ConfigEntityBase implements IConfigEntity, IAuditableEntity {
  @Key() id!: bigint;
  @Unique() uuid!: string;

  @Unique()
  @Column({ length: 100, nullable: false })
  key!: string;

  @Column({ nullable: true })
  value!: string | null;

  @Column({ length: 50, nullable: false })
  type!: string;

  @Column({ nullable: true })
  enum_values!: string | null;

  @Column({ length: 100, nullable: true })
  label_key?: string;

  @Column({ length: 100, nullable: true })
  description_key?: string;

  @AuditableField(AuditableFieldType.CREATED_AT) created_at!: Date;
  @AuditableField(AuditableFieldType.CREATED_BY) created_by!: string;
  @AuditableField(AuditableFieldType.UPDATED_AT) updated_at!: Date;
  @AuditableField(AuditableFieldType.UPDATED_BY) updated_by!: string;
  @AuditableField(AuditableFieldType.VERSION) version!: number;
  @DeletableField(DeletableFieldType.DELETED_AT) deleted_at?: Date;
  @DeletableField(DeletableFieldType.DELETED_BY) deleted_by?: string;
}
```

### 5.2 Usage in BE and emailsender

BE auth config entity becomes:

```typescript
import { ConfigEntityBase } from "@primebrick/dal-pg";

@Entity("config", "public")
export class ConfigEntryEntity extends ConfigEntityBase {}
```

emailsender config entity becomes:

```typescript
import { ConfigEntityBase } from "@primebrick/dal-pg";

@Entity("config", "emailsender")
export class ConfigEntryEntity extends ConfigEntityBase {}
```

This is the DRY "unique logic source" the user requested: any future module adds a `ConfigEntryEntity` extending the base and gets the standard columns automatically.

## 6. BE auth module refactor

### 6.1 Files to rename / create / delete

| Current | New | Action |
|---------|-----|--------|
| `src/modules/auth/auth_configuration_entity.ts` | `src/modules/auth/config_entry_entity.ts` | Rename and extend `ConfigEntityBase` |
| `src/modules/auth/auth_configurations_dal.ts` | `src/modules/auth/config_entry_dal.ts` or `src/modules/auth/config_dal.ts` | Rename, refactor to generic entity DAL |
| `src/modules/auth/config-repo.ts` | `src/modules/auth/config-loader.ts` or merge into `src/modules/auth/sdk-auth-ports.ts` | Refactor to typed `ConfigLoader<AuthConfig>` setup |
| `src/modules/auth/sdk-auth-ports.ts` | keep, simplified | Implement `ConfigRepositoryPort` using DAL |
| `src/modules/auth/config.ts` | keep, re-export `getAuthConfig` etc. from SDK | Thin wrapper around `ConfigLoader` |

### 6.2 DB migration

New patch file under `primebrick-be-v3/db-meta/patches/` (e.g. `000X_rename_auth_configurations_to_config_add_type_columns.sql`):

```sql
-- Rename table to public.config
ALTER TABLE "public"."auth_configurations" RENAME TO "config";

-- Rename unique index
ALTER INDEX "auth_configurations_key_uq" RENAME TO "config_key_uq";
ALTER INDEX "auth_configurations_deleted_at_idx" RENAME TO "config_deleted_at_idx";

-- Add type and enum_values columns
ALTER TABLE "public"."config"
  ADD COLUMN "type" varchar(50) NOT NULL DEFAULT 'string',
  ADD COLUMN "enum_values" text,
  ADD COLUMN "label_key" varchar(100),
  ADD COLUMN "description_key" varchar(100);

-- Drop old description column (replaced by description_key)
ALTER TABLE "public"."config" DROP COLUMN "description";

-- Widen key column to 100 for consistency with ConfigEntityBase
ALTER TABLE "public"."config" ALTER COLUMN "key" TYPE varchar(100);

-- Make value nullable (null means "not set")
ALTER TABLE "public"."config" ALTER COLUMN "value" DROP NOT NULL;

-- Update existing rows with correct type, label_key, description_key, enum_values
UPDATE "public"."config" SET
  "type" = 'url',
  "label_key" = 'config.auth.casdoor_endpoint.label',
  "description_key" = 'config.auth.casdoor_endpoint.description'
WHERE "key" = 'casdoor_endpoint';

-- ... repeat for every existing key (boolean, integer, enum, secret, string, url)

UPDATE "public"."config" SET
  "type" = 'enum',
  "enum_values" = '["STANDALONE","GATEWAY"]',
  "label_key" = 'config.auth.auth_mode.label',
  "description_key" = 'config.auth.auth_mode.description'
WHERE "key" = 'auth_mode';

UPDATE "public"."config" SET
  "type" = 'enum',
  "enum_values" = '["alpha_numeric","letter_and_number","letter_number_special","mixed_case_special"]',
  "label_key" = 'config.auth.password_policy.label',
  "description_key" = 'config.auth.password_policy.description'
WHERE "key" = 'password_policy';

UPDATE "public"."config" SET
  "type" = 'integer',
  "label_key" = 'config.auth.invitation_expiry_days.label',
  "description_key" = 'config.auth.invitation_expiry_days.description'
WHERE "key" = 'invitation_expiry_days';

UPDATE "public"."config" SET
  "type" = 'secret',
  "label_key" = 'config.auth.notification_alert_secret.label',
  "description_key" = 'config.auth.notification_alert_secret.description'
WHERE "key" = 'notification_alert_secret';

-- boolean keys: enable_email_verification_check, enable_formauth, enable_webauthn, passkey_required, enable_mfa
-- string keys: casdoor_organization, casdoor_client_id, casdoor_admin_username, casdoor_admin_role, oidc_issuer_type, oidc_client_id, auth_roles_path, admin_contact_email, frontend_url, mfa_challenge_signing_secret
-- url keys: casdoor_endpoint, oidc_issuer_url, frontend_url (frontend_url is also url? or string?)
```

> **Seed data migration** is the largest piece: every existing key needs `type`, `label_key`, `description_key`, and `enum_values` where applicable. The SQL patch must be exhaustive. Translation keys should follow the convention `{translationKey}.{key}.label` and `{translationKey}.{key}.description` where `translationKey` is `config.auth` (snake_case singular) per the BE data-model/translation-key conventions.

### 6.3 `ConfigRepositoryPort` adapter (BE)

```typescript
// src/modules/auth/sdk-auth-ports.ts
export class BeAuthConfigRepositoryAdapter implements ConfigRepositoryPort {
  constructor(private dal: ConfigEntryDal) {}

  async findAll(): Promise<IConfigEntity[]> {
    return this.dal.findAll();
  }
}
```

### 6.4 Startup wiring (`src/index.ts`)

Replace `refreshAuthConfig()` to use `ConfigLoader`:

```typescript
const configLoader = new ConfigLoader<AuthConfig>(new BeAuthConfigRepositoryAdapter(new ConfigEntryDal(pool)));
await configLoader.load();
initAuthConfig(configLoader);
```

### 6.5 BE entity CRUD endpoints for the FE

Following the microservice `api-path-conventions` pattern, expose the BE config table as:

- `GET /api/v1/entities/config_entries/meta`
- `GET /api/v1/entities/config_entries/list`
- `GET /api/v1/entities/config_entries/:uuid`
- `PUT /api/v1/entities/config_entries/:uuid`

These endpoints live in a new route file, e.g. `src/modules/auth/routers/config-entries.router.ts` or `src/modules/system/routers/config-entries.router.ts`.

**Important security rules for the list endpoint:**

- `type='secret'` rows must have their `value` masked or `null` in the response. The FE `ConfigTable` shows a placeholder and allows overwrite.
- Only keys the authenticated user is permitted to see are returned. The BE auth config settings page should require an admin/settings permission.
- `GET /api/v1/auth/config` (public, limited flags) remains unchanged in behavior but reads from the new `ConfigLoader<AuthConfig>` and returns the same small subset of booleans.

### 6.6 Mandatory validation on `ConfigLoader.load()`

The current `loadAuthConfigFromDb` validates `auth_mode`, `auth_roles_path`, mode-specific OIDC/gateway fields, and the "at least one auth method" rule. Move this validation into a consumer-supplied `validate` step after `ConfigLoader<AuthConfig>.load()`:

```typescript
export async function loadAuthConfig(pool: Pool): Promise<AuthConfig> {
  const loader = getGlobalAuthConfigLoader(); // or create here
  const config = await loader.load();
  validateAuthConfig(config); // throws on missing mandatory fields
  return config;
}
```

`validateAuthConfig` becomes a BE-specific function (not in SDK), preserving the current startup failure behavior.

### 6.7 Consumer updates in BE services

All files that currently call `getAuthConfig()` will need to update field access from the nested shape to the flat shape:

- `authConfig.mode` → `authConfig.auth_mode`
- `authConfig.oidc.client_id` → `authConfig.oidc_client_id`
- `authConfig.gateway.headers.user_id` → `authConfig.gateway_header_user_id`
- `authConfig.enable_webauthn` stays the same (already flat)

**Files affected (from subagent research):**

- `src/modules/auth/services/auth-session.service.ts`
- `src/modules/auth/services/webauthn.service.ts`
- `src/modules/auth/services/user.service.ts`
- `src/modules/auth/services/role.service.ts`
- `src/modules/auth/services/organizations.service.ts`
- `src/modules/auth/services/invitation.service.ts` (uses DAL directly; migrate to typed loader where appropriate)
- `src/modules/auth/services/mfa.service.ts` (uses DAL directly; migrate)
- `src/modules/auth/services/casdoor.service.ts` (uses DAL directly; migrate)
- `src/modules/auth/auth.middleware.ts`
- `src/modules/auth/rbac.middleware.ts`
- `src/modules/proxy/proxy-service.ts`
- `src/modules/mcp/oauth/metadata.ts`
- `src/modules/mcp/oauth/authorize.ts`
- `src/modules/mcp/oauth/token.ts`
- `src/modules/mcp/token-verifier.ts`
- `src/modules/system/system-router.ts`
- `src/modules/auth/routers/users.router.ts`
- `src/modules/auth/routers/user-profiles.router.ts`
- `src/modules/auth/routers/auth-session.router.ts`

The mechanical refactor is: replace direct `AuthConfigurationsDal.findByKey` calls with `configLoader.require('key')` or `configLoader.get('key')` returning the coerced typed value.

## 7. Emailsender alignment

### 7.1 Add `type` and `enum_values` columns

New patch for `primebrick-us-v3/emailsender/db-meta/patches/`:

```sql
ALTER TABLE "emailsender"."config"
  ADD COLUMN "type" varchar(50) NOT NULL DEFAULT 'string',
  ADD COLUMN "enum_values" text;

UPDATE "emailsender"."config" SET
  "type" = 'url',
  "label_key" = 'config.emailsender.nats_url.label',
  "description_key" = 'config.emailsender.nats_url.description'
WHERE "key" = 'nats_url';

UPDATE "emailsender"."config" SET
  "type" = 'string',
  "label_key" = 'config.emailsender.service_code.label',
  "description_key" = 'config.emailsender.service_code.description'
WHERE "key" = 'service_code';

UPDATE "emailsender"."config" SET
  "type" = 'integer',
  "label_key" = 'config.emailsender.http_port.label',
  "description_key" = 'config.emailsender.http_port.description'
WHERE "key" = 'http_port';
```

### 7.2 Refactor emailsender to `ConfigLoader<EmailSenderConfig>`

- Define `EmailSenderConfig` interface in emailsender (or SDK if shared):
  ```typescript
  interface EmailSenderConfig {
    nats_url: string;
    service_code: string;
    http_port: number;
  }
  ```
- Update `ConfigRepositoryAdapter` to return full `IConfigEntity` rows.
- Replace `parseInt(configLoader.require('http_port'), 10)` with `configLoader.require('http_port')` (returns `number`).
- Call `configLoader.load()` at startup and store in a local composable/service.

### 7.3 Cache invalidation on config update

The current emailsender `PUT /api/v1/entities/config_entries/:uuid` does not invalidate the `ConfigLoader` cache. After this refactor, the route handler must call `configLoader.invalidate()` then `configLoader.load()` (or a reload helper) on successful update so the running service picks up the new value without restart.

## 8. Frontend standard reusable ConfigTable

### 8.1 Data types (`primebrick-fe-v3/src/lib/api-types.ts`)

```typescript
export type ConfigEntry = {
  uuid: string;
  key: string;
  value: string | null;
  type: ConfigEntryType;
  enum_values?: string | null;
  label_key?: string;
  description_key?: string;
  version: number;
};

export type ConfigEntryType =
  | "string"
  | "text"
  | "boolean"
  | "integer"
  | "number"
  | "enum"
  | "url"
  | "secret"
  | "json";
```

### 8.2 New component: `ConfigTable.svelte`

Location: `primebrick-fe-v3/src/lib/components/config-table/ConfigTable.svelte`.

Props:

```typescript
type Props = {
  entries: ConfigEntry[];
  loading?: boolean;
  error?: string | null;
  /** Called when the user changes a value. The component coerces to string before calling. */
  onSave: (entry: ConfigEntry, value: string) => Promise<void>;
  /** Optional base translation key prefix for labels/descriptions. */
  translationPrefix?: string;
};
```

Rendering logic (two-column layout):

- Left column (label/description):
  - Label: `$t(entry.label_key ?? fallbackKey)`
  - Description: `$t(entry.description_key ?? fallbackDescriptionKey)` (only if present)
- Right column (widget):
  - `string` / `url` / `json` → `Input` or `Textarea`
  - `text` / `json` → `Textarea`
  - `integer` / `number` → `Input type="number"`
  - `boolean` → `Switch` bound to `'true'` / `'false'`
  - `enum` → `ComboSelect` with options parsed from `enum_values`
  - `secret` → `Password` input with masked current value and save-on-blur/confirm

Widget state and save behavior:

- For `boolean` and `enum`: save immediately on change.
- For text/number: save on blur (with optional debounce).
- For `secret`: show a "Save" button next to the input to avoid accidental overwrites.

Type coercion to string before `onSave`:

- `boolean`: `'true'` / `'false'`
- `integer` / `number`: `String(value)`
- `json`: `JSON.stringify(value, null, 2)`
- all others: as-is string

### 8.3 New API helpers (`primebrick-fe-v3/src/lib/api.ts`)

```typescript
export async function fetchConfigEntries(entity: string): Promise<ConfigEntry[]> {
  const res = await apiFetch(`/api/v1/entities/${encodeURIComponent(entity)}/list`);
  return (await res.json())[entity] ?? [];
}

export async function updateConfigEntry(entity: string, entry: ConfigEntry, value: string): Promise<void> {
  await apiFetch(`/api/v1/entities/${encodeURIComponent(entity)}/${encodeURIComponent(entry.uuid)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, version: entry.version }),
  });
}
```

For microservice config, reuse the existing `fetchModuleConfig` / `updateModuleConfigKey` helpers, but return rows now include `type` and `enum_values`.

### 8.4 New Settings page: `/system/settings/auth-config`

Route file: `primebrick-fe-v3/src/routes/(app)/system/settings/auth-config/+page.svelte`

- Calls `fetchConfigEntries('config_entries')` (or whichever entity name the BE exposes).
- Renders `<ConfigTable entries={...} onSave={handleSave} />`.
- Handles loading/error states and success/error toasts.

### 8.5 Register Settings tab

1. BE: add to `primebrick-be-v3/src/modules/module-nav-meta.ts`:
   ```typescript
   { id: "auth-config", label_key: "shell.settings.tabs.authConfig", href: "/system/settings/auth-config", icon: "lock" },
   ```
2. FE translations: add `shell.settings.tabs.authConfig` to all `src/lib/i18n/messages/*.json` files.
3. FE: route exists at `/system/settings/auth-config`.

### 8.6 Refactor existing Module Config tab

The existing `src/routes/(app)/system/settings/modules/[code]/+page.svelte` config rendering block should be replaced with `<ConfigTable entries={configEntries} onSave={handleSaveConfigKey} />` once the BE microservice `config` rows include `type` and `enum_values`.

## 9. Permissions and RBAC

- The new `GET/PUT /api/v1/entities/config_entries/...` endpoints for auth config must be admin-only.
- Use an existing admin permission or add a new permission to the BE `Permission` enum (exact permission to verify during implementation; candidates: `settings.update.config`, `modules.update.config`, or an existing admin wildcard).
- The public `GET /api/v1/auth/config` endpoint stays public and continues to expose only safe boolean flags (`enable_formauth`, `enable_webauthn`, `passkey_required`, `enable_mfa`).

## 10. Phased execution plan

### Phase 0 — Foundation: SDK + DAL (no BE/US changes yet)

1. Update `IConfigEntity` in SDK to include `type` and `enum_values`.
2. Update `ConfigRepositoryPort` to return `IConfigEntity[]`.
3. Implement generic `ConfigLoader<TResult>` with `coerceConfigValue()` helper.
4. Add `ConfigEntityBase` to DAL.
5. Export new SDK/DAL types.
6. **Verification**: unit tests for `coerceConfigValue` covering boolean, integer, number, enum, json, secret, string, null.
7. **Blocker checkpoint**: SDK/DAL must be built and version-bumped so BE/US can import them.

### Phase 1 — BE table + entity + DAL

1. Create DB patch to rename `auth_configurations` → `config`, add `type`/`enum_values`/`label_key`/`description_key`, seed all types.
2. Rename `AuthConfigurationEntity` → `ConfigEntryEntity` extending `ConfigEntityBase`.
3. Refactor `AuthConfigurationsDal` → `ConfigEntryDal`.
4. Implement `BeAuthConfigRepositoryAdapter` (`ConfigRepositoryPort`).
5. Replace `AuthConfigCache` usage with `ConfigLoader<AuthConfig>`.
6. Flatten `AuthConfig` shape (or implement transform fallback if user rejects flattening).
7. Update all BE consumers (services, routers, middleware, MCP, proxy) to use new flat field names and `configLoader.require/get`.
8. Add `validateAuthConfig()` for startup mandatory checks.
9. **Verification**: `pnpm run build` for BE; `pnpm run db:meta:compare`; run BE and confirm startup does not throw.

### Phase 2 — BE API endpoints for FE

1. Create `config-entries.router.ts` with `meta`, `list`, `get`, `update` endpoints.
2. Ensure secret masking in `list`/`get` responses.
3. Wire router into `src/index.ts`.
4. Add permission check.
5. Add auth-config tab to `module-nav-meta.ts`.
6. **Verification**: call `GET /api/v1/entities/config_entries/list` with admin user; confirm `type`, `enum_values`, `label_key`, `description_key` are present; confirm `secret` values are masked.

### Phase 3 — Frontend reusable ConfigTable + Auth Config page

1. Add `ConfigEntry` / `ConfigEntryType` types to `src/lib/api-types.ts`.
2. Create `ConfigTable.svelte` component with two-column layout and widget mapping.
3. Add `fetchConfigEntries` / `updateConfigEntry` helpers.
4. Create `auth-config/+page.svelte` route.
5. Add `shell.settings.tabs.authConfig` translations.
6. **Verification**: open `/system/settings/auth-config`; confirm boolean switches, enum selects, number inputs, secret masking render correctly; confirm saving updates the BE and cache invalidates.

### Phase 4 — Emailsender alignment

1. Add `type`/`enum_values` columns to `emailsender.config`.
2. Update emailsender `ConfigEntryEntity` to extend `ConfigEntityBase`.
3. Update `ConfigRepositoryAdapter` to return full `IConfigEntity` rows.
4. Define `EmailSenderConfig` and use `ConfigLoader<EmailSenderConfig>`.
5. Update call sites (`parseInt` etc.).
6. Add cache invalidation on `PUT /api/v1/entities/config_entries/:uuid`.
7. **Verification**: emailsender builds and starts; config values are correctly typed; update endpoint refreshes the cache.

### Phase 5 — Cleanup and documentation

1. Delete obsolete `auth-config-cache.ts` and `AuthConfigPort` if no longer used.
2. Remove `loadAuthConfigFromDb` and `AuthConfigDb` (replaced by loader + `AuthConfig`).
3. Update SDK docs (`README.md`, `docs/user-guide/*.mdx`) to describe the `IConfigEntity` / `ConfigLoader<TResult>` pattern.
4. Run full `pnpm run build` in affected repos.
5. Run FE `pnpm run check` (Svelte type-check) if available.

## 11. Acceptance criteria

- [ ] `public.auth_configurations` is renamed to `public.config` and has `key`, `value`, `type`, `enum_values`, `label_key`, `description_key` columns.
- [ ] `@primebrick/sdk` exports `IConfigEntity` (with `type`/`enum_values`) and generic `ConfigLoader<TResult>` that auto-coerces values by `type`.
- [ ] `@primebrick/dal-pg` exports `ConfigEntityBase` used by both BE and emailsender.
- [ ] BE auth module uses `ConfigLoader<AuthConfig>` and all consumers compile.
- [ ] `GET /api/v1/entities/config_entries/list` returns config rows with `type`, `enum_values`, `label_key`, `description_key` and masks `secret` values.
- [ ] `PUT /api/v1/entities/config_entries/:uuid` updates a value, invalidates the BE cache, and the running service sees the new value without restart.
- [ ] FE has a reusable `ConfigTable` component that renders label/description on the left and the correct widget on the right based on `type`.
- [ ] New Settings page `/system/settings/auth-config` exists, is reachable from the settings tab, and allows editing auth config.
- [ ] Emailsender `config` table has `type`/`enum_values` and uses `ConfigLoader<EmailSenderConfig>`; its `PUT` endpoint invalidates its cache.
- [ ] Existing public `GET /api/v1/auth/config` continues to return the same safe flags.
- [ ] No fake defaults are introduced on the read path; all mandatory checks happen at load time.

## 12. Risks and open questions

1. **`public.config` name collision**: A monolithic BE cannot have two `public.config` tables. Future non-auth BE modules that need config must use schema-qualified tables (e.g. `billing.config`) or prefixed names. This is acceptable for now because auth is the only BE config table.
2. **`AuthConfig` flattening**: Requires updating ~15 consumer files. If the nested `oidc`/`gateway` grouping must be preserved, we can add a `transform` parameter to `ConfigLoader.load()` at the cost of slightly less "automatic" mapping. The plan recommends flattening.
3. **Secret handling**: We must ensure `secret` values are never returned to the FE in clear text and are never logged. The plan proposes masking in the list/get response.
4. **Translation keys**: A large batch of new translation keys must be added for every config key. The seed/migration must be exhaustive; missing `label_key` should fall back to the raw `key` in the FE (already supported by `ConfigTable`).
5. **Permission name**: The exact permission constant for the auth-config settings page needs to be confirmed against the BE `Permission` enum during implementation.
6. **SDK version bump**: SDK and DAL are published packages; local `pnpm` workspace links may need to be rebuilt/relinked before BE/US pick up changes. CI publication only happens on release merge; development uses workspace links or local `pnpm install`.

## 13. Files expected to change

### SDK (`primebrick-v3-sdk`)
- `src/config/iconfig-entity.ts`
- `src/config/config-loader.ts`
- `src/config/coerce-config-value.ts` (new)
- `src/ports/config-repository-port.ts`
- `src/auth/types.ts` (flatten `AuthConfig`, remove `OidcConfig`/`GatewayConfig` or deprecate)
- `src/auth/auth-config-cache.ts` (delete or thin re-export)
- `src/auth/ports/auth-config-port.ts` (delete)
- `src/index.ts` (exports)
- `README.md` / `docs/user-guide/*.mdx`

### DAL (`primebrick-dal-v3`)
- `src/entities/config-entity-base.ts` (new)
- `src/index.ts` (export)

### BE (`primebrick-be-v3`)
- `db-meta/patches/000X_rename_auth_configurations_to_config_add_type_columns.sql` (new)
- `src/modules/auth/config_entry_entity.ts` (rename from `auth_configuration_entity.ts`)
- `src/modules/auth/config_entry_dal.ts` (rename from `auth_configurations_dal.ts`)
- `src/modules/auth/config-repo.ts` (delete or transform)
- `src/modules/auth/config.ts` (re-export)
- `src/modules/auth/sdk-auth-ports.ts`
- `src/modules/auth/routers/config-entries.router.ts` (new) or extend existing auth router
- `src/modules/module-nav-meta.ts`
- `src/index.ts` (startup wiring)
- `src/modules/auth/services/*.ts` (consumer updates)
- `src/modules/auth/*.middleware.ts`
- `src/modules/proxy/proxy-service.ts`
- `src/modules/mcp/oauth/*.ts`, `src/modules/mcp/token-verifier.ts`
- `src/modules/system/system-router.ts`
- `src/modules/auth/routers/*.router.ts`

### US / emailsender (`primebrick-us-v3`)
- `emailsender/db-meta/patches/000X_config_add_type_and_enum_values.sql` (new)
- `emailsender/src/domain/entities/config_entry_entity.ts`
- `emailsender/src/adapters/config-repository-adapter.ts`
- `emailsender/src/adapters/auth-ports-adapter.ts`
- `emailsender/src/index.ts` (startup wiring)
- `emailsender/src/server/config-route.ts` (cache invalidation on PUT, meta fields)

### FE (`primebrick-fe-v3`)
- `src/lib/api-types.ts`
- `src/lib/api.ts` (add helpers)
- `src/lib/components/config-table/ConfigTable.svelte` (new)
- `src/lib/components/config-table/index.ts` (new)
- `src/routes/(app)/system/settings/auth-config/+page.svelte` (new)
- `src/lib/i18n/messages/*.json` (new `shell.settings.tabs.authConfig` + all `config.auth.*` keys)
- `src/routes/(app)/system/settings/modules/[code]/+page.svelte` (refactor to use `ConfigTable`)

---

*Planning complete. This plan will be refined during execution if any of the open questions above require a different direction.*

---

## 11. Redis cache layer impact (added after plan was drafted)

A new best-effort Redis cache layer has been introduced in the SDK since this
plan was first drafted. It is **complementary** to the `ConfigLoader` in-memory
cache and does not change the plan's core design — but the implementation
must account for it.

### 11.1 What the Redis layer caches

- **Only single-row finders**: `findById`, `findByUUID`, `find` (limit: 1).
- **Only entities marked `@Cached()`**. Other entities pass through untouched.
- **`findAll` and `findByPage` are NOT cached** — high-cardinality keys, memory
  bomb risk, stale-on-write window dangerous for list views.

This means the Redis layer does **not** cache the `ConfigEntryEntity.findAll()`
call that `ConfigLoader.load()` makes. The two caches serve different scopes:

| Cache | Scope | Populated by | Invalidated by |
|-------|-------|--------------|----------------|
| `ConfigLoader` in-memory `Map` | Full typed dictionary for one module | `load()` at startup | `invalidate()` + `load()` after a config update |
| Redis `withCache` | Single `ConfigEntryEntity` row by UUID/ID | `findByUUID` / `findById` on `@Cached()` entities | DAL write (automatic prefix invalidation) |

### 11.2 Decision: do NOT mark `ConfigEntryEntity` as `@Cached()`

Rationale:

1. `ConfigLoader` already provides the hot-path cache (`get` / `require` are
   zero-DB-hit). Adding a Redis layer in front of `findAll` would be
   redundant — `findAll` is not cached by `withCache` anyway.
2. Single-row reads of `ConfigEntryEntity` (e.g. `findByUUID`) are only used
   by the BE upsert path on a config update, where the freshest possible
   row is required. A Redis-cached row there would risk stale writes.
3. The `ConfigLoader` in-memory cache is the right place for config data:
   it is invalidated atomically by the route handler after a successful
   upsert, with no Redis round-trip.

So `ConfigEntryEntity` (both `public.config` in BE and `emailsender.config`
in US) stays **undecorated** by `@Cached()`. The Redis layer is simply not
used for config rows.

### 11.3 What the implementation MUST do for cache correctness

When a config value is updated via `PUT /api/v1/entities/config_entries/:uuid`:

1. **DAL write** — `ConfigEntryDal.update(...)` writes the new value to the DB.
   Because `ConfigEntryEntity` is NOT `@Cached()`, `withCache` does nothing
   here (no Redis prefix to invalidate). This is the desired behavior.
2. **In-memory cache invalidation** — the route handler MUST call
   `configLoader.invalidate()` followed by `configLoader.load()` so the
   running service picks up the new value without a restart. This is the
   primary cache-invalidation step.
3. **No Redis call** — do not call `cachePort.invalidate(...)` for config
   rows. There is nothing to invalidate.

If a future module decides to mark its `ConfigEntryEntity` as `@Cached()`
(e.g. for some hot single-row read path), the route handler must
additionally call `cachePort.invalidateByPrefix(entityTablePrefix)` after
the DAL write. The standard `withCache` wrapper would do this
automatically when going through the wrapped repository, so the
recommendation is: **always use the `withCache`-wrapped repository for
writes if the entity is `@Cached()`**, and the invalidation is handled.

### 11.4 Documentation already updated

The new docs (added in the pre-implementation step) cover this explicitly:

- `primebrick-v3-sdk/docs/user-guide/config-tables.mdx` — "Caching" section
  explains the two complementary caches and the invalidation sequence.
- `primebrick-v3-docs/pages/getting-started/config-modules.mdx` — "Caching"
  section mirrors the same explanation at the architectural level.

No further doc changes are needed for the Redis/config interaction.

### 11.5 Test coverage to add

In addition to the tests listed in §10, add:

- `ConfigLoader` invalidation test: after `invalidate()` + `load()`, the
  typed result reflects a value that was changed in the DB between the two
  `load()` calls.
- BE config update route test: after `PUT /api/v1/entities/config_entries/:uuid`,
  a subsequent call to `configLoader.get(key)` returns the new value (not
  the stale one). This proves the route handler calls
  `invalidate()` + `load()`.

These are unit/integration tests, not Redis tests — the Redis layer is
intentionally not exercised for config rows.
