# Plan: Refactor US `emailsender` to consume `@primebrick/dal-pg` via the `Dal` gateway

> Status: APPROVED — user sent PROCEED (2026-07-06). Implementation in progress.
> Created: 2026-07-06 (revised — now uses the `Dal` gateway from `dal-gateway-pool-ownership-plan.md` instead of `new Repository(pool)`; updated after verifying the real `email_templates_communication_log` columns + adding unit-test scope for `EmailService.sendEmail`).
> Scope: `primebrick-us-v3/emailsender` only. BE migration is explicitly deferred to a later plan (feasibility verdict included in §10 for context).
> Prerequisite: `dal-gateway-pool-ownership-plan.md` must be implemented first — this plan depends on the `Dal` class, `getDal()` factory, type-parser registration, and pool ownership being in the lib. ✅ Implemented on `primebrick-dal-v3` branch `feature/dal-gateway-pool-ownership` (commits `eb8e5be` + `34d45dd`).
> Repositories analyzed (empirically, zero assumptions):
> - `primebrick-dal-v3` — the shared DAL library (`@primebrick/dal-pg` v0.1.7 + the new `Dal` gateway, on `feature/dal-gateway-pool-ownership`).
> - `primebrick-us-v3/emailsender` — the target microservice, currently uses raw `pool.query()` SQL.
> - `primebrick-be-v3` — read-only feasibility analysis for the "one unique DAL for all" question.

---

## 1. Objective

Refactor the `emailsender` microservice so that **all** database access goes through the shared `@primebrick/dal-pg` `Dal` gateway — eliminating hand-written SQL strings, removing the duplicated local `entity-decorators.ts`, deleting the local `pool.ts` (the lib now owns the pool), and giving the microservice a single singleton `Dal` instance reused across all requests with zero per-request allocation. The refactor must be behavior-preserving: every existing SQL call site is replaced 1:1 by an equivalent `dal.*` call, with no change to the public service/router/NATS contracts.

Secondary objective: confirm whether `@primebrick/dal-pg` can become the **single unique DAL for both BE and US** (repo-pattern, self-generating queries from entity types). The feasibility verdict is in §10; the actual BE migration is a separate, later plan.

---

## 2. Empirical findings (current state — verified by reading source)

### 2.1 `@primebrick/dal-pg` — what the lib provides (after the gateway plan)

- **Package**: `@primebrick/dal-pg`, `type: module`, exports `.` and `./errors`. Deps: `pg`, `pg-query-stream`, `reflect-metadata`.
- **Gateway**: `getDal(config: DalConfig)` returns a process-wide singleton `Dal` instance. The `Dal` class:
  - Owns the `pg.Pool` (consumer passes `connectionString` + `schema` + pool params; the lib creates and manages the pool).
  - Registers `INT8_OID` + `NUMERIC` type parsers once, idempotently (consumer no longer does this).
  - Sets `search_path`, `statement_timeout` (default 30s), `application_name` on every connection via `onConnect`.
  - Delegates all CRUD/bulk/finder methods to an internal `Repository(pool)`.
  - Provides `withClient(fn, { timeoutMs })` for transactions and ad-hoc long queries.
  - Provides `close(timeoutMs?)` for graceful shutdown (drains the pool with a timeout deadline, default 10s). **The library does NOT install `process.on(...)` handlers** — that is a consumer-side concern (the consumer owns NATS, HTTP servers, Sentry, etc.). The library stays side-effect-free for test isolation.
  - Provides `getPool()` for raw access (snapshot/migration tooling).
- **Repository public API** (delegated through `Dal`): `findById`, `findByUUID`, `find`, `findAll` (array or `AsyncIterable` when `stream: true`), `findByPage`, `count`, `add`, `upsert`, `update`, `delete` (soft), `restore`, `hardDelete`, `addMany`, `upsertMany`, `updateMany`, `deleteMany`, `rawSql`. All single-row writes return `TEntity` (`RETURNING *`). Bulk ops return `TEntity[]` and accept optional `timeoutMs` (emits `SET LOCAL statement_timeout` inside the tx).
- **Options shapes**: `WriteOptions = { actor: string, audit?: AuditPort, logger?: LoggerPort }`. `FindOptions = { filters?, sorting?, joins?, stream?, deletedRecords? }`. Finders default `throwIfNotFound: true`, `deletedRecords: "EXCLUDED"`.
- **Audit**: port-based, fire-and-forget. Only `add()` writes audit today. Not wired in emailsender (no consumer).
- **Errors**: `NotFoundError` (`NOT_FOUND`), `MultipleRowsError` (`MULTIPLE_ROWS`), `UnknownColumnError` (`UNKNOWN_COLUMN`), `ValidationError` (`VALIDATION`). Framework-agnostic.
- **Decorators exported**: `@Entity`, `@Column`, `@Key`, `@Unique`, `@IsNotColumn`, `@AuditableField`, `@DeletableField`, `@SynchronizableField`, `@CloneField`, `@AuditTrail`. Plus `AuditableFieldType`, `DeletableFieldType` enums and `IAuditableEntity` / `IDeletableEntity` / `IExposableEntity` / `IClonableEntity` interfaces.
- **DSL**: `field(Entity, "prop")` → `FieldRef`; `Filter.fieldValue/fieldField/raw/group`, `Sort.by`, `Join.on`, `Project.field/expr`.

### 2.2 `emailsender` — current state

