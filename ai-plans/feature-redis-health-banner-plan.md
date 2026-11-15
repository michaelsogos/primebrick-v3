# Plan: Redis Health Banner + VersionsPanel Redis Line

> Status: DRAFT — awaiting approval before implementation.
> Based on empirical codebase investigation across `primebrick-v3-sdk`, `primebrick-be-v3`, `primebrick-us-v3`, and `primebrick-fe-v3`.

## 1. Objective

Add Redis connection visibility across the stack:

- **BE + microservices**: console log at startup showing Redis connection status + version (or "disabled" if not configured).
- **FE VersionsPanel**: a new "Redis" row showing version badge + online/offline status (no URL exposed to FE, per user decision).
- **Centralized `redis_url`**: microservices discover `redis_url` from the BE via a generic NATS `config.get` request/reply, not from their own config tables. All logic lives in the SDK (DRY).

## 2. Architectural decisions confirmed with the user

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `redis_url` source for microservices | **NATS `config.get` request/reply** | Centralized in BE's `auth_configurations`; microservices don't duplicate it; fits existing NATS architecture. |
| NATS subject name | **`config.get`** (generic) | Extensible — future shared config fields (s3_url, feature_flags) can be added without new subjects. |
| SDK ownership | **All shared-config logic in SDK** | DRY — microservices call one SDK function, BE calls one SDK subscribe function. |
| Health endpoint exposure | **`redis: { ok, version }` only — no URL** | URL is only in BE console log, not exposed to FE. Safer for screenshots. |
| Microservice Redis scope | **BE + all microservices** | Microservices must connect to Redis for cache invalidation to work across the system. |

## 3. SDK changes (`primebrick-v3-sdk`)

### 3.1 New: `getRedisInfo()` helper

File: `src/cache/redis-info.ts` (new)

```ts
import type { RedisClientType } from "redis";

export type RedisInfo = {
  version: string;
};

/**
 * Query Redis INFO and parse the server version.
 * Best-effort: returns null if the INFO call fails or the version cannot be parsed.
 */
export async function getRedisInfo(redis: RedisClientType): Promise<RedisInfo | null> {
  try {
    const info = (await redis.info()) as string;
    // INFO output is a text block with \r\n line separators:
    // # Server\r\nredis_version:7.4.0\r\nredis_git_sha1:...\r\n
    const match = info.match(/redis_version:([^\r\n]+)/);
    if (match) return { version: match[1].trim() };
    return null;
  } catch {
    return null;
  }
}
```

### 3.2 New: `SharedConfigPort` — NATS `config.get` protocol

File: `src/config/shared-config.ts` (new)

```ts
import type { NatsClient } from "../nats/nats-client.js";

/**
 * Shape of the shared config object exchanged via NATS `config.get`.
 * Extensible — future fields can be added without breaking consumers.
 * All fields are optional: the BE only includes what it has configured.
 */
export interface SharedConfig {
  redis_url?: string;
  // Future: s3_url?, feature_flags?, etc.
}

/** NATS subject for the shared config request/reply. */
export const SHARED_CONFIG_SUBJECT = "config.get";

/** Timeout for the NATS request (ms). If the BE doesn't respond, the caller continues without shared config. */
const SHARED_CONFIG_TIMEOUT_MS = 5_000;

/**
 * BE side: subscribe to `config.get` on NATS and respond with the shared config object.
 * The `getConfig` function is called on each request — the BE passes a function that
 * reads from its auth config (already loaded in memory).
 *
 * @param nats The NatsClient instance (already connected)
 * @param getConfig Function that returns the current SharedConfig
 */
export async function subscribeSharedConfig(
  nats: NatsClient,
  getConfig: () => SharedConfig,
): Promise<void> {
  await nats.subscribe(SHARED_CONFIG_SUBJECT, async (err, _msg, reply) => {
    if (err || !reply) return;
    try {
      const config = getConfig();
      reply(JSON.stringify(config));
    } catch {
      reply(JSON.stringify({}));
    }
  });
}

/**
 * Microservice side: fetch the shared config from the BE via NATS request/reply.
 * Best-effort: returns an empty object if the BE doesn't respond or times out.
 *
 * @param nats The NatsClient instance (already connected)
 * @returns The SharedConfig object (fields may be undefined if not configured)
 */
export async function fetchSharedConfig(nats: NatsClient): Promise<SharedConfig> {
  try {
    const response = await nats.request(SHARED_CONFIG_SUBJECT, "", SHARED_CONFIG_TIMEOUT_MS);
    if (!response) return {};
    return JSON.parse(response) as SharedConfig;
  } catch {
    return {};
  }
}
```

