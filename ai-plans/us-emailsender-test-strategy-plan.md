# Plan: emailsender Test Strategy — Two-Layer (Unit + Integration)

**Version:** 0.1.0
**Status:** DRAFT — awaiting approval
**Date:** 2026-07-02
**Scope:** `primebrick-us-v3/emailsender`

---

## 1. Objective

Replace the current mock-based unit tests with a **two-layer test suite**:

1. **Layer 1 — Pure unit tests** (no DB, no network, no mocks):
   Test functions that contain zero I/O. These are fast, deterministic, and
   test business logic in isolation.

2. **Layer 2 — Integration tests** (real PG, fake Brevo HTTP server):
   Test the full code paths that hit PostgreSQL. Uses the same pattern as
   the DAL lib's own test suite: real `DATABASE_URL`, real `Pool`, real SQL,
   `TRUNCATE` between tests for isolation. Brevo is replaced by a real local
   HTTP server (`http.createServer`) that returns canned responses — NOT a
   mock, a real endpoint the `fetch()` call hits.

**No `vi.mock()` calls anywhere.** The only test double is the fake Brevo
HTTP server, which is a real running process, not a vitest mock.

---

## 2. Entry point map — what calls PG

### 2.1 HTTP endpoints

| Endpoint | Method | Handler | Calls PG? | External I/O |
|----------|--------|---------|-----------|--------------|
| `/health` | GET | inline `http-server.ts` | NO | none |
| `/webhook` | POST | `WebhookService.handleWebhook()` | YES — 1 `dal.rawSql` UPDATE | none |

### 2.2 NATS subject

| Subject | Handler | Calls PG? | External I/O |
|---------|---------|-----------|--------------|
| `emailsender.send` | `EmailService.sendEmail()` | YES — 2 `dal.find` + 2 `dal.add` | Brevo HTTP POST |

### 2.3 Lifecycle services (called from `index.ts`)

| Service | Method | Calls PG? | External I/O |
|---------|--------|-----------|--------------|
| `ServiceRegistration` | `register()` | YES — 2 `dal.rawSql` (SELECT + INSERT/UPDATE) | none |
| `ServiceRegistration` | `updateHeartbeat()` | YES — 1 `dal.rawSql` UPDATE | none |

### 2.4 Pure functions (no I/O at all)

| Function | Location | Why it's pure |
|----------|----------|---------------|
| `BrevoClient.mapStatus()` | `providers/brevo.ts:62` | Synchronous map lookup, no I/O |
| `/health` response | `http-server.ts:51-54` | Returns `{ status: "healthy" }`, no I/O |
| `WebhookService.handleWebhook()` validation | `webhook-service.ts:19-39` | Throws before PG for: unsupported provider, missing message-id, missing event |
| `Handlebars.compile()` + render | `email-service.ts` | Pure string templating (but interleaved with DB calls — can only test in integration) |

### 2.5 Summary

```
/health (GET)         → NO PG  → Layer 1 (unit)
/webhook (POST)       → PG     → Layer 2 (integration)
emailsender.send      → PG     → Layer 2 (integration)
register()            → PG     → Layer 2 (integration)
updateHeartbeat()     → PG     → Layer 2 (integration)
mapStatus()           → NO PG  → Layer 1 (unit)
webhook validation    → NO PG  → Layer 1 (unit, throws before PG)
```

---

## 3. Architecture

### 3.1 Test directory structure

```
emailsender/
  src/
    services/
      __tests__/
        email-service.test.ts          ← DELETE (current mock-based tests)
    providers/
      __tests__/
        brevo.test.ts                  ← NEW — Layer 1: mapStatus pure unit tests
    server/
      __tests__/
        http-server.test.ts            ← NEW — Layer 1: /health + /webhook validation
    services/
      __tests__/
        webhook-service.validation.test.ts  ← NEW — Layer 1: validation throws
  test/
    helpers/
      setup.ts                         ← NEW — shared PG setup (DDL, truncate, seed)
      fake-brevo-server.ts             ← NEW — real HTTP server returning canned Brevo responses
    integration/
      email-service.integration.test.ts     ← NEW — Layer 2: sendEmail full path
      webhook-service.integration.test.ts   ← NEW — Layer 2: webhook UPDATE
      service-registration.integration.test.ts ← NEW — Layer 2: register + heartbeat
  vitest.config.ts                     ← UPDATE — add integration test config
  vitest.integration.config.ts         ← NEW — separate config for integration tests
```

