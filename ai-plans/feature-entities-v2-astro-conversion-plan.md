# Plan: Convert entities-v2.html to Astro Pages

## Objective

Convert the `entities-v2.html` scroll-driven animation demo (5,106 lines) into the
`primebrick-v3-website` Astro project, following and improving the pattern established
by the `shell.astro` conversion. The conversion MUST be DRY — shared CSS and JS must
be extracted into reusable modules so that future demo pages (exports, ai-chat,
security, etc.) benefit from the shared infrastructure.

---

## Source & Target

| | |
|---|---|
| **Source** | `D:\git\primebrick\temp\pb-demo\entities-v2.html` (5,106 lines) |
| **Target project** | `D:\git\primebrick\primebrick-v3-website\` |
| **Target page** | `src/pages/[lang]/demo/entities.astro` |
| **Target CSS** | `src/styles/demo/entities.css` + refactored `demo.css` |
| **Target JS** | `src/scripts/demo/entities-scroll.ts` + new `src/scripts/demo/demo-utils.ts` |

---

## User Decisions (confirmed)

1. **Navigation**: Replace demo title bar with full website nav (TopBanner + sticky nav + VirtualTourMegaMenu + LanguageSwitcher), same as shell.astro.
2. **i18n**: Full i18n support — all text added to `translations.ts` for all 6 languages (EN, IT, DE, ES, PT, FR).
3. **JS sharing**: Extract shared helpers into `demo-utils.ts` module. Both `shell-scroll.ts` and `entities-scroll.ts` import from it. Future demos also benefit.
4. **CSS sharing**: Refactor `demo.css` to hold ALL shared demo CSS. Only page-specific CSS stays in `shell.css` / `entities.css`.

---

## Phase 1: Extract Shared JS Module (`demo-utils.ts`)

### New file: `src/scripts/demo/demo-utils.ts`

Extract these functions that are duplicated between `shell-scroll.ts` (lines 113-129) and `entities-v2.html` (lines 2250-2367):

```typescript
// ===== Math helpers =====
export function lerp(a: number, b: number, t: number): number;
export function clamp01(x: number): number;
export function smoothstep(e0: number, e1: number, x: number): number;

// ===== SVG connector drawing =====
export function drawConnector(
  lineEl: SVGLineElement | null,
  dotEl: SVGCircleElement | null,
  fromX: number, fromY: number,
  toX: number, toY: number
): void;

// ===== Annotation positioning (generic, side-based) =====
// From entities-v2.html lines 2270-2323 — more generic than shell's inline version
export type AnnotationSide = 'center' | 'bottom' | 'top' | 'top-left' | 'top-right' | 'left' | 'right';
export function positionAnnotation(
  canvas: HTMLElement,
  exEl: HTMLElement,
  annEl: HTMLElement,
  side: AnnotationSide,
  opts?: { annWidth?: number; gap?: number }
): void;

// ===== Connector drawing per sub (generic, side-based) =====
// From entities-v2.html lines 2326-2367
export function updateConnector(
  canvas: HTMLElement,
  exEl: HTMLElement,
  annEl: HTMLElement,
  lineEl: SVGLineElement | null,
  dotEl: SVGCircleElement | null,
  side: AnnotationSide
): void;

// ===== Scene dots builder =====
// From entities-v2.html lines 2216-2243 and shell-scroll.ts lines 81-106
export interface DotPhase { label: string; target: number; }
export function buildSceneDots(
  dotsContainer: HTMLElement,
  track: HTMLElement,
  dotPhases: DotPhase[],
  reducedMotion: boolean
): void;

