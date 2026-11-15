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

### Flag display semantics (decided with user)

- **Default = `/` (bare slash, nothing after it)** — always visible, means "no flags assigned". Never hide the control: a hidden CTA leaves the user unable to tell whether flags exist at all.
- Display table:

| Flags   | Rendered as |
|---------|-------------|
| none    | `/` (dimmed, `text-foreground/50`) |
| i       | `/i` |
| g       | `/g` |
| i + g   | `/gi` |
| i+g+m   | `/gim` |

- **Canonical ordering**: render flags in JS canonical order (`dgimsuvy`, i.e. `re.flags` order) — always `/gi`, never `/ig`. If `flags` state can hold arbitrary order, normalize on render: `[...'dgimsuvy'].filter(f => flags.includes(f)).join('')`.
- The `/` is the natural regex delimiter — `/` alone reads as "pattern present, zero flags" without ambiguity.
- The text IS the CTA: clicking `/gi` opens the flags sheet (same behavior as the current icon button).

### Implementation

- Button content: `/{normalized_flags}` (e.g. `/gi`), class `font-serif` (per user preference — serif over mono), `text-sm`, `text-primary` when set; `/` alone dimmed when empty.
- Keep: `open_flags_panel` onclick, `title`/`aria-label` i18n, `data-testid="smart-regex-flags-cta"`. Remove `smart-regex-flags-badge` testid (element deleted — brittle-on-purpose is the convention).
- Add `data-testid="smart-regex-flags-text"` on the flag text span.
- Width is dynamic (1-8 chars) — `pr-24` stays, cluster is auto-width flex, no layout issue.
- Remove unused `Flag` import.

### Behavior note for the flags panel (context, not a change)

`/g` is not cosmetic: without it `match()`/`exec()`/`test()` operate on the first match only; with it `matchAll`/`replaceAll` semantics apply and the regex becomes stateful (`lastIndex` advances — reusing a `/g` regex object across `test()` calls can flip results). The flags panel UI may want to surface this later; out of scope for this task.

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

**Cache section — DECIDED (user): remove the inner bordered card entirely.**

The `div.rounded-lg.border.p-4` wrapper at `+page.svelte:452` is redundant: the `SelectableFieldset`s already provide visual grouping ("Modelli censiti" / "Modelli non censiti" labels + borders). Removing it also avoids a confinement artifact — a sticky element inside the card would un-stick when the card ends and the card border would stay visible while rows scroll under it.

New flat structure:

```
<section data-testid="ai-settings-cache-section">
  <ModelCacheSection model_ranks={modelRanks}>
    {#snippet header()}          ← NEW: title row passed in from the page
      <div class="flex items-center gap-2">
        <HardDrive class="size-4 text-foreground/70" />
        <h2>{$t('...cache_section.title')}</h2>
      </div>
    {/snippet}
  </ModelCacheSection>
</section>
```

Inside `ModelCacheSection`:

```
<div class="sticky top-0 z-10 bg-background">   ← single sticky cluster
  {@render header()}        (h2 row)
  [error banner]            (moved inside — see below)
  [storage usage bar]       (always rendered when quota known)
  [censused SelectableToolbar]   (only when !cacheIsEmpty)
</div>
[empty-state message OR censused fieldset]
[divider]
[orphan SelectableToolbar + fieldset]   ← NOT sticky
```

Rationale for the pieces:

- **Title as `header` snippet prop** — one sticky div, no fragile `top` offsets between two stacked stickies. The page owns the i18n key + icon; the component owns positioning.
- **Storage bar + censused toolbar hoisted out of the `{:else}`** — they're not "content", they're the section's persistent controls; they belong under the title regardless of empty state (storage bar already renders independently; toolbar renders only when `censusedModels.length > 0`).
- **Error banner inside the sticky block** — if `in_use`/error shows while scrolling, it should stay visible (it's a status, not a row). Cheap: it's already at the top of the component output.
- **Censused `SelectableFieldset` scrolls normally** — its "Modelli censiti" label scrolls away under the sticky toolbar; acceptable since the sticky toolbar keeps the selection controls visible, which is the actual need.
- **Orphan block untouched** — mid-list, not sticky.
- `cacheIsEmpty` case: sticky cluster = title + storage bar (+ error); empty-state message scrolls normally below it.

**Background coverage**: sticky elements use opaque `bg-background` (no card anymore → page bg).

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
