# Sheet Panels Phase 2 — Execution Order + Card Refresh Button

> Continuation of `sheet-panels-phase2-migration-plan.md`. Dead twins in
> `entity-list-table/panels/` already removed. This file adds the ordered
> execution table and the new **card-wrapper refresh button** request.

## Status of plan — 2026-09-30 19:54 UTC / 21:54 CEST

| # | Task (detail level) | Status | When | Notes |
|---|---------------------|--------|------|-------|
| A | Sheet-panel migration — all 11 panels on `SheetPanelLayout` (icon HEAD, SheetHeaderAction CTAs, sticky sections, typed `SheetPanelPropsMap`, dead props removed) | ✅ done | earlier session | ProtocolSelect, SearchIn, PhonePrefix, Currency, Errors, Columns, Versions, VersionHistory, Filters, AiChat, shared smart-ai panel |
| A.x | Card-wrapper refresh button | ✅ done | earlier session | |
| B | BE `makeEntityRouter` factory + 6 routers migrated (ai_model, ai_cerebellum, customer, organization, role_mapping, user_profile) | ✅ done | earlier session | MFA actionMiddlewares, extraRoutes, handlers overrides |
| B.1 | Purge capability: `DELETE /:uuid/purge` + `purge.single` meta action + FE auto-adaptive CTA | ✅ done | earlier session | role_mapping = hard-delete-only |
| B.2 | Legacy `/system/role-mappings` routes removed | ✅ done | earlier session | consumers verified |
| B.3 | role_mapping caller-observed version fix (guard was no-op) | ✅ done | earlier session | |
| C.1 | Canonical QS bracket filters — FE serializer `appendListFilterParams` + BE `translateFilterConditions` (shared DAL) | ✅ done | earlier session | JSON `filters=` removed |
| C.2 | Unit tests: FE serializer (8), BE zod schema, DAL translator | ✅ done | this session | `list-filter-params.test.ts`, `list-query.test.ts`, `list-filters.test.ts` |
| C.3 | HTTP factory tests (18) + entity-actions (4) + role-mappings (9) | ✅ done | earlier session | |
| C.4 | E2E over-the-wire `entity-crud-lifecycle.spec.ts` (4 tests: customer lifecycle, meta contract, role_mapping purge/MFA, org GROUP BY read-only) | ✅ done | this session | ad-hoc `E2E-*` rows only |
| E.1 | `makeEntityService<TEntity>` generic CRUD (`src/http/entity-service.ts`): list/get/create/update/delete/restore/purge/duplicate/bulk*/audit/stream | ✅ done | this session | writes always `RETURNING` — `{uuid}`/`{success:true}` impossible |
| E.1a | `beforeCreate`/`beforeUpdate`/`afterWrite` hooks + `extraFilters` + `debugCode` | ✅ done | this session | |
| E.2 | `makeEntityRouter<TEntity>` generic — compile-time entity-return contract | ✅ done | this session | legacy method names preserved via `methods` map |
| E.3a | DAL `groupBy`/`having` in `findByPage` + query-builder + 8 unit tests | ✅ done | this session | `test/group-by.test.ts`; group-aware pagination totals |
| E.4 | Migrate ai_model — `power_level` derived via `beforeCreate`/`beforeUpdate`, `(model_id,dtype)` dup guard | ✅ done | this session | `ai_models_dal.ts` deleted |
| E.4b | Migrate ai_cerebellum — name-uniqueness guard via `beforeCreate`, cache invalidate facade | ✅ done | this session | `ai_cerebellum_dal.ts` deleted |
| E.5 | Migrate organization — Casdoor sync kept in facade; `user_count` = `COUNT(u.id) FILTER(...) ::int` via `list.aggregates` (1 query, was N+1) | ✅ done | this session | `organizations_dal.ts` deleted; `SystemService` switched to facade; `AggregateDecl.cast` added after live 500 (`FILTER` before cast = syntax error) |
| E.6 | Custom services kept: role_mapping (non-uuid id, purge-only, Casdoor repo), user_profile (read-only entity, writes via `/auth/users` RPC) | ✅ done | this session | by design |
| F | Customer write-response fix: `create` returned `{uuid}` → now entity from `RETURNING` | ✅ done | this session | found by e2e |
| G | Bugfix: `PreviewPanel` BigInt mix (`extJsonParse` → bigint props) — normalized `Number()` at leaf + `footerPage` | ✅ done | this session | crash on open, row action + header CTA |
| H | Bugfix: `entity` prop divergence — plural literals (`role_mappings`, `user_profiles`) built wrong endpoint URLs → 404 on audit/version-history | ✅ done | this session | now `entity={meta?.entity ?? 'canonical'}` — derived from BE meta |
| I | Docs: `entity-router-factory.md` (makeEntityService + aggregates section), `api-conventions.mdx` (aggregate columns) | ✅ done | this session | |
| E.7 | Entity-wide export system (`stream` exists; template/fieldMapping derivation from meta) | ⏳ not done | — | E.4 in plan — deferred |
| E.8 | Identity-driven `duplicate` (uuid[] or key-condition objects, composite identity, ambiguity guard) | ⏳ not done | — | current impl = uuid[] via `repo.clone` only; design in plan |
| E.9 | role_mapping read ops delegation to generic svc (list/get/audit) — needs non-uuid `matchBy` | ⏳ not done | — | future candidate |
| E.10 | role_mapping purge + org list coverage in e2e matrix; ai_* lifecycle e2e | ⏳ partial | — | customer lifecycle + org read-only covered; ai_model/ai_cerebellum e2e missing |

## Part A — Non-compliant panels, ordered (simplest → most complex)

Canonical target for every row: `<SheetPanelLayout>` root (HEAD with
mandatory `icon` snippet matching the opener CTA + `title`, optional
`toolbar` snippet, `children` = only scroll region, optional `footer`),
header CTAs as `SheetHeaderAction`, no own `Sheet.Root`/`Sheet.Content`,
keep all `data-testid`s.

| # | Panel | Cosa manca | Come risolvere | Impatto UX | Effort |
|---|-------|-----------|----------------|-----------|--------|
| 1 | `config.protocolSelect` — ProtocolSelectPanel (59 ln) ✅ done | No icon; close via own `Sheet.Close` | `SheetPanelLayout` + icon `Link`; default close | Icon in HEAD only | XS |
| 2 | `entity.searchIn` — SearchInPanel (80 ln) ✅ done | No icon (`search`); reset CTA `Button` | Layout + icon + reset → `SheetHeaderAction` | Icon + CTA chrome | XS |
| 3 | `config.phonePrefixSelect` — PhonePrefixSelectPanel (124 ln) ✅ done | No icon (`phone`); owns toolbar strip | Layout + icon + move search strip → `toolbar` snippet | Icon + toolbar chrome | S |
| 4 | `config.currencySelect` — CurrencySelectPanel (165 ln) ✅ done | No icon (`coins`); toolbar strip | Same as #3 | Icon + toolbar chrome | S |
| 5 | `shell.errors` — ErrorsPanel (213 ln) ✅ done | No icon (`triangle-alert` = AppTopbar opener); clear-all `Button ghost` | Layout + icon + clear-all → `SheetHeaderAction` (disabled when empty) | Icon + CTA chrome | S |
| 6 | `entity.columns` — ColumnsPanel (211 ln) ✅ done | No icon (`columns-3`); reset `Button`; custom divider-labels | Layout + icon + reset → `SheetHeaderAction`; **first `SheetSectionTitle` sticky consumer** (sections wrapped, divider-labels dropped); dnd logic untouched | Icon + CTA chrome + sticky sections | S |
| 7 | `shell.versions` — VersionsPanel (355 ln) ✅ done | No icon (`blocks`); owns close; uses `servicesState` | Layout + icon `Blocks`; content untouched (service cards); custom close removed | Icon + close chrome | M |
| 8 | `entity.versionHistory` — VersionHistoryPanel (594 ln) ✅ done | No icon (`history`); long content, accordion internals | Layout + icon `History`; CONTENT stays the only scroller; timeline untouched | Icon; scroll containment verified | M |
| 9 | `entity.filters` — FiltersPanel (959 ln) ✅ done | No icon (`funnel`); apply/reset `Button`s; **dead `content` prop** + `as any` at call sites | Layout + icon `Funnel`; Apply/Reset → `SheetHeaderAction`; Tabs.Root wraps layout, `TabsList` → `toolbar` snippet, `TabsContent` scrolls via `contentClass="flex min-h-0 flex-col overflow-hidden p-0"`; **`SheetPanelPropsMap` typed for `entity.searchIn`/`entity.columns`/`entity.filters`**; dead props `content`, `modal`, `sheetMenuCheckboxClass` + `checkboxVisualOnlyClass` plumbing removed; all `as any` gone (EntityListTableHeader, useSheetPanels, SearchBar) | Icon + CTA chrome + type-safety | L |
| 10 | `shell.aiChat` — AiChatPanel (349 ln) ✅ done | **Nested `Sheet.Content` inside host's Content** (structural bug); `Button ghost size-7` CTAs; own conversations sidebar | Nested `Sheet.Content` dropped; `SheetPanelLayout` + `MessageSquare` icon + plain title (kept — not the AI-gradient exception); `Plus` → `SheetHeaderAction`; tool-call + error banners + composer → `footer` snippet with normalized borders (visual parity) | Fixes nested dialog layer | L |
| 11 | shared `smart-ai/ai-chat-panel.svelte` (725 ln, used by `config.regexAiChat`, `config.jsonAiChat`, `shell.aiGuide`) ✅ done | Custom `flex h-full` + `SheetHeader` + `Button ghost size-7` close | `SheetPanelLayout` (`contentClass="flex min-h-0 flex-col overflow-hidden p-0"`); HEAD → `AiIcon` + `text-primary-gradient` prefix + topic via title snippet (**the one allowed exception**); CTAs → `SheetHeaderAction` with testids preserved; composer kept inline inside CONTENT (no added border-t) | 3 sheets at once — identical visuals | XL |

