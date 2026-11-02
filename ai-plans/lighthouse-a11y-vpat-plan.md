# Lighthouse (Edge DevTools) for accessibility measurement → VPAT evidence + self-improvement

> Standalone analysis plan. Goal: determine whether and how Lighthouse a11y
> audits can (a) feed the VPAT report or an attachment ("allegato"), and
> (b) be used by us to continuously improve accessibility.

## Status: 🟡 IN PROGRESS — Plan date: 2026-11-01 23:15 UTC / 00:15 CET (updated 2026-11-02 01:30 CET)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Inventory existing a11y pipeline (axe-audit, vpat-data, VpatReport, pdf) | ✅ done | 2026-11-01 | Part A |
| 2 | Analyze what Lighthouse a11y actually measures vs our axe run | ✅ done | 2026-11-02 | Part B — empirical |
| 3 | Decide Lighthouse vs axe role: corroborating attachment, second evidence, redundant | ⏳ partial | — | Empirics in Part C — placement still open |
| 4 | Empirical: run `lighthouse` on real routes; diff vs vpat-data.json | ✅ done | 2026-11-02 | Part C numbers |
| 5 | Empirical: Edge DevTools Lighthouse panel walkthrough | ⏳ not done | — | Manual, user-assisted |
| 6 | Coverage gap: authenticated routes via e2e conventions | ✅ done | 2026-11-02 | Solved — see Part D |
| 7 | Decide attachment form: allegato vs merged into vpat-data.json | ⏳ not done | — | Needs user decision |
| 8 | Self-improvement: official test, CI gate, trends | 🟡 partial | 2026-11-02 | Spec shipped; gate open |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — What already exists (verified)

| Piece | Location | Role |
|---|---|---|
| `scripts/axe-audit.mjs` | `primebrick-fe-v3` | @axe-core/playwright over 18 routes → `public/vpat/vpat-data.json` (WCAG 2.0/2.1/2.2 A/AA/AAA + best-practice + 508 + EN301549) |
| `public/vpat/vpat-data.json` | `primebrick-fe-v3` | Machine audit output (axe 4.12.1) |
| `scripts/sync-vpat-data.mjs` | `primebrick-v3-docs` | Copies vpat-data.json FE → docs in Cloudflare build |
| `src/components/VpatReport.tsx` | `primebrick-v3-docs` | VPAT 2.5 INT page, SC → axe-rule mapping |
| `scripts/generate-vpat-pdf.mjs` | `primebrick-v3-docs` | `vpat-2.5.pdf` via pdfmake |
| **`src/e2e/lighthouse-a11y.spec.ts`** | `primebrick-fe-v3` | **NEW official spec** — see Part D |

## Part B — What Lighthouse a11y actually is (empirical)

- **Same engine** (axe-core), **subset of rules**: no `best-practice` (region/landmark-one-main/page-has-heading-one all absent), no AAA contrast (`color-contrast-enhanced` absent — only AA `color-contrast`).
- **Adds**: weighted 0–100 score per route; `target-size` (WCAG 2.2 2.5.8 — axe run doesn't flag it); 10 **manual-check prompts** (focus-traps, logical-tab-order, managed-focus, offscreen-content-hidden, use-landmarks…) = a checklist for the manual-evaluation section of the VPAT.
- **Run modes**: `lighthouse` npm CLI/node, `--port` attaches to a running Edge (CDP), `--extra-headers` file injects auth cookies, `--max-wait-for-load` bounds page-load wait.
- Edge DevTools panel = manual equivalent (task 5 still open).

## Part C — Empirical diff on real routes

| Route | axe (best-practice incl.) | Lighthouse |
|---|---|---|
| `/login` | document-title + color-contrast-enhanced + landmark-one-main + page-has-heading-one + region(11) | **0.95** — document-title + label-content-name-mismatch |
| `/customers` (auth) | — | **0.86** — aria-required-attr + document-title + label-content-name-mismatch×4 + **target-size×2** |

Redundant: `document-title` (same finding, both engines).
Enriches: `target-size`, `label-content-name-mismatch` instances axe's snapshot missed, the 0–100 score, manual checklist.
Misses vs axe: AAA contrast, best-practice landmark/heading rules.

## Part D — Official test (SHIPPED)

`src/e2e/lighthouse-a11y.spec.ts` — edge-ai project (workers:1, serial on shared Edge :9333).

- **Auth**: `POST /api/v1/auth/login` in beforeAll with `E2E_ADMIN_*` creds → session Cookie → `--extra-headers` JSON file. No browser login flow, no tab churn. Actors minted/destroyed by global.setup/teardown (canonical).
- **Browser**: `--port=9333` attaches LH to the shared headed Edge (`getSharedContext`); zero playwright pages; LH audit targets swept per run.
- **Output**: `public/vpat/lighthouse/<slug>.report.json|.html` + `summary.json` (mean_score + per-route score + failing audits).
- **Run**: `pnpm test:e2e lighthouse` (full 18) or `LH_ROUTES=login,customers pnpm test:e2e lighthouse` (subset).
- `lighthouse@12.8.2` pinned devDependency.

## Remaining decisions for the user

1. **Allegato form**: separate Lighthouse report artifact vs merged section inside the VPAT page/PDF. (Empirics now available.)
2. **CI gate** — plain meaning: at build/release time a script re-audits and fails if any route's a11y score drops below the recorded baseline (`summary.json` becomes the baseline). Prevents silent regressions.
3. **Route list consolidation**: the 18 routes live both in `scripts/axe-audit.mjs` and the spec — extract to one shared file so the two audits can't drift.
