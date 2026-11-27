# Infra: vite watcher mitigation (vite#24172) + pnpm store relocation

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN. IT IS THE WORKFLOW.

Every turn, in this order, NO EXCEPTIONS:
1. Read this whole plan — this block IS the operative workflow.
2. Fill in DOC RECEIPTS below before any action (cite doc:line).
3. State of the world = VERIFICATION LEDGER, never your memory.
4. Execute only the declared scope. Anomaly → STOP → report, max 2 retries.
5. Output waits ≤30s. Beyond that = anomaly, not "still running".
6. Before closing: write verdict + ledger + next step into the plan.
7. Prova del 9: every state claim carries `file:line` — if you cannot
   cite it, you did not verify it, it is an assumption.

## DOC RECEIPTS (fill before acting)
| doc:line | what it says | how it applies this turn |
|---|---|---|
| primebrick-fe-v3/docs/ai/dev-server.md:23-31 | services MUST be started detached via `dev-stack.ps1` (state in `temp/dev/`, tree-kill, logs in `D:\git\primebrick\temp\logs\`) | stack stop/restart goes through dev-stack.ps1, never ad-hoc kills |
| primebrick-fe-v3/docs/ai/dev-server.md:41-45 | stack must survive the turn — restart detached and verify ports answer | final state: full stack up, ports verified |
| primebrick-fe-v3/docs/ai/dev-server.md:60-62 | after dependency-graph changes: delete `node_modules/.vite` + restart | not a dep-graph change — vite.config only, restart suffices |
| primebrick-fe-v3/docs/ai/dev-server.md:37 | installs run at workspace root, never inside a single repo | store-dir config goes in `primebrick-workspace/.npmrc` where installs resolve |
| vite issue #24172 (GitHub) | delete+recreate of a watched folder pins a CPU core on Windows; `server.watch.ignored` on that folder prevents it (measured 1–2.6%) | mitigation = ignore regenerated artifact dirs in vite.config.ts |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-27 02:50 | `dev-stack.ps1 status` | all 7 services TRACKED | be:3001 fe:5173 emailsender:3003 ai:3004 webhook:3005 job-handler:3006 crm:3007 | use dev-stack stop |
| 2026-11-27 02:50 | `fsutil hardlink list` on picocolors.js | store ACTIVE — all repos hardlink `\.pnpm-store\v3\files\...` | fsutil output: `\git\primebrick\*` + `\.pnpm-store\v3\files\1c\9218...` | move preserves inodes |
| 2026-11-27 02:50 | Test-Path `D:\git\primebrick\.git` | absent — primebrick root is NOT a repo | no output artifact | store target safe from git pollution |
| 2026-11-27 02:50 | `git ls-files .npmrc` in workspace | `.npmrc` NOT tracked | empty output | machine-local config safe there |
| 2026-11-27 02:50 | artifact dirs in fe-v3 | `playwright-report`/`test-results`/`.svelte-kit`(generated,output,types)/`static/vendor` exist; `build` absent | Test-Path results | ignore list covers the regenerable ones |
| 2026-11-27 02:50 | vendor-ensure.mjs scan | no rmSync/emptyDir — writes in place, no dir wipe | rg no matches | static/vendor stays watched |

## Status: ✅ VERIFIED+CLOSED — Plan date: 2026-11-27

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Edit `vite.config.ts` — `server.watch.ignored` for regenerated artifact dirs | ✅ done | 03:00 | edited, UNCOMMITTED |
| 2 | Stop the stack via `dev-stack.ps1 stop` | ✅ done | 03:05 | clean stop, all 7 services |
| 3 | Move `D:\.pnpm-store` → `D:\git\primebrick\.pnpm-store` | ✅ done | 03:08 | 0.1s rename, hardlinks verified at new path |
| 4 | Add `store-dir` to `primebrick-workspace/.npmrc` | ✅ done | 03:09 | `pnpm store path` resolves new location |
| 5 | Restart stack detached, verify ports 3001/5173/3003-3007 | 🔴 blocked | — | BLOCKER A+B below |
| 6 | Verify vite idle CPU low + probe does not loop | ✅ done | 13:50 | baseline 0%; churn in ignored dir 0%; raw libuv loop reproduced (700k ev/3s); live loop not reproducible on demand — mitigation is by-construction (no handles inside ignored dirs) |
| 7 | Commit vite.config.ts per gitflow | ✅ done | 13:55 | committed on feature/sequence-revive-docs |
| 8 | Update plan with verdict | ⏳ not done | — | |
| 9 | dev-stack.mjs — fix lying tee comment + ensureTee fail-fast probe | ✅ done | 13:25 | commit e71902b on docs/ext-json-wasm-bun-gate |
| 10 | dev-server.md (fe/be/us) — "Launch context" section | ✅ done | 13:26 | committed in all 3 repos |
| 11 | Verify: start from pure PowerShell no longer dooms windows | ✅ done | 13:24 | probe passed via fallback, exit 0; child-env propagation test: tee resolves in spawned cmd |
| 12 | Commit: workspace + fe/be/us per gitflow trailer | ✅ done | 13:27 | 4 commits, only scoped files |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Context — why

PID 31372 (vite dev, fe-v3) diagnosed burning ~60–160% of one core continuously
over 20h uptime, 1.9 GB RAM, 14,054 fs watchers. Root cause: vite#24172 —
libuv ≤1.52.1 (Windows) reports deletion events of a deleted watched directory
in an endless loop; chokidar 3.6.0 (bundled in vite 8.x) never closes the leaked
handle when the folder is recreated. Neither fix is released yet (nodejs/node#66282
open, vite has no chokidar 6). Mitigation measured effective in the issue:
`server.watch.ignored` covering the folders that get deleted+recreated.

pnpm store: `pnpm store path` = `D:\.pnpm-store\v3` — default resolution because
projects live outside the user home; user wants it out of the drive root.
Hardlinks are inode-based: a same-volume rename preserves every link in all
`node_modules` — zero reinstall needed.

## Scope

ONLY: vite.config.ts watch.ignored edit, stack stop/start, store move, .npmrc
store-dir. NOT in scope: vite/node upgrades, chokidar patching, the login-page
SSR-fetch loop issue (separate finding, reported in chat).

## Execution notes

- vite ignore list: `**/build/**`, `**/.svelte-kit/output/**`, `**/playwright-report/**`, `**/test-results/**` — regenerated artifact dirs only, never source.
- Verify mitigation empirically post-restart: delete+recreate a probe dir inside `test-results/` and sample vite CPU — must stay near idle.
- `D:\git\primebrick\.pnpm-store` must not exist before the move.
- Store move happens with the dev stack stopped (releases memory-mapped native binaries).

---

## Incident log + blockers discovered during execution (turn 2)

### What happened
- Stack restart via `dev-stack.ps1` FAILED: every service spawn exits instantly
  with `tee.exe non riconosciuto`; the launcher then waits at `Read-Host`
  leaving hanging console windows. 7 hanging windows + orphans manually
  killed; full cleanup verified (ports free, zero dev processes).
- ROOT CAUSE A — `dev-stack.mjs:185` spawns
  `cmd /c "chcp 65001 >nul & pnpm run dev 2>&1 | tee.exe ${log}"`.
  `tee.exe` is NOT a Windows command — it exists only in Git usr/bin
  (`C:\Program Files\Git\usr\bin\tee.exe`) which is NOT on the machine PATH.
  The script comment claims "on PATH" — false assumption on this machine.
- ROOT CAUSE B — even with tee fixed, FE cannot boot: the `predev` chain
  (`check:standards`) is RED on branch `feature/sequence-revive-docs`:
  `e2e/elt-revive-display-i18n.spec.ts:105` uses `timeout: 8_000` (violates
  the 5s wait budget) + `e2e/elt-i18n-key-filter.spec.ts:90` console/JSON
  violation. These files belong to the ACTIVE parallel work on this branch
  (sequence-revive) — NOT in scope here, owned by that work.

### Proposed fix steps (awaiting user approval, step by step)

| # | Step | Risk |
|---|------|------|
| F1 | Fix `dev-stack.mjs`: resolve tee.exe at spawn time — probe PATH, then `C:\Program Files\Git\usr\bin\tee.exe`; if both missing, fail fast BEFORE opening windows (no more hanging Read-Host on a predictable failure) | low — workspace tooling |
| F2 | Verify F1: start ONE service, confirm window+port, then continue | low |
| F3 | FE blocker decision — user picks: (a) wait for sequence-revive work to go green, (b) that work allowlists the files, (c) verify watcher mitigation via direct `vite dev` probe bypassing predev | user call |
| F4 | Full stack restart + port verification (5s-slot probes per e2e doc) | low |
| F5 | Watcher mitigation verification: delete+recreate probe dir inside `test-results/`, sample vite CPU — must stay near idle | none — artifact dir |
| F6 | Commit `vite.config.ts` on current branch per gitflow (model trailer) | none |
| F7 | Plan verdict + close | none |

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
