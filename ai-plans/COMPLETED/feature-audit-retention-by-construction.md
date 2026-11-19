# Feature — audit-table retention BY CONSTRUCTION (pg_partman, zero per-service code)

> Related: `debt-dal-access-job-handler.md` — the audit auto-inject fix makes
> audit volume grow with write traffic; this plan is the retention side of
> the same wire. Logical framing (user): audit is append-only, 1-1 with the
> parent entity's write traffic — an operating cost (disk + db weight), not
> a maintenance cost. Without retention every `*_audit` saturates over time.

## Status: ✅ DONE — verified empirically 2026-12-21 (moved to COMPLETED)

> All tasks landed: `partman.part_config` shows `retention='12 months'` on
> EVERY `*_audit` parent (job+crm live-verified); audit tables have PK
> `(uuid, changed_at)` with no `id`/`entity_id` columns (the uuid-PK shape
> from F1+F2 superseded the draft `(entity_uuid, changed_at)` — same D4
> intent); `@Retention` decorator live (`entity-decorators.ts:752`) with
> `@PartitionField` split; SDK auto-mounts `<svc>.partition_maintenance` +
> auto-declares the system trigger (`partition-maintenance-job.ts`,
> `create-microservice.ts:1016` needed-gate); ai `partition-jobs.ts`
> deleted (auto-wire absorbs it); JH wires
> `dalMigrations.makePartitionMaintenanceJob(ENTITY_REGISTRY)`.

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 0 | **D4 decided — eradicate audit-row `id`**: emit-sql-patch drops `id`/`entity_id` from new audit tables → PK `(entity_uuid, changed_at[, version])`; `AuditLogEntity` class updated; FE `VersionHistoryPanel` re-keyed (D7); migration patch per service on live DBs (drop PK + columns on partitioned parents) | ⏳ not done | — | user: "debito tecnico da fare subito" |
| 1 | dal-pg `emit-sql-patch`: emit `UPDATE partman.part_config SET retention='12 months'` for EVERY `*_audit` table (currently only `create_parent`, never expires) | ⏳ not done | — | D1: audit default 12mo; global `@Retention`-absent default 3mo |
| 2 | dal-pg: `@Retention("…")` decorator + meta field; `@PartitionField` loses `retention` option (split partition ≠ retention); migrate `ai_conversations` decl; `job_run` gets its own retention value if different (see debt plan A) | ⏳ not done | — | D2 decided; D6: also row-level retention on plain tables |
| 3 | SDK `createMicroservice`: auto-mount `<svc>.partition_maintenance` callable + auto-declare `partition-maintenance` system trigger when registry has ANY partitioned/auditable entity | ⏳ not done | — | hoists ai's `partition-jobs.ts` into the governed boot path; the trigger materializes via existing `declareSystemJobs` → JH arms JetStream |
| 4 | ai: delete `controllers/nats-sub/partition-jobs.ts` (absorbed by SDK auto-wire) — keep behavior parity (armed flag, retry loop, `PartitionMaintenanceSchema` payload contract) | ⏳ not done | — | verify the auto-declared trigger key matches the existing materialized row or migrate it |
| 5 | `dal.partitionMaintenance` gate check: cover audit parents — today ai gates declaration on domain `partition.retention` only | ⏳ not done | — | after task 1, every auditable entity implies a maintained parent |
| 6 | Verify: unit tests (emit-sql-patch retention UPDATE per entity, auto-declare conditions); live — job-handler materializes the trigger for every registered service; `partman.part_config.retention` set on all `*_audit`; run the callable once, assert `run_maintenance_proc` executed + report shape | ⏳ not done | — | |

---

## A. What already exists (verified, not memory)

The machinery is ~90% built — the missing part is the "by construction" wire:

1. **Audit tables are ALREADY partitioned by construction** —
   `emit-sql-patch.ts:220`: every auditable entity emits
   `*_audit PARTITION BY RANGE ("changed_at")` +
   `partman.create_parent('<schema>.<t>_audit','changed_at','1 month','range')`.
   `pg_partman` extension is created per schema (verified in `ai`,
   `job-handler`, `crm`, `be` init patches).

2. **Domain-entity retention ALREADY works end-to-end** — `@PartitionField(
   {retention, keepTable})` → `partitionSetupSql()` emits
   `UPDATE partman.part_config SET retention='…'` (e.g.
   `ai_conversations` → `retention='6 months'` in `ai/db-meta/patches/0001`).

3. **The retention executor EXISTS** — `dal.partitionMaintenance(entities)`
   (`dal/partition-maintenance.ts`): purges `@PartitionChildOf` children of
   expired parents BEFORE the partition drop, deletes expired strays from the
   default partition, then calls `partman.run_maintenance_proc()`.

4. **The system-job wiring EXISTS** — `ai/src/controllers/nats-sub/
   partition-jobs.ts`: declares `ai-partition-maintenance` via
   `declareSystemJobs` → `jobs.ctl.triggers.materialize` on primebrick-job →
   JH arms the JetStream schedule → due-forwarder republishes onto the
   `ai.partition_maintenance` callable → `dal.partitionMaintenance(
   ENTITY_REGISTRY)` runs in-process. Fully governed contract
   (zod schema + census projection + queue work-item).

## B. The three gaps (why audit tables grow forever today)

1. **No `part_config` retention for `*_audit`** — the audit emission path
   calls `create_parent` but skips `partitionSetupSql` (that only runs for
   `@PartitionField` domain entities). Result: monthly partitions are
   pre-created indefinitely and NEVER dropped → partitioning without
   retention = organized garbage, disk still saturates.

2. **The maintenance job is hand-authored per service** — only `ai` declares
   it, self-gated on domain `partition.retention` entities. `job-handler`,
   `crm`, `emailsender`, `webhook`, `be` have partitioned audit tables and NO
   maintenance job → the executor is never invoked there.

3. **The gate condition is wrong after the fix** — once audits carry
   retention, the declare-condition is "registry has auditable OR partitioned
   entities" (effectively always), not "has `@PartitionField` retention".

## C. Design — what "by construction" means

### C.0 The decorator surface — redesigned per user feedback (partition ≠ retention)

**User correction 1 — `id` PK claim was stale**: entity surrogate `id` IS
eradicated (uuid PKs; `entity_id` in audit is conditional, dropped for
uuid-PK entities — verified `repository.ts:102,3094`). BUT the audit ROW's
own `"id" bigint identity` is still emitted today as
`PRIMARY KEY ("id","changed_at")` — flag for decision D4 whether to drop it
in favor of `(entity_uuid, changed_at[, version])`.

**User correction 2 — partition alone does NOT retain**: `PARTITION BY` only
slices the table; dropping needs retention. Carrying `retention` inside
`@PartitionField` conflates the two concepts. Redesign:

- `@Partition({ interval, keepTable, premake })` — property decorator on the
  partition-key column: HOW the table is sliced. (Rename of today's
  `@PartitionField` minus `retention` — or keep the name, drop the option.)
- `@Retention("6 months")` — NEW decorator, orthogonal: WHEN content
  expires. Associated to the partition at class/column level; its meaning
  does not depend on partitioning — on a partitioned table it drives
  partition drops, on a plain table it could drive row-level sweeps (the
  executor already does those for default-partition strays).
- The dev composes both: `@Partition({interval:"1 month"})` on the key
  column + `@Retention("6 months")` — retention defaults exist, override
  stays possible (part_config is writable; trigger/ops can adjust later).
- **Audit by construction**: `changed_at` partition is fixed emission
  (no dev choice); `@Retention` on the entity (or its absence → global
  default) feeds the audit `part_config` UPDATE through the SAME meta →
  emit path. One decorator, two consumers — the polymorphism the user
  described.
