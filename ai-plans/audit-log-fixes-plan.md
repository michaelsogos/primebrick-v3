# Audit Log Fixes Plan — JSONB rendering, delta completeness, bulk audit, timestamp consistency

## Context

During testing of the auth_configurations version history, four issues were identified:

1. **JSONB rendering in VersionHistoryPanel**: `type_config` is the first JSONB field with audit trail. The current `formatValue()` does `String(value)` which renders a long unformatted JSON string. We already have **shiki** (v4.3.1) in the FE for syntax highlighting, used in `rfc-error-dialog.svelte`, and a **JsonTableViewer** component for structured JSON display.

2. **Delta excludes audit fields**: The DAL delta calculator does NOT explicitly exclude `created_at`, `created_by`, `deleted_at`, `deleted_by`. For INSERT, `created_at`/`created_by` are added to the SQL INSERT but NOT to the `rec` object passed to `calculateDelta()`, so they're absent from the delta. For UPDATE, `calculateDeltaWithForcedFields` forces `updated_at`/`updated_by` but not `created_at`/`created_by`/`deleted_at`/`deleted_by`. The result: the audit delta is incomplete — it doesn't show the full state of the record at creation time.

3. **Bulk update has no audit log**: `Repository.updateMany()` performs a TEMP TABLE → UPDATE FROM → COMMIT but does NOT call `writeAudit()`. The bulk update silently bypasses audit trail. This is a DAL-level bug.

4. **Timestamp incongruence in seed**: The manual seed audit records use a hardcoded `changed_at = '2026-05-18T14:27:00Z'` but the actual `created_at`/`updated_at` in the auth_configurations rows are different dates (June/July 2026). The audit `changed_at` should match the actual `created_at` of each row.

## Findings

### 1. Existing syntax highlighting / JSON rendering in FE

**Already in use:**
- **shiki** v4.3.1 (package.json) — used in `src/lib/components/ui/rfc-error-dialog.svelte` (lines 16, 61-72)
  - `createHighlighter({ themes: ['light-plus'], langs: ['json'] })`
  - `highlighter.codeToHtml(jsonString, { lang: 'json', theme: 'light-plus' })`
  - Renders as `{@html highlightedJson}` inside a `<pre>` container
- **JsonTableViewer** — `src/lib/components/ui/JsonTableViewer.svelte`
  - Renders JSON as an expandable key/value table with badges for nested objects
  - Recursive (self-import for nested levels)
  - Uses shadcn Table components

**No other highlight libraries** (no prismjs, no highlight.js).

### 2. DAL delta calculator behavior

**`calculateDelta(oldEntity, newEntity)`** (`primebrick-dal-v3/src/audit/delta-calculator.ts`):
- Iterates over all keys in `newEntity`
- Compares `JSON.stringify(oldVal) !== JSON.stringify(newVal)`
- Includes changed fields in delta
- Does NOT exclude any field by name

**INSERT path** (`repository.ts` line 450):
```typescript
const delta = calculateDelta({}, { ...rec, updated_at: now, updated_by: actor });
```
- `rec` = the fields passed by the caller (business fields only)
- `updated_at` and `updated_by` are added explicitly
- `created_at` and `created_by` are added to the SQL INSERT columns (lines 420-429) but NOT to `rec`
- Result: delta has business fields + `updated_at` + `updated_by`, but NOT `created_at`, `created_by`, `uuid`, `id`, `version`

**UPDATE path** (`repository.ts` lines 775-779):
```typescript
const forcedFields: string[] = [updated_at, updated_by];
const delta = calculateDeltaWithForcedFields(oldRecord, updated, forcedFields);
```
- `oldRecord` = full SELECT * before update
- `updated` = full RETURNING * after update
- Forces `updated_at` and `updated_by` into delta even if unchanged
- `created_at`, `created_by`, `deleted_at`, `deleted_by` are in both old and new — if unchanged, they don't appear in delta (correct behavior for UPDATE)
- `version` is skipped by the VersionHistoryPanel (`if (field === 'version') continue`)

### 3. updateMany audit gap

