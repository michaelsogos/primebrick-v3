# Feature: Entity-Write Event Choreography — automatic, declared, durable entity events

**Initiative**: every entity WRITE (and every svc write inside RPC actions) emits a
canonical, census-declared domain event — opt-out per entity/action, durable via
JetStream with TTL-based purge — consumable by job-handler triggers, direct
subscribers, and future workflow engines.

**Date**: 2026-11-18 — TIC complete, awaiting PROCEED.

---

## 1. Empirical census — what already exists (the skeleton)

The choreography spine is ~70% built. Verified file:line evidence:

### 1a. Emission side — what fires today

| Mechanism | Shape | Transport | Coverage | Evidence |
|---|---|---|---|---|
| `EntityChangedMarker` (presence) | thin: `{entity_type, entity_uuid, version, audit_log_id, changed_by, changed_by_session, changed_at}` — NO payload | **core NATS** `entity.{type}.{uuid}.changed` | only `@AuditTrail` entities; UPDATE/SOFT_DELETE/RESTORE/HARD_DELETE (NO INSERT); fire-and-forget `.catch` | `sdk/src/presence/marker-audit-port.ts:51-89`, `be/src/db/entity-audit-port.ts:70-105` |
| `jobs.ctl.triggers.changed` | `{trigger_uuid}` hand-rolled | core NATS | one service, one purpose | `jh/src/modules/jobs/jobs.service.ts:28` (published via `afterWrite` hook) |
| `config.changed` | `{keys[]}` broadcast | core NATS | config_entries writes | `sdk/src/config/shared-config.ts:61` |

**Repo writeAudit call sites (6 — per-op, per-item never in bulk)**:
`repository.ts:923` add · `2022` update · `2164` delete · `2305` restore ·
`2407` hardDelete · `2544` clone. **Bulk ops (`addMany`/`updateMany`/
`deleteMany`/`restoreMany`/`hardDeleteMany`) have ZERO audit calls** —
verified: no `writeAudit` inside those method bodies.

**Audit gate**: `writeAudit` fires only when `auditable` (audit columns) AND
`options.actor` present AND `options.audit` port bound
(`repository.ts:916`). Non-`@AuditTrail` entities emit NOTHING today —
marker emission is coupled to audit by construction. This coupling is
wrong for the new feature (opt-out must not kill audit; non-audit
entities must still emit).

### 1b. Consumption side — already works

- **`job_triggers.event_subject`** — validated against the declared-emit
  census (`jobs.service.ts:51-67`); meta combo `options_source:"census.emits"`
  (`job.meta.ts:96`).
- **`triggers-engine.bindSubject`** — one `subscribeShielded` per bound
  subject, queue `"job"` (WORK semantics — one replica per event),
  `liveTriggers` fan-out at delivery time, lane resolution
  (`system`/`author`/`originator` via `forwardAuthHeaders`), dispatch to
  schedule or due lane (`triggers-engine.ts:330-430`).
- **Census**: `service_registry.endpoints.events.emits` — wildcard grammar
  (`*` segment, `>` tail, `events-declaration.ts:20-40`), `entity` pointer
  `{key, entity, table}` for semantic payload mapping
  (`core/src/page-route.ts:338-368`), served on `/modules`.

### 1c. Durable transport — machinery exists

- `NatsClient.jetstreamPublish` → PubAck, Ext-JSON, identity headers
  (`nats-client.ts:380-405`).
- `NatsClient.jetstreamSubscribe` → durable pull consumer, ack/nak/term
  (`nats-client.ts:416+`).
- `NatsClient.ensureStream(name, subjects, {allowMsgSchedules, syncSubjects})`
  (`nats-client.ts:329-371`) — **no retention/limits options today** (gap).
- JOBS stream precedent: ensured by `job-handler/src/index.ts:94`,
  4 data lanes `jobs.schedule|due|result|cancel.>`, `allow_msg_schedules`
  (ADR-51, `sdk/src/nats/job-schedule.ts:1-48`).

### 1d. Write pipeline — where events must hook

`makeEntityService` passes `audit: resolveAuditPort(repoFor(tx))` into
EVERY write (`entity-service.ts:971-1100`): create/update/delete/restore/
purge/duplicate/bulkDelete/bulkRestore/bulkUpdate/bulkPurge. The port
factory resolves per active repo → audit rows stay inside the caller's
transaction (`entity-service.ts:507-512`).

