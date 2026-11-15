# NumericInput unification — ONE component for every numeric input

> **Status**: ✅ IMPLEMENTED + VERIFIED — awaiting commit (user word)
> **Verified 2026-01-XX**: core 119/119 · DAL 518/518 · FE 600/600 (numeric suite 110/110)
> UI `svelte-check` 0/0 + standards clean + build green · FE `svelte-check` 0/0 + standards clean
> BE: patch `20261123000000_numeric_input_stepper_aria.sql` signed (105 patches)
> **Deviation from plan**: `canon()` (normalize→toPG) applied at every Decimal→string
> write-back — `mul`/`div` scale noise (`10.0`, `0.1000…0`) must never reach bound
> value or display; `after_receive` output normalized at the composable boundary too.
> **Scope**: `@primebrick/ui` NumericInput + composable, `primebrick-v3-core` field contract,
> `primebrick-dal-v3` constraint derivation, FE call-site migration, BE i18n seeds.
> **Owner decision log** is embedded inline — every contract point was confirmed with the user.

---

## 0. Verified current state (empirical — no assumptions)

| Fact | Evidence |
|---|---|
| ONE component exists already: `NumericInput` + `useNumericInput` composable | `primebrick-v3-ui/src/lib/components/numeric-input/`, `src/lib/composables/useNumericInput.svelte.ts` |
| Kinds today: `bigint` \| `number` \| `money` | `NumericType` in both files |
| Canonical contract: bound `value` is a **canonical string** (`"1234.56"`, dot decimal, no separators); locale display is derived; native coercion happens at the SDK/BE boundary | `useNumericInput` docblock + `handleBlur` |
| Currency adornment exists (InputGroup inline-start CTA + code button) wired by the HOST via `currencySymbol`/`currencyCode`/`onCurrencyClick`; the picker is the host sheet `openSheet('config.currencySelect')` | `numeric-input.svelte:165-207`, `ConfigValueInput.svelte:125-132` |
| The "lazy wiring" today: `type_config.currency` (config domain only). Currency LIB exists: `primebrick-fe-v3/src/lib/currency/currency-helpers.ts` (`getAllCurrencies`, `currencySymbol`, `currencyDecimals` — `countries-list` based; SDK has a Node-side copy) | verified |
| NO entity today has a `*_currency`/`*_uom` DB column; `format:"money"` exists in `MetaColumnFormat` but **zero US metas use it** | grep on `primebrick-us-v3/**/*.entity.ts`, `*.meta.ts` |
| `MetaColumn` already carries `pg_type`, `format`, `min`, `max`, `nullable`, `max_length`, `widget` — inference inputs exist | `entity-meta.ts:336-380` |
| `checkFieldValue` numeric branch: `format:number\|money` or `pg_type ∈ {integer,bigint,numeric,smallint,double precision,real}` → `Number(value)` compare vs `min`/`max`. **No `unsigned` concept** (type_config-only today) | `field-validation.ts:432-462` |
| `fieldSpecToZod` binds `z.number()` for numeric columns BUT the control writes canonical strings → **latent mismatch** (no numeric field is placed on a form today, so it never fired) | `field-spec-to-zod.ts:44-52`, `build-entity-form-schema.ts` |
| `ext-json` revives integers→`bigint`, floats→`number`; **no Decimal wire support** — `Decimal.toWire()` (`"12.34d"`) is the lib's own convention, not ext-json's | `ext-json.ts` |
| `@primebrick/decimal` is a workspace member (`v × 10^-scale`, functional API `dec/cmp/add`, `toPG()→"12.34"`, `toWire()→"12.34d"`) but **NOT yet a dep of `@primebrick/ui`** | `pnpm-workspace.yaml`, `primebrick-v3-ui/package.json` |
| `ref_count` is `type`-level (calculated count column, no `pg_type`) — currently maps to `type="number"` in the dispatcher | `FormFieldDispatcher.svelte` resolver |
| Steppers: absent today. `InputGroup`/`InputGroupButton`/`InputGroupAddon` primitives exist for the chrome | `input-group/` folder |
| Validation UX: `errors: string[]` prop renders `key|jsonParams` under the input; generic keys `app.common.validation.minimum`/`maximum` (with `{min}`/`{max}` params) already exist and are used by `checkFieldValue` | `numeric-input.svelte:140-155`, `field-validation.ts` |
| Test suite exists: `useNumericInput.test.ts` — 522 lines covering unsigned, min, filtering, locale display, cursor | `primebrick-fe-v3/src/lib/__tests__/` |
| Numeric-input consumers ("the 4 form builds"): ① `EntityFormPage` (create/update), ② `FiltersPanel` std+adv, ③ `ConfigValueInput` (config list edit), ④ `configurations/create` page (embeds ConfigValueInput via SuperForms). All funnel through `NumericInput` — already single-component | verified |

