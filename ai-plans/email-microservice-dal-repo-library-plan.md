# Plan: Shared Type-Driven DAL Repository Library for the Email Microservice (and future microservices)

> Status: DRAFT — awaiting user approval (PROCEED keyword).
> Created: 2026-07-04
> Repositories analyzed (empirically, zero assumptions):
> - `primebrick-be-v3` (git remote: `michaelsogos/primebrick-v3-backend`) — contains the existing `Repository` reference implementation.
> - `primebrick-us-v3/emailsender` (git remote: `michaelsogos/primebrick-v3-microservices`) — the target microservice, currently has NO repository layer.
> - DeepWiki MCP was queried for `michaelsogos/primebrick-v3-microservices` (the backend repo is not indexed on DeepWiki, so BE analysis was done by reading source directly).

---

## 1. Objective

Define a **standard, reusable, type-driven DAL repository library** that any new microservice (starting with `emailsender`) can consume, so that DB access is done purely through the `TEntity` type via decorator/reflection metadata — no hand-written SQL per entity, no DTO layer, snake_case end-to-end.

The library is a **generalization and extension** of the existing `Repository` class that already lives in `primebrick-be-v3/src/db/repository/repository.ts`. The email microservice currently bypasses this entirely and uses raw `pool.query(...)` strings inside `EmailService` (see `emailsender/src/services/email-service.ts` lines 25-89). The goal is to give `emailsender` the same (improved) DAL capability as the backend, packaged as a shared library.

---

## 2. Empirical findings (current state — verified by reading source)

### 2.1 Backend `Repository` class — `primebrick-be-v3/src/db/repository/repository.ts`

Existing public methods (12 total, verified via grep):

| Method | Signature (simplified) | Returns | RETURNING clause | Notes |
|---|---|---|---|---|
| `rawSql` | `(text, values?)` | `TResult[]` | n/a | escape hatch |
| `count` | `(entity)` | `number` | n/a | `COUNT(*)` |
| `insertMany` | `(entity, rows[])` | **`void`** | `RETURNING "pk", uuid` | bulk INSERT; only returns pk+uuid internally for audit |
| `findById` | `(entity, id, options?)` | `TResult \| null` | n/a (SELECT) | has `throwExceptionIfNullOrMany` (default true) + `deletedRecords` |
| `find` | `(entity, fields?, options?)` | `TResult \| null` | n/a (SELECT) | **NO throw option** — silently returns null; has `deletedRecords` |
| `findAll` | `(entity, fields?, options?)` | `TResult[]` | n/a (SELECT) | has `deletedRecords`; no streaming (uses `pool.query`) |
| `findByPage` | `(entity, page, size, fields?, options?)` | `PaginatedEntity<TResult>` | n/a (SELECT) | has `deletedRecords`; window-function total count |
| `delete` | `(entity, uuid, deletedBy)` | **`void`** | `RETURNING "pk", version` | soft delete |
| `restore` | `(entity, uuid, restoredBy)` | **`void`** | `RETURNING "pk", version` | un-soft-delete |
| `clone` | `(entity, sourceUuid, clonedBy)` | `string` (new uuid) | `RETURNING "uuid"` | |
| `update` | `(entity, uuid, updates, updatedBy)` | **`void`** | `RETURNING "pk", version` | increments version |
| `hardDelete` | `(entity, uuid, deletedBy)` | **`void`** | none (DELETE) | physical delete |

### 2.2 Gaps vs. the requested standard (the delta this plan closes)

