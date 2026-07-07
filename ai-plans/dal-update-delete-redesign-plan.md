# Plan: DAL Write Methods Redesign — matchBy + Compile-Time Actor Enforcement

**Version:** 0.1.0
**Status:** DRAFT — awaiting approval
**Date:** 2026-07-06
**Scope:** `primebrick-dal-v3` (library) + `primebrick-us-v3/emailsender` (consumer)

---

## 1. Objective

Redesign every write method in the DAL that currently takes a hardcoded
`uuid: string` parameter. The new design:

1. **No separate identifier parameter** — the WHERE key value lives inside
   the `updates`/`row` object, not as a separate arg.
2. **`matchBy` option** — lets the dev specify which entity property to use
   as the WHERE left operand. Defaults to the `@Key()` column. TypeScript
   guardrail: `matchBy` accepts only `keyof TEntity & string`, not arbitrary
   strings.
3. **Compile-time `actor` enforcement** — via method overloads + generic
   constraints. If `TEntity extends IAuditableEntity`, `actor` is required.
   If not, `actor` is rejected at compile time. Zero runtime cost.
4. **Eliminate `rawSql` from emailsender** — after the DAL gains `matchBy`,
   refactor emailsender to use `dal.update()` / `dal.delete()` instead of
   `dal.rawSql()`.

---

## 2. Current state — what's broken

### 2.1 Every write method is hardcoded to `WHERE uuid = $N`

| Method | Current signature | WHERE clause |
|--------|-------------------|--------------|
| `update` | `(entity, uuid: string, updates, options)` | `WHERE uuid = $N` |
| `delete` | `(entity, uuid: string, options)` | `WHERE uuid = $N` |
| `restore` | `(entity, uuid: string, options)` | `WHERE uuid = $N` |
| `hardDelete` | `(entity, uuid: string, options)` | `WHERE uuid = $N` |
| `updateMany` | `(entity, updates: Array<{ uuid: string } & ...>, options)` | `WHERE uuid = ANY($N::uuid[])` |
| `deleteMany` | `(entity, uuids: string[], options)` | `WHERE uuid = ANY($N::uuid[])` |

### 2.2 `findUuidColumn` is too loose

```typescript
// repository.ts:82
const col = Object.values(meta.columns).find((c) => c.sqlName === "uuid" || c.isUnique);
```

It falls back to "any `@Unique` column" and treats it as uuid. This is
semantically wrong — `provider_message_id` is not a uuid.

### 2.3 Entities without uuid are completely locked out

`EmailCommunicationLogEntity` has `@Key() id: number` and no uuid column.
Every write method throws: `Entity ... has no uuid column`. There is no
alternative. The only escape hatch is `rawSql`.

### 2.4 `actor` is required for all entities, even non-auditable ones

`WriteOptions.actor` is `actor: string` (required). For non-auditable
entities like `EmailCommunicationLogEntity`, the value is ignored at
runtime — but the caller is forced to provide it.

---

## 3. Proposed design

### 3.1 New `WriteOptions` type hierarchy

```typescript
// types/types.ts

/** Base write options — no actor. */
export type WriteOptions = {
  /** Optional audit port — if not injected, audit is silently skipped. */
  audit?: AuditPort;
  /** Optional logger port — if not injected, errors are swallowed. */
  logger?: LoggerPort;
};

/** Write options for auditable entities — actor is required. */
export type AuditableWriteOptions = WriteOptions & {
  /** The actor performing the operation (stamped into created_by/updated_by/deleted_by). */
  actor: string;
};

/** Write options with matchBy — for update/delete/restore/hardDelete. */
export type MatchByOptions<TEntity> = {
  /**
   * Which entity property to use as the WHERE left operand.
   * Defaults to the @Key() column.
   * TypeScript guardrail: only accepts actual properties of TEntity.
   */
  matchBy?: keyof TEntity & string;
};

/** Bulk write options. */
export type BulkOptions = {
  /** Batch size for temp table loading (default: auto-calculated). */
  batchSize?: number;
  /** Per-statement timeout in ms. */
  timeoutMs?: number;
};

/** Upsert-specific. */
export type UpsertOptions = {
  /** Conflict target column for upsert (defaults to the @Key() column). */
  conflictTarget?: string;
};
```

### 3.2 Marker interfaces (already exist — no change)