---

## 1. Contract (user-decided)

### 1.1 Kinds — `money` kind is REMOVED

```ts
type NumericKind = "number" | "bigint" | "decimal";
// float = kind:"number" (JS double semantics)
// bigint = int8 (BigInt math, no decimals)
// decimal = @primebrick/decimal (exact v×10^-scale, never floats for math)
// "money" is NOT a kind — money = kind:"decimal" + uom:{kind:"currency"}
```

**Prop rename explained concretely** (the open question from the questionnaire):

```svelte
<!-- BEFORE -->
<NumericInput type="money" currencySymbol="€" currencyCode="EUR" onCurrencyClick={open} />
<NumericInput type="number" bind:value />

<!-- AFTER -->
<NumericInput kind="decimal" uom={{ kind: "currency", code: "EUR", symbol: "€", on_pick: open }} />
<NumericInput kind="decimal" bind:value />        <!-- pg numeric -->
<NumericInput kind="number" bind:value />         <!-- integer/double -->
<NumericInput kind="bigint" bind:value />         <!-- int8, ref_count -->
```

`type` is dropped entirely — all call-sites are in-repo, clean break (no deprecated alias).

### 1.2 UoM — one prop, closed vocabulary (user spec)

```ts
type NumericUom =
  /** % — no DB sibling field needed. Transforms the canonical value:
   *  IN:  bound 0.1 → displays "10"; bound 10 → displays "1000" (×100)
   *  OUT: user types "10" → emits 0.1 (÷100). Round-trip faithful. */
  | { kind: "percent" }
  /** currency — symbol + CTA opening the host picker (existing
   *  `config.currencySelect` sheet contract). The currency code itself is
   *  PERSISTED on a sibling DB column — mandatory, see §2. */
  | { kind: "currency"; field: string; code: string; symbol: string;
      on_pick?: () => void }
  /** custom — static `symbol` (prefix|suffix), optional `before_return`
   *  hook receiving (canonical, ctx:{kind,uom,props}) → emitted value —
   *  the generalization of the percent transform. Optional `on_pick` CTA
   *  for non-static UoMs whose options come from `source`. */
  | { kind: "custom"; field: string; symbol?: string;
      position?: "prefix" | "suffix"; code?: string;
      source?: NumericUomSource; on_pick?: () => void;
      before_return?: (canonical: string, ctx: NumericUomCtx) => string;
      after_receive?: (canonical: string, ctx: NumericUomCtx) => string };

type NumericUomSource = "currencies" | { entity: string } | { api_url: string; value_field: string; label_field?: string };
```

### 1.3 Steppers — `[+]` inline-start, `[−]` inline-end (user spec)

- `InputGroupButton` `icon-xs` ghost: Plus icon left, Minus icon right — distance = click safety.
- **WCAG spinbutton**: input gets `role="spinbutton"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-valuetext` (locale display); buttons get `aria-label` from i18n keys, `disabled` at bounds / when `disabled`/`readonly`; keyboard `ArrowUp`/`ArrowDown`/`PageUp`/`PageDown`(=±10×step) on the input.
- `steppers?: boolean` — default `true`.

### 1.4 Step

- Default: `"1"` for `bigint`; `"1.0"` for `number`/`decimal` (canonical strings).
- Prop `step?: string` — parsed via `dec()`; MUST satisfy `step ≠ 0` and `|step| ≤ (max − min)` when both bounds exist; **signed step allowed** (a negative step inverts the buttons deterministically).
- Step math: `bigint` → `BigInt` ops; `decimal` → `dec()/add()`; `number` → `Number` ops. **Never float math on bigint/decimal.**
- Step results always clamp to `[min, max]`.

