# Docs — live component playground (REPL-style demo boxes)

> Continuation of `feature-ui-component-migration.md` (E0–E6 stream, branch
> `feature/table-pages-merge`) + `fe-ui-stack-and-component-catalog-docs.md`.
> The input-family migration joins the SAME documented method — nothing here
> invents a new convention.

## Status: 🟠 WIP — Plan date: 2026-10-24 — Decisions resolved by user (see §Decisions) — Awaiting approval

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Migrate input closure into `@primebrick/ui` following the per-component loop: `input/`, `copy-button/`, `label/`, `prime-field`, `use-clipboard`, `types/validation` | ⏳ not done | — | zero new deps required — verified |
| 2 | Migrate `Form.*` set (formsnap wrappers) into `components/forms/` + add `formsnap@2.0.1`/`sveltekit-superforms@2.30.2` pinned deps | ⏳ not done | — | user-approved dep addition |
| 3 | Move component-chrome CSS into `@primebrick/ui/styles.css` (gradient utility family + `@theme` token layer); FE `app.css` imports it | ⏳ not done | — | decision B — dependency-closure rule |
| 4 | Rewire FE call sites → `@primebrick/ui`; empty migrated dirs; delete FE-side copies of moved utilities | ⏳ not done | — | 26 TextInput + form set + label consumers |
| 5 | Docs move WITH the component: FE dev-guide pages → ui `docs/dev-guide/components/` + `_order.json`; zudoku redirects for old `/frontend/dev/components/*` URLs | ⏳ not done | — | established convention (W12 precedent) |
| 6 | Extend shared `check-standards.ts`: `.svelte` scanning + `raw-input-element` (+ `form-label-sibling`) — mechanizes existing `ui-input-components.md` rule | ⏳ not done | — | canonical copy in sdk/tools |
| 7 | Wire `check:standards`: FE `src` + services `fe/src` (`appliesTo` + script); sweep/migrate existing violations | ⏳ not done | — | FE unwired today; services scan `src` only — `fe/` uncovered |
| 8 | Migrate remote raw `<input>` (RuleFormPage + grep sweep) → `TextInput`/`PrimeField` after vendor rebuild | ⏳ not done | — | possible only post-task 1+4 |
| 9 | Scaffold `playground/` in `primebrick-v3-docs` (vite MPA, iframe per example, `bindI18n` EN — mirrors `host-bindings.ts`) | ⏳ not done | — | ui via vite alias to staged clone — decision |
| 10 | Extend `sync-repo-docs.mjs` → copy `docs/dev-guide/_playground/**` → `playground/.vendor/examples/<slug>/` | ⏳ not done | — | new copy branch (non-md files) |
| 11 | `<ComponentDemo>` React box + `zudoku.config.tsx` registration + `build:full` wiring + `.gitignore` | ⏳ not done | — | zudoku `Tabs`/`SyntaxHighlight`/`ClientOnly` |
| 12 | Author `components/input.mdx` + `_playground/input/*` in `primebrick-v3-ui` | ⏳ not done | — | pure examples, `@primebrick/ui` imports only |
| 13 | Verify per migration loop: live contexts, zero drift; docs build green | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Verified evidence (empirical, this session)

### The traced path already exists

`ai-plans/feature-ui-component-migration.md` defines THE migration method —
in flight on branch `feature/table-pages-merge` (checked out in BOTH
`primebrick-v3-ui` and `primebrick-fe-v3`; E0+E1 done):

- **Move**: file → `ui/src/lib/…`; `$lib/*` → relative paths;
  `$t(k)` → `getT()(k)`; `apiFetch` → `getServiceApi(name)`; `browser` →
  `typeof localStorage/document`; FE-only deps → ask user before adding.
- **Rewire**: consumers import from `@primebrick/ui` — direct import, no
  compat barrel (281 FE files verified; migrated dirs left empty:
  `combo-select`, `checkbox`, `dialog`, `popover`, `badge`, `switch`,
  `slider`, `command`, `refresh-button`).
- **Build**: `pnpm -C primebrick-v3-ui build` → `pnpm -C primebrick-fe-v3
  vendor:build`.
- **Verify live** on 2-3 real contexts → fix drift → next.
- **Docs move WITH the component** (W12 precedent).

### CSS ownership — how `/ai` remote pages are styled TODAY (verified)

- Remote chunks emit **empty css stubs**: `jobs-page.css` =
  `/* jobs-page: no extracted styles */`; `ai/fe/vite.config.ts` has a
  `stylesheetStub()` plugin because `remote-loader` probes `<chunk>.css`.
  Remote pages carry NO styles of their own.
