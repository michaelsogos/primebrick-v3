# Feature: Microservice Health Status, NATS Lifecycle & Version Panel

## Objective

Replace the fake hardcoded "crm" module with real microservice health data from the `service_registry` table. Microservices report their health (HTTP + NATS) via NATS heartbeats. The BE persists status to the DB. The FE VersionsPanel shows per-service version, aggregated status, and instance counter badges. The BE proxy only routes to ONLINE instances.

## Architecture

```
Microservice (every 30s):
  1. Run local health checks (DB ping, NATS isConnected)
  2. Publish heartbeat via NATS: service.heartbeat
  3. On startup → service.register, on SIGTERM → service.unregister

BE NATS subscriber:
  1. Receive heartbeat → derive status (ONLINE / GOING_LIVE / OFFLINE)
  2. Update DB: status, last_health_check_at, service_version, metadata
  3. Log on status change

BE stale detection (every 30s, DB-only):
  1. Find rows where last_health_check_at < now() - 90s
  2. If ALL rows stale → log CRITICAL error (NATS likely down)
  3. Mark stale rows as GOING_LIVE (not OFFLINE — they might be alive on HTTP)
  4. Rows already OFFLINE stay OFFLINE

BE proxy (/ws/:code/*):
  1. FindAllByCode from DB (using ServiceRegistryRepo / DAL Repository)
  2. Filter: status = 'ONLINE' only
  3. 0 ONLINE, some GOING_LIVE → RFC 7807 503 (service degraded)
  4. 0 ONLINE, 0 GOING_LIVE → RFC 7807 502 (service offline)
  5. Round-robin among ONLINE instances (in-memory counter per code)

FE (GET /api/v1/system/services):
  1. DB read — instant, no health probing
  2. Group by code, aggregate status across instances
  3. 3 badges: version, status, instance counter
```

## Health Status Model

| Status | Condition | Color | Proxy routes to it? |
|--------|-----------|-------|---------------------|
| `ONLINE` | HTTP healthy + NATS connected + heartbeat current | green/success | Yes |
| `GOING_LIVE` | One of HTTP/NATS has issue, or heartbeat stale | yellow/warning | No → 503 |
| `OFFLINE` | HTTP unreachable + NATS heartbeat stale | red/destructive | No → 502 |
| `UNKNOWN` | Initial state before first heartbeat | gray/muted | No → 502 |

**Aggregated status per service code (for FE):**
- `ONLINE` — all instances ONLINE
- `GOING_LIVE` — 1+ instances ONLINE, 1+ not ONLINE
- `OFFLINE` — zero instances ONLINE

**NATS outage handling:**
- All heartbeats stop → stale detection marks all as `GOING_LIVE`
- BE logs CRITICAL error: "All registered services are stale — NATS outage suspected"
- Proxy returns 503 for all services (GOING_LIVE, not 502)
- When NATS recovers, microservices send immediate heartbeats → status returns to ONLINE

## Scaler vs Direct Mode

### Behind scaler (`is_behind_scaler = true`)
- One row per `code` in `service_registry`
- `base_url` = NLB URL — **manually configured in config table**, never overwritten by registration
- Microservice startup is **config-gated**: waits in a retry loop until `base_url` is configured in the config table before registering
- Registration updates metadata (version, name, etc.) but **skips `base_url`**
- FE: shows version + status badges, NO instance counter badge

### Direct instances (`is_behind_scaler = false`)
- Multiple rows per `code` (one per instance, matched by `code + base_url`)
- Each instance registers its own `base_url` (host:port)
- Heartbeat updates metadata + `base_url` for its own row
- BE proxy round-robins among ONLINE instances (in-memory counter per code, per process)
- FE: shows version + status + instance counter badge (`{healthy}/{total}`)

## DB Schema Changes

### New columns on `service_registry`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `name` | `text` | yes | null | Human-readable name |
| `description` | `text` | yes | null | What the service does |
| `author` | `text` | yes | null | Author/maintainer |
| `github_repo_url` | `text` | yes | null | Repository URL |
| `service_version` | `text` | yes | null | Microservice version (from package.json) |
| `is_behind_scaler` | `boolean` | no | `false` | If true, registration skips base_url updates |
| `status` | `text` | no | `'unknown'` | `online`, `going_live`, `offline`, `unknown` |
| `last_health_check_at` | `timestamptz` | yes | null | When last heartbeat was received |

### Unique indexes

```sql
-- One row per code when behind scaler
CREATE UNIQUE INDEX IF NOT EXISTS service_registry_code_uq_scaler
  ON public.service_registry (code) WHERE is_behind_scaler = true;

-- One row per (code, base_url) when not behind scaler
CREATE UNIQUE INDEX IF NOT EXISTS service_registry_code_base_url_uq
  ON public.service_registry (code, base_url) WHERE is_behind_scaler = false;
```

### DB patch file (update the initial patch in-place)
**File:** `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql`

Update the `CREATE TABLE` for `service_registry` to include all new columns directly. No separate ALTER patch — the initial patch is the single source of truth for the full table definition:

```sql
-- service_registry table
CREATE TABLE IF NOT EXISTS "public"."service_registry" (
  "id" bigint generated always as identity NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(100) NOT NULL,
  "base_url" text NOT NULL,
  "endpoints" jsonb NOT NULL,
  "name" text,
  "description" text,
  "author" text,
  "github_repo_url" text,
  "service_version" text,
  "is_behind_scaler" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'unknown',
  "last_health_check_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text,
  "version" integer DEFAULT 1,
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_registry_uuid_uq" ON "public"."service_registry" ("uuid");

-- One row per code when behind scaler
CREATE UNIQUE INDEX IF NOT EXISTS "service_registry_code_uq_scaler"
  ON "public"."service_registry" ("code") WHERE is_behind_scaler = true;

-- One row per (code, base_url) when not behind scaler
CREATE UNIQUE INDEX IF NOT EXISTS "service_registry_code_base_url_uq"
  ON "public"."service_registry" ("code", "base_url") WHERE is_behind_scaler = false;
```

**Note:** Since `CREATE TABLE IF NOT EXISTS` won't add columns to an existing table, existing databases need a fire-and-forget script (below). New databases get the full schema from this patch.

### Fire-and-forget script (for existing databases)
**File:** `primebrick-be-v3/db-meta/fire-and-forget/add_service_registry_metadata_columns.sql` (new)