### 1.5 Bounds & unsigned (user spec)

- Typed out-of-bounds at blur: **clamp to min/max AND show the hint** — "non sono ammessi valori inferiori a X" / "non sono ammessi valori superiori a X" — reusing existing keys `app.common.validation.minimum` / `.maximum` with `{min}`/`{max}` params.
- `unsigned`: `'-'` is not an admissible char (already in the composable) **AND** validators must reject negatives — today `unsigned` exists only in `type_config` (config domain). **New authored `MetaColumn.unsigned?: boolean`** so the contract reaches `checkFieldValue` (BE/US wire) and `fieldSpecToZod` (forms) identically; DAL derives it into the column constraints.
- `required`, `min`, `max` as direct component props too — merged with `type_config.validation.rules` (explicit prop wins).

### 1.6 Align

`align?: "left" | "center" | "right"` — **default `right`** (`text-right tabular-nums` — spreadsheet convention; the `#` sigil experiment is dropped). Applies to value AND placeholder.

---

## 2. Contract changes (core + DAL)

### 2.1 `MetaColumn` additions (`entity-meta.ts`)

```ts
/** Numeric unit-of-measure contract — the column's semantic quantity unit.
 *  "percent": pure display transform (×100/÷100) — NO DB sibling needed.
 *  "currency"/"custom": `field` names the SIBLING column that persists the
 *  UoM code per row (mandatory — verified by withColumnConstraints). */
uom?: MetaColumnUom;
/** Unsigned numeric — "-" is rejected by the control AND by wire/form
 *  validation (checkFieldValue). PG has no unsigned types: authored only. */
unsigned?: boolean;
```

```ts
export type MetaColumnUom =
  | { kind: "percent" }
  | { kind: "currency"; field: string; source?: "currencies" }
  | { kind: "custom"; field: string; source: MetaColumnUomSource; symbol?: string };
```

`format:"money"` stays (wire/zod numeric semantics) but its meaning is re-specified: **money = decimal kind + `uom:{kind:"currency", field}` — `field` becomes mandatory**; `withColumnConstraints` throws if absent.

### 2.2 `withColumnConstraints` (DAL)

- Verify `uom.field` names a real sibling column (construction error otherwise — same discipline as `census.*`+`allow_create`).
- Derive `unsigned` onto the served column when authored.
- No auto-derivation of `uom` (authored semantic — like `options_source`).

### 2.3 `checkFieldValue` (core `field-validation.ts`)

