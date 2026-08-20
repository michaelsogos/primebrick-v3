# Feature Plan: entities-v2.html — V2 Scroll-Jacking Demo for Entity List Table

> Status: DRAFT — awaiting user approval (keyword `PROCEED`)
> Repo: `primebrick` workspace → `temp/pb-demo/entities-v2.html` (prototype, standalone HTML)
> Author: Devin (GLM-5.2 High)
> Date: 2026-07-29
> Reference: `temp/pb-demo/shell-v2.html` (the approved V2 pattern to mirror)
> Source of truth for feature behavior: `primebrick-fe-v3/src/lib/components/entity-list-table/` (verified during planning)

---

## 1. Objective

Create `temp/pb-demo/entities-v2.html` — a V2 conversion of `temp/pb-demo/entities.html`
that follows the **same V2 pattern as `shell-v2.html`**: dark demo body, fixed title bar,
scroll hint, real `--pb-*` Primebrick tokens, a **single** screen-mock (no scene
duplicates), a custom scroll-jacking IIFE with a `PHASES` array, extraction/reassembly
transforms, annotation cards + SVG connectors, section-claims, progress rail, scene dots,
phase label, glow borders, and a reduced-motion fallback.

The V2 replaces the v1 scene-based `initScrollDemo` approach (14 full screen duplicates)
with the extraction/reassembly engine. **Every feature is treated as a candidate for
extraction** — UI pieces physically lift out of the content area, get annotated, then
reassemble — grouped under 7 section-claims.

**Empirical, zero assumptions.** Every feature listed in §3 was verified by reading the
actual FE source during planning. The 2 features missing from v1 (server-side pagination,
view-selected-only + cross-page persistence) were confirmed in code and are added.

---

## 2. Confirmed decisions (from user Q&A)

| # | Question | Decision |
|---|----------|----------|
| 1 | Feature count | **15** (v1 had 14; added server-side pagination; merged row-selection + view-selected-only/cross-page-persistence into one phase) |
| 2 | Extraction rhythm | **Hybrid**: 7 section-claims (marketing structure) + 15 sub-extractions, each with its own annotation + connector |
| 3 | Screen-mock base state | App shell with **collapsed sidebar**; content area takes the majority of space and holds the Customers table. Disassembly **starts by zooming out from the content area's position** in the mock (not from the whole mock centered like shell-v2). |
| 4 | Track height | **2000vh** (match shell-v2 pacing) |
| 5 | Disassembly scope | **Most features disassemble**, not just the 3 obvious panels. E.g. search input + Search In panel, filter chips bar, sort header, row checkboxes, pagination footer, view-selected-only toggle, etc. all extract. |
| 6 | Shared assets | Reuse `styles.css`, `icons.js`, `scroll.js` from `temp/pb-demo/` (same as shell-v2). The V2 does NOT call `initScrollDemo` — it uses its own inline IIFE (like shell-v2). |

---

## 3. Empirical findings (VERIFIED during planning — not deferred)

### 3.1 V2 reference — `temp/pb-demo/shell-v2.html` (1944 lines, the pattern to mirror)

