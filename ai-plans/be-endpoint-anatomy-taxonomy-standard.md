# BE Endpoint Anatomy, Taxonomy & Naming Standard

## Status: DRAFT — awaiting user approval
## Branch: feature/i18n-module-translations

## 1. Objective

Establish a single, documented standard for BE endpoint paths, entity class
names, PG table names, and translation key names. Fix all discrepancies
found in the BE, US, DAL, and FE repositories. Create the missing BE
`.devin/rules/api-path-conventions.md`, update `AGENTS.md`, and add a
user-guide page.

## 2. Empirical findings

### 2.1 PG tables (public schema, excluding audit/partitions/test)

| Table name | Singular or plural? |
|---|---|
| api_keys | plural |
| auth_configurations | plural |
| auth_events | plural |
| customers | plural |
| mcp_oauth_clients | plural |
| mfa_action_authorizations | plural |
| organizations | plural |
| role_mappings | plural |
| service_registry | singular — should be `service_registries` (one row per registered service = collection) |
| translations | plural |
| user_invitations | plural |
| user_mfa_factors | plural |
| user_passkeys | plural |
| user_profiles | plural |

All PG tables are **plural** — correct, they represent arrays/collections.

### 2.2 BE entity classes (TypeScript)

| Class name | @Entity table | Singular class? | Plural table? | Match? |
|---|---|---|---|---|
| CustomerEntity | customers | YES | YES | OK |
| OrganizationEntity | organizations | YES | YES | OK |
| AuthConfigurationEntity | auth_configurations | YES | YES | OK |
| UserProfileEntity | user_profiles | YES | YES | OK |
| RoleMappingEntity | role_mappings | YES | YES | OK |
| UserPasskeyEntity | user_passkeys | YES | YES | OK |
| UserMfaFactorEntity | user_mfa_factors | YES | YES | OK |
| UserInvitationEntity | user_invitations | YES | YES | OK |
| MfaActionAuthorizationEntity | mfa_action_authorizations | YES | YES | OK |
| AuthEventEntity | auth_events | YES | YES | OK |
| ServiceRegistryEntity | service_registry | YES | singular | WRONG — table should be `service_registries` (plural) |
| AppTranslationEntity | translations | YES | YES | OK |
| SystemTranslationEntity | translations | YES | YES | OK |
| EmailsenderTranslationEntity | translations | YES | YES | OK |

All entity classes are **singular** — correct, they represent a single row.

### 2.3 US entity classes (TypeScript)

| Class name | @Entity table | Singular class? | Plural table? | Match? |
|---|---|---|---|---|
| ProviderEntity | providers | YES | YES | OK |
| EmailTemplateEntity | email_templates | YES | YES | OK |
| SenderLogEntity | sender_log | YES | singular | WRONG — table should be `sender_logs` |
| ConfigEntryEntity | config | YES | singular | WRONG — table should be `config_entries` |
| ServiceRegistryEntity | service_registry | YES | singular | WRONG — table should be `service_registries` (plural) |
| DocsKbEntity | docs_kb | YES | singular | KEEP — `docs_kb` is a collective noun (knowledge base = collection of entries) |

### 2.4 BE entity meta files — `entity` (URL path) vs `translationKey` (i18n)

| Meta file | entity (URL) | translationKey (i18n) | entity singular? | URL today |
|---|---|---|---|---|
| customers.meta.ts | customer | customer | singular | /api/v1/entities/customer/... |
| organizations.meta.ts | organization | organization | singular | /api/v1/entities/organization/... |
| config-entries.meta.ts | config_entries | config_entry | **plural** | /api/v1/entities/config_entries/... |
| user-profiles.meta.ts | user_profiles | user_profile | **plural** | /api/v1/entities/user_profiles/... |
| role-mappings.meta.ts | role_mappings | role_mapping | **plural** | /api/v1/entities/role_mappings/... |

**Discrepancy:** `customer` and `organization` use singular in the URL,
but `config_entries`, `user_profiles`, and `role_mappings` use plural.
The US rule says plural. The user's decision is **singular**.

### 2.5 BE endpoints — full inventory by category

#### Category A: Entity CRUD (`/api/v1/entities/:entity/...`)

| Entity in URL | Singular/plural | Endpoint |
|---|---|---|
| customer | singular | /api/v1/entities/customer/{meta,list,export,:uuid,restore,bulk-delete,bulk-restore,audit} |
| organization | singular | /api/v1/entities/organization/{meta,list,check-availability,:uuid,restore,audit} |
| config_entries | **plural** | /api/v1/entities/config_entries/{meta,list,:uuid,restore,bulk-delete,bulk-update,audit} |
| user_profiles | **plural** | /api/v1/entities/user_profiles/{meta,list,:uuid,restore,audit,change-password} |
| role_mappings | **plural** | /api/v1/entities/role_mappings/{meta,list,:uuid,audit} + system RPC at /api/v1/system/role-mappings (see Category C) |
| translations | **plural** | /api/v1/entities/translations/{list,:uuid,restore} (new — added by this feature branch) |

#### Category B: Auth RPC (`/api/v1/auth/...`)

