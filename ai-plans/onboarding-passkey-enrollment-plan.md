# Plan: User Onboarding + Passkey Enrollment Promotion

## Status: DRAFT — Awaiting Approval
## Date: 2025-01-28
## Author: Devin

---

## 1. Objective

Replace the current "admin creates user with password" flow with an **invitation-based
onboarding** system, and add a **passkey enrollment prompt** for existing users who
don't yet have a passkey.

### Two independent but related features:

**Feature A — Invitation + Welcome/Onboarding page:**
- Admin creates a user — password is ALWAYS optional (admin can set it or leave it
  for the user). An invitation email is sent with a link to `/welcome?token=xxx`
- The welcome page lets the user:
  1. Set or change their own password (always available, even if admin already set one)
  2. Optionally enroll a passkey (WebAuthn signup flow)
- After completing, the user is redirected to the login page
- NOTE: The BE self-service change password endpoint (`POST /api/v1/auth/me/change-password`)
  IS built in this plan. The FE security page implementation is a SEPARATE plan.

**Feature C — Auto-enable WebAuthn on Casdoor application at org creation:**
- When a new organization is created, the BE must set `enable_web_authn` on the
  Casdoor application associated with that org, matching the `auth_config.enable_webauthn`
  flag. Currently this is NOT done — the Casdoor application's `enable_web_authn`
  column stays `false` for all apps.

**Feature B — Passkey enrollment prompt at login:**
- After successful login, if `enable_webauthn=true` AND the user has no passkey
  enrolled AND `passkey_prompt_dismissed=false`, show a modal dialog:
  - Explains what passkeys are
  - CTA button to start passkey enrollment (WebAuthn signup flow)
  - "Don't show me again" checkbox (persisted in PG `user_profiles` table)
- If the user dismisses (checkbox), the flag is persisted and the modal never
  shows again for that user
- Passkey presence is tracked in PG (not just Casdoor) via a 1-N table

---

## 2. Empirical Findings (Current State)

### 2.1 User Creation (BE)
- **Endpoint:** `POST /api/v1/auth/users` (users.router.ts)
- **Service:** `UserService.createUser()` (user.service.ts:42-127)
- **Password is REQUIRED** — admin must provide it (dto.ts:55)
- **No invitation system** — no email, no token, no welcome flow
- **No email sending** in BE — delegated to separate "emailsender" microservice
  (proxied via `/ws/:serviceCode/*`)
- **Casdoor API client** has `addUser()` and `changePassword()` but no invitation methods

### 2.2 Casdoor Capabilities (verified empirically)
- **`invitation` table** exists with columns: `owner`, `name`, `code`, `email`,
  `username`, `application`, `quota`, `used_count`, `state`
- **`user` table** has: `webauthnCredentials` (bytea), `need_update_password` (bool),
  `email_verified` (bool), `invitation` (varchar), `invitation_code` (varchar)
- **Casdoor invitation API endpoints:**
  - `POST /api/add-invitation` — create invitation
  - `GET /api/verify-invitation` — verify invitation code
  - `POST /api/send-invitation` — send invitation email via configured provider
  - `GET /api/get-invitation` — fetch invitation by ID
- **Casdoor `GetInvitationLink()`** generates: `{frontend}/signup/{app}?invitationCode={code}`
- **Casdoor `set-password` API** exists: `POST /api/set-password?id=org/name&newPassword=xxx`

### 2.3 Primebrick DB (verified empirically)
- **`user_profiles` table** has NO passkey-related columns
- **No passkey/credential tables** exist
- **No invitation tables** exist
- **`auth_configurations`** has `enable_webauthn=true` and `enable_formauth=true`
- Audit tables use partitioning by month (e.g. `user_profiles_audit_p20260101`)

### 2.4 FE Patterns (verified empirically)
- **SessionExpiredDialog** is the global dialog pattern: mounted in root `+layout.svelte`,
  controlled by a `$state` store, uses bits-ui Dialog, embeds LoginForm
- **PasskeyEnrollment** is an inline Card component on the profile page
- **No onboarding/welcome page** exists
- **No "first login" or "invite" patterns** exist
- **User creation form** requires password, has no generate button, no email send

### 2.5 Email Infrastructure
- **Brevo MCP** is available with `smtp_send_transac_email` tool (transactional email)
- **emailsender microservice** exists as a separate service (proxied via BE)
- **No SMTP config** in BE directly

### 2.6 Self-Service Change Password (verified empirically — DOES NOT EXIST)
- **No endpoint** exists for a logged-in user to change their OWN password
- **Security page** (`src/routes/(app)/system/settings/security/+page.svelte`):
  has UI fields for password change (lines 92-123) but `handleSubmit()` is a
  TODO stub (`console.log('Submitting security settings')`)
- **Profile page** — only allows `display_name`, `email`, `avatar_*` updates
  via `PATCH /api/v1/auth/me` — NO password change
- **Admin-only change password** exists: `POST /api/v1/entities/user_profiles/:uuid/change-password`
  (permission `USERS_UPDATE_SINGLE`) — no current password verification
- **Casdoor API client** has `changePassword()` calling `POST /api/set-password`
  — but it's only used by the admin flow

