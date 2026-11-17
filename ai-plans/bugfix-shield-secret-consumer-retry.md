# Bugfix: client-shield secret — consumer refetch has no retry (post-rotation outage = permanent 401 wall)

**Status:** 🟠 planned — awaiting PROCEED
**Repos:** `primebrick-v3-sdk` (single repo)
**Incident date:** 2026-11-17 — JH rejected every `/svc/job/*` proxied call with
`AUTH_CLIENT_SHIELD_SECRET_INVALID` for ~30 min; healed accidentally via a
`bun --hot` file-watch reload.

## Task checklist

| # | Task | Status | Commit | Repo |
|---|------|--------|--------|------|
| 1 | `rotating-secret.ts` — `startSecretProvider`: invalidate → refetch with retry loop (mirror registry pattern), pending-refresh dedup, attempt/success logs | ⏳ not done | — | sdk |
| 2 | Extract shared `refreshSecretWithRetry(provider, ref)`; reuse it from the `create-microservice.ts` boot fallback (unifies bounded-30 × infinite-loop policy decision — see B.2) | ⏳ not done | — | sdk |
| 3 | `src/secrets/__tests__/rotating-secret.test.ts` (new): rotated→get-fails-then-succeeds recovers; rotated while engine down keeps retrying (fake timers); concurrent broadcasts → single loop; invalidate keeps module slot until refetch | ⏳ not done | — | sdk |
| 4 | Verify: `pnpm test` (vitest + standards), `tsc --noEmit`; runtime repro (kill BE → force rotation → restart BE → JH heals alone, no reload) | ⏳ not done | — | |
| 5 | Commit sdk develop + plan status update | ⏳ not done | — | |

---

## Part A — The incident (all evidence)

Timeline (UTC, logs are UTC; local = UTC+1):

1. `10:56:30` — BE rotates `service_client_shield_secret`, publishes
   `secret.rotated`, **and crashes in the same instant** (unhandled
   `OptimisticConcurrencyViolation` in `StaleDetectionJob.run` →
   `service-registry.service.ts:211`, version 29398 stale → node exits;
   `tsx watch` does NOT respawn on crash, only on file change —
   `be.log` tail).
2. `10:57 → 11:27` — BE down. JH's **client_shield_registry** snapshot loop
   retries every 5s (jh2.log attempts 358→370) — that resilience works.
   Its `secret.rotated` handler instead runs `invalidate()` then
   `provider.get()` → `callNats` fails once → handler rejects → the
   module slot (`setClientShieldSecretSlot`) keeps the **pre-rotation**
   secret forever.
3. `11:27:32` — new BE boots; JH re-enrolls shield key (`11:27:36/39`),
   registry re-aligns. The **secret** stays stale — nothing re-triggers
   the refetch (next broadcast is an hour away).
4. `11:53:36 → 11:56:36` — BE proxy logs 125×
   `[401] GET /api/v1/entities/job_run/meta → non-OK response` carrying
   `internal_code: AUTH_CLIENT_SHIELD_SECRET_INVALID`. The user session
   itself is FINE (SSE `user=admin` connected) — only the
   service-to-service shield fails.
5. `11:56:46` — a `bun --hot` reload re-runs the boot path →
   `shield key enrolled` + `secret-provider` fetch succeeds
   (`last rotated at 10:56:30`) → calls pass again. Accidental heal,
   not design.

## Part B — Root cause: asymmetric resilience

| Path | Retry? | Bound | Evidence |
|---|---|---|---|
| `client_shield_registry` snapshot | ✅ `for(attempt=1;;attempt++)` + 5s sleep + warn per attempt + deduped success log | unbounded | `client-shield-registry.ts:96-103` |
| Secret **boot** fetch (`create-microservice.ts:668-683`) | ✅ background loop, 10s sleep | **bounded 30 attempts (~5 min)** then `logger.error` "until rotation or restart" | inline IIFE |
| Secret **`secret.rotated` broadcast** refetch | ❌ `provider.get()` one-shot inside `subscribeShielded` handler | none — rejection = stale forever | `rotating-secret.ts:198-207` |

The previous shield hardening (`8c69bfa` stale-snapshot recovery,
`72767c8` self-heal, `4db20fc` reconnect resilience, `253bcf4` tests)
covered the **NATS registry** path — which is exactly why it survived
this incident. The rotating-secret **consumer refetch** has no
equivalent: one failed `callNats` = permanent wall.

### B.1 Why the stale slot persists even after `invalidate()`

`provider.invalidate()` clears only the provider's internal `cache`
Map (`rotating-secret.ts:184-186`). The inbound verifier reads the
module-level slot set by `setClientShieldSecretSlot` via
`applyClientShieldSlot` (`:79,120,176,188-190`) — untouched by
invalidate. That behavior is *correct* during rotation (previous+grace
window keeps calls passing); the bug is only that nothing retries the
refetch after the broadcast-driven get fails.

### B.2 Design decision to take (in-plan)

