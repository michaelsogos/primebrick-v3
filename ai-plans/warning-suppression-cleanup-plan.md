# Plan: Warning Suppression Cleanup — Empiric Resolution Audit (v2)

## Objective

Audit every warning suppression (`eslint-disable`, `svelte-ignore`, `@ts-ignore`,
`@ts-expect-error`, `@ts-nocheck`) in the Primebrick v3 workspace (excluding
`node_modules` and `temp/`) and determine whether each one can be resolved
properly (by fixing the underlying code) rather than being silenced with a
comment. This is the revised plan after deep empirical re-analysis.

## Scope

Repositories scanned:
- `primebrick-be-v3/src`
- `primebrick-fe-v3/src`
- `primebrick-us-v3` (excluding node_modules)
- `primebrick-v3-sdk` (excluding node_modules)
- `primebrick-dal-v3` (excluding node_modules)

Total suppressions found in project source (excluding node_modules): **9**

| # | Repo | File | Line | Suppression |
|---|------|------|------|-------------|
| 1 | BE | `src/modules/auth/express-augmentation.ts` | 11 | `eslint-disable @typescript-eslint/no-namespace` |
| 2 | FE | `src/lib/utils.ts` | 8 | `eslint-disable @typescript-eslint/no-explicit-any` |
| 3 | FE | `src/lib/utils.ts` | 10 | `eslint-disable @typescript-eslint/no-explicit-any` |
| 4 | FE | `src/lib/components/ui/copy-button/copy-button.svelte` | 46 | `svelte-ignore state_referenced_locally` |
| 5 | FE | `src/lib/components/ui/copy-button/copy-button.svelte` | 72 | `eslint-disable-line @typescript-eslint/no-explicit-any` |
| 6 | FE | `src/lib/components/entity-list-table/EntityListTable.svelte` | 343 | `svelte-ignore state_referenced_locally` |
| 7 | FE | `src/lib/components/entity-list-table/EntityListTable.svelte` | 357 | `svelte-ignore state_referenced_locally` |
| 8 | FE | `src/lib/components/entity-list-table/EntityListTable.svelte` | 359 | `svelte-ignore state_referenced_locally` |
| 9 | FE | `src/lib/components/entity-list-table/EntityListTable.svelte` | 361 | `svelte-ignore state_referenced_locally` |

---

## Per-Suppression Verdict (Empiric)

### 1. BE — `express-augmentation.ts:11` — `@typescript-eslint/no-namespace`

**Verdict: LEGITIMATE — KEEP the suppression.**

Express type augmentation REQUIRES `declare global { namespace Express { ... } }`.
This is the official, documented pattern from `@types/express` for adding
properties to `Express.Request`. There is no alternative that avoids `namespace`.
The `no-namespace` rule is correct for application code, but this file is a
type-augmentation side-effect import — the namespace is mandatory.

**Action:** No code change. Add an explanatory comment above the suppression:
```ts
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express type augmentation requires namespace Express (official @types/express pattern)
  namespace Express {
```

---

### 2-3. FE — `utils.ts:8,10` — `@typescript-eslint/no-explicit-any`

**Current code:**
```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
```

**Empiric findings:**
- These types are imported by **28 UI component files** (accordion, checkbox,
  dialog, dropdown-menu, sheet, switch, textarea, etc.) via `import { type WithoutChild } from "$lib/utils.js"`.
- They are LOCAL copies of bits-ui utility types (bits-ui has its own
  `WithoutChild`/`WithoutChildren` exported separately).
- In a conditional type constraint `T extends { child?: X }`, the type of `X`
  only needs to match structural presence. `unknown` is assignable from
  everything, so `T extends { child?: unknown }` behaves identically to
  `T extends { child?: any }` for the matching purpose.
- `Omit<T, 'child'>` is unaffected — it operates on `T`, not on `X`.

**User decision: CHANGE and verify with `pnpm run check`.**

**Action:**
```ts
export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, 'child'> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, 'children'> : T;
```
Remove both `eslint-disable` comments. Run `pnpm run check` to verify no type
regressions across the 28 consumers. Revert if any errors.

---

### 4. FE — `copy-button.svelte:46` — `svelte-ignore state_referenced_locally`

