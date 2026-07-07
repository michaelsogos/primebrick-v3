# Plan: Remaining Work — emailsender Test Suite + SDK GitFlow + Build Baseline

**Version:** 0.1.0
**Status:** DONE — all three phases completed.
**Date:** 2026-07-07
**Completed:** 2026-07-08

## Completion summary

### Phase 1 — Build baseline ✓
- DAL: 125/125 tests pass
- SDK: build fixed (tsconfig excluded test files), 45/45 tests pass
- emailsender: build passes

### Phase 2 — emailsender two-layer test suite ✓
- 27 tests total (17 unit + 10 integration), all green
- DI refactor: optional `brevoClient?` param on EmailService + WebhookService
- Bug fix: `ServiceRegistryAdapter.updateByCode` was missing `code` in row for matchBy
- Deleted old mock-based `email-service.test.ts`
- `vitest.integration.config.ts`: serialized file execution (fileParallelism: false) for DB safety
- Committed `64ad684` on `primebrick-us-v3` develop, pushed

### Phase 3 — SDK NPM publish ✓
- `@primebrick/sdk@0.1.0` published manually (first publish)
- `@primebrick/dal-pg@0.1.8` published via OIDC (fixes broken 0.1.7 tarball — added `files: ["dist/"]`)
- Both CI workflows now use pure OIDC Trusted Publishing (no NPM_TOKEN)
- SDK GitFlow: main + develop + tag 0.1.0, consistent with DAL
- Critical fix: `files: ["dist/"]` added to both SDK and DAL package.json — npm's .gitignore fallback was excluding `dist/` from the published tarball
**Scope:** `primebrick-workspace` (consolidates remaining work across `primebrick-dal-v3`, `primebrick-v3-sdk`, `primebrick-us-v3/emailsender`)

---

## 1. Objective

This plan consolidates the three remaining work items in the Primebrick v3 workspace into three independently executable phases. **Phase 1** establishes a green build baseline across all three repos before any test work begins (verification only, no code change). **Phase 2** delivers the emailsender two-layer test suite — pure unit tests (no DB, no network, no `vi.mock`) plus integration tests (real PostgreSQL via the `getDal()` gateway, a real fake Brevo HTTP server) — replacing the stale, mock-based test file that no longer matches the current source. **Phase 3** resolves the `@primebrick/sdk` GitFlow + publish inconsistency (the SDK repo has only a `main` branch, no tags, is unpublished, and is consumed via `workspace:*`) by presenting a decision point to the user rather than auto-executing. Each phase ships independently.

---

## 2. Empirical findings

### 2.1 Plan inventory (10 plans in `primebrick-workspace/ai-plans/`)

| Plan | Status | Evidence |
|------|--------|----------|
| `email-microservice-dal-repo-library-plan.md` | DONE (superseded by gateway plan) | — |
| `dal-gateway-pool-ownership-plan.md` | DONE | commit `eb8e5be` in `primebrick-dal-v3` |
| `dal-close-hardening-plan.md` | DONE | commit `34d45dd` |
| `dal-update-delete-redesign-plan.md` | DONE | commit `ce7b0d3`; `MatchByOptions` + overloads in `src/types/types.ts:59` and `src/dal/dal.ts:306-370` |
| `dal-first-release-plan.md` | DONE | renamed to `@primebrick/dal-pg`; NPM tags `0.1.0`→`0.1.7` exist |
| `us-emailsender-dal-integration-plan.md` | DONE | commit `4cfdfe4`; `pool.ts` deleted, `dal.ts` created, services use `dal.find/add/update` |
| `config-dictionary-pattern-plan.md` | DONE | commit `94c55c0`; `ProviderEntity` exists, `email_config_entity.ts` deleted, `config_entry_entity.ts` exists, migration patch `20260707120000` exists |
| `primebrick-sdk-plan.md` | DONE as creation (NOT published) | commit `f9d84b4` in `primebrick-v3-sdk`; NPM `404`; only `main` branch, 2 commits, no tags, no `develop` |
| `entity-list-table-state-referenced-locally-fix-plan.md` | DONE | `svelte-check` reports 0 errors 0 warnings |
| `us-emailsender-test-strategy-plan.md` | NOT DONE | main remaining work — and the old plan (dated 2026-07-02) is STALE |

### 2.2 Remaining work — 3 items

#### Item 1 — emailsender two-layer test suite (main unfinished work)

The old `us-emailsender-test-strategy-plan.md` (2026-07-02) is STALE. The emailsender source has changed substantially since then. The deltas versus the old plan (old assumption → current reality), all verified against current source:

