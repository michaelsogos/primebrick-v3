# Dict page — create-flow anatomy, validation & field labels polish

> Workstream plan — extracted from `crm-customer-model-local-address.md`
> Step 4 (dict archetype) residuals, verified empirically 2026-11-22 by
> direct user review of `/crm/settings/customer_types` + source audit.
> Parent plans: `metadata-driven-page-system.md` (umbrella — residual
> note (e): dict entity heterogeneity), `entity-identity-column-standard.md`
> (dict create-draft semantics: draft supplies code+label_key).
> Reference anatomy: `configurations/create/+page.svelte` (FormLabel +
> FormLabelWithPriorityHelp + TranslatedFormFieldErrors + reactive
> convention placeholders + debounced key-exists probe).

## Status: 🔵 TOC IN PROGRESS — tasks 15–17 ✅ shipped; Phase A (1–3) TIC evidence recorded below with user-locked decisions — awaiting PROCEED on tasks 1–3 + 18

---

## TIC evidence — the 8 user findings vs code

| # | Finding (user) | Verdict | Evidence |
|---|----------------|---------|----------|
| 1 | NEW → riga in alto, **nessuna CTA di annullamento** | ✅ confirmed | `DictDraftRow.svelte:111` — right 2/12 zone "reserved — drafts carry no item CTAs today"; no `ondiscard` prop exists anywhere; `drafts[]` only shrinks via `saveAll` (`EntityDictPage.svelte:448`) or page teardown. A draft row is **undeletable** — worse than a tainted row, which at least has revert. |
| 2 | NEW cliccabile all'infinito → infinite bozze | ✅ confirmed | `handleAddRow` (`EntityDictPage.svelte:187-201`) appends unconditionally; `dict-toolbar-add` (`:663`) never disabled. No single-draft gate. |
| 3 | badge "new" — a che serve? | ✅ confirmed ambiguity | `DictDraftRow.svelte:60-62` — static `app.common.new` badge filling the title slot. It IS meant as the unsaved-state marker, but it doesn't join any state vocabulary: saved rows get taint-warning styling only (footer lists titles); the **translation editor already owns saved/modified/draft/missing semantics** — the vocabulary exists and the dict badge is alien to it. Design decision needed (see task 3). |
| 4 | input senza label e tooltip | ✅ confirmed | `FormFieldDispatcher` mounted bare in `DictDraftRow` (code `:65`, value `:96`) and `DictRow` (`:267`) — no `FormLabel`, no `FormLabelWithPriorityHelp`, no field errors anatomy. Only `TranslationKeyCell` passes `aria-label`. Every other write surface (config-create, EntityFormPage) uses the label+tooltip anatomy (`EntityFormField.svelte:7-11`: "icon + translated label + priority tooltip + optional editing badge"). |
| 5 | nessuna validation | ⚠️ partial | `missingRequired`/`draftValid`/`invalidRowUids` exist (`EntityDictPage.svelte:246-272`) — required-empty only. **Missing**: format rules (code charset — seeds are lowercase snake), `pattern`/`max_length` column-constraint checks, any server-shape pre-validation. Config-create has a full zod schema + `isSnakeKey` refine + `superRefine`; dict has none. |
| 6 | nessun check che la chiave sia valida e non già esistente | ✅ confirmed | `code` is `@Unique() nullable:false` (`DictEntityBase:56-58`) — server catches dup at save → opaque 409. No client probe, no charset check. The reference pattern EXISTS: `handleKeyInput` + 500ms debounce + `/list` fetch + `keyExistsError` + `keyChecking` gate (`configurations/create/+page.svelte:214-242`). Dict needs the same, scoped `filters:[{field:'code',op:'='}]`. |
| 7 | esteticamente estranea | ✅ confirmed (grounded) | `DictDraftRow`: custom `border-l-[5px] border-l-primary/50` accent + bare mid-row inputs = spreadsheet anatomy. Every other write surface uses label-over-input `space-y-2` field anatomy. Rows themselves (checkbox + 3-line identity + centered bare input) are ConfigListRow-derived — the *unlabeled floating inputs* are the foreign part. |
| 8 | anche i value devono avere label + tooltip lingua/translation-key come config-create | ✅ confirmed gap | Config-create: `FormLabel` + `FormLabelWithPriorityHelp`(priority+optional chip) + reactive convention placeholder committed on empty save (`labelKeyPlaceholder` → `system.settings.config.auth.${key}.label`, committed at `:138`). `TranslationKeyCell` already has `suggestedKey` convention (`custom.${rowsPrefix}${code}`, `:47-50`) as **placeholder only** — never committed on empty; no label, no help tooltip explaining what a translation key IS, no optional chip. |

