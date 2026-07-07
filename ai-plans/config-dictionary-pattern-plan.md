# Plan: Config Dictionary Pattern — replicable key/value config table per microservice

> Status: DRAFT — awaiting user approval (PROCEED keyword).
> Scope: `primebrick-us-v3/emailsender` only. The config loader logic (`IConfigEntity` + `ConfigService`) will live in a new `@primebrick/sdk` package — see the separate `primebrick-sdk-plan.md`. Other microservices adopt the same pattern when created.
> Repositories analyzed (empirically, zero assumptions):
> - `primebrick-dal-v3` — the shared DAL library (`@primebrick/dal-pg`), read-only reference for entity decorators and the `Dal` gateway.
> - `primebrick-us-v3/emailsender` — the first microservice to adopt the pattern.
> - `primebrick-be-v3` — read-only reference for the `auth_configurations` dictionary pattern and the migration patch runner.

---

## 1. Objective

Introduce a **generic dictionary-style configuration table pattern** (`<schema>.config`) that every microservice can replicate in its own DB schema. The table name is just `config`; the schema provides isolation (e.g. `SELECT * FROM emailsender.config`). Each microservice owns a `config` table holding key/value rows (one row per config key), with type conversion performed at read time (string → boolean / number / enum / object). The pattern is backed by:

1. An idempotent SQL migration patch per microservice following BE's `db-meta/patches/` pattern. The `config` table is created **empty** — no seed data. The user populates it when a concrete need arises.
2. A concrete entity class per microservice implementing `IAuditableEntity` (from `@primebrick/dal-pg`), decorated with `@Entity("config", "<schema>")`, with `key`/`value`/`label_key`/`description_key` fields.

The config loader logic (`IConfigEntity` + `ConfigService`) will live in a new `@primebrick/sdk` package — see the separate `primebrick-sdk-plan.md`. This plan covers ONLY the emailsender-side changes: the SQL migration patch, the `ConfigEntryEntity`, the `ProviderEntity` rename, and the migration runner.

**Scope change from the previous version of this plan:** The existing `email_config` table is **RENAMED to `providers`** and the `EmailConfigEntity` is **RENAMED to `ProviderEntity`** (in `provider_entity.ts`) as part of this plan. They serve a different purpose — provider-specific settings linked to specific sender email addresses (one row per provider: `brevo`, `sendgrid`, etc. with `provider`/`api_key`/`api_endpoint`/`from_email`/`from_name`/`reply_to` columns). `email-service.ts` and existing tests are **updated** to reference `ProviderEntity` instead of `EmailConfigEntity`. The new `emailsender.config` table is a generic key-value dictionary, empty, for future use. No seed data.

---

## 2. Empirical findings (what exists today, with file:line citations)

### 2.1 DAL library (`primebrick-dal-v3`)

#### 2.1.1 Public exports — `src/index.ts` (lines 100-124)

The library currently exports these types and the `Dal` gateway:

```typescript
export {
  type WithDeletedRecords,
  type FindByIdOptions,
  type FindOptions,
  type FindByUUIDOptions,
  type PaginatedEntity,
  type WriteOptions,
  type AuditableWriteOptions,
  type MatchByOptions,
  type BulkOptions,
  type UpsertOptions,
  type AuditPort,
  type AuditParams,
  type LoggerPort,
  AuditAction,
} from "./types/types.js";

export {
  type IExposableEntity,
  type IDeletableEntity,
  type IAuditableEntity,
  type IClonableEntity,
} from "./types/entities.js";

export {
  Dal,
  getDal,
  resetDal,
  type DalConfig,
  type WithClientOptions,
} from "./dal/dal.js";
```

(`src/index.ts:100-124`). There is **no** `IConfigEntity` or `ConfigService` export today.

#### 2.1.2 Entity interfaces — `src/types/entities.ts` (lines 6-19)

```typescript
export interface IDeletableEntity {
  deleted_at?: Date;
  deleted_by?: string;
}

export interface IAuditableEntity extends IDeletableEntity {
  created_at: Date;
  created_by: string;
  updated_at: Date;
  updated_by: string;
  version: number;
}
```

(`src/types/entities.ts:6-19`). Note `IAuditableEntity` already extends `IDeletableEntity`, so a config entity implementing `IAuditableEntity` gets soft-delete fields for free.

#### 2.1.3 Write option types — `src/types/types.ts` (lines 44-80)

```typescript
export type WriteOptions = {
  audit?: AuditPort;
  logger?: LoggerPort;
};

export type AuditableWriteOptions = WriteOptions & {
  actor: string;
};

export type MatchByOptions<TEntity> = {
  matchBy?: keyof TEntity & string;
};

export type BulkOptions = {
  batchSize?: number;
  timeoutMs?: number;
};

export type UpsertOptions = {
  conflictTarget?: string;
};
```

(`src/types/types.ts:44-80`). `AuditableWriteOptions` requires `actor: string`. `UpsertOptions` accepts `conflictTarget?: string` — used to target the `key` column for upserts.

#### 2.1.4 FindOptions — `src/types/types.ts` (lines 22-30)

```typescript
export type FindOptions = {
  deletedRecords?: WithDeletedRecords;
  filters?: FilterExpr[];
  sorting?: SortingExpr[];
  joins?: JoinExpr[];
  stream?: boolean;
};
```

(`src/types/types.ts:22-30`).

#### 2.1.5 WithDeletedRecords — `src/types/types.ts` (line 12)

```typescript
export type WithDeletedRecords = "EXCLUDED" | "ONLY" | "INCLUDED";
```

(`src/types/types.ts:12`). `"EXCLUDED"` = exclude soft-deleted rows (the default for config lookups).

#### 2.1.6 Dal class method signatures — `src/dal/dal.ts`

