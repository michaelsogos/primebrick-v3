# Plan: MFA Prompt Dialog Alignment + Trademark Compliance

**Date:** 2026-07-20
**Status:** Awaiting approval
**Scope:** ALL repos (FE, BE, US, SDK, DAL, DOCS, WEBSITE)
**Root plan reference:** `feature-mfa-2fa-plan.md` §2a (Surface B — enforcement dialog)

---

## Objectives

1. **Trademark/Copyright compliance** — Add ™/®/© symbols to all third-party
   product/service names in user-facing text across ALL repos (FE, BE, US,
   SDK, DAL, DOCS, WEBSITE) — i18n JSON, ApiError messages, SQL comments,
   MDX docs, website components.
2. **Unified AuthMethodsPromptDialog** — Per root plan
   (`feature-mfa-2fa-plan.md` lines 250-269, 982, 1178), replace the two
   separate dialogs (`PasskeyPromptDialog` + `MfaPromptDialog`) with ONE
   unified `AuthMethodsPromptDialog` shell containing two inner components
   (`PasskeyEnrollmentSection` + `MfaEnrollmentSection`).
3. **Unified dismiss mechanism** — Rename endpoint
   `POST /api/v1/auth/me/dismiss-passkey-prompt` →
   `POST /api/v1/auth/me/dismiss-auth-method-enforcer` and DB column
   `passkey_prompt_dismissed` → `auth_method_enforcer_dismissed`. The
   dismiss is for the DIALOG, not per-method.
4. **MFA never mandatory in dialog** — Per root plan line 265, MFA is
   always skippable in the dialog. Real enforcement is per-route step-up
   (Surface C). The ONLY case where the dialog is not dismissable is
   `passkey_required=true` (passkey only, no MFA shown).
5. **Remove discouraging copy** — Eliminate "You can dismiss this prompt" /
   "Remind me later" language. Align tone across all locales.
6. **i18n completeness** — New `auth.authMethodEnforcer.*` namespace in all
   6 locales. Remove old `auth.passkeyPrompt.*` and `auth.mfaPrompt.*`.
7. **Copy semplificato per utenza generica** — Rimuovere termini tecnici
   security (credential stuffing, TOTP, biometria, second factor, fattore)
   dai copy delle dialog. L'utenza è generica, non esperta del settore.
   Eccezioni confermate: `OTP` (tenuto), `compromessa` (tenuto, IT standard).

---

## Part 1 — Trademark Compliance (ALL REPOS — EMPIRICAL SCAN)

### 1.1 Trademark symbol mapping

| Name | Symbol | Notes |
|------|--------|-------|
| Casdoor | ™ | |
| Brevo | ™ | |
| Google Authenticator | ™ | Google LLC |
| Microsoft Authenticator | ™ | Microsoft |
| Microsoft Entra | ™ | Microsoft |
| Authy | ™ | Twilio |
| 1Password | ™ | AgileBits |
| Bitwarden | ™ | |
| Keycloak | ™ | Red Hat |
| Auth0 | ™ | Okta |
| Okta | ™ | |
| QR Code | ® | Denso Wave (registered) |
| PostgreSQL | ® | registered |
| Redis | ® | registered |
| NATS | ™ | Synadia |
| Docker | ® | Docker Inc. (registered) |
| Kubernetes | ® | CNCF (registered) |
| Cloudflare | ® | Cloudflare Inc. (registered) |
| GitHub | ™ | GitHub Inc. |
| GitLab | ™ | |
| Vercel | ™ | |
| Netlify | ™ | |
| Svelte | ™ | |
| SvelteKit | ™ | |
| shadcn-svelte | ™ | |
| BITS UI | ™ | |
| TypeScript | ® | Microsoft (registered) |
| JavaScript | ® | Oracle (registered) |
| Node.js | ® | OpenJS Foundation (registered) |
| Tailwind CSS | ™ | |
| Vite | ™ | |
| Vitest | ™ | |
| Playwright | ™ | Microsoft |
| Zod | ™ | |
| Astro | ™ | |
| Casbin | ™ | |
| Lucide | ™ | |
| Linux | ® | Linus Torvalds (registered) |
| Ubuntu | ® | Canonical (registered) |
| Debian | ® | SPI (registered) |
| Windows | ® | Microsoft (registered) |
| Windows Hello | ™ | Microsoft |
| Face ID | ™ | Apple |
| Touch ID | ™ | Apple |
| Apple | ® | Apple Inc. (registered) |
| macOS | ™ | Apple |
| iOS | ™ | Apple |
| Android | ™ | Google |
| Google | ® | Google LLC (registered) |
| Microsoft | ® | Microsoft (registered) |
| Amazon | ® | Amazon (registered) |
| AWS | ™ | Amazon |
| Azure | ™ | Microsoft |
| Active Directory | ® | Microsoft (registered) |
| Twilio | ™ | |
| SendGrid | ™ | Twilio |
| Mailgun | ™ | |
| Stripe | ™ | |
| PayPal | ™ | |
| OpenAI | ™ | |
| Anthropic | ™ | |
| Elasticsearch | ® | Elastic (registered) |
| MongoDB | ™ | |
| MySQL | ™ | Oracle |
| MariaDB | ™ | |
| MinIO | ™ | |
| Grafana | ™ | |
| Prometheus | ™ | CNCF |

**Unicode escapes in JSON:** `\u2122` (™), `\u00ae` (®), `\u00a9` (©).

### 1.2 FE i18n files (primebrick-fe-v3/src/lib/i18n/messages/)

**All 6 locales:** `en-GB.json`, `it-IT.json`, `de-DE.json`, `es-ES.json`, `fr-FR.json`, `pt-PT.json`

**Edits per file** (line numbers from en-GB.json, equivalent lines in other locales):

| Key (en-GB line) | Fix |
|------------------|-----|
| `auth.passkey.description` (L106) | Add ™ to `Face ID`, `Touch ID` (missing — L35/L168 already have them) |
| `auth.mfa.enrollStepQr` (L134) | `QR code` → `QR Code\u00ae`; `Google Authenticator` → `\u2122`; `Authy` → `\u2122`; `1Password` → `\u2122` |
| `auth.mfa.labelPlaceholder` (L141) | `Google Authenticator` → `\u2122` |
| `auth.mfaPrompt.benefitConvenience` (L151) | `Google Authenticator`, `Authy`, `1Password`, `Microsoft Authenticator` → all `\u2122` |
| `roles.fieldIdpOrgHint` (L369) | `Casdoor` → `Casdoor\u2122` |
| `modules.githubRepoUrl` (L590) | `GitHub` → `GitHub\u2122` |
| `modules.iconPlaceholder` (L583) | `Lucide` → `Lucide\u2122` |
| `modules.iconTypeIcon` (L585) | `Lucide` → `Lucide\u2122` |

**Same fixes in all 6 locales** (translated text + symbols at equivalent lines).

### 1.3 FE Svelte files

| File | Line | Fix |
|------|------|-----|
| `MfaManagement.svelte` | 287 | `alt="TOTP QR Code"` → `alt="TOTP QR Code®"` |
| `MfaPromptDialog.svelte` | 218 | `alt="TOTP QR Code"` → `alt="TOTP QR Code®"` |
| `VersionsPanel.svelte` | 117 | `\|\| 'Casdoor'` → `\|\| 'Casdoor™'` |

### 1.4 BE — SQL seed/patch file (USER-FACING via DB comments + admin UI)

**File:** `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql`

⚠️ **Patch SHA256 rule:** This is the initial patch. Per `.devin/rules/patch-sha256-management.md`, do NOT create a new initial patch. Update the existing file in place AND create a fire-and-forget script to update the registry hash on existing databases.

