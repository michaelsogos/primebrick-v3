# Plan: Config Dictionary Pattern — replicable key/value config table per microservice

> Status: DRAFT — awaiting user approval (PROCEED keyword).
> Created: 2026-07-07.
> Scope: shared DAL library (`@primebrick/dal-pg`) + `primebrick-us-v3/emailsender` initial implementation. Other microservices adopt the same pattern when created.
> Prerequisite: `dal-update-delete-redesign-plan.md` and `us-emailsender-dal-integration-plan.md` must be implemented first — this plan depends on the `Dal` gateway, `dal.find/findAll/upsert/delete`, the `Filter`/`field` DSL, the `@Entity("table", "schema")` schema parameter, and the `@AuditableField`/`@DeletableField` decorators being available in the lib.
> Repositories analyzed (empirically, zero assumptions):
> - `primebrick-dal-v3` — the shared DAL library (`@primebrick/dal-pg`).
> - `primebrick-us-v3/emailsender` — the first microservice to adopt the pattern.
> - `primebrick-be-v3` — read-only reference for the `auth_configurations` dictionary pattern and the migration patch runner.

---

## 1. Objective

Introduce a **dictionary-style configuration table pattern** that every microservice/module can replicate in its own DB schema. Each microservice owns a `<schema>_config` table holding key/value rows (one row per config key), with type conversion performed at read time (string → boolean / number / enum / object). The pattern is backed by:

1. A shared `IConfigEntity` interface + `ConfigService<TEntity>` class in `@primebrick/dal-pg`, exposing `Dictionary<string, object>`-style lookup methods (`get`, `require`, `getTyped`, `requireTyped`, `getAll`, `set`, `delete`).
2. A concrete entity class per microservice implementing `IConfigEntity`, decorated with `@Entity("<schema>_config", "<schema>")`.
3. An idempotent SQL migration patch per microservice following BE's `db-meta/patches/` pattern, pre-seeding the known config rows with empty/default values.

The first concrete implementation is for `emailsender`: the existing single-row `EmailConfigEntity` is replaced by a dictionary `EmailConfigEntryEntity`, the `email-service.ts` reads config via `ConfigService`, and an initial SQL patch creates the `emailsender.email_config` table and pre-inserts the Brevo config rows.

This mirrors BE's `auth_configurations` table + `loadAuthConfigFromDb` pattern, generalized into a reusable library component so every future microservice gets the same shape for free.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ @primebrick/dal-pg  (shared library)                                │
│                                                                     │
│   IConfigEntity  (interface: key, value, description + auditable +  │
│                   deletable)                                        │
│   ConfigService<TEntity extends IConfigEntity>                      │
│     ├── get(key)            → string | null   (no throw)            │
│     ├── require(key)        → string         (throw if missing)     │
│     ├── getTyped<T>(key,fn) → T | null                              │
│     ├── requireTyped<T>(key,fn) → T                                 │
│     ├── getAll()            → Record<string, string>                │
│     ├── set(key,value,actor,description?)  → upsert by key          │
│     ├── delete(key,actor)                   → soft delete by key    │
│     └── invalidate()         → clear in-memory cache                │
└─────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │ implements IConfigEntity
                                 │ uses ConfigService<TEntity>
┌────────────────────────────────┴────────────────────────────────────┐
│ Each microservice (own DB schema)                                   │
│                                                                     │
│   <Schema>ConfigEntryEntity  @Entity("<schema>_config", "<schema>") │
│   ├── emailsender → EmailConfigEntryEntity  (table email_config)    │
│   ├── (future)    → <X>ConfigEntryEntity   (table <x>_config)       │
│   └── BE          → AuthConfigurationEntity (table auth_configurations) — future adoption │
│                                                                     │
│   db-meta/patches/<timestamp>_<slug>.sql  (idempotent migration)     │
└─────────────────────────────────────────────────────────────────────┘
```

- **DAL library** (`@primebrick/dal-pg`): owns the generic `IConfigEntity` interface and the `ConfigService<TEntity>` class. Knows nothing about specific microservices.
- **Each microservice**: creates a concrete entity class implementing `IConfigEntity`, decorated with `@Entity("<schema>_config", "<schema>")`, and instantiates a `ConfigService<ThatEntity>` against its own `Dal` gateway.
- **Migration**: one SQL patch file per microservice under `db-meta/patches/`, following BE's naming + registry pattern. Creates the schema, the `<schema>_config` table, indexes, and pre-seeds the known config rows with empty/default values via `INSERT ... ON CONFLICT (key) DO NOTHING`.

---

## 3. DAL Library Changes (`primebrick-dal-v3`)

### 3.1 New interface `IConfigEntity`

Lives in `src/config/iconfig-entity.ts`. Extends the existing `IAuditableEntity` and `IDeletableEntity` interfaces so the dictionary rows participate in audit + soft-delete like every other entity.

```typescript
// primebrick-dal-v3/src/config/iconfig-entity.ts
import type { IAuditableEntity, IDeletableEntity } from "../interfaces.js";

