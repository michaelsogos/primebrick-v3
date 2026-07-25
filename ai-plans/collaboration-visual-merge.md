# Visual Collaboration & Dynamic Merge — Architecture Plan

> Status: DRAFT — awaiting user approval (keyword: `PROCEED`)
> Scope: cross-repo feature spanning `primebrick-dal-v3`, `primebrick-v3-sdk`, `primebrick-be-v3`, `primebrick-fe-v3`, `primebrick-v3-docs`.
> Mode: PLAN. No source code modified during planning. All claims empirically verified.
>
> **Revision 2026-07-22 (post-verification):** Empirically verified that SSE infrastructure already exists and is reusable — SDK `src/sse/` (`createSseWriter`/`createSseEventBus`/`bridgeNatsToSse`, exported `src/index.ts:114-125`, documented `docs/user-guide/sse-standard.mdx`); BE consumes it for service lifecycle (`src/modules/system/services-events-route.ts`); FE has `@microsoft/fetch-event-source@2.0.1` installed (`package.json:74`) plus reusable `createSseConnection` (`src/lib/sse/create-sse-connection.ts`). The plan now **reuses** these primitives instead of reinventing them. DAL optimistic lock and presence/collaboration modules remain to be built (verified absent). See facts F14-F17 and decisions D6/D6b.

---

## 0. Empirically verified facts (zero assumptions)

| # | Fact | Evidence |
|---|------|----------|
| F1 | Audit trail already exists: `@AuditTrail()` decorator sets `isAuditable` in `ClassEntityMeta`; `{table}_audit` partitioned tables; `AuditLogEntity`; `calculateDelta`; `version` auto-incremented on every write. | `primebrick-dal-v3/src/meta/entity-decorators.ts:103,345`; `primebrick-dal-v3/src/audit/audit-log-entity.ts`; `primebrick-dal-v3/src/audit/delta-calculator.ts:1-48`; `primebrick-dal-v3/src/repository/repository.ts:511,605,733,841,1282,1425,1482`; `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql:66-101` |
| F2 | Redis already integrated via SDK (`RedisCachePort`, best-effort); NATS already used for service lifecycle. | `primebrick-v3-sdk/src/index.ts:73-99`; `primebrick-be-v3/src/cache/cache-port-holder.ts`; `primebrick-be-v3/src/modules/proxy/service-lifecycle-subscriber.ts`; `primebrick-be-v3/infra/docker-compose.postgres.yml:118-147` |
| F3 | No presence / collaboration code exists today. SSE infrastructure, however, ALREADY EXISTS and is reusable (see F14-F17). | grep across BE+FE: 0 matches for `presence`, `collaboration`, `optimistic`. SSE matches exist only for service lifecycle (see F14-F17). |
| F4 | `@microsoft/fetch-event-source@2.0.1` IS installed in FE, and a reusable `createSseConnection` utility already exists. | `primebrick-fe-v3/package.json:74` → `"@microsoft/fetch-event-source": "2.0.1"`; `primebrick-fe-v3/src/lib/sse/create-sse-connection.ts:1-163` → `createSseConnection(opts)` with backoff, visibility-aware, `credentials:'include'`, `parseSseData<T>`. |
| F5 | Optimistic lock does NOT exist in DAL. `version` is auto-incremented but never used as a guard. | grep `optimistic|OptimisticLock|concurrency|expected_version|expectedVersion` on `primebrick-dal-v3/src` → only `scripts/version-sync.mjs` (unrelated). `repository.ts:639`: `UPDATE ... WHERE matchCol = $match RETURNING *` — no `version` in WHERE. |
| F6 | PG accepts custom `ERRCODE = 'ERR01'` (class `ER`, outside SQL-standard classes `00-99`) and propagates `DETAIL`. | `docker exec primebrick-postgres-18 psql -f /tmp/test_errcode.sql` → `ERROR: Optimistic Concurrency Violation / DETAIL: ... / CONTEXT: PL/pgSQL function inline_code_block`. |
| F7 | node-postgres exposes the custom SQLSTATE on `err.code`, plus `err.message`, `err.detail`, `err.constructor.name === 'DatabaseError'`. | `node --input-type=module` test with `pg` from BE → `code="ERR01"`, `message="Optimistic Concurrency Violation"`, `detail="version mismatch"`, `ctor=DatabaseError`. |
| F8 | DAL error infrastructure: `DalError` abstract class with `code: string`; existing `NotFoundError` (`NOT_FOUND`), `MultipleRowsError`, `UnknownColumnError`, `ValidationError`. | `primebrick-dal-v3/src/errors/errors.ts:1-48` |
| F9 | BE error mapping: `ApiError` with `internal_code`; `isDatabaseUnavailableError` already inspects `err.code` (e.g. `57P01`). | `primebrick-be-v3/src/http/api-errors.ts:230-265` |
| F10 | FE: Svelte 5.56.4 + SvelteKit 2.69.2 + Vite 8.1.5; SuperForms 2.30.2 with `tainted`/`isTainted`; shadcn-svelte; `Sheet` (right panel) + `Avatar` primitives exist; `FormPageLayout` has `headerExtras` snippet; `sheet-manager` global; `useEntityMetadata` composable; `userProfileStore` with `avatar_color`/`avatar_initials`. | `primebrick-fe-v3/package.json`; `primebrick-fe-v3/src/lib/components/FormPageLayout.svelte:11,49-60`; `primebrick-fe-v3/src/lib/composables/useFormGuard.svelte.ts:18-28`; `primebrick-fe-v3/src/lib/shell/sheets/sheet-manager.svelte.ts`; `primebrick-fe-v3/src/lib/user-profile-store.svelte.ts:3-34` |
| F11 | BE auth: `req.user` (AuthUser: id/email/name/roles/permissions/isAdmin) + AsyncLocalStorage (`requireActor()`). FE auth: cookie-based (`credentials: 'include'`). | `primebrick-be-v3/src/modules/auth/auth.middleware.ts:82-143`; `primebrick-be-v3/src/modules/auth/express-augmentation.ts:1-21`; `primebrick-fe-v3/src/lib/api.ts:159` |
| F12 | Meta-driven DRY pattern: BE exports `*.meta.ts` via `GET /api/v1/entities/:entity/meta`; FE consumes via `useEntityMetadata`. `isAuditable` is the existing declarative capability flag. | `primebrick-be-v3/src/modules/customers/customers.meta.ts`; `primebrick-fe-v3/src/lib/composables/useEntityMetadata.svelte.ts`; `primebrick-dal-v3/src/meta/entity-decorators.ts:103` |
| F13 | DAL write method signatures: `update(entity, updates, options)`, `upsert(entity, record, options)`, `delete(entity, match, options)`, `restore(entity, match, options)`, `hardDelete(entity, match, options)` — each with 3 overloads (auditable / deletable / generic). `extractMatchValue` already extracts the match key from the payload and removes it from SET. | `primebrick-dal-v3/src/repository/repository.ts:91-105,400-411,560-575,681-692,791-802,899-910` |
| F14 | SDK has a complete BE-side SSE module at `src/sse/`, exported from `src/index.ts:114-125`. SDK version `0.3.0`. | `primebrick-v3-sdk/src/sse/types.ts:21-67` (`SseEvent`/`SseWriter`/`SseEventBus`/`SseEventBusSubscription`); `src/sse/sse-writer.ts:23-86` (`SSE_HEADERS`, `createSseWriter(res)`); `src/sse/sse-event-bus.ts:28-56` (`createSseEventBus()`); `src/sse/nats-sse-bridge.ts:25-74` (`NatsSseBridgeMapping`, `bridgeNatsToSse(nats,bus,mappings)`); `docs/user-guide/sse-standard.mdx` (301 lines, full standard). |
| F15 | BE already consumes the SDK SSE primitives for service lifecycle events — this is the canonical template for a collaboration SSE endpoint. | `primebrick-be-v3/src/modules/system/services-events-route.ts:1-75` (`createSseWriter` + snapshot + `serviceEventsBus.subscribe` + 15s keep-alive + `req.on("close")` cleanup); `src/modules/proxy/service-events-bus.ts:13-15` (singleton bus); `src/modules/proxy/service-lifecycle-subscriber.ts:263-275` (`emitServiceEvent`); `src/modules/system/system-router.ts:20` (mount); `src/index.ts:311-318` (graceful shutdown). |
| F16 | FE already has a reusable SSE client utility used for service events — `usePresenceChannel` should wrap it, not reinvent it. | `primebrick-fe-v3/src/lib/sse/create-sse-connection.ts:1-163` (`createSseConnection`, `SseConnectionOptions`, `parseSseData`); `src/lib/services-store.svelte.ts:32-62` (consumer for `/api/v1/system/services/events`); `src/lib/components/AppShell.svelte:26` (`startServicesStream`). |
| F17 | SSE standard mandates: URL `GET /api/v1/<module>/<resource>/events`, snapshot-on-connect, 15s keep-alive comment, 5-min server timeout, NATS as fanout (NOT Redis pubsub), FE via `@microsoft/fetch-event-source`, microservices do NOT expose SSE. | `primebrick-v3-sdk/docs/user-guide/sse-standard.mdx`. Collaboration SSE endpoints MUST follow this standard. |

