# F3 — job-handler DomainService convergence (dal-access debt repayment)

> Continuation of `debt-dal-access-job-handler.md` — this plan supersedes its
> tasks 1–9 (the repo-helper seam). F1+F2 already shipped (`audit-construction-f1-f2.md`):
> gateway-level audit auto-inject is live, `job_triggers_audit` has the uuid-PK
> shape, `partition_maintenance` is wired. What remains is making every write
> path go through the owning `DomainService` — the shape that already exists
> in `src/modules/jobs/jobs.service.ts` but that the function modules bypass.

## Status: ⚪ TODO — Plan date: 2026-11-16 / TIC complete, awaiting PROCEED

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `jobs.service.ts`: add domain methods to `JobSchedulesService` (findBySubject, listByStatuses, listAllRows, insertMirror, patchRow, dropMirror) | ⏳ | — | read+write primitives; callers keep orchestration |
| 2 | `jobs.service.ts`: add domain methods to `JobTriggersService` (findByUuid+includeDeleted, findBySystemKey, listLive, setDeleted via svc, insertSystemRow, patchRow) | ⏳ | — | reconcile/system writes stay `this.dal` (hook bypass is BY DESIGN — see D.2) |
| 3 | `jobs.service.ts`: add domain methods to `JobRunsService` (addRun, findByUuid, patchRow, listDispatchedBefore, statsBySchedule) | ⏳ | — | run writes actor `system:job` |
| 4 | `jobs.service.ts`: remove dead `makeMarkerAuditPort` from `JobSchedulesService`+`JobRunsService` (no `@AuditTrail` → audit tables were dropped; unreachable svc writes would 500) | ⏳ | — | latent construction bug found in TIC |
| 5 | NEW `ConfigEntriesService extends DomainService<ConfigEntryEntity>` in `modules/jobs/jobs.service.ts`: listEntries, getEntry, updateValue (incl. B3 static-key guard moved from controller) | ⏳ | — | no `@AuditTrail` on entity → auto-inject no-op, safe |
| 6 | `services/schedule-service.ts`: 14 dal invocations → `JobSchedulesService` methods (module keeps locks/NATS/reconcile loop) | ⏳ | — | |
| 7 | `services/run-recorder.ts`: 5 → `JobRunsService`; `services/due-forwarder.ts`: 3 → `JobRunsService` | ⏳ | — | |
| 8 | `services/triggers-engine.ts`: 2 → `JobTriggersService`; `services/system-triggers.ts`: 4 → `JobTriggersService` | ⏳ | — | reconcile calls the `this.dal`-level methods (insertSystemRow/patchRow), NEVER svc.* |
| 9 | `controllers/http/actions-route.ts`: 6 → service methods; `controllers/http/config-route.ts`: 5 → `ConfigEntriesService`; controllers end with ZERO `getDal`/`Filter`/`field`/`Project` imports | ⏳ | — | controller-boundary: ONE service call per handler |
| 10 | Delete `src/db/entity-repo.ts`; `actor: requireActor` direct in the 4 service configs; shrink `check-standards.json` allowPaths to `[adapters/config-repository-adapter.ts, db/dal.ts, index.ts]` | ⏳ | — | `entityActor` is a pass-through wrapper |
| 11 | Update unit tests: mock `@primebrick/dal-pg` `getDal` (single interception for direct imports AND service internals); `jobs.service.js` module mocks MUST spread `importOriginal` (module now also exports the service classes) | ⏳ | — | see F |
| 12 | Delete `job-handler/.devin/check-standards-baseline.json` (25 entries → 0; file is optional per `check-standards.ts:1801`) | ⏳ | — | |
| 13 | Verify: `check-standards` clean, `tsc --noEmit`, `vitest run` green; live probes: materialize system trigger → `job_triggers_audit` INSERT row; disable trigger via API → audit row + panel shows it | ⏳ | — | runtime proof, not typecheck |
| 14 | Commit per repo touched (us-v3) | ⏳ | — | |

---

## A. Doc findings (cited, TIC doc-pass)

- `us-v3/docs/ai/dal-usage.md:20-24`: *"Target shape: worker services extend
  `DomainService<TEntity>` — lazy `this.dal`/`this.svc` seams, no per-domain
  `*_dal.ts`/`*-repo.ts` wrapper files"* — `db/entity-repo.ts` is a banned
  file shape BY NAME (`*-repo.ts`).
