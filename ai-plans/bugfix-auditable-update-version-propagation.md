# Bugfix: Auditable write version propagation + optimistic concurrency integrity

## Doctrine (locked)

`version` is NOT entity versioning. It is an optimistic-concurrency token meaning:
**"this is the version of the row the caller observed"**. A write must carry the
version the caller holds. If the DB row moved on (`ERR01` → 409), the write is
rejected so the caller can re-observe and decide (refresh, merge, retry).

Rules:

1. **No write ever synthesizes `version` server-side.** Fetching the current
   `version` just to satisfy the guard *eludes* the guard — it makes ERR01
   unreachable (compares DB to itself). A caller must either OBSERVE the row for
   its own logic, or receive `version` from the client. No observation → `ERR02`
   → fix the caller, never the guard.
2. **`ERR02`** = caller bug signal ("you didn't observe"). Never worked around.
3. **Read-modify-write is legitimate ONLY when the read serves the write's own
   logic** (`otp_attempts+1` needs the counter; `logStatusChange` needs
   `oldStatus`; `findByKey` decides add-vs-update). A SELECT done *only* to
   obtain `version` is elusion — forbidden.
4. **`repo.upsert` (single-record) is REMOVED from dal-pg** — commented out.
   Rationale: it was overused as a workaround to dodge "insert or update?"
   decisions. Callers must decide: `add()` when the row is expected absent
   (unique-violation on conflict = correct, visible failure), `update()` with
   observed `version` when it exists. `upsertMany` (bulk temp-table) survives —
   it serves mass-import flows and has its own TODO for the version guard.
5. **Manual/out-of-band writes** (SQL by hand, fire-and-forget, seeds): MUST
   bump `version` + audit fields + flush Redis `dal:{table}:*`. No version bump
   = *silent* staleness (ERR01 can never fire).
6. **Write responses return the full entity** (`RETURNING *` already in dal-pg
   update/delete/restore/add; `DELETE … RETURNING *` verified on PG — returns
   the pre-delete row). The response IS the new observation — FE updates
   store/form from the body, no follow-up GET. **Bulk writes stay 204** — mass
   actions re-GET the list; on version conflict the error body carries the
   stale-entity list only.

## Verified facts (empirical)

- dal-pg `update/delete/restore/hardDelete` → `extractVersion`: `ERR02` absent,
  `ERR01` via `disambiguateZeroRows`; all `RETURNING *`.
- `DELETE … RETURNING *` verified live on PG18: returns pre-delete row; 0 rows
  on no-match.
- `INSERT … ON CONFLICT DO UPDATE … WHERE t.version = $n` verified live:
  matching version → update + 1 row; wrong version → `INSERT 0 0`, 0 rows,
  row untouched → zero-rows → existence check → `ERR01`.
- Error mapping exists: `ERR01`→409, `ERR02`→400, `ERR03`→404,
  `VALIDATION`/`UNKNOWN_COLUMN`/`MULTIPLE_ROWS`→400, `NOT_FOUND`→404.
- `withCache` (SDK): `findById`/`findByUUID` serve Redis rows (TTL 5min);
  `find`/`findAll` DB-first; writes invalidate `delByPrefix` only after success
  → failed guarded write leaves stale row → 409 loop until TTL.
  Key = `dal:{table}:{uuid|@CacheKey|@Key}`. `port.del` exists.
- `@Cached`: `customer`, `organization`, `user_profile`, `ai_model`,
  `ai_cerebellum`, `config_entry`.
- ETag middleware applied ONLY to translations-router; FE caches ETag only on
  `X-PB-Cached` responses → entity writes need no etag work today.
- `repo.findById(` call sites BE: **0**.
- Response waste chain verified: DAL `RETURNING *` → dal void → service void →
  router 204 → FE `loadUser()` re-GET.

## Route taxonomy — user_profile (verified FE callers)

`/auth/*` = AUTH module ops (IdP-coordinated). `/entities/*` = generic CRUD.

Current mess: DELETE on `/auth/users/:uuid`, restore + change-password on
`/entities/user_profile/:uuid`, **two parallel update methods** (`updateUser`
via PATCH /auth/users — DEAD, no FE caller — vs `updateUserProfile` via PUT
entities, which DOES sync Casdoor: displayName/email/avatar).

Target:

| Path | Verb | Handler | Sync |
|---|---|---|---|
| `/api/v1/entities/user_profile/*` | GET meta/list/:uuid/:audit | read-only | — |
| `/api/v1/auth/users` | POST | `createUser` | Casdoor create — critical |
| `/api/v1/auth/users/check-username` | GET | availability | — |
| `/api/v1/auth/users/:uuid` | PATCH | `updateUserProfile` (moved) | Casdoor push — critical |
| `/api/v1/auth/users/:uuid` | DELETE | `deleteUser` | `isForbidden:true` — **critical** |
| `/api/v1/auth/users/:uuid/restore` | POST | `restoreUser` | `isForbidden:false` — **critical** |
| `/api/v1/auth/users/:uuid/change-password` | POST | existing | Casdoor — critical |

- FE changes: users list restore → `/auth/users/:uuid/restore`; users/[uuid]
  form PUT → PATCH `/auth/users/:uuid`; ChangePasswordDialog → auth path.
- Remove dead `updateUser` + PATCH route superseded by moved method; remove
  PUT/POST-restore/POST-change-password from entities router.

## Caller inventory — final disposition

| Write | Observation | Action |
|---|---|---|
| `dismissAuthMethodEnforcer`, `updateMe` → `updateProfile` | FE holds `/auth/me` version | require `version` in body; return fresh row |
| `updateUserProfile` (admin) | entity GET row | client `version` threaded; method moves to `/auth/users` PATCH |
| Casdoor sync fields (`last_synced_at`…) | rides user writes | client `version`, never re-read |
| `updateProfileById` onboarding | wizard loads profile anyway | **method dies** → `updateProfile(uuid, profile.version, …)` — last INT8-id write gone |
| invitation OTP/status ×5 | `invitation` already loaded | signatures take `version`; pass `invitation.version` |
| `markUsed(jti)` | `record` loaded for token_hash | `record.version` |
| passkeys ×4 | `existing`/`pgPasskey` loaded | row `.version` |
| `user_mfa_factors` ×3 | `f` loaded | `f.version` |
| service-registry heartbeat/register (NATS) | `findByCode*` already runs for `oldStatus` | `existing.version` — zero extra queries |
| MCP `toggleEnabled`/`updateByCodeAdmin` | `findByCode` already runs | `existing.version` |
| `config_entries_dal.upsert` → rename `setByKey` | `findByKey` decides add/update — legit RMW | keep pattern; `existing.version` on update path |
| `notification_alert_secret`, `mfa_challenge_signing_secret` lazy-create | callers already `findByKey` → know it's absent | call **`add()`** directly (double-lookup eliminated; unique-violation on race = visible, desired) |
| `role-mapping` create (role.service:164) | expects absent | `add()` |
| `role-mapping` update (role.service:250) | `existing` loaded for merge | `update()` with **client** `version` |
| JIT `resolveInternalUuid` | find→NULL → pure INSERT | `add()` secco; unique-violation on race surfaces (no silent DO NOTHING — impersonation/info-leak vector) |
| entity PUT/DELETE/restore | FE row | client `version` mandatory |

### JIT notes
- `resolveInternalUuid` runs on EVERY authenticated request (auth middleware).
  Find path already correct (observed `row.version` on claims-drift update).
- Soft-deleted profile re-login is near-impossible once Casdoor disable is
  critical (`isForbidden` blocks token issue). Residual edge: if conflict on
  deleted row still happens, `add()` raises unique-violation — visible, correct.

### setup-casdoor
One-shot install script — direct PG Pool, no BE needed (DAL is a library).
Idempotent only for re-run after failure mid-script. Not for post-install use
(resets admin password etc.). Writes via DAL → version/audit ok, Redis
invalidated, but BE in-memory auth-config cache is NOT → rule: run with BE
stopped or restart after.

## Plan

### 1. API writes: client `version`, `200 + entity`

- PUT `entities/:entity/:uuid` → `200 +` row. DELETE `?version=N` → `200 +`
  soft-deleted row. restore `?version=N` → `200 +` row. hardDelete → `200 +`
  pre-delete row (verified `RETURNING *` on DELETE).
- DAL signatures `(uuid, version, …)`; `freshRowByUuid` deleted everywhere.
- FE consumes response entity (drop `loadUser()`-style re-GET on single ops).
- MCP delete/restore tools require `version` arg.

### 2. Internal writes: observed-row `version` param

Per inventory — signatures require `version`; callers pass the row already in
hand. No new SELECTs.

### 3. Remove `repo.upsert` single-record (dal-pg)

