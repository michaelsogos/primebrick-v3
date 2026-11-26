# Fix callNats no-responder detection

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN.
1. Read plan. 2. State = LEDGER. 3. Execute declared scope only. 4. Verdict+ledger before closing.

## Scope (approved by user)
`callNats` (sdk nats-routes.ts) resolves `null` when NATS fast-fails with no-responder
(empty reply, status 100) instead of rejecting with a speaking error. Result: callers
crash with cryptic `null is not an object` — boot-race warnings look like bugs.

## Fix
Detect the no-responder fast-fail in the reply loop (header code 100 / empty+headers)
and reject with `no responders for <subject>` — self-explanatory boot-race diagnostics.

| # | Task | Status |
|---|------|--------|
| 1 | fix + unit test | ✅ sdk 39fb8bc — 14/14 green |
| 2 | verify live: boot-race warning now readable | ✅ webhook.log 14:40:16 — "no responders for jobs.ctl.triggers.materialize", self-healed 30s later |
