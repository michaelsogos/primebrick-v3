# MFA/2FA Spike Notes — 2026-07-20

## Result: ALL APIs work statelessly with admin credentials ✓

Casdoor v3.118.0 (docker: `casbin/casdoor:3.118.0`)

## Tested APIs

### 1. POST /api/mfa/setup/initiate
- **Auth:** clientId/clientSecret query params (admin credentials)
- **Query params:** `owner`, `name` (the Casdoor user's org + username)
- **Form params:** `mfaType=app`
- **Response:**
```json
{
  "status": "ok",
  "data": {
    "enabled": false,
    "isPreferred": false,
    "mfaType": "app",
    "secret": "M7RNSM3TPTDTYIIXZAM3ZKJXW3PON4OX",
    "url": "otpauth://totp/ACME:acme/admin?algorithm=SHA1&digits=6&issuer=ACME&period=30&secret=...",
    "recoveryCodes": ["0769bf38-3e34-4a1e-9ad5-cb03daf66df6"],
    "mfaRememberInHours": 0
  }
}
```
- **IMPORTANT:** The QR code URL field is `data.url` (NOT `qr_code_url` or `qrCodeUrl`). Plan code sketches need correction.

### 2. POST /api/mfa/setup/verify
- **Auth:** clientId/clientSecret query params
- **Form params:** `mfaType=app`, `secret=<secret from initiate>`, `passcode=<TOTP code>`
- **Response:** `{"status":"ok","data":"OK"}`
- **No session cookie needed** — fully stateless.

### 3. POST /api/mfa/setup/enable
- **Auth:** clientId/clientSecret query params
- **Query params:** `owner`, `name`
- **Form params:** `mfaType=app`, `secret=<secret>`, `passcode=<fresh TOTP code>`, `recoveryCodes=<uuid from initiate>`
- **Response:** `{"status":"ok","data":"OK"}`
- **IMPORTANT:** The `enable` endpoint requires a **fresh `passcode`** (not just `secret + recoveryCodes` as the plan stated). The plan's code sketches need correction — `mfaSetupEnable` must pass `passcode` too.

### 4. POST /api/set-preferred-mfa
- **Auth:** clientId/clientSecret query params
- **Query params:** `owner`, `name`
- **Form params:** `mfaType=app`
- **Response:** `{"status":"ok","data":[{...all MFA factors with isPreferred flags...}]}`
- Works statelessly ✓

### 5. POST /api/delete-mfa
- **Auth:** clientId/clientSecret query params
- **Query params:** `owner`, `name`
- **Form params:** `mfaType=app`
- **Response:** `{"status":"ok","data":[{...all MFA factors, app now disabled...}]}`
- Works statelessly ✓

## Corrections to Plan

1. **`qr_code_url` → `url`**: Casdoor's initiate response uses `data.url`, not `data.qr_code_url`. The BE `casdoor-api-client.ts` method must map `data.url` → `qr_code_url` in the return value (or the MFA service must read `data.url`).

2. **`enable` requires `passcode`**: The plan's §13.2 code sketch shows `mfaSetupEnable(org, username, 'app', secret, recoveryCode)` — but the actual API also requires a `passcode` (fresh TOTP code). The method signature must be `mfaSetupEnable(org, username, mfaType, secret, passcode, recoveryCode)`. This means `enrollFinish` must generate a TOTP code from the secret + verify it with `mfaSetupVerify` first, then pass the SAME code (or a fresh one) to `mfaSetupEnable`.

3. **`verify` does NOT require `owner/name` query params**: The verify endpoint is fully self-contained with just `secret + passcode` in the form body. No need to pass owner/name.

4. **`initiate` response has `mfaRememberInHours`**: This is a Casdoor feature we don't use (we do per-action step-up, no remember window). Ignore this field.

## TOTP Code Generation

The spike used a manual TOTP implementation (RFC 6238) with Node's `crypto` module:
- Algorithm: SHA1
- Digits: 6
- Time step: 30 seconds
- Secret encoding: Base32

The BE should use a proper TOTP library (e.g., `otplib`) or the manual implementation. Since Casdoor does the actual verification, the BE only needs to generate a code during enrollment (to pass to `enable`). During login/step-up verification, Casdoor does the verification directly.
