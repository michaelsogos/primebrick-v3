# Fix shield comment cruft — the contract must not describe dead mechanisms

## Status: 🟢 DONE — sdk edc7052 + be + us ceeae99; dead vocab ZERO all repos; edge GATEWAY vocab kept intentionally (D8)

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN.
1. Read plan. 2. State = LEDGER. 3. Execute declared scope only. 4. Verdict+ledger before closing.

## Context
WP-1 demolished the shield CODE but 38 "shield" mentions survive in sdk source
comments — and api-reference.mdx mirrors them mechanically into the public docs.
Doctrine: docs are the contract — a comment describing a dead mechanism is a lie.
Three classes: false-historical (rewrite), dubious semantic claims (verify per-case),
legitimate history (keep/polish). Vocabulary of the LIVE mechanism (internal identity,
proof-of-possession) must replace the dead one where the mechanism still exists.

| # | Task | Status |
|---|------|--------|
| 1 | census 38 mentions + establish current truth (wire headers, signing, gateway edge) | ✅ done |
| 2 | rewrite/polish comments per classification | ✅ sdk edc7052 — 40+ rewrites, dead vocab zero, accurate history kept |
| 3 | extract-docs clean + typecheck/tests + commit push | ✅ api-reference zero shield, 661/661, pushed. BE/US: NOT TOUCHED — findings reported only |
