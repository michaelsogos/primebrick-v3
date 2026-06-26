# Fix: Email Verification Check Regression & Casdoor Admin User Misconfiguration

## Date: 2026-06-24
## Status: AWAITING APPROVAL
## Repo: primebrick-be-v3

---

## 1. Problem Statement

Admin login fails with `401 UnauthorizedError: "The user email isn't verified yet"`.

### Empirical Evidence Gathered

1. **Error origin**: `src/modules/auth/services/auth-session.service.ts` line 99:
   ```ts
   if (claims.emailVerified === false) {
     throw new UnauthorizedError("The user email isn't verified yet", { ... });
   }
   ```

2. **Casdoor admin user state** (queried via Casdoor API on 2026-06-24):
   ```
   name: admin
   email: admin@acme.local.it.com
   emailVerified: false    ← ROOT CAUSE
   isVerified: true         ← account-level verification (different field)
   isAdmin: false           ← ALSO WRONG (should be true)
   isForbidden: false
   ```

3. **PG admin user state** (queried via postgres MCP):
   ```
   email_verified: true
   is_verified: true
   is_admin: true
   last_synced_at: 2026-06-21
   ```
   PG is correct. Casdoor is wrong. Sync only goes Casdoor→PG, never PG→Casdoor.

4. **The check is NOT new** — it was introduced in commit `3720c09` (2026-05-22) "Add is_verified and issuer fields to user profiles". The refactoring commit `51cb8b3` (2026-06-23) preserved it identically. The check exists in both the old `router.ts` and the new `auth-session.service.ts` with the same logic.

5. **Why the setup script didn't fix it**: `scripts/setup-casdoor.ts` lines 246-261 already send `emailVerified: true, isVerified: true, isAdmin: true` via the `add-user` API. This is correct for a first installation on an empty environment. The problem is that the current environment's admin user was created BEFORE commit `3720c09` added these fields (the script originally had `isAdmin: false` and no `isVerified`/`emailVerified` fields at all). Re-running the script on a non-empty environment hits "already exists" and skips. The setup script is a first-install script — it should NOT be modified to handle existing users. The fix for the current environment is a separate una-tantum script (Workstream C).

6. **Why login worked before May 22**: The `emailVerified === false` check did not exist before commit `3720c09`. It was added on May 22, 2026. Between May 22 and June 23 (refactoring), the check was present and identical. The most likely explanation for why login "seemed to work" is:
   - The user did not test admin login between May 22 and June 24 (they were doing frontend refactoring)
   - OR the Casdoor JWT did not include the `emailVerified` claim at all (in which case `undefined === false` is `false` and the check passes), and something in Casdoor changed to start including it
   - This is an open question that requires decoding the actual JWT to confirm, but the fix is the same regardless

---

## 2. Solution Overview

Three workstreams:

| # | Workstream | Risk | Files |
|---|-----------|------|-------|
| A | Add `enable_email_verification_check` flag to auth_configurations | LOW | config-repo.ts, auth-session.service.ts |
| B | Add seed row for new flag in init SQL patch | LOW | db-meta/patches/00000000000000_init_database.sql |
| C | Create una-tantum fix script for current Casdoor admin user + insert config row | LOW | scripts/fix-casdoor-admin-user.ts (new), package.json |

**Note on `setup-casdoor.ts`**: This script is a first-installation script for an empty environment. It already correctly passes `emailVerified: true, isVerified: true, isAdmin: true` at lines 249-252. No changes are needed — the script is correct for fresh installs. The current broken state is only because the admin user was created before these fields were added to the script.

---

## 3. Detailed Plan

### Workstream A: Configurable Email Verification Check

#### A1. Add flag to `AuthConfigDb` interface

**File**: `src/modules/auth/config-repo.ts`

Add new field to interface:
```ts
export interface AuthConfigDb {
  // ... existing fields ...
  enableEmailVerificationCheck: boolean;  // NEW
}
```

Update `loadAuthConfigFromDb` to read it:
```ts
return {
  // ... existing fields ...
  enableEmailVerificationCheck: settings.enable_email_verification_check === "true",
};
```

**Rationale**: The flag is stored as a string (`"true"` / `"false"`) in the key-value table, consistent with all other config values. Parsed to boolean at load time. Default is `false` (check disabled) when the key is missing.

