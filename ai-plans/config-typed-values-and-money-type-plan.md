# Plan: Config Typed Values + Money Type

## 1. Objective

Convert config values from opaque strings to properly typed values (BigInt / Number) at the BE layer before sending to the FE, rename the `integer` type to `bigint` and keep `number` as `number`, and add a new `money` config type with locale-aware masked input, currency selector, and Intl formatting.

### Type rename summary

| Old type | New type | JS type | DB storage | BE response (ext-json) |
|----------|----------|---------|------------|------------------------|
| `integer` | `bigint` | `bigint` | TEXT (string) | JSON number → reviver → FE receives `bigint` |
| `number` | `number` | `number` | TEXT (string) | JSON number → FE receives `number` |
| (new) | `money` | `number` | TEXT (amount string) + `type_config.currency` (ISO 4217) | JSON number (amount) + currency in `type_config` JSON |

### Money is a rendering concern, not a wire type

Money is NOT a composite wire-level type. It is two separate primitive values — an amount (number) and a currency code (string ISO 4217) — that are rendered together by FE components. This is exactly parallel to how IANA DateTime works in the codebase:

- **IANA DateTime**: `some_date` (timestamptz) + `some_date_tz` (VARCHAR IANA name) — two separate columns, linked by `datetimeIanaToggle.recordIanaField` in column metadata. No composite wire type.
- **Money (config)**: `value` (TEXT → coerced to number) + `type_config` JSON `{"currency":"EUR"}` — amount and currency in the same config row, currency stored in type_config.
- **Money (entity, future)**: `revenue` (NUMERIC → number) + `revenue_currency_code` (VARCHAR(3)) — two separate columns, linked by column metadata like `moneyCurrencyField.recordCurrencyField` (parallel to `datetimeIanaToggle.recordIanaField`).

**No `Money` class. No `__money` wire tag. No ext-json changes for Money.** The ext-json changes in this plan are ONLY for BigInt (which IS a primitive type that needs wire-level handling).

The FE `MoneyInput` component takes `amount: number` and `currency: string` as separate props and combines them for display. The BE coerces `value` to `number` for money type (same as `number` type) and the currency travels in `type_config` JSON.

### Breaking change policy

This is a **breaking change**. No backward-compat aliases. All layers updated simultaneously:
- DB: fire-and-forget patch renames `integer` → `bigint` in existing rows
- Setup/initial scripts updated
- SDK, BE, FE, US: all references to `integer` changed to `bigint`
- Agent and user docs updated

## 2. Empirical context (verified)

### ConfigType definition (single source of truth)

**SDK** `primebrick-v3-sdk/src/config/iconfig-entity.ts` lines 40-53:
```ts
export type ConfigType =
  | "string" | "text" | "boolean" | "integer" | "number"
  | "badge" | "list" | "url" | "secret" | "json"
  | "date" | "datetime" | "time";
```

**FE** `primebrick-fe-v3/src/lib/api-types.ts` lines 82-95 mirrors this:
```ts
export type ConfigEntryType =
  | 'string' | 'text' | 'boolean' | 'integer' | 'number'
  | 'badge' | 'list' | 'url' | 'secret' | 'json'
  | 'date' | 'datetime' | 'time';
```

### SDK config validator

`primebrick-v3-sdk/src/config/config-validator.ts`:
- Line 177-180: `case "integer":` regex `/^-?\d+$/`
- Line 182-185: `case "number":` `isNaN(Number(value))`
- Lines 105-128: min/max comparison uses `Number(value)` for both `integer` and `number`

### SDK config loader

`primebrick-v3-sdk/src/config/config-loader.ts`:
- `get(key)` returns `string | null` — raw TEXT from DB
- `getTyped<T>(key, converter)` — consumer provides converter (e.g. `parseInt`, `parseFloat`)
- `requireTyped<T>(key, converter)` — same but throws if missing

### BE config router

`primebrick-be-v3/src/modules/auth/routers/config-entries.router.ts`:
- `CreateBodySchema` (line 103): `value: z.string()`, `type: z.string().min(1).max(50)`, `type_config: z.string().nullable().optional()`
- `UpdateBodySchema` (line 84): `value: z.string()`, `version: z.number().int().min(1)`
- `maskSecretValue()` (line 62): transforms entity row → FE-facing JSON, currently passes `value` through as-is (string)
- Create handler (line 143): validates with `validateConfigValue`, then `dal.add()` with raw string value
- Update handler (line 189): validates with `validateConfigValue`, then `dal.update()` with raw string value
- Bulk update handler (line 242): same pattern, `dal.bulkUpdate()` with `{ id, value: string }`

### BE config DAL wrapper

`primebrick-be-v3/src/modules/auth/auth_configurations_dal.ts` (BE-layer wrapper, NOT the pure DAL):
- `add()` (line 88): accepts `{ value: string, type: string, type_config?: string | null, ... }`
- `update()` (line 166): accepts `(uuid, value: string, updatedBy)` — only updates `value`, NOT `type_config` or `type`
- `bulkUpdate()` (line 205): accepts `Array<{ id: bigint; value: string }>` — only updates `value`

**Important distinction**: This is NOT the pure DAL. The pure DAL is `Repository` from `@primebrick/dal-pg` — its `update()` method (line 661 of `repository.ts`) accepts `Partial<Record<keyof TEntity, unknown>>`, meaning it can update ANY column on ANY entity. The pure DAL is already generic and needs no changes.

The limitation is in the BE-layer wrapper `AuthConfigurationsDal`, which chose to hardcode `{ id, value }` in its `update()` method. This was a BE-layer design choice, not a DAL constraint.

**Why this is a problem**: `type` and `type_config` are legitimate fields that can change:
- Changing a config from `number` to `money` requires updating `type` + `type_config`
- Changing the currency in a money config requires updating `type_config`
- The current `update()` signature makes these operations impossible without a full delete + re-create

The BE wrapper must be updated to accept `type`, `type_config`, and `value` in `update()` and `bulkUpdate()`. The pure DAL (`Repository.update()`) already supports this — no DAL changes needed.

### BE config-repo (read-time conversion)

`primebrick-be-v3/src/modules/auth/config-repo.ts`:
- `loadAuthConfigFromDb()` (line 68): reduces rows to `Record<string, string | null>`, then does TYPE conversions for specific fields:
  - Line 148: `enable_webauthn === "true"` → boolean
  - Line 151-153: `parseInt(settings.mfa_challenge_token_ttl_seconds, 10)` → number
- This is the existing pattern for string → typed conversion at read time

### BE entity

`primebrick-be-v3/src/modules/auth/auth_configuration_entity.ts`:
- `value` column (line 48): `@Column({ nullable: true }) value?: string` — TEXT
- `type` column (line 52): `@Column({ length: 50, nullable: false }) type: string`
- `type_config` column (line 56): `@Column({ nullable: true }) type_config?: string | null`

### FE config value input

`primebrick-fe-v3/src/lib/components/config-list/ConfigValueInput.svelte`:
- Line 208: `{#if type === 'integer' || type === 'number'}` → renders `<Input type="number" bind:value={localValue}>`
- Line 140: `handleBlur()` converts `number` back to string: `typeof localValue === 'number' ? String(localValue) : localValue`
- All other types use string `localValue`

### FE create page

`primebrick-fe-v3/src/routes/(app)/system/settings/security/create/+page.svelte`:
- Lines 36-50: `configTypeOptions` array — hardcoded list of `{ value, label }` pairs, includes `{ value: 'integer', label: 'Integer' }` and `{ value: 'number', label: 'Number' }`
- Line 285-291: `ConfigValueInput` receives `type={$form.type as ConfigEntryType}`, `type_config={$form.type_config || null}`, `bind:value={$form.value}`

### FE i18n / lang

`primebrick-fe-v3/src/lib/i18n/store.svelte.ts`:
- `uiLang` writable store, type `UiLang`
- `setUiLang(next)` persists to `sessionStorage`

`primebrick-fe-v3/src/lib/i18n/languages.ts`:
- `UI_LANGS = ['en-GB', 'en-US', 'it-IT', 'fr-FR', 'es-ES', 'de-DE', 'pt-PT']`
- `uiLangRegionSuffix(tag)` → extracts region (e.g. `it-IT` → `IT`)

`primebrick-fe-v3/src/lib/i18n/date-format.ts`:
- `formatUiDate(input, lang)` — cached `Intl.DateTimeFormat` per locale
- `formatUiDateTime(input, lang)` — same pattern
- `formatListCellValue(column, raw, lang)` — dispatches by `column.type`
- This is the pattern to mirror for money formatting

### FE ext-json (BigInt handling)

`primebrick-fe-v3/src/lib/api-ext.ts`:
- `extJsonParse()` — reviver forces ALL integers to `bigint`
- `apiFetchExt()` — fetch + ext-json parse
- Already used for responses containing bigint values (IDs, totals)
- FE does NOT depend on SDK — has its own `json-bigint` instance + reviver
- **Must be extended** with `extJsonStringify` for request bodies (BigInt-safe via json-bigint). No Money-specific changes needed — Money is not a wire type.

### SDK ext-json (BigInt handling)

`primebrick-v3-sdk/src/json/ext-json.ts`:
- `extJsonStringify(data)` — delegates to `jsonBigInstance.stringify(data)` (no pre-processing)
- `extJsonParse(text)` — reviver: `typeof value === "number" && Number.isInteger(value)` → `BigInt(value)`
- `extJsonMiddleware()` — replaces `res.json()` with `extJsonStringify`
- Used by BE (Express middleware) and US (NATS codec via NatsClient)
- **No changes needed** — the existing BigInt reviver is sufficient. Money is not a wire type (amount is a plain number, currency is in type_config).

### FE SearchBar (dropdown prepend pattern)

`primebrick-fe-v3/src/lib/components/entity-list-table/toolbar/SearchBar.svelte`:
- Uses `InputGroup` + `InputGroupAddon` + `InputGroupButton`
- Right-side button opens a sheet via `openSheet()` with checkbox list
- This is the pattern for the currency selector CTA

### BE export (existing currency handling)

`primebrick-be-v3/src/lib/export/types.ts`:
- `ExportFieldMetadata.type` includes `'currency'`
- `currencyField?: string` — points to another field holding the ISO code

`primebrick-be-v3/src/lib/export/helpers.ts`:
- `formatHtmlCurrency(value, locale, currencyCode, precision)` — uses `Intl.NumberFormat` with `style: 'currency'`
- `getExcelCurrencyPattern(locale, currencyCode, precision)` — generates Excel format pattern

`primebrick-be-v3/src/lib/export/index.ts` lines 406-416:
- `case 'currency':` reads `currencyField` from record, falls back to `'EUR'`, calls `formatHtmlCurrency`