1. **No `add` (single-row insert returning the persisted entity).** `insertMany` exists but returns `void` and only `RETURNING "pk", uuid` for audit — it does NOT hand back the full persisted row.
2. **No `upsert`.**
3. **No `findByUUID`.** Only `findById` (by numeric/string PK) exists.
4. **`find` has no `throwExceptionIfNullOrMany` option** — only `findById` has it. The user requires it on ALL single-row finders, defaulting to throw, with a silent (`null`) opt-out.
5. **`delete` / `restore` / `update` / `hardDelete` return `void`**, not the persisted/affected entity. The user requires every CRUD op to `RETURNING *` and return the real persisted object typed as `TEntity`.
6. **`insertMany` returns `void`** — bulk insert should return the persisted rows.
7. **`findAll` does not stream** — it buffers the whole result set via `pool.query`. The user wants streaming attempted for large datasets.
8. **`deletedRecords` (EXCLUDED/INCLUDED/ONLY) is present on finders** but the filter is silently skipped when the entity has no `deleted_at` column (`hasDeletedAtColumn` check in `query-builder.ts`). This is correct behavior, but must be preserved.
9. **The Repository is BE-only.** The `emailsender` microservice has its OWN copy of `entity-decorators.ts` (a duplicate of BE's) but NO `repository.ts`, NO `dsl.ts`, NO `query-builder.ts`, NO `types.ts`. It uses raw SQL.

### 2.3 Email microservice — `primebrick-us-v3/emailsender`

- **DB pool**: `emailsender/src/db/pool.ts` — singleton `pg.Pool`, `search_path` set to `DB_SCHEMA` (default `emailsender`).
- **Entities**: `email_config_entity.ts`, `email_template_entity.ts` — both `@Entity`, `@Key() id`, `@Unique() uuid`, `@AuditableField` for created/updated/version. **Neither declares `deleted_at`/`deleted_by`** (they implement `IAuditableEntity` which extends `IDeletableEntity`, but the columns are not decorated, so `deletedRecords` filters will silently no-op for them until the columns are added).
- **Entity metadata system**: `emailsender/src/domain/entities/entity-decorators.ts` is a **duplicate** of BE's `entity-decorators.ts` (same decorators: `@Entity`, `@Key`, `@Unique`, `@Column`, `@IsNotColumn`, `@AuditableField`, `@DeletableField`, `@AuditTrail`, etc.; `WeakMap`-based "reflection" via `reflect-metadata`).
- **Current DB access**: `EmailService.sendEmail` uses hand-written SQL strings (`SELECT * FROM emailsender.email_config WHERE provider = 'brevo'`, `INSERT INTO emailsender.email_templates_communication_log ...`). No repository, no DSL, no query builder.
- **Dependencies**: `pg`, `reflect-metadata`, `handlebars`, `nats`. No `pg-query-stream` yet (needed for streaming `findAll`).
- **Workspace**: `primebrick-workspace/pnpm-workspace.yaml` lists `primebrick-fe-v3`, `primebrick-be-v3`, `primebrick-us-v3` as workspace packages. There is **no shared `packages/` library yet** — this is the natural home for the new DAL library.

### 2.4 Conventions that MUST be preserved (repo rules)

- **snake_case everywhere** (DB column = TS property = JSON field). No DTO renaming. Spread raw DB rows.
- **No fake defaults on read path**. `undefined` if missing, `null` if NULL in DB.
- **No transformation unless real type conversion.**
- **Strict TypeScript**, `async/await` only, no silenced errors.
- **Microservice isolation**: no hardcoded cross-service relative imports. Shared code must live in a dedicated shared package.

---

## 3. Proposed architecture

### 3.1 New shared library: `@primebrick/dal`

**Location**: `primebrick-dal-v3/` — a **new sibling git repository** at `D:\git\primebrick\primebrick-dal-v3\`, sitting alongside `primebrick-be-v3/`, `primebrick-fe-v3/`, and `primebrick-us-v3/`. It is NOT a sub-folder of any existing repo.

Rationale for a dedicated sibling repo:
- The DAL is a **cross-cutting concern** consumed by both the microservices repo and (later) the backend. Nesting it inside `primebrick-us-v3` would couple BE to a US-internal path; nesting it inside `primebrick-be-v3` would force US to import from BE. A sibling repo is the only neutral location.
- It mirrors the existing architecture: BE, FE, US are already independent git repos under `D:\git\primebrick\`. The DAL joins them as a fourth independent repo.
- The `primebrick-workspace/pnpm-workspace.yaml` already lists the three siblings as workspace packages; adding `../primebrick-dal-v3` makes `@primebrick/dal` resolvable via `workspace:*` from any consumer without publishing to a registry.
- Each consumer (US now, BE later) depends on `@primebrick/dal` via pnpm workspace linking — no cross-repo relative imports, no hardcoded paths, full isolation per the `primebrick-us-v3/AGENTS.md` rule.
- The package is published as `@primebrick/dal` so BE can adopt it later without moving files.

**Repo layout** (organized by concern, mirroring BE's `src/` subfolder convention):
```
primebrick-dal-v3/                      # NEW sibling git repo
  .gitignore
  LICENSE                               # MIT — Copyright (c) 2026 Michael Sogos (same as BE/FE/US)
  package.json                          # name: "@primebrick/dal", type: module, license: "MIT", exports map
  tsconfig.json
  README.md                             # short — purpose, exports, usage
  src/
    index.ts                            # public barrel — re-exports from subfolders
    meta/
      entity-meta.ts                    # canonical entity-decorators.ts (decorators + WeakMap reflection)
      column-pg-io.ts                   # pg<->js value coercion, date handling
    query/
      query-builder.ts                  # SQL generation (extended for RETURNING *, streaming-aware)
      dsl.ts                            # Filter / Sort / Join / Project DSL
      streaming.ts                      # pg-query-stream wrapper for findAll
    repository/
      repository.ts                     # the new type-driven Repository (generalized from BE)
    errors/
      errors.ts                         # NotFoundError, MultipleRowsError, etc. (no BE http coupling)
    types/
      types.ts                          # FindOptions, BulkOptions, AuditPort, LoggerPort, etc.
    audit/
      auditable-joins.ts                # optional helper; audit-join concern
      auditable-types.ts                # type helpers
```

**Subfolder rationale** (mirrors BE's `src/{db,domain,http,lib,modules}` convention):
- `meta/` — entity metadata & reflection: decorators + column type coercion. The "what is an entity" layer.
- `query/` — SQL generation: query builder, DSL expressions, streaming. The "how to build SQL" layer.
- `repository/` — the public Repository class that orchestrates meta + query. The "CRUD API" layer.
- `errors/` — DAL-specific error types, decoupled from any HTTP/NATS framework.
- `types/` — shared types & ports (options, AuditPort, LoggerPort) consumed by repository + callers.
- `audit/` — optional auditable-join helpers (display-name joins for IAuditableEntity).

**Key design rule**: the library must NOT import anything from `primebrick-be-v3` or `primebrick-us-v3` (no `http/api-errors`, no `lib/audit/audit-service`, no microservice-specific code). Audit and HTTP error mapping are **consumer-side concerns** injected via options/interfaces. The library defines neutral ports:

```ts
// primebrick-dal-v3/src/types/types.ts (excerpt)
export type AuditPort = {
  writeAudit(entry: AuditEntry): Promise<void>;
};
export type LoggerPort = { error(...args: unknown[]): void; warn(...args: unknown[]): void };
```

### 3.2 The new `Repository` API (type-driven, the standard for any microservice)

All methods derive table name, columns, PK, UUID column, auditable/deletable fields **from the `TEntity` class via the decorator metadata** (`getEntityPersistenceMeta`, `getTableName`, `getColumnName`). The caller never passes a table name.

#### 3.2.1 Write ops — every op returns the persisted entity via `RETURNING *`

```ts
// Single-row insert. TEntity is both the input shape and the return shape.
async add<TEntity extends object>(
  entity: EntityClass,
  data: Partial<Record<keyof TEntity & string, unknown>>,
  options?: { actor?: string; audit?: AuditPort }
): Promise<TEntity>;

// Single-row upsert. Conflict target auto-detected from the @Unique() column (uuid by default).
// ON CONFLICT (uuid) DO UPDATE SET ... RETURNING *.
async upsert<TEntity extends object>(
  entity: EntityClass,
  data: Partial<Record<keyof TEntity & string, unknown>>,
  options?: { conflictTarget?: string; actor?: string; audit?: AuditPort }
): Promise<TEntity>;

// Update by uuid. Returns the full persisted row.
async update<TEntity extends object>(
  entity: EntityClass,
  uuid: string,
  updates: Partial<Record<keyof TEntity & string, unknown>>,
  options?: { actor?: string; audit?: AuditPort }
): Promise<TEntity>;

// Soft delete by uuid. Returns the persisted (now deleted_at-set) row.
async delete<TEntity extends object>(
  entity: EntityClass,
  uuid: string,
  options: { actor: string; audit?: AuditPort }
): Promise<TEntity>;

// Restore soft-deleted row. Returns the persisted row.
async restore<TEntity extends object>(
  entity: EntityClass,
  uuid: string,
  options: { actor: string; audit?: AuditPort }
): Promise<TEntity>;

// Hard delete. Returns the row that was removed (fetched before DELETE).
async hardDelete<TEntity extends object>(
  entity: EntityClass,
  uuid: string,
  options: { actor: string; audit?: AuditPort }
): Promise<TEntity>;

// Drain the underlying pg.Pool. Re-entrant (safe to call multiple times).
// timeoutMs (default 10000) prevents indefinite hang if PG is unreachable at shutdown.
async close(timeoutMs?: number): Promise<void>;
```

**`close()` design rules**:
- The library exposes `close(timeoutMs?)` but **does NOT install `process.on(...)` handlers**. Process lifecycle (signals, crash handlers, Sentry, restart policy) is a consumer-side concern — the library stays side-effect-free for test isolation and layering correctness.
- `close()` is re-entrant: an internal `isClosing` / `closed` guard prevents double `pool.end()`.
- A `Promise.race` against `timeoutMs` prevents indefinite hang if Postgres is unreachable at shutdown time.
- **`SIGKILL` is uncatchable** (kernel-level guarantee) — no handler can cover it. The timeout + re-entrancy guard is the mitigation for the cases we CAN control.

**SQL shape** (all use `RETURNING *` and re-hydrate column aliases to TS property keys, exactly like `query-builder.renderProjection` already does):
- `add`: `INSERT INTO "<table>" (<cols>) VALUES (<$n>) RETURNING *`
- `upsert`: `INSERT ... ON CONFLICT ("<conflictTarget>") DO UPDATE SET <non-conflict, non-key cols> RETURNING *`
- `update`: `UPDATE "<table>" SET <set>, updated_at=$, updated_by=$, version=version+1 WHERE "<uuidCol>"=$ RETURNING *`
- `delete`: `UPDATE "<table>" SET deleted_at=$, deleted_by=$, updated_at=$, updated_by=$, version=version+1 WHERE "<uuidCol>"=$ RETURNING *`
- `restore`: `UPDATE "<table>" SET deleted_at=NULL, deleted_by=NULL, updated_at=$, updated_by=$, version=version+1 WHERE "<uuidCol>"=$ RETURNING *`
- `hardDelete`: `DELETE FROM "<table>" WHERE "<uuidCol>"=$ RETURNING *` (Postgres supports `DELETE ... RETURNING *`)

Auditable auto-fields (`created_at`/`created_by`/`updated_at`/`updated_by`/`version`) are stamped by the library from metadata + `options.actor`, exactly as BE's `clone`/`update` already do, but generalized.

#### 3.2.2 The 5 finder methods

Common options on ALL finders:

```ts
export type WithDeletedRecords = "EXCLUDED" | "INCLUDED" | "ONLY";

export type FinderOptions = {
  deletedRecords?: WithDeletedRecords;        // default "EXCLUDED"
  throwIfNotFound?: boolean;                   // default TRUE for single-row finders
  joins?: JoinExpr[];
  includeAuditableJoins?: boolean;
};

export type SingleRowFinderOptions = FinderOptions & {
  // when throwIfNotFound === false and 0 rows → return null (silent, caller's responsibility)
  // when throwIfNotFound === true (default) and 0 rows → throw NotFoundError
  // when >1 row → always throw MultipleRowsError (regardless of throwIfNotFound)
};
```

```ts
// 1) findById — by @Key() PK
async findById<TEntity extends object, TResult = TEntity>(
  entity: EntityClass,
  id: number | string,
  options?: SingleRowFinderOptions
): Promise<TResult | null>;
// SQL: SELECT <fields> FROM "<table>" WHERE "<pkCol>" = $1 [+ deletedRecords filter] LIMIT 2
// LIMIT 2 so we can detect "many" and throw MultipleRowsError.

// 2) findByUUID — by @Unique() uuid column
async findByUUID<TEntity extends object, TResult = TEntity>(
  entity: EntityClass,
  uuid: string,
  options?: SingleRowFinderOptions
): Promise<TResult | null>;
// SQL: SELECT <fields> FROM "<table>" WHERE "<uuidCol>" = $1 [+ deletedRecords filter] LIMIT 2

// 3) find — "SELECT TOP 1" with optional where/sort/join; no hardcoded PK filter
async find<TEntity extends object, TResult = TEntity>(
  entity: EntityClass,
  fields?: FieldProjector[] | null,
  options?: SingleRowFinderOptions & {
    filters?: FilterExpr[];
    sorting?: SortingExpr[];
  }
): Promise<TResult | null>;
// SQL: SELECT <fields> FROM "<table>" [JOIN ...] [WHERE ... (+ deletedRecords)] ORDER BY ... LIMIT 2
// With NO filters/sorting this is literally "SELECT TOP 1 <fields> FROM <table>" (deletedRecords=EXCLUDED).
// throwIfNotFound default TRUE → throws NotFoundError when 0 rows; FALSE → returns null silently.

// 4) findByPage — paginated, projection-aware
async findByPage<TEntity extends object, TResult = TEntity>(
  entity: EntityClass,
  page: number,
  recordsPerPage: number,
  fields?: FieldProjector[] | null,
  options?: FinderOptions & {
    filters?: FilterExpr[];
    sorting?: SortingExpr[];
  }
): Promise<PaginatedEntity<TResult>>;
// TEntity → identifies the FROM table; TResult → the projected row shape (dev's responsibility to match `fields`).
// LIMIT/OFFSET enforced (page>=1, recordsPerPage>=1). Window-function total count preserved from BE.

// 5) findAll — like findByPage WITHOUT LIMIT/OFFSET; streaming-capable
async findAll<TEntity extends object, TResult = TEntity>(
  entity: EntityClass,
  fields?: FieldProjector[] | null,
  options?: FinderOptions & {
    filters?: FilterExpr[];
    sorting?: SortingExpr[];
    stream?: boolean;                          // default false; when true → returns AsyncIterable
  }
): Promise<TResult[]>;
// When stream=true, use pg-query-stream and return... (see 3.3)
```

**`deletedRecords` semantics** (preserved from BE `query-builder.renderWhere`):
- `EXCLUDED` (default): `WHERE "<table>"."deleted_at" IS NULL` (only live rows)
- `INCLUDED`: no filter (live + deleted)
- `ONLY`: `WHERE "<table>"."deleted_at" IS NOT NULL` (only deleted)
- Silently no-op when the entity has no `deleted_at` column (existing `hasDeletedAtColumn` behavior — preserve it).

#### 3.2.3 Bulk actions — TEMP TABLE strategy (fast, safe, SQL-injection-proof)

`updateMany` and `upsertMany` use a **TEMP TABLE + stream-load + single set-operation** pattern. This is the fastest and safest PostgreSQL bulk strategy:

1. **SQL-injection safe** — all values are parameterized; identifiers are quoted via `quoteIdent`.
2. **Minimal round-trips** — 1 round-trip for temp table creation + N batched INSERTs (or 1 COPY) for data load + 1 round-trip for the final UPDATE/UPSERT FROM temp table.
3. **PG server-side efficiency** — the UPDATE/UPSERT is a single set operation; PG optimizes the join between temp table and target table.
4. **Atomic** — the entire operation runs in a single transaction; temp table is `ON COMMIT DROP`.
5. **Scales to millions of rows** — the temp table load is batched (default 1000 rows per INSERT batch, configurable); the final UPDATE/UPSERT is a single statement.

**`updateMany` — TEMP TABLE + UPDATE FROM:**

```ts
async updateMany<TEntity extends object>(
  entity: EntityClass,
  updates: Array<{ uuid: string } & Partial<Record<keyof TEntity & string, unknown>>>,
  options: { actor: string; audit?: AuditPort; batchSize?: number }
): Promise<TEntity[]>;
```

SQL flow (all inside a single transaction):
```sql
BEGIN;

-- 1. Create temp table mirroring the update columns + uuid join key
CREATE TEMP TABLE tmp_update (
  uuid        UUID,
  col1        TYPE1,
  col2        TYPE2,
  ...
) ON COMMIT DROP;

-- 2. Stream-load data in batches (default 1000 rows per INSERT)
-- Batch 1:
INSERT INTO tmp_update (uuid, col1, col2, ...) VALUES ($1, $2, ...), ($n, $n+1, ...), ...;
-- Batch 2:
INSERT INTO tmp_update (uuid, col1, col2, ...) VALUES (...);
-- ... until all rows are loaded

-- 3. Single UPDATE FROM temp table — set-operation, PG-optimized join
UPDATE "target_table" t
SET
  col1 = tmp.col1,
  col2 = tmp.col2,
  ...,
  updated_at = now(),
  updated_by = $actor,
  version = t.version + 1
FROM tmp_update tmp
WHERE t."uuid" = tmp.uuid
RETURNING *;

COMMIT;  -- temp table auto-dropped here
```

**`upsertMany` — TEMP TABLE + INSERT SELECT ON CONFLICT (audit-aware):**

```ts
async upsertMany<TEntity extends object>(
  entity: EntityClass,
  rows: Array<Partial<Record<keyof TEntity & string, unknown>>>,
  options?: { conflictTarget?: string; actor?: string; audit?: AuditPort; batchSize?: number }
): Promise<TEntity[]>;
```

SQL flow (all inside a single transaction):
```sql
BEGIN;

-- 1. Create temp table mirroring all insertable columns
CREATE TEMP TABLE tmp_upsert (
  uuid        UUID,
  col1        TYPE1,
  col2        TYPE2,
  ...
) ON COMMIT DROP;

-- 2. Stream-load data in batches (same as updateMany)
INSERT INTO tmp_upsert (uuid, col1, col2, ...) VALUES (...), (...), ...;
-- ... batches

-- 3. Single INSERT ... SELECT ... ON CONFLICT — audit-aware
--    INSERT path: stamps created_at, created_by, version=1
--    CONFLICT (UPDATE) path: stamps updated_at, updated_by, version=existing+1
--    created_at/created_by are NOT touched on conflict (preserved from original insert)
INSERT INTO "target_table" (uuid, col1, col2, ..., created_at, created_by, updated_at, updated_by, version)
SELECT
  tmp.uuid, tmp.col1, tmp.col2, ...,
  now(), $actor,    -- created_at, created_by (only used on INSERT path)
  now(), $actor,    -- updated_at, updated_by
  1                 -- version (only used on INSERT path)
FROM tmp_upsert tmp
ON CONFLICT ("uuid") DO UPDATE SET
  col1 = EXCLUDED.col1,
  col2 = EXCLUDED.col2,
  ...,
  -- created_at, created_by NOT in SET clause → preserved from original
  updated_at = now(),
  updated_by = $actor,
  version = "target_table".version + 1
RETURNING *;

COMMIT;  -- temp table auto-dropped here
```

**Why this is audit-smart**: the `ON CONFLICT DO UPDATE SET` clause only includes columns that should change on conflict. `created_at` and `created_by` are NOT in the SET clause, so PG preserves the original values. `updated_at`, `updated_by`, and `version` ARE in the SET clause, so they're stamped on conflict. On the INSERT path (no conflict), all audit fields are set from the SELECT. One statement, two behaviors, zero ambiguity.

**`addMany` — direct bulk INSERT (no temp table needed):**

```ts
async addMany<TEntity extends object>(
  entity: EntityClass,
  rows: Array<Partial<Record<keyof TEntity & string, unknown>>>,
  options?: { actor?: string; audit?: AuditPort; batchSize?: number }
): Promise<TEntity[]>;
```

For pure inserts (no conflict resolution), a temp table is unnecessary — batched `INSERT ... VALUES (...), (...), ... RETURNING *` is optimal. The batching (default 1000 rows per INSERT) keeps the parameter count under PG's 65535 limit. Results from all batches are concatenated and returned.

**`deleteMany` — bulk soft delete via ANY():**

```ts
async deleteMany<TEntity extends object>(
  entity: EntityClass,
  uuids: string[],
  options: { actor: string; audit?: AuditPort }
): Promise<TEntity[]>;
```
```sql
UPDATE "target_table"
SET deleted_at = now(), deleted_by = $actor, updated_at = now(), updated_by = $actor, version = version + 1
WHERE "uuid" = ANY($1::uuid[])
RETURNING *;
```

**Batch size configuration**: `options.batchSize` defaults to 1000. The caller can increase it for wide tables (fewer columns → more rows per batch within the 65535 parameter limit) or decrease it for very wide tables (many columns → fewer rows per batch). The library calculates the safe batch size automatically if not specified: `Math.floor(65535 / columnCount)`.

### 3.3 Streaming `findAll`

Add dependency `pg-query-stream` to `@primebrick/dal`. When `options.stream === true`, `findAll` returns an `AsyncIterable<TResult>` instead of `TResult[]`:

```ts
export type FindAllResult<TEntity, TResult> =
  | TResult[]
  | AsyncIterable<TResult>;
```

Implementation: `new QueryStream(text, values)`, iterate `pool.connect()` → `client.query(stream)` → yield mapped rows. The non-stream path keeps the existing `pool.query` buffer behavior. **Guardrail**: streaming requires a dedicated client (`pool.connect()`); the library must release the client in a `finally` block and surface query errors through the async iterator.

### 3.4 Implementation notes (no assumptions — derived from BE source)

- **Identifier quoting**: reuse `quoteIdent` + `assertValidIdentPart` from `query-builder.ts` to prevent SQL injection via identifiers.
- **Projection / column aliasing**: reuse `renderProjection` — it aliases every column to the TS property key, so `RETURNING *` rows hydrate directly into `TEntity`-shaped objects (snake_case preserved, no DTO). The write ops must use the SAME aliasing on their `RETURNING *` projection (currently BE write ops return raw column names — this is a bug for type-mapping and will be fixed in the library).
- **Auditable stamping**: generalize the `AuditableFieldType` switch already in `clone()` — stamp `created_at`/`created_by` on insert, `updated_at`/`updated_by` + `version=version+1` on update/delete/restore. `actor` comes from `options.actor` (no hardcoded "system").
- **Audit writing**: BE calls `this.auditService.writeAudit(...)` with `.catch(console.error)`. The library replaces this with the injected `AuditPort` (optional). If no `AuditPort` is injected, audit is silently skipped (microservices that don't need audit aren't forced to implement it). The fire-and-forget `.catch` pattern is replaced by routing to the injected `LoggerPort`.
- **`updateMany` / `upsertMany` strategy — TEMP TABLE pattern (DECIDED)**: both use `CREATE TEMP TABLE ... ON COMMIT DROP` → batched INSERT into temp table → single `UPDATE FROM` / `INSERT SELECT ON CONFLICT` → `COMMIT`. This is SQL-injection safe (all parameterized), atomic (single transaction), and scales to millions of rows. The temp table is auto-dropped on commit. Batch size auto-calculated as `Math.floor(65535 / columnCount)` to stay under PG's parameter limit. See §3.2.3 for full SQL.
- **No HTTP coupling**: `NotFoundError` / `MultipleRowsError` live in `primebrick-dal-v3/src/errors/errors.ts` and extend `Error` with stable `code` fields. The BE can keep its own `http/api-errors` mapping; the microservice maps DAL errors to NATS/HTTP responses at its boundary.
- **No process-level side effects**: the library MUST NOT install `process.on("SIGTERM", ...)`, `process.on("uncaughtException", ...)`, or any other global process handlers. `process` is a singleton — a library installing handlers silently co-owns the consumer's crash policy (racing with Sentry/logging in undefined order) and breaks test isolation (every test that constructs a DAL pollutes the process signal table). The library exposes only `close(timeoutMs?)`; the consumer wires signals + crash handlers so it can close ALL long-lived resources (DAL pool, NATS, HTTP server) together. See the integration plan (`us-emailsender-dal-integration-plan.md` §3.2) for the consumer-side shutdown pattern.

### 3.5 Email microservice integration — DEFERRED (Phase 2)

> **⚠️ REMINDER FOR THE USER**: This section is **deferred to a later phase**. The current plan (Phase 1) focuses ONLY on creating the `@primebrick/dal` library itself + its AI documentation. The emailsender integration described below is **NOT executed in this plan** — it will be a separate follow-up plan. **Remind the user about this after Phase 1 is complete.**

When `@primebrick/dal` exists and Phase 1 is done, the emailsender integration (Phase 2) will involve:

1. `primebrick-workspace/pnpm-workspace.yaml` adds `"../primebrick-dal-v3"` to the `packages` list so `@primebrick/dal` is resolvable as `workspace:*` from all consumers.
2. `emailsender/package.json` adds `"@primebrick/dal": "workspace:*"` and `pg-query-stream` (transitive via dal).
3. `emailsender/src/db/pool.ts` stays (it owns the schema-aware pool).
4. `emailsender/src/domain/entities/entity-decorators.ts`, `entity-meta.ts`, `column-pg-io.ts` are **deleted** from the microservice and re-exported from `@primebrick/dal`. The entity files (`email_config_entity.ts`, `email_template_entity.ts`) change only their import paths.
5. A thin `emailsender/src/db/repository.ts` instantiates `new Repository(getPool())` (no audit port initially — email sender has no audit trail table). The consumer calls `repository.close(timeoutMs?)` from its own `SIGTERM`/`SIGINT`/`SIGHUP` + crash handlers in `index.ts` — the library does NOT install process handlers (see §3.4).
6. `EmailService.sendEmail` is rewritten to use `repo.find(EmailConfigEntity, null, { filters: [Filter.fieldValue(field(EmailConfigEntity, "provider"), "=", "brevo")] })` and `repo.find(EmailTemplateEntity, null, { filters: [...] })` instead of raw SQL. The communication-log INSERT becomes `repo.add(EmailTemplateCommunicationLogEntity, {...})` — which requires a **new entity** `EmailTemplateCommunicationLogEntity` to be added (currently the table exists in SQL but has no `@Entity` class; this is a prerequisite task).
7. **`deleted_at`/`deleted_by` columns**: the email entities currently do NOT declare them. To make `deletedRecords` actually filter, either (a) add `@DeletableField` columns to `EmailConfigEntity`/`EmailTemplateEntity` + a DB patch, or (b) accept that `deletedRecords` silently no-ops for these tables (the library behavior is correct either way). Decision deferred to user.

### 3.6 AI documentation & agent ergonomics

The DAL repo ships with **AI-first documentation** so any future agent (Devin, Claude, Cursor, etc.) can understand and use the library correctly without reading all the source. This mirrors the convention already established in `primebrick-be-v3` (`docs/ai/`, `docs/skills/`, `.devin/`, `AGENTS.md`).

#### 3.6.1 Files to create

```
primebrick-dal-v3/
  AGENTS.md                                    # project facts, commands, conventions (entry point for agents)
  CLAUDE.md                                    # short pointer → AGENTS.md (compat with Claude Code)
  docs/
    gitflow.md                                 # GitFlow rules — adapted from BE docs/gitflow.md (NEVER commit auto, branch rules, version tagging)
    ai/
      README.md                                # index of AI docs (mirrors BE docs/ai/README.md)
      SKILLS.md                                # skill selection table (checkboxes)
      WORKFLOWS.md                             # plan → implement → verify workflow for DAL changes
      dal-usage-guide.md                       # complete "how to use the Repository" with code examples per method
      dal-entity-authoring.md                  # how to define a new @Entity (decorators, conventions, snake_case, audit fields)
      dal-architecture.md                      # internal architecture: meta → query → repository layers, data flow
    skills/
      dal-crud-recipe.md                       # recipe: "I need to do CRUD on entity X" → step-by-step
      dal-streaming-recipe.md                  # recipe: "I need to stream a large result set" → step-by-step
  .devin/
    rules/
      always-check-rules-first.md              # same as BE/US — check rules before any action
      workflow.md                              # Tic-Toc planning rule (same as BE/US)
      code-guardrails.md                        # max 2 self-correction attempts, halt on failure
      file-operations.md                       # empirical verification, no editor-context reliance
      temp-files.md                            # temp files in d:\git\primebrick\temp\, never in repo
      data-model-conventions.md                # snake_case, no DTO, no fake defaults (same as BE/US)
      dal-conventions.md                       # DAL-specific rules (snake_case, no DTO, RETURNING *, throwIfNotFound default)
      dal-entity-rules.md                      # entity authoring rules (decorators required, IAuditableEntity, IDeletableEntity)
    skills/
      feature/
        SKILL.md                               # same feature skill as BE/US
      dal-usage/
        SKILL.md                               # invokable Devin skill: "use the DAL for DB access"
```

#### 3.6.2 Content highlights (what each AI doc covers)

**`AGENTS.md`** (root, ~80 lines):
- Repo overview: what `@primebrick/dal` is, who consumes it (US now, BE later).
- Commands: `pnpm install`, `pnpm run build`, `tsc --noEmit`.
- Conventions summary: snake_case everywhere, no DTO, RETURNING * on all writes, throwIfNotFound default true, deletedRecords default EXCLUDED.
- Pointers: "Start here → read `docs/ai/README.md` → `docs/ai/dal-usage-guide.md`".
- Critical rule: "NEVER import from `primebrick-be-v3` or `primebrick-us-v3` inside this repo. The DAL is a leaf dependency."

**`docs/ai/dal-usage-guide.md`** (the main guide, ~300 lines):
For each of the 5 finders + 6 write ops + 4 bulk ops, provide:
- Signature
- One minimal example (using a hypothetical `UserEntity`)
- One realistic example (using `EmailConfigEntity` or `CustomerEntity`)
- What it returns
- When it throws vs returns null
- Common pitfalls (e.g. "forgetting `deletedRecords: 'INCLUDED'` when you want soft-deleted rows")

Example excerpt:
```markdown
## add<TEntity>(entity, data, options?)

Inserts a single row and returns the full persisted entity via RETURNING *.

### Example
\`\`\`ts
const created = await repo.add(EmailConfigEntity, {
  provider: "brevo",
  api_key: "xkey",
  from_email: "no-reply@primebrick.com",
}, { actor: "system" });
// created.id, created.uuid, created.created_at, created.version — all populated by DB
\`\`\`

### Returns
`TEntity` — the full persisted row, snake_case keys matching DB columns.

### Throws
- `ValidationError` if `data` contains a property not in the entity metadata.
- Postgres errors (unique violation, not-null violation) propagate as-is.
```

**`docs/ai/dal-entity-authoring.md`** (~150 lines):
- How to define a new entity: `@Entity`, `@Key`, `@Unique`, `@Column`, `@AuditableField`, `@DeletableField`.
- Convention: TS property name = DB column name = snake_case.
- When to implement `IAuditableEntity` vs `IDeletableEntity`.
- The `!` TS gotcha: fields declared with `!` don't exist at runtime — need an initializer or decorator-driven discovery.
- Example: full `EmailTemplateEntity` annotated with comments explaining each decorator.

**`docs/ai/dal-architecture.md`** (~200 lines):
- Layer diagram (text-based): `Entity class (decorated) → meta/ (reflection) → query/ (SQL gen) → repository/ (CRUD API) → caller`.
- Data flow for a `findById` call: how metadata is read, how SQL is built, how rows are hydrated.
- Where to extend: "adding a new finder" / "adding a new write op" / "adding a new DSL operator".

**`.devin/skills/dal-usage/SKILL.md`** (invokable Devin skill):
```yaml
---
name: dal-usage
description: Use the @primebrick/dal Repository for type-driven DB access (CRUD, finders, bulk, streaming). Invoke when the task involves database operations on Primebrick entities.
allowed-tools: [read, grep, glob]
---
1. Read docs/ai/dal-usage-guide.md for the method signature and examples
2. Read docs/ai/dal-entity-authoring.md if a new entity is needed
3. Identify the TEntity class and its table (via @Entity metadata)
4. Choose the right method: findById/findByUUID/find/findByPage/findAll for reads; add/upsert/update/delete/restore/hardDelete for writes; addMany/upsertMany/deleteMany/updateMany for bulk
5. Respect conventions: snake_case, deletedRecords default EXCLUDED, throwIfNotFound default true
6. For large result sets, use findAll with stream: true
7. Never write raw SQL — always go through the Repository
```

**`.devin/rules/dal-conventions.md`** (always-on rule for agents working in the DAL repo):
- snake_case everywhere (DB = TS = JSON).
- No DTO layer between DB rows and TS models.
- All write ops must RETURNING * and return the persisted entity.
- All single-row finders default to throwIfNotFound: true.
- deletedRecords default EXCLUDED; silently no-op if entity has no deleted_at.
- Never import from BE or US — DAL is a leaf.

#### 3.6.3 MCP server — NOT recommended for this phase

An MCP server wrapping the DAL was considered. **Verdict: does not make sense now.** Rationale:
- The DAL is a **TypeScript library imported at compile time** into consumer code (BE, US microservices). It runs in-process, sharing the consumer's `pg.Pool`.
- An MCP server would require running the DAL as a **separate process with its own DB connection** — adding latency, a new failure point, and a security boundary (the MCP would need DB credentials).
- MCP is the right pattern for **external services** (GitHub, Linear, Slack) or **standalone tools** (Playwright, Postgres inspector). It is the wrong pattern for an in-process data-access library.
- If, in the future, the DAL is exposed as a **data service** (e.g. a REST/RPC API for cross-service queries), an MCP wrapper would make sense. That is a separate, future decision.

**What makes sense instead**: the AI docs + Devin skill above. An agent working in a consumer repo (US/BE) reads `docs/ai/dal-usage-guide.md` (via the skill or directly) and writes TypeScript code that imports `@primebrick/dal`. No MCP needed.

### 3.7 Integration test suite (real DB, no mocks)

The DAL ships with an **exhaustive integration test suite** that runs against a **real PostgreSQL instance** — no mocks, no in-memory fake. This is the only way to verify that SQL generation, `RETURNING *` hydration, soft-delete filtering, audit stamping, and streaming actually work end-to-end.

#### 3.7.1 Test runner: Vitest

**Vitest** is chosen for:
- Native ESM + first-class TypeScript (runs `.ts` directly via esbuild — no `ts-jest`/babel).
- Jest-compatible API (`describe`/`it`/`expect`) — familiar, low learning curve.
- `globalSetup`/`globalTeardown` hooks for one-time DB creation + pool teardown.
- `beforeAll`/`afterEach` hooks for per-file table setup + per-test cleanup.
- Watch mode for iterative dev (`pnpm test:watch`).
- Works seamlessly with pnpm workspaces.

Dev dependency: `vitest` (+ `@vitest/expect` for extended matchers if needed).

#### 3.7.2 Test DB config — persisted, not hardcoded

Connection config lives in **`primebrick-dal-v3/test/.env.test`** (gitignored — see `.gitignore` entry):

```bash
# test/.env.test  (gitignored — copy from .env.test.example)
TEST_PG_HOST=localhost
TEST_PG_PORT=5432
TEST_PG_USER=primebrick_test
TEST_PG_PASSWORD=primebrick_test
TEST_PG_ADMIN_DB=postgres          # admin DB for CREATE DATABASE
TEST_PG_TEST_DB=primebrick_dal_test # the DB that tests run against
```

A companion **`test/.env.test.example`** (committed) documents the variables without secrets. The test config loader reads these via `dotenv`:

```ts
// test/config.ts
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, ".env.test") });

export const testConfig = {
  host: process.env.TEST_PG_HOST ?? "localhost",
  port: Number(process.env.TEST_PG_PORT ?? 5432),
  user: process.env.TEST_PG_USER ?? "primebrick_test",
  password: process.env.TEST_PG_PASSWORD ?? "primebrick_test",
  adminDb: process.env.TEST_PG_ADMIN_DB ?? "postgres",
  testDb: process.env.TEST_PG_TEST_DB ?? "primebrick_dal_test",
};
```

#### 3.7.3 Pre-script: idempotent DB + schema + table creation + seeding

A **`test/setup/db-bootstrap.ts`** script runs in Vitest's `globalSetup` (once before all test files). It is **fully idempotent** — re-running it is a no-op if everything already exists.

**Step 1 — Create the test DB if it doesn't exist:**
```ts
// Connect to the admin DB (e.g. "postgres"), check pg_database, CREATE DATABASE IF NOT EXISTS equivalent.
async function ensureDatabase() {
  const adminPool = new Pool({ ...testConfig, database: testConfig.adminDb });
  const res = await adminPool.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [testConfig.testDb]
  );
  if (res.rowCount === 0) {
    await adminPool.query(`CREATE DATABASE ${quoteIdent(testConfig.testDb)}`);
  }
  await adminPool.end();
}
```

**Step 2 — Create schema + tables (idempotent):**
```sql
-- test/setup/schema.sql (run via pool.query in bootstrap)
CREATE TABLE IF NOT EXISTS test_customers (
  pk          BIGSERIAL PRIMARY KEY,
  uuid        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(200) NOT NULL,
  email       VARCHAR(200),
  status      VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  VARCHAR(100),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  VARCHAR(100),
  version     INTEGER NOT NULL DEFAULT 1,
  deleted_at  TIMESTAMPTZ,
  deleted_by  VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS test_audit_entities (
  pk          BIGSERIAL PRIMARY KEY,
  uuid        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  title       VARCHAR(200) NOT NULL,
  -- ... same audit + delete columns ...
);

-- Add more test tables as needed for edge cases (no-deleted-at entity, no-audit entity, etc.)
CREATE TABLE IF NOT EXISTS test_simple_entities (
  pk    BIGSERIAL PRIMARY KEY,
  uuid  UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  label VARCHAR(100) NOT NULL
  -- NO audit columns, NO deleted_at — tests the no-op behavior
);
```

**Step 3 — Seed data (idempotent via ON CONFLICT DO NOTHING):**
```sql
-- test/setup/seed.sql
INSERT INTO test_customers (uuid, code, name, email, status, created_by)
VALUES
  ('a1111111-1111-1111-1111-111111111111', 'CUST001', 'Acme Corp', 'info@acme.com', 'active', 'seed'),
  ('a2222222-2222-2222-2222-222222222222', 'CUST002', 'Globex Inc', 'contact@globex.com', 'active', 'seed'),
  ('a3333333-3333-3333-3333-333333333333', 'CUST003', 'Initech', null, 'inactive', 'seed')
ON CONFLICT (uuid) DO NOTHING;
```

**Step 4 — Return the pool** (Vitest `globalSetup` can return a teardown function):
```ts
// test/setup/global-setup.ts
export async function setup() {
  await ensureDatabase();
  await ensureSchema();   // runs schema.sql
  await ensureSeed();     // runs seed.sql
  // No pool returned here — each test file creates its own pool in beforeAll.
  return async () => {
    // globalTeardown: nothing to do — DB is left as-is (idempotent).
    // The per-file pools are closed in their own afterAll.
  };
}
```

#### 3.7.4 Test entities

Dedicated test entities defined in `test/entities/` — NOT the emailsender or BE entities. These are self-contained and exercise every decorator path:

```ts
// test/entities/test-customer.entity.ts
import { Entity, Column, Key, Unique, AuditableField, DeletableField } from "@primebrick/dal";

@Entity("test_customers")
export class TestCustomerEntity {
  @Key() @Column() pk!: number;
  @Unique() @Column() uuid!: string;
  @Unique() @Column() code!: string;
  @Column() name!: string;
  @Column() email?: string;
  @Column() status!: string;
  @AuditableField("created") @Column() created_at!: Date;
  @AuditableField("created") @Column() created_by?: string;
  @AuditableField("updated") @Column() updated_at!: Date;
  @AuditableField("updated") @Column() updated_by?: string;
  @AuditableField("version") @Column() version!: number;
  @DeletableField() @Column() deleted_at?: Date;
  @DeletableField() @Column() deleted_by?: string;
}

// test/entities/test-simple.entity.ts — NO audit, NO deleted_at
@Entity("test_simple_entities")
export class TestSimpleEntity {
  @Key() @Column() pk!: number;
  @Unique() @Column() uuid!: string;
  @Column() label!: string;
}
```

#### 3.7.5 Test file structure — exhaustive coverage

```
test/
  .env.test.example              # committed template
  .env.test                      # gitignored — real credentials
  config.ts                      # loads .env.test
  vitest.config.ts               # Vitest config with globalSetup
  setup/
    global-setup.ts              # ensureDatabase + ensureSchema + ensureSeed
    schema.sql                   # idempotent DDL
    seed.sql                     # idempotent seed data
    helpers.ts                   # getTestPool(), cleanup helpers, known UUIDs
  entities/
    test-customer.entity.ts      # full audit + deletable entity
    test-simple.entity.ts        # minimal entity (no audit, no soft-delete)
  write-ops/
    add.test.ts                  # insert single, return hydrated, audit stamping, snake_case
    upsert.test.ts               # insert + on-conflict update, conflict target
    update.test.ts               # update by uuid, version++, updated_at/by, not-found throws
    delete.test.ts               # soft delete, deleted_at/by set, version++, return row
    restore.test.ts              # restore, cleared fields, return row
    hardDelete.test.ts           # physical delete, return pre-delete row, gone after
  finders/
    findById.test.ts             # by PK, throwExceptionIfNullOrMany, deletedRecords filtering
    findByUUID.test.ts           # by uuid, throwIfNotFound, deletedRecords
    find.test.ts                 # filters, joins, sort, single result, throwIfNotFound
    findAll.test.ts              # multiple results, filters, sort, stream mode (for await)
    findByPage.test.ts           # pagination, total_records, page boundaries, empty page
  bulk/
    addMany.test.ts              # bulk insert, return array of hydrated, audit
    upsertMany.test.ts           # bulk upsert, conflict handling
    deleteMany.test.ts           # bulk soft delete
    updateMany.test.ts           # bulk update (strategy per open question 5)
  edge-cases/
    no-deleted-at.test.ts        # deletedRecords silently no-ops on TestSimpleEntity
    no-audit-fields.test.ts      # audit stamping no-ops when entity has no audit columns
    snake-case.test.ts           # all returned keys are snake_case, no camelCase leakage
    sql-injection-ids.test.ts    # quoteIdent / assertValidIdentPart prevents injection via table/column names
    concurrent-writes.test.ts    # two parallel adds on same unique → one succeeds, one throws
```

#### 3.7.6 Test isolation strategy — idempotent, no transaction rollback

The user explicitly wants: **leave the DB as-is after tests, idempotent re-runs**. Therefore:
- **No transaction-rollback-per-test** (that would hide commit/audit behavior).
- **Seeds** use fixed UUIDs + `ON CONFLICT DO NOTHING` → re-running never duplicates.
- **Write tests** generate unique UUIDs per run (`crypto.randomUUID()`) and **hardDelete their rows in `afterEach`** → table returns to seed state.
- **Soft-delete/restore tests** use seed rows, soft-delete + restore in the test → reversible, no cleanup needed.
- **After all tests**: each test file's `afterAll` closes its pool. The DB remains with seeds + schema. Re-running `pnpm test` is a no-op for setup and clean for test data.

#### 3.7.7 Running the tests

```bash
# One-time: copy the env template and fill in your Postgres credentials
cp test/.env.test.example test/.env.test
# Edit test/.env.test with your host/port/user/password

# Run all tests (globalSetup creates DB + schema + seeds, then tests run)
pnpm test

# Watch mode for iterative dev
pnpm test:watch

# Run a single test file
pnpm test -- test/write-ops/add.test.ts
```

`package.json` scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

#### 3.7.8 Example test file (add.test.ts — exhaustive)

```ts
// test/write-ops/add.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Pool } from "pg";
import { Repository, NotFoundError } from "@primebrick/dal";
import { testConfig } from "../config";
import { TestCustomerEntity, TestSimpleEntity } from "../entities";
import { knownSeedUuids } from "../setup/helpers";

let pool: Pool;
let repo: Repository;

beforeAll(async () => {
  pool = new Pool({ ...testConfig, database: testConfig.testDb });
  repo = new Repository(pool);
});

afterAll(async () => { await pool.end(); });

describe("repo.add — single row insert", () => {
  const createdUuids: string[] = [];

  afterEach(async () => {
    // Clean up test-created rows (hard delete, not soft delete — leaves no trace)
    for (const uuid of createdUuids) {
      try { await repo.hardDelete(TestCustomerEntity, uuid, { actor: "test" }); } catch {}
    }
    createdUuids.length = 0;
  });

  it("inserts a row and returns the full hydrated entity", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "TEST_ADD_001",
      name: "Test Company",
      email: "test@test.com",
      status: "active",
    }, { actor: "test-user" });

    expect(created).toBeDefined();
    expect(created.pk).toBeTypeOf("number");        // DB-generated
    expect(created.uuid).toBeTypeOf("string");      // DB-generated
    expect(created.code).toBe("TEST_ADD_001");
    expect(created.name).toBe("Test Company");
    expect(created.email).toBe("test@test.com");
    expect(created.status).toBe("active");
    expect(created.version).toBe(1);                // audit stamping
    expect(created.created_by).toBe("test-user");
    expect(created.updated_by).toBe("test-user");
    expect(created.created_at).toBeInstanceOf(Date);
    expect(created.updated_at).toBeInstanceOf(Date);
    expect(created.deleted_at).toBeNull();
    createdUuids.push(created.uuid);
  });

  it("returns snake_case keys (no camelCase leakage)", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "TEST_SNAKE_001", name: "Snake Test", status: "active",
    }, { actor: "test" });
    const keys = Object.keys(created);
    expect(keys).toContain("created_at");
    expect(keys).toContain("updated_at");
    expect(keys).toContain("deleted_at");
    expect(keys.some(k => /[A-Z]/.test(k))).toBe(false);  // no camelCase
    createdUuids.push(created.uuid);
  });

  it("stamps created_at and updated_at with DB now()", async () => {
    const before = new Date();
    const created = await repo.add(TestCustomerEntity, {
      code: "TEST_TS_001", name: "Timestamp Test", status: "active",
    }, { actor: "test" });
    const after = new Date();
    expect(created.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(created.created_at.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    createdUuids.push(created.uuid);
  });

  it("throws on unique constraint violation (duplicate code)", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "TEST_DUP_001", name: "First", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    await expect(repo.add(TestCustomerEntity, {
      code: "TEST_DUP_001", name: "Second", status: "active",
    }, { actor: "test" })).rejects.toThrow();  // Postgres unique violation
  });

  it("works on an entity with no audit fields (TestSimpleEntity)", async () => {
    const created = await repo.add(TestSimpleEntity, { label: "Simple Test" });
    expect(created.pk).toBeTypeOf("number");
    expect(created.uuid).toBeTypeOf("string");
    expect(created.label).toBe("Simple Test");
    // No created_at, no version — the library no-ops audit stamping
    expect((created as any).created_at).toBeUndefined();
    createdUuids.push(created.uuid);
  });

  it("throws NotFoundError when querying a non-existent uuid via findByUUID", async () => {
    await expect(repo.findByUUID(TestCustomerEntity, "00000000-0000-0000-0000-000000000000"))
      .rejects.toThrow(NotFoundError);
  });

  it("returns null when throwIfNotFound is false", async () => {
    const result = await repo.findByUUID(TestCustomerEntity, "00000000-0000-0000-0000-000000000000", { throwIfNotFound: false });
    expect(result).toBeNull();
  });
});
```

#### 3.7.9 Vitest config

```ts
// test/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    globalSetup: ["./setup/global-setup.ts"],
    include: ["test/**/*.test.ts"],
    testTimeout: 15000,        // real DB calls can be slow on first run
    hookTimeout: 30000,        // DB creation in globalSetup
  },
});
```

#### 3.7.10 Failure & negative tests (graceful failure coverage)

The test suite is NOT limited to happy paths. Every method is also tested for **expected failures** (exceptions the DAL must raise) and **silent failures** (the DAL returns a result but it's wrong — audit fields not stamped, version not incremented, soft-delete not applied, wrong row returned, etc.). This catches regressions where a refactor silently breaks audit stamping or soft-delete logic without throwing.

**Two categories of negative tests:**

**Category A — Expected exceptions (the DAL must throw):**
- `NotFoundError` — finders with `throwIfNotFound: true` (default) when row is missing.
- `MultipleRowsError` — `findById` / `find` when more than one row matches unexpectedly.
- Postgres constraint violations — unique violation on `add`/`upsert` with duplicate key, not-null violation on required field, FK violation if applicable.
- Validation errors — `add` with a property not in entity metadata, `update` with empty updates object, `delete` with missing `actor`.
- SQL injection prevention — `quoteIdent` / `assertValidIdentPart` rejects table/column names with semicolons, `--`, `/*`, etc.

**Category B — Silent failures (the DAL returns a result but it's wrong):**
- Audit fields NOT updated after `update` — verify `updated_at` changed, `updated_by` = actor, `version` = old + 1. If any is stale, the test fails.
- Audit fields NOT stamped on `add` — verify `created_at`, `created_by`, `version=1` are populated. If `created_by` is null or `version` is 0, the test fails.
- Soft-delete NOT applied after `delete` — verify `deleted_at` is not null, `deleted_by` = actor. If `deleted_at` is still null, the test fails.
- Restore NOT clearing fields — verify `deleted_at` is null, `deleted_by` is null after `restore`. If still set, the test fails.
- `deletedRecords: "EXCLUDED"` still returns soft-deleted rows — insert a row, soft-delete it, then `find` with default options. If the soft-deleted row appears, the test fails (the filter is broken).
- `deletedRecords: "ONLY"` returns live rows instead of only deleted — if a live row appears in the result, the test fails.
- Wrong row returned by `update` — update entity A, verify entity B is unchanged (no cross-contamination).
- `findByPage` returns wrong `total_records` — soft-delete a row, verify `total_records` decreases by 1 (the count must respect `deletedRecords: EXCLUDED`).
- `addMany` returns fewer rows than inserted — insert 3, verify the returned array has length 3. If any row failed silently, the test fails.
- Streaming yields rows after the pool is closed — verify the async iterable throws or ends cleanly, not silently yields partial data.

**Example failure test file (update-audit-failure.test.ts):**

```ts
// test/failures/update-audit-failure.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Pool } from "pg";
import { Repository } from "@primebrick/dal";
import { testConfig } from "../config";
import { TestCustomerEntity } from "../entities";

let pool: Pool;
let repo: Repository;

beforeAll(async () => {
  pool = new Pool({ ...testConfig, database: testConfig.testDb });
  repo = new Repository(pool);
});
afterAll(async () => { await pool.end(); });

describe("repo.update — audit field regression detection (silent failures)", () => {
  const createdUuids: string[] = [];

  afterEach(async () => {
    for (const uuid of createdUuids) {
      try { await repo.hardDelete(TestCustomerEntity, uuid, { actor: "test" }); } catch {}
    }
    createdUuids.length = 0;
  });

  it("FAILS if updated_at is not changed after update", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "FAIL_UPD_TS", name: "Before", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);
    const originalUpdatedAt = created.updated_at;

    // Small delay to ensure timestamp would differ
    await new Promise(r => setTimeout(r, 50));

    const updated = await repo.update(TestCustomerEntity, created.uuid, {
      name: "After",
    }, { actor: "test-user-2" });

    // If updated_at is unchanged, the audit stamping is broken
    expect(updated.updated_at.getTime()).not.toBe(originalUpdatedAt.getTime());
    expect(updated.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
  });

  it("FAILS if updated_by is not set to the actor after update", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "FAIL_UPD_BY", name: "Before", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    const updated = await repo.update(TestCustomerEntity, created.uuid, {
      name: "After",
    }, { actor: "specific-actor-123" });

    // If updated_by is stale or null, the audit stamping is broken
    expect(updated.updated_by).toBe("specific-actor-123");
    expect(updated.updated_by).not.toBe(created.updated_by);
  });

  it("FAILS if version is not incremented after update", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "FAIL_VER", name: "Before", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    const updated = await repo.update(TestCustomerEntity, created.uuid, {
      name: "After",
    }, { actor: "test" });

    expect(updated.version).toBe(created.version + 1);
    // Explicitly catch the silent failure: version stayed the same
    expect(updated.version).not.toBe(created.version);
  });

  it("FAILS if a non-updated field is accidentally modified", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "FAIL_ISO", name: "Original", email: "keep@test.com", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    const updated = await repo.update(TestCustomerEntity, created.uuid, {
      name: "Changed",
    }, { actor: "test" });

    // name should change, but email and status must NOT change
    expect(updated.name).toBe("Changed");
    expect(updated.email).toBe("keep@test.com");
    expect(updated.status).toBe("active");
  });
});
```

**Example expected-exception test file (expected-exceptions.test.ts):**

```ts
// test/failures/expected-exceptions.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Pool } from "pg";
import { Repository, NotFoundError, MultipleRowsError } from "@primebrick/dal";
import { testConfig } from "../config";
import { TestCustomerEntity } from "../entities";

let pool: Pool;
let repo: Repository;

beforeAll(async () => {
  pool = new Pool({ ...testConfig, database: testConfig.testDb });
  repo = new Repository(pool);
});
afterAll(async () => { await pool.end(); });

describe("DAL expected exceptions", () => {
  const createdUuids: string[] = [];

  afterEach(async () => {
    for (const uuid of createdUuids) {
      try { await repo.hardDelete(TestCustomerEntity, uuid, { actor: "test" }); } catch {}
    }
    createdUuids.length = 0;
  });

  it("NotFoundError: findByUUID on non-existent uuid (default throwIfNotFound)", async () => {
    await expect(
      repo.findByUUID(TestCustomerEntity, "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow(NotFoundError);
  });

  it("NotFoundError: find with filters that match nothing (default throwIfNotFound)", async () => {
    await expect(
      repo.find(TestCustomerEntity, null, {
        filters: [{ field: "code", op: "=", value: "NONEXISTENT_CODE_XYZ" }],
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("NotFoundError: update on non-existent uuid", async () => {
    await expect(
      repo.update(TestCustomerEntity, "00000000-0000-0000-0000-000000000000", { name: "X" }, { actor: "test" })
    ).rejects.toThrow(NotFoundError);
  });

  it("NotFoundError: delete on non-existent uuid", async () => {
    await expect(
      repo.delete(TestCustomerEntity, "00000000-0000-0000-0000-000000000000", { actor: "test" })
    ).rejects.toThrow(NotFoundError);
  });

  it("NotFoundError: restore on non-existent uuid", async () => {
    await expect(
      repo.restore(TestCustomerEntity, "00000000-0000-0000-0000-000000000000", { actor: "test" })
    ).rejects.toThrow(NotFoundError);
  });

  it("NotFoundError: hardDelete on non-existent uuid", async () => {
    await expect(
      repo.hardDelete(TestCustomerEntity, "00000000-0000-0000-0000-000000000000", { actor: "test" })
    ).rejects.toThrow(NotFoundError);
  });

  it("Postgres unique violation: add with duplicate unique field", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "DUP_EXC_001", name: "First", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    await expect(
      repo.add(TestCustomerEntity, { code: "DUP_EXC_001", name: "Second", status: "active" }, { actor: "test" })
    ).rejects.toThrow();  // Postgres error code 23505 (unique_violation)
  });

  it("Postgres not-null violation: add missing required field", async () => {
    await expect(
      repo.add(TestCustomerEntity, { code: "NULL_EXC_001" }, { actor: "test" })  // missing name, status
    ).rejects.toThrow();  // Postgres error code 23502 (not_null_violation)
  });

  it("ValidationError: add with property not in entity metadata", async () => {
    await expect(
      repo.add(TestCustomerEntity, { code: "X", name: "X", status: "X", nonExistentField: "oops" } as any, { actor: "test" })
    ).rejects.toThrow();  // DAL validation error — property not in metadata
  });

  it("ValidationError: update with empty updates object", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "EMPTY_UPD", name: "Test", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    await expect(
      repo.update(TestCustomerEntity, created.uuid, {}, { actor: "test" })
    ).rejects.toThrow();  // DAL validation error — no fields to update
  });

  it("SQL injection prevention: table name with semicolon is rejected", async () => {
    // The DAL must reject identifiers that contain SQL injection patterns
    // This tests quoteIdent / assertValidIdentPart at the metadata level
    await expect(
      repo.find({ constructor: { name: "test_customers; DROP TABLE test_customers; --" } } as any, null, {})
    ).rejects.toThrow();
  });
});
```

**Example soft-delete regression test (soft-delete-failure.test.ts):**

```ts
// test/failures/soft-delete-failure.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Pool } from "pg";
import { Repository } from "@primebrick/dal";
import { testConfig } from "../config";
import { TestCustomerEntity } from "../entities";

let pool: Pool;
let repo: Repository;

beforeAll(async () => {
  pool = new Pool({ ...testConfig, database: testConfig.testDb });
  repo = new Repository(pool);
});
afterAll(async () => { await pool.end(); });

describe("soft-delete regression detection (silent failures)", () => {
  const createdUuids: string[] = [];

  afterEach(async () => {
    for (const uuid of createdUuids) {
      try { await repo.hardDelete(TestCustomerEntity, uuid, { actor: "test" }); } catch {}
    }
    createdUuids.length = 0;
  });

  it("FAILS if deleted_at is not set after delete", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "FAIL_DEL", name: "ToDelete", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    const deleted = await repo.delete(TestCustomerEntity, created.uuid, { actor: "test-deleter" });

    expect(deleted.deleted_at).not.toBeNull();
    expect(deleted.deleted_at).toBeInstanceOf(Date);
  });

  it("FAILS if deleted_by is not set to the actor after delete", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "FAIL_DEL_BY", name: "ToDelete", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    const deleted = await repo.delete(TestCustomerEntity, created.uuid, { actor: "deleter-actor" });

    expect(deleted.deleted_by).toBe("deleter-actor");
  });

  it("FAILS if deletedRecords:EXCLUDED still returns soft-deleted rows", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "FAIL_EXCL", name: "ToExclude", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    await repo.delete(TestCustomerEntity, created.uuid, { actor: "test" });

    // Default deletedRecords is EXCLUDED — the soft-deleted row must NOT appear
    const results = await repo.findAll(TestCustomerEntity, null, {
      filters: [{ field: "code", op: "=", value: "FAIL_EXCL" }],
      deletedRecords: "EXCLUDED",
    });
    expect(results).toHaveLength(0);
  });

  it("FAILS if deletedRecords:ONLY returns live rows instead of only deleted", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "FAIL_ONLY", name: "ToCheck", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    // Row is live (not deleted) — deletedRecords:ONLY must NOT return it
    const results = await repo.findAll(TestCustomerEntity, null, {
      filters: [{ field: "code", op: "=", value: "FAIL_ONLY" }],
      deletedRecords: "ONLY",
    });
    expect(results).toHaveLength(0);

    // Now soft-delete it — deletedRecords:ONLY MUST return it
    await repo.delete(TestCustomerEntity, created.uuid, { actor: "test" });
    const deletedResults = await repo.findAll(TestCustomerEntity, null, {
      filters: [{ field: "code", op: "=", value: "FAIL_ONLY" }],
      deletedRecords: "ONLY",
    });
    expect(deletedResults).toHaveLength(1);
  });

  it("FAILS if restore does not clear deleted_at and deleted_by", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "FAIL_RESTORE", name: "ToRestore", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    await repo.delete(TestCustomerEntity, created.uuid, { actor: "test" });
    const restored = await repo.restore(TestCustomerEntity, created.uuid, { actor: "restorer-actor" });

    expect(restored.deleted_at).toBeNull();
    expect(restored.deleted_by).toBeNull();
    // Restore should also stamp updated_by
    expect(restored.updated_by).toBe("restorer-actor");
    expect(restored.version).toBeGreaterThan(2);  // created(1) + delete(2) + restore(3)
  });

  it("FAILS if findByPage total_records includes soft-deleted rows (EXCLUDED default)", async () => {
    const created = await repo.add(TestCustomerEntity, {
      code: "FAIL_PAGE", name: "ToPage", status: "active",
    }, { actor: "test" });
    createdUuids.push(created.uuid);

    const beforeDelete = await repo.findByPage(TestCustomerEntity, 1, 100, {
      filters: [{ field: "code", op: "=", value: "FAIL_PAGE" }],
    });
    expect(beforeDelete.total_records).toBe(1);

    await repo.delete(TestCustomerEntity, created.uuid, { actor: "test" });

    const afterDelete = await repo.findByPage(TestCustomerEntity, 1, 100, {
      filters: [{ field: "code", op: "=", value: "FAIL_PAGE" }],
    });
    // total_records must decrease — if it's still 1, the count includes soft-deleted rows (BUG)
    expect(afterDelete.total_records).toBe(0);
  });
});
```

#### 3.7.11 Updated test file structure (with failure tests)

```
test/
  ... (same as §3.7.5, plus:)
  failures/                              # NEW — negative & regression tests
    expected-exceptions.test.ts          # Category A: NotFoundError, MultipleRowsError, PG constraint violations, validation errors, SQL injection prevention
    update-audit-failure.test.ts         # Category B: updated_at/by not changed, version not incremented, field isolation
    soft-delete-failure.test.ts          # Category B: deleted_at/by not set, restore not clearing, deletedRecords filter broken, page count includes deleted
    add-audit-failure.test.ts            # Category B: created_at/by not stamped, version != 1, snake_case leakage on insert
    bulk-failure.test.ts                 # Category B: addMany returns fewer rows, upsertMany conflict not handled, deleteMany partial failure
    streaming-failure.test.ts            # Category B: stream yields after pool close, stream swallows query error
    no-audit-silent-failure.test.ts      # Category B: entity without audit fields — verify NO stale audit columns leak into result
  benchmark/                             # NEW — performance benchmarks (opt-in, not in default `pnpm test`)
    bulk-benchmark.test.ts               # chronometer benchmarks for updateMany/upsertMany at 100/1K/10K/1M scales
    type-roundtrip-benchmark.test.ts     # chronometer for primitive type round-trip on full-primitives table
```

#### 3.7.12 Bulk operation benchmarks (chronometer — opt-in)

The benchmark tests are **NOT part of the default `pnpm test` suite** — they're excluded from the default `vitest run` via the `include` pattern and run explicitly via `pnpm test:benchmark`. This keeps the regular test suite fast while allowing performance validation on demand.

**Vitest config exclusion:**
```ts
// test/vitest.config.ts (updated)
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    globalSetup: ["./setup/global-setup.ts"],
    include: ["test/**/*.test.ts"],
    exclude: ["test/benchmark/**", "node_modules/**"],  // benchmarks excluded from default run
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
```

**package.json scripts:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:benchmark": "vitest run --config test/benchmark.vitest.config.ts"
  }
}
```

**Benchmark config (separate, longer timeouts):**
```ts
// test/benchmark.vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    globalSetup: ["./setup/global-setup.ts"],
    include: ["test/benchmark/**/*.test.ts"],
    testTimeout: 600000,     // 10 minutes — 1M records takes time
    hookTimeout: 600000,
  },
});
```

**Benchmark scenarios:**

| Scenario | Table | Columns | Description |
|----------|-------|---------|-------------|
| **simple** | `test_bench_simple` | 5 (uuid, code, name, status, version) | Minimal table — measures pure DAL overhead |
| **primitives** | `test_bench_primitives` | 20+ (all PG primitive types: int2, int4, int8, float4, float8, numeric, boolean, char, varchar, text, uuid, date, timestamp, timestamptz, jsonb, bytea, text[], int4[], boolean, inet) | Wide table — measures type coercion overhead |

**Record counts tested:** 100, 1,000, 10,000, 1,000,000

**Metrics collected per run:**
- `total_ms` — wall-clock time for the entire operation (via `performance.now()`)
- `temp_table_ms` — time to CREATE TEMP TABLE
- `load_ms` — time to batch-INSERT all rows into temp table
- `update_ms` — time for the UPDATE FROM / INSERT ON CONFLICT statement
- `records_per_second` — `count / (total_ms / 1000)`
- `batch_size` — the auto-calculated or configured batch size

**Benchmark test file (bulk-benchmark.test.ts):**

```ts
// test/benchmark/bulk-benchmark.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { Repository } from "@primebrick/dal";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { testConfig } from "../config";
import { BenchSimpleEntity, BenchPrimitivesEntity } from "../entities";