| Endpoint | Method | Permission |
|---|---|---|
| /api/v1/auth/login | POST | PUBLIC |
| /api/v1/auth/refresh | POST | PUBLIC |
| /api/v1/auth/config | GET | PUBLIC |
| /api/v1/auth/me | GET/PATCH | AUTHENTICATED_USER |
| /api/v1/auth/me/meta | GET | AUTHENTICATED_USER |
| /api/v1/auth/me/change-password | POST | AUTHENTICATED_USER |
| /api/v1/auth/me/dismiss-auth-method-enforcer | POST | AUTHENTICATED_USER |
| /api/v1/auth/webauthn/signin/{begin,finish} | POST | PUBLIC |
| /api/v1/auth/webauthn/signup/{begin,finish} | POST | AUTHENTICATED_USER |
| /api/v1/auth/webauthn/credentials | GET | AUTHENTICATED_USER |
| /api/v1/auth/webauthn/credentials/:id | DELETE | AUTHENTICATED_USER |
| /api/v1/auth/mfa/enroll/{begin,finish} | POST | AUTHENTICATED_USER |
| /api/v1/auth/mfa/factors | GET | AUTHENTICATED_USER |
| /api/v1/auth/mfa/factors/:uuid | DELETE | AUTHENTICATED_USER |
| /api/v1/auth/mfa/verify | POST | AUTHENTICATED_USER |
| /api/v1/auth/mfa/step-up/{initiate,verify} | POST | AUTHENTICATED_USER |
| /api/v1/auth/welcome/{verify,send-otp,verify-otp,complete} | POST | PUBLIC |
| /api/v1/auth/invitations/:uuid/{revoke,resend} | POST | AUTHENTICATED_ADMIN |
| /api/v1/auth/login-alert | GET | PUBLIC |

**Note:** `/api/v1/auth/organizations` is documented in `authentication.mdx`
but does NOT exist in code. The actual organization CRUD endpoints are at
`/api/v1/entities/organization/...` (see Category A above). The doc must be
fixed.

The only organization-related endpoint under `/system` is
`GET /api/v1/system/organizations/active` — an RPC endpoint that returns a
minimal DTO (uuid, idp_code, idp_name, display_name, avatar) for the sidebar
switcher. It requires only `AUTHENTICATED_USER` (not `ORGANIZATIONS_READ_ALL`)
because any authenticated user needs to see their orgs for the switcher.
This is a legitimate RPC endpoint, NOT a duplicate of the entity CRUD list.

#### Category C: System RPC (`/api/v1/system/...`)

| Endpoint | Method | Permission |
|---|---|---|
| /api/v1/system/organizations/active | GET | AUTHENTICATED_USER |
| /api/v1/system/roles/active | GET | AUTHENTICATED_USER |
| /api/v1/system/permissions | GET | AUTHENTICATED_USER |
| /api/v1/system/password-policy | GET | AUTHENTICATED_USER |
| /api/v1/system/services | GET | AUTHENTICATED_USER |
| /api/v1/system/services/:code | GET/PUT/DELETE | MODULES_* |
| /api/v1/system/services/:code/toggle | PATCH | MODULES_UPDATE |
| /api/v1/system/services/events | GET (SSE) | AUTHENTICATED_USER |
| /api/v1/system/role-mappings | GET/POST | ROLE_MAPPINGS_* |
| /api/v1/system/role-mappings/:idpRole | GET/PUT/DELETE | ROLE_MAPPINGS_* |

**Note:** `/api/v1/system/role-mappings` is a **legacy** endpoint set that
coexists with the entity-pattern endpoints at
`/api/v1/entities/role_mappings/...`. Both are in the same router file
(`role-mappings.router.ts`). The difference:

- **Entity endpoints** (`/api/v1/entities/role_mappings/...`) — keyed by
  `:uuid`, used by the FE `EntityListTable` list page. Standard CRUD shape
  with pagination, search, audit.
- **System endpoints** (`/api/v1/system/role-mappings/...`) — keyed by
  `:idp_role` (the Casdoor role name, NOT the uuid). Used by the FE
  create/edit forms via `useRoleMappings` composable. The `list()` here
  returns `{ roles: [...] }` (a flat array, not paginated).

The system endpoints exist because the create/edit forms fetch roles by
Casdoor role name (`idp_role`), not by UUID. The entity endpoints are
UUID-keyed. Both are needed for different FE workflows:
- List page → entity endpoints (paginated, UUID-keyed, audit trail)
- Create/edit forms → system endpoints (role-name-keyed, flat list for
  dropdowns)

**Decision:** Keep both. The system endpoints are legitimate RPC endpoints
(keyed by business identifier `idp_role`, not UUID). Document them as an
explicit exception in the rules. The entity endpoints follow the standard
CRUD pattern. Rename `role_mappings` → `role_mapping` in the entity path
(Phase 3, deferred). The system path `/api/v1/system/role-mappings` stays
as-is (RPC, not entity CRUD — naming convention for RPC paths is
domain-specific, not entity-singular).

