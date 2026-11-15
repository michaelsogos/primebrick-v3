# DB patch chain integrity — analysis & hardening options

## Status: ⚪ TODO — Plan date: 2026-11-03 14:00 UTC / 15:00 CET

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Analysis: current signature model, empirical evidence | ✅ done | 2026-11-03 | part A |
| 2 | Threat model: what a signed-manifest attacker can and cannot do | ✅ done | 2026-11-03 | part B |
| 3 | Options ranked: manifest chain / patch chain / registry-only | ✅ done | 2026-11-03 | part C |
| 4 | Decision + implement chosen hardening | ⏳ not done | — | awaiting review |

---

## Part A — How patches are signed today (empirical)

Source: `primebrick-dal-v3/src/migrations/manifest.ts`, `engine.ts`.

**Artifact model** — two committed files per `db-meta/`:

- `MANIFEST.json`: `{ version, key_id, issued_at, patches: { "<name>": "<sha256>" }, signature }`
- `keys.json`: `[{ key_id, algo:"ed25519", public_key (b64 spki), trust:"release"|"dev" }]`

**Crypto**: `signature = ed25519( canonicalJson(manifest minus signature) )` — canonical JSON = recursively key-sorted objects (manifest.ts:51-56). Private key is a base64 PKCS8 DER passed to `primebrick-db sign --key @file --key-id <id>`; **no salt, no static secret** — the signature covers manifest *content*, not file bytes.

**Per-patch digest**: `sha256(normalizePatchEol(raw))` + `sha256Raw` (engine.ts:209-220). A file whose content ≠ manifest digest is refused before anything runs — **fail-closed**.

**Runtime second line**: the DB keeps `{schema}._patch_registry` — a registered `applied` patch whose sha changes is rejected: `"immutable patch changed, refusing"` (engine.ts:238-242). Applied history itself is thus tamper-evident even if MANIFEST.json is rewritten.

**Trust gate**: `verifyManifest(manifest, keyring, allowedTrust)` — default `["release"]`; keys.json is *committed* (adding a public key IS the trust decision, code-reviewed). Private keys never live on runtime machines: CI signs with release key, devs with dev keys (`temp/dev-micha-2.key`).

## Part B — Threat model: what is NOT protected today

| Attack | Verdict | Why |
|--------|---------|-----|
| Forge a valid signature without a private key | ❌ impossible | ed25519 — fine |
| Edit a shipped `.sql` file | ❌ caught | sha mismatch vs manifest AND vs DB registry |
| Reorder / drop entries in MANIFEST.json | ⚠️ **possible** | manifest is a FLAT map — nothing binds patch N to patch N-1. Sign with any trusted key → verifies |
| Replace a `pending_review`/`failed` patch's body + re-sign | ⚠️ **possible** | registry only pins sha for already-`applied` rows — a never-applied patch has no immutable anchor except the manifest itself |
| Insert a brand-new malicious patch + re-sign | ⚠️ by design | whoever holds a trusted key CAN do this — that is what trust means; the question is *detection*, not prevention |
| Replay an OLD signed manifest (rollback to before a hotfix) | ⚠️ **possible** | `issued_at` exists but is never checked for monotonicity |
| Dev-key supply chain | ⚠️ | any leaked dev key can sign manifests that `allowedTrust:["release"]` still rejects for apply — but `pending_review` paths may accept dev trust; dev keys must NOT widen apply scope |

**The chain gap in one sentence**: the signature authenticates the *set* of patch digests, not the *sequence* — nothing proves patch N's manifest was issued *after* (and *on top of*) patch N-1's.

## Part C — Hardening options (ranked by cost/benefit)

### C1. Prev-hash chain inside MANIFEST.json (recommended — "mini blockchain")

Each `patches` entry becomes `{ sha256, prev }` where `prev` = sha256 of the canonical manifest *at the time that patch was added* (genesis: `"0"*64`). Signed as part of the manifest → every sign operation re-anchors the whole chain.

- Detects: dropped middle entries, reorder, partial manifest rewrites, history truncation.
- Cost: `primebrick-db sign` recomputes links automatically; engine verifies links on load (~30 lines).
- Backfill: compute links for the existing 70 patches ONCE (chronological filename order already exists), ship as a normal re-sign.
- Limit: does NOT stop a trusted-key holder from rewriting history — but makes the rewrite *provable* (chain tip ≠ registry's last applied anchor).

### C2. Registry anchor binding

Store `manifest_tip_sha` on every `_patch_registry` row written at apply time. Boot verifies: the on-disk manifest's chain tip for already-applied patches equals the recorded anchor. A rewritten chain that omits/alters applied history fails hard — even with a valid signature.

- Detects: C1's residual gap (trusted-key history rewrite targeting applied patches).
- Cost: one column + one check; purely additive migration.

### C3. issued_at monotonicity + append-only policy

Engine rejects a manifest whose `issued_at` ≤ the greatest previously recorded `issued_at`. Cheap (one comparison), kills naive replay. Weaker than C1 (still allows same-timestamp set surgery) — worth adding as a one-liner regardless.

### C4. Out-of-scope ideas (documented, not recommended now)

- Transparency log (append-only external ledger, Rekor-style) — real blockchain guarantees, real ops burden.
- Multi-sig manifests (≥2 trusted keys) — stronger release trust, slows every dev re-sign.
- Env-var key pinning — chicken-and-egg (env is config, not trust).

**Proposal**: C1 + C3 in dal-pg (one PR, ~150 lines incl. tests), C2 as follow-up. Dev keys stay `trust:"dev"` — apply must keep requiring `release` outside dev environments.

---

## Acceptance criteria (when implemented)

1. `primebrick-db sign` emits linked entries; verify rejects a broken link, a dropped applied patch, or a non-monotonic `issued_at` — each with a distinct error code.
2. A tampered manifest (patch deleted from the middle) fails `pnpm db:migrate` BEFORE any SQL runs.
3. Existing 70-patch manifests backfill links losslessly — same patch digests, added `prev` fields only.
