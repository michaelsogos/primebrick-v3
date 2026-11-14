# Feature — Sparkline tooltip anatomy (readable, on-standard)

## Problem

Current slot tooltip is one flat line: `11-14: 3 Succeeded, 0 Failed, 0
Skipped` — cryptic date slice, values comma-packed, no visual sense.

## Doc findings (gate — cited)

| Doc | Finding |
|---|---|
| `primebrick-v3-ui/src/lib/components/tooltip/tooltip-content.svelte` | styled Content container (bg-foreground, portal) — children are free-form snippet |
| `primebrick-v3-ui/src/lib/components/tooltip/priority-tooltip-content.svelte` | canonical anatomy = semibold title row + body (`flex flex-col gap-1`) — mirror this inside Content children |
| `primebrick-fe-v3/docs/ai/field-hints.md` | copy rules: no jargon, `$t()` — series labels already arrive translated via `label_key` in TableCell |
| `docs/ai/workflow.md` | e2e spec is the deliverable proof |

## Design

Per-slot tooltip, two blocks:

```
November 14, 2026            ← full localized date (Intl, browser locale)
●  3 Succeeded               ← colored dot (series color) + count + label
●  1 Failed
●  0 Skipped
```

- **Title** = full date or range, by `bucket_unit`:
  - `hour` → "14 November 2026, 16:00–17:00" (bucket span)
  - `day` → "14 November 2026"
  - `week` → "9–15 November 2026" (start → start+6d)
  - `month` → "November 2026"
  - Locale via `Intl.DateTimeFormat` (no hardcoded strings — values,
    not copy)
- **Rows** = one per series, vertically stacked: `<span class="size-2
  rounded-full {bgClass}">` + `{count} {label}`; `bgClass` =
  `s.color` with `fill-` → `bg-` (same Tailwind palette).
- Trigger `aria-label` keeps the flattened equivalent (a11y intact).

## Changes

| File | Change |
|---|---|
| `v3-ui/.../SparklineBars.svelte` | `bucketTitle` → structured `Tooltip.Content` children (date header + per-series dot rows); helpers `bucketRangeLabel`, `bgOf(color)` |
| `fe-v3/src/e2e/sticky-hideable-columns.spec.ts` | tooltip test asserts structured anatomy: date-ish header + each series label on its own row |

## Acceptance criteria

- Hover a slot → styled tooltip: full localized date/range header +
  vertical series rows with colored dots.
- e2e permanent: asserts header text + per-series rows live.
