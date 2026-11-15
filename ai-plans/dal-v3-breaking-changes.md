# DAL v3 — Breaking Changes Tracker

Tracking of intentional breaking changes in `primebrick-dal-v3`. Resolve each
item across all consumers (BE, US, SDK, MCP) **before** the single-row
`update()` redesign is started.

## Resolved

- [x] `Repository.upsert()` — **removed** (no alias). Rationale: vacuous
  version guard on the ON CONFLICT path. Replaced by `add()` (raise
  ERR04/ERR05 on unique conflict) + `update()` with observed version.
- [x] `WriteOptions.createIfAbsent` — **removed**. Replaced by
  `onConflict: "raise" | "ignore"` (default `"raise"`).
- [x] `WriteOptions.conflictKeys?: (keyof TEntity & string)[]` — added,
  type-safe, must exactly match a `@Unique` group.
- [x] `add()` — default no longer silently skips conflicts; raises ERR04
  (live row) / ERR05 (soft-deleted row) via `pg_raise` with jsonb DETAIL.
- [x] `addMany` / `upsertMany` — were non-transactional without
  `timeoutMs`; now always wrapped in BEGIN/COMMIT on a dedicated client.
- [x] `addMany` — now uses the TEMP TABLE strategy (payload → tmp →
  conflict check → INSERT SELECT), same as updateMany/deleteMany.
- [x] `addMany` / `upsertMany` / `updateMany` / `deleteMany` — return type
  changed `Promise<void>` → `Promise<BulkResult>` (`{ received, affected }`;
  `affected` = PG rowCount).
- [x] `BulkOptions.timeoutMs` — semantics changed: it was a per-statement
  `statement_timeout` that also implicitly enabled the transaction on
  add/upsertMany; now it is the whole-operation wall-clock budget
  (SET LOCAL + JS deadline → rollback + `BulkTimeoutError` ERR06).
- [x] `upsertMany` — **COMMENTED OUT** (Repository, Dal facade, SDK
  `cached-repository` wrap, and all its tests in `repository-bulk.test.ts`,
  `repository-negative.test.ts`, `dal-timeout.test.ts`,
  `benchmark/bulk-benchmark.test.ts`). Rationale: its ON CONFLICT DO UPDATE
  path overwrites unconditionally with no version guard. Parked pending the
  guarded vs sync-import semantics decision — do NOT re-enable blindly.

## Pending — to resolve before `update()` redesign

- [ ] `pg_raise` function must exist in every target DB (added to the global
  `00000000000000_init_database.sql` + fire-and-forget + test `setupTestSchema`).
- [ ] `DalConfig.bulkTimeoutMs` — new config key (default 1800000 = 30 min);
  consumers can override via `BulkOptions.timeoutMs`.
- [ ] BE error mapping for ERR04/ERR05 bulk detail (`conflicts` + `rows[]`
  with uuid/input_uuid/code/deleted/constraint/keys) already added;
  ERR06 → 408 (`BulkTimeoutError`) and PG `57014` → ERR07 → 500 (typed;
  504 is reserved for DB-unreachable) added in `error-handler.ts`. Note:
  `57014` keeps PG's own code on the wire; ERR07 is only the
  logical/HTTP-side code.
- [ ] Callers ignoring the return value remain valid (`await repo.addMany(...)`
  still works), but any code expecting `void`/`undefined` must be checked
  (SDK `cached-repository.ts` wraps upsertMany/updateMany — `any`-typed, OK).
- [ ] `update()` single-row — **not yet touched**; requires separate
  detailed analysis (conflict identification on the UPDATE path, version
  semantics, conflictKeys analog).
- [ ] Upsert() tests preserved as comments in `repository-crud.test.ts`,
  `optimistic-lock.test.ts`, `repository-audit-clone.test.ts`.
