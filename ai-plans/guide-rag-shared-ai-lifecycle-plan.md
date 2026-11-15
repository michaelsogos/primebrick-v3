# Plan — Guide RAG and Shared AI Turn Lifecycle (Regex/JSON Regression-Safe)

> Continuation of `guide-assistant-kb-plan.md` and `guide-actions-navigate-mcp.md`. The implementation fixed the shared worker lifecycle, Guide rewrite, ingestion logic, score persistence, and E2E fixture restore. Remaining blockers: explicit approval to reindex the local KB (the indexer deletes stale chunks) and an attachable Edge/CDP session for the Guide browser E2E.

## Status: 🟡 PARTIALLY DONE — Plan date: 2026-10-01 21:50 UTC / 23:50 Europe/Rome

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Make the E2E fake-provider fixture snapshot and restore the pre-test provider row | ✅ done | 2026-10-01 | Snapshot/conditional restore is implemented and verified. A later Edge-launch failure left `127.0.0.1:55093`; guarded restore returned the row to `127.0.0.1:53162`, `test@primebrick.local`, version 349. No E2E profile rows remain. |
| 2 | Fix and unit-test the E2E `mergeTestScoreTurns` SQL parameter binding | ✅ done | 2026-10-01 | `buildTestScoreUpdate` now binds only contiguous placeholders; measured and unmeasured branches are covered. Regex/JSON score persistence succeeded after the fix. |
| 3 | Add focused unit coverage for `useAiAssistant` turn lifecycle, sync/async transforms, errors, and one-off generation serialization | ✅ done | 2026-10-01 | Tests cover visible busy state, preflight success/failure, local responses, public one-off rejection, model-history preservation, structured choices, and worker serialization. |
| 4 | Separate “turn is busy” from “worker is generating” and provide a serialized internal preflight-generation path | ✅ done | 2026-10-01 | The worker emits `generation_idle` only after clearing `is_generating`; FE resolves after that event. This fixed the observed `Model not loaded or already generating` race while keeping public one-off collision protection. |
| 5 | Wire Guide retrieval through that preflight path and fail closed when rewrite/search/context preparation fails | ✅ done | 2026-10-01 | Guide validates the rewrite, embeds the English query, passes keywords to the unchanged search endpoint, fails closed on infrastructure errors, and returns a localized local response on no hits. Unit tests cover these branches. |
| 6 | Make MDX frontmatter parsing CRLF-safe and cover LF/CRLF fixtures | ✅ done | 2026-10-01 | LF/CRLF tests pass; parser removes frontmatter and preserves the title. |
| 7 | Enrich the embedding input with title/heading context and make incremental hashes cover the exact embedding input; reindex the KB | ✅ done | 2026-10-02 | Reindex executed: 105 docs, 1281 chunks embedded, 3 stale docs deleted, 0 errors. `rbac.mdx` now has title `RBAC` and no frontmatter chunk. |
| 8 | Build a Guide retrieval eval set and measure recall/ranking before changing thresholds or model tuning | ✅ done | 2026-10-02 | 14-case eval on the reindexed KB: Recall@4 = 9/12 (0.75), MRR@4 = 0.625, 1/2 false-positive on uncovered questions at threshold 0.25. English queries score 0.35–0.83; Italian queries cluster at 0.22–0.57 — confirms the English rewrite is load-bearing. See eval section below. |
| 9 | Replace the route-regex CTA fallback with a generic, fixed action contract grounded in retrieved evidence and existing tool metadata | ✅ done | 2026-10-02 | Generic bounded `AiAction` parsing implemented; live E2E shows the model emits 1 action chip per turn (navigate). |
| 10 | Add Guide + Regex + JSON E2E regressions and verify inline status, retry, choices, actions, and non-interference | ✅ done | 2026-10-02 | New `ai-guide-quality.spec.ts` (live RAG, no mocks): 5/5 turns, score 4.00 persisted to `guide_test_score`, rank recomputed 4.4. Citations render (2–4 per covered turn), no-doc fallback correct. Known gaps found live: ~11.5s/turn latency (speed bucket 0) and the "make user admin" answer cites `role_mappings` internals instead of the UI procedure — KB content gap, not a retrieval bug. |
| 11 | Empirical analysis: parallel reindex, embedding model suitability, source coverage | ✅ done | 2026-10-02 | (a) Embed = ~26ms/chunk on real-size texts (~33s floor vs 101.5s measured); DB trivial (0.7ms/upsert); ONNX already multithreads → per-source parallelism NOT worth it, stale-doc reconciliation must stay serialized anyway. (b) `paraphrase-multilingual-MiniLM-L12-v2` tested: same 384-dim drop-in, IT query sim 0.077→0.695. (c) Coverage gap found: only `pages/*/guide/**` was indexed (76/96 MDX). |
| 12 | Apply measured improvements: full-page MDX coverage, multilingual embedding model, cerebellum `min_similarity` | ✅ done | 2026-10-02 | Loader now indexes all `pages/**/*.mdx` (96+29=125 docs). Embedding switched to `paraphrase-multilingual-MiniLM-L12-v2` on BOTH ingestion and FE worker; `content_hash` now covers `provider.name` so model changes auto-invalidate (full reindex: 1494 chunks, 120s, 0 errors). `min_similarity` lives in `execution_config` (cerebellum): guide row set to 0.35; code default 0.35. E2E re-run: 5/5, score 4.20, T5 no-doc fallback correct again. |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## 1. Verified analysis and cross-assistant impact

