# Login page — auto session check, refresh, redirect_path

## Goal

The login page today renders the form unconditionally — even with a valid session
cookie the user sees username/password and, on submit, a spurious MFA challenge.
Fix: on mount, evaluate the local session state and either auto-enter, refresh
the token and enter, or show the form — with visible system-standard loading
states in between. Also propagate the intended destination through a
`?redirect_path=` query param on hard redirects to `/login`, and honor it after
a successful login.

## Empirical findings (verified)

- `sessionStorage['user']` already carries `expires_at` — the FE can check
  token expiry **client-side**, no `/auth/me` needed. `hasLocalSession()` and
  `isTokenExpired()` already exist but are **private** to `src/lib/api.ts`.
- `triggerRefresh()` already exists in `api.ts`: POST `/api/v1/auth/refresh`
  with `credentials: include`, single-flight concurrency (`refreshPromise`),
  writes the fresh `user` back to `sessionStorage` on success.
- `redirect-cache.ts` already saves the current URL in `sessionStorage`
  (`saveRedirectUrl`) and the login page already consumes it
  (`getAndClearRedirectUrl() || '/'`) on login success.
- `SessionExpiredDialog` "Go to login page" does
  `saveRedirectUrl(path+search)` then `window.location.href = '/login'` —
  the single hard-redirect point to extend with the QS param.
- Direct access to a protected page without a session currently opens the
  **session-expired modal** (not a page redirect) — keep; the QS param applies
  only when the flow actually navigates to the login page.
- Icons verified in `@lucide/svelte`: `cookie` (`Cookie`),
  `rotate-ccw-key` (`RotateCcwKey`).
- **`LoadingWatermark.svelte` (`$lib/components/auth/`) already exists** —
  prop-driven (`icon`, `titleKey`, `hintKey`), big icon (size-20, gradient
  pulse) + title + hint. The exact shape needed for the boot states.
- **`userProfileStore.clear()` already exists** — clears in-memory profile +
  `sessionStorage['user']`. The same two operations are currently duplicated
  inline in `api.ts:276-277` (refresh-failure path).
- Login `+page.svelte` onMount today: health probe + public translations +
  hero only — no session check (confirmed gap).

## DRY design decisions

1. **Reuse `LoadingWatermark`** for both boot states instead of writing a new
   loader. Add one optional prop `animation?: 'pulse' | 'flip'` that switches
   the icon wrapper animation to the requested **rotateY (vertical-axis) spin
   + zoom pulse** via a CSS keyframe added to the component. Default stays the
   existing pulse → zero impact on current callers (MfaManagement,
   PasskeyEnrollment).
2. **One shared session-check module** — `src/lib/auth/session-check.ts`
   hosts `hasLocalSession()`, `isTokenExpired()`, `refreshAccessToken()`,
   `triggerRefresh()` and the single-flight `refreshPromise` — all moved
   verbatim from `api.ts`, which re-imports them. One implementation for
   api.ts and the login page; single-flight semantics preserved module-level.
3. **`userProfileStore.clear()` everywhere** — refresh-failure paths (api.ts
   and the login boot) call the existing store method; delete the inline
   `sessionStorage.removeItem('user')` + `userProfileState.current = null`
   duplicates.
4. **One `goToLoginPage()` helper** in `redirect-cache.ts` — does
   `saveRedirectUrl(current)` + `window.location.href = '/login?redirect_path=' + enc(current)`.
   `SessionExpiredDialog` calls it; any future hard redirect uses the same
   entry point.
5. **One `resolvePostLoginTarget()` helper** in `redirect-cache.ts` —
   `sanitizeRedirectPath(qs) > getAndClearRedirectUrl() > '/'`. Used by both
   the auto-enter boot path and the manual login success handler.
6. **One `sanitizeRedirectPath()`** — accepts only `/...` paths; rejects
   `//x` (protocol-relative), backslashes, control chars. Never a full URL.

## Correctness notes (verified during deep dive)

- `expires_at` is present in the `user` payload of BOTH `POST /auth/login`
  and `POST /auth/refresh` (shared `buildUserFromClaims`) — the client-side
  expiry check has real data.
- `/auth/me` returns `profile` (no `expires_at`) — `userProfileStore.set`
  merges, so it never clobbers a stored `expires_at`. If `user` exists
  without `expires_at` (e.g. written by a profile merge), `isTokenExpired`
  returns true → refresh path self-heals and rewrites a complete `user`.
- `POST /auth/refresh` authenticates via the `refresh_token` HttpOnly cookie
  — the only cross-tab session channel. Refresh cookies are issued only
  after a full login (incl. MFA), so auto-enter via refresh is safe.
- `triggerRefresh` is currently **private** in `api.ts` — the plan moves it
  to `session-check.ts` and exports it.
- **Cross-tab edge (fixed by design)**: `sessionStorage['user']` is per-tab —
  a new tab has no local session even with a valid refresh cookie. Boot
  therefore attempts `triggerRefresh()` once whenever there is no valid
  local session, not only when `user.expires_at` is expired. Cost: one POST
  → 401 for genuinely logged-out users on each `/login` view — negligible.
- `window.location.href` for the post-login navigation (full reload) —
  consistent with the existing login success handler and guarantees a clean
  app boot on the fresh session.

## Implementation

### `src/lib/auth/session-check.ts` (NEW)

Move from `api.ts`: `hasLocalSession()`, `isTokenExpired()`,
`refreshAccessToken()`, `triggerRefresh()`, `refreshPromise`. `api.ts`
imports them — no behavior change.

