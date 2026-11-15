# Cache Invalidation + ETag + FE Storage Plan

## Status: DRAFT — Awaiting approval
## Date: 2025-01-XX
## Repos: SDK, BE, FE

---

## 1. Problem Statement

### 1.1 Current bugs

**Bug 1 — `LOADED_MODULES` blocks refetch for entire session**

`src/lib/i18n/use-module-translations.svelte.ts:22-26`:
```ts
const LOADED_MODULES = new Set<string>();
if (LOADED_MODULES.has(cacheKey)) return; // blocks even after TTL expiry
```
The Set is never cleaned. A simple F5 resets it (new page load), but the TTL of 5 min is
effectively useless because the Set prevents any refetch after the first load.

**Bug 2 — No ETag / conditional request support**

No endpoint (BE or FE) implements `ETag` / `If-None-Match` / `304`. The FE always
downloads the full response body, even if nothing changed.

**Bug 3 — `AuthConfigurationEntity` is not `@Cached`**

Config entries are read from DB on every request. The `be:auth_config:all` cache
(`src/modules/auth/config.ts:36`) only caches the parsed `AuthConfig` object used
by `getAuthConfig()`, not the CRUD list endpoint response.

### 1.2 Goals

1. **BE write invalidates Redis** — when a cached entity is written, Redis key is
   deleted so the next read fetches fresh data from DB.
2. **BE serves ETag** — GET endpoints for cached data return `ETag` header; if
   `If-None-Match` matches, return `304 Not Modified` (zero body).
3. **FE handles ETag transparently** — `apiFetch` sends `If-None-Match` on cached
   GETs; on `304`, returns the cached body from storage so callers don't change.
4. **FE manages storage dynamically** — when a response includes `ETag` + a
   `X-PB-Cached: true` header, the FE automatically stores the body in localStorage
   (or sessionStorage for session-scoped data). No per-call-site caching code needed.
5. **SDK provides reusable primitives** — ETag computation, cache key helpers, and
   invalidation utilities live in the SDK, shared by BE and microservices.

---

## 2. Architecture

### 2.1 End-to-end flow

```
┌────────┐         ┌────────┐         ┌───────┐
│  FE    │         │  BE    │         │ Redis │
└───┬────┘         └───┬────┘         └───┬───┘
    │                  │                  │
    │  GET /api/...    │                  │
    │  If-None-Match:  │                  │
    │    "abc123"      │                  │
    ├─────────────────►│  GET cache:key   │
    │                  │─────────────────►│
    │                  │  ◄── HIT:        │
    │                  │      {row,etag}  │
    │                  │                  │
    │                  │  etag match?     │
    │                  │  YES → 304       │
    │  304 Not Modified│                  │
    │  ETag: "abc123"  │                  │
    │◄─────────────────┤                  │
    │                  │                  │
    │  (FE uses cached │                  │
    │   body from      │                  │
    │   localStorage)  │                  │
    │                  │                  │
    │  (TTL expires,   │                  │
    │   refetch)       │                  │
    │  GET /api/...    │                  │
    │  If-None-Match:  │                  │
    │    "abc123"      │                  │
    ├─────────────────►│  GET cache:key   │
    │                  │─────────────────►│
    │                  │  ◄── MISS        │
    │                  │  SELECT FROM DB  │
    │                  │  SET cache:key   │
    │                  │    + etag        │
    │                  │                  │
    │  200 OK          │                  │
    │  ETag: "def456"  │                  │
    │  X-PB-Cached:true│                  │
    │  { ...body... }  │                  │
    │◄─────────────────┤                  │
    │                  │                  │
    │  (FE stores body │                  │
    │   + etag in      │                  │
    │   localStorage)  │                  │
    │                  │                  │
    │                  │  (admin writes)  │
    │                  │  DEL cache:key   │
    │                  ├─────────────────►│
    │                  │                  │
```

### 2.2 Layer responsibilities

| Layer | Responsibility |
|-------|---------------|
| **SDK** | ETag computation (`computeETag`), `CachedResponse<T>` type, `CacheEntry<T>` type, cache key helpers |
| **BE** | Store `{ row, etag }` in Redis on read; compare ETag on `If-None-Match`; return `304` or `200 + ETag + X-PB-Cached`; invalidate on write |
| **FE** | `apiFetch` sends `If-None-Match` from storage; on `304` returns cached body; on `200 + ETag` stores body + ETag; `LOADED_MODULES` fix |

### 2.3 Redis cache entry shape

Currently Redis stores the raw row. We change it to store a wrapper:

```ts
// SDK — new type
export interface CacheEntry<T> {
  data: T;
  etag: string;
  cached_at: number; // epoch ms — for debugging, not TTL
}
```

Redis key: unchanged (`dal:{table}:{value}`, `translations:i18n:{schema}:{lang}`, etc.)
Redis value: `CacheEntry<T>` serialized via `extJsonStringify`.

---

## 3. SDK Changes

### 3.1 New types (`src/cache/cache-entry.ts`)

```ts
/** Redis cache entry wrapper — stores data + computed ETag. */
export interface CacheEntry<T> {
  data: T;
  etag: string;
  cached_at: number;
}

/** HTTP response metadata for cached endpoints. */
export interface CacheResponseMeta {
  etag: string;
  cached: boolean; // true if data came from Redis cache
}
```

### 3.2 ETag computation (`src/cache/etag.ts`)