let pool: Pool;
let repo: Repository;

beforeAll(async () => {
  pool = new Pool({ ...testConfig, database: testConfig.testDb });
  repo = new Repository(pool);
});
afterAll(async () => { await pool.end(); });

// Helper: generate N simple records
function genSimple(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    uuid: randomUUID(),
    code: `BENCH_S_${i}`,
    name: `Benchmark Simple Row ${i}`,
    status: i % 2 === 0 ? "active" : "inactive",
  }));
}

// Helper: generate N primitives records (all PG types)
function genPrimitives(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    uuid: randomUUID(),
    int2_val: i % 32767,
    int4_val: i,
    int8_val: BigInt(i) * 1000000n,
    float4_val: i * 1.5,
    float8_val: i * 3.141592653589793,
    numeric_safe: i * 123.45,
    boolean_val: i % 2 === 0,
    char_val: "X",
    varchar_val: `varchar_${i}`,
    text_val: `Long text content for row ${i} with some padding to make it realistic...`,
    uuid_val: randomUUID(),
    date_val: new Date(2024, 0, i % 28 + 1),
    timestamp_val: new Date(Date.now() + i * 1000),
    timestamptz_val: new Date(),
    jsonb_val: { index: i, nested: { value: i * 2, tags: ["a", "b"] } },
    text_arr: [`tag_${i}`, `tag_${i + 1}`],
    int4_arr: [i, i + 1, i + 2],
    inet_val: `192.168.${i % 256}.${(i * 7) % 256}`,
  }));
}