```typescript
// find (lines 235-241)
async find<TEntity extends object, TResult = TEntity>(
  entity: EntityClass,
  fields?: FieldProjector[] | null,
  options?: FindOptions,
): Promise<TResult | null>

// findAll (lines 243-249)
async findAll<TEntity extends object, TResult = TEntity>(
  entity: EntityClass,
  fields?: FieldProjector[] | null,
  options?: FindOptions,
): Promise<TResult[] | AsyncIterable<TResult>>

// count (lines 261-263)
async count(entity: EntityClass): Promise<number>

// add — auditable overload (lines 267-273)
async add<TEntity extends object & IAuditableEntity>(
  entity: EntityClass & { new (): TEntity },
  row: Partial<Record<keyof TEntity & string, unknown>>,
  options: AuditableWriteOptions,
): Promise<TEntity>;

// add — non-auditable overload (lines 275-280)
async add<TEntity extends object>(
  entity: EntityClass & { new (): TEntity },
  row: Partial<Record<keyof TEntity & string, unknown>>,
  options: WriteOptions,
): Promise<TEntity>;

// upsert — auditable overload (lines 285-291)
async upsert<TEntity extends object & IAuditableEntity>(
  entity: EntityClass & { new (): TEntity },
  row: Partial<Record<keyof TEntity & string, unknown>>,
  options: AuditableWriteOptions & UpsertOptions,
): Promise<TEntity>;

// upsert — non-auditable overload (lines 293-298)
async upsert<TEntity extends object>(
  entity: EntityClass & { new (): TEntity },
  row: Partial<Record<keyof TEntity & string, unknown>>,
  options: WriteOptions & UpsertOptions,
): Promise<TEntity>;

// update — auditable overload (lines 303-309)
async update<TEntity extends object & IAuditableEntity>(
  entity: EntityClass & { new (): TEntity },
  updates: Partial<Record<keyof TEntity & string, unknown>>,
  options: AuditableWriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity>;

// update — non-auditable overload (lines 311-316)
async update<TEntity extends object>(
  entity: EntityClass & { new (): TEntity },
  updates: Partial<Record<keyof TEntity & string, unknown>>,
  options: WriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity>;

// delete — auditable+deletable overload (lines 321-327)
async delete<TEntity extends object & IAuditableEntity & IDeletableEntity>(
  entity: EntityClass & { new (): TEntity },
  match: Partial<Record<keyof TEntity & string, unknown>>,
  options: AuditableWriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity>;

// delete — deletable non-auditable overload (lines 329-334)
async delete<TEntity extends object & IDeletableEntity>(
  entity: EntityClass & { new (): TEntity },
  match: Partial<Record<keyof TEntity & string, unknown>>,
  options: WriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity>;
```

(`src/dal/dal.ts:235-334`). Key facts for `ConfigService`:
- `find` returns `TResult | null` — used for single-key lookup.
- `findAll` returns `TResult[] | AsyncIterable<TResult>` — used for `getAll()`.
- `upsert` auditable overload requires `AuditableWriteOptions & UpsertOptions` — `actor` + `conflictTarget`.
- `delete` auditable+deletable overload requires `AuditableWriteOptions & MatchByOptions<TEntity>` — soft delete by match + `matchBy`.

#### 2.1.7 @Entity decorator — `src/meta/entity-decorators.ts` (lines 157-168)

```typescript
export function Entity(tableName?: string, schema?: string) {
  return function <T extends Function>(ctor: T): T {
    const m = ensureMeta(ctor);
    m.tableName = tableName ?? ctor.name;
    if (schema) m.tableSchema = schema;
    return ctor;
  };
}
```

(`src/meta/entity-decorators.ts:157-168`). The second parameter `schema` sets `m.tableSchema`, which `getQualifiedTableName` uses to emit `"schema"."table"`.

#### 2.1.8 getQualifiedTableName — `src/meta/entity-decorators.ts` (lines 346-361)

```typescript
export function getQualifiedTableName(ctor: EntityClass): string {
  if (!isEntityClass(ctor)) {
    throw new TypeError("Expected a class decorated with @Entity(…) or @Entity()");
  }
  const m = META.get(ctor as Function)!;
  const table = m.tableName!;
  if (m.tableSchema) {
    return `"${m.tableSchema}"."${table}"`;
  }
  return `"${table}"`;
}
```

(`src/meta/entity-decorators.ts:346-361`). This confirms `@Entity("config", "emailsender")` produces `"emailsender"."config"`.

#### 2.1.9 field() and Filter DSL — `src/query/dsl.ts` (lines 28-86)

```typescript
export function field<TEntity, K extends keyof TEntity & string>(
  entity: EntityClass,
  key: K
): FieldRef<TEntity, K> {
  return { entity, key };
}

export const Filter = {
  fieldValue(
    left: FieldRef<any, any>,
    op: SqlOperator,
    right: unknown,
    operand: SqlExpressionOperand = "AND"
  ): FilterExpr {
    return { kind: "field_value", left, op, right, operand };
  },
  // ... fieldField, raw, group
};
```

(`src/query/dsl.ts:28-86`). `ConfigService.findByKey` uses `Filter.fieldValue(field(Entity, "key"), "=", key)`.

#### 2.1.10 NotFoundError — `src/errors/errors.ts` (lines 18-24)

```typescript
export class NotFoundError extends DalError {
  readonly code = "NOT_FOUND";
  constructor(message: string) {
    super(message);
  }
}
```