```sql
-- Add new columns to service_registry for existing databases.
-- New databases get these columns directly from the init patch.
-- This script is idempotent (IF NOT EXISTS) and safe to run multiple times.

ALTER TABLE public.service_registry
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS author text,
  ADD COLUMN IF NOT EXISTS github_repo_url text,
  ADD COLUMN IF NOT EXISTS service_version text,
  ADD COLUMN IF NOT EXISTS is_behind_scaler boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "service_registry_code_uq_scaler"
  ON "public"."service_registry" ("code") WHERE is_behind_scaler = true;

CREATE UNIQUE INDEX IF NOT EXISTS "service_registry_code_base_url_uq"
  ON "public"."service_registry" ("code", "base_url") WHERE is_behind_scaler = false;
```

## Implementation Plan

### Phase 1: SDK — NATS Service Lifecycle Messages

#### 1.1 Update `IServiceRegistry` shape
**File:** `primebrick-v3-sdk/src/service/service-registry.ts`

```typescript
export interface IServiceRegistry {
  code: string;
  base_url: string;
  endpoints: Record<string, unknown>;
  name?: string;
  description?: string;
  author?: string;
  github_repo_url?: string;
  service_version?: string;
  is_behind_scaler?: boolean;
  status?: string;                // online | going_live | offline | unknown
  last_health_check_at?: Date;
}
```

#### 1.2 Update `ServiceRegistrarConfig`
**File:** `primebrick-v3-sdk/src/service/service-registrar.ts`

```typescript
export interface ServiceRegistrarConfig {
  serviceCode: string;
  baseUrl: string;
  endpoints: Record<string, unknown>;
  heartbeatIntervalMs?: number;   // default 30000
  name?: string;
  description?: string;
  author?: string;
  github_repo_url?: string;
  service_version?: string;
  is_behind_scaler?: boolean;     // default false
}
```

#### 1.3 Add NATS subjects for service lifecycle
**File:** `primebrick-v3-sdk/src/service/service-lifecycle-subjects.ts` (new)

```typescript
export const SERVICE_SUBJECTS = {
  REGISTER: 'service.register',
  HEARTBEAT: 'service.heartbeat',
  UNREGISTER: 'service.unregister',
} as const;

export interface ServiceHeartbeatPayload {
  code: string;
  base_url: string;
  service_version?: string;
  name?: string;
  description?: string;
  author?: string;
  github_repo_url?: string;
  is_behind_scaler: boolean;
  http_healthy: boolean;
  nats_connected: boolean;
  checks: Record<string, { ok: boolean; error?: string }>;
}

export interface ServiceRegisterPayload extends ServiceHeartbeatPayload {
  endpoints: Record<string, unknown>;
}

export interface ServiceUnregisterPayload {
  code: string;
  base_url: string;
  is_behind_scaler: boolean;
}
```

#### 1.4 Refactor `ServiceRegistrar` to use NATS instead of direct DB
**File:** `primebrick-v3-sdk/src/service/service-registrar.ts`

The registrar no longer writes to the DB directly. Instead it publishes NATS messages. The BE subscribes and persists.

```typescript
import { NatsClient } from "../nats/nats-client.js";
import { SERVICE_SUBJECTS, type ServiceRegisterPayload, type ServiceHeartbeatPayload, type ServiceUnregisterPayload } from "./service-lifecycle-subjects.js";

export class ServiceRegistrar {
  private readonly config: Required<ServiceRegistrarConfig>;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly nats: NatsClient,
    config: ServiceRegistrarConfig,
  ) {
    this.config = {
      heartbeatIntervalMs: 30000,
      is_behind_scaler: false,
      ...config,
    };
  }

  async register(): Promise<void> {
    const payload: ServiceRegisterPayload = {
      code: this.config.serviceCode,
      base_url: this.config.baseUrl,
      endpoints: this.config.endpoints,
      service_version: this.config.service_version,
      name: this.config.name,
      description: this.config.description,
      author: this.config.author,
      github_repo_url: this.config.github_repo_url,
      is_behind_scaler: this.config.is_behind_scaler,
      http_healthy: await this.checkHttp(),
      nats_connected: this.nats.isConnected(),
      checks: await this.runChecks(),
    };
    this.nats.publish(SERVICE_SUBJECTS.REGISTER, payload);
  }

  async sendHeartbeat(): Promise<void> {
    const payload: ServiceHeartbeatPayload = {
      code: this.config.serviceCode,
      base_url: this.config.baseUrl,
      service_version: this.config.service_version,
      name: this.config.name,
      description: this.config.description,
      author: this.config.author,
      github_repo_url: this.config.github_repo_url,
      is_behind_scaler: this.config.is_behind_scaler,
      http_healthy: await this.checkHttp(),
      nats_connected: this.nats.isConnected(),
      checks: await this.runChecks(),
    };
    this.nats.publish(SERVICE_SUBJECTS.HEARTBEAT, payload);
  }

  async unregister(): Promise<void> {
    const payload: ServiceUnregisterPayload = {
      code: this.config.serviceCode,
      base_url: this.config.baseUrl,
      is_behind_scaler: this.config.is_behind_scaler,
    };
    this.nats.publish(SERVICE_SUBJECTS.UNREGISTER, payload);
  }

  startHeartbeat(): ReturnType<typeof setInterval> {
    this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), this.config.heartbeatIntervalMs);
    return this.heartbeatTimer;
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async checkHttp(): Promise<boolean> {
    // Run the health checks (DB ping, etc.) to determine HTTP-level health
    // Implemented by subclass or via injected HealthCheckPort
    return true; // simplified — actual implementation uses injected health check
  }

  private async runChecks(): Promise<Record<string, { ok: boolean; error?: string }>> {
    return {}; // simplified — actual implementation uses injected health check
  }
}
```

**Note:** The `ServiceRegistryPort` and `ServiceRegistryAdapter` are no longer needed by the registrar (the BE handles DB persistence via NATS subscription). They may still be used by the BE for direct DB access.

#### 1.5 Add `NatsClient.isConnected()` method
**File:** `primebrick-v3-sdk/src/nats/nats-client.ts`

Add a method to check if the NATS connection is alive (if not already present).

#### 1.6 Add NATS reconnect → immediate heartbeat
When NATS reconnects after an outage, the microservice should send an immediate heartbeat (not wait for the next interval). This is handled in the microservice's index.ts by listening to NATS reconnect events.

### Phase 2: SDK — Update `ServiceRegistryPort` for BE-side DB access

#### 2.1 Update `ServiceRegistryPort`
**File:** `primebrick-v3-sdk/src/ports/service-registry-port.ts`

The BE needs to read/write the DB when processing NATS messages. Update the port:

```typescript
export interface ServiceRegistryPort<T = IServiceRegistry> {
  findByCode(code: string): Promise<T | null>;
  findByCodeAndBaseUrl(code: string, baseUrl: string): Promise<T | null>;
  findAllByCode(code: string): Promise<T[]>;
  findAll(): Promise<T[]>;
  insert(row: T): Promise<void>;
  updateByCode(code: string, row: Partial<T>): Promise<void>;
  updateByCodeAndBaseUrl(code: string, baseUrl: string, row: Partial<T>): Promise<void>;
  deleteByCodeAndBaseUrl(code: string, baseUrl: string): Promise<void>;
}
```

### Phase 3: BE — Entity, Repo, NATS Subscriber, Stale Detection, Proxy, Endpoint

#### 3.1 Update `ServiceRegistryEntity`
**File:** `primebrick-be-v3/src/modules/system/service_registry_entity.ts`

Add the new columns:

```typescript
@Column({ nullable: true })
name?: string;

@Column({ nullable: true })
description?: string;

@Column({ nullable: true })
author?: string;

@Column({ nullable: true })
github_repo_url?: string;

@Column({ nullable: true })
service_version?: string;

@Column({ nullable: false, default: false })
is_behind_scaler: boolean;

@Column({ nullable: false, default: 'unknown' })
status: string;

@Column({ type: "timestamptz", nullable: true })
last_health_check_at?: Date;
```

Also update the US copy:
**File:** `primebrick-us-v3/emailsender/src/domain/entities/service_registry_entity.ts` (mirror the same columns)

#### 3.2 Refactor `service-registry-repo.ts` to use DAL Repository
**File:** `primebrick-be-v3/src/modules/proxy/service-registry-repo.ts`

Replace ALL raw SQL with `Repository` from `@primebrick/dal-pg` (same pattern as `role-mapping-repo.ts`):

```typescript
import { Repository, Project, field, Filter } from "@primebrick/dal-pg";
import type { Pool } from "pg";
import { ServiceRegistryEntity } from "../system/service_registry_entity.js";

export interface ServiceRegistryEntry {
  code: string;
  base_url: string;
  endpoints: Record<string, unknown>;
  name?: string;
  description?: string;
  author?: string;
  github_repo_url?: string;
  service_version?: string;
  is_behind_scaler: boolean;
  status: string;
  last_health_check_at?: Date;
}

export class ServiceRegistryRepo {
  private repo: Repository;

  constructor(pool: Pool) {
    this.repo = new Repository(pool);
  }

  async findByCode(code: string): Promise<ServiceRegistryEntry | null> {
    return this.repo.find<ServiceRegistryEntity, ServiceRegistryEntry>(
      ServiceRegistryEntity,
      this.fullProjection(),
      { filters: [Filter.fieldValue(field(ServiceRegistryEntity, "code"), "=", code)] }
    );
  }

  async findAllByCode(code: string): Promise<ServiceRegistryEntry[]> {
    return this.repo.findAll<ServiceRegistryEntity, ServiceRegistryEntry>(
      ServiceRegistryEntity,
      this.fullProjection(),
      { filters: [Filter.fieldValue(field(ServiceRegistryEntity, "code"), "=", code)] }
    );
  }

  async findByCodeAndBaseUrl(code: string, baseUrl: string): Promise<ServiceRegistryEntry | null> {
    return this.repo.find<ServiceRegistryEntity, ServiceRegistryEntry>(
      ServiceRegistryEntity,
      this.fullProjection(),
      {
        filters: [
          Filter.fieldValue(field(ServiceRegistryEntity, "code"), "=", code),
          Filter.fieldValue(field(ServiceRegistryEntity, "base_url"), "=", baseUrl),
        ]
      }
    );
  }

  async findAll(): Promise<ServiceRegistryEntry[]> {
    return this.repo.findAll<ServiceRegistryEntity, ServiceRegistryEntry>(
      ServiceRegistryEntity,
      this.fullProjection(),
    );
  }

  async insert(row: Partial<ServiceRegistryEntry>): Promise<void> {
    await this.repo.insertMany(ServiceRegistryEntity, [row]);
  }

  async updateByCode(code: string, row: Partial<ServiceRegistryEntry>): Promise<void> {
    await this.repo.update(ServiceRegistryEntity, row, { actor: "system", matchBy: "code" });
  }

  async updateByCodeAndBaseUrl(code: string, baseUrl: string, row: Partial<ServiceRegistryEntry>): Promise<void> {
    // Update by composite key (code + base_url) — requires custom logic
    // since DAL update matches by a single field
    // TODO: check if DAL supports composite matchBy, otherwise use rawSql via repo
  }

  async deleteByCodeAndBaseUrl(code: string, baseUrl: string): Promise<void> {
    await this.repo.hardDelete(ServiceRegistryEntity, { code, base_url: baseUrl }, { actor: "system", matchBy: "code" });
  }

  private fullProjection() {
    return [
      Project.field(field(ServiceRegistryEntity, "code")),
      Project.field(field(ServiceRegistryEntity, "base_url")),
      Project.field(field(ServiceRegistryEntity, "endpoints")),
      Project.field(field(ServiceRegistryEntity, "name" as any)),
      Project.field(field(ServiceRegistryEntity, "description" as any)),
      Project.field(field(ServiceRegistryEntity, "author" as any)),
      Project.field(field(ServiceRegistryEntity, "github_repo_url" as any)),
      Project.field(field(ServiceRegistryEntity, "service_version" as any)),
      Project.field(field(ServiceRegistryEntity, "is_behind_scaler" as any)),
      Project.field(field(ServiceRegistryEntity, "status" as any)),
      Project.field(field(ServiceRegistryEntity, "last_health_check_at" as any)),
    ];
  }
}
```

**Note:** `updateByCodeAndBaseUrl` needs composite key matching. If the DAL `Repository.update` doesn't support composite `matchBy`, we may need to add support or use `repo.rawSql` as a last resort (single exception, documented). This will be investigated during implementation.

#### 3.3 Add BE NATS subscriber for service lifecycle
**File:** `primebrick-be-v3/src/modules/proxy/service-lifecycle-subscriber.ts` (new)

Subscribes to `service.register`, `service.heartbeat`, `service.unregister` and updates the DB:

```typescript
import { NatsClient, SERVICE_SUBJECTS, type ServiceHeartbeatPayload, type ServiceRegisterPayload, type ServiceUnregisterPayload } from "@primebrick/sdk";
import { getPool } from "../../db/pool.js";
import { ServiceRegistryRepo } from "./service-registry-repo.js";

export class ServiceLifecycleSubscriber {
  private nats: NatsClient;
  private repo: ServiceRegistryRepo;

  constructor() {
    this.nats = NatsClient.getInstance();
    this.repo = new ServiceRegistryRepo(getPool());
  }

  async start(): Promise<void> {
    await this.nats.subscribe(SERVICE_SUBJECTS.REGISTER, this.handleRegister.bind(this));
    await this.nats.subscribe(SERVICE_SUBJECTS.HEARTBEAT, this.handleHeartbeat.bind(this));
    await this.nats.subscribe(SERVICE_SUBJECTS.UNREGISTER, this.handleUnregister.bind(this));
  }

  private deriveStatus(http_healthy: boolean, nats_connected: boolean): string {
    if (http_healthy && nats_connected) return 'online';
    if (!http_healthy && !nats_connected) return 'offline';
    return 'going_live';
  }

  private async handleRegister(payload: ServiceRegisterPayload): Promise<void> {
    const { code, base_url, is_behind_scaler } = payload;
    const status = this.deriveStatus(payload.http_healthy, payload.nats_connected);

    if (is_behind_scaler) {
      // Scaler mode: one row per code, skip base_url update
      const existing = await this.repo.findByCode(code);
      if (existing) {
        await this.repo.updateByCode(code, {
          service_version: payload.service_version,
          name: payload.name,
          description: payload.description,
          author: payload.author,
          github_repo_url: payload.github_repo_url,
          endpoints: payload.endpoints,
          status,
          last_health_check_at: new Date(),
        });
        this.logStatusChange(code, base_url, existing.status, status);
      } else {
        // Row doesn't exist — insert with base_url from payload (first registration)
        await this.repo.insert({
          code, base_url, endpoints: payload.endpoints,
          service_version: payload.service_version,
          name: payload.name, description: payload.description,
          author: payload.author, github_repo_url: payload.github_repo_url,
          is_behind_scaler: true, status,
          last_health_check_at: new Date(),
        });
        console.log(`[service] ${code} registered (scaler mode) at ${base_url}`);
      }
    } else {
      // Direct mode: one row per (code, base_url)
      const existing = await this.repo.findByCodeAndBaseUrl(code, base_url);
      if (existing) {
        await this.repo.updateByCodeAndBaseUrl(code, base_url, {
          service_version: payload.service_version,
          name: payload.name, description: payload.description,
          author: payload.author, github_repo_url: payload.github_repo_url,
          endpoints: payload.endpoints,
          status, last_health_check_at: new Date(),
        });
        this.logStatusChange(code, base_url, existing.status, status);
      } else {
        await this.repo.insert({
          code, base_url, endpoints: payload.endpoints,
          service_version: payload.service_version,
          name: payload.name, description: payload.description,
          author: payload.author, github_repo_url: payload.github_repo_url,
          is_behind_scaler: false, status,
          last_health_check_at: new Date(),
        });
        console.log(`[service] ${code} registered (direct mode) at ${base_url}`);
      }
    }
  }

  private async handleHeartbeat(payload: ServiceHeartbeatPayload): Promise<void> {
    const { code, base_url, is_behind_scaler } = payload;
    const status = this.deriveStatus(payload.http_healthy, payload.nats_connected);

    if (is_behind_scaler) {
      const existing = await this.repo.findByCode(code);
      if (existing) {
        await this.repo.updateByCode(code, {
          service_version: payload.service_version,
          status, last_health_check_at: new Date(),
        });
        this.logStatusChange(code, base_url, existing.status, status);
      }
    } else {
      const existing = await this.repo.findByCodeAndBaseUrl(code, base_url);
      if (existing) {
        await this.repo.updateByCodeAndBaseUrl(code, base_url, {
          service_version: payload.service_version,
          status, last_health_check_at: new Date(),
        });
        this.logStatusChange(code, base_url, existing.status, status);
      }
    }
  }

  private async handleUnregister(payload: ServiceUnregisterPayload): Promise<void> {
    const { code, base_url, is_behind_scaler } = payload;
    if (is_behind_scaler) {
      await this.repo.updateByCode(code, { status: 'offline', last_health_check_at: new Date() });
    } else {
      await this.repo.updateByCodeAndBaseUrl(code, base_url, { status: 'offline', last_health_check_at: new Date() });
    }
    console.log(`[service] ${code} at ${base_url} unregistered → offline`);
  }

  private logStatusChange(code: string, baseUrl: string, oldStatus: string, newStatus: string): void {
    if (oldStatus !== newStatus) {
      console.log(`[health] ${code} ${baseUrl} changed: ${oldStatus} → ${newStatus}`);
    }
  }
}
```

#### 3.4 Add BE stale detection job
**File:** `primebrick-be-v3/src/modules/proxy/stale-detection-job.ts` (new)

Runs every 30s, DB-only (no HTTP probing):

```typescript
import { getPool } from "../../db/pool.js";
import { ServiceRegistryRepo } from "./service-registry-repo.js";

const STALE_THRESHOLD_MS = 90_000;  // 3x heartbeat interval
const POLL_INTERVAL_MS = 30_000;

export class StaleDetectionJob {
  private repo: ServiceRegistryRepo;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.repo = new ServiceRegistryRepo(getPool());
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.run(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private async run(): Promise<void> {
    const services = await this.repo.findAll();
    if (services.length === 0) return;

    const now = Date.now();
    const stale = services.filter(s =>
      s.last_health_check_at &&
      (now - new Date(s.last_health_check_at).getTime()) > STALE_THRESHOLD_MS
    );

    if (stale.length === 0) return;

    // If ALL services are stale → NATS outage suspected
    if (stale.length === services.length) {
      console.error(`[CRITICAL] All ${services.length} registered services are stale — last heartbeat received >${STALE_THRESHOLD_MS / 1000}s ago. NATS outage suspected. Service routing will return 503 for degraded services.`);
    }

    // Mark stale rows as going_live (not offline — they might be alive on HTTP)
    // Rows already offline stay offline
    for (const s of stale) {
      if (s.status === 'offline') continue;
      const oldStatus = s.status;
      if (s.is_behind_scaler) {
        await this.repo.updateByCode(s.code, { status: 'going_live' });
      } else {
        await this.repo.updateByCodeAndBaseUrl(s.code, s.base_url, { status: 'going_live' });
      }
      console.log(`[health] ${s.code} ${s.base_url} changed: ${oldStatus} → going_live (stale)`);
    }
  }
}
```

#### 3.5 Update proxy to filter by status + round-robin
**File:** `primebrick-be-v3/src/modules/proxy/proxy-service.ts`

Replace the current `findServiceByCodeCached` lookup with `findAllByCode` + status filtering + round-robin:

```typescript
// Round-robin counters (in-memory, per process)
const rrCounters = new Map<string, number>();

export async function proxyRequest(req: Request, res: Response): Promise<void> {
  const serviceCode = ...;
  const pool = getPool();
  const repo = new ServiceRegistryRepo(pool);
  const allInstances = await repo.findAllByCode(serviceCode);

  if (allInstances.length === 0) {
    // Service not found → RFC 7807 404
    res.status(404).json({ type: ".../service-not-found", ... });
    return;
  }

  const onlineInstances = allInstances.filter(i => i.status === 'online');

  if (onlineInstances.length === 0) {
    // No healthy instances
    const hasGoingLive = allInstances.some(i => i.status === 'going_live');
    if (hasGoingLive) {
      res.status(503).json({
        type: "https://primebrick.io/errors/service-degraded",
        title: "Service degraded",
        status: 503,
        detail: `Microservice '${serviceCode}' is degraded — no healthy instances available`,
        internal_code: "SERVICE_DEGRADED",
        severity: "HIGH",
      });
    } else {
      res.status(502).json({
        type: "https://primebrick.io/errors/service-offline",
        title: "Service offline",
        status: 502,
        detail: `Microservice '${serviceCode}' is offline — no instances available`,
        internal_code: "SERVICE_OFFLINE",
        severity: "CRITICAL",
      });
    }
    return;
  }

  // Round-robin among online instances
  const counter = rrCounters.get(serviceCode) ?? 0;
  const instance = onlineInstances[counter % onlineInstances.length];
  rrCounters.set(serviceCode, counter + 1);

  // Build target URL from instance.base_url (same path logic as before)
  const pathAfterService = req.url.replace(/^\/ws\/[^/]+/, "");
  const targetPath = `/api${pathAfterService}`;
  const targetUrl = new URL(targetPath, instance.base_url).toString();

  // ... rest of proxy logic (auth headers, fetch, pass-through) unchanged
}
```

#### 3.6 Add `GET /api/v1/system/services` endpoint
**File:** `primebrick-be-v3/src/modules/system/system-router.ts`

Simple DB read — no health probing:

```typescript
router.get(
  "/api/v1/system/services",
  rbacHandler([Permission.AUTHENTICATED_USER]),
  asyncHandler(async (_req, res) => {
    const pool = getPool();
    const repo = new ServiceRegistryRepo(pool);
    const services = await repo.findAll();
    res.json({ services });
  })
);
```

**Response shape (snake_case):**
```json
{
  "services": [
    {
      "code": "EMAILSENDER",
      "base_url": "http://localhost:3003",
      "endpoints": { "health": "...", "webhook": "..." },
      "name": "Email Sender",
      "description": "Email sending microservice",
      "author": "PrimeBrick",
      "github_repo_url": "https://github.com/...",
      "service_version": "1.2.3",
      "is_behind_scaler": false,
      "status": "online",
      "last_health_check_at": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

#### 3.7 Wire NATS subscriber + stale detection in BE startup
**File:** `primebrick-be-v3/src/index.ts`

```typescript
// After NATS connection is established:
const lifecycleSubscriber = new ServiceLifecycleSubscriber();
await lifecycleSubscriber.start();

const staleJob = new StaleDetectionJob();
staleJob.start();
```

#### 3.8 Remove fake CRM module
**File:** `primebrick-be-v3/src/index.ts`

- Remove `INSTALLED_MODULES` constant
- Remove `modules` field from `HealthPayload` type (or set to `[]`)
- Replace hardcoded `/modules` endpoint with `ServiceRegistryRepo.findAll()`:
```typescript
apiRouter.get("/modules", rbacHandler([Permission.MODULES_READ_ALL]), async (_req, res) => {
  const repo = new ServiceRegistryRepo(getPool());
  const services = await repo.findAll();
  res.json({
    modules: services.map(s => ({ id: s.code.toLowerCase(), name: s.name || s.code, enabled: true })),
  });
});
```

### Phase 4: US — Config-gated startup, NATS registration, health checks

#### 4.1 Config-gated startup
**File:** `primebrick-us-v3/emailsender/src/index.ts`

Before registering, wait for config (base_url, is_behind_scaler, name, description, etc.) to be available in the config table. Use a retry loop (same pattern as existing retry logic in the codebase — search empirically for similar patterns):

```typescript
// Config-gated: wait for service config to be available
const serviceConfig = await waitForServiceConfig({
  serviceCode: env.SERVICE_CODE!,
  retryIntervalMs: 5000,
});
console.log(`Service config loaded: ${serviceConfig.base_url}`);

// Register via NATS
const registrar = new ServiceRegistrar(natsClient, {
  serviceCode: env.SERVICE_CODE!,
  baseUrl: serviceConfig.base_url,
  endpoints: { webhook: `${serviceConfig.base_url}/webhook`, health: `${serviceConfig.base_url}/health` },
  name: serviceConfig.name,
  description: serviceConfig.description,
  author: serviceConfig.author,
  github_repo_url: serviceConfig.github_repo_url,
  service_version: readServiceVersion(),  // from package.json
  is_behind_scaler: serviceConfig.is_behind_scaler,
  heartbeatIntervalMs: serviceConfig.heartbeat_interval_ms ?? 30000,
});

await registrar.register();
registrar.startHeartbeat();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await registrar.unregister();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await registrar.unregister();
  process.exit(0);
});
```

#### 4.2 Add NATS connectivity to health checks
**File:** `primebrick-us-v3/emailsender/src/adapters/health-check-adapter.ts`

Add a NATS connectivity check:

```typescript
async checkNats(): Promise<HealthCheckResult> {
  return { ok: NatsClient.isConnected() };
}
```

Wire it into the HealthCheck so the `/health` HTTP endpoint also reports NATS status.

#### 4.3 NATS reconnect → immediate heartbeat
**File:** `primebrick-us-v3/emailsender/src/index.ts`

When NATS reconnects after an outage, send an immediate heartbeat:

```typescript
natsClient.onReconnect(() => {
  console.log('[NATS] Reconnected — sending immediate heartbeat');
  void registrar.sendHeartbeat();
});
```

#### 4.4 Remove `ServiceRegistryAdapter` (no longer needed)
**File:** `primebrick-us-v3/emailsender/src/adapters/service-registry-adapter.ts`

The microservice no longer writes to the DB directly — it publishes NATS messages. The `ServiceRegistryAdapter` is no longer needed. Remove it and its imports.

### Phase 5: FE — Types, Store, VersionsPanel

#### 5.1 Add `ServiceInfo` type
**File:** `primebrick-fe-v3/src/lib/api-types.ts`

```typescript
export type ServiceInfo = {
  code: string;
  base_url: string;
  endpoints: Record<string, unknown>;
  name?: string;
  description?: string;
  author?: string;
  github_repo_url?: string;
  service_version?: string;
  is_behind_scaler: boolean;
  status: string;        // online | going_live | offline | unknown
  last_health_check_at?: string;
};
```

#### 5.2 Add `fetchServices` to `api.ts`
**File:** `primebrick-fe-v3/src/lib/api.ts`

```typescript
export async function fetchServices(): Promise<ServiceInfo[]> {
  const res = await apiFetch('/api/v1/system/services');
  if (!res.ok) throw new Error(`Services request failed (${res.status})`);
  const data = (await res.json()) as { services: ServiceInfo[] };
  return data.services;
}
```

#### 5.3 Add `services-store.svelte.ts`
**File:** `primebrick-fe-v3/src/lib/services-store.svelte.ts` (new)

```typescript
import { fetchServices, type ServiceInfo } from '$lib/api';

