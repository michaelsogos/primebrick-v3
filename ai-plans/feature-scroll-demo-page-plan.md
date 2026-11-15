# Feature Plan: "Primebrick in Motion" — Scroll-Jacking Feature Demo

> Status: DRAFT — awaiting user approval (keyword `PROCEED`)
> Repo: `primebrick-v3-website` (Astro static site, deployed to Cloudflare Workers)
> Author: Devin (GLM-5.2 High)
> Date: 2026-07-27

## 1. Objective

Add a **"Primebrick in Motion"** web-screen feature demo to `primebrick.dev` — a
scroll-jacking animated product tour of the **actual Primebrick backoffice UI**,
faithfully replicated in mocked form. Think the old Apple Watch scroll-jacking
demo, but for Primebrick's backoffice features: as the user scrolls, the viewport
pins and a mocked browser window ("device frame") advances through realistic
replicas of the real app, each scene showcasing a verified feature with a
callout citing the real component/file path it replicates.

Per the user's clarification, this is **NOT** an architecture/infrastructure
diagram — it is a **cinematic tour of the product's features**, built from an
empirical deep-dive into `primebrick-fe-v3`. Per the user's suggestion to
"divide into different pages," the demo is split into a **hub + themed demo
pages**, each a focused scroll-jacking tour of 3–14 related features. This
avoids one exhausting mega-scroll and lets each page be a tight, polished
cinematic.

The demo must:

- Be linked from the **top navigation menu** of every page (`nav.demo`).
- Be **multi-language** (EN/IT/DE/ES/PT/FR) like the rest of the site.
- Be **prerendered** (0ms Worker CPU, free on Cloudflare).
- Faithfully replicate the real Primebrick FE look (sidebar with org/module
  switchers + dynamic nav, topbar with all 8 elements, EntityListTable with all
  features, right-side sheets, centered dialogs) — **mocked with Tailwind +
  inline SVG only** (no `bits-ui`, no `@lucide/svelte` — neither exists in the
  website repo).
- Use only the **existing stack** (Astro + Svelte 5 runes + Tailwind CSS 4).
  No new runtime dependencies.
- Cite the **real component/file path** every scene replicates (empiricism).
- Be **honest** about not-yet-implemented features (collab, agentic) — either
  excluded or clearly marked "Preview of upcoming UX."
- Honor `prefers-reduced-motion: reduce` on every page (WCAG/VPAT is a site
  pride point) — collapses to a fully-readable static stack.

## 2. Empirical findings (analysis phase)

### 2.1 Website architecture (verified)

- **Rendering**: `astro.config.mjs` → `output: 'static'` + `@astrojs/cloudflare`.
  All pages prerendered. New pages MUST set `export const prerender = true`.
- **No shared Layout component.** `src/layouts/` does NOT exist. Each page is a
  full HTML document with **inline** `<nav>`, ambient gradient background,
  footer. → New pages mirror `src/pages/[lang]/thank-you.astro` (closest
  standalone-page sibling).
- **Routing**: `src/pages/[lang]/*.astro` + `getStaticPaths()` over `LANGUAGES`.
- **i18n**: `src/i18n/translations.ts`, 6 langs (EN/IT/DE/ES/PT/FR). Each lang
  has `nav: { home, features, docs, apiCatalog, github, license, contact,
  thankyou }`.
- **Styling**: Tailwind CSS 4 via `@tailwindcss/vite`. `src/styles/global.css`
  = `@import "tailwindcss";`. Dark theme `bg-slate-950`, sky/indigo/cyan
  accents, ambient blurred gradient blobs, `backdrop-blur`.
- **Interactivity**: Svelte 5 runes (`$state`, `$effect`, `$derived`, `$props`).
  Hydration `client:load` / `client:idle` / `client:visible`. Scroll effects
  use `window.addEventListener('scroll', handler, { passive: true })` + resize.
  IntersectionObserver used in `ThankYouScroll.svelte`.
- **Icons**: `simple-icons` 16.26.0 runtime dep (brand SVG paths). **The
  website does NOT have `@lucide/svelte` or `bits-ui`** — mocked UI must be
  hand-built with Tailwind + inline SVG (Lucide paths are MIT-licensed, can be
  inlined as a small icon map).
- **Redirects**: `public/_redirects` currently: `/ /en/ 302`, `/contact
  /en/contact 302`, `/thank-you /en/thank-you 302`.
- **Footer**: inline per page: `© 2026 {t.footer.copyright}`, version, GitHub
  link.
- **Dev server**: port 4321 (NEVER start a 2nd instance, NEVER kill existing).
  NEVER commit without explicit user instruction. Filenames kebab-case (Astro
  pages); PascalCase (Svelte components, existing convention).

### 2.2 Reference scroll-jacking component (gold-standard pattern)

`src/components/svelte/SchemaToProduction.svelte`: wrapper
`<section style="height: 300vh;">` (tall track) + inner `sticky top-0 h-screen`
pinned stage; passive scroll listener computes `progress` (0..1) from
`sectionEl.getBoundingClientRect()` vs viewport; `currentPhase =
Math.min(Math.floor(progress * phases.length), phases.length - 1)` drives
cross-fade between phases (absolutely-positioned panels, `opacity: 1|0` +
`transition-opacity duration-500`). NO new deps.

Second reference: `ThankYouScroll.svelte`: left progress rail, parallax ambient
blobs, IntersectionObserver reveal-on-scroll with `prefers-reduced-motion`
fallback, staggered CSS transition-delay.

### 2.3 Verified Primebrick FE features (from deep-dive into primebrick-fe-v3)

**App shell** (`src/lib/components/AppShell.svelte`): `flex h-dvh` →
`Sidebar.Provider` wrapping `AppSidebar` + `Sidebar.Inset` (topbar + content).

- **AppSidebar** (`AppSidebar.svelte`): Organization switcher
  (`SidebarOrgSwitcher.svelte`, API `/api/v1/system/organizations/active`),
  Module switcher (`SidebarModuleSwitcher.svelte`, source `shellNav.modules`),
  dynamic nav links from `shellNav.moduleNav?.nav` (renders `ModuleNavLink[]`
  with nested children, `DynamicIcon`), user menu (`SidebarProfileMenu.svelte`
  — hexagon gradient avatar, settings link, sign out), health badge
  (`SidebarHealthBadge.svelte` — Cloud/CloudOff/Database/DatabaseZap/Radio/
  ShieldAlert icons for backend/db/redis/nats/idp offline states, clickable →
  opens VersionsPanel sheet), version badge (`SidebarVersionBadge.svelte` — app
  version, clickable → VersionsPanel).
- **AppTopbar** (`AppTopbar.svelte`): sidebar trigger, command palette
  (`CommandPalette.svelte`, Ctrl+K/⌘K/Alt+\), IANA timezone display (globe +
  `America/New_York`), language selector (`LangSelect.svelte`), error
  notifications button (TriangleAlert + impact-colored badge → opens
  ErrorsPanel sheet), notifications bell (badge unread=3), AI chat button
  (MessageSquare → opens AiChatPanel sheet), theme toggle (`ThemeToggle.svelte`
  — light/dark, localStorage `pb.theme`).
