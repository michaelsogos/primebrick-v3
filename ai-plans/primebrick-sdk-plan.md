# Plan: `@primebrick/sdk` — shared microservice infrastructure library

> Status: DRAFT — awaiting user approval (PROCEED keyword).
> Scope: create a new `@primebrick/sdk` workspace package that extracts common, repeated logic across microservices and BE.
> Repositories analyzed (empirically, zero assumptions):
> - `primebrick-dal-v3` — the shared DAL library (`@primebrick/dal-pg`). Referenced for adapter examples only — the SDK does NOT depend on it.
> - `primebrick-us-v3/emailsender` — the first microservice consumer.
> - `primebrick-be-v3` — the API gateway / orchestrator (reference for migration runner + config loading patterns).
> - `primebrick-workspace` — the pnpm workspace root.

---

## 1. Objective

Create `@primebrick/sdk` — a shared library extracting common microservice infrastructure from emailsender and BE. This follows the same extraction pattern as `@primebrick/dal-pg` (which extracted PG persistence logic into a reusable package): identify repeated boilerplate, extract it into a workspace package, consume it from all microservices.

**The SDK is DB-agnostic.** It does NOT depend on `@primebrick/dal-pg`, `pg`, or `reflect-metadata`. Instead it uses **dependency inversion**: the SDK defines **port interfaces** (abstract contracts), and each consumer provides DB-specific **adapter implementations** using whatever DAL they have. This means the SDK works with `@primebrick/dal-pg` today, and with a future `@primebrick/dal-mssql` or `@primebrick/dal-mariadb` tomorrow, without any SDK changes.

Both BE and US microservices consume the SDK. The first consumer is emailsender (refactored to use SDK in a future step); BE adopts incrementally.

**What the SDK provides:**
1. **Port interfaces** — `ConfigRepositoryPort`, `DatabasePort`, `ServiceRegistryPort`, `HealthCheckPort`. Abstract contracts the consumer implements using their DAL.
2. **ConfigLoader** — load config from a DB config table at startup, cache in memory, `get(key)` on hot path, `invalidate()` for refresh. Mirrors BE's `loadAuthConfig`/`getAuthConfig`/`invalidateAuthConfig` pattern (`config.ts:150-180`). Takes a `ConfigRepositoryPort`.
3. **IConfigEntity** — self-contained interface for dictionary-style config rows (`key`/`value`/`label_key`/`description_key`). No dependency on `IAuditableEntity`.
4. **Migration runner** — SHA256-based patch tracking, idempotent re-runs. Extracted from BE's `scripts/database-patch-apply.ts:1-148`. Takes a `DatabasePort`.
5. **ServiceRegistrar** — register microservice in `service_registry`, maintain heartbeat. Extracted from emailsender's `service-registration.ts:1-101`. Takes a `ServiceRegistryPort`.
6. **IServiceRegistry** — self-contained interface for `service_registry` rows (no decorators).
7. **GracefulShutdown** — re-entrancy guard, `Promise.allSettled` for parallel resource cleanup, signal handlers. Extracted from emailsender's `index.ts:55-95`. Pure Node.js, no DB dependency.
8. **NatsClient** — singleton NATS connection management. Extracted from emailsender's `nats/client.ts:1-31`. Only depends on optional `nats` peer dep.
9. **HttpServer** — minimal HTTP server with health endpoint. Extracted from emailsender's `server/http-server.ts:1-64`. Pure Node.js `http` module.
10. **HealthCheck** — DB health check utility. Takes a `HealthCheckPort`.
11. **EnvValidator** — centralized env var validation (replaces scattered inline checks). Pure `process.env`.

