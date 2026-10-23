# Plan — BE MVC migration (`controllers/` layout per module)

> Status: WAVES 1-2 DONE —
> - wave 1: `customers` + `collaboration` moved to `controllers/http/`;
>   audit-diff extracted to `collaborationService.getAuditLogDiff()`.
> - wave 2: `ai-models` + `ai-cerebellum` moved to `controllers/http/`;
>   `invalidateCache()` post-commit hook exposed on both services
>   (DAL no longer instantiated in controllers).
> `modules/index.ts` updated; `controller-boundary.md` MAY-list covers
> shared helpers. BE typecheck green, ai-models tests 21/21.

## Module status table (empirical, verified)

Route lines = lines in `*router*/*route*` files (excluding tests).
"DAL/repo refs" = route files importing `dal`, repositories, `getPool`
for queries — i.e. business-logic leak into the transport layer.

| Module | Route lines | Services | Leak | Assessment |
|---|---|---|---|---|
| `customers` | 271 | yes | `getPool` passed to `runEntityWrite` only | compliant — pure file move |
| `ai-models` | 198 | yes | `new AiModelsDal(getPool()).invalidateCache()` in write handlers | mild — invalidation belongs in the service |
| `collaboration` | 159 | yes | `createRepository(getPool())` + `findAuditById` + uuid-mismatch check in the audit-diff handler | mild — extract into service |
| `ai-cerebellum` | 196 | yes | same pattern as ai-models | mild |
| `system` | 593 | **none** | 4 files with dal/repo refs (`translations-router` 245, `system-router` 211, `services-events-route` 75, `docs-search-route`) | needs service extraction |
| `auth` | 2687 (10 routers) | 8-10 | 7 files | worst: `config-entries.router` 698 (per-item BL loops), role-mappings 308, auth-session 274, webauthn 247, mfa 236, organizations 229, invitation 209, users 188, profiles 150, check 84 |
| `proxy` | 35 + subscriber/job | yes | 0 | `service-lifecycle-subscriber` + `stale-detection-job` are already nats-sub shaped → `controllers/nats-sub/`; `proxy-router` is legit transport (proxying) |
| `mcp` | 0 | n/a | — | `oauth/*.ts` are http endpoints → `controllers/http/oauth/`; `mcp-server`/`tools/` are the MCP transport itself |

## Wave order (rationale)

1. **customers** — pure move, validates the pattern at ~zero cost.
2. **collaboration** — move + small service extraction (audit diff).
3. **ai-models / ai-cerebellum** — move + push `invalidateCache` into services.
4. **system** — first real BL extraction (create `services/`).
5. **auth** — split per router file; start with `config-entries` (worst leak), `auth-check` last.
6. **proxy** — structural move of subscribers.
7. **mcp** — only `oauth/*`.

## Notes on the boundary (empirical)

- `runEntityWrite(getPool(), translations, txFn)` is shared write-tx
  orchestration (`src/http/entity-write.ts`) — it wraps ONE service call;
  treated as transport-level tx plumbing and listed as allowed in
  `.devin/rules/controller-boundary.md`.
- `validateUuidParam`, `assembleMeta`, `deriveEntityActions`,
  `rbacHandler` are transport/meta helpers — allowed.
- `new XxxDal(getPool()).invalidateCache()` inside handlers is a leak —
  cache invalidation after a write belongs inside the service method.

## Wave 3 — system (DONE)

Moved `system` + `translations` + `services-events` + `docs-search` to
`controllers/http/` and extracted BL into services:

- `SystemService` — orgs sidebar DTO, role dropdown, permission catalog,
  password-policy resolution, service-registry admin (get/toggle/delete/
  update with `NotFoundError` + `SERVICE_NOT_FOUND` instead of inline 404).
- `TranslationsService` — wraps `TranslationsDal` (dict cache + CRUD).
- `DocsSearchService` — wraps `searchDocsKb` so controllers never touch
  DAL/repository symbols.
- docs-search validation converted to zod `validateBody` (same 400
  semantics: `embedding` must be a non-empty finite-number array).
- Old `modules/system/*-router.ts`/`*-route.ts` deleted; `modules/index.ts`
  updated. Typecheck clean, router tests still green (16/16).

## Wave 4 — auth (DONE, commit 29568d4)

- All 10 routers + aggregator moved to `controllers/http/auth/` (index.ts
  is the `authRouter()` aggregator — transport composition belongs to the
  controllers layer).
- New `controllers/http/auth/wiring.ts` — composition root. Replaces the
  `makeUserService()`/`makeService()` factories duplicated in 5 routers;
  controllers no longer import `UserProfilesDal`/`CasdoorService`/pool for
  service construction.
