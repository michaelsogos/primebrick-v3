# E2E Test Plan — User Creation, Login & Passkey Authentication

**Status:** IMPLEMENTED — all phases complete, awaiting E2E run against live stack
**Owner:** PrimeBrick FE/Platform team
**Related plans:**
- `ai-plans/feature-webauthn-passkey-auth.md` (the passkey feature this plan tests)
- `ai-plans/fe-testing-stack-vpat-plan.md` (FE testing stack / VPAT plan)

## Objective

This plan defines an end-to-end test suite that verifies the full PrimeBrick user-creation and authentication journey against the real local development stack: an admin creates a user via the invitation flow, the invitee completes onboarding (token verify → OTP → set password), logs in with username/password, and (in a second suite) enrolls a passkey and logs in with it. The suite uses Playwright's virtual WebAuthn authenticator (Playwright 1.61 `browserContext.credentials`) so no OS-native WebAuthn prompt or hardware is required, and retrieves OTPs from the `emailsender.sender_log` table by faking the Brevo SMTP relay, so zero real email is sent.

---

## Decisions (confirmed with user)

- **OTP retrieval strategy — Option A:** Read the rendered OTP from `emailsender.sender_log.interpolated_sent_message` instead of intercepting NATS or SMTP. Requires (i) a minimal patch to the US repo `email-service.ts` failure path so the rendered body is stored even when Brevo fails, and (ii) a fake Brevo HTTP server so the send "succeeds" and the row is written with `status='sent'`.
- **Stack — real full stack, Brevo faked:** FE (5173), BE (3001), Casdoor (8000 + MySQL 3306), Postgres (5432), NATS (4222), and emailsender (3003) all run as real services. Only the external Brevo SaaS is replaced by a local fake HTTP server.
- **Flow — full invitation flow, no public self-signup:** User creation is exercised through the admin invitation flow exactly as a human admin would do it, including the `/welcome#token=...` onboarding page.
- **Browser target — Chromium only:** Keep the existing single `chromium` project in `playwright.config.ts`. No multi-browser expansion in this plan.
- **Admin auth — seeded admin, login via UI:** The E2E test logs in as the seeded admin (`admin`/`admin`) through the UI `LoginForm` to obtain httpOnly cookies, then performs admin actions. No direct API cookie injection.
- **Locator strategy — brittle-on-purpose `data-testid` (APPROVED):** Every interactive element an E2E test needs MUST carry a stable `data-testid` derived from the element's PURPOSE (`<component-scope>-<element-purpose>` kebab-case), never from CSS classes, i18n labels, or visible text. If a refactor removes/repurposes an element, the test fails — this is a DESIRED signal of a significant refactor. Enforced via a new Devin rule + `docs/ai/` doc + AGENTS.md pointer (see "E2E testid convention" section).

---

## Feasibility answers

### Q1: Is E2E testing of this stack possible? — **YES**

The FE repo `d:/git/primebrick/primebrick-fe-v3` already has Playwright configured:

- `playwright.config.ts` (lines 13–33): `testDir: './src/e2e'`, `baseURL: 'http://localhost:5173'`, a single `chromium` project, and **no** `webServer` block (the dev server is managed externally per the AGENTS.md dev-server rule).
- `package.json` line 34: `"@playwright/test": "1.61.1"`.
- Scripts: `test:e2e` = `playwright test`, `test:e2e:ui` = `playwright test --ui`.
- Existing test: `src/e2e/smoke.spec.ts` (login page + welcome page load smoke).

### Q2: Can passkey login/enrollment be tested despite WebAuthn being OS-native? — **YES**

Playwright 1.61 (shipped 2026-06-15) introduced `browserContext.credentials` — a **virtual WebAuthn authenticator** that intercepts `navigator.credentials.create` / `navigator.credentials.get` via an injected script + binding. It works on Chromium, Firefox, and WebKit and requires **no hardware and no OS prompt**.

API surface used by this plan:
- `await context.credentials.create({ rpId })` — seeds a passkey in the virtual authenticator.
- `await context.credentials.install()` — turns on the interceptor so page calls to `navigator.credentials.*` are answered by the virtual authenticator.
- `await context.credentials.get({ rpId })` — reads back a captured passkey (including the private key) so it can be saved to disk and reused across tests.

Docs: https://playwright.dev/docs/api/class-credentials
PR: https://github.com/microsoft/playwright/pull/40849

Because the FE repo pins `@playwright/test@1.61.1` exactly, this API is available with no dependency change.

---

## Architecture / data flow

