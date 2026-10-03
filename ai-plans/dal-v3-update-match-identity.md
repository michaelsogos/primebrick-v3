# Plan — `update()` match semantics: identity-based, guarded, ERR09/ERR10

## Goal

`update()` must guarantee — by construction, not by caller discipline —
that it writes **exactly one row**. Match is derived from identity fields
in the payload (`id`, `uuid`, or an explicit `matchBy` array of `@Unique`
props), never from arbitrary non-unique columns. Illegal selectors fail
pre-SQL (`ERR09`); incoherent or ambiguous identity fails atomically in the
same statement (`ERR10`). Scope: **all single-row writes** — `update()`,
`delete()`, `restore()`, `hardDelete()` (shared `resolveMatchColumn` → same
multi-row hazard). `*Many` keep the current mechanism (follow-up).

## Verified facts (empirical, from this session)

- `resolveMatchColumn` (repository.ts:75) — `matchBy` is a **single** prop
  key; absent → `@Key` (`id`). No uniqueness validation whatsoever.
- Empirical proof of the hazard: `matchBy:"name"` on two rows sharing
  `name` → **both rows updated**, only the first returned (silent
  multi-row write). Logged by the error-codes suite.
- `matchBy` callers (BE ~35 sites + US): all use `@Unique`/`@Key` columns
  (`uuid`, `id`, `code`, `idp_role`, `idp_code`, `credential_id`) EXCEPT:
  - `mfa_action_authorizations_dal:84` → `jti` — `@Column` in the entity,
    but the DB **already has** `mfa_action_authorizations_jti_uq` UNIQUE
    INDEX (init SQL). Fix = declare `@Unique` in the entity.
  - US `webhook-service:50` → `provider_message_id` — plain nullable
    column, **no unique index** in `emailsender` DDL. The caller cannot
    use `uuid` (Brevo's webhook payload carries only `message-id`).
    Fix = `@Unique` + new UNIQUE INDEX patch (Brevo message-ids are
    per-message unique).
- `extractMatchValue` removes the match prop from the SET clause (a match
  column can't also be a SET column in the same call).
- Statement-level atomicity: a `pg_raise` inside a CTE aborts the whole
  statement — writes in sibling CTEs are rolled back automatically
  (verified with the ERR04/ERR05 update path).
- CTE evaluation is NOT strictly lazy: `raised` fired before the version
  qual — so guards must gate *content*, not rely on eval order.
- Secondary finding (documented, out of scope): Brevo webhooks arrive via
  direct `POST /webhook` (API-key + RBAC), processed synchronously — no
  NATS queue, no delivery ordering; `status` is overwritten blindly
  (a late `sent` can clobber `delivered`).

## API changes

```ts
// before
options.matchBy?: keyof TEntity & string        // single prop, unchecked

// after (all single-row writes — MatchByOptions widened)
options.matchBy?: ReadonlyArray<keyof TEntity & string>
```

### Match resolution rules (pre-SQL, all raise `ERR09`)

1. Collect identity conditions from the payload:
   - `id` present → `id = $n`
   - `uuid` present → `uuid = $n`
   - each `matchBy[]` prop present → `<prop> = $n`
2. `matchBy` props MUST resolve to `@Unique` or `@Key` columns → else `ERR09`.
3. If a `matchBy` prop belongs to a composite `@Unique` group, **all** props
   of that group must be present in the payload → else `ERR09` (incomplete
   unique key). All group props become AND-conditions.
4. At least one identity condition must exist → else `ERR09` (was
   `VALIDATION` "missing match value" — now standardized to ERR09).
5. All match props are stripped from the SET clause (unchanged semantics).
6. `matchBy` omitted → auto-match on whichever of `id`/`uuid` the payload
   carries (both → AND, i.e. implicit cross-check).

## Error codes

| Code | Raised when | Origin | HTTP |
|------|-------------|--------|------|
| `ERR09` | Illegal/incomplete match selector: non-unique prop, missing group prop, unknown prop, or no identity in payload | TS, pre-SQL (`MatchSelectorError`) | 400 |
| `ERR10` | Identity incoherent or ambiguous: (a) `id`+`uuid` point at different rows, (b) match hit >1 row (defensive CTE guard) | `pg_raise` in-statement / `disambiguateZeroRows` | 409 |

Ordering inside `update()`:
`VALIDATION` (empty payload) → `ERR09` (selector) → `ERR02` (version) →
statement: `ERR10` (multi-match) / `ERR04`/`ERR05` (unique conflict) /
zero-row → disambiguate `ERR01` (stale) / `ERR03` (vanished) / `ERR10`
(mismatched id↔uuid).

## SQL — before / after (real case: customers, uuid+version+email)

### Before (single match column)

```sql
UPDATE public.customers
SET updated_at = $1, updated_by = $2, version = version + 1,
    name = $3, email = $4
WHERE uuid = $5 AND version = $6
RETURNING *
```

### After (uuid payload; matchBy omitted — auto-match)

```sql
WITH matched AS (                                    -- identity only
  SELECT t.* FROM public.customers t
  WHERE t.uuid = $5          -- AND t.id = $x if id also present
),
t0 AS (                                              -- identity + version gate
  SELECT * FROM matched WHERE version = $6
),
guard AS (                                           -- ERR10: >1 row matched
  SELECT public.pg_raise('ERR10',
    'update: ambiguous match — more than one row targeted',
    jsonb_build_object('entity','CustomerEntity','table','public.customers')::text)
  WHERE (SELECT count(*) FROM matched) > 1
),
conflict AS (                                        -- ERR04/ERR05 (unchanged)
  SELECT t.uuid AS c_uuid, t.deleted_at AS c_deleted_at,
         CASE WHEN (t.email IS NOT DISTINCT FROM $4 AND $4 IS NOT NULL)
              THEN 'email' END AS c_constraint,
         CASE WHEN (t.email IS NOT DISTINCT FROM $4 AND $4 IS NOT NULL)
              THEN jsonb_build_object('email', $4::text) END AS c_keys
  FROM t0, public.customers t
  WHERE t.uuid IS DISTINCT FROM $5                   -- self-exclusion on EVERY identity col
    AND (t.email IS NOT DISTINCT FROM $4 AND $4 IS NOT NULL)
  LIMIT 1
),
raised AS (
  SELECT public.pg_raise(
    CASE WHEN c.c_deleted_at IS NULL THEN 'ERR04' ELSE 'ERR05' END,
    'update: unique constraint violation on CustomerEntity',
    jsonb_build_object('entity','CustomerEntity','table','public.customers',
      'uuid', c.c_uuid::text, 'constraint', c.c_constraint, 'keys', c.c_keys)::text)
  FROM conflict c
),
upd AS (
  UPDATE public.customers
  SET updated_at = $1, updated_by = $2, version = version + 1,
      name = $3, email = $4
  WHERE uuid = $5 AND version = $6
    AND NOT EXISTS (SELECT 1 FROM guard)
    AND NOT EXISTS (SELECT 1 FROM raised)
  RETURNING *
)
SELECT * FROM upd
```

Notes:
- `matched` (no version gate) feeds the multi-row `guard` — multi-match is
  illegal regardless of version. `t0` (gated) feeds `conflict`, preserving
  the verified ERR01>ERR04 ordering.
- Self-exclusion in `conflict` extends to ALL identity columns
  (`IS DISTINCT FROM` per col, AND-ed → target row can't self-conflict
  whichever selector was used).
- Composite `matchBy` groups add AND-conditions to `matched`/`t0`/`upd` —
  all three share the same condition list (single builder).
- `matched`/`guard` CTEs are emitted ALWAYS (even with no unique payload —
  the multi-row guard is the core invariant; cost is the same index lookup
  the UPDATE already does).
- Zero-row `rowCount` → extended `disambiguateZeroRows`: probe by each
  identity column — row exists under full match → `ERR01`; exists under a
  *subset* (e.g. uuid ok, id differs) → `ERR10`; nothing → `ERR03`.

## Caller migration

- `matchBy: "uuid"` (~25 sites) → **remove the option entirely** (uuid is
  already in the payload → auto-match). Dead option removed, not adapted.
- `matchBy: "id"` → remove (id in payload auto-matches).
- `matchBy: "code"` / `"idp_role"` / `"idp_code"` / `"credential_id"` /
  `"jti"` / `"provider_message_id"` → `matchBy: ["code"]` etc. (arrays).
- `config_entries_dal.bulkUpdate` (updateMany — out of scope, but switch
  to `matchBy: "uuid"` anyway for the no-internal-id coherence rule).
- Entity fixes: `@Unique` on `jti`; `@Unique` + DDL unique-index patch on
  `sender_logs.provider_message_id`.
- `MatchByOptions<TEntity>` type widened to array — shared by
  `update`/`delete`/`restore`/`hardDelete`; bulk `*Many` keep the string
  form until their own refactor.
- `delete`/`restore`/`hardDelete` get the same `matched`+`guard` CTEs
  (ERR10 multi-row abort) and the same disambiguation (ERR10 mismatch).

## Tests (extend `test/error-codes.test.ts` + match matrix)

- auto-match uuid only / id only / both-correct → success, 1 row, version++
- both present but mismatched → `ERR10`
- `matchBy:["email"]` non-standard unique → success; matchBy unknown prop → `ERR09`
- `matchBy:["name"]` (non-unique) → `ERR09` pre-SQL (regression for the
  silent multi-row bug)
- `matchBy:["grp_a"]` incomplete composite group → `ERR09`;
  `["grp_a","grp_b"]` → works
- payload with NO identity → `ERR09`
- match column also present as SET intent → stripped (unchanged)
- multi-row guard: craft impossible-in-prod case? — keep the CTE tested via
  a duplicated-unique test schema only if safely constructible; otherwise
  unit-verify SQL shape. (Multi-match should be unreachable after ERR09 —
  the guard is a safety net; document that.)
- ordering: ERR09 before ERR02; ERR10-vs-ERR01 disambiguation cases
- all 32 existing error-code tests must keep passing (matchBy array updates)

## Docs

- `dal-conventions.md`, `repository.mdx` (`update` section), error table:
  add ERR09/ERR10; matchBy array form; "update writes exactly one row"
  invariant; matchBy is now OPTIONAL — identity comes from the payload.

## Acceptance criteria

- `update()` can never write >1 row: guaranteed by ERR09 pre-SQL +
  ERR10 CTE guard (defense in depth).
- `matchBy` array-of-unique-props only; `id`+`uuid` payload cross-check.
- All callers migrated; `jti`/`provider_message_id` entities + DDL fixed.
- DAL suite green; BE/US typecheck green; docs updated.

## Open questions — RESOLVED

1. **Scope** → ALL single-row writes (`update`, `delete`, `restore`,
   `hardDelete`) get the identity-match redesign + guards.
2. **ERR09 dedicated** — all match-selector problems (non-unique prop,
   incomplete group, missing identity, unknown matchBy prop) → ERR09 400;
   `VALIDATION`/`UNKNOWN_COLUMN` stay for other payload errors.
3. **Match cols stripped from SET** — a key used for matching is not
   writable in the same call (unchanged semantics).
4. **AND-all strict** — every identity field present in the payload ANDs
   into the match (id+uuid+matchBy) → mismatch surfaces as ERR10.

### Remaining follow-ups (not this plan)

- `*Many` matchBy realignment (same rules, batch form).
- Brevo webhook status-ordering (blind overwrite on out-of-order events).

## Status — IMPLEMENTED (2026-… working tree, not yet committed)

- `update()`/`delete()`/`restore()`/`hardDelete()` migrated to
  `resolveMatchConditions()` (auto id+uuid AND-match, `matchBy` string|array
  of @Unique/@Key props, composite group completion, ERR09 pre-SQL guards).
- `matched`/`guard` CTE in every single-row write → `pg_raise` ERR10 on
  multi-row match (statement-atomic abort).
- `disambiguateZeroRows` extended: full-identity probe + per-field partial
  probe → ERR10 (incoherent identity) / ERR01 / ERR03. Non-auditable path
  probes partial identity via `assertNoPartialIdentity` before NotFoundError.
- `*Many` ops keep the single-column selector; a `matchBy` array with >1
  props → ERR09 (composite bulk match not implemented).
- `MatchByOptions.matchBy`: `keyof | ReadonlyArray<keyof>` — string call
  sites keep working (no breaking caller migration needed).
- SDK `mapDalError`: ERR09 → 422, ERR10 → 412 (+ `match`/`table` extras).
- Entities fixed: `@Unique` on `mfa_action_authorizations.jti` and
  `sender_log.provider_message_id` (+ unique index in emailsender DDL).
- `config_entries` bulkUpdate: FE-facing uuid — `matchBy:"id"` → `"uuid"`,
  router passes `uuid` instead of internal `id`.
- Tests: DAL 237/237 (was 229 + new identity-matrix tests), SDK 278/278,
  BE + emailsender typecheck green.
- Docs: `repository.mdx` (update/delete/restore/hardDelete + MatchByOptions +
  error table), `optimistic-lock.mdx` (disambiguation + ERR09/ERR10),
  `.devin/rules/dal-conventions.md`.
