# Plan — Audit writes by construction (F1) + partition/retention by construction (F2)

Scope: F1 + F2 ONLY (from `debt-dal-access-job-handler.md` task-0/0b and
`feature-audit-retention-by-construction.md`). JH/AI/ES/BE call-site
migration (F3/F4) is OUT of scope here.

Parent plans: `debt-dal-access-job-handler.md`, `feature-audit-retention-by-construction.md`.
Workflow: `docs/ai/workflow.md` — TIC is empirical; TOC = transcription.

---

## TIC — empirical census (all verified live)

### TIC-1 dal-pg write surface (F1 injection points)

`src/dal/dal.ts` — every write is a thin delegate `return (this.repo as any).X(entity, …, options)`:

| method | lines | options type | repo consumes `audit`? |
|---|---|---|---|
| `add` | 354-370 | `AuditableWriteOptions` | YES (repository.ts:884) |
| `update` | 391-407 | `AuditableWriteOptions & MatchByOptions` | YES (repo:1982) |
| `delete` | 409-425 | same | YES (repo:2123) |
| `restore` | 427-443 | same | YES (repo:2263) |
| `hardDelete` | 445-461 | same | YES (repo:2364) |
| `addMany/hardDeleteMany/restoreMany/updateMany/deleteMany` | 465-574 | `AuditableWriteOptions & BulkOptions` | NO — bulk ops never call writeAudit |
| `clone` | repo:2501 | — | YES (repo-level only) |

Repo-side audit gate (repository.ts:227, 877):
`isAuditableEntity(meta) = meta.isAuditable === true || any column.isAuditable`
→ **columns-only entities (JobRun/JobSchedule — `Auditable` mixin, NO `@AuditTrail()`) DO pass the repo gate.** Injection MUST therefore be conditioned on `hasAuditTrail(entity)` (meta-decorators.ts:839 — the class-level `@AuditTrail()` flag), NOT on isAuditableEntity — otherwise JH run/schedule writes would fire writeAudit into `job_runs_audit`/`job_schedules_audit` (orphans on live; missing tables on fresh DBs → error log spam, fire-and-forget so non-fatal but wrong).

`AuditableWriteOptions.audit` is OPTIONAL by design (types.ts:147 — "if not injected, audit is silently skipped") → the hole is in the type system itself.

`tableAuditPort()` (dal.ts:595) → `makeTableAuditPort(this.repo)` (entity-service.ts:258): writes `AuditLogEntity` to `{table}_audit` with `returning: [id]` and returns `inserted.id`. **Depends on the `id` column D4 removes — must switch to `returning: [uuid]`.**

`entityService()` (dal.ts:584) → `makeEntityService` injects `auditPort ??= makeTableAuditPort(repo)` already (entity-service.ts:407) — svc path unaffected.

### TIC-2 transaction seams

- `dal.transaction(fn)` (dal.ts:618-638): hands `new Repository(client, REPO_INTERNAL, bulkTimeoutMs)` to fn — **raw repo, no defaults → seam open.** Callers: `ai/src/services/conversation-repository.ts:122` (beginTransaction), `be/src/http/entity-write.ts` (translation writes via dal.transaction), `be/src/modules/system/translations.service.ts:303`.
- `dal.beginTransaction` → `DeferredTransaction` (deferred-transaction.ts:36-37, 790-792): **`options.audit` is REJECTED eagerly** with explicit throw — already honest, no hole, no change needed.

### TIC-3 audit DDL emission (F2 touch points)

`src/schema-diff/emit-sql-patch.ts`:
- `partitionSetupSql` (84-95): emits `create_parent` + `UPDATE part_config SET retention=…(if p.retention) retention_keep_table=…` for `t.partition`.
- `createTableSql` (98-141): PK = `@Key` cols + partition col appended (line 110).
- audit block (202-228): emitted when `t.isAuditable` (snapshot `meta.isAuditable` = `@AuditTrail()` flag):
  - line 211: `"id" bigint generated always as identity` ← D4 removes
  - line 212: conditional `"entity_id"` when parent still has surrogate `id`
  - line 219: `PRIMARY KEY ("id", "changed_at")` ← new PK shape
  - line 222: `create_parent(..., '1 month', 'range')` — **NO part_config UPDATE → retention=null live (verified)**
  - lines 224-225: indexes `entity_uuid`, `action`