Structure to replicate:
- `<head>`: title; `<link rel="stylesheet" href="styles.css">`; `<script src="icons.js?v=lucidefix">`; `<script src="scroll.js">`; **large inline `<style>`** (~810 lines) defining `--pb-*` tokens, `.demo-body`, `.demo-title-bar`, `.demo-scroll-hint` + `@keyframes scroll-hint-pulse`, `.ambient-blob` (opacity 0.2), `.section-claim*`, `.scroll-track/.scroll-stage/.scroll-canvas`, `.screen-mock` + `.browser-bar`/`.browser-dots`/`.browser-url`, `.app-body`, sidebar/topbar/content classes, `.*-extracted` overlays, `.ann-label`/`.ann-card`/`.ann-title`/`.ann-desc`, `.connector-svg`/`.conn-line`/`.conn-dot`, `.progress-rail`/`.scene-dots`/`.scene-dot`/`.phase-label`, `.demo-footer`, `@property --gradient-angle` + `@keyframes rotate-gradient` for glow borders, `@media (max-width: 900px)` blocks.
- `<body class="demo-body">`: ambient blobs; `.demo-title-bar`; `.demo-scroll-hint` `#scroll-hint`; `.section-claim*` (sidebar/topbar/content/final); `.progress-rail` > `#rail-fill`; `.scene-dots` `#dots`; `.phase-label` `#phase-label`; `.scroll-track` `#track` (2000vh) > `.scroll-stage` `#stage` > `.scroll-canvas` `#canvas` containing: `.screen-mock` `#screen-mock` (single, with `.browser-bar` + `.app-body`); `.*-extracted` overlays (duplicates of the regions); `.ann-label` cards; SVG `<defs>` + `.connector-svg` `#connectors` with `<line class="conn-line">` + `<circle class="conn-dot">` per annotation; `.demo-footer`.
- Inline `<script>` IIFE: grabs elements; `reducedMotion` fallback; `PHASES` array (start/end progress); `*_ANNOTS` arrays (`{id, exId/tbId/ctId, annId, lineId, dotId}`); builds scene dots with click-scroll; `lerp`/`clamp01`/`smoothstep`; `drawConnector` + per-region `update*Connectors`; `position*Annotations`; `update()` (progress from track rect; rail fill; scroll-hint fade; section-claim opacity curves; phase tracking + dot/label; screen-mock transform; extraction + reassembly transforms; annotation fade; connector drawing; SVG size); passive `scroll` + `resize` listeners; initial `update()`.

### 3.2 v1 source — `temp/pb-demo/entities.html` (333 lines, what V2 replaces)

- Uses `initScrollDemo` with 14 scenes (`scene-0`…`scene-13`), track `1400vh`. Each scene = full `.device-frame`/`.mock-app` duplicate + `.annotation` card. No inline `<style>` (relies on `styles.css`).
- **Missing**: server-side pagination (only a tiny `mock-pagination` "4 of 247" + prev/next); view-selected-only; cross-page selection/scroll persistence.
- **Keep from v1**: the CRM Customers mock data (Acme/Globex/Initech/Umbrella, columns Name/Email/Status/Created), the feature copy in annotations, the referenced source filenames.

### 3.3 Verified FE source for each feature (primebrick-fe-v3)

All paths below were read during planning. These define what each V2 sub-extraction must
show and which UI elements to extract.

| # | Feature | Verified source | What to extract in V2 |
|---|---------|-----------------|----------------------|
| 1 | Table renders from metadata | `EntityListTable.svelte` | The table itself (content area zooms out; columns ordered sticky→data→auditing) |
| 2 | Search + Search In | `SearchBar.svelte` + `SearchInPanel.svelte` | Search input (with typed query + `<mark>` highlight) + Search In panel (field checkboxes) |
| 3 | Standard filters | `FilterBar.svelte` + `useFilterPersistence` | Filter-chips bar (chips + Clear-all) |
| 4 | Advanced filter builder | `FiltersPanel.svelte` + `types.ts:228-242` | The advanced filter panel (Standard/Advanced tabs, column/operator/value, AND/OR, Add filter) |
| 5 | IANA datetime toggle | `TableCell.svelte:69-87` + `browser-iana-timezone.ts` | The Created column header (Record/Browser toggle) + a cell showing datetime + amber IANA badge |
| 6 | Column selector | `ColumnSelectorPanel.svelte` + `useColumnOrder.svelte.ts` | Column selector panel (Sticky/Data/Auditing groups, checkboxes, drag grips, Reset) |
| 7 | Sticky columns | `useStickyColumns.svelte.ts` + `cell-styling.ts` | A wide table horizontal-scroll track with the sticky column's gray chrome + right-edge shadow |
| 8 | Row selection + view-selected-only + cross-page persistence | `useSelection` + `useRowRangeSelection` + `useClientSelection.svelte.ts` + `SelectionCounter.svelte` + `useScrollPreservation.svelte.ts` | (a) Row checkboxes + brush/range indicator; (b) the SelectionCounter eye toggle (Eye/EyeOff); (c) a "no server call" + preserved-scroll-left callout. **Merged phase.** |
| 9 | Sorting — 3-state cycle | `useSorting.svelte.ts` + `handlers/sorting.ts:46-57` | The sorted column header (asc/desc/null indicator) |
| 10 | View modes | `ViewModeToggle` + `CardGrid` + `CardList` | The view-mode toggle (list/grid/layers) + a sample card |
| 11 | Deletion filter | `DeletionFilterToggle` + `useDeletionFilter` | The Active/Deleted/All toggle + a deleted row (red chrome + opacity) |
| 12 | CRUD row actions | `useRowActions.svelte.ts` + `dialogs/` | The row-actions cell (Edit/Preview/Duplicate/Delete/Change-password) |
| 13 | Bulk actions | `useBulkActions` + `BulkActions.svelte` | The bulk-actions toolbar (3 selected + Bulk delete/duplicate/export/restore) |
| 14 | Preview panel | `PreviewPanel.svelte` + `usePreviewPanel` | The slide-out preview sheet (Preview — Acme Corp, prev/next, field grid) |
| 15 | Server-side pagination | `TableFooter.svelte` + `Pagination.svelte` + `customers/+page.svelte` (`onPageChange`→`loadRows` with `page`+`page_size` query params) | The table footer (range `1-25 / 247`, page-size dropdown `[10,25,50,100]`, first/prev/next/last buttons) |

