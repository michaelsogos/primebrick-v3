# Plan: Dependency Upgrade — Fixed Versions, Major Bumps Analysis, Node 24 Alignment

## Date: 2026-07-11
## Status: AWAITING APPROVAL

---

## Objectives

1. **@zxcvbn-ts v3 → v4** — migrate password strength library to latest v4 in frontend
2. **dotenv v16 → v17** — update all repos that use dotenv to latest v17
3. **TypeScript v5 → v6** — deep analysis of risks for updating BE/DAL/US/SDK to TS6
4. **Vitest v2 → v4** — deep analysis of risks for updating all projects to Vitest v4
5. **Node.js v24 alignment** — ensure all projects target Node 24 consistently
6. **Express stays at v4** — no update to v5 (explicit decision)
7. **All versions pinned** — no `^`, `~`, or ranges in any `package.json`

---

## 1. @zxcvbn-ts v3 → v4 (Frontend Only)

### Current state

| Package | Current spec | Installed | Latest v3 | Latest v4 (absolute) |
|---|---|---|---|---|
| `@zxcvbn-ts/core` | `^3.0.4` | 3.0.4 | 3.0.4 | **4.1.2** |
| `@zxcvbn-ts/language-common` | `^3.0.4` | 3.0.4 | 3.0.4 | **4.1.2** |
| `@zxcvbn-ts/language-en` | `^3.0.2` | 3.0.2 | 3.0.2 | **4.1.1** |

### Files that use @zxcvbn-ts

| File | Usage |
|---|---|
| `src/lib/components/ui/password/password.svelte.ts` (lines 3, 5, 14-16, 19-28, 85) | Core logic: `zxcvbnOptions.setOptions()`, `zxcvbn()`, `ZxcvbnResult` type |
| `src/lib/components/ui/password/password-strength.svelte` (line 18) | UI: reads only `strength?.score` (0-4) |
| `src/lib/components/ui/password/types.ts` (line 9, 43) | Type: `ZxcvbnResult` for prop typing |

### API surface consumed (exhaustive)

From `@zxcvbn-ts/core`:
1. `zxcvbnOptions.setOptions(options)` — singleton config
2. `zxcvbn(password)` — returns `ZxcvbnResult`
3. `ZxcvbnResult` (type) — used for `$state` and prop typing

From `@zxcvbn-ts/language-common`:
4. `adjacencyGraphs` — keyboard adjacency graph
5. `dictionary` — common wordlist

From `@zxcvbn-ts/language-en`:
6. `translations` — English translations
7. `dictionary` — English wordlist

From the result object, only `.score` (number 0-4) is read.

**NOT used**: `crackTimesSeconds`, `crackTimesDisplay`, `feedback`, `warning`,
`suggestions`, `guesses`, `guessLog10`, `calculation`, `sequence`,
`zxcvbnAsync`, custom matchers, pwned matcher.

### v4 Breaking changes — mapped to our code

| v4 Breaking change | Affects us? | Details |
|---|---|---|
| `zxcvbnOptions.setOptions()` removed → `ZxcvbnFactory` class | **YES — rewrite needed** | `password.svelte.ts` lines 19-28 use `core.zxcvbnOptions.setOptions(...)` |
| `zxcvbn(password)` removed → `zxcvbn.check(password)` | **YES — rewrite needed** | `password.svelte.ts` line 85: `const result = zxcvbn(password)` |
| `crackTimesSeconds`/`crackTimesDisplay` → `crackTimes` | **NO** | We never read crack times — only `.score` |
| Dictionary keys changed (`commonWords` → `commonWords-en`) | **NO** | We spread `...common.dictionary, ...en.dictionary` — keys are internal |
| Distribution files `.js`→`.cjs`/`.mjs` | **NO** | ESM imports via Vite resolve correctly |
| New `wordSequences` export | **NO** | Optional — included when spreading `...dictionary` |
| New commonWords source (OpenSubtitles 2024) | **Behavioral** | Scoring may change slightly — see risk below |
| Pluralization functions in translations | **NO** | We don't display translated time estimates |

### Required code change

Only `loadZxcvbnRunner` in `password.svelte.ts` (lines 10-34) needs rewriting:

**v3 (current):**
```ts
import('@zxcvbn-ts/core'),
import('@zxcvbn-ts/language-common'),
import('@zxcvbn-ts/language-en')
  .then(([core, common, en]) => {
    core.zxcvbnOptions.setOptions({
      translations: en.translations,
      graphs: common.adjacencyGraphs,
      dictionary: { ...common.dictionary, ...en.dictionary }
    });
    return core.zxcvbn;
  });
```

**v4 (required):**
```ts
import('@zxcvbn-ts/core'),
import('@zxcvbn-ts/language-common'),
import('@zxcvbn-ts/language-en')
  .then(([core, common, en]) => {
    const zxcvbn = new core.ZxcvbnFactory({
      translations: en.translations,
      graphs: common.adjacencyGraphs,
      dictionary: { ...common.dictionary, ...en.dictionary }
    });
    return (password: string) => zxcvbn.check(password);
  });
```

The call site at line 85 (`const result = zxcvbn(password)`) stays the same
because we wrap `zxcvbn.check` in a function with the same signature.