### 3.3 New: `initCacheFromSharedConfig()` — one-liner for microservices

File: `src/cache/cache-bootstrap.ts` (new)

```ts
import type { CachePort, CacheLogger } from "./cache-port.js";
import { RedisCachePort, createRedisClient, closeRedisClient } from "./redis-client.js";
import { getRedisInfo, type RedisInfo } from "./redis-info.js";
import { fetchSharedConfig, type SharedConfig } from "../config/shared-config.js";
import type { NatsClient } from "../nats/nats-client.js";

export type CacheBootstrapResult = {
  cachePort: CachePort | null;
  redisInfo: RedisInfo | null;
  sharedConfig: SharedConfig;
};

/**
 * One-liner for microservices: fetch redis_url from the BE via NATS `config.get`,
 * connect to Redis, query the server version, and log a startup banner.
 *
 * Best-effort: if redis_url is empty, Redis is unreachable, or the BE doesn't respond,
 * returns { cachePort: null, redisInfo: null } and logs a warn. The system is fully
 * valid without Redis.
 *
 * @param nats The NatsClient instance (already connected to NATS)
 * @param logger Console or custom logger with info/warn methods
 * @returns The cache port (or null) + Redis info (or null) + the full shared config
 */
export async function initCacheFromSharedConfig(
  nats: NatsClient,
  logger: CacheLogger,
): Promise<CacheBootstrapResult> {
  const sharedConfig = await fetchSharedConfig(nats);

  if (!sharedConfig.redis_url) {
    logger.warn("[cache] redis_url not received from BE — cache disabled (best-effort)");
    return { cachePort: null, redisInfo: null, sharedConfig };
  }

  try {
    const redis = await createRedisClient(sharedConfig.redis_url);
    const cachePort = new RedisCachePort(redis);
    const redisInfo = await getRedisInfo(redis);

    if (redisInfo) {
      logger.info(`[cache] Redis connected (v${redisInfo.version})`);
    } else {
      logger.info(`[cache] Redis connected (version unknown)`);
    }

    return { cachePort, redisInfo, sharedConfig };
  } catch (err) {
    logger.warn(`[cache] Redis connection failed — cache disabled: ${err}`);
    return { cachePort: null, redisInfo: null, sharedConfig };
  }
}
```

### 3.4 Exports

Update `src/index.ts` to export:
- `getRedisInfo`, `RedisInfo` (from `cache/redis-info.ts`)
- `SharedConfig`, `SHARED_CONFIG_SUBJECT`, `subscribeSharedConfig`, `fetchSharedConfig` (from `config/shared-config.ts`)
- `initCacheFromSharedConfig`, `CacheBootstrapResult` (from `cache/cache-bootstrap.ts`)

### 3.5 NatsClient API check

The `subscribe` and `request` methods on `NatsClient` must support the signatures used above. Need to verify the existing `NatsClient` API:
- `subscribe(subject, callback)` — callback receives `(err, msg, reply)` where `reply` is a function to send a reply.
- `request(subject, data, timeoutMs)` — returns the reply data as a string or null on timeout.

If the existing API differs, adapt the `shared-config.ts` implementation to match the actual `NatsClient` API.

## 4. BE changes (`primebrick-be-v3`)

### 4.1 Enhanced `initCache()` with version logging

File: `src/cache/cache-port-holder.ts` (modify)

