# i18n_key filter vocabulary (catalog composition) + search-in machine-format exclusion

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
| `primebrick-fe-v3/docs/dev-guide/i18n.mdx:35-41` + `primebrick-fe-v3/docs/ai/i18n-translation-sources.md:65-68` | module pages merge their own dict over boot dicts; bootstrap currently loads `app`, `custom`, `system` | task 9 must not regress the ratified vocabulary composition while moving filter state into the search-bar surface |
| `primebrick-fe-v3/docs/ai/e2e-browser-session.md:25-38` + `primebrick-fe-v3/docs/ai/workflow.md:116-123` | the first spec for a behavior is the final persistent spec; E2E doc pre-read is mandatory before writing/running specs | task 9 starts by extending/writing the permanent E2E contract, never a throwaway probe |
| `primebrick-v3-core/AGENTS.md:3-12` | docs are the contract; code is only the proof | doc-first pass completed before touching ELT code; code reading below is verification of the documented architecture |
| `primebrick-fe-v3/docs/ai/commit-verification.md:8-17` | every modification turn ends with typecheck plus runtime/E2E verification, then commit | this turn cannot close on `svelte-check` alone; headed E2E evidence is mandatory |
| `primebrick-fe-v3/docs/ai/pre-implementation-anatomy.md:13-29` | UI work needs a reference-consumer anatomy inventory and component-contract reads before writing | task 9 design must inventory the existing SearchBar/FilterBar/BulkActionsToolbar wiring before implementation |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-26 TIC | `elt-i18n-key-filter.spec.ts` eraser test | ✅ GREEN | eraser clears input + restores full list — binding intact | user complaint re-interpreted: not a combobox binding bug (see Part D) |
| 2026-11-26 TIC | `elt-i18n-key-filter.spec.ts` search-in test | ❌ RED (as designed) | `revive_every` IS in the search-in scope today — gap proven | TOC: exclude machine-syntax formats |
| 2026-11-26 TIC | `elt-i18n-key-filter.spec.ts` prova del nove (unique key + full reload) | ❌ RED | key written via cache-invalidating write API, present in `custom.translations` (rows verified in DB), yet absent from the filter vocabulary even after full page reload — error-context: `custom.entities.sequence.rows.e2e_prova_del_nove_1795731725` not in popover | TOC step 1: binary discrimination BE-serving vs FE-loading |
| 2026-11-26 TIC | psql count custom.translations | ✅ | probe rows persist in DB | — |
| 2026-11-26 TIC | grep CORE_DICT_MODULES | ✅ | `primebrick-fe-v3/src/lib/i18n/index.ts:25` — `['app','custom','system']` boot-loaded | custom SHOULD be in dict — contradiction with red prova del nove = the structural gap |
| 2026-11-26 TIC | grep translations.service.ts | ✅ | `primebrick-be-v3/src/modules/system/translations.service.ts:81` — module map has `custom: CustomTranslationEntity`; `:101-104` namespace enforcement `custom.*` | BE write path correct — write succeeded per contract |
| 2026-11-26 TOC | spec 3/3 GREEN + cleanup verified | ✅ | prova del nove green (key offered, freshness contract holds), eraser green, search-in green; afterAll leaves 0 probe rows in dev DB | done |
| 2026-11-26 TOC | ROOT CAUSE found | ✅ | the pipeline was NEVER broken — the spec seeded en-GB/it-IT but the ephemeral test actor session runs en-US (browser default): the en-US custom dict genuinely lacked the key, and the en-GB floor only paints from a cache nobody fetches in an en-US session. Fixture bug, not app bug — composition+freshness correct end-to-end | — |
| 2026-11-26 TIC | USER SCREENSHOT (live session) | ✅ DECISIVE | the same keys the spec failed to find — including `e2e_prova_del_nove_1795731725` — ARE visible in the user's live combobox now, translation display + key row | composition end-to-end WORKS; the gap is FRESHNESS/INVALIDATION timing, not composition — TOC-0 sharpened to write-API invalidation vs dict-endpoint cache key |
| 2026-11-26 TOC-2 | task 9 implementation | ✅ | badge engine in `primebrick-v3-ui/src/lib/components/combo-select/combo-select.svelte` (imposed/preset/user badges, AND-imposed + OR-group incl. live draft, Enter-commit with stopPropagation, eraser clears draft+removables) + eraser extension `primebrick-v3-ui/src/lib/components/command/command-input.svelte` (`clear_enabled`/`on_clear`) + FE wiring `primebrick-fe-v3/src/lib/entity-form/FormFieldDispatcher.svelte` (i18n_key filter variant: full-dict options, scope as preset-removable badge — no more invisible options-level narrowing) | permanent E2E spec |
| 2026-11-26 TOC-2 | `elt-combo-filter-badges.spec.ts` headed vs dev stack | ✅ 4/4 GREEN (20.3s) | scope renders as removable preset badge and removal widens catalog; Enter commits user badge, committed badges OR; uncommitted draft broadens inside OR group; eraser clears draft+all removable badges in one click. Iteration fixes: per-test unique probe keys (parallel-worker seed collision), probes outside sequence family for OR tests (scope preset would surface in-family probes regardless — fixture-design flaw, not app bug) | regression |
| 2026-11-26 TOC-2 | `elt-i18n-key-filter.spec.ts` regression | ✅ 3/3 GREEN (16.3s) | prova del nove + eraser + search-in all still green with the badge engine live — no regression on the pre-existing contract | typechecks |
| 2026-11-26 TOC-2 | typechecks + spec cleanup verification | ✅ | `primebrick-v3-ui` svelte-check 0 errors/0 warnings; `primebrick-fe-v3` check clean; probe rows in dev DB = 0 after run (self-cleaning contract holds); seed made 409-idempotent | commit ui+fe |
| 2026-11-26 TOC-3 | USER CORRECTION — half the contract was missing | ✅ DECISIVE | "tutte le COMBOBOX TRADUZIONI devono sempre avere il filtro imposto (app.*, custom.*, {module}.*) in OR tra loro e in AND col gruppo utente/preset — se tolgo tutti i filtri NON VEDO TUTTO IL CATALOGO ma solo quello IMPOSTO — ai.* nella seq elt del crm NON DEVE apparire". First implementation lacked the imposed namespace composition entirely | implement imposed namespaces |
| 2026-11-26 TOC-3 | imposed namespace composition implemented | ✅ | badge contract gains `match:'prefix'` (value-startswith semantics — substring would false-positive); ComboSelect `optMatchesBadge` honors it; FormFieldDispatcher composes ONE muted imposed badge `{label:'app/custom/crm', terms:['app.','custom.','crm.'], match:'prefix'}` on BOTH i18n_key variants (form + filter — form variant also switched to full-dict options + preset scope badge; dead scoped derived removed); module resolution = `service` prop ?? `shellNav.selected_module_id`, floor app/custom | permanent spec assertions |
| 2026-11-26 TOC-3 | `elt-combo-filter-badges.spec.ts` with imposed assertions | ✅ 4/4 GREEN (21.4s) | imposed badge present/muted/sealed (no X) with `data-term="app. OR custom. OR crm."`; after removing every removable badge EVERY rendered key line still matches `^(app|custom|crm)\.` — ai.*/foreign-module keys unreachable, empirically proven | typechecks + commit |
| 2026-11-26 TOC-3 | DEBT note — creatable form combo interaction | ⚠️ recorded | in the creatable FORM variant Enter-create takes precedence over badge-commit when no exact match exists (creatable branch first) — coherent but worth user-facing documentation; dict-page TranslationKeyCell/ValidationRulesSection NOT yet wired with imposed namespaces — candidate follow-up, needs user ratification (the dict page manages all namespaces by design) | next session decision |