**`updateMany()`** (`repository.ts` lines ~1630-1754):
- Uses TEMP TABLE strategy: `BEGIN → CREATE TEMP TABLE → batch INSERT → UPDATE FROM → COMMIT`
- Returns `result.rows` (updated rows via `RETURNING *`)
- Does NOT fetch old records before update
- Does NOT call `options.audit.writeAudit()`
- The `options.audit` port is not even checked

**Atomicity concern**: The user requires that if audit is added to bulk update, it must be atomic — the audit INSERT must happen in the same transaction as the UPDATE. The current `writeAudit()` is fire-and-forget (`.catch()`) which is NOT atomic.

**Possible atomic approach**:
1. Before the UPDATE, fetch old records: `SELECT * FROM table WHERE id IN (...)` — can use the temp table's match column values
2. After `UPDATE ... RETURNING *`, compute deltas for each row
3. INSERT all audit rows in a single batch INSERT into the audit table (within the same transaction)
4. COMMIT — if any step fails, ROLLBACK undoes both the UPDATE and the audit INSERTs

This keeps the TEMP TABLE strategy and adds audit atomically.

### 4. Seed timestamp incongruence

The manual seed in the fire-and-forget script uses:
```sql
INSERT INTO auth_configurations_audit (..., changed_at, ...)
SELECT ..., '2026-05-18T14:27:00Z', ...
FROM auth_configurations
```

But the actual `created_at` values in `auth_configurations` are different per-row (June/July 2026). The audit `changed_at` should use `created_at` from the source row:
```sql
SELECT ..., created_at, ... FROM auth_configurations
```

## Proposed changes

### Phase 1: FE — JSONB rendering in VersionHistoryPanel

**Decision needed from user**: shiki highlighted `<pre>` block vs JsonTableViewer expandable table.

**Option A — shiki (syntax highlighted code block)**:
- Reuse the existing pattern from `rfc-error-dialog.svelte`
- `createHighlighter({ themes: ['light-plus'], langs: ['json'] })`
- `JSON.stringify(value, null, 2)` → `codeToHtml()` → `{@html}`
- Pros: compact, syntax-colored, familiar pattern
- Cons: requires `{@html}` (XSS-safe since data is from our own BE), shiki bundle size

**Option B — JsonTableViewer (expandable table)**:
- Reuse existing `JsonTableViewer.svelte`
- Renders as key/value table with expandable nested objects
- Pros: structured, interactive, no `{@html}`
- Cons: takes more vertical space, may be heavy for deeply nested JSON

**Option C — vanilla pretty-print**:
- `JSON.stringify(value, null, 2)` in a `<pre class="font-mono text-xs">`
- No syntax color, just indentation
- Pros: zero dependency, zero risk
- Cons: no syntax highlighting

**Implementation** (regardless of option):
- File: `src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte`
- Modify `formatValue()` function (line ~223)
- Add a check: if value is an object (not array, not null), use the chosen rendering method
- The `delta.newValue` and `delta.oldValue` are currently strings — need to support HTML or structured rendering
- May need a new `isJson` flag in the description object, similar to `isBadge`/`isColor`

### Phase 2: DAL — Include all fields in INSERT delta

**File**: `primebrick-dal-v3/src/repository/repository.ts`, line 450

**Current**:
```typescript
const delta = calculateDelta({}, { ...rec, updated_at: now, updated_by: actor });
```

**Proposed**:
```typescript
const delta = calculateDelta({}, { ...rec, created_at: now, created_by: actor, updated_at: now, updated_by: actor });
```

This ensures the INSERT audit delta includes `created_at` and `created_by` alongside `updated_at` and `updated_by`.

**Note**: `uuid`, `id`, and `version` are generated by the DB (`RETURNING *`) and are not in `rec`. To include them, we'd need to use the `inserted` record instead of `rec`:
```typescript
const delta = calculateDelta({}, inserted as Record<string, unknown>);
```
This would include ALL columns from the returned row. This is the most complete approach.

**Decision needed**: use `inserted` (full row, includes uuid/id/version) or `{ ...rec, created_at, created_by, updated_at, updated_by }` (business fields + audit stamps)?

### Phase 3: DAL — Add atomic audit to updateMany (pure SQL, no Node.js memory)