`entity-decorators.ts`:
- `PartitionField(opts)` (682): `partitionOpts?: {interval?, retention?, keepTable?, premake?}` — retention conflated inside (D2 separates).
- Resolution (1172-1218): exactly-one validation, NOT NULL + date/timestamp pgType check, unique-group-must-contain-partition-key check → `partition = {column, interval:"1 month", retention, keepTable:false, premake}`.
- `AuditTrail()` (651): takes NO options today — add `{retention?: string}` for per-entity audit-retention override.
- `@Key` is MANDATORY, exactly one (line 920/923 throws) — post-D4 AuditLogEntity still needs one single-column key.

### TIC-4 maintenance executor (`src/dal/partition-maintenance.ts`)

- Iterates `metas.filter(m => m.partition)` (line 62) — **audit tables are NOT entities → invisible today.**
- Reads `part_config.retention`, falls back to `part.retention` (line 101); skips unregistered/no-retention.
- Order: children purge (`@PartitionChildOf` match on parent table+schema) → `_default` strays DELETE → `partman.run_maintenance(parent)` per parent → counts.
- `dal.partitionMaintenance(entities)` (dal.ts:712) wraps in `withClient` — one client, one tx unit.

### TIC-5 system-job wire (`ai/src/controllers/nats-sub/partition-jobs.ts`, 145 lines)

- `declareSystemJobs` (sdk `nats/system-jobs.ts:71`): prefixes `<svc>.` via `currentServiceCode()`, posts to `jobs.ctl.triggers.materialize`.
- Callable route: `makeNatsRoutes` subject `<svc>.partition_maintenance`, `queue: <svc>` (one replica), `permissions: []`, zod `nullish` schema → JSON schema.
- Gate (line 99-107): declares only when `ENTITY_REGISTRY.some(e => meta.partition?.retention)` — **WRONG post-F2: must include auditable entities (audit parents) and @Retention sweeps.**
- Retry: `setProcessInterval` 30s + `subscribeShielded(GATEWAY_ONLINE)`; seed `0 3 * * *`; run_as `system`; target `<svc>.partition_maintenance`.
- i18n: `ai.callable.partition_maintenance.{label,desc}` seeded via SQL patch `ai/db-meta/patches/20261115120000_*` (7 langs) — every service needs its own keys.
- `createMicroservice` (sdk microservice/create-microservice.ts:129-310) is **DB-agnostic**: options take `initDal`/`dalClose` callbacks, no entity registry; `entityRegistry` exists only inside `dbPatches.engine`. Auto-wire must accept a duck-typed `run` + `enabled` gate (meta access lives in dal-pg).

### TIC-6 live DB census (2026-11-17, primebrick@127.0.0.1:5432)

**49 `*_audit` tables**; real parents: ai 2, crm 15, job 3, public 4 (config_entries, organizations, role_mappings, user_profiles).

`partman.part_config` (25 rows): **only `ai.ai_conversations` has `retention='6 months'`; EVERY `*_audit` parent has `retention=null` + `retention_keep_table=true`** → partitions accumulate forever, and the default keep_table=true would DETACH not drop even if retention were set.

All audit PKs verified: `PRIMARY KEY (id, changed_at)` (8 sampled). `job_triggers_audit` cols: `id, entity_uuid, action, changed_at, changed_by, version, delta` (no `entity_id` — uuid-era shape).

Row counts: `job_triggers_audit=355` (API writes only — system writes audited zero), `user_profiles_audit=323`, `ai_conversations=7550`, `job_runs_audit=0`.

**Orphans live in DB (not emitted by any current entity)**:
- `job.job_runs_audit`, `job.job_schedules_audit` (entities carry `Auditable` mixin but NOT `@AuditTrail()` — trail dropped by design, table remains + part_config rows remain)
- `job.job_rules_audit` template (entity renamed → `job_triggers`; `partman.template_job_job_rules_audit` remains)
- `public.ai_cerebellum_audit`, `public.ai_models_audit`, `public.customers_audit` (pre-schema-move copies; live tables are `ai.*`/`crm.*`)
- `partman.template_*` rows matching all of the above

