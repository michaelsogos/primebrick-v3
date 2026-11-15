# Plan: Upgrade Casdoor v3.118.0 → v4.11.0

## Objective

Upgrade the Casdoor container from `casbin/casdoor:3.118.0` to
`casbin/casdoor:4.11.0` in the dev environment, preserving the `casdoor`
Postgres database (users, applications, orgs, WebAuthn credentials, MFA
factors), the bind-mounted `app.conf`, and all BE↔Casdoor API integrations
(user sync, WebAuthn/passkeys, MFA/TOTP, OAuth token exchange).

## Current State (verified)

| Item | Value |
|------|-------|
| Container | `primebrick-casdoor` |
| Image | `casbin/casdoor:3.118.0` |
| Compose | `primebrick-be-v3/infra/docker-compose.postgres.yml` (lines 65–99) |
| DB | Postgres `casdoor` database (shared PG instance, `primebrick_casdoor_data` volume only holds `/data`) |
| `app.conf` | Bind-mounted from host: `primebrick-be-v3/infra/casdoor-conf/app.conf` ✅ (already survived the 3.75→3.118 upgrade) |
| BE admin API client | `src/modules/auth/casdoor-api-client.ts` — REST calls authenticated via `clientId`/`clientSecret` **query params** of the built-in application |
| WebAuthn | `webauthn.service.ts` calls `/api/webauthn/{signin,signup}/{begin,finish}` + `/api/login/oauth/access_token` + `/api/get-user` + `/api/update-user` |
| MFA | `casdoor-api-client.ts` calls `/api/mfa/setup/{initiate,verify,enable}`, `/api/set-preferred-mfa`, `/api/delete-mfa` (stateless, admin credentials in query) |
| User/org/role sync | `/api/{get,add,update,delete}-{user,organization,role,application}`, `/api/set-password`, `/api/check-user-password` |
| SDK | `casdoor-nodejs-sdk:1.34.0` imported in `src/index.ts` (JWT verify/config) |
| Setup script | `scripts/setup-casdoor.ts` — idempotent, DB-only + application config |

## Breaking Changes & Risk Analysis

### v4.0.0 — THE major bump (2026-09-01)

The **only** feature-level change in v4.0.0 is the console rewrite:
Ant Design + create-react-app → **shadcn/ui + Tailwind + Vite**.

**Official breaking change:**
- `web/` build output changed from CRA's `build/static/{js,css}` to Vite's
  `build/assets/`. Any CDN / reverse proxy serving Casdoor statics must
  update paths.
- The Ant Design frontend remains in-tree at `web-old/` but is **not built
  or served**.

**Impact on Primebrick:**
- ✅ We do **not** proxy Casdoor statics — users hit `localhost:8000`
  directly. No nginx/proxy path changes needed.
- ⚠️ **`app.conf` has `staticBaseUrl = "https://cdn.casbin.org"`** — if the
  CDN still serves the old CRA layout for v4, the admin console could break
  or render stale assets. Must verify after boot; if the UI is broken/blank,
  clear `staticBaseUrl` (empty → serve from local build) and restart.
- ⚠️ `app.conf` also has `frontendBaseDir = "../cc_0"` (leftover custom
  value) — verify it doesn't break v4 asset resolution; remove if the
  console fails to load.
- The **Go backend API surface is unchanged** in v4.0.0 — no REST endpoint
  renames, no request/response schema changes. All our
  `casdoor-api-client.ts` calls remain valid.

### v4.1 → v4.11 — behavioral + security-hardening deltas

These are the commits that actually matter for our integration:

| Release | Relevant changes |
|---------|------------------|
| v4.1–v4.3 | Console parity fixes ("follow web-old behavior") — admin UI only, no API impact |
| v4.4 | `redisEndpoint` supports multiple addresses (Redis Cluster) — optional improvement, our single `redis:6379` still works |
| ~v4.5–v4.9 | Session fixes: deleting a login session revokes its OAuth tokens; `sid` claim moved from `jti` back to session id; back-channel logout order fixed. **Relevant to `auth-session.service.ts`** — token revocation semantics improved, verify our session/logout flow still works. |
| **v4.10** | ⚠️ **Heavy authz hardening** — this is the highest-risk release for us: `block cross-org token minting and secret-field query oracles`, `harden MFA, device flow and cross-org group checks`, `restrict add-token to org admins and same-org applications`, `scope authz self-match, SCIM, DCR and commerce APIs to their owners`, `strip MFA fields from JWT claims`, `return hashed session IDs instead of raw session cookies`, `issue a separate OIDC ID token instead of reusing the access token`. |
| **v4.11** | More of the same: `bind MFA remember to device`, `block cross-org API permission fallback on empty owner`, `harden OAuth, MFA, CAS and signup security checks`, `restrict ID verification providers to their own organization`. |

**Why v4.10/v4.11 are risky for us specifically:**

