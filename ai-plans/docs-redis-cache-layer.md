# Plan — Redis cache layer: documentation + website section

**Date:** 2026-07-21
**Type:** Documentation + marketing
**Status:** Draft, awaiting approval

## 1. Objectives

- Document the new Redis cache layer introduced in `feature/redis-cache` (SDK cache module + DAL Reflect metadata).
- Provide a practical, copy-pasteable usage guide for BE developers: how to enable Redis, how to mark an entity as `@Cached`, how to pick a TTL, how `@CacheKey` works, what's cached and what's not, failure behavior.
- Add a section on the `primebrick.dev` landing page promoting Primebrick as **"optimized for enterprise and high traffic"** via the optional Redis cache layer — consistent with the existing section style (`multicloud`, `postgres`, `security`, etc.).

## 2. Non-goals (this plan)

- Documenting Phase 3 (`BeRoleMappingPort` migration) — that's an internal refactor, not user-facing. Mentioned only as a one-line "under the hood" note.
- Documenting Phase 4 (`resolveInternalUuid` future migration) — not implemented yet.
- Documenting the DAL's `Reflect.defineMetadata` change — internal implementation detail, not user-facing. The SDK guide talks about `@Entity` table names being used for cache keys without explaining the Reflect mechanism.
- FE or US documentation — the cache is BE-only for now.
- Changing the API reference — the cache module is already exported; `pnpm extract-docs` will pick it up automatically on the next docs build. No hand-edits to `api-reference.mdx`.
- Translating the new website section to all 6 languages in this plan — English first; the other 5 languages (IT, DE, ES, PT, FR) will be added in the same PR but as direct translations of the English copy. The plan specifies the English source strings only.

## 3. Architecture overview

```
+-------------------+        +-------------------+
|  SDK docs         |        |  Website          |
|  docs/user-guide/ |        |  src/pages/       |
|  cache-layer.mdx  |        |  [lang]/index.astro
|  (NEW)            |        |  + i18n section   |
+---------+---------+        +---------+---------+
          |                            |
          | synced via                 | imports
          | sync-repo-docs.mjs         | translations.ts
          v                            v
+-------------------+        +-------------------+
|  docs.primebrick  |        |  primebrick.dev   |
|  .dev (Zudoku)    |        |  (Astro + CF)     |
+-------------------+        +-------------------+
```

### Repositories impacted

| Repo | Changes | Why |
|---|---|---|
| `primebrick-v3-sdk` | New `docs/user-guide/cache-layer.mdx`; update `docs/user-guide/_order.json`; update `docs/user-guide/overview.mdx` (one bullet); update `docs/user-guide/getting-started.mdx` (one paragraph in prerequisites). | The SDK owns the cache module — its user guide is the canonical docs source. The docs site syncs from here. |
| `primebrick-v3-website` | New `enterprise` section block in `src/i18n/translations.ts` (EN + 5 translations); render the new section in `src/pages/[lang]/index.astro`. | The landing page is the marketing surface. |
| `primebrick-v3-docs` | **NO CHANGES** — the Zudoku site syncs MDX from the SDK repo via `sync-repo-docs.mjs` in CI. | Sync is automatic. |
| `primebrick-dal-v3` | **NO CHANGES** — the DAL's Reflect metadata change is an internal implementation detail. | Not user-facing. |
| `primebrick-be-v3` | **NO CHANGES in this plan** — BE usage is documented from the SDK side. The BE's `initCache()` wiring is shown in the SDK guide as a code example. | The SDK guide is the canonical source. |

## 4. Phase 1 — SDK documentation (primebrick-v3-sdk)

### 4.1 New file: docs/user-guide/cache-layer.mdx

A new MDX file in the SDK's user guide, following the editorial conventions of the existing files (frontmatter, code blocks, no Mermaid ` ```mermaid ` blocks — use `<Mermaid chart={...} />` if needed).

**Outline:**

