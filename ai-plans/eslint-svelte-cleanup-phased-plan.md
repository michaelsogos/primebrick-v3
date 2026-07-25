# Plan: Phased ESLint/Svelte Cleanup in `primebrick-fe-v3`

## 1. Empirical baseline (what was measured)

All numbers below come from **actual** commands run on the repository in its current state.

| Command | Result | Key finding |
|---|---|---|
| `cd primebrick-fe-v3 && pnpm run lint` | **Exit code 1** | 641 lint messages (380 errors, 261 warnings) across **122 files**. Raw output saved to `D:\git\primebrick\temp\eslint-output.txt`. |
| `cd primebrick-fe-v3 && pnpm run check` | **Exit code 0** | `svelte-check` found **0 errors, 2 warnings** in 1 file (a11y label-associated-control warnings in `modules/[code]/+page.svelte`). |
| `cd primebrick-fe-v3 && NODE_ENV=production pnpm run build` | **Exit code 0** | Production build succeeds. This means the ESLint errors do **not** currently block the build or `svelte-check`. They block turning on `pnpm lint` as a CI/merge gate. |

**Implication:** No issue is a hard build crash today, but the set of 380 lint errors makes `pnpm lint` unusable as a quality gate and **many rules point to real runtime or security defects** that should be fixed before ESLint is enforced.

---

## 2. Total inventory by rule / severity

| # | Rule | Severity | Count | Impact tier | Notes |
|---|------|----------|-------|-------------|-------|
| 1 | `@typescript-eslint/no-explicit-any` | warn | 261 | WARN (mostly) | Type erosion; project overrides it to `warn` already. |
| 2 | `@typescript-eslint/no-unused-vars` | error | 219 | HIGH/WARN mix | 219 counts; most are dead imports/vars, but some assigned-but-unused values mask missing wiring. |
| 3 | `svelte/prefer-svelte-reactivity` | error | 40 | HIGH / FALSE-POSITIVE mix | Plain `Map`/`Set` used in reactive context. Many are **local temporaries assigned wholesale** (false positives); some are state fields mutated in place (real reactivity bugs). |
| 4 | `svelte/require-each-key` | error | 35 | HIGH | Missing keys in `{#each}` blocks. Real DOM reconciliation risk. |
| 5 | `svelte/no-useless-children-snippet` | error | 18 | HIGH | Children snippets passed where direct children would work; can cause unexpected snippet behavior / rendering. |
| 6 | `svelte/prefer-derived-over-derived-by` | error | 18 | WARN | Project rule matching `AGENTS.md`; style-only — no runtime defect. |
| 7 | `svelte/no-navigation-without-resolve` | error | 15 | HIGH/CRITICAL | `goto(href)` / `href` without `resolve()`. Breaks navigation when app is served under a sub-path; affects any customer with non-root base path. |
| 8 | `svelte/no-useless-mustaches` | error | 13 | WARN | `{staticString}` instead of `staticString`. Cosmetic. |
| 9 | `preserve-caught-error` | error | 4 | HIGH | Rethrowing errors without `{ cause }`. Original stack/cause is lost; real debugging defect. |
| 10 | `svelte/no-unused-svelte-ignore` | error | 4 | WARN | Stale `svelte-ignore` comments. Cleanup only. |
| 11 | `no-useless-assignment` | error | 3 | HIGH/WARN mix | Value assigned but never used; one is a `$bindable` prop false positive, the other two may be real logic bugs. |
| 12 | `svelte/no-at-html-tags` | error | 2 | **CRITICAL** | `{@html}` injections — XSS surface. Must be audited for sanitization. |
| 13 | `svelte/no-unused-props` | error | 2 | HIGH | Declared props in snippet/prop objects are unused; could indicate a feature or binding is missing. |
| 14 | `no-empty` | error | 2 | WARN | Empty `catch` blocks around `sessionStorage` calls. Deliberate swallow of non-critical persistence failures. Add a comment or a no-op variable. |
| 15 | `no-unassigned-vars` | error | 1 | WARN | Variable declared but never assigned. Style/code smell. |
| 16 | `prefer-const` | error | 1 | WARN | Variable should be `const`. Style. |
| 17 | `svelte/prefer-writable-derived` | error | 1 | HIGH | Using `$state` + `$effect` where a writable `$derived` is intended. Can create synchronisation races. |
| 18 | `@typescript-eslint/no-unused-expressions` | error | 1 | WARN | `node.offsetHeight;` is a deliberate forced reflow trigger (browser repaint trick). False positive — needs a disable comment. |
| 19 | `svelte/no-immutable-reactive-statements` | error | 1 | HIGH | `$:` reactive statement references only immutable values; it never re-runs. Real Svelte 4 → 5 migration issue. |
|   | **TOTAL** |  | **641** |  | 380 errors / 261 warnings |