- Migration: `ai_conversations` declaration splits
  `@PartitionField({interval:"1 month", retention:"6 months"})` →
  `@Partition({interval:"1 month"})` + `@Retention("6 months")`.

### What the job actually does (verified end-to-end)

```
decl:     declareSystemJobs([{key, schedule_spec, target_subject, run_as}])
          → NATS req jobs.ctl.triggers.materialize → JH reconcile upserts
          job.job_triggers (system_key) — row is declaration-of-record
arm:      JH triggers-engine arms JetStream schedule → publishes due msgs
          on jobs.schedule.job.<uuid> at cron times
fire:     due-forwarder republishes onto target_subject =
          <svc>.partition_maintenance — queue work-item, exactly ONE
          replica consumes
execute:  the callable handler = dal.partitionMaintenance(ENTITY_REGISTRY)
          — runs IN the owning service (it owns the DAL pool + schema)
```

`partitionMaintenance` per partitioned parent (meta → `part_config`):
children purge (set-based DELETE of `@PartitionChildOf` rows whose parent
expired — before drop, since DDL drops bypass FK semantics) → default-
partition strays deleted row-level → `partman.run_maintenance(parent)` drops
expired partitions (or detaches if `keepTable`) and premakes future ones.
Single client = one transactional unit. Yes — the destination NAT route is
a predefined always-same subject: `<svc>.partition_maintenance` (SDK
`system-jobs.ts` auto-prefixes `<this-service>.`; handler is already generic).

### C.1 Retention emission (dal-pg, `emit-sql-patch`)

```ts
// inside the auditable block, after create_parent:
const retention = t.auditRetention ?? DEFAULT_AUDIT_RETENTION; // e.g. '12 months'
if (retention !== null) {
  safe.push(
    `UPDATE partman.part_config SET retention = '${retention}', ` +
    `retention_keep_table = false WHERE parent_table = '${t.schema}.${auditTableName}';`,
  );
}
```

`retention = null` opt-out for compliance/security entities whose trail must
live forever (e.g. `auth_events`? user decides).

### C.2 Auto-wire (SDK `createMicroservice`)

Lift the ai pattern into the governed boot path:

```ts
// after entity registry + dal init, when registry has auditable|partitioned:
// 1. auto-mount callable route <svc>.partition_maintenance
//    (body: dal.partitionMaintenance(ENTITY_REGISTRY) — generic already)
// 2. auto-declare system trigger via declareSystemJobs
//    (key `<svc>-partition-maintenance`, schedule, run_as:"system")
```

- Retry/armed semantics from ai's file preserved (boot-degraded tolerant,
  retry loop until primebrick-job answers).
- Zero per-service code; ai's file is deleted once auto-wire lands.

### C.3 Honest notes

- `retention_keep_table`: default `false` (DROP) — audit is a cost center,
  detached archive tables would defeat the point. If an entity ever needs
  archive-detach, it's a per-entity meta flag later.
- Existing `*_audit` tables: retention applies via the SAME emitted UPDATE —
  `part_config` already exists for every audit parent, so the patch's UPDATE
  works on already-deployed databases (no re-partitioning needed — verified:
  `part_config` rows exist since `create_parent` ran at init).
- Cost check: `run_maintenance_proc` drop = metadata-only partition detach —
  cheap. The `PartitionChildOf` purge + default-partition sweep are the
  bounded parts.

## D. Decisions for the user

- **D1 — retention values**: ✅ DECIDED — audit tables `12 months`;
  global default retention `3 months` (domain `@Partition` without explicit
  `@Retention`, and any future plain-retention surface).
- **D2 — retention knob**: ✅ DECIDED — `@Retention("…")` decorator,
  orthogonal to `@Partition`.
- **D3 — schedule**: ai uses `"0 3 * * *"` (daily 03:00, verified
  `partition-jobs.ts:49`). Default: same spec for every service.
