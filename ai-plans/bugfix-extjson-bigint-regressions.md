# Bugfix — ext-json strict-codec regressions: passkey login + DAL_NOW write gate

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
| primebrick-dal-v3/src/meta/column-pg-io.ts:56-58 | `effectivePgStorageType` = `pgType ?? inferredPgType` — the file's own resolution doctrine | the DAL_NOW gate must follow the same doctrine |
| primebrick-dal-v3/src/meta/column-pg-io.ts:64-73 | `isLogicalJsDateColumn` covers `synchronizableType` pins + effective storage | proof the pin-aware path exists and the gate diverged from it |
| primebrick-v3-core/src/ext-json.ts:14-18 | ALL integer-valued numbers become native bigint — intentional contract | consumers crossing browser-API boundaries must convert explicitly |
| primebrick-dal-v3/docs/dev-guide/column-types.mdx:31-37 | runtime cascade: explicit pgType → semantic pin → jsType → "text" fallback — the pin IS the runtime type declaration | acceptsDalNow must honor cascade steps 1-3, not just step 1 |
| primebrick-dal-v3/docs/dev-guide/column-types.mdx:220-222 | semantic pins "already carry their storage contract and need no jsType" — BY DESIGN SynchronizableField alone suffices | user_profile decl is CORRECT per doctrine; the gate is the bug |
| primebrick-dal-v3/docs/dev-guide/column-types.mdx:305-307 | DAL_NOW "rejected on non-timestamp columns" — documented contract | the gate implements the contract but with the wrong type-resolution channel |
| primebrick-workspace/ai-plans/debt-drift-and-clock.md:33,58 | redundant-pgType anomaly REVERSED: pgType required only where no runtime channel exists; warning engine fixed to pin-only | f19d5ad removal was doctrine-correct; debt is solely in d673362 gate impl |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-25 | bun probe `check-dalnow.ts` (pin-only vs explicit column) | CONFIRMED bug B | pin-only `last_synced_at` → `pgType: undefined, inferredPgType: "timestamptz", acceptsDalNow: false`; explicit-pgType column → true | fix acceptsDalNow |
| 2026-11-25 | information_schema query | physical column IS timestamptz | `user_profiles.last_synced_at` = timestamptz in public schema | runtime meta is the gap, not DDL |
| 2026-11-25 | browser probe `probe-passkey-bigint.mjs` (virtual authenticator, click passkey button) | PASS bug A fix | zero BigInt TypeError; ceremony runs (`NotAllowedError` — honest failure, no creds in fresh authenticator) | commit codec fix |
| 2026-11-25 | playwright `auth-passkey` spec run | BLOCKED by bug B | step 1 user-create toast: `UserProfileEntity.last_synced_at: DAL_NOW requires a timestamp column` (screenshot) | fix bug B, rerun full spec |
| 2026-11-25 | full-plan + canonical-doc read (debt-drift-and-clock.md, column-types.mdx) per user mandate | DOCTRINE CONFIRMED | pin = runtime type declaration by design (column-types.mdx:31-37,220-222); every consumer except acceptsDalNow honors the cascade (audit: entity-service.ts:474, column-constraints.ts:654, list-filters.ts:139, column-pg-io.ts:57,70) | solution redesign: mirror cascade, not patch-around |
| 2026-11-25 | divergence audit sweep — all .pgType reads in dal runtime | COMPLETE | partition/retention validation = deliberate fail-open documented in-code (entity-decorators.ts:1568-1570); calculated cols correct by construction; acceptsDalNow = SOLE divergent consumer | one-line fix + regression test |
| 2026-11-25 11:29 | dal: acceptsDalNow cascade fix + SyncProbe regression tests + column-types.mdx gate-resolution clause | ✅ | vitest 6/6 doctrine incl. 2 pin-only regressions; full suite 896/896; tsc clean; dal `e43892a` | fe commit + e2e |
| 2026-11-25 11:30 | fe: webauthn codec boundary fix committed | ✅ | fe `2c5cb8e` — pre-verified by browser probe (zero BigInt TypeError, ceremony runs) | full e2e |
| 2026-11-25 11:34 | playwright `auth-passkey` FULL suite | ✅ 7/7 in 20.8s | user-create unblocked (bug B healed live — BE picked the rebuilt dist), onboarding, password login, passkey enrollment, capture, discoverable passkey login fresh context — all green | close plan |