---

## 1. Architectural decisions (with rationale)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Presence state in **Redis** (volatile, TTL); event fan-out via **NATS**; SSE per-instance. | F2. Multi-instance BE behind LB → SSE is per-instance, fan-out needed. NATS already used; not Redis Pub/Sub. |
| D2 | Single declarative switch: `isAuditable` (from `@AuditTrail()`). No new decorator. | F1, F12. Reuse existing flag → zero per-entity code. |
| D3 | `ENTITY CHANGED` published **server-side** in the generic save path (audit-port-adapter hook), guarded by `isAuditable`. | DRY: any save (even non-FE API) publishes the event. Impossible to forget. |
| D4 | Optimistic lock is **intrinsic** to the DAL for auditable entities on every single-entity write except `add`. Guard is **SQL-side** (`RAISE EXCEPTION ... USING ERRCODE = 'ERR01'`); TS only does the pre-check for missing `version`. | F5, F6, F7. User requirement: exception must come from PG, `err.code === 'ERR01'` interceptable at any layer. |
| D5 | No new DB table for presence. Presence is volatile (Redis). Audit trail already exists. "Changed" marker = Redis key TTL 5 min. | F1. |
| D6 | FE SSE client reuses the existing `createSseConnection` (`src/lib/sse/create-sse-connection.ts`) backed by `@microsoft/fetch-event-source@2.0.1` (already installed). NOT native `EventSource`. | F4, F16. No new FE dependency, no new SSE client code. `usePresenceChannel` wraps `createSseConnection`. |
| D6b | BE SSE endpoints reuse the SDK primitives `createSseWriter` + `createSseEventBus` + `bridgeNatsToSse`. No custom SSE writer. | F14, F15, F17. Follows the existing `services-events-route.ts` template and the SDK SSE standard. |
| D7 | FE merge = optimistic UX; BE `version` guard = correctness guarantee. The 409 from `ERR01` is the real barrier. | D4. UX merge is best-effort; the SQL guard is authoritative. |
| D8 | Presence avatars auto-injected in `FormPageLayout.headerExtras` when `meta.collaboration.enabled` is true. | F10, F12. Zero per-page code. |
| D9 | Stale banner is FE `$state`, set on `entity-changed`, never reset by SSE; resets only on reload/remount. | User requirement: banner persists until next reload/remount, which triggers fresh DB load + `GET /presence`. |
| D10 | Multi-tab same user: dedup by `userUuid` in Redis; `tabCount` tracked via per-tab `sessionId` set; badge shown only to self. Optimistic lock (D4) makes same-user multi-tab saves safe (second save → 409 `ERR01`). | User requirement. |
| D11 | `EDITING` signal sends field + full value (post blur/onchange) to all readers via SSE, per user's explicit schema. Optional per-field `collaboration.expose_editing_value` flag in meta (default `true`) for PII-sensitive fields. | User schema. Flag is opt-out for sensitive fields. |
| D12 | Error codes centralized in DAL (`error-codes.ts`), mapped in BE (`api-errors.ts` → `ApiError` 409), documented in zudoku (`pages/dal/guide/error-codes.mdx`). | F8, F9. Stable codes for client-side `err.code === 'ERR01'` branching. |

