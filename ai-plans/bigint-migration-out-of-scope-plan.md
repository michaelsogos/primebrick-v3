# Bigint Migration — Out-of-Scope Remediation Plan

> **Empirical analysis** of what was left incomplete after the 5-phase bigint native JSON serialization migration.
> Every finding below has been verified by reading the actual source code with line numbers.
> Zero assumptions. Zero guesses.

## Status legend

- 🔴 **Runtime-breaking** — will throw or produce wrong results at runtime
- 🟡 **Type lie** — TypeScript compiles but the declared type does not match the runtime value
- 🟢 **Code smell / inconsistency** — works but is misleading or wasteful
- ⚪ **Missing test coverage** — no test exists for the described behavior

---

## Phase A — SDK (`primebrick-v3-sdk`)

### A1 ⚪ Missing tests for new NatsClient methods

**File:** `src/nats/__tests__/nats-client.test.ts`
**Evidence:** The test file only tests `getConnection()`, `getJetStream()`, and `close()`. No tests exist for the newly added `publish()`, `subscribe()`, or `subscribeRequest()` methods.
**Fix:** Add tests covering:
- `publish()` serializes bigint values correctly (round-trip)
- `subscribe()` receives bigint as native `bigint` (not string, not number)
- `subscribeRequest()` request-reply pattern with bigint in payload
- `subscribeRequest()` error response when handler throws
- `subscribe()` with empty `msg.data` (currently throws — see A4)

### A2 🟡 extJsonMiddleware uses custom inline type instead of Express types

**File:** `src/json/ext-json.ts` (lines 70-87)
**Evidence:**
```typescript
export function extJsonMiddleware() {
  return (
    req: unknown,
    res: {
      json: (data: unknown) => void;
      setHeader: (name: string, value: string) => void;
      send: (body: string) => void;
    },
    next: () => void,
  ) => { ... }
```
The `res` parameter uses a custom duck-typed interface instead of Express's `Response` type. This works at runtime because Express's Response is structurally compatible, but:
- No type safety on `req` (typed as `unknown`)
- No access to `res.status()`, `res.locals`, etc. if needed in future
- Express is not in the SDK's dependencies (it's a peer dependency of consumers, not the SDK)
**Fix:** Add `@types/express` as a devDependency and use `import type { Request, Response, NextFunction } from "express"` in the middleware signature. Keep Express as a peer dependency (optional) so consumers that don't use Express aren't forced to install it.

### A3 🟡 extJsonMiddleware does not handle edge cases

**File:** `src/json/ext-json.ts` (lines 80-84)
**Evidence:** The current implementation is:
```typescript
res.json = (data: unknown) => {
  const body = extJsonStringify(data);
  res.setHeader("Content-Type", "application/json");
  res.send(body);
};
```
Edge cases not handled:
- `undefined` data → `extJsonStringify(undefined)` returns `undefined` (not valid JSON body). Express's default `res.json()` sends `"null"` for `undefined`.
- Already-serialized strings → if a route calls `res.json("already a string")`, it will be serialized as a JSON string (quoted), which is correct. But if a route calls `res.json(JSON.stringify(data))`, it will be double-serialized.
- `null` data → `extJsonStringify(null)` returns `"null"`, which is correct.
**Fix:** Add a guard for `undefined` → send `"null"`. Document that double-serialization of pre-stringified data is the caller's responsibility (same as Express's default behavior).

### A4 🟢 NatsClient.subscribe() does not handle empty msg.data

**File:** `src/nats/nats-client.ts` (lines 88-97)
**Evidence:**
```typescript
const text = new TextDecoder().decode(msg.data);
const data = extJsonParse<T>(text);
```
If `msg.data` is an empty `Uint8Array`, `text` becomes `""`, and `extJsonParse("")` throws a SyntaxError. The error is caught and logged, but the handler is never called.
**Fix:** Add a guard: if `text === ""`, either skip the message or call `handler(null as T, msg)`. Document the chosen behavior.

### A5 🟢 NatsClient.subscribeRequest() error response missing requestId

**File:** `src/nats/nats-client.ts` (lines 138-147)
**Evidence:**
```typescript
const errorResponse = {
  success: false,
  error: error instanceof Error ? error.message : "Unknown error",
};
```
The error response does not include `requestId` from the original request. The caller cannot correlate the error with the original request.
**Fix:** Extract `requestId` from the parsed request before calling the handler. Include it in the error response if present:
```typescript
const request = extJsonParse<T>(text);
const requestId = (request as any)?.requestId;
try {
  const response = await handler(request, msg);
  ...
} catch (error) {
  const errorResponse = { success: false, error: ..., requestId };
  ...
}
```