> Standalone plan — regressions introduced on branch `feature/ext-json-strict-codec`.

## Status: 🟢 DONE — Plan date: 2026-11-25 / closed 2026-11-25 ~11:35

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | fe: commit webauthn codec bigint→number boundary fix | ✅ done | 2026-11-25 | `2c5cb8e` — browser-probe verified pre-commit |
| 2 | dal: fix `acceptsDalNow` to resolve through the runtime cascade | ✅ done | 2026-11-25 | `e43892a` — mirrors effectivePgStorageType |
| 3 | dal: regression test — pin-only synchronizable column | ✅ done | 2026-11-25 | SyncProbeEntity + 2 tests, 896/896 |
| 4 | verify: dal suite + full `auth-passkey` e2e | ✅ done | 2026-11-25 | dal 896/896, e2e 7/7 in 20.8s |
| 5 | commits per repo + ledger close-out + doc clause (user-approved) | ✅ done | 2026-11-25 | column-types.mdx cascade clause in clock doctrine |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Part A — Root causes (both empirically confirmed)

### Bug A — passkey login broken (user-reported)

`Cannot convert a BigInt value to a number` inside
`navigator.credentials.get()`. Chain:

1. strict ext-json codec (core `9365cc8`) — **by design** every wire integer
   parses to native bigint.
2. Casdoor's WebAuthn options carry `timeout: 60000` (integer) — and
   `pubKeyCredParams[].alg` negative integers on the creation path.
3. `deepDecodeBuffers` (`primebrick-fe-v3/src/lib/webauthn/codec.ts`) converts
   base64url→ArrayBuffer but passed bigint leaves verbatim into the
   CredentialsContainer API, which requires plain numbers → synchronous
   TypeError, ceremony never starts.

**Fix (already in working tree, verified)**: bigint→Number conversion at the
codec boundary — same class of adaptation as base64url→ArrayBuffer; every
WebAuthn integer field fits in 2^53. Browser probe: BigInt TypeError gone,
ceremony runs.

### Bug B — user/org/role sync writes broken (blocks e2e, breaks admin flows)

`UserProfileEntity.last_synced_at: DAL_NOW requires a timestamp column` on
user creation (and org/role sync). Chain:

1. commit `f19d5ad` dropped explicit `pgType: "timestamp with time zone"`
   from `last_synced_at` columns, relying on the `@SynchronizableField`
   semantic pin — correct for DDL/schema resolution.
2. but `acceptsDalNow` (`column-pg-io.ts:106-111`) reads ONLY `col.pgType`
   (explicit-authored) — never `inferredPgType`, never the pin. Pin-only
   columns carry `pgType: undefined` → gate rejects → ValidationError.
3. the same file already resolves correctly everywhere else:
   `effectivePgStorageType` = `pgType ?? inferredPgType` (line 57) and
   `isLogicalJsDateColumn` covers the pin (line 69). The gate is the only
   consumer that diverged.

**Blast radius census** (empirical, every DAL_NOW write site vs its column
declaration):

| column | declaration | gate verdict |
|---|---|---|
| user_profiles.last_synced_at | pin-only `@SynchronizableField` | **BROKEN** |
| organizations.last_synced_at | pin-only | **BROKEN** |
| role_mappings.last_synced_at | pin-only | **BROKEN** |
| user_profiles.suspended_at | explicit `pgType:"timestamptz"` | ok |
| invitations.otp_verified_at / completed_at | `jsType:"instant"` | ok |
| mfa last_used_at / used_at | `jsType:"instant"` | ok |
| passkeys last_used_at | `jsType:"instant"` | ok |
| service_registry.last_health_check_at | `jsType:"instant"` | ok |

Broken surface: Casdoor sync completion stamps → admin user creation,
profile sync, org sync, role sync.

## Part B — Out of scope but flagged (follow-up, NOT this plan)

Strict-bigint blast radius beyond webauthn: RFC7807 `status` parses to
bigint (`401n` observed in token-refresh logs). Any `===` numeric comparison
against parsed integer fields (HTTP status, counts, lengths) silently breaks
(`401n !== 401`). Any bigint passed to browser APIs (setTimeout, Date ctor)
throws. This needs a dedicated audit plan — flagged, not scoped here.

