# Plan — Redis cache integration in BE (Phase 2) + docker-compose + Casdoor

**Date:** 2026-07-21
**Type:** Feature implementation
**Status:** Draft, awaiting approval
**Branch:** `feature/redis-cache` (BE — already exists)

## 0. Executive summary

This plan covers the BE-side Redis cache integration: adding Redis to docker-compose, wiring the BE to use it, replacing all existing in-memory caches with Redis, enabling entity-level caching via `@Cached` + `withCache`, and migrating the WebAuthn session relay to Redis.

**Key principle (from user):** Redis IS the L1 cache. No in-memory caches. `findAll` is NOT cached by default (no SDK change). Custom logic (role_mappings, auth_config) caches its `findAll` result in Redis manually via `CachePort`.

---

## 1. Empirical findings (zero assumptions)

### 1.1 Docker-compose — no Redis service

`infra/docker-compose.postgres.yml` has 3 services: `postgres` (18-bookworm), `casdoor` (3.118.0), `nats` (latest). **No Redis service.**

Casdoor's `infra/casdoor-conf/app.conf` line 10: `redisEndpoint =` (empty). Casdoor supports Redis for session storage via this setting or the `redisEndpoint` env var.

### 1.2 BE entities (8 total) — cache eligibility assessment

| Entity | Table | Has `uuid`? | Has `@Unique` natural key? | Mutability | Hot path? | Current cache | Eligible for `@Cached`? |
|--------|-------|-------------|---------------------------|------------|-----------|---------------|-------------------------|
| `CustomerEntity` | `customers` | Yes | `code` (unique) | Mutable (business data) | Yes — CRUD API | None | **Yes** — `@Cached(300_000)` |
| `OrganizationEntity` | `organizations` | Yes | `idp_code` (unique) | Mutable (Casdoor sync) | Yes — looked up by idp_code | None | **Yes** — `@Cached(300_000)` |
| `UserProfileEntity` | `user_profiles` | Yes | `idp_code` (unique) | Mutable (JIT provisioning, sync) | **Every auth request** | In-memory LRU (5min TTL, 1000 entries) | **Yes** — `@Cached(300_000)` + custom idp_code→uuid cache |
| `RoleMappingEntity` | `role_mappings` | Yes | `idp_role` (unique) | Mutable (admin edits) | **Every auth request** | In-memory Map (no TTL, loaded at startup) | **No** — uses `findAll`, not single-row finders. Custom CachePort logic. |
| `AuthConfigurationEntity` | `auth_configurations` | Yes | `key` (unique) | Mutable (admin edits) | **Every auth request** | SDK in-memory cache (`auth-config-cache.ts`) | **No** — uses `findAll`, not single-row finders. Custom CachePort logic. |
| `ServiceRegistryEntity` | `service_registry` | Yes | `code` (unique) | **Highly mutable** (health checks, register/unregister) | Yes — proxy routing | None | **No** — stale data would route to dead pods. Dangerous. |
| `UserInvitationEntity` | `user_invitations` | Yes | `token_hash` (unique) | Status transitions (PENDING→COMPLETED) | Low — only during onboarding | None | **No** — short-lived, not a hot path, status transitions make caching risky. |
| `UserPasskeyEntity` | `user_passkeys` | Yes | `credential_id` (unique) | Mutable (add/revoke) | Low — only passkey prompt count | None | **No** — not a hot single-row read. Counted per user, not looked up individually. |

### 1.3 Existing in-memory caches (to be replaced with Redis)

| Cache | File | What it caches | TTL | Hot path? | Multi-instance problem? |
|-------|------|----------------|-----|-----------|--------------------------|
| `BeRoleMappingPort.cache` | `sdk-auth-ports.ts:85` | `Map<role, RoleMappingEntry>` (all role mappings) | None (loaded at startup) | **Every auth request** | **Yes** — pod #1 edits role, pod #2 has stale cache until restart |
| `user-profile-repo.ts` cache | `user-profile-repo.ts:29` | `Map<idp_code, {uuid, expiresAt}>` (idp_code→uuid) | 5 min | **Every auth request** | **Yes** — pod #1 provisions user, pod #2 doesn't see it for up to 5 min |
| SDK `auth-config-cache` | `auth-config-cache.ts:11` | `AuthConfig` (all auth config) | None (loaded at startup) | **Every auth request** | **Yes** — pod #1 edits config, pod #2 has stale config until restart |
| WebAuthn session relay | `webauthn.service.ts:148` | `Map<nonce, {cookie, expires_at}>` | 5 min | Only during WebAuthn ceremony | **Yes** — explicitly flagged in code: "single-instance only. For multi-instance BE, replace with Redis" |
| `BeApiKeyPort` | `sdk-auth-ports.ts:115` | None (raw SQL, no cache) | N/A | Every MCP API key request | N/A — no cache, hits DB every time |

