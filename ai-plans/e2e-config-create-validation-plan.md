# E2E for Config-Item Create Form — Full Validation Matrix

> **Status:** PLANNING — awaiting user approval before implementation.
> **Phase:** Phase 1 (form validation only, no submit/DB). Phase 2 (round-trip to DB) is a later task.

## Summary

A megaplan to build a Playwright E2E suite (`src/e2e/config-create-validation.spec.ts`) that exercises **every validation rule on every field of both columns** of the config-item create form (`/system/settings/security/create`), across all 17 `type` values × all applicable validation rules. Phase 1 = form validation only (no submit, no DB writes). Phase 2 (later) = full round-trip to DB.

The create form has two columns:
- **Left column** = top-level form fields (`key`, `type`, `value`, `label_key`, `description_key`, `group_key`, `reserved`) — always rendered.
- **Right column** = `TypeConfigBuilder`, which renders **dynamically** based on the selected `type`: `ValidationRulesSection` + `WidgetConfigSection` + `JsonPreviewEditor`. Different fields appear/disappear per type.

## Current state (research findings)

### What exists
- `src/e2e/config-typed-values.spec.ts` — tests the **list page** only (`/system/settings/security`), never opens the create form. 6 tests, all on the list page.
- **Zero E2E coverage** of the create form, the `TypeConfigBuilder`, the `ValidationRulesSection`, or any create-page validation.

### The validation surface (the matrix to cover)

#### Left column — top-level Zod schema (`createSchema` in `+page.svelte` lines 60–103)

| Field | Testid | Validation rules |
|---|---|---|
| `key` | `config-create-key` | required (`min 1`), max 100, regex `^[a-z][a-z0-9_]*$` (invalidFormat), async uniqueness vs `/api/v1/entities/config_entries/list` (`keyExistsError` shown as inline div, not via FormField) |
| `type` | `config-create-type` (ComboSelect) | required, one of 17 values |
| `value` | `config-input-{type}-create` (dynamic per type) | validated dynamically via `buildConfigValueSchema(type, type_config)` in `superRefine` — depends on type AND type_config |
| `label_key` | `config-create-label-key` (ComboSelect) | max 100 |
| `description_key` | `config-create-description-key` (ComboSelect) | max 100 |
| `group_key` | `config-create-group-key` (ComboSelect) | max 100, regex `^$\|^[a-z][a-z0-9_]*$` |
| `reserved` | `config-create-reserved` (Switch) | boolean, no validation |
| submit button | (no testid — needs one) | `disabled` when `!effectiveCanSave` (canSave = !hasErrors && !keyExistsError && !keyChecking) |

#### Right column — `TypeConfigBuilder` (renders per-type)

**`ValidationRulesSection.svelte`** — fields shown conditionally:

| Field | Testid | Shown when | Validation |
|---|---|---|---|
| required toggle | `tcb-required` | always | boolean |
| required error key | `tcb-required-error-key` | required=true | ComboSelect, free-text |
| unsigned toggle | `tcb-unsigned` | numeric types (bigint, number, money) | boolean |
| min | `tcb-min` | numeric OR string-derived types | number input |
| min error key | `tcb-min-error-key` | min is set | ComboSelect |
| max | `tcb-max` | numeric OR string-derived types | number input |
| max error key | `tcb-max-error-key` | max is set | ComboSelect |
| url protocols | `tcb-url-protocols` | type=url only | text input (comma-separated) |
| url error key | `tcb-url-error-key` | url protocols set | ComboSelect |
| regex pattern | `tcb-regex` | string-derived types (string, text, secret, url, email, phone) | text input, **live regex validation** |
| regex pattern error | `tcb-regex-error` | regex pattern invalid | error `<p>` (new addition) |
| regex error key | `tcb-regex-error-key` | regex pattern set | ComboSelect |

**`WidgetConfigSection.svelte`** — fields shown per type:

