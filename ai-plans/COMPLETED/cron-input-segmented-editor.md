# CronInput — segmented crontab.guru-style editor (TIC/TOC)

## Status: 🟢 DONE — Plan date: 2026-11-03 — Updated: 2026-11-03 (shipped: `@primebrick/ui` 3.3.0 · FE 3.5.0 · BE 3.6.0)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | 5-cell segmented editor inside ONE canonical input chrome (primary gradient, eraser, equal cells) | ✅ done | 11-03 | single bar `divide-x`, not 5 inputs |
| 2 | Field-aware keystroke mask: out-of-range untypeable, name prefix-validation, `00`→`0` normalization, reject-flash | ✅ done | 11-03 | prefix-of-range rule; letters capped at maxDigits AND ≤ max |
| 3 | OTP flow: auto-advance on full digit run, Space/→/Tab/Enter advance, ←→ cross cells, ↑↓ step, Enter-on-last submits | ✅ done | 11-03 | continuation chars `-`/`,` bounce to previous non-empty field |
| 4 | Paste fan-out + canonicalization: `/5`→`*/5`, `9,/2`→`9,*/2`, `*/1`→`*` | ✅ done | 11-03 | `expandStepPrefix`+`collapseWildcardStep` via `normalizeToken` |
| 5 | empty = `*` everywhere (ghost placeholder, emit, preview, Apply gate) + echo-guard on `bind:value` | ✅ done | 11-03 | own-emission guard prevents reseed loop |
| 6 | UOM labels localized (≤4 chars) ABOVE cells; quoted italic centered hero description (cronstrue, final *-filled expr) | ✅ done | 11-03 | `field.*.short` ×7 locales |
| 7 | Toggleable legend — OFF by default, `Info` CTA at LD second slot (`right-10`); per-cell range row + char:desc + clickable example per operator | ✅ done | 11-03 | replaces static bullets; examples fill active cell |
| 8 | cronstrue "del mese" → "di ogni mese" fix (×6 phrasings, wildcard-month only) + `pt`→`pt_PT` locale fix | ✅ done | 11-03 | post-processing in `describeScheduleSpec` |
| 9 | next-runs preview inside CronInput | 🚫 dropped | 11-03 | user decision — parent schedule component owns next-runs with its badges (`schedule_spec.next` stays) |
| 10 | BE seeds ×7 (labels, UOM, tokens, legend, kbd) + purges (`hint.format`/`hint.next`/`hint.example`) + signed MANIFEST | ✅ done | 11-03 | 9 patches, 89 total signed (dev-micha-2), Redis flushed |
| 11 | Verify: vitest 55/55, svelte-check 0/0, standards clean, sveld 145/145, UI+vendor builds, Playwright E2E 4/4, real screenshot review | ✅ done | 11-03 | visual iterations fixed clipping/wrap/overlap |
| 12 | GitFlow: feature → merge develop (×3 repos) → releases UI 3.3.0 / FE 3.5.0 / BE 3.6.0, tags on main, backmerges | ✅ done | 11-03 | |

---

## Shipped anatomy (final — supersedes the TIC diagram below)

```
MIN     HRS     DOM     MTH     DOW        ← localized UOM, active = primary
┌─────────────────────────────────┐ ┌──┐┌──┐
│ */15 │ 9-17 │  *   │  *   │ MON-FRI │ │ⓘ ││⌫ │ ← ONE bar, eraser + legend toggle
└─────────────────────────────────┘ └──┘└──┘
        "Ogni 15 minuti, tra le 09:00 e le 09:59,  ← hero desc: centered, italic,
          dal lunedì al venerdì"                     quoted, text-foreground
— legend (toggle, OFF by default, per-cell) ————————
MIN 0-59                                        ← active-field UOM + range
*   qualsiasi valore        [*]
,   lista di valori         [0,30]              ← real per-field example,
-   intervallo              [5-20]                  clickable → fills the cell
/   ogni N                  [*/15]
—————————————————————————————————————————————————
[←→ celle] [␣⏎ avanti] [esc Chiudi]      [Applica]  ← kbd footer + Apply
```

## Post-TIC deltas (what changed during review iterations)

