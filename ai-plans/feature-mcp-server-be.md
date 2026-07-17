# PLAN: MCP Server in Primebrick Backend

> **Status:** Draft
> **Owner:** Primebrick Backend Team
> **Language:** English (team-facing prose per project rules)
> **Target repository:** `primebrick-be-v3` (primary), `primebrick-fe-v3` (consent UI), `primebrick-v3-docs` (docs integration)
> **SDK baseline:** `@modelcontextprotocol/server@2.0.0-beta.4` + `@modelcontextprotocol/express@2.0.0-beta.4` + `@modelcontextprotocol/node@2.0.0-beta.4` (v2 beta; stable expected July 28, 2026)

---

## 1. Overview

Implement an **MCP (Model Context Protocol) Server** as a new endpoint inside the Primebrick Backend (`primebrick-be-v3`). The MCP server exposes **11 generic CRUD + discovery + bulk + service management tools** (parameterized by `module` and `entity`) to AI clients (Claude Desktop, Cursor, VS Code) via the **Streamable HTTP** transport.

Authentication uses **OAuth 2.1** with the BE acting as both:

- **OAuth Resource Server** (RFC 9728 — Protected Resource Metadata), and
- **Authorization Server proxy** to Casdoor (RFC 8414 metadata + RFC 7591 Dynamic Client Registration).

The FE renders a **custom consent screen** (SvelteKit). The access token returned to the AI client is a **Casdoor JWT** that is valid for the BE API — preserving RBAC and permissions. The docs site (`primebrick-v3-docs`) gets an `x-mcp-server` OpenAPI extension so Zudoku renders an MCP installation card.

### 1.1 Why this design

- **Single endpoint inside the BE** keeps the auth model, service layer, and proxy logic co-located. No new service to deploy/operate.
- **Casdoor JWT as the MCP access token** means no second token system. The same `verifyAuth()` from `@primebrick/sdk` validates MCP requests. RBAC and wildcard permissions apply unchanged.
- **11 generic tools** (parameterized by `module` and `entity`) keep the LLM tool surface small, deterministic, and high-quality. The LLM discovers available modules/entities via `list_available_entities` and field schemas via `get_entity_meta`.
- **Dynamic microservice entities** are registered at runtime from each microservice's OpenAPI (microservices follow the standardized entity CRUD path pattern, so paths are constructed from the standard template — no per-entity path parsing), so the tool surface grows/shrinks with the service registry — no redeploy. Dispatch is `module="be"` → in-process service layer; `module="<microservice_code>"` → proxy HTTP via `/ws/:serviceCode/...`.

---

## 2. User Decisions (all confirmed)

1. **Runtime location** — Endpoint `/mcp` inside the BE (`primebrick-be-v3`). NOT a separate service, NOT a Cloudflare Worker, NOT Zuplo.
2. **Auth model** — OAuth 2.1 MCP flow. The client AI opens a browser for consent. The BE proxies to Casdoor. The FE renders a custom consent screen. The access token returned is a Casdoor JWT valid for the BE API — preserving RBAC and permissions.
3. **Tool granularity** — 11 generic CRUD + discovery + bulk + service management tools parameterized by `module` and `entity` (not 1:1 OpenAPI mapping, not one tool per endpoint).
4. **API scope** — BE (system) + microservices (dynamically registered from `service_registry`).
5. **SDK version** — `@modelcontextprotocol/server@2.0.0-beta.4` + `@modelcontextprotocol/express@2.0.0-beta.4` + `@modelcontextprotocol/node@2.0.0-beta.4` (v2 beta, stable expected July 28, 2026).
6. **Consent screen** — FE custom consent screen (SvelteKit). BE proxies Casdoor login.
7. **Dynamic Client Registration** — Yes, implement RFC 7591 DCR in the BE.
8. **MCP endpoint path** — `/mcp` (separate from `/api/v1` which requires auth on all routes).
9. **Plan scope** — Single comprehensive plan with all phases.
10. **Docs UI** — Include `x-mcp-server` OpenAPI extension in the plan scope.

---

## 3. Architecture Context (verified empirically)

### 3.1 Backend (`primebrick-be-v3`)

- **Stack:** Express 4 + Node 24 + TypeScript + `tsx` watch.
- **Auth:** Casdoor OIDC in **STANDALONE** mode. JWT verified via `authMiddleware()` in `src/modules/auth/auth.middleware.ts`. The middleware reads the Bearer token from the `Authorization` header or the `access_token` cookie, verifies via `verifyAuth()` from `@primebrick/sdk`, populates `req.user` with `AuthUser` (`id`, `roles`, `permissions`, `isAdmin`), and sets the ALS session.
- **RBAC:** Wildcard-based. `rbacHandler([Permission.XXX])` middleware. `makeProtectedRouter()` enforces the declare-first policy.
- **Service layer:** Request-context-free services (e.g. `CustomersService`) that read the actor from ALS via `requireActor()`. Services do **NOT** touch `req`/`res`.
- **OpenAPI:** Served at `/api/v1/openapi.json` (BE only) and `/api/v1/openapi/aggregated.json` (BE + microservices, paths prefixed with `/ws/:serviceCode`).
- **Service registry:** `ServiceRegistryRepo` reads/writes the `service_registry` table. `ServiceLifecycleSubscriber` listens on NATS subjects `service.register`, `service.heartbeat`, `service.unregister` and updates the DB.
- **Proxy:** BE proxies microservice requests via `/ws/:serviceCode/...` using `proxy-router.ts`. The raw access token is captured in `req.rawAccessToken` for forwarding.
- **Casdoor:** NOT publicly accessible. All Casdoor interactions go through the BE. Current login uses the password grant (`AuthSessionService.login()` in `src/modules/auth/services/auth-session.service.ts`). Casdoor supports the authorization code flow with a consent page (controlled by `ConsentPolicy` on the application).
- **Auth config:** Loaded from the `auth_configurations` DB table via `BeAuthConfigPort`. Contains `casdoor_endpoint`, `casdoor_organization`, `oidc.client_id`, `oidc.client_secret`, etc.
- **Port:** 3001 (dev). **Check before starting.**
- **Package versioning:** FIXED versions only, no ranges.
- **Data model:** `snake_case` everywhere, no DTO transformation.