// ===== Scroll hint fade =====
export function fadeScrollHint(progress: number, threshold?: number): void;
```

### Refactor `shell-scroll.ts`

- Remove inline `lerp`, `clamp01`, `smoothstep`, `drawConnector` (lines 113-129)
- Import from `demo-utils.ts` instead
- Keep shell-specific connector functions (`updateSidebarConnectors`, `updateTopbarConnectors`, `updateContentConnectors`) as-is — they have shell-specific positioning logic
- **Verify**: shell.astro still works identically after refactor

---

## Phase 2: Refactor Shared CSS into `demo.css`

### Move INTO `demo.css` (from `shell.css` and/or `entities-v2.html`):

These CSS rules are duplicated between shell.css and entities-v2.html (or are common demo infrastructure):

| CSS Rule | Source | Notes |
|----------|--------|-------|
| `--pb-*` color tokens | shell.css L3-21, entities L12-30 | Identical — move to `.demo-scope` block in demo.css |
| `.demo-scroll-hint` + `@keyframes` | shell.css L24-35, entities L59-70 | Base styles to demo.css; position differs (shell: bottom, entities: top) — use CSS var `--scroll-hint-top` or modifier class |
| `.section-claim` base | shell.css L38-64, entities L81-107 | Identical — move to demo.css |
| `.section-claim .claim-eyebrow/.claim-title/.claim-subtitle` | shell.css L51-63, entities L94-107 | Identical — move to demo.css |
| `.section-claim-final` + children | shell.css L657-679, entities L115-139 | Identical — move to demo.css |
| `.scroll-canvas` | shell.css L102-106, entities L149-153 | Identical — move to demo.css |
| `.screen-mock` | shell.css L109-118, entities L156-165 | Identical — move to demo.css |
| `.browser-bar` / `.browser-dots` / `.browser-dot` / `.browser-url` | shell.css L120-137, entities L166-183 | Identical — move to demo.css |
| `.app-body` | shell.css L140-143, entities L187-190 | Differs only in height (520px vs 540px) — base to demo.css with `--app-body-height` CSS var |
| `.pb-sidebar` base | shell.css L146-152, entities L193-201 | Differs in width (255px vs 56px) — base to demo.css with `--sidebar-width` CSS var |
| `.pb-main` / `.pb-header` | shell.css + entities | Shared — move to demo.css |
| `.extracted` / `.extracted.detached` / `.extracted.glow-border` | shell.css + entities L634-741 | Shared — move to demo.css |
| `.extracted.panel-pad` / `.extracted.no-pad` | entities L740-741 | Shared utility — move to demo.css |
| `.ann-label` / `.ann-card` / `.ann-title` / `.ann-desc` | entities L824-846 | Shared annotation system — move to demo.css (replaces the old `.annotation` class from demo.css) |
| `.conn-line` / `.conn-dot` | entities L858-868 | Shared connector system — move to demo.css |
| `.phase-label` | entities L910-916 | Shared phase indicator — move to demo.css |
| `.scene-dot .dot-mark` / `.scene-dot .dot-label` | entities L890-907 | Enhanced scene dots — move to demo.css (replace simpler versions) |

### Remove FROM `shell.css` (moved to demo.css):
- `--pb-*` tokens (L3-21)
- `.demo-scroll-hint` + keyframes (L24-35)
- `.section-claim` + children (L38-64)
- `.section-claim-final` + children (L657-679)
- `.scroll-track` / `.scroll-stage` (L95-101) — already in demo.css, remove dup
- `.scroll-canvas` (L102-106)
- `.screen-mock` / `.browser-*` (L109-137)
- `.app-body` (L140-143)
- `.pb-sidebar` base (L146-152)
- `.pb-main` / `.pb-header` base
- `.extracted` family

### Keep IN `shell.css` (shell-specific):
- `.section-claim-topbar` (L67-92) — shell-only left-aligned variant
- `.pb-sidebar-gap` (L154-164) — shell extraction effect
- `.pb-topbar` — shell-specific topbar
- `.sb-section`, `.sb-label`, `.sb-trigger`, `.sb-nav`, `.sb-footer`, `.sb-profile` — shell expanded sidebar
- All other shell-specific styles

### Keep IN `demo.css` (already there):
- `.demo-scope` design tokens (HSL variables)
- `.hub-hero` / `.hub-badge` / `.hub-title` / `.hub-cards` / `.hub-card` — hub page
- `.scroll-track` / `.scroll-stage` — already present
- `.progress-rail` / `.progress-rail-fill` — already present
- `.scene-dots` — already present
- `.device-frame` / `.device-bar` — demo device frame
- `.scene` / `.stage-inner` — scene system

### Remove FROM `demo.css` (obsolete):
- `.annotation` / `.annotation .ann-step` / `.annotation .ann-title` / `.annotation .ann-desc` / `.annotation .ann-file` (L177-199) — replaced by `.ann-label` / `.ann-card` / `.ann-title` / `.ann-desc` system

---

## Phase 3: Create `entities.css`

### New file: `src/styles/demo/entities.css`

Contains ONLY entity-specific CSS (not shared with shell):

| CSS Section | Source Lines in entities-v2.html | Notes |
|-------------|----------------------------------|-------|
| `.demo-body` | L33-39 | Page background — may not be needed if website body handles it |
| `.section-claim.left` | L109-112 | Left-aligned variant |
| `.browser-url .url-lock` | L184 | URL lock icon |
| `.pb-sidebar` collapsed rail overrides | L193-232 | `--sidebar-width: 56px`, `.sb-rail-avatar`, `.sb-rail-icon`, `.sb-rail-spacer`, `.sb-rail-profile`, `.sb-rail-health` |
| `.pb-content` / `.pb-breadcrumb` | L330-335 | Content area |
| `.pb-toolbar` / `.pb-toolbar-second` | L338-393 | Toolbar with buttons |
| `.pb-search-input` / `.pb-search-scope` | L396-405 | Search input |
| `.pb-btn-soft` / `.pb-btn-outline` / `.pb-btn-primary-gradient` | L408-426 | Button styles |
| `.pb-gradient-divider` | L1028 | Gradient divider |
| `.pb-soft-gradient-group` / `.sg-btn` | L1035-1058 | Soft gradient button group |
| `.pb-del-filter` / `.df-btn` | L1061-1082 | Deletion filter |
| `.pb-table` / `.pb-table-wrap` | L448-511 | Table styling, sticky columns |
| `.pb-checkbox` | L514-528 | Checkbox |
| `.pb-badge` (+ variants) | L531-551 | Status badges |
| `.pb-row-actions` / `.act-btn` | L554-565 | Row action buttons |
| `.pb-filter-chips` / `.pb-chip` | L568-583 | Filter chips |
| `.pb-pagination` | L586-629 | Pagination footer |
| `.pb-selection-counter` | L632-642 | Selection counter |
| `.pb-card-grid` / `.pb-card` | L645-654 | Card view |
| `.sheet-right` family | L743-821 | Sheet panel (right-side) |
| `.json-snippet` family | L925-1007 | JSON code display |
| `.pb-datetime` variants | L790-840 | Datetime column styling |
| `.pb-colsel` variants | L841-870 | Column selector styling |
| `#claim-1, #claim-2` position overrides | L925-938 | Specific claim positions |
| Responsive `@media` | L1112-1118 | Mobile adjustments |