- They render styled because they mount inside the **host DOM**: FE
  `app.css` (1128 lines) owns `@theme` tokens + ~30 `@utility` gradient
  blocks and scans ui sources via `@source "../../primebrick-v3-ui/src"`
  (migration F4 — the decided mechanism).
- `@primebrick/ui` ships **zero css today** (no `.css` in `src/`, no
  `styles` export in `package.json`) — the shared stylesheet does not
  exist yet; it is a real gap the migration hasn't closed.
- `input.svelte`/`text-input.svelte` reference `border-primary-gradient`,
  `border-destructive-gradient`, `border-readonly-gradient` — these
  `@utility` blocks are component dependencies → under the
  dependency-closure rule they move into `ui` as a shipped
  `@primebrick/ui/styles.css` (decision B). Consumers (`app.css`,
  playground) `@import` it; FE keeps app-shell utilities
  (`avatar-hex`, `scrollbar-*`, `truncate-start`, `no-scrollbar`) and the
  dynamic `@source inline()` safelist. Audit at execution: which
  `@theme` tokens are design-system (move) vs app-specific (stay).

### Dependency closure of the move (grep-verified)

| Piece | Current location | Internal deps (verified) |
|---|---|---|
| `input.svelte`, `text-input.svelte`, `async-validated-input.svelte`, `index.ts` (+ `input-chrome.ts` already in ui) | FE `components/ui/input/` | `cn`/`WithElementRef` (ui ✓), `Tooltip`+`Eraser`+`inputTrailingIconButtonClasses` (ui ✓), `CopyButton`, `$lib/types/validation` |
| `copy-button.svelte` | FE `components/ui/copy-button/` | `button.svelte` — only `variant="ghost" size="icon"` → ui `Button` suffices (no loading used); `use-clipboard.svelte`; vendor bits-ui/lucide ✓ |
| `use-clipboard.svelte.ts` | FE `hooks/` | pure `navigator.clipboard` ✓ |
| `types/validation.ts` | FE `types/` | pure types ✓ |
| `label/label.svelte` | FE `components/ui/label/` | `@primebrick/ui/vendor/bits-ui` Label + `cn` — needed by `form-label.svelte` |
| `prime-field.svelte` | FE `components/ui/form/` | `FormLabelWithPriorityHelp`+types (ui ✓), `$t` — 2 sites only (meta help) → `getT()` |
| `Form.*` set (10 files) | FE `components/ui/form/` | `formsnap`, `sveltekit-superforms` types, `form-label`→`label/`, `translated-field-errors`→`$t`→`getT()`, `form-button`→ui `Button` ✓ |

### Playground feasibility — VERIFIED, no blockers

- Published `@primebrick/ui@3.0.0` ships `.svelte` sources in `dist/`;
  `vendor/*.js` are thin re-exports → consumer needs the wrapped packages
  installed. Per user decision the playground does NOT use npm: vite
  alias `@primebrick/ui` → `.tmp-repo-sync/ui/src/lib` (main-fresh).
  Vendor specifiers resolve per `vendor-map.json` → real packages pinned
  in docs `package.json` (`bits-ui`, `@lucide/svelte`,
  `tailwind-variants`, `clsx`, `tailwind-merge`, `esm-env`, `svelte`,
  tailwind `4.3.3`). `@primebrick/core` needed for types — pin npm if
  published else alias staged `core` clone (verify at execution).
- Playground css = same recipe as host: `@import "tailwindcss"` +
  `@import "@primebrick/ui/styles.css"` (task 3) +
  `@source` on staged ui src. This IS the host ambient model applied to
  a standalone consumer — no new architecture.
- i18n: `bindI18n` in shared `mount.ts` (the designed seam — identical
  call shape to FE `host-bindings.ts`), EN `TranslateFn`; example files
  use plain strings in props.
- Services already: `@primebrick/ui workspace:*`, `svelte 5.57.2`,
  `fe:build`/`fe:check`, `check:standards` wired — scanning `src` only:
  **`fe/` dirs escape the lint gate today**.
- FE has NO `check:standards` script (verified).
- ui dev-guide `_order.json` = `["overview", "utilities"]` →
  `components/` section extends it.

### The lint rule already exists as doctrine

`primebrick-fe-v3/docs/ai/ui-input-components.md` (canonical body of
`.devin/rules/ui-input-components.md`): "Only Primebrick UI components
are allowed for value inputs — the component set is closed"; native
`<input>`/`<select>` explicitly forbidden. The linter mechanizes this
existing rule — no new policy invented.

