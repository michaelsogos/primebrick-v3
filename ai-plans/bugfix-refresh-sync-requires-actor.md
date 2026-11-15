# Bugfix — Remove unjustified Casdoor→Primebrick profile sync from `/auth/refresh`

**Date:** 2026-07-21
**Type:** Bugfix (design correction)
**Severity:** Low (non-critical, sync was swallowed by `.catch()`) — but the sync was making the refresh endpoint do work it should not do (extra Casdoor HTTP call + 2 DB writes + 2 audit rows per refresh), and the swallowed error was masking the design error.

---

## 1. Symptom (empirical, from stdout)

```
[AuthSessionService] Casdoor→Primebrick sync failed (non-critical): Error:
[auth] No session in scope: requireActor() called outside an HTTP request and
outside runAsSystem(). Wrap the call in runAsSystem(...) or ensure the auth
middleware ran first.
    at requireActor (primebrick-v3-sdk\src\auth\session-context.ts:96:11)
    at UserProfilesDal.updateProfile (primebrick-be-v3\src\modules\auth\user-profiles-dal.ts:149:75)
    at AuthSessionService.syncProfileFromCasdoor (primebrick-be-v3\src\modules\auth\services\auth-session.service.ts:494:20)
    at AuthSessionService.refresh (primebrick-be-v3\src\modules\auth\services\auth-session.service.ts:238:5)
    at <anonymous> (primebrick-be-v3\src\modules\auth\routers\auth-session.router.ts:118:34)
```

The refresh itself **succeeds** (the `.catch()` at line 238 swallows the sync error and the new tokens are returned to the client). Only the side-effecting profile sync was broken.

---

## 2. Root cause — the crash is the symptom, the unjustified write is the root cause

### 2.1 The correct OAuth refresh contract (the user's model)

```
/auth/refresh  =  refresh_token in → new access_token + new refresh_token out. Period.
/auth/me       =  READ user_profile (FE reloads it after refresh)
profile writes =  admin updateUser (explicit) or resolveInternalUuid (automatic, on every authed request)
```

A token refresh is a **read-only token exchange**. It is not a profile-sync operation.

### 2.2 What the code actually does on `/auth/refresh`

`auth-session.service.ts:237-240`:

```ts
// inside refresh(), AFTER the Casdoor token grant succeeds:
await this.syncProfileFromCasdoor(claims, cfg.casdoor_organization!).catch((syncError) => {
  console.error("[AuthSessionService] Casdoor→Primebrick sync failed (non-critical):", syncError);
});
```

`syncProfileFromCasdoor` (`auth-session.service.ts:467-515`) does:

1. **An extra HTTP call to Casdoor** (`cdClient.getUser`) — on top of the OAuth grant.
2. **A DB WRITE** via `dal.updateProfile()` → writes `display_name, email, is_active, is_admin, is_verified, email_verified, issuer, roles, last_synced_at` into `user_profiles`.
3. **A second DB WRITE** via raw SQL for `idp_org / idp_username`.
4. **Two audit rows** (one per write).

So `/auth/refresh` is currently: token exchange + Casdoor API call + 2 DB writes + 2 audit inserts. That is the design error.

### 2.3 Why `requireActor()` throws — and why `runAsSystem` is the wrong fix

The `/auth/refresh` route is `PUBLIC` (`auth-session.router.ts:201-206`), correctly — the access token is expired by definition, so the auth middleware cannot populate an `AsyncLocalStorage` session. There is no authenticated actor.

`dal.updateProfile()` calls `requireActor()` to populate the audit `updated_by` column. With no ALS session in scope, it throws.

`runAsSystem()` is purely an **audit-field mechanism for writes** — it populates the ALS session with `actor: "system"` so `requireActor()` returns `"system"` instead of throwing. It does nothing else. The fact that we'd need `runAsSystem` during a **token refresh** is itself the smell: it proves we're doing a **write** during what should be a **read-only token exchange**. Wrapping the write in `runAsSystem` would make the crash go away but would legitimize a write that shouldn't be there in the first place. It's papering over the design error, not fixing it.

### 2.4 The crash, traced precisely

