# Feature Plan: Config Validation, Footer Save, and Version Badge

## Objective

Add metadata-driven validation to the Security config page using a `validation` sub-key inside the existing `type_config` JSON column. Build a dynamic Zod schema from the metadata on the FE, enforce the same rules on the BE, add a footer with "Salva Modifiche" CTA using sveltekit-superforms with taint tracking, and add a clickable version badge on each config row.

## Key Decisions (from user)

1. **Validation rules location**: `type_config.validation` — a sub-key inside the existing `type_config` JSON. No new DB column, no renaming.
2. **Save architecture**: Batch save — new BE endpoint `PUT /api/v1/entities/config_entries/bulk-update` that receives all changed entries in one API call.
3. **Version badge**: Clickable — opens the version history sheet via `openSheet('entity.versionHistory', { entity: 'config_entries', rowUuid })`.
4. **BE validation**: Both FE and BE validate. BE reads `type_config.validation` and applies rules in `validateConfigValue`.

## Validation Rules Schema

### Structure inside `type_config`

```json
{
  "values": { ... },
  "validation": {
    "required": true,
    "rules": {
      "min": { "value": 1, "error_label_key": "config.auth.invitation_expiry_days.errors.min" },
      "max": { "value": 90, "error_label_key": "config.auth.invitation_expiry_days.errors.max" },
      "url": { "protocols": ["http", "https", "redis", "rediss", "tcp"], "error_label_key": "config.auth.redis_url.errors.invalidUrl" },
      "email": { "error_label_key": "config.auth.admin_contact_email.errors.invalidEmail" },
      "regex": { "pattern": "^[a-z0-9.]+$", "error_label_key": "config.auth.auth_roles_path.errors.invalidFormat" }
    }
  }
}
```

### Supported rule types

| Rule | Zod method | Applies to | Parameters |
|------|-----------|------------|------------|
| `min` | `.min(value, { message })` | string (length), number (value) | `value: number`, `error_label_key: string` |
| `max` | `.max(value, { message })` | string (length), number (value) | `value: number`, `error_label_key: string` |
| `url` | `.refine(fn, { message })` | string | `protocols: string[]`, `error_label_key: string` |
| `email` | `.email({ message })` | string | `error_label_key: string` |
| `regex` | `.regex(new RegExp(pattern), { message })` | string | `pattern: string`, `error_label_key: string` |

### TypeScript interface (FE + BE shared)

```typescript
interface ValidationRuleMin { value: number; error_label_key: string; }
interface ValidationRuleMax { value: number; error_label_key: string; }
interface ValidationRuleUrl { protocols: string[]; error_label_key: string; }
interface ValidationRuleEmail { error_label_key: string; }
interface ValidationRuleRegex { pattern: string; error_label_key: string; }

interface ConfigValidation {
  required: boolean;
  rules: {
    min?: ValidationRuleMin;
    max?: ValidationRuleMax;
    url?: ValidationRuleUrl;
    email?: ValidationRuleEmail;
    regex?: ValidationRuleRegex;
  };
}

interface TypeConfig {
  values?: Record<string, { label_key: string }>;
  api_url?: string;
  api_verb?: string;
  value_field?: string;
  label_field?: string;
  validation?: ConfigValidation;
}
```

## Validation Values Per Config Key

Based on empirical research across IDP standards (RFC 6749, Keycloak, Entra ID, Okta, Casdoor, OIDC Discovery, Redis URL spec, NIST SP 800-63B, RFC 6238, OWASP MFA):

