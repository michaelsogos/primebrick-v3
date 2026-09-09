# Plan: Config Table group_key + IDP Rename + FE Grouped Rendering

> Status: IMPLEMENTED — all 7 phases completed (SDK, DAL, BE DB, BE code, FE, i18n, docs).
> Builds on `feature-security-config-list-page-plan.md` (Config Table standard + Security page).

## 1. Objective

Three changes to `auth_configurations`:

1. **Add `group_key` varchar column** so configuration entries can be visually grouped in the Security page. Entries with null/empty/whitespace `group_key` render at the top without a section header. Others are grouped under a translated section title, sorted by `group_key` then `key` at the DAL level.

2. **Rename `casdoor_*` keys to `idp_*`** to make the config provider-agnostic. Add a new `idp_type` badge key (replacing `oidc_issuer_type`) with values casdoor/keycloak/entra/okta. Full rename across DB, BE, SDK, FE, tests.

3. **Remove legacy unused keys**: `casdoor_admin_username`, `casdoor_admin_role`, `casdoor_admin_password`, `casdoor_client_id` — all confirmed never read by BE code. A SQL backup script will be created for restoration.

## 2. Empirical Evidence

### 2.1 Legacy keys confirmed unused
- `casdoor_admin_username`: defined in `AuthConfigDb` (config-repo.ts:18), seeded (init patch:529), **never read** in BE.
- `casdoor_admin_password`: defined in `AuthConfigDb` (config-repo.ts:19), written by setup-casdoor.ts:335, **never read** in BE. NOT seeded.
- `casdoor_admin_role`: seeded (init patch:530), **NOT in AuthConfigDb interface**, **never read** in BE.
- `casdoor_client_id`: defined in `AuthConfigDb` (config-repo.ts:17), seeded (init patch:528) with `'primebrick-api'`, **0 refs** to `cfg.casdoor_client_id` anywhere. NOT written by setup script. NOT in SDK `AuthConfig`.
- The actual admin API credentials are `casdoor_builtin_client_id` + `casdoor_builtin_client_secret` (casdoor.service.ts:56-59, read via `dal.findByKey`).

### 2.2 How Casdoor admin API auth works (CONFIRMED)
- `CasdoorApiClient` (casdoor-api-client.ts) uses `clientId` + `clientSecret` as query params on every admin API call.
- These are `casdoor_builtin_client_id` + `casdoor_builtin_client_secret`, read from DB via `dal.findByKey()` in `casdoor.service.ts:56-59`.
- `casdoor_client_id` is NOT involved in this flow.
- Three distinct "client ID" concepts:
  1. `oidc_client_id` → OAuth login flows (token exchange)
  2. `casdoor_builtin_client_id` → Casdoor admin API (user/role/MFA management)
  3. `casdoor_client_id` → **nothing** (legacy, seeded but never read)

### 2.3 oidc_issuer_type is metadata-only (CONFIRMED)
- Stored in DB, validated as non-empty in STANDALONE mode (config-repo.ts:132).
- Mapped to `AuthConfig.oidc.issuer_type` in sdk-auth-ports.ts:53.
- SDK `OidcConfig.issuer_type?: string` (types.ts:68) — **never read by any consumer**.
- **NO branching on `oidc_issuer_type` in BE** — the system always uses Casdoor-specific API paths (`/api/login/oauth/access_token`, `/api/webauthn/*`).
- FE: 0 references.
- **Verdict**: Safe to replace with `idp_type` (badge: casdoor/keycloak/entra/okta).

