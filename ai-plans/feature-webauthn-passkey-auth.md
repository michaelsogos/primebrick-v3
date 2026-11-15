# Feature: WebAuthn / Passkey Passwordless Authentication (FE + BE)

## Status: DRAFT — Awaiting approval

## Objective

Add passwordless login via WebAuthn / passkeys to the Primebrick frontend login
page (and the session-expired modal, and the MCP consent page — all reuse
`LoginForm.svelte`). The frontend owns 100% of the UI; no Casdoor/IDP-hosted
screens are shown to the user. The backend proxies Casdoor's WebAuthn API so the
browser never talks to Casdoor directly.

## Decisions (confirmed with user)

- **Method:** WebAuthn / passkeys (discoverable credentials — true passwordless,
  no username required at login time).
- **UX:** Inline (Option B). A "Sign in with passkey" path is added inside the
  existing `LoginForm.svelte` card. No redirect to IDP screens.
- **Scope:** Full plan — FE + BE.
- **Constraint:** ALL FE logic lives in the FE repo. No IDP screens.

## Architecture overview

```
Browser (FE)                  Primebrick BE                 Casdoor
  |  navigator.credentials       |                            |
  |  .get() / .create()          |  proxy + session relay     |
  |  ------------------------>   |  ----------------------->  |
  |                              |  /api/webauthn/signin/*    |
  |                              |  /api/webauthn/signup/*    |
  |  <--- options / result ----- |  <--- options / tokens --- |
  |  cookies set by BE           |  exchanges code for tokens |
```

The BE acts as an orchestrator/proxy for Casdoor's 4 WebAuthn endpoints. This
keeps Casdoor's endpoint URL, client credentials, and session mechanics off the
browser. The BE relays the Casdoor session cookie between the `begin` and
`finish` calls (Casdoor stores WebAuthn challenge data server-side).

### Why BE-proxy (not FE-direct-to-Casdoor)

1. **Consistency** — the existing password login already proxies through the BE
   (OAuth password grant). Passkey login follows the same shape: BE returns
   tokens, BE sets httpOnly cookies.
2. **No CORS / third-party-cookie issues** — the browser never makes
   cross-origin calls to Casdoor.
3. **Credential secrecy** — `clientId`/`clientSecret` stay server-side.
4. **Session relay is cheap** — the BE captures Casdoor's `Set-Cookie` from the
   `begin` response, stashes it keyed by a random nonce, and replays it on
   `finish`.

### Token acquisition on signin finish

Casdoor's `WebAuthnSigninFinish` calls `HandleLoggedIn(application, user,
&authForm)`. When called with `responseType=code&clientId=<app_client_id>`, it
returns an **OAuth authorization code**. The BE then exchanges that code at
Casdoor's token endpoint (`/api/login/oauth/access_token`, `grant_type=
authorization_code`) — identical mechanics to a standard OAuth code flow — and
receives `access_token` + `refresh_token`. The BE sets the same httpOnly cookies
as the password login (`setAuthCookies`), so the rest of the app is unchanged.

## Casdoor WebAuthn endpoint reference (verified from source)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/webauthn/signup/begin` | GET | Casdoor session (`getCurrentUser`) | Start passkey enrollment (user must be logged in) |
| `/api/webauthn/signup/finish` | POST | Casdoor session | Complete enrollment, store credential on user |
| `/api/webauthn/signin/begin` | GET | public | Start login. `owner` + `name` query params. If `name` empty → **discoverable login** (passkey-only, no username) |
| `/api/webauthn/signin/finish` | POST | public | Complete login. `responseType=code&clientId=...` → returns OAuth code |

Source: `controllers/webauthn.go` in casdoor/casdoor (fetched from
raw.githubusercontent.com, verified 2026-07-16).

## Key risks / investigation points

