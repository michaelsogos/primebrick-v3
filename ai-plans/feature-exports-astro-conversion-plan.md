# Feature: Exports Demo — Direct Astro Conversion

## Objective

Convert the `exports.html` scroll-driven demo directly into an Astro page, following the established patterns from `shell.astro` and `entity-list-table.astro`. This is the first demo built directly in Astro (no HTML prototype phase), leveraging HMR for rapid iteration.

## Analysis of the Source Demo

### Current `exports.html` structure (167 lines)

The exports demo uses a **scene-based cross-fade** animation pattern — fundamentally different from the shell and entity-list-table demos which use **scroll-jacking with progressive disassembly**.

**6 scenes** (600vh scroll track) — updated to match real FE:
1. **Scene 0 — Export buttons**: Mock app with sidebar, topbar, toolbar (search + two export buttons: "Esporta" and "Esporta HTML" with `feature-highlight` pulse), table with realistic columns (UUID, Code, Name)
2. **Scene 1 — Export dialog (XLSX/CSV)**: Same mock app (blurred), warning-bordered dialog with Choicebox scope selection (selected vs all), Cancel + Excel + CSV buttons
3. **Scene 2 — Export in progress**: Same mock app (blurred), dialog with API URL (`/api/v1/entities/customers/export?file_type=xlsx&filters[0][field]=...`), progress bar (70%, `flow-dash` animation), disabled "Exporting..." button
4. **Scene 3 — HTML export confirm**: Same mock app (blurred), simple warning-bordered confirm dialog ("Genera anteprima HTML per N Clienti?"), Cancel + Conferma buttons
5. **Scene 4 — Preview dock (HTML mode)**: Same mock app (blurred), near-fullscreen (95vw × 95vh) preview dialog with macOS-style Dock (HTML/PDF/Email icons with magnification), iframe showing generated HTML table
6. **Scene 5 — Email preview**: Same mock app (blurred), same preview dialog in email mode — Resizable.PaneGroup with mailbox sidebar (skeleton loading) + email content (To/Subject header + iframe)

### Animation mechanism
- `scroll.js` → `initScrollDemo()` — generic scene cross-fade engine
- Each scene is `position: absolute; inset: 0` with `opacity: 0` → `opacity: 1` on `.active`
- Scenes are in a 2-column grid: `1fr 340px` (device frame left, annotation right)
- Progress rail + scene dots (already in `demo.css`)
- No SVG connectors, no progressive disassembly, no section claims

### Key differences from existing Astro demos
| Aspect | Shell / Entity List Table | Exports HTML |
|--------|--------------------------|--------------|
| Animation | Scroll-jacking, progressive disassembly | Scene cross-fade |
| Scroll engine | Custom per-page (~2000 lines) | Generic `initScrollDemo()` (136 lines) |
| Annotations | `ann-label` cards with SVG connector lines | `annotation` panel (right-side card) |
| Section claims | Yes (alternating left/right) | No |
| Phase labels | Yes | No |
| Mock UI | Full PB design system (pb-table, pb-sidebar, etc.) | Simpler mock-* classes (mock-app, mock-dialog, etc.) |
| Scroll track height | 2000vh-3200vh | 600vh |

## Real FE Verification (Playwright + Source Code)

Captured the real `/customers` page on `localhost:5173` (FE dev server) and read the actual Svelte source code. The HTML mockup in `exports.html` has several **inaccuracies** vs the real product that MUST be corrected in the Astro demo:

### Real Export Dialog (`ExportDialog.svelte`)
- **Dialog title**: "Esporta dati" (not "Export Confirm")
- **Description**: "Vuoi esportare N Clienti?" (dynamic count + entity plural)
- **Scope selection**: Uses **Choicebox** component (radio-card style with title + description + indicator), NOT checkboxes. Only shown when `selectedCount > 0`.
- **Buttons**: Cancel (secondary-outline) + "Esporta in Excel" (warning, XLSX icon) + "Esporta in CSV" (warning, CSV icon)
- **Dialog border**: `severity="warning"` (amber/warning border)
- **Max width**: `sm:max-w-md` (compact, ~448px)

