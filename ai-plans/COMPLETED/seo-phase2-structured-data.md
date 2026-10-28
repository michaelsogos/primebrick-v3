# SEO Phase 2 — Structured Data, Auto-lastmod, Bing & PageSpeed

**Status:** DONE — all tasks completed 2026-10-28.

Results:
- Website mobile: Perf 98, SEO 100, BP 100, A11y 94 — CWV green (LCP 1.65s, TBT 0, CLS 0)
- Docs mobile: Perf 70, SEO 100, A11y 100, BP 96 — LCP 5.1s (Zudoku SPA hydration cost, known finding)
- Bing: property verified, both sitemaps submitted, 27 priority URLs pushed (quota 100/day, 400/mo)
**Repo:** `primebrick-v3-website` (hotfix `3.14.3`) + local MCP config
**Goal:** close the last indexing/SEO gaps: automated lastmod, JSON-LD structured data via a shared Head component, Bing onboarding, PageSpeed audit.

---

## Root problem this phase solves

`src/layouts/` is **empty**. Each of the 16 page files under `src/pages/` owns a
complete copy of the `<head>` boilerplate (charset, favicons, title, hreflang,
canonical). That is exactly why canonical/hreflang/sitemap drifted apart — three
copies of URL-form logic, no single source of truth. Phase 1 hotfixes patched
every copy; this phase removes the duplication so the drift cannot return.

---

## Task 1 — `Head.astro` shared component + JSON-LD (hotfix 3.14.3)

### New file: `src/components/astro/Head.astro`

Single source of truth for everything inside `<head>`:

```astro
---
import { LANGUAGES, type LangCode } from '../../i18n/translations';

interface Props {
  lang: LangCode;
  title: string;
  description: string;
  /** current localized root path segment, e.g. 'en', 'it' — used for hreflang home */
  pagePath?: string;   // e.g. 'contact', 'demo/entity-list-table' — '' for lang home
  noindex?: boolean;
}

const { lang, title, description, pagePath = '', noindex = false } = Astro.props;

const site = Astro.site; // https://primebrick.dev
const canonical = new URL(Astro.url.pathname.replace(/\/?$/, '/'), site).href;
const selfPath = pagePath ? `/${lang}/${pagePath}/` : `/${lang}/`;

// BreadcrumbList derived automatically from URL segments — zero per-page cost
const segments = Astro.url.pathname.split('/').filter(Boolean); // ['en','demo','shell']
const breadcrumb = segments.length > 1 ? {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: segments.map((seg, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: seg === lang ? lang.toUpperCase() : seg.replace(/-/g, ' '),
    item: `${site}/${segments.slice(0, i + 1).join('/')}/`,
  })),
} : null;

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'PrimeBrick',
    url: 'https://primebrick.dev',
    logo: 'https://primebrick.dev/favicon-512.png',
    sameAs: ['https://github.com/primebrick'], // TODO: confirm real org URL from Footer
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'PrimeBrick',
    url: 'https://primebrick.dev',
    inLanguage: LANGUAGES.map((l) => l.hreflang),
  },
  ...(breadcrumb ? [breadcrumb] : []),
];
---

<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content={description} />
{noindex && <meta name="robots" content="noindex" />}
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="512x512" href="/favicon-512.png" />
<link rel="icon" sizes="any" href="/favicon.ico" />
<link rel="apple-touch-icon" href="/favicon-512.png" />
<title>{title}</title>
{LANGUAGES.map((l) => (
  <link rel="alternate" hreflang={l.hreflang}
    href={`https://primebrick.dev/${l.code}/${pagePath ? pagePath + '/' : ''}`} />
))}
<link rel="alternate" hreflang="x-default"
  href={`https://primebrick.dev/en/${pagePath ? pagePath + '/' : ''}`} />
<link rel="canonical" href={canonical} />
<script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
```

**Key property:** canonical, hreflang, x-default and BreadcrumbList are all derived
from `Astro.url.pathname` + `pagePath` — one convention, one file, drift impossible.

### Refactor: all 16 `src/pages/**/*.astro`

Each page keeps its `<head>` element; the boilerplate inside collapses to:

```astro
<head>
  <Head lang={langCode} title={`PrimeBrick — ${t.hero.headline}`}
        description={t.hero.subheadline.slice(0, 160)} pagePath="" />