All styles scoped to `.demo-scope` wrapper.

---

## Phase 4: Create `entities-scroll.ts`

### New file: `src/scripts/demo/entities-scroll.ts`

Extract the inline IIFE from entities-v2.html (lines 2133-5104) into an exported function:

```typescript
import { lerp, clamp01, smoothstep, drawConnector, positionAnnotation,
         updateConnector, buildSceneDots, fadeScrollHint,
         type AnnotationSide } from './demo-utils';

export function initEntitiesScroll(): void {
  // ... extracted from entities-v2.html lines 2133-5104
  // Uses imported helpers instead of inline duplicates
}
```

### What stays in entities-scroll.ts (entity-specific):
- PHASES array (19 phases, lines 2156-2175)
- SECTIONS array (8 section claims, lines 2178-2188)
- SUBS array (18 sub-extractions, lines 2194-2213)
- All 12 special handler functions:
  - `sheet-right` (searchin, advfilter, colsel)
  - `sheet-right-standard` (stdfilter with tab switching)
  - `sticky-name-column` / `sticky-action-column`
  - `search-fixed`
  - `toolbar-up` (filterchips)
  - `pagination-bottom`
  - `datetime-column` / `datetime-iana-toggle`
  - `selection-mock` / `sorting-mock` / `rowactions-dropdown`
  - `viewmode-mock` / `deletion-mock` / `bulk-mock` / `preview-mock`
- Main update loop (progress, phase detection, mock transform, section claims, per-sub extraction)
- `getExtractionTarget()` function (lines 2371-2399) — entity-specific extraction positioning
- Scroll/resize event listeners

### What is replaced by demo-utils imports:
- `lerp`, `clamp01`, `smoothstep` → import from demo-utils
- `drawConnector` → import from demo-utils
- `positionAnnotation` → import from demo-utils
- `updateConnector` → import from demo-utils
- Scene dots builder → import from demo-utils
- Scroll hint fade → import from demo-utils

---

## Phase 5: Add i18n Translations

### Modify: `src/i18n/translations.ts`

Add new translation keys under `demo` for each language block (EN, IT, DE, ES, PT, FR):

