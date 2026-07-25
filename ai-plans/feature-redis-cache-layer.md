# Feature — Redis cache layer for BE

**Date:** 2026-07-21 (revised v4)
**Type:** Feature (infrastructure)
**Status:** Draft v4, awaiting approval

## 1. Objectives

- Introduce Redis as an optional BE cache to reduce PG DB queries on hot single-row reads.
- Cache is a **feature, not a requirement** — the system is fully valid without it. If Redis is not configured or unreachable, the system runs exactly as today (DB-only), with `warn` logs (never `error`).
- Only entities that opt in via `@Cached(ttl?)` are cached. The dev owns the TTL (a correctness parameter, not just a perf one).
- Only **single-row finders** are cached: `findById`, `findByUUID`, `find`. `findAll` and `findByPage` are NOT cached (high-cardinality keys, memory bomb risk on large tables, stale-on-write window dangerous for list views).
- List/dropdown/autocomplete caching is the **BE app's** responsibility. The BE caches small lookup lists at the app level with hand-written `be:dropdowns:*` keys via the same `CachePort`.
- Any WRITE on a cached entity invalidates that entity's cache prefix (`dal:{ClassName}:`) AFTER the DB write succeeds. Invalidation is best-effort — a Redis failure during invalidation is swallowed as a `warn` and bounded by the entity's TTL.
- `resolveInternalUuid` cache: leave it for now (small immutable-mapping utility), but in a future phase move it to Redis because the BE MUST be able to run multiple instances behind NLB/LB (Docker, K8s, Swarm, Azure Container Apps, GCP Cloud Run, etc.).
- The 5-min TTL on `resolveInternalUuid` is bad practice — the cached mapping is immutable, so it should never expire and never be re-hydrated.

## 2. Non-goals (this plan)

- `resolveInternalUuid` migration to Redis (future phase — see Phase 4).
- Removing the 5-min TTL on `resolveInternalUuid` (separate tiny refactor).
- Redis cluster/HA configuration.
- FE caching.
- Microservice (US) caching (the SDK pieces are placed so US can adopt later without re-implementing, but US wiring is out of scope).
- L1 in-process cache (deferred — see §9).
- NATS cross-pod cache invalidation broadcaster (deferred — only needed for L1; see §9).
- `findAll` / `findByPage` caching.
- A general-purpose AOP / before-after hook registry (rejected — see §3).
- **Any cache logic in the DAL** (`@primebrick/dal-pg`). The DAL is a pure data-access leaf and knows nothing about cache. All cache logic lives in the SDK.
- **Note:** the DAL does get a tiny, generic, non-cache-specific change in v4 — its `@Entity` and `@Key` decorators additionally write metadata via `Reflect.defineMetadata` (the standard JS reflection API the DAL already imports). This exposes entity metadata (table name, key column) to ANY consumer via `Reflect.getMetadata`, without importing the DAL. The SDK reads this for cache key building. See §4.0.

## 3. Architecture overview

```
        +-------------------+        +-------------------+
        |   BE pod #1       |        |   BE pod #2       |
        |  (primebrick-be)  |  ...   |  (primebrick-be)  |
        +---------+---------+        +---------+---------+
                  |                            |
                  |  withCache(Repository,     |  withCache(Repository,
                  |     RedisCachePort)         |     RedisCachePort)
                  v                            v
        +---------+----------------------------+---------+
        |              Redis (shared cache)              |
        |          (RedisCachePort -> node-redis)        |
        +----------------------+-------------------------+
                               |
                               | miss -> hydrate from DB
                               v
                        +--------------+
                        |  PostgreSQL  |
                        | (source of   |
                        |  truth)      |
                        +--------------+
```

### Layering and library boundaries (hard constraint)

The DAL and the SDK are **sibling leaf dependencies** — neither depends on the other, at runtime OR at compile time. The BE (and later the US) depends on both and wires them together. **This plan introduces ZERO changes to the DAL and ZERO dependency between the DAL and the SDK.**

**All cache logic lives in the SDK.** The DAL is a pure data-access library (pg, pg-query-stream, reflect-metadata) and knows nothing about cache. This is the core architectural principle: the DAL's responsibility is "translate entity metadata → parameterized PG SQL", nothing more. Cache is a performance feature — it does not belong in a leaf data-access library.

