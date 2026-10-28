# FE routes lint baseline cleanup

> Standalone. Baseline measured 2026-10-29 on `primebrick-fe-v3` branch
> `feature/crm-customer-ownership` after the host-chrome migration:
> `npx eslint src/routes` → **97 errors, 0 warnings** (error-severity only).

## Status: 🟢 DONE (see notes — two rows resolved differently) — Plan date: 2026-10-29 01:40 UTC / 02:40 CET

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Snapshot baseline into `tools/lint-baseline.json` (per-file, per-rule) + `pnpm lint:baseline` script that diffs current vs baseline | ✅ | 2026-10-29 | Resolved differently: reached 0 errors in-session, so the gate IS `eslint src/routes` = 0 — a baseline file for an empty set is dead weight |
| 2 | Fix 66× `@typescript-eslint/no-unused-vars` — delete dead imports/vars; quarantine genuinely-WIP symbols with `// eslint-disable-next-line` + TODO | ✅ | 2026-10-29 | Bulk of the debt; per-file review, not blind autofix |
| 3 | Fix 9× `svelte/no-navigation-without-resolve` — `goto()`/`redirect()` wrapped in `resolve()` | ✅ | 2026-10-29 | Mechanical, low risk |
| 4 | Fix 7× `svelte/no-useless-children-snippet` — collapse `{#snippet children()}` to plain slot | ✅ | 2026-10-29 | Mechanical |
| 5 | Fix 4× `svelte/prefer-svelte-reactivity` + 3× `prefer-derived-over-derived-by` — replace imperative `$state` writes with derived/reactivity primitives | ✅ | 2026-10-29 | Needs per-site judgment |
| 6 | Fix 3× `svelte/require-each-key` + 3× `no-unused-expressions` | ✅ | 2026-10-29 | each-key needs stable key choice |
| 7 | Fix 1× `svelte/no-dom-manipulating` + 1× `no-at-html-tags` | ✅ | 2026-10-29 | dom-manipulating → `mountReport` returns same-runtime unmount handle (no innerHTML). `{@html}` → user-approved contract drop: `icon_type:'svg'` removed SDK+FE (zero real usage — all 6 registry rows + 5/5 service decls are 'icon') |
| 8 | Re-run `npx eslint src/routes` → 0; update baseline; svelte-check gate stays 0/0 | ✅ | 2026-10-29 | Acceptance gate |

---

## Baseline by rule

| Errors | Rule | Fix nature |
|---|------|-----------|
| 66 | `@typescript-eslint/no-unused-vars` | dead imports from WIP/stripped code; mostly safe deletes, some are WIP placeholders |
| 9 | `svelte/no-navigation-without-resolve` | `goto("/x")` → `goto(resolve("/x"))` |
| 7 | `svelte/no-useless-children-snippet` | redundant `{#snippet children()}` wrappers |
| 4 | `svelte/prefer-svelte-reactivity` | imperative updates → `$derived`/reactivity |
| 3 | `svelte/prefer-derived-over-derived-by` | `$derived.by` → plain `$derived` |
| 3 | `svelte/require-each-key` | missing `(key)` in `{#each}` |
| 3 | `@typescript-eslint/no-unused-expressions` | side-effect statements |
| 1 | `svelte/no-dom-manipulating` | direct DOM write |
| 1 | `svelte/no-at-html-tags` | `{@html}` — sanitization check |

## Baseline by file (top)

| Errors | File |
|---|------|
| 24 | `(app)/system/settings/profile/+page.svelte` |
| 9 | `(app)/system/settings/organizations/create/+page.svelte` |
| 9 | `(app)/system/settings/users/create/+page.svelte` |
| 8 | `(app)/system/settings/organizations/[uuid]/+page.svelte` |
| 7 | `(app)/system/settings/users/[uuid]/+page.svelte` |
| 6 | `welcome/+page.svelte` |
| 5 | `(app)/system/settings/configurations/create/+page.svelte` |
| 5 | `(app)/system/settings/roles/[uuid]/+page.svelte` |
| 5 | `(app)/system/settings/translations/+page.svelte` |
| 4 | `(app)/system/settings/roles/create/+page.svelte` |
| 4 | `login/+page.svelte` |

Settings pages dominate (~60 of 97): heavy form code with WIP imports left
behind by successive refactors.

## Approach

- **Ratchet first** (task 1): snapshot the baseline so the number can only go
  down; any new error in a touched file fails immediately. Prevents regression
  while cleanup proceeds file-by-file.
- **No blanket `--fix`**: `no-unused-vars` autofix deletes imports that may be
  referenced by commented-out WIP — review per file. Settings pages are the
  big win (profile alone = 24).
- **Order**: tasks 2→7 in row order (biggest count first, mechanical before
  judgment calls). Each task = one commit so regressions are bisectable.
- **Gate**: `npx eslint src/routes` → 0 errors AND `pnpm svelte-check` stays
  at 0/0. `src/lib` lint has separate debt (~350 across lib+routes) — a second
  plan should snapshot that baseline too; this plan covers `src/routes` only.