### 1.4 WebAuthn session relay — is it needed?

**Yes, it is needed for multi-instance BE.** It is NOT paranoia/bloat.

**What it does:** Casdoor's WebAuthn `begin` endpoint returns a `Set-Cookie` header (server-side session). The BE stashes this cookie in a map keyed by a random nonce, returns the nonce to the FE. When the FE calls `finish`, the BE looks up the nonce, retrieves the Casdoor cookie, and replays it on the Casdoor `finish` call.

**Why it's needed:** Without this relay, the BE can't call Casdoor's `finish` endpoint — Casdoor expects the same session cookie that was set during `begin`. If pod #1 handles `begin` and pod #2 handles `finish` (behind a load balancer), pod #2 doesn't have the cookie. The ceremony fails.

**Is 5 minutes the right TTL?** Yes. A WebAuthn ceremony (begin → user touches security key → finish) takes seconds. Casdoor's own challenge timeout is also 5 minutes. If the user takes longer than 5 minutes, the Casdoor challenge itself has expired, so the ceremony would fail anyway. 5 minutes is the correct TTL — it matches Casdoor's challenge expiry.

### 1.5 Redis version decision

**User chose: Redis 8.8.0 (AGPLv3 option).**

- Docker image: `redis:8.8.0-trixie` (latest stable Redis 8, July 2026)
- License: RSALv2 or SSPLv1 or AGPLv3 (tri-licensed). AGPLv3 is OSI-approved.
- The SDK's `redis@6.1.0` (node-redis client) is wire-compatible with Redis 8.x.
- **Licensing note for Primebrick (MIT):** AGPLv3 has network copyleft — if Primebrick is offered as a hosted service, the service provider must share their customizations. For self-hosted internal use (the primary use case), this is fine. The docker-compose includes Redis 8.8.0 by default; users who prefer BSD-licensed Redis can swap to `valkey/valkey:9.1.0` (Linux Foundation, BSD-3-Clause, wire-compatible).

### 1.6 Casdoor Redis — can it be configured via API?

**No.** Casdoor reads `redisEndpoint` from `app.conf` or the `redisEndpoint` env var at startup. There is no Casdoor API to change it at runtime. To change it, Casdoor must be restarted.

**Architecture decision (from user discussion):**
- The docker-compose includes Redis 8.8.0 as a service.
- Casdoor's `redisEndpoint` env var is set to `redis:6379` (Docker network name) — **static, always uses the dockerized Redis**.
- Primebrick BE's `redis_url` in `auth_configurations` table is set by the admin on first login.
  - Default seeded value: `redis://redis:6379` (same Redis as Casdoor, from within Docker network)
  - Admin can change it to an external Redis instance (wanted behavior).
  - If empty, BE cache is disabled (best-effort) — but Casdoor still uses the dockerized Redis.
- **If the admin wants Casdoor to use the external Redis too:** they must restart the Casdoor container with the new `redisEndpoint` env var. This is a documented limitation — Casdoor cannot be reconfigured at runtime.
- **Redis is mandatory for Casdoor** (if configured in docker-compose), but **optional for Primebrick BE**. These are two independent concerns.

### 1.7 BE git state

- Branch: `feature/redis-cache` (already exists, checked out)
- SDK dependency: `@primebrick/sdk": "file:../primebrick-v3-sdk"` (local link — already has the cache module)
- DAL dependency: `@primebrick/dal-pg": "file:../primebrick-dal-v3"` (local link — already has Reflect metadata)

### 1.8 DB patch format