### 2.7 Organization Creation + Casdoor WebAuthn Flag (verified empirically)
- **Org creation endpoint:** `POST /api/v1/entities/organization`
- **Service:** `OrganizationsService.createOrganization()` (organizations.service.ts:87-162)
- **Casdoor sync:** calls `cdClient.addOrganization()` with fields:
  `{ name, owner, displayName, websiteUrl, passwordType: "plain" }`
- **WebAuthn is NOT enabled** during org creation — the Casdoor `Organization`
  struct has NO `enableWebAuthn` field (it's at the Application level, not Org)
- **Casdoor `application` table** has `enable_web_authn` column (boolean) —
  currently `false` on ALL apps (verified via SQL query)
- **Casdoor Application struct** has `EnableWebAuthn` boolean field — this is
  where WebAuthn is enabled per-application
- **BE has NO application management methods** in `casdoor-api-client.ts` —
  no `getApplication()`, `addApplication()`, or `updateApplication()`
- **setup-casdoor.ts** creates the `primebrick-api` application via raw SQL
  but does NOT set `enable_web_authn`
- **Casdoor Application API endpoints** available:
  - `GET /api/get-application?id=...`
  - `POST /api/add-application`
  - `POST /api/update-application`
  - `POST /api/delete-application`
  - `GET /api/get-organization-applications`
- **Application naming convention:** apps are named `{app_name}-org-{org_name}`
  (e.g. `primebrick-api-org-ACME`) — visible in the Casdoor `application` table

---

## 3. Architecture Decision: Primebrick-Managed Invitations vs Casdoor-Managed

### Decision: Primebrick-managed invitations (NOT Casdoor's built-in)

**Rationale:**
- Casdoor's invitation system is tightly coupled to its signup page (`/signup/{app}?invitationCode=xxx`)
- We don't have a Casdoor signup page — user creation is admin-driven via Primebrick BE
- We need full control over the welcome/onboarding page UI (password set + passkey enrollment)
- Primebrick already manages user profiles in its own DB — adding invitation tokens here
  keeps a single source of truth for the onboarding state
- Casdoor's `need_update_password` flag can still be used to enforce first-time password set

**What we DO use from Casdoor:**
- `POST /api/set-password` — to set the user's password (already wrapped in `casdoor-api-client.ts`)
- `POST /api/add-user` — to create the user (already wrapped)
- WebAuthn signup begin/finish endpoints (already proxied in `webauthn.service.ts`)
- `POST /api/update-application` — to set `enableWebAuthn` on the org's application
  (NEW — needs to be added to `casdoor-api-client.ts`)
- `GET /api/get-application` — to fetch the application for a given org
  (NEW — needs to be added to `casdoor-api-client.ts`)

---

## 4. DB Schema Changes

### 4.1 New table: `user_invitations`

```sql
CREATE TABLE IF NOT EXISTS "public"."user_invitations" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "uuid" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_profile_id" bigint NOT NULL REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,          -- SHA-256 hash of the invitation token (never store raw)
  "status" text NOT NULL DEFAULT 'PENDING',   -- PENDING | OTP_SENT | COMPLETED | EXPIRED | REVOKED
  "email" varchar(320) NOT NULL,              -- where the invitation was sent (BE only, never returned to FE)
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" text NOT NULL DEFAULT 'system',
  "expires_at" timestamptz NOT NULL,          -- default: now() + invitation_expiry_days
  "completed_at" timestamptz,                 -- when the user completed onboarding
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" text NOT NULL DEFAULT 'system',
  "version" integer NOT NULL DEFAULT 1,
  -- OTP verification (email ownership proof)
  "otp_hash" text,                            -- SHA-256 hash of the 6-digit OTP code (null if not sent)
  "otp_expires_at" timestamptz,               -- OTP validity window (5 minutes from send)
  "otp_attempts" integer NOT NULL DEFAULT 0,  -- failed OTP verify attempts (max 10)
  "otp_verified_at" timestamptz               -- when the user verified the OTP (gate for password set)
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_invitations_token_hash_uq"
  ON "public"."user_invitations" ("token_hash");
CREATE INDEX IF NOT EXISTS "user_invitations_user_profile_id_idx"
  ON "public"."user_invitations" ("user_profile_id");
CREATE INDEX IF NOT EXISTS "user_invitations_status_idx"
  ON "public"."user_invitations" ("status");
```

### 4.2 New table: `user_passkeys` (1-N with user_profiles)

```sql
CREATE TABLE IF NOT EXISTS "public"."user_passkeys" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "uuid" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_profile_id" bigint NOT NULL REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE,
  "credential_id" text NOT NULL,              -- base64url credential ID from WebAuthn
  "aaguid" text,                              -- authenticator model identifier
  "transports" jsonb,                         -- ["internal", "hybrid", "usb", "nfc", "ble"]
  "label" varchar(100),                       -- user-given name (e.g. "Windows Hello", "iPhone")
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" text NOT NULL DEFAULT 'system',
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" text NOT NULL DEFAULT 'system',
  "version" integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_passkeys_credential_id_uq"
  ON "public"."user_passkeys" ("credential_id");
CREATE INDEX IF NOT EXISTS "user_passkeys_user_profile_id_idx"
  ON "public"."user_passkeys" ("user_profile_id");
```

### 4.3 New columns on `user_profiles`

```sql
ALTER TABLE "public"."user_profiles"
  ADD COLUMN IF NOT EXISTS "passkey_prompt_dismissed" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean NOT NULL DEFAULT false;
```

### 4.4 New `auth_configurations` seed rows

```sql
-- Invitation token expiry (days)
INSERT INTO auth_configurations (config_key, config_value, description, updated_by)
VALUES ('invitation_expiry_days', '7', 'Invitation token expiry in days', 'system')
ON CONFLICT (config_key) DO NOTHING;

-- Admin contact email for notification mailto: links and admin alerts
INSERT INTO auth_configurations (config_key, config_value, description, updated_by)
VALUES ('admin_contact_email', '', 'Admin email for unauthorized action alerts and mailto: links', 'system')
ON CONFLICT (config_key) DO NOTHING;

-- HMAC secret for stateless notification alert tokens (auto-generated if empty)
INSERT INTO auth_configurations (config_key, config_value, description, updated_by)
VALUES ('notification_alert_secret', '', 'HMAC secret for unauthorized-action alert links in emails', 'system')
ON CONFLICT (config_key) DO NOTHING;
```

- `invitation_expiry_days` — read by `invitation.service.ts` when creating invitations
- `admin_contact_email` — used in email templates as the `mailto:` recipient and as
  the destination for admin alert emails. If empty, the BE falls back to the first
  user with `is_admin=true` in PG.
- `notification_alert_secret` — HMAC secret for signing the "if this wasn't you"
  links in notification emails. Auto-generated (32 random bytes hex) on first
  use if the value is empty.

### 4.5 Patch management
- Add all above to `db-meta/patches/00000000000000_init_database.sql` (in-place update)
- Create fire-and-forget script `update_init_patch_sha256.sql` with new hash
- Create fire-and-forget script `add_invitation_passkey_tables.sql` for existing DBs

---

## 5. BE Changes

### 5.1 Invitation system

#### New files:
- `src/modules/auth/user-invitations-dal.ts` — DAL for `user_invitations` table
- `src/modules/auth/services/invitation.service.ts` — business logic:
  - `createInvitation(userProfileUuid)` — generates token, stores hash, sends `invitation_welcome` email
  - `verifyInvitationToken(token)` — looks up by hash, checks status + expiry.
    Returns `{ display_name, expires_at }` — NEVER returns the email
  - `sendOtp(token)` — generates 6-digit OTP, stores `SHA-256(otp)` + 5-min expiry
    on the invitation row, sends `otp_verification` email to the invitation's email
  - `verifyOtp(token, otpCode)` — checks OTP hash + expiry + attempts (max 10),
    sets `otp_verified_at` on success
  - `completeInvitation(token, otpCode, newPassword)` — verifies token + OTP,
    sets password in Casdoor, marks invitation COMPLETED, sets `onboarding_completed=true`,
    sends `password_changed` notification email
  - `revokeInvitation(uuid)` — marks as REVOKED
  - `resendInvitation(uuid)` — generates new token, sends email

#### Token design:
- Token = `crypto.randomUUID() + '.' + crypto.randomBytes(32).toString('hex')`
- Store only `SHA-256(token)` in DB (never the raw token)
- Token is sent in the email link using URL **fragment** (not query string):
  `{FRONTEND_URL}/welcome#token={token}`
  - Fragment is NOT sent to the server in HTTP requests
  - Fragment is NOT included in Referer headers
  - FE reads it client-side via `window.location.hash` and POSTs it to the BE
- Token is single-use: status changes PENDING → OTP_SENT → COMPLETED
- Default expiry: `invitation_expiry_days` from `auth_configurations` (default 7)

#### OTP design:
- 6-digit numeric code, generated via `crypto.randomInt(100000, 999999)`
- Stored as `SHA-256(otp)` in `user_invitations.otp_hash` (never plaintext)
- Valid for 5 minutes (`otp_expires_at`)
- Max 10 verification attempts (`otp_attempts`), after which a new OTP must be requested
- OTP is required before the password set form is shown — proves email ownership
- The OTP email does NOT contain the welcome link (separate from the invitation email)

#### Email sending (via emailsender microservice):
- BE calls the emailsender microservice internally using the service registry's `base_url`
- All templates are registered in the emailsender microservice's `templates` table
- Template variables are passed as a JSON object in the API call

#### Email templates (registered in emailsender `templates` table):

| Template name | Trigger | Variables |
|---------------|---------|-----------|
| `invitation_welcome` | Admin creates/resent invitation | `display_name`, `welcome_link` |
| `otp_verification` | User clicks "send code" on welcome page | `display_name`, `otp_code` |
| `password_changed` | Password set on welcome page OR self-service change OR admin change | `display_name`, `alert_link`, `admin_mailto` |
| `passkey_activated` | User enrolls a passkey (signup/finish) | `display_name`, `device_name`, `alert_link`, `admin_mailto` |
| `passkey_removed` | User deletes a passkey | `display_name`, `device_name`, `alert_link`, `admin_mailto` |

- `alert_link` — a signed link `/login?alert=unauthorized-{type}&token={hmac_token}`
  that the user clicks if the action wasn't them. The HMAC token is stateless:
  `base64(user_uuid + "." + hmac_sha256(notification_alert_secret, user_uuid + alert_type + timestamp))`
- `admin_mailto` — a `mailto:` link with pre-filled subject and body:
  `mailto:{admin_email}?subject=...&body=...`
  - `admin_email` from `auth_configurations.admin_contact_email`, or fallback to
    first user with `is_admin=true` in PG
  - Subject: "Unauthorized activity on my Primebrick account"
  - Body: "Hello, I received a notification about a change to my account
    ({display_name}, {email}) that I did not make. Please help me secure my account."

#### New endpoints (in a new `auth-invitation.router.ts`):

**Admin endpoints (authenticated + `USERS_CREATE_SINGLE`):**
- `POST /api/v1/auth/invitations` — admin creates invitation for a user
  - Body: `{ user_uuid: string }`
  - Returns: `{ success: true, invitation_uuid: string }`
- `GET /api/v1/auth/invitations/:uuid` — admin checks invitation status
- `POST /api/v1/auth/invitations/:uuid/resend` — admin resends invitation
- `POST /api/v1/auth/invitations/:uuid/revoke` — admin revokes invitation

**Public endpoints (token-bound, no session):**
- `POST /api/v1/auth/welcome/verify` — verifies token, returns display_name only
  - Body: `{ token: string }`
  - Returns: `{ valid: boolean, display_name: string, expires_at: string }`
  - NEVER returns the email address
- `POST /api/v1/auth/welcome/send-otp` — sends OTP to the invitation's email
  - Body: `{ token: string }`
  - Returns: `{ sent: boolean }` (always true if token valid, even if email fails — don't leak)
  - Sets invitation status to `OTP_SENT`
- `POST /api/v1/auth/welcome/verify-otp` — verifies the 6-digit OTP
  - Body: `{ token: string, otp_code: string }`
  - Returns: `{ verified: boolean }`
  - On success: sets `otp_verified_at` on the invitation row
- `POST /api/v1/auth/welcome/complete` — sets password + completes onboarding
  - Body: `{ token: string, otp_code: string, password: string }`
  - Verifies token is valid + not expired + OTP is verified + OTP code matches
  - Calls Casdoor `set-password`, marks invitation COMPLETED, sets `onboarding_completed=true`
  - Sends `password_changed` notification email with `alert_link` + `admin_mailto`

**Public alert endpoint (no session):**
- `POST /api/v1/auth/login-alert` — user clicks "if this wasn't you" link
  - Body: `{ alert_type: string, token: string }`
  - BE verifies the HMAC token (stateless — no DB lookup needed)
  - Extracts `user_uuid` from the token, looks up the user profile
  - Sends an email to admin(s) with: user display_name, user email, alert type,
    timestamp, and a note that the user confirmed the action was unauthorized
  - Returns 200 always (don't leak whether the token was valid)

### 5.2 Modified user creation flow

- `makeCreateUserSchema()` — make `password` OPTIONAL (admin can set it or leave
  it for the user to set on the welcome page)
- `UserService.createUser()`:
  - If password IS provided by admin: use it as before (admin-set password)
  - If password is NOT provided: generate a random temp password (32 chars, meets
    all policies) for the Casdoor user, set `need_update_password=true`
  - In BOTH cases: after user creation, automatically create an invitation and
    send the email (the user can always set/change their password on the welcome
    page regardless of whether the admin set one)
  - Return `{ profile, invitation_uuid }` so the FE can show "invitation sent"
- The welcome page ALWAYS shows the password set/change form — even if the admin
  already set a password, the user can override it on first login

### 5.3 Passkey tracking in PG

#### New files:
- `src/modules/auth/user-passkeys-dal.ts` — DAL for `user_passkeys` table

#### Modified `webauthn.service.ts`:
- After successful `signupFinish`, insert a row into `user_passkeys` with:
  - `credential_id` (from the attestation response)
  - `aaguid` (if available)
  - `transports` (from the credential)
  - `label` (from the FE-provided device name, or derived from AAGUID/transports)
- After inserting the passkey row, send a `passkey_activated` notification email:
  - Variables: `display_name`, `device_name`, `alert_link`, `admin_mailto`
  - `device_name` = the `label` field, or AAGUID-derived name, or transport-based fallback
- After successful passkey deletion, remove the row from `user_passkeys` AND send
  a `passkey_removed` notification email with the same variables
- New method: `getUserPasskeyCount(userProfileId)` — returns count of enrolled passkeys

#### Modified `auth-webauthn.router.ts`:
- `GET /api/v1/auth/webauthn/credentials` — also return passkey count from PG
  (in addition to the existing Casdoor-provided list)

### 5.4 Passkey prompt flag + self-service change password (BE only)

#### Modified `auth-session.router.ts`:
- `GET /api/v1/auth/me` — include `passkey_prompt_dismissed` and `has_passkey`
  in the profile response
- `PATCH /api/v1/auth/me` — allow updating `passkey_prompt_dismissed`
- New endpoint: `POST /api/v1/auth/me/passkey-prompt/dismiss`
  - Sets `passkey_prompt_dismissed=true` on the current user's profile
  - Permission: `AUTHENTICATED_USER`
- New endpoint: `POST /api/v1/auth/me/change-password`
  - Body: `{ current_password: string, new_password: string }`
  - Permission: `AUTHENTICATED_USER`
  - Verifies `current_password` against Casdoor before allowing the change
    (unlike the admin flow which doesn't require current password)
  - Calls `casdoorApi.changePassword()` with the new password
  - Applies the same password policy validation as the admin flow
  - After success: sends `password_changed` notification email (same template as
    welcome page — variables: `display_name`, `alert_link`, `admin_mailto`)
  - The FE security page implementation is a SEPARATE plan — the endpoint is
    built now so the FE work is just wiring when that plan is done

#### Modified `UserService`:
- New method: `changeOwnPassword(userProfile, currentPassword, newPassword)`:
  1. Verify `currentPassword` against Casdoor via `POST /api/check-user-password`
     (Casdoor endpoint: `POST /api/check-user-password?id=org/name&password=xxx`)
  2. If verification fails: throw RFC7807 error with `internal_code: "WRONG_PASSWORD"`
  3. If verification succeeds: call `casdoorApi.changePassword()` with `newPassword`
  4. Send `password_changed` notification email via emailsender microservice
  5. Return success/failure
- Modified method: `changePassword(uuid, newPassword)` (admin flow):
  - After setting the password, also send `password_changed` notification email
    to the affected user (currently has a TODO comment for this)

#### New Casdoor API client method:
- `checkUserPassword(user, password)` — calls `POST /api/check-user-password`
  - Returns `{ status: "ok" | "error", msg?: string }`

### 5.5 Auto-enable WebAuthn on Casdoor application at org creation

#### Modified `casdoor-api-client.ts` — new methods:
- `getApplication(appId)` — `GET /api/get-application?id=...`
  - Returns the Casdoor Application object (or null if not found)
- `updateApplication(app)` — `POST /api/update-application`
  - Sends the full application object with updated fields
  - Returns boolean success

#### Modified `organizations.service.ts` — `createOrganization()`:
- After creating the org in Casdoor, fetch the application associated with
  the org via `cdClient.getApplication({orgName}-org-{appName})` or
  `cdClient.getApplication("primebrick-api-org-{orgName}")`
- If the application exists:
  - Read `auth_config.enable_webauthn` from `getAuthConfig()`
  - Update the application's `enableWebAuthn` field to match
  - Call `cdClient.updateApplication(app)` to persist
- If the application does NOT exist:
  - Create a new application for the org with `enableWebAuthn` set from config
  - This requires a new `addApplication()` method in the Casdoor API client
  - Application fields: `name`, `owner`, `displayName`, `organization`,
    `enablePassword`, `enableSignUp`, `clientId`, `clientSecret`, `redirectUris`,
    `grantTypes`, `tokenFormat`, `expireInHours`, `refreshExpireInHours`,
    `enableWebAuthn` (from auth config)

#### Modified `organizations.service.ts` — `updateOrganization()`:
- If `auth_config.enable_webauthn` changes, propagate to all org applications
  (or at least to the org being updated)

#### Modified `setup-casdoor.ts`:
- When creating/updating the `primebrick-api` application, set `enable_web_authn`
  based on the `enable_webauthn` auth config value (currently hardcoded to `true`)

### 5.6 SDK changes
- No new types needed — the invitation endpoints are BE-internal

---

## 6. FE Changes

### 6.1 Welcome/Onboarding page

#### New files:
- `src/routes/welcome/+page.svelte` — the welcome/onboarding page
- `src/lib/components/auth/WelcomeForm.svelte` — password set form + passkey enrollment
- `src/lib/stores/welcome-store.svelte.ts` — manages welcome page state

#### Page flow:
1. User arrives at `/welcome#token=xxx` (token in URL fragment — never sent to server)
2. FE reads token from `window.location.hash`, POSTs to `/api/v1/auth/welcome/verify`
3. If invalid/expired: show error card with "contact your administrator" message
   (no email shown, no user data exposed)
4. If valid: show OTP step:
   - "Hi {display_name}, we've sent a verification code to your email"
   - "Send code" button → calls `POST /api/v1/auth/welcome/send-otp`
   - 6-digit OTP input field
   - "Verify code" button → calls `POST /api/v1/auth/welcome/verify-otp`
   - "Resend code" link (calls send-otp again)
5. On OTP verified: show password set form:
   - Display name (read-only, from the verify response — NO email shown)
   - New password field (with policy validation + checklist)
   - Confirm password field
   - "Set password and continue" button → calls `POST /api/v1/auth/welcome/complete`
     with `{ token, otp_code, password }`
6. On password set success:
   - Show "Your password has been set" state
   - Show optional passkey enrollment section:
     - Explanation text about passkeys
     - "Enroll passkey" button (triggers `navigator.credentials.create()`)
     - "Skip for now" link
7. On either path: redirect to `/login` after 3 seconds (or on click)

#### Login alert page:
- When user clicks the "if this wasn't you" link in a notification email:
  `/login?alert=unauthorized-password-change&token=xxx`
- The `/login` page detects the `alert` query param and shows a warning banner:
  "We've notified your administrator about unauthorized activity on your account."
- On page load, FE calls `POST /api/v1/auth/login-alert` with `{ alert_type, token }`
- BE sends the admin alert email (user doesn't need to do anything else)
- The login form works normally below the banner

#### UI design:
- Same visual style as the login page (split layout with hero image)
- Card-based form similar to LoginForm
- No AppShell, no sidebar — standalone page like `/login`
- `Referrer-Policy: no-referrer` set on the welcome page (via `<svelte:head>`)

### 6.2 Modified user creation form

#### Modified `src/routes/(app)/system/settings/users/create/+page.svelte`:
- Add a toggle: "Send invitation email" (default: ON)
- Password field is ALWAYS visible and OPTIONAL (regardless of toggle state)
- When invitation toggle is ON:
  - Show info text: "The user will receive an email to set or change their password"
  - If admin leaves password blank: BE generates a random temp password
  - If admin sets a password: it's used as the initial password, but the user
    can still change it on the welcome page
  - On submit: BE creates invitation automatically and sends email
  - After success: show toast "Invitation sent to {email}"
- When invitation toggle is OFF:
  - Password becomes REQUIRED (current behavior — admin must set it)
  - No invitation is created, no email is sent
  - Admin must communicate the password out-of-band

### 6.3 Passkey enrollment prompt dialog

#### New files:
- `src/lib/components/auth/PasskeyPromptDialog.svelte` — the modal dialog
- `src/lib/stores/passkey-prompt-store.svelte.ts` — controls dialog visibility

#### Dialog content:
- Icon: Fingerprint (lucide)
- Title: "Secure your account with a passkey"
- Description: "Passkeys let you sign in instantly using Windows Hello, Touch ID,
  or your phone. No password needed."
- CTA button: "Set up passkey" → triggers WebAuthn signup flow (same as
  PasskeyEnrollment's addPasskey)
- Checkbox: "Don't show me this again" (default: unchecked)
- Close button (X) → if checkbox was checked, calls `POST /api/v1/auth/me/passkey-prompt/dismiss`
- After successful enrollment: close dialog, show success toast

#### Mounting:
- Mount in root `+layout.svelte` alongside `SessionExpiredDialog`
- Triggered after successful login (in LoginForm `onsuccess` callback) if:
  - `enable_webauthn === true` (from authConfigStore)
  - `has_passkey === false` (from user profile)
  - `passkey_prompt_dismissed === false` (from user profile)

#### Trigger logic:
- The `(app)/+layout.svelte` `onMount` already fetches `/api/v1/auth/me`
- After fetching the profile, check the conditions above
- If all true, call `passkeyPromptStore.open()`
- The store holds the user profile data needed for the WebAuthn enrollment

### 6.4 Modified profile page

#### Modified `src/routes/(app)/system/settings/profile/+page.svelte`:
- PasskeyEnrollment section: show passkey count from PG (not just Casdoor)
- Add labels to passkeys (the `label` column in `user_passkeys`)

### 6.5 i18n keys
Add keys for all 6 locales:
- `welcome.title`, `welcome.description`, `welcome.setPassword`, `welcome.passwordSet`
- `welcome.enrollPasskey`, `welcome.skipPasskey`, `welcome.redirecting`
- `welcome.tokenInvalid`, `welcome.tokenExpired`, `welcome.contactAdmin`
- `welcome.otpSent`, `welcome.otpSend`, `welcome.otpResend`, `welcome.otpVerify`
- `welcome.otpInvalid`, `welcome.otpExpired`, `welcome.otpMaxAttempts`
- `welcome.enterOtp`, `welcome.otpDescription`
- `auth.invitation.send`, `auth.invitation.sent`, `auth.invitation.toggle`
- `auth.invitation.passwordOptional`, `auth.invitation.passwordHint`
- `auth.passkeyPrompt.title`, `auth.passkeyPrompt.description`
- `auth.passkeyPrompt.setup`, `auth.passkeyPrompt.dontShowAgain`
- `auth.loginAlert.banner`, `auth.loginAlert.adminNotified`
- `auth.loginAlert.unauthorizedPasswordChange`, `auth.loginAlert.unauthorizedPasskeyActivation`

---

## 7. Decisions (User-Confirmed)

### D1: Email sending path → emailsender microservice
- Use the existing emailsender microservice via `/ws/emailsender/v1/emails`
- BE calls the microservice internally (not via the public proxy) using the
  service registry's `base_url`
- Requires the emailsender microservice to be registered in `service_registry`
  and running

### D2: Invitation token expiry → 7 days (configurable)
- Default: 7 days
- Configurable via `auth_configurations` table (`invitation_expiry_days` key)
- New seed row in init patch: `('invitation_expiry_days', '7', '...', 'system')`

### D3: Passkey prompt scope → ALL users
- Any user without a passkey gets the prompt on login (existing + new)
- Unless `passkey_prompt_dismissed=true` on their profile

### D4: Password field → Always visible, optional when invitation is ON
- Password field is ALWAYS visible in the user creation form
- When "Send invitation" is ON: password is OPTIONAL (admin can pre-set it or
  leave it for the user to set on the welcome page)
- When "Send invitation" is OFF: password is REQUIRED (current behavior)
- The welcome page ALWAYS shows the password set/change form — the user can
  override the admin-set password on first login
- The BE self-service change password endpoint (`POST /api/v1/auth/me/change-password`)
  IS built in this plan — the FE security page implementation is a SEPARATE plan

### D5: Auto-enable WebAuthn on Casdoor application at org creation (NEW)
- When a new organization is created, the BE must set `enable_web_authn` on the
  Casdoor application associated with that org, matching `auth_config.enable_webauthn`
- Currently this is NOT done — all Casdoor applications have `enable_web_authn=false`
- New methods needed in `casdoor-api-client.ts`: `getApplication()`, `updateApplication()`,
  `addApplication()`
- `organizations.service.ts` `createOrganization()` must be modified to sync the
  application's `enableWebAuthn` flag after org creation
- `setup-casdoor.ts` must also set `enable_web_authn` when creating the
  `primebrick-api` application

---

## 8. Implementation Order

### Phase 1: DB schema (no breaking changes)
1. Add `user_invitations` table to init patch + fire-and-forget
2. Add `user_passkeys` table to init patch + fire-and-forget
3. Add `passkey_prompt_dismissed` + `onboarding_completed` columns to `user_profiles`
4. Apply fire-and-forget scripts to live DB, verify `db:migrate`

### Phase 2: BE — Invitation system + OTP + notifications
5. Create `user-invitations-dal.ts` (with OTP columns)
6. Create `invitation.service.ts` (token gen, verify, send-otp, verify-otp,
   complete, revoke, resend + email sending via emailsender)
7. Create `auth-invitation.router.ts` with all endpoints (admin + public + login-alert)
8. Wire into `router.ts` aggregator
9. Register email templates in emailsender microservice `templates` table:
   `invitation_welcome`, `otp_verification`, `password_changed`,
   `passkey_activated`, `passkey_removed`
10. Modify `UserService.createUser()` — optional password + auto-invitation
11. Modify `makeCreateUserSchema()` — password optional
12. Add `notification_alert_secret` auto-generation logic (if config value is empty)
13. Typecheck BE

### Phase 3: BE — Passkey tracking + prompt flag + self-service password (BE only)
14. Create `user-passkeys-dal.ts`
15. Modify `webauthn.service.ts` — insert/delete passkey rows in PG + send
    `passkey_activated` / `passkey_removed` notification emails
16. Modify `auth-webauthn.router.ts` — return PG passkey data
17. Modify `auth-session.router.ts` — add `has_passkey` + `passkey_prompt_dismissed`
    to `/auth/me`, add dismiss endpoint
18. Add `POST /api/v1/auth/me/change-password` endpoint (self-service, requires
    current password verification via Casdoor `check-user-password` + sends
    `password_changed` notification email)
19. Modify `UserService.changePassword()` (admin flow) — send `password_changed`
    notification email after password change (currently a TODO)
20. Add `checkUserPassword()` method to `casdoor-api-client.ts`
21. Add `changeOwnPassword()` method to `UserService`
22. Typecheck BE

### Phase 4: BE — Auto-enable WebAuthn on Casdoor application at org creation
23. Add `getApplication()`, `updateApplication()`, `addApplication()` methods
    to `casdoor-api-client.ts`
24. Modify `organizations.service.ts` `createOrganization()` — after org creation,
    fetch/create the org's Casdoor application and set `enableWebAuthn` from
    `auth_config.enable_webauthn`
25. Modify `setup-casdoor.ts` — set `enable_web_authn` on the `primebrick-api`
    application based on auth config
26. Typecheck BE

### Phase 5: FE — Welcome page (with OTP flow)
27. Create `welcome/+page.svelte` + `WelcomeForm.svelte` (token from URL fragment,
    OTP step, password set step, passkey enrollment step)
28. Create `welcome-store.svelte.ts`
29. Add login alert banner to `/login` page (detects `?alert=...&token=...` query)
30. Add i18n keys for welcome page + OTP + login alert
31. Typecheck FE

### Phase 6: FE — Modified user creation form
32. Add "Send invitation" toggle to user creation form
33. Make password field optional when toggle is ON, required when OFF
34. Handle invitation response (toast, redirect)
35. Typecheck FE

### Phase 7: FE — Passkey prompt dialog
36. Create `PasskeyPromptDialog.svelte`
37. Create `passkey-prompt-store.svelte.ts`
38. Mount in root `+layout.svelte`
39. Add trigger logic in `(app)/+layout.svelte` after `/auth/me` fetch
40. Add i18n keys for passkey prompt
41. Typecheck FE

### Phase 8: Integration testing
42. End-to-end test: create user with invitation → receive email → welcome page
    → OTP verification → set password → enroll passkey → login with passkey
43. End-to-end test: existing user login → passkey prompt → enroll → receive
    `passkey_activated` email → re-login → no prompt
44. End-to-end test: dismiss passkey prompt → re-login → no prompt
45. End-to-end test: admin creates user WITH password + invitation → user
    receives email → welcome page → changes password → receives
    `password_changed` email → login with new password
46. End-to-end test: click "if this wasn't you" link in notification email →
    login alert banner → admin receives alert email
47. End-to-end test: create new org → verify Casdoor application has
    `enable_web_authn=true` (when auth config has it enabled)

---

## 9. Affected Files Summary

### SDK (0 files — no changes needed)

### BE — New files (6):
- `src/modules/auth/user-invitations-dal.ts`
- `src/modules/auth/user-passkeys-dal.ts`
- `src/modules/auth/services/invitation.service.ts`
- `src/modules/auth/routers/auth-invitation.router.ts`
- `db-meta/fire-and-forget/update_init_patch_sha256.sql` (update existing)
- `db-meta/fire-and-forget/add_invitation_passkey_tables.sql` (new)

### BE — Modified files (10):
- `db-meta/patches/00000000000000_init_database.sql` — new tables + columns
- `src/modules/auth/dto.ts` — password optional, invitation DTOs, change-password DTO
- `src/modules/auth/services/user.service.ts` — optional password + auto-invitation + `changeOwnPassword()`
- `src/modules/auth/services/webauthn.service.ts` — PG passkey tracking
- `src/modules/auth/services/organizations.service.ts` — auto-enable WebAuthn on Casdoor app
- `src/modules/auth/casdoor-api-client.ts` — `getApplication()`, `updateApplication()`, `addApplication()`, `checkUserPassword()`
- `src/modules/auth/routers/auth-webauthn.router.ts` — return PG passkey data
- `src/modules/auth/routers/auth-session.router.ts` — has_passkey + dismiss + change-password endpoints
- `src/modules/auth/router.ts` — wire invitation router
- `scripts/setup-casdoor.ts` — set `enable_web_authn` on primebrick-api app

### FE — New files (5):
- `src/routes/welcome/+page.svelte`
- `src/lib/components/auth/WelcomeForm.svelte`
- `src/lib/components/auth/PasskeyPromptDialog.svelte`
- `src/lib/stores/welcome-store.svelte.ts`
- `src/lib/stores/passkey-prompt-store.svelte.ts`

### FE — Modified files (6):
- `src/routes/(app)/system/settings/users/create/+page.svelte` — invitation toggle, password optional
- `src/routes/(app)/system/settings/profile/+page.svelte` — passkey labels
- `src/routes/+layout.svelte` — mount PasskeyPromptDialog
- `src/routes/(app)/+layout.svelte` — trigger passkey prompt after /auth/me
- `src/routes/login/+page.svelte` — login alert banner (detects `?alert=...&token=...`)
- `src/lib/i18n/messages/*.json` (6 locale files) — new keys

---

## 10. Security Considerations

- Invitation tokens are NEVER stored in plaintext — only SHA-256 hash
- Tokens are single-use (PENDING → OTP_SENT → COMPLETED)
- Tokens expire after `invitation_expiry_days` (default 7, configurable in `auth_configurations`)
- Token is sent in URL **fragment** (`#token=xxx`) — never in query string, never
  in server access logs, never in Referer headers
- Welcome page sets `Referrer-Policy: no-referrer` to prevent token leakage
- The `/welcome/verify` response returns ONLY `display_name` + `expires_at` —
  NEVER the email address or any IDP internals
- OTP proves email ownership — required before the password set form is shown
- OTP is 6-digit, stored as SHA-256 hash, expires in 5 minutes, max 10 attempts
- The welcome page endpoints (`/welcome/*`) are PUBLIC but token + OTP bound
- Password set on the welcome page goes directly to Casdoor via `set-password` API
- The `passkey_prompt_dismissed` flag is per-user, not global
- Passkey credential IDs in PG are not secrets — they're public identifiers
  (the actual credential is in Casdoor's `webauthnCredentials` bytea column)
- The admin can still set a password during user creation — but the user can
  always override it on the welcome page (first login)
- Self-service change password BE endpoint requires `current_password`
  verification via Casdoor's `check-user-password` API — unlike the admin flow
  which doesn't. The FE security page implementation is a separate plan.
- Notification emails ("if this wasn't you") use stateless HMAC-signed links —
  no DB storage needed, tokens can't be replayed (the BE just sends an admin alert)
- The `mailto:` link in notification emails uses `admin_contact_email` from
  `auth_configurations` (or fallback to first admin user in PG)
- When WebAuthn is enabled in auth config, all new org applications in Casdoor
  will have `enableWebAuthn=true` — this is a security feature, not a vulnerability
- If WebAuthn is later disabled in auth config, existing org applications
  should be updated to set `enableWebAuthn=false` (org update flow)

---

## 11. Post-Implementation Reminder — Rate Limiter

**IMPORTANT:** After this plan is implemented, a rate limiter MUST be added to
the public welcome endpoints. This was intentionally deferred per user request,
but it is a critical security gap that must be addressed.

**Endpoints that need rate limiting:**
- `POST /api/v1/auth/welcome/verify` — per IP (e.g. 10 req/min)
- `POST /api/v1/auth/welcome/send-otp` — per IP (e.g. 3 req/min — stricter, costs an email)
- `POST /api/v1/auth/welcome/verify-otp` — per token (e.g. 10 attempts / 5 min)
- `POST /api/v1/auth/welcome/complete` — per IP (e.g. 5 req/min)
- `POST /api/v1/auth/login-alert` — per IP (e.g. 5 req/min)

**Suggested implementation:**
- In-memory `Map<key, { count, resetAt }>` for single-instance deployment
- Redis-based for multi-instance deployment (future)
- The rate limiter should be a middleware that can be applied per-route

**Remind the user about this after the plan implementation is complete.**