- Comment out `upsert` in dal-pg (keep `upsertMany`).
- Breaking changes (all known): `role-mapping-repo:358` → split into
  `addMapping`/`updateMapping`; `user-profile-repo:129/146` → `add()` (drop
  ERR02 retry block); `config_entries_dal.upsert` → internal `findByKey` +
  `add`/`update`, rename `setByKey`.
- Secrets callers (`invitation.service:113`, `mfa.service:291`) → `add()`
  direct (they already proved absence via `findByKey`).
- `mfa.service` should DI `ConfigEntriesDal` instead of `new` ad hoc.

### 4. Bulk: temp-table, no RETURNING to FE, stale-list diagnostics

- `updateMany` stays as-is (unguarded; TODO already in JSDoc — bulk version
  guard deferred: mass imports not ready for the implications).
- `deleteMany` → rewrite to temp-table strategy: temp table with `uuid` column,
  `UPDATE … FROM tmp` soft-delete, same tx. Scalable (join beats `ANY`, no
  65k-param limit). Same TODO comment: no optimistic lock yet.
- In-tx diagnostic pattern (ready when guard lands):
  `SELECT tmp.uuid, CASE WHEN t.uuid IS NULL THEN 'gone' ELSE 'stale_version' END
   FROM tmp LEFT JOIN t ON t.uuid=tmp.uuid AND t.version=tmp.expected_version
   WHERE t.uuid IS NULL OR t.version <> tmp.expected_version`
  → stale list in error detail; throw → tx rollback → all-or-nothing.
  Temp table lives until COMMIT on same client — accessible in-tx.
- Bulk endpoints: 204 on success; on conflict → error body with stale list.

### 5. SDK `withCache`: invalidate on ERR01/ERR03

```ts
repo[name] = async (cls, ...args) => {
  try {
    const result = await fn(cls, ...args);
    await invalidate(cls);
    return result;
  } catch (e) {
    const code = (e as any)?.code;
    if (code === 'ERR01' || code === 'ERR03') {
      const match = args[0] as Record<string, unknown> | undefined;
      try {
        if (typeof match?.uuid === 'string')
          await port.del(`${CacheKeyBuilder.forEntity(cls)}${match.uuid}`);
        else
          await port.delByPrefix(CacheKeyBuilder.forEntity(cls));
      } catch { /* best-effort */ }
    }
    throw e;
  }
};
```

Rebuild `primebrick-v3-sdk` + `primebrick-dal-v3` (`file:` links).

### 6. Casdoor sync becomes critical

`deleteUser`/`restoreUser`: IdP `isForbidden` failure → operation fails (throw),
not best-effort. Order: IdP call first, then local write — or local write in tx
+ IdP before commit semantics; on IdP failure surface 502. Same for
`updateUserProfile`/`createUser` push paths.

### 7. Dead code removal

Delete `src/db/repository/` (entire dir: repository.ts, query-builder.ts,
dsl.ts, auditable-joins.ts, auditable-types.ts, audit-join-helper.ts, types.ts,
smoke-sql-customers.ts, README.md) + `src/db/dal-gateway.ts` — verified dead
island. Plus dead `updateUser`/PATCH route per §routes.

### 8. `findById` deprecation

`@deprecated` JSDoc in dal-pg ("internal/FK use only; API paths use uuid").

### 9. Docs/rules

AGENTS.md + `.devin/rules/`: manual-write rule; observed-version contract;
`?version=` on DELETE/restore; upsert removal rationale; write-response
contract (200+entity single / 204 bulk); ERR02 = caller bug; route taxonomy
(/auth vs /entities); setup-casdoor caveat (in-memory cache, run w/ BE down).

### 10. Verification

- dal-pg/SDK build; BE/US tsc; FE svelte-check.
- Smoke: PUT 200+entity; stale→409; missing→400. DELETE/restore `?version=`
  →200+entity; stale→409; missing→400.
- Cache: seed stale Redis row → ERR01 → `dal:{table}:{uuid}` evicted.
- Internal: OTP verify, passkey signin, invitation onboarding, heartbeat,
  role create/update, secrets lazy-create → no ERR02.
- JIT: two rapid first-login requests → second gets unique violation (visible).
- FE: form save shows new version without extra GET; bulk 204 + re-GET.

---

# APPENDIX — Field Manual: optimistic concurrency, cache, and write semantics

Audience: AI agents and humans writing or reviewing any code that touches a
Primebrick entity write path (BE, FE, US, MCP tools, scripts, manual SQL).

