# Plan — `update()`: unique-conflict ERR04/ERR05 (parity with `add()`)

## Goal

`Repository.update()` currently lets a raw PG `23505` escape when the payload
touches a `@Unique` column colliding with another row → opaque 500. `add()` /
`addMany` already emit `ERR04` (conflicting row live) / `ERR05` (soft-deleted)
via `pg_raise` inside a single-statement CTE. This plan brings the same typed
conflict reporting to `update()` — one statement, no extra round-trip, no
savepoint.

## Verified facts (empirical, not assumed)

- `update()` flow today (`repository.ts:1136-1264`): extractMatch →
  extractVersion (ERR02 if missing) → audit stamps + `version+1` → unknown col
  / empty update validation → optional audit pre-read → single
  `UPDATE ... WHERE match=$ AND version=$expected RETURNING *` → rowCount 0 →
  `disambiguateZeroRows` → ERR01 (exists) / ERR03 (vanished).
- `add()` raise-mode (`repository.ts:611-636`): `WITH ins AS (INSERT ...
  ON CONFLICT DO NOTHING RETURNING *), conflict AS (SELECT ... FROM t WHERE
  <unique predicates> LIMIT 1), raised AS (SELECT pg_raise(...)), SELECT ins.*
  FROM ins WHERE NOT EXISTS (SELECT 1 FROM raised)`.
- `uniqueConflictPredicates(entity, meta, attemptedParam, conflictKeys)`
  (lines 726-775): one `t.<col> IS NOT DISTINCT FROM <ref>` term per unique
  group; attempted value = payload param | constant `defaultSql` | NULL;
  groups containing volatile defaults are skipped.
- `disambiguateZeroRows` exists and is reused by update/delete/restore.
- `pg_raise(signature)` is a required DB function (init SQL + test schema).
- The FE renders `error.extra.issues`/`extra` verbatim in `RfcErrorDialog`;
  the BE boundary is now SDK `mapDalError` (ERR04/05 → 409 + extras).
- No caller passes `conflictKeys` to `update()` today — the option does not
  exist in `MatchByOptions`/`WriteOptions`. All unique groups are checked.

## Design

### New SQL shape (emitted ONLY when the payload writes ≥1 `@Unique` column)

```sql
WITH t0 AS (                                   -- the target row, for untouched unique cols
  SELECT * FROM public.customers WHERE uuid = $5
),
conflict AS (
  SELECT t.uuid AS c_uuid, t.deleted_at AS c_deleted_at,
         CASE WHEN (<group predicates>) THEN 'email' END AS c_constraint,
         jsonb_build_object('email', $4::text) AS c_keys
  FROM public.customers t
  WHERE t.uuid IS DISTINCT FROM $5            -- self-exclusion: target row
    AND ( (t.email IS NOT DISTINCT FROM $4) ) -- never conflicts with itself
  LIMIT 1
),
raised AS (
  SELECT public.pg_raise(
    CASE WHEN c.c_deleted_at IS NULL THEN 'ERR04' ELSE 'ERR05' END,
    'update: unique constraint violation on CustomerEntity',
    jsonb_build_object('entity','CustomerEntity','table','public.customers',
      'uuid', c.c_uuid::text, 'constraint', c.c_constraint,
      'keys', c.c_keys)::text
  ) AS _raised FROM conflict c
),
upd AS (
  UPDATE public.customers
  SET updated_at=$1, updated_by=$2, version=version+1, name=$3, email=$4
  WHERE uuid=$5 AND version=$6
    AND NOT EXISTS (SELECT 1 FROM raised)
  RETURNING *
)
SELECT * FROM upd
```

### Key decisions

1. **Self-exclusion**: `t.<matchCol> IS DISTINCT FROM $match` — re-writing the
   same unique value on the same row is not a conflict (NULL-safe).