---

## 2. Signal & payload model

### 2.1 POST signals (FE → BE) — `POST /api/v1/entities/:entity/:uuid/presence`

```jsonc
// 1. READING — page opened
{ "action": "READING", "loaded_version": 12 }

// 2. EDITING — field modified, full value, post blur/onchange
{ "action": "EDITING", "field": "telefono", "value": "+39 333000" }

// 3. LEAVE — exit without saving (purge presence cache for this user)
{ "action": "LEAVE" }

// 4. HEARTBEAT — keep TTL alive (20s)
{ "action": "HEARTBEAT", "loaded_version": 12 }
```

The **save** is NOT a presence POST. It is the standard `PUT /api/v1/entities/:entity/:uuid` with `version` in the body. The BE save path, being on an auditable entity, **auto-publishes** `ENTITY CHANGED` (writes audit, increments `version`, sets Redis "changed" marker TTL 5 min, fan-out via NATS → SSE). Zero per-entity code.

Exit after save: normal `LEAVE`; the "changed" marker remains 5 min then auto-expires (Redis TTL).

### 2.2 SSE events (BE → FE) — `GET /api/v1/entities/:entity/:uuid/presence/events`

> URL follows the SDK SSE standard convention `GET /api/v1/<module>/<resource>/events` (F17). The FE connects via the existing `createSseConnection` (`src/lib/sse/create-sse-connection.ts`).

```http
event: presence-update
data: { "readers": [...], "editors": [...] }

event: entity-changed
data: { "version": 13, "audit_log_id": 789, "changed_by": "usr_A", "changed_at": 1789... }

event: heartbeat-ack
data: { "server_time": 1789... }
```

### 2.3 NATS subjects (cross-instance fan-out)

- `presence.{entityType}.{entityUuid}` — presence deltas (READING/EDITING/LEAVE/expire).
- `entity.{entityType}.{entityUuid}.changed` — save event (ENTITY CHANGED).

Each BE instance subscribes to subjects for entities where it has local SSE clients (subscribe-on-first-client, unsubscribe-on-last-client-close). No instance receives events for entities without local subscribers.

### 2.4 Shared types — `primebrick-v3-sdk/src/presence/types.ts` (new)

```ts
export type PresenceAction = "READING" | "EDITING" | "LEAVE" | "HEARTBEAT";
export type PresenceStatus = "READING" | "EDITING";

export interface PresenceSignal {
  action: PresenceAction;
  field?: string;          // EDITING only
  value?: unknown;         // EDITING only (full value)
  loaded_version?: number; // READING/HEARTBEAT
}

export interface PresenceEntry {
  user_uuid: string;
  user_name: string;
  avatar_color: string | null;
  avatar_initials: string | null;
  status: PresenceStatus;
  field?: string;
  value?: unknown;
  last_seen_at: number; // epoch ms
  tab_count: number;    // dedup by user; badge only for self
}

export interface EntityChangedMarker {
  entity_type: string;
  entity_uuid: string;
  version: number;
  audit_log_id: number;
  changed_by: string; // user_uuid
  changed_at: number;
}

export interface PresenceSnapshot {
  readers: PresenceEntry[];
  editors: PresenceEntry[];
  changed: EntityChangedMarker | null; // marker TTL 5 min
  current_version: number;
}
```

> snake_case everywhere per `data-model-conventions.md` (BE/FE/DAL).

---

## 3. PART 1 — DAL: intrinsic optimistic lock + error codes

### 3.1 New file: `primebrick-dal-v3/src/errors/error-codes.ts`

```ts
/**
 * Stable DAL error codes. The `code` field on DalError subclasses and the
 * SQLSTATE raised by PostgreSQL (mapped by node-postgres onto `err.code`)
 * share the same string so consumers can branch on `err.code === 'ERR01'`
 * regardless of whether the error originated in TS or PG.
 *
 * Convention: `ERR` + 2 digits. Documented in primebrick-v3-docs.
 */
export const DalErrorCodes = {
  /** Optimistic Concurrency Violation — version mismatch. Raised by PostgreSQL. */
  ERR01: "ERR01",
  /** Missing required `version` field on an auditable entity write. TS pre-check. */
  ERR02: "ERR02",
  /** Record vanished between read and write (existed at load, gone at write). */
  ERR03: "ERR03",
} as const;

export type DalErrorCode = (typeof DalErrorCodes)[keyof typeof DalErrorCodes];
```

### 3.2 Extend `primebrick-dal-v3/src/errors/errors.ts`

```ts
import { DalErrorCodes } from "./error-codes.js";

/** Missing `version` on an auditable entity write (TS pre-check, before SQL). */
export class MissingVersionError extends DalError {
  readonly code = DalErrorCodes.ERR02;
  constructor(message: string) { super(message); }
}

/** Record vanished between read and write. */
export class RecordVanishedError extends DalError {
  readonly code = DalErrorCodes.ERR03;
  constructor(message: string) { super(message); }
}
```