```mdx
---
title: Redis cache layer
description: Optional best-effort Redis cache for single-row reads. Zero DAL coupling, zero downtime when Redis is unavailable.
---

# Redis cache layer

Primebrick provides an **optional** Redis cache layer for hot single-row reads.
It is a feature, not a requirement — the system is fully valid without it. If
Redis is not configured or unreachable, the system runs exactly as today
(DB-only), with `warn` logs (never `error`).

## What gets cached

- **Only single-row finders**: `findById`, `findByUUID`, `find`.
- **Only entities marked `@Cached()`**. Other entities pass through untouched.
- **`findAll` and `findByPage` are NOT cached** — high-cardinality keys, memory
  bomb risk on large tables, stale-on-write window dangerous for list views.
  Cache dropdown/autocomplete lists at the BE application level with hand-written
  `be:dropdowns:*` keys via the same `CachePort`.

## What does NOT get cached (and why)

| Operation | Cached? | Reason |
|---|---|---|
| `findById` | ✅ | Single row, stable key from result row |
| `findByUUID` | ✅ | Single row, input IS the cache key |
| `find` | ✅ | Returns 1 row by construction (limit: 1) |
| `findAll` | ❌ | List — high cardinality, stale risk |
| `findByPage` | ❌ | Paginated list — same as above |
| Writes (`add`, `update`, …) | ❌ (invalidate) | Writes go DB-first, then invalidate |

## Enable Redis

`redis_url` is a new optional key in the `auth_configurations` table. Empty or
missing = cache disabled. Set it to your Redis URL:

```sql
INSERT INTO "public"."auth_configurations" ("key", "value", "description", "created_by")
VALUES ('redis_url', 'redis://localhost:6379', 'Redis cache URL', 'system')
ON CONFLICT ("key") DO NOTHING;
```

The BE reads `redis_url` at startup via `loadAuthConfig`. If Redis is unreachable,
the BE logs a `warn` and continues without cache — no fail-fast, no crash.

## Mark an entity as cacheable

Import `@Cached` and `@CacheKey` from `@primebrick/sdk` and decorate your entity:

```ts
import { Cached, CacheKey } from "@primebrick/sdk";
import { Entity, Key, Column } from "@primebrick/dal-pg";

@Entity("customers")
@Cached(300_000)  // 5 minutes TTL — for mutable data
export class CustomerEntity {
  @Key() id!: bigint;
  uuid!: string;  // CacheKeyBuilder falls back to row.uuid
  @Column({ pgType: "varchar" }) name!: string;
}
```

### Choosing a TTL

- **`@Cached()` with no argument** = **no TTL, immutable data only**. Use this
  ONLY for genuinely immutable data (the cached value can never change). There
  is NO implicit default — omitting the TTL is a deliberate statement that the
  data is immutable.
- **`@Cached(300_000)`** = 5 minutes. Recommended starting point for mutable
  data. The TTL bounds the staleness window if Redis is intermittently
  unavailable during invalidation.
- The TTL is a **correctness parameter**, not just a performance one. Pick a
  TTL that bounds how stale a read can be in the worst case (Redis down during
  a write invalidation).

### Choosing the cache key

`CacheKeyBuilder` derives the key from the **result row**, never from the input
argument. Resolution order:

1. The property marked `@CacheKey()` → `dal:{table}:{row[propertyKey]}`
2. Else `row.uuid` (JS property convention) → `dal:{table}:{row.uuid}`
3. Else the `@Key()` column (read via Reflect) → `dal:{table}:{row[keyPropertyKey]}`
4. Else throw — add `@CacheKey()` to the property to use as the cache key.

**Why result-row-derived keys?** `findById(42)` and `findByUUID(<uuid>)` on the
same row produce the SAME cache key. This avoids duplicate entries and ensures
invalidation works correctly.

**When to use `@CacheKey()` explicitly:**

```ts
@Entity("idp_code_map")
@Cached()  // No TTL — immutable mapping
export class IdpCodeMapEntity {
  @CacheKey() idp_code!: string;  // Use idp_code as the cache key
  uuid!: string;
}
```

Use `@CacheKey()` when:
- The entity has no `uuid` property.
- You want the cache key to match the FE-facing identifier (usually `uuid` —
  but `@CacheKey` makes it explicit).
- The entity has multiple unique columns and you want a predictable key.

## Wire the cache into your Repository

The `withCache` wrapper is opt-in. Call it once at bootstrap:

```ts
import { withCache, RedisCachePort, createRedisClient } from "@primebrick/sdk";
import { Repository } from "@primebrick/dal-pg";