**Current code:**
```svelte
// svelte-ignore state_referenced_locally
if (size === 'icon' && children) {
  size = 'default';
}
```
And in template (line 67): `{size}`

**Empiric findings:**
- `size` is a prop destructured from `$props()`. Reassigning it triggers
  `state_referenced_locally` because the prop is reactive state being mutated.
- The mutation is used to adjust the default size when children are present.
- The correct Svelte 5 pattern is to derive an effective value rather than
  mutate the prop.

**Verdict: RESOLVABLE — use `$derived`.**

**Action:**
Replace lines 45-49 with:
```svelte
// Effective size: if the user passes children, use 'default' instead of 'icon'
const effectiveSize = $derived(
  size === 'icon' && children ? 'default' : size
);
```
Replace `{size}` in the template (line 67) with `{effectiveSize}`.
Remove the `svelte-ignore` comment.

---

### 5. FE — `copy-button.svelte:72` — `@typescript-eslint/no-explicit-any`

**Current code:**
```svelte
{...merged as /* eslint-disable-line @typescript-eslint/no-explicit-any */ any}
```

**Empiric findings:**
- `mergeProps` is imported from `bits-ui` which re-exports from `svelte-toolbelt`.
- `mergeProps` return type: `UnionToIntersection<TupleTypes<T>> & { style?: string }`
  — a complex generic intersection type that doesn't cleanly match `ButtonProps`.
- `mergeProps` COMPOSES event handlers: if `rest` contains `onclick`, both the
  consumer's handler and the copy-button's handler run. This is intentional
  behavior we must preserve.
- The `as any` is needed because TypeScript can't verify the intersection type
  against `ButtonProps` for the spread.

**User decision: Cast to `Record<string, unknown>`.**

**Action:**
```svelte
{...merged as Record<string, unknown>}
```
Remove the `eslint-disable-line` comment. This satisfies `no-explicit-any` while
keeping `mergeProps` handler composition behavior. Run `pnpm run check` to verify
the spread is accepted by `<Button>`.

---

### 6-9. FE — `EntityListTable.svelte:343,357,359,361` — `svelte-ignore state_referenced_locally`

**Current code (lines 340-362):**
```ts
const rowRangeSelection = useRowRangeSelection({
  rowSelectionEnabled: () => rowSelectionEnabled,
  selectedKeys: () => selectedKeys,
  // svelte-ignore state_referenced_locally
  onSelectedKeysChange,           // <-- raw prop, line 343
  viewRows: () => viewRows,
  ...
});

const filterPersistence = useFilterPersistence({
  uid: () => uid,
  // svelte-ignore state_referenced_locally
  filterValuesStorageKey,         // <-- raw prop, line 357
  // svelte-ignore state_referenced_locally
  advancedFiltersStorageKey,      // <-- raw prop, line 359
  // svelte-ignore state_referenced_locally
  columnOrderStorageKey           // <-- raw prop, line 361
});
```

**Empiric findings (CRITICAL — first plan was wrong):**

1. **`useRowRangeSelection` signature (line 7 of composable):**
   ```ts
   onSelectedKeysChange: (keys: string[]) => void;  // DIRECT function, NOT getter
   ```
   Internal usage (line 89): `options.onSelectedKeysChange([...next])`

2. **`useFilterPersistence` signature (lines 5-7 of composable):**
   ```ts
   filterValuesStorageKey?: string;      // DIRECT value, NOT getter
   advancedFiltersStorageKey?: string;   // DIRECT value, NOT getter
   columnOrderStorageKey?: string;       // DIRECT value, NOT getter
   ```
   Internal usage in `$derived` (lines 9-14):
   ```ts
   const filterValuesStorageKeyFull = $derived(
     options.filterValuesStorageKey || (options.columnOrderStorageKey ? `${options.columnOrderStorageKey}:filterValues` : ...)
   );
   ```
   And in `readFilterValues`/`writeFilterValues` (lines 18, 32, 42, 56).

3. **Established pattern in sibling composables:**
   - `useKeyboardNavigation` (line 7): `onSelectedKeysChange: () => (keys: string[]) => void;` — GETTER
   - `createSelectionHandlers` (line 3): `getOnSelectedKeysChange: () => (keys: string[]) => void;` — GETTER
   - Call sites in EntityListTable (lines 469, 479): `() => onSelectedKeysChange` — already using getter pattern

