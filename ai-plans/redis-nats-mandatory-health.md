# Plan: Promote Redis + NATS to Mandatory Infrastructure in Health Checks

**Date:** 2026-07-23
**Status:** DRAFT — awaiting approval
**Repos impacted:** `primebrick-v3-sdk`, `primebrick-be-v3`, `primebrick-fe-v3`, `primebrick-us-v3`

---

## Context & Motivation

Redis was originally designed as best-effort (cache, presence, WebAuthn session relay).
It is now **architecturally mandatory** because:

1. **WebAuthn passkey signin** hard-fails without Redis (`popCasdoorSession` returns null →
   `webauthn_session_expired`). Passkey is a primary auth method.
2. **MFA challenge tokens** (planned) will need Redis for short-lived session relay.
3. **SSE collaboration** depends on Redis presence store for real-time snapshots.
4. **Entity caching** (`@Cached` decorator) — without Redis, every request hits the DB,
   which is a performance concern at scale (not a hard failure, but a degradation).

NATS is also mandatory because:

1. **Service registry** — microservices register and heartbeat via NATS.
2. **Collaboration cross-instance** — presence deltas propagate via NATS.
3. **Audit bus** — audit events propagate via NATS.
4. **Config discovery** — microservices discover `redis_url` from the BE via NATS `config.get`.

Currently:
- BE `/health` returns 503 only when **DB or IDP** is down. Redis and NATS are reported in
  the JSON body but do NOT affect the HTTP status code.
- US `/health` (SDK `createHttpServer`) returns 503 when **DB or NATS** is down. Redis is
  NOT checked at all.
- The FE health chip shows `backend_offline`, `db_offline`, `idp_offline`, or `ok` — there
  is no `redis_offline` or `nats_offline` chip state.
- The BE error handler has `DATABASE_UNAVAILABLE` (503) but no `REDIS_UNAVAILABLE` or
  `NATS_UNAVAILABLE` equivalent.

---

## Decisions (confirmed with user)

1. **NATS is mandatory** in BE `/health` — 503 when NATS is down (same tier as DB/IDP/Redis).
2. **Redis health check** does an actual `PING` command on every `/health` probe (not just
   checking if the `cachePort` singleton is non-null).
3. **Redis-dependent endpoint failures** return `503 + REDIS_UNAVAILABLE` (same RFC 7807
   pattern as `DATABASE_UNAVAILABLE`).

---

## Architecture Overview (current → target)

### BE `/health` endpoint

**Current response:**
```json
{
  "ok": true,
  "service": "primebrick-api",
  "version": "0.30.0",
  "db": { "ok": true },
  "idp": { "ok": true, "type": "Casdoor", "version": "..." },
  "redis": { "ok": false, "version": undefined }
}
```
**Current 200/503 logic:** `db.ok && idp.ok` → 200, else 503. Redis ignored.

**Target response:**
```json
{
  "ok": true,
  "service": "primebrick-api",
  "version": "0.30.0",
  "db": { "ok": true },
  "idp": { "ok": true, "type": "Casdoor", "version": "..." },
  "redis": { "ok": true, "version": "8.8.0" },
  "nats": { "ok": true }
}
```
**Target 200/503 logic:** `db.ok && idp.ok && redis.ok && nats.ok` → 200, else 503.

### US `/health` endpoint (SDK `createHttpServer`)

**Current response:**
```json
{
  "status": "healthy",
  "checks": { "db": { "ok": true }, "nats": { "ok": true } }
}
```
**Target response:**
```json
{
  "status": "healthy",
  "checks": { "db": { "ok": true }, "nats": { "ok": true }, "redis": { "ok": true } }
}
```
Redis is added as a mandatory check in the SDK's `HealthCheck.runAll()`.

### FE health chip

**Current states:** `backend_offline`, `db_offline`, `idp_offline`, `ok`, `loading`
**Target states:** `backend_offline`, `db_offline`, `idp_offline`, `redis_offline`,
  `nats_offline`, `ok`, `loading`

Priority order (first match wins):
1. `backend_offline` — BE unreachable (network error)
2. `db_offline` — DB down (red)
3. `redis_offline` — Redis down (red)
4. `nats_offline` — NATS down (orange)
5. `idp_offline` — IDP down (orange)
6. `ok` — all healthy (green)
7. `loading` — unknown/not yet checked