// In your BE startup (after loadAuthConfig):
if (authConfig.redis_url) {
  const redis = await createRedisClient(authConfig.redis_url);
  const cachePort = new RedisCachePort(redis);
  // Wrap each Repository instance once at creation:
  const repo = withCache(new Repository(pool), cachePort, logger);
  // Use `repo` as normal — cache is transparent.
}
```

If `redis_url` is empty or Redis is unreachable, skip `withCache` — the bare
`Repository` works exactly as before.

## Failure behavior (best-effort)

The `withCache` wrapper NEVER lets a cache failure break a request:

| Failure | Behavior |
|---|---|
| Redis down on read | `warn` log, fall through to DB, return the row |
| Redis down on write | DB write succeeds first, invalidation fails with `warn` |
| Redis down on hydrate | Read returns the DB row; `set` failure is fire-and-forget |
| `CacheKeyBuilder` throws | `warn` log, fall through to DB |

**The caller never sees a cache error.** All failures are `warn` logs, never
`error`. The cache is a feature, not a requirement.

## Serialization

Cache values are serialized with the SDK's canonical `extJsonStringify` /
`extJsonParse` (json-bigint, `useNativeBigInt: true`) — the same serializer
used for HTTP responses and NATS messages. `bigint` PKs and `Date` fields
round-trip correctly. No custom `$bigint:` hack.

## Cache keys

Keys are namespaced as `dal:{tableName}:{identifier}`:

| Entity | Key example |
|---|---|
| `CustomerEntity` (`@Entity("customers")`) | `dal:customers:abc-123-uuid` |
| `IdpCodeMapEntity` (`@Entity("idp_code_map")`, `@CacheKey() idp_code`) | `dal:idp_code_map:ACME` |
| Entity without `@Entity` (no DAL) | `dal:MyClass:abc-123` (falls back to class name) |

The table name is read from the DAL's `@Entity` decorator via standard JS
reflection (`Reflect.getMetadata`). The SDK has **zero dependency on the DAL**
— no `import`, no package dependency. The DAL is completely untouched by the
cache layer.

## Multi-instance BE (pods behind a load balancer)

Redis is the single shared cache. When pod #1 invalidates a key, pod #2's next
read sees the miss in Redis and re-hydrates from PostgreSQL. There is no
cross-pod stale-cache problem. No NATS invalidation broadcaster is needed.

An L1 in-process cache in front of Redis is **deferred** — it would require a
NATS broadcaster to stay consistent across pods, and Redis latency is not
measurably painful at <5 pods. If L1 becomes needed, it will be a separate
plan.

## Under the hood (for contributors)

- The cache module lives entirely in `@primebrick/sdk` (`src/cache/`). The DAL
  is NOT involved — it has zero cache knowledge.
- The SDK reads entity metadata (table name, key column) via
  `Reflect.getMetadata("primebrick:tableName", ctor)` — the DAL's `@Entity`
  and `@Key` decorators write this metadata via `Reflect.defineMetadata`. No
  package dependency between the SDK and the DAL.
- `@Cached` and `@CacheKey` use the SDK's own WeakMap — separate from the DAL's
  `ClassEntityMeta`. Two metadata systems coexist without interacting.
- `withCache` uses a structural `CacheableRepository` interface — TypeScript
  structural typing means a DAL `Repository` is assignable without any
  `import type` from the DAL.
```

### 4.2 Update docs/user-guide/_order.json