---

## 3. Impact classification

The user's classification is applied as follows:

- **CRITICAL** — a real blocking error: security vulnerability, runtime crash, or a defect that breaks the application in real deployments.
- **HIGH** — a silent blocker / hidden real error: the app runs, but the code contains a real defect (lost error context, stale UI, wrong navigation, swallowed behavior, missing reactive updates, DOM reconciliation bugs).
- **WARN** — not an error: code smell, dead code, stylistic preference, or a deliberate pattern that the linter flags as a false positive.

### 3.1 CRITICAL issues (must be fixed before ESLint is enforced)

| Rule | Count | Why CRITICAL | Files |
|---|---|---|---|
| `svelte/no-at-html-tags` | 2 | `{@html}` can inject unsanitized HTML. In `rfc-error-dialog.svelte` and `modules/+page.svelte` the values **must** be proven sanitized or replaced with a safe rendering mechanism before ESLint can pass. | `src/lib/components/ui/rfc-error-dialog.svelte:152`  `src/routes/(app)/system/settings/modules/+page.svelte:234` |

### 3.2 HIGH issues (real hidden defects)

| Rule | Count | Why HIGH | Representative files |
|---|---|---|---|
| `svelte/no-navigation-without-resolve` | 15 | `goto(href)` without `resolve()` will produce wrong URLs when the app is deployed under a non-root base path. This is a real navigation defect for any sub-path deployment. | `AppPageBreadcrumb.svelte:50`, `AppSidebar.svelte:148`, `SidebarProfileMenu.svelte:108`, `button.svelte:98`, `(app)/+layout.svelte:59`, roles/users/org create/edit routes. |
| `svelte/prefer-svelte-reactivity` | 40 | Plain `Map`/`Set` inside `$state` does not trigger reactivity on `set/delete/add`. Some flagged instances are truly mutated state fields; fixing them prevents stale selection/filter data in the entity list table. **Each must be audited** because local temporaries assigned wholesale are false positives. | `useClientSelection.svelte.ts`, `useColumnOrder.svelte.ts`, `useRowRangeSelection.svelte.ts`, `useExport.svelte.ts`, `useStickyColumns.svelte.ts`, `useSheetPanels.svelte.ts`, `useEntityMetadata.svelte.ts`, `EntityListTable.svelte`, `services-store.svelte.ts`, several route pages. |
| `svelte/require-each-key` | 35 | Missing `(key)` in `{#each}` causes Svelte to reuse DOM elements by index. This can cause stale form/input state, incorrect selection, or wrong row data in tables. | `date-wheel-picker.svelte` (10), `FiltersPanel.svelte` (both copies), `PreviewPanel.svelte`, `TableRow.svelte`, `Mfa*`, `JsonTableViewer.svelte`, etc. |
| `svelte/no-useless-children-snippet` | 18 | Passing `children` as a snippet where direct children are expected can break parent snippet resolution (e.g. `PreviewPanelWrapper`, `ColumnSelectorPanel`, route pages). | `ColumnSelectorPanel.svelte`, `ColumnsPanel.svelte`, several `+page.svelte` files. |
| `preserve-caught-error` | 4 | Rethrowing without `{ cause: original }` destroys the original stack trace and error identity. Real debugging/observability defect. | `src/e2e/global.setup.ts:38,57,70`  `src/lib/api.ts:231` |
| `svelte/no-immutable-reactive-statements` | 1 | `$:` statement references only immutable values, so it never re-runs. In `LangSelect.svelte` the sorted language list is computed once; if `navigator.languages` ever changes the UI won't update. Svelte 4 pattern in a Svelte 5 code base. | `src/lib/components/LangSelect.svelte:24` |
| `svelte/prefer-writable-derived` | 1 | Using `$state` + `$effect` to keep a derived value in sync can create one-frame/tick races. Should be `let x = $derived(...)` and updated via the source. | `src/lib/components/anchor-tabs/anchor-tabs-mode-switch.svelte:23` |
| `svelte/no-unused-props` | 2 | `focusedRowIndex` is declared in `previewPanel` / `previewPanel.state` but never consumed. Likely a missing feature or a leftover from a refactor. | `PreviewPanelWrapper.svelte:55`, `TableRow.svelte:34` |
| `@typescript-eslint/no-unused-vars` (subset) | ~30-50 of 219 | Variables that are **assigned** but never read are usually wiring bugs (e.g. `viewVisibility`, `scrollPreservation`, `filterPersistence` in `EntityListTable.svelte`). The rule cannot distinguish dead imports from missing wiring, so each assigned-but-unused variable must be reviewed. | `EntityListTable.svelte`, several route pages. |
| `no-useless-assignment` (subset) | 2 of 3 | `date-wheel-picker.svelte:26` (`timezone` assigned but never used) and `color-picker.svelte:140` (`s` assigned but never used) may indicate a forgotten computation. The third (`sidebar-trigger.svelte:10` `ref = $bindable(null)`) is a false positive. | `date-wheel-picker.svelte`, `color-picker.svelte` |