## Status: 🟡 PARTIALLY DONE — Plan date: 2026-11-26 / TOC session 2: tasks 1-6,9 done; 7,10,11,12 open

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | TOC-0 binary discrimination | ✅ done | 2026-11-26 | BE serves fresh (200) — gap was FE-side fixture language, no app defect |
| 2 | Fix the proven gap | ✅ done (no-op — no app gap existed) | 2026-11-26 | spec fixture fixed to seed en-US |
| 3 | Vocabulary composition namespace enforcement | ✅ done | 2026-11-26 | namespaces param in i18nKeyOptions + dispatcher wiring; fe typecheck 0 errors |
| 4 | search-in machine-format exclusion | ✅ done | 2026-11-26 | core e25a79d MACHINE_SYNTAX_TEXT_FORMATS={revive_interval,revive_offset,sequence_pattern}; dal mirror consumes automatically |
| 5 | E2E permanent spec green | ✅ done | 2026-11-26 | 3/3 green twice, incl. with enforcement active |
| 6 | Disposition of TIC-seeded rows | ✅ done | 2026-11-26 | spec self-cleaning verified — 0 rows left |
| 7 | Doc reconciliation: i18n.mdx vocabulary-scope section vs user-ratified composition | ⏳ not done | — | propose text, write after approval (workspace rule) |
| 8 | Commits per repo + plan ledger update | ⏳ not done | — | |
| 9 | COMBOBOX badge-filter visibility — NOT the ELT toolbar (first design wrong, user-corrected 2026-11-26): the popover search input of comboboxes gains visible filter badges — imposed=muted/no-X (AND), preset/user=with-X (OR among themselves), Enter commits draft text as badge, eraser clears text+all removable badges. First consumer: i18n_key filter combos (CRM sequences desc_key) | ✅ done | 2026-11-26 | implemented per Part G; permanent spec `elt-combo-filter-badges.spec.ts` 4/4 green headed; regression `elt-i18n-key-filter.spec.ts` 3/3 green; both typechecks clean |
| 10 | NEW DEFECT (2026-11-26, user screenshot): reviver widget value renders ENGLISH in an Italian UI — "2 years" visible in the Rinnovo Ogni quick filter while the hint below is correctly Italian. Investigate the revive-interval-input unit/value rendering localization path (the widget likely formats the canonical value with hardcoded English unit names instead of i18n keys) | ⏳ not done | — | primebrick-v3-ui revive-interval-input — check how units/labels render; compare with the Italian hint text that IS correct |
| 11 | NEW DEFECT (2026-11-26, user): numeric inputs with uom must be RIGHT-ALIGNED — numbers align right by convention. Check numeric-input anatomy in ui and every consumer surface | ⏳ not done | — | primebrick-v3-ui numeric-input |
| 12 | NEW QUESTION→investigate (2026-11-26, user): standard (quick) filters expose audit-BY columns (created_by/updated_by) but NOT audit-AT timestamps (created_at/updated_at) — is this a deliberate choice or an accidental gap? Find the quick-filter column selection derivation and document/close the gap | ⏳ not done | — | likely a filterable/derivable rule in core columns.ts or the FiltersPanel quick surface — audit timestamps are type datetime/timestamp |