### Real HtmlExport Dialog (`HtmlExportDialog.svelte`)
- **Dialog title**: "Esporta HTML" (not "HTML Export")
- **Description**: "Genera anteprima HTML per N Clienti?" (dynamic count)
- **NO scope selection** — simple confirm dialog
- **Buttons**: Cancel + Conferma (warning)
- **Dialog border**: `severity="warning"`

### Real Export Preview Dialog (`ExportPreviewDialog.svelte`)
- **Dialog title**: "Anteprima HTML"
- **Size**: `95vw × 95vh` (near-fullscreen, NOT a small modal)
- **Mode switcher**: **macOS-style Dock** with magnification effect (not simple tab buttons)
  - 3 dock icons: HTML (filetype-html), PDF (filetype-pdf), Email (envelope-at)
  - Dock has `magnification={70}` and `distance={120}` — icons magnify on hover
  - Dock is positioned `absolute -top-12 left-1/2 -translate-x-1/2` (floating above content)
- **HTML mode**: Full iframe with `srcdoc` (the generated HTML document)
- **PDF mode**: iframe with `pdfBlobUrl` (generated client-side via PDF worker)
- **Email mode**: **Resizable.PaneGroup** (horizontal split):
  - Left pane (30%): Mailbox sidebar with `ScrollArea`, skeleton loading items, "Mailbox" heading
  - Right pane (70%): Email header (To: recipient@example.com, Subject: skeleton) + iframe with `emailHtmlContent`
- **Footer**: Close + context-specific action button:
  - HTML mode: "Copia HTML" (Copy HTML)
  - PDF mode: "Scarica PDF" (Download PDF)
  - Email mode: "Copy HTML to Clipboard" (with "Copied!" state)

### Real Toolbar (`BulkActionsToolbar.svelte`)
- Two export buttons in the bulk actions toolbar:
  1. "Esporta" (Download icon) → opens ExportDialog (XLSX/CSV)
  2. "Esporta HTML" (Download icon) → opens HtmlExportDialog (HTML preview)
- Both buttons: `variant="soft" tone="primary" size="xs"`
- Toolbar has a toggle between "filters" mode and "bulk" mode (ListCheck/Funnel icon)

### Real API URL pattern (`useExport.svelte.ts`)
```
GET /api/v1/entities/${entity}/export?file_type=xlsx&filters[0][field]=status&filters[0][op]==&filters[0][value]=Active&filters[0][connector]=AND
```
- Uses `URLSearchParams` to build query string
- Selected keys sent via `filters[N][field]=uid&filters[N][op]=IN&filters[N][value][]=key1&filters[N][value][]=key2`
- Response is a `blob()` → `createObjectURL` → `<a download>` click

### Discrepancies to fix in the Astro demo (vs the HTML mockup)
| # | HTML mockup | Real FE | Fix |
|---|------------|---------|-----|
| 1 | "Export Confirm" title | "Esporta dati" / "Export Data" | Use real dialog title |
| 2 | Checkbox scope selection | Choicebox (radio-card) | Use choicebox-style cards |
| 3 | Scope always shown | Scope only when selectedCount > 0 | Show scope only with selection |
| 4 | CSV + Excel buttons (no Cancel) | Cancel + Excel + CSV | Add Cancel button |
| 5 | Simple tab buttons for modes | macOS-style Dock with magnification | Mock the dock with CSS magnification |
| 6 | Small modal for preview | 95vw × 95vh near-fullscreen | Use near-fullscreen preview |
| 7 | Static mailbox sidebar | Resizable.PaneGroup with skeletons | Mock resizable split with skeletons |
| 8 | "HTML Export" as separate scene | HtmlExportDialog is a simple confirm | Merge HTML export into the flow correctly |
| 9 | Mock table with Name/Email/Status | Real table has UUID/Code/Name/etc. | Use realistic column names |
| 10 | `mock-*` CSS classes | PB design system | Use `pb-*` classes from demo.css |

## Design Decision: Upgrade to Established Pattern

The exports demo is simpler and less polished than the shell and entity-list-table demos. Rather than a 1:1 port, we should **upgrade it to match the established pattern** while keeping the same content/story:

### What to keep from the original
- The 6-scene story (export button → dialog → progress → HTML → preview → email)
- The mock app UI (sidebar, topbar, toolbar, table)
- The dialog content (scope selection, progress bar, preview modes)
- The annotation text and file references

