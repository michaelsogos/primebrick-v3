
# Plan: Sidebar Badge Tooltip Removal, Version Panel Layout, Microservice Labeling & Status Fixes

## Session Info
- **Date**: 2026-07-11
- **Scope**: Frontend only (`primebrick-fe-v3`) — no BE/SDK/US changes required
- **Mode**: Plan → await user approval → execute

---

## Objectives

1. **Remove the tooltip** from the app sidebar health badge entirely
2. **Move the BE status badge** from the version panel header to sit next to the BE version line (like microservices)
3. **Rename "Shell" → "Web Shell"** in the version panel label
4. **Use service `name` in microservices section**, show the `code` as a note, and display `description` if available
5. **Make microservice status labels short** (1-2 words), matching BE badge style; add "Unknown" status
6. **Change the UNKNOWN status dot color** from dark grey (`bg-muted-foreground`) to a lighter grey

---

## Detailed Analysis — Current State (Empirically Verified)

### Item 1: Sidebar Badge Tooltip

**File**: `primebrick-fe-v3/src/lib/components/sidebar/SidebarHealthBadge.svelte` (78 lines)

The entire component is wrapped in a `Tooltip.Root` / `Tooltip.Trigger` / `Tooltip.Content` structure:
- Lines 24-25: `<Tooltip.Root>` + `<Tooltip.Trigger>`
- Lines 26-56: `{#snippet child({ props: tooltipProps })}` wrapping the `<button>` with `{...tooltipProps}`
- Lines 58-77: `<Tooltip.Content>` with status label, shell version, backend version
- Line 78: `</Tooltip.Root>`

**Imports to remove**: Line 2 `import * as Tooltip from '$lib/components/ui/tooltip';`

**What remains**: The `<button>` with the `<Badge>` inside, keeping the `onclick` that opens the versions sheet.

### Item 2: BE Status Badge Position in Version Panel

**File**: `primebrick-fe-v3/src/lib/shell/sheets/panels/VersionsPanel.svelte` (198 lines)

**Current layout**:
- **Header** (headerActions snippet, lines 58-86): Contains the BE health status badge (lines 60-77) + close button (lines 78-84)
- **Body — BE version line** (lines 101-106): Shows only `Backend` label + version badge. NO status badge next to it.
- **Body — Microservice lines** (lines 143-170): Shows `[name] ... [version badge] [status badge] [count badge]` — status badge is NEXT TO version badge.

**User wants**: The BE status badge should be next to the BE version line (like microservices), not in the header.

**Change**: 
- Remove the BE status badge from `headerActions` (lines 60-77)
- Add the BE status badge next to the BE version badge in the body (lines 101-106)
- `headerActions` will only contain the close button

### Item 3: Rename "Shell" → "Web Shell"

**i18n key**: `shell.health.shellVersion`

**Current value in all 6 language files**: `"shellVersion": "Shell"`

**Files to update** (all 6):
| File | Line |
|------|------|
| `src/lib/i18n/messages/en-GB.json` | 447 |
| `src/lib/i18n/messages/it-IT.json` | 447 |
| `src/lib/i18n/messages/de-DE.json` | 442 |
| `src/lib/i18n/messages/es-ES.json` | 443 |
| `src/lib/i18n/messages/fr-FR.json` | 443 |
| `src/lib/i18n/messages/pt-PT.json` | 443 |