---

## Part 1 — SDK: Add `ping()` to CachePort + Redis health check

### 1.1 Add `ping()` to `CachePort` interface

**File:** `primebrick-v3-sdk/src/cache/cache-port.ts`

Add a `ping()` method to the interface:

```typescript
export interface CachePort {
  // ... existing methods ...

  /**
   * Check if the cache backend is reachable and responsive.
   * Used by the /health endpoint. Returns true if the backend
   * responds to a ping/echo command within the timeout.
   *
   * Implementations should NOT throw — return false on any error.
   */
  ping(): Promise<boolean>;
}
```

### 1.2 Implement `ping()` in `RedisCachePort`

**File:** `primebrick-v3-sdk/src/cache/redis-cache-port.ts`

```typescript
async ping(): Promise<boolean> {
  try {
    const result = await this.redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}
```

### 1.3 Add Redis to the SDK `HealthCheck` class

**File:** `primebrick-v3-sdk/src/http/health-check.ts`

The `HealthCheck` class currently takes a `dbPing: HealthCheckPort` and
`customChecks: Record<string, () => Promise<HealthCheckResult>>`.

**No change to the `HealthCheck` class itself** — Redis will be added as a custom check
by the US microservice (Part 4). The class already supports arbitrary custom checks.

However, add a helper to the SDK for convenience:

**File:** `primebrick-v3-sdk/src/cache/cache-health.ts` (NEW)

```typescript
import type { CachePort } from "./cache-port.js";
import type { HealthCheckResult } from "../http/health-check.js";

/**
 * Create a Redis health check function from a CachePort.
 * Returns a function suitable for passing to HealthCheck's customChecks.
 *
 * The function calls `cachePort.ping()` — an actual Redis PING command,
 * not just a null check on the singleton. This detects Redis going down
 * AFTER startup.
 *
 * If cachePort is null (Redis not configured), returns { ok: false }.
 */
export function createRedisHealthCheck(
  getCachePort: () => CachePort | null,
): () => Promise<HealthCheckResult> {
  return async () => {
    const port = getCachePort();
    if (!port) return { ok: false, error: "Redis not configured" };
    const ok = await port.ping();
    return ok ? { ok: true } : { ok: false, error: "Redis PING failed" };
  };
}
```

### 1.4 Export from SDK index

**File:** `primebrick-v3-sdk/src/cache/index.ts`

Add export: `export { createRedisHealthCheck } from "./cache-health.js";`

Also export `ping` is already part of the `CachePort` interface — no separate export needed.

### 1.5 Add `FakeCachePort` ping implementation (if it exists)

Check if there's a `FakeCachePort` or mock cache port in tests. If yes, add `ping()`:
```typescript
async ping(): Promise<boolean> { return true; }
```

---

## Part 2 — BE: Promote Redis + NATS to mandatory in `/health`

### 2.1 Add `checkRedis()` function (actual PING)

**File:** `primebrick-be-v3/src/index.ts`

Replace the current `getRedisHealth()` call with an active PING:

```typescript
async function checkRedis(): Promise<{ ok: boolean; version?: string }> {
  const port = getCachePort();
  if (!port) return { ok: false };
  try {
    const ok = await port.ping();
    if (!ok) return { ok: false };
    // Version is cached at startup — don't re-query on every health probe
    return { ok: true, version: getRedisHealth().version };
  } catch {
    return { ok: false };
  }
}
```

**Note:** `getRedisHealth()` (from `cache-port-holder.ts`) is still used for the version
string (cached at startup). The PING is the live check; the version is static metadata.

### 2.2 Add `checkNats()` function

**File:** `primebrick-be-v3/src/index.ts`

```typescript
function checkNats(): { ok: boolean } {
  return { ok: NatsClient.isConnected() };
}
```

**Note:** `NatsClient.isConnected()` checks `nc !== null && !nc.isClosed()`. This is a
local check (no network round-trip). The NATS client's built-in heartbeat/reconnection
handles detecting actual connectivity loss. If a more active check is desired, we could
publish a test message, but `isConnected()` is the standard pattern used by the US
microservices already.

### 2.3 Update `HealthPayload` type