### 3.4 Verified behaviors for the merged #8 phase (the most complex)

From `useClientSelection.svelte.ts` (read in full):
- `showSelectedOnly` toggle → `viewRows` switches to `orderedSelectedRows.slice(...)` — **client-side paging of the selection, no server calls**.
- `selectedRowByKey` Map merges newly-loaded rows with previously-stored selections (`untrack` preserves old entries) → **selection survives server page changes**.
- On server reload (`rowsLoading` flips true), `showSelectedOnly` auto-exits and `clientSelectedPage` resets to 1.

From `useScrollPreservation.svelte.ts` (read in full):
- Captures `scrollLeft` of `[data-slot=table-container]` **before** the loading skeleton replaces rows; restores it after loading ends (queueMicrotask + rAF double-restore).

From `SelectionCounter.svelte` (read in full):
- Eye/EyeOff toggle button; `aria-pressed={showSelectedOnly}`; titles "Show only selected rows on this page" / "Show all rows".

From `TableFooter.svelte` (read in full):
- `footerUsesClientPaging = rowSelectionEnabled && showSelectedOnly`; when true, page buttons mutate `clientSelectedPage` (not `onPageChange`); range shows `orderedSelectedRows.length` as total.

---

## 4. Final grouping: 7 sections × 15 sub-extractions

| Section | Section-claim title (marketing) | Sub-extractions (features) |
|---------|-------------------------------|----------------------------|
| 1. The Table | "One table, metadata-driven." | #1 metadata rendering, #15 server-side pagination |
| 2. Search & Filter | "Find anything, filter everything." | #2 search + Search In, #3 standard filter chips, #4 advanced filter builder |
| 3. Column Management | "Your columns, your rules." | #5 IANA datetime toggle, #6 column selector, #7 sticky columns |
| 4. Selection & Cross-page | "Select across pages. Nothing lost." | #8+#16 row selection + view-selected-only + cross-page persistence (merged) |
| 5. Sorting & Row Actions | "Sort in three states. Act on any row." | #9 sorting 3-state, #12 CRUD row actions |
| 6. View Modes & Deletion | "See it your way. Even the deleted." | #10 view modes, #11 deletion filter |
| 7. Bulk Ops & Preview | "Act on hundreds. Inspect any one." | #13 bulk actions, #14 preview panel |

**Total: 15 sub-extractions across 7 section-claims.**

---

## 5. Screen-mock design (per user instruction)

