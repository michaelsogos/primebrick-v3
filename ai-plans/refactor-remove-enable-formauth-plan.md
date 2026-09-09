# Plan: Remove `enable_formauth` — Form Auth is an Invariant, Not a Setting

**Status:** DRAFT — awaiting user approval
**Date:** 2026-08-26
**Type:** Refactor / Debt management
**Repos impacted:** primebrick-be-v3, primebrick-fe-v3, primebrick-v3-sdk, primebrick-us-v3, primebrick-v3-docs

---

## 1. Objective

Remove the `enable_formauth` configuration toggle from the entire Primebrick stack.
Form (username/password) authentication is an **invariant** of the system, not an
optional feature. It MUST always be available so that:

1. Users who lose their passkey device can still log in with username/password.
2. Users who change device can log in and re-enroll a new passkey or MFA factor.
3. Admins can always recover access in emergencies (e.g. WebAuthn/IDP outage).
4. MFA enrollment (which requires an authenticated session) is always reachable.

Passkeys (`enable_webauthn`) and MFA (`enable_mfa`) remain toggleable — they are
*additional* auth methods layered on top of the always-on form login.

The user confirmed: **complete removal** of the field across all layers, and
**hide completely** from the admin config UI (no read-only row).

---

## 2. Empirical evidence — current state

### 2.1 Where `enable_formauth` is defined and consumed

| Layer | File | Lines | Role |
|-------|------|-------|------|
| DB seed | `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql` | 535 | Seeds row `('enable_formauth', 'true', 'boolean', ...)` |
| DB meta patch | `primebrick-be-v3/db-meta/fire-and-forget/add_config_table_standard_columns.sql` | 104-108 | Sets `label_key`/`description_key` for the row |
| BE config type | `primebrick-be-v3/src/modules/auth/config-repo.ts` | 29 | `AuthConfigDb.enable_formauth: boolean` |
| BE loader | `primebrick-be-v3/src/modules/auth/config-repo.ts` | 151, 162-166, 172 | Parses string→bool; "at least one method" validation; returns |
| BE→SDK port | `primebrick-be-v3/src/modules/auth/sdk-auth-ports.ts` | 74 | `enable_formauth: db.enable_formauth` |
| BE public endpoint | `primebrick-be-v3/src/modules/auth/routers/auth-session.router.ts` | 190 | `GET /api/v1/auth/config` returns it |
| BE setup script | `primebrick-be-v3/scripts/setup-casdoor.ts` | 339 | Sets it to "true" |
| BE tests | `mfa-service.test.ts` (71,110), `user-service-change-password.test.ts` (52), `rbac-admin-gate.test.ts` (16) | mock configs |
| SDK type | `primebrick-v3-sdk/src/auth/types.ts` | 113-118 | `AuthConfig.enable_formauth: boolean` + doc comment |
| SDK extracted docs | `primebrick-v3-sdk/docs/user-guide/_extracted/api.json` | 8285, 8297, 23458 | TypeDoc output (regenerated) |
| FE store | `primebrick-fe-v3/src/lib/auth-config-store.svelte.ts` | 17, 50-51 | `AuthConfigPublic.enable_formauth` + getter |
| FE enforcer | `primebrick-fe-v3/src/lib/auth-enforcer-store.svelte.ts` | (reads config) | `shouldShowEnforcer` uses `config.enable_webauthn` / `config.enable_mfa` — does NOT read `enable_formauth` |
| FE LoginForm | `primebrick-fe-v3/src/lib/components/auth/LoginForm.svelte` | 26, 142, 187 | Conditional render of username/password form |
| FE i18n | 6 message files (en-GB, it-IT, pt-PT, de-DE, es-ES, fr-FR) | 326/337 | `config.auth.enable_formauth.label` + `.description` |
| FE e2e helper | `primebrick-fe-v3/src/e2e/helpers/admin-login.ts` | 29 | Comment referencing the flag |
| US adapters | `primebrick-us-v3/emailsender/src/adapters/auth-ports-adapter.ts` (64), `primebrick-us-v3/ai/src/adapters/auth-ports-adapter.ts` (56) | hardcoded `false` placeholder |
| Docs | `primebrick-be-v3/docs/user-guide/authentication.mdx` (45), `primebrick-fe-v3/docs/user-guide/components/login-form.mdx` (14,66), `primebrick-v3-docs/pages/frontend/guide/components/login-form.mdx` (13,65) | user-facing docs |
| AI plans | 4 files in `primebrick-workspace/ai-plans/` | historical references (NOT edited — they are immutable history) |