### 3.2 Two vitest configs

**`vitest.config.ts`** (Layer 1 — unit tests, fast, no DB):
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
```

**`vitest.integration.config.ts`** (Layer 2 — integration tests, real PG):
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    globals: false,
    testTimeout: 15000,        // real DB calls are slower
    hookTimeout: 30000,        // DDL setup can take time
  },
});
```

**`package.json` scripts:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:integration:watch": "vitest --config vitest.integration.config.ts",
    "test:all": "vitest run && vitest run --config vitest.integration.config.ts"
  }
}
```

### 3.3 Fake Brevo server — NOT a mock

The fake Brevo server is a real `http.createServer` that listens on a random
port. `BrevoClient` is constructed with `apiEndpoint = http://127.0.0.1:<port>`.
The `fetch()` call in `BrevoClient.sendEmail()` hits the real HTTP server.

```typescript
// test/helpers/fake-brevo-server.ts
import { createServer, type Server } from "http";

export interface FakeBrevoConfig {
  /** What the /smtp/emails endpoint should return */
  responseStatus?: number;
  responseBody?: object;
  /** If set, the server returns this error status with this body */
  errorStatus?: number;
  errorBody?: object;
}

export async function startFakeBrevoServer(config: FakeBrevoConfig = {}): Promise<{
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
  receivedRequests: Array<{ headers: Record<string, string>; body: unknown }>;
}> {
  const receivedRequests: Array<{ headers: Record<string, string>; body: unknown }> = [];

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      receivedRequests.push({
        headers: req.headers as Record<string, string>,
        body: body ? JSON.parse(body) : null,
      });

      if (config.errorStatus) {
        res.writeHead(config.errorStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify(config.errorBody ?? { code: "error", message: "brevo down" }));
        return;
      }

      res.writeHead(config.responseStatus ?? 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(config.responseBody ?? { messageId: "fake-msg-id-123" }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        server,
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        receivedRequests,
      });
    });
  });
}
```

This is a **real HTTP server** — `fetch()` makes a real TCP connection, real
HTTP request, real HTTP response parsing. The only thing that's "fake" is the
response content. This tests the full `BrevoClient.sendEmail()` code path
including header construction, body serialization, response parsing, and error
handling — without hitting the real Brevo API.

### 3.4 Shared PG setup helper

Follows the DAL lib's pattern (`test/helpers/setup.ts`):

```typescript
// test/helpers/setup.ts
import "dotenv/config";
import pg, { Pool } from "pg";
import { getDal, resetDal, type DalConfig } from "@primebrick/dal-pg";

pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => BigInt(val));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => {
  const num = Number(val);
  if (!val.includes(".") && Math.abs(num) > Number.MAX_SAFE_INTEGER) return val;
  return num;
});

let pool: Pool | null = null;

export function getTestPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  pool = new Pool({ connectionString: url, max: 5 });
  return pool;
}

export async function closeTestPool(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}

/**
 * Initialize the Dal singleton for integration tests.
 * Call in beforeAll. resetDal() in afterAll.
 */
export async function initTestDal(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const schema = process.env.DB_SCHEMA || "emailsender";
  getDal({
    connectionString: url,
    schema,
    max: 5,
    statementTimeoutMs: 30000,
    applicationName: "emailsender-test",
  });
}

export async function resetTestDal(): Promise<void> {
  await resetDal();
}

/**
 * Truncate all emailsender tables between tests for isolation.
 */
export async function truncateEmailsenderTables(): Promise<void> {
  const db = getTestPool();
  await db.query(`
    TRUNCATE TABLE
      emailsender.email_config,
      emailsender.email_templates,
      emailsender.email_templates_communication_log,
      public.service_registry
    RESTART IDENTITY CASCADE;
  `);
}

/**
 * Seed test data: one Brevo config + one welcome template.
 */
export async function seedTestData(): Promise<void> {
  const db = getTestPool();
  await db.query(`
    INSERT INTO emailsender.email_config (provider, from_email, from_name, reply_to, is_active, created_at, created_by, updated_at, updated_by, version)
    VALUES ('brevo', 'no-reply@example.com', 'Example', NULL, true, NOW(), 'test', NOW(), 'test', 1);

    INSERT INTO emailsender.email_templates (code, language_iso, subject, body_html, body_text, is_active, created_at, created_by, updated_at, updated_by, version)
    VALUES ('WELCOME', 'en', 'Welcome {{name}}', '<b>Welcome {{name}}</b>', 'Welcome {{name}}', true, NOW(), 'test', NOW(), 'test', 1);
  `);
}
```

