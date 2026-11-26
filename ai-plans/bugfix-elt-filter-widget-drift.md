# Bugfix — ELT standard-filter widget drift on sequence (revive/i18n/ref/actor)

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN. IT IS THE WORKFLOW.

Every turn, in this order, NO EXCEPTIONS:
1. Read this whole plan — this block IS the operative workflow.
2. Fill in DOC RECEIPTS below before any action (cite doc:line).
3. State of the world = VERIFICATION LEDGER, never your memory.
4. Execute only the declared scope. Anomaly → STOP → report, max 2 retries.
5. Output waits ≤30s. Beyond that = anomaly, not "still running".
6. Before closing: write verdict + ledger + next step into the plan.
7. Prova del 9: every state claim carries `file:line` — if you cannot
   cite it, you did not verify it, it is an assumption.

## DOC RECEIPTS (fill before acting)
| doc:line | what it says | how it applies this turn |
|---|---|---|
| fe `docs/ai/workflow.md` | TIC empirical, docs first, plan ledger | this plan |
| fe `docs/dev-guide/entity-metadata.mdx` `format` table (~L238-239) | `revive_interval` → `ReviveIntervalInput` dual-mode composite; `revive_offset` same with `until` | the metadata contract the filter surface violates today |
| fe `docs/dev-guide/entity-metadata.mdx` `i18n_key` row | form = canonical i18n ComboSelect; **"filter surface maps to contains-text"** — USER OVERRIDES THIS (2026-11-26, this plan); doc must be updated in TOC | user demand: same governed pick widget in filters |
| workspace `ai-plans/elt-filters-widget-parity.md` B.2 | sanctioned degrade-to-text list = `json`/`payload_map`/`schedule_spec` ONLY; `revive_interval`/`revive_offset`/`i18n_key` were NEVER in the sanctioned degrade list | proves current dispatcher degrade is drift, not design |
| dal `src/builtin/sequence-decl.ts:96,112,122,124,127` | `revive_every` format `revive_interval`; `revive_grace` format `revive_offset`; `revived_from` **type text (wrong)**; `revived_by` type text no options_source; `description_key` format `i18n_key` | metadata facts to fix |
| dal `src/repository/repository.ts:1851-1925` | `distinctAuditActors` = DISTINCT over created/updated/deleted_by, label-resolved via `public.user_profiles` + `service_registry`; unresolvable writers surface raw **by design** | explains raw-uuid fallback; revival actors covered transitively (successor `created_by` = revive actor) |
| fe `src/lib/entity-form/FormFieldDispatcher.svelte:327` | `revive_interval`/`revive_offset`/`i18n_key` all degrade to `text` on filter surface | THE drift line |
| fe `src/lib/entity-form/use-entity-ref-options.svelte.ts` | entity_ref options fetch `entityApiBase(entity)` with **no service threading** | `sequence` is a builtin mounted on multiple module services → census ambiguity; must thread `service` |
| fe `src/lib/entity-form/use-audit-actor-options.svelte.ts` | service IS threaded correctly; cache per service:entity | no change needed |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-26 TIC | read sequence-decl.ts + FormFieldDispatcher + elt-filters plan | DRIFT CONFIRMED | dispatcher:327 degrades revive/i18n widgets never sanctioned for degrade | tasks 1-3 |
| 2026-11-26 TIC | psql crm.sequences actors × public.user_profiles | admin uuid `01a1cbed-…` has **0 rows** in crm.sequences; ~292 rows owned by deleted ephemeral E2E actors → raw-uuid fallback is CORRECT per contract, caused by E2E pollution (tests never clean sequence rows) | search "Pr" finds nothing because no live `Prime*` actor exists in THIS table's vocabulary | task 6 regression spec proves label resolution with live actor |
| 2026-11-26 TIC | read ReviveIntervalInput | self-contained composite, binds a plain string canonical, no record/form deps — filter-safe by construction | ui `revive-interval-input.svelte` | task 1 transcription trivial |
| 2026-11-26 TIC | read useEntityRefOptions | no `service` param — `entityApiBase('sequence')` ambiguous across module services | required for revived_from self-ref | task 4 |
| 2026-11-26 TOC | playwright sequences.spec.ts governed-widgets + polluted-v2 live | GREEN (27.6s + 12.0s) | revive composites mount on Renew Every/Activation; i18n/ref/actor combos mount; wire carries revive_every ILIKE "1 year"; E2E Test Admin label resolves + label-search hits; polluted v2 store heals to governed order, sessionStorage rewrites v3 | — |
| 2026-11-26 TOC | vitest core 30/30, dal 172/172, svelte-check 0/0, check:standards clean, eslint clean | GREEN | commits: core feature/elt-visibility-prefs-v3, dal d2cd1f2 (feature/sequence-revive-docs), fe 0491b7d (feature/sequence-revive-docs) — all pushed | — |