- `us-v3/docs/ai/controller-boundary.md`: controllers MUST NOT import the
  DAL, call exactly ONE service method; domain rules (existence policy,
  reserved checks) live in the service.
- `dal-pg/docs/dev-guide/entity-service.mdx:42-79`: `DomainService` is "the
  only legal shape" — ctor I/O-free (instantiation at module scope is safe),
  custom queries are methods on the owning service via `this.dal.*`.
- `jobs.service.ts:185` comment (verbatim): *"Materialization reconciles
  through its own path, not this hook"* — `beforeCreate/beforeUpdate` reject
  system payloads (`system_key` in body → ValidationError). Reconcile MUST
  use `this.dal`-level methods, never `svc.create/update`.
- `check-standards.ts:1801`: baseline file is OPTIONAL — after repayment it
  is deleted, not emptied.
- `sdk/marker-audit-port.ts:74`: `inner.writeAudit` is invoked for every
  action — a marker port on a non-`@AuditTrail` entity writes to a dropped
  table if ever reached. Dead misconfig on schedules/runs today (unreachable
  because routes are read-only) — still removed (task 4).

## B. What already exists (TIC surprise)

The convergence destination is BUILT — `src/modules/jobs/jobs.service.ts`
holds `JobTriggersService`/`JobSchedulesService`/`JobRunsService` extends
`DomainService`, wired into `entities-route.ts` decls (`new XxxService()`).
F3 is not "create services" — it is **routing the 39 stray dal invocations
through them** and deleting the banned seams.

## C. Complete census — 39 `dal.*` invocations (baseline counts only the 25 `getDal(` lines)

### `services/schedule-service.ts` — 14 (all JobScheduleEntity)

| line | call | target method |
|---|---|---|
| 199 | `dal.findAll` by schedule_subject (terminal-once gate) | `findBySubject` |
| 278 | `dal.update` existing (declare re-arm) | `patchRow` |
| 284 | `dal.add` mirror insert | `insertMirror` |
| 348+352 | `dal.findAll` + `dal.update` (disarm → status+disarmed_at) | `findBySubject`+`patchRow` |
| 376 | `getScheduleRow` findAll | `findBySubject` |
| 393 | `dal.update` (unsuppress → stopped) | `patchRow` |
| 409 | `dal.hardDelete` (dropMirror) | `dropMirror` |
| 430+439+447 | `dal.findAll` + 2× `dal.update` (markFired once/recurring) | `findBySubject`+`patchRow` |
| 516+544+579 | `dal.findAll` all + 2× `dal.update` (reconcile heal/backfill) | `listAllRows`+`patchRow` |

### `services/triggers-engine.ts` — 2

| line | call | target |
|---|---|---|
| 137 | `loadTrigger` findAll by uuid | `findByUuid` |
| 406 | boot enumeration findAll all | `listLive` |

### `services/system-triggers.ts` — 4

| line | call | target |
|---|---|---|
| 68 | `findBySystemKey` findAll + deletedRecords INCLUDED | `findBySystemKey` |
| 90 | `dal.add` materialize insert | `insertSystemRow` |
| 125 | `dal.update` drifted code-owned fields | `patchRow` |

### `services/due-forwarder.ts` — 3

| line | call | target |
|---|---|---|
| 75 | `insertRun` dal.add | `addRun` |
| 106+110 | `failRun` findAll+update | `findByUuid`+`patchRow` |

### `services/run-recorder.ts` — 5

| line | call | target |
|---|---|---|
| 86+92 | `correlateRun` findAll+update | `findByUuid`+`patchRow` |
| 120 | `recordDirectRun` dal.add | `addRun` |
| 149+157 | `sweepLostRuns` findAll dispatched<cutoff + update loop | `listDispatchedBefore`+`patchRow` |

### `controllers/http/actions-route.ts` — 6