## A. What `version` actually is

`version` is **not** history. It is not a business version, not a revision
number, not an audit counter. Audit trails are retention-managed elsewhere;
`version` has exactly one job:

> **Prove that the row the caller is looking at is still the row in the DB.**

Mechanics (all done by the DAL, never by hand):

- Every auditable entity has `@AuditableField(AuditableFieldType.VERSION)` →
  column `version int`, starts at 1 on INSERT.
- Every UPDATE/DELETE/RESTORE increments it (`version = version + 1`) AND uses
  it in the WHERE/match predicate.
- A logical (soft) delete IS an update: it writes `deleted_at`, `deleted_by`,
  `updated_*` and bumps `version`. It obeys the same guard. No exceptions.

## B. The three error codes — read them correctly

| Code | Meaning | HTTP | What it tells you |
|---|---|---|---|
| `ERR01` | Version supplied, row exists, version does not match | 409 | **Real conflict**: someone wrote after the caller's observation. The caller's data is stale. Correct response: re-observe (GET) then merge/retry — never blind-retry. |
| `ERR02` | Version **absent** on an auditable write | 400 | **Caller bug**: the write path never observed the row. This is a defect signal — fix the data flow, never catch-and-supply. |
| `ERR03` | Version supplied, row gone between read and write | 404 | Row vanished (hard delete / external write). Re-observe. |

DAL generic codes also mapped: `NOT_FOUND`→404, `VALIDATION`/`UNKNOWN_COLUMN`/
`MULTIPLE_ROWS`→400. All handled in `src/http/error-handler.ts`.

**Never** catch `ERR02` to fetch a version and retry — you would be rewriting
the bug report into a bypass. The only legitimate retry is on `ERR01` after a
genuine re-observation (or when the retry itself is a designed conflict path,
e.g. JIT — and even there we now prefer plain `add()`).

## C. The observation contract — who may write

Every write must carry `version` that was *observed*, meaning one of:

1. **Client-observed** — the FE/MCP caller loaded the row (list, GET, audit bar)
   and sends `version` back. This is the only version that matters on API
   writes: it guards THE USER'S view, not the server's.
2. **Caller-observed** — an internal service already loaded the row **for its
   own logic** (it reads fields, checks state, computes deltas). That row's
   `version` is a real observation — pass it.
3. **Never** — a SELECT performed *only* to obtain `version` before a write.
   That is elusion: it silently replaces the caller's observation with the
   current DB state and makes `ERR01` unreachable. This is the bug class this
   whole plan removes (`freshRowByUuid` and friends — all deleted).

Test for legitimacy: **"would this read exist even if `version` didn't?"**
Yes → the read serves the logic → its version is a genuine observation.
No → the read exists only to satisfy the guard → elusion → forbidden.

### Worked examples (all verified in code)

| Case | Verdict | Why |
|---|---|---|
| FE form PUT sends `version` from loaded row | ✅ client-observed | guards user's view |
| `incrementOtpAttempts` passes `invitation.version` | ✅ caller-observed | it read `otp_attempts` to increment it |
| service-registry heartbeat passes `existing.version` | ✅ caller-observed | `findByCode` already runs to read `oldStatus` |
| `markUsed(jti)` passes `record.version` | ✅ caller-observed | record loaded to verify `token_hash` |
| DELETE handler does `SELECT version WHERE uuid` then deletes | ❌ elusion | the read serves no logic — client's version must come via `?version=` |
| `upsertMapping` fetches `findByIdpRole` only for `version` | ❌ elusion | same |
| JIT provisioning `add()` after find→NULL | ✅ correct | caller proved absence; INSERT is the honest write |

## D. HTTP contract

### Single-entity writes — `200 + entity`

```
PUT    /api/v1/entities/{entity}/{uuid}        body: { entity: { …, version } }
DELETE /api/v1/entities/{entity}/{uuid}?version=N
POST   /api/v1/entities/{entity}/{uuid}/restore?version=N
```

- `version` travels **with the identifier**: uuid in path, version in query
  string for DELETE/restore (REST convention — resource in path, params in QS;
  DELETE has no meaningful body). For PUT, inside `entity` as today.
- Response: `200` + the full row (`RETURNING *` — dal-pg already does this on
  update/delete/restore/add; `DELETE … RETURNING *` verified live on PG18:
  returns the pre-delete row). The response IS the new observation — new
  `version`, new audit fields. FE updates store/form **from the body**.