```
                         ┌─────────────────────────────────────────────┐
                         │            Playwright Test Runner            │
                         │  (chromium, src/e2e/*.spec.ts)               │
                         └──────────────┬──────────────────┬───────────┘
                                        │                  │
            drives browser (CDP)        │                  │ SQL queries
                                        ▼                  ▼
        ┌──────────────────────────────────────┐   ┌──────────────────────┐
        │  FE dev server  (SvelteKit, :5173)   │   │ Postgres  (:5432)    │
        │  - /login  (LoginForm + PasskeyBtn)  │   │ schema: emailsender  │
        │  - /welcome#token=... (onboarding)   │   │ table:  sender_log   │
        │  - profile/settings (PasskeyEnroll)  │   │  interpolated_sent_  │
        └──────────────┬───────────────────────┘   │   message (OTP/html) │
                       │ fetch                      └──────────────────────┘
                       ▼
        ┌──────────────────────────────────────┐
        │  BE API  (Fastify, :3001)            │
        │  /api/v1/auth/login                  │
        │  /api/v1/auth/config                 │
        │  /api/v1/auth/users  (admin create)  │
        │  /api/v1/auth/invitations/*          │
        │  /api/v1/auth/welcome/*              │
        │  /api/v1/auth/webauthn/signin/*      │
        │  /api/v1/auth/webauthn/signup/*      │
        └──┬───────────────┬───────────────────┘
           │ HTTP          │ NATS pub
           ▼               ▼
   ┌────────────────┐  ┌────────────────────────────────────────────┐
   │ Casdoor :8000  │  │ NATS :4222  →  emailsender :3003           │
   │ + MySQL :3306  │  │   consumes "emailsender.send"              │
   │ (OAuth, users, │  │   renders template → htmlContent           │
   │  WebAuthn)     │  │   POSTs to Brevo api_endpoint              │
   └────────────────┘  │         │                                  │
                       │         ▼  http://127.0.0.1:<port>          │
                       │   ┌──────────────────────────────────────┐ │
                       │   │ FAKE Brevo HTTP server (test harness)│ │
                       │   │  returns { messageId: "fake-<uuid>" }│ │
                       │   │  HTTP 200                             │ │
                       │   └──────────────────────────────────────┘ │
                       │   on success writes emailsender.sender_log │
                       │   with interpolated_sent_message = HTML    │
                       └────────────────────────────────────────────┘

   Virtual WebAuthn authenticator (Playwright context.credentials)
   intercepts navigator.credentials.create/get on the FE page:
        page ──► navigator.credentials.create() ──► [intercepted, answered]
        page ──► navigator.credentials.get()  ──► [intercepted, answered]
   rpId = "localhost", RPOrigin = "http://localhost:5173"
```

---

## Test environment prerequisites

Before running `pnpm test:e2e`, **all** of the following must be up and reachable. The test suite does **not** start any of them (matching `playwright.config.ts`, which has no `webServer` block, and the AGENTS.md dev-server rule: never start a second FE/BE dev server — reuse the running one).

| Service        | Port  | How to verify                                   |
|----------------|-------|-------------------------------------------------|
| FE dev server  | 5173  | `curl -sS http://localhost:5173/login` → 200    |
| BE API         | 3001  | `curl -sS http://localhost:3001/api/v1/auth/config` → JSON |
| Casdoor        | 8000  | `curl -sS http://localhost:8000/api/health` → 200 |
| MySQL (Casdoor)| 3306  | `nc -z 127.0.0.1 3306`                          |
| Postgres       | 5432  | `psql "$DATABASE_URL" -c 'select 1'`            |
| NATS           | 4222  | `nc -z 127.0.0.1 4222`                          |
| emailsender    | 3003  | `curl -sS http://localhost:3003/health` → 200   |

**Dev-server rule (critical):** Check ports 5173 and 3001 first. If a dev server is already running, use it. Do **not** spawn `pnpm dev` from the test harness or from Playwright config.

**Database connection:**
```
DATABASE_URL=postgres://primebrick:primebrick_dev@127.0.0.1:5432/primebrick
```
Schema of interest: `emailsender` (table `sender_log`, columns `interpolated_sent_message`, `recipients`, `status`, `sent_at`).

**Fake Brevo setup (one-time, performed by global setup):**
1. Insert/update a row in `emailsender.providers`:
   ```sql
   INSERT INTO emailsender.providers (provider, api_endpoint, api_key, from_email, is_active)
   VALUES ('brevo', 'http://127.0.0.1:<port>', 'fake', 'test@primebrick.local', true)
   ON CONFLICT (provider) DO UPDATE SET
     api_endpoint = EXCLUDED.api_endpoint,
     api_key      = EXCLUDED.api_key,
     from_email   = EXCLUDED.from_email,
     is_active    = true;
   ```
   `<port>` is the port the fake Brevo server binds to (from env `FAKE_BREVO_PORT` or random).
2. Start the fake Brevo HTTP server (see `helpers/fake-brevo.ts`). It responds to any `POST /*` with `{ "messageId": "fake-<uuid>" }` and HTTP 200.
3. After the run, stop the fake server (global teardown). The `providers` row may be left in place for the dev environment or reset — left as an operational choice.

**Casdoor seed (pre-existing):** `setup-casdoor.ts` seeds admin `admin`/`admin`, email `admin@acme.local`, org `ACME` → `acme`, Casdoor at `http://localhost:8000`, with `enable_web_authn=true` on the application. Defaults overridable via env: `CASDOOR_ADMIN_USERNAME`, `CASDOOR_ADMIN_PASSWORD`, etc.

---

## Test data & cleanup strategy