```
refresh()                                  ← PUBLIC route, no auth middleware
  → syncProfileFromCasdoor()               ← unjustified side effect
    → dal.updateProfile()                  ← WRITE
      → requireActor()                     ← needs an actor for the audit column
        → als.getStore() === undefined     ← no auth middleware ran → no ALS session
          → THROW                          ← the error in the symptom
```

The crash is the code's way of saying: *"you're trying to write an auditable row, but you're on a PUBLIC route with no authenticated actor — are you sure this write should be happening?"* The answer is **no**.

---

## 3. Empirical evidence that the sync is not load-bearing

### 3.1 The system has been running with the sync completely broken

The sync has been silently throwing on **every** refresh for an unknown period, swallowed by the `.catch()` at line 238. Nobody noticed because:
- Tokens still get refreshed correctly.
- `resolveInternalUuid` keeps the critical fields fresh on every authenticated request.
- Admin-driven `updateUser` is the real Casdoor→Primebrick sync path.

The fact that the system has been running fine with this sync **completely broken** is strong empirical evidence that it is not load-bearing.

### 3.2 The critical fields are already handled elsewhere — on every authenticated request

`primebrick-be-v3/src/modules/auth/user-profile-repo.ts` (`resolveInternalUuid`) runs in the auth middleware on **every** authenticated request. It:
- Creates the `user_profiles` row on first encounter (just-in-time provisioning).
- Syncs `idp_org` and `idp_username` if they differ (lines 92-110).
- Caches the `idp_code → uuid` mapping (5-min LRU).

So the very next authenticated request after a refresh already fixes `idp_org`/`idp_username` and guarantees the profile exists.

### 3.3 The remaining fields `syncProfileFromCasdoor` writes are not security-critical

| Field | Why the sync-on-refresh is unnecessary |
|-------|----------------------------------------|
| `display_name`, `email`, `is_verified`, `email_verified`, `issuer` | Display/audit metadata. The fresh JWT already carries them; the FE reads them from the token / from `/auth/me`. |
| `roles` | Already expanded from the JWT on every authenticated request by the auth middleware. RBAC uses the JWT + `role_mappings`, not `user_profiles.roles`. |
| `is_admin` | Cached display flag. The actual admin bypass uses `req.user.isAdmin` which comes from the JWT roles, not from this row. |
| `is_active` | If Casdoor forbids the user, the next login/refresh token grant fails at Casdoor's side. Primebrick's `is_active` is a mirror, not a gate. |
| `last_synced_at` | Bookkeeping for the sync itself — circular if the sync is the only writer. |
| `idp_org`, `idp_username` | Already kept fresh by `resolveInternalUuid` on every authenticated request. |

### 3.4 The real Casdoor→Primebrick sync path is admin `updateUser`

`primebrick-be-v3/src/modules/auth/services/user.service.ts:188-228` — `UserService.updateUser()`:
- Syncs to Casdoor first (fail if sync fails — non-best-effort).
- Then updates the local DB with `last_synced_at = new Date()`.
- Runs under an authenticated actor (route is `AUTHENTICATED_ADMIN`), so `requireActor()` works and the audit trail records the real admin.

This is the legitimate, audited, admin-driven sync path. It is where `last_synced_at` should advance.

### 3.5 Git history

`syncProfileFromCasdoor` was introduced in commit `51cb8b3` ("refactor: split monolithic auth router into Service-Oriented MVC") — i.e. it was carried over verbatim from the monolithic router during a refactor, not a deliberate design decision with its own commit. That explains why it exists in a slightly odd place.

### 3.6 The FE already does the right thing

The user's model: after a successful refresh, the FE calls `/auth/me` to reload the profile into session storage / state. `getMe()` (`auth-session.service.ts:255-284`) is a **READ**, the route is `AUTHENTICATED_USER`, the auth middleware runs, the ALS session is in scope, no `requireActor()` issue. This already works.

---

## 4. Chosen fix — remove the sync from `refresh()`

Delete the `syncProfileFromCasdoor` call from `refresh()`. Since the method is `private`, called only at line 238, and has no test references (verified by grep), delete the method itself too — leaving dead private code would be worse than removing it.

`refresh()` becomes a pure token exchange: 1 Casdoor call, 0 DB writes, 0 audit rows. Matches the OAuth contract.

---

## 5. Detailed change