### A6 🟢 http-server.ts uses JSON.stringify instead of extJsonStringify

**File:** `src/http/http-server.ts` (lines 27, 30)
**Evidence:**
```typescript
res.end(JSON.stringify({ status: healthy ? "healthy" : "degraded", checks: results }));
res.end(JSON.stringify({ status: "healthy" }));
```
The `HealthCheckResult` interface has `[key: string]: unknown` which could contain bigint values. If a health check returns a bigint (e.g. a count), `JSON.stringify` will throw `TypeError: Do not know how to serialize a BigInt`.
**Fix:** Import `extJsonStringify` and replace both `JSON.stringify` calls. Also update `src/http/__tests__/http-server.test.ts` (lines 34, 62) to use `extJsonParse` for parsing responses.

### A7 🟢 package.json does not export json/ subpath

**File:** `package.json` (lines 19-24)
**Evidence:**
```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```
Consumers cannot import from `@primebrick/sdk/json/ext-json` directly. They must import from the root. This is not strictly necessary since everything is re-exported from `index.ts`, but it would allow tree-shaking for consumers that only need the JSON utilities.
**Fix:** Add a `"./json"` export entry. Low priority since the root export already includes everything.

---

## Phase B — DAL-pg (`primebrick-dal-v3`)

### B1 🔴 Test entity definitions still have `id: number`

**Files:**
- `test/entities/simple-test-entity.ts` line 23: `id!: number;`
- `test/entities/bench-simple.entity.ts` line 23: `id!: number;`
- `test/entities/type-test-entity.ts` line 34: `id!: number;`

**Evidence:** All three test entities have `@Key() id!: number;` but the INT8 type parser returns `bigint` for primary keys. The `count()` method now returns `bigint`. These entities are used in tests that assert on `id` values.
**Fix:** Change `id!: number;` → `id!: bigint;` in all three files.

### B2 🔴 Test assertions use `toBeGreaterThan(0)` instead of `toBeGreaterThan(0n)`

**Files:**
- `test/repository-crud.test.ts` line 40: `expect(inserted.id).toBeGreaterThan(0);`
- `test/repository-bulk.test.ts` line 41: `expect(inserted[i].id).toBeGreaterThan(0);`

**Evidence:** `inserted.id` is now `bigint` (after B1 is fixed). `toBeGreaterThan(0)` compares with a `number`, which will fail or produce unexpected results with `bigint`.
**Fix:** Change to `expect(inserted.id).toBeGreaterThan(0n);` and `expect(inserted[i].id).toBeGreaterThan(0n);`.

### B3 🟡 Test type cast uses `as unknown as number` instead of `as unknown as bigint`

**File:** `test/dal.test.ts` line 213
**Evidence:**
```typescript
const found = await dal.findById(SimpleTestEntity, inserted.id as unknown as number);
```
`inserted.id` is `bigint` (after B1), but it's cast to `number` to satisfy the `findById` signature. This is a type lie.
**Fix:** Change to `inserted.id as unknown as bigint` — but this requires also fixing B4 (the `findById` signature).

### B4 🟡 `findById` signature accepts `number | string` but PK is `bigint`

**Files:**
- `src/repository/repository.ts` line 155: `id: number | string,`
- `src/dal/dal.ts` line 221: `id: number | string,`

**Evidence:** The `findById` method accepts `number | string` for the `id` parameter, but entity PKs are now `bigint`. Consumers passing `bigint` must cast (as in B3). Consumers passing `number` will work at runtime (pg converts), but the type is misleading.
**Fix:** Change to `id: bigint | string`. This is a breaking change for consumers that pass `number` — they must cast to `bigint` or use `BigInt(number)`. All consumers (BE, US) have already been updated to use `bigint` for entity IDs, so this should be safe.

### B5 🟡 `AuditParams.entityId` typed as `number` but should be `bigint`

**File:** `src/types/types.ts` line 94
**Evidence:**
```typescript
export type AuditParams = {
  entityClassName: string;
  tableName: string;
  entityId: number;  // ← should be bigint
  ...
```
The `entityId` is the primary key value, which is now `bigint` for all entities.
**Fix:** Change `entityId: number;` → `entityId: bigint;`.

