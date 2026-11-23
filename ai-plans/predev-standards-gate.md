# Plan — static gates on `predev`, everywhere — enforce FIRST, sanitize per service

## The solution (and the why)

**Decision**: hook the static-conventions gate into `predev` in every repo
that runs a dev server — FE, BE, every US module, and the US boilerplate
above all.

**Why `predev`**: npm lifecycle runs `pre<cmd>` before `<cmd>`. `pnpm run
dev` is the ONE command launched daily on every repo; `prebuild`/`test`
(where the gates live today) never fire in the dev loop — which is exactly
how the raw-input violation and 35 pre-existing anomalies went unseen:
`svelte-check` can't see anatomy rules and nobody ran the gates.

**Why enforce FIRST, then sanitize**: if we fix violations before wiring,
new debt can enter between the fixes and the wiring — the same hole that
produced today's rot. With the gate live from step 1, every sanitize pass
is proven red→green BY THE GATE ITSELF, and nothing new can slip in
between. Services not starting is the EXPECTED intermediate state —
zero legacy, maximum quality, nothing less.

**Why service-by-service**: each repo's violations are owned, fixed and
verified in one pass with the gate as empirical proof (dev-start = green
certificate). One repo at a time isolates blast radius and keeps every
commit small and reviewable.

**Why boilerplate first among US modules**: every future service clones
it — the gate propagates by construction, not by memory.

**Why no exemptions**: `--write-baseline` was removed on purpose — debt
is fixed, never minted. `allowPaths` additions would be hiding, not
solving.

**What "lint" means per repo**: FE has real `eslint` (catches raw
controls — the violation class that bit us) + `check-standards` (custom
Primebrick anatomy linter). BE/US/libs have `check-standards` only — it
IS their conventions gate. (Porting an eslint stack to BE/US would be a
separate RFC — flagged, not assumed.)

## Phase 0 — wire the gates (no fixes yet)

| Repo | `dev` entry | `predev` to write |
|---|---|---|
| fe-v3 | `vite dev` | `i18n-fallback && pnpm check:standards && pnpm lint` |
| be-v3 | `tsx watch src/index.ts` | `pnpm check:standards` |
| us/boilerplate | `dev-hot.mjs` | `pnpm check:standards` |
| us/{ai,crm,emailsender,job-handler,webhook} | `dev-hot.mjs` | `pnpm check:standards` |
| libs (core/ui/dal/sdk/decimal) | no `dev` | none needed — gate already in `prebuild`+`test`; verify green in their sanitize pass |

eslint speed note: `eslint src/lib/shell` alone = ~23s; `eslint .` full
run is pathological (>15min, still running at TIC). Before wiring the FE
gate: fix eslint CONFIG HYGIENE — `ignores` must cover generated dirs
(`test-results/`, `playwright-report/`, `vendor/`…), then add `--cache`
to `lint` so repeat dev-starts re-lint only changed files. No rule
reduction — config hygiene only.

## Phase 1+ — sanitize repo by repo

For each repo, in order FE → BE → US modules → libs:

1. `pnpm run dev` → the gate fires, violations listed = the fix list.
2. Fix every violation (no exemptions, no baselines).
3. `pnpm run dev` starts = the green certificate.
4. Verify the repo's other gates (`check`/`test` where they exist).
5. Commit.

**Known FE list (surveyed — 35 anomalies)**:
- 26× `i18n-key-ns` in 6 `lib/__tests__` fixtures → rename keys INTO the
  allowlist (`app.err.*`, `app.tabs.*`, `app.meta.*`, `app.col.*`,
  `app.status.*`, `app.my.*`, `app.fields.*`) — fixtures stay synthetic,
  now legal.
- 2× `button-variant-toolbar` (`soft`→`outline`, BulkActionsToolbar).
- 3× `panel-button-testid` (BulkEditorPanel buttons).
- 1× `no-native-dialog` false positive — a comment `confirm (→pending)`
  matches the regex → reword.
- 2× `no-base-to-string` (ErrorsPanel — RFC7807 fields stringified
  implicitly) + 1× `no-unused-vars` (TranslationEditorPanel `isEn`).

**Unknown per-repo lists**: BE/US/libs surface their own on gate
activation — same protocol, one at a time.

## Phase final — carried-over widget work + docs

The uncommitted widget refinements (PrimeField+NumericInput padding,
sticky `SheetPanelFooter` Badge preview, browser-local tz examples,
`{seq:N}` tag+example live, Tags sheet icon) land AFTER FE is green;
then the i18n text patch (strip `—` clauses, `seq_width`→"Riempimento"),
e2e assertions, docs, per-repo commits.

## Progress log (implementation)

- **predev wired everywhere**: FE (`i18n-fallback && check:standards &&
  lint`), BE (`check:standards`), all 6 US modules + boilerplate
  (`check:standards`). Libs need no `predev` (no dev server; gate already
  in `prebuild`+`test`).
- **eslint hygiene solved**: `eslint .` OOM'd at 4GB heap →
  `node --max-old-space-size=8192` wrapper. `--cache` initially failed —
  ESLint serializes config into the cache key and `svelteConfig` carries
  functions (`onwarn`, `vitePreprocess`, `kit.adapter`). Fixed by passing
  the parser a `JSON.parse(JSON.stringify(svelteConfig))` clone — the
  parser only reads declarative fields (compilerOptions/extensions/
  features — none set), so zero rule reduction, just hygiene.
- **Phase 1 FE**: `check:standards` clean. Fixed: 26 i18n-key-ns fixtures
  renamed into `app.*`; 2× toolbar `soft`→`outline`; 3× panel testids;
  comment reworded (native-dialog false positive); 2× `no-base-to-string`
  → `toDisplayString`; 1× unused `isEn`. Full repo lint run in progress.
- **Phase 2 BE**: 29 `i18n-key-ns` violations — synthetic module fixtures
  (`job.*`, `crm.*`, `all.*`, `other.*`) renamed into `system.*`/`custom.*`
  respecting the runtime validator (module `code.*` + CORE app/system only).
  `check:standards` clean, 33/33 tests green → commit `f744a23`.
- **Phase 3 US**: boilerplate had 4 real `dal-member-access` —
  `this.dal.find/findAll` → `svc.query/svc.find`; health adapter member
  `dal`→`db` (port adapter, not a service). crm had 20 `i18n-key-ns` —
  shared dict hint tooltips moved `system.entities.dict.hints.*` →
  `app.entities.dict.hints.*` (BE patch `20261231200000`, signed +
  applied). All modules clean → commit `79e323e`.
- **Phase 4 libs**: core, dal, sdk, decimal, ui — all clean.

## Acceptance criteria

- `pnpm run dev` on FE, BE, and every US module runs the gate first —
  and starts green.
- Negative probe: a planted violation blocks dev-start (then reverted).
- `check:standards` = 0 non-baseline violations; `pnpm lint` = 0 errors.
- Boilerplate carries the gate → modules inherit by construction.
- Zero exemptions added.

## Non-goals

- No eslint stack in BE/US/libs (separate RFC).
- No rule/baseline/allowPaths changes.
- Not touching the 31 already-baselined entries.