- **D4 — audit row `id`**: ✅ DECIDED — eradicate now. Consequence chain:
  PK `(entity_uuid, changed_at)` (partition col required; consider
  `version` for uniqueness); `AuditLogEntity` class drops `id`; FE
  `VersionHistoryPanel` keys rows by `entry.id` — wire key becomes
  `entity_uuid:version:changed_at` composite or an added `uuid` column
  (sub-decision below). Live migration: ALTER on partitioned parents
  (drop PK + column — propagates to partitions; default partition too) —
  patch per service.
- **D5 — BE schema coverage**: `partman.part_config` is DB-global, but the
  executor maintains only its own schema (isolation). BE does NOT boot via
  SDK `createMicroservice` — no auto-wire path exists there. Options:
  (a) BE gets an equivalent hand-wired job (it has dal + can call SDK
  `declareSystemJobs` over its NATS if present — verify at TOC);
  (b) leave BE audits maintained by a platform-owned path. Default
  proposal: (a) — same mechanism, wired manually in BE boot.
- **D6 — `@Retention` on NON-partitioned tables**: does the decorator also
  enable row-level retention sweeps on plain tables (executor already does
  row-level deletes for strays — extension is mechanical)? Default
  proposal: YES — same knob, same executor; makes `@Retention` a real
  first-class concept, not a partition accessory.
- **D7 — audit wire `id` replacement**: FE keys entries by `entry.id`.
  Options: (a) composite client key `entity_uuid:version:changed_at`
  (zero schema cost); (b) add `uuid` column to audit tables (consistent
  uuid-PK story, +16B/row on the highest-volume table). Default proposal:
  (a).
- **D3 — schedule**: ai uses a seed schedule (check `SEED_SCHEDULE` value at
  TOC — likely daily/weekly); default: inherit same spec globally.

## E. The "second partition type" — search result (honest)

All `PARTITION BY` in every patch is `RANGE` and every real key is temporal
(`changed_at` audits, `last_seen_at` conversations). No LIST/HASH anywhere.
The genuinely different mechanism present is `@PartitionChildOf`: children
(`ai_feedback`, `ai_messages`) carry NO partition key of their own — they
are partitioned **logically by parent ownership** and expire through the
parent's time axis (set-based purge before the drop). If the remembered
"non-temporal" partitioning is hash/list sharding — it does not exist in
the codebase; the parent-driven retention model is the only second thing.

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.

## Decisions — CLOSED (all resolved in TIC)

- **D1** audit retention 12mo, global default 3mo — CLOSED (user).
- **D2** `@Retention` separate decorator, orthogonal to `@Partition` — CLOSED (user).
- **D4** audit-row surrogate `id` eradicated immediately (debt, user-mandated) — CLOSED.
- **D5** BE does NOT get SDK auto-wire (BE ≠ `createMicroservice`, NODE vs BUN, porting soon). BE wires the same pieces manually at boot (`declareSystemJobs` + `dal.partitionMaintenance(ENTITY_REGISTRY)`) — BE-only, minimal shared surface — CLOSED (user).
- **D6** `@Retention` legal on NON-partitioned tables → row-level sweep by same executor. Document in all repos + dev-guide (abundantly) — CLOSED (user).
- **D7** wire `id`: the audit API DOES project `id: bigint` (audit-query.ts:103) and `VersionHistoryEntry` types it — but it is the surrogate bigint being eradicated. Post-D4: drop `id` from the wire; panel re-keys to `entity_uuid:version` (unique per entity write). No uuid column added (16B/row waste on the heaviest table) — CLOSED.
- **Retention default**: 3mo global applies when entity has `@Partition`/`@Retention` absent? NO — clarified: global default 3mo applies to audit tables? NO — audit = 12mo. Global 3mo = default when dev declares `@Retention`-less `@Partition`? DECIDE: default applies only where retention is *implied* (audit=12mo fixed, domain partition requires explicit `@Retention` — no silent 3mo on domain data). Recorded: global 3mo = fallback for any `@Retention`-less retention-bearing surface.
