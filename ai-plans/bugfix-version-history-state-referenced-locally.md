# Plan: Elevate `state_referenced_locally` to Error + Introduce `eslint-plugin-svelte`

## Part 0 — Svelte MCP Validation (Empirical Proof)

### 0.1 Svelte MCP Tools Available

The Svelte MCP server exposes **5 tools** (not 2 as initially assumed):

| Tool | Purpose |
|------|---------|
| `list-sections` | Lists all Svelte 5 / SvelteKit documentation sections |
| `get-documentation` | Retrieves full documentation for one or more sections |
| `svelte-autofixer` | Given a Svelte component, returns issues + suggestions. **MUST be used before writing Svelte code to files.** |
| `playground-link` | Generates a Svelte Playground link from code |
| `playground-link-ui` | UI variant of playground-link |

### 0.2 Autofixer Validation of the Bugfix

I passed both the buggy and fixed versions of the `VersionHistoryPanel` script to the
`svelte-autofixer` MCP tool (using a minimal reproduction that preserves the exact
reactive pattern).

**Buggy code** (`const i18nEntity = translationKey ?? entity;`):
```json
{
  "issues": [
    "This reference only captures the initial value of `translationKey`. ... at line 17, column 21",
    "This reference only captures the initial value of `entity`. ... at line 17, column 39"
  ],
  "suggestions": [
    "You are calling the function `loadData` inside an $effect. Please check if the function is reassigning a stateful variable..."
  ]
}
```

**Fixed code** (`const i18nEntity = $derived(translationKey ?? entity);`):
```json
{
  "issues": [],
  "suggestions": [
    "You are calling the function `loadData` inside an $effect. Please check if the function is reassigning a stateful variable..."
  ]
}
```

**Conclusion**: The autofixer confirms the fix resolves both `state_referenced_locally`
issues. The remaining suggestion about `$effect` + `loadData` is a general best-practice
note, not an error — the actual component's `$effect(() => { loadVersionHistory(); })`
is a valid mount-time data loading pattern.

### 0.3 Authoritative Documentation Pulled via MCP

I used `get-documentation` to pull the official Svelte 5 docs for:
- `$state` — including "Passing state into functions" (explains WHY `state_referenced_locally`
  happens: JavaScript is pass-by-value, so reading a reactive variable at top level captures
  the current value, not a reference)
- `$derived` — including `$derived.by` and "Overriding derived values"
- `$effect` — including the critical "When not to use `$effect`" section (use `$derived`
  instead of `$effect` for computed state)
- `$bindable` — two-way binding
- `$props` — including "Updating props" and fallback values
- `cli/eslint` — official Svelte CLI approach: `npx sv add eslint` installs
  `eslint-plugin-svelte` + creates `eslint.config.js`

### 0.4 MCP Tool Usage Rule (NEW — Must Be Persisted)

The `svelte-autofixer` tool description states: *"This tool MUST be used whenever the
user is asking to write svelte code before sending the code back to the user."*

This means the Devin workflow rule must be updated to require:
1. **Before writing any `.svelte` file**: pass the proposed code to `svelte-autofixer`
   via the Svelte MCP. Fix any `issues` returned before writing to disk.
2. **After writing any `.svelte` file**: the dev server HMR + `svelte.config.js` `onwarn`
   handler (Part A) provide the runtime enforcement layer.
3. **For documentation**: use `get-documentation` to pull authoritative Svelte docs
   instead of relying on web search or memory.

---

## Part A — Elevate `state_referenced_locally` to a Build-Breaking Error

### A.1 Empirical Evidence

The Svelte 5 compiler emits `state_referenced_locally` as a **warning**, not an error.
Today the project has **zero enforcement**: `svelte.config.js` has no `onwarn` handler
at all, and `svelte-check` (the `pnpm run check` command) does **not** surface Svelte
compiler warnings — it only does TypeScript type-checking. The warning is visible only
in the Vite dev server / build output, where it scrolls by and is ignored.

