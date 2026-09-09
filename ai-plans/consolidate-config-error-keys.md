# Plan: Consolidate duplicate i18n keys for config validation errors

## Problem

The `system.translations` table contains **44 duplicate keys** under
`system.settings.config.auth.*.errors.*` that replicate values already
available in generic `app.common.validation.*` keys. These duplicates
exist because the `config_entries` seed in `00000000000000_init_database.sql`
hard-codes per-field `required_error_label_key` and `error_label_key` values
like `config.auth.{key}.errors.required` instead of using the generic
`app.common.validation.required`.

## Strategy: hard delete + init patch rewrite

This is a **sensitive refactoring**. The approach is:

1. **Rewrite the source** — update `00000000000000_init_database.sql` so a
   fresh install never creates the duplicates (config_entries `type_config`
   JSON uses generic keys; `label_key`/`description_key` use
   `system.settings.config.auth.*` prefix).
2. **Rewrite the seeds** — update `00000000000001`–`00000000000006` so the
   duplicate translation rows are never inserted. Also update the 4 generic
   key values to the normalized wording.
3. **Hard delete from live DB** — a migration patch `00000000000007` that
   `DELETE`s (not soft-deletes) the 270 duplicate rows and `UPDATE`s the 24
   generic key rows. Hard delete is correct here because these rows were
   created in error and must not remain in `deleted_at` limbo.
4. **Update live `config_entries.type_config`** — fire-and-forget SQL to
   replace per-field error keys with generic keys in the live JSON columns.

### Duplicate breakdown (en-GB, same pattern across all 6 languages)

| Value | Duplicates | Generic key | Value match? |
|-------|-----------|-------------|-------------|
| `"This field is required"` | 20 | `app.common.validation.required` | exact |
| `"Must be at least {min}"` | 10 | `app.common.validation.tooShort` = `"Must be at least {min} characters"` | **NO** — missing "characters" |
| `"Must be at most {max}"` | 10 | `app.common.validation.tooLong` = `"Must be at most {max} characters"` | **NO** — missing "characters" |
| `"Must be a valid URL"` | 4 | `app.common.validation.invalidUrl` = `"Invalid URL format"` | **NO** — different wording |

### Additional non-generic duplicates (keep as-is)

| Value | Count | Reason to keep |
|-------|-------|---------------|
| `"Must be a valid email address"` | 1 (`admin_contact_email.errors.invalidEmail`) | different wording from `app.common.validation.invalidEmail` = `"Invalid email format"` — but semantically same → consolidate |
| `"Only letters, numbers, hyphens..."` | 1 (`oidc_client_id.errors.invalidFormat`) | field-specific regex message — keep |
| `"Invalid format"` | 1 (`auth_roles_path.errors.invalidFormat`) | different from generic `app.common.validation.invalidFormat` = `"Must start and end with a letter or number"` — keep |
| `"Auth mode is required"` | 1 (`auth_mode.errors.required`) | field-specific — keep |
| `"IDP type is required"` | 1 (`idp_type.errors.required`) | field-specific — keep |

### Cross-DB audit: other duplicate values (NOT in scope)

`Version` (8), `Display Name` (8), `IDP Code` (6), `Email` (6), `UUID` (6),
`Created by/at` (6), `Updated by/at` (6) — these are entity field labels
shared across entities. They are NOT duplicates of generic validation
messages and are used by different entity metadata contexts. Consolidating
them is a separate task (shared entity field label strategy).

## Full audit: all `config.auth.*` discrepancies

### 1. `auth_configurations` table — `label_key` column (23 rows)

All 23 config entries have `label_key` = `config.auth.{key}.label` (old prefix).
The DB translations have `system.settings.config.auth.{key}.label` (new prefix).
The FE calls `$t(label_key)` and gets the raw key back (no translation found).

**Fix:** UPDATE all 23 rows: `config.auth.*` → `system.settings.config.auth.*`

### 2. `auth_configurations` table — `description_key` column (23 rows)

Same issue: `config.auth.{key}.description` → `system.settings.config.auth.{key}.description`

**Fix:** UPDATE all 23 rows.

### 3. `auth_configurations` table — `type_config` JSON `required_error_label_key` (20 rows)

