# EntityListTable.svelte Refactoring - Phase 3: Extract UI Components

## Overview

This phase focuses on extracting UI components from the main `EntityListTable.svelte` component. These are self-contained UI sections that can be extracted into separate components.

**Current File Size:** 3293 lines  
**Target Lines to Extract:** ~583 lines  
**Risk Level:** Medium  
**Estimated Time:** 2-3 hours

## Empirical Analysis Corrections

After empirical analysis of the actual code, the following corrections were made:

1. **Total file size**: 3293 lines (not ~929 as stated)
2. **Filter Bar**: Actual lines 1955-2026 + 1293-1318 (~97 lines, not 159)
3. **Bulk Actions**: Actual lines 3056-3098 (~42 lines, not 200)
4. **Preview Panel**: Actual lines 1468-1757 (~289 lines, not 336)
5. **Export Preview**: Actual lines 3263-3418 (~155 lines, not 234)
6. **Existing components**: Some components exist but don't match the inline UI patterns

---

## Tasks

### 3.1 Filter Bar Component
**Status:** ⚠️ PARTIALLY EXISTS - `panels/FiltersPanel.svelte` exists with its own `formatFilterDateValue()` function, but inline filter badge display in main component is separate

**Action:** Extract filter badge display logic from main component to new `toolbar/FilterBar.svelte`

**Target:** Lines 1955-2026 (UI) + 1293-1318 (helper functions) (~97 lines total)

**New File:** `src/lib/components/entity-list-table/toolbar/FilterBar.svelte`

**Existing Component:** `panels/FiltersPanel.svelte` - Full filter configuration panel with its own helper functions

**Extract:**
- Applied filters display with badges (lines 1955-2026) - This is the INLINE display in the toolbar, separate from FiltersPanel
- Filter badge rendering logic
- `formatFilterDateValue()` function (lines 1303-1318) - Main component's version, different from FiltersPanel's version
- `formatBadgeValue()` function (lines 1293-1301)
- Advanced filter badge rendering

**Note:** The existing `panels/FiltersPanel.svelte` is a full-featured filter configuration panel that opens in a sheet. The inline filter badges (lines 1955-2026) are a separate UI element that shows applied filters in the toolbar. These are two different UI components serving different purposes.

**Original Code Example (Lines 1955-2026):**
```svelte
{#if filterValues && Object.keys(filterValues).length > 0}
  {#each Object.entries(filterValues) as [key, value]}
    {@const col = filterableColumns.find((c) => c.key === key)}
    {#if col}
      {@const operator = col.type === 'text' ? 'contains' : '='}
      {@const formattedValue = col.type === 'date' || col.type === 'datetime' ? formatFilterDateValue(String(value)) : formatBadgeValue(col, value)}
      <Badge
        variant="secondary"
        class="gap-1.5 pr-1"
      >
        <span class="text-xs font-bold text-foreground">{$t(col.labelKey)}</span>
        <span class="text-xs text-primary">{$t(`entities.list.operators.${operator}`)}</span>
        <span class="text-xs italic text-muted-foreground">{formattedValue}</span>
        <button
          type="button"
          class="ml-0.5 inline-flex size-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
          onclick={() => {
            const next = { ...filterValues };
            delete next[key];
            onFilterValuesChange?.(next);
          }}
          aria-label={$t('common.remove')}
        >
          <XIcon class="size-3" />
        </button>
      </Badge>
    {/if}
  {/each}
{/if}
{#if advancedFilters && advancedFilters.length > 0}
  {#each advancedFilters as filter}
    {@const col = filterableColumns.find((c) => c.key === filter.field)}
    {#if col}
      {@const formattedValue = (() => {
        if (Array.isArray(filter.value)) {
          return filter.value.map((v) => formatBadgeValue(col, v)).join(", ");
        } else if (filter.operator === "BETWEEN" && typeof filter.value === "object" && "start" in filter.value && "end" in filter.value) {
          const startFormatted = formatFilterDateValue(String(filter.value.start));
          const endFormatted = formatFilterDateValue(String(filter.value.end));
          return `${startFormatted} e ${endFormatted}`;
        } else if (col.type === 'date' || col.type === 'datetime') {
          return formatFilterDateValue(String(filter.value));
        } else {
          return formatBadgeValue(col, filter.value);
        }
      })()}
      <Badge
        variant="secondary"
        class="gap-1.5 pr-1"
      >
        <span class="text-xs font-bold text-foreground">{$t(col.labelKey)}</span>
        <span class="text-xs text-primary">{$t(`entities.list.operators.${filter.operator}`)}</span>
        <span class="text-xs italic text-muted-foreground">{formattedValue}</span>
        <button
          type="button"
          class="ml-0.5 inline-flex size-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
          onclick={() => {
            const next = advancedFilters.filter((f) => f.id !== filter.id);
            onAdvancedFiltersChange?.(next, 'AND');
          }}
          aria-label={$t('common.remove')}
        >
          <XIcon class="size-3" />
        </button>
      </Badge>
    {/if}
  {/each}
{/if}
```