## Part B — Migration epic (per the traced loop)

Each row = Move → Rewire → Build(ui+vendor) → Verify live on listed
real contexts → Fix drift:

| # | Component | Deps first | Live test contexts (grep-verified) |
|---|-----------|------------|-------------------------------------|
| I1 | `types/validation` | none | async-validated-input compile |
| I2 | `use-clipboard` | none | copy-button |
| I3 | `label/` | bits-ui vendor ✓ | form-label |
| I4 | `input/` (3 files + index; merge `input-chrome.ts`) | I1, cn | `profile`, `configurations/create`, `email-providers` |
| I5 | `copy-button/` | I2, ui Button | text-input readonly — profile/api-key |
| I6 | `prime-field` | I5, `getT()` | `configurations/create` (FieldHelp), `profile` (MetaColumn) |
| I7 | `Form.*` set | I3, I6, deps approved | `users/create`, `roles/create` (superforms) |
| I8 | `styles.css` (gradient family + token layer) | none | all above visual verify; FE app.css `@import` swap |

After I4: `pnpm vendor:build` → remote plane carries `TextInput`/
`PrimeField` → task 8 unblocked.

## Part C — Linter (mechanizes `ui-input-components.md`)

- Extend `primebrick-v3-sdk/tools/check-standards.ts`: `walk()` yields
  `.svelte`; gated rules:
  - `raw-input-element` — `<input` outside `allowPaths` (primitive files
    only: `components/input/**` + password/phone/otp/numeric primitives).
  - `form-label-sibling` — `<label`/`Label` in routes/pages/panels
    outside field wrappers (PrimeField/Form.\*/SwitchField own labels).
- `standards-exempt:` + mandatory reason covers sanctioned cases.
- Wiring: FE `check:standards` script (new) + services gain
  `fe/src` coverage (script arg or `.devin/check-standards.json`
  `appliesTo`).

## Part D — Docs + playground

- **Authoring**: `primebrick-v3-ui/docs/dev-guide/components/input.mdx`
  → site `/ui/dev/components/input`; examples in
  `docs/dev-guide/_playground/input/*.svelte` + `demo.json`; sync
  extension copies `_playground/**` → `playground/.vendor/examples/ui/`.
- **Examples pure**: `import { TextInput, PrimeField } from
  '@primebrick/ui'` + plain EN strings; `bindI18n` once in `mount.ts`.
- **Playground** (`primebrick-v3-docs/playground/`): vite MPA, one
  `index.html` per example → `public/playground/<name>/` (gitignored) →
  `dist/`. Aliases: `@primebrick/ui` → `.tmp-repo-sync/ui/src/lib`;
  `@primebrick/ui/vendor/*` → real packages (vendor-map.json);
  `@primebrick/ui/styles.css` → staged `styles.css`.
- **`<ComponentDemo>`**: tabs Preview/Svelte/TS/HTML/CSS; iframe +
  `?theme=` sync + auto-height postMessage; HTML tab = live DOM
  snapshot; `SyntaxHighlight`; `ClientOnly`; graceful placeholder if
  playground not built.
- **Demo set**: plain, file, clear, readonly-copy (copy tooltip),
  disabled, trailing, async-validated, primefield-help (all
  priorities — tooltip-by-design), required-error,
  formlabel-priority (+`labelKey`), meta-driven help, ghost-chrome,
  Form.* sample, remote divergence note (post task 8).

## Decisions — resolved by user

| # | Decision | Resolved |
|---|----------|----------|
| Q1 | CSS ownership | **ui ships `styles.css`** — dependency-closure: component chrome utilities move with components. Verified: ui has zero css today; remote pages have empty css stubs and rely on host ambient — this task closes that gap. |
| Q2 | formsnap/superforms deps | **yes — full `Form.*` move now**, pinned `formsnap@2.0.1` + `sveltekit-superforms@2.30.2` |
| Q3 | playground ui source | **vite alias → staged `.tmp-repo-sync/ui` clone** (main-fresh, no npm) |
| Q4 | lint scope | **FE `src` + services `fe/src`** |

## Release order (mandatory, verified rule)

1. `primebrick-v3-ui` release — migration + `styles.css` + docs +
   examples on `main`.
2. `primebrick-fe-v3` release — consumer switch (`app.css` import swap,
   `$lib` → `@primebrick/ui`).
3. `primebrick-us-v3` release — remote migrations (post vendor rebuild).
4. `primebrick-v3-docs` release — playground + `_playground` sync +
   `components/` pages.