| Field | Testid | Shown when |
|---|---|---|
| currency | `tcb-currency` | type=money |
| badge values editor | `tcb-badge-add`, `tcb-badge-value`, `tcb-badge-label`, `tcb-badge-color`, `tcb-badge-remove` | type=badge |
| select source mode | `tcb-source-builtin`, `tcb-source-api` | type=single_select/multi_select |
| builtin source | `tcb-builtin-source` | select + builtin mode |
| api url | `tcb-api-url` | select + api mode |
| api verb | `tcb-api-verb` | select + api mode |
| value field | `tcb-value-field` | select + api mode |
| label field | `tcb-label-field` | select + api mode |

**`JsonPreviewEditor.svelte`** — always rendered:

| Field | Testid | Purpose |
|---|---|---|
| advanced toggle | `tcb-advanced` | switch to raw JSON mode |
| raw JSON editor | `tcb-raw-json` | shown in advanced mode |
| raw JSON error | `tcb-raw-json-error` | parse error display |
| preview toggle | `tcb-preview-toggle` | collapse/expand JSON preview |
| JSON preview | `tcb-json-preview` | read-only serialized output |

#### The 17 types and what they render

| Type | Value widget testid | ValidationRules fields | WidgetConfig fields |
|---|---|---|---|
| string | `config-input-string-create` | required, min, max, regex | none |
| text | `config-input-text-create` | required, min, max, regex | none |
| boolean | `config-input-boolean-create` | required | none |
| bigint | `config-input-number-create` | required, unsigned, min, max | none |
| number | `config-input-number-create` | required, unsigned, min, max | none |
| money | `config-input-money-create` | required, unsigned, min, max | currency |
| badge | `config-input-badge-create` | required | badge values editor |
| single_select | `config-input-single-select-create` | required | select source editor |
| multi_select | `config-input-multi-select-create` | required | select source editor |
| url | `config-input-url-create` | required, min, max, regex, url-protocols | none |
| secret | `config-input-secret-create` | required, min, max, regex | none |
| json | `config-input-text-create` | required, min, max | none |
| date | (DateWheelPicker — no testid) | required | none |
| datetime | (DateWheelPicker — no testid) | required | none |
| time | (DateWheelPicker — no testid) | required | none |
| email | `config-input-email-create` | required, min, max, regex | none |
| phone | `config-input-phone-create` | required, min, max, regex | none |

#### Value validation per type (`buildConfigValueSchema` in `config-validation.ts`)

| Type | Value validation (when value non-empty) |
|---|---|
| bigint | regex `/^-?\d+$/` (or `/^\d+$/` if unsigned) |
| number, money | regex `/^-?\d*\.?\d+$/` (or `/^\d*\.?\d+$/` if unsigned) |
| boolean | must be `true` or `false` |
| url | `new URL(val)` must not throw |
| email | `EMAIL_REGEX` test |
| phone | `parsePhoneNumber(val, country).isValid()` |
| json | `JSON.parse(val)` must not throw |
| string, text, secret | min/max = length, regex test |
| badge, single_select, multi_select, date, datetime, time | required only (no type-specific value validation) |

## Implementation Steps

### Step 0 — Add missing testids (prerequisite, small)

The create page submit/cancel buttons have no testids. Add them so E2E can locate them:

- `src/routes/(app)/system/settings/security/create/+page.svelte`:
  - Add `data-testid="config-create-submit"` to the submit `<Button>`
  - Add `data-testid="config-create-cancel"` to the cancel `<Button>`

**Decision on error locators:** The shared `translated-field-errors.svelte` component has no testid and is used by many forms. The E2E will locate errors by scoping relative to the field testid (e.g. `page.getByTestId('config-create-key').locator('..').locator('[class*="text-destructive"]')`). This keeps the brittle-on-purpose convention (errors located by proximity to their field, not a global error testid) and avoids modifying a shared component.

### Step 1 — Create the E2E spec file

Create `src/e2e/config-create-validation.spec.ts`.

Structure: `test.describe.serial` with `test.beforeEach` that logs in as admin and navigates to `/system/settings/security/create`. Each test resets the form by reloading the page (no DB writes, so no cleanup needed).

### Step 2 — Left column validation tests

