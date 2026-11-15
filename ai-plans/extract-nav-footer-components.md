# Plan: Extract Nav and Footer into Shared Astro Components

## Objective

Eliminate the copy-pasted nav bar and footer across 15 page files by extracting them into two reusable Astro components. This is the root-cause fix for the repeated DRY violations.

## Current State (Empiric Findings)

### Pages with nav/footer (15 files)

| Page | Nav variant | Footer variant | Scroll script |
|------|-------------|----------------|---------------|
| `[lang]/index.astro` | homeHref=`isEn?'/'`, home active, no activeDemo/persona | standard (GitHubIcon, version, GitHub(R)) | WITH logo anim |
| `[lang]/contact.astro` | homeHref, contact active, no activeDemo/persona | standard but "GitHub" (no (R)) | WITH logo anim |
| `[lang]/thank-you.astro` | homeHref, thankyou active, no activeDemo/persona | standard (GitHubIcon, version, GitHub(R)) | WITH logo anim |
| `[lang]/use-cases/index.astro` | `isEn?'/'`, NO id=nav-logo, NO Thank You link, no activeDemo/persona | BROKEN: hardcoded copyright, no version, wrong GitHub URL, no GitHubIcon | WITHOUT logo anim |
| `[lang]/use-cases/developer.astro` | homeHref, no active link, activePersona="developer" | standard | WITHOUT logo anim |
| `[lang]/use-cases/tech-leader.astro` | homeHref, no active link, activePersona="tech-leader" | standard | WITHOUT logo anim |
| `[lang]/use-cases/solution-architect.astro` | homeHref, no active link, activePersona="solution-architect" | standard | WITHOUT logo anim |
| `[lang]/use-cases/cto.astro` | homeHref, no active link, activePersona="cto" | standard | WITHOUT logo anim |
| `[lang]/use-cases/visionary-entrepreneur.astro` | homeHref, no active link, activePersona="visionary-entrepreneur" | standard | WITHOUT logo anim |
| `[lang]/use-cases/soc-team.astro` | homeHref, no active link, activePersona="soc-team" | standard | WITHOUT logo anim |
| `[lang]/demo/index.astro` | homeHref, no active link, activeDemo="hub" | standard | WITH logo anim |
| `[lang]/demo/shell.astro` | homeHref, no active link, activeDemo="shell" | standard | WITH logo anim |
| `[lang]/demo/entity-list-table.astro` | homeHref, no active link, activeDemo="entity-list-table" | standard | WITH logo anim |
| `[lang]/demo/exports.astro` | homeHref, no active link, activeDemo="exports" | standard | WITH logo anim |
| `[lang]/demo/versions.astro` | homeHref, no active link, activeDemo="versions" | standard | WITH logo anim |

### Page without nav/footer (1 file)
- `src/pages/index.astro` — root redirect page, no nav/footer

### Identified variations to unify

1. **Logo href**: `isEn ? '/' : ...` vs `homeHref` -> **use `homeHref` everywhere** (user decision)
2. **Logo attributes**: some pages missing `id="nav-logo"` and `transition-all duration-300` -> **include both everywhere**
3. **Scroll script**: WITH vs WITHOUT logo text-size animation -> **WITHOUT** (logo is an image, animation is dead code) (user decision)
4. **Active link**: different pages highlight different nav links -> **`activePage` prop on Nav component** (user decision)
5. **Thank You link**: missing on `use-cases/index.astro` -> **include everywhere**
6. **Footer GitHub text**: "GitHub" vs "GitHub(R)" -> **"GitHub(R)" everywhere** (matches homepage)
7. **Footer GitHub URL**: `https://github.com/primebrick` vs `https://github.com/michaelsogos/primebrick-v3-website` -> **correct URL everywhere**
8. **Footer copyright**: hardcoded vs `t.footer.copyright` -> **i18n everywhere**
9. **Footer version**: missing on `use-cases/index.astro` -> **include everywhere**
10. **Footer GitHubIcon**: missing on `use-cases/index.astro` -> **include everywhere**