export const servicesState = $state({
  services: [] as ServiceInfo[],
  loading: true,
  lastCheckedAt: null as number | null,
});

let pollInterval: ReturnType<typeof setInterval> | null = null;

export async function probeServices(): Promise<void> {
  try {
    servicesState.services = await fetchServices();
    servicesState.lastCheckedAt = Date.now();
  } catch {
    // Silently fail — services panel is non-critical
  } finally {
    servicesState.loading = false;
  }
}

export function startServicesPolling(intervalMs = 30000): void {
  if (pollInterval) return;
  void probeServices();
  pollInterval = setInterval(() => void probeServices(), intervalMs);
}

export function stopServicesPolling(): void {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

// Aggregation helpers for grouped display
export function aggregateStatus(instances: ServiceInfo[]): string {
  if (instances.length === 0) return 'offline';
  if (instances.every(i => i.status === 'online')) return 'online';
  if (instances.some(i => i.status === 'online')) return 'going_live';
  return 'offline';
}

export function groupByCode(services: ServiceInfo[]): Map<string, ServiceInfo[]> {
  const map = new Map<string, ServiceInfo[]>();
  for (const s of services) {
    if (!map.has(s.code)) map.set(s.code, []);
    map.get(s.code)!.push(s);
  }
  return map;
}
```

#### 5.4 Start polling in AppShell
**File:** `primebrick-fe-v3/src/lib/components/AppShell.svelte`

```svelte
$effect(() => {
  if (!browser) return;
  startServicesPolling();
  return () => stopServicesPolling();
});
```

#### 5.5 Replace Modules section with Microservices section in VersionsPanel
**File:** `primebrick-fe-v3/src/lib/shell/sheets/panels/VersionsPanel.svelte`

**Layout per service code group:**
- **Group header row**: service name (i18n key `shell.microservices.{code}`, fallback to `name` or `code`) + 3 badges:
  1. Version badge (if `service_version` present)
  2. Aggregated status badge with icon (Cloud=online/green, CloudOff=offline/red, AlertCircle=going_live/yellow)
  3. Instance counter badge `{healthy}/{total}` (only when `is_behind_scaler = false`)
- **Instance rows** (only when `is_behind_scaler = false`): each instance shows `host:port` on the left + individual status dot badge on the right
- **Scaler note** (when `is_behind_scaler = true`): "Behind scaler — NLB manages instances"

```svelte
<div>
  <div class="mb-2 text-xs font-medium text-primary">{$t('shell.health.microservicesTitle')}</div>
  {#if servicesState.loading}
    <div class="text-xs text-muted-foreground">{$t('common.loading')}</div>
  {:else if groupedServices.size === 0}
    <div class="text-xs text-muted-foreground">{$t('shell.health.noMicroservices')}</div>
  {:else}
    <div class="space-y-3">
      {#each groupedServices as [code, instances] (code)}
        {@const aggStatus = aggregateStatus(instances)}
        {@const behindScaler = instances[0].is_behind_scaler}
        {@const healthyCount = instances.filter(i => i.status === 'online').length}
        {@const displayName = $t(`shell.microservices.${code}`, { default: instances[0].name || code })}

        <!-- Group header -->
        <div class="flex items-center justify-between gap-3 text-sm">
          <div class="truncate text-muted-foreground">{displayName}</div>
          <div class="flex items-center gap-2">
            {#if instances[0].service_version}
              <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                v{instances[0].service_version}
              </Badge>
            {/if}
            <Badge variant="outline" class={cn('gap-1 font-mono text-[11px] font-medium', statusBadgeClass(aggStatus))}>
              {#if aggStatus === 'online'}
                <Cloud class="size-3.5 opacity-90" />
              {:else if aggStatus === 'going_live'}
                <AlertCircle class="size-3.5 opacity-90" />
              {:else}
                <CloudOff class="size-3.5 opacity-90" />
              {/if}
              <span>{$t(`shell.health.${aggStatus}`)}</span>
            </Badge>
            {#if !behindScaler}
              <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                {healthyCount}/{instances.length}
              </Badge>
            {/if}
          </div>
        </div>

        <!-- Instance rows (only for direct mode) -->
        {#if !behindScaler}
          <div class="ml-4 space-y-1">
            {#each instances as inst (inst.base_url)}
              <div class="flex items-center justify-between gap-3 text-xs">
                <div class="truncate text-muted-foreground">{inst.base_url}</div>
                <div class={cn('size-2 rounded-full', statusDotClass(inst.status))} />
              </div>
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
```

**Status badge styling:**
```typescript
function statusBadgeClass(status: string): string {
  switch (status) {
    case 'online':     return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'going_live': return 'border-yellow-500/25 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300';
    case 'offline':    return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300';
    default:           return 'border-border/60 bg-muted/30 text-muted-foreground';
  }
}

function statusDotClass(status: string): string {
  switch (status) {
    case 'online':     return 'bg-emerald-500';
    case 'going_live': return 'bg-yellow-500';
    case 'offline':    return 'bg-red-500';
    default:           return 'bg-muted-foreground';
  }
}
```

#### 5.6 Add i18n keys
**Files:** All locale files in `src/lib/i18n/messages/*.json`

- `shell.health.microservicesTitle` → "Microservices" / "Microservizi" / etc.
- `shell.health.noMicroservices` → "No microservices registered" / etc.
- `shell.health.online` → "Online" / "In linea" / etc.
- `shell.health.going_live` → "Going Live" / "Avvio in corso" / etc.
- `shell.health.offline` → "Offline" / "Non in linea" / etc.
- `shell.microservices.EMAILSENDER` → "Email Sender" / "Mittente Email" / etc.

### Phase 6: Unit Tests

Follow each repo's existing test patterns. SDK and US already have vitest. BE has no test infrastructure — needs vitest added. FE has no test infrastructure — aggregation helpers are pure functions that can be tested with vitest.

#### 6.1 SDK — Update `service-registrar.test.ts` + add lifecycle tests
**File:** `primebrick-v3-sdk/src/service/__tests__/service-registrar.test.ts`

The existing test tests the old DB-based registrar (uses `ServiceRegistryPort` mock). Rewrite to test the new NATS-based registrar:

```typescript
// Mock NatsClient instead of ServiceRegistryPort
const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  isConnected: vi.fn(() => true),
}));

// Test: register() publishes to service.register subject
// Test: sendHeartbeat() publishes to service.heartbeat subject
// Test: unregister() publishes to service.unregister subject
// Test: startHeartbeat() calls sendHeartbeat on interval
// Test: stopHeartbeat() clears the interval
// Test: heartbeat payload includes http_healthy, nats_connected, checks
// Test: is_behind_scaler flag is passed through in payload
// Test: service_version is included in payload
```

**File:** `primebrick-v3-sdk/src/service/__tests__/service-lifecycle-subjects.test.ts` (new)

```typescript
// Test: SERVICE_SUBJECTS constants are stable strings
// Test: payload types enforce required fields (compile-time, no runtime test needed)
// Test: ServiceHeartbeatPayload serialization round-trip via extJsonStringify/parse
```

#### 6.2 BE — Add vitest + unit tests for new modules
**File:** `primebrick-be-v3/vitest.config.ts` (new)

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

**File:** `primebrick-be-v3/package.json` — add devDependencies + scripts:
```json
"devDependencies": {
  "vitest": "^2.1.0"
},
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

**File:** `primebrick-be-v3/src/modules/proxy/__tests__/service-lifecycle-subscriber.test.ts` (new)

Mock `ServiceRegistryRepo` and `NatsClient`. Test the subscriber logic:

```typescript
// Test: handleRegister — scaler mode, existing row → updateByCode (skip base_url)
// Test: handleRegister — scaler mode, no row → insert with base_url from payload
// Test: handleRegister — direct mode, existing row → updateByCodeAndBaseUrl
// Test: handleRegister — direct mode, no row → insert
// Test: handleHeartbeat — derives status from http_healthy + nats_connected
//   - both true → 'online'
//   - both false → 'offline'
//   - one true → 'going_live'
// Test: handleHeartbeat — scaler mode updates by code
// Test: handleHeartbeat — direct mode updates by code+base_url
// Test: handleUnregister — marks status as 'offline'
// Test: logStatusChange — logs only when status actually changes
// Test: logStatusChange — does NOT log when status is the same
```

**File:** `primebrick-be-v3/src/modules/proxy/__tests__/stale-detection-job.test.ts` (new)

Mock `ServiceRegistryRepo`. Test stale detection logic:

```typescript
// Test: no stale services → no updates, no log
// Test: 1 stale service (was online) → marked going_live, log status change
// Test: 1 stale service (was already offline) → stays offline, no update
// Test: ALL services stale → CRITICAL error logged, all marked going_live
// Test: some stale, some fresh → only stale ones updated
// Test: stale threshold is 90s (3x 30s heartbeat)
// Test: service with no last_health_check_at → treated as stale
```

**File:** `primebrick-be-v3/src/modules/proxy/__tests__/proxy-service.test.ts` (new)

Mock `ServiceRegistryRepo` and Express `req`/`res`. Test proxy routing logic:

```typescript
// Test: 0 instances for code → 404 RFC 7807 service-not-found
// Test: 1 online instance → forwards to it
// Test: 2 online instances → round-robin (first call → instance[0], second → instance[1], third → instance[0])
// Test: 0 online, 1 going_live → 503 RFC 7807 service-degraded
// Test: 0 online, 0 going_live, 1 offline → 502 RFC 7807 service-offline
// Test: 0 online, 0 going_live, 0 offline (all unknown) → 502 RFC 7807 service-offline
// Test: 1 online + 1 offline → routes to online only, never touches offline
// Test: target URL construction strips /ws/{code} prefix and prepends /api
// Test: query string preserved in target URL
```

#### 6.3 US — Update registration tests + add health check tests
**File:** `primebrick-us-v3/emailsender/test/integration/service-registration.integration.test.ts`

The existing test tests the old `ServiceRegistryAdapter` (direct DB writes). Since the adapter is being removed and registration now goes via NATS, this test needs to be rewritten:

```typescript
// Test: ServiceRegistrar.register() publishes to NATS service.register subject
// Test: ServiceRegistrar.sendHeartbeat() publishes to NATS service.heartbeat subject
// Test: ServiceRegistrar.unregister() publishes to NATS service.unregister subject
// Test: heartbeat payload includes http_healthy from health checks
// Test: heartbeat payload includes nats_connected from NatsClient.isConnected()
// Test: config-gated startup waits for config table before registering
// Test: graceful shutdown (SIGTERM) sends unregister via NATS
```

**File:** `primebrick-us-v3/emailsender/src/adapters/__tests__/health-check-adapter.test.ts` (new)

```typescript
// Test: checkNats() returns ok=true when NatsClient.isConnected() is true
// Test: checkNats() returns ok=false when NatsClient.isConnected() is false
// Test: full health check includes both db and nats checks
// Test: /health endpoint returns 200 when both db + nats are ok
// Test: /health endpoint returns 503 when nats is down (even if db is up)
```

#### 6.4 FE — Add vitest + unit tests for aggregation helpers
**File:** `primebrick-fe-v3/vitest.config.ts` (new)

```typescript
import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
```

**File:** `primebrick-fe-v3/package.json` — add devDependencies + scripts:
```json
"devDependencies": {
  "vitest": "^2.1.0",
  "jsdom": "^25.0.0"
},
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

**File:** `primebrick-fe-v3/src/lib/__tests__/services-store.test.ts` (new)

Test the pure aggregation functions (no Svelte component testing — just the helper functions):

```typescript
import { aggregateStatus, groupByCode } from "$lib/services-store.svelte";
import type { ServiceInfo } from "$lib/api-types";

// Test: aggregateStatus — all online → 'online'
// Test: aggregateStatus — 1 online + 1 offline → 'going_live'
// Test: aggregateStatus — 0 online, all offline → 'offline'
// Test: aggregateStatus — empty array → 'offline'
// Test: aggregateStatus — 1 online + 1 going_live → 'going_live'
// Test: groupByCode — groups instances by code
// Test: groupByCode — single instance → map with 1 entry
// Test: groupByCode — multiple codes → multiple map entries
// Test: groupByCode — empty array → empty map
```

## Acceptance Criteria

1. **DB schema**: `service_registry` has 8 new columns (name, description, author, github_repo_url, service_version, is_behind_scaler, status, last_health_check_at) + 2 partial unique indexes
2. **SDK**: `ServiceRegistrar` publishes via NATS (register, heartbeat, unregister) instead of writing to DB directly
3. **SDK**: `IServiceRegistry` includes all new fields
4. **BE NATS subscriber**: Receives register/heartbeat/unregister, derives status (online/going_live/offline), updates DB, logs on status change
5. **BE stale detection**: Runs every 30s, marks stale rows as `going_live`, logs CRITICAL error if ALL services stale
6. **BE proxy**: Filters by `status = 'online'` only. 0 online + some going_live → 503. 0 online + 0 going_live → 502. Round-robins among online instances.
7. **BE endpoint**: `GET /api/v1/system/services` returns all rows from DB (instant, no health probing)
8. **BE DAL**: `ServiceRegistryRepo` uses `Repository` from `@primebrick/dal-pg` — NO raw SQL
9. **BE**: Fake hardcoded "crm" module removed from `/api/v1/health` and `/api/v1/modules`
10. **US**: Config-gated startup (waits for config table before registering)
11. **US**: NATS connectivity check in `/health` endpoint
12. **US**: Graceful shutdown sends `service.unregister` via NATS
13. **US**: NATS reconnect triggers immediate heartbeat
14. **FE VersionsPanel**: Grouped by code, 3 badges (version, status, instance counter), instance rows for direct mode
15. **FE status colors**: online=green, going_live=yellow, offline=red
16. **FE instance counter**: `{healthy}/{total}` fraction, hidden when `is_behind_scaler = true`
17. **All builds pass**: BE, FE, SDK, US all typecheck and build successfully
18. **Unit tests pass**: All new unit tests pass in SDK, BE, US, FE
19. **SDK tests**: `service-registrar.test.ts` updated for NATS-based registrar, `service-lifecycle-subjects.test.ts` added
20. **BE tests**: Vitest added (config + scripts), `service-lifecycle-subscriber.test.ts`, `stale-detection-job.test.ts`, `proxy-service.test.ts` — all pass
21. **US tests**: `service-registration.integration.test.ts` rewritten for NATS registration, `health-check-adapter.test.ts` added
22. **FE tests**: Vitest added (config + scripts), `services-store.test.ts` for aggregation helpers — passes

## Files Impacted

### SDK (`primebrick-v3-sdk`)
| File | Action |
|------|--------|
| `src/service/service-registry.ts` | Update `IServiceRegistry` with new fields |
| `src/service/service-registrar.ts` | Refactor to use NATS publishing, add new config fields |
| `src/service/service-lifecycle-subjects.ts` | **New** — NATS subjects + payload types |
| `src/ports/service-registry-port.ts` | Add `findAllByCode`, `findByCodeAndBaseUrl`, `findAll`, `updateByCodeAndBaseUrl`, `deleteByCodeAndBaseUrl` |
| `src/nats/nats-client.ts` | Add `isConnected()` method (if not present) |
| `src/service/__tests__/service-registrar.test.ts` | **Rewrite** — test NATS-based registrar instead of DB-based |
| `src/service/__tests__/service-lifecycle-subjects.test.ts` | **New** — test subjects + payload serialization |

### BE (`primebrick-be-v3`)
| File | Action |
|------|--------|
| `vitest.config.ts` | **New** — vitest configuration |
| `package.json` | Add vitest devDependency + test scripts |
| `db-meta/patches/00000000000000_init_database.sql` | Update `service_registry` CREATE TABLE with all new columns + indexes (single source of truth) |
| `db-meta/fire-and-forget/add_service_registry_metadata_columns.sql` | **New** — ALTER TABLE for existing databases (idempotent) |
| `src/modules/system/service_registry_entity.ts` | Add 8 new `@Column` fields |
| `src/modules/proxy/service-registry-repo.ts` | **Refactor** — `ServiceRegistryRepo` class using DAL Repository, no raw SQL |
| `src/modules/proxy/service-lifecycle-subscriber.ts` | **New** — NATS subscriber for register/heartbeat/unregister |
| `src/modules/proxy/stale-detection-job.ts` | **New** — background stale detection |
| `src/modules/proxy/proxy-service.ts` | Update: filter by status, round-robin, 503/502 RFC 7807 |
| `src/modules/system/system-router.ts` | Add `GET /api/v1/system/services` |
| `src/index.ts` | Remove fake CRM, wire NATS subscriber + stale job, update `/modules` endpoint |
| `src/modules/proxy/__tests__/service-lifecycle-subscriber.test.ts` | **New** — unit tests for NATS subscriber |
| `src/modules/proxy/__tests__/stale-detection-job.test.ts` | **New** — unit tests for stale detection |
| `src/modules/proxy/__tests__/proxy-service.test.ts` | **New** — unit tests for proxy routing + round-robin |

### US (`primebrick-us-v3`)
| File | Action |
|------|--------|
| `emailsender/src/domain/entities/service_registry_entity.ts` | Add 8 new `@Column` fields (mirror BE) |
| `emailsender/src/index.ts` | Config-gated startup, NATS registration, graceful shutdown, reconnect heartbeat |
| `emailsender/src/adapters/health-check-adapter.ts` | Add NATS connectivity check |
| `emailsender/src/adapters/service-registry-adapter.ts` | **Remove** — no longer needed (registrar uses NATS) |
| `emailsender/test/integration/service-registration.integration.test.ts` | **Rewrite** — test NATS-based registration instead of direct DB adapter |
| `emailsender/src/adapters/__tests__/health-check-adapter.test.ts` | **New** — unit tests for NATS connectivity check |

### FE (`primebrick-fe-v3`)
| File | Action |
|------|--------|
| `vitest.config.ts` | **New** — vitest configuration with jsdom + sveltekit |
| `package.json` | Add vitest + jsdom devDependencies + test scripts |
| `src/lib/api-types.ts` | Add `ServiceInfo` type |
| `src/lib/api.ts` | Add `fetchServices()` |
| `src/lib/services-store.svelte.ts` | **New** — store, polling, aggregation helpers |
| `src/lib/components/AppShell.svelte` | Start/stop services polling |
| `src/lib/shell/sheets/panels/VersionsPanel.svelte` | Replace Modules section with grouped Microservices section |
| `src/lib/i18n/messages/*.json` | Add i18n keys (6 locales) |
| `src/lib/__tests__/services-store.test.ts` | **New** — unit tests for aggregation helpers (aggregateStatus, groupByCode) |

### DAL (`primebrick-dal-v3`)
No changes needed — the DAL `Repository` class already supports the operations we need. If `updateByCodeAndBaseUrl` (composite key match) is not supported, we investigate during implementation and add support if needed.
```