**`test.describe("Left column — top-level field validation")`**

1. `test("empty submit shows required errors on key and type")` — click submit with empty form, assert error near `config-create-key` and `config-create-type`.
2. `test("key required — clearing key shows required error")` — type then clear key, assert error.
3. `test("key max length — 101 chars shows tooLong error")` — fill 101 chars, assert error; 100 chars, assert no error.
4. `test("key format — uppercase rejected")` — `My_Key`, assert invalidFormat.
5. `test("key format — leading digit rejected")` — `1key`, assert invalidFormat.
6. `test("key format — spaces rejected")` — `my key`, assert invalidFormat.
7. `test("key format — valid snake_case accepted")` — `my_custom_setting`, assert no error.
8. `test("key uniqueness — existing key shows keyExists error")` — use a known-existing key (e.g. `oidc_issuer_url` from the security page), assert `keyExists` inline error appears (the div below the input, not a FormField error).
9. `test("type required — clearing type shows required error")` — select then clear.
10. `test("label_key max length — 101 chars shows tooLong")`.
11. `test("description_key max length — 101 chars shows tooLong")`.
12. `test("group_key format — uppercase rejected")`.
13. `test("group_key format — valid snake_case accepted")`.
14. `test("group_key empty is valid")`.
15. `test("reserved toggle switches without error")`.
16. `test("submit disabled when errors present")` — fill invalid key, assert submit button is disabled.
17. `test("submit enabled when all valid")` — fill valid key + type + value, assert submit enabled (do NOT click submit — Phase 1 only).

### Step 3 — Right column: per-type field visibility tests

**`test.describe("Right column — per-type field visibility")`**

For each of the 17 types, one test that selects the type and asserts which right-column fields are visible/not-visible:

18. `test("type=string shows required, min, max, regex; hides unsigned, url-protocols")`
19. `test("type=text shows required, min, max, regex; hides unsigned, url-protocols")`
20. `test("type=secret shows required, min, max, regex; hides unsigned, url-protocols")`
21. `test("type=url shows required, min, max, regex, url-protocols; hides unsigned")`
22. `test("type=email shows required, min, max, regex; hides unsigned, url-protocols")`
23. `test("type=phone shows required, min, max, regex; hides unsigned, url-protocols")`
24. `test("type=bigint shows required, unsigned, min, max; hides regex, url-protocols")`
25. `test("type=number shows required, unsigned, min, max; hides regex, url-protocols")`
26. `test("type=money shows required, unsigned, min, max, currency; hides regex, url-protocols")`
27. `test("type=boolean shows required only; hides min, max, unsigned, regex, url-protocols")`
28. `test("type=json shows required, min, max; hides unsigned, regex, url-protocols")`
29. `test("type=badge shows required, badge values editor; hides min, max, unsigned, regex")`
30. `test("type=single_select shows required, select source editor; hides min, max, unsigned, regex")`
31. `test("type=multi_select shows required, select source editor; hides min, max, unsigned, regex")`
32. `test("type=date shows required only; hides min, max, unsigned, regex")`
33. `test("type=datetime shows required only; hides min, max, unsigned, regex")`
34. `test("type=time shows required only; hides min, max, unsigned, regex")`

### Step 4 — Right column: ValidationRulesSection per-rule tests

**`test.describe("Right column — validation rule interactions")`**

35. `test("required toggle ON shows required-error-key field; OFF hides it")`
36. `test("min set shows min-error-key field; cleared hides it")`
37. `test("max set shows max-error-key field; cleared hides it")`
38. `test("regex pattern set shows regex-error-key field; cleared hides it")`
39. `test("invalid regex pattern shows tcb-regex-error")` — type `[invalid`, assert `tcb-regex-error` visible.
40. `test("valid regex pattern hides tcb-regex-error")` — type `^[A-Z]{3}$`, assert `tcb-regex-error` not visible.
41. `test("url protocols set shows url-error-key field; cleared hides it")` — type=url.
42. `test("unsigned toggle ON for bigint changes value validation to reject negatives")` — set unsigned, enter `-5` in value, assert value error.
43. `test("unsigned toggle OFF for bigint allows negatives")` — enter `-5`, assert no value error.