## Components to Create

### 1. `src/components/astro/Nav.astro`

**Props:**
```typescript
interface Props {
  currentLang: LangCode;           // required — locale code
  activeDemo?: string | null;      // optional — 'hub'|'shell'|'entity-list-table'|'exports'|'versions'|null
  activePersona?: string | null;   // optional — 'developer'|'tech-lead'|'solution-architect'|'cto'|'visionary-entrepreneur'|'soc-team'|null
  activePage?: string | null;      // optional — 'home'|'contact'|'thank-you'|null
}
```

**Internal logic:**
- Derive `isEn`, `t`, `docsPath`, `homeHref`, `contactHref`, `thankyouHref` from `currentLang` + translations
- Import `LanguageSwitcher`, `GitHubDropdown`, `VirtualTourMegaMenu`, `UseCasesMegaMenu` internally
- Render the full `<nav>` with all 7 links + mega menus + dropdowns
- Apply `text-sky-400` + `aria-current="page"` to the link matching `activePage`
- Pass `activeDemo` to `VirtualTourMegaMenu` (only if provided)
- Pass `activePersona` to `UseCasesMegaMenu` (only if provided)
- Include the scroll `<script>` (WITHOUT logo animation — dead code since logo is an image)
- Logo uses `homeHref`, `id="nav-logo"`, `transition-all duration-300`

**Rendered output:**
```html
<nav id="site-nav" class="sticky top-9 z-50 ...">
  <div id="nav-inner" class="mx-auto flex max-w-7xl ...">
    <a href={homeHref} class="flex items-center gap-2 transition-all duration-300" id="nav-logo" ...>
      <img src="/logo-full-dark.svg" ... />
    </a>
    <div class="flex items-center gap-6 text-sm">
      <a href={homeHref} class={activePage==='home' ? 'text-sky-400' : 'text-slate-300 hover:text-sky-400'} ...>Home</a>
      <VirtualTourMegaMenu client:load currentLang={langCode} activeDemo={activeDemo} />
      <UseCasesMegaMenu client:load currentLang={langCode} activePersona={activePersona} />
      <a href={docsPath} ...>Docs</a>
      <a href={contactHref} class={activePage==='contact' ? 'text-sky-400' : ...} ...>Contact</a>
      <a href={thankyouHref} class={activePage==='thank-you' ? 'text-sky-400' : ...} ...>Thank You</a>
      <a href="https://opensource.org/license/MIT" ...>MIT License</a>
      <GitHubDropdown client:load />
      <LanguageSwitcher client:load currentLang={langCode} />
    </div>
  </div>
</nav>
<script> /* scroll behavior without logo anim */ </script>
```

### 2. `src/components/astro/Footer.astro`

**Props:**
```typescript
interface Props {
  currentLang: LangCode;  // required — locale code
}
```

**Internal logic:**
- Derive `t` from `currentLang` + translations
- Import `GitHubIcon` and `pkg` internally
- Derive `version = pkg.version`
- Render the standard footer with i18n copyright, version badge, GitHub(R) link with icon

**Rendered output:**
```html
<footer class="relative z-10 border-t border-slate-800/50 px-6 py-8">
  <div class="mx-auto flex max-w-7xl items-center justify-between text-sm text-slate-500">
    <span>&copy; 2026 {t.footer.copyright}</span>
    <div class="flex items-center gap-4">
      <span class="text-xs text-slate-600">v{version}</span>
      <a href="https://github.com/michaelsogos/primebrick-v3-website" ...>
        <GitHubIcon class="h-4 w-4" />
        GitHub(R)
      </a>
    </div>
  </div>
</footer>
```

## Implementation Steps

### Step 1: Create `Nav.astro`
- File: `src/components/astro/Nav.astro`
- Implement props, internal imports, nav HTML, scroll script
- No external dependencies beyond existing components

### Step 2: Create `Footer.astro`
- File: `src/components/astro/Footer.astro`
- Implement props, internal imports, footer HTML
- No external dependencies beyond GitHubIcon + package.json