### 5.1 File: `primebrick-be-v3/src/modules/auth/services/auth-session.service.ts`

**5.1.1 — Remove the sync call from `refresh()`** (lines 237-240):

```ts
// BEFORE
    const claims = this.decodeJwtPayload(data.access_token);

    // Best-effort Casdoor→Primebrick profile sync (non-critical).
    await this.syncProfileFromCasdoor(claims, cfg.casdoor_organization!).catch((syncError) => {
      console.error("[AuthSessionService] Casdoor→Primebrick sync failed (non-critical):", syncError);
    });

    return {

// AFTER
    const claims = this.decodeJwtPayload(data.access_token);

    // NOTE: /auth/refresh is a pure OAuth token exchange. It must NOT sync the
    // user_profile from Casdoor — that would require a DB write on a PUBLIC
    // route (no authenticated actor → requireActor() throws) and would add an
    // extra Casdoor HTTP call per refresh. Profile freshness is handled by:
    //   - resolveInternalUuid() in the auth middleware (every authed request,
    //     keeps idp_org / idp_username / JIT provisioning fresh)
    //   - UserService.updateUser() (admin-driven explicit Casdoor→Primebrick
    //     sync, sets last_synced_at under an authenticated actor)
    //   - /auth/me (FE reloads the profile after refresh; pure READ)
    // See ai-plans/bugfix-refresh-sync-requires-actor.md for the full rationale.

    return {
```

**5.1.2 — Delete the now-unused `syncProfileFromCasdoor` method** (lines 463-515):

Delete the entire block, including the leading JSDoc comment:

```ts
  /**
   * Best-effort Casdoor→Primebrick profile sync on token refresh.
   * Mirrors the original inline logic but without the verbose debug logs.
   */
  private async syncProfileFromCasdoor(claims: Record<string, any>, orgName: string): Promise<void> {
    const cdClient = await this.casdoor.getClient();
    if (!cdClient) return;

    const casdoorUserId = `${orgName}/${claims.name}`;
    const casdoorUser = await cdClient.getUser(casdoorUserId);
    if (!casdoorUser) return;

    const idpCode = casdoorUser.id || casdoorUserId;
    const existing = await this.dal.getByIdpCode(idpCode);
    if (!existing) return;

    const roleNames = (casdoorUser.roles || []).map((r: any) => r.name);
    const updateData: Record<string, unknown> = {
      display_name: casdoorUser.displayName || existing.display_name,
      email: casdoorUser.email || existing.email,
      is_active: !casdoorUser.isForbidden,
      is_admin: casdoorUser.isAdmin || false,
      is_verified: casdoorUser.isVerified || false,
      email_verified: casdoorUser.emailVerified || false,
      issuer: claims.iss || null,
      roles: roleNames.length > 0 ? roleNames : undefined,
      last_synced_at: new Date(),
    };
    if (existing.idp_code !== idpCode) {
      updateData.idp_code = idpCode;
    }
    await this.dal.updateProfile(existing.uuid, updateData as any);

    // Defensive sync of immutable idp_org / idp_username from JWT claims.
    const jwtIdpOrg = claims.organization || claims.owner || null;
    const jwtIdpUsername = claims.name || claims.username || claims.preferred_username || null;
    if (jwtIdpOrg || jwtIdpUsername) {
      await this.pool
        .query(
          `UPDATE public.user_profiles
           SET idp_org = COALESCE($2, idp_org),
               idp_username = COALESCE($3, idp_username),
               updated_at = now(),
               updated_by = $4,
               version = version + 1
           WHERE uuid = $1`,
          [existing.uuid, jwtIdpOrg, jwtIdpUsername, existing.uuid],
        )
        .catch((e) => {
          console.error("[AuthSessionService] Failed to sync idp_org/idp_username:", e);
        });
    }
  }
```

> **Why delete the method, not just the call?** The method is `private`, has no test references (verified by grep across `**/*.test.ts`), and is the only caller of `dal.updateProfile` from a PUBLIC route. Keeping it would leave a landmine: the next refactor that re-wires it into another PUBLIC route would reintroduce the same crash. Dead private code is worse than no code.

### 5.2 Files NOT touched

