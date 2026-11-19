# bugfix-i18n-config-ui-keys-restore

Status: TIC COMPLETE — awaiting PROCEED

## Obiettivo

Ripristinare 86 chiavi `system.settings.config.*` (× 7 lingue = **602 righe**)
soft-deleted per errore dalla patch
`be:db-meta/patches/20261208210000_i18n_segregation_config_cleanup.sql`
(applicata 2026-11-17 20:58 via post-merge `db:migrate`).

## Root cause (empirica, verificata)

La cleanup patch classificava "orphan" ogni chiave `system.settings.config.%`
non citata da `config_entries.label_key`/`description_key` — due blind spot:

1. **Chiavi UI del TypeConfigBuilder** — 74 chiavi referenziate da codice FE
   (`$t('system.settings.config.type_config.*')`, `currency_select.*`,
   `phone_prefix_select.*`, `protocol_select.*`, `protocol`, `type`) —
   nessuna citazione in `config_entries` → cancellate come "orfane".
2. **Citazioni dentro `type_config` JSON** — 12 chiavi citate da live
   `config_entries` via campi `*_key` interni al JSON (`label_key` dei
   badge values, `required_error_label_key`, `min_error_label_key`…):
   `auth.idp_type.*`, `auth.auth_mode.*`, `auth.password_policy.*`,
   `auth.auth_roles_path.errors.invalid_format`,
   `auth.idp_type.errors.required`.

Censimento eseguito su DB live (`127.0.0.1:5432/primebrick`):
- deleted distinte: 157 chiavi × 7 lingue
- restore set: **86 chiavi** (74 FE + 12 type_config-cited) — lista
  completa in `/c/Users/Micha/AppData/Local/Temp/restore_keys.txt`,
  prodotta da intersezione (FE literals ∪ type_config `\w*_key` citations)
  ∩ deleted set
- restano deleted 71 chiavi — genuinamente migrate negli schema modulo
  (es. `ai.settings.config.ai.ai_assistant_model.*` live in
  `ai.translations`, config_entries ripuntati) — NON ripristinare.

## Cambiamento

**Un solo file**: `be:db-meta/patches/20261222100000_i18n_restore_config_ui_keys.sql`

```sql
-- Restore the 86 system.settings.config.* keys wrongly soft-deleted by
-- 20261208210000_i18n_segregation_config_cleanup.sql. The cleanup census
-- counted only config_entries.label_key/description_key citations; these
-- keys are referenced by FE TypeConfigBuilder code or by *_key fields
-- inside config_entries.type_config JSON.
UPDATE system.translations
   SET deleted_at = NULL,
       deleted_by = NULL,
       version    = version + 1,
       updated_by = 'migration-i18n-restore-config-ui'
 WHERE deleted_at IS NOT NULL
   AND deleted_by = 'migration-i18n-segregation'
   AND key = ANY('{<86-key list>}'::text[]);
```

- Restore deterministica: lista esplicita delle 86 chiavi embedded nel
  patch, nessun predicato — auditable e idempotente (`deleted_by` guard
  evita di resuscitare delete legittimi futuri).
- `version+1` e `updated_by` seguono la convenzione delle altre patch
  i18n del repo.

## Fuori scope (registrato, non fixato)

- `resolveDictModuleFromRoute` → modulo `api` per pagine BE-owned →
  `GET /translations/api/:lang` → schema `api` inesistente → 503
  `TRANSLATIONS_SCHEMA_MISSING` (spam console). Fix corretto: il modulo
  `api` dichiari `translations_module: 'system'` nel census. Registrato
  in `tech-debt-register.md` come task separato (Task 3 di questo piano).

## Task list

| # | Task | Verify |
|---|------|--------|
| 1 | Creare patch `20261222100000_i18n_restore_config_ui_keys.sql` con la lista 86 chiavi | `bun run db:migrate` applica senza errori |
| 2 | Verificare DB: 0 righe deleted nel restore set; dict `system` it-IT contiene `type_config.required` | query `deleted_at is not null and key=ANY(list)` → 0 |
| 3 | Registrare il bug `api`-dict-module in `tech-debt-register.md` | entry presente |
| 4 | Verifica runtime: ricaricare `/system/settings/configurations/create` — etichette regole tradotte | browser |
| 5 | Commit convenzionale su branch `bugfix/` (GitFlow — non su develop) | branch attivo |

## Rischi

- **Basso**: UPDATE mirata con guard `deleted_by='migration-i18n-segregation'`
  — non tocca righe vive né delete di altre cause.
- Idempotente: rieseguirla non cambia nulla (deleted_at già NULL → 0 righe).
- Nessuna migrazione di chiavi: restore in place, stesso schema, stessa key —
  i dict ETag cambiano automaticamente (updated_at nuovo > cached_at).
