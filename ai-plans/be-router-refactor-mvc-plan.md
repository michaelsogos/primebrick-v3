# Backend Router Refactor — Service-Oriented MVC

**Status:** APPROVED — ready for execution (PROCEED received)
**Author:** Devin (AI)
**Date:** 2026-06-23
**Target repo:** `primebrick-be-v3`

### Confirmed decisions (from user)
1. **Debug logging** → **Remove** the Italian `console.log`/`console.error` debug blocks during the move. Keep only meaningful error logging via `console.error` for genuine failure paths (no verbose token-inspection / outbound-request dumps).
2. **`defineRoute` helper** → **Yes**, introduce the declarative `registerRoutes(router, [...])` table in `src/http/define-route.ts` and use it in every migrated router for scannability.
3. **Scope** → **Steps 1–9** in one pass (auth + customers + organizations + centralized module registration).
4. **Service style** → **Classes** (`class UserService`, `class CustomersService`, etc.), consistent with the existing `*_dal.ts` classes.

---

## 1. Objective

The file `primebrick-be-v3/src/modules/auth/router.ts` has grown to **~71 KB / ~1600 lines / 16 endpoints** and mixes:
- Casdoor OAuth proxy logic (login, refresh, token exchange)
- JWT decoding + cookie management
- User CRUD + user_profiles entity CRUD
- Inline business logic (avatar SVG generation, JIT provisioning, raw SQL `INSERT`)
- Validation, error shaping, debug logging

Goal of this refactor: introduce a **lightweight, pragmatic Service-Oriented MVC** so that:

1. **Controllers** (routers) contain **no business logic** — only HTTP plumbing: parse request → call service → shape JSON response.
2. **Services** own all business logic, are **request-context-free** (take plain parameters), and access the actor via **ALS** (`session-context.ts`) for special cases.
3. **Models** stay pure (fields + decorators only) — **already the case today**, no change needed.
4. **View** = well-structured **JSON DTOs** consumed by the SvelteKit frontend. SSR is a **frontend concern** (SvelteKit `adapter-auto` + `hooks.server.ts` proxies `/api/*`); the backend stays JSON-only.

Secondary goal: provide an **easy, consistent route registration & declaration system** that scales to new modules.

---

## 2. Answers to the user's questions

### 2.1 Do we apply MVC?
**Yes — a pragmatic, service-oriented variant**, not classical framework MVC. The mapping:

| MVC role | Primebrick BE equivalent | Notes |
|---|---|---|
| **Model** | `*_entity.ts` (decorated classes) | Already pure. **No change.** |
| **View** | JSON DTOs returned by controllers (`dto.ts` + `res.json(...)`) | Not HTML. SSR is handled by SvelteKit FE. |
| **Controller** | `*.router.ts` (thin) | HTTP only: parse → call service → respond. |
| **Service** | `*.service.ts` (NEW) | Business logic, request-context-free, uses ALS for actor. |
| **Repository / DAL** | `*_dal.ts` + generic `Repository` | Data access only. Already present. |

We do **not** introduce a heavy framework (no NestJS, no DI container, no decorators for routes). The existing functional style + `makeProtectedRouter()` secure-first factory is kept and extended.

### 2.2 How do we handle SSR?
**SSR is a frontend responsibility.** The current architecture already does this correctly:
- SvelteKit (`adapter-auto`) renders HTML on the FE server.
- `src/hooks.server.ts` proxies `/api/*` to the Express backend.
- The backend is and remains a **pure JSON API**.

Therefore the "View" in the backend is **JSON only**. No SSR logic is added to the BE. The FE may call the same JSON endpoints during SSR and in the browser — the contract is identical. This keeps the BE simple and avoids coupling render concerns to business logic.

---

## 3. Target layering (per module)

```
src/modules/<module>/
├── <entity>.ts              # MODEL  — fields + decorators only (unchanged)
├── <entity>.dal.ts          # DATA ACCESS — SQL, query building (unchanged)
├── <module>.service.ts      # SERVICE (NEW) — business logic, no req/res
├── <module>.dto.ts          # VIEW — request/response shapes, zod schemas
├── <module>.meta.ts         # VIEW — entity metadata (columns, list config) extracted from router
└── <module>.router.ts       # CONTROLLER (thin) — HTTP plumbing only
```

