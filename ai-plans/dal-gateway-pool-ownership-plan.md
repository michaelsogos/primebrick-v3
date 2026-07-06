# Plan: Extend `@primebrick/dal-pg` with the `Dal` Gateway — Pool Ownership, Type-Parser Registration, Best-Practice Defaults, Per-Call Timeout Override

> Status: DRAFT — awaiting user approval (PROCEED keyword).
> Created: 2026-07-06
> Scope: `primebrick-dal-v3` only. This adds a new `Dal` class to the library. The US emailsender consumer integration is a separate plan (`us-emailsender-dal-integration-plan.md`, revised in parallel).
> Prerequisite for: US emailsender DAL integration, and later BE migration.

---

## 1. Objective

Add a high-level `Dal` gateway class to `@primebrick/dal-pg` that centralizes three responsibilities currently left to the consumer:

1. **Type-parser registration** — `INT8_OID` (native `bigint`) and `NUMERIC` (safe `number` / overflow `string`) parsers, registered once, idempotently, inside the lib — NOT in consumer code.
2. **Pool ownership & lifecycle** — the lib creates and manages the `pg.Pool` from connection params; the consumer no longer constructs or manages the pool. The lib enforces best-practice defaults to prevent connection throttling under high-async REST traffic.
3. **Singleton gateway per DB connection** — one `Dal` instance per process per database, reused across all requests. No per-request object allocation. Accessed via a `getDal(config)` factory with singleton guard.

The existing `Repository` class stays exported as the low-level engine (for transaction participation via `withClient`, and for tests that inject a mock `Queryable`). `Dal` delegates to an internal `Repository(pool)` instance.

### Design decisions (confirmed with user)

- **Singleton instance, NOT static class.** A static class is process-global → no multi-DB, no testability, no explicit lifecycle (`close()`). A singleton instance via `getDal()` gives the same zero-per-request-alloc guarantee with testability, multi-DB support, and proper `close()` for graceful shutdown.
- **Pool owned by the lib by default; escape hatch for external `Pool`/`PoolClient`.** Default: consumer passes connection params, lib creates the pool. Advanced: consumer can inject a `Queryable` for transactions (`withClient`) or tests.
- **`statement_timeout` as the primary anti-throttling measure.** Default 30s per session, set in `onConnect`. Per-call override for bulk ops (`SET LOCAL` inside the tx) and for ad-hoc long queries (`withClient` with `timeoutMs`). Streaming is naturally safe (cursor `FETCH` per batch).

---

## 2. `statement_timeout` semantics (verified from PostgreSQL docs + pgsql-hackers)