```ts
import { createHash } from "node:crypto";
import { extJsonStringify } from "../json/ext-json.js";
import type { CacheEntry } from "./cache-entry.js";

/**
 * Compute a strong ETag from any serializable value.
 * Uses SHA-256 (first 16 hex chars) of the ext-JSON representation.
 * Format: W/"{hash}" — weak ETag (byte-level changes don't matter,
 * only content changes).
 *
 * For entities with a `version` field, prefer `computeVersionETag`.
 */
export function computeETag(value: unknown): string {
  const json = extJsonStringify(value);
  const hash = createHash("sha256").update(json).digest("hex").slice(0, 16);
  return `"${hash}"`;
}

/**
 * Compute a cheap ETag from an entity version field.
 * Faster than hashing — use when the entity has `version: number`.
 */
export function computeVersionETag(version: number | string): string {
  return `"v${version}"`;
}

/**
 * Wrap a value + ETag into a CacheEntry for Redis storage.
 */
export function wrapCacheEntry<T>(data: T, etag?: string): CacheEntry<T> {
  return {
    data,
    etag: etag ?? computeETag(data),
    cached_at: Date.now(),
  };
}

/**
 * Check if a request ETag matches a cached ETag.
 * Handles weak ETags (W/"...") and strong ETags ("...").
 */
export function etagMatches(requestETag: string | null, cachedETag: string): boolean {
  if (!requestETag) return false;
  // Normalize: strip W/ prefix for comparison
  const normalize = (e: string) => e.replace(/^W\//, "").trim();
  return normalize(requestETag) === normalize(cachedETag);
}
```

### 3.3 Update `cached-repository.ts` — store `CacheEntry`

The `withCache` wrapper currently stores the raw row. Change it to store `CacheEntry`:

**Before** (lines 130-165):
```ts
const cached = await port.get<any>(key);
if (cached) return cached;
// ... fetch from DB ...
await port.set(key, row, ttl);
return row;
```

**After**:
```ts
const cached = await port.get<CacheEntry<any>>(key);
if (cached) return cached.data; // unwrap — callers see the raw row
// ... fetch from DB ...
const entry = wrapCacheEntry(row);
await port.set(key, entry, ttl);
return row;
```

The invalidation logic (`delByPrefix` on writes) stays unchanged.

### 3.4 New: `withCacheAndETag` — extended wrapper for ETag-aware reads

For endpoints that need to return ETag to the HTTP layer, the DAL/service needs
access to the `CacheEntry` (not just the unwrapped data). Add a new method:

```ts
// In CacheableRepository interface (additions)
export interface CacheableRepository {
  // ... existing methods ...

  /** Read-through cache that returns the CacheEntry (data + etag). */
  findByIdWithCache?(cls: any, id: any, opts?: any): Promise<CacheEntry<any> | null>;
  findByUUIDWithCache?(cls: any, uuid: string, opts?: any): Promise<CacheEntry<any> | null>;
}
```

The `withCache` wrapper adds these methods. They return the full `CacheEntry` so
the router can compare ETags and return 304.

### 3.5 Translations cache — store `CacheEntry`

Update `TranslationsCache` to store `CacheEntry<I18nDict>`:

```ts
async getI18nDict(language: string): Promise<CacheEntry<I18nDict> | null> {
  if (!this.port) return null;
  try {
    return await this.port.get<CacheEntry<I18nDict>>(i18nCacheKey(this.schema, language));
  } catch {
    return null;
  }
}

async setI18nDict(language: string, dict: I18nDict): Promise<void> {
  if (!this.port) return;
  try {
    const entry = wrapCacheEntry(dict);
    await this.port.set(i18nCacheKey(this.schema, language), entry, I18N_CACHE_TTL);
  } catch { /* best-effort */ }
}
```

### 3.6 New: `CacheMeta` header constants (`src/cache/cache-headers.ts`)

```ts
/** HTTP header names used by the Primebrick cache protocol. */
export const CACHE_HEADERS = {
  ETAG: "ETag",
  IF_NONE_MATCH: "If-None-Match",
  /** Custom header: tells the FE this response is cacheable. */
  PB_CACHED: "X-PB-Cached",
  /** Custom header: tells the FE the cache scope (local vs session). */
  PB_CACHE_SCOPE: "X-PB-Cache-Scope",
} as const;

export type CacheScope = "local" | "session";

/** Cache-Control directive for cached GET responses. */
export const CACHE_CONTROL_CACHED = "private, no-cache, must-revalidate";
```

`no-cache` + `must-revalidate` means the browser must revalidate with the server
(sending `If-None-Match`) before using a cached copy. This is the correct
directive for ETag-based caching — it prevents the browser from serving stale
responses without asking the server first.

### 3.7 Export new types from `src/index.ts`

```ts
export type { CacheEntry, CacheResponseMeta } from "./cache/cache-entry.js";
export { computeETag, computeVersionETag, wrapCacheEntry, etagMatches } from "./cache/etag.js";
export { CACHE_HEADERS, CACHE_CONTROL_CACHED } from "./cache/cache-headers.js";
export type { CacheScope } from "./cache/cache-headers.js";
```

---

## 4. BE Changes

### 4.1 ETag middleware (`src/middleware/etag-middleware.ts`)

A reusable Express middleware that:
1. After the handler runs, if `res.locals.cacheEntry` is set (a `CacheEntry<T>`),
   computes the ETag and sets headers.
2. Before the handler runs, checks `req.headers['if-none-match']` against
   `res.locals.cacheEntry.etag` (if the handler already found it).