#### A2. Conditionally apply the check in auth-session service

**File**: `src/modules/auth/services/auth-session.service.ts`

Current code (lines 96-103):
```ts
const claims = this.decodeJwtPayload(data.access_token);

// Email-verified + role guards (preserved from the original handler).
if (claims.emailVerified === false) {
  throw new UnauthorizedError("The user email isn't verified yet", {
    internal_code: "email_not_verified",
  });
}
```

Changed code:
```ts
const claims = this.decodeJwtPayload(data.access_token);

// Email-verified guard — gated by auth_configurations flag (default: disabled).
// When disabled, the check is skipped entirely, preserving pre-3720c09 behavior.
const cfg = await this.loadOidcConfig();
if (cfg.enableEmailVerificationCheck && claims.emailVerified === false) {
  throw new UnauthorizedError("The user email isn't verified yet", {
    internal_code: "email_not_verified",
  });
}
```

**Problem**: `loadOidcConfig()` is already called at line 69 at the start of `login()`. We should NOT call it twice. Instead, the `login()` method already has `cfg` in scope. The check at line 99 is inside `login()`, so we can use the existing `cfg` variable.

**Revised approach**: Modify `loadOidcConfig()` return type to include `enableEmailVerificationCheck`, then use the already-loaded `cfg`:

**File**: `src/modules/auth/services/auth-session.service.ts`

Step 1 — Update `loadOidcConfig()` return type (lines 292-314):
```ts
private async loadOidcConfig(): Promise<{
  casdoorEndpoint: string;
  clientId: string;
  clientSecret: string;
  orgName: string;
  enableEmailVerificationCheck: boolean;  // NEW
}> {
  // ... existing env defaults ...
  let enableEmailVerificationCheck = false;  // default: disabled

  try {
    const dbConfig: AuthConfigDb = await loadAuthConfigFromDb(this.pool);
    // ... existing assignments ...
    enableEmailVerificationCheck = dbConfig.enableEmailVerificationCheck;
  } catch (error) {
    // ... existing fallback ...
  }

  return { casdoorEndpoint, clientId, clientSecret, orgName, enableEmailVerificationCheck };
}
```

Step 2 — Use `cfg.enableEmailVerificationCheck` in `login()` (line 99):
```ts
// Email-verified guard — gated by auth_configurations flag (default: disabled).
if (cfg.enableEmailVerificationCheck && claims.emailVerified === false) {
  throw new UnauthorizedError("The user email isn't verified yet", {
    internal_code: "email_not_verified",
  });
}
```

**Note**: The `cfg` variable is already loaded at line 69 (`const cfg = await this.loadOidcConfig()`). No extra DB call needed.

#### A3. Add seed row in init SQL patch

**File**: `db-meta/patches/00000000000000_init_database.sql`

Add to the seed INSERT block (after line 366, before `ON CONFLICT`):
```sql
('enable_email_verification_check', 'false', 'Abilita il controllo emailVerified sul JWT durante il login (true/false)', 'system'),
```

**Full updated block**:
```sql
-- Seed initial auth configuration values
INSERT INTO "public"."auth_configurations" ("key", "value", "description", "created_by") VALUES
('casdoor_endpoint', 'http://localhost:8000', 'URL base del server Casdoor', 'system'),
('casdoor_organization', 'ACME', 'Nome dell organization di riferimento', 'system'),
('casdoor_client_id', 'primebrick-api', 'Client ID della nostra applicazione', 'system'),
('casdoor_admin_username', 'admin', 'Username dell utente amministratore standard', 'system'),
('casdoor_admin_role', 'administrators', 'Nome del ruolo amministrativo', 'system'),
('oidc_issuer_url', 'http://localhost:8000', 'OIDC issuer URL per validazione token', 'system'),
('oidc_issuer_type', 'casdoor', 'Tipo di IDP (casdoor, keycloak, auth0)', 'system'),
('oidc_client_id', '', 'OIDC client ID reale generato da Casdoor', 'system'),
('enable_email_verification_check', 'false', 'Abilita il controllo emailVerified sul JWT durante il login (true/false)', 'system')
ON CONFLICT ("key") DO NOTHING;
```