### What to upgrade (DRY + pattern alignment)
1. **Use `DemoHero` component** — badge + gradient h1 + subtitle (same as shell and entity-list-table)
2. **Use PB design system classes** from `demo.css` — `screen-mock`, `browser-bar`, `pb-sidebar`, `pb-table`, `pb-badge`, `pb-btn`, `pb-checkbox` instead of the simpler `mock-*` classes
3. **Use `ann-label` annotation system** with SVG connector lines (same as entity-list-table) instead of the static `annotation` panel
4. **Use `section-claim` pattern** for scene transitions (same as entity-list-table)
5. **Use `phase-label`** to show current scene name
6. **Use `fadeScrollHint`** for the scroll hint
7. **Use shared helpers from `demo-utils.ts`** — `lerp`, `clamp01`, `smoothstep`, `buildSceneDots`, `fadeScrollHint`
8. **Add i18n** — all text in 6 languages via `exports-translations.ts`

### What to add (improvements)
- **Sub-scene animations**: Instead of simple cross-fade, add progressive reveal within each scene (e.g., dialog slides in, progress bar fills, preview tabs switch)
- **SVG connectors**: Draw connector lines from annotations to the mocked UI elements
- **Scene dots**: Clickable navigation dots (already shared in `demo.css`)

## Architecture

### DRY Prerequisite: Extract shared PB design system CSS + MockAppShell component

Before building the exports demo, we need to extract the shared PB design system CSS and mock app shell that are currently duplicated between `shell.css`/`shell.astro` and `entity-list-table.css`/`entity-list-table.astro`.

**Problem**: 
- `entity-list-table.css` has 100 `pb-*` class definitions (838 lines total)
- `shell.css` has 49 `pb-*` class definitions (548 lines total) — many are duplicates
- Both demos have inline mock app shell HTML (sidebar + topbar + content area) with the same structure
- The exports demo needs the same mock app shell and CSS classes

**Solution**: Two-phase DRY extraction:

#### Phase 0A: Extract shared PB CSS to `demo.css`

Move all shared `pb-*` classes from `shell.css` and `entity-list-table.css` into `demo.css`:
- `.pb-sidebar` + variants (rail avatar, rail icon, rail profile, rail health)
- `.pb-header-*` (header left, toggle, search, right, tz, lang, btn, ai-cta)
- `.pb-content` + `.pb-breadcrumb` + `.pb-page-title`
- `.pb-toolbar` + `.pb-search-input` + `.pb-search-scope`
- `.pb-btn-soft` + `.pb-btn-soft-icon` + `.pb-btn-outline` + `.pb-btn-soft-xs` + `.pb-btn-primary` + `.pb-btn-primary-gradient`
- `.pb-table` + `.pb-table-wrap` + `.pb-table th/td` + sticky-col + sorted + selected + deleted + hover
- `.pb-checkbox` + `.pb-checkbox.checked`
- `.pb-badge` + variants (green, amber, gray, iana)
- `.pb-badge-cell` + variants
- `.pb-row-actions` + `.act-btn`
- `.pb-filter-badge` + `.pb-filter-chips` + `.pb-chip`
- `.pb-view-toggle` + `.vt-btn`
- `.pb-pagination` + `.pag-controls`
- `.pb-toolbar-second`
- `.pb-content-footer` + `.pb-content-footer-audit` + `.pb-content-footer-actions`
- `.pb-version-badge` + `.pb-audit-grid` + `.pb-audit-label` + `.pb-audit-value`

**Keep in `shell.css`**: Shell-specific overrides only (sidebar width 255px, expanded sidebar nav, command palette, health badge details)
**Keep in `entity-list-table.css`**: Entity-list-table-specific overrides only (sidebar width 56px, card view, advanced filters, column selector, preview panel, deleted records)

**Verification**: After extraction, `pnpm run build` must succeed and both shell and entity-list-table pages must render identically (no visual change).

#### Phase 0B: Create `MockAppShell.astro` component

**New file:** `src/components/astro/MockAppShell.astro`

A reusable mock app shell with sidebar + topbar + content area, using named slots for demo-specific content:

```astro
---
interface Props {
  sidebarWidth?: string;        // '56px' (collapsed) | '255px' (expanded) | '180px' (exports)
  orgName?: string;             // 'ACME Test' | 'Acme'
  moduleName?: string;          // 'CRM' | 'EMAILSENDER'
  moduleIcon?: string;          // icon path for module
  pageTitle?: string;           // 'Gestione Clienti' | 'Customers'
  breadcrumb?: string;          // 'CRM' | etc.
  urlBar?: string;              // 'app.primebrick.io/customers'
  blurred?: boolean;            // blur content (for dialog overlay scenes)
  idPrefix?: string;            // 'src' | 'ex' | '' — prefix for IDs to avoid collisions
}
const {
  sidebarWidth = '56px',
  orgName = 'ACME',
  moduleName = 'CRM',
  moduleIcon = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  pageTitle = '',
  breadcrumb = '',
  urlBar = 'app.primebrick.io/customers',
  blurred = false,
  idPrefix = '',
} = Astro.props;
---
<div class="device-frame">
  <div class="device-bar">
    <div class="device-dots">
      <span class="device-dot red"></span>
      <span class="device-dot yellow"></span>
      <span class="device-dot green"></span>
    </div>
    <div class="device-url">{urlBar}</div>
  </div>
  <div class="mock-app" style={blurred ? 'position:relative' : undefined}>
    <!-- Sidebar -->
    <div class="pb-sidebar" style={`width:${sidebarWidth}`}>
      <div class="sb-rail-avatar">{orgName.slice(0, 2).toUpperCase()}</div>
      <div class="sb-rail-icon active"><svg ...>{moduleIcon}</svg></div>
      <!-- ... -->
    </div>
    <!-- Main area -->
    <div style="display:flex;flex-direction:column;flex:1;min-width:0">
      <!-- Topbar -->
      <div class="pb-topbar">
        <div class="pb-header-left">
          <div class="pb-header-toggle">...</div>
          <div class="pb-header-search">...</div>
        </div>
        <div class="pb-header-right">
          <div class="pb-header-tz">Europe/Rome</div>
          <div class="pb-header-lang">IT</div>
          <!-- ... -->
        </div>
      </div>
      <!-- Content (slot) -->
      <div class="pb-content" style={blurred ? 'filter:blur(1px);opacity:0.4' : undefined}>
        {pageTitle && <h1 class="pb-page-title">{pageTitle}</h1>}
        <slot name="toolbar" />
        <slot name="content" />
      </div>
    </div>
    <!-- Dialog overlay slot (for dialog scenes) -->
    <slot name="dialog" />
  </div>
</div>
```

**Usage in exports.astro**:
```astro
<!-- Scene 0: Export buttons (no dialog) -->
<MockAppShell pageTitle="Customers" sidebarWidth="180px" urlBar="app.primebrick.io/customers">
  <slot name="toolbar">
    <div class="pb-toolbar">
      <div class="pb-search-input">...</div>
      <button class="pb-btn-soft-xs feature-highlight">
        <svg>...</svg> {et.mockExport}
      </button>
      <button class="pb-btn-soft-xs">
        <svg>...</svg> {et.mockExportHtml}
      </button>
    </div>
  </slot>
  <slot name="content">
    <div class="pb-table-wrap">
      <table class="pb-table">...</table>
    </div>
  </slot>
</MockAppShell>

<!-- Scene 1: Export dialog (blurred content + dialog overlay) -->
<MockAppShell pageTitle="Customers" sidebarWidth="180px" blurred={true}>
  <slot name="dialog">
    <div class="export-dialog-backdrop open">
      <div class="export-dialog export-dialog-warning">
        <div class="export-dialog-header">
          <div class="export-dialog-title">{et.mockExportDataTitle}</div>
          <div class="export-dialog-desc">{et.mockExportQuestion}</div>
        </div>
        <div class="export-dialog-body">
          <div class="export-choicebox">...</div>
        </div>
        <div class="export-dialog-footer">
          <button class="pb-btn-outline">{et.mockCancel}</button>
          <button class="pb-btn-soft-xs">{et.mockExportExcel}</button>
          <button class="pb-btn-soft-xs">{et.mockExportCsv}</button>
        </div>
      </div>
    </div>
  </slot>
</MockAppShell>
```

**Refactor existing demos**: After creating MockAppShell, refactor `shell.astro` and `entity-list-table.astro` to use it. This is optional but recommended for maximum DRY. The entity-list-table refactor is more complex due to its scroll engine IDs — the `idPrefix` prop handles this.

