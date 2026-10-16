# DB Migration Engine — runtime patches, schema-diff, provenance, drift guard

> Continuation of `jobs-orchestration-architecture.md` (task 3 extracted to a dedicated plan).
> Scope: `@primebrick/dal-pg` (schema-diff + migration engine + manifest), `@primebrick/sdk`
> (`createMicroservice` boot step, system routes), all US services, BE, FE.
> Non-goal: DB provisioning, backup orchestration, multi-DB engines.
> Revision 2: per-schema registry, config_entries-driven mode (no env), manifest
> provenance promoted to phase 1, register-after-patch ordering, failure-model tests.

## Status: 🟡 PARTIALLY DONE — Plan date: 2026-10-13 16:10 UTC / 18:10 CEST (updated 2026-10-15 — tasks 15/19/20/22/23/24/25 resolved; only task 21 docs gap remains)

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | dal-pg `schema-diff/`: port `schema-types`, `schema-type-normalize`, `schema-rename-heuristics`, `schema-snapshot` (compare) from `primebrick-be-v3/src/db/` — moved, not copied | ✅ done | 2026-10-13 | moved, BE src/db deleted |
| 2 | dal-pg `build-entity-snapshot(registry: EntityClass[])` — parameterized, no BE import; carries index/FK/partition meta | ✅ done | 2026-10-13 | |
| 3 | dal-pg `build-database-snapshot(pool, tables)` — Pool param instead of URL; extended introspection: indexes, FK constraints, partition parents | ✅ done | 2026-10-13 | verified live: found real drift (missing uuid_uq index, avatar_color nullability) |
| 4 | dal-pg `@Index()` decorator: all PG access methods (btree/hash/gin/gist/spgist/brin/hnsw), composite, partial WHERE, opclass | ✅ done | 2026-10-13 | §5 |
| 5 | dal-pg `@ForeignKey()` decorator: `onDelete: restrict\|cascade\|set_null\|set_default\|no_action` (default `restrict`), `onUpdate` (default `no_action`), ref-column inference from target `@Key`; partitioned parent → meta error pointing to `@PartitionChildOf` | ✅ done | 2026-10-13 | §6 |
| 6 | dal-pg `emit-sql-patch.ts`: CREATE TABLE (+ PARTITION BY RANGE), indexes, FKs, `partman.create_parent`+`part_config` from meta, audit tables; `safe`/`review`/`no-transaction` sections via pragmas | ✅ done | 2026-10-13 | §7 — emit v2 verified live on BE entities |
| 7 | dal-pg `migrations/` engine: dedicated-client tx, `pg_try_advisory_lock`, registry prefetch (1 query), severity model, status lifecycle, OTel spans + logger | ✅ done | 2026-10-13 | §3 — 19/19 tests; tx-control strip for legacy BEGIN/COMMIT |
| 8 | dal-pg per-schema registry v2: `<svc_schema>.primebrick_database_patches` (`patch_name` PK, status, severity, attempts, duration_ms, error, applied_by, resolved_by/note, signed_key_id); self-bootstrapping DDL; backfill: distribute the 37 `public.*` rows to owner schemas | ✅ done | 2026-10-13 | §4 — backfilled live: job=3, ai=7, emailsender=4, webhook=3, public=15; legacy table → `primebrick_database_patches_v1_archive` |
| 9 | dal-pg manifest: `db-meta/MANIFEST.json` (patch_name→sha256, key_id, ed25519 sig) + `db-meta/keys.json` trusted keyring; `db:meta:compare` updates entries; `primebrick-db sign`; engine refuses non-listed/tampered patches; cutover: rebuild+sign manifest for all existing patch dirs | ✅ done | 2026-10-13 | §4b — all 5 services signed w/ dev key `dev-micha`; tamper test refused live |
| 10 | dal-pg `checkDrift(registry, pool)`: entity-vs-DB diff post-apply + standalone; surfaced in status | ✅ done | 2026-10-13 | extended to index/FK drift |
| 11 | sdk `createMicroservice`: migration step after DAL init, before ConfigLoader — mode read via raw SQL from `<schema>.config_entries` (`db_migration.mode`, to_regclass-guarded, default `apply`); post-apply re-read; degraded mode (`status='migration_failed'` registration, domain routes 503, system routes live) | ✅ done | 2026-10-13 | §1,§2 — engine injected via `engine:` structural port (SDK never imports dal-pg); degraded→503 wrapper branded |
| 12 | sdk built-in system module: `db_patch` read entity (own-schema registry) + actions `db-migration-retry`, `db-migration-resolve`, `db-migration-apply-review` on every service | ✅ done | 2026-10-13 | §8 — 5 routes via makeRpcRouter + AUTHENTICATED_ADMIN (status/retry/approve/resolve/drift-check) |
| 13 | BE proxy: route exemption — `/api/v1/system/db-migration*` reachable even when instance status ≠ `online` (all other paths stay 503) | ✅ done | 2026-10-13 | §1 — both proxyRequest + resolveServiceInstance (SSE) |
| 14 | CLI `primebrick-db` (bun-first): `compare`, `apply`, `check`, `sign`, `status`, `keygen` — thin wrapper over dal-pg API | ✅ done | 2026-10-13 | §9 — verified live (keygen→sign→apply→status→tamper-refuse) |
| 15 | BE: delete `src/db/` schema-diff + legacy scripts + `.githooks/post-merge` db:migrate block; wire engine in boot; keep its 37-row backfill in `public.*` | ✅ done | 2026-10-15 | src/db schema-diff deleted; `run-be-migrations.ts` in runStartupTasks; post-merge hook kept but now delegates to the engine (thin wrapper over `runMigrations`); `migration_failed` + admin routes live |
| 16 | US services (ai, webhook, emailsender, job-handler): delete local `applyPatches` scripts; wire `dbPatches`; per-schema registry backfill | ✅ done | 2026-10-13 | all 4 wired+backfilled; emailsender's duplicated schema-diff deleted; us-v3 post-merge hook added |
| 17 | `fire-and-forget/` deleted (222 files — git history preserves them; NO registration — deprecated outside standards) | ✅ done | 2026-10-13 | 240 files total (BE 222, ai 9, emailsender 7, webhook 2) |
| 18 | FE `/system/migrations`: per-service patch status via `db_patch` entity lists, severity/status badges, error detail, retry/resolve/approve actions, drift badge | ✅ done | 2026-10-15 | `src/routes/(app)/system/migrations/+page.svelte` — card per service (BE direct `/api/v1`, US via `/ws/<code>`); status via `GET .../db-migration/status` RPC (NOT EntityListTable — db_patch has no entity pipeline); badges status/degraded/schema; actions retry/approve/resolve (note dialog)/drift-check; `data-testid` per convention; `api.ts` helpers + `DbPatchRow`/`DbMigrationStatus`/`DbMigrationDriftResult` in api-types; BE `module-nav-meta.ts` nav item + route census; translations patch `20261015004600_migrations_page_translations` (34 keys × 7 langs, applied live); manifest re-signed `dev-micha` (21 patches); E2E `system-migrations.spec.ts` 3/3 green on live stack; docs: FE `settings.mdx` + BE `docs/user-guide/manual/migrations.mdx`. Note: `db:meta:compare` also emitted `20261015004652_drift_*` (audit-col nullability + service_registry.schemas type) — REAL drift, pending_review, gated. ⚠️ approving it would regress the audit-NOT-NULL invariant — correct fix is entity-side (rev3 task 22-24) |
| 19 | Failure-model test matrix: unit + E2E for every status/severity/pragma/lock/config-mode case incl. kill-mid-apply resume, tampered/unknown patch refusal, log assertion | ✅ done | 2026-10-15 | 19 engine tests green; live boot E2E verified via registry rows `applied_by=be-boot:*` (patches applied at real service start) |
| 20 | CI `db:check` drift gate (non-zero exit on residual diff) | ✅ done | 2026-10-15 | `db:check` (snapshot mode) in `prebuild` of BE + all 4 US — verified empirically: `check` exits non-zero on entity-vs-snapshot drift, prints drift JSON |
| 21 | Docs per doc-map (§12): dal-pg dev-guide, sdk dev-guide, us dev-guide, BE user-guide (admin page), `.devin/rules/db-patches.md` per service repo, AGENTS.md pointers | ⏳ not done | — | §12 |
| 22 | Type inference: `*_uuid` → `uuid` + `BigInt` → `bigint` | 🚫 dropped | 2026-10-15 | SUPERSEDED by `entity-type-contract.md` — name-based inference removed by design: `UUID` guarded annotation → `uuid`, `bigint` prop → `int8`. `job_runs.duration_ms` already `bigint`+int8 live |
| 23 | Emitter: `DROP INDEX`/destructive section for DB-only objects | 🚫 dropped | 2026-10-15 | REVISED DECISION (entity-type-contract era): DB-only objects preserved as `-- WARN … not dropped`, never auto-dropped; index-equivalence suppression kills name-noise. DROP INDEX only in review section for redefinitions |
| 24 | `length` semantics — REVISED DECISION | ✅ done | 2026-10-15 | rev3 said `text`-only; entity-type-contract reversed to option B: `length` → DDL `varchar(n)` (DB-enforced, applied live: `docs_kb.repo`→varchar(50), `docs_ingest_log.*`→varchar(100/20)). Validation-meta role deferred to `entity-validation-autoderive.md` |
| 25 | Rename DB unique + absorb DB-only indexes into entities | ✅ done | 2026-10-15 | rename OBSOLETE — index-equivalence suppression (same cols/using/unique/predicate, any name) makes catalog names non-authoritative. DB-only indexes absorbed: `docs_kb_repo_idx`/`content_hash_idx` (btree) + `embedding_idx` (hnsw vector_cosine_ops) via `@Index` on `DocsKbEntity` — compare: no drift. Fixed `@Index` group-seed bug (opclass/where not seeded on fresh group) |
| 26 | Audit columns NOT NULL — applied live to public/ai/emailsender/webhook (job was already clean); `'system'`/`now()`/`1` backfill | ✅ done | 2026-10-13 | rev3 |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part 0 — Verified current state (empirical, 2026-10-13)

