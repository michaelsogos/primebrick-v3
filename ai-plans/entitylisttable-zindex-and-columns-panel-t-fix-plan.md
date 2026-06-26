# Plan: EntityListTable header z-index over modals + ColumnsPanel `$$props.t is not a function`

**Date:** 2026-06-25
**Repo:** `primebrick-fe-v3`
**Component:** `EntityListTable.svelte` and the global sheet system
**Mode:** Empirical (every claim below is backed by a file:line read during analysis)

---

## Summary

Two distinct bugs, both confirmed empirically:

1. **z-index:** The sticky table header (`z-80`) and sticky head cells (`z-70`) paint above the
   global sheet panel / modal overlay (`z-50`), so any sheet opened from the table (column
   selector, version history, etc.) is covered by the header row.
2. **`$$props.t is not a function`:** `ColumnsPanel.svelte` is the **only** sheet panel that
   receives `t` as a prop. A reactive `$effect` in `useSheetPanels.svelte.ts` overwrites the
   panel props with `t: t` — where `t` is the imported **store object** (`Readable`), not the
   translation function. Calling that store object as a function throws.

Both are fixed with small, targeted edits. No function signatures, APIs, or shared state
shapes change (scope-locked per `code-guardrails.md`).

---

## Issue 1 — Table header z-index above sheet/modals

### Evidence (read during analysis)

| Element | z-index | File:line |
|---|---|---|
| Sheet content (base) | `z-50` | `src/lib/components/ui/sheet/sheet-content.svelte:4` |
| Sheet overlay | `z-50` | `src/lib/components/ui/sheet/sheet-overlay.svelte:17` |
| Dialog content | `z-50` | `src/lib/components/ui/dialog/dialog-content.svelte:57` |
| Dialog overlay | `z-50` | `src/lib/components/ui/dialog/dialog-overlay.svelte:15` |
| **Table header (sticky)** | **`z-80`** | `src/lib/components/entity-list-table/components/TableHeader.svelte:69` |
| Table sticky head cell (left) | `z-70` | `TableHeader.svelte:74` |
| Table sticky head cell (right) | `z-70` | `TableHeader.svelte:186` |
| Table header (alt row component) | `z-80` | `.../EntityListTableHeaderRow.svelte:61,66,179` |
| Table header (legacy) | `z-80` | `.../entity-list-table/table/TableHeader.svelte:52,56` |
| Dropdown / popover content | `z-120` | `ui/dropdown-menu/dropdown-menu-content.svelte:26`, `popover-content.svelte:20` |
| Sonner toaster | `45` (CSS) | `src/app.css:253` |
| AppShell top chrome | `z-40` | `src/lib/components/AppShell.svelte:88` |

### Why the header wins (root-cause, not a guess)

- The sheet content is rendered through `SheetPrimitive.Portal` (bits-ui), which portals to
  `document.body` → it lives in the **root stacking context** at `position: fixed; z-50`.
  (`sheet-content.svelte:49,53`)
- The table sits inside `AppShell.svelte:93`:
  `<div class="relative min-h-0 min-w-0 flex-1 overflow-auto">`. `position: relative` **without
  a z-index does NOT create a stacking context**. None of the ancestors between the sticky
  header and the root create a stacking context either.
- The table attempts to isolate via `**:data-[slot=table]:isolate`
  (`EntityListTableTableView.svelte:213`). The `**` variant is **non-standard Tailwind** and does
  not generate a descendant `isolation: isolate` rule, so the table does **not** get its own
  stacking context.
- Therefore the sticky header's `z-80` (`position: sticky` creates a stacking context *for the
  header itself*, evaluated in the **root** stacking context) competes directly with the sheet
  portal's `z-50` in the same (root) stacking context. `80 > 50` → header paints above the sheet.

### Fix chosen: raise modal z-index above the table header

Raising the sheet (and, for consistency, the dialog) to `z-100` places it above the table
header (`z-80`) and sticky cells (`z-70`), while staying **below** dropdowns/popovers (`z-120`)
so menus opened inside a sheet still float above it (preserving current behaviour).

`z-100` is a valid Tailwind v4 dynamic utility (the project already relies on dynamic z-values
`z-70`, `z-80`, `z-120` with no `--z-*` theme entries — confirmed by reading `app.css` `@theme`).

**Why not lower the header / fix the `isolate` selector instead?**
- The header must stay above its own sticky body cells (`z-50` in `TableRow.svelte:131,224`) for
  horizontal/vertical sticky overlap to work; lowering it below `z-50` breaks the table.
