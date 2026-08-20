# Feature Plan: "Thank You" Landing Page

> Status: DRAFT — awaiting user approval (keyword `PROCEED`)
> Repo: `primebrick-v3-website` (Astro static site, deployed to Cloudflare Workers)
> Author: Devin (GLM-5.2 High)
> Date: 2026-07-27

## 1. Objective

Add a new **"Thank You"** landing page to `primebrick.dev` that credits every
open-source project, organization, and group of authors whose work Primebrick
builds upon — across **all 7 Primebrick repos** (website, docs, BE, FE, US, DAL,
SDK) including docs tooling and the website itself.

The page must:

- Be linked from the **top navigation menu** of every page.
- Be **multi-language** (EN/IT/DE/ES/PT/FR) like the rest of the site.
- Be **prerendered** (0ms Worker CPU, free on Cloudflare).
- Deliver a **daring, cool scroll-driven experience** that reinforces the
  **spirit and soul of the open-source community** — not a boring credits list.
- Use only the **existing stack** (Astro + Svelte 5 runes + Tailwind CSS 4).
  No new runtime dependencies. Icons via the already-installed `simple-icons`
  package (website dep) where possible.

## 2. Empirical findings (analysis phase)

### 2.1 Website architecture (verified)

- **Rendering**: `astro.config.mjs` → `output: 'static'` + `@astrojs/cloudflare`.
  All pages prerendered. New page MUST set `export const prerender = true`.
- **No shared Layout component.** `src/layouts/` does not exist. Each page
  (`src/pages/[lang]/index.astro`, `src/pages/[lang]/contact.astro`) is a full
  HTML document with **inline** `<nav>`, ambient gradient background, footer.
  → The new page must replicate this inline structure (copy from `contact.astro`
  as the closest simpler sibling).
- **Routing**: i18n via `src/pages/[lang]/*.astro` with `getStaticPaths()`
  returning one entry per language in `LANGUAGES`.
- **i18n**: single file `src/i18n/translations.ts` (~146 KB). 6 languages.
  Each lang object has a `nav: { features, docs, apiCatalog, github, license,
  contact }` block. Note: `features` and `apiCatalog` nav keys already exist
  but are **not rendered** in the current nav.
- **Nav markup** is inline in each page (lines ~61–81). Current rendered items:
  Docs, Contact, License, GitHubDropdown, LanguageSwitcher.
- **Styling**: Tailwind CSS 4 via `@tailwindcss/vite`. `src/styles/global.css`
  is just `@import "tailwindcss";`. Dark theme: `bg-slate-950`, sky/indigo/cyan
  accents, ambient blurred gradient blobs, `backdrop-blur`.
- **Interactivity**: Svelte 5 runes (`$state`, `$effect`). Hydration via
  `client:load` / `client:idle`. **No IntersectionObserver** used today;
  scroll effects use `window.addEventListener('scroll', ..., { passive: true })`
  (see `SchemaToProduction.svelte` and the inline nav-condense script).
- **Redirects**: `public/_redirects` currently has:
  ```
  / /en/ 302
  /contact /en/contact 302
  ```
- **Footer**: inline per page, shows `© 2026 {t.footer.copyright}`, version,
  GitHub link.
- **Icons**: `simple-icons` 16.26.0 is a runtime dependency — provides SVG path
  data for brand logos (Astro, Svelte, React, Tailwind, Cloudflare, etc.) via
  `import { siAstro } from 'simple-icons'`.

### 2.2 Dependencies to thank (deduplicated, across all 7 repos)

Source: empirical read of every `package.json` in the workspace. Grouped by
category for the page sections. Each entry = name + npm package + canonical
homepage (only well-known URLs, no guesses).

