# Plan: be-v3 red lint (schema-honest-format) — evidence, fix, prevention

## 1. Evidence — why the gate was red and why nobody noticed

Timeline (git-verified):

| Date | Event |
|---|---|
| 2026-11-03 | `schema-honest-format` rule ships — sdk `05b8d95` (`tools/check-standards.ts`) |
| 2026-11-04 | be's `.devin/check-standards.json` last config touch — `6cdbdec` |
| 2026-11-06 | **`openapi.ts` violating fields land** — be `742e799` ("entity meta contracts, org fields + kbd legend i18n patches") |
| 2026-11-06 → today | gate silently red: **9 violations**, zero runs noticed |

Why it went unnoticed — the gate has **no mandatory trigger**:

1. `check:standards` runs ONLY inside `pnpm prebuild` (= `pnpm build`) and `pnpm test` (`be/package.json:13,15`). Both are on-demand — the dev loop (`bun --hot src/index.ts`, vite HMR) never invokes them.
2. **be-v3 has NO CI workflows** — `.github/` contains only `copilot-instructions.md`. Nothing runs the gate server-side. (sdk has `ci.yml` but it is publish-only, tag-triggered.)
3. No pre-commit hooks exist (`husky`/lefthook absent).
4. Result: from Nov 6 the gate has been red, and it only surfaces when someone happens to run `bun check-standards.ts` — which is exactly what happened during the i18n cleanup.

## 2. Why the site works anyway

`check-standards` is a **construction-quality gate, not a runtime check**. The 9 `schema-honest-format` violations are missing `format:` metadata on OpenAPI spec literals:

| File:line | Field | Missing |
|---|---|---|
| `openapi/openapi.ts:600,615` | `redirect_uris` items | `format:"uri"` |
| `:629` | `redirect_uri` | `format:"uri"` |
| `:679,774` | `created_by` | `format:"uuid"` |
| `:688,777` | `updated_by` | `format:"uuid"` |
| `:705,781` | `deleted_by` | `format:"uuid"` |

Effect: generated OpenAPI docs/clients render `string` instead of `uri`/`uuid`. The running app is byte-identical — red lint ≠ broken app, it measures contract honesty.

## 3. The fix (mechanical, ~9 literal edits)

Add `format:` to the spec field declarations in `src/openapi/openapi.ts` — `uri` on `redirect_uri(s)`, `uuid` on `created_by|updated_by|deleted_by`. Then `bun ../primebrick-v3-sdk/tools/check-standards.ts src` must report `clean`.

## 4. Proposal — how red lint becomes impossible to ignore

The gap: the gate exists but nothing forces it to be *observed*. Three layers, increasing strength — pick any combination:

**P1 — Session-start baseline (rule, zero infra).** Add to the repo rules / `check-standards` output: before the first edit of a session, run the gate on every repo you will touch; record violations as the session baseline. Any NEW violation = your change is broken; pre-existing = listed debt the session may not silently grow. Cheap, works today, but relies on the agent (the weakest layer).

**P2 — Baseline file per repo (enforcement-lite).** `.devin/check-standards-baseline.json` listing known violations (like `i18n_sql_exempt` already does for shipped SQL patches). The tool exits nonzero on violations NOT in the baseline: "never add debt" becomes mechanical while existing debt is declared, not hidden. Requires teaching the tool a baseline mode — ~1 rule-file worth of work.

**P3 — CI on push (real gate).** One workflow per repo running `check:standards` on push/PR — the only layer that cannot be skipped locally. Currently zero repos have it.

Recommendation: **P2 + P3** — P2 makes "new debt" mechanically impossible to add, P3 makes it impossible to merge unseen. P1 is a stopgap until they land.

## 5. Related open items (status, not scope)

- **Stack is UP** (verified): FE 5173 → 200, BE 3001 responding, all US ports 3003–3007 → 403 (auth gate). CRM is not down — the likely perceived breakage is *unapplied migration*: rewritten source now references snake keys while the dev DB still holds camelCase keys → raw labels render.
- **6 i18n patches** are generated + dry-run verified, still awaiting apply approval.
- **E2E**: no Playwright suite ran this session (lint, svelte-check, tsc, SQL dry-run only). E2E specs are the next verification step after the patch apply + sheet changes land together, against the running stack.