```ts
import { Response, Request, NextFunction } from "express";
import { etagMatches, CACHE_HEADERS, CACHE_CONTROL_CACHED, type CacheEntry } from "@primebrick/sdk";

/**
 * Express middleware: compares If-None-Match against res.locals.cacheEntry.
 * If match → 304 (short-circuit). If no match → sets ETag + X-PB-Cached headers.
 *
 * The route handler must set res.locals.cacheEntry before calling next().
 * If the handler calls res.json() directly, this middleware is a no-op
 * (res.locals.cacheEntry is not set).
 */
export function etagMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const entry = res.locals.cacheEntry as CacheEntry<unknown> | undefined;
    if (!entry) { next(); return; }

    const ifNoneMatch = req.headers[CACHE_HEADERS.IF_NONE_MATCH.toLowerCase()] as string | null;
    if (ifNoneMatch && etagMatches(ifNoneMatch, entry.etag)) {
      // 304 — not modified, no body
      res.setHeader(CACHE_HEADERS.ETAG, entry.etag);
      res.setHeader(CACHE_HEADERS.PB_CACHED, "true");
      res.setHeader("Cache-Control", CACHE_CONTROL_CACHED);
      res.status(304).end();
      return;
    }

    // 200 — set ETag + cache headers, let the handler send the body
    res.setHeader(CACHE_HEADERS.ETAG, entry.etag);
    res.setHeader(CACHE_HEADERS.PB_CACHED, "true");
    res.setHeader("Cache-Control", CACHE_CONTROL_CACHED);
    next();
  };
}
```

### 4.2 Translations router — add ETag

**Files:** `src/modules/system/translations-router.ts`, `src/modules/system/translations-dal.ts`

**Changes:**

1. `translations-dal.ts` — `getI18nDict` returns `CacheEntry<I18nDict>` (not just `I18nDict`):
   ```ts
   async getI18nDict(moduleCode: string, language: string): Promise<CacheEntry<I18nDict>> {
     const cached = await cache.getI18nDict(language);
     if (cached) return cached; // CacheEntry hit
     // ... DB read ...
     const entry = wrapCacheEntry(dict);
     await cache.setI18nDict(language, dict); // stores CacheEntry internally
     return entry;
   }
   ```

2. `translations-router.ts` — GET handlers use `etagMiddleware`:
   ```ts
   router.get("/public/:language", etagMiddleware(), async (req, res, next) => {
     const entry = await dal.getI18nDict("public", req.params.language);
     res.locals.cacheEntry = entry;
     next();
   }, (req, res) => {
     // If we get here, ETag didn't match → send body
     res.json((res.locals.cacheEntry as CacheEntry<I18nDict>).data);
   });
   ```

   On `304`, the middleware short-circuits before the body handler runs.

3. **Invalidation** — already exists in `translations-dal.ts` (lines 163-198).
   No changes needed. When a translation is written, `cache.invalidate()` deletes
   the Redis key, so the next read produces a new ETag.

### 4.3 Config entries — add `@Cached` + ETag

**Files:**
- `src/modules/auth/auth_configuration_entity.ts` — add `@Cached(300_000)`
- `src/modules/auth/auth_configurations_dal.ts` — switch to `createRepository`
- `src/modules/auth/routers/config-entries.router.ts` — add ETag on GET endpoints

**Changes:**

1. `auth_configuration_entity.ts`:
   ```ts
   @Cached(300_000) // 5 min TTL — same as other entities
   @Entity("auth_configurations")
   export class AuthConfigurationEntity { ... }
   ```

2. `auth_configurations_dal.ts` — change `new Repository(pool)` to `createRepository(pool)`:
   ```ts
   this.repo = createRepository(pool);
   ```

   **Important:** `findAll` is NOT cached by `withCache` (only single-row reads are).
   So the list endpoint still reads from DB. For the list endpoint, we add a
   **manual cache** with ETag (see below).

3. **Manual list cache** — add to `auth_configurations_dal.ts`:
   ```ts
   private static readonly LIST_CACHE_KEY = "dal:auth_configurations:list";

   async findAll(): Promise<CacheEntry<AuthConfigurationEntity[]>> {
     const port = getCachePort();
     if (port) {
       const cached = await port.get<CacheEntry<AuthConfigurationEntity[]>>(LIST_CACHE_KEY);
       if (cached) return cached;
     }
     // ... existing DB read ...
     const entry = wrapCacheEntry(rows);
     if (port) await port.set(LIST_CACHE_KEY, entry, 300_000);
     return entry;
   }

   // Add invalidation to existing reloadCache():
   private async reloadCache() {
     // ... existing auth-config reload ...
     const port = getCachePort();
     if (port) await port.del(LIST_CACHE_KEY); // invalidate list cache
   }
   ```

4. `config-entries.router.ts` — GET `/list` and GET `/:uuid` use `etagMiddleware`:
   ```ts
   router.get("/list", etagMiddleware(), async (req, res, next) => {
     const entry = await dal.findAll();
     res.locals.cacheEntry = entry;
     next();
   }, (req, res) => {
     res.json({ rows: maskSecretValues((res.locals.cacheEntry as CacheEntry<any>).data) });
   });
   ```

   **Note:** `maskSecretValue` runs on the data before sending the body, but the
   ETag is computed on the raw DB rows. This is correct — the ETag identifies the
   DB state, not the masked response. If secrets change, the ETag changes.

   **Alternative:** compute ETag on the masked response. This is safer for
   correctness but means the ETag changes if the masking logic changes (rare).
   We choose to compute ETag on the raw rows for simplicity.

### 4.4 Other cached entities — `CustomerEntity`, `UserProfileEntity`, `OrganizationEntity`

These already use `@Cached` + `createRepository` + `withCache`. The `withCache`
wrapper change (storing `CacheEntry`) is backward-compatible — callers still
receive the raw row.

For ETag on their endpoints, add `etagMiddleware` to their GET handlers:

| Entity | Router file | GET endpoints to wrap |
|--------|------------|----------------------|
| Customer | `src/modules/customers/customers-router.ts` | `/list`, `/:uuid` |
| UserProfile | `src/modules/auth/routers/user-profiles-router.ts` | `/list`, `/:uuid` |
| Organization | `src/modules/auth/routers/organizations-router.ts` | `/list`, `/:uuid` |

**Note on `findAll`:** `withCache` does NOT cache `findAll`. For list endpoints,
we need a manual list cache (same pattern as config entries above) OR we accept
that list endpoints always hit the DB (no ETag benefit for lists).

