# Plan — dict page validation convergence (columnErrors → checkFieldValue)

Status: ✅ DONE — all tasks complete, verified, pushed (2026-12-19).
Branch: `feature/ext-json-strict-codec` (all repos).

## Problem

`EntityDictPage` validates through `columnErrors()` — a ~30-line hand-rolled
predicate (`EntityDictPage.svelte:224`) covering ONLY `required`
(nullable===false), `max_length`, `min_length`, `pattern`, `isSnakeKey`
for `code`. Every other contract rule is unchecked client-side:
`min`/`max`/`unsigned`, `format`-driven rules, `depends_on`, numeric
typing. It ALSO runs the whole extras-sheet gate — same blind spot.

It produces `$t()`-translated strings while every other surface emits the
shared `key|jsonParams` wire vocabulary (`kmsg` in core
`field-validation.ts`, decoded by `translated-field-errors.svelte`) —
the same violation renders different text depending on surface.

## Verified facts (TIC)

- `columnErrors` call sites: `composerErrors` (create ✓ gate),
  `pendingValid` (save gate), `invalidRowUids` (per-row taint gate), plus
  two `errors={...}` props (DictRow:1100, pending row:1141, composer:1301).
- `fieldSpecToZod` (`primebrick-v3-ui`) wraps core `checkFieldValue` —
  the SAME predicate `entityFieldValidator` runs server-side. It already
  owns binding coercion (string→bigint/Decimal, boolean, json parse,
  sequence directives).
- Dict cells bind via `FormFieldDispatcher`/`TranslationKeyCell` — raw
  values are wire-shaped already; `safeParse` per column is enough —
  no superforms needed.
- `checkFieldValue` does NOT check required — callers own it
  (form: `placement.required ?? nullable===false`; dict keeps its
  `nullable===false` rule).
- Dict-specific semantics to KEEP: `suggestion_eligible` (empty
  label_key/display_field on create/pending commits the convention
  suggestion — never required-gated), `codeProbe` uniqueness (server
  round-trip), `isSnakeKey` on `code` (dict vocabulary convention —
  verify whether the seeded `code` column already carries
  `format`/`pattern` covering it; if yes drop, if no keep as dict rule).
- `DictFieldCell` renders `<p class="text-xs text-destructive">` with
  already-translated text; chrome shape is fine — the CONTENT must become
  the shared vocabulary (translate `key|params` via a shared helper).

## Tasks

| # | Task | Repo | Status |
|---|------|------|--------|
| V1 | `translateFieldError(msg, t)` — extracted into `@primebrick/ui` utils, exported; `translated-field-errors.svelte` delegates to it | ui | ✅ `7a75c40` |
| V2 | `dictFieldSchema` cache (plain `Map` — SvelteMap inside `$derived` threw `state_unsafe_mutation`, caught by e2e) + per-column `fieldSpecToZod` with `''→undefined` preprocess for non-required | fe | ✅ `f783ca7` |
| V3 | `columnErrors` rewritten on `checkFieldValue` — signature kept → zero call-site churn; `codeProbe`/`isSnakeKey`/`suggestion_eligible` kept as dict rules | fe | ✅ `f783ca7` |
| V4 | Errors translated at produce-time via `translateFieldError` — `DictFieldCell` unchanged (folded into V1–V3) | fe | ✅ `f783ca7` |
| V5 | Composer `values` init → `col.default ??` prefill (create-prefill contract) | fe | ✅ `f783ca7` |
| V6 | E2E "validation gate" — composer snake_key error + ✓ dead + zero POST; saved-row label_key clear → required error + save dead + zero PUT | fe | ✅ `f783ca7` |
| V7 | `svelte-check` 0/0 both repos; dict specs 5/5 + 2/2 + 8/8 green | fe/ui | ✅ |
| V8 | entity-meta-schema.md shared-validation bullet + EntityDictPage header anatomy | fe | ✅ `f783ca7` |

## Out of scope (recorded)

- No layout change — dict stays its own archetype (list+form hybrid).
- No superforms adoption — per-column `safeParse` suffices; the form's
  superforms machinery is binding glue the dict doesn't need.
- `checkEntityFields`-level cross-field checks (immutable-on-update)
  stay server-side — dict already filters `updateEditableColumns`.