- **Module sidebar links from metadata**: `fetchModules()` → `/api/v1/modules`
  returns `ModuleInfo[]` (id, name, enabled, icon, route_prefixes, is_reserved);
  `fetchModuleMeta(code)` → `/api/v1/modules/{code}/meta` returns `ModuleNav`
  (module, icon, nav: `ModuleNavLink[]` with id, label_key, href, icon,
  children). `modules-shell.svelte.ts` orchestrates `loadShellNav`/
  `selectModule`/`syncModuleFromRoute`. A microservice's module appears
  dynamically: MS registers → BE exposes via `/api/v1/modules` → FE fetches on
  mount → appears in module switcher dropdown → selected → fetchModuleMeta →
  nav links render in sidebar.

**EntityListTable** (`src/lib/components/entity-list-table/EntityListTable.svelte`,
generic `<TRow>`): renders from entity metadata (column meta from
`GET /api/v1/entities/{entity}/meta`, type `EntityListListMeta`; columns ordered
sticky→data→auditing). Features (ALL verified, cite the composable/component):

- **Search**: `SearchBar.svelte` (syntax highlighter `SearchSyntaxHighlighter.svelte`,
  "Search In" column scope → `SearchInPanel.svelte` checkbox list + "search in
  all"). Debounced; API gets `search` + `search_in` params.
- **Filters**: `FilterBar.svelte` (chips for basic + advanced, clear-all,
  individual remove). `FiltersPanel.svelte` (tabbed Standard/Advanced; Advanced
  builder: field dropdown, operator selector, value input, AND/OR connector,
  drag-drop reorder with crossfade). Operators by column type
  (`getOperatorsForColumnType` in `types.ts:228-242`: text→
  [=,!=,contains,startsWith,endsWith], badge→[=,!=], date/datetime→
  [=,!=,>,<,>=,<=,BETWEEN]). Date fields use `DateWheelPicker` + IANA timezone
  selector → UTC ISO. Persistence via sessionStorage (`filterValuesStorageKey`,
  `advancedFiltersStorageKey`).
- **IANA handler**: `datetimeIanaToggle: { recordIanaField }` in column meta.
  `TableCell.svelte:69-87` — toggles browser-local vs record's IANA timezone;
  record mode shows amber badge (`border-amber-300/90 bg-amber-100`).
  `TableHeader.svelte:131-160` — header toggle button "Browser"/"Record".
  `cell-styling.ts` — amber tints. `browser-iana-timezone.ts` —
  `getResolvedIanaTimeZone()` via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **Column selector**: `ColumnSelectorPanel.svelte` — 3 groups
  (sticky/data/auditing) with dividers, drag-drop reorder via `Sortable.Root`,
  checkboxes show/hide, `hideable` flag, reset button. `useColumnOrder.svelte.ts`
  persists order to sessionStorage.
- **Fixed/sticky columns**: `useStickyColumns.svelte.ts` — CSS `position: sticky`
  + dynamic `left` offset via `ResizeObserver`; `stickyRef()` action;
  `cell-styling.ts` `stickyCellClass()` (neutral gray chrome; destructive red
  chrome for deleted rows).
- **Row selection**: `useSelection.svelte.ts` (header select-all + per-row
  checkbox, toggle/clear/isRowSelected, someSelected, allSelected).
  `useRowRangeSelection.svelte.ts` (mouse-drag brush + shift+click range).
  `useClientSelection.svelte.ts` (selected-only view, client-side paging,
  auto-exit on reload). `SelectionCounter.svelte`. `useToolbarMode.svelte.ts`
  auto-switches toolbar filters↔bulk.
- **Sorting**: `useSorting.svelte.ts` (3-state asc→desc→null cycle, handleSort,
  getSortDirection, isSortable). `handlers/sorting.ts:46-57` handleSortClick.
  Header sort indicators.
- **View modes**: `ViewModeToggle.svelte` — table/cards/cards_list, persists to
  sessionStorage. Card views: `CardGrid.svelte`, `CardList.svelte`,
  `CardField.svelte`.
- **Deletion filter**: `DeletionFilterToggle.svelte` — non_deleted/deleted/all
  (only when entity has deleted_at/deleted_by).
- **CRUD row actions**: `useRowActions.svelte.ts` — handleEditRow,
  handlePreviewRow, handleDeleteRow, handleRestoreRow, handleDuplicateRow +
  customActionHandlers (e.g. changePassword). APIs: DELETE
  `/api/v1/entities/{entity}/{uuid}`, POST `.../restore`, POST `.../duplicate`.
  Dialogs: DeleteDialog, RestoreDialog, DuplicateDialog, ChangePasswordDialog.
- **Bulk actions**: `useBulkActions.svelte.ts` — handleBulkDelete/Restore/
  Duplicate (50-item limit). `BulkActions.svelte` toolbar (selected count, bulk
  delete/duplicate/export/restore). APIs: POST `.../bulk-delete`,
  `.../bulk-restore`, `.../duplicate`. Dialogs: BulkDeleteDialog,
  BulkRestoreDialog.
- **Pagination**: `Pagination.svelte` (first/prev/next/last, "{page} / {total}",
  server + client paging).
- **Preview panel**: `PreviewPanel.svelte` (full row preview, prev/next nav,
  sticky/data/auditing grid).
- **Keyboard nav**: `useKeyboardNavigation.svelte.ts` (arrows, space toggle
  select, enter preview, escape close). **Scroll preservation**:
  `useScrollPreservation.svelte.ts`.

**Exports** (verified): `ExportDialog.svelte` (XLSX/CSV, scope selected/all,
selected count + total, loading state). `HtmlExportDialog.svelte`,
`ExportPreviewDialog.svelte` (Dock with HTML/PDF/Email icons; HTML iframe
srcdoc; PDF iframe from blob; Email Window with mailbox sidebar).
`useExport.svelte.ts:98-240` handleExport builds URLSearchParams (file_type,
search, search_in, sort_key/dir, filters[field/op/value], advanced filters with
IN/NOT IN/BETWEEN/ILIKE, selected keys via IN filter, deleted_records
ONLY/INCLUDED) → `GET /api/v1/entities/{entity}/export` → blob download.
Buttons in BulkActionsToolbar + EntityListTableHeader.

**AI Chat panel** (verified): `AiChatPanel.svelte` (sheet, right side, 600px,
`Sheet.Content showClose={false} side="right" height:100vh`). Header
(MessageSquare + title + new conversation + close). Conversations sidebar
(narrow w-48, list + delete). Message thread (user/assistant bubbles, avatars,
citations as clickable chips with FileText icon + "{i+1}. {title}"). Feedback
thumbs up/down. Input Textarea + Send button. `use-ai-chat.svelte.ts` —
`createSsePostStream` to `/api/v1/ai/chat`, events: `text-delta` (append
streamingText), `tool-call`, `tool-result` (capture search_docs citations),
`client-tool-call` (pendingToolCall, e.g. navigate — requires user
confirmation), `error`, `finish`. `client-tool-registry.ts`
`registerBuiltinClientTools`. Triggered from topbar message icon.

**Passkey/WebAuthn** (verified): `PasskeyEnrollment.svelte` — addPasskey():
POST `/api/v1/auth/webauthn/signup/begin` → `{nonce, options}` →
`decodeCredentialCreationOptions` → `navigator.credentials.create({publicKey})`
(OS biometric prompt) → POST `/api/v1/auth/webauthn/signup/finish` with
`{nonce, credential: encodeAuthenticatorAttestation(credential),
platform_version}`. `PasskeyButton.svelte` — signInWithPasskey(): POST
`/api/v1/auth/webauthn/signin/begin` → `navigator.credentials.get({publicKey})`
→ POST `.../signin/finish` with `encodeAuthenticatorAssertion`. `LoginForm.svelte`
integrates PasskeyButton with "or" divider. `webauthn/codec.ts` encode/decode
helpers.

**MFA step-up modal** (verified): `MfaStepUpDialog.svelte` — `BorderedDialog
severity="primary" tone="soft"`, ShieldCheck icon title, shows `action` →
`target_resource` (KeyRound icon), factor selector dropdown (factor_id, label,
factor_type), TOTP 6-digit Input (inputmode numeric, pattern \d{6}, autocomplete
one-time-code, placeholder 000000, tracking-widest), "Verify and Authorize"
button. `useMfaStepUp.svelte.ts` — `executeWithToken(requestFn, context)`: first
attempt no token; if 403 + `errorData.extra.mfa_step_up_required` → open dialog,
set pendingAction/pendingTargetResource, wait for user → verify → retry
requestFn with `X-MFA-Action-Authorization: token` header. APIs: POST
`/api/v1/auth/mfa/step-up/initiate`, `/verify`. Usage: wraps any critical action
(delete org, change password, modify RBAC).

**Version history panel** (verified): `VersionHistoryPanel.svelte` (sheet
`'entity.versionHistory'`). `loadVersionHistory()` → GET
`/api/v1/entities/{entity}/{rowUuid}/audit?page=&limit=` →
`{data, pagination:{total, hasMore}}`. Timeline with action icons
(`getAuditActionIcon`: hard_delete→CircleX, delete/soft_delete→AlertCircle,
create/insert→CircleCheckBig, restore→AlertTriangle, update→Info). Expandable
entries. `formatAuditDelta(delta, action)` — per-field old/new with badge/color
support. Triggered from FormPageLayout footer version badge (`v{auditData.version}`
clickable → opens panel).

**Error panel** (verified): `ErrorsPanel.svelte` (sheet `'shell.errors'`).
`app-errors.ts` — `AppError` type (id, impact: CRITICAL|HIGH|MEDIUM|LOW|NONE,
messageKey/message, scopeKey/scope, tags, detail, createdAt); `appErrors`
writable store; `pushNotification(input)` — detects RFC7807 (`type`+`status`),
normalizes, translates i18n keys, builds AppError, adds to panel (except
NONE=success), always shows toast via svelte-sonner. UI: empty state (ThumbsUp
size-20 text-info), else `EventCard.Root`/`Label`/`Title`/`Message` with
`impactToEventColor`, tags as Badges. Impact colors: CRITICAL red semaphore,
HIGH destructive, MEDIUM warning, LOW info, NONE success. Triggered from topbar
TriangleAlert button (badge with error count).

**Module settings** (verified): `/system/settings/modules/[code]/+page.svelte`
— Tabs (Service Info / Module Config). Service Info: manual form (name, base_url,
description, icon, icon_type [icon/url/svg/base64], author, github_repo_url).
Module Config: dynamic from `fetchModuleConfig(code)` →
`/ws/{code}/api/v1/entities/config_entries/list` → `ModuleConfigEntry[]` (uuid,
key, value, label_key, description_key); renders label (i18n via label_key) +
description + Input, auto-save on change → `updateModuleConfigKey` → PUT
`/ws/{code}/api/v1/entities/config_entries/{uuid}` → toast. Module list page
(`/system/settings/modules/+page.svelte`): groups services by code, aggregate
status (online/going_live/offline) with color badges, toggle enable/disable,
delete, configure buttons. Health badge states: backend_offline/db_offline/
redis_offline/nats_offline/idp_offline.

**Tech stack / design system to replicate** (verified): SvelteKit 2.69 + Svelte
5.56 + TS 6 + Vite 8. Tailwind CSS v4 (CSS-first, no config). bits-ui 2.18
(headless primitives — NOT available in website repo, must mock). Lucide icons
via @lucide/svelte (NOT in website repo — inline SVG paths instead). Color
tokens (HSL CSS vars): light `--background 0 0% 100%`, `--foreground 222.2 84%
4.9%`, `--primary 200 98% 39%` (sky-700-ish), `--destructive 0 84.2% 60.2%`,
`--critical 0 86% 57%`, `--success 142.1 76.2% 36.3%`, `--warning 38 92% 50%`,
`--info 199 89% 48%`; sidebar OKLCH tokens; dark mode `.dark` class. Gradient
utilities: `border-primary-gradient` (sky→indigo), `border-destructive-gradient`,
`border-warning-gradient`, `border-success-gradient`, `border-info-gradient`.
Inter Variable font. Components: BorderedDialog (severity + tone), Sheet
(right-side sliding, sheet-manager with IDs), EventCard, Badge, Choicebox, Dock,
Window.

**NOT implemented in FE (BE-only / roadmap — handle honestly):**

- **Real-time collaboration UI** (presence avatars, field-level merge, conflict
  panel) — BE has full implementation (`collaboration-bus-registry.ts`,
  `presence-store-holder.ts`, `collaboration.service.ts`, `keyspace-listener.ts`,
  SSE endpoint `/api/v1/entities/:entity/:uuid/presence/events`), FE only has
  `BroadcastChannel` cross-tab refresh (`useSyncChannel.svelte.ts`). NOT a real
  collab UI.
- **Agentic development UI** (plan/approve/build/deploy) — does not exist at all.
- **ConfigTable reusable component** — module settings is a custom page, not a
  reusable component.

## 3. Design — "Primebrick in Motion" web-screen feature tour

### 3.1 Concept

Each demo page pins the viewport (scroll-jacking, mirror the
`SchemaToProduction.svelte` pattern) and advances through realistic mocked
Primebrick backoffice screens. A persistent **"device frame"** (mocked browser
window with traffic lights + URL bar showing the real route) contains a faithful
mocked replica of the Primebrick app (sidebar with org/module switchers +
dynamic nav, topbar with command palette/IANA/lang/errors/notifications/AI
chat/theme, content area). As the user scrolls, the content inside the device
frame animates to showcase each feature, and a **callout/annotation panel**
(right side or overlay) slides in explaining what's happening (with the real
component/file name cited). Mocked UI is hand-built with Tailwind + inline SVG
(Lucide paths inlined as a small icon map; simple-icons for brand logos in
health badge). **NOT screenshots — fully animated.**

