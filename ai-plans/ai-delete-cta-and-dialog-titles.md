# Plan: /ai delete semantics (soft delete + cache) & standardized destructive dialog titles

## Context (verified empirically)

### Current delete flow — already soft delete + Redis
- `/ai` page `confirmDelete()` → `DELETE /api/v1/entities/ai_model/{uuid}?version=` (with MFA step-up)
  → `ai_models_dal.deleteAiModel()` → `repo.delete()` (soft delete: `deleted_at`/`deleted_by`) → `invalidateCache()` (`dal:ai_model:*` keys).
- `ai_cerebellum_dal.deleteAiCerebellum()` exists identically (soft delete + `invalidateCache()` on `dal:ai_cerebellum:list`) — **but no FE delete CTA for cerebellum exists** (checked `AiCerebellumPanel`, `ai-cerebellum-selector`, `/ai` page).
- Standard DAL list queries use `deletedRecords: "EXCLUDED"` → deleted rows disappear everywhere automatically.

### Dialog titles — current state
| Call site | Component | Title |
|---|---|---|
| `EntityListTableDialogs` → `DeleteDialog` | `app.common.deleteConfirmTitle` = "Sei sicuro di voler cancellare il record?" ← **"record"** |
| `EntityListTableDialogs` → `BulkDeleteDialog` | `system.entities.list.bulkActions.deleteConfirmTitle` (generic) |
| `EntityListTableDialogs` → `RestoreDialog` / `BulkRestoreDialog` | `app.common.restoreConfirmTitle` / `bulkActions.restoreConfirmTitle` (generic, severity `warning`) |
| `/ai +page.svelte` inline `DialogBordered` | `app.common.deleteConfirmTitle` ← **"record"** |
| `roles/[uuid]` page | hand-rolled overlay + `system.settings.roles.deleteConfirmTitle` = "Elimina Ruolo" (**custom title**) |
| `MfaManagement.svelte` | `BorderedDialog` + `app.auth.mfa.deleteDialogTitle` (custom, non-entity) |
| `ModelCacheSection.svelte` | `DialogBordered` + `app.smart.regex.ai.cache.delete_confirm_title` (custom, non-entity — deletes **cached files**) |

### Entity naming metadata (DB `system.translations`)
- `system.entities.{entity}.singular` / `.plural` exist for: `config_entry`, `customer`, `organization`, `role_mapping`, `user_profile`.
- **Missing** `singular`/`plural` for: `ai_model`, `ai_cerebellum`, `service_registry`, `role` (used by roles page).
- All entities already have `system.entities.{entity}.title` (generic, e.g. "Modello AI").

## Objectives

1. **Cerebellum delete CTA** — add delete to cerebellum UI (the only place cerebellum rows are managed is `AiCerebellumPanel` sheet / `/ai` cerebellum list area).
   - Soft delete via `DELETE /api/v1/entities/ai_cerebellum/{uuid}?version=` (endpoint exists, MFA step-up same as model).
   - **Business rule**: if the deleted cerebellum is the model's *default* cerebellum (`is_default`/`default.true` semantics — verify field), also disable the model (`is_enabled=false` or model soft delete — confirm intended rule).
   - Non-default cerebellum → plain soft delete.
   - Redis invalidation already handled BE-side by `invalidateCache()`; also invalidate `dal:ai_model:*` if model is touched.

2. **Standardized auto-generated title for destructive/error dialogs**
   - `DeleteDialog`, `BulkDeleteDialog` get a required `entity` prop (translation key, e.g. `ai_model`).
   - Title auto-built inside the component: `{$t('app.common.deleteEntityTitle', { entity: $t('system.entities.{entity}.singular') })}` → "Elimina Modello AI". Bulk uses `.plural`.
   - Same for `RestoreDialog`/`BulkRestoreDialog` (severity `warning`, same pattern, `.plural` for bulk).
   - `/ai` page: replace inline `DialogBordered` with `<DeleteDialog entity="ai_model" recordName={modelToDelete?.name}>` — add `recordName` prop to show the record name under the description (replaces the inline `<span>`).
   - `roles/[uuid]`: migrate hand-rolled dialog to `DeleteDialog entity="role"` (add `system.entities.role.*` keys); drop `system.settings.roles.deleteConfirmTitle` usage.
   - **Non-entity destructive dialogs** (`MfaManagement`, `ModelCacheSection`) keep their custom titles — they don't delete entity records. Flagged for confirmation.

