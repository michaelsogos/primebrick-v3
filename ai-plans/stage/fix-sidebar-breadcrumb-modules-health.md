# Plan: Restore breadcrumb dropdown, fix profile page layout, remove HOME from dropdown, add health info to modules page, fix reserved services status

## Context

During a previous refactoring, the settings tabbed layout was removed and tabs
were moved into the app sidebar as dynamic navigation. Several things were lost
or broken in the process. This plan addresses 5 issues identified empirically.

## Issue 1: Breadcrumb dropdown on 3rd segment of settings list pages

### Root cause
`settingsTabMenuSegment()` in `settings-breadcrumb.ts` already builds a
dropdown with all 7 settings tabs. The **edit pages** (organizations/[uuid],
users/[uuid]) use it as the 2nd breadcrumb segment. But the **list pages**
(security, modules, templates, email-providers) use **plain text** for the 3rd
segment — the dropdown was lost during refactoring.

### Current state (empirical)
- `security/+page.svelte` lines 70-76: 3 plain segments, no dropdown
- `modules/+page.svelte` lines 133-138: 3 plain segments, no dropdown
- `templates/+page.svelte` line 65: plain segments
- `email-providers/+page.svelte` line 220: plain segments
- `organizations/[uuid]/+page.svelte` lines 203-213: USES `settingsTabMenuSegment` ✓
- `users/[uuid]/+page.svelte` line 232: USES `settingsTabMenuSegment` ✓
- `customers/+page.svelte` lines 758-765: USES `crmModuleMenuSegment` ✓

### Fix
For each settings list page, replace the 3rd plain segment with
`settingsTabMenuSegment(...)`.

**Before** (e.g. security):
```svelte
<AppPageBreadcrumb
  segments={[
    { label: $t('shell.system') },
    { label: $t('shell.settings.title'), href: '/system/settings/profile' },
    { label: $t('shell.settings.tabs.security') }
  ]}
/>
```

**After**:
```svelte
<AppPageBreadcrumb
  segments={[
    { label: $t('shell.system') },
    { label: $t('shell.settings.title'), href: '/system/settings/profile' },
    settingsTabMenuSegment({
      pathname: page.url.pathname,
      searchParams: page.url.searchParams,
      t: (key) => $t(key)
    })
  ]}
/>
```

The `settingsTabMenuSegment` returns a menu segment where:
- `label` = current tab name (e.g. "Security")
- `items` = all 7 tabs with `current` flag set on the active one
- The `AppPageBreadcrumb` component renders this as a dropdown trigger

### Impacted files (FE)
- `primebrick-fe-v3/src/routes/(app)/system/settings/security/+page.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/modules/+page.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/templates/+page.svelte`
- `primebrick-fe-v3/src/routes/(app)/system/settings/email-providers/+page.svelte`

Each file needs:
1. Import `settingsTabMenuSegment` from `$lib/breadcrumb/settings-breadcrumb`
2. Import `page` from `$app/state` (if not already imported)
3. Replace 3rd plain segment with `settingsTabMenuSegment(...)` call

### Acceptance criteria
- On each settings list page, the 3rd breadcrumb segment is a dropdown
- Clicking the dropdown shows all 7 settings tabs
- The current tab is marked as selected in the dropdown
- Clicking a different tab navigates to that page
- Edit pages (organizations/[uuid], users/[uuid]) are NOT changed

---

## Issue 2: Profile page missing title and breadcrumb

### Root cause
`profile/+page.svelte` uses `FormPageLayout` (line 276) **without passing a
`header` snippet**. `FormPageLayout` only renders a header if `header` or
`title` is passed (lines 49-60). All other edit pages (organizations/[uuid],
users/[uuid]) pass a `header` snippet with `AppPageBreadcrumb` + `<h1>`.

### Current state (empirical)
- `profile/+page.svelte` lines 276-283: `FormPageLayout` with only `entity`,
  `rowUuid`, `meta`, `auditData`, `auditingColumns`, `isCreatePage` — NO
  `header`, NO `title`
- `organizations/[uuid]/+page.svelte` lines 201-217: `FormPageLayout` WITH
  `{#snippet header()}` containing `AppPageBreadcrumb` + `<h1>`
- `users/[uuid]/+page.svelte`: same pattern as organizations/[uuid]

### Layouts in use (empirical)
| Layout | Used by | Header mechanism |
|--------|---------|-----------------|
| `AppPageScaffold` | modules, security, customers, pipeline, organizations (list), users (list), email-providers, templates | `{#snippet header()}` with breadcrumb + h1 |
| `AppPageLayout` | (wraps AppPageScaffold, adds breadcrumb+title+actions) | `segments`, `title`, `actions` props |
| `FormPageLayout` | profile, organizations/[uuid], users/[uuid], modules/[code] | `header` snippet OR `title` string + audit box footer |

