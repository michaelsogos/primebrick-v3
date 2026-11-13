# User-Profile Field Lifecycle — `immutable`, `idp_*` renames, `is_active` → `suspended_at/by`

## Status: ⏸️ DEFERRED — implemented, verification parked (user decision 2026-11-13)

> `user_profile` is one of the LAST entities migrating to the de-facto
> standard — its forms are still custom surfaces. Verifying it against
> the standard contract now is premature. Ordering constraint: this
> verification resumes only AFTER the standard migration POC closes on
> **crm and job-handler** (see `metadata-driven-page-system.md` task 18 —
> user_profile explicitly last in that sequence). The implementation
> itself is landed; what waits is the standard-migration pass + E2E
> verification of the new anatomy.

## Decisions (all user-approved)

| Field | Classification | Behavior |
|---|---|---|
| `idp_code`, `idp_org`, `idp_username` | `immutable:true` | create: editable (org/username) or absent (code = Casdoor id); update: visible disabled; never in update payload |
| `issuer` → **`idp_issuer`** | `immutable:true` (rename) | `cfg.idp_endpoint` at creation, never user input |
| `avatar_initials` | `immutable:true` (derived) | computed from display_name; AvatarPreview widget exists; visible-disabled everywhere |
| `is_verified` → **`idp_is_verified`**, `email_verified` → **`idp_email_verified`** | `immutable:true` (rename) | Casdoor mirrors; login gate reads JWT claim, local cols are write-once-stale — sync gap noted |
| `is_admin` → **`idp_is_admin`** | writable on `/update` (admin decides Casdoor-console access), **disabled on `/profile`** (form-level) | `req.user.isAdmin` comes from `role_mappings` — column is Casdoor-facing only |
| `roles` | writable on `/update`, **disabled on `/profile`** (form-level) | self cannot self-grant |
| `auth_method_enforcer_dismissed` | **writable everywhere** (also `/profile`) | admin can re-force enrollment on legacy users |
| `onboarding_completed` | `immutable:true` (process-derived) | written by invitation acceptance only |
| `last_synced_at`, `created_*`, `updated_*`, `deleted_*` | audited | audit section — already correct |
| `password`, `send_invitation` | NOT columns | `createUser` RPC inputs — outside metadata contract |
| **`is_active`** | **DROPPED** | vestigial: written only at create, gate redundant with deleted-EXCLUDED |
| **`suspended_at` / `suspended_by`** | **NEW audit pair** (nullable) | user-domain suspension; survives retention purge (not a deleted state) |

## `is_active` drop — evidence

- `Deletable` mixin already gives `deleted_at/by`; `deleteUser`/`restoreUser` sync `isForbidden` + `bumpUserAuthEpoch` — the canonical disable path.
- `is_active`: written ONLY at create (`isForbidden:!is_active`); read only by `AUTH_RESOLVE_USER_SUBJECT` + filterable; no post-create write path; dev DB all `true`.
- `AUTH_RESOLVE` already fails closed on deleted (`getByUuid` EXCLUDED → null) — the `is_active` check is redundant.
- Commutator problem: `isForbidden` written from 2 local states (is_active, deleted) would diverge → solved by making `isForbidden = suspended ∨ deleted` derived at every transition.

## `suspended_at`/`suspended_by` design

- NOT a DAL mixin — suspension is identity-domain-specific (customers delete, users suspend).
- Plain `@Column` pair on `UserProfileEntity`; meta: `audited:true` (audit section), `suspended_by` `type:"ref"`→`user_profile`.
- Gate: `suspended_at IS NOT NULL` → `AUTH_RESOLVE_USER_SUBJECT` returns null (fail-closed), same as deleted.
- `isForbidden` derivation at every transition: suspend→true; reactivate→false only if not deleted; delete→true; restore→false only if not suspended.
- Actions: `POST /auth/users/:uuid/suspend|reactivate?version=N`, `AUTHENTICATED_ADMIN`, `row_custom_actions` entries.

## `immutable:true` contract (core)

- `MetaColumn.immutable?: boolean` — editable on `kind:"create"`, disabled on update/detail surfaces, excluded from update payloads. Covers user-supplied-at-create AND system-derived subtypes (same behavior, no distinction).
- Enforcement: `EntityFormField`/`FormFieldDispatcher` `mode` prop ('create'|'update'); `EntityFormPage` passes `isDetail`; record sheet = 'update'; `saveKeys` excludes immutable; dict `editableColumns` excludes immutable on existing rows.

## Renames

`issuer`→`idp_issuer`, `is_admin`→`idp_is_admin`, `is_verified`→`idp_is_verified`, `email_verified`→`idp_email_verified` — DB patch + entity + DTO + meta keys + meMeta keys + FE pages + filterable set + openapi + E2E testids. Label keys unchanged (translations exist).

## Drift found & fixed during implementation

- **FE admin gate read the WRONG source**: `permissions.AUTHENTICATED_ADMIN` consumed `profile.is_admin` = the Casdoor-console mirror, while BE RBAC gates on `req.user.isAdmin` (role_mappings-derived). Fix: `GET /me` now emits top-level `is_admin` from `req.user.isAdmin`; the store keeps `is_admin` (correct source) + adds `idp_is_admin` (Casdoor mirror, display only).
- **`kind:"calculated"` was not readonly**: `EntityFormField` would have rendered `suspended` as an editable switch on update surfaces → `fieldReadonly` now forces `kind:"calculated"` readonly by construction.
- **Endpoint-dispatched custom actions never sent `?version=`**: `runEndpointAction` now appends `?version=` when `row.version` is numeric — suspend/reactivate use `requireVersionQuery` like delete/restore.
- `suspend`/`reactivate` ops are emitted in `meta.actions` automatically: `POST /api/v1/auth/users/:uuid/<op>` hits `routeToOp → last` via the existing `/api/v1/auth/users` `extraScan` in `user-profiles.router.ts`.

## Tasks

- [x] Plan file (this doc)
- [x] Core: `MetaColumn.immutable` (primebrick-v3-core, rebuilt)
- [x] DB patch: drop is_active, 4 renames, +suspended pair + translations (2 patches, signed + applied)
- [x] BE entity (`@Calculated suspended`, suspended pair) / dto / service (suspendUser, reactivateUser, isForbidden = suspended∨deleted) / router / meta / meMeta / openapi
- [x] Gate `AUTH_RESOLVE_USER_SUBJECT` → `!user || user.suspended_at → null`
- [x] FE: `EntityFormField` mode + immutable + calculated readonly; `EntityFormPage` mode + payload exclusion; `EntityRecordSheet` saveKeys; `EntityDictPage` updateEditableColumns vs draft set
- [x] Pages: create (is_active dropped, idp_* renames), update (idp_is_admin + enforcer editable, suspended indicator), profile (idp_* disabled, enforcer editable), users list type
- [x] Suspend/reactivate `row_custom_actions` + `visible_on suspended` + endpoint auto-dispatch (no page handler needed)
- [ ] svelte-check, BE typecheck, standards clean — running
- [ ] E2E suite run (focused: users create/update/profile/suspend/reactivate)
- [ ] Later (noted): `avatar_initials` in users table via TableCell multi-formatter; `idp_is_verified`/`idp_email_verified` sync path