**Original Helper Functions (Lines 1293-1318):**
```typescript
function formatBadgeValue(col: MetaColumn, value: any): string {
  if (col.type === 'badge' && col.badge?.values) {
    const badgeValue = col.badge.values[value];
    if (badgeValue) {
      return badgeValue.labelText || $t(badgeValue.labelKey || `entities.customer.status.${value}`);
    }
  }
  return String(value);
}

function formatFilterDateValue(isoString: string): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const isDateTime = isoString.includes('T') || isoString.includes(':');
    const options: Intl.DateTimeFormatOptions = isDateTime
      ? { dateStyle: "long", timeStyle: "medium" }
      : { dateStyle: "long" };

    return new Intl.DateTimeFormat($uiLang, options).format(date);
  } catch {
    return isoString;
  }
}
```

**Props:**
```typescript
interface FilterBarProps {
  hasAppliedFilters: boolean;
  filterValues: Record<string, any>;
  advancedFilters: AdvancedFilter[];
  filterableColumns: MetaColumn[];
  onResetFilters: () => void;
  onFilterValuesChange: (values: Record<string, any>) => void;
  onAdvancedFiltersChange: (filters: AdvancedFilter[]) => void;
}
```

**Steps:**
1. Read `EntityListTable.svelte` lines 1293-1318 and 1955-2026
2. Extract filter badge display logic and helper functions
3. Create `src/lib/components/entity-list-table/toolbar/FilterBar.svelte`
4. Add extracted UI and functions to new component
5. Define props interface using Svelte 5 $props()
6. Update imports in `EntityListTable.svelte`
7. Replace extracted code with new component
8. Test filter badge display works correctly

---

### 3.2 Bulk Actions Bar Component
**Status:** ⚠️ EXISTS BUT DIFFERENT - existing `toolbar/BulkActions.svelte` is a simple bulk action button bar, but main component has inline selection counter

**Action:** Move bulk action UI from main component to existing `toolbar/BulkActions.svelte` OR create new `SelectionCounter.svelte`

**Target:** Lines 3056-3098 (~42 lines)

**Existing File:** `src/lib/components/entity-list-table/toolbar/BulkActions.svelte`

**Current BulkActions.svelte Analysis:**
- Simple component with bulk delete/restore/export/duplicate buttons
- Does NOT include selection counter display
- Does NOT include "view selected only" toggle
- These features are currently inline in EntityListTable.svelte (lines 3056-3098)

**Note:** The existing `toolbar/BulkActions.svelte` provides action buttons for bulk operations. The inline selection counter (lines 3056-3098) shows how many items are selected and provides a toggle to view only selected items. These are complementary UI elements that could be merged or kept separate.