- **Base state**: app shell with **collapsed sidebar** (narrow rail, icons only — mirror the
  shell-v2 `.pb-sidebar` but in collapsed form). Content area takes the majority of the
  width and holds the Customers table (4 rows: Acme/Globex/Initech/Umbrella, columns
  Name/Email/Status/Created, pagination footer).
- **Browser bar**: `🔒 app.primebrick.io/customers` (matching v1's URL).
- **Disassembly origin**: the first extraction **zooms out from the content area's
  position** inside the mock — i.e. the content area scales up and slides to center,
  leaving the collapsed sidebar + topbar behind in the mock — then the relevant UI piece
  extracts from the content area. This differs from shell-v2, which zoomed the whole mock.
- **Collapsed sidebar elements** (kept in mock, not extracted): org avatar, module icon,
  nav icons, profile avatar, health dot — same as shell-v2 sidebar but `width: ~60px`,
  icons only, no labels.
- **Topbar** (kept in mock): toggle, search, tz, lang, errors, notif, AI, theme — same as
  shell-v2 `.pb-header` (these are the shell's, not the entity table's, so they stay).

### Extracted overlays (duplicates that slide/zoom out of the content area)

Each sub-extraction has a `.*-extracted` overlay (a duplicate of the UI piece) that
animates out of the content area's position. Naming follows shell-v2's `id` convention:

- `#table-extracted` (the table content area itself, for #1)
- `#search-extracted` + `#searchin-extracted` (#2)
- `#filterchips-extracted` (#3)
- `#advfilter-extracted` (#4)
- `#datetime-extracted` (#5)
- `#colsel-extracted` (#6)
- `#sticky-extracted` (#7)
- `#selection-extracted` + `#viewselected-extracted` (#8 merged)
- `#sorting-extracted` (#9)
- `#viewmode-extracted` (#10)
- `#deletion-extracted` (#11)
- `#rowactions-extracted` (#12)
- `#bulk-extracted` (#13)
- `#preview-extracted` (#14)
- `#pagination-extracted` (#15)

Each has a matching `.ann-label` card + `<line class="conn-line">` + `<circle class="conn-dot">`
with ids `ann-<id>`, `line-<id>`, `dot-<id>`.

---

## 6. PHASES array (17 phases over 2000vh)

Progress ranges are non-uniform (annotation phases get more room, like shell-v2). The
section-claim for each section fades in at the section's first phase and out at the
section's last phase (computed via smoothstep, same as shell-v2's claim curves).

| Idx | Name | Start | End | Section | What happens |
|-----|------|-------|------|---------|--------------|
| 0 | The Entity List Table | 0.00 | 0.05 | — | Intro: title visible, screen-mock centered, content area zooms out from mock position |
| 1 | Metadata-driven table | 0.05 | 0.12 | 1 | `#table-extracted` zooms out to center; annotation: "renders from entity metadata" |
| 2 | Server-side pagination | 0.12 | 0.19 | 1 | `#pagination-extracted` lifts out of footer; annotation: "page + page_size → BE" |
| 3 | Search & Search In | 0.19 | 0.27 | 2 | `#search-extracted` + `#searchin-extracted` extract; annotations |
| 4 | Standard filters | 0.27 | 0.34 | 2 | `#filterchips-extracted` extracts; annotation |
| 5 | Advanced filter builder | 0.34 | 0.42 | 2 | `#advfilter-extracted` extracts; annotation |
| 6 | IANA datetime toggle | 0.42 | 0.49 | 3 | `#datetime-extracted` extracts; annotation |
| 7 | Column selector | 0.49 | 0.56 | 3 | `#colsel-extracted` extracts; annotation |
| 8 | Sticky columns | 0.56 | 0.63 | 3 | `#sticky-extracted` extracts (horizontal scroll track); annotation |
| 9 | Selection & cross-page | 0.63 | 0.72 | 4 | `#selection-extracted` + `#viewselected-extracted` extract; annotations: "selection survives paging", "view-selected-only = client paging, no server calls", "scroll-left preserved" |
| 10 | Sorting — 3-state | 0.72 | 0.79 | 5 | `#sorting-extracted` extracts; annotation |
| 11 | CRUD row actions | 0.79 | 0.86 | 5 | `#rowactions-extracted` extracts; annotation |
| 12 | View modes | 0.86 | 0.91 | 6 | `#viewmode-extracted` extracts; annotation |
| 13 | Deletion filter | 0.91 | 0.96 | 6 | `#deletion-extracted` extracts; annotation |
| 14 | Bulk actions | 0.96 | 0.985 | 7 | `#bulk-extracted` extracts; annotation |
| 15 | Preview panel | 0.985 | 0.995 | 7 | `#preview-extracted` slides out; annotation |
| 16 | The Entity List Table | 0.995 | 1.00 | — | Conclusion: final claim "One table. Every feature. Zero config." |

**Scene dots** (5, like shell-v2): Start / Table / Search & Filter / Columns / Selection /
Actions / Conclusion — actually 7 dots (one per section) + Start. Following shell-v2's
5-dot pattern but adapted: I'll use **7 dots** (Start + 6 section landmarks) or keep 5
grouping sections. **Decision: 7 dots** — Start, Table, Search & Filter, Columns,
Selection, Actions, Conclusion — each click-scrolls to the section's mid-phase.

**Phase label** (bottom, like shell-v2): shows current phase name.

---

## 7. Extraction mechanics (per sub-extraction)

Each sub-extraction follows shell-v2's proven mechanic, adapted to extract from the
**content area** (not the whole mock):

1. **Extract**: the `.*-extracted` overlay starts at the content area's position inside
   the mock (measured via `getBoundingClientRect` of the source element in the mock, like
   shell-v2's `mockContent = screenMock.querySelector('.pb-content')`). It slides/zooms
   to a centered or side position, scaling from the mock's current scale to 1.0.
2. **Annotate**: `.ann-label` cards fade in (smoothstep), positioned relative to the
   extracted element via `position*Annotations()` (clamped to canvas bounds, min-gap
   enforced). SVG connectors drawn from annotation edge to extracted element edge.
3. **Reassemble**: the overlay slides/zooms back into the content area; annotations +
   connectors fade out. The next sub-extraction begins.

**Section-claims**: 7 fixed-position claim cards (alternating right/left like shell-v2's
sidebar/topbar claims). Each fades in during its section's first phase, out during its
last phase. The final conclusion claim (phase 16) is centered.

**Glow borders**: `.*-extracted.glow-border` when an overlay reaches its end position
(conic-gradient animated border, same `@property --gradient-angle` + `@keyframes
rotate-gradient` as shell-v2).

**Reduced motion**: set the screen-mock to a static scaled state and return (same as
shell-v2).

---

## 8. File structure to generate

`temp/pb-demo/entities-v2.html` (~1800-2200 lines estimated), single file:

```
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset/viewport>
  <title>Primebrick Demo — Entity List Table</title>
  <link rel="stylesheet" href="styles.css">
  <script src="icons.js?v=lucidefix"></script>
  <script src="scroll.js"></script>
  <style>
    /* ~700-850 lines: mirrors shell-v2 inline style block, adapted:
       - --pb-* tokens (same)
       - .demo-body, .demo-title-bar, .demo-scroll-hint (same)
       - .ambient-blob (same, opacity 0.2)
       - 7 .section-claim-* variants (right/left alternating + final centered)
       - .scroll-track/.scroll-stage/.scroll-canvas (same)
       - .screen-mock + .browser-bar + .app-body (same)
       - .pb-sidebar (COLLAPSED variant: width ~60px, icons only)
       - .pb-header (same as shell-v2 topbar)
       - .pb-content (content area, holds the customers table)
       - Entity table styles: .pb-table, .pb-table-wrap, th/td, .sticky-col,
         .mock-badge, .mock-checkbox, .mock-chip, .mock-pagination, etc.
         (ported from styles.css .mock-* but re-skinned with --pb-* tokens)
       - 15 .*-extracted overlay classes
       - .ann-label/.ann-card/.ann-title/.ann-desc (same)
       - .connector-svg/.conn-line/.conn-dot (same)
       - .progress-rail/.scene-dots/.scene-dot/.phase-label (same)
       - @property --gradient-angle + @keyframes rotate-gradient (same)
       - @media (max-width: 900px) blocks
    */
  </style>
</head>
<body class="demo-body">
  <!-- ambient blobs -->
  <!-- .demo-title-bar: "The Entity List Table" / subtitle -->
  <!-- .demo-scroll-hint #scroll-hint -->
  <!-- 7 .section-claim-* cards -->
  <!-- .progress-rail > #rail-fill -->
  <!-- .scene-dots #dots (7 dots) -->
  <!-- .phase-label #phase-label -->
  <!-- .scroll-track #track (2000vh) > .scroll-stage #stage > .scroll-canvas #canvas -->
    <!-- .screen-mock #screen-mock: browser-bar + app-body (collapsed sidebar + topbar + content with customers table) -->
    <!-- 15 .*-extracted overlays (duplicates of each UI piece) -->
    <!-- 15 .ann-label cards -->
    <!-- SVG <defs> + .connector-svg #connectors with 15 line+circle pairs -->
  <!-- .demo-footer: Back to Demo Hub -->
  <script>
    /* IIFE mirroring shell-v2's:
       - grab elements (track, screenMock, content area, all extracted overlays, railFill, dots, phaseLabel, canvas, connectorsSvg)
       - reducedMotion fallback
       - PHASES[17] (from §6)
       - SUB_ANNOTS[15] ({id, exId, annId, lineId, dotId})
       - build 7 scene dots with click-scroll
       - lerp/clamp01/smoothstep
       - drawConnector + updateSubConnectors (generic, per extracted overlay)
       - positionSubAnnotations (generic, clamped)
       - update(): progress; rail fill; scroll-hint fade; 7 section-claim opacity curves; final claim; phase tracking + dot/label; content-area zoom-out-from-mock transform; per-sub-extraction extract/reassemble transforms; annotation fade; connector drawing; SVG size
       - passive scroll + resize listeners; initial update()
    */
  </script>
</body>
</html>
```

---

## 9. Acceptance criteria

1. `temp/pb-demo/entities-v2.html` exists and is valid HTML (opens in a browser, no console
   errors).
2. Visually matches the shell-v2 aesthetic: dark demo body, fixed gradient title, ambient
   blobs, real `--pb-*` tokens, glow borders on extracted overlays.
3. Screen-mock shows the app shell with **collapsed sidebar** + content area holding the
   Customers table (4 rows, Name/Email/Status/Created columns, pagination footer).
4. The first extraction **zooms out from the content area's position** in the mock (not
   the whole mock centered).
5. All **15 sub-extractions** work: each UI piece extracts, gets an annotation card + SVG
   connector, then reassembles. Verified by scrolling through all 17 phases.
6. All **7 section-claims** appear at the right phases and fade out correctly.
7. The **2 previously-missing features** are present and accurate:
   - #15 server-side pagination: footer shows `1-25 / 247`, page-size dropdown, nav buttons;
     annotation cites `page` + `page_size` → BE.
   - #8 merged: shows row checkboxes, the Eye/EyeOff view-selected-only toggle, and
     callouts for "no server calls" + "selection survives paging" + "scroll-left preserved".
8. Progress rail fills, 7 scene dots update + click-scroll, phase label updates.
9. `prefers-reduced-motion` fallback works (static scaled mock, no scroll listeners).
10. Track height = 2000vh.
11. `icons.js` renders all `[data-icon]` placeholders (same as shell-v2).
12. Does NOT call `initScrollDemo` — uses its own inline IIFE.
13. No layout changes to the shell-v2 pattern; mirrors its CSS/JS conventions exactly.

---

## 10. Out of scope (explicitly)

- Astro conversion (covered by the separate `feature-scroll-demo-astro-conversion-plan.md`).
- Modifying `shell-v2.html`, `styles.css`, `scroll.js`, `icons.js`, or any FE source.
- Adding new features beyond the 15 verified.
- Translating annotation copy (stays English, like shell-v2).