- Fixing `**:data-[slot=table]:isolate` to a real `[&_[data-slot=table]]:isolate` is riskier
  (could change paint order of sticky cells vs. header) and is not necessary once the modal is
  lifted above `z-80`.

### Files to modify (Issue 1)

1. `src/lib/components/ui/sheet/sheet-content.svelte` — base string `z-50` → `z-100` (line 4).
2. `src/lib/components/ui/sheet/sheet-overlay.svelte` — `z-50` → `z-100` (line 17).
3. `src/lib/components/ui/dialog/dialog-content.svelte` — `z-50` → `z-100` (line 57) *(related;
   same root cause — the user said "any modal").*
4. `src/lib/components/ui/dialog/dialog-overlay.svelte` — `z-50` → `z-100` (line 15) *(related).*

> **Note:** Dropdowns (`z-120`) and popovers (`z-120`) remain above modals (`z-100`) — unchanged
> from today (`120 > 50`). Sonner (`45`) stays below modals — unchanged. No regression expected.

---

## Issue 2 — `$$props.t is not a function` in ColumnsPanel

### Evidence (read during analysis)

- `t` is a **store**, not a function:
  `src/lib/i18n/index.ts:43` —
  `export const t: Readable<(key, params?) => string> = derived(dict, ...)`.
  The translation function is the **subscribed value** (`$t` in `.svelte`, or `get(t)` in `.ts`).

- `ColumnsPanel.svelte` is the **only** panel that takes `t` as a prop:
  - `ColumnsPanel.svelte:22` `t: (key: string) => string;` in `$$Props`
  - `ColumnsPanel.svelte:33` destructured from `$props()`
  - Used as `t(...)` at lines 38, 47, 53, 68, 101, 116, 149, 164, 200.
  - Every other panel imports `t` and uses `$t(...)`:
    `SearchInPanel.svelte:5,25`, `FiltersPanel.svelte:16`, `VersionHistoryPanel.svelte` (24
    `$t(...)` calls), `VersionsPanel.svelte:7,25`, `ErrorsPanel.svelte` (10 `$t(...)` calls).

- Two code paths open `entity.columns`:

  **Path A — `EntityListTableHeader.svelte:141-155`** (the click handler):
  ```ts
  openSheet('entity.columns', { ..., t: $t } as any, { contentClass: 'w-[360px] p-0' })
  ```
  `$t` here is the auto-subscribed store value = the function. ✅ Correct. (`t` imported at
  line 2; `$t` used only here.)

  **Path B — `useSheetPanels.svelte.ts:76-142`** (a reactive `$effect` that re-syncs props
  while the sheet is open):
  ```ts
  sheetState.props = { ..., t: t } as any;   // line 119
  ```
  `t` is imported at line 2 — this is the **store object** (`Readable`), NOT the function. ❌
  In a `.svelte.ts` module, store auto-subscription (`$t`) is **not supported** — only
  `get(t)` from `svelte/store` would yield the function.

- **Trigger order:** `openSheet()` (Path A) sets `sheetState.open = true` with the correct
  `t: $t`. The same tick, the `$effect` (Path B) runs (it tracks `sheetState.open`,
  `visibleKeys`, …) and **overwrites** `sheetState.props` with `t: t` (the store). `SheetHost`
  spreads `panelProps` into `<Panel {...panelProps} />` (`SheetHost.svelte:48`), so `ColumnsPanel`
  receives `t = Readable` object.

- **The throw:** `ColumnsPanel.svelte:37-39` snippet `headerTitle` calls `t('entities.list.columns')`.
  Svelte 5 compiles prop reads as `$$props.t`; since `t` is a `Readable` (not a function),
  `$$props.t is not a function` is thrown. The trace lists `SheetHeader.svelte` because the
  snippet is `{@render title?.()}`-ed from there, but the failing frame is
  `at ColumnsPanel.svelte:37:22` — matching exactly.

- "Half of feature doesn't go": the throw aborts the panel render at the header snippet, so the
  reset button, close button, and column list never mount.

### Fix chosen: make ColumnsPanel self-sufficient (matches all other panels)

Remove the `t` prop entirely and import the store directly, exactly like `SearchInPanel`,
`FiltersPanel`, `VersionsPanel`, `ErrorsPanel`, `VersionHistoryPanel`. This eliminates the bug
class (no more passing `t` through the sheet-manager props snapshot) and removes the
inconsistency.

### Files to modify (Issue 2)

1. **`src/lib/entity-list/sheets/panels/ColumnsPanel.svelte`**
   - Add `import { t } from '$lib/i18n';` (after the existing imports, ~line 9).
   - Remove `t: (key: string) => string;` from `$$Props` (line 22).
   - Remove `t` from the `$props()` destructure (line 33).
   - Replace every `t(...)` call with `$t(...)` (lines 38, 47, 53, 68, 101, 116, 149, 164, 200).