### 3.3 WARN issues (code smell / false positives / style)

| Rule | Count | Why WARN | Handling |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | 261 | Already downgraded to `warn` in `eslint.config.js`. Type safety debt, not a runtime defect. | Replace with `unknown` / proper generics in entity-list types, handlers, and API helpers. Large volume; can be partially automated with `satisfies` or generic parameters. |
| `@typescript-eslint/no-unused-vars` (most) | ~170 of 219 | Unused imports, unused destructured props, or function arguments that are genuinely dead code. | Remove / prefix with underscore / use `_`. ESLint `--fix` can handle imports in many cases; manual review required for named args. |
| `svelte/prefer-derived-over-derived-by` | 18 | Project-specific style rule. `$derived.by(() => expr)` where `expr` is a simple expression should be `$derived(expr)`. No runtime impact. | Mechanical replacement. The rule is correctly enforced per `AGENTS.md`. |
| `svelte/no-useless-mustaches` | 13 | `{staticString}` around a string literal. Cosmetic. | Remove braces. |
| `svelte/no-unused-svelte-ignore` | 4 | Stale `svelte-ignore` comments that no longer match a warning. | Remove the comments. |
| `no-empty` | 2 | Empty `catch` around `sessionStorage` parse/store. Intentional non-critical swallow. | Add a descriptive comment inside the block or `catch { /* sessionStorage unavailable or corrupt — non-critical */ }`. |
| `prefer-const` | 1 | Style. | Change `let` to `const`. |
| `no-unassigned-vars` | 1 | Style. | Review and either assign or remove. |
| `@typescript-eslint/no-unused-expressions` | 1 | `node.offsetHeight;` is a deliberate forced reflow in `sortable.svelte`. | Add `// eslint-disable-next-line no-unused-expressions -- force reflow before re-enabling transition`. |
| `no-useless-assignment` | 1 | `ref = $bindable(null)` in `sidebar-trigger.svelte` is used by the parent via binding, not locally. | Add `// eslint-disable-next-line no-useless-assignment -- $bindable prop consumed by parent` or adjust rule config to ignore `$bindable` defaults. |