Unify on the **unbounded** loop (registry precedent) rather than the
bounded boot loop (30×10s): a secret-miss is a total inbound outage,
so "give up after 5 min" contradicts the boot comment's own rationale
("must not become a permanent wall"). Extracting one shared helper
lets the boot path reuse it and drops the duplicated inline IIFE.

## Part C — Implementation

### C.1 `src/secrets/rotating-secret.ts`

```ts
// New — shared consumer-side resilience (mirrors the registry loop):
const refreshing = new Set<string>();                    // dedup key = refKey
async function refreshSecretWithRetry(
  provider: SecretProvider,
  ref: RotatingSecretRef,
): Promise<void> {
  const k = `${ref.scope}/${ref.name}`;
  if (refreshing.has(k)) return;                          // broadcasts coalesce
  refreshing.add(k);
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        const slot = await provider.get(ref);             // re-caches + applies slot
        logger.info(`The service client-shield secret was rotated upstream — local copy refreshed (rotated at ${new Date(slot.rotated_at).toISOString()}).`,
          { tags: ["secret-provider"], ...(attempt > 1 ? { attempts: attempt } : {}) });
        return;
      } catch (error) {
        logger.warn(`client-shield secret refresh attempt ${attempt} failed — retrying in 5s`,
          { tags: ["secret-provider"], error });
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } finally {
    refreshing.delete(k);
  }
}
```

`startSecretProvider` becomes:

```ts
export async function startSecretProvider(provider: SecretProvider): Promise<void> {
  await subscribeShielded(SECRET_SUBJECTS.ROTATED, (payload) => {
    const { scope, name } = payload as RotatingSecretRef;
    provider.invalidate(scope, name);
    void refreshSecretWithRetry(provider, { scope, name });  // detached: never reject the sub handler
  });
}
```

Notes:
- Handler must not `await` the loop — `subscribeShielded` callbacks
  rejecting is what silently killed the refresh; detached + deduped.
- `provider.invalidate()` stays before the loop (cache cleared → the
  next `get` fetches; module slot keeps serving previous+grace).
- `refreshing` dedup prevents stacked loops on back-to-back broadcasts.

### C.2 `src/microservice/create-microservice.ts`

Replace the inline bounded IIFE (`:668-683`) with
`void refreshSecretWithRetry(secretProvider, CLIENT_SHIELD_SECRET_REF)`
(export the helper). Keeps the same warn→retry→log shape, removes the
30-attempt wall. The "engine unreachable" warn + static-config fallback
comment stay.

### C.3 Tests — `src/secrets/__tests__/rotating-secret.test.ts`

Vitest, fake timers, `callNats`/`subscribeShielded` mocked at module
boundary (pattern of `src/auth/__tests__/`):

1. **rotated → get fails ×3 → succeeds** → slot refreshed, attempts
   logged, loop exits.
2. **rotated while engine down → keeps retrying** → advance timers past
   N failures → heal → success; asserts no give-up (the incident repro).
3. **two broadcasts mid-retry** → single loop (call count on get
   unchanged by the second broadcast; `refreshing` dedup).
4. **invalidate semantics** — provider cache cleared, module slot
   untouched until refetch (documents B.1 deliberately).
5. **boot path** — `create-microservice` retry now unbounded: engine
   down >5 min still heals on its return (guards the B.2 policy).

## Part D — Out of scope (documented, not dropped)

- **BE crash cause** — the unhandled `OptimisticConcurrencyViolation`
  in `StaleDetectionJob.run` → `updateByCodeAndBaseUrl` is a BE-side
  defect (a sweep job should catch OCV and re-read, not propagate).
  It triggered this incident but is a separate bugfix.
- **Broadcast missed entirely** (NATS gap while consumer reconnects):
  the post-`8c69bfa` reconnect resilience covers re-subscription; a
  defensive periodic slot-reconcile (e.g. every `rotationMs` re-`get`)
  is a cheap belt if ever needed — not bundled.
- **`tsx watch` not respawning on crash** — dev-tooling behavior, not
  product; the real fix is services crashing less (see D.1).

## Acceptance criteria

1. Repro scenario green: BE killed → secret rotated (or simulated via
   `secret.rotated` publish) → BE restarted → **without touching the
   consumer**, its next refetch lands and proxied calls pass — visible
   as `secret refresh attempt N failed` warns then
   `local copy refreshed` in the service log.
2. All new tests green; `pnpm test` + `tsc --noEmit` clean.
3. No behavioral change on the happy path (single broadcast → single
   get → one info log, same as today).

## Sanity-check commands (TOC)

```bash
cd primebrick-v3-sdk && pnpm vitest run src/secrets/__tests__/rotating-secret.test.ts
cd primebrick-v3-sdk && tsc --noEmit
# live repro: taskkill BE → bun publish secret.rotated → restart BE →
#   watch jh2.log for "secret refresh attempt" then "local copy refreshed"
#   → /svc/job/entities/job_run/meta returns 200 again
```