(`src/errors/errors.ts:18-24`). `ConfigService.require` throws a plain `Error` (BE parity — BE's `loadAuthConfigFromDb` throws `new Error("[auth] auth_mode is missing...")`, not `NotFoundError`).

### 2.2 BE (`primebrick-be-v3`) — reference pattern

#### 2.2.1 AuthConfigurationEntity — `auth_configuration_entity.ts` (lines 1-69)

```typescript
@Entity("auth_configurations")
@AuditTrail()
export class AuthConfigurationEntity implements IAuditableEntity {
  @Key()
  id: number;

  @Unique()
  uuid: string;

  @Unique()
  @Column({ length: 255, nullable: false })
  key: string;

  @Column({ nullable: true })
  value?: string;

  @Column({ nullable: true })
  description_key?: string;

  // NOTE: BE's auth_configurations has only `description` (free text). The new
  // pattern replaces it with two i18n key columns: `label_key` (short title)
  // and `description_key` (longer description). Both are i18n translation keys,
  // not free text. BE can adopt these columns later via ALTER TABLE.

  @AuditableField(AuditableFieldType.CREATED_AT)
  created_at: Date;

  @AuditableField(AuditableFieldType.CREATED_BY)
  created_by: string;

  @AuditableField(AuditableFieldType.UPDATED_AT)
  updated_at: Date;

  @AuditableField(AuditableFieldType.UPDATED_BY)
  updated_by: string;

  @AuditableField(AuditableFieldType.VERSION)
  version: number;

  @DeletableField(DeletableFieldType.DELETED_AT)
  deleted_at?: Date;

  @DeletableField(DeletableFieldType.DELETED_BY)
  deleted_by?: string;
}
```

(`auth_configuration_entity.ts:1-69`). This is the dictionary shape to replicate: `key` (unique, varchar 255, not null), `value` (text, nullable), plus full audit + soft-delete columns. BE has a `description` (free text) column; the new pattern **replaces** it with two i18n key columns: `label_key` (short title) and `description_key` (longer description) — both are i18n translation keys, not free text. BE can adopt these columns later via `ALTER TABLE`.

#### 2.2.2 SQL for auth_configurations table — `db-meta/patches/00000000000000_init_database.sql` (lines 207-225)

```sql
CREATE TABLE IF NOT EXISTS "public"."auth_configurations" (
  "id" bigint generated always as identity NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(50) NOT NULL,
  "value" text NOT NULL,
  "description" text,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text,
  "version" integer DEFAULT 1,
  "deleted_at" timestamptz,
  "deleted_by" text,
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_configurations_key_uq" ON "public"."auth_configurations" ("key");
CREATE INDEX IF NOT EXISTS "auth_configurations_deleted_at_idx" ON "public"."auth_configurations" ("deleted_at");
```

(`db-meta/patches/00000000000000_init_database.sql:207-225`). Note: SQL declares `value text NOT NULL` while the entity declares `value?: string` (nullable). The emailsender migration will use `value text` (nullable) to match the entity's `value: string | null` and allow "not set yet" rows.

#### 2.2.3 loadAuthConfigFromDb — `config-repo.ts` (lines 58-140)

```typescript
export async function loadAuthConfigFromDb(pool: Pool): Promise<AuthConfigDb> {
  const dal = new AuthConfigurationsDal(pool);
  const rows = await dal.findAll();

  const settings = rows.reduce((acc, row) => {
    acc[row.key] = row.value ?? null;
    return acc;
  }, {} as Record<string, string | null>);

  // Mandatory-field checks (fail loud, no silent defaults)
  if (!settings.auth_mode) {
    throw new Error("[auth] auth_mode is missing in auth_configurations table");
  }
  // ... more mandatory checks ...

  return {
    ...settings,
    enable_email_verification_check: settings.enable_email_verification_check === "true",
    auth_mode: mode,
  } as AuthConfigDb;
}
```

(`config-repo.ts:58-140`). Key behaviors to replicate in `ConfigService`:
- `findAll()` → reduce into `Record<string, string | null>` keyed by `row.key`.
- Mandatory keys throw `new Error(...)` if missing — no silent defaults.
- Boolean conversion: `settings.enable_email_verification_check === "true"`.

#### 2.2.4 AuthConfigurationsDal — `auth_configurations_dal.ts` (lines 1-94)

```typescript
export class AuthConfigurationsDal {
  private repo: Repository;

  constructor(pool: Pool) {
    this.repo = new Repository(pool);
  }

  async findAll(): Promise<AuthConfigurationEntity[]> {
    return this.repo.findAll<AuthConfigurationEntity, AuthConfigurationEntity>(
      AuthConfigurationEntity, null, { deletedRecords: "EXCLUDED" }
    );
  }

  async findByKey(key: string): Promise<AuthConfigurationEntity | null> {
    return this.repo.find<AuthConfigurationEntity, AuthConfigurationEntity>(
      AuthConfigurationEntity, null,
      { filters: [Filter.fieldValue(field(AuthConfigurationEntity, "key" as any), "=", key)],
        deletedRecords: "EXCLUDED" }
    );
  }

  async add(key: string, value: string, updatedBy: string): Promise<void> {
    await this.repo.insertMany(AuthConfigurationEntity, [
      { key, value, created_by: updatedBy, updated_by: updatedBy },
    ]);
  }

  async upsert(key: string, value: string, updatedBy: string): Promise<void> {
    const existing = await this.findByKey(key);
    if (!existing) {
      await this.add(key, value, updatedBy);
    } else {
      await this.repo.update(
        AuthConfigurationEntity, existing.uuid,
        { value, updated_by: updatedBy }, updatedBy
      );
    }
  }
}
```

(`auth_configurations_dal.ts:1-94`). This is the per-service wrapper that `ConfigService<TEntity>` generalizes. Note BE's `upsert` is a manual find-then-add/update because it uses the older `Repository`; `ConfigService` will use the Dal gateway's native `upsert` with `conflictTarget: "key"` instead.

#### 2.2.5 Caching pattern — `config.ts` (lines 150-180)

```typescript
let cached: AuthConfig | null = null;

export async function loadAuthConfig(pool: Pool): Promise<AuthConfig> {
  const dbConfig = await loadAuthConfigFromDb(pool);
  // ... mapping ...
  cached = { mode, roles_path: dbConfig.auth_roles_path!, oidc, gateway, ... };
  return cached;
}

export async function getAuthConfig(): Promise<AuthConfig> {
  if (!cached) {
    throw new AuthConfigNotLoadedError("Auth configuration is not loaded...");
  }
  return cached;
}

export function invalidateAuthConfig(): void {
  cached = null;
}
```

(`config.ts:150-180`). This module-level cache + `invalidateAuthConfig()` is what `ConfigService.invalidate()` generalizes.

#### 2.2.6 Migration runner — `scripts/database-patch-apply.ts` (lines 1-148)

- Reads `.sql` files from `db-meta/patches/` sorted by filename.
- For each file: computes SHA256, extracts `patch_id` from filename.
- Checks `public.primebrick_database_patches` registry table.
- If `patch_id` exists with same SHA → skip.
- If `patch_id` exists with different SHA → fail.
- Otherwise: `BEGIN` → execute SQL → `INSERT` registry row → `COMMIT`.

(`scripts/database-patch-apply.ts:1-148`).

#### 2.2.7 Registry table SQL

```sql
CREATE TABLE IF NOT EXISTS public.primebrick_database_patches (
  patch_id text PRIMARY KEY,
  content_sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS primebrick_database_patches_sha_idx
  ON public.primebrick_database_patches (content_sha256);
```

This registry lives in the `public` schema and tracks which patches have been applied.

#### 2.2.8 BE package.json scripts (lines 14-15)

```json
"db:meta:compare": "tsx scripts/database-patch-compare.ts",
"db:migrate": "tsx scripts/database-patch-apply.ts",
```

(`package.json:14-15`).

#### 2.2.9 BE db-meta/patches/ directory

Only ONE file: `00000000000000_init_database.sql`. (`db-meta/patches/`).

### 2.3 emailsender (`primebrick-us-v3/emailsender`) — current state

#### 2.3.1 EmailConfigEntity — `src/domain/entities/email_config_entity.ts` (lines 1-51)

```typescript
@Entity("email_config")
export class EmailConfigEntity implements IAuditableEntity {
  @Key()
  id: number;

  @Unique()
  uuid: string;

  @Column({ length: 50, nullable: false })
  provider: string;

  @Column({ nullable: false })
  api_key: string;

  @Column({ nullable: true })
  api_endpoint: string;

  @Column({ nullable: true })
  from_email: string;

  @Column({ nullable: true })
  from_name: string;

  @Column({ nullable: true })
  reply_to: string;

  @AuditableField(AuditableFieldType.CREATED_AT)
  created_at: Date;
  @AuditableField(AuditableFieldType.CREATED_BY)
  created_by: string;
  @AuditableField(AuditableFieldType.UPDATED_AT)
  updated_at: Date;
  @AuditableField(AuditableFieldType.UPDATED_BY)
  updated_by: string;
  @AuditableField(AuditableFieldType.VERSION)
  version: number;
}
```

(`src/domain/entities/email_config_entity.ts:1-51`). This is a **wide single-row** entity (one row per provider), NOT a dictionary. It has `provider`, `api_key`, `api_endpoint`, `from_email`, `from_name`, `reply_to` columns. It does NOT implement `IDeletableEntity` (no soft-delete). It is decorated `@Entity("email_config")` with **no schema** — so it resolves to the default schema, not `emailsender`.

**This entity is RENAMED to `ProviderEntity` in `provider_entity.ts` by this plan (Step 7a).** The table `email_config` is renamed to `providers`. They serve a different purpose than the new `config` dictionary: provider-specific settings per sender email address. The new `emailsender.config` table is a generic key-value dictionary for future needs.

#### 2.3.2 DAL init — `src/db/dal.ts` (lines 1-33)

```typescript
export function initDal(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const schema = process.env.DB_SCHEMA || "emailsender";
  getDal({
    connectionString: url,
    schema,
    max: 10,
    statementTimeoutMs: 30000,
    applicationName: "primebrick-emailsender",
  });
}
export { getDal } from "@primebrick/dal-pg";
```

(`src/db/dal.ts:1-33`). The Dal gateway is initialized with `schema = process.env.DB_SCHEMA || "emailsender"`. Entities decorated with `@Entity("table", "emailsender")` will resolve to `"emailsender"."table"`.

#### 2.3.3 EmailService — `src/services/email-service.ts` (lines 1-140)

```typescript
export class EmailService {
  private brevoClient: BrevoClient;

  constructor() {
    const apiKey = process.env.BREVO_API_KEY;
    const apiEndpoint = process.env.BREVO_API_ENDPOINT || "https://api.brevo.com/v1";
    if (!apiKey) throw new Error("BREVO_API_KEY is not set");
    this.brevoClient = new BrevoClient(apiKey, apiEndpoint);
  }

  async sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
    const dal = getDal();
    // ... config lookup:
    config = await dal.find(EmailConfigEntity, null, {
      filters: [Filter.fieldValue(field(EmailConfigEntity, "provider"), "=", "brevo")],
    }) as EmailConfigEntity;
    // ... uses: config.from_email, config.from_name, config.reply_to
    // ... also: this.brevoClient (constructed with env vars BREVO_API_KEY, BREVO_API_ENDPOINT)
  }
}
```

(`src/services/email-service.ts:1-140`). The constructor reads `BREVO_API_KEY` and `BREVO_API_ENDPOINT` from env vars (lines 8-9) to construct `BrevoClient`. The DB config is only used for `from_email`, `from_name`, `reply_to`. **These `EmailConfigEntity` references are updated to `ProviderEntity` by Step 9a.**

#### 2.3.4 Tests — `src/services/__tests__/email-service.test.ts` (lines 1-142)

- Mocks `getDal()` to return `{ find: findMock, add: addMock }`.
- Mocks `BrevoClient` class.
- Sets `process.env.BREVO_API_KEY = "test-key"` in `beforeEach`.
- `findMock` returns config object: `{ provider: "brevo", from_email: "no-reply@example.com", from_name: "Example", reply_to: null }`.
- Tests verify: success path, config not found, template not found, brevo send fails.

(`src/services/__tests__/email-service.test.ts:1-142`). **`EmailConfigEntity` references in these tests are updated to `ProviderEntity` by Step 9b.**

#### 2.3.5 .env file (lines 1-8)

```env
DATABASE_URL=postgresql://primebrick:primebrick_dev@127.0.0.1:5432/primebrick
DB_SCHEMA=emailsender
NATS_URL=nats://127.0.0.1:4222
BREVO_API_KEY=your_brevo_api_key_here
BREVO_API_ENDPOINT=https://api.brevo.com/v1
SERVICE_CODE=EMAILSENDER
SERVICE_BASE_URL=http://localhost:3003
WEBHOOK_API_KEY=your_webhook_api_key_here
```

(`.env:1-8`). `BREVO_API_KEY` and `BREVO_API_ENDPOINT` are present as env vars. **These are NOT modified by this plan** — `email-service.ts` continues to read them.

#### 2.3.6 package.json (lines 1-27)

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "prestart": "pnpm run build",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@primebrick/dal-pg": "workspace:*"
  }
}
```

(`package.json:1-27`). **No `test` script. No `db:migrate` script. No `db-meta/` directory exists.** This plan adds `db:migrate` and creates the `db-meta/` directory.

#### 2.3.7 Entity registry — `src/domain/entities/registry.ts` (lines 1-21)

```typescript
export const ENTITY_REGISTRY = [
  EmailConfigEntity,
  EmailTemplateEntity,
  EmailCommunicationLogEntity,
  ServiceRegistryEntity,
] as const;
export { EmailConfigEntity, EmailTemplateEntity, EmailCommunicationLogEntity, ServiceRegistryEntity };
```

(`src/domain/entities/registry.ts:1-21`). `EmailConfigEntity` is **RENAMED to `ProviderEntity`** by Step 8, which also **ADDS** `ConfigEntryEntity` to the registry alongside the existing entities.

---

## 3. Architecture (with exact type references)

```
┌─────────────────────────────────────────────────────────────────────┐
│ @primebrick/sdk  (separate plan — primebrick-sdk-plan.md)           │
│                                                                     │
│   IConfigEntity  (interface: key, value, label_key,                 │
│                   description_key + IAuditableEntity +              │
│                   IDeletableEntity)                                 │
│   ConfigService<TEntity extends IConfigEntity>                      │
│     ├── get(key)            → string | null   (no throw)            │
│     ├── require(key)        → string         (throw if missing)     │
│     ├── getTyped<T>(key,fn) → T | null                              │
│     ├── requireTyped<T>(key,fn) → T                                 │
│     ├── getAll()            → Record<string, string | null>         │
│     ├── set(key,value,actor,label_key?,description_key?) → upsert   │
│     ├── delete(key,actor)                   → soft delete by key    │
│     └── invalidate()         → clear in-memory cache                │
└─────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │ (future) implements IConfigEntity
                                 │ (future) uses ConfigService<TEntity>