### 3.2 Hub + themed demo pages (per user's "divide into pages" suggestion)

A **hub** landing page + focused themed demo pages. Each themed page is a tight
scroll-jacking tour of 3–14 related features. This avoids one exhausting
mega-scroll and lets each page be a polished cinematic.

### 3.3 Proposed pages

All under `src/pages/[lang]/demo/`, all prerendered, all i18n 6 langs, all with
`nav.demo` link + hreflang + `_redirects` entries.

| Route | File | Scroll component | Theme | Scenes |
|-------|------|------------------|-------|--------|
| `/demo` | `index.astro` | (hero + cards, no scroll-jack) | Hub | — |
| `/demo/shell` | `shell.astro` | `DemoShellScroll.svelte` | The Shell | 8 |
| `/demo/entities` | `entities.astro` | `DemoEntitiesScroll.svelte` | The Entity List Table | 7–14 (split if needed) |
| `/demo/exports` | `exports.astro` | `DemoExportsScroll.svelte` | Exports | 6 |
| `/demo/ai-chat` | `ai-chat.astro` | `DemoAiChatScroll.svelte` | AI Chat, Private by Design | 6 |
| `/demo/security` | `security.astro` | `DemoSecurityScroll.svelte` | Security & Step-Up | 4 |
| `/demo/versions-errors` | `versions-errors.astro` | `DemoVersionsErrorsScroll.svelte` | Version History & Errors | 8 |
| `/demo/modules` | `modules.astro` | `DemoModulesScroll.svelte` | Modular Bricks | 5 |
| `/demo/collab` (OPTIONAL) | `collab.astro` | `DemoCollabScroll.svelte` | Preview: Real-time Collaboration | 4 |
| `/demo/agentic` (OPTIONAL) | `agentic.astro` | `DemoAgenticScroll.svelte` | Preview: Agentic Development | 4 |

