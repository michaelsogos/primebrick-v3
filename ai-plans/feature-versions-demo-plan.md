# Feature: Version History & Errors Demo (Scroll-Jacking)

## Objective

Create a new scroll-jacking demo page at `/[lang]/demo/versions` that showcases two Primebrick features through progressive disassembly:

1. **Version History** — Audit timeline panel showing entity changes with action icons, version badges, and expandable field-level diffs
2. **Centralized Error Panel** — Impact-colored event cards for runtime errors

The demo follows the same architecture as the 3 completed demos (shell, entity-list-table, exports).

## Empirical Research Summary

### Version History (from FE: VersionHistoryPanel.svelte)
- Opens as a **right-side sheet panel** (420px wide) from row actions or form footer version badge
- **Timeline view** with chronological audit entries
- Each entry shows: version badge (v1, v2...), timestamp, action type with color-coded icon:
  - CREATE/INSERT → green (CircleCheckBig)
  - UPDATE → blue (Info)
  - DELETE/SOFT_DELETE → red (AlertCircle)
  - HARD_DELETE → dark red (CircleX)
  - RESTORE → amber (AlertTriangle)
- User display name who made the change
- **Expandable details** showing field-by-field changes: "changed from X to Y", "set to X", "cleared"
- Special formatting: badges, color swatches, dates
- **Pagination** with "View more" button (50 per page)
- **Read-only** — no restore/revert from panel (restore is a separate row action)
- No side-by-side diff view — linear "changed from X to Y" format

### Error Panel (from FE: ErrorsPanel.svelte)
- Opens from **topbar** TriangleAlert button as right-side sheet (420px)
- **Card-based layout** with vertical stack of event cards
- Each card has: left-side color indicator bar, impact label (uppercase), scope/title, message, tags (HTTP codes), timestamp
- **4 impact levels**: CRITICAL (red), HIGH (red), MEDIUM/WARNING (amber), LOW/INFO (blue)
- Empty state: ThumbsUp icon + "No errors."
- Actions: Clear all, close, "View Details" (opens fullscreen RFC error dialog)
- Error details dialog: Preview/Source toggle, JSON table viewer, metadata panel

### Backend API
- `GET /api/v1/entities/{entity}/{uuid}/audit?page=&limit=` — paginated audit history
- `GET /api/v1/entities/{entity}/{uuid}/audit/{auditLogId}` — field-level diff
- `POST /api/v1/entities/{entity}/{uuid}/restore` — restore soft-deleted entity
- Audit actions: INSERT, UPDATE, SOFT_DELETE, HARD_DELETE, RESTORE
- Delta structure: `Record<string, { old, new }>` or `Record<string, { from, to }>`

## Architecture

### Files to Create

1. **`src/pages/[lang]/demo/versions.astro`** — Demo page (Astro)
2. **`src/scripts/demo/versions-scroll.ts`** — Scroll-jacking engine (TypeScript)
3. **`src/styles/demo/versions.css`** — Page-specific styles
4. **`src/i18n/versions-translations.ts`** — 6-language translations (EN, IT, DE, ES, PT, FR)

### Files to Modify

5. **`src/pages/[lang]/demo/index.astro`** — Remove `coming-soon` class from versions card, add href
6. **`src/i18n/translations.ts`** — Already has `demo.card.versions` keys (no changes needed)
7. **`src/components/svelte/VirtualTourMegaMenu.svelte`** — Enable versions link if needed

### Reuse from Existing Infrastructure

- `demo-utils.ts`: `lerp`, `clamp01`, `smoothstep`, `drawConnector`, `positionAnnotation`, `buildSceneDots`, `fadeScrollHint`
- `demo.css`: Shared design tokens, scroll-track/stage/canvas, section-claim, scene-dots, annotations, screen-mock base
- `DemoHero.astro`: Hero section component
- Entity-list-table screen mock pattern (customers list table as the base mock)

## Demo Phases (11 phases)

The demo uses **two screen mocks** that cross-fade:
1. **Mock A** — Entity list table (customers list with rows) — shows row action entry point
2. **Mock B** — Entity form page (single customer form with footer version badge) — shows form footer entry point

Both entry points share a **single persistent claim** explaining that version history is always accessible, whether from a list or a single entity form.

### Phase Breakdown