**Decision:** For Phase 1, only add ETag to single-row GET endpoints (`/:uuid`)
and to endpoints that already have a manual cache (translations, config list).
List endpoints (`/list`) will be addressed in Phase 2 with a generic list-cache
utility.

### 4.5 BE `@Cached` entity write invalidation — existing gaps to fix

The `withCache` wrapper already calls `port.delByPrefix(CacheKeyBuilder.forEntity(cls))`
on writes (`cached-repository.ts:171-178`). However, the 4th exploration subagent
found **3 real gaps** where cached entities are written through paths that
bypass `withCache` invalidation.

**Gap 1 — `user-profile-repo.ts` uses bare `Repository`**

`src/modules/auth/user-profile-repo.ts:64` uses `new Repository(pool)` (not
`createRepository`). Its `update` (line 94-98) and `upsert` (line 115-125) calls
on `UserProfileEntity` do NOT invalidate `dal:user_profiles:`.

This is the JIT provisioning path — called on every authenticated request to
map the IDP `sub` to our internal UUID. When `idp_org` or `idp_username` differ
from the cached values, it calls `repo.update()` which writes to DB but does NOT
invalidate the `@Cached` entity cache.

**Fix:** Migrate `user-profile-repo.ts` to use `createRepository(pool)` instead
of `new Repository(pool)`. This is the standard DAL pattern — the same entity
should always go through the cache-aware repository. The `resolveInternalUuid`
function already uses `UserProfileEntity` for reads and writes, so the migration
is a one-line change: replace `new Repository(pool)` with `createRepository(pool)`.

**Gap 2 — Direct SQL updates to `user_profiles` (must be eliminated)**

Two service files update `user_profiles` via raw `pool.query`, bypassing both
the DAL and the cache layer:

- `src/modules/auth/services/auth-session.service.ts:372-375`:
  ```sql
  UPDATE user_profiles SET auth_method_enforcer_dismissed = true, updated_at = now(), updated_by = $1 WHERE uuid = $2
  ```
  This updates a single field (`auth_method_enforcer_dismissed`) by `uuid`.

- `src/modules/auth/services/invitation.service.ts:485-488`:
  ```sql
  UPDATE user_profiles SET onboarding_completed = true, updated_at = now(), updated_by = $1 WHERE id = $2
  ```
  This updates a single field (`onboarding_completed`) by `id`.

Both fields exist on `UserProfileEntity`:
- `auth_method_enforcer_dismissed` — `user_profile_entity.ts:119`
- `onboarding_completed` — `user_profile_entity.ts:123`

And `UserProfilesDal.updateProfile()` (`user-profiles-dal.ts:146-151`) already
exists as the standard DAL update method. It uses `repo.update()` which goes
through `withCache` and invalidates `dal:user_profiles:`.

**Fix:** Replace both raw SQL calls with `UserProfilesDal.updateProfile()`:

`auth-session.service.ts`:
```ts
// Before:
await this.pool.query(
  `UPDATE user_profiles SET auth_method_enforcer_dismissed = true, updated_at = now(), updated_by = $1 WHERE uuid = $2`,
  [actor, userUuid],
);

// After:
await this.userProfilesDal.updateProfile(userUuid, {
  auth_method_enforcer_dismissed: true,
});
```

`invitation.service.ts`:
```ts
// Before:
await this.pool.query(
  `UPDATE user_profiles SET onboarding_completed = true, updated_at = now(), updated_by = $1 WHERE id = $2`,
  ["system", invitation.user_profile_id],
);

// After: need to resolve uuid from id, or extend updateProfile to accept id
// The invitation has user_profile_id (numeric), but updateProfile takes uuid.
// Option A: add updateProfileById(id, body) to the DAL
// Option B: fetch the uuid first, then call updateProfile(uuid, body)
// Option C: extend updateProfile to accept either uuid or id
// Recommended: Option A — cleaner, avoids an extra query
```

The `updateProfile` body type must be extended to include
`auth_method_enforcer_dismissed` and `onboarding_completed`:
```ts
async updateProfile(
  uuid: string,
  body: {
    display_name?: string;
    email?: string;
    // ... existing fields ...
    auth_method_enforcer_dismissed?: boolean;  // ← add
    onboarding_completed?: boolean;            // ← add
  }
): Promise<void> {
  await this.repo.update(UserProfileEntity, { ...body, uuid }, { actor: requireActor(), audit: this.auditPort });
}
```

And add `updateProfileById(id, body)` for the invitation case:
```ts
async updateProfileById(
  id: bigint | number,
  body: { /* same as updateProfile */ }
): Promise<void> {
  await this.repo.update(UserProfileEntity, { ...body, id }, { actor: requireActor(), audit: this.auditPort });
}
```

**Gap 3 — `invalidateUserProfileCache()` is dead code — full analysis**

`src/modules/auth/user-profile-repo.ts:145-153` defines
`invalidateUserProfileCache(idpCode)` but it has **zero call sites**.

**What this function targets:** the `be:user_profiles:idp_code:{idpCode}` cache
(`user-profile-repo.ts:27-29`), which is the JIT provisioning cache used by
`resolveInternalUuid()` (`user-profile-repo.ts:49-138`).

**What this cache stores:** ONLY the uuid string — the mapping `idp_code → uuid`.
It does NOT store profile data (display_name, email, avatar, etc.).

**Who reads this cache:** `resolveInternalUuid()` at `user-profile-repo.ts:57`,
called by `BeUserResolverPort.resolveInternalUuid()` (`sdk-auth-ports.ts:86-88`),
called by `authMiddleware()` (`auth.middleware.ts:95`) on **every authenticated
request** to map the IDP `sub` claim to the internal Primebrick UUID. This is
**internal BE infrastructure** — the cached value (uuid) never reaches the FE.