---

## Part A — Prova del nove: the structural gap

**User-ratified direction (2026-11-26, verbatim)**: translations come from the
CATALOG, not a keys-in-use distinct endpoint — reuse of a description key
across sequences is legitimate and must not be prevented. Visible vocabulary:
**custom.*, app.*, and the current module's keys** — "regola generale che non
abbiamo mai cambiato".

**Evidence chain**:
1. Probe key written through `POST /api/v1/entities/translation?module=custom`
   with `{entity:{key,language,value}}` — the cache-invalidating path — accepted (<300).
2. Rows verified in `custom.translations` (2 rows, en-GB + it-IT).
3. Full page reload (dict boot-loading re-runs).
4. Filter combobox for `desc_key` (scope `.entities.sequence.rows.`) — the key is
   NOT offered, even when typed exactly into the search input.
5. `CORE_DICT_MODULES` includes `custom` — the namespace SHOULD be boot-loaded.

**USER EVIDENCE SHARPENED THE QUESTION**: keys DO eventually surface — the spec failed at immediate-reload time, the user sees them later. The gap is the dict-pipeline FRESHNESS window: write-API invalidation vs the cache key the dict endpoint serves (+ possibly FE ETag revalidation lag).

**USER SCREENSHOT SHARPENED THE QUESTION** (ledger 2026-11-26): keys DO eventually surface — spec failed at immediate-reload, user sees them later. The gap is the dict-pipeline FRESHNESS window.