**Original Code Example (Lines 3056-3098):**
```svelte
{#if rowSelectionEnabled && selectionCount > 0}
  <div class="flex items-center gap-1.5 text-info">
    <span class="inline-flex flex-wrap items-baseline gap-x-1">
      {selectionCount}
      {#if selectionCount === 1}
        {#if selectionLabelSingularText}
          {' '}{selectionLabelSingularText}{' '}
        {:else if selectionLabelSingularKey}
          {' '}{$t(selectionLabelSingularKey)}{' '}
        {:else if selectionLabelText}
          {' '}{selectionLabelText}{' '}
        {:else if selectionLabelKey}
          {' '}{$t(selectionLabelKey)}{' '}
        {/if}
      {:else if selectionLabelText}
        {' '}{selectionLabelText}{' '}
      {:else if selectionLabelKey}
        {' '}{$t(selectionLabelKey)}{' '}
      {/if}
      {$t(selectionPastParticipleKey)}
    </span>
    <Button
      type="button"
      variant="ghost"
      size="xs"
      class="shrink-0 text-info hover:bg-info/10 hover:text-info"
      aria-pressed={showSelectedOnly}
      title={showSelectedOnly ? $t('entities.list.viewAllRowsTitle') : $t('entities.list.viewSelectedOnlyTitle')}
      aria-label={showSelectedOnly ? $t('entities.list.viewAllRowsTitle') : $t('entities.list.viewSelectedOnlyTitle')}
      onclick={() => {
        const next = !showSelectedOnly;
        showSelectedOnly = next;
        if (next) clientSelectedPage = 1;
      }}
    >
      {#if showSelectedOnly}
        <EyeOff class="size-4" />
      {:else}
        <Eye class="size-4" />
      {/if}
    </Button>
  </div>
{/if}
```

**Extract:**
- Selection counter display with pluralization logic
- "View selected only" toggle button
- Consider merging with existing BulkActions.svelte or creating separate SelectionCounter.svelte

**Options:**
1. **Option A**: Create new `SelectionCounter.svelte` for the counter + toggle, keep existing BulkActions.svelte for action buttons
2. **Option B**: Enhance existing BulkActions.svelte to include selection counter and toggle

**Recommended Approach:** Option A - Create separate `SelectionCounter.svelte` to keep concerns separated

**Props for SelectionCounter.svelte:**
```typescript
interface SelectionCounterProps {
  selectionCount: number;
  selectionLabelKey?: string;
  selectionLabelSingularKey?: string;
  selectionLabelText?: string;
  selectionLabelSingularText?: string;
  selectionPastParticipleKey: string;
  showSelectedOnly: boolean;
  onShowSelectedOnlyChange: (show: boolean) => void;
  clientSelectedPage: number;
}
```

**Steps:**
1. Read `EntityListTable.svelte` lines 3056-3098
2. Read existing `toolbar/BulkActions.svelte` to understand current structure
3. Create `src/lib/components/entity-list-table/toolbar/SelectionCounter.svelte`
4. Add extracted selection counter UI to new component
5. Define props interface using Svelte 5 $props()
6. Update imports in `EntityListTable.svelte`
7. Replace extracted code with new component
8. Test selection counter and toggle work correctly

---

### 3.3 Preview Panel Component
**Status:** ⚠️ PARTIALLY EXISTS as `composables/usePreviewPanel.svelte.ts` - state management exists, but UI is inline

**Action:** Extract preview panel UI from main component to new `panels/PreviewPanel.svelte`

**Target:** Lines 1468-1757 (~289 lines)

**New File:** `src/lib/components/entity-list-table/panels/PreviewPanel.svelte`

**Existing Components:**
- `composables/usePreviewPanel.svelte.ts` - State management for preview panel
- `src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte` - Version history panel (different location)