| Key | Type | Rules | Rationale |
|-----|------|-------|-----------|
| `invitation_expiry_days` | integer | min 1, max 90 | Reasonable invitation expiry range |
| `redis_url` | url | protocols: [redis, rediss, tcp, http, https] | Redis URL spec (IANA redis/rediss schemes) + tcp for raw connections |
| `idp_client_id` | string | min 6, max 100 | Okta min 6, max 100; Casdoor max 100; Keycloak max 36; Entra 36 (UUID) — min 6 covers Okta, max 100 covers all |
| `idp_client_secret` | secret | min 32, max 256 | HMAC-SHA256 min 32 bytes (RFC 2104); 256 is a reasonable max for any IDP |
| `idp_endpoint` | url | protocols: [http, https] | IDP endpoint is a web URL |
| `idp_organization` | string | min 1, max 100 | Organization name, reasonable max |
| `auth_roles_path` | string | min 3, max 255, regex: `^[a-zA-Z0-9._-]+$` | LDAP DN max 255 (RFC 4514); dot notation with alphanumerics, dots, hyphens, underscores |
| `oidc_client_id` | string | min 6, max 100 | Same as idp_client_id — OIDC uses OAuth client_id; Okta min 6 applies to OIDC clients |
| `oidc_client_secret` | secret | min 32, max 256 | Same as idp_client_secret |
| `oidc_issuer_url` | url | protocols: [http, https] | OIDC Discovery 1.0 recommends HTTPS, but local installations for testing may not have SSL |
| `mfa_challenge_signing_secret` | secret | min 32, max 256 | HMAC-SHA256 min 32 bytes (RFC 2104, FIPS 198-1) |
| `mfa_challenge_token_ttl_seconds` | integer | min 30, max 600 | TOTP standard 30s (RFC 6238); email OTP 300s (Auth0); max 600s = 10 min (OWASP) |
| `admin_contact_email` | string | email | RFC 5322 email validation |
| `frontend_url` | url | protocols: [http, https] | Web URL |
| `notification_alert_secret` | secret | min 32, max 256 | HMAC signing secret, same as MFA |

## Answers to User Questions

- **idp_client_id min/max**: min 6, max 100. Okta explicitly requires min 6. Casdoor max 100. Keycloak max 36, Entra ID = 36 (UUID). Min 6 covers Okta, max 100 covers all systems.
- **idp_client_secret min/max**: min 32, max 256. HMAC-SHA256 requires min 32 bytes (RFC 2104). Casdoor provider secret max is 3000, but 256 is plenty for any IDP client secret.
- **auth_roles_path min/max**: min 3, max 255. LDAP DN max is 255 (RFC 4514). 100 for dot notation is reasonable but 255 is the standard max.
- **mfa_challenge_token_ttl_seconds 30-600**: Correct. TOTP = 30s (RFC 6238), email OTP = 300s (Auth0/OWASP), max 600s = 10 min is acceptable.

## Impacted Files

### SDK (primebrick-v3-sdk)

The SDK already defines `IConfigEntity`, `ConfigType`, and `type_config` as the shared standard for all config-like tables across BE and microservices. The validation logic based on `type_config.validation` is a **cross-cutting concern** that every config table consumer needs — BE, microservices, and potentially FE. It belongs in the SDK for DRY reuse.

| File | Change |
|------|--------|
| `src/config/iconfig-entity.ts` | Add `ConfigValidation`, `ValidationRule*` interfaces (the `type_config.validation` shape) |
| `src/config/config-validator.ts` | **NEW** — `validateConfigValue(type, type_config, value): void` function that reads `type_config.validation` and applies rules (min, max, url protocols, email, regex). Throws `ConfigValidationError` with `error_label_key` as message. Pure function, no DB dependencies. |
| `src/config/config-validator.ts` | Export `ConfigValidationError` class with `error_label_key` and `rule` properties |
| `src/index.ts` | Export `validateConfigValue`, `ConfigValidationError`, `ConfigValidation`, `ValidationRule*` types |

### BE (primebrick-be-v3)