1. `src/db/pool.ts` existed → NOW DELETED. `src/db/dal.ts` exists (33 lines), calls `getDal({ connectionString, schema, max:10, statementTimeoutMs:30000, applicationName:"primebrick-emailsender" })`. Services call `getDal()` (no args).
2. `email_config` table + `EmailConfigEntity` → NOW RENAMED to `providers` table + `ProviderEntity` (`src/domain/entities/provider_entity.ts`, `@Entity("providers", "emailsender")`, implements `IAuditableEntity`, columns: `id`, `uuid`, `provider`, `api_key`, `api_endpoint?`, `from_email?`, `from_name?`, `reply_to?`, + auditable fields).
3. No SDK → NOW `@primebrick/sdk` exists and is consumed. `src/index.ts` imports `ConfigLoader`, `ServiceRegistrar`, `GracefulShutdown`, `NatsClient`, `createHttpServer`, `HealthCheck`, `requireEnv` from `@primebrick/sdk`. Four adapters exist in `src/adapters/`: `config-repository-adapter.ts`, `database-adapter.ts`, `health-check-adapter.ts`, `service-registry-adapter.ts`, `index.ts`.
4. `EmailCommunicationLogEntity` did not exist → NOW EXISTS at `src/domain/entities/email_communication_log_entity.ts`. `@Entity("email_templates_communication_log")`, NON-auditable (no `@AuditableField`). Columns: `id` (`@Key`), `entity_id?`, `entity_uuid?`, `type`, `provider_message_id?`, `provider`, `status` (varchar 50), `template_uuid?`, `senders` (jsonb), `recipients` (jsonb), `interpolated_sent_message?`, `error_message?`, `sent_at?`, `status_changed_at?`.
5. `service-registration.ts` with raw SQL → NOW uses SDK `ServiceRegistrar` + `ServiceRegistryAdapter`. `ServiceRegistryEntity` exists at `src/domain/entities/service_registry_entity.ts` (`@Entity("service_registry", "public")`, implements `IAuditableEntity`).
6. `email-service.ts` (140 lines): uses `dal.find(ProviderEntity, null, { filters: [Filter.fieldValue(field(ProviderEntity, "provider"), "=", "brevo")] })` for config, `dal.find(EmailTemplateEntity, null, { filters: [code, language_iso] })` for template, `dal.add<EmailCommunicationLogEntity>(...)` for both success and failure logs. Catches `NotFoundError` and re-throws as `new Error("No email configuration found for Brevo")` / `new Error("Template not found: ...")`. Constructor reads `BREVO_API_KEY` + `BREVO_API_ENDPOINT` env vars, constructs `new BrevoClient(apiKey, apiEndpoint)`.
7. `webhook-service.ts` (64 lines): validates `provider==="brevo"`, validates `message-id` + `event` present, calls `this.brevoClient.mapStatus(event)`, then `dal.update(EmailCommunicationLogEntity, { provider_message_id, status, status_changed_at: new Date(), error_message }, { matchBy: "provider_message_id" })`. NON-auditable entity so no actor required.
8. `webhook-route.ts` (59 lines): route handler for SDK's `createHttpServer`. `POST /webhook`, API key auth via `Authorization` header (`Bearer` or `ApiKey` prefix), reads `provider` query param (default `"brevo"`), parses JSON body, delegates to `WebhookService`.
9. `brevo.ts` (80 lines): `BrevoClient` class with `sendEmail(request)` (`fetch` POST to `${apiEndpoint}/smtp/emails` with `api-key` header) and `mapStatus(brevoStatus)` (pure sync map: `sent→sent`, `delivered→delivered`, `opened→opened`, `clicked→clicked`, `bounce→bounced`, `hardbounce→bounced`, `softbounce→bounced`, `spam→spam`, `blocked→blocked`, `deferred→deferred`, `invalid→failed`, `error→failed`, default→input passthrough).
10. Current test state: ONLY `src/services/__tests__/email-service.test.ts` exists (142 lines). It uses `vi.mock("../../db/dal.js", ...)` and `vi.mock("../../providers/brevo.js", ...)` — the old plan explicitly says "No `vi.mock()` calls anywhere." This file must be DELETED and replaced.
11. `vitest.config.ts` exists (unit only, includes `src/**/*.test.ts`). `vitest.integration.config.ts` does NOT exist. `test/` directory does NOT exist.
12. `.env.example` exists with: `DATABASE_URL`, `DB_SCHEMA=emailsender`, `NATS_URL`, `BREVO_API_KEY`, `BREVO_API_ENDPOINT`, `SERVICE_CODE=EMAILSENDER`, `SERVICE_BASE_URL=http://localhost:3003`, `WEBHOOK_API_KEY`.
13. DAL lib test pattern to mirror: `primebrick-dal-v3/test/helpers/setup.ts` — shared `pg.Pool`, idempotent DDL, `TRUNCATE` between tests, `INT8`/`NUMERIC` type parsers configured. emailsender integration tests should use the `getDal()` gateway instead of a raw pool (the gateway owns the pool), but follow the same `TRUNCATE`-between-tests isolation pattern.
14. Entities registered in `src/domain/entities/registry.ts`: `ProviderEntity`, `EmailTemplateEntity`, `EmailCommunicationLogEntity`, `ServiceRegistryEntity`, `ConfigEntryEntity`.

#### Item 2 — `@primebrick/sdk` GitFlow + publish decision

Empirical state of `D:\git\primebrick\primebrick-v3-sdk`:

- Branch: `main` only (NO `develop` branch). 2 commits: "Initial commit", "feat: create @primebrick/sdk".
- No tags.
- `package.json`: name `"@primebrick/sdk"`, version `"0.1.0"`, `private: true`. NOT on NPM (`npm view` returns 404).
- Consumed by emailsender via `"@primebrick/sdk": "workspace:*"` in `package.json`.
- `primebrick-workspace/pnpm-workspace.yaml` lists `../primebrick-v3-sdk`.
- All 11 SDK modules exist with unit tests under `src/<module>/__tests__/`: `config-loader`, `env-validator`, `http-server`, `graceful-shutdown`, `apply-patches`, `nats-client`, `service-registrar`.

This is INCONSISTENT with the GitFlow convention used by DAL (`develop` + `main` + tags `0.1.0`→`0.1.7`) and BE/US.

#### Item 3 — Pre-implementation verification (build green baseline)

Before any test work, confirm the current state is green across all three repos. This is a verification step, not a code change.

---

## 3. Phase 1 — Build baseline verification

**Goal:** Confirm all three repos build and pass their existing tests before any test work begins. This is a verification step only — no code changes.

**Commands to run (documented here, executed during implementation):**

| Repo | Command | Notes |
|------|---------|-------|
| `primebrick-dal-v3` | `pnpm run build && pnpm test` | DAL has 90 integration tests; requires `DATABASE_URL` |
| `primebrick-v3-sdk` | `pnpm run build && pnpm test` | SDK has unit tests only, no DB |
| `primebrick-us-v3/emailsender` | `pnpm run build` | No tests yet — that is what Phase 2 adds |

**Halt-on-failure rule:** If any build or test fails, STOP. Fix the build first; do not proceed to Phase 2. This respects the `code-guardrails` rule (max 2 self-correction attempts, then halt). Do not attempt to fix DAL or SDK failures as part of this plan — surface them and halt.

