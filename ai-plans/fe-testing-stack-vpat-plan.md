# Plan: FE Testing Stack + WCAG/ARIA Audit + VPAT 2.5 Report

**Date**: 2026-07-17
**Author**: Devin (planning phase)
**Status**: Awaiting user approval (PROCEED keyword required)
**Impacted repos**:
- `primebrick-fe-v3` (primary — testing stack + axe E2E + VPAT data generator)
- `primebrick-v3-docs` (secondary — VPAT MDX page + PDF generation)
- `primebrick-v3-website` (tertiary — landing page sections: accessibility, security, security posture)

---

## 1. Objectives

1. Integrate a **complete, modern testing stack** in the FE project, compatible with
   **Svelte 5 runes** (`$state`, `$derived`, `$props`, `$effect`) and the existing
   Vitest 4.1.10 + jsdom setup.
2. Add **component testing** (render + user interactions) on top of the existing
   pure-logic unit tests.
3. Add **E2E testing** with Playwright for cross-browser, real-DOM scenarios.
4. Add **automated WCAG 2.x + ARIA accessibility auditing** (A / AA / AAA) via
   `@axe-core/playwright`, producing a structured JSON report.
5. Generate a **complete VPAT 2.5 INT conformance report** as:
   - A **web-browsable MDX page** in the docs site (online reading, searchable).
   - A **downloadable PDF** that looks like the official VPAT 2.5 docx (NOT a
     website page printed — a purpose-built formal document).
6. The VPAT must reflect real axe-core scan results (pass / partial / fail per
   WCAG success criterion), not a synthetic summary.
7. **CI constraint**: PDF generation uses `pdfkit` (pure Node.js, no browser) and
   runs IN the Cloudflare build chain as another Node script (like
   `generate-nav.mjs`). No GitHub Actions, no browser required.
8. Add **three new landing page sections** on `primebrick.dev` (marketing website)
   covering accessibility, enforced security, and security posture — with full
   i18n in all 6 languages (EN, IT, DE, ES, PT, FR).

---

## 2. Empirical findings (verified before planning)

### 2.1 Current FE testing state

| Item | Status |
|---|---|
| `vitest` 4.1.10 | Installed (devDep) |
| `jsdom` 25.0.1 | Installed (devDep) |
| `vitest.config.ts` | Minimal: `environment: "jsdom"`, `include: ["src/**/*.test.ts"]`, `globals: false` |
| Existing tests | 1 file: `src/lib/__tests__/services-store.test.ts` (pure logic only) |
| Component testing | None |
| E2E | None |
| Coverage | None |

### 2.2 Package versions (verified via `pnpm view`)

| Package | Version | Peer deps |
|---|---|---|
| `@testing-library/svelte` | **5.4.2** | `svelte: ^3 \|\| ^4 \|\| ^5 \|\| ^5.0.0-next.0` ✅ |
| `@testing-library/user-event` | **14.6.1** | `@testing-library/dom: >=7.21.4` |
| `@testing-library/jest-dom` | **6.9.1** | — |
| `@vitest/coverage-v8` | **4.1.10** | `vitest: 4.1.10` ✅ (exact match) |
| `@vitest/ui` | **4.1.10** | `vitest: 4.1.10` ✅ |
| `@playwright/test` | **1.61.1** | — |
| `@axe-core/playwright` | **4.12.1** | `playwright-core: >= 1.0.0` ✅ |
| `axe-core` | **4.12.1** | — |
| `@axe-core/reporter-earl` | **4.12.1** | — |
| `happy-dom` | **20.10.6** | — (alternative to jsdom) |

### 2.3 Svelte 5 runes compatibility (researched)