### Step 3: Migrate homepage (`[lang]/index.astro`)
- Replace nav HTML + scroll script with `<Nav currentLang={langCode} activePage="home" />`
- Replace footer HTML with `<Footer currentLang={langCode} />`
- Remove now-unused imports: `LanguageSwitcher`, `GitHubDropdown`, `VirtualTourMegaMenu`, `UseCasesMegaMenu`, `GitHubIcon`
- Keep page-specific imports: `CloudLogos`, `RotatingHeadline`, `SchemaToProduction`, `GitHubCTAButton`, `TopBanner`
- Keep `TopBanner` usage (it stays in the page, above `<Nav>`)

### Step 4: Migrate contact page (`[lang]/contact.astro`)
- Replace nav + scroll with `<Nav currentLang={langCode} activePage="contact" />`
- Replace footer with `<Footer currentLang={langCode} />`
- Remove now-unused imports
- Keep page-specific: `ContactForm`, `ObfuscatedEmail`, `TopBanner`

### Step 5: Migrate thank-you page (`[lang]/thank-you.astro`)
- Replace nav + scroll with `<Nav currentLang={langCode} activePage="thank-you" />`
- Replace footer with `<Footer currentLang={langCode} />`
- Remove now-unused imports
- Keep page-specific: `OpenSourceHeart`, `ThankYouScroll`, `GratitudeMarquee`, `CREDITS`, `MARQUEE_NAMES`, `TopBanner`

### Step 6: Migrate use-cases index (`[lang]/use-cases/index.astro`)
- Replace nav + scroll with `<Nav currentLang={langCode} />` (no activePage, no activePersona)
- Replace broken footer with `<Footer currentLang={langCode} />`
- Remove now-unused imports
- Keep page-specific: `personas`, `personaNames`, `accentMap`, `TopBanner`

### Step 7: Migrate 6 persona pages (parallel via subagents)
For each of: `developer.astro`, `tech-leader.astro`, `solution-architect.astro`, `cto.astro`, `visionary-entrepreneur.astro`, `soc-team.astro`:
- Replace nav + scroll with `<Nav currentLang={langCode} activePersona="<persona>" />`
- Replace footer with `<Footer currentLang={langCode} />`
- Remove now-unused imports: `LanguageSwitcher`, `GitHubDropdown`, `VirtualTourMegaMenu`, `UseCasesMegaMenu`, `GitHubIcon`, `pkg`
- Keep page-specific: `TopBanner`, persona-specific variables (`nextPersonaHref`, `prevPersonaHref`, `useCasesHref`)

### Step 8: Migrate 5 demo pages (parallel via subagents)
For each of: `demo/index.astro`, `demo/shell.astro`, `demo/entity-list-table.astro`, `demo/exports.astro`, `demo/versions.astro`:
- Replace nav + scroll with `<Nav currentLang={langCode} activeDemo="<demo>" />`
- Replace footer with `<Footer currentLang={langCode} />`
- Remove now-unused imports
- Keep page-specific: `DemoHero`, demo-specific translations, CSS, scripts, `TopBanner`

### Step 9: Verify
- Navigate to each page type on localhost:4321
- Verify nav renders correctly with all links
- Verify active link highlighting on homepage, contact, thank-you
- Verify mega menus still work (open/close, mutual exclusion)
- Verify footer renders with version + GitHub(R) + i18n copyright
- Verify scroll behavior (nav condenses on scroll)
- Check console for errors on all page types
- Verify no broken imports

## Acceptance Criteria

1. `Nav.astro` and `Footer.astro` exist in `src/components/astro/`
2. All 15 pages use `<Nav>` and `<Footer>` components instead of inline HTML
3. No page has inline nav HTML, inline footer HTML, or inline scroll script
4. The `use-cases/index.astro` page is fixed (Thank You link, correct footer, version)
5. All pages show the same nav links in the same order
6. Active page highlighting works on homepage, contact, thank-you
7. `activeDemo` prop works on all 5 demo pages
8. `activePersona` prop works on all 6 persona pages
9. No console errors on any page
10. No broken imports (build succeeds)