- **Registry v1**: `public.primebrick_database_patches(patch_id, content_sha256, applied_at)` — 37 rows mixing BE (`00000000000000_init_database`, `20260528114750_…`) and US (`0001_job_schema`, `0003_schedule_type`, `0001_initial_schema_ai`…) patches. One row has a stray `.sql` suffix in patch_id (`00000000000003_create_mcp_oauth_clients_table.sql` — cosmetic inconsistency to fix in backfill).
- **Latent atomicity bug (both implementations)**: `BEGIN/patch/COMMIT` issued via `pool.query()` may hit different connections → non-atomic. Saved today only by `max:1`.
- **SHA dedup broken**: compare hashes body pre-footer, apply hashes full file → never equal; `generatedAt` in body makes every run unique → `PB_SCHEMA_META_PATCH_SKIP_IF_DUPLICATE` never fires.
- **Config tables exist per schema**: `ai|emailsender|job|webhook|public.config_entries` → mode config lives in DB, not env.
- **Proxy already gates**: `proxyRequest` filters `status==='online'`; non-online → 503/502 for ALL paths — degraded mode gets isolation for free, but system routes need a narrow exemption (task 13).
- **DB inventory**: 562 indexes (561 btree, 1 hnsw), **1 FK**, 7 partman parents; 222 untracked `fire-and-forget/` files.
- **Boot order** (`createMicroservice`): env → `initDal()` → ConfigLoader → auth → NATS → `service.register` → HTTP → onReady. Registration happens AFTER the migration step will run → a service can never appear `online` before its patches applied (structural, not convention).