### 3.2 Frontend (`primebrick-fe-v3`)

- **Stack:** SvelteKit + Svelte 5 (Runes) + TypeScript.
- **Login flow:** FE `LoginForm.svelte` POSTs to `/api/v1/auth/login` with username/password. BE does the password grant to Casdoor, sets httpOnly cookies (`access_token`, `refresh_token`).
- **Port:** 5173 (dev).
- **Svelte 5 rules:** Use `$state`, `$derived`, `$props`. No `createEventDispatcher`.

### 3.3 Docs (`primebrick-v3-docs`)

- **Stack:** Zudoku 0.82.3 + React 19 + Vite 8, deployed to Cloudflare Workers (static assets, SSG).
- **OpenAPI specs:** Extracted from BE source at build time via `scripts/fetch-openapi.mjs` → `apis/system.json`.
- **Config:** `zudoku.config.tsx` is the source of truth. `src/generated-apis.ts` is auto-generated.
- **`x-mcp-server` extension:** Zudoku OpenAPI extension that renders an MCP card with installation instructions for Claude/Cursor/VS Code. Applied at the **operation level**.

### 3.4 MCP SDK v2 (verified)

- `@modelcontextprotocol/server@2.0.0-beta.4` — `McpServer`, `registerTool`, `ResourceTemplate`.
- `@modelcontextprotocol/express@2.0.0-beta.4` — `createMcpExpressApp`, `requireBearerAuth`, `oAuthDiscoveryMetadata`.
- `@modelcontextprotocol/node@2.0.0-beta.4` — `NodeStreamableHTTPServerTransport`.
- **Transport:** Streamable HTTP (NOT SSE — SSE is deprecated since MCP spec 2025-03-26).
- **Auth:** `requireBearerAuth` middleware with the `OAuthTokenVerifier` interface. `oAuthDiscoveryMetadata` helper for RFC 9728 PRM + RFC 8414 AS metadata.
- `createMcpExpressApp` provides DNS rebinding protection and body parsing.

### 3.5 MCP OAuth 2.1 Spec Requirements

- MCP server **MUST** implement OAuth 2.0 Protected Resource Metadata (RFC 9728) — serve `/.well-known/oauth-protected-resource`.
- PRM **MUST** include the `authorization_servers` field.
- Auth server **MUST** provide at least one discovery mechanism (RFC 8414 or OIDC Discovery).
- Auth server **MAY** support Dynamic Client Registration (RFC 7591) — **we WILL implement it**.
- On 401: return `WWW-Authenticate` with a `resource_metadata` parameter.
- Token validation: JWT signature, expiration, scopes, resource.

---

### 3.6 Microservice Path Standardization Requirement

All Primebrick microservices MUST adopt the same entity CRUD path pattern as the BE. This is a prerequisite for the MCP server's generic tool dispatch to work with a predictable path structure.

The standardized pattern is:

```
GET    /api/v1/entities/:entity/meta              → entity metadata
GET    /api/v1/entities/:entity/list              → paginated list
GET    /api/v1/entities/:entity/:uuid             → single record
POST   /api/v1/entities/:entity                   → create
PUT    /api/v1/entities/:entity/:uuid             → update
DELETE /api/v1/entities/:entity/:uuid             → soft-delete
POST   /api/v1/entities/:entity/:uuid/restore     → restore
GET    /api/v1/entities/:entity/:uuid/audit       → audit history
POST   /api/v1/entities/:entity/bulk-delete       → bulk soft-delete
POST   /api/v1/entities/:entity/bulk-restore      → bulk restore
```

This means the `emailsender` microservice must refactor its routes:

- `/api/v1/providers` (GET list) → `/api/v1/entities/providers/list`
- `/api/v1/providers/:uuid` (GET/PUT/DELETE) → `/api/v1/entities/providers/:uuid`
- `/api/v1/providers` (POST create) → `/api/v1/entities/providers`
- `/api/v1/config` → `/api/v1/entities/config/list`, `/api/v1/entities/config/:uuid`, etc.

Non-CRUD endpoints (webhook, sendEmail via NATS) are NOT affected and remain outside the MCP tool scope.

This refactoring is a prerequisite task in Phase 4 (or a pre-phase) before dynamic microservice tool registration can work.