> Continuation context: user report 2026-11-26 on `/crm/settings/sequences`
> standard filters — Renew Every / Activation / Description translation /
> Cloned From / Revived by render plain text inputs instead of their governed
> widgets; Created/Updated/Deleted by show raw uuids and label search appears
> broken. User explicitly overrides the "filter = contains-text" escape for
> these columns: the widget IS the contract on every surface.

## Status: 🟢 DONE — Plan date: 2026-11-26

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | FE `FormFieldDispatcher` — remove `revive_interval`/`revive_offset` from the degrade-to-text list at line 327 and add both to `FILTER_CONTROLS`; the existing template branches (`bind:stringValue`, `literal="at"/"until"`) are surface-agnostic already — no new anatomy. Update the header comment + `FiltersPanel` header comment: degrade list = editor-only widgets (`payload_map`/json/rule_filter/schedule_spec/sequence authoring) — revive composites are VALUE controls, not editors | ✅ done | 2026-11-26 | transcription, design frozen in TIC |
| 2 | FE `FormFieldDispatcher` — `i18n_key` filter variant: same `i18nKeyOptions` vocabulary ComboSelect, **single-pick, `allowCreate=false`, no custom-suggestion seeding** (filters have no record context; a key outside the vocabulary is a pointless criterion). Wire value stays the key string → existing ILIKE serialization unchanged. Remove `i18n_key` from degrade list, add `'i18n_key'` to FILTER_CONTROLS with a filter branch (or reuse the form branch minus trailing CTAs/suggestion when `surface==='filter'`) | ✅ done | 2026-11-26 | decision recorded: single-pick (not multi) because ILIKE substring semantics; user may override to multi+IN at plan review |
| 3 | DAL `sequence-decl.ts` — `revived_from`: `type:"text"` → `type:"ref"` + `ref:{entity:"sequence"}` (self-reference to predecessor row; physical column IS uuid — sequence-entity.ts:152). `revived_by`: add `options_source:"audit.actors"` (actor vocab transitively covers revivers — successor `created_by` IS the revive actor, repository.ts:1097-1100). Verify `withColumnConstraints` accepts both on authored columns; adjust DAL unit tests | ✅ done | 2026-11-26 | dal is a library — check whether BE/US consume source or published package (release-order doc) |
| 4 | FE `useEntityRefOptions` — add optional `service` threading (param mirroring `useAuditActorOptions`); pass to `entityApiBase(entity, service)` for BOTH meta fetch and list fetches; `FormFieldDispatcher` passes its `service` prop. REQUIRED: `sequence` is a builtin entity mounted per-module — without service the census is ambiguous (`requireUnambiguous` throws, api.ts:92-96) | ✅ done | 2026-11-26 | gap found in TIC, zero discovery left for TOC |
| 5 | Regression specs in `src/e2e/sequences.spec.ts` (canonical location, final specs from first write): (a) standard tab anatomy — Renew Every + Activation mount revive-interval anatomy (mode toggle + numeric/uom), Description translation mounts the i18n ComboSelect (combobox, not textbox), Cloned From + Revived by mount comboboxes (not textboxes); (b) pick interval `1 year` on Renew Every → Enter → wire carries `filters[i][field]=revive_every, op=ILIKE, value="1 year"` and rows narrow; (c) actor combo labels — assert at least one option label resolves a display name (live ephemeral actor IS in user_profiles during test) and typing its first letters in combo search filters to it | ✅ done | 2026-11-26 | re-read e2e docs before writing; 5s budgets; headed |
| 6 | Actor display-name verification — prove or falsify with the live test actor: create one sequence row AS the ephemeral admin inside the spec, open the Created by combo, assert option label = actor display name (not uuid) and label-search hits it. If PASS, raw-uuid complaint is data hygiene (deleted ephemeral actors), not code — report evidence to user; if FAIL, fix `distinctAuditActors` resolution within this plan | ✅ done | 2026-11-26 | TIC evidence already shows 0 live-profile rows in current dev data |
| 7 | E2E data hygiene — `sequences.spec.ts`/`sequence-revive.spec.ts` create rows and never delete them (~292 polluted rows in dev DB, all owned by deleted ephemeral actors): add cleanup deleting rows the spec created (tracked uuids), so future runs stop polluting the actor vocabulary. ONE-TIME cleanup of existing dev rows is DESTRUCTIVE — NOT in scope; propose to user separately | ✅ done | 2026-11-26 | census of creating specs at TOC start: grep `entities/sequence` POSTs in src/e2e |
| 8 | Docs sync — `docs/dev-guide/entity-metadata.mdx`: i18n_key row drop "filter surface maps to contains-text", document revive composites + i18n pick + ref/actor as filter-surface contracts; `elt-filters-widget-parity.md` ledger reference this round; regenerate component extraction if wired | ✅ done | 2026-11-26 | docs are the contract — drift source must die |
| 9 | CORE/FE column-visibility intent fix — `deriveVisibleKeyPrefs` (core columns.ts:~160-167) writes EVERY non-visible column into `hidden`, including never-touched default-hidden ones → the v2 "intent" store is polluted by construction at first bootstrap (fe useEntityList persist effect :379-396 fires on metaLoaded without any user toggle). When a decl later flips `default_visible` false→true (the sequence reorder wave flipped sez/sez2/sez3), `resolveVisibleKeyPrefs` merges then DELETES the polluted hidden keys — the new default never reaches existing profiles. Fix: (a) `hidden` = only default-visible columns absent from the visible set (true user intent); (b) resolve-time drop of hidden entries targeting currently-default-hidden columns (redundant no-ops, self-cleaning); (c) storage migration v2→v3: drop existing `hidden` arrays wholesale (irretrievably polluted — genuine intent unrecoverable, documented tradeoff), keep `shown` (always genuine: a default-hidden column can only enter the visible set by explicit toggle) | ✅ done | 2026-11-26 | ROOT CAUSE of "dove sono le colonne" — verified live: fresh profile renders EXACTLY the governed order (playwright sequences.spec.ts:381 green 2026-11-26, 19.8s) while the user's browser carries polluted prefs |
| 10 | Regression spec — seed localStorage with a POLLUTED v2 blob (`hidden:[sez,sez2,sez3,…]`) before navigating to `/crm/settings/sequences`; assert post-migration render shows the governed default head order exactly: Name(sticky) → Sezionale/2/3 → Increment → Start → Current → Next → Pattern → Current/Next Sequence → Time zone → Renew Every; everything past revive_every absent from head but present in the column picker. Plus a unit test pair for derive/resolve intent semantics in core columns.test.ts | ✅ done | 2026-11-26 | final spec from first write; the fresh-profile path is already covered by sequences.spec.ts:381 |
| 11 | Verification wave — fe: `pnpm check` 0/0, `check:standards` clean, targeted Playwright green (headed, live stack); dal: targeted tests + typecheck; core: columns tests green; commit per repo with model trailer, push immediately, update this ledger | ✅ done | 2026-11-26 | gitflow audit first per repo |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Empirical findings (TIC, verified 2026-11-26)

