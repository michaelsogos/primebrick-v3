# svc-write-governance — this.dal writes → svc, actor via ALS, hooks with ctx

> Status: **✅ DONE — shipped (verification sweep 2026-12-08)**
> Plan type: construction hardening (DAL/service convergence, F4-class)
>
> **As built** (the plan doc was stale; TOC had already landed):
> - dal-pg `6561778` — actor guard (auditable+unresolved → throw at
>   repository.ts:238), `hasAuditTrail` auditPort gate (latent spam bug
>   killed), `svc.bulkUpdate`/`bulkPurge`, hook `{actor}` ctx
> - sdk `74045aa` + `9602569` — `dal-member-write` lint incl.
>   alias/bracket-access evasion coverage
> - us-v3 `ec398c3`/`995b042`/`d5335f9` — JH migration: `actorSession` +
>   `runWithSession` wraps, `isSystemActor` hook branches, svc ops ×11
> - be-v3 `676aac6` + `eb33b39`/`442f6ad` — 35-site migration to svc,
>   `config_entries` @AuditTrail declared
> - Verified live: `this.dal.<write>` census = **0** in JH+BE src;
>   lint rule active in `tools/check-standards.ts`

## Context

`DomainService` exposes `this.dal` (raw gateway) and `this.svc` (governed
`EntityService`). Today service code may call `this.dal.<write>` — a path that
compiles and silently drops the svc governance pipeline. Goal: **one write
surface** (`svc`), reads/infra stay on `this.dal`, actor always resolved via
ALS (`runWithSession`/`runAsSystem`), no new abstractions.

## TIC findings — verified facts (corrected)

What svc adds on every write (entity-service.ts:846-958):

1. `beforeCreate`/`beforeUpdate` hooks (domain validation)
2. `audit: auditPort` bound — marker variant (`makeMarkerAuditPort`) for JH,
   `EntityAuditPort` (marker+NATS+Redis) for BE
3. `actor: actor()` resolved from `cfg.actor` = `requireActor` (ALS)
4. governed RETURNING projection + `fireAfterWrite`

What is ALREADY enforced (earlier claims corrected):