### DB seed/patch files with `integer` type

**Init patch** `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql` line 582:
```sql
('mfa_challenge_token_ttl_seconds', '300', 'integer', '{"validation":...}', ...),
```

**Fire-and-forget** `primebrick-be-v3/db-meta/fire-and-forget/add_config_table_standard_columns.sql`:
- Line 172: `UPDATE ... SET "type" = 'integer'` (invitation_expiry_days)
- Line 207: `UPDATE ... SET "type" = 'integer'` (mfa_challenge_token_ttl_seconds)

### countries-list package

- NOT currently used in any Primebrick repo (verified via grep)
- npm: `countries-list`
- Main import: `countries`, `getCountryData(code)` — country → currency code
- Currency subpath: `import { currencies, getCurrency } from 'countries-list/currencies'`
  - `getCurrency('EUR')` → `{ code, name, symbol, symbolNative, numeric, decimals }`
  - `currencies` — full ISO 4217 map
- Country → currency: `getCountryData('IT').currency` → `'EUR'`
- Lang → country: region suffix from `UiLang` (e.g. `it-IT` → `IT`)
- **Will be added as a dependency of BOTH the SDK and the FE** — each has its own copy of the currency helpers. The SDK is Node.js-only (Express, NATS, `json-bigint`) and the FE is SvelteKit/browser — the FE cannot import from the SDK. This is an established architectural constraint. Both copies are structurally identical but independent. A future `@primebrick/shared` package could eliminate the duplication, but that's a separate refactor.
  - **SDK copy**: `primebrick-v3-sdk/src/currency/currency-helpers.ts` — for BE + US reuse (e.g. BE export pipeline can replace hardcoded `formatHtmlCurrency` / `getExcelCurrencyPattern`)
  - **FE copy**: `primebrick-fe-v3/src/lib/i18n/money-format.ts` — for FE components (`MoneyInput`, `ConfigValueInput`, `ConfigListRow`)

## 3. Implementation plan

### Phase 1: SDK — type rename + money type + typed coercion

#### 3.1.1 `primebrick-v3-sdk/src/config/iconfig-entity.ts`

Rename `integer` → `bigint` in `ConfigType` and add `money`:

```ts
export type ConfigType =
  | "string" | "text" | "boolean" | "bigint" | "number" | "money"
  | "badge" | "list" | "url" | "secret" | "json"
  | "date" | "datetime" | "time";
```

Add `ConfigTypeMoneyConfig` interface for `type_config` of money rows:

```ts
/** type_config shape for `money` config type. */
export interface ConfigTypeMoneyConfig {
  /** ISO 4217 currency code, e.g. "EUR", "USD". Set by user, stored in type_config. */
  currency: string;
  /** Optional: restrict selectable currencies. If absent, all ISO 4217 codes are allowed. */
  allowed_currencies?: string[];
}
```

Update `ConfigValidationRules` — min/max for `bigint` needs to accept `bigint | number`:

```ts
export interface ValidationRuleMin {
  value: number | bigint;
  error_label_key: string;
}
```
(same for `ValidationRuleMax`)

#### 3.1.2 `primebrick-v3-sdk/src/config/config-validator.ts`

- Rename `case "integer":` → `case "bigint":` (keep same regex `/^-?\d+$/`)
- `case "number":` stays the same
- Add `case "money":` — validate as number (`isNaN(Number(value))`)
- Update min/max comparison:
  - For `bigint`: use `BigInt(value)` for comparison, compare against `BigInt(rules.min.value)`
  - For `number` / `money`: use `Number(value)` (existing behavior)
- Export a new `coerceConfigValue(type, value, type_config?)` function:

```ts
/**
 * Coerce a raw string config value to its native JS type.
 * Returns the typed value for BE→FE response shaping.
 * - bigint → native bigint
 * - number → native number
 * - money → native number (amount only; currency is in type_config, not in the value)
 * - all others → string as-is
 */
export function coerceConfigValue(
  type: ConfigType,
  value: string | null,
  type_config?: string | null,
): string | number | bigint | null {
  if (value === null) return null;
  switch (type) {
    case "bigint":
      return BigInt(value);
    case "number":
    case "money":
      return Number(value);
    default:
      return value;
  }
}
```

Export a new `serializeConfigValue(type, value)` for FE→BE submission:

```ts
/**
 * Serialize a typed value back to string for DB storage.
 * - bigint → String(value)
 * - number → String(value)
 * - string → value
 */
export function serializeConfigValue(
  type: ConfigType,
  value: string | number | bigint,
): string {
  if (typeof value === "bigint") return String(value);
  if (typeof value === "number") return String(value);
  return value;
}
```

#### 3.1.3 (removed — no Money class needed)

Money is a rendering concern, not a wire type. No `Money` class, no `__money` tag. See §1 "Money is a rendering concern" for the rationale.

#### 3.1.4 `primebrick-v3-sdk/src/json/ext-json.ts` — NO changes needed for Money

The existing ext-json reviver already handles BigInt (forces all integers to `bigint`). No Money-specific changes are needed — Money is not a wire type. The amount travels as a JSON number (coerced to `number` by the existing reviver for floats), and the currency travels as a string in `type_config` JSON.

**The only ext-json change in this plan is on the FE side** (§3.3.2) — adding `extJsonStringify` to the FE so it can send `bigint` values in request bodies (currently `JSON.stringify` throws on bigint).

#### 3.1.5 New file: `primebrick-v3-sdk/src/currency/currency-helpers.ts` — currency metadata + formatting

The SDK owns the currency helpers for BE and US reuse (Node.js consumers). The FE has its own independent copy — it cannot import from the SDK (SDK is Node.js-only). Both copies are structurally identical.

```ts
import { getCurrency, currencies } from "countries-list/currencies";
import { getCountryData } from "countries-list";

/** ISO 4217 currency metadata. */
export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  symbolNative: string;
  numeric: string;
  decimals: number;
}

/** Get ISO 4217 metadata for a currency code. Returns null for unknown codes. */
export function getCurrencyInfo(code: string): CurrencyInfo | null {
  const raw = getCurrency(code);
  if (!raw) return null;
  return {
    code: raw.code,
    name: raw.name,
    symbol: raw.symbol,
    symbolNative: raw.symbolNative,
    numeric: raw.numeric,
    decimals: raw.decimals,
  };
}

/** Get the currency symbol for a currency code (e.g. "EUR" → "€"). */
export function currencySymbol(code: string): string {
  return getCurrencyInfo(code)?.symbol ?? code;
}

/** Get the number of decimal places for a currency code (e.g. "EUR" → 2, "JPY" → 0). */
export function currencyDecimals(code: string): number {
  return getCurrencyInfo(code)?.decimals ?? 2;
}

/** Get the full list of ISO 4217 currencies (for currency selector dropdowns). */
export function getAllCurrencies(): CurrencyInfo[] {
  return Object.values(currencies).map((raw) => ({
    code: raw.code,
    name: raw.name,
    symbol: raw.symbol,
    symbolNative: raw.symbolNative,
    numeric: raw.numeric,
    decimals: raw.decimals,
  }));
}

/**
 * Derive the default currency code from a locale string.
 * Uses the region suffix: "it-IT" → "IT" → getCountryData("IT").currency → "EUR".
 * Falls back to "EUR" for unknown locales.
 */
export function defaultCurrencyForLang(lang: string): string {
  const region = lang.split("-")[1];
  if (!region) return "EUR";
  const country = getCountryData(region.toUpperCase());
  return country?.currency ?? "EUR";
}

/**
 * Format a numeric amount as a localized currency string.
 * Uses Intl.NumberFormat with the currency's native decimal precision.
 * Returns empty string for null/undefined/empty values.
 */
export function formatMoney(
  amount: number | null | undefined,
  lang: string,
  currency: string,
): string {
  if (amount === null || amount === undefined || amount === 0 && !amount) return "";
  const decimals = currencyDecimals(currency);
  return new Intl.NumberFormat(lang, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
```

**New file** `primebrick-v3-sdk/src/currency/index.ts`:
```ts
export * from "./currency-helpers.js";
```

**Update** `primebrick-v3-sdk/package.json`:
- Add `countries-list` as a dependency (pin exact version — check `pnpm view countries-list version` first)

#### 3.1.6 Update `primebrick-v3-sdk/src/index.ts`

Export `coerceConfigValue`, `serializeConfigValue`, `ConfigTypeMoneyConfig`.

Also re-export the currency helpers from the main entry point:
```ts
export * from "./currency/index.js";
```

This allows BE/US consumers to `import { formatMoney, currencySymbol, defaultCurrencyForLang } from "@primebrick/sdk"`. The FE does NOT import from here — it has its own copy.

#### 3.1.7 SDK tests

Update `primebrick-v3-sdk/src/config/__tests__/config-validator.test.ts`:
- Rename all `integer` test cases to `bigint`
- Add `money` type validation tests
- Add `coerceConfigValue` / `serializeConfigValue` round-trip tests

**No new ext-json test file needed** — Money is not a wire type, so there are no Money-specific ext-json tests. The existing `ext-json.test.ts` already covers BigInt round-trip.

**New file** `primebrick-v3-sdk/src/currency/__tests__/currency-helpers.test.ts`:
- `getCurrencyInfo("EUR")` → `{ code: "EUR", name: "Euro", symbol: "€", decimals: 2, ... }`
- `getCurrencyInfo("JPY")` → `{ code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0, ... }`
- `getCurrencyInfo("XXX")` → `null` (unknown code)
- `currencySymbol("EUR")` → `"€"`
- `currencySymbol("USD")` → `"$"`
- `currencySymbol("JPY")` → `"¥"`
- `currencySymbol("XXX")` → `"XXX"` (fallback to code)
- `currencyDecimals("EUR")` → `2`
- `currencyDecimals("JPY")` → `0`
- `currencyDecimals("XXX")` → `2` (fallback)
- `defaultCurrencyForLang("it-IT")` → `"EUR"`
- `defaultCurrencyForLang("en-US")` → `"USD"`
- `defaultCurrencyForLang("en-GB")` → `"GBP"`
- `defaultCurrencyForLang("ja-JP")` → `"JPY"`
- `defaultCurrencyForLang("xx-XX")` → `"EUR"` (fallback)
- `defaultCurrencyForLang("it")` → `"EUR"` (no region suffix → fallback)
- `formatMoney(1234.56, "it-IT", "EUR")` → `"1.234,56 €"` (Italian formatting)
- `formatMoney(1234.56, "en-US", "USD")` → `"$1,234.56"` (US formatting)
- `formatMoney(1234.56, "en-GB", "GBP")` → `"£1,234.56"` (UK formatting)
- `formatMoney(0, "it-IT", "EUR")` → `"0,00 €"`
- `formatMoney(null, "it-IT", "EUR")` → `""`
- `formatMoney(undefined, "it-IT", "EUR")` → `""`
- `formatMoney(1000, "ja-JP", "JPY")` → `"￥1,000"` (no decimals for JPY)
- `getAllCurrencies()` → array with at least 150 entries, each with `code`, `name`, `symbol`, `decimals`