> `OptimisticLockError` (TS, code `ERR01`) is NOT thrown by the DAL in the happy path — the PG `RAISE` is the source. The BE maps `err.code === 'ERR01'` to `ApiError`. A TS wrapper class is provided only for ergonomic `instanceof` checks if a consumer wants to normalize PG errors into TS errors at a boundary.

### 3.3 Intrinsic optimistic lock in `Repository` (single-entity writes, auditable entities)

**Behavioral rule:**
- `find*` (read): no check.
- `add` (new record): no check.
- `update`, `upsert` (update path), `delete`, `restore`, `hardDelete` on **auditable** entities:
  1. **TS pre-check**: if `isAuditableEntity(meta)` and `version` is not present in the payload → throw `MissingVersionError` (code `ERR02`). Message EN: `"Auditable entity write requires a 'version' field; entity <entityClassName> is auditable but no version was provided."`
  2. **Extract `version`** from the payload (mirror `extractMatchValue`): remove it from SET clauses, capture as `expectedVersion`.
  3. **SQL guard**: WHERE clause becomes `WHERE matchCol = $match AND version = $expected`. `version = version + 1` stays in SET.
  4. **Post-SQL disambiguation** (only when `rowCount === 0`):
     - `SELECT 1 FROM t WHERE matchCol = $match` → 0 rows: throw `RecordVanishedError` (code `ERR03`); 1 row: execute `DO $$ BEGIN RAISE EXCEPTION 'Optimistic Concurrency Violation' USING ERRCODE = 'ERR01', DETAIL = 'The record exists but the provided version (<expected>) does not match the current version.'; END $$;` → PG raises, node-postgres propagates `err.code === 'ERR01'`.
- **Bulk / array methods** (`updateMany`, `upsertMany`, `addMany`): intrinsic guard **not applied** (TEMP TABLE semantics differ). Documented.

**Why PG raise instead of TS throw in the conflict path:** the user requires the exception to originate from PG so `err.code === 'ERR01'` is a native SQLSTATE propagated by node-postgres, interceptable at any layer (BE, US, future SDK) without coupling to a TS class. The `DO $$ ... RAISE ... $$` runs **only on the error path** (rare), so the happy path stays a single parametrized round-trip with `RETURNING *` (efficient, no PL/pgSQL overhead).

**Backward compatibility:** no new method parameter. `version` travels inside `updates`/`match` as it does today. The repository extracts it and removes it from SET (like `extractMatchValue` does for the match key). Callers that already pass `version` keep working; callers that omit `version` on auditable writes now get `ERR02` (new, correct behavior).

### 3.4 Concrete change points in `repository.ts`

- `update` impl (line 571-680): after `extractMatchValue`, add `extractVersion` for auditable entities; pre-check `ERR02`; WHERE gets `AND version = $expected`; on `rowCount === 0` disambiguate → `ERR03` or PG `ERR01`.
- `upsert` update-path (line 400-558): same guard on the UPDATE branch of `ON CONFLICT DO UPDATE ... WHERE target.version = $expected`; if 0 rows affected by the UPDATE branch (but INSERT branch may still fire for genuinely new rows) → disambiguate.
- `delete` (soft, line 681-790), `restore` (line 791-898), `hardDelete` (line 899-968): `version` extracted from `match`; WHERE gets `AND version = $expected`; same disambiguation.
- Bulk methods (line 1278+, 1406+, 1479+, 1583+): no intrinsic guard; documented.

### 3.5 Tests (DAL)

- `test/optimistic-lock.test.ts`:
  - `ERR02`: auditable write without `version` → `MissingVersionError`, code `ERR02`.
  - `ERR01`: concurrent update (two writers, same `version`) → second gets PG error, `err.code === 'ERR01'`, `err.detail` present.
  - `ERR03`: write after hard-delete of the row → `RecordVanishedError`, code `ERR03`.
  - Happy path: correct `version` → row updated, `version` incremented, audit written.
  - Non-auditable entity: no `version` required, no guard.
  - Bulk: no guard (documented behavior).

---

## 4. PART 2 — SDK: presence port + Redis impl (SSE primitives already exist)

> **REUSE (F14, F17):** The SDK already ships a complete BE-side SSE module at `src/sse/` — `createSseWriter`, `createSseEventBus`, `bridgeNatsToSse`, `SSE_HEADERS`, and types — exported from `src/index.ts:114-125` and documented in `docs/user-guide/sse-standard.mdx`. The collaboration feature **does NOT add any SSE writer/bus/bridge**. It reuses them (see PART 3). This section adds only the **presence state** layer.

### 4.1 New module: `primebrick-v3-sdk/src/presence/`

```
src/presence/
├── types.ts                  # PresenceSignal, PresenceEntry, PresenceSnapshot, EntityChangedMarker
├── presence-port.ts          # PresencePort interface
├── redis-presence-port.ts    # RedisPresencePort implementation
└── nats-subjects.ts          # presence/entity-changed NATS subject builders + publish helpers
```

### 4.2 `PresencePort`

```ts
export interface PresencePort {
  upsertReading(entityType: string, entityUuid: string, entry: PresenceEntry): Promise<void>;
  upsertEditing(entityType: string, entityUuid: string, entry: PresenceEntry): Promise<void>;
  remove(entityType: string, entityUuid: string, userUuid: string): Promise<void>;
  heartbeat(entityType: string, entityUuid: string, userUuid: string, sessionId: string): Promise<void>;
  getSnapshot(entityType: string, entityUuid: string): Promise<PresenceSnapshot>;
  setChanged(marker: EntityChangedMarker, ttlMs: number): Promise<void>;
  clearChanged(entityType: string, entityUuid: string): Promise<void>;
}
```

### 4.3 Redis key design (RedisPresencePort)