```typescript
// types/entities.ts — ALREADY EXISTS, no change

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

Entities declare these via `implements`:
```typescript
@Entity("user_profiles")
@AuditTrail()
export class UserProfileEntity implements IAuditableEntity { ... }

@Entity("email_templates_communication_log")
export class EmailCommunicationLogEntity { ... }  // no marker = non-auditable
```

### 3.3 New method signatures — overload pattern

Each write method gets **two overloads**: one for `IAuditableEntity`
(actor required), one for non-auditable (actor rejected).

#### `update`

```typescript
// Overload 1: auditable entity → actor required
update<TEntity extends IAuditableEntity>(
  entity: EntityClass & { new (): TEntity },
  updates: Partial<Record<keyof TEntity & string, unknown>>,
  options: AuditableWriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity>;

// Overload 2: non-auditable entity → actor rejected
update<TEntity>(
  entity: EntityClass & { new (): TEntity },
  updates: Partial<Record<keyof TEntity & string, unknown>>,
  options: WriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity>;
```

**How it works at runtime:**
1. Read `options.matchBy` (defaults to the `@Key()` column's property name).
2. Extract the WHERE value from `updates[matchBy]`.
3. Remove `matchBy` from the SET clause (it's the WHERE key, not a SET column).
4. If `TEntity` is auditable (runtime check: `meta.isAuditable`), stamp
   `updated_at`, `updated_by` (from `options.actor`), `version + 1`.
5. Generate: `UPDATE <table> SET <set clauses> WHERE <matchBy column> = $N RETURNING *`

**Usage examples:**

```typescript
// Auditable entity — actor required, matchBy defaults to @Key() (id)
await dal.update(UserProfileEntity, {
  id: 42,                // ← WHERE id = 42
  is_active: false,      // ← SET is_active = false
}, { actor: "user-uuid-123" });

// Auditable entity — matchBy override
await dal.update(UserProfileEntity, {
  uuid: "abc-123",       // ← WHERE uuid = 'abc-123'
  is_active: false,      // ← SET is_active = false
}, { actor: "user-uuid-123", matchBy: "uuid" });

// Non-auditable entity — no actor, matchBy defaults to @Key() (id)
await dal.update(EmailCommunicationLogEntity, {
  id: 99,                // ← WHERE id = 99
  status: "delivered",   // ← SET status = 'delivered'
}, {});

// Non-auditable entity — matchBy override (the webhook case!)
await dal.update(EmailCommunicationLogEntity, {
  provider_message_id: "msg-123",  // ← WHERE provider_message_id = 'msg-123'
  status: "delivered",             // ← SET status = 'delivered'
  error_message: undefined,        // ← SET error_message = NULL
}, { matchBy: "provider_message_id" });

// ❌ COMPILE ERROR — actor not accepted for non-auditable entity
await dal.update(EmailCommunicationLogEntity, {
  id: 99, status: "delivered",
}, { actor: "emailsender" });
//    ^^^^^ TS2353: 'actor' does not exist in type 'WriteOptions & MatchByOptions<...>'

// ❌ COMPILE ERROR — actor required for auditable entity
await dal.update(UserProfileEntity, {
  id: 42, is_active: false,
}, {});
//    ^^ TS2741: Property 'actor' is missing in type '{}'
```

#### `delete` (soft delete)

```typescript
// Overload 1: auditable + deletable entity → actor required
delete<TEntity extends IAuditableEntity>(
  entity: EntityClass & { new (): TEntity },
  match: Partial<Pick<TEntity, keyof TEntity & string>>,
  options: AuditableWriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity>;

// Overload 2: deletable but non-auditable entity → actor rejected
delete<TEntity extends IDeletableEntity>(
  entity: EntityClass & { new (): TEntity },
  match: Partial<Pick<TEntity, keyof TEntity & string>>,
  options: WriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity>;
```

**Note:** `delete` takes a `match` object (just the WHERE key, no SET
columns). For `delete`, the only SET columns are `deleted_at`, `deleted_by`
(auto-stamped). The `match` object contains only the WHERE key value.

```typescript
// Soft-delete by id (default matchBy)
await dal.delete(UserProfileEntity, { id: 42 }, { actor: "admin-uuid" });

// Soft-delete by uuid
await dal.delete(UserProfileEntity, { uuid: "abc-123" }, { actor: "admin-uuid", matchBy: "uuid" });

// Soft-delete non-auditable entity
await dal.delete(EmailTemplateEntity, { id: 5 }, {});
```

**Runtime:**
1. Read `matchBy` (defaults to `@Key()`).
2. Extract WHERE value from `match[matchBy]`.
3. Stamp `deleted_at = NOW()`, `deleted_by = actor` (if auditable), `updated_at`, `updated_by`, `version + 1`.
4. Generate: `UPDATE <table> SET deleted_at = $1, ... WHERE <matchBy> = $N RETURNING *`

#### `restore`

Same pattern as `delete`, but sets `deleted_at = NULL`, `deleted_by = NULL`.

```typescript
restore<TEntity extends IAuditableEntity>(
  entity: EntityClass & { new (): TEntity },
  match: Partial<Pick<TEntity, keyof TEntity & string>>,
  options: AuditableWriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity>;

restore<TEntity extends IDeletableEntity>(
  entity: EntityClass & { new (): TEntity },
  match: Partial<Pick<TEntity, keyof TEntity & string>>,
  options: WriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity>;
```

#### `hardDelete`

```typescript
hardDelete<TEntity extends IAuditableEntity>(
  entity: EntityClass & { new (): TEntity },
  match: Partial<Pick<TEntity, keyof TEntity & string>>,
  options: AuditableWriteOptions & MatchByOptions<TEntity>,
): Promise<void>;

hardDelete<TEntity>(
  entity: EntityClass & { new (): TEntity },
  match: Partial<Pick<TEntity, keyof TEntity & string>>,
  options: WriteOptions & MatchByOptions<TEntity>,
): Promise<void>;
```

**Note:** `hardDelete` does a `DELETE FROM` (no SET clauses), so `actor`
is only used for the optional `AuditPort` delta log. For non-auditable
entities, `actor` is rejected but the `AuditPort` is also not available
(no audit columns to compute a delta against).

### 3.4 Bulk methods

#### `updateMany`

Current: `updates: Array<{ uuid: string } & Partial<...>>`
New: each row in the array carries its own match key.

```typescript
updateMany<TEntity extends IAuditableEntity>(
  entity: EntityClass & { new (): TEntity },
  updates: Array<Partial<Record<keyof TEntity & string, unknown>>>,
  options: AuditableWriteOptions & MatchByOptions<TEntity> & BulkOptions,
): Promise<TEntity[]>;

updateMany<TEntity>(
  entity: EntityClass & { new (): TEntity },
  updates: Array<Partial<Record<keyof TEntity & string, unknown>>>,
  options: WriteOptions & MatchByOptions<TEntity> & BulkOptions,
): Promise<TEntity[]>;
```

**How it works:**
- `matchBy` defaults to `@Key()` column.
- Each row in the `updates` array must contain the `matchBy` property.
- The TEMP TABLE strategy is preserved — the temp table includes the
  match column + all SET columns.
- The UPDATE FROM generates: `WHERE target.<matchBy> = tmp.<matchBy>`

```typescript
// Bulk update by id (default)
await dal.updateMany(UserProfileEntity, [
  { id: 1, is_active: false },
  { id: 2, is_active: false },
  { id: 3, is_active: true },
], { actor: "admin" });

// Bulk update by uuid
await dal.updateMany(UserProfileEntity, [
  { uuid: "aaa", is_active: false },
  { uuid: "bbb", is_active: false },
], { actor: "admin", matchBy: "uuid" });

// Bulk update non-auditable entity
await dal.updateMany(EmailCommunicationLogEntity, [
  { id: 10, status: "delivered" },
  { id: 11, status: "bounced" },
], {});
```

#### `deleteMany`

Current: `uuids: string[]`
New: `matches: Array<Partial<...>>` — each entry is a match object.

```typescript
deleteMany<TEntity extends IAuditableEntity>(
  entity: EntityClass & { new (): TEntity },
  matches: Array<Partial<Record<keyof TEntity & string, unknown>>>,
  options: AuditableWriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity[]>;

deleteMany<TEntity extends IDeletableEntity>(
  entity: EntityClass & { new (): TEntity },
  matches: Array<Partial<Record<keyof TEntity & string, unknown>>>,
  options: WriteOptions & MatchByOptions<TEntity>,
): Promise<TEntity[]>;
```

```typescript
// Bulk soft-delete by id
await dal.deleteMany(UserProfileEntity, [
  { id: 1 }, { id: 2 }, { id: 3 },
], { actor: "admin" });

// Bulk soft-delete by uuid
await dal.deleteMany(UserProfileEntity, [
  { uuid: "aaa" }, { uuid: "bbb" },
], { actor: "admin", matchBy: "uuid" });
```

**Runtime:** Extract the `matchBy` value from each match object, build
`ANY($N::type[])` array. Type is derived from the column's `pgType`.

### 3.5 `add` and `upsert` — actor enforcement only

`add` and `upsert` don't have a WHERE clause (they're INSERTs), so they
don't need `matchBy`. But they still need the `actor` overload:

```typescript
// add — auditable
add<TEntity extends IAuditableEntity>(
  entity: EntityClass & { new (): TEntity },
  row: Partial<Record<keyof TEntity & string, unknown>>,
  options: AuditableWriteOptions,
): Promise<TEntity>;

// add — non-auditable
add<TEntity>(
  entity: EntityClass & { new (): TEntity },
  row: Partial<Record<keyof TEntity & string, unknown>>,
  options: WriteOptions,
): Promise<TEntity>;
```

Same for `upsert`, `addMany`, `upsertMany`.

### 3.6 `findUuidColumn` — removed

The function `findUuidColumn` is removed entirely. It was used by
`update`, `delete`, `restore`, `hardDelete`, `updateMany`, `deleteMany`
to find the WHERE column. Now `findPkColumn` + `matchBy` replaces it.

The `findPkColumn` function (already exists, line 88) finds the `@Key()`
column. If the entity has no `@Key()`, the DAL throws a clear error:
`Entity ... has no @Key() column — specify matchBy explicitly`.

### 3.7 `upsert` conflictTarget — defaults to @Key() column

Currently `conflictTarget` defaults to `"uuid"` (line 372). Change to
default to the `@Key()` column's SQL name. The dev can still override:

```typescript
await dal.upsert(UserProfileEntity, {
  uuid: "abc-123",
  email: "user@example.com",
  is_active: true,
}, { actor: "system", conflictTarget: "uuid" });
```

---

## 4. Internal implementation changes

### 4.1 `resolveMatchColumn` — new helper

Replaces `findUuidColumn` in all write methods:

```typescript
/**
 * Resolve which column to use as the WHERE left operand.
 * Priority: options.matchBy → @Key() column → throw.
 */
function resolveMatchColumn<TEntity>(
  entity: EntityClass,
  meta: EntityPersistenceMeta,
  matchBy: string | undefined,
): { sqlName: string; propertyKey: string } {
  if (matchBy) {
    const sqlName = getColumnName(entity, matchBy);
    const colMeta = meta.columns[sqlName];
    if (!colMeta) {
      throw new UnknownColumnError(`matchBy: unknown column/property ${matchBy}`);
    }
    return { sqlName, propertyKey: matchBy };
  }

  // Default: @Key() column
  const pk = findPkColumn(meta);
  if (!pk) {
    throw new Error(
      `Entity ${meta.entityClassName} has no @Key() column — ` +
      `specify matchBy to choose the WHERE column`
    );
  }
  return pk;
}
```

### 4.2 `extractMatchValue` — new helper

Extracts the WHERE value from the updates/match object and removes it
from the SET clause (for `update`):

```typescript
/**
 * Extract the WHERE value from the updates object.
 * For update: removes the key from the SET clause.
 * Returns { matchValue, remainingUpdates }.
 */
function extractMatchValue<TEntity>(
  updates: Record<string, unknown>,
  matchPropertyKey: string,
): { matchValue: unknown; remainingUpdates: Record<string, unknown> } {
  const matchValue = updates[matchPropertyKey];
  if (matchValue === undefined) {
    throw new ValidationError(
      `update: missing match value — property '${matchPropertyKey}' ` +
      `must be present in the updates object`
    );
  }
  const remainingUpdates = { ...updates };
  delete remainingUpdates[matchPropertyKey];
  return { matchValue, remainingUpdates };
}
```

### 4.3 `isAuditableEntity` — runtime check (for internal logic only)

The overloads handle compile-time enforcement. Internally, the DAL still
needs to know whether to stamp audit columns:

```typescript
function isAuditableEntity(meta: EntityPersistenceMeta): boolean {
  return meta.isAuditable || Object.values(meta.columns).some((c) => c.isAuditable);
}
```

This already exists inline in every method. We just centralize it.

### 4.4 Audit stamping — conditional on `actor` presence

Inside each write method, audit stamping only happens if `isAuditableEntity(meta)`
returns true AND `options.actor` is present:

```typescript
const actor = (options as AuditableWriteOptions).actor;
if (isAuditableEntity(meta) && actor !== undefined) {
  // stamp updated_at, updated_by, version
}
```

At compile time, the overloads guarantee that `actor` is present when
the entity is auditable. At runtime, this is a safety net.

---

## 5. Impact on existing callers

### 5.1 DAL tests — 32 call sites (breaking change)

Every `update`, `delete`, `restore`, `hardDelete`, `updateMany`,
`deleteMany` call in the test suite needs migration:

**Before:**
```typescript
await repo.update(SimpleTestEntity, inserted.uuid, { name: "updated" }, { actor: "test-user" });
await repo.delete(SimpleTestEntity, a.uuid, { actor: "test-user" });
await repo.hardDelete(SimpleTestEntity, inserted.uuid, { actor: "test-user" });
```

**After:**
```typescript
await repo.update(SimpleTestEntity, { uuid: inserted.uuid, name: "updated" }, { actor: "test-user" });
await repo.delete(SimpleTestEntity, { uuid: a.uuid }, { actor: "test-user" });
await repo.hardDelete(SimpleTestEntity, { uuid: inserted.uuid }, { actor: "test-user" });
```

### 5.2 BE — 1 call site

**Before:**
```typescript
// somewhere in primebrick-be-v3/src
await dal.update(SomeEntity, uuid, { field: value }, { actor: "..." });
```

**After:**
```typescript
await dal.update(SomeEntity, { uuid, field: value }, { actor: "..." });
```

### 5.3 US emailsender — 0 call sites (currently uses rawSql)

After the DAL redesign, emailsender's `rawSql` calls are replaced:

**webhook-service.ts — Before:**
```typescript
await dal.rawSql(
  `UPDATE emailsender.email_templates_communication_log
   SET status = $1, status_changed_at = NOW(), error_message = $2
   WHERE provider_message_id = $3`,
  [status, errorMessage, providerMessageId]
);
```

**webhook-service.ts — After:**
```typescript
await dal.update(
  EmailCommunicationLogEntity,
  {
    provider_message_id: providerMessageId,
    status,
    status_changed_at: new Date(),
    error_message: errorMessage,
  },
  { matchBy: "provider_message_id" }
);
```

**service-registration.ts — Before (4 rawSql calls):**
```typescript
const existingRows = await dal.rawSql<{ code: string }>(
  "SELECT * FROM public.service_registry WHERE code = $1",
  [this.serviceCode]
);
```

**service-registration.ts — After:**
Requires a `ServiceRegistryEntity`. This entity lives in the `public`
schema and is shared across microservices. It should be created in a
shared location. For now, we create it in the emailsender (the only
consumer today) with a note that it should move to a shared package.

```typescript
@Entity("service_registry", "public")  // ← schema override if supported
export class ServiceRegistryEntity implements IAuditableEntity {
  @Key() id!: number;
  @Unique() uuid!: string;
  @Column({ length: 50, nullable: false }) code!: string;
  @Column({ length: 255, nullable: false }) base_url!: string;
  @Column({ pgType: "jsonb", nullable: false }) endpoints!: object;
  @AuditableField(AuditableFieldType.CREATED_AT) created_at!: Date;
  @AuditableField(AuditableFieldType.CREATED_BY) created_by!: string;
  @AuditableField(AuditableFieldType.UPDATED_AT) updated_at!: Date;
  @AuditableField(AuditableFieldType.UPDATED_BY) updated_by!: string;
  @AuditableField(AuditableFieldType.VERSION) version!: number;
}
```

Then:
```typescript
// register() — find by code
const existing = await dal.find(ServiceRegistryEntity, null, {
  filters: [Filter.fieldValue(field(ServiceRegistryEntity, "code"), "=", this.serviceCode)],
});

// register() — insert new
await dal.add(ServiceRegistryEntity, {
  code: this.serviceCode,
  base_url: this.baseUrl,
  endpoints: this.endpoints,
}, { actor: "system" });

// register() — update existing
await dal.update(ServiceRegistryEntity, {
  code: this.serviceCode,
  base_url: this.baseUrl,
  endpoints: this.endpoints,
}, { actor: "system", matchBy: "code" });

// updateHeartbeat()
await dal.update(ServiceRegistryEntity, {
  code: this.serviceCode,
}, { actor: "system", matchBy: "code" });
```

**NOTE:** The `@Entity` decorator currently takes only a table name. If
it doesn't support a schema override, we need to check. The entity meta
has `tableSchema` (defaulting to the Dal's `schema` config). For
`public.service_registry`, the schema is `public`, not `emailsender`.
This may require a decorator change: `@Entity("service_registry", "public")`
or `@Entity({ table: "service_registry", schema: "public" })`.

### 5.4 `@Entity` schema support — check required

Let me check if `@Entity` already supports a schema parameter:

**TODO (during implementation):** Verify `@Entity` signature. If it only
takes a table name, add an optional schema parameter. This is needed for
`ServiceRegistryEntity` (table in `public` schema, not `emailsender`).

---

## 6. Implementation steps

### Phase 1: DAL library changes

#### Step 1: Update types (`src/types/types.ts`)
- Split `WriteOptions` → base `WriteOptions` (no actor) + `AuditableWriteOptions` (actor required)
- Add `MatchByOptions<TEntity>`, `BulkOptions`, `UpsertOptions`
- Remove `actor` from base `WriteOptions`
- Remove `conflictTarget` from `BulkOptions` (move to `UpsertOptions`)

#### Step 2: Add `resolveMatchColumn` + `extractMatchValue` helpers (`src/repository/repository.ts`)
- Replace `findUuidColumn` usage with `resolveMatchColumn`
- Add `extractMatchValue` for `update` (separates WHERE key from SET columns)

#### Step 3: Redesign `update` method
- Remove `uuid: string` parameter
- Add overloads (auditable / non-auditable)
- Use `resolveMatchColumn` + `extractMatchValue`
- Keep audit stamping logic, conditional on `isAuditableEntity(meta)` + `options.actor`

#### Step 4: Redesign `delete` method
- Remove `uuid: string` parameter
- Add `match` parameter (WHERE key only, no SET columns)
- Add overloads (auditable+deletable / deletable-only)
- Use `resolveMatchColumn`

#### Step 5: Redesign `restore` method
- Same pattern as `delete`

#### Step 6: Redesign `hardDelete` method
- Remove `uuid: string` parameter
- Add `match` parameter
- Add overloads (auditable / non-auditable)

#### Step 7: Redesign `updateMany` method
- Remove `{ uuid: string } &` from the updates array type
- Each row carries the matchBy property
- Add overloads
- TEMP TABLE strategy: include match column in temp table, join on it

#### Step 8: Redesign `deleteMany` method
- Replace `uuids: string[]` with `matches: Array<Partial<...>>`
- Extract matchBy values, build `ANY($N::type[])`
- Add overloads

#### Step 9: Update `add`, `upsert`, `addMany`, `upsertMany` — actor overloads only
- No `matchBy` (these are INSERTs)
- Add auditable / non-auditable overloads
- `upsert` conflictTarget defaults to `@Key()` column

#### Step 10: Update Dal gateway (`src/dal/dal.ts`)
- Mirror the new overloads for every delegate method
- Remove `uuid` parameters from delegates

#### Step 11: Check `@Entity` schema support
- If `@Entity` doesn't support a schema parameter, add it
- Needed for `ServiceRegistryEntity` (public schema)

#### Step 12: Remove `findUuidColumn` function
- No longer used by any method
- Clean up

#### Step 13: Update DAL tests (`test/`)
- Migrate all 32 call sites to the new signatures
- Add new tests:
  - `update` with `matchBy` on non-uuid column
  - `update` on non-auditable entity (no actor)
  - `delete` with `matchBy`
  - `hardDelete` with `matchBy`
  - `updateMany` with `matchBy`
  - `deleteMany` with `matchBy`
  - Compile-time tests: verify that `actor` is rejected for non-auditable entities (using `// @ts-expect-error`)
  - Compile-time tests: verify that `actor` is required for auditable entities

#### Step 14: Build + test DAL
```bash
cd primebrick-dal-v3
pnpm run build
pnpm test
```

### Phase 2: emailsender — eliminate rawSql

#### Step 15: Create `ServiceRegistryEntity`
- New file: `emailsender/src/domain/entities/service_registry_entity.ts`
- Implements `IAuditableEntity`
- `@Entity("service_registry", "public")` (or with schema config)
- Register in `registry.ts`

#### Step 16: Refactor `webhook-service.ts`
- Replace `dal.rawSql` with `dal.update` + `matchBy: "provider_message_id"`
- Remove `getDal` import if no longer needed (keep if other calls remain)

#### Step 17: Refactor `service-registration.ts`
- Replace all 4 `dal.rawSql` calls with `dal.find` / `dal.add` / `dal.update`
- Use `ServiceRegistryEntity`

#### Step 18: Verify zero `rawSql` in emailsender
```bash
grep -r "rawSql" emailsender/src/
# Expected: 0 matches
```

#### Step 19: Build + test emailsender
```bash
cd primebrick-us-v3/emailsender
pnpm run build
pnpm test
```

### Phase 3: BE migration

#### Step 20: Migrate the 1 BE call site
- Find and update the single `dal.update` / `dal.delete` call in BE
- Build + verify

---

## 7. Acceptance criteria

### DAL library
1. `pnpm run build` exits 0
2. `pnpm test` exits 0 (all existing tests migrated + new tests pass)
3. `findUuidColumn` function is removed (grep returns 0 matches in `src/`)
4. No write method has a `uuid: string` parameter (grep for `uuid: string` in method signatures returns 0)
5. `update`, `delete`, `restore`, `hardDelete` accept `matchBy` option
6. `updateMany`, `deleteMany` accept `matchBy` option
7. `actor` is compile-time required for `IAuditableEntity` entities
8. `actor` is compile-time rejected for non-`IAuditableEntity` entities
9. `matchBy` only accepts `keyof TEntity & string` (TypeScript guardrail)
10. `upsert` conflictTarget defaults to `@Key()` column, not `"uuid"`
11. Entities without uuid column can use `update`/`delete`/etc. via `matchBy`
12. `@ts-expect-error` tests confirm compile-time enforcement

### emailsender
13. `pnpm run build` exits 0
14. `pnpm test` exits 0
15. `grep -r "rawSql" emailsender/src/` returns 0 matches
16. `ServiceRegistryEntity` created and registered
17. `webhook-service.ts` uses `dal.update` with `matchBy: "provider_message_id"`
18. `service-registration.ts` uses `dal.find` / `dal.add` / `dal.update` (no rawSql)

### BE
19. `pnpm run build` exits 0
20. The 1 call site is migrated to the new signature

---

## 8. What is NOT in scope

- **Test strategy for emailsender** — that's a separate plan
  (`us-emailsender-test-strategy-plan.md`). This plan only covers the DAL
  redesign + rawSql elimination.
- **Moving `ServiceRegistryEntity` to a shared package** — for now it
  lives in emailsender. When a second microservice needs it, we extract
  it to `@primebrick/shared-entities` or similar. Out of scope here.
- **`find` / `findAll` / `findByPage` changes** — read methods already
  support `filters` and don't have the uuid problem. No change needed.
- **`findById` / `findByUUID`** — these are convenience finders that
  take an id/uuid directly. They're fine as-is — they're READ methods
  and the caller explicitly chooses which key to use.

---

## 9. Test count impact

| Category | Current | New | Delta |
|----------|---------|-----|-------|
| Existing DAL tests (migrated) | 32 call sites | 32 (same, new signatures) | 0 |
| New: matchBy on update | 0 | 4 | +4 |
| New: matchBy on delete | 0 | 2 | +2 |
| New: matchBy on hardDelete | 0 | 2 | +2 |
| New: matchBy on updateMany | 0 | 2 | +2 |
| New: matchBy on deleteMany | 0 | 2 | +2 |
| New: non-auditable entity update (no actor) | 0 | 3 | +3 |
| New: @ts-expect-error compile-time tests | 0 | 4 | +4 |
| **Total new tests** | | | **+19** |

---

## 10. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Overload resolution picks wrong overload | Low | High — wrong actor behavior | Test with `@ts-expect-error` for both directions |
| `matchBy` value missing from `updates` object | Medium | Medium — runtime error | `extractMatchValue` throws clear `ValidationError` |
| `@Entity` doesn't support schema parameter | Medium | High — `ServiceRegistryEntity` can't work | Step 11 checks and adds if needed |
| BE call site migration breaks | Low | Low — only 1 call site | Build + verify |
| `updateMany` TEMP TABLE strategy breaks with non-uuid match | Medium | High | Test with `@Key()` (bigint) + `@Unique` (varchar) match columns |
| TypeScript can't resolve overloads for abstract class types | Low | High | Test with real entity classes, not mock types |