**Extract:**
- Preview panel header with pagination controls (lines 1480-1506)
- Edit mode toggle switch (lines 1509-1523)
- Preview dropdown menu with actions (lines 1525-1594)
- Preview panel content rendering (lines 1610-1757)
- Navigation between preview records

**Note:** The existing `composables/usePreviewPanel.svelte.ts` handles state management for the preview panel. The UI (lines 1468-1757) is currently inline in EntityListTable.svelte. A related component `VersionHistoryPanel.svelte` exists in a different location (`src/lib/entity-list/sheets/panels/`) for version history functionality.

**Original Code Example - Header (Lines 1480-1506):**
```svelte
{#snippet headerActions()}
  <!-- Micro pagination absolutely centered in header -->
  <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1">
    <Button
      size="icon-sm"
      variant="secondary-outline"
      onclick={() => navigatePreview(-1)}
      disabled={previewPanel.previewRowIndex === 0 && footerPage === 1}
      aria-label="Previous record"
      class="pointer-events-auto hover:scale-105 transition-all"
    >
      <ChevronLeft class="w-4 h-4" />
    </Button>
    <span class="text-xs font-medium w-16 text-center">
      {(footerPage - 1) * pageSize + previewPanel.previewRowIndex + 1} / {footerRangeTotal}
    </span>
    <Button
      size="icon-sm"
      variant="secondary-outline"
      onclick={() => navigatePreview(1)}
      disabled={previewPanel.previewRowIndex >= viewRows.length - 1 && footerPage >= footerTotalPages}
      aria-label="Next record"
      class="pointer-events-auto hover:scale-105 transition-all"
    >
      <ChevronRight class="w-4 h-4" />
    </Button>
  </div>

  <!-- CTAs on right -->
  {#if !rowDeleted}
    <!-- Mode switch with icons only -->
    <div class="flex items-center gap-2">
      {#if !previewPanel.previewEditMode}
        <PencilOff class="w-4 h-4 text-muted-foreground" />
      {:else}
        <Pencil class="w-4 h-4 text-muted-foreground" />
      {/if}
      <Switch
        bind:checked={previewPanel.previewEditMode}
        aria-label={$t('entities.list.editModeLabel')}
        disabled={rowDeleted}
      />
    </div>
  {/if}
{/snippet}
```

**Original Code Example - Dropdown Menu (Lines 1525-1594):**
```svelte
<!-- Kebab menu for row actions -->
<DropdownMenu.Root bind:open={previewDropdownOpen}>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button 
        {...props}
        variant="ghost" 
        size="icon-sm" 
        aria-label={$t('common.more')} 
        class="mr-1"
      >
        <MoreVertical class="w-4 h-4" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content class="w-56" align="end">
    {#if entityRowActions?.edit !== false}
      <DropdownMenu.Item
        onclick={() => { if (rowDeleted) return; handleEditRow(row); }}
        class={rowDeleted ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
      >
        <div class="flex items-center gap-2">
          <Pencil class="size-4 opacity-70" />
          <span>{$t('common.edit')}</span>
        </div>
      </DropdownMenu.Item>
    {/if}
    {#if entityRowActions?.duplicate !== false}
      <DropdownMenu.Item
        onclick={() => { if (rowDeleted) return; rowActionsComposable.handleDuplicateRow(row); }}
        class={rowDeleted ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
      >
        <div class="flex items-center gap-2">
          <Copy class="size-4 opacity-70" />
          <span>{$t('common.duplicate')}</span>
        </div>
      </DropdownMenu.Item>
    {/if}
    <DropdownMenu.Item
      onclick={() => loadVersionHistory(row)}
    >
      <div class="flex items-center gap-2">
        <FileClock class="size-4 opacity-70" />
        <span>{$t('common.versionHistory')}</span>
      </div>
    </DropdownMenu.Item>
    {#if entityRowActions?.delete !== false}
      {#if rowDeleted}
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={() => rowActionsComposable.handleRestoreRow(row)} class="text-warning">
          <div class="flex items-center gap-2">
            <span class="relative flex items-center justify-center">
              <Trash2 class="size-4 text-warning/70" />
              <ArrowUpFromLine class="absolute -bottom-[1px] size-3 text-warning/70" />
            </span>
            <span>{$t('common.restore')}</span>
          </div>
        </DropdownMenu.Item>
      {:else}
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={() => rowActionsComposable.handleDeleteRow(row)} class="text-destructive">
          <div class="flex items-center gap-2">
            <Trash2 class="size-4 text-destructive/70" />
            <span>{$t('common.delete')}</span>
          </div>
        </DropdownMenu.Item>
      {/if}
    {/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>
```