### Phase 2: BE — type rename + typed response + money + DAL update

#### 3.2.1 `primebrick-be-v3/src/modules/auth/routers/config-entries.router.ts`

**`maskSecretValue()`** — extend to coerce value by type. For `money` type, `coerceConfigValue` returns a `number` (the amount), same as `number` type:

```ts
import { coerceConfigValue, ConfigType } from "@primebrick/sdk";

function maskSecretValue(row: AuthConfigurationEntity): Record<string, unknown> {
  return {
    uuid: row.uuid,
    key: row.key,
    // Coerce value from string to native type:
    // - bigint → bigint (ext-json serializes as JSON number → FE reviver → bigint)
    // - number → number (JSON number)
    // - money → number (JSON number; currency is in type_config, not in the value)
    // - all others → string as-is
    value: coerceConfigValue(row.type as ConfigType, row.value ?? null, row.type_config),
    type: row.type,
    type_config: row.type_config ?? null,
    // ... rest unchanged
  };
}
```

The BE `extJsonMiddleware` (already installed globally) will call `extJsonStringify` which serializes `bigint` as JSON numbers. Money values are plain numbers on the wire — no special handling needed.
```

**`CreateBodySchema`** — accept typed values:

```ts
const CreateBodySchema = z.object({
  key: z.string().min(1).max(100),
  // Accept typed values: string (most types), number (number/money), bigint (bigint)
  value: z.union([z.string(), z.number(), z.bigint()]),
  type: z.string().min(1).max(50),
  type_config: z.string().nullable().optional(),
  // ... rest unchanged
});
```

In the create handler, serialize the value back to string before DAL insert:

```ts
import { serializeConfigValue } from "@primebrick/sdk";

const stringValue = serializeConfigValue(body.type as ConfigType, body.value);

// For money type: type_config already contains the currency (sent by FE as JSON string)
// No special handling needed — type_config is stored as-is
const typeConfig = body.type_config ?? null;

// validate the STRING form (validator expects strings)
validateConfigValue(body.type as ConfigType, typeConfig ?? undefined, stringValue, body.key);
// DAL stores string value + type_config with currency
const row = await dal.add({ ...body, value: stringValue, type_config: typeConfig }, userUuid);
```

**`UpdateBodySchema`** — accept typed value + optional `type` and `type_config` (for type changes and money currency changes):

```ts
const UpdateBodySchema = z.object({
  value: z.union([z.string(), z.number(), z.bigint()]),
  type: z.string().min(1).max(50).optional(),        // optional: allow type change
  type_config: z.string().nullable().optional(),      // optional: allow type_config change (e.g. currency)
  version: z.number().int().min(1),
});
```

In the update handler, serialize the value and pass the partial update to the DAL:

```ts
const stringValue = serializeConfigValue(existing.type as ConfigType, body.value);

// Build the partial update — only include fields that are present
const dalUpdates: { value?: string; type?: string; type_config?: string | null } = {};
dalUpdates.value = stringValue;
if (body.type !== undefined) dalUpdates.type = body.type;
if (body.type_config !== undefined) dalUpdates.type_config = body.type_config;

// Validate using the EFFECTIVE type (body.type if changing, otherwise existing.type)
const effectiveType = (body.type ?? existing.type) as ConfigType;
const effectiveTypeConfig = body.type_config ?? existing.type_config;
validateConfigValue(effectiveType, effectiveTypeConfig ?? undefined, stringValue, existing.key);

try {
  await dal.update(uuid as string, dalUpdates, userUuid);
} catch (err) {
  if (err instanceof ReservedConfigTypeError) {
    throw new ApiError(
      "/errors/reserved-config-type-cannot-be-changed",
      "Reserved config type cannot be changed",
      403,
      err.message,
      { key: err.key, internal_code: err.internal_code }
    );
  }
  throw err;
}
```

**`BulkUpdateBodySchema`** — same pattern per item. Each item includes `value` + optional `type` + optional `type_config` + `version`. The bulk update handler wraps `dal.bulkUpdate()` in the same `ReservedConfigTypeError` → `ApiError(403)` catch.

#### 3.2.2 `primebrick-be-v3/src/modules/auth/auth_configurations_dal.ts` (BE wrapper, NOT the pure DAL)

**The pure DAL (`Repository.update()` from `@primebrick/dal-pg`) already accepts `Partial<Record<keyof TEntity, unknown>>` — it can update any column. No DAL changes needed.**

The BE-layer wrapper `AuthConfigurationsDal` artificially restricted `update()` to only `value`. This must be fixed — `type` and `type_config` are legitimate updatable fields (e.g. changing a config from `number` to `money`, or changing the currency in `type_config`).

**`update()`** — accept a partial payload with `value`, `type`, and `type_config`. Enforce the `reserved` business rule: reserved rows can only have `value` updated, NOT `type` or `type_config`:

```ts
async update(
  uuid: string,
  updates: { value?: string; type?: string; type_config?: string | null },
  updatedBy: string,
): Promise<void> {
  const existing = await this.findByUuid(uuid);
  if (!existing) throw new Error(`Auth config row with uuid ${uuid} not found`);

  // secret: empty string = "leave unchanged" → skip write
  if (existing.type === "secret" && updates.value === "") {
    return;
  }

  // Business rule: reserved rows are system-critical. Their value is editable,
  // but their type and type_config CANNOT be changed (that would break the
  // system contract). Non-reserved rows can change type + type_config freely.
  if (existing.reserved && (updates.type !== undefined || updates.type_config !== undefined)) {
    throw new ReservedConfigTypeError(existing.key);
  }

  // Build the partial update payload — only include fields that are present
  const updateData: Record<string, unknown> = { id: existing.id };
  if (updates.value !== undefined) updateData.value = updates.value;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.type_config !== undefined) updateData.type_config = updates.type_config;

  await this.repo.update(AuthConfigurationEntity, updateData, { actor: updatedBy });
  await this.reloadCache();
}
```

**`bulkUpdate()`** — same `reserved` check per item:

```ts
async bulkUpdate(
  updates: Array<{ id: bigint; value?: string; type?: string; type_config?: string | null }>,
  updatedBy: string,
): Promise<void> {
  if (updates.length === 0) return;

  // Fetch existing rows to check reserved flag before building the update batch
  const existingRows = await this.repo.findMany(AuthConfigurationEntity, {
    id: In(updates.map((u) => u.id)),
  });
  const existingById = new Map(existingRows.map((r) => [r.id, r]));

  const updateBatch: Record<string, unknown>[] = [];
  for (const u of updates) {
    const existing = existingById.get(u.id);
    if (!existing) throw new Error(`Auth config row with id ${u.id} not found`);

    // Same reserved business rule as single update
    if (existing.reserved && (u.type !== undefined || u.type_config !== undefined)) {
      throw new ReservedConfigTypeError(existing.key);
    }

    const row: Record<string, unknown> = { id: u.id };
    if (u.value !== undefined) row.value = u.value;
    if (u.type !== undefined) row.type = u.type;
    if (u.type_config !== undefined) row.type_config = u.type_config;
    updateBatch.push(row);
  }

  await this.repo.updateMany(AuthConfigurationEntity, updateBatch, {
    actor: updatedBy,
    matchBy: "id",
  });
  await this.reloadCache();
}
```

**New error class** (alongside the existing `ReservedConfigError`):

```ts
/**
 * Error thrown when attempting to change type or type_config on a reserved config row.
 * Reserved rows are system-critical: their value is editable, but their type and
 * type_config cannot be changed (that would break the system contract).
 */
export class ReservedConfigTypeError extends Error {
  readonly key: string;
  readonly internal_code = "reserved_config_type_cannot_be_changed";

  constructor(key: string) {
    super(`Config key "${key}" is reserved: type and type_config cannot be changed`);
    this.name = "ReservedConfigTypeError";
    this.key = key;
  }
}
```

**Note on the pure DAL**: `Repository.update()` and `Repository.updateMany()` already accept `Partial<Record<keyof TEntity, unknown>>`. The BE wrapper was the bottleneck, not the DAL. The DAL stays pure — it doesn't know or care about config types, `type_config` JSON semantics, money, or the `reserved` flag. It just writes columns. The `reserved` business rule is enforced in the BE wrapper, same as the existing `ReservedConfigError` for delete operations.

#### 3.2.3 `primebrick-be-v3/src/modules/auth/config-repo.ts`

- Line 151-153: change `parseInt(settings.mfa_challenge_token_ttl_seconds, 10)` → `Number(settings.mfa_challenge_token_ttl_seconds)` (since type is now `bigint`, but TTL fits in safe integer range — use `Number()` for arithmetic safety)
- Update any `=== "integer"` checks to `=== "bigint"`

#### 3.2.4 BE fire-and-forget migration patch

Create `primebrick-be-v3/db-meta/fire-and-forget/rename_integer_to_bigint_config_type.sql`:

```sql
-- Rename config type 'integer' → 'bigint' (breaking change, typed values refactor)
UPDATE "public"."auth_configurations" SET "type" = 'bigint' WHERE "type" = 'integer';
```

Follow the existing fire-and-forget patch conventions (check `db-meta/fire-and-forget/` for naming pattern).

#### 3.2.5 BE init patch update

Update `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql` line 582:
- Change `'integer'` → `'bigint'` for `mfa_challenge_token_ttl_seconds`

Update `primebrick-be-v3/db-meta/fire-and-forget/add_config_table_standard_columns.sql`:
- Line 172: `'integer'` → `'bigint'`
- Line 207: `'integer'` → `'bigint'`

**Note**: Changing the init patch changes its SHA256. Follow the BE's patch SHA256 management rules — create a fire-and-forget patch to update the recorded SHA256, or follow whatever the BE repo's `.devin/rules/patch-sha256-management.md` specifies.

#### 3.2.6 BE OpenAPI

Update `primebrick-be-v3/src/openapi/openapi.ts` — any references to `'integer'` config type → `'bigint'`, add `'money'`.

### Phase 3: FE — type rename + typed values + money input + formatter

#### 3.3.1 `primebrick-fe-v3/src/lib/api-types.ts`

```ts
export type ConfigEntryType =
  | 'string' | 'text' | 'boolean' | 'bigint' | 'number' | 'money'
  | 'badge' | 'list' | 'url' | 'secret' | 'json'
  | 'date' | 'datetime' | 'time';