**Core frameworks**: Astro, Svelte / SvelteKit, React, Zudoku, Express, Hono,
Vite, Bun (runtime).
**UI / styling**: Tailwind CSS, simple-icons, Lucide, bits-ui, shadcn-svelte
ecosystem (clsx, tailwind-merge, tailwind-variants, cva), Fontsource (Inter),
flag-icons.
**Data / messaging**: node-postgres (pg), pg-query-stream, Redis (node-redis),
NATS, reflect-metadata (Microsoft).
**Auth / security**: jose (Panva), openid-client (Panva), Casdoor, DOMPurify
(Cure53), zxcvbn-ts, cookie-parser, cors.
**Infra / deploy**: Cloudflare Wrangler, @astrojs/cloudflare, sharp.
**Docs tooling**: Zudoku, Mermaid, Shiki, pdfmake, TypeDoc.
**Build / tooling**: TypeScript (Microsoft), ESLint (OpenJS), typescript-eslint,
Vitest, Playwright (Microsoft), axe-core / @axe-core (Deque), Testing Library,
jsdom, tsx, PostCSS, dotenv.
**AI / ML**: Vercel AI SDK, @modelcontextprotocol (Anthropic), Hugging Face
Transformers.js.
**Validation**: Zod.
**Templating**: Handlebars, html2pdf.js.
**Svelte ecosystem extras**: svelte-motion, svelte-sonner, sveltekit-superforms,
formsnap, runed, svelte-toolbelt, sveld, unplugin-icons, Iconify.
**Utilities**: ExcelJS, @microsoft/fetch-event-source, @internationalized/date
(Adobe React Spectrum), globals.

> The page will present a **curated, human-readable** subset organized into
> thematic sections (not all 90+ packages verbatim). Each section credits the
> **org/author group** and links to their homepage.

## 3. Design — the "daring scroll experience"

### 3.1 Concept: "Standing on the shoulders of giants"

A single long-scroll page. As the user scrolls, open-source projects appear
section by section with cinematic transitions, reinforcing that Primebrick is
a mosaic built by a global community.

### 3.2 Scroll effects (Svelte 5, no new deps)

A new island component `ThankYouScroll.svelte` (hydrated `client:load`) drives
the experience using the **same scroll-listener pattern** already in the
codebase (`SchemaToProduction.svelte`):

1. **Reveal-on-scroll**: each credit card fades + translates up when it enters
   the viewport. Implemented with an `IntersectionObserver` (new to this page
   only, but a Web API — allowed on Workers runtime since it's client-side JS,
   not SSR). Falls back to "always visible" if unsupported.
2. **Parallax glow**: the ambient gradient blobs move at different speeds based
   on `scrollY` (pure transform, GPU-friendly).
3. **Progress rail**: a thin vertical gradient bar on the left that fills as the
   user scrolls through the credits — visual metaphor for "the journey of
   building on open source".
4. **Staggered card entrance**: within each section, cards animate in with a
   small stagger (CSS transition-delay set from a Svelte index).
5. **Heartbeat CTA**: the open-source "soul" section has a pulsing heart icon
   (Tailwind `animate-pulse` + a custom keyframe) and a rotating quote about
   open source.
6. **Marquee of gratitude**: an infinite horizontal marquee of org names at the
   bottom (pure CSS `@keyframes` translateX, paused on `prefers-reduced-motion`).

All effects **respect `prefers-reduced-motion: reduce`** — animations collapse
to instant reveals. Accessibility is non-negotiable.

### 3.3 Page sections (top → bottom)

1. **Hero** — "Thank You" headline with gradient text, badge
   "Open Source • Built Together • Free Forever", subheadline about standing
   on the shoulders of giants.
2. **The Spirit** — short manifesto paragraph about the open-source soul:
   collaboration, transparency, sharing. Pulsing heart. Rotating quote.
3. **Core Frameworks** — Astro, Svelte/SvelteKit, React, Zudoku, Express, Hono,
   Vite, Bun. Cards with brand SVG (from `simple-icons`) + link.
4. **UI & Styling** — Tailwind, Lucide, bits-ui, shadcn ecosystem, Fontsource,
   flag-icons, simple-icons.
5. **Data, Messaging & Infra** — PostgreSQL (node-postgres), Redis, NATS,
   Cloudflare, sharp, reflect-metadata.
6. **Auth & Security** — jose, openid-client, Casdoor, DOMPurify, zxcvbn-ts.
7. **AI & ML** — Vercel AI SDK, Model Context Protocol (Anthropic), Hugging
   Face Transformers.js.