#### 3.3.1 `/demo` (hub, `index.astro`) — "Primebrick in Motion"

Hero + grid of cards linking to each themed demo page. Each card has an icon,
title, description, and a subtle hover preview. Cards: Shell, Entities,
Exports, AI Chat, Security, Versions & Errors, Modules, (OPTIONAL: Collab,
Agentic — marked "Preview").

#### 3.3.2 `/demo/shell` — "The Shell"

App shell anatomy. Scenes:

1. Shell assembles (sidebar + topbar + content).
2. Org switcher dropdown.
3. Module switcher dropdown → dynamic nav links appear from `/meta`.
4. Command palette Ctrl+K opens → search commands.
5. IANA timezone display + language selector.
6. Theme toggle light/dark.
7. Health badge states (backend/db/redis/nats/idp).
8. Version badge → VersionsPanel.

#### 3.3.3 `/demo/entities` — "The Entity List Table" (flagship)

Scenes:

1. Table renders from entity metadata.
2. Search + search-in column scope.
3. Standard filters chips + advanced filter builder (operators by type, AND/OR,
   drag reorder).
4. IANA datetime toggle (browser↔record, amber badge).
5. Column selector (drag reorder, sticky/data/auditing groups, hideable).
6. Sticky columns (left-pinned, gray chrome).
7. Row selection (checkbox, range brush, shift+click) → toolbar switches to bulk.
8. Sorting 3-state.
9. View modes table/cards/cards_list.
10. Deletion filter (deleted/all).
11. CRUD row actions (edit/preview/delete/restore/duplicate + custom
    changePassword).
12. Bulk actions (delete/restore/duplicate/export).
13. Preview panel prev/next.
14. Keyboard nav.

> This is the biggest page. **Consider splitting** into `/demo/entities`
> (view/search/filter/columns, scenes 1–6) + `/demo/entities-actions`
> (selection/bulk/CRUD/preview, scenes 7–14) if the track height or DOM node
> count gets unwieldy. Decision deferred to implementation Phase 6 based on
> measured perf.

#### 3.3.4 `/demo/exports` — "Exports"

Scenes:

1. ExportDialog XLSX/CSV + scope selected/all.
2. HTML export.
3. Preview dock (HTML/PDF/Email icons).
4. HTML iframe preview.
5. PDF generation.
6. Email-optimized HTML with mailbox preview.

#### 3.3.5 `/demo/ai-chat` — "AI Chat, Private by Design"

Scenes:

1. Topbar message icon → AiChatPanel sheet slides in (right, 600px).
2. Conversations sidebar.
3. User sends message → SSE stream `text-delta` types out response.
4. `tool-call`/`tool-result` → search_docs citations appear as chips.
5. `client-tool-call` navigate → user confirmation.
6. Feedback thumbs up/down.

> Annotation: "Private by design — LLM runs as a local container, knowledge in
> Postgres pgvector, no data leaves your infra."

#### 3.3.6 `/demo/security` — "Security & Step-Up"

Scenes:

1. Login screen with PasskeyButton (Face ID/Touch ID/Windows Hello).
2. Passkey enrollment ceremony (signup/begin → OS biometric prompt →
   signup/finish).
3. Passkey login ceremony (signin/begin → biometric → signin/finish).
4. Critical action attempted (delete org) → 403 `mfa_step_up_required` →
   MfaStepUpDialog slides in (ShieldCheck, action→target_resource, factor
   selector, TOTP 6-digit, verify) → retry with
   `X-MFA-Action-Authorization` header → success.

#### 3.3.7 `/demo/versions-errors` — "Version History & Errors"

Scenes:

1. Form footer version badge `v3` clickable → VersionHistoryPanel sheet.
2. Timeline with action icons (CircleX/AlertCircle/CircleCheckBig/
   AlertTriangle/Info).
3. Expandable entry → delta diff (old/new, badge/color fields).
4. Pagination + hasMore.
5. Error panel — topbar TriangleAlert badge → ErrorsPanel sheet.
6. EventCard with impact colors (CRITICAL red/HIGH destructive/MEDIUM warning/
   LOW info).
7. RFC7807 auto-detect.
8. Toast + panel dual notification.

#### 3.3.8 `/demo/modules` — "Modular Bricks"

Scenes:

1. Module list page (grouped by code, status badges online/going_live/offline,
   toggle/delete/configure).
2. Module settings — Service Info tab (name, base_url, icon, icon_type, author,
   github_repo_url).
3. Module Config tab — dynamic entries from `config_entries` (label_key,
   description_key, auto-save on change → toast).
4. Sidebar module switcher → nav links appear from `/meta`.
5. Health badge states.

> Annotation: "Modules self-register via NATS, expose /meta + config_entries, FE
> discovers dynamically — add without forking."

#### 3.3.9 OPTIONAL `/demo/collab` and `/demo/agentic` — "Preview of upcoming UX"

Clearly marked **"Preview of upcoming UX"** (since FE doesn't implement them
yet). Mock from BE contracts:

- **Collab**: SSE presence events, field-level merge, conflict panel — BE has
  `collaboration.service.ts`, `presence-store-holder.ts`, `keyspace-listener.ts`.
  Scenes: (1) presence avatars appear on record, (2) field-level concurrent
  edit, (3) merge proposal, (4) conflict resolution panel.
- **Agentic**: mock the plan/approve/build/deploy timeline from the homepage's
  agentic wireframe description. Scenes: (1) describe intent, (2) agent
  proposes plan, (3) user approves, (4) build + deploy progress.