| File | Change |
|------|--------|
| `db-meta/patches/00000000000000_init_database.sql` | Add `validation` JSON to `type_config` for all 16 config keys in the seed |
| `db-meta/fire-and-forget/add_config_table_standard_columns.sql` | Add fire-and-forget migration to update `type_config` for existing rows with validation rules |
| `src/modules/auth/auth_configurations_dal.ts` | Remove `validateConfigValue` (moved to SDK); add `bulkUpdate(id, value[], updatedBy)` method using `repo.updateMany` (pure data I/O, no validation) |
| `src/modules/auth/routers/config-entries.router.ts` | Add `PUT /api/v1/entities/config_entries/bulk-update` endpoint (validates via SDK `validateConfigValue`, then calls `dal.bulkUpdate`) |
| `src/modules/auth/routers/config-entries.router.ts` | Add `GET /api/v1/entities/config_entries/:uuid/audit` endpoint (version history) |
| `src/modules/auth/routers/config-entries.router.ts` | Add `BulkUpdateBodySchema` Zod schema for bulk update request |
| `src/modules/auth/routers/config-entries.router.ts` | Update existing `PUT /:uuid` handler to use SDK `validateConfigValue` instead of DAL `validateConfigValue` |

### FE (primebrick-fe-v3)

| File | Change |
|------|--------|
| `src/lib/api-types.ts` | No change needed — `type_config` is already `string \| null`, parsed as JSON by FE |
| `src/lib/validation/config-validation.ts` | **NEW** — JSON-to-Zod builder: reads `type_config.validation` and builds a `z.ZodTypeAny` per entry |
| `src/lib/validation/config-validation.ts` | Export `buildConfigFormSchema(entries: ConfigEntry[]): z.ZodObject` — builds a `z.object({ [uuid]: z.ZodTypeAny })` from all entries |
| `src/lib/api.ts` | Add `bulkUpdateConfigEntries(updates: {uuid, value, version}[])` function calling `PUT /bulk-update` |
| `src/lib/components/config-list/ConfigList.svelte` | Wrap in `superForm` with dynamic Zod schema; add taint tracking via `useFormGuard`; add footer with "Salva Modifiche" CTA |
| `src/lib/components/config-list/ConfigList.svelte` | On save: collect tainted entries, call `bulkUpdateConfigEntries`, reset taint |
| `src/lib/components/config-list/ConfigListRow.svelte` | Add clickable version badge before "Ultimo aggiornamento" line |
| `src/lib/components/config-list/ConfigListRow.svelte` | Replace per-row `onSave` with form binding to superform `$form` store |
| `src/lib/components/config-list/ConfigValueInput.svelte` | Replace `localValue` + `onSave` with `bind:value` to superform `$form[uuid]` |
| `src/lib/components/config-list/ConfigValueInput.svelte` | Show validation errors from superform `$errors[uuid]` |
| `src/lib/i18n/messages/*.json` (6 locales) | Add error label keys for each config key's validation rules (e.g. `config.auth.invitation_expiry_days.errors.min`) |

### DAL (primebrick-dal-v3)

No changes — `type_config` is already `string | null` in the entity base.

## Architecture: SuperForms Integration

### Current state

ConfigList does NOT use sveltekit-superforms. Each row saves independently via `onSave(value)` callback → `updateConfigEntry(uuid, value, version)` API call.

### Target state

ConfigList wraps all entries in a single `superForm` with a dynamic Zod schema built from `type_config.validation`. Taint tracking via `useFormGuard` enables the "Salva Modifiche" button. On save, all tainted entries are sent in one batch to `PUT /bulk-update`.

### Form data shape

```typescript
// Form data: { [entry.uuid]: string }
// Schema: z.object({ [entry.uuid]: z.string().min(1)... })
```

### SuperForm initialization (in ConfigList.svelte)

```typescript
import { superForm } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { buildConfigFormSchema } from '$lib/validation/config-validation';
import { useFormGuard } from '$lib/composables/useFormGuard.svelte';

// Build dynamic schema from entries
const schema = $derived(buildConfigFormSchema(entries));

// Initialize form with current entries
const initialValues = $derived(
  Object.fromEntries(entries.map(e => [e.uuid, e.value ?? '']))
);

const superFormObj = superForm(initialValues, {
  SPA: true,
  validators: zod4(schema),
  validationMethod: 'oninput',
  resetForm: false,
});

const { form, errors, enhance, reset, tainted, isTainted } = superFormObj;

const { hasChanges, canSave } = useFormGuard(
  () => $tainted,
  () => $errors as Record<string, unknown>,
  isTainted as (path?: unknown) => boolean,
);
```

