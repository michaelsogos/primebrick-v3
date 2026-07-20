# Plan: Upgrade Casdoor v3.75.0 → v3.118.0

## Objective

Upgrade the Casdoor container from `casbin/casdoor:3.75.0` (2026-06-01) to
`casbin/casdoor:3.118.0` (2026-07-17, latest) in the dev environment, without
losing the custom `app.conf` edits or the existing Casdoor database state.

## Current State (verified empirically)

| Item | Value |
|------|-------|
| Container | `primebrick-casdoor` |
| Image | `casbin/casdoor:3.75.0` |
| Created | 2026-06-01 |
| DB driver | postgres (`casdoor` database in the shared PG instance) |
| Compose file | `primebrick-be-v3/infra/docker-compose.postgres.yml` (lines 62-88) |
| Volume | `primebrick_casdoor_data` → `/data` (currently **empty**) |
| `app.conf` location | `/conf/app.conf` **inside the image** — NOT mounted from host |
| Custom `app.conf` edits | `origin =` (empty), `originFrontend = http://localhost:5173` — applied via `docker exec` to the running container |

### Critical risk

The custom `app.conf` edits (`origin=`, `originFrontend=`) are stored **only
inside the running container's writable layer**. They are NOT in:
- A host-mounted file (no bind mount for `/conf`)
- The `primebrick_casdoor_data` volume (it maps to `/data`, not `/conf`)
- The `setup-casdoor.ts` script (it only touches the DB, not `app.conf`)

**If the container is recreated with a new image, these edits are LOST.**
This would reintroduce the 401 errors and WebAuthn origin mismatch we spent
the previous session fixing.

## Upgrade Strategy

### Step 1 — Persist `app.conf` as a bind mount (BEFORE upgrading)

Extract the current customized `app.conf` from the running container and mount
it from the host so it survives image upgrades.

1. Create host directory: `primebrick-be-v3/infra/casdoor-conf/`
2. Copy current `app.conf` out of the container:
   ```powershell
   docker exec primebrick-casdoor cat /conf/app.conf > primebrick-be-v3/infra/casdoor-conf/app.conf
   ```
3. Verify the extracted file has `origin =` (empty) and
   `originFrontend = http://localhost:5173`.
4. Edit `docker-compose.postgres.yml` — add a bind mount under the `casdoor`
   service `volumes`:
   ```yaml
   volumes:
     - primebrick_casdoor_data:/data
     - ./casdoor-conf/app.conf:/conf/app.conf
   ```
5. Recreate the container with the SAME image first to validate the mount:
   ```powershell
   docker compose -f infra/docker-compose.postgres.yml up -d casdoor
   ```
6. Verify `docker exec primebrick-casdoor cat /conf/app.conf` still shows the
   custom edits.
7. Verify Casdoor starts and OIDC discovery works:
   ```powershell
   curl http://localhost:8000/.well-known/openid-configuration
   ```
8. Verify the BE can still validate JWTs (login + authenticated API call).

### Step 2 — Pull the new image

```powershell
docker pull casbin/casdoor:3.118.0
```

### Step 3 — Update compose file image tag

Edit `docker-compose.postgres.yml` line 63:
```yaml
image: casbin/casdoor:3.118.0
```

### Step 4 — Recreate the container

```powershell
docker compose -f infra/docker-compose.postgres.yml up -d casdoor
```

Casdoor uses XORM auto-migration — on startup it will add any new columns/tables
required by v3.118.0 to the existing `casdoor` Postgres database automatically.
No manual SQL migration is needed.

### Step 5 — Post-upgrade verification

1. **Container health**: `docker ps` — container is healthy.
2. **OIDC discovery**: `curl http://localhost:8000/.well-known/openid-configuration`
   — `issuer` should be `http://localhost:8000` (because `origin=` is empty and
   the request Host is `localhost:8000`).
3. **JWKS**: `curl http://localhost:8000/.well-known/jwks.json` — returns keys.
4. **BE login**: POST `/api/v1/auth/login` — returns 200 with JWT.
5. **BE authenticated call**: GET `/api/v1/auth/me` with the JWT — returns 200.
6. **WebAuthn signin/begin**: POST `/api/v1/auth/webauthn/signin/begin` —
   returns options with `rpId: localhost`.
7. **Casdoor admin UI**: open `http://localhost:8000` — login as
   `built-in/admin` / `admin`, verify the `primebrick-api` application still
   exists with `enableWebAuthn = true` and both redirect URIs.
8. **`app.conf` preserved**: `docker exec primebrick-casdoor cat /conf/app.conf`
   — still has `origin =` and `originFrontend = http://localhost:5173`.

### Step 6 — Re-run `setup-casdoor.ts` (idempotent safety net)

```powershell
cd primebrick-be-v3
pnpm run setup:casdoor
```

This is idempotent — it will ensure `enable_web_authn`, `grant_types`, and
redirect URIs are correct on both applications. It will NOT overwrite the
`app.conf` (it only touches the DB).

## Rollback Plan

If v3.118.0 breaks something:

1. Revert the image tag in `docker-compose.postgres.yml` back to `3.75.0`.
2. `docker compose -f infra/docker-compose.postgres.yml up -d casdoor`
3. The `casdoor` database is shared with the PG volume — XORM downgrades are
   not automatic, but new columns added by v3.118 are nullable and won't
   break v3.75.0 (XORM ignores unknown columns).

If the DB is corrupted (unlikely):
1. Stop the casdoor container.
2. Drop and recreate the `casdoor` database:
   ```sql
   DROP DATABASE casdoor;
   CREATE DATABASE casdoor OWNER primebrick;
   ```
3. Restart casdoor (it will re-init with `--createDatabase=true`).
4. Re-run `pnpm run setup:casdoor`.

## Files to modify

| File | Change |
|------|--------|
| `primebrick-be-v3/infra/docker-compose.postgres.yml` | Image tag `3.75.0` → `3.118.0`; add bind mount for `app.conf` |
| `primebrick-be-v3/infra/casdoor-conf/app.conf` | NEW file — extracted from current container |

## What is NOT changed

- `setup-casdoor.ts` — no changes needed (it's DB-only and idempotent)
- BE source code — no changes needed (the `Host` header hack for WebAuthn
  endpoints still works the same way, since Casdoor's `GetWebAuthnObject` still
  uses `c.Ctx.Request.Host`)
- FE source code — no changes needed

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| XORM auto-migration fails on Postgres | Low | Casdoor tests against PG; rollback to 3.75.0 if needed |
| New required `app.conf` keys in v3.118 | Low | The bind-mounted `app.conf` from 3.75.0 will be used; Casdoor falls back to defaults for missing keys |
| `reverseProxy` application fields change behavior | None | These fields exist in 3.75.0 already and are empty by default; they don't affect WebAuthn origin derivation |
| `app.conf` lost during upgrade | **Eliminated by Step 1** | Bind mount persists the file across image changes |
| Casdoor admin password / built-in app reset | Low | The `casdoor` DB volume persists; `setup-casdoor.ts` is idempotent |

## Acceptance criteria

- [ ] `app.conf` is bind-mounted from host and survives container recreation
- [ ] Casdoor v3.118.0 container is healthy
- [ ] OIDC discovery returns `issuer: http://localhost:8000`
- [ ] BE login + authenticated API calls work (no 401s)
- [ ] WebAuthn signin/begin returns `rpId: localhost`
- [ ] Casdoor admin UI loads and shows `primebrick-api` app with WebAuthn enabled