> The plan marks these as OPTIONAL/preview and notes they mock not-yet-existing
> UI — let the user decide on PROCEED whether to include.

### 3.4 Shared mocked UI kit (NEW, reusable across demo pages)

| Path | Purpose |
|------|---------|
| `src/components/svelte/demo/DemoScrollBase.svelte` | Shared scroll-jacking mechanic: tall track + sticky stage + passive scroll listener + progress + smoothstep + reduced-motion static stack + progress rail + scene dots. Accepts `scenes` prop. |
| `src/components/svelte/demo/MockAppShell.svelte` | Device frame (traffic lights + URL bar with route prop) + MockSidebar + MockTopbar + content slot. |
| `src/components/svelte/demo/MockSidebar.svelte` | Sidebar: org switcher, module switcher, nav links from prop, user menu, health badge, version badge. |
| `src/components/svelte/demo/MockTopbar.svelte` | Topbar: 8 elements with inline SVG icons. |
| `src/components/svelte/demo/MockEntityTable.svelte` | Simplified but faithful EntityListTable: sticky columns, header (search + filter chips + column selector + view mode toggle), rows with checkbox + data cells + IANA datetime badge + row actions. `highlight` prop drives which feature is visually emphasized. |
| `src/components/svelte/demo/MockSheet.svelte` | Right-side sliding panel (replicates bits-ui Sheet). |
| `src/components/svelte/demo/MockDialog.svelte` | Centered dialog (replicates BorderedDialog). |
| `src/components/svelte/demo/icons.ts` | Inline Lucide SVG path map: MessageSquare, TriangleAlert, Bell, Globe, ShieldCheck, KeyRound, CircleX, AlertCircle, CircleCheckBig, AlertTriangle, Info, FileText, Send, ThumbsUp, ThumbsDown, Columns3, Search, Filter, ChevronDown, etc. + `Icon` render helper snippet. |

Each themed scroll component composes `MockAppShell` + `DemoScrollBase` +
feature-specific mocks.

### 3.5 Accessibility (HARD — site prides itself on WCAG/VPAT)

`prefers-reduced-motion: reduce` collapses **EVERY** demo page to a static
vertical stack — each scene renders as a normal full-height section with the
mocked UI static (no animation, no pinning) + the annotation as plain readable
text + the real component/file citation. No scroll listeners attached.
**Implement FIRST.** Semantic `<h2>` per scene, `aria-current="page"` on active
nav, scene dots as anchor nav. `100dvh` for sticky stage on mobile (with `100vh`
fallback).

### 3.6 Technical (no new deps)

Svelte 5 runes. Passive scroll listener computing `progress` from
`getBoundingClientRect()` (mirror `SchemaToProduction`). `smoothstep` helper for
sub-scene easing. Mocked UI = Tailwind + inline SVG only (no bits-ui, no
@lucide/svelte — both unavailable in website repo). `will-change: transform,
opacity` on animated layers. No global `scroll-behavior: smooth` (fights
scroll-jacking); only on anchor jumps. `client:load` for above-the-fold hero
scenes; `client:visible` acceptable for lower scenes if perf needs it (but
`client:load` is simpler and matches `SchemaToProduction`).

## 4. Files to create / modify

### 4.1 NEW files

| Path | Purpose |
|------|---------|
| `src/pages/[lang]/demo/index.astro` | Hub page — hero + grid of cards linking to themed demos. Prerendered, i18n, mirrors thank-you.astro shell. |
| `src/pages/[lang]/demo/shell.astro` | "The Shell" demo page. |
| `src/pages/[lang]/demo/entities.astro` | "The Entity List Table" demo page (flagship). |
| `src/pages/[lang]/demo/exports.astro` | "Exports" demo page. |
| `src/pages/[lang]/demo/ai-chat.astro` | "AI Chat, Private by Design" demo page. |
| `src/pages/[lang]/demo/security.astro` | "Security & Step-Up" demo page. |
| `src/pages/[lang]/demo/versions-errors.astro` | "Version History & Errors" demo page. |
| `src/pages/[lang]/demo/modules.astro` | "Modular Bricks" demo page. |
| `src/pages/[lang]/demo/collab.astro` (OPTIONAL) | "Preview: Real-time Collaboration" demo page. |
| `src/pages/[lang]/demo/agentic.astro` (OPTIONAL) | "Preview: Agentic Development" demo page. |
| `src/components/svelte/demo/DemoScrollBase.svelte` | Shared scroll-jacking mechanic + reduced-motion static stack. |
| `src/components/svelte/demo/MockAppShell.svelte` | Device frame + sidebar + topbar + content slot. |
| `src/components/svelte/demo/MockSidebar.svelte` | Mocked sidebar. |
| `src/components/svelte/demo/MockTopbar.svelte` | Mocked topbar (8 elements). |
| `src/components/svelte/demo/MockEntityTable.svelte` | Mocked EntityListTable. |
| `src/components/svelte/demo/MockSheet.svelte` | Mocked right-side Sheet. |
| `src/components/svelte/demo/MockDialog.svelte` | Mocked centered BorderedDialog. |
| `src/components/svelte/demo/icons.ts` | Inline Lucide SVG path map + `Icon` render helper. |
| `src/components/svelte/demo/DemoShellScroll.svelte` | Shell-themed scroll tour. |
| `src/components/svelte/demo/DemoEntitiesScroll.svelte` | Entities-themed scroll tour. |
| `src/components/svelte/demo/DemoExportsScroll.svelte` | Exports-themed scroll tour. |
| `src/components/svelte/demo/DemoAiChatScroll.svelte` | AI Chat-themed scroll tour. |
| `src/components/svelte/demo/DemoSecurityScroll.svelte` | Security-themed scroll tour. |
| `src/components/svelte/demo/DemoVersionsErrorsScroll.svelte` | Versions & Errors-themed scroll tour. |
| `src/components/svelte/demo/DemoModulesScroll.svelte` | Modules-themed scroll tour. |
| `src/components/svelte/demo/DemoCollabScroll.svelte` (OPTIONAL) | Collab preview scroll tour. |
| `src/components/svelte/demo/DemoAgenticScroll.svelte` (OPTIONAL) | Agentic preview scroll tour. |

### 4.2 MODIFIED files

| Path | Change |
|------|--------|
| `src/i18n/translations.ts` | Add `demo` block + `nav.demo` to all 6 langs. |
| `src/pages/[lang]/index.astro` | Add Demo nav link + hreflang. |
| `src/pages/[lang]/contact.astro` | Add Demo nav link + hreflang. |
| `src/pages/[lang]/thank-you.astro` | Add Demo nav link + hreflang. |
| `public/_redirects` | Add `/demo /en/demo 302` + per-route redirects (or `/demo/* /en/demo/:splat 302` if Cloudflare supports splat). |

## 5. Code sketches (concrete)