// Helper: run a benchmark and collect metrics
async function benchmark<T>(
  label: string,
  count: number,
  fn: () => Promise<T[]>
): Promise<void> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  const totalMs = end - start;
  const rps = Math.round(count / (totalMs / 1000));

  console.log(`\n  [BENCH] ${label}`);
  console.log(`    records:   ${count.toLocaleString()}`);
  console.log(`    total:     ${totalMs.toFixed(2)} ms`);
  console.log(`    throughput: ${rps.toLocaleString()} rec/s`);
  console.log(`    returned:  ${result.length.toLocaleString()} rows`);

  // Assertions: the operation must return all rows
  expect(result).toHaveLength(count);
}

describe("updateMany benchmark — simple table", () => {
  const counts = [100, 1000, 10000, 1000000];

  for (const count of counts) {
    it(`updateMany ${count.toLocaleString()} rows — simple table`, async () => {
      // Seed: insert N rows first
      const rows = genSimple(count);
      await repo.addMany(BenchSimpleEntity, rows, { actor: "bench" });

      // Prepare updates (change name + status)
      const updates = rows.map(r => ({
        uuid: r.uuid,
        name: `Updated ${r.name}`,
        status: r.status === "active" ? "inactive" : "active",
      }));

      await benchmark(`updateMany simple`, count, () =>
        repo.updateMany(BenchSimpleEntity, updates, { actor: "bench" })
      );

      // Cleanup
      await repo.deleteMany(BenchSimpleEntity, rows.map(r => r.uuid), { actor: "bench" });
      // hardDelete to leave no trace
      for (const r of rows) {
        try { await repo.hardDelete(BenchSimpleEntity, r.uuid, { actor: "bench" }); } catch {}
      }
    });
  }
});