- **Dev port**: `3003`. HTTP endpoints: `POST /webhook`, `GET /health`. NATS subject: `emailsender.send` → `emailService.sendEmail`.
- **Existing shutdown** (`src/index.ts`): minimal — `SIGTERM`/`SIGINT` only, clears heartbeat interval + closes NATS, then `process.exit(0)`. No DAL close (pool not owned yet), no `SIGHUP`, no `uncaughtException`/`unhandledRejection` handlers, no re-entrancy guard. **Replaced** in the refactor (§3.2, §4, step 11).
- **DB pool** (`src/db/pool.ts`): singleton `pg.Pool`, `DATABASE_URL` required, `DB_SCHEMA` defaults to `"emailsender"`, `search_path` set on `onConnect`. `max: 10`. **This file is deleted in the refactor** — the `Dal` gateway owns the pool.
- **Entities** (`src/domain/entities/`):
  - `EmailConfigEntity` → table `email_config`. Columns: `id` (@Key), `uuid` (@Unique, default `gen_random_uuid()`), `provider`, `api_key`, `api_endpoint?`, `from_email?`, `from_name?`, `reply_to?`, plus auditable `created_at/created_by/updated_at/updated_by/version`. Implements `IAuditableEntity` **but `deleted_at`/`deleted_by` are NOT decorated** — pre-existing inconsistency, not fixed here.
  - `EmailTemplateEntity` → table `email_templates`. Columns: `id`, `uuid`, `code`, `language_iso`, `subject?`, `body_html?`, `body_text?`, `mjml_source?`, `variables` (`jsonb`). Same auditable fields, same missing soft-delete columns.
  - `entity-decorators.ts` — **502-line local duplicate** of BE's decorator system. **Deleted in the refactor** — entities import from `@primebrick/dal-pg`.
  - `iauditable_entity.ts`, `ideletable_entity.ts` — local interface files. **Deleted** — re-exported by the DAL.
  - `registry.ts` — US-specific entity registry. Reviewed in §4; kept if it only re-exports entity classes.
