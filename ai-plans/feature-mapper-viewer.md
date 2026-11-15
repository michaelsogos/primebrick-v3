# Mapper viewer — sheet panel + "Visualizza mappa" cell link for `payload_map`-class columns

> Standalone plan (TIC approved by user). Trigger: ELT `format:"json"`
> cells on DST-shaped mapper documents deserve a prose viewer mirroring
> the form builder, not the generic JSON inspector.

## Status: ⚪ TODO — Plan date: 2025-11-16

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | v3-ui: `PayloadMapViewer` read-only component (rows = form-builder anatomy, prose not inputs) | ⏳ not done | — | shares `payload-map-editor/` dir + `@primebrick/core` DST types |
| 2 | fe-v3: `entity.mapperViewer` sheet panel (VIEWER archetype, census-resolved schemas) + registry entry | ⏳ not done | — | mirrors `JsonViewerPanel` + `EntityRecordSheet` census access |
| 3 | fe-v3: `MapperCellViewer` — CellAffordance "Visualizza mappa" link + ExternalLink → detail route `_blank`; `TableCell` branch on `widget:"payload_map"` | ⏳ not done | — | same anatomy as `ref` default-link cell |
| 4 | e2e: cell link → sheet opens with prose rows; detail CTA href; extend or sibling `payload-map-widget.spec.ts` | ⏳ not done | — | run vs live stack |
| 5 | Commit v3-ui + fe-v3 on `feature/mapper-viewer` (or reuse trigger-page branch?) | ⏳ not done | — | decision: new branch vs fold into `feature/jobs-trigger-page-refinement` |

---

## Empirical findings (verified)

**The builder anatomy to mirror** — `v3-ui/.../payload-map-editor.svelte:1290-1320`:
required fields → `rounded-md border divide-y` list; optional fields →
`Accordion` "Optional variables ({count})". Row = `fieldRow(field, prop)`:
`grid-cols-[1fr_1fr_2fr]` → [name | kind | source]:
- name: `typeIcon(prop)` + destructive `*` if required + mono field + `FormLabelWithPriorityHelp`
- kind: `ComboSelect` on `PAYLOAD_MAP_ENTRY_KINDS`
- source: per-kind input (path/const/meta/inject/list/map) + `fallbackClauses(field)` block below the row
- raw `JsonValueEditor` under the rows (editor-only — excluded from viewer)

**DST contract** (`@primebrick/core` `payload-map.ts` — already shared):
`PayloadMap = Record<field, PayloadMapEntry>`; entry kinds `const | path |
meta | inject | list | map`, each with optional `fallback[]` (1 level,
user kinds only); `map.entries`/`list.items` nest `PayloadMapItemEntry`.

**i18n already in place** (`fe src/lib/i18n/messages/en-GB-fallback.json`,
`app.widgets.payload_map.*`): kind labels ("Fixed value", "Event
property", "Process context", "Generated at send", "List of values",
"Per key", "Template variables"), `inject.*` labels, `fallback.lead`
="otherwise, if empty". Missing: link text + panel title → add
`app.widgets.mapper.*` family (2 keys) so future mappers don't borrow
payload_map's namespace for generic chrome.

**Cell affordance pattern** (`TableCell.svelte:361-410`, `ref` default
anatomy): `CellAffordance` — text click opens a sheet; trailing icon is an
`<a _blank>` (`ExternalLink` icon). Exactly the requested "link + right
CTA" anatomy.

**Detail-route source**: census `kind:"detail"` route + row uid — the
same derivation `click-handlers.ts` uses for dblclick. `job_trigger` has
`/system/job/triggers/[uuid]`. No detail decl → CTA hidden.

**Schema access from a sheet**: `EntityRecordSheet.svelte` already does
`routesCensusFromModules(shellNav.modules)` and
`useCensusSubjectOptions(() => shellNav.modules)` → callable lookup by
`row.target_subject` → `payload_schema`; emit by `row.event_subject` →
`payload_schema`. The panel can self-resolve — `openSheet` payload stays
thin: `{ value, entity, row, column_key }`.

**Discriminator for the cell branch**: `EntityColumn.widget` exists
(core meta — host widget registry key); `payload_map` is the only DST
widget today. `emailsender.templates.variables` is `format:"json"`
WITHOUT widget (vocabulary declaration, not a map) → keeps generic
JsonViewer. Future mappers opt in via a `MAPPER_WIDGETS` set in the cell.