Cross-cutting (already present, kept):
- `src/http/protected-router.ts` — secure-first router factory (declare-permission-or-deny).
- `src/http/api-errors.ts` — RFC 7807 error classes.
- `src/http/async-handler.ts`, `src/http/validation.ts` — helpers.
- `src/modules/auth/rbac.middleware.ts` — `rbacHandler([...])` permission declaration.
- `src/modules/auth/session-context.ts` — ALS session (`requireActor()`, `runAsSystem()`).

---

## 4. Service layer contract

A service is a plain class (or module of functions) that:

1. **Takes explicit parameters** — never `req`/`res`. Example:
   ```ts
   class UserService {
     constructor(private dal: UserProfilesDal, private casdoor: CasdoorService) {}

     async createUser(input: CreateUserInput): Promise<UserProfileDetailDto> { ... }
     async listUsers(query: UserListQuery): Promise<UserListResponse> { ... }
   }
   ```
2. **Reads the actor from ALS** when it needs the authenticated user:
   ```ts
   const actor = requireActor(); // throws if no session — same pattern DALs already use
   ```
3. **Throws `ApiError` subclasses** (`ValidationError`, `NotFoundError`, `UnauthorizedError`, ...) for control flow. The centralized `errorHandler` converts them to RFC 7807 JSON. This **removes the dozens of inline `res.status(...).json({...})` blocks**.
4. **Is unit-testable without an HTTP context** — instantiate with a mock `Pool`/DAL and wrap in `runAsSystem(...)` or `runWithSession(...)`.

Services are constructed **once per module** (lazy singleton inside the router factory, same pattern already used for `dal`). No DI container.

---

## 5. Controller (router) contract

A controller file:

1. Exports a single `xxxRouter()` factory returning a `makeProtectedRouter()`.
2. Each route is **≤ ~15 lines** and follows this shape:
   ```ts
   router.post(
     "/api/v1/auth/users",
     rbacHandler([Permission.USERS_CREATE_SINGLE]),
     validateBody(CreateUserSchema),
     asyncHandler(async (req, res) => {
       const created = await userService.createUser(req.body as CreateUserInput);
       res.status(201).json({ success: true, profile: created });
     })
   );
   ```
3. **No SQL, no Casdoor calls, no avatar generation, no JWT decoding** in the router.
4. Validation uses `validateBody` / `validateQuery` middleware (already present) so the handler receives typed input.
5. Errors are thrown, not `res.status(500).json(...)`-ed inline.

---

## 6. Route registration system (easy to approach)

### 6.1 Keep what works
The existing system is already good and is **kept**:
- Each module exports a `<module>Router()` factory.
- `src/index.ts` mounts them: `app.use(customersRouter()); app.use(authRouter()); ...`
- `makeProtectedRouter()` enforces "declare a permission or get 403".
- `rbacHandler([...])` / `rbacHandler.all([...])` declares permissions.

### 6.2 Add a tiny `defineRoute` helper (optional, low-risk)
To make the controller shape uniform and self-documenting, introduce a thin helper in `src/http/define-route.ts`:

```ts
import type { RequestHandler, IRouter } from "express";

export interface RouteDef {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  permission: ReturnType<typeof rbacHandler> | ReturnType<typeof rbacHandler.all>;
  middlewares?: RequestHandler[];   // validateBody, validateQuery, ...
  handler: RequestHandler;          // the thin controller
}

export function registerRoutes(router: IRouter, defs: RouteDef[]): void {
  for (const d of defs) {
    router[d.method](d.path, d.permission, ...(d.middlewares ?? []), d.handler);
  }
}
```

This gives a **declarative table** at the top of each router file — easy to scan, easy to approach for newcomers:

```ts
registerRoutes(router, [
  { method: "get",    path: "/api/v1/entities/user_profiles/meta",  permission: rbacHandler([Permission.USERS_READ_ALL, Permission.USERS_READ_SINGLE]), handler: ctrl.getMeta },
  { method: "get",    path: "/api/v1/entities/user_profiles/list",  permission: rbacHandler([Permission.USERS_READ_ALL]), handler: ctrl.list },
  { method: "post",   path: "/api/v1/auth/users",                   permission: rbacHandler([Permission.USERS_CREATE_SINGLE]), middlewares: [validateBody(CreateUserSchema)], handler: ctrl.create },
  // ...
]);
```