---

## Part 1 — Boot model: order, mode, reload invariant

### Order (insert migration as step 2.5)

```
0 console bridge
1 env validation            (DATABASE_URL, NATS — the ONLY envs, per rules)
2 initDal()                 (pool only — no entity reads yet)
2.5 DB MIGRATION            (engine, self-contained; see below)
3 ConfigLoader              (always reads post-patch state)
4 auth config → 5 NATS → 6 service.register → 7 HTTP → 8 shutdown hooks → 9 onReady
```

Guarantee worth documenting (point 3 feedback): `service.register` sits after the migration step — **a service can never register `online` before its patches are applied**. On critical failure the service *still* registers but with `status='migration_failed'`: it is discoverable (FE can see/fix it) while the proxy 503s every domain path. Registration ≠ availability — the registry status is the gate, and this must be documented explicitly.

### Mode config — DB, not env

`PB_DB_MIGRATE` env is dropped entirely. Mode lives in `<svc_schema>.config_entries` key `db_migration.mode` ∈ `apply | check | off`. The engine reads it with **raw SQL before patching**:

```sql
SELECT value FROM <schema>.config_entries WHERE key = 'db_migration.mode'
```

guarded by `to_regclass` — table absent (empty DB) → default `apply`. This is the only DB read the engine does on itself; it does NOT go through ConfigLoader (which runs later and would be circular).

