# Translation Editor Sheet Redesign — Plan

## Objective

Rebuild `i18n.translationEditor` (`TranslationEditorPanel.svelte`) from the
per-language selector + invisible-work model into the user's specified
4-line anatomy: the edited key leads, the EN base is always a visible
reference, the selected language is a real editable textarea, and AI
generation produces reviewable suggestions instead of silent writes.

The combobox + sheet become a **reusable create+update translation unit**:
translations are NEVER a standalone CRUD — they always ride the owning
page's save (delayed pending queue → gateway flush).

## User decisions (locked — all answered)

1. **Create AND update** — existing rows editable; writes ride the owning
   page's save only (never standalone CRUD).
2. Results container = **list**.
3. Missing-language chips in HEAD = clickable flags.
4. EN preview hidden when selected lang == the shown EN base (no echo).
5. Width stays **w-[420px]**.
6. Pending queue = **owner-tagged** (B) — drains only owner's rows.
7. Conflicts: **never silent, never merge** — ERR01/04/05 → notification +
   requeue; resync ONLY on sheet reopen (user sees both values, decides).
   No refetch+retry inside the flush — CAS never eluded. ERR04/ERR05 are
   unique-constraint conflicts (not version-based), surfaced identically.
8. Status colors: Saved=emerald+Check · Missing=amber+CircleHelp ·
   **Modified=sky/info · Draft=sky/info** (same semantic — pending).
   Icon for pending states: `Clock` (proposed, vetoable).
9. Key-badge palette confirmed: ns=sky · entities=muted · entity=violet ·
   facet=amber · leaf=fg-semibold.
10. Cell generalization: whatever is needed for drift-free testability.
11. No MFA on update (only delete has step-up today); rows readonly when
    the user lacks `translation.update.single`.
12. **PENDING** — BE `key` filter on `/entities/translation/list`
    (one zod field + one `Filter.eq`) vs client-side paging fallback
    (breaks >100 rows/lang).

## Verified wire facts (empirical — read, not assumed)

| Fact | Source |
|---|---|
| Dict-page flush = per-row `createTranslation(module,{key,language,value})` → `POST /api/v1/entities/translation?module=X` on the **BE gateway** — NOT the `{entity,translations}` envelope (US routes strip it: "translation writes are gateway-owned") | `EntityDictPage.svelte:349-365`, `entities-route.ts:9` |
| `PUT /entities/translation/:uuid?module=` exists — **needs uuid + `version`** (DAL optimistic lock) | `translations.router.ts:163` |
| Gateway resolves module → `<schema>.translations` — BE-owned (app/system/settings/custom) + **service_registry discovery** for `crm` & co | `translations.service.ts:151-176` |
| Permissions are distinct: `translation.create.single` / `translation.update.single` / delete / restore | `translations.router.ts:146-186`, `permissions.ts:382-391` |
| `fetchTranslationList` filters **language only — no `key` filter** | `ListQuerySchema:66`, `service.list:239` |
| `fetchModuleTranslations` returns flat `{key:value}` — no row identity | `api.ts:783` |
| `service.create` default `onConflict:"raise"` — the POST route doesn't pass "ignore" → **duplicate (key,language) → 409** | `translations.service.ts:270-287` |
| Pending store is **session-global** — any page's save drains EVERYTHING | `pending-translations.svelte.ts` |
| `AiIcon` = animated gradient sparkles (sky-400→indigo-400); `CopyButton`; `Accordion`; Textarea already `border-primary-gradient`; Badge has NO semantic variants (token/classes like the iana-badge pattern) | UI lib |
| Icon CTA chrome: ghost button + `AiIcon size={16}` + title/aria-label | `JsonPreviewEditor.svelte:107` |

## Anomalies / gaps / short-circuits (for the create+update extension)