**This is opt-in and additive** — existing `router.get(...)` calls keep working. We migrate module-by-module.

### 6.3 Module auto-discovery (optional, later phase)
Once all modules follow the `<module>Router()` convention, `src/index.ts` can be simplified to:
```ts
import { registerModules } from "./modules/index.js";
registerModules(app);
```
where `modules/index.ts` imports each module's router factory and mounts it. **Not required for this refactor** — listed as a future cleanup.

---

## 7. Concrete decomposition of `auth/router.ts`

The 16 endpoints split into **4 routers + 3 services**:

### 7.1 Routers (controllers)

| New file | Endpoints | Source lines (approx) |
|---|---|---|
| `auth/routers/auth-session.router.ts` | `POST /auth/login`, `POST /auth/refresh`, `PATCH /auth/me`, `GET /auth/me`, `GET /auth/me/meta` | ~250 |
| `auth/routers/auth-check.router.ts` | `GET /auth/users/check-email`, `GET /auth/users/check-username` | ~60 |
| `auth/routers/users.router.ts` | `POST /auth/users`, `PATCH /auth/users/:uuid`, `DELETE /auth/users/:uuid` | ~150 |
| `auth/routers/user-profiles.router.ts` | `GET /entities/user_profiles/meta`, `.../list`, `.../:uuid`, `POST .../:uuid/restore`, `GET .../:uuid/audit`, `PUT .../:uuid` | ~200 |
| `auth/router.ts` (kept as **aggregator**) | imports the 4 above, returns a single `Router()` mounting them | ~30 |

The aggregator keeps `src/index.ts` unchanged: `app.use(authRouter())`.

### 7.2 Services (NEW)

| New file | Responsibility |
|---|---|
| `auth/services/auth-session.service.ts` | Casdoor OAuth token exchange (login/refresh), JWT decode, cookie setting helpers, `me`/`me/meta` assembly. Cookies are set via a small `CookieHelper` that takes `(res, tokens)` — the only place a service touches `res`, isolated and explicit. |
| `auth/services/user.service.ts` | User CRUD: create (Casdoor + JIT provisioning + avatar generation), update, delete, check-email/username. Calls `CasdoorService` + `UserProfilesDal`. |
| `auth/services/casdoor.service.ts` | Wraps `CasdoorApiClient` lifecycle (lazy init from DB config), exposes `createUser`, `updateUser`, `deleteUser`, `getUser`. Removes the duplicated `getCasdoorClient()` blocks in `auth/router.ts` and `organizations_router.ts`. |

### 7.3 View / DTO

| New/changed file | Content |
|---|---|
| `auth/dto.ts` (NEW) | Consolidate `LoginBodySchema`, `CreateUserSchema`, `UpdateUserSchema`, response shapes (`LoginResponse`, `UserCreatedResponse`, ...). Today these are scattered/inlined in the router. |
| `auth/user-profiles.meta.ts` (NEW) | The big `meta` object currently inline in the router (lines 1335–1413) → a pure data export. Same pattern as `customers/list-config.ts`. |