Inside the repo each write already holds, FREE:
- `oldRecord` — loaded for optimistic-lock delta on update/delete/restore/
  hardDelete (`repository.ts:2022`, `2164`)
- `inserted`/`updated` RETURNING row — the after state
- `delta` — `calculateDelta(old, new)` already computed for audit
- `entityUuid`, `action`, `version`, `changedBy`, `tableName`

`fireAfterWrite` fires per-op ONLY outside a tx (`entity-service.ts:831`,
`987`, `1004`, `1016`…) — established precedent: notifications never
precede the durable write.

### 1e. What does NOT exist (the real gaps)

1. No automatic domain-event emission on entity writes (markers are
   presence-scoped, thin, audit-coupled).
2. No `events:` port in repo write options / `EntityServiceConfig`.
3. No entity-level opt-out flag (`@Entity` is `(tableName?, schema?)` —
   `entity-decorators.ts:407`).
4. No durable event lane for entity events (JOBS stream covers `jobs.*`
   only; no stream retention config anywhere).
5. No auto-declaration of entity-event subjects in `endpoints.events`
   (services declare hand-picked emits only — e.g. JH declares just
   `jobs.ctl.triggers.changed` in `events-declaration.ts:18-24`).
6. No tx-scoped event buffering (events inside `svc.transaction` would
   fire pre-COMMIT → phantom events on ROLLBACK).
7. Bulk ops emit nothing (no audit → nothing to piggyback — needs its own
   emit site or documented exclusion).
8. `EntityEvent` composed shape — not defined anywhere.

---

## 2. Design (resolved during TIC — every gap answered)

### 2a. Canonical event — `EntityEvent` (dal-pg, environment-neutral)

```ts
export interface EntityEvent {
  schema: 1;
  service: string;                 // service_code publisher ("ai", "be")
  entity: string;                  // API entity name (singular — same as /entities/:entity)
  table: string;                   // physical table
  action: "create" | "update" | "delete" | "restore" | "purge" | "duplicate";
  uuid: string;
  version?: number;                // auditable entities only
  actor: string;                   // resolved write actor ("uuid" | "system:<code>")
  changed_at: number;              // epoch ms
  before: Record<string, unknown> | null;   // pre-write row (null on create)
  after: Record<string, unknown> | null;    // RETURNING row
  delta: Record<string, { old: unknown; new: unknown }> | null;
}
```