**Acceptance:** All three commands exit 0. The workspace is on a green baseline.

---

## 4. Phase 2 — emailsender two-layer test suite

### 4.1 Prerequisite refactor — dependency injection of `BrevoClient`

`WebhookService` and `EmailService` constructors currently read env vars directly and construct `BrevoClient` internally. For integration tests with the fake Brevo server, the test needs to inject a `BrevoClient` pointing at `127.0.0.1:<port>`. Two options exist:

- **Option A (recommended):** Add an optional `brevoClient?: BrevoClient` constructor param to both services. If provided, use it; if not, construct from env (current behavior). Zero impact on production callers (`index.ts` constructs without args).
- **Option B:** Set `BREVO_API_ENDPOINT` env var in tests to point at the fake server. No code change but couples tests to env var names.

**Recommendation: Option A** — minimal, idiomatic DI, makes both services testable without env coupling.

Exact signature change for `EmailService` (in `src/services/email-service.ts`):

```typescript
import { BrevoClient } from "../providers/brevo.js";

export class EmailService {
  private readonly brevoClient: BrevoClient;

  constructor(brevoClient?: BrevoClient) {
    this.brevoClient = brevoClient
      ?? new BrevoClient(
          requireEnv("BREVO_API_KEY"),
          requireEnv("BREVO_API_ENDPOINT"),
        );
  }
  // ...rest unchanged
}
```

Exact signature change for `WebhookService` (in `src/services/webhook-service.ts`):

```typescript
import { BrevoClient } from "../providers/brevo.js";

export class WebhookService {
  private readonly brevoClient: BrevoClient;

  constructor(brevoClient?: BrevoClient) {
    this.brevoClient = brevoClient
      ?? new BrevoClient(
          requireEnv("BREVO_API_KEY"),
          requireEnv("BREVO_API_ENDPOINT"),
        );
  }
  // ...rest unchanged
}
```

Production callers in `src/index.ts` (and `src/server/webhook-route.ts` if it constructs the service) are unchanged — they pass no args and get the env-based default.

### 4.2 Layer 1 — Pure unit tests (no DB, no network, no `vi.mock`)

**`src/providers/__tests__/brevo.test.ts`** — `mapStatus` pure function tests (all 12 mapped events + passthrough for unknown event):

```typescript
import { describe, it, expect } from "vitest";
import { BrevoClient } from "../brevo.js";

describe("BrevoClient.mapStatus", () => {
  const client = new BrevoClient("fake-key", "http://localhost:0");

  it.each([
    ["sent", "sent"],
    ["delivered", "delivered"],
    ["opened", "opened"],
    ["clicked", "clicked"],
    ["bounce", "bounced"],
    ["hardbounce", "bounced"],
    ["softbounce", "bounced"],
    ["spam", "spam"],
    ["blocked", "blocked"],
    ["deferred", "deferred"],
    ["invalid", "failed"],
    ["error", "failed"],
  ])("maps %s -> %s", (input, expected) => {
    expect(client.mapStatus(input)).toBe(expected);
  });

  it("passes through unknown events unchanged", () => {
    expect(client.mapStatus("unknown_event")).toBe("unknown_event");
  });
});
```

**`src/services/__tests__/webhook-service.validation.test.ts`** — validation throws BEFORE any DB call: unsupported provider, missing `message-id`, missing `event`. The `WebhookService` constructor requires `BREVO_API_KEY` env var and constructs `BrevoClient`. With the Option A refactor above, the test injects a `BrevoClient` directly — no env coupling, no `vi.mock`:

```typescript
import { describe, it, expect } from "vitest";
import { WebhookService } from "../webhook-service.js";
import { BrevoClient } from "../../providers/brevo.js";

describe("WebhookService validation (throws before DB)", () => {
  const brevoClient = new BrevoClient("fake-key", "http://localhost:0");
  const service = new WebhookService(brevoClient);

  it("throws on unsupported provider", async () => {
    await expect(
      service.handleWebhook("mailgun", { "message-id": "x", event: "delivered" }),
    ).rejects.toThrow(/provider/i);
  });

  it("throws on missing message-id", async () => {
    await expect(
      service.handleWebhook("brevo", { event: "delivered" }),
    ).rejects.toThrow(/message-id/i);
  });

  it("throws on missing event", async () => {
    await expect(
      service.handleWebhook("brevo", { "message-id": "x" }),
    ).rejects.toThrow(/event/i);
  });
});
```

**DELETE** `src/services/__tests__/email-service.test.ts` (the old mock-based test using `vi.mock`).

### 4.3 Layer 2 — Integration tests (real PG via `getDal` gateway, fake Brevo HTTP server)

**`test/helpers/setup.ts`** — shared setup: `initDal()` once via `process.env.DATABASE_URL`, idempotent DDL (CREATE TABLE IF NOT EXISTS for `providers`, `email_templates`, `email_templates_communication_log`, `public.service_registry` — OR rely on the existing migration patches in `db-meta/patches/`), `TRUNCATE` between tests, seed helpers (insert a brevo `ProviderEntity` row, insert an `EmailTemplateEntity` row). `resetDal()` in `afterAll`. Uses the `getDal()` gateway instead of a raw pool (the gateway owns the pool), but follows the same `TRUNCATE`-between-tests isolation pattern as `primebrick-dal-v3/test/helpers/setup.ts`:

```typescript
// test/helpers/setup.ts
import "dotenv/config";
import pg from "pg";
import { getDal, resetDal } from "@primebrick/dal-pg";
import { ProviderEntity } from "../../src/domain/entities/provider_entity.js";
import { EmailTemplateEntity } from "../../src/domain/entities/email_template_entity.js";
import { EmailCommunicationLogEntity } from "../../src/domain/entities/email_communication_log_entity.js";

pg.types.setTypeParser(pg.types.builtins.INT8, (val: string) => BigInt(val));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val: string) => {
  const num = Number(val);
  if (!val.includes(".") && Math.abs(num) > Number.MAX_SAFE_INTEGER) return val;
  return num;
});

const schema = process.env.DB_SCHEMA ?? "emailsender";

/** Initialise the DAL gateway once for the whole suite. */
export async function initDal() {
  return getDal({
    connectionString: process.env.DATABASE_URL!,
    schema,
    max: 10,
    statementTimeoutMs: 30000,
    applicationName: "primebrick-emailsender-test",
  });
}

/** TRUNCATE every entity table between tests for isolation. */
export async function truncateAll() {
  const dal = await initDal();
  await dal.rawSql(`TRUNCATE TABLE ${schema}.providers, ${schema}.email_templates, ${schema}.email_templates_communication_log RESTART IDENTITY CASCADE`);
  await dal.rawSql(`TRUNCATE TABLE public.service_registry RESTART IDENTITY CASCADE`);
}

/** Seed a Brevo provider row. Returns the inserted row. */
export async function seedProvider(overrides: Partial<ProviderEntity> = {}) {
  const dal = await initDal();
  const [row] = await dal.add<ProviderEntity>(ProviderEntity, {
    provider: "brevo",
    apiKey: "test-key",
    apiEndpoint: "http://127.0.0.1:0",
    fromEmail: "noreply@test.local",
    fromName: "Test",
    ...overrides,
  } as any);
  return row;
}

/** Seed an email template row. Returns the inserted row. */
export async function seedTemplate(overrides: Partial<EmailTemplateEntity> = {}) {
  const dal = await initDal();
  const [row] = await dal.add<EmailTemplateEntity>(EmailTemplateEntity, {
    code: "welcome",
    languageIso: "en",
    subject: "Welcome",
    body: "<p>Hello {{name}}</p>",
    ...overrides,
  } as any);
  return row;
}

/** Seed a communication log row (for webhook tests). */
export async function seedLog(overrides: Partial<EmailCommunicationLogEntity> = {}) {
  const dal = await initDal();
  const [row] = await dal.add<EmailCommunicationLogEntity>(EmailCommunicationLogEntity, {
    type: "transactional",
    provider: "brevo",
    providerMessageId: "msg-123",
    status: "sent",
    senders: [{ email: "noreply@test.local" }],
    recipients: [{ email: "user@test.local" }],
    sentAt: new Date(),
    ...overrides,
  } as any);
  return row;
}

/** Tear down the DAL gateway after the suite. */
export async function teardownDal() {
  await resetDal();
}
```

**`test/helpers/fake-brevo-server.ts`** — real `http.createServer` on random port, returns canned `{ messageId }` responses or error statuses, records received requests. `BrevoClient` is constructed with `apiEndpoint = http://127.0.0.1:<port>`:

```typescript
// test/helpers/fake-brevo-server.ts
import { createServer, type Server } from "http";

export interface FakeBrevoConfig {
  responseStatus?: number;
  responseBody?: object;
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

**`test/integration/email-service.integration.test.ts`** — full `sendEmail` path: seed provider + template, fake Brevo returns success, assert `SendEmailResponse.success=true`, assert `EmailCommunicationLogEntity` row exists with `status="sent"` + `provider_message_id`. Test config-not-found (no provider row → failure log with `status="failed"`). Test template-not-found (provider exists, no template → failure log). Test Brevo-error (fake Brevo returns 500 → failure log with `error_message`):

```typescript
// test/integration/email-service.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { EmailService } from "../../src/services/email-service.js";
import { BrevoClient } from "../../src/providers/brevo.js";
import { EmailCommunicationLogEntity } from "../../src/domain/entities/email_communication_log_entity.js";
import { Filter, field } from "@primebrick/dal-pg";
import { initDal, resetDal, truncateAll, seedProvider, seedTemplate, teardownDal } from "../helpers/setup.js";
import { startFakeBrevoServer } from "../helpers/fake-brevo-server.js";