The profile page is the ONLY `FormPageLayout` consumer that passes neither
`header` nor `title`.

### Fix
Add a `{#snippet header()}` to the profile page's `FormPageLayout` invocation,
matching the pattern used by `organizations/[uuid]`:

```svelte
<FormPageLayout
  entity="user_profiles"
  rowUuid={userUuid}
  meta={(metadata.state.meta as EntityMetadata | null) || undefined}
  auditData={auditData}
  auditingColumns={(metadata.state.meta?.list?.auditingColumns as MetaColumn[] | undefined) || []}
  isCreatePage={isCreatePage}
>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          settingsTabMenuSegment({
            pathname: page.url.pathname,
            searchParams: page.url.searchParams,
            t: (key) => $t(key)
          })
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">
        {$t('shell.settings.profile.title')}
      </h1>
    </div>
  {/snippet}

  {#snippet children()}
    <!-- existing children content -->
  {/snippet}
</FormPageLayout>
```

### Impacted files (FE)
- `primebrick-fe-v3/src/routes/(app)/system/settings/profile/+page.svelte`
  - Import `AppPageBreadcrumb` from `$lib/components/AppPageBreadcrumb.svelte`
  - Import `settingsTabMenuSegment` from `$lib/breadcrumb/settings-breadcrumb`
  - Import `page` from `$app/state` (if not already imported)
  - Add `{#snippet header()}` between `<FormPageLayout ...>` and
    `{#snippet children()}`

### i18n check
- `shell.settings.profile.title` — needs verification. If missing, use
  `$t('shell.settings.tabs.profile')` as the h1 text (this key exists at
  en-GB.json line 192).

### Acceptance criteria
- Profile page shows breadcrumb: System / Settings / [Profile ▾]
- Profile page shows h1 title
- The breadcrumb dropdown shows all 7 settings tabs with Profile marked current
- The audit box footer still works (FormPageLayout footer unchanged)

---

## Issue 3: Remove HOME from module switcher dropdown

### Root cause
`SidebarModuleSwitcher` iterates ALL modules from `shellNav.modules` (fetched
from `/api/v1/modules`). HOME is a reserved module seeded in
`service_registry` with `is_reserved=true`, `route_prefixes: ["/"]`, and
`nav: []` (empty). Selecting HOME calls `shellNav.selectModule('home')` which
loads empty nav — no sidebar links appear, and no navigation occurs. The route
`/` maps to `(app)/+page.svelte` which is an empty `<div>`.

### Current state (empirical)
- `SidebarModuleSwitcher.svelte` lines 51-64: iterates `shellNav.modules`
  with no filtering
- `modules-shell.svelte.ts` `selectModule()`: only loads nav meta, does NOT
  navigate
- `module-nav-meta.ts` lines 16-23: HOME returns `{ nav: [] }` — empty
- `(app)/+page.svelte`: empty `<div class="h-full p-2 sm:p-3"></div>`
- `ModuleInfo` type has `is_reserved?: boolean` (api-types.ts line 7)

### Fix
Filter HOME out of the module switcher dropdown. SETTINGS stays (it has 7 nav
items).

**File**: `primebrick-fe-v3/src/lib/components/sidebar/SidebarModuleSwitcher.svelte`

```svelte
{#each shellNav.modules.filter((m) => m.id !== 'home') as m (m.id)}
```

### Impacted files (FE)
- `primebrick-fe-v3/src/lib/components/sidebar/SidebarModuleSwitcher.svelte`
  — one line change in the `{#each}` block

### Acceptance criteria
- HOME does not appear in the module switcher dropdown
- SETTINGS still appears in the dropdown (it has nav items)
- Selecting SETTINGS still loads its 7-tab nav
- Navigating to `/` still works (route not removed, just dropdown entry)

---

## Issue 4: Add health/instance/scaler info to modules page

### Root cause
The modules page (`/system/settings/modules`) shows only: name, version badge,
description, is_enabled switch, config/delete buttons. It does NOT show
`status`, instance count, or `is_behind_scaler` — even though `ServiceInfo`
has these fields and the VersionsPanel sheet does show them.

### Current state (empirical)
- `modules/+page.svelte` lines 184-237: iterates `services` directly (one card
  per `ServiceInfo` row, NOT grouped by code)
- If multiple instances of the same code exist, multiple cards render (bug)
- No status badge, no instance count, no scaler indicator
- `ServiceInfo` type (api-types.ts lines 35-50) has: `status`, `is_behind_scaler`
- `services-store.svelte.ts` exports `groupByCode()` and `aggregateStatus()`
- `VersionsPanel.svelte` lines 140-201: correctly groups by code, shows
  aggregate status, instance count, scaler info