4. **Latent reactivity bug in `useFilterPersistence`:**
   The `$derived` at lines 9-14 reads `options.filterValuesStorageKey` directly.
   Since it's a direct value (not a getter), the `$derived` captures a static
   value and will NOT re-run if the parent's `filterValuesStorageKey` prop changes.
   Changing to getter pattern FIXES this bug.

5. **Both composables have only ONE caller** (`EntityListTable.svelte`), so
   signature changes are low-risk and isolated.

**User decision: Change to getter pattern.**

**Action — Step A: `useRowRangeSelection.svelte.ts`**

Change signature (line 7):
```ts
// Before:
onSelectedKeysChange: (keys: string[]) => void;
// After:
onSelectedKeysChange: () => (keys: string[]) => void;
```

Change internal call (line 89):
```ts
// Before:
options.onSelectedKeysChange([...next]);
// After:
options.onSelectedKeysChange()([...next]);
```

**Action — Step B: `useFilterPersistence.svelte.ts`**

Change signature (lines 5-7):
```ts
// Before:
filterValuesStorageKey?: string;
advancedFiltersStorageKey?: string;
columnOrderStorageKey?: string;
// After:
filterValuesStorageKey?: () => string;
advancedFiltersStorageKey?: () => string;
columnOrderStorageKey?: () => string;
```

Change `$derived` reads (lines 9-14):
```ts
// Before:
const filterValuesStorageKeyFull = $derived(
  options.filterValuesStorageKey || (options.columnOrderStorageKey ? `${options.columnOrderStorageKey}:filterValues` : `pb.entityList:${options.uid()}:filterValues`)
);
const advancedFiltersStorageKeyFull = $derived(
  options.advancedFiltersStorageKey || (options.columnOrderStorageKey ? `${options.columnOrderStorageKey}:advancedFilters` : `pb.entityList:${options.uid()}:advancedFilters`)
);
// After:
const filterValuesStorageKeyFull = $derived(
  options.filterValuesStorageKey?.() || (options.columnOrderStorageKey ? `${options.columnOrderStorageKey?.()}:filterValues` : `pb.entityList:${options.uid()}:filterValues`)
);
const advancedFiltersStorageKeyFull = $derived(
  options.advancedFiltersStorageKey?.() || (options.columnOrderStorageKey ? `${options.columnOrderStorageKey?.()}:advancedFilters` : `pb.entityList:${options.uid()}:advancedFilters`)
);
```

Change guard checks in `readFilterValues`/`writeFilterValues`/`readAdvancedFilters`/`writeAdvancedFilters` (lines 18, 32, 42, 56):
```ts
// Before:
if (!options.filterValuesStorageKey && !options.columnOrderStorageKey) return {};
// After:
if (!options.filterValuesStorageKey?.() && !options.columnOrderStorageKey?.()) return {};
```
Apply the same `?.()` pattern to all 4 guard checks.

**Action — Step C: `EntityListTable.svelte` call sites**

Wrap the 4 raw props in `() =>` and remove all 4 `svelte-ignore` comments:
```ts
const rowRangeSelection = useRowRangeSelection({
  rowSelectionEnabled: () => rowSelectionEnabled,
  selectedKeys: () => selectedKeys,
  onSelectedKeysChange: () => onSelectedKeysChange,   // <-- wrapped, no svelte-ignore
  viewRows: () => viewRows,
  ...
});

const filterPersistence = useFilterPersistence({
  uid: () => uid,
  filterValuesStorageKey: () => filterValuesStorageKey,       // <-- wrapped, no svelte-ignore
  advancedFiltersStorageKey: () => advancedFiltersStorageKey, // <-- wrapped, no svelte-ignore
  columnOrderStorageKey: () => columnOrderStorageKey          // <-- wrapped, no svelte-ignore
});
```

---

## Summary Table