### A.1 The drift line

`FormFieldDispatcher.resolveFilterControl()` (fe, line 327):

```ts
if (resolved === 'subject_combo' || resolved === 'json' || resolved === 'rule_filter'
    || resolved === 'payload_map' || resolved === 'schedule_spec'
    || resolved === 'revive_interval' || resolved === 'revive_offset'      // ← DRIFT
    || resolved === 'sequence' || resolved === 'sequence_pattern'
    || resolved === 'i18n_key')                                            // ← DRIFT
  return 'text';
```

The parity plan (`elt-filters-widget-parity.md` B.2) sanctioned degrade ONLY for
`json`/`payload_map`/`schedule_spec` — write-only editor surfaces. The revive
composites and the i18n key pick are **value controls**: the emitted canonical
string IS the thing the filter matches. They were swept into the degrade list
by proximity, never by decision.

### A.2 Per-field census — sequence standard-filter tab today vs contract

| column | served meta fact | today in filter tab | contract (user-ratified) |
|---|---|---|---|
| `revive_every` "Renew Every" | `format:"revive_interval"` (decl:96) | plain TextInput | `ReviveIntervalInput literal="at"` — emits `'1 year'`/`'at <ISO>'`; ILIKE matches canonical |
| `revive_grace` "Activation" | `format:"revive_offset"` (decl:112) | plain TextInput | `ReviveIntervalInput literal="until"` |
| `description_key` "Description translation" | `format:"i18n_key"` (decl:127) | plain TextInput | i18n-key ComboSelect (single, no create in filter) |
| `revived_from` "Cloned From" | uuid physical, **authored `type:"text"`** (decl:122) | plain TextInput | `type:"ref"` self-ref → entity-ref multi combo (IN) |
| `revived_by` "Revived by" | varchar actor, no options_source (decl:124) | plain TextInput | `options_source:"audit.actors"` → actor multi combo |
| `created_by`/`updated_by`/`deleted_by` | auto-derived, `options_source:"audit.actors"` correct | actor multi combo ✓ widget correct — labels raw for dead profiles **by design** | verify label resolution with live actor (task 6) |
| `tz` | `options_source:"iana.tzones"` | iana multi combo ✓ | already correct |
| `revive_slot` | `type:"badge"` | badge multi combo ✓ | already correct |