**Binary discrimination (TOC-0)** — one fetch inside an authenticated context:
- Branch BE: payload lacks the key → inspect `translations.service.ts` dict
  aggregation for the custom schema (Redis cache invalidation on write —
  `invalidateModuleCache` post-commit `:462/:480` — may not cover the dict
  aggregation path, or the dict endpoint may serve a different cache key than
  the write invalidates).
- Branch FE: payload HAS the key → inspect `mergeModuleDict`/boot-load — the
  custom dict may load before login completes, or localStorage ETag
  revalidation may serve a stale 304 (ETag must be content-derived; verify).

**Pre-mapped fixes**:
- BE branch: align cache invalidation keying / aggregation to include custom rows.
- FE branch: fix boot-load ordering or ETag revalidation so the custom dict is
  fresh post-login.

**NOT in scope**: a keys-in-use distinct endpoint — explicitly rejected by the user.

## Part B — search-in machine-format exclusion

**User-ratified rule (verbatim)**: "nel selettore search in non dovrebbe apparire
revive_every e revive_grace — sebbene il loro testo sia `every 1 year`, noi non
lo trattiamo comunque come TEXT — deve rientrare nel TYPE escluso dal search in".

**Evidence**: `searchableTextColumns` (`primebrick-v3-core/src/columns.ts`)
includes `c.type === "text"` — and dal authors `revive_every`/`revive_grace` as
`type: "text", format: "revive_interval"|"revive_offset"` — so they qualify
today. The wire allowlist is mirrored in dal-pg `deriveListWireSets` — BOTH must
change together or FE/BE disagree.

**Format census (dal-v3 grep, 2026-11-26)**: machine-syntax varchar formats =
`revive_interval`, `revive_offset`, `sequence_pattern`, `sequence`,
`actor_token`, `uuid`, `der`. **Proposed rule**: a text column is searchable
UNLESS its format is machine-syntax. Machine-syntax = formats whose wire values
are canonical encodings parsed by a dedicated codec/widget, not prose.
`uuid` is a native type in most entities (type uuid, not text). `der` values ARE
human-meaningful codes users plausibly search ("any row referencing EUR?").
**RATIFIED BY USER (2026-11-26)**: exclusion set = `{revive_interval, revive_offset, sequence_pattern}`.
`sequence` and `actor_token` STAY searchable — they are refs whose text is
human-meaningful via display_name and ref_key (typically uuid). `der`/`uuid`
were never in the machine set.

**Impacted files**:
- `primebrick-v3-core/src/columns.ts` — `searchableTextColumns` + a named
  machine-format set (single source).
- `primebrick-dal-v3` — `deriveListWireSets` mirror (search-in wire allowlist).
- BE enforcement path — verify where the wire allowlist rejects non-allowlisted
  search columns (fail-closed already?).
- `primebrick-fe-v3/src/e2e/elt-i18n-key-filter.spec.ts` — test 3 goes green.

## Part C — vocabulary composition (user-ratified namespaces)

**RATIFIED BY USER (2026-11-26, verbatim energy)**: system IS a module like any
other — NOT always visible. The visible namespaces are:
`custom.*` ∪ `app.*` ∪ `<module-of-the-current-page>.*`
— in a CRM page: app+custom+crm. In system settings: app+custom+system, NOT crm.
**SOLE EXCEPTION (pre-existing, deliberate)**: create-trigger and subordinate
entities load ALL modules translations (event labels etc.) — that stays as-is.