Current `svelte.config.js` (full file):

```js
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};

export default config;
```

No `onwarn`, no `compilerOptions`, no warning filtering.

### A.2 How Svelte Warning Escalation Works

From the `vite-plugin-svelte` docs (pulled empirically from
`github.com/sveltejs/vite-plugin-svelte/blob/main/docs/config.md`):

```js
// svelte.config.js
export default {
  onwarn: (warning, defaultHandler) => {
    // To suppress: return without calling defaultHandler
    // To escalate: throw instead of calling defaultHandler
    if (warning.code === 'state_referenced_locally') {
      throw new Error(
        `[svelte] state_referenced_locally in ${warning.filename}:${warning.line}:${warning.column}\n` +
        warning.message
      );
    }
    defaultHandler(warning);
  }
};
```

**Key design decision: dev vs. build behavior.**

- During **`vite build`** (production): throwing from `onwarn` fails the build → the
  CI/release pipeline cannot ship a silent reactivity bug.
- During **`vite dev`** (HMR): throwing from `onwarn` would crash the dev server on
  every file save that has the warning, destroying the developer's HMR loop.

The correct approach is to **throw only during build**, warn during dev. Vite's
`defineConfig` receives `{ mode }` where `mode === 'production'` for `vite build` and
`mode === 'development'` for `vite dev`. But `svelte.config.js` does not receive the
Vite mode — it is a static config file loaded by `@sveltejs/vite-plugin-svelte`.

**Solution**: Check `process.env.NODE_ENV` or a custom env var inside `onwarn`.
During `vite build`, Vite sets `process.env.NODE_ENV = 'production'`. During
`vite dev`, it is `'development'`.

Proposed `svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  onwarn(warning, defaultHandler) {
    // Elevate state_referenced_locally to a build-breaking error in production.
    // In dev, it remains a warning so HMR is not disrupted.
    if (warning.code === 'state_referenced_locally' && process.env.NODE_ENV === 'production') {
      throw new Error(
        `\n[svelte] state_referenced_locally (treated as error in production builds)\n` +
        `  File: ${warning.filename}:${warning.line}:${warning.column}\n` +
        `  ${warning.message}\n` +
        `  Fix: wrap the reactive read in $derived() or a closure.\n` +
        `  See: https://svelte.dev/e/state_referenced_locally\n`
      );
    }
    defaultHandler(warning);
  },
  kit: {
    adapter: adapter()
  }
};