#### Category D: Modules (`/api/v1/modules/...`)

| Endpoint | Method | Permission |
|---|---|---|
| /api/v1/modules | GET | MODULES_READ_ALL |
| /api/v1/modules/:code/meta | GET | MODULES_READ_ALL |

**Issue:** There are actually TWO distinct consumers with different needs:

1. **Shell sidebar** (`GET /api/v1/modules`) — returns a **nav DTO** computed
   by merging entity data with static nav metadata (`buildModuleNavMeta()`).
   The response shape `{ modules: [{ id, name, enabled, icon, route_prefixes, is_reserved }] }`
   is NOT the entity shape. This is an RPC, not entity CRUD.
2. **Admin modules page** (`GET /api/v1/system/services`, `PUT /api/v1/system/services/:code`,
   `DELETE /api/v1/system/services/:code`, `PATCH /api/v1/system/services/:code/toggle`) —
   these ARE entity CRUD on `service_registry` rows, but under the system prefix
   and keyed by `:code` instead of `:uuid`.

**Decision:**
- Move admin CRUD to `/api/v1/entities/service_registry/...` (keyed by `:uuid`,
  standard CRUD verbs, soft-delete instead of hard delete).
- Keep `/api/v1/modules` as an RPC but move it under `/api/v1/system/modules`
  (it's a system RPC returning a computed nav DTO, not entity rows).
- **Remove the toggle endpoint** — it does nothing except flip `is_enabled`
  and call `repo.update()`. The FE should use `PUT /api/v1/entities/service_registry/:uuid`
  with `{ is_enabled: true/false }`. No side effects, no cascading logic, no
  event emission — it's a plain field update.
- The SSE events endpoint (`/api/v1/system/services/events`) stays under system
  (it's an infrastructure RPC, not entity CRUD).

**Proposed endpoint layout:**

| Endpoint | Category | Purpose |
|---|---|---|
| `GET /api/v1/entities/service_registry/list` | Entity CRUD | Admin list (paginated) |
| `GET /api/v1/entities/service_registry/:uuid` | Entity CRUD | Admin get single by UUID |
| `GET /api/v1/entities/service_registry/meta` | Entity CRUD | Entity metadata |
| `POST /api/v1/entities/service_registry` | Entity CRUD | Create (register new service) |
| `PUT /api/v1/entities/service_registry/:uuid` | Entity CRUD | Update (including `is_enabled`) |
| `DELETE /api/v1/entities/service_registry/:uuid` | Entity CRUD | Soft-delete |
| `POST /api/v1/entities/service_registry/:uuid/restore` | Entity CRUD | Restore |
| `GET /api/v1/entities/service_registry/:uuid/audit` | Entity CRUD | Audit history |
| `GET /api/v1/system/modules` | System RPC | Sidebar nav DTO (computed) |
| `GET /api/v1/system/modules/:code/meta` | System RPC | Nav metadata for breadcrumbs |
| `GET /api/v1/system/services/events` | System RPC | SSE stream (infrastructure) |

**Breaking changes:**
- Keying changes from `:code` to `:uuid` for admin CRUD
- Delete changes from hard delete to soft delete (needs `deleted_at`/`deleted_by` columns)
- Toggle endpoint removed — FE uses `PUT` with `{ is_enabled }` instead
- Response shape changes from `{ services: [...] }` to `{ rows: [...], total }`
- `/api/v1/modules` moves to `/api/v1/system/modules`

#### Category E: MCP (`/mcp/...` + `/.well-known/...`)

MCP is its own category — NOT AUTH, NOT RPC, NOT CRUD. It is a tool-calling
protocol for AI clients. Everything under `/mcp` stays under `/mcp`.

| Endpoint | Method | Auth |
|---|---|---|
| /.well-known/oauth-authorization-server | GET | PUBLIC (RFC 8414) |
| /.well-known/oauth-protected-resource/mcp | GET | PUBLIC (RFC 9728) |
| /mcp/oauth/register | POST | PUBLIC (DCR) |
| /mcp/oauth/register/:clientId | DELETE | PUBLIC (DCR) |
| /mcp/oauth/authorize | GET | session |
| /mcp/oauth/callback | GET | session |
| /mcp/oauth/token | POST | client auth |
| /mcp (SSE/streamable HTTP) | POST | bearer (MCP token verifier) |

**Protocol constraint:** The `.well-known` discovery URLs are mandated by
RFC 8414 and RFC 9728 — they MUST stay at the root. The MCP transport
endpoint (`/mcp`) and OAuth helper endpoints (`/mcp/oauth/...`) stay under
`/mcp` because MCP is a distinct protocol, not a variant of AUTH/CRUD/RPC.

**Decision:** KEEP all MCP endpoints under `/mcp/...`. Do NOT move them
under `/api/v1/auth/...` or any other prefix. MCP is a special case — a
tool-calling protocol for AIs with its own OAuth flow (Authorization Code
+ PKCE + DCR), its own token verifier, and its own transport. Grouping it
with AUTH would be a category error.

**Note:** `client_credentials` grant is NOT implemented anywhere and is
out of scope for this plan. M2M API access (scripts, integrations) is a
separate concern that would require its own token endpoint and client
registry — deferred to a future plan.

#### Category F: Translations runtime read (`/api/v1/translations/...`)

| Endpoint | Method | Permission |
|---|---|---|
| /api/v1/translations/public/:language | GET | PUBLIC |
| /api/v1/translations/:module/:language | GET | AUTHENTICATED_USER |

**Issue:** These are RPC-style reads (return a flat dict, not entity rows).
They should be under the SYSTEM prefix since SYSTEM is the default module
for BE-internal RPC endpoints.

**Decision:** Move to:
- `GET /api/v1/system/translations/public/:language`
- `GET /api/v1/system/translations/:module/:language`

#### Category G: Translations admin CRUD (`/api/v1/entities/translations/...`)

| Endpoint | Method | Permission |
|---|---|---|
| /api/v1/entities/translations/list | GET | TRANSLATIONS_MANAGE |
| /api/v1/entities/translations | POST | TRANSLATIONS_MANAGE |
| /api/v1/entities/translations/:uuid | PUT/DELETE | TRANSLATIONS_MANAGE |
| /api/v1/entities/translations/:uuid/restore | POST | TRANSLATIONS_MANAGE |

**Issue:** Entity name is `translations` (plural). Should be `translation`
(singular) per the new standard.

**Decision:** Rename to `/api/v1/entities/translation/...`

#### Category H: Health & OpenAPI

| NOW | WILL BE | Breaking? |
|---|---|---|
| /api/v1/health | /api/v1/**system**/health | YES |
| /api/v1/openapi.json | /api/v1/**system**/openapi.json | YES |
| /api/v1/openapi/aggregated.json | /api/v1/**system**/openapi/aggregated.json | YES |

**Decision:** Move all three under `/api/v1/system/...`. They are RPCs
(health probe, spec dump, aggregated spec dump) and belong with the system
module. Keeping them at the root level creates exceptions to the standard
for no benefit — the path taxonomy should have few, clean prefixes.

**Impact:**
- BE: Update `app.get("/api/v1/health", ...)` in `index.ts`
- BE: Update `router.get("/api/v1/openapi.json", ...)` in `openapi/router.ts`
- BE: Update `router.get("/api/v1/openapi/aggregated.json", ...)` in `openapi/aggregated-router.ts`
- BE: Update `service_documentation` URL in `mcp/oauth/metadata.ts`
- BE: Update spec URL in `mcp/tools/openapi-discovery.ts` (used to fetch microservice specs)
- BE: Update `aggregated-router.ts` — it fetches `/api/v1/openapi.json` from each microservice (US must also move)
- BE: Update `protected-router.ts` example comment
- BE: Update test references in `auth/__tests__/mfa-integration.test.ts` and `mcp/__tests__/openapi-discovery.test.ts`
- FE: Update `fetchHealth()` in `api.ts`
- FE: Update `backend-availability.svelte.ts` health probe URL
- FE: Update `e2e/global.setup.ts` BE reachability check
- US: Move `/api/v1/openapi.json` to `/api/v1/system/openapi.json` (aggregated-router fetches it from each microservice)

### 2.6 US endpoints (emailsender)

| Endpoint | Entity name | Singular/plural |
|---|---|---|
| /api/v1/entities/providers/... | providers | plural |
| /api/v1/entities/config_entries/... | config_entries | plural |

**US rule says plural.** New standard says singular. The US rule must be
updated and the US endpoints renamed.

### 2.7 MCP dispatch (BE)

The `buildProxyPath()` function in `dispatch.ts` builds:
`/ws/${module}/api/v1/entities/${entity}/list`

It uses the `entity` value from the meta. If we change entity names to
singular, the MCP dispatch will automatically use singular — no code
change needed in dispatch.ts itself, but the US microservices must also
rename their entity paths to match.

## 3. The standard (proposed)

### 3.1 Naming convention rules

| Layer | Name form | Rationale | Example |
|---|---|---|---|
| PG table | snake_case **plural** | Table = collection of rows (array) | `customers`, `user_profiles` |
| TS/Node entity class | PascalCase **singular** | Class = schema of ONE row | `CustomerEntity`, `UserProfileEntity` |
| TS/Node interface/type | PascalCase **singular** | Type = schema of ONE row | `Customer`, `UserProfile` |
| API URL entity segment | snake_case **singular** | URL identifies a resource type (singular) | `/api/v1/entities/customer/...` |
| Translation key entity segment | snake_case **singular** | Already established by FE rule | `entities.customer.title` |
| Meta file `entity` field | snake_case **singular** | Matches URL | `entity: "customer"` |
| Meta file `translationKey` field | snake_case **singular** | Matches i18n key | `translationKey: "customer"` |

### 3.2 Endpoint path taxonomy

| Category | Path prefix | API style | Purpose |
|---|---|---|---|
| **Entity CRUD** | `/api/v1/entities/:entity/...` | RESTful CRUD | Standard lifecycle operations on database-backed entities |
| **Auth RPC** | `/api/v1/auth/...` | RPC | Authentication, session, MFA, WebAuthn |
| **System RPC** | `/api/v1/system/...` | RPC | BE-internal infrastructure, config, runtime reads, health, OpenAPI |
| **MCP** | `/mcp/...` | Tool protocol | AI tool-calling protocol (OAuth + transport) |
| **Webhooks** (US only) | `/webhook/...` | RPC | External callbacks |
| **Well-known** | `/.well-known/...` | RPC | Protocol-mandated discovery (OAuth, etc.) |

**Entity CRUD standard verbs:**

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
POST   /api/v1/entities/:entity/bulk-update       → bulk update
POST   /api/v1/entities/:entity/duplicate         → bulk duplicate
GET    /api/v1/entities/:entity/export            → streamed export
GET    /api/v1/entities/:entity/aggregate         → aggregate query
GET    /api/v1/entities/:entity/check-availability → uniqueness check
POST   /api/v1/entities/:entity/:uuid/:action     → entity-scoped action
```

`:entity` is always snake_case **singular**.

## 4. Discrepancy table — NOW vs WILL BE

### 4.1 BE entity meta `entity` field (URL path segment)

| Meta file | NOW (entity) | WILL BE (entity) | Breaking? |
|---|---|---|---|
| customers.meta.ts | customer | customer | No |
| organizations.meta.ts | organization | organization | No |
| config-entries.meta.ts | config_entries | **config_entry** | YES |
| user-profiles.meta.ts | user_profiles | **user_profile** | YES |
| role-mappings.meta.ts | role_mappings | **role_mapping** | YES |

### 4.2 BE entity CRUD endpoints

| NOW | WILL BE | Breaking? |
|---|---|---|
| /api/v1/entities/customer/... | /api/v1/entities/customer/... | No |
| /api/v1/entities/organization/... | /api/v1/entities/organization/... | No |
| /api/v1/entities/config_entries/... | /api/v1/entities/**config_entry**/... | YES |
| /api/v1/entities/user_profiles/... | /api/v1/entities/**user_profile**/... | YES |
| /api/v1/entities/role_mappings/... | /api/v1/entities/**role_mapping**/... | YES |
| /api/v1/entities/translations/... | /api/v1/entities/**translation**/... | YES (new, no consumers yet) |

### 4.3 BE translations runtime read

| NOW | WILL BE | Breaking? |
|---|---|---|
| /api/v1/translations/public/:language | /api/v1/**system**/translations/public/:language | YES (new, only FE consumes) |
| /api/v1/translations/:module/:language | /api/v1/**system**/translations/:module/:language | YES (new, only FE consumes) |

### 4.4 BE MCP endpoints

| NOW | WILL BE | Breaking? |
|---|---|---|
| /mcp/oauth/register | /mcp/oauth/register (no change) | No |
| /mcp/oauth/register/:clientId | /mcp/oauth/register/:clientId (no change) | No |
| /mcp/oauth/authorize | /mcp/oauth/authorize (no change) | No |
| /mcp/oauth/callback | /mcp/oauth/callback (no change) | No |
| /mcp/oauth/token | /mcp/oauth/token (no change) | No |
| /.well-known/oauth-authorization-server | /.well-known/oauth-authorization-server (no change) | No |
| /.well-known/oauth-protected-resource/mcp | /.well-known/oauth-protected-resource/mcp (no change) | No |

**Decision:** NO CHANGE. MCP is a distinct protocol (tool-calling for AIs),
not a variant of AUTH/CRUD/RPC. All MCP endpoints stay under `/mcp/...`.
The `.well-known` discovery endpoints stay at the root (RFC-mandated).

### 4.5 BE modules endpoint

| NOW | WILL BE | Breaking? |
|---|---|---|
| /api/v1/modules | /api/v1/**system**/modules (RPC — nav DTO) | YES |
| /api/v1/modules/:code/meta | /api/v1/system/modules/:code/meta | YES |
| /api/v1/system/services | /api/v1/**entities/service_registry**/list | YES |
| /api/v1/system/services/:code | /api/v1/entities/service_registry/:uuid | YES (keyed by UUID) |
| /api/v1/system/services/:code (PUT) | /api/v1/entities/service_registry/:uuid (PUT) | YES |
| /api/v1/system/services/:code (DELETE) | /api/v1/entities/service_registry/:uuid (DELETE, soft) | YES (hard→soft) |
| /api/v1/system/services/:code/toggle | **REMOVED** — use PUT with `{ is_enabled }` | YES |
| /api/v1/system/services/events | /api/v1/system/services/events (no change) | No |

**Decision:** DEFER to a separate PR. The admin CRUD move requires:
- Adding `deleted_at`/`deleted_by` columns to `service_registry` (soft-delete)
- Creating a `service_registry.meta.ts` file
- Registering `service_registry` in the MCP entity registry
- Changing FE admin pages from `:code` to `:uuid` keying
- Removing the toggle endpoint and updating FE to use `PUT` with `{ is_enabled }`
- Moving `/api/v1/modules` to `/api/v1/system/modules` and updating the shell

### 4.6 US entity endpoints

| NOW | WILL BE | Breaking? |
|---|---|---|
| /api/v1/entities/providers/... | /api/v1/entities/**provider**/... | YES |
| /api/v1/entities/config_entries/... | /api/v1/entities/**config_entry**/... | YES |

### 4.7 US PG tables (wrong names)

| NOW | WILL BE | Breaking? |
|---|---|---|
| emailsender.sender_log | emailsender.**sender_logs** | YES (rename table) |
| emailsender.config | emailsender.**config_entries** | YES (rename table) |
| ai.config | ai.**config_entries** | YES (rename table) |
| ai.docs_kb | ai.docs_kb (collective — keep) | No |

### 4.7a BE PG table — service_registry

| NOW | WILL BE | Breaking? |
|---|---|---|
| public.service_registry | public.**service_registries** | YES (rename table) |

**Why it's wrong:** The table holds one row per registered service — it's
a collection of service registrations, so the plural `service_registries`
is correct per the standard (PG table = plural = collection of rows).

**No blocking logic:** The table name is only referenced via `@Entity`
decorators (BE + US) and US test helpers (truncate). No raw SQL with
hardcoded table name. The DAL generates SQL from the decorator.

**Impact:**
- BE: `@Entity("service_registry")` → `@Entity("service_registries")` in `service_registry_entity.ts`
- US: `@Entity("service_registry", "public")` → `@Entity("service_registries", "public")` in `service_registry_entity.ts`
- US: Update test helpers (truncate table name)
- US: Update `snapshot-entities.json`
- DB: `ALTER TABLE public.service_registry RENAME TO service_registries`
- DB: Update any indexes/constraints that reference the old name

### 4.8 US entity classes (wrong @Entity table name)

| Class | NOW (@Entity table) | WILL BE |
|---|---|---|
| SenderLogEntity | sender_log | sender_logs |
| ConfigEntryEntity (emailsender) | config | config_entries |
| ConfigEntryEntity (ai) | config | config_entries |
| ServiceRegistryEntity (US) | service_registry | service_registries |
| DocsKbEntity | docs_kb | docs_kb (KEEP — collective noun) |

## 5. Implementation plan

### Phase 1: Documentation (no code changes)

**5.1 Create `primebrick-be-v3/.devin/rules/api-path-conventions.md`**

New rule file covering:
- The 6 endpoint categories (Entity CRUD, Auth RPC, System RPC, MCP, Webhooks, Well-known)
- Entity CRUD standard verbs
- Naming convention table (PG table = plural, class = singular, URL = singular, translation key = singular)
- Explicit statement: "SYSTEM is the default module for BE-internal RPC endpoints (including health and OpenAPI). AUTH is a separate module for authentication. ENTITIES is for RESTful CRUD only. MCP is a distinct tool-calling protocol for AIs."
- MCP exception: `.well-known` URLs are protocol-mandated at the root, everything else under `/mcp/...`
- Modules endpoint exception: documented as a known deviation to be fixed in a future PR

**5.2 Update `primebrick-be-v3/AGENTS.md`**

Add a new section "API Endpoint Conventions" that:
- References `.devin/rules/api-path-conventions.md`
- Lists the 6 categories with one-line descriptions
- Includes the naming convention table
- States: "Entity class = singular (one row schema). PG table = plural (collection). URL entity segment = singular."
- States: "AUTH and SYSTEM are RPC-style APIs. ENTITIES is RESTful CRUD. Do not mix them."
- States: "MCP is a distinct tool-calling protocol for AIs. Everything under `/mcp/...` stays under `/mcp/...`. The `.well-known` discovery URLs are protocol-mandated at the root."

**5.3 Create `primebrick-be-v3/docs/user-guide/api-conventions.mdx`**

New user-guide page covering:
- The endpoint taxonomy with examples
- The naming convention table
- curl examples for each category
- The entity CRUD standard verbs
- The distinction between RESTful CRUD (entities) and RPC (auth/system)

**5.4 Update `primebrick-be-v3/docs/user-guide/_order.json`**

Add `api-conventions` to the sidebar order.

**5.4a Fix `primebrick-be-v3/docs/user-guide/authentication.mdx`**

The doc incorrectly lists `/api/v1/auth/organizations` as the organization
CRUD path. The actual path is `/api/v1/entities/organization/...` (see
`organizations.router.ts`). Remove the incorrect table from the auth doc
and add a cross-reference to the new `api-conventions.mdx` page. The only
organization-related endpoint under `/system` is
`GET /api/v1/system/organizations/active` (sidebar switcher RPC) — this
should be documented in the system RPC section, not as organization CRUD.

**5.5 Update `primebrick-us-v3/.devin/rules/api-path-conventions.md`**

Change:
- "`:entity` is the snake_case **plural** noun" → "`:entity` is the snake_case **singular** noun"
- Update all examples to singular
- Add the same naming convention table (PG table = plural, class = singular, URL = singular)
- Update the "What NOT to do" section

**5.6 Update `primebrick-us-v3/docs/user-guide/conventions.mdx`**

Mirror the US rule changes:
- Change "plural" to "singular" for entity paths
- Update all examples to singular
- Add the naming convention table

**5.7 Update `primebrick-us-v3/AGENTS.md`**

Update the API Path Conventions reference to mention singular entity names.

**5.8 Update `primebrick-fe-v3/.devin/rules/translation-key-convention.md`**

Add a note clarifying that the `entity` field in meta files is now singular
(matching the URL), and `translationKey` is also singular (already established).

### Phase 2: Code fixes — translations (this feature branch)

These are the translations-specific fixes that belong in this feature branch.

**5.9 BE: Rename translations entity CRUD to singular**

- `translations-router.ts`: Change all `/api/v1/entities/translations/...` to `/api/v1/entities/translation/...`
- `translations-router.ts`: Move runtime read endpoints from `/api/v1/translations/...` to `/api/v1/system/translations/...`
- Update the router header comment

**5.10 BE: MCP endpoints — NO CHANGE**

- MCP endpoints stay under `/mcp/...` — MCP is a distinct protocol, not AUTH/CRUD/RPC
- No changes to `src/modules/mcp/index.ts` mount paths
- No changes to `src/modules/mcp/oauth/metadata.ts` advertised URLs

**5.11 FE: Update API calls**

- `src/lib/api.ts`: Update translations runtime read URLs to `/api/v1/system/translations/...`
- `src/lib/api.ts`: Update translations admin CRUD URLs to `/api/v1/entities/translation/...`
- `src/lib/mcp-oauth.ts`: No change (MCP OAuth URLs stay at `/mcp/oauth/...`)

**5.12 FE: Update admin translations page**

- `src/routes/(app)/system/settings/translations/+page.svelte`: No change needed (uses api.ts functions)

### Phase 3: Code fixes — existing entity endpoints (DEFERRED to separate PRs)

These are breaking changes to existing endpoints. They should be done in
dedicated PRs with deprecation notices, not in this feature branch.

**5.13 DEFERRED: Rename config_entries → config_entry**

- BE: Update `config-entries.meta.ts`, `config-entries.router.ts`, all paths
- BE: Add deprecation redirect from old plural path to new singular path
- FE: Update `src/lib/api.ts` and all config list pages
- US: Update `emailsender/src/server/config-route.ts` and OpenAPI spec

**5.14 DEFERRED: Rename user_profiles → user_profile**

- BE: Update `user-profiles.meta.ts`, `user-profiles.router.ts`, all paths
- BE: Add deprecation redirect
- FE: Update all user profile pages

**5.15 DEFERRED: Rename role_mappings → role_mapping**

- BE: Update `role-mappings.meta.ts`, system-router.ts role-mappings paths
- BE: Add deprecation redirect
- FE: Update role management pages

**5.16 DEFERRED: Rename US providers → provider**

- US: Update `emailsender/src/server/providers-route.ts` and OpenAPI spec
- US: Add deprecation redirect
- FE: Update emailsender admin pages (if any)

**5.17 DEFERRED: Rename US PG tables**

- US: Rename `emailsender.sender_log` → `emailsender.sender_logs`
- US: Rename `emailsender.config` → `emailsender.config_entries`
- US: Rename `ai.config` → `ai.config_entries`
- US: Update entity classes, DAL, routes, OpenAPI specs
- US: Add DB migration patches

**5.18 DEFERRED: Move service_registry admin CRUD to /api/v1/entities/ + move /modules to /system/modules**

- BE: Create `service_registry.meta.ts` (does not exist yet)
- BE: Add `deleted_at`/`deleted_by` columns to `service_registry` (soft-delete support)
- BE: Register `service_registry` in MCP entity registry
- BE: Move admin CRUD from `/api/v1/system/services/...` to `/api/v1/entities/service_registry/...` (keyed by `:uuid`)
- BE: Move `/api/v1/modules` to `/api/v1/system/modules` (RPC — nav DTO)
- BE: Move `/api/v1/modules/:code/meta` to `/api/v1/system/modules/:code/meta`
- BE: **Remove** `/api/v1/system/services/:code/toggle` — FE uses `PUT` with `{ is_enabled }`
- BE: Keep `/api/v1/system/services/events` (SSE — infrastructure RPC)
- FE: Update `fetchServices()` → `fetchServiceRegistryList()` (new URL + response shape)
- FE: Update `fetchService(code)` → `fetchServiceRegistry(uuid)` (keyed by UUID)
- FE: Update `toggleModule()` → use `PUT` with `{ is_enabled: !current }`
- FE: Update `deleteModule()` → soft-delete by UUID
- FE: Update `updateService()` → `PUT /api/v1/entities/service_registry/:uuid`
- FE: Update `fetchModules()` → `/api/v1/system/modules`
- FE: Update `fetchModuleMeta()` → `/api/v1/system/modules/:code/meta`
- FE: Update admin modules page to use `EntityListTable` pattern (like organizations/users)
- FE: Update shell `modules-shell.svelte.ts` to use new `/api/v1/system/modules` URL

**5.19 DEFERRED: Rename PG table service_registry → service_registries**

- DB: `ALTER TABLE public.service_registry RENAME TO service_registries`
- DB: Update indexes/constraints referencing old name
- BE: Update `@Entity("service_registry")` → `@Entity("service_registries")` in `service_registry_entity.ts`
- US: Update `@Entity("service_registry", "public")` → `@Entity("service_registries", "public")` in `service_registry_entity.ts`
- US: Update test helpers (truncate table name)
- US: Update `snapshot-entities.json`
- No blocking logic — table name is only referenced via `@Entity` decorators and test helpers

**5.20 DEFERRED: Move health & OpenAPI endpoints under /api/v1/system/...**

- BE: Move `/api/v1/health` → `/api/v1/system/health` in `index.ts`
- BE: Move `/api/v1/openapi.json` → `/api/v1/system/openapi.json` in `openapi/router.ts`
- BE: Move `/api/v1/openapi/aggregated.json` → `/api/v1/system/openapi/aggregated.json` in `openapi/aggregated-router.ts`
- BE: Update `service_documentation` URL in `mcp/oauth/metadata.ts`
- BE: Update spec fetch URL in `mcp/tools/openapi-discovery.ts`
- BE: Update `aggregated-router.ts` — it fetches `/api/v1/openapi.json` from each microservice
- BE: Update `protected-router.ts` example comment
- BE: Update test references (`mfa-integration.test.ts`, `openapi-discovery.test.ts`)
- FE: Update `fetchHealth()` in `api.ts`
- FE: Update `backend-availability.svelte.ts` health probe URL
- FE: Update `e2e/global.setup.ts` BE reachability check
- US: Move `/api/v1/openapi.json` → `/api/v1/system/openapi.json` (aggregated-router fetches it from each microservice)
- Rationale: These are RPCs (health probe, spec dump). Keeping them at root level creates exceptions to the standard for no benefit.

## 6. Verification

After Phase 2:

1. BE build passes (`pnpm run build`)
2. BE tests pass (`pnpm test`)
3. FE check passes (`pnpm run check`)
4. FE tests pass (`pnpm test`)
5. OAuth metadata returns correct endpoint URLs (unchanged — MCP stays under `/mcp/...`)
6. Translations runtime read works at `/api/v1/system/translations/...`
7. Translations admin CRUD works at `/api/v1/entities/translation/...`
8. No remaining `/api/v1/translations/...` paths in the codebase (MCP paths stay under `/mcp/...`)

## 7. Files to create/edit

### Create (new)
- `primebrick-be-v3/.devin/rules/api-path-conventions.md`
- `primebrick-be-v3/docs/user-guide/api-conventions.mdx`

### Edit (BE)
- `primebrick-be-v3/AGENTS.md` — add API Endpoint Conventions section
- `primebrick-be-v3/docs/user-guide/_order.json` — add api-conventions
- `primebrick-be-v3/src/modules/system/translations-router.ts` — rename to singular + move runtime read

### Edit (FE)
- `primebrick-fe-v3/src/lib/api.ts` — update translation URLs (MCP URLs unchanged)
- `primebrick-fe-v3/.devin/rules/translation-key-convention.md` — add note about entity field

### Edit (US)
- `primebrick-us-v3/.devin/rules/api-path-conventions.md` — change plural to singular
- `primebrick-us-v3/docs/user-guide/conventions.mdx` — change plural to singular
- `primebrick-us-v3/AGENTS.md` — update reference

### Edit (DAL)
- `primebrick-dal-v3/AGENTS.md` — add naming convention note (PG table = plural, entity class = singular)

## 8. What is NOT in this plan

- Renaming existing `config_entries`/`user_profiles`/`role_mappings` endpoints (DEFERRED)
- Renaming US `providers` endpoint (DEFERRED)
- Renaming US PG tables (`sender_log`, `config`) (DEFERRED)
- Renaming PG table `service_registry` → `service_registries` (DEFERRED — no blocking logic, but cross-repo DB migration)
- Moving `/api/v1/modules` to `/api/v1/system/modules` + moving service_registry admin CRUD to `/api/v1/entities/service_registry/...` (DEFERRED)
- Moving `/api/v1/auth/organizations` to `/api/v1/entities/organization/...` — NOT NEEDED (the path doesn't exist; the doc is wrong and must be fixed in Phase 1)
- Moving `/api/v1/system/role-mappings` to `/api/v1/entities/role_mapping/...` — NOT NEEDED (the system endpoints are legitimate RPC keyed by `idp_role`, not UUID — both sets are needed)
- Moving MCP endpoints (`/mcp/...`) under `/api/v1/auth/...` or any other prefix — NOT NEEDED (MCP is a distinct protocol, not AUTH/CRUD/RPC — stays under `/mcp/...`)
- Implementing `client_credentials` OAuth grant for M2M API access — OUT OF SCOPE (deferred to a future plan; would need its own token endpoint + client registry)
- Moving `/api/v1/health` and `/api/v1/openapi...` to `/api/v1/system/...` (DEFERRED — breaking change for FE, US, MCP discovery, and E2E tests)

All deferred items are documented as known exceptions in the new rules.