## Latent bug discovered in TIC (not in the user list)

| # | Finding | Evidence |
|---|---------|----------|
| L1 | **Required-extras blocker** — drafts render ONLY `code` + `valueColumn`. `requiredColumns()` iterates ALL `editableColumns` with `nullable===false`. `contact_types.value_kind` is `nullable:false` (`contact_type_entity.ts:35`) → on dict-migration `draftValid` is false forever → `canSave` false forever, and the `value_kind` error never renders (no input exists for it). **Any of the 8 remaining dict entities with a required extra column cannot be created from the dict page today.** Fix is prerequisite to the 8-entity migration. | `DictDraftRow.svelte:44-48` (only code+value rendered), `EntityDictPage.svelte:183-186` (requiredColumns), `contact_type_entity.ts:35` |

## Incident 2026-11-19 — accidental delete, no confirmation

User accidentally deleted `customer_link_types` row `consultant`
(`uuid 01a1cbeb-8d36-7e9b-85d8-f557f3a5d2f4`, deleted 2026-11-19 23:29,
version 2) **because the dict page item delete shows NO confirmation
dialog** — `EntityDictPage.deleteRow` issues `apiFetch(DELETE)` directly.

**Restored live** via the `restore()` endpoint's exact SQL semantics
(`deleted_at/by=NULL, updated_at/by=now/actor, version+1` WHERE uuid +
version guard) → row back at version 3, `updated_by` = the deleting
actor. Caveat: raw SQL does not write the fire-and-forget audit-partition
row the endpoint appends — acceptable gap on the dev DB, noted honestly.

**Requirement (user, verbatim): the action-meta `DELETE` op must imply a
confirmation dialog BY CONSTRUCTION** — for ELT row-item menu, ELT bulk
delete, dict item delete, dict bulk delete. Not a thing each page wires
by hand: today ELT has `DeleteDialog`+`BulkDeleteDialog` but they're
wired inside `useRowActions`/`useBulkActions` composables — any op
invoked outside those composables (exactly what `EntityDictPage` does)
bypasses confirm entirely → convention, not construction.

## Deep-dive census 2026-11-23 — native dialogs + delete-surface audit

User mandate: *"niente usa window.confirm nativi a meno di hack — lint
che lo impedisca, conta le violazioni prima di esentarle pigramente."*

### Native `confirm()`/`alert()`/`prompt()` census (src/, tests excluded)

| # | File | Call | Surface | Fix |
|---|------|------|---------|-----|
| 1 | `useBulkActions.svelte.ts:405` | `confirm(tFn(confirm_key))` | custom **bulk** op gate — raw native, no anatomy | → governed invoker dialog |
| 2 | `useUnsavedChangesGuard.svelte.ts:22` | `confirm(get(t)(key))` | unsaved-changes navigation guard | → anatomy dialog (in-app nav) |
| 3 | `useUnsavedChangesGuard.svelte.ts:38` | `confirm(get(t)(key))` | same guard, second path | → same |
| 4 | `translations/+page.svelte:127` | `` confirm(`Delete…`) `` + **hardcoded untranslated string** | **5th delete surface** — translation-row delete | → `DeleteDialog` standard |
| 5 | `EntityTablePage.svelte:186` | `alert('Popup bloccato…')` + **hardcoded Italian** | window.open fallback | → `pushNotification` + i18n key |
| 6 | `EntityTablePage.svelte:198` | `alert('Popup bloccato…')` | same | → same |

`window.*`-prefixed natives: 0 · `prompt(`: 0 · `date-wheel-picker` local
`function confirm()` is a false positive (declaration, not a call).

### Delete-surface audit — confirm vs step-up matrix

| Surface | Confirm today | MFA step-up | Request path |
|---------|---------------|-------------|--------------|
| ELT row delete | ✅ `DeleteDialog` | ❌ **missing** — bare `apiFetch` | `confirmDeleteRowImpl` → `resolveOpUrl('delete.single'|'purge.single')` |
| ELT bulk delete | ✅ `BulkDeleteDialog` | ❌ **missing** | `confirmBulkDeleteImpl` → `resolveOpUrl('delete.bulk')` |
| ELT row/bulk restore | ✅ RestoreDialogs | — (POST) | composable |
| **Dict row delete** | ❌ **none (incident)** | ✅ `stepUp.executeWithToken` | `deleteRow` → raw `apiFetch(DELETE)` |
| **Dict bulk delete** | ❌ none | ✅ stepUp | `bulkDelete` → `POST /bulk-delete` |
| **Dict restore** | ❌ none (ELT has RestoreDialog — same hole, POST verb) | ❌ | `restoreRow`/`restoreSelected` |
| Row custom op (`runEndpointAction`) | ❌ **`confirm_key` ignored entirely** — DELETE-method custom op fires unconfirmed | ✅ stepUp | `ep.method \|\| 'POST'` |
| Bulk custom op | ⚠️ native `confirm()` only | ✅ stepUp | `handleBulkCustomAction` |
| `roles/[uuid]` page purge | ✅ `DeleteDialog` page-wired | ❌ `useRoleMappings.remove` bare | `DELETE /role_mapping/:uuid/purge` |