- Hash `presence:{entityType}:{entityUuid}:users` → field `userUuid` = JSON `PresenceEntry` (status READING). TTL 30s (refreshed by heartbeat/signals).
- Hash `presence:{entityType}:{entityUuid}:editors` → field `userUuid` = JSON `{field, value, since}`. TTL 30s. (A user is in `users` with status READING and additionally in `editors` while editing; LEAVE removes from both.)
- Set `presence:{entityType}:{entityUuid}:tabs:{userUuid}` → members are `sessionId`s. `tab_count = scard`. TTL 30s. On LEAVE of a tab, `srem` that sessionId; if empty → remove user from `users`/`editors`.
- String `presence:{entityType}:{entityUuid}:changed` = JSON `EntityChangedMarker`. TTL 300000ms (5 min).
- Best-effort: if Redis unavailable, `PresencePort` is a no-op null implementation (mirror `cache-port-holder.ts` pattern). System remains functional; presence UI simply disabled.

### 4.4 TTL, heartbeat, keyspace notifications

- TTL 30s on `users`/`editors`; client heartbeat 20s refreshes.
- Redis keyspace notifications (`notify-keyspace-events Exg`) → subscribe to `__keyevent@0__:expired` for `presence:*:users` / `:editors` → publish `LEAVE` on NATS `presence.{entityType}.{entityUuid}`. Enable in `infra/docker-compose.postgres.yml`: `redis-server --appendonly yes --notify-keyspace-events Exg`.
- Fallback if keyspace notifications unavailable: per-instance sweep interval with NATS dedup.

### 4.5 NATS subject builders + publish helpers (`nats-subjects.ts`)

- `presenceSubject(entityType, entityUuid)` → `presence.{entityType}.{entityUuid}`.
- `entityChangedSubject(entityType, entityUuid)` → `entity.{entityType}.{entityUuid}.changed`.
- `publishPresence(nc, entityType, entityUuid, delta)` → publishes on `presenceSubject`.
- `publishEntityChanged(nc, marker)` → publishes on `entityChangedSubject`.
- Subscription is handled by the SDK's existing `bridgeNatsToSse` (no new subscribe helper needed) — see PART 3.

### 4.6 SDK exports (`src/index.ts`)

```ts
export * from "./presence/types.js";
export { PresencePort } from "./presence/presence-port.js";
export { RedisPresencePort } from "./presence/redis-presence-port.js";
export { presenceSubject, entityChangedSubject, publishPresence, publishEntityChanged } from "./presence/nats-subjects.js";
```

> SSE exports (`createSseWriter`, `createSseEventBus`, `bridgeNatsToSse`, `SSE_HEADERS`, types) are already present at `src/index.ts:114-125` — unchanged.

---

## 5. PART 3 — BE: collaboration module (reusing SDK SSE primitives) + audit hook + error mapping

> **REUSE (F14, F15, F17):** The SSE endpoint mirrors the existing `src/modules/system/services-events-route.ts` template. It uses the SDK's `createSseWriter` (headers + wire format + BigInt-safe), `createSseEventBus` (in-process distribution), and `bridgeNatsToSse` (NATS → bus fanout). **No custom `sse-response.ts`, no custom wire-format writer.** The only new BE-side SSE plumbing is a **per-entity bus registry** that creates a bus + NATS bridge on first client and tears down on last client close.

### 5.1 New module: `primebrick-be-v3/src/modules/collaboration/`

```
src/modules/collaboration/
├── router.ts                      # SSE + POST presence + GET presence + GET audit diff by id
├── collaboration.service.ts       # orchestration: presence store + NATS publish
├── presence-store-holder.ts       # singleton PresencePort (best-effort, mirror cache-port-holder)
├── collaboration-bus-registry.ts  # per-entity SseEventBus registry (refcounted) + bridgeNatsToSse lifecycle
├── dto.ts                         # zod schemas (PresenceSignalSchema)
└── collaboration.meta.ts          # (optional) meta fragment injected into entity meta
```

Mounted in `src/modules/index.ts` (`mountModules`).

### 5.2 Endpoints

- `POST /api/v1/entities/:entity/:uuid/presence` — body `PresenceSignal`. Auth via `authMiddleware`. Updates Redis via `PresencePort`. Publishes NATS `presence.{entityType}.{entityUuid}` (via `publishPresence`). No echo to sender.
- `GET  /api/v1/entities/:entity/:uuid/presence` — returns `PresenceSnapshot` (for init/reconnect).
- `GET  /api/v1/entities/:entity/:uuid/presence/events` — SSE endpoint. URL follows the SDK standard convention `GET /api/v1/<module>/<resource>/events` (F17). Auth via `authMiddleware` + `rbacHandler` (cookie-based; `createSseConnection` sends `credentials:'include'`).
- `GET  /api/v1/entities/:entity/:uuid/audit/:auditLogId` — returns `{ delta: Record<field, {old,new}>, version, changed_by, changed_at }` for FE merge. Reuses `audit-query-helper.ts` (new `findAuditById`).

### 5.3 SSE endpoint shape (mirrors `services-events-route.ts`)

```ts
router.get("/api/v1/entities/:entity/:uuid/presence/events", rbacHandler([Permission.AUTHENTICATED_USER]), asyncHandler(async (req, res) => {
  const { entity, uuid } = req.params;
  const writer = createSseWriter(res);                       // SDK primitive (F14)
  const bus = collaborationBusRegistry.acquire(entity, uuid); // per-entity bus (+ bridgeNatsToSse on first acquire)
  // 1. Snapshot
  const snapshot = await presenceStore.getSnapshot(entity, uuid);
  writer.send({ id: `snapshot:${Date.now()}`, event: "snapshot", data: snapshot });
  // 2. Subscribe to bus
  const sub = bus.subscribe((ev) => {
    if (ev.data?.user_uuid === req.user.id) return;          // exclude sender
    writer.send(ev);
  });
  // 3. Keep-alive 15s (SDK standard)
  const ka = setInterval(() => writer.comment("keep-alive"), 15_000);
  // 4. Cleanup
  req.on("close", () => { sub.unsubscribe(); clearInterval(ka); writer.close(); collaborationBusRegistry.release(entity, uuid); });
}));
```