| Piece | Repo | File | Why |
|---|---|---|---|
| `@Entity` / `@Key` Reflect.defineMetadata | DAL | `src/meta/entity-decorators.ts` (2 lines added) | Generic, non-cache-specific: exposes entity metadata (table name, key column) via standard `Reflect.defineMetadata` so ANY consumer can read it via `Reflect.getMetadata` without importing the DAL. The DAL already imports `reflect-metadata`. Zero new deps. See §4.0. |
| `CachePort` interface | SDK | `src/cache/cache-port.ts` (NEW) | SDK owns the cache abstraction. No DAL dependency. |
| `CacheKeyBuilder` | SDK | `src/cache/cache-port.ts` (NEW) | Reads the snake_case table name via `Reflect.getMetadata("primebrick:tableName", ctor)` (written by the DAL's `@Entity`); falls back to `ctor.name` if the DAL is not used. Reads the key column via `Reflect.getMetadata("primebrick:keyColumn", ctor)` for the pkey fallback. Uses SDK's own `@CacheKey` metadata + `row.uuid` property. No DAL import. |
| `@Cached`, `@CacheKey`, `isEntityCached`, `getEntityCacheTtl` | SDK | `src/cache/cache-decorators.ts` (NEW) | SDK's own WeakMap metadata store. Separate from the DAL's `@Entity`/`@Key`/`@Column`. No DAL dependency. |
| `withCache(repo, port, logger)` wrapper | SDK | `src/cache/cached-repository.ts` (NEW) | Uses a structural `CacheableRepository` interface — TypeScript structural typing means a DAL `Repository` is assignable without any `import type` from the DAL. Zero DAL dependency. |
| `RedisCachePort` implementation | SDK | `src/cache/redis-cache-port.ts` (NEW) | Uses `extJsonStringify`/`extJsonParse` from `src/json/ext-json.ts` (SDK-local). |
| `createRedisClient(url)` factory | SDK | `src/cache/redis-client.ts` (NEW) | Same pattern as `NatsClient` — shared connection lifecycle. |
| Bootstrap (`withCache(new Repository(pool), cachePort, logger)`) | BE | `src/index.ts` `runStartupTasks()` | App-specific; reads `redis_url` from `getAuthConfig()`. Imports `Repository` from DAL, `withCache` + `RedisCachePort` + `createRedisClient` from SDK. |

**How the SDK avoids any DAL package dependency (three techniques):**

1. **`@Cached` / `@CacheKey` use the SDK's own WeakMap**, not the DAL's `ClassEntityMeta` WeakMap. Two metadata systems on the same class (DAL's `@Entity`/`@Key` + SDK's `@Cached`/`@CacheKey`) coexist without interacting. Separation of concerns.
2. **`CacheKeyBuilder` reads entity metadata via `Reflect.getMetadata`** — the standard JS reflection API. The DAL's `@Entity` and `@Key` decorators write a small amount of metadata via `Reflect.defineMetadata` (a 2-line, generic, non-cache-specific change to the DAL — see §4.0). The SDK reads it via `Reflect.getMetadata("primebrick:tableName", ctor)` and `Reflect.getMetadata("primebrick:keyColumn", ctor)`. No `import` from the DAL — just a shared metadata-key convention. Falls back to `ctor.name` if the DAL is not used (e.g., the SDK is used with a non-DAL repository). For the uuid fallback, `CacheKeyBuilder` checks `row.uuid` (JS property name) — the DAL returns rows with JS property keys, and the convention is the property is named `uuid`.
3. **`withCache` uses a structural `CacheableRepository` interface** defined in the SDK. TypeScript's structural typing means a DAL `Repository` instance is assignable to `CacheableRepository` (it has `findById`, `findByUUID`, `find`, `add`, `update`, etc.) without any `import type` from the DAL. Full type safety, zero dependency.

**Why no AOP / before-after hook registry:** a general-purpose hook container (registry, ordering semantics, error-isolation policy, async composition, lifecycle) is ~150 lines of plumbing to host ~6 lines × 12 methods of cache logic. The ratio is wrong. `withCache()` is a decorator-pattern wrapper, not AOP. If a future feature needs cross-cutting hooks, that belongs in the BE app layer, not in a shared library.

## 4. Phase 1 — SDK: CachePort, @Cached, @CacheKey, CacheKeyBuilder, withCache (primebrick-v3-sdk)

### 4.0 DAL change: expose entity metadata via Reflect.defineMetadata (primebrick-dal-v3)

The DAL already imports `reflect-metadata` ([entity-decorators.ts:1](D:\git\primebrick\primebrick-dal-v3\src\meta\entity-decorators.ts)) and uses `Reflect.getMetadata("design:type", ...)` in 8 places. But it stores its OWN metadata (`tableName`, `isKey`, `isUnique`) in a **module-private WeakMap** (`META` at line 110) — NOT via `Reflect.defineMetadata`. So today, no external consumer can read the DAL's entity metadata without importing the DAL's getter functions (`getTableName`, `getEntityPersistenceMeta`).

**Change (2 lines, generic, non-cache-specific):** the DAL's `@Entity` and `@Key` decorators additionally write a small amount of metadata via `Reflect.defineMetadata`, exposing it to ANY consumer via `Reflect.getMetadata` — without importing the DAL.

In `@Entity` ([entity-decorators.ts:165-172](D:\git\primebrick\primebrick-dal-v3\src\meta\entity-decorators.ts)):

```ts
export function Entity(tableName?: string, schema?: string) {
  return function <T extends Function>(ctor: T): T {
    const m = ensureMeta(ctor);
    m.tableName = tableName ?? ctor.name;
    if (schema) m.tableSchema = schema;
    // NEW: expose table name via standard Reflect API for external consumers (no import needed).
    Reflect.defineMetadata("primebrick:tableName", m.tableName, ctor);
    return ctor;
  };
}
```

In `@Key` ([entity-decorators.ts:256-269](D:\git\primebrick\primebrick-dal-v3\src\meta\entity-decorators.ts)):

```ts
export function Key(opts?: KeyOptions): PropertyDecorator {
  return function (target: object, propertyKey: string | symbol) {
    const ctor = (target as { constructor: Function }).constructor;
    const col = touchColumn(ctor, propertyKey);
    col.isKey = true;
    col.nullable = false;
    col.keyGenerated = opts?.generated ?? col.keyGenerated ?? "identity";
    if (opts?.defaultSql !== undefined) col.defaultSql = opts.defaultSql;
    const dt = Reflect.getMetadata("design:type", target, propertyKey);
    if (dt && typeof (dt as { name?: string }).name === "string") {
      col.tsDesignTypeCtorName = (dt as Function).name;
    }
    // NEW: expose key column via standard Reflect API for external consumers (no import needed).
    Reflect.defineMetadata("primebrick:keyColumn", { propertyKey: String(propertyKey), sqlName: col.sqlName }, ctor);
  };
}
```

**Why this is NOT a cache-specific change:** the DAL is exposing its entity metadata via the standard JS reflection API. Any tooling — the SDK's cache, a future schema inspector, a test helper, a debugger — can read `Reflect.getMetadata("primebrick:tableName", SomeEntity)` without importing `@primebrick/dal-pg`. The metadata keys are namespaced (`primebrick:*`) and generic. The DAL has zero knowledge of cache.

**Why this is NOT a dependency:** `Reflect.defineMetadata` / `Reflect.getMetadata` are part of the `reflect-metadata` polyfill, which the DAL already imports. The SDK also already imports `reflect-metadata` (it's a transitive dependency of many TS libraries, and the SDK uses `Reflect.getMetadata` in its own auth code). No new package dependency on either side. The "contract" between the DAL and the SDK is just two string keys: `"primebrick:tableName"` and `"primebrick:keyColumn"`.

**Backward compatibility:** the DAL's existing `getTableName(ctor)` / `getEntityPersistenceMeta(ctor)` functions continue to work unchanged (they read the private WeakMap). The `Reflect.defineMetadata` calls are additive — they expose metadata that was already being computed, just through a second, standard channel.

### 4.1 New file in SDK: src/cache/cache-port.ts

Define the `CachePort` interface and `CacheKeyBuilder`. NO Redis import here — this is a port. NO DAL import here — this is a standalone abstraction.

```ts
/**
 * Cache port — consumers inject their own implementation (e.g. RedisCachePort).
 * The `withCache` wrapper calls all methods best-effort: any rejection is swallowed
 * and logged as a `warn`. The cache is a feature, not a requirement.
 */
export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  /**
   * @param ttl Time-to-live in milliseconds. Omit for no expiry (immutable data only).
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
}

/**
 * Builds stable Redis keys from entity class + result rows.
 *
 * Key format: `dal:{tableName}:{value}` where `tableName` is the snake_case DB table name
 * read via `Reflect.getMetadata("primebrick:tableName", ctor)` (written by the DAL's
 * `@Entity` decorator — see §4.0). Falls back to `ctor.name` (JS class name) if the DAL
 * is not used or the metadata is absent.
 *
 * Key resolution order for a row (deterministic, dev-controlled, no magic):
 *   1. The property marked `@CacheKey()` → `dal:{table}:{row[propertyKey]}`
 *   2. Else `row.uuid` (JS property convention — the DAL returns rows with JS property keys) → `dal:{table}:{row.uuid}`
 *   3. Else the `@Key()` column value, read via `Reflect.getMetadata("primebrick:keyColumn", ctor)` → `dal:{table}:{row[keyPropertyKey]}`
 *   4. Else throw — `@CacheKey()` is required for entities without a `uuid` property and without a `@Key()` column.
 *
 * The key is always derived from the RESULT ROW, never from the input argument of
 * `findById` / `findByUUID`. This ensures `findById(42)` and `findByUUID(<uuid>)` on the
 * same row produce the SAME cache key, avoiding duplicate entries and partial-invalidation
 * bugs.
 *
 * Why table name via Reflect and not class name: the table name is snake_case and matches
 * the DB — more familiar when debugging Redis keys (`dal:customers:<uuid>` vs
 * `dal:CustomerEntity:<uuid>`). Stable across class renames (the class can be renamed
 * without breaking cache keys, as long as the table name stays). The Reflect API is
 * standard JS — no import from the DAL, just a shared metadata-key convention.
 */
export class CacheKeyBuilder {
  static forEntity(entityClass: new (...args: any[]) => any): string {
    // Read the snake_case table name written by the DAL's @Entity decorator via Reflect.
    // Falls back to the JS class name if the DAL is not used or metadata is absent.
    const tableName = Reflect.getMetadata("primebrick:tableName", entityClass) ?? entityClass.name;
    return `dal:${tableName}:`;
  }

  static forRowFromMeta(entityClass: new (...args: any[]) => any, row: Record<string, unknown>): string {
    const prefix = CacheKeyBuilder.forEntity(entityClass);

    // 1. @CacheKey() — read from the SDK's own metadata (see cache-decorators.ts)
    const cacheKeyProp = getCacheKeyProperty(entityClass);
    if (cacheKeyProp && row[cacheKeyProp] !== undefined && row[cacheKeyProp] !== null) {
      return `${prefix}${row[cacheKeyProp]}`;
    }

    // 2. row.uuid (JS property convention)
    if (row.uuid !== undefined && row.uuid !== null) {
      return `${prefix}${row.uuid}`;
    }

    // 3. @Key() column value, read via Reflect (written by the DAL's @Key decorator)
    const keyCol = Reflect.getMetadata("primebrick:keyColumn", entityClass) as
      | { propertyKey: string; sqlName: string }
      | undefined;
    if (keyCol && row[keyCol.propertyKey] !== undefined && row[keyCol.propertyKey] !== null) {
      return `${prefix}${row[keyCol.propertyKey]}`;
    }

    // 4. No fallback — require @CacheKey() for entities without uuid and without @Key
    throw new Error(
      `Entity ${entityClass.name} has no @CacheKey() property, no row.uuid, and no @Key() column ` +
      `exposed via Reflect — cannot build cache key. Add @CacheKey() to the property to use as the cache key.`,
    );
  }
}
```

Note: `forQuery` is intentionally **absent** — `findAll` / `findByPage` are not cached (see §1, §10).

### 4.2 New file: src/cache/cache-decorators.ts

The `@Cached` and `@CacheKey` decorators use the SDK's own WeakMap metadata store. They do NOT interact with the DAL's `ClassEntityMeta` — they are a completely separate metadata system.

```ts
/**
 * SDK-internal cache metadata. Stored in a WeakMap keyed by the entity constructor.
 * Separate from the DAL's ClassEntityMeta — the SDK does not depend on the DAL.
 */
interface CacheEntityMeta {
  isCached: boolean;
  ttl?: number;
}

const CACHE_META = new WeakMap<Function, CacheEntityMeta>();
const CACHE_KEY_PROPS = new WeakMap<Function, string>();

/**
 * Mark an entity as cacheable. Reads through the injected `CachePort` on miss; writes
 * invalidate the entity's cache prefix. The wrapper (`withCache`) is best-effort — if the
 * cache is unavailable, the Repository's real methods are called directly.
 *
 * @param ttl Time-to-live in milliseconds. **Omit for no expiry** — use this ONLY for
 *   genuinely immutable data (the cached value can never change). For mutable data, pick a
 *   TTL that bounds the staleness window if Redis is intermittently unavailable during
 *   invalidation. Recommended starting point for mutable data: `300_000` (5 minutes).
 *   There is NO implicit default — `@Cached()` with no arg means "no TTL, immutable".
 */
export function Cached(ttl?: number): ClassDecorator {
  return (ctor: Function) => {
    if (ttl !== undefined && ttl <= 0) {
      throw new Error(`@Cached(): ttl must be a positive number of milliseconds, got ${ttl}`);
    }
    CACHE_META.set(ctor, { isCached: true, ttl });
  };
}

/**
 * Mark the property used as the cache key source. Optional — if absent, `CacheKeyBuilder`
 * falls back to `row.uuid` (JS property convention). If neither exists, `CacheKeyBuilder`
 * throws and the dev must add `@CacheKey()`.
 *
 * Use this when the entity has no `uuid` property, or when you want the cache key to use
 * a different field (e.g. a natural key like `idp_code`).
 */
export function CacheKey(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = (target as { constructor: Function }).constructor;
    CACHE_KEY_PROPS.set(ctor, String(propertyKey));
  };
}

export function isEntityCached(ctor: new (...args: any[]) => any): boolean {
  return CACHE_META.get(ctor)?.isCached === true;
}

export function getEntityCacheTtl(ctor: new (...args: any[]) => any): number | undefined {
  return CACHE_META.get(ctor)?.ttl;
}

export function getCacheKeyProperty(ctor: new (...args: any[]) => any): string | undefined {
  return CACHE_KEY_PROPS.get(ctor);
}
```

### 4.3 New file: src/cache/cached-repository.ts

The `withCache` wrapper. Uses a **structural `CacheableRepository` interface** — TypeScript structural typing means a DAL `Repository` is assignable without any `import type` from the DAL. Zero DAL dependency.

**Contract (critical):**
1. **Writes go to the DB first, always.** Cache invalidation happens after a successful DB write, in a `try/catch` that swallows Redis errors as `warn`. If Redis is down, the write still succeeded and the caller gets the correct response.
2. **Reads fall through on any cache failure.** `port.get` throws → `warn` + go to DB. `port.get` returns `null` (miss) → go to DB. `port.set` throws after a miss → fire-and-forget, the read already returned the DB row. The caller never sees a cache error.
3. **Cache key is derived from the RESULT ROW** via `CacheKeyBuilder.forRowFromMeta`. For `findByUUID`, the input IS the uuid, so we can try `port.get` before the DB using the pre-built key. For `findById`, the input is the PKEY but the cache key is the uuid (or `@CacheKey` field), so we **must** go to the DB first, then `set` from the result.

```ts
import type { CachePort } from "./cache-port.js";
import { CacheKeyBuilder } from "./cache-port.js";
import { isEntityCached, getEntityCacheTtl, getCacheKeyProperty } from "./cache-decorators.js";

/**
 * Structural interface — a DAL Repository satisfies this without any import from the DAL.
 * TypeScript structural typing: if it has these methods with compatible signatures, it's
 * assignable. No `extends`, no `import type` from @primebrick/dal-pg.
 */
interface CacheableRepository {
  findById(cls: any, id: any, opts?: any): Promise<any>;
  findByUUID(cls: any, uuid: string, opts?: any): Promise<any>;
  find(cls: any, fields?: any, opts?: any): Promise<any>;
  add(cls: any, ...args: any[]): Promise<any>;
  update(cls: any, ...args: any[]): Promise<any>;
  delete(cls: any, ...args: any[]): Promise<any>;
  restore(cls: any, ...args: any[]): Promise<any>;
  hardDelete(cls: any, ...args: any[]): Promise<any>;
  upsert(cls: any, ...args: any[]): Promise<any>;
  upsertMany(cls: any, ...args: any[]): Promise<any>;
  updateMany(cls: any, ...args: any[]): Promise<any>;
}

/** Logger port — matches the DAL's LoggerPort shape (structural typing, no import). */
interface CacheLogger {
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
}

/**
 * Wrap a Repository with best-effort Redis caching. Returns the same Repository instance
 * with `findById`, `findByUUID`, `find`, and all write methods overridden.
 *
 * If `port` throws on any call, the wrapper logs a `warn` and falls through to the
 * underlying Repository method. The cache is a feature, not a requirement.
 *
 * Only entities marked `@Cached()` are cached. Other entities pass through untouched.
 *
 * @param repo A DAL Repository (or any object structurally compatible with CacheableRepository)
 * @param port CachePort implementation (e.g. RedisCachePort)
 * @param logger Optional logger — if absent, warnings are swallowed
 */
export function withCache<R extends CacheableRepository>(
  repo: R,
  port: CachePort,
  logger?: CacheLogger,
): R {
  const orig = {
    findById: repo.findById.bind(repo),
    findByUUID: repo.findByUUID.bind(repo),
    find: repo.find.bind(repo),
    add: repo.add.bind(repo),
    update: repo.update.bind(repo),
    delete: repo.delete.bind(repo),
    restore: repo.restore.bind(repo),
    hardDelete: repo.hardDelete.bind(repo),
    upsert: repo.upsert.bind(repo),
    upsertMany: repo.upsertMany.bind(repo),
    updateMany: repo.updateMany.bind(repo),
  };

  // ─── Reads ───────────────────────────────────────────────────────────────────

  // findById: input is the PKEY, but the cache key is the uuid/@CacheKey field from the
  // result row. So we CANNOT try cache before DB — we go to DB first, then set from result.
  repo.findById = async (cls, id, opts) => {
    if (!isEntityCached(cls)) return orig.findById(cls, id, opts);
    const row = await orig.findById(cls, id, opts);
    if (row) {
      try {
        const key = CacheKeyBuilder.forRowFromMeta(cls, row);
        port.set(key, row, getEntityCacheTtl(cls)).catch((e) =>
          logger?.warn(`[cache] set failed for ${cls.name}: ${e}`),
        );
      } catch (e) {
        logger?.warn(`[cache] key build failed for ${cls.name}: ${e}`);
      }
    }
    return row;
  };

  // findByUUID: input IS the uuid, which is the cache key (or @CacheKey field). We CAN
  // try cache before DB. If @CacheKey is set on a non-uuid field, we fall back to DB-first
  // behavior (same as findById) because we can't predict the key from the input.
  repo.findByUUID = async (cls, uuid, opts) => {
    if (!isEntityCached(cls)) return orig.findByUUID(cls, uuid, opts);
    const cacheKeyProp = getCacheKeyProperty(cls);
    // Only pre-DB cache lookup if the cache key is the uuid property (the input).
    if (!cacheKeyProp || cacheKeyProp === "uuid") {
      const key = `${CacheKeyBuilder.forEntity(cls)}${uuid}`;
      try {
        const cached = await port.get<any>(key);
        if (cached !== null && cached !== undefined) return cached;
      } catch (e) {
        logger?.warn(`[cache] get failed for ${cls.name} uuid=${uuid}: ${e}`);
      }
    }
    const row = await orig.findByUUID(cls, uuid, opts);
    if (row) {
      try {
        const key = CacheKeyBuilder.forRowFromMeta(cls, row);
        port.set(key, row, getEntityCacheTtl(cls)).catch((e) =>
          logger?.warn(`[cache] set failed for ${cls.name}: ${e}`),
        );
      } catch (e) {
        logger?.warn(`[cache] key build failed for ${cls.name}: ${e}`);
      }
    }
    return row;
  };

  // find: returns 1 row by construction (limit: 1). Input is filters, not a key —
  // DB-first, then set from result.
  repo.find = async (cls, fields, opts) => {
    if (!isEntityCached(cls)) return orig.find(cls, fields, opts);
    const row = await orig.find(cls, fields, opts);
    if (row) {
      try {
        const key = CacheKeyBuilder.forRowFromMeta(cls, row);
        port.set(key, row, getEntityCacheTtl(cls)).catch((e) =>
          logger?.warn(`[cache] set failed for ${cls.name}: ${e}`),
        );
      } catch (e) {
        logger?.warn(`[cache] key build failed for ${cls.name}: ${e}`);
      }
    }
    return row;
  };

  // ─── Writes (invalidate AFTER successful DB write) ────────────────────────────

  const invalidate = async (cls: any) => {
    if (!isEntityCached(cls)) return;
    try {
      await port.delByPrefix(CacheKeyBuilder.forEntity(cls));
    } catch (e) {
      logger?.warn(`[cache] invalidate failed for ${cls.name}: ${e}`);
    }
  };

  const writeMethods = ["add", "update", "delete", "restore", "hardDelete", "upsert", "upsertMany", "updateMany"] as const;
  for (const name of writeMethods) {
    const fn = orig[name];
    (repo as any)[name] = async (cls: any, ...args: any[]) => {
      const result = await fn(cls, ...args);
      await invalidate(cls);
      return result;
    };
  }

  return repo;
}
```

**Note on `findAll` / `findByPage`:** intentionally NOT wrapped. See §1 and §10.

### 4.4 Serialization — uses the SDK's existing ext-json

The SDK already has `extJsonStringify` / `extJsonParse` in `src/json/ext-json.ts`, built on `json-bigint` with `useNativeBigInt: true` and a reviver that forces all integers to native `bigint`. This is the **canonical** bigint-safe JSON serializer for the whole platform — the BE already installs it as Express middleware.

The `RedisCachePort` (§5.1) uses `extJsonStringify` / `extJsonParse` for serialization. No custom `$bigint:` hack — that would create a second, divergent bigint serializer.

For `Date` round-trip: `extJsonParse` returns ISO strings as strings. The DAL's existing `pgValueToJsValue` / `hydrateEntityDateFieldsFromJson` coerces ISO strings → `Date` on read. The BE relies on the same hydration path used for HTTP responses. One round-trip test (§4.5) proves this works for a `bigint` PK + `Date` `created_at`.

### 4.5 Tests (primebrick-v3-sdk)

New test file: `src/cache/__tests__/cached-repository.test.ts` — use an in-memory `FakeCachePort` that implements `CachePort`, and a `FakeRepository` that implements `CacheableRepository` with a spy `db`. Tests:

1. **hit (findByUUID):** second `findByUUID` returns the cached row and does NOT call the DB (assert call count on the spy).
2. **miss + hydrate (findByUUID):** first `findByUUID` calls the DB and hydrates the cache; second call hits the cache.
3. **findById hydrates from result row:** `findById(42)` goes to DB, then `set` is called with a key derived from the result row's uuid (not from `42`).
4. **write-invalidates:** after `update`, the cached row is gone (next `findByUUID` hits the DB again).
5. **`delByPrefix` cross-entity isolation:** a write on entity A evicts `dal:A:*` but does NOT evict `dal:B:<uuid>`.
6. **cache get throws → DB fallback:** `FakeCachePort.get` rejects → `findByUUID` still returns the row from DB; a `warn` is logged; no error bubbles to the caller.
7. **cache set throws → read still succeeds:** `FakeCachePort.set` rejects → `findByUUID` returns the DB row; the rejection is swallowed (fire-and-forget).
8. **cache invalidate throws → write still succeeds:** `FakeCachePort.delByPrefix` rejects → `update` returns the DB result; a `warn` is logged.
9. **bigint + Date round-trip via ext-json:** serialize `{ id: 42n, created_at: new Date("2026-07-21T10:00:00Z") }` with `extJsonStringify`, parse with `extJsonParse`, assert `id === 42n` and `created_at` is an ISO string that `new Date(...)` round-trips to the same instant.
10. **`@Cached` + `@CacheKey` metadata:** `isEntityCached(Entity)` returns `true`; `getEntityCacheTtl(Entity)` returns the passed ttl or `undefined`; `CacheKeyBuilder.forRowFromMeta` uses the `@CacheKey()` property when present, falls back to `row.uuid`, else throws.
11. **non-cached entity passes through:** `withCache` on an entity without `@Cached()` calls the DB on every read; `port.get` / `port.set` are never called.
12. **DAL independence:** the SDK's cache module (`cache-port.ts`, `cache-decorators.ts`, `cached-repository.ts`) has NO `import` from `@primebrick/dal-pg`. Entity metadata is read via `Reflect.getMetadata("primebrick:tableName", ctor)` and `Reflect.getMetadata("primebrick:keyColumn", ctor)` — standard JS reflection API, no import. Verified by grep in the test.
13. **Reflect metadata round-trip:** a class decorated with the DAL's `@Entity("customers")` + `@Key()` has `Reflect.getMetadata("primebrick:tableName", cls) === "customers"` and `Reflect.getMetadata("primebrick:keyColumn", cls)` returns `{ propertyKey, sqlName }`. (This test lives in the DAL repo next to the decorator change — see §4.0.)
14. **CacheKeyBuilder uses table name via Reflect:** `CacheKeyBuilder.forEntity(CustomerEntity)` returns `"dal:customers:"` (snake_case table name from `@Entity`), NOT `"dal:CustomerEntity:"` (class name). Falls back to class name if the DAL is not used (no `primebrick:tableName` metadata).
15. **CacheKeyBuilder pkey fallback via Reflect:** for an entity with `@Key()` on `id` but no `uuid` property and no `@CacheKey()`, `CacheKeyBuilder.forRowFromMeta(cls, { id: 42n })` returns `"dal:customers:42"` using `Reflect.getMetadata("primebrick:keyColumn", cls)`.

## 5. Phase 2 — SDK RedisCachePort + BE bootstrap

### 5.1 New file in SDK: src/cache/redis-cache-port.ts

Implements `CachePort` using `node-redis` (the `redis` npm package, v4.x stable, pinned exact version per the package-versioning rule). Uses the SDK's `extJsonStringify` / `extJsonParse` for serialization.

```ts
import type { CachePort } from "./cache-port.js";
import { extJsonStringify, extJsonParse } from "../json/ext-json.js";
import type { RedisClientType } from "redis";

export class RedisCachePort implements CachePort {
  constructor(private readonly redis: RedisClientType) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw ? extJsonParse<T>(raw) : null;
  }

  /**
   * @param ttl Time-to-live in milliseconds. Omit for no expiry (immutable data only).
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const raw = extJsonStringify(value);
    if (ttl && ttl > 0) {
      await this.redis.set(key, raw, { PX: ttl });
    } else {
      await this.redis.set(key, raw);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    // node-redis v4: scanIterator yields keys in batches without manual cursor handling.
    for await (const key of this.redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
      await this.redis.del(key);
    }
  }
}
```

**Why `node-redis` and not `ioredis`:** as of 2024, Redis org officially recommends `node-redis` for new projects and states `ioredis` is in best-effort maintenance (redis.io/docs/latest/develop/clients/nodejs/migration, github.com/redis/ioredis README). For a brand-new feature in 2026, picking a library the upstream maintainer recommends against is the wrong call. `node-redis` v4 is fully typed, stable, and supports `scanIterator` (cleaner than ioredis's manual SCAN cursor loop).

### 5.2 New file in SDK: src/cache/redis-client.ts

Singleton Redis client factory, mirroring the SDK's `NatsClient` pattern. Takes the URL as an argument (does NOT read ENV — per the project rule, the only ENV-allowed variable is the PG connection string; `redis_url` comes from `auth_configurations` via the BE).

```ts
import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;

/**
 * Create (or return the existing) Redis client. The URL is passed in by the caller
 * (the BE, which loads it from `auth_configurations`). The SDK never reads ENV for Redis.
 *
 * Uses lazyConnect + explicit connect() so connection failures throw to the caller,
 * who decides whether to warn-and-continue or fail.
 */
export async function createRedisClient(url: string): Promise<RedisClientType> {
  if (client) return client;
  client = createClient({ url }) as RedisClientType;
  client.on("error", (err) => console.error("[redis] client error:", err));
  await client.connect();
  return client;
}

/** Grace shutdown — called by the SDK's graceful-shutdown registry. */
export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
```

### 5.3 SDK index.ts exports

```ts
export { CachePort, CacheKeyBuilder } from "./cache/cache-port.js";
export { Cached, CacheKey, isEntityCached, getEntityCacheTtl, getCacheKeyProperty } from "./cache/cache-decorators.js";
export { withCache, type CacheableRepository } from "./cache/cached-repository.js";
export { RedisCachePort } from "./cache/redis-cache-port.js";
export { createRedisClient, closeRedisClient } from "./cache/redis-client.js";
```

### 5.4 BE bootstrap wiring (primebrick-be-v3/src/index.ts)

`redis_url` is a new optional key in `auth_configurations`. It is loaded by the existing `loadAuthConfig` flow (no new loader code). After `refreshAuthConfig()` in `runStartupTasks()`, call a new `initCache()` that:
- reads `redis_url` from `getAuthConfig()`;
- if missing or empty → `console.warn` (cache disabled, system works without it) and return;
- if present → try `createRedisClient(url)`; on success, build `RedisCachePort` and `withCache` the DAL's Repository; on failure → `console.warn` (Redis unreachable, system works without it) and return.

```ts
import { withCache, RedisCachePort, createRedisClient } from "@primebrick/sdk";
import { Repository } from "@primebrick/dal-pg";

let cachedRepositoryFactory: ((pool: Pool) => Repository) | null = null;

async function initCache(): Promise<void> {
  const cfg = getAuthConfig();
  if (!cfg.redis_url) {
    console.warn(
      "[cache] redis_url not configured in auth_configurations — running without cache. " +
      "Cache is a feature, not a requirement; the system is fully valid without it.",
    );
    return;
  }
  try {
    const redis = await createRedisClient(cfg.redis_url);
    const cachePort = new RedisCachePort(redis);
    cachedRepositoryFactory = (pool) => withCache(new Repository(pool), cachePort, console);
    console.info(`[cache] Redis cache enabled at ${cfg.redis_url}.`);
  } catch (err) {
    console.warn(
      `[cache] Redis at ${cfg.redis_url} unreachable — running without cache. ` +
      `Cache is a feature, not a requirement. Cause: ${err}`,
    );
  }
}

export function createRepository(pool: Pool): Repository {
  return cachedRepositoryFactory ? cachedRepositoryFactory(pool) : new Repository(pool);
}
```

Wiring in `runStartupTasks()`:

```ts
async function runStartupTasks(): Promise<void> {
  initAuthPorts();
  await refreshRoleMappings();
  await refreshAuthConfig();
  await initCache();          // ← new, after refreshAuthConfig()
  const ports = getAuthPorts();
  if (ports) {
    initMcpModule(ports);
  } else {
    console.warn("[startup] MCP module not initialized — auth ports unavailable");
  }
  await startServiceLifecycle();
}
```

Module DALs replace `new Repository(pool)` with `createRepository(pool)`. This is a mechanical change across the BE's DAL files — no logic change, just the constructor call.

### 5.5 DB patch — add redis_url to auth_configurations

Fire-and-forget patch (follows `.devin/rules/patch-sha256-management.md`):

```sql
INSERT INTO "public"."auth_configurations" ("key", "value", "description", "created_by") VALUES
  ('redis_url', '', 'Redis cache URL (e.g. redis://localhost:6379). Empty = cache disabled — the system runs without cache, with warn logs. Cache is a feature, not a requirement.', 'system')
ON CONFLICT ("key") DO NOTHING;
```

Add `redis_url?: string` to `AuthConfigDb` ([config-repo.ts:13-54](D:\git\primebrick\primebrick-be-v3\src\modules\auth\config-repo.ts)) and `AuthConfig` in the SDK. It is **optional** — missing/empty = cache disabled, not an error. No mandatory-field check (unlike `auth_mode`, `oidc_issuer_url`, etc. which throw when missing).

### 5.6 NATS invalidation broadcaster — REMOVED from this plan

The previous plan wired a `CacheInvalidationBroadcaster` over NATS. This is **dead code in v1** because:
- With Redis as the single shared cache, when pod #1 invalidates a key, pod #2's next read sees the miss in Redis and re-hydrates from PG. There is no cross-pod stale-cache problem.
- The broadcaster only matters if we add an **L1 in-process cache** in front of Redis, where pod #2's L1 would be stale after pod #1's write. L1 is deferred (§9).
- Wiring dead infrastructure "for the future" is speculative generality that ages badly.

Removed entirely. If L1 is ever built, the broadcaster comes back as part of that plan, not this one.

## 6. Phase 3 — Migrate BeRoleMappingPort cache to Redis (primebrick-be-v3)

### 6.1 Current state

`BeRoleMappingPort` ([sdk-auth-ports.ts:85-112](D:\git\primebrick\primebrick-be-v3\src\modules\auth\sdk-auth-ports.ts)) caches `role_mappings` in-process via a `Map<idp_role, {permissions, is_admin, label_key}>`. It has NO TTL, is loaded once at startup, and is NEVER invalidated. `clearRoleMappingCache()` exists but is never called from any service/router. This is a real bug: admin edits to `role_mappings` go stale until process restart.

### 6.2 Migration

- Replace the in-process `Map` with a Redis-backed cache via `CachePort`. Key: `be:role_mappings:all` (a single key holding the full map, since `role_mappings` is a small table loaded atomically). TTL: none (immutable until admin edits — `cachePort.set("be:role_mappings:all", map)` with no ttl).
- On `RoleMappingRepo.upsertMapping` / `deleteMapping` ([role-mapping-repo.ts](D:\git\primebrick\primebrick-be-v3\src\modules\auth\role-mapping-repo.ts)): after the DB write, call `cachePort.del("be:role_mappings:all")` (best-effort, `try/catch` with `warn`). This fixes the stale-until-restart bug.
- `BeRoleMappingPort.getRoleMapping` becomes: read from Redis (`cachePort.get("be:role_mappings:all")`); on miss, `loadAllMappings` from DB, hydrate Redis (no ttl), return.
- Remove `clearRoleMappingCache` dead code OR repurpose it to call `cachePort.del("be:role_mappings:all")`.
- If `cachePort` is null (Redis not configured), `BeRoleMappingPort` falls back to the current in-process `Map` behavior. This keeps the system valid without Redis.

### 6.3 Acceptance

- Admin edits a role mapping → next authenticated request sees the new permissions (no restart needed).
- Redis shows the `be:role_mappings:all` key.
- Killing the BE pod and restarting it does NOT require a DB read for role mappings if Redis still has the key.
- With Redis disabled, the system still works (in-process Map, current behavior, stale-until-restart bug remains — documented as a known limitation when cache is off).

## 7. Phase 4 (future, not this plan) — resolveInternalUuid cache → Redis

The `resolveInternalUuid` cache ([user-profile-repo.ts](D:\git\primebrick\primebrick-be-v3\src\modules\auth\user-profile-repo.ts)) holds immutable `idp_code → uuid` mappings in an in-process LRU with a 5-min TTL and 1000 entries. The cached data is immutable (uuid is the row PK), so the TTL is bad practice — the data never changes and should never expire or be re-hydrated. In a future phase, move this cache to Redis so multi-instance BE pods share it, remove the 5-min TTL, and key it as `be:idp_code_map:{idp_code}`. This is a separate plan.

## 8. Cross-repo impact

- **primebrick-dal-v3**: **2 lines added** to existing decorators in `src/meta/entity-decorators.ts` — `@Entity` writes `Reflect.defineMetadata("primebrick:tableName", tableName, ctor)` and `@Key` writes `Reflect.defineMetadata("primebrick:keyColumn", { propertyKey, sqlName }, ctor)`. Generic, non-cache-specific: exposes entity metadata via the standard JS reflection API (the DAL already imports `reflect-metadata`). Zero new files, zero new dependencies, zero cache knowledge. The DAL's existing `getTableName` / `getEntityPersistenceMeta` functions continue to work unchanged. Version bump (patch — additive metadata, no behavior change).
- **primebrick-v3-sdk**: new files (`src/cache/cache-port.ts`, `src/cache/cache-decorators.ts`, `src/cache/cached-repository.ts`, `src/cache/redis-cache-port.ts`, `src/cache/redis-client.ts`), `index.ts` exports, `redis` npm dependency (pinned exact version, ≥7 days old), tests. **NO dependency on `@primebrick/dal-pg`** — not in `dependencies`, not in `devDependencies`, no `import type`. Reads entity metadata via `Reflect.getMetadata("primebrick:tableName", ctor)` and `Reflect.getMetadata("primebrick:keyColumn", ctor)` (standard JS reflection API — the metadata is written by the DAL's `@Entity` / `@Key` decorators, no import needed). The `CacheableRepository` structural interface means no `import type` from the DAL is needed for `withCache`. Version bump (minor).
- **primebrick-be-v3**: new `createRepository()` factory + `initCache()` in `runStartupTasks()`, fire-and-forget DB patch adding `redis_url` to `auth_configurations`, `redis_url?: string` added to `AuthConfigDb` and `AuthConfig`, module DALs switch from `new Repository(pool)` to `createRepository(pool)` (mechanical), `BeRoleMappingPort` / `RoleMappingRepo` changes (Phase 3). Depends on new SDK version (DAL version unchanged).
- **No FE changes. No US changes.** (US can adopt later using the SDK pieces without re-implementing.)

## 9. Acceptance criteria (empirical, per phase)

- **Phase 1**: SDK tests pass with `FakeCachePort` + `FakeRepository`; `@Cached` + `@CacheKey` decorator metadata is readable; `withCache(FakeRepository).findByUUID` hits `FakeCachePort` on the second call (assert call count on the spy); `findById` hydrates from the result row's uuid; a write on entity A does not evict entity B's keys; `FakeCachePort.get` rejection → DB fallback with `warn` log; `FakeCachePort.set` rejection → read still succeeds; `FakeCachePort.delByPrefix` rejection → write still succeeds; non-cached entity passes through untouched; **grep confirms zero `import` from `@primebrick/dal-pg` in `src/cache/`**.
- **Phase 2**: BE starts with `redis_url` set in `auth_configurations`; `redis-cli ping` works; `redis-cli keys "dal:*"` shows cached entity rows after a read; a write on a cached entity removes its key; BE starts with `redis_url` empty → `warn` log, no Redis connection, system works; BE starts with `redis_url` set but Redis down → `warn` log, system works.
- **Phase 3**: admin role mapping edit → next request sees new permissions without restart; `redis-cli get be:role_mappings:all` returns the JSON map; with Redis disabled, role mappings still load (in-process Map fallback).
- **All phases**: `pnpm run build` exits 0 in SDK and BE; `pnpm test` exits 0 in SDK.

## 10. Risk assessment

| Risk | Mitigation | Test coverage |
|---|---|---|
| Redis downtime | `withCache` wraps all cache calls in `try/catch`; reads fall through to DB; writes go DB-first then invalidate in `try/catch`. All failures are `warn` logs, never `error`. The caller never sees a cache error. | Tests 6, 7, 8 (§4.5) |
| Intermittent Redis during invalidation → stale reads | Bounded by the entity's TTL. The dev owns the TTL (a correctness parameter). `@Cached()` with no ttl = immutable data only (no stale risk). For mutable data, the dev picks a TTL that bounds the staleness window (recommended `300_000` / 5min). Documented in `@Cached` JSDoc. | N/A (documented trade-off) |
| Serialization bugs (bigint + Date round-trip) | Use the SDK's canonical `extJsonStringify` / `extJsonParse` (json-bigint, `useNativeBigInt: true`). No custom `$bigint:` hack. | Test 9 (§4.5) |
| Over-invalidation via `delByPrefix` | Correctness ok, perf cost — `dal:{ClassName}:*` evicts all rows of that entity on any write. Precise key invalidation (evict only the touched row's key) is a future optimization, enabled by the result-row-derived key in `CacheKeyBuilder.forRowFromMeta`. | Test 5 (§4.5) — cross-entity isolation |
| SDK / DAL leaf-dependency violation | **The SDK has ZERO package dependency on the DAL** — not in `dependencies`, not in `devDependencies`, no `import type`. Entity metadata is read via `Reflect.getMetadata` (standard JS reflection API — the DAL's `@Entity` / `@Key` decorators write it via `Reflect.defineMetadata`, no import needed). `CacheableRepository` is a structural interface. `@Cached` / `@CacheKey` use the SDK's own WeakMap. The DAL has 2 lines added (generic Reflect.defineMetadata) and zero cache knowledge. | Tests 12, 13 (§4.5) |
| `redis_url` misconfiguration | Missing/empty `redis_url` = cache disabled with `warn` log (not an error, not fail-fast). The system is fully valid without cache. Unreachable Redis = `warn` log, cache disabled. | Phase 2 acceptance (§9) |
| Duplicate cache keys for `findById` vs `findByUUID` | `CacheKeyBuilder.forRowFromMeta` derives the key from the RESULT ROW (`@CacheKey` / `row.uuid` / `@Key` column), not from the input argument. Both `findById(42)` and `findByUUID(<uuid>)` on the same row produce the same key. | Test 3 (§4.5) |
| Entity without uuid, without `@CacheKey`, and without `@Key` | `CacheKeyBuilder.forRowFromMeta` throws with a clear error message. The dev adds `@CacheKey()` to the property to use as the cache key. | Test 10 (§4.5) |
| Reflect metadata key collision | The keys are namespaced (`primebrick:tableName`, `primebrick:keyColumn`). Collision with other libraries is extremely unlikely. If it happens, the dev sees a wrong table name in cache keys and the keys are renamed. | N/A (documented) |

## 11. Decisions made during review (v4 changelog)

1. **ALL cache logic lives in the SDK. The DAL has zero cache knowledge.** The DAL is a pure data-access leaf. Cache is a performance feature, not a data-access concern.
2. **DAL exposes entity metadata via `Reflect.defineMetadata`** (v4 improvement) — `@Entity` writes `Reflect.defineMetadata("primebrick:tableName", tableName, ctor)` and `@Key` writes `Reflect.defineMetadata("primebrick:keyColumn", { propertyKey, sqlName }, ctor)`. 2 lines added to existing decorators. Generic, non-cache-specific: the DAL exposes its metadata via the standard JS reflection API (it already imports `reflect-metadata`). Any consumer can read it via `Reflect.getMetadata` without importing the DAL.
3. **`@Cached` / `@CacheKey` use the SDK's own WeakMap** — separate from the DAL's `ClassEntityMeta`. Two metadata systems coexist without interacting.
4. **`CacheKeyBuilder` uses the snake_case table name via `Reflect.getMetadata("primebrick:tableName", ctor)`** (v4 improvement) — cache keys are `dal:customers:<uuid>` (snake_case DB table name), not `dal:CustomerEntity:<uuid>` (class name). Falls back to `ctor.name` if the DAL is not used. More familiar when debugging Redis keys; stable across class renames.
5. **`CacheKeyBuilder` fallback: `@CacheKey()` → `row.uuid` → `@Key()` column (via Reflect) → throw.** The pkey fallback is restored (v4 improvement) — for entities without `uuid` and without `@CacheKey`, the `@Key()` column value is used, read via `Reflect.getMetadata("primebrick:keyColumn", ctor)`. The unique-non-key alphabetical fallback is dropped (it required reading the full column map from the DAL).
6. **`withCache` uses a structural `CacheableRepository` interface** — TypeScript structural typing means a DAL `Repository` is assignable without any `import type` from the DAL. Zero DAL dependency.
7. **`@Cached(ttl?)`** — renamed from `ttlMs`; JSDoc documents milliseconds. **No implicit default** — `@Cached()` with no arg = no TTL (immutable data only). Recommended `300_000` (5min) for mutable data documented in JSDoc. No silent magic number.
8. **Best-effort wrapper**: reads fall through to DB on any cache failure; writes go DB-first then invalidate in `try/catch`; failures are `warn` logs, never `error`. The caller never sees a cache error.
9. **Serialization via SDK's `extJsonStringify` / `extJsonParse`** — dropped the `$bigint:` hack.
10. **`node-redis`** (the `redis` npm package, v4.x) — not `ioredis`. Redis org recommends node-redis for new projects; ioredis is best-effort maintenance.
11. **`redis_url` in `auth_configurations`** — loaded via existing `loadAuthConfig`; warn-and-continue if missing/unreachable. No ENV (only PG connection string is ENV-allowed). No fail-fast.
12. **Cache only `findById`, `findByUUID`, `find`** (single-row). `findAll` / `findByPage` NOT cached. Dropdown/autocomplete lists cached at BE app level with hand-written `be:dropdowns:*` keys.
13. **No L1 in-process cache for v1.** **NATS `CacheInvalidationBroadcaster` removed** — dead code without L1. Both deferred to a future plan if Redis latency becomes measurable at >5 pods.
14. **No AOP / before-after hook registry** — `withCache()` is a decorator-pattern wrapper, not AOP. A leaf library is not the place for an application-framework concept.
