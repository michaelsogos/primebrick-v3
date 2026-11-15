# Plan: Special Input Components — URL, EMAIL, PHONE, TIME + Min/Max alignment + FE/BE validation congruence

## Objective

Create dedicated input components for URL, EMAIL, and PHONE config types, extend the DateWheelPicker for TIME-only mode, align Min/Max validation across all string-derived types, **fix all pre-existing FE/BE validation incongruenze**, and update all documentation (agent docs, user guide, Devin rules).

## Context

The config-builder TYPE system serves two purposes: (1) which validation rules apply, and (2) which component renders the value. The current system has gaps:

- **URL** uses a plain `<Input type="url">` — no protocol selector, no copy button, no clear button
- **EMAIL** doesn't exist as a TYPE — it's a `rules.email` switch on STRING, with FE/BE incongruenza (FE shows it for `secret`, BE doesn't validate it for `secret`)
- **PHONE** doesn't exist at all — no component, no validation, no type
- **TIME** uses `<Input type="time">` — no wheel picker, inconsistent with DATE/DATETIME which use DateWheelPicker
- **Min/Max** is shown for ALL types in the FE builder but the BE only validates it for `string`, `text`, `secret`, `url`, `bigint`, `number`, `money`

## Decisions (confirmed with user)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| URL component | Protocol prefix selector (left, Sheet panel) + copy + clear (right) | Analogous to MONEY's currency selector pattern |
| EMAIL component | `<Input type="email">` + copy + clear (right), no left selector | No country/protocol selector needed |
| PHONE component | Country prefix selector (left, Sheet panel) + copy + clear (right) | Analogous to URL/MONEY pattern |
| PHONE formatting | `libphonenumber-js` (1.13.12, ~80KB min metadata) | Standard library, AsYouType formatter, locale-aware |
| PHONE prefix data | `countries-list` (already installed, has `phone: number[]` field) | DRY — reuse existing library |
| TIME picker | Extend DateWheelPicker with `timeOnly` prop | Reuses existing wheel primitives, no new component |
| Phone prefix UI | Right-side Sheet panel (like CurrencySelectPanel) | Consistent with MONEY pattern |
| SDK phone validation | Full validation via `libphonenumber-js` in SDK (single source of truth) | FE and BE use the same validation logic — zero incongruenza |
| `libphonenumber-js` in SDK | Add as SDK dependency (works in Node.js) | SDK is the shared validation layer for BE + US + FE mirror |

---

## Part 0: Fix Pre-Existing FE/BE Validation Incongruenze

Empirical investigation revealed 7 incongruenze between FE Zod builder (`config-validation.ts`) and SDK validator (`config-validator.ts`). These must be fixed BEFORE adding new types, so the new types are built on a congruent foundation.

### 0.1 `number`/`money` base validation — port FE regex to SDK

**Problem:** FE uses regex `/^-?\d*\.?\d+$/`, SDK uses `isNaN(Number(value))`. Divergent cases:
- `"1e5"` → FE rejects, SDK accepts (`Number("1e5")` = 100000)
- `"  5  "` → FE rejects, SDK accepts (`Number("  5  ")` = 5)
- `"Infinity"` → FE rejects, SDK accepts

**Fix:** Port the FE regex to the SDK. The regex is stricter and more predictable than `Number()`.

**File:** `primebrick-v3-sdk/src/config/config-validator.ts` (lines 230-237)

```ts
// BEFORE (SDK):
case "number":
case "money":
  if (isNaN(Number(value))) {
    throw new ConfigValidationError("validation.invalidNumber", "type", config_key);
  }
  if (unsigned && (value.startsWith("-") || value.startsWith("+"))) {
    throw new ConfigValidationError("validation.invalidNumberUnsigned", "type", config_key);
  }
  break;

// AFTER (SDK — uses same regex as FE):
case "number":
case "money": {
  const numRegex = unsigned ? /^\d*\.?\d+$/ : /^-?\d*\.?\d+$/;
  if (!numRegex.test(value)) {
    throw new ConfigValidationError(
      unsigned ? "app.common.validation.invalidNumberUnsigned" : "app.common.validation.invalidNumber",
      "type",
      config_key,
    );
  }
  break;
}
```

### 0.2 `bigint` min/max — fix FE to use BigInt() instead of Number()

**Problem:** FE uses `Number(val) >= minVal` for bigint min/max. This loses precision for values > 2^53. SDK correctly uses `BigInt()`.

**Fix:** Port the SDK BigInt logic to the FE.

**File:** `primebrick-fe-v3/src/lib/validation/config-validation.ts` (lines 89-93)

```ts
// BEFORE (FE):
if (type === 'bigint' || type === 'number' || type === 'money') {
  schema = schema.refine((val) => {
    if (!val) return true;
    return Number(val) >= minVal;
  }, { message: minMsg });
}

// AFTER (FE — splits bigint from number/money):
if (type === 'bigint') {
  schema = schema.refine((val) => {
    if (!val) return true;
    try {
      return BigInt(val) >= BigInt(minVal);
    } catch {
      return false;
    }
  }, { message: minMsg });
} else if (type === 'number' || type === 'money') {
  schema = schema.refine((val) => {
    if (!val) return true;
    return Number(val) >= minVal;
  }, { message: minMsg });
}
```

Same fix for max (lines 110-114):

```ts
if (type === 'bigint') {
  schema = schema.refine((val) => {
    if (!val) return true;
    try {
      return BigInt(val) <= BigInt(maxVal);
    } catch {
      return false;
    }
  }, { message: maxMsg });
} else if (type === 'number' || type === 'money') {
  schema = schema.refine((val) => {
    if (!val) return true;
    return Number(val) <= maxVal;
  }, { message: maxMsg });
}
```

### 0.3 Validation error keys — align SDK to use `app.common.validation.*`

**Problem:** SDK throws errors with `validation.*` keys (e.g. `validation.invalidBigint`). These keys **do not exist** in any translation file — not in the BE DB seeds, not in the FE fallback. The BE DB seeds and FE both use `app.common.validation.*`. When the BE returns a SDK error to the FE, the FE cannot translate it.

**Empirical evidence:**
- `grep -r "'validation\." db-meta/` → 0 matches (no `validation.*` keys in DB seeds)
- `grep "app.common.validation" en-GB-fallback.json` → 0 matches (not in FE fallback either)
- FE Zod builder uses `app.common.validation.*` → translated from DB-loaded translations
- SDK uses `validation.*` → **untranslatable** — the FE shows the raw key to the user

**Fix:** Change all SDK error keys from `validation.*` to `app.common.validation.*`.

**File:** `primebrick-v3-sdk/src/config/config-validator.ts`

All occurrences to update:

| SDK current key | New key |
|----------------|---------|
| `validation.required` | `app.common.validation.required` |
| `validation.unsigned` | `app.common.validation.unsigned` |
| `validation.invalidBoolean` | `app.common.validation.invalidBoolean` |
| `validation.invalidBigint` | `app.common.validation.invalidBigint` |
| `validation.invalidBigintUnsigned` | `app.common.validation.invalidBigintUnsigned` |
| `validation.invalidNumber` | `app.common.validation.invalidNumber` |
| `validation.invalidNumberUnsigned` | `app.common.validation.invalidNumberUnsigned` |
| `validation.invalidUrl` | `app.common.validation.invalidUrl` |
| `validation.invalidJson` | `app.common.validation.invalidJson` |

**Also add new keys** for the new types:

| New key | en-GB value |
|---------|-------------|
| `app.common.validation.invalidEmail` | Must be a valid email address (already in DB) |
| `app.common.validation.invalidPhone` | Must be a valid phone number |
| `app.common.validation.invalidUrlProtocol` | Protocol not allowed |
| `app.common.validation.invalidRegexPattern` | Invalid regex pattern in configuration |

These keys must be added in **three layers** (all three must be aligned):

#### Layer 1: FE fallback `en-GB-fallback.json`

**File:** `primebrick-fe-v3/src/lib/i18n/messages/en-GB-fallback.json`

Add ALL `app.common.validation.*` keys as fallback (currently missing from fallback):

```json
"app.common.validation.required": "This field is required",
"app.common.validation.unsigned": "Must be a positive number (no sign)",
"app.common.validation.invalidBoolean": "Must be true or false",
"app.common.validation.invalidBigint": "Must be a valid integer",
"app.common.validation.invalidBigintUnsigned": "Must be a positive integer (no sign)",
"app.common.validation.invalidNumber": "Must be a valid number",
"app.common.validation.invalidNumberUnsigned": "Must be a positive number (no sign)",
"app.common.validation.invalidUrl": "Must be a valid URL",
"app.common.validation.invalidEmail": "Must be a valid email address",
"app.common.validation.invalidPhone": "Must be a valid phone number",
"app.common.validation.invalidUrlProtocol": "Protocol not allowed",
"app.common.validation.invalidRegexPattern": "Invalid regex pattern in configuration",
"app.common.validation.invalidJson": "Must be valid JSON",
"app.common.validation.tooShort": "Must be at least {min}",
"app.common.validation.tooLong": "Must be at most {max}",
```

#### Layer 2: BE seed patches (6 language files)

**Files:**
- `primebrick-be-v3/db-meta/patches/00000000000001_seed_translations_en_gb.sql`
- `primebrick-be-v3/db-meta/patches/00000000000002_seed_translations_it_it.sql`
- `primebrick-be-v3/db-meta/patches/00000000000003_seed_translations_fr_fr.sql`
- `primebrick-be-v3/db-meta/patches/00000000000004_seed_translations_es_es.sql`
- `primebrick-be-v3/db-meta/patches/00000000000005_seed_translations_de_de.sql`
- `primebrick-be-v3/db-meta/patches/00000000000006_seed_translations_pt_pt.sql`

Add the new keys (`invalidPhone`, `invalidUrlProtocol`, `invalidRegexPattern`) to each seed file with the appropriate translation for that language. The existing keys (`required`, `invalidBigint`, `invalidUrl`, etc.) are already in the seed files — verify and update if values need normalization.

**Note:** Per i18n convention, `app.common.validation.*` keys go in `public.translations` (not `system.translations`), since they are app-level generic keys shared across all config tables.

#### Layer 3: Fire-and-forget patch for live DB

**File:** `primebrick-be-v3/db-meta/fire-and-forget/add_new_validation_error_keys.sql`

Create a fire-and-forget patch to INSERT the new keys into the live DB for all 6 languages:

```sql
BEGIN;

-- invalidPhone: new key for phone type validation
INSERT INTO public.translations (key, language, value, created_at, created_by, version) VALUES
  ('app.common.validation.invalidPhone', 'en-GB', 'Must be a valid phone number', now(), 'initial-setup', 1),
  ('app.common.validation.invalidPhone', 'it-IT', 'Deve essere un numero di telefono valido', now(), 'initial-setup', 1),
  ('app.common.validation.invalidPhone', 'fr-FR', 'Doit être un numéro de téléphone valide', now(), 'initial-setup', 1),
  ('app.common.validation.invalidPhone', 'es-ES', 'Debe ser un número de teléfono válido', now(), 'initial-setup', 1),
  ('app.common.validation.invalidPhone', 'de-DE', 'Muss eine gültige Telefonnummer sein', now(), 'initial-setup', 1),
  ('app.common.validation.invalidPhone', 'pt-PT', 'Deve ser um número de telefone válido', now(), 'initial-setup', 1)
ON CONFLICT (key, language) WHERE deleted_at IS NULL DO NOTHING;

-- invalidUrlProtocol: new key for URL protocol validation
INSERT INTO public.translations (key, language, value, created_at, created_by, version) VALUES
  ('app.common.validation.invalidUrlProtocol', 'en-GB', 'Protocol not allowed', now(), 'initial-setup', 1),
  ('app.common.validation.invalidUrlProtocol', 'it-IT', 'Protocollo non consentito', now(), 'initial-setup', 1),
  ('app.common.validation.invalidUrlProtocol', 'fr-FR', 'Protocole non autorisé', now(), 'initial-setup', 1),
  ('app.common.validation.invalidUrlProtocol', 'es-ES', 'Protocolo no permitido', now(), 'initial-setup', 1),
  ('app.common.validation.invalidUrlProtocol', 'de-DE', 'Protokoll nicht erlaubt', now(), 'initial-setup', 1),
  ('app.common.validation.invalidUrlProtocol', 'pt-PT', 'Protocolo não permitido', now(), 'initial-setup', 1)
ON CONFLICT (key, language) WHERE deleted_at IS NULL DO NOTHING;

-- invalidRegexPattern: new key for invalid regex pattern in config
INSERT INTO public.translations (key, language, value, created_at, created_by, version) VALUES
  ('app.common.validation.invalidRegexPattern', 'en-GB', 'Invalid regex pattern in configuration', now(), 'initial-setup', 1),
  ('app.common.validation.invalidRegexPattern', 'it-IT', 'Pattern regex non valido nella configurazione', now(), 'initial-setup', 1),
  ('app.common.validation.invalidRegexPattern', 'fr-FR', 'Modèle regex invalide dans la configuration', now(), 'initial-setup', 1),
  ('app.common.validation.invalidRegexPattern', 'es-ES', 'Patrón regex no válido en la configuración', now(), 'initial-setup', 1),
  ('app.common.validation.invalidRegexPattern', 'de-DE', 'Ungültiges Regex-Muster in der Konfiguration', now(), 'initial-setup', 1),
  ('app.common.validation.invalidRegexPattern', 'pt-PT', 'Padrão regex inválido na configuração', now(), 'initial-setup', 1)
ON CONFLICT (key, language) WHERE deleted_at IS NULL DO NOTHING;

COMMIT;
```

**Note:** The existing keys (`required`, `invalidBigint`, `invalidUrl`, `invalidEmail`, `tooShort`, `tooLong`, `invalidBoolean`, `invalidBigintUnsigned`, `invalidNumber`, `invalidNumberUnsigned`, `invalidJson`, `unsigned`) are already in the live DB from the original seed patches. Only the 3 truly new keys need the fire-and-forget INSERT. Verify with a SELECT query before applying.

### 0.4 `rules.url` type guard — restrict to `type === "url"` only

**Problem:** FE has no type guard (applies `rules.url` to ALL types). SDK guards with `type === "url" || type === "string"`. With the new `url` type and `type_config.allowed_protocols`, the `string` fallback is no longer needed.

**Fix:** Both FE and SDK guard with `type === "url"` only.

**File:** `primebrick-v3-sdk/src/config/config-validator.ts` (line 172)

```ts
// BEFORE:
if (rules.url && (type === "url" || type === "string")) {
// AFTER:
if (rules.url && type === "url") {
```

**File:** `primebrick-fe-v3/src/lib/validation/config-validation.ts` (line 121)

```ts
// BEFORE (no guard):
if (rules.url) {
// AFTER:
if (rules.url && type === 'url') {
```

### 0.5 `rules.email` — move to TYPE `email`, remove from STRING

**Problem:** FE has no type guard (applies `rules.email` to ALL types). SDK guards with `type === "string" || type === "text"`. With the new `email` type, email validation is inherent to the type.

**Fix:** Both FE and SDK: remove `rules.email` block entirely. Email validation moves to `validateType()` for `type === "email"` (SDK) and to the base type validation for `type === 'email'` (FE).

**File:** `primebrick-v3-sdk/src/config/config-validator.ts`
- Remove lines 185-190 (the `rules.email` block)
- Add `email` case to `validateType()`:
  ```ts
  case "email":
    if (value && !EMAIL_REGEX.test(value)) {
      throw new ConfigValidationError("app.common.validation.invalidEmail", "type", config_key);
    }
    break;
  ```

**File:** `primebrick-fe-v3/src/lib/validation/config-validation.ts`
- Remove lines 137-143 (the `rules.email` block)
- Add `email` to base type validation (already in Part 6.3 of this plan)

### 0.6 `rules.regex` — align behavior on invalid pattern

**Problem:** FE silently skips validation when the regex pattern is invalid. SDK throws a validation error. The user sees the form pass FE validation, then fail unexpectedly on BE save.

**Fix:** Both FE and SDK must **throw** on invalid regex pattern. The pattern is a builder-time concern — an invalid pattern is a configuration error, not a runtime validation state.

**File:** `primebrick-fe-v3/src/lib/validation/config-validation.ts` (lines 149-155)

```ts
// BEFORE (FE — skip on invalid pattern):
try {
  regex = new RegExp(pattern);
} catch {
  // Invalid pattern — skip regex validation
  return schema;
}

// AFTER (FE — throw on invalid pattern, same as SDK):
try {
  regex = new RegExp(pattern);
} catch {
  // Invalid pattern — configuration error, must fail in both FE and BE
  schema = schema.refine(() => false, { message: 'app.common.validation.invalidRegexPattern' });
  return schema;
}
```

**File:** `primebrick-v3-sdk/src/config/config-validator.ts` (lines 194-204)

SDK already throws — keep as is, but update the error key:

```ts
// BEFORE (SDK):
throw new ConfigValidationError(rules.regex.error_label_key, "regex", config_key);

// AFTER (SDK — use app.common.validation.* key):
throw new ConfigValidationError(
  rules.regex.error_label_key ?? "app.common.validation.invalidRegexPattern",
  "regex",
  config_key,
);
```

**New translation key:** `app.common.validation.invalidRegexPattern` → "Invalid regex pattern in configuration"

**Also:** Add type guard to FE (currently missing). Both FE and SDK: `rules.regex` applies to `string, text, secret, url, email, phone`.

### 0.7 `rules.regex` type guard — align FE with SDK

**Problem:** FE has no type guard for `rules.regex` (applies to ALL types). SDK guards with `type === "string" || type === "text" || type === "secret"`.

**Fix:** Both FE and SDK use the same guard, expanded to include the new string-derived types:

```ts
// Both FE and SDK:
if (rules.regex && (type === "string" || type === "text" || type === "secret" || type === "url" || type === "email" || type === "phone")) {
```

---

## Part 1: New Config Types

### 1.1 Add `email` and `phone` to `ConfigType`

**File:** `primebrick-v3-sdk/src/config/iconfig-entity.ts` (lines 42-57)

Add `"email"` and `"phone"` to the `ConfigType` union:

```ts
export type ConfigType =
  | "string"
  | "text"
  | "boolean"
  | "bigint"
  | "number"
  | "money"
  | "badge"
  | "single_select"
  | "multi_select"
  | "url"
  | "secret"
  | "json"
  | "date"
  | "datetime"
  | "time"
  | "email"   // NEW
  | "phone";  // NEW
```

### 1.2 Add `phone` type_config shape to SDK

**File:** `primebrick-v3-sdk/src/config/iconfig-entity.ts`

Add after `ConfigTypeMoneyConfig` (line 69):

```ts
/**
 * type_config shape for `phone` config type.
 * The phone number is stored in the `value` column (E.164 format);
 * the country code and optional allowed-countries list live in `type_config` JSON.
 */
export interface ConfigTypePhoneConfig {
  /** ISO 3166-1 alpha-2 country code, e.g. "IT", "US". Drives formatting and validation. */
  country: string;
  /** Optional: restrict selectable countries. If absent, all countries are allowed. */
  allowed_countries?: string[];
}
```

### 1.3 Add `url` type_config shape to SDK

**File:** `primebrick-v3-sdk/src/config/iconfig-entity.ts`

Add after `ConfigTypePhoneConfig`:

```ts
/**
 * type_config shape for `url` config type.
 * The URL is stored in the `value` column; the default protocol and
 * allowed-protocols list live in `type_config` JSON.
 */
export interface ConfigTypeUrlConfig {
  /** Default protocol prepended when the user doesn't type one. e.g. "https". */
  default_protocol: string;
  /** Allowed URL protocols, e.g. ["http", "https", "redis", "rediss", "tcp"]. */
  allowed_protocols: string[];
}
```

### 1.4 Add `libphonenumber-js` to SDK

**File:** `primebrick-v3-sdk/package.json`

```bash
cd primebrick-v3-sdk
pnpm add libphonenumber-js@1.13.12
```

The SDK is the single source of truth for config validation. Both BE and FE use the same `libphonenumber-js` library with the same metadata, same validation logic, same version. Zero incongruenza.

**Why not just E.164 regex?** E.164 regex (`/^\+\d{6,15}$/`) only checks format — it doesn't verify:
- Whether the number is valid for the given country (length, digit patterns, area codes)
- Whether the number length matches the country's numbering plan (e.g. Italy = 9-10 digits after prefix, UK = 10)
- Whether the digits form a valid mobile/landline prefix for that country

`libphonenumber-js` `.isValid()` performs all these checks using Google's `PhoneNumberMetadata.xml` data.

### 1.5 Update SDK validator

**File:** `primebrick-v3-sdk/src/config/config-validator.ts`

Changes:

1. Import `libphonenumber-js` at the top:
   ```ts
   import { parsePhoneNumber } from "libphonenumber-js";
   ```

2. Update `validateType()` signature to accept `type_config` (needed for phone country and url protocols):
   ```ts
   function validateType(
     type: ConfigType,
     value: string,
     config_key: string,
     unsigned: boolean = false,
     type_config?: string | null,  // NEW
   ): void
   ```
   Update the call site (line 89):
   ```ts
   validateType(type, value, config_key, unsigned, type_config);
   ```

3. Add `"email"` and `"phone"` to `validateType()` switch (after line 252):
   - `email`: validate with `EMAIL_REGEX` (reuse existing constant at line 66)
   - `phone`: full validation via `libphonenumber-js`:
     ```ts
     case "phone": {
       const parsed = parseTypeConfig(type_config);
       const country = parsed?.country as string | undefined;
       try {
         const phoneNumber = country
           ? parsePhoneNumber(value, country as any)
           : parsePhoneNumber(value);
         if (!phoneNumber || !phoneNumber.isValid()) {
           throw new ConfigValidationError("app.common.validation.invalidPhone", "type", config_key);
         }
       } catch (e) {
         if (e instanceof ConfigValidationError) throw e;
         throw new ConfigValidationError("app.common.validation.invalidPhone", "type", config_key);
       }
       break;
     }
     ```

4. Update `url` case in `validateType()` to check `allowed_protocols` from `type_config`:
   ```ts
   case "url": {
     try {
       const url = new URL(value);
       const parsed = parseTypeConfig(type_config);
       const allowedProtocols = parsed?.allowed_protocols as string[] | undefined;
       if (allowedProtocols && allowedProtocols.length > 0) {
         const protocol = url.protocol.replace(/:$/, "");
         if (!allowedProtocols.includes(protocol)) {
           throw new ConfigValidationError("app.common.validation.invalidUrlProtocol", "type", config_key);
         }
       }
     } catch (e) {
       if (e instanceof ConfigValidationError) throw e;
       throw new ConfigValidationError("validation.invalidUrl", "type", config_key);
     }
     break;
   }
   ```

5. Remove `rules.email` validation block (lines 185-190) — email is now a TYPE, not a rule. Mark the `email` field in `ConfigValidationRules` as `@deprecated`.

6. Remove `rules.url` validation block (lines 171-183) — URL protocols are now in `type_config.allowed_protocols`, validated in `validateType()` for `url` type. Mark the `url` field in `ConfigValidationRules` as `@deprecated`.

7. Add `email` and `phone` to min/max length validation (lines 133, 164):
   ```ts
   } else if (type === "string" || type === "text" || type === "secret" || type === "url" || type === "email" || type === "phone") {
   ```

8. Add `email` and `phone` to regex validation (line 193):
   ```ts
   if (rules.regex && (type === "string" || type === "text" || type === "secret" || type === "url" || type === "email" || type === "phone")) {
   ```

### 1.6 Update FE api-types

**File:** `primebrick-fe-v3/src/lib/api-types.ts` (lines 86-101)

Add `"email"` and `"phone"` to `ConfigEntryType`:

```ts
export type ConfigEntryType =
  | 'string'
  | 'text'
  | 'boolean'
  | 'bigint'
  | 'number'
  | 'money'
  | 'badge'
  | 'single_select'
  | 'multi_select'
  | 'url'
  | 'secret'
  | 'json'
  | 'date'
  | 'datetime'
  | 'time'
  | 'email'   // NEW
  | 'phone';  // NEW
```

### 1.6 Update FE type-config-schema

**File:** `primebrick-fe-v3/src/lib/config/type-config-schema.ts`

1. Add `email` and `phone` fields to `ParsedTypeConfig`:

   ```ts
   export interface ParsedTypeConfig {
     validation?: ConfigValidation;
     currency?: string;
     allowed_currencies?: string[];
     values?: Record<string, { label_key?: string; color?: string }>;
     values_source?: string;
     api_url?: string;
     api_verb?: string;
     value_field?: string;
     label_field?: string;
     // NEW
     country?: string;             // phone
     allowed_countries?: string[]; // phone
     default_protocol?: string;    // url
     allowed_protocols?: string[]; // url
   }
   ```

2. Update `ConfigValidationRules` — mark `email` and `url` as deprecated:

   ```ts
   export interface ConfigValidationRules {
     min?: ValidationRuleMin;
     max?: ValidationRuleMax;
     /** @deprecated Use TYPE `url` with type_config.allowed_protocols instead. */
     url?: ValidationRuleUrl;
     /** @deprecated Use TYPE `email` instead. */
     email?: ValidationRuleEmail;
     regex?: ValidationRuleRegex;
   }
   ```

3. Update `GENERIC_ERROR_KEYS` — add `email` and `phone`:

   ```ts
   const GENERIC_ERROR_KEYS: Record<string, string> = {
     required: 'app.common.validation.required',
     min: 'app.common.validation.tooShort',
     max: 'app.common.validation.tooLong',
     url: 'app.common.validation.invalidUrl',
     email: 'app.common.validation.invalidEmail',
     phone: 'app.common.validation.invalidPhone',
     invalidUrl: 'app.common.validation.invalidUrl',
     invalidEmail: 'app.common.validation.invalidEmail',
     invalidPhone: 'app.common.validation.invalidPhone',
   };
   ```

---

## Part 2: URL Input Component

### 2.1 Create `UrlInput.svelte`

**File:** `primebrick-fe-v3/src/lib/components/ui/url-input/url-input.svelte`
**File:** `primebrick-fe-v3/src/lib/components/ui/url-input/index.ts`

**Anatomy** (analogous to NumericInput with currency selector):

```
[https:// ▼] [________________________] [copy] [X]
 ↑              ↑                        ↑     ↑
 InputGroupAddon  InputGroupInput       CopyButton  Clear
 (left, Sheet)   (type="url")          (right)     (right)
```

**Props:**

```ts
type Props = WithElementRef<
  Omit<HTMLInputAttributes, "type" | "files"> & {
    value?: string;
    onChange?: (value: string) => void;
    errors?: string[];
    /** Default protocol (from type_config.default_protocol). */
    defaultProtocol?: string;
    /** Allowed protocols (from type_config.allowed_protocols). */
    allowedProtocols?: string[];
    /** Current selected protocol. */
    protocol?: string;
    /** Called when the user changes the protocol via the Sheet panel. */
    onProtocolChange?: (protocol: string) => void;
    /** Called when the user changes the URL value. */
    onClear?: () => void;
  }
>;
```

**Behavior:**

- Left addon: shows the current protocol (e.g. `https://`) with a chevron button. Clicking opens the `config.protocolSelect` Sheet panel (right side, 360px width — same pattern as `config.currencySelect`).
- Input: `<InputGroupInput type="url">`. When the user types a URL without a protocol, the `defaultProtocol` is automatically prepended on blur.
- Right side: `CopyButton` (copies the full URL) + clear button (X icon, clears the input).
- The clear button and copy button only appear when the input has a value (same pattern as `TextInput`).
- The protocol selector is only shown when `onProtocolChange` is provided (same conditional pattern as NumericInput's currency CTA).

**Reuses:**

- `InputGroup`, `InputGroupAddon`, `InputGroupInput`, `InputGroupButton` from `$lib/components/ui/input-group`
- `CopyButton` from `$lib/components/ui/copy-button`
- `X` icon from `@lucide/svelte/icons/x`
- `openSheet` / `closeSheet` from `$lib/shell/sheets/sheet-manager.svelte`
- `inputTrailingIconButtonClasses` from `$lib/components/ui/input/input-chrome`

### 2.2 Create `ProtocolSelectPanel.svelte`

**File:** `primebrick-fe-v3/src/lib/shell/sheets/panels/ProtocolSelectPanel.svelte`

**Anatomy** (analogous to `CurrencySelectPanel.svelte`):

- SheetHeader with title "Select Protocol" and close button
- Search input
- Scrollable list of protocol buttons (http, https, ftp, ftps, redis, rediss, tcp, ws, wss)
- Each button shows the protocol name and a check icon if selected

**Props:**

```ts
interface Props {
  currentProtocol: string;
  onProtocolChange: (protocol: string) => void;
  /** Optional: restrict to a subset of protocols. */
  allowedProtocols?: string[];
}
```

**Data:** The full protocol list is a static constant in the panel (no API call needed):

```ts
const ALL_PROTOCOLS = [
  { id: 'https', label: 'HTTPS' },
  { id: 'http', label: 'HTTP' },
  { id: 'ftp', label: 'FTP' },
  { id: 'ftps', label: 'FTPS' },
  { id: 'redis', label: 'Redis' },
  { id: 'rediss', label: 'Redis (TLS)' },
  { id: 'tcp', label: 'TCP' },
  { id: 'ws', label: 'WebSocket' },
  { id: 'wss', label: 'WebSocket (TLS)' },
];
```

If `allowedProtocols` is provided, only those are shown.

### 2.3 Register Sheet panel

**File:** `primebrick-fe-v3/src/lib/shell/sheets/sheet-manager.svelte.ts`

1. Add `'config.protocolSelect'` to `SheetPanelId` (line 11)
2. Add to `SheetPanelPropsMap` (after line 46):

   ```ts
   'config.protocolSelect': {
     currentProtocol: string;
     onProtocolChange: (protocol: string) => void;
     allowedProtocols?: string[];
   };
   ```

**File:** `primebrick-fe-v3/src/lib/shell/sheets/SheetHost.svelte`

Add `'config.protocolSelect': ProtocolSelectPanel` to the panel registry.

### 2.4 Wire URL type in ConfigValueInput

**File:** `primebrick-fe-v3/src/lib/components/config-list/ConfigValueInput.svelte`

Replace the current `url` branch (lines 389-403) with:

```svelte
{:else if type === 'url'}
  <UrlInput
    {type_config}
    bind:value={localValue}
    errors={errors}
    {onChange}
    onClear={() => handleInput()}
    data-testid={`config-input-url-${fieldKey}`}
  />
```

The component reads `default_protocol` and `allowed_protocols` from `type_config` via `parseTypeConfig()`.

---

## Part 3: EMAIL Input Component

### 3.1 Create `EmailInput.svelte`

**File:** `primebrick-fe-v3/src/lib/components/ui/email-input/email-input.svelte`
**File:** `primebrick-fe-v3/src/lib/components/ui/email-input/index.ts`

**Anatomy:**

```
[________________________] [copy] [X]
 ↑                          ↑     ↑
 Input (type="email")      CopyButton  Clear
```

No left selector (unlike URL and PHONE).

**Props:**

```ts
type Props = WithElementRef<
  Omit<HTMLInputAttributes, "type" | "files"> & {
    value?: string;
    onChange?: (value: string) => void;
    errors?: string[];
    onClear?: () => void;
  }
>;
```

**Behavior:**

- Input: `<Input type="email">` — on mobile shows the `@` key prominently.
- Right side: `CopyButton` + clear button (X icon), same pattern as `TextInput` but always editable (not readonly-only).
- Validation is handled by the BE `validateType()` and FE Zod builder (email regex).

**Reuses:**

- `Input` from `$lib/components/ui/input`
- `CopyButton` from `$lib/components/ui/copy-button`
- `X` icon from `@lucide/svelte/icons/x`
- `inputTrailingIconButtonClasses` from `$lib/components/ui/input/input-chrome`

### 3.2 Wire EMAIL type in ConfigValueInput

**File:** `primebrick-fe-v3/src/lib/components/config-list/ConfigValueInput.svelte`

Add a new branch before the `text/json` fallback:

```svelte
{:else if type === 'email'}
  <EmailInput
    bind:value={localValue}
    errors={errors}
    {onChange}
    onClear={() => handleInput()}
    data-testid={`config-input-email-${fieldKey}`}
  />
```

---

## Part 4: PHONE Input Component

### 4.1 Install `libphonenumber-js`

```bash
cd primebrick-fe-v3
pnpm add libphonenumber-js@1.13.12
```

**Note:** Pin exact version per package-versioning rule. Verify with `pnpm view libphonenumber-js version` before installing.

### 4.2 Create phone helpers

**File:** `primebrick-fe-v3/src/lib/phone/phone-helpers.ts`
**File:** `primebrick-fe-v3/src/lib/phone/index.ts`

**API:**

```ts
export interface PhonePrefixInfo {
  /** ISO 3166-1 alpha-2 country code, e.g. "IT", "US". */
  country: string;
  /** Country name from countries-list. */
  name: string;
  /** Country native name from countries-list. */
  native: string;
  /** Calling code, e.g. "+39", "+1". */
  prefix: string;
  /** Flag emoji derived from country code. */
  flag: string;
}

/** Get all phone prefixes from countries-list data. */
export function getAllPhonePrefixes(): PhonePrefixInfo[];

/** Get phone prefix info for a specific country code. */
export function getPhonePrefixInfo(country: string): PhonePrefixInfo | null;

/** Default country for a given UI language (e.g. "it-IT" → "IT"). */
export function defaultCountryForLang(lang: string): string;

/** Format a phone number as the user types (AsYouType formatter). */
export function formatPhoneAsYouType(input: string, country: string): string;

/** Format a complete phone number in international format. */
export function formatPhoneInternational(value: string, country: string): string;

/** Validate a phone number for a given country. */
export function isValidPhone(value: string, country: string): boolean;

/** Parse a phone number and return the E.164 value. */
export function parsePhone(value: string, country: string): string | null;
```

**Implementation details:**

- `getAllPhonePrefixes()`: iterates `countries-list` countries via `getCountryData()`, extracts `phone` array (some countries have multiple codes — use the first), maps to `PhonePrefixInfo`. Sorted alphabetically by country name.
- `formatPhoneAsYouType()`: uses `new AsYouType(country)` from `libphonenumber-js`, calls `.input(text)`, returns the formatted string.
- `formatPhoneInternational()`: uses `parsePhoneNumber(value, country)` → `.formatInternational()`.
- `isValidPhone()`: uses `parsePhoneNumber(value, country)` → `.isValid()`.
- `parsePhone()`: uses `parsePhoneNumber(value, country)` → `.number` (E.164).
- `flag`: derived from country code using the regional indicator symbol trick:
  ```ts
  country.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)))
  ```

### 4.3 Create `PhonePrefixSelectPanel.svelte`

**File:** `primebrick-fe-v3/src/lib/shell/sheets/panels/PhonePrefixSelectPanel.svelte`

**Anatomy** (analogous to `CurrencySelectPanel.svelte`):

- SheetHeader with title "Select Country Code" and close button
- Search input (search by country name, code, or prefix)
- Scrollable list of country buttons:
  - Left: flag emoji + country code (e.g. 🇮🇹 IT)
  - Center: country name
  - Right: prefix (e.g. +39)
  - Check icon if selected
- Favorites support (same pattern as CurrencySelectPanel — reads `phone_country_favorites` config entry if it exists, otherwise no favorites section)

**Props:**

```ts
interface Props {
  currentCountry: string;
  onCountryChange: (country: string) => void;
  /** Optional: restrict to a subset of countries. */
  allowedCountries?: string[];
}
```

### 4.4 Create `PhoneInput.svelte`

**File:** `primebrick-fe-v3/src/lib/components/ui/phone-input/phone-input.svelte`
**File:** `primebrick-fe-v3/src/lib/components/ui/phone-input/index.ts`

**Anatomy:**

```
[🇮🇹 +39 ▼] [________________________] [copy] [X]
 ↑              ↑                        ↑     ↑
 InputGroupAddon  InputGroupInput       CopyButton  Clear
 (left, Sheet)   (type="tel")          (right)     (right)
```

**Props:**

```ts
type Props = WithElementRef<
  Omit<HTMLInputAttributes, "type" | "files"> & {
    value?: string;
    onChange?: (value: string) => void;
    errors?: string[];
    /** Current country code (from type_config.country). */
    country?: string;
    /** Called when the user changes the country via the Sheet panel. */
    onCountryChange?: (country: string) => void;
    onClear?: () => void;
  }
>;
```

**Behavior:**

- Left addon: shows flag emoji + prefix (e.g. 🇮🇹 +39) with a chevron button. Clicking opens the `config.phonePrefixSelect` Sheet panel.
- Input: `<InputGroupInput type="tel">`. As the user types, `formatPhoneAsYouType()` formats the number with spaces and grouping (e.g. `333 123 4567`).
- The stored value is E.164 format (e.g. `+393331234567`). The display value is the formatted international form. Conversion happens on input (parse) and on display (format).
- Right side: `CopyButton` (copies the E.164 value) + clear button (X icon).
- The country selector is only shown when `onCountryChange` is provided (same conditional pattern as NumericInput's currency CTA).

**Reuses:**

- `InputGroup`, `InputGroupAddon`, `InputGroupInput`, `InputGroupButton` from `$lib/components/ui/input-group`
- `CopyButton` from `$lib/components/ui/copy-button`
- `X` icon from `@lucide/svelte/icons/x`
- `openSheet` / `closeSheet` from `$lib/shell/sheets/sheet-manager.svelte`
- `inputTrailingIconButtonClasses` from `$lib/components/ui/input/input-chrome`
- `getAllPhonePrefixes`, `formatPhoneAsYouType`, `formatPhoneInternational` from `$lib/phone`

### 4.5 Register Sheet panel

**File:** `primebrick-fe-v3/src/lib/shell/sheets/sheet-manager.svelte.ts`

1. Add `'config.phonePrefixSelect'` to `SheetPanelId`
2. Add to `SheetPanelPropsMap`:

   ```ts
   'config.phonePrefixSelect': {
     currentCountry: string;
     onCountryChange: (country: string) => void;
     allowedCountries?: string[];
   };
   ```

**File:** `primebrick-fe-v3/src/lib/shell/sheets/SheetHost.svelte`

Add `'config.phonePrefixSelect': PhonePrefixSelectPanel` to the panel registry.

### 4.6 Wire PHONE type in ConfigValueInput

**File:** `primebrick-fe-v3/src/lib/components/config-list/ConfigValueInput.svelte`

Add a new branch:

```svelte
{:else if type === 'phone'}
  <PhoneInput
    {type_config}
    bind:value={localValue}
    errors={errors}
    {onChange}
    onCountryChange={onTypeConfigChange ? handleCountryChange : undefined}
    onClear={() => handleInput()}
    data-testid={`config-input-phone-${fieldKey}`}
  />
```

The `handleCountryChange` function updates `type_config.country` (same pattern as `handleCurrencyChange` for money).

---

## Part 5: TIME — Extend DateWheelPicker

### 5.1 Add `timeOnly` prop to DateWheelPicker

**File:** `primebrick-fe-v3/src/lib/components/date-dropper/date-wheel-picker.svelte`

**Changes:**

1. Add `timeOnly = false` to props (line 25):

   ```ts
   let {
     value = $bindable(),
     placeholder = $t("app.common.selectDate"),
     includeTime = false,
     timeOnly = false,        // NEW
     defaultTime = undefined,
     timezone = $bindable()
   } = $props();
   ```

2. Update `df` (DateFormatter, line 29) — when `timeOnly`, use only time style:

   ```ts
   let df = $derived(
     new DateFormatter(
       $uiLang,
       timeOnly
         ? { timeStyle: "medium" }
         : includeTime
           ? { dateStyle: "long", timeStyle: "medium" }
           : { dateStyle: "long" }
     )
   );
   ```

3. Update `activeTab` (line 27) — when `timeOnly`, default to `"time"`:

   ```ts
   let activeTab = $derived(timeOnly ? "time" : "date");
   ```

4. Update the popover rendering (lines 239-366):
   - When `timeOnly`: render ONLY the time wheel picker (no Tabs, no date wheels, no timezone dropdown — time-only doesn't need timezone)
   - When `includeTime && !timeOnly`: render the existing Tabs layout (date + time tabs)
   - When `!includeTime && !timeOnly`: render the existing date-only wheel picker

5. Update value construction (lines 175-183, 200-208):
   - When `timeOnly`: build value as a time string `HH:MM:SS` (not `CalendarDateTime`)
   - The `value` prop for time-only mode is a plain string like `"14:30:00"`

6. Update `getInitialTime()` (lines 45-62) — when `timeOnly`, always initialize from `defaultTime` or `now()`:

   ```ts
   function getInitialTime() {
     if (defaultTime) {
       const [hours, minutes, seconds] = defaultTime.split(":").map(Number);
       return {
         hour: hours.toString().padStart(2, "0"),
         minute: minutes.toString().padStart(2, "0"),
         second: (seconds || 0).toString().padStart(2, "0")
       };
     } else if (includeTime || timeOnly) {
       const currentTime = now(getLocalTimeZone());
       return {
         hour: currentTime.hour.toString().padStart(2, "0"),
         minute: currentTime.minute.toString().padStart(2, "0"),
         second: currentTime.second.toString().padStart(2, "0")
       };
     }
     return { hour: "00", minute: "00", second: "00" };
   }
   ```

7. Update sync from value (lines 141-145) — when `timeOnly`, parse the time string directly:

   ```ts
   if (timeOnly && typeof value === 'string' && value.includes(':')) {
     const [h, m, s] = value.split(':');
     selectedHour = h;
     selectedMinute = m;
     selectedSecond = (s || '00');
   }
   ```

### 5.2 Wire TIME type in ConfigValueInput

**File:** `primebrick-fe-v3/src/lib/components/config-list/ConfigValueInput.svelte`

Replace the current `time` branch (lines 357-371) with:

```svelte
{:else if type === 'time'}
  <div class="w-full">
    <DateWheelPicker
      bind:value={localValue}
      timeOnly={true}
      placeholder={$t('app.common.selectTime')}
    />
    {#if firstError}
      <p class="text-xs text-destructive mt-1">{translatedError}</p>
    {/if}
  </div>
```

Remove the "Save" button — the DateWheelPicker already has a "Done" button in its footer.

---

## Part 6: Min/Max Alignment for All String-Derived Types

### 6.1 FE ValidationRulesSection — show Min/Max only for applicable types

**File:** `primebrick-fe-v3/src/lib/components/config-builder/ValidationRulesSection.svelte`

Update the type guards (lines 22-24):

```ts
const isNumericType = $derived(type === 'bigint' || type === 'number' || type === 'money');
const isStringType = $derived(type === 'string' || type === 'text' || type === 'secret' || type === 'url' || type === 'email' || type === 'phone');
const isUrlType = $derived(type === 'url');
const isEmailType = $derived(type === 'email');
const isPhoneType = $derived(type === 'phone');
const supportsMinMax = $derived(isNumericType || isStringType);
```

Wrap the Min/Max section (lines 192-302) in:

```svelte
{#if supportsMinMax}
  <!-- existing Min/Max block -->
{/if}
```

### 6.2 FE TypeConfigBuilder — update STRING_TYPES

**File:** `primebrick-fe-v3/src/lib/components/config-builder/TypeConfigBuilder.svelte` (lines 9-11)

```ts
const STRING_TYPES: ReadonlySet<ConfigEntryType> = new Set([
  'string', 'text', 'secret', 'url', 'json', 'email', 'phone',
]);
```

### 6.3 FE config-validation.ts — update Zod builder

**File:** `primebrick-fe-v3/src/lib/validation/config-validation.ts`

1. Add `email` and `phone` to the base type validation (after line 78):
   ```ts
   } else if (type === 'email') {
     schema = schema.refine((val) => {
       if (!val) return true;
       return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
     }, { message: 'app.common.validation.invalidEmail' });
   } else if (type === 'phone') {
     // Full validation via libphonenumber-js — same logic as SDK
     const parsedConfig = parseTypeConfig(type_config);
     const country = parsedConfig?.country;
     schema = schema.refine((val) => {
       if (!val) return true;
       try {
         const phoneNumber = country
           ? parsePhoneNumber(val, country as any)
           : parsePhoneNumber(val);
         return phoneNumber?.isValid() ?? false;
       } catch {
         return false;
       }
     }, { message: 'app.common.validation.invalidPhone' });
   }
   ```
   **Note:** Import `parsePhoneNumber` from `libphonenumber-js` and `parseTypeConfig` from `$lib/config/type-config-schema` at the top of the file. The FE uses the same library and same logic as the SDK — zero incongruenza.

2. Add `email` and `phone` to min/max (lines 89, 94, 110, 116):
   ```ts
   if (type === 'bigint' || type === 'number' || type === 'money') {
     // numeric min
   } else {
     // string length min (applies to string, text, secret, url, email, phone, json)
     schema = schema.min(minVal, { message: minMsg });
   }
   ```

3. Remove the `rules.email` block (lines 137-143) — email is now a TYPE.

4. Add `email` and `phone` to the `rules.regex` block (line 146):
   ```ts
   if (rules.regex && (type === 'string' || type === 'text' || type === 'secret' || type === 'url' || type === 'email' || type === 'phone')) {
   ```

### 6.4 FE ValidationRulesSection — remove email switch, add email/phone to regex

**File:** `primebrick-fe-v3/src/lib/components/config-builder/ValidationRulesSection.svelte`

1. Remove the "Email format validation" switch block (lines 361-377) — email is now a TYPE, not a rule.

2. Update the regex section guard (line 380) to include `email` and `phone`:
   ```svelte
   {#if isStringType}
     <!-- regex section -->
   {/if}
   ```
   (Already covered since `isStringType` now includes `email` and `phone`.)

3. Remove the URL protocols section (lines 304-359) — protocols are now in `type_config.allowed_protocols`, managed by the UrlInput component and ProtocolSelectPanel. The builder should have a "URL Configuration" section in `WidgetConfigSection` instead (see Part 7).

---

## Part 7: WidgetConfigSection Updates

### 7.1 Add URL configuration section

**File:** `primebrick-fe-v3/src/lib/components/config-builder/WidgetConfigSection.svelte`

Add a URL configuration section (analogous to the money currency section):

```svelte
{:else if type === 'url'}
  <div class="space-y-4">
    <h4 class="text-sm font-semibold text-muted-foreground">{$t('system.settings.config.typeConfig.urlConfig')}</h4>
    <div class="space-y-1">
      <Label for="tcb-default-protocol">{$t('system.settings.config.typeConfig.defaultProtocol')}</Label>
      <ComboSelect
        mode="single"
        value={builder.defaultProtocol ?? 'https'}
        onChange={handleDefaultProtocolChange}
        options={protocolOptions}
        valueField="id"
        labelField="label"
        placeholder="https"
        data-testid="tcb-default-protocol"
      />
    </div>
    <div class="space-y-1">
      <Label for="tcb-allowed-protocols">{$t('system.settings.config.typeConfig.allowedProtocols')}</Label>
      <ComboSelect
        mode="multi"
        value={builder.allowedProtocols ?? ['https']}
        onChange={handleAllowedProtocolsChange}
        options={protocolOptions}
        valueField="id"
        labelField="label"
        placeholder={$t('app.common.selectValue')}
        data-testid="tcb-allowed-protocols"
      />
    </div>
  </div>
```

### 7.2 Add PHONE configuration section

**File:** `primebrick-fe-v3/src/lib/components/config-builder/WidgetConfigSection.svelte`

Add a phone configuration section (analogous to the money currency section):

```svelte
{:else if type === 'phone'}
  <div class="space-y-4">
    <h4 class="text-sm font-semibold text-muted-foreground">{$t('system.settings.config.typeConfig.phoneConfig')}</h4>
    <div class="space-y-1">
      <Label for="tcb-default-country">{$t('system.settings.config.typeConfig.defaultCountry')}</Label>
      <ComboSelect
        mode="single"
        value={builder.country ?? 'IT'}
        onChange={handleCountryChange}
        options={countryOptions}
        valueField="country"
        labelField="label"
        placeholder="IT"
        data-testid="tcb-default-country"
      />
    </div>
    <div class="space-y-1">
      <Label for="tcb-allowed-countries">{$t('system.settings.config.typeConfig.allowedCountries')}</Label>
      <ComboSelect
        mode="multi"
        value={builder.allowedCountries ?? []}
        onChange={handleAllowedCountriesChange}
        options={countryOptions}
        valueField="country"
        labelField="label"
        placeholder={$t('app.common.selectValue')}
        data-testid="tcb-allowed-countries"
      />
    </div>
  </div>
```

Where `countryOptions` comes from `getAllPhonePrefixes()` mapped to `{ country, label: \`${flag} ${name} (+${prefix})\` }`.

### 7.3 Update type-config-builder.svelte.ts

**File:** `primebrick-fe-v3/src/lib/config/type-config-builder.svelte.ts`

Add mutators for URL and phone config:

```ts
function setDefaultProtocol(protocol: string) { ... }
function setAllowedProtocols(protocols: string[]) { ... }
function setCountry(country: string) { ... }
function setAllowedCountries(countries: string[]) { ... }
```

And derived getters:

```ts
get defaultProtocol() { ... }
get allowedProtocols() { ... }
get country() { ... }
get allowedCountries() { ... }
```

---

## Part 8: Config Create Page — Type Dropdown

### 8.1 Add `email` and `phone` to the type dropdown

**File:** `primebrick-fe-v3/src/routes/(app)/system/settings/security/create/+page.svelte` (lines 39-55)

```ts
const configTypeOptions: Array<{ value: string; label: string }> = [
  { value: 'string', label: 'String' },
  { value: 'text', label: 'Text' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'bigint', label: 'BigInt' },
  { value: 'number', label: 'Number' },
  { value: 'money', label: 'Money' },
  { value: 'badge', label: 'Badge' },
  { value: 'single_select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },     // NEW
  { value: 'phone', label: 'Phone' },     // NEW
  { value: 'secret', label: 'Secret' },
  { value: 'json', label: 'JSON' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'DateTime' },
  { value: 'time', label: 'Time' },
];
```

---

## Part 9: Backend — Config Entries Router & DAL

### 9.1 Update BE config-entries.router.ts

**File:** `primebrick-be-v3/src/modules/auth/routers/config-entries.router.ts`

No changes needed — the router already uses `validateConfigValue()` from the SDK, which will handle the new types once the SDK is updated.

### 9.2 Update BE auth_configurations_dal.ts

**File:** `primebrick-be-v3/src/modules/auth/auth_configurations_dal.ts`

No changes needed — the DAL is generic and stores `type` as a string.

### 9.3 Rebuild and reinstall SDK

After updating the SDK source:

```bash
cd primebrick-v3-sdk
pnpm run build
# Bump version (patch)
# Publish to npm (or link locally for testing)

cd ../primebrick-be-v3
pnpm update @primebrick/sdk
```

---

## Part 10: Translations

### 10.1 New translation keys

Add these `system.*` keys to all 6 language seed files + fire-and-forget patch:

| Key | en-GB | it-IT |
|-----|-------|-------|
| `system.settings.config.typeConfig.urlConfig` | URL Configuration | Configurazione URL |
| `system.settings.config.typeConfig.defaultProtocol` | Default protocol | Protocollo predefinito |
| `system.settings.config.typeConfig.allowedProtocols` | Allowed protocols | Protocolli consentiti |
| `system.settings.config.typeConfig.phoneConfig` | Phone Configuration | Configurazione Telefono |
| `system.settings.config.typeConfig.defaultCountry` | Default country | Paese predefinito |
| `system.settings.config.typeConfig.allowedCountries` | Allowed countries | Paesi consentiti |
| `system.settings.config.protocolSelect.title` | Select Protocol | Seleziona Protocollo |
| `system.settings.config.protocolSelect.searchPlaceholder` | Search protocols... | Cerca protocolli... |
| `system.settings.config.protocolSelect.noResults` | No protocols found | Nessun protocollo trovato |
| `system.settings.config.phonePrefixSelect.title` | Select Country Code | Seleziona Prefisso Internazionale |
| `system.settings.config.phonePrefixSelect.searchPlaceholder` | Search country or code... | Cerca paese o prefisso... |
| `system.settings.config.phonePrefixSelect.noResults` | No countries found | Nessun paese trovato |
| `system.settings.config.phonePrefixSelect.favorites` | Favorites | Preferiti |
| `system.settings.config.phonePrefixSelect.allCountries` | All countries | Tutti i paesi |

### 10.2 New `app.*` keys (FE fallback + BE seeds)

| Key | en-GB fallback |
|-----|----------------|
| `app.common.validation.invalidPhone` | Invalid phone number |
| `app.common.validation.invalidEmail` | Invalid email address |
| `app.common.selectTime` | Select time |

### 10.3 Deprecate old keys

Mark these as deprecated (keep in DB for backward compat, don't use in FE):

- `system.settings.config.typeConfig.emailValidation` — replaced by TYPE `email`
- `system.settings.config.typeConfig.emailValidationHelp` — replaced by TYPE `email`
- `system.settings.config.typeConfig.urlProtocols` — replaced by `type_config.allowed_protocols`

---

## Part 11: Documentation Updates

### 11.1 BE AGENTS.md — Config Table Standard

**File:** `primebrick-be-v3/AGENTS.md` (lines 166-183)

Update the config types table:

| Type | FE widget | BE validation |
|------|-----------|---------------|
| `string` | text input | none |
| `text` | textarea | none |
| `boolean` | switch | must be `"true"` or `"false"` |
| `bigint` | numeric input | must be an integer (coerced to JS `BigInt`) |
| `number` | numeric input | must be a number (coerced to JS `Number`) |
| `money` | numeric input + currency symbol | must be a number (amount is JS `Number`, currency in `type_config`) |
| `badge` | ComboSelect (inline values from `type_config.values`) | must be in `type_config.values` |
| `single_select` | ComboSelect (options from `type_config.api_url` or `values_source`) | none (validated by the BE catalog code) |
| `multi_select` | ComboSelect multi (options from `type_config.api_url` or `values_source`) | none |
| `url` | UrlInput (protocol selector + copy + clear) | must be a valid URL; protocols validated against `type_config.allowed_protocols` |
| `email` | EmailInput (copy + clear) | must be a valid email (RFC 5322 simplified) |
| `phone` | PhoneInput (country prefix selector + copy + clear) | must be a valid E.164 phone number |
| `secret` | password input (masked) | none (empty string = "leave unchanged") |
| `json` | textarea | must be valid JSON |
| `date` | DateWheelPicker | none (format validated by FE) |
| `datetime` | DateWheelPicker (includeTime) | none (format validated by FE) |
| `time` | DateWheelPicker (timeOnly) | none (format validated by FE) |

Add `type_config` JSON shapes for `url` and `phone`:

```json
// url
{ "default_protocol": "https", "allowed_protocols": ["http", "https"] }

// phone
{ "country": "IT", "allowed_countries": ["IT", "US", "GB"] }
```

### 11.2 FE AGENTS.md — Config components

**File:** `primebrick-fe-v3/AGENTS.md`

Add a "Config Input Components" section documenting the new components:

```markdown
## Config Input Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `UrlInput` | URL input with protocol selector (left) + copy + clear (right) | `value`, `defaultProtocol`, `allowedProtocols`, `protocol`, `onProtocolChange`, `onChange`, `onClear` |
| `EmailInput` | Email input with copy + clear (right) | `value`, `onChange`, `onClear` |
| `PhoneInput` | Phone input with country prefix selector (left) + copy + clear (right) | `value`, `country`, `onCountryChange`, `onChange`, `onClear` |

### Use cases

#### URL config entry
```svelte
<UrlInput
  type_config={JSON.stringify({ default_protocol: 'https', allowed_protocols: ['http', 'https', 'redis'] })}
  bind:value
  onChange={handleSave}
/>
```

#### Email config entry
```svelte
<EmailInput
  bind:value
  onChange={handleSave}
/>
```

#### Phone config entry
```svelte
<PhoneInput
  type_config={JSON.stringify({ country: 'IT', allowed_countries: ['IT', 'US'] })}
  bind:value
  onCountryChange={handleCountryChange}
  onChange={handleSave}
/>
```
```

### 11.3 FE docs/ai/i18n.md

**File:** `primebrick-fe-v3/docs/ai/i18n.md`

Update with the new translation keys listed in Part 10.

### 11.4 FE .devin/rules/ — new rule file

**File:** `primebrick-fe-v3/.devin/rules/config-input-components.md`

Document the config input component registry, when to use each, and the props API.

### 11.5 FE docs/user-guide/ — new MDX file

**File:** `primebrick-fe-v3/docs/user-guide/config-input-components.mdx`

User-facing documentation with use cases and code snippets for each component.

---

## Part 12: SDK Tests

### 12.1 Update SDK config-validator tests

**File:** `primebrick-v3-sdk/src/config/__tests__/config-validator.test.ts`

Add test cases for:

- `email` type: valid email, invalid email, empty email (with/without required)
- `phone` type: valid phone with country (e.g. `+393331234567` with `country: "IT"`), invalid phone (wrong length for country), empty phone (with/without required), phone without country (E.164 auto-detect)
- `url` type with `type_config.allowed_protocols`: protocol in list, protocol not in list
- `email` and `phone` with min/max length rules
- `email` and `phone` with regex rules
- Backward compat: `rules.email` on `string` type still works (deprecated but functional)

---

## Implementation Order

1. **SDK — Fix pre-existing incongruenze (Part 0)** — Align error keys to `app.common.validation.*`, port FE number regex to SDK, fix `rules.url`/`rules.email`/`rules.regex` type guards and behavior
2. **SDK — New types (Part 1)** — Add `email`/`phone` to `ConfigType`, add `libphonenumber-js` dependency, add `phone`/`url` type_config shapes, update validator with full phone validation, update tests, build, bump version
3. **FE — Fix pre-existing incongruenze (Part 0)** — Fix bigint min/max to use `BigInt()`, fix `rules.regex` to throw on invalid pattern, add type guards for `rules.url`/`rules.email`/`rules.regex`, add all `app.common.validation.*` keys to `en-GB-fallback.json`
4. **BE** — Reinstall SDK, update AGENTS.md config types table, update init SQL seed translations
5. **FE — New components (Parts 2-5)** — Install `libphonenumber-js`, create phone helpers, create components (UrlInput, EmailInput, PhoneInput), create Sheet panels (ProtocolSelectPanel, PhonePrefixSelectPanel), register panels, extend DateWheelPicker, update ConfigValueInput, update ValidationRulesSection, update WidgetConfigSection, update type-config-builder, update config-validation.ts, update create page dropdown
6. **FE translations** — Add all new keys to BE seed files + fire-and-forget patch + FE fallback for `app.*` keys
7. **Documentation** — Update AGENTS.md (BE + FE), i18n.md, Devin rules, user guide
8. **Verification** — `svelte-check`, `vitest`, SDK tests, BE tests, manual smoke test

---

## Acceptance Criteria

### Part 0 — Pre-existing incongruenze fixes

- [ ] SDK `validateType()` for `number`/`money` uses regex `/^-?\d*\.?\d+$/` (same as FE), not `isNaN(Number(value))`
- [ ] FE Zod builder for `bigint` min/max uses `BigInt()` comparison, not `Number()`
- [ ] SDK error keys all use `app.common.validation.*` prefix (no more `validation.*` keys)
- [ ] FE `en-GB-fallback.json` contains all `app.common.validation.*` keys as fallback
- [ ] `rules.url` type guard is `type === "url"` only (both FE and SDK)
- [ ] `rules.email` block removed from both FE and SDK (email is a TYPE now)
- [ ] `rules.regex` throws on invalid pattern in both FE and SDK (no silent skip)
- [ ] `rules.regex` type guard is `string, text, secret, url, email, phone` (both FE and SDK, aligned)
- [ ] `new URL()` confirmed working with non-web protocols (redis:, pg:, tcp:, ws:, rediss:, ftp:, mailto:)

### Part 1+ — New types and components

- [ ] `email` and `phone` are valid `ConfigType` values in the SDK
- [ ] SDK `validateConfigValue()` validates `email` (regex) and `phone` (full `libphonenumber-js` validation with country from `type_config`)
- [ ] SDK `validateConfigValue()` validates `url` protocols from `type_config.allowed_protocols`
- [ ] `rules.email` is deprecated but still works for backward compat
- [ ] `rules.url` is deprecated but still works for backward compat
- [ ] FE `UrlInput` component renders with protocol selector (left) + copy + clear (right)
- [ ] FE `EmailInput` component renders with copy + clear (right)
- [ ] FE `PhoneInput` component renders with country prefix selector (left) + copy + clear (right)
- [ ] FE `PhoneInput` auto-formats phone numbers using `libphonenumber-js` AsYouType
- [ ] FE `ProtocolSelectPanel` Sheet panel works (search, select, close)
- [ ] FE `PhonePrefixSelectPanel` Sheet panel works (search, favorites, select, close)
- [ ] FE `DateWheelPicker` supports `timeOnly` prop (hides date wheels, shows only time wheels)
- [ ] FE `ConfigValueInput` renders the correct component for each type
- [ ] FE `ValidationRulesSection` shows Min/Max only for types that support it
- [ ] FE `ValidationRulesSection` no longer shows email switch (email is a TYPE)
- [ ] FE `ValidationRulesSection` no longer shows URL protocols section (moved to WidgetConfigSection)
- [ ] FE `WidgetConfigSection` shows URL configuration (default protocol, allowed protocols)
- [ ] FE `WidgetConfigSection` shows PHONE configuration (default country, allowed countries)
- [ ] FE config create page dropdown includes `email` and `phone`
- [ ] All new translation keys exist in all 6 languages (en-GB, it-IT, fr-FR, es-ES, de-DE, pt-PT)
- [ ] `app.*` keys have English fallback in `en-GB-fallback.json`
- [ ] `system.*` keys are NOT in `en-GB-fallback.json`
- [ ] BE AGENTS.md config types table includes `email` and `phone`
- [ ] FE AGENTS.md documents the new components with use cases
- [ ] FE `.devin/rules/config-input-components.md` exists and documents the component registry
- [ ] FE `docs/user-guide/config-input-components.mdx` exists with user-facing docs
- [ ] `svelte-check` passes with 0 errors
- [ ] `vitest` passes (all existing tests + new tests if added)
- [ ] SDK tests pass
- [ ] Redis cache invalidated after SQL translation updates