```typescript
demo: {
  // ... existing keys ...
  entitiesTitle: 'The Entity List Table',
  entitiesBadge: 'Scroll-Jacking Demo',
  entitiesSubtitle: 'The flagship table component — search, advanced filters, IANA datetime, column selector, sticky columns, selection, bulk actions, CRUD, preview panel. Scroll to explore every feature.',

  // Section claims (9 claims)
  entitiesClaim0Eyebrow: 'The Entity List Table',
  entitiesClaim0Title: 'One table. Every feature. Zero config.',
  entitiesClaim0Subtitle: '...',
  // ... claim-1 through claim-7 ...

  // Annotation texts (44 annotations, each with title + desc)
  entitiesAnnTableTitle: 'The Entity List Table',
  entitiesAnnTableDesc: '...',
  entitiesAnnPaginationTitle: 'Server-side pagination',
  entitiesAnnPaginationDesc: '...',
  // ... all 44 annotations ...

  // UI labels inside the mock (buttons, headers, etc.)
  entitiesUiSearch: 'Search...',
  entitiesUiFilters: 'Filters',
  entitiesUiColumns: 'Columns',
  entitiesUiNew: 'New',
  // ... etc ...
}
```

**Translation strategy**: Add all keys with English values first. Then translate to IT, DE, ES, PT, FR. The annotation descriptions are technical — translations should preserve technical terms (IANA, CRUD, CSV, XLSX, etc.) in all languages.

---

## Phase 6: Create `entities.astro` Page

### New file: `src/pages/[lang]/demo/entities.astro`

Follow the exact pattern of `shell.astro`:

```astro
---
import { translations, LANGUAGES, type LangCode } from '../../../i18n/translations';
import LanguageSwitcher from '../../../components/svelte/LanguageSwitcher.svelte';
import GitHubDropdown from '../../../components/svelte/GitHubDropdown.svelte';
import VirtualTourMegaMenu from '../../../components/svelte/VirtualTourMegaMenu.svelte';
import GitHubIcon from '../../../components/GitHubIcon.astro';
import TopBanner from '../../../components/astro/TopBanner.astro';
import pkg from '../../../../package.json';
import '../../../styles/global.css';
import '../../../styles/demo/demo.css';
import '../../../styles/demo/entities.css';

const version = pkg.version;

export const prerender = true;

export function getStaticPaths() {
  return LANGUAGES.map((lang) => ({
    params: { lang: lang.code === 'en' ? 'en' : lang.code },
  }));
}

const { lang } = Astro.params;
const langCode = (lang ?? 'en') as LangCode;
const t = translations[langCode] ?? translations.en;
const isEn = langCode === 'en';
const docsPath = 'https://docs.primebrick.dev';
const homeHref = isEn ? '/en/' : `/${langCode}/`;
const contactHref = isEn ? '/en/contact' : `/${langCode}/contact`;
const thankyouHref = isEn ? '/en/thank-you' : `/${langCode}/thank-you`;
const demoHref = isEn ? '/en/demo/' : `/${langCode}/demo/`;
const entitiesHref = `${demoHref}entities`;
---

<!doctype html>
<html lang={langCode}>
  <head>
    <!-- Same meta/favicon/hreflang pattern as shell.astro -->
    <title>Primebrick — {t.demo.entitiesTitle}</title>
  </head>
  <body class="min-h-screen bg-slate-950 text-slate-100 antialiased">
    <!-- Ambient gradient background (same as shell.astro) -->
    <!-- TopBanner -->
    <!-- Navigation (same as shell.astro, activeDemo="entities") -->
    <!-- Nav scroll condensation script (same as shell.astro) -->

    <!-- ===== Demo body (from entities-v2.html, scoped) ===== -->
    <div class="demo-scope">

      <!-- Hero section (badge + gradient h1 + subtitle) -->
      <section class="relative z-10 px-6 pt-24 pb-16 text-center">
        <!-- Same pattern as shell.astro hero -->
      </section>

      <!-- Scroll hint -->
      <div class="demo-scroll-hint" id="scroll-hint">↓ Scroll to control the animation</div>

      <!-- Section claims (9 claims) -->
      <!-- Progress rail + dots + phase label -->
      <!-- Scroll track (height: 3200vh) -->
      <!-- Screen mock with full table UI -->
      <!-- 28 extracted overlay elements -->
      <!-- 44 annotation cards -->
      <!-- SVG connectors (45 line/dot pairs) -->

    </div><!-- /.demo-scope -->

    <!-- Website footer (same as shell.astro) -->

    <script>
      import { renderAllIcons } from '../../../scripts/demo/icons';
      import { initEntitiesScroll } from '../../../scripts/demo/entities-scroll';
      renderAllIcons();
      initEntitiesScroll();
    </script>
  </body>
</html>
```

