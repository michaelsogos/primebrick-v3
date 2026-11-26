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

## Addendum 2 — timezone type glyph (same session, user-reported)

The tz column rendered the bare-text T in pickers though its combobox
options carry the globe. Fix: `metaColumnIcon` precedence extended —
declared icon → options_source semantic glyph (`iana.tzones`→globe) →
type-derived. Verified live on the sequences advanced picker (globe on
the Time zone row); 5 unit tests pin the precedence. Commit: ui+1.

## Addendum 3 — cadence glyph convention (same session, user-ratified)

revive_every rendered the bare-text T. Ratified: scheduler and reviver
share ONE icon — clipboard-clock (user's pick over calendar-clock) — as
both the type icon (schedule_spec/revive_interval/revive_offset formats
now reach the schema leaf in core) and the widgets' assist CTAs. Verified
live: Renew Every row carries it. Commits: core+1, ui+1.

## Addendum 4 — i18n_key languages glyph (same session, user-reported)

Translation-key columns rendered the bare-text T while their combobox
options carry languages icons. Same fix family: format reaches the leaf
(core), glyph mapped in FORMAT_TYPE_ICONS (ui). 8/8 unit tests green.
Commits: core+1, ui+1.

## Addendum 5 — actor-stamp glyph (same session, user-reported)

revived_by (authored text + audit.actors) rendered the T while created_by
resolved file-key — incoherent for the same semantic. Fix: audit.actors →
user-cog (the ratified actor glyph) in OPTIONS_SOURCE_TYPE_ICONS — uniform
across all writer stamps. Note: created_by changes file-key → user-cog as
a consequence — the coherence the user asked for. 9/9 tests. Commit ui+1.
