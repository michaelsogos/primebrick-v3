# Internal link graph — orphan pages fix + CI enforcement (primebrick.dev)

## Status: ✅ DONE — Plan date: 2026-10-28

## Problem

`/demo/*` and `/use-cases/*` pages are **SEO orphans**: the mega-menus gate
their links behind `{#if open}` (click-only → absent from SSR HTML →
invisible to crawlers). Google discovers these pages via sitemap only —
weak signal → "Discovered, currently not indexed" + no internal PageRank.

`/thank-you` is also in sitemap but is a post-form redirect destination —
standard practice is `noindex`.

## Scope — `primebrick-v3-website`, `hotfix/3.14.2` from `main`

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Mega-menus → SSR panel links | ✅ | `hidden={!open}` both menus | Links in DOM from SSR → crawlable; `hidden` still a11y-correct |
| 2 | Footer link columns | ✅ | demo+use-cases+contact, existing i18n | Always-rendered crawlable nav |
| 3 | thank-you noindex + EXCLUDE_PATHS | ✅ | sitemap 90→84 | Post-form page — out of index. If undesired, revert this row only |
| 4 | check-orphans.mjs in build:full | ✅ | 6 locales pass | Enforcement over verification |
| 5 | Build + verify | ✅ | 12 links in SSR HTML | |
| 6 | hotfix/3.14.2 → main+tag+develop | ✅ | live verified | CF auto-deploy |

## Design notes

- Mega-menu fix is deliberately minimal: panel stays in DOM, `hidden`
  toggles visibility only — no layout/behavior change for users.
- Footer columns reuse `t.nav.virtualTour`/`t.nav.useCases` headers,
  `t.demo.card[k].title` labels, persona names (language-invariant titles).
  Only links with real pages — coming-soon entries excluded.
- check-orphans: hrefs collected via regex on emitted HTML; internal = `^/`
  (strip `/` query/hash, normalize to trailing-slash form); dist path =
  `dist/client<path>index.html`. Locale-scoped: each `/{lang}/` sitemap URL
  must be reachable from `/{lang}/` root. Exits 1 with orphan list.
- thank-you stays OUT of sitemap AND gets `noindex` — belt & braces;
  reachable still via form JS redirect (unchanged UX).