### B6 🟡 `repository.ts` line 400 casts PK to `number` for audit

**File:** `src/repository/repository.ts` line 400
**Evidence:**
```typescript
const entityId = (inserted as any)[pk.propertyKey] as number;
```
The PK is now `bigint`, but it's cast to `number` before being passed to `AuditParams`.
**Fix:** Change `as number` → `as bigint`. This requires B5 to be fixed first.

---

## Phase C — BE (`primebrick-be-v3`)

### C1 🔴 Audit service `entityId` parameter typed as `number`

**File:** `src/lib/audit/audit-service.ts` line 11
**Evidence:**
```typescript
async writeAudit<T extends object>(
  entityClass: EntityClass,
  entityId: number,  // ← should be bigint
  ...
```
The audit service is called from the repository with the PK value, which is now `bigint`. TypeScript compiles because the repository casts to `number` (see C2), but this is a type lie — the runtime value is `bigint`.
**Fix:** Change `entityId: number` → `entityId: bigint`. This requires C2 to be fixed first (so the cast matches).

### C2 🔴 Repository casts PK to `number` in 6 places

**File:** `src/db/repository/repository.ts`
**Evidence (6 lines):**
- Line 96: `const entityId = inserted[pk!.sqlName] as number;` (insertMany)
- Line 265: `const entityId = updated[pk!.sqlName] as number;` (softDelete)
- Line 337: `const entityId = updated[pk!.sqlName] as number;` (restore)
- Line 542: `const entityId = updated[pk!.sqlName] as number;` (update)
- Line 593: `let entityId: number | null = null;` (hardDelete)
- Line 599: `entityId = oldRecord[pk!.sqlName] as number;` (hardDelete)

All casts assume the PK is `number`, but it's now `bigint`. The `writeAudit` call receives a `number`-typed value that is actually `bigint` at runtime.
**Fix:** Change all 6 casts from `as number` to `as bigint`. Change line 593 from `number | null` to `bigint | null`.

### C3 🟡 `findById` signature accepts `number | string` but PK is `bigint`

**File:** `src/db/repository/repository.ts` line 118
**Evidence:**
```typescript
async findById<TEntity extends object, TResult = TEntity>(
  entity: EntityClass,
  id: number | string,  // ← should be bigint | string
  ...
```
Same issue as B4 but in the BE's embedded repository copy.
**Fix:** Change `id: number | string` → `id: bigint | string`.

### C4 🟡 `user-profile-repo.ts` raw SQL type annotation has `id: number`

**File:** `src/modules/auth/user-profile-repo.ts` line 106
**Evidence:**
```typescript
const ins = await pool.query<{ uuid: string; id: number }>(
  `insert into public.user_profiles ...
