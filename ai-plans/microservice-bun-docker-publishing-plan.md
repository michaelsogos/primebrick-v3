# Plan: Microservice Bun Runtime + Docker + npm Publishing Workflow

## Scope

**Microservices only** (US repo — `primebrick-us-v3/emailsender` and future microservices).
BE and FE are NOT touched by this plan.

## Objectives

1. **Switch microservice runtime from Node to Bun** — dev (`bun --watch`) and production (`bun dist/index.js`)
2. **Create Dockerfiles for microservices** — multi-stage builds using `oven/bun` base image
3. **Create a docker-compose for microservices** — orchestrate emailsender + infrastructure (postgres, nats, casdoor)
4. **Publish SDK + DAL to npmjs** — replace `file:` dependencies with versioned npm packages
5. **GitFlow-based npm versioning** — prerelease tags for `develop` branch, standard semver for `main`/hotfix

## Current State

| Component | Runtime | Docker | npm |
|-----------|---------|--------|-----|
| US/emailsender | Node (`node dist/index.js`) | Has Dockerfile (node:22-alpine) | Uses `file:` deps |
| SDK | N/A (library) | No | Local `file:` dep, not published |
| DAL | N/A (library) | No | Local `file:` dep, not published |
| BE | Node | No Dockerfile | Uses `file:` deps (NOT in scope) |
| FE | Vite | No Dockerfile | Uses `file:` deps (NOT in scope) |

## Architecture

### Dependency flow after this plan

```
npmjs (@primebrick/sdk@x.y.z)  ←── published from SDK repo
npmjs (@primebrick/dal-pg@x.y.z) ←── published from DAL repo
         │                              │
         ▼                              ▼
    US/emailsender (package.json)
         "dependencies": {
           "@primebrick/sdk": "x.y.z",
           "@primebrick/dal-pg": "x.y.z"
         }
         │
         ▼
    Docker image (oven/bun:1.1.0-alpine)
         bun dist/index.js
```

### Why publish to npmjs?

- Docker builds become self-contained: `pnpm install --frozen-lockfile` pulls from npmjs, no workspace context needed
- Each microservice Docker image is independent — no workspace root copying
- Version pinning: microservices depend on specific SDK/DAL versions, not floating `file:` links
- Enables CI/CD: a microservice build only needs its own repo + npm registry

### Pinned versions policy

**All packages in all repos — both dependencies and devDependencies — must
use exact pinned versions, never ranges.** This applies to existing
package.json files AND all new dependencies added by this plan.

- **Correct:** `"@primebrick/sdk": "0.1.1"`, `"vitest": "2.1.0"`, `"nats": "2.29.3"`
- **Forbidden:** `"@primebrick/sdk": "^0.1.1"`, `"vitest": "^2.1.0"`, `"nats": "^2.29.3"`
- **Forbidden:** `"@primebrick/sdk": "~0.1.1"`, `"vitest": ">=2.1.0"`, `"nats": "*"`

**Rationale:** Stability and reproducibility. A `^` range silently pulls
a new minor/patch on every `pnpm install` when the lockfile is regenerated,
which can introduce subtle breakage. Pinned versions guarantee that a build
produced today produces the same result next month.

**Enforcement:**
- When running `pnpm add <pkg>`, pnpm writes a `^` range by default — this
  must be manually corrected to an exact version in `package.json` after install
- When publishing SDK/DAL to npmjs, consumers must also pin (documented in
  the package README)
- Terraform provider versions are also pinned: `version = "3.0"` (not `~> 3.0`)
- Docker image tags must be explicit: `oven/bun:1.1.0-alpine` (not `oven/bun:latest`)

---

## Phase 1: Publish SDK + DAL to npmjs

### 1.1 Prepare SDK for npm publishing

**Repo:** `primebrick-v3-sdk`

**Files to modify:**
- `package.json` — ensure `name`, `version`, `description`, `keywords`, `repository`, `license`, `author`, `files`, `publishConfig` are set correctly
- Verify `files` field includes `dist/` and excludes `src/`, `tests/`, etc.
- Verify `prepare` script builds before publish

**package.json changes:**
```json
{
  "name": "@primebrick/sdk",
  "version": "0.1.1",
  "description": "PrimeBrick shared SDK — NATS client, service registrar, auth, health checks, HTTP server",
  "keywords": ["primebrick", "sdk", "nats", "microservice"],
  "repository": {
    "type": "git",
    "url": "https://github.com/primebrick/primebrick-v3-sdk.git"
  },
  "license": "MIT",
  "files": ["dist", "README.md"],
  "publishConfig": {
    "access": "public"
  }
}
```