### Pre-patch reload invariant (point 5)

Rule: **the migration engine is the only component allowed to read DB state before itself — and whatever it reads, it re-reads after applying ≥1 patch.** Concretely today: the engine re-reads `db_migration.mode` post-apply (a patch may have changed it) and logs the effective next-run mode. Everything else (ConfigLoader, shield registries, translations) runs after the step and sees fresh state by construction. This invariant is documented in sdk dev-guide + the db-patches agent rule — any future boot-stage read added before the step must implement the same reload.

### Mode semantics

| Mode | Behavior |
|---|---|
| `apply` (default) | lock → verify manifest → apply pending in order → drift check → continue |
| `check` | no apply; report drift loudly (log + status + FE badge); service boots |
| `off` | skip entirely (replica/readonly boot) |

Note: mode affects *this and future* runs — a patch that flips mode cannot retroactively un-apply itself (convergent, documented).

### Failure model — severity + lifecycle (contract, fully documented in §11 tests)

Patch pragma header parsed by the runner:

```sql
-- pb:severity critical        -- critical | advisory (default: critical)
-- pb:requires-review          -- generator flag for unsafe ops; never auto-applied
-- pb:no-transaction           -- statement-per-statement, non-atomic section
```

- `critical` fails → **degraded boot**: service registers `migration_failed`, HTTP binds, domain routes return `503 RFC7807 migration_required`, `/health` + `db_patch` + migration actions live. Reachable enough to fix from FE — the unblock requirement.
- `advisory` fails → service boots; patch stays `failed`; surfaced in FE + OTel counter.
- `pending_review` → not auto-applied; **blocks all later patches** (ordering is total); admin approves via FE → `db-migration-apply-review` runs it under the same lock.
- `resolved_manual` → admin marks a `failed`/`pending_review` patch manually fixed; records `resolved_by`, `resolved_note`, current sha.

**Docs:** `.devin/rules/db-patches.md` (agent rule, per service repo) · sdk dev-guide §service-bootstrap · dal-pg dev-guide §failure-model.

---

## Part 2 — Placement

`@primebrick/dal-pg` — two new subtrees, **outside the repository pattern**:

```
dal-pg/src/
  meta/          (decorators + new @Index/@ForeignKey)
  schema-diff/   (snapshot types, builders, compare, rename heuristics)
  migrations/    (engine: apply, registry, lock, manifest verify, drift)
```

Engine uses a dedicated `pg.PoolClient` — never `Dal`/`Repository`. SDK keeps only integration (boot step, system routes, CLI shim). SDK's `migrations/apply-patches.ts` + `DatabasePort` are deleted — the engine is pg-only by design, matching dal-pg scope. Bun-first: only `node:crypto`/`node:fs` (Bun-native); `pg` works under Bun.

**Docs:** dal-pg dev-guide §migrations-architecture · dal-pg AGENTS.md pointer.

---

## Part 3 — Transactionality + lock (fixed)

```
client = await pool.connect()                        // ONE reserved connection
SET lock_timeout='10s'; SET idle_in_transaction_session_timeout='60s'

locked = pg_try_advisory_lock(hashtext('primebrick:migrate:<dbname>'))
if (!locked) retry with backoff ≤30s → else fail 'another migrator is running'

for each pending patch (strict filename order):
    no-transaction pragma → statements sequential, registry row in own mini-tx
    else → BEGIN → SET LOCAL statement_timeout='5min'
         → patch SQL → INSERT registry row → COMMIT
    on error → ROLLBACK → INSERT 'failed' row (separate tx) → STOP

finally → pg_advisory_unlock (best-effort) → client.release()
```

