# Sheet Anatomy Standardization — Plan

## Objective

Enforce the documented sheet anatomy (`docs/ai/sheets.md`, `SheetPanelLayout`)
across ALL global-sheet panels: mandatory icon + translated title in HEAD,
CTAs only on the right, toolbar reserved for tools, metadata in CONTENT.

## Empirical audit (all registered panels, verified by reading sources)

Registry in `SheetHost.svelte` — 15 panel ids, 13 distinct components
(`config.regexAiChat`, `config.jsonAiChat`, `shell.aiGuide` all render the
shared `smart-ai/ai-chat-panel.svelte`).

| Panel | Icon | Title (i18n) | Actions (right) | Toolbar | Footer | Non-compatibilities |
|---|---|---|---|---|---|---|
| `shell.errors` (ErrorsPanel) | ❌ | `app.errors.title` | clear-all + close `Sheet.Close size-8` | — | — | no icon |
| `shell.versions` (VersionsPanel) | ❌ | `app.health.versionsTitle` | close `Sheet.Close size-8` | — | — | no icon |
| `shell.aiChat` (AiChatPanel) | ✅ `MessageSquare` | `app.aiChat.title` | new-conv + close `Button ghost size-7` | — | input box | **nests own `Sheet.Content` inside host's** — structural anomaly; close style differs |
| `shell.aiModelTestReport` (AiModelTestReportPanel) | ❌ | `model.name` (NOT a title!) | auto close (layout) | — | — | no icon, title is entity name not i18n label, score crammed into title, `contents` hack, double border-t on first section |
| `entity.searchIn` (SearchInPanel) | ❌ | `…list.searchIn` | reset + close `size-8` | — | — | no icon |
| `entity.columns` (ColumnsPanel) | ❌ | `…list.columns` | reset + close `size-8` | — | — | no icon |
| `entity.filters` (FiltersPanel) | ❌ | `…list.filters` | apply + reset + close `size-8` | — | — | no icon; Tabs inside content |
| `entity.versionHistory` | ❌ | `…versionHistory.title` | close `size-8` | — | — | no icon |
| `config.currencySelect` | ❌ | `…currencySelect.title` | close `size-8` | search input | — | no icon; toolbar used correctly (search = tool) |
| `config.protocolSelect` | ❌ | `…protocolSelect.title` | close `size-8` | — | — | no icon |
| `config.phonePrefixSelect` | ❌ | `…phonePrefixSelect.title` | close `size-8` | — | — | no icon |
| `config.regexFlags` (regex-flags-panel) | ❌ | `app.smart.regex.flags.title` | close `size-8` | — | — | no icon |
| `config.regexAiChat` / `config.jsonAiChat` / `shell.aiGuide` (shared `ai-chat-panel.svelte`) | ✅ `AiIcon` + gradient "AI" | `topic_key` i18n | new-session + close `Button ghost size-7` | — | input box | no `SheetPanelLayout` (own `flex h-full flex-col` — same anatomy, duplicated); close style differs |

## Non-compatibilities vs baseline (to fix)

1. **Icon missing in HEAD**: 13/16 titles have no icon. Only `shell.aiChat`
   (`MessageSquare`) and the shared AI chat (`AiIcon`) comply.
2. **Two close-button patterns**: `Sheet.Close` + `size-8` (9 panels) vs
   `Button ghost size-7` + X (chat panels). Standardize on ONE — proposal:
   `Button ghost size-7` (matches newest code, consistent with CTAs).
3. **`shell.aiChat` nests `Sheet.Content`** inside the host's Content —
   panel must render only inner content.
4. **Section-title styles diverge**: `text-xs font-semibold uppercase
   tracking-wide` (CurrencySelect) vs `text-[10px] uppercase tracking-wide
   text-muted-foreground/70` (test report) vs Accordion (Versions) vs Tabs
   (Filters). → define one `SheetSectionTitle` style (proposed: `text-xs
   font-semibold uppercase tracking-wide text-muted-foreground`, px-3 py-1.5)
   as a tiny shared component or exported class const.
5. **AiModelTestReportPanel**: icon `flask-conical` + title
   `system.entities.ai_model.test_report.title` ("Test results"); score
   moves into CONTENT (not toolbar — toolbar is CTA-only per user); drop
   `contents` hack; fix double border via `divide-y`.
6. **Shared `ai-chat-panel.svelte`** doesn't use SheetPanelLayout (has
   footer input box + non-scrollable zones — needs care migrating).
   **`shell.aiChat` (global assistant) additionally breaks the AI-HEAD
   convention**: uses `MessageSquare` + `app.aiChat.title` instead of
   `AiIcon` + `assistant_prefix` + topic. Convert to the shared pattern
   with topic qualifier `global`; also remove its nested `Sheet.Content`.