### 2.2 Critical finding — BE login does NOT check `enable_formauth`

The BE login service (`auth-session.service.ts` lines 95-185) performs the Casdoor
password grant **unconditionally** — it never reads `cfg.enable_formauth`. So the
flag is **only** a UI toggle on the FE (LoginForm hides the form when false) and a
startup-validation input. There is no BE-side enforcement that would 503 the
login endpoint when form auth is "disabled". This means:

- Today, if `enable_formauth=false` and `enable_webauthn=true`, the FE hides the
  form but the BE still accepts password logins via API. A user who knows the
  endpoint can still log in — the flag is purely cosmetic on the BE side.
- The SDK type doc comment (line 113) claims "the BE login endpoint returns 503"
  when false — this is **inaccurate**; no such check exists.

### 2.3 The "at least one method" validation (config-repo.ts 162-166)

```ts
if (!enableWebauthn && !enableFormauth) {
  throw new Error(
    "[auth] At least one authentication method must be enabled: set 'enable_formauth' or 'enable_webauthn' to 'true' in auth_configurations table.",
  );
}
```

This is a startup-time check in `loadAuthConfigFromDb`. If form auth becomes an
invariant (always on), this check is trivially satisfied and becomes dead code.
**Decision (per user):** the user asked to check what happens with the enforcer
dialogs and password/passkey/MFA flow before deciding. Findings:

- **Passkey enforcer** (`auth-enforcer-store.ts` `shouldShowEnforcer`): reads
  `config.enable_webauthn`, `config.enable_mfa`, `config.passkey_required`. It
  does NOT read `enable_formauth`. Form auth being always-on does not affect the
  enforcer logic — the enforcer only prompts for *additional* methods (passkey/MFA)
  when the user has neither.
- **MFA challenge** (`MfaChallenge.svelte`): triggered by the login response
  (`mfa_required: true`), independent of `enable_formauth`.
- **Password login flow**: unaffected — the BE never checked the flag anyway.

**Conclusion:** removing `enable_formauth` has zero impact on the enforcer/MFA/
passkey flows. The "at least one method" validation should be **removed entirely**
because form auth is now guaranteed always-on by construction (the field no longer
exists to be set false).

---

## 3. Architectural changes

### 3.1 Principle

Form auth is removed as a *configurable* concept. It is not replaced by a hardcoded
`true` flag flowing through the layers — it is **deleted**. The LoginForm always
renders the username/password form unconditionally. The BE login endpoint already
accepts password logins unconditionally (no change needed there).

### 3.2 SDK (`primebrick-v3-sdk`) — published type change

- Remove `enable_formauth: boolean` from `AuthConfig` in `src/auth/types.ts`
  (lines 111-118, including the doc comment block).
- This is a **breaking change** to the published SDK type. Consumers (BE, US) must
  be updated in the same release cycle. Per GitFlow, this ships via a release
  branch merge to `main` + tag — no auto-deploy CI on BE/FE/US, so coordination
  is manual (SDK must be version-bumped + published before BE/FE/US rebuild).
- Regenerate `docs/user-guide/_extracted/api.json` via `pnpm extract-docs`.

### 3.3 Backend (`primebrick-be-v3`)

- `config-repo.ts`:
  - Remove `enable_formauth: boolean` from `AuthConfigDb` (line 29).
  - Remove `const enableFormauth = ...` (line 151).
  - Remove the "at least one method" validation block (lines 162-166).
  - Remove `enable_formauth: enableFormauth` from the return object (line 172).
  - Update the comment block (lines 144-149) to drop the `enable_formauth` mention.
- `sdk-auth-ports.ts`: remove `enable_formauth: db.enable_formauth` (line 74).
- `auth-session.router.ts`: remove `enable_formauth: cfg.enable_formauth` from the
  `GET /api/v1/auth/config` response (line 190). Update the doc comment (line 7).
- `scripts/setup-casdoor.ts`: remove the `updateAuthConfig(..., "enable_formauth", ...)`
  call (line 339).
- Tests: remove `enable_formauth: true` from mock configs in
  `mfa-service.test.ts`, `user-service-change-password.test.ts`,
  `rbac-admin-gate.test.ts`.