/**
 * Shape of a dictionary-style config row. Every microservice config table
 * mirrors this: one row per key, value stored as TEXT, type conversion
 * performed at read time by ConfigService consumers.
 */
export interface IConfigEntity extends IAuditableEntity, IDeletableEntity {
  /** Unique config key, e.g. "brevo_api_key". */
  key: string;
  /** Raw TEXT value. null means "not set yet". Type conversion at read time. */
  value: string | null;
  /** Optional human-readable description of the key. */
  description?: string;
}
```

### 3.2 New class `ConfigService<TEntity extends IConfigEntity>`

Lives in `src/config/config-service.ts`. Generic over the concrete entity class so each microservice binds it to its own `<Schema>ConfigEntryEntity`. Uses the `Dal` gateway's `find` / `findAll` / `upsert` / `delete` methods and the `Filter` / `field` DSL — **no `rawSql`**.

```typescript
// primebrick-dal-v3/src/config/config-service.ts
import type { Dal } from "../dal.js";
import { field, Filter } from "../dsl.js";

/**
 * Dictionary-style config accessor backed by a <schema>_config table.
 * Mirrors BE's loadAuthConfigFromDb / invalidateAuthConfig pattern,
 * generalized so every microservice can reuse it.
 *
 * Lookups are by the `key` column. Values are TEXT; callers convert types
 * at read time via getTyped/requireTyped. No fallback defaults — require()
 * throws if a mandatory key is missing (BE parity).
 */
export class ConfigService<TEntity extends { id: bigint; uuid: string; key: string; value: string | null; description?: string }> {
  private cache: Map<string, string | null> | null = null;

  constructor(
    private readonly dal: Dal,
    private readonly entityClass: new () => TEntity,
    private readonly options: { enableCache?: boolean } = {},
  ) {}

  /** Return the raw value for a key, or null if the row is missing/soft-deleted. Never throws. */
  async get(key: string): Promise<string | null> {
    if (this.options.enableCache && this.cache) {
      return this.cache.get(key) ?? null;
    }
    const row = await this.findByKey(key);
    return row?.value ?? null;
  }

  /** Return the raw value for a key; throw if missing (mandatory config). BE parity. */
  async require(key: string): Promise<string> {
    const value = await this.get(key);
    if (value === null || value === "") {
      throw new Error(`Missing required config key: ${key}`);
    }
    return value;
  }

  /** get() + type conversion. Returns null if the key is missing. */
  async getTyped<T>(key: string, converter: (v: string) => T): Promise<T | null> {
    const raw = await this.get(key);
    return raw === null ? null : converter(raw);
  }

  /** require() + type conversion. Throws if missing. */
  async requireTyped<T>(key: string, converter: (v: string) => T): Promise<T> {
    return converter(await this.require(key));
  }