1. **Enrollment session** — `WebAuthnSignupBegin` calls `getCurrentUser()`,
   which reads a **Casdoor session**, not an OAuth access token. The Primebrick
   BE login uses the OAuth password grant and does NOT establish a Casdoor
   session. **To validate:** whether passing the user's Casdoor `access_token`
   as a cookie/header to the signup endpoints lets `getCurrentUser()` resolve
   the user. If not, the BE must establish a short-lived Casdoor session for the
   user (e.g., via a server-side Casdoor login using the SDK's admin credentials
   to impersonate, or by calling Casdoor's `/api/login` with the access token).
   This is the single biggest unknown and must be resolved in step 0 (spike)
   before building enrollment.

2. **Casdoor session cookie relay** — the BE must capture and replay Casdoor's
   session cookie between `begin` and `finish`. Implementation: an in-memory
   `Map<nonce, casdoorSessionCookie>` with a TTL (~5 min). Horizontal scaling
   note: if the BE runs multiple instances, this map must be in a shared store
   (Redis) or pinned via sticky sessions. For now (single-instance dev/UAT),
   in-memory is acceptable; flag for prod.

3. **Discoverable credentials support** — requires Casdoor config: the
   application must have WebAuthn enabled and the organization must allow
   passkeys. Verify in Casdoor admin UI before testing.

4. **RP ID / origin** — WebAuthn `rpId` is derived by Casdoor from the request
   `Host` header. Since the BE proxies, the `Host` seen by Casdoor is the BE's
   outbound request host, NOT the browser's origin. **The BE must forward the
   browser's `Origin`/`Host`** (or set it so Casdoor computes the correct
   `rpId`). If `rpId` doesn't match the FE origin, `navigator.credentials.get()`
   will fail in the browser. This is critical and must be tested early.

## Implementation steps

### Step 0 — Spike (BE, ~half day)

Validate the two risks above before building anything:
1. Stand up a Casdoor instance with WebAuthn enabled.
2. Manually call `/api/webauthn/signin/begin` + `/finish` via curl/Postman
   through the BE to confirm the code-exchange path returns usable tokens.
3. Confirm the `rpId`/origin handling — the BE must pass the correct origin so
   Casdoor's `rpId` matches the FE's domain.
4. Confirm whether `access_token` satisfies `getCurrentUser()` for signup, or
   whether a Casdoor session must be established.

**Gate:** do not proceed to step 1+ until the spike confirms the signin code
exchange works end-to-end and the rpId/origin issue is resolved.

### Step 1 — BE: WebAuthn signin endpoints

**New files:**
- `primebrick-be-v3/src/modules/auth/services/webauthn.service.ts` — owns the
  Casdoor proxy logic + session cookie relay + code exchange.
- `primebrick-be-v3/src/modules/auth/routers/auth-webauthn.router.ts` — thin
  controller mounting the new endpoints.

**New endpoints (all `Permission.PUBLIC` except enrollment):**

| Path | Method | Body | Returns |
|---|---|---|---|
| `/api/v1/auth/webauthn/signin/begin` | POST | `{ username?: string }` (empty = discoverable) | `{ nonce, options }` — `options` is the `PublicKeyCredentialRequestOptions` JSON from Casdoor |
| `/api/v1/auth/webauthn/signin/finish` | POST | `{ nonce, credential: <PublicKeyCredential JSON>` } | `{ success: true, user }` + sets httpOnly cookies (same as `/auth/login`) |
| `/api/v1/auth/webauthn/signup/begin` | POST | (none — uses authenticated user) | `{ nonce, options }` — `PublicKeyCredentialCreationOptions` |
| `/api/v1/auth/webauthn/signup/finish` | POST | `{ nonce, credential: <PublicKeyCredential JSON>` } | `{ success: true }` |

**Service sketch (`webauthn.service.ts`):**

