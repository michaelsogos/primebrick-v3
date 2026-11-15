# DAL v3 — Bulk `*Many` identity alignment

Status: IMPLEMENTED — DAL suite 245/245, typecheck clean
Stream: `feature/i18n-module-translations`
Scope: `updateMany`, `deleteMany`, `restoreMany` in `primebrick-dal-v3`
(`hardDeleteMany` **does not exist** — verified; only single `hardDelete`.
Adding it is a separate feature, out of scope here.)

## Goal

Extend the single-row identity semantics (commit `3295e2e`) to bulk writes
**without losing the set-based temp-table design**. Every item in a bulk payload
must resolve to **at most one** target row, and the batch keeps its current
cost profile: `CREATE TEMP TABLE → batched INSERT → one set-based statement`.
No cursors, no per-row queries on the happy path.

## Current state (empirical)

`updateMany` / `deleteMany` / `restoreMany` today (`src/repository/repository.ts`):

- `resolveMatchColumn()` picks ONE match column (`matchBy` string, defaults
  to `uuid` when absent — verified at `repository.ts:79-108`; it also
  already rejects `matchBy` arrays >1 with `MatchSelectorError`).
- Temp table has columns `[match_col, ...updateCols, expected_version?]`;
  items are streamed in via multi-row `INSERT ... VALUES (...),(...)` batches
  sized by `autoBatchSize()` (PG 65535-param ceiling).
- Final write is a single `UPDATE ... FROM tmp WHERE t.match = tmp.match
  [AND t.version = tmp.expected_version]`.
- `bulkStaleDiagnoseSql()` pre-check raises `ERR01`/`ERR03` with a DETAIL
  jsonb of up to 10 offending rows — runs once per bulk op, in the same tx.
- Audit snapshot `tmp_old_*` is another set-based `CREATE TEMP TABLE ... AS
  SELECT t.* FROM t JOIN tmp`.

**Missing vs single-row contract:**

| Single-row op | Bulk op today |
|---|---|
| id+uuid auto-AND identity | only ONE `matchBy` column |
| `matchBy` must be `@Unique`/`@Key`, composite groups complete → ERR09 | any column accepted → silently fans out to N rows |
| `matched`/`guard` CTE: >1 row → ERR10, atomic abort | no per-item uniqueness check — a non-unique match column updates every matching row |
| identity stripped from SET | match column stripped from SET (ok) |

## Design

### 1. Identity resolution per item — DRY refactor

`resolveMatchConditions()` (repository.ts:779) already does selector legality
(`@Key`/`@Unique` check), composite-group expansion, required-prop check, and
auto id/uuid AND — **all against a payload shape, not a value**. Bulk items
are homogeneous, so the resolution runs **once per op** (not per row):

- Refactor: split `resolveMatchConditions` into
  `resolveIdentityProps(meta, matchBy) → { required: Set<prop>, identityProps }`
  (the pure shape part) — reused by both the single-row path and bulk.
- Bulk wrapper `resolveBulkMatchColumns(meta, items, matchBy)`:
  calls `resolveIdentityProps`, then verifies the identity prop set is
  **identical across all items** (id/uuid presence must be uniform — a tmp
  table is rectangular; heterogeneous identity → ERR09 listing the first
  diverging `row_ix`), and every required prop is present in every item
  (missing → `ValidationError` with item index, same shape as today).

- `matchBy` (string | array) selector props must be `@Key`/`@Unique`;
  composite `@Unique` group ⇒ all group props become required columns of tmp.
  Illegal/incomplete → **ERR09 pre-SQL** (before `bulkBegin`, zero SQL emitted).
- `id` / `uuid` present in **every** item → auto-added as identity columns
  (AND). If they appear in only *some* items → ERR09 (heterogeneous payload —
  a batch must share one identity shape; keeps the temp table rectangular).
- Result: `MatchCondition[]`-like column list `[{propertyKey, sqlName, hints}]`
  + per-item required-field check (missing value → `ValidationError`, same
  shape as today).

### 2. Temp table gains all identity columns — zero perf loss

The temp table is created once per op; adding 1-3 identity columns changes
neither the row count nor the batch size asymptotically (param ceiling is
recomputed by `autoBatchSize(allTmpKeys.length)`).

The identity AND becomes the JOIN predicate:

```sql
-- BEFORE (updateMany, matchBy:'uuid')
UPDATE public.customers SET name = tmp.name, version = customers.version + 1
FROM tmp_update_customers_x tmp
WHERE customers.uuid = tmp.uuid
  AND customers.version = tmp.expected_version;

-- AFTER (auto id+uuid AND — same statement count, same JOIN plan)
UPDATE public.customers SET name = tmp.name, version = customers.version + 1
FROM tmp_update_customers_x tmp
WHERE customers.id   = tmp.id
  AND customers.uuid = tmp.uuid
  AND customers.version = tmp.expected_version;
```

`id`/`uuid`/`matchBy` cols are never SET columns (already true for the single
match column — extended to every identity column).

### 3. Per-item uniqueness guard — set-based, one extra statement

Bulk semantic: **each tmp row must match ≤ 1 target row** (a tmp row matching
0 rows is handled by the stale/vanished diagnose; matching >1 is an ambiguous
identity → abort). Guard runs inside the same transaction, before the write:

```sql
WITH dup AS (
  SELECT tmp.row_ix, count(t.*) AS hits
  FROM tmp_update_customers_x tmp
  JOIN public.customers t
    ON  t.id   = tmp.id
    AND t.uuid = tmp.uuid
  GROUP BY tmp.row_ix
  HAVING count(*) > 1
),
det AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS rows
  FROM (SELECT row_ix, hits FROM dup LIMIT 10) x
)
SELECT public.pg_raise(
  'ERR10',
  'updateMany: ambiguous identity — one or more rows matched multiple records',
  jsonb_build_object('table','public.customers','ambiguous', det.rows)::text
)
FROM det WHERE EXISTS (SELECT 1 FROM dup);
```