### New files to create
1. `src/components/astro/MockAppShell.astro` — Reusable mock app shell (Phase 0B)
2. `src/pages/[lang]/demo/exports.astro` — The Astro page
3. `src/scripts/demo/exports-scroll.ts` — Scroll engine (scene-based, imports from demo-utils)
4. `src/styles/demo/exports.css` — Exports-specific CSS (dialog styles, preview dock, progress bar)
5. `src/i18n/exports-translations.ts` — All text in 6 languages

### Files to modify
1. `src/styles/demo/demo.css` — Add shared `pb-*` classes extracted from shell.css and entity-list-table.css (Phase 0A)
2. `src/styles/demo/shell.css` — Remove `pb-*` classes that moved to demo.css, keep only shell-specific overrides (Phase 0A)
3. `src/styles/demo/entity-list-table.css` — Remove `pb-*` classes that moved to demo.css, keep only entity-list-table-specific overrides (Phase 0A)
4. `src/components/svelte/VirtualTourMegaMenu.svelte` — Enable exports link (href: null → real href), add `'exports'` to activeDemo type
5. `src/pages/[lang]/demo/index.astro` — Enable exports card (remove `coming-soon`, add real href)
6. `src/pages/[lang]/demo/shell.astro` — (Optional) Refactor to use MockAppShell
7. `src/pages/[lang]/demo/entity-list-table.astro` — (Optional) Refactor to use MockAppShell

### Reusable components (already exist)
- `DemoHero.astro` — hero section
- `demo.css` — shared scroll-jacking infrastructure, PB design system (after Phase 0A), annotations, connectors
- `demo-utils.ts` — shared helpers
- `icons.ts` — all required icons already exist (download, fileText, fileTypeCsv, fileTypeXlsx, fileTypeHtml, fileTypePdf, envelope, copy, panelLeft, users, search)

## Detailed Implementation Plan

### Phase 0A: Extract shared PB CSS to `demo.css`

**File:** `src/styles/demo/demo.css` (add), `src/styles/demo/shell.css` (trim), `src/styles/demo/entity-list-table.css` (trim)

1. Identify all `pb-*` class definitions that appear in BOTH shell.css and entity-list-table.css (duplicates)
2. Identify `pb-*` classes that appear only in entity-list-table.css but are generic enough to be shared (e.g., `.pb-checkbox`, `.pb-badge`, `.pb-row-actions`, `.pb-pagination`, `.pb-filter-badge`, `.pb-view-toggle`)
3. Move all shared `pb-*` classes to `demo.css` (after the existing scroll-jacking infrastructure section)
4. Remove the moved classes from `shell.css` and `entity-list-table.css`
5. Keep demo-specific overrides in their respective CSS files (e.g., sidebar width, card view, advanced filters)
6. Run `pnpm run build` — must succeed with no errors
7. Verify shell.astro and entity-list-table.astro render identically (no visual change)

**Risk**: This is a pure CSS refactor — no HTML/JS changes. The risk is low but must be verified visually.

### Phase 0B: Create `MockAppShell.astro` component

**New file:** `src/components/astro/MockAppShell.astro`

1. Create the component with props: `sidebarWidth`, `orgName`, `moduleName`, `moduleIcon`, `pageTitle`, `breadcrumb`, `urlBar`, `blurred`, `idPrefix`
2. Include named slots: `toolbar`, `content`, `dialog`
3. Render the device frame + mock app shell (sidebar + topbar + content area)
4. When `blurred={true}`, apply `filter:blur(1px);opacity:0.4` to content area (for dialog overlay scenes)
5. The `dialog` slot renders on top of the mock app (for dialog/modal scenes)
6. Run `pnpm run build` — must succeed

**Note**: Refactoring shell.astro and entity-list-table.astro to use MockAppShell is OPTIONAL and can be done in a follow-up. The exports demo will use it from the start.

### Phase 1: Create `exports-translations.ts`

**File:** `src/i18n/exports-translations.ts`