| # | Name | Progress | Description |
|---|------|----------|-------------|
| 0 | The Audit System | 0.000–0.040 | Intro — Mock A (list table) full, claim-0 visible |
| 1 | Row Action Entry | 0.040–0.110 | Mock A: row 3-dot dropdown → "Version History" highlighted |
| 2 | Form Footer Entry | 0.110–0.190 | Cross-fade to Mock B (form page): footer version badge "v5" highlighted |
| 3 | Version History Panel | 0.190–0.290 | Version history sheet panel extracts (same panel from both entry points) |
| 4 | Action Icons | 0.290–0.380 | Timeline action icons extract (CREATE/UPDATE/DELETE/RESTORE color-coded) |
| 5 | Field Diffs | 0.380–0.470 | Expandable field-level diff extracts from a timeline entry |
| 6 | Error Panel | 0.470–0.560 | Topbar error button → error sheet panel extracts with event cards |
| 7 | Impact Colors | 0.560–0.640 | Impact-colored event cards extract (CRITICAL/HIGH/MEDIUM/LOW) |
| 8 | Reassembly | 0.640–0.710 | Everything returns to mock |
| 9 | Zoom Back | 0.710–0.780 | Mock scales back to 1.0 |
| 10 | Conclusion | 0.780–0.840 | Final claim visible |

### Section Claims (5, alternating left/right)

| Claim | Phases | Side | Content |
|-------|--------|------|---------|
| claim-0 | 0 | right | "Every change, tracked." — Audit trail intro |
| claim-1 | 1–2 | left | "From list or form." — **Persistent across both entry-point phases**: version history is always accessible, whether from a row action in the list or the version badge in a form footer |
| claim-2 | 3–5 | right | "Field by field." — Version panel + action icons + expandable diffs |
| claim-3 | 6–7 | left | "Errors, centralized." — Error panel + impact colors |
| claim-final | 10 | center | "Every change. Every error. One place." |

### Sub-Extractions (7)

| ID | Phase | Side | Special | Description |
|----|-------|------|---------|-------------|
| row-action | 1 | top | row-action | Mock A: row dropdown menu with "Version History" highlighted |
| form-footer | 2 | bottom | form-footer | Mock B: form page footer with version badge "v5" highlighted |
| version-panel | 3 | right | sheet-right | Version history sheet panel with timeline (shared from both entry points) |
| action-icons | 4 | left | action-icons | Timeline action icons (CREATE/UPDATE/DELETE/RESTORE) |
| field-diff | 5 | bottom | field-diff | Expandable field-level diff card |
| error-panel | 6 | right | sheet-right | Error sheet panel with event cards |
| impact-cards | 7 | left | impact-cards | Impact-colored event cards (CRITICAL/HIGH/MEDIUM/LOW) |

### Scene Dots (8 bullets)

| Label | Target |
|-------|--------|
| Start | 0.0 |
| Row Action | 0.07 |
| Form Footer | 0.15 |
| History | 0.24 |
| Actions | 0.33 |
| Diffs | 0.42 |
| Errors | 0.52 |
| Conclusion | 0.78 |

### Track Height: 2000vh (same as exports)

## Screen Mocks (Two Mocks with Cross-Fade)

### Mock A — Entity List Table (phases 0–1, 8–10)
Reuse the **entity-list-table customers list mock** (collapsed sidebar rail, customers table with rows, bulk toolbar). Add:
- Row action dropdown (3-dot menu) with "Version History" item
- Topbar error button (TriangleAlert icon) with badge count

