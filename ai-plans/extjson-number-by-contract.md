# Ext-JSON — RFC7807 `status` always number (SER/DESER), shape-scoped exception

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
| primebrick-be-v3/src/http/api-errors.ts:13-17 | ApiErrorResponse: type/title/detail string + status number — all four constructor-mandatory | the emission shape is guaranteed — shape discriminator viable |
| primebrick-v3-core/src/ext-json.ts:14-18 | every integer-valued number becomes bigint — the rule STAYS | exception ONLY for the RFC7807 error model status |
| primebrick-v3-core/src/ext-json.ts:152-155 | unsafe-digit array must stay consumption-aligned | exempt leaf consumes-and-discards when unsafe |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-25 | information_schema: tables carrying type+title+detail together | NONE | zero tables in the whole DB — no entity row can collide with the problem shape | shape discriminator collision-free |
| 2026-11-25 | api-errors.ts emission contract read | guaranteed | constructor requires type+title+status+detail — every emitted problem carries the full shape | implement |
| 2026-11-25 | scope correction (user) | applied | ONLY RFC7807 http code, SER+DESER as number — no key-global exemption, no columns, nothing else | this plan |
| 2026-11-25 | core vitest ext-json | PASS 14/14 | 8 new contract tests — exemption, narrow-scope proof, unsafe alignment, strictness | commit 0dd0d7b |
| 2026-11-25 | live wire probe (exact BE 401 bytes) | PASS | status number, retry_after bigint, domain status 3n | — |
| 2026-11-25 | vite dev resolution probe | serves patched src | /@fs source contains isProblemDetails — no restart needed | — |
| 2026-11-25 | in-browser live import test | PASS | problem_status 401 number, retry_after bigint, domain bigint, guard_241 passes | — |
| 2026-11-25 | auth-passkey e2e | PASS 7/7 in 22.3s | full login harness green on the live stack | — |
| 2026-11-25 | docs | committed 2e6a222 | overview.mdx wire-codec section + regenerated api-reference | plan closed |

> Standalone plan — direction user-approved 2026-11-25: strict-bigint rule STAYS untouched;
> the ONLY exception is the RFC7807 error-model `status`, number in both directions.

## Status: ✅ CLOSED — Plan date: 2026-11-25 / all tasks verified end-to-end

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | core: shape-scoped exception in `extJsonParse` — an object carrying `type`+`title`+`detail` as strings is RFC7807-problem-shaped; its `status` integer leaf stays `number` (everything else everywhere stays bigint). SER untouched — wire already standard (`401` bare number both ways) | ✅ done | 2026-11-25 | one object-level discriminator + exempt leaf with unsafe consume-and-discard |
| 2 | core: contract tests — problem-shaped status stays number at any depth/nesting; same `status` integer in a NON-problem object stays bigint (the narrow-scope proof); mixed payload unsafe-digit alignment preserved; strictness (dup keys/trailing commas) unaffected | ✅ done | 2026-11-25 | |
| 3 | fe: verify api.ts:241/323 typeof guards heal with zero consumer patches; re-run auth-passkey e2e as the live regression harness | ✅ done | 2026-11-25 | |
| 4 | docs: the exception documented where the codec contract lives (core dev-guide) — RFC7807 status is number by construction in SER/DESER, the shape discriminator rule, why it is the ONLY exception admitted | ✅ done | 2026-11-25 | user: "andrà documentato" |
| 5 | verify: core suite + commits per repo + ledger close | ✅ done | 2026-11-25 | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## The design — narrow, shape-scoped, by construction

The exception belongs to the **RFC7807 error model**, not to a key name and
never to entity columns. Discriminator: an object is problem-shaped when it
carries `type`, `title` and `detail` as string values (the emission contract
guarantees all four members — `api-errors.ts` constructor). Only inside such
an object does the `status` integer parse as `number`.

```
collision audit (empirical, 2026-11-25): zero tables carry type+title+detail
together — no entity row can ever be mistaken for a problem-details object.
```

`bigintWalk` — object loop computes the discriminator once per object; the
`status` leaf of a problem-shaped object returns early as number (unsafe
digits consume-and-discard to keep positional alignment). Everything else in
the payload — including a hypothetical integer `status` anywhere else —
stays bigint.

**Out of scope, deliberately**: `depends-on` pivot narrowing, typeof/arithmetic
audits on domain bigints, any other key or column. Separate future audit.