**Actions:**
1. Verify `npm login` is configured (npm whoami)
2. Run `npm publish --dry-run` to check what gets published
3. Run `npm publish` for the first release (version 0.1.1)

### 1.2 Prepare DAL for npm publishing

**Repo:** `primebrick-dal-v3`

**Same pattern as SDK:**
- `package.json` — add publishing metadata
- Verify `files` field includes `dist/`
- Verify `prepare` script builds before publish

**Actions:**
1. `npm publish --dry-run` to verify
2. `npm publish` for first release

### 1.3 Update US/emailsender to use npm packages

**Repo:** `primebrick-us-v3/emailsender`

**File:** `package.json`

**Change:**
```json
// Before:
"dependencies": {
  "@primebrick/sdk": "file:../../primebrick-v3-sdk",
  "@primebrick/dal-pg": "file:../../primebrick-dal-v3"
}

// After:
"dependencies": {
  "@primebrick/sdk": "0.1.1",
  "@primebrick/dal-pg": "0.1.0"
}
```

**Actions:**
1. Remove `file:` references
2. Run `pnpm install` to pull from npmjs
3. Run `pnpm run build` to verify compilation
4. Run `pnpm run test` to verify tests pass

### 1.4 GitFlow-based npm versioning

**Branch strategy:**
- `develop` branch → prerelease publishes: `0.2.0-prerelease.1`, `0.2.0-prerelease.2`, ...
- `main` branch → stable releases: `0.2.0`, `0.2.1`, `1.0.0`, ...
- `hotfix/*` branches → hotfix releases: `0.2.2`, ...

**Prerelease flow (develop branch):**
```bash
# On develop branch, after merge:
# 1. Calculate next prerelease version
npm version prerelease --preid=prerelease
# This increments: 0.1.1 → 0.2.0-prerelease.1 → 0.2.0-prerelease.2 → ...

# 2. Publish with prerelease tag
npm publish --tag prerelease
```

**Release flow (main branch):**
```bash
# On main branch, after merge from develop:
# 1. Calculate next stable version
npm version minor  # or patch, or major

# 2. Publish with latest tag (default)
npm publish
```