20 config entries have `required_error_label_key: "config.auth.{key}.errors.required"`.
These should be replaced with `app.common.validation.required` (generic).

**Fix:** UPDATE `type_config` JSON in all 20 rows.

### 4. `auth_configurations` table — `type_config` JSON `error_label_key` for rules (25 keys)

- 10 `*.errors.min` → `app.common.validation.tooShort`
- 10 `*.errors.max` → `app.common.validation.tooLong`
- 4 `*.errors.invalidUrl` → `app.common.validation.invalidUrl`
- 1 `*.errors.invalidEmail` → `app.common.validation.invalidEmail`

**Fix:** UPDATE `type_config` JSON in affected rows.

### 5. `auth_configurations` table — `type_config` JSON `values.*.label_key` (10 keys)

Badge/select types have `values.{value}.label_key` inside `type_config`:
- `idp_type`: 4 values (casdoor, keycloak, entra, okta)
- `password_policy`: 4 values (alpha_numeric, letter_and_number, letter_number_special, mixed_case_special)
- `auth_mode`: 2 values (standalone, gateway)

All use `config.auth.{key}.{value}` (old prefix).
DB has `system.settings.config.auth.{key}.{value}` (new prefix).

**Fix:** UPDATE `type_config` JSON in 3 rows.

### 6. `auth_configurations` table — `type_config` JSON field-specific error keys (4 keys, KEEP)

- `config.auth.oidc_client_id.errors.invalidFormat` — custom regex message
- `config.auth.auth_roles_path.errors.invalidFormat` — custom regex message
- `config.auth.auth_mode.errors.required` = "Auth mode is required"
- `config.auth.idp_type.errors.required` = "IDP type is required"

These are field-specific and should be kept BUT updated to new prefix:
`system.settings.config.auth.{key}.errors.{rule}`

**Fix:** UPDATE `type_config` JSON — prefix change only.

### 7. Init patch seed SQL — same fixes as above

File `00000000000000_init_database.sql` lines 692–713 must be rewritten
to use `system.settings.config.auth.*` prefix and generic error keys.

### 8. FE — `autoErrorLabelKey` generator (1 file)

`src/lib/config/type-config-schema.ts` line 118:
`config.auth.${key}.errors.${rule}` → generic keys for standard rules,
`system.settings.config.auth.${key}.errors.${rule}` for custom.

### 9. FE — create page placeholders (1 file)

`src/routes/(app)/system/settings/security/create/+page.svelte`:
- Lines 240, 243: `config.auth.${key}.label` → `system.settings.config.auth.${key}.label`
- Lines 265, 268: `config.auth.${key}.` → `system.settings.config.auth.${key}.`

### 10. FE — tests (1 file)

`src/lib/__tests__/type-config-builder.test.ts`:
- 10 assertions with `config.auth.*` → update to new convention.

### 11. Seed translation patches — remove duplicate INSERTs

Files `00000000000001`–`00000000000006`:
- Remove INSERTs for 45 duplicate `*.errors.*` keys (per language)
- Remove INSERTs for old `config.auth.*` keys that were superseded by
  `system.settings.config.auth.*` (if any exist in the seed)

### 12. DB translation table — hard delete duplicates

Hard delete 45 `system.settings.config.auth.*.errors.*` keys × 6 languages = 270 rows
from `system.translations`.

### 13. DB translation table — normalize generic key values

UPDATE 4 generic keys × 6 languages = 24 rows in `public.translations`.

### Keys to DELETE (soft-delete via migration)