  /**
   * Load every config row and reduce to a Record<string, string> map.
   * Mirrors BE's loadAuthConfigFromDb → reduce pattern. Empty values are
   * kept as "" so callers can distinguish "set but empty" from "missing".
   */
  async getAll(): Promise<Record<string, string>> {
    const rows = await this.dal.findAll(this.entityClass, {
      deletedRecords: "EXCLUDED",
    });
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value ?? "";
    }
    return map;
  }

  /** Upsert a config row by key. If the row exists, update value/description; otherwise insert. */
  async set(key: string, value: string, actor: string, description?: string): Promise<void> {
    await this.dal.upsert(
      this.entityClass,
      { key, value, description } as unknown as TEntity,
      { matchBy: "key", actor },
    );
    if (this.options.enableCache && this.cache) {
      this.cache.set(key, value);
    }
  }

  /** Soft-delete a config row by key. */
  async delete(key: string, actor: string): Promise<void> {
    await this.dal.delete(this.entityClass, { key } as unknown as TEntity, {
      matchBy: "key",
      actor,
    });
    if (this.options.enableCache && this.cache) {
      this.cache.delete(key);
    }
  }

  /**
   * Prime the in-memory cache from the DB (one round-trip). After this,
   * get()/getTyped() read from memory until invalidate() is called.
   * Mirrors BE's load-once-at-startup + invalidateAuthConfig pattern.
   */
  async loadCache(): Promise<void> {
    const all = await this.getAll();
    this.cache = new Map(Object.entries(all));
  }

  /** Drop the in-memory cache; next get() hits the DB again. */
  invalidate(): void {
    this.cache = null;
  }

  private async findByKey(key: string): Promise<TEntity | null> {
    const rows = await this.dal.find(this.entityClass, {
      filters: [Filter.fieldValue(field(this.entityClass, "key"), "=", key)],
      deletedRecords: "EXCLUDED",
      throwIfNotFound: false,
    });
    return rows[0] ?? null;
  }
}
```

> **Note on `dal.find` signature**: the plan assumes `dal.find` accepts `throwIfNotFound: false` and returns an array (per `dal-update-delete-redesign-plan.md`). If the current signature only supports `findAll` for non-throwing lookups, `findByKey` falls back to `dal.findAll` with the same filter and takes `rows[0]`. The implementer must verify against the actual `FindOptions` shape in the lib at implementation time.

### 3.3 Exports

Update `src/index.ts` to re-export the new public surface:

```typescript
// primebrick-dal-v3/src/index.ts (additions)
export type { IConfigEntity } from "./config/iconfig-entity.js";
export { ConfigService } from "./config/config-service.js";
```

### 3.4 Files to create/modify in `primebrick-dal-v3`

| File | Action | Change |
|------|--------|--------|
| `src/config/iconfig-entity.ts` | CREATE | `IConfigEntity` interface. |
| `src/config/config-service.ts` | CREATE | `ConfigService<TEntity>` class. |
| `src/index.ts` | MODIFY | Re-export `IConfigEntity`, `ConfigService`. |
| `package.json` | MODIFY | Bump patch/minor version (e.g. `0.2.0`). |
| `README.md` | MODIFY (optional) | Document the config dictionary pattern + `ConfigService` API. |

---

## 4. emailsender Migration (`primebrick-us-v3/emailsender`)

### 4.1 Replace `EmailConfigEntity` with `EmailConfigEntryEntity`

Delete the single-row `EmailConfigEntity` and create a dictionary entity implementing `IConfigEntity`. The table name stays `email_config` but its structure changes from wide columns (`provider`, `api_key`, `api_endpoint`, `from_email`, `from_name`, `reply_to`) to narrow key/value rows.

```typescript
// primebrick-us-v3/emailsender/src/domain/entities/email-config-entry-entity.ts
import {
  Entity,
  Column,
  Key,
  Unique,
  AuditableField,
  DeletableField,
  type IConfigEntity,
} from "@primebrick/dal-pg";

@Entity("email_config", "emailsender")
export class EmailConfigEntryEntity implements IConfigEntity {
  @Key
  @Column({ name: "id", type: "bigint" })
  id!: bigint;

  @Unique
  @Column({ name: "uuid", type: "uuid" })
  uuid!: string;

  @Unique
  @Column({ name: "key", type: "varchar", length: 255 })
  key!: string;

  @Column({ name: "value", type: "text", nullable: true })
  value: string | null = null;

  @Column({ name: "description", type: "text", nullable: true })
  description?: string;

  @AuditableField("created_at")
  @Column({ name: "created_at", type: "timestamptz" })
  created_at!: Date;

  @AuditableField("created_by")
  @Column({ name: "created_by", type: "varchar", length: 255 })
  created_by!: string;

  @AuditableField("updated_at")
  @Column({ name: "updated_at", type: "timestamptz" })
  updated_at!: Date;

  @AuditableField("updated_by")
  @Column({ name: "updated_by", type: "varchar", length: 255 })
  updated_by!: string;

  @AuditableField("version")
  @Column({ name: "version", type: "integer" })
  version!: number;

  @DeletableField("deleted_at")
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deleted_at?: Date;