From the [PostgreSQL docs](https://www.postgresql.org/docs/19/runtime-config-client.html):
> "The timeout is measured from the time a command arrives at the server until it is completed by the server."

From the [pgsql-hackers mailing list](https://www.postgresql.org/message-id/28985.1439046816@sss.pgh.pa.us) (Tom Lane):
> "statement_timeout *does* include time spent sending the result set to the client"

**It is NOT preparation time only.** It is the full wall-clock: command arrival → planning → execution → transmitting ALL result rows to the client.

### Impact per operation type

| Operation | One statement? | Bounded by `statement_timeout`? | Risk |
|---|---|---|---|
| Normal REST CRUD (single row, small sets) | yes | yes, 30s is plenty | none |
| `addMany` / `upsertMany` / `updateMany` / `deleteMany` (batched) | one per batch | yes, per batch | low — each batch ≤1000 rows is fast; override available |
| `findAll` non-streamed (large export) | one statement for the whole result | yes — covers the entire fetch | **HIGH** — large result set killed by 30s |
| `findAll` streamed (`stream: true`, pg-query-stream) | one `FETCH` per batch (cursor) | yes, **per `FETCH` batch** | **none** — each `FETCH` of N rows is a separate statement |

**Key insight**: streaming via a cursor is naturally safe. `pg-query-stream` uses `DECLARE CURSOR` + repeated `FETCH N`. `statement_timeout` applies to each `FETCH` individually, not to the whole stream. A stream of 1M rows with batch size 1000 = 1000 separate `FETCH` statements, each fetching 1000 rows in well under 30s.

### Lib timeout strategy

1. **Global default**: `DalConfig.statementTimeoutMs = 30000` — set in `onConnect` via `SET statement_timeout`. Strict default for REST traffic.
2. **Bulk ops**: already run inside a transaction (TEMP TABLE strategy). When `options.timeoutMs` is provided, emit `SET LOCAL statement_timeout = '<ms>'` inside the tx. `SET LOCAL` is transaction-scoped — no leakage to other queries on the same connection.
3. **`findAll` streamed**: no special handling — cursor `FETCH` per batch is bounded by the session default. 30s per batch of 1000 rows is enormous headroom.
4. **`findAll` non-streamed on large sets**: the lib documents that non-streamed `findAll` is for bounded result sets only; for exports, use `stream: true`. If a caller insists on a large non-streamed query, they use `withClient(fn, { timeoutMs })`.
5. **`withClient(fn, { timeoutMs })`**: sets `statement_timeout` on that specific client before running `fn`, resets to session default on release. For ad-hoc long-running queries (future export microservice, reports).

---

## 3. Proposed API

### 3.1 `DalConfig`

```typescript
export interface DalConfig {
  /** PostgreSQL connection string. Required if `pool` is not provided. */
  connectionString: string;

  /** Schema to set as search_path on every connection. Default: undefined (uses DB default). */
  schema?: string;

  /** Maximum pool size. Default: 10.
   *  Document the formula: max ≤ (PG max_connections − reserved) / service_instances.
   *  The lib cannot pick this for you, but it documents it. */
  max?: number;

  /** Per-statement timeout in ms, set via SET statement_timeout on every connection.
   *  Default: 30000. Set to 0 to disable. */
  statementTimeoutMs?: number;

  /** Time to wait when acquiring a connection from the pool before erroring.
   *  Default: 5000. Fail fast when pool exhausted — don't let requests queue forever. */
  connectionTimeoutMillis?: number;

  /** How long an idle connection is kept before closing. Default: 30000 (pg default). */
  idleTimeoutMillis?: number;

  /** Optional: recycle connections after N uses to clear per-session state.
   *  Default: undefined (off). Documented, not forced. */
  maxUses?: number;

  /** Optional application_name for PG logging/observability. Default: "primebrick-dal". */
  applicationName?: string;
}
```

### 3.2 `Dal` class

```typescript
export class Dal {
  constructor(config: DalConfig);

  // --- Pool lifecycle ---
  /** The underlying pg.Pool. Exposed for the snapshot/migration tooling that needs raw access. */
  getPool(): pg.Pool;

  /** Graceful shutdown — drains the pool (calls pool.end()). Call on SIGTERM/SIGINT. */
  close(): Promise<void>;

  // --- Finders (delegate to internal Repository) ---
  findById<TEntity, TResult>(entity: EntityClass, id: number | string, options?: FindByIdOptions): Promise<TResult | null>;
  findByUUID<TEntity, TResult>(entity: EntityClass, uuid: string, options?: FindByUUIDOptions): Promise<TResult | null>;
  find<TEntity, TResult>(entity: EntityClass, fields?: FieldProjector[] | null, options?: FindOptions): Promise<TResult | null>;
  findAll<TEntity, TResult>(entity: EntityClass, fields?: FieldProjector[] | null, options?: FindOptions): Promise<TResult[] | AsyncIterable<TResult>>;
  findByPage<TEntity, TResult>(entity: EntityClass, page: number, recordsPerPage: number, fields?: FieldProjector[] | null, options?: FindOptions): Promise<PaginatedEntity<TResult>>;
  count(entity: EntityClass): Promise<number>;

  // --- Single-row writes (all RETURNING *, all return TEntity) ---
  add<TEntity>(entity: EntityClass, row: Partial<Record<keyof TEntity & string, unknown>>, options: WriteOptions): Promise<TEntity>;
  upsert<TEntity>(entity: EntityClass, row: Partial<Record<keyof TEntity & string, unknown>>, options: WriteOptions & { conflictTarget?: string }): Promise<TEntity>;
  update<TEntity>(entity: EntityClass, uuid: string, updates: Partial<Record<keyof TEntity & string, unknown>>, options: WriteOptions): Promise<TEntity>;
  delete<TEntity>(entity: EntityClass, uuid: string, options: WriteOptions): Promise<TEntity>;
  restore<TEntity>(entity: EntityClass, uuid: string, options: WriteOptions): Promise<TEntity>;
  hardDelete<TEntity>(entity: EntityClass, uuid: string, options: WriteOptions): Promise<void>;

  // --- Bulk writes (TEMP TABLE strategy, batched) ---
  addMany<TEntity>(entity: EntityClass, rows: Array<Partial<Record<keyof TEntity & string, unknown>>>, options: WriteOptions & { batchSize?: number; timeoutMs?: number }): Promise<TEntity[]>;
  upsertMany<TEntity>(entity: EntityClass, rows: Array<Partial<Record<keyof TEntity & string, unknown>>>, options: BulkOptions & { timeoutMs?: number }): Promise<TEntity[]>;
  updateMany<TEntity>(entity: EntityClass, updates: Array<{ uuid: string } & Partial<Record<keyof TEntity & string, unknown>>>, options: WriteOptions & { batchSize?: number; timeoutMs?: number }): Promise<TEntity[]>;
  deleteMany<TEntity>(entity: EntityClass, uuids: string[], options: WriteOptions): Promise<TEntity[]>;

  // --- Raw SQL escape hatch ---
  rawSql<TResult = unknown>(text: string, values?: unknown[]): Promise<TResult[]>;

  // --- Transaction / long-query support ---
  /** Acquires a dedicated client from the pool, optionally sets a per-connection statement_timeout,
   *  runs fn(client), and releases the client (resetting the timeout).
   *  Use for: transactions (BEGIN/COMMIT inside fn), ad-hoc long queries with timeoutMs override. */
  withClient<TResult>(fn: (client: pg.PoolClient) => Promise<TResult>, options?: { timeoutMs?: number }): Promise<TResult>;
}
```

### 3.3 `getDal` factory (singleton)

```typescript
let defaultDal: Dal | null = null;

/** Returns the process-wide singleton Dal instance. Creates it on first call.
 *  Subsequent calls with a DIFFERENT config throw (prevents accidental double-init with wrong params).
 *  Subsequent calls with NO config return the existing instance.
 *  For multi-DB: construct `new Dal(config)` directly (bypasses the singleton). */
export function getDal(config?: DalConfig): Dal {
  if (defaultDal) {
    if (config && defaultDal.config.connectionString !== config.connectionString) {
      throw new Error("getDal: a Dal instance already exists with a different connectionString. Use `new Dal(config)` for multi-DB.");
    }
    return defaultDal;
  }
  if (!config) throw new Error("getDal: config required on first call");
  defaultDal = new Dal(config);
  return defaultDal;
}

/** Resets the singleton (for tests). Closes the existing instance if any. */
export async function resetDal(): Promise<void> {
  if (defaultDal) {
    await defaultDal.close();
    defaultDal = null;
  }
}
```

### 3.4 `Repository` stays exported (low-level)

The existing `Repository` class is unchanged and still exported. `Dal` internally constructs `new Repository(pool)` and delegates. Consumers who need transaction participation can use `dal.withClient(fn)` which gives them a `PoolClient`; if they want a `Repository` backed by that client, they do `new Repository(client)` inside `fn`. This is the documented advanced path.

---

## 4. Pool best practices baked into `Dal` (the anti-throttling core)

| Setting | Source | Default | Why |
|---|---|---|---|
| `max` | `DalConfig.max` | `10` | Document the formula: `max ≤ (PG max_connections − reserved) / service_instances`. The lib can't pick this, but it documents it and warns if `max` is absurdly high. |
| `connectionTimeoutMillis` | `DalConfig` | `5000` | **Fail fast** when pool exhausted or DB unreachable. Don't let requests queue forever — a 5s timeout means the caller gets an error and can retry, instead of hanging. |
| `idleTimeoutMillis` | `DalConfig` | `30000` | Recycle idle connections. pg default. |
| `statement_timeout` | `DalConfig.statementTimeoutMs` | `30000` | **The key anti-throttling measure.** A single slow query holding a connection starves the whole pool under burst traffic. Per-session timeout guarantees connection release. Set in `onConnect`. |
| `maxUses` | `DalConfig.maxUses` | off | Optional recycle after N uses. Documented, not forced. |
| `application_name` | `DalConfig.applicationName` | `"primebrick-dal"` | PG-side observability — shows up in `pg_stat_activity`. |

### `onConnect` handler (runs on every new connection)

```typescript
onConnect: async (client) => {
  const statements: string[] = [];
  if (config.schema) {
    statements.push(`SET search_path TO ${quoteIdent(config.schema)}`);
  }
  if (config.statementTimeoutMs !== undefined && config.statementTimeoutMs !== 0) {
    statements.push(`SET statement_timeout TO ${config.statementTimeoutMs}`);
  }
  if (config.applicationName) {
    statements.push(`SET application_name TO '${config.applicationName.replace(/'/g, "''")}'`);
  }
  if (statements.length > 0) {
    await client.query(statements.join("; "));
  }
}
```

### Why `statement_timeout` is the critical one

Under REST burst traffic, a single slow query (missing index, N+1, lock wait) holds a connection for seconds. With `max: 10`, 10 slow queries exhaust the pool. Without `statement_timeout`, all subsequent requests queue until `connectionTimeoutMillis` (5s) fires, then error. With `statement_timeout: 30000`, the slow query is killed at 30s, the connection is released, and the pool recovers. This is the single most impactful setting for high-async traffic.

---

## 5. Type-parser registration (centralized in the lib)

```typescript
// inside Dal constructor, before pool creation
let typeParsersRegistered = false;