┌────────────────────────────────┴────────────────────────────────────┐
│ Each microservice (own DB schema)                                   │
│                                                                     │
│   <Schema>ConfigEntryEntity  @Entity("config", "<schema>")          │
│   ├── emailsender → ConfigEntryEntity  (table emailsender.config)   │
│   ├── (future)    → <X>ConfigEntryEntity   (table <x>.config)       │
│   └── BE          → AuthConfigurationEntity (table auth_configurations) — future adoption │
│                                                                     │
│   db-meta/patches/<timestamp>_<slug>.sql  (idempotent migration)     │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ emailsender: TWO tables coexist                              │   │
│   │  • emailsender.config        (generic dictionary, EMPTY)     │   │
│   │    → ConfigEntryEntity, implements IAuditableEntity          │   │
│   │    → consumed by: nothing yet (future use)                   │   │
│   │  • emailsender.providers    (provider-specific, RENAMED)     │   │
│   │    → ProviderEntity, renamed from EmailConfigEntity          │   │
│   │    → consumed by: email-service.ts                           │   │
│   └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

- **`@primebrick/sdk`** (separate plan — `primebrick-sdk-plan.md`): will own the generic `IConfigEntity` interface (extends `IAuditableEntity` from `src/types/entities.ts:11-19` + `IDeletableEntity` from `src/types/entities.ts:6-10`) and the `ConfigService<TEntity>` class. Knows nothing about specific microservices. Uses the `Dal` gateway methods from `src/dal/dal.ts:235-334` and the `Filter`/`field` DSL from `src/query/dsl.ts:28-86`. **Not created by this plan** — this plan only prepares the emailsender side.
- **Each microservice**: creates a concrete entity class implementing `IAuditableEntity` (from `@primebrick/dal-pg`), decorated with `@Entity("config", "<schema>")` (decorator from `src/meta/entity-decorators.ts:157-168`). The `config` table is created empty — no seed data. When the SDK is available, the entity can additionally implement `IConfigEntity` and be bound to a `ConfigService<ThatEntity>` against its own `Dal` gateway (obtained via `getDal()` from `src/dal/dal.ts`).
- **emailsender specifically**: the new `emailsender.config` table (generic dictionary, empty) coexists with the `emailsender.providers` table (provider-specific, renamed from `email_config`). No emailsender code consumes the config table yet — that wiring will happen in a future plan once the SDK is available.
- **Migration**: one SQL patch file per microservice under `db-meta/patches/`, following BE's naming + registry pattern (`scripts/database-patch-apply.ts:1-148`). Creates the schema, the `config` table (empty), and — for emailsender — the `providers` table (renamed from `email_config`) if it doesn't exist yet.

