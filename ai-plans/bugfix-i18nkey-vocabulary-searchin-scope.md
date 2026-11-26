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
| fe docs/dev-guide/i18n.mdx (load order) | dict composition: `app` → `custom` → route module lazily; `system` always loaded | ratifies the user's "regola generale": visible namespaces = custom + app + current module (+system) |
| fe docs/ai/e2e-browser-session.md (final specs only) | first spec written for a behavior IS the final persistent spec — no throwaway probes | the TIC spec `elt-i18n-key-filter.spec.ts` is permanent; it stays red until TOC fixes land |
| core AGENTS.md (docs are the contract) | documented `i18n_key` vocabulary scope: `*.entities.<tk>.rows.*` or broad `.entities.` fallback | the user's ratified rule PARTIALLY SUPERSEDES the doc — reconciliation required (see Part C) |

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

## Status: 🟡 PARTIALLY DONE — Plan date: 2026-11-26 / TOC session 1: tasks 1-6 done, 7-9 open

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
| 9 | ELT search-bar applied-filter visibility: panel-applied filters surface as visible/editable criteria in the search-bar area; eraser clears them (user-ratified 2026-11-26, Part D) | ⏳ not done | — | verify what `hasAppliedFilters` renders today; design chips/inline affordance before implementing |

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