describe("upsertMany benchmark — simple table", () => {
  const counts = [100, 1000, 10000, 1000000];

  for (const count of counts) {
    it(`upsertMany ${count.toLocaleString()} rows — simple table (all inserts)`, async () => {
      const rows = genSimple(count);
      await benchmark(`upsertMany simple (inserts)`, count, () =>
        repo.upsertMany(BenchSimpleEntity, rows, { actor: "bench" })
      );
      // Cleanup
      for (const r of rows) {
        try { await repo.hardDelete(BenchSimpleEntity, r.uuid, { actor: "bench" }); } catch {}
      }
    });

    it(`upsertMany ${count.toLocaleString()} rows — simple table (all updates)`, async () => {
      // First insert all rows
      const rows = genSimple(count);
      await repo.addMany(BenchSimpleEntity, rows, { actor: "bench" });

      // Now upsert with same uuids but changed data → all conflicts → all updates
      const updates = rows.map(r => ({
        ...r,
        name: `Upserted ${r.name}`,
      }));

      await benchmark(`upsertMany simple (updates)`, count, () =>
        repo.upsertMany(BenchSimpleEntity, updates, { actor: "bench" })
      );

      // Cleanup
      for (const r of rows) {
        try { await repo.hardDelete(BenchSimpleEntity, r.uuid, { actor: "bench" }); } catch {}
      }
    });
  }
});