**What the SDK does NOT provide:**
- Business logic (email sending, template rendering, auth — those stay in the microservice).
- Persistence/query building (that's the consumer's DAL's job — the SDK only defines port interfaces).
- Express/Fastify web framework (BE keeps its own Express app; the SDK's HttpServer is native `http`).
- Process manager / cluster mode / container orchestration.
- DB-specific decorators or entity metadata (those are DAL-specific and stay in the consumer's DAL).

---

## 2. Empirical findings (what exists today, with file:line citations)

### 2.1 Workspace structure

#### 2.1.1 `primebrick-workspace/pnpm-workspace.yaml` (lines 1-6)

```yaml
packages:
  - "../primebrick-fe-v3"
  - "../primebrick-be-v3"
  - "../primebrick-us-v3"
  - "../primebrick-us-v3/emailsender"
  - "../primebrick-dal-v3"
```

5 packages. A git repo with placeholder README already exists at `D:\git\primebrick\primebrick-v3-sdk` (just `# primebrick-v3-sdk` in README.md). No `package.json` or `src/` yet. No root `package.json` in the workspace directory.

#### 2.1.2 DAL package — `primebrick-dal-v3/package.json` (lines 1-54)

```json
{
  "name": "@primebrick/dal-pg",
  "version": "0.1.7",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./errors": { "types": "./dist/errors/errors.d.ts", "import": "./dist/errors/errors.js" }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "pg": "^8.21.0",
    "pg-query-stream": "^8.21.0",
    "reflect-metadata": "^0.2.2"
  }
}
```

Published to npm. Leaf dependency. **The SDK does NOT depend on this package.** Consumers (like emailsender) depend on it and use it to implement the SDK's port interfaces.

#### 2.1.3 DAL tsconfig — `primebrick-dal-v3/tsconfig.json` (lines 1-21)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "strictPropertyInitialization": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

The SDK uses the same tsconfig **except** `experimentalDecorators` and `emitDecoratorMetadata` are removed — the SDK doesn't use decorators (those are DAL-specific).

#### 2.1.4 DAL source structure

```
src/
├── audit/          (auditable-joins.ts, auditable-types.ts)
├── dal/            (dal.ts, type-parsers.ts)
├── errors/         (errors.ts)
├── meta/           (column-pg-io.ts, entity-decorators.ts, entity-meta.ts, entity-ts-to-pg.ts)
├── query/          (dsl.ts, query-builder.ts, streaming.ts)
├── repository/     (repository.ts)
├── types/          (entities.ts, types.ts)
└── index.ts
```

No `db/` or `migrations/` directories — DAL is a pure library. The SDK does not import from this.

#### 2.1.5 emailsender package — `primebrick-us-v3/emailsender/package.json` (lines 1-27)

```json
{
  "name": "primebrick-emailsender",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "nats": "^2.28.1",
    "pg": "^8.13.1",
    "dotenv": "^16.4.7",
    "reflect-metadata": "^0.2.2",
    "handlebars": "^4.7.9",
    "@primebrick/dal-pg": "workspace:*"
  }
}
```

Uses workspace protocol for DAL. Private. No `test` script (tests run via vitest but no script defined). This consumer will implement the SDK's port interfaces using `@primebrick/dal-pg`.

#### 2.1.6 BE package — `primebrick-be-v3/package.json` (lines 1-43)

```json
{
  "name": "primebrick-api",
  "version": "0.23.0",
  "private": true,
  "type": "module",
  "scripts": {
    "db:meta:compare": "tsx scripts/database-patch-compare.ts",
    "db:migrate": "tsx scripts/database-patch-apply.ts"
  },
  "dependencies": {
    "casdoor-nodejs-sdk": "^1.34.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "dotenv": "^16.6.1",
    "express": "^4.22.2",
    "handlebars": "^4.7.9",
    "jose": "^6.2.3",
    "openid-client": "^6.8.4",
    "pg": "^8.21.0",
    "reflect-metadata": "^0.2.2",
    "zod": "^4.4.3"
  }
}
```

**Does NOT use `@primebrick/dal-pg`** — has its own embedded DAL in `src/db/repository/`. Has migration scripts. Uses Express + Zod. This consumer would implement the SDK's port interfaces using its own embedded DAL.

### 2.2 Startup + graceful shutdown (emailsender only — BE has none)

#### emailsender `src/index.ts` (lines 1-103)

Startup order: DAL → Service Registration → Heartbeat → NATS → Subscriptions → HTTP Server.

Graceful shutdown (lines 55-95):
```typescript
let shuttingDown = false;
async function shutdown(reason: string, code: number): Promise<void> {
  if (shuttingDown) return; // re-entrancy guard
  shuttingDown = true;
  clearInterval(heartbeatInterval);
  try {
    await Promise.allSettled([getDal().close(), closeNatsConnection()]);
  } finally {
    process.exit(code);
  }
}
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGHUP"];
SHUTDOWN_SIGNALS.forEach(sig =>
  process.on(sig, () => shutdown(sig, 128 + (os.constants.signals[sig] ?? 0))),
);
process.on("uncaughtException", (err) => { shutdown("uncaughtException", 1); });
process.on("unhandledRejection", (reason) => { shutdown("unhandledRejection", 1); });
```

**BE has NO graceful shutdown** — no signal handlers, no pool cleanup, no server close logic found in `src/index.ts:1-214`.

### 2.3 Service registration + heartbeat (emailsender only — BE has entity but no logic)

#### emailsender `src/services/service-registration.ts` (lines 1-101)

```typescript
export class ServiceRegistration {
  constructor() {
    this.serviceCode = process.env.SERVICE_CODE || "EMAILSENDER";
    this.baseUrl = process.env.SERVICE_BASE_URL || "http://localhost:3003";
    this.endpoints = { webhook: `${this.baseUrl}/webhook`, health: `${this.baseUrl}/health` };
  }
  async register(): Promise<void> {
    // try find by code → catch NotFoundError → insert or update
    // uses dal.find, dal.update (matchBy: "code", actor: "system"), dal.add (actor: "system")
  }
  async updateHeartbeat(): Promise<void> {
    // dal.update with no-op SET on base_url to trigger audit stamps
  }
  async startHeartbeat(intervalMs = 60000): Promise<ReturnType<typeof setInterval>> {
    return setInterval(() => this.updateHeartbeat(), intervalMs);
  }
}
```

#### emailsender `src/domain/entities/service_registry_entity.ts` (lines 1-54)

```typescript
@Entity("service_registry", "public")
export class ServiceRegistryEntity implements IAuditableEntity {
  @Key() id!: number;
  @Unique() uuid!: string;
  @Column({ length: 100, nullable: false }) code!: string;
  @Column({ nullable: false }) base_url!: string;
  @Column({ pgType: "jsonb", nullable: false }) endpoints!: Record<string, unknown>;
  // + audit fields
}
```

NOTE from the file: "A copy of this entity exists in `primebrick-be-v3`. When a second microservice needs it, extract to a shared `@primebrick/shared-entities` package."

**BE has the entity** (`src/modules/system/service_registry_entity.ts:1-42`) but **NO registration logic** — no DAL, no router, no service implementation.

The SDK extracts the *shape* as `IServiceRegistry` (an interface, no decorators). The consumer's adapter implements `ServiceRegistryPort` using their own decorated entity class.

### 2.4 NATS client (emailsender only)

#### emailsender `src/nats/client.ts` (lines 1-31)

```typescript
let nc: NatsConnection | null = null;
let js: JetStreamClient | null = null;
export async function getNatsConnection(): Promise<NatsConnection> {
  if (nc) return nc;
  const natsUrl = process.env.NATS_URL || "nats://127.0.0.1:4222";
  nc = await connect({ servers: natsUrl });
  js = nc.jetstream();
  return nc;
}
export async function closeNatsConnection(): Promise<void> {
  if (nc) { await nc.close(); nc = null; js = null; }
}
```

BE does not use NATS. This module only depends on the `nats` peer dependency — no DB dependency.

### 2.5 HTTP server + health check (both, different implementations)

#### emailsender `src/server/http-server.ts` (lines 1-64)

Native `http` module. Routes: `/webhook` (POST, API key auth), `/health` (GET → `{ status: "healthy" }`), 404 for unknown.

#### BE `src/index.ts` (lines 126-148)

Express-based. Health check checks DB (`select 1`) and IDP (Casdoor version endpoint). Returns 200 when healthy, 503 when degraded. JSON body with `service`, `version`, `modules`, `db.ok`, `idp.ok`.

The SDK's `HealthCheck` takes a `HealthCheckPort` (a `ping(): Promise<boolean>` contract) so it's DB-agnostic. The consumer provides an adapter that runs `select 1` (PG), or whatever their DB uses.

### 2.6 Migration runner (BE only — emailsender has none)

#### BE `scripts/database-patch-apply.ts` (lines 1-148)

- Reads `.sql` files from `db-meta/patches/` sorted by filename
- For each: computes SHA256, extracts patch_id from filename
- Checks `public.primebrick_database_patches` registry
- If patch_id exists with same SHA → skip; different SHA → fail (immutable patch changed)
- If patch_id missing but same SHA exists → register without re-executing
- Otherwise: BEGIN → execute SQL → INSERT registry row → COMMIT
- Loads DATABASE_URL from env or `.env` file fallback

The SDK's `applyPatches` takes a `DatabasePort` (a `query(text, params?): Promise<{ rows: unknown[] }>` contract) instead of `pg.Pool`. The consumer provides an adapter wrapping their DB driver.

#### BE `src/db/database-patch-registry.ts` (lines 1-29)

```typescript
export const PATCH_REGISTRY_FQNAME = "public.primebrick_database_patches";
export const PATCH_REGISTRY_DDL = `CREATE TABLE IF NOT EXISTS public.primebrick_database_patches (
  patch_id text PRIMARY KEY, content_sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS primebrick_database_patches_sha_idx ON public.primebrick_database_patches (content_sha256);`;
export async function isPatchBodyAlreadyRecorded(pool: Pool, contentSha256: string): Promise<boolean> { ... }
```

#### BE `src/db/database-patch-naming.ts` (lines 1-57)

```typescript
export function utcTimestampForFilename(d = new Date()): string { ... }
export function slugifyPatchSegment(s: string): string { ... }
export function patchIdFromFilename(filename: string): string { return filename.replace(/\.sql$/i, ""); }
export function sha256Hex(body: string): string { ... }
```

**emailsender has NO migration runner** — no `db-meta/` directory, no `db:migrate` script.

### 2.7 Config loading + caching (BE only — emailsender has none)

#### BE `src/modules/auth/config.ts` (lines 150-180)

```typescript
let cached: AuthConfig | null = null;
export async function loadAuthConfig(pool: Pool): Promise<AuthConfig> {
  const dbConfig = await loadAuthConfigFromDb(pool);
  // mapping to AuthConfig shape...
  cached = { mode, roles_path, oidc, gateway, ... };
  return cached;
}
export async function getAuthConfig(): Promise<AuthConfig> {
  if (!cached) throw new AuthConfigNotLoadedError("...");
  return cached;
}
export function invalidateAuthConfig(): void { cached = null; }
```

#### BE `src/modules/auth/config-repo.ts` (lines 58-140)

```typescript
export async function loadAuthConfigFromDb(pool: Pool): Promise<AuthConfigDb> {
  const dal = new AuthConfigurationsDal(pool);
  const rows = await dal.findAll();
  const settings = rows.reduce((acc, row) => {
    acc[row.key] = row.value ?? null;
    return acc;
  }, {} as Record<string, string | null>);
  // mandatory field checks (throw on missing)
  // type conversions (string → boolean, string → enum)
  return { ...settings, ... } as AuthConfigDb;
}
```

**emailsender has NO config loading** — no `src/config/` directory. Config is read from env vars inline.

The SDK's `ConfigLoader` takes a `ConfigRepositoryPort` (a `findAll(): Promise<Array<{ key: string; value: string | null }>>` contract). The consumer's adapter implements this using their DAL's `findAll`.

### 2.8 Env validation (scattered inline in both)

**emailsender** — inline checks, no centralized file:
- `dal.ts:18-20`: throws if `DATABASE_URL` missing
- `http-server.ts:5-9`: throws if `WEBHOOK_API_KEY` missing
- `webhook-service.ts:9-14`: throws if `BREVO_API_KEY` missing
- `email-service.ts:12-17`: throws if `BREVO_API_KEY` missing

**BE** — inline checks, no centralized file:
- `src/db/pool.ts`: throws if `DATABASE_URL` missing
- Migration scripts: `.env` file fallback for `DATABASE_URL`

Neither has a dedicated env validation module. The SDK's `EnvValidator` is pure `process.env` — no DB dependency.

### 2.9 DAL library (reference only — the SDK does NOT depend on it)

#### `@primebrick/dal-pg` exports (from `src/index.ts`)

The SDK does **NOT** import from `@primebrick/dal-pg`. These exports are listed for reference only — consumers use them to implement the SDK's port interfaces:
- `Dal`, `getDal`, `resetDal` — the gateway singleton (used by consumer's `ConfigRepositoryAdapter`, `ServiceRegistryAdapter`)
- `Entity`, `Key`, `Unique`, `Column`, `AuditableField`, `DeletableField`, `AuditableFieldType`, `DeletableFieldType` — decorators (used by consumer's entity classes, NOT by the SDK)
- `IAuditableEntity`, `IDeletableEntity` — entity interfaces (the SDK defines its own self-contained interfaces)
- `field`, `Filter` — query DSL (used by consumer's adapters)
- `NotFoundError` — error class (used by consumer's adapters)
- `EntityClass` — type

#### Repository constructor (`src/repository/repository.ts:149`)

```typescript
type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;
export class Repository {
  constructor(private readonly db: Queryable) {}
}
```

The SDK's `DatabasePort` mirrors this minimal `query(text, params?)` contract — any DB driver that can execute parameterized SQL can implement it.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ @primebrick/sdk  (NEW — private, workspace-only)                    │
│                                                                     │
│   ZERO dependencies on any Primebrick library or DB driver.         │
│   Uses port interfaces (dependency inversion).                      │
│                                                                     │
│   ports/           ConfigRepositoryPort, DatabasePort,              │
│                    ServiceRegistryPort, HealthCheckPort              │
│   config/          ConfigLoader (takes ConfigRepositoryPort)         │
│   migrations/      applyPatches (takes DatabasePort)                 │
│   service/         ServiceRegistrar (takes ServiceRegistryPort)      │
│   lifecycle/       GracefulShutdown (pure Node.js)                   │
│   nats/            NatsClient (peer dep on `nats`)                   │
│   http/            HttpServer, HealthCheck (takes HealthCheckPort)   │
│   env/             EnvValidator (pure process.env)                   │
└─────────────────────────────────────────────────────────────────────┘
                                 ▲
                                 │ consumer provides adapter implementations
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────┴────────┐    ┌────────┴────────┐    ┌────────┴────────┐
│ emailsender     │    │ BE (future)     │    │ future US       │
│ Uses @primebrick│    │ Uses own DAL    │    │ microservices    │
│ /dal-pg to      │    │ (src/db/) to    │    │ Could use       │
│ implement ports │    │ implement ports │    │ dal-mssql etc.  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Key design principles:**
- SDK has **ZERO dependencies** on any Primebrick library or DB driver. It uses port interfaces (dependency inversion) — the consumer provides DB-specific adapters.
- This means the SDK works with `@primebrick/dal-pg` today, and with a future `@primebrick/dal-mssql` or `@primebrick/dal-mariadb` tomorrow, without any SDK changes.
- The consumer creates thin adapter classes that implement the port interfaces using their DAL.
- SDK only depends on optional peer dep `nats` (for the `NatsClient` module).
- SDK modules are **independent** — a consumer can use `ConfigLoader` without using `NatsClient`.
- `nats` is a **peer dependency** (optional) — not all microservices need NATS.
- SDK does NOT include Express — BE keeps its own Express app. The SDK's `HttpServer` uses native `http` for minimal microservices.
- `IServiceRegistry` (an interface, no decorators) lives in the SDK — currently duplicated in emailsender `service_registry_entity.ts:1-54` and BE `service_registry_entity.ts:1-42`. The consumer keeps their own decorated entity class and maps it to/from `IServiceRegistry` in their adapter.

---

## 4. SDK package structure

```
primebrick-v3-sdk/
├── package.json          (NO @primebrick/dal-pg, NO pg, NO reflect-metadata)
├── tsconfig.json         (NO experimentalDecorators, NO emitDecoratorMetadata)
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── ports/            (NEW — port interfaces)
│   │   ├── config-repository-port.ts
│   │   ├── database-port.ts
│   │   ├── service-registry-port.ts
│   │   └── health-check-port.ts
│   ├── config/
│   │   ├── iconfig-entity.ts      (self-contained, no IAuditableEntity)
│   │   ├── config-loader.ts       (takes ConfigRepositoryPort)
│   │   └── __tests__/
│   │       └── config-loader.test.ts
│   ├── migrations/
│   │   ├── patch-registry.ts      (uses DatabasePort, not Pool)
│   │   ├── patch-naming.ts        (pure functions, no change)
│   │   ├── apply-patches.ts       (takes DatabasePort, not Pool)
│   │   └── __tests__/
│   │       └── apply-patches.test.ts
│   ├── service/
│   │   ├── service-registry.ts    (IServiceRegistry interface, no decorators)
│   │   ├── service-registrar.ts   (takes ServiceRegistryPort)
│   │   └── __tests__/
│   │       └── service-registrar.test.ts
│   ├── lifecycle/
│   │   ├── graceful-shutdown.ts   (no change — pure Node.js)
│   │   └── __tests__/
│   │       └── graceful-shutdown.test.ts
│   ├── nats/
│   │   ├── nats-client.ts         (no change — peer dep on nats)
│   │   └── __tests__/
│   │       └── nats-client.test.ts
│   ├── http/
│   │   ├── http-server.ts         (no change — pure Node.js http)
│   │   ├── health-check.ts        (takes HealthCheckPort, not Pool)
│   │   └── __tests__/
│   │       └── http-server.test.ts
│   └── env/
│       ├── env-validator.ts       (no change — pure process.env)
│       └── __tests__/
│           └── env-validator.test.ts
└── dist/
```

---

## 5. Step-by-step implementation plan

### Step 1: Create package skeleton

Create `D:\git\primebrick\primebrick-v3-sdk\package.json`:

```json
{
  "name": "@primebrick/sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Shared microservice infrastructure for Primebrick v3 — config loading, migration runner, service registration, graceful shutdown, NATS client, health checks, env validation. DB-agnostic via port interfaces.",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {},
  "peerDependencies": {
    "nats": "^2.28.1"
  },
  "peerDependenciesMeta": {
    "nats": { "optional": true }
  },
  "devDependencies": {
    "@types/node": "^24.12.4",
    "nats": "^2.28.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.0"
  }
}
```

No `@primebrick/dal-pg`, no `pg`, no `reflect-metadata` in dependencies. The SDK is a pure infrastructure library with zero DB-specific dependencies. `nats` is an optional peer dependency — consumers that need NATS install it, consumers that don't can skip it.

Create `D:\git\primebrick\primebrick-v3-sdk\tsconfig.json` (same as DAL's `primebrick-dal-v3/tsconfig.json:1-21` **except** `experimentalDecorators` and `emitDecoratorMetadata` are removed — the SDK doesn't use decorators):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "useDefineForClassFields": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "strictPropertyInitialization": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

Create `D:\git\primebrick\primebrick-v3-sdk\vitest.config.ts` (same as emailsender's `vitest.config.ts:1-9`):

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
```

### Step 2: Add to workspace

Update `D:\git\primebrick\primebrick-workspace\pnpm-workspace.yaml` (currently lines 1-6):

```yaml
packages:
  - "../primebrick-fe-v3"
  - "../primebrick-be-v3"
  - "../primebrick-us-v3"
  - "../primebrick-us-v3/emailsender"
  - "../primebrick-dal-v3"
  - "../primebrick-v3-sdk"
```

Run `pnpm install` from the workspace root to link the new package.

### Step 3: Port interfaces

Create the port interfaces — the core of the dependency-inversion architecture. These are abstract contracts that consumers implement using their own DAL.

Create `primebrick-v3-sdk/src/ports/config-repository-port.ts`:

```typescript
/**
 * Port interface for reading config rows from a DB config table.
 *
 * The SDK's ConfigLoader depends on this port, NOT on any specific DAL.
 * The consumer provides an adapter implementation using their DAL
 * (e.g. @primebrick/dal-pg's dal.findAll, or a raw SQL query).
 */
export interface ConfigRepositoryPort {
  /**
   * Return all config rows as { key, value } pairs.
   * value is null when the config key exists but has no value set.
   */
  findAll(): Promise<Array<{ key: string; value: string | null }>>;
}
```

Create `primebrick-v3-sdk/src/ports/database-port.ts`:

```typescript
/**
 * Port interface for executing parameterized SQL queries.
 *
 * The SDK's migration runner (applyPatches) depends on this port,
 * NOT on pg.Pool. The consumer provides an adapter that wraps their
 * DB driver (pg.Pool, mssql.ConnectionPool, mariadb.Pool, etc.).
 *
 * The contract mirrors the minimal `query(text, params?)` shape that
 * every SQL DB driver exposes.
 */
export interface DatabasePort {
  /**
   * Execute a SQL statement. Returns rows (empty for non-SELECT statements).
   * Used by the migration runner for BEGIN/COMMIT/ROLLBACK and patch SQL.
   */
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}
```

Create `primebrick-v3-sdk/src/ports/service-registry-port.ts`:

```typescript
import type { IServiceRegistry } from "../service/service-registry.js";

/**
 * Port interface for CRUD operations on the service_registry table.
 *
 * The SDK's ServiceRegistrar depends on this port, NOT on any specific DAL.
 * The consumer provides an adapter implementation using their DAL
 * (e.g. @primebrick/dal-pg's dal.find/dal.add/dal.update).
 */
export interface ServiceRegistryPort<T = IServiceRegistry> {
  /** Find a service registry row by its code. Returns null if not found. */
  findByCode(code: string): Promise<T | null>;

  /** Insert a new service registry row. */
  insert(row: T): Promise<void>;

  /** Update an existing service registry row by code. */
  updateByCode(code: string, row: Partial<T>): Promise<void>;
}
```

Create `primebrick-v3-sdk/src/ports/health-check-port.ts`:

```typescript
/**
 * Port interface for a DB health check (connectivity ping).
 *
 * The SDK's HealthCheck depends on this port, NOT on pg.Pool.
 * The consumer provides an adapter that runs whatever their DB uses
 * (e.g. `SELECT 1` for PG, `SELECT 1` for MSSQL, etc.).
 */
export interface HealthCheckPort {
  /** Returns true if the DB is reachable and responsive. */
  ping(): Promise<boolean>;
}
```

### Step 4: `IConfigEntity` interface

Create `primebrick-v3-sdk/src/config/iconfig-entity.ts` — self-contained, no `IAuditableEntity`:

```typescript
/**
 * Shape of a dictionary-style config row. Every microservice config table
 * mirrors this: one row per key, value stored as TEXT, type conversion
 * performed at read time by ConfigLoader consumers.
 *
 * Self-contained — does NOT extend IAuditableEntity from @primebrick/dal-pg.
 * The SDK is DB-agnostic; audit fields are a DAL-specific concern handled
 * by the consumer's entity class and adapter.
 */
export interface IConfigEntity {
  /** Unique config key, e.g. "brevo_api_key". */
  key: string;
  /** Raw TEXT value. null means "not set yet". Type conversion at read time. */
  value: string | null;
  /** Optional i18n translation key for a short title (used by BE/FE for display). */
  label_key?: string;
  /** Optional i18n translation key for a longer description (used by BE/FE for display). */
  description_key?: string;
}
```

### Step 5: `ConfigLoader` class

Create `primebrick-v3-sdk/src/config/config-loader.ts`. Takes a `ConfigRepositoryPort` instead of `Dal`. In-memory cache with `load`/`get`/`getAll`/`invalidate` pattern, mirroring BE's `config.ts:150-180`.

```typescript
import type { ConfigRepositoryPort } from "../ports/config-repository-port.js";

/**
 * Dictionary-style config loader backed by a config table.
 * Mirrors BE's loadAuthConfig / getAuthConfig / invalidateAuthConfig pattern
 * (config.ts:150-180), generalized so every microservice can reuse it.
 *
 * DB-agnostic: depends on ConfigRepositoryPort, NOT on any specific DAL.
 * The consumer provides an adapter that implements ConfigRepositoryPort
 * using their DAL (e.g. @primebrick/dal-pg, or raw SQL).
 *
 * Load once at startup → cache in memory → get(key) on hot path (zero DB hits).
 * Call invalidate() to force a reload on next load().
 */
export class ConfigLoader {
  private cache: Map<string, string | null> | null = null;

  constructor(private readonly repo: ConfigRepositoryPort) {}

  /**
   * Load all config rows from DB into in-memory cache.
   * Call once at startup. Throws if DB is unreachable.
   */
  async load(): Promise<Record<string, string | null>> {
    const rows = await this.repo.findAll();
    this.cache = new Map();
    for (const row of rows) {
      this.cache.set(row.key, row.value ?? null);
    }
    return Object.fromEntries(this.cache);
  }

  /**
   * Get a config value from cache. Returns null if key is missing or value is null.
   * Throws if load() has not been called.
   */
  get(key: string): string | null {
    if (this.cache === null) {
      throw new Error("ConfigLoader.load() must be called before get()");
    }
    return this.cache.get(key) ?? null;
  }

  /**
   * Get a config value, throwing if it's missing or empty.
   */
  require(key: string): string {
    const value = this.get(key);
    if (value === null || value === "") {
      throw new Error(`Missing required config key: ${key}`);
    }
    return value;
  }

  /**
   * Get a typed config value via a converter function.
   * Returns null if the key is missing.
   */
  getTyped<T>(key: string, converter: (v: string) => T): T | null {
    const value = this.get(key);
    if (value === null) return null;
    return converter(value);
  }

  /**
   * Get a typed config value, throwing if it's missing.
   */
  requireTyped<T>(key: string, converter: (v: string) => T): T {
    const value = this.require(key);
    return converter(value);
  }

  /**
   * Get all config as a plain object.
   */
  getAll(): Record<string, string | null> {
    if (this.cache === null) {
      throw new Error("ConfigLoader.load() must be called before getAll()");
    }
    return Object.fromEntries(this.cache);
  }

  /**
   * Invalidate the cache so the next load() re-reads from DB.
   */
  invalidate(): void {
    this.cache = null;
  }
}
```

### Step 6: Patch registry + naming utilities

Create `primebrick-v3-sdk/src/migrations/patch-registry.ts` — extracted from BE's `src/db/database-patch-registry.ts:1-29`, using `DatabasePort` instead of `Pool`:

```typescript
import type { DatabasePort } from "../ports/database-port.js";

export const PATCH_REGISTRY_FQNAME = "public.primebrick_database_patches";

export const PATCH_REGISTRY_DDL = `CREATE TABLE IF NOT EXISTS public.primebrick_database_patches (
  patch_id text PRIMARY KEY,
  content_sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS primebrick_database_patches_sha_idx
  ON public.primebrick_database_patches (content_sha256);
`;

export async function isPatchBodyAlreadyRecorded(db: DatabasePort, contentSha256: string): Promise<boolean> {
  const reg = await db.query<{ oid: string | null }>(
    `SELECT to_regclass('${PATCH_REGISTRY_FQNAME}')::text AS oid`
  );
  const oid = reg.rows[0]?.oid;
  if (!oid || oid === "") return false;
  const hit = await db.query(
    `SELECT 1 FROM ${PATCH_REGISTRY_FQNAME} WHERE content_sha256 = $1 LIMIT 1`,
    [contentSha256]
  );
  return hit.rows.length > 0;
}
```

Create `primebrick-v3-sdk/src/migrations/patch-naming.ts` — extracted from BE's `src/db/database-patch-naming.ts:1-57`. Pure functions, no DB dependency:

```typescript
import { createHash } from "node:crypto";

export function utcTimestampForFilename(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

export function slugifyPatchSegment(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase()
    .slice(0, 72) || "patch";
}

export function patchIdFromFilename(filename: string): string {
  return filename.replace(/\.sql$/i, "");
}

export function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf-8").digest("hex");
}
```

### Step 7: `applyPatches` function

Create `primebrick-v3-sdk/src/migrations/apply-patches.ts` — extracted from BE's `scripts/database-patch-apply.ts:1-148`, refactored from a script into a reusable function. Takes `DatabasePort` instead of `Pool`:

```typescript
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabasePort } from "../ports/database-port.js";
import { PATCH_REGISTRY_DDL, PATCH_REGISTRY_FQNAME } from "./patch-registry.js";
import { patchIdFromFilename, sha256Hex } from "./patch-naming.js";

export interface ApplyPatchesResult {
  appliedOrRegistered: number;
  skipped: number;
}

/**
 * Apply database SQL patches from a directory.
 *
 * Strategy (adapted from BE's scripts/database-patch-apply.ts:1-148):
 * - Read .sql files from patchesDir sorted by filename.
 * - For each file, consult public.primebrick_database_patches (patch_id + content_sha256):
 *   - Same patch_id + same SHA → skip (already applied).
 *   - Same patch_id + different SHA → fail (immutable patch changed).
 *   - Missing patch_id but same SHA exists → register without re-executing.
 *   - Otherwise → BEGIN; apply SQL; INSERT registry row; COMMIT.
 *
 * DB-agnostic: depends on DatabasePort, NOT on pg.Pool.
 * The consumer provides an adapter that wraps their DB driver.
 *
 * @param patchesDir Absolute path to the directory containing .sql patch files.
 * @param db DatabasePort adapter (wraps the consumer's DB driver).
 * @returns Result with count of applied/registered and skipped patches.
 */
export async function applyPatches(patchesDir: string, db: DatabasePort): Promise<ApplyPatchesResult> {
  await db.query(PATCH_REGISTRY_DDL);

  let files: string[] = [];
  try {
    files = readdirSync(patchesDir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return { appliedOrRegistered: 0, skipped: 0 };
  }

  if (files.length === 0) {
    return { appliedOrRegistered: 0, skipped: 0 };
  }

  let appliedOrRegistered = 0;
  let skipped = 0;

  for (const filename of files) {
    const patchPath = join(patchesDir, filename);
    const raw = readFileSync(patchPath, "utf8");
    const sha = sha256Hex(raw);
    const patchId = patchIdFromFilename(filename);

    const byId = await db.query<{ content_sha256: string }>(
      `SELECT content_sha256 FROM ${PATCH_REGISTRY_FQNAME} WHERE patch_id = $1`,
      [patchId]
    );

    if (byId.rows.length > 0) {
      const recorded = (byId.rows[0] as { content_sha256: string }).content_sha256;
      if (recorded === sha) {
        console.log(`Skipping already applied patch: ${filename}`);
        skipped++;
        continue;
      }
      throw new Error(
        `Patch ${filename} (${patchId}) exists in registry with a different content_sha256 — refusing to run.`
      );
    }

    const bySha = await db.query<{ patch_id: string }>(
      `SELECT patch_id FROM ${PATCH_REGISTRY_FQNAME} WHERE content_sha256 = $1 LIMIT 1`,
      [sha]
    );
    if (bySha.rows.length > 0) {
      const other = (bySha.rows[0] as { patch_id: string }).patch_id;
      await db.query(
        `INSERT INTO ${PATCH_REGISTRY_FQNAME} (patch_id, content_sha256) VALUES ($1, $2)`,
        [patchId, sha]
      );
      console.log(`Registered ${filename} (same body as ${other}) — no SQL re-execution.`);
      appliedOrRegistered++;
      continue;
    }

    console.log(`Applying patch: ${filename}`);
    try {
      await db.query("BEGIN");
      await db.query(raw);
      await db.query(
        `INSERT INTO ${PATCH_REGISTRY_FQNAME} (patch_id, content_sha256) VALUES ($1, $2)`,
        [patchId, sha]
      );
      await db.query("COMMIT");
      appliedOrRegistered++;
    } catch (e) {
      await db.query("ROLLBACK");
      throw new Error(`Failed to apply patch ${filename}: ${e}`);
    }
  }

  return { appliedOrRegistered, skipped };
}
```

### Step 8: `IServiceRegistry` interface

Create `primebrick-v3-sdk/src/service/service-registry.ts` — an interface only, no decorators. Extracted from the shape of emailsender's `service_registry_entity.ts:1-54` (which is a copy of BE's):

```typescript
/**
 * Shape of a row in the `service_registry` table.
 *
 * Self-contained interface — NO decorators, NO IAuditableEntity.
 * The SDK is DB-agnostic; the consumer keeps their own decorated
 * entity class (e.g. ServiceRegistryEntity with @Entity/@Column from
 * @primebrick/dal-pg) and maps it to/from this interface in their adapter.
 *
 * Previously duplicated in emailsender (service_registry_entity.ts:1-54)
 * and BE (service_registry_entity.ts:1-42). Now the shared shape lives here.
 */
export interface IServiceRegistry {
  code: string;
  base_url: string;
  endpoints: Record<string, unknown>;
}
```

### Step 9: `ServiceRegistrar` class

Create `primebrick-v3-sdk/src/service/service-registrar.ts` — extracted from emailsender's `service-registration.ts:1-101`. Takes `ServiceRegistryPort` instead of using `getDal()`:

```typescript
import type { ServiceRegistryPort } from "../ports/service-registry-port.js";
import type { IServiceRegistry } from "./service-registry.js";

export interface ServiceRegistrarConfig {
  serviceCode: string;
  baseUrl: string;
  endpoints: Record<string, unknown>;
  heartbeatIntervalMs?: number;
}

/**
 * Registers a microservice in `service_registry` and maintains
 * a heartbeat. Extracted from emailsender's ServiceRegistration
 * (service-registration.ts:1-101).
 *
 * DB-agnostic: depends on ServiceRegistryPort, NOT on getDal() or
 * @primebrick/dal-pg. The consumer provides an adapter that implements
 * ServiceRegistryPort using their DAL.
 */
export class ServiceRegistrar {
  private readonly config: ServiceRegistrarConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repo: ServiceRegistryPort,
    config: ServiceRegistrarConfig,
  ) {
    this.config = {
      heartbeatIntervalMs: 60000,
      ...config,
    };
  }

  async register(): Promise<void> {
    const existing = await this.repo.findByCode(this.config.serviceCode);

    if (existing) {
      await this.repo.updateByCode(this.config.serviceCode, {
        code: this.config.serviceCode,
        base_url: this.config.baseUrl,
        endpoints: this.config.endpoints,
      });
      console.log(`Updated service registration: ${this.config.serviceCode}`);
    } else {
      await this.repo.insert({
        code: this.config.serviceCode,
        base_url: this.config.baseUrl,
        endpoints: this.config.endpoints,
      });
      console.log(`Registered new service: ${this.config.serviceCode}`);
    }
  }

  async updateHeartbeat(): Promise<void> {
    try {
      await this.repo.updateByCode(this.config.serviceCode, {
        base_url: this.config.baseUrl,
      });
    } catch (error) {
      console.error("Error updating heartbeat:", error);
    }
  }

  startHeartbeat(): ReturnType<typeof setInterval> {
    this.heartbeatTimer = setInterval(() => this.updateHeartbeat(), this.config.heartbeatIntervalMs);
    return this.heartbeatTimer;
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
```

### Step 10: `GracefulShutdown` class

Create `primebrick-v3-sdk/src/lifecycle/graceful-shutdown.ts` — extracted from emailsender's `index.ts:55-95`. Pure Node.js, no DB dependency:

```typescript
import os from "node:os";

export type CleanupFn = () => Promise<void>;

/**
 * Graceful shutdown manager. Extracted from emailsender's index.ts:55-95.
 *
 * - Re-entrancy guard: second signal is a no-op.
 * - Runs all cleanup functions in parallel (Promise.allSettled).
 * - Always calls process.exit() explicitly.
 * - Installs SIGTERM, SIGINT, SIGHUP + uncaughtException + unhandledRejection handlers.
 *
 * Pure Node.js — no DB dependency. The consumer registers cleanup functions
 * (e.g. getDal().close(), NatsClient.close()) via addCleanup().
 */
export class GracefulShutdown {
  private shuttingDown = false;
  private readonly cleanups: CleanupFn[] = [];
  private readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /** Register a cleanup function to run on shutdown. */
  addCleanup(fn: CleanupFn): void {
    this.cleanups.push(fn);
  }

  /** Install signal + crash handlers. */
  install(): void {
    const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGHUP"];
    for (const sig of signals) {
      process.on(sig, () => {
        const code = 128 + (os.constants.signals[sig as keyof typeof os.constants.signals] ?? 0);
        void this.shutdown(sig, code);
      });
    }
    process.on("uncaughtException", (err) => {
      console.error(`[${this.serviceName}] uncaughtException`, err);
      void this.shutdown("uncaughtException", 1);
    });
    process.on("unhandledRejection", (reason) => {
      console.error(`[${this.serviceName}] unhandledRejection`, reason);
      void this.shutdown("unhandledRejection", 1);
    });
  }

  async shutdown(reason: string, code: number): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    console.log(`[${this.serviceName}] shutting down (${reason})`);
    try {
      await Promise.allSettled(this.cleanups.map((fn) => fn()));
    } finally {
      process.exit(code);
    }
  }
}
```

### Step 11: `NatsClient` class

Create `primebrick-v3-sdk/src/nats/nats-client.ts` — extracted from emailsender's `nats/client.ts:1-31`. Only depends on `nats` peer dep, no DB dependency:

```typescript
import { connect, type NatsConnection, type JetStreamClient } from "nats";

/**
 * Singleton NATS connection manager. Extracted from emailsender's
 * nats/client.ts:1-31.
 *
 * Requires `nats` as a peer dependency — consumers that don't need NATS
 * can skip installing it and won't import this module.
 * No DB dependency.
 */
export class NatsClient {
  private static nc: NatsConnection | null = null;
  private static js: JetStreamClient | null = null;

  static async getConnection(): Promise<NatsConnection> {
    if (NatsClient.nc) return NatsClient.nc;
    const natsUrl = process.env.NATS_URL || "nats://127.0.0.1:4222";
    NatsClient.nc = await connect({ servers: natsUrl });
    NatsClient.js = NatsClient.nc.jetstream();
    console.log(`Connected to NATS at ${natsUrl}`);
    return NatsClient.nc;
  }

  static getJetStream(): JetStreamClient {
    if (!NatsClient.js) {
      throw new Error("NATS JetStream not initialized. Call NatsClient.getConnection() first.");
    }
    return NatsClient.js;
  }

  static async close(): Promise<void> {
    if (NatsClient.nc) {
      await NatsClient.nc.close();
      NatsClient.nc = null;
      NatsClient.js = null;
      console.log("NATS connection closed");
    }
  }
}
```

### Step 12: `HttpServer` + `HealthCheck`

Create `primebrick-v3-sdk/src/http/health-check.ts` — takes `HealthCheckPort` instead of `Pool`:

```typescript
import type { HealthCheckPort } from "../ports/health-check-port.js";

export interface HealthCheckResult {
  ok: boolean;
  [key: string]: unknown;
}

/**
 * Health check utility. Extracted from BE's index.ts:126-148 pattern.
 * Checks DB connectivity (via HealthCheckPort) and optional custom checks.
 *
 * DB-agnostic: depends on HealthCheckPort, NOT on pg.Pool.
 * The consumer provides an adapter that runs whatever their DB uses
 * (e.g. `SELECT 1` for PG).
 */
export class HealthCheck {
  constructor(
    private readonly dbPing: HealthCheckPort,
    private readonly customChecks: Record<string, () => Promise<HealthCheckResult>> = {},
  ) {}

  async checkDb(): Promise<HealthCheckResult> {
    try {
      const ok = await this.dbPing.ping();
      return { ok };
    } catch {
      return { ok: false };
    }
  }

  async runAll(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {
      db: await this.checkDb(),
    };
    for (const [name, check] of Object.entries(this.customChecks)) {
      try {
        results[name] = await check();
      } catch (e) {
        results[name] = { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
      }
    }
    return results;
  }

  isHealthy(results: Record<string, HealthCheckResult>): boolean {
    return Object.values(results).every((r) => r.ok);
  }
}
```

Create `primebrick-v3-sdk/src/http/http-server.ts` — extracted from emailsender's `server/http-server.ts:1-64`. Pure Node.js `http` module, no DB dependency:

```typescript
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import type { HealthCheck } from "./health-check.js";

export interface HttpServerOptions {
  port: number;
  healthCheck?: HealthCheck;
  serviceName?: string;
  /** Custom route handler — receives req/res, returns true if handled. */
  routeHandler?: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;
}

/**
 * Minimal HTTP server with health endpoint. Extracted from emailsender's
 * server/http-server.ts:1-64. Uses native http module (no Express).
 * No DB dependency.
 */
export async function createHttpServer(options: HttpServerOptions): Promise<Server> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);

    // Health check endpoint
    if (url.pathname === "/health" && req.method === "GET") {
      if (options.healthCheck) {
        const results = await options.healthCheck.runAll();
        const healthy = options.healthCheck.isHealthy(results);
        res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: healthy ? "healthy" : "degraded", checks: results }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "healthy" }));
      }
      return;
    }

    // Custom routes
    if (options.routeHandler) {
      const handled = await options.routeHandler(req, res, url);
      if (handled) return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  server.listen(options.port, () => {
    console.log(`HTTP server listening on port ${options.port}`);
  });

  return server;
}
```

### Step 13: `EnvValidator`

Create `primebrick-v3-sdk/src/env/env-validator.ts`. Pure `process.env`, no DB dependency:

```typescript
export interface EnvSchema {
  [key: string]: {
    required: boolean;
    default?: string;
    description?: string;
  };
}

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  env: Record<string, string | undefined>;
}

/**
 * Centralized env var validation. Replaces scattered inline checks
 * (emailsender: dal.ts:18-20, http-server.ts:5-9, webhook-service.ts:9-14,
 * email-service.ts:12-17; BE: src/db/pool.ts).
 *
 * Pure process.env — no DB dependency.
 */
export function validateEnv(schema: EnvSchema): EnvValidationResult {
  const errors: string[] = [];
  const env: Record<string, string | undefined> = {};

  for (const [key, spec] of Object.entries(schema)) {
    const value = process.env[key] ?? spec.default;
    env[key] = value;
    if (spec.required && (value === undefined || value === "")) {
      errors.push(`${key} is required${spec.description ? ` (${spec.description})` : ""}`);
    }
  }

  return { valid: errors.length === 0, errors, env };
}

/**
 * Validate env vars and throw if any required ones are missing.
 */
export function requireEnv(schema: EnvSchema): Record<string, string | undefined> {
  const result = validateEnv(schema);
  if (!result.valid) {
    throw new Error(`Environment validation failed:\n  - ${result.errors.join("\n  - ")}`);
  }
  return result.env;
}
```

### Step 14: Barrel exports

Create `primebrick-v3-sdk/src/index.ts`:

```typescript
/**
 * @primebrick/sdk — Shared microservice infrastructure for Primebrick v3.
 *
 * DB-agnostic via port interfaces (dependency inversion).
 * ZERO dependencies on any Primebrick library or DB driver.
 *
 * Modules:
 * - ports: ConfigRepositoryPort, DatabasePort, ServiceRegistryPort, HealthCheckPort
 * - config: ConfigLoader, IConfigEntity
 * - migrations: applyPatches, patch-registry, patch-naming
 * - service: ServiceRegistrar, IServiceRegistry
 * - lifecycle: GracefulShutdown
 * - nats: NatsClient (requires `nats` peer dependency)
 * - http: createHttpServer, HealthCheck
 * - env: validateEnv, requireEnv
 */

// Ports (dependency inversion — consumer implements these)
export { type ConfigRepositoryPort } from "./ports/config-repository-port.js";
export { type DatabasePort } from "./ports/database-port.js";
export { type ServiceRegistryPort } from "./ports/service-registry-port.js";
export { type HealthCheckPort } from "./ports/health-check-port.js";

// Config
export { type IConfigEntity } from "./config/iconfig-entity.js";
export { ConfigLoader } from "./config/config-loader.js";

// Migrations
export {
  PATCH_REGISTRY_DDL,
  PATCH_REGISTRY_FQNAME,
  isPatchBodyAlreadyRecorded,
} from "./migrations/patch-registry.js";
export {
  utcTimestampForFilename,
  slugifyPatchSegment,
  patchIdFromFilename,
  sha256Hex,
} from "./migrations/patch-naming.js";
export { applyPatches, type ApplyPatchesResult } from "./migrations/apply-patches.js";

// Service registration
export { type IServiceRegistry } from "./service/service-registry.js";
export { ServiceRegistrar, type ServiceRegistrarConfig } from "./service/service-registrar.js";

// Lifecycle
export { GracefulShutdown, type CleanupFn } from "./lifecycle/graceful-shutdown.js";

// NATS (optional — requires `nats` peer dependency)
export { NatsClient } from "./nats/nats-client.js";

// HTTP
export { createHttpServer, type HttpServerOptions } from "./http/http-server.js";
export { HealthCheck, type HealthCheckResult } from "./http/health-check.js";

// Env validation
export { validateEnv, requireEnv, type EnvSchema, type EnvValidationResult } from "./env/env-validator.js";
```

### Step 15: Build + test SDK

1. From `primebrick-v3-sdk/`, run `pnpm install` (links workspace deps).
2. Run `pnpm run build` — verify `dist/` is emitted with all modules.
3. Write unit tests for each module (mock the port interfaces, `nats`):
   - `config-loader.test.ts`: mock `ConfigRepositoryPort.findAll` — `load()` populates cache, `get()` returns from cache, `require()` throws on missing, `invalidate()` clears cache.
   - `apply-patches.test.ts`: mock `DatabasePort.query` — skip on same SHA, fail on different SHA, apply on new SHA.
   - `service-registrar.test.ts`: mock `ServiceRegistryPort.findByCode`/`insert`/`updateByCode` — register new, update existing, heartbeat.
   - `graceful-shutdown.test.ts`: re-entrancy guard, runs all cleanups, calls `process.exit`.
   - `nats-client.test.ts`: mock `nats.connect` — singleton behavior, close nullifies.
   - `http-server.test.ts`: `/health` returns 200, unknown route returns 404.
   - `env-validator.test.ts`: required missing → error, default applied, all valid → ok.
4. Run `pnpm test` — all tests pass.

### Step 16: (FUTURE) Refactor emailsender to use SDK

**Not part of initial implementation.** After the SDK is built and tested, emailsender is refactored to import from `@primebrick/sdk` instead of its own inline implementations. This includes creating adapter implementations of the port interfaces (see §6 below):
- Create `ConfigRepositoryAdapter`, `DatabaseAdapter`, `ServiceRegistryAdapter`, `HealthCheckAdapter` using `@primebrick/dal-pg` and `pg.Pool`.
- Replace `src/services/service-registration.ts` with `ServiceRegistrar` from SDK (passing the `ServiceRegistryAdapter`).
- Replace `src/nats/client.ts` with `NatsClient` from SDK.
- Replace `src/server/http-server.ts` with `createHttpServer` from SDK (passing `HealthCheckAdapter`).
- Replace inline shutdown code in `src/index.ts` with `GracefulShutdown` from SDK.
- Replace inline env checks with `requireEnv` from SDK.
- Replace `src/domain/entities/service_registry_entity.ts` usage with `IServiceRegistry` from SDK (keep the decorated entity class for the adapter).
- Add `ConfigLoader` usage when the `config` table has data (passing the `ConfigRepositoryAdapter`).
- Add `applyPatches` in a `db:migrate` script (passing the `DatabaseAdapter`).

### Step 17: (FUTURE) BE adoption

**Not part of initial implementation.** BE adopts the SDK incrementally. BE would create adapter implementations using its own embedded DAL (`src/db/repository/`):
- Create `ConfigRepositoryAdapter`, `DatabaseAdapter`, `ServiceRegistryAdapter`, `HealthCheckAdapter` using BE's own DAL and `pg.Pool`.
- Replace `scripts/database-patch-apply.ts` with `applyPatches` from SDK (passing the `DatabaseAdapter`).
- Replace `src/db/database-patch-registry.ts` + `database-patch-naming.ts` with SDK exports.
- Replace `src/modules/system/service_registry_entity.ts` usage with `IServiceRegistry` from SDK (keep the decorated entity class for the adapter).
- Add `GracefulShutdown` (BE currently has none).
- Add `ConfigLoader` for auth config (replacing the module-level `cached` variable in `config.ts:150-180`, passing the `ConfigRepositoryAdapter`).
- Keep Express app + Zod validation (not replaced by SDK).

---

## 6. Consumer adapters

The SDK defines port interfaces; the consumer provides DB-specific adapter implementations. Below is an example showing how emailsender would implement the ports using `@primebrick/dal-pg` and `pg.Pool`.

```typescript
// In emailsender (consumer side) — adapts @primebrick/dal-pg to SDK ports

import { getDal, field, Filter, NotFoundError } from "@primebrick/dal-pg";
import type { Pool } from "pg";
import type {
  ConfigRepositoryPort,
  DatabasePort,
  ServiceRegistryPort,
  HealthCheckPort,
  IServiceRegistry,
} from "@primebrick/sdk";

// --- ConfigRepositoryPort adapter — uses dal.findAll ---

import { ConfigEntryEntity } from "../domain/entities/config_entry_entity.js";

export class ConfigRepositoryAdapter implements ConfigRepositoryPort {
  async findAll(): Promise<Array<{ key: string; value: string | null }>> {
    const dal = getDal();
    const rows = await dal.findAll(ConfigEntryEntity, null, {
      deletedRecords: "EXCLUDED",
    });
    return Array.isArray(rows)
      ? rows.map((r) => ({ key: r.key, value: r.value ?? null }))
      : [];
  }
}

// --- DatabasePort adapter — wraps pg.Pool for migration runner ---

export class DatabaseAdapter implements DatabasePort {
  constructor(private readonly pool: Pool) {}

  async query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }> {
    const result = await this.pool.query(text, params as never[]);
    return { rows: result.rows as unknown[] };
  }
}

// --- ServiceRegistryPort adapter — uses dal.find/add/update ---

import { ServiceRegistryEntity } from "../domain/entities/service_registry_entity.js";

export class ServiceRegistryAdapter implements ServiceRegistryPort<IServiceRegistry> {
  async findByCode(code: string): Promise<IServiceRegistry | null> {
    const dal = getDal();
    try {
      const row = await dal.find(ServiceRegistryEntity, null, {
        filters: [
          Filter.fieldValue(field(ServiceRegistryEntity, "code"), "=", code),
        ],
      });
      if (!row) return null;
      return {
        code: row.code,
        base_url: row.base_url,
        endpoints: row.endpoints,
      };
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }

  async insert(row: IServiceRegistry): Promise<void> {
    const dal = getDal();
    await dal.add(
      ServiceRegistryEntity,
      { code: row.code, base_url: row.base_url, endpoints: row.endpoints },
      { actor: "system" },
    );
  }

  async updateByCode(code: string, row: Partial<IServiceRegistry>): Promise<void> {
    const dal = getDal();
    await dal.update(
      ServiceRegistryEntity,
      row as Record<string, unknown>,
      { actor: "system", matchBy: "code" },
    );
  }
}

// --- HealthCheckPort adapter — wraps pg.Pool for health check ---

export class HealthCheckAdapter implements HealthCheckPort {
  constructor(private readonly pool: Pool) {}

  async ping(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }
}
```

**Wiring it all together in emailsender's `index.ts`:**

```typescript
import {
  ConfigLoader,
  ServiceRegistrar,
  GracefulShutdown,
  NatsClient,
  createHttpServer,
  HealthCheck,
  applyPatches,
  requireEnv,
} from "@primebrick/sdk";
import { ConfigRepositoryAdapter, DatabaseAdapter, ServiceRegistryAdapter, HealthCheckAdapter } from "./adapters/index.js";
import { Pool } from "pg";

const env = requireEnv({
  DATABASE_URL: { required: true },
  SERVICE_CODE: { required: false, default: "EMAILSENDER" },
  SERVICE_BASE_URL: { required: false, default: "http://localhost:3003" },
  // ...
});

const pool = new Pool({ connectionString: env.DATABASE_URL });

// Config loader (uses ConfigRepositoryPort adapter)
const configLoader = new ConfigLoader(new ConfigRepositoryAdapter());
await configLoader.load();

// Service registration (uses ServiceRegistryPort adapter)
const registrar = new ServiceRegistrar(new ServiceRegistryAdapter(), {
  serviceCode: env.SERVICE_CODE!,
  baseUrl: env.SERVICE_BASE_URL!,
  endpoints: { webhook: `${env.SERVICE_BASE_URL}/webhook`, health: `${env.SERVICE_BASE_URL}/health` },
});
await registrar.register();
registrar.startHeartbeat();

// Migrations (uses DatabasePort adapter)
await applyPatches("./db-meta/patches", new DatabaseAdapter(pool));

// HTTP server + health check (uses HealthCheckPort adapter)
const healthCheck = new HealthCheck(new HealthCheckAdapter(pool));
const server = await createHttpServer({ port: 3003, healthCheck });

// Graceful shutdown (pure Node.js — consumer registers cleanup fns)
const shutdown = new GracefulShutdown("emailsender");
shutdown.addCleanup(async () => { await pool.end(); });
shutdown.addCleanup(async () => { await NatsClient.close(); });
shutdown.addCleanup(async () => { await server.close(); });
shutdown.addCleanup(async () => { registrar.stopHeartbeat(); });
shutdown.install();
```

A future consumer using MSSQL would write equivalent adapters using `mssql` instead of `pg` — the SDK code doesn't change at all.

---

## 7. Design decisions

1. **SDK has ZERO dependencies on any Primebrick library or DB driver.** No `@primebrick/dal-pg`, no `pg`, no `reflect-metadata`. The SDK is a pure infrastructure library.
2. **SDK uses port interfaces (dependency inversion)** — the consumer provides DB-specific adapters. This means the SDK works with `@primebrick/dal-pg` today, and with a future `@primebrick/dal-mssql` or `@primebrick/dal-mariadb` tomorrow, without any SDK changes.
3. **The consumer creates thin adapter classes** that implement the port interfaces using their DAL. The adapters are consumer-side code, not SDK code.
4. **SDK only depends on optional peer dep `nats`** (for the `NatsClient` module). Consumers that don't need NATS can skip installing it.
5. **`ConfigLoader` takes a `ConfigRepositoryPort`** — not generic over an entity class, not dependent on `Dal`. The adapter handles the entity class and maps rows to `{ key, value }`.
6. **`IConfigEntity` is self-contained** — no `extends IAuditableEntity`. Audit fields are a DAL-specific concern handled by the consumer's entity class.
7. **`IServiceRegistry` is an interface only** — no decorators. The consumer keeps their own decorated entity class and maps it to/from `IServiceRegistry` in their adapter.
8. **`ServiceRegistrar` takes a `ServiceRegistryPort`** — not `getDal()`. The adapter handles `dal.find`/`dal.add`/`dal.update`.
9. **`applyPatches` takes a `DatabasePort`** — not `pg.Pool`. The adapter wraps the consumer's DB driver.
10. **`HealthCheck` takes a `HealthCheckPort`** — not `pg.Pool`. The adapter runs whatever `SELECT 1` equivalent the consumer's DB uses.
11. **`GracefulShutdown` accepts cleanup functions** — the consumer registers `getDal().close()`, `NatsClient.close()`, etc. The SDK doesn't know what resources exist. Pure Node.js, no DB dependency.
12. **`NatsClient` is optional** — not all microservices need NATS. The module imports `nats` which is a peer dependency; consumers that don't install `nats` simply don't import this module.
13. **`HttpServer` is minimal** (native `http`, no Express) — for microservices that only need webhooks + health. BE keeps its own Express app.
14. **SDK is private** (`"private": true`) — not published to npm. Only used within the workspace.
15. **tsconfig has no `experimentalDecorators`/`emitDecoratorMetadata`** — the SDK doesn't use decorators (those are DAL-specific). This keeps the SDK's compilation clean and signals that it's DB-agnostic.

---

## 8. Acceptance criteria

1. `primebrick-v3-sdk/` directory exists with `package.json`, `tsconfig.json`, `vitest.config.ts` (Step 1).
2. `pnpm-workspace.yaml` includes `../primebrick-v3-sdk` (Step 2).
3. `pnpm run build` in `primebrick-v3-sdk/` produces `dist/` with all modules (Step 15).
4. Port interfaces are exported: `ConfigRepositoryPort`, `DatabasePort`, `ServiceRegistryPort`, `HealthCheckPort` (Step 3).
5. `IConfigEntity` interface is exported, self-contained with `key`/`value`/`label_key`/`description_key` — no `IAuditableEntity` (Step 4).
6. `ConfigLoader` class is exported, takes `ConfigRepositoryPort`, with `load`/`get`/`require`/`getTyped`/`requireTyped`/`getAll`/`invalidate` methods (Step 5).
7. `applyPatches` function is exported, takes `DatabasePort`, handles skip/fail/apply/register logic matching BE's `database-patch-apply.ts:1-148` (Step 7).
8. `IServiceRegistry` interface is exported — no decorators, self-contained (Step 8).
9. `ServiceRegistrar` class is exported, takes `ServiceRegistryPort`, with `register`/`updateHeartbeat`/`startHeartbeat`/`stopHeartbeat` methods (Step 9).
10. `GracefulShutdown` class is exported with `addCleanup`/`install`/`shutdown` methods (Step 10).
11. `NatsClient` class is exported with static `getConnection`/`getJetStream`/`close` methods (Step 11).
12. `createHttpServer` function and `HealthCheck` class are exported; `HealthCheck` takes `HealthCheckPort` (Step 12).
13. `validateEnv` and `requireEnv` functions are exported (Step 13).
14. All unit tests pass (Step 15).
15. `nats` is an optional peer dependency — SDK builds and tests pass without `nats` installed (only the `nats-client` module requires it).
16. **`package.json` has ZERO runtime dependencies** — `dependencies: {}`. No `@primebrick/dal-pg`, no `pg`, no `reflect-metadata`.
17. **`tsconfig.json` has no `experimentalDecorators` or `emitDecoratorMetadata`** — the SDK doesn't use decorators.

---

## 9. Out of scope

- **Refactoring emailsender to use the SDK** — that's Step 16 (FUTURE), a separate effort after the SDK is built and tested. This includes writing the consumer-side adapter implementations.
- **BE adoption** — that's Step 17 (FUTURE), incremental and separate. BE would write its own adapters using its embedded DAL.
- **Migrating BE to `@primebrick/dal-pg`** — BE still uses its own embedded DAL. That's a separate large effort. The SDK's port-interface design means BE can adopt the SDK without switching DALs.
- **Express/Fastify integration** — the SDK's `HttpServer` uses native `http`. BE keeps Express.
- **Zod validation** — BE uses Zod for request validation. The SDK's `EnvValidator` is a simple schema-based validator, not Zod. BE can keep Zod for request validation.
- **ConfigService write methods** (`set`, `delete`) — the SDK's `ConfigLoader` is read-only (load + cache + get). Writing config rows is done via the consumer's DAL directly. This matches BE's pattern where `loadAuthConfigFromDb` is read-only and `updateAuthConfig` is a separate function.
- **Schema compare / meta diff** — BE's `database-patch-compare.ts` generates SQL patches from entity metadata. That's a BE-specific tool, not extracted to the SDK (yet).
- **Audit trail / audit service** — BE has an `AuditService` for write auditing. That stays in BE (or a future separate package).
- **Published to npm** — the SDK is private (`"private": true`), workspace-only. Publishing is a future decision.
- **Providing reference adapter implementations inside the SDK** — adapters are consumer-side code. The SDK only ships the port interfaces. Consumers write their own adapters (examples in §6 are documentation, not SDK code).