The `ZxcvbnResult` type import stays valid — v4 still exports it.

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Scoring changes** — new wordlist (OpenSubtitles 2024 vs FrequencyWords 2018) may score passwords differently. A password that scored 3 might now score 2 or 4. | **Low-Medium** | Security improvement (more current wordlist). Test with `minScore` default (3) against sample passwords. |
| **Bundle size** — new wordlist is larger | **Low** | Lazy-loaded via dynamic `import()`, off critical path. Check chunk size after build. |
| **`ZxcvbnResult` type changes** | **Very Low** | Only `.score` is used, unchanged in v4 |

### Proposed pinned versions

```json
"@zxcvbn-ts/core": "4.1.2",
"@zxcvbn-ts/language-common": "4.1.2",
"@zxcvbn-ts/language-en": "4.1.1"
```

### Verification steps

1. `pnpm install` in workspace root
2. `pnpm run check` in frontend — verify no type errors
3. `pnpm run build` in frontend — verify build succeeds
4. `pnpm test` in frontend — verify tests pass
5. Manual test: type passwords in the password component, verify strength meter works

---

## 2. dotenv v16 → v17 (BE, DAL, emailsender)

### Current state

| Repo | Role | Current spec | Installed | Latest v16 | Latest v17 (absolute) |
|---|---|---|---|---|---|
| `primebrick-be-v3` | dependency | `^16.6.1` | 16.6.1 | 16.6.1 | **17.4.2** |
| `primebrick-dal-v3` | devDependency | `^16.6.1` | 16.6.1 | 16.6.1 | **17.4.2** |
| `primebrick-us-v3/emailsender` | dependency | `^16.4.7` | 16.6.1 | 16.6.1 | **17.4.2** |

### Usage pattern (all 19 files)

Every single usage across all repos is the same side-effect import:

```ts
import "dotenv/config";
```

**No file** imports `config` from `dotenv` directly. **No file** calls
`dotenv.config({ ... })` with options. The SDK does NOT use dotenv at all
(it reads `process.env` directly).

### v17 Breaking change analysis

From the dotenv CHANGELOG (verified via GitHub):

**v17.0.0 (2025-06-27)**:
- Default `quiet` to `false` — informational runtime log message shows by default
- This is the ONLY breaking change in v17.0.0

**v16.6.1 (2025-06-27)**:
- Default `quiet` to `true` — hiding the runtime log message
- Notice that 17.0.0 flips this default

**All v17.x patches (17.1.0 through 17.4.2)**:
- Added `DOTENV_CONFIG_QUIET=true` env var to suppress the log
- Added security tips to the runtime log
- Fixed TypeScript type definitions
- Added skills/ folder for AI agents
- No functional API changes

### Concrete impact

After upgrading to v17, every `import "dotenv/config"` will print a log
message to stdout like:

```
◇ injecting env (14) from .env
```

This is **cosmetic only**. Environment variables still load identically.
The `.env` file parsing, variable expansion, and `process.env` population
are unchanged.

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Runtime log noise** — log message appears on every startup | **Very Low** | Set `DOTENV_CONFIG_QUIET=true` in `.env` or environment, OR switch to `import { config } from "dotenv"; config({ quiet: true });` |
| **Log in production** — message appears in production logs | **Very Low** | Same mitigation. The message goes to stdout, not stderr. Most log aggregators won't flag it. |
| **No API changes** — `import "dotenv/config"` still works identically | **None** | Verified: no API changes in v17 |
| **TypeScript types** — `DotenvPopulateInput` type change in 17.2.4 | **None** | We don't use `DotenvPopulateInput` — we only use `import "dotenv/config"` |

### Proposed pinned version

```json
"dotenv": "17.4.2"
```

### Verification steps

1. `pnpm install` in workspace root
2. Start BE dev server — verify `.env` loads correctly
3. Run DAL tests — verify test DB connection works
4. Start emailsender — verify `.env` loads correctly
5. Optional: add `DOTENV_CONFIG_QUIET=true` to `.env.example` files

---

## 3. TypeScript v5 → v6 (BE, DAL, US, SDK) — DEEP ANALYSIS

### Current state

| Repo | Current spec | Installed | Latest v5 | Latest v6 (absolute) |
|---|---|---|---|---|
| `primebrick-fe-v3` | `~6.0.3` | 6.0.3 | 5.9.3 | **6.0.3** — **ALREADY ON TS6** |
| `primebrick-be-v3` | `^5.7.2` | 5.9.3 | 5.9.3 | **6.0.3** |
| `primebrick-dal-v3` | `^5.7.2` | 5.9.3 | 5.9.3 | **6.0.3** |
| `primebrick-us-v3/emailsender` | `^5.7.2` | 5.9.3 | 5.9.3 | **6.0.3** |
| `primebrick-v3-sdk` | `^5.7.2` | 5.9.3 | 5.9.3 | **6.0.3** |

**Key fact**: The frontend is ALREADY on TS 6.0.3 (installed and working).
Only BE, DAL, emailsender, and SDK need to migrate from TS 5.9.3 → 6.0.3.

### TypeScript 6.0 key facts (verified from official announcement, March 23 2026)

1. **Bridge release** — TS6 is the last release based on the current
   JavaScript codebase. TS7 (native Go port) is the next major.
