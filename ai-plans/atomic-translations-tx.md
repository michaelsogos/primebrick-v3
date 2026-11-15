# Atomic entity+translations writes — tx standard, `{entity, translations}` payload, preview UX

## Status
Approved design (user decisions applied). Empirical — all facts verified in code/DB.

## User decisions
1. **TX**: `runInTransaction(pool, fn)` helper exported from `@primebrick/dal-pg` + `tx?: PoolClient` param on Dal write methods (no signature churn on Repository — `Repository(Queryable)` already tx-ready).
2. **Payload**: **`{entity: {...}, translations?: [...]}` wrapper — breaking change accepted.** Plan includes immediate re-standardization of affected callers + documentation in BOTH agent docs and user docs.
3. **allowCreate (form, no AI)**: typed new key → **key only, zero translation rows** — implicitly "translations done later". Future (separate session): CTA to launch a translation assistant + a right-panel sheet for manual translation CRUD — **out of scope here, noted as future work**.
4. **Preview semantics**: approved langs → rows created at save; rejected → key in JSON only, no rows.
5. **Permission**: translation writes require `TRANSLATIONS_MANAGE` even when piggybacked inside an entity payload (reads stay AUTHENTICATED_USER).
6. **Conflict — refined by user (final)**: `createIfAbsent` becomes a standard **optional option on `Repository.add()`** — default `true` = current strict INSERT (fails on unique conflict, NOT idempotent); `createIfAbsent: false` → `INSERT … ON CONFLICT DO NOTHING` (bare, no target — covers any unique violation). Idempotent at **statement level**: a duplicate row is skipped, the tx survives. Inside the entity-create tx we pass `createIfAbsent: false`. UPDATEs keep **optimistic concurrency**: version mismatch → PG `RAISE ERR01` → whole tx rolls back → `error-handler.ts` maps `err.code === 'ERR01'` → **409 RFC7807** (`urn:primebrick:err01`, severity HIGH) in the FE error panel. Verified: ERR01/ERR02/ERR03 mappings exist; `repo.upsert` does `DO UPDATE` — NOT used here.

## Verified facts
- `Repository(db: Queryable)` — Pool or PoolClient; bulk ops internally use `getClient()`+BEGIN already. `getClient()` is private; no exported tx helper.
- `TranslationsDal`/`ConfigEntriesDal` hold `this.repo = new Repository(pool)` — need `tx?` plumbing.
- `TranslationsCache.invalidate` must run AFTER commit (defer inside tx).
- Unique partial `(key,language)` index on all translations tables.
- `config-entries.router.ts` create: flat zod body → `dal.add(fields, userUuid)`.
- FE atomic point: `configurations/create/+page.svelte` `onUpdate` → `createConfigEntry` — TypeConfigBuilder's only consumer.
- `handleNewErrorMessage` inserts at propose time → must become pending-queue.
- `config_key` sheet prop is a snapshot string → getter like `current_json`.

## Implementation

### Phase 1 — DAL (`primebrick-dal-v3`)
```ts
// src/repository/transaction.ts (new) — exported from index
export async function runInTransaction<T>(
  pool: Pool,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { client.release(); }
}
```

### Phase 2 — BE Dal layer
- `TranslationsDal.create/update/softDelete/restore(moduleCode, …, tx?: PoolClient)` → `const repo = tx ? new Repository(tx) : this.repo`.
- When `tx` provided: collect `(schema, language)` invalidations in a per-call list instead of immediate `cache.invalidate`; caller flushes post-commit via new `invalidatePending()` or explicit invalidate in the route.
- `Repository.add(entity, data, {actor, tx?, createIfAbsent?: boolean})` — new optional flag: default `true` (current strict INSERT); `false` appends bare `ON CONFLICT DO NOTHING` — statement-level idempotent, any unique violation skips the row without aborting the tx. `assertKeyModuleBoundary` still applies before the insert. Tx flush path passes `createIfAbsent: false`.
- `ConfigEntriesDal.add/update(…, tx?)` same plumbing.

### Phase 3 — BE payload standard + config_entry create
- Shared zod shape for the standard: `{ entity: T; translations?: TranslationRow[] }` where `TranslationRow = {key, language, value}`.
- `CreateBodySchema` → `{entity: ConfigEntryCreateBody, translations?: TranslationRow[]}`.
- Router `create`:
  1. Validate entity part (existing checks: duplicate key, serializeConfigValue, validateConfigValue).
  2. If `translations?.length`: require `TRANSLATIONS_MANAGE` → `runInTransaction`: `dal.add(entity, tx)` + per row `translationsDal.createIfAbsent(moduleCode, row, tx)` (module resolved per row — assistant emits `custom.*` → 'custom').
  3. Post-commit: flush cache invalidations; 201.
  4. No `translations` → legacy path (still inside `{entity}` wrapper — breaking change).
- Update `update`/`bulk-update` endpoints to the same `{entity, translations?}` standard? — decide per-endpoint; at minimum document the convention.

### Phase 4 — FE pending queue + payloads
- `src/lib/i18n/pending-translations.svelte.ts` — singleton: `addPending(key, {lang:value})`, `dropPending(key)`, `takeAll(): TranslationRow[]`, `clear()`.
- `handleNewErrorMessage` (panel): translate ×7 → **preview card** → accept → `addPending` + `proposeCandidate`. Reject → `proposeCandidate` only (key in JSON, no rows).
- `configurations/create/+page.svelte`: `onUpdate` → `createConfigEntry({entity: params, translations: takeAll()})`; page destroy/cancel → `clear()`.
- `api.ts`: `createConfigEntry` body shape → `{entity, translations?}`; `createTranslation` unchanged (direct admin CRUD).
- allowCreate typed-new keys: **no pending rows** (decision 3) — only ensure the key lands in the JSON. Exception: nothing to do — current flow already does this.

### Phase 5 — Translation preview card (assistant)
New card kind `translations_preview` (extends key_picker flow):
- Header: language dropdown (UI_LANGS).
- Body: translated text for selected language.
- Footer: per-lang Approve toggle + counter `approved/total` + "Approve all" CTA.
- Actions: "Accept approved" → `addPending(key, approvedLangs)` + `proposeCandidate`; "Reject" → bubble informs key set anyway, translations later → `proposeCandidate` with key.

### Phase 6 — Standardization + docs (mandatory per decision 2)
- Re-standardize callers of config_entry create to `{entity, translations}` (only `configurations/create` today — verified single caller).
- Document the `{entity, translations?}` write convention + `runInTransaction` pattern in:
  - `primebrick-be-v3/AGENTS.md` (or `.devin/rules/` — agent doc),
  - `docs/user-guide/` relevant MDX (user doc) — both BE and DAL repos as appropriate.

## Verify
- DAL: `pnpm test` (177 baseline) + new unit test for `runInTransaction` rollback/commit.
- BE: `tsc` clean; live: create config_entry with translations → single tx (rows in `custom.translations` + config row), duplicate key → row skipped + tx survives (verify 201 + config row created), missing TRANSLATIONS_MANAGE → 403, forced version conflict on entity update → 409 RFC7807 `urn:primebrick:err01` + tx rolled back (no orphan translation rows — verify count before/after).
- FE: `pnpm check` + tests; E2E-ish manual: key_picker → new message → preview card → approve 3/7 → apply → save → 3 rows only; discard → zero rows.

## Future work (noted, not in scope)
- CTA to launch a dedicated translation assistant + right-panel sheet for manual translation CRUD (per user note "Da fare").
- Other entity endpoints adopting `{entity, translations?}` + tx writes.