### 2.4 casdoor_* keys usage summary (for rename impact)
| Key | BE refs | SDK | FE | Setup script |
|-----|---------|-----|-----|-------------|
| `casdoor_endpoint` | 15+ (auth-session, webauthn, user, role, mfa, casdoor.service, mcp/oauth, index) | `AuthConfig.casdoor_endpoint` | `auth-config-store` | index.ts fallback |
| `casdoor_organization` | 20+ (auth-session, webauthn, user, role, mfa, casdoor.service, index) | `AuthConfig.casdoor_organization` | `auth-config-store` | setup-casdoor.ts:338 |
| `casdoor_builtin_client_id` | casdoor.service.ts:57, index.ts:83 | NOT in AuthConfig | 0 | setup-casdoor.ts:336 |
| `casdoor_builtin_client_secret` | casdoor.service.ts:58, index.ts:84 | NOT in AuthConfig | 0 | setup-casdoor.ts:337 |
| `casdoor_client_id` | 0 (interface only) | NOT in AuthConfig | 0 | NOT written |
| `casdoor_admin_username` | 0 (interface only) | NOT in AuthConfig | 0 | NOT written |
| `casdoor_admin_password` | 0 (interface only) | NOT in AuthConfig | 0 | setup-casdoor.ts:335 |

### 2.5 mfa_challenge_* keys (CONFIRMED)
- `mfa_challenge_signing_secret`: Signs MFA challenge JWTs (HS256) AND encrypts TOTP secrets at rest (AES-256-GCM). Auto-generated if empty.
- `mfa_challenge_token_ttl_seconds`: TTL for challenge tokens, defaults to 300s. Used for BOTH login MFA and step-up MFA.

### 2.6 DAL sorting support (CONFIRMED)
- `Repository.findAll` accepts `sorting?: SortingExpr[]` in `FindOptions`.
- `Sort.by(field(Entity, "column" as any), "ASC")` constructs sort expressions.
- PostgreSQL sorts NULLs first in ASC order by default — null `group_key` rows naturally appear first.

## 3. Key Rename Map

| Old key | New key | Notes |
|---------|---------|-------|
| `casdoor_endpoint` | `idp_endpoint` | Full rename in DB, BE, SDK, FE |
| `casdoor_organization` | `idp_organization` | Full rename in DB, BE, SDK, FE |
| `casdoor_builtin_client_id` | `idp_builtin_client_id` | Full rename in DB, BE |
| `casdoor_builtin_client_secret` | `idp_builtin_client_secret` | Full rename in DB, BE |
| `casdoor_client_id` | **REMOVED** | Legacy, 0 refs |
| `casdoor_admin_username` | **REMOVED** | Legacy, 0 refs |
| `casdoor_admin_role` | **REMOVED** | Legacy, 0 refs |
| `casdoor_admin_password` | **REMOVED** | Legacy, 0 refs |
| `oidc_issuer_type` | `idp_type` | Renamed, values: casdoor/keycloak/entra/okta (auth0→okta) |

**Unchanged keys**: `oidc_issuer_url`, `oidc_client_id`, `auth_mode`, `auth_roles_path`, `enable_email_verification_check`, `enable_webauthn`, `passkey_required`, `enable_mfa`, `password_policy`, `invitation_expiry_days`, `admin_contact_email`, `notification_alert_secret`, `frontend_url`, `redis_url`, `mfa_challenge_token_ttl_seconds`, `mfa_challenge_signing_secret`.

## 4. Group Assignments (after rename)

| Group key | Config keys | i18n key |
|-----------|-------------|----------|
| `idp_parameters` | `idp_type`, `idp_endpoint`, `idp_organization`, `auth_mode` | `config.auth.group.idp_parameters` |
| `oidc_parameters` | `oidc_issuer_url`, `oidc_client_id`, `auth_roles_path` | `config.auth.group.oidc_parameters` |
| `security_parameters` | `enable_email_verification_check`, `enable_webauthn`, `passkey_required`, `enable_mfa`, `password_policy`, `mfa_challenge_token_ttl_seconds`, `mfa_challenge_signing_secret` | `config.auth.group.security_parameters` |
| `advanced_features` | `redis_url`, `invitation_expiry_days` | `config.auth.group.advanced_features` |
| `system_settings` | `admin_contact_email`, `frontend_url`, `notification_alert_secret` | `config.auth.group.system_settings` |