| Line | Current | New |
|------|---------|-----|
| 220 | `COMMENT ON COLUMN public.user_passkeys.label IS 'User-given name (e.g. "Windows Hello", "iPhone")'` | Add ™ to `Windows Hello` |
| 248 | `COMMENT ON COLUMN public.user_mfa_factors.label IS 'User-given name (e.g. "Google Authenticator", "Authy")'` | Add ™ to `Google Authenticator`, `Authy` |
| 487 | `'Dotted path to extract the roles array from a JWT payload (e.g. "roles" for Casdoor/Entra, "realm_access.roles" for Keycloak realm roles)'` | Add ™ to `Casdoor`, `Entra`, `Keycloak` |

**Plus:** Create `db-meta/fire-and-forget/update_init_patch_sha256.sql` to update the registry hash after the in-place edit.

### 1.5 BE — ApiError / RFC 7807 user-facing error messages

These are returned to the FE and shown to users via toast/notification. They mention "Casdoor" without ™. Files & lines:

| File | Lines | Example string |
|------|-------|----------------|
| `src/modules/auth/services/mfa.service.ts` | 347, 349, 400, 402, 438, 519, 521, 534 | `"Casdoor is not configured"`, `"The Casdoor API client is not configured. MFA management requires Casdoor builtin credentials."`, `"Casdoor returned an error while enabling the MFA factor."`, `"Casdoor returned an error while deleting the MFA factor."` |
| `src/modules/auth/services/auth-session.service.ts` | 383 | `"Casdoor API returned non-success status"` |
| `src/modules/auth/routers/auth-session.router.ts` | 170 | `"Casdoor returned an error while changing the password"` |
| `src/modules/auth/services/user.service.ts` | 90, 216, 393, 408, 461, 493 | `"Casdoor user creation did not return a UUID"`, `"Casdoor API returned non-success status"`, `"Cannot change password: Casdoor is not configured or unreachable"`, `"Casdoor returned an error"` |
| `src/modules/auth/services/webauthn.service.ts` | 568, 578, 644, 654, 738, 748, 780, 841 | `"Casdoor is not configured"`, `"Casdoor user not found"`, `"Casdoor API returned non-success status when updating user credentials"` |
| `src/modules/auth/services/role.service.ts` | 99, 115, 200, 237, 289, 322 | `"Casdoor is not configured; cannot create role via API..."`, `"A role with name ... already exists in Casdoor organization ..."`, `"Failed to update role ... in Casdoor organization ..."`, `"Failed to delete role ... in Casdoor organization ... unassign it first in Casdoor."` |
| `src/modules/auth/services/invitation.service.ts` | 459, 474 | `"Cannot set password: Casdoor is not configured or unreachable"`, `"Casdoor returned an error while setting the password"` |

**Fix:** Add ™ to every `Casdoor` in these user-facing error strings (the `detail`/`message` arguments to `ApiError`/`UnauthorizedError`/`NotFoundError`). Do NOT touch code comments or variable names.

### 1.6 BE — Internal docs (USER-FACING for developers)

**File:** `primebrick-be-v3/docs/modules/auth-rbac.md`
- Line 32: `# roles (Casdoor, Microsoft Entra)` → add ™ to `Casdoor`, `Microsoft Entra`
- Line 33: `# realm_access.roles (Keycloak realm roles)` → add ™ to `Keycloak`

**File:** `primebrick-be-v3/AGENTS.md`
- Line 32: `GitHub Actions` → `GitHub™ Actions`
- Line 34: `Cloudflare Worker CI` → `Cloudflare® Worker CI`

### 1.7 US (primebrick-us-v3) docs

**File:** `primebrick-us-v3/AGENTS.md`
- Line 27: `GitHub Actions` → `GitHub™ Actions`
- Line 29: `Cloudflare Worker CI` → `Cloudflare® Worker CI`

**File:** `primebrick-us-v3/docs/user-guide/services/emailsender.mdx` (35 matches — Brevo™ throughout)
- All `Brevo` → `Brevo™`

**File:** `primebrick-us-v3/docs/user-guide/overview.mdx`, `architecture.mdx`, `conventions.mdx`
- `PostgreSQL` → `PostgreSQL®`, `NATS` → `NATS™`, `TypeScript` → `TypeScript®`, `Node.js` → `Node.js®`, `Docker` → `Docker®`

### 1.8 SDK (primebrick-v3-sdk) docs

**Files:** `docs/user-guide/*.mdx` (authentication, overview, api-reference, service-registration, ext-json, getting-started, nats-client)
- `Casdoor` → `Casdoor™`, `NATS` → `NATS™`, `PostgreSQL` → `PostgreSQL®`, `TypeScript` → `TypeScript®`, `Node.js` → `Node.js®`, `Docker` → `Docker®`, `GitHub` → `GitHub™`

**File:** `primebrick-v3-sdk/README.md`
- Add ™/® as needed

### 1.9 DOCS repo (primebrick-v3-docs)

**Files:** `pages/**/*.mdx`, `AGENTS.md`, `README.md`, `docs/gitflow.md`

Key fixes (apply ™/® to all occurrences):
- `pages/index.mdx` L6: `TypeScript, Express, SvelteKit, PostgreSQL, Casdoor, and NATS` → all trademarked
- `pages/getting-started/introduction.mdx` L16: `TypeScript, Express, Node.js`
- `pages/getting-started/infrastructure.mdx`: `Docker`, `PostgreSQL` (many lines)
- `pages/getting-started/quick-start.mdx` L16: `GitHub`
- `pages/getting-started/iso-27001-security-standards.mdx` L44: `GitHub`
- `pages/frontend/guide/overview.mdx`, `ui-stack.mdx`, `ui-components.mdx`: `Svelte`, `SvelteKit`, `TypeScript`, `Tailwind CSS`, `shadcn-svelte`, `BITS UI`, `Lucide`
- `pages/frontend/guide/components/dynamic-icon.mdx`: `Lucide`
- `pages/frontend/guide/components/choicebox.mdx`: `Svelte`
- `pages/microservices/guide/overview.mdx`: `PostgreSQL`
- `pages/microservices/guide/services/emailsender.mdx`: `Docker`, `Brevo`
- `pages/api/authentication.mdx`, `authentication-how-to.mdx`: `Casdoor`
- `pages/api/mcp-server.mdx`: `Casdoor`
- `pages/api/rbac.mdx`: `Casdoor`
- `pages/sdk/guide/*.mdx`: `NATS`, `Casdoor`, `PostgreSQL`, `TypeScript`, `Node.js`, `Docker`
- `pages/dal/guide/*.mdx`: `PostgreSQL`, `TypeScript`
- `AGENTS.md`: `Cloudflare`, `GitHub`
- `README.md`: `Cloudflare`, `GitHub`
- `docs/gitflow.md`: `GitHub`

⚠️ **Note on docs sync:** The DOCS repo's `pages/<repo>/guide/**` are synced from each repo's `docs/user-guide/` by `sync-repo-docs.mjs` in CI. **Fixes must be made in the SOURCE repos** (FE, BE, US, SDK, DAL) under `docs/user-guide/`, NOT in the DOCS repo's `pages/` directly. The DOCS repo's own hand-written pages (`pages/getting-started/`, `pages/api/`, `pages/index.mdx`, `AGENTS.md`, `README.md`) are edited directly in the DOCS repo.

### 1.10 Website (primebrick-v3-website)

**File:** `src/pages/[lang]/index.astro`
- L629: `SvelteKit` → `SvelteKit™`
- L640: `Casdoor` → `Casdoor™`
- L645: `NATS` → `NATS™`
- L660: `PostgreSQL` → `PostgreSQL®`
- L671: `Docker` → `Docker®`
- L63: `Cloudflare` → `Cloudflare®`

**File:** `src/components/svelte/GitHubDropdown.svelte` L36: `GitHub` → `GitHub™`
**File:** `src/components/svelte/GitHubCTAButton.svelte` L36: `GitHub` → `GitHub™`
**File:** `src/components/svelte/ContactForm.svelte` L53: `Cloudflare` → `Cloudflare®`
**File:** `src/components/svelte/SchemaToProduction.svelte` L59: `TypeScript` → `TypeScript®`

