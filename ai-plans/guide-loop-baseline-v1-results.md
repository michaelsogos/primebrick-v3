# Guide agentic loop — Baseline v1 results (offline harness, CPU)

> Reference results for `guide-agentic-tool-loop-plan.md`.
> NOT an official test suite — offline measurement artifact.
> Harness: `D:\git\primebrick\temp\guide-loop-harness.mjs`
> Date: 2026-10-02 · Model: onnx-community/Qwen2.5-Coder-3B-Instruct **q4 (CPU,
> onnxruntime-node)** · Embedder: Xenova/paraphrase-multilingual-MiniLM-L12-v2
> q8 · DB: real `ai.docs_kb` (1494 chunks, multilingual embeddings) ·
> MIN_SIM=0.35, K=4, max retrieval iterations=2, route census=17 routes
> (parsed from navigation-map.mdx).
>
> ✅ WebGPU parity VERIFIED 2026-10-02 — `src/e2e/ai-guide-loop-parity.spec.ts`
> PASSED on q4f16/onnxruntime-web. Per-turn: 15.1s / 15.1s / 5.0s (~6× faster
> than CPU). Zero stage-parse failures; closed-space JSON contracts hold.
> Navigate CTA click → real `goto` to `/system/settings/users` verified.
>
> WebGPU divergences vs CPU baseline:
> - S0 DOES emit English queries on WebGPU (CPU kept Italian) — harmless.
> - S2 still returns sufficient=false with noisy `missing` queries
>   ("Create organization") that POLLUTE retrieval → admin answer drifted
>   toward the organizations page. Known weakness, candidate for Phase 2
>   refinement (tighten S2 prompt or drop S2 entirely when compressing).
> - S4 emits filler navigate actions (e.g. "torna ai settiman­ti").
> - KV cache: `using_cache:false` on EVERY generation — preflight one-offs
>   invalidate the cache each time (measured, not assumed). Irrelevant at
>   current stage latencies (0.9–5.5s).

## Per-question results

### 1. "come faccio a creare un utente?" — 85.6s total
- S0 (16.9s): queries=3 IT, keywords=[utente…]
- S1 (0.7s): 9 chunks; S2: 2 iters (+1,+0→early-exit)
- S3 (36.0s): correct UI procedure ("vai a /system/settings/users/create, compila form, salva")
- S4 (9.3s): actions=[navigate `/system/settings/users`, `/system/settings/users/create`] ✅
- Citations: navigation-map, auth/me, entities/customer, authentication-how-to

### 2. "cosa significa IDP Code?" — 69.5s
- S0 (13.1s): queries EN this time; S1: 4 chunks; S2: 1 iter (+0→exit)
- S3 (34.3s): SSO/identity-provider explanation, plausible
- S4 (8.7s): actions=[navigate `/system/settings/modules/[code]`] ✅
  (template param — needs resolution rule or exclusion in FE contract)

### 3. "come funzionano i permessi e la RBAC?" — 92.5s
- S1: 5 chunks; S2: 2 iters (+1,+1)
- S3 (36.6s): Casdoor role→permission mapping, grounded
- S4 (8.4s): actions=[] — acceptable, no obvious page
- Citations: api/rbac, mcp-server, getting-started/architecture, backend/rbac

### 4. "come faccio una torta?" — 21.1s — NO-DOC PATH
- S1: 0 chunks ≥0.35 → deterministic `no_docs`, loop exits before S3 ✅
- This is the correct rejection the old system failed on.

### 5. "how do I configure MFA?" (EN) — 116.2s
- S1: 4 chunks; S2: 2 iters (+1,+0)
- S3 (65.5s): correct MFA procedure from authentication-mfa.mdx (newly
  indexed getting-started doc — coverage fix paying off)
- S4 (9.2s): actions=[] — profile/security-settings would be nicer
- Citations: authentication-mfa, api/authentication, security-posture, auth-how-to

## Stage latency profile (CPU q4)

| Stage | Range | Share |
|---|---|---|
| S0 decompose | 13–25s | ~20% |
| S1 retrieve (embed+pgvector, parallel queries) | 0.4–0.9s | <2% |
| S2 coverage check | ~9s × iters | ~15-20% |
| S3 answer (prose) | 34–66s | ~50-60% |
| S4 action select | 8–9s | ~10% |

## Verified behaviors

- Model selects correct routes when choosing from full census (closed space)
- Early-exit guard works: S2 iter with +0 new chunks → break (saves ~9s)
- Multilingual embedder handles untranslated Italian queries (S0 didn't
  translate — still retrieved well; supports dropping rewrite in Phase 2.1)
- actions=[] is now a legitimate outcome (no candidates fit), not a contract
  failure

## Known weaknesses recorded

- S2 `sufficient=false` on every covered turn — coverage checker too
  pessimistic; emits doc-names not queries ("missing":["RBAC"]).
- S3 dominates latency; cap answer tokens to reduce.
- Template routes (`[uuid]`, `[code]`) selectable but need param resolution.
- Admin answer cites rbac "Admin bypass" (is_admin) — true to docs but not
  the UI workflow; KB content gap, deferred by user decision.
