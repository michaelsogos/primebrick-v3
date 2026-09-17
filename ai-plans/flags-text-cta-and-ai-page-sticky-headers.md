# Plan: Flags text CTA + sticky section headers on /ai settings page

## Evidence gathered (empirical, from code)

### `smart-regex-input.svelte` (lines 160-186)
- Trailing CTA cluster: `absolute top-1/2 right-0` flex with `gap-0.5`, three buttons: flags (`Flag` lucide icon + badge `{flags.length}`), brain (`AiIcon`), clear (`X`, only when value present).
- `has_flags = $derived(flags.length > 0)`; `flags` is a bindable string like `'gi'`.
- `pr-24` on the input reserves ~96px for the cluster.
- testids: `smart-regex-flags-cta`, `smart-regex-flags-badge`.

### `/ai` page (`+page.svelte` lines 167-457)
- Scroll container: `<div class="flex-1 overflow-auto p-4">` inside `AppPageScaffold`.
- Section 1 "Modelli AI" (testid `ai-settings-models-section`): header row = `BrainCircuit` icon + `h2` + right-side toolbar (`DeletionFilterToggle` + refresh `Button`). Then model rows.
- Section 2 "Gestione cache" (testid `ai-settings-cache-section`): header row = `HardDrive` icon + `h2`, then a bordered card containing `<ModelCacheSection model_ranks={modelRanks} />`.

### `ModelCacheSection.svelte`
- Internal vertical order: error banner → storage bar block (usage/quota + progress + refresh) → `SelectableToolbar` (censused, testid `cache-censused-toolbar`) → `SelectableFieldset` rows → divider → orphan `SelectableToolbar` + fieldset.
- The "mini toolbar" the user means = `SelectableToolbar` (select-all checkbox + bulk delete).

## Task 1 — Flags CTA shows the flags, not icon+badge

Replace the `Flag` icon + count badge with the flag letters rendered as text.

- Button content: `{flags}` shown as `/{flags}` (e.g. `/gi`), class `font-serif` (per user preference — serif over mono), `text-sm`, `text-primary` when set.
- Empty state: no flags → show `/` alone, dimmed (`text-foreground/50`), still clickable to open the sheet.
- Keep: `open_flags_panel` onclick, `title`/`aria-label` i18n, `data-testid="smart-regex-flags-cta"`. Remove `smart-regex-flags-badge` testid (element deleted — brittle-on-purpose is the convention).
- Add `data-testid="smart-regex-flags-text"` on the flag text span.
- Width is dynamic (1-4 chars) — `pr-24` stays, cluster is auto-width flex, no layout issue.
- Remove unused `Flag` import.

Open question (trivial, decide in impl): `/` alone vs `∅` for empty — default `/` dimmed.

## Task 2 — Sticky section headers on scroll

Behavior requested: while scrolling inside `overflow-auto` container,
1. "Modelli AI" header row (title + right toolbar) sticks to top.
2. When "Gestione cache modelli" reaches the top, it takes over as the sticky header — and its sticky block is taller (~3 rows): section title + storage bar + censused select-all toolbar.

### Mechanism: CSS `position: sticky` inside the existing scroll container

No JS scroll listeners needed — sticky elements are confined to their parent `<section>`, so the "take over" happens naturally: the models header un-sticks when its section ends, the cache header sticks when it arrives at top. This IS the requested handoff.

### Scroller padding gotcha (verified needed)
`overflow-auto p-4` puts padding on the scroller — a `sticky top-0` child sticks at the padding-box edge, which can leave a visible gap band where scrolled rows peek through. Fix: move `p-4` off the scroller → `px-4 pb-4` on the inner `space-y-6` wrapper, keep scroller `overflow-auto` only. Then `sticky top-0` sits flush at the visual top.

### Implementation

**Models section**: wrap the header row (`div.flex.items-center.justify-between`, lines 171-193) with sticky classes directly on it:
`sticky top-0 z-10 bg-background -mx-2 px-2 py-1` (bg covers rows scrolling under; negative mx compensates for breathing room — tune visually).

**Cache section**: the sticky cluster must span page markup (title) + component internals (storage bar + censused toolbar) → restructure:
- Pass the title row into `ModelCacheSection` as a `header` snippet prop (or move the h2 into the component — simpler: keep the h2 in the page but move it INSIDE the bordered card? No — cleaner: ModelCacheSection gets a new optional `sticky_header` snippet prop).
- Inside `ModelCacheSection`, wrap in order: `{@render sticky_header?.()}` + storage bar block + censused `SelectableToolbar` inside one `<div class="sticky top-0 z-10 bg-background">`.
- The censused toolbar is rendered only in the `{:else}` (non-empty) branch — the sticky wrapper lives inside that branch; when cache is empty there is no toolbar, sticky cluster = title + storage bar only.
- `SelectableToolbar` stays in place in the DOM (it already precedes the fieldset) — only wrapped.
- Orphan toolbar: NOT sticky (it appears mid-list).

Wait — issue: the storage bar + censused toolbar are inside `{:else}` of the empty-state `{#if}`, and the title snippet render point is at component root. Restructure: component renders
```
<div sticky>header snippet, error? no — keep error outside/below, storage bar, censused toolbar</div>
```
but censused toolbar belongs to the `{:else}` branch. Option: keep error banner and empty-state OUTSIDE the sticky block; make the sticky div contain only header + storage bar, and add a second `sticky top-{offset}` on the censused toolbar? Two stacked stickies with offsets need a fixed pixel offset — fragile.

Better: since cacheIsEmpty means no toolbar anyway, put the whole sticky cluster (title + storage + censused toolbar) inside the `{:else}` branch, and when `cacheIsEmpty` render a separate non-sticky title + storage + empty message. Slight duplication of title render — acceptable, it's `{@render}` so it's one line.

**Background coverage**: sticky elements need opaque `bg-background` (or `bg-card` — the cache section sits inside a `rounded-lg border` card; sticky inside a card works but the card border stays put while content scrolls under — sticky within the card div confines to card height, fine; bg must match card interior = `bg-card`/`bg-background` whichever the card uses — it's plain `border` div → inherits page bg → use `bg-background`).

**z-index**: model rows contain popovers (`Popover.Content` renders in portal — safe). Set `z-10` on sticky headers.

### Risks / verify empirically
- Scroller padding gap (fix above).
- `AppPageScaffold` may have its own sticky header competing — check its DOM at runtime; `z-10` vs scaffold header z-index.
- Selection checkboxes in sticky toolbar remain clickable — verify no overlay.
- `border-border/40` divider between censused/orphan is outside sticky — OK.

## Testids (new)
- `smart-regex-flags-text`
- `ai-settings-models-sticky-header`, `ai-settings-cache-sticky-header` on the sticky wrappers (E2E evidence points).

## Acceptance criteria
1. Flags CTA displays `/gi` (or actual flags) in serif; empty = `/` dimmed; click opens flags sheet; badge gone.
2. Scrolling /ai: models header pins at top, opaque, toolbar usable.
3. Continuing scroll: cache cluster (title + storage bar + select-all toolbar) pushes up and becomes the single ~3-row sticky header.
4. Orphan toolbar not sticky; popovers/dialogs still open above sticky headers.
5. `npm run check` 0 errors.

## Out of scope
- No E2E additions required by this change (visual/sticky is hard to assert deterministically; manual verify). testids added anyway for future E2E.