**File**: `primebrick-dal-v3/src/repository/repository.ts`, `updateMany()` method

**Principle**: All delta computation happens in PostgreSQL. Zero records fetched into Node.js memory. Zero JS-side delta calculation. The entire operation is a single SQL statement using CTEs.

**Why not fetch into Node.js**: The user explicitly rejected this approach. Fetching all old records + all new records into Node.js to compute deltas with `calculateDeltaWithForcedFields` is not scalable for large batches. It doubles memory usage, adds round-trips, and the JS delta calculator is unnecessary when PostgreSQL can compute JSONB diffs natively.

**PostgreSQL CTE snapshot guarantee**: All CTEs in a single statement see the same snapshot. A `SELECT` CTE sees the pre-UPDATE state. An `UPDATE ... RETURNING` CTE sees the post-UPDATE state. This allows computing old-vs-new deltas in a single atomic statement without explicit locking.

**Proposed approach** — single SQL statement with 3 CTEs:

The `jsonb_build_object(...)` expression is **generated dynamically** from `meta.columns` — the same entity metadata that drives all other DAL operations. The DAL iterates over `Object.values(meta.columns)` and emits one `CASE WHEN ... IS DISTINCT FROM ...` clause per column. This makes the audit delta work for **any auditable entity**, not just `auth_configurations`.

```sql
WITH old AS (
  -- CTE 1: snapshot of rows BEFORE update (same snapshot as the UPDATE CTE)
  -- INNER JOIN with temp table — planner can use hash/merge join, no subquery scan
  SELECT t.*  -- all columns, dynamic from entity metadata
  FROM ${table} t
  INNER JOIN ${tmpName} tmp ON t.${matchCol.sqlName} = tmp.${matchCol.sqlName}
),
upd AS (
  -- CTE 2: the actual UPDATE (returns post-update rows)
  UPDATE ${table}
  SET ${setCols.join(", ")}
  FROM ${tmpName} tmp
  WHERE ${table}.${matchCol.sqlName} = tmp.${matchCol.sqlName}
  RETURNING *
),
deltas AS (
  -- CTE 3: compute JSONB delta per row, entirely in SQL
  -- The jsonb_build_object(...) argument list is GENERATED from meta.columns
  SELECT
    u.${pkCol.sqlName}  AS entity_id,
    u.uuid              AS entity_uuid,
    'UPDATE'           AS action,
    $now                AS changed_at,
    $actor              AS changed_by,
    u.${versionCol.sqlName} AS version,
    jsonb_strip_nulls(jsonb_build_object(
      -- Dynamically generated: one CASE per column in meta.columns
      -- For each column c in meta.columns:
      '${c.sqlName}', CASE WHEN o.${c.sqlName} IS DISTINCT FROM u.${c.sqlName}
        THEN jsonb_build_object('old', o.${c.sqlName}, 'new', u.${c.sqlName}) END,
      -- ... repeated for every column in the entity
      -- Excluded from UPDATE delta: created_at, created_by, deleted_at, deleted_by
      -- (identified by AuditableFieldType, not by hardcoded names)
    )) AS delta
  FROM upd u
  INNER JOIN old o ON o.${matchCol.sqlName} = u.${matchCol.sqlName}
)
-- Main statement: INSERT audit records
INSERT INTO ${auditTable} (entity_id, entity_uuid, action, changed_at, changed_by, version, delta)
SELECT entity_id, entity_uuid, action, changed_at, changed_by, version, delta
FROM deltas
```

**Dynamic generation** (TypeScript, in `updateMany`):

```typescript
// Build the jsonb_build_object(...) argument list dynamically from entity metadata
const deltaColumns = Object.values(meta.columns).filter((c) => {
  // Exclude audit-only fields that don't change during UPDATE:
  // CREATED_AT, CREATED_BY, DELETED_AT, DELETED_BY
  // (identified by AuditableType enum, NOT by hardcoded column names)
  return c.auditableType !== AuditableFieldType.CREATED_AT
      && c.auditableType !== AuditableFieldType.CREATED_BY
      && c.auditableType !== AuditableFieldType.DELETED_AT
      && c.auditableType !== AuditableFieldType.DELETED_BY;
});

const deltaExpr = deltaColumns
  .map((c) => {
    const col = quoteIdent(c.sqlName);
    return `'${c.sqlName}', CASE WHEN o.${col} IS DISTINCT FROM u.${col} THEN jsonb_build_object('old', o.${col}, 'new', u.${col}) END`;
  })
  .join(",\n      ");

const deltaSql = `jsonb_strip_nulls(jsonb_build_object(${deltaExpr}))`;
```