### Cross-cutting (do after panels)

- **Type `SheetPanelPropsMap` for real** — `entity.columns`, `entity.searchIn`,
  `entity.filters` opened with `as any` in `EntityListTableHeader.svelte:133,154`
  and `useSheetPanels` rewrites. Remove all `as any`, fix `entity.filters`
  flat props.
- **`grep -rL "SheetPanelLayout" src/lib/shell/sheets/panels src/lib/entity-list/sheets/panels` → empty** (acceptance).

---

## Part B — Two refresh-button types → reusable DRY component

### Analysis — what exists today

Two different refresh CTAs exist and diverge:

| Type | Where | Current impl | Chrome |
|------|-------|--------------|--------|
| **Toolbar refresh** | `Toolbar` prop `refresh={{ onclick, loading }}` — used by `/ai` models section, `EntityListToolbar` has its own copy | `toolbar.svelte:83-93` + duplicated inline in `EntityListToolbar.svelte:115-121` | `Button ghost sm`, `RotateCw` (spin on loading) + label `hidden lg:inline` |
| **Card/section refresh** | `/ai` machine section header line (`machine-capabilities-section.svelte:59-69`) | Inline `Button soft icon-sm` + `RotateCcw` spin — **different variant (`soft` not `ghost`), different icon (`RotateCcw` not `RotateCw`), icon-only, no label** | Inconsistent with toolbar refresh |

Same intent ("reload this block"), two implementations, inconsistent chrome,
and `EntityListToolbar` duplicates the Toolbar refresh markup by hand.

### Requested change

In `/ai` (`system/settings/ai`), the refresh on the "Capacità della Macchina"
section line moves **inside the card wrapper below** (the bordered box that
holds GPU identity + StatCards + rank gauge), pinned to the **top-right
corner**, as `ghost` `sm` icon + label, with the button's spinner while
refreshing. Reusable + DRY.

### Design

1. **New component `RefreshButton`** (`src/lib/components/ui/refresh-button/refresh-button.svelte` + `index.ts`):
   - Props: `{ onclick: () => void | Promise<void>; loading?: boolean; disabled?: boolean; label?: boolean }` — `label` default true (`hidden lg:inline` like Toolbar), `false` = icon-only.
   - Chrome: `Button ghost sm`, `RotateCw` icon, `animate-spin` while `loading`, `aria-label`/`title` = `$t('system.entities.list.refresh')`, label text same key.
   - Accepts `class` for positioning.
   - This is THE single refresh button — toolbar and card use the same atom.
2. **Rebase Toolbar** `refresh` prop onto `<RefreshButton>` (delete inline markup).
3. **Rebase `EntityListToolbar`** inline refresh onto `<RefreshButton>` (kills the hand-duplicated markup).
4. **Rebase `machine-capabilities-section`** — the card wrapper is ALWAYS
   rendered; the refresh lives inside it, always visible:
   - The bordered card (`rounded-lg border border-border/60 p-3`) becomes the
     single container for ALL states — populated, measuring, unavailable.
   - Remove the `soft icon-sm` button from the section header line; the
     header line keeps only icon + title.
   - Card gets `relative`; `<RefreshButton>` `absolute right-3 top-3`
     inside it — always rendered, `disabled` unless the card is populated
     (`caps` truthy and not measuring), `loading={probingVram || measuring}`.
   - **Empty states inside the card** follow the EntityListTable empty-record
     convention (huge animated icon + message, `pb-watermark-empty` style):
     - `measuring && !caps` → huge animated spinner/icon + `measuring` message
       inside the card (replaces the current inline strip).
     - `caps.available === false` → huge icon + `unavailable` message inside
       the card (same watermark pattern).
   - Keep `data-testid="ai-machine-refresh-cta"`,
     `ai-machine-unavailable`, etc.
5. i18n: reuse `system.entities.list.refresh` — no new keys.

### Icon normalization note

Two icons in play: `RotateCw` (Toolbar) vs `RotateCcw` (machine section,
BulkActions "restore"). Normalize the refresh atom on `RotateCw`; leave
`RotateCcw` in BulkActions (restore semantics, not refresh).

### Status — DONE 2026-09-29

- ✅ `RefreshButton` created (`ui/refresh-button/`) — `RefreshCw` icon
  (user decision: refresh icon = `refresh-cw`, already in use in
  `ModelCachePanel`/`ModelCacheSection`/`MetadataLoading`), ghost sm,
  label hidden below lg, `compact` variant (h-5, size-3 icon,
  text-[10px] uppercase muted) for in-card use.
- ✅ `Toolbar.refresh` and `EntityListToolbar` rebased onto the atom.
- ✅ Machine card always rendered; `RefreshButton compact` pinned
  top-right inside the card; measuring/unavailable moved inside the card
  with the `pb-watermark-loading`/`pb-watermark-empty` empty-state
  pattern (`Hourglass`/`TriangleAlert` size-20). `ai-machine-*` testids
  preserved (`ai-machine-refresh-cta`, `ai-machine-unavailable`,
  `ai-machine-measuring`).
- ✅ `svelte-check` 0/0.

## Part F — Icon conventions (added 2026-09-29)

Created the missing icon-standard layer; audit surfaced several
**already-consistent but undeclared** conventions (usage counts):

| Semantics | Icon | Files using it | Status |
|-----------|------|---------------|--------|
| Delete | `Trash2` | 19 | consistent → canonized |
| Close/dismiss | `X` | 19 | consistent → canonized |
| Dropdown caret | `ChevronDown` | 14 | consistent |
| Edit | `Pencil` | 8 | consistent |
| Eye toggle | `Eye`/`EyeOff` | 8 | consistent |
| Copy | `Copy` | 8 | consistent |
| Boolean | `CircleCheck`/`CircleX` | 7/5 | consistent (already a rule) |
| Warning/empty | `TriangleAlert` | 7 | consistent, BUT legacy alias `AlertTriangle` still in 6 files (`ModelCachePanel`, `ModelCacheSection`, `MfaEnrollmentSection`, `async-validated-input`, `rfc-error-dialog`, `VersionHistoryPanel`) → migrate on touch |
| Loading watermark | `Hourglass` | 5 | consistent |
| Refresh | `RefreshCw` | now canonical via `RefreshButton` | ✅ done |
| Restore | `RotateCcw` | 4 | consistent (not refresh) |
| Clear/reset | `Eraser` | 0 → target of D3 | pending |

Docs written: `docs/ai/icon-conventions.md` (canonical map),
`.devin/rules/icon-conventions.md` (always-on rule),
`docs/user-guide/icon-conventions.mdx` + `_order.json` entry
(RefreshButton props + usage).

### Status — DONE 2026-09-29 (icon sweep)

- ✅ `AlertTriangle` → `TriangleAlert` migrated in all 6 files.
- ✅ Reset/clear CTAs → `Eraser`: `SearchInPanel`, `ColumnsPanel`,
  `FiltersPanel` (reset header action), `SearchBar` (search clear),
  `FilterBar` (clear-all). `FunnelX` → `X` (remove-one-filter semantics).
- ✅ `TextInput` (D6 core): `clearable` prop (default `true`), clear icon
  `X` → `Eraser`, clear hidden on readonly/disabled/empty, `trailing`
  renders BEFORE the clear button so inner CTAs sit to its left and clear
  stays rightmost (`right-0` contract documented in the docblock —
  trailing content self-positions e.g. `right-9`, as
  `async-validated-input` already does).
- ✅ D6 audit/migration done: `<Input>` → `<TextInput>` in
  `FiltersPanel` (×2), `ConfigValueInput`, `email-providers`,
  `modules/[code]`, `roles/create`, `roles/[uuid]`, `LoginForm`,
  `MfaEnrollmentSection`, `MfaManagement`, `date-wheel-picker` (timezone
  search). `command-input` clear icon → `Eraser`. `email-input` keeps its
  own shell but its clear icon → `Eraser`.
- Documented exceptions (stay on `Input`/raw `<input>`): `templates`
  (type=file), `sidebar-input` (vendored chrome), `color-picker` (mono
  hex fields), `numeric-input` (numeric semantics), `password-input`
  (vendored, own toggle/copy slots), `translations` page dialog (raw
  `<input>` with local CSS), `choicebox` (hidden input).

---

## Part C — Phone prefix enhancements (added 2026-09-28)

> **Status (implemented 2026-09-29):** all done, svelte-check 0/0.
> - C1 suggested section: `PhonePrefixSelectPanel` gains a sticky `suggested` section (countries of `UI_LANGS` region subtags, deduped, `allowedCountries`-aware, hidden while searching) + `allCountries` section — both via `SheetSectionTitle`, rows extracted into a `countryRow` snippet.
> - C2 sort toggle: `ButtonGroup segmented` in the toolbar — name (A–Z, `ArrowDownAZ`) / prefix (numeric ascending, `ArrowDown01`); testids `phone-prefix-sort-name` / `phone-prefix-sort-prefix`.
> - C3: `phone-input` default country = `parsedConfig?.country ?? uiLang region ?? 'US'` (no helper needed — the UI-lang region subtag IS the ISO country code).
> - C4: `ProtocolSelectPanel` rows render a muted desc line under `proto://` from `protocolSelect.desc.<proto>`; missing keys (custom protocols) fall back to no line. Seeded via `add_protocol_desc_translations.sql` (applied live, Redis `translations:i18n:system:*` invalidated).
> - C5: `CurrencySelectPanel` migrated to `SheetSectionTitle` (sticky) + section wrappers; `currencyRow` snippet deduped.


Verified facts:
- `countries-list` country rows carry `phone: number[]` and
  `languages: string[]`; `getCountryData(code)` is already used by
  `phone-input.svelte` and `PhonePrefixSelectPanel`.