**File:** `primebrick-be-v3/src/index.ts`

```typescript
type HealthPayload = {
  ok: true;
  service: "primebrick-api";
  version: string;
  db: { ok: boolean };
  idp: { ok: boolean; type?: string; version?: string };
  redis: { ok: boolean; version?: string };
  nats: { ok: boolean };
};
```

### 2.4 Update `healthPayload()` and `sendHealth()`

**File:** `primebrick-be-v3/src/index.ts`

```typescript
async function healthPayload(): Promise<HealthPayload> {
  const pool = getPool();
  return {
    ok: true,
    service: "primebrick-api",
    version: BACKEND_VERSION,
    db: await checkDb(),
    idp: await checkIdp(pool),
    redis: await checkRedis(),
    nats: checkNats(),
  };
}

async function sendHealth(res: Response) {
  const payload = await healthPayload();
  const isHealthy = payload.db.ok && payload.idp.ok && payload.redis.ok && payload.nats.ok;
  res.status(isHealthy ? 200 : 503).json(payload);
}
```

### 2.5 Import `getCachePort` in `index.ts`

**File:** `primebrick-be-v3/src/index.ts`

Add to existing imports from `cache-port-holder.ts`:
```typescript
import { initCache, closeCache, getRedisHealth, getCachePort } from "./cache/cache-port-holder.js";
```

`getCachePort` is already exported from `cache-port-holder.ts` (line 55) — just not imported
in `index.ts` currently.

---

## Part 3 — BE: Add `REDIS_UNAVAILABLE` error handling

### 3.1 Add `isRedisUnavailableError()` helper

**File:** `primebrick-be-v3/src/http/api-errors.ts`

Add a helper that detects Redis-related errors. The challenge: Redis errors propagate as
generic `Error` from `node-redis`, not with a specific `code` field. The WebAuthn service
already wraps Redis failures into `UnauthorizedError("WebAuthn session expired or not found")`.

**Approach:** Rather than detecting Redis errors by type (fragile), we add an explicit
`RedisUnavailableError` class and throw it from Redis-dependent code paths when
`getCachePort()` returns null or when Redis operations fail.

```typescript
export class RedisUnavailableError extends ApiError {
  constructor(
    detail: string,
    options?: { instance?: string; internal_code?: string }
  ) {
    super(
      "/errors/redis-unavailable",
      "Redis unavailable",
      503,
      detail,
      {
        ...options,
        internal_code: options?.internal_code || "REDIS_UNAVAILABLE",
        severity: "CRITICAL",
      }
    );
    this.name = "RedisUnavailableError";
  }
}
```

Also add to the `ApiErrorCode` union type:
```typescript
export type ApiErrorCode =
  | "DATABASE_UNAVAILABLE"
  | "REDIS_UNAVAILABLE"      // ← NEW
  | "LIST_FAILED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN";
```

### 3.2 Handle `RedisUnavailableError` in the error handler

**File:** `primebrick-be-v3/src/http/error-handler.ts`

Add a check BEFORE the generic 500 fallback, after the `isDatabaseUnavailableError` check:

```typescript
if (err instanceof RedisUnavailableError) {
  res.status(503).json(err.toResponse());
  return;
}
```

### 3.3 Throw `RedisUnavailableError` from WebAuthn service

**File:** `primebrick-be-v3/src/modules/auth/services/webauthn.service.ts`

In `popCasdoorSession()`, when `getCachePort()` returns null, throw
`RedisUnavailableError` instead of returning null (which currently causes a
confusing `webauthn_session_expired` error):

```typescript
async function popCasdoorSession(nonce: string): Promise<string | null> {
  const port = getCachePort();
  if (!port) {
    throw new RedisUnavailableError(
      "Redis is required for WebAuthn session relay but is not available. " +
      "Passkey signin cannot proceed without Redis. Form-based login still works.",
      { internal_code: "REDIS_UNAVAILABLE" }
    );
  }
  try {
    const cookie = await port.get<string>(sessionRelayKey(nonce));
    if (cookie) {
      await port.del(sessionRelayKey(nonce));
    }
    return cookie;
  } catch (e) {
    console.warn(`[cache] webauthn session pop failed: ${e}`);
    throw new RedisUnavailableError(
      "Redis operation failed during WebAuthn session relay. " +
      "Passkey signin cannot proceed at this time.",
      { internal_code: "REDIS_UNAVAILABLE" }
    );
  }
}
```

