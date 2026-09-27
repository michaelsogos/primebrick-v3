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