describe("updateMany benchmark — primitives table", () => {
  const counts = [100, 1000, 10000, 1000000];

  for (const count of counts) {
    it(`updateMany ${count.toLocaleString()} rows — primitives table`, async () => {
      const rows = genPrimitives(count);
      await repo.addMany(BenchPrimitivesEntity, rows, { actor: "bench" });

      const updates = rows.map(r => ({
        uuid: r.uuid,
        varchar_val: `updated_${r.varchar_val}`,
        text_val: `Updated text for ${r.uuid}`,
        jsonb_val: { ...r.jsonb_val, updated: true },
      }));

      await benchmark(`updateMany primitives`, count, () =>
        repo.updateMany(BenchPrimitivesEntity, updates, { actor: "bench" })
      );

      for (const r of rows) {
        try { await repo.hardDelete(BenchPrimitivesEntity, r.uuid, { actor: "bench" }); } catch {}
      }
    });
  }
});

describe("upsertMany benchmark — primitives table", () => {
  const counts = [100, 1000, 10000, 1000000];

  for (const count of counts) {
    it(`upsertMany ${count.toLocaleString()} rows — primitives table (mixed insert+update)`, async () => {
      // Insert half the rows first
      const half = Math.floor(count / 2);
      const existingRows = genPrimitives(half);
      await repo.addMany(BenchPrimitivesEntity, existingRows, { actor: "bench" });

      // Now upsert ALL rows (half are updates, half are inserts)
      const allRows = [
        ...existingRows.map(r => ({ ...r, text_val: `Mixed upsert ${r.uuid}` })),
        ...genPrimitives(count - half),
      ];

      await benchmark(`upsertMany primitives (mixed)`, count, () =>
        repo.upsertMany(BenchPrimitivesEntity, allRows, { actor: "bench" })
      );

      for (const r of allRows) {
        try { await repo.hardDelete(BenchPrimitivesEntity, r.uuid, { actor: "bench" }); } catch {}
      }
    });
  }
});
```

**Benchmark output example (console):**
```
[BENCH] updateMany simple
  records:   1,000
  total:     45.32 ms
  throughput: 22,065 rec/s
  returned:  1,000 rows

[BENCH] updateMany simple
  records:   1,000,000
  total:     12,847.55 ms
  throughput: 77,839 rec/s
  returned:  1,000,000 rows
```

**Benchmark schema (added to `test/setup/schema.sql`):**
```sql
CREATE TABLE IF NOT EXISTS test_bench_simple (
  pk          BIGSERIAL PRIMARY KEY,
  uuid        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code        VARCHAR(50) NOT NULL,
  name        VARCHAR(200) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  VARCHAR(100),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  VARCHAR(100),
  version     INTEGER NOT NULL DEFAULT 1,
  deleted_at  TIMESTAMPTZ,
  deleted_by  VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS test_bench_primitives (
  pk              BIGSERIAL PRIMARY KEY,
  uuid            UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  int2_val        SMALLINT,
  int4_val        INTEGER,
  int8_val        BIGINT,
  float4_val      REAL,
  float8_val      DOUBLE PRECISION,
  numeric_safe    NUMERIC(15,2),
  boolean_val     BOOLEAN,
  char_val        CHAR(1),
  varchar_val     VARCHAR(200),
  text_val        TEXT,
  uuid_val        UUID,
  date_val        DATE,
  timestamp_val   TIMESTAMP,
  timestamptz_val TIMESTAMPTZ,
  jsonb_val       JSONB,
  text_arr        TEXT[],
  int4_arr        INTEGER[],
  inet_val        INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      VARCHAR(100),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      VARCHAR(100),
  version         INTEGER NOT NULL DEFAULT 1,
  deleted_at      TIMESTAMPTZ,
  deleted_by      VARCHAR(100)
);
```

**Benchmark entities:**
```ts
// test/entities/bench-simple.entity.ts
@Entity("test_bench_simple")
export class BenchSimpleEntity {
  @Key() @Column() pk!: number;
  @Unique() @Column() uuid!: string;
  @Column() code!: string;
  @Column() name!: string;
  @Column() status!: string;
  @AuditableField("created") @Column() created_at!: Date;
  @AuditableField("created") @Column() created_by?: string;
  @AuditableField("updated") @Column() updated_at!: Date;
  @AuditableField("updated") @Column() updated_by?: string;
  @AuditableField("version") @Column() version!: number;
  @DeletableField() @Column() deleted_at?: Date;
  @DeletableField() @Column() deleted_by?: string;
}

// test/entities/bench-primitives.entity.ts
@Entity("test_bench_primitives")
export class BenchPrimitivesEntity {
  @Key() @Column() pk!: number;
  @Unique() @Column() uuid!: string;
  @Column({ dbType: "int2" }) int2_val?: number;
  @Column({ dbType: "int4" }) int4_val?: number;
  @Column({ dbType: "int8" }) int8_val?: bigint;
  @Column({ dbType: "float4" }) float4_val?: number;
  @Column({ dbType: "float8" }) float8_val?: number;
  @Column({ dbType: "numeric", precision: 15, scale: 2 }) numeric_safe?: number;
  @Column({ dbType: "boolean" }) boolean_val?: boolean;
  @Column({ dbType: "char" }) char_val?: string;
  @Column({ dbType: "varchar" }) varchar_val?: string;
  @Column({ dbType: "text" }) text_val?: string;
  @Column({ dbType: "uuid" }) uuid_val?: string;
  @Column({ dbType: "date" }) date_val?: Date;
  @Column({ dbType: "timestamp" }) timestamp_val?: Date;
  @Column({ dbType: "timestamptz" }) timestamptz_val?: Date;
  @Column({ dbType: "jsonb" }) jsonb_val?: object;
  @Column({ dbType: "text[]" }) text_arr?: string[];
  @Column({ dbType: "int4[]" }) int4_arr?: number[];
  @Column({ dbType: "inet" }) inet_val?: string;
  @AuditableField("created") @Column() created_at!: Date;
  @AuditableField("created") @Column() created_by?: string;
  @AuditableField("updated") @Column() updated_at!: Date;
  @AuditableField("updated") @Column() updated_by?: string;
  @AuditableField("version") @Column() version!: number;
  @DeletableField() @Column() deleted_at?: Date;
  @DeletableField() @Column() deleted_by?: string;
}
```

### 3.8 How consumers (US, BE) install the DAL dependency

The DAL is consumed via **pnpm workspace linking** — the same mechanism already used for the existing siblings. The workspace `pnpm-workspace.yaml` currently lists:
```yaml
packages:
  - "../primebrick-fe-v3"
  - "../primebrick-be-v3"
  - "../primebrick-us-v3"
```

Adding the DAL as a fourth sibling makes it resolvable as `workspace:*` from any consumer.

#### 3.8.1 Workspace setup (one-time)

`primebrick-workspace/pnpm-workspace.yaml`:
```yaml
packages:
  - "../primebrick-fe-v3"
  - "../primebrick-be-v3"
  - "../primebrick-us-v3"
  - "../primebrick-dal-v3"           # NEW
```

#### 3.8.2 Consumer `package.json` (US now, BE later)

```json
{
  "dependencies": {
    "@primebrick/dal": "workspace:*"
  }
}
```

`workspace:*` tells pnpm to resolve `@primebrick/dal` from the local workspace, NOT from a registry. pnpm creates a **symlink**: `primebrick-us-v3/node_modules/@primebrick/dal` → `../../primebrick-dal-v3`.

#### 3.8.3 DAL `package.json` — exports map + build

The DAL ships **compiled JS** (`dist/`), not source. The `exports` map controls what consumers can import:

```json
{
  "name": "@primebrick/dal",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./errors": {
      "types": "./dist/errors/errors.d.ts",
      "import": "./dist/errors/errors.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "prepare": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:benchmark": "vitest run --config test/benchmark.vitest.config.ts"
  },
  "dependencies": {
    "pg": "^8.21.0",
    "pg-query-stream": "^4.8.0",
    "reflect-metadata": "^0.2.2"
  },
  "devDependencies": {
    "@types/pg": "^8.11.10",
    "@types/node": "^24.12.4",
    "typescript": "^5.7.2",
    "vitest": "^2.1.0",
    "dotenv": "^16.6.1"
  }
}
```

**`"prepare": "tsc"`** — runs automatically on `pnpm install` (both in the DAL repo itself and when a consumer installs). This ensures `dist/` is always up-to-date. If the DAL source changes, the consumer runs `pnpm install` again to trigger the `prepare` script and rebuild `dist/`. This is the **only** build mechanism — no `prebuild` hooks in consumers, no manual build steps.

#### 3.8.4 Dev vs production

| Scenario | How it works |
|----------|-------------|
| **Dev (tsx watch)** | BE/US use `tsx` which resolves TS source directly. The DAL doesn't need to be built — `tsx` follows the symlink and compiles on-the-fly. Changes to DAL source are picked up by HMR immediately. |
| **Production (node dist/)** | The DAL must be built (`pnpm --filter @primebrick/dal build` → `dist/`). The `prepare` script handles this on `pnpm install`. For CI: run `pnpm install` in the workspace root, which builds the DAL automatically. |
| **Standalone clone (no workspace)** | `workspace:*` won't resolve. This is already the case for BE/FE/US — they're designed to work within the workspace. Future: publish `@primebrick/dal` to GitHub Packages for standalone consumers. |

#### 3.8.5 The full install flow (concrete example)

```bash
# 1. From the workspace root:
cd D:\git\primebrick\primebrick-workspace

# 2. Install all workspace packages (builds DAL via prepare script):
pnpm install

# 3. Verify the symlink:
ls primebrick-us-v3/node_modules/@primebrick/dal
# → symlink to ../../primebrick-dal-v3

# 4. Verify the DAL is built:
ls primebrick-dal-v3/dist/index.js
# → exists

# 5. US can now import:
# import { Repository, NotFoundError } from "@primebrick/dal";
```

#### 3.8.6 Future: GitHub Packages publishing (NOT in this plan)

When the DAL needs to be consumed outside the workspace (e.g. by a CI pipeline that clones only US, or by a third party), it can be published to GitHub Packages:

```json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

Consumers would then use `"@primebrick/dal": "^0.1.0"` instead of `"workspace:*"`. See §3.9 for the CI publishing flow.

### 3.9 CI & publishing — GitFlow tag → build → publish to GitHub Packages

The DAL repo has its own CI (GitHub Actions) that auto-builds and publishes on GitFlow tag. This mirrors BE's `version-sync.mjs` pattern and makes the DAL a proper versioned package — consumers just bump a version number.

#### 3.9.1 version-sync script (same pattern as BE)

`primebrick-dal-v3/scripts/version-sync.mjs` — adapted from `primebrick-be-v3/scripts/version-sync.mjs`:
- Reads the current git branch (`release/0.X.Y` or `hotfix/0.X.Y`)
- Reads the latest git tag (`git tag --list "0.*.*"`)
- Calculates the expected version (release = minor bump, hotfix = patch bump)
- Validates the branch name matches the expected version
- Updates `package.json` `version` field to match
- Runs as `prebuild` hook (same as BE)

```json
{
  "scripts": {
    "version:auto": "node scripts/version-sync.mjs",
    "prebuild": "node scripts/version-sync.mjs",
    "build": "tsc"
  }
}
```

The version is a **committed source artifact** — it MUST be committed on the `release/` or `hotfix/` branch BEFORE merging to `main`. This ensures the source code at the git tag has the correct `package.json` version, and CI doesn't need to infer the version from the tag name (which is impossible anyway — CI checks out a tag in detached HEAD, and `version-sync.mjs` exits early on `HEAD` branch).

**Correct release flow:**
1. `git checkout -b release/0.2.0` from `develop`
2. `pnpm run version:auto` → `version-sync.mjs` updates `package.json` to `0.2.0`
3. `git add package.json && git commit -m "bump version to 0.2.0"` ← **the version bump is committed**
4. (optional final fixes on the release branch)
5. `git checkout main && git merge --no-ff release/0.2.0` → the version bump IS part of the merge
6. `git tag 0.2.0` → source code at tag HAS `package.json` version `0.2.0`
7. `git push origin main --tags`
8. CI checks out tag `0.2.0` → `package.json` already has `0.2.0` → `prebuild` runs `version-sync.mjs` (no-op, version already matches) → `build` runs `tsc` → publish

