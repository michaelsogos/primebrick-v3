# REFACTOR — MetaColumnUom: kind-specialized UoM categories
n## Status: 🟢 DONE — all 8 tasks verified in code (core/dal/ui/us/fe commits, E2E green, docs shipped). Archived fully done.

## Context (TIC)

`MetaColumnUom.custom` is overloaded: fixed Intl unit / fixed symbol /
per-row code are all "custom". The user wants the Intl-sanctioned space
split into **macro-categories carried by `kind` itself**, hardcoded once
in `@primebrick/core` (Intl does NOT expose `unitCategory` — CLDR
grouping is unreachable from JS, so we census it).

`currency` keeps its kind (works for both Intl `style:"currency"` and our
currency-management logic). `custom` shrinks to the genuinely-custom
cases: per-row code with a non-standard vocabulary (`field`+`source`)
and fixed arbitrary suffix (`symbol`).

## Contract — `primebrick-v3-core/src/entity-meta.ts`

```ts
export type MetaColumnUomKind =
  | 'length' | 'mass' | 'volume' | 'area' | 'time'
  | 'temperature' | 'digital' | 'angle';

/** CLDR grouping census — hardcoded once, reused everywhere. Every
 *  member MUST be in `Intl.supportedValuesOf('unit')` (ICU-versioned). */
export const UNIT_CATEGORIES: Record<MetaColumnUomKind, readonly string[]>;

export type MetaColumnUom =
  | { kind: 'percent' }                                  // adimensional, own kind
  | { kind: 'currency'; field: string; source?: 'currencies' }
  | { kind: MetaColumnUomKind; unit: string }            // FIXED unit
  | { kind: MetaColumnUomKind; field: string }           // PER-ROW unit, category-constrained
  | { kind: 'custom'; field: string; source: MetaColumnUomSource; symbol?: string }
  | { kind: 'custom'; symbol: string };
```

- `{kind:'time', unit:'millisecond'}` — fixed, `style:"unit"`.
- `{kind:'time', field:'duration_unit'}` — per-row unit constrained to
  the category; **no `source` needed — the category IS the picker
  vocabulary** (NumericUomSpec.options = localized category units).
- Compound `-per-` units (meter-per-second): NOT in the flat sanctioned
  list → rejected by validation; reserved for a future `speed`/`rate`
  category, never shoehorned.
- `{kind:'custom', unit}` DIES — migrated usage below.

### Category census (all 45 runtime-sanctioned covered)

| kind | units |
|---|---|
| length | millimeter centimeter meter kilometer inch foot yard mile mile-scandinavian |
| mass | gram kilogram ounce pound stone |
| volume | milliliter liter gallon fluid-ounce |
| area | acre hectare |
| time | nanosecond microsecond millisecond second minute hour day week month year |
| temperature | celsius fahrenheit |
| digital | bit kilobit megabit gigabit terabit byte kilobyte megabyte gigabyte terabyte petabyte |
| angle | degree |
| (percent) | stays `kind:'percent'` — adimensional, already own kind |

## TOC

| # | Task | Repo |
|---|---|---|
| 1 | `UNIT_CATEGORIES` + `MetaColumnUomKind` + union rewrite + `UNIT_TO_CATEGORY` reverse map | core |
| 2 | `withColumnConstraints`: category kinds → `unit` XOR `field`; `unit` ∈ sanctioned ∩ category; `field` → physical sibling; custom → `field`+`source` XOR `symbol` | dal |
| 3 | `formatListNumberValue`: category kinds resolve unit (fixed or row[field]) → `style:"unit"` | ui |
| 4 | `numericUom` dispatcher: category kinds → fixed `unit` = localized adornment; `field` = adornment + `options` from `UNIT_CATEGORIES[kind]` | fe |
| 5 | Migrate `job_run.duration_ms` → `{kind:'time', unit:'millisecond'}` | us |
| 6 | Tests: dal XOR/category membership; ui category format; fe pins | all |
| 7 | Docs: core entity-meta (taxonomy v2), us conventions, fe/be schema sheets, ui numeric-input | all |
| 8 | Gates + E2E rerun (`elt-numeric`, `elt-json`) + commits | all |

## Open decision

`{kind:'<category>', field}` per-row variant: included (picker gets the
category vocabulary for free — no `source` prop). Flag if unwanted.