### 5.4 Per-entity bus registry (`collaboration-bus-registry.ts`)

- `Map<entityKey, { bus: SseEventBus, refcount: number, cleanupNats: () => void }>`.
- `acquire(entity, uuid)`:
  - If absent → `bus = createSseEventBus()`; `cleanupNats = await bridgeNatsToSse(NatsClient, bus, [ { subject: presenceSubject(...), eventType: "presence-update", transform }, { subject: entityChangedSubject(...), eventType: "entity-changed", transform } ])`; refcount=1.
  - If present → refcount++.
  - Returns `bus`.
- `release(entity, uuid)` → refcount--; on 0 → `cleanupNats()` + `bus.close()` + delete entry.
- This is the only new SSE plumbing; it composes the SDK primitives directly. Subscribe-on-first / unsubscribe-on-last keeps NATS subscriptions scoped to entities with local clients (scales horizontally).

### 5.4 Audit hook → `ENTITY CHANGED` (auto-publish on save)

Hook in `primebrick-be-v3/src/db/audit-port-adapter.ts` (BE-side, NOT DAL — keeps DAL agnostic):
- After `writeAudit` with action `UPDATE` (and `SOFT_DELETE`/`RESTORE`/`HARD_DELETE` if relevant), guarded by `isAuditableEntity(ctor)`:
  - Build `EntityChangedMarker` from `version` + `auditLogId` + `changedBy`.
  - `presenceStore.setChanged(marker, 5min)` + `publishEntityChanged(nc, marker)`.
- Only for auditable entities (auto-guard via `isAuditable`). Zero per-entity code.

### 5.5 Error mapping: `ERR01` → 409

`primebrick-be-v3/src/http/api-errors.ts`:
- New `OptimisticConcurrencyError extends ApiError` with `internal_code: 'ERR01'`, `status: 409`, `impact: 'HIGH'`, `title: 'Optimistic concurrency violation'`.
- Global error handler: if `err.code === 'ERR01'` (PG DatabaseError) → wrap into `OptimisticConcurrencyError`, propagate `err.detail` into `detail` field of RFC7807 response.
- FE receives 409 RFC7807 with `type: 'urn:primebrick:err01'`, `internal_code: 'ERR01'`, `detail` → triggers conflict UI.

### 5.6 Meta auto-inject `collaboration.enabled`

In the meta builder (wherever `/api/v1/entities/:entity/meta` is assembled):
- Auto-inject `collaboration: { enabled: isAuditableEntity(ctor), expose_editing_value: true }` by reading `getEntityPersistenceMeta(ctor).isAuditable`.
- Per-entity meta files (`customers.meta.ts` etc.) are NOT touched. One-time change in the meta assembler.

### 5.7 Save path: pass `version` through

The existing `PUT /api/v1/entities/:entity/:uuid` handler already forwards the body to `repository.update`. Since `version` is in the body and the DAL now extracts it (3.3), no BE change needed except ensuring `version` is not stripped by any DTO validation. Verify and adjust the zod schema to require `version` for auditable entities (or let the DAL `ERR02` handle it — preferred, single source of truth).

---

## 6. PART 4 — FE: presence channel + collaborative form + avatars + panel

### 6.1 SSE client — REUSE existing `createSseConnection` (no new dependency)

> **REUSE (F4, F16):** `@microsoft/fetch-event-source@2.0.1` is already in `package.json:74`, and `src/lib/sse/create-sse-connection.ts:1-163` already provides `createSseConnection(opts)` (backoff, visibility-aware, `credentials:'include'`, `parseSseData`) plus `parseSseData<T>`. **No `package.json` change, no new SSE client code.** `usePresenceChannel` wraps `createSseConnection`, exactly as `services-store.svelte.ts:32-62` wraps it for service events.

### 6.2 Composable: `src/lib/composables/usePresenceChannel.svelte.ts` (new)

- Wraps the existing `createSseConnection({ url: '/api/v1/entities/:entity/:uuid/presence/events', onMessage, onOpen, onError, onClose })` — does NOT call `fetchEventSource` directly.
- `onMessage` branches on `msg.event`: `snapshot` (init full state), `presence-update` (readers/editors delta), `entity-changed` (stale marker). Uses `parseSseData` for BigInt-safe deserialization.
- Exposes reactive `$state`: `readers`, `editors`, `changed`, `current_version` (per composable state exposure pattern, `AGENTS.md`).
- Methods: `sendReading()`, `sendEditing(field, value)`, `sendLeave()`, `startHeartbeat()`, `stopHeartbeat()` — POST signals via `apiFetch` (cookie auth already handled).
- `beforeunload` + `onDestroy` → `sendLeave()` (best-effort via `navigator.sendBeacon`).
- Heartbeat 20s.
- Reconnect: `createSseConnection` handles backoff + visibility; on `onOpen` (reconnect), `GET /presence` to realign snapshot.

### 6.3 Composable: `src/lib/composables/useCollaborativeForm.svelte.ts` (new)

Wraps SuperForms (`tainted`, `isTainted`) + `usePresenceChannel` + merge logic. Inputs: entity meta, uuid, `superFormObj`, `loaded_version`.

Reactive state:
- `conflicts: Record<field, { local, remote, base }>` — fields in conflict (tainted && present in diff).
- `merged_fields: Record<field, { new_value, badge_until }>` — silent merges (transient green badge 3s).
- `is_stale: boolean` — banner; persists in `$state` until reload/remount (never reset by SSE).

Logic on `entity-changed` event:
1. Fetch diff: `GET /api/v1/entities/:entity/:uuid/audit/:auditLogId` → `Record<field, {old,new}>`.
2. For each field in diff:
   - `isTainted(field)` true → `conflicts[field] = { local: form[field], remote: diff[field].new, base: diff[field].old }`; block field (readonly + conflict class).
   - `isTainted(field)` false → silent merge: `form[field] = diff[field].new`; `merged_fields[field] = { new_value, badge_until: now+3s }`.