8. **Docs & Tooling** — Zudoku, Mermaid, Shiki, TypeDoc, pdfmake.
9. **Build, Test & Quality** — TypeScript, ESLint, Vitest, Playwright, axe-core
   (Deque), Testing Library.
10. **Validation, Templating & Utilities** — Zod, Handlebars, ExcelJS, etc.
11. **The Soul of Open Source** — closing manifesto, link to Primebrick's MIT
    license, link to contribute on GitHub, the gratitude marquee.

## 4. Files to create / modify

### 4.1 NEW files

| Path | Purpose |
|------|---------|
| `src/pages/[lang]/thank-you.astro` | The new prerendered, i18n landing page. Mirrors the inline HTML shell of `contact.astro` (ambient bg, TopBanner, nav, footer) and renders the sections above. Imports the new Svelte island. |
| `src/components/svelte/ThankYouScroll.svelte` | Svelte 5 runes island (`client:load`). Owns: IntersectionObserver reveal logic, parallax glow, progress rail, staggered cards, reduced-motion handling. Receives `credits` + `labels` props from the page. |
| `src/components/svelte/GratitudeMarquee.svelte` | Svelte 5 island (`client:visible`) for the infinite org-name marquee. Pure CSS animation, pauses on reduced-motion / hover. |
| `src/data/credits.ts` | Single source of truth for the credited projects. Export a typed `CREDITS` array grouped by section: `{ id, title, items: [{ name, package, url, icon? }] }`. Icons referenced as `simple-icons` slugs. **No SSR Node APIs** — pure data module. |
| `src/components/OpenSourceHeart.astro` | Small static Astro SVG component for the pulsing heart (no interactivity needed → Astro, not Svelte). |

### 4.2 MODIFIED files

| Path | Change |
|------|--------|
| `src/i18n/translations.ts` | Add `thankyou: 'Thank You'` (and localized) to every `nav` object (6 langs). Add a new `thankyou: { badge, title, subtitle, spiritTitle, spiritText, quotes: [...], sectionLabels: {...}, soulTitle, soulText, ctaLicense, ctaContribute, marqueeLabel }` block to each of the 6 language objects. |
| `src/pages/[lang]/index.astro` | Add `<a href={thankyouHref}>{t.nav.thankyou}</a>` to the inline nav (between Contact and License). Compute `thankyouHref = isEn ? '/en/thank-you' : \`/${langCode}/thank-you\``. Add `hreflang` alternate links for the new route. |
| `src/pages/[lang]/contact.astro` | Same nav + hreflang additions as index.astro. |
| `public/_redirects` | Append `/thank-you /en/thank-you 302` so the short URL works like `/contact` does. |

### 4.3 NOT modified (explicitly out of scope)

- `astro.config.mjs`, `package.json` (no new deps), `content.config.ts`,
- any backend / FE / docs / SDK / DAL / US repo,
- the `marketing` content collection (the credits live in `src/data/credits.ts`,
  not in MD content — keeps them versionable and typed).

## 5. Implementation details & code examples

### 5.1 `src/data/credits.ts` (excerpt)

```ts
import { siAstro, siSvelte, siReact, siTailwindcss, siCloudflare,
         siTypescript, siVite, siExpress, siRedis, siPostgresql,
         siNats, siHono, siVitest, siPlaywright, siEslint,
         siHandlebars, siZod } from 'simple-icons';

export type Credit = { name: string; package?: string; url: string; icon?: { path: string; hex: string } };
export type CreditSection = { id: string; titleKey: string; items: Credit[] };

export const CREDITS: CreditSection[] = [
  {
    id: 'core',
    titleKey: 'sectionCore',
    items: [
      { name: 'Astro', package: 'astro', url: 'https://astro.build', icon: { path: siAstro.path, hex: siAstro.hex } },
      { name: 'Svelte & SvelteKit', package: 'svelte', url: 'https://svelte.dev', icon: { path: siSvelte.path, hex: siSvelte.hex } },
      { name: 'React', package: 'react', url: 'https://react.dev', icon: { path: siReact.path, hex: siReact.hex } },
      { name: 'Zudoku', package: 'zudoku', url: 'https://zudoku.dev' },
      { name: 'Express', package: 'express', url: 'https://expressjs.com', icon: { path: siExpress.path, hex: siExpress.hex } },
      { name: 'Hono', package: 'hono', url: 'https://hono.dev', icon: { path: siHono.path, hex: siHono.hex } },
      { name: 'Vite', package: 'vite', url: 'https://vitejs.dev', icon: { path: siVite.path, hex: siVite.hex } },
      { name: 'Bun', url: 'https://bun.sh' },
    ],
  },
  // ... UI, Data, Auth, AI, Docs, Build, Utilities sections
];
```

