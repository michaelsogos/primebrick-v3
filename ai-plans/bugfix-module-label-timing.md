# bugfix — module label timing (uiLang switch mid-census)

**Status**: DONE — implemented, E2E-verified, pushed (`primebrick-fe-v3` `54e5dfb`)

## Bug

`GET /api/v1/modules` (the census) resolves the `labels` seed server-side for
`?lang=`. A `uiLang` change landing **while a census was in-flight** was dropped
by the subscriber's `_state.loading` guard — the landed census merged labels for
the stale lang, `_censusLang` recorded it, and nav labels stayed in the previous
language for the rest of the session (until the next lang switch or reload).

## Fix — abort, never re-wait

`primebrick-fe-v3/src/lib/shell/modules-shell.svelte.ts`,
`primebrick-fe-v3/src/lib/api.ts`

- Each census run owns an `AbortController` (`_censusAbort`); `fetchModules`
  accepts `init.signal` (apiFetch already forwards `init` and rethrows
  `AbortError` unwrapped).
- The `uiLang` subscriber: `lang === _censusLang` → skip; in-flight →
  **abort + free the slot + fire the correct GET immediately**; no census
  yet → skip (the upcoming first fetch reads the fresh lang anyway).
- The superseded run's `catch` sees `ctrl.signal.aborted` → lands nothing;
  its `finally` is ownership-gated (`_censusAbort === ctrl`) so it cannot
  clobber `_censusAbort`/`_censusInflight`/`_state.loading` of the
  replacement run.

### Designs considered and rejected

- **Post-flight recheck** (land the stale fetch, compare langs, refetch):
  waits for the wrong request first — absurd on a slow link; also does a
  wasted stale-lang merge. Superseded by abort per user direction.
- **Parallel fetch per lang**: last-landing wins nondeterminism on
  `_censusLang` — worse ordering.
- **Freeze uiLang during fetch**: can't freeze a store a UI event writes.

### Bug found during implementation

svelte `subscribe` invokes the callback **synchronously at module init** —
referencing `_censusInflight` (declared later) was a TDZ crash in both test
and app. Declarations moved above the subscriber.

## Verification

- **E2E** `src/e2e/modules-census-lang-race.spec.ts` (new): route-intercepts
  the first census and holds it → `setUiLang('it-IT')` via the real store
  module (`import()` of the Vite-served URL, globalThis singleton) →
  asserts `GET ...lang=it-IT` fires **while R1 is still held** and R1 dies
  with `requestfailed` (client abort). PASS.
- Unit: `modules-shell.test.ts` 14/14.
- `svelte-check` 0/0; `check-standards --profile=fe` clean.