**20 `*.errors.required` keys** → replace with `app.common.validation.required`:
- `system.settings.config.auth.admin_contact_email.errors.required`
- `system.settings.config.auth.auth_roles_path.errors.required`
- `system.settings.config.auth.enable_email_verification_check.errors.required`
- `system.settings.config.auth.enable_mfa.errors.required`
- `system.settings.config.auth.enable_webauthn.errors.required`
- `system.settings.config.auth.frontend_url.errors.required`
- `system.settings.config.auth.idp_client_id.errors.required`
- `system.settings.config.auth.idp_client_secret.errors.required`
- `system.settings.config.auth.idp_endpoint.errors.required`
- `system.settings.config.auth.idp_organization.errors.required`
- `system.settings.config.auth.invitation_expiry_days.errors.required`
- `system.settings.config.auth.mfa_challenge_signing_secret.errors.required`
- `system.settings.config.auth.mfa_challenge_token_ttl_seconds.errors.required`
- `system.settings.config.auth.notification_alert_secret.errors.required`
- `system.settings.config.auth.oidc_client_id.errors.required`
- `system.settings.config.auth.oidc_client_secret.errors.required`
- `system.settings.config.auth.oidc_issuer_url.errors.required`
- `system.settings.config.auth.passkey_required.errors.required`
- `system.settings.config.auth.password_policy.errors.required`
- `system.settings.config.auth.redis_url.errors.required`

**1 `*.errors.invalidEmail` key** → replace with `app.common.validation.invalidEmail`:
- `system.settings.config.auth.admin_contact_email.errors.invalidEmail`

**4 `*.errors.invalidUrl` keys** → replace with `app.common.validation.invalidUrl`:
- `system.settings.config.auth.frontend_url.errors.invalidUrl`
- `system.settings.config.auth.idp_endpoint.errors.invalidUrl`
- `system.settings.config.auth.oidc_issuer_url.errors.invalidUrl`
- `system.settings.config.auth.redis_url.errors.invalidUrl`

**10 `*.errors.min` keys** → replace with `app.common.validation.tooShort`:
- `system.settings.config.auth.auth_roles_path.errors.min`
- `system.settings.config.auth.idp_client_id.errors.min`
- `system.settings.config.auth.idp_client_secret.errors.min`
- `system.settings.config.auth.idp_organization.errors.min`
- `system.settings.config.auth.invitation_expiry_days.errors.min`
- `system.settings.config.auth.mfa_challenge_signing_secret.errors.min`
- `system.settings.config.auth.mfa_challenge_token_ttl_seconds.errors.min`
- `system.settings.config.auth.notification_alert_secret.errors.min`
- `system.settings.config.auth.oidc_client_id.errors.min`
- `system.settings.config.auth.oidc_client_secret.errors.min`

**10 `*.errors.max` keys** → replace with `app.common.validation.tooLong`:
- `system.settings.config.auth.auth_roles_path.errors.max`
- `system.settings.config.auth.idp_client_id.errors.max`
- `system.settings.config.auth.idp_client_secret.errors.max`
- `system.settings.config.auth.idp_organization.errors.max`
- `system.settings.config.auth.invitation_expiry_days.errors.max`
- `system.settings.config.auth.mfa_challenge_signing_secret.errors.max`
- `system.settings.config.auth.mfa_challenge_token_ttl_seconds.errors.max`
- `system.settings.config.auth.notification_alert_secret.errors.max`
- `system.settings.config.auth.oidc_client_id.errors.max`
- `system.settings.config.auth.oidc_client_secret.errors.max`

**Total: 45 keys × 6 languages = 270 rows to hard-delete**

### Keys to KEEP (field-specific, not generic duplicates)

- `system.settings.config.auth.auth_mode.errors.required` = `"Auth mode is required"` (field-specific)
- `system.settings.config.auth.idp_type.errors.required` = `"IDP type is required"` (field-specific)
- `system.settings.config.auth.oidc_client_id.errors.invalidFormat` = `"Only letters, numbers, hyphens..."` (field-specific regex)
- `system.settings.config.auth.auth_roles_path.errors.invalidFormat` = `"Invalid format"` (field-specific regex)

## Value normalization

The generic keys have slightly different wording:
- `app.common.validation.tooShort` = `"Must be at least {min} characters"` (has "characters")
- `app.common.validation.tooLong` = `"Must be at most {max} characters"` (has "characters")
- `app.common.validation.invalidUrl` = `"Invalid URL format"` (different wording)
- `app.common.validation.invalidEmail` = `"Invalid email format"` (different wording)

The duplicates use:
- `"Must be at least {min}"` (no "characters")
- `"Must be at most {max}"` (no "characters")
- `"Must be a valid URL"`
- `"Must be a valid email address"`