User's ask mapped: **before+after+delta all come FREE** — the repo loads
`oldRecord` for the optimistic-lock delta and the RETURNING row is the
`after`. No extra reads, no consumer-side audit call needed. Bulk ops
emit the SAME shape per item (uniform vocabulary — a bulk update of 50
rows = 50 `update` events; volume control is the opt-out's job).

### 2b. Subject taxonomy

```
events.<service_code>.<entity>.<action>.<uuid>
events.ai.conversation.update.019ae... 
events.job.job_trigger.create.>
```

Selectivity ladder for consumers: `events.job.>` (service) ·
`events.job.job_trigger.>` (entity) · `events.job.job_trigger.update.>`
(action) · `events.job.job_trigger.update.<uuid>` (instance). Namespace
`events.*` is deliberately NOT `entity.*` — no collision with presence
markers and no JetStream capture of presence traffic.

### 2c. `EntityEventPort` — the emission seam (repo write option)

```ts
// dal-pg src/entity/events.ts
export interface EntityEventPort {
  emit(event: EntityEvent): Promise<void>;
}
```

- Repo write methods accept `options.events?: EntityEventPort` and call
  `options.events.emit(evt)` at the SAME sites `writeAudit` fires (6
  sites) PLUS the 5 bulk methods — but gated on the entity flag
  (`meta.events !== false`), NOT on `auditable`. Fire-and-forget:
  `void port.emit(e).catch(log)` — emission never blocks/fails a write.
- `EntityServiceConfig.events?: EntityEventPort | ((repo) => port)` —
  factory form for tx-binding, mirroring `auditPort`.
- **`Dal` gateway owns the default**: `dal.entityService(cfg)` injects
  `dal.eventPort` (set once at bootstrap) when `cfg.events` is unset →
  emission is by-construction with ZERO per-service wiring. Free
  `makeEntityService` requires it explicitly (same as `repo`).

### 2d. Opt-out — `@Entity` options object (additive)

```ts
@Entity("metrics_raw", { schema: "job", events: false })
// or granular:
@Entity("chat_messages", { events: { except: ["create", "duplicate"] } })
```

`Entity(tableName?, schemaOrOptions?)` — second param becomes
`string | EntityOptions` (non-breaking union; `string` = today's schema).
Meta flag `events?: false | { except?: EntityWriteAction[] }` lands on
`EntityMeta` → served meta can surface "this entity emits events".

### 2e. Durable lane — `ENTITY_EVENTS` JetStream stream

- `ensureStream("ENTITY_EVENTS", ["events.>"], { maxAgeSecs, maxMsgsPerSubject })`
  — `ensureStream` gains a `limits` option (new):
  `{ limits?: { maxAgeSecs?: number; maxMsgsPerSubject?: number } }`
  → stream config `max_age` (ns) + `max_msgs_per_subject` + `discard:"old"`.
- **Retention proposal (parameter, user can veto): `max_age = 72h`,
  `max_msgs_per_subject = 100`, `discard = old`.** Rationale: events are
  signals, not a log — the audit trail already carries the durable diff
  history; a consumer needing full state re-reads via `svc.get`/`svc.list`.
  Stale events self-purge = no backpressure on an unconsumed lane (the
  exact question raised in the request — JetStream answers it natively).
- Stream ownership: **`createMicroservice` ensures it** when the SDK
  wires the event port (bootstrap opt-in via flag, default ON once the
  port exists — same pattern as `dbPatches`/`migrations`); BE ensures it
  in `index.ts` (JOBS-stream precedent: service that needs it ensures it).
- Publish path: `makeNatsEntityEventPort(serviceCode)` in the SDK —
  `NatsClient.jetstreamPublish(subject, event, headers)` (PubAck +
  shield identity headers), `.catch` → warn, never throw into the write.

### 2f. Transaction semantics — no phantom events

- `svc.transaction(txRepo => …)`: the tx-scoped repo gets a **buffering
  EventSink** (append-only array); `dal.transaction` drains AFTER COMMIT
  via the real port (fire-and-forget each), DROPS on ROLLBACK.
- `svc.beginTransaction`/`Deferred`: drain on the deferred commit path.
- Mirrors the `fireAfterWrite` precedent ("notifications can't precede
  the durable write") — but enforced *inside* the tx, not just at svc.

### 2g. Census auto-declaration

`createMicroservice` already persists `endpoints.events`. Extend: for
every served entity (the entity set is already known to the service's
route/meta declaration), auto-append:

```ts
{ subject: `events.<svc>.<entity>.>`,
  label_key: `${ns}.events.entity_changed.name`,
  entity: { key: "after", entity: "<entity>", table: "<table>" },
  payload_schema: ENTITY_EVENT_SCHEMA /* shared const in @primebrick/core */ }
```

Opted-out entities are skipped. The JH `event_subject` combo
(`census.emits`) then offers `events.<svc>.<entity>.>` for free — the
"censita" requirement is satisfied by construction, not by each service
hand-editing `events-declaration.ts`.

### 2h. Actor propagation

`actor` field carries the resolved write actor (uuid or `system:<code>`).
JH `run_as:originator` forwards **headers** — events additionally carry
the actor in-payload; the JH due-lane already re-resolves auth at fire
time (`freshAuthHeaders` checkpoint), so arm-time staleness is not
reintroduced.

### 2h'. Presence markers — untouched

`entity.*.*.changed` thin markers + `makeMarkerAuditPort` stay as-is —
ephemeral presence is the right scope for them. The new lane is
additive; marker-persister needs zero changes.

### 2i. RPC actions

An RPC action that mutates via `svc.*` inherits emission automatically
(the svc write emits). Non-entity RPCs (compute, forwarders) emit no
entity event — nothing to compose. Domain-specific hand-declared emits
(`jobs.ctl.triggers.changed`) remain valid and complementary.

---

## 3. Impacted files

### dal-pg (`@primebrick/dal-pg`)
| File | Change |
|---|---|
| `src/entity/events.ts` *(new)* | `EntityEvent` type, `EntityEventPort` iface, `EntityWriteAction` union, `ENTITY_EVENT_SCHEMA` JSON-schema const |
| `src/meta/entity-decorators.ts` | `@Entity` 2nd param → `string \| EntityOptions`; `EntityOptions.events` → meta flag |
| `src/meta/entity-meta.ts` (+ core `EntityMeta` if served) | `events` flag on meta |
| `src/repository/repository.ts` | `events?: EntityEventPort` on write opts; emit calls beside the 6 writeAudit sites + inside `updateMany`/`deleteMany`/`restoreMany`/`hardDeleteMany`/`addMany` per item; buffer-aware when repo is tx-scoped |
| `src/dal/dal.ts` | `eventPort` holder + setter, `entityService` auto-injection, `transaction`/`beginTransaction` drain-on-commit |
| `src/entity/entity-service.ts` | `cfg.events` + `resolveEventPort(repoFor(tx))` passed into every write call |
| `src/entity/domain-service.ts` | pass-through (cfg already flows) |
| `src/index.ts` | exports |

### sdk (`@primebrick/sdk`)
| File | Change |
|---|---|
| `src/nats/entity-events.ts` *(new)* | `ENTITY_EVENTS_STREAM`, subject builder `entityEventSubject(...)`, `makeNatsEntityEventPort(serviceCode)` |
| `src/nats/nats-client.ts` | `ensureStream` gains `limits` option |
| `src/microservice/create-microservice.ts` | wire `makeNatsEntityEventPort` → `dal.eventPort` at boot; `ensureStream(ENTITY_EVENTS)`; auto-append entity emits to `endpoints.events` |
| `src/index.ts` | exports |

### consumers
| File | Change |
|---|---|
| `be/src/index.ts` + `be/src/db/*` | ensure stream + port wiring for BE entities |
| `us/*/src/db/dal.ts` or `index.ts` | only if createMicroservice doesn't own 100% of wiring — target: ZERO changes |

### tests (persistent, in canonical locations)
- dal-pg: emit on create/update/delete/restore/purge/duplicate/bulk;
  opt-out flag; tx buffer→flush-on-commit, drop-on-rollback; non-audit
  entity emits.
- sdk: subject builder, `makeNatsEntityEventPort` publishes correct
  subject+shape (mock js.publish), auto-declare emits output.
- JH: a `job_trigger` with `event_subject: "events.x.y.>"` fires on an
  entity event (existing engine test pattern).

## 4. Acceptance criteria

1. Every `svc` write on an emitting entity produces exactly one
   `EntityEvent` on `events.<svc>.<entity>.<action>.<uuid>`, PubAck'd in
   the `ENTITY_EVENTS` stream.
2. `before`/`after`/`delta` populated from the repo's existing
   oldRecord+RETURNING — zero additional queries (verified by query-count
   test).
3. `@Entity(..., {events:false})` or `{except:[...]}` suppresses events;
   audit behavior unchanged.
4. Events inside `svc.transaction` fire only after COMMIT; ROLLBACK drops
   them (test-proven).
5. `check-standards` clean; no new consumer wiring beyond bootstrap.
6. `census.emits` returns the auto-declared entity patterns; a JH trigger
   bound to `events.<svc>.<entity>.>` fires end-to-end.
7. Stream limits: `max_age`/`max_msgs_per_subject` set per §2e (or the
   values the user picks).

## 5. Decision points surfaced for the user (defaults assumed — veto in review)

| # | Choice | Proposal |
|---|---|---|
| D1 | Payload | before+after+delta (free — repo computes all three already) |
| D2 | Transport | JetStream `ENTITY_EVENTS` on `events.>` + jetstreamPublish PubAck |
| D3 | Retention | `max_age=72h`, `max_msgs_per_subject=100`, `discard=old` |
| D4 | Bulk ops | per-item events (uniform); volume control via opt-out |
| D5 | Opt-out | entity flag + per-action `except` list on `@Entity` options |
| D6 | Subject | `events.<svc>.<entity>.<action>.<uuid>` |
| D7 | Stream owner | `createMicroservice` (US) + `index.ts` (BE) |

## 6. Out of scope

- Presence marker changes (`entity.*.*.changed` stays).
- A workflow/orchestration engine consuming events (future initiative —
  the lane + census are what this feature delivers for it).
- Replay/catch-up consumers (JetStream durable consumers support it
  natively when needed).
- Retroactive events for existing rows.
