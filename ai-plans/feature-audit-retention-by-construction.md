# Feature — audit-table retention BY CONSTRUCTION (pg_partman, zero per-service code)

> Related: `debt-dal-access-job-handler.md` — the audit auto-inject fix makes
> audit volume grow with write traffic; this plan is the retention side of
> the same wire. Logical framing (user): audit is append-only, 1-1 with the
> parent entity's write traffic — an operating cost (disk + db weight), not
> a maintenance cost. Without retention every `*_audit` saturates over time.

## Status: ⚪ TODO — Plan date: 2026-11-17 / TIC complete, awaiting PROCEED

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | dal-pg `emit-sql-patch`: emit `UPDATE partman.part_config SET retention='<default>'` for EVERY `*_audit` table (currently only `create_parent`, never expires) | ⏳ not done | — | the one-line gap: partitions are created monthly but never dropped — decision D1 (retention value + per-entity override) |
| 2 | dal-pg entity meta: per-entity audit-retention option (e.g. `auditRetention` / opt-out for compliance tables) | ⏳ not done | — | default wins; `null` = keep forever for security-relevant entities — decision D1 |
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

### C.0 The decorator surface (verified — the user's instinct is already the design)

The project's partitioning IS decorator-declared on the entity class today:

- `@PartitionField({ interval, retention, keepTable })` — **property**
  decorator on the partition-key column (the key IS a column; PG requires it
  inside every unique constraint — the emitter auto-adds it to the PK,
  which is why audit PKs are `(id, changed_at)`).
- `@PartitionChildOf({ parent, ref })` — **class** decorator: children carry
  NO partition key at all; they are logically attached to the parent's
  retention unit and purged set-based before the drop.

So the polymorphism idea is right and mostly already built: audit tables are
EMITTED from the same entity meta — adding `auditRetention` to the meta feeds
the identical emission path. What audit needs is only the retention VALUE
(partition shape is fixed: `changed_at`, `1 month` — no dev choice):

- **`@AuditRetention("12 months")` class decorator** (or an `Auditable`
  option) → entity meta `auditRetention` → emit-sql-patch writes the
  `part_config` UPDATE. Absent → global default; `"forever"`/`null` →
  compliance opt-out (no retention UPDATE emitted).

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

- **D1 — default retention value**: `12 months`? `24`? And which entities
  opt out forever (`auth_events`, security trails)? My default proposal:
  `12 months` global + meta opt-out.
- **D2 — retention knob shape**: `@AuditRetention("12 months")` class
  decorator (separate concern, composable with the `Auditable` mixin) vs an
  `Auditable({ retention: "12 months" })` mixin option (one declaration site
  for "this entity is audited + how long"). Default proposal: the mixin
  option — audit-ness and audit-retention are one concept at one site.
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