**Important:** The `signinFinish` method currently catches the null return and throws
`UnauthorizedError("WebAuthn session expired or not found")`. With this change, when
Redis is down, the error is `RedisUnavailableError` (503) — clear and actionable.
When Redis is up but the nonce is genuinely expired (user took >5 min), `popCasdoorSession`
returns null (cookie not found, not Redis error), and the existing
`UnauthorizedError("WebAuthn session expired")` is still thrown. The two cases are now
distinguishable.

### 3.4 Import `RedisUnavailableError` in `webauthn.service.ts`

```typescript
import { RedisUnavailableError } from "../../../http/api-errors.js";
```

---

## Part 4 — US: Add Redis to microservice `/health`

### 4.1 Add Redis health check to emailsender

**File:** `primebrick-us-v3/emailsender/src/index.ts`

Add Redis as a custom check in the `HealthCheck` constructor:

```typescript
import { createRedisHealthCheck, getCachePort } from "@primebrick/sdk";

// ... existing code ...

const healthCheck = new HealthCheck(
  healthCheckAdapter,
  {
    nats: () => healthCheckAdapter.checkNats(),
    redis: createRedisHealthCheck(() => getCachePort()),
  },
);
```

**Note:** The US gets `getCachePort` from the SDK (already exported). The
`createRedisHealthCheck` helper (Part 1.3) wraps it into a `HealthCheckResult` function.

### 4.2 Add Redis to the heartbeat health check function

**File:** `primebrick-us-v3/emailsender/src/index.ts`

In the `ServiceRegistrar` health check function (lines 119-157), add Redis:

```typescript
async () => {
  const dbOk = await healthCheckAdapter.ping();
  const natsOk = NatsClient.isConnected();
  const redisPort = getCachePort();
  const redisOk = redisPort ? await redisPort.ping() : false;
  return {
    http_healthy: dbOk && natsOk && redisOk,
    checks: {
      db: { ok: dbOk },
      nats: { ok: natsOk },
      redis: { ok: redisOk },
    },
  };
},
```

### 4.3 Export `getCachePort` from SDK (verify it's already exported)

**File:** `primebrick-v3-sdk/src/index.ts`

Check that `getCachePort` is already exported. If not, add it:
```typescript
export { getCachePort } from "./cache/cache-port-holder.js";
```

**Note:** The US uses `getCachePort` from the SDK's `cache-port-holder.ts`. The SDK's
holder is separate from the BE's holder (different files, different singletons). The
SDK holder is at `primebrick-v3-sdk/src/cache/cache-port-holder.ts`.

**Wait — verify:** The BE has its own `cache-port-holder.ts` at
`primebrick-be-v3/src/cache/cache-port-holder.ts`. The SDK also has one at
`primebrick-v3-sdk/src/cache/cache-port-holder.ts`. Need to verify which one the US
imports from. The US imports from `@primebrick/sdk` which is the SDK. So the US gets
the SDK's `getCachePort`. The BE gets its own local `getCachePort`. These are separate
singletons — that's fine, they're different processes.

---

## Part 5 — FE: Add `redis_offline` and `nats_offline` health chip states

### 5.1 Update `HealthPayload` type

**File:** `primebrick-fe-v3/src/lib/api-types.ts`

```typescript
export type HealthPayload = {
  ok: true;
  service: string;
  version: string;
  db: { ok: boolean };
  idp: { ok: boolean; type?: string; version?: string };
  redis: { ok: boolean; version?: string };  // ← was optional, now required
  nats: { ok: boolean };                      // ← NEW
};
```

### 5.2 Update `isValidHealthPayload`

**File:** `primebrick-fe-v3/src/lib/api-types.ts`

Add `nats` to the validation:
```typescript
export function isValidHealthPayload(x: unknown): x is HealthPayload {
  // ... existing checks ...
  // Add: typeof (x as any).nats === 'object' && typeof (x as any).nats?.ok === 'boolean'
}
```

### 5.3 Update `HealthChipState` type

**File:** `primebrick-fe-v3/src/lib/backend-availability.svelte.ts`

