# Bugfix — CacheKeyBuilder silent-skip for non-entity-shaped result rows

## Status
Approved design (user-confirmed semantics): **silent skip, keep class guardrail**.

## Problem (empirically verified)

`primebrick-be-v3` logs on every organization list/detail request:

```
[cache] key build failed for UserProfileEntity: Error: Entity UserProfileEntity has no @CacheKey() property, no row.uuid, and no @Key() column exposed via Reflect — cannot build cache key. Add @CacheKey() to the property to use as the cache key.
```

### Root cause
`organizations_dal.ts:230` `getUserCountForOrganization` runs a COUNT aggregate through
the **cached** repo (`createRepository` → `withCache` wrapper):

```ts
const countResult = await this.repo.find<UserProfileEntity, { cnt: bigint }>(
  UserProfileEntity,
  [Project.expr("COUNT(*)", "cnt")],   // aggregate projection → row is { cnt: 123n }
  { filters: [...], throwIfNotFound: false }
);
```

`UserProfileEntity` is `@Cached(300_000)`, so `withCache.find` intercepts the call and,
after the DB returns `{ cnt }`, calls `CacheKeyBuilder.forRowFromMeta(UserProfileEntity, { cnt })`.
The row has no `uuid`, no `id` value → resolution chain falls through → **throws** →
caught by the wrapper → logged as `warn`. The DB result is still returned correctly;
this is purely log noise (fires on every org list/detail call).

### Why only this one call site
Verified every cached-repo caller in BE:
- `customers_dal.ts:704` — `find<CustomerDetailRow, CustomerDetailRow>`, default projection → row has `uuid`/`id`. Safe.
- `user-profiles-dal.ts:93/154/186` — `find<any,any>(UserProfileEntity, null, …)` → `fields=null` = default projection. Safe.
- `collaboration/router.ts:128` + `audit-query-helper.ts` — all audit queries use `AuditLogEntity` (NOT `@Cached`) → `withCache` short-circuits via `isEntityCached===false`. Safe (incl. the `find<AuditLogEntity,{total:bigint}>` COUNT at audit-query-helper.ts:61).
- `findById`/`findByUUID` accept no arbitrary projection → always entity-shaped. Safe.

## Impact (empirically verified)

| Repo | Impact | Reason |
|------|--------|--------|
| FE (`primebrick-fe-v3`) | **None** | `package.json` has zero `@primebrick/*` deps; never imports SDK cache. |
| US (`primebrick-us-v3`) | **None** | No `withCache`/`createRepository`/`@Cached`/`CacheKeyBuilder` references. |
| DAL (`primebrick-dal-v3`) | **None** | DAL only writes Reflect metadata; has no cache code. Untouched. |
| BE (`primebrick-be-v3`) | **No code change** | Consumes SDK via `"@primebrick/sdk": "file:../primebrick-v3-sdk"` workspace link. Picks up rebuilt SDK `dist/`. |
| SDK (`primebrick-v3-sdk`) | **Source fix + rebuild** | Cache code lives only on `feature/redis-cache` branch (`develop` has no `src/cache/`). |

## Design (user-approved: silent skip, keep class guardrail)

`CacheKeyBuilder.forRowFromMeta` return type changes from `string` to `string | null`.

Resolution logic:
1. `@CacheKey()` property present in row → return `dal:{table}:{value}`.
2. `row.uuid` present → return `dal:{table}:{row.uuid}`.
3. `@Key()` column (via `Reflect.getMetadata("primebrick:keyColumn", cls)`) present in row → return `dal:{table}:{value}`.
4. **Class-level guardrail:** if the class has NO `@CacheKey()` AND NO `@Key()` Reflect metadata at all → **throw** (genuine entity misconfiguration; dev must add `@CacheKey`/`@Key`). Preserves the existing dev guardrail and the existing `NoKeyEntity throws` test.
5. **Row-level silent skip:** the class HAS a key source (`@CacheKey` or `@Key`), but this particular row carries none of the key values (aggregate/projection result like `{ cnt }`) → **return `null`** (skip caching silently, no warn).

`withCache` read paths (`findById`, `findByUUID`, `find`) updated: after `const key = CacheKeyBuilder.forRowFromMeta(cls, row)`, if `key === null` → skip `port.set` silently (no warn). The existing `try/catch` around the call stays, so a genuine misconfiguration throw (step 4) still logs as `warn`.

## Files to change (SDK only)

### 1. `primebrick-v3-sdk/src/cache/cache-port.ts` (on `feature/redis-cache`)
- `CacheKeyBuilder.forRowFromMeta` signature: `(entityClass, row) => string | null`.
- Update JSDoc: document the `null` return (non-entity-shaped row → skip) vs the throw (class has no key source at all).
- Implement: keep steps 1–3; replace the final throw with:
  - if `getCacheKeyProperty(cls)` is undefined AND `Reflect.getMetadata("primebrick:keyColumn", cls)` is undefined → throw (misconfiguration);
  - else → return `null` (row lacks the values the class promises).

### 2. `primebrick-v3-sdk/src/cache/cached-repository.ts` (on `feature/redis-cache`)
- In `findById`, `findByUUID`, `find` read paths: after `const key = CacheKeyBuilder.forRowFromMeta(cls, row)`, add `if (key === null) return row;` before `port.set(...)` (silent skip, no warn).
- Update the contract JSDoc point 3 to note that non-entity-shaped result rows are skipped silently.

### 3. `primebrick-v3-sdk/src/cache/__tests__/cached-repository.test.ts` (on `feature/redis-cache`)
- Keep existing `forRowFromMeta throws when no @CacheKey, no uuid, and no @Key` test (still valid: `NoKeyEntity` has no class-level key source → throws).
- Add new test: `forRowFromMeta returns null when class has @Key but row lacks uuid and id (aggregate result)` — using `CustomerEntity` (has `@Key id`) with row `{ cnt: 5n }` → expect `null`.
- Add new test in `withCache — reads`: `find with aggregate projection skips cache silently (no warn, no set)` — `repo.find(CustomerEntity, [Project.expr("COUNT(*)","cnt")])` returning `{ cnt: 5n }` → `port.store.size` stays 0, `logger.warn` not called, result returned unchanged.

### 4. Rebuild + verify
- `cd primebrick-v3-sdk && pnpm install && pnpm test` (vitest) — all cache tests green.
- `pnpm run build` — regenerates `dist/cache/*.js` + `.d.ts`.
- BE: restart `tsx watch` (or let HMR pick up the linked `dist`) and confirm the `[cache] key build failed for UserProfileEntity` warning no longer appears on organization list/detail requests.

## Acceptance criteria
1. `organizations_dal.getUserCountForOrganization` no longer logs `[cache] key build failed for UserProfileEntity`.
2. SDK cache test suite passes, including the new aggregate-skip tests.
3. The `NoKeyEntity` misconfiguration throw test still passes (guardrail preserved).
4. No FE/US/DAL/BE source changes; only SDK source + rebuilt SDK `dist`.
5. Entity-row finds (`findByUUID`, `findById`, normal `find`) still cache exactly as before (no regression — verified by existing `withCache — reads` tests).

## Out of scope
- No change to `organizations_dal.ts` (the COUNT call stays on the cached repo; the SDK now handles it correctly).
- No change to the DAL.
- No change to FE/US.
- No commit until the user explicitly says to commit.
