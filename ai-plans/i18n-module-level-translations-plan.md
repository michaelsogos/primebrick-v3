# Plan: Module-Level i18n Translations with Runtime Editing

> **Status:** DRAFT — awaiting approval
> **Date:** 2026-09-04
> **Model:** GLM-5.2 High
> **Repos impacted:** `primebrick-dal-v3`, `primebrick-v3-sdk`, `primebrick-be-v3`, `primebrick-us-v3`, `primebrick-fe-v3`

---

## 1. Objectives

1. **DB as sole source of truth** for all translations. No static JSON at runtime
   (exception: one minimal `en-GB.json` fallback for public pages when BE is down —
   see §8.10). New app versions ship seed migrations
   (`INSERT ... ON CONFLICT DO NOTHING`) that add new keys without overwriting
   existing customizations.
2. **Schema = module boundary.** Each module's translations live in their own
   PostgreSQL schema: `public.translations` (app/shell), `system.translations`
   (BE entities), `emailsender.translations` (US emailsender), etc.
3. **BE is the central CRUD gateway.** US microservices do NOT implement
   translation endpoints. They only create the DB table. The BE accesses all
   schemas via DAL entity classes (one per schema, all extending
   `TranslationEntityBase`). The BE's central CRUD handler maps module code →
   entity class → DAL Repository handles the schema natively.
4. **Per-key flat rows** in DB (`key`, `language`, `value`), editable via a single
   admin page with a module selector + language selector + `EntityListTable`.
5. **DRY shared infrastructure**: entity base class in DAL, service + cache + i18n
   builder in SDK, consumed by BE with zero boilerplate. US microservices only
   add a DB patch.
6. **Runtime editing with immediate FE visibility**: admin saves a translation →
   BE invalidates Redis cache → FE reloads that module's translations on next TTL
   expiry (or immediately via SSE/collaboration bus if online).
7. **FE per-module lazy loading**: a route middleware detects the module from the
   route path, checks localStorage (with TTL), and fetches/caches translations
   on demand. The "app" module translations load on app init.
8. **Public pages** (login, welcome, onboarding, MCP consent) use a dedicated
   `GET /api/v1/translations/public/{language}` endpoint (PUBLIC permission)
   that reads `public.translations`. Fallback to a static `en-GB.json` (public
   keys only) if the BE is unreachable.
9. **Admin-only editing** at `/system/settings/translations` — one page with a
   module selector (app, system, emailsender, ...) + language selector + table.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FE (SvelteKit)                              │
│                                                                     │
│  Public pages (login, welcome, onboarding, MCP consent):            │
│    GET /api/v1/translations/public/{lang}  (PUBLIC, no auth)        │
│    Fallback: static en-GB.json (public keys only) if BE down        │
│                                                                     │
│  Authenticated pages ((app)/):                                      │
│    Route middleware ──► resolveModuleFromRoute(path)                │
│         │                                                           │
│         ▼                                                           │
│    localStorage check (pb:i18n:{module}:{lang}, TTL)               │
│         │ stale/missing                                             │
│         ▼                                                           │
│    GET /api/v1/modules/{code}/translations/{lang}                  │
│         │                                                           │
│         ▼                                                           │
│    Merge into i18n dict store ($state) ──► $t() reactive           │
│                                                                     │
│  Admin edit page: /system/settings/translations                    │
│  One page: module selector + language selector + EntityListTable   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BE (Express) — CENTRAL GATEWAY                   │
│                                                                     │
│  PUBLIC read:                                                       │
│    GET /api/v1/translations/public/{lang}                           │
│      → reads public.translations (AppTranslationEntity)             │
│      → no auth, no module param (always public schema)              │
│                                                                     │
│  Authenticated read:                                                │
│    GET /api/v1/modules/{code}/translations/{lang}                   │
│      code="app"        → AppTranslationEntity      (public.translations)    │
│      code="system"     → SystemTranslationEntity    (system.translations)   │
│      code="emailsender"→ EmailsenderTranslationEntity(emailsender.translations) │
│      (entity class resolved from module code → schema mapping)      │
│                                                                     │
│  Central CRUD (admin):                                              │
│    GET    /api/v1/entities/translations/meta                        │
│    GET    /api/v1/entities/translations/list?module={code}&lang=..  │
│    POST   /api/v1/entities/translations?module={code}               │
│    PUT    /api/v1/entities/translations/{uuid}?module={code}        │
│    DELETE /api/v1/entities/translations/{uuid}?module={code}        │
│      → module code → entity class → DAL Repository (schema-native)  │
│      → writes invalidate Redis cache for that module's schema       │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL (cross-schema access)                 │
│                                                                     │
│  public.translations    → app.* (all app-scope UI keys)             │
│  system.translations    → system.* (settings + entity labels)       │
│  emailsender.translations → emailsender-specific keys               │
│  {schema}.translations  → any future module                         │
│                                                                     │
│  BE accesses ALL schemas via DAL entity classes (one per schema).   │
│  US microservices only create the table — no endpoints needed.      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Module code → schema → entity class mapping

| Module code | PG schema | Entity class (BE) | Contents |
|-------------|-----------|-------------------|----------|
| `app` | `public` | `AppTranslationEntity` | `app.*` (all app-scope UI: nav, auth, common, mcp, etc.) |
| `system` | `system` | `SystemTranslationEntity` | `system.*` (settings pages + entity labels) |
| `emailsender` | `emailsender` | `EmailsenderTranslationEntity` | emailsender-specific |
| ... | ... | ... | ... |

The `app` and `system` modules are always present (static whitelist). US modules
are discovered from `service_registry` at startup. The BE creates entity classes
for all known modules at startup.

### Data flow: flat DB rows → flat i18n dict (via PG `jsonb_object_agg`)

PostgreSQL builds the dict natively — no Node-side post-processing:

```sql
SELECT jsonb_object_agg(key, value) AS dict
FROM public.translations
WHERE language = $1 AND deleted_at IS NULL;
```

```
DB rows (from public.translations):
  key='app.title',                   language='it-IT', value='Primebrick'
  key='app.auth.login.title',        language='it-IT', value='Login'
  key='app.auth.login.hero.quote1',  language='it-IT', value='...'

         │ jsonb_object_agg(key, value)  ← done by PG, not Node
         ▼

API response (flat dict — keys are full dot-paths):
{
  "app.title": "Primebrick",
  "app.auth.login.title": "Login",
  "app.auth.login.hero.quote1": "..."
}
```

**Why flat dict (not nested):**
- PG builds it with a single built-in function — no custom aggregate, no recursion
- The DB already stores keys as dot-paths; the flat dict IS the natural shape
- FE lookup is `dict['app.auth.login.title']` — direct property access, no path traversal
- Eliminates the SDK's `i18n-builder.ts` entirely
- FE `getPath()`, `deepMerge()`, `flattenDictKeys()` all become trivial
- The fallback `en-GB.json` is also a flat dict — consistent with the API

**FE `$t()` lookup changes from:**
```ts
// OLD: path traversal through nested dict
const template = getPath($dict, key) ?? key;
```
**To:**
```ts
// NEW: direct property access on flat dict
const template = $dict[key] ?? key;
```

---

## 3. DB Table Schema

**Schema = module boundary.** Each module's translations live in their own
PostgreSQL schema. All translation tables have identical structure — they differ
only in schema name.

### Schema-to-module mapping

| Module code | PG schema | Table | Contents (root key) |
|-------------|-----------|-------|---------------------|
| `app` | `public` | `public.translations` | `app.*` — all app-scope UI keys |
| `system` | `system` (NEW) | `system.translations` | `system.*` — settings pages + entity labels |
| `emailsender` | `emailsender` | `emailsender.translations` | emailsender-specific |
| ... | ... | ... | ... |

**Key reorganization — 12 roots → 2 roots (USER APPROVED):**

The old 12 top-level namespaces (`app`, `shell`, `login`, `welcome`, `auth`,
`common`, `validation`, `errors`, `roles`, `config`, `impact`, `mcp`) are
consolidated into ONE root: `app.*`. The old `entities.*` namespace moves to
`system.*` with settings page labels.

**Rationale:**
- `app` vs `shell` was over-thinking — it's all the app in the end.
- `common.*`, `validation.*`, `errors.*`, `impact.*` are all app-scope UI
  vocabulary → `app.common.*`, `app.common.validation.*`, etc.
- `login.*`, `welcome.*`, `auth.*`, `roles.*` are all authentication → `app.auth.*`.
- `mcp.*` is still the app → `app.mcp.*`.
- `shell.nav.*` → `app.nav.*` — navigation is app-level.
- `shell.settings.*` and `config.*` are system admin config → `system.settings.*`.
- `entities.*` → `system.entities.*` — entity labels are system-level.

**`public.translations` — `app.*` (~408 leaves):**

| New key | From | Leaves |
|---------|------|--------|
| `app.title` | `app.title` | 1 |
| `app.nav.*` | `shell.nav` | 6 |
| `app.search.*` | `shell.search` | 2 |
| `app.commandPalette.*` | `shell.commandPalette` | 12 |
| `app.notifications.*` | `shell.notifications` | 1 |
| `app.aiChat.*` | `shell.aiChat` | 16 |
| `app.userMenu.*` | `shell.userMenu` | 11 |
| `app.org.*` | `shell.org` | 4 |
| `app.system.*` | `shell.system` | 6 |
| `app.theme.*` | `shell.theme` | 2 |
| `app.health.*` | `shell.health` | 37 |
| `app.errors.*` | `shell.errors` | 11 |
| `app.rfcError.*` | `shell.rfcError` | 2 |
| `app.listFailed.*` | `shell.listFailed` | 11 |
| `app.serverUnreachable.*` | `shell.serverUnreachable` | 83 |
| `app.modulesLoadFailed.*` | `shell.modulesLoadFailed` | 24 |
| `app.retry.*` | `shell.retry` | 5 |
| `app.subtitle.*` | `shell.subtitle` | 10 |
| `app.auth.login.*` | `login.*` | 34 |
| `app.auth.welcome.*` | `welcome.*` | 36 |
| `app.auth.sessionExpired.*` | `auth.sessionExpired` | 4 |
| `app.auth.passkeys.*` | `auth.passkeys` | 21 |
| `app.auth.mfa.*` | `auth.mfa` | ~40 |
| `app.auth.mfaStepUp.*` | `auth.mfaStepUp` | ~15 |
| `app.auth.authMethodEnforcer.*` | `auth.authMethodEnforcer` | ~7 |
| `app.auth.roles.*` | `roles.*` | 7 |
| `app.common.*` | `common.*` | 74 |
| `app.common.validation.*` | `validation.*` | 31 |
| `app.common.errors.*` | `errors.*` | 8 |
| `app.common.impact.*` | `impact.*` | 5 |
| `app.mcp.consent.*` | `mcp.consent` | 15 |