### Confirmed initial Guide retrieval defect (fixed)

The original shared `sendMessage()` set `_state.is_streaming = true` before awaiting the Guide transform. The transform called public `generateOneOff()`, which refused to run during an active turn; the Guide then silently fell back to raw Italian with no keywords. The implementation now uses a turn-scoped serialized preflight and treats invalid rewrite output as an error instead of a fallback.

The worker still rejects concurrent generation (`is_generating`), so removing the public `generateOneOff()` guard would be unsafe. The worker now posts `generation_idle` only after clearing its own flag; the FE waits for that acknowledgement before starting the next generation, while the user bubble, thinking indicator, and send lock stay active for the whole turn.

### What the refactor does to Regex and JSON

- **Regex:** `transform_user_content` is synchronous and only injects `Current regex:` when its intent detector sees a modification request. Pending-choice classification calls `generateOneOff()` in the Regex wrapper *before* `ai.sendMessage()` and is protected by `ai.state.is_streaming`; test-example generation is a separate action. There is no current nested one-off inside the sync transform. Normal turn behavior should therefore remain unchanged if the new internal preflight capability is opt-in and serialized.
- **JSON:** there is no `transform_user_content` hook. Pending-choice classification and the key-picker interceptor run in the wrapper before `ai.sendMessage()`. `process_response` extracts, validates, and may call `regenerate()` for one repair round. `sendModelMessage()` intentionally bypasses the wrapper's pending-choice classifier. These contracts must remain unchanged; especially do not route classifier turns through the new Guide-only preflight path.
- The shared pre-append change makes the visible user message appear before an awaited transform. For Regex's synchronous transform and JSON's identity path this is effectively the same event turn; the risk is shared busy/error semantics, not a demonstrated functional regression in their current wrappers.
- The additive `setError` exposure is currently unused by Regex/JSON. Keep it optional/compatible or remove forwarding if the final design no longer needs it.

### Empirical test results from this session

- FE Vitest: **361/361 passed** across 23 files. `pnpm check` reported 0 Svelte/TypeScript errors and 0 warnings.
- US AI unit suite: **13/13 passed** across three files; `pnpm exec tsc --noEmit` passed. Coverage includes LF/CRLF frontmatter, enriched embedding input, and title-change re-embedding.
- Playwright quality E2E on the existing FE/BE and Qwen2.5-Coder-3B q4f16:
  - Regex: **5/5** turns correct; persisted score **4.60**.
  - JSON: **4/5** turns correct; T1 produced no JSON candidate, T2–T5 were exact; persisted score **4.67**.
  - After the worker-idle fix, neither flow reported `Model not loaded or already generating`; the score helper persisted both cases.