---

## 4. Phased execution plan

The sequence is designed to **fix real defects first**, then **clean up false positives/style**, and finally **enable ESLint as a gate**. Within each phase the safest, most mechanical changes are done before risky refactors.

### Phase 1 — CRITICAL: XSS audit and `{@html}` remediation
**Goal:** Remove the only security-blocking lint errors.  
**Files:** `src/lib/components/ui/rfc-error-dialog.svelte:152`, `src/routes/(app)/system/settings/modules/+page.svelte:234`.  
**Steps:**
1. Read both `{@html}` call sites and trace where the value comes from.
2. Determine if the HTML is:
   - already sanitized by DOMPurify or equivalent,
   - a known-safe static HTML fragment,
   - or user-controlled and unsafe.
3. If safe and static: add `eslint-disable` comment with justification.
4. If user-controlled: either sanitize with DOMPurify before interpolation or refactor to non-HTML rendering.
5. Re-run `pnpm lint` for these two files and confirm the errors are gone.

### Phase 2 — HIGH: Navigation and routing correctness
**Goal:** Fix `svelte/no-navigation-without-resolve` (15 errors).  
**Approach:**
- In `.svelte` files: replace `goto(someHref)` with `goto(resolve(someHref))` and import `resolve` from `$app/paths`.
- In `<a href={...}>` or Button `href` props: use `resolve(href)` where the prop is passed through to a real `<a>`.
- Verify each changed navigation target still works in dev.
**Files:**
- `src/lib/components/AppPageBreadcrumb.svelte:50`
- `src/lib/components/AppSidebar.svelte:148`
- `src/lib/components/sidebar/SidebarProfileMenu.svelte:108`
- `src/lib/components/ui/button/button.svelte:98`
- `src/routes/(app)/+layout.svelte:59`
- `src/routes/(app)/system/settings/organizations/create/+page.svelte:98`
- `src/routes/(app)/system/settings/roles/+page.svelte:451,456`
- `src/routes/(app)/system/settings/roles/[uuid]/+page.svelte:101,112,117`
- `src/routes/(app)/system/settings/roles/create/+page.svelte:116,121`
- `src/routes/(app)/system/settings/users/create/+page.svelte:222`
- `src/routes/welcome/+page.svelte:247`

### Phase 3 — HIGH: Reactivity correctness (`prefer-svelte-reactivity`)
**Goal:** Fix the 40 `svelte/prefer-svelte-reactivity` errors.  
**Critical distinction:**
- **FALSE POSITIVE** — local `Map`/`Set` temporaries created inside `$effect` and assigned wholesale to `$state`. Leave them as plain `Map`/`Set` and suppress the lint line with a comment, OR restructure the code so the linter is not triggered.
- **TRUE POSITIVE** — `Map`/`Set` stored in `$state` and mutated in place with `.set()`, `.delete()`, `.add()`. Replace with `SvelteMap` / `SvelteSet` from `svelte/reactivity` and adjust access code.

**Audit checklist per file:**
1. `src/lib/components/entity-list-table/composables/useClientSelection.svelte.ts` (4)
2. `src/lib/components/entity-list-table/composables/useColumnOrder.svelte.ts` (3)
3. `src/lib/components/entity-list-table/composables/useExport.svelte.ts` (5)
4. `src/lib/components/entity-list-table/composables/useRowRangeSelection.svelte.ts` (5)
5. `src/lib/components/entity-list-table/composables/useSheetPanels.svelte.ts` (3)
6. `src/lib/components/entity-list-table/composables/useStickyColumns.svelte.ts` (2)
7. `src/lib/components/entity-list-table/EntityListTable.svelte` (1)
8. `src/lib/components/ui/dynamic-icon/DynamicIcon.svelte` (1)
9. `src/lib/components/ui/sortable/sortable.svelte` (2)
10. `src/lib/composables/useEntityMetadata.svelte.ts` (3)
11. `src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte` (1)
12. `src/lib/services-store.svelte.ts` (2)
13. Route pages (7 across customers, orgs, roles, users)