```ts
import type { Pool } from "pg";
import { getAuthConfig } from "../config.js";
import { setAuthCookies, buildUserFromClaims } from "./auth-session.service.js";
import type { Response } from "express";

// nonce → Casdoor session cookie(s), TTL ~5min
const sessionRelay = new Map<string, string>();

export class WebauthnService {
  constructor(private pool: Pool) {}

  async signinBegin(username?: string): Promise<{ nonce: string; options: unknown }> {
    const cfg = await getAuthConfig();
    const params = new URLSearchParams();
    params.set("owner", cfg.casdoor_organization!);
    if (username) params.set("name", username);
    // Forward the browser origin so Casdoor computes the correct rpId
    const url = `${cfg.casdoor_endpoint}/api/webauthn/signin/begin?${params}`;
    const resp = await fetch(url, { headers: { Origin: <fe_origin> } });
    if (!resp.ok) throw this.casdoorError(await resp.text(), resp.status);
    const cookie = resp.headers.get("set-cookie") ?? "";
    const options = await resp.json();
    const nonce = randomUUID();
    sessionRelay.set(nonce, cookie);
    return { nonce, options };
  }

  async signinFinish(nonce: string, credential: unknown, res: Response) {
    const cookie = sessionRelay.get(nonce);
    if (!cookie) throw new UnauthorizedError("WebAuthn session expired", { internal_code: "WEBAUTHN_SESSION_EXPIRED" });
    sessionRelay.delete(nonce);
    const cfg = await getAuthConfig();
    const params = new URLSearchParams({ responseType: "code", clientId: cfg.oidc.client_id! });
    const resp = await fetch(`${cfg.casdoor_endpoint}/api/webauthn/signin/finish?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: <fe_origin> },
      body: JSON.stringify(credential),
    });
    if (!resp.ok) throw this.casdoorError(await resp.text(), resp.status);
    const { code } = await resp.json();
    // Exchange code for tokens (authorization_code grant)
    const tokens = await this.exchangeCode(code, cfg);
    const claims = this.decodeJwtPayload(tokens.access_token);
    // same guards as password login: email-verified, roles
    setAuthCookies(res, tokens);
    return { success: true, user: buildUserFromClaims(claims) };
  }
  // signupBegin / signupFinish analogous, with access_token forwarding for getCurrentUser
}
```

**Router sketch (`auth-webauthn.router.ts`):** follows the exact pattern of
`auth-session.router.ts` — `makeProtectedRouter`, `registerRoutes`,
`asyncHandler`, `validateBody` with zod schemas in `dto.ts`.

**DTO additions (`dto.ts`):**

```ts
export const WebauthnSigninBeginSchema = z.object({
  username: z.string().optional(), // empty = discoverable login
});
export const WebauthnSigninFinishSchema = z.object({
  nonce: z.string().min(1),
  credential: z.record(z.unknown()), // navigator.credentials.get() result, serialized
});
export const WebauthnSignupFinishSchema = z.object({
  nonce: z.string().min(1),
  credential: z.record(z.unknown()),
});
```

**Wire into aggregator (`router.ts`):** add
`router.use(authWebauthnRouter())` alongside the existing routers.

**Error codes (RFC7807, snake_case per conventions):**
- `webauthn_session_expired` — nonce missing/expired (410)
- `webauthn_not_configured` — Casdoor WebAuthn disabled (503)
- `webauthn_no_credentials` — user has no passkey enrolled (404, signin)
- `webauthn_ceremony_failed` — Casdoor rejected the assertion/attestation (401)

### Step 2 — FE: WebAuthn login UI in LoginForm.svelte

**Impacted file:** `primebrick-fe-v3/src/lib/components/auth/LoginForm.svelte`
(reused by login page, `SessionExpiredDialog`, MCP consent page — all 3 benefit
automatically).

**New file:** `primebrick-fe-v3/src/lib/components/auth/PasskeyButton.svelte` —
encapsulates the `navigator.credentials.get()` ceremony + BE calls, so
`LoginForm` stays clean.

**UX:** Add a divider ("or") + a "Sign in with passkey" button below the
password submit button. Clicking it:
1. `POST /api/v1/auth/webauthn/signin/begin` (no username → discoverable login).
2. `navigator.credentials.get({ publicKey: options })` — browser shows the
   OS passkey prompt (FaceID/TouchKey/security key).
3. Serialize the result, `POST /api/v1/auth/webauthn/signin/finish`.
4. On success → call the existing `onsuccess` callback (same contract as
   password login). On error → `onerror` + message via `pushNotification`.

**PasskeyButton.svelte sketch:**

```svelte
<script lang="ts">
  import { apiFetch } from "$lib/api";
  import { pushNotification } from "$lib/errors/app-errors";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import { t } from "$lib/i18n";
  import Fingerprint from "@lucide/svelte/icons/fingerprint";

  let { onsuccess, onerror }: {
    onsuccess?: (data: { success: boolean; user: any }) => void;
    onerror?: () => void;
  } = $props();

  let loading = $state(false);

  async function signInWithPasskey() {
    loading = true;
    try {
      const beginResp = await apiFetch("/api/v1/auth/webauthn/signin/begin", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!beginResp.ok) throw new Error("begin failed");
      const { nonce, options } = await beginResp.json();

      // Base64url decode helpers for ArrayBuffer fields
      const publicKey = decodeCredentialRequestOptions(options);
      const credential = await navigator.credentials.get({ publicKey });

      const finishResp = await apiFetch("/api/v1/auth/webauthn/signin/finish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce, credential: encodeCredential(credential) }),
      });
      if (!finishResp.ok) {
        const err = await finishResp.json();
        pushNotification({ ...err, toast: false });
        onerror?.();
        return;
      }
      const data = await finishResp.json();
      if (data.success && data.user) userProfileStore.set(data.user);
      onsuccess?.(data);
    } catch (e) {
      pushNotification({ impact: "HIGH", message: $t("login.passkey.error"), scope: "auth" });
      onerror?.();
    } finally {
      loading = false;
    }
  }