| line | call | target |
|---|---|---|
| 170 | run-stats `Project.expr` aggregate over JobRunEntity | `JobRunsService.statsBySchedule` |
| 277 | `loadOwnerTrigger` findAll (+includeDeleted) | `JobTriggersService.findByUuid` |
| 291-297 | `getDal() as unknown as {delete,restore}` — THE CAST | `JobTriggersService.setDeleted` |
| 363 | `listSchedules` findAll status IN | `JobSchedulesService.listByStatuses` |
| 562 | drift diagnostic findAll all | `JobSchedulesService.listAllRows` |

### `controllers/http/config-route.ts` — 5

| line | call | target |
|---|---|---|
| 119 | findAll + maskRow | `ConfigEntriesService.listEntries` |
| 129 | find by uuid + 404 | `ConfigEntriesService.getEntry` |
| 171+186+193 | find key/type (B3 static-key guard) + update + re-read | `ConfigEntriesService.updateValue` |

## D. Design — target shape (TOC is transcription)

### D.1 Service methods are `this.dal`-level primitives, callers keep workflow

Per the doc contract, custom queries are methods on the owning service; the
function modules keep orchestration (subject locks, NATS PubAck, reconcile
loops, logging, `publishTriggerChanged`). Instantiation mirrors the
entities-route precedent — module-scope const, I/O-free:

```ts
// services/schedule-service.ts
import { JobSchedulesService } from "../modules/jobs/jobs.service.js";
const schedules = new JobSchedulesService();
```

### D.2 `JobSchedulesService` additions

```ts
async findBySubject(scheduleSubject: string): Promise<JobScheduleEntity | undefined>
  // dal.findAll eq schedule_subject → rows[0]

async listByStatuses(statuses: string[]): Promise<JobScheduleEntity[]>
  // Filter.expr status IN unnest

async listAllRows(): Promise<JobScheduleEntity[]>
  // dal.findAll null — drift diagnostic + reconcile enumeration

async insertMirror(row: Partial<JobScheduleEntity>, actor: string)
  // dal.add — declare-time mirror insert

async patchRow(uuid: string, version: bigint, patch: object, actor: string)
  // dal.update {uuid, version, ...patch}, matchBy:"uuid" — collapses
  // disarm/unsuppress/heal/backfill/nextFire/re-arm writes

async dropMirror(uuid: string, version: bigint, actor: string)
  // dal.hardDelete — physical drop (derived mirror, no deleted_at)
```

### D.3 `JobTriggersService` additions

```ts
async findByUuid(uuid: string, opts?: { includeDeleted?: boolean })
  // loadTrigger + loadOwnerTrigger

async findBySystemKey(key: string)
  // deletedRecords: "INCLUDED" — reconcile anchor lookup

async listLive()
  // boot enumeration — EXCLUDED default IS the "enabled" filter

async setDeleted(uuid: string, version: bigint, deleted: boolean)
  // this.svc.delete(uuid, {version}) / this.svc.restore(uuid, {version})
  // — the wire-canonical path: audit row + entity-changed marker +
  // afterWrite→publishTriggerChanged all fire; actor stamps via the
  // configured requireActor supplier (HTTP session context)

async insertSystemRow(row: Partial<JobTriggerEntity>, actor: string)
  // this.dal.add — materialize insert; NEVER svc (hooks reject system_key)

async patchRow(uuid, version, patch, actor)
  // this.dal.update — reconcile drift write; NEVER svc
```

### D.4 `JobRunsService` additions

```ts
async addRun(row: Partial<JobRunEntity>, actor: string)
  // insertRun + recordDirectRun

async findByUuid(uuid: string)  // failRun + correlateRun reads

async patchRow(uuid, version, patch, actor)
  // fail/correlate/sweep updates

async listDispatchedBefore(cutoff: Date)
  // sweep: status='dispatched' AND created_at < cutoff

async statsBySchedule(unit: string, subjects: string[])
  // the Project.expr aggregate verbatim from actions-route:170
```

### D.5 `ConfigEntriesService` (new, fourth service)

```ts
export class ConfigEntriesService extends DomainService<ConfigEntryEntity> {
  constructor() { super({ entity: ConfigEntryEntity, actor: requireActor }); }

  async listEntries()              // findAll configProjection — maskRow stays in controller (transport shaping)
  async getEntry(uuid: string)     // find by uuid
  async updateValue(uuid, body: { value: unknown; version: bigint }, actor: string)
    // internalizes the B3 guard: find key/type → reserved/static-key rejection
    // (domain rule, controller-boundary says it must leave the controller)
    // → dal.update value → re-read full row → return
}
```