**Decision:** normalize the generic keys' values to match the shorter,
type-agnostic form. The generic `tooShort`/`tooLong` apply to both string
length AND numeric value — "characters" is wrong for numeric fields like
`invitation_expiry_days`. So:

| Generic key | Old value | New value |
|------------|-----------|-----------|
| `app.common.validation.tooShort` | `"Must be at least {min} characters"` | `"Must be at least {min}"` |
| `app.common.validation.tooLong` | `"Must be at most {max} characters"` | `"Must be at most {max}"` |
| `app.common.validation.invalidUrl` | `"Invalid URL format"` | `"Must be a valid URL"` |
| `app.common.validation.invalidEmail` | `"Invalid email format"` | `"Must be a valid email address"` |

This normalization applies to ALL 6 languages and affects the generic key
values in `public.translations`.

## Implementation steps

### Step 1: Rewrite config_entries seed in init patch

File: `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql`
Lines: 692–713

For each of the 21 config entry INSERT rows:

1. **`label_key` column**: `config.auth.{key}.label` → `system.settings.config.auth.{key}.label`
2. **`description_key` column**: `config.auth.{key}.description` → `system.settings.config.auth.{key}.description`
3. **`type_config` JSON `required_error_label_key`**: `config.auth.{key}.errors.required` → `app.common.validation.required` (except `auth_mode` and `idp_type` which keep field-specific messages → `system.settings.config.auth.{key}.errors.required`)
4. **`type_config` JSON `error_label_key` for `min` rule**: → `app.common.validation.tooShort`
5. **`type_config` JSON `error_label_key` for `max` rule**: → `app.common.validation.tooLong`
6. **`type_config` JSON `error_label_key` for `url` rule**: → `app.common.validation.invalidUrl`
7. **`type_config` JSON `error_label_key` for `email` rule**: → `app.common.validation.invalidEmail`
8. **`type_config` JSON `error_label_key` for `regex` rule**: keep field-specific but update prefix → `system.settings.config.auth.{key}.errors.invalidFormat`
9. **`type_config` JSON `values.*.label_key`**: `config.auth.{key}.{value}` → `system.settings.config.auth.{key}.{value}`

### Step 2: Remove duplicate INSERTs from seed patches

Files: `db-meta/patches/00000000000001_seed_translations_en_gb.sql` through
`00000000000006_seed_translations_pt_pt.sql`

Remove all INSERT statements for the 45 duplicate keys (per language).
Also UPDATE the 4 generic key values to the normalized wording (remove
"characters" from tooShort/tooLong, change URL/email wording).

### Step 3: Update live DB `auth_configurations` table (fire-and-forget SQL)

Create `db-meta/fire-and-forget/consolidate_config_error_keys.sql` that:

1. **UPDATE `label_key` column**: replace `config.auth.` prefix with
   `system.settings.config.auth.` in all 23 rows
2. **UPDATE `description_key` column**: same prefix replacement
3. **UPDATE `type_config` JSON**: replace all `config.auth.` occurrences
   with `system.settings.config.auth.` (covers `values.*.label_key`,
   `required_error_label_key`, `error_label_key` for field-specific keys)
4. **UPDATE `type_config` JSON**: replace generic error keys:
   - `system.settings.config.auth.{key}.errors.required` → `app.common.validation.required`
   - `system.settings.config.auth.{key}.errors.min` → `app.common.validation.tooShort`
   - `system.settings.config.auth.{key}.errors.max` → `app.common.validation.tooLong`
   - `system.settings.config.auth.{key}.errors.invalidUrl` → `app.common.validation.invalidUrl`
   - `system.settings.config.auth.{key}.errors.invalidEmail` → `app.common.validation.invalidEmail`
   - Keep field-specific: `auth_mode.errors.required`, `idp_type.errors.required`,
     `oidc_client_id.errors.invalidFormat`, `auth_roles_path.errors.invalidFormat`

### Step 4: Hard-delete duplicate translation rows + normalize generic values (migration patch)

Create `db-meta/patches/00000000000007_consolidate_config_error_keys.sql`
that:

1. **HARD DELETE** the 45 duplicate keys × 6 languages = 270 rows from
   `system.translations` (using `DELETE`, not soft-delete — these rows
   were created in error and must not remain in `deleted_at` limbo).