- After `createRedisClient(redisUrl)`, call `getRedisInfo(redis)` to get the version.
- Log `[cache] Redis connected (v<x.y.z>)` or `[cache] Redis connected (version unknown)`.
- Store `redisInfo` in a module-level variable for the health endpoint.
- Export `getRedisInfoState()` to return `{ ok: boolean; version?: string }`.

```ts
import { getRedisInfo, type RedisInfo } from "@primebrick/sdk";

let cachePort: CachePort | null = null;
let redisInfo: RedisInfo | null = null;

export async function initCache(redisUrl: string | undefined, logger: CacheLogger): Promise<void> {
  if (!redisUrl) {
    logger.warn("[cache] redis_url not set — cache disabled (best-effort)");
    return;
  }
  try {
    const redis = await createRedisClient(redisUrl);
    cachePort = new RedisCachePort(redis);
    redisInfo = await getRedisInfo(redis);
    if (redisInfo) {
      logger.info(`[cache] Redis connected (v${redisInfo.version})`);
    } else {
      logger.info(`[cache] Redis connected (version unknown)`);
    }
  } catch (err) {
    logger.warn(`[cache] Redis connection failed — cache disabled: ${err}`);
  }
}

export function getRedisHealth(): { ok: boolean; version?: string } {
  if (!cachePort) return { ok: false };
  return { ok: true, version: redisInfo?.version };
}
```

### 4.2 Subscribe to `config.get` on NATS

File: `src/index.ts` (modify, in `runStartupTasks()`)

After NATS connection is established (in `startServiceLifecycle()`), subscribe to `config.get`:

```ts
import { subscribeSharedConfig } from "@primebrick/sdk";

async function startServiceLifecycle(): Promise<void> {
  try {
    await NatsClient.getConnection();
    // Subscribe to config.get — respond with shared config (redis_url, etc.)
    await subscribeSharedConfig(NatsClient, () => {
      const cfg = getAuthConfig();
      return { redis_url: cfg.redis_url };
    });
    const subscriber = new ServiceLifecycleSubscriber();
    await subscriber.start();
    const staleJob = new StaleDetectionJob();
    staleJob.start();
  } catch (err) {
    // ... existing retry logic
  }
}
```

### 4.3 Add `redis` to health endpoint

File: `src/index.ts` (modify)

Update `HealthPayload` type:

```ts
type HealthPayload = {
  ok: true;
  service: "primebrick-api";
  version: string;
  db: { ok: boolean };
  idp: { ok: boolean; type?: string; version?: string };
  redis: { ok: boolean; version?: string };
};
```

Update `healthPayload()`:

```ts
async function healthPayload(): Promise<HealthPayload> {
  const pool = getPool();
  return {
    ok: true,
    service: "primebrick-api",
    version: BACKEND_VERSION,
    db: await checkDb(),
    idp: await checkIdp(pool),
    redis: getRedisHealth(),
  };
}
```

### 4.4 Startup banner (optional but nice)

In `runStartupTasks()`, after `initCacheFromConfig()`, the log line from `initCache()` already serves as the banner. No additional banner needed — the `[cache]` log lines are clear enough.

## 5. US / emailsender changes (`primebrick-us-v3`)

### 5.1 Add Redis initialization after NATS connect

File: `emailsender/src/index.ts` (modify)

After the NATS connection block (line ~96), add:

```ts
import { initCacheFromSharedConfig } from "@primebrick/sdk";

// ── Redis cache (best-effort, redis_url discovered from BE via NATS config.get) ──
const cacheResult = await initCacheFromSharedConfig(NatsClient, console);
if (cacheResult.cachePort) {
  console.log("Redis cache enabled for emailsender");
} else {
  console.log("Redis cache disabled for emailsender (best-effort)");
}
```

That's it — the SDK handles the NATS request, Redis connection, version logging, and error handling.

### 5.2 No config table changes

The emailsender config table does NOT get a `redis_url` key. The URL is discovered from the BE via NATS.