```
The INT8 type parser returns `bigint` for the `id` column, but the type annotation says `number`.
**Fix:** Change `id: number` → `id: bigint`.

### C5 🟡 `customers_repo.ts` `makeCode` function parameter typed as `number`

**File:** `src/modules/customers/customers_repo.ts` line 54
**Evidence:**
```typescript
function makeCode(id: number) {
  return `CUST-${String(id).padStart(5, "0")}`;
}
```
If this function is called with a `bigint` entity ID, TypeScript will reject it. `String(bigint)` works at runtime, but the type is wrong.
**Fix:** Change `id: number` → `id: bigint | number` (or just `bigint` if all callers pass `bigint`).

### C6 🟢 `parseInt()` on COUNT(*) results — 4 call sites

**Files:**
- `src/modules/auth/user-profiles-dal.ts` line 212: `const total = parseInt(countResult.rows[0].total, 10);`
- `src/modules/auth/organizations_dal.ts` line 253: `return parseInt(result.rows[0].count, 10);`
- `src/modules/auth/organizations_dal.ts` line 294: `const total = parseInt(countResult.rows[0].total, 10);`
- `src/modules/customers/customers_dal.ts` line 867: `const total = parseInt(countResult.rows[0].total, 10);`

**Evidence:** With the INT8 type parser registered in `pool.ts`, `COUNT(*)` now returns `bigint`. `parseInt(bigint, 10)` works because `parseInt` converts its argument to string first (`BigInt(5).toString()` → `"5"` → `parseInt("5", 10)` → `5`). So this does NOT break at runtime. But it is wasteful and misleading — the value is already `bigint`, and `parseInt` converts it to `string` then back to `number`.
**Fix:** Replace `parseInt(x, 10)` with `Number(x)` (which converts `bigint` to `number` and throws if the value exceeds `Number.MAX_SAFE_INTEGER`). Or, for consistency with the bigint migration, change the audit `total` to `bigint` and update the DTO types.

### C7 🟡 `CustomerAuditResponse.pagination.total` typed as `number`

**File:** `src/modules/customers/dto.ts` line 206
**Evidence:**
```typescript
export type CustomerAuditResponse = {
  data: CustomerAuditEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;  // ← comes from parseInt(), is number
    hasMore: boolean;
  };
};
```
This is consistent with C6 — `total` is `number` (from `parseInt`). But if C6 is changed to use `bigint`, this must also change to `bigint`. The FE `VersionHistoryPanel` would then need to use `apiFetchExt` and type `versionHistoryTotal` as `bigint`.
**Fix:** Depends on C6 decision. If `total` stays `number`, no change needed. If `total` becomes `bigint`, change this to `total: bigint`.

### C8 🟡 `customers.service.ts` debug toggle returns `total: 0` (number) but normal path returns `total: bigint`

**File:** `src/modules/customers/customers.service.ts` line 76
**Evidence:**
```typescript
return { rows: [], page: p, page_size: ps, total: 0 };  // number
```
The normal path (line 89) returns `this.getDal().listCustomers(...)` which returns `total: bigint`. TypeScript infers the union type `total: number | bigint`. The `extJsonMiddleware` handles both correctly, but the types are inconsistent.
**Fix:** Change `total: 0` → `total: 0n` for consistency.

---

## Phase D — FE (`primebrick-fe-v3`)

### D1 🔴 `apiFetchExt` is defined but never used anywhere

**File:** `src/lib/api-ext.ts`
**Evidence:** Grep for `apiFetchExt|api-ext` across `src/` returns only 2 matches — both are the export definitions in `api-ext.ts` itself. No file imports `apiFetchExt` or `apiFetchExtWithResponse`.
**Impact:** The FE types were updated to expect `bigint` for `total` (in customers, organizations, users pages, EntityListTable types, EntityListTableDialogs), but the actual response parsing still uses `res.json()` (native `JSON.parse`), which returns `number` for JSON numbers. This means:
- The FE types say `total: bigint`
- The runtime value is `number` (from `res.json()`)
- TypeScript compiles because `res.json()` returns `any`
- At runtime, `Math.ceil(Number(total) / pageSize)` works because `Number(number)` is a no-op
- But `total` is NOT actually `bigint` at runtime — it's `number`
- The entire FE migration is incomplete: the types are `bigint` but the values are `number`

**Fix:** Migrate the 5 critical call sites to use `apiFetchExt` instead of `res.json()`:
1. `src/routes/(app)/customers/+page.svelte` line 470: `const list = (await listRes.json()) as ListResponse;`
2. `src/routes/(app)/system/settings/organizations/+page.svelte` line 426: `const list = (await listRes.json()) as ListResponse;`
3. `src/routes/(app)/system/settings/users/+page.svelte` line 304: `const data = (await res.json()) as ListResponse;`
4. `src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte` line 66: `const data = await res.json();`
5. `src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte` line 91: `const data = await res.json();`

**Migration pattern:** Replace `res.json()` with `extJsonParse(await res.text())` or use `apiFetchExt`. Note that `apiFetchExt` throws on `!res.ok`, so error handling needs adjustment — use `apiFetchExtWithResponse` which returns both `res` and `data`.

### D2 🟡 `VersionHistoryPanel.svelte` `versionHistoryTotal` typed as `number`

**File:** `src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte` line 40
**Evidence:**
```typescript
let versionHistoryTotal = $state<number>(0);
```
Line 68: `versionHistoryTotal = data.pagination?.total || 0;`
If D1 is fixed (using `extJsonParse`), `data.pagination?.total` will be `bigint`. The `|| 0` fallback uses `number` (0), which would make the type `bigint | number`. And `versionHistoryTotal` is typed as `number`.
**Fix:** Change to `$state<bigint>(0n)` and `|| 0n`. But this depends on whether the BE audit `total` stays `number` (C7) or becomes `bigint` (C6 fix). If the BE keeps `total: number` for audit responses, then `extJsonParse` will still parse it as `bigint` (because the reviver forces all integers to `bigint`), so the FE type should be `bigint`.

### D3 🟢 FE metadata API calls use `res.json()` — low priority

**Files:**
- `src/routes/(app)/customers/+page.svelte` line 202
- `src/routes/(app)/system/settings/organizations/+page.svelte` line 177
- `src/routes/(app)/system/settings/users/+page.svelte` line 183

**Evidence:** These parse metadata responses (column definitions, filter options, etc.) with `res.json()`. Metadata responses are unlikely to contain bigint values, but for consistency they could be migrated to `extJsonParse`.
**Fix:** Low priority. Migrate only if metadata responses are found to contain bigint values.

---

## Phase E — US (`primebrick-us-v3`)

### E1 🔴 Test schema defines `entity_id` as `text` but entity defines it as `bigint`

**File:** `test/helpers/setup.ts` line 65
**Evidence:**
```sql
"entity_id" text,
```
But the entity definition (`src/domain/entities/email_communication_log_entity.ts` line 21) has:
```typescript
@Column({ nullable: true }) entity_id?: bigint;
```
The DAL will try to insert `bigint` values into a `text` column. PostgreSQL will implicitly cast `bigint` to `text`, so INSERTs may work, but SELECTs will return `string` (not `bigint`) because the column is `text`, not `bigint`. The INT8 type parser only applies to `bigint` columns.
**Fix:** Change `"entity_id" text` → `"entity_id" bigint` in the test schema.

### E2 🟡 Entity snapshot has `entity_id` as `text`

**File:** `db-meta/snapshot-entities.json` line 350
**Evidence:**
```json
"entity_id": {
  "name": "entity_id",
  "dataType": "text",
  "typname": "text",
  ...
}
```
The entity snapshot says `entity_id` is `text`, but the entity definition says `bigint`. This means the database schema and the entity definition are out of sync.
**Fix:** Run `pnpm run db:meta:compare` to regenerate the snapshot after fixing the entity definition. Or manually update the snapshot to `"dataType": "bigint"`.

### E3 🟢 Missing migration patch for `email_templates_communication_log` table

**File:** `db-meta/patches/`
**Evidence:** The entity snapshot contains `emailsender.email_templates_communication_log` but there is no migration patch that creates this table. The test helper creates it manually, but production databases won't have it.
**Fix:** Create a new migration patch to create the `email_templates_communication_log` table with the correct schema (including `entity_id bigint`). Run `pnpm run db:meta:compare` to generate the patch.

---

## Execution Order (Dependencies)

```
B1 (test entities id: bigint)
  └─→ B2 (test assertions 0n)
  └─→ B3 (test cast as bigint) ──→ B4 (findById signature)

