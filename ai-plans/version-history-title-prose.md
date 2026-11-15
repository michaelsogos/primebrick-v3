# Version History panel — translated prose title with actor sheet link

## Status: 🟢 DONE — Plan date: 2026-11-15

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | FE: fix `getAuditActionLabel` lookup → `system.entities.version_history.actions.{lower}` (generic block, closed vocabulary) | ✅ done | 2026-11-15 | extracted to `version-history-title.ts` (`auditActionKey`) |
| 2 | FE: title → prose `{action} {by} {actorLink}` — color only on action span, neutral rest | ✅ done | 2026-11-15 | `colorClass` on inner span; `by` + neutral actor button |
| 3 | FE: actor link → `system:*`→`service.record`; else `entity.record` on `user_profile` (sheet owns notFound + pseudoRef) | ✅ done | 2026-11-15 | `changedBySheetTarget` helper; `{stack:true}` |
| 4 | BE patch: action values → participles (7 langs), add `actions.clone` + `version_history.by`, drop `create`/`delete` alias rows | ✅ done | 2026-11-15 | `20261115204500_version_history_prose_actions` applied live, signed |
| 5 | crm patch: soft-delete `crm.entities.*.version_history.actions.*` duplicates (784 rows, 16 entities) | ✅ done | 2026-11-15 | `20261115210000_version_history_actions_dedup` — 784→0 live |
| 6 | Tests: unit (label lookup + actor routing) + E2E title contract | ✅ done | 2026-11-15 | 4/4 unit; E2E green: prose regex on all titles + drill → entity.record uid-badge |
| 7 | typecheck + runtime verify + commit per repo | ✅ done | 2026-11-15 | svelte-check 0; ref-cell-sheet spec 16/16; fe `3728140` be `945bc9e` us `f26546b` |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Root cause (empirical)

`VersionHistoryPanel.svelte:197-201`:

```ts
const key = `system.entities.versionHistory.actions.${action.toUpperCase()}`;
```

Triple miss vs the real catalog: `versionHistory` (camelCase → real is `version_history`), no entity namespace, `toUpperCase()` (real keys are lowercase). Fossil from an old `entities.customer.versionHistory.*` codebase — `$t` returns the key → falls back to raw `action` → "INSERT" shown. Never worked in this file's lineage.

Real keys (live, verified on DB): `system.entities.version_history.actions.{insert,update,soft_delete,hard_delete,restore,create,delete}` × 7 langs (de-DE, en-GB, en-US, es-ES, fr-FR, it-IT, pt-PT). Missing: `clone` (AuditAction enum emits it since clone-as-audit-action landed).

## Design decisions

**Lookup level.** The action vocabulary is a closed platform enum (`INSERT UPDATE SOFT_DELETE HARD_DELETE RESTORE CLONE` — `dal/types.ts:265`). Per-entity `…entities.<e>.version_history.actions.*` blocks are seed-generated duplicates (crm: 16 entities × 49 rows = 784 live rows) — a parallel source of truth for a vocabulary that is identical everywhere. Decision: lookup hits the **generic block only**; per-entity action keys get soft-deleted in crm (task 5) so the generic block is the one served truth. Field labels keep their existing generic-first→entity-fields path (untouched).

**Prose.** Title becomes `{Action} {by} {actor}`:

- it-IT `Creato da <X>` · en `Created by` · fr `Créé par` · es `Creado por` · de `Erstellt von` · pt `Criado por`
- Action values migrate nouns → participles (`Creazione`→`Creato`, `Modifica`→`Modificato`, `Eliminazione`→`Eliminato`, `Ripristino`→`Ripristinato`, `Eliminazione definitiva`→`Eliminato definitivamente`; same shape other langs).
- New key `system.entities.version_history.by` (da / by / par / por / von / por) — composition in markup so the actor stays a component, not interpolated text.
- Aliases `actions.create`/`actions.delete` are seed duplicates of `insert`/`soft_delete` (enum emits neither) → soft-deleted, not updated.
- `entry.changed_by` null → action only, no `by`.

**Actor link** (same affordance as ref cells — `CELL_TEXT_LINK_CLASS` hover style):

```ts
changed_by.startsWith('system:')
  → openSheet('service.record', { code: changed_by.slice(7) }, { stack: true })
else
  → openSheet('entity.record', { entity: 'user_profile', value: changed_by }, { stack: true })
```

The two error states the user described are already owned by `EntityRecordSheet`: `pseudoRef` hero for non-UUID actors (`initial-setup`, garbage), `notFound` hero for UUID-shaped ids with no profile row. No new error handling in the panel. `changed_by_name` keeps doing display resolution server-side (user display_name → `system:*` service name → raw actor).

**Color.** `colorClass` moves from `Timeline.Title` (whole h3) onto the action `<span>` only — icon and version badge keep their existing semaphoric classes; the `by` + actor render neutral.

## Verification

- Unit: `getAuditActionLabel` resolves lowercase generic keys; actor routing `system:`→service.record vs uuid/raw→entity.record user_profile.
- E2E: ELT row → version badge → panel title shows translated participle + actor link; click actor → `entity-record-sheet` on user_profile (or notFound hero for a uuid with no profile; pseudoRef hero for `initial-setup`-style actors).
- DB: patch applied live, manifest signed; spot-query updated values.