3. `is_stale = true` (persists).
4. Update internal `loaded_version` to `changed.version` after silent merges (align optimistic lock for next save).

409 `ERR01` handling on save:
- Fetch fresh entity + diff from latest audit → populate `conflicts` for all tainted fields → open resolution panel.
- CTA per field: "Keep DB value" / "Keep my value" / "Overwrite".

### 6.4 Component: `src/lib/components/collaboration/PresenceAvatars.svelte` (new)

Rendered in `FormPageLayout.headerExtras`. Two stacks:
- **Editors** (left, `border-warning` ring + tooltip "Mario is editing: telefono = +39 333...").
- **Readers** (right, plain avatar).

Overflow (DOM-safe): cap visible avatars at 4 per group; beyond → `+N` pill that opens the right Sheet. Full list in panel (virtualized if > 50, realistic backoffice < 20). Click any avatar/pill → `openSheet("collaboration", { entity, uuid })` via `sheet-manager`.

### 6.5 Panel: `src/lib/components/collaboration/CollaborationPanel.svelte` (new)

Registered in `sheet-manager` panel registry. Uses existing `Sheet.Content` (side `right`).

Sections:
- **Readers** (full list: avatar + name + "for Xs").
- **Editors** (full list: avatar + field + value + "editing for Xs").
- **Stale banner** (if `is_stale`): "Entity updated by Mario to version 13. Reload to align." + CTA "Reload entity" (`invalidateAll` / remount).
- **Conflicts** (if `conflicts` non-empty): per-field widget "DB: X | Yours: Y" + CTAs "Keep DB" / "Keep mine" / "Overwrite".
- Global CTAs: "Resolve all with DB", "Resolve all with mine", "Save (retry)".

### 6.6 DRY integration in `FormPageLayout.svelte`

`primebrick-fe-v3/src/lib/components/FormPageLayout.svelte`:
- Reads `meta.collaboration?.enabled` (via `useEntityMetadata`).
- If true, auto-renders `<PresenceAvatars {entity} {uuid} />` in `headerExtras` (alongside whatever the page already passes).
- Auto-injects `useCollaborativeForm` into the form context when collaboration enabled.

Result: **no form page needs modification** to get presence + merge. Existing pages (`customers/[uuid]/+page.svelte`, `users/[uuid]/+page.svelte`) inherit the feature automatically when meta says `enabled`.

### 6.7 Field highlighting (CSS, using existing tokens)

- Field being edited by another: `border-warning` + tooltip (token `--color-warning`, `app.css`).
- Field silently merged: `bg-success` transient badge 3s (token `--color-success`).
- Field in conflict: `border-destructive` + warning icon, readonly (token `--color-destructive`).

### 6.8 Stale banner persistence

`is_stale` is `$state(false)` in `useCollaborativeForm`, set to `true` on `entity-changed`, **never** reset by SSE events. Resets only on reload/remount (SvelteKit remount → new composable → `is_stale=false` + fresh DB load). This realizes exactly the user-described behavior.

### 6.9 FE type additions

`primebrick-fe-v3/src/lib/entity-list/types.ts`:
```ts
export type EntityListMeta = {
  // ... existing
  collaboration?: {
    enabled: boolean;
    expose_editing_value?: boolean; // default true
  };
};
```

---

## 7. PART 5 — Docs (zudoku)

### 7.1 New: `primebrick-v3-docs/pages/dal/guide/error-codes.mdx`

Table of `ERR01`/`ERR02`/`ERR03`: SQLSTATE, `err.code`, `err.detail`, `err.message`, origin (PG vs TS), HTTP mapping (409), client-side branching example (`if (err.code === 'ERR01')`).

### 7.2 New: `primebrick-be-v3/docs/user-guide/collaboration.mdx`

Architecture: presence signals, SSE events, NATS subjects, Redis keys, audit hook, meta auto-inject, error mapping.

### 7.3 New: `primebrick-fe-v3/docs/user-guide/collaboration.mdx`

FE: `usePresenceChannel`, `useCollaborativeForm`, `PresenceAvatars`, `CollaborationPanel`, `FormPageLayout` auto-inject, stale banner semantics, 409 conflict UI.

### 7.4 Update: `primebrick-v3-docs/pages/dal/guide/audit-trail.mdx`

Cross-link to optimistic lock (ERR01) and collaboration.

---

## 8. File map per repo

### `primebrick-dal-v3` (modifications + new)
- NEW `src/errors/error-codes.ts`
- EDIT `src/errors/errors.ts` — `MissingVersionError` (ERR02), `RecordVanishedError` (ERR03), optional `OptimisticLockError` (ERR01 TS wrapper)
- EDIT `src/repository/repository.ts` — intrinsic optimistic lock on `update`/`upsert`/`delete`/`restore`/`hardDelete` (auditable, single-entity); `extractVersion` helper; PG `RAISE` on conflict
- NEW `test/optimistic-lock.test.ts`
- NEW `docs/user-guide/optimistic-lock.mdx`
- EDIT `docs/user-guide/_order.json`

### `primebrick-v3-sdk` (new presence module — SSE primitives already exist, unchanged)
- NEW `src/presence/types.ts`, `presence-port.ts`, `redis-presence-port.ts`, `nats-subjects.ts`
- EDIT `src/index.ts` — presence exports (SSE exports at `:114-125` unchanged)
- NEW `test/presence.test.ts`
- NEW `docs/user-guide/presence.mdx`

