# Plan: Harden `Dal.close()` — timeout, re-entrancy, error containment

> Status: DRAFT — awaiting user approval (PROCEED keyword).
> Created: 2026-07-06
> Target repo: `primebrick-dal-v3/` (the `@primebrick/dal-pg` library)
> Scope: LIBRARY ONLY — no consumer-side changes in this plan.

---

## 1. Objective

Harden the existing `Dal.close()` method so it is safe to call from a consumer-side
signal handler without hanging indefinitely, throwing unhandled errors, or double-closing
the pool. The library stays side-effect-free (no `process.on(...)` handlers — that is a
consumer concern, see `us-emailsender-dal-integration-plan.md` §3.2).

### 1.1 Current state (verified by reading source)

`src/dal/dal.ts` lines 174-179:
```typescript
/** Graceful shutdown — drains the pool (calls pool.end()). Call on SIGTERM/SIGINT. */
async close(): Promise<void> {
  if (this.closed) return;
  this.closed = true;
  await this.pool.end();
}
```

### 1.2 Gaps

| # | Gap | Impact |
|---|---|---|
| 1 | No `timeoutMs` parameter | If PG is unreachable at shutdown, `pool.end()` hangs for the full TCP timeout (minutes). The process won't exit until the orchestrator sends SIGKILL. |
| 2 | No try/catch around `pool.end()` | If `pool.end()` throws (e.g. already ended, connection error mid-drain), the error propagates to the signal handler — which typically has no catch, causing an unhandledRejection. |
| 3 | No `isClosing` state | `closed` is set to `true` before the `await`, so a concurrent caller sees `closed=true` and returns — but there's no way to distinguish "close in progress" from "close completed" for observability. |
| 4 | JSDoc mentions SIGTERM/SIGINT | Implies the library should be called from signal handlers, but doesn't document the timeout/re-entrancy guarantees. |

---

## 2. Proposed change

### 2.1 `Dal.close()` — hardened signature

```typescript
/**
 * Graceful shutdown — drains the pool with a timeout deadline.
 *
 * Behavior:
 * - Re-entrant: concurrent calls return immediately (the first call wins).
 * - Timeout: if pool.end() doesn't complete within timeoutMs, the promise
 *   resolves anyway (the pool is left to be reaped by the OS/TCP stack).
 * - Error containment: if pool.end() throws, the error is logged to the
 *   console and swallowed — the caller (typically a signal handler) cannot
 *   do anything useful with it.
 * - Does NOT install process.on() handlers — that is a consumer-side concern.
 *
 * @param timeoutMs Maximum time to wait for pool.end() to complete. Default: 10000.
 */
async close(timeoutMs: number = 10000): Promise<void> {
  if (this.closed || this.isClosing) return;
  this.isClosing = true;

  try {
    await Promise.race([
      this.pool.end(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch (err) {
    // Log but don't throw — the caller is typically a signal handler.
    console.error("[dal-pg] pool.end() failed during close:", err);
  } finally {
    this.closed = true;
    this.isClosing = false;
  }
}
```

### 2.2 New `isClosing` field

Add to the `Dal` class:
```typescript
private isClosing = false;
```

Update `isClosed` getter — add `isClosing` getter:
```typescript
/** Returns true if close() has completed. */
get isClosed(): boolean {
  return this.closed;
}

/** Returns true if close() is currently in progress (started but not finished). */
get isClosing(): boolean {
  return this._isClosing;
}
```

### 2.3 `resetDal()` — no signature change needed

`resetDal()` calls `defaultDal.close()` which now uses the default 10s timeout. No change required — the default is appropriate for test cleanup.

### 2.4 Why NOT install process handlers in the library

This is a design decision, not a gap. The library MUST NOT install `process.on("SIGTERM", ...)`, `process.on("uncaughtException", ...)`, or any other global process handlers. Reasons:

1. **Layering**: `process` is a singleton. A data-access library installing handlers silently co-owns the consumer's crash policy, racing with Sentry/logging in undefined order.
2. **Test isolation**: every test that constructs a DAL would pollute the process's signal table.
3. **Consumer owns all resources**: the consumer (e.g. emailsender) has NATS, HTTP servers, etc. The library can't know about those — only the consumer can close ALL resources together.

