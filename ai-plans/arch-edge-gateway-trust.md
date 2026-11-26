# Edge gateway trust — GW→BE cryptographic verification (FUTURE — cloud testing phase)

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
| <fill in> | | |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-26 | plan opened as D8 spin-off | ✅ | decision in arch-internal-trust-and-transports.md §8 | WAIT for cloud testing phase |

## Status: ⚪ TODO — DEFERRED to cloud testing phase — Plan date: 2026-11-26

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Decision recorded: answer per-deployment, doctrine constraint written | ✅ done | 2026-11-26 | this file IS the detail |
| 2 | Cloud testing phase: pick a real GW (APIM/FrontDoor/Kong) and prototype | ⏳ not done | — | WHEN: future cloud deployment tests |
| 3 | Doctrine constraint enforcement in code/config validation | ⏳ not done | — | with task 2 |

---

## Scope and trigger

**This plan is DEFERRED by explicit decision (D8, 2026-11-26).** It opens when
we do cloud deployment testing with a real authoritative gateway in front of
the BE. Nothing here is implementable or verifiable in the standalone dev
topology — the answers depend on the concrete gateway product.

## The problem (decision detail)

When a deployment puts an authoritative gateway in front of the BE
(`AuthMode.GATEWAY` — decision D1 ratified: BE keeps both modes), the gateway
terminates user auth and writes identity headers. The gateway is a
third-party product — it cannot apply our internal HMAC/vault scheme. The
VLAN attacker could call the BE directly, fabricating gateway identity
headers.

**The doctrine constraint (ratified)**: in GATEWAY mode the BE MUST verify
the frontline cryptographically — a static shared secret as the only barrier
is NOT acceptable. The tool choice is PER-DEPLOYMENT, not doctrinal.

## The options to evaluate per deployment

| option | what it is | gateway support | notes |
|---|---|---|---|
| (a) signed JWT injection | the GW signs a short-lived JWT with a configured key; BE verifies with the public key — same proof-of-possession principle as internal hardening | Azure API Management: yes natively (validate-jwt / token injection policies); Kong: yes via plugin; Front Door: NO — it is L7 proxy+WAF only, pairs with APIM for this | most aligned with the internal philosophy; key rotation manual but rare |
| (b) mTLS edge | GW presents a client certificate the BE validates | APIM: yes (client cert to backend); most enterprise GWs: yes | PKI operational burden; cert rotation/revocation to operate |
| (c) static secret + network isolation | shared secret header + the BE only reachable from GW IPs/private endpoints | universal fallback | weak alone against in-VLAN sniffing; acceptable ONLY combined with real network isolation (VNet integration, private endpoints — which in cloud actually exist and are strong) |

## What the cloud testing phase must answer

1. Which concrete gateway(s) do we target first (APIM? FrontDoor+APIM? Kong?)?
2. For each: which option is operationally simplest AND cryptographically real?
3. How does key/cert rotation work in practice for the chosen path?
4. Does the BE config need a new auth sub-mode (`GATEWAY_JWT`?) or is it a
   configuration of the existing GATEWAY mode?
5. Front Door specifically: since it cannot sign — is the answer
   FrontDoor→APIM chaining, or private-only backend ingress?

## Out of scope here

Internal hardening (HMAC sign/seal BE→US) lives in
`arch-internal-trust-and-transports.md` and is ORTHOGONAL — it works
identically whatever the edge answer is, because in the internal hop the
caller is always our own code.

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