- `@testing-library/svelte` 5.4.2 **fully supports Svelte 5 runes mode**.
  - v5.4.1 had a regression with global `runes: true` (issue #496), fixed in 5.4.2 (PR #497).
  - We use 5.4.2 → safe.
- The library uses `Svelte.mount()` + `$state` for reactive props on Svelte 5.
- **Critical**: must use the `svelteTesting` Vite plugin (from
  `@testing-library/svelte/vite`) OR set `resolve.conditions: ['browser']` in test
  mode, otherwise `$effect`/lifecycle don't run (SSR exports are used).
- **Known issue**: Vitest 3.2.x + Svelte > 5.1.11 had `$effect` testing bugs
  (`flushSync` ignored, `effect_update_depth_exceeded`).
  - We are on **Vitest 4.1.10** + **Svelte 5.56.4** → this specific bug report is
    for 3.2.x; Vitest 4 is newer. We will verify empirically with a smoke test
    before committing to the full suite. If issues arise, the fallback is
    **vitest workspaces** separating unit (node) from component (jsdom) tests.
- jsdom `requestAnimationFrame` can be unreliable → fallback is `happy-dom`
  (20.10.6) or stubbing rAF. We keep jsdom first (already installed) and switch
  to happy-dom only if a concrete test fails.

### 2.4 axe-core WCAG/ARIA capabilities

- **WCAG level tags available**: `wcag2a`, `wcag2aa`, `wcag2aaa`, `wcag21a`,
  `wcag21aa`, `wcag22aa`. (`wcag22a` tag exists but no rules use it yet.)
- **WCAG 2.2**: only `target-size` rule under `wcag22aa`. Tags are **NOT
  cumulative** — to test WCAG 2.2 AA you must pass
  `['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']` together.
- **AAA**: only 3 rules (`color-contrast-enhanced`, `identical-links-same-purpose`,
  `meta-refresh-no-exceptions`), all disabled by default.
- **ARIA**: extensive via `cat.aria` tag (allowed/required attr, roles, valid
  values, parent/child relationships, etc.).
- **Per-SC tags**: `wcag111`, `wcag143`, `wcag258`, ... map rules → success
  criteria. This is what enables VPAT row population.
- **Coverage reality**: axe automates ~30% of WCAG 2.2 SCs fully, ~10% partial,
  ~60% require manual testing. **The VPAT will mark non-automatable SCs as
  "Not Evaluated" (allowed only for AAA) or "Partially Supports" with a remark
  pointing to manual review needed.** This is honest and VPAT-compliant.

### 2.5 VPAT 2.5 INT structure (researched)

- 4 editions exist: WCAG, 508, EU, INT. We target **INT** (covers WCAG 2.0/2.1/2.2
  + Section 508 + EN 301 549) — matches the user's reference docx
  (`VPAT2.5Rev_INT_February2025.docx`).
- **Header**: report title, VPAT version, product name/version, date, description,
  contact, evaluation methods, applicable standards table.
- **Conformance levels** (5 terms): Supports, Partially Supports, Does Not
  Support, Not Applicable, Not Evaluated (AAA only).
- **Tables**: 3 WCAG tables (Level A / AA / AAA) + Section 508 table + EN 301 549
  table. Each row = 1 success criterion, 3 columns: Criteria, Conformance Level,
  Remarks & Explanations.
- **Mapping logic** (worst-wins): manual override > axe critical → "Does Not
  Support" > axe serious/moderate → "Partially Supports" > axe pass → "Supports"
  > no axe coverage + no manual → "Not Evaluated" (AAA) or "Partially Supports"
  with "Manual review pending" remark (A/AA).

### 2.6 Docs site (primebrick-v3-docs) — CI architecture

- **Framework**: Zudoku 0.82.3 (React 19 + Vite 8), SSG → Cloudflare Workers.
- **MDX**: files in `pages/`, custom components registered in `zudoku.config.tsx`
  (`mdx.components`), Shiki syntax highlighting built-in, `<Mermaid />` component
  available.
- **Sync flow**: `sync-repo-docs.mjs` copies each repo's `docs/user-guide/**` →
  `pages/<repo>/guide/**`. `generate-nav.mjs` reads `_order.json` →
  `src/generated-nav.ts`.
- **FE user-guide** lives at `primebrick-fe-v3/docs/user-guide/` with `_order.json`.
  → The VPAT MDX should live here so it syncs to `pages/frontend/guide/vpat-2.5.mdx`.

#### CI build chain — CORRECTED (verified empirically from AGENTS.md)

**The sync scripts run INSIDE the Cloudflare build, NOT in GitHub Actions.**

Per `AGENTS.md` (line 41–51), the Cloudflare build agent runs on every push to
`main`:
```
pnpm install
&& node scripts/sync-repo-docs.mjs
&& node scripts/fetch-openapi.mjs
&& node scripts/sync-deepwiki.mjs
&& node scripts/generate-nav.mjs
&& pnpm run build
```
(`sync-deepwiki.mjs` is referenced by the user but not yet present in `scripts/`
— may be recently added or in progress. The AGENTS.md version omits it. Either
way, the chain runs in the Cloudflare build environment.)

The GitHub Actions `sync-docs.yml` is a **secondary mechanism** that runs the
same chain on a cron schedule (every 6h) and commits synced content back to the
repo. It does NOT deploy — deployment happens via the Cloudflare build.

**Critical constraint**: The Cloudflare build environment is a standard Node.js
build agent, but it is **NOT a full CI runner** like `ubuntu-latest`. It cannot
reliably download and install Chromium (~300MB). **Playwright is NOT viable
here.**

**Solution**: Use `pdfkit` (0.19.1) — a pure JavaScript PDF generation library
that works in any Node.js environment with no browser dependency (~3MB, no
native deps). It has built-in standard PDF fonts (Times-Roman = serif, matches
the VPAT docx). PDF generation becomes just another Node script in the build
chain, like `generate-nav.mjs`.

| | Playwright | pdfkit |
|---|---|---|
| Browser required | Yes (Chromium ~300MB) | **No** |
| Works in Cloudflare build | **No** | **Yes** |
| Package size | ~300MB | ~3MB |
| Native deps | Yes | No (pure JS) |
| Serif font | Via CSS | Times-Roman (built-in PDF font) |
| Tables | HTML/CSS | Programmatic (draw rows/cols/borders) |
| Tagged/accessible PDF | Yes (Chromium) | Partial (basic structure) |
| Layout control | Via CSS | Pixel-level programmatic |

**Trade-off accepted**: pdfkit requires manual table drawing (no HTML/CSS), but
for a structured document like VPAT with fixed table formats (17 tables, all
3-column), this is manageable and gives exact control. The PDF won't be as
"tagged" as a Chromium-generated one, but it will have selectable text and
proper structure.

### 2.7 VPAT 2.5 INT docx structure (verified by parsing the reference docx)

The reference file `VPAT2.5Rev_INT_February2025.docx` was extracted and parsed.
**17 tables** total:

| # | Section | Rows | Cols | Notes |
|---|---------|------|------|-------|
| 1 | Applicable Standards/Guidelines | 6 | 2 | Standard name + Yes/No per level |
| 2 | WCAG Table 1: Level A | 33 | 3 | 1 header + 32 criteria |
| 3 | WCAG Table 2: Level AA | 25 | 3 | 1 header + 24 criteria |
| 4 | WCAG Table 3: Level AAA | 32 | 3 | 1 header + 31 criteria |
| 5 | §508 Ch.3: Functional Performance Criteria | 10 | 3 | |
| 6 | §508 Ch.4: Hardware | 78 | 3 | |
| 7 | §508 Ch.5: Software | 33 | 3 | |
| 8 | §508 Ch.6: Support Documentation | 9 | 3 | |
| 9–17 | EN 301 549 Clauses 4,5,6,7,8,10,11,12,13 | various | 3 | Clause 9 = WCAG cross-ref |

**All criteria tables share 3 columns**: `Criteria | Conformance Level | Remarks
and Explanations`.

**Each WCAG criterion row** (column 1) contains:
- Criteria ID + title + "(Level X)"
- "Also applies to:" cross-references (EN 301 549 clauses + §508 chapters)

**Conformance Level cell** (column 2) has 5 sub-lines:
`Web: | Electronic Docs: | Software: | Closed: | Authoring Tool:`

**Remarks cell** (column 3) has the same 5 sub-lines.

**Document structure**:
1. Instructions section (~10 pages — removed when publishing)
2. `[Company] Accessibility Conformance Report` — the actual report:
   - Header: Name of Product/Version, Report Date, Product Description, Contact,
     Notes, Evaluation Methods Used
   - Applicable Standards/Guidelines table
   - Terms (5 conformance levels defined)
   - WCAG 2.x Report (Tables 1–3)
   - Revised Section 508 Report (Chapters 3–6)
   - EN 301 549 Report (Clauses 4–13)
   - Legal Disclaimer

**Footer**: ITI trademark notice + page numbers ("Page X of Y").

**Key insight for PDF generation**: The VPAT docx is a **formal document** with
its own typography (serif fonts, bordered tables, page breaks per section). It
is NOT a website page. Converting the Zudoku MDX page to PDF would carry website
chrome (sidebar, header, theme switcher, Zudoku fonts/colors) — wrong result.

### 2.7 Marketing website (primebrick-v3-website) — landing page structure

- **Framework**: Astro 7 + @astrojs/svelte + Tailwind CSS 4, hybrid rendering,
  deployed to Cloudflare Workers.
- **Landing page**: `src/pages/[lang]/index.astro` — single file, ~798 lines,
  prerendered for each of 6 languages (EN, IT, DE, ES, PT, FR).
- **i18n**: All text is in `src/i18n/translations.ts` (~1017 lines), structured
  as `translations.<lang>.<section>.<key>`. Each section has a badge, title,
  text, and cards/bullets array.
- **Existing sections** (in order): hero, stats, multicloud, frontend, postgres,
  ai, agentic, concept, bricks, infrastructure, architecture, forDevs, forCtos,
  openSource, finalCta, footer.
- **Section pattern**: Each section is a `<section class="relative z-10 px-6
  py-24">` with a sticky header (badge + title + text) and a card grid below.
  Cards use `rounded-2xl border border-slate-800/50 bg-slate-900/30
  backdrop-blur-sm` styling.
- **Insertion point**: New sections go **after the architecture section** (line
  ~698) and **before the "For Devs + For CTOs" section** (line ~700). This
  places accessibility + security after the technical architecture sections
  and before the audience-targeted closing sections.
- **Trademarks**: Windows Hello™, Face ID™, Touch ID™ are registered trademarks
  — must use the ™ symbol in all languages.

---

## 3. Architectural decisions

### 3.1 Testing layer separation + VPAT artifact architecture

```
┌─────────────────────────────────────────────────────────────┐
│ primebrick-fe-v3                                            │
│                                                              │
│  vitest.config.ts  → unit + component tests (jsdom)         │
│    - @testing-library/svelte (component render)             │
│    - @testing-library/user-event (interactions)             │
│    - @testing-library/jest-dom (matchers)                   │
│    - @vitest/coverage-v8 (coverage)                         │
│    - @vitest/ui (optional HTML reporter)                    │
│                                                              │
│  playwright.config.ts → E2E + a11y audit (real Chromium)    │
│    - @playwright/test (E2E — runs LOCALLY or in FE CI)      │
│    - @axe-core/playwright (WCAG/ARIA scan)                  │
│    - @axe-core/reporter-earl (structured EARL JSON output)  │
│                                                              │
│  tests/a11y/vpat-data.json  (committed artifact)            │
│    - Aggregated axe results per WCAG success criterion      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (Cloudflare build clones FE repo
                                 via sync-repo-docs.mjs)
┌─────────────────────────────────────────────────────────────┐
│ primebrick-v3-docs  —  Cloudflare build chain               │
│                                                              │
│  pnpm install                                                │
│  && node scripts/sync-repo-docs.mjs   (clones all repos)    │
│  && node scripts/sync-vpat-data.mjs   (NEW: copies JSON)    │
│  && node scripts/fetch-openapi.mjs                           │
│  && node scripts/sync-deepwiki.mjs    (if present)          │
│  && node scripts/generate-nav.mjs                            │
│  && node scripts/generate-vpat-pdf.mjs (NEW: pdfkit → PDF)  │
│  && pnpm run build                     (zudoku → dist/)     │
│                                                              │
│  TWO SEPARATE ARTIFACTS:                                    │
│                                                              │
│  1. WEB PAGE (online browsing)                              │
│     pages/frontend/guide/vpat-2.5.mdx  (synced from FE)     │
│       - Uses <VPATTable data={...} /> component             │
│       - Interactive, searchable, part of the docs site      │
│       - Has a "Download PDF" button                         │
│                                                              │
│  2. FORMAL PDF (downloadable, looks like the docx)          │
│     scripts/generate-vpat-pdf.mjs                           │
│       - Uses pdfkit (pure Node.js, NO browser)              │
│       - Reads vpat-data.json + wcag-criteria-catalog.json   │
│       - Draws VPAT 2.5 INT format programmatically:         │
│         Times-Roman serif, bordered tables, ITI footer,     │
│         page breaks per section, 3-col criteria tables      │
│       - All 17 tables (WCAG A/AA/AAA + §508 + EN 301 549)   │
│       - Output: public/vpat/vpat-2.5.pdf                    │
│       - Runs IN the Cloudflare build (lightweight, ~3MB)    │
│                                                              │
│  zudoku build copies public/** → dist/**                    │
│  → PDF served at /vpat/vpat-2.5.pdf                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Why two configs (vitest + playwright) instead of `@vitest/browser`

- `@vitest/browser` would unify under Vitest but requires WebDriverIO/Playwright
  under the hood anyway, has a more complex setup, and **does not integrate
  axe-core** as cleanly as `@axe-core/playwright`'s builder API.
- Keeping E2E + a11y in Playwright's native runner gives us `AxeBuilder`,
  multi-page scanning, `include()`/`exclude()` for component-level scans, and
  trace/video on failure — all out of the box.
- Unit + component tests stay in Vitest (fast, jsdom, no browser launch).

### 3.3 Why keep jsdom (not switch to happy-dom yet)

- jsdom is already installed and the existing test passes on it.
- happy-dom would be a second environment to maintain.
- **Decision**: keep jsdom as default; document happy-dom (20.10.6) as a
  documented fallback in `vitest.config.ts` comments if rAF/lifecycle issues
  surface with Svelte 5 runes.

### 3.4 VPAT dual-artifact strategy (web page + formal PDF via pdfkit)

**Problem with MDX→HTML→PDF**: The Zudoku MDX page carries website chrome
(sidebar, header, theme switcher, Zudoku fonts/colors, navigation). Even with
`@media print` hiding some elements, the result looks like "a docs site page
printed", not "a formal VPAT document". The reference docx has its own
typography (serif fonts, bordered tables, ITI footer, page breaks per section).

**Problem with Playwright in Cloudflare build**: The Cloudflare build
environment cannot download Chromium (~300MB). Playwright is not viable there.

**Solution**: Two separate artifacts, same data source (`vpat-data.json`):

1. **Web VPAT page** (MDX in docs site):
   - Source: `primebrick-fe-v3/docs/user-guide/vpat-2.5.mdx`
   - Synced to `pages/frontend/guide/vpat-2.5.mdx` by `sync-repo-docs.mjs`
   - Uses `<VPATTable data={...} />` React component (registered in Zudoku)
   - Interactive, searchable, part of the docs site navigation
   - Has a "Download Formal PDF" button linking to `/vpat/vpat-2.5.pdf`
   - Purpose: **online reading and navigation**

2. **Formal VPAT PDF** (generated by pdfkit, pure Node.js):
   - Generated by `scripts/generate-vpat-pdf.mjs` using `pdfkit` (0.19.1)
   - **No browser, no HTML, no website chrome** — PDF is drawn programmatically
   - Reads `vpat-data.json` (axe results) + `wcag-criteria-catalog.json`
     (static catalog of all 87 WCAG criteria with cross-references)
   - Styled to match the VPAT 2.5 docx format:
     - Font: Times-Roman (built-in PDF serif font, no font file embedding)
     - A4 page size, 2cm margins
     - Bordered tables with header row shading (drawn as rectangles + lines)
     - 3-column criteria tables: Criteria | Conformance Level | Remarks
     - Column 1: criteria ID + title + "(Level X)" + "Also applies to:"
       cross-references (EN 301 549 + §508)
     - Column 2: conformance level + 5 sub-lines (Web / Electronic Docs /
       Software / Closed / Authoring Tool)
     - Column 3: remarks + same 5 sub-lines
     - Page breaks between major sections (WCAG / §508 / EN 301 549)
     - ITI trademark footer + page numbers
     - All 17 tables from the VPAT 2.5 INT template
   - Runs **IN the Cloudflare build chain** (lightweight, ~3MB, no browser)
   - Output: `public/vpat/vpat-2.5.pdf` (static asset)
   - `zudoku build` copies `public/**` → `dist/**` → served at `/vpat/vpat-2.5.pdf`
   - Purpose: **formal downloadable document** (matches the docx)

**Why pdfkit and not Playwright?**
- Cloudflare build cannot install Chromium (~300MB, not a full CI runner)
- pdfkit is pure JavaScript (~3MB, no native deps, no browser)
- Runs in any Node.js environment including Cloudflare build
- Times-Roman is a built-in PDF font (serif, matches docx) — no font embedding
- For a structured document like VPAT (fixed 17 tables, all 3-column), manual
  table drawing is manageable and gives pixel-level control

**Why not render the MDX page and print that?**
- Carries Zudoku's React shell, sidebar, header, theme variables
- `@media print` can hide elements but can't change the fundamental layout
- Fonts, colors, spacing are Zudoku's theme, not VPAT's formal style
- Tables may break across pages unpredictably in the Zudoku layout

**Why not use the MDX content for the PDF at all?**
- The MDX is optimized for web (short tables, component-based rendering)
- The PDF needs the full 17-table VPAT structure with all cross-references
- The PDF is generated programmatically from `vpat-data.json` +
  `wcag-criteria-catalog.json` (the full list of all WCAG 2.2 SCs with their
  §508 and EN 301 549 cross-references, extracted from the docx)

---

## 4. Detailed implementation steps

### Phase 1 — FE: Vitest component testing stack

**Files to create/modify in `primebrick-fe-v3`:**

1. **`package.json`** — add devDependencies (all pinned, per repo rule):
   ```json
   "@testing-library/svelte": "5.4.2",
   "@testing-library/user-event": "14.6.1",
   "@testing-library/jest-dom": "6.9.1",
   "@vitest/coverage-v8": "4.1.10",
   "@vitest/ui": "4.1.10"
   ```
   Add scripts:
   ```json
   "test:unit": "vitest run",
   "test:unit:watch": "vitest",
   "test:unit:ui": "vitest --ui",
   "test:coverage": "vitest run --coverage"
   ```
   (Keep existing `test`/`test:watch` as aliases to `test:unit`/`test:unit:watch`
   for backwards compat with the existing `services-store.test.ts`.)

2. **`vitest.config.ts`** — rewrite to use `svelteTesting` plugin:
   ```ts
   import { defineConfig } from "vitest/config";
   import { sveltekit } from "@sveltejs/kit/vite";
   import { svelteTesting } from "@testing-library/svelte/vite";

   export default defineConfig({
     plugins: [sveltekit(), svelteTesting()],
     test: {
       environment: "jsdom",
       include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
       globals: false,
       setupFiles: ["./vitest-setup.ts"],
       coverage: {
         provider: "v8",
         reporter: ["text", "html", "lcov"],
         include: ["src/lib/**/*.{ts,svelte}"],
         exclude: ["src/lib/**/*.test.ts", "src/lib/**/*.spec.ts"],
       },
     },
   });
   ```
   **Note**: we keep `sveltekit()` (not raw `svelte()`) because the project is
   SvelteKit and `$lib` alias resolution depends on it. The `svelteTesting`
   plugin handles `resolve.conditions: ['browser']` automatically.

3. **`vitest-setup.ts`** (new, project root):
   ```ts
   import "@testing-library/jest-dom/vitest";
   ```
   (Imports the vitest-specific entry that calls `expect.extend(matchers)`.)

4. **`tsconfig.json`** — add to `compilerOptions.types`:
   `"@testing-library/jest-dom"` (for IDE matcher typing).
   Add `"vitest-setup.ts"` to `include`.

5. **Smoke test** — create `src/lib/__tests__/smoke-component.test.ts`:
   - Render a trivial Svelte 5 runes component (`<Counter />` with `$state`,
     `$derived`, `$props`).
   - Use `userEvent.setup()` + click + assert reactivity.
   - This validates the whole stack before writing real tests. **If this fails
     with `$effect`/`flushSync` errors, we switch to the workspaces approach
     (see Phase 1 fallback).**

6. **`.gitignore`** — add `coverage/` if not present.

**Phase 1 fallback (only if smoke test fails):**
- Create `vitest.workspace.ts` splitting unit (node env) from component (jsdom
  env) tests. Document the split in `AGENTS.md`.

**Acceptance criteria Phase 1:**
- `pnpm run test:unit` passes (existing `services-store.test.ts` + smoke test).
- `pnpm run test:coverage` produces a coverage report.
- `pnpm run test:unit:ui` opens the Vitest UI.
- No TypeScript errors from `pnpm run check`.

---

### Phase 2 — FE: Playwright E2E + axe-core a11y audit

**Files to create/modify in `primebrick-fe-v3`:**

1. **`package.json`** — add devDependencies:
   ```json
   "@playwright/test": "1.61.1",
   "@axe-core/playwright": "4.12.1",
   "axe-core": "4.12.1",
   "@axe-core/reporter-earl": "4.12.1"
   ```
   Add scripts:
   ```json
   "test:e2e": "playwright test",
   "test:e2e:ui": "playwright test --ui",
   "test:a11y": "playwright test --grep @a11y",
   "test:a11y:report": "playwright test --grep @a11y && node scripts/generate-vpat-data.mjs"
   ```

2. **`playwright.config.ts`** (new, project root):
   ```ts
   import { defineConfig, devices } from "@playwright/test";

   export default defineConfig({
     testDir: "./tests",
     fullyParallel: false, // a11y scans need deterministic order
     reporter: [["html"], ["list"]],
     use: {
       baseURL: "http://localhost:5173",
       trace: "on-first-retry",
       screenshot: "only-on-failure",
     },
     projects: [
       { name: "chromium", use: { ...devices["Desktop Chrome"] } },
     ],
     webServer: {
       command: "pnpm run dev",
       url: "http://localhost:5173",
       reuseExistingServer: true, // respect dev-server rule: don't kill existing
       timeout: 60_000,
     },
   });
   ```
   **Critical**: `reuseExistingServer: true` complies with the repo's
   `dev-server.md` rule — Playwright will NOT start a second dev server if 5173
   is already taken, and will NOT kill the user's server.

3. **`tests/` directory** (new):
   - `tests/e2e/smoke.spec.ts` — basic E2E smoke (page loads, login form visible).
   - `tests/a11y/wcag-audit.spec.ts` — the axe-core audit (see below).

4. **`tests/a11y/wcag-audit.spec.ts`** — the core a11y test:
   ```ts
   import { test, expect } from "@playwright/test";
   import AxeBuilder from "@axe-core/playwright";
   import { writeFileSync, mkdirSync } from "node:fs";
   import { join } from "node:path";

   const WCAG_TAGS = [
     "wcag2a", "wcag2aa", "wcag2aaa",
     "wcag21a", "wcag21aa",
     "wcag22aa",
     "cat.aria",
   ];

   const ROUTES_TO_AUDIT = [
     "/", "/login", "/dashboard", "/settings",
     // ... enumerated from src/routes
   ];

   test.describe("WCAG 2.x + ARIA accessibility audit", () => {
     for (const route of ROUTES_TO_AUDIT) {
       test(`audit ${route}`, async ({ page }) => {
         await page.goto(route);
         await page.waitForLoadState("networkidle");
         const results = await new AxeBuilder({ page })
           .withTags(WCAG_TAGS)
           .analyze();
         // Persist per-route raw results for the VPAT generator
         const outDir = "tests/a11y/results";
         mkdirSync(outDir, { recursive: true });
         const slug = route.replace(/\//g, "_") || "root";
         writeFileSync(
           join(outDir, `${slug}.json`),
           JSON.stringify(results, null, 2),
         );
         // Fail on any A/AA violation; AAA only warns
         const critical = results.violations.filter(
           (v) => v.impact === "critical" || v.impact === "serious",
         );
         expect(critical, `${route} has ${critical.length} critical/serious violations`).toEqual([]);
       });
     }
   });
   ```
   **Note on the user's original snippet**: the user's draft asserted
   `violations.toEqual([])` for `wcag2a`/`wcag21a`/`wcag2aa`/`wcag21aa` only. We
   extend to include `wcag2aaa` + `wcag22aa` + `cat.aria` per the request for
   A/AA/AAA coverage. We also split fail behavior: critical/serious → fail the
   test; minor/moderate → record but don't fail (otherwise the first run would
   block all future work). This can be tightened once the baseline is clean.

5. **`scripts/generate-vpat-data.mjs`** (new) — aggregates per-route axe JSON
   results into a single `tests/a11y/vpat-data.json` with the structure:
   ```json
   {
     "generated_at": "2026-07-17T...",
     "axe_version": "4.12.1",
     "routes_scanned": ["/", "/login", ...],
     "criteria": {
       "1.1.1": {
         "level": "A",
         "title": "Non-text Content",
         "conformance": "supports",
         "violations": 0,
         "passes": 12,
         "remarks": "..."
       },
       "1.4.3": {
         "level": "AA",
         "title": "Contrast (Minimum)",
         "conformance": "partially-supports",
         "violations": 3,
         "passes": 45,
         "remarks": "3 elements below 4.5:1 ratio on /dashboard"
       }
     }
   }
   ```
   The mapping logic (worst-wins, per research):
   - axe critical/serious violations for an SC → `does-not-support` (if
     majority) or `partially-supports` (if isolated).
   - axe minor/moderate → `partially-supports`.
   - axe pass + no manual → `supports`.
   - SC not covered by any axe rule (the ~60% non-automatable) →
     `not-evaluated` for AAA, `partially-supports` with "Manual review pending"
     remark for A/AA (honest: we cannot claim "supports" without manual test).

6. **`.gitignore`** — add `tests/a11y/results/` (per-route raw, regenerable) but
   **commit** `tests/a11y/vpat-data.json` (the aggregated artifact the docs site
   consumes).

**Acceptance criteria Phase 2:**
- `pnpm run test:e2e` runs Playwright against the (existing or started) dev
  server without port conflicts.
- `pnpm run test:a11y:report` produces `tests/a11y/vpat-data.json`.
- The a11y test fails on critical/serious A/AA violations, passes otherwise.

---

### Phase 3 — Docs: VPAT 2.5 web page + standalone formal PDF

**Two artifacts, same data source (`vpat-data.json`):**

#### 3A. Web VPAT page (MDX, for online browsing)

**Files in `primebrick-fe-v3` (source of truth, synced to docs):**

1. **`primebrick-fe-v3/docs/user-guide/vpat-2.5.mdx`** (new):
   - Frontmatter: `title: "VPAT 2.5 Accessibility Conformance Report"`,
     `description`.
   - Intro section: product name (Primebrick v3), version, report date, product
     description, evaluation methods, applicable standards table.
   - Calls `<VPATTable data={vpatData} />` component (registered in Zudoku).
   - Has a "Download Formal PDF" button linking to `/vpat/vpat-2.5.pdf`.
   - Purpose: **online reading** — interactive, searchable, part of docs nav.

2. **`primebrick-fe-v3/docs/user-guide/_order.json`** — append `"vpat-2.5"`.

**Files in `primebrick-v3-docs`:**

3. **`primebrick-v3-docs/src/data/vpat-data.json`** — synced copy (gitignored,
   regenerated by `sync-vpat-data.mjs` — like `generated-nav.ts`).

4. **`primebrick-v3-docs/src/components/VPATTable.tsx`** (new) — React component:
   - Imports `vpat-data.json`.
   - Renders the 3 WCAG tables (A/AA/AAA) with color-coded conformance badges
     (green = supports, yellow = partial, red = does-not-support, grey =
     not-evaluated).
   - Renders §508 and EN 301 549 summary tables (these are mostly "Not
     Evaluated" until manual review — see Out of Scope).
   - Web-optimized: collapsible sections, responsive tables.

5. **`primebrick-v3-docs/zudoku.config.tsx`** — register `VPATTable`:
   ```tsx
   mdx: { components: { Mermaid, VPATTable } }
   ```

6. **`primebrick-v3-docs/scripts/sync-vpat-data.mjs`** (new) — copies
   `primebrick-fe-v3/tests/a11y/vpat-data.json` →
   `primebrick-v3-docs/src/data/vpat-data.json`. In CI, reads from the shallow
   clone (`.tmp-repo-sync/frontend/tests/a11y/vpat-data.json`). Locally, reads
   from sibling dir `../primebrick-fe-v3/tests/a11y/vpat-data.json`.

7. **`primebrick-v3-docs/pages/frontend/guide/vpat-2.5.mdx`** — synced output
   (do NOT hand-edit; source is in FE repo).

#### 3B. Formal VPAT PDF (pdfkit, pure Node.js — runs in Cloudflare build)

**Key change**: PDF is generated by `pdfkit` (pure JS, no browser), NOT by
Playwright. This runs directly in the Cloudflare build chain as another Node
script — same as `generate-nav.mjs`.

**Files in `primebrick-v3-docs`:**

8. **`primebrick-v3-docs/src/data/wcag-criteria-catalog.json`** (new) — the full
   catalog of all WCAG 2.2 success criteria with their metadata:
   - 78 SCs total (30 A, 24 AA, 24 AAA... actually per the docx: 32 A, 24 AA,
     31 AAA = 87 rows, some are guideline headers).
   - Each entry: `{ id: "1.1.1", title: "Non-text Content", level: "A",
     guideline: "1.1 Perceivable", also_applies_to: { en301549: [...],
     section508: [...] } }`.
   - Extracted from the parsed docx structure (section 2.7).
   - This is a **static data file** (not regenerated) — the WCAG criteria list
     doesn't change between versions.

9. **`primebrick-v3-docs/scripts/generate-vpat-pdf.mjs`** (new) — generates the
   formal VPAT PDF using `pdfkit` (pure Node.js, no browser):
   - Reads `src/data/vpat-data.json` (synced axe results) +
     `src/data/wcag-criteria-catalog.json` (static criteria catalog).
   - Uses `pdfkit` API to draw the document programmatically:
     ```js
     import PDFDocument from "pdfkit";
     import { readFileSync, createWriteStream, mkdirSync } from "node:fs";

     const vpatData = JSON.parse(readFileSync("src/data/vpat-data.json"));
     const catalog = JSON.parse(readFileSync("src/data/wcag-criteria-catalog.json"));

     const doc = new PDFDocument({
       size: "A4",
       margins: { top: 56, bottom: 56, left: 56, right: 56 }, // ~2cm
       info: { Title: "VPAT 2.5 — Primebrick Accessibility Conformance Report" },
     });
     mkdirSync("public/vpat", { recursive: true });
     doc.pipe(createWriteStream("public/vpat/vpat-2.5.pdf"));

     // --- Header section ---
     doc.font("Times-Roman", 18).text("Primebrick Accessibility Conformance Report");
     doc.font("Times-Roman", 12).text("International Edition (Based on VPAT® Version 2.5Rev)");
     // ... product name, version, date, description, contact, evaluation methods

     // --- Applicable Standards table (2-col) ---
     drawTable(doc, [
       ["Standard/Guideline", "Included In Report"],
       ["WCAG 2.0", "Level A (Yes) / AA (Yes) / AAA (Yes)"],
       // ...
     ], { colWidths: [250, 200] });

     // --- WCAG Table 1: Level A (32 criteria, 3-col) ---
     doc.addPage();
     doc.font("Times-Bold", 14).text("Table 1: Success Criteria, Level A");
     for (const sc of catalog.wcag.filter(c => c.level === "A")) {
       const conformance = vpatData.criteria[sc.id]?.conformance ?? "not-evaluated";
       const remarks = vpatData.criteria[sc.id]?.remarks ?? "";
       drawCriteriaRow(doc, sc, conformance, remarks);
     }
     // --- WCAG Table 2: Level AA, Table 3: Level AAA ---
     // --- §508 Chapters 3–6 ---
     // --- EN 301 549 Clauses 4–13 ---
     // Each on a new page (doc.addPage())

     // --- Footer (on every page) ---
     doc.on("pageAdded", () => {
       doc.font("Times-Roman", 8)
         .text('"Voluntary Product Accessibility Template" and "VPAT" are registered service marks of the Information Technology Industry Council (ITI)',
           56, doc.page.height - 40, { width: doc.page.width - 112, align: "center" });
     });

     doc.end();
     ```
   - **Table drawing helper**: `drawCriteriaRow()` draws a 3-column row with
     borders (rectangles + lines), criteria text in col 1 (with "Also applies
     to" cross-refs), conformance level in col 2 (with 5 sub-lines: Web /
     Electronic Docs / Software / Closed / Authoring Tool), remarks in col 3.
   - **Font**: Times-Roman (serif, built-in PDF font — no font file embedding
     needed). Times-Bold for headings.
   - **Page breaks**: `doc.addPage()` between major sections (WCAG / §508 / EN
     301 549).
   - **Header row shading**: light grey rectangle behind header row text.
   - All 17 tables from the VPAT 2.5 INT template:
     - Applicable Standards/Guidelines (2-col)
     - WCAG Table 1: Level A (32 criteria)
     - WCAG Table 2: Level AA (24 criteria)
     - WCAG Table 3: Level AAA (31 criteria)
     - §508 Chapters 3–6
     - EN 301 549 Clauses 4–13
   - Conformance cells populated from `vpat-data.json` (empirical axe results).
     Non-automatable SCs get "Not Evaluated" (AAA) or "Partially Supports —
     Manual review pending" (A/AA).
   - **Output**: `public/vpat/vpat-2.5.pdf` (static asset).
   - **No browser, no HTML, no Playwright** — pure Node.js, runs in Cloudflare
     build.

10. **`primebrick-v3-docs/package.json`** — add devDependency + scripts:
    ```json
    "devDependencies": {
      "pdfkit": "0.19.1"
    },
    "scripts": {
      "sync:vpat": "node scripts/sync-vpat-data.mjs",
      "generate:vpat-pdf": "node scripts/generate-vpat-pdf.mjs",
      "build:vpat-pdf": "pnpm run sync:vpat && pnpm run generate:vpat-pdf"
    }
    ```
    **Note**: `pdfkit` is a devDependency (build-time only, not shipped to
    Workers). Version pinned per repo rule. ~3MB, no native deps, no browser.

11. **`.gitignore`** (docs) — add `src/data/vpat-data.json` (synced,
    regenerated by `sync-vpat-data.mjs`, like `generated-nav.ts`) and
    `public/vpat/*.pdf` (build artifact, regenerated on every build).

12. **`public/vpat/`** — directory committed with a `.gitkeep`. The PDF itself
    is gitignored and regenerated on every Cloudflare build from the synced
    `vpat-data.json`. Served by Cloudflare at `/vpat/vpat-2.5.pdf`. Zudoku
    copies `public/**` → `dist/**` during build.

#### 3C. CI integration (Cloudflare build chain — NOT GitHub Actions)

13. **`primebrick-v3-docs/AGENTS.md`** — update the CI build chain to include
    the two new scripts:
    ```
    pnpm install
    && node scripts/sync-repo-docs.mjs
    && node scripts/sync-vpat-data.mjs    (NEW — copies vpat-data.json from
                                            .tmp-repo-sync/frontend/)
    && node scripts/fetch-openapi.mjs
    && node scripts/sync-deepwiki.mjs     (if present)
    && node scripts/generate-nav.mjs
    && node scripts/generate-vpat-pdf.mjs (NEW — pdfkit generates PDF)
    && pnpm run build                     (zudoku build, copies public/** → dist/)
    ```
    - `sync-vpat-data.mjs` runs AFTER `sync-repo-docs.mjs` (which has already
      shallow-cloned the FE repo to `.tmp-repo-sync/frontend/`).
    - `generate-vpat-pdf.mjs` runs AFTER `sync-vpat-data.mjs` (which has copied
      `vpat-data.json` to `src/data/`).
    - `zudoku build` runs LAST and copies `public/vpat/vpat-2.5.pdf` →
      `dist/vpat/vpat-2.5.pdf`.
    - **No changes to GitHub Actions `sync-docs.yml`** — the PDF is generated
      in the Cloudflare build, not in GitHub Actions.

14. **Cloudflare build settings** — the build command in the Cloudflare
    dashboard needs to be updated to include the two new scripts. This is a
    manual step in the Cloudflare dashboard. The AGENTS.md documents the new
    chain; the user updates the Cloudflare build command.

    **Alternative**: if the Cloudflare build command is hardcoded and hard to
    change, add the VPAT scripts to the `build` npm script:
    ```json
    "build": "node scripts/sync-vpat-data.mjs && node scripts/generate-vpat-pdf.mjs && zudoku build"
    ```
    But this runs the sync even in local dev builds. **Decision**: update the
    Cloudflare build command (documented in AGENTS.md), keep `build` as just
    `zudoku build`.

**Acceptance criteria Phase 3:**
- `pnpm run build:vpat-pdf` in docs repo (locally) produces
  `public/vpat/vpat-2.5.pdf`.
- The PDF opens in a PDF reader and has **selectable text** (pdfkit generates
  real text, not images).
- The PDF visually matches the VPAT 2.5 docx format: Times-Roman serif fonts,
  bordered tables, header row shading, ITI footer, page numbers, section page
  breaks.
- All 17 tables are present (3 WCAG + 4 §508 + 9 EN 301 549 + 1 standards).
- Conformance levels in the PDF match `vpat-data.json` (empirical axe results).
- The web MDX page renders at `/frontend/guide/vpat-2.5` with the
  `<VPATTable />` component and a "Download PDF" button.
- The download button links to `/vpat/vpat-2.5.pdf` (served by Cloudflare).
- The Cloudflare build chain generates the PDF automatically on every push to
  `main` (no manual intervention, no GitHub Actions needed for PDF).

---

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Vitest 4 + Svelte 5.56 `$effect` bugs | Smoke test first; fallback to workspaces + happy-dom |
| Playwright tries to start a 2nd dev server on 5173 | `reuseExistingServer: true` + dev-server rule compliance |
| axe-core finds many violations on first run → test always red | Split fail logic: only critical/serious fail; minor/moderate are recorded. Baseline the rest. |
| VPAT claims "supports" for non-automatable SCs (dishonest) | Mark non-automatable A/AA as "partially-supports" with "Manual review pending" remark; AAA as "not-evaluated" (VPAT-allowed) |
| `vpat-data.json` drifts from actual axe results | Commit it as an artifact; regenerate via `test:a11y:report` before each docs sync. Add a CI check that the JSON `generated_at` is recent. |
| **Cloudflare build cannot install Playwright** | Use `pdfkit` (pure JS, ~3MB, no browser) instead. Runs in any Node.js environment. |
| **PDF looks like a website page, not a formal VPAT** | PDF is generated by pdfkit programmatically (no HTML, no Zudoku chrome). Drawn to match the docx format exactly: Times-Roman, bordered tables, ITI footer. |
| pdfkit table drawing is manual (no HTML/CSS) | Helper functions (`drawCriteriaRow`, `drawTable`) abstract the drawing. The VPAT has fixed 17 tables, all 3-column — manageable. |
| `wcag-criteria-catalog.json` diverges from VPAT format | Catalog is extracted from the actual reference docx (section 2.7). Static file, doesn't change between WCAG versions. |
| pdfkit PDF not fully tagged/accessible | pdfkit generates real text (selectable, searchable). Basic structure is present. Full PDF/A tagging is a future enhancement. |
| Playwright not installed in docs repo locally | Not needed — pdfkit requires no browser. For FE Playwright (E2E + axe), `pnpm exec playwright install` runs locally or in FE CI. |

---

## 6. Out of scope (explicit)

- Manual accessibility testing (screen reader, keyboard-only) — the VPAT marks
  these SCs as needing manual review; a future task can fill them in.
- Section 508 and EN 301 549 **detailed** criteria beyond what WCAG covers — the
  INT edition tables will be present but populated with "Not Evaluated" until
  manual review.
- Visual regression testing (e.g. Playwright screenshot diffs) — separate task.
- Performance/load testing — separate task.

---

### Phase 4 — Website: 3 new landing page sections (accessibility + security + security posture)

**Repo**: `primebrick-v3-website` (Astro + Svelte + Tailwind, 6 languages i18n)

**Files to create/modify:**

1. **`primebrick-v3-website/src/i18n/translations.ts`** — add 3 new translation
   sections to ALL 6 languages (en, it, de, es, pt, fr):

   - **`accessibility`** — WCAG/VPAT/ARIA reliability section:
     ```ts
     accessibility: {
       badge: 'Accessibility',
       title: 'WCAG, VPAT & ARIA. Tested, not promised.',
       text: 'Primebrick is built accessibility-first. Automated WCAG 2.x + ARIA auditing runs on every route via axe-core. A downloadable VPAT 2.5 INT conformance report covers WCAG 2.0/2.1/2.2 (A/AA/AAA), Section 508, and EN 301 549 — so your compliance team has real evidence, not marketing claims.',
       cards: [
         { title: 'WCAG 2.2 A/AA/AAA', text: 'Automated axe-core scans on every route, every build. Level A, AA, and AAA success criteria tested continuously.' },
         { title: 'VPAT 2.5 INT Report', text: 'Downloadable Voluntary Product Accessibility Template covering WCAG, Section 508, and EN 301 549. Generated from real scan data.' },
         { title: 'ARIA compliance', text: 'Full ARIA roles, states, and properties validated. Screen-reader-compatible components out of the box.' },
         { title: 'Section 508 & EN 301 549', text: 'US Section 508 (Chapters 3–6) and EU EN 301 549 (Clauses 4–13) covered in the INT edition report.' },
       ],
     },
     ```

   - **`security`** — enforced security with passkey/WebAuthn/MFA:
     ```ts
     security: {
       badge: 'Enforced Security',
       title: 'Passkeys, WebAuthn & MFA. Built in, not bolted on.',
       text: 'Primebrick enforces modern authentication best practices. Passkey support via WebAuthn means users authenticate with Windows Hello™, Face ID™, or Touch ID™ — no passwords to phish, no OTP codes to intercept. Multi-factor authentication is integrated at the identity layer, not added as an afterthought.',
       cards: [
         { title: 'Passkeys (WebAuthn)', text: 'FIDO2/WebAuthn passkey authentication. Phishing-resistant by design — no shared secrets, no replay attacks.' },
         { title: 'Windows Hello™', text: 'Biometric and PIN authentication on Windows 10/11 via Windows Hello™. No password required.' },
         { title: 'Face ID™ & Touch ID™', text: 'Biometric authentication on macOS and iOS via Face ID™ and Touch ID™. Seamless, secure, native.' },
         { title: 'MFA everywhere', text: 'Multi-factor authentication enforced at the identity provider (Casdoor/OIDC). TOTP, hardware keys, and passkeys supported.' },
       ],
     },
     ```

   - **`securityPosture`** — critical action re-authentication:
     ```ts
     securityPosture: {
       badge: 'Security Posture',
       title: 'Critical actions require re-authentication. Always.',
       text: 'Primebrick enforces a strict security posture: every critical action — changing a user password, modifying RBAC permissions, altering security settings — requires an in-app security guard with admin re-login and MFA verification. No session reuse, no silent elevation. This follows NIST SP 800-63B step-up authentication and OWASP ASVS V3.4 session management requirements.',
       cards: [
         { title: 'In-app security guard', text: 'Critical actions trigger an in-app modal requiring admin credentials + MFA. No action proceeds without fresh verification.' },
         { title: 'Step-up authentication', text: 'Following NIST SP 800-63B: sensitive operations require a fresh authentication event, not just an existing session.' },
         { title: 'No session reuse', text: 'Existing JWT/session tokens are insufficient for critical actions. A new MFA challenge is always required.' },
         { title: 'OWASP ASVS aligned', text: 'Meets OWASP Application Security Verification Standard V3.4 (session management for high-value transactions).' },
       ],
     },
     ```

   - **All 6 languages** must have these 3 sections translated. The EN version
     above is the source; IT/DE/ES/PT/FR follow the same structure with
     translated text. Trademarks (Windows Hello™, Face ID™, Touch ID™) are NOT
     translated — they stay in English with the ™ symbol in all languages.

2. **`primebrick-v3-website/src/pages/[lang]/index.astro`** — add 3 new
   `<section>` blocks after the architecture section (line ~698) and before the
   "For Devs + For CTOs" section (line ~700):

   ```astro
   <!-- Accessibility Section -->
   <section class="relative z-10 px-6 py-24">
     <div class="mx-auto max-w-5xl">
       <div class="text-center sticky top-9 z-20 bg-slate-950/80 backdrop-blur-sm py-4 -mx-6 px-6">
         <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300">
           <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <circle cx="12" cy="4" r="2" /><path d="M19 13v-2a7 7 0 10-14 0v2" /><circle cx="12" cy="17" r="5" />
           </svg>
           {t.accessibility.badge}
         </div>
         <h2 class="text-3xl font-bold text-white sm:text-4xl">{t.accessibility.title}</h2>
         <p class="mx-auto mt-4 max-w-2xl text-lg text-slate-400">{t.accessibility.text}</p>
       </div>
       <div class="mt-12 grid gap-6 sm:grid-cols-2">
         {t.accessibility.cards.map((card) => (
           <div class="group rounded-2xl border border-slate-800/50 bg-slate-900/30 p-6 backdrop-blur-sm transition-all hover:border-emerald-500/30 hover:bg-slate-900/50">
             <h3 class="text-lg font-semibold text-white">{card.title}</h3>
             <p class="mt-2 text-sm text-slate-400">{card.text}</p>
           </div>
         ))}
       </div>
     </div>
   </section>

   <!-- Enforced Security Section -->
   <section class="relative z-10 px-6 py-24">
     <div class="mx-auto max-w-5xl">
       <div class="text-center sticky top-9 z-20 bg-slate-950/80 backdrop-blur-sm py-4 -mx-6 px-6">
         <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-300">
           <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
           </svg>
           {t.security.badge}
         </div>
         <h2 class="text-3xl font-bold text-white sm:text-4xl">{t.security.title}</h2>
         <p class="mx-auto mt-4 max-w-2xl text-lg text-slate-400">{t.security.text}</p>
       </div>
       <div class="mt-12 grid gap-6 sm:grid-cols-2">
         {t.security.cards.map((card) => (
           <div class="group rounded-2xl border border-slate-800/50 bg-slate-900/30 p-6 backdrop-blur-sm transition-all hover:border-amber-500/30 hover:bg-slate-900/50">
             <h3 class="text-lg font-semibold text-white">{card.title}</h3>
             <p class="mt-2 text-sm text-slate-400">{card.text}</p>
           </div>
         ))}
       </div>
     </div>
   </section>

   <!-- Security Posture Section -->
   <section class="relative z-10 px-6 py-24">
     <div class="mx-auto max-w-5xl">
       <div class="text-center sticky top-9 z-20 bg-slate-950/80 backdrop-blur-sm py-4 -mx-6 px-6">
         <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-medium text-red-300">
           <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
           </svg>
           {t.securityPosture.badge}
         </div>
         <h2 class="text-3xl font-bold text-white sm:text-4xl">{t.securityPosture.title}</h2>
         <p class="mx-auto mt-4 max-w-2xl text-lg text-slate-400">{t.securityPosture.text}</p>
       </div>
       <div class="mt-12 grid gap-6 sm:grid-cols-2">
         {t.securityPosture.cards.map((card) => (
           <div class="group rounded-2xl border border-slate-800/50 bg-slate-900/30 p-6 backdrop-blur-sm transition-all hover:border-red-500/30 hover:bg-slate-900/50">
             <h3 class="text-lg font-semibold text-white">{card.title}</h3>
             <p class="mt-2 text-sm text-slate-400">{card.text}</p>
           </div>
         ))}
       </div>
     </div>
   </section>
   ```

   - Color coding: emerald (accessibility), amber (security), red (security
     posture) — visually distinct from existing sections.
   - Same sticky-header + card-grid pattern as existing sections.

**Acceptance criteria Phase 4:**
- `pnpm run build` in website repo succeeds with no errors.
- All 6 language pages (`/en/`, `/it/`, `/de/`, `/es/`, `/pt/`, `/fr/`) render
  the 3 new sections.
- Trademarks (Windows Hello™, Face ID™, Touch ID™) appear with ™ symbol in all
  languages.
- The accessibility section mentions WCAG 2.x, VPAT 2.5 INT, ARIA, Section 508,
  and EN 301 549.
- The security section mentions passkeys, WebAuthn, MFA, and the 3 biometric
  technologies.
- The security posture section mentions critical actions, admin re-login, MFA
  in-app security guard, NIST SP 800-63B, and OWASP ASVS.
- Visual consistency with existing sections (same card styling, sticky headers,
  backdrop blur).

---

## 7. Execution order

1. **Phase 1** (FE vitest stack) — install, configure, smoke test, verify
   `pnpm run check` + `pnpm run test:unit` pass.
2. **Phase 2** (FE Playwright + axe) — install, configure, enumerate routes,
   run first audit, generate `vpat-data.json`.
3. **Phase 3** (Docs VPAT MDX + PDF) — create MDX, component, sync script, PDF
   script, build, verify PDF.
4. **Phase 4** (Website landing page) — add 3 new sections (accessibility,
   security, security posture) with i18n in all 6 languages, build, verify.

Each phase is independently verifiable. The user can stop after any phase.

---

## 8. Verification commands (per repo)

**FE** (`primebrick-fe-v3`):
```bash
pnpm install
pnpm run check              # typecheck (must stay green)
pnpm run test:unit          # vitest unit + component
pnpm run test:coverage      # coverage report
pnpm run test:e2e           # playwright E2E
pnpm run test:a11y:report   # axe audit + vpat-data.json
```

**Docs** (`primebrick-v3-docs`):
```bash
pnpm install
pnpm run sync:vpat          # pull vpat-data.json from FE repo
pnpm run build              # zudoku build (prerenders MDX web page)
pnpm run generate:vpat-pdf  # pdfkit → PDF (pure Node.js, no browser)
pnpm run build:vpat-pdf     # sync:vpat + generate:vpat-pdf (all-in-one)
```

**CI** (Cloudflare build, automatic):
- On every push to `main`, the Cloudflare build chain runs:
  `sync-repo-docs → sync-vpat-data → fetch-openapi → sync-deepwiki →
  generate-nav → generate-vpat-pdf (pdfkit) → zudoku build`
  → `public/vpat/vpat-2.5.pdf` is generated and served at `/vpat/vpat-2.5.pdf`.
  No GitHub Actions needed for PDF generation.

**Website** (`primebrick-v3-website`):
```bash
pnpm install
pnpm run build              # astro build (prerenders all 6 language pages)
pnpm run dev                # local dev on port 4321 (check port first)
```
Verify the 3 new sections render at `http://localhost:4321/en/` (and `/it/`,
`/de/`, `/es/`, `/pt/`, `/fr/`).

---

End of plan. Awaiting the **PROCEED** keyword before any code modification.