**Note**: `idp_builtin_client_id` and `idp_builtin_client_secret` are NOT seeded in init patch (written by setup-casdoor.ts). They will get `group_key = 'idp_parameters'` in the fire-and-forget migration for existing DBs that have them.

## 5. Implementation Phases

### Phase 1: SDK — Rename + add group_key

**File:** `primebrick-v3-sdk/src/auth/types.ts`
- Rename `casdoor_endpoint` → `idp_endpoint` in `AuthConfig` interface.
- Rename `casdoor_organization` → `idp_organization` in `AuthConfig` interface.
- Rename `OidcConfig.issuer_type` → `OidcConfig.idp_type` (or keep `issuer_type` — TBD, see note below).

**File:** `primebrick-v3-sdk/src/config/iconfig-entity.ts`
- Add `group_key?: string | null;` to `IConfigEntity`.

**Build:** `pnpm build` in SDK.

### Phase 2: DAL — Add group_key to ConfigEntityBase

**File:** `primebrick-dal-v3/src/entities/config-entity-base.ts`
- Add `@Column({ type: "varchar", length: 100, nullable: true }) group_key?: string | null;`

**Build:** `pnpm build` in DAL.

### Phase 3: BE DB — Column + rename + seed + migration + backup

#### 3a. SQL backup script

**File:** `primebrick-be-v3/db-meta/fire-and-forget/backup_before_idp_rename.sql`
- Create a script that dumps the current `auth_configurations` table to an INSERT script.
- This is a one-time backup run BEFORE the rename migration.
- Includes re-INSERT statements for all removed keys (`casdoor_client_id`, `casdoor_admin_username`, `casdoor_admin_role`, `casdoor_admin_password`) for restoration.
- Also includes RENAME statements to restore old key names if needed.

#### 3b. Init patch update

**File:** `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql`
- Add `"group_key" varchar(100)` column to `auth_configurations` CREATE TABLE.
- Add `group_key` to the seed INSERT column list.
- Rename seed keys: `casdoor_endpoint` → `idp_endpoint`, `casdoor_organization` → `idp_organization`.
- Replace `oidc_issuer_type` with `idp_type` (badge: casdoor/keycloak/entra/okta).
- Remove `casdoor_admin_username`, `casdoor_admin_role`, `casdoor_client_id` seed rows.
- Add `group_key` values per the assignment table.
- Update init patch SHA256 in the fire-and-forget registry update script.

#### 3c. Fire-and-forget migration

**File:** `primebrick-be-v3/db-meta/fire-and-forget/add_config_table_standard_columns.sql`
- Add `ALTER TABLE auth_configurations ADD COLUMN IF NOT EXISTS group_key varchar(100);`
- Rename existing keys: `UPDATE auth_configurations SET key = 'idp_endpoint' WHERE key = 'casdoor_endpoint';` etc.
- Replace `oidc_issuer_type` → `idp_type` with updated type_config (entra/okta values).
- Delete removed keys: `DELETE FROM auth_configurations WHERE key IN ('casdoor_client_id', 'casdoor_admin_username', 'casdoor_admin_role', 'casdoor_admin_password');`
- Set `group_key` for all keys per the assignment table.
- Remove old label_key/description_key UPDATE blocks for deleted/renamed keys.
- Update the init patch SHA256 registry row.

### Phase 4: BE Code — Rename refs + entity + DAL + config-repo

#### 4a. Entity

**File:** `primebrick-be-v3/src/modules/auth/auth_configuration_entity.ts`
- Add `@Column({ type: "varchar", length: 100, nullable: true }) group_key?: string | null;`

#### 4b. Config-repo

**File:** `primebrick-be-v3/src/modules/auth/config-repo.ts`
- Remove `casdoor_admin_username`, `casdoor_admin_password`, `casdoor_client_id` from `AuthConfigDb`.
- Rename `casdoor_endpoint` → `idp_endpoint`, `casdoor_organization` → `idp_organization`.
- Rename `casdoor_builtin_client_id` → `idp_builtin_client_id`, `casdoor_builtin_client_secret` → `idp_builtin_client_secret`.
- Rename `oidc_issuer_type` → `idp_type` in interface and required fields list.
- Update the required fields check: `"idp_type"` instead of `"oidc_issuer_type"`.