### `src/lib/auth/redirect-cache.ts`

- `sanitizeRedirectPath(raw): string | null`
- `resolvePostLoginTarget(qsParam: string | null): string`
- `goToLoginPage(): void` — save + hard redirect with QS param

### `src/lib/api.ts`

- Import `hasLocalSession`/`isTokenExpired` from `session-check.ts` (delete
  private copies).
- Replace inline session clear (refresh-failure 401 path) with
  `userProfileStore.clear()`.

### `src/routes/login/+page.svelte`

- `bootState: 'checking' | 'refreshing' | 'form'` state machine:
  - `hasLocalSession() && !isTokenExpired()` → `checking` →
    `window.location.href = resolvePostLoginTarget(qs.redirect_path)`
  - otherwise (`!hasLocalSession()` OR expired) → `refreshing` →
    `triggerRefresh()` once → success → same redirect; failure →
    `userProfileStore.clear()` → `form`
  - Rationale: `sessionStorage['user']` is per-tab — a fresh tab with a
    valid refresh cookie must still auto-enter. The refresh cookie is the
    authoritative cross-tab channel; a genuine logged-out user pays one
    401 and sees the form.
- Boot UI while `bootState !== 'form'`: `<LoadingWatermark>`
  - `checking` → `icon={Cookie}`, title `app.auth.login.auto_logging`,
    `animation="flip"`
  - `refreshing` → `icon={RotateCcwKey}`, title
    `app.auth.login.refreshing_token`, `animation="flip"`
- Manual login success handler: replace inline
  `getAndClearRedirectUrl() || '/'` with `resolvePostLoginTarget(...)`.

### `src/lib/components/auth/LoadingWatermark.svelte`

- Add optional `animation?: 'pulse' | 'flip'` (default `'pulse'`).
- `flip` → new CSS keyframe: continuous `rotateY(0→360deg)` loop (vertical
  axis, left-to-right) + scale in-out (1→1.15→1), `preserve-3d`, eased,
  ~1.2s — applied to the icon wrapper only.

### `src/lib/components/auth/SessionExpiredDialog.svelte`

- "Go to login page" → `goToLoginPage()` (replaces inline save + href).

### i18n (BE-owned, per rules)

- `app.auth.login.auto_logging` — "Auto logging in…" / "Accesso automatico…"
- `app.auth.login.refreshing_token` — "Refreshing token…" / "Aggiornamento token…"
- `app.auth.login.auto_logging_hint` / `refreshing_token_hint` (hintKey slot)
- Seed `db-meta/fire-and-forget/add_login_boot_translations.sql` for the 6
  seeded languages + en-GB entries in `en-GB-fallback.json`; Redis i18n
  invalidation after seeding.

## Impacted files

- `src/routes/login/+page.svelte` — bootState machine, LoadingWatermark, target
- `src/lib/auth/session-check.ts` — NEW (moved helpers)
- `src/lib/api.ts` — import session-check, `userProfileStore.clear()`
- `src/lib/auth/redirect-cache.ts` — sanitize + resolve + goToLoginPage
- `src/lib/components/auth/LoadingWatermark.svelte` — `animation` prop + flip keyframe
- `src/lib/components/auth/SessionExpiredDialog.svelte` — goToLoginPage()
- `src/lib/i18n/messages/en-GB-fallback.json` — keys
- `primebrick-be-v3/db-meta/fire-and-forget/add_login_boot_translations.sql` — NEW

## Acceptance criteria

1. Valid local session → brief "Auto Logging" (cookie icon, Y-axis spin) →
   into the app, no form/MFA flash.
2. Expired `expires_at` + valid refresh cookie → "Refreshing Token"
   (rotate-ccw-key) → refresh → into the app.
3. Refresh fails → `userProfileStore.clear()` → form.
4. Fresh tab, no local session, valid refresh cookie → "Refreshing Token" →
   auto-enter (cross-tab coverage).
4b. Genuinely logged-out → one refresh 401 → form (no infinite loader).
5. "Go to login page" → `/login?redirect_path=<safe>`; post-login lands there.
6. `redirect_path=https://evil.com` or `//evil.com` → rejected → `'/'`.
7. `pnpm check` clean on touched files; MFA challenge flow untouched.

## Follow-up notes (post-implementation)

- **E2E admin account**: the seeded `admin` now has TOTP enrolled (residue
  from an `auth-mfa.spec.ts` run), so `loginAsAdmin` stalls at the MFA
  challenge and every suite using it fails in this environment.
  TODO: create a dedicated **non-MFA e2e user** for login-based suites,
  or extend `loginAsAdmin` to complete the TOTP challenge from a secret
  (env `CASDOOR_ADMIN_TOTP_SECRET` — secret lives in Casdoor, not app DB).
- **en-US**: offered in `UI_LANGS`/LangSelect but has zero translation rows
  in the DB → raw keys for anyone selecting it. Decide: seed en-US copied
  from en-GB, or remove from the picker.
- New e2e spec added: `src/e2e/auth-login-boot.spec.ts` (6 tests: boot
  states, redirect_path, sanitization, UI logout, forced-401 dialog flow).
- New testids: `sidebar-profile-menu-trigger`, `sidebar-logout-button`,
  `session-expired-goto-login`.
- Backup of the stale 1272-line EntityListTable buffer:
  `d:\git\primebrick\temp\EntityListTable-1272-backup.svelte` (delete once
  confirmed unneeded).