### Fix
Restructure the modules page to group services by code (like VersionsPanel)
and add inline health info on each card.

#### Step 1: Import grouping utilities
```svelte
import { groupByCode, aggregateStatus } from '$lib/services-store.svelte';
```

#### Step 2: Create a derived grouped view
```svelte
const groupedServices = $derived(groupByCode(services));
```

#### Step 3: Replace the `{#each services}` loop with `{#each groupedServices}`
For each group, show:
- **Status badge**: aggregate status (online/going_live/offline/unknown) with
  colored badge + icon — same styling as VersionsPanel
- **Instance count**: `healthyCount/instances.length` — only when
  `!is_behind_scaler` (same logic as VersionsPanel line 183-187)
- **Scaler indicator**: a small badge/icon when `is_behind_scaler === true`
- **Reserved services**: when `is_reserved === true`, show the BE health chip
  badge instead of the service's own status (same as Issue 5 fix)

#### Step 4: Disable toggle/delete for reserved modules
Reserved modules (HOME, SETTINGS) cannot be disabled or deleted. The current
UI shows toggle/delete buttons for ALL services including reserved ones.

```svelte
{#if !module.is_reserved}
  <Switch checked={module.is_enabled} onCheckedChange={() => handleToggle(module)} />
  <Button ... onclick={() => openConfigPage(module)}>...</Button>
  <Button ... onclick={() => openDeleteDialog(module)}>...</Button>
{:else}
  <Badge variant="outline" class="text-xs">{t('shell.settings.modules.reserved')}</Badge>
{/if}
```

### Impacted files (FE)
- `primebrick-fe-v3/src/routes/(app)/system/settings/modules/+page.svelte`
  - Import `groupByCode`, `aggregateStatus` from `$lib/services-store.svelte`
  - Add `is_reserved` to the `ServiceInfo` type usage (see Issue 5)
  - Restructure the each loop to iterate grouped services
  - Add status badge, instance count, scaler indicator per card
  - Disable toggle/delete/config for reserved modules
- `primebrick-fe-v3/src/lib/api-types.ts`
  - Add `is_reserved?: boolean` to `ServiceInfo` type

### i18n keys needed
- `shell.settings.modules.reserved` — "Reserved" label for reserved modules
- `shell.settings.modules.instances` — "{healthy}/{total} instances" (or reuse
  the existing pattern from VersionsPanel which shows `{healthyCount}/{instances.length}`)
- `shell.settings.modules.behindScaler` — "Behind scaler" label

### Acceptance criteria
- Each module card shows a status badge (online/offline/going_live/unknown)
- Non-scaler modules show instance count (healthy/total)
- Scaler modules show a "behind scaler" indicator
- Reserved modules show BE health badge, not their own status
- Reserved modules have no toggle/delete/config buttons
- Multiple instances of the same code show as ONE card (grouped)

---

## Issue 5: Fix HOME and SETTINGS showing "unknown" status in version panel

### Root cause
The BE seeds HOME and SETTINGS with `status = 'active'` (in
`add_service_registry_is_reserved_and_seed_home_settings.sql` lines 17 and 32).
The FE's `aggregateStatus()` only recognizes `online`, `going_live`, `offline`
— anything else returns `unknown`. There is no `shell.health.active` i18n key.
So 'active' → 'unknown' in the UI.

### User's desired approach
> "set NULL to the status for reserved services and because is_reserved the
> badge is same as the BE badge"

Reserved services are part of the BE itself — their health IS the BE health.
So:
1. BE: Set `status = NULL` for reserved services
2. FE: For reserved services (`is_reserved === true`), show the BE health chip
   badge (same as the one in the top of the VersionsPanel) instead of the
   service's own status

### BE changes

#### Step 1: Make `status` column nullable
**File**: `primebrick-be-v3/db-meta/patches/00000000000003_make_service_registry_status_nullable.sql`
```sql
-- Make status column nullable so reserved services can have NULL status
-- (reserved services are part of the BE shell — their health IS the BE health)
ALTER TABLE public.service_registry
  ALTER COLUMN status DROP NOT NULL;
```

#### Step 2: Update entity definition
**File**: `primebrick-be-v3/src/modules/system/service_registry_entity.ts`
```ts
@Column({ nullable: true, defaultSql: "'unknown'" })
status: string;
```
Change `nullable: false` → `nullable: true`.

#### Step 3: Update reserved services seed to use NULL status
**File**: `primebrick-be-v3/db-meta/fire-and-forget/add_service_registry_is_reserved_and_seed_home_settings.sql`
- Change `'active'` → `NULL` on lines 17 and 32
- Also add an UPDATE for existing databases:
```sql
UPDATE public.service_registry SET status = NULL WHERE is_reserved = true;
```

