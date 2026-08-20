# Feature Plan: Convert Approved Demo HTML → Astro Pages

> Status: DRAFT — awaiting user approval (keyword `PROCEED`)
> Repo: `primebrick-v3-website` (Astro static site, Cloudflare Workers)
> Author: Devin (GLM-5.2 High)
> Date: 2026-07-29
> Scope: Convert the two **approved** prototype pages — `temp/pb-demo/index.html`
> (hub) and `temp/pb-demo/shell-v2.html` (The Shell scroll-jacking demo) — into
> first-class Astro pages inside `primebrick-v3-website`. **Empirical, zero
> assumptions, no layout changes** to the approved demo content.
>
> Every fact in §3 below was verified by reading the actual source files during
> the planning phase — nothing is deferred to build time except the build itself
> (which the workflow rule forbids until `PROCEED`).

---

## 1. Objective

Port the two approved prototype HTML pages into the Astro website as real,
prerendered, multi-language pages that follow the **same patterns and best
practices as the existing `[lang]/*.astro` pages** — while preserving the
approved demo content layout (hero, hub cards, scroll-jacking stage, screen
mock, annotations, claims) **byte-for-byte visually**.

The prototype's own `.site-nav` / `.site-footer` chrome is **discarded** — the
demo is wrapped in the website's standard page chrome (TopBanner + sticky nav +
footer + head), exactly like `src/pages/[lang]/index.astro`. The demo
**content** (everything inside `<body>` after the nav, minus the demo's own
nav/footer) is preserved verbatim.

---

## 2. Confirmed decisions (from user Q&A)

| # | Question | Decision |
|---|----------|----------|
| 1 | Routing / i18n | **Multi-language** under `src/pages/[lang]/demo/*` with `getStaticPaths()` over `LANGUAGES` (EN/IT/DE/ES/PT/FR). Nav/hero/card strings translated via `translations.ts`. The mocked shell UI labels (`Organizzazione`, `Modulo`, `Collegamenti`, `Profilo`, `Europe/Rome`, `IT`, etc.) stay **as-is** — they represent the real localized FE in a captured state, not translatable chrome. |
| 2 | Shared assets (CSS/JS) | **`src/styles` + bundled (Vite).** CSS → `src/styles/demo/*.css` imported in page frontmatter. JS → `src/scripts/demo/*.ts` imported by Astro `<script>` tags (bundled + hashed by Vite). |
| 3 | Hub cards (9 total, only Shell approved) | **Keep all 9 cards visually identical.** Shell card → new shell route. The 8 unported demos → `href="#"` + `coming-soon` class (non-navigating). `shell-v2` was a prototype filename — website route is **`shell`** (`/en/demo/shell`). |
| 4 | Nav chrome | **Use the website's global nav** (TopBanner + sticky nav + footer), like `src/pages/[lang]/index.astro`. Prototype `.site-nav` / `.site-footer` not ported. |
| 5 | Nav entry point | **"Virtual Tour" is a mega-menu dropdown** (not a single link), mirroring the `Use Cases` mega menu in `temp/use-cases-index.html` (VERIFIED — see §3.6). Implemented as a new `VirtualTourMegaMenu.svelte` component (Svelte 5 runes, `client:load`) following the existing `GitHubDropdown.svelte` pattern (site convention for dropdowns), with the mega-panel visual language from the use-cases reference. The mega panel lists a "Demo Hub" link (→ `/en/demo/`) on top, then all 9 demo cards (Shell clickable → `/en/demo/shell`; the other 8 disabled with "Coming soon"). Plugged into the nav of all 5 pages (3 existing `[lang]/*.astro` + 2 new demo pages). Active state (`aria-current="page"`, `text-sky-400`) on the button when on a demo page. Label **"Virtual Tour"** — new i18n key `nav.virtualTour`. |
| 6 | Disabled-card badges | **All 8 unported cards get "Coming soon".** collab/agentic **keep** their existing `PREVIEW` badge too → those two show both badges. |

---

## 3. Empirical findings (VERIFIED during planning — not deferred)

### 3.1 Prototype source — `temp/pb-demo/index.html` (121 lines, the hub)
- `<head>`: title "Primebrick in Motion — Feature Demo"; `<link rel="stylesheet" href="styles.css">`; `<script src="icons.js">`, `<script src="scroll.js">`.
- `<body>`: two `.ambient-blob` divs (`.blob-1`, `.blob-2`); a `.site-nav` (brand "P" mark + 6 links: Demo/Features/Docs/API Catalog/GitHub/Contact); a `.hub-hero` (`.hub-badge` with `[data-icon="monitorPlay"]`, `.hub-title`, `.hub-subtitle`); a `.hub-cards` grid of **9 `.hub-card` anchors** (each: `.card-icon` `[data-icon]`, `.card-title`, `.card-desc`, `.card-arrow`); two cards carry class `preview` (collab, agentic); a `.site-footer`.
- **No inline `<script>`** — fully static. `scroll.js` is loaded but never called (no `initScrollDemo` invocation). `icons.js` auto-renders `[data-icon]` placeholders on `DOMContentLoaded`.