- **Never** do a GET after a write to "get the fresh version" — that is the
  round-trip waste this plan removes (verified chain: DAL returns row → DAL
  discards → service void → router 204 → FE `loadUser()`).
- Bulk actions are the exception: `204` + list re-GET (see §G).

### Error bodies on conflict

`409 ERR01` → FE should offer refresh/merge UX. `400 ERR02` → bug — surface
in dev, don't design UX around it.

## E. Redis cache — how it interacts

Two cache systems exist; don't confuse them:

| Layer | Mechanism | Used by |
|---|---|---|
| `withCache` (SDK) | Redis per-row, key `dal:{table}:{uuid}`, TTL ~5min; wraps `findById`/`findByUUID` | `customer`, `organization`, `user_profile`, `ai_model`, `ai_cerebellum`, `config_entry` |
| In-process table caches | whole table in RAM (`findAllWithCache`, `invalidateRoleMappingsCache`) | `config_entries` auth config, `role_mappings` permissions — hot paths read every request |
| Redis key mapping | `be:user_profiles:idp_code:{code}` → uuid | auth middleware JIT |

`withCache` semantics after this plan:

- Reads: `findByUUID`/`findById` may hit Redis (can be stale up to TTL).
  `find`/`findAll` are DB-first — use them when freshness matters.
- Writes: invalidate `delByPrefix('dal:{table}:')` after success (unchanged).
- **NEW**: on `ERR01`/`ERR03` the wrapper evicts the cached row too —
  `del('dal:{table}:{uuid}')` when the match carries `uuid`, else
  `delByPrefix`. A failed guarded write proves the cached row is stale
  (someone else wrote / row vanished) → eviction is always safe, and it also
  self-heals staleness caused by manual SQL or external writes.

Consequence for flow: user A writes → cache evicted. User B (stale version)
gets 409 → cache evicted again (harmless) → B's next GET hits DB → fresh
version → merge UI → write succeeds. No 409-loop to TTL.

## F. Manual / out-of-band writes — the discipline

Any write that bypasses the API (hand SQL, `psql`, fire-and-forget migrations,
seeds, `setup-casdoor`-style scripts) MUST:

```sql
UPDATE customers SET name = 'x', version = version + 1,
       updated_at = now(), updated_by = '<who>' WHERE uuid = '<uuid>';
-- then in Redis:
-- DEL / SCAN+DEL dal:customers:*
```

If you skip the `version` bump, you create **silent staleness**: cached rows
look valid, no `ERR01` can ever fire, and the next guarded write from a user
who loaded the pre-write row will spuriously 409 — or worse, overwrite your
change invisibly. If you skip the Redis flush, same problem for TTL duration.

DAL-mediated scripts (a standalone `tsx` script doing `new Pool()` +
`ConfigEntriesDal`) get version/audit for free and DO evict Redis — but they
**cannot** touch a running BE's in-memory caches (auth config, role mappings).
Rule: run such scripts with the BE stopped, or restart/reload after.

## G. Bulk operations

- `updateMany`: TEMP TABLE strategy (CREATE TEMP → batch INSERT →
  `UPDATE t SET … FROM tmp WHERE t.match = tmp.match` → audit insert → COMMIT).
  Currently **no** version guard (documented TODO). Left as-is: mass-import
  semantics aren't ready for per-row optimistic checks.
- `deleteMany`: **rewritten** to the same TEMP TABLE strategy (temp table with
  `uuid` column, `UPDATE … FROM tmp` soft-delete) — replaces `WHERE uuid =
  ANY($n)` (param-limit ~65k, less scalable, join beats array scan). Same
  "no optimistic lock yet" TODO.
- When the guard lands, the pattern is ready: add `expected_version` to the
  temp table, add `AND t.version = tmp.expected_version` to the WHERE, then
  an in-tx diagnostic SELECT:

```sql
SELECT tmp.uuid,
       CASE WHEN t.uuid IS NULL THEN 'gone' ELSE 'stale_version' END AS reason
FROM tmp LEFT JOIN {table} t
  ON t.uuid = tmp.uuid AND t.version = tmp.expected_version
WHERE t.uuid IS NULL OR t.version <> tmp.expected_version;
```

  Temp tables are session-scoped and `ON COMMIT DROP` — they live until COMMIT
  on the same client, so this SELECT is safe inside the transaction. A
  non-empty result → throw aggregated `ERR01` with the stale uuid list → tx
  rollback → all-or-nothing (single statement in explicit tx already is).