**Note**: The `ON CONFLICT ("key") DO NOTHING` ensures this is idempotent — existing databases won't be affected, only fresh installs get the new row. For existing databases, the una-tantum script (Workstream B) inserts the config row via `updateAuthConfig()` which uses `ON CONFLICT DO UPDATE`.

---

### Workstream B: Una-tantum fix script for current Casdoor admin user

**File**: `scripts/fix-casdoor-admin-user.ts` (NEW)

This script:
1. Loads auth config from PG (to get Casdoor endpoint + builtin credentials)
2. Uses Casdoor API to fetch the admin user
3. Updates `emailVerified: true`, `isAdmin: true`, `isVerified: true` via `update-user`
4. Also inserts the new `enable_email_verification_check` config row into PG (value: `false`)
5. Verifies the update by re-fetching the user

```ts
import "dotenv/config";
import { Pool } from "pg";
import { loadAuthConfigFromDb, updateAuthConfig } from "../src/modules/auth/config-repo.js";

const BASE_DATABASE_URL = process.env.DATABASE_URL || "postgres://primebrick:primebrick_dev@127.0.0.1:5432/primebrick";

async function main(): Promise<void> {
  console.log("🔧 [FIX] Casdoor admin user una-tantum fix...");

  const pool = new Pool({ connectionString: BASE_DATABASE_URL });

  try {
    // 1. Load config from PG
    const cfg = await loadAuthConfigFromDb(pool);
    console.log(`  → Casdoor endpoint: ${cfg.casdoorEndpoint}`);
    console.log(`  → Organization: ${cfg.casdoorOrganization}`);

    if (!cfg.casdoorBuiltinClientId || !cfg.casdoorBuiltinClientSecret) {
      throw new Error("Casdoor builtin credentials not configured in auth_configurations table.");
    }

    // 2. Build API helper (same pattern as setup-casdoor.ts)
    const casdoorFetch = async (endpoint: string, options?: RequestInit) => {
      const url = new URL(`${cfg.casdoorEndpoint}/api${endpoint}`);
      url.searchParams.set("clientId", cfg.casdoorBuiltinClientId);
      url.searchParams.set("clientSecret", cfg.casdoorBuiltinClientSecret);
      const response = await fetch(url.toString(), {
        ...options,
        headers: { "Content-Type": "application/json", ...options?.headers },
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        (error as any).response = { status: response.status, data: await response.json() };
        throw error;
      }
      return response.json();
    };

    const orgName = cfg.casdoorOrganization;
    const userName = cfg.casdoorAdminUsername;

    // 3. Fetch existing admin user
    console.log(`\n📡 [API] Fetching user ${orgName}/${userName}...`);
    const userResp = await casdoorFetch(`/get-user?id=${orgName}/${userName}`);
    if (!userResp.data) {
      throw new Error(`User ${orgName}/${userName} not found in Casdoor.`);
    }
    const user = userResp.data;
    console.log(`  → Current state: emailVerified=${user.emailVerified}, isAdmin=${user.isAdmin}, isVerified=${user.isVerified}`);

    // 4. Update user with correct flags
    console.log(`\n📡 [API] Updating user flags...`);
    const updateRes = await casdoorFetch(`/update-user?id=${orgName}/${userName}`, {
      method: "POST",
      body: JSON.stringify({
        id: user.id,
        owner: orgName,
        name: userName,
        displayName: user.displayName || "Primebrick Admin",
        email: user.email,
        isAdmin: true,
        isVerified: true,
        emailVerified: true,
        isForbidden: false,
      }),
    });

    if (updateRes.status === "error") {
      throw new Error(`Update failed: ${updateRes.msg}`);
    }
    console.log("  ↳ ✅ User updated successfully.");

    // 5. Verify
    console.log(`\n📡 [API] Verifying update...`);
    const verifyResp = await casdoorFetch(`/get-user?id=${orgName}/${userName}`);
    const verifyUser = verifyResp.data;
    console.log(`  → New state: emailVerified=${verifyUser.emailVerified}, isAdmin=${verifyUser.isAdmin}, isVerified=${verifyUser.isVerified}`);

    if (verifyUser.emailVerified !== true || verifyUser.isAdmin !== true) {
      console.warn("  ⚠️  WARNING: Verification shows flags not applied. Manual intervention may be required.");
    }

    // 6. Insert enable_email_verification_check config (default: false)
    console.log(`\n💾 [DB] Inserting enable_email_verification_check=false config...`);
    await updateAuthConfig(pool, "enable_email_verification_check", "false", "fix-casdoor-admin-user");
    console.log("  ↳ ✅ Config inserted.");

    console.log("\n🏁 [COMPLETATO] Fix applicato con successo.");
  } catch (err: any) {
    console.error("\n💥 Errore fatale:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n💥 Errore fatale:", err.message);
  process.exit(1);
});
```