---

## Part 2 — Unified AuthMethodsPromptDialog (per root plan §2a Surface B)

**Root plan reference:** `feature-mfa-2fa-plan.md` lines 250-269, 982, 1178.
**Key rule from root plan (line 265):** "MFA mandatory? **Never.** Even when
offered, it's always skippable."
**Key rule from root plan (line 1178):** "When `passkey_required=true`: passkey
only, mandatory. When `passkey_required=false`: passkey OR MFA OR skip, all
dismissible with 'do not show again'."

### 2.0 Architecture decision (per user clarification 2026-07-20)

The current code has TWO separate dialogs (`PasskeyPromptDialog` + `MfaPromptDialog`)
both mounted in `+layout.svelte` lines 71-72. The root plan intended ONE unified
dialog. This plan implements the unification.

**Rename:**
- `PasskeyPromptDialog.svelte` → `AuthMethodsPromptDialog.svelte` (the shell/wrapper)
- Extract passkey enrollment logic → `PasskeyEnrollmentSection.svelte` (inner component)
- Extract MFA enrollment logic → `MfaEnrollmentSection.svelte` (inner component, keeps inline QR/verify steps — Option B)

**Why:** The dialog is the "auth method enforcer" — it's not passkey-specific or
MFA-specific. The dismiss mechanism is for the DIALOG, not for a specific method.
When `passkey_required=false`, the user can choose which method to enroll (passkey
or MFA) or skip entirely.

### 2.1 `AuthMethodsPromptDialog.svelte` (the shell)

**File:** `primebrick-fe-v3/src/lib/components/auth/AuthMethodsPromptDialog.svelte`
(replaces `PasskeyPromptDialog.svelte`)

**`shouldShow` logic (per root plan line 982):**
```typescript
const profile = $derived(userProfileStore.current);
const webauthnEnabled = $derived(authConfigState.config?.enable_webauthn ?? false);
const webauthnSupported = $derived(isWebauthnSupported());
const mfaEnabled = $derived(authConfigState.config?.enable_mfa ?? false);
const passkeyRequired = $derived(authConfigState.config?.passkey_required ?? false);

// passkey_required=true: show if no passkey (passkey only, no MFA, no dismiss)
// passkey_required=false: show if (no passkey OR no MFA) AND not dismissed
const needsPasskey = webauthnEnabled && webauthnSupported && profile?.has_passkey === false;
const needsMfa = mfaEnabled && profile?.has_mfa === false;

const shouldShow = $derived(
  !!profile?.uuid &&
  (passkeyRequired
    ? needsPasskey  // passkey only, mandatory
    : (needsPasskey || needsMfa) && !profile?.auth_method_enforcer_dismissed
  )
);
```

**Dialog content structure:**
```
Dialog.Header:
  Icon: ShieldCheck (generic, not Fingerprint — it's about auth methods now)
  Title: "Secure your account" (generic, not passkey-specific)
  Description: "Choose an advanced sign-in method to protect your account."

Dialog.Body:
  IF passkey_required=true:
    → render PasskeyEnrollmentSection only (no method selector)
    → no dismiss button, no checkbox
  IF passkey_required=false:
    → method selector: two Choicebox cards (Passkey / MFA)
      - Passkey card: shown only if needsPasskey (webauthnEnabled && !has_passkey)
      - MFA card: shown only if needsMfa (mfaEnabled && !has_mfa)
    → user selects one → inline enrollment section renders below
    → dismiss button + "don't show again" checkbox in footer

Dialog.Footer (only when passkey_required=false):
  Dismiss button (variant="secondary-outline") — "Not Now"
  Checkbox "Do not show again" — persists to DB via dismiss endpoint
  Primary CTA — dynamic based on selected method (enroll passkey / set up 2FA)
```

### 2.2 `PasskeyEnrollmentSection.svelte` (inner component)

**File:** `primebrick-fe-v3/src/lib/components/auth/PasskeyEnrollmentSection.svelte`