### 7.4 Cleanup inside the moved code
While moving, **remove** (per confirmed decision #1):
- **All verbose Italian debug `console.log` blocks** (lines 124–133, 144–147, 202–217, 222–227, 252, 267, 307, 314, 363–365, 386, 1090, 1097, 1108, ...). These include the "ISPEZIONE DEBBUGING OUTBOUND", "TOKEN INSPECTION", "AUTH SUCCESS" dumps. **Delete them entirely.**
- **Keep** only targeted `console.error` on genuine failure paths (e.g. "Casdoor rejected the request", "Failed to create user") — one line, no token payloads, no stack-trace dumps of fake errors.
- The raw `pool.query("INSERT INTO public.user_profiles ...")` in the create handler → use `UserProfilesDal` / `Repository` instead.
- `require("node:crypto").randomUUID()` → ESM `import { randomUUID } from "node:crypto"`.
- Inline `res.status(500).json({...})` → `throw new ApiError(...)` / dedicated subclass.

---

## 8. Migration strategy (incremental, atomic commits)

Per the `code-guardrails` rule (atomic commits, lint after each module), the migration is **module-by-module**, each step independently shippable. **All 9 steps are in scope** (per confirmed decision #3):

| Step | Scope | Commit |
|---|---|---|
| 1 | Add `src/http/define-route.ts` + `src/modules/auth/services/casdoor.service.ts` (extract `getCasdoorClient` from both auth + organizations routers). No endpoint behavior change. | `refactor(auth): extract CasdoorService` |
| 2 | Extract `auth/dto.ts` + `auth/user-profiles.meta.ts` (pure data, no logic). | `refactor(auth): extract DTOs and entity meta` |
| 3 | Add `auth/services/user.service.ts`; create `auth/routers/users.router.ts` thin controller for the 3 user endpoints. Wire into `auth/router.ts` aggregator. | `refactor(auth): move user CRUD to UserService` |
| 4 | Add `auth/services/auth-session.service.ts`; create `auth/routers/auth-session.router.ts` + `auth-check.router.ts`. | `refactor(auth): move session endpoints to AuthService` |
| 5 | Create `auth/routers/user-profiles.router.ts` (entity CRUD, already mostly DAL-backed). | `refactor(auth): split user_profiles entity router` |
| 6 | Replace `auth/router.ts` body with the aggregator; delete dead code. | `refactor(auth): finalize router aggregation` |
| 7 | Apply the same split to `customers/router.ts` → `customers/customers.service.ts` + thin `customers/router.ts` using `registerRoutes`. | `refactor(customers): extract CustomersService` |
| 8 | Same for `organizations_router.ts` → `auth/services/organizations.service.ts` + thin router. | `refactor(auth): extract OrganizationsService` |
| 9 | Introduce `src/modules/index.ts` auto-mount; simplify `src/index.ts` to `registerModules(app)`. | `refactor: centralize module registration` |

Each step must pass: `pnpm run build` (tsc) and a manual smoke test of the affected endpoints against `http://localhost:3001`.

---

## 9. Files to modify / create

### New files
- `src/http/define-route.ts`
- `src/modules/auth/services/casdoor.service.ts`
- `src/modules/auth/services/auth-session.service.ts`
- `src/modules/auth/services/user.service.ts`
- `src/modules/auth/services/organizations.service.ts`
- `src/modules/auth/dto.ts`
- `src/modules/auth/user-profiles.meta.ts`
- `src/modules/auth/routers/auth-session.router.ts`
- `src/modules/auth/routers/auth-check.router.ts`
- `src/modules/auth/routers/users.router.ts`
- `src/modules/auth/routers/user-profiles.router.ts`
- `src/modules/auth/routers/organizations.router.ts`
- `src/modules/customers/customers.service.ts`
- `src/modules/customers/customers.meta.ts` (extract the inline `meta` block from the router, mirroring `list-config.ts`)
- `src/modules/index.ts` (module auto-mount registry)

### Modified files
- `src/modules/auth/router.ts` — shrinks from ~1600 lines to ~30 (aggregator only).
- `src/modules/auth/organizations_router.ts` — replaced by `auth/routers/organizations.router.ts` + `auth/services/organizations.service.ts` (step 8). The old file is deleted.
- `src/modules/customers/router.ts` — shrinks to a thin controller using `registerRoutes` + `CustomersService` (step 7).
- `src/index.ts` — unchanged in steps 1–8 (aggregators preserve `app.use(...Router())` contracts); simplified to `registerModules(app)` in step 9.

### Untouched (already compliant)
- All `*_entity.ts` files (pure models).
- `src/db/repository/*`, `*_dal.ts` (data access).
- `src/http/protected-router.ts`, `api-errors.ts`, `rbac.middleware.ts`, `session-context.ts`.
- Frontend — no contract change. All endpoint paths, methods, and JSON shapes are preserved.

---

## 10. Verification plan

For each step:
1. `pnpm run build` — TypeScript must compile (no `any` leaks in service signatures).
2. Start (or reuse) dev server on `:3001` and smoke-test the touched endpoints with `curl`:
   - `POST /api/v1/auth/login` → 200 + cookies + `{ success, user }`.
   - `POST /api/v1/auth/refresh` → 200 + new access cookie.
   - `GET /api/v1/auth/me` → 200 + profile.
   - `GET /api/v1/entities/user_profiles/list` → 200 + paginated rows.
   - `POST /api/v1/auth/users` → 201 + `{ success, profile }` (Casdoor + local).
   - `DELETE /api/v1/auth/users/:uuid` → 200/204.
3. Confirm a route with a **missing** `rbacHandler` still returns 403 `ROUTE_PERMISSION_NOT_DECLARED` (secure-first policy intact).
4. Confirm a route the user lacks permissions for returns 403 with `extra.issues` listing missing permissions.
5. No new dependencies added (`pnpm install` not required).

### Acceptance criteria
- [ ] `auth/router.ts` ≤ 50 lines.
- [ ] No `req`/`res` reference inside any `*.service.ts`.
- [ ] No `pool.query(...)` inside any `*.router.ts`.
- [ ] No `console.log` debug blocks in routers (moved or removed).
- [ ] All 16 original endpoints respond with identical status codes and JSON shapes.
- [ ] `pnpm run build` passes.
- [ ] Secure-first default-deny still triggers for an undeclared route.

---

## 11. Risks & considerations

| Risk | Mitigation |
|---|---|
| **Behavior drift** when moving Casdoor/JWT logic. | Keep the exact token-exchange flow; extract verbatim first, refactor second. Smoke-test login + refresh after step 4. |
| **Cookies** — services should not normally touch `res`. | Isolate cookie setting in a single `CookieHelper` invoked by the **controller**, not the service. The service returns `{ tokens, profile }`; the controller sets cookies. |
| **Debug logs removal** — may have been relied on for ops. | **User confirmed deletion** (decision #1). All verbose Italian debug blocks removed; only minimal `console.error` on genuine failure paths kept. If ops needs visibility later, add a structured logger as a separate task. |
| **`require("node:crypto")`** in ESM. | Replace with `import { randomUUID } from "node:crypto"` during move. |
| **Atomic-commits rule** — each step must build. | Steps are ordered so each is independently compilable; no cross-step half-states. |
| **Scope locking** — do not change signatures/endpoints. | All paths, methods, status codes, and JSON keys preserved. Only internal structure changes. |
| **Organizations router** also has a `getCasdoorClient()` duplicate. | Step 1 extracts `CasdoorService` and both routers consume it — removes duplication. |

---

## 12. Confirmed decisions (from user, 2026-06-23)

All four open questions have been resolved by the user. The decisions are reflected throughout this plan (header block, section 7.4, section 8, section 9, section 11) and summarized here for reference:

1. **Debug logging** → **Remove** all verbose Italian debug `console.log` blocks during the move. Keep only minimal `console.error` on genuine failure paths.
2. **`defineRoute` helper** → **Yes**, introduce `src/http/define-route.ts` with `registerRoutes(router, [...])` and use it in every migrated router.
3. **Scope** → **Steps 1–9** in one pass (auth + customers + organizations + centralized module registration).
4. **Service style** → **Classes** (`class UserService`, `class CustomersService`, `class OrganizationsService`, `class CasdoorService`, `class AuthSessionService`), consistent with existing `*_dal.ts` classes.

---

## 13. Summary

This refactor introduces a **pragmatic Service-Oriented MVC**:
- **Models** — already pure, untouched.
- **Views** — JSON DTOs; SSR stays on the SvelteKit frontend.
- **Controllers** — thin routers, no logic.
- **Services** — request-context-free business logic using ALS for the actor.
- **Route registration** — kept simple (existing `makeProtectedRouter` + `rbacHandler`), optionally augmented with a declarative `registerRoutes` table.

The 71 KB `auth/router.ts` is decomposed into 4 thin routers + 3 services + DTO/meta files, and the same pattern is applied to `customers/router.ts` and `organizations_router.ts`. Module registration is then centralized via `src/modules/index.ts`. All 9 steps are migrated incrementally with atomic commits and a smoke test after each step. No endpoint contract changes; the frontend is unaffected.
