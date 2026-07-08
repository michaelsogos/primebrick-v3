# Plan: BE Adoption of @primebrick/dal-pg + @primebrick/sdk — Migration with Zero Logic Loss

**Version:** 0.3.0
**Status:** IN PROGRESS — Prerequisite bigint serialization phases COMPLETED. DAL adoption phases (0-5) PENDING. Empirical review COMPLETED (all claims verified against codebase).
**Date:** 2026-07-08 (original) / 2026-07-10 (updated) / 2026-07-10 (empirical review)
**Scope:** `primebrick-be-v3` (consumes `@primebrick/dal-pg` and `@primebrick/sdk`), with prerequisite work in `primebrick-dal-v3`, `primebrick-v3-sdk`, `primebrick-fe-v3`, `primebrick-us-v3`

---

## 1. Objective

Migrate the Primebrick v3 Backend (`primebrick-be-v3`) from its embedded DAL (`src/db/repository/repository.ts` + `src/db/repository/query-builder.ts` + `src/db/repository/dsl.ts` + `src/domain/entities/entity-decorators.ts` + `src/domain/entities/column-pg-io.ts`) to the shared `@primebrick/dal-pg` library, and adopt `@primebrick/sdk` infrastructure modules where applicable.

> **PREREQUISITE COMPLETED (2026-07-10):** Native bigint end-to-end serialization has been adopted across all 5 packages (SDK, DAL-pg, BE, FE, US). The `::text` cast has been removed, entity `id` fields are now `bigint`, `json-bigint` handles serialization via `extJsonMiddleware` (BE Express), `extJsonParse` (FE), and `NatsClient.publish/subscribe` (US NATS). See §8 for the completed migration details. This was originally planned as Section 8 "Type parser migration" with a recommendation to override INT8 to `number` — that recommendation was REJECTED in favor of full native bigint adoption.

**The #1 rule of this migration: ZERO LOGIC LOSS.** Every behavior of the old Repository — audit field stamping, pkey identity magic, soft-delete filtering, projection aliasing, auditable joins with display_name, version auto-increment, clone field handling, delta calculation with forced fields, fire-and-forget audit, NotFoundError with RFC 7807 instance paths — must be preserved or explicitly documented as intentionally changed.

This plan includes:
1. **Gap analysis** — what the new DAL lacks vs. the old BE Repository (empirically verified)
2. **Deep raw SQL analysis** — every raw SQL statement in BE catalogued, analyzed, and assigned a migration verdict (replace with typed DAL method vs. keep as rawSql with justification)
3. **Prerequisite DAL-pg enhancements** — `clone()`, audit-on-all-writes, tests for `Project.expr` projection, `AuditLogEntity` + `tableName` override + `buildAuditTrailJoins()`
4. **BE-side adapter implementation** — AuditPort adapter, Dal gateway, typed audit query helper
5. **Entity migration** — 3 main entities (Customer, Organization, UserProfile) + their DAL classes
6. **Extensive unit + integration test suite** — for the 3 main entities, covering every behavior

---

## 2. Empirical findings — old BE Repository vs. new @primebrick/dal-pg

### 2.1 Method-by-method comparison

| Feature | BE old Repository | @primebrick/dal-pg | Gap? |
|---------|-------------------|---------------------|------|
| **Constructor** | `new Repository(pool, auditService?)` per-request | `Dal` gateway singleton owns pool; `Repository(dal.getPool())` or `dal.withClient()` | Different pattern — DAL-pg is better (pool ownership) |
| **rawSql** | `(text, values?) → TResult[]` | Identical | No gap |
| **count** | `COUNT(*)::text`, NO soft-delete filter | `COUNT(*) AS n` (no `::text` cast), returns `bigint`, NO soft-delete filter | **COMPLETED**: `::text` cast removed in both DAL-pg and BE. `count()` now returns `bigint`. BE `seedIfEmpty()` uses `count > 0n`. |
| **insertMany** | `void`, RETURNING `pk, uuid` only (internal for audit), NO auto-stamp audit fields (relies on DB DEFAULTs), identity PK auto-excluded | `add() → TEntity` (RETURNING *), auto-stamps created_at/created_by/updated_at/updated_by, identity PK auto-excluded, writes audit (INSERT) | **Behavioral difference**: DAL-pg auto-stamps audit fields; BE relied on DB DEFAULTs + caller-provided values. DAL-pg is better but BE callers that explicitly set `created_by` via `requireActor()` need to be verified for compatibility. |
| **findById** | `(entity, id, options?) → TResult \| null`, `throwExceptionIfNullOrMany` default true, `id: number \| string` | `(entity, id, options?) → TResult \| null`, `throwIfNotFound` default true, throws `NotFoundError` + `MultipleRowsError`, `id: bigint \| string` | **COMPLETED**: `findById` signature in both DAL-pg and BE updated to accept `bigint \| string`. |
| **findByUUID** | Does NOT exist in BE | Exists in DAL-pg | New feature (BE used `find()` with uuid filter) |
| **find** | `(entity, fields?, options?) → TResult \| null`, no throw, `LIMIT 1` | `(entity, fields?, options?) → TResult \| null`, `throwIfNotFound` default true (but can be false), `LIMIT 1` | **Behavioral difference**: BE's `find` never throws (returns null); DAL-pg's `find` throws by default. BE callers that rely on null-return must pass `{ throwIfNotFound: false }` OR use `findByUUID`. |
| **findAll** | `(entity, fields?, options?) → TResult[]`, no streaming | `(entity, fields?, options?) → TResult[] \| AsyncIterable`, supports `stream: true` | DAL-pg is better (streaming). No gap. |
| **findByPage** | Window function `COUNT(*) OVER()`, 1-based pagination, strips `_total_records` | Identical | No gap |
| **update** | `(entity, uuid, updates, updatedBy) → void`, RETURNING `pk, version`, auto-stamps updated_at/updated_by/version+1, validates columns, audit (UPDATE with delta + forced fields) | `(entity, updates, options) → TEntity`, `matchBy` option (defaults to PK), RETURNING *, auto-stamps, audit NOT written | **3 gaps**: (1) BE uses UUID as match key; DAL-pg defaults to PK → must pass `matchBy: "uuid"`. (2) DAL-pg returns full row (better). (3) **DAL-pg does NOT write audit for update** — CRITICAL gap. |
| **delete (soft)** | `(entity, uuid, deletedBy) → void`, sets deleted_at/deleted_by/updated_at/updated_by/version+1, audit (SOFT_DELETE with delta) | `(entity, match, options) → TEntity`, `matchBy` option, RETURNING *, audit NOT written | **2 gaps**: (1) matchBy. (2) **No audit for soft delete** — CRITICAL. |
| **restore** | `(entity, uuid, restoredBy) → void`, clears deleted_at/deleted_by, sets updated_at/updated_by/version+1, audit (RESTORE with delta) | `(entity, match, options) → TEntity`, RETURNING *, audit NOT written | **2 gaps**: (1) matchBy. (2) **No audit for restore** — CRITICAL. |
| **hardDelete** | `(entity, uuid, deletedBy) → void`, physical DELETE, fetches old record for audit (HARD_DELETE with delta), version = old.version + 1 in JS | `(entity, match, options) → void`, physical DELETE, audit NOT written | **2 gaps**: (1) matchBy. (2) **No audit for hard delete** — CRITICAL. |
| **clone** | `(entity, sourceUuid, clonedBy) → string (new UUID)`, resets audit fields (created_at=now, created_by=clonedBy, version=1), resets deletable fields (deleted_at=null, deleted_by=null), skips PK + unique columns, sets @CloneField to sourceUuid, generates new UUID via crypto.randomUUID(), NO audit | **DOES NOT EXIST** | **CRITICAL gap** — must implement `clone()` in DAL-pg. |
| **Bulk insert** | `insertMany` (single INSERT, void) | `addMany` (batched, RETURNING *, auto batch size) | DAL-pg is better. No gap. |
| **Bulk update** | Does NOT exist | `updateMany` (TEMP TABLE strategy, atomic) | New feature. No gap. |
| **Bulk delete** | Does NOT exist (BE loops `delete()`) | `deleteMany` (ANY($array::type[])) | New feature. No gap. |
| **Bulk upsert** | Does NOT exist | `upsertMany` (batched ON CONFLICT) | New feature. No gap. |
| **upsert** | Does NOT exist | `upsert()` (ON CONFLICT DO UPDATE, RETURNING *) | New feature. No gap. |
| **Streaming** | Does NOT exist | `findAll(stream: true)` via pg-query-stream | New feature. No gap. |
| **Type parsers** | None (bigint as string by pg default) | INT8 → native bigint, NUMERIC → number/string | **COMPLETED**: BE now registers INT8 type parser in `src/db/pool.ts` (`types.setTypeParser(types.builtins.INT8, (val: string) => BigInt(val))`). All entity `id` fields changed from `number` to `bigint`. JSON serialization handled by `extJsonMiddleware` from `@primebrick/sdk`. |
| **Schema qualification** | No schema prefix (assumes `public`) | Full schema qualification (`"schema"."table"`) | DAL-pg is better. No gap. |
| **Auditable joins** | `buildAuditableJoins(entity)` hardcodes `UserProfileEntity` | `buildAuditableJoins(entity, userEntity)` accepts user entity as param | DAL-pg is better (leaf dependency). BE must pass its own `UserProfileEntity`. |
| **Delta calculator** | `calculateDelta(old, new)` + `calculateDeltaWithForcedFields(old, new, forceFields)` | DAL-pg's audit port receives delta but DAL-pg does NOT calculate delta for update/delete/restore/hardDelete (only for add) | **CRITICAL gap** — DAL-pg must calculate delta for all write ops, or the BE AuditPort adapter must do it. |

### 2.2 Critical gaps summary (MUST fix before migration)

| # | Gap | Impact | Fix location |
|---|-----|--------|--------------|
| G1 | **`clone()` method missing in DAL-pg** | BE's `CustomersDal.duplicateCustomer()` uses `repo.clone()` — would break | `primebrick-dal-v3` |
| G2 | **Audit NOT written for update/delete/restore/hardDelete in DAL-pg** | BE audits ALL write ops; losing audit trail is unacceptable | `primebrick-dal-v3` |
| G3 | **Delta NOT calculated for update/delete/restore/hardDelete in DAL-pg** | BE's audit trail includes old/new field deltas; DAL-pg only calculates delta for `add()` | `primebrick-dal-v3` |
| G4 | **`find()` throws by default in DAL-pg, BE's `find()` never throws** | BE callers that expect null-return will get NotFoundError | `primebrick-be-v3` (pass `throwIfNotFound: false`) |
| G5 | ~~**Type parser change: INT8 → bigint (was string)**~~ | ~~BE consumers comparing `id` as string will break~~ | **RESOLVED** — All entity `id` fields changed to `bigint` in BE, DAL-pg, US. FE uses `extJsonParse` for bigint deserialization. `extJsonMiddleware` handles BE HTTP response serialization. |
| G6 | **BE's `insertMany` does NOT auto-stamp audit fields; DAL-pg's `add()` does** | Double-stamping if BE callers also set created_by/updated_by | `primebrick-be-v3` (remove explicit audit field setting from callers) |

### 2.3 Non-critical differences (acceptable behavioral changes)