function ensureTypeParsers(): void {
  if (typeParsersRegistered) return;
  // INT8 → native bigint (not string)
  pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => BigInt(val));
  // NUMERIC → number when safe, string when precision overflows MAX_SAFE_INTEGER
  pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => {
    const num = Number(val);
    return (!val.includes(".") && Math.abs(num) > Number.MAX_SAFE_INTEGER) ? val : num;
  });
  typeParsersRegistered = true;
}
```

**Idempotent**: the `typeParsersRegistered` guard prevents double-registration if multiple `Dal` instances are constructed (multi-DB case) or during HMR. The parsers are global on the `pg` module, so registering once is correct.

**Consumer no longer needs to know about `INT8_OID` or `NUMERIC` parsing.** This is now the lib's responsibility.

---

## 6. Per-call timeout override implementation

### 6.1 Bulk ops (inside a transaction)

`addMany`, `upsertMany`, `updateMany` already use `BEGIN ... COMMIT` (TEMP TABLE strategy). When `options.timeoutMs` is provided:

```typescript
await client.query("BEGIN");
if (options.timeoutMs !== undefined) {
  await client.query(`SET LOCAL statement_timeout TO ${options.timeoutMs}`);
}
// ... existing bulk logic ...
await client.query("COMMIT");
```

`SET LOCAL` is transaction-scoped — it automatically resets when the transaction ends (COMMIT/ROLLBACK). No leakage to other queries on the same connection. Zero overhead when not used.

### 6.2 `withClient` (ad-hoc long queries, transactions)

```typescript
async withClient<TResult>(fn: (client: pg.PoolClient) => Promise<TResult>, options?: { timeoutMs?: number }): Promise<TResult> {
  const client = await this.pool.connect();
  try {
    if (options?.timeoutMs !== undefined) {
      await client.query(`SET statement_timeout TO ${options.timeoutMs}`);
    }
    return await fn(client);
  } finally {
    if (options?.timeoutMs !== undefined) {
      await client.query(`SET statement_timeout TO ${this.config.statementTimeoutMs ?? 30000}`);
    }
    client.release();
  }
}
```

The `finally` block resets the timeout to the session default before releasing the connection back to the pool. This prevents a per-call override from leaking to the next consumer of that connection.

### 6.3 Streaming (`findAll` with `stream: true`)

No special handling. `pg-query-stream` uses `DECLARE CURSOR` + `FETCH N`. Each `FETCH` is a separate statement bounded by the session `statement_timeout` (30s default). 30s per batch of 1000 rows is enormous headroom. The lib documents: **for large result sets, always use `stream: true`**.

---

## 7. Impacted files (in `primebrick-dal-v3`)

| File | Change | Type |
|---|---|---|
| `src/dal/dal.ts` | NEW — `Dal` class, `DalConfig`, `getDal`, `resetDal` | new |
| `src/dal/type-parsers.ts` | NEW — `ensureTypeParsers()` (extracted for testability) | new |
| `src/index.ts` | export `Dal`, `DalConfig`, `getDal`, `resetDal` from the new module | edit |
| `src/repository/repository.ts` | add optional `timeoutMs` to bulk method options; emit `SET LOCAL statement_timeout` inside the tx when present | edit |
| `test/dal.test.ts` | NEW — integration tests for `Dal`: pool creation, type parsers, `onConnect` settings, `withClient`, `close`, singleton guard | new |
| `test/dal-timeout.test.ts` | NEW — tests for per-call `timeoutMs` on bulk ops + `withClient`; verify `SET LOCAL` doesn't leak | new |
| `docs/ai/dal-usage-guide.md` | add `Dal` gateway section: `getDal()`, `DalConfig`, pool defaults, timeout strategy, `withClient`, streaming guidance | edit |
| `.devin/skills/dal-usage/SKILL.md` | update quick reference to show `getDal()` as the primary entry point | edit |
| `README.md` | update usage example to show `getDal()` | edit |

**Files NOT touched**: `src/repository/repository.ts` core CRUD logic (only the bulk-op `SET LOCAL` addition), `src/meta/*`, `src/query/*`, `src/errors/*`, `src/streaming/*`.

---

## 8. Step-by-step implementation order (atomic, build + test after each)

> Per the code-guardrails rule: max 2 self-correction attempts per step; halt and report if a step fails twice. Run `pnpm run build` + `pnpm test` after each step.

1. **Create `src/dal/type-parsers.ts`** — `ensureTypeParsers()` with idempotent guard. Unit-testable in isolation.
2. **Create `src/dal/dal.ts`** — `DalConfig` interface, `Dal` class (constructor: register parsers, create pool with `onConnect`, construct internal `Repository`), `getPool()`, `close()`, all delegating methods, `withClient`. No singleton yet.
3. **Add `getDal` / `resetDal`** to `dal.ts` — singleton factory with config-mismatch guard.
4. **Export from `src/index.ts`** — `Dal`, `DalConfig`, `getDal`, `resetDal`. Build.
5. **Add `timeoutMs` to bulk ops** in `repository.ts` — `addMany`, `upsertMany`, `updateMany` options; emit `SET LOCAL statement_timeout` inside the tx when present. Build.
6. **Write `test/dal.test.ts`** — integration tests: pool creation, `onConnect` sets `search_path`/`statement_timeout`/`application_name`, type parsers active (insert bigint, read back as `bigint`), `withClient` tx commit/rollback, `close()` drains pool, singleton guard throws on config mismatch.
7. **Write `test/dal-timeout.test.ts`** — per-call `timeoutMs` on bulk ops (verify a 1ms timeout kills a slow bulk insert), `withClient` timeout override + reset (verify no leakage to next pool consumer), streaming with default timeout (verify large stream completes via cursor FETCH).
8. **Update docs** — `dal-usage-guide.md`, `SKILL.md`, `README.md` with `getDal()` as the primary entry point.
9. **Full build + full test suite** — `pnpm run build && pnpm test`. All 90+ existing tests must still pass (the `Repository` changes are additive only).

---

## 9. Acceptance criteria

1. `pnpm run build` exits 0. `pnpm test` exits 0 (all existing tests + new `dal.test.ts` + `dal-timeout.test.ts`).
2. `Dal` class exported from `@primebrick/dal-pg`. `getDal(config)` returns a singleton. `resetDal()` closes and clears it.
3. Constructing `new Dal({ connectionString, schema: "test" })` registers INT8 + NUMERIC type parsers (verified by inserting a `bigint` column and reading back a native `bigint`, not a string).
4. `onConnect` sets `search_path`, `statement_timeout`, `application_name` on every connection (verified by querying `SHOW search_path; SHOW statement_timeout; SHOW application_name;` inside a test).
5. `dal.withClient(async (client) => { ... })` acquires and releases a client. With `{ timeoutMs: 1000 }`, it sets `statement_timeout` to 1s on that client and resets it to the session default on release (verified by checking the next pool consumer sees the default, not 1s).
6. Bulk ops with `{ timeoutMs: 1 }` abort with a query timeout error (verified by attempting a bulk insert with a 1ms timeout against a slow operation).
7. `dal.close()` calls `pool.end()` — subsequent `dal.find(...)` throws (pool is closed).
8. `getDal()` with no config on first call throws. `getDal(config)` then `getDal(differentConfig)` throws (singleton guard).
9. The existing `Repository` class is still exported and still works when constructed directly with a `Pool` or `PoolClient` (backward compatible).
10. No `git commit` is made without explicit user instruction.

---

## 10. What this enables for consumers

After this plan is implemented, a consumer (US emailsender, later BE) does:

```typescript
import { getDal, Filter, field, NotFoundError } from "@primebrick/dal-pg";

// once at startup:
const dal = getDal({
  connectionString: process.env.DATABASE_URL!,
  schema: "emailsender",
  max: 10,
  statementTimeoutMs: 30000,
});

// per request — no allocation, reuse the singleton:
const config = await dal.find(EmailConfigEntity, null, {
  filters: [Filter.fieldValue(field(EmailConfigEntity, "provider"), "=", "brevo")],
  throwIfNotFound: true,
});

// graceful shutdown:
process.on("SIGTERM", () => dal.close());
```

No pool management. No type-parser registration. No per-request `new Repository()`. One gateway, reused, with anti-throttling defaults baked in.

---

## 11. Out of scope (explicit)

- US emailsender integration (separate plan: `us-emailsender-dal-integration-plan.md`, revised in parallel).
- BE migration (separate future plan).
- `clone` method (separate future addition, needed for BE).
- Audit coverage extension (DAL only audits `add()` today; extending to all write ops is a separate future task).
- Connection-level query cancellation via `pg` cancel API (future enhancement for long-running query abort).
- Any `git commit` (wait for explicit user instruction).
