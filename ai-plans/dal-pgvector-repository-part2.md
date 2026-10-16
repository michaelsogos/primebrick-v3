# dal-pgvector-repository — PARTE 2

> Continuation of `dal-pgvector-repository.md` — body tail. The task table + status live in part 1; this file is reference material only (raw-SQL census, fluent-tx analysis, last_seen_at conflict).

---

---

## Raw-SQL census — complete empirical inventory (2026-10-14)

Task 5 scope enlarged: removing `getPool()`/raw access is no longer a
3-repo cleanup — it is a **5-repo refactor with a BE dual-stack at its
center**. Everything below was verified by grep + file reads, not
inference.

### DAL escape hatches (public API today)

| API | Production call sites | Verdict |
|---|---|---|
| `dal.rawSql()` → `repo.rawSql()` | **0** — only `dal.test.ts:82` | delete now |
| `dal.getPool()` | ~45 consumer sites | THE leak vector — privatize after 5b lands |
| `dal.withClient(cb)` | ai ×3 tx, docs-kb TRUNCATE; internal: migrations engine, partition maintenance | make package-internal; public API → `dal.transaction(repo => …)` |

### BE dual-stack — the real problem

`primebrick-be-v3/src/db/pool.ts` is a **second, hand-rolled `pg.Pool`**
parallel to the Dal gateway: no `search_path` setup, no
`statement_timeout`, no `application_name`, no schema-domain. It exists
because it predates the Dal gateway. **34 files** import `getPool` from
it — this is the BE's dominant data path, not an exception.
`db/dal-gateway.ts` runs `initDal()` (env contract + migrations) but the
entity layer itself goes through the raw pool.

34 files importing `db/pool.js`: controllers (`config-entries`,
`role-mappings`, `users`, `wiring`, `internal-request-routes`,
`service-lifecycle-subscriber`, `stale-detection-job`), `entity-router`,
`entity-service`, `index.ts`, auth module (`auth.middleware`,
`mfa-step-up.middleware`, `config-entries.service`,
`organizations.service`, `role.service`, `user-profile-repo`), services
(`collaboration`, `oauth-client`, `mcp/tools/dispatch`,
`backend-identity`, `proxy-service`, `secret-engine`,
`db-migration.service`, `routes-census.service`, `system.service`,
`translations.service`, `telemetry`, `aggregated-router`) + test mocks.

The ~24 raw `pool.query` call sites inside those files, triaged:

| Category | Sites | Migration path |
|---|---|---|
| `SELECT id\|uuid\|cols FROM user_profiles WHERE uuid\|id=$1` (internal-id lookups) | `mfa.service` ×2, `invitation.service`, `user.service`, `auth-session.service`, `sdk-auth-ports` (api_keys), `user-passkeys-dal`, `mfa_action_authorizations_dal`, `oauth/client-registry-dal` ×3, `webauthn.service` ×3 (~16) | add `UserProfileRepo.getIdByUuid()` etc. — root cause is the missing shared repo method |
| Conditional upsert `INSERT … ON CONFLICT … WHERE source='registry'` | `service-lifecycle-subscriber.upsertClientRegistry` + `client-registry-repo` — **same INSERT duplicated twice** | D3: `upsertMany conflictWhere` or update-first |
| True aggregates/dynamic SQL | `mcp/tools/dispatch.ts` (auth_events dynamic GROUP BY), `translations-dal` `jsonb_object_agg` | D2: `repo.aggregate()` |
| Infra | `index.ts` `SELECT 1`/`version()` health+banner | `dal.ping()`/`serverVersion()` |

### US raw usage

- `ai/telemetry-repository` ×3 `pool.query` — GROUP BY/FILTER aggregates
  on `ai.ai_telemetry` (own schema — raw only because DSL lacks
  aggregate support).
- `ai/conversation-repository`, `feedback-repository` — `withClient` +
  `new Repository(client)` + manual BEGIN/COMMIT/ROLLBACK — *correct*
  tx usage; only tx-control statements are raw → `dal.transaction`.