- New `services/config-entries.service.ts` — absorbs router BL:
  `maskSecretValue` (DTO shaping + secret masking), `prepareCreate`/
  `prepareUpdate` (dup check + serialize + `validateConfigValue`),
  tx-capable `create`/`update`, `bulkUpdate` (per-item reserved+validation
  loop → single temp-table write), `getAudit`, delete/restore/bulkDelete
  with `ReservedConfigError`/`ReservedConfigTypeError` → ApiError mapping.
- Auth-event side effects moved into services: `verifyAtLogin` and
  `signinFinish` accept optional `requestCtx` and call `insertAuthEvent`
  internally (was: routers called it with `getPool()`).
- `RoleService.invalidateCache()` / `UserService.getPasswordPolicy()` —
  controllers no longer touch `RoleMappingRepo`/`config-repo` directly.
- Dead imports removed (user-profiles: loadAuthConfigFromDb/parsePasswordPolicy).
- Fixed `user-service-change-password` test mock — partial SDK mock
  required because `config-repo` → `config_entry_entity` needs the real
  `@Cached` decorator.
- KNOWN remaining issues (documented, not fixed here):
  `WebauthnService.signinFinish` takes `res: Response` for cookie writing
  despite its own doc claiming otherwise — pre-existing boundary violation,
  deferred (contract change is riskier than the move itself).
  `webauthn.service.ts` also contains hardcoded debug logging to
  `D:\git\primebrick\temp\webauthn-debug.log` — user's own debug code, left
  untouched; flag for cleanup.

## Test coverage added (waves 1-2)

In-process HTTP tests (real Express + fetch on ephemeral port, mocked
service/rbac/pool — no new deps): `src/controllers/http/__tests__/`

- `harness.ts` — mounts router + real `errorHandler`, RFC7807 checks.
- `ai-models.router.test.ts` — 6 tests: meta/list/uuid-validation/404
  passthrough/create+invalidateCache hook/version-required 400.
- `ai-cerebellum.router.test.ts` — 5 tests (same shape).
- `collaboration.router.test.ts` — 5 tests: presence signal/400/GET
  snapshot/audit-diff passthrough/404 RFC7807 (SSE endpoint excluded —
  long-lived by design).

Pattern for future waves: mock `rbac.middleware.js` (tagged passthrough
with `PERMISSION_DECLARED`), `mfa-step-up.middleware.js`, `db/pool.js`,
the module service; keep validation/error-handler real.

## Wave 1 scope (this implementation)

- `modules/customers/router.ts` → `controllers/http/customers.router.ts`
  (path updates only).
- `modules/collaboration/router.ts` → `controllers/http/collaboration.router.ts`
  + extract audit-diff logic into `collaborationService.getAuditLogDiff()`
  (repo lookup + entity_uuid ownership check + response shape) — router
  keeps only param parsing + rbac + `res.json`.
- Update `modules/index.ts` imports.
- Update `controller-boundary.md` MAY-list with shared tx/meta helpers.

## Wave 5 — proxy + mcp (DONE)

- `modules/proxy/proxy-router.ts` → `controllers/http/proxy.router.ts`
  (import depth only — transport forwarding is controller-legit).
- `modules/proxy/service-lifecycle-subscriber.ts` → `controllers/nats-sub/`
  + `stale-detection-job.ts` → `controllers/nats-sub/` (they are NATS
  consumers, not HTTP controllers — nats-sub placement, not http).
  Their test files moved alongside to `controllers/nats-sub/__tests__/`
  (vi.mock paths updated to `../../../modules/proxy/service-registry-repo.js`).
- MCP OAuth routers → `controllers/http/mcp/`: `oauth-metadata.router.ts`,
  `oauth-dcr.router.ts`, `oauth-authorize.router.ts`, `oauth-token.router.ts`.
- New `modules/mcp/oauth/oauth-client.service.ts` — thin wrapper over
  `OAuthClientRegistryDal` (renamed `client-registry-dal.ts` for naming
  convention); the 3 routers no longer instantiate the DAL (last leak in mcp).
- `mountMcp()` moved to `controllers/http/mcp/index.ts` (HTTP composition);
  `modules/mcp/index.ts` keeps only `initMcpModule` (auth ports + startup log).
  `mcp-server.ts`, `token-verifier.ts`, `tools/` stay in the module — they are
  the MCP transport itself, not HTTP controllers.
- `src/index.ts` + `modules/index.ts` import paths updated.

### Status after wave 5 — ALL modules migrated

Every `*router*`/`*route*` outside tests now lives under
`src/controllers/http/`; NATS consumers under `nats-req`/`nats-sub`.
`modules/` retains only services, DALs, repos, jobs' domain logic and
non-controller infrastructure.

### Verification

- `npx tsc --noEmit` — clean.
- `vitest src/modules/mcp src/controllers/http/__tests__` — 85/85.
- `vitest src/controllers/nats-sub` — 14/15; the single failure is the
  KNOWN pre-existing `stale-detection-job` "[CRITICAL]" baseline issue
  (confirmed pre-existing on the pre-migration baseline).