1. **Editable-grid → continuous bar**: separate column inputs replaced by one
   `divide-x` bar in canonical chrome (`border-primary-gradient`, `h-9`,
   shadow, hover, ring) — the mask lives inside the chrome.
2. **Legend static → toggleable per-cell**: off by default, `Info` CTA at the
   documented LD second trailing slot (`right-10`). Carries the active field's
   range + one clickable example per operator (examples moved inside it —
   the standalone chips row was removed).
3. **next-runs dropped**: user decision — parent `ScheduleSpecInput` computes
   them with its own badge strip (`app.widgets.schedule_spec.next`).
4. **empty=`*` semantics**: ghost placeholder + `*`-filled emit/preview/Apply
   — preview always describes the FINAL expression, not help text.
5. **Canonicalization**: `00`→`0`, leading `/`→`*/`, `*/1`→`*`; mask relaxed
   to "prefix of range" so legit sequences stay typeable while impossible
   ones (`60`, `9999`, `13` month) remain rejected.
6. **Dead-key purges**: `hint.format`, `hint.next`, `hint.example` soft-deleted
   (patch `20261117210000`+`20261117220000`).

## Open notes / possible future work (discussed, not blocking)

- **Quartz extras vs NATS runtime**: the mask accepts `?`/`L`/`W`/`#` in
  dom/dow (croner grammar) but the runtime is NATS `Nats-Schedule`
  (job-handler → `jobs.schedule.*`) whose cron vocabulary may not support
  quartz syntax — verify or restrict the mask to the NATS subset.
- **Dead exports**: `maskCronInput`, `fieldIndexAt`, `fieldStartOffset`
  remain exported but are only used by unit tests (single-input era
  leftovers) — candidates for removal from the public surface.
- **Name auto-advance**: digit runs auto-advance at maxDigits; completed
  names (`JAN`) don't — small OTP-contract gap, could auto-advance when a
  name completes exactly.

---

## Context / why

The first iteration of `CronInput` (single masked `TextInput` + field pills +
text legend) was rejected: (a) letters like `DFDF` are typeable in numeric
fields — the mask is not field-aware; (b) the caret-driven pill highlight does
not feel like "moving from minute to hour"; (c) the one-line legend is
unreadable; (d) it does not look like the reference site.

Reference: **crontab.guru** — a 5-column table where each column is a field:
`name | current value | allowed values | allowed special chars`, with the
active column highlighted and a large human description. Our compact version
makes the table cells **the inputs themselves**.

## Decisions (from user)