**Add to package.json scripts**:
```json
"fix:casdoor-admin": "tsx scripts/fix-casdoor-admin-user.ts"
```

---

## 4. Execution Order

1. **Workstream A** (config-repo.ts + auth-session.service.ts + init SQL) — makes the check configurable + aligns seed data for fresh installs
2. **Workstream B** (fix script) — fixes the current broken Casdoor admin user + inserts config row for existing DB

**Verification after each step**:
- After A: `pnpm run build` must pass (TypeScript compilation)
- After B: Run `pnpm run fix:casdoor-admin` and verify output shows `emailVerified=true, isAdmin=true`
- After B: Login via frontend must succeed

---

## 5. Impacted Files

| File | Change Type | Description |
|------|-------------|-------------|
| `src/modules/auth/config-repo.ts` | MODIFY | Add `enableEmailVerificationCheck` to interface + load logic |
| `src/modules/auth/services/auth-session.service.ts` | MODIFY | Gate the `emailVerified === false` check behind the flag |
| `db-meta/patches/00000000000000_init_database.sql` | MODIFY | Add seed row for new config key |
| `scripts/fix-casdoor-admin-user.ts` | NEW | Una-tantum fix script for current Casdoor admin user |
| `package.json` | MODIFY | Add `fix:casdoor-admin` script |

**NOT modified**: `scripts/setup-casdoor.ts` — already correct for first installation (passes `emailVerified: true, isVerified: true, isAdmin: true` at lines 249-252).

---

## 6. Acceptance Criteria

1. ✅ `pnpm run build` passes with 0 errors
2. ✅ Admin login succeeds (no more "email not verified" error)
3. ✅ Casdoor admin user has `emailVerified: true`, `isAdmin: true`, `isVerified: true`
4. ✅ `auth_configurations` table contains `enable_email_verification_check = false`
5. ✅ When `enable_email_verification_check = true`, login with unverified email is rejected
6. ✅ When `enable_email_verification_check = false`, login with unverified email succeeds
7. ✅ Fresh database install (from init SQL) includes the new config row with value `false`
8. ✅ `setup-casdoor.ts` unchanged — already passes `emailVerified: true` for first install

---

## 7. Open Questions (require runtime verification, not assumptions)

1. **Does the Casdoor JWT actually contain `emailVerified` as a claim?**
   - The check `claims.emailVerified === false` only throws if the JWT explicitly contains `emailVerified: false` (camelCase)
   - If the JWT uses `email_verified` (snake_case, OIDC standard), the check would never throw (`undefined === false` is `false`)
   - If the JWT doesn't include the claim at all, same — never throws
   - **To verify**: Add a temporary `console.log("JWT claims:", JSON.stringify(claims))` before line 99, attempt login, check server logs, then remove the log
   - This verification should be done BEFORE implementing the fix, to confirm the root cause

2. **Why did login work between May 22 (check added) and June 24 (reported broken)?**
   - Most likely: user didn't test login during that period (was doing frontend refactoring)
   - Alternative: Casdoor JWT didn't include the claim before, but a Casdoor restart/config change started including it
   - This is informational only — the fix is the same regardless

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `update-user` API doesn't actually set `emailVerified` | LOW | HIGH | Script verifies by re-fetching user after update |
| `loadOidcConfig()` signature change breaks callers | LOW | MEDIUM | Only 2 callers (login + refresh), both in same file, both updated |
| Init SQL patch change breaks `db:migrate` | LOW | LOW | `ON CONFLICT DO NOTHING` makes it idempotent |