## Files Impacted

### New files (2)
- `src/components/astro/Nav.astro`
- `src/components/astro/Footer.astro`

### Modified files (15)
- `src/pages/[lang]/index.astro`
- `src/pages/[lang]/contact.astro`
- `src/pages/[lang]/thank-you.astro`
- `src/pages/[lang]/use-cases/index.astro`
- `src/pages/[lang]/use-cases/developer.astro`
- `src/pages/[lang]/use-cases/tech-leader.astro`
- `src/pages/[lang]/use-cases/solution-architect.astro`
- `src/pages/[lang]/use-cases/cto.astro`
- `src/pages/[lang]/use-cases/visionary-entrepreneur.astro`
- `src/pages/[lang]/use-cases/soc-team.astro`
- `src/pages/[lang]/demo/index.astro`
- `src/pages/[lang]/demo/shell.astro`
- `src/pages/[lang]/demo/entity-list-table.astro`
- `src/pages/[lang]/demo/exports.astro`
- `src/pages/[lang]/demo/versions.astro`

### Unchanged files
- `src/pages/index.astro` (root redirect, no nav/footer)
- `src/components/astro/TopBanner.astro` (stays as-is, used by pages above Nav)
- `src/components/GitHubIcon.astro` (stays as-is, used by Footer)
- `src/components/svelte/VirtualTourMegaMenu.svelte` (stays as-is)
- `src/components/svelte/UseCasesMegaMenu.svelte` (stays as-is)
- `src/components/svelte/LanguageSwitcher.svelte` (stays as-is)
- `src/components/svelte/GitHubDropdown.svelte` (stays as-is)

## Bug Fix: Tech Leader icon not centered

### Problem

The Tech Leader "user" icon is visually off-center inside its colored container box. All other 5 persona icons are centered at x=12 in the 24x24 viewBox, but the Tech Leader icon content is centered around x=9.

### Root cause (empiric)

The icon SVG content is:
- Path: `M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2` — spans x=1 to x=17
- Circle: `cx="9" cy="7" r="4"` — head at x=9

The visual center is ~x=9, not x=12. All other persona icons have their content centered at x=12.

### Fix

Shift the Tech Leader icon content right by 3 units so the visual center is at x=12:
- Path: `M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2` (x values +3)
- Circle: `cx="12" cy="7" r="4"` (cx 9 -> 12)

### Files to update

1. `src/components/svelte/UseCasesMegaMenu.svelte` — line 49, the `icon` field for `tech-leader`
2. `src/pages/[lang]/use-cases/developer.astro` — Tech Leader appears as "Next persona" card (line 278)
3. `src/pages/[lang]/use-cases/solution-architect.astro` — Tech Leader appears as "Previous persona" card (line 275)
4. `src/pages/[lang]/use-cases/tech-leader.astro` — Tech Leader icon in the page hero (line 112)
5. `src/pages/[lang]/use-cases/index.astro` — Tech Leader appears in the persona card list (line 45)

### Verification

- Open developer.astro page, check the "Next persona" (Tech Leader) icon is centered in its colored box
- Open solution-architect.astro page, check the "Previous persona" (Tech Leader) icon is centered
- Open the Use Cases mega menu, check the Tech Leader card icon is centered
- Compare with other persona icons (Developer, CTO, etc.) — all should be visually centered

## Risk Assessment

- **Low risk**: Nav and Footer are presentational components with no business logic
- **Low risk**: Scroll script is identical across pages (just removing dead logo animation)
- **Low risk**: Tech Leader icon fix is a 3-unit coordinate shift, no structural change
- **Medium risk**: Import path depth differs between `[lang]/` and `[lang]/use-cases/` and `[lang]/demo/` — the shared components use absolute-from-src paths, so no relative path issues
- **Mitigation**: Migrate in small batches, verify with Playwright after each batch
