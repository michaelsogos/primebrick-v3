# Plan: Warning Suppression Cleanup — Empiric Resolution Audit

## Objective

Audit every warning suppression (`eslint-disable`, `svelte-ignore`, `@ts-ignore`,
`@ts-expect-error`, `@ts-nocheck`) in the Primebrick v3 workspace (excluding
`node_modules` and `temp/`) and determine whether each one can be resolved
properly (by fixing the underlying code) rather than being silenced with a
comment. Then provide a concrete, file-by-file action plan.

## Scope

Repositories scanned:
- `primebrick-be-v3/src`
- `primebrick-fe-v3/src`
- `primebrick-us-v3` (excluding node_modules)
- `primebrick-v3-sdk` (excluding node_modules)
- `primebrick-dal-v3` (excluding node_modules)

Total suppressions found in project source (excluding node_modules): **8**

| Repo | File | Line | Suppression | Count |
|------|------|------|-------------|-------|
| BE | `src/modules/auth/express-augmentation.ts` | 11 | `eslint-disable @typescript-eslint/no-namespace` | 1 |
| FE | `src/lib/utils.ts` | 8, 10 | `eslint-disable @typescript-eslint/no-explicit-any` | 2 |
| FE | `src/lib/components/ui/copy-button/copy-button.svelte` | 46 | `svelte-ignore state_referenced_locally` | 1 |
| FE | `src/lib/components/ui/copy-button/copy-button.svelte` | 72 | `eslint-disable-line @typescript-eslint/no-explicit-any` | 1 |
| FE | `src/lib/components/entity-list-table/EntityListTable.svelte` | 326, 340, 342, 344 | `svelte-ignore state_referenced_locally` | 4 |

## Per-Suppression Verdict

### 1. BE — `express-augmentation.ts:11` — `@typescript-eslint/no-namespace`

**Code:**
```ts
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      rawAccessToken?: string;
    }
  }
}
```

**Verdict: LEGITIMATE — KEEP the suppression.**

Express type augmentation REQUIRES `declare global { namespace Express { ... } }`.
This is the official, documented pattern from `@types/express` for adding
properties to `Express.Request`. There is no alternative that avoids `namespace`.
The `no-namespace` rule is correct for application code, but this file is a
type-augmentation side-effect import — the namespace is mandatory.

**Action:** No change. Document in a comment that this is an intentional,
framework-required suppression.

---

### 2. FE — `utils.ts:8,10` — `@typescript-eslint/no-explicit-any`

**Code:**
```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
```

**Verdict: RESOLVABLE — replace `any` with `unknown`.**

In a conditional type `T extends { child?: X }`, the type of `X` only needs to
match the shape's presence — it does not need to be `any`. Using `unknown` is
stricter and achieves the same detection: `T extends { child?: unknown }` will
still match any object that has an optional `child` property regardless of its
value type.

These types originate from bits-ui/shadcn-svelte utility patterns but are local
copies — we can safely tighten them.

**Action:**
```ts
export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, 'child'> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, 'children'> : T;
```
Remove both `eslint-disable` comments. Run `pnpm run check` to verify no type
regressions in components consuming these types.

---

### 3. FE — `copy-button.svelte:46` — `svelte-ignore state_referenced_locally`

**Code:**
```svelte
// svelte-ignore state_referenced_locally
if (size === 'icon' && children) {
  size = 'default';
}
```

**Verdict: RESOLVABLE — use a `$derived` instead of mutating a prop.**

The warning fires because `size` is a prop (reactive state) and it is being
reassigned locally. The correct Svelte 5 pattern is to derive an effective
value rather than mutate the prop:

**Action:**
```svelte
const effectiveSize = $derived(
  size === 'icon' && children ? 'default' : size
);
```
Then replace `{size}` in the template (line 67) with `{effectiveSize}`.
Remove the `svelte-ignore` comment.

---

### 4. FE — `copy-button.svelte:72` — `@typescript-eslint/no-explicit-any`

**Code:**
```svelte
{...merged as /* eslint-disable-line @typescript-eslint/no-explicit-any */ any}
```

**Verdict: RESOLVABLE — cast to a stricter type.**

`mergeProps` from bits-ui returns a complex merged type that doesn't perfectly
match `ButtonProps`. Instead of `any`, cast to `Record<string, unknown>` (safe
for spread) or to the specific props interface.

**Action (preferred):**
```svelte
{...merged as Record<string, unknown>}
```
If that causes a type error on `<Button>`, use:
```svelte
{...merged as Partial<import('svelte/elements').HTMLButtonAttributes>}
```
Remove the `eslint-disable-line` comment. Run `pnpm run check` to verify.

---