**IMPORTANT:** The `truncateEmailsenderTables` and `seedTestData` functions
assume the emailsender schema and tables already exist in the test database.
The DDL for creating them is managed by the database-patch tooling
(`build-entity-snapshot.ts` + `database-patch-to-sql.ts`), not by the test
suite. The test suite only seeds + truncates data, not schema.

---

## 4. Layer 1 — Pure unit tests (no DB, no network)

### 4.1 `src/providers/__tests__/brevo.test.ts`

Tests `BrevoClient.mapStatus()` — pure synchronous mapping.

```typescript
import { describe, it, expect } from "vitest";
import { BrevoClient } from "../brevo.js";

describe("BrevoClient.mapStatus", () => {
  // Construct with dummy values — mapStatus doesn't use them
  const client = new BrevoClient("dummy-key", "http://localhost:0");

  it("maps 'sent' → 'sent'", () => {
    expect(client.mapStatus("sent")).toBe("sent");
  });

  it("maps 'delivered' → 'delivered'", () => {
    expect(client.mapStatus("delivered")).toBe("delivered");
  });

  it("maps 'opened' → 'opened'", () => {
    expect(client.mapStatus("opened")).toBe("opened");
  });

  it("maps 'clicked' → 'clicked'", () => {
    expect(client.mapStatus("clicked")).toBe("clicked");
  });

  it("maps 'bounce' → 'bounced'", () => {
    expect(client.mapStatus("bounce")).toBe("bounced");
  });

  it("maps 'hardbounce' → 'bounced'", () => {
    expect(client.mapStatus("hardbounce")).toBe("bounced");
  });

  it("maps 'softbounce' → 'bounced'", () => {
    expect(client.mapStatus("softbounce")).toBe("bounced");
  });

  it("maps 'spam' → 'spam'", () => {
    expect(client.mapStatus("spam")).toBe("spam");
  });

  it("maps 'blocked' → 'blocked'", () => {
    expect(client.mapStatus("blocked")).toBe("blocked");
  });

  it("maps 'deferred' → 'deferred'", () => {
    expect(client.mapStatus("deferred")).toBe("deferred");
  });

  it("maps 'invalid' → 'failed'", () => {
    expect(client.mapStatus("invalid")).toBe("failed");
  });

  it("maps 'error' → 'failed'", () => {
    expect(client.mapStatus("error")).toBe("failed");
  });

  it("passes through unknown status unchanged", () => {
    expect(client.mapStatus("unknown_event")).toBe("unknown_event");
  });
});
```

**13 tests.** No DB, no network, no mocks. Runs in <1ms.

### 4.2 `src/server/__tests__/http-server.test.ts`

Tests the `/health` endpoint and the `/webhook` auth + validation layer
(throws before reaching PG). Uses Node's `http` module to make real requests
to the server.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";

// We test the routing logic by importing the server factory.
// For /health, no DB is needed. For /webhook auth, no DB is needed
// (auth check happens before webhookService.handleWebhook).
//
// We DON'T import createHttpServer directly because it constructs
// WebhookService in module scope (which requires BREVO_API_KEY).
// Instead, we replicate the routing logic test by testing the
// health endpoint in isolation.

// Actually — createHttpServer constructs WebhookService at module load.
// For the /health test, we can set BREVO_API_KEY to a dummy value.
// The /health path never touches WebhookService.

process.env.BREVO_API_KEY = "test-key";
process.env.WEBHOOK_API_KEY = "test-webhook-key";