7. **Width is a fixed scale, not free-form** (verified across all
   `openSheet` call sites):
   - `w-[360px] p-0` — narrow pickers/selects (6 usages)
   - `w-[420px] p-0` — default (`sheetState.contentClass` baseline; errors,
     versions)
   - `w-[600px] p-0` — wide chat panels (aiChat, aiGuide)
   - ❌ `w-3/4 sm:max-w-xl` (aiModelTestReport) is OFF the scale → fix to
     `w-[600px] p-0` (dense per-turn report needs the wide class).

## Suggested icons per panel (Lucide, verified names)

Rule: **the HEAD icon MUST match the icon of the CTA that opens the sheet**
(verified empirically: `shell.errors` opens from `AppTopbar` via
`TriangleAlert` → the panel title icon is `triangle-alert`).

| Panel | Icon |
|---|---|
| errors | `triangle-alert` (same as `AppTopbar` opener — verified) |
| versions | `blocks` (user-specified) |
| aiChat | `AiIcon` — **all AI-assistant sheets share one HEAD convention**: `AiIcon` + `{$t('app.common.ai.assistant_prefix')}` ("AI Assistant") + topic qualifier (`guide` / `regex` / `json` / …). The global assistant is NO exception: replace `MessageSquare` + `app.aiChat.title` with the shared pattern, topic qualifier = `global` (new i18n key, e.g. `app.aiChat.topic.global`) — same as `guide`/`regex`/`json` already do |
| aiModelTestReport | `flask-conical` |
| entity.searchIn | `search` (SearchBar opener uses `Search` — verified) |
| entity.columns | `columns-3` |
| entity.filters | `funnel` (FiltersPanel already imports `FunnelX`; opener = funnel icon) |
| entity.versionHistory | `history` |
| config.currencySelect | `currency` |
| config.protocolSelect | `link` |
| config.phonePrefixSelect | `phone` |
| config.regexFlags | `flag` |
| shared AI chats | `AiIcon` (has it) |

## Implementation steps

1. Extend `SheetPanelLayout`: add required `icon` snippet prop (rendered in
   title row, `size-4` — same icon as the opener CTA). Default close stays
   `Sheet.Close size-8`. Add `SheetHeaderAction.svelte` (or exported
   `SHEET_HEADER_ACTION_CLASS`) so every header CTA — close included —
   shares the identical chrome; panels stop hand-writing the class string.
2. Add `SheetSectionTitle.svelte` (or shared class) for in-content section
   headers; document in `docs/ai/sheets.md`.
3. Migrate `AiModelTestReportPanel`: icon `flask-conical` + i18n title +
   score row into CONTENT; `divide-y` sections; `SheetSectionTitle` for case
   headers; drop `contents` wrapper; declare `modal?: boolean` prop;
   width `w-3/4 sm:max-w-xl` → `w-[600px] p-0` (standard scale).
4. **Phase 2 (after user confirms the test-report panel)**: migrate ALL
   remaining panels in one pass — no partial migration. Includes the
   `shell.aiChat` nested `Sheet.Content` anomaly and the shared
   `ai-chat-panel.svelte` (footer input box preserved via `footer` snippet).
5. Update `docs/ai/sheets.md` + `docs/user-guide/components/sheet-panel.mdx`:
   icon mandatory, toolbar = tools only, metadata in CONTENT, section-title
   standard, close-button pattern.

## Decisions (user)

- **Close-button baseline**: ✅ `Sheet.Close` custom `size-8` (inline-flex,
  opacity-70, hover accent) is THE standard (10 panels). The 4 AI-chat
  panels using `Button ghost size-7` deviate — to be migrated.
- **Header CTA standard** (user-decided): **ONE pattern for ALL header
  CTAs** — the same custom chrome as `Sheet.Close` (`inline-flex size-8
  rounded-md text-muted-foreground opacity-70 hover:bg-accent
  hover:opacity-100`, icon `size-4`). Non-close CTAs use a plain
  `<button type="button">` with the identical class string. Rejected:
  B tinted-primary pill (`bg-primary/10`), C `Button ghost size-7`,
  A `Button ghost h-8 w-8` (the `Button` component itself is out — the
  custom class string is the standard). Ship `SheetHeaderAction.svelte`
  (or exported `SHEET_HEADER_ACTION_CLASS`) so the class cannot drift.
- **Section titles**: ✅ shared `SheetSectionTitle` component (DRY,
  enforces style).
- **Migration scope**: test-report panel FIRST as the reference
  implementation. Only after user confirmation + tests pass → migrate ALL
  remaining panels in one pass. No tech debt, no half-migrated state.