The `prebuild` hook is a **safety net** — it catches the case where someone forgot to run `version:auto` and commit. But the canonical flow is: run it manually, commit the result, merge. The `package.json` version in git on `develop` stays at the last released version (e.g. `0.1.0` after releasing `0.1.0`); it only changes on `release/` or `hotfix/` branches.

#### 3.9.2 CI workflow — GitHub Actions

`primebrick-dal-v3/.github/workflows/release.yml`:

```yaml
name: Release DAL

on:
  push:
    tags:
      - '0.*.*'    # triggers on version tags (0.1.0, 0.2.3, etc.) — no 'v' prefix, same as BE

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write    # required for GitHub Packages publishing

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0    # full history needed for `git tag --list`

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://npm.pkg.github.com
          scope: '@primebrick'

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Build (with version-sync)
        run: pnpm run build
        # prebuild hook runs version-sync.mjs → safety net (version should already be committed)
        # build runs tsc → creates dist/

      - name: Verify version matches tag
        run: |
          TAG_VERSION=${GITHUB_REF_NAME}
          PKG_VERSION=$(node -p "require('./package.json').version")
          if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
            echo "Version mismatch: tag=$TAG_VERSION pkg=$PKG_VERSION"
            exit 1
          fi
          echo "Version OK: $PKG_VERSION"

      - name: Publish to GitHub Packages
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 3.9.3 The full GitFlow → publish flow

```
1. Developer: git checkout develop && git pull
2. Developer: git checkout -b release/0.2.0
3. Developer: pnpm run version:auto → version-sync.mjs updates package.json to 0.2.0
4. Developer: git add package.json && git commit -m "bump version to 0.2.0"  ← VERSION IS COMMITTED
5. Developer: (optional final fixes on release branch)
6. Developer: git checkout main && git merge --no-ff release/0.2.0  ← version bump IS part of merge
7. Developer: git tag 0.2.0  ← source code at tag HAS package.json version 0.2.0
8. Developer: git push origin main --tags
   ↓
9. CI triggers on tag push (0.2.0)
10. CI: checkout tag → pnpm install → pnpm run build
    - prebuild: version-sync.mjs runs as safety net (no-op — version already 0.2.0 in committed package.json)
    - build: tsc → creates dist/
11. CI: verify package.json version === tag version (both should be 0.2.0)
12. CI: npm publish → @primebrick/dal@0.2.0 on GitHub Packages
    ↓
13. US/BE consumer: update package.json
    "dependencies": { "@primebrick/dal": "0.2.0" }