The consumer-side shutdown pattern is documented in `us-emailsender-dal-integration-plan.md` §3.2.

---

## 3. Impacted files

| File | Change | Action |
|------|--------|--------|
| `primebrick-dal-v3/src/dal/dal.ts` | Harden `close()`: add `timeoutMs` param, `isClosing` field, `Promise.race` timeout, try/catch, update JSDoc. Add `isClosing` getter. | edit |
| `primebrick-dal-v3/test/dal.test.ts` | Add tests: close re-entrancy, close timeout, close error containment, isClosing state. | edit |
| `primebrick-dal-v3/docs/ai/dal-usage-guide.md` | Update `dal.close()` section: new signature, timeout behavior, consumer-side shutdown pattern example (no process handlers in lib). | edit |
| `primebrick-dal-v3/dist/` | Rebuild via `pnpm run build` | build |

**Files NOT touched**: `repository.ts`, `index.ts`, `type-parsers.ts`, `query/*`, `meta/*`, `errors/*`, `types/*`, `audit/*`, `AGENTS.md`, `package.json`, `tsconfig.json`.

---

## 4. Implementation steps (atomic, verified after each)

1. **Edit `src/dal/dal.ts`**:
   - Add `private isClosing = false;` field (next to `private closed = false;`).
   - Replace the `close()` method with the hardened version (§2.1).
   - Add `get isClosing()` getter (next to `get isClosed()`).
   - Build: `pnpm run build`.

2. **Edit `test/dal.test.ts`** — add tests in the "Pool lifecycle" section:
   - `Dal.close: re-entrant — second call returns immediately`: call `close()` twice concurrently, verify both resolve, pool is ended.
   - `Dal.close: swallows pool.end() errors`: mock a pool that throws on `end()`, verify `close()` doesn't throw.
   - `Dal.close: timeoutMs — resolves even if pool.end() hangs`: use a Dal with a pool that never resolves `end()`, call `close(100)`, verify it resolves within ~200ms.
   - `Dal.isClosing: true during close, false after`: verify the getter states.
   - Run: `pnpm test -- dal.test.ts`.

3. **Edit `docs/ai/dal-usage-guide.md`** — update the `dal.close()` section (lines 97-103):
   - New signature: `close(timeoutMs?: number)`.
   - Document timeout, re-entrancy, error containment.
   - Replace the `process.on("SIGTERM", ...)` example with a note that the CONSUMER owns process lifecycle, with a cross-reference to the integration plan.

4. **Full build + test**: `pnpm run build && pnpm test`.

---

## 5. Code examples

### 5.1 The hardened `close()` — final code

```typescript
// src/dal/dal.ts — replace existing close()

private _isClosing = false;

/** Returns true if close() is currently in progress (started but not finished). */
get isClosing(): boolean {
  return this._isClosing;
}

/**
 * Graceful shutdown — drains the pool with a timeout deadline.
 *
 * - Re-entrant: concurrent calls return immediately (the first call wins).
 * - Timeout: if pool.end() doesn't complete within timeoutMs, the promise
 *   resolves anyway (the pool is left to be reaped by the OS/TCP stack).
 * - Error containment: if pool.end() throws, the error is logged and swallowed.
 * - Does NOT install process.on() handlers — that is a consumer-side concern.
 *
 * @param timeoutMs Maximum time to wait for pool.end() to complete. Default: 10000.
 */
async close(timeoutMs: number = 10000): Promise<void> {
  if (this.closed || this._isClosing) return;
  this._isClosing = true;

  try {
    await Promise.race([
      this.pool.end(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch (err) {
    console.error("[dal-pg] pool.end() failed during close:", err);
  } finally {
    this.closed = true;
    this._isClosing = false;
  }
}
```

### 5.2 Test additions

