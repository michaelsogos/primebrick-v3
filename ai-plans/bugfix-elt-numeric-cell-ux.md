# bugfix-elt-numeric-cell-ux — STATUS: DONE (as-built record)

> Recorded after implementation — the fix shipped via the verify→fix flow
> requested in-chat; this file is the retroactive plan/evidence register.

## Objective

ELT rule: **every `type:"number"` cell renders locale-formatted** (group +
decimal separators via `Intl.NumberFormat`, UoM-aware) **and right-aligned
with tabular digits** — by default, unless a column explicitly opts out.
Headers stay left-aligned (explicit user requirement).

## Root cause (why it was lost)

Three independent seams had eroded, not one:

1. `entity-list-table/utils/cell-formatting.ts` — `getAuditFieldValue`
   accepted the injected `formatListCellValue` param but **never called
   it**: every non-date cell fell back to `toDisplayString(raw)` =
   `String(raw)`. The param was a fossil of the intended seam.
2. `@primebrick/ui` `formatListCellValue` itself had no `number` branch —
   only `date`/`datetime`; `number` hit the same `toDisplayString` floor.
3. `cell-styling.ts` `entityListDataCellAlignClass` gave `text-right` only
   to `version`; `type:"number"` inherited the default left alignment.

The `uom` contract (`@primebrick/core` `MetaColumnUom`: `percent` /
`currency{field}` / `custom{field,symbol}`) existed in meta but no cell
renderer consumed it.

## What shipped

### primebrick-v3-ui `25bda2c`

- `src/lib/utils/format-date.ts` — `formatListNumberValue(column, raw, lang,
  row?)` + `formatListCellValue` number branch. `Intl.NumberFormat` cached
  per `locale@@init-key`.
  - `percent` — canonical fraction → display points (`0.125` → `12.5%`)
  - `currency` — ISO code from `row[uom.field]` → `Intl` currency format;
    malformed/missing code falls back to `"9.99 EUR"` suffix form
  - `custom` — `uom.symbol` wins, else the row's code as suffix
  - bigint / numeric strings accepted
- `src/lib/utils/index.ts` — export
- `test/format-list-number-value.test.ts` — 11 cases

### primebrick-fe-v3 `1fd8b6c`

- `utils/cell-formatting.ts` — `getAuditFieldValue` routes non-auditable
  cells through the formatter **with the row** (`uom.field` siblings);
  auditable `*_by` keeps the `_name` resolution path untouched.
- `utils/cell-styling.ts` — `type:"number"` → `text-right tabular-nums`.
- `src/lib/__tests__/elt-numeric-cell.test.ts` — 9 pins (wiring spy,
  real formatter locale output, percent/currency uom, auditable bypass,
  blankish dash, align matrix).
- `src/e2e/elt-numeric-cell-ux.spec.ts` — live `/system/job/runs`
  (outcome filter "Dispatched"→"All") asserts `td.text-right.tabular-nums`
  exists and every numeric cell matches the formatted-number shape.

## Verification

- UI suite: 10 files / 85 tests green; svelte-check clean; standards clean
- FE: pin suite 9/9; svelte-check 0/0; `check:standards --profile=fe` clean
- E2E: `elt-numeric-cell-ux.spec.ts` 1 passed on real dev stack

## Notes / deviations

- `it-IT` does not group 4-digit integers (ICU `min2` grouping) — tests use
  5-digit values where grouping must show.
- Header alignment was attempted then reverted — headers stay left by
  explicit requirement; never in scope.
- `version` keeps its own `text-right` (audit-group tail badge), without
  `tabular-nums`.
- `getAuditableDisplayValue` in `auditable-fields.ts` still calls
  `toDisplayString` directly — correct: it serves only `*_by` name columns.