- `ai/docs-kb-repository` TRUNCATE via withClient → `dal.truncate`.
- `job-handler/actions-route` — `date_trunc`+`FILTER`+`GROUP BY`
  histogram on `job.job_runs` (own schema; aggregate gap).
- `emailsender/auth-ports-adapter` `SELECT … FROM public.api_keys` —
  **cross-schema violation**, fixed in `schema-sovereignty.md` via
  `NatsApiKeyPort` (webhook already proves the pattern).
- Health-check adapters ×4 (`SELECT 1`), `pgServerBanner` → `dal.ping()`.
- Test helpers (emailsender `setup.ts` DDL/TRUNCATE) — keep a
  test-owned `pg.Pool`: test infra, not service code.

### Required DAL additions before `getPool()` can be private (task 5b)

| New API | Replaces | Status |
|---|---|---|
| `dal.entityService(cfg)` / `dal.tableAuditPort()` — DAL-owned factories (gateway injects its private `this.repo`) | `dal.repository()` accessor + `new Repository(getDal().getPool())` in `entity-repo.ts`/`repository-factory.ts` | ✅ done (2026-10-16): `repository()` REMOVED — consumers can no longer hold the engine; inversion via gateway factories |
| `dal.serverVersion()` (health+version, ONE probe — `ping()` removed, no `SELECT 1`) | health-check adapters, `pgServerBanner`, `index.ts` boot check | ✅ done (2026-10-15) |
| `dal.transaction(fn: (txRepo: Repository) => Promise<T>, {timeoutMs})` — managed BEGIN/COMMIT/ROLLBACK, `SET LOCAL` tx-scoped | `withClient`+manual tx in ai repos + `entityWrite` tx paths | ✅ done (2026-10-15) |
| `repo.truncate(entity)` + `dal.truncate` proxy — entity-resolved, domain-guarded | docs-kb wipe, test helpers | ✅ done (2026-10-15) |
| `groupBy` over expression nodes (`{expr}`) + `Sort` on expr/projection-alias | job histogram `date_trunc`, dispatch `auth_events` GROUP BY — D2 | ⏳ pending — DSL extensions only; `repo.aggregate()` VETOED by user (no generic dashboard API) |
| `find(ua_prefix LIKE 'pkg/%')`→`add`\|`update(version)` in service | conditional `ON CONFLICT … WHERE` ×2 — D3 | ⏳ pending — upsert VETOED (bypasses optimistic lock; `version` in ua_prefix = duplicate-row bug — match on pkg_name) |

Internal-only (stay inside dal-pg, use `getPool`/`withClient` directly):
migrations engine, `checkDrift`, partition maintenance, snapshot tooling.

### Open decisions (user answer required)

- ~~**D1**: `withClient` fully package-internal~~ — **CLOSED**: `private` (done)
- ~~**D2**: `repo.aggregate()` vs `dal.adminSql()`~~ — **CLOSED**: neither —
  DSL extensions only (`groupBy:{expr}`, `Sort` by alias/expr)
- ~~**D3**: conditional upsert~~ — **CLOSED**: banned — find→add/update,
  match on pkg_name (version-trap)
- **D5 — `last_seen_at`** (OPEN): auditable entity + heartbeat column
  conflict — options below
- **D6 — fluent deferred tx** (OPEN): `beginTransaction()` buffering
  repo → `commitTransaction()` — analysis below

---

## Fluent deferred-execution transaction — analysis (task 5l)

**User's proposal**: `beginTransaction()` returns a repo whose `add`/
`update`/… don't execute — they append statements to a buffer;
`commitTransaction()` executes everything at once with rollback logic.

**Protocol constraint (hard fact)**: PostgreSQL's extended query protocol
runs ONE statement per round-trip; the simple protocol accepts
`BEGIN; s1; s2; COMMIT` in one call **but forbids bound parameters**.
So "append N statements, send once" is only reachable by compiling the
buffer into a **single data-modifying CTE chain** — which is also the
PG-native way to get atomicity for free (one statement = implicit tx,
no BEGIN/COMMIT/ROLLBACK needed at all, rollback = statement failure).