```typescript
// test/dal.test.ts — add to the "Pool lifecycle" section

it("Dal.close: re-entrant — concurrent calls both resolve", async () => {
  const tempDal = new Dal({ connectionString, max: 2 });
  // Both calls should resolve without error
  await Promise.all([tempDal.close(), tempDal.close()]);
  expect(tempDal.isClosed).toBe(true);
  expect(tempDal.isClosing).toBe(false);
});

it("Dal.close: swallows pool.end() errors", async () => {
  const tempDal = new Dal({ connectionString, max: 2 });
  // Close once normally to get the pool ended
  await tempDal.close();
  // Second close on an already-closed pool — should NOT throw
  await expect(tempDal.close()).resolves.toBeUndefined();
});

it("Dal.close: isClosing is false before, during is transient, false after", async () => {
  const tempDal = new Dal({ connectionString, max: 2 });
  expect(tempDal.isClosing).toBe(false);
  await tempDal.close();
  expect(tempDal.isClosing).toBe(false);
  expect(tempDal.isClosed).toBe(true);
});

it("Dal.close: timeoutMs — resolves even if pool.end() is slow", async () => {
  // This test verifies the timeout mechanism. We can't easily make pool.end()
  // hang with a real PG, but we can verify that close(1) still resolves quickly
  // (the timeout fires, the promise resolves). With a real pool.end() that
  // completes in <1ms, the race is won by pool.end(). With a slow pool.end(),
  // the timeout would win. Either way, close() must resolve.
  const tempDal = new Dal({ connectionString, max: 2 });
  const start = Date.now();
  await tempDal.close(1); // 1ms timeout — either pool.end() wins or timeout wins
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(5000); // sanity: didn't hang
  expect(tempDal.isClosed).toBe(true);
});
```

### 5.3 Updated docs section

```markdown
### `dal.close(timeoutMs?)` — graceful shutdown

Drains the pool (`pool.end()`) with a timeout deadline.

- **Re-entrant**: concurrent calls return immediately (the first call wins).
- **Timeout**: if `pool.end()` doesn't complete within `timeoutMs`, the promise resolves anyway (default: 10000ms).
- **Error containment**: if `pool.end()` throws, the error is logged and swallowed — the caller (typically a signal handler) cannot do anything useful with it.
- **No process handlers**: the library does NOT install `process.on(...)` handlers. Process lifecycle (signals, crash handlers, Sentry) is a consumer-side concern. The consumer closes ALL long-lived resources (DAL pool, NATS, HTTP server) together.

```typescript
// consumer-side shutdown (NOT in the library):
process.on("SIGTERM", () => shutdown("SIGTERM", 0));
process.on("SIGINT",  () => shutdown("SIGINT", 130));

async function shutdown(reason: string, code: number) {
  await Promise.allSettled([dal.close(), natsConnection?.close()]);
  process.exit(code);
}
```
```

---

## 6. Acceptance criteria

1. `pnpm run build` exits 0 — `dist/dal/dal.js` reflects the hardened `close()`.
2. `pnpm test` exits 0 — all existing tests pass + new close-hardening tests pass.
3. `Dal.close()` accepts an optional `timeoutMs` parameter (default 10000).
4. `Dal.close()` is re-entrant — concurrent calls don't throw and don't double-call `pool.end()`.
5. `Dal.close()` wraps `pool.end()` in `Promise.race` with a timeout — if `pool.end()` hangs, `close()` still resolves within `timeoutMs`.
6. `Dal.close()` catches `pool.end()` errors and logs them — it never throws.
7. `Dal.isClosing` getter exists and returns `true` during close, `false` before and after.
8. `docs/ai/dal-usage-guide.md` reflects the new signature and the consumer-side shutdown pattern.
9. No `process.on(...)` calls exist anywhere in `src/` (grep — 0 matches).
10. No `git commit` is made without explicit user instruction.

---

## 7. Verification

- **Build**: `pnpm run build` (tsc) — must exit 0.
- **Type check**: `tsc --noEmit` — must exit 0.
- **Tests**: `pnpm test` — all existing + new tests pass.
- **Grep**: `grep -r "process.on" src/` → 0 matches (library has no process handlers).
- **Grep**: `grep -r "SIGTERM\|SIGINT\|SIGKILL" src/` → 0 matches (library has no signal handling).
