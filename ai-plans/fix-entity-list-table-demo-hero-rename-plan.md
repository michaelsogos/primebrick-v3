# Fix: Entity List Table Demo — Hero Section, Scroll Hint, and Route Rename

## Objective

Fix three issues with the current entities demo page:
1. **Missing hero section** — The entities page lacks the badge + gradient h1 + subtitle hero pattern that the shell page has. The current `demo-title-bar` div has NO CSS defined anywhere and appears as unstyled text.
2. **Scroll hint mismatch** — The entities page positions the scroll hint at the top (140px), while the shell page positions it at the bottom (2rem). The user wants the entities page to replicate the shell page's scroll hint behavior exactly.
3. **Wrong file/route name** — The demo is about the "Entity List Table" component, but the file is named `entities.astro` with route `/demo/entities`. It should be `entity-list-table.astro` with route `/demo/entity-list-table`.

## DRY Principle: Reusable Hero Component

The hero section (badge + gradient h1 + subtitle) is currently inline in `shell.astro` lines 117-133. Instead of duplicating it in the entities page, extract it into a reusable Astro component.

### New file: `src/components/astro/DemoHero.astro`

**Props:**
- `badge: string` — badge text (e.g., "Scroll-Jacking Demo")
- `title: string` — h1 text
- `subtitle: string` — subtitle text
- `badgeColor?: string` — Tailwind color for the pulse dot (default: `bg-sky-400`)
- `gradientFrom?: string` — gradient start (default: `from-white`)
- `gradientVia?: string` — gradient middle (default: `via-sky-200`)
- `gradientTo?: string` — gradient end (default: `to-slate-400`)

**Template** (extracted from shell.astro lines 117-133):
```astro
---
interface Props {
  badge: string;
  title: string;
  subtitle: string;
  badgeColor?: string;
  gradientFrom?: string;
  gradientVia?: string;
  gradientTo?: string;
}
const {
  badge,
  title,
  subtitle,
  badgeColor = 'bg-sky-400',
  gradientFrom = 'from-white',
  gradientVia = 'via-sky-200',
  gradientTo = 'to-slate-400',
} = Astro.props;
---
<section class="relative z-10 px-6 pt-24 pb-16 text-center">
  <div class="mx-auto max-w-3xl">
    <div class="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-900/50 px-4 py-1.5 text-xs font-medium text-slate-400 backdrop-blur-sm">
      <span class={`h-1.5 w-1.5 rounded-full ${badgeColor} animate-pulse`}></span>
      {badge}
    </div>
    <h1 class="text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
      <span class={`bg-gradient-to-b ${gradientFrom} ${gradientVia} ${gradientTo} bg-clip-text text-transparent`}>
        {title}
      </span>
    </h1>
    <p class="mx-auto mt-6 max-w-2xl text-lg text-slate-400 sm:text-xl">
      {subtitle}
    </p>
  </div>
</section>
```

## Detailed Changes

### Phase 1: Create DemoHero.astro component

**New file:** `src/components/astro/DemoHero.astro`
- Extract the hero section pattern from shell.astro lines 117-133
- Make it a reusable component with props for badge, title, subtitle, and colors
- Default colors match the shell page (sky theme)

### Phase 2: Refactor shell.astro to use DemoHero

**File:** `src/pages/[lang]/demo/shell.astro`
- Import `DemoHero` from `../../../components/astro/DemoHero.astro`
- Replace lines 117-133 (the inline hero section) with:
  ```astro
  <DemoHero badge={t.demo.shellBadge} title={t.demo.shellTitle} subtitle={t.demo.shellSubtitle} />
  ```
- This is a pure refactor — no visual change to the shell page

### Phase 3: Add hero translations to entities-translations.ts

**File:** `src/i18n/entities-translations.ts` (will be renamed in Phase 5)
- Add `pageBadge` key to all 6 languages (EN, IT, DE, ES, PT, FR)
- EN: `'Scroll-Jacking Demo'` (same as shell)
- IT: `'Demo Scroll-Jacking'`
- DE: `'Scroll-Jacking-Demo'`
- ES: `'Demo de Scroll-Jacking'`
- PT: `'Demo de Scroll-Jacking'`
- FR: `'Démo Scroll-Jacking'`
- The existing `pageTitle` and `pageSubtitle` keys will be reused for the hero title and subtitle

### Phase 4: Rename files from `entities` to `entity-list-table`

**Rename files:**
1. `src/pages/[lang]/demo/entities.astro` → `src/pages/[lang]/demo/entity-list-table.astro`
2. `src/scripts/demo/entities-scroll.ts` → `src/scripts/demo/entity-list-table-scroll.ts`
3. `src/styles/demo/entities.css` → `src/styles/demo/entity-list-table.css`
4. `src/i18n/entities-translations.ts` → `src/i18n/entity-list-table-translations.ts`

**Update internal references in entity-list-table.astro (formerly entities.astro):**
- Frontmatter import: `entities-translations` → `entity-list-table-translations`
- Frontmatter import: `entities.css` → `entity-list-table.css`
- Frontmatter import: `entities-scroll` → `entity-list-table-scroll`
- Frontmatter: `entitiesTranslations` → `entityListTableTranslations`
- Frontmatter: `const et = entitiesTranslations[...]` → `const et = entityListTableTranslations[...]`
- Frontmatter: `const entitiesHref = ...` → `const entityListTableHref = ...`
- Route in hreflang links: `/demo/entities` → `/demo/entity-list-table`
- `activeDemo="entities"` → `activeDemo="entity-list-table"`
- Script import: `entities-scroll` → `entity-list-table-scroll`
- Function call: `initEntitiesScroll()` → `initEntityListTableScroll()`