### Save handler

```typescript
async function handleBulkSave() {
  const formData = $form as Record<string, string>;
  const taintedState = $tainted as Record<string, unknown>;
  
  // Collect only tainted entries
  const updates = entries
    .filter(e => taintedState[e.uuid])
    .map(e => ({
      uuid: e.uuid,
      value: formData[e.uuid],
      version: e.version,
    }));
  
  if (updates.length === 0) return;
  
  await bulkUpdateConfigEntries(updates);
  
  // Reset taint after successful save
  reset({ data: $form });
  
  // Reload entries to get updated version/updated_at
  await reloadEntries();
}
```

## Architecture: BE Bulk Update

### New endpoint

```
PUT /api/v1/entities/config_entries/bulk-update
Body: {
  updates: [
    { uuid: string, value: string, version: number },
    ...
  ]
}
```

### BE validation

**Validation belongs in the SDK, not in the BE or DAL.** The SDK already defines `IConfigEntity`, `ConfigType`, and `type_config` as the shared standard for all config-like tables. The validation logic based on `type_config.validation` is a cross-cutting concern that every config table consumer needs (BE, microservices). It belongs in the SDK for DRY reuse.

A new `src/config/config-validator.ts` file in the SDK will contain the validation logic:

1. `required: true` — reject empty strings (except for `secret` type where empty = "leave unchanged")
2. `min` — for strings: check `value.length >= min`; for integers/numbers: check `Number(value) >= min`
3. `max` — for strings: check `value.length <= max`; for integers/numbers: check `Number(value) <= max`
4. `url` — parse URL, check `protocol` is in `protocols[]` list
5. `email` — use basic email regex validation
6. `regex` — test value against `new RegExp(pattern)`

Each rule failure throws a `ValidationError` with the `error_label_key` as the message (so the FE can translate it).

The router handler validates BEFORE calling the DAL. The DAL `bulkUpdate` method receives already-validated data and does only data I/O.

### DAL bulkUpdate method

The DAL already has `Repository.updateMany()` with a **TEMP TABLE strategy** (`CREATE TEMP TABLE → batch INSERT → UPDATE FROM → COMMIT` in a single transaction). It handles audit columns (updated_at, updated_by, version increment), auto-batching to stay under PG's 65535 parameter limit, and match-by column resolution.

The DAL `bulkUpdate` method is pure data I/O — no validation, no business logic:

```typescript
async bulkUpdate(
  updates: { id: bigint; value: string }[],
  updatedBy: string
): Promise<void> {
  if (updates.length === 0) return;

  // Single bulk update via Repository.updateMany (TEMP TABLE strategy, 1 transaction)
  // No validation here — the router layer validates before calling the DAL.
  await this.repo.updateMany(
    AuthConfigurationEntity,
    updates.map(u => ({ id: u.id, value: u.value })),
    { actor: updatedBy, matchBy: 'id' }
  );

  // Reload in-memory cache
  await this.reloadCache();
}
```

### Router layer (validation + orchestration)

The router handler in `config-entries.router.ts` does:

1. Fetch existing rows for all UUIDs (to get type, type_config, version, id)
2. Validate each value using `config-validation.ts` (reads `type_config.validation`)
3. Check optimistic concurrency (version match)
4. Skip secrets with empty value ("leave unchanged")
5. Map validated updates to `{ id, value }[]`
6. Call `dal.bulkUpdate(validUpdates, userUuid)` — single transactional write

## Architecture: Version History Endpoint

### New endpoint