- `unsigned` → `value < 0` → `too_small` issue.
- Numeric compare: accept `Decimal` wire values via `dec()` when the column is `pg_type:"numeric"`/`format:"money"` — `cmp(value, dec(col.min))` instead of `Number()` (precision-parity with the component's clamp).

### 2.4 Kind inference — shared resolver in core

```ts
// core/src/numeric-kind.ts — consumed by UI component, FE dispatcher,
// fieldSpecToZod — ONE mapping, every surface.
export function numericKindOf(col: MetaColumn): NumericKind | null {
  if (col.format === "money" || col.pg_type === "numeric") return "decimal";
  if (col.pg_type === "bigint" || col.type === "ref_count") return "bigint";
  if (col.format === "number" || col.type === "number" ||
      ["integer","smallint","double precision","real"].includes(col.pg_type ?? "")) return "number";
  return null;
}
```

### 2.5 `fieldSpecToZod` fix (UI)

Numeric binding becomes canonical-string aware: `z.preprocess` coerces the string per kind (`BigInt` for bigint, `dec()` for decimal, `Number` for number) before `checkFieldValue` — fixes the latent `z.number()`-vs-string mismatch instead of working around it.

---

## 3. Component implementation (`@primebrick/ui`)

### 3.1 `useNumericInput.svelte.ts` — extended composable

New responsibilities (kept in the composable, component stays chrome):

| Concern | Implementation |
|---|---|
| `kind` getter replaces `type` | `bigint`/`number`/`decimal` |
| uom transform pipeline | `syncFromProp`: canonical → `after_receive` → display raw; `emit()`: display raw → `before_return` → canonical out. Percent = built-in pair {×100, ÷100} implemented with `dec()` math (never float) |
| `step` | parsed once via `dec()`; validation `≠0`, `≤ max−min`; signed ok |
| `stepBy(dir)` | BigInt / Decimal / Number add per kind; clamp to bounds; updates `_rawValue` + emits canonical immediately (buttons are value-commits, not draft edits) |
| `effectiveMin`/`effectiveMax` | merge: prop `min`/`max` > `type_config.rules` > `unsigned→0` |
| clamp-at-blur | `clampValue()` → canonical clamped + `oob_issue` ("minimum"|"maximum") exposed for the hint |
| unsigned | from prop OR type_config; filters `-` chars (existing) |
| `Decimal` ingress | `value` union accepts `Decimal` → `toPG()` canonical |

### 3.2 `numeric-input.svelte` — new anatomy

```
<InputGroup>
  [+] InputGroupButton (icon-xs)          ← steppers?: inline-start
  [€ CTA | symbol]  uom prefix adornment
  <InputGroupInput role="spinbutton" align>
  [uom suffix: % or custom symbol]
  [uom CTA if on_pick]
  [−] InputGroupButton (icon-xs)          ← steppers?: inline-end
</InputGroup>
{translatedError | oob hint}
```

- Currency moves to `uom` spec — keeps the existing CTA anatomy (symbol + code + ChevronDown).
- `%` renders as inline-end `InputGroupText` `%`.
- `data-testid`: `{base}-inc` / `{base}-dec` / `{base}-uom-cta`.
- `placeholder` alignment follows `align` (single text-align on the input covers both — the earlier misalignment was the addon-less Input inside InputGroup; now EVERY branch renders inside InputGroup uniformly when adornments exist, plain `Input` when `steppers:false && !uom`).

### 3.3 package.json

`"@primebrick/decimal": "workspace:*"` added to `@primebrick/ui` deps (workspace member verified).

---

## 4. Call-site migrations (FE)

| Site | Change |
|---|---|
| `ConfigValueInput` money branch | `kind="decimal"` + `uom={{kind:"currency", field:"type_config", code, symbol, on_pick: openCurrencyPicker}}` — config keeps `type_config.currency` persistence (its "DB field" IS the entry's own type_config) |
| `ConfigValueInput` bigint/number | `kind={type}` direct map |
| `FormFieldDispatcher` `control==='number'` | `kind={numericKindOf(column)}` + `uom` resolved from `column.uom` + sibling `bind:uomValue` (new prop `record`/`uomValue` so the currency column writes back) + `min/max/unsigned` from column |
| `FiltersPanel` | same dispatcher path — uom adornment display-only on filter surface (no sibling field); percent transform applies to the serialized value (canonical fraction goes on the wire) |
| `numValue` | union extended `string \| number \| bigint \| Decimal` |

---

## 5. i18n (BE signed patch)

New keys (existing seeds verified missing): `app.widgets.numeric_input.increment` ("Increment value"), `app.widgets.numeric_input.decrement` ("Decrement value") — aria-labels only, hidden text per copy rules. Reuse `app.common.validation.minimum`/`maximum` for OOB hints.

---

## 6. Tests & verification

| Layer | What |
|---|---|
| `useNumericInput.test.ts` (extend) | percent in/out (0.1→"10", 10→"1000", "10"→0.1), step default/clamp/sign/zero-reject, unsigned, decimal kind, align prop, `before_return` custom hook |
| core `field-validation.test.ts` | unsigned negative reject, Decimal-bound min/max |
| DAL `column-constraints` tests | `uom.field` missing → throws; derived unsigned |
| `field-spec-to-zod` | canonical-string → correct kind coercion |
| Manual/E2E | steppers click ±, ArrowUp/Down, currency CTA opens sheet, % display |

**Verification commands**: `pnpm check` + `pnpm check:standards` + `pnpm build` (UI) → `pnpm check` + standards + `vitest run` (FE) → `tsc --noEmit` + tests (core) → `pnpm build` + tests (DAL) → BE typecheck.

---

## 7. Explicit non-goals / flags

- ext-json `"12.34d"` revival — OUT (bound value stays canonical PG string).
- Auto-derivation of `uom` from entity decorators — authored in meta only (decorator wiring can come later; the meta contract is the deliverable).
- `checkFieldValue` min/max for `double precision` beyond `Number` precision — inherent limit, documented.
- No `money` kind survives — `format:"money"` remains a wire/format semantic only.
