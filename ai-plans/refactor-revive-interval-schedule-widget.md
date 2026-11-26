# Plan: revive_every/offset widget — replace frankenstein composite with schedule widget?

## Status: 🔵 TIC — investigation only, NO implementation — Plan date: 2026-11-26

## User request (verbatim, 2026-11-26)

"abbiamo un widget completamente fuori standard, è quello adottato da revive_every che è un frankenstein mai visto !!! perchè non possiamo usare lo schedule widget che con la choice box dovrebbe coprire il @every e il @at ????? cosa ce lo impediva ????? fase tic"

## Scope discipline

TIC ONLY: read the real code, produce evidence, verdict + options. Do NOT implement. The user ratifies before any TOC.

## Known facts (empirical, from the 2026-11-26 filter-parity session — verify, don't re-assume)

- `revive_every` is a SINGLE varchar column on `crm.sequences`; canonical wire values: `'N unit'` interval strings (e.g. `'1 year'`) OR `'at <ISO>'` literal pin. Same dual-shape for `revive_grace` with the `until` axis.
- Standard filters match it ILIKE substring (proven live: typing `1` in the composite wires `revive_every ILIKE "1 year"`).
- `ReviveIntervalInput` mounts with `literal="at"` (revive_every) / `literal="until"` (revive_grace) on BOTH form and filter surfaces (filter mounting restored in fe `0491b7d`).
- `schedule_spec` is classified EDITOR-only in the filter-widget-parity plan (`elt-filters-widget-parity.md`) — editors degrade to contains-text on filters by sanctioned decision.
- DAL write-path logic parses revive_every in `sequence-decl.ts` (lines ~298-320): `'N unit'` → expire_at = next calendar boundary; `'at <ISO>'` → literal pin; NULL → revive off, clears expire/switch/slot.
- Historical rows exist in dev/prod DBs with the varchar format — any wire change is a MIGRATION, not a refactor.

## TIC tasks — answer with file/line evidence

1. READ the schedule widget end-to-end (find it: grep `schedule_spec` in fe `src/lib/entity-form/`, probably `ScheduleSpecInput` or similar — also check `primebrick-v3-ui`). Document: anatomy (choice box? modes?), what it emits (cron? structured JSON? human string?), which entities use it today (jobs?), its i18n.
2. READ `ReviveIntervalInput` fully — enumerate exactly WHY it's a frankenstein (user's words): non-standard anatomy, bespoke controls, duplicated logic vs the schedule widget?
3. SEMANTIC GAP analysis — the core question: is revive's dual-mode really schedule-like?
   - `'N unit'` interval = RELATIVE duration recurrence (every N units from boundary)
   - `'at <ISO>'` = absolute one-shot pin
   - schedule/cron = absolute calendar recurrence
   These are NOT the same algebra — document precisely what the schedule widget can and cannot express vs revive semantics.
4. WIRE COMPATIBILITY: if the schedule widget were adopted, how would it serialize into the flat varchar `revive_every`? Options: (a) adapter serializing schedule-spec → canonical varchar (lossy? reversible?); (b) migrate the column to a structured spec (DB migration + backfill historical rows + filter semantics change from ILIKE to structured operators); (c) keep varchar but change the editor only. Evaluate each against: ILIKE filter semantics, historical data, `sequenceRevive` write-path parsing, the `revive_offset` sibling (grace/until — same question).
5. FILTER SURFACE consequence: schedule_spec is editor-only by parity doctrine — if revive adopts it, do revive filters stay contains-text (regression vs today's composite) or does the schedule widget need a filter variant? Cost it.
6. VERDICT: one of — (A) adopt schedule widget with adapter, (B) migrate wire to structured spec, (C) keep varchar but RESTYLE ReviveIntervalInput onto standard widget primitives (the likely middle path: the complaint is "fuori standard", maybe the anatomy can be rebuilt from ComboSelect/segmented primitives without touching the wire), (D) keep as-is with documented rationale. Recommend with evidence.

## Context breadcrumbs for next session

- All prior work committed+pushed: core `feature/elt-visibility-prefs-v3`, dal+fe on `feature/sequence-revive-docs` (fe HEAD `4f5366a`), workspace plans on `docs/ext-json-wasm-bun-gate`. Nothing volatile.
- Closed plan with full ledger: `ai-plans/bugfix-elt-filter-widget-drift.md` (incl. addendum on column-order reset).
- Widget sources: fe `src/lib/entity-form/` (FormFieldDispatcher mounts it — grep `ReviveIntervalInput`), specs in `src/e2e/sequences.spec.ts` (the governed-widgets test asserts revive composite anatomy — will need rework if widget changes).
- tz/revive_every are now default_visible:false in the list (dal commit on `feature/sequence-revive-docs`) — user-ratified, do not regress.
- ComboSelect a11y gap (div[role=combobox] no accessible name) is a separate re-homed drift — candidate for a ui plan, NOT this one.