Add `cache-layer` after `ext-json` (it's an infrastructure feature, same category):

```json
{
  "pages": [
    "overview",
    "getting-started",
    "authentication",
    "ext-json",
    "cache-layer",
    "nats-client",
    "service-registration",
    "http-server",
    "api-reference"
  ]
}
```

### 4.3 Update docs/user-guide/overview.mdx

Add one bullet to the design principles / module list mentioning the cache layer:

```mdx
- **Optional Redis cache** - best-effort cache for hot single-row reads. The
  system is fully valid without it; if Redis is unavailable, reads fall through
  to the database with `warn` logs. See [Cache layer](./cache-layer) for usage.
```

### 4.4 Update docs/user-guide/getting-started.mdx

Add a short paragraph in the prerequisites section:

```mdx
### Redis (optional)

Redis is NOT required to run Primebrick. If you want to enable the optional
cache layer for hot single-row reads, install Redis and set the `redis_url`
key in the `auth_configurations` table. See [Cache layer](./cache-layer) for
details. Without `redis_url`, the system runs DB-only with no cache.
```

## 5. Phase 2 — Website landing page section (primebrick-v3-website)

### 5.1 New section block in src/i18n/translations.ts

Add a new `enterprise` section to the English translation, placed after the
`postgres` section (it's a data/perf feature, natural neighbor). Follow the
existing block style: `badge`, `title`, `text`, `cards`.

**English source strings:**

```ts
enterprise: {
  badge: 'Enterprise-Ready',
  title: 'Optimized for enterprise and high traffic.',
  text: 'Primebrick scales from a single-container laptop setup to
    enterprise datacenters behind a load balancer. An optional Redis cache
    layer reduces PostgreSQL load on hot single-row reads — and because it is
    best-effort, the system is fully valid without it. No Redis? No problem:
    reads fall through to the database with a warn log, never an error.',
  cards: [
    {
      title: 'Optional Redis cache',
      text: 'Mark any entity with @Cached(ttl) and hot single-row reads go to
        Redis first. Omit the TTL for immutable data; pick a TTL that bounds
        staleness for mutable data. Zero DAL coupling — the cache lives
        entirely in the SDK.',
    },
    {
      title: 'Best-effort by design',
      text: 'Redis down? Writes still go to PostgreSQL first, then invalidate
        in a try/catch. Reads fall through to the DB. The caller never sees a
        cache error. Cache is a feature, not a requirement.',
    },
    {
      title: 'Multi-instance ready',
      text: 'Redis is the shared cache. Pod #1 invalidates a key, pod #2 sees
        the miss and re-hydrates from PostgreSQL. No NATS broadcaster needed.
        Scale the BE horizontally behind any LB — Docker, K8s, Swarm, Azure
        Container Apps, Cloud Run.',
    },
    {
      title: 'Zero vendor lock-in on cache too',
      text: 'Redis is the only cache implementation shipped today, but the
        CachePort interface is open. Implement your own cache port for
        Memcached, DragonflyDB, or any KV store — no SDK changes needed.',
    },
  ],
},
```

**Translations to IT, DE, ES, PT, FR:** direct translations of the English
copy, preserving the same structure (`badge`, `title`, `text`, `cards` array
with `title`/`text` per card). Same placement (after `postgres`) in each
language block.

### 5.2 Render the new section in src/pages/[lang]/index.astro

Add a new section block in the landing page, placed after the `postgres`
section. Follow the existing card-grid pattern used by `ai`, `agentic`,
`security`, etc.

**Sketch (matches existing section style):**

```astro
{/* ─── Enterprise: optimized for high traffic ─── */}
<section class="mx-auto max-w-7xl px-6 py-20">
  <div class="mx-auto max-w-3xl text-center">
    <span class="inline-block rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-400">
      {t.enterprise.badge}
    </span>
    <h2 class="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
      {t.enterprise.title}
    </h2>
    <p class="mt-4 text-lg text-slate-400">{t.enterprise.text}</p>
  </div>
  <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
    {t.enterprise.cards.map((card) => (
      <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-sky-500/50">
        <h3 class="text-base font-semibold text-white">{card.title}</h3>
        <p class="mt-2 text-sm text-slate-400">{card.text}</p>
      </div>
    ))}
  </div>
</section>
```

The exact placement and class names will be matched to the existing sections
during implementation (I will read the surrounding sections in the file before
editing to copy the exact pattern — the sketch above is representative).

### 5.3 No new Svelte components

The `enterprise` section is static content (no interactivity). Per the Astro
conventions rule, static content uses `.astro` — no Svelte component needed.

## 6. Cross-repo impact

- **primebrick-v3-sdk**: 1 new MDX file (`docs/user-guide/cache-layer.mdx`),
  3 edited MDX files (`_order.json`, `overview.mdx`, `getting-started.mdx`).
  No code changes. No new dependencies. Version bump (minor — new docs).
- **primebrick-v3-website**: 1 edited TS file
  (`src/i18n/translations.ts` — new `enterprise` block in 6 languages), 1
  edited Astro file (`src/pages/[lang]/index.astro` — render the new section).
  No new components. No new dependencies. Version bump (minor — new landing
  section).
- **primebrick-v3-docs**: NO CHANGES — syncs from the SDK repo in CI.
- **primebrick-dal-v3**: NO CHANGES.
- **primebrick-be-v3**: NO CHANGES.

## 7. Acceptance criteria

- **SDK docs**: `docs/user-guide/cache-layer.mdx` exists with the full outline
  in §4.1; `_order.json` includes `cache-layer` after `ext-json`;
  `overview.mdx` has the new bullet; `getting-started.mdx` has the Redis
  prerequisites paragraph. `pnpm extract-docs` runs without errors (the cache
  module exports are picked up by TypeDoc).
- **Website**: `src/i18n/translations.ts` has the `enterprise` block in all 6
  languages (EN, IT, DE, ES, PT, FR). `src/pages/[lang]/index.astro` renders
  the new section after the `postgres` section. `pnpm run build` exits 0. The
  built site shows the new section on `/en/` (and all other language paths).
  The section is responsive (1 column on mobile, 2 on `sm`, 4 on `lg`).
- **No broken links**: all internal MDX links (`./cache-layer`, etc.) resolve.
  The landing page section has no external links (it's marketing copy).
- **No Mermaid ` ```mermaid ` blocks** in the MDX (per the docs-user-guide
  rule — use `<Mermaid chart={...} />` if needed; this guide doesn't need
  Mermaid).

## 8. Risk assessment

| Risk | Mitigation |
|---|---|
| MDX build fails on the new file | Follow the exact frontmatter + body pattern of `ext-json.mdx`. Run `pnpm run build` in the SDK before committing. |
| Zudoku sync doesn't pick up the new file | The sync script copies `docs/user-guide/*.mdx` — the new file matches the glob. Verify by running `node scripts/sync-repo-docs.mjs` locally if needed (docs repo). |
| Landing page layout breaks on mobile | Use the existing responsive grid classes (`sm:grid-cols-2 lg:grid-cols-4`) — same as the `ai` and `security` sections. Test with `pnpm run build` + `pnpm run preview`. |
| Translation strings are too long for the card layout | Keep card `text` under ~300 chars (same as existing cards). The English source is already in that range. |
| 6-language translation quality | The translations are direct, technical, and short. No idioms. If a translation is uncertain, fall back to the English string (better than a wrong translation). |

## 9. Open questions for the user

1. **Section placement on the landing page**: I propose placing the
   `enterprise` section **after the `postgres` section** (both are
   data/perf features). Alternative: place it **after the `security` section**
   (both are "enterprise" themes). Which do you prefer?
2. **Section name in translations**: I used `enterprise` as the i18n key.
   Alternative: `performance` or `scale`. The key is internal-only (not
   user-visible) but affects future maintenance. Preference?
3. **Tone of the marketing copy**: I went with "Optimized for enterprise and
   high traffic" as the headline (your words). The body emphasizes
   "best-effort, system valid without Redis" — this is honest and
   differentiating (most cache docs pretend the cache is mandatory). Keep this
   tone, or go more aggressive ("Blazing fast with Redis")?
