# Remaining Work — Consolidated Plan (2026-07)

> **Generated:** 2026-07-13
> **Last updated:** 2026-07-13 (re-verified after latest commits)
> **Purpose:** Single source of truth for all not-yet-done work.
>
> **Supersedes all prior plans in `ai-plans/`.** The following plans were
> empirically verified and their remaining work is consolidated here:
> - `be-dal-sdk-adoption-plan.md` → Phase 1
> - `microservice-bun-docker-publishing-plan.md` → Phase 2
> - `bigint-migration-out-of-scope-plan.md` → Phase 3
>
> **The following plans were verified as DONE or SUPERSEDED and deleted:**
> - `dal-close-hardening-plan.md` — DONE
> - `dal-first-release-plan.md` — DONE (v0.1.9 published)
> - `dal-gateway-pool-ownership-plan.md` — DONE
> - `dal-update-delete-redesign-plan.md` — DONE
> - `email-microservice-dal-repo-library-plan.md` — SUPERSEDED (renamed to @primebrick/dal-pg)
> - `primebrick-sdk-plan.md` — DONE
> - `us-emailsender-dal-integration-plan.md` — DONE
> - `config-dictionary-pattern-plan.md` — DONE
> - `bugfix-sidebar-versions-panel-microservice-labeling-plan.md` — DONE
> - `bugfix-starlight-prerender-error-plan.md` — DONE
> - `entity-list-table-state-referenced-locally-fix-plan.md` — DONE
> - `bigint-native-json-serialization-plan.md` — DONE
> - `feature-app-sidebar-module-dropdown-dynamic-links-plan.md` — DONE
> - `feature-microservice-health-status-panel.md` — DONE
> - `feature-settings-modules-page-revamp-plan.md` — DONE
> - `primebrick-dev-website-plan.md` — DONE
> - `landing-docs-apiexplorer-improvements-plan.md` — SUPERSEDED by v4
> - `landing-docs-apiexplorer-improvements-v4-plan.md` — DONE (Point 12 resolved by Zudoku migration)
> - `dependency-upgrade-plan.md` — DONE (TS6, Vitest 4, Node 24, all pinned)
> - `remaining-work-consolidated-plan.md` — DONE
> - `us-emailsender-test-strategy-plan.md` — SUPERSEDED by consolidated plan
> - `api-explorer-fixes-v2.md` — SUPERSEDED (Zudoku replaced Scalar)
> - `primebrick-website-improvements-plan.md` — SUPERSEDED (Zudoku replaced Scalar)
> - `zudoku-docs-migration-plan.md` — DONE (Zudoku migration complete)
> - `feature-email-providers-page-and-microservice-proxy-plan.md` — DONE
>   (BE auth uses SDK verifyAuth, proxy uses serializeAuthUserToHeaders,
>    emailsender webhook uses verifyApiKey, NATS handlers use verifyNatsMessage)

---

## Phase 1 — BE DAL Adoption (HIGH PRIORITY)

**Source:** `be-dal-sdk-adoption-plan.md` (phases 0-5)
**Repo:** `primebrick-be-v3`
**Status:** PARTIALLY DONE — prerequisite bigint serialization complete; new modules
already use `@primebrick/dal-pg` decorators and types, but the BE's embedded
`Repository` class (`src/db/repository/repository.ts`) is still used by 8 files
for core entities.

### Current state (empirically verified 2026-07-13)

8 files still use `new Repository(pool)`:
- `src/modules/proxy/service-registry-repo.ts:35`
- `src/modules/customers/customers_dal.ts:218`
- `src/modules/auth/user-profiles-dal.ts:78`
- `src/modules/auth/user-profile-repo.ts:75`
- `src/modules/auth/role-mapping-repo.ts:22`
- `src/modules/auth/organizations_dal.ts:74`
- `src/modules/auth/auth_configurations_dal.ts:16`
- `src/lib/audit/audit-service.ts:10`

BE `package.json` uses `file:../primebrick-dal-v3` (not workspace or npm).

### Objective

Migrate the BE from its embedded `Repository` to the shared `@primebrick/dal-pg`
`Repository` for all entities, eliminating the duplicated repository code and
unifying DB access patterns across BE and US.

### Work items

1. **Phase 0 — Audit current usage:** Map every file using `new Repository(pool)`,
   identify which entities they touch, and which DAL-pg equivalents already exist.
2. **Phase 1 — Migrate Customer entities:** Replace `customers_dal.ts` embedded
   repository calls with `@primebrick/dal-pg` Repository.
3. **Phase 2 — Migrate Organization entities:** Same pattern for
   `organizations_dal.ts`.
4. **Phase 3 — Migrate User Profile entities:** Same pattern for
   `user-profiles-dal.ts` and `user-profile-repo.ts`.
5. **Phase 4 — Migrate Auth + Proxy entities:** `role-mapping-repo.ts`,
   `auth_configurations_dal.ts`, `service-registry-repo.ts`, `audit-service.ts`.
6. **Phase 5 — Delete embedded Repository:** Once all callers are migrated,
   delete `src/db/repository/repository.ts` and switch `package.json` to
   `@primebrick/dal-pg` via `workspace:*` or npm version.

