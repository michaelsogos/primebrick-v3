# Lighthouse (Edge DevTools) for accessibility measurement → VPAT evidence + self-improvement

> Goal: determine whether and how Lighthouse a11y audits can (a) feed the
> VPAT report or an attachment ("allegato"), and (b) drive continuous
> improvement. **The whole thread is PARKED — resume another day.** All
> evidence + reproduction recipe below.

## Status: ⏸️ PARKED (worked state saved) — opened 2026-11-01, parked 2026-11-02 ~01:45 CET

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Inventory existing a11y pipeline (axe-audit, vpat-data, VpatReport, pdf) | ✅ done | Part A |
| 2 | What Lighthouse a11y measures vs our axe run | ✅ done | Part B — empirical |
| 3 | Lighthouse vs axe role (attachment / second evidence / redundant) | ✅ verdict | Part C — corroborating, not replacement |
| 4 | Empirical run + diff vs vpat-data.json | ✅ done | Part C numbers |
| 5 | Edge DevTools Lighthouse panel walkthrough (manual) | ⏳ deferred | — |
| 6 | Authenticated-route audits via e2e conventions | ✅ done | Part D — SHIPPED spec |
| 7 | Allegato form: separate artifact vs merged VPAT section | ⏳ deferred | **user decision pending** |
| 8 | CI gate / score baseline / trends | ⏳ deferred | **user decision pending** |
| 9 | Route-list consolidation (axe list vs spec list) | ⏳ deferred | — |
| 10 | Fix `/system/settings/modules/showcase` HTTP 500 (real app bug) | ⏳ deferred | separate bug thread |

---

## Evidence saved (what exists and where)