**Props:**
```typescript
interface PreviewPanelProps {
  row: TRow;
  previewEditMode: boolean;
  previewRowIndex: number;
  previewDropdownOpen: boolean;
  totalRecords: number;
  currentPage: number;
  pageSize: number;
  onPreviewEditModeChange: (mode: boolean) => void;
  onNavigatePreview: (direction: number) => void;
  onPreviewDropdownOpenChange: (open: boolean) => void;
  onEditRow: (row: TRow) => void;
  onDuplicateRow: (row: TRow) => void;
  onDeleteRow: (row: TRow) => void;
  onRestoreRow: (row: TRow) => void;
  onLoadVersionHistory: (row: TRow) => void;
  cell?: Snippet<[CellArgs]>;
  columns: MetaColumn[];
  stickyColumns?: MetaColumn[];
  dataColumns?: MetaColumn[];
  auditingColumns?: MetaColumn[];
  datetimeIanaModeByKey: Record<string, 'browser' | 'record'>;
  entityRowActions?: { edit?: boolean; duplicate?: boolean; delete?: boolean; preview?: boolean };
  isRowDeleted: (row: TRow) => boolean;
}
```

**Steps:**
1. Read `EntityListTable.svelte` lines 1468-1757
2. Extract preview panel UI including header, actions, and content
3. Create `src/lib/components/entity-list-table/panels/PreviewPanel.svelte`
4. Add extracted UI to new component
5. Define props interface using Svelte 5 $props()
6. Keep usePreviewPanel composable for state management
7. Update imports in `EntityListTable.svelte`
8. Replace extracted code with new component
9. Test preview panel works correctly

---

### 3.4 Export Preview Dialog
**Status:** ⚠️ PARTIALLY EXISTS - `HtmlExportDialog.svelte` exists but is a simple confirmation dialog, not the full preview UI

**Action:** Extract export preview UI from main component to existing `dialogs/HtmlExportDialog.svelte` OR create new `ExportPreviewDialog.svelte`

**Target:** Lines 3263-3418 (~155 lines)

**Existing File:** `src/lib/components/entity-list-table/dialogs/HtmlExportDialog.svelte`

**Current HtmlExportDialog.svelte Analysis:**
- Simple confirmation dialog for HTML export scope selection
- Does NOT include preview iframe rendering
- Does NOT include dock toolbar with format selection
- Does NOT include PDF/email preview layouts
- Full preview UI is currently inline in EntityListTable.svelte