Extracted from current `PasskeyPromptDialog.svelte` lines 57-148 (the
`enrollPasskey` function + WebAuthn ceremony logic). Renders:
- Benefits (ShieldCheck emerald + KeyRound primary, split on " — ")
- Spinner when enrolling
- No dismiss/checkbox (those live in the shell's footer)

Exposes a `oncomplete` callback so the shell can close the dialog and update
`userProfileStore`.

### 2.3 `MfaEnrollmentSection.svelte` (inner component — Option B APPROVED)

**File:** `primebrick-fe-v3/src/lib/components/auth/MfaEnrollmentSection.svelte`

Extracted from current `MfaPromptDialog.svelte` lines 72-141 (the
`startEnrollment` + `finishEnrollment` functions). Keeps the inline 3-step
enrollment flow (intro → qr → verify) inside the dialog. Renders:
- Benefits (ShieldCheck emerald + Smartphone primary, split on " — ")
- Warning (bg-destructive/10, border-destructive/20, text-destructive)
- Inline QR step (QR image, manual entry code, recovery codes)
- Inline verify step (label input, code input, error message)
- Spinner when enrolling
- No dismiss/checkbox (those live in the shell's footer)

**Rationale (Option B):** PasskeyPromptDialog doesn't need inline enrollment
because the WebAuthn ceremony is handled by the browser (native OS prompt). MFA
TOTP enrollment requires the user to scan a QR code and enter a 6-digit code —
this MUST happen inside the dialog.

### 2.4 Visual alignment (both inner sections mirror PasskeyPromptDialog)

Both inner sections use the same visual language as the current
`PasskeyPromptDialog.svelte`:
- Benefits: `gap-2`, `space-y-2.5`, split on " — " with `<br />`, first part
  `text-foreground/80 not-italic`, second part `text-muted-foreground/80`
- Icons: `size-4`, emerald for security benefit, primary for convenience benefit
- Warning (MFA only): `bg-destructive/10`, `border-destructive/20`,
  `text-destructive` (NOT `bg-primary/5`)
- Spinner: `size-6` centered with loading text
- Buttons: default width (NOT `w-full`), primary CTA has icon prefix
- Footer: `gap-2 sm:space-x-0`, dismiss is `variant="secondary-outline"`

### 2.5 Layout mount update

**File:** `primebrick-fe-v3/src/routes/(app)/+layout.svelte`

Replace lines 5-6, 71-72:
```svelte
// OLD:
import PasskeyPromptDialog from '$lib/components/auth/PasskeyPromptDialog.svelte';
import MfaPromptDialog from '$lib/components/auth/MfaPromptDialog.svelte';
...
<PasskeyPromptDialog />
<MfaPromptDialog />

// NEW:
import AuthMethodsPromptDialog from '$lib/components/auth/AuthMethodsPromptDialog.svelte';
...
<AuthMethodsPromptDialog />
```

### 2.6 Delete old dialog files

- DELETE `PasskeyPromptDialog.svelte` (replaced by `AuthMethodsPromptDialog.svelte` + `PasskeyEnrollmentSection.svelte`)
- DELETE `MfaPromptDialog.svelte` (replaced by `AuthMethodsPromptDialog.svelte` + `MfaEnrollmentSection.svelte`)

### 2.7 i18n key names

**Rename namespace:** `auth.passkeyPrompt.*` → `auth.authMethodEnforcer.*`
(generic, covers both methods). The `auth.mfaPrompt.*` keys merge into the same
namespace.

**New key structure:**
| Key | en-GB |
|-----|-------|
| `auth.authMethodEnforcer.title` | `Secure your account` |
| `auth.authMethodEnforcer.description` | `Choose an advanced sign-in method to protect your account.` |
| `auth.authMethodEnforcer.benefitSecurity` | `More secure than passwords alone — stops credential stuffing and phishing` |
| `auth.authMethodEnforcer.benefitConveniencePasskey` | `Sign in faster with Face ID™, Touch ID™, Windows Hello™, or a security key` |
| `auth.authMethodEnforcer.benefitConvenienceMfa` | `Works with any TOTP app — Google Authenticator™, Authy™, 1Password™, Microsoft Authenticator™` |
| `auth.authMethodEnforcer.warningMfa` | `Enable 2FA to protect your account from unauthorized access.` |
| `auth.authMethodEnforcer.enrollPasskeyButton` | `Set up passkey` |
| `auth.authMethodEnforcer.enrollMfaButton` | `Set up 2FA` |
| `auth.authMethodEnforcer.enrolling` | `Starting enrollment...` |
| `auth.authMethodEnforcer.dontAskAgain` | `Don't show this again` |
| `auth.authMethodEnforcer.dismissButton` | `Not Now` |
| `auth.authMethodEnforcer.methodPasskey` | `Passkey` |
| `auth.authMethodEnforcer.methodMfa` | `Authenticator app` |
| `auth.authMethodEnforcer.methodPasskeyDesc` | `Use Face ID™, Touch ID™, Windows Hello™, or a security key` |
| `auth.authMethodEnforcer.methodMfaDesc` | `Use Google Authenticator™, Authy™, 1Password™, or Microsoft Authenticator™` |

**Remove old keys:** `auth.passkeyPrompt.*` and `auth.mfaPrompt.*` (replaced by
`auth.authMethodEnforcer.*`). The MFA enrollment step keys
(`auth.mfa.enrollStepQr`, `auth.mfa.labelPlaceholder`, `auth.mfa.continue`,
`auth.mfa.verifyCode`, `auth.mfa.verifyAndEnable`, etc.) stay as-is — they're
shared with `MfaManagement.svelte`.

**All 6 locales** get the full `auth.authMethodEnforcer.*` section.

---

## Part 3 — Unified Dismiss Mechanism (per user clarification 2026-07-20)

**Root plan reference:** `feature-mfa-2fa-plan.md` line 265 — "The user can
dismiss indefinitely (with 'do not show again' checkbox that persists to
`passkey_prompt_dismissed` on `user_profiles`)."

**User clarification:** The dismiss is for the AUTH METHOD ENFORCED DIALOG
itself, not for a specific method (passkey or MFA). The rules:

1. **`passkey_required=false`:** dismiss with "Not Now" (secondary CTA,
   infinite times, no persistence). OR checkbox "Do not show again" + click
   "Not Now" → persists to DB, dialog stops showing. This applies regardless
   of which method (passkey or MFA) the dialog is offering.
2. **`passkey_required=true`:** both "Not Now" button and "Do not show again"
   checkbox disappear. The dialog always shows on next login until the user
   enrolls a passkey.

### 3.1 BE — Rename endpoint + DB column (generic)

**Current (empirical):**
- Endpoint: `POST /api/v1/auth/me/dismiss-passkey-prompt` (auth-session.router.ts line 145, 234)
- DB column: `passkey_prompt_dismissed` on `user_profiles` (user_profile_entity.ts line 117)
- `GET /api/v1/auth/me` returns `passkey_prompt_dismissed` field (auth-session.service.ts line 289)

**Rename to:**
- Endpoint: `POST /api/v1/auth/me/dismiss-auth-method-enforcer`
- DB column: `auth_method_enforcer_dismissed` on `user_profiles`
- `GET /api/v1/auth/me` returns `auth_method_enforcer_dismissed` field

**Files to edit (BE):**
| File | Change |
|------|--------|
| `src/modules/auth/routers/auth-session.router.ts` | Rename route path + handler (lines 145, 234) |
| `src/modules/auth/services/auth-session.service.ts` | Rename column in SELECT (line 265), variable (line 269), response field (line 289), UPDATE SET (line 315) |
| `src/modules/auth/user_profile_entity.ts` | Rename field in interface (line 117) |
| `src/modules/auth/sdk-auth-ports.ts` | Update type if referenced |

**DB migration (fire-and-forget):**
- Create `db-meta/fire-and-forget/rename_passkey_prompt_dismissed_column.sql`
- `ALTER TABLE user_profiles RENAME COLUMN passkey_prompt_dismissed TO auth_method_enforcer_dismissed;`
- Update `primebrick_database_patches` registry SHA256 for the init patch (since the column name changed in the entity, the snapshot must be regenerated — see `.devin/rules/patch-sha256-management.md`)

⚠️ **Per `patch-sha256-management.md`:** Do NOT create a new initial patch.
Update `00000000000000_init_database.sql` in place (rename the column in the
CREATE TABLE + COMMENT) AND create the fire-and-forget script to rename the
column on existing databases + update the registry hash.

### 3.2 FE — Update dismiss logic in AuthMethodsPromptDialog

**File:** `AuthMethodsPromptDialog.svelte`

**Dismiss function (replaces current PasskeyPromptDialog `dismissPrompt`):**
```typescript
async function dismissPrompt() {
  if (dismissing) return;
  dismissing = true;
  try {
    if (dontAskAgain) {
      const resp = await apiFetch('/api/v1/auth/me/dismiss-auth-method-enforcer', {
        method: 'POST',
      });
      if (resp.ok && profile) {
        userProfileStore.set({
          ...profile,
          auth_method_enforcer_dismissed: true,
        });
      }
    }
  } catch (error) {
    console.error('[AuthMethodEnforcer] Failed to dismiss:', error);
  } finally {
    dismissing = false;
    dontAskAgain = false;
    open = false;
  }
}
```

**Footer (only when `passkey_required=false`):**
```svelte
<Dialog.Footer class="gap-2 sm:space-x-0">
  {#if !passkeyRequired}
    <Button
      variant="secondary-outline"
      data-testid="auth-method-enforcer-dismiss-button"
      onclick={dismissPrompt}
      disabled={enrolling || dismissing}
    >
      {$t('auth.authMethodEnforcer.dismissButton')}
    </Button>
  {/if}
  <!-- Primary CTA is rendered by the active enrollment section -->
</Dialog.Footer>
```

**Checkbox (only when `passkey_required=false`):**
```svelte
{#if !passkeyRequired}
  <div class="flex items-start space-x-2 pt-2">
    <Checkbox
      id="dont_ask_again"
      bind:checked={dontAskAgain}
      tone="primary"
      class="data-[state=unchecked]:border-primary-gradient-popover mt-0.5"
    />
    <label for="dont_ask_again" class="text-sm font-medium leading-snug text-muted-foreground">
      {$t('auth.authMethodEnforcer.dontAskAgain')}
    </label>
  </div>
{/if}
```

### 3.3 Remove sessionStorage-based MFA dismiss

**Delete from `MfaEnrollmentSection.svelte`** (extracted from old MfaPromptDialog):
- The `DISMISS_KEY` constant (`'mfa_prompt_dismissed'`)
- The `sessionStorage.getItem(DISMISS_KEY)` check in `shouldShow`
- The `sessionStorage.setItem(DISMISS_KEY, '1')` in `dismissPrompt`

The dismiss is now handled by the shell (`AuthMethodsPromptDialog`) via the
DB-persisted `auth_method_enforcer_dismissed` column. No sessionStorage.

### 3.4 Remove discouraging copy

**Remove from all locales:**
- `auth.mfaPrompt.remindLater` ("Remind me later" / "Ricordamelo più tardi") — replaced by `auth.authMethodEnforcer.dismissButton` ("Not Now")
- `auth.mfaPrompt.dontAskAgain` — replaced by `auth.authMethodEnforcer.dontAskAgain`
- `auth.mfaPrompt.warning` text "You can dismiss this prompt, but we strongly recommend" → replaced by direct "Enable 2FA to protect your account from unauthorized access." (no "you can dismiss" language)

**Keep:** The warning is now shown only inside the MFA enrollment section
(when the user selects MFA as their method), not in the shell dialog.

---

## Part 4 — E2E Test Updates

**Files:**
- `primebrick-fe-v3/src/e2e/auth-mfa.spec.ts`
- `primebrick-fe-v3/src/e2e/auth-passkey.spec.ts`

### 4.1 Update existing MFA E2E tests

The current test uses `sessionStorage.setItem("mfa_prompt_dismissed", "1")`
to dismiss the MFA prompt. This is REMOVED — the dismiss is now DB-persisted
via `auth_method_enforcer_dismissed`.

**Test case A — `passkey_required=false`, user has no passkey and no MFA:**
1. Login as admin (ensure `passkey_required=false`, `enable_mfa=true`)
2. Navigate to any (app) route
3. Assert `AuthMethodsPromptDialog` is visible
4. Assert both passkey and MFA method cards are visible
5. Assert "Not Now" dismiss button is visible
6. Assert "Do not show again" checkbox is visible
7. Click "Not Now" → dialog closes
8. Reload → dialog reappears (no persistence without checkbox)
9. Click "Do not show again" + "Not Now" → dialog closes
10. Reload → dialog does NOT reappear (persisted to DB)
11. Reset `auth_method_enforcer_dismissed=false` in `afterAll`

**Test case B — `passkey_required=true`, user has no passkey:**
1. Set `passkey_required=true` in auth config (via `db.ts` helper)
2. Login as admin
3. Navigate to any (app) route
4. Assert `AuthMethodsPromptDialog` is visible
5. Assert ONLY passkey method is shown (no MFA card)
6. Assert "Not Now" dismiss button is NOT visible
7. Assert "Do not show again" checkbox is NOT visible
8. Assert enroll passkey button IS visible
9. Reset `passkey_required=false` in `afterAll`

**Test case C — MFA inline enrollment via dialog:**
1. Login as admin (`passkey_required=false`, `enable_mfa=true`)
2. Assert dialog visible
3. Select MFA method card
4. Complete inline QR → verify enrollment flow
5. Assert dialog closes
6. Assert `has_mfa=true` in profile store

### 4.2 Update existing passkey E2E tests

**File:** `auth-passkey.spec.ts` line 194 references `PasskeyPromptDialog` —
update to `AuthMethodsPromptDialog`. Update `data-testid` selectors:
- `passkey-prompt-dismiss-button` → `auth-method-enforcer-dismiss-button`
- `passkey-prompt-enroll-button` → keep or rename to `auth-method-enforcer-enroll-passkey-button`

### 4.3 Remove old test hacks

- Remove all `sessionStorage.setItem("mfa_prompt_dismissed", "1")` calls
- Remove all `sessionStorage.setItem("passkey_prompt_dismissed", ...)` calls (if any)
- The dismiss is now DB-persisted, so tests that need to dismiss must call
  the API endpoint or set the DB column directly via `db.ts` helper

---

## Part 5 — Copy semplificato per utenza generica (non esperti del settore)

**Principio:** i copy delle dialog si rivolgono a utenti generici, non a
esperti security. I termini tecnici vanno sostituiti con linguaggio
comprensibile. **Eccezioni confermate dall'utente:**
- `OTP` — termine ormai consolidato, tenuto (non "app di autenticazione")
- `compromessa` (password) — italiano standard, non tecnico, tenuto

### 5.1 Pattern di sostituzione

| Termine tecnico | Sostituire con |
|----------------|----------------|
| credential stuffing / stuffing / bourrage d'identifiants / relleno de credenciales / preenchimento de credenciais | furto dell'account / account theft / Kontodiebstahl / robo de cuenta / vol de compte / roubo de conta |
| second factor / secondo fattore / zweiter Faktor / segundo factor / deuxième facteur / segundo fator | secondo livello di sicurezza / second layer of security / zweite Sicherheitsebene / segunda capa de seguridad / deuxième couche de sécurité / segunda camada de segurança |
| fattore / factor / Faktor / factor / facteur / fator (in contesto MFA) | app OTP / OTP app / OTP-App / app OTP / application OTP / app OTP |
| TOTP | OTP |
| biometria / biometrics / Biometrie / biometría / biométrie / biometria | Face ID™, Touch ID™, Windows Hello™ (nomi specifici) |
| authenticator / autenticatore / Authentifikator / autenticador (in "waiting for...") | dispositivo / device / Gerät / dispositivo |
| prompt (sostantivo) | avviso / prompt (riformulare la frase per evitare il termine) |

### 5.2 Chiavi affected — stato empirico attuale

**Locale coverage (empirico):**
- `en-GB` + `it-IT`: hanno `mfa`, `mfaPrompt`, `mfaStepUp`, `passkeyPrompt`
- `de-DE` + `es-ES` + `fr-FR` + `pt-PT`: hanno SOLO `passkeyPrompt` (le altre sezioni fallback a en-GB)

**Per Part 2.7**, tutti i 6 locales riceveranno la nuova namespace
`auth.authMethodEnforcer.*`. Part 5 applica la semplificazione copy
CONTEMPORANEAMENTE alla creazione della nuova namespace.

### 5.3 Passkey — `auth.passkeyPrompt.*` (tutti i 6 locales hanno già questa sezione)

#### `benefitSecurity` — rimuovi "credential stuffing"

| Locale | Attuale | Nuovo |
|--------|---------|-------|
| en-GB | `More secure than passwords — resistant to phishing and credential stuffing` | `More secure than passwords — protects against account theft and online scams (phishing)` |
| it-IT | `Più sicure delle password — resistenti al phishing e al credential stuffing` | `Più sicure delle password — proteggono dal furto dell'account e dalle truffe online (phishing)` |
| de-DE | `Sicherer als Passwörter — resistent gegen Phishing und Credential Stuffing` | `Sicherer als Passwörter — schützt vor Kontodiebstahl und Online-Betrug (Phishing)` |
| es-ES | `Más seguras que las contraseñas — resistentes al phishing y al relleno de credenciales` | `Más seguras que las contraseñas — protegen contra el robo de cuenta y las estafas online (phishing)` |
| fr-FR | `Plus sécurisé que les mots de passe — résistant au phishing et au bourrage d'identifiants` | `Plus sécurisé que les mots de passe — protège contre le vol de compte et les arnaques en ligne (phishing)` |
| pt-PT | `Mais seguras que as palavras-passe — resistentes ao phishing e ao preenchimento de credenciais` | `Mais seguras que as palavras-passe — protegem contra o roubo de conta e as burlas online (phishing)` |

#### `benefitConvenience` — sostituisci "biometria" con nomi specifici

| Locale | Attuale | Nuovo |
|--------|---------|-------|
| en-GB | `Sign in instantly with biometrics or a security key — no password to remember` | `Sign in instantly with Face ID™, Touch ID™, Windows Hello™, or a security key — no password to remember` |
| it-IT | `Accedi istantaneamente con biometria o una chiave di sicurezza — nessuna password da ricordare` | `Accedi istantaneamente con Face ID™, Touch ID™, Windows Hello™ o una chiave di sicurezza — nessuna password da ricordare` |
| de-DE | `Melden Sie sich sofort mit Biometrie oder einem Sicherheitsschlüssel an — kein Passwort zu merken` | `Melden Sie sich sofort mit Face ID™, Touch ID™, Windows Hello™ oder einem Sicherheitsschlüssel an — kein Passwort zu merken` |
| es-ES | `Inicie sesión al instante con biometría o una llave de seguridad — sin contraseña que recordar` | `Inicie sesión al instante con Face ID™, Touch ID™, Windows Hello™ o una llave de seguridad — sin contraseña que recordar` |
| fr-FR | `Connectez-vous instantanément avec la biométrie ou une clé de sécurité — aucun mot de passe à mémoriser` | `Connectez-vous instantanément avec Face ID™, Touch ID™, Windows Hello™ ou une clé de sécurité — aucun mot de passe à mémoriser` |
| pt-PT | `Inicie sessão instantaneamente com biometria ou uma chave de segurança — sem palavra-passe para memorizar` | `Inicie sessão instantaneamente com Face ID™, Touch ID™, Windows Hello™ ou uma chave de segurança — sem palavra-passe para memorizar` |

#### `enrolling` — sostituisci "autenticatore" con "dispositivo"

| Locale | Attuale | Nuovo |
|--------|---------|-------|
| en-GB | `Waiting for authenticator...` | `Waiting for device...` |
| it-IT | `In attesa dell'autenticatore...` | `In attesa del dispositivo...` |
| de-DE | `Warten auf Authentifikator...` | `Warten auf Gerät...` |
| es-ES | `Esperando al autenticador...` | `Esperando al dispositivo...` |
| fr-FR | `En attente de l'authentificateur...` | `En attente de l'appareil...` |
| pt-PT | `A aguardar o autenticador...` | `A aguardar o dispositivo...` |

### 5.4 MFA prompt — `auth.authMethodEnforcer.*` (nuova namespace, tutti i 6 locales)

Queste chiavi sostituiscono le vecchie `auth.mfaPrompt.*`. I copy sono
semplificati + trademark applicati.

#### `benefitSecurity` — rimuovi "credential stuffing"

| Locale | Nuovo |
|--------|-------|
| en-GB | `More secure than passwords alone — stops account theft and online scams (phishing)` |
| it-IT | `Più sicuro della sola password — blocca i tentativi di furto dell'account e le truffe online (phishing)` |
| de-DE | `Sicherer als Passwörter allein — blockiert Kontodiebstahl und Online-Betrug (Phishing)` |
| es-ES | `Más seguro que las contraseñas solas — bloquea el robo de cuenta y las estafas online (phishing)` |
| fr-FR | `Plus sécurisé que les mots de passe seuls — bloque le vol de compte et les arnaques en ligne (phishing)` |
| pt-PT | `Mais seguro que as palavras-passe sozinhas — bloqueia o roubo de conta e as burlas online (phishing)` |

#### `benefitConvenienceMfa` — sostituisci "TOTP" con "OTP"

| Locale | Nuovo |
|--------|-------|
| en-GB | `Works with any OTP app — Google Authenticator™, Authy™, 1Password™, Microsoft Authenticator™` |
| it-IT | `Funziona con qualsiasi app OTP — Google Authenticator™, Authy™, 1Password™, Microsoft Authenticator™` |
| de-DE | `Funktioniert mit jeder OTP-App — Google Authenticator™, Authy™, 1Password™, Microsoft Authenticator™` |
| es-ES | `Funciona con cualquier app OTP — Google Authenticator™, Authy™, 1Password™, Microsoft Authenticator™` |
| fr-FR | `Fonctionne avec n'importe quelle application OTP — Google Authenticator™, Authy™, 1Password™, Microsoft Authenticator™` |
| pt-PT | `Funciona com qualquer app OTP — Google Authenticator™, Authy™, 1Password™, Microsoft Authenticator™` |

#### `description` (MFA-specific, per method card) — sostituisci "second factor"

| Locale | Nuovo |
|--------|-------|
| en-GB | `Add an OTP app as a second layer of security. Even if your password is stolen, no one can access your account without the code from your phone.` |
| it-IT | `Aggiungi un'app OTP come secondo livello di sicurezza. Anche se la tua password viene rubata, nessuno può accedere al tuo account senza il codice dal tuo telefono.` |
| de-DE | `Fügen Sie eine OTP-App als zweite Sicherheitsebene hinzu. Selbst wenn Ihr Passwort gestohlen wird, kann niemand auf Ihr Konto zugreifen, ohne den Code von Ihrem Telefon.` |
| es-ES | `Añade una app OTP como segunda capa de seguridad. Aunque roben tu contraseña, nadie puede acceder a tu cuenta sin el código de tu teléfono.` |
| fr-FR | `Ajoutez une application OTP comme deuxième couche de sécurité. Même si votre mot de passe est volé, personne ne peut accéder à votre compte sans le code de votre téléphone.` |
| pt-PT | `Adicione uma app OTP como segunda camada de segurança. Mesmo que a sua palavra-passe seja roubada, ninguém pode aceder à sua conta sem o código do seu telefone.` |

#### `warningMfa` — rimuovi "puoi chiudere questo prompt"

| Locale | Nuovo |
|--------|-------|
| en-GB | `Enable 2FA to protect your account from unauthorized access.` |
| it-IT | `Attiva la 2FA per proteggere il tuo account da accessi non autorizzati.` |
| de-DE | `Aktivieren Sie 2FA, um Ihr Konto vor unbefugtem Zugriff zu schützen.` |
| es-ES | `Activa la 2FA para proteger tu cuenta de accesos no autorizados.` |
| fr-FR | `Activez la 2FA pour protéger votre compte contre les accès non autorisés.` |
| pt-PT | `Ative a 2FA para proteger a sua conta de acessos não autorizados.` |

### 5.5 MFA profile — `auth.mfa.*` (solo en-GB + it-IT hanno questa sezione; gli altri fallback)

Queste chiavi sono condivise tra `MfaManagement.svelte` (profile) e
`MfaEnrollmentSection.svelte` (dialog). La semplificazione si applica a
tutti i 6 locales — per de-DE, es-ES, fr-FR, pt-PT la sezione `mfa` viene
creata ex novo con i copy semplificati.

#### `description` — sostituisci "second factor"

| Locale | Attuale | Nuovo |
|--------|---------|-------|
| en-GB | `Add an authenticator app as a second factor to protect your account, even if your password is compromised.` | `Add an OTP app as a second layer of security to protect your account, even if your password is compromised.` |
| it-IT | `Aggiungi un'app di autenticazione come secondo fattore per proteggere il tuo account, anche se la password viene compromessa.` | `Aggiungi un'app OTP come secondo livello di sicurezza per proteggere il tuo account, anche se la password viene compromessa.` |
| de-DE | (fallback en-GB) | `Fügen Sie eine OTP-App als zweite Sicherheitsebene hinzu, um Ihr Konto zu schützen, auch wenn Ihr Passwort kompromittiert wird.` |
| es-ES | (fallback en-GB) | `Añade una app OTP como segunda capa de seguridad para proteger tu cuenta, aunque tu contraseña se vea comprometida.` |
| fr-FR | (fallback en-GB) | `Ajoutez une application OTP comme deuxième couche de sécurité pour protéger votre compte, même si votre mot de passe est compromis.` |
| pt-PT | (fallback en-GB) | `Adicione uma app OTP como segunda camada de segurança para proteger a sua conta, mesmo que a sua palavra-passe seja comprometida.` |

#### `recoveryCodes` — semplifica

| Locale | Attuale | Nuovo |
|--------|---------|-------|
| en-GB | `Recovery codes (save these — you will need them if you lose your device)` | `Backup codes — save them in a safe place, you'll need them if you lose your phone` |
| it-IT | `Codici di recupero (salvali — ti serviranno se perdi il dispositivo)` | `Codici di backup — salvali in un posto sicuro, ti serviranno se perdi il telefono` |
| de-DE | (fallback en-GB) | `Backup-Codes — speichern Sie sie an einem sicheren Ort, Sie benötigen sie, wenn Sie Ihr Telefon verlieren` |
| es-ES | (fallback en-GB) | `Códigos de respaldo — guárdalos en un lugar seguro, los necesitarás si pierdes tu teléfono` |
| fr-FR | (fallback en-GB) | `Codes de secours — enregistrez-les dans un endroit sûr, vous en aurez besoin si vous perdez votre téléphone` |
| pt-PT | (fallback en-GB) | `Códigos de backup — guarde-os num local seguro, precisará deles se perder o seu telefone` |

#### `deleteDialogDescription` — sostituisci "fattore"

| Locale | Attuale | Nuovo |
|--------|---------|-------|
| en-GB | `You will no longer be prompted for this factor at login. Make sure you have at least one other factor or a passkey to keep your account secure.` | `You will no longer be asked for this code at login. Make sure you have another OTP app or a passkey to keep your account secure.` |
| it-IT | `Non ti verrà più richiesto questo fattore al login. Assicurati di avere almeno un altro fattore o una passkey per mantenere l'account sicuro.` | `Non ti verrà più chiesto questo codice al login. Assicurati di avere un'altra app OTP o una passkey per mantenere l'account sicuro.` |
| de-DE | (fallback en-GB) | `Sie werden beim Login nicht mehr nach diesem Code gefragt. Stellen Sie sicher, dass Sie eine andere OTP-App oder einen Passkey haben, um Ihr Konto sicher zu halten.` |
| es-ES | (fallback en-GB) | `Ya no se te pedirá este código al iniciar sesión. Asegúrate de tener otra app OTP o una passkey para mantener tu cuenta segura.` |
| fr-FR | (fallback en-GB) | `Ce code ne vous sera plus demandé à la connexion. Assurez-vous d'avoir une autre application OTP ou une passkey pour sécuriser votre compte.` |
| pt-PT | (fallback en-GB) | `Este código já não lhe será pedido no início de sessão. Certifique-se de que tem outra app OTP ou uma passkey para manter a sua conta segura.` |

### 5.6 Step-up — `auth.mfaStepUp.*` (solo en-GB + it-IT hanno questa sezione)

#### `selectFactor` — sostituisci "fattore"

| Locale | Attuale | Nuovo |
|--------|---------|-------|
| en-GB | `Select factor` | `Select OTP app` |
| it-IT | `Seleziona fattore` | `Seleziona app OTP` |
| de-DE | (fallback en-GB) | `OTP-App auswählen` |
| es-ES | (fallback en-GB) | `Seleccionar app OTP` |
| fr-FR | (fallback en-GB) | `Sélectionner l'application OTP` |
| pt-PT | (fallback en-GB) | `Selecionar app OTP` |

### 5.7 Note implementative

- **de-DE, es-ES, fr-FR, pt-PT** attualmente non hanno `mfa`, `mfaPrompt`,
  `mfaStepUp` — fallback a en-GB. Per Part 2.7 + Part 5, queste sezioni
  vengono CREATE ex novo in ogni locale con i copy semplificati (non si
  lascia il fallback a en-GB per coerenza con l'utente finale).
- **Trademark ™/®** applicati nei copy semplificati (conforme a Part 1).
- **Encoding JSON:** usare `\u2122` per ™, `\u00ae` per ® nei file JSON
  (per compatibilità editor/terminali).

---

## Impacted Files Summary

### Frontend (primebrick-fe-v3) — Dialog unification + trademark
1. **NEW** `src/lib/components/auth/AuthMethodsPromptDialog.svelte` — unified shell (replaces PasskeyPromptDialog)
2. **NEW** `src/lib/components/auth/PasskeyEnrollmentSection.svelte` — passkey inner component (extracted from PasskeyPromptDialog)
3. **NEW** `src/lib/components/auth/MfaEnrollmentSection.svelte` — MFA inner component with inline QR/verify (extracted from MfaPromptDialog, Option B)
4. **DELETE** `src/lib/components/auth/PasskeyPromptDialog.svelte` — replaced by #1 + #2
5. **DELETE** `src/lib/components/auth/MfaPromptDialog.svelte` — replaced by #1 + #3
6. `src/routes/(app)/+layout.svelte` — mount `AuthMethodsPromptDialog` instead of two separate dialogs (lines 5-6, 71-72)
7. `src/lib/components/auth/MfaManagement.svelte` — QR Code ® in alt text (line 287)
8. `src/lib/i18n/messages/en-GB.json` — trademark symbols + new `auth.authMethodEnforcer.*` namespace + remove old `auth.passkeyPrompt.*` and `auth.mfaPrompt.*`
9. `src/lib/i18n/messages/it-IT.json` — same
10. `src/lib/i18n/messages/de-DE.json` — same
11. `src/lib/i18n/messages/es-ES.json` — same
12. `src/lib/i18n/messages/fr-FR.json` — same
13. `src/lib/i18n/messages/pt-PT.json` — same
14. `src/lib/shell/sheets/panels/VersionsPanel.svelte` — Casdoor ™ fallback (line 117)
15. `src/lib/user-profile-store.svelte` — rename `passkey_prompt_dismissed` → `auth_method_enforcer_dismissed` field reference
16. `src/e2e/auth-mfa.spec.ts` — update for unified dialog (remove sessionStorage hack, add 3 test cases A/B/C)
17. `src/e2e/auth-passkey.spec.ts` — update `PasskeyPromptDialog` references → `AuthMethodsPromptDialog` (line 194), update `data-testid` selectors
18. `docs/user-guide/**/*.mdx` — trademark symbols (synced to DOCS repo)

### Backend (primebrick-be-v3) — Dismiss rename + trademark
19. `db-meta/patches/00000000000000_init_database.sql` — rename column `passkey_prompt_dismissed` → `auth_method_enforcer_dismissed` in CREATE TABLE + COMMENT + trademark ™ in SQL comments (in-place edit)
20. **NEW** `db-meta/fire-and-forget/rename_passkey_prompt_dismissed_column.sql` — `ALTER TABLE user_profiles RENAME COLUMN ...` + update registry SHA256
21. `src/modules/auth/user_profile_entity.ts` — rename field `passkey_prompt_dismissed` → `auth_method_enforcer_dismissed` (line 117)
22. `src/modules/auth/services/auth-session.service.ts` — rename column in SELECT (line 265), variable (line 269), response field (line 289), UPDATE SET (line 315) + ™ on Casdoor (line 383)
23. `src/modules/auth/routers/auth-session.router.ts` — rename route `/dismiss-passkey-prompt` → `/dismiss-auth-method-enforcer` (lines 145, 234) + rename response field (line 136-137) + ™ on Casdoor (line 170)
24. `src/modules/auth/sdk-auth-ports.ts` — update type if `passkey_prompt_dismissed` is referenced
25. `src/modules/auth/services/mfa.service.ts` — ™ on Casdoor in ApiError strings (8 lines: 347, 349, 400, 402, 438, 519, 521, 534)
26. `src/modules/auth/services/user.service.ts` — ™ on Casdoor (6 lines: 90, 216, 393, 408, 461, 493)
27. `src/modules/auth/services/webauthn.service.ts` — ™ on Casdoor (8 lines: 568, 578, 644, 654, 738, 748, 780, 841)
28. `src/modules/auth/services/role.service.ts` — ™ on Casdoor (6 lines: 99, 115, 200, 237, 289, 322)
29. `src/modules/auth/services/invitation.service.ts` — ™ on Casdoor (2 lines: 459, 474)
30. `docs/modules/auth-rbac.md` — ™ on Casdoor, Microsoft Entra, Keycloak
31. `AGENTS.md` — ™/® on GitHub, Cloudflare
32. `docs/user-guide/**/*.mdx` — trademark symbols (synced to DOCS repo)

### Microservices (primebrick-us-v3) — trademark
33. `AGENTS.md` — ™/® on GitHub, Cloudflare
34. `docs/user-guide/**/*.mdx` — ™ on Brevo, PostgreSQL®, NATS™, TypeScript®, Node.js®, Docker®

### SDK (primebrick-v3-sdk) — trademark
35. `docs/user-guide/*.mdx` — ™/® on Casdoor, NATS, PostgreSQL, TypeScript, Node.js, Docker, GitHub
36. `README.md` — trademark symbols

### DAL (primebrick-v3-dal) — trademark
37. `docs/user-guide/*.mdx` — ™/® on PostgreSQL, TypeScript
38. `README.md` — trademark symbols (if any)

### Docs repo (primebrick-v3-docs) — trademark
39. `pages/index.mdx` — ™/® on TypeScript, SvelteKit, PostgreSQL, Casdoor, NATS
40. `pages/getting-started/introduction.mdx` — ™/® on TypeScript, Node.js
41. `pages/getting-started/infrastructure.mdx` — ® on Docker, PostgreSQL
42. `pages/getting-started/quick-start.mdx` — ™ on GitHub
43. `pages/getting-started/iso-27001-security-standards.mdx` — ™ on GitHub
44. `pages/frontend/guide/overview.mdx`, `ui-stack.mdx`, `ui-components.mdx` — ™ on Svelte, SvelteKit, TypeScript, Tailwind, shadcn-svelte, BITS UI, Lucide
45. `pages/frontend/guide/components/dynamic-icon.mdx` — ™ on Lucide
46. `pages/frontend/guide/components/choicebox.mdx` — ™ on Svelte
47. `pages/microservices/guide/overview.mdx` — ® on PostgreSQL
48. `pages/microservices/guide/services/emailsender.mdx` — ® on Docker, ™ on Brevo
49. `pages/api/authentication.mdx`, `authentication-how-to.mdx`, `mcp-server.mdx`, `rbac.mdx` — ™ on Casdoor
50. `pages/sdk/guide/*.mdx` — ™/® on NATS, Casdoor, PostgreSQL, TypeScript, Node.js, Docker
51. `pages/dal/guide/*.mdx` — ® on PostgreSQL, ™ on TypeScript
52. `AGENTS.md` — ® on Cloudflare, ™ on GitHub
53. `README.md` — ® on Cloudflare, ™ on GitHub
54. `docs/gitflow.md` — ™ on GitHub

### Website (primebrick-v3-website) — trademark
55. `src/pages/[lang]/index.astro` — ™/® on SvelteKit, Casdoor, NATS, PostgreSQL, Docker, Cloudflare
56. `src/components/svelte/GitHubDropdown.svelte` — ™ on GitHub
57. `src/components/svelte/GitHubCTAButton.svelte` — ™ on GitHub
58. `src/components/svelte/ContactForm.svelte` — ® on Cloudflare
59. `src/components/svelte/SchemaToProduction.svelte` — ® on TypeScript

---

## Acceptance Criteria

1. **Trademark:** Every third-party product name in user-facing text across
   ALL repos (FE, BE, US, SDK, DAL, DOCS, WEBSITE) has the appropriate
   ™/®/© symbol. Verified by empirical grep across all repos — no
   user-facing string in i18n JSON, ApiError messages, SQL comments, MDX
   docs, or website components contains a bare trademarked name.
2. **Unified dialog:** `AuthMethodsPromptDialog.svelte` replaces both
   `PasskeyPromptDialog.svelte` and `MfaPromptDialog.svelte`. One dialog
   mounted in `+layout.svelte`. Two inner components
   (`PasskeyEnrollmentSection` + `MfaEnrollmentSection`) render inside it
   based on the method selected.
3. **`passkey_required=true` behavior:** Dialog shows passkey ONLY. No
   "Not Now" dismiss button. No "Do not show again" checkbox. User MUST
   enroll a passkey to close the dialog.
4. **`passkey_required=false` behavior:** Dialog shows both passkey and MFA
   method cards (if user lacks them). "Not Now" dismiss button visible.
   "Do not show again" checkbox visible. Clicking "Not Now" without
   checkbox → dialog reappears next login. Clicking checkbox + "Not Now"
   → dialog persists dismissal to DB, does not reappear.
5. **MFA never mandatory in dialog:** MFA is always skippable in the dialog
   (per root plan line 265). Real MFA enforcement is per-route step-up
   (Surface C), not per-user. The dialog is a nudge, not a blocker.
6. **Dismiss mechanism:** Single endpoint
   `POST /api/v1/auth/me/dismiss-auth-method-enforcer` replaces
   `POST /api/v1/auth/me/dismiss-passkey-prompt`. DB column
   `auth_method_enforcer_dismissed` replaces `passkey_prompt_dismissed`.
   No sessionStorage-based dismiss.
7. **Copy tone:** No occurrence of "You can dismiss" / "Puoi chiudere" /
   "Remind me later" / "Ricordamelo più tardi" in any locale.
8. **Copy semplificato (utente generico):** Nessun termine tecnico
   security nei copy delle dialog. Verificato empiricamente con grep:
   - No "credential stuffing" / "stuffing" / "bourrage d'identifiants" /
     "relleno de credenciales" / "preenchimento de credenciais" in nessun
     locale
   - No "TOTP" isolato (sostituito con "OTP")
   - No "biometria" / "biometrics" / "Biometrie" / "biometría" /
     "biométrie" (sostituito con Face ID™, Touch ID™, Windows Hello™)
   - No "second factor" / "secondo fattore" / "zweiter Faktor" /
     "segundo factor" / "deuxième facteur" / "segundo fator" (sostituito
     con "secondo livello di sicurezza" / equivalenti)
   - No "fattore" / "factor" / "Faktor" come sostantivo isolato per MFA
     (sostituito con "app OTP")
   - No "autenticatore" / "authenticator" / "Authentifikator" in
     "waiting for..." (sostituito con "dispositivo" / "device" / "Gerät")
   - Eccezioni confermate: `OTP` (tenuto), `compromessa` (tenuto, IT standard)
9. **i18n completeness:** All 6 locales have a complete
   `auth.authMethodEnforcer.*` namespace AND complete `auth.mfa.*` and
   `auth.mfaStepUp.*` sections (de-DE, es-ES, fr-FR, pt-PT currently
   fallback to en-GB — created ex novo with simplified copy). Old
   `auth.passkeyPrompt.*` and `auth.mfaPrompt.*` namespaces removed.
10. **No new BE flag:** No `mfa_enforced`, no `mfa_required`. The
    `passkey_required` flag (already exists) controls dismissability for
    BOTH methods in the unified dialog.
11. **Tests:** `svelte-check` passes with 0 errors. E2E suites pass:
    - `auth-mfa.spec.ts` — 3 new test cases (A: dismissable, B: passkey
      required, C: inline MFA enrollment)
    - `auth-passkey.spec.ts` — updated selectors, still passes
12. **No regressions:** Existing passkey enrollment functionality
    preserved (WebAuthn ceremony logic extracted unchanged into
    `PasskeyEnrollmentSection.svelte`).

---

## Open Questions

**None.** All questions resolved per user clarification 2026-07-20:
1. **Dialog architecture:** ONE unified `AuthMethodsPromptDialog` with two
   inner components (passkey + MFA). Not two separate dialogs.
2. **Dismiss mechanism:** Unified — rename endpoint + DB column to
   `auth_method_enforcer`. Dismiss is for the DIALOG, not per-method.
3. **MFA dismissability:** MFA is ALWAYS dismissable in the dialog (when
   `passkey_required=false`). MFA is never mandatory at the dialog level.
   Real enforcement is per-route step-up (Surface C).
4. **`passkey_required=true`:** Passkey only, no dismiss, no MFA shown.
5. **Inline enrollment:** Option B — keep inline QR/verify inside
   `MfaEnrollmentSection.svelte`.

---

## Out of Scope

- Backend MFA login enforcement (blocking login for users without MFA
  factors) — this is a larger feature, separate plan.
- Refactoring `MfaManagement.svelte` profile enrollment dialog (separate
  component, not the enforcer dialog).
- Trademark symbols in internal code comments (not user-facing).
- Adding ™ to package.json dependency names (not user-facing).
- Step-up MFA (Surface C) — already implemented per root plan, not
  modified by this plan.
