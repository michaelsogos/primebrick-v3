---

# Plan: Email Providers Configuration Page + Generic Microservice Proxy + SDK Auth Refactor

## Status: DRAFT — Awaiting user approval
## Date: 2026-07-08
## Revision: 2 — Added full BE auth middleware refactor into SDK + NATS auth verification

---

## 1. Objective

Create a new frontend settings page to configure email providers (Brevo and future providers), backed by a **generic microservice proxy** in the BE that dynamically forwards REST requests to any registered microservice — eliminating per-microservice vertical coding in the BE.

As the foundational layer, **refactor the BE auth middleware into the SDK** so that authentication (STANDALONE + GATEWAY modes) is a shared, framework-agnostic utility consumed by the BE, microservices (HTTP), and NATS publishers/subscribers alike.

The email-providers page is the **first consumer** of this generic proxy, establishing the pattern for all future microservice CRUD pages.

---

## 2. Empirical Context (verified from codebase)

### 2.1 Database

- **`emailsender.providers` table** (exists, verified via Postgres MCP):
  - Columns: `id` (bigint PK), `uuid` (uuid, gen_random_uuid), `provider` (varchar(50), UNIQUE), `api_key` (text, NOT NULL), `api_endpoint` (text, nullable), `from_email` (text, nullable), `from_name` (text, nullable), `reply_to` (text, nullable), `created_at`, `created_by`, `updated_at`, `updated_by`, `version`
  - **No `deleted_at`/`deleted_by` columns** — providers are NOT soft-deletable. Hard delete only.
  - UNIQUE constraint on `provider` column — one row per provider name.

- **`service_registry` table** (exists, verified):
  - Columns: `id`, `uuid`, `code` (varchar), `base_url` (text), `endpoints` (jsonb), `version`, `created_at/by`, `updated_at/by`
  - Current row: `{ code: "EMAILSENDER", base_url: "http://new-host:4000", endpoints: { health: "...", webhook: "..." } }`

- **`auth_configurations` table** (exists, verified):
  - Key/value table: `key` (varchar, UNIQUE), `value` (text), `description` (text)
  - Contains: `auth_mode` (STANDALONE|GATEWAY), `auth_roles_path`, `oidc_issuer_url`, `oidc_client_id`, `oidc_client_secret`, `gateway_secret`, `gateway_secret_header`, gateway header names, etc.

- **`role_mappings` table** (exists, verified):
  - Columns: `idp_role`, `permissions` (array), `is_admin` (boolean), `label_key`

- **`user_profiles` table** (exists):
  - Maps IDP `sub` (idp_code) to internal Primebrick UUID. Just-in-time provisioned by `resolveInternalUuid()`.

### 2.2 SDK (`primebrick-v3-sdk`)

- **NO auth middleware exists** in the SDK. Only `extJsonMiddleware` (BigInt-safe JSON). This plan adds a full auth module.
- **ServiceRegistryPort**: `findByCode(code)` returns `{ code, base_url, endpoints }` or null. Can look up any service's base_url at runtime.
- **NatsClient**: Supports `subscribeRequest<TRequest, TResponse>(subject, handler)` for req/res. Also `subscribe<T>()` for pub/sub. All messages use Ext-JSON (BigInt-safe). **Does NOT currently support NATS headers** — `publish()` has no headers param, `subscribe()` handler receives `raw: Msg` which has `.headers` (NATS supports headers natively). This plan adds headers support to `publish()`.
- **createHttpServer**: Takes a single `routeHandler: (req, res, url) => Promise<boolean>`. Returns `true` if handled. Consumer implements routing logic internally. Uses raw Node.js `http` (NOT Express).
- **ConfigLoader**: Loads config from DB into in-memory cache. `get(key)`, `require(key)`, `getTyped()`.

### 2.3 Backend (`primebrick-be-v3`) — Auth stack (7 files to refactor)

The BE auth stack is currently self-contained in `src/modules/auth/`. The following files contain framework-agnostic logic that should move to the SDK:

| BE File | Lines | Generic? | SDK Destination |
|---------|-------|----------|-----------------|
| `types.ts` | 51 | AuthUser type is generic; Express augmentation stays BE | `sdk/auth/types.ts` |
| `config.ts` | 180 | AuthMode, AuthConfig, OidcConfig, GatewayConfig types + caching are generic; DB loading uses BE-specific DAL | `sdk/auth/auth-config.ts` (types + cache) + `sdk/auth/ports/auth-config-port.ts` |
| `config-repo.ts` | 154 | loadAuthConfigFromDb logic is generic; uses BE-specific AuthConfigurationsDal | `sdk/auth/auth-config-loader.ts` (uses port) |
| `token-normalizer.ts` | 134 | Fully generic — no Express/DB deps | `sdk/auth/token-normalizer.ts` (move as-is) |
| `oidc-client.ts` | 114 | verifyAccessToken is generic (uses jose); calls BE-specific getAuthConfig | `sdk/auth/oidc-verifier.ts` (accepts config param) |
| `permissions.ts` | 178 | Permission enum, expandPermissions, isPermissionGranted, matchesWildcard — fully generic | `sdk/auth/permissions.ts` (move as-is) |
| `session-context.ts` | 135 | AsyncLocalStorage session — fully generic | `sdk/auth/session-context.ts` (move as-is) |

BE-specific files that stay in the BE (become thin wrappers / port implementations):

| BE File | Stays BE-specific because |
|---------|--------------------------|
| `auth.middleware.ts` | Express RequestHandler wrapper around SDK verifyExpressRequest() |
| `rbac.middleware.ts` | Express RequestHandler wrapper around SDK permission check |
| `user-profile-repo.ts` | Writes to `user_profiles` table via BE DAL — implements UserResolverPort |
| `role-mapping-repo.ts` | Reads `role_mappings` table via BE DAL — implements RoleMappingPort |
| `auth_configurations_dal.ts` | Reads `auth_configurations` table via BE DAL — implements AuthConfigPort |

**Current auth flow (verified from source):**
1. `rbacHandler([...])` — Step 1: gateway secret check (GATEWAY mode) — Step 2: `authMiddleware()` — Step 3: RBAC permission check
2. `authMiddleware()` — `fromStandalone()` or `fromGateway()` — builds `AuthUser` — `runWithSession(session, () => next())`
3. `fromStandalone()`: extracts token from `Authorization` header or `access_token` cookie — `verifyAccessToken(token)` via jose/JWKS — `normalizeIdpToken(claims)` — `resolveInternalUuid()` — `expandPermissions(roles)` — `buildAuthUser()`
4. `fromGateway()`: verifies gateway secret header — extracts identity headers — `resolveInternalUuid()` — `expandPermissions(roles)` — `buildAuthUser()`
5. **Raw access token is NOT stored** — only claims are extracted. This plan adds `raw_access_token` capture for proxy forwarding.

### 2.4 Emailsender microservice (`primebrick-us-v3/emailsender`)

- **Only HTTP route**: `POST /webhook` (webhook-route.ts). NO CRUD routes for providers.
- **DAL**: Initialized with `DB_SCHEMA=emailsender` (search_path). Supports `findAll`, `find`, `add`, `update`, `delete` (soft-delete) on entities.
- **ProviderEntity**: `@Entity("providers", "emailsender")`. Auditable but NOT soft-deletable.
- **NATS**: Uses `NatsClient.subscribe<SendEmailRequest>()` (pub/sub with response subject, NOT `subscribeRequest`). `EMAIL_SEND_SUBJECT` publishes response to `EMAIL_RESPONSE_SUBJECT.{requestId}`. **No auth verification on NATS messages** — any NATS client can publish/subscribe. This plan adds NATS auth.
- **Env**: `DATABASE_URL`, `DB_SCHEMA=emailsender`, `NATS_URL`, `BREVO_API_KEY`, `BREVO_API_ENDPOINT`, `SERVICE_CODE=EMAILSENDER`, `SERVICE_BASE_URL`, `WEBHOOK_API_KEY`, `HTTP_PORT=3003`.
- **Service registry adapter**: Implements `ServiceRegistryPort`. Registers with code/base_url/endpoints. Supports `findByCode` for lookups.

### 2.5 Frontend (`primebrick-fe-v3`)

- **Settings layout** (`src/routes/(app)/system/settings/+layout.svelte`): Tab navigation with 6 tabs (profile, organizations, users, security, modules, templates). Each tab is a route under `/system/settings/{tab}`.
- **apiFetch** (`src/lib/api.ts`): Centralized fetch wrapper. Handles token refresh, RFC7807 errors, backend availability. All FE to BE calls go through this.
- **i18n**: 6 languages (en-GB, it-IT, de-DE, es-ES, fr-FR, pt-PT). Settings tabs defined under `shell.settings.tabs.*`.
- **UI**: Shadcn-Svelte + Tailwind. `AppPageScaffold` for page layout. Forms use `Input`, `Password.PasswordInput`, `Button`, `Badge` primitives.

---

## 3. Design Decisions (addressing user's open points)

### 3.1 SDK Auth Refactor — framework-agnostic auth for HTTP + NATS

**Decision: Move the entire BE auth core to the SDK. BE becomes a thin Express wrapper. Microservices and NATS handlers use the same SDK auth utilities.**

