# Feature Plan: Rich Passkey Display in Profile Page

## Status
DRAFT — awaiting user approval (keyword `PROCEED`).

## Objective
Replace the current "list of base64 credential IDs" in the profile page
`PasskeyEnrollment` component with a rich, human-readable passkey card per
enrolled credential. Each card must show:

1. **Authenticator-type icon** instead of a generic fingerprint
   (Windows Hello, Face ID / Touch ID, security key, etc.) — derived from
   `aaguid` via a static lookup table.
2. **A friendly name** instead of the raw base64 `credential_id`.
   - Use `label` if set by the user.
   - Else use an AAGUID-derived name (e.g. "Windows Hello", "Apple Face ID").
   - Else fall back to `auth.passkeys.unknownPasskey` + short index.
   - **Never** display the raw `credential_id` in the UI. It is not sensitive
     (WebAuthn credential IDs are public identifiers), but it is meaningless
     to users and leaks fingerprinting surface. Keep it only as the
     `data-credential-id` attribute for E2E tests and as the DELETE route
     parameter.
3. **Transport badge** below the name. Render the raw transport values
   (`internal`, `hybrid`, `usb`, `nfc`, `ble`) as small badges. Do NOT label
   `internal` as "this device" — platform authenticators can be synced
   (iCloud Keychain, Google Password Manager) and may live on another device.
4. **Created at** — full date + time (currently only date is shown).
5. **Last used at** — NEW field, requires BE tracking.
6. **Device name / model / OS** — NEW fields, captured at enrollment from
   `navigator.userAgent` + `navigator.platform` + `authenticatorAttachment`.
   WebAuthn itself does NOT expose device name/model/OS; these are best-effort
   inferences from the user agent string at enrollment time. Existing rows
   (enrolled before this feature) will have `null` and the UI shows
   `auth.passkeys.unknownDevice`.

## What is available today vs. what must be added

| Field | Source today | Action |
|---|---|---|
| `credential_id` | Casdoor + PG | Keep, hide from UI |
| `aaguid` | Casdoor + PG (returned by API, not rendered) | Render via FE AAGUID map |
| `transports` | Casdoor + PG (returned by API, not rendered) | Render as badges |
| `label` | PG column exists, `updateLabel()` DAL exists, never written | Add API + UI to set it (Phase 2) |
| `created_at` | PG (returned, rendered as date only) | Render as date + time |
| `last_used_at` | ❌ Not tracked | **ADD** — DB col + update on signin |
| `authenticator_attachment` | Sent by FE in attestation, dropped by BE | **ADD** — capture at signup |
| `user_agent` | ❌ Not captured | **ADD** — capture at signup |
| `os` | ❌ Not captured | **ADD** — parse from UA at signup |
| `device_model` | ❌ Not captured | **ADD** — parse from UA at signup |