| File | Why not |
|------|---------|
| `primebrick-v3-sdk/src/auth/session-context.ts` | Correct as-is. `requireActor()` is the right invariant for DAL writes. |
| `primebrick-be-v3/src/modules/auth/user-profiles-dal.ts` | Correct as-is. `updateProfile` should require an actor. |
| `primebrick-be-v3/src/modules/auth/routers/auth-session.router.ts` | Correct as-is. `/auth/refresh` must stay `PUBLIC`. |
| `primebrick-be-v3/src/modules/auth/user-profile-repo.ts` | Already handles `idp_org` / `idp_username` / JIT provisioning on every authed request. |
| `primebrick-be-v3/src/modules/auth/services/user.service.ts` | Already the legitimate admin-driven Casdoor→Primebrick sync path. |

**Total: 1 file, 2 edits (1 removal in `refresh()`, 1 deletion of the private method).**

---

## 6. What changes in observable behavior

| Behavior | Before | After |
|----------|--------|-------|
| `POST /auth/refresh` HTTP response | `{ success: true, user: {...} }` + new cookies | **Unchanged** |
| Casdoor HTTP calls per refresh | 2 (OAuth grant + `getUser`) | **1 (OAuth grant only)** |
| DB writes per refresh | 2 (`updateProfile` + raw SQL) | **0** |
| Audit rows per refresh | 2 | **0** |
| `[AuthSessionService] Casdoor→Primebrick sync failed` log line | On every refresh | **Gone** |
| `user_profiles.last_synced_at` advancement | Attempted on every refresh (silently failing) | Advances only on admin `updateUser` (honest) |
| `user_profiles.display_name / email / is_admin / ...` freshness on refresh | Attempted on every refresh (silently failing) | Fresh via JWT claims + `/auth/me` + admin `updateUser` |
| `user_profiles.idp_org / idp_username` freshness | Attempted on every refresh (silently failing) | Fresh via `resolveInternalUuid` on every authed request (already working) |
| FE post-refresh `/auth/me` reload | Already happening | **Unchanged** |

The only "loss" is that `last_synced_at` no longer advances on refresh — but it was **not advancing anyway** (the sync was throwing). And semantically, `last_synced_at` should record the last *successful* Casdoor→Primebrick sync, which is admin `updateUser`, not a token exchange.

---

## 7. Acceptance criteria (empirical)

