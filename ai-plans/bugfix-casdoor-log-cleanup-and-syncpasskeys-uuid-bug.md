# Plan: Cleanup Casdoor/fetchWithHost debug logs + fix syncPasskeys UUID lookup bug

## Objectives
1. Remove the noisy `console.log` debug lines from `CasdoorApiClient` and `fetchWithHost` in the BE, keeping ONLY the error-path logs (`console.error` and the `console.log` lines that are inside `if (!response.ok)` / 404 / error branches).
2. Fix the `CASDOOR_USER_NOT_FOUND` error thrown by `syncPasskeys` after a successful passkey signin, by extracting `owner`/`name` from the JWT claims instead of using the UUID (`sub`/`Id`).

## Root-cause analysis

After a successful passkey signin as `admin`, the BE runs a best-effort `syncPasskeys(casdoorUserId, undefined, undefined)` where:

```ts
const casdoorUserId = (claims as any).Id || (claims as any).sub;
```

The Casdoor JWT `sub`/`Id` claim is the **UUID** (`7e2cdd7c-0f0a-43d5-9e5c-f59b389d2b2d`), NOT the Casdoor username (`admin`).

Inside `syncPasskeys` → `cdClient.getUser(casdoorUserId, undefined, undefined)`:

```ts
const finalOwner = owner ?? (userId.includes('/') ? userId.split('/')[0] : this.orgName); // = "acme"
const finalName  = name  ?? (userId.includes('/') ? userId.slice(...) : userId);            // = "7e2cdd7c-..."
const queryId = `${finalOwner}/${finalName}`; // = "acme/7e2cdd7c-0f0a-43d5-9e5c-f59b389d2b2d"
```

Casdoor's `/api/get-user?id=owner/name` REST endpoint expects `name` to be the Casdoor **username** (e.g. `admin`). It does NOT resolve users by their internal UUID via this endpoint. Casdoor returns `200 OK` with `{ status: "ok", data: null, name: "" }` (note: `status: "ok"` but `data: null`), and `getUser` interprets `(!data.data && !data.name)` as "not found" → returns `null` → `syncPasskeys` throws `NotFoundError("Casdoor user not found")`.

The signin itself succeeds because Casdoor validates the WebAuthn assertion using its own server-side challenge/session — it does not need the `owner/name` lookup for that. Only the post-signin PG reconciliation step fails because it tries to look the user up by UUID.

### Why the error is non-critical
The call site wraps it in `.catch()` and logs it as `"[webauthn] Post-signin passkey sync failed (non-critical)"`. The signin tokens are already issued and cookies set. The only consequence is `user_passkeys` / `has_passkey` in PG may drift from Casdoor until the next successful sync.

### Source-of-truth verification (Casdoor source, master branch)

`controllers/user.go` → `GetUser()`:
- `id` query param is parsed by `util.GetOwnerFromId(id)` which `strings.Split(id, "/")` and **panics** if `len(tokens) != 2`. So `?id=<uuid>` (no slash) crashes the goroutine → 500.
- `?id=acme/<uuid>` does NOT crash, but resolves via `getUser(owner, name)` → `WHERE owner='acme' AND name='<uuid>'`. Since the `User` PK is `(Owner, Name)` and `name` is the Casdoor username (e.g. `admin`), not the UUID, this returns no row → `data: null`.
- UUID lookup is ONLY reachable via the separate `userId` query param: `?owner=acme&userId=<uuid>` → `GetUserByUserId`, or `?userId=<uuid>` (no owner) → `GetUserByUserIdOnly`. These query the indexed `Id` column, not the PK.

References:
- Casdoor issue #884 (closed as "won't fix" — `id` will not accept UUID).
- SDK issue #25 / PR #879 — added the `userId` param specifically because `id` could not do UUID lookups.

### The fix — extract `owner`/`name` from JWT claims