**The design converges**: each buffered op → one CTE branch
(`s0 AS (INSERT … RETURNING *), s1 AS (UPDATE … WHERE …)`); a final
`SELECT json_agg` per branch returns all rows in one payload; guards
(ERR01/ERR10 checks) embed as `CASE … pg_raise` branches — the same
pattern `updateMany`/`deleteMany` already use internally.

**Open design points to decide**:
1. **Deferred handles** — `tx.add(E, data)` can't return the row
   (nothing ran yet). It must return a `Deferred<T>` with
   `.ref("field")` → renders `(SELECT field FROM sN)` scalar subquery
   for later ops (parent→child id piping). Without refs, ops are
   independent.
2. **Reads inside the buffer** — a `find` whose result must drive TS
   branching is impossible (result unseen until commit). Guard
   conditions must be expressed in SQL (`WHERE EXISTS(SELECT…FROM sN)`).
   Intrinsically-conditional flows keep `transaction(fn)` — the rule
   becomes "deferred by default, callback only when TS must decide on
   DB results".
3. **Return values** — `commit()` materializes each `Deferred`
   (`.rows`/`.value`). An op's `RETURNING` clause is configurable.
4. **Rollback** — free: single-statement failure undoes everything;
   no explicit rollback code exists (user's "mette le logiche di
   rollback se serve" → the statement IS the rollback unit).
5. **Footgun**: `await tx.add(...)` returning a Deferred that looks
   like a row — type-level it must be `Deferred<T>`, not `T`, so
   misuse fails compile.

**Alternatives considered**:
- `writeBatch(ops[])` declarative array — same compiler, uglier API
  (new "way of writing") — user: last resort only.
- Stored procedures — pushes business logic into DB; rejected.
- Multi-statement simple-protocol — no bound params; rejected.
- EF Core SaveChanges / SQLAlchemy UnitOfWork / Marten session —
  precedent for deferred-write-buffer pattern (same shape).

**Evidence the 3 current tx sites compile to CTE**: insertMessage
(add→stamp), insertFeedback (add→stamp conditional on TS input —
static shape, OK), deleteConversation (find→loop-delete children→
delete parent — CTE-expressible via DELETE branches on
`conversation_uuid`; the per-child version fetch is unnecessary —
the parent's version guard is the real lock).

---

## `last_seen_at` — the auditable-watermark conflict (task 5k, D5)

Verified: `ai_conversations` IS legitimately auditable — FE-facing
entity (rename, delete via API) → optimistic lock + audit trail are
real. `last_seen_at` is BOTH the partition key (`@PartitionField`,
monthly, 6-month retention — "idle time", not "create time") AND the
conversation-list sort key AND stamped per child event.

The conflict the user identified: a heartbeat write on an auditable
row must carry `version` — but bumping `version` on every message
invalidates the version the FE holds for real edits (rename/delete).
`touch` was the workaround; it's deleted. Current interim state:
`stampConversationActivity` does versioned find→update in the same
tx — honest but bumps version per message.

**Options**:
- **A — accept version bump** (CURRENT): heartbeat IS an edit —
  `updated_at`/`updated_by`/`version` stamped truthfully. FE must
  re-read `version` before mutation (already required on ERR01).
  Consequence: editing a title during an active stream hits ERR01 →
  re-read → retry. Semantically honest; UX cost small (renames rare).
- **B — move watermark to non-auditable side table**
  `ai.conversation_activity(conversation_uuid PK, last_seen_at)`:
  heartbeat writes need no version (entity non-auditable) — but the
  partition key must live ON the partitioned table → redesign:
  partition conversations by `created_at` (retention = age, semantic
  change) OR keep parent unpartitioned + partition activity. Also
  upsert-style write (add-or-update) needed for the activity row —
  banned pattern returns (find→add|update + unique-violation retry).
  Cost: migration + partman rework + join for list ordering.
- **C — drop the column entirely**: ordering via
  `MAX(messages.created_at)` aggregate at read; partition by
  `created_at`; retention = creation-age OR set-based purge by
  maintenance job (`NOT EXISTS` recent messages). Cheapest schema,
  changes retention semantics ("created >6mo" kills long-lived active
  chats unless purge is activity-aware — which can't use partition
  drop).
- PG note: updating a RANGE partition key physically moves the row
  between partitions (delete+insert) — already true today via touch;
  not a new cost.

### Deep analysis per call site (2026-10-14, answers for D1–D3)

**D1 — `withClient`**: checks out one dedicated `PoolClient`, optional
per-connection `statement_timeout`, releases it. Exists because
transactions need a *pinned* connection (`BEGIN`/`COMMIT` on the same
client — `pool.query` would scatter statements), per-call timeouts, and
the tx-scoped `new Repository(client)` pattern. Consumers: `ai`
conversation/feedback repos (correct-but-verbose manual BEGIN/COMMIT —
the cascade delete IS the referential integrity, no FK on partitioned
parent), `ai` docs-kb TRUNCATE (uses it only to get a client — not a
tx), DAL internals (partitionMaintenance, migrations). Public exposure
hands out `client.query()` = total raw hole. Resolution: public
`dal.transaction(fn: (repo) => T)` + `dal.truncate(entity)`;
`withClient` → package-internal (tooling — `primebrick-db` CLI — lives
inside the DAL repo, can use internals).

**D2 — aggregates**: the DSL already covers most of it — `Project.expr`,
`groupBy`, `having`, `Filter.expr` parameterized, `IN`/`BETWEEN`; proven
in `docs-index-status`, `feedback-repository`, `audit-query-helper`,
`entity-service` E.3a. Per site:
- `ai/telemetry` ×3 → expressible TODAY (ungrouped expr aggregates,
  `repo.add`, `findAll`+sort) — gap is a *missing `AiTelemetryEntity`*,
  not DSL.
- `translations-dal` `jsonb_object_agg` → expressible TODAY — module→
  entity map already exists; site just unmigrated.
- `job-handler` histogram → `Filter.expr` covers interval+IN; needs
  **`groupBy` over expressions** (`date_trunc` isn't an entity field).
- `dispatchBeAggregate` (MCP tool) → generic engine by contract:
  dynamic agg/field/group_by/filters/sort/page + **sort-by-alias** +
  **count-of-groups subquery**. The only site where `repo.aggregate()`
  is a genuine feature (dashboard-as-a-service).
- DSL micro-extensions needed regardless: `groupBy` accepting
  `FieldRef | {expr}`, `Sort` by projection alias/expr.
- `repo.aggregate()` is NOT required to migrate 3/4 sites.

**D3 — conditional upsert**: `client_registry` auto-enrollment,
`ON CONFLICT (ua_prefix) DO UPDATE … WHERE source='registry'` — the
WHERE guards admin-owned `source='manual'` rows from overwrite. Raw
because **the DAL has no upsert**: single `upsert` was removed
("workaround that eluded the system"), `upsertMany` commented out
pending guarded/unguarded decision. Same INSERT duplicated in
`service-lifecycle-subscriber` AND `client-registry-repo`
(`backend-identity` caller) — subscriber should call the repo.
Options: service-level find→insert/update/skip (existing API, honest),
or DSL `conflictWhere` on the future upsert redesign.

**Legality classification**: raw SQL is not "illegal" (no error) — it's
*invisible* to the schema-domain guard. Categories: (a) cross-schema
violation → fixed (emailsender api_keys); (b) own-schema/in-domain
intent, wrong vehicle → migrate to entities+DSL (telemetry, histogram,
i18n dict, tx cascades, ~16 `user_profiles` lookups missing
`UserProfileRepo.getIdByUuid`); (c) non-entity infrastructure →
`dal.ping`/`serverVersion`/`truncate`/`transaction`; (d) generic
dynamic feature → DSL ext or aggregate (D2); (e) ownership-guarded
write → D3; (f) BE second pool `db/pool.ts` → **illegal**, parallel
driver stack, delete + repoint 34 imports to `dal.repo()`; (g)
`new Repository(pool)` ~21 sites → `dal.repo()`; (h) DAL internals
(migrations/drift/partitions) → stay internal; (i) test helpers → own
test pool.