- Guide browser E2E remains unverified. The runner could not attach to the existing Edge/CDP session; launching the same persistent profile exited with “opening in existing browser session.” Earlier attempts reached Guide initialization but did not reach `docs/search`.
- Shared composable and Guide unit coverage now exercises the lifecycle, rewrite/search handoff, fail-closed paths, response parsing, and source-grounded route CTAs.
- The Guide cerebellum DB row for Qwen2.5-Coder-3B q4f16 exists but its tunable values are all NULL. It inherits the model defaults (temperature 0, top_p 0.8, max_tokens 256, repetition_penalty 1.1, thinking disabled). Tuning is not the cause of the blocked rewrite.

### E2E fixture and local database state

The fake-provider fixture snapshots its previous row and restores only if the row still matches the fixture written by that run. An Edge-launch failure skipped automatic teardown once; the same guarded helper restored the prior local row. Final read-only check: endpoint `http://127.0.0.1:53162`, `from_email='test@primebrick.local'`, version 349; no E2E user-profile rows remain. The local `app.smart.guide.ai.noDocumentation` translations were inserted for six locales and the matching Redis translation cache key was invalidated.

E2E score writes are verified in the successful Regex and JSON runs. The remaining Guide E2E failure is browser/session setup, not an assertion about RAG output.

### Retrieval eval results (2026-10-02, reindexed KB, limit 4, threshold 0.25)

14 questions (IT + EN paraphrases + uncovered controls), cosine + keyword-boost scoring identical to `searchDocsKb`:

- **Recall@4: 9/12 (0.75)**, MRR@4: 0.625.
- **English queries are strong**: relevant hits at 0.35–0.83 (e.g. "how do permissions and RBAC work" → rbac.mdx at 0.829).
- **Raw Italian is weak**: 0.22–0.57; "come rendo un utente admin?" and "dove gestisco gli utenti?" MISS below threshold. The English rewrite step is therefore mandatory for IT input — confirms the fail-closed design (never embed raw Italian).
- **Threshold 0.25 is too permissive for English noise**: uncovered "how do I deploy to Kubernetes?" produced 4 hits ≥ 0.25 (max 0.389). Candidate new threshold: ~0.40 separates covered EN queries (min observed 0.35 — borderline) from noise; needs a second eval pass if raised.
- **KB content gaps** (not retrieval bugs): no doc describes the UI procedure to assign the `administrators` role; `navigation-map` user chunk exists but is not surfaced by IT phrasing until rewrite.

## 2. Intended architecture

Keep `is_streaming` as the public turn/busy contract only if its semantics remain stable for existing panels; internally distinguish the active turn from an actual worker generation. The shared composable should own a serialized flow:

```text
sendMessage
  → mark turn busy + append visible user message
  → optional assistant preflight (Guide: rewrite → embed → docs search)
      → serialized internal one-off generation while worker is otherwise idle
  → transform/inject final user content
  → normal generation
  → post-process choices/sources/actions
  → release turn busy in finally
```

The internal preflight should receive a narrow capability (or a dedicated typed hook) rather than bypassing the public `generateOneOff()` guard. Public one-offs, Regex/JSON pending-choice classifiers, and model example generation remain protected against worker overlap. A failed preflight shows a recoverable error and sends no final answer; Regex/JSON sync hooks continue through the same path without a visible delay.

No BE endpoint signature or behavior changes are planned. No AI-specific API backdoor is allowed. Documentation search remains the existing standard REST endpoint; mutations/actions continue through the current MCP dispatch, session credentials, confirmation UI, and normal RBAC.

## 3. Retrieval and ingestion design