The Casdoor JWT already carries the username and organization as claims. From `buildUserFromClaims` (`auth-session.service.ts:481`):
- `claims.name` → Casdoor username (e.g. `admin`)
- `claims.organization` → Casdoor org/owner (e.g. `acme`)
- `claims.Id` / `claims.sub` → UUID (WRONG key for `getUser`'s `id` param)

In `webauthn.service.ts` `signinFinish` (around line 395), replace:

```ts
// BEFORE (buggy — passes UUID as the name part of owner/name)
const casdoorUserId = (claims as any).Id || (claims as any).sub;
if (casdoorUserId) {
  this.syncPasskeys(casdoorUserId, undefined, undefined).catch((err) => {
    console.error("[webauthn] Post-signin passkey sync failed (non-critical):", err);
  });
}
```

with:

```ts
// AFTER — pass owner + name explicitly so getUser builds ?id=acme/admin
const idpOrg = (claims as any).organization as string | undefined;
const idpUsername = (claims as any).name as string | undefined;
if (idpOrg && idpUsername) {
  this.syncPasskeys(undefined, idpOrg, idpUsername).catch((err) => {
    console.error("[webauthn] Post-signin passkey sync failed (non-critical):", err);
  });
}
```

Why this works: `syncPasskeys(undefined, "acme", "admin")` → `casdoorUserId = "acme/admin"` → `getUser("acme/admin", "acme", "admin")` → `finalOwner="acme"`, `finalName="admin"`, `queryId="acme/admin"` → Casdoor PK lookup succeeds.

Guard: if either claim is missing, skip the sync (the existing `.catch()` already makes this non-critical). Do NOT fall back to `sub`/`Id` — that reintroduces the bug.

## Impacted files

1. `D:\git\primebrick\primebrick-be-v3\src\modules\auth\casdoor-api-client.ts` — log cleanup only
2. `D:\git\primebrick\primebrick-be-v3\src\modules\auth\services\webauthn.service.ts` — log cleanup (fetchWithHost) + the `syncPasskeys` call-site fix above

## Detailed changes

### `casdoor-api-client.ts` — remove success-path `console.log`, keep error-path logs

For EVERY method (`getUser`, `updateUser`, `changePassword`, `addUser`, `deleteUser`, `getOrganization`, `updateOrganization`, `addOrganization`, `deleteOrganization`, `checkUserPassword`, and any other methods present), remove these `console.log` lines:

- Entry logs: `console.log("[CasdoorApi] <method>: ...")` at function start
- Request logs: `console.log("[CasdoorApi] <method> request: POST ...")` and `console.log("[CasdoorApi] <method> request body: ...")`
- Success response status logs: `console.log("[CasdoorApi] <method> response: ${response.status} ${response.statusText}")` (the one BEFORE the `if (!response.ok)` check)
- Success response data logs: `console.log("[CasdoorApi] <method> response data: ...")` (the one AFTER `const data = await response.json()` and BEFORE the status check)

KEEP these logs (error paths):
- `console.error("[CasdoorApi] <method> failed: ...")` — keep all
- `console.error("[CasdoorApi] <method> returned error: ...")` — keep all
- `console.log("[CasdoorApi] <method> response body: ${text}")` inside `if (!response.ok)` blocks — keep (these are error-path diagnostic logs)
- `console.log("[CasdoorApi] <method>: User not found (404): ...")` inside 404 branches — keep
- `console.log("[CasdoorApi] <method> changePassword response data: ...")` — REMOVE (this is success path)

Rationale: keep logs that fire ONLY when something goes wrong (non-OK response, 404, error status in body). Remove logs that fire on every successful call.

### `webauthn.service.ts` — remove the `fetchWithHost` entry log

Remove line 83:
```ts
console.log(`[fetchWithHost] url=${url} hostOverride=${init.hostOverride}`);
```
and the `// eslint-disable-next-line no-console` comment above it (line 82) since it is no longer needed.

Do NOT touch any other logs in `webauthn.service.ts` (the `console.error("[webauthn] ...")` lines are error-path and stay).

## Acceptance criteria

1. After the change, a successful passkey signin produces NO `[CasdoorApi]` and NO `[fetchWithHost]` console.log lines on stdout.
2. A failed Casdoor API call (non-2xx, 404, or `status: "error"` body) STILL produces a `console.error` (or error-path `console.log` for the response body) so debugging remains possible.
3. `pnpm run build` (or `pnpm run dev` if build is unavailable) succeeds with no new lint/type errors.
4. A successful passkey signin as `admin` no longer logs `[webauthn] Post-signin passkey sync failed (non-critical): NotFoundError: Casdoor user not found`. The `syncPasskeys` call resolves the user via `?id=acme/admin` and reconciles PG `user_passkeys` / `has_passkey`.
5. If `claims.organization` or `claims.name` is absent, the sync is silently skipped (no throw, no spurious error log) — the signin still succeeds.
6. No change to `syncPasskeys` signature, `getUser` signature, or any route/endpoint contract.

## Out of scope
- FE-side `fetchWithHost` (only used in E2E tests, not runtime).
- Switching `getUser` to use the `userId` query param for UUID lookups (not needed once we pass owner/name from claims; would be a separate refactor if other call sites only have a UUID).
- Any change to error handling, return values, or function signatures beyond the `signinFinish` call-site edit above.
