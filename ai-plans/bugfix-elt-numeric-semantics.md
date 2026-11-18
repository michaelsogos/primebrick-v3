# bugfix-elt-numeric-semantics — STATUS: TOC (answers received)

## Objective

`type:"number"` cells format through `Intl.NumberFormat` correctly and
declare their semantics in meta: grouped decimals everywhere, native Intl
units/percent/currency, no raw `String(raw)` paths.

## Decisions (user, locked)

- **Q1 → grouping stays ON.** The defect is the formatter never asked
  for it: `it-IT` resolves `useGrouping:'auto'`→ICU min2 (4-digit
  ungrouped). Fix = `useGrouping:'always'` on every numeric Intl call —
  `fire_seq` renders `1,496`/`1.496` consistently cross-locale.
  Empirical: `Intl.NumberFormat('it-IT',{useGrouping:'always'}).format(1234)` → `"1.234"`.
- **Q2 → `style:'unit'` + Intl-sanctioned identifiers.** `Intl.supportedValuesOf('unit')`
  = 45 units — the same vocabulary we adopt. `duration_ms` → `unit:'millisecond'`
  → `"24 ms"` short / `"24 millisecondi"` long, locale-correct.
- **Q3 → fix + document the standard** in dev-guide AND docs/ai across
  every repo the contract touches. Census done in TIC (see Docs).

## Design

### `MetaColumnUom` (core) — `custom` becomes a 3-way union

```ts
| { kind:"percent" }                                                  // style:'percent' native
| { kind:"currency"; field:string; source?:"currencies" }             // code from sibling
| { kind:"custom"; field:string; source:MetaColumnUomSource; symbol?:string }  // per-row code
| { kind:"custom"; unit:string }                                      // FIXED Intl unit — NEW
| { kind:"custom"; symbol:string }                                    // FIXED arbitrary suffix — NEW
```

- `unit` MUST be ∈ `Intl.supportedValuesOf('unit')` — enforced by
  `withColumnConstraints` at construction (not a TS literal union:
  the sanctioned list is a runtime contract, ICU-versioned).
- XOR: exactly one of `field`/`unit`/`symbol` on `custom`.
- Per-row codes that happen to be sanctioned units (e.g. `"kilogram"`
  from a sibling) ALSO render via `style:'unit'`; non-sanctioned fall
  back to suffix — the resolver is uniform.

### `formatListNumberValue` (ui) — Intl-native branches

| shape | Intl opts |
|---|---|
| plain decimal | `{style:'decimal', useGrouping:'always'}` |
| percent | `{style:'percent', useGrouping:'always', maximumFractionDigits:2}` (native ×100; keeps `12.5%`) |
| currency | `{style:'currency', currency:<sibling>, useGrouping:'always'}` |
| custom sanctioned | `{style:'unit', unit, unitDisplay:'short', useGrouping:'always'}` |
| custom non-sanctioned / symbol | `<grouped decimal> <code>` suffix fallback |

### dal-pg `column-constraints.ts`

- `custom` validation → XOR(`field`+`source`, `unit`, `symbol`).
- `unit` membership check vs `Intl.supportedValuesOf('unit')`.
- `field`+`source` rules unchanged.

### us-v3 `job.meta.ts`

- `duration_ms` → `uom:{kind:'custom', unit:'millisecond'}`.
- `fire_seq` unchanged (plain number — correct under the fixed formatter).
- `redelivery_count` unchanged.

## Tasks

1. **core** — `entity-meta.ts` union + contract comment; `docs/dev-guide/entity-meta.mdx` uom section.
2. **dal-pg** — `column-constraints.ts` XOR + sanctioned-unit check; `docs/dev-guide/api-reference.mdx` or column-types uom constraint.
3. **ui** — `formatListNumberValue` Intl-native rewrite; sanctioned-set
   cache; tests updated (it-IT `1.234`, `24 ms`, `12.5%`, fallback);
   `docs/dev-guide/utilities.mdx` number-cell contract.
4. **us-v3** — `job.meta.ts` duration_ms uom; `docs/dev-guide/conventions.mdx` numeric authoring rule.
5. **fe-v3** — pin tests updated (`elt-numeric-cell.test.ts`: it-IT
   `1.234` now, duration `ms` case, symbol-suffix case); e2e strengthened
   (Duration cell matches `\d+ ms`); `docs/ai/entity-meta-schema.md` +
   `entity-list-pages.md` numeric standard.

### Extensions from the UOM-taxonomy reflection (user, same TOC)

6. **kind-derived display defaults** — `formatListNumberValue` resolves
   `numericKindOf(column)` (already on served meta via injected
   `pg_type`): `bigint` → `maximumFractionDigits:0`; `number`/`decimal`
   → precision-preserving. The class owns the numeric type — the
   formatter must not restate it.
7. **FormFieldDispatcher.numericUom for the new variants** — `unit` and
   `symbol` have no `field`: `u.field` reads undefined today → empty
   adornment. `unit` → adornment via `formatToParts` (extract the unit
   part from `style:'unit'` output); `symbol` → fixed suffix; both
   display-only (nothing to pick).
8. **Case 3 (kind+value both persisted)** — NOT in contract: would need
   the uom KIND per row (`uom:{kind_field:…}`/`kind:'dynamic'`).
   Document as reserved extension in the `MetaColumnUom` comment +
   dev-guide; no implementation (0 consumers).

## Architecture decision (recorded)

- `uom` stays **authored in meta** — it is served-contract semantics,
  same layer as `label_key`/`badge`/`ref`/`avatar.color_field`. Moving
  it to entity decorators would put display needs inside the data model.
- The class owns physical facts only — `pg_type` is injected, and
  `numericKindOf` derives the kind on the served meta (FE decides
  nothing). The uom sibling physicality is class-enforced today.
- Intl unit vocabulary = Unicode CLDR (UTS #35) via ECMA-402 — not
  ISO/RFC/ANSI. `Intl.supportedValuesOf('unit')` is the membership test.

## Acceptance criteria

- `Fire #`: `1,496` en-GB / `1.496` it-IT (grouping consistent).
- `Duration`: `24 ms` (Intl unit, right-aligned); bigint renders zero
  decimals.
- `Redeliveries`: grouped quantity unchanged.
- `withColumnConstraints` throws on `custom` without field/unit/symbol
  and on `unit` outside the sanctioned 45.
- Form input on a `unit`/`symbol` column shows the adornment, display-only.
- All suites green; docs published in each repo.

## Docs census (TIC evidence)

- `uom` declarations in `*.meta.ts`: **0** — first consumer = `duration_ms`.
- `core/docs/dev-guide/entity-meta.mdx` — uom undocumented.
- `ui/docs/dev-guide/utilities.mdx` — `formatListCellValue` undocumented.
- `fe/docs/ai/entity-meta-schema.md`, `entity-list-pages.md` — numeric
  standard spot.
- `us/docs/dev-guide/conventions.mdx` — meta authoring.
- `dal/docs/dev-guide/api-reference.mdx` — constraint doc.
- Rule noted: `docs/ai/*` internal-only, do-not-create-without-approval —
  user explicitly ordered agent-doc coverage → authorized.