### Why the dict page had no confirm — the construction root cause

Not forgotten wiring: `EntityDictPage` has **no `dialogs` composable at
all** — ELT owns `openDeleteDialog`/`setRowToDelete` inside its own
composables, so a surface that doesn't consume them has **no channel to
ask**. The invoker must bring its own dialog host or the channel can't
exist by construction.

### Already-doc'd, not enforced

`docs/ai/entity-confirm-dialogs.md` prescribes `DeleteDialog`
(destructive)/`RestoreDialog` (warning)/bulk twins — the contract exists;
zero mechanism binds op invocation to it.

## Design decisions (locked by user 2026-11-22 — tick-confirm lifecycle)

**The draft lifecycle is a composer→pending state machine** — semantic
precedent: `RuleFilterEditor` ("field + operator + value → committed list",
composer gated on upstream completeness via `addDisabled` → `commit()` pushes
into the displayed array).

```
NEW → [composer row open]  ← ONE at a time (gate)
        inputs + ✓ confirm (disabled until valid) + ✕ discard
        ✕ → composer dies, nothing persisted
        ✓ → push into pending[] → renders as a NORMAL DictRow
            (same anatomy, marked "da salvare" via the INFO-tone
            accent — border-l/styling, exactly like today's draft —
            NO chips/badges on rows: badges live footer-left only)
            selectable via checkbox like every row
            delete CTA = UNDO semantics (drop from pending[] — zero
            server work, no MFA) — it was never saved
SAVE → POST per pending → real row → "amen" (real delete semantics)
NEW disabled iff a composer is open — confirmed pendings do NOT block
```

1. **Single-composer gate**: NEW disabled iff the composer is open —
   confirmed pending rows may coexist freely (the "infinite rows" bug was
   infinite *unconfirmed* drafts, not multiple pendings).
2. **Composer CTAs**: `✓` confirm (primary, `Check` icon — same "accept the
   input" semantic as email/phone trailing ticks and the rule-filter
   composer) disabled until the composer validates; `✕` discard beside it.
3. **Pending = row, not draft-row**: confirmed pendings render through
   `DictRow` with a `pending` variant — "da salvare" marking = the
   INFO-tone row accent (border-l/styling, as today), no audit line,
   checkbox live, item CTA = undo-drop (`dict-pending-undo` testid) —
   NOT trash→server.
4. **NO in-row chips** (user, 2026-11-22): badges/chips live ONLY in the
   footer-left list (tainted titles + `+N new` counter) — every badge
   text is i18n-translated as always. Row-level state stays signaled by
   accent color: pending=info, tainted=warning (SelectableRow prop), as
   today. The composer's "New" badge inside its own title zone is part
   of the composer surface, not a row chip — it keeps `app.common.new`
   translated copy.
5. **Label/tooltip wrapper**: a dict-scoped `DictFieldCell` (or reuse
   `EntityFormField` label block) — label text + `FormLabelWithPriorityHelp`
   tooltip + `TranslatedFormFieldErrors`-style error line under EVERY
   input, composer and saved rows alike. Compact row layout kept — label
   above input inside the cell.
6. **Validation layer**: per-column client rules derived from meta
   (required + `max_length`/length + pattern where meta carries it) +
   dict-specific `code` = snake_case charset (`isSnakeKey` precedent) —
   errors under the field; composer-confirm and save both gate on
   aggregate validity.
7. **code uniqueness**: debounced probe on the dict `/list` with
   `filters:[{field:'code',op:'='}]` (cheaper than config-create's
   unfiltered fetch) → inline "already exists" error + confirm/save gate;
   race-tolerant (server `@Unique` stays the authority).
8. **label_key empty-commit**: config-create contract — empty label_key
   at confirm/save commits the reactive `suggestedKey` convention
   (tooltip promises "suggested automatically").