**Original Code Example (Lines 3263-3418):**
```svelte
<!-- HTML preview full-screen dialog -->
<DialogBordered bind:open={exportComposable.htmlPreviewDialogOpen} color="primary" class="!w-[95vw] !h-[95vh] !max-w-none !max-h-none !p-0 flex flex-col [&>div:nth-child(2)]:flex [&>div:nth-child(2)]:flex-col [&>div:nth-child(2)]:flex-1 [&>div:nth-child(2)]:min-h-0 [&>div:nth-child(2)]:!p-4" showCloseButton={false}>
  <Dialog.Header class="pb-4 shrink-0">
    <Dialog.Title>{$t('common.htmlPreviewTitle')}</Dialog.Title>
  </Dialog.Header>

  <!-- Navigation dock -->
  <div class="relative shrink-0">
    <Dock.Root class="!absolute -top-12 left-1/2 -translate-x-1/2 z-10 !bg-primary/10 !border-primary/20 dark:!bg-primary/10" magnification={70} distance={120}>
      <Dock.Icon
        onclick={() => { exportComposable.previewMode = 'html'; exportComposable.pdfBlobUrl = null; }}
        tooltip="HTML view"
        selected={exportComposable.previewMode === 'html'}
      >
        <BsFiletypeHtml class="w-6 h-6" />
      </Dock.Icon>
      <Dock.Icon
        onclick={generatePdfPreview}
        tooltip="PDF view"
        selected={exportComposable.previewMode === 'pdf'}
      >
        <BsFiletypePdf class="w-6 h-6" />
      </Dock.Icon>
      <Dock.Icon
        onclick={prepareEmailHtml}
        tooltip="Email"
        selected={exportComposable.previewMode === 'email'}
      >
        <BsEnvelopeAt class="w-6 h-6" />
      </Dock.Icon>
    </Dock.Root>
  </div>

<!-- Preview content -->
  <div class="flex-1 overflow-hidden bg-background min-h-0 rounded-md relative">
    {#if exportComposable.previewMode === 'html'}
      <iframe
        srcdoc={exportComposable.htmlPreviewContent}
        class="w-full h-full border-0"
        title="HTML Preview"
      ></iframe>
    {:else if exportComposable.previewMode === 'pdf' && exportComposable.pdfBlobUrl}
      <iframe
        src={exportComposable.pdfBlobUrl}
        class="w-full h-full border-0"
        title="PDF Preview"
      ></iframe>
    {:else if exportComposable.previewMode === 'pdf'}
      <div class="flex items-center justify-center h-full">
        <p class="text-muted-foreground">Generating PDF...</p>
      </div>
    {:else if exportComposable.previewMode === 'email'}
      <div class="w-full h-full">
        {#if exportComposable.isEmailPreparing}
          <div class="flex items-center justify-center h-full">
            <p class="text-muted-foreground">Preparing email HTML...</p>
          </div>
        {:else}
          <Window
            class="!aspect-auto h-full w-full flex flex-col"
            contentClass="flex-1 min-h-0 !p-0"
          >
            <div class="flex h-full w-full overflow-hidden bg-background">
              <Resizable.PaneGroup direction="horizontal">
                <!-- PANNELLO SINISTRO: Elenco Mail (30% larghezza) -->
                <Resizable.Pane defaultSize={30} minSize={20}>
                  <ScrollArea class="h-full border-r p-4 bg-muted/20">
                    <h3 class="text-sm font-semibold mb-4 px-2 tracking-tight text-muted-foreground">Mailbox</h3>
                    <div class="space-y-2">
                      <!-- Item Mail Attivo (skeleton evidenziato) -->
                      <div class="p-3 space-y-2 border rounded-lg bg-card shadow-sm border-primary/50">
                        <Skeleton class="h-4 w-3/4" />
                        <Skeleton class="h-3 w-1/2" />
                      </div>
                      
                      <!-- Skeleton per altre mail -->
                      <div class="p-3 space-y-2 border rounded-lg opacity-50">
                        <Skeleton class="h-4 w-2/3" />
                        <Skeleton class="h-3 w-1/3" />
                      </div>
                      <div class="p-3 space-y-2 border rounded-lg opacity-50">
                        <Skeleton class="h-4 w-3/4" />
                        <Skeleton class="h-3 w-1/2" />
                      </div>
                    </div>
                  </ScrollArea>
                </Resizable.Pane>

                <Resizable.Handle withHandle />

                <!-- PANNELLO DESTRO: Area di Contenuto (Preview) -->
                <Resizable.Pane defaultSize={70}>
                  <div class="flex flex-col h-full bg-background min-h-0">
                    
                    <!-- Header dell'email (To, Subject) -->
                    <div class="p-4 border-b space-y-3 bg-card shrink-0">
                      <div class="text-sm text-muted-foreground flex gap-2 items-center">
                        <span class="font-medium">A:</span> 
                        <span class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">recipient@example.com</span>
                      </div>
                      <div class="text-sm text-muted-foreground flex gap-2 items-center">
                        <span class="font-medium">Subject:</span>
                        <Skeleton class="h-4 flex-1" />
                      </div>
                    </div>

                    <!-- Area dell'IFrame -->
                    <div class="flex-1 bg-muted/10 relative h-full min-h-0">
                      <!-- L'iframe che ospita l'HTML puro del foglio e della tabella -->
                      <iframe 
                        title="Email Preview"
                        srcdoc={exportComposable.emailHtmlContent}
                        class="w-full h-full border-0 bg-white"
                        sandbox="allow-same-origin"
                      ></iframe>
                    </div>

                  </div>
                </Resizable.Pane>
                
              </Resizable.PaneGroup>
            </div>
          </Window>
        {/if}
      </div>
    {/if}
  </div>
  
  <Dialog.Footer class="gap-2 shrink-0">
    <Button
      variant="secondary-outline"
      class="hover:scale-105 transition-all"
      onclick={closeHtmlPreview}
    >
      {$t('common.close')}
    </Button>
    {#if exportComposable.previewMode === 'email'}
      <Button onclick={copyEmailHtmlToClipboard} disabled={exportComposable.isEmailPreparing || !exportComposable.emailHtmlContent}>
        {#if exportComposable.emailCopied}
          Copied!
        {:else}
          Copy HTML to Clipboard
        {/if}
      </Button>
    {:else if exportComposable.previewMode === 'pdf'}
      <Button onclick={() => { /* PDF download handled by composable */ }} disabled={!exportComposable.pdfBlobUrl}>
        Scarica PDF
      </Button>
    {:else}
      <Button onclick={copyHtmlToClipboard} disabled={exportComposable.previewMode !== 'html'}>
        {$t('common.copyHtml')}
      </Button>
    {/if}
  </Dialog.Footer>
</DialogBordered>
```