```typescript
export type HealthChipState =
  | 'backend_offline'
  | 'db_offline'
  | 'redis_offline'    // ← NEW
  | 'nats_offline'     // ← NEW
  | 'idp_offline'
  | 'ok'
  | 'loading';
```

### 5.4 Update `computeHealthChip()`

**File:** `primebrick-fe-v3/src/lib/backend-availability.svelte.ts`

```typescript
function computeHealthChip(): HealthChipState {
  if (backendState.offline) return 'backend_offline';
  if (backendState.health === null) return 'loading';
  if (!backendState.health.db.ok) return 'db_offline';
  if (!backendState.health.redis?.ok) return 'redis_offline';
  if (!backendState.health.nats?.ok) return 'nats_offline';
  if (!backendState.health.idp.ok) return 'idp_offline';
  return 'ok';
}
```

**Priority order:** backend_offline > db_offline > redis_offline > nats_offline > idp_offline > ok

### 5.5 Update `backendState` to track Redis/NATS

**File:** `primebrick-fe-v3/src/lib/backend-availability.svelte.ts`

Add `redisOk` and `natsOk` to the state (optional — the chip can read from
`backendState.health` directly, which is what `computeHealthChip` does). No new state
fields needed — the health payload already has `redis` and will have `nats`.

### 5.6 Update `useHealthChip` composable

**File:** `primebrick-fe-v3/src/lib/composables/useHealthChip.svelte.ts`

Add label and class mappings for the two new states:

```typescript
export function chipLabel(chip: HealthChipState): string {
  const tt = get(t);
  return chip === 'backend_offline'
    ? tt('shell.health.beOffline')
    : chip === 'db_offline'
      ? tt('shell.health.dbOffline')
      : chip === 'redis_offline'           // ← NEW
        ? tt('shell.health.redisOffline')
        : chip === 'nats_offline'          // ← NEW
          ? tt('shell.health.natsOffline')
          : chip === 'idp_offline'
            ? tt('shell.health.idpOffline')
            : chip === 'ok'
              ? tt('shell.health.beOnline')
              : tt('common.loading');
}

export function chipClass(chip: HealthChipState): string {
  return chip === 'backend_offline'
    ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
    : chip === 'db_offline'
      ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
      : chip === 'redis_offline'           // ← NEW (red — mandatory)
        ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
        : chip === 'nats_offline'          // ← NEW (orange — mandatory but less critical)
          ? 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
          : chip === 'idp_offline'
            ? 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
            : chip === 'ok'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-border/60 bg-muted/30 text-muted-foreground';
}
```

### 5.7 Update `SidebarHealthBadge` component

**File:** `primebrick-fe-v3/src/lib/components/sidebar/SidebarHealthBadge.svelte`

Add icons for the two new states:

```svelte
{#if healthChip === 'backend_offline'}
  <CloudOff class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
{:else if healthChip === 'db_offline'}
  <Database class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
{:else if healthChip === 'redis_offline'}
  <DatabaseZap class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
{:else if healthChip === 'nats_offline'}
  <Radio class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
{:else if healthChip === 'idp_offline'}
  <ShieldAlert class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
{:else}
  <Cloud class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
{/if}
```

**Icons:** `DatabaseZap` (Lucide) for Redis, `Radio` (Lucide) for NATS. Both are available
in `@lucide/svelte`.

### 5.8 Update `AppShell.svelte` polling logic

**File:** `primebrick-fe-v3/src/lib/components/AppShell.svelte`

Add Redis and NATS to the polling trigger:

```typescript
$effect(() => {
  if (!browser) return;
  const dbDown = backendState.health !== null && !backendState.health.db.ok;
  const redisDown = backendState.health !== null && !backendState.health.redis?.ok;
  const natsDown = backendState.health !== null && !backendState.health.nats?.ok;
  const idpDown = backendState.health !== null && !backendState.health.idp.ok;
  if (!backendState.offline && !dbDown && !redisDown && !natsDown && !idpDown) return;
  const id = setInterval(() => void probeHealth(), 5000);
  return () => clearInterval(id);
});
```

### 5.9 Update `connectivity-restored` dispatch

**File:** `primebrick-fe-v3/src/lib/backend-availability.svelte.ts`

Add `redis_offline` and `nats_offline` to the previous-chip check:

```typescript
if (
  (previousChip === 'backend_offline' || previousChip === 'db_offline' ||
   previousChip === 'redis_offline' || previousChip === 'nats_offline' ||
   previousChip === 'idp_offline') &&
  backendState.healthChip === 'ok'
) {
  dispatchConnectivityRestored({ previous: previousChip });
}
```

### 5.10 Add i18n keys (all 6 locales)

Add `shell.health.redisOffline` and `shell.health.natsOffline` to all 6 locale files:

| Locale | redisOffline | natsOffline |
|--------|-------------|-------------|
| en-GB | "Redis offline" | "NATS offline" |
| it-IT | "Redis offline" | "NATS offline" |
| de-DE | "Redis offline" | "NATS offline" |
| es-ES | "Redis offline" | "NATS offline" |
| fr-FR | "Redis offline" | "NATS offline" |
| pt-PT | "Redis offline" | "NATS offline" |

(These are proper nouns — not translated.)

### 5.11 Update `VersionsPanel` to show NATS

**File:** `primebrick-fe-v3/src/lib/shell/sheets/panels/VersionsPanel.svelte`

Add a NATS row (similar to the existing Redis row):

```svelte
<div class="flex items-center justify-between gap-3 text-sm">
  <div class="text-muted-foreground">{$t('shell.health.nats')}</div>
  <div class="flex items-center gap-2">
    {#if backendState.health?.nats?.ok}
      <Badge variant="outline" class="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-medium">
        Online
      </Badge>
    {:else}
      <Badge variant="outline" class="text-red-600 dark:text-red-400 font-mono text-[11px] font-medium">
        Offline
      </Badge>
    {/if}
  </div>
</div>
```

Add i18n key `shell.health.nats` = "NATS" to all locales.

### 5.12 Handle `REDIS_UNAVAILABLE` 503 in `api.ts`

**File:** `primebrick-fe-v3/src/lib/api.ts`

The existing 503 handler already probes health and throws `ApiDatabaseUnavailableError`.
We need to distinguish `REDIS_UNAVAILABLE` from `DATABASE_UNAVAILABLE` so the FE can
show the right chip.

**Approach:** Check the response body's `internal_code` before throwing:

```typescript
if (res.status === 503) {
  // Check if this is Redis-specific or DB-specific
  let internalCode: string | undefined;
  try {
    const cloned = res.clone();
    const body = await cloned.json();
    internalCode = body?.internal_code;
  } catch { /* not JSON — treat as generic 503 */ }

  void probeHealth({ force: true });

  if (internalCode === 'REDIS_UNAVAILABLE') {
    throw new ApiRedisUnavailableError(503);
  }
  throw new ApiDatabaseUnavailableError(503);
}
```

Add `ApiRedisUnavailableError` class:

**File:** `primebrick-fe-v3/src/lib/api-types.ts`

```typescript
/** BE responded; downstream Redis is unavailable — not the same as DB or gateway/offline. */
export class ApiRedisUnavailableError extends Error {
  override readonly name = 'ApiRedisUnavailableError';
  readonly status: number;

  constructor(status: number) {
    super('ApiRedisUnavailableError');
    this.status = status;
  }
}
```

**Note:** Both `ApiDatabaseUnavailableError` and `ApiRedisUnavailableError` trigger the
health probe (which updates the chip). The difference is for callers that want to
distinguish the two (e.g. WebAuthn UI can show "Redis offline — passkey login unavailable"
instead of a generic "DB offline" message).

---

## Part 6 — BE: Update startup sequence for mandatory Redis

### 6.1 Change `initCacheFromConfig` from best-effort to retry

**File:** `primebrick-be-v3/src/index.ts`

Currently, `initCacheFromConfig` catches errors and logs a warning. Since Redis is now
mandatory, change to retry (same pattern as `refreshRoleMappings` and `refreshAuthConfig`):

```typescript
async function initCacheFromConfig(): Promise<void> {
  try {
    const cfg = getAuthConfig();
    await initCache(cfg.redis_url, console);
  } catch (err) {
    console.warn(
      "[startup] initCache failed (Redis unavailable?). Retrying in 5s.",
      err
    );
    setTimeout(() => void initCacheFromConfig().catch(() => {}), 5000);
  }
}
```