</script>

<Button variant="outline" class="w-full" onclick={signInWithPasskey} disabled={loading}>
  {#if loading}<Spinner class="mr-2" />{/if}
  <Fingerprint class="size-4 mr-2" />
  {$t("login.passkey.button")}
</Button>
```

**LoginForm.svelte changes:** import `PasskeyButton`, render it after the
existing submit button with a divider. Pass the same `onsuccess`/`onerror`
props. No change to the password form logic.

**Feature detection:** gate the passkey button on
`typeof navigator !== "undefined" && "credentials" in navigator && "PublicKeyCredential" in window`.
Hide it entirely on unsupported browsers (no degraded fallback — password
remains the default).

**ArrayBuffer (de)serialization:** WebAuthn options/responses contain
`ArrayBuffer` fields encoded as base64url strings in JSON. Add a small util
`primebrick-fe-v3/src/lib/webauthn/codec.ts` with
`decodeCredentialRequestOptions` / `encodeCredential` helpers. This is the
standard WebAuthn JSON codec pattern (no dependency needed; ~40 lines).

### Step 3 — FE: Passkey enrollment UI (user profile / settings)

**Impacted area:** the existing user profile / settings page (where
`PATCH /api/v1/auth/me` is used). Add a "Security" / "Passkeys" section.

**New file:** `primebrick-fe-v3/src/lib/components/auth/PasskeyEnrollment.svelte`
— "Add passkey" button that runs `navigator.credentials.create()` against the
BE's signup begin/finish endpoints. Lists enrolled passkeys with a "Remove"
button (requires a BE list + delete endpoint — see step 4).

**Flow:**
1. `POST /api/v1/auth/webauthn/signup/begin` (authenticated — BE uses the user's
   session/access token to satisfy Casdoor's `getCurrentUser`).
2. `navigator.credentials.create({ publicKey: options })`.
3. `POST /api/v1/auth/webauthn/signup/finish` with the result.
4. Refresh the enrolled-passkeys list.

### Step 4 — BE: Passkey management endpoints (list / delete)

**New endpoints:**

| Path | Method | Permission | Purpose |
|---|---|---|---|
| `/api/v1/auth/webauthn/credentials` | GET | `AUTHENTICATED_USER` | List the user's enrolled passkeys (label, created_at) |
| `/api/v1/auth/webauthn/credentials/{id}` | DELETE | `AUTHENTICATED_USER` | Remove a passkey |

These call Casdoor's user API (`/api/get-user`) to read
`webauthnCredentials`, and Casdoor's `/api/update-user` to remove one. Add to
`webauthn.service.ts`.

### Step 5 — i18n (MANDATORY per FE repo rules)

Add translation keys immediately when adding labels. Keys to add (all locales
in `primebrick-fe-v3/src/lib/i18n/`):

- `login.passkey.button` — "Sign in with passkey"
- `login.passkey.error` — "Passkey sign-in failed"
- `login.passkey.unsupported` — "Passkeys are not supported on this device"
- `auth.passkeys.title` — "Passkeys"
- `auth.passkeys.add` — "Add passkey"
- `auth.passkeys.remove` — "Remove"
- `auth.passkeys.empty` — "No passkeys enrolled"
- `auth.passkeys.enrollmentSuccess` — "Passkey added"
- `auth.passkeys.enrollmentError` — "Failed to add passkey"

### Step 6 — Auth config flag

Add `enable_webauthn` to `auth_configurations` (boolean, default false). The FE
login page fetches this (via the existing health/config probe) and only shows
the passkey button when enabled. The BE endpoints return
`webauthn_not_configured` (503) when disabled. This lets ops roll out passkeys
per environment without code changes.

## Acceptance criteria

1. **Signin (passwordless):** a user with an enrolled passkey can click "Sign
   in with passkey" on the login page, complete the OS prompt, and land on the
   dashboard — without typing a username or password. httpOnly cookies are set
   identically to password login.
2. **Session-expired modal:** the same passkey button appears in the
   `SessionExpiredDialog`; a successful passkey auth drains and retries pending
   requests (existing `onsuccess` contract, unchanged).
3. **MCP consent page:** passkey button available there too (automatic via
   `LoginForm` reuse).
4. **Enrollment:** an authenticated user can add a passkey from their profile
   settings and remove it later.
5. **Feature detection:** unsupported browsers do not show the passkey button.
6. **Config gate:** with `enable_webauthn=false`, the passkey button is hidden
   and the BE endpoints return 503.
7. **i18n:** all new strings exist in every locale; no hardcoded user-facing
   text.
8. **No IDP screens:** at no point is the user redirected to a Casdoor-hosted
   page.
9. **Data conventions:** all new TS types, JSON fields, and BE response fields
   use `snake_case` (per repo rules). No DTO field renaming between layers.
10. **Error handling:** errors flow through `pushNotification` (no direct
    `toast.*` calls) and use RFC7807 `internal_code` values listed above.

## Out of scope (future)

- SMS / email OTP passwordless (can be added later as additional buttons in
  `LoginForm`).
- "Continue with Casdoor" redirect button for advanced methods (social login,
  etc.) — not needed since FE owns all UI.
- Cross-origin passkey autofill (`webauthn` conditional mediation) — nice-to-have,
  not in v1.
- Redis-backed session relay for multi-instance BE — flagged in risks; in-memory
  for v1.

## Repos impacted

- `primebrick-be-v3` — new service, router, DTOs, config flag, Casdoor proxy.
- `primebrick-fe-v3` — `LoginForm.svelte`, new `PasskeyButton.svelte`,
  `PasskeyEnrollment.svelte`, webauthn codec util, i18n keys, profile page
  section.
- `primebrick-v3-sdk` — possibly add `enable_webauthn` to `AuthConfig` type
  (if the config shape is owned by the SDK).