> Note: only `simple-icons` slugs that exist in v16.26 are imported. For brands
> without a simple-icon (Zudoku, Bun, etc.) we render a styled text badge.

### 5.2 `src/components/svelte/ThankYouScroll.svelte` (core logic excerpt)

```svelte
<script lang="ts">
  import type { CreditSection } from '../../data/credits';

  let { sections, labels }: { sections: CreditSection[]; labels: Record<string, string> } = $props();

  let progress = $state(0);
  let reducedMotion = $state(false);

  $effect(() => {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      progress = h > 0 ? Math.min(1, window.scrollY / h) : 0;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });

  // Reveal-on-scroll via IntersectionObserver (client-side only, Web API)
  $effect(() => {
    if (reducedMotion) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          (e.target as HTMLElement).dataset.shown = 'true';
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.15 });
    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
</script>

<!-- Progress rail -->
<div class="fixed left-0 top-0 z-40 h-screen w-1 bg-slate-800/40" aria-hidden="true">
  <div class="bg-gradient-to-b from-sky-400 via-indigo-400 to-cyan-400 transition-[height] duration-150"
       style={`height:${progress * 100}%`}></div>
</div>

<!-- Sections -->
{#each sections as section, si}
  <section class="relative z-10 px-6 py-20" id={section.id}>
    <h2 class="mb-10 text-3xl font-bold text-white sm:text-4xl">{labels[section.titleKey]}</h2>
    <div class="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {#each section.items as item, ii}
        <a href={item.url} target="_blank" rel="noopener"
           class="group data-[shown=true]:opacity-100 data-[shown=true]:translate-y-0 opacity-0 translate-y-6 transition-all duration-700"
           style={`transition-delay:${Math.min(ii, 8) * 60}ms`}
           data-reveal>
          <!-- card content: icon + name + package -->
        </a>
      {/each}
    </div>
  </section>
{/each}
```

### 5.3 Nav addition (in both `index.astro` and `contact.astro`)

```astro
const thankyouHref = isEn ? '/en/thank-you' : `/${langCode}/thank-you`;
...
<a href={thankyouHref} class="text-slate-300 hover:text-sky-400 transition-colors">{t.nav.thankyou}</a>
```

### 5.4 `_redirects` addition

```
/thank-you /en/thank-you 302
```

### 5.5 i18n addition (per language, EN shown)

```ts
nav: { ..., thankyou: 'Thank You' },
thankyou: {
  badge: 'Open Source • Built Together • Free Forever',
  title: 'Thank You',
  subtitle: 'Primebrick stands on the shoulders of giants. This page is a heartfelt thank-you to every person, team, and organization whose open-source work made this project possible.',
  spiritTitle: 'The Spirit of Open Source',
  spiritText: 'Open source is not just a license — it is a pact between strangers who choose to share their best work with the world, for free, forever. Every line of code we depend on was written by someone who decided that collaboration matters more than control.',
  quotes: [
    'Software is like sex: it\'s better when it\'s free. — Linus Torvalds',
    'Open source is a way of being that is about generosity. — Unknown',
    'If I have seen further it is by standing on the shoulders of giants. — Isaac Newton',
  ],
  sectionCore: 'Core Frameworks',
  sectionUi: 'UI & Styling',
  sectionData: 'Data, Messaging & Infra',
  sectionAuth: 'Auth & Security',
  sectionAi: 'AI & Machine Learning',
  sectionDocs: 'Docs & Tooling',
  sectionBuild: 'Build, Test & Quality',
  sectionUtils: 'Validation, Templating & Utilities',
  soulTitle: 'The Soul of Open Source',
  soulText: 'We release Primebrick under the MIT license so that the same generosity we received can flow forward. Use it, fork it, improve it, sell it — no strings attached.',
  ctaLicense: 'Read the MIT License',
  ctaContribute: 'Contribute on GitHub',
  marqueeLabel: 'Built with the work of',
},
```

