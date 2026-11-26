# Bugfix — `derived_inert` warnings when leaving an entity-list page mid-boot

## Status: 🟢 DONE — Plan date: 2026-02-31 / single session

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Root-cause the 5 warning stacks | ✅ done | this session | async continuations of a destroyed component read dead `$derived` |
| 2 | Destroy-guards in useEntityList | ✅ done | this session | `destroyed` flag + onDestroy + bail at every continuation point |
| 3 | Destroy-guard in useStickyColumns | ✅ done | this session | single guard in `updateStickyOffsets` covers RAF/microtask/RO/resize |
| 4 | Runtime regression test | ✅ done | this session | `entity-list-destroy-guard.test.ts` — 2/2 green |
| 5 | User verification in live app | ⏳ pending | — | repro: seq ELT → click dict TIPI CLIENTI → console must be clean |

## VERIFICATION LEDGER

| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| session | user stack traces | root cause | 5 stacks all post-destroy reads: ensureVisibleKeys:420, init:707, loadRows:510, updateStickyOffsets:67 (RAF), loadSparklines:568 | fix |
| session | vitest entity-list-destroy-guard | ✅ 2/2 | post-destroy: meta stays null, zero inert warnings; live path unaffected | commit |
| session | svelte-check | 0 errors | typecheck green both before and after test files | commit |

## Root cause (traced)

`useEntityList.init()` is fire-and-forget (`onMount(() => void list.init())` in
EntityTablePage:144). Its awaits resolve AFTER the user navigates away; the
continuations then read `$derived` (`columns` etc.) owned by the dead effect
tree → `[svelte] derived_inert` burst + wasted network/state work on a dead
instance. Same shape for the RAF-deferred `updateStickyOffsets` in
useStickyColumns. Repro (user): load crm `sequence` ELT → click dict
TIPI CLIENTI → warnings fire on EXIT, never at runtime.

## Fix

- `useEntityList.svelte.ts`: `let destroyed` + `onDestroy` (also aborts the
  in-flight list fetch + clears the search debounce). Bail guards: entry of
  `loadMeta`/`loadRows`/`loadSparklines`/`healStaleMeta` + after each await
  preceding derived reads (post-meta-fetch, post-list-fetch, post-text-parse,
  both `init` continuation points).
- `useStickyColumns.svelte.ts`: same flag; ONE guard at `updateStickyOffsets`
  entry covers every deferred path (RAF, queueMicrotask, ResizeObserver, resize).

## Test

`src/lib/__tests__/entity-list-destroy-guard.test.ts` + `EntityListDestroyHost.svelte`:
mounts the composable like the real page, destroys mid-init, resolves the
in-flight meta — asserts state is never written post-destroy (behavioral proof,
independent of dev-warning emission) and zero `derived_inert` console warnings.
Second test pins the live path: pre-destroy resolution applies normally.