**New value**: `"shellVersion": "Web Shell"` (same in all languages — it's a product name)

**Usage sites** (verified by grep):
- `VersionsPanel.svelte` line 95: `{$t('shell.health.shellVersion')}` — remains
- `SidebarHealthBadge.svelte` line 65: `{$t('shell.health.shellVersion')}` — will be removed (tooltip removal, item 1)

### Item 4: Microservice Name, Code, Description

**Data model verification** (end-to-end):
- **BE entity** (`primebrick-be-v3/src/modules/system/service_registry_entity.ts`): `name?: string` (nullable column), `description?: string` (nullable column) — ALREADY EXIST
- **SDK** (`primebrick-v3-sdk/src/service/service-registry.ts`): `name?: string`, `description?: string` — ALREADY EXIST
- **FE type** (`primebrick-fe-v3/src/lib/api-types.ts` lines 20-21): `name?: string`, `description?: string` — ALREADY EXIST
- **US EmailSender** (`primebrick-us-v3/emailsender/src/index.ts` lines 114-115): `name: "Email Sender"`, `description: "Email sending microservice"` — ALREADY POPULATED

**Conclusion**: No backend/SDK changes needed. `name` and `description` already exist end-to-end.

**Current FE rendering** (`VersionsPanel.svelte` line 140):
```svelte
{@const displayName = instances[0].name || code}
```
Line 144: `<div class="truncate text-muted-foreground">{displayName}</div>`

Only shows `name` (or `code` fallback). Does NOT show `code` separately. Does NOT show `description`.

**Change**: Show `name` as primary label, `code` as a monospace note/badge, and `description` as a secondary line if available.

### Item 5: Microservice Status Labels — Shorten & Add "Unknown"

**Current i18n labels for microservice statuses**:

| Language | online | going_live | offline | unknown |
|----------|--------|------------|---------|---------|
| en-GB | "Online" | "Going Live" | "Offline" | ❌ missing |
| it-IT | "In linea" | "Avvio in corso" | "Non in linea" | ❌ missing |
| de-DE | "Online" | "Wird gestartet" | "Offline" | ❌ missing |
| es-ES | "En línea" | "Iniciándose" | "Sin conexión" | ❌ missing |
| fr-FR | "En ligne" | "Démarrage en cours" | "Hors ligne" | ❌ missing |
| pt-PT | "Online" | "Iniciando" | "Offline" | ❌ missing |

**BE badge labels** (for comparison — the pattern to match):

| Language | beOnline | beOffline |
|----------|----------|-----------|
| en-GB | "Online" | "Offline" |
| it-IT | "Online" | "Offline" |
| de-DE | "Online" | "Offline" |
| es-ES | "En línea" | "Sin conexión" |
| fr-FR | "En ligne" | "Hors ligne" |
| pt-PT | "Online" | "Offline" |

**Issues**:
1. Italian microservice labels don't match BE labels: "In linea" vs "Online", "Non in linea" vs "Offline"
2. "Avvio in corso" (IT) and "Démarrage en cours" (FR) are 3 words — too long
3. No "unknown" status label exists in any language
4. The BE entity defaults `status` to `'unknown'` (verified in `service_registry_entity.ts`)

**`aggregateStatus` function** (`primebrick-fe-v3/src/lib/services-store.svelte.ts` lines 41-46):
```typescript
export function aggregateStatus(instances: ServiceInfo[]): string {
  if (instances.length === 0) return 'offline';
  if (instances.every((i) => i.status === 'online')) return 'online';
  if (instances.some((i) => i.status === 'online')) return 'going_live';
  return 'offline'; // ← maps 'unknown' to 'offline'
}
```
Currently maps any non-'online' status to 'offline'. Need to add 'unknown' as a distinct aggregate status.

**Proposed new labels** (1-2 words max, matching BE badge style):

| Language | online | going_live | offline | unknown |
|----------|--------|------------|---------|---------|
| en-GB | "Online" | "Starting" | "Offline" | "Unknown" |
| it-IT | "Online" | "Avvio" | "Offline" | "Sconosciuto" |
| de-DE | "Online" | "Startet" | "Offline" | "Unbekannt" |
| es-ES | "En línea" | "Iniciando" | "Sin conexión" | "Desconocido" |
| fr-FR | "En ligne" | "Démarrage" | "Hors ligne" | "Inconnu" |
| pt-PT | "Online" | "Iniciando" | "Offline" | "Desconhecido" |

**`aggregateStatus` change**:
```typescript
export function aggregateStatus(instances: ServiceInfo[]): string {
  if (instances.length === 0) return 'offline';
  if (instances.every((i) => i.status === 'online')) return 'online';
  if (instances.some((i) => i.status === 'online')) return 'going_live';
  if (instances.every((i) => i.status === 'offline')) return 'offline';
  return 'unknown'; // mixed unknown/offline or all unknown
}
```

**`statusBadgeClass` change** (`VersionsPanel.svelte` lines 27-38): Add `unknown` case:
```typescript
case 'unknown':
  return 'border-border/60 bg-muted/30 text-muted-foreground';
```
(The default case already returns this, but adding an explicit `unknown` case is clearer.)

**`statusDotClass` change** (`VersionsPanel.svelte` lines 40-51): Add `unknown` case with lighter grey:
```typescript
case 'unknown':
  return 'bg-neutral-400 dark:bg-neutral-500';
```

**Status badge icon** (`VersionsPanel.svelte` lines 155-161): Add `unknown` case. Currently the `{:else}` branch shows `CloudOff` for everything non-online/non-going_live. Need to add an `unknown` branch with a different icon (e.g., `HelpCircle` or `CircleDashed`).

### Item 6: Unknown Status Dot Color

**File**: `primebrick-fe-v3/src/lib/shell/sheets/panels/VersionsPanel.svelte`

**Current** (`statusDotClass` line 48-49):
```typescript
default:
  return 'bg-muted-foreground';
```
`bg-muted-foreground` renders as dark grey/black in dark mode.

**Change**: Replace the default case and add explicit `unknown` case:
```typescript
case 'unknown':
  return 'bg-neutral-400 dark:bg-neutral-500';
default:
  return 'bg-neutral-400 dark:bg-neutral-500';
```
`neutral-400` is a lighter grey, `neutral-500` for dark mode ensures visibility.

**Dot rendering** (line 178):
```svelte
<div class={cn('size-2 rounded-full', statusDotClass(inst.status))}></div>
```
No change needed to the rendering itself — only the `statusDotClass` function.

---

## Impacted Files

| # | File | Changes |
|---|------|---------|
| 1 | `primebrick-fe-v3/src/lib/components/sidebar/SidebarHealthBadge.svelte` | Remove Tooltip wrapper, keep button+badge+onclick |
| 2 | `primebrick-fe-v3/src/lib/shell/sheets/panels/VersionsPanel.svelte` | Move BE status badge from header to body; add code/description to microservice rows; add unknown status to statusBadgeClass/statusDotClass; add unknown icon |
| 3 | `primebrick-fe-v3/src/lib/services-store.svelte.ts` | Update `aggregateStatus` to return 'unknown' |
| 4 | `primebrick-fe-v3/src/lib/i18n/messages/en-GB.json` | shellVersion→"Web Shell"; going_live→"Starting"; add "unknown":"Unknown" |
| 5 | `primebrick-fe-v3/src/lib/i18n/messages/it-IT.json` | shellVersion→"Web Shell"; online→"Online"; going_live→"Avvio"; offline→"Offline"; add "unknown":"Sconosciuto" |
| 6 | `primebrick-fe-v3/src/lib/i18n/messages/de-DE.json` | shellVersion→"Web Shell"; going_live→"Startet"; add "unknown":"Unbekannt" |
| 7 | `primebrick-fe-v3/src/lib/i18n/messages/es-ES.json` | shellVersion→"Web Shell"; going_live→"Iniciando"; add "unknown":"Desconocido" |
| 8 | `primebrick-fe-v3/src/lib/i18n/messages/fr-FR.json` | shellVersion→"Web Shell"; going_live→"Démarrage"; add "unknown":"Inconnu" |
| 9 | `primebrick-fe-v3/src/lib/i18n/messages/pt-PT.json` | shellVersion→"Web Shell"; add "unknown":"Desconhecido" |

**Total**: 9 files (1 sidebar component, 1 panel component, 1 store, 6 i18n files)

---

## Execution Plan (Atomic Steps)

### Step 1: Remove tooltip from SidebarHealthBadge.svelte
- Remove `import * as Tooltip from '$lib/components/ui/tooltip';` (line 2)
- Remove `Tooltip.Root`, `Tooltip.Trigger`, `{#snippet child(...)}`, `Tooltip.Content` wrappers
- Keep the `<button>` with its `onclick`, `aria-label`, and `<Badge>` content
- Remove `healthChipTextClass` derived (only used in tooltip content)
- Remove `chipTextClass` from import (only used in tooltip content)
- Run `pnpm run check` to verify

### Step 2: Move BE status badge in VersionsPanel.svelte
- Remove the BE status badge from `headerActions` snippet (lines 60-77)
- Keep only the close button in `headerActions`
- Add the BE status badge next to the BE version badge (lines 101-106)
- The BE version line becomes: `Backend  [v1.0.0] [Online]` (matching microservice pattern)
- Run `pnpm run check` to verify

### Step 3: Rename "Shell" → "Web Shell" in all 6 i18n files
- Update `shellVersion` value from `"Shell"` to `"Web Shell"` in all 6 language files
- Run `pnpm run check` to verify

### Step 4: Update microservice status labels in all 6 i18n files
- Shorten `going_live` labels to 1-2 words
- Fix Italian `online`/`offline` to match BE badge ("Online"/"Offline")
- Add `unknown` status label in all 6 languages
- Run `pnpm run check` to verify

### Step 5: Update `aggregateStatus` in services-store.svelte.ts
- Add 'unknown' as a distinct return value when instances are not online and not all offline
- Run `pnpm run check` to verify

### Step 6: Update VersionsPanel.svelte — status functions & microservice display
- Add `unknown` case to `statusBadgeClass` function
- Add `unknown` case to `statusDotClass` function with lighter grey (`bg-neutral-400 dark:bg-neutral-500`)
- Change `default` case in `statusDotClass` to lighter grey
- Add `unknown` icon branch in the status badge (import `HelpCircle` from lucide)
- Update microservice group header to show `name` as primary, `code` as monospace note, `description` as secondary line
- Run `pnpm run check` to verify

### Step 7: Final verification
- Run `pnpm run check` (full typecheck)
- Visual verification via dev server (if running on port 5173)

---

## Acceptance Criteria

1. **No tooltip** appears when hovering over the sidebar health badge — the badge is a direct button that opens the versions sheet on click
2. **BE status badge** appears next to the BE version line in the version panel body (not in the header)
3. **"Web Shell"** label appears in the version panel instead of "Shell"
4. **Microservice rows** show: service `name` as primary label, `code` as a monospace note, `description` as a secondary line (if available)
5. **Microservice status labels** are 1-2 words max, matching BE badge style ("Online"/"Offline" in Italian)
6. **"Unknown" status** has its own label, badge style, and icon
7. **Unknown status dot** is lighter grey (`neutral-400`/`neutral-500`) instead of dark `muted-foreground`
8. **`pnpm run check`** passes with no errors
9. All 6 i18n files have the new/updated keys

---

## Rules Compliance Checklist

- [x] `.devin/rules/` read — all rules checked (workflow, code-guardrails, temp-files, file-operations, data-model-conventions, dev-server, always-check-rules-first)
- [x] `AGENTS.md` read — Svelte 5 runes, i18n rules, error notification rules
- [x] Plan file created in `primebrick-workspace/ai-plans/`
- [x] No source code modified during planning phase
- [x] No dev server started
- [x] Data model conventions: snake_case preserved (no field renaming)
- [x] i18n: all 6 language files updated with new/changed keys
- [x] Atomic changes: each step is independently verifiable with `pnpm run check`
- [x] Scope locking: no function signature changes except `aggregateStatus` (adding new return value, no signature change)

---

## MCP Tools & AI Rules Used

- **Subagents** (5 parallel `subagent_explore`): Explored sidebar tooltip, version panel, shell label, microservice status, BE/SDK/FE/US data model
- **grep**: Verified i18n key usage, status label locations, `statusTooltip` references
- **read**: Read all relevant source files (SidebarHealthBadge.svelte, VersionsPanel.svelte, useHealthChip.svelte.ts, services-store.svelte.ts, api-types.ts, backend-availability.svelte.ts, all 6 i18n files, SidebarVersionBadge.svelte, i18n.md docs)
- **Svelte MCP**: Will be used during execution to verify Svelte 5 component correctness
- **Code guardrails**: Max 2 retry attempts on lint/check failures, then halt
- **Workflow rule**: Plan file in `ai-plans/`, halt and wait for "PROCEED"

---

## Notes

- The `statusTooltip` i18n key exists in all 6 language files but is NOT referenced in any component (orphaned key). It can be optionally cleaned up but is out of scope for this plan.
- The `SidebarVersionBadge.svelte` component does NOT use `shellVersion` — it uses `versionsTitle` for aria-label. No change needed there.
- The `description` field is optional — when absent, the secondary line should not be rendered (no fake defaults per data-model-conventions rule).
- The `code` is always present (non-optional in the data model), so it can always be shown as a note.

---