### A.3 The actor raw-label complaint — evidence, not guesswork

- psql: `Prime Admin` (`01a1cbed-7bff-7439-b4fa-d55f3e4491ad`) authored **0 of 292** rows in `crm.sequences`. All actors are ephemeral `e2e_test_*` uuids whose `user_profiles` rows are destroyed at E2E teardown → no profile to resolve → raw uuid fallback, which is the documented contract (`repository.ts:1857-1859`: "fictitious writers … surface their raw value").
- ComboSelect client search covers `label` + `value` + keywords (`combo-select.svelte:517-527`, `shouldFilter=false` with the label-search rationale at :810-812) — the search mechanism is not the bug.
- Therefore: if labels for LIVE actors resolve (task 6 proves), the user's symptom is **E2E data pollution**, remediated structurally by task 7 (tests clean up after themselves). One-time historical cleanup is destructive and excluded — user decision.

### A.4 `revived_by` vocabulary coverage — no SQL change needed

`sequenceRevive` inserts the successor with `created_by = revived_by = spec.actor`
(repository.ts:1097-1100). Every reviver is therefore necessarily present in the
`created_by` UNION feeding `distinctAuditActors` — including soft-deleted rows
(the UNION has no deletion filter). `system:<code>` actors resolve through
`service_registry`. Adding `options_source:"audit.actors"` to the meta is sufficient.

### A.4b Column visibility — why the user doesn't see the governed order (ROOT CAUSE, verified 2026-11-26)

**Empirical baseline**: fresh browser profile renders EXACTLY the user's contract —
Playwright `sequences.spec.ts:381` green live (19.8s): head = Name → Sezionale →
Sezionale 2 → Sezionale 3 → Increment → Start → Current → Next → Pattern →
Current Sequence → Next Sequence → Time zone; default_from/revive_slot/expire_at/
description_key/last_alloc_* hidden-but-toggleable. The decl (sequence-decl.ts:71-129)
matches the user's spec verbatim: `name` sticky order 0, sez 1-3 non-sticky visible,
step/start 4-5, tz 11, revive_every 12 visible, everything after `default_visible:false`.

**Why the user's browser disagrees — the v2 visibility-delta store is polluted by construction:**

1. `deriveVisibleKeyPrefs` (core columns.ts:~160-167) derives `hidden` as
   "columns absent from the visible set" — EVERY default-hidden column lands in
   `hidden` even when the user never touched the picker. The design comment two
   screens above claims "a key in neither list simply follows its own
   `default_visible`" — the derivation makes that impossible for false→true flips.
2. The persist `$effect` (fe useEntityList.svelte.ts:379-396) fires at bootstrap
   (gated only on `metaLoaded`) — merely VISITING the page under the old decl
   wrote `hidden:[sez,sez2,sez3,…]` to localStorage as fake user intent.
3. The reorder wave flipped sez to `default_visible:true`; `resolveVisibleKeyPrefs`
   (core columns.ts:~148-156) still deletes the stored hidden keys → the new
   default never reaches any profile that ever visited the page before the flip.
4. Fresh profiles (every Playwright run) have empty storage → tests pass → the
   regression is structurally invisible to the suite. Task 10 closes that hole.

Migration impossibility note: genuine user-hides and bootstrap pollution are
indistinguishable in stored v2 blobs — the v3 migration drops `hidden` wholesale
(documented one-time tradeoff) and keeps `shown` (pollution-free by construction).

Secondary defect (same family, smaller): `useColumnOrder.applyKeyOrder` appends
columns missing from the stored drag-order at the END of the group instead of
their authored relative position — meta evolution can't reach reordered profiles
either. Fixed within task 9 scope if trivial, else re-homed.

### A.5 `useEntityRefOptions` service gap