2. **Partial payload on composite unique groups**: columns of the group not
   present in the payload keep the row's CURRENT value → their attempted ref
   is `t0.<col>` (from the `t0` CTE joining the target row), NOT a missing
   param and NOT NULL. This is the only correct semantics for partial
   updates; `uniqueConflictPredicates` must accept `t0.` refs — implement a
   variant `updateConflictPredicates` (or extend `attemptedParam` to allow
   arbitrary SQL refs).
3. **Ordering vs version guard**: `NOT EXISTS (SELECT 1 FROM raised)` sits in
   the UPDATE WHERE → evaluated only for rows passing `uuid=$ AND
   version=$expected`. Stale version → no candidate row → raised never
   evaluated → `rowCount=0` → disambiguation → ERR01. **ERR01 wins over
   ERR04/05** — correct ordering (caller must first re-read, then the
   conflict check becomes meaningful). Verify empirically in a test.
4. **`keys` in DETAIL**: attempted values per conflicting group column —
   payload param or `t0.<col>` for untouched cols. Extends the `add()`
   detail shape `{entity, table, uuid, constraint}` with `keys` (consistent
   with `addMany` per-row detail).
5. **No `conflictKeys` option on update()**: all `@Unique` groups are
   checked — the update writes whatever the payload says; there is no
   "which conflict matters" ambiguity like in addMany import paths.
6. **Unchanged path**: payload without unique columns → the CTE is not
   emitted at all; SQL byte-identical to today.
7. **Residual race**: a concurrent insert between conflict-check and UPDATE
   within the same statement cannot exist (same snapshot at READ COMMITTED
   for CTEs evaluated in one statement) — actually verify: PG evaluates all
   CTEs of one statement against the same snapshot, so the check is airtight
   for the statement. A later statement can't interleave mid-statement.
   Remaining edge: `SERIALIZABLE` anomalies — out of scope (we run READ
   COMMITTED).
8. **`t0` cost**: one extra indexed PK lookup inside the same statement,
   emitted only when needed (payload touches unique columns AND some group
   column is not in payload). Skip `t0` entirely when every unique group is
   fully covered by payload params.

## Implementation steps

1. `repository.ts` — `update()`:
   - collect `Set<propertyKey>` of payload unique columns while building
     SET clauses;
   - if any `@Unique` group is touched → build conflict CTE:
     `attemptedParam` = payload param `$n` for touched cols, `t0.<sqlName>`
     for untouched group cols, constant defaultSql | NULL otherwise;
   - emit `WITH [t0,] conflict, raised, upd ... SELECT * FROM upd` and use
     outer `result.rowCount` for the existing ERR01/ERR03 disambiguation;
   - if NO group is identifiable (all contain volatile cols) → plain UPDATE
     (23505 may still escape — same fallback as `add()`).
2. DETAIL jsonb: `{ entity, table, uuid, constraint, keys }` — keys mirrors
   addMany's per-row shape.
3. `mapDalError` (SDK): ERR04/ERR05 already forwards `uuid`/`constraint`/
   `issues` — add passthrough of `keys` if not already covered (verify
   `bulkExtra`/extra assembly; `keys` today only appears inside `rows[]`).
   → decide: surface top-level `extra.keys` for the single-row conflict.
4. Tests (`test/repository-crud.test.ts` or new `update-conflict.test.ts`):
   - update touching unique col → live conflict → `code === 'ERR04'`,
     detail.uuid/constraint/keys correct;
   - vs soft-deleted row → `ERR05`, detail.deleted;
   - re-writing SAME value on SAME row → success (self-exclusion);
   - composite unique, payload sets only one col → conflict detected via
     `t0` current value;
   - payload without unique cols → assert SQL contains no `WITH` (spy or
     behavioral: conflict row exists but payload untouched → succeeds);
   - stale version + conflicting email → ERR01 (ordering) — VERIFY actual
     behavior; if ERR04 fires first, document & decide;
   - non-auditable entity with @Unique → ERR04 works without version guard.