### Step 5 — Cross-column: value validation per type (the big matrix)

**`test.describe("Value field validation per type × rule")`**

This is the core matrix. For each type, test that entering an invalid value produces an error and a valid value does not. Use `config-input-{type}-create` to fill the value, then assert error presence near the value field.

**String-derived types (string, text, secret) — min/max/regex:**
44. `test("string: value shorter than min shows tooShort error")` — set min=5, enter "ab".
45. `test("string: value longer than max shows tooLong error")` — set max=3, enter "abcd".
46. `test("string: value not matching regex shows regexMismatch error")` — set regex `^[A-Z]{3}$`, enter "abc".
47. `test("string: value matching regex shows no error")` — enter "ABC".
48. `test("string: required + empty shows required error")` — toggle required, clear value.
49. `test("text: min/max/regex validation")` — same 3 cases as string (min, max, regex).
50. `test("secret: min/max/regex validation")` — same 3 cases.

**Numeric types (bigint, number, money) — type + min/max + unsigned:**
51. `test("bigint: non-numeric value shows invalidBigint error")` — enter "abc".
52. `test("bigint: negative with unsigned shows invalidBigintUnsigned error")` — toggle unsigned, enter "-5".
53. `test("bigint: value below min shows min error")` — set min=10, enter "5".
54. `test("bigint: value above max shows max error")` — set max=100, enter "500".
55. `test("number: non-numeric shows invalidNumber error")`.
56. `test("number: value below min shows min error")`.
57. `test("number: value above max shows max error")`.
58. `test("money: non-numeric shows invalidNumber error")`.
59. `test("money: value below min shows min error")`.

**Type-specific value validation:**
60. `test("boolean: invalid value 'maybe' shows invalidBoolean error")` — (via the switch, this is edge — may need to test via advanced JSON or skip; the switch only produces true/false).
61. `test("url: malformed URL shows invalidUrl error")` — enter "not-a-url".
62. `test("url: valid URL shows no error")` — enter "https://example.com".
63. `test("url: protocol not in allowed list shows invalidUrlProtocol error")` — set url-protocols "https", enter "http://example.com".
64. `test("email: malformed shows invalidEmail error")` — enter "not-an-email".
65. `test("email: valid shows no error")` — enter "a@b.com".
66. `test("phone: invalid shows invalidPhone error")` — enter "123".
67. `test("phone: valid shows no error")` — enter "+15551234567".
68. `test("json: malformed shows invalidJson error")` — enter "{invalid".
69. `test("json: valid shows no error")` — enter `{"a":1}`.

**Badge / select / date types (required only):**
70. `test("badge: required + no selection shows required error")`.
71. `test("single_select: required + no selection shows required error")`.
72. `test("multi_select: required + no selection shows required error")`.
73. `test("date: required + empty shows required error")`.
74. `test("datetime: required + empty shows required error")`.
75. `test("time: required + empty shows required error")`.

### Step 6 — Right column: WidgetConfigSection tests

**`test.describe("Widget config section per type")`**

76. `test("money: currency selector visible and changeable")` — type=money, assert `tcb-currency` visible.
77. `test("badge: add/remove badge value rows")` — type=badge, click `tcb-badge-add`, assert row appears, click `tcb-badge-remove`, assert row disappears.
78. `test("badge: badge value/label/color inputs editable")`.
79. `test("single_select: builtin source mode shows builtin-source selector")` — click `tcb-source-builtin`, assert `tcb-builtin-source` visible.
80. `test("single_select: api source mode shows api-url, api-verb, value-field, label-field")` — click `tcb-source-api`, assert all 4 visible.
81. `test("multi_select: same source editor behavior as single_select")`.

### Step 7 — Right column: JsonPreviewEditor / advanced mode tests

**`test.describe("Advanced JSON mode")`**