**Why this is mostly-already-true but not enforced**: `$dict` is the merged
boot+route dict — composition is accidental (whatever modules were visited
accumulate). Foreign-module keys matching the rows-scope are extremely unlikely
(`ai.entities.sequence.rows.*` cannot exist — foreign modules don't own sequence
row keys) — so the contains-scope self-protects in practice. BUT: the user
explicitly demands the namespace composition as the enforced rule, not an
accident of navigation history. TOC: implement namespace filtering in
`i18nKeyOptions` (`primebrick-fe-v3/src/lib/i18n/i18n-key-options.ts`) — accept
`current_module` param; filter keys by namespace prefix set.

**Ordering**: propose custom first (user-owned), then app, then module — alpha
inside each group; confirm in verdict.

## Part D — the eraser complaint: re-interpretation

**PROVEN: the combobox eraser binding works** (test green — clears input AND
restores the list). The user's words: "posso annullare il filtro con eraser sul
campo ricerca ma mi è impossibile perchè il filtro è applicato behind invece
che come al solito sulla search bar". Re-interpretation hypotheses:
1. The ELT-level complaint: filters applied from the panel are invisible once the
   panel closes — no chips/affordance on the toolbar — the list is filtered
   "behind" and the user cannot cancel without reopening the panel.
   (`hasAppliedFilters` exists in `EntityListTableHeader.svelte:36/96/180` —
   verify what it actually renders.)
2. Query persistence across popover open/close: the typed search inside the
   combobox may persist hidden when reopening (bits-ui Command state).
**RESOLVED BY USER (2026-11-26)**: the complaint is ELT-level — "per prassi i filtri
applicati si vedono e sono parte della search bar in modo che l utente possa
cambiarli e risalire al tutto, sempre". NEW SCOPE ITEM (task 9): applied panel
filters must surface in the search-bar area as visible/editable criteria, and the
search-input eraser clears them. Plus: with the eraser-cleared combobox search the
full namespace-composed vocabulary (app+custom+current-module) must be visible —
already true once composition lands.

## Part E — acceptance criteria

1. `elt-i18n-key-filter.spec.ts` — all 3 tests GREEN (prova del nove, eraser,
   search-in exclusions). The spec is permanent — never delete.
2. Prova del nove manual round-trip: write a custom translation via API/UI →
   reload → key offered in the desc_key filter vocabulary → selecting it filters
   the sequence whose description_key points at it.
3. search-in panel: revive_every/revive_grace absent; name/plain-text present;
   wire enforcement aligned (BE rejects search_in on excluded columns).
4. Foreign-module keys never offered; custom+app+current-module keys offered.
5. Doc reconciliation text proposed to user (i18n.mdx scope section).
6. svelte-check + core/dal/be test suites green per repo; commits with evidence.

## Part F — TIC-seeded dev-DB state (disposition task #6)

Rows now in dev DB from TIC:
- `custom.translations`: 2 rows `custom.entities.sequence.rows.e2e_prova_del_nove`
  (en-GB/it-IT, hand-written pre-spec) + 2 rows per spec run with timestamped
  unique keys (no cleanup yet).
- `crm.sequences`: row `customers.code` description_key re-pointed at the first
  hand-written probe key.
**APPROVED BY USER (2026-11-26)**: option (a) — spec self-cleaning. afterAll
deletes seeded keys + restores the sequence pointer.
## Part G — task 9 CORRECTED design (2026-11-26, user-ratified after correction)

**COURSE CORRECTION**: the first Part G draft (chips inside the ELT toolbar search
input) was WRONG — the user never meant the list toolbar. Verbatim correction:
"l'eraser di cui si parla è la cta della SEARCH INPUT DENTRO LA POPOVER DELLE
COMBOBOX, niente altro!!!!" The ELT toolbar must NOT be touched.

**The problem (code-verified 2026-11-26)**:
- The translation comboboxes in the CRM sequences filters apply INVISIBLE
  filters: the vocabulary is pre-scoped at the options level
  (`contains: entities.<tk>.rows.` in FormFieldDispatcher — nothing in the UI
  shows it, nothing removes it); on creatable surfaces `defaultSearch` re-imposes
  itself on EVERY popover open (`combo-select.svelte` `if (open) search = defaultSearch`)
  — clear it, close, reopen, the filter is back. "applicato behind".