**Service registries**: all 5 US have `src/domain/entities/registry.ts`; `@AuditTrail()` counts — ai 6, crm 14, job-handler 1 (`job_triggers`), emailsender 0, webhook 0. BE: 9 `@AuditTrail()` entity files under `src/modules/**` (auth/*). `createMicroservice` users: ai, crm, emailsender, job-handler, webhook.

**BE is NOT in `service_registry`** (rows: ai, crm, emailsender, job, settings, webhook). Package `primebrick-api` → `currentServiceCode()` derives from package identity (service-identity.ts:176-178). Whether `jobs.ctl.triggers.materialize` accepts the `primebrick-api.*` namespace is runtime-verifiable (JH namespace gate = caller identity prefix).

---

## F1 — audit writes by construction (dal-pg only)

### F1.1 gateway auto-inject

In `Dal`, private helper:

```ts
private auditDefault<T extends object>(
  entity: EntityClass,
  options: WriteOptions<T> | AuditableWriteOptions<T> | undefined,
): typeof options {
  if (options?.audit !== undefined || !hasAuditTrail(entity)) return options;
  return { ...(options ?? {}), audit: this.tableAuditPort() };
}
```

Applied in exactly the 6 audit-capable delegates (`add`, `update`, `delete`,
`restore`, `hardDelete`, `clone` — Dal wraps the first five; clone is
repo-level only → inject inside Dal.clone if exposed, else leave to callers
— VERIFY: check dal.ts for `clone`). Options object is COPIED (spread) —
callers may reuse option bags. `??=` semantics: explicit `audit:` (BE
EntityAuditPort marker port, test ports) always wins; `hasAuditTrail` gate
makes Auditable-columns-only entities no-ops.

### F1.2 tx seam — `dal.transaction(fn)`

`fn` currently receives raw `new Repository(client, REPO_INTERNAL, …)`.
Wrap in a Proxy decorating ONLY the 6 audit-capable methods:

```ts
const txRepo = new Repository(client, REPO_INTERNAL, this.config.bulkTimeoutMs);
const audited = withAuditDefaults(txRepo); // Proxy: get() wraps write methods
const result = await fn(audited);
// withAuditDefaults(repo): for add/update/delete/restore/hardDelete/clone
//   (e, …args) => repo.m(e, …args, {...opts, audit: opts.audit ?? makeTableAuditPort(txRepo)})
//   gated on hasAuditTrail(e) — same rule as F1.1
```

Audit INSERTs then queue on the SAME client before COMMIT → atomic with the
write (node-pg serializes per client). DeferredTransaction untouched
(rejects audit loudly — already honest).

### F1.3 makeTableAuditPort post-D4

`returning: [Project.field(field(AuditLogEntity, "id"))]` → `[…"uuid"]`;
`return inserted.id` → `inserted.uuid`. Verify AuditPort.writeAudit return
consumers (census: none use the return value — writeAudit callers ignore it;
change signature doc only).

### F1.4 tests (final specs, dal-pg `test/`)

- gateway inject: `dal.update` on @AuditTrail entity without `audit:` → row in `{t}_audit`; on Auditable-only entity (no trail) → no write attempt, no error; explicit `audit:` port wins (spy port gets the call).
- tx seam: `dal.transaction(r => r.update(…))` → audit row INSIDE tx (verify visibility post-commit + rollback case writes nothing).
- negative: non-auditable entity write → zero audit queries.

## F2 — partition + retention by construction

### F2.1 decorators (`entity-decorators.ts`)

- `@Partition({interval?, keepTable?, premake?})` — property decorator, RANGE slicing only. `PartitionField` kept as deprecated alias delegating to `@Partition` (one-release bridge; all in-repo usages migrate now).
- `@Retention("6 months")` — property decorator on the expiry column.
  Validation in `getEntityPersistenceMeta`:
  - retention col must be date/timestamp/timestamptz pgType;
  - if entity has `@Partition`, the `@Retention` column MUST equal the partition column (else TypeError);
  - without `@Partition` → legal → row-sweep semantics (D6).
- `@AuditTrail({retention?: string})` — new optional arg; `undefined` → audit default `"12 months"`.
- Meta: `m.retention = {column, duration}`; `partition` loses `retention`
  field (moved); `m.auditRetention?: string`.

### F2.2 emit-sql-patch

- `partitionSetupSql`: retention clause reads `t.retention?.duration` (not `t.partition.retention`); `@Retention` without partition → no partman statements.
- audit block (202-228) — new shape:

```sql
CREATE TABLE IF NOT EXISTS <fq_audit> (
  "uuid" uuid NOT NULL DEFAULT uuidv7(),      -- D4: surrogate id gone
  "entity_uuid" uuid NOT NULL,
  "action" text NOT NULL,
  "changed_at" timestamptz NOT NULL,
  "changed_by" text NOT NULL DEFAULT 'system',
  "version" integer NOT NULL,
  "delta" jsonb NOT NULL,
  PRIMARY KEY ("uuid", "changed_at")
) PARTITION BY RANGE ("changed_at");
SELECT partman.create_parent('<schema>.<t>_audit','changed_at','1 month','range');
UPDATE partman.part_config
   SET retention = '12 months',              -- m.auditRetention ?? '12 months'
       retention_keep_table = false          -- DROP, never detach
 WHERE parent_table = '<schema>.<t>_audit';
```

(`entity_id` conditional column stays for legacy-surrogate parents — out of
this scope; only `id` dies.)

### F2.3 AuditLogEntity + wire

- Drop `id` + `entity_id` fields; add `@Key({generated:"manual", defaultSql:"uuidv7()"}) uuid`.
- `findAuditPage` (audit-query.ts): drop `id` projection, add `uuid`.
- `enrichAuditDeltaRefs` / be `audit-query-helper.ts`: same projection swap.
- FE `VersionHistoryPanel`: `id` → `uuid` (type + each-key + testids).

### F2.4 executor (`partition-maintenance.ts`)

```ts
const parents = [
  ...metas.filter(m => m.partition),                    // domain parents
  ...metas.filter(m => m.isAuditable).map(m => ({       // audit parents — synthesized
    tableSchema: m.tableSchema, tableName: `${m.tableName}_audit`,
    partition: { column: "changed_at", retention: m.auditRetention ?? "12 months" },
  })),
];
const sweeps = metas.filter(m => m.retention && !m.partition && !m.isAuditTrailEntity)
  .map(m => ({ table, column: m.retention.column, duration: m.retention.duration }));
// sweeps run row-level DELETE … WHERE col < now() - interval::interval
// audit parents reuse the existing parent path (children/strays/run_maintenance)
```

Report gains `sweeps: {table, column, retention, rows_deleted}[]`.

### F2.5 SDK auto-wire

`MicroserviceOptions.partitionMaintenance?: { needed: boolean; run: () => Promise<unknown> }`.
Inside createMicroservice (post-register, same point where onReady runs):
if `needed` → mount callable `<svc>.partition_maintenance` (identical shape
to ai's: zod nullish schema, queue=`<svc>`, permissions:[]) →
`declareSystemJobs([{key:"partition_maintenance", name:"<svc>-partition-maintenance",
schedule_spec:"0 3 * * *", target_subject:"<svc>.partition_maintenance",
run_as:"system"}])` → 30s retry interval + GATEWAY_ONLINE re-declare.

dal-pg exports `needsPartitionMaintenance(entities): boolean` —
`entities.some(e => hasAuditTrail(e) || meta.partition || meta.retention)`.

Service diff (each US index.ts): `partitionMaintenance: { needed:
needsPartitionMaintenance(ENTITY_REGISTRY), run: () =>
getDal().partitionMaintenance(ENTITY_REGISTRY) }` — one option, zero files.
`ai/src/controllers/nats-sub/partition-jobs.ts` DELETED (its import in
index.ts removed); per-service i18n patches add
`<svc>.callable.partition_maintenance.{label,desc}` (7 langs) for
job-handler + crm (ai's exist; emailsender/webhook gate to `needed:false` —
no auditable entities, no partitions → SDK mounts nothing).

BE (D5): manual wire in `src/index.ts` after NATS connect — same SDK helper
(`declareSystemJobs` + `makeNatsRoutes`) using its package-derived code
(`primebrick-api`); run = `getDal().partitionMaintenance(BE_REGISTRY)` over
its 9 auditable module entities. TOC step: verify JH accepts the
`primebrick-api.*` namespace (client-shield prefix); if rejected → BE runs a
local `setInterval(24h)` scheduler calling the same `run` — report the
outcome, never silently pick.

### F2.6 migration patches (live DBs — breaking-change reconciliation, same turn)

Per owning service (job → job-handler db-meta; crm.* → crm; ai.* → ai;
public.* → be):

```sql
-- migrate each live *_audit table:
ALTER TABLE <s>.<t>_audit DROP CONSTRAINT <t>_audit_pkey;
ALTER TABLE <s>.<t>_audit DROP COLUMN id;
ALTER TABLE <s>.<t>_audit ADD COLUMN uuid uuid NOT NULL DEFAULT uuidv7();
ALTER TABLE <s>.<t>_audit ADD PRIMARY KEY (uuid, changed_at);
UPDATE partman.part_config SET retention='12 months', retention_keep_table=false
 WHERE parent_table='<s>.<t>_audit';
-- orphans (dropped, not migrated):
DROP TABLE IF EXISTS job.job_runs_audit, job.job_schedules_audit CASCADE;
DROP TABLE IF EXISTS public.ai_cerebellum_audit, public.ai_models_audit, public.customers_audit CASCADE;
DELETE FROM partman.part_config WHERE parent_table IN (orphan fqs + 'job.job_rules_audit');
DROP TABLE IF EXISTS partman.template_*  -- matching orphan templates
```

(NOTE: partitioned parents with partitions — ALTER on parent propagates to
children in PG for PK/col changes; partman children of pre-change partitions
keep the old shape → acceptable: old partitions age out and drop.)

### F2.7 docs (D6 — document abundantly)

- dal-pg `docs/dev-guide/partitioning.mdx` — @Partition/@Retention split, audit auto-retention, sweep semantics.
- dal-pg `docs/dev-guide/audit-trail.mdx` — new audit shape (uuid PK, no id/entity_id), auto-inject contract.
- dal-pg `docs/ai/dal-usage-guide.md` + AGENTS.md conventions.
- SDK dev-guide — `partitionMaintenance` option.
- us-v3 + be-v3 rules/docs where partition/retention is mentioned.

## Open decisions for user (doubt protocol — asked, defaults marked)

1. **Audit PK shape**: (a) `uuid uuid DEFAULT uuidv7()` + PK `(uuid, changed_at)` ← RECOMMENDED (single-@Key meta rule holds, wire key `uuid`, doctrine uuid-PK). (b) composite `(entity_uuid, version, changed_at)` — saves 16B/row but needs a meta-validation exception for AuditLogEntity.
2. **Decorator names**: `@Partition` new + `PartitionField` alias-deprecated ← RECOMMENDED (your vocabulary) vs keep `@PartitionField`.
3. **BE namespace**: materialize as `primebrick-api.*` (verify in TOC) vs in-process 24h scheduler fallback ← RECOMMENDED try-wire-first.
4. **Audit `uuid` in wire**: field name `uuid` (FE `entry.uuid`) ← default.

## Verification (each phase ends here)

- F1: dal-pg `pnpm test` (691+) + new specs; live probe — trigger a system write path, assert `*_audit` row; JH disable/enable → `job_triggers_audit` rows.
- F2: dal-pg tests; generated patch diff shows uuid PK + retention UPDATE; `pnpm db:meta:compare` per service produces the migration; apply on live dev DB; `part_config` shows retention=12 months/keep=false on every audit parent; BE+US typecheck+standards+tests; FE panel renders re-keyed entries; JH job materialized for ai/jh/crm (and primebrick-api or fallback).