- Advisory lock is **session-scoped**: crash → connection dies → lock auto-released. No zombies.
- Exactly one lock ever taken → no lock-ordering, no deadlock possible; `pg_try_` variant never blocks.
- Registry INSERT **inside the patch tx** → applied-and-registered or nothing, atomically.
- `lock_timeout` bounds queueing behind app queries; `idle_in_transaction_session_timeout` kills stalls.
- `-- pb:no-transaction` (`CREATE INDEX CONCURRENTLY`, `ALTER TYPE ADD VALUE` pre-18): `atomic:false` recorded; statements authored `IF [NOT] EXISTS` for re-runnable resume.

**Docs:** dal-pg dev-guide §engine-internals · agent rule §patch-pragma.

---

## Part 4 — Registry v2, per-schema (answers to point 7)

### Per-service schema tables — YES

`<svc_schema>.primebrick_database_patches` per service (`public.primebrick_database_patches` for BE). Rationale accepted: the registry **is domain data of the owner service** — respects microservice ownership, no shared global table, FE aggregates per-service anyway (it must call each service to reach system routes regardless). Ops-side union queries remain trivial (`UNION ALL` across known schemas) if ever needed for reporting.

### Columns (answers in order)

- **`patch_name` not `patch_id`** — it IS the filename minus `.sql` (`<utc14>_<slug>`), unique, decomposable, and the same string humans see in git. No synthetic id. Footer-derived ids rejected (fragile — footer is comments).
- **No `service_code`** — schema IS the identity; display uses `module_name`/pkg identity from service_registry.
- **No `kind`** — a patch is atomic: DDL+seed in one file is fine and normal. FnF is dead entirely (§10) — no `legacy_fnf` rows needed.
- **No loose `source` string** — replaced by provenance columns below.

```sql
CREATE TABLE IF NOT EXISTS <schema>.primebrick_database_patches (
  patch_name     text PRIMARY KEY,             -- '<utc14>_<slug>' filename-derived
  content_sha256 text NOT NULL,
  status         text NOT NULL,                -- pending|applied|failed|pending_review|resolved_manual
  severity       text NOT NULL DEFAULT 'critical',
  signed_key_id  text,                         -- which keyring key authorized this patch
  attempts       int NOT NULL DEFAULT 0,
  duration_ms    int,
  error          text,
  applied_by     text,                         -- service instance / admin user uuid
  resolved_by    text, resolved_note text,
  applied_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
```

Self-bootstrapping: engine runs this DDL (and `CREATE SCHEMA IF NOT EXISTS`) unconditionally before any read — the registry is the only thing it touches outside patch files. Backfill task redistributes the 37 existing `public.*` rows to owner schemas by patch-name prefix matching each repo's patch files.

## Part 4b — Provenance: the manifest (promoted to phase 1)

### Threat model

The feared attack is a trojan: someone gets a `.sql` file into `db-meta/patches/` (file-write exploit, malicious dependency, compromised dev machine) and our engine happily runs it. `sha256(content)` alone proves nothing about provenance — it only proves the file wasn't corrupted. Git-commit checks are weak: containers may lack git, and legitimate third-party modules come from repos we don't control.

### The mechanism

```
db-meta/
  patches/            (patch files — content)
  MANIFEST.json       { version, key_id, issued_at,
                        patches: { "<name>": "<sha256>", ... },
                        signature: "<ed25519 over canonical JSON minus signature>" }
  keys.json           [{ key_id, algo:'ed25519', public_key, trust:'release'|'dev' }]
```

- **`keys.json` is committed** — adding a key is a code-reviewed trust decision. Public keys are safe to commit; trust is *which keys are in this file*.
- **Dev flow**: `db:meta:compare` writes the patch AND refreshes `MANIFEST.json` entries (signature cleared). `primebrick-db sign --key dev` re-signs with the workspace dev key → local runs pass. PR review sees patch + manifest diff together — a patch can't hide from review.
- **Release flow**: CI verifies every patch hash against manifest, **re-signs with the org release key** (private key in CI secrets, never on any runtime machine), and release builds carry `keys.json` restricted to `trust:'release'` keys only — a dev-signed manifest simply fails in prod, which *forces* the CI signing path.
- **Runtime verify** (engine, before any apply): parse manifest → verify signature against keys.json (filtered by build trust level) → every candidate patch file must appear in manifest AND match its sha → extra file → **refused + security log**; sha mismatch → **refused**; invalid signature → **refused everything**.
- **Third-party modules**: their manifest is signed with *their* org key — we add that pubkey to our `keys.json` explicitly. Trust is by key, not by repo URL — no git access to foreign repos needed. Installing a foreign module without adding its key → its patches are refused (loud, not silent).

