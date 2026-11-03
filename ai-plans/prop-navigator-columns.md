# Prop Navigator — column-picker for schema-driven paths

## Status: 🟢 DONE — Plan date: 2026-11-03, shipped 2026-11-03

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `use-prop-navigation` composable (column model, roving tabindex, arrow dispatch, scroll-right) | ✅ done | 2026-11-03 | `ui/src/lib/composables/use-prop-navigation.svelte.ts` — N-column generalization of the launcher's mechanics |
| 2 | Sub-components: navigator-header / navigator-column / navigator-row / navigator-footer | ✅ done | 2026-11-03 | + `Kbd` vendored into ui (user decision: vendored, not inline) |
| 3 | `prop-navigator.svelte` orchestrator (search row + popover body) in `@primebrick/ui` | ✅ done | 2026-11-03 | ComboSelect-chrome trigger, footer eye-dashed reveal (same i18n keys, aria-pressed) |
| 4 | payload-map-editor: `pathTree` replaces flat `pathOptions`; path picker swaps to navigator | ✅ done | 2026-11-03 | all path lanes via `leafValue` — every picker site migrated at once |
| 5 | E2E: drill `$.customer` → column 2 → leaf commit; deep object → column 3 + scroll-right; search flat mode | ✅ done | 2026-11-03 | 4/4 green; col-3 scroll untestable — real event schema is 2 levels (no fake fixture) |

## Decisions recorded (user-approved at TOC)

1. **Standalone `PropNavigator` in `@primebrick/ui`** — NOT a ComboSelect feature (navigable vs selectable stay orthogonal predicates).
2. **`Kbd` vendored** into `ui/src/lib/components/kbd/` — remotes inherit it.
3. **Launcher migration deferred** — user wants a dedicated impact analysis first (launcher navigates routes, navigator navigates schema props — different domains; tracked below).

## Follow-ups (not in scope)

- `SidebarAppLauncher` → `usePropNavigation` migration — needs the impact analysis the user asked for (nav-route activation vs path-commit semantics, favorites column, preview-on-focus of module data, CTA/goto split).
- Column-3 scroll-right is exercised by code (`$effect` → `scrollLeft = scrollWidth`) but has no real ≥3-level fixture yet; when an event schema grows a nested object, the mechanism is already in place.

## Semantics delta discovered in E2E

`aria-disabled` on a **navigable** node lies — the row IS operable (it descends). `aria-disabled` now marks only disabled **leaf** rows (truly inert); navigable+disabled keep `opacity-50` (visual "not committable") but stay clickable. Playwright enforces the same reading (`aria-disabled` elements are unclickable), which caught the bug.

---

## Decision (TIC answer)

**Standalone `PropNavigator` in `@primebrick/ui`** — NOT a ComboSelect feature.

Reasons (verified in code):
- Different contract: ComboSelect = flat candidate set → value; navigator = descend a tree → commit a *path*. Select means "descend" for navigable nodes and "commit" for leaf-ish nodes — embedding that in `handleSelectSingle` would fork the component's core semantics.
- **Navigable and selectable are orthogonal predicates** — `$.customer` (object) is BOTH expandable AND a valid value for `record`/`variables` targets. A `childrenField` auto-detect would conflate "has children" with "is a leaf"; compat (`pathCompatible`) decides selectability, children decide navigation.
- `isOptionDisabled`, `disabledToggle` (eye-dashed reveal), `aria-invalid`, `isValueInvalid` must keep working per-node — the navigator takes the same predicate props.
- Zero breakage: ComboSelect untouched; the swap is localized to the payload-map path field.

## Anatomy (mirrors `SidebarAppLauncher`, translated to props domain)