- **Uniqueness per run:** every run generates a timestamp suffix `<ts>` = `Date.now()` (or a short UUID). Username/email:
  - Suite A: `e2e_pwd_<ts>` / `e2e_pwd_<ts>@primebrick.test`
  - Suite B: `e2e_passkey_<ts>` / `e2e_passkey_<ts>@primebrick.test`
- **Serial execution:** both suites use `test.describe.serial(...)` so the full journey (create → onboard → login → optional passkey) runs in order against a single created user.
- **Isolation:** Playwright fixtures provide a fresh browser context per test where needed (e.g. the invitee's onboarding context is incognito/separate from the admin context). The admin context is shared within a serial suite.
- **Cleanup (after each suite, in an `afterAll`):**
  1. Delete the user in Casdoor (admin API: `DELETE /api/v1/auth/users/:uuid`) and/or via Casdoor admin API directly.
  2. Delete the invitation row if one persists (BE admin endpoint or direct DB).
  3. Delete `emailsender.sender_log` rows for the test email:
     ```sql
     DELETE FROM emailsender.sender_log
     WHERE recipients->>'to' ? $1 AND recipients->>'to' ? $2;
     ```
  4. Delete the enrolled passkey (Suite B only): `DELETE /api/v1/auth/webauthn/credentials/:id`.
  5. Remove `playwright/.auth/passkey.json` if created (Suite B).
- **Resilience:** cleanup runs in a `try/finally` so a mid-test failure still removes residue. Tests assert no leftover `sender_log` rows for the test email after cleanup.

---

## New files to create (FE repo `src/e2e/`)

All new files live in `d:/git/primebrick/primebrick-fe-v3/src/e2e/`.

### `helpers/db.ts`
A `pg` Pool helper bound to `process.env.DATABASE_URL`. Exports:
- `pool` — singleton `pg.Pool`.
- `getLatestEmailLog(email)` — `SELECT interpolated_sent_message, recipients, status, sent_at FROM emailsender.sender_log WHERE recipients->>'to' ? $1 ORDER BY sent_at DESC LIMIT 1`.
- `getEmailLogByTemplate(email, templateCode)` — joins to template if `template_code` is stored, else filters `interpolated_sent_message` by a known marker. Used for the `invitation_welcome` email (see Suite A step 2).
- `cleanupEmailLogs(email)` — deletes rows for the test email.
- `closePool()` — for teardown.

### `helpers/otp.ts`
- `waitForOtp(email, pool, timeoutMs = 15000)` — polls `getLatestEmailLog(email)` every ~500ms until a row with `status IN ('sent','failed')` and a 6-digit code in `interpolated_sent_message` appears. Parses the code with `/\b(\d{6})\b/` (the `otp_verification` template wraps it in `<h1 ...>{{otp_code}}</h1>` with letter-spacing — see `emailsender/db-meta/fire-and-forget/seed_onboarding_email_templates.sql` lines 38–50). Returns the 6-digit string. Throws on timeout.

### `helpers/fake-brevo.ts`
- `startFakeBrevo(port?)` — starts an `http.createServer` that responds to any `POST` with `{"messageId":"fake-<uuid>"}` and 200. Reuses the pattern from `emailsender/test/helpers/fake-brevo-server.ts`. Returns `{ port, close }`.
- `stopFakeBrevo(server)` — closes the server.
- Port resolution: `process.env.FAKE_BREVO_PORT` or `0` (OS-assigned); the chosen port is written into the `providers` row by global setup.

### `helpers/webauthn.ts`
A Playwright fixture + helpers wrapping the virtual authenticator:
- `seedPasskey(context, rpId = 'localhost')` — `await context.credentials.create({ rpId })`.
- `installAuthenticator(context)` — `await context.credentials.install()`.
- `capturePasskey(context, rpId = 'localhost')` — `await context.credentials.get({ rpId })`, returns the credential JSON (incl. private key).
- `savePasskey(cred)` — writes JSON to `playwright/.auth/passkey.json`.
- `loadPasskey()` — reads it back.
- `reseedPasskey(context, cred, rpId = 'localhost')` — seeds a previously captured passkey back into a fresh context (`context.credentials.create({ rpId, ...cred })`).

> **rpId is `localhost`** because Casdoor's `app.conf` has `origin =` (empty), so Casdoor derives the WebAuthn RPOrigin from the request `Host` header. The BE sends `Host: <browser-host>` (e.g. `localhost:5173`) via `hostOverride` in `fetchWithHost()` (see `src/modules/auth/services/webauthn.service.ts`). Therefore `rpId = 'localhost'`, `RPOrigin = 'http://localhost:5173'`. The virtual authenticator must seed passkeys with `rpId: 'localhost'`.

### `helpers/admin-login.ts`
- `loginAsAdmin(page)` — navigates to `/login`, fills the `LoginForm` (username `admin`, password `admin` from env), submits, waits for redirect away from `/login`. Returns the authenticated `page`/`context`. Relies on `data-testid` additions (see Locator strategy) or `getByLabel` fallback.

### `auth-password.spec.ts` — Test suite A
Full invitation flow + username/password login. See detailed steps below.

### `auth-passkey.spec.ts` — Test suite B
Full invitation flow + password login + passkey enrollment + logout + passkey login. See detailed steps below.

### `global.setup.ts` (optional) / `global.teardown.ts`
- `global.setup.ts`: starts the fake Brevo server, upserts the `emailsender.providers` row pointing at it, exposes the port via a temp file or env var for the specs. Optionally verifies all prerequisite ports are up and fails fast with a clear message if not.
- `global.teardown.ts`: stops the fake Brevo server, closes the `pg` pool.
- Wired in `playwright.config.ts` via `globalSetup` / `globalTeardown` fields (a config change — see FE config changes).

---

## US repo changes (minimal — prerequisite)

**Repo:** `d:/git/primebrick/primebrick-us-v3`
**File:** `src/services/email-service.ts`

**Problem:** On the success path (lines 91–109) the `sender_log` row is written with `interpolated_sent_message` populated. On the failure path (lines 117–147) the row is written with `status='failed'` but `interpolated_sent_message` is **not** populated. In dev, `BREVO_API_KEY` is a placeholder → the Brevo call fails → the OTP is not retrievable from the log as-is.

**Fix:** Compute the rendered content (`htmlContent`/`textContent`) **before** the try block (or capture it in an outer scope) so it is available in the `catch` block, and include it in the failure-path `sender_log` insert. This is a genuine prod-useful improvement (debugging failed sends), kept minimal.

Illustrative diff (exact line numbers may shift; the intent is to hoist `htmlContent`/`textContent` out of the try and pass them into the failure insert):

```diff
@@ email-service.ts
-  try {
-    const htmlContent = await renderTemplate(...);
-    const textContent = ...;
-    const resp = await brevo.send({ htmlContent, textContent, ... });
-    // success path: insert sender_log with interpolated_sent_message = htmlContent
+  // Hoist rendered content so it is available in the catch block too.
+  const htmlContent = await renderTemplate(...);
+  const textContent = ...;
+  try {
+    const resp = await brevo.send({ htmlContent, textContent, ... });
+    // success path: insert sender_log with interpolated_sent_message = htmlContent
   } catch (err) {
-    // failure path: insert sender_log with status='failed', NO interpolated_sent_message
+    // failure path: insert sender_log with status='failed' AND interpolated_sent_message
+    await logSenderRow({
+      status: 'failed',
+      interpolated_sent_message: htmlContent ?? textContent ?? null,
+      template_uuid: templateUuid ?? null,
+      recipients,
+      error: String(err),
+    });
   }
```

> **Flag:** This is a code change to the US repo and is a **prerequisite** for the E2E suite. It must be merged before the E2E suites can retrieve OTPs reliably. Even with the fake Brevo (which makes the send succeed), this patch is required as a safety net so a flaky fake server does not make OTPs unretrievable.

---

## FE repo config changes

**Repo:** `d:/git/primebrick/primebrick-fe-v3`

1. **`.gitignore`** — add `playwright/.auth/` (the directory where captured passkey JSON is stored). Only add if not already present.
   ```
   # Playwright auth artifacts
   playwright/.auth/
   ```
2. **`package.json`** — optionally add a focused script:
   ```json
   "test:e2e:auth": "playwright test src/e2e/auth-password.spec.ts src/e2e/auth-passkey.spec.ts"
   ```
3. **`playwright.config.ts`** — **do not** change the `projects` array (stay chromium-only). Optionally add:
   ```ts
   globalSetup: require.resolve('./src/e2e/global.setup.ts'),
   globalTeardown: require.resolve('./src/e2e/global.teardown.ts'),
   ```
   This is a config change; keep everything else identical (testDir, baseURL, no webServer).

---

## Test suite A — `auth-password.spec.ts`

**Goal:** verify the full invitation → onboarding → password login journey end-to-end.

**Pre:** fake Brevo up, `providers` row configured, admin logged in via UI (`helpers/admin-login.ts`).

```ts
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/admin-login';
import { waitForOtp } from './helpers/otp';
import { pool, cleanupEmailLogs, getLatestEmailLog } from './helpers/db';

test.describe.serial('Suite A — user creation + password login', () => {
  const ts = Date.now();
  const username = `e2e_pwd_${ts}`;
  const email = `e2e_pwd_${ts}@primebrick.test`;
  let adminPage: Page;

  test.beforeAll(async ({ browser }) => {
    adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);
  });

  test.afterAll(async () => {
    // cleanup user, invitation, sender_log rows
    await cleanupEmailLogs(email);
    await adminPage.close();
  });

  test('admin creates invited user', async () => { /* Step 1 */ });
  test('invitee completes onboarding', async ({ browser }) => { /* Steps 3-6 */ });
  test('invitee logs in with password', async ({ browser }) => { /* Step 7 */ });
});
```

### Step-by-step

**Step 1 — admin creates user via UI.**
- Navigate to the admin user-creation page (verify exact route by grepping FE routes for the users admin UI; if the admin UI does not yet expose `send_invitation`, fall back to calling `POST /api/v1/auth/users` with `send_invitation=true` from the admin-authenticated context — the BE DTO `makeCreateUserSchema` in `src/modules/auth/dto.ts` accepts `username`, `email`, `display_name`, `roles`, `idp_org`, `is_active`, `is_admin`, `is_verified`, `email_verified`, `send_invitation` (default false); password is optional when `send_invitation=true`).
- Fill username `e2e_pwd_<ts>`, email `e2e_pwd_<ts>@primebrick.test`, display name `E2E Pwd`, set `send_invitation=true`.
- **Assert:** success toast/redirect; an `invitation_welcome` email row appears in `emailsender.sender_log` for the test address.

**Step 2 — extract invitation token.**
- The invitation email (`invitation_welcome` template) contains a `welcome_link` with the token in the URL fragment: `.../welcome#token=<token>`.
- Query `emailsender.sender_log` for the `invitation_welcome` email to the test address (filter by `recipients->>'to'` and a template marker in `interpolated_sent_message`), parse the link out of the HTML, extract `#token=...`.
- This is a **second use** of `sender_log` beyond OTP — the same retrieval mechanism powers both.

**Step 3 — open onboarding in a fresh incognito context.**
- `const ctx = await browser.newContext(); const page = await ctx.newPage();`
- `await page.goto(`${baseURL}/welcome#token=${token}`);`
- **Assert:** the welcome page renders the verify step; the invitee's `display_name` is shown (see `src/routes/welcome/+page.svelte`).

**Step 4 — trigger & wait for OTP.**
- Per `src/routes/welcome/+page.svelte` (lines ~100–105), `verifyToken()` calls `sendOtp()` automatically after a successful verify. So navigating to the token URL both verifies and sends the OTP.
- `const otp = await waitForOtp(email, pool, 15000);`

**Step 5 — enter OTP, verify.**
- Fill the OTP input(s) with the 6-digit code, submit.
- **Assert:** welcome page step transitions to `otp-verified`.

**Step 6 — set password, complete.**
- Enter the new password (respecting the policy from `usePasswordPolicy`) and confirmation, submit.
- **Assert:** step transitions to `complete`.

**Step 7 — password login.**
- Open `/login` in a fresh context. Fill username + password via `LoginForm.svelte` (`getByLabel` or `data-testid`).
- Submit. **Assert:** redirect to `/`; `GET /api/v1/auth/me` returns the user (username matches); httpOnly auth cookies are set.

**Step 8 — cleanup.**
- Delete the user via admin API/UI; `cleanupEmailLogs(email)`.

### Locator strategy (Suite A)
Prefer `getByRole` / `getByLabel`. The `LoginForm` uses `$t('login.username')` etc., so `getByLabel` works only if `<label>` is associated. If labels are i18n-only and brittle, add `data-testid` (see Locator strategy section). Sketch:
```ts
await page.getByTestId('login-username').fill(username);
await page.getByTestId('login-password').fill(password);
await page.getByTestId('login-submit').click();
```

---

## Test suite B — `auth-passkey.spec.ts`

**Goal:** verify passkey enrollment and discoverable passkey login, layered on top of Suite A's journey.

**Steps 1–7:** identical to Suite A (create user → welcome → OTP → set password → first password login). Use `test.describe.serial` so the user is created once. Use a distinct timestamp/email (`e2e_passkey_<ts>`).

**Step 8 — enroll a passkey.**
- After password login, navigate to the profile/settings page where `PasskeyEnrollment.svelte` is mounted.
  > **Prerequisite to verify:** grep FE routes for `PasskeyEnrollment` import to confirm the exact route. If `PasskeyEnrollment` is not yet mounted on any route, flag it as a blocker (see Risks).
- Install the virtual authenticator on the context: `await context.credentials.install();`
- Click "Add passkey". The FE calls `POST /api/v1/auth/webauthn/signup/begin` → `navigator.credentials.create()` (intercepted by the virtual authenticator) → `POST /api/v1/auth/webauthn/signup/finish`.
- **Assert:** the passkey appears in the credentials list (`GET /api/v1/auth/webauthn/credentials` returns 1 item); the UI shows the new credential.

**Step 9 — capture the enrolled passkey.**
```ts
const cred = await context.credentials.get({ rpId: 'localhost' });
savePasskey(cred); // → playwright/.auth/passkey.json
```

**Step 10 — passkey login in a fresh context.**
- Log out. Open `/login` in a fresh context.
- Seed the captured passkey and install the authenticator:
  ```ts
  const saved = loadPasskey();
  await context.credentials.create({ rpId: 'localhost', ...saved });
  await context.credentials.install();
  ```
- Click "Sign in with passkey" (`PasskeyButton.svelte`). The FE calls `POST /api/v1/auth/webauthn/signin/begin` → `navigator.credentials.get()` (intercepted) → `POST /api/v1/auth/webauthn/signin/finish`.
- **Assert:** redirect to `/`; `GET /api/v1/auth/me` returns the user.

**Step 11 — cleanup.**
- Delete the passkey: `DELETE /api/v1/auth/webauthn/credentials/:id`.
- Delete the user; `cleanupEmailLogs(email)`; remove `playwright/.auth/passkey.json`.

### Exact `context.credentials` API calls used
```ts
// enrollment
await context.credentials.install();
// (page triggers navigator.credentials.create → answered by authenticator)
const cred = await context.credentials.get({ rpId: 'localhost' });

// login in fresh context
await context.credentials.create({ rpId: 'localhost', credential: savedCred });
await context.credentials.install();
// (page triggers navigator.credentials.get → answered by authenticator)
```

---

## Locator strategy — `data-testid` convention (APPROVED)

### Philosophy: brittle-on-purpose

The FE uses Svelte i18n (`$t('login.username')`, `$t('login.password')`, etc.) and
Tailwind/CSS classes that may change across refactors. Text-based and class-based
locators are brittle for the WRONG reason (they break on cosmetic changes that
don't affect behavior). `data-testid` attributes are brittle for the RIGHT
reason: they break only when an element's **purpose** changes or the element is
removed — which is exactly the kind of refactor the team should be alerted to.

**Decision (approved by user):** every interactive DOM element that an E2E test
needs to locate MUST carry a stable, predictable `data-testid`. The testid is
derived from the element's **purpose**, never from its visual label, CSS class,
or i18n string. If a future refactor removes or repurposes an element, the
corresponding E2E test fails — and that failure is a **desired signal** that a
significant UX/structural refactor happened and the test (and possibly the
feature contract) needs review.

### Naming convention

Format: `<component-scope>-<element-purpose>` in `kebab-case`.

Rules:
1. **`<component-scope>`** = the Svelte component or route that owns the element
   (e.g. `login`, `welcome`, `passkey-enrollment`, `passkey-prompt`). Stable
   across refactors as long as the component's responsibility stays the same.
2. **`<element-purpose>`** = what the element IS or DOES, in semantic terms
   (e.g. `username-input`, `submit-button`, `otp-input`, `add-button`). Never
   the visible text, never the CSS class.
3. **Unique within the page** — if the same component renders multiple rows
   (e.g. passkey list), the container has the base testid and each row uses
   `data-testid="<base>-item"` with `data-credential-id="<id>"` for disambiguation.
   Locators use `page.getByTestId('passkey-enrollment-item').filter({ hasText: ... })`
   or the `data-credential-id` attribute.
4. **Never reuse a testid across components** — each testid belongs to exactly
   one component/element. Duplication defeats the purpose.
5. **Testids are not styling hooks** — never add CSS selectors that target
   `[data-testid=...]`. They exist for test selection only. (Enforced by lint
   rule — see Devin rules section.)
6. **Adding/removing a testid is a deliberate act** — when refactoring, if you
  move an element to a new component, carry the testid with it (or update the
   E2E test in the same PR). Never silently drop a testid.

### Testid table (elements required by Suites A & B)

| Component (file)                              | Element            | `data-testid`                  |
|-----------------------------------------------|--------------------|--------------------------------|
| `LoginForm.svelte`                            | username input     | `login-username-input`         |
| `LoginForm.svelte`                            | password input     | `login-password-input`         |
| `LoginForm.svelte`                            | submit button      | `login-submit-button`          |
| `PasskeyButton.svelte`                        | passkey button     | `login-passkey-button`         |
| `PasskeyEnrollment.svelte`                    | add-passkey button | `passkey-enrollment-add-button`|
| `PasskeyEnrollment.svelte`                    | credential list    | `passkey-enrollment-list`      |
| `PasskeyEnrollment.svelte`                    | list item (row)    | `passkey-enrollment-item`      |
| `PasskeyEnrollment.svelte`                    | delete button (row)| `passkey-enrollment-delete-button` |
| `PasskeyPromptDialog.svelte`                  | dismiss button     | `passkey-prompt-dismiss-button`|
| `PasskeyPromptDialog.svelte`                  | enroll button      | `passkey-prompt-enroll-button` |
| `welcome/+page.svelte`                        | OTP input          | `welcome-otp-input`            |
| `welcome/+page.svelte`                        | verify/next button | `welcome-next-button`          |
| `welcome/+page.svelte`                        | resend OTP button  | `welcome-resend-otp-button`    |
| `welcome/+page.svelte`                        | new password input | `welcome-password-input`       |
| `welcome/+page.svelte`                        | confirm password   | `welcome-password-confirm-input`|
| `welcome/+page.svelte`                        | complete button    | `welcome-complete-button`      |
| `welcome/+page.svelte`                        | error alert        | `welcome-error-alert`          |
| `welcome/+page.svelte`                        | step container     | `welcome-step-<step>` (loading/verify/otp-sent/otp-verified/complete/error/expired) |
| Admin user-creation page (TBD route)          | create-user form   | `admin-user-create-form`       |
| Admin user-creation page                      | username input     | `admin-user-create-username-input` |
| Admin user-creation page                      | email input        | `admin-user-create-email-input`|
| Admin user-creation page                      | send-invitation toggle | `admin-user-create-send-invitation-toggle` |
| Admin user-creation page                      | submit button      | `admin-user-create-submit-button` |

> **Note:** the admin user-creation route must be verified during implementation
> (grep FE routes for the user-management page). If it doesn't exist yet, Suite A
> Step 1 falls back to creating the user via `POST /api/v1/auth/users` directly
> (apiFetch) and the admin UI testids are deferred — flagged in Risks.

### Locator usage in tests

All E2E locators use `page.getByTestId(...)` as the primary selector. Example:

```ts
await page.getByTestId('login-username-input').fill('admin');
await page.getByTestId('login-password-input').fill('admin');
await page.getByTestId('login-submit-button').click();
```

For list items with disambiguation:

```ts
const item = page.getByTestId('passkey-enrollment-item')
  .filter({ has: page.getByText(credentialIdPrefix) });
await item.getByTestId('passkey-enrollment-delete-button').click();
```

---

## E2E testid convention — AI agent docs & Devin rules (NEW)

To enforce the brittle-on-purpose testid convention beyond this single plan,
the implementation creates persistent agent-facing documentation and rules.

### Files to create

1. **`primebrick-fe-v3/.devin/rules/e2e-testid-convention.md`** — Devin rule
   (always-on, enforced on every FE session). Content:
   - Trigger: applies whenever an AI agent adds, modifies, or removes an
     interactive DOM element in a Svelte component or route that could be
     targeted by E2E tests.
   - Mandatory: every interactive element (input, button, toggle, link, dialog
     action, list item that a test needs to locate) MUST carry a `data-testid`
     following the `<component-scope>-<element-purpose>` kebab-case convention.
   - Forbidden: deriving testids from CSS classes, i18n labels, or visible text.
   - Forbidden: using `[data-testid=...]` as a CSS selector in `<style>` blocks
     or `class:` directives.
   - Forbidden: silently dropping a testid during a refactor — either carry it
     to the new element or update the E2E test in the same change.
   - Forbidden: reusing the same testid across two different components.
   - Required: when adding a new interactive element to a component that already
     has testids, add a testid for the new element in the same PR.
   - Enforcement: AI agent MUST add `data-testid` when creating new interactive
     elements; MUST flag missing testids when editing existing components; MUST
     NOT remove an existing testid without updating the E2E test that references it.

2. **`primebrick-fe-v3/docs/ai/e2e-testid-convention.md`** — human + AI readable
   doc (synced to the `docs/ai/` folder, NOT to the public docs site). Content:
   - The brittle-on-purpose philosophy (why testids, not classes/text).
   - The naming convention with examples.
   - The full testid registry table (the table above, kept in sync as new
     components are added).
   - How to locate elements in Playwright (`getByTestId`).
   - How to handle list items (container + item + `data-credential-id`).
   - Refactor protocol: when you move/rename/remove an element, update the
     testid registry and the E2E test in the same PR.

3. **Update `primebrick-fe-v3/AGENTS.md`** — append a short section under
   "Further documentation" pointing to `docs/ai/e2e-testid-convention.md` and
   mentioning the `.devin/rules/e2e-testid-convention.md` rule. One paragraph.

4. **Update `primebrick-fe-v3/.devin/rules/always-check-rules-first.md`** —
   no change needed (it already mandates reading `.devin/rules/` before action;
   the new rule file will be picked up automatically).

### Why both a rule and a doc

- The **Devin rule** (`.devin/rules/e2e-testid-convention.md`) is enforced
  automatically on every AI agent session — it's the active guardrail.
- The **`docs/ai/` doc** is the reference humans and AI consult when writing
  tests or components — it holds the full registry and rationale.
- The **AGENTS.md pointer** ensures any agent reading AGENTS.md (the standard
  entry point) discovers the convention.

---

## Acceptance criteria

- [ ] (a) `pnpm test:e2e` passes locally with the full stack up (FE/BE/Casdoor/Postgres/NATS/emailsender) and the fake Brevo running.
- [ ] (b) Suite A (`auth-password.spec.ts`) covers the password flow end-to-end: admin creates invited user → invitee onboards (token verify → OTP → set password) → password login succeeds.
- [ ] (c) Suite B (`auth-passkey.spec.ts`) covers passkey enrollment (post-login) and discoverable passkey login in a fresh context.
- [ ] (d) OTP is retrieved from `emailsender.sender_log` with **zero** real email sends (fake Brevo returns 200; no outbound SMTP/Brevo API call leaves the machine).
- [ ] (e) No duplicate dev servers are started — tests connect to already-running services on 5173/3001; `playwright.config.ts` retains no `webServer`.
- [ ] (f) Cleanup leaves no residue: no test user, no invitation, no `sender_log` rows for the test email, no leftover passkey JSON after Suite B.
- [ ] (g) US repo `email-service.ts` patch (failure-path `interpolated_sent_message`) is merged.
- [ ] (h) `playwright/.auth/` is gitignored.

---

## Risks & open questions

1. **PasskeyEnrollment route unknown.** The exact FE route where `PasskeyEnrollment.svelte` is mounted must be verified before implementation (grep `src/routes` for `PasskeyEnrollment` import). If it is not mounted anywhere yet, Suite B step 8 is blocked and the passkey feature plan (`feature-webauthn-passkey-auth.md`) must land that route first.
2. **Casdoor rpId derivation from Host header.** Casdoor's `app.conf` has `origin =` (empty), so it derives RPOrigin from the request `Host` header. Verify with a manual `GET /api/v1/auth/webauthn/signin/begin` (or `signup/begin`) and inspect the returned `options.publicKey.rpId` — it must be `localhost` for the virtual authenticator to match. If Casdoor returns a different rpId, the BE `hostOverride`/`fetchWithHost()` in `webauthn.service.ts` must be adjusted.
3. **Virtual authenticator vs Casdoor server-side challenge validation.** Casdoor validates the signed assertion using the origin it derived from the Host header. The virtual authenticator signs with `rpId='localhost'` and origin `http://localhost:5173`. If these mismatch, `signin/finish` / `signup/finish` will fail. Confirm with a manual enrollment+login before committing the suite.
4. **Concurrent E2E runs against a shared dev DB.** If multiple devs run E2E against the same Postgres/Casdoor, test data may collide. Mitigation: unique email/username per run (timestamp suffix) + per-run cleanup; do not hardcode `admin`-created test data that another run might delete.
5. **Welcome page auto-sends OTP on verify.** Confirmed: per `src/routes/welcome/+page.svelte` (~lines 100–105), `verifyToken()` calls `sendOtp()` automatically after a successful verify. Suite A step 4 relies on this; do not add a separate "send OTP" click unless the page changes.
6. **`data-testid` additions — APPROVED.** The brittle-on-purpose testid convention is approved by the user (see Locator strategy & E2E testid convention sections). Implementation adds testids to LoginForm/PasskeyButton/PasskeyEnrollment/PasskeyPromptDialog/welcome page and creates the enforcing Devin rule + `docs/ai/` doc + AGENTS.md pointer.
7. **Fake Brevo port binding.** If `FAKE_BREVO_PORT` is fixed and another process holds it, the fake server fails to start. Prefer port `0` (OS-assigned) and write the chosen port into the `providers` row at runtime.
8. **emailsender providers row caching.** If emailsender caches the Brevo provider config in-memory, updating the `providers` row mid-run may not take effect until restart. Start the fake Brevo and set the row **before** emailsender is started, or restart emailsender after seeding.

---

## Out of scope

- Multi-browser testing (Firefox/WebKit) — stay chromium-only.
- Mobile viewport / responsive layout tests.
- Accessibility audit — a separate axe-audit script/plan exists.
- OIDC / SSO login flows.
- MFA / 2FA flows — separate plan.
- Rate-limiting / brute-force tests.
- Exhaustive negative-path testing. Candidates for a later plan:
  - wrong OTP (should fail, attempt counter increments; max 10 per `invitation.service.ts`).
  - expired invitation token (5-min OTP expiry; token expiry TBD).
  - wrong password at login.
  - cancelled passkey prompt (virtual authenticator returns no credential).
  - passkey login with no matching credential seeded (should fail gracefully).

---

## Implementation order

- **Phase 0 — US repo patch + fake Brevo helper.**
  - Patch `emailsender/src/services/email-service.ts` failure path to store `interpolated_sent_message` (and `template_uuid` if available). Merge to US repo.
  - Create `src/e2e/helpers/fake-brevo.ts` in the FE repo, reusing the `emailsender/test/helpers/fake-brevo-server.ts` pattern.
- **Phase 1 — `data-testid` additions + enforcement rules (APPROVED, MANDATORY prerequisite).**
  - Add testids to LoginForm, PasskeyButton, PasskeyEnrollment, PasskeyPromptDialog, welcome page inputs/buttons per the testid table. This MUST happen before the suites reference them via `getByTestId`.
  - Create `primebrick-fe-v3/.devin/rules/e2e-testid-convention.md` (always-on Devin rule).
  - Create `primebrick-fe-v3/docs/ai/e2e-testid-convention.md` (reference doc with full testid registry).
  - Append a pointer paragraph to `primebrick-fe-v3/AGENTS.md` under "Further documentation".
- **Phase 2 — FE helpers.**
  - `helpers/db.ts`, `helpers/otp.ts`, `helpers/webauthn.ts`, `helpers/admin-login.ts`.
  - Add `playwright/.auth/` to `.gitignore`.
- **Phase 3 — global setup/teardown + providers row seeding.**
  - `global.setup.ts` (start fake Brevo, upsert `providers` row, precondition port checks), `global.teardown.ts` (stop fake Brevo, close pool).
  - Wire `globalSetup`/`globalTeardown` in `playwright.config.ts` (no project changes).
- **Phase 4 — Suite A (`auth-password.spec.ts`).**
  - Admin login → create invited user → extract token from `sender_log` → onboarding (verify → OTP → password) → password login → cleanup. Locators use `getByTestId` (testids from Phase 1).
- **Phase 5 — Suite B (`auth-passkey.spec.ts`).**
  - Reuse Suite A journey through first password login → passkey enrollment → capture passkey → fresh-context passkey login → cleanup. Locators use `getByTestId` (testids from Phase 1).
- **Phase 6 — cleanup hardening + CI readiness notes.**
  - Ensure `afterAll` cleanup is idempotent and runs on failure; document CI prerequisites (all services up, fake Brevo started by global setup, `DATABASE_URL` set, Casdoor seeded).