### 5.3 Future microservices

Any future microservice follows the same one-liner pattern after NATS connect:
```ts
await initCacheFromSharedConfig(NatsClient, console);
```

## 6. FE changes (`primebrick-fe-v3`)

### 6.1 Update `HealthPayload` type

File: `src/lib/api-types.ts` (modify)

```ts
export type HealthPayload = {
  ok: true;
  service: string;
  version: string;
  db: { ok: boolean };
  idp: { ok: boolean; type?: string; version?: string };
  redis?: { ok: boolean; version?: string };
};
```

Update `isValidHealthPayload()` to accept (but not require) the `redis` field:

```ts
export function isValidHealthPayload(x: unknown): x is HealthPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.ok !== true) return false;
  if (typeof o.service !== 'string') return false;
  if (typeof o.version !== 'string') return false;
  const db = o.db;
  if (!db || typeof db !== 'object') return false;
  if (typeof (db as { ok?: unknown }).ok !== 'boolean') return false;
  const idp = o.idp;
  if (!idp || typeof idp !== 'object') return false;
  if (typeof (idp as { ok?: unknown }).ok !== 'boolean') return false;
  // redis is optional — if present, validate shape
  if (o.redis !== undefined) {
    if (typeof o.redis !== 'object') return false;
    if (typeof (o.redis as { ok?: unknown }).ok !== 'boolean') return false;
  }
  return true;
}
```

### 6.2 Add Redis row to VersionsPanel

File: `src/lib/shell/sheets/panels/VersionsPanel.svelte` (modify)

After the IDP row (line ~128), add a Redis row:

```svelte
<div class="flex items-center justify-between gap-3 text-sm">
  <div class="text-muted-foreground">{$t('shell.health.redis')}</div>
  <div class="flex items-center gap-2">
    {#if backendState.health?.redis?.ok}
      <Badge variant="outline" class="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-medium">
        Online
      </Badge>
      <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
        {backendState.health.redis.version || 'unknown'}
      </Badge>
    {:else}
      <Badge variant="outline" class="text-red-600 dark:text-red-400 font-mono text-[11px] font-medium">
        Offline
      </Badge>
    {/if}
  </div>
</div>
```

Note: no URL badge (per user decision — URL is only in BE console log, not exposed to FE).

### 6.3 Add i18n key

Add `"redis": "Redis"` to the `shell.health` section in all 6 locale files:
- `src/lib/i18n/messages/en-GB.json`
- `src/lib/i18n/messages/it-IT.json`
- `src/lib/i18n/messages/de-DE.json`
- `src/lib/i18n/messages/es-ES.json`
- `src/lib/i18n/messages/fr-FR.json`
- `src/lib/i18n/messages/pt-PT.json`