**`system.translations` — `system.*` (~774 leaves):**

| New key | From | Leaves |
|---------|------|--------|
| `system.entities.*` | `entities.*` | 318 |
| `system.settings.title.*` | `shell.settings.title` | 8 |
| `system.settings.breadcrumbMenu.*` | `shell.settings.breadcrumbMenu` | 13 |
| `system.settings.tabs.*` | `shell.settings.tabs` | 9 |
| `system.settings.profile.*` | `shell.settings.profile` | 26 |
| `system.settings.credentials.*` | `shell.settings.credentials` | 5 |
| `system.settings.roles.*` | `shell.settings.roles` | 43 |
| `system.settings.users.*` | `shell.settings.users` | 72 |
| `system.settings.organizations.*` | `shell.settings.organizations` | 22 |
| `system.settings.audit.*` | `shell.settings.audit` | 8 |
| `system.settings.security.*` | `shell.settings.security` | 53 |
| `system.settings.modules.*` | `shell.settings.modules` | 37 |
| `system.settings.templates.*` | `shell.settings.templates` | 6 |
| `system.settings.emailProviders.*` | `shell.settings.emailProviders` | 22 |
| `system.settings.config.typeConfig.*` | `config.typeConfig` | 36 |
| `system.settings.config.currencySelect.*` | `config.currencySelect` | 5 |
| `system.settings.config.auth.*` | `config.auth` | 110 |

**Result:**
- 12 roots in public + 1 root in system = 13 roots → **1 root in public + 1 root in system = 2 roots**
- 864 leaves in public → **408 leaves in public** (~60% smaller payload for public endpoint)
- 318 leaves in system → **774 leaves in system** (absorbed settings labels)
- Public endpoint returns ~25KB instead of ~60KB — login/welcome pages load faster

**Why `system.*` goes in `system.translations` (not `public`):**
- `system.*` (settings + entity labels) is only needed when authenticated.
- Public pages don't need settings labels or entity labels.
- Keeps `public.translations` focused on app-scope UI that everyone needs.

### Table: `{schema}.translations` (identical DDL for all schemas)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `BIGSERIAL` | PRIMARY KEY | Surrogate key |
| `uuid` | `UUID` | UNIQUE NOT NULL | DAL `@Unique` |
| `key` | `VARCHAR(255)` | NOT NULL | Full dot-path (e.g. `app.auth.login.title`) |
| `language` | `VARCHAR(10)` | NOT NULL | BCP 47 tag (e.g. `it-IT`) |
| `value` | `TEXT` | NOT NULL | Translated string |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | Audit |
| `created_by` | `VARCHAR(255)` | NOT NULL | Audit |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | Audit |
| `updated_by` | `VARCHAR(255)` | NOT NULL | Audit |
| `version` | `INTEGER` | NOT NULL DEFAULT 1 | Audit (optimistic locking) |
| `deleted_at` | `TIMESTAMPTZ` | nullable | Soft delete |
| `deleted_by` | `VARCHAR(255)` | nullable | Soft delete |

**Unique constraint:** `(key, language)` — one value per key per language.

**Index:** `CREATE INDEX ... ON {schema}.translations (language) WHERE deleted_at IS NULL`
— the i18n read endpoint filters by language.

