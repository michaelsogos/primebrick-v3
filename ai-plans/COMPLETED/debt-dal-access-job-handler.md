# Debt repayment — dal-access boundary + audit-port hole, ALL repos (no partial migration)

> Scope widened 2026-11-17 per user directive ("no fear of breaking
> changes — fix them ALL"): was job-handler-only, now covers the
> construction fix, the tx seam, and every baselined/allowlisted site
> across us-v3 (ai/emailsender/crm) and be-v3.

## Status: ✅ DONE — superseded + repaid, verified 2026-12-21 (moved to COMPLETED)

> Tasks 0/0b/0c shipped as F1+F2 (`audit-construction-f1-f2.md`, COMPLETED).
> Tasks 1–9 (JH) repaid by `jh-domainservice-convergence-f3` — empirically
> verified: zero dal in services/controllers, domain methods on the three
> DomainServices, baseline deleted, audit rows live. Tasks 10–14
> (ai/emailsender/crm/be-v3 + baselines) repaid by
> `dal-access-construction-hardening` R2–R7 — both repos at zero consumer
> violations, `dalInfra()` canonical door, empty baselines deleted.

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 0 | **dal-pg `Dal` gateway: auto-inject `options.audit ??= this.tableAuditPort()` on `add`/`update`/`delete`/`restore`/`hardDelete`/`touch`** — the by-construction fix; no caller can silently skip `{table}_audit` via the Dal path ever again | ⏳ not done | — | `types.ts:147` made audit opt-in "silently skipped" — the designed hole; explicit `audit:` (marker ports) still wins via `??=`; `writeAudit` is fire-and-forget `.catch` → primary write can never fail |
| 0b | **dal-pg tx seam: `dal.transaction(fn)` + `DeferredTransaction` — wrap the tx `Repository` so write methods default-inject `makeTableAuditPort(txRepo)`** | ⏳ not done | — | audit rows inside the same tx (atomic with the data write); the only silent path left after task 0 |
| 0c | dal-pg: tests for auto-inject (default port fires, explicit port wins, non-auditable no-op, tx seam) + docs sync | ⏳ not done | — | dal-usage docs + extracted api docs |
| 1 | JH `db/entity-repo.ts`: `auditPort()` + per-domain named helpers (schedules, triggers, runs, config-entries) | ⏳ not done | — | allowlisted path |
| 2 | JH `services/schedule-service.ts`: 7 sites → repo helpers | ⏳ not done | — | writes gain `job_schedule_audit` rows (currently missing) |
| 3 | JH `services/due-forwarder.ts`: 3 sites → repo helpers | ⏳ not done | — | |
| 4 | JH `services/run-recorder.ts`: 3 sites → repo helpers | ⏳ not done | — | decision A below |
| 5 | JH `services/triggers-engine.ts`: 2 sites → repo helpers | ⏳ not done | — | |
| 6 | JH `services/system-triggers.ts`: 2 sites → repo helpers | ⏳ not done | — | reconcile must keep bypassing entity-service hooks (frozen-set rule is wire-only by design) |
| 7 | JH `controllers/http/actions-route.ts`: 5 sites → delegate to service-layer functions; remove `getDal() as unknown as {delete,restore}` cast | ⏳ not done | — | MVC boundary fix, decision B |
| 8 | JH `controllers/http/config-route.ts`: 3 sites → delegate to service-layer functions | ⏳ not done | — | controllers must not query or import `*-repo` (`layer-repo-import`) |
| 9 | JH baseline: remove all 25 `dal-access` entries | ⏳ not done | — | |
| 10 | **ai service: 9 sites** — composite-route (HealthCheckAdapter + 3 `*-repository` imports), config-route ×3, docs-pack-subscriber repo import, partition-jobs `partitionMaintenance` | ⏳ not done | — | controllers delegate to services; repository imports → service methods |
| 11 | **emailsender: 5 sites** — config-route ×3, email-service dal, webhook-service dal | ⏳ not done | — | |
| 12 | **crm: 1 site** — entities-route `getDal().findAll` | ⏳ not done | — | |
| 13 | **be-v3: shrink 6-file LEGACY allowlist → zero** — oauth-client.service (4 calls), client-shield-registry.service (3), service-registry.service (22), translations.service (10), telemetry (1); collaboration.service allowlist entry is STALE (0 calls — remove entry outright) | ⏳ not done | — | migrate each to DomainService/repo seam per `service-layer-oop-consolidation` model; service-registry (22 calls) is the heavy file |
| 14 | Baselines: remove repaid entries — JH 25, ai 9, emailsender 5, crm 1; be-v3 allowPaths → 5 PERMANENT only | ⏳ not done | — | entries deleted, not suppressed |
| 15 | Verify per repo: `check-standards` clean with baselines removed, tsc, vitest; live audit-row presence on system writes (JH restart + materialize trigger / arm schedule / record run → `*_audit` rows exist) | ⏳ not done | — | |

---

## A. Diagnosis (verified against code + docs, not memory)

### Where the debt came from

- The `dal-access` rule (`primebrick-v3-sdk/tools/check-standards.ts:236`) bans
  `getDal(`/`initDal(` outside `allowPaths`. Job-handler allowlist
  (`job-handler/.devin/check-standards.json`): `db/dal.ts`, `db/entity-repo.ts`,
  `adapters/config-repository-adapter.ts`, `index.ts`.
- The rule was **activated on 2026-11-11** (commit `878b378`, "activate
  dal-access + layer-repo-import, declare debt") over code written **before the
  gate existed**. 48 violations were baselined across us-v3 (JH 29 → now 25).
  No refactoring "created" this debt — the gate turned on and pre-existing call
  sites were queued for repayment. The baseline is a ratchet, not an amnesty.
- **My own error**: on 2026-11-16 (commit `d36c7f1`) I added 2 baseline entries
  for `system-triggers.ts` instead of fixing the sites — the fix would have
  been ~30 lines. Wrong call; this plan repays it together with the rest.

### Why it is FUNCTIONAL debt, not style debt (the real reason it is inadmissible)

`repository.ts:877` — `repo.add/update` writes the `{table}_audit` row **only
when `options.audit` (an AuditPort) is injected**:

```ts
if (inserted && auditable && options.audit && pk && actor !== undefined) {
  options.audit.writeAudit({ ... });
}
```

Every baselined write call passes `{ actor: "system:job" }` — actor, **no audit
port**. All three entities are `Auditable` (`JobTriggerEntity`,
`JobScheduleEntity`, `JobRunEntity`). Consequences verified in code:

- `system-triggers.ts` materialization/reconcile writes → **no
  `job_trigger_audit` rows**. A system trigger's version-history panel is empty
  until a human edits it.
- `schedule-service.ts` declare/disarm writes → no `job_schedule_audit` rows.
- `due-forwarder.ts`/`run-recorder.ts` run lifecycle writes → no
  `job_run_audit` rows (see decision A — volume).
- `actions-route.ts:291` — `getDal() as unknown as {delete;restore}` cast:
  delete/restore bypassing entity-service hooks **and** audit — the ugliest
  site.

This also explains a real symptom: the version-history work just shipped
enriches deltas that exist — these system writes produce nothing to enrich.

### How the elusion happened (root cause of the hole)

The user asked: audit was supposedly enforced "by construction AND by lint" —
how did these sites bypass it? Verified answer: **the enforcement exists but
covers the wrong surfaces; the write path was designed opt-in.**

1. **By construction — `audit` is OPTIONAL in the type.** `types.ts:147`:
   `audit?: AuditPort` with the comment *"if not injected, audit is silently
   skipped"*; file header: *"microservices that don't need it aren't forced"*.
   `AuditableWriteOptions` requires `actor` only. So
   `dal.add(E, row, { actor })` type-checks clean — no cast needed to elude.
   (The `as never` casts in those files — 32 occurrences — are for row shapes,
   unrelated to audit.)

2. **By lint — enforcement exists but only on the SQL-seed surface.** Rule
   `seed-audit-trail` (`check-standards.ts:1615+`) scans `db-meta/patches/*.sql`:
   INSERTs into auditable tables must write `<t>_audit` rows or carry
   `-- pb:no-audit-trail`. So the audit-trail contract IS lint-enforced — but
   **only for seed patches**. No rule inspects TS write calls for
   `options.audit`; `dal-access` only gates WHERE `getDal` may be called, not
   WHAT the call carries.

3. **Net**: seed SQL → audit enforced by lint; `svc` writes → audit
   auto-injected by construction (`entity-service.ts:856+`); raw-`dal` writes →
   audit silently skipped, and NO gate (type or lint) noticed. Services written
   pre-gate with the doc-allowed `getDal()` pattern simply never passed
   `audit:` — the type never asked, the lint never looked.

### The by-construction fix (task 0)

`Dal` already owns the standard port: `tableAuditPort()` (`dal.ts:591`) returns
`makeTableAuditPort(this.repo)`. The gateway delegates `add`/`update`/`delete`/
`restore`/`hardDelete`/`touch` to `this.repo` — before delegating it will
default-inject:

```ts
options.audit ??= this.tableAuditPort();
```

- Explicit `audit:` still wins (`??=`) — services injecting the marker port
  (`makeMarkerAuditPort`) for NATS publish keep their port.
- Non-auditable entities: injection is a no-op — the repo's write condition
  already requires `auditable &&`.
- `dal.entityService()` path unaffected — svc writes use `repo` directly with
  their own injected port.
- `dal.transaction(repo => …)`: the callback receives the raw tx `Repository`,
  not the Dal — writes through it still need explicit `audit:` (documented
  limitation; the tx seam is internal).

### Canonical docs (cited, not remembered)

- `primebrick-us-v3/docs/ai/dal-usage.md`: target shape = `DomainService`
  (`this.dal`/`this.svc`); consumers may import `getDal`; **"existing
  `*_dal.ts`/`*-repository.ts` are legacy debt — do NOT create new ones"**.
  `db/entity-repo.ts` already exists and is allowlisted → helpers live there,
  no new file.
- `primebrick-us-v3/.devin/rules/controller-boundary.md` +
  `layer-repo-import` (`appliesTo: controllers/`): controllers may not import
  `*(-|_)(dal|repo|repository)` modules → controllers delegate to services.
- `JobSchedulesService` doc comment (`jobs.service.ts`): *"schedule state is
  written ONLY by schedule-service.ts"* — the design intends service-owned
  writes; the writer simply bypassed the service.
- `assertSystemTriggerMutable` (`jobs.service.ts:185`): *"Materialization
  reconciles through its own path, not this hook"* — system reconcile writes
  MUST NOT route through `JobTriggersService` (its beforeCreate/beforeUpdate
  hooks reject system payloads by design). Reconcile keeps a direct write path
  — but with `audit:` injected.

## B. Remediation design

### B.1 Repo seam — `job-handler/src/db/entity-repo.ts` (allowlisted)

Extend the existing file (header already says "shared helpers for entity
services"). No new `*-repo.ts` files (doc prohibition).

```ts
import { getDal } from "@primebrick/dal-pg";
import { makeMarkerAuditPort } from "../services/marker-audit-port.js"; // if applicable

export function auditPort(): AuditPort {
  return getDal().tableAuditPort();
}
```

Named helpers per call site — examples:

```ts
// schedule-service.ts:199
export function findScheduleRow(scheduleSubject: string) {
  return getDal().findAll<JobScheduleEntity>(JobScheduleEntity, null, {
    filters: [Filter.fieldValue(field(JobScheduleEntity,"schedule_subject"),"=",scheduleSubject)],
  });
}
// system-triggers.ts:90 — write WITH audit injected (the functional fix)
export async function insertSystemTrigger(row: Partial<JobTriggerEntity>, actor: string) {
  return getDal().add(JobTriggerEntity, row as never,
    { actor, audit: auditPort() } as never);
}
```

Same pattern for every write helper: `{ actor, audit: auditPort() }`.

### B.2 Why repo-helpers and NOT DomainService conversion (rejected alternative)

`DomainService.this.svc` writes run entity-service hooks. Two of the six files
deliberately bypass those hooks (`system-triggers` reconcile, schedule mirror
writes owned by `schedule-service.ts` per `JobSchedulesService` doc). Routing
them through `svc` would require hook-bypass machinery — more complexity, real
regression risk, zero gain. Reads via `this.dal` would need converting five
free-function modules into classes for no behavioral benefit. Repo-helpers in
the allowlisted file satisfy the gate, satisfy the doc (no new wrapper files),
and fix the audit hole — smallest diff with the functional payoff.

### B.3 Controllers → services

`layer-repo-import` (`appliesTo: controllers/`) forbids importing `entity-repo`
from controllers. So:

- `actions-route.ts` — move each query into exported functions on the
  appropriate service module (jobs domain: `modules/jobs/` or
  `services/schedule-service.ts` for schedule queries, a stats function for the
  `StatRow` aggregate). The `{delete,restore}` cast → replace with
  `JobTriggersService`/`JobSchedulesService` `svc.delete`/`svc.restore` calls
  (decision B — hooks on delete path must be checked: does soft-delete run
  beforeDelete hooks that reject system rows? verify during execution).
- `config-route.ts` — config-entry find/findAll/update → a small exported
  accessor on a service module (e.g. `services/config-service.ts` if it exists,
  else `modules/`). `ConfigRepositoryAdapter` is SDK-port only (key/value for
  ConfigLoader) — not reusable for the route's projection/uuid needs.

### Full census — verbatim from the baselines (TIC-produced, per workflow)

us-v3 baselines (besides job-handler's 25 detailed below):

```
ai (9):
  layer-repo-import  controllers/http/composite-route.ts   "../../services/conversation-repository.js"
  layer-repo-import  controllers/http/composite-route.ts   "../../services/feedback-repository.js"
  layer-repo-import  controllers/http/composite-route.ts   "../../services/telemetry-repository.js"
  layer-repo-import  controllers/nats-sub/docs-pack-subscriber.ts  "../../services/docs-kb-repository.js"
  dal-access         controllers/http/composite-route.ts   new HealthCheckAdapter(getDal())
  dal-access         controllers/http/config-route.ts      getDal().findAll(ConfigEntryEntity, configProjection)
  dal-access         controllers/http/config-route.ts      getDal().find(ConfigEntryEntity, configProjection, …)
  dal-access         controllers/http/config-route.ts      const dal = getDal();
  dal-access         controllers/nats-sub/partition-jobs.ts getDal().partitionMaintenance(ENTITY_REGISTRY)
emailsender (5):
  dal-access         controllers/http/config-route.ts      ×3 (findAll/find/dal=)
  dal-access         services/email-service.ts             const dal = getDal();
  dal-access         services/webhook-service.ts           const dal = getDal();
crm (1):
  dal-access         controllers/http/entities-route.ts    getDal().findAll(…)
```

be-v3 LEGACY allowlist (`getDal(` call counts, verified 2026-11-17):

```
modules/collaboration/collaboration.service.ts          0  ← STALE entry
modules/mcp/oauth/oauth-client.service.ts               4
modules/system/client-shield-registry.service.ts        3
modules/system/service-registry.service.ts             22  ← heavy
modules/system/translations.service.ts                 10
observability/telemetry.ts                              1
```

job-handler (25 — per-file inventory in task table; all sites are plain
`findAll`/`find`/`add`/`update`/`delete`/`restore` on owned entities
verified call-by-call during TIC; writes pass `{actor}` without `audit:`).

### History — why this was left undone (documented, not memory)

- `COMPLETED/service-layer-oop-consolidation.md` (2026-10-16): BE fully
  migrated (9 `*Dal`/`*Repo` files absorbed into DomainService classes);
  the new rules were shipped CONFIG-GATED — *"US runs same tool
  unmigrated"*. BE kept 6 LEGACY allowlist files marked "shrink to zero".
- `drift-closure-batch.md` (2026-11-11): rules ACTIVATED on all 5 US
  services at once → 48 violations baselined (ratchet: declared passes,
  new fails). No repayment workstream was scheduled — the plan closed
  without one. That is the drop: gate on, migration never planned.

### Decisions for the user (blocking PROCEED choice, defaults recommended)

- **A — `job_run` audit volume**: runs are high-frequency. Auditing every
  insert + status flip mirrors entity semantics consistently (entity is
  `Auditable` — writes SHOULD trail), but `job_run_audit` grows with run
  volume. **Default: audit them** (correctness first; retention/archival is a
  separate concern). Say "no run audit" to keep run writes un-audited
  deliberately (then runs get repo helpers without `audit:` — but that keeps
  the functional hole on purpose).
- **B — delete/restore in actions-route**: the cast exists because callers
  need delete/restore outside the entity-router path. **Default: expose
  `svc.delete/restore` through the DomainService classes** (audited path).
  Fallback: repo helper with `audit:` injected if hooks reject the operation.

## C. Acceptance criteria

1. `bun ../primebrick-v3-sdk/tools/check-standards.ts src` in job-handler →
   **clean with the 25 `dal-access` baseline entries REMOVED** (baseline file
   still holds other-rule entries if any).
2. `vitest run` job-handler → green (146 tests at plan time).
3. Empirical: after restart, materialize a system trigger / arm a schedule /
   record a run → `job_trigger_audit` / `job_schedule_audit` /
   `job_run_audit` contain rows with `changed_by = system:*` (previously
   missing).
4. Controllers contain zero `getDal` and zero `*-repo` imports.
5. Version-history panel on a system-materialized trigger shows the INSERT row.

## D. Honest accounting — what this changes

- **Behavior gained**: audit rows for system writes (was silently absent);
  delete/restore goes through audited paths instead of a structural cast.
- **Behavior lost**: none — same queries, same writes, same actors.
- **Not in scope**: `dal-access` debt in `ai` (5), `emailsender` (5), `crm` (1),
  FE `panel-*` debt — separate plans if requested.

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.

## Decisions — resolved (user)

- **A — `job_run` audit: NON-ISSUE, resolved by design evidence.** `JobRunEntity` and `JobScheduleEntity` carry the `Auditable` mixin (version + created_by/updated_by — needed for optimistic lock and "who armed/stopped" stamping) but deliberately NOT `@AuditTrail()` — entities-route.ts:54/65 documents intent verbatim: "Derived mirror is not auditable state" / "The run row IS the audit trail". Only `JobTriggerEntity` has `@AuditTrail()` → `job_triggers_audit` is the only trail table. The auto-inject is a no-op on non-`@AuditTrail` entities (verify `writeAudit` guard in TOC). **Side-debt found**: `job_runs_audit`/`job_schedules_audit` exist in live DBs (patches 0005/0006 alter them) but are no longer emitted → orphaned, growing tables → TOC adds a drop patch.
- **B — delete/restore via repo-helper (not svc).** `actions-route.ts` `setTriggerDeleted` casts `getDal()` to a structural `{delete, restore}` to soft-delete/restore `job_triggers`. The comment claims hooks "stay canonical" — but the raw call skips the audit port → trigger disable/enable is invisible in `job_triggers_audit` (real functional hole). Fix: named helpers `softDeleteTrigger/restoreTrigger` in `db/entity-repo.ts` (same `{actor, matchBy:"uuid"}` semantics, no hook interference); post task-0 they get audit auto-injected. The structural cast disappears.

## B — REVISED: the question was wrong; the architecture already answers it

Census of "what we do in other cases": **CRM follows the canonical shape** —
every entity family has `XxxService extends DomainService<XxxEntity>` (12+
services, e.g. `CustomersService`, `ConsentTypesService`). `DomainService`
(dal-pg `src/entity/domain-service.ts`) is THE sanctioned wrapper: lazy
`this.dal` gateway + `this.svc` = the same composed `EntityService` the
entity-router uses — full surface `list/get/create/update/delete/restore/
purge/bulkDelete/bulkRestore/audit/stream`.

`EntityServiceConfig` (entity-service.ts:168-170) already carries the
by-construction guarantees:
- `auditPort` — DEFAULTS to `makeTableAuditPort(repo)` — every svc write is
  audited with ZERO dev action;
- `actor` — `() => string` supplier bound once per service (US binds SDK
  `requireActor`); every write stamps `changed_by` — dev never passes actor.

JH is the anomaly: its "services" are free function modules
(`triggers-engine`, `schedule-service`, `due-forwarder`, `run-recorder`,
`system-triggers`) calling `getDal()` raw, and `entity-repo.ts` free helpers
are an ad-hoc seam duplicating what `DomainService` already is. The cast in
`actions-route.ts` exists only because there is no owning service class.

### Correct B resolution (canonical, reusable, by construction)

1. JH gains per-entity `DomainService` subclasses:
   `JobTriggersService`, `JobSchedulesService`, `JobRunsService`
   (+ others as the census requires) — each owning ALL persistence queries
   for its entity as named methods (the 25 baseline call sites become
   methods, verbatim SQL preserved).
2. Transport + engine services call service methods — `getDal()` survives
   only inside `db/dal.ts` bootstrap and `DomainService` itself.
3. `entity-repo.ts` free functions are ABSORBED into the owning services —
   the file shrinks to genuine cross-entity plumbing or disappears; the
   baseline entry is removed, not re-shaped.
4. The `setTriggerDeleted` cast becomes `this.dal.delete/restore(E,{uuid,
   version},{actor,matchBy:"uuid"})` inside `JobTriggersService` — identical
   semantics, audited by task-0 auto-inject; where the HTTP-semantic
   svc.delete/restore fits (actor bound at cfg), prefer svc.
5. Two concentric "never dev coding" guarantees: svc writes audited via
   `auditPort` default + actor supplier (exists today); raw `this.dal.*`
   writes audited via task-0 gateway `??=`. The only dev choice left is
   svc-vs-dal (hooks+lock semantics vs raw repo) — both audited.

Reusable sempre: any future JH service write is a method on the owning
DomainService — same shape CRM already proves.