| Artifact | Path | Content |
|---|---|---|
| **Official spec** | `primebrick-fe-v3/src/e2e/lighthouse-a11y.spec.ts` | 18 route audits, serial (edge-ai, workers:1) — committed `feature/crm-customer-ownership` |
| Per-route reports | `primebrick-fe-v3/public/vpat/lighthouse/<slug>.report.json` | 17 JSON reports (committed; `.report.html` gitignored — regenerable) |
| Aggregate | `public/vpat/lighthouse/summary.json` | mean_score + per-route score + failing audits |
| Spec registration | `primebrick-fe-v3/playwright.config.ts` → `EDGE_SPECS` | serial on shared Edge session |
| Dependency | `primebrick-fe-v3/package.json` | `lighthouse: 12.8.2` pinned devDep |
| Empirical scratch | `D:\git\primebrick\temp\lighthouse\` | `auth-audit*.mts` probes, early reports (temp, not committed) |

## How the evidence was obtained (reproduction recipe)

**Run**: `pnpm test:e2e lighthouse` (full) or `LH_ROUTES=login,customers pnpm test:e2e lighthouse` (subset). Requires FE dev on :5173, BE on :3001, PG/Casdoor up.

**Architecture that works** (arrived after several dead ends — see "Pitfalls"):
- Actors: `e2e_test_admin` minted/destroyed by `global.setup.ts`/`global.teardown.ts` — NEVER dev `admin`.
- Auth: `POST /api/v1/auth/login` in `beforeAll` → session Set-Cookie → written to `test-results/lighthouse-session-headers.json` → `--extra-headers` on every LH run. **No browser login flow at all.**
- Browser: `lighthouse --port=9333` attaches to the shared **headed** Edge (`getSharedContext` from `helpers/edge-context.ts` — launch `launchPersistentContext(E2E_PROFILE, {channel:'msedge', headless:false})` only when nothing listens). Spec opens ZERO playwright pages; LH-spawned targets swept per run (pages tracked before/after).
- Serial: registered in `EDGE_SPECS` → project `edge-ai` workers:1.
- Bound: `execFile` timeout 150s per LH run; `--max-wait-for-load=30000`.
- Secrets: headers file lives in `test-results/` (gitignored), never `public/`.

## Results snapshot (full authenticated run, 17/18 pass)

- mean score ≈ **0.87**; `/welcome` 1.00, `/login` 0.95, mid band 0.82–0.91.
- Recurring findings: `document-title`, `label-content-name-mismatch`, `target-size`, `aria-required-attr`, `color-contrast`.
- **`/system/settings/modules/showcase` → HTTP 500** — real app bug, not a11y.
- vs axe (`vpat-data.json`): LH misses `best-practice` + AAA contrast rules; adds `target-size` (WCAG 2.5.8), the 0–100 score, and 10 manual-check prompts (= checklist for the manual-evaluation VPAT section).

## Pitfalls hit (do not repeat)

- MSYS mangles env values like `LH_ROUTES=/login` → use bare names (`LH_ROUTES=login`).
- Headless Edge exits when its last tab closes; never hand-launch `msedge.exe` — use `helpers/edge-context.ts` (`getSharedContext`, lockfile-serialized).
- `page.goto()` to the SAME url stalls on a reused tab; playwright-owned targets break LH navigation (`Page.navigate: Target closed`) → solution above: fetch-login + `--extra-headers`, zero playwright pages.
- `require.resolve("lighthouse/package.json")` fails (`exports` map) — resolve `lighthouse` main entry then walk up to `cli/index.js`.
- `pnpm` workspace commands must run from `primebrick-workspace/` (the yaml lives there): `pnpm --filter ./../primebrick-fe-v3 add -D <dep>`.

## Open decisions when we resume

1. **Allegato form**: separate Lighthouse artifact vs merged section in `VpatReport.tsx`/`vpat-2.5.pdf`. `sync-vpat-data.mjs` must be extended to copy `public/vpat/lighthouse/` either way.
2. **Baseline gate**: `summary.json` as baseline; release/build check fails on score regression — hard-fail or warn?
3. **Route list**: extract the 18 routes shared by `scripts/axe-audit.mjs` + spec into one file.
4. Remediation work on the recurring findings (real page fixes).

---

## NEW REQUIREMENT (added 2026-11-03): component-library-level ARIA/WCAG evaluation for `@primebrick/ui`

**Need**: an independent a11y evaluation that audits the **UI library itself** —
the canonical primitives in `primebrick-v3-ui` — auto-generated at every lib
build, merged into the general VPAT document (also build-time generated), and
exposed by the docs repo as a **ready-to-download PDF**.

With or without Lighthouse is an open implementation choice — the requirement
is the *component-level evidence*, not the tool.

### Why this is required now (evidence)

- `@primebrick/ui` now owns **all** canonical primitives — 144 Svelte
  components: `wheel-picker`, `tabs` (sliding pill), `search-input`,
  `numeric-input`, `choicebox`, `date-dropper`, `input-group`, `textarea`,
  `prop-navigator`, ComboSelect, JsonEditor … consumed by FE **and remote
  module bundles**. Conformance must be proven at the lib level: a route
  audit can pass while a primitive is broken in isolation (states, variants,
  keyboard contracts not exercised by that route).
- Real a11y surface shipped in this thread that has **zero systematic
  conformance evidence** today:
  - `wheel-picker`: listbox semantics (`role=listbox` group owns the tab
    stop, options `tabindex="-1"`), arrow stepping, focus-visible ring —
    needs `aria-activedescendant`/`aria-selected` verification against
    WCAG 1.3.1/4.1.2 + keyboard (2.1.1).
  - `tabs`: sliding pill + `settledValue` color contract — dead
    `data-active:` classes were replaced by `data-[state=active]`;
    `prefers-reduced-motion` honored — needs checks on 1.4.13/2.3.3.
  - `date-wheel-picker` popover: keybind contract (←→/↑↓/Enter/Esc) +
    footer legend — focus management under 2.4.3.
  - `choicebox`: radiogroup + `aria-checked` + roving tabindex.
- Current pipeline audits **routes**, not components:
  `scripts/axe-audit.mjs` → `public/vpat/vpat-data.json`;
  `src/e2e/lighthouse-a11y.spec.ts` → `public/vpat/lighthouse/*.report.json`
  — both exercise the FE app. No component-level harness exists.
- `svelte-check` a11y warnings are compile-time heuristics only — they
  caught `a11y_click_events_have_key_events` on wheel items, but cannot
  verify ARIA correctness, contrast, focus order, or keyboard behavior.

### Acceptance shape (to decide on resume)

- **Harness**: a component-level audit produced at **lib build time** —
  candidate approaches: (a) axe-core over a rendered-per-variant catalog
  (playground/docs page or jsdom+vitest fixture per component), (b) the
  Lighthouse spec pointed at a lib storybook/catalog page, (c) hybrid:
  axe per component + LH aggregate on the catalog route. Output:
  `primebrick-v3-ui/docs/dev-guide/_extracted/a11y-report.json` (or
  similar) committed/artifact'd like `components.json`.
- **Merge**: the lib report must land in the general VPAT document —
  `primebrick-v3-docs`: `scripts/sync-vpat-data.mjs` extended to pull the
  lib artifact; `VpatReport.tsx` gains a *component library conformance*
  section (or a dedicated allegato); `generate-vpat-pdf.mjs` emits it.
- **Distribution**: the generated PDF is published by `primebrick-v3-docs`
  (CF worker deploy on `main`) as a ready-to-download asset — no manual
  step between lib change and updated VPAT.
- **Gate question** (same as open decision 2): does a lib-level
  regression fail the build, warn, or just land in the report?