**No `namespace` column** — the `key` IS the full dot-path. The API returns
a flat dict where keys are the dot-paths (built by PG's `jsonb_object_agg`).
No nested transformation needed — the flat dict IS the natural shape for
FE lookup (`dict['app.auth.login.title']`). This keeps the table
simple and the EntityListTable editing straightforward (filter by language,
search by key).

---

## 4. DAL Changes (`primebrick-dal-v3`)

### 4.1. New file: `src/entities/translation-entity-base.ts`

Mirrors the existing `ConfigEntityBase` pattern.

```ts
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
} from "../index.js";

/**
 * Shared base class for translation entities.
 *
 * Schema = module boundary. Each module creates a concrete subclass with its
 * own schema. The DAL's Repository resolves the schema natively via
 * getQualifiedTableName(entity) — no raw SQL, no string interpolation.
 *
 * BE creates entity classes for all modules it manages:
 *   @Entity("translations", "public")
 *   export class AppTranslationEntity extends TranslationEntityBase {}
 *
 *   @Entity("translations", "system")
 *   export class SystemTranslationEntity extends TranslationEntityBase {}
 *
 *   @Entity("translations", "emailsender")
 *   export class EmailsenderTranslationEntity extends TranslationEntityBase {}
 *
 * The BE's central CRUD handler maps module code → entity class → Repository.
 * US microservices do NOT create entity classes — the BE manages their schemas.
 */
@Entity("translations")
@AuditTrail()
export abstract class TranslationEntityBase implements IAuditableEntity {
  @Key()
  id!: bigint;

  @Unique()
  uuid!: string;

  // Composite unique: (key, language) — grouped by index name, ordered by priority.
  // The DAL generates: CREATE UNIQUE INDEX translations_key_language_uidx
  //   ON {schema}.translations (key, language) WHERE deleted_at IS NULL
  @Unique("translations_key_language_uidx", 0)
  @Column({ length: 255, nullable: false })
  key!: string;

  @Unique("translations_key_language_uidx", 1)
  @Column({ length: 10, nullable: false })
  language!: string;

  @Column({ nullable: false })
  value!: string;

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

### 4.2. Export from `src/index.ts`

Add `TranslationEntityBase` to the public API exports.

### 4.3. Enhance `@Unique` decorator for composite unique constraints

**Current state (verified in `src/meta/entity-decorators.ts` lines 236-248):**
`@Unique()` takes no args, sets `col.isUnique = true` and `col.nullable = false`.
No composite support.

**Design (no new decorator — extend `@Unique` with optional args):**

Three overloads, backward-compatible:

```ts
// 1. No args — single-column unique (backward compatible, existing behavior)
@Unique()
uuid!: string;

// 2. With index name only — single-column unique with a named index
@Unique("customer_code_uidx")
code!: string;

// 3. With index name + order priority — composite unique group member.
//    All columns sharing the same index name form one composite unique index.
//    orderPriority (0, 1, 2, ...) determines column position within the index.
@Unique("translations_key_language_uidx", 0)
key!: string;

@Unique("translations_key_language_uidx", 1)
language!: string;
```

**Implementation changes in `src/meta/entity-decorators.ts`:**

1. **`ColumnRegistration` type** — add two optional fields:
   ```ts
   type ColumnRegistration = {
     // ... existing fields ...
     isUnique: boolean;
     /** Named unique index — columns sharing the same name form a composite unique constraint. */
     uniqueIndexName?: string;
     /** Column order within a composite unique index (0-based). Ignored for single-column unique. */
     uniqueOrderPriority?: number;
     // ... rest ...
   };
   ```

2. **`@Unique` decorator** — add overloads:
   ```ts
   export function Unique(): PropertyDecorator;
   export function Unique(indexName: string): PropertyDecorator;
   export function Unique(indexName: string, orderPriority: number): PropertyDecorator;
   export function Unique(indexName?: string, orderPriority?: number): PropertyDecorator {
     return function (target: object, propertyKey: string | symbol) {
       const ctor = (target as { constructor: Function }).constructor;
       const col = touchColumn(ctor, propertyKey);
       col.isUnique = true;
       col.nullable = false;
       if (indexName !== undefined) col.uniqueIndexName = indexName;
       if (orderPriority !== undefined) col.uniqueOrderPriority = orderPriority;
       const dt = Reflect.getMetadata("design:type", target, propertyKey);
       if (dt && typeof (dt as { name?: string }).name === "string") {
         col.tsDesignTypeCtorName = (dt as Function).name;
       }
     };
   }
   ```

3. **`EntityPersistenceMeta` type** — expose the new fields in the column entry:
   ```ts
   columns: Record<string, {
     // ... existing fields ...
     isUnique: boolean;
     uniqueIndexName?: string;
     uniqueOrderPriority?: number;
     // ... rest ...
   }>;
   ```

4. **`getEntityPersistenceMeta()`** — populate the new fields from `ColumnRegistration`:
   ```ts
   // Inside the column loop, after setting isUnique:
   if (reg.uniqueIndexName !== undefined) entry.uniqueIndexName = reg.uniqueIndexName;
   if (reg.uniqueOrderPriority !== undefined) entry.uniqueOrderPriority = reg.uniqueOrderPriority;
   ```

5. **DDL generation / snapshot tooling** — group columns by `uniqueIndexName`:
   - No `uniqueIndexName` → single-column unique index (backward compat,
     auto-generated name like `{table}_{column}_uidx`)
   - Same `uniqueIndexName` on multiple columns → composite unique index
     with those columns, ordered by `uniqueOrderPriority` ascending
   - The generated DDL uses the user-provided index name:
     `CREATE UNIQUE INDEX {uniqueIndexName} ON {schema}.{table} (col1, col2) WHERE deleted_at IS NULL`

6. **Repository clone logic** (`src/repository/repository.ts` lines 1156-1180):
   The existing code uses `col.isUnique` to find the uuid column and to skip
   unique fields in clone. This stays the same — `isUnique` is still set to
   `true` for composite-unique columns. The clone logic skips ALL unique
   columns (both single and composite), which is correct: the clone should
   get a new uuid and the composite key fields should be reset by the caller.

**Backward compatibility:**
- All existing `@Unique()` calls (no args) work unchanged — `isUnique = true`,
  no `uniqueIndexName`, no `uniqueOrderPriority`.
- The `EntityPersistenceMeta` snapshot gains two optional fields — existing
  consumers that don't read them are unaffected.
- DDL generation for single-column unique (no index name) is unchanged.

---

## 5. SDK Changes (`primebrick-v3-sdk`)

### 5.1. New directory: `src/translations/`

| File | Purpose |
|------|---------|
| `translations-service.ts` | Framework-agnostic CRUD + i18n read logic (takes entity class param) |
| `translations-cache.ts` | Redis cache helpers (get/set/invalidate i18n dict, keyed by schema) |
| `index.ts` | Re-exports |

**No `i18n-builder.ts`** — PostgreSQL builds the dict natively via
`jsonb_object_agg(key, value)`. No Node-side post-processing needed.

**No `express-translations-router.ts`** — the BE builds its own router since it's
the central gateway with module-aware routing. The SDK service is framework-agnostic.

### 5.2. `translations-cache.ts`

Cache key includes the schema (derived from the entity class via
`getEntityPersistenceMeta`) so `public.translations:it-IT` and
`system.translations:it-IT` don't collide.

The i18n dict is a **flat dict** (`Record<string, string>`) — keys are full
dot-paths, values are translated strings. Built by PG's `jsonb_object_agg`.

```ts
import type { CachePort } from "../cache/cache-port.js";

/** Flat i18n dict — keys are full dot-paths (e.g. "app.auth.login.title"). */
export type I18nDict = Record<string, string>;

/** Cache key format: `translations:i18n:{schema}:{language}` */
export function i18nCacheKey(schema: string, language: string): string {
  return `translations:i18n:${schema}:${language}`;
}

/** TTL: 6 hours (21_600_000 ms) — translations change rarely; invalidation-on-write
 *  handles freshness in the normal case. TTL is a safety net for edge cases
 *  (Redis down during write, direct DB edits). 6h limits stale data to 6h
 *  while reducing DB reads 6x vs a 1h TTL (3.5 vs 21 queries/hour). */
const I18N_CACHE_TTL = 21_600_000;

export class TranslationsCache {
  constructor(
    private readonly port: CachePort | null,
    private readonly schema: string,
  ) {}

  async getI18nDict(language: string): Promise<I18nDict | null> {
    if (!this.port) return null;
    return this.port.get<I18nDict>(i18nCacheKey(this.schema, language));
  }

  async setI18nDict(language: string, dict: I18nDict): Promise<void> {
    if (!this.port) return;
    await this.port.set(i18nCacheKey(this.schema, language), dict, I18N_CACHE_TTL);
  }

  async invalidate(language?: string): Promise<void> {
    if (!this.port) return;
    if (language) {
      await this.port.del(i18nCacheKey(this.schema, language));
    } else {
      // Invalidate all languages for this schema
      await this.port.delByPrefix(`translations:i18n:${this.schema}:`);
    }
  }
}
```

### 5.4. `translations-service.ts`

Framework-agnostic service. Takes a DAL `Repository` (for CRUD) and a
`Queryable` (for the `jsonb_object_agg` read) as constructor params.

The entity class determines the schema — the DAL's `getQualifiedTableName(entity)`
resolves it natively. The `jsonb_object_agg` query uses the DAL-resolved table
name (safe, no string interpolation) and a parameterized language value:

```sql
SELECT jsonb_object_agg(key, value) AS dict
FROM "public"."translations"   ← from getQualifiedTableName(entity)
WHERE language = $1 AND deleted_at IS NULL
```

This is NOT "raw SQL with schema interpolation" — the table name comes from
DAL metadata (compile-time `@Entity` decorator), the language is a parameter.
The DAL's `Repository` itself uses the same `db.query()` pattern internally.

The service creates a cache per schema on demand (lazily, since there may be
many modules). The schema is read from the entity class via
`getEntityPersistenceMeta(entity).tableSchema`.

```ts
import { TranslationsCache, type I18nDict } from "./translations-cache.js";
import type { CachePort } from "../cache/cache-port.js";

/**
 * Structural interface — a DAL Repository satisfies this without any import.
 * TypeScript structural typing: if it has these methods, it's assignable.
 */
export interface TranslationsRepository {
  findByPage(entity: unknown, resultCtor: unknown, options: {
    filters?: Array<{ field: string; op: string; value: unknown }>;
    page?: number;
    page_size?: number;
    sort_key?: string;
    sort_dir?: string;
    deleted_records?: string;
  }): Promise<{ rows: TranslationRow[]; total: bigint }>;
  create(entity: unknown, data: Partial<TranslationRow>, options: { actor: string }): Promise<TranslationRow>;
  update(entity: unknown, uuid: string, data: Partial<TranslationRow>, options: { actor: string }): Promise<TranslationRow>;
  softDelete(entity: unknown, uuid: string, options: { actor: string }): Promise<void>;
  restore(entity: unknown, uuid: string, options: { actor: string }): Promise<void>;
}

/** Queryable — same type the DAL Repository uses (Pick<Pool, "query">). */
type Queryable = { query(text: string, params?: unknown[]): Promise<{ rows: any[] }> };

export interface TranslationsServiceOptions {
  repository: TranslationsRepository;
  queryable: Queryable;  // for jsonb_object_agg read
  cachePort: CachePort | null;
}

export class TranslationsService {
  private readonly caches = new Map<string, TranslationsCache>();

  constructor(private readonly opts: TranslationsServiceOptions) {}

  /** Get or create a cache for a specific schema. */
  private getCache(schema: string): TranslationsCache {
    let cache = this.caches.get(schema);
    if (!cache) {
      cache = new TranslationsCache(this.opts.cachePort, schema);
      this.caches.set(schema, cache);
    }
    return cache;
  }

  /**
   * Get the flat i18n dict for a language from a specific module's schema.
   * PG builds the dict natively via jsonb_object_agg — no Node-side post-processing.
   * Cache-first; falls back to DB on miss.
   *
   * The table name comes from getQualifiedTableName(entity) — safe, no interpolation.
   * The language is a parameterized query value.
   */
  async getI18nDict(entity: unknown, schema: string, language: string): Promise<I18nDict> {
    const cache = this.getCache(schema);
    const cached = await cache.getI18nDict(language);
    if (cached) return cached;

    const table = getQualifiedTableName(entity as EntityClass);
    const result = await this.opts.queryable.query(
      `SELECT jsonb_object_agg(key, value) AS dict FROM ${table} WHERE language = $1 AND deleted_at IS NULL`,
      [language]
    );
    const dict = (result.rows[0]?.dict ?? {}) as I18nDict;
    await cache.setI18nDict(language, dict);
    return dict;
  }

  async list(entity: unknown, schema: string, query: { page?: number; page_size?: number; language?: string }) {
    const filters: Array<{ field: string; op: string; value: unknown }> = [];
    if (query.language) {
      filters.push({ field: "language", op: "=", value: query.language });
    }
    return this.opts.repository.findByPage(entity, entity, {
      filters,
      page: query.page ?? 1,
      page_size: query.page_size ?? 25,
      deleted_records: "EXCLUDED",
    });
  }

  async create(entity: unknown, schema: string, data: { key: string; language: string; value: string }, actor: string) {
    const row = await this.opts.repository.create(entity, data, { actor });
    await this.getCache(schema).invalidate(data.language);
    return row;
  }

  async update(entity: unknown, schema: string, uuid: string, data: { key?: string; language?: string; value?: string }, actor: string) {
    const row = await this.opts.repository.update(entity, uuid, data, { actor });
    await this.getCache(schema).invalidate();
    return row;
  }

  async softDelete(entity: unknown, schema: string, uuid: string, actor: string) {
    await this.opts.repository.softDelete(entity, uuid, { actor });
    await this.getCache(schema).invalidate();
  }

  async restore(entity: unknown, schema: string, uuid: string, actor: string) {
    await this.opts.repository.restore(entity, uuid, { actor });
    await this.getCache(schema).invalidate();
  }
}
```

### 5.5. Export from `src/index.ts`

Add translations exports to the SDK's public API.

---

## 6. BE Changes (`primebrick-be-v3`)

### 6.1. Entity classes: one per schema

The BE creates entity classes for all modules it manages. `app` and `system`
are static (always present). US modules are discovered from `service_registry`
at startup, and the BE creates entity classes for them too (all extending
`TranslationEntityBase` with the appropriate `@Entity("translations", "{schema}")`).

```ts
// src/modules/system/translation_entities.ts
import { TranslationEntityBase } from "@primebrick/dal-pg";

@Entity("translations", "public")
export class AppTranslationEntity extends TranslationEntityBase {}

@Entity("translations", "system")
export class SystemTranslationEntity extends TranslationEntityBase {}

// US modules — created dynamically at startup or statically if known:
@Entity("translations", "emailsender")
export class EmailsenderTranslationEntity extends TranslationEntityBase {}
```

### 6.2. Module code → entity class registry

```ts
// src/modules/system/translation-registry.ts
import type { EntityClass } from "@primebrick/dal-pg";
import { AppTranslationEntity, SystemTranslationEntity, EmailsenderTranslationEntity } from "./translation_entities.js";

/** Static modules — always present. */
const STATIC_MODULES: Record<string, EntityClass> = {
  app: AppTranslationEntity,
  system: SystemTranslationEntity,
};

/** US modules — populated from service_registry at startup. */
const US_MODULES: Record<string, EntityClass> = {
  emailsender: EmailsenderTranslationEntity,
  // ... discovered from service_registry ...
};

export function resolveTranslationEntity(moduleCode: string): EntityClass {
  const entity = STATIC_MODULES[moduleCode] ?? US_MODULES[moduleCode];
  if (!entity) throw new NotFoundError(`Unknown module: ${moduleCode}`);
  return entity;
}

export function getSchemaForEntity(entity: EntityClass): string {
  return getEntityPersistenceMeta(entity).tableSchema;
}

export function listTranslationModules(): string[] {
  return [...Object.keys(STATIC_MODULES), ...Object.keys(US_MODULES)];
}
```

### 6.3. DAL: `src/modules/system/translations_dal.ts`

Thin wrapper using the generic `Repository` from the DAL. The SDK's
`TranslationsService` accepts this via structural typing. The Repository
resolves the schema natively via `getQualifiedTableName(entity)`.

### 6.4. Meta: `src/modules/system/translations.meta.ts`

```ts
export const translationsMeta = {
  entity: "translations",
  translationKey: "translation",
  titleKey: "shell.settings.translations.title",
  uid: "uuid",
  list: {
    columns: [
      { key: "key", labelKey: "entities.translation.fields.key", type: "text", sortable: true, defaultVisible: true, filterable: true },
      { key: "language", labelKey: "entities.translation.fields.language", type: "text", sortable: true, defaultVisible: true, filterable: true },
      { key: "value", labelKey: "entities.translation.fields.value", type: "text", sortable: false, defaultVisible: true, filterable: true },
      { key: "updated_at", labelKey: "entities.translation.fields.updated_at", type: "datetime", sortable: true, defaultVisible: false },
      { key: "updated_by", labelKey: "entities.translation.fields.updated_by", type: "text", sortable: false, defaultVisible: false },
    ],
    rowActions: { delete: true, edit: true },
    enableCreateAction: true,
  },
};
```

### 6.5. Router: `src/modules/system/translations.router.ts`

The BE builds its own router (not the SDK's — the BE is the central gateway
with module-aware routing). Uses `rbacHandler` for permission enforcement.

**Endpoints:**

**PUBLIC read (no auth):**
```
GET /api/v1/translations/public/{language}
  → permission: rbacHandler([Permission.PUBLIC])
  → reads AppTranslationEntity (public.translations)
  → returns flat i18n dict (via jsonb_object_agg)
```

**Authenticated read (any valid user):**
```
GET /api/v1/modules/{code}/translations/{language}
  → permission: rbacHandler([Permission.AUTHENTICATED_USER])
  → resolves entity class from module code
  → reads from {schema}.translations
  → returns flat i18n dict (via jsonb_object_agg)
```

**Central CRUD (admin):**
```
GET    /api/v1/entities/translations/meta
  → permission: rbacHandler([Permission.TRANSLATIONS_MANAGE])
  → returns translationsMeta (same for all modules)

GET    /api/v1/entities/translations/list?module={code}&language={lang}
  → permission: rbacHandler([Permission.TRANSLATIONS_MANAGE])
  → resolves entity class from module code
  → returns paginated flat rows from {schema}.translations

POST   /api/v1/entities/translations?module={code}
  → permission: rbacHandler([Permission.TRANSLATIONS_MANAGE])
  → creates row in {schema}.translations
  → invalidates Redis cache for that schema

PUT    /api/v1/entities/translations/{uuid}?module={code}
  → permission: rbacHandler([Permission.TRANSLATIONS_MANAGE])
  → updates row in {schema}.translations
  → invalidates Redis cache for that schema

DELETE /api/v1/entities/translations/{uuid}?module={code}
  → permission: rbacHandler([Permission.TRANSLATIONS_MANAGE])
  → soft-deletes row in {schema}.translations
  → invalidates Redis cache for that schema
```

**Module list (for the FE module selector):**
```
GET /api/v1/entities/translations/modules
  → permission: rbacHandler([Permission.TRANSLATIONS_MANAGE])
  → returns list of available module codes (app, system, emailsender, ...)
```

### 6.6. Permission: `src/modules/auth/permissions.ts`

Add `TRANSLATIONS_MANAGE = "translations.manage"` to the `Permission` enum.

### 6.6. DB patches: two initial scripts only

**Goal:** After this work, `db-meta/patches/` contains exactly TWO files:
1. `00000000000000_init_database.sql` — all basic stuff (existing, updated in place,
   absorbs all 5 extra patches per §6.6.1 — **USER CONFIRMED**)
2. `00000000000001_create_translations_table.sql` — translations table (NEW)

The old `00000000000001_create_api_keys_table.sql` is absorbed into the init
script and deleted, freeing the `00000000000001` slot for the translations patch.

Any other patch file currently in `db-meta/patches/` is consolidated into the
init script (see §6.6.1 below — **USER CONFIRMED**).

#### 6.6.0. Current state of `db-meta/patches/` (verified empirically + live DB)

**Method:** Read each patch file, searched BE source for usage, queried live DB
via postgres MCP for table/column existence, row counts, and patch registry state.

| File | Content | In init? | In code? | In live DB? | Rows | Entity class? |
|------|---------|----------|----------|-------------|------|---------------|
| `00000000000000_init_database.sql` | All base tables | — (IS init) | YES | YES | — | YES (multiple) |
| `00000000000001_create_api_keys_table.sql` | `CREATE TABLE public.api_keys` | **NO** | **YES** — `BeApiKeyPort` raw SQL in `sdk-auth-ports.ts:149` | **YES** | 0 | **NO** — raw SQL access |
| `00000000000002_add_service_registry_is_reserved.sql` | `ALTER TABLE service_registry ADD is_reserved` + seed 'settings' module | **NO** | **YES** — `ServiceRegistryEntity` line 62, 5 files total | **YES** | 1 (settings) | YES |
| `00000000000003_create_mcp_oauth_clients_table.sql` | `CREATE TABLE public.mcp_oauth_clients` | **NO** | **YES** — `OAuthClientRegistryDal` raw SQL in `client-registry.ts` | **YES** | 1 | **NO** — raw SQL access |
| `20260718231731_addcols_role_mappings.sql` | `ALTER TABLE role_mappings ADD idp_org, last_synced_at` | **NO** | **YES** — `RoleMappingEntity` lines 47-61, 38 files total | **YES** | — | YES |
| `20260720172408_add_uuid_role_mappings.sql` | `ALTER TABLE role_mappings ADD uuid` + unique index | **NO** | **YES** — `RoleMappingEntity` line 40, audit trail, API, router | **YES** | — | YES |

**Verdict: ALL 5 patches contain actively used schema. None are errors. All must
be consolidated into the init script.**

#### 6.6.0.1. Additional issues found during empirical verification

**Issue 1: Duplicate patch registry entry for `mcp_oauth_clients`**

The live `primebrick_database_patches` table has TWO entries:
- `00000000000003_create_mcp_oauth_clients_table.sql` (SHA256 `aea785...`, applied 2026-07-14)
- `00000000000003_create_mcp_oauth_clients_table` (SHA256 `c65ec1...`, applied 2026-07-16)

Same table, different SHA256, one with `.sql` suffix and one without. The
fire-and-forget cleanup must delete BOTH entries.

**Issue 2: Init script bug — references `uuid` column that doesn't exist in its own DDL**

The init script's `role_mappings` DDL (lines 294-306) does NOT create a `uuid`
column. But the audit seed (lines 538-551) references it:
```sql
INSERT INTO public.role_mappings_audit (entity_id, entity_uuid, action, ...)
SELECT id, uuid, 'INSERT', ...
FROM public.role_mappings
WHERE idp_role = 'administrators'
```
This means the init script would **FAIL on a fresh DB** unless the uuid patch
(`20260720172408`) is applied first. The init script was modified after the uuid
patch was created (to add the audit seed) but the DDL wasn't updated.

There's also a contradictory comment on line 556:
> "no audit trail seed for role_mappings because the table has no uuid column"
> (pre-existing schema limitation — administrators seed has the same gap).

Yet the first seed (line 538) DOES reference uuid. This is a bug.

**Fix during consolidation:** Add `uuid` to the `role_mappings` DDL in the init
script. The audit seed will then work on fresh DBs without needing the patch.

**Issue 3: `api_keys` and `mcp_oauth_clients` have no DAL entity classes**

Both tables are accessed via raw SQL (`pool.query(...)`) in:
- `BeApiKeyPort` (`sdk-auth-ports.ts`)
- `OAuthClientRegistryDal` (`client-registry.ts`)

This is a separate architectural issue — not blocking consolidation, but worth
noting for future cleanup (could add `@Entity` classes and use the DAL Repository).

**Issue 4: Live patch registry contains non-BE patches**

The live `primebrick_database_patches` table also contains US emailsender patches:
- `20260528114750_create_emailsender_email_config_emailsender_email_templates`
- `20260707120000_add_config_table_rename_email_config_to_providers`
- `0001_initial_schema`
- `0002_seed_microservice_config`
- `0002_ai_chat_tables`

These are NOT in the BE `db-meta/patches/` folder. They were applied directly
to the same database. The fire-and-forget cleanup must NOT touch these entries.

#### 6.6.1. Patch consolidation — USER CONFIRMED

> **✅ USER CONFIRMED.** The user reviewed the empirical verification (§6.6.0)
> and confirmed: absorb all 5 extra patches into `00000000000000_init_database.sql`,
> keep only `00000000000001_create_translations_table.sql` as the second script.
> The old `00000000000001_create_api_keys_table.sql` is absorbed and deleted,
> freeing the `00000000000001` slot for the translations patch.

**Empirical verification complete (§6.6.0).** All 5 extra patches contain
actively used schema — none are errors. All must be consolidated.

**Proposed consolidation:**

1. **Absorb** the content of all 5 extra patches into `00000000000000_init_database.sql`
   (update in place, per the SHA256 management rule):
   - Add `api_keys` table DDL + unique indexes (from `00000000000001`)
   - Add `is_reserved` column to `service_registry` DDL + settings seed (from `00000000000002`)
   - Add `mcp_oauth_clients` table DDL + unique indexes (from `00000000000003`)
   - Add `idp_org`, `last_synced_at` columns to `role_mappings` DDL (from `20260718231731`)
   - Add `uuid` column to `role_mappings` DDL + unique index (from `20260720172408`)
     — this also **fixes the init script bug** (§6.6.0.1 Issue 2)
   - Remove the contradictory comment on line 556 ("no audit trail seed ...
     because the table has no uuid column") — the table now HAS uuid
   - All using `IF NOT EXISTS` / idempotent guards (the init script is already idempotent)

2. **Delete** the 5 extra patch files from `db-meta/patches/`:
   - `00000000000001_create_api_keys_table.sql`
   - `00000000000002_add_service_registry_is_reserved.sql`
   - `00000000000003_create_mcp_oauth_clients_table.sql`
   - `20260718231731_addcols_role_mappings.sql`
   - `20260720172408_add_uuid_role_mappings.sql`

3. **Create fire-and-forget script** in `d:\git\primebrick\temp\` (NOT in
   `db-meta/fire-and-forget/` — see §6.6.3 below) to:
   - Update the SHA256 of `00000000000000_init_database.sql` in the patch registry
     (the hash changed because the file was modified)
   - Delete the registry entries for the 5 removed patches (so `db:migrate`
     doesn't try to re-apply them)
   - **Delete the duplicate `mcp_oauth_clients` entries** — both
     `00000000000003_create_mcp_oauth_clients_table.sql` AND
     `00000000000003_create_mcp_oauth_clients_table` (§6.6.0.1 Issue 1)
   - **DO NOT touch** the US emailsender patch entries (§6.6.0.1 Issue 4)

4. **Create** `00000000000001_create_translations_table.sql` (the NEW second
   initial script — see §6.6.2 below)

**⚠️ No longer a blocker — USER CONFIRMED.** The consolidation proceeds as
described above. The fire-and-forget script (step 3) is created in
`d:\git\primebrick\temp\` and applied manually to each live DB.

#### 6.6.2. New initial patch: `db-meta/patches/00000000000001_create_translations_table.sql`

Creates the `system` schema + two translation tables (`public.translations`
and `system.translations`). US microservice tables (e.g. `emailsender.translations`)
are created by their own DB patches (§7.3).

```sql
-- Primebrick: Translations tables — DB is the sole source of truth for i18n.
-- Schema = module boundary: public.translations (app module), system.translations (system module).
-- One row per (key, language) pair. The key is the full dot-path
-- (e.g. 'app.auth.login.title'). The API transforms flat rows
-- into a flat i18n dict at read time (via jsonb_object_agg).

-- === system schema (for system module: settings + entity labels) ===
CREATE SCHEMA IF NOT EXISTS system;
GRANT ALL ON SCHEMA system TO primebrick;
GRANT ALL ON SCHEMA system TO public;

-- === public.translations (app module: app.* — all app-scope UI keys) ===
CREATE TABLE IF NOT EXISTS public.translations (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  key VARCHAR(255) NOT NULL,
  language VARCHAR(10) NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(255)
);

CREATE UNIQUE INDEX IF NOT EXISTS translations_key_language_uidx
  ON public.translations (key, language)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS translations_language_idx
  ON public.translations (language)
  WHERE deleted_at IS NULL;

-- === system.translations (system module: system.* — settings + entity labels) ===
CREATE TABLE IF NOT EXISTS system.translations (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  key VARCHAR(255) NOT NULL,
  language VARCHAR(10) NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(255)
);

CREATE UNIQUE INDEX IF NOT EXISTS system_translations_key_language_uidx
  ON system.translations (key, language)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS system_translations_language_idx
  ON system.translations (language)
  WHERE deleted_at IS NULL;
```

This is a regular patch (not a second "init" in the SHA256 rule sense — the
rule says "NEVER create a new initial patch" meaning don't create
`init_database_v2.sql`). `00000000000001_create_translations_table.sql` is a
standard numbered patch for a separate concern.

#### 6.6.3. Fire-and-forget scripts location: `d:\git\primebrick\temp\`

**User decision:** The `db-meta/fire-and-forget/` folder in the BE repo is
"stupid" and should NOT be used. Fire-and-forget scripts belong in the
**temp workspace folder** (`d:\git\primebrick\temp\`), like any other
one-time tooling.

This conflicts with the current `.devin/rules/patch-sha256-management.md`
which says "Create a SQL file in `db-meta/fire-and-forget/`". That rule
needs to be updated to point to `d:\git\primebrick\temp\` instead.

**Fire-and-forget scripts for this feature (all in `d:\git\primebrick\temp\`):**

1. `update_init_patch_sha256_consolidated.sql` — updates the SHA256 of
   `00000000000000_init_database.sql` in the patch registry after the
   consolidation (§6.6.1). Also deletes registry entries for the 5 removed
   patches.

2. `seed_translations.sql` — seeds all current translations from the 6 FE JSON
   files into `public.translations` (`app.*`) and `system.translations`
   (`system.*`), using `INSERT ... ON CONFLICT (key, language) DO NOTHING`.
   The seed script applies the key reorganization (§3): old namespaces are
   remapped to `app.*` or `system.*` before insertion.

3. `generate-translation-seed.mjs` — Node script that reads the 6 FE JSON
   files, flattens them into `(key, language, value)` rows, applies the key
   reorganization mapping (old → new), splits by target table
   (`app.*` → public, `system.*` → system), and generates the
   `seed_translations.sql` file. Run once, output committed to temp, applied
   manually to each live DB.

**All fire-and-forget scripts are:**
- Created in `d:\git\primebrick\temp\` (NOT in any repo)
- Applied manually on each existing database via `psql` or `tsx`
- Cleaned up after use (per the temp-files rule)
- NOT committed to any git repository

**SHA256 management rule update required:**
Update `.devin/rules/patch-sha256-management.md` in the BE repo to change
the fire-and-forget location from `db-meta/fire-and-forget/` to
`d:\git\primebrick\temp\`. This is a convention change that affects all
future patch modifications.

**Existing `db-meta/fire-and-forget/` folder (22 files):**
The existing fire-and-forget scripts in the BE repo are already committed
and have presumably been applied to live DBs. They should NOT be deleted
(retroactive cleanup of committed history is out of scope). But going
forward, NEW fire-and-forget scripts go in the temp workspace only.

### 6.8. Mount in `src/modules/index.ts`

Add the translations router to the module mount list.

### 6.8. Cache initialization

The BE's `initCache()` already creates the `CachePort` singleton. The
`TranslationsService` receives `getCachePort()` at construction time.
Cache keys are schema-scoped: `translations:i18n:{schema}:{language}`
(e.g. `translations:i18n:public:it-IT`, `translations:i18n:system:it-IT`).
No service prefix needed — the schema IS the namespace.

---

## 7. US Changes (`primebrick-us-v3`)

**Simplified: US microservices only create the DB table. No entity classes,
no route handlers, no endpoints.** The BE manages all CRUD for all schemas
via its central gateway (§6).

### 7.1. DB patches per microservice

**Current state of emailsender `db-meta/patches/` (verified empirically):**

| File | Content |
|------|---------|
| `0001_initial_schema.sql` | Initial schema (config, email_templates, providers, sender_logs, service_registry) |
| `0002_seed_microservice_config.sql` | Seed config rows |

Plus `db-meta/fire-and-forget/` with 3 files (rename_log_table, seed_config, seed_onboarding_email_templates).

**Same principle as BE:** fire-and-forget scripts go in `d:\git\primebrick\temp\`,
NOT in `db-meta/fire-and-forget/`.

**For the translations feature:**

1. **New patch:** `db-meta/patches/0003_create_translations_table.sql`
   — creates `emailsender.translations` table with the same DDL as BE
   but schema-qualified to `emailsender`:

   ```sql
   CREATE TABLE IF NOT EXISTS emailsender.translations (
     id BIGSERIAL PRIMARY KEY,
     uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
     key VARCHAR(255) NOT NULL,
     language VARCHAR(10) NOT NULL,
     value TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     created_by VARCHAR(255) NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_by VARCHAR(255) NOT NULL,
     version INTEGER NOT NULL DEFAULT 1,
     deleted_at TIMESTAMPTZ,
     deleted_by VARCHAR(255)
   );

   CREATE UNIQUE INDEX IF NOT EXISTS emailsender_translations_key_language_uidx
     ON emailsender.translations (key, language)
     WHERE deleted_at IS NULL;

   CREATE INDEX IF NOT EXISTS emailsender_translations_language_idx
     ON emailsender.translations (language)
     WHERE deleted_at IS NULL;
   ```

2. **Fire-and-forget seed script** in `d:\git\primebrick\temp\`:
   `seed_emailsender_translations.sql` — seeds any emailsender-specific
   translations (currently empty — to be populated as the service grows).
   Applied manually to each live DB.

3. **No consolidation needed** for emailsender patches — the existing
   `0001` and `0002` are fine as-is (only 2 patches, both legitimate).
   The `db-meta/fire-and-forget/` folder exists but new fire-and-forget
   scripts go in temp only.

### 7.2. BE entity class for US schemas

The BE creates an entity class for each US microservice's schema (e.g.
`EmailsenderTranslationEntity` with `@Entity("translations", "emailsender")`).
This entity class lives in the BE repo, NOT in the US repo. The BE's DAL
Repository accesses the US schema via PostgreSQL cross-schema access
(the init script already grants access to all schemas).

The BE discovers US modules from `service_registry` at startup and registers
their entity classes in the module code → entity class mapping (§6.2).

### 7.3. No cache in US

US microservices do NOT participate in translation caching. The BE's
`TranslationsService` handles all caching (Redis). US microservices are
unaware that translations exist in their schema.

---

## 8. FE Changes (`primebrick-fe-v3`)

### 8.1. Refactor i18n store: `src/lib/i18n/store.svelte.ts`

From static imports → dynamic merge store.

```ts
import { browser } from '$app/environment';
import { DEFAULT_LANG, normalizeLang, type UiLang } from './languages';
import { writable } from 'svelte/store';

const LANG_STORAGE_KEY = 'pb.lang';
const I18N_CACHE_PREFIX = 'pb:i18n:';
const I18N_TTL_MS = 5 * 60 * 1000; // 5 minutes — user-facing freshness window

// ... (detectBrowserLang, readStoredLang unchanged) ...

// NEW: per-module dict cache in localStorage
export interface CachedI18nModule {
  dict: Record<string, unknown>;
  cached_at: number; // epoch ms
}

export function getCachedModuleDict(moduleId: string, lang: UiLang): CachedI18nModule | null {
  if (!browser) return null;
  const raw = localStorage.getItem(`${I18N_CACHE_PREFIX}${moduleId}:${lang}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedI18nModule;
    if (Date.now() - parsed.cached_at > I18N_TTL_MS) return null; // stale
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedModuleDict(moduleId: string, lang: UiLang, dict: Record<string, unknown>): void {
  if (!browser) return;
  const entry: CachedI18nModule = { dict, cached_at: Date.now() };
  localStorage.setItem(`${I18N_CACHE_PREFIX}${moduleId}:${lang}`, JSON.stringify(entry));
}
```

### 8.2. Refactor i18n index: `src/lib/i18n/index.ts`

From static `DICTS` map → dynamic flat dict merge. The dict is **flat** —
keys are full dot-paths (e.g. `"app.auth.login.title"`), values are
strings. PG builds this shape natively via `jsonb_object_agg`.

```ts
import { derived, writable, type Readable } from 'svelte/store';
import { uiLang } from './store.svelte';
import { DEFAULT_LANG, type UiLang } from './languages';

/** Flat dict — keys are full dot-paths, values are translated strings. */
type Dict = Record<string, string>;

// NEW: merged dict store — modules add their translations via mergeModuleDict
const _mergedDicts = writable<Record<UiLang, Dict>>({} as Record<UiLang, Dict>);

export function mergeModuleDict(lang: UiLang, partial: Dict): void {
  _mergedDicts.update((dicts) => ({
    ...dicts,
    [lang]: { ...dicts[lang] ?? {}, ...partial },  // flat merge — no deepMerge needed
  }));
}

export const dict = derived([uiLang, _mergedDicts], ([$lang, $dicts]) =>
  $dicts[$lang] ?? $dicts[DEFAULT_LANG] ?? {}
);

export const t: Readable<(key: string, params?: Record<string, any>) => string> = derived(
  dict,
  ($dict) =>
    (key: string, params?: Record<string, any>) => {
      const template = $dict[key] ?? key;  // direct property access — no getPath needed
      return params ? interpolate(template, params) : template;
    }
);
```

**Key simplifications with flat dict:**
- `deepMerge()` — **deleted** (flat spread `{...a, ...b}` replaces it)
- `getPath()` — **deleted** (`$dict[key]` replaces it)
- `flattenDictKeys()` — **deleted** (`Object.keys($dict)` replaces it)
- The dict shape from the API (`jsonb_object_agg`) IS the FE dict shape — no transformation

**Key change:** No more `enGB` fallback import. The fallback is the key itself
(if the translation is missing from the DB, the key is shown — a clear signal
that the translation needs to be added).

### 8.3. New composable: `src/lib/i18n/use-module-translations.svelte.ts`

Route-aware translation loader. Called from `(app)/+layout.svelte`.

```ts
import { uiLang, getCachedModuleDict, setCachedModuleDict } from './store.svelte';
import { mergeModuleDict, type UiLang } from './index';
import { resolveModuleFromRoute } from '$lib/shell/modules-shell.svelte';
import { browser } from '$app/environment';
import { page } from '$app/state';
import { apiFetch } from '$lib/api';

const LOADED_MODULES = new Set<string>(); // in-memory dedup per session

export function useModuleTranslations() {
  async function ensureModuleTranslations(moduleId: string, lang: UiLang): Promise<void> {
    const cacheKey = `${moduleId}:${lang}`;
    if (LOADED_MODULES.has(cacheKey)) return;

    // Check localStorage
    const cached = getCachedModuleDict(moduleId, lang);
    if (cached) {
      mergeModuleDict(lang, cached.dict);
      LOADED_MODULES.add(cacheKey);
      return;
    }

    // Fetch from API
    try {
      const res = await apiFetch(`/api/v1/modules/${encodeURIComponent(moduleId)}/translations/${encodeURIComponent(lang)}`);
      if (res.ok) {
        const dict = await res.json();
        mergeModuleDict(lang, dict);
        setCachedModuleDict(moduleId, lang, dict);
        LOADED_MODULES.add(cacheKey);
      }
    } catch (e) {
      console.error(`[i18n] Failed to load translations for module ${moduleId}, lang ${lang}:`, e);
    }
  }

  // Reactive: re-check on route change + language change
  const stop = $effect.root(() => {
    $effect(() => {
      if (!browser) return;
      const path = page.url.pathname;
      const moduleId = resolveModuleFromRoute(path);
      const lang = uiLang.value; // or use a derived
      if (moduleId) {
        ensureModuleTranslations(moduleId, lang);
      }
    });
  });

  return { ensureModuleTranslations, stop };
}
```

### 8.4. Layout integration: `src/routes/(app)/+layout.svelte`

Add translation loading on mount + on route/language change.

```svelte
<script lang="ts">
  // ... existing imports ...
  import { useModuleTranslations } from '$lib/i18n/use-module-translations.svelte';
  import { uiLang } from '$lib/i18n/store.svelte';
  import { shellNav } from '$lib/shell/modules-shell.svelte';

  const moduleI18n = useModuleTranslations();

  onMount(async () => {
    // ... existing bootstrap ...

    // Always load "app" module translations on app init (shell + public pages)
    await moduleI18n.ensureModuleTranslations('app', uiLang.value);
  });
</script>
```

### 8.5. API functions: `src/lib/api.ts`

```ts
// Public pages (login, welcome, onboarding, MCP consent) — no auth needed
export async function fetchPublicTranslations(language: string): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/v1/translations/public/${encodeURIComponent(language)}`);
  if (!res.ok) throw new Error(`Public translations request failed (${res.status})`);
  return await res.json();
}

// Authenticated pages — module-aware
export async function fetchModuleTranslations(moduleCode: string, language: string): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/v1/modules/${encodeURIComponent(moduleCode)}/translations/${encodeURIComponent(language)}`);
  if (!res.ok) throw new Error(`Translations request failed (${res.status})`);
  return await res.json();
}

// Admin — list available modules (for the module selector)
export async function fetchTranslationModules(): Promise<string[]> {
  const res = await apiFetch('/api/v1/entities/translations/modules');
  if (!res.ok) throw new Error(`Failed to fetch translation modules (${res.status})`);
  const data = await res.json();
  return data.modules ?? [];
}
```

### 8.6. Admin edit page: `src/routes/(app)/system/settings/translations/+page.svelte`

One page with a module selector + language selector + `EntityListTable`.

- **Module selector** (ComboSelect): populated from `fetchTranslationModules()`
  (returns `['app', 'system', 'emailsender', ...]`). Defaults to `app`.
- **Language selector** (ComboSelect with `UI_LANGS`): defaults to user's
  current language. Changes only the language filter for the table.
- **EntityListTable**: standard table showing translations for the selected
  module + language.
  - Endpoint: `/api/v1/entities/translations/list?module={code}&language={lang}`
  - Meta: `/api/v1/entities/translations/meta`
  - Create: `POST /api/v1/entities/translations?module={code}`
  - Edit: `PUT /api/v1/entities/translations/{uuid}?module={code}`
  - Delete: `DELETE /api/v1/entities/translations/{uuid}?module={code}`
- Search by key
- Uses `pushNotification` for errors (no direct `toast.*`)
- **Form page deferred** — the user has ideas for the form page, so the
  initial implementation uses inline edit or a standard form. The form page
  will be designed separately.

### 8.7. Remove static JSON files (except fallback)

After the seed migration is verified:
- Delete `src/lib/i18n/messages/en-US.json`, `it-IT.json`, `fr-FR.json`,
  `es-ES.json`, `de-DE.json`, `pt-PT.json` (6 files)
- Keep `src/lib/i18n/messages/en-GB.json` but **convert it to a flat dict**
  (keys are dot-paths, not nested) and **trim it to public-page keys only**
  (see §8.10 below)
- Remove the static imports from `src/lib/i18n/index.ts`
- `flattenDictKeys()` is deleted — `Object.keys($dict)` replaces it

### 8.8. Language switch behavior

When the user switches language via the topbar:
1. `setUiLang(next)` updates `uiLang` store + sessionStorage
2. The `$effect` in `useModuleTranslations` fires (language changed)
3. Loads the new language's translations for the current module
4. All `$t()` calls re-render with the new language

### 8.9. `flattenDictKeys` — deleted (not needed)

The `flattenDictKeys` function was used by config-list ComboSelect to enumerate
available `label_key` values from the nested dict. With the flat dict, the keys
ARE already flat dot-paths — `Object.keys($dict)` replaces `flattenDictKeys()`.
The function is deleted. All call sites use `Object.keys($dict)` directly.

### 8.10. Public pages: loading + fallback

**Public pages** (`/login`, `/welcome`, `/mcp/consent`) need translations
before the user is authenticated. They cannot call the authenticated
`GET /api/v1/modules/{code}/translations/{lang}` endpoint.

**Loading strategy:**

1. Public pages call `fetchPublicTranslations(lang)` →
   `GET /api/v1/translations/public/{lang}` (PUBLIC permission, no auth).
2. The BE reads `public.translations` (AppTranslationEntity) and returns
   the nested JSON dict.
3. The FE merges the dict into the i18n store (same `mergeModuleDict` function).
4. localStorage caching with TTL (same as authenticated modules, key:
   `pb:i18n:app:{lang}`).

**Fallback when BE is unreachable:**

If `fetchPublicTranslations()` fails (BE down, network error), the FE falls
back to a static JSON file containing English-only translations for public-page
keys. The file is a **flat dict** (same shape as the API response):

```
src/lib/i18n/messages/en-GB-fallback.json
```

```json
{
  "app.title": "Primebrick",
  "app.auth.login.title": "Login",
  "app.auth.login.hero.quote1": "...",
  "app.auth.login.username": "Username",
  "app.common.cancel": "Cancel",
  "app.common.validation.required": "This field is required"
}
```

This file contains ONLY the `app.*` keys needed for public pages:
- `app.title`
- `app.nav.*` (navigation — the shell renders around login on some layouts)
- `app.auth.login.*` (hero quotes, form labels, alerts)
- `app.auth.welcome.*` (onboarding flow)
- `app.auth.sessionExpired.*` (session expiry dialog)
- `app.auth.roles.*` (role labels — shown on login if role selection is needed)
- `app.common.*` (common UI labels)
- `app.common.validation.*` (form validation messages)
- `app.common.errors.*` (error messages)
- `app.common.impact.*` (impact levels — used in error notifications)
- `app.mcp.consent.*` (MCP consent page)
- `app.serverUnreachable.*` (BE down messages)
- `app.retry.*` (retry button labels)

**NOT in the fallback file** (these are `system.*`, loaded only when authenticated):
- `system.settings.*` (settings page labels)
- `system.entities.*` (entity labels)
- `system.settings.config.*` (system config labels)

**Why English only:** The fallback is a last resort when the BE is down.
English is the default locale. Non-English users see English on public pages
only when the BE is unreachable — once the BE is back, the next TTL expiry
fetches their preferred language.

**Why keep it as a static file (not DB):** You can't fetch from the DB before
you can authenticate. The fallback exists precisely for when the BE is
unreachable. It's a build-time file, not a runtime source. It's only used
in the error path.

**File maintenance:** The fallback file is generated from `public.translations`
for `en-GB` by a script in `d:\git\primebrick\temp\`. It's regenerated whenever
new public-page keys are added. It's committed to the FE repo (it's a build-time
asset, not a temp file).

**Integration in `useModuleTranslations`:**

```ts
// For public pages:
async function ensurePublicTranslations(lang: UiLang): Promise<void> {
  const cacheKey = `app:${lang}`;
  if (LOADED_MODULES.has(cacheKey)) return;

  const cached = getCachedModuleDict('app', lang);
  if (cached) {
    mergeModuleDict(lang, cached.dict);
    LOADED_MODULES.add(cacheKey);
    return;
  }

  try {
    const dict = await fetchPublicTranslations(lang);
    mergeModuleDict(lang, dict);
    setCachedModuleDict('app', lang, dict);
    LOADED_MODULES.add(cacheKey);
  } catch (e) {
    // Fallback: static en-GB file (English only)
    if (lang !== 'en-GB') {
      // Try en-GB cache first, then static fallback
      const enCached = getCachedModuleDict('app', 'en-GB');
      if (enCached) {
        mergeModuleDict(lang, enCached.dict);
        LOADED_MODULES.add(cacheKey);
        return;
      }
    }
    const { default: fallback } = await import('./messages/en-GB-fallback.json');
    mergeModuleDict(lang, fallback);
    LOADED_MODULES.add(cacheKey);
  }
}
```

**Route detection:** The `useModuleTranslations` composable checks if the
current route is public (login, welcome, mcp/consent) or authenticated (app).
Public routes call `ensurePublicTranslations`, authenticated routes call
`ensureModuleTranslations` with the resolved module code.

---

## 9. Persistence Across App Updates

**Question answered:** DB is sole source of truth.

| Scenario | What happens |
|----------|-------------|
| New app version ships new keys | Seed migration `INSERT ... ON CONFLICT (key, language) DO NOTHING` adds new keys. Existing customizations untouched. |
| New app version changes a default value | The seed migration does NOT update existing rows (ON CONFLICT DO NOTHING). The DB value wins. If the dev wants to force-update a default, they write a separate `UPDATE` migration. |
| New app version removes a key | The key stays in the DB (orphaned). A cleanup migration can `DELETE` it, or it's harmless (never referenced). |
| Admin customizes a translation | The DB row is updated. Survives all app updates (seed migrations never overwrite). |
| New language added | Admin adds rows with the new language code via the edit page. No code change needed (the language just needs to be in `UI_LANGS`). |

---

## 10. Redis Caching Strategy

**Concern:** "huge amount of data to cache"

**Reality:** Current JSON files are ~60KB per language. With all modules, maybe
100-200KB per language total. Redis handles this trivially.

**Strategy:**
- Cache key: `translations:i18n:{schema}:{language}` (e.g. `translations:i18n:public:it-IT`,
  `translations:i18n:system:it-IT`, `translations:i18n:emailsender:it-IT`)
- Value: the flat i18n dict (built by PG's `jsonb_object_agg`)
- TTL: **6 hours** (21_600_000 ms) — translations change rarely (admin edits only).
  Invalidation-on-write handles freshness in the normal case. The TTL is a
  safety net for edge cases (Redis down during write, direct DB edits). 6h
  limits stale data to 6h while reducing DB reads 6x vs a 1h TTL
  (3.5 vs 21 queries/hour for 7 langs × 3 schemas).
- Invalidation: on any write (create/update/delete/restore), `delByPrefix` for that schema
- Cache miss → DB read → rebuild dict → cache set
- Redis down → cache is a no-op (best-effort, system valid without it)
- **Redis down during invalidation:** if `DEL` fails (Redis unavailable), the
  stale key persists until its 6h TTL expires. The DB write succeeds — Redis
  is best-effort, not a transaction participant. The admin sees their own
  change within 5min (FE localStorage expires → re-fetch → misses Redis →
  DB read → fresh). Other users see stale data until either the 6h TTL
  expires or Redis comes back and another user's re-fetch re-populates the
  key (which would set a fresh value). **Accepted as an edge case — no retry
  queue for now.** If this becomes a problem in production, a lightweight
  retry mechanism can be added to the SDK's `CachePort` later.

This is a small number of keys (6 languages × N schemas), each 10-60KB.
No memory bomb risk. The `delByPrefix` uses SCAN (not KEYS) per the SDK's
`RedisCachePort` implementation.

**Why 6h:** Translations are reference data that changes only on admin edits
(maybe weekly). The invalidation-on-write mechanism ensures freshness in the
normal case — the TTL only matters when that mechanism fails (Redis down,
direct DB edit). 6h reduces DB reads to 3.5 queries/hour (7 langs × 3 schemas
× 1 read/6h). The edge-case staleness (6h) is acceptable for data that changes
rarely. The FE localStorage TTL (5min) ensures users still pick up changes
within 5-10min in the normal case (invalidation works → Redis re-populated →
FE re-fetch hits fresh Redis).

---

## 11. FE localStorage Strategy

**Decision:** localStorage (not sessionStorage) for translation dicts.

| Aspect | sessionStorage (current) | localStorage (new) |
|--------|--------------------------|---------------------|
| Persistence | Cleared on tab close | Survives tab close + browser restart |
| Quota | ~5MB | ~5-10MB |
| Use for lang preference | Keep in sessionStorage (UX: reset on new session) | — |
| Use for translation dicts | — | Yes — avoids re-fetching on every session |
| TTL | N/A | 5 minutes (user-facing freshness window) |
| Key format | `pb.lang` | `pb:i18n:{module}:{lang}` |

**Why localStorage for dicts:**
- Translations change infrequently (admin edits)
- Re-fetching 60KB × 6 languages on every tab open is wasteful
- TTL ensures freshness (5 min → re-fetch from API → API hits Redis → fast)
- localStorage quota is sufficient (6 langs × ~60KB = ~360KB, well within 5MB)

**Why 5min for FE localStorage (not 6h like Redis):**
- The FE localStorage TTL is the **user-facing freshness window** — how quickly
  users see admin changes. The FE has no way to receive invalidation events.
- 5min means users see admin changes within 5-10min. 6h would mean users wait
  up to 6h to see a translation change — bad UX, especially for the admin who
  made the edit.
- The cost of 5min FE TTL is one API call every 5min per module per language.
  That call hits Redis (6h TTL), so it's fast — no DB read in the normal case.
- Redis TTL (6h) and FE localStorage TTL (5min) are intentionally different:
  Redis is a shared cache invalidated on write; FE localStorage is per-user
  with no invalidation mechanism, so it needs a shorter TTL.

**Why keep sessionStorage for lang preference:**
- The language preference is a session-level UX choice
- A new browser session should re-detect from `navigator.language`
- If the user explicitly chose a language, it's stored in sessionStorage and
  respected for that session

**Cache invalidation on admin save:**
- Admin saves a translation → BE invalidates Redis (6h TTL key deleted immediately)
- Admin's FE: the next localStorage TTL expiry (5 min) triggers a re-fetch from
  API → API misses Redis (just invalidated) → DB read → fresh data → Redis
  re-populated (6h TTL). OR the admin can manually refresh.
- Other users: their next localStorage TTL expiry (5 min) triggers a re-fetch
  from API → API hits Redis (re-populated by the admin's re-fetch or another
  user's re-fetch) → fresh data. So other users see the change within 5-10 min.
- For immediate propagation, a future enhancement could use the SSE events bus
  to push translation invalidation events to all connected clients.

---

## 12. Impacted Files Summary

### DAL (`primebrick-dal-v3`)
| File | Action |
|------|--------|
| `src/meta/entity-decorators.ts` | **EDIT** — enhance `@Unique` with `(indexName?, orderPriority?)` overloads; add `uniqueIndexName` + `uniqueOrderPriority` to `ColumnRegistration` and `EntityPersistenceMeta` |
| `src/entities/translation-entity-base.ts` | **NEW** — shared entity base class using composite `@Unique("translations_key_language_uidx", 0/1)` |
| `src/index.ts` | **EDIT** — export `TranslationEntityBase` |

### SDK (`primebrick-v3-sdk`)
| File | Action |
|------|--------|
| `src/translations/translations-cache.ts` | **NEW** — Redis cache helpers (schema-keyed, flat dict) |
| `src/translations/translations-service.ts` | **NEW** — framework-agnostic service (takes entity class + queryable, uses jsonb_object_agg) |
| `src/translations/index.ts` | **NEW** — re-exports |
| `src/index.ts` | **EDIT** — export translations module |

### BE (`primebrick-be-v3`)
| File | Action |
|------|--------|
| `src/modules/system/translation_entities.ts` | **NEW** — `AppTranslationEntity` (public), `SystemTranslationEntity` (system), `EmailsenderTranslationEntity` (emailsender) |
| `src/modules/system/translation-registry.ts` | **NEW** — module code → entity class mapping + schema resolution |
| `src/modules/system/translations_dal.ts` | **NEW** — DAL wrapper |
| `src/modules/system/translations.meta.ts` | **NEW** — entity meta |
| `src/modules/system/translations.router.ts` | **NEW** — central CRUD + public read + module-aware read |
| `src/modules/system/index.ts` (or `src/modules/index.ts`) | **EDIT** — mount translations router |
| `src/modules/auth/permissions.ts` | **EDIT** — add `TRANSLATIONS_MANAGE` |
| `db-meta/patches/00000000000000_init_database.sql` | **EDIT** — absorb 5 extra patches into it (§6.6.1, REQUIRES USER APPROVAL) |
| `db-meta/patches/00000000000001_create_api_keys_table.sql` | **DELETE** — after consolidation (§6.6.1) |
| `db-meta/patches/00000000000002_add_service_registry_is_reserved.sql` | **DELETE** — after consolidation (§6.6.1) |
| `db-meta/patches/00000000000003_create_mcp_oauth_clients_table.sql` | **DELETE** — after consolidation (§6.6.1) |
| `db-meta/patches/20260718231731_addcols_role_mappings.sql` | **DELETE** — after consolidation (§6.6.1) |
| `db-meta/patches/20260720172408_add_uuid_role_mappings.sql` | **DELETE** — after consolidation (§6.6.1) |
| `db-meta/patches/00000000000001_create_translations_table.sql` | **NEW** — creates `system` schema + `public.translations` + `system.translations` (§6.6.2) |
| `.devin/rules/patch-sha256-management.md` | **EDIT** — change fire-and-forget location from `db-meta/fire-and-forget/` to `d:\git\primebrick\temp\` (§6.6.3) |

**Fire-and-forget scripts (in `d:\git\primebrick\temp\`, NOT committed to any repo):**

| File | Action |
|------|--------|
| `d:\git\primebrick\temp\update_init_patch_sha256_consolidated.sql` | **NEW** — update SHA256 + delete registry entries for 5 removed patches |
| `d:\git\primebrick\temp\seed_translations.sql` | **NEW** — seed `public.translations` + `system.translations` from 6 JSON files |
| `d:\git\primebrick\temp\generate-translation-seed.mjs` | **NEW** — Node script to generate the seed SQL (applies key reorganization §3, splits `app.*` → public, `system.*` → system) |

### US (`primebrick-us-v3`) — per microservice
| File | Action |
|------|--------|
| `emailsender/db-meta/patches/0003_create_translations_table.sql` | **NEW** — DDL (schema-qualified to `emailsender`) |

**No entity classes, no route handlers, no endpoints in US.** The BE manages
all CRUD for US schemas via its central gateway.

**Fire-and-forget scripts (in `d:\git\primebrick\temp\`):**

| File | Action |
|------|--------|
| `d:\git\primebrick\temp\seed_emailsender_translations.sql` | **NEW** — seed emailsender-specific translations (currently empty) |

### FE (`primebrick-fe-v3`)
| File | Action |
|------|--------|
| `src/lib/i18n/store.svelte.ts` | **EDIT** — add localStorage cache functions |
| `src/lib/i18n/index.ts` | **EDIT** — dynamic merge store, remove static imports (except fallback) |
| `src/lib/i18n/use-module-translations.svelte.ts` | **NEW** — route-aware loader (public + authenticated) |
| `src/lib/api.ts` | **EDIT** — add `fetchPublicTranslations`, `fetchModuleTranslations`, `fetchTranslationModules` |
| `src/routes/(app)/+layout.svelte` | **EDIT** — load "app" translations on mount + route change |
| `src/routes/(app)/system/settings/translations/+page.svelte` | **NEW** — admin edit page with module selector + language selector |
| `src/lib/i18n/messages/en-US.json` | **DELETE** — after seed migration verified |
| `src/lib/i18n/messages/it-IT.json` | **DELETE** — after seed migration verified |
| `src/lib/i18n/messages/fr-FR.json` | **DELETE** — after seed migration verified |
| `src/lib/i18n/messages/es-ES.json` | **DELETE** — after seed migration verified |
| `src/lib/i18n/messages/de-DE.json` | **DELETE** — after seed migration verified |
| `src/lib/i18n/messages/pt-PT.json` | **DELETE** — after seed migration verified |
| `src/lib/i18n/messages/en-GB.json` | **EDIT** — convert to flat dict with `app.*` keys (reorganized), trim to public-page keys only (becomes the fallback file, §8.10) |
| **ALL `.svelte` + `.ts` files with `$t()` calls** | **EDIT** — find-and-replace old key prefixes to new `app.*` / `system.*` keys (see §3 migration table) |

---

## 13. Acceptance Criteria

1. **DB is sole source of truth:** All translations come from the API (except
   the `en-GB.json` fallback for public pages when BE is down). The FE works
   correctly with empty localStorage (fetches from API). The API returns a
   flat dict (keys are dot-paths) built by PG's `jsonb_object_agg` — no
   Node-side post-processing.

2. **Schema = module boundary:** `public.translations` (app module), 
   `system.translations` (system module), `emailsender.translations`
   (emailsender module). The BE accesses all schemas via DAL entity classes.

3. **BE is central CRUD gateway:** US microservices have NO translation
   endpoints. The BE handles all CRUD for all schemas. Verified: no
   `translations-route.ts` in any US microservice.

4. **Per-module lazy loading:** Navigating to `/customers` loads only the
   relevant module's translations. The "app" module translations load on
   app init. Public pages load from `GET /api/v1/translations/public/{lang}`.

5. **Public pages work without auth:** `/login`, `/welcome`, `/mcp/consent`
   render correctly with translations from `GET /api/v1/translations/public/{lang}`
   (PUBLIC permission). If BE is down, they fall back to `en-GB.json`
   (English only, public-page keys only).

6. **localStorage caching with TTL:** Translations are cached in localStorage
   per module per language (5min TTL — user-facing freshness window). On reload
   within 5 minutes, no API call is made. After 5 minutes, the next navigation
   triggers a re-fetch (which hits Redis with a 6h TTL — fast, no DB read).

7. **Runtime editing → visibility:** An admin edits a translation via
   `/system/settings/translations`, saves, and sees the change in the UI within
   5min (FE localStorage TTL). The Redis cache (6h TTL) is invalidated on save
   (verified by checking Redis keys before/after). Other users see the change
   within 5-10min (their localStorage TTL + Redis re-population).

8. **Persistence across app updates:** A new app version with a seed migration
   adds new keys without overwriting existing customizations. Verified by:
   - Customize a translation value
   - Run the seed migration
   - The customized value is preserved (ON CONFLICT DO NOTHING)

9. **DRY shared infrastructure:** The DAL entity base class is defined once.
   The SDK service + cache + i18n builder is defined once. US microservices
   only add a DB patch — no code.

10. **All three layers:** BE's `public.translations` serves app/shell/login/
    welcome/auth/common. `system.translations` serves entity labels. US
    microservices' `{schema}.translations` serve their own translations.
    FE loads from all via the module-aware endpoint (or public endpoint
    for unauthenticated pages).

11. **Module selector admin page:** The admin edit page at
    `/system/settings/translations` has a module selector (app, system,
    emailsender, ...) + language selector + `EntityListTable`. No per-module
    pages. One page manages all modules.

12. **Language switching:** Switching language in the topbar triggers loading
    the new language's translations for the current module. All `$t()` calls
    re-render.

13. **Fallback:** If a translation key is missing from the DB, the key itself
    is displayed (clear signal that a translation needs to be added). No
    silent fallback to a hardcoded string.

14. **Redis down = system valid:** With Redis unavailable, translations still
    load (DB read on every request, slower but functional). No errors thrown.

15. **Key reorganization (§3):** All `$t()` calls use the new `app.*` / `system.*`
    key prefixes. No references to old prefixes (`shell.*`, `login.*`, `welcome.*`,
    `auth.*` standalone, `common.*` standalone, `validation.*`, `errors.*`,
    `roles.*`, `config.*`, `impact.*`, `mcp.*` standalone, `entities.*` standalone)
    remain in the codebase. Verified by grep: `grep -r "\$t('shell\." src/` returns
    zero matches (and same for all other old prefixes). The seed SQL inserts keys
    with the new prefixes only.

16. **Public endpoint payload reduced:** `GET /api/v1/translations/public/{language}`
    returns only `app.*` keys (~408 keys, ~25KB). `system.*` keys are NOT in the
    public endpoint. Verified by checking the response does not contain any
    `system.settings.*` or `system.entities.*` keys.

---

## 14. Migration Sequence

1. **DAL:** Enhance `@Unique` with composite support (§4.3) + add `TranslationEntityBase` (§4.1) → build → publish `@primebrick/dal-pg` patch
2. **SDK:** Add translations module (cache, service — no router, no i18n-builder) → build → publish `@primebrick/sdk` patch
3. **BE patch consolidation (USER CONFIRMED):** Absorb 5 extra patches into `00000000000000_init_database.sql` (§6.6.1) → delete the 5 files → create fire-and-forget SHA256 update + registry cleanup in `d:\git\primebrick\temp\` → apply on live DBs → verify `db:migrate` passes
4. **BE translations:** Bump DAL + SDK deps → add entity classes (app, system, emailsender) + registry + DAL + meta + router + permission → create `00000000000001_create_translations_table.sql` patch (creates `system` schema + both tables) → generate seed SQL in `d:\git\primebrick\temp\` (with key reorganization mapping from §3) → apply seed on live DBs → test
5. **FE key reorganization:** Find-and-replace all `$t()` calls with new key prefixes (§3 mapping table: `login.*` → `app.auth.login.*`, `shell.nav.*` → `app.nav.*`, `common.*` → `app.common.*`, `shell.settings.*` → `system.settings.*`, `config.*` → `system.settings.config.*`, etc.) → verify with `pnpm run check`
6. **FE i18n refactor:** Bump (no new dep) → refactor i18n store (flat dict) → add loader (public + authenticated) + admin page with module selector → convert `en-GB.json` to flat `app.*` fallback → delete other 5 JSON files → test
7. **US:** Add DB patch per microservice (creates `{schema}.translations` table) → test. **No code changes** — no entity classes, no endpoints.
8. **Integration:** BE central CRUD manages all schemas → FE loads from public + module-aware endpoints → end-to-end test

**Each step is independently deployable.** Steps 1-2 are library releases.
Step 3 is the patch consolidation (USER CONFIRMED). Steps 4-7 are
per-repo. Step 8 is the integration verification. Step 5 (FE key
reorganization) is the largest FE change — it's a mechanical find-and-replace
across all `.svelte` and `.ts` files that call `$t()`.

---

## 15. Open Questions for Implementation

1. **~~DAL composite unique constraint~~** — **RESOLVED.** The current `@Unique()`
   takes no args (verified in `src/meta/entity-decorators.ts` lines 236-248).
   The plan (§4.3) extends `@Unique` with optional `(indexName, orderPriority)`
   args — no new decorator. Columns sharing the same `indexName` form a composite
   unique index, ordered by `orderPriority`. Backward compatible with all existing
   `@Unique()` calls.

2. **~~BE proxy for US translations~~** — **RESOLVED.** No proxy needed.
   The BE is the central CRUD gateway. It accesses US schemas (e.g.
   `emailsender.translations`) directly via PostgreSQL cross-schema access
   using DAL entity classes. US microservices have no translation endpoints.

3. **~~US microservice auth for translations read~~** — **RESOLVED.** Not
   needed. US microservices don't serve translation requests. The BE handles
   all reads and writes. The FE only talks to the BE.

4. **~~Seed generation script~~** — **RESOLVED.** The script
   (`generate-translation-seed.mjs`) and its output (`seed_translations.sql`)
   both go in `d:\git\primebrick\temp\` (§6.6.3). Not committed to any repo.

5. **~~`flattenDictKeys` consumers~~** — **RESOLVED.** With the flat dict,
   `flattenDictKeys()` is deleted. All call sites use `Object.keys($dict)`
   directly. The keys are already flat dot-paths.

6. **~~⚠️ BLOCKER — Patch consolidation approval~~** — **RESOLVED (USER CONFIRMED).**
   Empirical verification complete (§6.6.0). All 5 extra patches contain
   actively used schema (verified via code search + live DB query). None are
   errors. Also found: duplicate `mcp_oauth_clients` registry entry + init
   script bug (references `uuid` column not in its own DDL). The consolidation
   absorbs all 5 patches + fixes the bug + cleans up 6 registry entries
   (5 patches + 1 duplicate). **User confirmed: proceed with consolidation.**

7. **~~Key namespace reorganization~~** — **RESOLVED (USER APPROVED).** The old
   12 root namespaces are consolidated into 2: `app.*` (public.translations,
   ~408 leaves) and `system.*` (system.translations, ~774 leaves). Rationale:
   `app` vs `shell` was over-thinking; `common`/`validation`/`errors`/`impact`
   are all app-scope; `login`/`welcome`/`auth`/`roles` are all `app.auth`;
   `mcp` is `app.mcp`; `shell.settings` + `config` are system admin → `system.settings`.
   See §3 for the full mapping table. Public endpoint payload drops ~60%.

8. **SHA256 management rule update (§6.6.3):** The `.devin/rules/patch-sha256-management.md`
   rule currently says fire-and-forget scripts go in `db-meta/fire-and-forget/`.
   The user wants them in `d:\git\primebrick\temp\` instead. This rule file
   needs to be updated as part of the BE changes. Confirm this convention
   change is acceptable (it affects all future patch modifications).

9. **`apiFetch` behavior for public translation calls:** The current `apiFetch`
   handles 401 responses by attempting token refresh or opening the
   session-expired dialog. Public translation calls (`GET /api/v1/translations/public/{lang}`)
   should NOT trigger this behavior — a 401 from a public endpoint is an
   auth configuration error, not an expired session. Options:
   - Add an `auth: 'public' | 'required' | 'optional'` option to `apiFetch`
   - Create a dedicated `publicApiFetch` wrapper
   - Skip 401 handling for URLs matching `/api/v1/translations/public/`
   → Decide during FE implementation (§8.5).

10. **Form page design (deferred):** The user said "wait to make the form page
    because i have some ideas". The initial implementation uses inline edit or
    a standard form. The form page will be designed separately.

11. **US entity class location:** The BE creates entity classes for US schemas
    (e.g. `EmailsenderTranslationEntity`). Should these live in the BE repo
    (`src/modules/system/translation_entities.ts`) or in a dedicated
    `src/modules/translations/` directory? → Decide during BE implementation.