Requires a synthetic `row_ix bigint` column in tmp (monotonic index of the
item) so offenders are identifiable in DETAIL — costs nothing, it's one more
int8 column.

> Why not a plain `WHERE EXISTS` raise? The `det` aggregate gives the caller
> the offending item indexes — same diagnostic style as `bulkStaleDiagnoseSql`.

### 4. Identity incoherence (id↔uuid mismatch) — folded into the stale diagnose

A tmp item whose `id` and `uuid` point at different rows simply JOINs to
nothing → lands in `bulkStaleDiagnoseSql` as "vanished" → today that yields
ERR03. **Upgrade the diagnose** for multi-identity ops: extend `st` to probe
each identity column separately:

```sql
WITH st AS (
  SELECT tmp.row_ix, t.uuid AS s_uuid, t.version AS s_actual, tmp.expected_version AS s_expected,
         (t.id IS NULL) AS s_vanished,
         EXISTS(SELECT 1 FROM public.customers p WHERE p.id   = tmp.id)   AS s_id_seen,
         EXISTS(SELECT 1 FROM public.customers q WHERE q.uuid = tmp.uuid) AS s_uuid_seen
  FROM tmp tmp LEFT JOIN public.customers t
    ON t.id = tmp.id AND t.uuid = tmp.uuid
  WHERE t.id IS NULL OR t.version IS DISTINCT FROM tmp.expected_version
)
-- classification per row:
--   s_vanished AND (s_id_seen OR s_uuid_seen) → 'ERR10' (incoherent identity)
--   s_vanished AND NOT(...)                   → 'ERR03' (vanished)
--   else                                      → 'ERR01' (stale version)
-- batch code: any ERR10 → 'ERR10'; else all vanished → 'ERR03'; else 'ERR01'
```

This adds `O(#identity_cols)` EXISTS probes **only against the offending tmp
rows** after the LEFT JOIN already filtered — same "diagnose only on failure"
cost model as single-row `assertNoPartialIdentity`, still fully set-based.

**Latent bug fixed in passing (verified):** `bulkStaleDiagnoseSql` emits
`t.uuid AS s_uuid` unconditionally — but `mfa_action_authorization` is
auditable (has `version`, so the diagnose runs) and has **no `uuid` column**.
A bulk write on it would fail with a Postgres "column does not exist" instead
of the intended error. The diagnose will report the entity's `id` (or first
identity column) instead of hardcoding `uuid` — same DETAIL shape.

### 5. Ordering inside the bulk op (unchanged shape)

```
resolveBulkMatchColumns (ERR09 pre-SQL)
→ bulkBegin (tx + deadline)
→ CREATE TEMP TABLE tmp (identity + set cols + row_ix + expected_version?)
→ batched INSERT
→ dup-guard raise (ERR10 ambiguous)        [new]
→ bulkStaleDiagnoseSql extended (ERR10/03/01)  [extended]
→ UPDATE/DELETE FROM tmp
→ rowCount race guard (unchanged)
→ audit insert (unchanged — tmp_old JOIN uses the full identity predicate)
```

All raises run **before** the write → statement-atomic abort, identical to the
single-row `guard` CTE semantics but batched.

### 6. Composite unique selectors in bulk

Now legal: `matchBy: ["model_id","dtype"]` produces two tmp columns + a
two-column JOIN. The dup-guard then enforces that the composite is actually
unique *in practice* — a defensive check on top of the `@Unique` metadata.

## Impacts

| Area | Impact |
|---|---|
| `MatchByOptions` | already `keyof | readonly keyof[]` — no type break for callers; arrays >1 now legal in bulk (were ERR09) |
| Temp table | +`row_ix` + extra identity cols — negligible, recomputed batch size |
| Statements per bulk op | +1 guard raise query (fails only on ambiguity) |
| Error matrix | ERR09 (illegal selector/heterogeneous payload), ERR10 (ambiguous item or incoherent identity), ERR01/03 unchanged |
| Callers | `config_entries_dal.bulkUpdate(matchBy:"uuid")` → can drop matchBy (uuid auto); no breaking change for the rest |
| Performance | same statement count class as today; guard is one aggregate scan of an indexed join — proportional to tmp size, not a cursor |

## Acceptance criteria

- `updateMany`/`deleteMany`/`restoreMany` accept auto id/uuid
  identity per item, no `matchBy` needed when `uuid` is in every item.
- `matchBy` array composite selectors work; single prop of a composite group
  → ERR09 pre-SQL.
- Ambiguous item (identity matches >1 row) → ERR10, batch rolled back,
  DETAIL carries `row_ix` list.
- Incoherent id+uuid item → ERR10 (classified by the extended diagnose).
- Heterogeneous identity (uuid in some items only) → ERR09.
- No per-item queries on the happy path: exactly the same statement count as
  today +1 guard statement; batching unchanged.
- Tests: matrix mirroring the single-row identity tests + ambiguous-identity
  rollback proof (`SELECT count(*)` unchanged after failure).
- Docs: `repository.mdx` bulk section + `dal-conventions` updated.

## Open questions

1. `row_ix` naming: `row_ix` vs `item_ix` — cosmetic, pick `row_ix`.
2. Should a tmp item matching **0** rows without a version guard still be
   ERR03 (today: silently skipped when no auditable version)? Proposal: yes —
   report vanished items in DETAIL but only raise when the whole batch
   vanished (parity with current diagnose behavior).
3. `hardDeleteMany` does not exist — out of scope; if ever added it must
   reuse the same bulk identity pipeline (no separate implementation).
