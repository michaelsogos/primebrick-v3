# Sequence pattern-builder widget — plan

**Status**: ✅ DONE — implemented, verified, committed
**Branch**: `feature/ext-json-strict-codec` (all repos)
**Repos**: core, ui, dal, fe, be (i18n patch)

## Goal

`format:"sequence_pattern"` — a fully autowired authoring widget for the
`sequence.pattern` column: free literal typing + a CTA inside the input
(left of the eraser) that opens a token-catalog sheet; each token row
shows the token, a rendered example and an inject CTA that inserts at the
saved caret/selection; the sheet shows a live interpolated preview.
Everything dispatched through metadata — no page-level hardcoding.

## Contract

- New `MetaColumnFormat` member `sequence_pattern` — DISTINCT from
  `format:"sequence"` (seq-bound directive wire value — untouched).
- `dal/src/builtin/sequence-decl.ts` pattern column gains the format →
  the dispatcher picks the widget automatically on every surface.
- Token catalog exported from `@primebrick/core` (`sequenceTokenCatalog`)
  — grammar never duplicated in FE.
- Preview via `renderSequenceValue` (client-safe) — same engine as BE.
- Validation converged: `fieldSpecToZod` refines through
  `parseSequencePattern` — same verdict as server `vPattern`.

## Token grammar (core/src/sequence.ts)

- `{seq}` / `{seq:W}` W∈1..19 — exactly one counter token
- `{yyyy} {yy} {MM} {dd} {q}` — each once
- `{sez} {sez2} {sez3}` — each once
- `{{` `}}` — literal braces, repeatable
- free literal text otherwise

## Tasks

1. **core** `src/sequence.ts` — export `sequenceTokenCatalog()`:
   `{token, kind: "counter"|"date"|"sez"|"literal", example(ctx)}` where
   example renders the single token via the shared segment renderer
   (counter=42n, at, partitions samples). Add `sequence_pattern` to
   `MetaColumnFormat` (entity-meta.ts).
2. **ui** `field-spec-to-zod.ts` — `sequence_pattern` → string refine
   `parseSequencePattern` → error key `app.widgets.sequence_pattern.invalid`.
3. **dal** `sequence-decl.ts` — pattern column `format:"sequence_pattern"`.
4. **fe** `src/lib/components/ui/sequence-pattern-input/` —
   `sequence-pattern-input.svelte`: InputGroup anatomy (NumericInput
   precedent) — InputGroupInput free text, `{}` InputGroupButton left of
   eraser, eraser clear. Caret/selection tracked on input/click/keyup;
   blur preserves last position. `on_insert` splices at caret (replaces
   active selection), refocuses, caret after token.
5. **fe** sheet `'entity.sequencePattern'` — SHEET_PANEL_IDS +
   SheetPanelPropsMap `{get_value: () => string, on_insert: (t)=>void,
   tz?: string}` + panel component: token rows (token mono, lucide tag
   icon, label_key desc, rendered example, inject CTA), used tokens
   disabled with a lucide check/tag badge, live preview section with
   editable example context (counter=42, at=now, sez samples A/01/X when
   pattern uses them), parse errors shown translated.
6. **fe** `FormFieldDispatcher` — `format === 'sequence_pattern'` →
   control `'sequence_pattern'` → SequencePatternInput; `on_insert`
   writes back through `record`/bindable value (same contract as
   currency `onCurrencyChange`).
7. **be** db-meta i18n patch `app.widgets.sequence_pattern.*` — CTA
   aria, sheet title, token labels/descriptions (en+it+de+fr+es),
   preview/context labels, `invalid` error; sign manifest.
8. **e2e** `sequences.spec.ts` — type literal, open sheet via CTA,
   token examples visible, inject at caret, selection replace, used
   token disabled + lucide badge, preview valid/invalid, clear,
   save blocked on invalid (zero POST).
9. **docs** — entity-metadata.mdx format table row (fe+be copies),
   sequence grammar doc if it lists formats.
10. **verify** — core tsc+test, ui svelte-check+build, dal tsc+test,
    fe svelte-check + focused e2e + full sequences suite, be i18n patch
    applied. Commit per repo, push.

## Non-goals

- No grammar change, no allocation/claim semantics change.
- No `format:"sequence"` (directive) changes.
- No partition editing in the form (partitions are claim-time context —
  the sheet uses example values only).

## Implementation notes (as built — diverged from the draft on purpose)

- The widget lives in **ui** (`components/sequence-pattern-input`), not
  fe — reusable-by-construction; the sheet opener is host-injected
  (`on_pick`, same contract as `uom.on_pick`), so ui stays
  environment-neutral.
- **Validation needed no zod branch** — `fieldSpecToZod`'s generic string
  path delegates to core `checkFieldValue`; the `sequence_pattern` case
  lives there once (form + wire share the verdict).
- **Stacked-sheet remount channel** — `openSheet(…, {stack:true})`
  remounts the record pane, so closure-bound writes orphan. The insert
  rides the **live DOM input** (`el.value` + `input` event → real bind
  chain → $form → draft). `on_change` attaches lazily via
  MutationObserver (the input may not exist at subscribe time) and pushes
  a snapshot on each (re)attach.
- **Caret semantics** — `pick.caret` is `null` when the field was never
  touched (untouched → append); at insert time the **live DOM selection
  wins** (survives blur, post-open moves, our own `setSelectionRange`),
  snapshot only covers DOM-cleared `{0,0}`.
- **Bug found by the e2e**: `useFormDraft`'s debounced persist was
  cancelled by its `$effect` cleanup on unmount — the last ~400ms of
  edits died on every sheet-stack/navigation. Fixed with a `pendingWrite`
  snapshot flushed in `onDestroy` (universal data-loss fix, not
  widget-specific).
- i18n patch: `public.translations` (segregation), token keys lowercase
  (`tokens.mm` — key grammar rejects uppercase segments).

## Verification

- e2e `sequences.spec.ts`: **17/17** (incl. the dedicated widget test —
  typing, sheet, examples, caret insert, mid-string insert, selection
  replace, used gating, live preview, submit block + zero POST, clear)
- `form-draft.spec.ts`: fixture-side `e2e.draft.fired` emit-census 400 —
  **pre-existing rot**, identical failure on clean stash.
- svelte-check: fe 0/0, ui 0/0. core 199/199+1skip, dal 834/834.
- i18n patch applied to dev DB (keys resolve, no raw fallbacks).
