# FE src/lib lint baseline cleanup

> Continuation of `lint-baseline-cleanup.md` — same methodology, wider scope.
> Baseline measured 2026-10-28 on `primebrick-fe-v3` branch
> `feature/crm-customer-ownership` after `src/routes` reached 0/0:
> `npx eslint src/lib` → **344 errors + 237 warnings = 581 problems in 128 files**.

## Status: ✅ DONE — `npx eslint src/lib` = 0 errors / 0 warnings (581 problems → 0); `svelte-check` 0/0

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Fix 121× `@typescript-eslint/no-unused-vars` — dead imports/vars; per-file review, no blind autofix (WIP placeholders may be deliberate) | ✅ done | 2026-10-28 | Went to 0 via real removals + **contract fixes**: wired `onOpenChange` through `BorderedDialog`+9 dialogs (Escape/backdrop desync bug), `onExportScopeChange` on Choicebox, `refresh()` in a composable return |
| 2 | Fix 75× `svelte/no-unused-svelte-ignore` — remove stale ignore comments | ✅ done | 2026-10-28 | Root cause was explanatory prose inside `svelte-ignore` comments parsed as rule names → split comments; removed 5 genuinely stale ignores, kept load-bearing ones |
| 3 | Fix 44× `svelte/prefer-svelte-reactivity` — `Set`/`Map` → `SvelteSet`/`SvelteMap` | ✅ done | 2026-10-28 | Swapped to `svelte/reactivity` wrappers; module-level non-rendered caches correctly left native; `?worker` import for ai-worker URL pattern; annotations → `ReadonlySet/Map` where snapshot is read-only |
| 4 | Fix 36× `svelte/require-each-key` — add stable keys to `{#each}` blocks | ✅ done | 2026-10-28 | Stable keys: entity ids, `col.key`, value itself for scalar lists |
| 5 | Fix 19× `svelte/prefer-derived-over-derived-by` + 1× `prefer-writable-derived` | ✅ done | 2026-10-28 | ⚠️ REGRESSION CAUGHT by svelte-check: `sidebar/context.svelte.ts` `.by(() => this.props.open())` was load-bearing lazy (`this.props` assigned in ctor) → `open` became a `get` accessor. `anchor-tabs-mode-switch` `checked` is NOT a writable-derived case (no `{get,set}` API exists) → single-source-of-truth: derived read + `onCheckedChange` write |
| 6 | Fix 13× `svelte/no-useless-mustaches` + 3× `no-useless-children-snippet` + 2× `no-useless-escape` + 2× `prefer-const` | ✅ done | 2026-10-28 | `SelectionCounter` `{' '}` was whitespace-preserving → 6-branch block became a derived label with explicit spaces. Snippets flattened (`EntityFormPage`, `ColumnsPanel`×2). Escape/const mechanical |
| 7 | Fix 9× `no-useless-assignment` + 1× `no-unassigned-vars` + 1× `no-unused-expressions` + 2× `preserve-caught-error` + 1× `no-empty-object-type` | ✅ done | 2026-10-28 | Dead initializers → annotations/const. `timezone` bindable seeded `selectedTimezone` (was write-only → latent contract bug). `snapTimeout` removed. `node.offsetHeight` → `void` (forced reflow is the side effect). `{cause: e}` ×2. `GuideLoopDeps` → `Record<string, unknown>` |
| 8 | Fix 7× `svelte/no-navigation-without-resolve` | ✅ done | 2026-10-28 | `resolve()` on internal `goto`; external docs URLs marked `rel="… external"` (rule-recognized external marker, not a workaround) |
| 9 | Resolve 3× `svelte/no-unused-props` | ✅ done | 2026-10-28 | Grew to 15 mid-run (destructure removals exposed members): full contract-chain trimming leaf→root (`datetimeIanaRenderTick`, `rowSelected`/`rowDeleted`, `selectedKeys`, `previewPanel`, `index`, `i18n_ns`, `config_type`, `onRowRangeMouseDown`). `data-testid` false-positive (quoted-key alias rule quirk) → default moved to render site, contract preserved |
| 10 | Resolve 2× `svelte/no-dom-manipulating` (`RemotePageMount`, `RemoteSheetMount`) | ✅ done | 2026-10-28 | `clearMountTarget(el)` added to `remote-loader.ts` next to `disposeMounted` — imperative mount-target ops live in the mount module, not in `.svelte` files (same boundary as `mountReport`) |
| 11 | Resolve 1× `svelte/no-at-html-tags` (`ai-chat-panel` :524) + 1× `no-control-regex` | ✅ done | 2026-10-28 | `{@html}` output is already `DOMPurify.sanitize`d in `mdToHtml` → `eslint-disable-next-line` with justification (DocsPanel convention). Control regex → explicit charCode guard (equivalent, clearer at the security boundary) |
| 12 | Eliminate 237× `@typescript-eslint/no-explicit-any` warnings | ✅ done | 2026-10-28 | Split in 4 commits: boundary casts → real types (`6fc70a3`, −60: transformers.ts/WebGPU native types, `isSupportedCountry`, `declare global` i18n, `rowFocused` latent bug fixed); `Record<string,any>` → `unknown`/`AuditData` (`f7f3d2a`, −68); entity-list-table pipeline → `TRow` generics + `MetaColumn[]` + `EntityRowActions` + `ReturnType<typeof useX>` (`70ad0f4`, −90); tail (`6650183`, −19: superForm pieces, auth `user`, index-sig → `unknown`). +30 unit tests (`numOr`, `buildAuditData`, `pushNotification` RFC7807, `tryParseJsonObject`, `parseColumnOrderState`, phone cases) |
| 13 | Final gate: `npx eslint src/lib` → 0/0 AND `svelte-check` stays 0/0; commit per rule | ✅ done | 2026-10-28 | **eslint src/lib+src/routes: 0 errors, 0 warnings** ✅ · svelte-check 0/0 ✅ · vitest 530/530 ✅ · 4 type-cleanup commits pushed |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Baseline by rule