- The popover eraser (`command-input-clear` in command-input.svelte) clears only
  the typed text — it cannot touch any hidden filter. Hence "mi è impossibile annullare".
- DEBT FOUND: commit b680ccc claims namespace enforcement but `shellNav`/`page`
  imports in FormFieldDispatcher are NEVER used — never wired. Recorded, not in scope.

**Ratified semantics (user answers 2026-11-26)**:
1. Badge strip inside the combobox popover, below the search input, above the options.
2. IMPOSED filters (meta/app-logic mandatory): muted badge, NO X, AND-ed among themselves.
3. PRESET-REMOVABLE + USER filters: normal badge WITH X, OR-ed among themselves;
   the OR-group as a whole ANDs with the imposed group. Within one badge multiple
   terms OR (e.g. a namespace-set badge) — badge = term alternatives.
4. Enter in the popover search input commits the draft text as a new user badge
   (input clears, ready for the next term — this is how OR accumulation is built).
5. The DRAFT (uncommitted typed text) filters LIVE, positioned as a member of the
   user OR-group (NOT in AND with user badges) — user clarification "in AND con
   quelli imposti e in OR con quelli utente". With no badges it narrows normally.
6. Eraser (the popover search-input eraser, nothing else) clears: draft text + user
   badges + preset-removable badges. Only imposed-muted survive. Enabled whenever
   any of those exist, even with empty input.
7. The translation-vocabulary scope (entities.<tk>.rows.) is a PRESET-REMOVABLE
   badge — removing it reveals the full catalog vocabulary. Consequently the FE
   must STOP pre-filtering at the options level: options = full dict keys,
   filtering happens in the badge engine.
8. The mechanism is GENERIC in ComboSelect — every consumer may declare imposed/
   preset filters; i18n_key filter combos are the first consumer. defaultSearch
   stays the creatable-seed mechanism (creatable combos only).
9. Badge lifecycle: user badges clear on single-mode selection (same as the search
   reset today); preset removal persists for the component instance lifetime — a
   fresh mount restores presets (visible badges now — no hidden re-imposition).
   Draft text is transient, clears on close.

**Implementation allocation**:
- primebrick-v3-ui ComboSelect: filter-badge engine — props (snake_case per contract)
  `imposed_filters`/`preset_filters` = arrays of `{label, terms: string[]}`; internal
  user-badge state; badge strip UI under the popover search input; Enter-commit in
  the input keydown (non-creatable path); matching engine ANDs imposed badges, ORs
  user-group badges + live draft. command-input.svelte: `clear_enabled` + `on_clear`
  additive props so the eraser can light up with badges present and clear them.
- primebrick-fe-v3 FormFieldDispatcher i18n_key_filter branch: options become the
  UNFILTERED dict vocabulary (drop `contains` at options level); the previous scope
  `entities.<tk>.rows.` is passed as a preset-removable badge instead.
- Testids: `<dataTestId>-filter-badges` strip, `<dataTestId>-filter-badge` +
  `data-term`/`data-kind` attrs, `<dataTestId>-filter-badge-remove` + data-term;
  eraser stays `command-input-clear`.

**E2E contract** (permanent spec src/e2e/elt-combo-filter-badges.spec.ts, written
BEFORE implementation, headed Edge CDP session):
1. CRM sequences → filters → desc_key combo: the scope badge is VISIBLE as a
   preset-removable chip below the popover search input (nothing hidden anymore).
2. Removing the scope badge (X) reveals keys outside the family — the catalog is
   user-controllable; re-adding text+Enter rebuilds a badge and narrows again.
3. Two committed terms OR: a key matching only the second term IS listed
   (OR semantics proven); imposed-vs-user positioning respected.
4. Eraser clears draft + all removable badges in one click; disabled again after.
5. draft-in-OR live filtering: typing a second term BROADENS the matches beyond
   the committed first badge (never narrows it away).
6. The FE query itself (no badge interaction) is unchanged — single-pick i18n_key
   criterion still applies ILIKE substring on the wire.
