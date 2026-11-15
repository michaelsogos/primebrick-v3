# Vendor-plane unification — one sanctioned surface per library for host + remote

> Spin-off of `doc-audit-repair.md` (tranche 3, task 30b). Trigger: a real
> `export *` ambiguity bug (`clsx`/`tailwind-merge` `ClassValue`) in
> `src/lib/dev/host-env.ts` exposed that the vendor library plane is a
> **shared contract** living in the wrong place. Decision after design
> discussion: **per-library sanctioned subpaths** — one lib = one file = one
> subpath = one vendor bundle. Collisions become structurally impossible and
> remote modules fetch only the plane slices they declare.

## Status: 🟢 DONE — Plan date: 2026-10-22 21:00 UTC / 23:00 CEST — Updated: 2026-10-23 (task 14 eseguito come move, non alias; D4 reversal confermata dall'utente)

| # | Task (detail level) | Status | When | Notes |
|---|---------------------|--------|------|-------|
| 1 | `@primebrick/ui` restructure: `src/lib/vendor/{clsx,tailwind-merge,tailwind-variants,lucide,bits-ui}.ts` — each `export * from '<lib>'`; exports `./vendor/<lib>`; dist rebuilt | ✅ done | 23:00 | aggregates never shipped; single-source per file |
| 2 | `@primebrick/core`: 5 `…/vendor/*` specifiers + `VENDOR_BLOCKED_PACKAGES` += the 5 packages (raw imports now `reject`, not `bundle`); **scope grew**: `svelte/{events,reactivity,store,attachments}` + `svelte/internal/flags/legacy` added — required by the wrapped graph (bits-ui→toolbelt→`svelte/attachments`; compiler emits `flags/legacy`) | ✅ done | 23:05 | 26/26 tests; `svelte/elements` excluded — types-only, no runtime export |
| 3 | FE vendor build: 5 entries + 4 svelte-subpath entries; **bonus fixes**: `output.paths` rewrite (svelte.js's own clsx dep re-emits as the sanctioned specifier — one instance, no extra map entry); `vendorExternalAudit` plugin (every emitted external ⊆ allowlist — caught the clsx/svelte-subpath/flags-legacy chain); exact-match regex aliases (prefix alias broke `./vendor/*` exports resolution); public svelte subpaths → own files (`get`/`derived` collide with internal signal API — union file cannot hold both, shared internals dedupe via `shared-*` chunks) | ✅ done | 23:15 | 21 files emitted, manifest 18 specifiers with real pkg versions |
| 4 | `src/app.html` importmap: all 18 specifiers synced with the emitted manifest | ✅ done | 23:16 | |
| 5 | host-env shims — **superseded by better**: vendor re-exports REMOVED entirely (dead surface — remote code hits `mode:'bare'` → importmap); `host-env-bits.ts` DELETED; `runtime-source-loader` drops lucide/bits-ui/icon-proxy branches and now THROWS on `VENDOR_BLOCKED_PACKAGES` raw imports (dev loader mirrors the remote-build contract) | ✅ done | 23:20 | |
| 6 | Codemod lucide: 176 icon imports → `import { Pascal } from '@primebrick/ui/vendor/lucide'` across the repo | ✅ done | 23:20 | |
| 7 | Codemod tailwind-variants + clsx + tailwind-merge + bits-ui: all `src/` files — specifier swap only | ✅ done | 23:20 | |
| 8 | **D4 REVERSED in execution — CONFIRMED by user 2026-10-23** — vendored `components/ui/` internals WERE migrated to the sanctioned subpath: keeping raw imports would (a) reopen a lint hole, (b) keep a second bits-ui instance inside the host realm. User doctrine: future shadcn/registry syncs are manual ops anyway (most components are wrapped/customized), done point-in-time with the import adjustments needed — diffability is not a goal | ✅ done | 23:20 | user-confirmed; D4 superseded |
| 9 | `cn` consolidation: implementazioni identiche verificate — `$lib/utils.ts` ora re-exporta `cn` + i 4 utility types da `@primebrick/ui` (barrel/alias; path `$lib/utils` preservato per consumer e vendored components); canonical vive solo in ui | ✅ done | 23:30 | `pnpm check` FE 0 errori |
| 10 | Enforcement: eslint `no-restricted-imports` — `paths` exact-name ban + `patterns` subpath ban for the 6 packages (gitignore name-matching required the split — bare-name patterns would also match the sanctioned specifier's last segment); verified empirically: 4/4 raw forms rejected, sanctioned subpath clean; `vendor/` exempt from `svelte/no-svelte-internal` (internals are its job) | ✅ done | 23:22 | mirrors `resolveVendorSpecifier` remote-side |
| 11 | FE deps on the 5 packages STAY — `DynamicIcon.svelte` physically globs `/node_modules/@lucide/svelte/dist/icons/*` (Vite-only host component, already `VITE_ONLY`-flagged); document so nobody removes them | ✅ done | — | documented here; flag for future DynamicIcon review |
| 12 | Docs: `docs/ai/icon-conventions.md` + `.devin/rules/icon-conventions.md` + `docs/ai/sheets.md` updated to sanctioned subpath; core contract comment updated (svelte multi-file exception) | ✅ done | 23:23 | dev-guide mdx refresh rides on the next extraction |
| 13 | Verification: `vendor:build` clean ✓; `check` fe+ui+core 0 errors ✓; FE vitest 463/463 ✓; core vitest 26/26 ✓; eslint enforcement probe ✓; **`/dev/rc` browser verification DONE** — dev server esistente riusato (PID 90028, porta 5173): probe trivial `MOUNTED ✓` (`@primebrick/ui/vendor/lucide` → import map), ScoreGauge `MOUNTED ✓`, **real `/ai` +page.svelte: 38 moduli compilati a runtime, `MOUNTED ✓`** — grafo reale risolve `vendor/lucide`, `vendor/tailwind-variants`, `vendor/bits-ui` via import map; console: zero errori moduli/import-map (solo 401 sessione + 503 backend noti + 404 speculativi `.svelte.ts` del source loader, by design) | ✅ done | 23:45 | server non killato/riavviato per dev-server rule |
| 14 | Transformers aligned under `./vendor/` — **MOVE, not alias** (user: root specifier was a refactoring leftover): ui export `./transformers`→`./vendor/transformers` + wrapper file → `src/lib/vendor/`; core specifier + test; FE vendor entry + emitted `vendor-transformers.js` + importmap + consumers (ai-worker, semantic-scorer) + eslint msgs + smart-components rule. Root specifier deleted — one spelling | ✅ done | 2026-10-23 | ui `9cae4f3` · core `f7385cd` · fe `0f0e075`; core 9/9, check 0 err, vendor:build clean |

---

## The problem

### What actually broke

`src/lib/dev/host-env.ts` (the dev-shim the runtime-source-loader maps bare
specifiers to) contained four `export *` lines — `clsx` + `tailwind-merge`
both export `ClassValue` → TS ambiguity error. The file already split
`bits-ui` into `host-env-bits.ts` for the lucide↔bits-ui name collision
(`Calendar`/`Command`/`Ellipsis`) — but the *type-level* collision slipped
through. First full `pnpm run check` after the file was created caught it.

### The deeper problem — aggregated barrel files are collision-prone BY DESIGN

The first fix (moving the barrel to `@primebrick/ui/vendor.ts`) relocated
the problem, didn't eliminate it: **any module doing `export *` of multiple
libraries can collide** — today `ClassValue`, tomorrow the next shared name.
The real question was where the vendor plane contract should live and in
what shape.

## Chosen model — per-library subpaths (design evolution)

| Iteration | Shape | Verdict |
|---|---|---|
| v1 | `vendor.ts` aggregate `export *` (clsx+tm+tv+lucide) + `vendor-bits.ts` | works but relocates collisions + needs disambiguation lines — **rejected** |
| v2 | `export * as ns` namespaces (lucide/bits only) | zero collisions, but forces `lucide.Ellipsis` call-site rewrites + asymmetric marker — **superseded** |
| **v3 — CHOSEN** | **one lib = one `.ts` = one subpath** (`@primebrick/ui/vendor/<lib>`) | collisions structurally impossible; consumer-side `as` aliases resolve name dup at the correct layer; matches the `@primebrick/ui/transformers` precedent exactly |

```ts
// @primebrick/ui/vendor/lucide  →  src/lib/vendor/lucide.ts
export * from '@lucide/svelte';

// consumer (host AND remote — identical contract):
import { Ellipsis } from '@primebrick/ui/vendor/lucide';
import { Ellipsis as BitsEllipsis } from '@primebrick/ui/vendor/bits-ui';
```

### Why this is strictly better

1. **Collisions die by construction** — `ClassValue` (clsx vs tm) and
   `Calendar`/`Ellipsis` (lucide vs bits-ui) live in different modules. No
   disambiguation lines anywhere in the package.
2. **Disambiguation returns to the consumer** — `import { X as Y }` is the
   native JS mechanism for name duplication; the producer stops deciding
   which `Ellipsis` "wins".
3. **Granularity for `vendor_requires`** — a remote needing only clsx
   downloads `vendor-clsx.js`, not a 1500-icon lucide bundle. Per-lib
   bundles make the handshake finer-grained — remote loading in the best
   way (the actual motivation).
4. **Matches the established precedent** — `@primebrick/ui/transformers`
   is already one-lib-one-subpath; the plane becomes uniform, not a
   deviation.
5. **The dev shim shrinks** — remote code importing
   `@primebrick/ui/vendor/*` hits `resolveSpecifier` → `@primebrick/*` →
   `mode: 'bare'` → specifier unchanged → **browser import map** (works for
   blob: modules, dev + prod identically). host-env remains only for
   legacy raw-spec authoring.
6. **Ergonomic flat imports everywhere** — `import { tv }`, `import { X }`
   keep normal shapes; no member-expression rewrites.

## Counter-choices recorded

- `export * as ns` for everything — rejected: forces `clsx.clsx()` ugly
  shapes + member-expression components; namespace justified ONLY by
  collisions, and per-lib files solve those better.
- Aggregate flat barrel — rejected: relocates collisions rather than
  eliminating them.
- Named explicit export lists — rejected: ~1500 lucide exports.

## Decisions

- **D1** Per-lib subpaths (above).
- **D2** Subpath naming: `./vendor/<lib>` — prefix marks the vendor-plane
  boundary and avoids clashing with future component subpaths.
  `./transformers` initially stayed at root (shipped contract); **superseded
  2026-10-23 — moved to `./vendor/transformers`, root spelling deleted**
  (task 14, user: one uniform surface, no alias).
- **D3** `vendor.ts`/`vendor-bits.ts` deleted — replaced, not kept as
  aggregates (an aggregate re-importing the per-lib files re-creates the
  collision problem it solved).
- **D4** Vendored `components/ui/` internals keep raw imports — upstream
  registry diffability; they ARE the vendor layer's implementation.
  FE deps on the 5 packages stay for the same reason.
- **D5** host-env aggregate keeps ONE local `export type { ClassValue }`
  line — the shim is an aggregate by necessity; the exception is
  documented in-file.
- **D6** Codemod justified by contract symmetry + enforcement, not dedup —
  vendor bundles are a separate plane by design (handshake = version
  parity), app bundle keeps its own copies. No byte/dedup overclaim.

## Migration mechanics

```ts
// lucide (136 files)
import ChevronRight from '@lucide/svelte/icons/chevron-right';
  → import { ChevronRight } from '@primebrick/ui/vendor/lucide';

// tailwind-variants (13 files)
import { type VariantProps, tv } from 'tailwind-variants';
  → import { type VariantProps, tv } from '@primebrick/ui/vendor/tailwind-variants';

// bits-ui (5 files outside components/ui/)
import { X } from 'bits-ui';
  → import { X } from '@primebrick/ui/vendor/bits-ui';
```

## Acceptance criteria

1. `VENDOR_SPECIFIERS`, `VENDOR_ENTRIES`, importmap, manifest all contain
   the 5 specifiers — the existing divergence check proves contract↔build sync.
2. A remote module importing `@primebrick/ui/vendor/lucide` resolves to
   `/vendor/vendor-lucide.js` via import map (prod) and identically in dev —
   verified on `/dev/rc`.
3. Zero raw vendor-package imports in FE outside `src/lib/components/ui/`
   and `src/lib/dev/` — enforced by check-standards rule (task 10).
4. `pnpm run check` green in fe + ui + core; `pnpm vendor:build` clean.
5. Plan table updated every session.
