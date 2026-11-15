# Feature: `custom` PostgreSQL schema — Phase 1: `custom.translations`

## Status
Empirical plan, user decisions applied. Verified against code + dev DB (live queries).

## Decisions (from user)
1. `emailsender.translations` missing → **deferred**, handled when working on that module.
2. **Hard rule, enforced not just conventional**: user-created keys MUST start with `custom.` — and `custom.*` keys are never allowed in other translation tables. No collision possible by construction.
3. New-key convention: `custom.config.{configKey}.errors.{rule}` (mirrors the old `system.settings.config.auth.{configKey}.errors.{rule}` shape). **Existing keys stay where they are** — `system.*`/`app.*` seed keys keep their module table (reusable/module-owned); only NEW user-created keys get `custom.*` + `custom.translations`.
4. Load order: `app.*` (public dict) first at app init → **`custom` is the first authenticated dict**, loaded right after login/refresh. Module dicts stay lazy per route. Custom-only namespace → merge order irrelevant.
5. `custom.translations` is **global and shared**: "se una chiave non è già presente allora è custom ed è global, vale per tutti" — cross-system, cross-org. Any authenticated user reads it; a key created by one user is available to everyone.
6. Verified: no user-created rows exist in `system.translations` today (all `system.settings.config.*` rows are `created_by='initial-setup'`) — **no migration needed**.

## Verified current state
- PG schemas: `ai, emailsender, public, system` — `custom` absent.
- `translations` tables only in `public` + `system`. Shape: `id BIGSERIAL PK, uuid UNIQUE, key VARCHAR(255), language VARCHAR(10), value TEXT, created_at/by, updated_at/by, version, deleted_at/by` + partial unique `(key,language) WHERE deleted_at IS NULL` + `language` index. Grants → role `primebrick`.
- Patches: `db-meta/patches/NNNNNNNNNNNNNN_*.sql` (next: `00000000000009`); same DDL also goes in `init_database.sql` for fresh installs.
- BE: `MODULE_ENTITIES` static map; runtime `GET /system/translations/:module/:language` (AUTHENTICATED_USER, ETag) + admin CRUD (TRANSLATIONS_MANAGE) work for any registered module — adding `custom` = entity + 1 map entry, zero new endpoints.
- FE: `loadModuleTranslations('app', lang)` in `(app)/+layout` onMount; lazy per-route via `useModuleTranslations`; localStorage + ETag revalidation. **Latent bug**: on language switch only the current-route module refetches — `app`/`custom` dicts stay in old language → fix included.
- `createTranslation` in api.ts → `POST /entities/translation?module=…` — requires TRANSLATIONS_MANAGE (admin). ⚠️ See open question A.
- `autoErrorLabelKey` in `type-config-schema.ts` emits `system.settings.config.auth.{key}.errors.{rule}` → must emit `custom.config.{key}.errors.{rule}`.

## Phase 1 — DB `db-meta/patches/00000000000009_create_custom_schema.sql`
```sql
CREATE SCHEMA IF NOT EXISTS "custom";
CREATE TABLE IF NOT EXISTS "custom"."translations" ( /* identical to system.translations */ );
CREATE UNIQUE INDEX IF NOT EXISTS "custom_translations_key_language_uidx"
  ON "custom"."translations" ("key","language") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "custom_translations_language_idx"
  ON "custom"."translations" ("language") WHERE "deleted_at" IS NULL;
GRANT SELECT,INSERT,UPDATE,DELETE ON "custom"."translations" TO primebrick;
GRANT USAGE ON SCHEMA "custom" TO primebrick;
-- + sequence usage grants for BIGSERIAL
```
Mirror the same block in `init_database.sql`.

## Phase 2 — BE
1. `translation_entities.ts`: `CustomTranslationEntity @Entity("translations","custom")`.
2. `translations-dal.ts`: `MODULE_ENTITIES.custom = CustomTranslationEntity`.
3. **Enforcement rule** in `TranslationsDal.createTranslation`/`updateTranslation` (or router-level validation): `module='custom'` → `key` MUST match `/^custom\./`; `module!=='custom'` → `key` MUST NOT match `/^custom\./`. Reject with 400 otherwise.
4. Runtime read, admin list/CRUD, Redis cache (`translations:i18n:custom:*`), ETag — all automatic via existing paths.

## Phase 3 — FE
1. `(app)/+layout.svelte` onMount: after `loadModuleTranslations('app', lang)` → `loadModuleTranslations('custom', lang)` (first authenticated dict).
2. `use-module-translations.svelte.ts`: on `uiLang` change, refetch `app` + `custom` + current-route module (fixes latent stale-language bug for app dict too).
3. `autoErrorLabelKey` → returns the **default system key** per rule (`app.common.validation.tooShort` etc.) — see decisions C. Form ComboSelect + key_picker card pick it up automatically.
4. `json-config-ai-chat-panel.svelte` `handleNewErrorMessage`: generate `custom.config.{configKey}.errors.{rule}` and call `createTranslation('custom', …)` instead of `key.split('.')[0]` — **only on the new-message path**.
5. Existing-key flow unchanged: ComboSelect over `getDictKeys($dict)` — picking an existing `app.*`/`system.*` key reuses it, no row created.
6. Translations admin page: add `'custom'` to `staticModules`.

## Phase 4 — Verify
- Apply patch on dev DB; verify schema/table/indexes/grants; `pnpm check` FE; `tsc` BE.
- Rule enforcement: `POST ?module=custom` with `key='system.x'` → 400; `POST ?module=system` with `key='custom.x'` → 400.
- Live: key_picker → new message → 7 rows in `custom.translations` with `custom.config.*` keys → `$t` resolves → ComboSelect shows them.
- F5 while in `/system`: custom dict refetches via ETag mechanism at init; system dict via route loader.

## Open questions — RESOLVED
A. **Permission**: `POST /entities/translation` stays TRANSLATIONS_MANAGE (admin-only) **for now** — revisit when non-admin users need the assistant flow.
B. **Edit/delete**: admin-only (TRANSLATIONS_MANAGE). Users create, admins curate.
C. **Default suggestion + custom naming** (user clarification):
   - The auto-suggested key for a rule MUST default to the **existing system seed key** for that rule — NOT a custom key. Verified `app.common.validation.*` seeds (en-GB): `required, tooShort, tooLong, regexMismatch, invalidEmail, invalidUrl, invalidUrlProtocol, unsigned, invalidInteger, invalidNumber, invalid, invalidFormat`.
   - Default map: `required→required, min→tooShort, max→tooLong, regex→regexMismatch, url→invalidUrl, email→invalidEmail, unsigned→unsigned`; unmapped rule types → `invalid`.
   - `custom.config.{configKey}.errors.{rule}` is generated **only** when the user writes a NEW error message (handleNewErrorMessage path).

## Implementation deltas vs earlier draft
1. `autoErrorLabelKey` (type-config-schema.ts): becomes rule→default-system-key resolver (`app.common.validation.*`). The ComboSelect `defaultSearch`/`placeholder` in form + key_picker card pick it up automatically — suggested option resolves to an existing dict key.
2. `handleNewErrorMessage` (panel): generates `custom.config.{configKey}.errors.{rule}` and `createTranslation('custom', …)` — only on the new-message path.
3. No DB migration of existing keys (verified: zero user-created rows; all `system.settings.config.*` are `initial-setup` seeds — they stay).