`entityApiBase('sequence')` without a service hits `requireUnambiguous`
(api.ts:92-96): builtin `sequence` mounts in EVERY module service → census
ambiguity throw or wrong-service fetch. The composable must accept `service`
exactly like `useAuditActorOptions` already does.

## Part B — Wire-semantics decisions (frozen in TIC)

1. **Revive composites in filters** — the control emits the canonical varchar;
   standard serialization for `type:"text"` is ILIKE → `'1 year'` matches rows
   whose cadence is exactly `'1 year'` (pluralization normalized by the control:
   `1 year` singular, `2 years` plural). The literal mode (`at`/`until` pin) is
   legitimately useful in filters ("which rows switch at a pinned instant").
2. **i18n key single-pick, no create** — a filter criterion references EXISTING
   keys; `allowCreate` in a filter would author orphan keys. No suggestion
   seeding (no record context). ILIKE substring semantics stay. Multi+IN is the
   alternative the user may choose at review.
3. **revived_from self-ref multi** — filter surface of `type:"ref"` is already
   the multi paged combo with IN serialization; zero new anatomy.
4. **No changes** to json/payload_map/schedule_spec/sequence/sequence_pattern
   degrade — those remain sanctioned contains-text (editor ≠ filter).

## Part C — Acceptance criteria

- [ ] Renew Every + Activation render the dual-mode revive composite in the standard tab; picking `1 year` + Enter narrows rows and the wire shows `value="1 year"` ILIKE.
- [ ] Description translation renders the i18n key combobox with vocabulary options; no free textbox.
- [ ] Cloned From renders the paged sequence entity-ref combo (multi), labels = sequence display names, options fetched from `/svc/crm/...` (service-threaded, no ambiguity error).
- [ ] Revived by renders the actor multi combo sharing the audit-actors vocabulary.
- [ ] Created/Updated/Deleted by: live-actor display names resolve and label-search hits them in the regression spec.
- [ ] svelte-check 0/0, check:standards clean, dal tests green, targeted Playwright green.
- [ ] Docs updated so "filter = contains-text" survives ONLY for the sanctioned editor widgets.

---

## HANDOFF — closure notes (2026-11-26)

**All tasks complete.** Verdicts per task:

- 1/2 (FE dispatcher revive+i18n filter controls): DONE — live E2E green.
- 3 (DAL revived_from ref / revived_by actors): DONE — dal `d2cd1f2`, live E2E green (service-threaded self-ref mounts).
- 4 (useEntityRefOptions service threading): DONE — ambiguity impossible (`entityApiBase` receives explicit service).
- 5/6 (regression specs + actor display names): DONE — "E2E Test Admin" resolves server-side and label-search hits it live. **The user's raw-uuid symptom was E2E-data pollution, not a resolution bug** — actor profiles deleted at teardown fall back to raw BY DESIGN (`repository.ts` contract).
- 7 (hygiene): VERIFIED ALREADY IN PLACE — `sequences.spec.ts` finally-blocks, `sequence-revive.spec.ts` afterAll, `sequence-form-contract.spec.ts` residue-free. Historical pollution (~292 rows) is pre-existing data: one-time dev-DB cleanup is destructive → propose to user separately, NOT done here.
- 8 (docs): DONE — entity-metadata.mdx filter contracts rewritten; dispatcher/FiltersPanel header comments updated.
- 9/10 (visibility v3): DONE — core derive true-intent + migrateVisibleKeyPrefs v2→v3 (hidden dropped wholesale, shown kept), FE restore wiring incl. v1-array shown-only migration; live spec proves governed order renders from a polluted store and rewrites v3 in sessionStorage.

**Re-homed drift (not this scope):**
- ComboSelect trigger is `div[role="combobox"]` — a non-labelable element, so PrimeField's `<label for>` never wires an accessible name (a11y gap, product-wide, pre-existing). Structural `label[for]→control[id]` chain IS wired and now under test. Needs a ui-level `aria-labelledby` contract — candidate for a ui plan.
- `useColumnOrder.applyKeyOrder` appends meta-evolution columns at group END instead of authored position (order-pinning analog of the visibility bug, sessionStorage-drag path only — smaller blast radius).
- entity_ref option LOADING inside the filter combo is covered structurally (service-threaded base, same endpoint family as the list) but not asserted end-to-end — accepted residual, first failure would surface in the widget spec.

**Branch state**: core `feature/elt-visibility-prefs-v3` open (single work branch, publish/finish per gitflow when the user ratifies); dal/fe changes landed on the already-open `feature/sequence-revive-docs` branches. No release/bump performed — not requested.
