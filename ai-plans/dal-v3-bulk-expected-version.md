# Plan — `expected_version` in DAL `*Many` + removal of per-item bulk loops

## Goal

Per-row optimistic concurrency inside bulk ops, so BE bulk endpoints can use
the real `*Many` DAL methods (atomic, temp-table, `BulkResult`) instead of
per-item `repo.delete`/`repo.restore` loops — without losing ERR01/ERR02/ERR03
semantics per row.

## Verified evidence (no assumptions)

- `customers/router.ts:157-176` — `bulkDelete`/`bulkRestore` use
  `runBulkAction` looping `service.deleteCustomer/restoreCustomer`
  → `repo.delete`/`repo.restore` with per-item `version`.
- `config_entries_dal.ts` `bulkSoftDelete` — per-item `findByUuid` (reserved
  check) + per-item `repo.delete`. NOT `deleteMany`.
- `config_entries_dal.ts` `bulkUpdate` — already uses `repo.updateMany`
  (temp table), but sends `{id, value, ...}` — **no version per row**.
- `updateMany`/`deleteMany` carry an explicit TODO in `repository.ts` for
  exactly this: `expected_version` column + `AND t.version = tmp.expected_version`
  + same-transaction stale diagnosis + all-or-nothing rollback.
- `runBulkAction` is NOT transactional: each `repo.delete` commits separately
  → today partial state is really persisted. Atomicity strictly improves this.
- FE: `useBulkActions` sends `{items:[{uuid,version}]}` from selected rows —
  simple bulk actions, not massive imports.
- FE error pipeline: `pushNotification(RFC7807)` → event card →
  `rfc-error-dialog` renders `error.extra.issues` via `JsonTableViewer`.
  `useBulkActions` currently REBUILDS the error dropping `extra` — must
  propagate the full body or issues never reach the dialog.
- US services run on **Bun** (`bun --hot`); BE on Node/Express. Shared mapper
  must be a pure `err → {status, body}` function with zero `node:*` imports
  (`import type` only for Request/Response shapes).

## Design

### DAL — `repository.ts`

1. `updateMany` / `deleteMany`: extend the temp table with an
   `expected_version` column **iff** the entity is auditable (has a VERSION
   column) and every payload row carries `version`.
   - Row missing `version` on an auditable entity → TS `MissingVersionError`
     (ERR02) naming the offending row index — fails fast before the tx.
   - If the caller explicitly opts out (`options.expectVersion === false`?)
     keep the current unguarded path — open question, see below.
   - UPDATE/DELETE join gains `AND t.version = tmp.expected_version`.
   - After the write: `rowCount < count(tmp)` → diagnose in the same tx:
     ```sql
     SELECT tmp.*, t.version AS actual_version, (t.uuid IS NULL) AS vanished
     FROM tmp LEFT JOIN t ON <match>  -- same match predicate
     WHERE t.version IS DISTINCT FROM tmp.expected_version OR t.uuid IS NULL
     ```
     → one `pg_raise`:
     - all missing rows vanished → `ERR03` (record vanished)
     - otherwise → `ERR01` (stale version)
     - DETAIL jsonb: `{entity, table, stale: N, rows: [≤10 {uuid/input_uuid,
       expected_version, actual_version, vanished}]}`
   - `affected` still comes from rowCount; on raise the tx rolls back.
2. `addMany` — no change (no existing row → no version concept).
3. `upsertMany` — conflict path means update: same `expected_version` guard
   applies on the DO UPDATE branch (`ON CONFLICT ... DO UPDATE WHERE
   t.version = tmp.expected_version`), stale rows diagnosed post-write the
   same way. Open question below.
4. `restoreMany` — does not exist. Needed to replace the customers bulk-restore
   loop. Same temp-table shape as deleteMany, guarded by expected_version,
   clears deleted_at/deleted_by, bumps version.
5. Reserved-row rule (config entries): business check stays in the BE DAL
   (`bulkSoftDelete` reads) but inside the **same tx** — or moved into SQL as
   a join predicate raising a business error. Decide per point below.

