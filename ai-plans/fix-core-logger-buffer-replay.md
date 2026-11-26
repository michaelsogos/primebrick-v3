# Fix core/logger buffer-and-replay — import-time diagnostics enter the host pipeline

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN.
1. Read plan. 2. State = LEDGER. 3. Execute declared scope only. 4. Verdict+ledger before closing.

## Context (user-approved design)
Entity meta composition fires at import time (`export const x = withColumnConstraints(...)`)
— before `createMicroservice()` runs `installConsoleBridge()` and wires the core-log
transport. Those emissions fall to the plain default transport: uncolored, untagged,
second-class lines in service terminals. Colors/identity are runtime-context properties
that cannot exist at import time — so emissions are buffered pre-wiring and replayed
through the host pipeline at first wiring.

## Semantics (locked)
- emit while unwired → bounded buffer (cap 100, drop oldest); never written bare
- first non-null wiring → replay backlog in order through transport, then passthrough
- wiring `null` → backlog dropped without replay (test isolation)
- never-wired environments (vitest by design): backlog never surfaces — noise-free
- sdk identity is auto-detected at module load (detectService) → replayed entries
  carry correct `[service#version]` tags

| # | Task | Status |
|---|------|--------|
| 1 | core logger buffer-replay + tests + typecheck | ✅ core 6/6, dal 902/902, sdk 661/661 — typecheck clean both |
| 2 | live proof: JH boot warnings colored+tagged; commit+push | ✅ job-handler.log 14:59:11 — ANSI blue ts + yellow warn + magenta [primebrick-job#3.6.2]; core+dal pushed |