---

## Design

### 1. `PayloadMapViewer` (v3-ui, `payload-map-editor/payload-map-viewer.svelte`)

Props: `{ value: string (JSON DST), target_schema?, source_schema? }`.
Mirrors `fieldRow` anatomy minus inputs:

- name cell: identical (typeIcon, `*`, help)
- kind cell: label chip — `$t('app.widgets.payload_map.kind.<kind>')`
  (+ `kind.map_vars` when the field is a variables map?)
- source cell — prose per kind:
  - `const` → `"<value>"` quoted mono
  - `path` → `a.b.c` mono (source property)
  - `meta` → `app.widgets.payload_map.meta.<m>` or raw kind label
  - `inject` → `app.widgets.payload_map.inject.<i>` label
  - `list` → chips row (const items) / per-item prose line otherwise
  - `map` → indented sub-rows `key → <prose>` (same grid, depth+1)
  - absent entry → muted "not mapped" line (required → warning tint)
- `fallback[]` → sub-lines: `otherwise, if empty → <prose>` (reuses
  `fallback.lead`)
- unparseable DST → fallback to a "show raw" block (JsonCodeBlock) —
  never a blank sheet
- groups: required block + optional accordion — same DOM contract
  (`data-testid="mapper-viewer-rows"` etc.)

No `JsonValueEditor`, no issues/hints, no editing affordances.

### 2. `entity.mapperViewer` panel (fe `entity-list/sheets/panels/MapperViewerPanel.svelte`)

- Registered in `sheet-manager.svelte.ts` alongside `entity.jsonViewer`;
  payload `{ value, entity, row, column_key }`.
- Self-resolves: callable via `useCensusSubjectOptions` on
  `row.target_subject` → `target_schema`; emit via `row.event_subject` →
  `source_schema`. Not in census → schema-less mode (rows = authored
  entries, map keys as field names).
- Title: column `label_key` ("Mappatura payload") + `Braces`/`Route`
  icon. No mode toggle (single prose view).
- `EntityRecordSheet` precedent proves census access inside panels.

### 3. `MapperCellViewer` + `TableCell` branch

```
{:else if column.format === 'json' && MAPPER_WIDGETS.has(column.widget ?? '') && value}
  <MapperCellViewer {value} {column} {row} detailHref={...} />
```

- `CellAffordance`: text `$t('app.widgets.mapper.view')` →
  `openSheet('entity.mapperViewer', …)`; icon `<a _blank>` → census
  detail href (hidden when absent — `route:"none"` precedent).
- Placed BEFORE the conditions-array check? No — `payload_map` is never
  a conditions array, but keep the widget check first anyway (explicit
  opt-in beats shape-sniffing). Order in the `json` branch:
  `widget-mapper → conditions → generic JsonCellViewer`.

### 4. Reusability engine

The viewer keys on the **DST contract** (`PayloadMapEntry` vocabulary
from core), not the column name — any future mapper adopting the same
DST joins `MAPPER_WIDGETS` and gets cell+sheet for free. A different DST
family gets its own `widget` → own branch. The "same dynamic engine" the
user described = this contract-keyed reuse.

### 5. e2e

Extend `payload-map-widget.spec.ts` or new `mapper-viewer.spec.ts` on
`/system/job/triggers`: enable `payload_map` via column selector → cell
shows "Visualizza mappa" → click → sheet with `mapper-viewer-rows`,
prose assertions on a seeded row (path/const visible as labels not
inputs) → ExternalLink href = `/system/job/triggers/<uuid>`.

---

## Open questions for user

1. **Row source**: schema-resolved (all target fields incl. unmapped —
   identical to builder) or authored-entries-only? *Proposal:
   schema-resolved with "not mapped" muted lines; authored-only fallback
   when census can't resolve the callable.*
2. **Branch**: new `feature/mapper-viewer` vs fold into
   `feature/jobs-trigger-page-refinement` (still open, unmerged)?
   *Proposal: new branch — different feature, trigger branch may close
   independently.*
3. **Panel icon**: `Braces` (JSON family) vs `Route`/`Waypoints` (mapper
   semantics)? *Proposal: `Waypoints`.*