import { createHttpServer } from "../../server/http-server.js";

describe("HTTP server — /health endpoint (no PG)", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = createServer(() => {}); // placeholder
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        server.close(() => resolve());
      });
    });
    // Now start the real server
    await createHttpServer(0); // listens on random port — but createHttpServer
    // doesn't return the server instance... see §6 step 4 for refactor.
  });

  // ... tests for /health returning { status: "healthy" }
  // ... tests for /webhook returning 401 when API key is wrong
  // ... tests for /webhook returning 404 for unknown paths
});
```

**NOTE:** `createHttpServer` currently doesn't return the `Server` instance,
so we can't close it in `afterAll` or get the actual port. **This needs a
small refactor** — see §6 step 4. The refactor is minimal: return the
`server` promise from `createHttpServer`.

**7 tests planned:**
1. `/health` returns 200 + `{ status: "healthy" }`
2. `/webhook` returns 401 when no auth header
3. `/webhook` returns 401 when wrong API key
4. `/webhook` returns 401 when Bearer prefix + wrong key
5. `/webhook` returns 401 when ApiKey prefix + wrong key
6. Unknown path returns 404
7. Wrong method on known path returns 404

### 4.3 `src/services/__tests__/webhook-service.validation.test.ts`

Tests `WebhookService.handleWebhook()` validation logic — the parts that
throw BEFORE reaching `dal.rawSql()`. These tests verify the error paths
that don't need PG.

**Problem:** `WebhookService` constructor requires `BREVO_API_KEY` and
constructs a `BrevoClient`. The `handleWebhook` method calls `getDal()` for
the UPDATE. So even the validation tests would need the DB if the validation
passes.

**Solution:** Test only the validation cases that throw BEFORE `getDal()`:
- Unsupported provider (throws at line 20)
- Missing message-id (throws at line 33)
- Missing event (throws at line 38)

These three cases throw before `getDal()` is called, so no DB is needed.
We set `BREVO_API_KEY` to a dummy value (constructor doesn't validate it
against Brevo — just stores it).

```typescript
import { describe, it, expect } from "vitest";

process.env.BREVO_API_KEY = "dummy-key";

import { WebhookService } from "../webhook-service.js";

