# Sheet Panels — Phase 2 Standardization Plan

> Continuation of `ai-plans/sheet-anatomy-standardization.md` (phase 1 done:
> `SheetPanelLayout`, `SheetHeaderAction`, `SheetSectionTitle`, mandatory
> `icon` prop, uniform 384px width). This plan covers the **unfinished
> phase-2 migration** plus new anomalies found during the 2026-09-27 audit.

## Canonical standard (from `docs/ai/sheets.md` — DO NOT reinvent)

- One global host (`SheetHost`); panels render **inner content only**,
  never `Sheet.Root`/`Sheet.Content`.
- Every panel MUST use `SheetPanelLayout`: HEAD (`icon` + `title` +
  `actions`), optional TOOLBAR, CONTENT (only scrollable), optional FOOT.
- HEAD icon is **mandatory** and MUST match the opener CTA icon.
  AI-assistant sheets: `AiIcon` + `assistant_prefix` + topic qualifier.
- HEAD CTAs share ONE chrome (`SheetHeaderAction` / the `size-8` custom
  class); no `Button` component in the header.
- Width is uniform (384px); no `w-[...]` in `contentClass` — already
  verified compliant (no `contentClass: 'w-[...'` call sites remain).
- TOOLBAR = tools only; metadata lives in CONTENT; `SheetSectionTitle`
  for section headers.

## Current compliance audit (verified 2026-09-27)

Registry: 16 ids → 14 distinct components.

### ✅ Compliant (use `SheetPanelLayout` + icon)

`shell.aiModelTestReport`, `shell.aiCerebellum`, `shell.aiModelCache`,
`shell.aiModelImport`.

### ❌ Non-compliant — custom anatomy (10 panels)

All declare own `flex h-full flex-col` + direct `SheetHeader`, **no icon**
(SheetHeader has no icon slot — only SheetPanelLayout renders one):

| Panel id / file | Specific gaps (evidence) |
|---|---|
| `shell.errors` / ErrorsPanel | no icon (should be `triangle-alert`, = AppTopbar opener); clear-all CTA uses `Button ghost size icon h-8 w-8` → migrate to `SheetHeaderAction` |
| `shell.versions` / VersionsPanel | no icon (`blocks` per prior plan); owns close button |
| `shell.aiChat` / AiChatPanel | **nests its own `<Sheet.Content showClose={false} style="height:100vh">` inside the host's `Sheet.Content`** — structural bug; CTAs use `Button ghost size-7` (wrong pattern); icon `MessageSquare` instead of `AiIcon`+`global` topic; own conversations sidebar |
| `entity.searchIn` / SearchInPanel | no icon (`search`); reset CTA uses `Button` → `SheetHeaderAction` |
| `entity.columns` / ColumnsPanel | no icon (`columns-3`); reset CTA `Button`; drag handle column OK |
| `entity.filters` / FiltersPanel | no icon (`funnel`); apply/reset CTAs `Button`; Tabs inside CONTENT (allowed); **dead `content` prop** (see anomalies) |
| `entity.versionHistory` / VersionHistoryPanel | no icon (`history`) |
| `config.currencySelect` / CurrencySelectPanel | no icon (`currency`); TOOLBAR strip already correct (search input) — port into `toolbar` snippet |
| `config.protocolSelect` / ProtocolSelectPanel | no icon (`link`) |
| `config.phonePrefixSelect` / PhonePrefixSelectPanel | no icon (`phone`); owns toolbar strip |

### ⚠️ Partial — shared `smart-ai/ai-chat-panel.svelte`

Used by `config.regexAiChat`, `config.jsonAiChat`, `shell.aiGuide`.
Has `AiIcon` HEAD (correct convention) but custom `flex h-full flex-col`
+ `SheetHeader` + `Button ghost size-7` close → migrate to
`SheetPanelLayout` + `SheetHeaderAction`, keeping FOOT input box and the
internal non-scrollable zones via `contentClass="p-0"`.

## Structural anomalies (beyond styling)

1. **`AiChatPanel` nested `Sheet.Content`** (`AiChatPanel.svelte:111`):
   panel renders `<Sheet.Content>` inside SheetHost's own `Sheet.Content`.
   bits-ui resolves the parent context so it "works" visually but produces
   a nested dialog layer (double padding/`height:100vh` hack). Must render
   inner content only.