5. Docs: `repository.mdx` (update section + error table note),
   `api-reference.mdx` update signature note, `optimistic-lock.mdx` /
   `architecture.mdx` error rows already cover ERR04/05; update
   `.devin/rules/dal-conventions.md` write-path bullet: "update() reports
   unique conflicts as ERR04/ERR05 like add()".
6. Tracker: append to `dal-v3-breaking-changes.md` under resolved.

## Open questions — RESOLVED

- `keys` (attempted unique-column values) IS included in `detail` — for
  `update()` AND retrofitted onto `add()` so the FE error card →
  `JsonTableViewer` shows attempted values on every unique conflict.
- Residual raw `23505` (constraint outside entity metadata: manual indexes,
  deferred/partial constraints) → stays in the ERR standard: **`ERR08` →
  HTTP 409**, poor detail (PG gives no row info). Also acts as a signal
  that a `@Unique` group is missing from entity metadata.
- RowCount semantics unchanged: outer `SELECT * FROM upd` returns the
  updated row(s) — callers of `update()` get `TResult` exactly as today.

### Scope additions (resolved)

- `add()` raise-mode detail gains `keys` (per-group attempted values, same
  builder as `bulkConflictPredicates`).
- `mapDalError`: forward top-level `keys` in ERR04/ERR05 extras; add
  `case "23505"` → `ERR08` → 409.
- `error-codes.ts`: add `ERR08` + docs; tables in architecture.mdx /
  optimistic-lock.mdx / repository.mdx / dal-conventions.md get the row.

## Acceptance criteria

- `update()` emits ERR04/ERR05 with `{entity, table, uuid, constraint, keys}`
  via `pg_raise` whenever the payload collides on a unique group —
  self-excluded, NULL-safe, single statement.
- Zero behavior change when the payload touches no unique column.
- ERR01 ordering over conflict verified by test.
- DAL tests green; typecheck green; docs + tracker updated.

## Status — IMPLEMENTED + VERIFIED

Implementation landed in `repository.ts` (single-statement CTE: `t0` →
`conflict` → `raised` → `upd`), `error-codes.ts` (`ERR08`), and the SDK
`mapDalError` (`23505` → `ERR08` 409, `keys` forwarded in ERR04/ERR05 extras).

### Empirical findings during implementation (deviations from the plan)

1. **NULL false-positives (fixed).** Standard unique indexes are NULLS
   DISTINCT — a NULL attempted value can never conflict. The first cut let
   `IS NOT DISTINCT FROM NULL` match every stored NULL row → spurious ERR04
   on `add()` of rows omitting a nullable `@Unique` column. Fixed in
   `uniqueConflictPredicates` / `bulkConflictPredicates` / the update CTE:
   literal `NULL` refs skip the group entirely, param/`t0`/`tmp` refs gain a
   runtime `AND ref IS NOT NULL` guard.
2. **Raise ordering (fixed).** The plan assumed `NOT EXISTS (SELECT FROM
   raised)` inside the UPDATE qual would evaluate lazily per candidate row —
   empirically `raised` fired BEFORE the version guard, so a stale-version
   update reported ERR04 instead of ERR01. Fixed by deriving `conflict` FROM
   `t0`, where `t0` selects the target row only when it passes the version
   guard → stale target ⇒ empty conflict set ⇒ no raise ⇒ `rowCount=0` ⇒
   existing ERR01/ERR03 disambiguation wins. Test
   "stale version wins over unique conflict" verifies the ordering.

### Verification

- DAL: `tsc` clean, **197/197 tests** (192 baseline + 5 new: live conflict
  ERR04, deleted conflict ERR05, self-update same unique value OK,
  ERR01-wins ordering, non-unique payload emits no conflict CTE).
- SDK: build clean, mapper **12/12 tests** (new: `23505`→`ERR08`→409,
  `keys` passthrough).
- Docs updated: `dal-conventions.md`, `repository.mdx`,
  `optimistic-lock.mdx` (ERR08 row + update() conflict-CTE section).