**Update `entity-list-table-scroll.ts` (formerly entities-scroll.ts):**
- Rename exported function: `initEntitiesScroll` → `initEntityListTableScroll`
- Update comment in demo-utils.ts that references `entities-scroll.ts`

**Update `VirtualTourMegaMenu.svelte`:**
- Type: `'entities'` → `'entity-list-table'` in `activeDemo` prop type
- `entitiesHref` → `entityListTableHref`
- Route: `${demoHref}entities` → `${demoHref}entity-list-table`
- Demo key: `{ key: 'entities', ... }` → keep key as `'entities'` (this is the translation key for `t.demo.card.entities`, NOT the route — do NOT change this)

**Update `demo/index.astro`:**
- `entitiesHref` → `entityListTableHref`
- Route: `${demoHref}entities` → `${demoHref}entity-list-table`

### Phase 5: Replace demo-title-bar with DemoHero in entity-list-table.astro

**File:** `src/pages/[lang]/demo/entity-list-table.astro` (after rename)

**Remove** (lines ~138-145):
```html
<div class="ambient-blob blob-1"></div>
<div class="ambient-blob blob-2"></div>

<!-- Fixed title bar -->
<div class="demo-title-bar">
  <h1 class="demo-title">{et.pageTitle}</h1>
  <div class="demo-subtitle">{et.pageSubtitle}</div>
</div>
```

**Replace with:**
```astro
<DemoHero badge={et.pageBadge} title={et.pageTitle} subtitle={et.pageSubtitle} badgeColor="bg-indigo-400" gradientVia="via-indigo-200" />
```

Note: Using indigo accent for the entity-list-table demo (matching the indigo color from the mega menu card), while keeping the same layout/structure as the shell hero.

**Import DemoHero** in the frontmatter:
```astro
import DemoHero from '../../../components/astro/DemoHero.astro';
```

### Phase 6: Fix scroll hint positioning

**File:** `src/styles/demo/entity-list-table.css` (after rename)

**Remove** these CSS variable overrides (lines ~11-12):
```css
--scroll-hint-top: 140px;       /* entities positions hint at top (shell uses bottom) */
--scroll-hint-bottom: auto;
```

This allows the scroll hint to use the default bottom position from `demo.css` (same as shell page):
```css
/* demo.css defaults */
--scroll-hint-top: auto;
--scroll-hint-bottom: 2rem;
```

The scroll hint HTML element and the `fadeScrollHint()` call in the scroll script remain unchanged — they already work correctly. Only the CSS positioning changes.

### Phase 7: Build and verify

1. Run `pnpm run build` — must succeed with no errors
2. Verify all 6 language pages are generated at `/[lang]/demo/entity-list-table/`
3. Verify the old `/[lang]/demo/entities/` route no longer exists
4. Verify shell.astro still renders correctly (hero section visible)
5. Verify entity-list-table.astro has the hero section (badge + gradient h1 + subtitle)
6. Verify scroll hint appears at the bottom on entity-list-table page (same as shell)

## Impacted Files

| File | Action |
|------|--------|
| `src/components/astro/DemoHero.astro` | **CREATE** — reusable hero component |
| `src/pages/[lang]/demo/shell.astro` | **MODIFY** — replace inline hero with DemoHero component |
| `src/pages/[lang]/demo/entities.astro` | **RENAME** to `entity-list-table.astro` + **MODIFY** — replace demo-title-bar with DemoHero, update imports/routes |
| `src/scripts/demo/entities-scroll.ts` | **RENAME** to `entity-list-table-scroll.ts` + **MODIFY** — rename exported function |
| `src/styles/demo/entities.css` | **RENAME** to `entity-list-table.css` + **MODIFY** — remove scroll-hint position overrides |
| `src/i18n/entities-translations.ts` | **RENAME** to `entity-list-table-translations.ts` + **MODIFY** — add `pageBadge` key to all 6 languages |
| `src/components/svelte/VirtualTourMegaMenu.svelte` | **MODIFY** — update route, hreflang, activeDemo type |
| `src/pages/[lang]/demo/index.astro` | **MODIFY** — update entitiesHref to entityListTableHref |
| `src/scripts/demo/demo-utils.ts` | **MODIFY** — update comment referencing entities-scroll.ts |

## Acceptance Criteria

1. ✅ `pnpm run build` succeeds with zero errors
2. ✅ All 6 language pages generated at `/[lang]/demo/entity-list-table/`
3. ✅ Old route `/[lang]/demo/entities/` no longer exists
4. ✅ Shell page hero section looks identical (no visual change from refactor)
5. ✅ Entity List Table page has a hero section with badge + gradient h1 + subtitle (matching shell pattern)
6. ✅ Entity List Table page scroll hint is positioned at the bottom (same as shell)
7. ✅ Demo hub page links to `/demo/entity-list-table` (not `/demo/entities`)
8. ✅ VirtualTourMegaMenu links to `/demo/entity-list-table`
9. ✅ No dead references to `entities` route anywhere in the codebase (except the `t.demo.card.entities` translation key which is the card title, not the route)

---