**Why no replacement exists:** The `idp_code → uuid` mapping is immutable. The
`idp_code` is the IDP subject identifier (`sub` claim) — it identifies a user
and never changes. If it did change, it would be a different user. The uuid is
assigned at JIT provisioning time and never modified. So the cached value is
always correct, and the 5-min TTL is just a safety net for Redis consistency.

**What about profile data changes (avatar, name, etc.)?**

When the /profile page updates, the flow is:

1. FE calls `PATCH /api/v1/auth/me` → `AuthSessionService.updateMe()`
   (`auth-session.service.ts:379`)
2. `updateMe` calls `this.dal.updateProfile(userUuid, updateBody)`
   (`auth-session.service.ts:452`)
3. `updateProfile` calls `this.repo.update(UserProfileEntity, ...)`
   (`user-profiles-dal.ts:150`)
4. `repo` is `createRepository(pool)` → `withCache` wrapper
5. After successful DB write, `withCache` calls
   `port.delByPrefix('dal:user_profiles:')` — invalidates the entity cache

So profile data changes DO invalidate the entity cache (`dal:user_profiles:*`)
correctly via the standard DAL path. The `be:user_profiles:idp_code:*` cache
doesn't need invalidation because it only stores the immutable uuid mapping.

**Current limitation (write-only entity cache):** `getByUuid()` at
`user-profiles-dal.ts:92-103` uses `repo.find()` (DB-first), not
`repo.findByUUID()` (cache-first). So the entity cache is populated on read
but never actually served from cache. This is a pre-existing inefficiency —
the cache adds write invalidation overhead without read benefit. Phase 2
should switch `getByUuid` to use `findByUUID` for cache-first reads.

**Fix:** Delete `invalidateUserProfileCache()` — it's dead code targeting a
cache that stores immutable data. No replacement is needed.

### 4.6 `add` / `addMany` in `withCache` — analysis and decision

**Question:** Why are `add` and `addMany` under `withCache` invalidation?
Should they be?

**Empirical analysis:**

The `withCache` wrapper (`cached-repository.ts:180-197`) calls
`port.delByPrefix(CacheKeyBuilder.forEntity(cls))` after every write method.
For `add`, this deletes ALL keys like `dal:{table}:*`.

**Why `add` does NOT need invalidation:**

1. **New entities aren't in cache yet** — `add` inserts a new row. The new
   entity has never been read, so it's not in Redis. There's nothing to
   invalidate for the new entity.

2. **Existing cached entities are unchanged** — an INSERT doesn't modify any
   existing row. Cached entries for other entities (e.g., `dal:customers:{uuid-A}`)
   are still valid because row A hasn't changed.

3. **`findAll` is NOT cached** — `withCache` only caches single-row reads
   (`findById`, `findByUUID`, `find`). List queries always hit the DB. So a
   new row appearing in the list doesn't make any cached single-row entry stale.

4. **`find` is DB-first** — `find` always reads from DB first, then sets the
   cache from the result. Even if a new row matches a `find` filter, the next
   `find` call goes to DB, gets the new row, and caches it. The old cached
   entry (for a different row) is keyed by a different uuid, so it's not
   affected.

5. **`findByUUID` for the new entity will miss cache** — the new entity's uuid
   was never cached, so `findByUUID(newUuid)` will miss and fall through to DB
   (correct behavior).

**The only scenario where `add` invalidation matters:** if a DB trigger updates
other rows on INSERT. This is an edge case that shouldn't drive default behavior.

**Decision:** Remove `add` from `writeMethods` in `withCache`. Keep `addMany`
out as well (same reasoning — bulk INSERT of new rows doesn't change existing
cached rows).

**Updated `writeMethods`:**
```ts
const writeMethods = [
  "update",        // modifies existing row → invalidate
  "delete",        // soft-deletes existing row → invalidate
  "restore",       // un-deletes existing row → invalidate
  "hardDelete",    // physically removes row → invalidate
  "upsert",        // can update existing row → invalidate
  "upsertMany",    // can update existing rows → invalidate
  "updateMany",    // modifies existing rows → invalidate
  // "add" — REMOVED: new entities aren't cached, existing ones unchanged
  // "addMany" — NOT ADDED: same reasoning as add
  // "clone" — NOT ADDED: clone creates a new row (same as add)
] as const;
```

**Note on `clone`:** `clone` creates a new row by copying an existing one. It's
semantically equivalent to `add` (INSERT a new row). The source row is not
modified, so its cache entry is still valid. The new row will be cached on first
read. No invalidation needed.

### 4.7 Customer entity — out of scope

Per user decision: Customer entity and anything related to Customer DAL changes
are **out of scope** for this plan. The Customer module will be migrated to the
new DAL + SDK patterns in a separate effort.

The `withCache` change (removing `add` from writeMethods) affects the SDK
generically, but no Customer-specific DAL changes are included in this plan.

---

## 5. FE Changes

### 5.1 Fix `LOADED_MODULES` bug

**File:** `src/lib/i18n/use-module-translations.svelte.ts`

**Problem:** `LOADED_MODULES` Set prevents refetch after TTL expiry.

**Fix:** Replace the Set with a `Map<string, number>` that tracks load timestamps.
On check, verify both that the module was loaded AND that the localStorage cache
is not stale:

```ts
// Before:
const LOADED_MODULES = new Set<string>();
if (LOADED_MODULES.has(cacheKey)) return;

// After:
const LOADED_MODULES = new Map<string, number>(); // cacheKey → loaded_at epoch
const LOADED_TTL_MS = 5 * 60 * 1000; // same as I18N_TTL_MS

function isLoadedFresh(cacheKey: string): boolean {
  const loadedAt = LOADED_MODULES.get(cacheKey);
  if (!loadedAt) return false;
  if (Date.now() - loadedAt > LOADED_TTL_MS) {
    LOADED_MODULES.delete(cacheKey); // stale → allow refetch
    return false;
  }
  return true;
}

// In ensureModuleTranslations:
if (isLoadedFresh(cacheKey)) return;
// ... fetch ...
LOADED_MODULES.set(cacheKey, Date.now());
```