**Recommended pattern for true positives:**
```ts
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

const _state = $state({
  selectedKeys: new SvelteSet<string>(),
  rowByKey: new SvelteMap<string, Row>(),
});

_state.selectedKeys.add(key);   // now reactive
_state.rowByKey.set(k, row);    // now reactive
```

**Recommended suppression for false positives:**
```ts
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local temporary, assigned wholesale to state
const next = new Map<string, T>();
```

### Phase 4 — HIGH: `{#each}` keys and snippet correctness
**Goal:** Fix `svelte/require-each-key` (35) and `svelte/no-useless-children-snippet` (18).  
**Why together:** both are Svelte template-level issues in components/panels and benefit from manual DOM review.

**`require-each-key` strategy:**
- For arrays of primitives/objects with a unique id: add `(id)`.
- For arrays of strings where the string is unique: use `(code)`.
- For arrays of UI-only repeated elements with no stable id: use `(index)` explicitly to signal intent if a real id does not exist; note Svelte warns against index keys, but it is still better than no key when no stable id exists.
- For `date-wheel-picker.svelte` (10 occurrences): the picker wheels iterate over numeric ranges; use the value itself as the key.

**`no-useless-children-snippet` strategy:**
- Replace `{#snippet children()}{:else}{/snippet}` or explicit `children` snippets with direct child content when the component accepts children.
- Verify the parent component actually uses `children` vs a named snippet; some `bits-ui` / shadcn components require named snippets (`child`, `trigger`, etc.).

### Phase 5 — HIGH: Error preservation and reactive-state migration
**Goal:** Fix the remaining HIGH-impact errors that are small in count but real in defect.

1. **`preserve-caught-error` (4):**
   ```ts
   } catch (err) {
     throw new Error('descriptive message', { cause: err });
   }
   ```
   Files: `src/e2e/global.setup.ts` (3), `src/lib/api.ts:231`.

2. **`svelte/no-immutable-reactive-statements` (`LangSelect.svelte:24`):**
   Convert to `$derived`:
   ```svelte
   const sortedLangs = $derived(orderLangEntriesByBrowser(
     LANGS,
     browser && typeof navigator !== 'undefined' ? navigator.languages : null
   ));
   const current = $derived(LANGS.find((l) => l.code === $uiLang) ?? LANGS[0]);
   ```

3. **`svelte/prefer-writable-derived` (`anchor-tabs-mode-switch.svelte:23`):**
   Refactor the `$state` + `$effect` pair to a writable `$derived` or `$derived.by` pattern. Consult `svelte-autofixer` MCP before committing.

4. **`svelte/no-unused-props` (2):**
   Determine if `focusedRowIndex` in `previewPanel` / `previewPanel.state` should be consumed by keyboard navigation. If it is a planned but unimplemented feature, wire it in; if it is dead, remove the prop.

5. **`no-useless-assignment` true positives (2):**
   - `date-wheel-picker.svelte:26` (`timezone` unused): remove or use the value.
   - `color-picker.svelte:140` (`s` unused): remove or use the value.

### Phase 6 — WARN cleanup, part A: False positives and stale suppressions
**Goal:** Knock out low-risk errors and remove noise so the remaining work is visible.

