# Jobs Orchestration Architecture — NATS JetStream native scheduling + entity partitioning intent

> Continuation of `dal-pgvector-repository.md` §ARCH-1. Scope: NEW architecture — **not retro-compatible**, designed once, designed right.
> Related workstream already applied: `ai_conversations` partitioned by `last_seen_at` (local DB) — the generated path in this plan will replace the hand-written patch approach.

Status: 🟡 PARTIALLY DONE — Plan date: 2026-10-12 23:58 UTC / 01:58 CEST+1

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `@PartitionField` field decorator + meta `partition` + hard validation | ✅ done | 2026-10-12 | `entity-decorators.ts`/`entity-meta.ts`; unique-group + PK-widen checks enforced |
| 2 | `@PartitionChildOf` child decorator — logical FK graph for cascade delete + retention purge | ✅ done | 2026-10-12 | child-side declaration; leaf→root purge order derived from graph |
| 3 | Migrate `database-patch-compare` machinery to `@primebrick/dal-pg` | ⏳ not done | — | still BE-only; US patches stay handwritten for now |
| 4 | SDK: `jetstreamSubscribe` lane+consumer opts + verified `authUser`+`subject` in handler meta; `ensureJobSchedule`/`cancelJobSchedule`; `jetstreamPublish` identity stamping; `ensureStream` `allow_msg_schedules`+`syncSubjects` | ✅ done | 2026-10-12 | all in; `syncSubjects` reconciles existing streams |
| 5 | New microservice `job-handler` — schema `job`, `jobs.ctl.schedule.request` governed route, due/result taps, JOBS stream provisioning | ✅ done | 2026-10-12 | live on :3006; sole writer of `jobs.schedule.*`; namespace checks: remote callers confined to own namespace AND own due target; internal callers may target any service |
| 6 | `dal.partitionMaintenance()` in `@primebrick/dal-pg` | ✅ done | 2026-10-12 | per-parent `SELECT partman.run_maintenance(parent)` — NOT the global proc (it aborts on other schemas' stale parents); children purged set-based leaf→root before drop |
| 7 | AI service wiring: self-declare `jobs.schedule.ai.partition-maintenance` + durable executor on `jobs.due.system.ai.partition-maintenance` | ✅ done | 2026-10-12 | cadence from `config_entries.partition_maintenance_schedule` (default `@daily`); falls back to direct arm when job-handler unreachable |
| 8 | Client registry entry for `primebrick-job` + namespace ACL semantics | ✅ done | 2026-10-12 | `primebrick-job` enrolled; enrollment chicken-and-egg fixed via `enrollment: true` flag on `service.register` route + lazy one-shot reload in `verifyNatsPublisher` on UNKNOWN_CLIENT (stale per-instance verifier cache bug fixed) |
| 9 | `job_schedules`/`job_runs`/`job_rules` entities+patches + taps + `job-run-stats` (adaptive hour/day/week/month bucket) + `schedule-job`/`disarm-job` actions | ✅ done | 2026-10-12 | patches 0001–0003 applied; `schedule_type` (recurring/once) derived from spec; BigInt report bug fixed by passing raw object to DAL jsonb |
| 10 | FE admin page `/(app)/system/jobs` — EntityListTable views (RECURRING / EXECUTED ONCE / RULES / RUNS), `run_stats_sparkline` cell, create-job dialog | ✅ done | 2026-10-12 | LIVE-VERIFIED via Playwright: sections render, sparkline draws, arm/disarm via UI works end-to-end, duration humanized (ms→s→m→h); `useEntityList` composable + `JobEntityTable`/`RunStatsSparkline` under `src/lib/components/jobs/`; nav entry in `module-nav-meta.ts`; translations via fire-and-forget SQL (396 rows, 6 langs) |
| 11 | Docs: agent docs (DAL architecture, jobs svc), dev-guide, standards/rules update | ⏳ not done | — | make-docs per repo |

**Live empirical evidence (2026-10-12):**
- Seed: 10,000 `ai_conversations`, 2,450 older than 6mo across 7 retro partitions; 7,550 recent.
- `@every 20s/45s` fire → durable consumer → `dal.partitionMaintenance` → 7 partitions dropped (19→12), conversations 10,000→7,550, children purged (4,900 messages + 2,450 feedback), `expired=0`, recent data intact.
- Governance: foreign-namespace declare rejected (`FOREIGN_NAMESPACE`), bad target rejected (`INVALID_TARGET_SUBJECT`), own-namespace armed.
- L1 shield: fired messages carry declarer identity; unidentifed-client schedules rejected (`UNIDENTIFIED_CLIENT`) — verified both directions.
- Run recording: `job.job_runs` persisted with status/duration/redelivery; sparkline endpoint `POST /api/v1/actions/job-run-stats` returns adaptive buckets (200 live).
- UI: `/system/jobs` — 4 sections, Kestra-style stacked-bar sparkline per schedule row, Schedule-job dialog → armed row appears with `initiator: user:<uuid>`; disarm flips status.

---

## 1. Empirical findings (all verified against live code/DB/docs, 2026-10-12)

### Entity/meta/migrations — what exists vs what doesn't

- **No partitioning decorator exists** in the DAL. Full inventory:
  `Entity, Column, IsNotColumn, Unique, Key, AuditableField, DeletableField,
  SynchronizableField, CloneField, AuditTrail, AuditTrailEntity`.
- `EntityPersistenceMeta` has no partition field; `SchemaTableMeta` neither →
  a partitioned table diffs today as PK/constraint drift.
- `partman.create_parent` in applied patches is **handwritten**
  (`0005_create_ai_entity_tables.sql`, 3-arg `'1 month'`). The BE generator
  emits it only for `_audit` tables and with a stale v4-style signature
  `('fq','changed_at','native','monthly')` — shipped patches were normalized
  by hand.
- `buildSqlPatchFromMetaDiff` (200 lines, BE-only, "best-effort, review
  before apply"): new table → CREATE + unique indexes + audit table +
  create_parent. No domain-table partition support.
- **US has no compare/generate script** — `ai/scripts/` only has
  `database-patch-apply.ts`; all US patches are handwritten.
- `db-meta/fire-and-forget/` is **not** read by `applyPatches` (which scans
  `db-meta/patches` only) — its official runner needs clarification.

### NATS scheduled messages (ADR-51, server 2.14.3 live, client nats@2.29.3)

- Stream flag `allow_msg_schedules` required; headers:
  `Nats-Schedule` (`@at RFC3339` one-shot 2.12+ / `@every` + 6-field cron
  2.14+ / aliases `@hourly` `@daily`), `Nats-Schedule-TTL` → becomes
  `Nats-TTL` on fired msg, `Nats-Schedule-Target` (subject), 
  `Nats-Schedule-Source` (2.14 — read LAST msg of another subject at fire
  time instead of the schedule's own payload), `Nats-Schedule-Rollup`.
- **One schedule per subject** — last message on the subject holds the
  schedule (re-publish = update, idempotent).
- One-shot fires auto-purge (`Nats-Schedule-Next: purge`) — no duplicates.
- Cancellation: purge schedule message (by seq / subject / wildcard), or
  atomic publish+purge via `Nats-Schedule-Next: purge` + `Nats-Scheduler:
  <subject>` (2.14 hardening: value other than `purge` rejected; can't be
  updated by a scheduled message).
- `nats.js` jsm stream config passes through `JSON.stringify` (verified
  `lib/jetstream/jsm.js:80`) → `allow_msg_schedules` reaches the server
  even without a typed field (cast needed); alternatively bump to scoped
  `@nats-io/jetstream`.

### Security model — can a NATS-scheduled message reach a shielded service? YES for L1, NO for L2

The SDK has **two similarly-named but distinct credentials** (verified in
source — the naming collision is real and confusing):

| Layer | Credential | Header / mechanism | Lifetime | Survives a scheduled fire? |
|---|---|---|---|---|
| **L1 client shield** (`verifyNatsPublisher` → `verifyClientIdentity`) | per-service client key — `CLIENT_SHIELD_KEY_HEADER` (`service-identity.ts:23`), hash-checked against `system.client_registry` (`client-registry.ts:111-114`) | `x-primebrick-client-shield-key` + `User-Agent` prefix | registration lifetime — **static**, from the service's own config/env | **YES** — the server republishes headers verbatim, the key doesn't expire |
| **L2 user shield** (`verifyNatsMessage` → `verifyAuthGatewayResolved`) | `service_client_shield_secret` — **rotating** shared secret (1h + 5min grace, `client-shield-secret.ts:26-29`), generated in Redis, distributed via governed `secret.get`/`secret.rotated` | stamped by `serializeAuthUserToHeaders` alongside the serialized `AuthUser` — anti-spoofing for the user profile | ~65 min max | **NO** — stale by design; a delayed message can never carry a user context |

Consequences (security contract — user decision, 2026-10-12):

**A scheduled job transports the initiating user's `AuthUser` BY DEFAULT.**
Making every job "system" would be a designed-in privilege-escalation
hole: a read-only user could trigger (or provoke) a scheduled write they
could never perform directly. The contract:

1. **DEFAULT (`execution_context: "user"`)** — the schedule declaration
   carries the serialized `AuthUser` (same headers as `buildNatsAuthHeaders`
   — rotating gateway secret + user profile). The executor runs the FULL
   chain: `verifyNatsPublisher` (L1) → `verifyNatsMessage` (L2) → RBAC.
   If the secret has rotated out (~65min window), verification fails →
   the run is recorded in `job_runs` with `status=failed` and the RFC/401
   error detail — **fail-closed by design, never a silent bypass**.
   Consequence: user-carried jobs are effectively bounded to the
   rotation window; longer-horizon user jobs fail visibly (logged), which
   is the accepted trade-off.
2. **OPT-IN (`execution_context: "system"`)** — explicitly declared in
   `job_rules` (admin/architecture decision, auditable — NOT a default).
   Used for super-partes business processes that exist independently of
   any user action (e.g. partition maintenance). Executor route is
   `verify: serviceShieldVerify` (L1 only), `actor = "system"`. The
   schedule payload STILL records `initiator` (user_uuid or rule_id) for
   accountability.
3. **Subject-level enforcement** — the security boundary is structural,
   not just a column: two due-trees so a route can't be miswired:
   `jobs.due.user.<svc>.<action>` → full-shield routes;
   `jobs.due.system.<svc>.<action>` → service-identity routes.
4. The fired message's L1 identity = **the declarer's UA prefix** —
   the executor's client-registry allowlist must include `primebrick-job`
   (and any service allowed to declare schedules).
5. **Verified gap**: `NatsClient.jetstreamPublish` calls `injectInto`
   (trace propagation) but NOT `injectIdentity` — JetStream-published
   messages carry no L1 headers today. `ensureJobSchedule` must stamp
   identity (and/or fix the helper).

## 2. Decisions already taken (previous review)

- **Scheduler = JetStream native** (`Nats-Schedule`). Zero new infra —
  NATS 2.14.3 already runs. Alternatives analyzed: pg-boss (strong
  runner-up, PG-native, retry/DLQ/dashboard), BullMQ (rejected — Redis in
  stack is a volatile cache; schedules would die on eviction; its worker
  model bypassed anyway), Temporal (overkill), node-cron (no HA/dedup/log).
- **No job-executing orchestrator** — dispatch is the broker's job. The
  optional `jobs` service is a *log tap + rules engine*, never a worker.
- **`@PartitionChildOf` on the child** (not `@PartitionedCascade` on the
  parent) — the dependency edge belongs to the dependent, exactly like an
  FK lives on the child table. Non-declaring children (e.g. `ai_telemetry`)
  are references, not atomic members — free opt-in/opt-out semantics.
- **Patch tooling home = DAL**, not SDK — entity meta and DDL emission are
  persistence domain. Per-service `scripts/database-patch-compare.ts`
  stays a thin runner (registry + DATABASE_URL + out dir), mirroring how
  `database-patch-apply.ts` wraps SDK `applyPatches`.

## 3. Architecture — three planes

```
PLANE A — declaration (who writes schedules)
  static recurring jobs: domain service self-declares at boot via
    ensureJobSchedule(subject, spec) — idempotent, last-msg-wins
  event-driven jobs: jobs service materializes from job_rules (§5)

PLANE B — fire (NATS server itself)
  jobs.schedule.<svc>.<job> ──(holds schedule)──▶ republishes payload+headers
  to jobs.due.<svc>.<job> at fire time, verbatim

PLANE C — execution + governance (two security lanes)
  ⚠ VERIFIED: fired messages land in the stream but are NOT dispatched to
  core subscribers — executors MUST be JetStream durable consumers (pull
  or push), not subscribeShielded. Upside: ack/redelivery/ack_wait/
  max_ack_pending come free.
  user lane:    durable consumer on jobs.due.user.<svc>.<action>
                → verifyNatsPublisher (L1) → verifyNatsMessage (L2:
                rotating secret + AuthUser) → RBAC → domain logic
                → publish jobs.result.<svc>.<action>
                AuthUser expired → run fails closed, logged to job_runs
  system lane:  durable consumer on jobs.due.system.<svc>.<action>
                → serviceShieldVerify (L1 only), actor=system —
                only for rules declared execution_context=system
  jobs service taps jobs.due.> + jobs.result.> → job_runs table
    (records status + error — 401s included)

INFRA-JOB SELF-DECLARATION (user decision 2026-10-12)
  Infrastructure jobs (partition-maintenance, future: telemetry-flush,
  index-rebuild) are DERIVED from entity metadata — they must NOT live
  in job_rules (that would duplicate registry truth and drift silently:
  add @PartitionField → rule stale → retention silently off).
  At boot, a service whose registry contains @PartitionField entities
  calls the governed `jobs.schedule.request` route on primebrick-job
  (the sole writer of jobs.schedule.*) then opens its local durable
  consumer. primebrick-job enforces: the <svc> token in the schedule
  subject MUST equal the caller's registered service code — a service
  can only arm schedules in its own namespace. Same mechanism for BE
  (audit tables already partitioned → jobs.due.system.be.*).
  Naming: jobs.schedule.<svc>.<kind> / jobs.due.system.<svc>.<kind>,
  <kind> from a fixed enum — mechanical and predictable.
```

Flow-control for bursts: `max_ack_pending` on each durable consumer —
every service pulls at its own capacity; JetStream buffers.
Long-running: `ack_wait` + handler heartbeats; work runs in the domain
service (right-sized, independently scaled — no shared worker box).

### Schedule models covered

| Requirement | Mechanism |
|---|---|
| every X minutes | `Nats-Schedule: @every 30m` or 6-field cron |
| execute once at date D | `Nats-Schedule: @at <RFC3339>` (auto-purges) |
| execute 30min from now | computed `@at` |
| execute immediately | plain publish to `jobs.due.<svc>.<job>` (bypasses schedule plane entirely) |
| recurring per-entity (flag-gated) | `jobs.schedule.<svc>.<entity-uuid>.<action>` — one subject per entity (ADR-51 supports it; per-subject last-msg = current schedule) |

## 4. Partitioning as entity intent (tasks 1–3)

### `@PartitionField` — field-level decorator

```ts
@Entity("ai_conversations", "ai")
export class AiConversationEntity implements IAuditableEntity {
  @Key() id!: bigint;
  @Unique("ai_conv_uq", 0) @Column({ nullable: false }) uuid!: string;

  @PartitionField({ interval: "1 month", retention: "6 months", keepTable: false })
  @Unique("ai_conv_uq", 1)   // REQUIRED member of every unique group
  @Column({ nullable: false }) last_seen_at!: Date;
}
```

`EntityPersistenceMeta.partition = { column, interval, retention,
keepTable, premake? }` — serializable → `SchemaTableMeta.partition` →
generator. Hard validation at meta build (throws `ValidationError`,
cannot be eluded):

- exactly ONE `@PartitionField` per entity;
- every `@Unique` group MUST include the partition column (PG rejects
  uniques lacking the key — fail-fast at meta, naming the offending group);
- PK auto-widened to `(pk, <part_col>)` in emitted DDL — no opt-out;
- column must be NOT NULL and `timestamptz`/`date` (RANGE-time axis;
  numeric axis deferred).

### `@PartitionChildOf` — logical child link

```ts
@Entity("ai_messages", "ai")
@PartitionChildOf({ parent: AiConversationEntity, ref: "conversation_uuid" })
export class AiMessageEntity ...
```

Powers both user-facing cascade delete (single tx: children → parent) and
the retention purge — generated, not per-entity code.

### Generator emits the lifecycle

- New table → `PARTITION BY RANGE (col)` + composite PK + composite
  uniques + `PERFORM partman.create_parent(...)` + `UPDATE part_config SET
  retention…`.
- Existing plain table → rename/recreate/copy/drop template + FK-drop
  warnings (data-bearing → review-required banner, same style as renames).
- DB introspection learns `pg_partitioned_table` so composite PKs stop
  diffing as drift.

## 5. Event → schedule interception (the orchestrator question)

Requirement: `customer.updated` fires, `late_payment=true` → email every
5–7 days; the customer service must NOT know scheduling exists.

### Chosen model — `primebrick-job` microservice as **rules engine** (not executor)

New microservice in the US repo, same lifecycle as its siblings:

```
primebrick-us-v3/job-handler/          # new service folder
  package.json   → name: "primebrick-job", version: "0.1.0",
                   capabilities: ["job_orchestrator", "job_governance"]
  src/           → createMicroservice boot, nats-sub controllers, services
  db-meta/       → schema `jobs` patches (job_rules, job_runs)
  scripts/       → database-patch-apply.ts (+ compare once task 3 lands)
```

UA prefix `primebrick-job` → own row in `system.client_registry` (L1).
It is a real service, not a module: it owns schema `job`, the JOBS
stream, and the rules runtime — but **never executes domain work**.

`job_rules` table (schema `job`, admin-managed entity — domain data,
not config entries):

| column | meaning |
|---|---|
| `rule_id` | rule identifier |
| `event_subject` | subject to subscribe (e.g. `customer.updated`) |
| `filter_expr` | declarative payload predicate (e.g. `late_payment == true`) — keep minimal: JSONPath-equality, NOT arbitrary code |
| `schedule_subject_template` | e.g. `jobs.schedule.customer.{uuid}.payrem` — `{...}` resolved from payload |
| `schedule_spec` | `@every 7d` / cron / `@at` expression |
| `target_subject` | `jobs.due.user.<svc>.<action>` / `jobs.due.system.<svc>.<action>` — must match `execution_context` |
| `execution_context` | `user` (**default**) / `system` — decides which due-lane and which verify chain the executor runs; `system` is an explicit admin declaration, never inferred |
| `payload_mode` | `verbatim` (event payload forwarded) / `source_ref` (see below) |
| `enabled` | switch |

Runtime behavior:

1. Jobs service subscribes to the union of `event_subject`s of enabled
   rules (core pub/sub, shield-gated like every governed subject).
   Rules are hot-reloadable: a `job_rules.changed` broadcast → resubscribe.
2. On event arrival → for each matching rule where `filter_expr` holds →
   primebrick-job writes the `Nats-Schedule` declaration itself
   (JetStream, durable — only primebrick-job writes `jobs.schedule.*`):
   `execution_context=user` → the event's serialized auth headers are
   forwarded verbatim into the schedule message (L1 identity = jobs svc;
   L2 auth headers = the user who caused the event). Event carries no
   auth headers → rule cannot arm → 401/403 semantics, logged.
   `execution_context=system` → serialized `systemAuthUser(initiator)`
   + L1 identity — canonical existing pattern (session-context.ts:138).
   Condition FALSE and a schedule exists → cancel via `Nats-Schedule-Next:
   purge` + `Nats-Scheduler: <subject>` (atomic).
   External arming (manual/admin schedules) goes through the governed
   `jobs.schedule.request` route on primebrick-job — L1+L2 verified like
   every endpoint, never raw stream writes.
3. NATS server fires → `jobs.due.{user|system}.<svc>.<action>` → domain executor.
4. Executor publishes `jobs.result.<svc>.<action>` (outcome incl. 401s).

**Where the AuthUser comes from for `execution_context=user`:**
- If the triggering event arrived through a user-scoped path (e.g. BE
  published `customer.updated` carrying serialized auth headers), the jobs
  service **forwards them verbatim** into the schedule declaration — the
  schedule inherits the user who caused the event.
- If the event is service-published with no auth headers but its payload
  names an actor (`user_uuid` in the event envelope), primebrick-job may
  resolve the AuthUser via a governed BE route (`user.resolve_by_uuid` —
  to be added if it doesn't exist) and stamp it. If neither applies, a
  `user`-context rule CANNOT fire — it logs and skips (fail-closed).

This keeps the publisher's contract untouched (it emits domain events,
period) AND keeps the orchestrator domain-agnostic (it evaluates a
declarative predicate, forwards payloads, never executes business logic).

### Payload freshness — `Nats-Schedule-Source` (2.14)

Problem: payload stamped at declaration is stale at fire (the customer may
have paid meanwhile). Two mitigations:

- **Preferred**: fired message carries only the entity ref
  (`{customer_uuid}`) — the executor re-reads current state anyway (the
  executor decides "still late? send, else skip/cancel").
- `Nats-Schedule-Source` alternative: at fire time the server reads the
  LAST message of a state subject — schedule message stays a pure
  declaration. Useful when a rolling state subject exists
  (`customer.state.<uuid>`); not required for v1.

### Payment-reminder example end-to-end

This rule MUST be `execution_context=system` — a 7-day recurring fire
outlives any user credential by design, and sending a dunning reminder is
a super-partes business process (the business wants it regardless of who
set the flag). The `initiator` audit trail still records who/what armed it.

```
1. customers svc: emits customer.updated {uuid, late_payment:true, ...}
2. primebrick-job rule r1 matches (filter_expr true, context=system) → publishes:
   subject: jobs.schedule.customer.<uuid>.payrem
   headers: Nats-Schedule: @every 7d
            Nats-Schedule-Target: jobs.due.system.customer.payrem
            + primebrick-job L1 identity headers (UA + shield key)
   payload: { customer_uuid, initiator: { rule_id: "r1", event_actor } }
3. Every 7d: server republishes to jobs.due.system.customer.payrem
   (headers verbatim → L1 identity = primebrick-job)
4. customers svc nats-sub on jobs.due.system.customer.payrem
   (serviceShieldVerify, actor=system):
   re-reads customer → still late? → publish emailsender.send
   → publish jobs.result.customer.payrem {ok, skipped?...}
5. customer.updated {late_payment:false} → r1 condition fails →
   primebrick-job publishes {Nats-Schedule-Next: purge, Nats-Scheduler:
   jobs.schedule.customer.<uuid>.payrem} → schedule cancelled.
```

A `user`-context counterpart (e.g. "notify MY assigned customer in 30
min") would target `jobs.due.user.*`, carry the user's serialized auth
headers, and let the executor run full RBAC — failing logged if the
secret rotated out.

### Subject taxonomy (proposed)

```
jobs.schedule.<svc>.<job>[.<entity-id>]    schedule declarations (stream)
jobs.due.user.<svc>.<action>[.<id>]        fire events — full L1+L2+RBAC executor routes
jobs.due.system.<svc>.<action>[.<id>]      fire events — serviceShieldVerify routes only
jobs.result.<svc>.<job>                    execution outcomes (ok / skipped / failed+error)
jobs.rules.changed                         jobs svc broadcast (rules reload)
job.job_runs / job.job_rules               schema `job` tables (governance + rules)
job.config_entries                         mandatory per-service config table
```

## 5b. Data model (schema `job`) + admin observability page

### Entities

**`job_rules`** — configured event→schedule bindings (see §5 columns).

**`job_schedules`** — registry of ARMED schedules (makes derived jobs
visible — answers "derived jobs list"). Written by primebrick-job itself
whenever a declaration lands (it is the sole writer anyway):

| column | notes |
|---|---|
| `uuid` | public id |
| `schedule_subject` | `jobs.schedule.<svc>.<kind>[.<entity-id>]` — unique |
| `kind` | `infra_derived` (self-declared by a service at boot) / `rule` (from job_rules) / `manual` (admin-created) |
| `schedule_type` | `recurring` (@every/cron) / `once` (@at) — drives the page's lists |
| `schedule_spec` | raw spec (`@every 7d`, `@at …`, cron) + `target_subject` + `execution_context` |
| `armed_by` | service_code or user uuid that armed it; `source_rule_id` when kind=rule |
| `armed_at` / `cancelled_at` | lifecycle; cancelled rows kept for history |
| `last_fired_at` / `fire_count` | updated by the due-tap |

**`job_runs`** — execution log, one row per fire/dispatch:

| column | notes |
|---|---|
| `uuid`, `schedule_subject`, `service_code`, `action` | which job, on which service |
| `lane` | `user` / `system` |
| `status` | `dispatched` (due-tap saw the fire) → `running` → `succeeded` / `failed` / `skipped`; auth failures land as `failed` with error detail |
| `created_at` | run START (row created at dispatch — the user's start date) |
| `updated_at` | run END for terminal states — `last_seen_at` semantics |
| `duration_ms` | computed delta `updated_at - created_at` (generated column or computed in the service; FE renders human UoM: `312ms`, `4.2s`, `1m 07s`, `2h`) |
| `error_code` / `error_detail` | RFC7807-shaped failure incl. 401s |
| `initiator`, `correlation_id`, `msg_seq` | audit + traceability |

Entities are standard `IAuditableEntity` (+ `@Deletable` where wanted) →
they get entity-CRUD routes for free
(`/api/v1/entities/job_run|job_rule|job_schedule/...` on primebrick-job,
proxied to FE via `/ws/job/...`).

### Admin page — `/(app)/system/jobs` (EntityListTable-driven)

Meta-driven like every list page (default sort from entity meta —
`sort_key=updated_at&sort_dir=desc` per the convention, nothing
invented). Three views:

- **JOBS RECURRING** — `job_schedules` filtered `schedule_type=recurring`
  (+ rules view joined): armed config, next fire, last fire, fire_count.
- **JOBS EXECUTED ONCE** — `job_schedules` `schedule_type=once` AND
  one-shot/manual runs (immediate executions publish straight to
  `jobs.due.*` via a `jobs.run.request` route — recorded the same way).
- **RUNS / HISTORY** — `job_runs` list: per-run status, error, start,
  end, duration — the troubleshooting view. Row detail opens the single
  run (standard entity detail).

Both schedule lists expose the `kind` column → derived vs rule vs
manual is visible at a glance; **"create job"** = `job_rule` create
(entity form) or manual schedule via the same `jobs.schedule.request`
route exposed as a BE-proxied action
(`POST /api/v1/actions/schedule-job` on primebrick-job → same internal
code path as the NATS route — transport adapter only).

### Per-row sparkline (Kestra-style "execution statistics" column)

Reference: Kestra flows page — per-row stacked bar of executions per
bucket, colored by state. Ours:

- New service action `POST /api/v1/actions/job-run-stats`:
  `{ schedule_subjects: [...], window_days }` → per subject, an array of
  buckets `{ bucket_start, succeeded, failed, skipped }`.
- **Adaptive X aggregation (server-side)**: bucket unit chosen from
  `{hour, day, week, month}` so bucket count lands in a sane range
  (≈8–30 buckets): a job running 1×/day over 90d → `day`; 1×/week over a
  year → `week`; high-frequency → `hour`. The response echoes the chosen
  `bucket_unit` so the FE labels the axis correctly.
- **Stacked bar**: succeeded + failed (skipped as third tint) per bucket;
  variable Y scale (max bucket count). Rendered as a tiny inline SVG/CSS
  bar strip in a new cell type — extend `CellRenderer` with
  `type: "run_stats_sparkline"` in the column meta; the page fetches
  stats for the visible rows after list load (same pattern as Kestra's
  extension-column loading — data fetched for rendered rows only).

### Failure visibility

Auth failures (expired user secret on the user lane, unknown L1
publisher) are recorded as `status=failed` + `error_code`
(e.g. `AUTH_TOKEN_INVALID`/`UNIDENTIFIED_CLIENT`) — the RFC error the
user asked to see in the log. The due-tap records `dispatched`; missing
terminal state after `ack_wait` = stuck/failed-visible.

Stream: `JOBS`, subjects `jobs.>` (+ `allow_msg_schedules`,
`allow_rollup_hdrs` for purge), created by the jobs service at boot
(`ensureStream` + cast for the schedules flag — see flag F1).

## 6. Scale/liveness notes

- Rule evaluation is per-message O(rules-for-subject) — trivial; the
  orchestrator is a fan-in point only for *configured* subjects, not all
  traffic. Multiple replicas: queue group `jobs` → each event hits one
  replica; schedule writes are last-msg-wins (dupes idempotent).
- Executor concurrency: `max_ack_pending` per durable consumer.
- Fired messages while executor down: durable consumer redelivery.
- Stale schedule safety: `Nats-Schedule-TTL` bounds fired-message
  staleness; one-shots auto-purge.
- `job_runs` is append-only → same partitioning machinery applies to it
  later (dogfood).

## 7. Empirical verification results (live NATS 2.14.3, docker `primebrick-nats`, 2026-10-12)

All flags resolved by direct testing against the running deployment
(temp scripts `verify-nats-schedule*.ts`, executed, cleaned up):

- **F1 RESOLVED ✅**: `allow_msg_schedules: true` accepted via cast in
  `streams.add` (server echoed `allow_msg_schedules:true`, metadata
  `_nats.ver: 2.14.3`, `_nats.level: 4`, `_nats.req.level: 2`). No SDK
  upgrade needed for the flag; cast documented in `ensureJobSchedule`.
  Our own serialization stays `extJson` — the JSM call is nats.js
  internals.
- **F2 CONFIRMED ⚠️**: `jetstreamPublish` lacks `injectIdentity` —
  `ensureJobSchedule` must stamp UA + shield key or the fired message
  arrives with no L1 identity and executors reject it.
- **F3 RESOLVED — TWO-LAYER DECISION**: the container runs bare `-js` —
  no NATS auth/users/ACLs. Two complementary fixes:
  - **A. Governed declaration route**: schedules are NOT armed by
    publishing to `jobs.schedule.*` directly. Callers invoke
    `jobs.schedule.request` on primebrick-job (normal
    `makeNatsRequestRoute` → L1+L2 wired like every endpoint);
    primebrick-job verifies, records `initiator`, and writes the JS
    schedule itself. The declaration path is shielded like everything
    else — no unverified ingress.
  - **B. NATS hardening (defense-in-depth, separate phase)**: per-service
    accounts + subject permissions — `jobs.due.>` publish DENIED to all
    clients (fired messages are server-internal writes → unfakeable
    fires), `jobs.schedule.>` writable only by primebrick-job,
    `jobs.result.*` by executors, `$JS.API.*` to all. Constraints:
    per-service creds (`nats_url` gains user:pass, distributed via
    config_entries/env), bootstrap order, `$JS.API.*` needed by every
    JS consumer, breaking for ad-hoc tooling. A alone closes the
    logical hole; B is hardening on top.
- **F4 RESOLVED ✅**: fired message preserves arbitrary headers VERBATIM
  (verified `x-primebrick-client-shield-key` survives) + server adds
  `Nats-Scheduler` (schedule subject) and `Nats-Schedule-Next` (`purge`
  for one-shots / next ts for cron). Executors ignore `Nats-*`.
- **F5 DECIDED**: `filter_expr` = `{field, op, value}` triples
  (==, !=, in, gt/lt on scalars) — declarative, no code eval.
- **F6 RESOLVED ✅**: `db-meta/fire-and-forget/` = manual one-off SQL
  applied via psql/runner per `patch-sha256-management` rules —
  `applyPatches` scans `db-meta/patches` only. Generated partition DDL
  goes in `patches/`; fire-and-forget stays manual-ops.
- **F7 RESOLVED — NO MINTING (impersonation risk)**: resolving an
  AuthUser by uuid via a BE route would give primebrick-job routine
  user-impersonation capability — rejected. Correct model: **the event
  propagates the caller's context** — the publishing service already
  verified the AuthUser inbound; it re-stamps the auth headers onto the
  emitted event (SDK helper `forwardAuthHeaders(inboundMsg)` → outbound
  headers). primebrick-job copies them verbatim into the schedule. If
  the event carries no auth headers, a `user`-context rule CANNOT arm —
  the declaration route fails 401/403, logged to `job_runs`.
  Cases: user action via BE → auth headers present → user rules OK;
  service-internal events (batch/sync/cascade) → no auth → only
  `system` rules match.
  **Consequence**: user lane is bounded to the secret-rotation window
  (~65min). Long-horizon user-context schedules fail logged after the
  first fire — `execution_context=user` means "deferred user action",
  not "recurring user job". Rule validation warns at creation time.
  `systemAuthUser(initiator)` (session-context.ts:138) is the existing
  canonical identity for the system lane — serialized the same way.
- **F8 NEW — VERIFIED ✅**: `@every` fires correctly; cancel via
  `Nats-Schedule-Next: purge` + `Nats-Scheduler: <subject>` is atomic
  (3 fires then stopped).
- **F9 NEW — VERIFIED ✅**: `Nats-Schedule-Source` works — the fired
  payload was the LAST message on the source subject (`FRESH-state`
  written post-declaration won over the declaration body). Solves
  stale-payload for long-horizon schedules.
- **F10 NEW — CRITICAL ⚠️**: fired messages are stored in the stream on
  the target subject but **NOT dispatched to core `nc.subscribe`**
  (empirically: core sub got 0, stream got the message). Executors MUST
  consume `jobs.due.*` via JetStream durable consumers — which gives
  ack_wait/redelivery/max_ack_pending semantics for free, but changes
  the executor plumbing from `subscribeShielded` to a shielded durable
  consumer helper (to be added in SDK).

## 8. Open questions for the user

1. ~~`jobs` as its own microservice~~ — **RESOLVED**: new US
   `primebrick-us-v3/job-handler/`, package `primebrick-job@0.1.0`.
2. ~~`job_rules` ownership~~ — **RESOLVED**: `job_rules`/`job_runs` are
   domain data of the jobs service → own schema `job`
   (`job.job_rules`, `job.job_runs`), NOT config entries. The service
   still carries the mandatory per-service `job.config_entries` like
   every other microservice.
3. ~~Executor for partman maintenance~~ — **RESOLVED**: generic
   `dal.partitionMaintenance()` in `@primebrick/dal-pg` (owns entity
   metadata AND persistence — the purge graph is metadata, not code).
   Each service wires ~10 identical lines: durable consumer on
   `jobs.due.system.<svc>.partition-maintenance` →
   `dal.partitionMaintenance(registry)` → publish result. Rejected:
   primebrick-job executing DB work (violates per-service DB
   ownership — it has no other service's credentials/registry);
   per-service custom handlers (per-entity duplicated logic = the
   pattern already rejected). General rule: infrastructure system
   jobs live in the owning library; domain jobs live in the domain
   service. The partition-maintenance schedule is self-declared at
   boot only if the service's registry contains `@PartitionField`
   entities — arming is metadata-driven too.
4. ~~Queue-group policy for `jobs.due.*`~~ — **RESOLVED**: durable pull
   consumers with a shared `durable_name` across replicas = queue
   semantics for free (each message fetched by exactly one replica);
   `max_ack_pending` caps concurrency per consumer. Broadcast would
   need per-replica durables — only used if ever wanted.