## 6. Rules compliance checklist

- [x] `export const prerender = true` on the new page (astro-conventions).
- [x] No `fs` / `child_process` / `node:path` in SSR code — `credits.ts` is a
      pure data module; Svelte islands run client-side only (astro-conventions).
- [x] kebab-case filenames: `thank-you.astro`, `ThankYouScroll.svelte`,
      `GratitudeMarquee.svelte`, `credits.ts`, `OpenSourceHeart.astro`
      (component PascalCase is the existing Svelte convention; Astro pages
      kebab-case — matches repo).
- [x] Svelte for interactivity, Astro for static content (astro-conventions).
- [x] Tailwind CSS 4 only, no CSS-in-JS (astro-conventions).
- [x] No new dependencies — uses already-installed `simple-icons` (astro-conventions
      + package-versioning).
- [x] No dev server started during planning (dev-server rule).
- [x] No commits made (AGENTS.md: never commit automatically).
- [x] Plan file created in `primebrick-workspace/ai-plans/` (workflow rule).
- [x] No temporary files created in any project repo (temp-files rule).
- [x] GitFlow respected — work will happen on a `feature/*` branch from
      `develop`, never on `main` (gitflow rule).
- [x] `prefers-reduced-motion` honored for accessibility.

## 7. Acceptance criteria

1. Navigating to `/thank-you` redirects to `/en/thank-you` (302 via `_redirects`).
2. `/en/thank-you`, `/it/thank-you`, `/de/thank-you`, `/es/thank-you`,
   `/pt/thank-you`, `/fr/thank-you` all render with localized strings.
3. The top nav on `/en/`, `/en/contact`, and `/en/thank-you` shows a
   "Thank You" link (localized) pointing to the correct localized route.
4. `hreflang` alternate link tags are present on the new page and added to the
   existing pages for the new route.
5. Scrolling the page reveals credit cards with a fade+translate animation;
   a left progress rail fills as the user scrolls; the gratitude marquee
   scrolls infinitely at the bottom.
6. With `prefers-reduced-motion: reduce`, all animations collapse to instant
   reveals and the marquee is static.
7. Every credited project links to its canonical homepage (opens in new tab,
   `rel="noopener"`).
8. `pnpm run build` succeeds with zero errors and zero new dependencies.
9. `pnpm run check` (astro check) passes.
10. The built page is fully prerendered (no SSR, 0ms Worker CPU) — verified by
    `dist/en/thank-you/index.html` existing after build.
11. Lighthouse: the page has no new console errors; brand SVGs are inline
    (no extra network requests).

## 8. Out of scope / future enhancements

- Auto-generating the credits list from `package.json` at build time (for now,
  curated `credits.ts` is more readable and lets us group/thank orgs, not just
  packages).
- Individual contributor avatars (would require GitHub API at build time).
- A "wall of contributors" for Primebrick's own repos.

## 9. Execution order (after PROCEED)

1. Create `feature/thank-you-page` branch from `develop`.
2. Add `src/data/credits.ts`.
3. Add i18n keys to `translations.ts` (all 6 languages).
4. Create `OpenSourceHeart.astro`, `GratitudeMarquee.svelte`,
   `ThankYouScroll.svelte`.
5. Create `src/pages/[lang]/thank-you.astro`.
6. Update nav + hreflang in `index.astro` and `contact.astro`.
7. Update `public/_redirects`.
8. Run `pnpm run check` then `pnpm run build`.
9. Fix any issues (max 2 self-correction attempts per code-guardrails rule).
10. Report results to user. **Do NOT commit** — wait for explicit instruction.
