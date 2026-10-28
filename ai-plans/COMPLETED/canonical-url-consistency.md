# Canonical URL consistency (canonical + hreflang + sitemap) — primebrick.dev

## Status: ✅ DONE — Plan date: 2026-10-28

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | `sitemap.xml.ts` trailing-slash loc+alternates | ✅ | `urlForPath` appends `/` to non-index paths — 90 URLs verified in dist |
| 2 | Self-canonical on 15 `[lang]` pages | ✅ | `new URL(Astro.url.pathname.replace(/\/?$/,'/'), Astro.site)` — verified `/en/contact/` in dist |
| 3 | hreflang/x-default → slash form | ✅ | incl. homepage en+x-default `/` → `/en/` |
| 4 | Internal href vars + Nav/mega-menu hrefs → slash | ✅ | Nav.astro, VirtualTourMegaMenu, UseCasesMegaMenu, all page-level `*Href` consts |
| 5 | Build + verify dist | ✅ | sitemap 90 slash URLs; canonical present in emitted HTML |
| 6 | `hotfix/3.14.1` → main + tag → push, back-merge develop | ✅ | pushed e3dfa09; CF build triggered ~01:15 UTC |

## Problem (diagnosed via GSC Page indexing drilldown + live probing)

Three URL-consistency bugs, all pointing at the same root cause — **no agreed
canonical URL form** (trailing-slash):

1. **Sitemap emits non-slash URLs** — `sitemap.xml.ts` derives
   `/en/contact` but the server 307-redirects to `/en/contact/`. All ~78
   non-directory sitemap URLs land in GSC's **"Page with redirect"** bucket
   (Google indexes the redirect target, not the submitted URL).
2. **No `rel="canonical"` on any `[lang]` page** — every page is a free
   agent; Google picked `https://primebrick.dev/` as canonical for `/en/`
   ("Duplicate without user-selected canonical"), even though `/` 302s to
   `/en/` itself.
3. **hreflang alternates point to non-slash URLs** — every page hardcodes
   `href="/en/contact"`-style links that all 307-redirect. Google wants
   hreflang targets to be final indexable URLs; redirecting targets weaken
   or break the cluster.

Measured live (2026-10-28): `/en/contact`, `/en/demo/*`, `/en/thank-you`,
`/en/use-cases/*` → all `307 → <url>/`. `/en/`, `/en/demo/`, `/en/use-cases/`
(slash) → 200. `/en/` head contains 7 hreflang links, **zero canonical**.

Additional finding: `/en/features`, `/en/pricing` etc. are NOT in the
sitemap and return 404 — those paths don't exist (my earlier probe list
was guessed; real tree is `use-cases/*`, `demo/*`, `contact`, `thank-you`).

## Scope — `primebrick-v3-website` only

### Task table

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | `src/pages/sitemap.xml.ts` — emit trailing-slash URLs for non-index paths (path `/` keeps bare form; `foo` → `foo/`) | ☐ | Fixes "Page with redirect" sitemap rows |
| 2 | Add self-referencing `<link rel="canonical">` to every `src/pages/[lang]/**/*.astro` head (slash form; index → `/{lang}/`) | ☐ | ~15 files, same one-line pattern per page |
| 3 | Fix hardcoded hreflang `href` in every `[lang]` page → slash form (`/en/contact/` not `/en/contact`); x-default on non-home pages → `/{default-lang}/{path}/` | ☐ | Same files as #2 |
| 4 | Internal nav hrefs (`contactHref`, `thankyouHref`, Nav/footer internals if hardcoded non-slash) → slash form | ☐ | Avoids self-inflicted 307s on internal nav |
| 5 | Build + verify: emitted sitemap URLs return 200 directly; HTML head shows canonical + hreflang slash form | ☐ | `pnpm run build`, inspect `dist/` |
| 6 | Release 3.15.0 (feature → develop → release → main + tag → push) | ☐ | Cloudflare auto-deploys |

## Fix pattern (per page)

```diff
- <link rel="alternate" hreflang={l.hreflang} href={`https://primebrick.dev${l.code === 'en' ? '/en/contact' : `/${l.code}/contact`}`} />
- <link rel="alternate" hreflang="x-default" href="https://primebrick.dev/en/contact" />
+ <link rel="canonical" href={`https://primebrick.dev${isEn ? '/en/contact/' : `/${langCode}/contact/`}`} />
+ <link rel="alternate" hreflang={l.hreflang} href={`https://primebrick.dev${l.code === 'en' ? '/en/contact/' : `/${l.code}/contact/`}`} />
+ <link rel="alternate" hreflang="x-default" href="https://primebrick.dev/en/contact/" />
```

Index pages keep `/{lang}/` (already correct); only x-default homepage
target `https://primebrick.dev/` → `https://primebrick.dev/en/` (final URL,
no redirect).

## Out of scope (accepted as-is)

- `/en/` → `/` canonical collapse: resolved by adding self-canonicals (#2) —
  after deploy, re-inspect `/en/` and request indexing.
- Orphan pages (`demo/*`, `use-cases/*` not linked from `/en/`): they were
  intentionally added to sitemap; internal linking is a content decision,
  not this fix.