### HTML body mapping (entities-v2.html → entities.astro):

| entities-v2.html Section | Lines | entities.astro Treatment |
|--------------------------|-------|--------------------------|
| `<body class="demo-body">` | L1121 | Replace with website body classes |
| `.ambient-blob` | L1123-1124 | Replace with website ambient gradients (Tailwind) |
| `.demo-title-bar` | L1127-1130 | Remove — replaced by hero section + website nav |
| `.demo-scroll-hint` | L1133 | Keep, inside `.demo-scope` |
| Section claims (9) | L1136-1221 | Keep, replace hardcoded text with `{t.demo.entitiesClaim*}` |
| `.progress-rail` / `.scene-dots` / `.phase-label` | L1224-1226 | Keep, inside `.demo-scope` |
| `.scroll-track` (3200vh) | L1229-1230 | Keep |
| `.scroll-stage` / `.scroll-canvas` | L1230-1231 | Keep |
| `.screen-mock` | L1234-1499 | Keep all HTML, replace hardcoded text with i18n |
| 28 extracted elements | L1500-1920 | Keep all HTML, replace hardcoded text with i18n |
| 44 annotation cards | L2012-2055 | Keep all HTML, replace hardcoded text with i18n |
| SVG connectors | L2057-2103 | Keep as-is |
| Inline SVG icons | L2112-2131 | Keep as-is (or move to icons.ts if reusable) |
| `.demo-footer` | L2109 | Remove — replaced by website footer |

---

## Phase 7: Update VirtualTourMegaMenu

### Modify: `src/components/svelte/VirtualTourMegaMenu.svelte`

Update the entities entry (line 28) to set `href` instead of `null`:

```typescript
// Before:
{ key: 'entities', href: null, color: 'indigo', icon: '...' },

// After:
const entitiesHref = `${demoHref}entities`;
{ key: 'entities', href: entitiesHref, color: 'indigo', icon: '...' },
```

Also update the `activeDemo` prop type to include `'entities'`:

```typescript
activeDemo?: 'hub' | 'shell' | 'entities' | null
```

---

## Phase 8: Update Demo Hub Page

### Modify: `src/pages/[lang]/demo/index.astro`

Update the entities card to link to the new page (remove "coming soon" state):

```astro
<!-- Before: entities card is "coming soon" -->
<!-- After: entities card links to /{lang}/demo/entities -->
```

---

## Phase 9: Verify `shell.astro` Still Works

After Phase 1 (JS refactor) and Phase 2 (CSS refactor), verify that `shell.astro` still works identically:

1. Run `pnpm run dev` (check port 4321 first per dev-server rule)
2. Navigate to `/en/demo/shell`
3. Verify:
   - Hero section displays correctly
   - Scroll animation works (all 13 phases)
   - Annotations appear and disappear correctly
   - Section claims show/hide correctly
   - Scene dots navigate correctly
   - Reduced motion mode works
   - No CSS breakage from shared CSS extraction
4. Run `pnpm run build` to verify no build errors

---

## Phase 10: Verify `entities.astro` Works

1. Navigate to `/en/demo/entities`
2. Verify:
   - Hero section displays correctly
   - All 19 phases animate correctly
   - All 28 extracted elements appear/disappear correctly
   - All 44 annotations show/hide correctly
   - All 9 section claims display at the right time
   - Scene dots navigate correctly (7 dots)
   - Progress rail fills correctly
   - Phase label updates correctly
   - Special handlers work (sheet-right, toolbar-up, bulk-mock, preview-mock, etc.)
   - Ghost annotation bug is not present (scroll up/down/up)
   - Reduced motion mode works
   - All 6 language routes work (`/en/`, `/it/`, `/de/`, `/es/`, `/pt/`, `/fr/`)
3. Run `pnpm run build` to verify no build errors

---

## File Inventory