```
GET /api/v1/entities/config_entries/:uuid/audit?page=1&limit=50
```

Uses the existing `audit-query-helper.ts` `getAuditPage` function with `tableName: 'auth_configurations_audit'`. The pattern is identical to the customer audit endpoint.

### FE integration

The version badge on each row calls:
```typescript
openSheet('entity.versionHistory', { entity: 'config_entries', rowUuid: entry.uuid });
```

The existing `VersionHistoryPanel.svelte` will work as-is because it fetches from `/api/v1/entities/${entity}/${rowUuid}/audit` — we just need the BE endpoint to exist.

## Architecture: BE Audit Table

The `auth_configurations` entity has `@AuditTrail()` decorator (confirmed in `auth_configuration_entity.ts` line 34). This means the DAL automatically writes to `auth_configurations_audit` table on every create/update/delete. The audit endpoint just needs to query this table.

## Implementation Order

### Phase 1: SDK validation module

1. Add `ConfigValidation`, `ValidationRule*` interfaces to `src/config/iconfig-entity.ts`
2. Create `src/config/config-validator.ts` — `validateConfigValue(type, type_config, value)` + `ConfigValidationError`
3. Export from `src/index.ts`
4. Build SDK: `pnpm build`

### Phase 2: BE validation rules in DB + endpoints

5. Update `00000000000000_init_database.sql` seed: add `validation` JSON to `type_config` for all 16 config keys
6. Add fire-and-forget migration: update existing rows' `type_config` with validation rules
7. Remove `validateConfigValue` from `auth_configurations_dal.ts`; import SDK `validateConfigValue` in router instead
8. Add `bulkUpdate` method to `auth_configurations_dal.ts` (pure data I/O via `repo.updateMany`)
9. Add `BulkUpdateBodySchema` and `PUT /bulk-update` endpoint to `config-entries.router.ts` (validates via SDK, then calls DAL)
10. Add `GET /:uuid/audit` endpoint to `config-entries.router.ts`
11. Update existing `PUT /:uuid` handler to use SDK `validateConfigValue`
12. Build BE: `pnpm run build`

### Phase 3: FE validation + superforms

13. Create `src/lib/validation/config-validation.ts` — JSON-to-Zod builder (reads `type_config.validation`, builds Zod schema dynamically)
14. Add `bulkUpdateConfigEntries` to `src/lib/api.ts`
15. Refactor `ConfigList.svelte` to use `superForm` with dynamic schema + `useFormGuard` + footer with "Salva Modifiche"
16. Refactor `ConfigValueInput.svelte` to bind to superform `$form[uuid]` and show `$errors[uuid]`
17. Add clickable version badge to `ConfigListRow.svelte`
18. Add error label keys to all 6 locale files
19. Run FE check: `pnpm run check`

### Phase 4: Verification

20. Apply DB migration
21. Verify SDK build passes
22. Verify BE build passes
23. Verify FE check passes (0 errors, 2 pre-existing warnings)
24. Manual browser check: validation errors, taint tracking, save button, version badge click

## Acceptance Criteria

1. ✅ All 16 config keys have `validation` rules in their `type_config` JSON
2. ✅ `validateConfigValue` on BE reads `type_config.validation` and rejects invalid values with translated error keys
3. ✅ FE builds a dynamic Zod schema from `type_config.validation` per entry
4. ✅ FE shows inline validation errors per field
5. ✅ "Salva Modifiche" button in footer is disabled when no changes or when validation errors exist
6. ✅ "Salva Modifiche" button is enabled when at least one field is tainted AND no validation errors
7. ✅ Batch save sends all tainted entries in one API call to `PUT /bulk-update`
8. ✅ Version badge (clickable) appears before "Ultimo aggiornamento" on each row
9. ✅ Clicking version badge opens version history sheet
10. ✅ All error label keys are translated in 6 locales
11. ✅ BE build passes with 0 errors
12. ✅ FE check passes with 0 errors, 2 pre-existing warnings