**Auth config storage — per-microservice `config` table (user-confirmed):**
- Each microservice stores its own auth config in its existing generic `config` table (the `ConfigEntryEntity` already exists in emailsender schema with `key`/`value` columns).
- The SDK `ConfigLoader` (already exists in SDK) reads all config key/values at startup into an in-memory cache.
- The SDK `AuthConfigPort` implementation uses `ConfigLoader` to read auth-related keys (`auth_mode`, `auth_roles_path`, gateway headers, etc.) from the microservice's own `config` table.
- **Microservices** persist `AUTH_MODE = GATEWAY` in their `config` table (the BE proxy forwards identity headers, so microservices verify in GATEWAY mode).
- **BE** persists `AUTH_MODE = STANDALONE` in its `auth_configurations` table (BE validates JWT directly via OIDC discovery).
- BE is treated as a "special microservice" — it uses the same SDK auth logic, just with a different `AuthConfigPort` implementation that reads from `auth_configurations` instead of `config`.
- This eliminates cross-schema queries to `auth_configurations` from microservices. Each microservice is self-contained for auth config.
- The `auth_configurations` table in BE is refactored to use the same SDK `ConfigPort` pattern (treated as a special microservice config source).

The SDK auth module is built around a **header-provider abstraction** — a generic interface that can read headers from HTTP `IncomingMessage`, Express `Request`, or NATS `Msg`:

```typescript
/** Generic header reader — abstracts HTTP IncomingMessage, Express Request, NATS Msg */
export interface HeaderProvider {
  getHeader(name: string): string | undefined;
}
```

Three adapters:
- `HttpHeaderProvider(req: IncomingMessage)` — reads `req.headers[name]`
- `NatsHeaderProvider(msg: Msg)` — reads `msg.headers.get(name)`

The core verification function has **two distinct modes** with different port requirements:

```typescript
// Ports needed ONLY by BE (STANDALONE mode) — NOT by microservices
export interface AuthPorts {
  /** Resolves IDP sub to internal Primebrick UUID (just-in-time user provisioning) */
  resolveInternalUuid(input: ResolveInput): Promise<string>;
  /** Loads role to permissions mapping */
  getRoleMapping(role: string): Promise<{ permissions: string[]; is_admin: boolean } | null>;
}

// STANDALONE mode (BE only): verifies JWT, resolves user, expands permissions — needs AuthPorts
export async function verifyAuth(
  headers: HeaderProvider,
  config: AuthConfig,
  ports: AuthPorts,
): Promise<AuthUser>

// GATEWAY-RESOLVED mode (microservices): BE already resolved everything, just deserialize headers — NO ports needed
export async function verifyAuthGatewayResolved(
  headers: HeaderProvider,
  config: AuthConfig,
): Promise<AuthUser>
```

- **STANDALONE mode (BE only)**: Extracts `Authorization: Bearer token` — `verifyAccessToken(token, config.oidc)` — `normalizeIdpToken(claims)` — `ports.resolveInternalUuid()` — `expandPermissions(roles, ports.getRoleMapping)` — `buildAuthUser()`. Captures `raw_access_token` for proxy forwarding. **Needs AuthPorts** (UserResolverPort + RoleMappingPort) because the BE receives a raw JWT and must resolve the IDP subject to an internal UUID and expand roles to permissions.