1. `svelte/no-unused-svelte-ignore` (4) — remove stale `svelte-ignore` comments in `EntityListTable.svelte`.
2. `@typescript-eslint/no-unused-expressions` (1) — add `eslint-disable` comment with reflow explanation in `sortable.svelte:107`.
3. `no-empty` (2) — add comments inside the `sessionStorage` catch blocks in `organizations/+page.svelte`.
4. `no-useless-assignment` false positive (1) — add `eslint-disable` comment for `$bindable` in `sidebar-trigger.svelte:10`.
5. `prefer-const` (1) and `no-unassigned-vars` (1) — mechanical fix.
6. `svelte/no-useless-mustaches` (13) — remove unnecessary mustaches.
7. `svelte/prefer-derived-over-derived-by` (18) — replace `$derived.by(() => simpleExpr)` with `$derived(simpleExpr)`.

### Phase 7 — WARN cleanup, part B: `no-unused-vars` and dead code
**Goal:** Resolve the 219 `no-unused-vars` errors.  
**Strategy:**
- Run `pnpm run lint:fix` and see how many it resolves automatically (likely imports and simple variables).
- For remaining cases:
  - Unused imports → delete.
  - Unused destructured props / function params → rename to `_` prefix or remove.
  - Assigned-but-never-read variables → **do not delete blindly**. Inspect whether the variable was supposed to be used (HIGH risk). Examples flagged:
    - `EntityListTable.svelte`: `viewVisibility`, `scrollPreservation`, `filterPersistence`
    - `date-wheel-picker.svelte`: `timeFormatter`
    - `badge.ts`: `cn`, `bg`, `text`, `darkBg`, `darkText`
    - `AppTopbar.svelte`: `uiLang`, `ThumbsUp`, `Trash2`, `XIcon`, `errorTagBadgeClass`, `impactToAlertVariant`, `impactIcon`
- Files with the most `no-unused-vars` should be handled individually: `profile/+page.svelte` (20), `EntityListTable.svelte` (11), `AppTopbar.svelte` (7), `PreviewPanel.svelte` (10), `FiltersPanel.svelte` (both copies, ~13-15 each).