Structure (same as `entity-list-table-translations.ts`):
```typescript
export const exportsTranslations = {
  en: {
    pageBadge: 'Scroll-Jacking Demo',
    pageTitle: 'Exports',
    pageSubtitle: 'XLSX, CSV, HTML, PDF, and email-optimized exports with live preview dock and scope selection',
    scrollHint: '↓ Scroll to control the animation',
    footerCopyright: '© 2026 Primebrick',
    // Phase labels (6 scenes)
    phase0: 'Export Button',
    phase1: 'Export Dialog',
    phase2: 'Export in Progress',
    phase3: 'HTML Export',
    phase4: 'Preview Dock',
    phase5: 'Email Preview',
    // Section claims (6)
    claim0Eyebrow: 'The Entry Point',
    claim0Title: 'One button,<br>every format.',
    claim0Subtitle: 'Export lives in the bulk actions toolbar and the header actions — always one click away.',
    // ... claims 1-5
    // Annotations (6 — one per scene)
    ann0Title: 'Export button',
    ann0Desc: 'Export button in the bulk actions toolbar + header actions. Available in both the toolbar and the entity header.',
    ann0File: 'BulkActionsToolbar + EntityListTableHeader',
    // ... annotations 1-5
    // Mock UI text (matching real FE dialog text)
    mockSearch: 'Search...',
    mockExport: 'Export',           // "Esporta" button
    mockExportHtml: 'Export HTML',  // "Esporta HTML" button
    // Export dialog (XLSX/CSV)
    mockExportDataTitle: 'Export Data',           // "Esporta dati"
    mockExportQuestion: 'Export 3 customers?',     // "Vuoi esportare 3 Clienti?"
    mockSelectedOnly: 'Only 3 selected items',    // "Solo i 3 elementi selezionati"
    mockSelectedOnlyDesc: 'Export just the selected rows',
    mockAllItems: 'All 247 items',                // "Tutti i 247 elementi"
    mockAllItemsDesc: 'Export all (with current filters)',
    mockCancel: 'Cancel',
    mockExportExcel: 'Export to Excel',           // "Esporta in Excel"
    mockExportCsv: 'Export to CSV',               // "Esporta in CSV"
    mockExporting: 'Exporting...',
    mockExportingDesc: 'Building your export with current filters',
    // HTML export confirm dialog
    mockHtmlExportTitle: 'Export HTML',           // "Esporta HTML"
    mockHtmlExportQuestion: 'Generate HTML preview for 3 customers?',
    mockConfirm: 'Confirm',                       // "Conferma"
    // Export preview dialog
    mockHtmlPreviewTitle: 'HTML Preview',         // "Anteprima HTML"
    mockClose: 'Close',
    mockCopyHtml: 'Copy HTML',
    mockCopyEmailHtml: 'Copy HTML to Clipboard',
    mockCopied: 'Copied!',
    mockDownloadPdf: 'Download PDF',
    mockGeneratingPdf: 'Generating PDF...',
    mockPreparingEmail: 'Preparing email HTML...',
    // Email preview
    mockMailbox: 'Mailbox',
    mockTo: 'To:',
    mockRecipient: 'recipient@example.com',
    mockSubject: 'Subject:',
    // Table data (realistic columns from FE)
    tableUuid: 'UUID',
    tableCode: 'Code',
    tableName: 'Name',
    // ... repeat for it, de, es, pt, fr
  },
  // ... it, de, es, pt, fr
};
export type ExportsLang = keyof typeof exportsTranslations;
export type ExportsTranslationKey = keyof typeof exportsTranslations['en'];
```

### Phase 2: Create `exports.css`

**File:** `src/styles/demo/exports.css`

Exports-specific styles only (shared infrastructure is in `demo.css`):
- `.demo-scope` overrides (sidebar width: 180px, app-body-height)
- `.export-dialog` — warning-bordered dialog (amber border, `sm:max-w-md` ~448px)
- `.export-dialog-header` / `.export-dialog-title` / `.export-dialog-desc` / `.export-dialog-body` / `.export-dialog-footer`
- `.export-choicebox` — radio-card style scope selection (selected card has primary border + bg, indicator dot)
- `.export-choicebox-item` / `.export-choicebox-item.selected` — individual scope cards
- `.export-choicebox-title` / `.export-choicebox-desc` / `.export-choicebox-indicator`
- `.flow-dash` keyframe — progress bar animation
- `.feature-highlight` — pulse animation for the export button
- `.export-progress-bar` — progress bar with flow animation
- `.export-api-url` — monospace API URL display
- `.export-preview-dialog` — near-fullscreen preview (95vw × 95vh)
- `.export-dock` — macOS-style dock with magnification effect (CSS `:hover` scale transform on siblings)
- `.export-dock-icon` / `.export-dock-icon.selected` / `.export-dock-icon:hover` — dock icons with magnification
- `.export-preview-content` — iframe container (flex-1, bg-background)
- `.export-email-split` — resizable pane group (horizontal split)
- `.export-email-mailbox` — mailbox sidebar (30% width, ScrollArea, skeleton items)
- `.export-email-skeleton` — skeleton loading bar
- `.export-email-header` — email header (To/Subject)