**Note:** If `redis_url` is empty, `initCache` logs a warning and returns (no retry).
The retry only fires when `redis_url` IS set but Redis is unreachable. The `/health`
endpoint will return 503 (redis.ok=false) until the retry succeeds.

### 6.2 Same for `initPresenceStoreFromConfig`

**File:** `primebrick-be-v3/src/index.ts`

Add retry logic (same pattern):

```typescript
async function initPresenceStoreFromConfig(): Promise<void> {
  try {
    const cfg = getAuthConfig();
    await initPresenceStore(cfg.redis_url, console);
    if (cfg.redis_url) {
      try {
        stopKeyspaceListener = await startKeyspaceListener(cfg.redis_url, console);
      } catch (err) {
        console.warn("[startup] keyspace listener failed (best-effort):", err);
      }
    }
  } catch (err) {
    console.warn(
      "[startup] initPresenceStore failed (Redis unavailable?). Retrying in 5s.",
      err
    );
    setTimeout(() => void initPresenceStoreFromConfig().catch(() => {}), 5000);
  }
}
```

---

## Part 7 — Docs updates

### 7.1 Update BE AGENTS.md

Add note about Redis being mandatory.

### 7.2 Update infrastructure docs

Update `primebrick-v3-docs/pages/getting-started/infrastructure.mdx` to list Redis as
mandatory (not optional).

---

## Security Concerns

1. **No secrets exposed:** The `/health` endpoint already avoids exposing `redis_url`.
   The `getRedisHealth()` function returns only `{ ok, version }` — no URL, no credentials.
   The new `checkRedis()` function follows the same pattern.

2. **Public endpoint:** `/health` is public (no auth). This is standard practice for
   health endpoints (Kubernetes liveness/readiness probes, load balancer checks).
   The response reveals infrastructure status (DB/Redis/NATS/IDP up/down) but NOT
   configuration details (no URLs, no credentials, no internal IPs). This is acceptable.

3. **DoS via health probe:** The `checkRedis()` function executes a `PING` command on
   every `/health` call. A flood of health requests could overwhelm Redis. Mitigation:
   the FE polls every 5s (not a flood), and external health probes are typically
   rate-limited at the infra level (load balancer, Kubernetes probe interval).
   The `PING` command is O(1) — sub-millisecond. No concern.

4. **Error message leakage:** The `RedisUnavailableError` detail message should NOT
   include the Redis URL or connection details. The messages in Part 3.3 are generic
   ("Redis is required for WebAuthn session relay but is not available") — no sensitive
   info.

---

## HTTP Status Code Summary

| Scenario | HTTP Status | internal_code | FE chip | FE error class |
|----------|-------------|---------------|---------|----------------|
| All healthy | 200 | — | `ok` | — |
| DB down | 503 | `DATABASE_UNAVAILABLE` | `db_offline` | `ApiDatabaseUnavailableError` |
| Redis down | 503 | `REDIS_UNAVAILABLE` | `redis_offline` | `ApiRedisUnavailableError` |
| NATS down | 503 | — (health-only) | `nats_offline` | `ApiDatabaseUnavailableError` |
| IDP down | 503 | — (health-only) | `idp_offline` | `ApiDatabaseUnavailableError` |
| BE unreachable | — | — | `backend_offline` | `ApiUnreachableError` |

**Note on NATS:** NATS down is detected via `/health` (503 response), not via a specific
error code on individual endpoints. NATS-dependent endpoints (email sending, collaboration)
will fail with their own error codes, but the 503 from `/health` is what triggers the
`nats_offline` chip. The FE treats any 503 as "probe health" — the health response
distinguishes which component is down.

---

## Acceptance Criteria

1. **BE `/health`** returns 503 when Redis is down (verified by stopping Redis container
   and hitting `/health`).
2. **BE `/health`** returns 503 when NATS is down (verified by stopping NATS container).
3. **BE `/health`** response includes `redis: { ok, version }` and `nats: { ok }` fields.
4. **BE `/health`** Redis check does an actual `PING` (verified by checking Redis MONITOR
   for PING commands during health probes).
5. **WebAuthn signin** returns `503 + REDIS_UNAVAILABLE` when Redis is down (not the
   confusing `401 + webauthn_session_expired`).