14. US/BE consumer: pnpm install → fetches @primebrick/dal@0.2.0 from GitHub Packages
```

#### 3.9.4 Consumer dependency — dev vs prod

| Mode | `package.json` value | How it resolves |
|------|----------------------|-----------------|
| **Dev (workspace)** | `"@primebrick/dal": "workspace:*"` | pnpm symlink to `../../primebrick-dal-v3` — always latest source |
| **Prod (registry)** | `"@primebrick/dal": "0.2.0"` | pnpm fetches from GitHub Packages — pinned version |

The consumer can use `workspace:*` for local dev and switch to a pinned version for CI/production builds. The switch is a one-line change in `package.json`.

**Recommended approach for US/BE:**
- Keep `"@primebrick/dal": "workspace:*"` in the committed `package.json` (dev convenience)
- For production CI: override with `pnpm install --filter @primebrick/dal@0.2.0` or use a production `package.json` override
- Or: use `"@primebrick/dal": "workspace:*"` in dev and `"@primebrick/dal": "0.2.0"` in a separate `package.prod.json`

**Simplest approach (recommended for Phase 1):**
- Dev: `workspace:*` (always latest, no publishing needed)
- Prod CI: clone the full workspace + `pnpm install` (uses `workspace:*`, builds DAL via `prepare`)
- Publishing to GitHub Packages is **ready** (CI workflow exists) but consumers don't need to use it until they want standalone clones

#### 3.9.5 .npmrc for GitHub Packages

Consumers (US, BE) need an `.npmrc` to resolve `@primebrick/*` from GitHub Packages:

```ini
# .npmrc (committed, no secrets — uses $GITHUB_TOKEN or ~/.npmrc auth)
@primebrick:registry=https://npm.pkg.github.com
```

The actual auth token is configured per-environment:
- **Local dev**: `~/.npmrc` with `//npm.pkg.github.com/:_authToken=ghp_xxx` (personal access token)
- **CI**: `NODE_AUTH_TOKEN` env var (set by `actions/setup-node`)

This `.npmrc` is only needed when using registry versions (`"0.2.0"`). With `workspace:*`, no `.npmrc` is needed — pnpm resolves locally.

#### 3.9.6 Files created for CI

```
primebrick-dal-v3/
  scripts/
    version-sync.mjs              # adapted from BE — reads git tag, updates package.json version
  .github/
    workflows/
      release.yml                 # CI: tag push → build → publish to GitHub Packages
  .npmrc                          # points @primebrick scope to GitHub Packages (for the DAL repo itself to publish)
```

### New repo (created)
- `primebrick-dal-v3/` — sibling git repository at `D:\git\primebrick\primebrick-dal-v3\` (already `git init`-ed by the user)

### New files (inside `primebrick-dal-v3/`)
- `primebrick-dal-v3/.gitignore`
- `primebrick-dal-v3/LICENSE` (MIT — Copyright (c) 2026 Michael Sogos, same text as BE/FE/US)
- `primebrick-dal-v3/package.json` (name: `@primebrick/dal`, type: module, `license: "MIT"`, exports map)
- `primebrick-dal-v3/tsconfig.json`
- `primebrick-dal-v3/README.md`
- `primebrick-dal-v3/AGENTS.md` (AI entry point — project facts, commands, conventions)
- `primebrick-dal-v3/CLAUDE.md` (short pointer → AGENTS.md, Claude Code compat)
- `primebrick-dal-v3/src/index.ts` (public barrel)
- `primebrick-dal-v3/src/meta/entity-meta.ts` (canonical entity-decorators.ts, consolidated from emailsender + BE)
- `primebrick-dal-v3/src/meta/column-pg-io.ts` (pg<->js value coercion)
- `primebrick-dal-v3/src/query/query-builder.ts` (extended for RETURNING *)
- `primebrick-dal-v3/src/query/dsl.ts` (Filter/Sort/Join/Project DSL)
- `primebrick-dal-v3/src/query/streaming.ts` (pg-query-stream wrapper)
- `primebrick-dal-v3/src/repository/repository.ts` (new, generalized from BE)
- `primebrick-dal-v3/src/errors/errors.ts` (NotFoundError, MultipleRowsError)
- `primebrick-dal-v3/src/types/types.ts` (FindOptions, BulkOptions, AuditPort, LoggerPort, etc.)
- `primebrick-dal-v3/src/audit/auditable-joins.ts`
- `primebrick-dal-v3/src/audit/auditable-types.ts`
- `primebrick-dal-v3/docs/ai/README.md` (AI docs index, mirrors BE convention)
- `primebrick-dal-v3/docs/ai/SKILLS.md` (skill selection table)
- `primebrick-dal-v3/docs/ai/WORKFLOWS.md` (plan → implement → verify for DAL changes)
- `primebrick-dal-v3/docs/ai/dal-usage-guide.md` (complete method-by-method guide with examples)
- `primebrick-dal-v3/docs/ai/dal-entity-authoring.md` (how to define a new @Entity)
- `primebrick-dal-v3/docs/ai/dal-architecture.md` (internal layer architecture & data flow)
- `primebrick-dal-v3/docs/gitflow.md` (GitFlow rules — adapted from BE, NEVER commit auto, branch rules, version tagging, **version bump MUST be committed on release/hotfix branch before merge to main**)
- `primebrick-dal-v3/docs/skills/dal-crud-recipe.md` (recipe: CRUD on entity X)
- `primebrick-dal-v3/docs/skills/dal-streaming-recipe.md` (recipe: stream large result sets)
- `primebrick-dal-v3/.devin/rules/always-check-rules-first.md` (same as BE/US)
- `primebrick-dal-v3/.devin/rules/workflow.md` (Tic-Toc planning — same as BE/US)
- `primebrick-dal-v3/.devin/rules/code-guardrails.md` (max 2 self-correction attempts)
- `primebrick-dal-v3/.devin/rules/file-operations.md` (empirical verification)
- `primebrick-dal-v3/.devin/rules/temp-files.md` (temp files in d:\git\primebrick\temp\)
- `primebrick-dal-v3/.devin/rules/data-model-conventions.md` (snake_case, no DTO — same as BE/US)
- `primebrick-dal-v3/.devin/rules/dal-conventions.md` (always-on rules for agents in DAL repo)
- `primebrick-dal-v3/.devin/rules/dal-entity-rules.md` (entity authoring rules)
- `primebrick-dal-v3/.devin/skills/feature/SKILL.md` (same feature skill as BE/US)
- `primebrick-dal-v3/.devin/skills/dal-usage/SKILL.md` (invokable Devin skill for DB access via DAL)
- `primebrick-dal-v3/test/.env.test.example` (committed template for test DB credentials)
- `primebrick-dal-v3/test/.env.test` (gitignored — real test DB credentials)
- `primebrick-dal-v3/test/config.ts` (loads .env.test, exports testConfig)
- `primebrick-dal-v3/test/vitest.config.ts` (Vitest config with globalSetup)
- `primebrick-dal-v3/test/setup/global-setup.ts` (idempotent DB + schema + seed bootstrap)
- `primebrick-dal-v3/test/setup/schema.sql` (idempotent DDL for test tables)
- `primebrick-dal-v3/test/setup/seed.sql` (idempotent seed data with ON CONFLICT DO NOTHING)
- `primebrick-dal-v3/test/setup/helpers.ts` (getTestPool, known seed UUIDs, cleanup helpers)
- `primebrick-dal-v3/test/entities/test-customer.entity.ts` (full audit + deletable test entity)
- `primebrick-dal-v3/test/entities/test-simple.entity.ts` (minimal entity — no audit, no soft-delete)
- `primebrick-dal-v3/test/write-ops/add.test.ts`
- `primebrick-dal-v3/test/write-ops/upsert.test.ts`
- `primebrick-dal-v3/test/write-ops/update.test.ts`
- `primebrick-dal-v3/test/write-ops/delete.test.ts`
- `primebrick-dal-v3/test/write-ops/restore.test.ts`
- `primebrick-dal-v3/test/write-ops/hardDelete.test.ts`
- `primebrick-dal-v3/test/finders/findById.test.ts`
- `primebrick-dal-v3/test/finders/findByUUID.test.ts`
- `primebrick-dal-v3/test/finders/find.test.ts`
- `primebrick-dal-v3/test/finders/findAll.test.ts`
- `primebrick-dal-v3/test/finders/findByPage.test.ts`
- `primebrick-dal-v3/test/bulk/addMany.test.ts`
- `primebrick-dal-v3/test/bulk/upsertMany.test.ts`
- `primebrick-dal-v3/test/bulk/deleteMany.test.ts`
- `primebrick-dal-v3/test/bulk/updateMany.test.ts`
- `primebrick-dal-v3/test/edge-cases/no-deleted-at.test.ts`
- `primebrick-dal-v3/test/edge-cases/no-audit-fields.test.ts`
- `primebrick-dal-v3/test/edge-cases/snake-case.test.ts`
- `primebrick-dal-v3/test/edge-cases/sql-injection-ids.test.ts`
- `primebrick-dal-v3/test/edge-cases/concurrent-writes.test.ts`
- `primebrick-dal-v3/test/failures/expected-exceptions.test.ts` (Category A: NotFoundError, MultipleRowsError, PG constraint violations, validation errors, SQL injection prevention)
- `primebrick-dal-v3/test/failures/update-audit-failure.test.ts` (Category B: updated_at/by not changed, version not incremented, field isolation)
- `primebrick-dal-v3/test/failures/soft-delete-failure.test.ts` (Category B: deleted_at/by not set, restore not clearing, deletedRecords filter broken, page count includes deleted)
- `primebrick-dal-v3/test/failures/add-audit-failure.test.ts` (Category B: created_at/by not stamped, version != 1, snake_case leakage on insert)
- `primebrick-dal-v3/test/failures/bulk-failure.test.ts` (Category B: addMany returns fewer rows, upsertMany conflict not handled, deleteMany partial failure)
- `primebrick-dal-v3/test/failures/streaming-failure.test.ts` (Category B: stream yields after pool close, stream swallows query error)
- `primebrick-dal-v3/test/failures/no-audit-silent-failure.test.ts` (Category B: entity without audit fields — verify no stale audit columns leak into result)
- `primebrick-dal-v3/test/benchmark/bulk-benchmark.test.ts` (chronometer benchmarks for updateMany/upsertMany at 100/1K/10K/1M scales, simple + primitives tables)
- `primebrick-dal-v3/test/benchmark/type-roundtrip-benchmark.test.ts` (chronometer for primitive type round-trip on full-primitives table)
- `primebrick-dal-v3/test/benchmark.vitest.config.ts` (separate Vitest config for benchmarks — 10min timeout, includes only `test/benchmark/**`)
- `primebrick-dal-v3/test/entities/bench-simple.entity.ts` (5-column benchmark entity)
- `primebrick-dal-v3/test/entities/bench-primitives.entity.ts` (20+ column benchmark entity with all PG primitive types)
- `primebrick-dal-v3/scripts/version-sync.mjs` (adapted from BE — reads git tag, updates package.json version)
- `primebrick-dal-v3/.github/workflows/release.yml` (CI: tag push → build → publish to GitHub Packages)
- `primebrick-dal-v3/.npmrc` (points @primebrick scope to GitHub Packages for publishing)

### Phase 2 — DEFERRED (emailsender integration, NOT in this plan)
> These files will be touched in a **separate follow-up plan** after Phase 1 (the DAL library itself) is complete. Listed here for reference only.
- `primebrick-us-v3/emailsender/src/domain/entities/email_template_communication_log_entity.ts` (new — prerequisite for replacing the raw INSERT in EmailService)
- `primebrick-us-v3/emailsender/package.json` (add `@primebrick/dal` dep)
- `primebrick-us-v3/emailsender/src/domain/entities/email_config_entity.ts` (import path only)
- `primebrick-us-v3/emailsender/src/domain/entities/email_template_entity.ts` (import path only)
- `primebrick-us-v3/emailsender/src/domain/entities/registry.ts` (import path + new log entity)
- `primebrick-us-v3/emailsender/src/services/email-service.ts` (replace raw SQL with repo calls)
- `primebrick-us-v3/emailsender/src/db/pool.ts` (no change expected; verify schema handling still works with dal)
- `primebrick-us-v3/emailsender/src/domain/entities/entity-decorators.ts` (DELETE after move)
- `primebrick-us-v3/emailsender/src/db/entity-ts-to-pg.ts` (DELETE if its responsibilities move into `column-pg-io.ts` in dal)
- `primebrick-us-v3/emailsender/src/db/schema-*` and `db-meta` tooling files — **NOT deleted**; they stay in the microservice because they generate per-service DB patches. They will import metadata helpers from `@primebrick/dal` instead of local copies.

### Modified (Phase 1 — this plan)
- `primebrick-workspace/pnpm-workspace.yaml` (add `"../primebrick-dal-v3"` to `packages`)
- `primebrick-workspace/primebrick.code-workspace` (add `primebrick-dal-v3` folder to the workspace so it's visible in the IDE)

### NOT modified (out of scope)
- `primebrick-be-v3/**` — the backend keeps its own `Repository` for now. BE adoption of `@primebrick/dal` is **Phase 3** (deferred until after the DAL is complete, tested, released, AND Phase 2 US integration is done).
- `primebrick-us-v3/**` — the emailsender integration is **Phase 2** (deferred until after the DAL is complete, tested, and released — see §3.5).

---

## 5. Acceptance criteria (Phase 1 — DAL library only)

1. `@primebrick/dal` builds with `tsc --noEmit` and `pnpm run build` with zero errors.
2. `repo.add(SomeEntity, {...})` returns a fully-hydrated entity (with `id`, `uuid`, `created_at`, `version` populated by DB) — verified by a smoke test against a stub or live Postgres.
3. `repo.findByUUID(SomeEntity, uuid)` throws `NotFoundError` when the row is missing (default), and returns `null` when `{ throwIfNotFound: false }` is passed.
4. `repo.find(SomeEntity, null, { filters: [...] })` returns the first matching live row, and throws `NotFoundError` when zero rows match (default).
5. `repo.findByPage(SomeEntity, 1, 10)` returns `{ entities, total_records }` with `entities.length <= 10`.
6. `repo.findAll(SomeEntity, null, { stream: true })` returns an `AsyncIterable` that yields rows one-by-one (verified by consuming with `for await`).
7. `repo.delete(SomeEntity, uuid, { actor: "system" })` returns the persisted row with `deleted_at` set (requires `deleted_at` column to exist on the entity).
8. `repo.addMany(SomeEntity, [row1, row2, row3])` returns an array of 3 hydrated entities.
9. All returned rows are snake_case (no camelCase leakage) — verified by inspecting keys of a returned object.
10. No file in `primebrick-be-v3` is touched.
11. No file in `primebrick-us-v3` is touched (emailsender integration is deferred to Phase 2 — see §3.5).
12. `primebrick-workspace/pnpm-workspace.yaml` lists `"../primebrick-dal-v3"` and `pnpm install` (run from the workspace root) resolves `@primebrick/dal` to the sibling workspace package.
13. `primebrick-dal-v3/` is a git-initialized sibling repo (its own `.git`) alongside BE/FE/US.
14. `primebrick-dal-v3/AGENTS.md` exists and is readable — an agent reading only this file understands what the repo is, how to build it, and where to find usage docs.
15. `primebrick-dal-v3/docs/ai/dal-usage-guide.md` covers all 15 methods (5 finders + 6 write ops + 4 bulk) with at least one code example each.
16. `primebrick-dal-v3/.devin/skills/dal-usage/SKILL.md` is invokable via the Devin skill tool and returns coherent guidance for DB-access tasks.
17. `primebrick-dal-v3/LICENSE` contains the MIT license text identical to `primebrick-be-v3/LICENSE`.
18. `primebrick-dal-v3/package.json` includes `"license": "MIT"`.
19. `pnpm test` (run from `primebrick-dal-v3/`) passes with all test files green — requires a reachable Postgres instance configured in `test/.env.test`.
20. The test suite covers all 15 methods (5 finders + 6 write ops + 4 bulk) + edge cases (no-deleted-at, no-audit, snake-case, sql-injection-ids, concurrent-writes) — at least 3 test cases per method.
21. `test/setup/global-setup.ts` is idempotent: running `pnpm test` twice in a row produces the same result (no duplicate seeds, no errors from existing tables/DB).
22. After `pnpm test` completes, the test DB (`primebrick_dal_test`) still exists with schema + seeds intact — only the pool is closed. Test-created rows are cleaned up via `afterEach` hardDelete.
23. `test/.env.test` is gitignored; `test/.env.test.example` is committed and documents all required variables.
24. **Failure tests — Category A (expected exceptions)**: `test/failures/expected-exceptions.test.ts` verifies that the DAL throws `NotFoundError` for all 5 finders + all write ops on non-existent uuids, throws on PG unique/not-null violations, throws on validation errors (unknown property, empty updates), and rejects SQL injection identifiers. At least 10 negative test cases.
25. **Failure tests — Category B (silent failures)**: `test/failures/{update-audit-failure,soft-delete-failure,add-audit-failure,bulk-failure,streaming-failure,no-audit-silent-failure}.test.ts` verify that audit fields ARE stamped (updated_at changed, version incremented, created_by set), soft-delete IS applied (deleted_at not null, deleted_by = actor), restore DOES clear fields, deletedRecords filter IS enforced (EXCLUDED excludes, ONLY includes only deleted), findByPage total_records excludes soft-deleted, addMany returns all rows. At least 15 regression-detection test cases.
26. All failure tests use `expect(...).rejects.toThrow(...)` for Category A and `expect(...).not.toBe(...)` / `expect(...).not.toBeNull()` for Category B — the test FAILS if the DAL silently returns a wrong result.
27. **Bulk benchmarks**: `pnpm test:benchmark` runs `updateMany` and `upsertMany` at 100, 1K, 10K, and 1M record counts on both `test_bench_simple` (5 columns) and `test_bench_primitives` (20+ columns) tables. Each benchmark reports `total_ms`, `records_per_second`, and `returned rows count` via `performance.now()`. All benchmarks assert that the returned row count matches the input count.
28. Benchmarks are **excluded from default `pnpm test`** (via `exclude: ["test/benchmark/**"]` in vitest.config.ts) — they run only via `pnpm test:benchmark` with a 10-minute timeout.
29. `updateMany` and `upsertMany` use the TEMP TABLE pattern (§3.2.3): `CREATE TEMP TABLE ... ON COMMIT DROP` → batched INSERT → single `UPDATE FROM` / `INSERT SELECT ON CONFLICT` → `COMMIT`. The temp table is auto-dropped on commit. All operations are atomic (single transaction).
30. `upsertMany` ON CONFLICT is audit-aware: `created_at`/`created_by` preserved on conflict (not in SET clause), `updated_at`/`updated_by`/`version` stamped on conflict.
31. `scripts/version-sync.mjs` exists and works the same as BE's: reads git tag, updates `package.json` version, validates branch name (`release/0.X.Y` / `hotfix/0.X.Y`).
32. `.github/workflows/release.yml` triggers on tag push (`0.*.*`), runs `pnpm run build` (which triggers `prebuild: version-sync`), verifies `package.json` version === tag, and publishes to GitHub Packages.
33. `package.json` includes `"prebuild": "node scripts/version-sync.mjs"` — runs as a **safety net** during build. The canonical flow is: run `version:auto` manually on the `release/` or `hotfix/` branch, **commit** the `package.json` version bump, then merge to `main`.
34. The DAL `package.json` `version` field in git on `develop` reflects the last released version (e.g. `0.1.0` after releasing `0.1.0`). It is updated to the new version on `release/` or `hotfix/` branches and **committed** before merging to `main`. The source code at any git tag has the correct `package.json` version — no build-time inference needed.

---

## 6. Open questions for the user (decisions needed before PROCEED)

1. ~~**Library location**~~ — **DECIDED**: `primebrick-dal-v3/` as a sibling git repo of BE/FE/US. (No longer an open question.)
2. ~~**`deleted_at`/`deleted_by` on email entities**~~ — **DEFERRED to Phase 2** (emailsender integration). Not needed for Phase 1.
3. ~~**`EmailTemplateCommunicationLogEntity`**~~ — **DEFERRED to Phase 2** (emailsender integration). Not needed for Phase 1.
4. ~~**Audit in the email microservice**~~ — **DEFERRED to Phase 2** (emailsender integration). Not needed for Phase 1.
5. ~~**`updateMany` strategy**~~ — **DECIDED**: TEMP TABLE + stream-load + single UPDATE FROM / INSERT ON CONFLICT FROM. See §3.2.3 for full SQL. Atomic (single transaction, `ON COMMIT DROP`), SQL-injection safe, scales to millions of rows. `upsertMany` uses the same pattern with audit-aware ON CONFLICT (created_at preserved on conflict, updated_at/version stamped).
6. ~~**BE migration**~~ — **CONFIRMED OUT OF SCOPE**: both `primebrick-be-v3` and `primebrick-us-v3` integration are deferred to **after** the DAL is complete, tested, and released. Phase 1 = DAL library only. Phase 2 = US (emailsender) integration. Phase 3 = BE migration. No consumer repo is touched until the DAL has a released version on GitHub Packages.
7. ~~**Git init for `primebrick-dal-v3`**~~ — **DONE**: the user has already `git init`-ed the repo. The plan will create a `develop` branch (from `main`) and work there per GitFlow. No remote push without explicit instruction.

---

## 7. Execution order (after PROCEED)

1. The repo `primebrick-dal-v3/` is already `git init`-ed. Create `develop` branch from `main` (`git checkout -b develop`). Create `.gitignore` + `LICENSE` (MIT, same as BE/FE/US) + `package.json` (with `license: "MIT"`, exports map, `prepare: tsc`) + `tsconfig.json` + `README.md` + `AGENTS.md` + `CLAUDE.md` + `docs/gitflow.md` (adapted from BE) + `.devin/rules/*` (copied from BE/US and adapted) + `.devin/skills/*`.
2. Add `"../primebrick-dal-v3"` to `primebrick-workspace/pnpm-workspace.yaml`; add the folder to `primebrick-workspace/primebrick.code-workspace`. Run `pnpm install` from the workspace root.
3. Move files into the subfolder structure: `meta/entity-meta.ts` + `meta/column-pg-io.ts` + `query/dsl.ts` + `query/query-builder.ts` + `types/types.ts` + `audit/auditable-joins.ts` + `audit/auditable-types.ts` (verbatim from BE, adjusting imports to the new subfolder paths).
4. Implement `errors/errors.ts` (NotFoundError, MultipleRowsError).
5. Implement the new `repository/repository.ts` with the API in §3.2 (write ops return `TEntity`, finders with `throwIfNotFound` + `deletedRecords`).
6. Implement `query/streaming.ts` (pg-query-stream wrapper).
7. Implement bulk ops (`addMany`, `upsertMany`, `deleteMany`, `updateMany`).
8. Wire `src/index.ts` barrel to re-export from all subfolders.
9. Build `@primebrick/dal`; fix type errors (max 2 self-correction attempts per code-guardrails rule).
10. Write the integration test suite: `test/.env.test.example` + `test/config.ts` + `test/vitest.config.ts` + `test/setup/{global-setup,schema.sql,seed.sql,helpers}.ts` + `test/entities/{test-customer,test-simple}.entity.ts` + all test files in `test/{write-ops,finders,bulk,edge-cases}/*.test.ts` (per §3.7).
11. Add `vitest` + `dotenv` to devDependencies; add `test` + `test:watch` scripts to `package.json`.
12. Run `pnpm test` against a real Postgres (user must provide credentials in `test/.env.test`); fix failures (max 2 self-correction attempts per code-guardrails rule). Verify idempotency by running `pnpm test` twice.
13. Write DAL-specific AI documentation: `docs/ai/{README,SKILLS,WORKFLOWS,dal-usage-guide,dal-entity-authoring,dal-architecture}.md` + `docs/skills/{dal-crud-recipe,dal-streaming-recipe}.md` (per §3.6.2 content highlights). (The generic AI docs — `AGENTS.md`, `CLAUDE.md`, `docs/gitflow.md`, `.devin/rules/*` — are already created in step 1.)
14. Write DAL-specific Devin config: `.devin/rules/{dal-conventions,dal-entity-rules}.md` + `.devin/skills/dal-usage/SKILL.md`. (The generic `.devin/rules/*` and `.devin/skills/feature/SKILL.md` are already created in step 1.)
15. Write CI & versioning: `scripts/version-sync.mjs` (adapted from BE) + `.github/workflows/release.yml` (tag → build → publish to GitHub Packages) + `.npmrc` (points @primebrick scope to GitHub Packages). Add `"prebuild": "node scripts/version-sync.mjs"` + `"version:auto": "node scripts/version-sync.mjs"` scripts to `package.json`. Set initial `package.json` version to `0.1.0` (first release — will be committed on the first `release/0.1.0` branch, not a dev placeholder).
16. Halt and report; do NOT commit (per AGENTS.md: never commit without explicit instruction).

> **Phase 2 (deferred — §3.5 US/emailsender integration):** rewiring emailsender imports, creating `EmailTemplateCommunicationLogEntity`, rewriting `EmailService.sendEmail`, and the emailsender build/smoke test are NOT in this execution order. They will be a separate follow-up plan, started **after the DAL is complete, tested, and released** (a versioned tag exists on GitHub Packages).
>
> **Phase 3 (deferred — BE migration):** `primebrick-be-v3` adoption of `@primebrick/dal` (replacing its internal `Repository` with the shared library, migrating `audit-service` injection and `http/api-errors` mapping). Also a separate follow-up plan, started **after Phase 2 is complete**.
>
> **REMINDER: prompt the user to start Phase 2 after Phase 1 is complete and released. Then Phase 3 after Phase 2.**
