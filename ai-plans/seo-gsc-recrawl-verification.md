# SEO — GSC Recrawl Verification (scheduled check)

## Status: ⚪ TODO — scheduled for **2026-11-04** — Plan date: 2026-10-28

> **RESUME DATE: 2026-11-04.** If a session runs checks before this date, report:
> "this plan was scheduled for 2026-11-04 and has not been executed yet — X days
> remaining" (or "overdue by Y days" if past). One-week window chosen because
> Google typically reprocesses sitemaps + recrawls changed canonicals within
> 3–14 days. No code work here — pure verification.

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `inspection_inspect` on previously-"URL is unknown" pages: `/en/demo/`, `/en/demo/shell/`, `/en/use-cases/`, `/en/use-cases/cto/` | ⏳ | ≥2026-11-04 | Expect "Submitted and indexed" or at least "Discovered"→"Crawled" |
| 2 | `inspection_inspect` `/en/` — canonical must now be **itself**, not `/` | ⏳ | ≥2026-11-04 | Pre-3.14.1 Google canonicalized `/en/` → `/` (no self-canonical existed) |
| 3 | `sitemaps_list` GSC — both feeds: error-free, submitted vs indexed delta shrinking | ⏳ | ≥2026-11-04 | web: 84 submitted; docs: 211 submitted |
| 4 | Page-indexing drilldown buckets (via `diagnostics` or UI): "Page with redirect", "Duplicate without user-selected canonical", "Discovered - currently not indexed" — should be emptying | ⏳ | ≥2026-11-04 | MCP has no bulk coverage API; if `diagnostics` insufficient, ask user for UI screenshot/counts |
| 5 | `analytics_query` pages — first impressions on demo/use-cases URLs | ⏳ | ≥2026-11-04 | Confirms impressions follow index entry |
| 6 | Bing: `indexing_status`/`sitemaps_list` — crawl began on the 27 submitted URLs | ⏳ | ≥2026-11-04 | |
| 7 | Docs LCP follow-up (optional): re-run `pagespeed_analyze` on docs home; decide if hydration-cost work is worth a plan | ⏳ | ≥2026-11-04 | LCP was 5.1s mobile on 2026-10-28 |

## Context

This check closes the SEO initiative (see COMPLETED/: sitemap-auto-discovery,
canonical-url-consistency, internal-link-graph, seo-phase2-structured-data).
Everything deployable was deployed by 3.14.3; what remains is only observing
Google reprocess the corrected signals. If items 1–4 pass, indexing problems are
resolved end-to-end. If not, open a new plan targeting the specific bucket that
didn't drain.