#### 4c. SDK auth-ports

**File:** `primebrick-be-v3/src/modules/auth/sdk-auth-ports.ts`
- Rename `db.casdoor_endpoint` → `db.idp_endpoint`, `db.casdoor_organization` → `db.idp_organization`.
- Rename `db.oidc_issuer_type` → `db.idp_type` and map to `oidc.idp_type` (or `oidc.issuer_type` — keep SDK field name unless SDK rename is approved).

#### 4d. Service files (rename all `cfg.casdoor_*` → `cfg.idp_*`)

**Files to update** (rename `cfg.casdoor_endpoint` → `cfg.idp_endpoint`, `cfg.casdoor_organization` → `cfg.idp_organization`):
- `src/modules/auth/services/auth-session.service.ts` (5 refs)
- `src/modules/auth/services/webauthn.service.ts` (7 refs)
- `src/modules/auth/services/user.service.ts` (2 refs)
- `src/modules/auth/services/role.service.ts` (5 refs)
- `src/modules/auth/services/mfa.service.ts` (1 ref)
- `src/modules/auth/services/casdoor.service.ts` (2 refs + rename `dal.findByKey("casdoor_builtin_client_id")` → `dal.findByKey("idp_builtin_client_id")`)
- `src/modules/auth/services/organizations.service.ts` (1 comment ref)
- `src/index.ts` (2 refs)
- `src/modules/mcp/oauth/token.ts` (2 refs)
- `src/modules/mcp/oauth/metadata.ts` (2 refs)
- `src/modules/mcp/oauth/authorize.ts` (2 refs)

#### 4e. Setup script

**File:** `primebrick-be-v3/scripts/setup-casdoor.ts`
- Remove `updateAuthConfig(pbPool, "casdoor_admin_password", ...)` line.
- Rename `updateAuthConfig(pbPool, "casdoor_organization", ...)` → `updateAuthConfig(pbPool, "idp_organization", ...)`.
- Rename `updateAuthConfig(pbPool, "casdoor_builtin_client_id", ...)` → `updateAuthConfig(pbPool, "idp_builtin_client_id", ...)`.
- Rename `updateAuthConfig(pbPool, "casdoor_builtin_client_secret", ...)` → `updateAuthConfig(pbPool, "idp_builtin_client_secret", ...)`.

#### 4f. DAL sorted findAll

**File:** `primebrick-be-v3/src/modules/auth/auth_configurations_dal.ts`
- Update `findAll()` to pass sorting:
```typescript
import { Sort } from "@primebrick/dal-pg";
async findAll(): Promise<AuthConfigurationEntity[]> {
  const rows = await this.repo.findAll<AuthConfigurationEntity, AuthConfigurationEntity>(
    AuthConfigurationEntity,
    null,
    {
      deletedRecords: "EXCLUDED",
      sorting: [
        Sort.by(field(AuthConfigurationEntity, "group_key" as any), "ASC"),
        Sort.by(field(AuthConfigurationEntity, "key" as any), "ASC"),
      ],
    }
  );
  return rows as AuthConfigurationEntity[];
}
```

#### 4g. Test files

Update test fixtures that reference old key names:
- `src/modules/auth/services/__tests__/mfa-service.test.ts`
- `src/modules/auth/__tests__/user-service-change-password.test.ts`
- `src/modules/auth/__tests__/rbac-admin-gate.test.ts`
- `src/modules/mcp/__tests__/token-verifier.test.ts`

**Build:** `pnpm run build` in BE.

### Phase 5: FE — Types + rename + grouped rendering

#### 5a. Types

**File:** `primebrick-fe-v3/src/lib/api-types.ts`
- Add `group_key?: string | null;` to `ConfigEntry`.

