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

## Addendum 6 — combobox async-loading UX (same session, user-ratified)

API-backed combobox popovers opened empty during the fetch — the user
ratified the anatomy: the popover opens IMMEDIATELY, a muted loading line
(`app.common.loading_data`, new key × 7 languages, be patch
20270101180000_i18n_combo_loading) replaces the false "no results", and a
2px scan strip sits flush at the popover's top edge rendering the SAME
animated primary-gradient as the ELT reload strip (dim underlay +
ping-pong comet, self-contained scoped CSS in ComboSelect — no consumer
stylesheet needed). Wiring census: entityRef and auditActors already fed
`loading`; systemRoles.state.loading was NOT passed — fixed. Census /
IANA tz / i18n_key vocabularies derive from already-loaded memory (shell
census, static IANA list, $dict) — no per-combobox fetch, nothing to
wire. Verified live with a route-delayed probe on the sequences advanced
filter ref combobox: strip visible + muted line rendered mid-fetch
(screenshot evidence). Commits: ui+1, fe+1, be+1.

## Addendum 7 — columns-panel type glyphs (same session, user-reported)

The column-VISIBILITY picker (entity.columns sheet) rendered the declared
icon alone — rows without one carried no glyph. Same doctrine as the
filter field picker: it IS a picker surface, so rows resolve through
metaColumnIcon (declared → options_source → format/type). ColumnLike
widened to the helper input shape; permanent E2E asserts every
columns-toggle row carries one svg (green end-to-end, job_schedule).
Commit: fe+1.

## Addendum 8 — combobox popover open latency (same session, user-reported ×2)

The user re-tested the loading UX on the REAL scenario (sequences →
advanced → desc_key → Value) and the popover still appeared late, already
full. Instrumented probe: ZERO network in the window — the delay was the
synchronous DOM mount of thousands of rows, TWO compounding causes:

1. ComboSelect had no render cap — every matching row mounted upfront
   (1.8s measured on the broad `.entities.` vocabulary). Fix: render
   window (initial 50, progressive +50 on scroll-to-bottom, truncation
   hint `app.common.combo_more_items.one/.other` with the hidden count),
   re-armed on search/reopen, never on options identity. onLoadMore fires
   only once the local window is exhausted.
2. FiltersPanel never received translation_key — the i18n_key filter
   vocabulary fell back to the broad `.entities.` scope (foreign keys of
   every module). Threaded end-to-end; vocabulary now scopes to
   `.entities.<tk>.rows.`.

Measured post-fix: shell visible in 124ms (was 1795ms). Permanent E2E ×2:
the exact user scenario (shell < 1s) + the deterministic large-vocabulary
IANA surface (cap ≤ 51, hint with count, scroll discloses more). OPEN
FINDING: zero `.entities.*.rows.*` translations exist in the dev DB (e2e
rows are API-created without translation writes), so the scoped vocabulary
is honestly EMPTY — before the fix it showed irrelevant foreign noise.
Design question parked for the user: should the FILTER vocabulary be
keys-in-use (distinct column values, audit-actors style) instead of
catalog keys? Commits: ui+1, fe+1, be+1 (patch 20270101190000).

## Addendum 9 — picker census CLOSED: search-in + sort dropdown (user-reported)

The user caught the same declared-only erasure in the search-in selector —
the lesson: fix the whole CLASS, not one surface per complaint. Full census
of column-picker surfaces: (1) advanced-filter field picker, (2) bulk
editor add-field, (3) columns-visibility panel, (4) search-in panel,
(5) sort dropdown — all five now consume metaColumnIcon. (4) had the same
ColumnLike type erasure; (5) rendered no glyph at all. Permanent E2E x2
lock rows-carry-svg on both. In-place decorations (table headers, form
labels) keep declared-only BY DESIGN — boundary documented in the helper.
Commit: fe+1.