**Extract:**
- HTML/PDF/email preview iframe rendering
- Dock toolbar with format selection
- Resizable email preview layout with mailbox skeleton
- Dialog footer with action buttons
- Keep existing simple HtmlExportDialog.svelte for confirmation, create new ExportPreviewDialog.svelte for full preview

**Recommended Approach:** Create new `ExportPreviewDialog.svelte` for the full preview UI, keep existing `HtmlExportDialog.svelte` for confirmation

**Props for ExportPreviewDialog.svelte:**
```typescript
interface ExportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewMode: 'html' | 'pdf' | 'email';
  onPreviewModeChange: (mode: 'html' | 'pdf' | 'email') => void;
  htmlPreviewContent: string;
  pdfBlobUrl: string | null;
  emailHtmlContent: string;
  isEmailPreparing: boolean;
  emailCopied: boolean;
  onGeneratePdfPreview: () => void;
  onPrepareEmailHtml: () => void;
  onCopyHtmlToClipboard: () => void;
  onClose: () => void;
}
```

**Steps:**
1. Read `EntityListTable.svelte` lines 3263-3418
2. Read existing `dialogs/HtmlExportDialog.svelte` to understand current structure
3. Create `src/lib/components/entity-list-table/dialogs/ExportPreviewDialog.svelte`
4. Add extracted preview UI to new component
5. Define props interface using Svelte 5 $props()
6. Update imports in `EntityListTable.svelte`
7. Replace extracted code with new component
8. Test export preview dialog works correctly

---

## Testing Checklist