- Normalize MDX line endings or make frontmatter parsing accept both CRLF and LF, with a regression test proving title extraction and frontmatter removal.
- Build a canonical embedding input from document title, section/heading path, and chunk content. The incremental content hash must be derived from this exact embedding input, not content-only; otherwise unchanged chunks would incorrectly skip new embeddings.
- Reindex after the ingestion change via the existing manual reindex path. Do not introduce cron/CI ingestion.
- Only after rewrite is proven live, evaluate the returned candidates. The current search takes vector candidates, adds ILIKE keyword boosts within that candidate set, and returns four chunks; FE then applies a fixed similarity floor. Add evaluation evidence before changing `top_k`, the floor, or cerebellum settings.
- If relevant content is still missed, compare (a) vector-only, (b) lexical/keyword-only candidates, and (c) a hybrid rank fusion with per-document diversification. Do not add a hardcoded route/entity parser as a substitute for retrieval.

## 4. Actions/choices compatibility

Regex and JSON `choices` are structured domain outputs (`RegexChoice` / `JsonAssistantChoice`) and must not be conflated with Guide `AiAction` CTAs. Their click and natural-language pending-choice flows remain as-is.

For Guide, do not expand `ROUTE_RE` or add per-endpoint/per-entity parsing. After RAG is stable, retain one versioned generic response/action schema (`answer` plus a bounded list of typed `navigate`/`tool` actions) and validate it once. Navigation routes must be grounded in retrieved route documentation/source-of-truth; tool calls use the existing standard tool registry and metadata, never new AI-specific endpoints. If the local model cannot reliably emit the generic action envelope, the UI must fall back to source-backed navigation or no CTA—not synthesize a mutation from prose.

## 5. Test strategy and acceptance criteria

### Unit tests

1. Shared composable with sync transform: existing turn message order, choices, and final streaming state unchanged.
2. Shared composable with async transform: user message and thinking indicator appear while pending; final generation starts only after preflight resolves.
3. Async transform rejection: user message remains, error is retryable, no final generation is posted, and `finally` releases the busy state.
4. Guide preflight: verify `generateOneOff` is actually invoked once, English query/keywords reach `searchDocs`, failed rewrite is observable (not silent raw-text success), and failed retrieval prevents answer generation.
5. Worker serialization: public one-off is still rejected during a real generation; the internal Guide preflight runs only while the worker is idle; no overlapping `generate` messages.
6. Regex and JSON wrapper tests: pending-action classifier still happens before regular send; sync Regex context injection and JSON `process_response`/repair/`sendModelMessage` remain correct.
7. US ingestion tests: LF and CRLF frontmatter parsing, title metadata, no frontmatter chunk, and changed embedding-input hash causes re-embedding.
8. E2E score-helper tests: both measured and unmeasured SQL branches bind only placeholders present and do not alter unrelated phases.

### Browser E2E

- Re-run the Regex 5-turn suite and JSON conversation + pending-actions/navigation suites after fixture isolation is fixed; preserve their existing score phases.
- Guide: cover the Italian admin question, a supported UI procedure, a no-answer question, retrieval failure, retry, and action/source rendering. Verify Network query is English with keywords, top hits include the expected docs chunk, and no answer generation occurs when retrieval is unavailable.
- Assert the Guide keeps the pending/thinking indicator visible from send through retrieval and final generation.
- E2E must never use the dev `admin`; use the ephemeral E2E actor only. Ensure all service fixtures are restored and score persistence succeeds before claiming a suite passed.

### Definition of done

- Guide search demonstrably uses the translated query + extracted keywords before final generation.
- Search-unavailable and no-sufficient-evidence cases do not produce unsupported procedural answers.
- Shared preflight changes pass the same Regex/JSON E2E behaviors and their unit tests.
- CRLF MDX is correctly parsed and indexed; reindex metrics show changed chunks embedded.
- Retrieval evaluation supports any ranking/threshold/model tuning decision with recorded measured results.
- Test setup leaves provider/configuration state unchanged; E2E score helper updates only intended test-score phases.
- No backend endpoint contract or RBAC policy is changed.