2. **`src/lib/components/entity-list-table/composables/useSheetPanels.svelte.ts`**
   - Remove `t: t,` from the `entity.columns` props object (line 119).
   - Remove the now-unused `import { t } from '$lib/i18n';` (line 2).

3. **`src/lib/components/entity-list-table/components/EntityListTableHeader.svelte`**
   - Remove `t: $t` from the `openSheet('entity.columns', { ... })` props (line 152).
   - Remove the now-unused `import { t } from '$lib/i18n';` (line 2).
   - (Pre-existing, **not touched**: unused `ColumnSelectorPanel` import at line 5 — out of
     scope for this bug.)

> After this change, `ColumnsPanel` no longer depends on `t` being supplied via the
> sheet-manager props snapshot, so the reactive `$effect` overwrite can no longer break it.

---

## Implementation Steps (ordered, atomic)

1. **Issue 2 — ColumnsPanel self-sufficient** (do this first; it's the runtime crash).
   1. Edit `ColumnsPanel.svelte`: add import, drop `t` prop, `t(` → `$t(`.
   2. Edit `useSheetPanels.svelte.ts`: drop `t: t` + unused import.
   3. Edit `EntityListTableHeader.svelte`: drop `t: $t` + unused import.
   4. Run `pnpm run check` (typecheck) — confirm no new errors.
2. **Issue 1 — modal z-index.**
   1. Edit `sheet-content.svelte`: `z-50` → `z-100`.
   2. Edit `sheet-overlay.svelte`: `z-50` → `z-100`.
   3. Edit `dialog-content.svelte`: `z-50` → `z-100`.
   4. Edit `dialog-overlay.svelte`: `z-50` → `z-100`.
   5. Run `pnpm run check`.
3. **Manual verification** (see below).

> Per `code-guardrails.md`: max 2 self-correction attempts per lint/typecheck failure; if it
> still fails, halt and report. Atomic edits — run `pnpm run check` after each group, not all
> at once.

---

## Verification

- [ ] `pnpm run check` passes (no new type errors after each step group).
- [ ] `pnpm run build` succeeds (optional, if check is clean).
- [ ] **Manual — Issue 2:** open the customer list page → click the column-selector toolbar
      button → panel opens with the title "Columns", reset + close buttons render, and the
      sticky/data/auditing column lists appear with translated labels. No `$$props.t` error in
      the console. Toggling a checkbox hides/shows the column.
- [ ] **Manual — Issue 2 (regression):** open the "Search in" panel and the "Filters" panel
      from the same toolbar — both still render correctly (they were already self-sufficient,
      so they must be unaffected).
- [ ] **Manual — Issue 1:** with the column-selector (or version-history) sheet open, the
      sticky table header row is **hidden behind** the sheet overlay/content; the sheet is no
      longer cut by the header.
- [ ] **Manual — Issue 1 (regression):** open a dropdown menu from inside the sheet (e.g. an
      operator selector in the filters panel) → it still paints **above** the sheet
      (`z-120 > z-100`). Open a page-level dropdown → still above the sheet. Toasts still
      appear below modals.
- [ ] Sticky horizontal/vertical header overlap inside the table still works (scroll the
      table; the header stays pinned and covers body cells as before).

---

## Risks / Considerations

- **z-100 vs other overlays:** The only values above `z-100` in the app are dropdowns/popovers
  at `z-120`. Sheets/dialogs moving to `z-100` keeps them below those — intended. No `z-90` or
  `z-100` usages exist elsewhere (confirmed by grep across `*.css/*.ts/*.js/*.svelte`).
- **Dialog change scope:** The user reported sheets, but dialogs share the identical `z-50`
  value and the same root-cause (header `z-80` in the root stacking context). Bumping dialogs
  too is consistent and prevents the same bug on confirm/edit dialogs opened over the table.
  If you prefer to keep this strictly to sheets, drop steps for `dialog-content.svelte` and
  `dialog-overlay.svelte` — the sheet fix alone resolves the reported symptom.
- **`ColumnSelectorPanel` unused import** in `EntityListTableHeader.svelte:5` is pre-existing
  and unrelated; left untouched to keep this change scoped.
- **No i18n keys added/removed** — only call-site syntax changes (`t(` → `$t(`), so no
  translation-file edits are required (per `docs/ai/i18n.md` rule).
- **No composable state shape, function signature, or API change** — compliant with
  `code-guardrails.md` scope locking.