9. ~~**Required extras**: composer renders ALL `editableColumns`~~ —
   **SUPERSEDED by task-8 resolution (2026-11-22)**: composer stays
   code+label_key per `entity-identity-column-standard`; required extras
   complete on the PENDING row via `entity.dictExtras` (task 4b/8) —
   `canSave` gates on full `missingRequired`, the extras CTA is the
   remediation. `sort` stays auto-seeded +10, hidden.
10. **DELETE ⇒ confirm by construction** (user, 2026-11-22 — mandatory
    after the incident; deepened 2026-11-23): a single governed invoker
    (`runEntityOp`-class in `lib/entity-list/` — same module as
    `action-endpoints.ts`, which already owns `findActionEndpoint` +
    `fillActionPath` meta resolution) receives `{op, entity, row|selection}`
    and owns the request:
    - `endpoint.method === 'DELETE'` (delete/purge) ⇒ **always** confirm —
      no API path exists to fire it unconfirmed
    - `action.confirm_key` set (any verb) ⇒ confirm via the SAME anatomy
      dialog — kills the native-`confirm()` custom-op path AND the
      row-custom-op `confirm_key`-ignored hole
    - **always** wraps `stepUp.executeWithToken` — closes the ELT/standard-
      delete MFA asymmetry (dict already wraps; ELT gains it for free)
    - `severity = chrome?.color ?? 'destructive'` for DELETE; restore ops
      keep `warning` — the closed `ActionColor` vocabulary is the only
      tone source
    - dialog host is invoker-owned state + ONE `<EntityOpConfirmHost>`
      mounted per consuming page (dict has no `dialogs` composable —
      the channel itself was missing, not just the wire)
    - `RFC7807` error surfacing + `pushNotification` success path
      standardized inside the invoker (each call-site today hand-rolls
      its own)
    Converging surfaces: ELT row/bulk delete + restore, dict row/bulk
    delete + dict restore, roles/[uuid] purge, translations row delete,
    row/bulk custom ops (confirm_key honored via anatomy).
    `dict-pending-undo` stays exempt — local drop, never a request.