The value "Redis" is the same across all locales (it's a product name, not translatable).

### 6.4 Update `backend-availability.svelte.ts` (optional)

The `computeHealthChip()` function currently checks `db.ok` and `idp.ok`. Redis is best-effort (the system is valid without it), so it should NOT affect the health chip state. No changes needed to `computeHealthChip()` — Redis offline does not make the backend "offline" from the FE's perspective.

If the user later wants Redis to affect the health chip, we can add a `redis_offline` chip state. For now, Redis is informational only in the VersionsPanel.

## 7. Implementation order

1. **SDK** — `getRedisInfo()`, `SharedConfig` / `subscribeSharedConfig` / `fetchSharedConfig`, `initCacheFromSharedConfig()`, exports
2. **BE** — enhanced `initCache()` with version, `getRedisHealth()`, `config.get` subscription, `redis` in health endpoint
3. **US** — `initCacheFromSharedConfig(NatsClient, console)` after NATS connect
4. **FE** — `HealthPayload` type, `isValidHealthPayload()`, VersionsPanel Redis row, i18n key

## 8. Acceptance criteria

- [ ] BE console shows `[cache] Redis connected (v<x.y.z>)` when Redis is configured and reachable
- [ ] BE console shows `[cache] redis_url not set — cache disabled` when Redis is not configured
- [ ] BE console shows `[cache] Redis connection failed — cache disabled: <error>` when Redis is unreachable
- [ ] Microservice (emailsender) console shows the same banner after NATS connect
- [ ] `GET /api/v1/health` returns `redis: { ok: true, version: "x.y.z" }` when Redis is connected
- [ ] `GET /api/v1/health` returns `redis: { ok: false }` when Redis is not configured or unreachable
- [ ] FE VersionsPanel shows a "Redis" row with version badge + "Online" badge when connected
- [ ] FE VersionsPanel shows "Redis" row with "Offline" badge when not connected
- [ ] FE VersionsPanel does NOT show the Redis URL
- [ ] `redis_url` is stored only in BE's `auth_configurations` — not in any microservice config table
- [ ] Microservice discovers `redis_url` via NATS `config.get` request/reply
- [ ] BE subscribes to `config.get` on NATS and responds with `{ redis_url }`
- [ ] If BE doesn't respond to `config.get` within 5s, microservice continues without Redis (best-effort)
- [ ] `pnpm run check` (FE typecheck) passes
- [ ] `pnpm run build` (FE build) passes
- [ ] SDK tests pass (if test infrastructure exists for the new functions)
- [ ] SDK `cache-layer.mdx` documents the microservice discovery pattern, mandatory `initCacheFromSharedConfig`, shared config protocol, health endpoint, and version logging
- [ ] Zudoku microservices architecture page mentions NATS `config.get` and links to the SDK cache-layer page
- [ ] Zudoku config-modules page cross-references the Redis shared config via NATS pattern

## 9. Impacted files

### SDK (`primebrick-v3-sdk`)
- `src/cache/redis-info.ts` (new)
- `src/config/shared-config.ts` (new)
- `src/cache/cache-bootstrap.ts` (new)
- `src/index.ts` (add exports)

### BE (`primebrick-be-v3`)
- `src/cache/cache-port-holder.ts` (modify — add version logging + `getRedisHealth()`)
- `src/index.ts` (modify — `config.get` subscription, `redis` in health payload)

### US / emailsender (`primebrick-us-v3`)
- `emailsender/src/index.ts` (modify — add `initCacheFromSharedConfig` after NATS connect)

### FE (`primebrick-fe-v3`)
- `src/lib/api-types.ts` (modify — add `redis?` to `HealthPayload`, update `isValidHealthPayload`)
- `src/lib/shell/sheets/panels/VersionsPanel.svelte` (modify — add Redis row)
- `src/lib/i18n/messages/en-GB.json` (modify — add `shell.health.redis`)
- `src/lib/i18n/messages/it-IT.json` (modify)
- `src/lib/i18n/messages/de-DE.json` (modify)
- `src/lib/i18n/messages/es-ES.json` (modify)
- `src/lib/i18n/messages/fr-FR.json` (modify)
- `src/lib/i18n/messages/pt-PT.json` (modify)

### Docs — SDK user guide (`primebrick-v3-sdk`, synced to Zudoku)
- `docs/user-guide/cache-layer.mdx` (modify — add microservice discovery, mandatory `initCacheFromSharedConfig`, shared config protocol, health endpoint, version logging sections)

### Docs — Zudoku site (`primebrick-v3-docs`, hand-written pages)
- `pages/microservices/guide/architecture.mdx` (modify — mention NATS `config.get` + link to SDK cache-layer page)
- `pages/getting-started/config-modules.mdx` (modify — cross-reference Redis shared config via NATS)

## 10. Documentation changes

### 10.1 SDK user guide — update `cache-layer.mdx` (synced to Zudoku)

File: `primebrick-v3-sdk/docs/user-guide/cache-layer.mdx` (modify)

The existing page documents the `@Cached` / `withCache` / `CachePort` layer but is missing the microservice discovery pattern, the mandatory `initCacheFromSharedConfig`, the health endpoint, and the version logging. Add these sections after the existing "Enable Redis" section:

**New section: "Redis for microservices (mandatory SDK pattern)"**

Explain that:
- `redis_url` is stored ONLY in the BE's `auth_configurations` table — never duplicated in microservice config tables.
- Microservices discover `redis_url` from the BE via the NATS `config.get` request/reply protocol.
- The SDK provides `initCacheFromSharedConfig(natsClient, logger)` as a one-liner — microservices MUST use this instead of calling `createRedisClient` directly with a hard-coded URL.
- This is **mandatory** for any microservice that uses `@Cached()` entities: without connecting to Redis, cache invalidation from the BE (or other microservices) cannot propagate, and the microservice would serve stale data from its own Redis reads.
- If a microservice does not use `@Cached()` entities, Redis is optional — but calling `initCacheFromSharedConfig` is still recommended so the startup banner is consistent.
- Show the one-liner code example.
- Show the BE side: `subscribeSharedConfig(natsClient, () => ({ redis_url: getAuthConfig().redis_url }))`.

**New section: "Shared config protocol (NATS `config.get`)"**

Explain that:
- `config.get` is a generic NATS subject for sharing configuration from the BE to microservices.
- The BE subscribes and responds with a `SharedConfig` object (`{ redis_url }` today, extensible to `s3_url`, `feature_flags`, etc. in the future).
- Microservices call `fetchSharedConfig(natsClient)` (or indirectly via `initCacheFromSharedConfig`).
- Timeout is 5 seconds — if the BE doesn't respond, the microservice continues without shared config (best-effort).
- The `SharedConfig` interface is in the SDK and is the single contract between BE and microservices for shared configuration.

**New section: "Health endpoint & version logging"**

Explain that:
- The BE's `/api/v1/health` now includes `redis: { ok: boolean; version?: string }`.
- The version is queried via `getRedisInfo(redis)` which calls Redis `INFO` and parses `redis_version`.
- The FE VersionsPanel shows a "Redis" row with the version badge + online/offline status (no URL exposed to the FE).
- Both the BE and microservices log a startup banner: `[cache] Redis connected (v<x.y.z>)` or `[cache] redis_url not set — cache disabled` or `[cache] Redis connection failed — cache disabled: <error>`.

**Update existing "Enable Redis" section**

Add a note that microservices do NOT set `redis_url` in their own config tables — they receive it from the BE via NATS. The SQL `INSERT` example applies only to the BE's `auth_configurations` table.

### 10.2 Zudoku docs — microservices page (mention + link)

File: `primebrick-v3-docs/pages/microservices/guide/architecture.mdx` (modify)

Add a short subsection in the "NATS message bus" section (or after it) mentioning that:
- Microservices discover shared configuration (currently `redis_url`) from the BE via the NATS `config.get` request/reply protocol.
- The SDK provides `initCacheFromSharedConfig(natsClient, logger)` as a one-liner — microservices call it right after NATS connect.
- This is mandatory for microservices that use `@Cached()` entities (cache invalidation requires a shared Redis connection).
- Link to the full reference: `[SDK → Redis cache layer](/sdk/guide/cache-layer)`.

Keep it brief — the microservices page only mentions the pattern and links to the SDK guide for the full API reference.

### 10.3 Zudoku docs — config-modules page (cross-reference)

File: `primebrick-v3-docs/pages/getting-started/config-modules.mdx` (modify)

In the "Caching" section, add one sentence noting that microservices discover `redis_url` from the BE via NATS `config.get` (not from their own config tables), with a link to `[SDK → Redis cache layer](/sdk/guide/cache-layer)`.

## 11. Open questions

1. **NatsClient API**: need to verify the exact `subscribe` and `request` method signatures on the SDK's `NatsClient` to ensure the `shared-config.ts` implementation matches. Will check during implementation.
2. **Redis INFO parsing**: the `redis.info()` method returns the full INFO output as a string. The `redis_version` field is in the `# Server` section. The regex `redis_version:([^\r\n]+)` should reliably extract it. Will verify with a live Redis instance during implementation.