2. **`entity.filters` prop-shape wart**: `EntityListTableHeader` calls
   `openSheet('entity.filters', { content: FiltersPanel, props: {...} }
   as any)`; the panel declares `content: any` but **never renders it** —
   real props arrive flat via `useSheetPanels`' reactive `sheetState.props`
   rewrite. Result: a dead prop, a misleading API, `as any` bypassing
   `SheetPanelPropsMap` type-safety. Fix: type `entity.filters` props
   properly in `SheetPanelPropsMap`, open with flat props, delete `content`
   from the panel signature.
3. **`as any` on every entity-panel open call** (`entity.columns`,
   `entity.searchIn`, `entity.filters` in EntityListTableHeader/SearchBar +
   the `useSheetPanels` rewrites) — hides `SheetPanelPropsMap` drift.
   Type the map entries for real.
4. **Dead/obsolete duplicates** (verified 2026-09-27): the working
   features are `entity-list/sheets/panels/{ColumnsPanel,SearchInPanel,
   FiltersPanel}` (SheetHost registry, opened via `openSheet`). The
   `entity-list-table/panels/*` twins are **pre-SheetHost leftovers** from
   commit `df3a1bf` (Apr 2026 migration) — near-identical copies still on
   the old `t`-as-prop API: `ColumnSelectorPanel` (unused import +
   re-export only), `SearchInPanel` (re-export only), `FiltersPanel`
   (only passed as the ignored `content:` prop → see anomaly 2). Remove
   all three + prune `panels/index.ts`; keep `PreviewPanel` (live via
   `PreviewPanelWrapper`).

## Migration approach (per panel)

1. Replace root `flex h-full flex-col` + `SheetHeader` with
   `<SheetPanelLayout>`; move `headerTitle` → `title` snippet, header
   `icon` snippet (icon = opener CTA icon, Lucide names verified in the
   prior plan table), `headerActions` → `actions` snippet keeping a close
   affordance (layout already provides default close when `actions`
   omitted).
2. Convert header CTAs from `Button` → `SheetHeaderAction` (or the shared
   class string).
3. Move existing toolbar strips into the `toolbar` snippet; ensure CONTENT
   is the only scroll region (`min-h-0 flex-1 overflow-auto` owned by the
   layout — delete per-panel scroll wrappers).
4. Keep `data-testid`s and all behavior; no prop-shape changes except
   dropping `content` on `entity.filters`.

## Steps

1. `shell.errors` + `shell.versions` (simplest — reference migration).
2. `entity.searchIn`, `entity.columns`, `entity.versionHistory`,
   `config.*Select`×3 (uniform: icon + actions + layout).
3. `entity.filters` (layout + typed props + drop `content`).
4. `shell.aiChat` (remove nested `Sheet.Content`, convert to shared AI
   HEAD convention `AiIcon` + `global` qualifier, `SheetHeaderAction` CTAs).
5. `smart-ai/ai-chat-panel.svelte` (layout migration preserving footer).
6. Type `SheetPanelPropsMap` entries; remove `as any` at call sites.
7. Dead-code removal (ColumnSelectorPanel, entity-list-table SearchInPanel).
8. **Verification (tests + manual)**:
   - `pnpm run check` + `pnpm run test:unit` — must stay green.
   - Per-sheet manual sweep (or a Playwright spec): open from the real
     opener CTA, verify HEAD icon matches opener, title i18n, close ✕,
     scroll confined to CONTENT, footer pinned.
   - ARIA: `pnpm run test:a11y` after migration — sheets are
     `role="dialog"`; assert no new violations and that focus-trap /
     aria-label on the sheet still works (`getByRole('dialog')`).
   - E2E (`pnpm run test:e2e`): entity-list pages exercise
     `entity.columns`/`searchIn`/`filters`/`versionHistory` — run the
     relevant specs.
9. Update `docs/ai/sheets.md` if the audit reveals new conventions worth
   codifying.

## Acceptance criteria

- `grep -rL "SheetPanelLayout" src/lib/shell/sheets/panels src/lib/entity-list/sheets/panels` → empty.
- Every HEAD shows the opener-matching icon; all header CTAs share the
  single standard chrome.
- No panel mounts `Sheet.Root`/`Sheet.Content`; no `as any` at `openSheet`
  call sites; `SheetPanelPropsMap` fully typed.
- `pnpm run check` clean; visual parity per panel.