- `UI_LANGS` region subtag IS the ISO country code (`it-IT`→IT→`+39`,
  `en-GB`→GB→`+44`, `en-US`→US→`+1`, `fr-FR`→FR→`+33`, `es-ES`→ES→`+34`,
  `de-DE`→DE→`+49`, `pt-PT`→PT→`+351`) — no extra mapping lib needed.
- The "top section" pattern already exists in `CurrencySelectPanel`
  (favorites section + separator + `allCurrencies` header, favorites
  excluded from the main list) — reuse that pattern.
- `phone-input` default country: `parsedConfig?.country ?? 'US'` —
  hardcoded US fallback, NOT app-lang aware.
- Missing translations were real: `phonePrefixSelect.*` and
  `protocolSelect.*` had zero rows in `system.translations` — seeded via
  `db-meta/fire-and-forget/add_phone_protocol_select_translations.sql`
  (applied live, Redis `translations:i18n:system:*` invalidated).
  Keys added incl. `phonePrefixSelect.suggested`, `.allCountries`,
  `.sortByName`, `.sortByPrefix` for the work below.

### C1 — PhonePrefixSelectPanel: suggested section (sticky top)

- Above the main list (below TOOLBAR, before the full A–Z list):
  `suggested` header (`phonePrefixSelect.suggested`) + rows for the
  countries of `UI_LANGS` (dedup by country code — `en-GB`+`en-US` = 2
  distinct countries), in `UI_LANGS` order.
- Separator + `allCountries` header, like `CurrencySelectPanel`.
- Suggested countries excluded from the main list (same dedup rule as
  currency favorites) — including when `allowedCountries` restricts the
  list (suggested ∩ allowed).
- Hidden while `searchQuery` non-empty (same as favorites).

### C2 — PhonePrefixSelectPanel: sort toggle

- TOOLBAR gains a compact sort toggle next to the search input
  (`ButtonGroup segmented`, same chrome as `fitsGroup` in `/ai`):
  - `name` (default) → A–Z by `country.name` (current behavior);
  - `prefix` → numeric by dial code (`+1`, `+11`, `+2`, `+39`, … —
    sort `data.phone[0]` numerically, then country name).
- Labels: `phonePrefixSelect.sortByName` / `.sortByPrefix` (already seeded).

### C5 — Sticky section titles standard (verified 2026-09-28)

Current state: `SheetSectionTitle` is the canonical in-content section
header (`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide
text-muted-foreground`) but has NO sticky behavior; `ColumnsPanel`
doesn't even use it (custom centered divider-labels). Currency panel
uses ad-hoc divs too.

Standardize style AND behavior:
- `SheetSectionTitle` gains sticky support: `sticky top-0 z-10` +
  opaque `bg-background` (or `bg-popover` to match sheet chrome — verify
  against SheetHost content background) so rows scrolling under it don't
  show through. Default sticky ON.
- Required DOM contract: each section wrapped in its own block
  (`<div>`/`<section>` containing title + rows) so the sticky header
  releases when the next section's header arrives — "stick to top till
  next section" is pure CSS sticky, no JS.
- Migrate panels to `SheetSectionTitle` + section wrappers:
  `CurrencySelectPanel` (favorites/all), `PhonePrefixSelectPanel`
  (suggested/all from C1), `ColumnsPanel` (replace the custom
  divider-labels for sticky/data/auditing groups), `VersionHistoryPanel`
  groups, `FiltersPanel` if it has sections.
- Also fix HEAD icon audit: `config.currencySelect` HEAD icon = `Coins`
  (lucide `coins`), NOT `currency` — already applied in the panel; keep
  consistent if the opener is later restyled.

### C4 — ProtocolSelectPanel: per-protocol descriptions

- Each row gets a secondary description line under the `proto://` label
  (same two-line pattern as phone-prefix rows: `font-medium` name +
  `text-xs text-muted-foreground` description).
- Description source: i18n keys `system.settings.config.protocolSelect.desc.<proto>`
  (e.g. `.desc.https` = "Secure HTTP", `.desc.ws` = "WebSocket"). Known
  protocols from the `url-input` default list: `http https ftp redis
  rediss tcp ws wss mailto`. Unknown/custom protocols → fall back to the
  raw protocol name only (no description line).
- Rows become `flex-col` or keep row layout with a stacked
  `<span class="block">` label + `<span class="block truncate text-xs
  text-muted-foreground">` description (mirroring the phone/currency
  rows).
- Requires a fire-and-forget SQL adding `.desc.*` keys for the 9 known
  protocols × 7 languages (translations are BE-owned).
- UX check with user before implementing: description **text source** —
  static i18n keys (proposed) vs a built-in metadata map.

### C3 — phone-input: app-lang default country

- Replace `parsedConfig?.country ?? 'US'` with
  `parsedConfig?.country ?? langToCountryCode(currentUiLang) ?? 'US'`.
- New helper in `$lib/i18n` (or `$lib/geo`): `langToCountryCode(lang)`
  extracting the region subtag (`it-IT`→`IT`); current lang from the i18n
  store (`$lib/i18n/store.svelte.ts` / `uiLang`).

---

## Steps

1. `RefreshButton` component + barrel export.
2. Rebase `Toolbar.refresh` and `EntityListToolbar` inline refresh on it (no visual change).
3. `/ai` machine section: move refresh into the card wrapper top-right.
4. Panels #1–#6 (XS/S batch).
5. Panels #7–#8.
6. Panel #9 + `SheetPanelPropsMap` typing + drop `as any`.
7. Panel #10 (`shell.aiChat` nested-Content fix).
8. Panel #11 (shared chat panel — last).
9. Verification: `pnpm run check`, `pnpm run test:unit`, `pnpm run test:a11y`
   (`role="dialog"` focus-trap assertions), manual sweep per sheet
   (HEAD icon = opener icon, scroll confined to CONTENT, footer pinned).

## Acceptance criteria

- All panels on `SheetPanelLayout` with opener-matching HEAD icon.
- One refresh atom (`RefreshButton`) consumed by Toolbar, EntityListToolbar,
  and card wrappers; no duplicated refresh markup.
- `/ai` machine card: refresh inside wrapper, top-right, ghost sm, spins
  during `refresh()`/`probeVram()`.
- No `as any` on `openSheet` call sites; `entity.filters` dead `content`
  prop gone; `pnpm run check` clean; visual parity otherwise.

---

## Part D — follow-ups (added after panels 1–9)

### D1 — VersionsPanel → System Info: GPU + GPU Rank + AI Enabled

Add to the "System Info" accordion section (after `BrowserClientInfo` or as new rows):

- **GPU**: `caps.gpu_name` from `useMachineCapabilities()` (same value as
  `/ai` Machine Capabilities, `data-testid="ai-machine-gpu-name"` there).
- **GPU Rank**: `machine.machineRank` (1–5 gauge value, same derived rank
  used by `/ai`).
- **AI Enabled**: `BrainCircuit` icon row — `true` when `caps?.available`
  (WebGPU adapter obtained), `false`/Offline badge otherwise.

Implementation notes:

- Reuse the **module-level** `useMachineCapabilities` singleton — it already
  caches to `localStorage` (24h TTL, key `primebrick:machine-capabilities`)
  and exposes `hydrate()`, `isStale()`, `measure()`, `probeVram()`,
  `refresh()`.
- On panel mount: `hydrate()`; if `isStale()` and not already
  `measuring`/`probing_vram`, fire `machine.refresh()` in background (same
  trigger policy as `/ai` — measure() ~2s light bench + bounded VRAM ladder).
- WebGPU absent / `requestAdapter()` null / device lost → `caps.available =
  false` → render "AI Enabled: No" (red badge) and GPU row as `—`.
- i18n keys needed: `app.health.gpu`, `app.health.gpuRank`,
  `app.health.aiEnabled` (fire-and-forget SQL ×7 langs).

### D2 — FiltersPanel: drop Tabs, use an AND/OR-style mode switch

The slide/crossfade double animation (custom `TabsContent` transitions +
`receive`/`send` pill) is the only animated surface in the sheet family —
remove it.

- Replace `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` with a **segmented
  switch identical to the AND/OR connector** already in the advanced form:
  `Switch` + two labels — left = `standardFilters`, right =
  `advancedFilters`. Switch ON → advanced view, OFF → standard.
- `tabValue` becomes a `boolean` (`advancedMode`); the two content blocks
  become plain `{#if}` branches (keep `p-4 overflow-y-auto`, drop all
  transition classes).
- **Tabs audit**: `ui/tabs` is still used by `modules/[code]/+page.svelte`
  and `date-wheel-picker.svelte`; `anchor-tabs` family is used by roles
  pages. Tabs are NOT eradicated repo-wide — only out of sheet panels
  (double-animation problem is sheet-specific).

### D3 — Reset icon standard: Lucide `eraser`

Audit of current reset/clear CTAs:

| Surface | Current icon | Target |
|---|---|---|
| `SearchInPanel` reset | `RotateCcw` | `Eraser` |
| `ColumnsPanel` reset | `RotateCcw` | `Eraser` |
| `FiltersPanel` reset | `RotateCcw` | `Eraser` |
| `SearchBar` search-clear | `X` | `Eraser` (it's a reset, not a remove) |
| `FilterBar` "Clear all" | `XIcon` | `Eraser` |
| badge remove (FilterBar chips) | `XIcon` | keep `X` — it's remove, not reset |
| `/ai` machine refresh | `RotateCcw` | keep refresh icon (Part B) — refresh ≠ reset |

Rule: **reset-to-default / clear-input = `eraser`**; remove/dismiss = `x`;
refresh/reload = `rotate-cw`. Document in `docs/ai/` (icons section) and
`docs/user-guide/` + a `.devin/rules/` entry so it's enforced.

### D4 — Field standardization in sheet panels (CORRECTED)

`PrimeField` (`ui/form/prime-field.svelte`) is **the** standalone field-row
wrapper built exactly for non-form contexts — its docblock lists "config
rows, dynamic meta rows, settings widgets, **sheet-panel quick forms**".
Its twin `FormField`/`FormControl` (`ui/form`, Formsnap-bound) is for
SuperForms pages only. No `FieldRow` exists and none is needed.

Findings: `FiltersPanel` (standard + advanced forms) uses raw
`<label>` + `Input` / `DropdownMenu+Button` — **de-standardized, should be
`PrimeField`** (stacked layout; label + control + optional hint, and the
`help` prop already accepts raw `MetaColumn` tooltip fields → free
metadata-driven tooltips for filters). `PhonePrefixSelectPanel`/
`CurrencySelectPanel` toolbars use raw `Input` — acceptable (toolbar search
is chrome, not a field row).

### D5 — Advanced-filter operator picker → ComboSelect + icons

Findings: the operator/field pickers in `FiltersPanel` advanced tab are
`DropdownMenu.Root` + `Button` — a hand-rolled combobox, NOT our standard
`ComboSelect` (`ui/combo-select`, used elsewhere incl. searchable popover
trigger). This is a de-standardization.

- Replace field + operator pickers with `ComboSelect` (`mode="single"`).
- Operator icons: ComboSelect supports `display='custom'` + `itemSnippet`
  (option slot with `option/selected/resolvedLabel/resolvedValue`) → render
  a Lucide glyph per operator (`=` → `Equal`, `!=` → `EqualNot`, `>`/`<`/`>=`/`<=`
  → `Chevron*`/`Equal` family, `BETWEEN` → `ArrowLeftRight`, `contains` →
  `TextSearch`, `IN` → `ListFilter`…). Verify names on lucide.dev.
- **Decision (user)**: add a declarative **`iconField`** option to
  ComboSelect — prop naming the option field carrying an icon key; render
  via `DynamicIcon` (already used for meta-driven icons in VersionsPanel)
  so both Lucide names and asset-backed icons work. Reusable beyond filters.
- Apply in `FiltersPanel` advanced form (field + operator pickers) after the
  ComboSelect variant lands.

---

## Part E — panels 10 & 11: AI chat panels (analysis + approach)

They are **two different assistants**, not duplicates:

| | `shell.aiChat` (`shell/sheets/panels/AiChatPanel`) | shared `smart-ai/ai-chat-panel.svelte` |
|---|---|---|
| Brain | server-side RAG chat (`aiChatStore`, SSE stream) | in-browser model (WebGPU/ONNX) |
| Unique UI | conversations sidebar, docs citations, thumbs feedback, tool-call confirm, stop-stream | model lifecycle (config resolve, per-file download bars, RealtimeMeter), model/cache/details popovers in composer, `choices` snippet injection |
| HEAD | `MessageSquare` + plain title | `AiIcon` + **`text-primary-gradient` "AI Assistant"** + topic |
| Header CTAs | `Plus` new-conversation (ghost `size-7`) + custom X | `StickyNotePlus` new-session + X (ghost `size-7`) |
| Defect | mounts `Sheet.Content` inside the host's Content (nested) | custom header chrome |

### Standardization without visual loss

`SheetPanelLayout` takes `icon`/`title` as **free-form snippets** — the
gradient AI title is not a violation, it's the intended superset and stays:

    {#snippet icon()}<AiIcon size={16} />{/snippet}
    {#snippet title()}
      <span class="text-primary-gradient font-semibold">{$t('app.common.ai.assistant_prefix')}</span>
      <span>{$t(topic_key)}</span>
    {/snippet}

What actually changes:

- `AiChatPanel`: drop the nested `Sheet.Content`; composer → `footer`
  snippet; conversations sidebar lives inside CONTENT
  (`contentClass="flex min-h-0 flex-col p-0"`, thread = only scroller);
  tool-call confirm + error banner sit above the composer inside `footer`.
- shared panel: header → `icon`/`title` snippets; `size-7` ghost buttons →
  `SheetHeaderAction` (size-8 chrome — the only micro visual delta, ~1px
  hit area).
- Everything else (bubbles, progress bars, meter, composer toolbars,
  citations, feedback) unchanged — the visible result is identical.

Decision recorded: gradient AI header = **the single allowed exception** to
the plain-title standard, codified via snippets (no layout change needed).

---

## Audit addendum — panels missed by the original list

The original 10-panel audit did not cover the full `SheetPanelId` registry.
Full sweep after panels 1–11:

- `config.regexFlags` — `smart-regex-input/regex-flags-panel.svelte` —
  **was non-compliant** (custom `flex h-full` + `SheetHeader`, own close).
  ✅ migrated: `SheetPanelLayout` + `Flag` icon (opener CTA is the textual
  `/gi` flags trigger — no icon to mirror; `Flag` = semantic match), default
  close, content `p-4 space-y-4`.
- `config.regexAiChat` / `config.jsonAiChat` / `shell.aiGuide` — thin
  wrappers over the shared `ai-chat-panel.svelte` → compliant via #11.
- `shell.aiModelTestReport`, `shell.aiCerebellum`, `shell.aiModelImport`,
  `shell.aiModelCache` — built on `SheetPanelLayout` already ✓.

Out of scope (not in the sheet registry):

- `entity-list-table/panels/PreviewPanel.svelte` — the table preview pane;
  uses `SheetHeader` but is NOT a global-sheet panel (own `onClosePreview`,
  docked layout). Leave as-is unless we decide it should share anatomy.

**Net: every `openSheet` panel in the registry is now on
`SheetPanelLayout`.**

### D6 — Universal clear (eraser) on single-line text inputs

Canonical component already exists: `ui/input/text-input.svelte`
(`TextInput`) — wraps `Input` with:

- trailing **clear button** in `editable` mode (currently `X` — switch to
  `Eraser` per D3), sets `value=""` + refocus;
- trailing **CopyButton** in `readonly` mode;
- hidden entirely when `disabled` or `value` empty;
- `trailing` snippet slot for extra trailing content;
- `inputTrailingIconButtonClasses` chrome (`input-chrome.ts`).

Standard to enforce (doc + rule):

- **Every single-line text input uses `TextInput`** — clearable by default.
- Opt-out prop (e.g. `clearable={false}`) for cases where clear must not
  appear; never rendered on `readonly`/`disabled` (readonly keeps the copy
  CTA instead).
- **Trailing ordering rule** (multi-CTA inputs): extra inner buttons/icons
  sit to the LEFT; the clear CTA is always the rightmost element. Rationale:
  inner *buttons* occupy the extreme right. Reference pattern:
  `SearchBar` (clear before the "search in" CTA — verify order there) and
  password inputs (eye toggle left of / next to clear).
  ⚠️ `TextInput` currently renders `trailing` AFTER the clear button —
  likely needs to swap so trailing renders BEFORE clear (rightmost wins).
- Audit needed: every raw `<Input>`/`<InputGroupInput>` usage not going
  through `TextInput` (FiltersPanel filter inputs, sheet toolbar searches,
  config inputs) — migrate or document exception.

---

## Part G — Toolbar standardization + missing eraser coverage (added 2026-09-29)

### G1 — `/configurations` toolbar → standard `Toolbar`

Current: custom hand-rolled strip (`ConfigList.svelte:273-324`) — a
`div.border-b` with `SelectableToolbar` (select-all + bulk CTAs) on the left
and a primary `+ Add` Button on the right.

**Fact-check on my earlier design**: `Toolbar` ALREADY has the two zones the
user asks for — `left` snippet (free-form far-left, pushed right by
`ml-auto` CTA zone) + `primary` snippet (rightmost). SearchBar integration
precedent: `EntityListToolbar` renders `<SearchBar>` inside
`{#snippet left()}` — same pattern as select-all here. So YES, feasible:
`<Toolbar card={false}>` (bare strip — ConfigList is a full-width bordered
wrapper like EntityListTable, NOT card mode), `left` = `SelectableToolbar`,
`primary` = create CTA. Keep the outer sticky wrapper (border-b + backdrop)
as ConfigList's own chrome — Toolbar owns only the inner flex row.

### G2 — Missing eraser coverage (empirical audit of remaining inputs)

| Type / where | Current | Eraser? |
|---|---|---|
| `secret` in ConfigValueInput | `Password.Input` + `ToggleVisibility` only | ❌ MISSING — user wants it; eye LEFT of eraser (rightmost) |
| `number`/`bigint`/`money` (e.g. MFA token TTL) | `NumericInput` | ❌ MISSING — clear = reset to default (or `0`/empty if none — verify per-field default semantics) |
| `date`/`datetime`/`time` | `DateWheelPicker` | ❌ verify — trigger has Calendar icon, no clear |
| `email` | `EmailInput` custom trailing | ✅ has clear (now Eraser) |
| `phone` | `PhoneInput` custom trailing | ✅ has clear (now Eraser) |
| `url` | `UrlInput` clear in addon | ✅ Eraser |
| `text`/`string` | `TextInput` after D6 | ✅ Eraser |
| `textarea`/`json` | Textarea | ➖ out of scope (multi-line) |
| `LoginForm` password | `Password.PasswordInput` + toggle | ⚠️ secret field — same question as `secret` type |
| translations dialog | raw `<input>` | ❌ but has no trailing chrome at all — decide if in scope |
| `slider-field` inherit | ✅ Eraser now | done |

Design for `secret`/`Password.Input`: the vendored password component has
slot-based trailing (toggle + copy mounts). Adding clear = new slot —
ordering rule: eye toggle → eraser (rightmost). Needs `password.svelte.ts`
state extension or wrap with TextInput-style clear. Evaluate: reuse
`inputTrailingIconButtonClasses` at `right-1.5`, shift eye to `right-10`.

For `NumericInput`: default = `type_config.default_value` if declared,
else empty/0 — verify per consumer before wiring.

### G3 — DropdownMenu/native-select reabsorption into ComboSelect

- FiltersPanel ×4 `DropdownMenu.Root`+`Button` (multiselect badge,
  field picker, operator picker, badge-value picker) → `ComboSelect`
  (`mode="multi"` with `display='badge'`, `valueField`/`labelField`,
  `isLabelTranslated`). Also unlocks D5 (operator icons via `iconField`).
- `translations/+page.svelte` ×2 native `<select>` → `ComboSelect`.
- `modules/[code]` icon_type `<select>` → `ComboSelect`.
- `/configurations` itself: ALREADY all `ComboSelect` (verified —
  ConfigValueInput badge/single/multi, SelectSourceEditor,
  ValidationRulesSection ×5, WidgetConfigSection, create page ×4).

---

## Part H — Config type icons + phone trigger alignment (added 2026-09-30)

### H1 — Icon per config TYPE in `/configurations/create`

The `type` ComboSelect (create page, `configTypeOptions` — 17 types:
string, text, boolean, bigint, number, money, badge, single_select,
multi_select, url, secret, json, date, datetime, time, email, phone)
currently shows text-only options. User wants one icon per type.

- Depends on **D5** `iconField` variant on ComboSelect (icon per option via
  `DynamicIcon`) — add an `icon` field to `configTypeOptions`.
- Proposed mapping (verify against lucide.dev before wiring):
  string/text `Type` (or `LetterText`/`AlignLeft`), boolean `ToggleLeft`,
  bigint/number `Hash` (number) / `Binary` (bigint), money `Coins`,
  badge `Badge`/`Tag`, single_select `CircleDot`, multi_select `ListChecks`,
  url `Link`, secret `KeyRound`, json `Braces`, date `Calendar`,
  datetime `CalendarClock`, time `Clock`, email `Mail`, phone `Phone`.
- Same icon set should be reused anywhere a config type is displayed
  (ConfigListRow type badge, FiltersPanel field picker) — define the map
  once in a shared module (e.g. `$lib/config/config-type-icons.ts`) rather
  than inline in the create page.
- Icon color: default `text-muted-foreground` (per input-anatomy trailing
  convention); no per-type colors unless we decide a type color code
  (evaluate — could double as the type's visual identity elsewhere).

### H2 — phone-input prefix CTA vertical misalignment

User report: the `IT` next to `+39` in the phone prefix trigger is
vertically misaligned.

Root cause (empirical): the trigger renders the flag as a regional-
indicator emoji (`text-base`, 16px) followed by the prefix
(`font-mono text-sm`, 14px). On Windows, flag emojis do NOT render as
flags — they render as the two-letter code text ("IT"), so the trigger
shows "IT +39" with two different font families/sizes sharing a baseline
but visually offset.

Resolution (2026-09-30): the project ALREADY ships ISO flag SVGs —
`flag-icons` 7.5.0 is a dependency, CSS imported globally in `app.css`,
and the pattern is in use (`LangSelect`, `json-schema-choice-card`):
`<span class="fi fi-{code} shrink-0 rounded-sm"></span>`.

Fix: replace the `countryFlag` emoji in the phone-input prefix CTA with
`fi fi-${country.toLowerCase()}` (+ drop the `countryFlag` derived) —
deterministic, aligned, real flags on every platform. Also add the same
flag to each `countryRow` in `PhonePrefixSelectPanel` (code span replaced
by flag + code, or flag alone — check visual).

---

## Part D status (implemented 2026-09-30)

- **D0 — benchmark resource hygiene (new, user-requested):** `measure()` and
  `probeVram()` now destroy the `GPUDevice` inside `try/finally` — an exception
  mid-bench can no longer leak the device or its VRAM for the session.
  `detectGpu()` releases the probe WebGL context via `WEBGL_lose_context`
  (deterministic, no GC wait). No workers are spawned — everything is
  main-thread; per-bench buffers are destroyed in the happy path and the
  device destroy covers all exceptional leftovers.
- **D1 done:** `BrowserClientInfo` gains GPU (name + machine rank) and
  AI Enabled rows; hydrate + background refresh only when the 24h cache is
  stale (same policy as /ai). New `app.health.gpu|aiEnabled|gpuRank` keys in
  `en-GB-fallback.json` (app.* are FE-owned).
- **D2 done:** FiltersPanel Tabs → centered `Switch` (SX standard / DX
  advanced, same chrome as the AND/OR connector), `{#if}` blocks, crossfade
  pill code removed.
- **D4 done:** standard filter rows wrapped in `PrimeField`
  (`label` + `help={col}` → metadata-driven tooltips for free).
- **D5 done:** `ComboSelect.iconField` prop — option field carrying a Lucide
  name, rendered via `DynamicIcon` in option rows and the single-mode
  selected display (ignored under display='custom'). Applied to the config
  `type` picker in /create (H1 — 17 icons mapped).

---

## Part I — Hint standardization: everything into `?` tooltips (added 2026-09-30)

User decision: **all** non-error hints (helper text, awareness markers,
warnings) become label tooltips. No inline `<p>` hints — forms stay
minimal; users learn once. UX/aesthetics of the tooltip itself must NOT
change (icon + optional italic qualifier + PriorityTooltipContent).

### I0 — Verified facts (empirical audit)

**Three hint channels exist today:**

| Channel | Mechanism | Copy source |
|---|---|---|
| Inline `<p class="text-xs text-muted-foreground">` under control | hand-written in `FormControl` | `$t` keys; `entry.description_key` (meta) on modules/[code] |
| Label tooltip | `FormLabelWithPriorityHelp` inside `FormLabel` | `$t` keys; `MetaColumn.tooltip*` via `PrimeField help` / TableHeader / CardField |
| Switch sublabel | `SwitchField.description` | `$t` keys |

**All inline-hint call sites (migration targets):**

- `configurations/create`: `keyHelp` (key), `typeHelp` (type) — 2 `<p>`.
- `roles/create`: `fieldIdpRoleHint`, `fieldIdpOrgHint`, `fieldLabelKeyHint`,
  `fieldIsAdminHint` — 4 `<p>`.
- `roles/[uuid]`: `fieldIdpRoleImmutable`, `fieldIdpOrgImmutable`,
  `fieldLabelKeyHint`, `fieldIsAdminHint` — 4 `<p>` (2 are immutability
  warnings → candidate for WARNING priority).
- `modules/[code]`: `serviceVersionHint` — 1 `<span>`; config rows use
  `PrimeField hint={$t(entry.description_key)}` (meta-driven, inline today).
- `SwitchField.description`: configurations/create `reservedHelp`;
  ValidationRulesSection `requiredHelp`/`unsignedHelp`; regex-flags-panel ×3
  (`globalHelp`/`ignoreCaseHelp`/`multilineHelp`) — migrate to `tooltip*`
  props (already exist on SwitchField).
- `PrimeField.hint` itself stays in the API (thin inline path) but callers
  move to `help`.

**Trigger icon is NOT fixed (verified)**: `FormLabelWithPriorityHelp`
hardcodes `HelpCircle size-3.5` on the trigger button, while
`PriorityTooltipContent` already maps priority → icon+color *inside* the
tooltip (`INFORMATION`→Info/info, `WARNING`→BadgeAlert/warning,
`ERROR`→BadgeX/destructive, `QUESTION`→BadgeQuestionMark/info,
`HINT`→Lightbulb/info, `SUCCESS`→BadgeCheck/success). The trigger never
reflects priority today.

### I1 — Standard contract

- **One channel**: `?`-family tooltip on the label, via
  `FormLabelWithPriorityHelp` (superforms pages: inside `FormLabel`) or
  `PrimeField help` (non-superforms rows).
- Trigger = icon (`size-3.5`, `text-muted-foreground`, `tabindex={-1}`) +
  optional italic qualifier (`labelKey`, e.g. `app.common.optional`) —
  unchanged UX. Icon-only or icon+label; both supported already.
- `PrimeFieldHelp` already accepts a raw `MetaColumn`
  (`tooltip`, `tooltip_title`, `tooltip_priority`, `show_form_tooltip`) —
  metadata-driven tooltips stay the preferred path where meta exists.
- No more ad-hoc `<p>`/`<span>` hint lines in forms. Error hints remain
  Zod/Formsnap (`TranslatedFormFieldErrors`) — out of scope.

### I2 — DRY fixes (no UX change)

1. `FormLabelWithPriorityHelp`: make `text` optional — today it's required
   even when only `labelKey` (optional marker) is wanted; render Tooltip
   content only when `text` is set.
2. Export a shared `FieldHelp` type (`{text?,priority?,title?,labelKey?}`)
   used by both `FormLabelWithPriorityHelp` and `PrimeField` (today the
   shape is duplicated inline in `prime-field.svelte`).
3. `SwitchField.description` → migrate call sites to
   `tooltip`/`tooltipTitle`/`tooltipPriority` props (already supported);
   keep the `description` prop working during migration.

### I3 — Priority decisions needed (USER to decide)

Per-field priority proposal — open for user call:

| Hint | Proposed priority | Rationale |
|---|---|---|
| `keyHelp` (snake_case, max 100) | `HINT` (lightbulb) | format guidance |
| `typeHelp` | `HINT` | format guidance |
| `fieldIdpRole/OrgImmutable` (roles/[uuid]) | `WARNING` | irreversible semantics |
| `field*Hint` (roles create/uuid, is_admin) | `INFORMATION` or `HINT` | explainers |
| `reservedHelp`, `requiredHelp`, `unsignedHelp`, regex flags | `INFORMATION`/`HINT` | explainers |
| `optionalTooltipText` (×N) | keep `INFORMATION` | marker, unchanged |

**Open question for user — trigger icon by priority?** Options:
a) trigger always `HelpCircle` (status quo, zero visual change);
b) trigger mirrors priority (`WARNING`→`TriangleAlert text-warning`,
   `ERROR`→`OctagonX text-destructive`, else `HelpCircle`) — surfacing the
   severity before hover;
c) explicit `icon` prop override for rare cases.
Awaiting user pick.

### I4 — Docs & rules

- `docs/ai/input-anatomy.md` + `docs/user-guide/input-anatomy.mdx`: add the
  "hints live in the label tooltip" contract + code examples
  (superforms `FormLabel` + `FormLabelWithPriorityHelp`; non-superforms
  `PrimeField help`; `SwitchField tooltip*`).
- `.devin/rules/` — new `field-hints.md` rule (no inline `<p>` hints;
  canonical channels; priority vocabulary; MetaColumn path).
- Update `form-field-standard.md` if it documents the old inline pattern.

### Acceptance

- `grep "text-xs text-muted-foreground" src/routes` on form pages → only
  non-hint usages remain (e.g. read-only meta values in list contexts).
- All listed `<p>` hints moved to label tooltips; `SwitchField.description`
  call sites migrated; `svelte-check` 0/0; visual: no inline hint text,
  `?`-family icon + italic qualifier unchanged.

### Status — DONE 2026-09-30

User decisions applied: trigger icon mirrors priority (option b);
priorities as proposed (immutable → WARNING, format guidance → HINT,
explainers → INFORMATION); all hints to tooltips, zero UX change.

- `FormLabelWithPriorityHelp`: `text` now optional (marker-only trigger);
  trigger icon priority-mapped (`WARNING`→`TriangleAlert text-warning`,
  `ERROR`→`OctagonX text-destructive`, else `HelpCircle` muted); tooltip
  content rendered only when `text` is set.
- New shared `FieldHelp` type (`src/lib/components/forms/field-help.ts`);
  `PrimeFieldHelp = FieldHelp | MetaTooltipHelp` with `isMetaTooltipHelp`
  type-guard (optional-key `in` narrowing was unreliable); `FieldHelp`
  re-exported from `ui/form`.
- Migrated inline hints → label tooltips: `configurations/create`
  (key HINT, type HINT), `roles/create` (idp_role HINT, idp_org INFO,
  label_key HINT, is_admin INFO), `roles/[uuid]` (idp_role/idp_org
  `*Immutable` WARNING, label_key HINT, is_admin INFO), `modules/[code]`
  (`serviceVersionHint` → label tooltip; config rows `hint`→`help` INFO).
- `SwitchField.description` call sites → `tooltip`+`tooltipPriority`
  (reserved, required, unsigned, regex flags ×3); prop kept + marked
  deprecated; `PrimeField.hint` kept + marked deprecated.
- Docs: `form-field-standard.md` (mandatory hint channel + forbidden list),
  `docs/ai/input-anatomy.md` + `docs/user-guide/input-anatomy.mdx`
  (Field hints section), `prime-field.mdx`, `switch-field.mdx`,
  `form-label-with-priority-help.mdx` (fixed wrong lowercase priorities —
  documented `INFORMATION|WARNING|ERROR|QUESTION|HINT|SUCCESS`).
- `svelte-check` 0/0.

---

## Part C — Filter QS contract + shared list pipeline (revised after deep verification 2026-09-30)

### Verified FE<->BE matrix (all entity /list endpoints)

| Entity | FE sends | BE parses | Pair status |
|---|---|---|---|
| organization | brackets (e06dee2, May 24) | `JSON.parse` (07b6b33, May 24) | MISMATCH since day one — never worked |
| user_profile | `JSON.stringify` | `JSON.parse` | coherent (JSON pair) |
| role_mapping | `JSON.stringify` | `JSON.parse` | coherent (JSON pair) |
| customer | brackets | qs + `validateQuery` | coherent (QS pair) |
| ai_model | (no filters sent) | qs + `validateQuery` | coherent |
| ai_cerebellum | `JSON.stringify` | zod preprocess (tolerates both) | coherent |
| config_entry / translation / services | no `filters` param | — | n/a |

"Worked until yesterday" = tests ran on users/roles (JSON pair) or customers
(QS pair). Organizations is the only mismatched pair — broken since creation.
Verified: `users/+page.svelte` and `roles/+page.svelte` still send
`params.set('filters', JSON.stringify(advancedFilters))` today.

### Duplication inventory (verified)

- `translateFilterConditions` exists 6x: `customers_dal.ts:69` (function),
  `organizations_dal.ts:343`, `role-mapping-repo.ts:313`,
  `user-profiles-dal.ts:415` (private methods),
  `ai_models_dal.ts:260`, `ai_cerebellum_dal.ts:201` (inline in list method).
  Divergences: orgs/role-mapping/user-profiles miss `BETWEEN` and `>`;
  customers alone has ILIKE escaping (`buildIlikeNeedleFromSearch`).
- `FilterQueryArraySchema` + `filtersQueryParam` copied 3x:
  `customers/dto.ts`, `ai-models/dto.ts`, `ai-cerebellum/dto.ts`.
- FE bracket serialization copied 3x: `organizations/+page.svelte`,
  `customers/+page.svelte`, `useExport.svelte.ts`; users/roles pages use a
  4th variant (`JSON.stringify`); `fetchAiCerebellum` a 5th.
- All 6 entity list DALs run the same pipeline: deleted filter -> search
  OR-group (`deriveSearchableKeys(meta)`) -> translateFilters -> sort ->
  `repo.findByPage` + `buildAuditableJoins` -> `toDto` date conversion.
- dal-pg (`file:../primebrick-dal-v3`, also consumed by US `ai`/`emailsender`)
  already exports `Filter`, `field`, `FilterExpr`, `Repository.findByPage`.
- `fetchAiCerebellum` sends programmatic filters (`assistant_key`/`model_id`
  `=` conditions) — no HuggingFace implication; HF is the BE model-catalog
  path, unrelated to query params.

### Decision

Canonical contract: **QS bracket notation only** — qs extended already yields
`FilterCondition[]` (arrays for IN, `{start,end}` for BETWEEN); zero re-parse.
JSON-stringified `filters=` is removed everywhere (FE producers + BE
`JSON.parse` + zod preprocess).

### Steps

**dal-pg (`primebrick-dal-v3`) — new shared module**

1. `src/query/list-filters.ts`: `translateFilterConditions(EntityClass,
   conditions, opts: { allowedFields: Set<string>; connector; validOps?;
   escapeIlike?: (s) => { needle } })` — superset of all 6 copies (BETWEEN
   `{start,end}` -> `[start,end]`, LIKE/ILIKE `%`-wrap with optional escape
   hook, per-cond connector + group connector semantics preserved).
   Export from package index. NOTE: dal-pg deploys via GitFlow release + npm
   publish — BE consumes `file:` link locally, release needed for prod.

**BE (`primebrick-be-v3`)**

2. `src/http/list-query.ts`: single `FilterConditionSchema`,
   `FilterQueryArraySchema`, `FilterConnectorSchema`, shared `ListQuerySchema`
   base (search/search_in csv/sort_key/sort_dir/page/page_size<=100/filters/
   connector/deleted_records) — replaces the 3 dto copies.
3. Add `OrganizationListQuerySchema`, `RoleMappingListQuerySchema`,
   `UserProfileListQuerySchema` from the shared base; attach
   `validateQuery(...)` on the 3 routers; delete manual destructure +
   `JSON.parse`. Malformed input -> 400 RFC 7807 (never 500).
4. Replace all 6 `translateFilterConditions` copies with the dal-pg import;
   per-entity config = `{ allowedFields }` (orgs/role-mapping/user-profiles
   GAIN BETWEEN/`>` — flag as behavior widening; verify FE operator list).
5. Optional Phase 2: `listEntityPage(repo, entity, meta, query, opts)` shared
   helper absorbing the common pipeline (deleted filter, search group,
   filters, sort, findByPage, auditable joins, toDto). Entity DALs keep only
   entity-specific queries (getByIdpCode, user_count, Casdoor paths, audit
   enrichment). Long-term route factory (`registerEntityCrudRoutes`) is a
   separate decision — bigger blast radius.

**FE (`primebrick-fe-v3`)**

6. Shared `appendListFilterParams(params, filters, connector)` in
   entity-list-table utils; migrate organizations, customers, users, roles
   pages + `useExport` + `fetchAiCerebellum` to it. Delete every
   `JSON.stringify(filters)`.
7. `FiltersPanel.svelte` preview: unconditional `formatFilterDateValue` ->
   `formatListCellValue(column, filter.value, $uiLang)` (type-aware:
   date/datetime formatted, others `String(raw)`); BETWEEN branch same rule;
   boolean/badge via existing renderers. `isIsoDateString`/
   `formatFilterDateValue` removed if dead.

### Acceptance

- Orgs/Users/Roles `/list` with `filters[0][field]=..&[op]=ILIKE&[value]=%254%25`
  -> 200 filtered rows; malformed filters -> 400 (never 500).
- Zero `JSON.parse(filters)` / `JSON.stringify(advancedFilters|conditions)`
  left in BE + FE; single serializer, single validator, single translator.
- Preview: `display_name CONTAINS 4` shows "4" (no bogus date); date/datetime
  columns still formatted.
- IN (`filters[N][value][]=`) and BETWEEN (`filters[N][value][start|end]=`)
  verified over the wire on orgs + users + cerebellum programmatic call.
- Unit tests: FE serializer, zod schema shapes (IN array, BETWEEN object),
  dal-pg translator (ops allowlist, connector grouping, ILIKE wrap/escape).

---

## Part D — Base entity router / CRUD action standardization (analysis 2026-09-30)

### Handler-level comparison across the 6 entity routers

| Action | customer | ai_model | ai_cerebellum | organization | role_mapping | user_profile |
|---|---|---|---|---|---|---|
| GET meta | assembleMeta+deriveEntityActions | = | = | = | = | = + ext routes arg |
| GET list | validateQuery+service | = | = | manual parse | manual parse | manual parse |
| GET :uuid | validateUuid+get | = | = | = (no uuid validate) | = | = |
| POST | validateBody+transl+runEntityWrite | = +invalidateCache | = +invalidate | = (Casdoor in svc) | = +actor+invalidate | lives in auth/users |
| PUT :uuid | = | = | = | = | = +actor | auth/users |
| DELETE :uuid | requireVersionQuery | = +MFA stepup | = +MFA | manual version | no version | auth/users |
| POST :uuid/restore | version+restore | = | = | manual version | absent | auth/users |
| bulk-delete/restore | BulkItemsSchema | — | — | forbidden (Casdoor) | — | — |
| duplicate / export | present | — | — | forbidden | — | — |
| GET :uuid/audit | validateQuery+audit | = | = | manual page/limit | manual | manual |
| extra | — | — | — | check-availability | legacy /system/role-mappings set | — |

### Mandatory vs variable (the "between try and catch")

Mandatory identical shell per action:
`rbacHandler(perm)` -> `validateUuidParam` -> `validateBody/validateQuery` ->
`assertTranslationsPermission` -> `requireVersionQuery` -> `runEntityWrite`
(tx + pending translations) -> status code.

Variable per entity: permission enum members, zod schemas, service method
names (`listCustomers` vs `listUsers` vs `listAiModels` vs `listRoleMappings`),
`afterWrite` hooks (invalidateCache), `actor` from req.user (role_mapping),
MFA step-up on delete, feature flags (export/duplicate/bulk/checkAvailability),
extra routes.

### Inconsistencies found (decisions needed, not just mapping)

1. customers DELETE has NO `requireMfaStepUp`; ai_model/ai_cerebellum DO.
   Decide: MFA on all destructive ops or per-entity config?
2. orgs `:uuid` routes lack `validateUuidParam`; delete/restore parse
   `req.query.version` by hand instead of `requireVersionQuery`.
3. Response shapes diverge: customers returns the entity object;
   orgs returns `{success:true}`; role_mapping `{success:true, role}`.
   Pick one standard (recommend: return the entity object everywhere).
4. role_mapping keeps a full legacy duplicate route set keyed by
   `:idp_role` under `/api/v1/system/role-mappings` — deprecate or keep?
5. user_profile writes live under `/api/v1/auth/users` (Casdoor-aware
   lifecycle) — stays custom; only meta/list/get/audit join the base set.

### Proposed design — `makeEntityRouter(config)` in `src/http/entity-router.ts`

```ts
interface EntityRouterConfig {
  entity: EntityClass;
  entityName: string;                    // 'customer' -> path + actions derive
  meta: EntityMeta;
  permissions: {
    readAll: Permission[]; readSingle: Permission[];
    create?: Permission[]; update?: Permission[];
    delete?: Permission[]; restore?: Permission[];
    audit?: Permission[]; export?: Permission[];
    bulkDelete?: Permission[]; bulkRestore?: Permission[]; duplicate?: Permission[];
  };
  schemas: {
    listQuery: ZodType; createBody?: ZodType; updateBody?: ZodType;
    auditQuery?: ZodType; exportQuery?: ZodType; duplicateBody?: ZodType;
  };
  service: EntityServiceLike; // standard verbs, names mapped in config
  features?: { export?; duplicate?; bulk?; checkAvailability? };
  hooks?: {
    afterWrite?: () => void;             // e.g. invalidateCache
    actionMiddlewares?: Partial<Record<EntityAction, RequestHandler[]>>; // e.g. MFA on delete
  };
  handlers?: Partial<Record<EntityAction, RequestHandler>>; // body override — mandatory chain preserved
  extraRoutes?: RouteDef[];              // escape hatch (check-availability, legacy)
}
```

- Factory emits the standard route table via `registerRoutes` — every route
  still requires `rbacHandler` (protected-router default-deny untouched).
- `handlers.X` replaces only the handler body; permission + validation
  middleware are always applied — the "override inside try/catch" model.
- Feature flags decide which standard routes exist (orgs: no bulk/export/
  duplicate; user_profile: no write routes at all).
- Migration: one router at a time, starting with `ai_models`/`ai_cerebellum`
  (most canonical) then customers, then orgs/role_mapping/user_profile.

### Part D addendum — decisions from verification (2026-09-30)

1. **MFA on delete**: per-entity option `mfaStepUp` on the delete action,
   default false. System entities (users, roles, modules, orgs, ai_model,
   ai_cerebellum, translations, config) opt in; customers stays false.
2. **Response standard**: every CRUD write returns the full entity via DAL
   `RETURNING` (verified: dal-pg add/update/delete/restore all support it —
   TResult). `{success:true}` is eliminated. `orgs` PUT/DELETE/restore and
   `role_mapping` entity PUT/DELETE discard entity returns today — pure
   controller/service fixes. True non-CRUD RPC (e.g. `POST /auth/users` =
   Casdoor orchestration + invitation → `{profile, invitation_uuid}`) keeps
   custom handlers outside the standard set.
3. **Legacy `/api/v1/system/role-mappings`**: predates the entity set (added
   2026-09-27, MVC wave 3-4). FE consumes only `GET` (useRoleMappings.list —
   internal store refresh, no page reads `state.roles`); GET/POST/PUT/DELETE
   keyed by `:idp_role` have ZERO callers in FE/BE/US/SDK → dead code.
   Plan: migrate `useRoleMappings.list()` to `/entities/role_mapping/list`
   (or drop the refresh), delete the whole legacy set + service dead paths.
   `/api/v1/system/roles/active` is a DIFFERENT endpoint (dropdown data for
   profile/users forms) — stays.
4. **user_profile**: read-only entity set (meta/list/get/audit) via factory;
   writes stay in `/api/v1/auth/users` (RPC lifecycle — confirmed).
5. **Migration order**: TBD after pilot — propose ai_model first (canonical,
   smallest), then ai_cerebellum, customers, organization, role_mapping,
   user_profile.
6. **makeEntityRouter two shapes**: (A) pure CRUD → config-only, no
   handlers; (B) entity with deviations → `handlers.X` overrides the action
   body while the mandatory middleware chain (rbac → uuid/body/query
   validation → translations permission → version query → runEntityWrite tx)
   is non-overridable; `extraRoutes` for non-standard endpoints. Service
   verb names mapped explicitly in config (`service: { list: 'listCustomers', ... }`)
   — no hidden renames.

### Part D addendum 2 — entity-return verified end-to-end (2026-09-30)

**Refresh mechanism**: BroadcastChannel via `useSyncChannel` (per-entity
channel `primebrick_{entity}_sync`), NOT the response body. List page opens
child via `window.open('_blank')`; child saves -> `notifyParentRefresh()`
-> parent refreshes rows -> child `goto()`/`window.close()`. The
`{success:true}` body is only consumed locally for `goto(uuid)` on create.

**FE already expects entity-return**: `users/[uuid]` PUT consumes the write
response as the authoritative entity ("RETURNING") instead of re-fetching.

**FE migration cost (small)**:
- orgs create: `data.success && data.organization` -> `res.ok` + `data.uuid`
- orgs [uuid] update: `data.success` -> entity / `res.ok`
- `useRoleMappings.create`: `data.role` -> `data` directly
- role_mapping update/remove: `res.ok` only — no change

**role_mapping PUT/DELETE = same trivial cause as orgs** (no special reason):
`updateRoleByUuid` already returns `RoleMappingDetailed` (discarded by
router); `deleteRoleByUuid` reads the row via `findByUuid` before delete
(returnable); orgs service methods discard `OrganizationEntity` DAL returns.
All fixable by return-through: DAL RETURNING -> service -> controller.

**Confirmed exclusions**: `POST /auth/users` (RPC lifecycle — Casdoor +
invitation). Legacy `/system/role-mappings` set: delete approved (only the
GET has one internal consumer — `useRoleMappings.list()` refresh — which
migrates to `/entities/role_mapping/list` or is dropped entirely).

---

## Part E — `makeEntityService`: entity-generic CRUD service (proposed)

**Motivation (verified 2026-XX audit)**: `Repository` (dal-pg) is already the
generic CRUD engine — `add/update/delete/restore/find/findByPage` are
entity-agnostic and meta-driven. The per-entity `XxxDal`+`XxxService` layers
above it (~2.3k + ~0.5k lines across customer/ai_model/ai_cerebellum/
organization) are the SAME recipe hand-copied: identical `toDto` (date→ISO),
identical `getByUuid`+`buildAuditableJoins`, identical `listX`
(search/ILike+uuid-boost/sort/translateFilters/findByPage), identical
`create` (randomUUID+repo.add). The only real parameters are the entity class
and its `list-config.ts` keys (SEARCHABLE/FILTERABLE/DEFAULT_SORT) — already
config today.

**Bug class found**: because the contract is convention, not code, 4/5
`createX()` returned `{uuid}` instead of the entity (violating the
entity-return standard). `repo.add` was called without `returning` and its
result discarded. Fixed for customer only; ai_model/ai_cerebellum/
organization still violate it.

### E.1 — Target architecture

```ts
// src/http/entity-service.ts (shared, next to entity-router.ts)
export interface EntityService<TEntity> {
  list(query: ListQuery): Promise<{ rows: TEntity[]; page: number; page_size: number; total: bigint }>;
  getByUuid(uuid: string): Promise<TEntity>;               // throws NotFound
  create(body: unknown, tx?: PoolClient): Promise<TEntity>;
  update(uuid: string, body: unknown, tx?: PoolClient): Promise<TEntity>;
  delete(uuid: string, version: number): Promise<TEntity>;
  restore(uuid: string, version: number): Promise<TEntity>;
  purge?(uuid: string, version: number): Promise<TEntity>;
  duplicate?(uuids: string[]): Promise<BulkResult>;
  bulkDelete?(items: VersionedItem[]): Promise<BulkResult>;
  bulkRestore?(items: VersionedItem[]): Promise<BulkResult>;
  audit?(uuid: string, page: number, limit: number): Promise<AuditPage>;
  stream?(query: ListQuery): AsyncGenerator<TEntity>;       // for /export
}

export function makeEntityService<TEntity>(cfg: EntityServiceConfig<TEntity>): EntityService<TEntity>;
```

```ts
interface EntityServiceConfig<TEntity> {
  entity: EntityClass;                       // meta-driven columns/table
  auditPort?: AuditPort;
  list: {
    searchableKeys: string[];                // ILIKE search targets
    filterableKeys: string[];                // translateFilters allowlist
    defaultSort: { key: string; dir: 'asc' | 'desc' };
    extraFilters?: (q: any) => FilterExpr[]; // e.g. customer `status` param
    aggregates?: AggregateDecl[];             // GROUP BY rollups — E.3a
      // { name, join:{entity,on,extra?,type}, expr } -> Project.expr + groupBy [pk]
  };
  hooks?: {
    afterWrite?: (op: EntityAction, entity: TEntity) => Promise<void> | void;
    // cache invalidation (cerebellum, role_mapping) lives here — in the
    // service config, NOT in the router (stays HTTP-pure)
  };
  create?: { uuid?: () => string };          // default randomUUID()
}
```

### E.2 — Type enforcement (answers "how do we force TEntity returns")

`makeEntityRouter` becomes generic: `makeEntityRouter<TEntity>({ service:
EntityService<TEntity>, ... })`. `methods` map values are constrained to keys
of `EntityService<TEntity>`; `handlers.X` overrides must return
`Promise<TEntity>` (or `Promise<EntityListResult<TEntity>>` for list). A
`{uuid}` or `{success:true}` return becomes a **compile error**, not a
convention violation discovered by e2e.

- `create/update/delete/restore/purge` always return the row produced by
  `RETURNING` inside `repo.add/update/delete/restore` — the generic service
  calls them ONCE with `returning: projectAllExceptId()`, so it is
  structurally impossible to return `{uuid}`.
- `toDto` (date→ISO) is derived generically from entity metadata: walk
  projected columns, convert Date→ISO for timestamp/date audit fields. No
  per-entity column lists.

### E.3 — Organization `user_count`: JOIN + GROUP BY (decision: B)

Verified: `listOrganizations` runs `Promise.all` + a `COUNT(*)` query PER ROW
(25 rows = 25 queries). A real N+1, fixed via aggregation — NOT via batch
subqueries: the GROUP BY capability itself is the strategic value (it unlocks
dashboards and aggregation queries across the DAL, not just this one list).

Target SQL (single query, one pass):

```sql
SELECT t.*, COUNT(u.id) AS user_count
FROM organizations t
LEFT JOIN user_profiles u
  ON u.idp_org = t.idp_code AND u.deleted_at IS NULL
WHERE <filters>
GROUP BY t.id            -- PG: grouping by PK allows selecting t.* (functional dependency)
ORDER BY ...
LIMIT / OFFSET ...
```

Requires the new DAL aggregation support below (E.3a). FE-visible contract:
`TResult = TEntity & { user_count: number }` — declared in config.

#### E.3a — DAL feature: GROUP BY / HAVING in `findByPage` (deliver FIRST)

`primebrick-dal-v3` — extend `FindByPageInput`/query-builder:

```ts
interface FindByPageInput {
  // existing: entity, fields, filters, sorting, joins, deletedRecords...
  groupBy?: FieldRef[];          // rendered as GROUP BY <cols>
  having?: FilterExpr[];         // rendered as HAVING <conditions>
}
```

- Query-builder renders `GROUP BY` after joins/filters, `HAVING` after it;
  page count query must count GROUPS (`COUNT(*) OVER ()` or wrap in
  `SELECT COUNT(*) FROM (<grouped>) g`) — pick empirically, the naive
  row-count breaks totals otherwise.
- Aggregate projectors: extend `Project` with `agg(fn, field, alias)` or rely
  on existing `Project.expr("COUNT(u.id)", "user_count")` — no new projector
  needed if expr is sufficient (prefer expr first, add agg only if a pattern
  emerges).
- Validation: when `groupBy` is set, non-grouped non-aggregate projections
  on joined tables must be rejected or documented (PG would error anyway —
  better fail fast at builder level).
- Unit tests in `primebrick-dal-v3/test/` covering: group-by + join +
  filters + sort + pagination totals, HAVING on aggregates, and the
  `GROUP BY pk + t.*` functional-dependency case.

Driven by `list.aggregates` config in `makeEntityService`:

```ts
list: {
  aggregates: [{
    name: "user_count",
    join: { entity: UserProfileEntity, on: "idp_org = t.idp_code",
            extra: "u.deleted_at IS NULL", type: "LEFT" },
    expr: "COUNT(u.id)",
  }]
}
```

The generic service adds the join + `Project.expr` + `groupBy: [pk]` in one
place — user_count and every future aggregate (per-org customers, per-model
cerebellums, dashboard rollups) come for free.
### E.4 — Export (entity-wide capability, one system for all entities)

Verified shape: `ExportConfig = { locale, defaultTimezone, entity:{singular,
plural}, translations, fieldMapping, metadata, data: AsyncIterable }`
(`lib/export/types.ts:29`). The lib already merges base i18n-file
translations with per-call `userTranslations`.

Design (DRY, meta-driven):

- `service.stream(query)` = AsyncGenerator reusing the SAME list filter
  builder (today `streamAllCustomers` is a third copy of the list logic —
  deleted).
- Router `GET /export` handler owns ALL HTTP concerns: Content-Type /
  Content-Disposition headers + pipe through the already-generic
  `exportDataWithTemplateToStream`. Removes the current
  `service.export(query, res)` HTTP leak from the service layer.
- Per-entity config shrinks to `export: { fieldMapping?, entityLabels? }` —
  and `fieldMapping`/column headers DERIVE from entity meta columns, which
  already carry the i18n label keys the FE table uses
  (`entities.<e>.fields.<col>` convention). Translations resolved at runtime
  through the existing BE translations service (DB-backed). Same meta source
  for list UI and export headers — zero duplicated column lists.
- Capability-gated like the rest: `permissions.export` registers the route;
  absent -> no route.

### E.5 — Duplicate (identity-driven, not uuid-only)

`Repository.clone(entity, uuid, {actor, audit})` is generic in dal-pg
(`repository.ts:2074`) BUT has two hidden semantics verified in code:

1. **Lookup is uuid-only** — `WHERE uuid_col = $1`. Useless for entities
   without a uuid column or with composite identity.
2. **`isKey | isUnique | isClone` columns are silently DROPPED** from the
   clone (customer `code` is `@Unique` -> cloned rows get `code = NULL`;
   PG unique tolerates multi-NULL). Must be declared, not discovered.

Design — `duplicate(items: string[] | Array<Record<string, unknown>>)`:

- Identity columns derived from entity meta (`uuid`, or declared
  `@Key`/`@Unique` sets — composite included).
- String item -> uuid match. Object item -> its keys must cover a COMPLETE
  identity set; partial keys -> explicit error ("incomplete identity: missing
  `idp_org`"), never an ambiguous lookup. Match uses the same ERR10
  ambiguity guard as bulk ops (`bulkAmbiguousSql`).
- Non-identity unique columns: default = drop (current behaviour, now
  documented); optional `duplicate.overrides?: (row) => row` only when an
  entity explicitly needs a rewrite rule (e.g. `code` + `-copy`). Not a
  general hook — an explicit per-entity policy.
- Bulk collection = same `{uuids, errors}` per-row shape as
  bulkDelete/bulkRestore.

This makes duplicate usable for composite-key entities later (e.g.
role_mapping, should it ever become clonable) without reworking the API.

### E.6 — What stays custom (explicit, not implicit)

- **role_mapping**: non-uuid identity (`idp_role`), Casdoor orchestration in
  the service layer, hard-delete only. Custom service + `handlers` overrides
  in the router. Not a candidate for the generic CRUD service.
- **user_profile**: read-only entity, writes via `/auth/users` RPC.
- **POST /auth/users**: domain RPC, confirmed out of scope.

### E.7 — Migration plan

0. **DAL first**: implement GROUP BY / HAVING in `findByPage` (E.3a) with
   unit tests in `primebrick-dal-v3` — it unblocks the org `user_count`
   aggregate AND future dashboard/rollup queries. Solve `user_count` (and
   any similar N+1 aggregates found) THROUGH it, not around it.
1. `entity-service.ts` generic impl + typed `EntityService` contract.
2. Type `makeEntityRouter` generic over `TEntity` (compile-time contract).
3. Migrate `customer` first (pilot — already covered by e2e lifecycle spec):
   config = entity + searchable/filterable/sort keys + `status` extraFilter;
   keep `export`/`duplicate`/`PB_CUSTOMERS_FORCE_*` behind flags.
4. Migrate ai_model, ai_cerebellum (cache hook via `hooks.afterWrite`).
5. Migrate organization — `user_count` via `list.aggregates` + GROUP BY (E.3a).
6. Delete ~2k lines of per-entity dal/service dead weight.
7. Add e2e matrix entry per entity reusing `entity-crud-lifecycle.spec.ts`
   pattern (ad-hoc row lifecycle).
8. Docs: update `.devin/rules/entity-router-factory.md` + api-conventions
   with the service contract; document that write handlers MUST return
   `TEntity` (enforced by types, not by convention).

### Acceptance

- `tsc --noEmit` catches a non-entity return anywhere in the chain.
- Removing `returning` from any write path is impossible without editing the
  shared generic service.
- Per-entity custom logic lives ONLY in `hooks`/`handlers`/`extraRoutes` or
  in an explicitly custom service (role_mapping), never in a copied dal.
- `entity-crud-lifecycle.spec.ts` green on every migrated entity.