- **GATEWAY-RESOLVED mode (microservices)**: Verifies gateway secret header — reads the **full resolved AuthUser** from headers (internal UUID, permissions, roles, email, name, isAdmin, isSystem, etc.) — reconstructs `AuthUser`. **NO ports needed.** The BE has already done all the work; the microservice just deserializes the result. This preserves schema isolation (no cross-schema queries), single source of truth (BE is the only resolver), and loose coupling (microservice depends on headers, not BE's schema).

**Why microservices do NOT need UserResolverPort or RoleMappingPort (user-confirmed design principle):**

The BE operates in STANDALONE mode — it receives a raw JWT, verifies it, resolves the IDP `sub` to an internal UUID via `UserResolverPort`, and expands roles to permissions via `RoleMappingPort`. At this point the BE has a **fully resolved `AuthUser`** with: internal UUID, expanded permissions, roles, email, name, isAdmin, isSystem, etc.

When the BE forwards the request to a microservice (via HTTP proxy or NATS), it serializes the **entire resolved `AuthUser`** into headers. The microservice operates in GATEWAY-RESOLVED mode — it reads the headers and reconstructs the `AuthUser` directly. No DB queries, no cross-schema access, no ports.

This respects three architectural principles:
1. **Schema isolation** — microservices never query `user_profiles` or `role_mappings` (those are in the public schema, owned by BE).
2. **Single source of truth** — user resolution and permission expansion happen ONLY in the BE. Microservices trust the BE's resolved identity (verified via gateway secret).
3. **Loose coupling** — microservices depend on a set of headers, not on another service's database schema.

**SDK AuthUser serialization/deserialization helpers:**
```typescript
/** Serialize AuthUser into headers for forwarding to microservices (HTTP or NATS) */
export function serializeAuthUserToHeaders(user: AuthUser, config: AuthConfig): Record<string, string>

/** Deserialize AuthUser from headers (microservice side, GATEWAY-RESOLVED mode) */
export function deserializeAuthUserFromHeaders(headers: HeaderProvider, config: AuthConfig): AuthUser
```

The serialized headers include: `x-user-id` (internal UUID), `x-user-email`, `x-user-name`, `x-user-roles` (CSV), `x-user-permissions` (CSV), `x-user-is-admin` (boolean), `x-user-is-system` (boolean), `x-user-idp-code`, `x-user-idp-org`, `x-user-idp-username`, plus the gateway secret header for anti-spoofing.

**Convenience wrappers:**
- `verifyHttpRequest(req: IncomingMessage, config, ports?)` — for BE (STANDALONE, ports required) or microservices (GATEWAY-RESOLVED, ports omitted)
- `verifyExpressRequest(req: Request, config, ports?)` — for BE (Express, also reads cookie)
- `verifyNatsMessage(msg: Msg, config, ports?)` — for NATS subscribers (ports omitted for microservices)

### 3.2 NATS Auth — publisher attaches full resolved AuthUser, subscriber verifies

**Decision: NATS messages carry the full resolved AuthUser in NATS headers. Publisher (BE) serializes AuthUser, subscriber (microservice) deserializes + verifies gateway secret. No ports needed on subscriber side.**

**GATEWAY-RESOLVED mode (the only mode for microservice NATS):**
- Publisher (BE): calls `serializeAuthUserToHeaders(user, config)` → gets all AuthUser fields as headers → attaches them to the NATS message via `NatsClient.publish(subject, data, headers)`. Also attaches the gateway secret header for anti-spoofing.
- Subscriber (microservice): calls `verifyNatsMessage(msg, config)` (no ports) — verifies gateway secret — calls `deserializeAuthUserFromHeaders(headers, config)` → reconstructs `AuthUser` — enforces RBAC via `enforceNatsRbac(user, permissions)`.

**System API key NATS (process-initiated sends):**
- Publisher (BE): for system-initiated sends (welcome email, nightly jobs), BE uses a system API key. The `serializeAuthUserToHeaders()` serializes the system AuthUser (`isSystem=true`, `id="system"`) into headers.
- Subscriber: deserializes → gets `AuthUser` with `isSystem=true` → `enforceNatsRbac()` bypasses permission checks → audit fields use `"system"` as actor.

**NatsClient changes:**
- `publish(subject, data, headers?)` — new optional `headers: Record<string, string>` parameter. Uses NATS `MsgHdrs` internally.
- `subscribe<T>(subject, handler)` — handler already receives `raw: Msg` which has `.headers`. No change needed to the signature.
- `subscribeRequest<TReq, TRes>(subject, handler)` — same, handler receives `raw: Msg` with `.headers`.

**New SDK helper for publishers:**
```typescript
/** Build NATS headers from a resolved AuthUser (for forwarding to microservices via NATS) */
export function buildNatsAuthHeaders(user: AuthUser, config: AuthConfig): Record<string, string>
```
This is a thin wrapper around `serializeAuthUserToHeaders(user, config)` that also adds the gateway secret header.

### 3.2b API Key Authentication — machine-to-machine auth with RBAC (user-confirmed)

**Decision: API keys are first-class auth credentials mapped to permissions. The webhook and other machine-to-machine integrations use API keys that are RBAC-enforced.**

The current webhook uses a simple `WEBHOOK_API_KEY` env var check — no RBAC. The user confirmed that API keys are "client credentials released for a specific client or group" and MUST be under RBAC. The API key is mapped to a permission or role, just like a user.

**New `api_keys` table (in public schema, managed by BE admin UI):**
```sql
CREATE TABLE IF NOT EXISTS "public"."api_keys" (
  "id" bigint generated always as identity NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "key_hash" text NOT NULL,           -- SHA-256 hash of the API key (never store plaintext)
  "key_prefix" varchar(20) NOT NULL,  -- First 8 chars for display/identification (e.g. "pbk_abc1...")
  "name" varchar(100) NOT NULL,       -- Descriptive name (e.g. "Brevo Webhook Key")
  "description" text,
  "permissions" jsonb DEFAULT '[]',   -- Array of permission strings (same format as role_mappings)
  "is_system" boolean DEFAULT FALSE,  -- System bypass (like is_admin for roles). Actor defaults to "system".
  "is_active" boolean DEFAULT TRUE,
  "expires_at" timestamptz,           -- Optional expiry
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text,
  "version" integer DEFAULT 1,
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_uuid_uq" ON "public"."api_keys" ("uuid");
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_uq" ON "public"."api_keys" ("key_hash");
```

**SDK API key verification:**
```typescript
export interface ApiKeyPort {
  findByHash(hash: string): Promise<{
    uuid: string; name: string; permissions: string[];
    is_system: boolean; is_active: boolean; expires_at: Date | null;
  } | null>;
}

export async function verifyApiKey(
  headers: HeaderProvider,
  apiKeyPort: ApiKeyPort,
): Promise<AuthUser>
```

- Extracts API key from `Authorization: ApiKey <key>` or `Authorization: Bearer <key>` header.
- Hashes the key (SHA-256) and looks up in `api_keys` table.
- If `is_active = false` or `expires_at < now()` → reject.
- If `is_system = true` → returns `AuthUser` with `is_system = true`, `id = "system"`, `permissions = Set("*")` (bypasses all RBAC). Audit fields default to `"system"`.
- Otherwise → returns `AuthUser` with `id = "apikey:{uuid}"`, `permissions` from the `api_keys.permissions` array. RBAC is enforced normally.

**`is_system` concept (user-confirmed):**
- Like `isAdmin` on roles, but for API keys and NOT a user.
- `is_system = true` → bypasses all RBAC checks (like admin).
- `is_system = true` → `user.id = "system"`, so `created_by`, `updated_by`, `deleted_by` audit fields automatically default to `"system"`.
- Used by: BE processes (welcome email on user creation), nightly jobs, system-initiated actions.
- Advantage over `isAdmin`: system is NOT a user, so audit fields are clearly marked as system-originated, not user-originated.

**AuthUser type update:**
```typescript
export type AuthUser = {
  id: string;
  idp_code: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: Set<string>;
  isAdmin: boolean;
  /** If true, this is a system API key (not a user). Bypasses RBAC. Actor defaults to "system". */
  isSystem: boolean;
  idp_org: string | null;
  idp_username: string | null;
  raw_access_token?: string;
};
```

**`checkRbac` update for isSystem:**
```typescript
export function checkRbac(user: AuthUser, requiredPermissions, mode): RbacResult {
  if (requiredPermissions.includes(Permission.PUBLIC)) return { allowed: true };
  if (requiredPermissions.includes(Permission.AUTHENTICATED_USER)) return { allowed: true };
  if (user.isAdmin || user.isSystem) return { allowed: true };  // isSystem bypass
  // ... rest of RBAC logic
}
```

**Webhook RBAC (user-confirmed):**
- The `POST /webhook` endpoint is called by Brevo (external email provider) with an API key.
- The API key is mapped to a permission (e.g., `EMAILSENDER_LOG_CREATE`).
- The webhook handler calls `verifyApiKey(headers, apiKeyPort)` → gets `AuthUser` → calls `enforceHttpRbac(user, [Permission.EMAILSENDER_LOG_CREATE])`.
- The webhook writes to the `sender_log` table (renamed from `email_templates_communication_log`), so the permission is `EMAILSENDER_LOG_CREATE`.

**New permission constant:**
```typescript
EMAILSENDER_LOG_CREATE: "emailsender.log.create",
```

**Table rename (user-confirmed):**
- `email_templates_communication_log` → `sender_log` (more accurate — it logs all sender activity, not just template-based sends).
- The `provider` field (currently `text NOT NULL`) → `provider_uuid` (`uuid`, references `providers.uuid`).
- This is a schema migration: rename table + rename/retype the `provider` column.

### 3.3 Auth forwarding (HTTP proxy) — full resolved AuthUser in headers

**Decision: BE serializes the full resolved AuthUser into HTTP headers. Microservice deserializes from headers (GATEWAY-RESOLVED mode). No token re-verification, no DB queries on microservice side.**

- BE auth middleware (STANDALONE mode) verifies the JWT, resolves the user via `UserResolverPort`, expands permissions via `RoleMappingPort` → produces fully resolved `AuthUser`.
- The BE proxy calls `serializeAuthUserToHeaders(user, config)` → gets all AuthUser fields as HTTP headers (including internal UUID, expanded permissions, roles, isAdmin, isSystem).
- The proxy forwards these headers + the gateway secret header to the microservice.
- The microservice calls `verifyHttpRequest(req, config)` (no ports) — verifies gateway secret — calls `deserializeAuthUserFromHeaders(headers, config)` → reconstructs `AuthUser`.
- The microservice then enforces RBAC via `enforceHttpRbac(user, requiredPermissions)`.
- **No `UserResolverPort` or `RoleMappingPort` on the microservice.** No cross-schema queries. The BE is the single resolver; the microservice trusts the BE's resolved identity (verified via gateway secret).

### 3.4 HTTP FETCH vs NATS REQ/RES

**Decision: HTTP FETCH for the generic proxy. NATS remains for specific inter-service calls. Both now have auth verification via SDK.**

- **HTTP FETCH for the proxy** because:
  1. Generic: forwards HTTP method + path + body without knowing the specific operation.
  2. RESTful: preserves HTTP semantics (status codes, headers, RFC7807 errors).
  3. OpenAPI: microservice can serve its own OpenAPI over HTTP for BE to merge.
  4. Already has HTTP server: microservice already runs `createHttpServer`.
- **NATS req/res remains** for specific service-to-service calls (e.g., email sending). NATS messages now carry auth headers verified by the SDK.

### 3.5 OpenAPI handling

**Decision: Each microservice exposes its own OpenAPI. BE merges dynamically.**

- Each microservice serves `GET /api/openapi.json` from its HTTP server.
- The BE has a new `OpenApiMerger` that:
  1. Queries `service_registry` for all registered services.
  2. For each service, fetches `{base_url}/api/openapi.json`.
  3. Rewrites paths: `/api/v1/providers` to `/ws/{serviceCode}/v1/providers`.
  4. Merges into the BE combined OpenAPI spec.
  5. Serves the combined spec at `GET /api/v1/openapi.json`.

### 3.6 Service registry dynamicity

**Decision: The proxy discovers services dynamically from `service_registry`. No hardcoded service list.**

- The proxy reads `serviceCode` from the URL path (`/ws/:serviceCode/v1/...`).
- Looks up `base_url` via `ServiceRegistryPort.findByCode(serviceCode)` (cached with TTL).
- Constructs target URL: `{base_url}/api/{path_after_serviceCode}`.
  - Example: `/ws/EMAILSENDER/v1/providers` to `http://new-host:4000/api/v1/providers`
- If service not found returns 404. If unreachable returns 502.

### 3.7 SDK RBAC Middleware — framework-agnostic permission enforcement

**Decision: SDK exposes RBAC middleware that evaluates the authenticated user's roles against a PASSED LIST OF ACCEPTED ROLES/PERMISSIONS for each endpoint. Works for HTTP (Express + raw IncomingMessage) and NATS.**

The current BE RBAC system uses **permission strings** (e.g., `customers.read.all`) mapped to roles via the `role_mappings` DB table. The SDK RBAC middleware preserves this model but makes it framework-agnostic.

**Core SDK RBAC function:**
```typescript
/**
 * Evaluate whether an authenticated user is allowed to access an endpoint
 * that requires one of the given permissions (OR semantics by default).
 *
 * @param user - The authenticated AuthUser (from verifyAuth/verifyHttpRequest/verifyNatsMessage)
 * @param requiredPermissions - List of accepted permissions for this endpoint
 * @param mode - "any" (OR, default) or "all" (AND)
 * @returns { allowed: boolean; missing?: string[] }
 */
export function checkRbac(
  user: AuthUser,
  requiredPermissions: readonly string[],
  mode?: "any" | "all",
): { allowed: boolean; missing?: string[] }
```

**Sentinel handling (same as BE current logic):**
- `Permission.PUBLIC` (`"_public"`) → always allowed (no auth needed)
- `Permission.AUTHENTICATED_USER` (`"_authenticated_user"`) → allowed if user is authenticated (any valid identity)
- `is_admin=true` users bypass all permission checks
- `is_system=true` API keys bypass all permission checks (actor defaults to "system")

**Convenience wrappers:**
- `enforceHttpRbac(req: IncomingMessage, user: AuthUser, requiredPermissions, mode?)` — throws on denial (for microservices)
- `enforceExpressRbac(req: Request, user: AuthUser, requiredPermissions, mode?)` — throws on denial (for BE, uses BE's ForbiddenError)
- `enforceNatsRbac(msg: Msg, user: AuthUser, requiredPermissions, mode?)` — throws on denial (for NATS subscribers)

**New permission constants for email providers (added to SDK `permissions.ts`):**
```typescript
// --- Emailsender / Providers module ---
EMAILSENDER_PROVIDERS_READ_ALL: "emailsender.providers.read.all",
EMAILSENDER_PROVIDERS_READ_SINGLE: "emailsender.providers.read.single",
EMAILSENDER_PROVIDERS_CREATE: "emailsender.providers.create",
EMAILSENDER_PROVIDERS_UPDATE: "emailsender.providers.update",
EMAILSENDER_PROVIDERS_DELETE: "emailsender.providers.delete",
EMAILSENDER_SEND: "emailsender.send",
EMAILSENDER_LOG_CREATE: "emailsender.log.create",  // Webhook: write sender_log entries
```

**DB migration patch** — update `role_mappings` seed data to:
1. Fix the outdated permission format (`customers:list` → `customers.read.all`, etc.)
2. Add email provider permissions to the `administrators` role (already has `is_admin=true`, so automatically covered)

### 3.8 US Endpoint RBAC Audit — existing endpoints missing RBAC

**Empirical finding: NONE of the emailsender's existing endpoints have RBAC. All must be brought under RBAC control.**

| Endpoint | Type | Current Auth | Recommended RBAC | Reason |
|----------|------|-------------|-----------------|--------|
| `GET /health` | HTTP | None | `Permission.PUBLIC` | Health checks must be anonymous for monitoring/load balancers. No RBAC needed. |
| `POST /webhook` | HTTP | API Key (`WEBHOOK_API_KEY`) | **API Key + RBAC** (`EMAILSENDER_LOG_CREATE`) | Webhooks are called by external email providers (Brevo) with a released API key. The API key is mapped to `EMAILSENDER_LOG_CREATE` permission. The handler calls `verifyApiKey()` + `enforceHttpRbac([Permission.EMAILSENDER_LOG_CREATE])`. |
| `emailsender.send` (NATS subscriber) | NATS | None | `Permission.EMAILSENDER_SEND` | The `.send` is called by BE as a PROCESS (e.g., welcome email on user creation), not a direct user action. Two auth paths: (1) BE forwards the user's token if the send is user-triggered; (2) BE uses a system API key (`is_system=true`) for process-initiated sends (welcome emails, nightly jobs). Both paths verify via `verifyNatsMessage()` + `enforceNatsRbac()`. System API keys bypass RBAC and set actor to "system". |
| `emailsender.response.*` (NATS publisher) | NATS | None | **No RBAC needed** | This is a response to a request, published back to the original requester's reply subject. The original request was already authorized. No additional RBAC on the response. |
| `GET /api/openapi.json` (NEW) | HTTP | None (new) | `Permission.PUBLIC` | The BE OpenAPI merger needs to fetch this without authentication. Must be public. |
| `GET /api/v1/providers` (NEW) | HTTP | None (new) | `Permission.EMAILSENDER_PROVIDERS_READ_ALL` | List all email provider configurations. Admin/operator task. |
| `GET /api/v1/providers/:uuid` (NEW) | HTTP | None (new) | `Permission.EMAILSENDER_PROVIDERS_READ_SINGLE` OR `EMAILSENDER_PROVIDERS_READ_ALL` | Read a single provider config. |
| `POST /api/v1/providers` (NEW) | HTTP | None (new) | `Permission.EMAILSENDER_PROVIDERS_CREATE` | Create a new email provider configuration. Admin-only. |
| `PUT /api/v1/providers/:uuid` (NEW) | HTTP | None (new) | `Permission.EMAILSENDER_PROVIDERS_UPDATE` | Update an existing provider configuration. Admin-only. |
| `DELETE /api/v1/providers/:uuid` (NEW) | HTTP | None (new) | `Permission.EMAILSENDER_PROVIDERS_DELETE` | Delete an email provider configuration. Admin-only. |

**Summary of RBAC changes needed in the US repo:**
- `/health` → No change (already public via SDK `createHttpServer`)
- `/webhook` → **REFACTOR**: Replace env-var API key check with SDK `verifyApiKey()` + `enforceHttpRbac([Permission.EMAILSENDER_LOG_CREATE])`. API keys stored in new `api_keys` table with permission mapping.
- `emailsender.send` (NATS) → **ADD** `verifyNatsMessage()` + `enforceNatsRbac([Permission.EMAILSENDER_SEND])`
- `emailsender.response.*` (NATS) → No change (response publisher, no RBAC)
- New `/api/openapi.json` → Public (no auth in route handler)
- New `/api/v1/providers` CRUD → Each route calls `verifyHttpRequest()` + `enforceHttpRbac([Permission.EMAILSENDER_PROVIDERS_*])`

**Note on the BE proxy RBAC:** The BE proxy at `/ws/:serviceCode/:path` uses `rbacHandler([Permission.AUTHENTICATED_USER])` — it only checks that the caller is authenticated. The **microservice** enforces the specific permission (e.g., `EMAILSENDER_PROVIDERS_CREATE`). This two-layer model means:
1. BE proxy: "Is this user authenticated?" (yes/no)
2. Microservice: "Does this user have `emailsender.providers.create`?" (yes/no)

This keeps the proxy generic while allowing per-endpoint RBAC at the microservice level.

### 3.9 BE Auth Refactor — full refactor, no backward compat (user-confirmed)

**Decision: Full refactor of BE auth. Delete old files and update all imports. No re-export wrappers. API contracts (FE-facing) remain unchanged.**

- Delete the 7 BE auth files that moved to SDK (`types.ts`, `config.ts`, `config-repo.ts`, `token-normalizer.ts`, `oidc-client.ts`, `permissions.ts`, `session-context.ts`).
- Update ALL imports across the BE codebase to import from `@primebrick/sdk` directly.
- The `auth.middleware.ts` and `rbac.middleware.ts` files are rewritten (not re-export wrappers) to use SDK functions directly.
- `config-repo.ts` stays (it implements `AuthConfigPort` via BE's DAL) but is simplified.
- `user-profile-repo.ts` and `role-mapping-repo.ts` stay (they implement SDK ports).
- FE-facing API contracts are unchanged — same endpoints, same request/response shapes, same auth flow (cookie/Bearer).
- `auth_configurations` table is refactored to use the SDK `ConfigPort` pattern (BE treated as a special microservice).

### 3.10 Table rename + provider soft-delete (user-confirmed)

**Table rename:**
- `email_templates_communication_log` → `sender_log`
- `provider` column (text) → `provider_uuid` (uuid, references `providers.uuid`)
- Fix the initial schema patch (`0001_initial_schema.sql`) for new deployments.
- Create a fire-and-forget ALTER script for existing live DB:
```sql
ALTER TABLE emailsender.email_templates_communication_log RENAME TO sender_log;
ALTER TABLE emailsender.sender_log RENAME COLUMN provider TO provider_uuid;
ALTER TABLE emailsender.sender_log ALTER COLUMN provider_uuid TYPE uuid USING NULLIF(provider_uuid, '')::uuid;
```

**Provider soft-delete:**
- Add `deleted_at` (timestamptz, nullable) and `deleted_by` (text, nullable) columns to `providers` table.
- Fix the initial schema patch (`0001_initial_schema.sql`) for new deployments.
- Create a fire-and-forget ALTER script for existing live DB:
```sql
ALTER TABLE emailsender.providers ADD COLUMN deleted_at timestamptz;
ALTER TABLE emailsender.providers ADD COLUMN deleted_by text;
CREATE INDEX providers_deleted_at_idx ON emailsender.providers (deleted_at);
```
- Update `ProviderEntity` to implement `IDeletableEntity` with `@DeletableField` annotations.
- The DELETE endpoint now performs soft-delete (DAL `.delete()` method) instead of hard-delete.

### 3.11 DB migration approach (user-confirmed)

**For role_mappings fix:**
- Fix the initial SQL patch (`00000000000000_init_database.sql`) directly — update the seed data to use dot notation (`customers.read.all` instead of `customers:list`).
- Create a fire-and-forget UPDATE script for existing live DB:
```sql
UPDATE public.role_mappings SET permissions = '["customers.read.all","customers.read.single","customers.create.single","customers.update.single"]'::jsonb WHERE idp_role = 'sales';
UPDATE public.role_mappings SET permissions = '["customers.read.all","customers.read.single","customers.update.single"]'::jsonb WHERE idp_role = 'customer_service';
```
- No new collaborators/guests roles (user-confirmed: "dont care about collaborators and guests").

**For api_keys table:**
- Add `api_keys` table creation to the BE initial schema patch (`00000000000000_init_database.sql`) for new deployments.
- Create a fire-and-forget CREATE TABLE script for existing live DB.

**For sender_log rename + provider soft-delete:**
- Fix the emailsender initial schema patch (`0001_initial_schema.sql`) for new deployments.
- Create fire-and-forget ALTER scripts for existing live DB (as shown in section 3.10).

---

## 4. Architecture Overview

```
FE (Svelte) ---> BE (Express) ---> emailsender (http)
                  /api/v1/...  = BE native routes       /api/v1/providers
                  /ws/:code/.. = proxy to microservice  /api/v1/providers/:uuid
                  Auth: SDK verifyAuth() STANDALONE     Auth: SDK verifyAuthGatewayResolved()
                   needs UserResolverPort +               NO ports — deserializes
                   RoleMappingPort (BE only)              AuthUser from headers
                   serializes full AuthUser to headers    enforces RBAC locally

BE (NATS publisher) ---> emailsender (NATS subscriber)
  NatsClient.publish(subject, data, headers)   subscribe() handler:
  headers = serializeAuthUserToHeaders(user)    verifyNatsMessage(msg, config) — NO ports
  + gateway secret header                       deserializeAuthUserFromHeaders()
                                                enforceNatsRbac(user, permissions)

SDK auth module (shared):
  STANDALONE (BE only): verifyAuth(headers, config, ports) -> AuthUser
    needs UserResolverPort + RoleMappingPort
  GATEWAY-RESOLVED (microservices): verifyAuthGatewayResolved(headers, config) -> AuthUser
    NO ports — just deserializes headers + verifies gateway secret
  API Key: verifyApiKey(headers, apiKeyPort) -> AuthUser (for webhooks, system jobs)
  RBAC: checkRbac(user, permissions, mode) — works for all auth modes
  Serialization: serializeAuthUserToHeaders() / deserializeAuthUserFromHeaders()
```

---

## 5. Implementation Phases

### Phase 1: SDK — Auth module + NATS headers

**Repository**: `primebrick-v3-sdk`

**New files (14):**

1. `src/auth/types.ts` — Shared auth types (moved from BE, Express augmentation removed). Contains AuthMode, AuthUser (with `raw_access_token?: string`), OidcConfig, GatewayConfig, AuthConfig.

2. `src/auth/header-provider.ts` — Generic header reader abstraction:
```typescript
import type { IncomingMessage } from "http";
import type { Msg } from "nats";

export interface HeaderProvider {
  getHeader(name: string): string | undefined;
}

export class HttpHeaderProvider implements HeaderProvider {
  constructor(private req: IncomingMessage) {}
  getHeader(name: string): string | undefined {
    const val = this.req.headers[name.toLowerCase()];
    return Array.isArray(val) ? val[0] : val;
  }
}

export class NatsHeaderProvider implements HeaderProvider {
  constructor(private msg: Msg) {}
  getHeader(name: string): string | undefined {
    return this.msg.headers?.get(name) || undefined;
  }
}
```

3. `src/auth/token-normalizer.ts` — Moved from BE as-is (normalizeIdpToken, coerceRoles, buildAuthUser, NormalizedIdpUser, JwtClaims). No changes — already framework-agnostic.

4. `src/auth/oidc-verifier.ts` — Moved from BE `oidc-client.ts`, refactored to accept config param instead of calling BE-specific `getAuthConfig()`. Uses `jose` for JWT verification. Singleton per `issuer_url` cached in a Map.

5. `src/auth/permissions.ts` — Moved from BE as-is (Permission, isPermissionSentinel, matchesWildcard, isPermissionGranted, expandPermissions). No changes.

6. `src/auth/session-context.ts` — Moved from BE as-is (Session, runWithSession, getSession, requireActor, runAsSystem, SYSTEM_ACTOR, AsyncLocalStorage). No changes.

7. `src/auth/ports/auth-config-port.ts` — Port interface:
```typescript
export interface AuthConfigPort {
  load(): Promise<AuthConfig>;
}
```

8. `src/auth/ports/user-resolver-port.ts` — Port interface:
```typescript
export interface ResolveInput {
  idp_code: string;
  email: string | null;
  display_name: string | null;
  idp_org?: string | null;
  idp_username?: string | null;
}
export interface UserResolverPort {
  resolveInternalUuid(input: ResolveInput): Promise<string>;
}
```

9. `src/auth/ports/role-mapping-port.ts` — Port interface:
```typescript
export interface RoleMappingPort {
  getRoleMapping(role: string): Promise<{ permissions: string[]; is_admin: boolean } | null>;
  loadAllMappings(): Promise<Map<string, { permissions: string[]; is_admin: boolean }>>;
}
```

10. `src/auth/auth-config-cache.ts` — Cached auth config loader (from BE `config.ts`, generic). Exports `initAuthConfig(port)`, `loadAuthConfig()`, `getAuthConfig()`, `invalidateAuthConfig()`.

11. `src/auth/rbac.ts` — Framework-agnostic RBAC enforcement:
```typescript
import type { AuthUser } from "./types.js";
import { isPermissionSentinel, isPermissionGranted, Permission } from "./permissions.js";

export interface RbacResult {
  allowed: boolean;
  missing?: string[];
}

export function checkRbac(
  user: AuthUser,
  requiredPermissions: readonly string[],
  mode: "any" | "all" = "any",
): RbacResult {
  const isPublic = requiredPermissions.includes(Permission.PUBLIC);
  if (isPublic) return { allowed: true };

  const isAuthenticatedOnly = requiredPermissions.includes(Permission.AUTHENTICATED_USER);
  if (isAuthenticatedOnly) return { allowed: true }; // user is already verified

  if (user.isAdmin) return { allowed: true };

  const realPerms = requiredPermissions.filter((p) => !isPermissionSentinel(p));
  if (realPerms.length === 0) return { allowed: true };

  if (mode === "all") {
    const missing = realPerms.filter((p) => !isPermissionGranted(user.permissions, p));
    return missing.length === 0 ? { allowed: true } : { allowed: false, missing };
  }
  const passes = realPerms.some((p) => isPermissionGranted(user.permissions, p));
  return passes ? { allowed: true } : { allowed: false, missing: realPerms };
}
```

12. `src/auth/rbac-http.ts` — HTTP RBAC enforcement wrappers:
```typescript
import type { IncomingMessage, ServerResponse } from "http";
import type { AuthUser } from "./types.js";
import { checkRbac } from "./rbac.js";

export class RbacDeniedError extends Error {
  constructor(public missing: string[], public required: readonly string[]) {
    super("RBAC_PERMISSION_DENIED: missing " + missing.join(", "));
  }
}

export function enforceHttpRbac(
  user: AuthUser,
  requiredPermissions: readonly string[],
  mode?: "any" | "all",
): void {
  const result = checkRbac(user, requiredPermissions, mode);
  if (!result.allowed) throw new RbacDeniedError(result.missing || [], requiredPermissions);
}

export function enforceNatsRbac(
  user: AuthUser,
  requiredPermissions: readonly string[],
  mode?: "any" | "all",
): void {
  const result = checkRbac(user, requiredPermissions, mode);
  if (!result.allowed) throw new RbacDeniedError(result.missing || [], requiredPermissions);
}
```

13. `src/auth/verify.ts` — Core verification function:
```typescript
export interface AuthPorts {
  resolveInternalUuid(input: ResolveInput): Promise<string>;
  getRoleMapping(role: string): Promise<{ permissions: string[]; is_admin: boolean } | null>;
}

export async function verifyAuth(headers: HeaderProvider, config: AuthConfig, ports: AuthPorts): Promise<AuthUser>
```
Contains `verifyStandalone()` and `verifyGateway()` internal functions (moved from BE `auth.middleware.ts` `fromStandalone()` / `fromGateway()`, adapted to use `HeaderProvider` instead of Express `Request`). Captures `raw_access_token` in STANDALONE mode.

14. `src/auth/verify-http.ts` — HTTP convenience wrapper:
```typescript
export async function verifyHttpRequest(req: IncomingMessage, config: AuthConfig, ports: AuthPorts): Promise<AuthUser>
```
Creates `HttpHeaderProvider` and delegates to `verifyAuth()`.

15. `src/auth/verify-nats.ts` — NATS convenience wrapper + publisher helper:
```typescript
export async function verifyNatsMessage(msg: Msg, config: AuthConfig, ports: AuthPorts): Promise<AuthUser>
export function buildNatsAuthHeaders(user: AuthUser, config: AuthConfig): Record<string, string>
```
`verifyNatsMessage` creates `NatsHeaderProvider` and delegates to `verifyAuth()`. `buildNatsAuthHeaders` produces `Authorization: Bearer` (STANDALONE) or gateway identity headers + secret (GATEWAY).

16. `src/auth/index.ts` — Barrel export for all auth modules (includes rbac + rbac-http).

**Modified files (3):**

17. `src/nats/nats-client.ts` — Add optional `headers` param to `publish()`:
```typescript
static async publish(subject: string, data: unknown, headers?: Record<string, string>): Promise<void> {
  const nc = await NatsClient.getConnection();
  const payload = new TextEncoder().encode(extJsonStringify(data));
  if (headers and Object.keys(headers).length > 0) {
    const natsHeaders = headersFor(headers);
    nc.publish(subject, payload, { headers: natsHeaders });
  } else {
    nc.publish(subject, payload);
  }
}
```

18. `src/index.ts` (SDK barrel) — Export the new auth module (including rbac).

19. `package.json` — Add `jose` dependency (for JWT verification). Run `pnpm add jose` in the SDK.

---

### Phase 2: BE — Consume SDK auth + Generic proxy

**Repository**: `primebrick-be-v3`

**New files (5):**

1. `src/modules/auth/sdk-auth-ports.ts` — BE-specific port implementations:
   - `BeAuthConfigPort` implements `AuthConfigPort` — wraps BE `loadAuthConfigFromDb()`, maps `AuthConfigDb` to SDK `AuthConfig`
   - `BeUserResolverPort` implements `UserResolverPort` — wraps BE `resolveInternalUuid()`
   - `BeRoleMappingPort` implements `RoleMappingPort` — wraps BE `RoleMappingRepo`, caches mappings

2. `src/modules/proxy/proxy-router.ts` — Generic proxy route `/ws/:serviceCode/:path` with `rbacHandler([Permission.AUTHENTICATED_USER])`.

3. `src/modules/proxy/proxy-service.ts` — Proxy logic: lookup service base_url by code (cached TTL 60s), forward HTTP method + body + Authorization header, return microservice response.

4. `src/modules/proxy/service-registry-repo.ts` — Service registry lookup (`findByCode`, `findAll`) using BE pool.

5. `src/modules/proxy/openapi-merger.ts` — Fetches each microservice OpenAPI, rewrites paths to `/ws/{code}/...`, merges into BE spec.

**Modified files (10):**

6. `src/modules/auth/auth.middleware.ts` — **Refactored to thin wrapper around SDK**:
   - `initAuth()` function: initializes SDK `AuthConfigPort`, loads config, loads role mappings
   - `authMiddleware()` returns Express RequestHandler that calls `verifyExpressRequest(req, config, ports)`, sets `req.user` + `req.rawAccessToken`, runs `runWithSession()`

7. `src/modules/auth/rbac.middleware.ts` — Use SDK `isPermissionGranted()` for permission checks (Express wrapper + gateway secret check stays BE-specific).

8. `src/modules/auth/types.ts` — **Re-export from SDK** + Express augmentation:
```typescript
export type { AuthUser } from "@primebrick/sdk";
declare global {
  namespace Express {
    interface Request {
      user?: import("@primebrick/sdk").AuthUser;
      rawAccessToken?: string;
    }
  }
}
export {};
```

9. `src/modules/auth/config.ts` — **Re-export from SDK**: `AuthMode`, `AuthConfig`, `getAuthConfig`, `invalidateAuthConfig`.

10. `src/modules/auth/token-normalizer.ts` — **Re-export from SDK**: `normalizeIdpToken`, `coerceRoles`, `buildAuthUser`, `NormalizedIdpUser`, `JwtClaims`.

11. `src/modules/auth/oidc-client.ts` — **Re-export from SDK**: `verifyAccessToken`.

12. `src/modules/auth/permissions.ts` — **Re-export from SDK**: `Permission`, `isPermissionSentinel`, `matchesWildcard`, `isPermissionGranted`, `expandPermissions`.

13. `src/modules/auth/session-context.ts` — **Re-export from SDK**: `runWithSession`, `getSession`, `requireActor`, `runAsSystem`, `SYSTEM_ACTOR`, `Session`.

14. `src/modules/index.ts` — Mount `proxyRouter()`.

15. `src/index.ts` — Call `initAuth()` at startup instead of `loadRoleMappings()` + `loadAuthConfig()`.

16. `src/openapi/router.ts` — Serve merged OpenAPI via `buildMergedOpenApi()`.

**Files that stay unchanged in BE:**
- `config-repo.ts` (DB loading — used by `BeAuthConfigPort`)
- `user-profile-repo.ts` (user provisioning — used by `BeUserResolverPort`)
- `role-mapping-repo.ts` (role mappings — used by `BeRoleMappingPort`)
- `auth_configurations_dal.ts` (DAL — used by `config-repo.ts`)
- Entity files (`user_profile_entity.ts`, `role_mapping_entity.ts`)

---

### Phase 3: emailsender — Providers CRUD + Auth verification (HTTP + NATS)

**Repository**: `primebrick-us-v3/emailsender`

**New files (4):**

1. `src/adapters/auth-ports-adapter.ts` — Microservice auth port implementations:
   - `EmailSenderAuthConfigPort` — reads `auth_configurations` table (cross-schema query to public schema)
   - `EmailSenderUserResolverPort` — reads `user_profiles` by idp_code (cross-schema, read-only — does NOT write)
   - `EmailSenderRoleMappingPort` — reads `role_mappings` (cross-schema)

2. `src/server/providers-route.ts` — CRUD route handler for `/api/v1/providers` with SDK auth verification:
   - Calls `verifyHttpRequest(req, config, authPorts)` at the top of each request
   - Returns 401 if auth fails
   - Uses `user.id` as the actor for audit fields
   - CRUD: GET list, GET single by uuid, POST create, PUT update, DELETE hard-delete

3. `src/server/composite-route.ts` — Chains: openapi route + providers route + webhook route.

4. `src/server/openapi-route.ts` — Serves microservice OpenAPI at `GET /api/openapi.json`.

**Modified files (2):**

5. `src/index.ts` — Initialize auth config at startup:
```typescript
import { initAuthConfig, loadAuthConfig } from "@primebrick/sdk";
import { EmailSenderAuthConfigPort } from "./adapters/auth-ports-adapter.js";
initAuthConfig(new EmailSenderAuthConfigPort());
await loadAuthConfig();
```
Change `routeHandler` from `webhookRouteHandler` to `compositeRouteHandler`.

6. `src/nats/handlers.ts` — **Add NATS auth verification**:
   - At the top of the subscribe handler, call `verifyNatsMessage(msg, config, authPorts)`
   - If auth fails, publish error response and return
   - If auth succeeds, use `user.id` as actor for audit fields

---

### Phase 4: FE — Email Providers settings page

**Repository**: `primebrick-fe-v3`

**New files (2):**

1. `src/routes/(app)/system/settings/email-providers/+page.svelte` — Settings page with:
   - Provider list table (provider, from_email, from_name, reply_to, version, actions)
   - Add/Edit form (provider, api_key, api_endpoint, from_email, from_name, reply_to)
   - Delete confirmation
   - All API calls via `apiFetch('/ws/EMAILSENDER/v1/providers')`
   - Notifications via `pushNotification()` (no direct `toast.*`)

2. `src/lib/types/email-provider.ts` — EmailProvider TS type (snake_case):
```typescript
export interface EmailProvider {
  id: string;
  uuid: string;
  provider: string;
  api_key: string;
  api_endpoint: string | null;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}
```

**Modified files (8):**

3. `src/routes/(app)/system/settings/+layout.svelte` — Add "Email Providers" tab (Mail icon, `/system/settings/email-providers`).

4-9. `src/lib/i18n/messages/{en-GB,it-IT,de-DE,es-ES,fr-FR,pt-PT}.json` — Add `shell.settings.tabs.emailProviders` + `shell.settings.emailProviders.*` keys in all 6 languages.

---

## 6. Impacted Files Summary

### `primebrick-v3-sdk` (21 new, 3 modified)
| File | Action | Purpose |
|------|--------|---------|
| `src/auth/types.ts` | NEW | AuthMode, AuthUser (with isSystem), AuthConfig, OidcConfig, GatewayConfig |
| `src/auth/header-provider.ts` | NEW | HeaderProvider interface + Http/Nats adapters |
| `src/auth/token-normalizer.ts` | NEW | normalizeIdpToken, coerceRoles, buildAuthUser (from BE) |
| `src/auth/oidc-verifier.ts` | NEW | verifyAccessToken (from BE, accepts config param) |
| `src/auth/permissions.ts` | NEW | Permission, expandPermissions, isPermissionGranted (from BE) |
| `src/auth/session-context.ts` | NEW | Session, runWithSession, requireActor, runAsSystem (from BE) |
| `src/auth/ports/auth-config-port.ts` | NEW | AuthConfigPort interface |
| `src/auth/ports/user-resolver-port.ts` | NEW | UserResolverPort interface (BE only, NOT microservices) |
| `src/auth/ports/role-mapping-port.ts` | NEW | RoleMappingPort interface (BE only, NOT microservices) |
| `src/auth/auth-config-cache.ts` | NEW | initAuthConfig, loadAuthConfig, getAuthConfig, invalidateAuthConfig |
| `src/auth/verify.ts` | NEW | Core verifyAuth() (STANDALONE, needs ports) + verifyAuthGatewayResolved() (microservices, NO ports) |
| `src/auth/verify-http.ts` | NEW | verifyHttpRequest() — works with or without ports depending on mode |
| `src/auth/verify-nats.ts` | NEW | verifyNatsMessage() — GATEWAY-RESOLVED, no ports needed |
| `src/auth/auth-user-serializer.ts` | NEW | serializeAuthUserToHeaders() + deserializeAuthUserFromHeaders() — full AuthUser forwarding |
| `src/auth/rbac.ts` | NEW | checkRbac() — framework-agnostic RBAC evaluation (includes isSystem bypass) |
| `src/auth/rbac-http.ts` | NEW | enforceHttpRbac() + enforceNatsRbac() + RbacDeniedError |
| `src/auth/api-key-types.ts` | NEW | ApiKeyRecord type, ApiKeyPort interface |
| `src/auth/verify-api-key.ts` | NEW | verifyApiKey() — API key verification with permission mapping |
| `src/auth/api-key-hash.ts` | NEW | hashApiKey() — SHA-256 hashing for API keys |
| `src/auth/index.ts` | NEW | Barrel export (includes rbac + rbac-http + api-key + serializer) |
| `src/nats/nats-client.ts` | MODIFY | Add headers param to publish() |
| `src/index.ts` | MODIFY | Export auth module |
| `package.json` | MODIFY | Add jose dependency |

### `primebrick-be-v3` (7 new, 4 modified, 7 deleted)
| File | Action | Purpose |
|------|--------|---------|
| `src/modules/auth/sdk-auth-ports.ts` | NEW | BE-only port implementations: AuthConfigPort (from auth_configurations), UserResolverPort (from user_profiles), RoleMappingPort (from role_mappings), ApiKeyPort (from api_keys). These ports are NOT used by microservices. |
| `src/modules/proxy/proxy-router.ts` | NEW | Generic proxy route |
| `src/modules/proxy/proxy-service.ts` | NEW | Proxy logic |
| `src/modules/proxy/service-registry-repo.ts` | NEW | Service registry lookup |
| `src/modules/proxy/openapi-merger.ts` | NEW | Merge microservice OpenAPI |
| `src/modules/auth/auth.middleware.ts` | REWRITE | Full rewrite using SDK verifyExpressRequest() (no backward compat) |
| `src/modules/auth/rbac.middleware.ts` | REWRITE | Full rewrite using SDK checkRbac() (no backward compat) |
| `src/modules/auth/types.ts` | DELETE | Moved to SDK. Express augmentation moves to a new file |
| `src/modules/auth/config.ts` | DELETE | Moved to SDK |
| `src/modules/auth/config-repo.ts` | REWRITE | Simplified — implements AuthConfigPort via BE DAL |
| `src/modules/auth/token-normalizer.ts` | DELETE | Moved to SDK |
| `src/modules/auth/oidc-client.ts` | DELETE | Moved to SDK |
| `src/modules/auth/permissions.ts` | DELETE | Moved to SDK |
| `src/modules/auth/session-context.ts` | DELETE | Moved to SDK |
| `src/modules/auth/express-augmentation.ts` | NEW | Express Request augmentation (req.user, req.rawAccessToken) — extracted from old types.ts |
| `src/modules/index.ts` | MODIFY | Mount proxy router |
| `src/index.ts` | MODIFY | Call initAuth() at startup |
| `src/openapi/router.ts` | MODIFY | Serve merged OpenAPI |
| `db-meta/patches/00000000000001_create_api_keys_table.sql` | NEW | Create `api_keys` table in public schema |
| `db-meta/fire-and-forget/fix_role_mappings_permissions.sql` | NEW | Fire-and-forget: fix outdated permission format in existing live DB |
| `db-meta/fire-and-forget/create_api_keys_table.sql` | NEW | Fire-and-forget: create api_keys table in existing live DB |

### `primebrick-us-v3/emailsender` (5 new, 5 modified)
| File | Action | Purpose |
|------|--------|---------|
| `src/adapters/auth-ports-adapter.ts` | NEW | Microservice auth port implementations: AuthConfigPort (reads from `config` table) + ApiKeyPort (reads from `api_keys` cross-schema). NO UserResolverPort, NO RoleMappingPort — microservice uses GATEWAY-RESOLVED mode. |
| `src/server/providers-route.ts` | NEW | CRUD routes with auth + RBAC verification |
| `src/server/composite-route.ts` | NEW | Chains webhook + providers + openapi routes |
| `src/server/openapi-route.ts` | NEW | Serves microservice OpenAPI |
| `src/domain/entities/sender_log_entity.ts` | NEW | Renamed entity (was email_templates_communication_log) with provider_uuid field |
| `src/index.ts` | MODIFY | Init auth config from config table + use composite route handler |
| `src/nats/handlers.ts` | MODIFY | Add NATS auth + RBAC verification (EMAILSENDER_SEND). Support system API key auth. |
| `src/server/webhook-route.ts` | REWRITE | Replace env-var API key with SDK verifyApiKey() + enforceHttpRbac([EMAILSENDER_LOG_CREATE]) |
| `src/domain/entities/provider_entity.ts` | MODIFY | Add IDeletableEntity (deleted_at, deleted_by) for soft-delete |
| `src/domain/entities/registry.ts` | MODIFY | Rename communication log entity + update registry |
| `db-meta/patches/0001_initial_schema.sql` | MODIFY | Fix: rename table to sender_log, provider→provider_uuid, add deleted_at/deleted_by to providers |
| `db-meta/fire-and-forget/rename_log_and_soft_delete_providers.sql` | NEW | Fire-and-forget: ALTER existing live DB (rename table, add columns) |

### `primebrick-fe-v3` (2 new, 8 modified)
| File | Action | Purpose |
|------|--------|---------|
| `src/routes/(app)/system/settings/email-providers/+page.svelte` | NEW | Email providers settings page |
| `src/lib/types/email-provider.ts` | NEW | EmailProvider TS type |
| `src/routes/(app)/system/settings/+layout.svelte` | MODIFY | Add Email Providers tab |
| 6x i18n message files | MODIFY | Translations for all 6 languages |

---

## 7. Acceptance Criteria

### 7.0 SDK RBAC Middleware
- [ ] `checkRbac(user, permissions, mode)` returns `{ allowed: true }` for admin users (bypass).
- [ ] `checkRbac` returns `{ allowed: true }` for `Permission.PUBLIC` and `Permission.AUTHENTICATED_USER` sentinels.
- [ ] `checkRbac` with OR mode returns `{ allowed: true }` if user has ANY of the required permissions.
- [ ] `checkRbac` with AND mode returns `{ allowed: true }` only if user has ALL required permissions.
- [ ] `checkRbac` returns `{ allowed: false, missing: [...] }` when user lacks required permissions.
- [ ] `enforceHttpRbac(user, permissions)` throws `RbacDeniedError` on denial.
- [ ] `enforceNatsRbac(user, permissions)` throws `RbacDeniedError` on denial.
- [ ] Wildcard permissions work (e.g., `emailsender.providers.*` matches `emailsender.providers.read.all`).
- [ ] New permission constants `EMAILSENDER_PROVIDERS_*` and `EMAILSENDER_SEND` are exported from SDK.

### 7.0b US Endpoint RBAC Coverage
- [ ] `GET /health` remains public (no auth).
- [ ] `POST /webhook` uses SDK `verifyApiKey()` + `enforceHttpRbac([EMAILSENDER_LOG_CREATE])` (API key mapped to permission).
- [ ] `emailsender.send` NATS subscriber enforces `Permission.EMAILSENDER_SEND` via `enforceNatsRbac()`.
- [ ] `emailsender.response.*` NATS publisher has no RBAC (response to authorized request).
- [ ] `GET /api/openapi.json` is public (no auth).
- [ ] `GET /api/v1/providers` enforces `Permission.EMAILSENDER_PROVIDERS_READ_ALL`.
- [ ] `GET /api/v1/providers/:uuid` enforces `Permission.EMAILSENDER_PROVIDERS_READ_SINGLE` (OR `READ_ALL`).
- [ ] `POST /api/v1/providers` enforces `Permission.EMAILSENDER_PROVIDERS_CREATE`.
- [ ] `PUT /api/v1/providers/:uuid` enforces `Permission.EMAILSENDER_PROVIDERS_UPDATE`.
- [ ] `DELETE /api/v1/providers/:uuid` enforces `Permission.EMAILSENDER_PROVIDERS_DELETE` (soft-delete with deleted_at/deleted_by).
- [ ] DB migration fixes outdated `role_mappings` seed data (colon format → dot format).
- [ ] DB migration adds email provider permissions to appropriate roles.

### 7.0c API Key Authentication
- [ ] `api_keys` table created in public schema with `key_hash`, `permissions`, `is_system`, `is_active`, `expires_at` columns.
- [ ] `verifyApiKey(headers, apiKeyPort)` returns `AuthUser` with permissions from the API key record.
- [ ] `verifyApiKey` throws on invalid/inactive/expired API keys.
- [ ] `is_system=true` API keys return `AuthUser` with `isSystem=true`, `id="system"`, permissions bypass.
- [ ] `checkRbac` bypasses all permission checks for `isSystem=true` users.
- [ ] System API key audit fields default to `"system"` (created_by, updated_by, deleted_by).
- [ ] `hashApiKey()` uses SHA-256 (plaintext keys never stored).
- [ ] Webhook endpoint uses `verifyApiKey()` + `enforceHttpRbac([EMAILSENDER_LOG_CREATE])`.

### 7.0d Table Rename + Provider Soft-delete
- [ ] `email_templates_communication_log` renamed to `sender_log` in initial schema patch.
- [ ] `provider` column renamed to `provider_uuid` (type uuid, references `providers.uuid`).
- [ ] `providers` table has `deleted_at` and `deleted_by` columns.
- [ ] `ProviderEntity` implements `IDeletableEntity` with `@DeletableField` annotations.
- [ ] DELETE endpoint performs soft-delete (sets `deleted_at`/`deleted_by`), not hard-delete.
- [ ] Fire-and-forget ALTER scripts exist for existing live DB.

### 7.1 SDK Auth Refactor
- [ ] `verifyAuth(headers, config, ports)` (STANDALONE) returns an `AuthUser` for valid JWT tokens — needs UserResolverPort + RoleMappingPort (BE only).
- [ ] `verifyAuthGatewayResolved(headers, config)` (GATEWAY-RESOLVED) returns an `AuthUser` from headers — NO ports needed (microservices).
- [ ] `verifyAuth` throws on missing/invalid tokens (STANDALONE) or invalid gateway secret (GATEWAY-RESOLVED).
- [ ] `serializeAuthUserToHeaders(user, config)` serializes all AuthUser fields (id, permissions, roles, isAdmin, isSystem, etc.) into headers.
- [ ] `deserializeAuthUserFromHeaders(headers, config)` reconstructs AuthUser from headers.
- [ ] `AuthUser` type includes `isSystem: boolean` field.
- [ ] SDK auth config loaded from microservice's own `config` table (via `ConfigLoader`).
- [ ] Microservices have NO UserResolverPort and NO RoleMappingPort — no cross-schema queries.
- [ ] `verifyHttpRequest(req, config, ports)` works with raw `IncomingMessage`.
- [ ] `verifyNatsMessage(msg, config, ports)` works with NATS `Msg` headers.
- [ ] `buildNatsAuthHeaders(user, config)` produces correct headers for STANDALONE and GATEWAY.
- [ ] `NatsClient.publish(subject, data, headers)` attaches NATS headers correctly.
- [ ] SDK auth module has NO Express dependency (framework-agnostic).
- [ ] SDK `pnpm run build` passes.
- [ ] Existing SDK tests still pass.

### 7.2 BE Auth Refactor
- [ ] BE `authMiddleware()` uses SDK `verifyExpressRequest()` internally.
- [ ] BE `rbacHandler()` uses SDK `checkRbac()` for permission checks.
- [ ] `req.user` is populated correctly (same AuthUser shape + new `isSystem` field).
- [ ] `req.rawAccessToken` is populated in STANDALONE mode.
- [ ] `runWithSession()` / `requireActor()` work via SDK import (no re-export wrappers).
- [ ] Old auth files (`types.ts`, `config.ts`, `token-normalizer.ts`, `oidc-client.ts`, `permissions.ts`, `session-context.ts`) are DELETED.
- [ ] All BE imports updated to import from `@primebrick/sdk` directly.
- [ ] All existing BE routes still work (customers, organizations, system, auth).
- [ ] FE-facing API contracts unchanged (same endpoints, same request/response shapes).
- [ ] `pnpm run check` passes.
- [ ] `pnpm run build` passes.
- [ ] Existing BE tests still pass.

### 7.3 Generic Proxy (BE)
- [ ] `GET /ws/EMAILSENDER/v1/providers` proxies to the emailsender microservice.
- [ ] `POST /ws/EMAILSENDER/v1/providers` creates a provider via the microservice.
- [ ] `PUT /ws/EMAILSENDER/v1/providers/:uuid` updates a provider.
- [ ] `DELETE /ws/EMAILSENDER/v1/providers/:uuid` deletes a provider.
- [ ] Unauthenticated requests to `/ws/*` return 401.
- [ ] Unknown service code returns 404.
- [ ] Unreachable microservice returns 502.
- [ ] The proxy forwards the `Authorization: Bearer` header (STANDALONE) or gateway headers (GATEWAY).
- [ ] The proxy is generic — no emailsender-specific code.

### 7.4 Emailsender CRUD + Auth (US)
- [ ] `GET /api/v1/providers` returns `{ providers: [...] }` with snake_case fields.
- [ ] `POST /api/v1/providers` creates a provider and returns 201.
- [ ] `PUT /api/v1/providers/:uuid` updates a provider.
- [ ] `DELETE /api/v1/providers/:uuid` soft-deletes a provider (sets deleted_at/deleted_by).
- [ ] Unauthenticated requests to `/api/v1/providers` return 401.
- [ ] `GET /api/openapi.json` returns the microservice OpenAPI spec.
- [ ] `GET /health` still works.
- [ ] `POST /webhook` uses API key + RBAC (`EMAILSENDER_LOG_CREATE`), writes to `sender_log` table.
- [ ] NATS `emailsender.send` subscriber verifies auth via `verifyNatsMessage()` + `enforceNatsRbac()`.
- [ ] NATS messages without auth headers are rejected.
- [ ] NATS `emailsender.send` accepts system API keys (`is_system=true`) for process-initiated sends.
- [ ] System API key sends set actor to "system" in audit fields.
- [ ] All JSON responses use snake_case.

### 7.5 Frontend (FE)
- [ ] "Email Providers" tab appears in the settings sidebar.
- [ ] The page loads and displays the list of providers.
- [ ] "Add Provider" opens a form with all fields.
- [ ] Saving creates/updates via `/ws/EMAILSENDER/v1/providers`.
- [ ] Editing pre-fills the form (including api_key).
- [ ] Deleting shows confirmation, then deletes.
- [ ] All labels translated in all 6 languages.
- [ ] `pnpm run check` passes.
- [ ] Notifications via `pushNotification` (no direct `toast.*`).

### 7.6 OpenAPI
- [ ] `GET /api/v1/openapi.json` includes emailsender routes under `/ws/EMAILSENDER/v1/providers`.

### 7.7 Data Model Conventions
- [ ] All TS interfaces use snake_case field names.
- [ ] No DTO transformation between DB and TS models.
- [ ] No fallback defaults on the read path.
- [ ] No camelCase field names in JSON responses.

---

## 8. Open Questions — RESOLVED (user-confirmed 2026-07-08)

1. **Microservice auth config source** — RESOLVED: Each microservice stores auth config in its own generic `config` table (ConfigEntryEntity). `AUTH_MODE = GATEWAY` for microservices. BE uses `auth_configurations` with `AUTH_MODE = STANDALONE`. BE is treated as a special microservice using the same SDK logic. No cross-schema queries to `auth_configurations` from microservices.

2. **UserResolverPort** — RESOLVED: Microservices do NOT need UserResolverPort or RoleMappingPort. The BE (STANDALONE mode) resolves the user and expands permissions, then serializes the full `AuthUser` into headers (GATEWAY-RESOLVED mode). Microservices just deserialize headers — no cross-schema queries, no DB access for auth. This preserves schema isolation, single source of truth, and loose coupling. UserResolverPort/RoleMappingPort are BE-only ports.

3. **NATS auth enforcement** — RESOLVED: Mandatory. All NATS messages must carry auth headers.

4. **Provider delete** — RESOLVED: Add soft-delete via migration (`deleted_at`, `deleted_by` columns). Fix initial schema patch for new deployments + fire-and-forget ALTER for existing live DB.

5. **Proxy RBAC granularity** — RESOLVED: Yes, enforce RBAC anywhere. Proxy enforces `AUTHENTICATED_USER`, microservice enforces specific permissions.

6. **SDK jose dependency** — RESOLVED: Yes, acceptable.

7. **BE auth refactor risk** — RESOLVED: Full refactor. Delete old files, update all imports. No re-export wrappers. API contracts (FE-facing) remain unchanged.

8. **Webhook RBAC** — RESOLVED: API keys are first-class auth credentials mapped to permissions. New `api_keys` table with `permissions` array and `is_system` flag. Webhook uses `verifyApiKey()` + `enforceHttpRbac([EMAILSENDER_LOG_CREATE])`. Table `email_templates_communication_log` renamed to `sender_log`. `provider` column → `provider_uuid` (references `providers.uuid`).

9. **NATS `emailsender.send` permission** — RESOLVED: Two auth paths: (1) user token for user-triggered sends; (2) system API key (`is_system=true`) for process-initiated sends (welcome emails, nightly jobs). System API keys bypass RBAC and set actor to "system" for audit fields. This is like `isAdmin` but for non-user entities.

10. **Role mappings migration** — RESOLVED: Fix the initial SQL patch directly (not a new patch). Create fire-and-forget UPDATE script for existing live DB. No collaborators/guests roles.

---

## 9. Implementation Order

1. **Phase 1** (SDK): Move auth core to SDK + add NATS headers + add jose dep -> `pnpm run build` + `pnpm test`
2. **Phase 2** (BE): Port adapters + refactor auth middleware + add proxy -> `pnpm run check` + `pnpm run build` + `pnpm test`
3. **Phase 3** (US): Auth port adapters + providers CRUD + NATS auth + composite handler -> `pnpm run build` + `pnpm test`
4. **Phase 4** (FE): Settings page + tab + i18n -> `pnpm run check`
5. **Integration test**: Start BE + emailsender, verify end-to-end:
   - FE -> BE proxy -> emailsender HTTP CRUD (with auth forwarding)
   - BE -> emailsender NATS (with auth headers)
   - Unauthenticated requests rejected at every layer

---

## 10. Risk Assessment

| Risk | Mitigation |
|------|------------|
| BE auth middleware refactor breaks existing routes | Re-export wrappers preserve all existing imports; `pnpm test` catches regressions |
| SDK jose dependency adds bundle size | jose is tree-shakeable; only auth consumers pay the cost |
| Microservice cross-schema queries break isolation | Acceptable for config/lookup tables (auth_configurations, user_profiles, role_mappings); business data stays schema-isolated |
| NATS headers not supported by all NATS clients | NATS headers are standard (NATS-2.2+); verify NATS server version |
| Proxy cache stale service_registry entries | TTL-based cache (60s) + manual refresh |
| Hard delete loses provider config history | Acceptable for config data; can add soft-delete later |
| OIDC discovery latency on microservice startup | SDK caches JWKS singleton per issuer; first request pays the cost |

---

*This plan was generated empirically by reading actual source files across all 4 repositories + querying the live Postgres database via MCP. The BE auth stack (7 files, ~900 lines) was read in full to design the SDK refactor. No assumptions were made about file structure or code patterns.*