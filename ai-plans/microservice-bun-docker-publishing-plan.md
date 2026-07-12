# Plan: Microservice Bun Runtime + Docker + npm Publishing Workflow

## Scope

**Microservices only** (US repo — `primebrick-us-v3/emailsender` and future microservices).
BE and FE are NOT touched by this plan.

## Objectives

1. **Switch microservice runtime from Node to Bun** — dev (`bun --hot`, soft reload) and production (`bun dist/index.js`)
2. **Create Dockerfiles for microservices** — multi-stage builds using `oven/bun` base image (Phase 3A = BUILD)
3. **Automate Docker image BUILD via GitHub Actions** — triggers on GitFlow close release/hotfix (git tag push), same pattern as SDK/DAL npm publishing
4. **Per-microservice Terraform for container RELEASE** — dynamic port allocation, deploy scripts (Phase 3B = RELEASE)
5. **Docker Compose Watch dev mode** — hot reload in Docker without rebuilds (bun --hot + Compose Watch)
6. **Publish SDK + DAL to npmjs** — replace `file:` dependencies with versioned npm packages
7. **GitFlow-based versioning** — version-sync.mjs auto-updates package.json on release/hotfix branches; Docker image tag matches git tag

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
    "dev": "bun --hot src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "bun scripts/database-patch-apply.ts"
  }
}
```

**Notes:**
- `bun --hot` replaces `tsx watch` — native Bun hot reload
  - `--hot` does **soft reload** (re-evaluates changed modules without
    restarting the process). HTTP server stays running, connections are
    preserved, `globalThis` state survives. This is better than `--watch`
    (hard restart) for HTTP servers.
  - Reference: https://bun.sh/docs/runtime/watch-mode
- `bun build` replaces `tsc` — Bun's bundler (faster, produces single bundle)
  - Alternative: keep `tsc` for type-checking, use `bun dist/index.js` for runtime
  - Decision: **keep `tsc` for build** (type safety), use `bun dist/index.js` for runtime
- `bun dist/index.js` replaces `node dist/index.js` — Bun runtime
- Remove `tsx` from devDependencies (no longer needed)

**Revised scripts (keep tsc for type safety):**
```json
{
  "scripts": {
    "dev": "bun --hot src/index.ts",
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
| `BREVO_API_KEY` | ENV (required) | **→ providers table** | EmailService reads `api_key` from `emailsender.providers` table at runtime; admin sets it via FE (POST/PUT /api/v1/providers). Seeded with placeholder `CHANGE_ME_ADMIN_MUST_SET_VIA_FE` |
| `BREVO_API_ENDPOINT` | ENV (default "https://api.brevo.com/v1") | **→ config table** | Default endpoint, configurable per environment |
| `SERVICE_CODE` | ENV (default "EMAILSENDER") | **→ config table** | Microservice identity, belongs in config |
| `SERVICE_BASE_URL` | ENV (default "http://localhost:3003") | **STAYS ENV** (exception) | Dynamic host port allocated at deploy time by deploy script; can't be in config table (changes every deployment). Must be the EXPOSED URL (`http://localhost:{host_port}`), not internal Docker URL. See section 3B.2 for full analysis. |
| `HTTP_PORT` | ENV (default "3003") | **→ config table** | Always 3003 internally; host port mapping is Docker/Terraform |
| `WEBHOOK_API_KEY` | ENV (required!) | **REMOVE** | Dead code — defined in `requireEnv` but never read; webhook auth uses `public.api_keys` table |

**Startup sequence after migration:**
```
1. Read DATABASE_URL from ENV (true primitive — needed before DB)
2. Read DB_SCHEMA from ENV (default: "emailsender" — needed before first query)
3. Read SERVICE_BASE_URL from ENV (default: "http://localhost:3003" — dynamic host port)
4. Init DAL → connect to PG → set search_path
5. Load config from emailsender.config table via ConfigLoader
6. Read NATS_URL, SERVICE_CODE, HTTP_PORT, BREVO_API_ENDPOINT from config table
7. Connect to NATS (using nats_url from config table)
8. Register service via NATS (using service_base_url from ENV)
9. Start HTTP server on configured port (http_port from config table)
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
// ENV vars: 3 only (true primitives + SERVICE_BASE_URL exception)
const env = requireEnv({
  DATABASE_URL: { required: true, description: "PostgreSQL connection string" },
  DB_SCHEMA: { required: false, default: "emailsender", description: "Database schema name" },
  SERVICE_BASE_URL: { required: false, default: "http://localhost:3003", description: "Exposed URL for BE proxy routing (dynamic host port in Docker)" },
});

// ... init DAL, load config ...

// Read everything else from config table
const natsUrl = configLoader.require("nats_url");
const serviceCode = configLoader.require("service_code");
const httpPort = parseInt(configLoader.require("http_port"), 10);
const brevoApiEndpoint = configLoader.get("brevo_api_endpoint") ?? "https://api.brevo.com/v1";
// SERVICE_BASE_URL comes from ENV (not config table) — see section 3B.2
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
| `http_port` | `3003` | `3003` | HTTP server internal port |
| `brevo_api_endpoint` | `https://api.brevo.com/v1` | `https://api.brevo.com/v1` | Brevo API endpoint |

**NOT in config table:** `service_base_url` — stays as ENV var because the
host port is dynamic (allocated by deploy script at deploy time). See
section 3B.2 for the full analysis.

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
-- Only DATABASE_URL, DB_SCHEMA, and SERVICE_BASE_URL remain as ENV vars.
-- SERVICE_BASE_URL stays as ENV because the host port is dynamic (set by
-- deploy script at deploy time) and can't be known when seeding the config table.

INSERT INTO "emailsender"."config" ("key", "value", "label_key", "description_key", "created_by", "updated_by")
VALUES
  ('nats_url', 'nats://127.0.0.1:4222', 'config.nats_url.label', 'config.nats_url.description', 'system', 'system'),
  ('service_code', 'EMAILSENDER', 'config.service_code.label', 'config.service_code.description', 'system', 'system'),
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
-- In Docker, UPDATE nats_url after running this script:
--   UPDATE emailsender.config SET value = 'nats://primebrick-nats:4222' WHERE key = 'nats_url';
-- Note: service_base_url is NOT in config table — it stays as ENV var
-- (dynamic host port set by deploy script).

INSERT INTO "emailsender"."config" ("key", "value", "label_key", "description_key", "created_by", "updated_by")
VALUES
  ('nats_url', 'nats://127.0.0.1:4222', 'config.nats_url.label', 'config.nats_url.description', 'system', 'system'),
  ('service_code', 'EMAILSENDER', 'config.service_code.label', 'config.service_code.description', 'system', 'system'),
  ('http_port', '3003', 'config.http_port.label', 'config.http_port.description', 'system', 'system'),
  ('brevo_api_endpoint', 'https://api.brevo.com/v1', 'config.brevo_api_endpoint.label', 'config.brevo_api_endpoint.description', 'system', 'system')
ON CONFLICT ("key") DO NOTHING;
```

---

## Phase 3A: BUILD — Dockerfiles for microservices

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

### 3.4 Fix US version-sync (prerequisite for versioned Docker images)

**Problem (empirically verified):** The US repo has a pre-commit hook at
`.githooks/pre-commit` that runs `node scripts/version-sync.mjs`, but
**this file does not exist** in the US repo. The hook is broken.

**Comparison with other repos:**

| Repo | Has `version-sync.mjs`? | Has pre-commit hook? | Has CI/CD? |
|------|------------------------|---------------------|-----------|
| SDK | No (manual version) | No | Yes — GitHub Actions on tag push → npm publish |
| DAL | Yes (`scripts/version-sync.mjs`) | Yes | Yes — GitHub Actions on tag push → npm publish |
| BE | Yes (`scripts/version-sync.mjs`) | Yes | No |
| US | **NO — broken hook** | Yes (references non-existent file) | No |

**Fix:** Create `scripts/version-sync.mjs` in the US repo, based on the
DAL implementation (simpler, parses version from branch name). This is
the same pattern: on `release/X.Y.Z` or `hotfix/X.Y.Z` branches, the
script syncs `package.json` version to match the branch name. On
`develop`/`main`/`feature/` branches, it exits silently.

**Repo:** `primebrick-us-v3`

**File:** `scripts/version-sync.mjs` (new — copy from DAL and adapt)

**Also:** Add `version:auto` and `prebuild` scripts to `emailsender/package.json`:
```json
{
  "scripts": {
    "version:auto": "node scripts/version-sync.mjs",
    "prebuild": "node scripts/version-sync.mjs",
    "dev": "bun --hot src/index.ts",
    "build": "tsc",
    ...
  }
}
```

**Note:** This script lives at the US repo root (`primebrick-us-v3/scripts/`),
not per-microservice. Each microservice's `package.json` references it
via `node scripts/version-sync.mjs` (relative to repo root when run from
root, or via `pnpm --filter` workspace). The script reads the
microservice's own `package.json` and updates its version field.

### 3.5 GitHub Actions — BUILD workflow (Docker image publish)

**Trigger:** Git tag push matching `[0-9]+.[0-9]+.[0-9]+` (same pattern
as SDK/DAL workflows). This fires when a release or hotfix is closed
and the tag is pushed to `main`.

**Repo:** `primebrick-us-v3`

**File:** `.github/workflows/build-docker.yml` (new)

```yaml
name: Build & Publish Docker Image

on:
  push:
    tags:
      - "[0-9]+.[0-9]+.[0-9]+"

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Extract version from tag
        id: version
        run: echo "VERSION=${GITHUB_REF_NAME}" >> $GITHUB_OUTPUT

      - name: Build & push emailsender image
        uses: docker/build-push-action@v6
        with:
          context: ./emailsender
          push: true
          tags: |
            primebrick/emailsender:${{ steps.version.outputs.VERSION }}
            primebrick/emailsender:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**How it works:**
1. Developer closes a release/hotfix branch (GitFlow) → merges to `main`
2. Developer tags `main` with the version (e.g., `git tag 0.2.0`)
3. Developer pushes the tag: `git push --tags`
4. GitHub Actions triggers on the tag push
5. Workflow extracts version from tag name (`${GITHUB_REF_NAME}`)
6. Builds the Docker image: `docker build -t primebrick/emailsender:0.2.0 ./emailsender`
7. Also tags as `primebrick/emailsender:latest` (convenience for local dev)
8. Pushes both tags to Docker Hub
9. Uses GitHub Actions cache (`type=gha`) for fast rebuilds

**Version flow (same as SDK/DAL):**
```
GitFlow close release/hotfix
  → git tag 0.2.0 (pushed to main)
  → GitHub Actions triggers
  → version-sync.mjs already updated package.json to 0.2.0 (on pre-build)
  → Docker image tagged as primebrick/emailsender:0.2.0
  → Docker image also tagged as primebrick/emailsender:latest
```

**Note:** The Dockerfile itself does NOT contain the version. The
version is applied at `docker build -t primebrick/emailsender:0.2.0 .`
time by the CI workflow. The `package.json` version inside the image
matches the tag (thanks to `version-sync.mjs` running as `prebuild`).

**Note:** `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` must be set as
GitHub Actions secrets in the US repo settings. This is a one-time
setup step.

**Note:** This workflow builds ALL microservices in the US repo. When a
second microservice is added (e.g., `sms-sender`), add another
`docker/build-push-action` step for it. All microservices share the
same git tag (the US repo is versioned as a whole, not per-microservice).

---

## Phase 3B: RELEASE — Terraform orchestration (per-microservice)

### BUILD vs RELEASE — two distinct phases

The Docker pipeline has two completely decoupled phases:

**Phase 3A — BUILD** (produces the Docker image):
```
GitFlow close release/hotfix → git tag → version-sync.mjs updates package.json
  → GitHub Actions triggers on tag push → tsc compile → docker build → docker push
```
- Input: source code + Dockerfile + git tag (version)
- Output: published Docker image (e.g. `primebrick/emailsender:0.2.0`)
- **When: on CLOSE RELEASE or CLOSE HOTFIX** (GitFlow — see `docs/gitflow.md`)
  - Same trigger as SDK/DAL npm publishing: git tag push
  - The git tag version becomes both the package.json version AND the Docker image tag
- **Automated via GitHub Actions** (new workflow — see section 3A.4)
- **Does NOT start anything** — only produces and publishes the image
- Can run without a running infrastructure (no PG/NATS needed)

**Phase 3B — RELEASE** (creates and starts the container):
```
Docker image (from registry) → find available port → terraform apply → running container
```
- Input: published Docker image + Terraform config + available port
- Output: container running on the infra network
- When: on deploy (manual or CD)
- Command: `./scripts/deploy.ps1` (or `./scripts/deploy.sh`) which:
  1. Finds the first available port 4000+ via `find-available-port` script
  2. Runs `terraform apply -var="host_port=$PORT"`
- **Requires running infrastructure** (PG, NATS, Casdoor must be up)
- Can deploy an existing image without rebuilding

**Three modes of operation:**

| Mode | Tool | Hot reload | When |
|------|------|-----------|------|
| **Dev (local)** | `bun --hot src/index.ts` | Yes — soft reload, preserves HTTP server | Daily development |
| **Dev (Docker)** | Docker Compose Watch + `bun --hot` | Yes — Compose Watch syncs files, `--hot` reloads | Testing in Docker env without rebuild |
| **Prod** | Terraform (Phase 3B) | No — immutable container | Production deployment |

These phases are **fully decoupled**:
- BUILD without RELEASE = image published but not deployed (e.g. CI on tag push)
- RELEASE without BUILD = deploy an existing image (e.g. rollback to previous version)
- BUILD runs in CI (GitHub Actions on tag push), RELEASE runs manually or in CD

### Architecture: shared infra (existing docker-compose) + microservices (per-service Terraform)

```
primebrick-be-v3/infra/                   ← existing shared infrastructure (NOT renamed, NOT moved)
  docker-compose.postgres.yml             ← EDIT: add shared network (PG + Casdoor + NATS)
  containers: primebrick-postgres-18, primebrick-nats, primebrick-casdoor
  network: primebrick-infra-net (bridge)  ← NEW: added to existing compose file

primebrick-us-v3/
  emailsender/                            ← each microservice is self-contained
    Dockerfile                            ← Bun-based image (Phase 3A = BUILD)
    terraform/                            ← Per-microservice Terraform (Phase 3B = RELEASE)
      main.tf                             ← ONE docker_container (no for_each)
      variables.tf                        ← this microservice's variables only
      terraform.tfvars.example
      scripts/
        find-available-port.ps1           ← Windows: Get-NetTCPConnection
        find-available-port.sh            ← Mac/Linux: lsof / ss / netstat
        deploy.ps1                        ← Windows wrapper: find port + terraform apply
        deploy.sh                         ← Unix wrapper: find port + terraform apply
```

**Key principle: each microservice has its own vertical Terraform.**
A third-party module copies the `terraform/` boilerplate, changes
`container_name` / `image_name` / `db_schema`, and runs `deploy.sh`.
No dependency on other microservices' Terraform state.

**The existing `primebrick-be-v3/infra/` directory is NOT renamed or moved.**
The only change to BE is an edit to the existing
`infra/docker-compose.postgres.yml` to add a shared Docker network
(`primebrick-infra-net`) so microservice containers can join it. No other
BE files are touched.

**Terraform** orchestrates one microservice container per Terraform
directory. It reads the infra network name as a `data` source (not
hardcoded), starts the container on that network, and passes connection
strings as variables. Every name, port, and connection string is a
Terraform variable — zero hardcoding.

**Dev mode** (local, no Docker for the service itself):
- Start infra: `docker compose -f infra/docker-compose.postgres.yml up -d` (from BE repo)
- Start microservice: `cd emailsender && bun --hot src/index.ts`
- Terminal output is visible (Bun runs in foreground)
- Connects to infra via `localhost:5432` (PG), `localhost:4222` (NATS)
- `SERVICE_BASE_URL` defaults to `http://localhost:3003` (no ENV needed)

**Docker mode** (Terraform-managed):
- Start infra: `docker compose -f infra/docker-compose.postgres.yml up -d` (from BE repo)
- Build image: `cd emailsender && docker build -t primebrick/emailsender .` (Phase 3A)
- Deploy: `cd emailsender/terraform && ./scripts/deploy.ps1` (Phase 3B)
- The deploy script finds an available port and runs `terraform apply`

| Layer | Tool | What it manages |
|-------|------|----------------|
| Infra | docker-compose (existing, in BE `infra/`) | PG, Casdoor, NATS, network, volumes |
| Microservices | Terraform (Docker provider, per-service) | One container + env vars + port mapping |
| BE (next phase) | Terraform | BE container + eventually infra too |

### 3B.0 Edit existing BE infra docker-compose to add shared network

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

### 3B.1 Dynamic port allocation — cross-platform scripts

**Problem:** Microservices can come from the main Primebrick project or
from third-party modules. Port assignments can't be predicted in advance
— each microservice must find its own available port at deploy time.

**Solution:** Cross-platform scripts that find the first available port
starting from 4000. The deploy wrapper passes this port to Terraform as
a variable.

**Why 4000+?**
- No conflict with BE (3001), FE (5173), or infra (5432, 4222, 8000)
- Clear visual separation: 4xxx = microservices
- No pre-allocation table needed — each deploy finds the next free port

**Repo:** `primebrick-us-v3/emailsender/terraform/scripts/`

#### `find-available-port.ps1` (Windows)

Uses `Get-NetTCPConnection` (available on Windows 8+/Server 2012+):

```powershell
# find-available-port.ps1
# Finds the first available TCP port starting from 4000.
# Outputs the port number to stdout (no other output).
# Exit code 0 = success, 1 = no port found in range.

$StartPort = 4000
$EndPort = 4999

# Get all listening ports in the range
$listening = @()
try {
    $listening = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -ge $StartPort -and $_.LocalPort -le $EndPort } |
        Select-Object -ExpandProperty LocalPort
} catch {
    # Get-NetTCPConnection not available or no connections — start from $StartPort
}

for ($port = $StartPort; $port -le $EndPort; $port++) {
    if ($listening -notcontains $port) {
        Write-Output $port
        exit 0
    }
}

Write-Error "No available port in range $StartPort-$EndPort"
exit 1
```

#### `find-available-port.sh` (Mac/Linux)

Uses `lsof` (Mac, always available) or `ss` (Linux, modern) with
fallback to `netstat`:

```bash
#!/usr/bin/env bash
# find-available-port.sh
# Finds the first available TCP port starting from 4000.
# Outputs the port number to stdout (no other output).
# Exit code 0 = success, 1 = no port found in range.

set -euo pipefail

START_PORT=4000
END_PORT=4999

# Collect listening ports in the range
get_listening_ports() {
    if command -v ss &>/dev/null; then
        # Linux: ss is modern and reliable
        ss -tlnH 2>/dev/null | awk '{print $4}' | grep -oE '[0-9]+$' | sort -n
    elif command -v lsof &>/dev/null; then
        # Mac: lsof is always available
        lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | awk '{print $9}' | grep -oE '[0-9]+$' | sort -n
    elif command -v netstat &>/dev/null; then
        # Fallback: netstat (older systems)
        netstat -tln 2>/dev/null | awk '{print $4}' | grep -oE '[0-9]+$' | sort -n
    else
        # No tool available — assume all ports are free
        return 0
    fi
}

listening=$(get_listening_ports || true)

for port in $(seq $START_PORT $END_PORT); do
    if ! echo "$listening" | grep -qx "$port"; then
        echo "$port"
        exit 0
    fi
done

echo "No available port in range $START_PORT-$END_PORT" >&2
exit 1
```

#### `deploy.ps1` (Windows wrapper)

Combines port detection + Terraform apply:

```powershell
# deploy.ps1
# Phase 3B — RELEASE: deploys the microservice container.
# 1. Finds an available host port (4000+)
# 2. Constructs SERVICE_BASE_URL from the port
# 3. Runs terraform apply with the port as a variable

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = & "$scriptDir\find-available-port.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to find an available port"
    exit 1
}

Write-Host "Deploying microservice on host port $port..."
Write-Host "SERVICE_BASE_URL will be http://localhost:$port"

# The host port is the EXPOSED port (reachable from the BE on the host).
# The internal port is always 3003 (container-internal).
# SERVICE_BASE_URL must be the exposed URL because the BE proxy runs on
# the host and routes to the microservice via localhost:{host_port}.
terraform -chdir="$scriptDir\.." apply `
    -var="host_port=$port" `
    -var="service_base_url=http://localhost:$port" `
    -auto-approve
```

#### `deploy.sh` (Mac/Linux wrapper)

```bash
#!/usr/bin/env bash
# deploy.sh
# Phase 3B — RELEASE: deploys the microservice container.
# 1. Finds an available host port (4000+)
# 2. Constructs SERVICE_BASE_URL from the port
# 3. Runs terraform apply with the port as a variable

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
port=$(bash "$script_dir/find-available-port.sh")
if [ $? -ne 0 ]; then
    echo "Failed to find an available port" >&2
    exit 1
fi

echo "Deploying microservice on host port $port..."
echo "SERVICE_BASE_URL will be http://localhost:$port"

# The host port is the EXPOSED port (reachable from the BE on the host).
terraform -chdir="$script_dir/.." apply \
    -var="host_port=$port" \
    -var="service_base_url=http://localhost:$port" \
    -auto-approve
```

### 3B.2 Per-microservice Terraform configuration

**Repo:** `primebrick-us-v3/emailsender/terraform/`

Each microservice has its own `terraform/` directory with a single
`docker_container` resource (no `for_each`).

#### `terraform/variables.tf`

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
  sensitive   = true
}

variable "postgres_db" {
  description = "PostgreSQL database name"
  type        = string
  default     = "primebrick"
}

# ─── This microservice's identity ──────────────────────────────────────
variable "image_name" {
  description = "Docker image name (without tag) for this microservice"
  type        = string
  default     = "primebrick/emailsender"
}

variable "image_tag" {
  description = "Docker image tag (version). Matches the git tag from GitFlow close release/hotfix. Use 'latest' for dev, or a specific version like '0.2.0' for prod."
  type        = string
  default     = "latest"
}

variable "container_name" {
  description = "Docker container name"
  type        = string
  default     = "primebrick-emailsender"
}

variable "db_schema" {
  description = "Database schema for this microservice"
  type        = string
  default     = "emailsender"
}

variable "internal_port" {
  description = "Container-internal HTTP port (always 3003)"
  type        = number
  default     = 3003
}

# ─── Dynamic port (set by deploy script) ───────────────────────────────
variable "host_port" {
  description = "Host port to expose the microservice on. Set by deploy script (find-available-port). NOT hardcoded — found dynamically at deploy time."
  type        = number
  # No default — must be provided by deploy script
}

# ─── SERVICE_BASE_URL (ENV exception — see analysis below) ─────────────
variable "service_base_url" {
  description = "Exposed URL that the BE proxy uses to reach this microservice. Must be http://localhost:{host_port} because the BE runs on the host. Set by deploy script."
  type        = string
  # No default — must be provided by deploy script
}
```

**Why `service_base_url` is an ENV var exception:**

The microservice needs `base_url` for one purpose only: self-registration
via NATS (telling the BE proxy where to find it). The BE proxy
(`proxy-service.ts` line 107) uses `instance.base_url` to route requests:
`new URL(targetPath, instance.base_url)`.

This value **cannot** come from the config table because:
1. The host port is **dynamically allocated** at deploy time — it changes
   every deployment
2. The config table is seeded by SQL patches in the repo, which can't
   know the future host port
3. The microservice inside the container cannot discover its own host
   port mapping

The value must be the **EXPOSED URL** (`http://localhost:{host_port}`),
not the internal Docker URL (`http://{container_name}:3003`), because the
BE runs on the host and routes via `localhost:{host_port}`.

In dev mode, `SERVICE_BASE_URL` defaults to `http://localhost:3003`
(internal port, since the microservice runs locally — no Docker port
mapping). No ENV var is needed in dev mode.

**Final ENV var list (3 vars only):**
| ENV var | Why it's ENV | Set by |
|---------|-------------|--------|
| `DATABASE_URL` | Needed before DB connection (chicken-and-egg) | Terraform (from PG vars) |
| `DB_SCHEMA` | Needed before first query (structural) | Terraform (from microservice var) |
| `SERVICE_BASE_URL` | Dynamic host port, can't be in config table | Terraform (from deploy script) |

Everything else (`nats_url`, `service_code`, `http_port`,
`brevo_api_endpoint`) comes from the `emailsender.config` table (see
section 2.4–2.5).

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
data "docker_network" "infra" {
  name = var.infra_network_name
}

# ─── This microservice's container (single resource, no for_each) ───────
resource "docker_container" "microservice" {
  name  = var.container_name
  image = "${var.image_name}:${var.image_tag}"

  # Expose the microservice port on the host
  # host_port is dynamic (found by deploy script), internal_port is always 3003
  ports {
    internal = var.internal_port
    external = var.host_port
  }

  # Join the shared infra network
  networks {
    network_id = data.docker_network.infra.id
  }

  # Environment variables — only true primitives + SERVICE_BASE_URL exception.
  # Everything else comes from the emailsender.config table at startup.
  env = [
    "DATABASE_URL=postgresql://${var.postgres_user}:${var.postgres_password}@${var.postgres_host}:${var.postgres_port}/${var.postgres_db}",
    "DB_SCHEMA=${var.db_schema}",
    "SERVICE_BASE_URL=${var.service_base_url}",
    "NODE_ENV=production",
  ]

  restart = "unless-stopped"

  # Healthcheck — internal port is always 3003
  healthcheck {
    test     = ["CMD-SHELL", "bun -e \"fetch('http://localhost:3003/health').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))\""]
    interval = "30s"
    timeout  = "10s"
    retries  = 3
  }
}
```

#### `terraform/terraform.tfvars.example`

```hcl
# ─── Infrastructure (defaults match primebrick-infra docker-compose) ───
# Override only if you changed the infra compose defaults.
# infra_network_name = "primebrick-infra-net"
# postgres_host      = "primebrick-postgres-18"

# ─── PostgreSQL credentials ────────────────────────────────────────────
# Set these to match your infra docker-compose.
postgres_password = "change_me"

# ─── This microservice ─────────────────────────────────────────────────
# image_name     = "primebrick/emailsender"
# image_tag      = "latest"   # or a specific version: "0.2.0"
# container_name = "primebrick-emailsender"
# db_schema      = "emailsender"

# ─── Dynamic port + base URL ───────────────────────────────────────────
# These are set by the deploy script (deploy.ps1 / deploy.sh).
# Do NOT set them manually here — the script finds the available port
# and passes it via -var flags.
# host_port         = 4001    # set by deploy script
# service_base_url  = "http://localhost:4001"  # set by deploy script
```

### 3B.3 Port allocation — dynamic, not pre-assigned

Ports are **not pre-assigned**. Each microservice finds its own available
port at deploy time via the `find-available-port` script (see 3B.1).

**Why dynamic?**
- Microservices can come from the main project or third-party modules
- Third-party modules can't know what ports other microservices use
- Installation order is unpredictable
- No central port registry to maintain

**How it works:**
1. `find-available-port.ps1` / `.sh` scans ports 4000–4999
2. Returns the first port not in `LISTEN` state
3. Deploy script passes it to Terraform as `host_port`
4. Terraform maps `host_port` → `internal_port` (always 3003)

| Aspect | Value |
|--------|-------|
| Port range | 4000–4999 (100 available ports) |
| Internal port | Always 3003 (container-internal) |
| Host port | Dynamic, found at deploy time |
| Conflict avoidance | Script checks `LISTEN` state before assigning |

**Note:** Internal port is always 3003. All microservices use the same
internal port — the host port mapping is what differentiates them.

### 3B.4 Dev mode — local Bun with terminal output

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
bun --hot src/index.ts    # port 3003, terminal output visible
```

In dev mode, `SERVICE_BASE_URL` defaults to `http://localhost:3003`
(the microservice runs locally, no Docker port mapping). No ENV var
needed — the `requireEnv` default handles it. In Docker mode, the
deploy script passes the dynamic host port as an ENV var.

**Why not Docker for dev?**
- Terminal output is immediately visible (no `docker logs -f`)
- Hot reload via `bun --hot` is faster than Docker rebuild cycles
- Debugger attaches directly to the local process
- Infra containers (PG, NATS, Casdoor) are still in Docker — only the
  microservice itself runs locally

**`bun --hot` vs `bun --watch`** (empirically verified from Bun docs):
- `--hot`: soft reload — re-evaluates changed modules without restarting
  the process. HTTP server stays running, in-flight requests are not
  interrupted, `globalThis` state is preserved. **Best for HTTP servers.**
- `--watch`: hard restart — shuts down and restarts the entire process.
  Global state is reset. Better for scripts/CLI tools, not HTTP servers.
- Reference: https://bun.sh/docs/runtime/watch-mode

### 3B.4b Docker dev mode — Compose Watch + bun --hot

For developers who want to test the microservice inside Docker (e.g., to
verify the Dockerfile, test network connectivity to infra containers, or
reproduce a Docker-only bug) **without rebuilding the image on every
code change**.

**Problem:** Bun's `--hot` and `--watch` have known issues in Docker
with volume mounts — inotify events don't propagate reliably from host
to container (GitHub issues #14380, #5841). This affects Mac and Windows
especially.

**Solution:** Docker Compose Watch (GA in Compose v2.17+) syncs changed
files explicitly, bypassing inotify. Combined with `bun --hot` inside
the container, this gives hot reload in Docker without rebuilds.

**Repo:** `primebrick-us-v3/emailsender`

**File:** `docker-compose.dev.yml` (new — dev only, not for production)

```yaml
# Development compose file — hot reload in Docker without rebuilds.
# Usage: docker compose -f docker-compose.dev.yml up
# Requires Docker Compose v2.17+ (for `watch` feature).
#
# This file is NOT used by Terraform (prod). It's dev-only.
services:
  emailsender-dev:
    build:
      context: .
      dockerfile: Dockerfile
    # Override the prod CMD with dev mode — run from source, not dist/
    command: bun --hot src/index.ts
    ports:
      - "3003:3003"  # Direct mapping, no dynamic port needed in dev
    environment:
      DATABASE_URL: postgresql://primebrick:primebrick@primebrick-postgres-18:5432/primebrick
      DB_SCHEMA: emailsender
      SERVICE_BASE_URL: http://localhost:3003
      NODE_ENV: development
    networks:
      - primebrick-infra-net
    develop:
      watch:
        # Sync source code changes → bun --hot picks them up
        - action: sync
          path: ./src
          target: /app/src
        # Rebuild image when dependencies change
        - action: rebuild
          path: package.json
        - action: rebuild
          path: pnpm-lock.yaml

networks:
  primebrick-infra-net:
    external: true
    name: primebrick-infra-net
```

**How it works:**
1. `docker compose -f docker-compose.dev.yml up` builds the image (first
   time only) and starts the container with `bun --hot src/index.ts`
2. When you edit a file in `./src/`, Compose Watch syncs it to `/app/src/`
   inside the container (bypassing inotify)
3. Bun's `--hot` detects the file change and soft-reloads the module
4. HTTP server stays running — no restart, no connection drops
5. When you change `package.json` or `pnpm-lock.yaml`, Compose rebuilds
   the image (deps changed — needs `pnpm install`)

**When to use this vs local dev:**

| Scenario | Use |
|----------|-----|
| Daily development, fast iteration | Local `bun --hot src/index.ts` |
| Testing Dockerfile changes | `docker compose -f docker-compose.dev.yml up` |
| Reproducing Docker-only network issues | Compose Watch dev mode |
| Testing against Dockerized infra (PG, NATS) | Either — local dev also connects to Dockerized infra via `localhost` |
| Production deployment | Terraform (Phase 3B.5) |

### 3B.5 Docker mode — BUILD + RELEASE

**Phase 3A — BUILD (automated via GitHub Actions on tag push):**

Normally, BUILD is automated by the GitHub Actions workflow (section 3.5):
```
GitFlow close release/hotfix → git tag 0.2.0 → git push --tags
  → GitHub Actions triggers → builds image → pushes primebrick/emailsender:0.2.0
```

For local testing (manual build, no CI):
```bash
cd primebrick-us-v3/emailsender
docker build -t primebrick/emailsender:0.2.0 .   # version from package.json
# Or: docker build -t primebrick/emailsender:latest .  # for local dev
```

**Phase 3B — RELEASE (create and start the container):**
```bash
# 1. Start shared infrastructure (if not already running)
cd primebrick-be-v3
docker compose -f infra/docker-compose.postgres.yml up -d

# 2. Deploy the microservice
cd primebrick-us-v3/emailsender/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in postgres_password
./scripts/deploy.ps1    # Windows
# or: bash ./scripts/deploy.sh   # Mac/Linux

# The deploy script:
#   - Finds the first available port 4000+ (e.g. 4001)
#   - Runs: terraform apply -var="host_port=4001" -var="service_base_url=http://localhost:4001"

# 3. Verify
curl http://localhost:4001/health    # port may vary — check deploy script output
docker logs primebrick-emailsender   # verify NATS registration

# 4. Tear down
terraform -chdir=primebrick-us-v3/emailsender/terraform destroy
```

### 3B.6 Adding a new microservice (or third-party module)

To add a new microservice (e.g., `sms-sender`):

1. Create the microservice directory: `primebrick-us-v3/sms-sender/`
2. Create its `Dockerfile` (from the template in Phase 3A)
3. Build the image: `cd sms-sender && docker build -t primebrick/sms-sender .`
4. Copy the `terraform/` boilerplate from `emailsender/terraform/`
5. Edit `variables.tf` defaults:
```hcl
variable "image_name"     { default = "primebrick/sms-sender" }
variable "container_name" { default = "primebrick-sms-sender" }
variable "db_schema"      { default = "sms_sender" }
```
6. Deploy: `cd sms-sender/terraform && ./scripts/deploy.ps1`

**No changes to emailsender's Terraform.** Each microservice is fully
independent. A third-party module copies the boilerplate, changes 3
variables, and deploys. The deploy script finds its own available port
automatically — no port coordination needed between microservices.

---

## Phase 5: Verification

### 5.1 Local verification (without Docker)

1. `cd primebrick-us-v3/emailsender`
2. `pnpm install` — verify deps from npmjs install cleanly
3. `pnpm run build` — verify tsc compiles
4. `bun dist/index.js` — verify service starts with Bun
5. `curl http://localhost:3003/health` — verify health endpoint
6. `pnpm run test` — verify all tests pass

### 5.2 Docker + Terraform verification (BUILD + RELEASE)

1. Start shared infrastructure (from BE repo, existing path unchanged):
   ```
   cd primebrick-be-v3
   docker compose -f infra/docker-compose.postgres.yml up -d
   docker compose -f infra/docker-compose.postgres.yml ps  # all healthy
   ```
2. BUILD — produce the Docker image (versioned):
   ```
   cd primebrick-us-v3/emailsender
   docker build -t primebrick/emailsender:latest .
   # In CI, the GitHub Actions workflow does this automatically on tag push:
   #   docker build -t primebrick/emailsender:0.2.0 .
   ```
3. RELEASE — deploy via deploy script (finds port + terraform apply):
   ```
   cd primebrick-us-v3/emailsender/terraform
   cp terraform.tfvars.example terraform.tfvars  # fill in postgres_password
   ./scripts/deploy.ps1    # Windows (or: bash ./scripts/deploy.sh)
   # Note the port from script output (e.g. "Deploying on host port 4001")
   ```
4. `curl http://localhost:{port}/health` — verify emailsender responds (port from step 3)
5. `docker logs primebrick-emailsender` — verify NATS registration works
6. `terraform -chdir=primebrick-us-v3/emailsender/terraform destroy` — stop microservice
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
- [ ] US/emailsender dev script uses `bun --hot` (no `tsx`)
- [ ] US/emailsender start script uses `bun dist/index.js` (no `node`)
- [ ] US/emailsender Dockerfile uses `oven/bun:1.1.0-alpine` base image (pinned, not `latest`)
- [ ] US/emailsender Docker build succeeds without workspace context
- [ ] US `scripts/version-sync.mjs` created (fixes broken pre-commit hook)
- [ ] US `package.json` has `version:auto` and `prebuild` scripts (version-sync)
- [ ] US `.github/workflows/build-docker.yml` created (triggers on git tag push)
- [ ] GitHub Actions workflow tags Docker image with version from git tag
- [ ] GitHub Actions workflow also tags as `latest`
- [ ] BE `infra/docker-compose.postgres.yml` edited to add `primebrick-infra-net` network (no rename, no new dirs)
- [ ] No other BE files modified
- [ ] `primebrick-us-v3/emailsender/terraform/` directory created with `main.tf`, `variables.tf`, `terraform.tfvars.example`
- [ ] `primebrick-us-v3/emailsender/terraform/scripts/` contains `find-available-port.ps1`, `find-available-port.sh`, `deploy.ps1`, `deploy.sh`
- [ ] `primebrick-us-v3/emailsender/docker-compose.dev.yml` created (Compose Watch + bun --hot)
- [ ] Terraform uses `data "docker_network"` to reference infra network (not hardcoded)
- [ ] Terraform has a single `docker_container` resource (no `for_each` map)
- [ ] Terraform `image_tag` variable defaults to `latest`, overridable for prod (e.g. `0.2.0`)
- [ ] Only 3 ENV vars passed: `DATABASE_URL`, `DB_SCHEMA`, `SERVICE_BASE_URL` (everything else from config table)
- [ ] `SERVICE_BASE_URL` is the exposed URL (`http://localhost:{host_port}`), not internal Docker URL
- [ ] Config table seeded with microservice config keys (patch 0002 + fire-and-forget)
- [ ] WEBHOOK_API_KEY removed from requireEnv (dead code)
- [ ] NatsClient.getConnection() accepts URL parameter (not ENV-only)
- [ ] Docker image name: `primebrick/emailsender` (slash-separated, lowercase)
- [ ] Container name: `primebrick-emailsender` (hyphen-separated, lowercase)
- [ ] `find-available-port.ps1` finds first available port 4000+ on Windows
- [ ] `find-available-port.sh` finds first available port 4000+ on Mac/Linux
- [ ] `deploy.ps1` / `deploy.sh` combines port detection + terraform apply
- [ ] `terraform plan` shows correct container resource
- [ ] `terraform apply` (via deploy script) starts the container on the infra network
- [ ] `curl http://localhost:{port}/health` returns 200 (port from deploy script output)
- [ ] `terraform destroy` cleanly removes the container
- [ ] Dev mode (local): `bun --hot src/index.ts` runs with terminal output, soft reload on code changes
- [ ] Dev mode (Docker): `docker compose -f docker-compose.dev.yml up` — Compose Watch syncs files, bun --hot reloads
- [ ] Dev mode: `SERVICE_BASE_URL` defaults to `http://localhost:3003` (no ENV needed)
- [ ] All US unit tests pass (`pnpm run test`)
- [ ] GitFlow versioning: BUILD triggers on close release/hotfix (git tag push)
- [ ] GitFlow versioning: Docker image tag matches package.json version (via version-sync.mjs)
- [ ] .dockerignore created for emailsender

---

## Out of Scope (next phases)

- BE Dockerfile or Bun migration (BE stays on Node + tsx) — next phase
- BE Terraform orchestration (BE stays on docker-compose for infra) — next phase
- Renaming or moving BE `infra/` directory — not doing this
- FE Dockerfile or Bun migration (FE stays on Vite/Node)
- Verdaccio local registry (using real npmjs instead)
- CD (continuous deployment) — auto-running `terraform apply` on tag push.
  The BUILD (GitHub Actions → Docker image) is automated; the RELEASE
  (Terraform deploy) is manual for now. CD can be added later by having
  GitHub Actions invoke the deploy script after image push.