### Mock B — Entity Form Page (phases 2–7)
A single-customer form page mock (reusing shell demo's phase 4 "content" form layout):
- Collapsed sidebar rail (same as Mock A)
- Topbar with breadcrumb: System > Settings > Customers > Acme Corp
- Form fields: Name, Code, Email, Status (with input/select controls)
- **Footer with version badge "v5"** — clickable badge that opens version history
- The version badge is the key element — highlighted and extracted in phase 2

### Cross-Fade Logic
- Phases 0–1: Mock A visible (opacity 1), Mock B hidden (opacity 0)
- Phase 2 start: Cross-fade Mock A → Mock B over ~30% of phase 2
- Phases 2–7: Mock B visible (opacity 1), Mock A hidden (opacity 0)
- Phase 8 start: Cross-fade Mock B → Mock A over ~30% of phase 8
- Phases 8–10: Mock A visible (opacity 1)

## Extracted Overlays

### 1. Row Action Dropdown (`ex-row-action`)
- 3-dot dropdown menu positioned at a table row in Mock A
- "Version History" item highlighted with FileClock icon
- Connector to the row

### 2. Form Footer Version Badge (`ex-form-footer`)
- Extracted from Mock B's form footer
- Version badge "v5" with a small clock icon
- Annotation explaining: form footer version badge opens the same version history panel
- Connector to the badge

### 3. Version History Panel (`ex-version-panel`)
- Right-side sheet panel (420px wide)
- Header: "Version History" + close button
- Timeline with 4-5 mock entries:
  - v1: CREATE — green icon, "Customer created", user name, timestamp
  - v2: UPDATE — blue icon, "2 fields changed", expandable
  - v3: SOFT_DELETE — red icon, "Customer deleted", user name
  - v4: RESTORE — amber icon, "Customer restored", user name
- Each entry: version badge, timestamp, action icon, user, expand button

### 4. Action Icons (`ex-action-icons`)
- 4 action icons extracted from the timeline (CREATE, UPDATE, DELETE, RESTORE)
- Each with its color and label
- Annotation explaining the color coding

### 5. Field Diff (`ex-field-diff`)
- Expanded diff card from a timeline entry
- Shows 2-3 field changes: "name: changed from 'Acme' to 'Acme Corp'", "status: changed from 'Lead' to 'Active'"
- Annotation explaining field-level tracking

### 6. Error Panel (`ex-error-panel`)
- Right-side sheet panel (420px wide)
- Header: "Errors" + clear/close buttons
- 3-4 mock error cards:
  - CRITICAL: red card, "Database connection lost", scope "Customers API"
  - HIGH: red card, "Permission denied", scope "User Profile"
  - MEDIUM: amber card, "Rate limit approaching", scope "Auth Service"
  - LOW: blue card, "Cache invalidated", scope "System"
- Each card: impact label, scope, message, timestamp

### 7. Impact Cards (`ex-impact-cards`)
- 4 impact-colored cards extracted from the error panel
- Showing the 4 severity levels side by side
- Annotation explaining impact-based prioritization

## Implementation Order (Chunked to Avoid OOM)

### Step 1: Translations file (subagent)
Create `src/i18n/versions-translations.ts` with all 6 languages.

### Step 2: Page HTML structure (subagent)
Create `src/pages/[lang]/demo/versions.astro` with:
- Frontmatter imports
- Standard nav, hero, scroll-track
- **Two screen mocks**: Mock A (entity list table) + Mock B (entity form page)
- All 7 extracted overlay HTML elements
- SVG connector layer
- Section claims (5, with claim-1 persistent across phases 1–2)
- Script initialization

### Step 3: CSS file (subagent)
Create `src/styles/demo/versions.css` with:
- CSS variable overrides
- **Mock A** styles (reuse entity-list-table customers list)
- **Mock B** styles (form page with fields, footer version badge)
- Version panel styles (timeline, action icons, version badges)
- Error panel styles (event cards, impact colors)
- Extracted overlay styles
- Cross-fade transition between Mock A and Mock B
- Responsive adjustments

### Step 4: Scroll script (main session, chunked edits)
Create `src/scripts/demo/versions-scroll.ts` with:
- PHASES (11), SECTIONS (5), SUBS (7) arrays
- Scene dots (8 bullets)
- **Two-mock cross-fade logic** (Mock A ↔ Mock B)
- Screen mock transform (scale, translate)
- Special case handlers for each sub-extraction:
  - `row-action`: Mock A row dropdown
  - `form-footer`: Mock B footer version badge
  - `sheet-right`: Version history + error panels
  - `action-icons`: Timeline icon extraction
  - `field-diff`: Expandable diff card
  - `impact-cards`: 4 severity level cards
- Annotation positioning and connector drawing
- Reassembly and zoom-back logic

### Step 5: Wire up demo hub (main session, small edit)
- Remove `coming-soon` class from versions card in `index.astro`
- Add `versionsHref` link

### Step 6: Verify with Playwright
- Page loads at `http://localhost:4321/en/demo/versions/`
- All phases work
- All connectors visible
- All annotations positioned correctly
- No console errors
- Scroll-back resets

## Acceptance Criteria

1. Page loads at `/en/demo/versions/` with no console errors
2. **Mock A** shows customers list table (reusing entity-list-table pattern)
3. **Mock B** shows entity form page with footer version badge (reusing shell demo form layout)
4. **Cross-fade** between Mock A and Mock B works smoothly at phase 1→2 and phase 7→8
5. 11 phases with progressive disassembly work correctly
6. Row action dropdown extracts from Mock A (phase 1) with "Version History" highlighted
7. Form footer version badge extracts from Mock B (phase 2) with v5 badge highlighted
8. **Single persistent claim-1** visible across both entry-point phases (1–2): "From list or form."
9. Version history panel extracts with timeline (4 mock entries)
10. Action icons extract with color coding (green/blue/red/amber)
11. Field diff card extracts showing field-level changes
12. Error panel extracts with impact-colored event cards
13. Impact cards extract showing 4 severity levels
14. All SVG connectors visible and correctly positioned
15. All annotations positioned correctly with no overlaps
16. Scene dots align with their phases (8 bullets)
17. Scroll-back to top resets everything (including mock cross-fade state)
18. 6 languages supported
19. Demo hub card is enabled (no longer "coming-soon")
20. No technical references (no library names, no framework names)
21. Track height is 2000vh
22. GitFlow release process completed