export type ConfigValue = string | number | bigint | null;

export type ConfigEntry = {
  uuid: string;
  key: string;
  value: ConfigValue;
  type: ConfigEntryType;
  type_config?: string | null;
  // ... rest unchanged
};
```

Note: `ConfigValue` does NOT include a `Money` type. For money config entries, `value` is a `number` (the amount) and `currency` is in `type_config` JSON.

#### 3.3.1b (removed — no Money class needed)

Money is a rendering concern. The FE `MoneyInput` component takes `amount: number` and `currency: string` as separate props. No `Money` class is needed on the FE side.

#### 3.3.2 Update `primebrick-fe-v3/src/lib/api-ext.ts` — ext-json stringify (BigInt-safe)

**Problem**: The FE currently uses `JSON.stringify` for ALL request bodies. `JSON.stringify` throws `TypeError: Do not know how to serialize a BigInt` when it encounters a bigint. Today this works because config values are sent as strings (`value: "300"`). But if we want the FE to send typed values (native bigint), we need `extJsonStringify` on the FE side.

**Solution**: Add `extJsonStringify` to `api-ext.ts`. The reviver should ONLY handle BigInt (existing behavior). The `extJsonStringify` should ONLY handle BigInt (via json-bigint, which already does this). No Money-specific changes are needed — Money is not a wire type.

```ts
/** Parse ext-json (BigInt reviver — existing behavior, no Money handling). */
export function extJsonParse<T = unknown>(text: string): T {
  return jsonBigInstance.parse(text, (_key, value) => {
    // Force all integer numbers to bigint (existing behavior)
    if (typeof value === "number" && Number.isInteger(value)) {
      return BigInt(value);
    }
    return value;
  }) as T;
}

/** Serialize ext-json (BigInt-safe via json-bigint). */
export function extJsonStringify(data: unknown): string {
  return jsonBigInstance.stringify(data);
}
```

Note: `extJsonStringify` is still needed for BigInt support in request bodies. It just doesn't need Money tagging.

**Centralize in `apiFetch` — not per-call-site**:

Instead of changing ~30 call sites from `JSON.stringify` to `extJsonStringify`, intercept the body inside `apiFetch` itself. This is the single fetch wrapper used by ALL FE API calls. The BE already does this symmetrically with `extJsonMiddleware` on the response side.

```ts
// src/lib/api.ts
import { extJsonStringify } from './api-ext';

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = requestUrlString(input);
  // ... existing URL/SSR logic ...

  const nextInit: RequestInit = init ? { ...init } : {};
  nextInit.credentials = 'include';

  // ─── Ext-JSON body serialization ─────────────────────────────
  // If the body is a plain object and Content-Type is JSON, serialize
  // with extJsonStringify (BigInt-safe) instead of
  // leaving it to the caller. This is symmetric with the BE's
  // extJsonMiddleware on responses. Callers can still pass a pre-
  // stringified body (string) to bypass this — useful for SSE, custom
  // formats, or when the body is already a string.
  if (
    nextInit.body !== undefined &&
    nextInit.body !== null &&
    typeof nextInit.body === "object" &&
    !Array.isArray(nextInit.body)
  ) {
    nextInit.body = extJsonStringify(nextInit.body);
    // Ensure Content-Type is set (callers often set it, but be safe)
    if (!nextInit.headers) nextInit.headers = {};
    if (!(nextInit.headers as Record<string, string>)["Content-Type"] &&
        !(nextInit.headers as Record<string, string>)["content-type"]) {
      (nextInit.headers as Record<string, string>)["Content-Type"] = "application/json";
    }
  }

  // ... rest of apiFetch unchanged ...
}
```

**Why this is safe for ALL existing calls**:
- `extJsonStringify` uses `json-bigint` with `useNativeBigInt: true`. For payloads with no bigint, the output is byte-identical to `JSON.stringify`.
- `json-bigint` handles all standard JSON types (string, number, boolean, null, object, array) correctly.
- The only behavioral difference: `bigint` values are serialized as JSON numbers (instead of throwing).
- Callers that pass a pre-stringified `body` (string, not object) are not touched — the `typeof === "object"` check skips them.
- SSE and custom-format calls pass string bodies — unaffected.

**Call sites MUST be simplified**: All existing `body: JSON.stringify(payload)` calls MUST be changed to `body: payload` (raw object). `apiFetch` handles serialization centrally — there is no reason for call sites to pre-stringify. This eliminates ~30 `JSON.stringify` calls across the FE codebase and makes the intent clearer: pass the data, let the transport layer serialize it. The `typeof body === "string"` skip in `apiFetch` remains as a safety net for SSE/custom-format calls that genuinely need pre-stringified bodies, but normal API calls pass raw objects.

**Performance**: `extJsonStringify` uses `json-bigint` stringify (which is slightly slower than native `JSON.stringify` due to the bigint detection regex). For typical FE request bodies (small JSON objects), this is negligible (< 1ms). The BE already pays this cost on every response via `extJsonMiddleware`.

The FE does not have a `Money` class or interface. Money config values are represented as `number` (amount) in `value` + `string` (currency) in `type_config` JSON. The `MoneyInput` component combines them for display.

#### 3.3.3 `primebrick-fe-v3/src/lib/validation/config-validation.ts`

- Rename `type === 'integer'` → `type === 'bigint'` in `buildConfigValueSchema`
- Add `type === 'money'` — same regex as `number` (`/^-?\d*\.?\d+$/`)
- The Zod schema still operates on strings (the value is converted to string before validation)

#### 3.3.4 Install `countries-list` (FE direct dependency)

The FE cannot import from `@primebrick/sdk` (SDK is Node.js-only — Express, NATS, `json-bigint`). The FE has its own independent copy of the currency helpers and installs `countries-list` directly.

```bash
cd primebrick-fe-v3
pnpm add countries-list
```

Pin exact version (check `pnpm view countries-list version` first). This is the same version the SDK pins — both repos use the same `countries-list` version.

#### 3.3.5 New file: `primebrick-fe-v3/src/lib/i18n/money-format.ts` — FE currency helpers (standalone, mirrors SDK)

The FE has its own copy of the currency helpers. This is intentional — the FE and SDK are independent. Both copies are structurally identical. A future `@primebrick/shared` package could eliminate the duplication, but that's a separate refactor.

Mirror the `date-format.ts` pattern:

```ts
import type { UiLang } from './languages';
import { getCurrency, currencies } from 'countries-list/currencies';
import { getCountryData } from 'countries-list';

/** ISO 4217 currency metadata (FE copy — mirrors SDK's CurrencyInfo). */
export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  symbolNative: string;
  numeric: string;
  decimals: number;
}

/** Map UiLang → default ISO 4217 currency code via country. */
export function defaultCurrencyForLang(lang: UiLang): string {
  const region = lang.split('-')[1] ?? '';
  try {
    const country = getCountryData(region as any);
    return country?.currency ?? 'EUR';
  } catch {
    return 'EUR';
  }
}

const currencyFmtCache = new Map<string, Intl.NumberFormat>();

function getCachedCurrencyFmt(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let f = currencyFmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency });
    currencyFmtCache.set(key, f);
  }
  return f;
}

/** Format a number/bigint as a currency string using the user's locale. */
export function formatUiMoney(
  value: number | bigint | string | null | undefined,
  lang: UiLang,
  currency: string,
): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'bigint' ? Number(value) : Number(value);
  if (isNaN(num)) return '';
  return getCachedCurrencyFmt(lang, currency).format(num);
}

/** Get currency symbol for display (e.g. '€', '$'). */
export function currencySymbol(code: string): string {
  try {
    const c = getCurrency(code);
    return c?.symbol ?? code;
  } catch {
    return code;
  }
}

/** Get currency decimals (e.g. EUR=2, JPY=0). */
export function currencyDecimals(code: string): number {
  try {
    const c = getCurrency(code);
    return c?.decimals ?? 2;
  } catch {
    return 2;
  }
}