### Acceptance criteria

- [ ] No file in `primebrick-be-v3/src/` uses `new Repository(pool)`
- [ ] `src/db/repository/repository.ts` is deleted
- [ ] `package.json` uses `@primebrick/dal-pg` via `workspace:*` or npm version
- [ ] `pnpm run build` passes in BE
- [ ] `pnpm test` passes in BE
- [ ] `npx svelte-check --threshold error` passes in FE (no API contract changes)

---

## Phase 2 — Emailsender npm Package Consumption (MEDIUM PRIORITY)

**Source:** `microservice-bun-docker-publishing-plan.md`
**Repo:** `primebrick-us-v3/emailsender`
**Status:** PARTIALLY DONE — Bun runtime, Dockerfile, GitHub Actions, Terraform,
Docker Compose Watch all done. SDK + DAL npm publishing infrastructure ready.
Only remaining: emailsender still uses `workspace:*` instead of published npm versions.

### Current state (empirically verified 2026-07-13)

`emailsender/package.json` lines 29-30:
```json
"@primebrick/dal-pg": "workspace:*",
"@primebrick/sdk": "workspace:*"
```

Docker builds are not self-contained (need workspace context).
SDK at v0.1.1, DAL at v0.1.9 — publishing infrastructure (OIDC CI) ready.

### Work items

1. **Verify npm packages are published:** Confirm `@primebrick/sdk@0.1.1`
   and `@primebrick/dal-pg@0.1.9` are available on npmjs.org. If not published,
   trigger the OIDC publishing workflows via git tags.
2. **Switch emailsender to npm packages:** Change `package.json`:
   - `"@primebrick/dal-pg": "workspace:*"` → `"@primebrick/dal-pg": "0.1.9"`
   - `"@primebrick/sdk": "workspace:*"` → `"@primebrick/sdk": "0.1.1"`
3. **Update pnpm-workspace.yaml:** Decide whether to keep emailsender in
   workspace (with npm version specifiers for primebrick packages) or remove
   it from the workspace entirely.
4. **Verify Docker build:** Run `docker build` in emailsender to confirm
   the image builds without workspace context.

### Acceptance criteria

- [ ] `@primebrick/sdk` and `@primebrick/dal-pg` confirmed published on npmjs.org
- [ ] `emailsender/package.json` uses pinned npm versions (no `workspace:*`)
- [ ] `docker build` succeeds without workspace context
- [ ] `pnpm install` + `pnpm run build` pass in emailsender
- [ ] All emailsender tests pass

---

## Phase 3 — Bigint Cleanup Remnants (LOW PRIORITY)

**Source:** `bigint-migration-out-of-scope-plan.md`
**Repos:** `primebrick-be-v3`, `primebrick-us-v3/emailsender`
**Status:** ~95% DONE — only 2 minor items remain

### Work items

#### 3.1 — CustomerAuditResponse.total type (C7)

**File:** `primebrick-be-v3/src/modules/customers/dto.ts` line 206
**Current:** `total: number;`
**Context:** BE uses `Number(countResult.cnt)` in `organizations_dal.ts:242`
to convert bigint COUNT result to number. The customers service debug toggle
returns `total: 0n` (bigint) at `customers.service.ts:74`, creating a type
inconsistency.
**Decision needed:** Either:
- (a) Keep `total: number` everywhere — change `total: 0n` → `total: 0` in
  `customers.service.ts:74` for consistency. OR
- (b) Change `total: number` → `total: bigint` in `dto.ts` and update
  `organizations_dal.ts` to return bigint instead of `Number()`.
**Recommendation:** Option (a) — pagination totals as `number` is safer
(values fit in `Number.MAX_SAFE_INTEGER`).

#### 3.2 — Missing migration patch for email_templates_communication_log (E3)

**Repo:** `primebrick-us-v3/emailsender`
**Issue:** The entity snapshot (`db-meta/snapshot-entities.json`) contains
`emailsender.email_templates_communication_log` but no migration patch creates
this table. The test helper creates it manually, but production databases
won't have it.
**Fix:** Create a new migration patch (e.g. `0003_email_templates_communication_log.sql`)
with the correct schema (including `entity_id bigint`). Run
`pnpm run db:meta:compare` to generate, or write manually and update the
patch registry SHA256 per the patch-sha256-management rule.

### Acceptance criteria

- [ ] `total` type is consistent across `dto.ts`, `customers.service.ts`, and all DALs
- [ ] Migration patch for `email_templates_communication_log` exists in
      `emailsender/db-meta/patches/`
- [ ] `pnpm run db:migrate` succeeds in emailsender
- [ ] All builds and tests pass

---

## Execution Order

```
Phase 1 (BE DAL Adoption)         — HIGH, can start immediately
Phase 2 (Emailsender npm)         — MEDIUM, independent
Phase 3 (Bigint Cleanup)          — LOW, independent
```

All three phases are independent and can run in parallel. Phase 1 is the
largest piece of work. Phases 2 and 3 are small.