- DB patches (per `.devin/rules/patch-sha256-management.md` — never create a new
  initial patch, update in place + fire-and-forget):
  - `db-meta/patches/00000000000000_init_database.sql`: remove the
    `('enable_formauth', 'true', ...)` seed row (line 535). Update the patch
    in place.
  - `db-meta/fire-and-forget/add_config_table_standard_columns.sql`: remove the
    UPDATE block for `enable_formauth` (lines 104-108).
  - Create a NEW fire-and-forget script
    `db-meta/fire-and-forget/remove_enable_formauth_config_row.sql` that:
    1. Soft-deletes (or hard-deletes, per `reserved` policy — to confirm with user
       in step 5) the `enable_formauth` row from `auth_configurations`.
    2. Updates the SHA256 hash of the initial patch in
       `primebrick_database_patches` registry (since the initial patch content
       changed).
  - Run `pnpm run db:meta:compare` then `pnpm run db:migrate` to validate.

### 3.4 Frontend (`primebrick-fe-v3`)

- `auth-config-store.svelte.ts`:
  - Remove `enable_formauth: boolean` from `AuthConfigPublic` (line 17).
  - Remove the `enable_formauth` getter (lines 50-52).
- `LoginForm.svelte`:
  - Remove `const enableFormauth = $derived(...)` (line 26).
  - Remove the `{:else if enableFormauth}` conditional (line 142) — the form
    fields render unconditionally (only gated by `mfaChallenge`).
  - Remove the `{#if enableFormauth}` wrapper around the "or" divider (line 187)
    — since the form is always shown, the divider always shows when webauthn is
    available.
- i18n: remove the `enable_formauth` key block from all 6 message files
  (`en-GB.json`, `it-IT.json`, `pt-PT.json`, `de-DE.json`, `es-ES.json`, `fr-FR.json`).
- `src/e2e/helpers/admin-login.ts`: update the comment (line 29) — the username
  input is now always visible, no longer gated by the flag.
- Run `pnpm run check` to verify type safety (the store type change will surface
  any remaining references).

### 3.5 Microservices (`primebrick-us-v3`)

- `emailsender/src/adapters/auth-ports-adapter.ts`: remove
  `enable_formauth: false` (line 64). Update the comment block (lines 60-62).
- `ai/src/adapters/auth-ports-adapter.ts`: same removal (line 56).

### 3.6 Docs

- `primebrick-be-v3/docs/user-guide/authentication.mdx`: remove `enable_formauth`
  from the `/api/v1/auth/config` response description (line 45).
- `primebrick-fe-v3/docs/user-guide/components/login-form.mdx`: remove references
  to `enable_formauth` (lines 14, 66). Update the behavior section — the form is
  always rendered.
- `primebrick-v3-docs/pages/frontend/guide/components/login-form.mdx`: same edits
  (lines 13, 65).
- `primebrick-v3-sdk/docs/user-guide/_extracted/api.json`: regenerated by
  `pnpm extract-docs` (do NOT hand-edit).

### 3.7 AI plans (DO NOT EDIT)

The 4 files in `primebrick-workspace/ai-plans/` that reference `enable_formauth`
are **historical planning documents**. They are immutable history and MUST NOT be
edited. The grep results are listed here for traceability only:
- `feature-security-config-list-page-plan.md`
- `feature-auth-config-standard-typed-config-loader-plan.md`
- `feature-mfa-2fa-plan.md`
- `onboarding-passkey-enrollment-plan.md`

---

## 4. Execution order (cross-repo coordination)

Because the SDK is a published npm package consumed by BE and US, the order matters:

1. **SDK** — remove the field from `AuthConfig`, bump version, build, publish.
   (Per GitFlow: release branch → close → merge to `main` + tag → CI publishes.)
2. **BE** — update `package.json` to the new SDK version, remove all BE usages,
   update DB patches + fire-and-forget, run `db:meta:compare` + `db:migrate`,
   run tests. (Per GitFlow: release branch → close → merge to `main` + tag.)
3. **US** — update `package.json` to the new SDK version, remove the two adapter
   placeholders. (Per GitFlow: release branch → close → merge to `main` + tag.)