### D.6 Seam deletions

- `src/db/entity-repo.ts` — DELETED (`entityActor` = `requireActor` pass-
  through; configs use `actor: requireActor` from `@primebrick/sdk` directly).
- `check-standards.json` allowPaths → `["adapters/config-repository-adapter.ts",
  "db/dal.ts", "index.ts"]` — permanent infra only. The adapter stays: it
  implements the SDK `ConfigRepositoryPort` for ConfigLoader bootstrap reads —
  legitimately NOT a domain query.
- `check-standards-baseline.json` — DELETED (optional file; 25→0).

## E. `as never` casts

Every current call site carries `as never` on rows/options (entity-shape
mismatches). Typed service-method params remove most of them; surviving casts
stay inside service methods where the entity/patch typing genuinely diverges.
No NEW casts introduced.

## F. Test-mock strategy (empirical — the subtle part)

Today tests mock `../db/dal.js`'s `getDal` — which does NOT intercept
`DomainService.this.dal` (it resolves `getDal` inside `@primebrick/dal-pg`,
a different module path). After F3 every dal call flows through the services,
so mocks move ONE level:

```ts
vi.mock("@primebrick/dal-pg", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@primebrick/dal-pg")>()),
  getDal: () => ({ findAll: h.findAll, add: h.add, update: h.update, hardDelete: h.hardDelete, delete: h.del, restore: h.restore }),
}));
```

This intercepts BOTH `../db/dal.js` re-export consumers AND service internals
— one mock point, fewer mocks than today. `importOriginal` spread keeps real
entities/`Filter`/`DomainService`/`ValidationError` importable.

Caveat verbatim for TOC: mocks on `../modules/jobs/jobs.service.js` (e.g.
`publishTriggerChanged` in system-triggers.test.ts) MUST use
`await importOriginal()` spread — the module now also exports the service
classes the code under test instantiates.

## G. Acceptance criteria

1. `bun ../primebrick-v3-sdk/tools/check-standards.ts src` in job-handler →
   clean with baseline file DELETED.
2. `tsc --noEmit` + `vitest run` → green.
3. `git grep -n "getDal(" src/services src/controllers` → zero hits outside
   allowPaths (`db/dal.ts`, adapters, index).
4. Live probes after restart:
   a. `POST /api/v1/actions/materialize` (or trigger re-materialize on JH
      restart) → `job_triggers_audit` gains an INSERT/UPDATE row —
      visible in the Version History panel (the v4-badge surface).
   b. Disable a trigger via the API → DELETE audit row appears.
   c. Arm/disarm a schedule → mirror row transitions (no audit expected —
      mirror is not auditable state, per design).
   d. `job_handler` unit suite proves mocks still intercept (failures here
      are mock-shape issues, not behavior).
5. FE e2e `jobs-pages.spec.ts` stays green (the uuid-keyed audit spec added
   this session is the canary).

## H. Decisions for the user

- **D1 — `entity-repo.ts` delete**: recommended YES (banned `*-repo.ts`
  shape; sole export is a pass-through). Say "keep" only if you want a named
  seam retained.
- **D2 — marker auditPort off Schedules/Runs**: recommended YES, drop it —
  entities have no `@AuditTrail`, svc writes are unreachable, and if reached
  they would write to the dropped `_audit` tables. Say "keep" only if you
  foresee svc-writes on those entities (then the audit contract must be
  revisited instead).
- **D3 — `setDeleted` via `svc.delete/restore`**: recommended — wire-canonical
  (same path the entity router uses), gives audit+marker+afterWrite publish
  free; `refreshTrigger` stays explicit in the caller (synchronous local
  reload vs async NATS signal — both wanted). Say "repo-level" to bypass
  hooks deliberately (NOT recommended — the wire path must not diverge).
- **D4 — `ConfigEntriesService`**: recommended — the route today does
  DAL-in-controller including a domain rule (B3 static-key guard); the
  service absorbs it. Say "defer" to leave config-route for a later batch
  (its 5 violations stay baselined then — NOT recommended: baseline must
  empty this pass).

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