| # | Difference | Old behavior | New behavior | Acceptable? |
|---|-----------|--------------|--------------|-------------|
| D1 | Write methods return full row | `void` (BE callers didn't use return) | `TEntity` (RETURNING *) | Yes — callers can ignore return |
| D2 | `update`/`delete`/`restore` use `matchBy` | Hardcoded UUID lookup | `matchBy` option (pass `"uuid"`) | Yes — explicit is better |
| D3 | Pool ownership | BE manages `getPool()` | Dal gateway owns pool | Yes — better defaults |
| D4 | Schema qualification | No schema prefix | Full `"public"."table"` | Yes — more explicit |
| D5 | `count()` doesn't filter soft-deleted | Same in both | Same in both | Yes — consistent (could enhance later) |

---

## 2.4 Completed prerequisite work — Native bigint serialization (2026-07-10)

> **Status: COMPLETED** — All 5 phases verified empirically. Builds pass, tests pass, FE svelte-check passes.

The following work was completed as a prerequisite to the DAL adoption migration. It eliminated the `::text` cast, adopted native `bigint` end-to-end, and installed `json-bigint` serialization across the entire stack.

### Phase 1 (COMPLETED) — SDK (`primebrick-v3-sdk`)

| File | Change | Empirical evidence |
|------|--------|-------------------|
| `package.json` | Added `json-bigint@^1.0.0`, `@types/json-bigint@^1.0.4`, `@types/express@^5.0.6` (devDep). Added `./json` subpath export. | `dependencies.json-bigint: ^1.0.0`, `devDependencies.@types/express: ^5.0.6`, `exports["./json"]` |
| `src/json/ext-json.ts` | New — `extJsonStringify()`, `extJsonParse()` with reviver (all integers → `bigint`, floats → `number`), `extJsonMiddleware()` using Express `Request`/`Response`/`NextFunction` types, handles `undefined` → `"null"` | Lines 22-23: `import JSONBig`, `import type { Request, Response, NextFunction } from "express"`. Line 54: reviver `if (typeof value === "number" && Number.isInteger(value)) return BigInt(value)`. Line 75: `if (data === undefined) { res.send("null"); return res; }` |
| `src/nats/nats-client.ts` | Extended with `publish()` (extJsonStringify), `subscribe()` (extJsonParse, handles empty `msg.data` → null), `subscribeRequest()` (request-reply, includes `requestId` in error response) | `publish`: encodes `extJsonStringify(data)` as Uint8Array. `subscribe`: `if (text === "") { await handler(null as T, msg); continue; }`. `subscribeRequest`: `requestId = (request as { requestId?: string })?.requestId` included in error response |
| `src/http/http-server.ts` | Replaced `JSON.stringify` with `extJsonStringify` (2 call sites) | Line 3: `import { extJsonStringify }`, lines 28, 31: `res.end(extJsonStringify(...))` |
| `src/nats/__tests__/nats-client.test.ts` | 11 tests (was 5) — added tests for `publish()`, `subscribe()`, `subscribeRequest()`, empty data, requestId in error | `describe("NatsClient.publish")`, `describe("NatsClient.subscribe")`, `describe("NatsClient.subscribeRequest")` |
| `src/http/__tests__/http-server.test.ts` | Updated to use `extJsonParse` instead of `JSON.parse` (2 call sites) | Line 4: `import { extJsonParse }`, lines 35, 63: `extJsonParse(body)` |
| `src/json/__tests__/ext-json.test.ts` | 17 tests for ext-json module | — |

**Verification:** `pnpm run build` passes. `pnpm test` = 68/68 pass (was 62, +6 new NatsClient tests).

### Phase 2 (COMPLETED) — DAL-pg (`primebrick-dal-v3`)

| File | Change | Empirical evidence |
|------|--------|-------------------|
| `src/repository/repository.ts` | `count()` returns `bigint` (was `number`), removed `::text` cast. `findById()` signature: `id: bigint \| string` (was `number \| string`). Audit cast: `as bigint` (was `as number`) | `count`: `Promise<bigint>`, query `SELECT COUNT(*) AS n` (no `::text`). `findById`: `id: bigint \| string`. Line 400: `as bigint` |
| `src/dal/dal.ts` | `findById()` signature: `id: bigint \| string` | Line 221: `id: bigint \| string` |
| `src/types/types.ts` | `PaginatedEntity.total_records: bigint` (was `number`). `AuditParams.entityId: bigint` (was `number`) | Line 41: `total_records: bigint`. Line 94: `entityId: bigint` |
| `test/entities/simple-test-entity.ts` | `id!: bigint` (was `number`) | Line 23 |
| `test/entities/bench-simple.entity.ts` | `id!: bigint` (was `number`) | Line 23 |
| `test/entities/type-test-entity.ts` | `id!: bigint` (was `number`) | Line 34 |
| `test/repository-crud.test.ts` | `toBeGreaterThan(0n)` (was `0`) | Line 40 |
| `test/repository-bulk.test.ts` | `toBeGreaterThan(0n)` (was `0`) | Line 41 |
| `test/dal.test.ts` | `inserted.id as unknown as bigint` (was `as number`) | Line 213 |

**Verification:** `pnpm run build` passes. `pnpm test` = 125/125 pass.

### Phase 3 (COMPLETED) — BE (`primebrick-be-v3`)

| File | Change | Empirical evidence |
|------|--------|-------------------|
| `package.json` | Added `@primebrick/sdk: workspace:*` dependency | Line 21: `"@primebrick/sdk": "workspace:*"` |
| `src/index.ts` | Added `extJsonMiddleware` import and `app.use(extJsonMiddleware())` | Line 4: `import { extJsonMiddleware } from "@primebrick/sdk"`. Line 30: `app.use(extJsonMiddleware())` |
| `src/db/pool.ts` | Registered INT8 type parser: `types.setTypeParser(types.builtins.INT8, (val) => BigInt(val))` | Lines 6-11 |
| `src/db/repository/repository.ts` | `count()` returns `bigint`, removed `::text` cast. `findById()`: `id: bigint \| string`. `findByPage()`: `total_records` as `bigint`. All 6 audit casts: `as bigint` (was `as number`). `hardDelete` variable: `bigint \| null` (was `number \| null`) | `count`: `Promise<bigint>`, `r.rows?.[0]?.n ?? 0n`. `findById`: `id: bigint \| string`. Line 96: `as bigint`. Line 265: `as bigint`. Line 337: `as bigint`. Line 542: `as bigint`. Line 593: `bigint \| null`. Line 599: `as bigint` |
| `src/lib/audit/audit-service.ts` | `entityId: bigint` (was `number`) | Line 11: `entityId: bigint` |
| `src/modules/auth/auth_configuration_entity.ts` | `id: bigint` (was `number`) | Line 31 |
| `src/modules/auth/organization_entity.ts` | `id: bigint` (was `number`) | Line 36 |
| `src/modules/auth/user_profile_entity.ts` | `id: bigint` (was `number`) | Line 41 |
| `src/modules/auth/role_mapping_entity.ts` | `id!: bigint` (was `number`) | Line 20 |
| `src/modules/system/service_registry_entity.ts` | `id: bigint` (was `number`) | Line 14 |
| `src/modules/customers/customer_entity.ts` | `id: bigint` (was `number`) | Line 30 |
| `src/modules/auth/role-mapping-repo.ts` | `idp_role` type updated | — |
| `src/modules/auth/organizations_dal.ts` | `OrganizationListResponse.total: bigint`. `getUserCountForOrganization`: `Number(result.rows[0].count)`. `getOrganizationAudit`: `Number(countResult.rows[0].total)` | Line 61: `total: bigint`. Line 253: `Number(...)`. Line 294: `Number(...)` |
| `src/modules/auth/user-profiles-dal.ts` | `UserListResponse.total: bigint`. `getUserProfileAudit`: `Number(countResult.rows[0].total)` | Line 64: `total: bigint`. Line 212: `Number(...)` |
| `src/modules/auth/user-profile-repo.ts` | `pool.query<{ uuid: string; id: bigint }>` (was `id: number`) | Line 106 |
| `src/modules/customers/customers_dal.ts` | `seedIfEmpty`: `count > 0n` (was `count > 0`). `getCustomerAudit`: `Number(countResult.rows[0].total)`. `CustomerListResponse.total: bigint` | Line 216-218: `0n`. Line 867: `Number(...)`. `total: bigint` |
| `src/modules/customers/customers_repo.ts` | `makeCode(id: bigint \| number)` (was `id: number`) | Line 54 |
| `src/modules/customers/customers.service.ts` | Debug toggle `total: 0n` (was `0`) | Line 76 |
| `src/modules/customers/dto.ts` | `CustomerAuditResponse.pagination.total: number` (unchanged — audit total uses `Number()`) | — |

**Verification:** `pnpm run build` passes.

### Phase 4 (COMPLETED) — FE (`primebrick-fe-v3`)

| File | Change | Empirical evidence |
|------|--------|-------------------|
| `package.json` | Added `json-bigint@^1.0.0`, `@types/json-bigint@^1.0.4` | `dependencies.json-bigint`, `devDependencies.@types/json-bigint` |
| `src/lib/api-ext.ts` | New — standalone FE `extJsonParse()` (does NOT depend on SDK), `apiFetchExt()`, `apiFetchExtWithResponse()` | Lines 29-36: `extJsonParse` with reviver. Lines 45-53: `apiFetchExt`. Lines 61-69: `apiFetchExtWithResponse` |
| `src/routes/(app)/customers/+page.svelte` | Import `extJsonParse`. `ListResponse.total: bigint`. `total = $state<bigint>(0n)`. List parsing: `extJsonParse<ListResponse>(await listRes.text())` | Line 19: import. Line 64: `total: bigint`. Line 81: `$state<bigint>(0n)`. Line 471: `extJsonParse` |
| `src/routes/(app)/system/settings/organizations/+page.svelte` | Same pattern as customers | Line 6: import. Line 46: `total: bigint`. Line 63: `$state<bigint>(0n)`. Line 427: `extJsonParse` |
| `src/routes/(app)/system/settings/users/+page.svelte` | Same pattern | Line 6: import. Line 48: `total: bigint`. Line 69: `$state<bigint>(0n)`. Line 305: `extJsonParse` |
| `src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte` | Import `extJsonParse`. `versionHistoryTotal = $state<bigint>(0n)`. Both `res.json()` calls → `extJsonParse<...>(await res.text())` | Line 3: import. Line 41: `$state<bigint>(0n)`. Line 67: `extJsonParse<{ data: any[]; pagination: { total: bigint; hasMore: boolean } }>`. Line 69: `\|\| 0n` |
| `src/lib/components/entity-list-table/types.ts` | `EntityListTableProps.total: bigint` | Line 53 |
| `src/lib/components/entity-list-table/components/EntityListTableDialogs.svelte` | `total: bigint` in props | Line 20 |

**Verification:** `npx svelte-check --threshold error` = 0 errors.

### Phase 5 (COMPLETED) — US (`primebrick-us-v3` / emailsender)

| File | Change | Empirical evidence |
|------|--------|-------------------|
| `test/helpers/setup.ts` | `entity_id` column: `bigint` (was `text`) | Line 65: `"entity_id" bigint` |
| `db-meta/snapshot-entities.json` | `entity_id` dataType/typname: `bigint` (was `text`) | Line 350-351: `"dataType": "bigint"`, `"typname": "bigint"` |
| `db-meta/patches/0001_initial_schema.sql` | New — consolidated initial schema (replaces 3 separate patches). Creates `providers`, `email_templates`, `email_templates_communication_log` (with `entity_id bigint`), `config` tables | 87 lines, single file in `patches/` directory |
| `src/domain/entities/email_communication_log_entity.ts` | `entity_id?: bigint` | Line 21 |
| `src/nats/types.ts` | `EmailSendRequest.entityId?: bigint`, `EmailSendResponse.logId?: bigint` | Line 10, 19 |

**Verification:** `pnpm run build` passes. `pnpm test` = 17/17 pass.

### Remaining audit count inconsistencies (intentionally kept as `number`)

The following 4 call sites convert `bigint` to `number` via `Number()` for audit pagination `total`. This is intentional — audit `total` values are small (row counts of a single entity's audit history) and the DTO type is `number`:

| File | Line | Code | DTO type |
|------|------|------|----------|
| `src/modules/auth/user-profiles-dal.ts` | 212 | `const total = Number(countResult.rows[0].total);` | `CustomerAuditResponse.pagination.total: number` |
| `src/modules/auth/organizations_dal.ts` | 253 | `return Number(result.rows[0].count);` | `getUserCountForOrganization(): Promise<number>` |
| `src/modules/auth/organizations_dal.ts` | 294 | `const total = Number(countResult.rows[0].total);` | audit response `total: number` |
| `src/modules/customers/customers_dal.ts` | 867 | `const total = Number(countResult.rows[0].total);` | `CustomerAuditResponse.pagination.total: number` |

---

## 3. Prerequisite Phase — DAL-pg enhancements (in `primebrick-dal-v3`)

### 3.1 Implement `clone()` method

**File:** `primebrick-dal-v3/src/repository/repository.ts` (new method)

**Signature:**
```typescript
async clone<TEntity extends object & IAuditableEntity & IClonableEntity>(
  entity: EntityClass & { new (): TEntity },
  sourceUuid: string,
  options: AuditableWriteOptions,
): Promise<TEntity>;
```

**Behavior (mirrors BE's clone exactly):**
1. Fetch source record by UUID (`findByUUID` with `deletedRecords: "INCLUDED"` — clone can target deleted records)
2. Throw `NotFoundError` if source not found
3. Generate new UUID via `crypto.randomUUID()`
4. Build new row from source, excluding:
   - PK column (`isKey`) — let DB auto-generate
   - Unique columns (`isUnique`) — including the `uuid` column (set to new UUID)
   - `@CloneField` column — set to `sourceUuid`
5. Reset audit fields:
   - `created_at` = `new Date()`
   - `created_by` = `actor` (from options)
   - `updated_at` = `new Date()`
   - `updated_by` = `actor`
   - `version` = `1`
6. Reset deletable fields:
   - `deleted_at` = `null`
   - `deleted_by` = `null`
7. Execute `INSERT INTO ... RETURNING *`
8. Return the full cloned row
9. **No audit write** (matches BE behavior — clone does not audit)

**Acceptance criteria:**
- `clone()` produces a new row with a different UUID
- `cloned_from` field is set to the source UUID (if entity has `@CloneField`)
- Audit fields are reset (version=1, created_at=now, created_by=actor)
- Soft-deleted source can be cloned (deleted_at/deleted_by reset to null on clone)
- PK is auto-generated (not copied from source)

### 3.2 Extend audit to all write operations

**File:** `primebrick-dal-v3/src/repository/repository.ts`

**Current state:** Only `add()` writes audit (INSERT action). `update()`, `delete()`, `restore()`, `hardDelete()` do NOT.

**Required changes:**

#### 3.2.1 `update()` — add audit (UPDATE action)
- Before executing UPDATE, fetch old record via `findByUUID` (with `deletedRecords: "INCLUDED"`)
- After UPDATE, build new record from old + updates + audit stamps
- Calculate delta via `calculateDeltaWithForcedFields(old, new, ['updated_at', 'updated_by'])`
- Call `audit.writeAudit()` with `AuditAction.UPDATE`, fire-and-forget
- Extract `entityId` (PK) and `entityUuid` from the returned row

#### 3.2.2 `delete()` — add audit (SOFT_DELETE action)
- Before executing UPDATE, fetch old record
- After UPDATE, build new record from old + soft-delete stamps
- Calculate delta via `calculateDeltaWithForcedFields(old, new, ['updated_at', 'updated_by'])`
- Call `audit.writeAudit()` with `AuditAction.SOFT_DELETE`, fire-and-forget

#### 3.2.3 `restore()` — add audit (RESTORE action)
- Before executing UPDATE, fetch old record
- After UPDATE, build new record from old + restore stamps (deleted_at=null, deleted_by=null)
- Calculate delta via `calculateDeltaWithForcedFields(old, new, ['updated_at', 'updated_by'])`
- Call `audit.writeAudit()` with `AuditAction.RESTORE`, fire-and-forget

#### 3.2.4 `hardDelete()` — add audit (HARD_DELETE action)
- Before executing DELETE, fetch old record (for delta + entityId + entityUuid)
- Calculate delta via `calculateDelta(old, {})` (empty new = all fields removed)
- Version = `oldRecord.version + 1` (calculated in JS, since row is deleted)
- Call `audit.writeAudit()` with `AuditAction.HARD_DELETE`, fire-and-forget

#### 3.2.5 Delta calculator — add to DAL-pg
**File:** `primebrick-dal-v3/src/audit/delta-calculator.ts` (new file)

Port BE's `calculateDelta` and `calculateDeltaWithForcedFields` from `primebrick-be-v3/src/lib/audit/delta-calculator.ts` (28 lines, verbatim logic).

**Acceptance criteria:**
- All 5 write ops (add, update, delete, restore, hardDelete) write audit when `options.audit` port is provided
- Delta includes old/new values for changed fields
- Forced fields (`updated_at`, `updated_by`) always appear in delta for update/delete/restore
- Audit writes are fire-and-forget (errors caught, logged, not thrown)
- No audit written when `options.audit` is not provided (graceful degradation)

### 3.3 Add tests for `Project.expr` projection (REQUIRED for R12)

**File:** `primebrick-dal-v3/test/` (new test file)

**Current state:** `Project.expr(expr, alias)` already exists in the DSL (`src/query/dsl.ts:113-124`) and is rendered by `renderProjection` in `query-builder.ts:54-55`. However, it has **zero test coverage** — no test in the suite uses `Project.expr`.

**Why REQUIRED:** BE's `OrganizationsDal.getUserCountForOrganization()` (raw SQL site R12) will be migrated to `repo.find()` + `Project.expr("COUNT(*)", "cnt")` + filters. This pattern must be tested before BE relies on it.

**Test plan:**
1. `Project.expr("COUNT(*)", "cnt")` with `find()` returns a single row with `cnt: bigint`
2. `Project.expr("COUNT(*)", "cnt")` with `find()` + filters returns filtered count
3. `Project.expr("COUNT(*)", "cnt")` with `find()` + `deletedRecords: "EXCLUDED"` counts non-deleted rows
4. `Project.expr("COUNT(*)", "cnt")` with `find()` + filters + `deletedRecords: "EXCLUDED"` combines both
5. `Project.expr("LOWER(name)", "lower_name")` returns computed expression projection
6. `Project.expr` with invalid alias (contains `;`, space, etc.) throws `Invalid identifier` error
7. `Project.expr` + `Project.field` mixed in same query works correctly

**No DAL-pg source changes needed** — only new tests. The `Project.expr` + `find()` + `Filter` + `deletedRecords` combination already works. This phase adds test coverage to guarantee it stays working.

**Acceptance criteria:**
- All 7 tests above pass
- `find()` with `Project.expr("COUNT(*)", "cnt")` returns `{ cnt: bigint }` (not `number` — INT8 type parser applies)
- Alias validation rejects invalid identifiers (anti-injection guard works)
- Existing `count(entity)` method continues to work (backward compatible — no changes to `count()`)

### 3.4 Add `AuditLogEntity` + `tableName` override + `buildAuditTrailJoins()` (REQUIRED for R13-R16, R21-R22)

**Files:** `primebrick-dal-v3/src/audit/audit-log-entity.ts` (new), `src/audit/auditable-joins.ts` (extend), `src/query/query-builder.ts` (small change), `src/repository/repository.ts` (small change), `src/index.ts` (exports)

**Problem:** All audit tables (`customers_audit`, `organizations_audit`, `user_profiles_audit`) have the identical column shape. Creating one entity class per table (`CustomerAuditEntity`, `OrganizationAuditEntity`, etc.) is pure duplication. The solution is a single `AuditLogEntity` class exported from DAL-pg, with the table name provided at query time via a `tableName` override option.

**Why a single class:** All audit tables share the same columns — `id`, `entity_uuid`, `action`, `changed_at`, `changed_by`, `version`, `delta`. The only difference is the table name. Encoding this once in DAL-pg eliminates duplication and ensures consistency.

#### 3.4.1 `AuditLogEntity` class (new, exported from DAL-pg)

```typescript
// src/audit/audit-log-entity.ts (new file in DAL-pg)
import { Entity, Key, Column, AuditTrailEntity } from "../meta/entity-decorators.js";

@Entity("audit_log")  // placeholder — never queried directly; tableName override at query time
@AuditTrailEntity({ changedByColumn: "changed_by" })
export class AuditLogEntity {
  @Key() @Column({ sqlName: "id", pgType: "bigint" })
  id!: bigint;

  @Column({ sqlName: "entity_id", pgType: "bigint" })
  entity_id!: bigint;

  @Column({ sqlName: "entity_uuid", pgType: "uuid" })
  entity_uuid!: string;

  @Column({ sqlName: "action", pgType: "text" })
  action!: string;

  @Column({ sqlName: "changed_at", pgType: "timestamptz" })
  changed_at!: Date;

  @Column({ sqlName: "changed_by", pgType: "text" })
  changed_by!: string;

  @Column({ sqlName: "version", pgType: "integer" })
  version!: number;

  @Column({ sqlName: "delta", pgType: "jsonb" })
  delta!: Record<string, unknown>;
}
```

**Composite PK note:** Audit tables have varying PK definitions (empirically verified from `00000000000000_init_database.sql`):
- `customers_audit`: `PRIMARY KEY (id, changed_at)` — partitioned by `changed_at` via pg_partman
- `organizations_audit`: `PRIMARY KEY (id, changed_at)` — partitioned by `changed_at` via pg_partman
- `role_mappings_audit`: `PRIMARY KEY (id, changed_at)` — partitioned by `changed_at` via pg_partman
- `user_profiles_audit`: `PRIMARY KEY (id)` — **NOT partitioned** (single-column PK)

We mark only `id` as `@Key()` in `AuditLogEntity` — this works for all 4 tables. For the 3 partitioned tables, the real PK is composite `(id, changed_at)`, but since audit entities are **read-only** from the application's perspective (writes go through `BeAuditPortAdapter` via `repo.add()`, not through `repo.update()`/`delete()`), the PK metadata is not used for write operations. For reads (`find()`, `findByPage()`), the PK is irrelevant — we use filters + sorting + LIMIT/OFFSET. pg_partman partition pruning happens automatically based on `changed_at` filters for the 3 partitioned tables. The non-partitioned `user_profiles_audit` works identically (no partition pruning needed).

#### 3.4.2 `@AuditTrailEntity` decorator (new)

```typescript
// src/meta/entity-decorators.ts (extend)
export function AuditTrailEntity(options: { changedByColumn: string }): ClassDecorator {
  return function <T extends Function>(target: T): T {
    const m = ensureMeta(target);
    m.isAuditTrailEntity = true;
    m.auditTrailChangedByColumn = options.changedByColumn;
    return target;
  };
}
```

This is distinct from the existing `@AuditTrail()` decorator, which marks an entity as *having* an audit trail table (e.g., `CustomerEntity` has `customers_audit`). `@AuditTrailEntity` marks a class as *being* an audit trail entity.

#### 3.4.3 `tableName` override option on finders and writers

Add an optional `tableName` field to the query/write input. When provided, it overrides the metadata-derived table name. The entity metadata is still used for column mapping, type coercion, and soft-delete detection.

```typescript
// src/query/query-builder.ts — in buildSelectQuery()
const table = input.tableName
  ? `"${schema}"."${input.tableName}"`
  : getQualifiedTableName(entity);

// src/repository/repository.ts — in add() and addMany()
const table = (options as WriteOptions).tableName
  ? `"${schema}"."${(options as WriteOptions).tableName}"`
  : getQualifiedTableName(entity);
```

This is a general-purpose feature useful beyond audit tables (partitioned tables, multi-tenant schemas, table-per-month patterns).

**Affected methods:** `find()`, `findAll()`, `findByPage()`, `count()` (read path) + `add()`, `addMany()` (write path). All accept the optional `tableName` in their options.

**Why `add()` needs it:** `AuditService.writeAudit()` (R23) does `INSERT INTO {table}_audit`. With `tableName` override on `add()`, it becomes `repo.add(AuditLogEntity, {...}, { tableName: "customers_audit" })` — no raw SQL. The `AuditLogEntity` is NOT decorated with `@AuditableField`, so `add()`'s audit stamping logic (created_at/created_by/etc.) does NOT trigger — correct, because audit log rows don't need audit stamping. No `audit` port is passed, so `add()`'s audit writing logic also does NOT trigger — correct, because we don't audit the audit log.

#### 3.4.4 `buildAuditTrailJoins()` function (new, exported from DAL-pg)

```typescript
// src/audit/auditable-joins.ts (extend)
import { Join, field, Project } from "../query/dsl.js";
import { getEntityPersistenceMeta } from "../meta/entity-meta.js";
import type { EntityClass } from "../meta/entity-meta.js";
import type { FieldProjector } from "../query/dsl.js";

export function buildAuditTrailJoins(
  auditEntity: EntityClass,
  userEntity: EntityClass
): { joins: JoinExpr[]; projections: FieldProjector[] } {
  const meta = getEntityPersistenceMeta(auditEntity);
  const changedByCol = meta.auditTrailChangedByColumn ?? "changed_by";

  return {
    joins: [
      Join.on(
        field(userEntity, "uuid" as any),
        field(auditEntity, changedByCol as any),
        "LEFT",
        { castRightTo: "uuid", castLeftTo: "uuid", alias: "creator" }
        // castRightTo: "uuid" triggers the regex guardrail automatically.
        // castLeftTo: "uuid" is REQUIRED — without it, the ON clause would be
        // `creator.uuid::uuid = changed_by` (uuid = text) which PostgreSQL rejects.
        // With both casts: `changed_by ~ '^[0-9a-fA-F-]{36}$' AND creator.uuid::uuid = changed_by::uuid`
        // Note: the existing buildAuditableJoins() uses castRightTo: "text" (text = text, no guardrail).
        // buildAuditTrailJoins() uses castRightTo: "uuid" + castLeftTo: "uuid" (uuid = uuid, with guardrail).
      ),
    ],
    projections: [
      Project.expr("creator.display_name", "changed_by_display_name"),
      Project.expr("creator.idp_code", "changed_by_idp_code"),
    ],
  };
}
```

**Regex guardrail:** The existing `renderJoins()` in `query-builder.ts:123-124` adds the regex guardrail when `castRightTo === "uuid"` OR `colMeta?.castInJoin === "uuid"`:
```typescript
if (j.options?.castRightTo === 'uuid' || (colMeta?.castInJoin === 'uuid')) {
  onExpr = `${leftExpr} ~ '^[0-9a-fA-F-]{36}$' AND ${rightExpr} = ${leftExprWithCast}`;
}
```
**Important:** `castLeftTo: "uuid"` is REQUIRED in `buildAuditTrailJoins` — without it, `leftExprWithCast` stays as text, producing `uuid = text` which PostgreSQL rejects. The existing `buildAuditableJoins()` uses `castRightTo: "text"` (no guardrail, `text = text`). The new `buildAuditTrailJoins()` uses `castRightTo: "uuid"` + `castLeftTo: "uuid"` (guardrail + `uuid = uuid`). No new rendering logic needed — the guardrail is automatic.

**DAL-pg leaf dependency:** `buildAuditTrailJoins(auditEntity, userEntity)` accepts `userEntity` as a parameter (same pattern as existing `buildAuditableJoins`). DAL-pg doesn't import `UserProfileEntity`.

#### 3.4.5 Usage example (R14 — customers audit)

```typescript
import { AuditLogEntity, Project, Filter, Sort, field, buildAuditTrailJoins } from "@primebrick/dal-pg";
import { UserProfileEntity } from "./modules/auth/user_profile_entity";

const { joins, projections: joinProjections } = buildAuditTrailJoins(AuditLogEntity, UserProfileEntity);

const result = await repo.findByPage<AuditLogEntity>(
  AuditLogEntity,
  [
    Project.field(field(AuditLogEntity, "id")),
    Project.field(field(AuditLogEntity, "entity_id")),
    Project.field(field(AuditLogEntity, "entity_uuid")),
    Project.field(field(AuditLogEntity, "action")),
    Project.field(field(AuditLogEntity, "changed_at")),
    Project.field(field(AuditLogEntity, "changed_by")),
    Project.field(field(AuditLogEntity, "version")),
    Project.field(field(AuditLogEntity, "delta")),
    ...joinProjections,  // changed_by_display_name, changed_by_idp_code
  ],
  {
    tableName: "customers_audit",   // <-- override
    joins,
    filters: [Filter.fieldValue(field(AuditLogEntity, "entity_uuid"), "=", uuid)],
    sorting: [
      Sort.by(field(AuditLogEntity, "changed_at"), "DESC"),
      Sort.by(field(AuditLogEntity, "id"), "DESC"),
    ],
    page,
    limit,
  }
);
```

**Acceptance criteria:**
- `AuditLogEntity` class is exported from `@primebrick/dal-pg` (includes `entity_id` field)
- `@AuditTrailEntity({ changedByColumn })` decorator sets `isAuditTrailEntity` + `auditTrailChangedByColumn` metadata
- `find()` / `findAll()` / `findByPage()` / `count()` accept optional `tableName` in options (read path)
- `add()` / `addMany()` accept optional `tableName` in options (write path)
- `tableName` override produces `"schema"."tableName"` in SQL (quoted, schema-qualified)
- `buildAuditTrailJoins(AuditLogEntity, UserProfileEntity)` returns joins with regex guardrail + display_name/idp_code projections
- `findByPage(AuditLogEntity, ..., { tableName: "customers_audit" })` returns typed `AuditLogEntity` rows
- `find(AuditLogEntity, [Project.expr("COUNT(*)", "total")], { tableName: "customers_audit", filters })` returns `{ total: bigint }`
- `add(AuditLogEntity, { entity_id, entity_uuid, action, changed_at, changed_by, version, delta }, { tableName: "customers_audit" })` inserts a row and returns it with auto-generated `id`
- `add()` with `AuditLogEntity` does NOT trigger audit stamping (no `@AuditableField` decorators on `AuditLogEntity`)
- `add()` with `AuditLogEntity` does NOT trigger audit writing (no `audit` port passed)
- Composite PK `(id, changed_at)` on 3 of 4 audit tables is not an issue — only `id` is marked `@Key()`, audit entities are insert-only via `add()`; `user_profiles_audit` has single PK `(id)` — both work with the same `AuditLogEntity`
- pg_partman partition pruning works automatically via `changed_at` filters

#### 3.4.6 Usage example (R23 — AuditService.writeAudit via `add()`)

```typescript
import { AuditLogEntity, type Repository } from "@primebrick/dal-pg";
import { AuditAction } from "./audit-types.js";

// Before (raw SQL in BE's AuditService):
async writeAudit<T extends object>(
  entityClass: EntityClass,
  entityId: bigint,
  entityUuid: string,
  action: AuditAction,
  changedAt: Date,
  version: number,
  delta: Record<string, { old: unknown; new: unknown }>,
  changedBy: string = "system"
): Promise<void> {
  const tableName = `${getTableName(entityClass)}_audit`;
  const sql = `INSERT INTO "public"."${tableName}"
    (entity_id, entity_uuid, action, changed_at, changed_by, version, delta)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`;
  await this.pool.query(sql, [entityId, entityUuid, action, changedAt, changedBy, version, JSON.stringify(delta)]);
}

// After (typed DAL — no raw SQL):
async writeAudit<T extends object>(
  entityClass: EntityClass,
  entityId: bigint,
  entityUuid: string,
  action: AuditAction,
  changedAt: Date,
  version: number,
  delta: Record<string, { old: unknown; new: unknown }>,
  changedBy: string = "system"
): Promise<void> {
  const tableName = `${getTableName(entityClass)}_audit`;
  await this.repo.add(AuditLogEntity, {
    entity_id: entityId,
    entity_uuid: entityUuid,
    action,
    changed_at: changedAt,
    changed_by: changedBy,
    version,
    delta,
  }, { tableName });
  // No audit port passed — we don't audit the audit log.
  // No @AuditableField on AuditLogEntity — no audit stamping.
  // id is identity PK — auto-generated by DB, add() drops it.
}
```

**Key points:**
- `AuditLogEntity` has NO `@AuditableField` decorators → `add()`'s audit stamping (created_at/created_by/etc.) does NOT trigger
- No `audit` port in options → `add()`'s audit writing does NOT trigger
- `id` is identity PK → `add()` drops it, DB auto-generates
- `delta` is `jsonb` → `jsValueToPgParam` converts the object to JSON string automatically
- `entity_id` is `bigint` → INT8 type parser handles it natively
- **Note:** Existing BE SELECT queries (R14, R16, R22) do NOT select `entity_id` — they select `id, entity_uuid, action, changed_at, changed_by, version, delta` + join columns. The migration's `findAuditPage()` helper ADDS `entity_id` to the projection list (via `Project.field(field(AuditLogEntity, "entity_id"))`). This is an improvement — the audit trail API will now expose `entity_id` if needed. The INSERT statements already include `entity_id`.

---

## 4. Deep rawSql analysis — every raw SQL statement in BE, migration strategy

This section catalogues **every** raw SQL statement in `primebrick-be-v3`, analyzes why it exists, whether it can be replaced by a typed DAL-pg method, and — if not — what DAL-pg enhancement is needed to eliminate the raw SQL.

### 4.1 Inventory — all raw SQL sites (empirically verified)

| # | File | Line(s) | Method/Context | SQL type | Uses `repo.rawSql`? | Uses `pool.query`? |
|---|------|---------|----------------|----------|---------------------|---------------------|
| R1 | `src/index.ts` | 59 | `checkDb()` health check | `SELECT 1 as ok` | No | Yes |
| R2 | `src/db/database-patch-registry.ts` | 18, 23 | `isPatchBodyAlreadyRecorded()` | `SELECT to_regclass(...)` + `SELECT 1 FROM patch_registry` | No | Yes |
| R3 | `src/modules/system/system-router.ts` | 46 | `GET /roles/active` handler | `SELECT idp_role, label_key, permissions, is_admin FROM role_mappings ORDER BY idp_role` | No | Yes |
| R4 | `src/modules/auth/role-mapping-repo.ts` | 30 | `loadAllMappings()` | `SELECT idp_role, label_key, permissions, is_admin FROM role_mappings` | Yes | No |
| R5 | `src/modules/auth/role-mapping-repo.ts` | 55 | `upsertMapping()` — existence check | `SELECT id FROM role_mappings WHERE idp_role = $1` | Yes | No |
| R6 | `src/modules/auth/role-mapping-repo.ts` | 70 | `upsertMapping()` — update path | `UPDATE role_mappings SET permissions, is_admin, label_key, updated_at WHERE idp_role = $4` | Yes | No |
| R7 | `src/modules/auth/role-mapping-repo.ts` | 81 | `deleteMapping()` | `DELETE FROM role_mappings WHERE idp_role = $1` | Yes | No |
| R8 | `src/modules/auth/user-profile-repo.ts` | 76 | `resolveInternalUuid()` — fast SELECT | `SELECT uuid, idp_org, idp_username FROM user_profiles WHERE idp_code = $1 LIMIT 1` | No | Yes |
| R9 | `src/modules/auth/user-profile-repo.ts` | 87 | `resolveInternalUuid()` — sync update | `UPDATE user_profiles SET idp_org, idp_username, updated_at, updated_by, version WHERE idp_code = $1` | No | Yes |
| R10 | `src/modules/auth/user-profile-repo.ts` | 106 | `resolveInternalUuid()` — JIT insert (upsert) | `INSERT INTO user_profiles ... ON CONFLICT (idp_code) DO UPDATE ... RETURNING uuid, id` | No | Yes |
| R11 | `src/modules/auth/services/user.service.ts` | 98 | `createUser()` — JIT insert | `INSERT INTO user_profiles (...) VALUES (...)` | No | Yes |
| R12 | `src/modules/auth/organizations_dal.ts` | 252 | `getUserCountForOrganization()` | `SELECT COUNT(*) FROM user_profiles WHERE idp_org = $1 AND deleted_at IS NULL AND is_active = true` | No | Yes |
| R13 | `src/modules/auth/organizations_dal.ts` | 293 | `getOrganizationAudit()` — count | `SELECT COUNT(*) FROM organizations_audit WHERE entity_uuid = $1` | No | Yes |
| R14 | `src/modules/auth/organizations_dal.ts` | 315 | `getOrganizationAudit()` — data | `SELECT audit.*, creator.display_name FROM organizations_audit LEFT JOIN user_profiles ... WHERE entity_uuid = $1 ORDER BY ... LIMIT $2 OFFSET $3` | No | Yes |
| R15 | `src/modules/auth/user-profiles-dal.ts` | 211 | `getUserProfileAudit()` — count | `SELECT COUNT(*) FROM user_profiles_audit WHERE entity_uuid = $1` | No | Yes |
| R16 | `src/modules/auth/user-profiles-dal.ts` | 226 | `getUserProfileAudit()` — data | `SELECT audit.*, creator.display_name FROM user_profiles_audit LEFT JOIN user_profiles ... WHERE entity_uuid = $1 ORDER BY ... LIMIT $2 OFFSET $3` | No | Yes |
| R17 | `src/modules/customers/customers_dal.ts` | 449 | `seedAuditLogs()` — fetch all | `SELECT id, uuid, email, phone, status, ... FROM customers ORDER BY id` | No | Yes |
| R18 | `src/modules/customers/customers_dal.ts` | 497, 520, 534, 573, 599 | `seedAuditLogs()` — INSERT audit rows | `INSERT INTO customers_audit (entity_id, entity_uuid, action, ...) VALUES (...)` | No | Yes (×5) |
| R19 | `src/modules/customers/customers_dal.ts` | 542, 581, 607 | `seedAuditLogs()` — UPDATE customers | `UPDATE customers SET updated_at, updated_by, version, ... WHERE id = $3` | No | Yes (×3) |
| R20 | `src/modules/customers/customers_dal.ts` | 554 | `seedAuditLogs()` — SELECT for delta | `SELECT email, phone, status FROM customers WHERE id = $1` | No | Yes |
| R21 | `src/modules/customers/customers_dal.ts` | 866 | `getCustomerAudit()` — count | `SELECT COUNT(*) FROM customers_audit WHERE entity_uuid = $1` | No | Yes |
| R22 | `src/modules/customers/customers_dal.ts` | 878 | `getCustomerAudit()` — data | `SELECT audit.*, creator.display_name FROM customers_audit LEFT JOIN user_profiles ... WHERE entity_uuid = $1 ORDER BY ... LIMIT $2 OFFSET $3` | No | Yes |
| R23 | `src/lib/audit/audit-service.ts` | 27 | `writeAudit()` | `INSERT INTO {table}_audit (entity_id, entity_uuid, action, ...) VALUES (...)` | No | Yes |

**Total: 23 distinct raw SQL sites** (some with multiple statements in a loop).

### 4.2 Per-site migration analysis

#### R1 — `checkDb()` health check (`SELECT 1 as ok`)

**Why raw SQL:** Trivial liveness probe. No entity involved.
**Can DAL-pg handle it?** DAL-pg's `rawSql()` can execute it, but it's overkill. A health check doesn't need entity metadata.
**Migration strategy:** Keep as `pool.query("select 1 as ok")` via the Dal gateway's `getPool()`. This is infrastructure, not business logic.
**Verdict:** **KEEP AS rawSql** — no DAL-pg change needed.

#### R2 — `isPatchBodyAlreadyRecorded()` patch registry

**Why raw SQL:** Queries the `primebrick_database_patches` registry table, which is NOT an entity (no `@Entity` decorator). It's infrastructure DDL tracking.
**Can DAL-pg handle it?** No — there's no entity for the patch registry table. Creating one would be over-engineering for a 2-query infrastructure function.
**Migration strategy:** Keep as `pool.query()`. This is migration infrastructure, not business logic.
**Verdict:** **KEEP AS rawSql** — no DAL-pg change needed.

#### R3 — `GET /roles/active` handler (`SELECT ... FROM role_mappings ORDER BY idp_role`)

**Why raw SQL:** Selects 4 specific columns from `role_mappings` with `ORDER BY`. The router handler calls `pool.query()` directly instead of going through `RoleMappingRepo`.
**Can DAL-pg handle it?** YES — `repo.findAll(RoleMappingEntity, [Project.field(...), ...], { sorting: [Sort.by(...)] })` supports column projection + sorting.
**Migration strategy:** Replace with `repo.findAll()` using `FieldProjector` for the 4 columns + `Sort.by(field(RoleMappingEntity, "idp_role"), "ASC")`. Or simply `repo.findAll(RoleMappingEntity)` (returns all columns, which includes the 4 needed + audit fields — the router already strips to 4 fields in the `.map()`).
**Verdict:** **REPLACE with `repo.findAll()`** — no DAL-pg change needed.

#### R4 — `loadAllMappings()` (`SELECT idp_role, label_key, permissions, is_admin FROM role_mappings`)

**Why raw SQL:** Same as R3 but via `repo.rawSql()`. Selects 4 columns, no ORDER BY, no filters.
**Can DAL-pg handle it?** YES — `repo.findAll(RoleMappingEntity, [Project.field(...), ...])` with field projectors for the 4 columns.
**Migration strategy:** Replace with `repo.findAll(RoleMappingEntity, [Project.field(field(RoleMappingEntity, "idp_role")), Project.field(field(RoleMappingEntity, "label_key")), Project.field(field(RoleMappingEntity, "permissions")), Project.field(field(RoleMappingEntity, "is_admin"))])`.
**Verdict:** **REPLACE with `repo.findAll()`** — no DAL-pg change needed.

#### R5 — `upsertMapping()` existence check (`SELECT id FROM role_mappings WHERE idp_role = $1`)

**Why raw SQL:** Checks if a row exists with a specific `idp_role` before deciding INSERT vs UPDATE. This is a manual upsert pattern (SELECT-then-INSERT/UPDATE).
**Can DAL-pg handle it?** YES — `repo.find(RoleMappingEntity, [Project.field(field(RoleMappingEntity, "id"))], { filters: [Filter.fieldValue(field(RoleMappingEntity, "idp_role"), "=", idpRole)], throwIfNotFound: false })`.
**BUT:** This entire SELECT-then-INSERT/UPDATE pattern is an anti-pattern. DAL-pg has a native `upsert()` method that does `INSERT ... ON CONFLICT DO UPDATE` atomically.
**Migration strategy:** Replace the entire `upsertMapping()` method with `repo.upsert(RoleMappingEntity, { idp_role: idpRole, label_key: labelKey, permissions, is_admin: isAdmin }, { actor: requireActor(), conflictTarget: "idp_role" })`. This eliminates R5 + R6 in one call.
**Verdict:** **REPLACE with `repo.upsert()`** — no DAL-pg change needed. Eliminates R5 + R6.

#### R6 — `upsertMapping()` update path (`UPDATE role_mappings SET ... WHERE idp_role = $4`)

**Why raw SQL:** Manual UPDATE with `CURRENT_TIMESTAMP` for `updated_at`. Doesn't use `repo.update()` because the old BE Repository's `update()` requires a UUID, but `role_mappings` uses `idp_role` as the lookup key.
**Can DAL-pg handle it?** YES — `repo.update(RoleMappingEntity, { permissions, is_admin, label_key, idp_role: idpRole }, { actor: requireActor(), matchBy: "idp_role" })`. DAL-pg's `matchBy` option allows matching on any column, not just UUID.
**BUT:** As noted in R5, the entire method should be replaced with `repo.upsert()`.
**Verdict:** **REPLACE with `repo.upsert()`** (eliminates R5 + R6 together) — no DAL-pg change needed.

#### R7 — `deleteMapping()` (`DELETE FROM role_mappings WHERE idp_role = $1`)

**Why raw SQL:** Physical DELETE by `idp_role`. The old BE Repository's `hardDelete()` requires a UUID, but `role_mappings` uses `idp_role` as the lookup key.
**Can DAL-pg handle it?** YES — `repo.hardDelete(RoleMappingEntity, { idp_role: idpRole }, { matchBy: "idp_role" })`. DAL-pg's `matchBy` option supports any column.
**Migration strategy:** Replace with `repo.hardDelete()` with `matchBy: "idp_role"`.
**Verdict:** **REPLACE with `repo.hardDelete()`** — no DAL-pg change needed.

#### R8 — `resolveInternalUuid()` fast SELECT (`SELECT uuid, idp_org, idp_username FROM user_profiles WHERE idp_code = $1 LIMIT 1`)

**Why raw SQL:** Hot-path lookup by `idp_code` (not UUID, not PK). Called on every authenticated request. Uses `pool.query()` directly for speed (no Repository overhead).
**Can DAL-pg handle it?** YES — `repo.find(UserProfileEntity, [Project.field(field(UserProfileEntity, "uuid")), Project.field(field(UserProfileEntity, "idp_org")), Project.field(field(UserProfileEntity, "idp_username"))], { filters: [Filter.fieldValue(field(UserProfileEntity, "idp_code"), "=", input.idp_code)], throwIfNotFound: false })`.
**Performance concern:** The DAL-pg's `find()` builds a query via `buildSelectQuery()` which adds metadata resolution overhead. For a hot path called on every request, this might matter. However, the metadata is cached in a WeakMap after first access, so subsequent calls are fast.
**Migration strategy:** Replace with `repo.find()` with field projectors + filter. The performance difference is negligible (metadata is cached). The `deletedRecords: "INCLUDED"` option should be used if JIT provisioning needs to find soft-deleted users too.
**Verdict:** **REPLACE with `repo.find()`** — no DAL-pg change needed.

#### R9 — `resolveInternalUuid()` sync update (`UPDATE user_profiles SET idp_org, idp_username, updated_at, updated_by, version WHERE idp_code = $1`)

**Why raw SQL:** Updates `idp_org` and `idp_username` if they differ from input. Uses `coalesce($2, idp_org)` to only update if new value is provided. Match key is `idp_code`, not UUID.
**Can DAL-pg handle it?** PARTIALLY — `repo.update(UserProfileEntity, { idp_org, idp_username, idp_code }, { actor: uuid, matchBy: "idp_code" })` would work, BUT:
- The `coalesce($2, idp_org)` pattern (only update if new value is not null) is NOT supported by DAL-pg's `update()`. DAL-pg sets the value as-is. If `idp_org` is `undefined`, DAL-pg skips it (filters undefined). If `idp_org` is `null`, DAL-pg sets it to NULL.
- The current code uses `coalesce($2, idp_org)` which means "keep existing value if new value is NULL". This is different from DAL-pg's behavior.
**Migration strategy:** Replace with `repo.update()` but pre-filter the updates object: only include `idp_org` and `idp_username` if they are not null/undefined. This achieves the same effect as `coalesce` without needing DAL-pg support.
```typescript
const updates: Record<string, unknown> = { idp_code: input.idp_code };
if (input.idp_org !== undefined && input.idp_org !== null) updates.idp_org = input.idp_org;
if (input.idp_username !== undefined && input.idp_username !== null) updates.idp_username = input.idp_username;
await repo.update(UserProfileEntity, updates, { actor: row.uuid, matchBy: "idp_code" });
```
**Verdict:** **REPLACE with `repo.update()`** — no DAL-pg change needed (handle coalesce in caller).

#### R10 — `resolveInternalUuid()` JIT upsert (`INSERT ... ON CONFLICT (idp_code) DO UPDATE ... RETURNING uuid, id`)

**Why raw SQL:** Atomic upsert with `ON CONFLICT (idp_code) DO UPDATE`. The conflict target is `idp_code` (unique column), not the PK. Returns `uuid, id` for cache + audit.
**Can DAL-pg handle it?** YES — `repo.upsert(UserProfileEntity, { uuid: newUuid, idp_code, email, display_name, idp_org, idp_username, created_at: now, created_by: newUuid, updated_at: now, updated_by: newUuid }, { actor: newUuid, conflictTarget: "idp_code" })`.
- DAL-pg's `upsert()` supports `conflictTarget` option (defaults to PK, but can be set to any unique column).
- DAL-pg's `upsert()` returns the full row via `RETURNING *`, so `uuid` and `id` are available.
- DAL-pg's `upsert()` auto-stamps audit fields for the INSERT path and increments version for the UPDATE path.
**BUT:** The current code has a subtle difference — it sets `created_by = uuid` (self-referential: the user creates their own profile on first login). DAL-pg's `upsert()` would set `created_by = actor` (from options), which is the same if `actor = newUuid`.
**Migration strategy:** Replace with `repo.upsert()` with `conflictTarget: "idp_code"` and `actor: newUuid`. The audit write for the INSERT path is handled by DAL-pg's audit port (if provided). The manual audit write in the current code (lines 137-162) can be removed since DAL-pg's `upsert()` writes audit for the INSERT path.
**WAIT:** Actually, DAL-pg's `upsert()` does NOT write audit (per the gap analysis in §2.1). Only `add()` writes audit. This is a gap. After Phase 0 extends audit to `upsert()`, this will work. For now, the manual audit write must be preserved OR the caller must use the AuditPort adapter.
**Verdict:** **REPLACE with `repo.upsert()`** — requires Phase 0 gap G2 (audit on upsert) to be completed first.

#### R11 — `createUser()` JIT insert (`INSERT INTO user_profiles (...) VALUES (...)`)

**Why raw SQL:** Direct INSERT into `user_profiles` with all fields. Does NOT use `repo.insertMany()` because:
1. The old BE Repository's `insertMany()` doesn't auto-stamp audit fields (relies on DB DEFAULTs), so the caller provides all values explicitly.
2. The caller sets `created_by = actor` and `updated_by = actor` manually.
3. No audit is written for this INSERT (JIT provisioning bypasses audit).
**Can DAL-pg handle it?** YES — `repo.add(UserProfileEntity, { uuid: newUuid, idp_code, email, display_name, ... }, { actor, audit: auditPort })`.
- DAL-pg's `add()` auto-stamps `created_at`, `created_by`, `updated_at`, `updated_by` if not provided.
- DAL-pg's `add()` writes audit (INSERT action) if `audit` port is provided.
- The caller no longer needs to manually set audit fields.
**BUT:** The current code intentionally does NOT write audit for JIT provisioning. If we use `repo.add()` with an audit port, audit WILL be written. This is actually BETTER — JIT provisioning should be audited. If the user wants to preserve the no-audit behavior, they can omit the `audit` port from the options.
**Migration strategy:** Replace with `repo.add()` with `actor` and optional `audit` port. Remove manual audit field setting. The `roles` field (jsonb) is handled by DAL-pg's type coercion (`jsValueToPgParam` converts objects to JSON strings for jsonb columns).
**Verdict:** **REPLACE with `repo.add()`** — no DAL-pg change needed.

#### R12 — `getUserCountForOrganization()` (`SELECT COUNT(*) FROM user_profiles WHERE idp_org = $1 AND deleted_at IS NULL AND is_active = true`)

**Why raw SQL:** Counts active, non-deleted users in a specific organization. This is a CROSS-ENTITY query: it counts `user_profiles` rows from `OrganizationsDal`, not from `UserProfilesDal`.
**Can DAL-pg handle it?** YES — DAL-pg already has `Project.expr(expr, alias)` in the query DSL (`src/query/dsl.ts:113-124`), which allows arbitrary SQL expression projections like `COUNT(*)`. Combined with `find()` + `Filter` + `deletedRecords`, this covers R12 without any DAL-pg enhancement.
**Migration strategy:** Replace with `repo.find()` using `Project.expr("COUNT(*)", "cnt")` as the projection, filters for `idp_org` and `is_active`, and `deletedRecords: "EXCLUDED"`. The developer specifies `TResult = { cnt: bigint }` to match the custom projection.
```typescript
const result = await repo.find<UserProfileEntity, { cnt: bigint }>(
  UserProfileEntity,
  [Project.expr("COUNT(*)", "cnt")],
  {
    filters: [
      Filter.fieldValue(field(UserProfileEntity, "idp_org"), "=", idpCode),
      Filter.fieldValue(field(UserProfileEntity, "is_active"), "=", true),
    ],
    deletedRecords: "EXCLUDED",
    throwIfNotFound: false,
  }
);
return result?.cnt ?? 0n;
```
**Anti-injection:** The `alias` is validated by `assertValidIdentPart` (regex `^[A-Za-z_][A-Za-z0-9_]*$`) and quoted via `quoteIdent`. The `expr` string is raw SQL — same trust model as `rawSql()`. Defense-in-depth validation on `expr` (reject `;`, `--`, `/*`) is a future enhancement, not a blocker.
**Verdict:** **REPLACE with `repo.find()` + `Project.expr('COUNT(*)', 'cnt')` + filters** — no DAL-pg change needed.

#### R13, R15, R21 — Audit count queries (`SELECT COUNT(*) FROM {table}_audit WHERE entity_uuid = $1`)

**Why raw SQL:** Counts audit rows for a specific entity UUID. Used for pagination metadata.
**Can DAL-pg handle it?** YES — with the `AuditLogEntity` class + `tableName` override (§3.4). All audit tables share the same column shape, so a single `AuditLogEntity` class can query any audit table by overriding the table name at query time.
**Migration strategy:** Replace with `repo.find(AuditLogEntity, [Project.expr("COUNT(*)", "total")], { tableName: "customers_audit", filters: [...], throwIfNotFound: false })`.
```typescript
const result = await repo.find<AuditLogEntity, { total: bigint }>(
  AuditLogEntity,
  [Project.expr("COUNT(*)", "total")],
  {
    tableName: "customers_audit",
    filters: [Filter.fieldValue(field(AuditLogEntity, "entity_uuid"), "=", uuid)],
    throwIfNotFound: false,
  }
);
const total = result?.total ?? 0n;
```
**Verdict:** **REPLACE with `repo.find()` + `Project.expr('COUNT(*)', 'total')` + `tableName` override** — requires §3.4 (`AuditLogEntity` + `tableName` override).

#### R14, R16, R22 — Audit data queries (`SELECT audit.*, creator.display_name FROM {table}_audit LEFT JOIN user_profiles ... WHERE entity_uuid = $1 ORDER BY ... LIMIT $2 OFFSET $3`)

**Why raw SQL:** Fetches audit rows with a LEFT JOIN to `user_profiles` to resolve `changed_by` into `display_name`. Uses the `getAuditUserJoinSql()` and `getAuditSelectWithDisplayName()` helpers from `audit-join-helper.ts`.
**Can DAL-pg handle it?** YES — with `AuditLogEntity` + `tableName` override + `buildAuditTrailJoins()` (§3.4):
1. `AuditLogEntity` provides the entity metadata for column mapping and type coercion.
2. `tableName` override targets the specific audit table (`customers_audit`, `organizations_audit`, `user_profiles_audit`).
3. `buildAuditTrailJoins(AuditLogEntity, UserProfileEntity)` builds the LEFT JOIN with the regex guardrail automatically (the existing `castRightTo: "uuid"` mechanism in `renderJoins()` adds `changed_by ~ '^[0-9a-fA-F-]{36}$'`).
4. `Project.expr("creator.display_name", "changed_by_display_name")` and `Project.expr("creator.idp_code", "changed_by_idp_code")` provide the computed columns from the joined table.
**Composite PK / pg_partman:** Not an issue. Audit entities are read-only — `@Key()` on `id` only is sufficient for queries. 3 of 4 audit tables are pg_partman partitioned (`customers_audit`, `organizations_audit`, `role_mappings_audit`); `user_profiles_audit` is not partitioned. Partition pruning happens automatically via `changed_at` filters for the partitioned tables.
**Migration strategy:** Replace with `repo.findByPage(AuditLogEntity, projections, { tableName, joins: buildAuditTrailJoins(...), filters, sorting })`. See §3.4.5 for the full code example.
**Verdict:** **REPLACE with `repo.findByPage()` + `AuditLogEntity` + `tableName` override + `buildAuditTrailJoins()`** — requires §3.4.

#### R17 — `seedAuditLogs()` fetch all customers (`SELECT id, uuid, email, phone, status, ... FROM customers ORDER BY id`)

**Why raw SQL:** Fetches all customers for the seed audit log generator. Selects 14 specific columns.
**Can DAL-pg handle it?** YES — `repo.findAll(CustomerEntity, [Project.field(...), ...], { sorting: [Sort.by(field(CustomerEntity, "id"), "ASC")], deletedRecords: "INCLUDED" })`.
**Migration strategy:** Replace with `repo.findAll()` with field projectors for the 14 columns + sorting. Use `deletedRecords: "INCLUDED"` to fetch all customers (including soft-deleted, since the seed needs all).
**Verdict:** **REPLACE with `repo.findAll()`** — no DAL-pg change needed.

#### R18 — `seedAuditLogs()` INSERT audit rows (×5)

**Why raw SQL:** Inserts fake audit log entries for demo data. Uses `pool.query()` directly to INSERT into `customers_audit`.
**Can DAL-pg handle it?** Technically yes — with `AuditLogEntity` + `tableName` override, `repo.add(AuditLogEntity, {...}, { tableName: "customers_audit" })` could insert audit rows. However, the seed fabricates historical timestamps and specific deltas that the normal audit flow wouldn't produce.
**Should this be migrated?** This is SEED/DEMO code that fabricates audit history. It's not production business logic. It writes directly to the audit table to simulate historical events.
**Migration strategy:** Keep as `pool.query()` or `repo.rawSql()`. This is demo seed code — it should not drive DAL-pg design. The `AuditService.writeAudit()` method (R23) is the proper way to write audit records, but the seed needs to fabricate historical timestamps and specific deltas that the normal audit flow wouldn't produce.
**Verdict:** **KEEP AS `rawSql()`** — this is demo/seed code, not production logic.

#### R19 — `seedAuditLogs()` UPDATE customers (×3)

**Why raw SQL:** Updates customer records to reflect the simulated audit state (e.g., set version=3, deleted_at=NULL for the "restored" customer).
**Can DAL-pg handle it?** YES — `repo.update(CustomerEntity, { version: 3, deleted_at: null, deleted_by: null, id }, { actor: "system", matchBy: "id" })`.
**BUT:** These updates set `version` to a specific value (not `version + 1`). DAL-pg's `update()` auto-increments version. The seed needs to set version to an exact value (2, 3) to match the fabricated audit history.
**Migration strategy:** Keep as `rawSql()`. The seed code needs exact version values, not auto-increment. This is a special case for demo data.
**Verdict:** **KEEP AS `rawSql()`** — demo seed code with special version handling.

#### R20 — `seedAuditLogs()` SELECT for delta (`SELECT email, phone, status FROM customers WHERE id = $1`)

**Why raw SQL:** Fetches current customer data to build a delta for the simulated UPDATE audit log.
**Can DAL-pg handle it?** YES — `repo.findById(CustomerEntity, customer.id, { throwIfNotFound: true, deletedRecords: "INCLUDED" })` or `repo.find(CustomerEntity, [Project.field(...)], { filters: [Filter.fieldValue(field(CustomerEntity, "id"), "=", customer.id)], throwIfNotFound: false })`.
**Migration strategy:** Replace with `repo.findById()`. But since this is seed code (R17-R20 are all seed), it's not worth migrating individually.
**Verdict:** **KEEP AS `rawSql()`** — part of seed code cluster (R17-R20).

#### R23 — `AuditService.writeAudit()` (`INSERT INTO {table}_audit ...`)

**Why raw SQL:** The AuditService writes audit records to `{table}_audit` tables. This is the core audit writer.
**Can DAL-pg handle it?** YES — with `AuditLogEntity` + `tableName` override on `add()` (§3.4). The `AuditLogEntity` class provides the column metadata (entity_id, entity_uuid, action, changed_at, changed_by, version, delta), and the `tableName` override targets the specific audit table.
**Key safety points:**
- `AuditLogEntity` has NO `@AuditableField` decorators → `add()`'s audit stamping does NOT trigger (correct — audit rows don't need created_at/created_by stamping)
- No `audit` port passed → `add()`'s audit writing does NOT trigger (correct — we don't audit the audit log)
- `id` is identity PK → `add()` drops it, DB auto-generates
- `delta` is `jsonb` → `jsValueToPgParam` converts the object to JSON string automatically
**Migration strategy:** Replace `pool.query(INSERT ...)` with `repo.add(AuditLogEntity, { entity_id, entity_uuid, action, changed_at, changed_by, version, delta }, { tableName: "{entity}_audit" })`. See §3.4.6 for the full before/after code.
**Verdict:** **REPLACE with `repo.add()` + `AuditLogEntity` + `tableName` override** — requires §3.4 (`tableName` override on `add()`).

### 4.3 Using `Project.expr` for aggregate queries (no DAL-pg enhancement needed)

> **REVISED (2026-07-10):** The original proposal was to add a `count(entity, options?)` method with filters + `deletedRecords`. This is **no longer needed** — DAL-pg already has `Project.expr(expr, alias)` in the query DSL, which combined with `find()` + `Filter` + `deletedRecords` covers R12 and similar aggregate queries.

**Existing DAL-pg `count()` (unchanged):**
```typescript
async count(entity: EntityClass): Promise<bigint> {
  const table = getQualifiedTableName(entity);
  const r = await this.db.query<{ n: bigint }>(`SELECT COUNT(*) AS n FROM ${table}`, []);
  return r.rows?.[0]?.n ?? 0n;
}
```

**Existing `Project.expr` in the DSL** (`src/query/dsl.ts:113-124`):
```typescript
export type FieldProjector =
  | { kind: "field"; field: FieldRef<any, any>; alias?: string }
  | { kind: "expr"; expr: string; alias: string };

export const Project = {
  field(field: FieldRef<any, any>, alias?: string): FieldProjector { ... },
  expr(expr: string, alias: string): FieldProjector { ... },
};
```

**Rendering in query-builder** (`src/query/query-builder.ts:54-55`):
```typescript
if (f.kind === "expr") {
  return `${f.expr} AS ${quoteIdent(f.alias)}`;
}
```

**Anti-injection:** The `alias` is validated by `assertValidIdentPart` (regex `^[A-Za-z_][A-Za-z0-9_]*$`) and quoted via `quoteIdent`. The `expr` string is raw SQL — same trust model as `rawSql()`. The developer is responsible for not interpolating user input into `expr`. Future enhancement: add defense-in-depth validation on `expr` (reject `;`, `--`, `/*`, `*/`).

**Usage for R12 (`getUserCountForOrganization`):**
```typescript
// Before (raw SQL):
const result = await this.pool.query(
  `SELECT COUNT(*) as count FROM public.user_profiles WHERE idp_org = $1 AND deleted_at IS NULL AND is_active = true`,
  [idpCode]
);
return parseInt(result.rows[0].count, 10);

// After (typed DAL — no enhancement needed):
const result = await repo.find<UserProfileEntity, { cnt: bigint }>(
  UserProfileEntity,
  [Project.expr("COUNT(*)", "cnt")],
  {
    filters: [
      Filter.fieldValue(field(UserProfileEntity, "idp_org"), "=", idpCode),
      Filter.fieldValue(field(UserProfileEntity, "is_active"), "=", true),
    ],
    deletedRecords: "EXCLUDED", // excludes soft-deleted (deleted_at IS NULL)
    throwIfNotFound: false,
  }
);
return result?.cnt ?? 0n;
```

**Why this is better than `count(entity, options?)`:**
1. **No new API surface** — uses existing `find()` + `Project.expr` + `Filter` + `deletedRecords`
2. **Composable** — works with joins, sorting, any filter expression, any `deletedRecords` mode
3. **General-purpose** — supports any aggregate (`SUM`, `AVG`, `MIN`, `MAX`), not just `COUNT`
4. **Type-safe** — developer specifies `TResult` to match the custom projection
5. **No duplication** — `count(entity)` stays as a simple convenience method; filtered counts use the general query path

**What's needed:** Only **tests** for `Project.expr` (see §3.3). No source code changes in DAL-pg.

**Note on R13/R15/R21 (audit count queries):** These CANNOT use `Project.expr` + `find()` because audit tables are not entities (no `@Entity` decorator, composite PK, pg_partman partitioning). They stay as `repo.rawSql()`. See R13/R15/R21 analysis above.

### 4.4 BE-side typed audit query helper (thin wrapper around `findByPage`)

**Purpose:** Wrap the `findByPage()` + `AuditLogEntity` + `buildAuditTrailJoins()` pattern in a reusable helper that reduces boilerplate across the 3 DALs.

**Current state:** Each DAL (`customers_dal.ts`, `organizations_dal.ts`, `user-profiles-dal.ts`) has its own copy of the audit query with raw SQL and helper functions (`getAuditUserJoinSql()`, `getAuditSelectWithDisplayName()`).

**Proposed helper (in BE, wraps DAL-pg typed methods — no raw SQL):**

```typescript
// src/db/audit-query-helper.ts (new file in BE)
import {
  AuditLogEntity, Project, Filter, Sort, field, buildAuditTrailJoins,
  entityDateToApiIso, type Repository,
} from "@primebrick/dal-pg";
import { UserProfileEntity } from "../modules/auth/user_profile_entity.js";

export interface AuditPageOptions {
  tableName: string;        // e.g., "customers_audit"
  entityUuid: string;
  page: number;
  limit: number;
}

export interface AuditRow {
  id: bigint;
  entity_id: bigint;
  entity_uuid: string;
  action: string;
  changed_at: string;       // ISO string
  changed_by: string;
  changed_by_display_name: string | null;
  changed_by_idp_code: string | null;
  version: number;
  delta: Record<string, unknown>;
}

export interface AuditPageResult {
  data: AuditRow[];
  pagination: {
    page: number;
    limit: number;
    total: bigint;
    hasMore: boolean;
  };
}

const { joins, projections: joinProjections } = buildAuditTrailJoins(AuditLogEntity, UserProfileEntity);

const AUDIT_PROJECTIONS = [
  Project.field(field(AuditLogEntity, "id")),
  Project.field(field(AuditLogEntity, "entity_id")),
  Project.field(field(AuditLogEntity, "entity_uuid")),
  Project.field(field(AuditLogEntity, "action")),
  Project.field(field(AuditLogEntity, "changed_at")),
  Project.field(field(AuditLogEntity, "changed_by")),
  Project.field(field(AuditLogEntity, "version")),
  Project.field(field(AuditLogEntity, "delta")),
  ...joinProjections,  // changed_by_display_name, changed_by_idp_code
];

/**
 * Fetch a paginated audit trail for a specific entity UUID.
 * Uses AuditLogEntity + tableName override + buildAuditTrailJoins.
 * No raw SQL — fully typed via DAL-pg query DSL.
 */
export async function findAuditPage(repo: Repository, opts: AuditPageOptions): Promise<AuditPageResult> {
  // Count query
  const countResult = await repo.find<AuditLogEntity, { total: bigint }>(
    AuditLogEntity,
    [Project.expr("COUNT(*)", "total")],
    {
      tableName: opts.tableName,
      filters: [Filter.fieldValue(field(AuditLogEntity, "entity_uuid"), "=", opts.entityUuid)],
      throwIfNotFound: false,
    }
  );
  const total = countResult?.total ?? 0n;

  // Data query
  const page = await repo.findByPage<AuditLogEntity>(
    AuditLogEntity,
    AUDIT_PROJECTIONS,
    {
      tableName: opts.tableName,
      joins,
      filters: [Filter.fieldValue(field(AuditLogEntity, "entity_uuid"), "=", opts.entityUuid)],
      sorting: [
        Sort.by(field(AuditLogEntity, "changed_at"), "DESC"),
        Sort.by(field(AuditLogEntity, "id"), "DESC"),
      ],
      page: opts.page,
      limit: opts.limit,
    }
  );

  return {
    data: page.rows.map((row) => ({
      id: row.id,
      entity_id: row.entity_id,
      entity_uuid: row.entity_uuid,
      action: row.action,
      changed_at: entityDateToApiIso(row.changed_at),
      changed_by: row.changed_by,
      changed_by_display_name: (row as any).changed_by_display_name ?? null,
      changed_by_idp_code: (row as any).changed_by_idp_code ?? null,
      version: row.version,
      delta: row.delta,
    })),
    pagination: {
      page: opts.page,
      limit: opts.limit,
      total,
      hasMore: opts.page * opts.limit < Number(total),
    },
  };
}
```

**Usage in `CustomersDal.getCustomerAudit()`:**
```typescript
// Before (raw SQL with helpers):
async getCustomerAudit(uuid: string, page: number, limit: number) {
  const offset = (page - 1) * limit;
  const countQuery = `SELECT COUNT(*) as total FROM public.customers_audit WHERE entity_uuid = $1`;
  const countResult = await this.pool.query(countQuery, [uuid]);
  const total = parseInt(countResult.rows[0].total, 10);
  const query = `SELECT ${getAuditSelectWithDisplayName()} FROM public.customers_audit audit ${getAuditUserJoinSql()} WHERE audit.entity_uuid = $1 ORDER BY audit.changed_at DESC, audit.id DESC LIMIT $2 OFFSET $3`;
  const result = await this.pool.query(query, [uuid, limit, offset]);
  return { data: result.rows.map(...), pagination: { ... } };
}

// After (typed helper — no raw SQL):
async getCustomerAudit(uuid: string, page: number, limit: number) {
  return findAuditPage(this.repo, { tableName: "customers_audit", entityUuid: uuid, page, limit });
}
```

**This helper:**
- Eliminates code duplication across 3 DALs
- Is fully typed (AuditRow, AuditPageResult)
- Uses **no raw SQL** — delegates to `repo.find()` + `repo.findByPage()` with `AuditLogEntity` + `tableName` override + `buildAuditTrailJoins()`
- Is a BE-side utility that wraps DAL-pg typed methods (the `tableName` + `AuditLogEntity` + `buildAuditTrailJoins` are in DAL-pg)
- The regex guardrail is handled by DAL-pg's `renderJoins()` automatically (via `castRightTo: "uuid"`)

### 4.5 Summary — migration verdict per raw SQL site

| # | Site | Verdict | DAL-pg change needed? |
|---|------|---------|----------------------|
| R1 | `checkDb()` health check | KEEP AS `pool.query()` | No |
| R2 | `isPatchBodyAlreadyRecorded()` | KEEP AS `pool.query()` | No |
| R3 | `GET /roles/active` | REPLACE with `repo.findAll()` | No |
| R4 | `loadAllMappings()` | REPLACE with `repo.findAll()` | No |
| R5 | `upsertMapping()` existence check | REPLACE with `repo.upsert()` (eliminates R5+R6) | No |
| R6 | `upsertMapping()` update path | REPLACE with `repo.upsert()` (eliminates R5+R6) | No |
| R7 | `deleteMapping()` | REPLACE with `repo.hardDelete(matchBy: "idp_role")` | No |
| R8 | `resolveInternalUuid()` fast SELECT | REPLACE with `repo.find()` | No |
| R9 | `resolveInternalUuid()` sync update | REPLACE with `repo.update(matchBy: "idp_code")` | No |
| R10 | `resolveInternalUuid()` JIT upsert | REPLACE with `repo.upsert(conflictTarget: "idp_code")` | Requires Phase 0 G2 (audit on upsert) |
| R11 | `createUser()` JIT insert | REPLACE with `repo.add()` | No |
| R12 | `getUserCountForOrganization()` | REPLACE with `repo.find()` + `Project.expr('COUNT(*)', 'cnt')` + filters | No (tests only) |
| R13 | `getOrganizationAudit()` count | REPLACE with `repo.find()` + `AuditLogEntity` + `Project.expr('COUNT(*)', 'total')` + `tableName` override | Yes — §3.4 (`AuditLogEntity` + `tableName` override) |
| R14 | `getOrganizationAudit()` data | REPLACE with `findAuditPage()` helper (wraps `findByPage` + `AuditLogEntity` + `buildAuditTrailJoins`) | Yes — §3.4 |
| R15 | `getUserProfileAudit()` count | REPLACE with `repo.find()` + `AuditLogEntity` + `Project.expr('COUNT(*)', 'total')` + `tableName` override | Yes — §3.4 |
| R16 | `getUserProfileAudit()` data | REPLACE with `findAuditPage()` helper (wraps `findByPage` + `AuditLogEntity` + `buildAuditTrailJoins`) | Yes — §3.4 |
| R17 | `seedAuditLogs()` fetch all | REPLACE with `repo.findAll()` | No |
| R18 | `seedAuditLogs()` INSERT audit (×5) | KEEP AS `rawSql()` (demo seed code) | No |
| R19 | `seedAuditLogs()` UPDATE customers (×3) | KEEP AS `rawSql()` (demo seed, exact version) | No |
| R20 | `seedAuditLogs()` SELECT for delta | KEEP AS `rawSql()` (part of seed cluster) | No |
| R21 | `getCustomerAudit()` count | REPLACE with `repo.find()` + `AuditLogEntity` + `Project.expr('COUNT(*)', 'total')` + `tableName` override | Yes — §3.4 |
| R22 | `getCustomerAudit()` data | REPLACE with `findAuditPage()` helper (wraps `findByPage` + `AuditLogEntity` + `buildAuditTrailJoins`) | Yes — §3.4 |
| R23 | `AuditService.writeAudit()` | REPLACE with `repo.add()` + `AuditLogEntity` + `tableName` override | Yes — §3.4 (`tableName` override on `add()`) |

**Tally:**
- **REPLACE with typed DAL method:** 17 sites (R3, R4, R5+R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R21, R22, R23)
- **KEEP AS rawSql/pool.query:** 6 sites (R1, R2, R18, R19, R20)
- **DAL-pg source enhancement required:** §3.4 (`AuditLogEntity` class + `@AuditTrailEntity` decorator + `tableName` override option on finders + writers + `buildAuditTrailJoins()` function)
- **DAL-pg test enhancement required:** Tests for `Project.expr` projection (§3.3, 7 cases) + tests for `AuditLogEntity` + `tableName` override + `buildAuditTrailJoins` (§3.4)

### 4.6 Why the 6 "KEEP AS rawSql" sites are acceptable

These 6 sites fall into 2 categories, none of which should drive DAL-pg design:

1. **Infrastructure (R1, R2):** Health checks and patch registry. These are below the entity layer — they're database infrastructure, not business logic. The `primebrick_database_patches` table and the `SELECT 1` health check don't have entities and shouldn't.

2. **Demo seed code (R18-R20):** The `seedAuditLogs()` method fabricates historical audit entries with exact version numbers and specific timestamps. This is demo data generation, not production logic. It needs to bypass the normal audit flow and set exact version values (not auto-increment).

**Principle:** DAL-pg should provide typed methods for entity CRUD + queries, including audit trail queries and writes via `AuditLogEntity` + `tableName` override. Raw SQL is the correct escape hatch for infrastructure and demo/seed special cases. The 6 remaining rawSql sites are legitimate uses of the escape hatch.

---

## 5. BE-side migration — adapter layer

### 5.1 Dal gateway integration

**File:** `primebrick-be-v3/src/db/dal-gateway.ts` (new)

Replace `src/db/pool.ts` singleton with a Dal gateway wrapper:

```typescript
import { Dal, getDal } from "@primebrick/dal-pg";

let dalInstance: Dal | null = null;

export function initDal(): Dal {
  if (dalInstance) return dalInstance;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  dalInstance = getDal({
    connectionString,
    schema: "public",
    max: 10,
    statementTimeoutMs: 30000,
    applicationName: "primebrick-api",
  });
  return dalInstance;
}

export function getPool(): pg.Pool {
  return initDal().getPool();
}

export async function closeDal(): Promise<void> {
  if (dalInstance) {
    await dalInstance.close();
    dalInstance = null;
  }
}
```

**Migration path:** `getPool()` still returns a `pg.Pool` (from the Dal gateway), so existing code that uses `pool.query()` directly (e.g., `UserService.createUser` raw SQL, audit queries) continues to work. DAL classes switch to using `dal.getPool()` or `dal.withClient()` for transactions.

### 5.2 AuditPort adapter

**File:** `primebrick-be-v3/src/db/audit-port-adapter.ts` (new)

Wraps the audit write as a DAL-pg `AuditPort` implementation. When DAL-pg's `Repository.add()` / `update()` / `delete()` etc. complete a write on an auditable entity, they call `options.audit.writeAudit(params)` fire-and-forget. The `BeAuditPortAdapter` receives those params and writes the audit row using `repo.add(AuditLogEntity, {...}, { tableName })` — no raw SQL.

**The flow:**
```
BE caller: repo.add(CustomerEntity, { ... }, { actor, audit: beAuditPortAdapter })
  ↓
DAL-pg Repository.add():
  1. INSERT INTO "public"."customers" (...) RETURNING *  ← entity row
  2. beAuditPortAdapter.writeAudit({ tableName: "customers", entityId, ... })  ← fire-and-forget
  ↓
BeAuditPortAdapter.writeAudit():
  3. repo.add(AuditLogEntity, { entity_id, entity_uuid, action, ... }, { tableName: "customers_audit" })
  ↓
DAL-pg Repository.add() (recursive, but on a different entity/table):
  4. INSERT INTO "public"."customers_audit" (...) RETURNING *  ← audit row
```

**No `writeAuditByTable` method.** The adapter derives the audit table name from `params.tableName + "_audit"` (explicit, one place) and delegates to `repo.add()` with `tableName` override. The `AuditLogEntity` class provides column metadata and type coercion. No raw SQL anywhere in the audit write path.

**No infinite recursion.** `AuditLogEntity` is NOT decorated with `@AuditableField` and the `add()` call in the adapter does NOT pass an `audit` port — so step 4 does NOT trigger another `writeAudit()` call. The recursion terminates at depth 2.

```typescript
import type { AuditPort, AuditParams, AuditLogEntity, Repository } from "@primebrick/dal-pg";

export class BeAuditPortAdapter implements AuditPort {
  constructor(private repo: Repository) {}

  async writeAudit(params: AuditParams): Promise<void> {
    // AuditParams contains: entityClassName, tableName (e.g. "customers"),
    //   entityId, entityUuid, action, changedAt, version, changedBy, delta
    //
    // The audit table name is derived by appending "_audit" to the entity table name.
    // This convention is explicit here (single source of truth) and matches the
    // BE's existing AuditService behavior: `${getTableName(entityClass)}_audit`.
    const auditTableName = `${params.tableName}_audit`;

    await this.repo.add(AuditLogEntity, {
      entity_id: params.entityId,
      entity_uuid: params.entityUuid,
      action: params.action,
      changed_at: params.changedAt,
      changed_by: params.changedBy,
      version: params.version,
      delta: params.delta,
    }, { tableName: auditTableName });
    // No audit port passed → no recursive audit writing.
    // AuditLogEntity has no @AuditableField → no audit stamping.
    // id is identity PK → auto-generated by DB.
  }
}
```

**No `AuditService` refactor needed.** The existing `AuditService` class (with its raw SQL `writeAudit`) is replaced entirely by `BeAuditPortAdapter`. The old `AuditService` can be deleted in Phase 5 (cleanup). The `BeAuditPortAdapter` IS the new audit writer — it uses `repo.add()` + `AuditLogEntity` + `tableName` override, no raw SQL.

**Construction:** The adapter needs a `Repository` instance to call `repo.add()`. It's constructed once at startup and passed to every `repo.add()` / `update()` / `delete()` call via the `audit` option:

```typescript
// In dal-gateway.ts or startup code:
const repo = new Repository(getPool());
const auditPort = new BeAuditPortAdapter(repo);

// Passed to every write call:
await repo.add(CustomerEntity, { ... }, { actor, audit: auditPort });
await repo.update(CustomerEntity, { ... }, { actor, audit: auditPort, matchBy: "uuid" });
```

### 5.3 Entity migration

The 3 main entities already use the same decorator system (`@Entity`, `@Key`, `@Unique`, `@Column`, `@AuditableField`, `@DeletableField`, `@CloneField`, `@SynchronizableField`, `@AuditTrail`). The DAL-pg uses the same decorator names and semantics.

**Key difference:** BE's `@Entity("customers")` defaults schema to `"public"`. DAL-pg's `@Entity("customers", "public")` takes an explicit schema param. The BE entities need to add the schema parameter OR rely on the Dal gateway's `schema: "public"` default.

**Migration steps per entity:**
1. Change import: from `../../domain/entities/entity-decorators.js` → from `@primebrick/dal-pg`
2. Add schema param to `@Entity` if needed (or rely on Dal gateway default)
3. Verify all decorators work identically (they should — same decorator system)
4. Remove the old `entity-decorators.ts` duplicate (BE's copy)

### 5.4 DAL class migration

For each of the 5 DAL classes (`CustomersDal`, `OrganizationsDal`, `UserProfilesDal`, `AuthConfigurationsDal`, `RoleMappingRepo`):

1. Replace `new Repository(pool, auditService)` with `new Repository(getPool())` + pass `BeAuditPortAdapter` via options
2. Replace `repo.insertMany(entity, rows)` → `repo.add(entity, row, { actor, audit })` or `repo.addMany(entity, rows, { actor, audit })`
3. Replace `repo.update(entity, uuid, updates, updatedBy)` → `repo.update(entity, { ...updates, uuid }, { actor, audit, matchBy: "uuid" })`
4. Replace `repo.delete(entity, uuid, deletedBy)` → `repo.delete(entity, { uuid }, { actor, audit, matchBy: "uuid" })`
5. Replace `repo.restore(entity, uuid, restoredBy)` → `repo.restore(entity, { uuid }, { actor, audit, matchBy: "uuid" })`
6. Replace `repo.clone(entity, sourceUuid, clonedBy)` → `repo.clone(entity, sourceUuid, { actor, audit })`
7. Replace `repo.hardDelete(entity, uuid, deletedBy)` → `repo.hardDelete(entity, { uuid }, { actor, audit, matchBy: "uuid" })`
8. Replace `repo.find(entity, fields, { ... })` → `repo.find(entity, fields, { throwIfNotFound: false, ... })` (preserve BE's null-return behavior)
9. Replace `repo.findById(entity, id, { throwExceptionIfNullOrMany: true/false })` → `repo.findById(entity, id, { throwIfNotFound: true/false })`
10. Keep `repo.rawSql()` for audit queries and custom SQL (e.g., `getUserCountForOrganization`)
11. Keep `repo.findByPage()` — same API

---

## 6. Test suite — 3 main entities

### 6.1 Test architecture

**Two layers (mirrors emailsender pattern):**

1. **Unit tests** (`src/modules/__tests__/*.unit.test.ts`) — pure logic, no DB, no network
   - Entity metadata verification (decorators, columns, types)
   - DAL method call verification (mock the Repository, verify correct calls)
   - Service business logic (mock the DAL)
   - Router validation logic

2. **Integration tests** (`test/integration/*.integration.test.ts`) — real PostgreSQL via Dal gateway
   - Full CRUD lifecycle per entity
   - Audit trail verification (write op → audit row exists with correct action + delta)
   - Soft-delete + restore lifecycle
   - Clone lifecycle (Customer only)
   - Version increment verification
   - Soft-delete filter verification (EXCLUDED/ONLY/INCLUDED)
   - Pagination + total_records
   - Type coercion (bigint id, jsonb roles, timestamptz dates)
   - NotFoundError on missing records

**Test config:**
- `vitest.config.ts` — unit tests (existing, extend to new test files)
- `vitest.integration.config.ts` — integration tests (new), `fileParallelism: false` for DB safety
- `test/helpers/setup.ts` — shared Dal gateway, idempotent DDL, TRUNCATE between tests

### 6.2 Customer entity test plan

#### Unit tests (`customers.unit.test.ts`)

| # | Test | Verifies |
|---|------|----------|
| C-U1 | Entity metadata: 24 columns, correct decorators | `@Key` on id, `@Unique` on uuid+code, `@AuditableField` on 5 audit fields, `@DeletableField` on 2, `@CloneField` on cloned_from |
| C-U2 | Entity metadata: table name "customers", schema "public" | `@Entity("customers")` |
| C-U3 | Entity metadata: column types | id=bigint, uuid=uuid, code=varchar(20), email=varchar(320), status=text, onboarding_at=timestamptz |
| C-U4 | DAL.createCustomer calls repo.add with correct fields | UUID generated, code set, status set, actor from requireActor |
| C-U5 | DAL.updateCustomer calls repo.update with matchBy:"uuid" | Correct fields, actor passed |
| C-U6 | DAL.deleteCustomer calls repo.delete with matchBy:"uuid" | Soft-delete, actor passed |
| C-U7 | DAL.duplicateCustomer calls repo.clone | Source UUID, actor passed |
| C-U8 | DAL.listCustomers builds correct filters | ILIKE search, status filter, advanced filters |
| C-U9 | Service.getCustomer throws NotFoundError when null | Error propagation |
| C-U10 | Service.duplicateCustomers throws ApiError on partial failure | Bulk error handling |

#### Integration tests (`customer.integration.test.ts`)

| # | Test | Verifies |
|---|------|----------|
| C-I1 | Create customer → row exists with correct fields | add() returns full row, uuid generated |
| C-I2 | Create customer → audit row exists with INSERT action | audit table has row, delta has all fields |
| C-I3 | Find by UUID → returns correct customer | findByUUID works |
| C-I4 | Find by UUID (non-existent) → returns null (not throw) | throwIfNotFound: false |
| C-I5 | Update customer → fields changed, version incremented | version = old + 1 |
| C-I6 | Update customer → audit row exists with UPDATE action | delta has changed fields + forced updated_at/updated_by |
| C-I7 | Update customer (non-existent) → throws NotFoundError | Error with RFC 7807 instance path |
| C-I8 | Soft-delete customer → deleted_at set, deleted_by set | Soft-delete, not physical |
| C-I9 | Soft-delete customer → audit row exists with SOFT_DELETE action | Delta has deleted_at, deleted_by, updated_at, updated_by |
| C-I10 | Find after soft-delete (EXCLUDED) → not found | Default filter excludes deleted |
| C-I11 | Find after soft-delete (ONLY) → found | Only deleted records |
| C-I12 | Find after soft-delete (INCLUDED) → found | No filter |
| C-I13 | Restore customer → deleted_at null, deleted_by null, version incremented | Restore works |
| C-I14 | Restore customer → audit row exists with RESTORE action | Delta has deleted_at (null), deleted_by (null) |
| C-I15 | Clone customer → new UUID, cloned_from = source UUID | Clone field tracking |
| C-I16 | Clone customer → audit fields reset (version=1, created_at=now, created_by=actor) | Audit reset |
| C-I17 | Clone customer → no audit row written (clone does not audit) | No audit entry |
| C-I18 | Clone soft-deleted customer → clone is not soft-deleted | Deletable fields reset |
| C-I19 | Paginated list → correct page, total_records | Window function |
| C-I20 | Paginated list with filters → filtered results | ILIKE, status filter |
| C-I21 | count() → returns total count (including soft-deleted) | Count behavior |
| C-I22 | Type coercion: id is bigint (not string) | INT8 type parser |
| C-I23 | Type coercion: onboarding_at is Date | timestamptz → Date |
| C-I24 | Type coercion: roles jsonb (if applicable) | JSONB handling |
| C-I25 | Hard-delete customer → physical DELETE, row gone | hardDelete works |
| C-I26 | Hard-delete customer → audit row exists with HARD_DELETE action | Delta has all old fields, new is empty |
| C-I27 | Bulk: addMany → all rows inserted, RETURNING * | Bulk insert |
| C-I28 | Bulk: deleteMany → all soft-deleted | Bulk soft-delete |

### 6.3 Organization entity test plan

#### Unit tests (`organizations.unit.test.ts`)

| # | Test | Verifies |
|---|------|----------|
| O-U1 | Entity metadata: 16 columns, correct decorators | @Key, @Unique (uuid + idp_code), @AuditableField, @DeletableField, @SynchronizableField |
| O-U2 | Entity metadata: table "organizations", schema "public" | @Entity |
| O-U3 | Entity metadata: column types | id=bigint, uuid=uuid, idp_code=varchar(255), avatar=text, last_synced_at=timestamp with time zone |
| O-U4 | DAL.createOrganization calls repo.add | UUID generated, idp_code set, actor |
| O-U5 | DAL.updateOrganization calls repo.update with matchBy:"uuid" | Correct fields |
| O-U6 | DAL.getByIdpCode calls repo.find with filter | Filter on idp_code |
| O-U7 | DAL.getUserCountForOrganization uses rawSql | Custom SQL preserved |
| O-U8 | Service.createOrganization syncs to Casdoor first | Casdoor integration (mocked) |

#### Integration tests (`organization.integration.test.ts`)

| # | Test | Verifies |
|---|------|----------|
| O-I1 | Create organization → row exists | add() works |
| O-I2 | Create organization → audit INSERT | Audit trail |
| O-I3 | Find by UUID → correct org | findByUUID |
| O-I4 | Find by idp_code → correct org | find with filter |
| O-I5 | Update organization → fields changed, version+1 | Update + version |
| O-I6 | Update organization → audit UPDATE | Delta + forced fields |
| O-I7 | Soft-delete → deleted_at set | Soft-delete |
| O-I8 | Soft-delete → audit SOFT_DELETE | Audit trail |
| O-I9 | Restore → deleted_at null, version+1 | Restore |
| O-I10 | Restore → audit RESTORE | Audit trail |
| O-I11 | Unique constraint: duplicate idp_code throws | DB constraint |
| O-I12 | Paginated list → correct page | Pagination |
| O-I13 | getUserCountForOrganization → correct count | Raw SQL preserved |
| O-I14 | Type coercion: last_synced_at is Date | Timestamp handling |
| O-I15 | Type coercion: id is bigint | INT8 parser |

### 6.4 User Profile entity test plan

#### Unit tests (`user-profiles.unit.test.ts`)

| # | Test | Verifies |
|---|------|----------|
| U-U1 | Entity metadata: 21 columns, correct decorators | @Key, @Unique (uuid + idp_code), @AuditableField, @DeletableField, @SynchronizableField |
| U-U2 | Entity metadata: table "user_profiles", schema "public" | @Entity |
| U-U3 | Entity metadata: column types | id=bigint, uuid=uuid, is_active=boolean, is_admin=boolean, roles=jsonb, last_synced_at=timestamptz |
| U-U4 | DAL.updateProfile calls repo.update with matchBy:"uuid" | Correct fields |
| U-U5 | DAL.softDelete calls repo.delete with matchBy:"uuid" | Soft-delete |
| U-U6 | DAL.restore calls repo.restore with matchBy:"uuid" | Restore |
| U-U7 | DAL.getByEmail calls repo.find with email filter | Filter on email |
| U-U8 | DAL.getByIdpCode calls repo.find with idp_code filter | Filter on idp_code |
| U-U9 | Service.createUser uses direct SQL (JIT provisioning) | Special case — may stay as rawSql |

#### Integration tests (`user-profile.integration.test.ts`)

| # | Test | Verifies |
|---|------|----------|
| U-I1 | Create user profile (via add) → row exists | add() works |
| U-I2 | Create user profile → audit INSERT | Audit trail |
| U-I3 | Find by UUID → correct profile | findByUUID |
| U-I4 | Find by email → correct profile | find with filter |
| U-I5 | Find by idp_code → correct profile | find with filter |
| U-I6 | Update profile → fields changed, version+1 | Update + version |
| U-I7 | Update profile → audit UPDATE | Delta + forced fields |
| U-I8 | Soft-delete → deleted_at set, is_active still true (DAL doesn't touch is_active) | Soft-delete only touches deleted_at |
| U-I9 | Soft-delete → audit SOFT_DELETE | Audit trail |
| U-I10 | Restore → deleted_at null, version+1 | Restore |
| U-I11 | Restore → audit RESTORE | Audit trail |
| U-I12 | Unique constraint: duplicate idp_code throws | DB constraint |
| U-I13 | Type coercion: roles (jsonb) is array | JSONB → JS array |
| U-I14 | Type coercion: is_active (boolean) is boolean | Boolean handling |
| U-I15 | Type coercion: is_admin (boolean) is boolean | Boolean handling |
| U-I16 | Type coercion: id is bigint | INT8 parser |
| U-I17 | Type coercion: last_synced_at is Date | Timestamp handling |
| U-I18 | Paginated list → correct page | Pagination |
| U-I19 | Hard-delete → physical DELETE, audit HARD_DELETE | Hard delete + audit |
| U-I20 | Audit query (getAuditByUuid) → returns audit history with display_name joins | Custom audit SQL preserved |

### 6.5 Cross-entity integration tests

| # | Test | Verifies |
|---|------|----------|
| X-I1 | Auditable joins: find customer with includeAuditableJoins → created_by_name populated | Join to user_profiles |
| X-I2 | Auditable joins: find with "system" actor → created_by_name is null (no user_profiles match) | UUID regex guardrail |
| X-I3 | Transaction: withClient → rollback on error | Transaction support |
| X-I4 | Dal gateway: statement_timeout enforced | Anti-throttling |
| X-I5 | Dal gateway: search_path set to "public" | Schema isolation |

---

## 7. Implementation phases

### Phase 0 — DAL-pg prerequisites (in `primebrick-dal-v3`)
1. Implement `clone()` method (§3.1)
2. Add delta calculator (§3.2.5)
3. Extend audit to update/delete/restore/hardDelete/upsert (§3.2.1-3.2.4)
4. Add tests for `Project.expr` projection (§3.3) — REQUIRED for R12. No source changes, only new tests.
5. Add `AuditLogEntity` class + `@AuditTrailEntity` decorator + `tableName` override option + `buildAuditTrailJoins()` function (§3.4) — REQUIRED for R13-R16, R21-R22
6. Add unit tests for clone + audit-on-all-writes + `Project.expr` + `AuditLogEntity` + `tableName` override + `buildAuditTrailJoins` in DAL-pg
7. Bump version, publish

### Phase 1 — BE adapter layer (in `primebrick-be-v3`)
1. Add `@primebrick/dal-pg` + `@primebrick/sdk` to `package.json` (workspace deps)
2. Create `src/db/dal-gateway.ts` (§5.1)
3. Create `src/db/audit-port-adapter.ts` (§5.2) — `BeAuditPortAdapter` uses `repo.add(AuditLogEntity, {...}, { tableName })`, no raw SQL, no `writeAuditByTable`
4. Create `src/db/audit-query-helper.ts` — typed `findAuditPage()` helper (§4.4)
5. Verify build passes (no DAL class changes yet — just adapters exist)

### Phase 2 — Entity migration (in `primebrick-be-v3`)
1. Migrate `CustomerEntity` imports from BE decorators → `@primebrick/dal-pg` decorators
2. Migrate `OrganizationEntity` imports
3. Migrate `UserProfileEntity` imports
4. Migrate `AuthConfigurationEntity` imports
5. Migrate `RoleMappingEntity` imports
6. Verify entity metadata is identical (write a unit test that checks column count, types, decorators)
7. Remove old `src/domain/entities/entity-decorators.ts` (BE's duplicate)
8. Verify build passes

### Phase 3 — DAL class migration (in `primebrick-be-v3`)
1. Migrate `CustomersDal` (§5.4) — most complex (clone, streaming, bulk ops, seed audit)
   - Replace `seedAuditLogs()` fetch (R17) with `repo.findAll()`
   - Keep `seedAuditLogs()` audit INSERTs + version-specific UPDATEs as `rawSql()` (R18-R20, demo seed)
   - Replace `getCustomerAudit()` count (R21) with `repo.find(AuditLogEntity, [Project.expr("COUNT(*)", "total")], { tableName: "customers_audit", filters })`
   - Replace `getCustomerAudit()` data (R22) with `findAuditPage()` helper (wraps `findByPage` + `AuditLogEntity` + `buildAuditTrailJoins`)
2. Migrate `OrganizationsDal` (§5.4)
   - Replace `getUserCountForOrganization()` (R12) with `repo.find(UserProfileEntity, [Project.expr("COUNT(*)", "cnt")], { filters, deletedRecords: "EXCLUDED", throwIfNotFound: false })`
   - Replace `getOrganizationAudit()` count (R13) with `repo.find(AuditLogEntity, [Project.expr("COUNT(*)", "total")], { tableName: "organizations_audit", filters })`
   - Replace `getOrganizationAudit()` data (R14) with `findAuditPage()` helper
3. Migrate `UserProfilesDal` (§5.4)
   - Replace `getUserProfileAudit()` count (R15) with `repo.find(AuditLogEntity, [Project.expr("COUNT(*)", "total")], { tableName: "user_profiles_audit", filters })`
   - Replace `getUserProfileAudit()` data (R16) with `findAuditPage()` helper
4. Migrate `AuthConfigurationsDal` (§5.4) — simplest (no audit, no soft-delete)
5. Migrate `RoleMappingRepo` (§5.4)
   - Replace `loadAllMappings()` (R4) with `repo.findAll()`
   - Replace `upsertMapping()` (R5+R6) with `repo.upsert(conflictTarget: "idp_role")`
   - Replace `deleteMapping()` (R7) with `repo.hardDelete(matchBy: "idp_role")`
6. Migrate `UserService.createUser` (R11) to `repo.add()` — removes manual audit field setting
7. Migrate `resolveInternalUuid()` (R8-R10) to `repo.find()` + `repo.update()` + `repo.upsert()`
8. Migrate `GET /roles/active` handler (R3) to `repo.findAll(RoleMappingEntity)`
9. Keep `checkDb()` (R1) and `isPatchBodyAlreadyRecorded()` (R2) as `pool.query()` — infrastructure
10. Migrate `AuditService.writeAudit()` (R23) to `repo.add(AuditLogEntity, {...}, { tableName: "{entity}_audit" })` — no raw SQL in the audit writer
11. Verify build passes

### Phase 4 — Test suite (in `primebrick-be-v3`)
1. Create `test/helpers/setup.ts` — Dal gateway, DDL, TRUNCATE
2. Create `vitest.integration.config.ts`
3. Write Customer unit tests (C-U1 through C-U10)
4. Write Customer integration tests (C-I1 through C-I28)
5. Write Organization unit tests (O-U1 through O-U8)
6. Write Organization integration tests (O-I1 through O-I15)
7. Write User Profile unit tests (U-U1 through U-U9)
8. Write User Profile integration tests (U-I1 through U-I20)
9. Write cross-entity integration tests (X-I1 through X-I5)
10. Run all tests, fix failures

### Phase 5 — Cleanup + verification
1. Remove old `src/db/repository/repository.ts` (BE's embedded Repository)
2. Remove old `src/db/repository/query-builder.ts`
3. Remove old `src/db/repository/dsl.ts`
4. Remove old `src/db/repository/types.ts`
5. Remove old `src/db/repository/auditable-joins.ts`
6. Remove old `src/domain/entities/entity-meta.ts` (re-export module)
7. Remove old `src/domain/entities/column-pg-io.ts`
8. Remove old `src/db/entity-ts-to-pg.ts`
9. Remove old `src/db/pool.ts` (replaced by dal-gateway)
10. Verify no imports reference deleted files
11. Run full build + all tests
12. Manual smoke test: start BE dev server, test CRUD endpoints

---

## 8. Native bigint serialization — COMPLETED (2026-07-10)

> **Status: COMPLETED** — The original recommendation (override INT8 to `number`) was REJECTED. Full native `bigint` adoption was implemented instead, with `json-bigint` for JSON serialization.

### 8.1 What was done

The `::text` cast was eliminated, and native `bigint` was adopted end-to-end: PostgreSQL `bigint` column → pg INT8 type parser → JS `bigint` → TypeScript `bigint` type → `json-bigint` serialization → JSON wire format → `json-bigint` deserialization → JS `bigint`.

### 8.2 Architecture

```
PostgreSQL bigint (OID 20)
    ↓ pg types.setTypeParser(INT8, BigInt)
JS bigint (runtime)
    ↓ TypeScript: id: bigint
Entity / DAL / Service layer
    ↓ extJsonMiddleware (BE) / extJsonStringify (US NATS)
JSON wire format (bigint as JSON number, not string)
    ↓ extJsonParse (FE)
JS bigint (FE runtime)
    ↓ TypeScript: total: bigint
Svelte component
```

### 8.3 SDK layer (`primebrick-v3-sdk`)

- `src/json/ext-json.ts`: `extJsonStringify()`, `extJsonParse()` with reviver (all integers → `bigint`), `extJsonMiddleware()` using Express types
- `src/nats/nats-client.ts`: `publish()`, `subscribe()`, `subscribeRequest()` — abstract extJson serialization internally
- `src/http/http-server.ts`: Uses `extJsonStringify` for health check responses
- `package.json`: Exports `./json` subpath; depends on `json-bigint@^1.0.0`, `@types/express@^5.0.6`

### 8.4 DAL-pg layer (`primebrick-dal-v3`)

- `count()`: Returns `bigint`, no `::text` cast
- `findByPage()`: `total_records: bigint`
- `findById()`: `id: bigint | string`
- `AuditParams.entityId: bigint`
- All test entities: `id!: bigint`
- All test assertions: `0n` instead of `0`

### 8.5 BE layer (`primebrick-be-v3`)

- `src/db/pool.ts`: `types.setTypeParser(types.builtins.INT8, (val: string) => BigInt(val))`
- `src/index.ts`: `app.use(extJsonMiddleware())` — all HTTP responses serialized with `json-bigint`
- All 6 entity `id` fields: `bigint` (Customer, Organization, UserProfile, AuthConfiguration, RoleMapping, ServiceRegistry)
- `AuditService.writeAudit`: `entityId: bigint`
- All 6 repository audit casts: `as bigint` (was `as number`)
- `seedIfEmpty()`: `count > 0n`
- Debug toggle: `total: 0n`
- `makeCode(id: bigint | number)`
- 4 audit count queries: `Number(countResult.rows[0].total)` — intentionally kept as `number` for audit pagination DTOs

### 8.6 FE layer (`primebrick-fe-v3`)

- `src/lib/api-ext.ts`: Standalone `extJsonParse()` (does NOT depend on SDK — FE installs `json-bigint` directly)
- 5 call sites migrated from `res.json()` to `extJsonParse(await res.text())`:
  1. `customers/+page.svelte` line 471
  2. `organizations/+page.svelte` line 427
  3. `users/+page.svelte` line 305
  4. `VersionHistoryPanel.svelte` line 67
  5. `VersionHistoryPanel.svelte` line 92
- `total` state variables: `$state<bigint>(0n)` in all list pages
- `versionHistoryTotal: $state<bigint>(0n)` with `|| 0n` fallback
- `EntityListTableProps.total: bigint`

### 8.7 US layer (`primebrick-us-v3` / emailsender)

- `test/helpers/setup.ts`: `entity_id bigint` (was `text`)
- `db-meta/snapshot-entities.json`: `entity_id` dataType/typname: `bigint`
- `db-meta/patches/0001_initial_schema.sql`: Consolidated initial schema (3 patches → 1), `entity_id bigint`
- All entity `id` fields: `bigint`
- NATS types: `entityId?: bigint`, `logId?: bigint`
- Uses SDK's `NatsClient.publish/subscribe` which handle extJson serialization internally

### 8.8 Verification results (2026-07-10)

| Package | Build | Tests | Typecheck |
|---------|-------|-------|-----------|
| SDK | pass | 68/68 pass | — |
| DAL-pg | pass | 125/125 pass | — |
| BE | pass | — | — |
| FE | — | — | 0 errors (svelte-check) |
| US | pass | 17/17 pass | — |

### 8.9 Key design decisions

1. **`alwaysParseAsBig` via reviver** — The `json-bigint` `alwaysParseAsBig` option was broken for floats in v1.0.0. A custom reviver is used instead: `if (typeof value === "number" && Number.isInteger(value)) return BigInt(value)`. This makes ALL integers `bigint` and ALL floats `number` — predictable, no ambiguity.

2. **FE standalone implementation** — The FE does NOT depend on `@primebrick/sdk` (which is BE/US/DAL only). The FE installs `json-bigint` directly and implements `extJsonParse` in `src/lib/api-ext.ts`.

3. **Audit count queries kept as `number`** — 4 call sites use `Number(countResult.rows[0].total)` for audit pagination totals. This is intentional: audit totals are small row counts, and the DTO type is `number`. The `extJsonMiddleware` reviver will still parse them as `bigint` on the FE side, but the BE DTO type is `number` — this is a type lie that is harmless because `extJsonStringify` handles both `number` and `bigint`.

4. **US NATS abstraction** — US services use `NatsClient.publish()`/`subscribe()` without direct interaction with `extJsonStringify`/`extJsonParse`. The SDK handles serialization internally.

5. **Consolidated US migration patch** — The 3 separate SQL patches were consolidated into `0001_initial_schema.sql` for the alpha stage. This creates all 4 tables (`providers`, `email_templates`, `email_templates_communication_log`, `config`) in final form with `entity_id bigint`.

---

## 9. Files impacted

### `primebrick-dal-v3` (Phase 0)
| File | Action | Status |
|------|--------|--------|
| `src/repository/repository.ts` | Add `clone()`, extend audit on update/delete/restore/hardDelete/upsert | PENDING |
| `src/repository/repository.ts` | `count()` returns `bigint`, `findById()` accepts `bigint \| string`, audit cast `as bigint` | **COMPLETED** |
| `src/repository/repository.ts` | Add `tableName` override option to `find()`, `findAll()`, `findByPage()`, `count()`, `add()`, `addMany()` | PENDING |
| `src/audit/delta-calculator.ts` | New — port from BE | PENDING |
| `src/audit/audit-log-entity.ts` | New — `AuditLogEntity` class with `@AuditTrailEntity` decorator | PENDING |
| `src/audit/auditable-joins.ts` | Add `buildAuditTrailJoins(auditEntity, userEntity)` function | PENDING |
| `src/meta/entity-decorators.ts` | Add `@AuditTrailEntity({ changedByColumn })` decorator + `isAuditTrailEntity` + `auditTrailChangedByColumn` metadata | PENDING |
| `src/query/query-builder.ts` | `renderProjection` handles `kind: "expr"` — no changes needed | **ALREADY EXISTS** |
| `src/query/query-builder.ts` | Add `tableName` override in `buildSelectQuery()` (one `if` branch) | PENDING |
| `src/types/types.ts` | Add `CloneOptions` type if needed | PENDING |
| `src/types/types.ts` | `PaginatedEntity.total_records: bigint`, `AuditParams.entityId: bigint` | **COMPLETED** |
| `src/dal/dal.ts` | `findById()` signature: `id: bigint \| string` | **COMPLETED** |
| `src/index.ts` | Export `AuditLogEntity`, `@AuditTrailEntity`, `buildAuditTrailJoins` | PENDING |
| `src/query/dsl.ts` | `Project.expr(expr, alias)` already exists — no changes needed | **ALREADY EXISTS** |
| `test/` | New tests for `Project.expr` projection (7 test cases, §3.3) | PENDING |
| `test/` | New tests for `AuditLogEntity` + `tableName` override + `buildAuditTrailJoins` (§3.4) | PENDING |
| `test/` | New tests for clone + audit-on-all-writes | PENDING |
| `test/entities/*.ts` | All test entities: `id!: bigint` | **COMPLETED** |
| `test/repository-crud.test.ts` | `toBeGreaterThan(0n)` | **COMPLETED** |
| `test/repository-bulk.test.ts` | `toBeGreaterThan(0n)` | **COMPLETED** |
| `test/dal.test.ts` | `as unknown as bigint` | **COMPLETED** |
| `package.json` | Version bump | PENDING |

### `primebrick-be-v3` (Phases 1-5)
| File | Action | Status |
|------|--------|--------|
| `package.json` | Add `@primebrick/dal-pg`, `@primebrick/sdk` deps | `@primebrick/sdk: workspace:*` **COMPLETED**, `@primebrick/dal-pg` PENDING |
| `src/index.ts` | Add `extJsonMiddleware` | **COMPLETED** — `app.use(extJsonMiddleware())` |
| `src/db/pool.ts` | Register INT8 type parser | **COMPLETED** — `types.setTypeParser(types.builtins.INT8, BigInt)` |
| `src/db/repository/repository.ts` | All audit casts `as bigint`, `count()` returns `bigint`, `findById()` accepts `bigint \| string`, `findByPage()` `total_records: bigint` | **COMPLETED** |
| `src/lib/audit/audit-service.ts` | `entityId: bigint` | **COMPLETED** |
| `src/modules/auth/auth_configuration_entity.ts` | `id: bigint` | **COMPLETED** |
| `src/modules/auth/organization_entity.ts` | `id: bigint` | **COMPLETED** |
| `src/modules/auth/user_profile_entity.ts` | `id: bigint` | **COMPLETED** |
| `src/modules/auth/role_mapping_entity.ts` | `id!: bigint` | **COMPLETED** |
| `src/modules/system/service_registry_entity.ts` | `id: bigint` | **COMPLETED** |
| `src/modules/customers/customer_entity.ts` | `id: bigint` | **COMPLETED** |
| `src/modules/auth/role-mapping-repo.ts` | `idp_role` type | **COMPLETED** |
| `src/modules/auth/organizations_dal.ts` | `OrganizationListResponse.total: bigint`, `Number()` on audit counts | **COMPLETED** |
| `src/modules/auth/user-profiles-dal.ts` | `UserListResponse.total: bigint`, `Number()` on audit count | **COMPLETED** |
| `src/modules/auth/user-profile-repo.ts` | `pool.query<{ uuid: string; id: bigint }>` | **COMPLETED** |
| `src/modules/customers/customers_dal.ts` | `seedIfEmpty: 0n`, `Number()` on audit count, `CustomerListResponse.total: bigint` | **COMPLETED** |
| `src/modules/customers/customers_repo.ts` | `makeCode(id: bigint \| number)` | **COMPLETED** |
| `src/modules/customers/customers.service.ts` | Debug toggle `total: 0n` | **COMPLETED** |
| `src/db/dal-gateway.ts` | New — Dal gateway wrapper | PENDING |
| `src/db/audit-port-adapter.ts` | New — `BeAuditPortAdapter` uses `repo.add(AuditLogEntity, {...}, { tableName })`, no raw SQL (§5.2) | PENDING |
| `src/db/audit-query-helper.ts` | New — typed `findAuditPage()` helper for audit table queries (§4.4) | PENDING |
| `src/lib/audit/audit-service.ts` | DELETE (Phase 5) — replaced by `BeAuditPortAdapter` | PENDING |
| `src/modules/customers/customer_entity.ts` | Change imports to `@primebrick/dal-pg` | PENDING |
| `src/modules/auth/organization_entity.ts` | Change imports | PENDING |
| `src/modules/auth/user_profile_entity.ts` | Change imports | PENDING |
| `src/modules/auth/auth_configuration_entity.ts` | Change imports | PENDING |
| `src/modules/auth/role_mapping_entity.ts` | Change imports | PENDING |
| `src/modules/customers/customers_dal.ts` | Migrate to new DAL API (R17→findAll, R18-R20 keep rawSql, R21-R22→findAuditPage) | PENDING |
| `src/modules/auth/organizations_dal.ts` | Migrate (R12→count with filters, R13-R14→findAuditPage) | PENDING |
| `src/modules/auth/user-profiles-dal.ts` | Migrate (R15-R16→findAuditPage) | PENDING |
| `src/modules/auth/auth_configurations_dal.ts` | Migrate | PENDING |
| `src/modules/auth/role-mapping-repo.ts` | Migrate (R4→findAll, R5+R6→upsert, R7→hardDelete) | PENDING |
| `src/modules/auth/user-profile-repo.ts` | Migrate (R8→find, R9→update, R10→upsert) | PENDING |
| `src/modules/auth/services/user.service.ts` | Migrate R11 (createUser) → repo.add() | PENDING |
| `src/modules/system/system-router.ts` | Migrate R3 (GET /roles/active) → repo.findAll() | PENDING |
| `src/db/repository/repository.ts` | DELETE (Phase 5) | PENDING |
| `src/db/repository/query-builder.ts` | DELETE (Phase 5) | PENDING |
| `src/db/repository/dsl.ts` | DELETE (Phase 5) | PENDING |
| `src/db/repository/types.ts` | DELETE (Phase 5) | PENDING |
| `src/db/repository/auditable-joins.ts` | DELETE (Phase 5) | PENDING |
| `src/db/repository/audit-join-helper.ts` | DELETE (Phase 5, replaced by `audit-query-helper.ts`) | PENDING |
| `src/domain/entities/entity-decorators.ts` | DELETE (Phase 5) | PENDING |
| `src/domain/entities/entity-meta.ts` | DELETE (Phase 5) | PENDING |
| `src/domain/entities/column-pg-io.ts` | DELETE (Phase 5) | PENDING |
| `src/db/entity-ts-to-pg.ts` | DELETE (Phase 5) | PENDING |
| `src/db/pool.ts` | DELETE (Phase 5, replaced by dal-gateway) | PENDING |
| `test/helpers/setup.ts` | New — test setup | PENDING |
| `vitest.integration.config.ts` | New — integration test config | PENDING |
| `src/modules/__tests__/customers.unit.test.ts` | New | PENDING |
| `src/modules/__tests__/organizations.unit.test.ts` | New | PENDING |
| `src/modules/__tests__/user-profiles.unit.test.ts` | New | PENDING |
| `test/integration/customer.integration.test.ts` | New | PENDING |
| `test/integration/organization.integration.test.ts` | New | PENDING |
| `test/integration/user-profile.integration.test.ts` | New | PENDING |
| `test/integration/cross-entity.integration.test.ts` | New | PENDING |

---

## 10. Acceptance criteria

### Prerequisite — Native bigint serialization (COMPLETED 2026-07-10)
- [x] `::text` cast removed from `count()` in DAL-pg and BE
- [x] `count()` returns `bigint` in DAL-pg and BE
- [x] `findByPage()` `total_records: bigint` in DAL-pg and BE
- [x] `findById()` accepts `bigint | string` in DAL-pg and BE
- [x] All entity `id` fields: `bigint` in BE (6 entities), DAL-pg (3 test entities), US (5 entities)
- [x] `AuditParams.entityId: bigint` in DAL-pg
- [x] `AuditService.writeAudit entityId: bigint` in BE
- [x] All repository audit casts: `as bigint` in DAL-pg (1) and BE (6)
- [x] `extJsonMiddleware` installed in BE Express app
- [x] INT8 type parser registered in BE `pool.ts`
- [x] FE `extJsonParse` used in 5 critical call sites (3 list pages + 2 audit panel)
- [x] FE `total` state variables: `$state<bigint>(0n)` in all list pages
- [x] FE `versionHistoryTotal: $state<bigint>(0n)`
- [x] US test schema `entity_id: bigint`
- [x] US entity snapshot `entity_id` dataType: `bigint`
- [x] US consolidated migration patch `0001_initial_schema.sql`
- [x] SDK `extJsonMiddleware` uses Express types (`Request`, `Response`, `NextFunction`)
- [x] SDK `extJsonMiddleware` handles `undefined` → `"null"`
- [x] SDK `NatsClient.subscribe()` handles empty `msg.data` → null
- [x] SDK `NatsClient.subscribeRequest()` includes `requestId` in error response
- [x] SDK `http-server.ts` uses `extJsonStringify`
- [x] SDK `package.json` exports `./json` subpath
- [x] SDK NatsClient tests: 11 tests (6 new for publish/subscribe/subscribeRequest)
- [x] SDK build passes, 68/68 tests pass
- [x] DAL-pg build passes, 125/125 tests pass
- [x] BE build passes
- [x] FE svelte-check: 0 errors
- [x] US build passes, 17/17 tests pass

### Phase 0 (DAL-pg)
- [ ] `clone()` method exists, tested, returns full cloned row
- [ ] `update()`, `delete()`, `restore()`, `hardDelete()`, `upsert()` write audit when AuditPort provided
- [ ] Delta calculator produces correct old/new deltas with forced fields
- [ ] `Project.expr("COUNT(*)", "cnt")` + `find()` + filters returns correct count (bigint)
- [ ] `Project.expr` + `find()` + `deletedRecords: "EXCLUDED"` counts non-deleted rows
- [ ] `Project.expr` alias validation rejects invalid identifiers (anti-injection)
- [ ] `Project.expr` + `Project.field` mixed projection works
- [ ] `count(entity)` (no options) still counts ALL rows (backward compatible — unchanged)
- [ ] `AuditLogEntity` class is exported from `@primebrick/dal-pg` (includes `entity_id` field)
- [ ] `@AuditTrailEntity({ changedByColumn })` decorator sets metadata correctly
- [ ] `find()` / `findAll()` / `findByPage()` / `count()` accept optional `tableName` override (read path)
- [ ] `add()` / `addMany()` accept optional `tableName` override (write path)
- [ ] `tableName` override produces `"schema"."tableName"` in SQL (quoted, schema-qualified)
- [ ] `buildAuditTrailJoins(AuditLogEntity, UserProfileEntity)` returns joins with regex guardrail + display_name/idp_code projections
- [ ] `findByPage(AuditLogEntity, ..., { tableName: "customers_audit" })` returns typed `AuditLogEntity` rows
- [ ] `find(AuditLogEntity, [Project.expr("COUNT(*)", "total")], { tableName: "customers_audit", filters })` returns `{ total: bigint }`
- [ ] `add(AuditLogEntity, { entity_id, entity_uuid, action, ... }, { tableName: "customers_audit" })` inserts a row with auto-generated `id`
- [ ] `add()` with `AuditLogEntity` does NOT trigger audit stamping (no `@AuditableField` decorators)
- [ ] `add()` with `AuditLogEntity` does NOT trigger audit writing (no `audit` port passed)
- [ ] All existing DAL-pg tests still pass (125+ tests)
- [ ] New tests for clone + audit-on-all-writes + `Project.expr` + `AuditLogEntity` + `tableName` override + `buildAuditTrailJoins` pass
- [ ] Version bumped, published to NPM

### Phase 1 (BE adapters)
- [ ] `dal-gateway.ts` compiles, `getPool()` returns working pool
- [ ] `BeAuditPortAdapter` compiles, implements `AuditPort`
- [ ] `BeAuditPortAdapter.writeAudit()` uses `repo.add(AuditLogEntity, {...}, { tableName })` — no raw SQL
- [ ] `BeAuditPortAdapter` derives audit table name as `params.tableName + "_audit"` (explicit convention)
- [ ] No `writeAuditByTable` method exists (replaced by `repo.add()` + `tableName` override)
- [ ] `audit-query-helper.ts` compiles, `findAuditPage()` returns typed results
- [ ] BE build passes (no behavioral change yet)

### Phase 2 (Entity migration)
- [ ] All 5 entities import from `@primebrick/dal-pg`
- [ ] Entity metadata unit tests pass (column count, types, decorators identical to before)
- [ ] BE build passes

### Phase 3 (DAL migration)
- [ ] All 5 DAL classes use new DAL API
- [ ] `matchBy: "uuid"` used for all update/delete/restore/hardDelete on entity tables
- [ ] `matchBy: "idp_role"` used for RoleMappingRepo operations (R7)
- [ ] `matchBy: "idp_code"` used for resolveInternalUuid sync update (R9)
- [ ] `conflictTarget: "idp_code"` used for resolveInternalUuid JIT upsert (R10)
- [ ] `conflictTarget: "idp_role"` used for RoleMappingRepo upsert (R5+R6)
- [ ] `throwIfNotFound: false` used where BE's `find()` expected null return
- [ ] Audit port adapter passed to all write ops on auditable entities
- [ ] 17 raw SQL sites replaced with typed DAL methods (R3-R17, R21-R23)
- [ ] 6 raw SQL sites kept as `rawSql()` with documented justification (R1, R2, R18-R20)
- [ ] `getUserCountForOrganization()` (R12) uses `repo.find()` + `Project.expr('COUNT(*)', 'cnt')` + filters
- [ ] Audit count queries (R13, R15, R21) use `repo.find(AuditLogEntity, [Project.expr('COUNT(*)', 'total')], { tableName, filters })`
- [ ] Audit data queries (R14, R16, R22) use `findAuditPage()` helper (wraps `findByPage` + `AuditLogEntity` + `buildAuditTrailJoins`)
- [ ] `AuditService.writeAudit()` (R23) uses `repo.add(AuditLogEntity, {...}, { tableName })` — no raw SQL in the audit writer
- [ ] BE build passes
- [ ] BE dev server starts without errors

### Phase 4 (Tests)
- [ ] All Customer unit tests pass (C-U1 through C-U10)
- [ ] All Customer integration tests pass (C-I1 through C-I28)
- [ ] All Organization unit tests pass (O-U1 through O-U8)
- [ ] All Organization integration tests pass (O-I1 through O-I15)
- [ ] All User Profile unit tests pass (U-U1 through U-U9)
- [ ] All User Profile integration tests pass (U-I1 through U-I20)
- [ ] All cross-entity integration tests pass (X-I1 through X-I5)
- [ ] Total: 90+ tests, all green

### Phase 5 (Cleanup)
- [ ] Old Repository + query-builder + dsl + types + auditable-joins deleted
- [ ] Old entity-decorators + entity-meta + column-pg-io + entity-ts-to-pg deleted
- [ ] Old pool.ts deleted
- [ ] No dangling imports (grep verifies zero references to deleted files)
- [ ] Full build passes
- [ ] All tests pass
- [ ] Manual smoke test: CRUD endpoints work for all 3 entities

---

## 11. Out of scope

- **SDK adoption (ConfigLoader, ServiceRegistrar, NatsClient, etc.)** — PARTIALLY ADOPTED: `extJsonMiddleware` is now used by BE (§8.5). Full SDK adoption (ConfigLoader, ServiceRegistrar, NatsClient for BE) is a separate future plan. BE keeps Express, its own config loading, its own NATS (if any).
- **Migrating BE's `auth_configurations` to SDK's `ConfigLoader`** — BE keeps its existing `AuthConfigurationsDal` + `loadAuthConfigFromDb`. Future adoption only.
- **Schema compare / meta diff tool extraction** — BE's `database-patch-compare` stays BE-only.
- **AuditService extraction to a separate package** — BE's AuditService stays in BE, wrapped by `BeAuditPortAdapter`.
- **Migrating `UserService.createUser` JIT provisioning** — may stay as direct SQL (special case during auth flow). Evaluate in Phase 3.
- **FE changes** — COMPLETED as part of bigint serialization (§8.6). No further FE changes needed for DAL adoption. API contracts unchanged.
- **Any `git commit`** — wait for explicit user instruction.
- **Audit count `Number()` conversion** — 4 call sites intentionally keep `Number(countResult.rows[0].total)` for audit pagination DTOs where `total: number`. These are small row counts, no precision risk. See §2.4 "Remaining audit count inconsistencies".

---

## 12. Risk mitigation

| Risk | Mitigation |
|------|------------|
| Audit trail loss | Phase 0 extends audit to all write ops BEFORE BE migration. Tests verify audit rows. |
| ~~Type parser breakage (bigint)~~ | ~~Override INT8 parser to return `number`~~ — **RESOLVED**: Full native `bigint` adopted with `json-bigint` serialization. See §8. |
| `find()` throwing instead of returning null | Pass `throwIfNotFound: false` in all BE callers that expect null |
| Clone behavior regression | `clone()` implemented in DAL-pg with exact same field exclusion + reset logic. Integration test C-I15 through C-I18 verifies. |
| Performance regression | DAL-pg has better pool management (statement_timeout, connection limits). No regression expected. |
| Transaction support | DAL-pg's `withClient()` provides transaction support. BE's per-request `new Repository(poolClient)` pattern maps to `dal.withClient()`. |
| Dual-write period | Not needed — single cutover per DAL class. Each DAL class migrated independently. |

---

## 13. Empirical review log (2026-07-10)

All claims in this plan were verified against the actual codebase using parallel subagents + direct file reads.

### 13.1 Verified correct (no changes needed)

| Claim | Source | Verification |
|-------|--------|--------------|
| R2-R23 line numbers and SQL content | 7 BE files | All exact match |
| `Project.expr(expr, alias)` exists | `dal-v3/src/query/dsl.ts:121-123` | ✅ Exact match |
| `renderProjection` handles `kind: "expr"` | `dal-v3/src/query/query-builder.ts:54-55` | ✅ Exact match |
| `renderJoins` regex guardrail | `dal-v3/src/query/query-builder.ts:123-124` | ✅ Condition: `castRightTo === "uuid" \|\| colMeta?.castInJoin === "uuid"` |
| `@AuditTrail()` decorator | `dal-v3/src/meta/entity-decorators.ts:327-333` | ✅ Sets `isAuditable: true` |
| `@AuditableField` decorator | `dal-v3/src/meta/entity-decorators.ts:268-279` | ✅ Exists |
| `add()` method: stamps audit, writes audit, drops identity PK | `dal-v3/src/repository/repository.ts:307-417` | ✅ All 3 behaviors verified |
| `AuditPort` / `AuditParams` with `tableName` field | `dal-v3/src/types/types.ts:86-101` | ✅ `tableName` = entity table name (e.g., `"customers"`) |
| `buildAuditableJoins` exported | `dal-v3/src/index.ts:127-130` | ✅ Exported |
| Audit INSERT column list | `be-v3/src/lib/audit/audit-service.ts:21-24` | ✅ `entity_id, entity_uuid, action, changed_at, changed_by, version, delta` |
| `role_mappings_audit` table exists | `be-v3/infra/...init_database.sql:183` | ✅ But `RoleMappingRepo` has no audit query methods — not relevant |
| Tally: 17 REPLACE + 6 KEEP = 23 | §4.5 | ✅ Arithmetic correct |

### 13.2 Issues found and fixed

| # | Issue | Severity | Fix applied |
|---|-------|----------|-------------|
| 1 | `buildAuditTrailJoins` used `castRightTo: "uuid"` only (no `castLeftTo`), producing `uuid = text` — PostgreSQL rejects | **CRITICAL BUG** | Added `castLeftTo: "uuid"` → `uuid = uuid` (§3.4.4) |
| 2 | Plan claimed all audit tables have composite PK `(id, changed_at)` — `user_profiles_audit` has single PK `(id)` and is NOT partitioned | **FACTUAL ERROR** | Updated §3.4.1, R14/R16/R22, acceptance criteria to distinguish 3 partitioned tables from `user_profiles_audit` |
| 3 | Commentary implied `buildAuditableJoins` uses `castRightTo: "uuid"` — it uses `castRightTo: "text"` (no guardrail) | **FACTUAL ERROR** | Updated §3.4.4 commentary to accurately describe both functions |
| 4 | `entity_id` missing from `AuditRow` interface, `AUDIT_PROJECTIONS`, row mapping, §3.4.5 example | **CONSISTENCY** | Added `entity_id` to all 4 locations; added note that existing SELECTs don't select it (migration adds it as improvement) |
| 5 | R1 line number: plan said 57, actual is 59 | **MINOR** | Updated §4.1 inventory table |