- **DB access call sites (exhaustive)**:
  1. `src/services/email-service.ts` `sendEmail()`:
     - `SELECT * FROM emailsender.email_config WHERE provider = 'brevo' LIMIT 1` → `EmailConfigEntity` read.
     - `SELECT * FROM emailsender.email_templates WHERE code = $1 AND language_iso = $2 LIMIT 1` → `EmailTemplateEntity` read. (NATS request fields `templateCode`/`languageIso` map to DB columns `code`/`language_iso` — the public NATS contract stays camelCase per §8 criterion #8.)
     - `INSERT INTO emailsender.email_templates_communication_log (entity_id, entity_uuid, type, provider_message_id, provider, status, template_uuid, senders, recipients, interpolated_sent_message, sent_at, status_changed_at) VALUES ($1..$10, NOW(), NOW()) RETURNING id` — success log (no entity). **Columns verified from source.**
     - `INSERT INTO emailsender.email_templates_communication_log (entity_id, entity_uuid, type, provider, status, template_uuid, senders, recipients, error_message, status_changed_at) VALUES ($1..$9, NOW())` — failure log in catch (no entity, no RETURNING, `template_uuid = null`, no `provider_message_id`/`interpolated_sent_message`/`sent_at`).
  2. `src/services/webhook-service.ts` `handleWebhook()`:
     - `UPDATE emailsender.email_templates_communication_log SET status = $1, status_changed_at = NOW(), error_message = $2 WHERE provider_message_id = $3` (no entity).
  3. `src/services/service-registration.ts`:
     - `SELECT * FROM public.service_registry WHERE code = $1` (no entity, `public` schema).
     - `UPDATE public.service_registry SET base_url, endpoints, updated_at, updated_by, version = version+1 WHERE code = $3` (no entity).
     - `INSERT INTO public.service_registry (...) VALUES (...)` (no entity).
     - `UPDATE public.service_registry SET updated_at, updated_by WHERE code = $1` (heartbeat, no entity).
- **Tables without an entity**: `emailsender.email_templates_communication_log` and `public.service_registry`. Design decisions in §5.
- **`@primebrick/dal-pg` is NOT in `emailsender/package.json`** yet. The workspace `primebrick-workspace/pnpm-workspace.yaml` already lists `../primebrick-dal-v3`.
- **No tests** exist for emailsender. Verification is build + typecheck + manual smoke (§9).

### 2.3 Conventions that MUST be preserved (repo rules)

- snake_case everywhere. No DTO renaming. Spread raw DB rows.
- No fake defaults on the read path. `undefined` if missing, `null` if NULL in DB.
- No transformation unless real type conversion.
- Strict TypeScript, `async/await` only, no silenced errors.
- Microservice isolation: no cross-service relative imports — the DAL comes via `workspace:*`.
- DAL never commits automatically; wait for explicit user instruction.

---

## 3. Proposed architecture

### 3.1 Dependency wiring (one-time)

1. `emailsender/package.json` → add `"@primebrick/dal-pg": "workspace:*"` to `dependencies`.
2. Run `pnpm install` from the workspace root. The `prepare` script builds `@primebrick/dal-pg`'s `dist/` and pnpm symlinks `emailsender/node_modules/@primebrick/dal-pg` → `../../primebrick-dal-v3`.
3. Verify: `Test-Path emailsender/node_modules/@primebrick/dal-pg/dist/index.js` → True.

### 3.2 Dal bootstrap in emailsender (replaces `pool.ts`)

The local `pool.ts` is **deleted**. The `Dal` gateway owns the pool. A tiny `dal.ts` module initializes the singleton at startup:

```typescript
// emailsender/src/db/dal.ts
import { getDal } from "@primebrick/dal-pg";

export function initDal(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const schema = process.env.DB_SCHEMA || "emailsender";
  getDal({
    connectionString: url,
    schema,
    max: 10,
    statementTimeoutMs: 30000,
    applicationName: "primebrick-emailsender",
  });
}

export { getDal } from "@primebrick/dal-pg";
```

`initDal()` is called once from `index.ts` at startup, before any service is constructed. Services import `getDal` and call `getDal()` (no args — returns the existing singleton) wherever they need DB access. No per-request allocation.

**Graceful shutdown** — `index.ts` owns process lifecycle (NOT the library). The library exposes only `close(timeoutMs?)`; the consumer wires signals + crash handlers so it can close ALL long-lived resources (DAL pool, NATS, HTTP server) together:

```typescript
// emailsender/src/index.ts — shutdown wiring
import os from "node:os";

let shuttingDown = false;

async function shutdown(reason: string, code: number): Promise<void> {
  if (shuttingDown) return;           // re-entrancy guard: second signal is a no-op
  shuttingDown = true;
  console.log(`[emailsender] shutting down (${reason})`);
  try {
    // Close ALL long-lived resources. allSettled so one failure doesn't block the others.
    await Promise.allSettled([
      getDal().close(),               // drains pg.Pool (10s internal timeout)
      natsConnection?.close(),        // drains NATS
      // httpServer?.close(),         // uncomment when an HTTP server exists
    ]);
  } finally {
    process.exit(code);               // ALWAYS exit explicitly — never rely on event-loop drain
  }
}

// Graceful signals — use process.on (not once) so a second signal still reaches the guard.
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGHUP"];
SHUTDOWN_SIGNALS.forEach(sig =>
  process.on(sig, () => shutdown(sig, 128 + (os.constants.signals[sig as keyof typeof os.constants.signals] ?? 0))),
);

// Crash paths — owned by the consumer, where Sentry/logging/restart policy live.
// The library does NOT install these (layering violation + test isolation).
process.on("uncaughtException", (err) => {
  console.error("[emailsender] uncaughtException", err);
  shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[emailsender] unhandledRejection", reason);
  shutdown("unhandledRejection", 1);
});
```

**Design rationale** (why the library does NOT install process handlers):
1. **Layering**: `process` is a singleton. A data-access library installing `uncaughtException`/`unhandledRejection` handlers silently co-owns the app's crash policy, racing with consumer-side Sentry/logging in undefined order.
2. **Test isolation**: every test that constructs a DAL would pollute the process's signal table.
3. **Event-loop drain myth**: closing only the pool leaves NATS/HTTP handles open → the process hangs until SIGKILL. The consumer must close ALL resources and exit explicitly.
4. **SIGKILL is uncatchable** (kernel-level guarantee) — no handler can cover it. Mitigation is operational: orchestrators send SIGTERM with a grace period first, then SIGKILL only after N seconds (k8s/Docker default behavior).

**Why the consumer `shuttingDown` guard AND the lib's `close()` re-entrancy guard coexist (no contradiction):** the lib's `close()` is re-entrant + timeout-bounded (commit `34d45dd` — `isClosing`/`isClosed` flags, `Promise.race` with a 10s deadline, error containment). That guard protects the *pool* specifically. The consumer's `shuttingDown` boolean protects the *whole shutdown sequence* (NATS close, HTTP close, `process.exit`) — a second signal must not re-enter `shutdown()` and race the `Promise.allSettled`. Both are needed: the lib guard makes `dal.close()` safe to call twice; the consumer guard makes the orchestrator's two-signal pattern (SIGTERM then SIGINT) safe at the process level.

### 3.3 Entity migration

Each entity file changes only its imports — decorators come from `@primebrick/dal-pg`. Class bodies unchanged. Example:

```typescript
// emailsender/src/domain/entities/email_config_entity.ts
import { Entity, Key, Unique, Column, AuditableField, AuditableFieldType, IAuditableEntity } from "@primebrick/dal-pg";

@Entity("email_config")
export class EmailConfigEntity implements IAuditableEntity {
  @Key() id!: number;
  @Unique() uuid!: string;
  @Column({ length: 50, nullable: false }) provider!: string;
  @Column({ nullable: false }) api_key!: string;
  @Column({ nullable: true }) api_endpoint?: string;
  @Column({ nullable: true }) from_email?: string;
  @Column({ nullable: true }) from_name?: string;
  @Column({ nullable: true }) reply_to?: string;
  @AuditableField(AuditableFieldType.CREATED_AT) created_at!: Date;
  @AuditableField(AuditableFieldType.CREATED_BY) created_by!: string;
  @AuditableField(AuditableFieldType.UPDATED_AT) updated_at!: Date;
  @AuditableField(AuditableFieldType.UPDATED_BY) updated_by!: string;
  @AuditableField(AuditableFieldType.VERSION) version!: number;
}
```

The local `entity-decorators.ts`, `iauditable_entity.ts`, `ideletable_entity.ts` are **deleted**. `registry.ts` is reviewed in §4.

**Soft-delete columns**: NOT added (schema migration, out of scope). The DAL's `deletedRecords: "EXCLUDED"` default silently no-ops for these entities (no `@DeletableField`), matching today's behavior.

### 3.4 New entity: `EmailCommunicationLogEntity`

`email_templates_communication_log` is written by `email-service.ts` and updated by `webhook-service.ts`. To use the DAL it must become an entity. **Column set verified from the actual INSERT/UPDATE SQL in `email-service.ts` and `webhook-service.ts`** (step 1 of §6 — done):

```typescript
// emailsender/src/domain/entities/email_communication_log_entity.ts
import { Entity, Key, Column } from "@primebrick/dal-pg";

@Entity("email_templates_communication_log")
export class EmailCommunicationLogEntity {
  @Key() id!: number;
  @Column({ nullable: true }) entity_id?: number;
  @Column({ nullable: true }) entity_uuid?: string;
  @Column({ nullable: false }) type!: string;            // "email"
  @Column({ nullable: true }) provider_message_id?: string; // present on success, absent on failure
  @Column({ nullable: false }) provider!: string;        // "brevo"
  @Column({ length: 50, nullable: false }) status!: string; // "sent" | "failed" | webhook statuses
  @Column({ nullable: true }) template_uuid?: string;    // null on failure path
  @Column({ nullable: false, pgType: "jsonb" }) senders!: object;
  @Column({ nullable: false, pgType: "jsonb" }) recipients!: object;
  @Column({ nullable: true }) interpolated_sent_message?: string; // success only
  @Column({ nullable: true }) error_message?: string;    // failure only
  @Column({ nullable: true }) sent_at?: Date;            // success only (NOW())
  @Column({ nullable: true }) status_changed_at?: Date;  // both paths (NOW())
}
```

**Notes:**
- This entity does NOT implement `IAuditableEntity` — the log table has no `created_at`/`updated_*`/`version`/`deleted_*` columns based on the SQL observed. (If the live table does have a `created_at` with a DB default, it is omitted from the entity and the DB default populates it — the DAL's `add()` only inserts columns the entity declares.)
- `senders`/`recipients` are `jsonb`; the DAL serializes objects via the `pg` driver's jsonb handling. The caller passes JS objects (`JSON.stringify` is no longer needed — the DAL/pg handles it).
- The success INSERT passes `provider_message_id`, `interpolated_sent_message`, `sent_at`; the failure INSERT omits them (they stay NULL via DB defaults). The DAL's `add()` only sets columns present in the payload object — omitted fields are not in the INSERT.
- The webhook update is by `provider_message_id` (not uuid) — see §3.5.

### 3.5 Service-layer refactor (behavior-preserving, 1:1)

#### `email-service.ts` — `sendEmail()`

| Today (raw SQL) | After (Dal gateway) |
|---|---|
| `SELECT * FROM email_config WHERE provider = 'brevo' LIMIT 1` | `dal.find(EmailConfigEntity, null, { filters: [Filter.fieldValue(field(EmailConfigEntity,"provider"), "=", "brevo")], throwIfNotFound: true })` — `NotFoundError` caught and re-thrown as the service's existing error shape. |
| `SELECT * FROM email_templates WHERE code = $1 AND language_iso = $2 LIMIT 1` | `dal.find(EmailTemplateEntity, null, { filters: [Filter.fieldValue(field(EmailTemplateEntity,"code"),"=",request.templateCode), Filter.fieldValue(field(EmailTemplateEntity,"language_iso"),"=",request.languageIso)], throwIfNotFound: true })` — NATS request fields `templateCode`/`languageIso` map to entity columns `code`/`language_iso`. |
| `INSERT INTO email_templates_communication_log (entity_id, entity_uuid, type, provider_message_id, provider, status, template_uuid, senders, recipients, interpolated_sent_message, sent_at, status_changed_at) VALUES (...) RETURNING id` (success) | `dal.add(EmailCommunicationLogEntity, { entity_id, entity_uuid, type: "email", provider_message_id, provider: "brevo", status: "sent", template_uuid, senders: { from: config.from_email }, recipients: { to, cc, bcc }, interpolated_sent_message, sent_at: new Date(), status_changed_at: new Date() }, { actor: "emailsender" })` — returns the full row; `id` read off the returned entity. `template_uuid` comes from the fetched `template.uuid`. |
| `INSERT INTO email_templates_communication_log (entity_id, entity_uuid, type, provider, status, template_uuid, senders, recipients, error_message, status_changed_at) VALUES (...)` (failure, no RETURNING) | `dal.add(EmailCommunicationLogEntity, { entity_id, entity_uuid, type: "email", provider: "brevo", status: "failed", template_uuid: null, senders: {}, recipients: { to }, error_message, status_changed_at: new Date() }, { actor: "emailsender" })` — DAL always does `RETURNING *`; unused return ignored. `provider_message_id`/`interpolated_sent_message`/`sent_at` omitted → NULL via DB defaults. Behavior preserved. |

#### `webhook-service.ts` — `handleWebhook()`

| Today | After |
|---|---|
| `UPDATE email_templates_communication_log SET status=$1, status_changed_at=NOW(), error_message=$2 WHERE provider_message_id=$3` | The DAL's `update()` works by **uuid**, but this update is by `provider_message_id`. **Recommended: `dal.rawSql(...)`** — legitimate escape-hatch use (update-by-non-key). Forcing find-then-update would add a round trip and a race. The SQL string is preserved verbatim, routed through `dal.rawSql` so DB access is unified through the gateway. |

#### `service-registration.ts`

`public.service_registry` is a **shared table in the `public` schema**, not owned by emailsender. **Recommended: `dal.rawSql(...)`** for all four statements. Rationale: the DAL is for entities the microservice owns; `public.service_registry` is cross-cutting infrastructure. The statements are migrated from `pool.query` to `dal.rawSql` so there is a single DB-access surface (`getDal()`), but the SQL strings are preserved verbatim.

> If the user prefers a `ServiceRegistryEntity`, it should be a shared entity in a common package, not emailsender-local. That is a separate decision and out of scope here.

### 3.6 What gets deleted

- `emailsender/src/db/pool.ts` — the `Dal` gateway owns the pool now.
- `emailsender/src/domain/entities/entity-decorators.ts` (502-line duplicate).
- `emailsender/src/domain/entities/iauditable_entity.ts` (re-exported by DAL).
- `emailsender/src/domain/entities/ideletable_entity.ts` (re-exported by DAL).
- Any `import ... from "./entity-decorators.js"` / `"./iauditable_entity.js"` / `"./ideletable_entity.js"` / `"../db/pool.js"` paths — rewritten to `@primebrick/dal-pg` / `../db/dal.js`.

### 3.7 What stays

- `db/` snapshot tooling (`build-database-snapshot.ts`, `schema-snapshot.ts`, etc.) — these introspect `pg_catalog` via raw SQL. They currently import `getPool()` from `pool.ts`. After the refactor, they import `getDal().getPool()` instead (the `Dal` gateway exposes the underlying pool for exactly this case). These are migration-generation tools, out of scope for the DAL refactor.
- `providers/brevo.ts`, `nats/`, `server/http-server.ts` — no DB access, untouched.
- `registry.ts` — reviewed in §4; kept if it only re-exports entity classes.

---

## 4. Impacted files (precise list)

| File | Change | Type |
|---|---|---|
| `emailsender/package.json` | add `@primebrick/dal-pg: workspace:*` | edit |
| `emailsender/src/db/dal.ts` | NEW — `initDal()` + re-export `getDal` | new |
| `emailsender/src/db/pool.ts` | DELETE (Dal gateway owns the pool) | delete |
| `emailsender/src/domain/entities/email_config_entity.ts` | imports → `@primebrick/dal-pg` | edit |
| `emailsender/src/domain/entities/email_template_entity.ts` | imports → `@primebrick/dal-pg` | edit |
| `emailsender/src/domain/entities/email_communication_log_entity.ts` | NEW — entity for the log table | new |
| `emailsender/src/domain/entities/entity-decorators.ts` | DELETE | delete |
| `emailsender/src/domain/entities/iauditable_entity.ts` | DELETE (re-exported by DAL) | delete |
| `emailsender/src/domain/entities/ideletable_entity.ts` | DELETE (re-exported by DAL) | delete |
| `emailsender/src/domain/entities/registry.ts` | review: trim dead imports, keep entity re-exports, add `EmailCommunicationLogEntity` | edit |
| `emailsender/src/services/email-service.ts` | 4 raw SQL → `dal.*` calls | edit |
| `emailsender/src/services/webhook-service.ts` | 1 raw SQL → `dal.rawSql` | edit |
| `emailsender/src/services/service-registration.ts` | 4 raw SQL → `dal.rawSql` | edit |
| `emailsender/src/index.ts` | call `initDal()` at startup; add `SIGTERM`/`SIGINT`/`SIGHUP` handlers + `uncaughtException`/`unhandledRejection` handlers calling `shutdown()` which closes DAL + NATS; switch snapshot tooling imports from `getPool()` to `getDal().getPool()` | edit |
| `emailsender/src/db/build-database-snapshot.ts` | import `getDal().getPool()` instead of `getPool()` from deleted `pool.ts` | edit (verify) |
| `emailsender/src/db/build-entity-snapshot.ts` | same — switch pool import | edit (verify) |
| `emailsender/package.json` (devDependencies + scripts) | add `vitest`, `@vitest/coverage-v8`; add `test`/`test:watch` scripts | edit |
| `emailsender/vitest.config.ts` | NEW — vitest config (node environment, `src` globals) | new |
| `emailsender/src/services/__tests__/email-service.test.ts` | NEW — unit tests for `EmailService.sendEmail()` (mocked DAL + mocked BrevoClient) | new |

**Files NOT touched**: `db/schema-*.ts`, `db/database-patch-*.ts`, `db/entity-ts-to-pg.ts`, `db/schema-type-normalize.ts`, `db/schema-rename-heuristics.ts`, `db/database-patch-naming.ts`, `providers/brevo.ts`, `nats/*`, `server/http-server.ts`.

---

## 5. Key design decisions (require user confirmation)

1. **`email_templates_communication_log` becomes a new entity** (`EmailCommunicationLogEntity`) so the DAL can `add()` rows. ✅ recommended.
2. **`public.service_registry` stays on `dal.rawSql`** — shared table, not owned by the microservice. ✅ recommended.
3. **`webhook-service.ts` update-by-`provider_message_id` stays on `dal.rawSql`** — the DAL's `update()` is by-uuid; forcing find-then-update adds a round trip + race. ✅ recommended.
4. **Soft-delete columns are NOT added** to `EmailConfigEntity`/`EmailTemplateEntity` — schema migration, out of scope. ✅ recommended.
5. **Audit is NOT wired** — no consumer today. `WriteOptions.actor` is set to `"emailsender"` for forward-compatibility. ✅ recommended.
6. **`pool.ts` is deleted** — the `Dal` gateway owns the pool. Snapshot tooling switches to `getDal().getPool()`. ✅ recommended.
7. **`initDal()` called once at startup** from `index.ts`; services call `getDal()` (no args) per request — zero per-request allocation. ✅ recommended.
8. **Unit tests for `EmailService.sendEmail()`** (user-requested scope addition) — pure unit tests with `vitest`, mocking `getDal()` and `BrevoClient`. No test DB, no NATS, no Brevo network calls. Covers: success path, config-not-found, template-not-found, Brevo-send-failure. ✅ recommended.

---

## 6. Step-by-step implementation order (atomic, build/typecheck after each)

> **Prerequisite**: `dal-gateway-pool-ownership-plan.md` must be implemented and merged first.
> Per the code-guardrails rule: max 2 self-correction attempts per step; halt and report if a step fails twice. Run `pnpm run build` (or `tsc --noEmit`) inside `emailsender` after each step.

1. **Verify the `email_templates_communication_log` schema** — read the existing INSERT/UPDATE column lists in `email-service.ts` and `webhook-service.ts`; confirm the `EmailCommunicationLogEntity` column set matches. (Analysis only, no edits.)
2. **Wire the dependency**: edit `emailsender/package.json`, run `pnpm install` from `primebrick-workspace`, verify the symlink + `dist/index.js` exist.
3. **Create `src/db/dal.ts`** (`initDal` + re-export `getDal`). No callers yet.
4. **Migrate entity imports**: edit `email_config_entity.ts` and `email_template_entity.ts` to import from `@primebrick/dal-pg`. Build. Fix any decorator option shape mismatches.
5. **Create `email_communication_log_entity.ts`**. Register it in `registry.ts`. Build.
6. **Delete `entity-decorators.ts`, `iauditable_entity.ts`, `ideletable_entity.ts`**. Update `registry.ts` imports. Build — all references to the deleted files must be gone.
7. **Delete `pool.ts`**. Update `index.ts` to call `initDal()` at startup. Update snapshot tooling (`build-database-snapshot.ts`, `build-entity-snapshot.ts`) to import `getDal().getPool()` instead of `getPool()`. Build.
8. **Refactor `email-service.ts`**: replace the 4 raw SQL calls with `dal.*` calls (2 `find`, 2 `add`). Build + typecheck.
9. **Refactor `webhook-service.ts`**: route the update through `dal.rawSql`. Build.
10. **Refactor `service-registration.ts`**: route the 4 statements through `dal.rawSql`. Build.
11. **Update `index.ts`**: add `SIGTERM`/`SIGINT`/`SIGHUP` handlers + `uncaughtException`/`unhandledRejection` handlers calling `shutdown()` (closes DAL pool + NATS, then `process.exit`). Build.
12. **Add the vitest harness**: add `vitest` (+ `@vitest/coverage-v8`) to `emailsender/package.json` devDependencies, add `test`/`test:watch` scripts, create `vitest.config.ts`. Run `pnpm install` from the workspace root.
13. **Write unit tests for `EmailService.sendEmail()`** (`src/services/__tests__/email-service.test.ts`) — mock `getDal` (return a fake `Dal` with `find`/`add` spies) and mock `BrevoClient.sendEmail`. Cases: (a) success → returns `success: true` + `providerMessageId` + `logId`, asserts `add` called with `status: "sent"`; (b) config not found → `find(EmailConfigEntity)` throws `NotFoundError`, asserts failure-log `add` called with `status: "failed"`, returns `success: false`; (c) template not found → same failure-log assertion; (d) Brevo send throws → failure-log `add` called, returns `success: false`. Run `pnpm test`.
14. **Full build + typecheck + test** of emailsender. Smoke-test: `GET /health` (no DB), and (with a live DB) trigger `emailsender.send` via NATS or a webhook to confirm end-to-end.

---

## 7. Code examples (the non-trivial replacements)

### 7.1 `email-service.ts` — config + template lookup

```typescript
import { getDal } from "../db/dal.js";
import { EmailConfigEntity, EmailTemplateEntity, EmailCommunicationLogEntity } from "../domain/entities/registry.js";
import { Filter, field, NotFoundError } from "@primebrick/dal-pg";

const dal = getDal();

// config
let config: EmailConfigEntity;
try {
  config = await dal.find(EmailConfigEntity, null, {
    filters: [Filter.fieldValue(field(EmailConfigEntity, "provider"), "=", "brevo")],
    throwIfNotFound: true,
  });
} catch (err) {
  if (err instanceof NotFoundError) { /* map to the service's existing "no brevo config" error */ }
  throw err;
}

// template — request fields are camelCase (NATS contract, unchanged per §8 #8);
// entity/DB columns are snake_case. The FieldRef points at the entity property.
const template = await dal.find(EmailTemplateEntity, null, {
  filters: [
    Filter.fieldValue(field(EmailTemplateEntity, "code"), "=", request.templateCode),
    Filter.fieldValue(field(EmailTemplateEntity, "language_iso"), "=", request.languageIso),
  ],
  throwIfNotFound: true,
});
```

### 7.2 `email-service.ts` — success log insert

```typescript
const logRow = await dal.add(
  EmailCommunicationLogEntity,
  {
    entity_id: request.entityId ?? null,
    entity_uuid: request.entityUuid ?? null,
    type: "email",
    provider_message_id: brevoResponse.messageId,
    provider: "brevo",
    status: "sent",
    template_uuid: template.uuid,
    senders: { from: config.from_email },
    recipients: { to: request.to, cc: request.cc, bcc: request.bcc },
    interpolated_sent_message: htmlContent || textContent,
    sent_at: new Date(),
    status_changed_at: new Date(),
  },
  { actor: "emailsender" },
);
// logRow.id replaces logResult.rows[0].id in the response
```

**Failure log insert** (in the `catch` block):

```typescript
await dal.add(
  EmailCommunicationLogEntity,
  {
    entity_id: request.entityId ?? null,
    entity_uuid: request.entityUuid ?? null,
    type: "email",
    provider: "brevo",
    status: "failed",
    template_uuid: null,
    senders: {},
    recipients: { to: request.to },
    error_message: error instanceof Error ? error.message : "Unknown error",
    status_changed_at: new Date(),
  },
  { actor: "emailsender" },
);
```

### 7.3 `webhook-service.ts` — update by provider_message_id (rawSql escape hatch)

```typescript
import { getDal } from "../db/dal.js";
const dal = getDal();

await dal.rawSql(
  `UPDATE emailsender.email_templates_communication_log
      SET status = $1, status_changed_at = NOW(), error_message = $2
    WHERE provider_message_id = $3`,
  [status, errorMessage, providerMessageId],
);
```

### 7.4 `index.ts` — startup + graceful shutdown

```typescript
import os from "node:os";
import { initDal, getDal } from "./db/dal.js";
// import { natsConnection } from "./nats/connection.js";

// at startup:
initDal();

// ... start NATS, HTTP server ...

// ── graceful shutdown ──────────────────────────────────────────────
// The CONSUMER owns process lifecycle. The library exposes only close(timeoutMs?).
let shuttingDown = false;

async function shutdown(reason: string, code: number): Promise<void> {
  if (shuttingDown) return;           // re-entrancy guard
  shuttingDown = true;
  console.log(`[emailsender] shutting down (${reason})`);
  try {
    // Close ALL long-lived resources — allSettled so one failure doesn't block others.
    await Promise.allSettled([
      getDal().close(),               // drains pg.Pool (10s internal timeout)
      natsConnection?.close(),        // drains NATS
      // httpServer?.close(),         // uncomment when an HTTP server exists
    ]);
  } finally {
    process.exit(code);               // ALWAYS exit explicitly
  }
}

// Graceful signals — process.on (not once) so a second signal still reaches the guard.
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGHUP"];
SHUTDOWN_SIGNALS.forEach(sig =>
  process.on(sig, () =>
    shutdown(sig, 128 + (os.constants.signals[sig as keyof typeof os.constants.signals] ?? 0)),
  ),
);

// Crash paths — owned by the consumer (where Sentry/logging/restart policy live).
process.on("uncaughtException", (err) => {
  console.error("[emailsender] uncaughtException", err);
  shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[emailsender] unhandledRejection", reason);
  shutdown("unhandledRejection", 1);
});
```

### 7.5 Unit tests for `EmailService.sendEmail()` (mocked DAL + mocked BrevoClient)

```typescript
// emailsender/src/services/__tests__/email-service.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the DAL gateway BEFORE importing EmailService (which calls getDal() at call time).
const findMock = vi.fn();
const addMock = vi.fn();
vi.mock("../../db/dal.js", () => ({
  getDal: () => ({ find: findMock, add: addMock }),
}));

// Mock BrevoClient so no network call is made.
const sendEmailMock = vi.fn();
vi.mock("../../providers/brevo.js", () => ({
  BrevoClient: class {
    sendEmail = sendEmailMock;
    mapStatus = (e: string) => e;
  },
}));

import { EmailService } from "../email-service.js";
import { EmailConfigEntity, EmailTemplateEntity, EmailCommunicationLogEntity } from "../../domain/entities/registry.js";
import { NotFoundError } from "@primebrick/dal-pg";

const baseRequest = {
  requestId: "req-1",
  templateCode: "WELCOME",
  languageIso: "en",
  to: ["alice@example.com"],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BREVO_API_KEY = "test-key";
});

describe("EmailService.sendEmail", () => {
  it("success: returns success:true + providerMessageId + logId, logs status:sent", async () => {
    findMock
      .mockResolvedValueOnce({ provider: "brevo", from_email: "no-reply@x.com", from_name: "X", reply_to: null }) // config
      .mockResolvedValueOnce({ uuid: "tpl-uuid", subject: "Hi {{name}}", body_html: "<b>{{name}}</b>", body_text: "{{name}}" }); // template
    sendEmailMock.mockResolvedValue({ messageId: "brevo-123" });
    addMock.mockResolvedValue({ id: 42 });

    const svc = new EmailService();
    const res = await svc.sendEmail({ ...baseRequest, variables: { name: "Alice" } });

    expect(res.success).toBe(true);
    expect(res.providerMessageId).toBe("brevo-123");
    expect(res.logId).toBe(42);
    expect(addMock).toHaveBeenCalledTimes(1);
    const [entity, payload] = addMock.mock.calls[0];
    expect(entity).toBe(EmailCommunicationLogEntity);
    expect(payload.status).toBe("sent");
    expect(payload.provider_message_id).toBe("brevo-123");
    expect(payload.template_uuid).toBe("tpl-uuid");
  });

  it("config not found: logs status:failed, returns success:false", async () => {
    findMock.mockRejectedValueOnce(new NotFoundError("EmailConfigEntity", "no brevo config"));
    addMock.mockResolvedValue({ id: 1 });

    const svc = new EmailService();
    const res = await svc.sendEmail({ ...baseRequest });

    expect(res.success).toBe(false);
    expect(addMock).toHaveBeenCalledTimes(1);
    const [, payload] = addMock.mock.calls[0];
    expect(payload.status).toBe("failed");
    expect(payload.provider_message_id).toBeUndefined(); // failure log omits it
  });

  it("template not found: logs status:failed, returns success:false", async () => {
    findMock
      .mockResolvedValueOnce({ provider: "brevo", from_email: "no-reply@x.com" }) // config ok
      .mockRejectedValueOnce(new NotFoundError("EmailTemplateEntity", "no template")); // template missing
    addMock.mockResolvedValue({ id: 2 });

    const svc = new EmailService();
    const res = await svc.sendEmail({ ...baseRequest });

    expect(res.success).toBe(false);
    const [, payload] = addMock.mock.calls[0];
    expect(payload.status).toBe("failed");
  });

  it("brevo send fails: logs status:failed with error_message, returns success:false", async () => {
    findMock
      .mockResolvedValueOnce({ provider: "brevo", from_email: "no-reply@x.com" })
      .mockResolvedValueOnce({ uuid: "tpl-uuid", subject: "S", body_html: "H", body_text: "T" });
    sendEmailMock.mockRejectedValue(new Error("brevo down"));
    addMock.mockResolvedValue({ id: 3 });

    const svc = new EmailService();
    const res = await svc.sendEmail({ ...baseRequest });

    expect(res.success).toBe(false);
    expect(res.error).toBe("brevo down");
    const [, payload] = addMock.mock.calls[0];
    expect(payload.status).toBe("failed");
    expect(payload.error_message).toBe("brevo down");
  });
});
```

**Test isolation notes:**
- `vi.mock` is hoisted by vitest above imports — the DAL singleton and `BrevoClient` are replaced before `EmailService` is constructed.
- `EmailService` constructor reads `BREVO_API_KEY` from `process.env` — set in `beforeEach` (and the mock `BrevoClient` ignores it anyway).
- No DB, no NATS, no HTTP, no Brevo network. Pure unit tests. Run with `pnpm test`.

---

## 8. Acceptance criteria

1. `emailsender` builds clean: `pnpm run build` (or `tsc --noEmit`) exits 0.
2. No file under `emailsender/src/` imports from `./entity-decorators`, `./iauditable_entity`, `./ideletable_entity`, or `../db/pool`. The four files are deleted (`Test-Path` → False).
3. No file under `emailsender/src/services/` calls `pool.query(` directly — all DB access goes through `getDal()` (either `dal.*` methods or `dal.rawSql`). Grep for `pool.query` in `src/services/` → 0 matches.
4. `emailsender/node_modules/@primebrick/dal-pg/dist/index.js` exists.
5. `initDal()` is called once from `index.ts`. Services call `getDal()` (no args) — no `new Dal()` or `new Repository()` in service code.
6. `index.ts` has `SIGTERM`/`SIGINT`/`SIGHUP` handlers + `uncaughtException`/`unhandledRejection` handlers calling `shutdown()` which closes the DAL pool + NATS via `Promise.allSettled`, then calls `process.exit`. The `@primebrick/dal-pg` library itself does NOT install any `process.on(...)` handlers (verified by grep — 0 matches for `process.on` in the library source).
7. The `emailsender.send` NATS round-trip succeeds end-to-end (config + template lookup, send, success log insert). The webhook update path updates a log row by `provider_message_id`.
8. No public contract change: HTTP endpoints, NATS subject, `SendEmailRequest`/`SendEmailResponse` shapes unchanged.
9. snake_case preserved; no DTO renaming; no fake defaults on the read path.
10. No `git commit` is made without explicit user instruction.
11. **`pnpm test` exits 0** — the vitest harness runs, all 4 `EmailService.sendEmail` cases pass (success, config-not-found, template-not-found, brevo-failure). No test makes a real DB/NATS/Brevo call (mocked).

---

## 9. Verification strategy

- **Build + typecheck** after each atomic step (§6).
- **Unit tests** (NEW — in scope): `pnpm test` runs the `EmailService.sendEmail` vitest suite (mocked DAL + BrevoClient). Fast, no external dependencies.
- **Grep guards**: `grep -r "pool.query" emailsender/src/services` → 0; `grep -r "entity-decorators" emailsender/src` → 0; `grep -r "from.*pool" emailsender/src/services` → 0.
- **Manual smoke** (user-driven, since starting a dev server requires user confirmation per the dev-server rule): `GET /health`, then trigger a NATS `emailsender.send` request and confirm a log row appears with `status = 'sent'`; then POST a webhook payload and confirm the row's `status` updates.
- **Optional follow-up** (out of scope): integration tests with a real test DB for emailsender.

---

## 10. Feasibility: one unique DAL for BE + US (context only — BE migration is a separate later plan)

**Verdict: YES, feasible — with moderate DAL extensions first.** The DSL and entity decorators are identical between BE and `@primebrick/dal-pg`. The gaps are API-shape, not architectural.

### 10.1 Gaps to close in `@primebrick/dal-pg` BEFORE BE can switch

| Gap | Severity | DAL work needed |
|---|---|---|
| **No `clone` method** | HIGH | Add `clone(entity, sourceUuid, opts)` to `Dal`/`Repository`. `@CloneField` decorator already exists. |
| **Constructor signature** | HIGH | BE does `new Repository(pool, auditService?)`. With the `Dal` gateway, BE would use `getDal(config)` + per-call `WriteOptions.audit`. BE-side adapter wraps `AuditService` as `AuditPort`. |
| **`update`/`delete`/`restore` signatures** | MEDIUM | BE uses positional `(entity, uuid, body, actor)`; DAL uses `(entity, uuid, updates, opts: WriteOptions)`. ~20 BE call sites rewritten. No DAL change. |
| **`insertMany` vs `addMany`** | MEDIUM | BE's `insertMany` returns `void`; DAL's `addMany` returns `TEntity[]`. 5 BE call sites. Either rename in BE or add alias. |
| **Audit coverage in DAL** | MEDIUM | DAL only writes audit from `add()` today; BE writes audit from `update`/`delete`/`restore` too. DAL must extend audit to all write ops before BE switches. |
| **`hardDelete` / `rawSql` / `findByPage` / DSL / decorators / version increment** | NONE | Identical. |

### 10.2 BE migration blast radius (for the later plan)

- 5 DAL classes: `user-profiles-dal.ts`, `auth_configurations_dal.ts`, `organizations_dal.ts`, `customers_dal.ts`, `role-mapping-repo.ts`.
- ~30-40 method call sites. BE's `@primebrick/dal-pg` is NOT in `package.json` yet; workspace already lists `primebrick-dal-v3`.

### 10.3 Recommended sequencing

1. **Plan 1 (this plan's prerequisite)**: extend `@primebrick/dal-pg` with the `Dal` gateway — pool ownership, type parsers, best-practice defaults, per-call timeout override.
2. **Plan 2 (this plan)**: US emailsender adopts `getDal()`. Validates the library + gateway against a real consumer.
3. **Next**: extend `@primebrick/dal-pg` — add `clone`, extend audit to all write ops, optionally `insertMany` alias.
4. **Then**: separate BE migration plan (adapter for `AuditService` → `AuditPort`, rewrite 5 DAL classes, ~30-40 call sites).
5. **End state**: one `@primebrick/dal-pg` consumed by both BE and US, BE's local `Repository`/`query-builder`/`dsl`/`entity-decorators` deleted.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `EmailCommunicationLogEntity` column set doesn't match the live table | Step 1 of §6 verifies columns against existing INSERT/UPDATE SQL before writing the entity. |
| `@NotificationLog()` decorator is used somewhere not found | Step 6 greps for `@NotificationLog` across `emailsender/src` before deleting `entity-decorators.ts`. |
| `dal.find` with `throwIfNotFound: true` changes error behavior vs. today's silent null | Today's raw SQL assumes the row exists; `NotFoundError` is caught at the service boundary and mapped to the same user-facing error. |
| Snapshot tooling breaks when `pool.ts` is deleted | Step 7 updates `build-database-snapshot.ts` + `build-entity-snapshot.ts` to use `getDal().getPool()` before deleting `pool.ts`. Build verifies. |
| `dal.rawSql` for `service-registration.ts` keeps raw SQL | Accepted — shared-table statements the microservice doesn't own. Single DB-access surface (`getDal()`) is still unified. |
| No test harness | Verification is build + grep guards + manual smoke (§9). |
| Dev server port 3003 conflict | Per the dev-server rule, the agent checks `netstat` before starting any server and reuses an existing one. |

---

## 12. Out of scope (explicit)

- Adding `deleted_at`/`deleted_by` columns to `email_config`/`email_templates` (schema migration).
- Creating a shared `ServiceRegistryEntity` in a common package.
- Wiring audit in emailsender (no consumer today).
- BE migration to `@primebrick/dal-pg` (separate plan, §10).
- Adding a test harness to emailsender (separate follow-up).
- The `Dal` gateway implementation itself (covered by `dal-gateway-pool-ownership-plan.md`).
- Any `git commit` (wait for explicit user instruction).