- **Audit rows**: auto-injected by the gateway since F1 — `Dal.auditDefault`
  binds `tableAuditPort()` when the entity has `@AuditTrail` and caller passed
  no `audit:` (dal.ts:613-625, applied on add/update/delete/restore/hardDelete).
  `this.dal.<write>` DOES write `{table}_audit` — what it misses is the
  **marker publish** (svc's marker port variant).
- **Actor**: type-level REQUIRED for auditable entities via overloads
  (`AuditableWriteOptions.actor: string`; non-auditable: "actor rejected").
  Residual hole: `as any` bypass → runtime skips stamping silently
  (repository.ts:1780 `actor !== undefined` guard).

Real remaining gaps `this.dal.<write>` causes:

- **Hooks skipped** — domain validation never runs.
- **Marker skipped** — auto-inject writes the audit ROW but not the
  entity-changed marker → FE/collab not notified (the stale-UI class of bug).
- **Actor manual** — caller names the string; no auto-resolution from ALS,
  arbitrary attribution possible.
- **`svc` unusable in system contexts** — `requireActor` throws outside ALS
  scope → services escape to raw dal instead of wrapping `runAsSystem`.
- **Latent bug found**: `svc` binds `auditPort` unconditionally; the repo
  audit-write guard uses `isAuditableEntity` (columns) not `hasAuditTrail`
  (table exists) → svc writes on schedules/runs attempt audit on DROPPED
  `job_schedules_audit`/`job_runs_audit` → fire-and-forget error spam
  (`[DAL Audit Error]` on every svc write — repository.ts:894 `.catch`).

Actor/session infrastructure (already built — zero new machinery):

- `runWithSession(session, fn)` / `runAsSystem(fn)` / `requireActor` /
  `getSession` — SDK `session-context.ts`, ALS-based, request-durable.
- HTTP/RPC handlers already wrapped (rpc-router.ts:434, auth.middleware.ts:142).
- `subscribeShielded` does NOT install a session — NATS handlers run bare.
- Actor vocabulary: `system:<code>` (resolves via service_registry.code —
  repository.ts:659), `x:<code>`; JH already stamps `system:${caller}`
  (system-triggers.ts:79); engine forwards originator `actor_uuid` from the
  message auth headers (triggers-engine.ts:239-245).

Census `this.dal.<write>` (exact scope of the ban):

| Repo | Sites | Ops |
|---|---|---|
| job-handler | **8** | add×3, update×4, hardDelete×1 |
| be | **35** | update×15, add×8, delete×4, hardDelete×3, restore×2, updateMany×1, hardDeleteMany×1, deleteMany×1 |
| ai/es/crm/webhook | **0** | (repository-family = already covered by dal-access/layer-repo-import) |

svc op coverage vs needs: create✓ update✓ delete✓ restore✓ purge✓ bulkDelete✓
bulkRestore✓ — **gaps: `bulkUpdate`, `bulkPurge`** (BE needs both ×1).

## Design (approved direction — no new abstractions)

```
ADESSO:  this.dal.update(E, row, {actor})        // hooks ✗ marker ✗ actor manual
         svc.update(uuid, body)                  // only path with governance
         system ctx → requireActor throws → escape to dal

DOPO:    svc.<op> = THE write surface
         getDal({ actor: requireActor })         // gateway supplier → options.actor ?? cfg.actor()
         entry points: runWithSession({actor: fwd | "system:job"}, fn)
         hooks(body, ctx:{actor}) → branch on actor convention
         this.dal = find*/transaction/entityService/tableAuditPort ONLY
         lint: this.dal.<write-verb> banned → CI red
```

## Tasks

### A. dal-pg (library enforcement)

| # | Task | Files |
|---|---|---|
| A1 | `DalConfig.actor?: () => string`; write ops resolve `options.actor ?? config.actor?.()`; **auditable entity + unresolved actor → throw** (runtime guard closes the `as any` hole) | `src/dal/dal.ts`, `src/repository/repository.ts` |
| A2 | Bind `auditPort` in `makeEntityService` ONLY when `hasAuditTrail(entity)` — kills the swallowed `_audit`-write spam on non-trail entities (latent bug) | `src/entity/entity-service.ts` (~L407) |
| A3 | `svc.bulkUpdate(items)` + `svc.bulkPurge(items)` — same actor/audit binding as siblings | `src/entity/entity-service.ts` |
| A4 | Hook ctx: `beforeCreate(body, ctx)`/`beforeUpdate(uuid, body, ctx)` where `ctx = {actor: resolvedActor}` — additive; existing hooks ignore it | `src/entity/entity-service.ts` |
| A5 | Tests: actor matrix (explicit wins / supplier fills / auditable+unresolvable throws / non-auditable free), no auditPort on non-trail entity, ctx propagation, bulk ops | `test/` |

### B. lint (sdk tools)

| # | Task | Files |
|---|---|---|
| B1 | Rule `dal-member-write` (always-on consumer, NO_EXEMPT): `this\.dal\.(add|update|delete|restore|purge|hardDelete|clone|truncate|addMany|updateMany|deleteMany|restoreMany|hardDeleteMany|upsert|upsertMany)` | `tools/check-standards.ts` |
| B2 | e2e fixtures: flagged write ops; allowed read/infra ops (`findAll`,`find`,`transaction`,`entityService`,`tableAuditPort`,`serverVersion`) | `tools/__tests__/check-standards.test.ts` |
| B3 | **Activation ordering**: rule lands LAST — only after C+D migrations are green (no debt mechanism exists; a red repo blocks CI) | — |

### C. job-handler migration

| # | Task | Files |
|---|---|---|
| C1 | Wrap system entry points: `subscribeShielded` handlers → `runWithSession({actor: forwardedActor(msg).actor_uuid ?? "system:job"})`; boot materialize/reconcile → `runAsSystem`/`system:job` — census exact sites at TOC | `services/triggers-engine.ts`, `services/due-forwarder.ts`, `index.ts`, `services/system-triggers.ts` |
| C2 | 8 write sites → svc: add→create, update→update, hardDelete→purge; inside wrapped contexts actor resolves automatically | `modules/jobs/jobs.service.ts` |
| C3 | Hooks ctx-aware: `assertSystemTriggerMutable` branch — `ctx.actor` system-prefixed → system validation rules (system_key allowed+validated); else user rules | `modules/jobs/jobs.service.ts` |
| C4 | `updateValue` → `svc.update` + move `assertWritableConfigKey`/secret-mask into `beforeUpdate` hook (enforced for every writer) | `modules/jobs/jobs.service.ts` |
| C5 | Tests: update mock-dal expectations; add e2e — system-context write stamps `system:*` + produces marker | `src/__tests__/` |

### D. BE migration (required for B3 — 35 sites)

| # | Task | Files |
|---|---|---|
| D1 | 35 sites → svc ops; `updateMany`→`svc.bulkUpdate`, `hardDeleteMany`→`svc.bulkPurge` (A3 dependency) | `modules/auth/services/*.ts` + census all files at TOC |
| D2 | Session-less callers → existing `runAsSystem` pattern (already used in invitation/mfa/webauthn services) | same files |
| D3 | Update `db/domain-service.ts` docstring: "custom queries use this.dal" → "reads+infra via this.dal; writes via svc (actor from ALS)" | `src/db/domain-service.ts` |

### E. Docs + verification

| # | Task | Files |
|---|---|---|
| E1 | dal-usage-guide + conventions: `this.dal` = read/infra surface; writes only via `svc` | dal-pg `docs/` |
| E2 | Full verification: dal-pg suite, sdk lint+tests, JH vitest+live boot, BE tsc+lint+tests, all-US lint run | — |

## Acceptance criteria

- `this.dal.<write-verb>` anywhere in consumer src → lint violation (CI red).
- Every write produces: hooks ran, audit row (trail entities), marker publish,
  actor stamped from ALS — for session AND system contexts.
- `svc` on non-@AuditTrail entity: no `_audit` write attempt (A2 fix) —
  zero `[DAL Audit Error]` spam.
- Raw write on auditable entity with no resolvable actor → throws (A1).
- JH vitest green, stack boots clean, BE suite green.

## Decisions — awaiting user

| # | Question | Default proposed |
|---|---|---|
| Q1 | Hook writer-kind via `ctx:{actor}` param (explicit) vs `getSession()` in hook body (ambient) | **ctx param** — testable, no ALS reach-in |
| Q2 | Actor in engine paths: forwarded `actor_uuid` (originator) vs `system:*` | **forwarded wins, `system:<code>` fallback** — preserves attribution (already the engine's intent at triggers-engine.ts:239) |
| Q3 | BE 35 sites inside this plan | **yes — required**: B3 can't ship green otherwise |
| Q4 | `svc.bulkUpdate`/`bulkPurge` additions (needed by 2 BE sites) | **yes** |
| Q5 | `DalConfig.actor` — every consumer initDal passes `requireActor` | **yes** — absent supplier keeps explicit-actor requirement (tools/seeds unaffected) |
