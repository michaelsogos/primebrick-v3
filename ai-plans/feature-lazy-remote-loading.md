# Lazy remote-module loading — kill census-wide warm-up

> User directive: warm-up eager di tutti i chunk remoti al boot è
> architetturalmente sbagliato per una microfrontend — non scala
> ("e se ne nascono altri 30 di moduli, io spero migliaia").
> Fase TIC: questo è il piano; si esegue solo dopo PROCEED.

## Status: 🟢 DONE — Plan date: 2026-10-25 09:45 UTC / 11:45 CEST — completed 2026-10-25 12:10 UTC

| # | Task (detail level) | Status | When | Notes |
|---|---------------------|--------|------|-------|
| 1 | Delete `warmRemoteModules` call + import in `modules-shell.svelte.ts:218` | ✅ done | 2026-10-25 | single call site |
| 2 | Delete `warmRemoteModules` function in `remote-loader.ts:363-390` | ✅ done | 2026-10-25 | -36 righe |
| 3 | Prune `remote-loader.test.ts` warm-up tests (if any target the fn) | ✅ done | 2026-10-25 | nessun test la copriva — nulla da potare |
| 4 | Verify: vitest + svelte-check + live walkthrough (cold mount latency per remote page) | ✅ done | 2026-10-25 | 493/493, 0/0, E2E 5 moduli pre/post |

---

## What it does today (measured)

`loadShellNav()` (modules-shell.svelte.ts:218) → after the module census,
`warmRemoteModules(_state.modules)` → `requestIdleCallback` → for **every**
`component_url` in **every** module's `routes[]` + `sheets[]`:

1. `ensureStylesheet(<chunk>.css)` — link injection (fetch)
2. `resolveRemoteIntegrity` → `GET <chunk>.sha256` (no-cache)
3. `verifyVendorDeps` → `GET <chunk>.deps.json` + `GET /vendor/vendor-manifest.json` (no-cache)
4. `GET <chunk>.js` (no-cache) → sha256 → `blob:` → `import()` → **executes module top-level code**
5. Result parked in `remoteLoadCache` (key `url#integrity`)

So per remote chunk ≈ **4 network hits + a stylesheet + full JS execution** —
at idle, at boot, for every module the user may never open.

## Why it's wrong (not just slow)

| Defect | Today | At 30 modules | At 1000 |
|---|---|---|---|
| Boot traffic | ~16-20 req | ~120-160 req | 4000+ req |
| `import()` side effects | all remote top-level code runs at idle | same, ×8 | catastrophic |
| Memory | warmed-but-unvisited blob URLs + module graphs retained forever in `remoteLoadCache` (no eviction, `dispose_source` only runs on real mounts) | grows linearly | OOM-class |
| Cold-load contention | idle callback competes with Vite's cold transform work — contributes to the "tutto morto" first-load sensation | worse | worse |

Introduced in `6348700` ("ai remote pages + remote-module warmup") when
there were ~2 remote chunks. Never revisited as the surface grew.

## The architecture already does lazy correctly

`RemotePageMount` + `RemoteSheetMount` both call
`loadRemoteModuleCached(url, decl.integrity)` **directly on mount** — the
exact same pipeline (vendor handshake → integrity → verified blob import)
the warm path uses. The warm-up is *pure speculation* layered on top:

- **content-addressed cache** (`url#resolved-integrity`) — second mount of
  a chunk costs zero async work; a rebuilt chunk misses the old key and
  reloads fresh bytes (retry-proof by design)
- **failed loads evicted** — a prefetch failure can't poison a real mount
- **`dispose_source`** — blob URLs revoked after mount

Removing the warm-up deletes *nothing* functional — only the speculative
pre-fetch.

## The fix (chosen shape)

**Pure lazy — delete the warm-up.** No scoped warm, no intent-prefetch:

- First mount pays the real pipeline: ~4 sequential fetches (sha256,
  deps.json, vendor-manifest, chunk) + import — locally tens of ms; on
  production a few hundred ms worst case for a fresh chunk
- This is the honest microfrontend semantic the platform spec already
  states: "dynamically discovered, integrity-checked, **loaded and mounted
  at runtime**"
- Scales O(chunks actually visited), not O(chunks declared)
- Any future perf refinement (module-scoped warm on selection,
  hover-prefetch) is a *separate* decision with measured need — not
  smuggled back in now

### Edits

- `modules-shell.svelte.ts` — drop the `warmRemoteModules(_state.modules)`
  call, its import, and the comment block (lines 5, 215-218)
- `remote-loader.ts` — delete the `warmRemoteModules` function + its
  docblock (lines 356-390). `ensureStylesheet` stays (used by mounts).
- `remote-loader.test.ts` — remove/adjust any test targeting warm-up
  (check; the loader pipeline tests stay untouched)

## E2E misurato (reale, network log — full reload per module root)

| Module root | Leaf | GET pre | GET post | Δ | module-assets pre/post | vendor pre/post |
|---|---|---|---|---|---|---|
| /system/settings | profile | 2792 | 880 | **-1912 (-68%)** | 16/0 | 1898/0 |
| /system/emailsender | providers | 2875 | 963 | **-1912 (-66%)** | 16/0 | 1898/0 |
| /system/job | job-schedules | 2877 | 965 | **-1912 (-66%)** | 16/0 | 1898/0 |
| /crm | customers | 2873 | 961 | **-1912 (-67%)** | 16/0 | 1898/0 |
| /system/ai | console (remota) | 2760 | 2741 | -19 (-0.7%) | 17/4 | 1898/1889 |

SPA leaf-switch console→docs-index: ~11 req identico pre/post (chunk
deduped). Raw logs + summary: `primebrick/temp/e2e-baseline-summary.md`.

**Anomalia scoperta (fuori scope, da pianificare):** `/vendor/` emette
~1890 `shared-*.js` (un file per icona lucide + shared chunks). Qualsiasi
mount remoto trascina l'intero albero — il warm-up lo anticipava, il lazy
lo palesa sul primo mount. Difetto del vendor bundle US, non del loader.

## Acceptance

- `pnpm vitest` green (remote-loader + shell suites), `svelte-check` 0/0
- Live: cold-open `/system/ai/console` and
  `/system/emailsender/templates/create` — remote mounts render; network
  tab shows the 3-4 handshake fetches **only for the mounted chunk**;
  revisiting the route hits the content-addressed cache (no re-fetch)
- Network tab at `/system/settings/profile` shows **zero** remote-chunk
  traffic

## Explicit non-goals

- No change to the integrity/vendor pipeline itself (sha256 sibling,
  deps.json handshake, blob import — all stay)
- No eviction policy on `remoteLoadCache` (bounded by user navigation —
  the unbounded growth came from warming, which dies here)
- No `server.warmup` Vite work (separate lever for host-file cold start,
  pending user decision)
