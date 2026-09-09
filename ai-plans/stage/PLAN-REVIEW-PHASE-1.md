# PLAN REVIEW PHASE 1 — Consolidated Status & Action Document

> **Generated:** 2026-09-04 by empirical codebase verification (6 parallel read-only subagents).
> The 10 plan files in this `stage/` folder were reviewed. 4 are fully done.
> 6 have remaining work consolidated into follow-ups A–J below.
> This file is the single working memory — the 10 originals are kept here as raw history only.

## Executive Summary

| # | Plan File | Verdict | Remaining? |
|---|-----------|---------|------------|
| 1 | remaining-work-2026-07-consolidated-plan.md | PARTIALLY DONE | YES — A,B,C,D |
| 2 | docs-website-cleanup-2026-07.md | FULLY DONE | NO |
| 3 | bugfix-sidebar-no-autoclose.md | FULLY DONE | NO |
| 4 | fix-sidebar-breadcrumb-modules-health.md | MOSTLY DONE | YES — E,F |
| 5 | feature-mcp-server-be.md | IMPLEMENTED (despite "Draft" label) | MINOR — J |
| 6 | feature-contact-page-and-banner.md | CODE DONE, external prereqs unconfirmed | YES — G |
| 7 | zudoku-server-selector-and-auth-toggle.md | FULLY DONE | YES — H (deferred feature) |
| 8 | feature-brand-logo-favicon.md | DONE but DIVERGED (hexagon→brick grid) | YES — I |
| 9 | feature-primary-button-gradient-test.md | DONE + PROMOTED to default variant | NO |
| 10 | docs-generation-strategy.md | INFRASTRUCTURE DONE, content via make-docs skills | NO |

## Per-Plan Verification (2026-09-04)

### 1. remaining-work-2026-07-consolidated-plan.md — PARTIALLY DONE

**Phase 1 (BE DAL Adoption) — NOT DONE.** 11 files still use `new Repository(pool)`:
- src/modules/auth/routers/config-entries.router.ts:457
- src/modules/auth/auth_configurations_dal.ts:19
- src/modules/auth/user_mfa_factors_dal.ts:18
- src/modules/auth/user-passkeys-dal.ts:18
- src/modules/auth/user-profile-repo.ts:64
- src/modules/auth/user-invitations-dal.ts:17
- src/modules/auth/role-mapping-repo.ts:94
- src/modules/auth/mfa_action_authorizations_dal.ts:18
- src/db/repository-factory.ts:30
- src/modules/proxy/service-registry-repo.ts:35
- src/lib/audit/audit-service.ts:10
Progress: customers_dal.ts:219 and user-profiles-dal.ts:79 migrated to createRepository(pool).
src/db/repository/repository.ts still exists. package.json uses file:../primebrick-dal-v3.

**Phase 2 (Emailsender npm) — NOT DONE.** emailsender/package.json lines 29-30 still workspace:*.

**Phase 3.1 (total type) — NOT DONE.** dto.ts:207 declares total: number; customers.service.ts:74 returns total: 0n (bigint). Decision never made.

**Phase 3.2 (migration patch) — NOT DONE.** emailsender/db-meta/patches/ has only 0001 + 0002. No patch creates email_templates_communication_log.

### 2. docs-website-cleanup-2026-07.md — FULLY DONE ✅
Mermaid fixed (zudoku built-in), all broken links/ports/repo names fixed, Architecture section exists at index.astro:983.

### 3. bugfix-sidebar-no-autoclose.md — FULLY DONE ✅
AppSidebar.svelte:50-52 — afterNavigate contains only saveLastRoute.

### 4. fix-sidebar-breadcrumb-modules-health.md — MOSTLY DONE (2 missing)
Issue 1 ✅, Issue 2 ✅, Issue 3 ❌ (no home filter at SidebarModuleSwitcher.svelte:51), Issue 4 ✅, Issue 5a ✅, Issue 5b ❌ (no nullable patch), Issue 5c ✅.

### 5. feature-mcp-server-be.md — IMPLEMENTED (despite "Draft" label)
src/modules/mcp/ has 16 files. /mcp mounted at index.ts:280. OAuth endpoints in oauth/metadata.ts. FE consent at routes/mcp/consent/. Emailsender routes refactored to /api/v1/entities/:entity/.... x-mcp-server extension at openapi.ts:28. SDK pinned to 2.0.0-beta.4 (stale).