- **Header** (`navigator-header`): two lines — composed label path (`Customer › Address`) + mono path (`$.customer.address`). Hover previews without touching selection (same `hoverPath` pattern).
- **Columns** (`navigator-column`): `role=listbox`, `min-w-48`, `overflow-y-auto`; only 2 visible (container width = 2 cols); columns 3+ materialize inside `overflow-x-auto` and an `$effect` scrolls `scrollLeft = scrollWidth` so the new column is instantly in view.
- **Rows** (`navigator-row`): type icon (the editor's `typeIcon` convention: format wins, nullable = dashed), label (prop key), `_sub` type line, `ChevronRight` when `node.children?.length`, disabled when `isDisabled(node)` (with reveal ON), selected surface via `menuListSelectedSurfaceDropdownClasses`.
- **Search row**: sits under the header (always visible). Empty → column mode; non-empty → flat filtered list of matching leaf+navigable nodes, labels = full path (type-ahead preserved — "city" finds `$.customer.address.city`).
- **Footer** (`navigator-footer`): Kbd hints (↑↓←→ ⏎ esc) + eye-dashed reveal toggle (moves here — it's filter state, not search). `Kbd` is FE-local (`$lib/components/ui/kbd`) — navigator ships a minimal inline `<kbd>` styled element (no new shared dep) OR we vendor `Kbd` into ui lib (decide at toc — vendoring is cleaner: remotes get it too).
- **Keyboard**: launcher's exact semantics — roving tabindex per column, ↑↓ move+preview, → descend, ← back to parent row, ⏎/`Space` commits if `isSelectable`, `esc` closes.

## Composable — `use-prop-navigation.svelte.ts`

```ts
usePropNavigation({
  nodes: PropNavNode[],
  isSelectable: (n) => boolean,
  onCommit: (path: string) => void,
})
```

Returns `{ columns: PropNavNode[][], selectionPath: PropNavNode[], focusIdx: number[], handleRowKeydown, select(node, depth), commit(node), scrollEl }`.

- `columns` derived: col0 = nodes; colN = children of `selectionPath[N-1]` (when navigable).
- Column-count increase → effect scrolls the container right (the "auto-position to newest column" requirement).
- Roving tabindex + arrow dispatch identical to launcher's `handleRowKeydown`/`focusRow`/`trackFocus` — lifted verbatim into the composable (the launcher's version is copy source; it can migrate to consume the composable later — noted, NOT in scope).

## Shared/Dry surface already in `@primebrick/ui`

- `menuListHoverNeutral`, `menuListSelectedSurfaceDropdownClasses` (menu-row-chrome.ts) — row chrome, identical classes.
- `DynamicIcon`, `ChevronRight` (vendor/lucide), `Popover.*` — primitives already shipped.
- `getT()` bridge — i18n inside the lib without app imports (remotes inherit the bound `t`).
- `SwitchField` — the reveal toggle in the footer (same as launcher's `showAll` switch).

## Contract

```ts
type PropNavNode = {
  value: string;            // full path '$.customer.address'
  label: string;            // segment label 'address'
  children?: PropNavNode[];
  _icon?: string; _icon_dashed?: boolean; _sub?: string;
  _schema?: JsonSchema;     // payload-map carries the prop schema
};

type Props = {
  nodes: PropNavNode[];
  value?: string;                       // current path (selected surface)
  onSelect: (path: string) => void;
  isSelectable?: (n: PropNavNode) => boolean;   // default: compat-agnostic leaf+node
  isOptionDisabled?: (n: PropNavNode) => boolean;
  disabledToggle?: boolean;
  pathLabel?: (node) => string;         // header label line
  pathMono?: (node) => string;          // header mono line (default: node.value)
  placeholder?: string; searchPlaceholder?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'data-testid'?: string;
};
```

## payload-map-editor integration

- `pathTree` derived = the schema walk producing the TREE (children = `properties`), each node carrying `_schema`/`_icon`/`_sub` — replaces the flattened `pathOptions` (the flat list stays derivable inside the navigator for search).
- `leafValue` path branch: ComboSelect → `PropNavigator` inside the same Popover trigger chrome (`aria-invalid`/`data-testid` passthrough keeps E2E selectors stable — keep `payload-map-path-*` testids).
- `isSelectable` = `pathCompatible(targetProp, node._schema)` — an intermediate object CAN commit when compat says so (whole-object → `variables`).
- `isOptionDisabled` = same compat predicate inverted (reveal shows incompatible as disabled — identical semantics to today's flat partition).

## Acceptance

- Pick `$.customer.code` in 2 columns; deep schema (≥3 levels) grows a 3rd column + viewport scrolls to it.
- Search "code" → flat result `$.customer.code`; clear → back to columns at last selection.
- Incompatible nodes hidden by default, revealed disabled via footer eye-dashed (inside navigator, no standalone row).
- `variables` target: `$.customer` (object node) is selectable AND expandable.
- E2E `payload-map-widget.spec.ts` + draft/lifecycle suite still green; new navigator spec covers drill/commit/scroll/search.