Note: Styles use the PB design system CSS variables (`--pb-*`) from `demo.css`, not the HSL variables from the temp folder.

### Phase 3: Create `exports-scroll.ts`

**File:** `src/scripts/demo/exports-scroll.ts`

A scene-based scroll engine that:
- Imports shared helpers from `demo-utils.ts` (`clamp01`, `smoothstep`, `buildSceneDots`, `fadeScrollHint`)
- Defines 6 phases (one per scene) with scroll progress boundaries
- On scroll: updates rail fill, scene dots, phase label, fades scroll hint
- On scene change: cross-fades scenes (opacity transition), draws SVG connectors to active annotation
- Sub-scene animations: within each scene, animates elements progressively (e.g., dialog slides in, progress bar fills, preview tabs switch)
- Handles `prefers-reduced-motion` (static stack mode)

```typescript
import { clamp01, smoothstep, buildSceneDots, fadeScrollHint } from './demo-utils';

export function initExportsScroll(): void {
  // ... scene-based scroll engine
}
```

### Phase 4: Create `exports.astro`

**File:** `src/pages/[lang]/demo/exports.astro`

Structure (following entity-list-table.astro pattern):
```
---
// Frontmatter: imports, getStaticPaths, translations, hreflang links
---
<!doctype html>
<html lang={langCode}>
  <head>...</head>
  <body>
    <!-- Ambient background -->
    <!-- TopBanner -->
    <!-- Navigation (with VirtualTourMegaMenu activeDemo="exports") -->
    
    <div class="demo-scope">
      <!-- DemoHero (violet accent) -->
      <DemoHero badge={et.pageBadge} title={et.pageTitle} subtitle={et.pageSubtitle}
                badgeColor="bg-violet-400" gradientVia="via-violet-200" />
      
      <!-- Scroll hint -->
      <div class="demo-scroll-hint" id="scroll-hint">{et.scrollHint}</div>
      
      <!-- Section claims (6, alternating left/right) -->
      <div class="section-claim" id="claim-0">...</div>
      <!-- ... claims 1-5 -->
      
      <!-- Progress rail + dots + phase label -->
      <div class="progress-rail">...</div>
      <div class="scene-dots" id="dots"></div>
      <div class="phase-label" id="phase-label">Intro</div>
      
      <!-- Scroll track (600vh) -->
      <div class="scroll-track" style="height: 600vh" id="track">
        <div class="scroll-stage" id="stage">
          <div class="scroll-canvas" id="canvas">
            <!-- 6 scenes, each with device frame + annotation -->
            <!-- Scene 0: Export buttons (mock app with table + "Esporta" + "Esporta HTML" buttons) -->
            <!-- Scene 1: Export dialog (warning border, Choicebox scope, Cancel + Excel + CSV) -->
            <!-- Scene 2: Export in progress (API URL, progress bar, disabled button) -->
            <!-- Scene 3: HTML export confirm (simple warning dialog, Cancel + Conferma) -->
            <!-- Scene 4: Preview dock (95vw dialog, macOS dock with HTML/PDF/Email, iframe) -->
            <!-- Scene 5: Email preview (resizable split: mailbox sidebar + email content) -->
          </div>
        </div>
      </div>
      
      <!-- SVG connectors -->
      <svg class="connector-svg" id="connectors">...</svg>
      
      <!-- Annotation labels (6) -->
      <div class="ann-label" id="ann-0">...</div>
      <!-- ... annotations 1-5 -->
    </div>
    
    <!-- Website footer -->
    <footer>...</footer>
    
    <script>
      import { renderAllIcons } from '../../../scripts/demo/icons';
      import { initExportsScroll } from '../../../scripts/demo/exports-scroll';
      renderAllIcons();
      initExportsScroll();
    </script>
  </body>
</html>
```