### 6. feature-contact-page-and-banner.md — CODE DONE, external prereqs unconfirmed
TopBanner.astro, ContactForm.svelte, contact.astro, api/contact.ts all exist. translations.ts has banner + contact keys. .dev.vars gitignored. External: CF secrets, Brevo sender, Turnstile widget — unconfirmed.

### 7. zudoku-server-selector-and-auth-toggle.md — FULLY DONE
BE openapi.ts:635 + US openapi-route.ts:25 have both bearerAuth + apiKey. Webhook overridden to apiKey-only. Server selector still deferred.

### 8. feature-brand-logo-favicon.md — DONE but DIVERGED
5 SVGs in workspace/assets/logo/. All 3 sites have favicon + logo assets. FE login uses logo image. Design diverged: plan specified hexagon+PB monogram; actual is 2×2 brick grid. Lowercase-b "Primebrick" remains in FE i18n titles, website translations, demo page titles, docs frontmatter.

### 9. feature-primary-button-gradient-test.md — DONE + PROMOTED
button.svelte:11-12 default variant now uses gradient. LoginForm:177 inherits it. Test follow-up completed.

### 10. docs-generation-strategy.md — INFRASTRUCTURE DONE
sync-deepwiki.mjs deleted. pages/*/deepwiki/ deleted. sync-repo-docs.mjs copies docs/user-guide/. generate-nav.mjs reads _order.json. All 5 repos have docs/user-guide/ + rules + extraction tooling (sveld@0.36.0 in FE, typedoc@0.28.20 in DAL+SDK). Content maintenance now via per-repo make-docs skills.

---

## FOLLOW-UPS (A–J) — Consolidated Remaining Work

### A. BE DAL Adoption Migration
**Priority:** HIGH | **Repo:** primebrick-be-v3 | **From:** plan #1 Phase 1
**Current state:** 11 files still use `new Repository(pool)`. The embedded `src/db/repository/repository.ts` still exists. `package.json:29` uses `file:../primebrick-dal-v3`. Two files (customers_dal, user-profiles-dal) already migrated to `createRepository(pool)` as a pattern reference.
**Where to start:**
1. Read `src/db/repository-factory.ts` — this is the factory that likely wraps the new pattern. Understand `createRepository(pool)` vs `new Repository(pool)`.
2. Read `src/modules/customers/customers_dal.ts:219` — already migrated, use as the reference pattern.
3. For each of the 11 files listed in §1 above, replace `new Repository(pool)` with the `createRepository(pool)` pattern.
4. After all 11 are migrated, delete `src/db/repository/repository.ts`.
5. Switch `package.json` `@primebrick/dal-pg` from `file:../primebrick-dal-v3` to `workspace:*` or a pinned npm version.
**Acceptance:** Zero `new Repository(pool)` in `src/`; `repository.ts` deleted; `pnpm run build` + `pnpm test` pass.

### B. Emailsender npm Package Consumption
**Priority:** MEDIUM | **Repo:** primebrick-us-v3/emailsender | **From:** plan #1 Phase 2
**Current state:** `emailsender/package.json:29-30` uses `workspace:*` for both `@primebrick/dal-pg` and `@primebrick/sdk`. Docker builds need workspace context.
**Where to start:**
1. Check npmjs.org for `@primebrick/sdk` and `@primebrick/dal-pg` latest published versions.
2. If not published, trigger OIDC publishing workflows via git tags in the SDK and DAL repos.
3. Replace `workspace:*` with pinned npm versions (e.g. `"@primebrick/dal-pg": "0.1.9"`, `"@primebrick/sdk": "0.1.1"` — verify current latest).
4. Decide: keep emailsender in pnpm workspace (with npm specifiers) or remove from workspace entirely.
5. Run `docker build` in emailsender to confirm standalone build.
**Acceptance:** Pinned npm versions; `docker build` succeeds without workspace context; `pnpm install` + `pnpm run build` pass.

### C. `total` Type Consistency
**Priority:** LOW | **Repo:** primebrick-be-v3 | **From:** plan #1 Phase 3.1
**Current state:** `src/modules/customers/dto.ts:207` declares `total: number`. `src/modules/customers/customers.service.ts:74` returns `total: 0n` (bigint). Inconsistent.
**Where to start:**
1. Read `dto.ts:206-210` — the CustomerAuditResponse type.
2. Read `customers.service.ts:70-80` — the debug toggle return.
3. Read `organizations_dal.ts:242` — uses `Number(countResult.cnt)` to convert bigint COUNT to number.
4. **Recommended fix (option a):** Change `total: 0n` → `total: 0` in `customers.service.ts:74`. Keep `total: number` everywhere.
**Acceptance:** `total` type consistent across dto.ts, customers.service.ts, and all DALs.

### D. Missing Migration Patch for `email_templates_communication_log`
**Priority:** LOW | **Repo:** primebrick-us-v3/emailsender | **From:** plan #1 Phase 3.2
**Current state:** `db-meta/patches/` has only `0001_initial_schema.sql` + `0002_seed_microservice_config.sql`. The entity snapshot (`db-meta/snapshot-entities.json`) contains `emailsender.email_templates_communication_log` but no patch creates it. A fire-and-forget script (`rename_log_table_and_add_soft_delete.sql`) references the table only to rename it.
**Where to start:**
1. Read `db-meta/snapshot-entities.json` — find the `email_templates_communication_log` entity definition for the correct schema (columns, types, including `entity_id bigint`).
2. Read `0001_initial_schema.sql` — understand the patch format and conventions.
3. Create `0003_email_templates_communication_log.sql` with the correct CREATE TABLE.
4. Run `pnpm run db:meta:compare` to verify, or write manually and update the patch registry SHA256 per `.devin/rules/patch-sha256-management.md`.
**Acceptance:** `pnpm run db:migrate` succeeds; table exists in production.

### E. Remove HOME from Module Switcher Dropdown
**Priority:** LOW | **Repo:** primebrick-fe-v3 | **From:** plan #4 Issue 3
**Current state:** `src/lib/components/sidebar/SidebarModuleSwitcher.svelte:51` — the `{#each shellNav.modules as m (m.id)}` block has NO filter. HOME appears in the dropdown. Selecting HOME loads empty nav (no sidebar links, no navigation).
**Where to start:**
1. Read `SidebarModuleSwitcher.svelte:51-64` — the each block.
2. Change to `{#each shellNav.modules.filter((m) => m.id !== 'home') as m (m.id)}`.
3. Verify SETTINGS still appears (it has 7 nav items, `is_reserved=true` but not filtered).
4. Verify navigating to `/` still works (route not removed, just dropdown entry).
**Acceptance:** HOME not in dropdown; SETTINGS still appears; `/` route works; `pnpm run check` passes.

### F. BE Patch: Make `service_registry.status` Nullable
**Priority:** LOW | **Repo:** primebrick-be-v3 | **From:** plan #4 Issue 5b
**Current state:** `service_registry.status` is `NOT NULL DEFAULT 'unknown'` (init patch line 477). Reserved services (HOME, SETTINGS) are seeded with `status = 'active'` which the FE's `aggregateStatus()` maps to `unknown` (only recognizes online/going_live/offline). The FE already handles reserved services by showing the BE health badge instead (VersionsPanel.svelte:268-283), but the BE side was never completed.
**Where to start:**
1. Read `db-meta/patches/00000000000000_init_database.sql:477` — current status column definition.
2. Read `src/modules/system/service_registry_entity.ts` — the `@Column` decorator for status (change `nullable: false` → `nullable: true`).
3. Read `db-meta/fire-and-forget/add_service_registry_is_reserved_and_seed_home_settings.sql` — the seed file (change `'active'` → `NULL` on the HOME and SETTINGS inserts).
4. Create patch `00000000000003_make_service_registry_status_nullable.sql`:
   ```sql
   ALTER TABLE public.service_registry ALTER COLUMN status DROP NOT NULL;
   ```
5. Add fire-and-forget: `UPDATE public.service_registry SET status = NULL WHERE is_reserved = true;`
6. Verify `stale-detection-job.ts:49` — reserved services have NULL `last_health_check_at`, so they're already skipped. No change needed.
**Acceptance:** `pnpm run db:migrate` applies patch; reserved services have NULL status; FE already wired (VersionsPanel:268-283).

### G. Contact Page External Prerequisites
**Priority:** MEDIUM (blocks contact form in production) | **Repo:** primebrick-v3-website | **From:** plan #6
**Current state:** Code is complete — TopBanner.astro, ContactForm.svelte, contact.astro, api/contact.ts all exist and are wired. `.gitignore` includes `.dev.vars`. The `.dev.vars` file itself is not visible (gitignored). The feature cannot work in production without these external configurations.
**Where to start (all in Cloudflare dashboard + Brevo dashboard — NOT code changes):**
1. Cloudflare → Workers & Pages → primebrick-v3-website → Settings → Variables and Secrets (runtime):
   - Add `TURNSTILE_SECRET_KEY` (Secret, encrypted)
   - Add `BREVO_API_KEY` (Secret, encrypted)
2. Cloudflare → Workers Builds → primebrick-v3-website → Settings → Build → Variables (build-time):
   - Add `PUBLIC_TURNSTILE_SITEKEY` (Variable, plaintext)
3. Brevo dashboard → Senders & IP → verify `no-reply@primebrick.dev` sender domain.
4. Cloudflare → Turnstile tab → create widget with hostname `primebrick.dev` → get production sitekey + secret.
5. For local dev: create `.dev.vars` with Cloudflare test keys (`1x0000000000000000000000000000000AA` for Turnstile secret, `1x00000000000000000000AA` for sitekey) + Brevo test key.
**Acceptance:** Contact form submission with valid data + solved Turnstile results in email at `about@primebrick.dev`.

### H. Zudoku Server Selector (Deferred Feature)
**Priority:** LOW | **Repo:** primebrick-v3-docs | **From:** plan #7
**Current state:** Not implemented. Explicitly deferred in the original plan. Zudoku's `Endpoint.tsx` hides the server dropdown when only 1 server exists. No plugin hook/slot exists in Zudoku for custom server UI.
**Where to start:**
1. Read `node_modules/zudoku/dist/` — check if newer Zudoku versions added a server selector plugin hook.
2. If no hook: a custom plugin (DOM injection or Vite alias override of `Endpoint.tsx`) would be needed to let users add their own server URL at runtime.
3. Zudoku already persists selected server in localStorage (key `zudoku-selected-server`) via Zustand persist middleware.
4. The specs are static (build-time from GitHub repos), so adding fake URLs has no value unless users can input custom URLs.
**Note:** This is a nice-to-have, not blocking. No tracking plan exists yet.

### I. Brand: Lowercase-b Cleanup
**Priority:** LOW (cosmetic) | **Repos:** primebrick-fe-v3, primebrick-v3-website, primebrick-v3-docs | **From:** plan #8
**Current state:** Logo `alt` text and docs `site.title` use `PrimeBrick` (capital B). But user-facing titles still use `Primebrick` (lowercase b) in:
- **FE:** `src/lib/i18n/messages/en-GB.json:3` (`app.title`), `:6` (`login.title`) — same in all 6 locale files (en-GB, it-IT, de-DE, es-ES, fr-FR, pt-PT).
- **Website:** `src/i18n/translations.ts:262` (footer copyright), `:267` (contact subtitle), `use-cases/index.astro:130` (H1), 5 demo page `<title>` tags (demo/index.astro:44, shell.astro:42, versions.astro:43, exports.astro:43, entity-list-table.astro:63).
- **Docs:** `pages/index.mdx:2-3` (frontmatter title/description), `AGENTS.md:1`.
**Where to start:**
1. **Decision needed:** Confirm `PrimeBrick` (capital B) is the canonical spelling everywhere. The plan #8 explicitly stated "PrimeBrick (B maiuscola) ovunque" but the codebase has mixed usage.
2. If proceeding: update all locations listed above. For FE, update all 6 locale files. For website, update translations.ts + 6 .astro files. For docs, update index.mdx + AGENTS.md.
**Note:** This is a branding-consistency decision. The `primebrick.dev` domain itself uses lowercase, so the brand name in prose may intentionally be `Primebrick` while the logo alt text is `PrimeBrick`. Confirm with user before mass-replacing.

### J. MCP SDK Version Re-evaluation
**Priority:** LOW | **Repo:** primebrick-be-v3 | **From:** plan #5
**Current state:** `package.json:26-28` pins `@modelcontextprotocol/server`, `express`, `node` all at `2.0.0-beta.4`. The plan noted "stable expected July 28, 2026". Today is 2026-09-04 — a stable release likely exists.
**Where to start:**
1. Check npmjs.org for `@modelcontextprotocol/server` latest version.
2. If stable exists: review the changelog for breaking changes between beta.4 and stable.
3. Update `package.json` to the stable version (per package-versioning rules, pin exact version).
4. Run `pnpm run build` + `pnpm test` in BE to verify.
5. Check `src/modules/mcp/` for any beta-specific API usage that may have changed.
**Acceptance:** BE builds and tests pass with the stable SDK version.

---

## How to Use This Document

- **To start work on a follow-up:** read the "Where to start" section for the item (A–J). It lists the exact files and line numbers to read first, the current state, and the recommended approach.
- **To understand the history:** the 10 original plan files are in this same `stage/` folder. Read them for full design context, but this document is the authoritative status.
- **To verify completion:** each follow-up has acceptance criteria. Re-run the empirical checks (grep, read) to confirm.
- **Priorities:** A (HIGH), B + G (MEDIUM), C–F + H–J (LOW).