- Bulk HTTP contract: **204 on success** (never `RETURNING` arrays to FE —
  scanning them costs more than a re-GET), on conflict → error body carries
  ONLY the stale list `{ uuid, reason }` so the user can fix and re-run.

## H. `upsert` — why it was removed and what to do instead

`repo.upsert` (single record, `INSERT … ON CONFLICT DO UPDATE`) is removed —
it had become the universal workaround for "I don't want to decide add vs
update", which made it a concurrency elusion tool:

- If you pass `version` fetched just before → self-comparison → guard vacuous.
- If you pass nothing → the row silently merges/overwrites whatever is there.
- The honest premise "I don't know if it exists" is almost never true when you
  look: the caller usually just did a `findByKey`/`find`.

Replacements (all verified call sites):

| Old | New | Caller |
|---|---|---|
| JIT `repo.upsert(idp_code)` | `repo.add()` — unique-violation on race is CORRECT and visible (returning the winner's row via `DO NOTHING`+reselect would leak an unobserved uuid — impersonation vector; rejected) | `resolveInternalUuid` |
| `upsertMapping` create | `add()` | role create |
| `upsertMapping` update | `update()` with **client** version | role update |
| `config_entries_dal.upsert` | renamed `setByKey`: `findByKey` → `add()`/`update(existing.version)` — the find decides, legit RMW | `updateAuthConfig` (setup-casdoor), secrets |
| secrets lazy-create | callers already `findByKey` → call `add()` directly (double-lookup eliminated; constraint violation on race = desired visibility) | invitation/mfa services |

`upsertMany` (temp-table bulk) survives for mass-import — different semantics.

## I. Route taxonomy — where things live

- `/api/v1/entities/:entity/*` — generic CRUD surface. For `user_profile`:
  **read-only** (GET meta/list/:uuid/:audit).
- `/api/v1/auth/*` — AUTH module operations (IdP-coordinated):
  `POST /auth/users`, `PATCH /auth/users/:uuid` (update), `DELETE`,
  `POST :uuid/restore`, `POST :uuid/change-password`, `GET check-username`.
- `/api/v1/system/*` — infrastructure/config RPC. `/mcp/*` — AI tools.
- **Casdoor sync is critical, never best-effort**: if `isForbidden` (or any IdP
  write) fails, the operation fails — a locally-deleted user that can still
  authenticate is a security hole; a restored user still forbidden is
  corruption. Verified: no delete path bypasses Casdoor today (only
  `users.router` DELETE → `deleteUser`), and this stays true.

## J. Never-do list (hard rules)

1. Never fetch `version` just to satisfy the guard (the `freshRowByUuid`
   pattern — deleted).
2. Never catch `ERR02` to self-heal — it's a bug report, fix the caller.
3. Never write a manual SQL mutation without `version = version + 1` +
   audit fields + Redis `dal:{table}:*` flush.
4. Never use `repo.upsert` — it doesn't exist anymore. Decide `add`/`update`.
5. Never `findById`/`id` INT8 on API paths — `uuid` only; `id` is for FK/JOIN
   internals. `findById` is `@deprecated`.
6. Never return 204/void on single-entity writes — propagate `RETURNING *`.
7. Never do a re-GET after a single write in the FE — consume the response.
8. Never swallow Casdoor sync failures on user lifecycle ops.
9. Never rely on editor-open files as evidence of code state — grep/read.
10. Never treat `ERR01` as retryable without re-observation — refresh first.

## K. Quick reference — correct write skeletons

```ts
// API update — client version authoritative
async updateCustomer(uuid: string, body: CustomerUpdateBody, tx) {
  // body.version REQUIRED by schema — no fetch
  const row = await repo.update(
    CustomerEntity, { ...body, uuid },
    { actor: requireActor(), audit: this.auditPort, matchBy: "uuid" },
  );
  return row; // RETURNING * — propagate to router → 200 + entity
}

// Internal write — caller already observed the row
await dal.markOtpVerified(invitation.uuid, invitation.version);
// signature: markOtpVerified(uuid: string, version: number)

// System stamp on observed row (heartbeat)
const existing = await repo.findByCode(code);      // needed for oldStatus
await repo.updateByCode(code, existing.version, { status, last_health_check_at });

// Create — expected absent
await repo.add(Entity, { uuid: randomUUID(), ...fields }, { actor });
// unique violation → let it throw — visible, correct
```