| Err | Warn | Rule | Fix nature |
|-----|------|------|-----------|
| 0 | 237 | `@typescript-eslint/no-explicit-any` | type holes — `unknown` at boundaries, concrete types at consumers (ComboSelect precedent) |
| 121 | 0 | `@typescript-eslint/no-unused-vars` | dead imports/vars from refactors; some may be WIP → per-file review |
| 75 | 0 | `svelte/no-unused-svelte-ignore` | stale ignores — BUT may hide compiler warnings eslint can't see (see task 2 trap) |
| 44 | 0 | `svelte/prefer-svelte-reactivity` | `new Set/Map()` → `SvelteSet`/`SvelteMap` |
| 36 | 0 | `svelte/require-each-key` | missing `(key)` in `{#each}` |
| 19 | 0 | `svelte/prefer-derived-over-derived-by` | `$derived.by` → plain `$derived` |
| 13 | 0 | `svelte/no-useless-mustaches` | `{`"literal"`}` → literal |
| 9 | 0 | `no-useless-assignment` | value written then overwritten/dead |
| 7 | 0 | `svelte/no-navigation-without-resolve` | `goto()` → `goto(resolve())` |
| 3 | 0 | `svelte/no-unused-props` | declared props never read — possible contract members |
| 3 | 0 | `svelte/no-useless-children-snippet` | redundant snippet wrappers |
| 2 | 0 | `svelte/no-dom-manipulating` | `RemotePageMount`/`RemoteSheetMount` DOM writes — architectural |
| 2 | 0 | `prefer-const` | `let` → `const` |
| 2 | 0 | `no-useless-escape` | unnecessary regex escapes |
| 2 | 0 | `preserve-caught-error` | `throw new Error` loses `cause` |
| 1 | 0 | `no-control-regex` | control chars in regex — likely intentional (ANSI strip?) → verify |
| 1 | 0 | `svelte/prefer-writable-derived` | — |
| 1 | 0 | `svelte/no-at-html-tags` | `{@html}` in ai-chat-panel — XSS surface |
| 1 | 0 | `@typescript-eslint/no-empty-object-type` | `{}` type → `object`/concrete |
| 1 | 0 | `@typescript-eslint/no-unused-expressions` | side-effect statement |
| 1 | 0 | `no-unassigned-vars` | — |