### Phase 5: Enable exports in VirtualTourMegaMenu

**File:** `src/components/svelte/VirtualTourMegaMenu.svelte`
- Add `'exports'` to `activeDemo` type
- Add `const exportsHref = \`${demoHref}exports\``
- Change exports entry: `href: null` → `href: exportsHref`

### Phase 6: Enable exports card in demo hub

**File:** `src/pages/[lang]/demo/index.astro`
- Add `const exportsHref = \`${demoHref}exports\``
- Change exports card: `href="#" class="hub-card coming-soon"` → `href={exportsHref} class="hub-card"`

### Phase 7: Build and verify

1. Run `pnpm run build` — must succeed
2. Verify all 6 language pages generated at `/[lang]/demo/exports/`
3. Verify shell.astro still works (no regression)
4. Verify entity-list-table.astro still works (no regression)
5. Verify demo hub links to `/demo/exports`
6. Verify VirtualTourMegaMenu links to `/demo/exports`

## Impacted Files

| File | Action |
|------|--------|
| `src/styles/demo/demo.css` | **MODIFY** — add shared `pb-*` classes extracted from shell.css and entity-list-table.css |
| `src/styles/demo/shell.css` | **MODIFY** — remove shared `pb-*` classes, keep only shell-specific overrides |
| `src/styles/demo/entity-list-table.css` | **MODIFY** — remove shared `pb-*` classes, keep only entity-list-table-specific overrides |
| `src/components/astro/MockAppShell.astro` | **CREATE** — reusable mock app shell with slots |
| `src/i18n/exports-translations.ts` | **CREATE** — all text in 6 languages |
| `src/styles/demo/exports.css` | **CREATE** — dialog, preview, progress bar styles |
| `src/scripts/demo/exports-scroll.ts` | **CREATE** — scene-based scroll engine |
| `src/pages/[lang]/demo/exports.astro` | **CREATE** — the Astro page |
| `src/components/svelte/VirtualTourMegaMenu.svelte` | **MODIFY** — enable exports link |
| `src/pages/[lang]/demo/index.astro` | **MODIFY** — enable exports card |
| `src/pages/[lang]/demo/shell.astro` | **OPTIONAL** — refactor to use MockAppShell |
| `src/pages/[lang]/demo/entity-list-table.astro` | **OPTIONAL** — refactor to use MockAppShell |

## DRY Principles Applied

1. **DemoHero** — reused for hero section (same as shell and entity-list-table)
2. **MockAppShell** — reusable mock app shell (sidebar + topbar + content), slots for demo-specific content
3. **demo.css** — shared scroll-jacking infrastructure + PB design system CSS (extracted from shell.css and entity-list-table.css)
4. **demo-utils.ts** — shared helpers (lerp, clamp01, smoothstep, buildSceneDots, fadeScrollHint)
5. **icons.ts** — all icons already exist, no new icons needed
6. **translations.ts** — card titles/descriptions already exist for all 6 languages
7. **PB design system** — reuse pb-table, pb-badge, pb-btn, pb-sidebar, pb-checkbox classes (now in demo.css)

## Acceptance Criteria

1. `pnpm run build` succeeds with zero errors
2. All 6 language pages generated at `/[lang]/demo/exports/`
3. Shell and entity-list-table pages still work (no regression after CSS extraction)
4. Shell and entity-list-table pages render identically (no visual change from CSS refactor)
5. Demo hub links to `/demo/exports` (not "coming soon")
6. VirtualTourMegaMenu links to `/demo/exports`
7. Hero section visible (badge + gradient h1 + subtitle)
8. Scroll hint at bottom (same as shell)
9. 6 scenes with cross-fade transitions
10. Mock app shell matches real FE (verified via Playwright capture)
11. Export dialog uses Choicebox-style scope selection (not checkboxes)
12. Preview dialog is near-fullscreen (95vw × 95vh) with macOS-style dock
13. Email preview uses resizable split (mailbox sidebar + email content)
14. Annotations with SVG connector lines
15. Section claims alternating left/right
16. Progress rail and scene dots functional
17. Phase label shows current scene name
18. All text translated in 6 languages
19. MockAppShell component is reusable (props + slots, no demo-specific logic)
