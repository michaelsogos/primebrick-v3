# FIX — JsonCellViewer: canonical cell-link anatomy

## Context (TIC)

`JsonCellViewer.svelte` renders the generic `format:"json"` ELT cell
(TableCell.svelte:376-403 fallback — after mapper widgets and condition
chips). It is the ONLY cell using an invented anatomy: ghost button +
`braces` icon + "View" label. Every other sheet-opening cell uses
`CellAffordance` (ref default-link, `MapperCellViewer` — same
`format:"json"` dispatch, `widget:"payload_map"`).

## Decision (user-specified, not guessed)

- Remove the `{}` braces icon entirely.
- Keep ONLY the "Visualizza" text (`app.common.view` — unchanged key).
- Style: canonical cell LINK anatomy → `CellAffordance` text button
  (`font-medium`, underline on hover) — identical to MapperCellViewer's
  text affordance.
- Same sheet: `openSheet('entity.jsonViewer', { value })` — unchanged.
- No trailing icon ("e basta"): no `href`, no `oniconclick`.

## TOC

| # | Task | File |
|---|---|---|
| 1 | Rewrite `JsonCellViewer` on `CellAffordance`: `text={$t('app.common.view')}`, `ontextclick` → sheet, no icon/href, `test_id="json-cell"` | `src/lib/components/entity-list-table/table/JsonCellViewer.svelte` |
| 2 | svelte-check + unit/e2e sanity (ELT render unaffected — component boundary unchanged) | — |
| 3 | Commit fe-v3 | — |

## Out of scope

- Changing the `entity.jsonViewer` sheet itself.
- Mapper/conditions/ref cell anatomy (already canonical).
- `data-testid` consumers — none exist for this cell today.

## Acceptance

- Generic JSONB cell = text link "Visualizza" only, hover underline,
  same font as sibling cells; click → existing jsonViewer sheet.
- No braces icon anywhere in the cell.
- svelte-check 0/0; dev-stack stays up for eyeball verification.