11. **`no-native-dialog` lint** (user, 2026-11-23): check-standards rule,
    `NO_EXEMPT_RULES` member — cannot be suppressed inline, exemptions
    only via reviewable config `allowPaths` (and we add none until the
    census fixes land). Profile: `FE_RULES` + `LIB_RULES` — the `fe/src`
    remote-module scan inside service repos inherits it automatically.
    Pattern covers `confirm(|alert(|prompt(` in expression position and
    `window.|globalThis.` prefixes; method definitions and `foo.confirm()`
    are not calls (regex requires an argument char — declarations
    `confirm() {}` don't match). Census BEFORE any fix: **6 violations**
    (4 confirm + 2 alert — table in the deep-dive section).

## TODO list (TOC candidates — one row per task)

## Phase A TIC — empirical evidence + locked decisions (this session)

Read-verified: `EntityDictPage.svelte`, `DictDraftRow.svelte`,
`DictRow.svelte`, `TranslationKeyCell.svelte`, `SelectableRow.svelte`
(ui), `pending-translations.svelte.ts`, `RuleFilterEditor.svelte`,
`entity-metadata.mdx`, `column-constraints.ts`, `customer_type` /
`customer_link_type` meta+list-config+dto, `customer_links/dto.ts`.

**Supported by construction** (no workaround needed):
- `pending[]` = second client array `{__draft, values}` beside `drafts`;
  confirm = array move; `saveAll` POST loop repoints at pendings.
- `✓` gated CTA = `rule-filter-add` precedent (ghost icon-sm, `text-info`,
  `disabled`+`title`/`aria-label` — RuleFilterEditor:307).
- Pending row identity: synthesize `row[uid] = d.__draft` (`"d1"` never
  collides with real uuids); `taintedUids`/`values`/`originals` iterate
  `list.rows` only — pendings stay on `d.values` (task-4b contract).
- No audit line falls out of the synthesized row (no `version`/
  `updated_at` → L3 renders nothing).
- `dict-toolbar-add` disabled + `title` — Button already supports both.
- `dropPendingTranslation(owner, key)` exists per-key
  (pending-translations:55) — the discard/drop handler must drop queued
  translations for every `*_key` value the row carried (orphan-write gap
  G3 — same hole exists on today's draft discard since the composer can
  queue translations via the languages CTA).

**Locked by user (Phase A TIC):**

- **D1 — composer-confirm gate**: `✓` enabled iff the COMPOSER-scoped
  fields are filled (`code` + `label_key` non-empty). `missingRequired`
  over ALL required columns stays the SAVE gate on pendings — required
  extras complete via task-8 sheet CTA. Wiring `✓` to today's full
  `draftValid` would deadlock `customer_link_type` (`inverse_label_key`
  required, invisible to the composer).
- **D2 — pending position**: appended AFTER the saved stream in
  insertion order (todo-list semantics), reorderable so the rendered
  order equals post-save order ("almost no visible difference
  saved/not-saved"). Composer stays the top row while open. The reorder
  chain must span the saved+pending boundary (sort swap across
  `values[uid]` ↔ `d.values`).
- **D3 — pending checkbox**: joins the shared `useSelection`. Bulk
  delete partitions the selection: pendings → local drop (in-memory
  "morte definitiva" — never persisted, no confirm needed beyond the
  dialog copy); saved rows → governed `delete.bulk` path unchanged.
  Select-all should include pendings for parity.
- **D4 — INFO accent**: extend canonical `SelectableRow` with an `info`
  tone prop (priority over `selected`, semantic `--info` token — the
  same mechanism `warning` uses today). Plan line ~140 already prescribes
  "SelectableRow prop"; the prop simply does not exist yet — it is an
  extension to the canonical component, not a workaround.
- **D5 — immutable TIC finding (new task 18)**: `code` immutability was
  already locked 2026-11-22 (open-Q3) but is honored ONLY by FE anatomy
  (DictRow badge). Empirically: no `immutable` flag on any dict
  list-config; `customer_type`/`customer_link_type` update schemas are
  `zPartialNoDefaults(BaseSchema)` → PUT **accepts `code`** today.
  Canonical precedent for server enforcement: `CustomerLinkUpdateBodySchema`
  (strict, narrowed to mutable fields only, comment cites meta
  `immutable:true`). `withColumnConstraints` forbids authoring
  `immutable` on `@Relation` ends only — authoring it on `code` is
  legal. `label_key` stays mutable (locked open-Q4: value cell
  UNCHANGED). Marking `code` `immutable:true` also prevents it leaking
  into `entity.dictExtras` (task 4b binds `updateEditableColumns`).

| # | Task | Status | Evidence/where |
|---|------|--------|----------------|
| 1 | Composer CTAs — `✓` confirm (`Check` primary, gated on composer-scoped validity D1 — `rule-filter-add` precedent) + `✕` discard (`dict-draft-discard`); ✓ → `pending[]` push, ✕ → composer dies. Both drops must `dropPendingTranslation` the row's `*_key` values (G3) | ✅ DONE fe `8eba518` | `DictDraftRow` CTAs + `handleConfirmDraft`/`handleDiscardDraft` (+`dropQueuedTranslations` G3); `composerValid` scoped to composer fields (D1). E2E: discard kills composer, confirm→pending, zero POSTs |
| 2 | Single-composer gate — `dict-toolbar-add` disabled iff composer open (pendings do NOT block) + tooltip reason | ✅ DONE fe `8eba518` + be `8e8ac16` | `dict-toolbar-add` disabled iff `drafts.length>0` + `system.entities.dict.composer_open` reason (patch `20261224120000`, ×7, signed+migrated). E2E: disabled while open, re-arms on confirm AND discard |
| 3 | `DictRow` `pending` variant — renders confirmed pendings APPENDED after the saved stream in insertion order, reorderable (D2): INFO-tone accent via extended `SelectableRow` (D4), shared-selection checkbox w/ bulk-delete partition (D3), undo-drop item CTA (`dict-pending-undo`, zero server + G3 translation drop), no audit line | ✅ DONE fe `8eba518` + ui `1ab1b95` | `SelectableRow` gained `info` prop → `border-l-info` (priority info>selected); pendings render via `DictRow` synthetic rows (`selectable-row-d1…`, `__draft` id under uid — no audit fields → L3 absent by construction); `renderChain` = saved ids + pending ids (D2 append order); `move()`/`selectableUids`/`bulkDelete` span the boundary (D3 partition: pending-only drops silently, mixed rides `delete.bulk` then local drop). E2E: `border-l-info`, undo CTA, checkbox select, pending-only bulk drop — **zero POSTs asserted** |
| 4 | `DictFieldCell` labeled wrapper — label + priority-help tooltip + error line for the composer's inputs (code, label_key, required extras on the composer? NO — composer stays code+label_key per convention; the cell serves composer inputs + any inline row inputs) | ✅ DONE fe `fabad79` | `DictFieldCell.svelte` — PrimeField anatomy: plain `<label for>` + `$props.id()` + `FormLabelWithPriorityHelp` via `resolveFieldHelp('form')` + `control({id})` snippet + error line (`dict-cell-error`). **Fix**: `FormLabel` primitive needs `Field.Root` ctx → runtime crash `labelId on undefined` found via pageerror; plain label per PrimeField. `controlProps{ id, aria-invalid, aria-describedby }` into `FormFieldDispatcher`; `id` prop into `TranslationKeyCell`→`ComboSelect` |
| 4b | **`entity.dictExtras` sheet** — new registry panel: `SheetPanelLayout` + `EntityFormField` per `updateEditableColumns` bound to the row values-map (saved `values[uid]` / pending `d.values`) → taint → bulk-save; extras CTA `dict-row-extras` on saved+pending rows; label-family extras → `TranslationKeyCell`; required-missing extras gate `canSave` with the extras CTA as remediation | ⏳ | `sheet-manager` registry + new panel in `entity-dict-page/`; reuses `EntityFormField`/'update' mode |
| 5 | Meta-derived client validation — required + max_length/length + pattern; `code` → snake_key charset; errors inline; composer-confirm AND `canSave` gate on aggregate | ✅ DONE fe `fabad79` | `columnErrors` — `nullable===false` + `max_length`/`min_length` + authored `pattern` + `isSnakeKey` on `code` (`@primebrick/ui`→core re-export). `suggestion_eligible` set exempts `label_key`/display_field from the required gate on CREATE only; `composerErrors` scoped to `composerKeys` (code+label_key+displayField); confirm gates on `composerValid` |
| 6 | `code` uniqueness probe — debounced `filters:`-scoped `/list` fetch, inline exists-error + confirm/save gate | ✅ DONE fe `fabad79` + be `0e5281d` | `$effect` on `composerCode` — 500ms debounce, `filters[0][field=code,op==,value]` + `page_size=1` on `/list` (extJsonParse); `exists`→`code_exists` inline err + `checking`/`exists` gate confirm; stale-probe guard; failure never blocks (server 409 backstop). i18n `system.entities.dict.code_exists` ×7 (patch `20261225120000`, signed+migrated, DB-verified) |
| 7 | `label_key` empty→commit `suggestedKey` + tooltip copy "suggested automatically" + optional chip — config-create parity | ✅ DONE fe `fabad79` | `dict-suggestion.ts` — shared `slugifyKey`/`suggestedKeyFor`; `TranslationKeyCell` placeholder + `saveAll` pending loop commit (`d.values[displayField]`) consume the same helper; `suggestion_optional` variant on `DictFieldCell` → optional chip + `optional_tooltip_*` help. E2E: DB-asserted `label_key = custom.entities.customer_type.rows.<code>` |
| 8 | Composer stays code+label_key (create-draft convention); **pending rows get the extras CTA too** → `entity.dictExtras` bound to `d.values` → required extras completable pre-save → L1 resolved WITHOUT breaking the convention (`sort` hidden+seeded) — **unblocks the 8-entity migration** | ⏳ | `DictDraftRow`→pending flow + task 4b |
| 9 | Anatomy restyle — composer row on canonical field anatomy (label-over-input), accent strip aligned to draft-state semantics not decoration | ⏳ | `DictDraftRow` grid/chrome |
| 10 | i18n keys ×7 for new copy (draft chip, discard, confirm, code help, exists error, snake_key error, add-disabled reason) — BE-owned patches | ⏳ | `be` i18n patch + us `crm` seeds where module-scoped |
| 11 | **E2E (headed, mandatory)** — `entity-dict-draft-lifecycle.spec.ts`: ✕ kills composer; NEW disabled while composer open; ✓ gated until valid; confirm→pending renders in stream w/ info accent; pending checkbox+undo-drop works; validation errors visible; dup `code` blocked; empty label_key commits suggestion; **extras sheet opens from row CTA, `inverse_label_key` editable on `customer_link_types`, edits feed bulk-save**; save persists pendings+extras | ⏳ | new spec + `entity-dict-page.spec.ts` deltas |
| 12 | **`no-native-dialog` lint rule** — check-standards `NO_EXEMPT`: pattern bans `confirm(`/`alert(`/`prompt(` expression calls + `window./globalThis.` prefixed; FE_RULES + LIB_RULES (fe/src scan inherits); census 6 violations recorded BEFORE fix | ✅ DONE `8be36e0` | `primebrick-v3-sdk/tools/check-standards.ts` on `feature/no-native-dialog` — 8 new E2E tests, 45/45 green; real fe run = **exactly 6 violations** (predicted set, zero FP), ui + 4 remote fe/src = clean |
| 13 | **`runEntityOp` governed invoker** — `lib/entity-list/use-entity-op.svelte.ts` + `EntityOpConfirmHost.svelte` mounted ONCE in `(app)/+layout.svelte`: resolves endpoint from `meta.actions`; `ep.method==='DELETE'` OR `confirm_key` set ⇒ confirm mandatory (module-level state + ONE host — channel exists by construction); always `stepUp.executeWithToken`; severity = `chrome?.color ?? 'destructive'` (restore=`warning`, generic confirm_key-ops=`warning`); `Promise<boolean>` (true iff dispatched AND ok); host decision (b) AppShell-global per user; MFA action binding preserves `delete`/`bulk_delete`/`restore`/`bulk_restore`/`purge` + custom=`action_name` | ✅ DONE `144edba` | fe `feature/delete-confirm-gate`; svelte-check clean (only 2 pre-existing `dompurify` errors on develop); `generic` family renders chrome-driven DeleteDialog/BulkDeleteDialog anatomy (label_key→title, confirm_key→question, color→accent) |
| 14 | **Dict × gate** — `deleteRow` + `bulkDelete` + `restoreRow`/`restoreSelected` reroute through invoker; `dict-pending-undo` exempt | ✅ DONE `144edba` | `EntityDictPage` — all 4 paths via `runEntityOp`; local stepUp + `MfaStepUpDialog` removed (host owns it). **Fix found via E2E**: ext-json `version` arrives as string → `versionQs` accepts number\|bigint\|numeric-string (was 400 VERSION_REQUIRED); bulk body via `extJsonStringify` (bigint-safe). Wire-level verified: `DELETE ?version=1 → 200`, `POST /bulk-delete → 200`, `POST /{uuid}/restore?version=2 → 200` |
| 15 | **ELT converge × gate** — row/bulk delete + restore through invoker (gains step-up); custom ops `confirm_key` → anatomy dialog (kills native confirm at :405 AND the row-side confirm_key hole) | ✅ DONE `e3b51b7` | `useRowActions`/`useBulkActions` — every op via `runEntityOp`; dead `confirmDeleteRowImpl`/`confirmBulkDeleteImpl` + `EntityListTableDialogs` mounts removed; `EntityOpConfirmHost` gained bulk-scope plumbing (totalCount + scope choicebox); custom `confirm_key` → anatomy dialog at BOTH scopes; svelte-check 0/0 |
| 16 | **Peripheral surfaces** — roles/[uuid] purge + translations row delete → invoker/`DeleteDialog`; `EntityTablePage` alert ×2 → `pushNotification` + i18n keys; `useUnsavedChangesGuard` ×2 → anatomy dialog for in-app nav (beforeunload edge decided separately — see open-Q5) | ✅ DONE `e3b51b7` + be `0dfea8c` | **Empirical finding**: roles/[uuid] DeleteDialog was DEAD (deleteOpen never set, no CTA — purge unreachable) → dead dialog + handleDelete + `useRoleMappings.remove` removed; role deletion governed via ELT list. translations remove() → `runEntityOp` (custom executor carries `?module=`). EntityTablePage alert×2 → `pushNotification` (`app.common.popup_blocked`). useUnsavedChangesGuard ×2 → governed module-channel dialog (`UnsavedChangesGuardHost` in app layout); `beforeunload` keeps native contract (async dialog cannot block unload — decision recorded). i18n: be patch `20261223100000_i18n_confirm_gate_keys` (6 keys ×7, signed) + FE fallback app.* keys. Standards: **0 no-native-dialog violations** |
| 17 | **E2E confirm coverage** — dialog-before-request on all 6 delete paths + dict restore; cancel → zero request; custom op with `confirm_key` shows anatomy dialog | ✅ DONE `b90ffbf` + be `9770466` | `entity-op-confirm-gate.spec.ts` — **8/8 headed green**: 4 dict + 3 ELT (row delete on `email_template`; bulk delete + row restore on `job_trigger` — only entity exposing the full op set) + 1 custom-op `confirm_key` (`user_profile` suspend/reactivate round-trip on the ephemeral actor — gated via new `actions_overrides` chrome + `20261223110000` i18n patch). Every test: dialog before request, cancel→0, confirm→1×200 |
| 18 | **`code` immutable contract (server+meta)** — mark `code` `immutable: true` in dict list-configs; narrow each dict `*UpdateBodySchema` to drop `code` (+`.strict()` per `customer_links` precedent); bake the convention into every future migrated dict (account_kinds, company_dimensions, consent_types, contact_types, legal_forms, local_address_types, marketing_qualifications, qualifications) | ✅ DONE us `f0a890c` + fe `8eba518` | All 10 dict modules: `code` carries `immutable:true` (list-config) + `*UpdateBodySchema` = `Base.omit({code}).extend({version}).strict()` inside `zPartialNoDefaults`. **Empirical**: `safeParse({code})` → false, `safeParse({label_key})` → true. FE half: PUT bodies built from `updateEditableColumns` only + taint tracking scoped to it — `code` can no longer leave the client either |
| 19 | **Dict chrome parity — strip tones** — locked contract (user, this session): **every toolbar strip + pagination = `bg-muted/30` ALWAYS, dict must not diverge**; **the super footer (save/action bar) = `bg-muted/50` — the FormPageLayout standard, identical on forms and dicts**. Dict L1 → canonical `Toolbar card={false}` + drop the vestigial `bg-background/90 backdrop-blur` wrapper; dict save-footer `bg-muted` (100%) → `bg-muted/50` (FormPageLayout:55). Then document the anatomy in `docs/ai/patterns.md` "Toolbars" — user: "questa anatomia va tutta documentata" | ✅ DONE fe `8eba518` + fe patterns.md | Dict L1 hand-rolled div → `Toolbar card={false}` (ELT-identical composition: SearchBar left / groups / refresh / primary); `bg-background/90 backdrop-blur` vestige removed (no `sticky` ever existed). Footer `bg-muted`→`bg-muted/50`. Contract documented: `patterns.md` Toolbars rule 9 |

## Open questions for the user

1. ~~Gate semantics~~ → **locked 2026-11-22**: single-composer (NEW disabled iff composer open; confirmed pendings don't block).
2. ~~in-row chips~~ → **locked 2026-11-22**: NO chips on rows — badges
   footer-left only (all i18n-translated). Pending marking = info-tone
   row accent, exactly like the current draft accent.
3. ~~`code` immutability~~ → **locked 2026-11-22**: stays the immutable
   badge tag next to the translated-key title (current anatomy).
4. ~~Extras on SAVED rows~~ → **locked 2026-11-22 (user)**: extras edit
   lives in a **sheet** — the established convention (`entity-identity-
   column-standard`: "extras go to the update-sheet surface"; user recall
   confirmed — space constraint is the reason). Row keeps: value cell
   (label_key/`TranslationKeyCell` — UNCHANGED) + a new extras item-CTA
   in the right zone (`dict-row-extras` testid). The sheet is
   **`entity.dictExtras`** — `SheetPanelLayout` + `EntityFormField` per
   `updateEditableColumns` (the EntityFormPage field engine: label +
   priority tooltip + dispatcher + errors — meta resolves the widget,
   any future model compiles with zero FE code). **Bound to the row's
   values-map** (`values[uid]` saved / `d.values` pending) → edits feed
   taint → the page's atomic bulk save stays THE one write path (no
   sheet-side PUT). Label-family extras (`dict.directional.*_label_field`)
   render `TranslationKeyCell` inside the sheet. `entity.record` exists
   but is READ-ONLY (TableCell drill-through) — the panel reuses the
   FIELD anatomy (`EntityFormField`), not that sheet.
   **Live extras case**: `/crm/settings/customer_link_types`
   (`inverse_label_key`, nullable — user verified: invisible/uneditable
   today). Deeper cases: `contact_types.value_kind` (required — L1),
   `legal_forms` (4 extras), `company_dimensions.min_size`.
5. **`useUnsavedChangesGuard` natives** (open 2026-11-23): in-app nav
   guard → anatomy `DialogBordered` (warning) is the real fix;
   `window.onbeforeunload` is a browser-API edge outside our UI control —
   either document-exempt that single call or drop it (page hide
   semantics unchanged). Decide at task-16 time; both viable, neither
   lazy.

## Links

- Parent: `crm-customer-model-local-address.md` Step 4 · `metadata-driven-page-system.md` (residual (e) — dict heterogeneity; this polish gates the 8-entity migration)
- Related: `entity-identity-column-standard.md` (dict draft = code+label_key contract — task 8 revises it for required extras), `translation-editor-sheet-redesign.md` (state vocabulary source)
- Reference impl: `configurations/create/+page.svelte`, `EntityFormField.svelte`, `entity-dict-page/*.svelte`
- Delete-confirm surfaces: `useRowActions.svelte.ts`, `useBulkActions.svelte.ts`, `EntityListTableDialogs.svelte` (ELT — today wired, not enforced); `EntityDictPage.deleteRow` (raw `apiFetch`, the incident path); `DeleteDialog`/`BulkDeleteDialog` (`ui` pkg / `entity-list-table/dialogs/`)
- Incident record: `customer_link_types.consultant` uuid `01a1cbeb-8d36-7e9b-85d8-f557f3a5d2f4` — deleted 2026-11-19 23:29 UTC (no confirm shown), restored live via `restore()` SQL semantics → version 3 (audit-partition row not written by raw SQL — disclosed gap)