### 5.1 `DemoScrollBase.svelte` — shared scroll-jacking mechanic

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface Scene { id: string; titleKey: string; descKey: string; fileRef: string; }
  let { scenes, labels, children }: { scenes: Scene[]; labels: Record<string, string>; children: any } = $props();

  let sectionEl = $state<HTMLElement>();
  let progress = $state(0);
  let reducedMotion = $state(false);
  let currentScene = $state(0);

  const smoothstep = (t: number) => t * t * (3 - 2 * t);

  function sceneProgress(i: number) {
    const start = i / scenes.length;
    const end = (i + 1) / scenes.length;
    return smoothstep(Math.max(0, Math.min(1, (progress - start) / (end - start))));
  }

  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    const onMq = () => (reducedMotion = mq.matches);
    mq.addEventListener('change', onMq);

    if (reducedMotion) return; // static stack — no listeners

    const onScroll = () => {
      if (!sectionEl) return;
      const rect = sectionEl.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      progress = Math.max(0, Math.min(1, -rect.top / total));
      currentScene = Math.min(Math.floor(progress * scenes.length), scenes.length - 1);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      mq.removeEventListener('change', onMq);
    };
  });
</script>

{#if reducedMotion}
  <!-- Static stack: each scene a full-height readable section -->
  {#each scenes as scene, i}
    <section class="relative z-10 px-6 py-20 min-h-screen" id={scene.id}>
      <h2 class="mb-4 text-3xl font-bold text-white">{labels[scene.titleKey]}</h2>
      <p class="mb-6 max-w-2xl text-slate-300">{labels[scene.descKey]}</p>
      <p class="mb-8 text-xs text-slate-500">{scene.fileRef}</p>
      <div class="mock-static">
        {@render children?.[i]?.()}
      </div>
    </section>
  {/each}
{:else}
  <!-- Scroll-jacked: tall track + sticky stage -->
  <section bind:this={sectionEl} class="relative" style={`height:${scenes.length * 100}vh;`}>
    <div class="sticky top-0 h-screen overflow-hidden">
      <!-- progress rail -->
      <div class="fixed left-0 top-0 z-40 h-screen w-1 bg-slate-800/40" aria-hidden="true">
        <div class="bg-gradient-to-b from-sky-400 via-indigo-400 to-cyan-400 transition-[height] duration-150"
             style={`height:${progress * 100}%`}></div>
      </div>
      <!-- scene dots (anchor nav) -->
      <nav class="fixed right-4 top-1/2 z-40 -translate-y-1/2 flex flex-col gap-2">
        {#each scenes as scene, i}
          <a href={`#${scene.id}`} class="h-2 w-2 rounded-full transition-colors"
             class:bg-sky-400={currentScene === i} class:bg-slate-600={currentScene !== i}
             aria-current={currentScene === i ? 'page' : undefined}
             aria-label={labels[scene.titleKey]}></a>
        {/each}
      </nav>
      <!-- per-scene mocked UI (cross-fade) -->
      {#each scenes as scene, i}
        <div class="absolute inset-0 transition-opacity duration-500"
             style={`opacity:${currentScene === i ? 1 : 0};`}>
          {@render children?.[i]?.()}
        </div>
      {/each}
    </div>
  </section>
{/if}
```

### 5.2 `MockAppShell.svelte` — device frame + sidebar + topbar

```svelte
<script lang="ts">
  import MockSidebar from './MockSidebar.svelte';
  import MockTopbar from './MockTopbar.svelte';
  import { Icon } from './icons';

  let { route, orgName, moduleName, navLinks, theme = 'dark', children } = $props();
</script>

<!-- Device frame: mocked browser window -->
<div class="mx-auto max-w-6xl rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl overflow-hidden">
  <!-- traffic lights + URL bar -->
  <div class="flex items-center gap-2 border-b border-slate-700/60 bg-slate-800/80 px-4 py-2">
    <span class="h-3 w-3 rounded-full bg-red-400"></span>
    <span class="h-3 w-3 rounded-full bg-yellow-400"></span>
    <span class="h-3 w-3 rounded-full bg-green-400"></span>
    <div class="ml-4 flex-1 rounded-md bg-slate-700/60 px-3 py-1 text-xs text-slate-400">
      primebrick.local{route}
    </div>
  </div>
  <!-- app shell: sidebar + topbar + content -->
  <div class="flex h-[560px] bg-slate-950 text-slate-200">
    <MockSidebar {orgName} {moduleName} {navLinks} {theme} />
    <div class="flex flex-1 flex-col">
      <MockTopbar {theme} />
      <div class="flex-1 overflow-auto p-4">
        {@render children?.()}
      </div>
    </div>
  </div>
</div>
```

### 5.3 `MockEntityTable.svelte` — faithful table with `highlight` prop

```svelte
<script lang="ts">
  import { Icon } from './icons';

  let { rows, columns, highlight = '', stickyCount = 1 } = $props();
  // highlight: '' | 'search' | 'filters' | 'iana' | 'columns' | 'sticky' | 'selection' | 'sorting' | 'viewmodes' | 'deletion' | 'rowactions' | 'bulk' | 'preview' | 'keyboard'
</script>

<div class="rounded-lg border border-slate-700/60 bg-slate-900">
  <!-- header: search + filter chips + column selector + view mode toggle -->
  <div class="flex items-center gap-2 border-b border-slate-700/60 p-2">
    <div class="relative flex-1">
      <Icon name="search" class="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input class="w-full rounded-md bg-slate-800 pl-8 pr-3 py-1.5 text-sm" placeholder="Search..." />
    </div>
    <button class="rounded-md px-2 py-1 text-sm" class:ring-2={highlight === 'filters'}><Icon name="filter" class="inline h-4 w-4" /> Filters</button>
    <button class="rounded-md px-2 py-1 text-sm" class:ring-2={highlight === 'columns'}><Icon name="columns3" class="inline h-4 w-4" /></button>
    <div class="flex rounded-md border border-slate-700" class:ring-2={highlight === 'viewmodes'}>
      <button class="px-2 py-1 bg-slate-800 text-xs">Table</button>
      <button class="px-2 py-1 text-xs">Cards</button>
      <button class="px-2 py-1 text-xs">List</button>
    </div>
  </div>
  <!-- table -->
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-slate-700/60 text-left text-xs text-slate-400">
        <th class="w-8 p-2"><input type="checkbox" /></th>
        {#each columns as col, i}
          <th class="p-2" class:sticky={i < stickyCount} class:left-0={i < stickyCount}
              class:bg-slate-800={i < stickyCount} class:ring-2={highlight === 'iana' && col.type === 'datetime'}>
            {col.label}
            {#if col.type === 'datetime'}<button class="ml-1 text-[10px]">Browser</button>{/if}
          </th>
        {/each}
        <th class="p-2">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr class="border-b border-slate-800/60 hover:bg-slate-800/40">
          <td class="p-2"><input type="checkbox" /></td>
          {#each columns as col, i}
            <td class="p-2" class:sticky={i < stickyCount} class:left-0={i < stickyCount}
                class:bg-slate-900={i < stickyCount}
                class:ring-2={highlight === 'iana' && col.type === 'datetime'}
                class:text-amber-300={highlight === 'iana' && col.type === 'datetime'}>
              {#if col.type === 'datetime' && highlight === 'iana'}
                <span class="rounded border border-amber-300/90 bg-amber-100/20 px-1 text-amber-200">{row[col.key]}</span>
              {:else}
                {row[col.key]}
              {/if}
            </td>
          {/each}
          <td class="p-2 flex gap-1">
            <button class:ring-2={highlight === 'rowactions'}><Icon name="pencil" class="h-4 w-4" /></button>
            <button><Icon name="eye" class="h-4 w-4" /></button>
            <button><Icon name="trash" class="h-4 w-4" /></button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

### 5.4 `demo/shell.astro` frontmatter (mirrors thank-you.astro)

```astro
---
import { getStaticPaths, LANGUAGES, translations } from '../../i18n/translations';
import DemoShellScroll from '../../components/svelte/demo/DemoShellScroll.svelte';

export const prerender = true;

export const getStaticPaths = () =>
  LANGUAGES.map((lang) => ({ params: { lang } }));

const { lang } = Astro.params;
const langCode = lang ?? 'en';
const t = translations[langCode] ?? translations.en;
const isEn = langCode === 'en';
const docsPath = isEn ? '/en/docs' : `/${langCode}/docs`;
const contactHref = isEn ? '/en/contact' : `/${langCode}/contact`;
const homeHref = isEn ? '/en/' : `/${langCode}/`;
const demoHref = isEn ? '/en/demo' : `/${langCode}/demo`;
const thankyouHref = isEn ? '/en/thank-you' : `/${langCode}/thank-you`;

const SCENES = [
  { id: 'assemble', titleKey: 'demo.shell.assemble.title', descKey: 'demo.shell.assemble.desc', fileRef: 'AppShell.svelte — src/lib/components/' },
  { id: 'org-switcher', titleKey: 'demo.shell.orgSwitcher.title', descKey: 'demo.shell.orgSwitcher.desc', fileRef: 'SidebarOrgSwitcher.svelte — src/lib/components/' },
  { id: 'module-switcher', titleKey: 'demo.shell.moduleSwitcher.title', descKey: 'demo.shell.moduleSwitcher.desc', fileRef: 'SidebarModuleSwitcher.svelte + modules-shell.svelte.ts' },
  { id: 'command-palette', titleKey: 'demo.shell.commandPalette.title', descKey: 'demo.shell.commandPalette.desc', fileRef: 'CommandPalette.svelte — src/lib/components/' },
  { id: 'iana-lang', titleKey: 'demo.shell.ianaLang.title', descKey: 'demo.shell.ianaLang.desc', fileRef: 'AppTopbar.svelte + LangSelect.svelte' },
  { id: 'theme-toggle', titleKey: 'demo.shell.themeToggle.title', descKey: 'demo.shell.themeToggle.desc', fileRef: 'ThemeToggle.svelte — src/lib/components/' },
  { id: 'health-badge', titleKey: 'demo.shell.healthBadge.title', descKey: 'demo.shell.healthBadge.desc', fileRef: 'SidebarHealthBadge.svelte — src/lib/components/' },
  { id: 'version-badge', titleKey: 'demo.shell.versionBadge.title', descKey: 'demo.shell.versionBadge.desc', fileRef: 'SidebarVersionBadge.svelte — src/lib/components/' },
];
---
<!-- inline nav, ambient bg, footer (mirror thank-you.astro) -->
<DemoShellScroll scenes={SCENES} labels={t.demo.shell} client:load />
```

### 5.5 `icons.ts` — inline Lucide SVG path map + `Icon` helper

```ts
// Lucide icons are MIT-licensed — inline only the paths we use (no @lucide/svelte dep).
export const ICON_PATHS: Record<string, string> = {
  messageSquare: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  triangleAlert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  shieldCheck: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M9 12l2 2 4-4',
  keyRound: 'M2 12a10 10 0 1 1 20 0 10 10 0 0 1-20 0z', // simplified
  circleX: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M15 9l-6 6 M9 9l6 6',
  alertCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 8v4 M12 16h.01',
  circleCheckBig: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9 12l2 2 4-4',
  alertTriangle: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
  fileText: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z M14 2v5h5 M16 13H8 M16 17H8 M10 9H8',
  send: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z M21.854 2.147l-10.94 10.939',
  thumbsUp: 'M7 10v12 M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z',
  thumbsDown: 'M17 14V2 M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z',
  columns3: 'M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z M9 22V2 M15 22V2',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
  chevronDown: 'm6 9 6 6 6-6',
  pencil: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
  eye: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0 M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
};

// Svelte 5 snippet render helper
export const Icon = (name: string, extraClass = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${extraClass}"><path d="${ICON_PATHS[name] ?? ''}" /></svg>`;
```

> In practice the `Icon` helper is a Svelte 5 snippet/component that renders the
> inline SVG; the sketch above shows the data map + a string-returning helper
> for illustration. The real implementation exports a Svelte component
> `<Icon name="..." class="..." />`.

## 6. i18n additions

Add a `demo` block to ALL 6 langs in `src/i18n/translations.ts`:

- `nav.demo` (e.g. EN `'Demo'`, IT `'Demo'`, DE `'Demo'`, ES `'Demo'`, PT
  `'Demo'`, FR `'Démo'`).
- `demo.hub.{badge, title, subtitle, introTagline}`.
- `demo.hub.cards.{shell, entities, exports, aiChat, security, versionsErrors,
  modules, collab, agentic}.{title, desc, href}`.
- Per-page blocks: `demo.shell.*`, `demo.entities.*`, `demo.exports.*`,
  `demo.aiChat.*`, `demo.security.*`, `demo.versionsErrors.*`, `demo.modules.*`
  (scene titles + descriptions + annotation text + UI mock labels like
  "Search...", "Filters", "Columns", "Export", "Verify and Authorize",
  "Browser"/"Record").
- EN is the source of truth; IT/DE/ES/PT/FR are properly translated equivalents
  (the site is fully translated — provide real translations, not placeholders).

### 6.1 i18n addition sketch (EN shown)

```ts
nav: { ..., demo: 'Demo' },
demo: {
  hub: {
    badge: 'Primebrick in Motion',
    title: 'See Primebrick in Motion',
    subtitle: 'A scroll-driven tour of the real backoffice — every screen you see is a faithful animated replica of the actual product.',
    introTagline: 'Scroll to explore. Every scene cites the real component it replicates.',
    cards: {
      shell: { title: 'The Shell', desc: 'App shell anatomy: sidebar, topbar, command palette, IANA, theme, health, versions.', href: '/en/demo/shell' },
      entities: { title: 'The Entity List Table', desc: 'The flagship: search, filters, IANA datetime, columns, selection, bulk, CRUD, exports.', href: '/en/demo/entities' },
      exports: { title: 'Exports', desc: 'XLSX/CSV, HTML, PDF, email-optimized — with live preview dock.', href: '/en/demo/exports' },
      aiChat: { title: 'AI Chat, Private by Design', desc: 'SSE streaming, tool citations, client-tool confirmation — LLM in your infra.', href: '/en/demo/ai-chat' },
      security: { title: 'Security & Step-Up', desc: 'Passkeys (Face ID/Touch ID/Windows Hello) + MFA step-up for critical actions.', href: '/en/demo/security' },
      versionsErrors: { title: 'Version History & Errors', desc: 'Audit timeline with delta diffs + RFC7807-aware error panel.', href: '/en/demo/versions-errors' },
      modules: { title: 'Modular Bricks', desc: 'Modules self-register via NATS — add features without forking.', href: '/en/demo/modules' },
      collab: { title: 'Preview: Real-time Collaboration', desc: 'Upcoming UX — presence, field-level merge, conflict resolution.', href: '/en/demo/collab' },
      agentic: { title: 'Preview: Agentic Development', desc: 'Upcoming UX — plan, approve, build, deploy.', href: '/en/demo/agentic' },
    },
  },
  shell: { /* scene titles + descs + labels */ },
  entities: { /* ... */ },
  // ... per-page blocks
},
```

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Scroll-jacking a11y | `prefers-reduced-motion: reduce` → static stack on every page (implement FIRST). |
| Mobile `100dvh` | Use `100dvh` with `100vh` fallback for sticky stage. |
| Mocked UI fidelity vs real FE | Use real color tokens (HSL CSS vars), real layout structure, real component names in citations. Visually compare against real FE during Phase 8. |
| Perf of many mocked DOM nodes per scene | Keep scenes lightweight; recycle `MockAppShell` across scenes — only swap content. `will-change: transform, opacity`. |
| File size | Split per page + shared mock kit (already the design). |
| Reduced-motion MUST work | Implement FIRST in Phase 2; verify in Phase 8 with devtools emulation. |
| `scroll-behavior: smooth` conflict | No global smooth scroll; only on anchor jumps. |
| Track height tuning per page | `height = scenes.length * 100vh`; tune per page if pacing feels off. |
| Honesty about not-yet-implemented features | Collab + agentic marked "Preview of upcoming UX" OR excluded — never presented as existing UI. |
| No `bits-ui` / `@lucide/svelte` in website repo | Hand-build all mocked UI with Tailwind + inline SVG (Lucide paths MIT-licensed, inlined in `icons.ts`). |

## 8. Rules compliance checklist

- [x] `export const prerender = true` on every new page (astro-conventions).
- [x] No `fs` / `child_process` / `node:path` in SSR code — Svelte islands run
      client-side only (astro-conventions).
- [x] kebab-case filenames for Astro pages (`demo/index.astro`, `shell.astro`,
      etc.); PascalCase for Svelte components (existing convention).
- [x] Svelte for interactivity, Astro for static content (astro-conventions).
- [x] Tailwind CSS 4 only, no CSS-in-JS (astro-conventions).
- [x] No new dependencies — inline SVG icon map instead of `@lucide/svelte`;
      hand-built mocks instead of `bits-ui` (astro-conventions +
      package-versioning).
- [x] No dev server started during planning (dev-server rule). Phase 8 checks
      port 4321 first, never kills existing.
- [x] No commits made (AGENTS.md: never commit automatically).
- [x] Plan file in `primebrick-workspace/ai-plans/` (workflow rule).
- [x] No temporary files created in any project repo (temp-files rule).
- [x] GitFlow respected — work on a `feature/*` branch from `develop`, never on
      `main` (gitflow rule).
- [x] `prefers-reduced-motion` honored for accessibility on every demo page.
- [x] `aria-current="page"` on active nav; semantic `<h2>` per scene.
- [x] hreflang alternate link tags on new + existing pages.
- [x] Inline SVG icon map covers all icons used; no external icon dep added.

## 9. Acceptance criteria

1. `pnpm run build` succeeds with 0 errors.
2. `pnpm run check` passes with 0 type errors.
3. `/en/demo` hub + all themed pages prerender in all 6 langs (verify
   `dist/en/demo/index.html`, `dist/en/demo/shell/index.html`, etc.).
4. `prefers-reduced-motion: reduce` renders a fully-readable static stack on
   EVERY demo page (mocked UI static + annotation text + file citation) —
   verify with devtools emulation.
5. Mocked UI faithfully replicates the real FE look (sidebar with org/module
   switchers + dynamic nav, topbar with all 8 elements, EntityListTable with
   all features, sheets slide in right-side, dialogs centered) — visually
   compare against real FE.
6. Scroll-jacking smooth (no jank) on Chrome (passive listeners + GPU
   transforms).
7. Every demo scene cites the real component/file path it replicates (e.g.
   "EntityListTable.svelte — src/lib/components/entity-list-table/").
8. Lighthouse Performance ≥ 90 on each demo page (target).
9. Nav "Demo" link on index/contact/thank-you in all 6 langs; `_redirects` has
   `/demo /en/demo 302`; no new deps; kebab-case; `export const prerender =
   true`; hreflang; `aria-current="page"`.
10. NOT-implemented features (collab, agentic) are either excluded OR clearly
    marked "Preview of upcoming UX" — never presented as existing UI
    (honesty/empiricism).
11. Inline SVG icon map covers all icons used; no external icon dep added.

## 10. Out of scope / future enhancements

- Real screenshots / video captures of the live backoffice (mocked UI is
  hand-built for animation; real captures would be static).
- Interactive demos (clickable mocked UI that actually does something) — these
  are scroll-driven cinematic tours, not functional sandboxes.
- Auto-generating demo scenes from FE component metadata at build time.
- Splitting `/demo/entities` into `/demo/entities` + `/demo/entities-actions`
  (deferred to Phase 6 based on measured perf).

## 11. Implementation phasing (after PROCEED)

Atomic, lint-checked, max 2 self-correction attempts per step, halt on failure
per code-guardrails.

- **Phase 1 — i18n**: Add `demo` block + `nav.demo` to all 6 langs in
  `translations.ts`. `pnpm run check`.
- **Phase 2 — Shared mock kit**: `demo/icons.ts` + `MockAppShell` +
  `MockSidebar` + `MockTopbar` + `MockSheet` + `MockDialog` + `MockEntityTable`
  + `DemoScrollBase` (with reduced-motion static stack). `pnpm run check` +
  `pnpm run build`.
- **Phase 3 — Hub page**: `demo/index.astro` wiring nav + hero + cards.
  `pnpm run check` + `pnpm run build`.
- **Phase 4 — First themed demo**: `demo/shell.astro` + `DemoShellScroll.svelte`
  (8 scenes). `pnpm run check` + `pnpm run build`.
- **Phase 5 — Nav links + redirects**: Add Demo nav to index/contact/thank-you +
  hreflang + `_redirects`. `pnpm run check` + `pnpm run build`.
- **Phase 6 — Remaining themed demos (one at a time)**: entities (split if
  needed), exports, ai-chat, security, versions-errors, modules. `pnpm run
  build` after each.
- **Phase 7 — OPTIONAL collab + agentic preview pages** (if user approves).
  `pnpm run build`.
- **Phase 8 — Manual verification**: Dev server on 4321 ONLY if not already
  running (dev-server rule: check port 4321 first, never kill existing).
  Verify reduced-motion, fidelity vs real FE, cross-browser smoothness (at
  least Chrome), Lighthouse ≥ 90. Report results. **Do NOT commit** — wait for
  explicit instruction.

> **Status: DRAFT — awaiting user approval (keyword `PROCEED`)**