  @DeletableField("deleted_by")
  @Column({ name: "deleted_by", type: "varchar", length: 255, nullable: true })
  deleted_by?: string;
}
```

### 4.2 Update `registry.ts`

Replace the `EmailConfigEntity` export with `EmailConfigEntryEntity`:

```typescript
// primebrick-us-v3/emailsender/src/domain/entities/registry.ts
export { EmailConfigEntryEntity } from "./email-config-entry-entity.js";
export { EmailTemplateEntity } from "./email-template-entity.js";
// ... other entities unchanged
```

Delete the old `email-config-entity.ts` file.

### 4.3 Update `email-service.ts`

Replace the direct `dal.find(EmailConfigEntity, ...)` lookup with a `ConfigService<EmailConfigEntryEntity>` instance. The service reads all config at startup (or lazily on first call) and builds a typed config object.

```typescript
// primebrick-us-v3/emailsender/src/services/email-service.ts (sketch)
import { ConfigService } from "@primebrick/dal-pg";
import { EmailConfigEntryEntity } from "../domain/entities/registry.js";
import { getDal } from "../db/dal.js";

const dal = getDal({ schema: "emailsender" /* + connection config */ });
const configService = new ConfigService<EmailConfigEntryEntity>(dal, EmailConfigEntryEntity, {
  enableCache: true,
});

interface BrevoConfig {
  apiKey: string;
  apiEndpoint: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
}

async function loadBrevoConfig(): Promise<BrevoConfig> {
  // Dictionary-style: load all keys once, build typed object.
  // require() throws if a mandatory key is missing — BE parity (no fake defaults).
  const apiKey = await configService.require("brevo_api_key");
  const apiEndpoint = await configService.require("brevo_api_endpoint");
  const fromEmail = await configService.require("brevo_from_email");
  const fromName = await configService.require("brevo_from_name");
  const replyTo = await configService.get("brevo_reply_to") ?? "";
  return { apiKey, apiEndpoint, fromEmail, fromName, replyTo };
}

export async function sendEmail(...) {
  const cfg = await loadBrevoConfig();
  // ... use cfg.apiKey, cfg.apiEndpoint, etc. instead of the old EmailConfigEntity columns
}
```

> **Startup caching (optional)**: call `configService.loadCache()` once at boot so all subsequent `require()`/`get()` calls hit memory. Call `configService.invalidate()` if config is ever mutated at runtime. This mirrors BE's `loadAuthConfigFromDb` + `invalidateAuthConfig`.

### 4.4 `webhook-service.ts`

No change required — it does not read config today (it only updates `email_templates_communication_log` by `provider_message_id`).

### 4.5 Files to create/modify in `primebrick-us-v3/emailsender`

| File | Action | Change |
|------|--------|--------|
| `src/domain/entities/email-config-entry-entity.ts` | CREATE | `EmailConfigEntryEntity` (dictionary). |
| `src/domain/entities/email-config-entity.ts` | DELETE | Old single-row entity removed. |
| `src/domain/entities/registry.ts` | MODIFY | Export `EmailConfigEntryEntity` instead of `EmailConfigEntity`. |
| `src/services/email-service.ts` | MODIFY | Use `ConfigService<EmailConfigEntryEntity>`; replace `dal.find(EmailConfigEntity, ...)` with `configService.require(...)`. |
| `src/services/webhook-service.ts` | NO CHANGE | Does not read config. |
| `package.json` | MODIFY | Bump `@primebrick/dal-pg` dep to the version that exports `ConfigService`. |

---

## 5. SQL Migration Script

### 5.1 Patch directory + naming

Create the patch directory under the emailsender microservice, mirroring BE's `db-meta/patches/` layout:

```
primebrick-us-v3/emailsender/db-meta/patches/
  00000000000000_init_emailsender_config.sql
```

The first patch uses a zero-timestamp sentinel (`00000000000000`) because it is the baseline. Subsequent patches use the BE naming convention: `<UTC_yyyyMMddHHmmss>_<slug>.sql`.

### 5.2 Patch file content

```sql
-- primebrick-us-v3/emailsender/db-meta/patches/00000000000000_init_emailsender_config.sql
--
-- patch_id: 00000000000000_init_emailsender_config
-- content_sha256: <FILL_AT_COMMIT_TIME — sha256 of this file's bytes>
-- description: Baseline migration. Creates the emailsender schema + email_config
--              dictionary table and pre-seeds the Brevo config rows with empty
--              values. Idempotent — safe to re-run.
--