- [ ] Filter badge display works correctly
- [ ] Filter reset works correctly
- [ ] Advanced filter badges display correctly
- [ ] Bulk actions UI displays correctly
- [ ] Selection counter displays correctly
- [ ] Conditional action rendering works correctly
- [ ] Preview panel displays correctly
- [ ] Preview panel pagination works correctly
- [ ] Preview panel edit mode toggle works correctly
- [ ] Preview panel dropdown menu works correctly
- [ ] Export preview dialog displays correctly
- [ ] HTML preview works correctly
- [ ] PDF preview works correctly
- [ ] Email preview works correctly
- [ ] No TypeScript errors: `pnpm run check`
- [ ] Dev server runs without errors: `pnpm run dev`
- [ ] Manual testing of affected features
- [ ] All existing functionality preserved

---

## Success Criteria

- [ ] All UI components extracted
- [ ] Main component reduced by ~583 lines (from 3293 to ~2710)
- [ ] No TypeScript errors: `pnpm run check`
- [ ] No runtime errors
- [ ] Dev server runs without errors: `pnpm run dev`
- [ ] All features manually tested
- [ ] Code follows existing patterns and conventions
- [ ] Svelte 5 runes used correctly ($state, $props, $derived)
- [ ] TypeScript interfaces properly defined for all components

## Summary of Corrections

After empirical analysis of the actual EntityListTable.svelte file (3293 lines) and existing component structure, the following corrections were made to the original plan:

1. **Line count corrections:**
   - Filter Bar: 97 lines (not 159) - lines 1955-2026 + 1293-1318
   - Bulk Actions: 42 lines (not 200) - lines 3056-3098
   - Preview Panel: 289 lines (not 336) - lines 1468-1757
   - Export Preview: 155 lines (not 234) - lines 3263-3418
   - Total: 583 lines (not 929)

2. **Component status corrections (based on actual directory structure):**
   - Filter Bar: ⚠️ PARTIALLY EXISTS - `panels/FiltersPanel.svelte` exists (full filter config panel), but inline filter badge display in toolbar is separate
   - Bulk Actions: ⚠️ EXISTS BUT DIFFERENT - `toolbar/BulkActions.svelte` exists (action buttons), but selection counter is inline
   - Preview Panel: ⚠️ PARTIALLY EXISTS - `composables/usePreviewPanel.svelte.ts` exists (state management), but UI is inline
   - Export Preview: ⚠️ PARTIALLY EXISTS - `dialogs/HtmlExportDialog.svelte` exists (simple confirmation), but full preview UI is inline

3. **Existing components discovered:**
   - `toolbar/BulkActions.svelte` - Bulk action buttons
   - `toolbar/SearchBar.svelte` - Search input
   - `toolbar/ViewModeToggle.svelte` - View mode switcher
   - `toolbar/DeletionFilterToggle.svelte` - Deletion filter toggle
   - `toolbar/EntityListToolbar.svelte` - Main toolbar container
   - `panels/FiltersPanel.svelte` - Full filter configuration panel
   - `panels/ColumnSelectorPanel.svelte` - Column visibility panel
   - `panels/SearchInPanel.svelte` - Search scope panel
   - `dialogs/HtmlExportDialog.svelte` - HTML export confirmation dialog
   - `dialogs/ExportDialog.svelte` - General export dialog
   - `composables/usePreviewPanel.svelte.ts` - Preview panel state management
   - `src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte` - Version history panel

4. **New component recommendations:**
   - Create `toolbar/FilterBar.svelte` for inline filter badge display (separate from FiltersPanel)
   - Create `toolbar/SelectionCounter.svelte` for selection counter and toggle
   - Create `panels/PreviewPanel.svelte` for preview panel UI (use existing composable for state)
   - Create `dialogs/ExportPreviewDialog.svelte` for full export preview (separate from HtmlExportDialog)

5. **Code examples added:**
   - Original code snippets with exact line numbers for each extraction
   - Proper Svelte 5 props interfaces
   - Step-by-step extraction instructions