### Phase 8 — Type safety debt: `@typescript-eslint/no-explicit-any` (261 warnings)
**Goal:** Remove or justify all `any` usage.  
**Why last:** this is the largest category and is already `warn`. It should not block the gate, but cleaning it improves maintainability.  
**Strategy per group:**
1. **Entity-list table core (`types.ts`, `click-handlers.ts`, `sorting.ts`, `composables/*.svelte.ts`, `components/*.svelte`)** — define proper generic `T extends { id?: string; uuid?: string }` or use `unknown` + narrowing. The entity row type should be `unknown` or a generic parameter passed through `$props`.
2. **`src/lib/api.ts:188`** — replace `any` with the actual API error type.
3. **Auth components (`LoginForm`, `MfaChallenge`, `PasskeyButton`)** — type the superforms data object explicitly.
4. **`app-errors.ts`** — the RFC7807 error payload can be `unknown` with a validator or typed as `ProblemDetails`.
5. **Snippets / children of generic components** — use Svelte's `Snippet<[T]>` generic where appropriate.
6. For cases where `any` is truly unavoidable (e.g. dynamic JSON from a third-party module), add a targeted `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a comment.

### Phase 9 — Enable `pnpm lint` as a gate and final verification
**Goal:** Make the lint command clean and enforce it.  
**Steps:**
1. Run `pnpm run lint` and confirm **0 errors, 0 warnings**.
2. Run `pnpm run check` and confirm **0 errors** (the 2 existing a11y warnings should be fixed or explicitly addressed).
3. Run `NODE_ENV=production pnpm run build` and confirm it still succeeds.
4. Run `pnpm run test` (unit) and `pnpm run test:e2e` if feasible.
5. Optionally update CI (`.github/workflows` or platform config) to run `pnpm lint` on PR. **Do not modify CI without explicit user approval.**

---

## 5. File-level hot spots (top 30 by error count)

| Errors | Warnings | File | Main rules |
|---|---|---|---| --- |
| 24 | 0 | `src/routes/(app)/system/settings/profile/+page.svelte` | `no-unused-vars` |
| 16 | 0 | `src/lib/components/entity-list-table/EntityListTable.svelte` | `no-unused-vars`, `prefer-svelte-reactivity`, `unused-svelte-ignore` |
| 14 | 15 | `src/lib/entity-list/sheets/panels/FiltersPanel.svelte` | `no-unused-vars`, `no-explicit-any` |
| 13 | 0 | `src/lib/components/entity-list-table/panels/PreviewPanel.svelte` | `no-unused-vars`, `require-each-key` |
| 13 | 0 | `src/lib/components/date-dropper/date-wheel-picker.svelte` | `require-each-key`, `no-useless-assignment`, `no-unused-vars` |
| 12 | 0 | `src/lib/components/entity-list-table/toolbar/SelectionCounter.svelte` | `no-useless-mustaches` |
| 11 | 6 | `src/routes/(app)/customers/+page.svelte` | `no-unused-vars`, `no-explicit-any`, `prefer-svelte-reactivity` |
| 10 | 6 | `src/routes/(app)/system/settings/users/+page.svelte` | `no-unused-vars`, `no-explicit-any` |
| 9 | 0 | `src/routes/(app)/system/settings/organizations/create/+page.svelte` | `no-unused-vars`, `no-navigation-without-resolve` |
| 9 | 0 | `src/routes/(app)/system/settings/organizations/[uuid]/+page.svelte` | `no-unused-vars` |
| 9 | 6 | `src/routes/(app)/system/settings/users/create/+page.svelte` | `no-unused-vars`, `no-explicit-any` |
| 8 | 6 | `src/routes/(app)/system/settings/roles/+page.svelte` | `no-unused-vars`, `no-explicit-any`, `no-navigation-without-resolve`, `no-empty` |
| 8 | 1 | `src/lib/components/entity-list-table/cards/CardField.svelte` | `no-unused-vars` |
| 7 | 1 | `src/lib/components/FormPageLayout.svelte` | `prefer-derived-over-derived-by` |
| 7 | 4 | `src/routes/(app)/system/settings/users/[uuid]/+page.svelte` | `no-unused-vars`, `no-explicit-any` |
| 7 | 0 | `src/lib/components/entity-list-table/panels/ColumnSelectorPanel.svelte` | `no-useless-children-snippet`, `no-unused-vars` |
| 7 | 0 | `src/lib/entity-list/sheets/panels/ColumnsPanel.svelte` | `no-useless-children-snippet`, `no-unused-vars` |
| 7 | 6 | `src/routes/(app)/system/settings/organizations/+page.svelte` | `no-unused-vars`, `no-empty` |
| 7 | 0 | `src/lib/components/AppTopbar.svelte` | `no-unused-vars` |
| 6 | 0 | `src/lib/components/entity-list-table/dialogs/HtmlExportDialog.svelte` | `no-unused-vars` |
| 6 | 2 | `src/lib/components/entity-list-table/composables/useExport.svelte.ts` | `prefer-svelte-reactivity`, `no-explicit-any`, `no-unused-vars` |
| 5 | 0 | `src/lib/colors/badge.ts` | `no-unused-vars` |
| 5 | 1 | `src/lib/components/entity-list-table/components/TableRow.svelte` | `no-unused-vars`, `require-each-key`, `no-unused-props` |
| 5 | 4 | `src/lib/components/ui/rfc-error-dialog.svelte` | `no-explicit-any`, `no-at-html-tags` |
| 5 | 0 | `src/lib/components/entity-list-table/composables/useRowRangeSelection.svelte.ts` | `prefer-svelte-reactivity`, `no-unused-vars` |
| 5 | 0 | `src/routes/welcome/+page.svelte` | `no-unused-vars`, `no-navigation-without-resolve` |
| 5 | 0 | `src/routes/(app)/system/settings/roles/[uuid]/+page.svelte` | `no-unused-vars`, `no-navigation-without-resolve` |
| 4 | 0 | `src/routes/login/+page.svelte` | `no-unused-vars` |
| 4 | 0 | `src/routes/(app)/system/settings/roles/create/+page.svelte` | `no-unused-vars`, `no-navigation-without-resolve` |

---

## 6. Sequencing rationale

1. **Security first (`{@html}`)** — the only CRITICAL tier. Cannot enable ESLint while XSS risk is un-audited.
2. **Navigation next** — real functional defect, small file surface, easy to verify by clicking through the app.
3. **Reactivity after navigation** — the entity list table is the most complex area; fixing navigation first reduces the risk of testing in a broken-routing state.
4. **Template keys + snippets** — tightly coupled to rendering; must be verified visually.
5. **Remaining HIGH errors** — small count, high defect, done before bulk cleanup.
6. **False positives / style / unused-vars** — safe bulk cleanup, but `no-unused-vars` is split: assigned-but-unused is reviewed as HIGH, pure dead code as WARN.
7. **`no-explicit-any` last** — large volume, already `warn`, and should not gate the initial enforcement of ESLint.
8. **Gate last** — only enable after `pnpm lint` is clean.

---

## 7. Tooling and verification commands

After each phase, run:

```bash
# Targeted lint for the changed files
cd D:\git\primebrick\primebrick-fe-v3
npx eslint <changed-files>