The BE uses two patch directories:
- `db-meta/patches/` — SHA-256-enforced patches (run by SDK's `applyPatches()`). Filenames: `YYYYMMDDHHMMSS_description.sql`.
- `db-meta/fire-and-forget/` — one-off SQL scripts for existing live DBs (run manually).

The `redis_url` seed is a fire-and-forget INSERT (not a schema migration — the `auth_configurations` table already exists).

---

## 2. Implementation plan

### Phase A: Docker-compose + Casdoor (infra)

#### A1. Add Redis service to docker-compose.postgres.yml

**File:** `primebrick-be-v3/infra/docker-compose.postgres.yml`

Add a `redis` service after `nats`:

```yaml
  redis:
    image: redis:8.8.0-trixie
    container_name: primebrick-redis
    command: redis-server --appendonly yes
    ports:
      # Bind only on loopback; avoids some IPv6/localhost quirks on Windows.
      - "127.0.0.1:${REDIS_HOST_PORT:-6379}:6379"
    volumes:
      - primebrick_redis_data:/data
    healthcheck:
      test: ["CMD-SHELL", "redis-cli ping | grep PONG || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - primebrick-infra-net
```

Add the volume:
```yaml
volumes:
  primebrick_redis_data:
    name: primebrick_redis_data
```

#### A2. Configure Casdoor to use Redis

**File:** `primebrick-be-v3/infra/docker-compose.postgres.yml` (casdoor service)

Add the `redisEndpoint` env var to the casdoor service:

```yaml
  casdoor:
    # ... existing config ...
    environment:
      # ... existing env vars ...
      redisEndpoint: "redis:6379"
```

This overrides the empty `redisEndpoint =` in `app.conf`. Casdoor will use the dockerized Redis for session storage.

**Note:** Remove or leave the `redisEndpoint =` line in `app.conf` — the env var takes precedence. Leaving it empty is fine (env var overrides).

#### A3. Pin NATS version

**File:** `primebrick-be-v3/infra/docker-compose.postgres.yml` (nats service)

Change `image: nats:latest` to `image: nats:2.14.3` (latest stable, June 29 2026). No breaking changes for Primebrick's JetStream service lifecycle subscriber.

---

### Phase B: BE — cache infrastructure

#### B1. Add `redis_url` to `AuthConfigDb` type

**File:** `primebrick-be-v3/src/modules/auth/config-repo.ts`

Add `redis_url?: string` to the `AuthConfigDb` interface (after `gateway_header_idp_username`):

```ts
  gateway_header_idp_username?: string;

  // --- Redis cache (optional) ---
  // Empty or undefined = cache disabled (best-effort, system valid without it).
  // Set to a Redis URL (e.g. "redis://redis:6379" or "redis://external-redis:6379")
  // to enable the cache layer. Configured by the admin in the auth_configurations table.
  redis_url?: string;
```

**Note:** The SDK's `AuthConfig` type already has `redis_url?: string` (added in Phase 1). The BE's `AuthConfigDb` is the DB-side type. The BE's `BeAuthConfigPort.load()` in `sdk-auth-ports.ts` must also pass `redis_url` through to the SDK's `AuthConfig`:

```ts
// In BeAuthConfigPort.load(), add:
redis_url: db.redis_url,
```

#### B2. Seed `redis_url` in auth_configurations (fire-and-forget SQL)

**File:** `primebrick-be-v3/db-meta/fire-and-forget/seed_redis_url.sql`

```sql
-- Fire-and-forget: seed redis_url in auth_configurations with the default dockerized Redis URL.
-- The admin can change this via the BE's config API to point to an external Redis instance.
-- Empty value = cache disabled (best-effort, system valid without it).
INSERT INTO "public"."auth_configurations" ("key", "value", "description", "created_by")
VALUES (
  'redis_url',
  'redis://redis:6379',
  'Redis cache URL. Empty = cache disabled. Default: dockerized Redis (Docker network name). Change to external Redis URL if needed.',
  'system'
)
ON CONFLICT ("key") DO NOTHING;
```

#### B3. Create cache-port-holder.ts (singleton CachePort)

**File:** `primebrick-be-v3/src/cache/cache-port-holder.ts`

A singleton holder for the `CachePort` instance, shared across all BE modules. If `redis_url` is empty or Redis is unreachable, the holder is `null` and all cache calls are no-ops (best-effort).

```ts
import type { CachePort, CacheLogger } from "@primebrick/sdk";
import { RedisCachePort, createRedisClient, closeRedisClient } from "@primebrick/sdk";

let cachePort: CachePort | null = null;

/**
 * Initialize the cache port from redis_url. If redis_url is empty or Redis is
 * unreachable, logs a warn and leaves cachePort as null (cache disabled).
 * Called once at startup from runStartupTasks().
 */
export async function initCache(redisUrl: string | undefined, logger: CacheLogger): Promise<void> {
  if (!redisUrl) {
    logger.warn("[cache] redis_url not set — cache disabled (best-effort, system valid without it)");
    return;
  }
  try {
    const redis = await createRedisClient(redisUrl);
    cachePort = new RedisCachePort(redis);
    logger.info(`[cache] Redis cache enabled at ${redisUrl}`);
  } catch (err) {
    logger.warn(`[cache] Redis connection failed — cache disabled: ${err}`);
    // cachePort stays null — all cache calls are no-ops
  }
}

/** Returns the CachePort, or null if cache is disabled. Callers check for null. */
export function getCachePort(): CachePort | null {
  return cachePort;
}

/** Graceful shutdown — disconnect Redis. */
export async function closeCache(): Promise<void> {
  await closeRedisClient();
  cachePort = null;
}
```

#### B4. Add `initCache()` to `runStartupTasks()`

**File:** `primebrick-be-v3/src/index.ts`

Add `initCache()` after `refreshAuthConfig()` (so `redis_url` is loaded from DB before initializing the cache):

```ts
async function runStartupTasks(): Promise<void> {
  initAuthPorts();
  await refreshRoleMappings();
  await refreshAuthConfig();
  await initCacheFromConfig();  // NEW — after auth config is loaded
  // ... rest unchanged ...
}

async function initCacheFromConfig(): Promise<void> {
  try {
    const cfg = getAuthConfig();
    await initCache(cfg.redis_url, console);
  } catch (err) {
    console.warn("[startup] initCache failed:", err);
  }
}
```

Also add `closeCache()` to graceful shutdown (if the BE has one — check `GracefulShutdown.register()`).

---

### Phase C: BE — entity-level caching (@Cached + withCache)

#### C1. Create repository-factory.ts

**File:** `primebrick-be-v3/src/db/repository-factory.ts`

A factory that wraps `new Repository(pool)` with `withCache` if the cache is enabled:

```ts
import { Repository } from "@primebrick/dal-pg";
import { withCache, type CacheableRepository } from "@primebrick/sdk";
import { getCachePort } from "../cache/cache-port-holder.js";
import type { Pool } from "pg";

const logger = { warn: console.warn.bind(console), info: console.info.bind(console) };

/**
 * Create a Repository, wrapped with withCache if Redis is enabled.
 * If cache is disabled (redis_url empty or Redis unreachable), returns a bare Repository.
 */
export function createRepository(pool: Pool): Repository {
  const repo = new Repository(pool);
  const cachePort = getCachePort();
  if (cachePort) {
    return withCache(repo as any as CacheableRepository, cachePort, logger) as unknown as Repository;
  }
  return repo;
}
```

#### C2. Add `@Cached` to eligible entities

**File:** `primebrick-be-v3/src/modules/customers/customer_entity.ts`

```ts
import { Cached } from "@primebrick/sdk";

@Entity("customers")
@AuditTrail()
@Cached(300_000)  // 5 min TTL — mutable business data
export class CustomerEntity implements IAuditableEntity, IExposableEntity, IClonableEntity {
  // ... unchanged ...
}
```

**File:** `primebrick-be-v3/src/modules/auth/organization_entity.ts`

```ts
import { Cached } from "@primebrick/sdk";

@Entity("organizations")
@AuditTrail()
@Cached(300_000)  // 5 min TTL — mutable (Casdoor sync)
export class OrganizationEntity implements IAuditableEntity {
  // ... unchanged ...
}
```

**File:** `primebrick-be-v3/src/modules/auth/user_profile_entity.ts`

```ts
import { Cached } from "@primebrick/sdk";

@Entity("user_profiles")
@AuditTrail()
@Cached(300_000)  // 5 min TTL — mutable (JIT provisioning, sync)
export class UserProfileEntity implements IAuditableEntity {
  // ... unchanged ...
}
```

#### C3. Switch module DALs to use `createRepository(pool)`

Replace `new Repository(pool)` with `createRepository(pool)` in all DAL files that handle `@Cached` entities:

- `src/modules/customers/customers_dal.ts`
- `src/modules/auth/organizations_dal.ts`
- `src/modules/auth/user-profiles-dal.ts` (for the entity-level CRUD, NOT the `resolveInternalUuid` custom logic — see Phase D3)

**Note:** DALs for non-cached entities (role_mappings, auth_configurations, service_registry, user_invitations, user_passkeys) keep using `new Repository(pool)` — no point wrapping them with `withCache` since they're not `@Cached`.

---

### Phase D: BE — custom logic caching (replacing in-memory caches)

#### D1. BeRoleMappingPort — replace in-memory Map with Redis

**File:** `primebrick-be-v3/src/modules/auth/sdk-auth-ports.ts`

Remove the `private cache: Map<string, RoleMappingEntry>` field. Replace with Redis-backed caching via `CachePort`:

```ts
import { getCachePort } from "../../cache/cache-port-holder.js";

const ROLE_MAPPINGS_CACHE_KEY = "be:role_mappings:all";
const ROLE_MAPPINGS_TTL_MS = 5 * 60 * 1000;  // 5 min — same as current user-profile cache

export class BeRoleMappingPort implements RoleMappingPort {
  private repo: RoleMappingRepo;

  constructor(pool: Pool) {
    this.repo = new RoleMappingRepo(pool);
  }

  async loadAllMappings(): Promise<Map<string, RoleMappingEntry>> {
    const port = getCachePort();
    if (port) {
      try {
        const cached = await port.get<{ role: string; entry: RoleMappingEntry }[]>(ROLE_MAPPINGS_CACHE_KEY);
        if (cached) {
          return new Map(cached.map(({ role, entry }) => [role, entry]));
        }
      } catch (e) {
        console.warn(`[cache] role_mappings get failed: ${e}`);
      }
    }
    // Cache miss or disabled — load from DB
    const raw = await this.repo.loadAllMappings();
    if (port) {
      try {
        const serialized = [...raw.entries()].map(([role, entry]) => ({ role, entry }));
        await port.set(ROLE_MAPPINGS_CACHE_KEY, serialized, ROLE_MAPPINGS_TTL_MS);
      } catch (e) {
        console.warn(`[cache] role_mappings set failed: ${e}`);
      }
    }
    return raw;
  }

  async getRoleMapping(role: string): Promise<RoleMappingEntry | null> {
    const all = await this.loadAllMappings();
    return all.get(role) ?? null;
  }
}
```

**Invalidation:** When a role mapping is created/updated/deleted, the BE must invalidate the Redis key. Add invalidation calls in `role-mapping-repo.ts` after `upsertMapping()` and `deleteMapping()`:

```ts
import { getCachePort } from "../../cache/cache-port-holder.js";

// After upsertMapping / deleteMapping:
const port = getCachePort();
if (port) {
  try { await port.del("be:role_mappings:all"); } catch (e) { console.warn(`[cache] role_mappings invalidate failed: ${e}`); }
}
```

**Note on N Redis GETs:** The SDK's `expandPermissions` calls `getRoleMapping(role)` for each role in the JWT. With this design, each call does a Redis GET of the same key (`be:role_mappings:all`). For a JWT with 3 roles, that's 3 Redis GETs of the same key. Redis is fast (~0.1ms per GET on localhost), so this is ~0.3ms total — acceptable. A future optimization: change the SDK's `expandPermissions` to call `loadAllMappings()` once instead of `getRoleMapping()` N times. This is an SDK change, separate from this plan.

#### D2. AuthConfig — replace SDK in-memory cache with Redis

**File:** `primebrick-be-v3/src/modules/auth/config.ts`

The SDK's `auth-config-cache.ts` is an in-memory cache. The BE will bypass it and use Redis directly. The SDK's cache remains as a fallback for microservices (which don't use Redis).

```ts
import { getCachePort } from "../../cache/cache-port-holder.js";

const AUTH_CONFIG_CACHE_KEY = "be:auth_config:all";
const AUTH_CONFIG_TTL_MS = 5 * 60 * 1000;  // 5 min

/**
 * Load auth config from DB into Redis (and SDK in-memory cache as fallback).
 * Called once at startup and on invalidation.
 */
export async function loadAuthConfig(pool: Pool): Promise<AuthConfig> {
  initAuthConfig(new BeAuthConfigPort(pool));
  const config = await sdkLoadAuthConfig();  // loads from DB via port, caches in SDK in-memory

  // Also store in Redis for cross-pod sharing
  const port = getCachePort();
  if (port) {
    try {
      await port.set(AUTH_CONFIG_CACHE_KEY, config, AUTH_CONFIG_TTL_MS);
    } catch (e) {
      console.warn(`[cache] auth_config set failed: ${e}`);
    }
  }
  return config;
}

/**
 * Get auth config. Tries Redis first (cross-pod), falls back to SDK in-memory cache.
 */
export async function getAuthConfigAsync(): Promise<AuthConfig> {
  const port = getCachePort();
  if (port) {
    try {
      const cached = await port.get<AuthConfig>(AUTH_CONFIG_CACHE_KEY);
      if (cached) return cached;
    } catch (e) {
      console.warn(`[cache] auth_config get failed: ${e}`);
    }
  }
  // Fall back to SDK in-memory cache (or reload if not loaded)
  return sdkGetAuthConfig();
}

/** Invalidate both Redis and SDK in-memory cache. */
export function invalidateAuthConfig(): void {
  sdkInvalidateAuthConfig();
  const port = getCachePort();
  if (port) {
    port.del(AUTH_CONFIG_CACHE_KEY).catch((e) =>
      console.warn(`[cache] auth_config invalidate failed: ${e}`)
    );
  }
}
```

**Note:** `getAuthConfig()` (synchronous) is used in many places. Changing it to async would be a large refactor. The approach above keeps `getAuthConfig()` synchronous (SDK in-memory) for the hot path, and adds `getAuthConfigAsync()` for cross-pod freshness. The SDK in-memory cache is invalidated via `invalidateAuthConfig()` when any pod writes config. **This is a pragmatic compromise** — the SDK in-memory cache remains as a request-fast path, but Redis is the shared cache for cross-pod invalidation. The user said "L1 is Redis" but making `getAuthConfig()` async would require touching every call site. This compromise is documented in the plan for the user to approve or reject.

**Invalidation:** When auth config is updated (via the config API), call `invalidateAuthConfig()` which clears both Redis and the SDK in-memory cache. On the next `getAuthConfig()` call, the SDK reloads from DB (via `BeAuthConfigPort.load()`) and re-caches in both Redis and in-memory.

#### D3. user-profile-repo.ts — replace in-memory LRU with Redis

**File:** `primebrick-be-v3/src/modules/auth/user-profile-repo.ts`

Remove the `cache` Map, `cacheGet()`, `cacheSet()`, `CACHE_TTL_MS`, `CACHE_MAX_ENTRIES`. Replace with Redis:

```ts
import { getCachePort } from "../../cache/cache-port-holder.js";

const USER_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;  // 5 min — same as current

function idpCodeCacheKey(idpCode: string): string {
  return `be:user_profiles:idp_code:${idpCode}`;
}

export async function resolveInternalUuid(
  input: ResolveInput,
  pool: Pool = getPool()
): Promise<string> {
  // 1. Check Redis cache
  const port = getCachePort();
  if (port) {
    try {
      const cached = await port.get<string>(idpCodeCacheKey(input.idp_code));
      if (cached) return cached;
    } catch (e) {
      console.warn(`[cache] user_profiles get failed: ${e}`);
    }
  }

  // 2. DB lookup (existing logic unchanged)
  const repo = new Repository(pool);
  // ... existing find / upsert logic ...

  // 3. Cache the result in Redis
  if (port && uuid) {
    try {
      await port.set(idpCodeCacheKey(input.idp_code), uuid, USER_PROFILE_CACHE_TTL_MS);
    } catch (e) {
      console.warn(`[cache] user_profiles set failed: ${e}`);
    }
  }
  return uuid;
}
```

**Invalidation:** When a user profile is updated (via the users API), invalidate the Redis key. Add invalidation in `user-profiles-dal.ts` after updates:

```ts
const port = getCachePort();
if (port) {
  try { await port.del(`be:user_profiles:idp_code:${idpCode}`); } catch (e) { /* warn */ }
}
```

**Note:** The `@Cached(300_000)` decorator on `UserProfileEntity` (from Phase C2) caches the FULL entity row via `withCache` on `findByUUID`/`findById`/`find`. The `resolveInternalUuid` custom cache (this section) caches only the `idp_code → uuid` mapping — a different, lighter cache for the auth hot path. Both coexist: the entity-level cache serves CRUD API requests, the idp_code→uuid cache serves the auth middleware.

#### D4. BeApiKeyPort — add Redis cache for API key lookups

**File:** `primebrick-be-v3/src/modules/auth/sdk-auth-ports.ts`

The `BeApiKeyPort.findByHash()` does a raw SQL query on every MCP API key request. Add Redis caching:

```ts
const API_KEY_CACHE_TTL_MS = 5 * 60 * 1000;

export class BeApiKeyPort implements ApiKeyPort {
  constructor(private pool: Pool) {}

  async findByHash(hash: string): Promise<ApiKeyRecord | null> {
    const cacheKey = `be:api_keys:hash:${hash}`;
    const port = getCachePort();
    if (port) {
      try {
        const cached = await port.get<ApiKeyRecord>(cacheKey);
        if (cached) return cached;
      } catch (e) { /* warn */ }
    }
    // ... existing raw SQL query ...
    if (port && result) {
      try { await port.set(cacheKey, result, API_KEY_CACHE_TTL_MS); } catch (e) { /* warn */ }
    }
    return result;
  }
}
```

**Invalidation:** When an API key is created/revoked/updated, invalidate `be:api_keys:hash:{hash}`. The BE's API key management endpoints need to call `port.del()` after writes.

---

### Phase E: BE — WebAuthn session relay → Redis

#### E1. Migrate session relay to Redis

**File:** `primebrick-be-v3/src/modules/auth/services/webauthn.service.ts`

Remove the `sessionRelay` Map, `stashCasdoorSession()`, `popCasdoorSession()`, and the periodic cleanup interval. Replace with Redis:

```ts
import { getCachePort } from "../../../cache/cache-port-holder.js";

const SESSION_RELAY_TTL_MS = 5 * 60 * 1000;  // 5 min — matches Casdoor's challenge expiry

function sessionRelayKey(nonce: string): string {
  return `webauthn:session:${nonce}`;
}

async function stashCasdoorSession(cookie: string): Promise<string> {
  const nonce = randomUUID();
  const port = getCachePort();
  if (port) {
    try {
      await port.set(sessionRelayKey(nonce), cookie, SESSION_RELAY_TTL_MS);
    } catch (e) {
      console.warn(`[cache] webauthn session stash failed: ${e}`);
      // Fall back to in-memory? No — the user said "L1 is Redis". If Redis is down,
      // WebAuthn ceremonies fail. This is acceptable — WebAuthn is not the primary
      // auth method, and Redis being down is a degraded state.
    }
  }
  return nonce;
}

async function popCasdoorSession(nonce: string): Promise<string | null> {
  const port = getCachePort();
  if (!port) return null;  // cache disabled — WebAuthn ceremonies can't work multi-instance
  try {
    const cookie = await port.get<string>(sessionRelayKey(nonce));
    if (cookie) {
      await port.del(sessionRelayKey(nonce));  // one-time use
    }
    return cookie;
  } catch (e) {
    console.warn(`[cache] webauthn session pop failed: ${e}`);
    return null;
  }
}
```

**Note:** `stashCasdoorSession` and `popCasdoorSession` become async. The callers (`signinBegin` and `signinFinish`) are already async, so this is a straightforward change.

**If Redis is down:** WebAuthn ceremonies fail (can't stash/pop the Casdoor session cookie). This is a degraded state — password/form auth still works. The `requireWebauthnEnabled()` check at the top of `signinBegin` will still pass, but the ceremony will fail at `signinFinish` with "session not found". The error message should be clear: "WebAuthn session expired or cache unavailable."

---

### Phase F: BE — graceful shutdown

#### F1. Register closeCache() in GracefulShutdown

**File:** `primebrick-be-v3/src/index.ts`

Add `closeCache()` to the graceful shutdown handler (if the BE has one). Check for `GracefulShutdown.register()`:

```ts
import { closeCache } from "./cache/cache-port-holder.js";

// In the existing GracefulShutdown.register() block:
GracefulShutdown.register(async () => {
  // ... existing cleanup ...
  await closeCache();
});
```

---

## 3. Files impacted

### BE (primebrick-be-v3) — `feature/redis-cache` branch

| File | Change | Phase |
|------|--------|-------|
| `infra/docker-compose.postgres.yml` | Add Redis 8.8.0 service + Casdoor redisEndpoint env var | A1, A2 |
| `src/modules/auth/config-repo.ts` | Add `redis_url?: string` to `AuthConfigDb` | B1 |
| `src/modules/auth/sdk-auth-ports.ts` | Add `redis_url` to `BeAuthConfigPort.load()` return; replace `BeRoleMappingPort` in-memory cache with Redis; add Redis cache to `BeApiKeyPort` | B1, D1, D4 |
| `db-meta/fire-and-forget/seed_redis_url.sql` | NEW — seed `redis_url` in auth_configurations | B2 |
| `src/cache/cache-port-holder.ts` | NEW — singleton CachePort holder | B3 |
| `src/index.ts` | Add `initCacheFromConfig()` to `runStartupTasks()`; add `closeCache()` to graceful shutdown | B4, F1 |
| `src/db/repository-factory.ts` | NEW — `createRepository(pool)` factory with `withCache` | C1 |
| `src/modules/customers/customer_entity.ts` | Add `@Cached(300_000)` | C2 |
| `src/modules/auth/organization_entity.ts` | Add `@Cached(300_000)` | C2 |
| `src/modules/auth/user_profile_entity.ts` | Add `@Cached(300_000)` | C2 |
| `src/modules/customers/customers_dal.ts` | Switch to `createRepository(pool)` | C3 |
| `src/modules/auth/organizations_dal.ts` | Switch to `createRepository(pool)` | C3 |
| `src/modules/auth/user-profiles-dal.ts` | Switch to `createRepository(pool)` for CRUD; add Redis invalidation on updates | C3, D3 |
| `src/modules/auth/role-mapping-repo.ts` | Add Redis invalidation after `upsertMapping()` / `deleteMapping()` | D1 |
| `src/modules/auth/config.ts` | Add Redis caching for auth config (with SDK in-memory fallback) | D2 |
| `src/modules/auth/user-profile-repo.ts` | Replace in-memory LRU with Redis cache | D3 |
| `src/modules/auth/services/webauthn.service.ts` | Migrate session relay to Redis | E1 |

### No changes to:
- `primebrick-v3-sdk` — cache module already implemented and committed (Phase 1)
- `primebrick-dal-v3` — Reflect metadata already implemented and committed (Phase 1)
- `primebrick-v3-website` — enterprise section already committed
- `primebrick-v3-docs` — syncs from SDK in CI

---

## 4. Acceptance criteria

1. **Docker-compose:** `docker compose -f infra/docker-compose.postgres.yml up -d` starts Redis 8.8.0. `redis-cli ping` returns PONG. Casdoor's `redisEndpoint` env var is set to `redis:6379`.
2. **BE startup:** With `redis_url` set, `initCache()` logs `[cache] Redis cache enabled at redis://redis:6379`. With `redis_url` empty, logs `[cache] redis_url not set — cache disabled`. With Redis unreachable, logs `[cache] Redis connection failed — cache disabled` and the BE continues normally.
3. **Entity caching:** `CustomerEntity`, `OrganizationEntity`, `UserProfileEntity` are marked `@Cached(300_000)`. A second `findByUUID` call for the same row hits Redis (no DB query). A write (`update`/`delete`/`add`) invalidates the entity's cache prefix.
4. **Role mappings:** `BeRoleMappingPort.loadAllMappings()` hits Redis key `be:role_mappings:all` on subsequent calls. `upsertMapping()` / `deleteMapping()` invalidate the key. No in-memory Map field remains.
5. **Auth config:** `loadAuthConfig()` stores config in Redis key `be:auth_config:all`. `invalidateAuthConfig()` clears both Redis and SDK in-memory cache.
6. **User profiles:** `resolveInternalUuid()` hits Redis key `be:user_profiles:idp_code:{idp_code}` on subsequent calls. No in-memory LRU Map remains.
7. **API keys:** `BeApiKeyPort.findByHash()` hits Redis key `be:api_keys:hash:{hash}` on subsequent calls.
8. **WebAuthn:** `stashCasdoorSession()` / `popCasdoorSession()` use Redis keys `webauthn:session:{nonce}`. No in-memory Map remains. The periodic cleanup interval is removed (Redis TTL handles expiry).
9. **Best-effort:** If Redis is down, all cache calls log `warn` and fall through to DB. The BE continues normally. No `error` logs, no crashes.
10. **Build + test:** `pnpm run build` passes. Existing tests pass (with cache disabled — tests don't need Redis). New tests for cache behavior (with a FakeCachePort or mock) pass.

---

## 5. Resolved decisions

1. **Auth config caching:** **Hybrid** — keep SDK in-memory `getAuthConfig()` (sync) as hot path + Redis for cross-pod invalidation. `invalidateAuthConfig()` clears both. No call-site refactor needed.
2. **API key caching:** **Yes, cache in Redis** with 5-min TTL. Invalidation on key create/revoke/update.
3. **NATS version pin:** **Pin to `nats:2.14.3`** (latest stable, June 29, 2026). No breaking changes for Primebrick's JetStream service lifecycle subscriber use case. The 2.14 upgrade guide shows only JetStream sourcing/mirroring behavioral changes that don't affect simple publish/subscribe.