describe("EmailService.sendEmail (integration)", () => {
  let service: EmailService;
  let fakeBrevo: Awaited<ReturnType<typeof startFakeBrevoServer>>;

  beforeAll(async () => {
    await initDal();
  });

  afterAll(async () => {
    await fakeBrevo?.close();
    await teardownDal();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it("logs a 'sent' row when Brevo accepts the email", async () => {
    fakeBrevo = await startFakeBrevoServer({ responseBody: { messageId: "brevo-abc" } });
    const brevoClient = new BrevoClient("fake-key", fakeBrevo.url);
    service = new EmailService(brevoClient);

    await seedProvider({ apiEndpoint: fakeBrevo.url });
    await seedTemplate({ code: "welcome", languageIso: "en" });

    const res = await service.sendEmail({
      templateCode: "welcome",
      languageIso: "en",
      recipients: [{ email: "user@test.local" }],
      variables: { name: "World" },
    });

    expect(res.success).toBe(true);

    const dal = await initDal();
    const [log] = await dal.find(EmailCommunicationLogEntity, null, {
      filters: [Filter.fieldValue(field(EmailCommunicationLogEntity, "providerMessageId"), "=", "brevo-abc")],
    });
    expect(log).toBeDefined();
    expect(log!.status).toBe("sent");
    expect(log!.providerMessageId).toBe("brevo-abc");
  });

  it("logs a 'failed' row when no provider config exists", async () => {
    fakeBrevo = await startFakeBrevoServer();
    service = new EmailService(new BrevoClient("fake-key", fakeBrevo.url));
    await seedTemplate({ code: "welcome", languageIso: "en" });

    await expect(
      service.sendEmail({
        templateCode: "welcome",
        languageIso: "en",
        recipients: [{ email: "user@test.local" }],
        variables: {},
      }),
    ).rejects.toThrow(/No email configuration found for Brevo/i);

    const dal = await initDal();
    const logs = await dal.find(EmailCommunicationLogEntity, null, {});
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs.some((l) => l.status === "failed")).toBe(true);
  });

  it("logs a 'failed' row when the template is not found", async () => {
    fakeBrevo = await startFakeBrevoServer();
    service = new EmailService(new BrevoClient("fake-key", fakeBrevo.url));
    await seedProvider({ apiEndpoint: fakeBrevo.url });

    await expect(
      service.sendEmail({
        templateCode: "missing",
        languageIso: "en",
        recipients: [{ email: "user@test.local" }],
        variables: {},
      }),
    ).rejects.toThrow(/Template not found/i);

    const dal = await initDal();
    const logs = await dal.find(EmailCommunicationLogEntity, null, {});
    expect(logs.some((l) => l.status === "failed")).toBe(true);
  });

  it("logs a 'failed' row with error_message when Brevo returns 500", async () => {
    fakeBrevo = await startFakeBrevoServer({ errorStatus: 500, errorBody: { message: "upstream down" } });
    service = new EmailService(new BrevoClient("fake-key", fakeBrevo.url));
    await seedProvider({ apiEndpoint: fakeBrevo.url });
    await seedTemplate({ code: "welcome", languageIso: "en" });

    await service.sendEmail({
      templateCode: "welcome",
      languageIso: "en",
      recipients: [{ email: "user@test.local" }],
      variables: {},
    }).catch(() => { /* expected to throw or return failure */ });

    const dal = await initDal();
    const logs = await dal.find(EmailCommunicationLogEntity, null, {});
    expect(logs.some((l) => l.status === "failed" && l.errorMessage)).toBe(true);
  });
});
```

**`test/integration/webhook-service.integration.test.ts`** — seed an `EmailCommunicationLogEntity` row with `provider_message_id="msg-123"` `status="sent"`, call `handleWebhook("brevo", { "message-id":"msg-123", event:"delivered" })`, assert the row's status is updated to `"delivered"` via `dal.find`. Test `error_message` propagation when `event="bounce"` + reason present:

```typescript
// test/integration/webhook-service.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { WebhookService } from "../../src/services/webhook-service.js";
import { BrevoClient } from "../../src/providers/brevo.js";
import { EmailCommunicationLogEntity } from "../../src/domain/entities/email_communication_log_entity.js";
import { Filter, field } from "@primebrick/dal-pg";
import { initDal, truncateAll, seedLog, teardownDal } from "../helpers/setup.js";

describe("WebhookService.handleWebhook (integration)", () => {
  let service: WebhookService;

  beforeAll(async () => {
    await initDal();
    service = new WebhookService(new BrevoClient("fake-key", "http://localhost:0"));
  });

  afterAll(async () => { await teardownDal(); });

  beforeEach(async () => { await truncateAll(); });

  it("updates the log status to 'delivered'", async () => {
    await seedLog({ providerMessageId: "msg-123", status: "sent" });
    await service.handleWebhook("brevo", { "message-id": "msg-123", event: "delivered" });

    const dal = await initDal();
    const [row] = await dal.find(EmailCommunicationLogEntity, null, {
      filters: [Filter.fieldValue(field(EmailCommunicationLogEntity, "providerMessageId"), "=", "msg-123")],
    });
    expect(row!.status).toBe("delivered");
  });

  it("propagates error_message on bounce", async () => {
    await seedLog({ providerMessageId: "msg-456", status: "sent" });
    await service.handleWebhook("brevo", { "message-id": "msg-456", event: "bounce", reason: "mailbox full" });

    const dal = await initDal();
    const [row] = await dal.find(EmailCommunicationLogEntity, null, {
      filters: [Filter.fieldValue(field(EmailCommunicationLogEntity, "providerMessageId"), "=", "msg-456")],
    });
    expect(row!.status).toBe("bounced");
    expect(row!.errorMessage).toContain("mailbox full");
  });
});
```

**`test/integration/service-registration.integration.test.ts`** — test the `ServiceRegistryAdapter` + `ServiceRegistrar` flow against real `public.service_registry` table: `register()` inserts a row, re-`register()` updates the same row (upsert by code), heartbeat updates `updated_at`. `TRUNCATE public.service_registry` between tests. NOTE: this tests the emailsender ADAPTER against real PG, not the SDK's `ServiceRegistrar` logic (which has its own unit tests in the SDK repo).

### 4.4 Config files

**`vitest.config.ts`** — UPDATE: keep include `src/**/*.test.ts` for Layer 1 (unit). No DB.

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

**`vitest.integration.config.ts`** — NEW: include `test/integration/**/*.test.ts`, `testTimeout` 15000, `hookTimeout` 30000:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    globals: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
```

**`package.json` scripts** — ADD:

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

### 4.5 File-by-file impact (Phase 2)

| File | Action | Layer | Notes |
|------|--------|-------|-------|
| `src/services/email-service.ts` | EDIT | refactor | Add optional `brevoClient?: BrevoClient` constructor param (Option A DI) |
| `src/services/webhook-service.ts` | EDIT | refactor | Add optional `brevoClient?: BrevoClient` constructor param (Option A DI) |
| `src/services/__tests__/email-service.test.ts` | DELETE | — | Old mock-based test using `vi.mock`; replaced by integration test |
| `src/providers/__tests__/brevo.test.ts` | NEW | 1 (unit) | `mapStatus` pure function tests |
| `src/services/__tests__/webhook-service.validation.test.ts` | NEW | 1 (unit) | Validation throws before DB |
| `test/helpers/setup.ts` | NEW | 2 (helper) | `initDal`, `truncateAll`, seed helpers, `teardownDal` |
| `test/helpers/fake-brevo-server.ts` | NEW | 2 (helper) | Real `http.createServer` returning canned Brevo responses |
| `test/integration/email-service.integration.test.ts` | NEW | 2 (integration) | Full `sendEmail` path + failure paths |
| `test/integration/webhook-service.integration.test.ts` | NEW | 2 (integration) | Webhook UPDATE + error_message propagation |
| `test/integration/service-registration.integration.test.ts` | NEW | 2 (integration) | `ServiceRegistryAdapter` upsert + heartbeat |
| `vitest.config.ts` | EDIT | config | Keep unit-only include |
| `vitest.integration.config.ts` | NEW | config | Integration config with timeouts |
| `package.json` | EDIT | config | Add `test*` scripts |

### 4.6 Implementation steps (atomic, verified after each)

1. **Prerequisite refactor.** Add optional `brevoClient?: BrevoClient` param to `EmailService` and `WebhookService` constructors. Run `pnpm run build` — must pass (production callers unchanged).
2. **Delete old test.** Remove `src/services/__tests__/email-service.test.ts`. Run `pnpm run build` — must pass.
3. **Layer 1 unit tests.** Create `src/providers/__tests__/brevo.test.ts` and `src/services/__tests__/webhook-service.validation.test.ts`. Run `pnpm test` — must pass with no DB.
4. **Integration helpers.** Create `test/helpers/setup.ts` and `test/helpers/fake-brevo-server.ts`. Run `pnpm run build` — must compile.
5. **Integration config + scripts.** Create `vitest.integration.config.ts`; update `package.json` scripts. Run `pnpm test:integration` with no test files yet — must not error on config.
6. **email-service integration test.** Create `test/integration/email-service.integration.test.ts`. Run `pnpm test:integration` — success + failure-log paths must pass.
7. **webhook-service integration test.** Create `test/integration/webhook-service.integration.test.ts`. Run `pnpm test:integration` — delivered + bounce paths must pass.
8. **service-registration integration test.** Create `test/integration/service-registration.integration.test.ts`. Run `pnpm test:integration` — register + heartbeat must pass.
9. **Full suite.** Run `pnpm test:all` — all unit + integration tests green.

### 4.7 Acceptance criteria (Phase 2)

- `pnpm test` runs Layer 1 only, no DB, no network, passes.
- `pnpm test:integration` runs Layer 2 only, real PG via `getDal()` gateway, fake Brevo HTTP server, passes.
- `pnpm test:all` runs both, passes.
- Zero `vi.mock()` calls anywhere in the test suite.
- `EmailService` and `WebhookService` accept an optional injected `BrevoClient`; production callers in `index.ts` unchanged.
- The old `src/services/__tests__/email-service.test.ts` is deleted.

---

## 5. Phase 3 — SDK GitFlow + NPM publish (Option B — user-approved)

**Goal:** Publish `@primebrick/sdk` to NPM as a public scoped package and bring the SDK repo into GitFlow consistency with the rest of the workspace. **User selected Option B on 2026-07-07.**

### 5.1 Empirical baseline (verified 2026-07-07)

**DAL reference pattern** (`primebrick-dal-v3`, the model to mirror):
- `package.json`: `publishConfig: { access: "public", registry: "https://registry.npmjs.org" }`, `license: "MIT"`, `author: "Michael Sogos"`, `repository: { type: "git", url: "https://github.com/michaelsogos/primebrick-v3-dal" }`, `homepage`, `bugs`, `prepare: "tsc"` script, `prebuild: "node scripts/version-sync.mjs"`.
- `.github/workflows/ci.yml` (the release workflow — there is NO separate `release.yml`): triggers on tag push `[0-9]+.[0-9]+.[0-9]+`, uses **OIDC Trusted Publishing** (`permissions: contents: read, id-token: write`), NO `NPM_TOKEN` env var, runs `npm publish --access public --provenance`.
- `.npmrc`: comment-only (`# @primebrick packages are published to npmjs.com (public)`).
- `scripts/version-sync.mjs`: parses semver from `release/X.Y.Z` / `hotfix/X.Y.Z` branch names, syncs `package.json` version.
- NPM package: `@primebrick/dal-pg` published, tags `0.1.0`→`0.1.7` exist. The `@primebrick` NPM org already exists (DAL is published under it).

**SDK current state** (`primebrick-v3-sdk`):
- `package.json`: `private: true`, version `0.1.0`. **Missing**: `license`, `author`, `repository`, `homepage`, `bugs`, `publishConfig`, `prepare` script. Has `description`, `exports`, `peerDependencies` (nats optional), `devDependencies`.
- Git: `main` branch (2 commits), `develop` branch exists **locally only** (NOT pushed — `git ls-remote --heads origin` shows only `main`). **No tags**. Remote: `https://github.com/michaelsogos/primebrick-v3-sdk.git`.
- **NO `.github/workflows/` directory** at repo root.
- **NO `.npmrc`**.
- **NO `scripts/` directory** (no version-sync).
- `README.md`: single line `# primebrick-v3-sdk`.
- NPM: `npm view @primebrick/sdk` → 404 (not published).

### 5.2 Manual prerequisites (user actions — cannot be automated)

These mirror the DAL's prerequisites. The `@primebrick` NPM org already exists (DAL is published), so only the Trusted Publisher config is new:

1. **Configure OIDC Trusted Publisher on NPM** for `@primebrick/sdk`:
   - URL: `https://www.npmjs.com/package/@primebrick/sdk/access` (page appears after first publish — for the FIRST publish, the user must publish manually once OR use a classic automation token for the initial publish, then switch to OIDC).
   - Repository: `michaelsogos/primebrick-v3-sdk`
   - Workflow filename: `.github/workflows/ci.yml`
   - Environment: (leave empty unless using GitHub Environments)
   - **NOTE on first-publish chicken-and-egg**: NPM Trusted Publishing requires the package to already exist on NPM to configure the trusted publisher. For the very first publish, the two paths are:
     - **Path 1 (recommended):** User creates a classic NPM automation token, adds it as `NPM_TOKEN` GitHub secret, the CI workflow uses `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` for the first publish only, then the user switches the workflow to OIDC + configures Trusted Publisher on NPM.
     - **Path 2:** User runs `npm publish --access public` locally once (with `npm login`), then configures Trusted Publisher on NPM, then the CI workflow uses OIDC for all subsequent publishes.
   - The plan below implements **Path 1** (token for first publish, OIDC-ready workflow). After the first successful publish + Trusted Publisher config, the `NPM_TOKEN` secret can be removed and the workflow switches to pure OIDC.

2. **Create NPM automation token** (for first publish only):
   - URL: `https://www.npmjs.com/settings/~/tokens`
   - Token type: **Automation** (or **Publish** if 2FA enabled)
   - GitHub secret name: `NPM_TOKEN`
   - Add to: `https://github.com/michaelsogos/primebrick-v3-sdk/settings/secrets/actions`

### 5.3 File changes (Option B)

#### 5.3.1 `package.json` — EDIT

```jsonc
{
  "name": "@primebrick/sdk",
  "version": "0.1.0",
  "private": false,                          // ← was true
  "type": "module",
  "description": "Shared microservice infrastructure for Primebrick v3 - config loading, migration runner, service registration, graceful shutdown, NATS client, health checks, env validation. DB-agnostic via port interfaces.",
  "license": "MIT",                          // ← NEW
  "author": "Michael Sogos",                 // ← NEW
  "repository": {                            // ← NEW
    "type": "git",
    "url": "https://github.com/michaelsogos/primebrick-v3-sdk"
  },
  "homepage": "https://github.com/michaelsogos/primebrick-v3-sdk#readme",  // ← NEW
  "bugs": {                                  // ← NEW
    "url": "https://github.com/michaelsogos/primebrick-v3-sdk/issues"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc",
    "prepare": "tsc",                        // ← NEW (builds dist on install/publish)
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "publishConfig": {                         // ← NEW
    "access": "public",
    "registry": "https://registry.npmjs.org"
  },
  "dependencies": {},
  "peerDependencies": {
    "nats": "^2.28.1"
  },
  "peerDependenciesMeta": {
    "nats": { "optional": true }
  },
  "devDependencies": {
    "@types/node": "^24.12.4",
    "nats": "^2.28.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.0"
  }
}
```

#### 5.3.2 `.npmrc` — NEW

```
# @primebrick packages are published to npmjs.com (public)
# No custom registry needed - npmjs.com is the default
```

#### 5.3.3 `.github/workflows/ci.yml` — NEW (mirrors DAL's release workflow)

```yaml
name: Release

on:
  push:
    tags:
      # Numeric version tags: 0.1.0, 0.2.0, 1.10.3, etc.
      - "[0-9]+.[0-9]+.[0-9]+"

# OIDC Trusted Publishing: no NPM_TOKEN needed for subsequent publishes.
# For the FIRST publish only, NPM_TOKEN is used (chicken-and-egg: Trusted
# Publisher config requires the package to already exist on NPM).
# After first publish + Trusted Publisher config, remove the NPM_TOKEN
# env var below and rely on OIDC alone.
permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm run build

      - name: Type check
        run: npx tsc --noEmit

      - name: Publish to NPM
        # First publish: uses NPM_TOKEN (classic auth).
        # After Trusted Publisher is configured on NPM, switch to:
        #   npm publish --access public --provenance
        # and remove the env: NODE_AUTH_TOKEN line.
        run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### 5.3.4 `README.md` — EDIT (expand from 1 line)

Expand to a short README matching DAL's style: purpose, exports, usage, license. Minimal content:

```markdown
# @primebrick/sdk

Shared microservice infrastructure for Primebrick v3 — config loading, migration runner, service registration, graceful shutdown, NATS client, health checks, env validation. DB-agnostic via port interfaces.

## License

MIT — Copyright (c) 2026 Michael Sogos
```

#### 5.3.5 `LICENSE` — NEW (MIT, same as DAL/BE/FE/US)

```
MIT License

Copyright (c) 2026 Michael Sogos

Permission is hereby granted, free of charge, to any person obtaining a copy
...
```

(Full MIT text — copy from `primebrick-dal-v3/LICENSE`.)

### 5.4 GitFlow release 0.1.0

```bash
cd D:/git/primebrick/primebrick-v3-sdk

# 1. The develop branch already exists locally. Ensure it's current with main.
git checkout main
git checkout develop
git merge main --no-ff -m "back-merge: main to develop before 0.1.0"

# 2. Create release branch from develop
git checkout -b release/0.1.0

# 3. (version-sync not implemented for SDK — package.json already at 0.1.0, no-op)

# 4. Merge release to main
git checkout main
git merge --no-ff release/0.1.0 -m "release: 0.1.0"

# 5. Tag
git tag 0.1.0

# 6. Push main + tags + develop
git push origin main --tags
git push -u origin develop

# 7. Merge main back to develop
git checkout develop
git merge --no-ff main -m "back-merge: main to develop after 0.1.0"
git push origin develop

# 8. Delete release branch
git branch -d release/0.1.0
```

When tag `0.1.0` is pushed, the `ci.yml` workflow triggers and publishes to NPM. **Prerequisite**: the user must have added the `NPM_TOKEN` secret to the GitHub repo (§5.2 step 2).

### 5.5 Post-first-publish: switch to pure OIDC

After the first publish succeeds:
1. User configures Trusted Publisher on NPM: `https://www.npmjs.com/package/@primebrick/sdk/access`
   - Repository: `michaelsogos/primebrick-v3-sdk`
   - Workflow: `.github/workflows/ci.yml`
2. Edit `.github/workflows/ci.yml`: remove the `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` line. Keep `npm publish --access public --provenance`.
3. Commit + push. The `NPM_TOKEN` GitHub secret can be deleted.
4. All subsequent publishes (0.1.1, 0.2.0, ...) use OIDC with no token.

### 5.6 Acceptance criteria (Phase 3)

- `primebrick-v3-sdk/package.json` has `private: false`, `publishConfig: { access: "public", registry: "https://registry.npmjs.org" }`, `license: "MIT"`, `author`, `repository`, `prepare: "tsc"`.
- `.npmrc` exists (comment-only).
- `.github/workflows/ci.yml` exists, triggers on tag `[0-9]+.[0-9]+.[0-9]+`, publishes via `npm publish --access public --provenance`.
- `LICENSE` exists (MIT).
- `README.md` expanded.
- `develop` branch pushed to origin; `0.1.0` tag pushed to origin.
- After CI runs on tag push: `npm view @primebrick/sdk` returns 200 with version `0.1.0`.
- **Manual user actions completed**: `NPM_TOKEN` secret added to GitHub repo settings before tag push.

---

## 6. Impacted files (consolidated)

| Phase | Repo | File | Action |
|-------|------|------|--------|
| 1 | `primebrick-dal-v3` | — | verify only (`pnpm run build && pnpm test`) |
| 1 | `primebrick-v3-sdk` | — | verify only (`pnpm run build && pnpm test`) |
| 1 | `primebrick-us-v3/emailsender` | — | verify only (`pnpm run build`) |
| 2 | `primebrick-us-v3/emailsender` | `src/services/email-service.ts` | EDIT (DI refactor) |
| 2 | `primebrick-us-v3/emailsender` | `src/services/webhook-service.ts` | EDIT (DI refactor) |
| 2 | `primebrick-us-v3/emailsender` | `src/services/__tests__/email-service.test.ts` | DELETE |
| 2 | `primebrick-us-v3/emailsender` | `src/providers/__tests__/brevo.test.ts` | NEW |
| 2 | `primebrick-us-v3/emailsender` | `src/services/__tests__/webhook-service.validation.test.ts` | NEW |
| 2 | `primebrick-us-v3/emailsender` | `test/helpers/setup.ts` | NEW |
| 2 | `primebrick-us-v3/emailsender` | `test/helpers/fake-brevo-server.ts` | NEW |
| 2 | `primebrick-us-v3/emailsender` | `test/integration/email-service.integration.test.ts` | NEW |
| 2 | `primebrick-us-v3/emailsender` | `test/integration/webhook-service.integration.test.ts` | NEW |
| 2 | `primebrick-us-v3/emailsender` | `test/integration/service-registration.integration.test.ts` | NEW |
| 2 | `primebrick-us-v3/emailsender` | `vitest.config.ts` | EDIT |
| 2 | `primebrick-us-v3/emailsender` | `vitest.integration.config.ts` | NEW |
| 2 | `primebrick-us-v3/emailsender` | `package.json` | EDIT (scripts) |
| 3 | `primebrick-v3-sdk` | git refs | NEW (`develop` branch push, `0.1.0` tag, `release/0.1.0` branch) |
| 3 | `primebrick-v3-sdk` | `package.json` | EDIT (Option B: `private: false`, `publishConfig`, `license`, `author`, `repository`, `prepare` script) |
| 3 | `primebrick-v3-sdk` | `.npmrc` | NEW (comment-only) |
| 3 | `primebrick-v3-sdk` | `.github/workflows/ci.yml` | NEW (OIDC release workflow, NPM_TOKEN for first publish) |
| 3 | `primebrick-v3-sdk` | `LICENSE` | NEW (MIT) |
| 3 | `primebrick-v3-sdk` | `README.md` | EDIT (expand from 1 line) |

---

## 7. Implementation order

**Phase 1 → Phase 2 → Phase 3.** Each phase is independently shippable.

- **Phase 1** is verification only — no commits. If green, proceed.
- **Phase 2** is the bulk of the work — the emailsender test suite. Each implementation step (4.6) is atomic and verified before the next.
- **Phase 3** is the SDK NPM publish (Option B — user-approved). It touches a different repo (`primebrick-v3-sdk`) so it can run before or after Phase 2. It is blocked on two manual user actions: (1) creating an NPM automation token, (2) adding it as the `NPM_TOKEN` GitHub secret to `michaelsogos/primebrick-v3-sdk` repo settings. The code/CI changes (5.3) can be done before the secrets are in place; the tag push (5.4) that triggers the actual publish must wait until the secret exists.

---

## 8. Acceptance criteria

### Phase 1 — Build baseline
- `pnpm run build && pnpm test` passes in `primebrick-dal-v3` (90 integration tests green).
- `pnpm run build && pnpm test` passes in `primebrick-v3-sdk` (unit tests green).
- `pnpm run build` passes in `primebrick-us-v3/emailsender`.
- On any failure: STOP, fix the build first, do not proceed.

### Phase 2 — emailsender test suite
- `pnpm test` (Layer 1 unit) passes with no DB, no network, no `vi.mock`.
- `pnpm test:integration` (Layer 2 integration) passes against real PG via `getDal()` gateway + fake Brevo HTTP server.
- `pnpm test:all` passes.
- `EmailService` and `WebhookService` accept an optional injected `BrevoClient`; `index.ts` unchanged.
- Old `email-service.test.ts` deleted.

### Phase 3 — SDK GitFlow + publish
- `primebrick-v3-sdk` has `develop` branch + `0.1.0` tag pushed.
- Publish decision (A or B) recorded with user approval.
- If A: `private: true` retained, no NPM publish.
- If B: `@primebrick/sdk@0.1.0` visible on NPM.

---

## 9. Rules compliance

- **code-guardrails:** Max 2 self-correction attempts on any failure, then halt and surface the error. Phase 1 enforces this explicitly — a red build stops all further work.
- **data-model-conventions:** Test fixtures use `snake_case` column names via the entity decorators (`provider_message_id`, `entity_id`, `language_iso`, etc.). Seed helpers respect the `providers` / `email_templates` / `email_templates_communication_log` / `public.service_registry` schemas.
- **dev-server:** Do NOT start the emailsender dev server on port 3003 for tests. Integration tests use the `getDal()` gateway against `DATABASE_URL` directly and the fake Brevo server on a random port — never the real dev server.
- **AGENTS:** Never commit without explicit instruction. This plan produces no commits unless the user explicitly says so.
- **file-operations:** Do not open this plan file in an editor. It was written via the `write` tool only.