This produces the exact same SQL as the hardcoded example above, but for **any entity** — `customers`, `organizations`, `role_mappings`, `user_profiles`, or any future auditable entity. The column list, exclusions, and match key all come from `meta.columns` and `meta.auditableType`.

**Key properties**:
- **Atomic**: Single SQL statement. If the audit INSERT fails, the UPDATE is rolled back (statement-level atomicity). No explicit BEGIN/COMMIT needed for this statement.
- **Scalable**: No Node.js memory usage. PostgreSQL handles the delta computation, join, and INSERT entirely server-side.
- **No round-trips**: One SQL statement instead of SELECT + UPDATE + INSERT (3 round-trips).
- **Delta format**: Same `{ old, new }` JSONB structure as the JS `calculateDelta` output. `jsonb_strip_nulls` removes unchanged fields (where CASE returns NULL).
- **All fields included**: Every column is in the delta. `created_at`, `created_by`, `deleted_at`, `deleted_by` are excluded from UPDATE delta (they don't change during UPDATE) but included in INSERT delta (Phase 2).

**Dynamic generation**: The `jsonb_build_object(...)` expression is generated dynamically from `meta.columns`. The DAL iterates over entity columns and generates the `CASE WHEN ... IS DISTINCT FROM ...` clauses. This makes it work for any auditable entity, not just `auth_configurations`.

**Integration with existing updateMany**:
- The current `updateMany` uses: `BEGIN → CREATE TEMP TABLE → batch INSERT into temp → UPDATE FROM temp RETURNING * → COMMIT`
- The new approach replaces the `UPDATE FROM temp RETURNING *` step with the CTE statement above
- The `BEGIN ... COMMIT` wrapper remains (for the CREATE TEMP TABLE + batch INSERT steps)
- The CTE statement itself is atomic, but it runs inside the existing transaction

**Revised flow**:
1. `BEGIN`
2. `CREATE TEMP TABLE` (same as now)
3. Batch INSERT into temp table (same as now)
4. **NEW**: Execute the CTE statement (old + upd + deltas + INSERT audit) — replaces the plain `UPDATE FROM temp RETURNING *`
5. `COMMIT`
6. Return updated rows (captured from the `upd` CTE via `RETURNING *` — need to also return them to Node.js)

**Returning updated rows to Node.js**: The CTE statement's primary clause is `INSERT INTO audit`. To also return the updated rows, we can either:
- **Option A**: Add a `RETURNING *` to the INSERT (returns audit rows, not useful) — NO
- **Option B**: Split into two statements within the same transaction: first the CTE (UPDATE + audit INSERT), then a `SELECT * FROM ${table} WHERE ${matchCol} IN (SELECT ${matchCol} FROM ${tmpName})` — but temp table is gone after the CTE
- **Option C**: Keep the `UPDATE ... RETURNING *` as a separate statement, then do the audit INSERT as a separate statement using a second temp table that stores old+new pairs — more complex
- **Option D** (preferred): Use the CTE statement but capture the `upd` output. In PostgreSQL, when the primary statement is an INSERT, you can't also RETURN the CTE data to the client. So we split: first `SELECT ... INTO temp_old` (or use the existing temp table to also store old values), then `UPDATE ... RETURNING *` (returns to Node.js), then `INSERT INTO audit SELECT ... FROM temp_old JOIN ...`. Three statements, same transaction, still atomic.

**Option D detail** (preferred — keeps RETURNING * for the caller):
1. `BEGIN`
2. `CREATE TEMP TABLE ${tmpName}` (same as now)
3. Batch INSERT into `${tmpName}` (same as now)
4. `CREATE TEMP TABLE ${tmpOldName} AS SELECT t.* FROM ${table} t INNER JOIN ${tmpName} tmp ON t.${matchCol.sqlName} = tmp.${matchCol.sqlName}`
5. `UPDATE ${table} SET ... FROM ${tmpName} tmp WHERE ${table}.${matchCol.sqlName} = tmp.${matchCol.sqlName} RETURNING *` → returns updated rows to Node.js (same as now)
6. `INSERT INTO ${auditTable} (entity_id, entity_uuid, action, changed_at, changed_by, version, delta) SELECT u.${pkCol.sqlName}, u.uuid, 'UPDATE', $now, $actor, u.${versionCol.sqlName}, jsonb_strip_nulls(jsonb_build_object(${deltaExpr})) FROM ${table} u INNER JOIN ${tmpOldName} o ON u.${matchCol.sqlName} = o.${matchCol.sqlName}` — where `${deltaExpr}` is the dynamically generated `CASE WHEN ... IS DISTINCT FROM ...` expression from `meta.columns`
7. `COMMIT`

This is 3 SQL statements (steps 4, 5, 6) instead of 1, but all within the same transaction. Step 4 captures old state, step 5 does the UPDATE and returns rows, step 6 computes deltas and inserts audit records. All atomic.

**Constraints**:
- Must use the audit table name from entity metadata (`@AuditTrail()` decorator → `meta.auditTableName`)
- Must handle the partitioned audit table (INSERT goes into the parent, PG routes to partition automatically)
- `options.audit` port must be checked — if not provided, skip audit (skip steps 4 and 6)
- `actor` must be checked — if undefined, skip audit
- The `jsonb_build_object` argument limit is 100 (50 key-value pairs). Entities with >50 columns would need splitting. `auth_configurations` has 17 columns — well within limits.

### Phase 4: Fix seed timestamp incongruence

**File**: `primebrick-be-v3/db-meta/fire-and-forget/add_config_table_standard_columns.sql`

**Current** (line ~260):
```sql
INSERT INTO public.auth_configurations_audit (..., changed_at, ...)
SELECT ..., '2026-05-18T14:27:00Z', ...
FROM auth_configurations
```

**Proposed**:
```sql
INSERT INTO public.auth_configurations_audit (..., changed_at, ...)
SELECT ..., created_at, ...
FROM auth_configurations
```

This makes `changed_at` match the actual `created_at` of each row.

**Also fix**: The init patch seed (`00000000000000_init_database.sql`) should use the same `created_at` value for both the config row and the audit row. Currently the INSERT uses `DEFAULT now()` for `created_at`, so the audit seed should also use `now()` or the same hardcoded timestamp.

**Also fix**: The seed delta should include `created_at`, `created_by`, `updated_at`, `updated_by` to match the corrected DAL behavior from Phase 2.

**Also**: Re-run the seed on the existing DB to fix the 22 already-seeded audit records (delete and re-insert, or UPDATE the `changed_at` to match `created_at`).

## Acceptance criteria

1. VersionHistoryPanel renders JSONB fields (`type_config`) with syntax highlighting or structured table display (not raw `String(value)`)
2. DAL INSERT audit delta includes `created_at`, `created_by`, `updated_at`, `updated_by` (and optionally `uuid`, `id`, `version`)
3. `updateMany()` writes audit records atomically within the same transaction as the UPDATE
4. Seed audit records have `changed_at` matching the actual `created_at` of each row
5. All builds pass (SDK, BE, FE, DAL)
6. `svelte-check` passes with 0 errors
7. Manual verification: clicking version badge on a config entry shows version history with correctly formatted JSONB values and correct timestamps

## Open questions for user

1. **JSONB rendering**: shiki highlighted `<pre>` (Option A), JsonTableViewer expandable table (Option B), or vanilla pretty-print (Option C)?
2. **INSERT delta completeness**: include full returned row (`inserted`, with uuid/id/version) or just business fields + audit stamps?
3. **Bulk audit batching**: for the audit INSERT in `updateMany`, should we batch the same way as the temp table INSERT (auto-batch under PG parameter limit)?