#### Step 4: Verify stale-detection job skips reserved services
`stale-detection-job.ts` line 49: `s.last_health_check_at &&` — reserved
services have NULL `last_health_check_at`, so they're already skipped. No
change needed.

### FE changes

#### Step 1: Add `is_reserved` to `ServiceInfo` type
**File**: `primebrick-fe-v3/src/lib/api-types.ts`
```ts
export type ServiceInfo = {
  // ... existing fields ...
  is_reserved?: boolean;  // ADD THIS
};
```
The BE already returns `is_reserved` in the `/api/v1/system/services`
response (it's in the projection at `service-registry-repo.ts` line 158).

#### Step 2: Update VersionsPanel to show BE health badge for reserved services
**File**: `primebrick-fe-v3/src/lib/shell/sheets/panels/VersionsPanel.svelte`

In the `groupedServices` loop (around line 140), add a reserved check:

```svelte
{#each groupedServices as [code, instances] (code)}
  {@const isReserved = instances[0].is_reserved === true}
  {@const aggStatus = aggregateStatus(instances)}
  ...
  <div class="flex shrink-0 items-center gap-2">
    {#if isReserved}
      <!-- Reserved services: show BE health badge -->
      <Badge
        variant="outline"
        class={cn('gap-1 font-mono text-[11px] font-medium', healthChipClass)}
      >
        {#if healthChip === 'backend_offline'}
          <CloudOff class="size-3.5 opacity-90" />
        {:else if healthChip === 'db_offline'}
          <Database class="size-3.5 opacity-90" />
        {:else if healthChip === 'idp_offline'}
          <ShieldAlert class="size-3.5 opacity-90" />
        {:else}
          <Cloud class="size-3.5 opacity-90" />
        {/if}
        <span>{healthChipLabel}</span>
      </Badge>
    {:else}
      <!-- Non-reserved: show service's own status -->
      <Badge variant="outline" class={cn('gap-1 font-mono text-[11px] font-medium', statusBadgeClass(aggStatus))}>
        <!-- existing status badge logic -->
      </Badge>
    {/if}
    <!-- version badge, instance count (skip for reserved) -->
  </div>
```

For reserved services:
- Skip instance count badge (they have no instances)
- Skip instance row expansion (they have no instances)
- Show BE health badge instead of service status badge

### Impacted files
**BE:**
- `primebrick-be-v3/db-meta/patches/00000000000003_make_service_registry_status_nullable.sql` (NEW)
- `primebrick-be-v3/src/modules/system/service_registry_entity.ts` (nullable: true)
- `primebrick-be-v3/db-meta/fire-and-forget/add_service_registry_is_reserved_and_seed_home_settings.sql` (status → NULL)

**FE:**
- `primebrick-fe-v3/src/lib/api-types.ts` (add `is_reserved` to ServiceInfo)
- `primebrick-fe-v3/src/lib/shell/sheets/panels/VersionsPanel.svelte` (reserved → BE health badge)

### Acceptance criteria
- HOME and SETTINGS show the BE health badge (online/offline/db_offline/idp_offline) in the version panel
- When BE is healthy, HOME and SETTINGS show "Online" (green)
- When BE is offline, HOME and SETTINGS show "Offline" (red)
- Non-reserved services still show their own status badge
- `pnpm run check` passes (FE)
- `pnpm run build` passes (BE)
- `pnpm run db:migrate` applies the new patch successfully

---

## Execution order

1. **FE Issue 3** (remove HOME from dropdown) — 1 line, lowest risk
2. **FE Issue 1** (breadcrumb dropdown on list pages) — 4 files, mechanical
3. **FE Issue 2** (profile page header) — 1 file, mechanical
4. **FE Issue 5** (ServiceInfo type + VersionsPanel) — 2 files
5. **BE Issue 5** (status nullable + seed) — 3 files, requires db:migrate
6. **FE Issue 4** (modules page health info) — 1 file + 1 type file, largest FE change

After each FE change: `pnpm run check`
After BE changes: `pnpm run build`

## i18n keys to add (all locales)

Check and add if missing:
- `shell.settings.modules.reserved` — "Reserved"
- `shell.settings.modules.behindScaler` — "Behind scaler"
- `shell.settings.modules.instances` — "{healthy}/{total} instances" (if not reusing raw format)
- `shell.settings.profile.title` — verify exists, or use `shell.settings.tabs.profile`

All 7 locale files must be updated:
- `en-GB.json`, `it-IT.json`, `pt-PT.json`, `fr-FR.json`, `es-ES.json`, `de-DE.json`
- (Check if there are more locale files)