CREATE SCHEMA IF NOT EXISTS emailsender;

CREATE TABLE IF NOT EXISTS "emailsender"."email_config" (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid        UUID NOT NULL DEFAULT gen_random_uuid(),
    key         VARCHAR(255) NOT NULL,
    value       TEXT,
    description TEXT,

    -- Auditable fields
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  VARCHAR(255) NOT NULL DEFAULT 'system',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(255) NOT NULL DEFAULT 'system',
    version     INTEGER NOT NULL DEFAULT 1,

    -- Soft-delete fields
    deleted_at  TIMESTAMPTZ,
    deleted_by  VARCHAR(255),

    CONSTRAINT email_config_key_unique UNIQUE (key),
    CONSTRAINT email_config_uuid_unique UNIQUE (uuid)
);

CREATE INDEX IF NOT EXISTS email_config_deleted_at_idx
    ON "emailsender"."email_config" (deleted_at);

-- Pre-seed Brevo config rows. Empty values = "not configured yet"; the user
-- fills brevo_api_key / brevo_from_email / brevo_from_name / brevo_reply_to
-- after deploy. brevo_api_endpoint ships with the default Brevo base URL.
-- ON CONFLICT DO NOTHING keeps this idempotent across re-runs.

INSERT INTO "emailsender"."email_config" (key, value, description, created_by, updated_by)
VALUES
    ('brevo_api_key',       '',                            'Brevo API key for email sending',            'system', 'system'),
    ('brevo_api_endpoint',  'https://api.brevo.com/v1',    'Brevo API base URL',                         'system', 'system'),
    ('brevo_from_email',    '',                            'Default sender email address',               'system', 'system'),
    ('brevo_from_name',     '',                            'Default sender display name',                'system', 'system'),
    ('brevo_reply_to',      '',                            'Default reply-to email address',             'system', 'system')
ON CONFLICT (key) DO NOTHING;
```

### 5.3 Patch registry table (optional, BE parity)

BE tracks applied patches in `public.primebrick_database_patches` (patch_id + content_sha256). For emailsender, two options:

- **Option A (recommended for now)**: document that the SQL can be run manually against the dev DB. Add a TODO to implement a runner.
- **Option B (full BE parity)**: create a local `scripts/apply-patches.ts` in emailsender that mirrors BE's `scripts/database-patch-apply.ts` — reads `.sql` files sorted by name, checks a local `emailsender.emailsender_patches` registry table, applies unapplied patches in a transaction, records patch_id + content_sha256.

> **Decision for this plan**: Option A. The patch file is idempotent on its own (`CREATE ... IF NOT EXISTS` + `INSERT ... ON CONFLICT DO NOTHING`), so manual execution is safe. A shared runner is a separate, cross-cutting concern (it belongs in the DAL lib or a dedicated `@primebrick/migrations` package) and is listed in §10 as out of scope.

### 5.4 Files to create in `primebrick-us-v3/emailsender`

| File | Action | Change |
|------|--------|--------|
| `db-meta/patches/00000000000000_init_emailsender_config.sql` | CREATE | Baseline migration (schema + table + Brevo seed rows). |
| `db-meta/README.md` | CREATE (optional) | Short note: how to apply patches manually + naming convention. |

---

## 6. Config keys for Brevo

| key | type | description | default |
|-----|------|-------------|---------|
| `brevo_api_key` | string | Brevo API key for email sending | (empty — user fills after deploy) |
| `brevo_api_endpoint` | string | Brevo API base URL | `https://api.brevo.com/v1` |
| `brevo_from_email` | string | Default sender email address | (empty — user fills after deploy) |
| `brevo_from_name` | string | Default sender display name | (empty — user fills after deploy) |
| `brevo_reply_to` | string | Default reply-to email address | (empty — user fills after deploy) |

All keys are pre-seeded by the baseline migration (§5.2). `brevo_api_endpoint` is the only one with a non-empty default. The other four are intentionally empty: `require()` will throw at runtime until the user fills them, which is the desired fail-loud behavior (BE parity — no fake defaults on the read path).

---

## 7. Future: BE adoption + other microservices