### 5.2 Central ETag handling in `apiFetch`

**File:** `src/lib/api.ts`

**Changes to `apiFetch` (line 148):**

1. **Before sending** — if the request is a GET and we have a cached ETag in
   storage, add `If-None-Match` header:

```ts
// Inside apiFetch, before the fetch call:
const isGet = (nextInit.method ?? "GET").toUpperCase() === "GET";
let etagForRequest: string | null = null;
let cachedBody: string | null = null;
let cacheStorageKey: string | null = null;

if (isGet && browser) {
  cacheStorageKey = `pb:etag:${input}`;
  const raw = localStorage.getItem(cacheStorageKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { etag: string; body: string; cached_at: number };
      if (Date.now() - parsed.cached_at < FE_CACHE_TTL_MS) {
        etagForRequest = parsed.etag;
        cachedBody = parsed.body;
        nextInit.headers = {
          ...nextInit.headers,
          [IF_NONE_MATCH]: etagForRequest,
        };
      }
    } catch { /* ignore corrupt cache */ }
  }
}
```

2. **After receiving** — check for `304`:

```ts
const res = await fetch(input, nextInit);

if (res.status === 304 && cachedBody && cacheStorageKey) {
  // Return a synthetic Response with the cached body
  return new Response(cachedBody, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// If 200 + ETag header → store
if (res.ok && browser) {
  const etag = res.headers.get("ETag");
  const pbCached = res.headers.get("X-PB-Cached");
  if (etag && pbCached === "true" && cacheStorageKey) {
    // Clone the response so we can read the body for caching
    const cloned = res.clone();
    cloned.text().then((body) => {
      localStorage.setItem(cacheStorageKey, JSON.stringify({
        etag, body, cached_at: Date.now(),
      }));
    }).catch(() => { /* best-effort */ });
  }
}

return res;
```

3. **Remove `cache: 'no-store'` for ETag-enabled endpoints:**

Currently `api.ts:163-165` forces `cache: 'no-store'` for all `/api/v1/entities`
requests. This prevents the browser HTTP cache from storing responses, but it
does NOT prevent our manual ETag handling (we send `If-None-Match` manually).

**Decision:** Keep `no-store` for entity endpoints. Our ETag handling is
application-level (localStorage), not browser HTTP cache level. The `no-store`
directive prevents the browser from caching the response in its HTTP cache, but
our code explicitly reads the ETag header and stores the body in localStorage.
These are independent mechanisms.

### 5.3 FE cache storage — `src/lib/cache/fe-cache-store.ts`

A thin wrapper around localStorage/sessionStorage with ETag support:

```ts
const FE_CACHE_PREFIX = "pb:etag:";
const FE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — same as i18n TTL

interface FECacheEntry {
  etag: string;
  body: string;
  cached_at: number;
}

export function getCachedETag(url: string): { etag: string; body: string } | null {
  if (!browser) return null;
  const key = `${FE_CACHE_PREFIX}${url}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FECacheEntry;
    if (Date.now() - parsed.cached_at > FE_CACHE_TTL_MS) return null;
    return { etag: parsed.etag, body: parsed.body };
  } catch {
    return null;
  }
}

export function setCachedETag(url: string, etag: string, body: string): void {
  if (!browser) return;
  const key = `${FE_CACHE_PREFIX}${url}`;
  const entry: FECacheEntry = { etag, body, cached_at: Date.now() };
  localStorage.setItem(key, JSON.stringify(entry));
}

export function clearCachedETag(url: string): void {
  if (!browser) return;
  localStorage.removeItem(`${FE_CACHE_PREFIX}${url}`);
}

