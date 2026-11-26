# Bugfix — type icons in the ELT advanced-filter field picker

## Problem (user-reported 2026-11-26)
The advanced filter field dropdown shows bare text labels. The type-icon
convention (`col.icon ?? schemaTypeIcon(columnSchemaLeaf(col))._icon`) exists
and is already wired in the bulk-editor add-field picker — the filters panel
never got it (`_icon: c.icon ?? ''`).

## Ratified direction
Enforcement over verification: a canonical `metaColumnIcon(col)` helper in
`@primebrick/ui` owns the precedence rule (declared metadata icon wins, else
the type-derived glyph); both picker consumers use it. Picker surfaces only —
in-place labels keep the declared-only semantic (bulk-editor distinction).

## Tasks
| # | task | status |
|---|------|--------|
| 1 | ui: `metaColumnIcon` helper + export | done — svelte-check 0 err, 109/109 tests, dist rebuilt |
| 2 | fe: FiltersPanel field combo wired | done |
| 3 | fe: BulkEditorPanel refactored onto the helper | done |
| 4 | verify: typechecks, ui tests+build, runtime probe screenshot | done — E2E icon test green, isolation green; serial-run failure environmental pre-existing |
| 5 | commits ui+fe+workspace | done |

## Addendum — operator clamping on governed vocabularies (same session, user-reported)

The advanced operator dropdown offered contains/startsWith/endsWith on
combobox-valued columns (tz/currencies/census/refs) — unfillable nonsense.
Root cause: `getOperatorsForColumnType` is type-only; `tz` is text.
Fix: core `getOperatorsForColumn(col)` collapses `options_source`/`ref` to
equality; both fe consumers (panel + state sanitizer) wired. E2E asserts
exactly 2 operator rows on a governed field — green. Commits: core+1, fe+1.
