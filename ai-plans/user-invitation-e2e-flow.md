# User Invitation End-to-End — Test & Refinement Plan

**Status**: 🆕 NEW — scope definition
**Created**: 2026-XX (record-sheet session-3 spin-off)
**Trigger**: user requested — "piano di test e refinement del flow USER
INVITATION End-to-End, dalla creazione e invito al completamento
dell'onboarding"

## Goal

Empirically test and refine the complete user-invitation lifecycle:

```
admin creates user → user_invitations row (PENDING) → invite email
  → user proves email via OTP (OTP_SENT) → sets password + completes
  onboarding (COMPLETED, completed_at) → login
```

…covering edge cases: token expiry (EXPIRED), admin revoke (REVOKED),
OTP attempts cap (10), resend.

## Existing surface (verified)

- `user_invitations` entity (`user_invitation_entity.ts`) — full state
  machine: `status` PENDING|OTP_SENT|COMPLETED|EXPIRED|REVOKED,
  `user_profile_uuid` FK, `token_hash` (raw token never stored, sent
  via email URL fragment), `expires_at`, `completed_at`, `otp_hash`,
  `otp_expires_at` (5min), `otp_attempts` (max 10), `otp_verified_at`.
  `Auditable` mixin → `created_by` = **the inviter**.
- Router: `auth-invitation.router.ts`; wiring in `auth/wiring.ts`.
- Onboarding flag: `user_profile.onboarding_completed` (boolean,
  immutable — `user-profiles.meta.ts:36`).

## Gaps identified (session-3)

1. **`onboarded_at` on `user_profile`** — when the user completed
   onboarding. Data exists: `user_invitations.completed_at`. Needs
   projection onto `user_profile`.
2. **`invited_by` on `user_profile`** — which admin invited the user.
   Data exists: `user_invitations.created_by` (Auditable). Needs
   projection as `ref` to `user_profile`.
   - Projection options: (a) physical columns written by the
     invitation service at COMPLETED (denormalized — sortable/
     filterable/audited like normal fields); (b) `kind:"calculated"`/
     `"virtual"` resolving the latest invitation row. Decide during
     implementation — (a) is simpler and gives audit+filter for free.
3. **IANA question** — if `onboarded_at` is a user-facing datetime it
   follows the `datetime_iana` conventions (record tz vs browser).
4. **Invitation-flow E2E** — no persistent spec covers the lifecycle:
   create-with-invite → OTP → password set → first login →
   `onboarding_completed` flips → `completed_at` set. Existing
   `e2e/helpers/test-users.ts` mints actors — check what it already
   drives.
5. **`user_invitations` entity exposure** — is there a list/meta page
   for invitations (admin sees pending/expired invitations, resend/
   revoke CTAs)? Verify current surface; the flow test may pin it.

## Related / sequencing

- `user_profile` custom pages (create/profile/update) migrate to
  standard LAST (umbrella task 18 — after CRM+JH POC). This plan does
  NOT migrate them; it tests/refines the invitation lifecycle and adds
  the onboarding projection fields.
- Overlaps with `user-profile-field-lifecycle.md` (deferred) — this
  plan covers ONLY the invitation scope; the field-lifecycle
  verification stays parked until the POC pair closes.

## Open questions for implementation

- `onboarded_at` vs `invited_at`: the user also asked "quale utente ha
  completato l'onboarding" — `completed_at`+`onboarding_completed`
  answer it; `invited_by` = `user_invitations.created_by`.
- Resend/revoke CTAs — exist already? Surface them on the invitations
  list if present.
- Email delivery in E2E: fake Brevo pattern already used by dict spec —
  reuse.