### Attack-by-attack

| Attack | Result |
|---|---|
| Drop extra `.sql` in patches/ | not in manifest → refused, `patch_unknown` security event |
| Modify existing patch | sha ≠ manifest → refused |
| Rewrite manifest | signature invalid → all refused |
| Re-sign manifest | needs private key — not on the machine |
| Add attacker pubkey to keys.json | needs repo write (code review) or full file-write exploit — at which point signing is moot anyway; residual risk documented |
| Flip "allow unsigned" config | no such flag exists at runtime — trust level is a build constant, not config (SQL-injection can't downgrade verification) |

**Docs:** dal-pg dev-guide §provenance · `.devin/rules/db-patches.md` (never hand-edit MANIFEST/keys; agent-facing) · security section.

---

## Part 5 — `@Index()`

Inventory: 561 btree, 1 hnsw. Coverage for all PG access methods:

```ts
@Index()                                          // btree, auto name <table>_<col>_idx
@Index({ name: 'jobs_due_idx', order: 0 })        // composite member
@Index({ where: 'deleted_at IS NULL' })           // partial
@Index({ using: 'hnsw', opclass: 'vector_cosine_ops' })   // vector
@Index({ using: 'gin', opclass: 'gin_trgm_ops' })         // trigram/fts
```

Defaults: `using='btree'`, unique stays `@Unique`; `CONCURRENTLY` auto-emitted for adds on existing tables (no-tx pragma). Diff: missing → CREATE; DB-only → WARN comment (never auto-drop); same-name-different-def → review section (`DROP`+`CREATE`).

**Docs:** dal-pg dev-guide §entity-decorators · agent rule §index-decorator.

## Part 6 — `@ForeignKey()` — semantics + defaults

```ts
@ForeignKey(() => CustomerEntity)                                  // ref=target @Key, ON DELETE RESTRICT
@ForeignKey(() => JobScheduleEntity, { column: 'uuid', onDelete: 'cascade' })
```

`onDelete`/`onUpdate` enum: `restrict | cascade | set_null | set_default | no_action`. **Defaults: `restrict` / `no_action`** — the zero-code path yields the safest behavior; cascade/set_null are explicit opt-ins.

**NO ACTION vs RESTRICT** (the question): they behave identically unless the constraint is `DEFERRABLE` — `NO ACTION` checks *at end of statement* (can be deferred to commit), `RESTRICT` checks *immediately, cannot be deferred*. We never emit `DEFERRABLE`, so today they are equivalent; we still support `no_action` because it is Postgres's own default and keeps the door open to deferrable constraints later. Our default stays `restrict` (fail-fast, most protective).

Partitioned-parent conflict unchanged: normal FK can't reference a partitioned parent's non-PK column → meta throws "use @PartitionChildOf". Emission: new table → inline `REFERENCES`; existing table → `ALTER TABLE ADD CONSTRAINT` in review section.

**Docs:** dal-pg dev-guide §entity-decorators · agent rule §fk-decorator.

## Part 7 — Emitter coverage

| Intent | Emitted | Section |
|---|---|---|
| new entity | `CREATE TABLE` (PK, defaults, identity) | safe |
| `@PartitionField` | `PARTITION BY RANGE` + `partman.create_parent` + `part_config` upsert (interval/retention/keepTable/premake from meta) | safe |
| `@PartitionChildOf` | plain table + index on ref column (runtime purge owns lifecycle) | safe |
| `@AuditTrail` | audit table + partman parent (changed_at, monthly, keep_table) + indexes — meta-driven | safe |
| `@Index` new | `CREATE INDEX [CONCURRENTLY]` | safe / no-tx |
| `@ForeignKey` new table | inline `REFERENCES …` | safe |
| `@ForeignKey` existing table | `ADD CONSTRAINT` | review |
| new column | `ADD COLUMN IF NOT EXISTS` | safe |
| rename | `RENAME COLUMN` (commented if ambiguous) | review |
| **type mismatch** | `ALTER COLUMN … TYPE` — now generated, gated | review |
| **nullability** | `SET/DROP NOT NULL` — now generated, gated | review |
| DB-only objects | `-- WARN` only | never |

Type/nullability changes get *real generated SQL* in review section (they're the `ALTER TYPE`/`SET NOT NULL` cases: e.g. `varchar(100)→varchar(200)` may rewrite the table, `SET NOT NULL` fails on existing NULLs — hence `pending_review`, not silent auto-apply).

**Docs:** dal-pg dev-guide §patch-generation.

## Part 8 — FE `/system/migrations`

- SDK ships built-in system module: `db_patch` read entity over own-schema registry + actions `db-migration-retry` / `db-migration-resolve` / `db-migration-apply-review`. Every service exposes it identically — zero per-service code.
- FE page aggregates installed modules: per service an `EntityListTable` of its `db_patch` rows — status badge, severity, duration, attempts, error detail, `signed_key_id`, drift badge. Admin actions: retry / resolve-manual / approve-review.
- Reachability: task 13 adds a proxy exemption so `/api/v1/system/db-migration*` answers even when the instance is `migration_failed` — domain routes stay 503. A broken patch on service X leaves X degraded but BE+FE live → admin fixes and retries → service re-migrates and goes online. No company-wide outage.

**Docs:** BE `docs/user-guide/` (admin usage — user persona) · FE dev-guide §system-pages.

## Part 9 — Dev flow (replaces the git hook)

```
dev1: edit entity → pnpm db:meta:compare → patch + manifest entries → sign --key dev → commit all
dev2: git pull → bun run dev → engine applies at boot (lock+tx, manifest-verified) → drift check clean
```

| Edge case | Behavior |
|---|---|
| pull while service running | applies at next restart; FE shows `pending` |
| same-second patch names | per-service dirs + utc14+slug → collision impossible in practice; compare enforces filename uniqueness |
| prod deploy | `db_migration.mode=apply`; rolling: first instance holds advisory lock, others wait ≤30s or degrade |
| DB ahead of code (rollback) | extra `applied` rows visible in FE; forward-only, never rolled back |
| malicious patch dropped on server | refused by manifest verify (§4b) |

## Part 10 — `fire-and-forget` retirement

Folder deleted (222 files — git history preserves them). **No registration machinery**: FnF is deprecated outside standards — future one-off SQL lives in workspace `temp/` only, never committed. Agent rule updated: "no SQL outside `db-meta/patches` + manifest".

## Part 11 — Failure-model test matrix (task 19)

| # | Scenario | Expected |
|---|---|---|
| 1 | happy path, 3 pending patches | all applied in order, rows stamped, drift clean, OTel span per patch |
| 2 | kill mid-apply | tx rolled back; restart → resume at same patch; no half-state |
| 3 | critical failure | `failed` row; `migration_failed` registration; domain 503; system routes live |
| 4 | advisory failure | boots normally; `failed` row visible |
| 5 | sha mismatch (tampered file) | refused + security log |
| 6 | unknown file (not in manifest) | refused + security log |
| 7 | invalid manifest signature | all refused |
| 8 | `pending_review` gate | blocks ordering; approve action applies under lock |
| 9 | advisory-lock contention | second migrator waits ≤30s then clear error |
| 10 | no-transaction patch | statements sequential; `atomic:false`; resume re-runs safely |
| 11 | mode `check` / `off` | no apply; drift reported / skipped |
| 12 | mode key changed by a patch | post-apply re-read logs new effective mode |
| 13 | empty DB bootstrap | registry+config created; default mode apply |
| 14 | log assertions | every case emits the documented structured log + span |

Unit tests mock pool/logger/OTel; E2E runs against the real dev DB (acceptance path).

## Part 12 — Documentation map (what · where · persona)

| Topic | Where | Type/persona |
|---|---|---|
| Patch authoring, pragmas, naming, manifest discipline | `primebrick-dal-v3/docs/dev-guide/db-migrations.mdx` + `.devin/rules/db-patches.md` (each service repo) | dev + agent |
| `@Index`/`@ForeignKey`/`@PartitionField` decorators | dal-pg `docs/dev-guide/entities.mdx` + AGENTS.md pointer | dev + agent |
| Boot ordering, degraded mode, reload invariant | sdk `docs/dev-guide/microservice-bootstrap.mdx` + us `docs/dev-guide/` | dev |
| Registry schema, statuses, failure model | dal-pg dev-guide §engine + §11 test names | dev |
| Provenance/manifest/keys/trust | dal-pg dev-guide §provenance + `.devin/rules/` (never hand-edit) | dev + agent |
| Admin migrations page usage | `primebrick-be-v3/docs/user-guide/` | user |
| FnF deprecation | workspace AGENTS.md + agent rule | agent |
| Dev flow (compare→sign→commit→auto-apply) | dal-pg dev-guide §workflow | dev |

One canonical doc per topic in dev-guide (full mechanics); `.devin/rules/` holds only distilled imperative rules (agent persona); user-guide only covers the admin UI.

## Acceptance criteria

1. `bun run dev` on a US service with a pending signed patch → manifest verified, patch applied under advisory lock in tx, registry row stamped `signed_key_id`, drift check clean.
2. Critical failure → `migration_failed` registration; domain 503 via proxy; `db-migration-*` routes reachable; FE retry recovers → `online`.
3. New entity with `@Index`+`@ForeignKey`+`@PartitionField`+`@AuditTrail` → correct single patch, `pending_review` where unsafe ops exist.
4. Trojan file dropped in patches/ → refused at boot with security log.
5. `fire-and-forget/` gone; no `applyPatches` in SDK; no post-merge hook; `db:check` fails CI on artificial drift; §11 matrix green.

---

## Revision 3 — model alignment (2026-10-13 evening)

Decisions from live verification + user review:

- **Severity model REMOVED.** Every patch is required — a DB not congruent with code
  can never be trusted. `severity` column dropped from registry v2 (self-healing
  `DROP COLUMN IF EXISTS` in bootstrap DDL), `-- pb:severity` pragma deleted,
  `PatchSeverity` type removed. Any failure ⇒ `degraded` + ordering stops.
- **`pending_review` ⇒ degraded.** A review gate is not a free pass: schema
  incomplete = service must not serve domain traffic. Admin approves via
  `db-migration-approve` → status `approved` → next run applies it.
- **Ordering**: strictly chronological by filename timestamp — total order, the
  first blocking patch stops everything behind it. `applied_at`/`created_at` in
  the registry mirrors the filename timestamp ordering.
- **DB-only indexes**: emitter gains a review-section `DROP INDEX` emission —
  code is the source of truth; DB-only objects are removable (gated by review
  since a stray index can carry accidental perf value worth a glance first).
- **Audit columns**: `created_at/created_by/updated_at/updated_by/version` are
  NOT NULL (only `deleted_*` nullable — NULL = not deleted). Fixed live via
  per-schema patches `2026*_audit_columns_not_null` (UPDATE backfill `'system'`
  / `now()` / `1` + `SET NOT NULL`) — applied to public/ai/emailsender/webhook.
- **Type-inference gaps found** (evidence-driven):
  - `*_uuid` → `uuid` (was: only literal `uuid` name; DB already has all 130
    uuid cols correct — inference bug, entity-side only)
  - `BigInt` design type → `bigint` (wire parser `INT8→BigInt` already exists;
    tsx/bun without emitDecoratorMetadata still needs explicit `pgType:'bigint'`)
  - `length: N` on string → `varchar(N)` storage — pending decision: keep
    varchar storage vs `length` as validation-only meta (recommendation: `text`
    in DB, `length` as validation meta — kills an entire drift class)
- **Index naming**: canonical `<table>_<col>_uq` from entity beats hand-written
  names — DB aligns to code (`ALTER TABLE … RENAME CONSTRAINT`), not vice versa.
- Stale service_registry rows (`emailsender@new-host:4000` since July) pollute
  instance counts — addressed in `schema-sovereignty.md` (lifecycle of registry
  rows + schema-claim column live there).