### New files (5):
| File | Purpose |
|------|---------|
| `src/scripts/demo/demo-utils.ts` | Shared JS helpers (lerp, smoothstep, drawConnector, positionAnnotation, buildSceneDots, etc.) |
| `src/scripts/demo/entities-scroll.ts` | Entity demo scroll-jacking engine (~2,500 lines) |
| `src/styles/demo/entities.css` | Entity-specific CSS (~600 lines) |
| `src/pages/[lang]/demo/entities.astro` | Entity demo page (~800 lines) |

### Modified files (4):
| File | Changes |
|------|---------|
| `src/styles/demo/demo.css` | Add shared CSS (PB tokens, scroll-hint, section-claim, screen-mock, browser-bar, app-body, extracted, ann-label, conn-line, phase-label, scene-dot enhanced). Remove obsolete `.annotation` class. |
| `src/styles/demo/shell.css` | Remove shared CSS that moved to demo.css. Keep only shell-specific styles. |
| `src/scripts/demo/shell-scroll.ts` | Replace inline helpers with imports from `demo-utils.ts`. |
| `src/i18n/translations.ts` | Add `entitiesTitle`, `entitiesBadge`, `entitiesSubtitle`, 9 section claim texts, 44 annotation title+desc pairs, UI labels — for all 6 languages. |
| `src/components/svelte/VirtualTourMegaMenu.svelte` | Enable entities link, update activeDemo type. |
| `src/pages/[lang]/demo/index.astro` | Update entities card to link to new page. |

---

## Execution Order

1. **Phase 1**: Create `demo-utils.ts` → Refactor `shell-scroll.ts` → Verify shell still works
2. **Phase 2**: Refactor `demo.css` (add shared) → Refactor `shell.css` (remove shared) → Verify shell still works
3. **Phase 3**: Create `entities.css` (entity-specific only)
4. **Phase 4**: Create `entities-scroll.ts` (extract from HTML, import from demo-utils)
5. **Phase 5**: Add i18n translations (all 6 languages)
6. **Phase 6**: Create `entities.astro` (HTML body + i18n + script imports)
7. **Phase 7**: Update VirtualTourMegaMenu
8. **Phase 8**: Update demo hub page
9. **Phase 9**: Full verification of shell.astro
10. **Phase 10**: Full verification of entities.astro

---

## Acceptance Criteria

- [ ] `demo-utils.ts` created with shared helpers, exported and typed
- [ ] `shell-scroll.ts` imports from `demo-utils.ts` (no inline duplicates)
- [ ] `shell.astro` works identically after JS + CSS refactor
- [ ] `demo.css` contains all shared demo CSS (PB tokens, scroll, screen-mock, extracted, annotations, connectors, scene-dots, section-claim)
- [ ] `shell.css` contains only shell-specific CSS
- [ ] `entities.css` contains only entity-specific CSS
- [ ] `entities-scroll.ts` created with all 19 phases, 18 subs, 12 special handlers
- [ ] `entities-scroll.ts` imports shared helpers from `demo-utils.ts`
- [ ] `entities.astro` created with full website nav, hero, demo body, footer
- [ ] All text in `entities.astro` uses i18n translation keys
- [ ] All 6 languages have complete translations for entity demo
- [ ] `VirtualTourMegaMenu` links to entities page, "coming soon" removed
- [ ] Demo hub page card links to entities page
- [ ] `pnpm run build` succeeds with no errors
- [ ] Entity demo scroll animation works correctly (all 19 phases)
- [ ] No ghost annotations on scroll up/down/up
- [ ] Reduced motion mode works
- [ ] All 6 language routes generate correctly

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| CSS refactor breaks shell.astro | Verify shell after each CSS change (Phase 2 step-by-step) |
| `.demo-scroll-hint` position differs (top vs bottom) | Use CSS variable `--scroll-hint-position` or modifier class |
| `.app-body` height differs (520px vs 540px) | Use CSS variable `--app-body-height` in demo.css |
| `.pb-sidebar` width differs (56px vs 255px) | Use CSS variable `--sidebar-width` in demo.css |
| `.scene-dot` structure differs (entities has .dot-mark/.dot-label) | Use enhanced version in demo.css, shell works with it too |
| i18n translation volume (~100+ keys × 6 languages) | Add EN first, then translate. Use consistent technical terms. |
| entities-scroll.ts is ~2,500 lines | Extract verbatim from HTML, only replacing helper functions with imports. Keep all logic intact. |
| Ghost annotation bugs on scroll-back | Already fixed in entities-v2.html — preserve all reset blocks in `amount < 0.01` handler |