6. **US `/health`** includes `redis` in the checks object and returns 503 when Redis is down.
7. **US heartbeat** includes Redis status in the health check function.
8. **FE health chip** shows `redis_offline` (red) when Redis is down.
9. **FE health chip** shows `nats_offline` (orange) when NATS is down.
10. **FE VersionsPanel** shows NATS status (Online/Offline).
11. **FE polling** continues every 5s while Redis or NATS is down.
12. **FE `ApiRedisUnavailableError`** is thrown on 503 + `REDIS_UNAVAILABLE` internal_code.
13. **BE startup** retries Redis connection every 5s if it fails (same as DB/role mappings).
14. **SDK `CachePort`** interface has `ping()` method.
15. **SDK `RedisCachePort`** implements `ping()` via `redis.ping()`.
16. **SDK `createRedisHealthCheck`** helper exported.
17. **All 6 locale files** have `shell.health.redisOffline` and `shell.health.natsOffline` keys.
18. **BE build** passes with 0 errors.
19. **FE svelte-check** passes with 0 errors.
20. **SDK build** passes with 0 errors.
21. **US build** passes with 0 errors.
22. **BE unit tests** pass (no regressions beyond the pre-existing step-up test).

---

## Files to Modify

### SDK (`primebrick-v3-sdk`)
1. `src/cache/cache-port.ts` — add `ping()` to interface
2. `src/cache/redis-cache-port.ts` — implement `ping()`
3. `src/cache/cache-health.ts` — NEW: `createRedisHealthCheck` helper
4. `src/cache/index.ts` — export `createRedisHealthCheck`
5. `src/index.ts` — export `getCachePort` (if not already exported)
6. Any `FakeCachePort` in tests — add `ping()`

### BE (`primebrick-be-v3`)
7. `src/index.ts` — `checkRedis()`, `checkNats()`, update `HealthPayload`, `sendHealth`,
   retry logic for `initCacheFromConfig` and `initPresenceStoreFromConfig`
8. `src/http/api-errors.ts` — `RedisUnavailableError` class, add to `ApiErrorCode` union
9. `src/http/error-handler.ts` — handle `RedisUnavailableError`
10. `src/modules/auth/services/webauthn.service.ts` — throw `RedisUnavailableError` from
    `popCasdoorSession`
11. `AGENTS.md` — note Redis is mandatory

### FE (`primebrick-fe-v3`)
12. `src/lib/api-types.ts` — update `HealthPayload`, `isValidHealthPayload`,
    `ApiRedisUnavailableError` class
13. `src/lib/backend-availability.svelte.ts` — `HealthChipState`, `computeHealthChip`,
    connectivity-restored dispatch
14. `src/lib/composables/useHealthChip.svelte.ts` — `chipLabel`, `chipClass` for new states
15. `src/lib/components/sidebar/SidebarHealthBadge.svelte` — icons for new states
16. `src/lib/components/AppShell.svelte` — polling logic for Redis/NATS
17. `src/lib/api.ts` — handle `REDIS_UNAVAILABLE` 503
18. `src/lib/shell/sheets/panels/VersionsPanel.svelte` — NATS row
19. `src/lib/i18n/messages/en-GB.json` — `redisOffline`, `natsOffline`, `nats` keys
20. `src/lib/i18n/messages/it-IT.json` — same
21. `src/lib/i18n/messages/de-DE.json` — same
22. `src/lib/i18n/messages/es-ES.json` — same
23. `src/lib/i18n/messages/fr-FR.json` — same
24. `src/lib/i18n/messages/pt-PT.json` — same

### US (`primebrick-us-v3`)
25. `emailsender/src/index.ts` — add Redis to `HealthCheck` and heartbeat

### Docs (`primebrick-v3-docs`)
26. `pages/getting-started/infrastructure.mdx` — Redis mandatory

---

## Build Order

1. **SDK first** (Parts 1.1-1.5) — add `ping()` to interface + implementation + helper
2. **BE** (Parts 2-3, 6) — health endpoint, error handling, startup retry
3. **FE** (Part 5) — health chip, i18n, error handling
4. **US** (Part 4) — health check + heartbeat
5. **Docs** (Part 7)
6. **Verify** — build all 4 repos, run BE tests, manual test health endpoint