### `primebrick-be-v3` (new module + edits — reuses SDK SSE primitives)
- NEW `src/modules/collaboration/*` (router, service, presence-store-holder, collaboration-bus-registry, dto)
- EDIT `src/modules/index.ts` — mount
- EDIT `src/db/audit-port-adapter.ts` — `publishEntityChanged` hook (guard `isAuditable`)
- EDIT `src/http/api-errors.ts` — `OptimisticConcurrencyError` (ERR01 → 409), global handler mapping
- EDIT meta assembler — auto-inject `collaboration.enabled`
- EDIT `infra/docker-compose.postgres.yml` — `notify-keyspace-events Exg`
- NEW `docs/user-guide/collaboration.mdx`

### `primebrick-fe-v3` (new + edits — reuses existing `createSseConnection`)
- (no `package.json` change — `@microsoft/fetch-event-source@2.0.1` already present at `package.json:74`)
- NEW `src/lib/composables/usePresenceChannel.svelte.ts` (wraps `src/lib/sse/create-sse-connection.ts`)
- NEW `src/lib/composables/useCollaborativeForm.svelte.ts`
- NEW `src/lib/components/collaboration/PresenceAvatars.svelte`
- NEW `src/lib/components/collaboration/CollaborationPanel.svelte`
- EDIT `src/lib/components/FormPageLayout.svelte` — auto-inject when `meta.collaboration.enabled`
- EDIT `src/lib/shell/sheets/` — register `collaboration` panel
- EDIT `src/lib/entity-list/types.ts` — `collaboration` meta field
- NEW `docs/user-guide/collaboration.mdx`

### `primebrick-v3-docs` (new pages)
- NEW `pages/dal/guide/error-codes.mdx`
- EDIT `pages/dal/guide/_order.json` (or equivalent)
- Sync from repo `docs/user-guide/*.mdx` via existing CI

---

## 9. Implementation phases (incremental, with verification)

| Phase | Scope | Verification |
|-------|-------|--------------|
| F1 | DAL: `error-codes.ts` + `errors.ts` extensions + intrinsic optimistic lock in `update` only | `pnpm test` on `test/optimistic-lock.test.ts` (ERR01/ERR02/ERR03/happy/non-auditable) |
| F2 | DAL: extend guard to `upsert`/`delete`/`restore`/`hardDelete` | tests for each method |
| F3 | SDK: `presence/types.ts` + `PresencePort` + `RedisPresencePort` + key design + TTL | unit tests on keys/TTL/snapshot |
| F4 | SDK: `nats-subjects.ts` subject builders + publish helpers | unit tests with embedded NATS |
| F5 | BE: collaboration module — POST presence, GET presence, Redis store, NATS pub (no SSE yet) | curl tests |
| F6 | BE: SSE endpoint reusing `createSseWriter` + per-entity `collaboration-bus-registry` + `bridgeNatsToSse` + 15s keep-alive (mirrors `services-events-route.ts`) | `curl -N` streaming test |
| F7 | BE: audit hook `ENTITY CHANGED` + `GET audit/:auditLogId` diff endpoint | save → marker Redis + NATS event → SSE frame |
| F8 | BE: keyspace notifications → LEAVE on expiry | stop client → LEAVE within ~30s |
| F9 | BE: meta auto-inject `collaboration.enabled` + `ERR01` → 409 mapping | meta endpoint check; 409 on concurrent save |
| F10 | FE: `usePresenceChannel` (wraps existing `createSseConnection`) + `PresenceAvatars` + `FormPageLayout` integration (no new dependency) | visual check on `customers/[uuid]` |
| F11 | FE: `useCollaborativeForm` silent merge + conflict + stale banner | 2-browser test |
| F12 | FE: `CollaborationPanel` (right sheet) + resolution CTAs | E2E Playwright (2 contexts) |
| F13 | FE: 409 `ERR01` handling → conflict UI | same-user 2-tab test |
| F14 | Docs: error-codes.mdx, collaboration.mdx (BE+FE), audit-trail cross-link | docs build |

Dev server rules (AGENTS.md): check ports 5173/3001 before starting; never kill user PID; reuse running HMR server.

---

## 10. Risks & notes

- **SSE + proxy**: Nginx/dev-proxy need `proxy_buffering off` + long timeout. Verify Vite proxy (`vite.config.ts:34-46`) for SSE.
- **fetch-event-source**: sends cookies same-origin; if cross-origin, configure `credentials: 'include'` explicitly.
- **Redis keyspace notifications**: enable `Exg` (not default). Fallback: per-instance sweep with NATS dedup.
- **EDITING value broadcast**: per-field `collaboration.expose_editing_value` flag (default `true`) for PII-sensitive fields.
- **Stale banner + conflicts interaction**: if user has open conflicts and another `entity-changed` arrives, conflicts accumulate; panel shows all. OK.
- **Bulk writes**: intrinsic optimistic lock NOT applied (TEMP TABLE semantics). Documented. Bulk callers manage their own concurrency if needed.
- **DAL scope locking (code-guardrails.md)**: the intrinsic lock changes `update`/`upsert`/`delete`/`restore`/`hardDelete` behavior for auditable entities. This is authorized by this approved plan. Backward compatible for callers already passing `version`; callers omitting `version` on auditable writes get `ERR02` (intended new behavior).

---

## 11. Open decisions (all confirmed 2026-07-22)

- **OD1**: error code naming `ERR01`/`ERR02`/`ERR03` (convention `ERR` + 2 digits). ✅ Confirmed.
- **OD2**: `ERR03` (RecordVanishedError) for the "row gone" case, with disambiguation SELECT (1 row → ERR01 version mismatch, 0 rows → ERR03 row vanished). ✅ Confirmed.
- **OD3**: heartbeat 20s (FE), Redis TTL 30s (BE), keyspace notifications `Exg` (with fallback sweep if unavailable). ✅ Confirmed.
- **OD4**: `upsert` INSERT branch (genuinely new row) skips the optimistic-lock guard entirely. ERR01/ERR02 apply only on the `ON CONFLICT DO UPDATE` branch. ✅ Confirmed.

---

End of plan.