B5 (AuditParams.entityId: bigint) ──→ B6 (repository.ts cast as bigint)

C2 (BE repository casts as bigint) ──→ C1 (audit-service entityId: bigint)
C3 (BE findById signature)
C4 (user-profile-repo id: bigint)
C5 (makeCode id: bigint | number)
C6 (parseInt → Number or bigint) ──→ C7 (CustomerAuditResponse total type)
C8 (debug toggle total: 0n)

D1 (apiFetchExt migration) ──→ D2 (versionHistoryTotal: bigint)

E1 (test schema entity_id: bigint) ──→ E2 (snapshot update) ──→ E3 (migration patch)

A1 (NatsClient tests) — independent
A2 (extJsonMiddleware Express types) — independent
A3 (extJsonMiddleware edge cases) — independent
A4 (subscribe empty data) — independent
A5 (subscribeRequest requestId) — independent
A6 (http-server extJsonStringify) — independent
A7 (package.json exports) — independent
```

## Acceptance Criteria

1. **All builds pass:** `pnpm run build` in SDK, DAL-pg, BE, FE, US
2. **All tests pass:** `pnpm test` in SDK, DAL-pg, US
3. **FE typecheck passes:** `npx svelte-check --threshold error` in FE
4. **No `as number` casts remain** on entity PK values in BE or DAL-pg
5. **No `parseInt()` calls remain** on `COUNT(*)` results in BE
6. **`apiFetchExt` is actually used** in at least the 5 critical FE call sites
7. **`versionHistoryTotal` is `bigint`** in FE VersionHistoryPanel
8. **US test schema `entity_id` is `bigint`** matching the entity definition
9. **NatsClient has tests** for `publish()`, `subscribe()`, `subscribeRequest()`
10. **`extJsonMiddleware` handles `undefined` data** without throwing