2. **UPDATE** the 4 generic keys' values across all 6 languages in
   `public.translations`:

| Key | Old value (en-GB) | New value (en-GB) |
|-----|-------------------|-------------------|
| `app.common.validation.tooShort` | `Must be at least {min} characters` | `Must be at least {min}` |
| `app.common.validation.tooLong` | `Must be at most {max} characters` | `Must be at most {max}` |
| `app.common.validation.invalidUrl` | `Invalid URL format` | `Must be a valid URL` |
| `app.common.validation.invalidEmail` | `Invalid email format` | `Must be a valid email address` |

Same for it-IT, fr-FR, es-ES, de-DE, pt-PT (translate accordingly).

### Step 6: Update FE `autoErrorLabelKey` generator

File: `primebrick-fe-v3/src/lib/config/type-config-schema.ts` line 118

Change the default convention from:
```ts
return `config.auth.${key}.errors.${rule}`;
```
to use generic keys for standard rules:
```ts
const GENERIC_KEYS: Record<string, string> = {
  required: 'app.common.validation.required',
  min: 'app.common.validation.tooShort',
  max: 'app.common.validation.tooLong',
  invalidUrl: 'app.common.validation.invalidUrl',
  invalidEmail: 'app.common.validation.invalidEmail',
};
return GENERIC_KEYS[rule] ?? `system.settings.config.auth.${key}.errors.${rule}`;
```

### Step 7: Update FE create page placeholders

File: `src/routes/(app)/system/settings/security/create/+page.svelte`

- Lines 240, 243: `config.auth.${key}.label/description` → `system.settings.config.auth.${key}.label/description`
- Lines 265, 268: `config.auth.${key}.` → `system.settings.config.auth.${key}.`

### Step 8: Update FE tests

File: `src/lib/__tests__/type-config-builder.test.ts`

Update 10 assertions with `config.auth.*` → new convention (generic keys
for standard rules, `system.settings.config.auth.*` for custom).

### Step 9: Update init patch SHA-256

Run `pnpm tsx scripts/update-init-patch-sha256.ts` after modifying
`00000000000000_init_database.sql`.

### Step 10: Apply migration

```bash
pnpm run db:migrate
```

### Step 11: Flush Redis cache

Run a one-shot script to delete `translations:i18n:*` keys from Redis
so the BE re-reads from DB with the new values.

### Step 12: Verify

- DB `system.translations`: 0 rows with `system.settings.config.auth.*.errors.required` (excluding auth_mode, idp_type)
- DB `system.translations`: 0 rows with `system.settings.config.auth.*.errors.min`
- DB `system.translations`: 0 rows with `system.settings.config.auth.*.errors.max`
- DB `system.translations`: 0 rows with `system.settings.config.auth.*.errors.invalidUrl`
- DB `system.translations`: 0 rows with `system.settings.config.auth.*.errors.invalidEmail`
- DB `public.translations`: generic keys have new normalized values
- DB `auth_configurations`: 0 rows with `config.auth.*` in `label_key`
- DB `auth_configurations`: 0 rows with `config.auth.*` in `description_key`
- DB `auth_configurations`: 0 rows with `config.auth.*` in `type_config` JSON
- BE build passes
- FE check passes
- FE tests pass

## Impact analysis

- **`auth_configurations` table:** 23 rows updated — `label_key`,
  `description_key` columns and `type_config` JSON all updated from
  `config.auth.*` to `system.settings.config.auth.*` prefix. Error keys
  in `type_config` JSON consolidated to generic `app.common.validation.*`.
- **Translations table:** 270 rows hard-deleted (45 keys × 6 languages).
  24 rows updated (4 generic keys × 6 languages).
- **Init patch:** 21 config entry INSERT rows rewritten with new prefix
  and generic error keys.
- **Seed patches:** duplicate INSERTs removed from 6 language files.
- **FE:** `autoErrorLabelKey` generates generic keys by default. Custom
  keys still possible via builder UI (user override). Create page
  placeholders updated to new prefix. Tests updated.
- **No breaking changes:** the FE `TranslatedFormFieldErrors` component
  resolves any i18n key via `$t()` — generic or per-field, both work.