### 3.2 Prototype source — `temp/pb-demo/shell-v2.html` (1944 lines, The Shell)
- `<head>`: title "Primebrick Demo — The Shell"; `<link rel="stylesheet" href="styles.css">`; `<script src="icons.js?v=lucidefix">`, `<script src="scroll.js">`; a **large inline `<style>` (lines 11–821)**.
- Inline `<style>` defines: `:root` `--pb-*` tokens; `.demo-body`; `.demo-title-bar` + `.demo-title` + `.demo-subtitle`; `.demo-scroll-hint` + `@keyframes scroll-hint-pulse`; `.ambient-blob` (opacity **0.2** — overrides `styles.css`'s 0.3 via cascade) + `.blob-1`/`.blob-2`; `.section-claim` / `-topbar` / `-content` / `-final`; `.scroll-track` / `.scroll-stage` / `.scroll-canvas`; `.screen-mock` + `.browser-bar` + `.browser-dots`/`.browser-dot`/`.browser-url`; `.app-body`; `.pb-sidebar` + `.pb-sidebar-gap` + `.sb-section`/`.sb-label`/`.sb-trigger`/`.sb-nav`/`.sb-nav-item`/`.sb-footer`/`.sb-profile`/`.sb-badges`; `.pb-main` + `.pb-header` + `.pb-header-left`/`-right`/`-toggle`/`-search`/`-tz`/`-lang`/`-btn`/`-ai-cta`; `.pb-content` + `.pb-breadcrumb` + `.pb-page-title` + `.pb-btn-*` + `.pb-content-footer*` + `.pb-audit-*` + `.pb-version-badge`; `.ann-label` / `.ann-card` / `.ann-title` / `.ann-desc`; `.topbar-extracted`; `.content-extracted` + `.pb-content-extracted-*`; `.connector-svg` / `.conn-line` / `.conn-dot`; `.progress-rail` / `.progress-rail-fill`; `.scene-dots` / `.scene-dot` (+ `.dot-mark`/`.dot-label`); `.phase-label`; `.demo-footer`; `.static-stack` / `.static-scene`; `@media (max-width: 900px)` blocks.
- `<body class="demo-body">` (lines 823–1212): ambient blobs; fixed `.demo-title-bar`; `.demo-scroll-hint` (`#scroll-hint`); `.section-claim` (`#section-claim`) + `.section-claim-topbar` (`#section-claim-topbar`); `.progress-rail` > `#rail-fill`; `.scene-dots` (`#dots`); `.phase-label` (`#phase-label`); `.scroll-track` (height `2000vh`, `#track`) > `.scroll-stage` (`#stage`) > `.scroll-canvas` (`#canvas`) containing:
  - `.screen-mock` (`#screen-mock`): `.browser-bar` + `.app-body` (`.pb-sidebar` `#sidebar` with `#sidebar-gap` + org/module/nav sections + `.sb-footer`; `.pb-main` with `.pb-header` `#topbar` + `.pb-content` profile-settings skeleton).
  - `.sidebar-extracted` (`#sidebar-extracted`): full sidebar duplicate.
  - 5 sidebar `.ann-label` cards (`#ann-org`, `#ann-module`, `#ann-nav`, `#ann-profile`, `#ann-health`).
  - 8 topbar `.ann-label` cards (`#ann-toggle`, `#ann-search`, `#ann-tz`, `#ann-lang`, `#ann-errors`, `#ann-notif`, `#ann-ai`, `#ann-theme`).
  - `.topbar-extracted` (`#topbar-extracted`): topbar duplicate with `#ex-tb-*` ids.
  - `.content-extracted` (`#content-extracted`): content duplicate with breadcrumb dropdown (`#ex-content-breadcrumb`, `#ex-content-bc-dropdown`, `#ex-content-bc-menu`, `#ex-content-title`).
  - 3 content `.ann-label` cards (`#ann-breadcrumb`, `#ann-bc-menu`, `#ann-page-title`).
  - `.section-claim-content` (`#section-claim-content`), `.section-claim-final` (`#section-claim-final`).
  - Inline SVG `<defs>` (`#ai-cta-gradient`) + `.connector-svg` (`#connectors`) with 16 `<line class="conn-line">` + 16 `<circle class="conn-dot">` (ids: `line-org`…`line-page-title`, `dot-org`…`dot-page-title`).
  - `.demo-footer` ("Back to Demo Hub" → `index.html`).
- Inline `<script>` IIFE (lines 1214–1941): custom scroll-jacking engine (does **not** use `scroll.js`'s `initScrollDemo`). Verified full body:
  - Grabs `track`, `screenMock`, `sidebar`, `sidebarGap`, `sidebarExtracted`, `topbarExtracted`, `contentExtracted`, `railFill`, `dotsContainer`, `phaseLabel`, `canvas`, `connectorsSvg`; `if (!track || !screenMock) return;`.
  - `reducedMotion` check → static fallback (sets screenMock transform, returns).
  - `PHASES` array (13 entries, start/end progress 0.00–1.00).
  - `SB_ANNOTS` (5), `TB_ANNOTS` (8), `CONTENT_ANNOTS` (3) — each `{id, exId/tbId/ctId, annId, lineId, dotId}`.
  - Builds 5 scene dots (`Start`/`Sidebar`/`Topbar`/`Content`/`Conclusion`) with custom click-scroll targets.
  - `lerp`, `clamp01`, `smoothstep` helpers.
  - `drawConnector`, `updateSidebarConnectors`, `updateTopbarConnectors`, `updateContentConnectors` (measure `getBoundingClientRect` of extracted elements vs `canvas`).
  - `positionSidebarAnnotations`, `positionTopbarAnnotations`, `positionContentAnnotations` (position annotation cards relative to extracted elements).
  - `update()`: progress from track rect; rail fill; scroll-hint fade; 4 section-claim opacity curves; phase tracking + dot/label updates; `screenMock` transform (scale/translate per phase); topbar/sidebar/content extraction + reassembly transforms; annotation fade; connector drawing; SVG size update.
  - Passive `scroll` + `resize` listeners; `update()` initial call.

### 3.3 Prototype shared assets
- **`styles.css`** (744 lines, VERIFIED full read): design tokens (light/dark `:root` with HSL `--background` etc. + `--site-bg`/`--site-surface`); base reset `* { margin:0; padding:0; box-sizing:border-box }` + `html` + `body` (font `'Inter Variable'...`, `background: var(--site-bg)`, `color: hsl(var(--foreground))`, `overflow-x: hidden`); `.site-nav`/`.site-footer` (UNUSED by us — discarded with prototype chrome); `.ambient-blob` (opacity **0.3**) + `.blob-1`/`.blob-2`; `.hub-hero`/`.hub-badge`/`.hub-title`/`.hub-subtitle`/`.hub-cards`/`.hub-card` (+ `::before`, `:hover`, `.card-icon`/`.card-title`/`.card-desc`/`.card-arrow`); `.hub-card.preview .card-title::after { content:'PREVIEW'; ... }` (L186-190); `.scroll-track`/`.scroll-stage`/`.stage-inner`/`.scene`/`.progress-rail`/`.scene-dots`/`.scene-dot`; `.annotation`/`.ann-step`/`.ann-title`/`.ann-desc`/`.ann-file`; `.device-frame`/`.device-bar`/`.device-dots`/`.device-url`; `.mock-app`/`.mock-sidebar`/`.mock-topbar`/`.mock-*` (these `.device-*`/`.mock-*`/`.scene`/`.annotation` classes are **NOT used by the 2 approved pages** — they belong to the other 8 demos that use `initScrollDemo`; verbatim copy keeps them as harmless dead CSS); `.static-stack`/`.static-scene`; `@media (max-width: 900px)` blocks.
- **`icons.js`** (222 lines, VERIFIED full read): `ICONS` map (Lucide paths, MIT — strings, string[], or `IconNode[]` with `{type, attrs}`); `makeIcon(paths)` builds an `<svg xmlns width=24 height=24 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2 ...>` with one `<path>`/`<circle>`/`<rect>` per entry; `renderIcon(name, target)`; `renderAllIcons()` replaces every `[data-icon]` placeholder with the built SVG via `el.replaceWith(svg)`; auto-runs on `DOMContentLoaded` (lines 217–223 — **this auto-run block will be removed** in the TS module; pages call `renderAllIcons()` explicitly).
- **`scroll.js`** (136 lines, VERIFIED full read): `initScrollDemo(opts)` + `typewriter(...)`. **Not used by either approved page** (hub is static; shell has its own IIFE). Relocated to `src/scripts/demo/scroll.ts` for the future demos; **not imported** this round.

### 3.4 Target website (VERIFIED)
- `astro.config.mjs`: `output: 'static'` + `@astrojs/cloudflare` (`imageService:'compile'`, `platformProxy.enabled`) + `@astrojs/svelte` + `@tailwindcss/vite`. `site: 'https://primebrick.dev'`.
- **`src/layouts/` EXISTS but is EMPTY** (no shared layout component). `src/pages/features/` EXISTS but EMPTY. `src/content/marketing/` EXISTS but EMPTY. → The inline-chrome-per-page pattern is the only option; demo pages mirror `src/pages/[lang]/index.astro`.
- **Routing**: `src/pages/[lang]/*.astro` + `getStaticPaths()` returning `LANGUAGES.map(lang => ({ params: { lang: lang.code === 'en' ? 'en' : lang.code } }))`. Verified identical shape in `index.astro`, `contact.astro`, `thank-you.astro`.
- **i18n** `src/i18n/translations.ts` (1835 lines, VERIFIED): `LANGUAGES` array (6: en/it/de/es/pt/fr, each `{code, label, hreflang}`). `translations` object, each lang has: `nav { home, features, docs, apiCatalog, github, license, contact, thankyou }` (NOTE: `features` + `apiCatalog` keys exist but are **NOT rendered** in any page's nav today); `hero`; `stats`; `multicloud`; `frontend`; `postgres`; `collaboration`; `enterprise`; `ai`; `footer { copyright }`; `banner { text }`; `contact`; `thankyou`. **No `demo` block, no `nav.demo`, no `nav.virtualTour` exists.**
- **Page chrome pattern** (VERIFIED across `index.astro`/`contact.astro`/`thank-you.astro`):
  - `<head>`: charset, viewport, description, favicons (svg/32png/512png/ico/apple-touch), `title`, hreflang alternates (one `<link rel=alternate hreflang>` per lang, + `x-default`), canonical.
  - `<body class="min-h-screen bg-slate-950 text-slate-100 antialiased">`.
  - Ambient gradient background: `<div class="pointer-events-none fixed inset-0 overflow-hidden">` with 3 blurred blobs — present in `index.astro` + `contact.astro`, **ABSENT in `thank-you.astro`**. So ambient is optional per page.
  - `<TopBanner text={t.banner.text} href={contactHref} />` (sticky top-0 z-60, takes `text`+`href` — VERIFIED in `TopBanner.astro`).
  - Sticky `<nav id="site-nav" class="sticky top-9 z-50 ...">` with `<div id="nav-inner">`: logo `<img src="/logo-full-dark.svg">`, then links `<a>` for Home/Docs/Contact/Thank-you/License (active one has `class="text-sky-400" aria-current="page"`), `<GitHubDropdown client:load />`, `<LanguageSwitcher client:load currentLang={langCode} />`.
  - Inline `<script>` IIFE: nav-condense-on-scroll (adds/removes `bg-slate-950/80`, `backdrop-blur-md`, `shadow-lg`, `border-slate-800/80`; swaps `py-4`↔`py-2`). Identical snippet in all 3 pages.
  - Footer: `© 2026 {t.footer.copyright}`, `v{version}`, GitHub link with `<GitHubIcon>`.
- **`LanguageSwitcher.svelte`** (VERIFIED): `currentLang` prop; links to `/` for en, `/{code}/` for others — **does NOT preserve the current path** (switching lang on `/en/demo/shell` goes to `/it/`, not `/it/demo/shell`). This is existing behavior, unchanged.
- **`GitHubDropdown.svelte`** (VERIFIED): self-contained with `<style>`, `client:load`. No props.
- **Styling**: Tailwind 4 via `@tailwindcss/vite`. `src/styles/global.css` = `@import "tailwindcss";` (1 line). Tailwind Preflight applies the same `*{margin:0;box-sizing:border-box}` reset as `styles.css` L76 — **compatible** (verified: identical reset semantics).
- **Icons**: `simple-icons` 16.26.0 runtime dep. **No `@lucide/svelte`, no `bits-ui`** (VERIFIED in `package.json`). The demo's inlined Lucide path map is the correct approach.
- **`public/_redirects`** (VERIFIED, 3 lines): `/ /en/ 302`, `/contact /en/contact 302`, `/thank-you /en/thank-you 302`.
- **`package.json`** (VERIFIED): `astro 7.0.7`, `@astrojs/svelte 9.0.1`, `@astrojs/cloudflare 14.1.2`, `svelte 5.56.4`, `tailwindcss 4.3.2`, `@tailwindcss/vite 4.3.2`, `simple-icons 16.26.0`. No new deps needed.
- **Conventions**: kebab-case filenames; `export const prerender = true`; Svelte only for interactivity (not needed here — scroll-jacking stays vanilla JS in `<script>`); no Node.js APIs in SSR.
- **Dev server**: port **4321** (never start a 2nd instance, never kill existing). Never commit without explicit user instruction.

### 3.5 Mega-menu reference — `temp/use-cases-index.html` (VERIFIED full read, 176 lines)
The user pointed to this as the reference for the Virtual Tour nav item. It is a **mega-menu dropdown**, not a single link. Structure (lines 19-43 + toggle JS line 175):
- **Wrapper**: `<div class="relative" id="usecases-menu">` inside the nav `<div class="flex items-center gap-6 text-sm">`.
- **Trigger**: `<button onclick="toggleMega()" class="flex items-center gap-1 text-sky-400 transition-colors" aria-current="page">Use Cases<svg chevron-down/></button>` (active state = `text-sky-400` + `aria-current="page"`; inactive = `text-slate-300 hover:text-sky-400`).
- **Panel**: `<div id="mega-panel" class="hidden absolute right-0 top-full mt-2 w-[560px] rounded-2xl border border-slate-700/50 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-xl">`:
  - Top: `<a href="use-cases-index.html" class="mb-3 flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-sky-400...">` "All Use Cases" (home icon).
  - Body: `<div class="grid grid-cols-2 gap-3">` of 6 persona cards. Each card: `<a class="group rounded-xl border border-slate-800/50 bg-slate-800/30 p-3 hover:border-{color}-500/30 hover:bg-slate-800/50 transition-all">` containing a colored icon square (`flex h-8 w-8 ... rounded-lg bg-{color}-500/20 text-{color}-400`) + `<span class="text-sm font-semibold text-white">` title + `<p class="mt-1 text-xs text-slate-400">` one-line desc.
- **Toggle JS** (vanilla, line 175): `function toggleMega(){document.getElementById('mega-panel').classList.toggle('hidden')} document.addEventListener('click',(e)=>{const m=document.getElementById('usecases-menu');if(m&&!m.contains(e.target))document.getElementById('mega-panel').classList.add('hidden')});` — button toggles `hidden`; click-outside closes.
- **Adaptation for the website**: the reference uses vanilla JS + Tailwind CDN. The website's existing convention for dropdowns is `GitHubDropdown.svelte` (Svelte 5 runes: `let open = $state(false)`, `toggle()`, `close()`, `<svelte:window onclick={close} />`, `client:load`). So `VirtualTourMegaMenu.svelte` mirrors `GitHubDropdown`'s Svelte pattern (site convention) but renders the mega-panel visual from the use-cases reference. The 9 demo cards replace the 6 persona cards; grid adapts to 9 items (3-col × 3-row, keeping the same card visual). Shell card is a real `<a>`; the other 8 are disabled (`aria-disabled="true"`, `cursor-not-allowed`, dimmed, "Coming soon" pill — same disabled treatment as the hub cards in §8).

### 3.6 Cascade / import-order verification (the one real CSS risk)
- Prototype load order: `styles.css` first (`<link>` in `<head>`), then shell-v2's inline `<style>` (later in `<head>`). Inline `<style>` wins on conflicts.
- Astro replication: import `demo.css` then `shell.css` in `shell.astro` frontmatter. Vite preserves import order in the bundled CSS. → `shell.css`'s `.ambient-blob { opacity: 0.2 }` overrides `demo.css`'s `0.3`, exactly as in the prototype. **Verified mechanism** (Vite CSS import order = source order).
- The `* { margin:0; padding:0; box-sizing:border-box }` reset in `demo.css` applies to the whole demo page (including website nav). Tailwind Preflight does the same — no conflict. The `body { font-family: 'Inter Variable'... }` in `demo.css` overrides the site font on demo pages only — acceptable (demo pages are self-contained). **Verified compatible.**

---

## 4. Target architecture mapping

| Prototype | Website target |
|-----------|----------------|
| `index.html` (hub) | `src/pages/[lang]/demo/index.astro` |
| `shell-v2.html` (The Shell) | `src/pages/[lang]/demo/shell.astro` |
| `styles.css` | `src/styles/demo/demo.css` (verbatim) |
| shell-v2 inline `<style>` (L11-821) | `src/styles/demo/shell.css` (verbatim, no `<style>` tags) |
| `icons.js` | `src/scripts/demo/icons.ts` (exports `renderAllIcons`, auto-run block removed) |
| `scroll.js` | `src/scripts/demo/scroll.ts` (relocated, **not imported** this round) |
| hub `.site-nav` / `.site-footer` | **Replaced** by website TopBanner + sticky nav + footer |
| shell `.demo-title-bar` / `.demo-footer` | **Kept** (demo content, not site chrome); `.demo-footer` href → hub route |
| `temp/use-cases-index.html` mega menu (reference) | **New `src/components/svelte/VirtualTourMegaMenu.svelte`** (Svelte 5, `client:load`) — mirrors `GitHubDropdown.svelte` pattern + use-cases mega-panel visual |
| nav entry point | **`<VirtualTourMegaMenu client:load currentLang={langCode} />`** in nav of all 5 pages (3 existing + 2 new) |

Routes produced (per lang): `{lang}/demo/` and `{lang}/demo/shell` → `/en/demo/`, `/en/demo/shell`, `/it/demo/`, … (6 langs × 2 pages = 12 prerendered pages).

---

## 5. File-by-file creation plan

### 5.1 `src/scripts/demo/icons.ts` (NEW)
- Copy `temp/pb-demo/icons.js` content verbatim into a TS module.
- Keep `ICONS`, `makeIcon`, `renderIcon`, `renderAllIcons` as **exports**.
- **Remove** the auto-run-on-DOMContentLoaded block (icons.js L217-223). Each demo page's `<script>` imports `renderAllIcons` and calls it explicitly (Astro `<script>` is `type="module"` = deferred = DOM ready when it runs; no `DOMContentLoaded` listener needed).
- Types: `export type IconNode = { type?: string; attrs: Record<string, string> };` and `export const ICONS: Record<string, string | string[] | IconNode[]>`.
- No behavior change: same SVG output, same `[data-icon]` → `<svg>` replacement.

### 5.2 `src/scripts/demo/scroll.ts` (NEW — relocated, unused this round)
- Copy `temp/pb-demo/scroll.js` verbatim as a TS module; export `initScrollDemo` and `typewriter`. Dead code for now, ready for future demos. **Not imported** by either page in this plan.

### 5.3 `src/styles/demo/demo.css` (NEW)
- Copy `temp/pb-demo/styles.css` **verbatim** (all 744 lines, including the unused `.site-nav`/`.site-footer`/`.device-*`/`.mock-*`/`.scene`/`.annotation` rules — harmless dead CSS).
- Imported only by the two demo pages. Its `body`/`*` reset and font-family apply only to demo pages (compatible with Tailwind Preflight — verified §3.5).

### 5.4 `src/styles/demo/shell.css` (NEW)
- Copy the **inline `<style>` block of `shell-v2.html` (lines 11–821)** verbatim (without surrounding `<style>` tags).
- Imported only by `shell.astro`, **after** `demo.css` (preserves the prototype cascade — verified §3.5).

### 5.5 `src/pages/[lang]/demo/index.astro` (NEW — the hub)
- Frontmatter:
  ```ts
  import { translations, LANGUAGES, type LangCode } from '../../../i18n/translations';
  import TopBanner from '../../../components/astro/TopBanner.astro';
  import GitHubDropdown from '../../../components/svelte/GitHubDropdown.svelte';
  import LanguageSwitcher from '../../../components/svelte/LanguageSwitcher.svelte';
  import VirtualTourMegaMenu from '../../../components/svelte/VirtualTourMegaMenu.svelte';
  import GitHubIcon from '../../../components/GitHubIcon.astro';
  import pkg from '../../../../package.json';
  import '../../../styles/global.css';
  import '../../../styles/demo/demo.css';
  import { renderAllIcons } from '../../../scripts/demo/icons';

  const version = pkg.version;
  export const prerender = true;
  export function getStaticPaths() {
    return LANGUAGES.map((lang) => ({ params: { lang: lang.code === 'en' ? 'en' : lang.code } }));
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
  const shellHref = `${demoHref}shell`;
  ```
- `<head>`: mirror `[lang]/index.astro` — charset, viewport, description (`t.demo.hubSubtitle.slice(0,160)`), favicons, `title` = `Primebrick — {t.demo.hubTitle}`, hreflang alternates (`/{l.code}/demo/`, x-default `/en/demo/`), canonical `https://primebrick.dev/{lang}/demo/`.
- `<body class="min-h-screen bg-slate-950 text-slate-100 antialiased">`:
  - Website ambient gradient div (3 blurred blobs) — **included** (matches `index.astro`).
  - `<TopBanner text={t.banner.text} href={contactHref} />`.
  - Sticky `<nav id="site-nav">` with logo + links: Home, **`<VirtualTourMegaMenu client:load currentLang={langCode} activeDemo="hub" />`**, Docs, Contact, Thank-you, License, `<GitHubDropdown client:load />`, `<LanguageSwitcher client:load currentLang={langCode} />`.
  - **Demo content** verbatim from `index.html` lines 13–114 **minus** `.site-nav` (L18-31) and `.site-footer` (L116-118):
    - Two `.ambient-blob` divs (`.blob-1`, `.blob-2`) — **kept** (part of approved demo background; coexist with website ambient — both `pointer-events:none` decorative).
    - `.hub-hero`: `.hub-badge` with `[data-icon="monitorPlay"]` + `{t.demo.hubBadge}`; `.hub-title` = `{t.demo.hubTitle}`; `.hub-subtitle` = `{t.demo.hubSubtitle}`.
    - `.hub-cards` grid: 9 cards. For each: `.card-icon` `[data-icon]` (kept verbatim), `.card-title` + `.card-desc` via new i18n keys (§7). Hrefs:
      - Shell card → `shellHref`.
      - Other 8 → `href="#"` + class `hub-card coming-soon` + `aria-disabled="true"`. collab/agentic keep `preview` class too (→ both PREVIEW + Coming soon badges).
  - Website footer (like `[lang]/index.astro`): `© 2026 {t.footer.copyright}`, `v{version}`, GitHub link.
- `<script>` (Astro module, bundled):
  ```ts
  import { renderAllIcons } from '../../../scripts/demo/icons';
  renderAllIcons();
  // nav-condense snippet (copied verbatim from [lang]/index.astro L86-109)
  // .coming-soon click guard:
  document.querySelectorAll('.hub-card.coming-soon').forEach(a => {
    a.addEventListener('click', (e) => e.preventDefault());
  });
  ```

### 5.6 `src/pages/[lang]/demo/shell.astro` (NEW — The Shell)
- Frontmatter: same imports as 5.5 **plus** `import '../../../styles/demo/shell.css';` (after `demo.css`).
- `<head>`: title `Primebrick — {t.demo.shellTitle}`, hreflang alternates `/{l.code}/demo/shell`, x-default `/en/demo/shell`, canonical, description.
- `<body class="min-h-screen bg-slate-950 text-slate-100 antialiased demo-body">` (add `demo-body` — same dark bg `#020617`, compatible):
  - Website ambient gradient div — **included**.
  - `<TopBanner>`, sticky `<nav>` with **`<VirtualTourMegaMenu client:load currentLang={langCode} activeDemo="shell" />`** (same nav row as 5.5).
  - **Demo content** verbatim from `shell-v2.html` lines 823–1212 **minus** `.demo-footer` (L1212) — keeping `.demo-title-bar`, `.demo-scroll-hint`, `.section-claim*` blocks, progress rail, dots, phase label, the entire `.scroll-track` tree (screen mock, `.sidebar-extracted`, annotations, `.topbar-extracted`, `.content-extracted`, `.section-claim-content`, `.section-claim-final`, SVG `<defs>`, `.connector-svg`). All mocked UI Italian labels stay **exactly as-is**.
  - `.demo-footer` "Back to Demo Hub" → repoint href to `demoHref` (instead of `index.html`); **kept** as in-scene footer. Website footer rendered below it.
- `<script>` (Astro module, bundled): contains the **entire IIFE from `shell-v2.html` lines 1215–1941**, with `import { renderAllIcons } from '../../../scripts/demo/icons'; renderAllIcons();` called **first**, then the IIFE body (logic unchanged). The IIFE's `if (!track || !screenMock) return;` guard protects against missing elements. The `?v=lucidefix` cache-buster is dropped (Vite hashes the bundle). Plus the nav-condense snippet.

### 5.7 `src/components/svelte/VirtualTourMegaMenu.svelte` (NEW — the mega menu)
- Svelte 5 runes component, `client:load`. Mirrors `GitHubDropdown.svelte` (VERIFIED §3.4) for the dropdown mechanic, renders the use-cases mega-panel visual (VERIFIED §3.5).
- Props: `currentLang: string` (to build localized hrefs), `activeDemo?: 'hub' | 'shell' | null` (to set `aria-current="page"` + `text-sky-400` on the trigger when on a demo page; default `null`).
- Script block (Svelte 5 runes, mirroring GitHubDropdown):
  ```svelte
  <script lang="ts">
    import { translations, LANGUAGES, type LangCode } from '../../i18n/translations';
    let { currentLang = 'en', activeDemo = null }: { currentLang?: string; activeDemo?: 'hub' | 'shell' | null } = $props();
    let open = $state(false);
    function toggle() { open = !open; }
    function close() { open = false; }
    const langCode = (currentLang as LangCode) ?? 'en';
    const isEn = langCode === 'en';
    const demoHref = isEn ? '/en/demo/' : `/${langCode}/demo/`;
    const shellHref = `${demoHref}shell`;
    const t = translations[langCode] ?? translations.en;
    // 9 demo entries: key, href (or null = coming soon), icon (inline SVG path), color
    const demos = [
      { key: 'shell',    href: shellHref, color: 'sky',     icon: '<path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M3 9h18 M9 21V9"/>' },
      { key: 'entities', href: null,      color: 'indigo',  icon: '<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>' },
      { key: 'exports',  href: null,      color: 'violet',  icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>' },
      { key: 'aiChat',   href: null,      color: 'emerald', icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
      { key: 'security', href: null,      color: 'amber',   icon: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>' },
      { key: 'versions', href: null,      color: 'rose',    icon: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2"/>' },
      { key: 'modules',  href: null,      color: 'cyan',    icon: '<path d="m7.5 4.27 9 5.15M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>' },
      { key: 'collab',   href: null,      color: 'fuchsia', icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
      { key: 'agentic',  href: null,      color: 'orange',  icon: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>' },
    ];
  </script>
  <svelte:window onclick={close} />
  ```
- Markup (mega-panel visual from use-cases reference, adapted for 9 items → 3-col grid):
  ```svelte
  <div class="vt-menu" onclick={(e) => e.stopPropagation()}>
    <button onclick={toggle} class="vt-trigger" aria-expanded={open} aria-current={activeDemo ? 'page' : undefined} class:vt-active={activeDemo}>
      {t.nav.virtualTour}
      <svg class="vt-chevron" class:vt-chevron-open={open} viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4.5L6 7.5L9 4.5"/></svg>
    </button>
    {#if open}
      <div class="vt-panel">
        <a href={demoHref} class="vt-all-link"><!-- home icon --> {t.demo.megaAllLink}</a>
        <div class="vt-grid">
          {#each demos as d}
            <a
              href={d.href ?? '#'}
              class="vt-card group"
              class:vt-disabled={!d.href}
              aria-disabled={!d.href}
              onclick={(e) => { if (!d.href) e.preventDefault(); }}
            >
              <div class="vt-card-icon vt-color-{d.color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">{@html d.icon}</svg></div>
              <div>
                <div class="vt-card-title">{t.demo.card[d.key].title}</div>
                <div class="vt-card-desc">{t.demo.card[d.key].megaDesc}</div>
              </div>
              {#if !d.href}<span class="vt-coming">{t.demo.comingSoon}</span>{/if}
            </a>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  ```
- `<style>`: scoped, mirroring `GitHubDropdown.svelte`'s scoped-style approach + the use-cases mega-panel classes (translated to scoped rules): `.vt-menu{position:relative;display:inline-block}`, `.vt-trigger` (matches existing nav `<a>` styling: `text-slate-300 hover:text-sky-400`, `.vt-active` = `text-sky-400`), `.vt-panel` (`position:absolute;right:0;top:100%;margin-top:.5rem;width:680px;border-radius:1rem;border:1px solid #33415599;background:#0f172af2;padding:1.25rem;box-shadow:0 25px 50px -12px rgba(0,0,0,.5);backdrop-filter:blur(16px);z-index:100`), `.vt-all-link` (small, `text-slate-400 hover:text-sky-400`), `.vt-grid` (`display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem`), `.vt-card` (the use-cases card: `rounded-xl;border:1px solid #1e293b80;background:#1e293b4d;padding:.75rem;transition:all .2s`), `.vt-card:hover` (border + bg lighten — disabled cards override to no-hover), `.vt-disabled` (`opacity:.5;cursor:not-allowed`), `.vt-card-icon` (`flex h-8 w-8 items-center justify-center rounded-lg`), `.vt-color-{sky|indigo|...}` (bg-{color}-500/20 text-{color}-400 equivalents — hardcoded hex pairs since these are scoped, not Tailwind utilities), `.vt-card-title` (`text-sm font-semibold text-white`), `.vt-card-desc` (`mt-1 text-xs text-slate-400`), `.vt-coming` (small pill, top-right, matches the hub `coming-soon` treatment).
- Width note: use-cases reference uses `w-[560px]` for 6 cards in 2-col. 9 cards in 3-col → `680px` (3 × ~200px + gaps + padding). Verified arithmetic; final width confirmed at build visual check (§9).

### 5.8 `src/pages/[lang]/index.astro`, `contact.astro`, `thank-you.astro` (EDIT — add Virtual Tour mega menu)
- In each page's sticky `<nav>` `<div class="flex items-center gap-6 text-sm">`, add `<VirtualTourMegaMenu client:load currentLang={langCode} activeDemo={null} />` between Home and Docs (matches existing nav pattern — `GitHubDropdown` + `LanguageSwitcher` are already there as `client:load` Svelte islands; this is one more, no layout change).
- Frontmatter: add `import VirtualTourMegaMenu from '../../components/svelte/VirtualTourMegaMenu.svelte';` and `const demoHref = isEn ? '/en/demo/' : \`/${langCode}/demo/\`;` (demoHref used by the mega menu internally via currentLang; kept for any in-page link if needed).
- No other changes to these 3 pages.

### 5.9 `public/_redirects` (EDIT)
- Append (do NOT touch existing 3 lines):
  ```
  /demo/      /en/demo/      302
  /demo/shell /en/demo/shell  302
  ```

### 5.10 `src/i18n/translations.ts` (EDIT)
- Add `nav.virtualTour` to each of the 6 `nav` blocks.
- Add a `demo` block to each of the 6 langs with the keys in §7.

---

## 6. Nav / footer chrome adaptation (detail)

Demo pages replicate the inline chrome of `src/pages/[lang]/index.astro`:
- Ambient gradient background div (3 blurred blobs).
- `<TopBanner text={t.banner.text} href={contactHref} />`.
- Sticky `<nav id="site-nav">` with logo, links (Home, **`<VirtualTourMegaMenu client:load currentLang={langCode} activeDemo="hub"|"shell" />`** [active on demo pages], Docs, Contact, Thank-you, License), `<GitHubDropdown client:load>`, `<LanguageSwitcher client:load currentLang={langCode}>`.
- Nav-condense-on-scroll `<script>` snippet (copied verbatim from `[lang]/index.astro` L86-109).
- Footer: `© 2026 {t.footer.copyright}`, `v{version}`, GitHub link.

The prototype's `.site-nav` (brand "P" + Demo/Features/Docs/API Catalog/GitHub/Contact) is **not** ported. The website nav covers Docs/Contact/GitHub; "Features"/"API Catalog" from the prototype nav are not present in the website nav and are not added. The only nav addition is the **Virtual Tour mega menu** (on all 5 pages) — a Svelte island matching the existing `GitHubDropdown`/`LanguageSwitcher` island pattern, with the mega-panel visual from `temp/use-cases-index.html` (VERIFIED §3.5).

---

## 7. i18n keys to add (`translations.ts` → `nav.virtualTour` + `demo` block per lang)

`nav.virtualTour` (new key in each lang's `nav`):
- en: "Virtual Tour" · it: "Tour Virtuale" · de: "Virtuelle Tour" · es: "Tour Virtual" · pt: "Tour Virtual" · fr: "Tour Virtuel"

`demo` block (new, per lang). English source values; other 5 langs translated:

```
demo: {
  hubBadge: "Interactive Feature Tour",
  hubTitle: "Primebrick in Motion",
  hubSubtitle: "Scroll through the real Primebrick backoffice — every screen is a faithful replica of the actual UI, animated as you scroll. Pick a tour below.",
  shellTitle: "The Shell",
  comingSoon: "Coming soon",
  megaAllLink: "All Demos",   // mega-menu top link → /{lang}/demo/
  card: {
    shell:    { title: "The Shell",               desc: "App shell anatomy: org & module switchers, dynamic sidebar nav from /meta, command palette, IANA timezone, theme toggle, health badge.", megaDesc: "The shell that wraps every brick." },
    entities: { title: "Entity List Table",       desc: "The flagship: search, advanced filters, IANA datetime toggle, column selector, sticky columns, selection, bulk actions, exports, CRUD, preview.", megaDesc: "Search, filter, edit, export." },
    exports:  { title: "Exports",                 desc: "XLSX, CSV, HTML, PDF, and email-optimized exports with live preview dock and scope selection.", megaDesc: "XLSX, CSV, PDF, email." },
    aiChat:   { title: "E2E encrypted AI Chat — Private by Design", desc: "In-backoffice AI assistant with SSE streaming, RAG citations, and client-side tool calls. LLM runs locally — no data leaves your infra.", megaDesc: "Private AI, local LLM." },
    security: { title: "Security & Step-Up",      desc: "Passkey/WebAuthn enrollment & login with biometric ceremonies, plus MFA step-up modal for critical actions.", megaDesc: "Passkeys, MFA, step-up." },
    versions: { title: "Version History & Errors", desc: "Audit timeline with action icons and field-level diffs, plus the centralized error panel with impact-colored event cards.", megaDesc: "Audit trail + error panel." },
    modules:  { title: "Modular Bricks",          desc: "Module list with health status, dynamic settings from config_entries, and self-registering microservices discovered via /meta.", megaDesc: "Self-registering modules." },
    collab:   { title: "Real-time Collaboration", desc: "Presence avatars, field-level merge badges, and conflict resolution. Preview of upcoming UX — backend is ready, UI is next.", megaDesc: "Presence + field merge." },
    agentic:  { title: "Agentic Development",     desc: "Describe a feature, approve the plan, watch it build & deploy. Preview of upcoming UX — not yet in the product.", megaDesc: "Describe, approve, ship." },
  }
}
```

The mocked shell UI strings (Italian labels, `Europe/Rome`, `John Doe`, `Acme Corp`, `Settings`, `Profile`, etc.) are **hardcoded in `shell.astro`** and **not** translated — they are content of the mocked screenshot.

---

## 8. Hub cards link handling (detail)

In `index.astro`, the 9 `.hub-card` anchors:
- **Shell**: `<a href={shellHref} class="hub-card">` (real route, navigates).
- **Other 8**: `<a href="#" class="hub-card coming-soon" aria-disabled="true">`.
  - `.coming-soon` style: appended to `demo.css` (or a tiny `<style is:global>` in `index.astro`). Keeps the card visually identical (same grid, size, icon/title/desc/arrow) but adds a subtle "Coming soon" pill (top-left corner, small) and `cursor: not-allowed`. **No change to card layout.**
  - collab/agentic keep `preview` class → their existing `PREVIEW` badge (after title) stays, plus the new `Coming soon` pill → both badges visible (per decision #6).
  - Hub `<script>`: `document.querySelectorAll('.hub-card.coming-soon').forEach(a => a.addEventListener('click', e => e.preventDefault()))` so `#` never navigates.

---

## 9. Build-time-only verification (inherently post-PROCEED)

These cannot be done in plan mode (the workflow rule forbids executing commands until `PROCEED`). They are the ONLY things not yet verified:

1. `pnpm install` (no new deps — should be a no-op).
2. `pnpm run check` (astro check) — must pass with no type errors.
3. `pnpm run build` — must succeed; confirm `dist/en/demo/index.html` + `dist/en/demo/shell.html` (and all 6 langs × 2) are emitted.
4. Dev verify on `localhost:4321` (reuse existing dev server if running — do NOT start a 2nd instance, do NOT kill existing):
   - `/en/demo/` — hub renders, 9 cards, icons render, nav condenses on scroll, Virtual Tour trigger shows `text-sky-400` + `aria-current="page"` (activeDemo="hub"), Shell card → `/en/demo/shell`, other 8 show "Coming soon" + don't navigate.
   - `/en/demo/shell` — scroll-jacking works: progress rail fills, scene dots update, screen mock scales/moves, sidebar/topbar/content extract with annotations + connectors, 4 section claims fade in/out, final claim; Virtual Tour trigger active (activeDemo="shell").
   - **Mega menu** (on every page): click "Virtual Tour" → panel opens (680px, 3-col grid, "All Demos" link + 9 cards); click "All Demos" → `/en/demo/`; click Shell card → `/en/demo/shell`; click any of the 8 disabled cards → no navigation, "Coming soon" pill visible; click outside → panel closes; chevron rotates when open.
   - `prefers-reduced-motion: reduce` → static fallback (shell page).
   - Narrow viewport (≤900px) → responsive rules apply (mega panel may need a responsive width — confirm at build visual check).
   - LanguageSwitcher → `/it/demo/`, `/de/demo/`, etc. render with translated chrome + translated mega menu; mocked shell Italian labels unchanged.
   - `/demo/` and `/demo/shell` 302-redirect to `/en/*` (via `_redirects`).
   - Virtual Tour mega menu appears in nav on `/en/`, `/en/contact`, `/en/thank-you`, `/en/demo/`, `/en/demo/shell` (5 pages).
5. Visual diff rendered demo content vs prototype opened directly — layout must match (icons, spacing, colors, scroll behavior).

---

## 10. Acceptance criteria

- [ ] `src/pages/[lang]/demo/index.astro` and `src/pages/[lang]/demo/shell.astro` exist, both with `export const prerender = true` and `getStaticPaths()` over all 6 `LANGUAGES`.
- [ ] `src/styles/demo/demo.css` (verbatim `styles.css`) and `src/styles/demo/shell.css` (verbatim shell inline `<style>`) created.
- [ ] `src/scripts/demo/icons.ts` (exports `renderAllIcons`, no auto-run) and `src/scripts/demo/scroll.ts` (relocated, unused) created.
- [ ] `src/i18n/translations.ts` has `nav.virtualTour` + a `demo` block (incl. `megaAllLink` + per-card `megaDesc`) in all 6 langs.
- [ ] `src/components/svelte/VirtualTourMegaMenu.svelte` created (Svelte 5 runes, `client:load`, mirrors `GitHubDropdown` mechanic + use-cases mega-panel visual; lists Demo Hub link + 9 demo cards; Shell clickable, 8 disabled with "Coming soon").
- [ ] `public/_redirects` has `/demo/` and `/demo/shell` 302 redirects (existing 3 lines untouched).
- [ ] `src/pages/[lang]/index.astro`, `contact.astro`, `thank-you.astro` each have `<VirtualTourMegaMenu client:load currentLang={langCode} activeDemo={null} />` in the nav (no other changes).
- [ ] Demo pages use website TopBanner + sticky nav (with `<VirtualTourMegaMenu activeDemo="hub"|"shell" />`) + footer (not prototype `.site-nav`/`.site-footer`).
- [ ] Mega menu: opens on click, closes on outside-click, "Demo Hub" → `/en/demo/`, Shell card → `/en/demo/shell`, other 8 disabled (non-navigating, "Coming soon" pill).
- [ ] Hub: 9 cards visually identical; Shell card → `/en/demo/shell`; other 8 → `href="#"` + `coming-soon` (non-navigating); collab/agentic show both PREVIEW + Coming soon.
- [ ] Shell: full scroll-jacking behavior + reduced-motion fallback intact; mocked UI labels unchanged.
- [ ] `pnpm run check` and `pnpm run build` pass; 12 pages emitted to `dist`.
- [ ] No new runtime dependencies. No changes to `astro.config.mjs`, `package.json` deps, or existing page layouts (only the one mega-menu island addition in nav).
- [ ] No commit made (await explicit user instruction).

---

## 11. Out of scope (explicitly)

- Porting the other 8 demos (entities, exports, ai-chat, security, versions-errors, modules, collab, agentic) — their cards are disabled.
- Converting the scroll-jacking IIFE into a Svelte component (stays vanilla JS in `<script>`).
- Server-rendering the Lucide icons (kept client-side `renderAllIcons`).
- Changing `astro.config.mjs`, adding dependencies, or altering existing page layouts.
- Any change to the approved demo content layout/visuals.
- Fixing `LanguageSwitcher` to preserve the current path (existing behavior, out of scope).