| # | Severity | Issue |
|---|---|---|
| S1 | **short-circuit (pre-existing)** | Create is NOT idempotent: `onConflict:"raise"` → a retried create (partial-flush failure → drain+requeue → next save) hits **409 on rows that already landed** → stuck forever. Fix: flush-layer 409 → refetch → convert to update; or `onConflict:"ignore"` on the POST route. |
| S2 | **short-circuit** | Stale `version` → 409 → drain+requeue retries with the SAME stale version → infinite 409. Fix: on conflict refetch the row (fresh uuid+version) → retry once → else surface conflict notification. |
| G3 | **gap — BE change** | No `key` filter on `/list` → can't fetch row identity for one key. Add `key` to `ListQuerySchema` + `service.list` (one `Filter.eq`) → `fetchTranslationList(module,{key,page_size:25})` returns **all langs' rows in ONE call** (uuid+version+value). |
| G4 | **gap** | `PendingTranslationRow` has no identity → extend `{key, language, value, uuid?, version?}`; flush splits update (uuid) vs create. Sheet emits only dirty langs (draft ≠ server value). |
| G5 | **gap/short-circuit** | Owner-less global queue — a leftover sheet queues rows that flush inside an UNRELATED page's save → cross-owner contamination/orphans. For universal reuse: owner-scoped drain OR a shared `flushPendingTranslations()` helper every host calls (still manual wiring). |
| G6 | **gap** | The drain→create→requeue loop lives inline in `EntityDictPage` — not reusable → extract shared flush helper owning the create/update split + conflict policy (S1/S2). |
| G7 | **contract** | `translation.update.single` is a DISTINCT permission — a creator may not update → sheet must render saved rows readonly when the perm is absent (read perms from auth store like `can_update` today). |
| G8 | **UI states** | New shadow state needed: `saved-untouched` (Saved ✓) vs `saved-edited` (**Modified** — new badge, proposed info-sky) vs `missing` (Missing ?). Empty edit on existing = ignored — **no delete through this surface** (non-CRUD holds). |
| G9 | **boundary (accepted)** | Entity write + translations are sequential HTTP calls — not atomic; progressive commit already exists (entity first → translations never attempted on entity failure → consistent). |
| G10 | **reuse boundary** | `TranslationKeyCell` is dict-coupled (`dict-cell-*` testids, `entities.<entity>.rows.<code>` suggestion, display_field binding). Reuse needs prop-generalization (suggestion pattern, allowed ns, testid prefix). The sheet itself is already generic (`i18n_key` only). |

## Architecture proposal (to confirm)

- **Flush path**: translations ALWAYS go via the dedicated gateway routes
  (`/entities/translation`), never the `{entity,translations}` envelope —
  one shared `flushPendingTranslations()` helper owns: drain → per-row
  create/update split (uuid present?) → 409 refetch-convert → requeue on
  failure. Hosts call it from their save + `clearPendingTranslations()` on
  destroy (same contract as today, but shared code).
- **Sheet read model**: on mount ONE `fetchTranslationList(module,{key})`
  call (needs the `key` filter, G3) → `existing: Record<lang,{uuid,version,value}>`;
  textarea binds `draft[lang] ?? existing[lang]?.value`; dirty = differs.
- **PendingRow**: `{key,language,value,uuid?,version?}` — store shape
  unchanged (`Map<key, Record<lang, PendingRow>>` grows fields).
- **Owner scoping (G5)**: open question — simplest is keeping the global
  queue but tagging entries with an `owner` token (host id) so the flush
  drains only its own rows. Decision needed.

## Anatomy (content stack — toolbar strip removed)

```
HEAD    [Languages] Translations            [4/7 ✓] [it?][fr?] [X]
        ─────────────────────────────────────────────
LINE 1  [badge: crm.entities.customer_type.rows.private]   (colored segments)
LINE 2  TextArea EN — read-only preview of the base value
        header row: [Base] (info badge) ............ [copy]
LINE 3  [language combobox]
LINE 4  TextArea — selected language (editable — saved rows included when
        the user holds translation.update.single; readonly otherwise)
        header row: [flag + lang label] [Saved ✓ | Modified | Missing ?]
        trailing overlay: [AiIcon] [copy]   (copy rightmost, AI at its left)
        ── below, outside the textarea ──
        [AI suggestion card: text + accept/reject CTAs]
FOOT    [Genera tutte le mancanti (outline primary)]        [Save]
        results list: [flag lang — text][accept] + [ACCETTA TUTTO]
```

- **LINE 1** — full-path badge, `variant="outline"` + code-badge chrome,
  `title={i18n_key}`, per-segment semantic colors (below).