82. `test("advanced toggle ON shows raw JSON editor; OFF shows preview")`.
83. `test("invalid JSON in raw editor shows tcb-raw-json-error")` — toggle advanced, type `{invalid`, assert error.
84. `test("valid JSON in raw editor hides error and updates preview")` — type `{"validation":{"required":true}}`, toggle advanced off, assert `tcb-json-preview` contains the JSON.
85. `test("preview toggle collapses/expands JSON preview")`.

### Step 8 — Update testid registry

Update `docs/ai/e2e-testid-convention.md` Testid registry with a new section:

### Config create form

| Component (file) | Element | `data-testid` |
|---|---|---|
| `security/create/+page.svelte` | key input | `config-create-key` |
| `security/create/+page.svelte` | type select | `config-create-type` |
| `security/create/+page.svelte` | label_key select | `config-create-label-key` |
| `security/create/+page.svelte` | description_key select | `config-create-description-key` |
| `security/create/+page.svelte` | group_key select | `config-create-group-key` |
| `security/create/+page.svelte` | reserved toggle | `config-create-reserved` |
| `security/create/+page.svelte` | submit button | `config-create-submit` (NEW) |
| `security/create/+page.svelte` | cancel button | `config-create-cancel` (NEW) |
| `ValidationRulesSection.svelte` | required toggle | `tcb-required` |
| `ValidationRulesSection.svelte` | required error key | `tcb-required-error-key` |
| `ValidationRulesSection.svelte` | unsigned toggle | `tcb-unsigned` |
| `ValidationRulesSection.svelte` | min input | `tcb-min` |
| `ValidationRulesSection.svelte` | min error key | `tcb-min-error-key` |
| `ValidationRulesSection.svelte` | max input | `tcb-max` |
| `ValidationRulesSection.svelte` | max error key | `tcb-max-error-key` |
| `ValidationRulesSection.svelte` | url protocols | `tcb-url-protocols` |
| `ValidationRulesSection.svelte` | url error key | `tcb-url-error-key` |
| `ValidationRulesSection.svelte` | regex pattern | `tcb-regex` |
| `ValidationRulesSection.svelte` | regex pattern error | `tcb-regex-error` |
| `ValidationRulesSection.svelte` | regex error key | `tcb-regex-error-key` |
| `WidgetConfigSection.svelte` | currency | `tcb-currency` |
| `BadgeValuesEditor.svelte` | add button | `tcb-badge-add` |
| `BadgeValueRow.svelte` | value input | `tcb-badge-value` |
| `BadgeValueRow.svelte` | label input | `tcb-badge-label` |
| `BadgeValueRow.svelte` | color input | `tcb-badge-color` |
| `BadgeValueRow.svelte` | remove button | `tcb-badge-remove` |
| `SelectSourceEditor.svelte` | builtin source button | `tcb-source-builtin` |
| `SelectSourceEditor.svelte` | api source button | `tcb-source-api` |
| `SelectSourceEditor.svelte` | builtin source select | `tcb-builtin-source` |
| `SelectSourceEditor.svelte` | api url | `tcb-api-url` |
| `SelectSourceEditor.svelte` | api verb | `tcb-api-verb` |
| `SelectSourceEditor.svelte` | value field | `tcb-value-field` |
| `SelectSourceEditor.svelte` | label field | `tcb-label-field` |
| `JsonPreviewEditor.svelte` | advanced toggle | `tcb-advanced` |
| `JsonPreviewEditor.svelte` | raw JSON editor | `tcb-raw-json` |
| `JsonPreviewEditor.svelte` | raw JSON error | `tcb-raw-json-error` |
| `JsonPreviewEditor.svelte` | preview toggle | `tcb-preview-toggle` |
| `JsonPreviewEditor.svelte` | JSON preview | `tcb-json-preview` |

## Files to Modify

- `src/routes/(app)/system/settings/security/create/+page.svelte` — add `data-testid` to submit + cancel buttons (2 lines).
- `src/e2e/config-create-validation.spec.ts` — **NEW** file, ~85 tests.
- `docs/ai/e2e-testid-convention.md` — append config-create testid registry section.