1. **Build passes:** `pnpm run build` in `primebrick-be-v3` exits 0.
2. **No `requireActor` import left unused:** after deleting the method, check that `requireActor` is still imported and used elsewhere in `auth-session.service.ts` (it is — `updateMe` path goes through `dal.updateProfile`). If `requireActor` becomes unused in this file, remove it from the import to avoid a lint warning. **Verify with grep before assuming.**
3. **Refresh no longer logs the sync error:** after the fix, calling `POST /auth/refresh` with a valid `refresh_token` cookie must **not** produce the `[AuthSessionService] Casdoor→Primebrick sync failed (non-critical):` log line in the dev server stdout.
4. **Refresh is now a pure token exchange:** the dev server stdout during a refresh should show only the Casdoor OAuth grant (`[CasdoorApi]` lines for the token endpoint), **not** `[CasdoorApi] getUser: ...`.
5. **Refresh still returns tokens:** the HTTP response of `POST /auth/refresh` is unchanged — `{ success: true, user: {...} }` with fresh `access_token` / `refresh_token` cookies.
6. **No regression on login:** `POST /auth/login` still returns 200 with cookies (login flow does not touch `syncProfileFromCasdoor`).
7. **No regression on `/auth/me`:** `GET /auth/me` still returns the profile (it's a READ, unaffected).
8. **No new console errors:** the only allowed new log line is none. In particular, no `[auth] No session in scope` errors anywhere.
9. **Profile still syncs via admin path:** as admin, `PATCH /api/v1/entities/user_profiles/:uuid` (or whatever the admin update endpoint is) still advances `last_synced_at` and writes an audit row with the real admin actor.

### Verification procedure (manual, against the running dev server on port 3001)

> Per the dev-server rule, do **not** restart the user's dev server. `tsx watch` will pick up the edit via HMR.

1. Confirm dev server is running: `netstat -ano | findstr "LISTENING" | findstr ":3001"` (expect one PID).
2. Apply the two edits in §5.
3. Wait for `tsx watch` to recompile (watch the dev server stdout for the reload line).
4. From the FE (or `curl`), perform a login to obtain a `refresh_token` cookie.
5. `curl -i -X POST http://localhost:3001/api/v1/auth/refresh -H "Cookie: refresh_token=<...>"` → expect `200 OK` with new cookies and `{ success: true, user: {...} }`.
6. Check the dev server stdout:
   - The `[AuthSessionService] Casdoor→Primebrick sync failed` line must **not** appear.
   - The `[CasdoorApi] getUser: userId=...` line must **not** appear (only the OAuth grant call should be visible).
7. `curl -i http://localhost:3001/api/v1/auth/me -H "Cookie: access_token=<new token>"` → expect `200 OK` with the profile. This confirms the FE's post-refresh reload still works.
8. In Postgres, before/after a few refreshes: `SELECT last_synced_at, updated_by, version FROM user_profiles WHERE idp_code = '7e2cdd7c-0f0a-43d5-9e5c-f59b389d2b2d';` → `last_synced_at` and `version` must **not** change from refreshes alone (they advance only on admin `updateUser`).
9. As admin, update the same user via the admin endpoint → `last_synced_at` advances, `updated_by` = admin UUID, new audit row appears. Confirms the legitimate sync path still works.

---

## 8. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Some downstream system was depending on `last_synced_at` advancing on refresh | Low — it was not advancing anyway (sync was throwing) | Low | Document in commit message; if a sync timestamp is needed, it should come from admin `updateUser` |
| `requireActor` import becomes unused in `auth-session.service.ts` | Low — `updateMe` path uses `dal.updateProfile` which calls `requireActor` | Low (lint warning) | Verify with grep after the edit; remove from import only if truly unused |
| `tsx watch` HMR fails to pick up the edit | Low | Low | Fallback: ask user to manually restart their dev server (do not kill it ourselves) |
| Lint / TS strict errors from the deletion | Low | Low | 2 self-correction attempts per `code-guardrails` rule, then halt and escalate |
| Dead-code elimination removes a method someone planned to call from a new route | Low — `private`, no test refs, no callers | Low | The plan documents the rationale; reintroducing it would require re-justifying the design |

---

## 9. Files touched

| File | Change |
|------|--------|
| `primebrick-be-v3/src/modules/auth/services/auth-session.service.ts` | (1) Remove the `syncProfileFromCasdoor` call + its `.catch()` from `refresh()`, replace with a comment explaining why no sync happens here. (2) Delete the now-unused `private async syncProfileFromCasdoor(...)` method (lines 463-515) including its JSDoc. (3) If `requireActor` becomes unused in this file after the deletion, remove it from the `@primebrick/sdk` import — verify with grep first. |

**Total: 1 file, 2-3 edits.**

---

## 10. Out of scope (deliberately)

- Refactoring `resolveInternalUuid` to also sync `display_name` / `email` / `is_admin` on every authed request. That would be a separate, larger change with its own design tradeoffs (DB write on every request, cache invalidation, etc.). Not needed for this bugfix — the JWT already carries fresh claims, and admin `updateUser` is the explicit sync path.
- Adding a dedicated periodic Casdoor→Primebrick sync job. Not needed — admin `updateUser` + `resolveInternalUuid` cover the legitimate cases.
- Changing the audit trail convention for system actors.
- Touching the SDK (`session-context.ts` is correct as-is).
- Touching the DAL (`user-profiles-dal.ts` is correct as-is).
- Changing any route permissions.
- Changing the FE post-refresh `/auth/me` reload (already correct).

---

## 11. Post-fix follow-up (optional, not part of this bugfix)

- Audit all `PUBLIC` routes for hidden `requireActor()` calls in their downstream service/DAL paths. The pattern "PUBLIC route → service → DAL → requireActor" is the class of bug that produced this incident. A grep-based scan would catch any siblings:
  ```
  rg "Permission.PUBLIC" primebrick-be-v3/src --type ts
  ```
  then trace each handler's service calls. This is a separate hardening task, not part of this bugfix.
- Consider whether `last_synced_at` should be renamed to `last_admin_sync_at` to reflect its true semantics (it records admin-driven syncs, not token-exchange syncs). Cosmetic, separate task.

---

## 12. Follow-up decision — `resolveInternalUuid` cache TTL (verified during this analysis)

During the analysis of this bugfix we traced `resolveInternalUuid` (D:\git\primebrick\primebrick-be-v3\src\modules\auth\user-profile-repo.ts) and reached a decision about its 5-minute LRU TTL that is **not part of this bugfix** but is documented here so it is not lost.

### 12.1 What the cache stores

`cache: Map<string, { uuid: string; expiresAt: number }>` keyed by `idp_code`. The cached value is **only the internal Primebrick UUID** — a single string. Nothing else (no roles, no display_name, no email, no permissions).

### 12.2 Why the cached value is immutable

- `idp_code` is the Casdoor user ID — never changes for a given user.
- `uuid` is the Primebrick `user_profiles` row primary key — set once at JIT provisioning, never changes for the row's lifetime.

So the `idp_code → uuid` mapping is **permanent for the user's lifetime**. The 5-minute TTL is not protecting against any real drift — it's defensive paranoia, and per the user's assessment, **bad practice** rather than just paranoia.

### 12.3 What the 5-min TTL does NOT do (common misconception, cleared during analysis)

- It does **not** refresh roles. Roles come from the JWT (`normalizeIdpToken(claims, ...)` in the SDK's `verify.ts`), not from `resolveInternalUuid`. The function returns only the UUID.
- It does **not** refresh `display_name`, `email`, `is_admin`, `is_active`, `is_verified`, `email_verified`, `roles`, `last_synced_at`. None of those fields are in the cache or returned by the function.
- It does **not** propagate admin role-mapping changes. That's a separate cache (`BeRoleMappingPort`) with a separate bug (stale-until-restart — see the Redis cache layer plan).

### 12.4 Decision

The 5-minute TTL should be **removed** (or, as a more conservative intermediate step, **raised to ~4 hours**). The cached mapping is immutable, so:

- **Option A (preferred):** remove the TTL entirely. Keep only the LRU size cap (1000 entries). The cache becomes a pure LRU, which is honest about what it's doing — caching an immutable mapping.
- **Option B (conservative intermediate):** raise `CACHE_TTL_MS` from `5 * 60 * 1000` to `4 * 60 * 60 * 1000` (4 hours). Reduces DB SELECT frequency by ~48× with no correctness impact. Useful if Option A feels too aggressive for a first change.

Either option is a **separate, tiny refactor** — not part of this bugfix. The change is in `D:\git\primebrick\primebrick-be-v3\src\modules\auth\user-profile-repo.ts`:

```ts
// BEFORE (line 27)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// AFTER (Option A — remove TTL)
// Cache holds an immutable idp_code → uuid mapping. No expiry — only the
// LRU size cap (CACHE_MAX_ENTRIES) bounds memory. See ai-plans/bugfix-refresh-sync-requires-actor.md §12.
const CACHE_TTL_MS = Number.POSITIVE_INFINITY;

// AFTER (Option B — raise to 4h)
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours — mapping is immutable, 5 min was bad practice
```

And `cacheGet` becomes a no-op on the expiry check when `CACHE_TTL_MS === Infinity` (or the check naturally never fires).

### 12.5 Future phase — move the cache to Redis

The BE is the API gateway + microservice orchestrator and **must** be able to run multiple instances (auto scale up/down behind NLB/LB — Docker, K8s, Swarm, Azure Container Apps, GCP Cloud Run, etc.). With N pods, each pod has its own in-process `resolveInternalUuid` cache → N× the DB SELECTs on cache misses.

The follow-up is to move this cache to Redis so all pods share it:
- Key: `be:idp_code_map:{idp_code}`
- Value: the UUID string
- TTL: none (immutable mapping)
- On miss: one pod does the SELECT + hydrates Redis; other pods see the hydrated key

This is documented as **Phase 4** of `feature-redis-cache-layer.md` and is **not part of either current plan** — it depends on the Redis infrastructure being in place (Phases 1-3 of the Redis plan).

### 12.6 Why this is documented here and not in the Redis plan only

The TTL decision is **independent** of Redis — it can be done today, in-process, with a one-line change. The Redis migration is a separate, larger effort that depends on infrastructure. Splitting the two decisions prevents the TTL fix from being blocked by the Redis rollout.