## Baseline by file (top 20 by total problems)

| Err/Warn | File |
|----------|------|
| 34e/4w | `components/config-list/ConfigValueInput.svelte` |
| 1e/27w | `components/entity-list-table/components/EntityListTableContent.svelte` |
| 21e/2w | `components/config-list/ConfigList.svelte` |
| 8e/14w | `entity-list/sheets/panels/FiltersPanel.svelte` |
| 6e/16w | `entity-list/sheets/panels/VersionHistoryPanel.svelte` |
| 2e/18w | `shell/sheets/panels/ErrorsPanel.svelte` |
| 1e/16w | `entity-list-table/components/EntityListTableTableView.svelte` |
| 2e/14w | `ai/ai-worker.ts` |
| 16e/0w | `components/date-dropper/date-wheel-picker.svelte` |
| 13e/0w | `entity-list-table/panels/PreviewPanel.svelte` |
| 12e/0w | `entity-list-table/toolbar/SelectionCounter.svelte` |
| 2e/10w | `components/ui/smart-ai/use-ai-assistant.svelte.ts` |
| 0e/11w | `entity-list-table/components/EntityListTableCardView.svelte` |
| 10e/0w | `entity-list-table/EntityListTable.svelte` |
| 10e/0w | `components/ui/numeric-input/numeric-input.svelte` |
| 8e/1w | `entity-list-table/cards/CardField.svelte` |
| 3e/6w | `components/ui/sortable/sortable.svelte` |
| 7e/1w | `components/FormPageLayout.svelte` |
| 1e/7w | `entity-list-table/components/EntityListTableHeaderRow.svelte` |
| 2e/6w | `entity-form/EntityFormPage.svelte` |

`entity-list-table/` alone carries ~95 problems; `config-list/` ~57.
128 files total have findings.

## Approach

- **Same ratchet philosophy as routes**: the number only goes down; end state
  is `eslint src/lib` = 0/0 so the gate IS eslint itself (no baseline file —
  it was dead weight for an empty set in plan 1, same here).
- **Per-rule commits** for bisectability (one commit per task row, or per
  file-cluster for the 237 `any` warnings).
- **svelte-check is the second gate**: after every batch it MUST stay 0/0.
  This is what catches stale-ignore removals that were actually load-bearing
  (task 2) and `any`-removals that break inference (task 12).
- **User-decision points** (per the standing rule "no doubt/anomaly/workaround
  without asking"): tasks 9, 10, 11 and any site where the "correct" fix is
  genuinely ambiguous. These are listed explicitly — do not improvise.
- **No suppressions as a fix.** `eslint-disable` is only acceptable where the
  rule is provably wrong AND the pattern is architecturally required — and even
  then only after user approval (see remote mounts, task 10).
- Order: errors first (tasks 1–11), warnings last (task 12) — errors are the
  ratchet target; `any` is the deep-typing pass that benefits from the rest
  being clean first.

## Acceptance criteria

1. `npx eslint src/lib` → 0 errors, 0 warnings.
2. `npx svelte-check` → 0 errors, 0 warnings (unchanged gate).
3. `pnpm build` (or consumer build) unaffected; remote-bundle consumers of
   any touched public component type still compile.
4. No `any` → `any` disguised casts, no blanket disables, no behavior change —
   proven by svelte-check + spot-verified E2E on entity-list table interactions
   (largest touched surface).