Casdoor's `webauthnCredentials` array contains more fields from go-webauthn
(`AttestationType`, `Authenticator.SignCount`, `Flags.BackupEligible`,
`Flags.BackupState`, `Authenticator.Attachment`) but the BE deliberately
strips them (see `webauthn.service.ts:588` comment: *"go-webauthn Credential
has more fields; we only expose the safe ones"*). This plan does NOT change
that policy — we capture the extra info on our side at enrollment, not from
Casdoor's stored credential.

## Architecture

### Phase 1 — BE: schema + capture + expose (no UI label editing yet)

#### 1.1 DB schema changes — in-place init patch + fire-and-forget catch-up

Per `primebrick-v3-backend/AGENTS.md`:
> **Never create a new initial patch** — update the existing
> `00000000000000_init_database.sql` in place and create a fire-and-forget
> script to update the registry hash on existing databases.

We are in early-stage greenfield, so the init patch IS the source of truth
for fresh installs. Existing live DBs that already ran the init patch need
a fire-and-forget ALTER to catch up.

##### 1.1a — Edit the init patch in place
File: `primebrick-v3-backend/db-meta/patches/00000000000000_init_database.sql`

Modify the `user_passkeys` CREATE TABLE block (currently lines 196–210) to
add the new columns directly, and append the new COMMENT statements after
the existing ones (currently lines 216–220):

```sql
-- user_passkeys table
CREATE TABLE IF NOT EXISTS "public"."user_passkeys" (
  "id" bigint generated always as identity NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_profile_id" bigint NOT NULL,
  "credential_id" text NOT NULL,
  "aaguid" text,
  "transports" jsonb,
  "label" varchar(100),
  "last_used_at" timestamptz,
  "authenticator_attachment" text,
  "user_agent" text,
  "os" text,
  "device_model" text,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text,
  "version" integer DEFAULT 1,
  PRIMARY KEY ("id")
);

-- ... existing unique indexes / indexes unchanged ...

COMMENT ON COLUMN public.user_passkeys.last_used_at IS 'Last time this credential was used to sign in (null until first signin after this feature ships)';
COMMENT ON COLUMN public.user_passkeys.authenticator_attachment IS 'platform | cross-platform (WebAuthn AuthenticatorAttachment)';
COMMENT ON COLUMN public.user_passkeys.user_agent IS 'navigator.userAgent captured at enrollment (truncated to 512 chars)';
COMMENT ON COLUMN public.user_passkeys.os IS 'OS inferred from UA at enrollment (e.g. Windows, macOS, iOS, Android, Linux)';
COMMENT ON COLUMN public.user_passkeys.device_model IS 'Device model inferred from UA at enrollment (e.g. "Windows PC", "Mac", "iPhone", "Pixel")';
```

Because the init patch file content changes, its SHA256 in
`public.primebrick_database_patches` will no longer match. Existing live
DBs that already recorded the old hash need a fire-and-forget update (see 1.1c).

##### 1.1b — Fire-and-forget catch-up ALTER for existing live DBs
New file: `primebrick-v3-backend/db-meta/fire-and-forget/add_user_passkeys_rich_metadata.sql`

```sql
-- Fire-and-forget: add rich metadata columns to user_passkeys on live DBs
-- that already ran the init patch before this feature shipped.
-- Idempotent via IF NOT EXISTS. Safe to re-run.

ALTER TABLE "public"."user_passkeys"
  ADD COLUMN IF NOT EXISTS "last_used_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "authenticator_attachment" text,
  ADD COLUMN IF NOT EXISTS "user_agent" text,
  ADD COLUMN IF NOT EXISTS "os" text,
  ADD COLUMN IF NOT EXISTS "device_model" text;

COMMENT ON COLUMN public.user_passkeys.last_used_at IS 'Last time this credential was used to sign in (null until first signin after this feature ships)';
COMMENT ON COLUMN public.user_passkeys.authenticator_attachment IS 'platform | cross-platform (WebAuthn AuthenticatorAttachment)';
COMMENT ON COLUMN public.user_passkeys.user_agent IS 'navigator.userAgent captured at enrollment (truncated to 512 chars)';
COMMENT ON COLUMN public.user_passkeys.os IS 'OS inferred from UA at enrollment (e.g. Windows, macOS, iOS, Android, Linux)';
COMMENT ON COLUMN public.user_passkeys.device_model IS 'Device model inferred from UA at enrollment (e.g. "Windows PC", "Mac", "iPhone", "Pixel")';
```

This mirrors the existing `db-meta/fire-and-forget/update_init_patch_sha256.sql`
pattern (idempotent, safe to re-run, no patch_id registration).

##### 1.1c — Update init patch SHA256 in the registry on existing DBs
The init patch file content changed, so its `content_sha256` in
`public.primebrick_database_patches` is now stale on every live DB. Follow
`.devin/rules/patch-sha256-management.md`:

- Append a new UPDATE statement to the existing fire-and-forget file
  `db-meta/fire-and-forget/update_init_patch_sha256.sql` that recomputes
  and sets `content_sha256` for `patch_id = '00000000000000_init_database'`
  to the new SHA256 of the patched init file.
- Do NOT create a second `update_init_patch_sha256.sql` — extend the
  existing one (it is already idempotent and accumulates updates).

##### 1.1d — Refresh snapshots
Run `pnpm run db:meta:compare` to refresh `db-meta/snapshots/*.json` and
regenerate `db-meta/diff-entities-vs-database.json`. After this, the diff
should show no drift. If `renameHeuristicUserReviewRequired: true` appears
in the diff, ask the user before applying heuristic renames (per AGENTS.md).

#### 1.2 Entity
Update `primebrick-v3-backend/src/modules/auth/user_passkey_entity.ts`:

```ts
@Column({ nullable: true })
last_used_at?: Date;

@Column({ length: 32, nullable: true })
authenticator_attachment?: string; // "platform" | "cross-platform"

@Column({ length: 512, nullable: true })
user_agent?: string;

@Column({ length: 64, nullable: true })
os?: string;

@Column({ length: 128, nullable: true })
device_model?: string;
```

#### 1.3 DAL
Update `primebrick-v3-backend/src/modules/auth/user-passkeys-dal.ts`:

- Extend `create()` input with `last_used_at?`, `authenticator_attachment?`,
  `user_agent?`, `os?`, `device_model?`.
- Add `updateLastUsed(credentialId: string, when: Date): Promise<void>` —
  used by `signinFinish` to bump `last_used_at` on each successful signin.

#### 1.4 UA parser
Add a tiny UA parser helper in `primebrick-v3-backend/src/modules/auth/utils/ua-parser.ts`
(no new dep — keep it dependency-free, ~40 lines, regex-based, returns
`{ os, device_model }`). Cover the common cases: Windows, macOS, iOS,
Android, Linux, ChromeOS. Unknown → `{ os: undefined, device_model: undefined }`.
Per data-model-conventions rule, unknown stays `undefined`, never a fake
default.

#### 1.5 Service — capture at signup
Update `WebauthnService.signupFinish()` in
`primebrick-v3-backend/src/modules/auth/services/webauthn.service.ts`:

- Accept new params: `userAgent: string`, `authenticatorAttachment?: string`.
- Parse `os` / `device_model` via the new helper.
- Pass them into `passkeysDal.create({ ..., user_agent, os, device_model, authenticator_attachment })`.

Update `auth-webauthn.router.ts` `signupFinish` handler to forward
`req.get("user-agent")` and `req.body.authenticator_attachment` to the
service. The FE already sends `authenticatorAttachment` in the encoded
credential (see `codec.ts:168`) — we just plumb it through.

#### 1.6 Service — bump last_used_at at signin
Update `WebauthnService.signinFinish()`:

- After successful token exchange, extract `credential.id` from the
  serialized `PublicKeyCredential` (the FE already sends it).
- Call `passkeysDal.updateLastUsed(credentialId, new Date())`.
- Best-effort: wrap in try/catch, log on error, do not fail the signin.
  Mirrors the existing `syncPasskeys` best-effort pattern at line 367.

#### 1.7 Service — expose in listCredentials
Update `WebauthnService.listCredentials()` to also return the new PG fields:

```ts
return creds.map((c) => {
  const pg = pgLabels.get(c.id);
  return {
    id: c.id,
    aaguid: c.aaguid,
    transports: c.transports,
    label: pg?.label ?? null,
    created_at: pg?.created_at,
    last_used_at: pg?.last_used_at,
    authenticator_attachment: pg?.authenticator_attachment,
    user_agent: pg?.user_agent,
    os: pg?.os,
    device_model: pg?.device_model,
  };
});
```

The `pgLabels` Map (rename to `pgMeta`) must be widened to carry the new
fields. All field names stay `snake_case` per the data-model-conventions rule.

#### 1.8 API contract
`GET /api/v1/auth/webauthn/credentials` response shape becomes:

```json
{
  "success": true,
  "credentials": [
    {
      "id": "<base64url — hidden in UI>",
      "aaguid": "08987058-cadc-4b81-b6e1-30de50dcbe96",
      "transports": ["internal"],
      "label": null,
      "created_at": "2026-07-20T10:30:00.000Z",
      "last_used_at": "2026-07-25T08:15:00.000Z",
      "authenticator_attachment": "platform",
      "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
      "os": "Windows",
      "device_model": "Windows PC"
    }
  ]
}
```

### Phase 2 — FE: AAGUID map + UI redesign

#### 2.1 AAGUID → icon + name map
New file `primebrick-fe-v3/src/lib/webauthn/aaguid-registry.ts`:

```ts
import Laptop from "@lucide/svelte/icons/laptop";
import ScanFace from "@lucide/svelte/icons/scan-face";
import Fingerprint from "@lucide/svelte/icons/fingerprint";
import Usb from "@lucide/svelte/icons/usb";
import Smartphone from "@lucide/svelte/icons/smartphone";
import KeyRound from "@lucide/svelte/icons/key-round";

export interface AaguidInfo {
  name: string;        // "Windows Hello"
  icon: typeof Fingerprint;
}

const REGISTRY: Record<string, AaguidInfo> = {
  "08987058-cadc-4b81-b6e1-30de50dcbe96": { name: "Windows Hello", icon: Laptop },
  "ea9b8d66-4d01-1d21-3ce4-bd4e69ec2c8b": { name: "Mac Touch ID", icon: ScanFace },
  "dd4ec6f2-4faf-4ef4-b1c9-8b9e3c8e3a3a": { name: "Apple Passkey", icon: ScanFace },
  // Google Password Manager, 1Password, Dashlane, YubiKey 5C/Nano, etc.
  // Source: https://github.com/passkeydeveloper/passkey-authenticator-aaguids
};

export function lookupAaguid(aaguid?: string): AaguidInfo {
  if (aaguid && REGISTRY[aaguid.toLowerCase()]) return REGISTRY[aaguid.toLowerCase()];
  return { name: "", icon: Fingerprint };
}
```

Bundle ~15–20 well-known AAGUIDs. Unknown AAGUIDs fall back to
`Fingerprint` + empty name (UI then uses `label` or `unknownPasskey`).

**Icon verification**: per the FE `.windsurfrules`, verify each Lucide icon
name on https://lucide.dev/icons/ before using. Candidates to verify:
`laptop`, `scan-face`, `fingerprint`, `usb`, `smartphone`, `key-round`.

#### 2.2 Transport badges
New file `primebrick-fe-v3/src/lib/webauthn/transports.ts` exporting a
`transportLabel(value: string): string` helper that returns a stable i18n
key suffix per transport (`internal`, `hybrid`, `usb`, `nfc`, `ble`). The
component renders each as a small `Badge` with translated label. No
"this device" claim anywhere.

#### 2.3 Component redesign
Rewrite `primebrick-fe-v3/src/lib/components/auth/PasskeyEnrollment.svelte`
list section (lines 184–223). New card per credential:

```
┌──────────────────────────────────────────────┐
│ [Icon]  Windows Hello                        │
│        Enrolled Jul 20, 2026 10:30 AM        │
│        Last used Jul 25, 2026 08:15 AM       │
│        [internal] [hybrid]                   │
│        Windows · Windows PC                  │
│                                  [trash]     │
└──────────────────────────────────────────────┘
```

Rules:
- Icon = `lookupAaguid(cred.aaguid).icon`.
- Title = `cred.label ?? lookupAaguid(cred.aaguid).name ?? $t("auth.passkeys.unknownPasskey")`.
- `data-credential-id={cred.id}` stays on the `<li>` for E2E.
- The raw `cred.id` is NEVER rendered as visible text.
- `created_at` and `last_used_at` rendered with `toLocaleString()` (date +
  time). If `last_used_at` is null, show `$t("auth.passkeys.neverUsed")`.
- Transports rendered as `Badge` components, only if `cred.transports` is
  non-empty.
- Device line: `[os] · [device_model]` — only rendered if at least one of
  `os` / `device_model` is non-null. If both null (legacy row), render
  `$t("auth.passkeys.unknownDevice")` in muted text.
- All Svelte 5 runes rules from `AGENTS.md` apply (`$state`, `$derived`,
  no `state_referenced_locally`).
- Pass the new component code through the `svelte` MCP autofixer before
  saving (per FE `AGENTS.md` rule 7).

#### 2.4 Type update
Update `WebauthnCredentialInfo` interface in `PasskeyEnrollment.svelte`
(lines 18–24) to include the new fields:

```ts
interface WebauthnCredentialInfo {
  id: string;
  aaguid?: string;
  transports?: string[];
  label?: string | null;
  created_at?: string;
  last_used_at?: string;
  authenticator_attachment?: string;
  user_agent?: string;
  os?: string;
  device_model?: string;
}
```

#### 2.5 i18n keys
Add to all six locale files (`en-GB`, `it-IT`, `pt-PT`, `fr-FR`, `es-ES`,
`de-DE`) under `auth.passkeys`:

- `unknownPasskey` — "Passkey" / "Passkey" / etc.
- `neverUsed` — "Never used" / "Mai usato" / etc.
- `unknownDevice` — "Unknown device" / "Dispositivo sconosciuto" / etc.
- `transport.internal` — "Internal" / "Interno" / etc.
- `transport.hybrid` — "Hybrid" / "Ibrido" / etc.
- `transport.usb` — "USB" / "USB" / etc.
- `transport.nfc` — "NFC" / "NFC" / etc.
- `transport.ble` — "Bluetooth" / "Bluetooth" / etc.
- `enrolledOn` — "Enrolled {date}" / "Registrato il {date}" / etc.
- `lastUsed` — "Last used {date}" / "Ultimo uso {date}" / etc.

Per `.devin/rules/translation-key-convention.md`, all keys are
`snake_case singular` (the `transport.internal` etc. are nested but each
segment is singular snake_case).

### Phase 3 (optional, deferred) — User-editable label
The `label` column and `UserPasskeysDal.updateLabel()` already exist. A
follow-up plan can add:
- `PATCH /api/v1/auth/webauthn/credentials/:id` accepting `{ label }`.
- An "Edit name" pencil button in the card.
This is NOT in scope for this plan — keep Phase 1+2 focused on display.

## Impacted files

### BE (`primebrick-v3-backend`)
- `db-meta/patches/00000000000000_init_database.sql` — MODIFY in place (add 5 columns + COMMENTs to the `user_passkeys` block)
- `db-meta/fire-and-forget/add_user_passkeys_rich_metadata.sql` — NEW (idempotent ALTER for existing live DBs)
- `db-meta/fire-and-forget/update_init_patch_sha256.sql` — MODIFY (append UPDATE for the new init patch SHA256)
- `src/modules/auth/user_passkey_entity.ts` — MODIFY (5 new columns)
- `src/modules/auth/user-passkeys-dal.ts` — MODIFY (extend `create`, add `updateLastUsed`)
- `src/modules/auth/utils/ua-parser.ts` — NEW
- `src/modules/auth/services/webauthn.service.ts` — MODIFY (signupFinish capture, signinFinish bump, listCredentials expose)
- `src/modules/auth/routers/auth-webauthn.router.ts` — MODIFY (forward UA + attachment)
- `src/modules/auth/__tests__/user-passkeys-dal.test.ts` — MODIFY (cover new fields + `updateLastUsed`)

### FE (`primebrick-fe-v3`)
- `src/lib/webauthn/aaguid-registry.ts` — NEW
- `src/lib/webauthn/transports.ts` — NEW
- `src/lib/components/auth/PasskeyEnrollment.svelte` — MODIFY (UI redesign + type widening)
- `src/lib/i18n/messages/{en-GB,it-IT,pt-PT,fr-FR,es-ES,de-DE}.json` — MODIFY (new keys)

### Docs
- `primebrick-v3-docs/pages/frontend/guide/components/passkey-enrollment.mdx` — refresh via `make-docs` skill after the FE changes land.

## Security considerations

- **Credential ID exposure**: today the raw base64url `credential_id` is
  rendered in the DOM. WebAuthn credential IDs are public (they are sent
  in the clear during authentication ceremonies), so this is not a secret
  leak — but it is unnecessary fingerprinting surface and bad UX. This plan
  removes it from the visible UI while keeping it as a `data-*` attribute
  for E2E and as the DELETE route param.
- **User-agent storage**: `navigator.userAgent` can contain device-identifying
  info. It is stored in PG `user_passkeys.user_agent` (truncated to 512
  chars) and returned only to the owning user via
  `/api/v1/auth/webauthn/credentials` (which is `AUTHENTICATED_USER` scoped
  to the caller's own credentials). Not exposed to admins or other users.
- **No new external deps**: the UA parser is a small in-repo regex helper,
  not a third-party package. Avoids supply-chain risk per the package
  versioning rule.
- **AAGUID registry**: bundled static map of ~20 well-known AAGUIDs. No
  runtime fetch from a CDN (offline support + no third-party dependency).

## Acceptance criteria

1. **Fresh install**: `pnpm run db:migrate` on an empty DB creates
   `user_passkeys` with all 5 new columns via the updated init patch.
   **Existing live DB**: running the fire-and-forget
   `add_user_passkeys_rich_metadata.sql` adds the 5 columns idempotently,
   and `update_init_patch_sha256.sql` reconciles the init patch SHA256 in
   the registry so subsequent `db:migrate` runs skip the init patch cleanly
   (no "exists in registry with a different content_sha256" error).
   `pnpm run db:meta:compare` shows no drift afterwards.
2. `pnpm run check` (FE) and `pnpm run build` (BE) pass with zero new
   errors/warnings.
3. `pnpm test` (BE) — existing `user-passkeys-dal.test.ts` still passes
   and new cases for `updateLastUsed` and the new `create` fields pass.
4. Enrolling a new passkey on Windows Hello shows:
   - The Windows Hello icon (Laptop) instead of the generic fingerprint.
   - The title "Windows Hello" (no raw credential ID visible).
   - Transport badge `internal`.
   - `Enrolled <now>` with full date + time.
   - `Last used: Never used` (just enrolled).
   - `Windows · Windows PC` device line.
5. Signing in with that passkey, then reloading the profile page, shows
   `Last used <signin time>` updated.
6. A pre-existing passkey (enrolled before the migration) shows:
   - Generic fingerprint icon (AAGUID may or may not be present in PG —
     `syncPasskeys` backfills `aaguid` from Casdoor on next signin).
   - `Last used: Never used` (we cannot retroactively reconstruct it).
   - `Unknown device` for the device line (UA was not captured).
7. Raw `credential_id` is NOT visible anywhere in the rendered DOM text,
   but `data-credential-id` is still present on the `<li>` for E2E.
8. E2E `auth-passkey.spec.ts` still passes (the `data-testid` attributes
   `passkey-enrollment-item`, `passkey-enrollment-delete-button`,
   `passkey-enrollment-list`, `passkey-enrollment-empty`,
   `passkey-enrollment-add-button` are preserved).
9. All six locale files contain the new keys with proper translations
   (no English fallback in non-English locales).
10. `svelte` MCP autofixer reports zero issues on the redesigned
    `PasskeyEnrollment.svelte`.

## Out of scope

- User-editable label (Phase 3, separate plan).
- Admin-level passkey visibility (RBAC for viewing other users' passkeys).
- Capturing device info at signin time (only at enrollment — signin
  device may differ from enrollment device, but tracking every signin
  device would balloon the schema; `last_used_at` is enough for v1).
- AAGUID registry auto-update from the upstream GitHub repo (static map
  is enough for v1; can be refreshed manually in future releases).