</head>
```

- `thank-you.astro` → `noindex` prop replaces hand-written robots meta (single source).
- Per-page `<title>`/description stay page-owned via props — content unchanged.
- Any page-specific tags that exist (og:?, twitter:?) are preserved inside the same component if found during refactor.

**Files touched:** `src/pages/**/*.astro` (16), `src/components/astro/Head.astro` (new).

---

## Task 2 — Auto-`lastmod` in sitemap (same hotfix)

`src/pages/sitemap.xml.ts`:

```diff
-const LASTMOD = '2026-07-27';
+// Evaluated at prerender = build date; deploy IS a content change.
+const LASTMOD = new Date().toISOString().slice(0, 10);
```

Module-level const evaluated once per CI build → every emitted URL carries the
build date. Zero maintenance; honest semantics (a deploy changed the site).

---

## Task 3 — Release (GitFlow hotfix)

- `git worktree` on `main` (protects develop + open feature work)
- branch `hotfix/3.14.3`, bump `package.json` → `3.14.3`
- `pnpm install && astro build && node scripts/check-orphans.mjs` — orphan gate must pass
- Verify emitted HTML: `<link rel="canonical">` identical to today, JSON-LD parses
  (`JSON.parse` on extracted `<script>` content), breadcrumb present on nested pages
- merge → tag `3.14.3` → push → Cloudflare auto-deploy → back-merge `develop`
- Live verify: canonical + `ld+json` on `/en/`, `/en/demo/`, `/it/use-cases/cto/`;
  sitemap `lastmod` = today

---

## Task 4 — Bing Webmaster onboarding (no code, no release)

The `google-search-console` MCP already exposes `engine: "bing"` on every tool
(`sites_list`, `sitemaps_submit`, `indexing_submit`, `analytics_query`). Steps:

1. Run the server auth wizard for Bing (same OAuth flow used for Google):
   `npx search-console-mcp@2.1.4` setup/auth command — user completes the browser
   OAuth with the Bing Webmaster account.
2. `sites_list engine=bing` → confirm `primebrick.dev` property (add via
   `sites_manage` if absent — domain property may need verification token; if the
   site can't be verified API-side, fall back to user adding it in the Bing UI).
3. `sitemaps_submit` both feeds to Bing:
   - `https://primebrick.dev/sitemap.xml`
   - `https://docs.primebrick.dev/sitemap.xml`
4. `indexing_submit` → IndexNow submission of all 84 + 211 URLs to Bing
   (IndexNow accepts full-page submission — unlike Google's Indexing API which
   only covers JobPosting/video).
5. `analytics_query engine=bing` baseline for future comparisons.

---

## Task 5 — PageSpeed audit (needs user-provided key)

1. **User action:** console.cloud.google.com → enable *PageSpeed Insights API* →
   create API key (free, 25k req/day).
2. Add `PAGESPEED_API_KEY` to the `env` block of `google-search-console` in
   `C:\Users\Micha\AppData\Roaming\devin\mcp_config.json`; restart MCP.
3. `pagespeed_analyze` on `https://primebrick.dev/en/` (mobile + desktop) and
   `https://docs.primebrick.dev/` → Core Web Vitals + Lighthouse SEO score.
4. Report findings; only *recommend* fixes — separate approval before changes.

---

## Execution order

| # | Step | Needs user? |
|---|------|-------------|
| 1 | Task 1+2+3 — hotfix 3.14.3 implement/build/release/verify | No (approved) |
| 2 | Task 4 — Bing OAuth wizard | **Yes** — browser login |
| 3 | Task 4 — Bing sitemaps + IndexNow | No |
| 4 | Task 5 — PageSpeed key generation | **Yes** — Google Cloud console |
| 5 | Task 5 — audits + report | No |

## Acceptance criteria

- One `<Head>` component owns every head tag; 16 pages render it via props
- JSON-LD (Organization + WebSite + auto-BreadcrumbList) valid per schema.org
- Sitemap `lastmod` = build date automatically
- `check-orphans` still green on all 6 languages
- `3.14.3` live on primebrick.dev; canonical/hreflang output byte-identical in form
- Bing: property verified, both sitemaps submitted, IndexNow pushed
- PageSpeed: CWV + Lighthouse report delivered for `/en/` and docs home

## Out of scope (flag only, no work)

- og:/twitter: meta tags (social cards) — will audit presence during refactor and
  report; add only if user approves
- VPAT content/schema work (query opportunity found in analytics)
- Fe/be/FE repos — untouched