- **LINE 2** — readonly bordered Textarea; `Base` badge (info/sky) +
  CopyButton. Visible iff `baseValue !== ''` **and** `selectedLang !== baseLang`
  (decision 4 — no echo when you're editing the EN shown).
- **LINE 3** — unchanged lang ComboSelect.
- **LINE 4** — bordered Textarea; `readonly` iff (row saved AND no update
  perm). Status badges: `Saved` emerald+`Check`, `Modified` sky (new),
  `Missing` amber+`CircleHelp`. Trailing overlay top-right: `AiIcon`
  then `CopyButton`.
- **HEAD actions** — `{translated}/{total}` badge + flag chips of the
  missing langs (click → select that lang).
- **FOOT** — outline-primary `Genera tutte le mancanti` + `Save`
  (Save gated on EN — below).

## Behaviors (user-specified + update extension)

| Condition | Result |
|---|---|
| Nothing translated | LINE 2 hidden; selector defaults `en-GB`; EN required — **Save disabled until an EN (en-GB or en-US) value exists** (existing or draft); `*` required affordance |
| EN present or being set | LINE 2 visible (unless selected IS that EN) |
| Selector default | `en-GB` when no EN, else `uiLang` |
| Empty lang selected | editable bordered Textarea |
| Saved lang selected | editable (update perm) or readonly (no perm) + `Saved ✓`; edited → `Modified` |
| Per-textarea AI CTA | suggestion for selected lang (source = EN base, else selected text); card below textarea, accept→fills, reject→dismiss; disabled without source |
| `Genera tutte le mancanti` | fills all missing via Browser Translator → results list + `ACCETTA TUTTO` / per-lang accept; failures shown, never silent |
| Save | emits only dirty langs (uuid+version for updates) → pending queue → owning page save flushes |

## Key badge — color proposal (dot-notation semantics)

| Role | Example | Color |
|---|---|---|
| namespace/schema | `crm` `custom` `system` `app` | `text-sky-600 dark:text-sky-400` |
| vocab marker | `entities` | `text-muted-foreground` |
| entity | `customer_type` | `text-violet-600 dark:text-violet-400` |
| facet | `rows` `fields` `actions` | `text-amber-600 dark:text-amber-400` |
| leaf / code | `private` | `text-foreground font-semibold` |

Non-`entities.*` keys degrade positionally (first=ns, last=leaf, middle=muted);
vocab keywords take accents only when matched.

## New i18n keys (BE-owned → db-meta patch + sign)

To add under `app.common.translations.*`: `generateAll`, `acceptAll`,
`accept`, `reject`, `aiSuggestion`, `missing`, `modified`, `enRequired`,
`translatedOf`. Verify reuse first: `base`, `managed`(Saved?), `generate`,
`generating`, `value`, `aiUnavailable`, `aiSkipped` already seeded.

## E2E strategy (empirical, every step)

- `page.addInitScript` stubs `self.Translator` (deterministic
  `available`/`create → '[MT] '+t`) → full AI surface testable; a second
  stub covers `unavailable`.
- Per-step assertions: badge DOM order + segment colors, LINE 2 matrix,
  Save EN-gate, selector default, editable/readonly split, status badges,
  suggestion accept/reject, results list + accepts, HEAD summary.

## Implementation order

1. BE: `key` filter on `/entities/translation/list` + tests.
2. FE: `PendingTranslationRow` + shared `flushPendingTranslations()` +
   owner-tag decision → migrate `EntityDictPage` flush (no behavior change).
3. Sheet read model → `fetchTranslationList(module,{key})` (uuid+version);
   editable saved rows gated on `translation.update.single`.
4. LINE 1 colored badge + HEAD summary strip.
5. LINE 2 EN preview (Base badge + copy) + visibility rules.
6. LINE 4 status badges + EN-mandatory save gate + selector default.
7. Trailing overlay (AiIcon + copy) + per-language suggestion card.
8. Footer `Genera tutte le mancanti` + results list + accepts.
9. i18n patch + sign + E2E per step.

## Open questions

1. **Owner scoping (G5)**: keep global queue + document hosts MUST
   flush/clear, or tag entries with an owner id and drain per-owner?
2. **Conflict UX (S2)**: on a stale-version 409 — silent refetch+retry once
   (proposed) or surface to the user immediately?
3. **`Modified` badge color**: proposed sky/info — alternative violet to
   match the entity segment?
4. **TranslationKeyCell generalization (G10)**: in-scope for this round or
   follow-up? (the sheet alone is already generic)