- Layout: **editable 5-column grid** (agent's pick — the legend IS the layout).
- Extras: **next-runs preview** on valid expressions. Names JAN-DEC / SUN-SAT
  stay allowed, with **prefix-validation at keystroke**.
- Note: `CronInput` only ever carries 5-field cron; `@every`/`@at` are other
  assist modes, so `nextScheduleRuns` input is always a valid cron string.

## Anatomy (TIC original — superseded by "Shipped anatomy" above)

```
┌────────────────────────────────────────────────────────┐
│ MINUTE   HOUR    DAY      MONTH    WEEKDAY   ← labels   │
│ ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐   (active =  │
│ │ */15 ││ *    ││ *    ││ *    ││ *    │    primary)  │
│ └──────┘└──────┘└──────┘└──────┘└──────┘              │
│ 0-59     0-23    1-31    1-12    0-7      ← ranges     │
│                          JAN-DEC SUN-SAT  ← names      │
├────────────────────────────────────────────────────────┤
│ * ogni valore · , lista · - intervallo · / passo       │
├────────────────────────────────────────────────────────┤
│ ▶ Every 15 minutes                                     │
│   prossime 21:00 · 21:15 · 21:30                       │
└────────────────────────────────────────────────────────┘
```

- Inputs: monospace, centered, `aria-label` = translated field label.
- Active column: `text-primary` label + `ring-primary` input (focus-driven).
- Invalid column: `ring-destructive`/`bg-destructive/5` + error line names the
  field (reuses `hint.invalid`).
- Empty-state: grid renders with empty inputs; hint row shows `hint.format`.

## Editing model

`drafts: string[5]` is the editing source of truth (one per column).

- **Emitted value** (bindable `value`): tokens up to the last non-empty field;
  intermediate empty fields emit `*` (positionally correct — typing only `MON`
  in weekday emits `* * * * MON`). Trailing empties omitted.
- **Reading** `value` → drafts: `split(/\s+/)`, missing → `''`.
- **`valid`** (bindable): all 5 drafts non-empty AND `validateFieldToken` per
  field AND `parseScheduleSpec(expr).ok`. Apply gate unchanged
  (`canApply = cronValid`).

## Keystroke contract (the real "mask")

`acceptChar(meta, draft, ch) -> boolean` — evaluated on `beforeinput`/`input`:

- Digits and `* , - /` always allowed; `?` in dom/dow.
- Letters: auto-uppercased, allowed iff the current **alpha-run** (letters
  since last non-letter char) + `ch` is a prefix of a field name
  (`J`→`JA`→`JAN` ok, `D` dropped in month since no month starts with D;
  `L`/`W` quartz extras in dom/dow via explicit check).
- `Space` never enters a draft — it **commits and focuses the next field**
  (typing `*/15<space>` jumps to hour).
- Rejected keystrokes trigger a brief destructive flash on that input —
  the rejection is *felt*, not silent.

## Focus navigation

- `Space` / `ArrowRight` at end → next field; `ArrowLeft` at start → prev.
- `Tab`/`Shift-Tab` natural order across the 5 inputs.
- `ArrowUp`/`ArrowDown` on a purely numeric draft → `clamp(n±1, min, max)`
  (wheel-style stepping — cheap, high interactivity).
- **Paste fan-out**: pasting `*/15 * * * *` into ANY field distributes tokens
  (5-token paste fills all fields; shorter paste fills from focused field
  forward). `preventDefault` always.

## Status block (below grid)

1. **Ops legend** — `*`, `,`, `-`, `/` + translated meaning (existing keys).
2. **State line** — valid → localized cronstrue description; first-invalid →
   `{field label}: {hint.invalid}`; otherwise → `hint.format`.
3. **Next-runs line** (valid only) — `nextScheduleRuns(expr, 3)` formatted via
   `Intl.DateTimeFormat(locale, { month:'short', day:'numeric',
   hour:'2-digit', minute:'2-digit' })`. New key
   `app.widgets.cron_input.hint.next` ×7 → patch `20261117150000`.

## Files

| File | Change |
|---|---|
| `ui/src/lib/components/cron-input/cron-input.svelte` | rewrite internals → 5-col grid |
| `ui/src/lib/components/cron-input/cron-fields.ts` | add `acceptChar`, `alphaNamePrefix`, `distributePaste`, `emitExpression`; keep `validateFieldToken`, `fieldIndexAt`, `maskCronInput` (paste path/tests) |
| `ui/src/lib/components/cron-input/index.ts` | export new helpers |
| `ui/test/cron-fields.test.ts` | tests: acceptChar per field, name prefixes, emit auto-`*`, paste distribute, ↑↓ step |
| `fe/src/e2e/job-trigger-form-lifecycle.spec.ts` | update cron section to segmented testids |
| `be/db-meta/patches/20261117150000_cron_input_next_label.sql` | `hint.next` ×7 + sign + apply + Redis |
| `fe/src/lib/i18n/messages/en-GB-fallback.json` | + `hint.next` |

### data-testid map (input-level now)

- root: `{id}-root`; inputs: `{id}-field-minute|hour|day_of_month|month|weekday`
- grid: `{id}-grid`; legend: `{id}-legend`; desc: `{id}-desc`; next: `{id}-next`
- The `data-testid` prop lands on the component ROOT now (not the single
  input) — E2E updated accordingly.

## Acceptance criteria

1. `D` typed in minute field → dropped + flash (not just marked invalid).
2. `J`,`JA`,`JAN` in month → kept; `X`/`D` → dropped. Same for weekday names.
3. Space/→/← move focus between fields; Tab works; ↑↓ steps numeric drafts.
4. Pasting `*/15 * * * *` anywhere fills all five columns.
5. Active column visually distinct; legend table always visible.
6. Valid expr → live localized description + 3 next runs; invalid →
   field-named error; `valid=false` while any field empty/invalid → Apply
   stays disabled.
7. Weekday-only edit emits `* * * * MON` (auto-`*` positional fill).
8. All strings localized (7 locales); sveld clean; standards clean;
   `vitest` green; E2E green.
