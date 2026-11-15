# Trigger page refinement — lifecycle CTAs order/colors + ELT preview pane removal

## Status: 🟠 WIP — Plan date: 2026-02-21 / session continuing

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Stop CTA icon `square` → `square:filled` + e2e coverage | ✅ done | this session | us-v3 `aaeb258`, fe-v3 `1bfceee`, e2e 2/2 green |
| 2 | Lifecycle CTA order & colors — order/colors CONFIRMED by user (Part A) | ⏳ not done | next TOC | us-v3 `actions-route.ts` only |
| 3 | ELT PreviewPanel total removal + dblclick→detail-tab + Columns3 header CTA (Part B) | ⏳ not done | next TOC | fe-v3 — empirical map complete |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Lifecycle CTA order & colors (CONFIRMED, ready for TOC)

User's order: `stop (warning) → pause (warning) → resume (success) → [Preview — dies in Part B] → enable (success) → disable (destructive)`. Effective final order (Preview removed per Part B):

```
stop      warning      armed only
pause     warning      armed only
resume    success      paused only
enable    success      stopped/paused/disabled states
disable   destructive  always LAST custom op (soft-delete of the owning trigger)
```

Implementation = **declaration reorder + `cta.color` in `us-v3 job-handler/src/controllers/http/actions-route.ts` only** — `TableRow.svelte` renders custom ops in declaration order, before the standard Delete/Restore block, so no FE change needed for ordering.

TOC checks: verify `color: "warning"` / `"success"` are valid tokens in the FE ActionChrome/color contract (only `"destructive"` is used today); extend `jobs-schedule-cta-icons.spec.ts` with order + color assertions.

### Empirical semantics (unchanged — presentation-only task)

| Op | Mechanism | Status | Permanence |
|----|-----------|--------|------------|
| `stop` | `disarmSchedule(…,"stopped")` — JetStream purge | `stopped` | Transient — may auto re-arm |
| `pause` | `disarmSchedule(…,"paused")` — same purge | `paused` ∈ SUPPRESSED | Held until manual resume |
| `disable` | `dal.delete` on owning `job_trigger` — literal soft-delete | — | Permanent; only `enable` restores |

---

## Part B — ELT PreviewPanel REMOVAL (approved: "buttiamo via senza nemmeno commentare")

### Empirical inventory (fe-v3)

**Files to delete entirely:**
- `src/lib/components/entity-list-table/panels/PreviewPanel.svelte` (332 l.)
- `src/lib/components/entity-list-table/components/PreviewPanelWrapper.svelte` (242 l.)
- `src/lib/components/entity-list-table/composables/usePreviewPanel.svelte.ts` (102 l.)
- `panels/index.ts` export entry (verify)

**Files to edit:**

| File | Change |
|------|--------|
| `EntityListTable.svelte` | Remove `usePreviewPanel` (~L475), `navigatePreview`, `previewDropdownOpen`, `dropdownMenuRow` stays (kebab), `PreviewPanelWrapper` mount, `onPreviewRow` in `useRowActions` opts (~L627), `preview: opAllowed('get')` in `effectiveRowActions` (~L559), `preview` in `hasEntityRowActions` (~L581), preview args in `useKeyboardNavigation` (~L663-668) and `createClickHandlers` (~L704) |
| `useKeyboardNavigation.svelte.ts` | Remove ArrowLeft/Right preview nav (L37-47) + ArrowUp/Down `openPreview` branches (L90-95, L106-111) + the 5 preview options. **Re-home `focusedRowIndex`** — it lives in `usePreviewPanel` state but also drives `data-focused-row-index`, scroll-into-view, Space-select, Enter-dropdown → move into the composable or local `$state` in EntityListTable |
| `click-handlers.ts` | Remove `handlePreviewRow` + `previewPanel` param; dblclick handler moves here or to TableRow prop |
| `TableRow.svelte` | Remove Preview menu item (L322-338) + fix the `versionHistory \|\| preview` group condition (L322); `ondblclick` → `window.open(detailHref, '_blank')` (L118) |
| `EntityListTableHeaderRow.svelte` | Replace PanelRightOpen/Close toggle (L185-211) with `Columns3` → `openSheet('entity.columns', {stickyColumnsGroup, nonAuditingColumns, auditingColumnsGroup, visibleKeys, toggleColumnKey, onResetColumnVisibility})` — same call as `EntityListTableHeader.svelte:153` |
| `types.ts` | Remove `preview?: boolean` (L37) from `entityRowActions` |
| `useRowActions.svelte.ts` | Remove `onPreviewRow` option + preview item build |
| Callers passing `entityRowActions={{ preview… }}` | grep at TOC (`entityRowActions` prop passthrough, e.g. EntityTablePage) |