describe("WebhookService.handleWebhook — validation (no PG)", () => {
  const service = new WebhookService();

  it("throws on unsupported provider", async () => {
    await expect(service.handleWebhook("sendgrid", {}))
      .rejects.toThrow("Unsupported provider: sendgrid");
  });

  it("throws on missing message-id", async () => {
    await expect(service.handleWebhook("brevo", { event: "sent" }))
      .rejects.toThrow("Missing message-id in webhook payload");
  });

  it("throws on missing event", async () => {
    await expect(service.handleWebhook("brevo", { "message-id": "abc" }))
      .rejects.toThrow("Missing event in webhook payload");
  });
});
```

**3 tests.** No DB, no network. The validation throws before `getDal()`.

---

## 5. Layer 2 — Integration tests (real PG, fake Brevo)

### 5.1 `test/integration/email-service.integration.test.ts`

Tests `EmailService.sendEmail()` end-to-end with real PG + fake Brevo.

**Setup:**
- `beforeAll`: init test Dal, start fake Brevo server, construct `EmailService`
  with `BREVO_API_ENDPOINT` pointing to fake server
- `beforeEach`: truncate tables, seed test data (config + template)
- `afterAll`: close Dal, close fake Brevo server

**Test cases:**

1. **Success — config + template found, Brevo sends, log inserted**
   - Call `sendEmail({ templateCode: "WELCOME", languageIso: "en", to: ["alice@example.com"], variables: { name: "Alice" } })`
   - Assert response: `success: true`, `providerMessageId: "fake-msg-id-123"`, `logId` is a number
   - Query DB directly: `SELECT * FROM emailsender.email_templates_communication_log WHERE provider_message_id = 'fake-msg-id-123'`
   - Assert: `status = 'sent'`, `provider = 'brevo'`, `type = 'email'`, `template_uuid` is not null, `sent_at` is not null, `interpolated_sent_message` contains "Welcome Alice"
   - Assert fake Brevo received exactly 1 request with correct `to`, `subject`, `htmlContent`

2. **Config not found — no Brevo config in DB**
   - Truncate `email_config` (remove the seeded config)
   - Call `sendEmail(...)`
   - Assert response: `success: false`, `error` contains "No email configuration found for Brevo"
   - Query DB: assert a failure log row exists with `status = 'failed'`, `error_message` contains "No email configuration"
   - Assert fake Brevo received 0 requests

3. **Template not found — wrong templateCode**
   - Call `sendEmail({ templateCode: "NONEXISTENT", languageIso: "en", to: [...] })`
   - Assert response: `success: false`, `error` contains "Template not found: NONEXISTENT (en)"
   - Query DB: assert failure log row with `status = 'failed'`
   - Assert fake Brevo received 0 requests

4. **Template not found — wrong languageIso**
   - Call `sendEmail({ templateCode: "WELCOME", languageIso: "fr", to: [...] })`
   - Assert response: `success: false`, `error` contains "Template not found: WELCOME (fr)"
   - Assert fake Brevo received 0 requests

5. **Brevo send fails — fake server returns 500**
   - Start fake Brevo with `errorStatus: 500`
   - Call `sendEmail(...)`
   - Assert response: `success: false`, `error` contains "Brevo API error"
   - Query DB: assert failure log row with `status = 'failed'`, `error_message` contains "Brevo API error"
   - Assert fake Brevo received 1 request (it was attempted)

6. **Handlebars rendering — variables interpolated correctly**
   - Call `sendEmail({ templateCode: "WELCOME", languageIso: "en", to: ["bob@example.com"], variables: { name: "Bob" } })`
   - Assert fake Brevo received request with `subject: "Welcome Bob"`, `htmlContent: "<b>Welcome Bob</b>"`
   - Query DB: assert log row `interpolated_sent_message` contains "Welcome Bob"

7. **Multiple recipients — cc and bcc**
   - Call `sendEmail({ templateCode: "WELCOME", languageIso: "en", to: ["a@example.com"], cc: ["b@example.com"], bcc: ["c@example.com"] })`
   - Assert fake Brevo received request with `to: [{ email: "a@example.com" }]`, `cc: [{ email: "b@example.com" }]`, `bcc: [{ email: "c@example.com" }]`

8. **Entity linkage — entityId + entityUuid passed through**
   - Call `sendEmail({ ..., entityId: 42, entityUuid: "abc-123-uuid" })`
   - Query DB: assert log row `entity_id = 42`, `entity_uuid = "abc-123-uuid"`

**8 integration tests.** Each hits real PG + real fake Brevo HTTP.

### 5.2 `test/integration/webhook-service.integration.test.ts`

Tests `WebhookService.handleWebhook()` — the UPDATE path with real PG.

**Setup:**
- `beforeAll`: init test Dal, construct `WebhookService`
- `beforeEach`: truncate, seed a communication log row with known `provider_message_id`
- `afterAll`: close Dal

**Test cases:**

1. **Updates status to 'delivered'**
   - Seed log row with `provider_message_id = "msg-1"`, `status = 'sent'`
   - Call `handleWebhook("brevo", { event: "delivered", "message-id": "msg-1" })`
   - Query DB: assert `status = 'delivered'`, `status_changed_at` is recent

2. **Updates status to 'bounced' with error_message**
   - Seed log row with `provider_message_id = "msg-2"`, `status = 'sent'`
   - Call `handleWebhook("brevo", { event: "bounce", "message-id": "msg-2", reason: "mailbox full" })`
   - Query DB: assert `status = 'bounced'`, `error_message = 'mailbox full'`

3. **Updates status to 'failed' via 'error' event**
   - Seed log row with `provider_message_id = "msg-3"`, `status = 'sent'`
   - Call `handleWebhook("brevo", { event: "error", "message-id": "msg-3", reason: "timeout" })`
   - Query DB: assert `status = 'failed'`, `error_message = 'timeout'`

4. **No-op when provider_message_id doesn't exist**
   - Call `handleWebhook("brevo", { event: "delivered", "message-id": "nonexistent" })`
   - No error thrown, no rows affected (UPDATE matches 0 rows — `dal.rawSql` returns `[]`)

**4 integration tests.** Real PG UPDATE.

### 5.3 `test/integration/service-registration.integration.test.ts`

Tests `ServiceRegistration.register()` + `updateHeartbeat()` with real PG.

**Setup:**
- `beforeAll`: init test Dal
- `beforeEach`: truncate `public.service_registry`
- `afterAll`: close Dal

**Test cases:**

1. **Register new service — INSERT path**
   - Truncate `service_registry` (no existing row)
   - Call `register()`
   - Query DB: assert row exists with `code = 'EMAILSENDER'`, `base_url` matches config, `endpoints` JSON contains webhook + health URLs, `version = 1`

2. **Register existing service — UPDATE path**
   - Seed a row with `code = 'EMAILSENDER'`
   - Call `register()`
   - Query DB: assert row updated, `version` incremented, `base_url` updated

3. **Update heartbeat**
   - Seed a row with `code = 'EMAILSENDER'`, old `updated_at`
   - Call `updateHeartbeat()`
   - Query DB: assert `updated_at` is recent, `updated_by = 'system'`

4. **Custom service code via env**
   - Set `SERVICE_CODE = 'CUSTOM_EMAIL'`
   - Call `register()`
   - Query DB: assert row with `code = 'CUSTOM_EMAIL'`

**4 integration tests.** Real PG INSERT/UPDATE/SELECT.

---

## 6. Implementation steps

### Step 1: Refactor `createHttpServer` to return the Server instance

**File:** `src/server/http-server.ts`

Currently `createHttpServer` returns `Promise<void>`. Change it to return
`Promise<Server>` so tests can close it and read the port.

```typescript
export async function createHttpServer(port: number = 3003): Promise<Server> {
  const server = createServer(async (req, res) => {
    // ... existing routing logic ...
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`HTTP server listening on port ${port}`);
      resolve(server);
    });
  });
}
```

**Impact:** `index.ts` calls `await createHttpServer(httpPort)` — the return
value is currently discarded, so this is backward-compatible.

### Step 2: Delete old mock-based tests

**Delete:** `src/services/__tests__/email-service.test.ts`

The 4 mock-based tests are replaced by the integration tests in §5.1.

### Step 3: Create test helpers

**Create:**
- `test/helpers/setup.ts` — PG pool, Dal init/reset, truncate, seed (per §3.4)
- `test/helpers/fake-brevo-server.ts` — real HTTP server (per §3.3)

### Step 4: Create vitest configs + update package.json scripts

**Update:** `vitest.config.ts` (unit only)
**Create:** `vitest.integration.config.ts` (integration only)
**Update:** `package.json` — add `test:integration`, `test:integration:watch`, `test:all` scripts

### Step 5: Create Layer 1 unit tests

**Create:**
- `src/providers/__tests__/brevo.test.ts` — 13 mapStatus tests (per §4.1)
- `src/server/__tests__/http-server.test.ts` — 7 HTTP routing tests (per §4.2)
- `src/services/__tests__/webhook-service.validation.test.ts` — 3 validation tests (per §4.3)

### Step 6: Create Layer 2 integration tests

**Create:**
- `test/integration/email-service.integration.test.ts` — 8 tests (per §5.1)
- `test/integration/webhook-service.integration.test.ts` — 4 tests (per §5.2)
- `test/integration/service-registration.integration.test.ts` — 4 tests (per §5.3)

### Step 7: Run unit tests (no DB needed)

```bash
pnpm test
```

Expected: 23 unit tests pass (13 + 7 + 3).

### Step 8: Run integration tests (requires PG running)

```bash
pnpm test:integration
```

Expected: 16 integration tests pass (8 + 4 + 4).

### Step 9: Run all tests

```bash
pnpm test:all
```

Expected: 39 tests pass (23 unit + 16 integration).

### Step 10: Build + typecheck

```bash
pnpm run build
```

Expected: 0 errors.

---

## 7. Acceptance criteria

1. `pnpm test` (unit) runs and passes with **0 mocks** (`vi.mock` count = 0)
2. `pnpm test:integration` runs and passes with real PG (no mocks)
3. `pnpm test:all` passes all 39 tests
4. `pnpm run build` exits 0
5. No `vi.mock()` calls in any test file
6. The fake Brevo server is a real `http.createServer`, not a `vi.fn()`
7. Integration tests use `DATABASE_URL` from `.env` (same as DAL lib tests)
8. Integration tests `TRUNCATE` between tests for isolation
9. `createHttpServer` returns `Server` instance (for test cleanup)
10. Unit tests run in <1s total (no I/O)
11. Integration tests verify DB state by querying PG directly (not by checking return values alone)
12. Integration tests verify fake Brevo received correct requests (request body, headers)

---

## 8. What is NOT in scope

- **NATS integration tests** — testing the NATS subscribe/publish round-trip
  requires a running NATS server. Out of scope for this plan. The NATS
  handler is a thin wrapper that delegates to `EmailService.sendEmail()`,
  which is tested directly.
- **Testcontainers** — the DAL lib uses a real PG from `.env`, not
  testcontainers. We follow the same pattern. If testcontainers is desired
  later, it's a separate plan.
- **ServiceRegistration heartbeat interval test** — testing `setInterval`
  timing is flaky and low-value. We test `updateHeartbeat()` directly.
- **Snapshot/patch tooling tests** — `build-entity-snapshot.ts` and
  `database-patch-to-sql.ts` are dev-time tooling, not runtime code. Out of
  scope.

---

## 9. Test count summary

| Layer | File | Tests | Needs PG? | Needs Brevo? |
|-------|------|-------|-----------|--------------|
| Unit | `brevo.test.ts` | 13 | No | No |
| Unit | `http-server.test.ts` | 7 | No | No |
| Unit | `webhook-service.validation.test.ts` | 3 | No | No |
| Integration | `email-service.integration.test.ts` | 8 | Yes | Fake server |
| Integration | `webhook-service.integration.test.ts` | 4 | Yes | No |
| Integration | `service-registration.integration.test.ts` | 4 | Yes | No |
| **Total** | | **39** | | |

---

## 10. Dependencies

No new npm dependencies needed. The test suite uses:
- `vitest` (already in devDependencies)
- `pg` (already in dependencies via `@primebrick/dal-pg`)
- Node.js built-in `http` module (for fake Brevo server + HTTP server tests)
- `dotenv` (already in dependencies)

---

## 11. Open questions

### 11.1 Does the test DB have the emailsender schema + tables?

The integration tests assume `emailsender.email_config`, `emailsender.email_templates`,
`emailsender.email_templates_communication_log`, and `public.service_registry`
already exist. If they don't, the tests will fail with "relation does not exist".

**Resolution:** Before running integration tests, ensure the schema exists.
This can be done by running the database-patch tooling, or by manually
running the DDL. The test suite will NOT create schema — it only seeds +
truncates data.

### 11.2 `email_config` table columns

The `seedTestData` helper in §3.4 inserts into `email_config` with columns
`provider, from_email, from_name, reply_to, is_active, created_at, created_by,
updated_at, updated_by, version`. These must match the actual table schema.
If the table has different columns (e.g. `is_active` doesn't exist), the seed
will fail. **Verify against the actual DDL before implementing.**

### 11.3 `email_templates` table columns

Same concern — the seed inserts `code, language_iso, subject, body_html,
body_text, is_active` + audit columns. Verify against actual DDL.

---

## 12. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Test DB doesn't have emailsender schema | Medium | High — all integration tests fail | Document prerequisite; add a pre-flight check that queries `information_schema.tables` and throws a clear error |
| `email_config` / `email_templates` columns don't match seed SQL | Medium | High — seed fails | Verify DDL before implementing; adjust seed SQL |
| `createHttpServer` refactor breaks `index.ts` | Low | Low — return value is discarded | Backward-compatible change |
| Fake Brevo server port conflicts | Low | Low — uses port 0 (random) | N/A |
| Integration tests are slow | Low | Low — ~15s timeout is generous | N/A |
| `TRUNCATE ... CASCADE` affects other test data | Low | Medium — only if sharing DB with other test suites | Use `RESTART IDENTITY CASCADE` on specific tables only |