- **BE (`primebrick-be-v3`)**: already has `public.auth_configurations` + `loadAuthConfigFromDb` + `invalidateAuthConfig`. It can adopt `IConfigEntity` on `AuthConfigurationEntity` and replace its hand-rolled `loadAuthConfigFromDb` with `ConfigService<AuthConfigurationEntity>.getAll()` later. This is a separate plan — BE's table name is `auth_configurations` (not `auth_config`), so BE would keep its existing table and just swap the reader. **Out of scope for this plan.**
- **Other microservices (when created)**: follow the same recipe:
  1. Create `<schema>_config` table via a baseline SQL patch.
  2. Create `<Schema>ConfigEntryEntity` implementing `IConfigEntity`, decorated `@Entity("<schema>_config", "<schema>")`.
  3. Instantiate `ConfigService<<Schema>ConfigEntryEntity>` against the microservice's `Dal` gateway.
  4. Pre-seed known keys with empty/default values in the patch.

---

## 8. Files to create/modify (full list)

### `primebrick-dal-v3` (shared library)
| # | File | Action |
|---|------|--------|
| 1 | `src/config/iconfig-entity.ts` | CREATE — `IConfigEntity` interface. |
| 2 | `src/config/config-service.ts` | CREATE — `ConfigService<TEntity>` class. |
| 3 | `src/index.ts` | MODIFY — re-export `IConfigEntity`, `ConfigService`. |
| 4 | `package.json` | MODIFY — version bump. |

### `primebrick-us-v3/emailsender`
| # | File | Action |
|---|------|--------|
| 5 | `src/domain/entities/email-config-entry-entity.ts` | CREATE — `EmailConfigEntryEntity` (dictionary). |
| 6 | `src/domain/entities/email-config-entity.ts` | DELETE — old single-row entity. |
| 7 | `src/domain/entities/registry.ts` | MODIFY — swap export. |
| 8 | `src/services/email-service.ts` | MODIFY — use `ConfigService`, replace `dal.find(EmailConfigEntity, ...)`. |
| 9 | `db-meta/patches/00000000000000_init_emailsender_config.sql` | CREATE — baseline migration. |
| 10 | `db-meta/README.md` | CREATE (optional) — patch application notes. |
| 11 | `package.json` | MODIFY — bump `@primebrick/dal-pg` dep. |

---

## 9. Acceptance criteria

1. **DAL library builds** with the new `ConfigService` and `IConfigEntity` exported from `@primebrick/dal-pg`. `pnpm -F @primebrick/dal-pg build` succeeds with zero TS errors.
2. **emailsender builds** with the new `EmailConfigEntryEntity`. `pnpm -F emailsender build` succeeds with zero TS errors.
3. **SQL patch is idempotent**: running `00000000000000_init_emailsender_config.sql` twice against an empty DB produces the same end state (one table, five Brevo rows, no duplicate-key errors).
4. **`email-service.ts` reads config via `ConfigService`** — no direct `dal.find(EmailConfigEntity, ...)` call remains; the old wide-column entity is gone.
5. **Zero `rawSql` calls** in emailsender after the refactor (grep-verified).
6. **All existing tests pass** (`pnpm test` across touched packages).
7. **`require()` throws** when a mandatory Brevo key (`brevo_api_key`, `brevo_from_email`, etc.) is empty/missing — fail-loud, no fake defaults (BE parity).
8. **`getAll()`** returns a `Record<string, string>` map with all five Brevo keys after the migration is applied.

---

## 10. Out of scope

- **BE migration to `ConfigService`**: BE keeps its hand-rolled `loadAuthConfigFromDb` for now. Adopting `ConfigService<AuthConfigurationEntity>` is a separate, later plan (§7).
- **Migration runner for emailsender**: the baseline patch is idempotent and can be applied manually. A shared patch runner (in the DAL lib or a dedicated `@primebrick/migrations` package) is a cross-cutting concern deferred to its own plan (§5.3 Option A).
- **Other microservices**: none exist yet. They will follow the recipe in §7 when created.
- **Audit wiring for config writes**: `ConfigService.set()` passes `actor` through `dal.upsert()`; full audit-trail emission depends on an `AuditPort` consumer being wired, which emailsender does not have yet. Not blocking.
- **Type-safe config schemas**: a future enhancement could let each microservice declare a typed config schema (e.g. `zod` or a plain interface) and have `ConfigService` validate values against it. Out of scope for this plan — callers do ad-hoc conversion via `getTyped`/`requireTyped` for now.