export default config;
```

### A.3 Existing `svelte-ignore` Suppressions (Audit)

Before elevating, we must verify that existing `<!-- svelte-ignore state_referenced_locally -->`
suppressions are legitimate and won't break the build. Empirical grep results:

| File | Line | Context | Legitimate? |
|------|------|---------|-------------|
| `EntityListTable.svelte` | 343 | `onSelectedKeysChange` passed to `useRowRangeSelection` — the prop is a callback, not a reactive read. The ignore is correct: passing a function reference does not snapshot a value. | ✅ Yes |
| `EntityListTable.svelte` | 357-362 | `filterValuesStorageKey`, `advancedFiltersStorageKey`, `columnOrderStorageKey` passed to `useFilterPersistence` — these are string storage keys that do not change after mount. The ignore is acceptable but could be wrapped in `() => key` for future-proofing. | ⚠️ Acceptable, could be improved |
| `copy-button.svelte` | 46 | `if (size === 'icon' && children) { size = 'default'; }` — reassigning a prop for default sizing. This is the Svelte-documented pattern for prop mutation. | ✅ Yes |

**Conclusion**: No existing suppression will break the build. The `EntityListTable.svelte`
lines 357-362 could be improved in a follow-up by wrapping in thunks (`() => filterValuesStorageKey`),
but they are not blocking.

### A.4 The Bugfix Itself

The original one-line fix from the first plan:

```svelte
// VersionHistoryPanel.svelte line 40
// BEFORE:
const i18nEntity = translationKey ?? entity;
// AFTER:
const i18nEntity = $derived(translationKey ?? entity);
```

This must be applied **before** elevating the warning to an error, otherwise the build
will fail immediately.

### A.5 Verification Plan for Part A

1. Apply the one-line fix to `VersionHistoryPanel.svelte`.
2. Add the `onwarn` handler to `svelte.config.js`.
3. Run `pnpm run build` — must succeed with zero `state_referenced_locally` errors.
4. Run `pnpm run dev` (only if no server is on port 5173, per dev-server rule) —
   verify the warning still shows in dev (not as a crash).
5. Temporarily revert the fix and run `pnpm run build` — must **fail** with the
   `state_referenced_locally` error. Then re-apply the fix.

---

## Part B — Introduce `eslint-plugin-svelte`

### B.1 Empirical Evidence: Current Linting State

- **No ESLint config exists**: no `eslint.config.*`, no `.eslintrc*` file in the repo.
- **No ESLint dependency**: `eslint`, `eslint-plugin-svelte`, `typescript-eslint`,
  `@eslint/js`, `globals` are all absent from `package.json`.
- **No ESLint scripts**: `package.json` scripts are `dev`, `build`, `check`, `test`,
  `test:e2e`, `test:a11y`, `extract-docs` — no `lint` script.
- **Existing `eslint-disable` comments**: 3 files have `eslint-disable` comments
  (`copy-button.svelte`, `utils.ts`) — these are **vestigial** from a previous ESLint
  setup that was removed. They are harmless but indicate the project once had ESLint.
- **No Prettier**: no `.prettierrc`, no `prettier` in `package.json`. The project does
  not use Prettier, so we do NOT need the `svelte.configs.prettier` config.
- **No CI**: the repo has no GitHub Actions workflows (`.github/` contains only
  `copilot-instructions.md`). Per `AGENTS.md`, deployment is GitFlow-based with no
  auto-deploy CI.

### B.2 Critical Finding: ESLint Cannot Catch `state_referenced_locally`

I verified empirically by reading the `eslint-plugin-svelte` rule list and the
`no-reactive-reassign` rule source code:

- `svelte/no-reactive-reassign` — the closest rule — has this condition in its source:
  ```ts
  conditions: [
    { svelteVersions: ['3/4'] },
    { svelteVersions: ['5'], runes: [false, 'undetermined'] }
  ]
  ```
  It only fires in **Svelte 3/4** or **Svelte 5 non-runes (legacy `$:`) mode**.
  This project uses Svelte 5 runes mode exclusively, so this rule **never fires**.
- There is **no** `eslint-plugin-svelte` rule that detects the
  `state_referenced_locally` pattern (snapshotting a reactive prop/state in a
  top-level `const`).

**Conclusion**: `eslint-plugin-svelte` is valuable for the broader Svelte-specific
linting it provides (a11y, best practices, possible errors), but it **cannot** enforce
`state_referenced_locally`. That enforcement must come from Part A (`svelte.config.js`
`onwarn`). The two parts are complementary, not overlapping.

### B.3 What `eslint-plugin-svelte` DOES Provide (Value Justification)

From the official rule list (pulled from `sveltejs.github.io/eslint-plugin-svelte/rules/`),
the `recommended` config includes rules that catch real bugs the project currently has
no protection against:

**Possible Errors (catches real bugs):**
- `svelte/no-dom-manipulating` — disallows DOM manipulation in components
- `svelte/no-dupe-else-if-blocks` — duplicate conditions in `{#if}/{:else if}` chains
- `svelte/no-dupe-on-directives` — duplicate `on:` directives
- `svelte/no-dupe-style-properties` — duplicate style properties
- `svelte/no-not-function-handler` — non-function event handlers
- `svelte/no-object-in-text-mustaches` — objects in `{obj}` text interpolation
- `svelte/no-reactive-reassign` — (legacy mode only, but still useful if any legacy code exists)
- `svelte/no-store-async` — async/await in stores (breaks auto-unsubscribe)
- `svelte/no-unknown-style-directive-property` — unknown `style:property`

**Best Practices:**
- `svelte/no-dom-manipulating` — prevents direct DOM manipulation
- `svelte/prefer-svelte-reactivity` — use `SvelteMap`/`SvelteSet` instead of `Map`/`Set`
- `svelte/infinite-reactive-loop` — detects reactive infinite loops

**Stylistic / a11y:**
- `svelte/no-trailing-spaces` — trailing whitespace
- `svelte/prefer-derived-over-derived-by` — auto-fixable: use `$derived()` when
  `$derived.by()` is unnecessary (aligns with AGENTS.md rule #3)

### B.4 Version Selection (7-Day Rule Compliance)

Per the project's package-versioning rule (fixed versions only) and the global
"avoid newly published versions" rule (7-day minimum), I verified publish dates
empirically via `pnpm view <pkg> time --json`:

| Package | Latest | Published | Selected | Published | Safe? |
|---------|--------|-----------|----------|-----------|-------|
| `eslint` | 10.7.0 | 2026-07-10 (13d) | `10.7.0` | 2026-07-10 | ✅ |
| `eslint-plugin-svelte` | 3.22.0 | 2026-07-20 (3d) | `3.20.0` | 2026-06-26 (27d) | ✅ |
| `svelte-eslint-parser` | 1.8.0 | 2026-06-04 (49d) | (transitive via plugin) | — | ✅ |
| `typescript-eslint` | 8.65.0 | 2026-07-20 (3d) | `8.64.0` | 2026-07-13 (10d) | ✅ |
| `@eslint/js` | 10.0.1 | 2026-02-06 | `10.0.1` | 2026-02-06 | ✅ |
| `globals` | 17.7.0 | 2026-06-22 (31d) | `17.7.0` | 2026-06-22 | ✅ |

**Note**: `eslint-plugin-svelte@3.20.0` depends on `svelte-eslint-parser@^1.7.0`, which
will resolve to `1.8.0` (published 2026-06-04, 49 days old — safe). We do not need to
pin `svelte-eslint-parser` explicitly; it is a transitive dependency.

### B.5 Proposed `eslint.config.js`

The project is TypeScript + SvelteKit + Svelte 5 runes mode, no Prettier.

```js
// eslint.config.js
import svelteConfig from './svelte.config.js';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    // Project-specific rule overrides
    rules: {
      // Align with AGENTS.md: prefer $derived() over $derived.by() when possible
      'svelte/prefer-derived-over-derived-by': 'error',
      // Keep existing vestigial eslint-disable comments valid
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Ignore generated/build artifacts
    ignores: [
      '.svelte-kit/**',
      'build/**',
      'dist/**',
      'coverage/**',
      'docs/user-guide/_extracted/**',
      '*.config.{js,ts}',
    ],
  },
);
```

**Note on `ts.config()`**: `typescript-eslint` exports a `config` helper that
properly handles flat config arrays with type safety. This is the recommended
approach from the `typescript-eslint` docs.

### B.6 Proposed `package.json` Changes

Add dev dependencies (all fixed versions per package-versioning rule):

```json
{
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "eslint": "10.7.0",
    "eslint-plugin-svelte": "3.20.0",
    "globals": "17.7.0",
    "typescript-eslint": "8.64.0"
  }
}
```

Add scripts:

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

### B.7 Integration into the Development Workflow

| Stage | Command | When | Behavior |
|-------|---------|------|----------|
| **Local dev (manual)** | `pnpm run lint` | Before committing | Agent runs this after code changes. Reports errors. |
| **Local dev (fix)** | `pnpm run lint:fix` | After writing code | Auto-fixes stylistic issues (`prefer-derived-over-derived-by`, etc.) |
| **Pre-commit** | (not configured) | — | The project has no pre-commit hooks today. Adding `husky` + `lint-staged` is a separate decision. |
| **Type check** | `pnpm run check` | Existing | Unchanged. `svelte-check` for TS types. Does NOT run ESLint. |
| **Build** | `pnpm run build` | Existing | `vite build` → Svelte compiler `onwarn` elevates `state_referenced_locally` to error (Part A). Does NOT run ESLint. |
| **CI** | (none today) | — | No GitHub Actions. Per `AGENTS.md`, deployment is GitFlow-based. ESLint would run locally by the developer/agent before creating a release branch. |

**Recommendation**: Add a `prebuild` lint step so `pnpm run build` also runs ESLint:

```json
{
  "scripts": {
    "prebuild": "node scripts/version-sync.mjs && eslint .",
    "build": "vite build"
  }
}
```

Wait — the existing `prebuild` already runs `version-sync.mjs`. We can chain ESLint:

```json
{
  "prebuild": "node scripts/version-sync.mjs && eslint ."
}
```

This ensures `pnpm run build` (used in release branches) fails if ESLint finds errors.
**This is the CI equivalent for a project without GitHub Actions.**

### B.8 Migration Strategy (Phased Rollout)

Introducing ESLint to a project that has never had it (or had it removed) will surface
many existing issues. A phased approach prevents a "fix 200 lint errors" blocker:

**Phase 1 — Install and configure (no enforcement)**
- Add dependencies, `eslint.config.js`, `lint`/`lint:fix` scripts.
- Run `pnpm run lint` and capture the output. Do NOT add it to `prebuild` yet.
- Categorize errors: (a) real bugs to fix immediately, (b) stylistic to auto-fix,
  (c) false positives or intentional patterns to suppress with `// eslint-disable`.

**Phase 2 — Fix real bugs and auto-fix stylistic issues**
- Run `pnpm run lint:fix` to auto-fix everything fixable.
- Manually fix the remaining real-bug category.
- Add targeted `// eslint-disable-next-line <rule>` with a comment explaining why,
  for intentional patterns.

**Phase 3 — Enforce in build**
- Add `&& eslint .` to `prebuild` in `package.json`.
- From this point, `pnpm run build` fails on ESLint errors.

**Phase 4 — Document the pattern**
- Add the ESLint rules and conventions to `docs/ai/svelte-runes.md` and
  `.devin/rules/svelte-runes.md` (from the previous plan).

### B.9 Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| ESLint surfaces 100+ existing errors, blocking all work | Phase 1 runs lint without enforcement. Categorize and fix incrementally. |
| `typescript-eslint` type-aware linting is slow (10-30s) | Use `projectService: true` (recommended by ts-eslint for speed). If still slow, fall back to `ts.configs.recommended` (non-type-aware) for Phase 1. |
| `eslint-plugin-svelte` Svelte 5 support is marked "experimental" in older READMEs | Verified: as of v3.x (2025-2026), Svelte 5 support is stable. The README warning was from the v2 era. v3.20.0 has full Svelte 5 runes support. |
| `svelte-eslint-parser` version mismatch with `eslint-plugin-svelte` | Do not pin `svelte-eslint-parser` separately. Let `eslint-plugin-svelte@3.20.0` pull its compatible `^1.7.0`. |
| Flat config syntax differs between ESLint 9 and 10 | Verified: ESLint 10 supports flat config natively (no `--eslint-config` flag needed). The `defineConfig` helper from `eslint/config` is available in ESLint 10. |
| Existing `eslint-disable` comments in `copy-button.svelte` and `utils.ts` reference rules that may not exist in the new config | These use `@typescript-eslint/no-explicit-any` which IS in `ts.configs.recommended`. They will work. |

### B.10 What ESLint Will NOT Do (Honest Limitations)

- **Cannot catch `state_referenced_locally`** — this is a Svelte compiler warning,
  not an ESLint rule. Enforcement is via Part A (`svelte.config.js` `onwarn`).
- **Cannot catch all reactivity bugs** — e.g., using `$effect` for derived state
  instead of `$derived`, or mutating props. These are architectural patterns that
  must be enforced via the Devin rule (`.devin/rules/svelte-runes.md`) and code review.
- **Cannot replace `svelte-check`** — `svelte-check` does TypeScript type-checking
  for `.svelte` files. ESLint with `typescript-eslint` does linting. They are
  complementary. Both should run.

---

## Part C — Documentation and Rule Persistence

### C.1 New File: `.devin/rules/svelte-runes.md` (Always-On Devin Rule)

Short, enforceable rule. Structure mirrors existing rules. Must include:

- **Golden Rule**: Any value computed from `$props()`, `$state`, or other reactive
  sources MUST be declared with `$derived` (or `$derived.by` for complex logic).
- **Anti-pattern** with the exact `VersionHistoryPanel` code.
- **Correct pattern**: `const i18nEntity = $derived(translationKey ?? entity);`
- **Decision table** for `$derived` vs `$derived.by` vs `$state` vs `$effect`.
- **MCP tool requirement**: Before writing any `.svelte` file, agents MUST pass the
  proposed code to the `svelte-autofixer` MCP tool and fix any `issues` returned.
  This is the first line of defense — it catches `state_referenced_locally` and other
  Svelte-specific issues before the code reaches the file system.
- **Enforcement**: agent MUST use `$derived` for any expression reading reactive
  sources; agent MUST NOT suppress `state_referenced_locally` with `svelte-ignore`
  unless the value is genuinely static (with a comment explaining why); agent MUST
  use `svelte-autofixer` before writing `.svelte` files.

### C.2 New File: `docs/ai/svelte-runes.md` (Extended Patterns Doc)

Concrete examples for every rune, with ✅/❌ blocks. All examples sourced from
official Svelte 5 documentation pulled via the Svelte MCP `get-documentation` tool.
Covers:
- `$state` — primitive, deep state, `$state.raw`, `$state.snapshot`, `$state.eager`,
  class fields, "Passing state into functions" (explains WHY `state_referenced_locally`
  happens: JavaScript pass-by-value semantics)
- `$props` — typed destructuring, defaults, renaming, rest, fallback values are NOT
  reactive, "Updating props"
- `$derived` — when to use (single expression reading reactive sources),
  `$derived.by` (loops, multiple statements), "Overriding derived values"
- `$effect` — side effects only; the critical "When not to use `$effect`" section
  (use `$derived` instead of `$effect` for computed state); dependency tracking;
  `$effect.pre`, `$effect.tracking`, `$effect.root`
- `$bindable` — two-way binding, fallback values
- `$props.id()` — unique IDs for aria attributes
- **Anti-patterns section** (4 most common Svelte 5 mistakes):
  1. `state_referenced_locally` — snapshotting props/state in a `const`
  2. Anonymous function inside `$derived(() => ...)` (already in AGENTS.md)
  3. Using `$effect` for derived state instead of `$derived`
  4. Mutating `$derived` values (pre-5.25 behavior)
- **Decision flowchart**: "I have a value that depends on other reactive values →
  `$derived` / `$derived.by`"
- **Svelte MCP workflow**: how to use `svelte-autofixer` and `get-documentation`
  during development
- **ESLint integration notes** (which rules catch what, and what they cannot catch)

### C.3 Update: `AGENTS.md` § "Svelte™ 5 & TypeScript® Mandatory Rules"

Add 6th bullet:
```markdown
6. **REACTIVITY**: Any value computed from `$props()`, `$state`, or other reactive
   sources MUST be declared with `$derived` (or `$derived.by` for complex logic).
   Never read reactive sources into a plain `const`/`let` at component top level —
   this triggers `state_referenced_locally` (elevated to a build error in production)
   and produces stale values.
   - ❌ `const i18nEntity = translationKey ?? entity;` (snapshots initial value)
   - ✅ `const i18nEntity = $derived(translationKey ?? entity);`
   - See [`.devin/rules/svelte-runes.md`](./.devin/rules/svelte-runes.md) and
     [`docs/ai/svelte-runes.md`](./docs/ai/svelte-runes.md) for the full pattern guide.
```

### C.4 Update: `docs/ai/README.md`

Add row:
```markdown
| [`svelte-runes.md`](./svelte-runes.md) | Svelte 5 runes patterns: `$derived` vs `$derived.by`, anti-patterns, `state_referenced_locally`, ESLint integration |
```

### C.5 Update: `.devin/rules/package-versioning.md` (or `AGENTS.md`)

Add the new ESLint dependencies to the "known dev dependencies" list so agents know
these are intentional, not auto-added.

---

## Execution Order

1. **Validate the fix with `svelte-autofixer`** (Part 0) — ✅ DONE. The autofixer
   confirmed the buggy code has 2 issues and the fixed code has 0 issues.
2. **Apply the one-line bugfix** to `VersionHistoryPanel.svelte` (from the original plan).
3. **Add `onwarn` to `svelte.config.js`** (Part A).
4. **Verify** `pnpm run build` succeeds (no `state_referenced_locally` errors).
5. **Install ESLint dependencies** (Part B, Phase 1).
6. **Create `eslint.config.js`** (Part B).
7. **Add `lint` / `lint:fix` scripts** to `package.json` (Part B).
8. **Run `pnpm run lint`** and capture output. Do NOT add to `prebuild` yet.
9. **Create `.devin/rules/svelte-runes.md`** (Part C) — must include the MCP
   `svelte-autofixer` usage requirement.
10. **Create `docs/ai/svelte-runes.md`** (Part C) — all examples sourced from
    official Svelte docs pulled via `get-documentation` MCP tool.
11. **Update `AGENTS.md`** with 6th bullet + MCP tool requirement (Part C).
12. **Update `docs/ai/README.md`** with new doc row (Part C).
13. **Phase 2-3** (fix lint errors, add to `prebuild`) — separate session after
    reviewing the Phase 1 lint output.

## Impacted Files

| Action | File |
|--------|------|
| Edit   | `primebrick-fe-v3/src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte` (line 40) |
| Edit   | `primebrick-fe-v3/svelte.config.js` (add `onwarn`) |
| Create | `primebrick-fe-v3/eslint.config.js` |
| Edit   | `primebrick-fe-v3/package.json` (add devDeps + scripts) |
| Create | `primebrick-fe-v3/.devin/rules/svelte-runes.md` |
| Create | `primebrick-fe-v3/docs/ai/svelte-runes.md` |
| Edit   | `primebrick-fe-v3/AGENTS.md` (add 6th bullet) |
| Edit   | `primebrick-fe-v3/docs/ai/README.md` (add table row) |

## Acceptance Criteria

1. `pnpm run build` succeeds with zero `state_referenced_locally` errors.
2. `pnpm run build` **fails** if a `state_referenced_locally` warning is introduced
   (verified by temporarily reverting the fix).
3. `pnpm run lint` runs without crashing (may report existing issues — that is
   expected in Phase 1).
4. `pnpm run check` continues to pass (no new TypeScript errors).
5. The dev server (`pnpm run dev`) is NOT disrupted — `state_referenced_locally`
   remains a warning in dev mode, not a crash.
6. The new `.devin/rules/svelte-runes.md` is loaded in every future agent session
   (always-on rule).
7. `AGENTS.md` explicitly documents the anti-pattern with ✅/❌ examples.