3. **Translation keys** (DB patch, ×7 languages: en-GB, en-US, it-IT, fr-FR, es-ES, de-DE, pt-PT)
   - New: `app.common.deleteEntityTitle` = "Elimina {entity}" / "Delete {entity}" / …
   - New: `app.common.deleteEntitiesTitle` (plural bulk) = "Elimina {entity}" with plural entity name
   - New: `app.common.restoreEntityTitle`, `app.common.restoreEntitiesTitle` (if we standardize restore too — else keep existing keys but entity-aware)
   - New: `system.entities.ai_model.singular/plural`, `ai_cerebellum.singular/plural`, `service_registry.singular/plural`, `role.singular/plural`
   - Soft-delete no-longer-used keys if fully replaced: `app.common.deleteConfirmTitle` stays (used as fallback? — decide: keep for non-entity deletes or remove usages).
   - Invalidate `translations:i18n:*` Redis keys after patch.

## Impacted files

**FE** (`primebrick-fe-v3`):
- `src/lib/components/entity-list-table/dialogs/DeleteDialog.svelte` — `entity` prop, auto title, optional `recordName`
- `src/lib/components/entity-list-table/dialogs/BulkDeleteDialog.svelte` — `entity` prop, plural title
- `src/lib/components/entity-list-table/dialogs/RestoreDialog.svelte` — `entity` prop (optional, same standard)
- `src/lib/components/entity-list-table/dialogs/BulkRestoreDialog.svelte` — `entity` prop
- `src/lib/components/entity-list-table/components/EntityListTableDialogs.svelte` — pass `entity`/`translationKey` down (already received)
- `src/routes/(app)/system/settings/ai/+page.svelte` — use `DeleteDialog` component, cerebellum delete CTA + default-cerebellum rule
- `src/lib/shell/sheets/panels/AiCerebellumPanel.svelte` — cerebellum delete CTA (if delete lives in sheet)
- `src/routes/(app)/system/settings/roles/[uuid]/+page.svelte` — migrate to `DeleteDialog`
- `src/lib/api.ts` — `deleteAiCerebellum` client fn if missing

**BE** (`primebrick-be-v3`):
- `db-meta/fire-and-forget/add_delete_dialog_entity_titles.sql` — new translation patch
- Possibly `ai_cerebellum` service — default-cerebellum delete rule if BE-side

**Docs**: `docs/user-guide/components/*.mdx` if dialog contract is documented; `.devin/rules/` note: destructive dialogs never take custom titles.

## Open questions for user
1. Cerebellum delete CTA placement: in the sheet panel (danger zone) or on the `/ai` cerebellum list row?
2. "Se il cervelletto è predefinito disabilita il modello stesso" — confirm: deleting the default cerebellum sets `ai_model.is_enabled=false` (soft-disable, model stays listed but disabled), not a soft delete of the model?
3. `MfaManagement` / `ModelCacheSection` custom titles — keep (non-entity semantics) or force generic?

## Acceptance criteria
- Delete confirm titles never say "record"; always "Elimina {EntitySingular}" / "{EntityPlural}".
- No call site passes a custom title to entity delete/restore dialogs.
- Cerebellum soft delete works end-to-end with Redis invalidation; deleted rows absent from all reads.
- Default-cerebellum deletion disables the model per rule.
- `pnpm check` 0 errors; verified in Playwright.