export function clearAllCachedETags(): void {
  if (!browser) return;
  Object.keys(localStorage)
    .filter((k) => k.startsWith(FE_CACHE_PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}
```

### 5.4 Update `use-module-translations.svelte.ts` — use ETag

The translation loader currently has its own caching logic. After the `apiFetch`
ETag handling is in place, the translation loader can be simplified:

```ts
async function ensureModuleTranslations(moduleId: string, lang: UiLang): Promise<void> {
  const cacheKey = `${moduleId}:${lang}`;
  if (isLoadedFresh(cacheKey)) return;

  try {
    // apiFetch now handles ETag internally — if 304, it returns cached body
    const dict = await fetchModuleTranslations(moduleId, lang);
    mergeModuleDict(lang, dict);
    LOADED_MODULES.set(cacheKey, Date.now());
    // setCachedModuleDict is no longer needed — apiFetch stores in pb:etag:...
    // But keep it for backward compat during migration
  } catch (e) {
    console.error(`[i18n] Failed to load translations for ${moduleId}, lang ${lang}:`, e);
  }
}
```

**Migration path:** During Phase 1, both the old `setCachedModuleDict` and the
new `pb:etag:` cache coexist. After verification, remove the old cache in Phase 2.

---

## 6. Entities and Pages Affected

### 6.1 Phase 1 — Translations + Config Entries (immediate)

| Data | BE endpoint | FE consumer | Cache type | Current state |
|------|-------------|-------------|------------|---------------|
| Public translations | `GET /api/v1/system/translations/public/:lang` | `loadPublicTranslations` → `$dict` | Redis (6h TTL) + localStorage (5 min) | Redis cache exists, no ETag, FE LOADED_MODULES bug |
| Module translations | `GET /api/v1/system/translations/:module/:lang` | `ensureModuleTranslations` → `$dict` | Redis (6h TTL) + localStorage (5 min) | Same as above |
| Config entries list | `GET /api/v1/entities/config_entries/list` | `fetchConfigEntries` → page state | **No cache** | DB read every time, no ETag |
| Config entry single | `GET /api/v1/entities/config_entries/:uuid` | (not currently fetched by FE) | **No cache** | DB read every time |
| Module config list | `GET /ws/:code/api/v1/entities/config_entries/list` | `fetchModuleConfig` → page state | **No cache** | DB read every time |

**FE consumers of translations (ComboSelect):**

| Consumer | File | What it shows | Source |
|----------|------|--------------|--------|
| Error label key dropdown | `ValidationRulesSection.svelte:148-170` | All i18n keys (for error_label_key selection) | `$dict` → `getDictKeys` |
| Label key dropdown | `security/create/+page.svelte:248-262` | i18n keys filtered by prefix | `$dict` |
| Description key dropdown | `security/create/+page.svelte:393-455` | i18n keys filtered by prefix | `$dict` |
| Translation list page | `system/settings/translations/+page.svelte` | CRUD list of translation rows | `fetchTranslationList` (not cached) |

**FE consumers of config entries:**

| Consumer | File | What it does | Cache |
|----------|------|-------------|-------|
| Security settings page | `system/settings/security/+page.svelte:54-64` | Lists all config entries | None — page-local state |
| Module config tab | `system/settings/modules/[code]/+page.svelte:33-52` | Lists module config entries | None — page-local state |
| Group-key suggestions | `useExistingGroupKeys.svelte.ts:16-37` | Extracts group_keys from config list | None — runtime state |
| Currency favorites | `CurrencySelectPanel.svelte:53-66` | Reads `currency_favorites` config row | None — reads from parent |
| Config value select options | `ConfigValueInput.svelte:112-139` | Fetches options from `type_config.api_url` | **Bypasses apiFetch** — direct fetch |

### 6.2 Phase 2 — Other cached entities (next iteration)

| Data | BE endpoint | FE consumer | Cache type |
|------|-------------|-------------|------------|
| User profile single | `GET /api/v1/entities/user_profiles/:uuid` | User edit page | `@Cached` (5 min) |
| Organization single | `GET /api/v1/entities/organization/:uuid` | Org edit page | `@Cached` (5 min) |
| Active roles | `GET /api/v1/system/roles/active` | `useActiveRoles` → ComboSelect | None — runtime |
| Active organizations | `GET /api/v1/system/organizations/active` | Sidebar + create pages | None — runtime |
| Entity metadata | `GET /api/v1/entities/:entity/meta` | `useEntityMetadata` → list pages | `globalThis` cache, no TTL |

**Note:** Customer entity is out of scope for this plan (see §4.7). It will be
addressed when the Customer module is migrated to the new DAL + SDK patterns.

### 6.3 Phase 3 — List endpoints (future)

List endpoints (`/list`) are not cached by `withCache`. A generic list-cache
utility would be needed. This is deferred to Phase 3.

---

## 7. Implementation Plan

### Phase 1 — Translations + Config Entries + ETag foundation

**Step 1: SDK — new types and ETag utilities**
- Create `src/cache/cache-entry.ts` — `CacheEntry<T>`, `CacheResponseMeta`
- Create `src/cache/etag.ts` — `computeETag`, `computeVersionETag`, `wrapCacheEntry`, `etagMatches`
- Create `src/cache/cache-headers.ts` — `CACHE_HEADERS`, `CACHE_CONTROL_CACHED`, `CacheScope`
- Update `src/cache/cached-repository.ts` — store `CacheEntry` instead of raw row
- Update `src/translations/translations-cache.ts` — store `CacheEntry<I18nDict>`
- Update `src/index.ts` — export new types
- Add tests for ETag computation and `etagMatches`
- Run `pnpm test` + `pnpm build`

**Step 2: BE — ETag middleware + translations**
- Create `src/middleware/etag-middleware.ts` — reusable Express middleware
- Update `translations-dal.ts` — `getI18nDict` returns `CacheEntry<I18nDict>`
- Update `translations-router.ts` — add `etagMiddleware()` to GET handlers
- Run `pnpm build`

**Step 1.5: SDK + BE — Fix existing cache invalidation gaps**
- SDK: Remove `add` from `writeMethods` in `cached-repository.ts` (new entities aren't cached, existing ones unchanged — see §4.6)
- BE: Migrate `user-profile-repo.ts` to `createRepository(pool)` (Gap 1 — standard DAL pattern)
- BE: Replace raw SQL in `auth-session.service.ts:372-375` with `UserProfilesDal.updateProfile()` (Gap 2)
- BE: Replace raw SQL in `invitation.service.ts:485-488` with `UserProfilesDal.updateProfileById()` (Gap 2)
- BE: Extend `UserProfilesDal.updateProfile()` body type to include `auth_method_enforcer_dismissed` and `onboarding_completed`
- BE: Add `updateProfileById(id, body)` method to `UserProfilesDal` (for invitation case that has `id`, not `uuid`)
- BE: Delete dead code `invalidateUserProfileCache()` in `user-profile-repo.ts` (Gap 3 — confirmed no replacement logic, idp_code→uuid mapping is immutable)
- Run SDK `pnpm test` + `pnpm build`, BE `pnpm build`

**Step 3: BE — Config entries caching**
- Update `auth_configuration_entity.ts` — add `@Cached(300_000)`
- Update `auth_configurations_dal.ts` — switch to `createRepository(pool)`, add manual list cache
- Update `config-entries.router.ts` — add `etagMiddleware()` to GET handlers
- Run `pnpm build`

**Step 4: FE — Fix LOADED_MODULES + ETag in apiFetch**
- Fix `use-module-translations.svelte.ts` — replace Set with Map + TTL check
- Create `src/lib/cache/fe-cache-store.ts` — localStorage ETag store
- Update `apiFetch` in `src/lib/api.ts` — add `If-None-Match` on GET, handle `304`, store on `200 + ETag`
- Run `pnpm run check` + `pnpm test`

**Step 5: FE — Route ConfigValueInput through apiFetch**
- Update `ConfigValueInput.svelte:122-138` — replace direct `fetch()` with `apiFetch`
- Run `pnpm run check`

**Step 6: Verification**
- SDK: `pnpm test` + `pnpm build`
- BE: `pnpm build`
- FE: `pnpm run check` + `pnpm test`
- Manual: verify translations load, verify 304 in Network tab, verify config entries cache

### Phase 2 — Other cached entities (separate plan)

- Add `etagMiddleware` to UserProfile/Organization GET endpoints (Customer is out of scope — see §4.7)
- Switch `UserProfilesDal.getByUuid()` from `repo.find()` (DB-first) to
  `repo.findByUUID()` (cache-first) — currently the entity cache is write-only
  (populated on read, never served from cache). See §4.5 Gap 3 analysis.
- Add ETag to active roles, active organizations endpoints
- Add ETag to entity metadata endpoints
- Replace `globalThis` metadata cache with ETag-based localStorage cache

### Phase 3 — List endpoints (future)

- Generic list-cache utility in SDK
- ETag on `/list` endpoints for all cached entities

---

## 8. Files to Create/Modify

### SDK (`primebrick-v3-sdk`)

| File | Action | Purpose |
|------|--------|---------|
| `src/cache/cache-entry.ts` | **Create** | `CacheEntry<T>`, `CacheResponseMeta` types |
| `src/cache/etag.ts` | **Create** | `computeETag`, `computeVersionETag`, `wrapCacheEntry`, `etagMatches` |
| `src/cache/cache-headers.ts` | **Create** | `CACHE_HEADERS`, `CACHE_CONTROL_CACHED`, `CacheScope` |
| `src/cache/cached-repository.ts` | **Modify** | Store `CacheEntry` instead of raw row; remove `add` from `writeMethods` (see §4.6) |
| `src/translations/translations-cache.ts` | **Modify** | Store `CacheEntry<I18nDict>` |
| `src/index.ts` | **Modify** | Export new types |
| `src/cache/__tests__/etag.test.ts` | **Create** | Tests for ETag utilities |

### BE (`primebrick-be-v3`)

| File | Action | Purpose |
|------|--------|---------|
| `src/middleware/etag-middleware.ts` | **Create** | Reusable ETag Express middleware |
| `src/modules/system/translations-dal.ts` | **Modify** | Return `CacheEntry<I18nDict>` |
| `src/modules/system/translations-router.ts` | **Modify** | Add `etagMiddleware()` to GET handlers |
| `src/modules/auth/auth_configuration_entity.ts` | **Modify** | Add `@Cached(300_000)` |
| `src/modules/auth/auth_configurations_dal.ts` | **Modify** | Use `createRepository`, add list cache |
| `src/modules/auth/routers/config-entries.router.ts` | **Modify** | Add `etagMiddleware()` to GET handlers |
| `src/modules/auth/user-profile-repo.ts` | **Modify** | Gap 1: switch to `createRepository`; Gap 3: delete dead `invalidateUserProfileCache()` |
| `src/modules/auth/user-profiles-dal.ts` | **Modify** | Gap 2: extend `updateProfile` body type, add `updateProfileById` |
| `src/modules/auth/services/auth-session.service.ts` | **Modify** | Gap 2: replace raw SQL with `dal.updateProfile()` |
| `src/modules/auth/services/invitation.service.ts` | **Modify** | Gap 2: replace raw SQL with `dal.updateProfileById()` |

### FE (`primebrick-fe-v3`)

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/cache/fe-cache-store.ts` | **Create** | localStorage ETag store |
| `src/lib/api.ts` | **Modify** | ETag handling in `apiFetch` |
| `src/lib/i18n/use-module-translations.svelte.ts` | **Modify** | Fix `LOADED_MODULES` bug |
| `src/lib/components/config-list/ConfigValueInput.svelte` | **Modify** | Route through `apiFetch` |

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| ETag computation overhead (SHA-256 on every read) | Use `computeVersionETag` for entities with `version` field; SHA-256 is fast (<1ms for typical payloads) |
| localStorage quota (5MB limit) | ETag cache entries are small (key + etag + body); add LRU eviction if needed |
| `CacheEntry` wrapper breaks existing callers | `withCache` unwraps `CacheEntry.data` before returning to callers — backward compatible |
| 304 responses break `res.json()` in FE | `apiFetch` returns synthetic `Response` with cached body on 304 — callers see `200` |
| Redis down → no ETag | `CachePort` is null → no cache → every read hits DB → ETag computed on fresh data → no 304 |
| Multi-pod: pod A writes, pod B serves stale | `delByPrefix` on write evicts from shared Redis → all pods see the miss |
| `no-store` conflicts with ETag | `no-store` prevents browser HTTP cache; our ETag is application-level (localStorage) — independent |

---

## 10. Acceptance Criteria

1. **Translations:** After a translation is updated via BE, the next FE request
   gets `200` with a new ETag (not `304`), and the FE displays the new translation.
2. **Config entries:** After a config entry is updated, the next FE request for
   the config list gets `200` with a new ETag, and the FE shows the new value.
3. **304 response:** When the FE requests translations or config entries and
   nothing has changed, the BE returns `304` and the FE uses the cached body.
4. **LOADED_MODULES fix:** After 5 minutes, the FE refetches translations
   without requiring a hard refresh.
5. **No breaking changes:** Existing API callers (`res.json()`) work unchanged —
   the `304` → synthetic `Response` transformation is transparent.
6. **SDK tests pass:** New ETag tests + existing 234 tests pass.
7. **BE build passes:** `pnpm build` (tsc) succeeds.
8. **FE checks pass:** `pnpm run check` (0 errors) + `pnpm test` (all pass).