#### 5b. Auth config store

**File:** `primebrick-fe-v3/src/lib/auth-config-store.svelte.ts`
- Rename `casdoor_endpoint` → `idp_endpoint`, `casdoor_organization` → `idp_organization` in the store interface and getter.

#### 5c. ConfigList grouped rendering

**File:** `primebrick-fe-v3/src/lib/components/config-list/ConfigList.svelte`
- Add a `$derived` that groups entries:
  - Entries with null/empty/whitespace `group_key` → ungrouped list (rendered first, no header).
  - Other entries → grouped by `group_key`, in the order they appear (already sorted by DAL).
- Render:
  1. Ungrouped entries (if any) — no section header, just rows.
  2. For each group: a section header (translated via `config.auth.group.<group_key>`) + the group's rows.
- Section header styling: small uppercase muted text with a separator line.
- The `ConfigBulkActionBar` stays at the top, spanning all groups.
- Selection state continues to work across groups.

#### 5d. FE other refs

**File:** `primebrick-fe-v3/src/lib/components/auth/LoginForm.svelte`
- Check if it references `casdoor_*` config keys (likely not — it uses `enable_formauth`/`enable_webauthn`).

**File:** `primebrick-fe-v3/src/e2e/helpers/admin-login.ts`
- Check for `casdoor_*` refs (comment only, likely no change needed).

### Phase 6: FE i18n — Group titles + rename keys

#### 6a. Add group title keys

Add `config.auth.group.*` keys to all 6 locale files inside `config.auth`:

| Key | en-GB | it-IT | fr-FR | es-ES | de-DE | pt-PT |
|-----|-------|-------|-------|-------|-------|-------|
| `idp_parameters` | IDP Parameters | Parametri IDP | Paramètres IDP | Parámetros IDP | IDP-Parameter | Parâmetros IDP |
| `oidc_parameters` | OIDC Parameters | Parametri OIDC | Paramètres OIDC | Parámetros OIDC | OIDC-Parameter | Parâmetros OIDC |
| `security_parameters` | Security Parameters | Parametri di Sicurezza | Paramètres de Sécurité | Parámetros de Seguridad | Sicherheitsparameter | Parâmetros de Segurança |
| `advanced_features` | Advanced Features | Funzionalità Avanzate | Fonctionnalités Avancées | Funciones Avanzadas | Erweiterte Funktionen | Funcionalidades Avançadas |
| `system_settings` | System Settings | Impostazioni di Sistema | Paramètres Système | Configuración del Sistema | Systemeinstellungen | Configurações do Sistema |

#### 6b. Rename i18n keys for renamed config keys

In all 6 locale files, inside `config.auth`:
- Rename `casdoor_endpoint` → `idp_endpoint` (label + description)
- Rename `casdoor_organization` → `idp_organization` (label + description)
- Rename `oidc_issuer_type` → `idp_type` (label + description + badge values)
- Add `entra` badge value to `idp_type`
- Rename `auth0` badge value → `okta` in `idp_type`
- Remove `casdoor_client_id`, `casdoor_admin_username`, `casdoor_admin_role` objects
- Add `idp_type` label/description: "IDP Type" / "The identity provider type (Casdoor, Keycloak, Entra ID, Okta, etc.)."

### Phase 7: Documentation

- Update BE `AGENTS.md` Config Table Standard section: add `group_key` to schema, update key names.
- Update FE `AGENTS.md` Config List pages section: mention grouping behavior.
- Update plan file status to IMPLEMENTED.

## 6. Acceptance Criteria

