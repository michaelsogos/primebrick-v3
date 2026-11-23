# i18n — Translation-Key Surface Labels (user-meaning convention)

> Workstream: every label adjacent to a translation-key combobox names the
> translated content the user gets — never the stored key format.
> Canonical rule: `docs/ai/copy-tone-of-voice.md` "Concrete jargon cases".

## Status: ⏳ partial — Plan date: 2026-12-30

| # | Task | Status | When | Notes |
|---|---|---|---|---|
| 1 | Census of every label on translation-key ComboSelect surfaces (15 `format:"i18n_key"` meta columns + authored surfaces: configurations/create, badge, validation rules, dict extras, roles, smart-json topics) | ✅ | 2026-12-30 | TIC evidence — 3 label generations found (Label Key / (translation key) / plain), dev-jargon "Chiave/Key" pattern confirmed |
| 2 | Rename `*Key`→`*translation` labels — be patch `20261231230000` (system.translations 20 keys ×7 langs + public.translations app.smart.*), crm `20261230140000`, ai `20261229140000` | ✅ | 2026-12-30 | be `8f81946`, us `7f570df` — error family: "Traduzione errore obbligatorio"/"Required error translation", "Traduzione messaggio errore"/"Error message translation"; casing per-key preserved |
| 3 | Purge soft-deleted tombstones left by migration sweeps — be `20261231220000` (system+public), crm `20261230130000`, job-handler + emailsender `20261230100000` | ✅ | 2026-12-30 | 4.916 rows hard-deleted; soft-delete stays as USER feature (dict deleted view + restore.single) |
| 4 | Jargon anti-pattern documented in canonical copy-tone-of-voice doc ×4 repos (be/fe/us/ui, md5-synced) | ✅ | 2026-12-30 | ui `0630880`, be `8cf0d61`, us `d9f00e2`, fe `6a41cd9` |
| 5 | `crm.entities.customer_link_type.fields.inverse_label_key` — meta `type:"text"` without `format:"i18n_key"` → autowire canonical combobox (label already renamed "Traduzione etichetta inversa") | ⏳ | — | deferred by user — one-line meta fix, evaluate scoped vocab family |
| 6 | `roles/create` + `roles/[uuid]` `label_key` — plain TextInput → canonical combobox (needs `shell.settings.roles.*` scope wiring, no entity meta) | ⏳ | — | deferred by user — surface: `/system/settings/roles/create` field "Display Name Translation" |

## Residual risks / decisions

- `roles` pages are authored (no entity meta) — canonical control needs a
  manual scope; hint example `shell.settings.roles.label.admin` defines
  the vocabulary family.
- `inverse_label_key` vocabulary: same `*.entities.<tk>.rows.*` family or
  link-specific scope — decide at implementation.
- Tombstone purge is one-shot; future deletes by USERS still soft-delete
  (feature kept on purpose). Patches must always `DELETE FROM` — never
  soft-delete (SWE ≠ user semantics).