1. **Cross-org API authz.** Our `CasdoorApiClient` authenticates every call
   with the built-in application's `clientId`/`clientSecret` as query params
   and then operates on resources across orgs (`owner` param per call, e.g.
   `?owner=<org>&name=<user>`). The fixes "block cross-org API permission
   fallback on empty owner" and "restrict … to their own organization" may
   now **403** calls where the credential's org doesn't match the target
   `owner`. Mitigation: ensure every API call passes an explicit `owner`
   (our client already does) and that the admin credentials belong to an
   application authorized for cross-org admin ops (the `built-in` admin app
   normally is — but this must be smoke-tested).

2. **MFA hardening.** "Harden MFA … security checks" + "strip MFA fields
   from JWT claims" + "bind MFA remember to device". Our stateless MFA flow
   (`mfa/setup/initiate` → `verify` → `enable` with admin creds, no session)
   was verified against v3.118 "spike notes". It may now require a session
   or additional fields. **Must be re-tested end-to-end**: TOTP enroll,
   verify, challenge, delete, recovery codes.

3. **ID token separation.** "Issue a separate OIDC ID token instead of
   reusing the access token" — if our token-verifier or MCP OAuth flow
   treated the access token as the ID token, verify claims still validate
   (JWKS verify in `casdoor-nodejs-sdk` / `oidc-verifier.ts`).

4. **`webauthnCredentials` wipe guard.** Our `updateUser` reads + echoes
   `webauthnCredentials` to avoid Casdoor NULLing the column on partial
   updates. If v4 changed the default column set for `update-user`, verify
   passkeys survive a profile update.

5. **`enableWebAuthn` inheritance.** v4 release notes mention new
   applications inherit `EnableWebAuthn` and branding from the default
   application — our `setup-casdoor.ts` + `setApplicationWebAuthn` logic
   should still be authoritative; re-run it after upgrade.

### No documented DB migration concerns

- Casdoor uses **XORM `Sync2()` auto-migration** on startup — new
  columns/tables are added automatically to the existing `casdoor` DB.
  There is no official migration script or downgrade path.
- Known risk (from community issues): XORM warnings about column type
  mismatches are benign on Postgres; MySQL had row-size panics — we're on
  Postgres, low risk.
- **Rollback is NOT schema-safe**: v4 may alter column types. Take a
  `pg_dump` of the `casdoor` DB before upgrading (see Step 2).

## Upgrade Strategy

### Step 0 — Pre-flight

```powershell
docker ps --filter name=primebrick-casdoor
docker exec primebrick-casdoor wget -qO- http://localhost:8000/.well-known/openid-configuration
```

Confirm current version healthy and note the `issuer`.

### Step 1 — Freeze `app.conf` review for v4

Edit `primebrick-be-v3/infra/casdoor-conf/app.conf`:

- **Clear `staticBaseUrl`** → `staticBaseUrl = ""` so the v4 shadcn build is
  served locally (the cdn.casbin.org layout is the old CRA one; pointing at
  it risks a broken console).
- **Review `frontendBaseDir = "../cc_0"`** — likely a stray value; set to
  `""` unless we know a custom frontend dir is in use.
- Keep `origin =` (empty) and `originFrontend = http://localhost:5173` —
  WebAuthn rpId derivation still depends on request Host in v4.
- Diff our `app.conf` against the v4.11.0 default (`conf/app.conf` in the
  casdoor repo at tag `v4.11.0`) for **new keys** — add any new keys with
  defaults (e.g. anything related to MCP, DCR, session hashing).

### Step 2 — Backup the Casdoor database

```powershell
docker exec primebrick-postgres pg_dump -U primebrick -d casdoor -Fc -f /tmp/casdoor-pre-v4.dump
docker cp primebrick-postgres:/tmp/casdoor-pre-v4.dump ./backups/casdoor-pre-v4.dump
```

(Adjust container name if different.) This is the only reliable rollback —
XORM migrations are one-way.

### Step 3 — Pull image + bump tag

```powershell
docker pull casbin/casdoor:4.11.0
```

Edit `docker-compose.postgres.yml` line 66:
```yaml
image: casbin/casdoor:4.11.0
```

### Step 4 — Recreate

```powershell
docker compose -f infra/docker-compose.postgres.yml up -d casdoor
docker logs -f primebrick-casdoor   # watch XORM Sync2 output for errors
```

### Step 5 — Post-upgrade verification matrix

