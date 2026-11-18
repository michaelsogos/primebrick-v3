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

### 2b. Subject taxonomy — action in payload, NOT in subject

```
events.<service_code>.<entity>.<uuid>
events.ai.conversation.019ae...
events.job.job_trigger.>
```

The action lives in the payload (`event.action`) — the subject does NOT
repeat it. Rationale (user's call, verified):
`job_trigger.filter` already discriminates on payload dot-paths
(`{field:"action", op:"=", value:"update"}` → `matchFilter` at dispatch,
`triggers-engine.ts:95,301`), so action-in-subject buys nothing for JH
consumption while forcing 6 subject prefixes per entity. Actionless
subjects give: ONE durable consumer (`events.<svc>.<entity>.>`) covering
every action; `max_msgs_per_subject` bounding a row's WHOLE event
history (100 across actions, not per action); one emit pattern per
entity in census. Selectivity ladder stays intact: `events.job.>`
(service) · `events.job.job_trigger.>` (entity) ·
`events.job.job_trigger.<uuid>` (instance). Trade-off accepted: a
consumer bound to one action still receives the others and drops them
in the filter — cheap vs combinatorial subjects. Namespace `events.*`
is deliberately NOT `entity.*` — no presence-marker collision.

**Action vocabulary** (`EntityWriteAction` — mapped from the svc method,
NOT the audit enum): `create` (svc.create, addMany items) · `update`
(svc.update, bulkUpdate items) · `delete` (svc.delete, bulkDelete) ·
`restore` (svc.restore, bulkRestore) · `purge` (svc.purge, bulkPurge) ·
`duplicate` (svc.duplicate — `after` = cloned row, `before`/`delta` =
null).

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
- **EMPIRICAL PROOF (nats-server 2.14.3, probe on `TIC_LIMITS` stream,
  `max_msgs_per_subject=3`, 5 publishes):** with `discard:"old"` all
  publishes are PubAck'd — NO rejection, NO exception; the oldest messages
  are silently evicted (`msgs=3, first_seq=3, last_seq=5` → payload 1,2
  gone). The 101st message ENTERS the queue; the 1st dies. FIFO eviction,
  publish path never blocks. Caveat discovered: with `discard:"new"` +
  `max_msgs_per_subject` on 2.14.3 the SAME thing happens (`msgs=2,
  first=3, last=4` — oldest still evicted) — per-subject discard-new is
  not honored on this version, so there is NO "reject on full" knob at
  per-subject granularity anyway. Consequence: an unconsumed lane can
  never stall publishers; the risk is *silent event loss* for slow/late
  consumers, which is exactly what `max_age` + durable consumers bound
  at declaration time mitigate — and it makes trigger-subject bindings
  (`§2j`) a correctness feature, not an optimization.
  NOTE on granularity: `max_msgs_per_subject` counts per SUBJECT — our
  subject carries `<uuid>` so the cap applies per (entity,action,uuid)
  tuple — a hot row can't evict another row's events. `max_age` is the
  global staleness bound.
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

### 2j. Consumer model — JH-only cross-service (user decision, 2026-11-18)

A service may consume ONLY events of its own domain
(`events.<own_code>.>`) — the BE/JH self-consumption precedent
(`jobs.ctl.triggers.changed`) stays. Cross-service reactions go through
`job_triggers` rows: `event_subject` → immediate/scheduled dispatch →
destination callable. This is *governed choreography*, not
orchestration: the binding is DATA (a trigger row authored by the flow
owner), publishers and consumers still never know each other — and it
is strictly MORE decoupled than direct subscription, because
`subscribeShielded("events.ai.…")` inside crm code is literal
cross-module vocabulary knowledge, while a trigger row carries zero
code coupling either way. Bonus: every cross-service reaction lands in
`job_runs` — traced, retryable, RBAC-audited.

Consequences (accepted): JH becomes a hard runtime dependency for
cross-service reactions — mitigated by durable consumption (below):
events wait in the stream, they don't die. One extra hop of latency —
immediate triggers already trampoline via `jobs.due.*`.

**Enforcement — by construction, not convention:**
- New lint rule `event-bus-ownership` (unsuppressible): subscribe calls
  (`subscribe`/`subscribeShielded`/`jetstreamSubscribe`) whose subject
  resolves under `events.` must be `events.<own service_code>.>` —
  except `job-handler`, which may bind any `events.>` subject.
- `triggers-engine.bindSubject` upgrades event-source bindings from
  core `subscribeShielded` to **`jetstreamSubscribe` durable consumers**
  on `ENTITY_EVENTS` (one durable per bound subject pattern,
  `deliver_group:"job"` for replica work-split) — this is what makes
  "JH down" survivable: bound events persist until the consumer acks;
  the stream's retention only reclaims what nobody was ever bound to.
- **Fan-out semantics (verified `triggers-engine.ts:95-113,334-360`):**
  `Promise.all` over every bound trigger per event — N triggers on the
  same source+filter ALL fire (queue `"job"` splits only across JH
  replicas, never across triggers). A throwing `onEvent` is currently
  swallowed by `.then(()=>{})` — siblings already fired, the failed one
  loses the event silently. **Required change for durable consumers:**
  wrap each `onEvent` in its own `.catch` inside the fan-out so the
  handler always acks — otherwise a single failing trigger naks the
  batch and re-fires every sibling (double-dispatch). Semantics then:
  at-least-once delivery TO JH, at-most-once fan-out WITHIN JH — run
  idempotency (dedup key on event id) is future work.
- **Filter grammar today:** `matchFilter` is `.every()` — AND only;
  ops `eq`/`neq`/`exists`/`contains`/`gt`/`lt`. No `or`/`in` →
  "delete OR restore" needs two triggers today. Optional micro-task:
  add `in` op (`{field, op:"in", value:[...]}`) to `matchFilter` +
  `TRIGGER_FILTER_SCHEMA` — ~10 lines, unlocks multi-action triggers.

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
| D4 | Bulk ops | **per-item THIN events** (`{uuid, action, before:null, after:null, delta:null, batch:"<shared uuid v7>"}` — one event PER row, never a uuids[] batch event — preserves per-uuid trigger binding) — TEMP-TABLE bulk ops have no RETURNING/oldRecord/delta by contract (204); consumer re-reads via `svc.get` — **user decision** |
| D9 | Actor on non-auditable entities | `eventActor?: string` on `WriteOptions` base — svc always supplies `resolvedActor`; repo emits `options.actor ?? options.eventActor ?? "system"` (auditable keeps `actor`) — **user decision** |
| D10 | SDK↔dal dep direction | SDK mirrors `EntityEvent`/`EntityEventPort` STRUCTURALLY (`nats/entity-events.ts`) — SDK must not depend on dal-pg; `EntityEventPort` is an interface so the port typechecks at `dal.eventPort = makeNatsEntityEventPort(code)`. Wire is the real contract. |

## TOC — stato esecuzione

| Step | Stato | Commit |
|---|---|---|
| 1-5 contratto + opt-out + emissione + tx buffer + wiring dal | ✅ | dal `2b3d9ee` |
| 6 SDK transport (`entity-events.ts`, `ensureStream` limits) | ✅ | sdk `b52d665` |
| 8 JH durable + per-trigger isolation | ✅ | us `936e100` |
| 7 bootstrap: `dal.eventPort=`+`ensureEntityEventsStream`+auto-declare census | ✅ | sdk + us wiring (`initDal` awaitable, 5 servizi) — standards clean su tutti |
| 9 lint `event-bus-ownership` | ✅ | us `6a71503` — gated always-on consumer profile; fake violation `events.crm.customer.>` rilevata |
| 10 test dedicati (emit/opt-out/tx/bulk/port) | ✅ | dal `2a7630e` — 8/8 event tests (audit-gate bug trovato+fixato), suite 742/742 |
| E2E broker | ✅ | script: stream `ENTITY_EVENTS` ready → publish seq 13 → durable fetch → payload verificato |
| E2E JH trigger→run | ✅ | trigger row `events.ai.conversation.>` + filter `action=update` → evento JS seq 21/23 → durable `jh-events-ai-conversation` delivered+acked → dispatch → trampoline `jobs.due.system.job.forward.<uuid>` → `job_runs` status=`dispatched` run_as=`system` (server-clock 17:13:29.699→.701) |
| E2E browser (trigger via UI) | ⏸️ bloccato | login admin richiede MFA TOTP (no secret); HTTP probes bloccati da `client_shield_registry` (UNKNOWN_CLIENT) — serve account non-MFA o TOTP code |
| Deferred tx (`beginTransaction`) | ⚠️ gap noto | il capture layer non passa dai metodi repo → nessun evento; documentato, fix in iterazione |
| D5 | Opt-out | entity flag + per-action `except` list on `@Entity` options |
| D6 | Subject | `events.<svc>.<entity>.<uuid>` — action in payload only (trigger `filter` already discriminates) — **user decision** |
| D7 | Stream owner | `createMicroservice` (US) + `index.ts` (BE) |
| D8 | Consumer model | JH-only cross-service (durable `jetstreamSubscribe` in triggers-engine); own-domain direct allowed; enforced by `event-bus-ownership` lint — **user decision** |

## 6. Out of scope

- Presence marker changes (`entity.*.*.changed` stays).
- A workflow/orchestration engine consuming events (future initiative —
  the lane + census are what this feature delivers for it).
- Replay/catch-up consumers (JetStream durable consumers support it
  natively when needed).
- Retroactive events for existing rows.