# Full project lint after a phase completes
pnpm run lint

# Type and Svelte check
pnpm run check

# Production build
$env:NODE_ENV='production'; pnpm run build
```

For Svelte-specific refactors, always pass the proposed component to `svelte-autofixer` (Svelte MCP) before writing to disk, per `AGENTS.md`.

---

## 8. Risks and dependencies

| Risk | Mitigation |
|---|---|
| `prefer-svelte-reactivity` false positives cause unnecessary refactors | Audit each `Map`/`Set` usage; suppress false positives instead of converting. |
| `no-unused-vars` deletes a variable that was intended to be used | For assigned-but-never-read variables, inspect call sites and git history before deleting. |
| `no-explicit-any` refactor changes runtime behavior | Use `unknown` + narrowing; add runtime checks where the original code relied on `any` duck typing. |
| Changing `goto` to `resolve` breaks navigation | Test every route file that was modified; verify with and without a base path. |
| `SvelteMap`/`SvelteSet` substitution changes iteration order or spread behavior | `SvelteMap`/`SvelteSet` are drop-in for `Map`/`Set` but run getters as effects; test selections, filters, and column ordering. |
| `{#each}` keys use `index` for non-stable lists | Only use `(index)` when no stable id exists; document the decision in the plan update if needed. |
| Large `any` cleanup creates merge conflicts | Do it in one final phase or split by feature area; avoid mixing with unrelated refactors. |

---

## 9. Acceptance criteria

- [ ] `pnpm run lint` exits with **0 errors, 0 warnings**.
- [ ] `pnpm run check` exits with **0 errors**.
- [ ] `NODE_ENV=production pnpm run build` still succeeds.
- [ ] `pnpm run test` (unit) still passes.
- [ ] Manual click-through of navigation in the dev server confirms no 404s after `resolve()` changes.
- [ ] Entity list table selection, filtering, and column ordering still work after `SvelteMap`/`SvelteSet` changes.
- [ ] `{@html}` call sites are documented as safe or replaced with sanitized rendering.
- [ ] No new `any` is introduced; existing `any` is either removed or has an explicit `eslint-disable` justification.

---

## 10. Appendix — raw data location

- `D:\git\primebrick\temp\eslint-output.txt` — full `pnpm lint` output.
- `D:\git\primebrick\temp\eslint-entries.json` — parsed 641 lint entries (file, line, column, severity, message, rule) suitable for further scripting.
- `D:\git\primebrick\primebrick-fe-v3\eslint.config.js` — current ESLint config.
- `D:\git\primebrick\primebrick-fe-v3\svelte.config.js` — current Svelte config (production `state_referenced_locally` escalation already present).

*Plan generated by Devin (SWE-1.7 Max) on 2026-07-23.*