1. `group_key` column exists in `auth_configurations` table.
2. All seeded config rows have the correct `group_key` value per the assignment table.
3. `casdoor_*` keys are renamed to `idp_*` across DB, BE, SDK, FE.
4. `oidc_issuer_type` is replaced by `idp_type` (badge: casdoor/keycloak/entra/okta).
5. `casdoor_admin_username`, `casdoor_admin_role`, `casdoor_admin_password`, `casdoor_client_id` are fully removed.
6. SQL backup script exists for restoration of removed/renamed keys.
7. DAL `findAll()` returns rows sorted by `group_key ASC, key ASC` (nulls first).
8. FE Security page renders entries in grouped sections with translated headers.
9. Ungrouped entries (null/empty/whitespace group_key) render at top without a header.
10. All 4 repos build successfully (SDK, DAL, BE, FE).
11. All 6 locale files have `config.auth.group.*` keys + renamed config keys.
12. No missing translation keys.
13. No commits made unless explicitly requested.

## 7. Files Impacted

### SDK
- `primebrick-v3-sdk/src/auth/types.ts`
- `primebrick-v3-sdk/src/config/iconfig-entity.ts`

### DAL
- `primebrick-dal-v3/src/entities/config-entity-base.ts`

### BE
- `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql`
- `primebrick-be-v3/db-meta/fire-and-forget/add_config_table_standard_columns.sql`
- `primebrick-be-v3/db-meta/fire-and-forget/backup_before_idp_rename.sql` (NEW)
- `primebrick-be-v3/src/modules/auth/auth_configuration_entity.ts`
- `primebrick-be-v3/src/modules/auth/auth_configurations_dal.ts`
- `primebrick-be-v3/src/modules/auth/config-repo.ts`
- `primebrick-be-v3/src/modules/auth/sdk-auth-ports.ts`
- `primebrick-be-v3/src/modules/auth/services/auth-session.service.ts`
- `primebrick-be-v3/src/modules/auth/services/webauthn.service.ts`
- `primebrick-be-v3/src/modules/auth/services/user.service.ts`
- `primebrick-be-v3/src/modules/auth/services/role.service.ts`
- `primebrick-be-v3/src/modules/auth/services/mfa.service.ts`
- `primebrick-be-v3/src/modules/auth/services/casdoor.service.ts`
- `primebrick-be-v3/src/modules/auth/services/organizations.service.ts`
- `primebrick-be-v3/src/modules/auth/routers/config-entries.router.ts` (if it references old key names)
- `primebrick-be-v3/src/index.ts`
- `primebrick-be-v3/src/modules/mcp/oauth/token.ts`
- `primebrick-be-v3/src/modules/mcp/oauth/metadata.ts`
- `primebrick-be-v3/src/modules/mcp/oauth/authorize.ts`
- `primebrick-be-v3/scripts/setup-casdoor.ts`
- `primebrick-be-v3/src/modules/auth/services/__tests__/mfa-service.test.ts`
- `primebrick-be-v3/src/modules/auth/__tests__/user-service-change-password.test.ts`
- `primebrick-be-v3/src/modules/auth/__tests__/rbac-admin-gate.test.ts`
- `primebrick-be-v3/src/modules/mcp/__tests__/token-verifier.test.ts`

### FE
- `primebrick-fe-v3/src/lib/api-types.ts`
- `primebrick-fe-v3/src/lib/auth-config-store.svelte.ts`
- `primebrick-fe-v3/src/lib/components/config-list/ConfigList.svelte`
- `primebrick-fe-v3/src/lib/components/auth/LoginForm.svelte` (if needed)
- `primebrick-fe-v3/src/lib/i18n/messages/en-GB.json`
- `primebrick-fe-v3/src/lib/i18n/messages/it-IT.json`
- `primebrick-fe-v3/src/lib/i18n/messages/fr-FR.json`
- `primebrick-fe-v3/src/lib/i18n/messages/es-ES.json`
- `primebrick-fe-v3/src/lib/i18n/messages/de-DE.json`
- `primebrick-fe-v3/src/lib/i18n/messages/pt-PT.json`

### Docs
- `primebrick-be-v3/AGENTS.md`
- `primebrick-fe-v3/AGENTS.md`
- `primebrick-workspace/ai-plans/feature-config-group-key-plan.md`