4. **FE** — remove store field, LoginForm conditional, i18n keys, e2e comment.
   Run `pnpm run check`. (Per GitFlow: release branch → close → merge to `main` + tag.)
5. **Docs** — update user-guide MDX files, regenerate SDK extracted api.json.

> **Note:** Steps 1-4 can be developed in parallel on feature branches, but must
> be released in the order above so that BE/US/FE consume a published SDK version
> that no longer has the field. If developing locally, update the SDK via
> `pnpm link` or a local tarball to test the full chain before publishing.

---

## 5. Open questions for user (to confirm before PROCEED)

1. **DB row deletion strategy**: The `enable_formauth` row in
   `auth_configurations` is currently seeded with `reserved=true` (system-critical,
   editable but not deletable via the API). The fire-and-forget removal script
   should:
   - (a) Hard-delete the row (`DELETE FROM auth_configurations WHERE key='enable_formauth'`), OR
   - (b) Soft-delete it (`UPDATE ... SET deleted_at = NOW()`) to preserve audit history?
   - **Recommendation:** (b) soft-delete, to preserve audit trail per the
     `@DeletableField()` convention on the table. Confirm.

2. **SDK version bump**: removing a field from a published interface is a breaking
   change. Should the SDK version bump be:
   - (a) Minor (e.g. 3.x.0 → 3.(x+1).0) with a note that `enable_formauth` was removed, OR
   - (b) Major (e.g. 3.x → 4.0)?
   - **Recommendation:** (a) minor — the field was never enforced BE-side, so
     real-world breakage is limited to consumers that read it (only the FE, which
     is updated in the same cycle). Confirm.

3. **Commit granularity**: should this be one commit per repo (5 commits across
   the 5 repos), or one commit per logical layer (SDK, BE, FE, US, docs)?
   - **Recommendation:** one commit per repo, each with a clear message
     "Remove enable_formauth config — form auth is an invariant". Confirm.

---

## 6. Acceptance criteria

- [ ] `grep -r "enable_formauth" primebrick-be-v3/src primebrick-fe-v3/src primebrick-v3-sdk/src primebrick-us-v3` returns **zero** matches in source code (excluding `ai-plans/` history and `node_modules`).
- [ ] `grep -r "enable_formauth" primebrick-be-v3/db-meta primebrick-fe-v3/src/lib/i18n` returns **zero** matches.
- [ ] BE: `pnpm run build` succeeds; `pnpm test` passes (mock configs updated).
- [ ] BE: `pnpm run db:meta:compare` reports no drift; `pnpm run db:migrate` applies the fire-and-forget removal cleanly.
- [ ] FE: `pnpm run check` succeeds (no type errors from the removed store field).
- [ ] FE: LoginForm renders the username/password form unconditionally (verified manually or via e2e).
- [ ] SDK: `pnpm run build` succeeds; `pnpm extract-docs` regenerates `api.json` without `enable_formauth`.
- [ ] US: `pnpm run build` succeeds for both `emailsender` and `ai` microservices.
- [ ] Docs: no user-guide MDX file mentions `enable_formauth`.
- [ ] The `GET /api/v1/auth/config` response no longer includes `enable_formauth` (verified via curl or test).
- [ ] Login with username/password still works (manual smoke test against a running BE).
- [ ] Passkey enrollment + MFA enrollment flows still work (manual smoke test — they never depended on `enable_formauth`).

---

## 7. Risk analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SDK breaking change breaks unknown consumer | Low (only BE/US/FE consume it) | Medium | Coordinated release in order SDK→BE/US/FE; version bump + changelog |
| Existing DB has the row, fire-and-forget fails | Low | Medium | Test the fire-and-forget script on a clone of a real DB before deploying |
| FE e2e tests break (admin-login helper) | Low | Low | Update the comment; the input is now always visible so the test is simpler |
| Stale `auth_configurations` cache in BE memory after row deletion | Low | Low | The BE reloads config on writes; a restart clears any stale cache |
| User has `enable_formauth=false` in prod today | Possible | None (BE never enforced it) | The removal is transparent — login already worked regardless |

---

## 8. Out of scope

- Removing `enable_webauthn` or `enable_mfa` — those remain toggleable.
- Changing the passkey enrollment or MFA challenge flows.
- Refactoring the `auth_configurations` table schema beyond removing this one row.
- Editing historical AI plan documents in `primebrick-workspace/ai-plans/`.