| # | Check | Command / path |
|---|-------|----------------|
| 1 | Container healthy, no XORM panic | `docker ps`, `docker logs` |
| 2 | OIDC discovery | `curl http://localhost:8000/.well-known/openid-configuration` → `issuer` unchanged |
| 3 | JWKS | `curl http://localhost:8000/.well-known/jwks.json` |
| 4 | Admin console loads (shadcn UI) | open `http://localhost:8000`, login `built-in/admin` |
| 5 | `primebrick-api` app intact | `enableWebAuthn=true`, redirect URIs, grant types |
| 6 | **BE login** | `POST /api/v1/auth/login` → 200 + JWT |
| 7 | **Authed call** | `GET /api/v1/auth/me` → 200 (JWT verify path incl. casdoor-nodejs-sdk) |
| 8 | **WebAuthn signin begin** | `POST /api/v1/auth/webauthn/signin/begin` → `rpId: localhost` |
| 9 | **Passkey signin e2e** | real passkey ceremony (FE or `e2e/auth-passkey.spec.ts`) |
| 10 | **Passkey preserved after profile update** | update user displayName via BE, then confirm `webauthnCredentials` non-empty in `get-user` |
| 11 | **MFA enroll e2e** | initiate → verify → enable → challenge → preferred → delete |
| 12 | **User sync** | create/update/forbid user via BE → visible in Casdoor admin |
| 13 | **Org + role sync** | org combobox roles (`get-role`/`add-role`/`update-role`/`delete-role`) — watch for **403s from the new cross-org authz hardening** |
| 14 | **Token exchange** | `/api/login/oauth/access_token` (webauthn.service.ts) — check response still parses (new separate ID token) |
| 15 | **MCP OAuth flow** | `/mcp` token verifier + `/api/v1/entities/...` calls with Casdoor-issued token |

### Step 6 — Re-run setup script

```powershell
cd primebrick-be-v3
pnpm run setup:casdoor
```

Idempotent — reasserts `enableWebAuthn`, grant types, redirect URIs.

### Step 7 — E2E suite

```powershell
cd primebrick-fe-v3
pnpm exec playwright test src/e2e/auth-passkey.spec.ts
```

## Rollback Plan

1. Revert image tag to `3.118.0`, `docker compose ... up -d casdoor`.
2. If the v4 XORM migration altered columns incompatibly, restore the dump:
   ```powershell
   docker exec -i primebrick-postgres psql -U primebrick -c "DROP DATABASE casdoor; CREATE DATABASE casdoor OWNER primebrick;"
   docker cp ./backups/casdoor-pre-v4.dump primebrick-postgres:/tmp/
   docker exec primebrick-postgres pg_restore -U primebrick -d casdoor /tmp/casdoor-pre-v4.dump
   ```
3. Re-run `pnpm run setup:casdoor`.

## Files to modify

| File | Change |
|------|--------|
| `primebrick-be-v3/infra/docker-compose.postgres.yml` | image `3.118.0` → `4.11.0` |
| `primebrick-be-v3/infra/casdoor-conf/app.conf` | clear `staticBaseUrl`, review `frontendBaseDir`, add any new v4 keys |
| `primebrick-be-v3/src/modules/auth/casdoor-api-client.ts` | **possibly** — only if v4.10/4.11 authz hardening 403s our admin calls (e.g. need explicit `owner` on calls that lack it, or a different credential scope). Test first, patch second. |
| `primebrick-be-v3/src/modules/auth/services/webauthn.service.ts` | **possibly** — if token response shape changed (separate ID token) |

## What is NOT expected to change

- BE REST endpoint paths (all `/api/*` Casdoor endpoints used are unchanged in v4)
- `setup-casdoor.ts` logic (idempotent re-run only)
- FE code (Casdoor console rewrite is server-side; our FE talks to our BE, not to Casdoor's UI)
- JWT verification keys/certs (JWKS endpoint unchanged)

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| v4.10/4.11 cross-org authz hardening 403s admin API calls | **Medium** | Smoke-test every client method (Step 5); if 403s appear, check Casdoor logs for the denied owner/permission and either grant the built-in app broader scope or adjust call params |
| Stateless MFA endpoints now require session | Medium | E2E test the full TOTP lifecycle early; worst case keep session cookie in the admin client |
| `staticBaseUrl` CDN serves wrong FE layout | Medium | Clear it in Step 1 |
| XORM Sync2 fails mid-migration | Low | pg_dump restore (Step 2) |
| `update-user` still wipes passkeys | Low–Medium | Test #10 specifically; our echo-back guard should still work |
| Separate ID token breaks token parsing | Low | Verify #14; adapt `webauthn.service.ts` token parsing if needed |
| `casdoor-nodejs-sdk@1.34.0` incompatible with v4 | Low | JWT verify is standard OIDC/JWKS; check casdoor-nodejs-sdk releases for a v4-compatible version if login fails |

## Acceptance criteria

- [ ] `casbin/casdoor:4.11.0` container healthy on port 8000
- [ ] Casdoor DB migrated without XORM errors; users/apps/orgs intact
- [ ] Admin console (new shadcn UI) loads and is functional
- [ ] BE login + authed calls work (no 401s)
- [ ] Passkey signin + signup ceremonies succeed e2e
- [ ] Passkeys survive a user profile update
- [ ] Full TOTP MFA lifecycle succeeds e2e
- [ ] User/org/role sync APIs return 2xx (no new authz 403s)
- [ ] OAuth access_token + ID token flow validated (incl. MCP verifier)
- [ ] `pg_dump` backup taken and restorable