/** Get all ISO 4217 currencies for the currency selector dropdown. */
export function getAllCurrencies(): CurrencyInfo[] {
  return Object.values(currencies).map((raw) => ({
    code: raw.code,
    name: raw.name,
    symbol: raw.symbol,
    symbolNative: raw.symbolNative,
    numeric: raw.numeric,
    decimals: raw.decimals,
  }));
}
```

#### 3.3.6 New file: `primebrick-fe-v3/src/lib/components/ui/money-input/money-input.svelte`

A new input component with:
- Masked number input (thousand/decimal separators based on `uiLang`)
- Currency selector CTA on the right (InputGroup pattern from SearchBar)
- Currency dropdown opens via `openSheet()` or inline popover with currency list
- Emits `{ value: string, currency: string }` — value is the raw numeric string, currency is the ISO code

Props:
```ts
let {
  value = $bindable(''),
  currency = $bindable('EUR'),
  allowedCurrencies,
  lang,
  errors = [],
  fieldKey = 'field',
  onblur,
}: {
  value: string;
  currency: string;
  allowedCurrencies?: string[];
  lang: UiLang;
  errors?: string[];
  fieldKey?: string;
  onblur?: () => void;
} = $props();
```

Mask logic:
- On input: strip non-numeric chars, parse to number, format with `Intl.NumberFormat` for display
- Keep raw numeric string internally, display formatted string
- On blur: emit raw string via `onblur`

Currency CTA:
- Shows `currencySymbol(currency)` (e.g. '€')
- Click opens a sheet/popover with list of currencies (from `allowedCurrencies` or all ISO 4217)
- Each row shows symbol + code + name
- Selection updates `currency` bindable

#### 3.3.7 Update `primebrick-fe-v3/src/lib/components/config-list/ConfigValueInput.svelte`

- Line 208: change `{#if type === 'integer' || type === 'number'}` → `{#if type === 'bigint' || type === 'number'}`
- Add `{:else if type === 'money'}` branch that renders `<MoneyInput>`
- For `bigint` type: input `type="number"` with `step="1"` (no decimals)
- For `number` type: input `type="number"` with `step="any"` (decimals allowed)
- Handle the incoming typed value: if BE sends `bigint` or `number`, convert to string for `localValue`
- On blur: convert `localValue` back to string, call `notifyChange` (existing pattern)
- **Reserved row handling**: if `entry.reserved === true`, the type selector and currency selector (for money) are disabled. Only the value input is editable. The FE uses the `reserved` flag from the config entry to determine this — no extra API call needed.

Parse `type_config` for money to extract `currency`:

```ts
let moneyConfig = $derived.by<{ currency: string; allowed_currencies?: string[] } | null>(() => {
  if (type !== 'money' || !type_config) return null;
  try {
    return JSON.parse(type_config);
  } catch {
    return null;
  }
});
```

#### 3.3.8 Update FE create page

`primebrick-fe-v3/src/routes/(app)/system/settings/security/create/+page.svelte`:
- Lines 36-50: `configTypeOptions` — rename `'integer'` → `'bigint'`, add `{ value: 'money', label: 'Money' }`
- When type = `money` and `type_config` is empty, auto-populate `type_config` with default currency from `defaultCurrencyForLang($uiLang)`
- The `ConfigValueInput` already receives `type_config` — the money input will read currency from it
- New rows are created with `reserved: false` by default — type and type_config are freely editable on create

#### 3.3.9 Update FE config list display + edit flow

When config value is displayed outside an input (e.g. in a table or read-only view), use `formatUiMoney` for money type. Check `ConfigListRow.svelte` for any read-only display path.

**Edit flow for existing rows**:
- If `entry.reserved === true`: only the `value` input is editable. The type selector and currency selector are disabled (greyed out, not hidden). The FE sends only `{ value }` in the update body — no `type` or `type_config`.
- If `entry.reserved === false`: all fields are editable — value, type, and type_config (currency for money). The FE sends the full update payload.
- The BE enforces this rule regardless (§3.2.2 `ReservedConfigTypeError`), but the FE should reflect it in the UI to avoid confusing 403 errors.

#### 3.3.10 FE ext-json — ensure config endpoints use `apiFetchExt` + simplify all call sites

The FE already uses `apiFetchExt` which parses bigint values. For config entries, ensure the list/detail endpoints use `apiFetchExt` (not plain `res.json()`) so that:
- `bigint` config values are parsed as native `bigint`
- `money` config values are parsed as `number` (the amount; currency is in `type_config` JSON)

Check `src/lib/api.ts` config fetch functions — if they use plain `apiFetch`, switch them to `apiFetchExt`.

**Simplify ALL call sites**: Since `apiFetch` now serializes object bodies with `extJsonStringify` (§3.3.2), all existing `body: JSON.stringify(payload)` calls across the FE codebase MUST be simplified to `body: payload`. There is no reason for call sites to pre-stringify when the transport layer handles it. This is a mechanical change across ~30 call sites:

```ts
// Before (every call site):
body: JSON.stringify(payload)

// After:
body: payload
```

Verified call sites to update (from grep of `body: JSON.stringify` in `src/`):
- `src/lib/api.ts` — 6 call sites (config create/update/bulk-update, service update, etc.)
- `src/routes/(app)/system/settings/email-providers/+page.svelte` — 2 call sites
- `src/lib/sse/create-sse-connection.ts` — 1 call site (SSE — keep as `JSON.stringify` if body is not a plain object, or simplify if it is)
- `src/lib/shell/ai-chat/use-ai-chat.svelte.ts` — 1 call site
- `src/lib/components/auth/PasskeyEnrollment.svelte` — 2 call sites
- `src/lib/components/auth/MfaManagement.svelte` — 1 call site
- `src/lib/components/auth/LoginForm.svelte` — 1 call site
- `src/lib/components/auth/ChangePasswordCard.svelte` — 1 call site
- `src/routes/welcome/+page.svelte` — 4 call sites
- `src/routes/login/+page.svelte` — 1 call site
- `src/routes/(app)/system/settings/profile/+page.svelte` — 1 call site
- `src/lib/composables/useRoleMappings.svelte.ts` — 2 call sites
- `src/lib/components/entity-list-table/dialogs/ChangePasswordDialog.svelte` — 1 call site
- `src/lib/components/entity-list-table/composables/useRowActions.svelte.ts` — 1 call site
- `src/lib/components/auth/PasskeyEnrollmentSection.svelte` — 2 call sites

The `typeof body === "string"` skip in `apiFetch` remains as a safety net for SSE or custom-format calls that genuinely need pre-stringified bodies.

#### 3.3.11 FE→BE BigInt submission

**Current state (verified empirically)**: The FE uses `JSON.stringify` for ALL request bodies. `JSON.stringify` throws `TypeError: Do not know how to serialize a BigInt` on bigint values. Today this works because config values are sent as strings (`value: "300"`). The FE has `extJsonParse` for responses but NO `extJsonStringify` for requests.

**New requirement**: The FE must be able to send:
- `bigint` values (for `bigint` config type) — `JSON.stringify` throws on these
- Plain strings/numbers (for other types, including money) — already works
- Money config values: amount as number in `value` + currency in `type_config` JSON string — already works (no special wire format)

**FE side — centralized in `apiFetch`** (see §3.3.2):

`apiFetch` intercepts object bodies and serializes them with `extJsonStringify` (BigInt-safe via json-bigint). This is symmetric with the BE's `extJsonMiddleware` on responses. All existing `body: JSON.stringify(payload)` calls MUST be simplified to `body: payload` (raw object) — `apiFetch` handles serialization centrally from the start. The `typeof body === "string"` skip remains as a safety net for SSE/custom-format calls, but normal API calls pass raw objects.

```ts
// BigInt config value — apiFetch serializes 42n as "42" (JSON number) via extJsonStringify
body: { value: 42n, version: 1 }  // raw object — apiFetch handles serialization

// Money config value — amount as number, currency in type_config JSON string
body: { value: 1234.56, type: "money", type_config: '{"currency":"EUR"}' }

// String config value — extJsonStringify produces same output as JSON.stringify
body: { value: "hello", version: 1 }
```

`json-bigint` with `useNativeBigInt: true` serializes `bigint` as JSON numbers (e.g. `42n` → `"42"`), so the BE receives a standard JSON number. The BE's body parser must use `extJsonParse` to reconstruct `bigint` from integer JSON numbers — otherwise large values (> 2^53) lose precision.

**BE side — request body parsing**:

The BE currently uses `express.json()` which uses native `JSON.parse` — this produces `number` for all JSON numbers, NOT `bigint`. For large bigint config values, this loses precision.

**Replace `express.json()` with an ext-json body parser** that uses `extJsonParse` (SDK). This reconstructs `bigint` from all integer JSON numbers. This is the same pattern the FE uses centrally in `apiFetch` and the BE uses centrally in `extJsonMiddleware` for responses:

```ts
// In the BE app setup, replace express.json() with ext-json body parser:
import { extJsonParse } from "@primebrick/sdk";

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.headers['content-type']?.includes('application/json')) {
    let raw = '';
    req.on('data', (chunk: Buffer) => raw += chunk.toString());
    req.on('end', () => {
      try {
        req.body = raw ? extJsonParse(raw) : {};
        next();
      } catch (e) {
        next(e);
      }
    });
  } else {
    next();
  }
});
```

With this, the BE route handler receives:
- `body.value` as `bigint` for bigint config type (large values preserved)
- `body.value` as `number` for number/money config type
- `body.value` as `string` for string/secret/url/etc. config types
- `body.type_config` as `string` (JSON string with currency for money type)

No Money reconstruction is needed — the amount is a plain number, the currency is in `type_config`.

### Phase 4: US (microservices) — type rename

#### 3.4.1 Search and replace

Search all `primebrick-us-v3` for:
- `'integer'` as config type → `'bigint'`
- Any `parseInt` usage on config values that should be `BigInt` → update to `BigInt()`
- Any config type comparison `=== 'integer'` → `=== 'bigint'`

#### 3.4.2 ConfigLoader consumers

If any microservice uses `configLoader.getTyped(key, parseInt)` for an `integer` config, change to `getTyped(key, BigInt)` or `getTyped(key, (v) => BigInt(v))`.

#### 3.4.3 NATS ext-json

The SDK's `NatsClient` uses `extJsonStringify` / `extJsonParse` internally for NATS message serialization. No Money-specific handling is needed — Money is not a wire type. If a microservice needs to send monetary data via NATS, it sends the amount as a number and the currency as a separate string field, exactly like any other multi-field value.

### Phase 5: User docs (docs/user-guide/*.mdx)

These are the user-facing developer docs synced to `docs.primebrick.dev` by the docs repo CI.

#### 3.5.1 SDK: `primebrick-v3-sdk/docs/user-guide/config-tables.mdx`

This file documents the config table pattern and type vocabulary. Verified content:
- Lines 70-88: "Type vocabulary (single source of truth)" table lists `integer` and `number` types
- Line 80: `| integer | parseInt(value, 10) | Input type=number | ...`
- Line 81: `| number | parseFloat(value) | Input type=number | ...`
- Line 111: `IConfigEntity` type comment shows `"string" | "boolean" | "integer" | ...`

Updates needed:
- Rename `integer` row → `bigint` in the type vocabulary table
- Update SDK coercion column: `BigInt(value)` instead of `parseInt(value, 10)`
- Update FE widget column: `Input (string-backed, locale-aware)` instead of `Input type=number`
- Add new `money` row: `| money | Number(value) + currency from type_config | MoneyInput | Amount + currency selector. type_config stores { "currency": "EUR" }. |`
- Update the `IConfigEntity` type comment to show `"bigint"` instead of `"integer"` and include `"money"`
- Add a new section "## Money type" documenting:
  - Storage model (amount in `value` TEXT, currency in `type_config` JSON) — two separate values, NOT a composite wire type
  - This is parallel to IANA DateTime (datetime value + IANA timezone name in separate fields, linked by column metadata)
  - No `Money` class, no `__money` wire tag — the amount is a plain JSON number, the currency is a plain JSON string in `type_config`
  - FE input behavior (masked formatting, currency selector CTA)
  - Default currency derivation from app language
  - `type_config` schema: `{ "currency": "EUR", "allowed_currencies": ["EUR", "USD"] }`
- Add a new section "## BigInt type" documenting:
  - Why `bigint` not `integer` (arbitrary precision, no `Number.MAX_SAFE_INTEGER` limit)
  - Wire format (JSON number via ext-json, reconstructed as native `bigint`)
  - FE input limitation (string-backed editing, not `<input type="number">`)
  - Display formatting (locale-aware grouping via `Intl.NumberFormat`)

#### 3.5.2 SDK: `primebrick-v3-sdk/docs/user-guide/ext-json.mdx`

This file documents the ext-json wire format. Verified content:
- Lines 25-33: type mapping table (bigint, number, string, boolean, null)
- Lines 39-49: reviver code example
- Lines 73-95: round-trip type preservation example
- Lines 102-109: Express middleware usage
- Lines 114-118: NATS usage
- Lines 128+: "Not for the frontend" section

Updates needed:
- No Money-specific changes needed — Money is not a wire type. The ext-json documentation should note that Money values (amount + currency) travel as separate primitive values (number + string), not as a composite wire type.
- Update the "Not for the frontend" section to note that the FE has its own `extJsonStringify` + `extJsonParse` in `api-ext.ts` (centralized in `apiFetch`)
- Add a section "## Request body parsing (BE)" documenting the ext-json body parser replacing `express.json()`

#### 3.5.3 BE: `primebrick-be-v3/docs/user-guide/environment-configuration.mdx`

Update any references to config `integer` type → `bigint`, and document the new `money` type if environment configuration references config types.

#### 3.5.4 FE: `primebrick-fe-v3/docs/user-guide/`

Check if any FE user-guide docs reference config types. If a config-list or config-input doc exists, update it with:
- The new `bigint`, `number`, `money` types
- The `MoneyInput` component
- The `formatUiMoney` helper
- The centralized ext-json body serialization in `apiFetch`

### Phase 6: Agent docs (AGENTS.md + .devin/rules/)

These are internal AI agent instructions, NOT synced to the docs site.

#### 3.6.1 SDK: `primebrick-v3-sdk/AGENTS.md`

- Update the ConfigType list in any "Config types" or "Config Table Standard" section
- Rename `integer` → `bigint`, add `money`
- Document that Money is a rendering concern (not a wire type) — amount is a number, currency is in `type_config`
- Document `coerceConfigValue` / `serializeConfigValue` functions
- Update any code examples that show `parseInt` for config values → `BigInt`

#### 3.6.2 BE: `primebrick-be-v3/AGENTS.md`

- Update the "Config Table Standard" section's type vocabulary table
- Rename `integer` → `bigint`, add `money` row
- Document the ext-json body parser (replacing `express.json()`)
- Document that config values are now typed in API responses (bigint/number; money is number + currency in type_config)
- Update any code examples showing `parseInt` on config values

#### 3.6.3 FE: `primebrick-fe-v3/AGENTS.md`

- Update the "Config types" section (referenced in the Config List pages section)
- Rename `integer` → `bigint`, add `money`
- Document the `MoneyInput` component and `formatUiMoney` helper
- Document that `apiFetch` now uses `extJsonStringify` for object bodies (BigInt-safe)
- Document that Money config values are `number` (amount) in `value` + `string` (currency) in `type_config` JSON — no `Money` class or interface
- Update any code examples showing `<Input type="number">` for integer configs

#### 3.6.4 US: `primebrick-us-v3/AGENTS.md`

- Update any config type references
- Rename `integer` → `bigint`, add `money`
- Document that Money is not a wire type — microservices send amount (number) + currency (string) as separate fields

#### 3.6.5 DAL: `primebrick-dal-v3/AGENTS.md`

- No config-specific changes needed (DAL stays pure)
- But if the DAL AGENTS.md mentions config types in any example, update `integer` → `bigint`

### Phase 7: Unit tests

Test infrastructure (verified empirically):
- SDK: vitest, tests in `src/**/__tests__/*.test.ts`
- BE: vitest, tests in `src/modules/**/__tests__/*.test.ts`
- FE: vitest, tests in `src/lib/__tests__/*.test.ts`

#### 3.7.1 SDK unit tests

**Update** `primebrick-v3-sdk/src/config/__tests__/config-validator.test.ts`:
- Rename all `integer` test cases to `bigint`:
  - "rejects non-integer for integer type" → "rejects non-bigint for bigint type"
  - "accepts valid integers" → "accepts valid bigints"
  - Update error label key assertions: `/invalidInteger/` → `/invalidBigint/`
- Add `money` type validation tests:
  - Accepts valid decimal: `"1234.56"` does not throw
  - Rejects non-numeric: `"abc"` throws
  - Rejects empty string when required
  - Min/max validation with `type_config.validation.rules.min/max`
- Add min/max tests for `bigint` type with `bigint` values in rules

**Update** `primebrick-v3-sdk/src/config/__tests__/config-loader.test.ts`:
- Update any test fixtures that use `type: "integer"` → `type: "bigint"`
- Add test: `getTyped` with `BigInt` converter for `bigint` type
- Add test: `getTyped` with `Number` converter for `money` type

**No new ext-json test file needed** — Money is not a wire type, so there are no Money-specific ext-json tests. The existing `ext-json.test.ts` already covers BigInt round-trip.

**New file** `primebrick-v3-sdk/src/config/__tests__/config-coerce.test.ts`:
- `coerceConfigValue("bigint", "42")` → `42n` (bigint)
- `coerceConfigValue("bigint", "-5")` → `-5n`
- `coerceConfigValue("bigint", null)` → `null`
- `coerceConfigValue("number", "3.14")` → `3.14` (number)
- `coerceConfigValue("number", null)` → `null`
- `coerceConfigValue("money", "1234.56", '{"currency":"EUR"}')` → `1234.56` (number)
- `coerceConfigValue("money", "0", '{"currency":"JPY"}')` → `0` (number)
- `coerceConfigValue("money", null)` → `null`
- `coerceConfigValue("money", "100", null)` → `100` (number)
- `coerceConfigValue("string", "hello")` → `"hello"` (string as-is)
- `coerceConfigValue("boolean", "true")` → `"true"` (string as-is, BE config-repo handles boolean)
- `serializeConfigValue("bigint", 42n)` → `"42"`
- `serializeConfigValue("number", 3.14)` → `"3.14"`
- `serializeConfigValue("money", 99.99)` → `"99.99"`
- `serializeConfigValue("string", "hello")` → `"hello"`
- Round-trip: `serializeConfigValue("bigint", coerceConfigValue("bigint", "99999999999999999999"))` → `"99999999999999999999"` (precision preserved)

#### 3.7.2 BE unit tests

**New file** `primebrick-be-v3/src/modules/auth/__tests__/config-entries-router.test.ts`:
- Create config entry with `bigint` type:
  - Send `{ value: 42n, type: "bigint" }` → BE serializes to `"42"` → DAL stores string → response returns `value: 42n`
- Create config entry with `money` type:
  - Send `{ value: 99.99, type: "money", type_config: '{"currency":"EUR"}' }` → BE serializes to `"99.99"` → DAL stores `value: "99.99"`, `type_config: '{"currency":"EUR"}'` → response returns `value: 99.99` (number)
- Update config entry with `bigint` type:
  - Send `{ value: 100n, version: 1 }` → BE serializes to `"100"` → DAL updates
- Update config entry with `money` type + currency change:
  - Send `{ value: 50, type_config: '{"currency":"USD"}', version: 1 }` → BE updates both `value: "50"` and `type_config: '{"currency":"USD"}'`
- Bulk update with mixed types:
  - Send updates with bigint + number (money) + string values → all serialize correctly
- Validation rejection:
  - `bigint` type with decimal value `"3.14"` → 400 validation error
  - `money` type with non-numeric `"abc"` → 400 validation error
- Secret masking still works:
  - `secret` type response has masked value, not the raw secret
- Reserved row type/type_config protection:
  - Update `value` only on a reserved row → succeeds (200)
  - Update `type` on a reserved row → 403 `reserved-config-type-cannot-be-changed`
  - Update `type_config` on a reserved row → 403 `reserved-config-type-cannot-be-changed`
  - Update `type` + `type_config` on a non-reserved row → succeeds (200)
  - Bulk update: mix of reserved (value-only) + non-reserved (type change) → succeeds
  - Bulk update: reserved row with type change → 403, entire batch rejected

**New file** `primebrick-be-v3/src/modules/auth/__tests__/config-ext-json-body.test.ts`:
- Ext-json body parser reconstructs `bigint` from JSON integer: `{"value": 42}` → `req.body.value` is `42n`
- Ext-json body parser handles plain numbers: `{"value": 99.99}` → `req.body.value` is `99.99` (number)
- Ext-json body parser handles plain strings: `{"value": "hello"}` → `req.body.value` is `"hello"`
- Ext-json body parser handles nested objects with bigint: `{"data": {"id": 42}}` → `req.body.data.id` is `42n`
- Empty body → `req.body` is `{}`
- Non-JSON content-type → body not parsed (passes through)

**Update** `primebrick-be-v3/src/modules/auth/__tests__/mfa-challenge-token.test.ts`:
- If any test references config type `"integer"`, update to `"bigint"`

#### 3.7.3 FE unit tests

**New file** `primebrick-fe-v3/src/lib/__tests__/api-ext.test.ts`:
- `extJsonParse` with bigint: `'{"id":42}'` → `{ id: 42n }`
- `extJsonParse` with float: `'{"price":3.14}'` → `{ price: 3.14 }`
- `extJsonStringify` with bigint: `{ id: 42n }` → `'{"id":42}'`
- `extJsonStringify` with plain string: `{ value: "hello" }` → `'{"value":"hello"}'` (same as `JSON.stringify`)
- Round-trip: `extJsonParse(extJsonStringify({ id: 42n, price: 99.99 }))` → types preserved (bigint + number)

**New file** `primebrick-fe-v3/src/lib/__tests__/money-format.test.ts`:

These tests verify the FE's standalone currency helpers (independent from the SDK):
- `formatUiMoney(1234.56, "it-IT", "EUR")` → `"1.234,56 €"` (Italian formatting)
- `formatUiMoney(1234.56, "en-US", "USD")` → `"$1,234.56"` (US formatting)
- `formatUiMoney(1234.56, "en-GB", "GBP")` → `"£1,234.56"` (UK formatting)
- `formatUiMoney(0, "it-IT", "EUR")` → `"0,00 €"`
- `formatUiMoney(null, "it-IT", "EUR")` → `""`
- `formatUiMoney("", "it-IT", "EUR")` → `""`
- `formatUiMoney(1000, "ja-JP", "JPY")` → `"￥1,000"` (no decimals for JPY)
- `currencySymbol("EUR")` → `"€"`
- `currencySymbol("USD")` → `"$"`
- `currencySymbol("JPY")` → `"¥"`
- `currencyDecimals("EUR")` → `2`
- `currencyDecimals("JPY")` → `0`
- `defaultCurrencyForLang("it-IT")` → `"EUR"`
- `defaultCurrencyForLang("en-US")` → `"USD"`
- `defaultCurrencyForLang("en-GB")` → `"GBP"`
- `defaultCurrencyForLang("ja-JP")` → `"JPY"` (if supported)
- `defaultCurrencyForLang("xx-XX")` → `"EUR"` (fallback for unknown)

**New file** `primebrick-fe-v3/src/lib/__tests__/config-validation.test.ts`:
- `buildConfigValueSchema("bigint")` accepts `"42"`, rejects `"3.14"`
- `buildConfigValueSchema("number")` accepts `"3.14"`, accepts `"42"`
- `buildConfigValueSchema("money")` accepts `"99.99"`, rejects `"abc"`
- `buildConfigValueSchema("bigint")` with min/max rules validates correctly
- `buildConfigValueSchema("money")` with min/max rules validates correctly

### Phase 8: E2E tests (Playwright)

Test infrastructure (verified empirically):
- FE: Playwright, tests in `src/e2e/*.spec.ts`
- Existing suites: `auth-mfa.spec.ts`, `auth-passkey.spec.ts`, `auth-password.spec.ts`, `smoke.spec.ts`
- `data-testid` convention is mandatory (see `docs/ai/e2e-testid-convention.md`)

**New file** `primebrick-fe-v3/src/e2e/config-typed-values.spec.ts`:

Test flows (require authenticated session + BE running):

1. **BigInt config create + display + edit**:
   - Navigate to security settings create page (`/system/settings/security/create`)
   - Fill key = `test_bigint_setting`
   - Select type = `bigint` (via `data-testid="config-create-type"`)
   - Enter value = `99999999999999999999` (value > `Number.MAX_SAFE_INTEGER`)
   - Save → verify success notification
   - Navigate back to config list → verify the row displays the value
   - Open edit → verify the input shows `99999999999999999999` (not rounded)
   - Change value to `42` → save → verify update

2. **Number config create + display + edit**:
   - Create type = `number`, value = `3.14`
   - Verify display shows `3.14`
   - Edit to `2.718` → save → verify

3. **Money config create with default currency**:
   - Navigate to create page
   - Select type = `money`
   - Verify `type_config` auto-populated with `{"currency":"EUR"}` (or locale-derived default)
   - Verify MoneyInput renders with currency symbol on right (`data-testid="config-input-money-create"`)
   - Enter amount = `1234.56`
   - Verify masked display shows locale-formatted value (e.g. `1.234,56` for it-IT)
   - Save → verify success
   - Navigate to config list → verify row displays formatted money (`€ 1.234,56` or locale equivalent)

4. **Money config currency change**:
   - Create a money config with EUR
   - Edit the config → click currency CTA (`data-testid="config-input-money-currency-cta"`)
   - Select USD from currency list
   - Verify currency symbol updates to `$`
   - Save → verify `type_config` updated with `"currency":"USD"`
   - Reload → verify currency persists

5. **Money config edit hydration**:
   - Create money config with amount `99.99` + EUR
   - Navigate away and back to edit
   - Verify MoneyInput shows formatted `99.99` with `€` symbol
   - Verify currency selector shows EUR selected

6. **Existing config types regression** (smoke-level):
   - Verify `boolean` config still renders Switch and saves
   - Verify `string` config still renders Input and saves
   - Verify `secret` config still renders Password (masked) and saves
   - Verify `url` config still validates URL format

7. **BigInt precision preservation** (critical):
   - Create bigint config with value `9007199254740993` (2^53 + 1, fails `Number` precision)
   - Save → reload list → verify value is `9007199254740993` (NOT `9007199254740992`)
   - This tests the full ext-json round-trip: FE `extJsonStringify` → wire → BE `extJsonParse` body parser → DAL string → BE `coerceConfigValue` → `extJsonMiddleware` response → FE `extJsonParse`

8. **Reserved row protection** (business rule):
   - Find an existing reserved config row (e.g. `mfa_challenge_token_ttl_seconds` — verify it's reserved via the API)
   - Update its `value` → succeeds (200)
   - Attempt to update its `type` → verify 403 `reserved-config-type-cannot-be-changed`
   - Attempt to update its `type_config` → verify 403 `reserved-config-type-cannot-be-changed`
   - Verify the FE UI disables the type selector and currency selector for reserved rows
   - Create a new (non-reserved) config row → update its `type` from `number` to `money` → succeeds (200)
   - Update the non-reserved row's `type_config` currency from EUR to USD → succeeds (200)

**`data-testid` attributes to add** (per `docs/ai/e2e-testid-convention.md`):
- `config-input-bigint-{fieldKey}` — bigint input
- `config-input-money-{fieldKey}` — money input container
- `config-input-money-amount-{fieldKey}` — money amount input
- `config-input-money-currency-cta-{fieldKey}` — currency selector CTA button
- `config-input-money-currency-list-{fieldKey}` — currency dropdown list
- `config-input-money-currency-option-{fieldKey}-{isoCode}` — individual currency option (e.g. `config-input-money-currency-option-create-EUR`)

## 4. Money type — detailed design

### 4.1 Storage model

- `value` TEXT column: stores the amount as a string (e.g. `"1234.56"`)
- `type_config` JSON: stores `{"currency":"EUR"}` (or `{"currency":"EUR","allowed_currencies":["EUR","USD","GBP"]}`)
- BE coerces `value` to `number` (same as `number` type) before sending to FE
- FE receives: `{ value: 1234.56, type: "money", type_config: "{\"currency\":\"EUR\"}" }`
- No `Money` class, no `__money` wire tag — the amount is a plain JSON number, the currency is a plain JSON string in `type_config`
- This is parallel to IANA DateTime: the datetime value is in one field, the IANA timezone name is in another field (`datetimeIanaToggle.recordIanaField`). No composite wire type for IANA either.

### 4.2 FE→BE submission

On save, FE sends the amount as a number and the currency in `type_config`:
```json
{
  "value": 1234.56,
  "type": "money",
  "type_config": "{\"currency\":\"EUR\"}"
}
```

BE route handler:
1. `serializeConfigValue("money", 1234.56)` → `"1234.56"` for DB storage
2. `type_config` is stored as-is (already contains the currency)
3. DAL stores `value` (string) + `type_config` (JSON with currency)

### 4.3 Create page flow

1. User selects type = `money`
2. FE auto-populates `type_config` with `{"currency":"EUR"}` (default from `defaultCurrencyForLang(uiLang)`)
3. MoneyInput renders with currency symbol '€' on the right
4. User types amount — masked with locale separators (e.g. `1.234,56` for it-IT)
5. User can click currency CTA → opens currency list → picks different currency
6. On save: FE sends `value` (number, the amount) + `type_config` (JSON string with selected currency)

### 4.4 Update page flow (existing config list)

1. BE sends `{ value: 1234.56, type: "money", type_config: "{\"currency\":\"EUR\"}" }` — value is a plain number, currency is in type_config
2. ConfigValueInput renders MoneyInput with `amount={1234.56}`, `currency="EUR"` (parsed from type_config)
3. MoneyInput displays formatted: `€ 1.234,56` (for it-IT locale)
4. User edits amount and/or currency
5. On save: FE sends updated `value` (number) + `type_config` (JSON string with new currency)
6. BE update handler: serializes value to string, updates BOTH `value` and `type_config` columns

### 4.5 Currency list source

- `countries-list/currencies` provides full ISO 4217 data
- `getCurrency('EUR')` → `{ code, name, symbol, symbolNative, numeric, decimals }`
- If `type_config.allowed_currencies` is set, show only those; otherwise show all ISO 4217 codes
- Currency list shows: symbol + code + name (e.g. `€ EUR Euro`)

### 4.6 Mask / formatting

- While typing: use `Intl.NumberFormat(lang, { style: 'decimal', minimumFractionDigits: currencyDecimals(currency), maximumFractionDigits: currencyDecimals(currency) })`
- Internal state: raw numeric string (e.g. `"1234.56"`)
- Display state: formatted string (e.g. `"1.234,56"` for it-IT, `"1,234.56"` for en-GB)
- On focus: show raw number for editing
- On blur: show formatted number
- This mirrors how date inputs work (raw ISO string internally, formatted display externally)

### 4.7 Export integration

The BE export pipeline already handles `currency` type fields (`formatHtmlCurrency` in `src/lib/export/helpers.ts`). Now that the SDK owns the currency helpers (`@primebrick/sdk/currency`), the BE export helpers can be refactored to import from the SDK instead of hardcoding currency logic. This is a future cleanup — not blocking for the initial implementation, but the SDK currency helpers make it possible:

```ts
// Future: BE export/helpers.ts can import from SDK
import { currencySymbol, currencyDecimals } from "@primebrick/sdk/currency";
```

For config money values in export, the export metadata should use `type: 'currency'` and `currencyField` pointing to the type_config currency. This is a future integration point — not blocking for the initial implementation.

## 5. Acceptance criteria

1. **Type rename**: No reference to `'integer'` as a config type remains in SDK, BE, FE, or US code. All renamed to `'bigint'`.

2. **Typed BE response**: `GET /api/v1/entities/config_entries/list` returns `value` as:
   - `bigint` (JSON number, parsed by FE ext-json reviver) for `bigint` type
   - `number` for `number` type
   - `number` for `money` type (currency is in `type_config` JSON, not in the value)
   - `string` for all other types

3. **Ext-json BigInt round-trip**: `42n` → `extJsonStringify` → wire `42` → `extJsonParse` → `42n` (bigint). No Money-specific ext-json handling — Money is a rendering concern, not a wire type.

4. **FE handles typed values**: `ConfigValueInput` correctly receives `bigint`/`number`/`string` and converts to string for input display, back to typed value for submission. For money type, `value` is `number` (amount) and currency is parsed from `type_config` JSON.

5. **Money input**: 
   - Renders with masked formatting based on user lang
   - Currency CTA on right shows symbol, opens currency list
   - Default currency derived from user lang on create page
   - Saves amount (as number in `value`) + currency (in `type_config` JSON) to BE

6. **Money display**: `formatUiMoney(value, lang, currency)` formats money values for read-only display.

7. **DB migration**: Fire-and-forget patch renames existing `integer` rows to `bigint`. Init patch updated. SHA256 managed per BE rules.

8. **Validation**: SDK `validateConfigValue` handles `bigint`, `number`, `money` correctly. FE `buildConfigValueSchema` handles same.

9. **Unit tests pass**:
   - SDK: `pnpm test` — all existing + new tests pass (config-validator, config-loader, ext-json, config-coerce)
   - BE: `pnpm test` — all existing + new tests pass (config-entries-router, config-ext-json-body)
   - FE: `pnpm test` — all existing + new tests pass (api-ext, money-format, config-validation)

10. **E2E tests pass**: `pnpm run e2e` — `config-typed-values.spec.ts` passes all flows (bigint create/edit, number create/edit, money create with default currency, money currency change, money edit hydration, existing types regression, bigint precision preservation)

11. **`pnpm run check`** passes in FE with 0 errors.
12. **`pnpm run build`** passes in BE.

13. **User docs updated**: `config-tables.mdx` and `ext-json.mdx` reflect `bigint`/`money` types and the two-field Money model (amount in value, currency in type_config). Synced to docs site via docs repo CI.

14. **Agent docs updated**: All `AGENTS.md` files across SDK, BE, FE, US, DAL reflect the new type vocabulary.

15. **No `JSON.stringify` in FE API calls**: All `body: JSON.stringify(payload)` calls in FE `src/` are simplified to `body: payload`. The only remaining `JSON.stringify` calls should be for non-API purposes (e.g. `sessionStorage.setItem`, debug logging). `apiFetch` handles all API body serialization via `extJsonStringify`.

16. **Reserved config protection**: Reserved config rows (`reserved: true`) reject `type` and `type_config` changes with HTTP 403 (`reserved-config-type-cannot-be-changed`). Non-reserved rows allow `type` and `type_config` changes. The `value` field is always updatable regardless of `reserved` status. This rule is enforced in the BE wrapper (`AuthConfigurationsDal`), NOT in the pure DAL.

## 6. File inventory

### SDK (primebrick-v3-sdk)
| File | Change |
|------|--------|
| `src/config/iconfig-entity.ts` | Rename `integer`→`bigint`, add `money`, add `ConfigTypeMoneyConfig` |
| `src/config/config-validator.ts` | Rename case, add money case, add `coerceConfigValue` + `serializeConfigValue` |
| `src/json/ext-json.ts` | NO changes needed (existing BigInt reviver is sufficient; Money is not a wire type) |
| `src/currency/currency-helpers.ts` | **New** — `getCurrencyInfo`, `currencySymbol`, `currencyDecimals`, `getAllCurrencies`, `defaultCurrencyForLang`, `formatMoney` (uses `countries-list`) |
| `src/currency/index.ts` | **New** — barrel re-export for `@primebrick/sdk` main entry |
| `src/index.ts` | Export `coerceConfigValue`, `serializeConfigValue`, `ConfigTypeMoneyConfig`; re-export currency helpers |
| `package.json` | Add `countries-list` dependency (pinned) |
| `src/config/__tests__/config-validator.test.ts` | Update tests — rename `integer`→`bigint`, add `money` |
| `src/config/__tests__/config-loader.test.ts` | Update fixtures `integer`→`bigint`, add typed access tests |
| `src/config/__tests__/config-coerce.test.ts` | **New** — `coerceConfigValue` + `serializeConfigValue` round-trip tests |
| `src/currency/__tests__/currency-helpers.test.ts` | **New** — `getCurrencyInfo`, `currencySymbol`, `currencyDecimals`, `defaultCurrencyForLang`, `formatMoney`, `getAllCurrencies` tests |
| `docs/user-guide/config-tables.mdx` | Update type vocabulary table, add BigInt + Money sections |
| `docs/user-guide/ext-json.mdx` | Note Money is not a wire type, add request body parsing section |
| `docs/user-guide/currency-helpers.mdx` | **New** (optional) — document the SDK currency helpers (BE/US usage) |
| `AGENTS.md` | Update ConfigType list, document Money as rendering concern (not wire type), document currency helpers |

### BE (primebrick-be-v3)
| File | Change |
|------|--------|
| `src/modules/auth/routers/config-entries.router.ts` | Typed response via `coerceConfigValue`, accept typed input, serialize before DAL |
| `src/index.ts` (or app setup) | Replace `express.json()` with ext-json body parser for BigInt request body parsing |
| `src/modules/auth/auth_configurations_dal.ts` | `update()` + `bulkUpdate()` accept partial `{ value, type, type_config }` — the pure DAL (`Repository`) already supports this, the BE wrapper was the bottleneck |
| `src/modules/auth/config-repo.ts` | `parseInt` → `Number`, `=== "integer"` → `=== "bigint"` |
| `db-meta/fire-and-forget/rename_integer_to_bigint_config_type.sql` | New fire-and-forget patch |
| `db-meta/patches/00000000000000_init_database.sql` | `'integer'` → `'bigint'` (+ SHA256 management) |
| `db-meta/fire-and-forget/add_config_table_standard_columns.sql` | `'integer'` → `'bigint'` |
| `src/openapi/openapi.ts` | Update type references |
| `src/modules/auth/__tests__/config-entries-router.test.ts` | **New** — typed value create/update/bulk-update + validation + secret masking |
| `src/modules/auth/__tests__/config-ext-json-body.test.ts` | **New** — ext-json body parser (bigint reconstruction) |
| `src/modules/auth/__tests__/mfa-challenge-token.test.ts` | Update if references `integer` config type |
| `docs/user-guide/environment-configuration.mdx` | Update config type references |
| `AGENTS.md` | Update Config Table Standard, document ext-json body parser + typed responses (bigint/number; money is number + type_config) |

### FE (primebrick-fe-v3)
| File | Change |
|------|--------|
| `src/lib/api-types.ts` | Rename type, add `money`, add `ConfigValue` (no Money type — money value is number) |
| `src/lib/api-ext.ts` | Add `extJsonStringify` (BigInt-safe via json-bigint), no Money tagging needed |
| `src/lib/api.ts` | Centralize ext-json body serialization in `apiFetch` (intercept object bodies → `extJsonStringify`); simplify all `body: JSON.stringify(payload)` → `body: payload` (~6 call sites in this file) |
| `src/routes/(app)/system/settings/email-providers/+page.svelte` | Simplify `body: JSON.stringify(payload)` → `body: payload` (2 call sites) |
| `src/lib/sse/create-sse-connection.ts` | Simplify if body is plain object (1 call site — verify SSE compatibility) |
| `src/lib/shell/ai-chat/use-ai-chat.svelte.ts` | Simplify `body: JSON.stringify(...)` → `body: {...}` (1 call site) |
| `src/lib/components/auth/PasskeyEnrollment.svelte` | Simplify (2 call sites) |
| `src/lib/components/auth/MfaManagement.svelte` | Simplify (1 call site) |
| `src/lib/components/auth/LoginForm.svelte` | Simplify (1 call site) |
| `src/lib/components/auth/ChangePasswordCard.svelte` | Simplify (1 call site) |
| `src/routes/welcome/+page.svelte` | Simplify (4 call sites) |
| `src/routes/login/+page.svelte` | Simplify (1 call site) |
| `src/routes/(app)/system/settings/profile/+page.svelte` | Simplify (1 call site) |
| `src/lib/composables/useRoleMappings.svelte.ts` | Simplify (2 call sites) |
| `src/lib/components/entity-list-table/dialogs/ChangePasswordDialog.svelte` | Simplify (1 call site) |
| `src/lib/components/entity-list-table/composables/useRowActions.svelte.ts` | Simplify (1 call site) |
| `src/lib/components/auth/PasskeyEnrollmentSection.svelte` | Simplify (2 call sites) |
| `src/lib/validation/config-validation.ts` | Rename, add money |
| `src/lib/i18n/money-format.ts` | **New** — standalone FE currency helpers (mirrors SDK, independent — FE cannot import SDK) |
| `src/lib/components/ui/money-input/money-input.svelte` | **New** — money input component |
| `src/lib/components/ui/money-input/index.ts` | **New** — export |
| `src/lib/components/config-list/ConfigValueInput.svelte` | Rename, add money branch, add `data-testid` attributes |
| `src/routes/(app)/system/settings/security/create/+page.svelte` | Rename type option, add money, default currency |
| `src/lib/components/config-list/ConfigListRow.svelte` | Check read-only display for money |
| `package.json` | Add `countries-list` dependency (same pinned version as SDK) |
| `src/lib/__tests__/api-ext.test.ts` | **New** — FE ext-json parse + stringify + round-trip tests |
| `src/lib/__tests__/money-format.test.ts` | **New** — FE standalone currency helper tests |
| `src/lib/__tests__/config-validation.test.ts` | **New** — FE Zod schema tests for `bigint`, `number`, `money` |
| `src/e2e/config-typed-values.spec.ts` | **New** — Playwright E2E for bigint/number/money create/edit/hydration + regression |
| `AGENTS.md` | Update Config types section, document MoneyInput + apiFetch ext-json + money as number+type_config |

### US (primebrick-us-v3)
| File | Change |
|------|--------|
| (search and replace) | `'integer'` → `'bigint'`, `parseInt` → `BigInt` where appropriate |
| `AGENTS.md` | Update config type references, document Money as separate fields (not wire type) |

### DAL (primebrick-dal-v3)
| File | Change |
|------|--------|
| `AGENTS.md` | Update any config type references in examples (no DAL code changes expected) |

## 7. Open questions / risks

1. **Init patch SHA256**: Changing the init patch changes its hash. Must follow `primebrick-be-v3/.devin/rules/patch-sha256-management.md` to update the recorded hash. This may require a fire-and-forget patch that updates the `schema_patches` table.

2. **BigInt in JSON**: The BE uses `ext-json` middleware which serializes `bigint` as JSON numbers. The FE uses `apiFetchExt` which parses them back to `bigint`. This already works for entity IDs — config values will use the same path. Money does NOT need ext-json handling (it's a rendering concern: amount is a plain number, currency is in type_config). Verify that the config list endpoint uses `apiFetchExt` (or switch it to use `apiFetchExt`).

3. **Money input mask complexity**: Number masking with locale separators is non-trivial. Consider using a lightweight masking library (e.g. `cleave.js` or `inputmask`) or implement manually with `Intl.NumberFormat`. The manual approach mirrors `date-format.ts` but is more complex for live-typing (cursor position, partial input). A library may be more reliable.

4. **ConfigList update flow**: The existing config list saves values via `dal.update(uuid, { value }, updatedBy)`. For money, the update also includes `type_config` (containing the currency). For type changes (e.g. `number` → `money`), the update includes `type` + `type_config`. The pure DAL (`Repository.update()`) already supports partial updates on any column — the BE wrapper `AuthConfigurationsDal` was the bottleneck and is being fixed (§3.2.2).

5. **`countries-list` duplication (SDK + FE)**: Both the SDK and FE install `countries-list` directly and have their own copy of the currency helpers. This is intentional — the FE cannot import from the SDK (SDK is Node.js-only). Both copies must be kept in sync manually. A future `@primebrick/shared` package (browser-safe, no Node.js APIs) could eliminate the duplication, but that's a separate refactor. For now, verify: (a) both repos pin the same `countries-list` version, (b) the `countries-list/currencies` subpath import works with Vite's bundler on the FE side, (c) the data is tree-shakeable when only `getCurrency`/`getCountryData` are used.

6. **BE request body parsing for BigInt**: The BE currently uses `express.json()` which uses native `JSON.parse` — this produces `number` for all JSON numbers, NOT `bigint`. Replacing `express.json()` with an ext-json body parser is the correct solution — it reconstructs `bigint` from integer JSON numbers. This is a global change to the BE's body parsing pipeline and must be tested carefully (all existing endpoints must still work). Money does not need special body parsing — the amount arrives as a plain number, the currency is in `type_config`.