## Files NOT modified (Phase 1)

- No DB helpers needed (no submit, no cleanup).
- No `global.setup.ts` / `global.teardown.ts` changes (no fake Brevo, no DB writes).
- No `playwright.config.ts` changes (auto-discovered from `src/e2e/`).

## Verification

- [ ] `pnpm test:e2e -- --grep "config-create-validation"` runs the new suite.
- [ ] All ~85 tests pass against a running dev stack (FE 5173, BE 3001, Postgres 5432 per `global.setup.ts` preconditions).
- [ ] `pnpm check` (typecheck) passes — the new spec file must be typed.
- [ ] No new testids silently dropped — registry updated.
- [ ] Confirm the new `config-create-submit` / `config-create-cancel` testids don't collide with existing ones (grep `src/e2e/` for them — currently zero matches).

## Risks / Considerations

1. **ComboSelect interaction in Playwright** — `type`, `label_key`, `description_key`, `group_key`, and all `tcb-*-error-key` fields use `ComboSelect`, which renders options in a popover. E2E must click the trigger, then click `[role='option']` by text. The existing `auth-password.spec.ts` and `admin-login.ts` helper show this pattern works. The testid convention doc (line 163) explicitly says option selection by text is acceptable for ComboSelect since options are data-driven.

2. **DateWheelPicker has no testid** — for `date`/`datetime`/`time` types, the value widget is `DateWheelPicker` with no `data-testid`. The required-only validation tests for these types can still work (required error appears when value empty), but we cannot fill the value via testid. **Decision: test required-only for these 3 types; skip value-fill tests.** If needed later, add a testid to `DateWheelPicker` in a follow-up.

3. **Boolean value validation is hard to trigger invalid** — the `Switch` only produces `true`/`false`, so `invalidBoolean` is unreachable via UI. Test 60 may need to use advanced JSON mode to inject an invalid boolean value, or be skipped. **Decision: skip test 60, note it as unreachable via UI.**

4. **Async key uniqueness check has a 500ms debounce** — test 8 must wait for the `keyExistsError` div to appear after typing. Use `expect(div).toBeVisible({ timeout: 3000 })` to account for debounce + API call.

5. **Form reset between tests** — each test reloads the page in `beforeEach` to get a clean form. No DB writes occur, so no `afterAll` cleanup needed. This keeps the suite fast and isolated.

6. **Test count (~85)** — this is large but matches the user's request for "all validation rules for each field in all combinations." The suite uses `fullyParallel: true` (from `playwright.config.ts`) so tests run in parallel where possible. The `test.describe.serial` wrapper is only needed if tests share state; since each reloads, we can use plain `test.describe` for parallelism.

7. **Phase 2 readiness** — the suite is structured so Phase 2 (submit + DB verify + cleanup) can be added later by: (a) adding a `helpers/db.ts` cleanup in `afterAll`, (b) changing the "submit enabled" test to actually click submit and verify the row via `findEmailLog`-style DB query, (c) deleting the created config row. No structural changes to the validation tests needed.

8. **The user's in-progress `ValidationRulesSection.svelte` edits** — the live regex validation (`tcb-regex-error`) is part of this plan (tests 39–40). The user's current edits to that file (using a local var `p` to avoid tracking) are compatible with the plan; the testid `tcb-regex-error` is already in place.

## Acceptance Criteria

- [ ] New spec file `src/e2e/config-create-validation.spec.ts` exists with ~85 tests.
- [ ] All 17 types have a field-visibility test.
- [ ] All validation rules (required, min, max, regex, url-protocols, unsigned) have interaction tests.
- [ ] Value validation matrix covers all types that have type-specific value validation.
- [ ] The live regex pattern error (`tcb-regex-error`) is tested.
- [ ] Advanced JSON mode (valid + invalid) is tested.
- [ ] Submit/cancel buttons have testids and the registry is updated.
- [ ] `pnpm test:e2e -- --grep "config-create-validation"` passes.
- [ ] `pnpm check` passes.
- [ ] No DB writes occur (Phase 1 constraint).