2. **API compatible with TS 5.9** — TS6 maintains full API compatibility.
   Tools that `import * as ts from 'typescript'` continue to work.
3. **Deprecations are warnings, not errors** — deprecated options can be
   silenced with `"ignoreDeprecations": "6.0"`. They will be REMOVED in TS7.
4. **Decorators continue to work** — `experimentalDecorators` and
   `emitDecoratorMetadata` are NOT deprecated in TS6. They are fully
   supported. (They may be unsupported in TS7, but that's a separate concern.)
5. **Svelte/SvelteKit fully supported** — TS6 has a programmatic API,
   so `svelte-check`, `@sveltejs/kit` sync, and all Svelte tooling works.

### Peer dependency verification (all accept TS6)

| Tool | Peer dep on `typescript` | TS6 accepted? |
|---|---|---|
| `svelte-check@4.7.2` | `>=5.0.0` | **YES** |
| `@sveltejs/kit@2.69.2` | `^5.3.3 \|\| ^6.0.0` | **YES** |
| `@sveltejs/vite-plugin-svelte@7.2.0` | (no typescript peer dep) | **YES** |
| `tsx@4.22.3` | (no peer deps) | **YES** |
| `vitest@4.1.10` | (no typescript peer dep) | **YES** |

### TS6 breaking changes — mapped to our tsconfig.json files (EMPIRICAL)

Every tsconfig.json was read and every deprecated pattern was grepped
across the entire codebase. Results:

| TS6 breaking change | BE | DAL | FE | US/emailsender | SDK | Evidence |
|---|---|---|---|---|---|---|
| `strict` default `true` | Already `true` | Already `true` | Already `true` | Already `true` | Already `true` | Read all 6 tsconfig.json files |
| `target` defaults to `es2025` | Has `ES2022` | Has `ES2022` | Extended from svelte-kit | Has `ES2022` | Has `ES2022` | All have explicit `target` |
| `module` defaults to `esnext` | Has `NodeNext` | Has `NodeNext` | Extended from svelte-kit | Has `ESNext` | Has `NodeNext` | All have explicit `module` |
| `moduleResolution: node/node10` deprecated | Uses `NodeNext` | Uses `NodeNext` | Uses `bundler` | Uses `bundler` | Uses `NodeNext` | None use `node` or `node10` |
| `moduleResolution: classic` removed | Not used | Not used | Not used | Not used | Not used | Grep: no `classic` in any tsconfig |
| `baseUrl` deprecated | Not used | Not used | Not used | Not used | Not used | Grep: no `baseUrl` in any tsconfig |
| `target: es5` deprecated | Not used | Not used | Not used | Not used | Not used | All use `ES2022`+ |
| `downlevelIteration` deprecated | Not used | Not used | Not used | Not used | Not used | Grep: not in any tsconfig |
| `module: amd/umd/systemjs/none` deprecated | Not used | Not used | Not used | Not used | Not used | All use `NodeNext`/`ESNext` |
| `outFile` removed | Not used | Not used | Not used | Not used | Not used | Grep: not in any tsconfig |
| `esModuleInterop` cannot be `false` | Set to `true` | Set to `true` | Set to `true` | Set to `true` | Set to `true` | All have `esModuleInterop: true` |
| `allowSyntheticDefaultImports` cannot be `false` | Not set | Not set | Not set | Not set | Not set | None set it to `false` |
| `alwaysStrict: false` deprecated | Not set | Not set | Not set | Not set | Not set | None use it |
| `rootDir` defaults to `.` | Has `src` | Has `src` | N/A (svelte-kit) | Has `./src` | Has `src` | All have explicit `rootDir` |
| **`types` defaults to `[]`** | **NEEDS FIX** | **NEEDS FIX** | Already set | **NEEDS FIX** | **NEEDS FIX** | See below |
| **`noUncheckedSideEffectImports` default `true`** | **NEW** | **NEW** | **NEW** | **NEW** | **NEW** | See below |
| `libReplacement` default `false` | Not used | Not used | Not used | Not used | Not used | None use it |
| `import ... assert {}` deprecated | Not used | Not used | Not used | Not used | Not used | Grep: 0 matches in all `.ts` files |
| `module` keyword for namespaces deprecated | Not used | Not used | Not used | Not used | Not used | Grep: 0 matches in all `.ts` files |
| `no-default-lib` directive removed | Not used | Not used | Not used | Not used | Not used | Grep: 0 matches in all `.ts` files |
| Command-line files + tsconfig.json = error | N/A | N/A | N/A | N/A | N/A | We never run `tsc foo.ts` |

### REQUIRED FIX: `types` defaults to `[]`

In TS6, `types` defaults to `[]` (empty array). This means `@types/node`
will NOT be auto-included. Every project that relies on Node.js globals
(`process`, `Buffer`, `__dirname`, etc.) must explicitly set:

```json
"types": ["node"]
```

**Empirical evidence** — `process.*` usage in source files (grep results):

| Repo | `process.*` usages in `src/` | Needs `types: ["node"]`? |
|---|---|---|
| BE | 12 matches | **YES** |
| DAL | 2 matches | **YES** |
| SDK | 23 matches | **YES** |
| emailsender | 9 matches | **YES** |
| FE (`src/`) | 1 match (`process.exit(1)` in `hooks.server.ts`) | Already has `types` set (see below) |

**Frontend status**: The FE's main `tsconfig.json` already has
`"types": ["unplugin-icons/types/svelte"]` — this means `@types/node`
was already NOT auto-included in TS5. The `process.exit(1)` in
`hooks.server.ts` either resolves through SvelteKit's ambient types or
is a pre-existing type error that `svelte-check` tolerates. Since the FE
is already on TS6 and working, no change is needed.

**Frontend `tsconfig.node.json`**: Does NOT have `types` set. Covers
`vite.config.ts` which uses `process.cwd()`. In TS6, `types` defaults to
`[]`, so `process.cwd()` would be a type error. However, this file is
only type-checked by IDE/VS Code, not by `svelte-check` or `pnpm run
build` (Vite uses esbuild, not tsc, for `vite.config.ts`). For
correctness, add `"types": ["node"]` to `tsconfig.node.json`.

**`@types/node` installation verified** — all 4 projects have
`@types/node` in `node_modules/@types/node/`:
- BE: v24.12.4 ✓
- DAL: v24.12.4 ✓
- SDK: v24.12.4 ✓
- emailsender: v22.20.0 ✓ (will be upgraded to v24.13.3 in Phase 5)

**`@types/node` TS6 compatibility verified** — the `typesVersions` field
in `@types/node` package.json uses `<=5.6` and `<=5.7` overrides. TS6
(>5.7) uses the default `index.d.ts`, which is the most up-to-date version.
Both v24.12.4 and v22.20.0 support this.

**`@types/*` module packages NOT affected** — packages like
`@types/express`, `@types/cookie-parser`, `@types/cors`, `@types/pg`
provide module-level types resolved via imports, NOT via the `types`
field. They do NOT need to be listed in `types`. Only packages that
provide GLOBAL declarations (like `@types/node` with `process`,
`Buffer`, `__dirname`) need to be in the `types` array.

### Safe: `noUncheckedSideEffectImports` defaults to `true`

TS6 now checks that side-effect-only imports (`import "..."`) resolve to
an actual module. All side-effect imports in the codebase (grep results):

| Import | Count | Resolves to | Safe? |
|---|---|---|---|
| `import "dotenv/config"` | 15 files | `dotenv/config.js` (real module) | **YES** |
| `import "reflect-metadata"` | 8 files | `reflect-metadata/Reflect.js` (real module, ships `index.d.ts`) | **YES** |
| `import "./modules/auth/express-augmentation.js"` | 1 file (BE) | `express-augmentation.ts` (via NodeNext `.js`→`.ts` mapping) | **YES** |

All 24 side-effect imports resolve correctly. No typos, no missing modules.

### Safe: Decorators continue to work in TS6

The BE, DAL, and emailsender all use:
```json
"experimentalDecorators": true,
"emitDecoratorMetadata": true
```

These are used by the DAL's `@Entity`, `@Column`, `@Key`, `@Unique`,
`@AuditableField`, `@DeletableField` decorators and `reflect-metadata`.

**TS6 fully supports `experimentalDecorators` and `emitDecoratorMetadata`.**
These are NOT deprecated in TS6. They are only potentially unsupported in
TS7 (the native Go port). Since we are upgrading to TS6 (not TS7),
decorators continue to work exactly as in TS5.

### Safe: Express import style

The BE uses `import express, { type Response } from "express"` — default
import style. This requires `esModuleInterop: true`, which is already set
in all projects. TS6 makes `esModuleInterop: false` an error, but since
all projects have `esModuleInterop: true`, this is not a problem.

### Per-project TS6 upgrade assessment

#### Frontend (`primebrick-fe-v3`) — **ALREADY ON TS6**

- Currently has `typescript: "~6.0.3"` (installed 6.0.3)
- Already working with TS6 breaking changes
- Only change: pin `typescript: "6.0.3"` (remove `~`)
- Optional: add `"types": ["node"]` to `tsconfig.node.json` for correctness

**Recommendation**: Pin to `6.0.3`. No other changes needed.

#### Backend (`primebrick-be-v3`) — **CAN upgrade to TS6**

- Uses `experimentalDecorators` + `emitDecoratorMetadata` — **supported in TS6**
- `tsx` dev runner: OK (uses esbuild, not TS API)
- `vitest`: OK (uses Vite, not TS API)
- `tsc` build: OK (TS6 supports decorator emit)
- Must add `"types": ["node"]` to tsconfig.json

**Recommendation**: Upgrade to `6.0.3` (pinned). Add `"types": ["node"]`.

#### DAL (`primebrick-dal-v3`) — **CAN upgrade to TS6**

- Uses `experimentalDecorators` + `emitDecoratorMetadata` — **supported in TS6**
- Same situation as BE
- Must add `"types": ["node"]` to tsconfig.json

**Recommendation**: Upgrade to `6.0.3` (pinned). Add `"types": ["node"]`.

#### Emailsender (`primebrick-us-v3/emailsender`) — **CAN upgrade to TS6**

- Uses `experimentalDecorators` + `emitDecoratorMetadata` — **supported in TS6**
- Must add `"types": ["node"]` to tsconfig.json
- When Bun migration happens (future plan), switch `types` to `["bun"]`

**Recommendation**: Upgrade to `6.0.3` (pinned). Add `"types": ["node"]`.

#### SDK (`primebrick-v3-sdk`) — **CAN upgrade to TS6**

- Does NOT use decorators
- Must add `"types": ["node"]` to tsconfig.json

**Recommendation**: Upgrade to `6.0.3` (pinned). Add `"types": ["node"]`.

### tsconfig.json changes required for TS6

**For BE, DAL, SDK, emailsender** — add `"types": ["node"]`:
```json
{
  "compilerOptions": {
    "types": ["node"]
  }
}
```

**For FE `tsconfig.node.json`** — add `"types": ["node"]` (optional, for correctness):
```json
{
  "compilerOptions": {
    "types": ["node"]
  }
}
```

**For FE main `tsconfig.json`** — NO CHANGES (already has `types` set).

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `types: ["node"]` missing `@types/node` globals | **None** | `@types/node` installed in all 4 projects |
| `noUncheckedSideEffectImports` catches a typo | **None** | All 24 side-effect imports verified to resolve |
| New type errors from changed inference (`this`-less functions, generic calls) | **Very Low** | These are improvements that catch MORE bugs, not break existing code. Run `tsc` and fix any new errors. |
| Decorator emit broken | **None** | TS6 fully supports `experimentalDecorators` + `emitDecoratorMetadata` |
| Peer dep rejection | **None** | All peer deps accept TS6 (verified) |

### Verification steps

1. Pin `typescript: "6.0.3"` in BE, DAL, emailsender, SDK
2. Add `"types": ["node"]` to tsconfig.json in BE, DAL, SDK, emailsender
3. Add `"types": ["node"]` to FE's `tsconfig.node.json` (optional)
4. `pnpm install` in workspace root
5. `pnpm run build` in each project — verify compilation
6. `pnpm test` in each project — verify tests pass
7. `pnpm run check` in frontend — verify svelte-check passes

---

## 4. Vitest v2 → v4 (All Projects Except FE) — DEEP ANALYSIS

### Current state

| Repo | Current spec | Installed | Latest v2 | Latest v3 | Latest v4 (absolute) |
|---|---|---|---|---|---|
| `primebrick-fe-v3` | `^4.1.10` | 4.1.10 | 2.1.9 | 3.2.7 | **4.1.10** |
| `primebrick-be-v3` | `^2.1.0` | 2.1.9 | 2.1.9 | 3.2.7 | **4.1.10** |
| `primebrick-dal-v3` | `^2.1.0` | 2.1.9 | 2.1.9 | 3.2.7 | **4.1.10** |
| `primebrick-us-v3/emailsender` | `^2.1.0` | 2.1.9 | 2.1.9 | 3.2.7 | **4.1.10** |
| `primebrick-v3-sdk` | `^2.1.0` | 2.1.9 | 2.1.9 | 3.2.7 | **4.1.10** |

**Note**: The frontend is ALREADY on Vitest 4.1.10 (installed). The spec
says `^4.1.10` which we'll pin to `4.1.10`.

The other 4 projects are on Vitest 2.1.9 and need to jump to 4.1.10
(passing through v3 and v4 breaking changes).

### Vitest v4 prerequisites

- **Vite >= 6.0.0** — the frontend has Vite 8.1.3. BE/DAL/SDK/emailsender
  don't use Vite directly (vitest bundles its own Vite for test running).
  Vitest 4.1.10 peer dep: `vite: '^6.0.0 || ^7.0.0 || ^8.0.0'` — OK.
- **Node.js >= 20.0.0** — all projects will target Node 24 — OK.

### v2 → v3 breaking changes (verified from v3 migration guide)

| v3 breaking change | Affects us? | Details |
|---|---|---|
| Test options as 3rd argument deprecated | **NO** | No test file passes options object as 3rd arg |
| `browser.name`/`browser.providerOptions` deprecated | **NO** | No project uses browser mode |
| `spy.mockReset` restores original implementation | **YES — verify** | BE tests call `mockReset()` on mock fns — behavior changes: mock will now restore to original instead of noop |
| `vi.spyOn` reuses mock if already mocked | **Low risk** | BE/SDK tests use `vi.spyOn` — should be fine, but verify |
| Fake timers default changes | **NO** | No test uses `vi.useFakeTimers` |
| More strict error equality | **Low risk** | Check if any test compares errors with `toThrowError` |
| `module` condition export not resolved by default on Vite 6 | **NO** | Not relevant for our test configs |
| `Custom` type deprecated | **NO** | Not used |
| `onTestFinished`/`onTestFailed` receive context | **NO** | Not used |
| Snapshot API changes | **NO** | No snapshot tests found |

### v3 → v4 breaking changes (verified from v4 migration guide)

| v4 breaking change | Affects us? | Details |
|---|---|---|
| V8 coverage changes | **NO** | No project uses coverage in vitest config |
| `coverage.all` and `coverage.extensions` removed | **NO** | Not configured |
| Simplified `exclude` — no longer excludes `dist`, `cypress`, etc. | **Low risk** | BE has `dist/` — but test include is `src/**/*.test.ts` so dist is not matched. DAL has `dist/` but test include is `test/**/*.test.ts`. |
| `spyOn`/`fn` support constructors | **NO** | No test spies on constructors |
| Mocking changes — `vi.fn().getMockName()` returns `vi.fn()` not `spy` | **Low risk** | Check if any test asserts on mock names |
| `vi.restoreAllMocks` no longer resets spy state | **YES — verify** | SDK tests call `vi.restoreAllMocks()` in `afterEach` — behavior changes: only restores manually spied fns, not automocks |
| `mock.settledResults` populated immediately | **NO** | Not used |
| `vite-node` replaced with Module Runner | **NO** | Not used directly |
| `workspace` → `projects` rename | **NO** | No project uses vitest workspace |
| Browser provider rework | **NO** | No browser mode |
| Pool rework — `poolOptions` removed, `maxThreads`/`maxForks` → `maxWorkers` | **NO** | No project configures poolOptions. DAL uses `fileParallelism: false` which is still supported. |
| `singleThread`/`singleFork` → `maxWorkers: 1, isolate: false` | **NO** | Not used |

### Mocking pattern analysis (from grep of all test files)

The test files use these mocking patterns:
- `vi.mock("...", () => ({ ... }))` — module mocking
- `vi.fn()` — mock functions
- `vi.fn().mockImplementation(() => ...)` — mock implementations
- `vi.spyOn(console, "log").mockImplementation(() => undefined)` — spying
- `vi.restoreAllMocks()` — in `afterEach`
- `mockReset()` — on individual mock fns
- `mockRestore()` — on individual spies

**Affected by v3 change**: `mockReset()` on mock fns will now restore to
original implementation instead of noop. In the BE tests
(`service-lifecycle-subscriber.test.ts`, `stale-detection-job.test.ts`),
`mockReset()` is called on repo method mocks (`findByCode`, `insert`,
etc.) which were created with `vi.fn()` (not `vi.spyOn`). Since these
are standalone `vi.fn()` mocks (not spies on real objects), `mockReset()`
will reset them to a noop — same behavior as before. **No impact.**

**Affected by v4 change**: `vi.restoreAllMocks()` in SDK
`graceful-shutdown.test.ts` and `nats-client.test.ts` — will only
restore manually spied fns, not automocks. Since these tests use
`vi.spyOn()` (manual spies), this should work correctly. **No impact.**

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `mockReset` behavior change (v3) | **Very Low** | Our `vi.fn()` mocks are standalone, not spies on real objects — noop behavior preserved |
| `vi.restoreAllMocks` behavior change (v4) | **Very Low** | Our tests use `vi.spyOn` (manual spies) which are still restored |
| Simplified `exclude` (v4) | **Very Low** | Test `include` patterns are specific (`src/**/*.test.ts`, `test/**/*.test.ts`) — `dist/` won't be matched |
| Peer dependency changes | **None** | Vitest 4.1.10 accepts Vite 6/7/8 and Node 20+ — all satisfied |
| Config format changes | **None** | All vitest configs use basic `defineConfig({ test: { ... } })` — no deprecated options |

### Proposed pinned version

```json
"vitest": "4.1.10"
```

### Verification steps

1. Pin `vitest: "4.1.10"` in all 4 projects (BE, DAL, emailsender, SDK)
2. `pnpm install` in workspace root
3. `pnpm test` in each project — verify all tests pass
4. If any test fails due to mocking behavior changes, fix the test

---

## 5. Node.js v24 Alignment (All Projects)

### Current state

| Location | Current | Target |
|---|---|---|
| `primebrick-fe-v3` `@types/node` | `^24.12.4` (installed 24.13.2) | `24.13.3` (pinned) |
| `primebrick-be-v3` `@types/node` | `^24.12.4` (installed 24.13.2) | `24.13.3` (pinned) |
| `primebrick-dal-v3` `@types/node` | `^24.12.4` (installed 24.13.2) | `24.13.3` (pinned) |
| `primebrick-v3-sdk` `@types/node` | `^24.12.4` (installed 24.13.2) | `24.13.3` (pinned) |
| `primebrick-us-v3/emailsender` `@types/node` | `^22.10.2` (installed 22.20.0) | **`24.13.3`** (pinned) — MAJOR upgrade from 22 to 24 |
| `primebrick-us-v3/emailsender` Dockerfile | `node:22-alpine` | **`node:24-alpine`** |
| `.nvmrc` / `.node-version` | **None exist** | Create `.nvmrc` with `24` in workspace root |
| `engines` in `package.json` | **None set** | Add `"engines": { "node": "24" }` to all package.json files |

### Changes required

1. **emailsender `@types/node`**: Upgrade from `^22.10.2` to `24.13.3`
   (pinned). This is a 2-major jump (22 → 24). Risk is very low since
   `@types/node` only provides type definitions, and Node 24 is a
   superset of Node 22 APIs.

2. **emailsender Dockerfile**: Change `FROM node:22-alpine` to
   `FROM node:24-alpine` (both builder and production stages).

3. **All `@types/node`**: Pin to `24.13.3` (remove `^` prefix).

4. **`.nvmrc`**: Create `D:\git\primebrick\primebrick-workspace\.nvmrc`
   with content `24` — ensures all devs use the same Node version via
   nvm/fnm/volta.

5. **`engines` field**: Add to all `package.json` files:
   ```json
   "engines": { "node": "24" }
   ```
   Note: use `"24"` (not `">=24"` or `"^24"`) to match the fixed-version
   policy. This is a soft constraint — pnpm will warn but not error
   unless `engine-strict=true` is set in `.npmrc`.

6. **TS6 requires `types: ["node"]`**: TS6 defaults `types` to `[]`
   (same as TS7). This is handled in Phase 6 (TypeScript upgrade), not
   here. See Section 3 for details.

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| emailsender `@types/node` 22 → 24 | **Very Low** | Types only; Node 24 is superset of Node 22 |
| Dockerfile `node:22` → `node:24` | **Low** | Verify Docker build succeeds; verify runtime works |
| `engines` field too strict | **Very Low** | pnpm only warns by default; devs can override |

---

## 6. Express — Stays at v4 (Explicit Decision)

No changes. Express remains at `4.22.2` (pinned, no `^`).

Express 5 has breaking API changes (async handler changes, removed
middleware, changed routing) and is NOT being adopted.

---

## 7. Complete Package Version Pinning Summary

### All proposed pinned versions (no `^`, `~`, or ranges)

#### `primebrick-fe-v3`

```json
{
  "devDependencies": {
    "@iconify-json/bi": "1.2.7",
    "@iconify-json/lucide": "1.2.111",
    "@internationalized/date": "3.12.1",
    "@lucide/svelte": "1.24.0",
    "@sveltejs/adapter-auto": "7.0.1",
    "@sveltejs/kit": "2.69.2",
    "@sveltejs/vite-plugin-svelte": "7.2.0",
    "@tailwindcss/vite": "4.3.1",
    "@tsconfig/svelte": "5.0.8",
    "@types/json-bigint": "1.0.4",
    "@types/node": "24.13.3",
    "@zxcvbn-ts/core": "4.1.2",
    "@zxcvbn-ts/language-common": "4.1.2",
    "@zxcvbn-ts/language-en": "4.1.1",
    "bits-ui": "2.18.1",
    "clsx": "2.1.1",
    "jsdom": "25.0.1",
    "paneforge": "1.0.2",
    "postcss": "8.5.9",
    "runed": "0.37.1",
    "svelte": "5.56.0",
    "svelte-check": "4.7.2",
    "svelte-toolbelt": "0.10.6",
    "tailwind-merge": "3.5.0",
    "tailwind-variants": "3.2.2",
    "tailwindcss": "4.3.0",
    "tw-animate-css": "1.4.0",
    "typescript": "6.0.3",
    "unplugin-icons": "23.0.1",
    "vite": "8.1.4",
    "vitest": "4.1.10"
  },
  "dependencies": {
    "@fontsource-variable/inter": "5.2.8",
    "class-variance-authority": "0.7.1",
    "dompurify": "3.4.12",
    "flag-icons": "7.5.0",
    "formsnap": "2.0.1",
    "html2pdf.js": "0.14.0",
    "inline-css": "4.0.3",
    "json-bigint": "1.0.0",
    "shiki": "4.0.2",
    "svelte-motion": "0.12.2",
    "svelte-sonner": "1.1.1",
    "sveltekit-superforms": "2.30.1",
    "zod": "4.4.3"
  }
}
```

**Removed**: `@types/dompurify` (deprecated — dompurify ships own types)

**TS6**: Already on TS6, just pin to `"6.0.3"` (remove `~`)

#### `primebrick-be-v3`

```json
{
  "dependencies": {
    "casdoor-nodejs-sdk": "1.34.0",
    "cookie-parser": "1.4.7",
    "cors": "2.8.6",
    "dotenv": "17.4.2",
    "exceljs": "4.4.0",
    "express": "4.22.2",
    "handlebars": "4.7.9",
    "jose": "6.2.3",
    "nats": "2.29.3",
    "openid-client": "6.8.4",
    "pg": "8.21.0",
    "reflect-metadata": "0.2.2",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/cookie-parser": "1.4.10",
    "@types/cors": "2.8.17",
    "@types/express": "5.0.6",
    "@types/node": "24.13.3",
    "@types/pg": "8.11.10",
    "tsx": "4.22.3",
    "typescript": "6.0.3",
    "vitest": "4.1.10"
  }
}
```

**TS6 upgrade**: Upgrade from TS 5.9.3 → 6.0.3. Add `"types": ["node"]` to tsconfig.json.
**Decorators**: Fully supported in TS6 (`experimentalDecorators` + `emitDecoratorMetadata`).

#### `primebrick-dal-v3`

```json
{
  "dependencies": {
    "pg": "8.21.0",
    "pg-query-stream": "4.8.0",
    "reflect-metadata": "0.2.2"
  },
  "devDependencies": {
    "@types/pg": "8.11.10",
    "@types/node": "24.13.3",
    "typescript": "6.0.3",
    "vitest": "4.1.10",
    "dotenv": "17.4.2"
  }
}
```

**TS6 upgrade**: Upgrade from TS 5.9.3 → 6.0.3. Add `"types": ["node"]` to tsconfig.json.
**Decorators**: Fully supported in TS6.

#### `primebrick-us-v3/emailsender`

```json
{
  "dependencies": {
    "nats": "2.29.3",
    "pg": "8.13.1",
    "dotenv": "17.4.2",
    "reflect-metadata": "0.2.2",
    "handlebars": "4.7.9"
  },
  "devDependencies": {
    "@types/node": "24.13.3",
    "@types/pg": "8.11.10",
    "tsx": "4.19.2",
    "typescript": "6.0.3",
    "vitest": "4.1.10"
  }
}
```

**TS6 upgrade**: Upgrade from TS 5.9.3 → 6.0.3. Add `"types": ["node"]` to tsconfig.json.
**Decorators**: Fully supported in TS6.
**`@types/node`**: Upgraded from 22 to 24.
**When Bun migration happens**: Change `types` in tsconfig to `["bun"]`,
add `@types/bun` devDependency, remove `@types/node` (or keep both).

#### `primebrick-v3-sdk`

```json
{
  "dependencies": {
    "jose": "6.2.3",
    "json-bigint": "1.0.0",
    "nats": "2.29.3"
  },
  "devDependencies": {
    "@types/express": "5.0.6",
    "@types/json-bigint": "1.0.4",
    "@types/node": "24.13.3",
    "typescript": "6.0.3",
    "vitest": "4.1.10"
  }
}
```

**TS6 upgrade**: Upgrade from TS 5.9.3 → 6.0.3. Add `"types": ["node"]` to tsconfig.json.
**No decorators**: SDK does not use `experimentalDecorators`.

---

## 8. Execution Order

### Phase 1: Safe updates (no major bumps)
1. Pin all versions in all `package.json` files (remove `^`/`~`)
2. Apply safe patch/minor updates within current majors
3. Remove `@types/dompurify` from frontend
4. `pnpm install` + `pnpm test` in all projects

### Phase 2: @zxcvbn-ts v3 → v4 (frontend only)
1. Pin `@zxcvbn-ts/core: "4.1.2"`, `@zxcvbn-ts/language-common: "4.1.2"`,
   `@zxcvbn-ts/language-en: "4.1.1"`
2. Rewrite `loadZxcvbnRunner` in `password.svelte.ts`
3. `pnpm install` + `pnpm run check` + `pnpm run build` + `pnpm test`
4. Manual test: password strength meter

### Phase 3: dotenv v16 → v17 (BE, DAL, emailsender)
1. Pin `dotenv: "17.4.2"` in all 3 repos
2. `pnpm install`
3. Verify `.env` loads in each project
4. Optional: add `DOTENV_CONFIG_QUIET=true` to `.env.example` files

### Phase 4: Vitest v2 → v4 (BE, DAL, emailsender, SDK)
1. Pin `vitest: "4.1.10"` in all 4 repos
2. `pnpm install`
3. `pnpm test` in each project — fix any test failures

### Phase 5: Node.js v24 alignment
1. Pin `@types/node: "24.13.3"` in all repos (emailsender jumps from 22)
2. Update emailsender Dockerfile: `node:22-alpine` → `node:24-alpine`
3. Create `.nvmrc` with `24` in workspace root
4. Add `"engines": { "node": "24" }` to all `package.json` files
5. `pnpm install` + `pnpm test` in all projects

### Phase 6: TypeScript v5 → v6 (BE, DAL, emailsender, SDK)
1. Pin `typescript: "6.0.3"` in BE, DAL, emailsender, SDK
2. Add `"types": ["node"]` to tsconfig.json in BE, DAL, SDK, emailsender
3. Add `"types": ["node"]` to FE's `tsconfig.node.json` (optional, for correctness)
4. `pnpm install` in workspace root
5. `pnpm run build` in each project — verify compilation
6. `pnpm test` in each project — verify tests pass
7. `pnpm run check` in frontend — verify svelte-check still passes

### Phase 7: Verification
1. `pnpm install` in workspace root (clean install)
2. `pnpm test` in every project
3. `pnpm run build` in every project
4. `pnpm run check` in frontend
5. Start BE dev server — verify API works
6. Start emailsender — verify service works
7. Start frontend — verify UI works, password strength meter works

---

## 9. Deprecated Packages — Not Addressed in This Plan

| Package | Status | Action |
|---|---|---|
| `nats` 2.29.3 | Deprecated (moved to `@nats-io/transport-node`) | **Separate task** — requires API migration, not just version bump |
| `@types/dompurify` | Deprecated (dompurify ships own types) | **Remove** in Phase 1 |

---

## 10. Summary Risk Matrix

| Change | Risk | Projects | Blocking issue |
|---|---|---|---|
| Pin all versions (remove `^`/`~`) | **None** | All | None |
| `@zxcvbn-ts` v3 → v4 | **Low** | FE | Rewrite 1 function; scoring behavior change |
| `dotenv` v16 → v17 | **Very Low** | BE, DAL, US | Cosmetic log message |
| `vitest` v2 → v4 | **Low** | BE, DAL, US, SDK | Mocking behavior changes — verify tests |
| `@types/node` 22 → 24 | **Very Low** | US | Types only |
| Dockerfile node:22 → node:24 | **Low** | US | Verify Docker build |
| `typescript` v5 → v6 | **Very Low** | BE, DAL, US, SDK | Only change: add `types: ["node"]` to tsconfig. Decorators supported. All peer deps accept TS6. |
| `typescript` FE pin | **None** | FE | Already on TS6, just pin to `6.0.3` |
| Express v4 → v5 | **N/A** | BE | NOT DOING (explicit decision) |
