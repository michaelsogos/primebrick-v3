# CronInput — segmented crontab.guru-style editor (TIC/TOC)

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

## Anatomy

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