**Hotfix flow (hotfix/* branches):**
```bash
# On hotfix branch:
npm version patch
npm publish
```

**CI/CD integration (future):**
- GitHub Actions workflow on push to `develop` → auto `npm version prerelease` + `npm publish --tag prerelease`
- GitHub Actions workflow on push to `main` → auto `npm version` + `npm publish`
- Microservices install prerelease versions with `npm install @primebrick/sdk@prerelease`

---

## Phase 2: Switch microservices to Bun runtime

### 2.1 Update US/emailsender package.json scripts

**Repo:** `primebrick-us-v3/emailsender`

**File:** `package.json`

**Changes:**
```json
{
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "bun scripts/database-patch-apply.ts"
  }
}
```

**Notes:**
- `bun --watch` replaces `tsx watch` — native Bun hot reload
- `bun build` replaces `tsc` — Bun's bundler (faster, produces single bundle)
  - Alternative: keep `tsc` for type-checking, use `bun dist/index.js` for runtime
  - Decision: **keep `tsc` for build** (type safety), use `bun dist/index.js` for runtime
- `bun dist/index.js` replaces `node dist/index.js` — Bun runtime
- Remove `tsx` from devDependencies (no longer needed)

**Revised scripts (keep tsc for type safety):**
```json
{
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "tsc",
    "start": "bun dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "bun scripts/database-patch-apply.ts"
  }
}
```

### 2.2 Remove tsx dependency

**File:** `package.json`

Remove `tsx` from `devDependencies`:
```bash
pnpm remove tsx
```

### 2.3 Verify Bun compatibility

**Risk areas:**
- `casdoor-nodejs-sdk` — NOT used by US (only BE), so no concern
- `pg` — officially supports Bun ✅
- `nats` — officially supports Bun ✅
- `handlebars` — pure JS ✅
- `reflect-metadata` — pure JS ✅
- `dotenv` — pure JS ✅

**Verification steps:**
1. `bun install` — verify deps install cleanly
2. `bun run build` — verify tsc compiles
3. `bun dist/index.js` — verify service starts
4. `curl http://localhost:3003/health` — verify health endpoint responds
5. `bun run test` — verify all tests pass

### 2.4 Migrate ENV vars to config table

**Principle:** Only `DATABASE_URL` is a true ENV primitive — it's needed to
connect to PG, and you can't read the config table without a DB connection.
`DB_SCHEMA` stays as ENV with a default (structural property, needed before
the first query). Everything else moves to the `emailsender.config` table
and is loaded at startup via the existing `ConfigLoader`.

**Empirical analysis of every current ENV var:**

| ENV var | Current | Decision | Reason |
|---------|---------|----------|--------|
| `DATABASE_URL` | ENV (required) | **STAYS ENV** | Chicken-and-egg: can't read config table without DB |
| `DB_SCHEMA` | ENV (default "emailsender") | **STAYS ENV** (with default) | Needed before first query; structural, not configurable |
| `NATS_URL` | ENV (default "nats://127.0.0.1:4222") | **→ config table** | Read after DB is up; `NatsClient.getConnection()` is called after config load |
| `BREVO_API_KEY` | ENV (required) | **→ providers table** (already there) | Already duplicated in `emailsender.providers`; ENV copy is redundant |
| `BREVO_API_ENDPOINT` | ENV (default "https://api.brevo.com/v1") | **→ config table** | Default endpoint, configurable per environment |
| `SERVICE_CODE` | ENV (default "EMAILSENDER") | **→ config table** | Microservice identity, belongs in config |
| `SERVICE_BASE_URL` | ENV (default "http://localhost:3003") | **→ config table** | Network config, different in Docker vs local |
| `HTTP_PORT` | ENV (default "3003") | **→ config table** | Always 3003 internally; host port mapping is Docker/Terraform |
| `WEBHOOK_API_KEY` | ENV (required!) | **REMOVE** | Dead code — defined in `requireEnv` but never read; webhook auth uses `public.api_keys` table |

**Startup sequence after migration:**
```
1. Read DATABASE_URL from ENV (only true ENV var)
2. Read DB_SCHEMA from ENV (default: "emailsender")
3. Init DAL → connect to PG → set search_path
4. Load config from emailsender.config table via ConfigLoader
5. Read NATS_URL, SERVICE_CODE, SERVICE_BASE_URL, HTTP_PORT, BREVO_API_ENDPOINT from config
6. Connect to NATS
7. Register service via NATS
8. Start HTTP server on configured port
```

**Code changes in `index.ts`:**

Before:
```typescript
const env = requireEnv({
  DATABASE_URL: { required: true, ... },
  BREVO_API_KEY: { required: true, ... },
  WEBHOOK_API_KEY: { required: true, ... },
  DB_SCHEMA: { required: false, default: "emailsender" },
  NATS_URL: { required: false, default: "nats://127.0.0.1:4222" },
  BREVO_API_ENDPOINT: { required: false, default: "https://api.brevo.com/v1" },
  SERVICE_CODE: { required: false, default: "EMAILSENDER" },
  SERVICE_BASE_URL: { required: false, default: "http://localhost:3003" },
  HTTP_PORT: { required: false, default: "3003" },
});
```

After:
```typescript
// Only true ENV primitives — everything else comes from config table
const env = requireEnv({
  DATABASE_URL: { required: true, description: "PostgreSQL connection string" },
  DB_SCHEMA: { required: false, default: "emailsender", description: "Database schema name" },
});

// ... init DAL, load config ...

// Read everything else from config table
const natsUrl = configLoader.require("nats_url");
const serviceCode = configLoader.require("service_code");
const serviceBaseUrl = configLoader.require("service_base_url");
const httpPort = parseInt(configLoader.require("http_port"), 10);
const brevoApiEndpoint = configLoader.get("brevo_api_endpoint") ?? "https://api.brevo.com/v1";
// BREVO_API_KEY comes from providers table at runtime (already implemented)
```

**SDK changes needed:**
- `NatsClient.getConnection()` — currently reads `process.env.NATS_URL`. Must accept
  the URL as a parameter instead: `NatsClient.getConnection(natsUrl)`.
  This is a small SDK change: add an optional `url?: string` param that
  overrides the ENV default.

### 2.5 SQL — seed config table with microservice config

**New config keys to INSERT into `emailsender.config`:**

| key | value (Docker) | value (local dev) | description |
|-----|---------------|-------------------|-------------|
| `nats_url` | `nats://primebrick-nats:4222` | `nats://127.0.0.1:4222` | NATS server URL |
| `service_code` | `EMAILSENDER` | `EMAILSENDER` | Microservice identifier |
| `service_base_url` | `http://primebrick-emailsender:3003` | `http://localhost:3003` | Service base URL for NATS registration |
| `http_port` | `3003` | `3003` | HTTP server internal port |
| `brevo_api_endpoint` | `https://api.brevo.com/v1` | `https://api.brevo.com/v1` | Brevo API endpoint |

**Note:** `brevo_api_key` is NOT in the config table — it comes from the
`emailsender.providers` table at runtime (per-provider credentials, already
implemented in `EmailService`).

**Note:** Auth config keys (`auth_mode`, `auth_roles_path`, `gateway_secret`,
etc.) are already in the config table — not touched by this plan.

#### Initial patch file (for new databases)

**Repo:** `primebrick-us-v3/emailsender`

**File:** `db-meta/patches/0002_seed_microservice_config.sql` (new)

```sql
-- Seed microservice config keys into emailsender.config table.
-- These replace ENV vars that were previously passed to the container.
-- Only DATABASE_URL and DB_SCHEMA remain as ENV vars (true primitives).
--
-- Values here are defaults for local dev. In Docker, override via
-- fire-and-forget script or manual UPDATE after deployment.

INSERT INTO "emailsender"."config" ("key", "value", "label_key", "description_key", "created_by", "updated_by")
VALUES
  ('nats_url', 'nats://127.0.0.1:4222', 'config.nats_url.label', 'config.nats_url.description', 'system', 'system'),
  ('service_code', 'EMAILSENDER', 'config.service_code.label', 'config.service_code.description', 'system', 'system'),
  ('service_base_url', 'http://localhost:3003', 'config.service_base_url.label', 'config.service_base_url.description', 'system', 'system'),
  ('http_port', '3003', 'config.http_port.label', 'config.http_port.description', 'system', 'system'),
  ('brevo_api_endpoint', 'https://api.brevo.com/v1', 'config.brevo_api_endpoint.label', 'config.brevo_api_endpoint.description', 'system', 'system')
ON CONFLICT ("key") DO NOTHING;
```

**Note:** The `ON CONFLICT ("key") DO NOTHING` requires a unique constraint
on the `key` column. The existing `emailsender.config` table has a
`@Unique()` on `key` in the entity, but we need to verify the unique index
exists in the DDL. If not, add it in this patch:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS "emailsender_config_key_uq"
  ON "emailsender"."config" ("key") WHERE deleted_at IS NULL;
```

#### Fire-and-forget script (for existing databases)

**Repo:** `primebrick-us-v3/emailsender`

**File:** `db-meta/fire-and-forget/seed_microservice_config.sql` (new)

```sql
-- Fire-and-forget: seed microservice config keys for existing databases.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- Run this after applying the 0002 patch or on an existing DB that lacks these keys.

-- Ensure unique index exists (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "emailsender_config_key_uq"
  ON "emailsender"."config" ("key") WHERE deleted_at IS NULL;

-- Seed config keys with local dev defaults.
-- In Docker, UPDATE these values after running this script:
--   UPDATE emailsender.config SET value = 'nats://primebrick-nats:4222' WHERE key = 'nats_url';
--   UPDATE emailsender.config SET value = 'http://primebrick-emailsender:3003' WHERE key = 'service_base_url';

INSERT INTO "emailsender"."config" ("key", "value", "label_key", "description_key", "created_by", "updated_by")
VALUES
  ('nats_url', 'nats://127.0.0.1:4222', 'config.nats_url.label', 'config.nats_url.description', 'system', 'system'),
  ('service_code', 'EMAILSENDER', 'config.service_code.label', 'config.service_code.description', 'system', 'system'),
  ('service_base_url', 'http://localhost:3003', 'config.service_base_url.label', 'config.service_base_url.description', 'system', 'system'),
  ('http_port', '3003', 'config.http_port.label', 'config.http_port.description', 'system', 'system'),
  ('brevo_api_endpoint', 'https://api.brevo.com/v1', 'config.brevo_api_endpoint.label', 'config.brevo_api_endpoint.description', 'system', 'system')
ON CONFLICT ("key") DO NOTHING;
```

### 2.4 Add .env.example for BE (bonus — not in scope but needed for Docker)

Skip — BE is not in scope.

---

## Phase 3: Dockerfiles for microservices

### 3.1 Rewrite emailsender Dockerfile for Bun

**Repo:** `primebrick-us-v3/emailsender`

**File:** `Dockerfile` (overwrite existing)

```dockerfile
# ─── Builder stage ─────────────────────────────────────────────────────
FROM oven/bun:1.1.0-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm (Bun image doesn't include it by default)
RUN npm install -g pnpm

# Install dependencies (from npmjs — no workspace context needed)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm run build

# ─── Production stage ──────────────────────────────────────────────────
FROM oven/bun:1.1.0-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3003

# Health check — uses Bun's built-in fetch
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3003/health').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"

# Start with Bun runtime
CMD ["bun", "dist/index.js"]
```

### 3.2 Create .dockerignore for emailsender

**Repo:** `primebrick-us-v3/emailsender`

**File:** `.dockerignore` (new)

```
node_modules
dist
.env
.env.local
*.log
.git
.gitignore
test
__tests__
*.test.ts
vitest.config.ts
README.md
```

### 3.3 Microservice Dockerfile template (for future microservices)

**Location:** `primebrick-us-v3/docker-templates/Dockerfile.microservice` (new)

A reusable template for future microservices:

```dockerfile
# ─── Builder stage ─────────────────────────────────────────────────────
FROM oven/bun:1.1.0-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ─── Production stage ──────────────────────────────────────────────────
FROM oven/bun:1.1.0-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
# Internal port is always 3003 — comes from config table, not ENV.
# Host port mapping is handled by Terraform.
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3003/health').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "dist/index.js"]
```

---

## Phase 4: Terraform orchestration for microservices

### Architecture: shared infra (existing docker-compose) + microservices (Terraform)

```
primebrick-be-v3/infra/                   ← existing shared infrastructure (NOT renamed, NOT moved)
  docker-compose.postgres.yml             ← EDIT: add shared network (PG + Casdoor + NATS)
  containers: primebrick-postgres-18, primebrick-nats, primebrick-casdoor
  network: primebrick-infra-net (bridge)  ← NEW: added to existing compose file

primebrick-us-v3/
  terraform/                              ← Terraform orchestration for microservices
    main.tf                               ← Docker provider + microservice container resources
    variables.tf                          ← all names/ports/connections are variables (no hardcoding)
    terraform.tfvars.example              ← example values for local dev
  emailsender/
    Dockerfile                            ← Bun-based image (built before terraform apply)
```

**The existing `primebrick-be-v3/infra/` directory is NOT renamed or moved.**
The only change to BE is an edit to the existing
`infra/docker-compose.postgres.yml` to add a shared Docker network
(`primebrick-infra-net`) so microservice containers can join it. No other
BE files are touched.

**Terraform** orchestrates microservice containers. It reads the infra
network name as a `data` source (not hardcoded), starts each microservice
container on that network, and passes connection strings as variables.
Every name, port, and connection string is a Terraform variable — zero
hardcoding.

**Dev mode** (local, no Docker for the service itself):
- Start infra: `docker compose -f infra/docker-compose.postgres.yml up -d` (from BE repo)
- Start microservice: `cd emailsender && bun --watch src/index.ts`
- Terminal output is visible (Bun runs in foreground)
- Connects to infra via `localhost:5432` (PG), `localhost:4222` (NATS)

**Docker mode** (Terraform-managed):
- Start infra: `docker compose -f infra/docker-compose.postgres.yml up -d` (from BE repo)
- Build images: `cd emailsender && docker build -t primebrick/emailsender .`
- Apply: `cd terraform && terraform apply`
- Terraform starts the container, joins the infra network, passes env vars

| Layer | Tool | What it manages |
|-------|------|----------------|
| Infra | docker-compose (existing, in BE `infra/`) | PG, Casdoor, NATS, network, volumes |
| Microservices | Terraform (Docker provider, in US `terraform/`) | Microservice containers, env vars, ports |
| BE (next phase) | Terraform | BE container + eventually infra too |

### 4.0 Edit existing BE infra docker-compose to add shared network

**Repo:** `primebrick-be-v3`

**Only change to BE:** edit the existing `infra/docker-compose.postgres.yml`
to add a shared Docker network. No directory rename, no file moves, no
other BE files touched.

**File:** `primebrick-be-v3/infra/docker-compose.postgres.yml` (edit existing)

**Changes:**
1. Add a `networks` section at the bottom of the compose file:
```yaml
networks:
  primebrick-infra-net:
    name: primebrick-infra-net
    driver: bridge
```

2. Attach all existing infra services to the network:
```yaml
services:
  postgres:
    # ... existing config unchanged ...
    networks:
      - primebrick-infra-net
  nats:
    # ... existing config unchanged ...
    networks:
      - primebrick-infra-net
  casdoor:
    # ... existing config unchanged ...
    networks:
      - primebrick-infra-net
```

**That's it.** No `git mv`, no `AGENTS.md` changes, no new directories.
The existing `infra/docker-compose.postgres.yml` path stays the same.
Container names (`primebrick-postgres-18`, `primebrick-nats`,
`primebrick-casdoor`) are unchanged.

### 4.1 Create Terraform configuration for microservices

**Repo:** `primebrick-us-v3`

**Directory:** `terraform/` (new)

#### `terraform/variables.tf`

All names, ports, and connection strings are variables — nothing is hardcoded:

```hcl
# ─── Infrastructure connection (from primebrick-infra docker-compose) ──
variable "infra_network_name" {
  description = "Name of the Docker network created by primebrick-infra docker-compose"
  type        = string
  default     = "primebrick-infra-net"
}

variable "postgres_host" {
  description = "PostgreSQL host (container name on the infra network)"
  type        = string
  default     = "primebrick-postgres-18"
}

variable "postgres_port" {
  description = "PostgreSQL port (inside the Docker network)"
  type        = number
  default     = 5432
}

variable "postgres_user" {
  description = "PostgreSQL user"
  type        = string
  default     = "primebrick"
}

variable "postgres_password" {
  description = "PostgreSQL password"
  type        = string
  default     = "primebrick_dev"
}

variable "postgres_db" {
  description = "PostgreSQL database name"
  type        = string
  default     = "primebrick"
}

# NATS_URL is NOT a Terraform variable — it comes from the config table.
# The config table is seeded with local dev defaults (nats://127.0.0.1:4222)
# and updated for Docker via fire-and-forget SQL (nats://primebrick-nats:4222).

# ─── Microservice definitions ─────────────────────────────────────────
variable "microservices" {
  description = "Map of microservices to deploy. Each key is the service code. Ports start at 4001 and increment."
  type = map(object({
    image_name     = string
    container_name = string
    host_port      = number
    internal_port  = number
    db_schema      = string
  }))
  default = {
    emailsender = {
      image_name     = "primebrick/emailsender"
      container_name = "primebrick-emailsender"
      host_port      = 4001
      internal_port  = 3003
      db_schema      = "emailsender"
    }
  }
}
```

#### `terraform/main.tf`

```hcl
terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "3.0"
    }
  }
}

provider "docker" {}

# ─── Data source: find the infra network (created by docker-compose) ────
# This is NOT hardcoded — it reads the network by name from the variable.
data "docker_network" "infra" {
  name = var.infra_network_name
}

# ─── Microservice containers ───────────────────────────────────────────
resource "docker_container" "microservice" {
  for_each = var.microservices

  name  = each.value.container_name
  image = each.value.image_name

  # Expose the microservice port on the host
  ports {
    internal = each.value.internal_port
    external = each.value.host_port
  }

  # Join the shared infra network (referenced by data source, not hardcoded)
  networks {
    network_id = data.docker_network.infra.id
  }

  # Environment variables — ONLY true primitives that can't come from config table.
  # DATABASE_URL: needed before DB connection (chicken-and-egg)
  # DB_SCHEMA: needed before first query (structural)
  # Everything else (NATS_URL, SERVICE_CODE, SERVICE_BASE_URL, HTTP_PORT,
  # BREVO_API_ENDPOINT) comes from the emailsender.config table at startup.
  env = [
    "DATABASE_URL=postgresql://${var.postgres_user}:${var.postgres_password}@${var.postgres_host}:${var.postgres_port}/${var.postgres_db}",
    "DB_SCHEMA=${each.value.db_schema}",
    "NODE_ENV=production",
  ]

  restart = "unless-stopped"

  # Healthcheck
  healthcheck {
    test     = ["CMD-SHELL", "bun -e \"fetch('http://localhost:${each.value.internal_port}/health').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))\""]
    interval = "30s"
    timeout  = "10s"
    retries  = 3
  }
}
```

**Note on env vars:** Only `DATABASE_URL`, `DB_SCHEMA`, and `NODE_ENV` are
passed as ENV vars. All other config (`nats_url`, `service_code`,
`service_base_url`, `http_port`, `brevo_api_endpoint`) is read from the
`emailsender.config` table at startup (see section 2.4–2.5). The
`brevo_api_key` comes from the `emailsender.providers` table at runtime.

**Post-deploy config UPDATE for Docker:** After the container starts and
the DB patch runs, the config table will have local dev defaults. For
Docker deployments, run a one-shot SQL update (or include it in the
fire-and-forget scripts) to set Docker-appropriate values:

```sql
UPDATE emailsender.config SET value = 'nats://primebrick-nats:4222' WHERE key = 'nats_url';
UPDATE emailsender.config SET value = 'http://primebrick-emailsender:3003' WHERE key = 'service_base_url';
```

#### `terraform/terraform.tfvars.example`

```hcl
# ─── Infrastructure (defaults match primebrick-infra docker-compose) ───
# Override only if you changed the infra compose defaults.
# infra_network_name = "primebrick-infra-net"
# postgres_host      = "primebrick-postgres-18"
# Note: nats_host is NOT a Terraform var — NATS URL comes from config table.

# ─── Microservices ─────────────────────────────────────────────────────
# No secrets in ENV — BREVO_API_KEY comes from emailsender.providers table.
# Config values (nats_url, service_base_url, etc.) come from emailsender.config table.
# See section 2.4 for the full ENV-vs-config analysis.
microservices = {
  emailsender = {
    image_name     = "primebrick/emailsender"
    container_name = "primebrick-emailsender"
    host_port      = 4001
    internal_port  = 3003
    db_schema      = "emailsender"
  }
}
```

### 4.2 Port allocation — microservices at 4000+

Microservices are exposed on the host starting at port **4001** and incrementing:

| Microservice | Host port | Internal port |
|-------------|-----------|--------------|
| emailsender | 4001 | 3003 |
| (future) sms-sender | 4002 | 3003 |
| (future) pdf-generator | 4003 | 3003 |
| ... | 4004+ | 3003 |

**Why 4000+?**
- No conflict with BE (3001), FE (5173), or infra (5432, 4222, 8000)
- Clear visual separation: 4xxx = microservices
- Incremental — each new microservice takes the next available port

**Note:** Internal port is always 3003 (the microservice's HTTP_PORT).
The host port is mapped via Terraform. This means all microservices use
the same internal port, simplifying configuration.

### 4.3 Dev mode — local Bun with terminal output

For development, microservices run locally with Bun (not in Docker).
The developer sees the terminal output directly.

**Startup sequence (dev mode):**
```bash
# 1. Start shared infrastructure
cd primebrick-be-v3
docker compose -f infra/docker-compose.postgres.yml up -d

# 2. Start BE (existing, unchanged)
cd primebrick-be-v3
pnpm run dev    # tsx watch, port 3001, terminal output visible

# 3. Start microservice(s) with Bun
cd primebrick-us-v3/emailsender
bun --watch src/index.ts    # port 3003, terminal output visible
```

**Why not Docker for dev?**
- Terminal output is immediately visible (no `docker logs -f`)
- Hot reload via `bun --watch` is faster than Docker rebuild cycles
- Debugger attaches directly to the local process
- Infra containers (PG, NATS, Casdoor) are still in Docker — only the
  microservice itself runs locally

### 4.4 Docker mode — Terraform-managed deployment

For testing the Docker image or deploying to a server:

```bash
# 1. Start shared infrastructure
cd primebrick-be-v3
docker compose -f infra/docker-compose.postgres.yml up -d

# 2. Build microservice Docker image
cd primebrick-us-v3/emailsender
docker build -t primebrick/emailsender .

# 3. Deploy via Terraform
cd primebrick-us-v3/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in secrets
terraform init
terraform plan    # review what will be created
terraform apply   # start the microservice container

# 4. Verify
curl http://localhost:4001/health

# 5. Tear down
terraform destroy
```

### 4.5 Adding a new microservice

To add a new microservice (e.g., `sms-sender`):

1. Create the microservice directory: `primebrick-us-v3/sms-sender/`
2. Create its `Dockerfile` (from the template in Phase 3.3)
3. Build the image: `cd sms-sender && docker build -t primebrick/sms-sender .`
4. Add it to `terraform.tfvars`:
```hcl
microservices = {
  emailsender = { ... },
  sms-sender = {
    image_name     = "primebrick/sms-sender"
    container_name = "primebrick-sms-sender"
    host_port      = 4002
    internal_port  = 3003
    db_schema      = "sms_sender"
    service_code   = "SMS_SENDER"
    env = {
      TWILIO_API_KEY = "your_twilio_key"
    }
  }
}
```
5. `terraform apply` — Terraform starts the new container alongside the existing one

No changes to `main.tf` or `variables.tf` — the `for_each` over the
`microservices` map handles it automatically.

---

## Phase 5: Verification

### 5.1 Local verification (without Docker)

1. `cd primebrick-us-v3/emailsender`
2. `pnpm install` — verify deps from npmjs install cleanly
3. `pnpm run build` — verify tsc compiles
4. `bun dist/index.js` — verify service starts with Bun
5. `curl http://localhost:3003/health` — verify health endpoint
6. `pnpm run test` — verify all tests pass

### 5.2 Docker + Terraform verification

1. Start shared infrastructure (from BE repo, existing path unchanged):
   ```
   cd primebrick-be-v3
   docker compose -f infra/docker-compose.postgres.yml up -d
   docker compose -f infra/docker-compose.postgres.yml ps  # all healthy
   ```
2. Build the microservice image:
   ```
   cd primebrick-us-v3/emailsender
   docker build -t primebrick/emailsender .
   ```
3. Deploy via Terraform:
   ```
   cd primebrick-us-v3/terraform
   cp terraform.tfvars.example terraform.tfvars  # fill in secrets
   terraform init
   terraform plan    # review
   terraform apply   # start container
   ```
4. `curl http://localhost:4001/health` — verify emailsender responds (port 4001, not 3003)
5. `docker logs primebrick-emailsender` — verify NATS registration works
6. `terraform destroy` — stop microservice
7. `docker compose -f ../primebrick-be-v3/infra/docker-compose.postgres.yml down` — stop infra

### 5.3 npm publishing verification

1. `npm view @primebrick/sdk` — verify package is on npmjs
2. `npm view @primebrick/dal-pg` — verify package is on npmjs
3. `npm view @primebrick/sdk@prerelease` — verify prerelease tag exists (after develop publish)

---

## Acceptance Criteria

- [ ] SDK published to npmjs as `@primebrick/sdk`
- [ ] DAL published to npmjs as `@primebrick/dal-pg`
- [ ] US/emailsender `package.json` uses npm version ranges (no `file:` refs)
- [ ] US/emailsender dev script uses `bun --watch` (no `tsx`)
- [ ] US/emailsender start script uses `bun dist/index.js` (no `node`)
- [ ] US/emailsender Dockerfile uses `oven/bun:1.1.0-alpine` base image (pinned, not `latest`)
- [ ] US/emailsender Docker build succeeds without workspace context
- [ ] BE `infra/docker-compose.postgres.yml` edited to add `primebrick-infra-net` network (no rename, no new dirs)
- [ ] No other BE files modified
- [ ] `primebrick-us-v3/terraform/` directory created with `main.tf`, `variables.tf`, `terraform.tfvars.example`
- [ ] Terraform uses `data "docker_network"` to reference infra network (not hardcoded)
- [ ] Only DATABASE_URL and DB_SCHEMA passed as ENV vars (everything else from config table)
- [ ] Config table seeded with microservice config keys (patch 0002 + fire-and-forget)
- [ ] WEBHOOK_API_KEY removed from requireEnv (dead code)
- [ ] NatsClient.getConnection() accepts URL parameter (not ENV-only)
- [ ] Docker image name: `primebrick/emailsender` (slash-separated, lowercase)
- [ ] Container name: `primebrick-emailsender` (hyphen-separated, lowercase)
- [ ] Microservice host port: 4001 (first in the 4000+ range)
- [ ] `terraform plan` shows correct container resource
- [ ] `terraform apply` starts the container on the infra network
- [ ] `curl http://localhost:4001/health` returns 200
- [ ] `terraform destroy` cleanly removes the container
- [ ] Dev mode: `bun --watch src/index.ts` runs locally with terminal output
- [ ] All US unit tests pass (`pnpm run test`)
- [ ] GitFlow versioning documented (prerelease for develop, stable for main)
- [ ] .dockerignore created for emailsender

---

## Out of Scope (next phases)

- BE Dockerfile or Bun migration (BE stays on Node + tsx) — next phase
- BE Terraform orchestration (BE stays on docker-compose for infra) — next phase
- Renaming or moving BE `infra/` directory — not doing this
- FE Dockerfile or Bun migration (FE stays on Vite/Node)
- CI/CD pipeline setup (GitHub Actions for auto-publish)
- Verdaccio local registry (using real npmjs instead)