### 5. FE — `EntityListTable.svelte:326,340,342,344` — `svelte-ignore state_referenced_locally`

**Code (lines 323-346):**
```ts
const rowRangeSelection = useRowRangeSelection({
  rowSelectionEnabled: () => rowSelectionEnabled,
  selectedKeys: () => selectedKeys,
  // svelte-ignore state_referenced_locally
  onSelectedKeysChange,   // <-- raw prop, not wrapped
  viewRows: () => viewRows,
  ...
});

const filterPersistence = useFilterPersistence({
  uid: () => uid,
  // svelte-ignore state_referenced_locally
  filterValuesStorageKey,      // <-- raw prop
  // svelte-ignore state_referenced_locally
  advancedFiltersStorageKey,   // <-- raw prop
  // svelte-ignore state_referenced_locally
  columnOrderStorageKey        // <-- raw prop
});
```

**Verdict: RESOLVABLE — wrap in `() =>` like all sibling props.**

Every other prop in these composable config objects is wrapped in `() => x`
to maintain reactivity. These 4 are passed raw, triggering the
`state_referenced_locally` warning. The fix is mechanical and consistent
with the existing pattern in the same object.

**Action:**
```ts
const rowRangeSelection = useRowRangeSelection({
  rowSelectionEnabled: () => rowSelectionEnabled,
  selectedKeys: () => selectedKeys,
  onSelectedKeysChange: () => onSelectedKeysChange,
  viewRows: () => viewRows,
  ...
});

const filterPersistence = useFilterPersistence({
  uid: () => uid,
  filterValuesStorageKey: () => filterValuesStorageKey,
  advancedFiltersStorageKey: () => advancedFiltersStorageKey,
  columnOrderStorageKey: () => columnOrderStorageKey
});
```
Remove all 4 `svelte-ignore` comments.

**IMPORTANT:** Verify that the composable signatures accept `() => T` for these
parameters. If a composable expects a direct value (not a getter), the wrapper
will cause a type error — in that case the composable must be updated to accept
a getter, matching the pattern of its sibling parameters.

---

## Summary Table

| # | File | Line | Current | Verdict | Action |
|---|------|------|---------|---------|--------|
| 1 | `express-augmentation.ts` | 11 | `eslint-disable no-namespace` | KEEP | Framework-required, add explanatory comment |
| 2 | `utils.ts` | 8 | `eslint-disable no-explicit-any` | FIX | `any` → `unknown`, remove comment |
| 3 | `utils.ts` | 10 | `eslint-disable no-explicit-any` | FIX | `any` → `unknown`, remove comment |
| 4 | `copy-button.svelte` | 46 | `svelte-ignore state_referenced_locally` | FIX | Use `$derived` for effective size |
| 5 | `copy-button.svelte` | 72 | `eslint-disable-line no-explicit-any` | FIX | Cast to `Record<string, unknown>` |
| 6 | `EntityListTable.svelte` | 326 | `svelte-ignore state_referenced_locally` | FIX | Wrap `onSelectedKeysChange` in `() =>` |
| 7 | `EntityListTable.svelte` | 340 | `svelte-ignore state_referenced_locally` | FIX | Wrap `filterValuesStorageKey` in `() =>` |
| 8 | `EntityListTable.svelte` | 342 | `svelte-ignore state_referenced_locally` | FIX | Wrap `advancedFiltersStorageKey` in `() =>` |
| 9 | `EntityListTable.svelte` | 344 | `svelte-ignore state_referenced_locally` | FIX | Wrap `columnOrderStorageKey` in `() =>` |

**Result: 8 of 9 suppressions resolvable. 1 legitimate (Express namespace).**

## Execution Order (Atomic)

1. **`utils.ts`** — replace `any` → `unknown` (2 comments). Run `pnpm run check`.
2. **`copy-button.svelte`** — fix `state_referenced_locally` + `any` cast (2 comments). Run `pnpm run check`.
3. **`EntityListTable.svelte`** — wrap 4 raw props in `() =>` (4 comments). Run `pnpm run check`.
4. **`express-augmentation.ts`** — add explanatory comment, keep suppression. Run `pnpm run build` (BE).

## Acceptance Criteria

- [ ] `pnpm run check` passes in `primebrick-fe-v3` with zero new errors
- [ ] `pnpm run build` passes in `primebrick-be-v3`
- [ ] `grep -r "eslint-disable\|svelte-ignore\|@ts-ignore" --include="*.ts" --include="*.svelte" primebrick-fe-v3/src primebrick-be-v3/src` returns only the 1 legitimate `no-namespace` suppression in `express-augmentation.ts`
- [ ] No new `any` types introduced
- [ ] No composable signature changes unless the composable already uses getter pattern for siblings