| # | File | Line | Verdict | Action |
|---|------|------|---------|--------|
| 1 | `express-augmentation.ts` | 11 | KEEP | Add explanatory comment to suppression |
| 2 | `utils.ts` | 8 | FIX | `any` → `unknown`, remove comment |
| 3 | `utils.ts` | 10 | FIX | `any` → `unknown`, remove comment |
| 4 | `copy-button.svelte` | 46 | FIX | Use `$derived` for effective size |
| 5 | `copy-button.svelte` | 72 | FIX | Cast to `Record<string, unknown>` |
| 6 | `EntityListTable.svelte` | 343 | FIX | Wrap `onSelectedKeysChange` in `() =>` + composable sig change |
| 7 | `EntityListTable.svelte` | 357 | FIX | Wrap `filterValuesStorageKey` in `() =>` + composable sig change |
| 8 | `EntityListTable.svelte` | 359 | FIX | Wrap `advancedFiltersStorageKey` in `() =>` + composable sig change |
| 9 | `EntityListTable.svelte` | 361 | FIX | Wrap `columnOrderStorageKey` in `() =>` + composable sig change |

**Result: 8 of 9 suppressions resolvable. 1 legitimate (Express namespace).**

## Signature changes authorized

This plan explicitly authorizes the following signature changes (per
code-guardrails rule "Do not alter existing function signatures... unless
explicitly authorized in the approved Markdown plan"):

1. `useRowRangeSelection.svelte.ts`: `onSelectedKeysChange` param type
   `(keys: string[]) => void` → `() => (keys: string[]) => void`
2. `useFilterPersistence.svelte.ts`: `filterValuesStorageKey`, `advancedFiltersStorageKey`,
   `columnOrderStorageKey` param types `string` → `() => string`

Both changes align with the established getter pattern in sibling composables
(`useKeyboardNavigation`, `createSelectionHandlers`) and fix a latent
reactivity bug in `useFilterPersistence`.

## Execution Order (Atomic — per code-guardrails "Atomic Commits/Changes")

### Phase 1: `utils.ts` (2 suppressions)
1. Replace `any` → `unknown` on lines 9 and 11
2. Remove both `eslint-disable` comments
3. Run `pnpm run check` in `primebrick-fe-v3`
4. If errors → revert, report to user

### Phase 2: `copy-button.svelte` (2 suppressions)
1. Replace `size` mutation with `effectiveSize` `$derived` (line 46)
2. Replace `{size}` with `{effectiveSize}` in template (line 67)
3. Remove `svelte-ignore` comment (line 46)
4. Replace `as ... any` with `as Record<string, unknown>` (line 72)
5. Remove `eslint-disable-line` comment (line 72)
6. Run `pnpm run check` in `primebrick-fe-v3`
7. If errors → revert, report to user

### Phase 3: Composable signatures + EntityListTable (4 suppressions)
1. Update `useRowRangeSelection.svelte.ts` signature + internal call
2. Update `useFilterPersistence.svelte.ts` signature + internal reads (4 `$derived` + 4 guards)
3. Update `EntityListTable.svelte` call sites: wrap 4 props in `() =>`, remove 4 `svelte-ignore` comments
4. Run `pnpm run check` in `primebrick-fe-v3`
5. If errors → revert, report to user

### Phase 4: `express-augmentation.ts` (1 suppression — keep)
1. Add explanatory comment to the existing `eslint-disable` line
2. Run `pnpm run build` in `primebrick-be-v3`
3. If errors → revert comment, report to user

## Acceptance Criteria

- [ ] `pnpm run check` passes in `primebrick-fe-v3` with zero new errors after each phase
- [ ] `pnpm run build` passes in `primebrick-be-v3` after Phase 4
- [ ] `grep -r "eslint-disable\|svelte-ignore\|@ts-ignore" --include="*.ts" --include="*.svelte" primebrick-fe-v3/src primebrick-be-v3/src` returns only the 1 legitimate `no-namespace` suppression in `express-augmentation.ts`
- [ ] No new `any` types introduced
- [ ] `useRowRangeSelection` and `useFilterPersistence` signatures match the getter pattern used by `useKeyboardNavigation` and `createSelectionHandlers`
- [ ] `useFilterPersistence` `$derived` re-runs when storage key props change (reactivity bug fixed)
- [ ] `copy-button.svelte` preserves `mergeProps` event handler composition behavior