**This convention is now enforced as a Devin rule in `primebrick-us-v3/.devin/rules/api-path-conventions.md` and referenced in `primebrick-us-v3/AGENTS.md` (rule #8). All new microservice routes MUST follow these conventions. The rule defines 4 path categories:**

1. **Entity CRUD** — `/api/v1/entities/:entity/...` (list, get, create, update, delete, restore, audit, meta, bulk-delete, bulk-restore)
2. **Service Actions** — `/api/v1/actions/:action` (non-CRUD business actions like send-email, test-provider-connection)
3. **Webhooks** — `/webhook` or `/webhook/:identifier` (API key auth, outside MCP scope)
4. **System / Health** — `/health`, `/api/v1/openapi.json`, `/api/v1/system/info`

The rule also mandates that every microservice OpenAPI spec includes `operationId` (snake_case), `summary`, and `description` for every operation — these are used by the MCP Server for tool name generation and LLM-readable descriptions.

---

## 3.7 Tool Design — 11 Generic Tools

### Design Principle

Instead of one tool per endpoint (which would create dozens of tools), we use **generic CRUD tools** parameterized by `module` and `entity`. The LLM discovers available modules/entities via `list_available_entities`, learns field schemas via `get_entity_meta`, then calls the appropriate CRUD tool. This reduces the tool count to 11 while covering all BE entities AND all microservice entities.

### Tool List (11 tools)

#### CRUD Generic Tools (7)

**1. `list_entities`**
- **Params**: `module` (string), `entity` (string), `search?` (string), `search_in?` (string[]), `status?` (enum: active/inactive/deleted), `sort_key?` (string), `sort_dir?` (enum: asc/desc), `page?` (number, default 1), `page_size?` (number, default 25, max 100), `filters?` (array of {field, op, value, connector}), `deleted_records?` (enum: EXCLUDED/ONLY/INCLUDED, default EXCLUDED)
- **Description**: "List/search entities with pagination and filtering. Use list_available_entities first to discover valid module/entity combinations. Use get_entity_meta to understand available fields for filtering."
- **Dispatch**: `module="be"` → calls service layer in-process (CustomersService.listCustomers / OrganizationsService.listOrganizations / UserService.listUsers). `module="<microservice>"` → proxy HTTP to the microservice's list endpoint (path resolved from entity registry).

**2. `get_entity`**
- **Params**: `module` (string), `entity` (string), `uuid` (string, UUID format)
- **Description**: "Get a single entity record by UUID."
- **Dispatch**: Same module-based dispatch. BE → service layer getCustomer/getOrganization/getUserByUuid. Microservice → proxy GET to entity's get path.

**3. `create_entity`**
- **Params**: `module` (string), `entity` (string), `data` (record<string, unknown> — entity fields as key-value object)
- **Description**: "Create a new entity record. Use get_entity_meta first to discover required and optional fields. The data object must match the entity's field schema (snake_case field names)."
- **Dispatch**: BE → service layer createCustomer/createOrganization/createUser. Microservice → proxy POST to entity's create path. BE validates data against the entity-specific zod schema.

**4. `update_entity`**
- **Params**: `module` (string), `entity` (string), `uuid` (string, UUID), `data` (record<string, unknown>)
- **Description**: "Update an entity record by UUID. Use get_entity_meta to discover updatable fields. Only provide fields you want to change."
- **Dispatch**: BE → service layer updateCustomer/updateOrganization/updateUserProfile. Microservice → proxy PUT/PATCH to entity's update path.

**5. `delete_entity`**
- **Params**: `module` (string), `entity` (string), `uuid` (string, UUID)
- **Description**: "Soft-delete an entity record by UUID. The record is marked as deleted but can be restored with restore_entity."
- **Dispatch**: BE → service layer deleteCustomer/deleteOrganization. Microservice → proxy DELETE to entity's delete path.

**6. `restore_entity`**
- **Params**: `module` (string), `entity` (string), `uuid` (string, UUID)
- **Description**: "Restore a soft-deleted entity record by UUID."
- **Dispatch**: BE → service layer restoreCustomer/restoreOrganization/restoreUser. Microservice → proxy POST to entity's restore path (if supported).

**7. `get_entity_audit`**
- **Params**: `module` (string), `entity` (string), `uuid` (string, UUID), `page?` (number, default 1), `limit?` (number, default 20, max 100)
- **Description**: "Get the audit history for an entity record. Shows who changed what and when."
- **Dispatch**: BE → service layer getCustomerAudit/getOrganizationAudit/getUserProfileAudit. Microservice → proxy GET to entity's audit path (if supported).

#### Discovery Tools (2)

**8. `list_available_entities`**
- **Params**: (none)
- **Description**: "List all available modules and their entities. Use this first to discover what you can operate on. Returns module codes, entity names, and online/offline status for microservices."
- **Output example**:
```json
{
  "modules": [
    { "code": "be", "name": "Backend (System)", "status": "online", "entities": ["customer", "organization", "user_profiles"] },
    { "code": "emailsender", "name": "Email Sender", "status": "online", "entities": ["providers", "config"] }
  ]
}
```
- **Handler**: Reads service_registry (ServiceRegistryRepo.findAll()) + hardcoded BE entity list. For each online microservice, reads the cached OpenAPI to extract entity names.

**9. `get_entity_meta`**
- **Params**: `module` (string), `entity` (string)
- **Description**: "Get metadata for an entity: available fields, types, validation rules, enum options, required vs optional. Call this before create_entity or update_entity to understand the field schema."
- **Dispatch**: BE → reads the entity's *.meta.ts (customerMeta, organizationMeta, userProfileMeta). Microservice → proxy GET to entity's meta endpoint (if available) or derive from OpenAPI schema.

#### Bulk Tool (1)

**10. `bulk_entity_action`**
- **Params**: `module` (string), `entity` (string), `action` (enum: delete/restore), `uuids` (string[], min 1, max 100)
- **Description**: "Perform a bulk action (delete or restore) on multiple entity records at once. More efficient than calling delete_entity/restore_entity multiple times."
- **Dispatch**: BE customer → uses existing runBulkAction(). Other entities/modules → proxy to bulk endpoint if supported, or iterate single operations.

#### Service Management Tool (1)

**11. `manage_service`**
- **Params**: `action` (enum: list/get/activate/update/delete), `code?` (string — required for get/activate/update/delete), `data?` (record<string, unknown> — required for update)
- **Description**: "Manage microservices in the service registry. Actions:
  - list: Returns all registered microservices with health status, version, endpoints.
  - get: Returns a single microservice by code (requires 'code').
  - activate: Toggles is_enabled on/off for a microservice (requires 'code').
  - update: Updates microservice config fields: name, description, base_url, icon, icon_type, author, github_repo_url (requires 'code' + 'data').
  - delete: PERMANENTLY deletes a microservice from the registry. This is a HARD delete — the record is physically removed and CANNOT be restored. Use with caution (requires 'code')."
- **Dispatch**: All operations call `ServiceRegistryRepo` in-process (the service_registry is a BE-only resource, not proxied to microservices).
  - `list` → `repo.findAll()` (maps to GET /api/v1/system/services)
  - `get` → `repo.findByCode(code)` (maps to GET /api/v1/system/services/:code)
  - `activate` → `repo.toggleEnabled(code, !existing.is_enabled)` (maps to PATCH /api/v1/system/services/:code/toggle)
  - `update` → `repo.updateByCodeAdmin(code, data)` (maps to PUT /api/v1/system/services/:code)
  - `delete` → `repo.hardDeleteByCode(code)` (maps to DELETE /api/v1/system/services/:code)
- **RBAC**: 
  - list/get → `Permission.AUTHENTICATED_USER` / `Permission.MODULES_READ_ALL` / `Permission.MODULES_READ_SINGLE`
  - activate/update → `Permission.MODULES_UPDATE`
  - delete → `Permission.MODULES_DELETE`

### Tools NOT Exposed (Deliberate Exclusions)

| Operation | Reason |
|-----------|--------|
| `export_entity` | Returns binary stream (CSV/XLSX/HTML), not suitable for MCP text output |
| `duplicate_customers` | Too specific, rarely useful for an LLM |
| `change_password` | Sensitive operation, not appropriate for autonomous AI tool |
| `auth/login`, `auth/refresh` | Client AI already has JWT from MCP OAuth flow |
| `auth/me` | LLM doesn't need its own profile |
| `system/password-policy`, `system/roles/active`, `system/organizations/active` | Only for FE forms/dropdowns |
| `check_availability` (email/username/idp_name) | Only for FE form validation; LLM can use list_entities with filters instead |
| `webhook` (microservices) | API key auth, not JWT — outside MCP scope |

### Module → Handler Dispatch Architecture

```
module = "be" (static, in-process)
  entity = "customer"      → CustomersService (in-process, reads actor from ALS)
  entity = "organization"  → OrganizationsService (in-process)
  entity = "user_profiles" → UserService (in-process)

module = "emailsender" (microservice, proxy HTTP)
  entity = "providers" → proxy: GET /ws/emailsender/api/v1/entities/providers/list
  entity = "config"    → proxy: GET /ws/emailsender/api/v1/entities/config/list
  (forwards user's rawAccessToken as Authorization: Bearer header)
```

### Entity Registry (In-Memory)

The BE maintains an **entity registry** — a Map that maps `(module, entity)` to handler metadata:

```typescript
interface EntityRegistryEntry {
  module: string;
  entity: string;
  handler_type: "in-process" | "proxy";
  // For in-process (BE):
  service_factory?: () => EntityService;
  permissions?: Record<Operation, Permission[]>;
  // For proxy (microservice): NO path patterns needed —
  // paths are constructed from the standard pattern:
  //   list:   GET  /ws/{module}/api/v1/entities/{entity}/list
  //   get:    GET  /ws/{module}/api/v1/entities/{entity}/{uuid}
  //   create: POST /ws/{module}/api/v1/entities/{entity}
  //   update: PUT  /ws/{module}/api/v1/entities/{entity}/{uuid}
  //   delete: DELETE /ws/{module}/api/v1/entities/{entity}/{uuid}
  //   restore: POST /ws/{module}/api/v1/entities/{entity}/{uuid}/restore
  //   audit:  GET  /ws/{module}/api/v1/entities/{entity}/{uuid}/audit
  //   meta:   GET  /ws/{module}/api/v1/entities/{entity}/meta
  supported_operations?: Operation[]; // which CRUD ops this entity supports
}
```

- **BE entities**: registered statically at startup (3 entries: customer, organization, user_profiles).
- **Microservice entities**: registered dynamically when a microservice registers via NATS. The BE fetches the microservice's OpenAPI spec, checks which standard entity paths exist, and adds entries to the registry. Paths are constructed from the standard template — NO per-entity path patterns are stored.
- **On unregister**: entries for that module are removed from the registry.

### Microservice OpenAPI → Entity Registry Mapping

Since all microservices now follow the standardized entity CRUD path pattern (`/api/v1/entities/:entity/...`), the entity registry for microservices does NOT store per-entity path patterns. Paths are always constructed from the standard template using just `module` and `entity`.

The mapping logic:

1. Fetch microservice OpenAPI spec from `http://<base_url>/api/v1/openapi.json`
2. For each path matching `/api/v1/entities/:entity/...`, extract the entity name
3. Check which operations exist (list, get, create, update, delete, restore, audit, meta) by checking which standard paths are present
4. Register the entity with `handler_type: "proxy"` and `supported_operations` listing the available ops
5. NO path pattern storage needed — paths are always constructed from the standard template

### RBAC Enforcement

Each tool handler enforces RBAC using the existing permission system:
- The user's JWT is validated by `authMiddleware` (or `requireBearerAuth` with custom `OAuthTokenVerifier`)
- `req.user` contains `permissions` and `isAdmin`
- Before dispatching to the service layer, the tool handler checks the appropriate permission:
  - `list_entities` for `module="be", entity="customer"` → checks `Permission.CUSTOMERS_READ_ALL`
  - `create_entity` for `module="be", entity="customer"` → checks `Permission.CUSTOMERS_CREATE_SINGLE`
  - etc.
- For microservices, the proxy forwards the JWT and the microservice enforces its own RBAC
- Admin users (`is_admin=true`) bypass all checks

### Permission Mapping per (module, entity, operation)

The entity registry also stores the required permission per operation for BE entities:

```typescript
// BE entity registry entry (static)
{
  module: "be",
  entity: "customer",
  handler_type: "in-process",
  permissions: {
    list:   [Permission.CUSTOMERS_READ_ALL],
    get:    [Permission.CUSTOMERS_READ_SINGLE, Permission.CUSTOMERS_READ_ALL],
    create: [Permission.CUSTOMERS_CREATE_SINGLE],
    update: [Permission.CUSTOMERS_UPDATE_SINGLE],
    delete: [Permission.CUSTOMERS_DELETE_SINGLE],
    restore:[Permission.CUSTOMERS_RESTORE_SINGLE],
    audit:  [Permission.CUSTOMERS_READ_AUDIT],
    meta:   [Permission.CUSTOMERS_READ_ALL, Permission.CUSTOMERS_READ_SINGLE],
  }
}
```

---

## 4. Implementation Phases

### Phase 1 — MCP Runtime + BE Tools (MVP)

- Install MCP SDK v2 beta packages (FIXED versions).
- Create the `/mcp` endpoint with Streamable HTTP transport.
- Implement `OAuthTokenVerifier` that reuses the existing `verifyAuth()` from `@primebrick/sdk`.
- Register the 11 generic tools (7 CRUD + 2 discovery + 1 bulk + 1 service management), parameterized by `module` and `entity`.
- Populate the entity registry statically with BE entities (customer, organization, user_profiles) at startup.
- Tool handlers dispatch by `module`: `module="be"` → service layer in-process (no HTTP loopback); `module="<microservice>"` → proxy HTTP via `/ws/:serviceCode/...`.
- Basic auth: Bearer token validation (no OAuth flow yet — manual JWT for testing).

### Phase 2 — OAuth 2.1 Authorization Server

- Implement RFC 9728 Protected Resource Metadata endpoint.
- Implement RFC 8414 Authorization Server Metadata endpoint.
- Implement Dynamic Client Registration (RFC 7591).
- Implement the authorization endpoint (proxy to Casdoor auth code flow).
- Implement the token endpoint (proxy to Casdoor token endpoint).
- Wire `requireBearerAuth` with the custom `OAuthTokenVerifier`.
- 401 responses with `WWW-Authenticate` header.

### Phase 3 — FE Consent Screen

- New SvelteKit route for MCP OAuth consent.
- FE calls BE to initiate the Casdoor auth code flow.
- Custom consent UI showing requested scopes/tools.
- Callback handling.

### Phase 4 — Dynamic Microservice Tools

#### Phase 4a — Microservice Path Standardization (prerequisite)

- Refactor the `emailsender` microservice (and any other microservice) to use the standardized entity CRUD path pattern (`/api/v1/entities/:entity/...`) BEFORE dynamic tool registration can work.
- This is a code change in `primebrick-us-v3/emailsender/src/server/providers-route.ts` and `config-route.ts`:
  - `/api/v1/providers` (GET list) → `/api/v1/entities/providers/list`
  - `/api/v1/providers/:uuid` (GET/PUT/DELETE) → `/api/v1/entities/providers/:uuid`
  - `/api/v1/providers` (POST create) → `/api/v1/entities/providers`
  - `/api/v1/config` → `/api/v1/entities/config/list`, `/api/v1/entities/config/:uuid`, etc.
- Update the microservice OpenAPI specs to reflect the new paths.
- The BE proxy `/ws/:serviceCode/*` already forwards any path, so no BE proxy change needed — only the microservice route handlers need updating.
- Non-CRUD endpoints (webhook, sendEmail via NATS) remain unchanged.
- The emailsender refactoring must comply with the new `api-path-conventions.md` Devin rule (see section 3.6). In particular, the OpenAPI spec (`openapi-route.ts`) must be updated with `operationId` (snake_case), `summary`, and `description` for every operation — these are used by the MCP Server for tool name generation and LLM-readable descriptions.

#### Phase 4b — Dynamic Tool Registration

- Hook into `ServiceLifecycleSubscriber` for register/unregister events.
- Fetch OpenAPI from newly registered microservices.
- Parse OpenAPI paths to extract entity names and check which standard operations exist; add entries to the entity registry (NO path pattern storage — paths constructed from standard template).
- `list_available_entities` reflects newly registered microservice entities (online/offline status).
- On unregister, remove that module's entries from the entity registry.
- Microservice tool calls dispatch via the existing proxy (`/ws/:serviceCode/...`) with the user's `rawAccessToken` forwarded as `Authorization: Bearer`.

### Phase 5 — Docs UI Integration

- Add the `x-mcp-server` extension to the `/mcp` operation in the BE OpenAPI spec.
- Update `fetch-openapi.mjs` if needed to preserve the extension.
- Zudoku renders the MCP card with installation instructions.

---

## 5. Detailed File Plan

### 5.1 New files in `primebrick-be-v3`

| # | Path | Purpose |
|---|------|---------|
| 1 | `src/modules/mcp/index.ts` | Module entry point; exports `mcpRouter()`. |
| 2 | `src/modules/mcp/mcp-server.ts` | `McpServer` instance + registration of the 11 generic tools. |
| 3 | `src/modules/mcp/token-verifier.ts` | `OAuthTokenVerifier` implementation (reuses `verifyAuth`). |
| 4 | `src/modules/mcp/tools/entity-registry.ts` | In-memory entity registry mapping `(module, entity)` → handler metadata + permissions + supported_operations (NO path patterns — paths constructed from standard template). |
| 5 | `src/modules/mcp/tools/generic-tools.ts` | The 11 generic tool definitions (7 CRUD + 2 discovery + 1 bulk + 1 service management), parameterized by `module`/`entity`. |
| 6 | `src/modules/mcp/tools/dispatch.ts` | Dispatch logic: `module="be"` → in-process service layer; `module="<microservice>"` → proxy HTTP. |
| 7 | `src/modules/mcp/oauth/protected-resource-metadata.ts` | RFC 9728 PRM endpoint. |
| 8 | `src/modules/mcp/oauth/authorization-server-metadata.ts` | RFC 8414 AS metadata endpoint. |
| 9 | `src/modules/mcp/oauth/dynamic-client-registration.ts` | RFC 7591 DCR endpoint. |
| 10 | `src/modules/mcp/oauth/authorize.ts` | Authorization endpoint (proxy to Casdoor). |
| 11 | `src/modules/mcp/oauth/token.ts` | Token endpoint (proxy to Casdoor). |
| 12 | `src/modules/mcp/oauth/client-registry.ts` | In-memory/DB store for registered OAuth clients. |
| 13 | `src/modules/mcp/lifecycle-hook.ts` | Hook into `ServiceLifecycleSubscriber` events; updates entity registry on register/unregister. |

### 5.2 Modified files in `primebrick-be-v3`

| # | Path | Change |
|---|------|--------|
| 1 | `src/index.ts` | Mount the `/mcp` router + `/.well-known/` endpoints. |
| 2 | `src/modules/proxy/service-lifecycle-subscriber.ts` | Add hook for MCP entity registry update (register/unregister). |
| 3 | `package.json` | Add MCP SDK dependencies (FIXED versions). |
| 4 | `src/openapi/openapi.ts` | Add `/mcp` operation with `x-mcp-server` extension. |

### 5.3 New files in `primebrick-fe-v3`

| # | Path | Purpose |
|---|------|---------|
| 1 | `src/routes/mcp/consent/+page.svelte` | Custom consent screen. |
| 2 | `src/routes/mcp/callback/+page.svelte` | OAuth callback handler. |
| 3 | `src/lib/mcp-oauth.ts` | MCP OAuth client helpers. |

### 5.4 Modified files in `primebrick-v3-docs`

| # | Path | Change |
|---|------|--------|
| 1 | `apis/system.json` | Picks up `x-mcp-server` from BE OpenAPI automatically via `fetch-openapi.mjs`. |

---

## 6. Code Examples

### 6.1 MCP Server setup — `src/modules/mcp/mcp-server.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { createMcpExpressApp, requireBearerAuth } from "@modelcontextprotocol/express";
import type { OAuthTokenVerifier, AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod/v4";

// Token verifier that reuses existing Casdoor JWT verification.
const tokenVerifier: OAuthTokenVerifier = {
  verifyToken: async (token: string): Promise<AuthInfo> => {
    // Reuse the existing verifyAuth from @primebrick/sdk.
    // This validates the Casdoor JWT and returns AuthInfo.
    // ...
  },
};

// Entity registry — maps (module, entity) → handler metadata + permissions.
// BE entities are registered statically at startup; microservice entities are
// added/removed dynamically as services register/unregister via NATS.
// For proxy entries, paths are constructed from the standard template —
// NO per-entity path patterns are stored.
export const entityRegistry = new Map<string, EntityRegistryEntry>();

// Generic list_entities tool — parameterized by module + entity.
server.registerTool(
  "list_entities",
  {
    description:
      "List/search entities with pagination and filtering. Use list_available_entities first to discover valid module/entity combinations. Use get_entity_meta to understand available fields for filtering.",
    inputSchema: z.object({
      module: z.string().describe('Module code, e.g. "be" or a microservice code'),
      entity: z.string().describe('Entity name, e.g. "customer" or "providers"'),
      search: z.string().optional().describe("Full-text search query"),
      status: z.enum(["active", "inactive", "deleted"]).optional(),
      page: z.number().min(1).optional().default(1),
      page_size: z.number().min(1).max(100).optional().default(25),
      filters: z.array(z.object({
        field: z.string(),
        op: z.string(),
        value: z.unknown(),
        connector: z.enum(["AND", "OR"]).optional(),
      })).optional(),
      deleted_records: z.enum(["EXCLUDED", "ONLY", "INCLUDED"]).optional().default("EXCLUDED"),
    }),
  },
  async (args, extra) => {
    // extra.authInfo contains the validated user.
    // Dispatch by module: "be" → in-process service layer; "<microservice>" → proxy HTTP.
    const entry = entityRegistry.get(`${args.module}:${args.entity}`);
    if (!entry) throw new Error(`Unknown module/entity: ${args.module}/${args.entity}`);
    // RBAC check for BE entities using entry.permissions.list ...
    const result = await dispatchList(entry, args);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);
```

### 6.2 OAuth Protected Resource Metadata (RFC 9728)

```json
// GET /.well-known/oauth-protected-resource
{
  "resource": "https://api.primebrick.dev/mcp",
  "authorization_servers": ["https://api.primebrick.dev"],
  "scopes_supported": ["mcp:tools", "customers:read", "customers:write"],
  "bearer_methods_supported": ["header"]
}
```

### 6.3 OAuth Authorization Server Metadata (RFC 8414)

```json
// GET /.well-known/oauth-authorization-server
{
  "issuer": "https://api.primebrick.dev",
  "authorization_endpoint": "https://api.primebrick.dev/mcp/oauth/authorize",
  "token_endpoint": "https://api.primebrick.dev/mcp/oauth/token",
  "registration_endpoint": "https://api.primebrick.dev/mcp/oauth/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["mcp:tools", "customers:read", "customers:write"]
}
```

### 6.4 Entity registry update on microservice lifecycle

```typescript
// In ServiceLifecycleSubscriber, after handleRegister:
if (status === "online" && is_enabled) {
  // Fetch the microservice OpenAPI, check which standard entity paths exist,
  // and add entries to the entity registry under module = serviceCode.
  // Paths are constructed from the standard template — no path patterns stored.
  await entityRegistry.registerMicroserviceEntities(code, baseUrl);
}
// After handleUnregister:
await entityRegistry.unregisterModule(code);
```

### 6.5 `x-mcp-server` OpenAPI extension

```json
{
  "/mcp": {
    "post": {
      "summary": "Primebrick MCP Server",
      "x-mcp-server": {
        "name": "primebrick-mcp-server",
        "version": "1.0.0",
        "tools": [
          { "name": "list_entities", "description": "List/search entities with pagination and filtering" },
          { "name": "get_entity", "description": "Get a single entity record by UUID" },
          { "name": "create_entity", "description": "Create a new entity record" },
          { "name": "update_entity", "description": "Update an entity record by UUID" },
          { "name": "delete_entity", "description": "Soft-delete an entity record by UUID" },
          { "name": "restore_entity", "description": "Restore a soft-deleted entity record by UUID" },
          { "name": "get_entity_audit", "description": "Get the audit history for an entity record" },
          { "name": "list_available_entities", "description": "List all available modules and their entities" },
          { "name": "get_entity_meta", "description": "Get metadata for an entity (fields, types, validation)" },
          { "name": "bulk_entity_action", "description": "Bulk delete/restore multiple entity records" },
          { "name": "manage_service", "description": "Manage microservices in the service registry (list/get/activate/update/delete)" }
        ]
      },
      "responses": { "200": { "description": "MCP response" } }
    }
  }
}
```

---

## 7. Acceptance Criteria

### 7.1 Phase 1 — MCP Runtime + BE Tools (MVP)

- [ ] `pnpm run build` passes with MCP SDK dependencies.
- [ ] `POST /mcp` with a valid Bearer JWT returns an MCP protocol response.
- [ ] `tools/list` returns exactly 11 tools.
- [ ] `tools/call` with `list_available_entities` returns modules and entities.
- [ ] `tools/call` with `get_entity_meta` for `(module="be", entity="customer")` returns customer field schema.
- [ ] `tools/call` with `list_entities` for `(module="be", entity="customer")` returns paginated customer data.
- [ ] `tools/call` with `get_entity` for `(module="be", entity="customer", uuid=<valid>)` returns single customer.
- [ ] `tools/call` with `create_entity` for `(module="be", entity="customer")` creates a customer.
- [ ] `tools/call` with `manage_service` action=list returns all registered microservices.
- [ ] `tools/call` with `manage_service` action=activate toggles a service's is_enabled.
- [ ] `tools/call` with `manage_service` action=delete returns clear warning about permanent deletion.
- [ ] RBAC permissions enforced per (module, entity, operation) mapping.
- [ ] Tool handlers for BE entities call the service layer directly (no HTTP loopback).
- [ ] Invalid (module, entity) combination returns clear error.

### 7.2 Phase 2 — OAuth 2.1 Authorization Server

- [ ] `GET /.well-known/oauth-protected-resource` returns valid RFC 9728 JSON.
- [ ] `GET /.well-known/oauth-authorization-server` returns valid RFC 8414 JSON.
- [ ] `POST /mcp/oauth/register` registers a new OAuth client (RFC 7591).
- [ ] `GET /mcp/oauth/authorize` redirects to the FE consent screen.
- [ ] `POST /mcp/oauth/token` exchanges a code for a Casdoor JWT.
- [ ] 401 responses include `WWW-Authenticate` with `resource_metadata`.
- [ ] Claude Desktop can complete the OAuth flow and connect.

### 7.3 Phase 3 — FE Consent Screen

- [ ] FE consent screen renders at `/mcp/consent`.
- [ ] User can approve/deny scopes.
- [ ] Callback redirects to the client AI with an authorization code.
- [ ] Svelte 5 Runes used correctly (`$state`, `$derived`, `$props`).

### 7.4 Phase 4 — Dynamic Microservice Tools

- [ ] Starting a microservice registers its entities in the entity registry.
- [ ] Microservice entity paths are parsed from OpenAPI and stored in registry.
- [ ] `list_available_entities` includes microservice entities after registration.
- [ ] `list_entities` for `(module="emailsender", entity="providers")` proxies to `/ws/emailsender/api/v1/entities/providers/list`.
- [ ] Stopping a microservice removes its entities from the registry.
- [ ] Microservice tool calls forward the user's rawAccessToken.
- [ ] Unsupported operations (e.g., restore on providers) return clear "not supported" error.
- [ ] emailsender microservice routes refactored to `/api/v1/entities/:entity/...` pattern.
- [ ] Entity registry does NOT store per-entity path patterns (uses standard template).
- [ ] Unsupported operations return clear "not supported for this entity" error.
- [ ] `api-path-conventions.md` Devin rule created in `primebrick-us-v3/.devin/rules/`
- [ ] `AGENTS.md` in primebrick-us-v3 updated with rule #8 referencing api-path-conventions
- [ ] emailsender OpenAPI spec includes `operationId`, `summary`, `description` for all operations

### 7.5 Phase 5 — Docs UI Integration

- [ ] `x-mcp-server` extension present in the BE OpenAPI spec.
- [ ] Zudoku docs site shows the MCP card with installation instructions.
- [ ] Instructions include the correct URL for the MCP endpoint.

---

## 8. Dependencies to add (FIXED versions)

```json
{
  "@modelcontextprotocol/server": "2.0.0-beta.4",
  "@modelcontextprotocol/express": "2.0.0-beta.4",
  "@modelcontextprotocol/node": "2.0.0-beta.4"
}
```

> **Note:** `zod` is already a dependency (4.4.3) but the MCP SDK v2 requires `zod/v4` — verify compatibility.

---

## 9. Risks and Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| 1 | **SDK v2 beta instability** — API may change before stable (July 28). | Isolate SDK usage in `src/modules/mcp/` module; easy to update. |
| 2 | **Casdoor auth code flow not exposed** — BE currently only does the password grant. Need to implement an auth code flow proxy. | Casdoor supports it natively; just need new endpoints. |
| 3 | **Dynamic Client Registration storage** — In-memory is lost on restart. | Store registered clients in DB (new table or reuse existing). |
| 4 | **Microservice OpenAPI quality** — Entity registry operation detection depends on OpenAPI quality (which standard paths exist). | Clear error when a CRUD operation is not supported for an entity (via `supported_operations`); standardized path pattern reduces parsing complexity. |
| 5 | **Token scope mapping** — MCP scopes vs Casdoor roles vs Primebrick permissions. Need a mapping layer. | Map MCP scopes to the Primebrick `Permission` enum. |
| 6 | **Microservice path refactoring** — Microservices must be refactored to the standardized entity CRUD path pattern. This is a breaking change for existing microservice APIs. | Refactor one microservice at a time (start with emailsender), update OpenAPI specs, update FE proxy calls if needed. The BE proxy `/ws/:serviceCode/*` already forwards any path, so no BE proxy change needed — only the microservice route handlers need updating. |

---

## 10. Rules Compliance

- `snake_case` for all data models.
- FIXED package versions only.
- No DTO transformation between layers.
- Service layer stays request-context-free.
- Never commit without explicit user instruction.
- Check port 3001 before starting the dev server.
- Temp files in `D:\git\primebrick\temp\` only.
- English for all team-facing `.md` files.
- GitFlow rules followed.