### BE — endpoints

- `customers/router.ts` bulk-delete/bulk-restore → call `repo.deleteMany` /
  new `repo.restoreMany` (or a service-level wrapper), delete
  `runBulkAction` usage there. Response `200 {received, affected}` on success.
- `config_entries_dal.bulkSoftDelete` → `repo.deleteMany` with per-item
  versions; reserved check stays as a same-tx pre-check (or SQL join —
  see open questions). `bulkUpdate` → pass `version` through to updateMany.
- Error handler already maps ERR01/02/03/04/05/06 + 57014. Add: pass
  `detail.stale/rows` into `extra.issues` for ERR01 bulk raises too.

### FE

- `useBulkActions` — stop rebuilding the RFC object; pass the parsed body
  verbatim to `pushNotification` so `extra.issues` reaches the dialog.
- Success: `pushNotification({ impact: 'NONE', message, scope })` with
  `affected`/`received` counts (toast only, existing convention).

### SDK — shared mapper

- New `src/errors/dal-error-mapper.ts`: pure function
  `mapDalError(err): { status: number; body: Rfc7807Body } | null` covering
  ERR01–ERR07 + 57014 + generic codes. **Zero `node:*` imports.** BE calls it
  inside `errorHandler` replacing the per-code branches; US services call it
  in their `sendError`/catch paths (emailsender, ai).

## Decisions (all resolved)

1. **Strict version guard** — `version` is mandatory on auditable entities for
   updateMany/deleteMany/restoreMany; missing → ERR02 per-row. `addMany`
   unchanged (no existing row to guard).
2. **`upsertMany` parked** — method + tests commented in DAL/SDK until
   guarded-vs-sync semantics is decided. Its ON CONFLICT DO UPDATE branch
   currently overwrites without a version check.
3. **`restoreMany` added** — temp-table + version guard + BulkResult, mirrors
   deleteMany; clears deleted_at/deleted_by, bumps version, sets audit fields.
4. **`reserved` stays vertical** — not a DAL concern. `bulkSoftDelete` does ONE
   set-based read (uuid IN + reserved filter) then `deleteMany`. Same race
   window as single softDelete — no regression.
5. **`runBulkAction` commented** — kept for reference; both customer endpoints
   migrated to DAL *Many.

## Status — IMPLEMENTED

- DAL: expected_version temp-table guard + ERR01/02/03 per-row detail (≤10)
  on updateMany/deleteMany/restoreMany; pre-write diagnosis inside the tx;
  post-write rowCount anti-race safeguard. 192/192 tests.
- BE: customers bulk-delete/restore → deleteMany/restoreMany;
  config bulkSoftDelete → reserved read + deleteMany; bulkUpdate passes
  caller version → updateMany; errorHandler delegates to SDK mapDalError;
  extra.issues fed by bulk detail rows. tsc clean.
- FE: useBulkActions sends {uuid,version} items, propagates full RFC body
  (extra.issues → RfcErrorDialog table), success via pushNotification
  impact NONE. Config page + ConfigList updated; api.bulkUpdateConfigEntries
  preserves structured errors.
- SDK: src/errors/dal-error-mapper.ts (pure, zero node:*), exported from
  index, integrated in http-server catch + BE errorHandler + US routes
  (emailsender providers/config, ai reindex). 10 mapper tests green.
- US: emailsender providers-route + config-route, ai composite-route —
  mapDalError in catch paths. tsc clean both.

## Acceptance criteria

- Every `*Many` rejects stale/vanished rows atomically with ERR01/ERR03 +
  ≤10 detail rows in `extra.issues`.
- All 4 bulk endpoints use `*Many` DAL methods; per-item loops removed
  (except reserved check if we keep it — inside the tx).
- Success responses return `{received, affected}`; FE shows success toast
  and error details dialog works for bulk failures.
- `mapDalError` in SDK, used by BE handler and US `sendError`.
- All DAL tests green + new tests: stale-version ERR01 bulk, vanished
  ERR03 bulk, missing-version ERR02 bulk, detail cap 10, rollback.