**New dblclick contract:**
- `kind:'detail'` census route for the entity, `[param]` → `row[uid]` — same resolution as `EntityTablePage.svelte:161` (`shellNav.moduleNav?.routes?.find(r => r.kind === 'detail' && r.entity === entity)`) and `entity-links.ts:entityRefHref` (`route.replace(/\[[a-zA-Z0-9_]+\]/, value)`). Example wire: `/system/job/triggers/[uuid]` → `/system/job/triggers/<uuid>`.
- `window.open(href, '_blank')` inside a user gesture (dblclick) → new tab takes focus natively. No `noopener` needed for same-origin.
- No `kind:'detail'` decl → proposal: no-op + `import.meta.env.DEV` console.warn (consistent fail-closed behavior — record isn't standalone-browsable).

**Key bindings — confirmed:**
- ArrowLeft/Right were bound **only while pane open** → fully freed, nothing else claims them.
- ArrowUp/Down keep row-focus movement + page-edge paging; lose only the auto-`openPreview` branch.
- Space (select), Enter (row dropdown), Escape (close dropdown), PageUp/Down/Home/End (pager), Insert (create) — all unchanged.

**Meta governability of Preview — confirmed:**
- `preview: opAllowed('get')` — the ONLY meta hook; `get` op itself stays in the contract (still gates read data). No `row_custom_actions` or `meta.table.*` field references preview. Removing = drop the flag + item + `onPreviewRow` plumbing.

**E2E blast radius:**
- `src/e2e/entity-list-table-interactions.spec.ts` — L14/69/249: dblclick→pane + arrow-preview assertions → rewrite: dblclick → `context.waitForEvent('page')` popup → assert URL `…/detail/<uuid>` + popup is focused (`popup.evaluate(() => document.hasFocus())`); arrow-left/right assertions removed.
- `src/e2e/job-triggers-deletion-filter.spec.ts:196` — searches menu texts for `preview|anteprima|…` → update expected menu content.

**Orphaned cleanup (decide at TOC):**
- i18n keys: `system.entities.list.preview`, `preview_panel_title`, `toggle_preview_panel`, `edit_mode_label` (+ `sticky_fields`/group headers if unused elsewhere) — remove or leave dormant?
- sessionStorage `pb-preview-panel:{entity}` — dead key, harmless; no migration needed.
- `EntityListTableHeaderRow` imports `PanelRightClose/PanelRightOpen` — drop with the button.

### Acceptance criteria

- [ ] `grep -ri "previewpanel\|preview_panel\|openPreview" src/lib` → 0 hits (except unrelated `EntityRecordSheet` previews).
- [ ] Row kebab: no Preview item; versionHistory grouping still renders.
- [ ] Header actions column: `Columns3` button opens the columns sheet (same sheet as toolbar CTA).
- [ ] dblclick on a row → new browser tab on the `kind:'detail'` route, focused; parent tab untouched.
- [ ] ArrowLeft/Right unbound; ArrowUp/Down still move row focus; Space/Enter/Escape/pager keys unchanged.
- [ ] `tsc`/svelte-check clean; e2e `entity-list-table-interactions` + `job-triggers-deletion-filter` updated and green.

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