---

## 4. Step-by-step implementation plan

### Step 1: emailsender — SQL migration patch

Create `primebrick-us-v3/emailsender/db-meta/patches/00000000000000_init_database.sql`. This is the first patch (emailsender has no `db-meta/` directory today — see §2.3.6). It creates the `emailsender` schema, the `config` dictionary table (empty — no seed data), and the `providers` table (renamed from `email_config`, matching the `ProviderEntity` columns, if it doesn't exist yet). Both tables in one init patch.

```sql
-- emailsender init patch: schema + config dictionary table + providers table.
-- Adapted from BE auth_configurations pattern (db-meta/patches/00000000000000_init_database.sql:207-225).

CREATE SCHEMA IF NOT EXISTS "emailsender";

-- Generic config dictionary table (empty — no seed data).
-- Table name is "config" (schema "emailsender" provides isolation).
-- Future microservices follow the same pattern: <schema>.config
CREATE TABLE IF NOT EXISTS "emailsender"."config" (
  "id" bigint generated always as identity NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(50) NOT NULL,
  "value" text,
  "label_key" varchar(100),
  "description_key" varchar(100),
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text,
  "version" integer DEFAULT 1,
  "deleted_at" timestamptz,
  "deleted_by" text,
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "config_key_uq"
  ON "emailsender"."config" ("key");
CREATE INDEX IF NOT EXISTS "config_deleted_at_idx"
  ON "emailsender"."config" ("deleted_at");

-- Provider-specific config table (renamed from email_config → providers).
-- One row per provider (brevo, sendgrid, etc.) with sender-specific settings.
CREATE TABLE IF NOT EXISTS "emailsender"."providers" (
  "id" bigint generated always as identity NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "provider" varchar(50) NOT NULL,
  "api_key" text NOT NULL,
  "api_endpoint" text,
  "from_email" text,
  "from_name" text,
  "reply_to" text,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text,
  "version" integer DEFAULT 1,
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "providers_provider_uq"
  ON "emailsender"."providers" ("provider");
```

Column choices for the `config` table, justified against BE's reference SQL (`db-meta/patches/00000000000000_init_database.sql:207-225`):
- `id bigint generated always as identity NOT NULL` — same as BE.
- `uuid uuid DEFAULT gen_random_uuid() NOT NULL` — same as BE.
- `key varchar(50) NOT NULL` — same as BE (`varchar(50)`), matches `@Column({ length: 50, nullable: false })` on the new entity.
- `value text` — **nullable**, unlike BE's `value text NOT NULL`. This allows "not set yet" rows (value null), matching `IConfigEntity.value: string | null` and BE's entity `value?: string`.
- `label_key varchar(100)` — **new column**, not in BE's `auth_configurations`. i18n translation key for a short title (e.g. `"config.brevo.api_key.title"`), used by BE/FE for display. Nullable because not all config rows need a display label. BE can adopt this column later via `ALTER TABLE`.
- `description_key varchar(100)` — **new column**, not in BE's `auth_configurations`. i18n translation key for a longer description (e.g. `"config.brevo.api_key.description"`), used by BE/FE for display. Nullable. BE can adopt this column later via `ALTER TABLE`.
- Audit columns (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`) — same as BE.
- Soft-delete columns (`deleted_at`, `deleted_by`) — same as BE.
- `PRIMARY KEY ("id")` — same as BE.
- Unique index on `key` — same as BE's `auth_configurations_key_uq`.
- Index on `deleted_at` — same as BE's `auth_configurations_deleted_at_idx`.

The `providers` table columns match the `ProviderEntity` (`src/domain/entities/provider_entity.ts`, renamed from `email_config_entity.ts:1-51`): `provider` (varchar 50, not null), `api_key` (text, not null), `api_endpoint` (text, nullable), `from_email` (text, nullable), `from_name` (text, nullable), `reply_to` (text, nullable), plus audit columns. Note: the `ProviderEntity` has no soft-delete fields, so `providers` has no `deleted_at`/`deleted_by` columns. The `CREATE TABLE IF NOT EXISTS` ensures this is a no-op if the table already exists in the database.

**No seed data** — the `config` table is created empty. The user populates it when a concrete need arises.

### Step 2: emailsender — migration runner

Create `primebrick-us-v3/emailsender/scripts/database-patch-apply.ts`, adapted from BE's `scripts/database-patch-apply.ts:1-148`. Since emailsender has no runner today (§2.3.6), this is new. The runner:

1. Reads `.sql` files from `db-meta/patches/` sorted by filename.
2. For each file: computes SHA256, extracts `patch_id` from filename.
3. Ensures the registry table `emailsender.primebrick_database_patches` exists (adapted from BE's `public.primebrick_database_patches` — placed in the emailsender schema, not public, because emailsender owns its schema).
4. Checks the registry: if `patch_id` exists with same SHA → skip; different SHA → fail; otherwise `BEGIN` → execute SQL → `INSERT` registry row → `COMMIT`.

```typescript
// primebrick-us-v3/emailsender/scripts/database-patch-apply.ts
// Adapted from BE scripts/database-patch-apply.ts:1-148.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

const PATCHES_DIR = join(process.cwd(), "db-meta", "patches");
const SCHEMA = process.env.DB_SCHEMA || "emailsender";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: url });

  // Ensure registry table exists in the service schema (BE uses public;
  // emailsender owns its schema, so the registry lives there).
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS "${SCHEMA}";
    CREATE TABLE IF NOT EXISTS "${SCHEMA}"."primebrick_database_patches" (
      patch_id text PRIMARY KEY,
      content_sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "primebrick_database_patches_sha_idx"
      ON "${SCHEMA}"."primebrick_database_patches" (content_sha256);
  `);

  const files = (await readdir(PATCHES_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const patchId = file.replace(/\.sql$/, "");
    const content = await readFile(join(PATCHES_DIR, file), "utf8");
    const sha = createHash("sha256").update(content).digest("hex");

    const { rows } = await pool.query(
      `SELECT content_sha256 FROM "${SCHEMA}"."primebrick_database_patches" WHERE patch_id = $1`,
      [patchId],
    );

    if (rows.length > 0) {
      if (rows[0].content_sha256 === sha) {
        console.log(`[skip] ${file} (already applied, same SHA)`);
        continue;
      }
      throw new Error(`[fail] ${file} (patch_id exists with different SHA)`);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(content);
      await client.query(
        `INSERT INTO "${SCHEMA}"."primebrick_database_patches" (patch_id, content_sha256) VALUES ($1, $2)`,
        [patchId, sha],
      );
      await client.query("COMMIT");
      console.log(`[apply] ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Add to `primebrick-us-v3/emailsender/package.json` scripts (currently only `dev`/`build`/`prestart`/`start` per §2.3.6):

```json
"db:migrate": "tsx scripts/database-patch-apply.ts"
```

This mirrors BE's `"db:migrate": "tsx scripts/database-patch-apply.ts"` (`package.json:15`).

### Step 3: emailsender — `ConfigEntryEntity`

Create `primebrick-us-v3/emailsender/src/domain/entities/config_entry_entity.ts`. The new entity implements `IAuditableEntity` (from `@primebrick/dal-pg`, which is already a dependency), is decorated `@Entity("config", "emailsender")` (schema param per `src/meta/entity-decorators.ts:157-168`), and mirrors BE's `AuthConfigurationEntity` (`auth_configuration_entity.ts:1-69`). It does **not** depend on `IConfigEntity` — the entity works with the DAL gateway directly via `IAuditableEntity`. The SDK can later provide `IConfigEntity` as a convenience interface, but the entity doesn't need it to work with the DAL.

```typescript
// primebrick-us-v3/emailsender/src/domain/entities/config_entry_entity.ts
import {
  Entity,
  Key,
  Unique,
  Column,
  AuditableField,
  AuditableFieldType,
  DeletableField,
  DeletableFieldType,
  type IAuditableEntity,
} from "@primebrick/dal-pg";

@Entity("config", "emailsender")
export class ConfigEntryEntity implements IAuditableEntity {
  @Key()
  id!: number;

  @Unique()
  uuid!: string;

  @Unique()
  @Column({ length: 50, nullable: false })
  key!: string;

  @Column({ nullable: true })
  value: string | null;

  @Column({ length: 100, nullable: true })
  label_key?: string;

  @Column({ length: 100, nullable: true })
  description_key?: string;

  @AuditableField(AuditableFieldType.CREATED_AT)
  created_at!: Date;

  @AuditableField(AuditableFieldType.CREATED_BY)
  created_by!: string;

  @AuditableField(AuditableFieldType.UPDATED_AT)
  updated_at!: Date;

  @AuditableField(AuditableFieldType.UPDATED_BY)
  updated_by!: string;

  @AuditableField(AuditableFieldType.VERSION)
  version!: number;

  @DeletableField(DeletableFieldType.DELETED_AT)
  deleted_at?: Date;

  @DeletableField(DeletableFieldType.DELETED_BY)
  deleted_by?: string;
}
```

Key facts:
- `@Entity("config", "emailsender")` — table name is `config`, schema is `emailsender` → resolves to `"emailsender"."config"` (per `src/meta/entity-decorators.ts:346-361`).
- Implements `IAuditableEntity` (which extends `IDeletableEntity`) — gets all audit + soft-delete fields. Does not depend on `IConfigEntity`; the SDK can later provide that as a convenience interface.
- `key` is `@Unique()` + `@Column({ length: 50, nullable: false })` — matches the SQL `varchar(50) NOT NULL` + unique index.
- `value` is `string | null` — matches the SQL `text` (nullable).
- `label_key` and `description_key` are optional `varchar(100)` — i18n translation keys, not free text.
- The existing `EmailConfigEntity` (`src/domain/entities/email_config_entity.ts:1-51`) is **RENAMED to `ProviderEntity`** by Step 3a — see below.

### Step 3a: emailsender — rename `EmailConfigEntity` to `ProviderEntity`

Rename the file `src/domain/entities/email_config_entity.ts` → `src/domain/entities/provider_entity.ts`, rename the class `EmailConfigEntity` → `ProviderEntity`, and change `@Entity("email_config")` to `@Entity("providers")`. The new file content:

```typescript
// primebrick-us-v3/emailsender/src/domain/entities/provider_entity.ts
import {
  Entity,
  Key,
  Unique,
  Column,
  AuditableField,
  AuditableFieldType,
  type IAuditableEntity,
} from "@primebrick/dal-pg";

@Entity("providers")
export class ProviderEntity implements IAuditableEntity {
  @Key()
  id: number;

  @Unique()
  uuid: string;

  @Column({ length: 50, nullable: false })
  provider: string;

  @Column({ nullable: false })
  api_key: string;

  @Column({ nullable: true })
  api_endpoint: string;

  @Column({ nullable: true })
  from_email: string;

  @Column({ nullable: true })
  from_name: string;

  @Column({ nullable: true })
  reply_to: string;

  @AuditableField(AuditableFieldType.CREATED_AT)
  created_at: Date;
  @AuditableField(AuditableFieldType.CREATED_BY)
  created_by: string;
  @AuditableField(AuditableFieldType.UPDATED_AT)
  updated_at: Date;
  @AuditableField(AuditableFieldType.UPDATED_BY)
  updated_by: string;
  @AuditableField(AuditableFieldType.VERSION)
  version: number;
}
```

Key facts:
- File renamed: `email_config_entity.ts` → `provider_entity.ts`.
- Class renamed: `EmailConfigEntity` → `ProviderEntity`.
- `@Entity("email_config")` → `@Entity("providers")` — table name is now `providers` (resolves to the default schema, same as before since the original had no schema param).
- All columns unchanged: `provider`, `api_key`, `api_endpoint`, `from_email`, `from_name`, `reply_to` + audit columns.

### Step 4: emailsender — update `registry.ts`

Update `primebrick-us-v3/emailsender/src/domain/entities/registry.ts` (currently lines 1-21, see §2.3.7) to **REPLACE** `EmailConfigEntity` with `ProviderEntity` **AND ADD** `ConfigEntryEntity` alongside the existing entities:

```typescript
export const ENTITY_REGISTRY = [
  ProviderEntity,
  EmailTemplateEntity,
  EmailCommunicationLogEntity,
  ServiceRegistryEntity,
  ConfigEntryEntity,
] as const;
export { ProviderEntity, EmailTemplateEntity, EmailCommunicationLogEntity, ServiceRegistryEntity, ConfigEntryEntity };
```

### Step 5a: emailsender — update `email-service.ts`

Rename all `EmailConfigEntity` references to `ProviderEntity` in `src/services/email-service.ts` (currently lines 1-140, see §2.3.3). The import line and the two usage lines change:

Import line change:
```typescript
// before:
import { EmailConfigEntity } from "../domain/entities/registry.js";
// after:
import { ProviderEntity } from "../domain/entities/registry.js";
```

The `dal.find` call (the config lookup inside `sendEmail`):
```typescript
// before:
config = await dal.find(EmailConfigEntity, null, {
  filters: [Filter.fieldValue(field(EmailConfigEntity, "provider"), "=", "brevo")],
}) as EmailConfigEntity;
// after:
config = await dal.find(ProviderEntity, null, {
  filters: [Filter.fieldValue(field(ProviderEntity, "provider"), "=", "brevo")],
}) as ProviderEntity;
```

No other changes to `email-service.ts` — the constructor still reads `BREVO_API_KEY` and `BREVO_API_ENDPOINT` from env vars, and the DB config is still only used for `from_email`, `from_name`, `reply_to`.

### Step 5b: emailsender — update tests

Rename `EmailConfigEntity` references to `ProviderEntity` in `src/services/__tests__/email-service.test.ts` (currently lines 1-142, see §2.3.4). The test mocks `getDal()` to return `{ find: findMock, add: addMock }` and `findMock` returns a config object `{ provider: "brevo", from_email: "no-reply@example.com", from_name: "Example", reply_to: null }` — the mock return values don't reference the entity class. However, if the test file imports `EmailConfigEntity` (e.g. for type annotations or the `field()` helper in filter construction), update that import to `ProviderEntity`:

```typescript
// before (if present):
import { EmailConfigEntity } from "../domain/entities/registry.js";
// after:
import { ProviderEntity } from "../domain/entities/registry.js";
```

Check and update any `EmailConfigEntity` usage in filter construction or type casts to `ProviderEntity`. The mock return values themselves need no change.

### Step 6: emailsender — build + test

1. From `primebrick-us-v3/emailsender/`, run `pnpm run build` (tsc). Fix any type errors. The new `ConfigEntryEntity` and the renamed `ProviderEntity` should compile cleanly; all `EmailConfigEntity` references have been updated to `ProviderEntity` (Steps 7a, 8, 9a, 9b).
2. Run `pnpm run db:migrate` against the dev DB (`DATABASE_URL` from `.env:1`) to apply the patch from Step 5. Verify:
   - The `emailsender.config` table exists and is **empty** (zero rows).
   - The `emailsender.providers` table exists (renamed from `email_config`) with the columns matching `ProviderEntity`.
3. Existing tests (`src/services/__tests__/email-service.test.ts`) should pass after the `EmailConfigEntity` → `ProviderEntity` rename (Step 9b).

**Note:** No seed data. The `config` table is empty; `ConfigService` is available but not consumed yet by any emailsender code.

---

## 5. Table comparison (config vs providers)

| Aspect | `emailsender.config` | `emailsender.providers` |
|--------|---------------------|--------------------------|
| Purpose | Generic key-value dictionary | Provider-specific settings per sender |
| Shape | `key` / `value` / `label_key` / `description_key` | `provider` / `api_key` / `api_endpoint` / `from_email` / `from_name` / `reply_to` |
| Seed data | None (empty — user populates when needed) | None in patch (operator inserts via SQL or app) |
| Entity | `ConfigEntryEntity` (implements `IConfigEntity`) | `ProviderEntity` (renamed from `EmailConfigEntity`) |
| Consumed by | Nothing yet (future use) | `email-service.ts` (`src/services/email-service.ts:1-140`) |
| Soft-delete | Yes (`deleted_at` / `deleted_by`) | No (existing entity has no soft-delete) |
| Created by this plan | Yes (new) | No (existing — `CREATE TABLE IF NOT EXISTS` is a no-op if it already exists) |

---

## 6. Acceptance criteria

1. `@primebrick/dal-pg` exports `IConfigEntity` and `ConfigService` from `src/index.ts` (Step 3).
2. `ConfigService` unit tests pass: `get` returns null for missing keys, `require` throws, `getTyped` converts, `getAll` reduces to a record, `set` calls `dal.upsert` with `conflictTarget: "key"`, `delete` calls `dal.delete` with `matchBy: "key"` (Step 4).
3. `emailsender/db-meta/patches/00000000000000_init_database.sql` exists and creates `emailsender.config` (empty) + `emailsender.providers` (renamed from `email_config`, if not exists) with the exact columns from Step 5 (Step 5).
4. `pnpm run db:migrate` in emailsender applies the patch idempotently (second run skips with "already applied, same SHA") (Step 6).
5. `ConfigEntryEntity` implements `IConfigEntity`, is decorated `@Entity("config", "emailsender")`, and has `key`/`value`/`label_key`/`description_key` + audit + soft-delete fields (Step 7).
6. `ProviderEntity` (renamed from `EmailConfigEntity`) exists in `provider_entity.ts`, decorated `@Entity("providers")`, with all original columns preserved (Step 7a).
7. `ENTITY_REGISTRY` in `registry.ts` contains `ProviderEntity` (replacing `EmailConfigEntity`) **and** `ConfigEntryEntity` (Step 8).
8. `email-service.ts` references `ProviderEntity` (not `EmailConfigEntity`) — the import, `dal.find` call, and `as` cast all use `ProviderEntity` (Step 9a).
9. `email-service.test.ts` references `ProviderEntity` (not `EmailConfigEntity`) where applicable (Step 9b).
10. `pnpm run build` passes in emailsender with no type errors (Step 10).
11. Existing `email-service.test.ts` tests pass after the `EmailConfigEntity` → `ProviderEntity` rename (Step 10).
12. The `emailsender.config` table is empty after migration (zero rows — no seed data) (Step 10).

---

## 7. Out of scope

- **Consuming `ConfigService` in emailsender** — the `config` table is created empty and `ConfigService` is available, but no emailsender code uses it yet. A future plan will wire it in when a concrete config need arises.
- **Seed data for `emailsender.config`** — the table is empty. The user populates it via SQL or `ConfigService.set(...)` when needed.
- **Migrating BE's `auth_configurations` to use `ConfigService`** — BE keeps its existing `AuthConfigurationsDal` (`auth_configurations_dal.ts:1-94`) and `loadAuthConfigFromDb` (`config-repo.ts:58-140`). Future adoption only.
- **Other microservices** (none exist yet beyond emailsender in `primebrick-us-v3`).
- **Encryption of config values at rest** — the `value` column is plain `text`. A future plan can add column-level encryption or a secrets wrapper; this plan stores values as plaintext, same as BE's `auth_configurations.value` (`db-meta/patches/00000000000000_init_database.sql:211`).
- **Hot-reload of config without `invalidate()`** — cache invalidation is manual via `ConfigService.invalidate()` (mirrors BE's `invalidateAuthConfig()`, `config.ts:178-180`). A future plan can add NATS-based cache busting.
