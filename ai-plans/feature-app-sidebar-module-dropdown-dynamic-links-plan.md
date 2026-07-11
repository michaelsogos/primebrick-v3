# Plan: App Sidebar — Module Dropdown + Dynamic Module Links + Reserved Modules in service_registry (v3)

**Created:** 2026-07-11 (v3 — incorporates user decisions on HOME/SETTINGS as reserved service_registry records, no placeholder, module switcher in current position with "Module" label, all empirical checks done at plan level)
**Status:** DRAFT — Awaiting Approval
**Scope:** FE (primary) + BE (service_registry reserved records + module meta endpoint + migration) + i18n (6 locales)
**Author:** Devin (planning phase, empirical codebase analysis — zero assumptions)

---

## 0. Executive Summary

Refactor the Primebrick app sidebar from a static "Modules list + demo Settings group" into a **two-tier dynamic navigation** where ALL modules — including HOME and SETTINGS — are real `service_registry` records with `is_reserved: true`. One logic for all. No fake/virtual module logic in the FE.

1. **Module dropdown** (same visual pattern as `SidebarOrgSwitcher`) — replaces the flat module list. Stays in its **current position** in the sidebar body with a group label **"Module"** (singular). Populated exclusively from `GET /api/v1/modules`, which now returns ALL modules including two reserved ones: `home` and `settings`.
2. **Dynamic module links** (max 2 levels) — driven by `GET /api/v1/modules/:code/meta`, using a single repeatable `ModuleNav` model for ALL modules. Rendered via a recursive Svelte 5 `Snippet`.
3. **Global shell auto-sync** — `syncModuleFromRoute(pathname)` in the shell store runs via `$effect` on every navigation. No placeholder — the module is always auto-selected from the URL. HOME module matches `/` ; SETTINGS matches `/system/settings`.
4. **HOME and SETTINGS are reserved service_registry records** — seeded via DB migration with `is_reserved: true`. They appear in the module dropdown and modules management page like any other module. They cannot be disabled or deleted. One logic for all modules.
5. **Settings tab layout removed** — the 7 settings tabs become dynamic sidebar links from `GET /api/v1/modules/settings/meta`. Each settings sub-page gets its own `AppPageScaffold` (6 pages need wrapping — empirically verified).

---

## 1. Answers to the Four Architectural Questions (v3)

### 1.1 Svelte 5 Reactivity ($derived, $effect, $state, Snippets)

**Shell store** (`modules-shell.svelte.ts`):
- `$state` — consolidated `_state` object (per AGENTS.md composable pattern: `_state` + `DeepReadonly` getter + mutator functions).
- No `$derived` inside the store — it exposes raw state and mutators; consumers compute `$derived` in their component context.

**AppSidebar.svelte**:
- `$derived` for: `moduleNav`, `moduleNavLoading`, `moduleNavError`, `navItems` (the nav array from moduleNav).
- `$effect` for: auto-sync — watches `page.url.pathname` + `shellNav.modules` and calls `shellNav.syncModuleFromRoute(pathname)`.
- `$state` for: `openGroups: Record<string, boolean> = {}` — tracks which collapsible level-1 parents are open.
- `Snippet` — `navLinkSnippet` for recursive 2-level rendering.

**SidebarModuleSwitcher.svelte**:
- `$derived` for: `selectedModule` (from `shellNav.modules` + `shellNav.selectedModuleId`).
- No `$effect` — selection is a user click action.

**DynamicIcon.svelte** (existing, verified empirically):
- Already uses `$state` + `$effect` + `import.meta.glob`. Accepts `name: string` (kebab-case Lucide name). No changes needed. **Verified:** `src/lib/components/ui/dynamic-icon/DynamicIcon.svelte` lines 1-60.

### 1.2 Global Shell Method for Auto-Loading Metadata on Page Load

**New method**: `syncModuleFromRoute(pathname: string)` in the shell store.

**How it works**:
1. `GET /api/v1/modules` returns `route_prefixes: string[]` per module. HOME → `['/']`, CRM → `['/customers', '/crm']`, SETTINGS → `['/system/settings']`.
2. `resolveModuleFromRoute(pathname)` iterates `shellNav.modules` and returns the first module whose any `route_prefix` matches `pathname === prefix || pathname.startsWith(prefix + '/')`. **Special case for HOME**: the `/` prefix matches ONLY when `pathname === '/'` (exact match, no `startsWith` — otherwise every route would match HOME).
3. `syncModuleFromRoute(pathname)` calls `resolveModuleFromRoute`, and if the result differs from `selectedModuleId`, calls `selectModule(id)` which loads the module's metadata via `GET /api/v1/modules/:code/meta`.
4. In `AppSidebar.svelte`, a `$effect` watches `page.url.pathname` and calls `shellNav.syncModuleFromRoute(page.url.pathname)`. This runs on every navigation — page load, client-side navigation, deep-link, back/forward.
5. The `$effect` guards against running before modules are loaded (`if (shellNav.loading || shellNav.modules.length === 0) return;`).

**No placeholder ever.** The module is always auto-selected from the URL. On first visit to `/`, HOME is selected. On `/customers`, CRM is selected. On `/system/settings/profile`, SETTINGS is selected.

### 1.3 Unique Repeatable Metadata Model for Modules

**ONE type, used by ALL modules** (BE-served microservices AND reserved HOME/SETTINGS):

```ts
// src/lib/api-types.ts

export type ModuleNavLink = {
  id: string;
  label_key: string;
  href: string;
  icon?: string;
  children?: ModuleNavLink[];
};

export type ModuleNav = {
  module: string;
  icon?: string;
  nav: ModuleNavLink[];
};
```

**Extended `ModuleInfo`** (the lightweight list from `/modules`):

```ts
export type ModuleInfo = {
  id: string;
  name: string;
  enabled: boolean;
  icon?: string;
  route_prefixes?: string[];
  is_reserved?: boolean;
};
```

**No separate types for settings or home.** Both use the exact same `ModuleInfo` and `ModuleNav` types. The BE serves their metadata from the same endpoint. The FE renders them through the same loop and the same snippet. There is exactly ONE metadata model.

### 1.4 HOME and SETTINGS as Reserved service_registry Records (No FE Hardcoding)

**Principle**: the FE never hardcodes module identities. The BE is the single source of truth for which modules exist. HOME and SETTINGS are real `service_registry` rows with `is_reserved: true` — they appear in the module dropdown and the modules management page like any other module. They cannot be disabled or deleted. One logic for all.

**DB migration**: add `is_reserved` column to `service_registry` + seed HOME and SETTINGS rows.

**New fire-and-forget migration file**: `primebrick-be-v3/db-meta/fire-and-forget/add_service_registry_is_reserved_and_seed_home_settings.sql`:
```sql
-- Add is_reserved column to service_registry for existing databases.
-- New databases get this column directly from the init patch (updated separately).
-- This script is idempotent (IF NOT EXISTS) and safe to run multiple times.

ALTER TABLE public.service_registry
  ADD COLUMN IF NOT EXISTS is_reserved boolean NOT NULL DEFAULT false;

-- Seed reserved HOME module (cannot be disabled/deleted, always present)
INSERT INTO public.service_registry (
  code, base_url, endpoints, name, description, is_behind_scaler,
  status, is_enabled, icon, icon_type, is_reserved,
  created_at, created_by, updated_at, updated_by, version
) VALUES (
  'home',
  '',
  '{}'::jsonb,
  'Home',
  'Primebrick home dashboard — reserved shell module',
  true,
  'active',
  true,
  'layout-grid',
  'icon',
  true,
  now(), 'system', now(), 'system', 1
) ON CONFLICT DO NOTHING;

-- Seed reserved SETTINGS module (cannot be disabled/deleted, always present)
INSERT INTO public.service_registry (
  code, base_url, endpoints, name, description, is_behind_scaler,
  status, is_enabled, icon, icon_type, is_reserved,
  created_at, created_by, updated_at, updated_by, version
) VALUES (
  'settings',
  '',
  '{}'::jsonb,
  'Settings',
  'Primebrick system settings — reserved shell module',
  true,
  'active',
  true,
  'settings',
  'icon',
  true,
  now(), 'system', now(), 'system', 1
) ON CONFLICT DO NOTHING;
```

**Note on ON CONFLICT**: there is no unique constraint on `code` alone for `is_behind_scaler = true` rows — but there IS `service_registry_code_uq_scaler` which enforces uniqueness on `code` WHERE `is_behind_scaler = true` (verified empirically in `db-meta/patches/00000000000000_init_database.sql` lines 314-315). Both seeded rows have `is_behind_scaler = true`, so `ON CONFLICT (code) WHERE is_behind_scaler = true DO NOTHING` would be ideal — but PostgreSQL doesn't support partial unique conflict targets in ON CONFLICT. **Alternative**: use `ON CONFLICT ON CONSTRAINT service_registry_code_uq_scaler DO NOTHING`. **Verify during implementation** that this constraint name is usable as an ON CONFLICT target. If not, wrap in a `WHERE NOT EXISTS` guard.

**Update init patch**: `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql` — add `is_reserved` column to the CREATE TABLE (line 302, after `icon_type`) + add the same two seed INSERTs after the existing seed data (after line 390).

**BE entity update**: `primebrick-be-v3/src/modules/system/service_registry_entity.ts` — add field after line 59:
```ts
@Column({ nullable: false, defaultSql: "false" })
is_reserved: boolean;
```

**BE `/modules` handler** (`primebrick-be-v3/src/index.ts` line 154): now simply reads ALL `service_registry` rows (including reserved ones) and maps them to `ModuleInfo`. No special appending — the reserved rows are in the DB:
```ts
apiRouter.get("/modules", rbacHandler([Permission.MODULES_READ_ALL]), async (_req, res) => {
  const repo = new ServiceRegistryRepo(getPool());
  const services = await repo.findAll(); // includes reserved rows
  const modules = services.map((s) => {
    const navMeta = buildModuleNavMeta(s.code);
    return {
      id: s.code.toLowerCase(),
      name: s.name || s.code,
      enabled: s.is_enabled,
      icon: s.icon || navMeta?.icon,
      route_prefixes: navMeta?.route_prefixes,
      is_reserved: s.is_reserved,
    };
  });
  res.json({ modules });
});
```

**BE nav meta registry**: `primebrick-be-v3/src/modules/module-nav-meta.ts` — returns `ModuleNav` + `route_prefixes` per module code. HOME returns empty nav (no sidebar links — it's the empty landing page). SETTINGS returns the 7 settings links:
```ts
export function buildModuleNavMeta(code: string): ModuleNav & { route_prefixes: string[] } | null {
  switch (code.toLowerCase()) {
    case "home":
      return {
        module: "home",
        icon: "layout-grid",
        route_prefixes: ["/"],
        nav: [],  // no sidebar links — empty landing page
      };
    case "crm":
      return {
        module: "crm",
        icon: "users",
        route_prefixes: ["/customers", "/crm"],
        nav: [
          { id: "customers", label_key: "entities.customer.title", href: "/customers", icon: "users" },
          { id: "pipeline", label_key: "entities.crm.pipeline.nav", href: "/crm/pipeline", icon: "git-branch" },
        ],
      };
    case "settings":
      return {
        module: "settings",
        icon: "settings",
        route_prefixes: ["/system/settings"],
        nav: [
          { id: "profile",         label_key: "shell.settings.tabs.profile",        href: "/system/settings/profile",        icon: "user" },
          { id: "organizations",   label_key: "shell.settings.tabs.organizations",  href: "/system/settings/organizations",  icon: "building-2" },
          { id: "users",           label_key: "shell.settings.tabs.users",          href: "/system/settings/users",          icon: "users" },
          { id: "security",        label_key: "shell.settings.tabs.security",       href: "/system/settings/security",       icon: "shield-check" },
          { id: "modules",         label_key: "shell.settings.tabs.modules",        href: "/system/settings/modules",        icon: "package" },
          { id: "templates",       label_key: "shell.settings.tabs.templates",      href: "/system/settings/templates",      icon: "file-text" },
          { id: "email-providers", label_key: "shell.settings.tabs.emailProviders", href: "/system/settings/email-providers", icon: "mail" },
        ],
      };
    default:
      return null;
  }
}
```

**BE `/modules/:code/meta` endpoint**:
```ts
apiRouter.get("/modules/:code/meta", rbacHandler([Permission.MODULES_READ_ALL]), async (req, res) => {
  const code = req.params.code as string;
  const meta = buildModuleNavMeta(code);
  if (!meta) {
    res.status(404).json({
      type: "about:blank",
      title: "Module not found",
      status: 404,
      detail: `No module with code '${code}'`,
    });
    return;
  }
  // Strip route_prefixes from the response — it's only needed in the /modules list
  const { route_prefixes, ...navMeta } = meta;
  res.json(navMeta);
});
```

**Why this is NOT "hardcoded" in the problematic sense**:
- The FE has ZERO hardcoded module identities. It loops `shellNav.modules` and renders whatever the BE returns.
- HOME and SETTINGS exist as real DB rows — they appear in the modules management page, can be listed, inspected, but not disabled/deleted (because `is_reserved = true`).
- The BE having a nav meta registry (`module-nav-meta.ts`) is the BE's responsibility — same as `customerMeta` being a constant in `customers.meta.ts`.
- Long-term: microservices will self-describe their nav via NATS, and `buildModuleNavMeta` for non-reserved modules will read from `service_registry.endpoints` jsonb. HOME and SETTINGS stay BE constants forever because they're part of the Primebrick shell.

---

## 2. Detailed Objectives

### 2.1 Transform the "Modules" section into a dropdown (in current position, "Module" label)

**User decision**: the module switcher stays in its **current position** in the sidebar body (not the header), with a group label **"Module"** (singular, not "Modules").

- **Remove** the current `Sidebar.Group` with `GroupLabel "shell.nav.modulesGroup"` and the flat `{#each shellNav.modules}` list (AppSidebar.svelte lines 146–250).
- **New component** `SidebarModuleSwitcher.svelte` (under `src/lib/components/sidebar/`) mirroring `SidebarOrgSwitcher.svelte`:
  - `Sidebar.Menu` → `Sidebar.MenuItem` → `DropdownMenu.Root` → `DropdownMenu.Trigger` (child snippet wrapping `Sidebar.MenuButton size="lg"`) → `DropdownMenu.Content`.
  - Trigger: module icon (in `size-8` rounded box, like org avatar box) + module name (truncate) + `ChevronsUpDown` chevron (hidden when collapsed).
  - Dropdown items: `{#each shellNav.modules as m}` — fully dynamic. HOME, CRM, SETTINGS, and any future module all appear naturally from the DB. No virtual appending, no special-casing.
  - `is_reserved` modules: no visual distinction in the dropdown for now (the flag is preserved for the modules management page to prevent disable/delete).
  - `onSelect`: calls `shellNav.selectModule(m.id)`. Does NOT auto-navigate to first link (user decision: just select + show links).
  - `side="right" align="end"` like the org switcher.
  - Collapsed mode: icon-only (`group-data-[collapsible=icon]` pattern).
- **Place** in `Sidebar.Content` as the FIRST `Sidebar.Group` with `GroupLabel` = `$t('shell.nav.module')` (singular — new i18n key). The dynamic nav links follow in a SECOND `Sidebar.Group` (no label).

### 2.2 Remove the "Settings" demo group
- **Delete** the second `Sidebar.Group` (AppSidebar.svelte lines 252–302).
- **Delete** handler functions: `demoToastProfile`, `demoToastPreferences`, `demoToastHelp`, `demoToastCritical` (lines 34–86).
- **Delete** unused imports: `LifeBuoy`, `Siren`, `User`, `Settings`, `Package`, `Receipt`, `LayoutGrid`, `Users` (all were used by the old iconFor/demo groups — replaced by DynamicIcon + module metadata).
- **Delete** i18n keys across ALL 6 locales (`en-GB`, `it-IT`, `de-DE`, `es-ES`, `fr-FR`, `pt-PT`):
  - `shell.nav.modulesGroup` (replaced by `shell.nav.module` singular)
  - `shell.nav.demoSettingsGroup`
  - `shell.nav.demoItemProfile`
  - `shell.nav.demoItemPreferences`
  - `shell.nav.demoItemHelp`
  - `shell.nav.demoItemCriticalToast`
  - `shell.demoToast.*` (profileAria, preferencesAria, preferencesMessage, helpAria, helpMessage, criticalAria, criticalMessage)
- **Add** i18n key `shell.nav.module` (singular) in all 6 locales.
- **Keep**: `shell.nav.crmFallback`, `shell.nav.crmBreadcrumbMenu` (still used by breadcrumb).

### 2.3 Dynamic module links (max 2 levels) from module metadata
- **FE fetches** `GET /api/v1/modules/:code/meta` when a module is selected (lazy-loaded, cached in the store).
- **Rendering** in `AppSidebar.svelte` via a recursive `Snippet`:

```svelte
{#snippet navLink(item: ModuleNavLink, level: 1 | 2)}
  {#if item.children && item.children.length > 0}
    {@const isParentActive = isLinkActive(item.href)}
    {@const groupOpen = openGroups[item.id] ?? isParentActive}
    <Sidebar.MenuItem>
      <div class="group/collapsible" data-state={groupOpen ? 'open' : 'closed'}>
        <Sidebar.MenuButton
          isActive={isParentActive}
          aria-expanded={groupOpen}
          onclick={() => { openGroups[item.id] = !groupOpen; }}
        >
          <DynamicIcon name={item.icon ?? 'circle'} size={16} />
          <span>{$t(item.label_key)}</span>
          <ChevronRight
            class="ms-auto size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden"
            aria-hidden="true"
          />
        </Sidebar.MenuButton>
        {#if groupOpen}
          <Sidebar.MenuSub>
            {#each item.children as child (child.id)}
              <Sidebar.MenuSubItem>
                <Sidebar.MenuSubButton
                  href={child.href}
                  isActive={isLinkActive(child.href)}
                >
                  <DynamicIcon name={child.icon ?? 'circle'} size={14} />
                  <span>{$t(child.label_key)}</span>
                </Sidebar.MenuSubButton>
              </Sidebar.MenuSubItem>
            {/each}
          </Sidebar.MenuSub>
        {/if}
      </div>
    </Sidebar.MenuItem>
  {:else if level === 1}
    <Sidebar.MenuItem>
      <Sidebar.MenuButton href={item.href} isActive={isLinkActive(item.href)}>
        <DynamicIcon name={item.icon ?? 'circle'} size={16} />
        <span>{$t(item.label_key)}</span>
      </Sidebar.MenuButton>
    </Sidebar.MenuItem>
  {/if}
{/snippet}

{#if moduleNavLoading}
  <div class="px-2 py-1.5 text-xs text-muted-foreground">{$t('common.loading')}</div>
{:else if moduleNavError}
  <div class="px-2 py-1.5 text-xs text-destructive">
    {$t('shell.modulesLoadFailed')}
    <button onclick={() => shellNav.reloadModuleNav()} class="ml-2 underline">
      {$t('shell.retry')}
    </button>
  </div>
{:else if navItems && navItems.length > 0}
  {#each navItems as item (item.id)}
    {@render navLink(item, 1)}
  {/each}
{/if}
```

- **HOME module**: `nav: []` (empty array) — no sidebar links rendered. The sidebar body is empty when HOME is selected. The main content area shows the empty home page (`/`).
- **Active state**: `isLinkActive(href)` reads `page.url.pathname` reactively:
```ts
function isLinkActive(href: string): boolean {
  const pathname = page.url.pathname;
  return pathname === href || pathname.startsWith(href + '/');
}
```
- **Loading state**: `{$t('common.loading')}` placeholder.
- **Error state**: inline error + retry button calling `shellNav.reloadModuleNav()` + `pushNotification` with `impact: 'HIGH'`.

### 2.4 Settings as a reserved service_registry record (no FE hardcoding)
- The FE **does not** define a static `settingsModuleNav` object.
- The FE **does not** append a virtual module to the dropdown.
- The FE **does not** special-case `id === 'settings'` or `id === 'home'` anywhere in the rendering loop.
- The BE `service_registry` table has real rows for `home` and `settings` with `is_reserved = true`.
- The BE `/modules` response includes them naturally.
- The BE `/modules/settings/meta` returns the 7 settings nav links using the same `ModuleNav` type.
- The BE `/modules/home/meta` returns `{ module: 'home', icon: 'layout-grid', nav: [] }`.
- The FE fetches meta the same way as any other module: `selectModule(id)` → `fetchModuleMeta(id)` → `GET /api/v1/modules/:code/meta`.
- **Profile menu "Settings" item**: `SidebarProfileMenu.svelte` line 107 changes from `goto('/system/settings/profile')` to:
  ```ts
  void shellNav.selectModule('settings');
  void goto('/system/settings/profile');
  ```
  This is the ONLY place the FE references 'settings' by name — and it's a user action (clicking the profile menu), not a rendering decision. The rendering is fully dynamic.

### 2.5 Remove the settings tab layout — DETAILED strategy

**Current state** (empirically verified):
- `src/routes/(app)/system/settings/+layout.svelte` (79 lines) wraps ALL settings sub-pages in an `AppPageScaffold` with a left tab nav (w-1/5) + content area. The tab nav has 7 tabs: profile, organizations, users, security, modules, templates, email-providers.
- The layout provides: (a) `AppPageScaffold` outer shell, (b) breadcrumb via `AppPageBreadcrumb` with `settingsTabMenuSegment`, (c) `<h1>` title "Settings", (d) left tab navigation, (e) content area where children render.

**Sub-pages that ALREADY have their own scaffold** (empirically verified — 6 pages):
| Sub-page | Scaffold | Breadcrumb | Notes |
|----------|----------|------------|-------|
| `profile/+page.svelte` | `FormPageLayout` (line 277) | `AppPageBreadcrumb` (line 287) | Has own h1 (line 294) |
| `users/create/+page.svelte` | `FormPageLayout` (line 286) | `AppPageBreadcrumb` (line 296) | Has own h1 |
| `users/[uuid]/+page.svelte` | `FormPageLayout` (line 222) | `AppPageBreadcrumb` (line 232) | Has own h1 |
| `organizations/create/+page.svelte` | `FormPageLayout` (line 202) | `AppPageBreadcrumb` (line 211) | Has own h1 |
| `organizations/[uuid]/+page.svelte` | `FormPageLayout` (line 193) | `AppPageBreadcrumb` (line 203) | Has own h1 |
| `modules/[code]/+page.svelte` | `FormPageLayout` (line 108) | `AppPageBreadcrumb` (line 116) | Has own h1 |

**Sub-pages that NEED scaffold wrapping** (empirically verified — 6 pages):
| Sub-page | Current outer markup | Action needed |
|----------|---------------------|---------------|
| `modules/+page.svelte` | `<div class="h-full p-2 sm:p-3">` (line 128) — already mirrors AppPageScaffold markup by hand | Replace outer `<div>` with `<AppPageScaffold>` + `{#snippet header()}` with breadcrumb + h1. The inner content stays. |
| `email-providers/+page.svelte` | `<div class="space-y-6 p-6">` (line 215) — bare div, no scaffold | Wrap in `<AppPageScaffold>` + header snippet with breadcrumb + h1. Remove the inline `<h2>` (line 219) — replace with h1 in header. |
| `users/+page.svelte` | `<div class="h-full flex flex-col">` (line 552) — bare div around `EntityListTable` | Wrap in `<AppPageScaffold>` + header snippet with breadcrumb + h1. The `EntityListTable` goes in children. |
| `organizations/+page.svelte` | `<div class="h-full flex flex-col">` (line 713) — bare div around `EntityListTable` | Wrap in `<AppPageScaffold>` + header snippet with breadcrumb + h1. The `EntityListTable` goes in children. |
| `security/+page.svelte` | `<div class="flex-1 overflow-auto">` (line 66) + separate footer div (line 147) — no outer scaffold | Wrap BOTH the form div and footer div in `<AppPageScaffold>` + header snippet with breadcrumb + h1. The form + footer go in children. |
| `templates/+page.svelte` | `<div class="space-y-6">` (line 60) — bare div, no scaffold | Wrap in `<AppPageScaffold>` + header snippet with breadcrumb + h1. Remove the inline `<h2>` (line 61) — replace with h1 in header. |

**Exact wrapping pattern** (following `customers/+page.svelte` lines 754-829 as the reference):
```svelte
<AppPageScaffold>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/profile' },
          { label: $t('shell.settings.tabs.<tabId>') }
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">{$t('shell.settings.<tabId>.title')}</h1>
    </div>
  {/snippet}

  <!-- existing page content goes here as children -->
</AppPageScaffold>
```

**Settings breadcrumb**: `src/lib/breadcrumb/settings-breadcrumb.ts` (54 lines) — currently has 6 items (MISSING email-providers!). **Update**: add email-providers item to match the 7 settings nav links. The breadcrumb dropdown is still used by sub-pages that call `settingsTabMenuSegment`. The function stays but gets the 7th item.

**Settings index page**: `src/routes/(app)/system/settings/+page.svelte` (5 lines, `redirect(307, '/system/settings/profile')`) — keep as-is. Handles bare `/system/settings` navigation.

**Deletion of `+layout.svelte`**: delete ONLY after all 6 sub-pages have been wrapped with their own scaffold AND the typecheck passes. **Order**: wrap all 6 pages first → run `pnpm run check` → if pass, delete `+layout.svelte` → run `pnpm run check` again → if fail, restore and fix.

### 2.6 First-load / home behavior + route cache
- **Home page**: `src/routes/(app)/+page.svelte` is already an empty page (`<div class="h-full p-2 sm:p-3"></div>`). This IS the home/empty page — no change needed.
- **Auto-sync**: on first load to `/`, the `$effect` in `AppSidebar.svelte` calls `shellNav.syncModuleFromRoute('/')`. `resolveModuleFromRoute('/')` matches the HOME module (route_prefix `/` with exact match). HOME is selected in the dropdown. Its `nav: []` means no sidebar links — the sidebar body is empty. The main content shows the empty home page.
- **No placeholder ever.** The dropdown always shows the selected module. On `/`, it shows HOME. On `/customers`, it shows CRM. On `/system/settings/profile`, it shows SETTINGS.
- **Route cache**: persist last-visited route in `localStorage`:
  - Key: `pb:shell:lastRoute`
  - On `afterNavigate` in `AppSidebar.svelte`: `saveLastRoute(page.url.pathname)`.
  - On mount in `(app)/+layout.svelte`: after user profile bootstrap, if `getLastRoute()` exists and is not `/login`, `goto(lastRoute)`. This triggers the auto-sync `$effect` which loads the right module.

---

## 3. Architectural Changes

### 3.1 Shell nav store (Svelte 5 runes + composable pattern)
**File**: `src/lib/shell/modules-shell.svelte.ts` (currently 27 lines → ~110 lines)

```ts
import { fetchModules, fetchModuleMeta, ApiUnreachableError, type ModuleInfo, type ModuleNav } from '$lib/api';
import type { DeepReadonly } from '$lib/types/deep-readonly';

const _state = $state({
  loading: true,
  modules: [] as ModuleInfo[],
  unreachable: false,
  error: null as string | null,
  selectedModuleId: null as string | null,
  moduleNav: null as ModuleNav | null,
  moduleNavLoading: false,
  moduleNavError: null as string | null,
});

const LAST_ROUTE_KEY = 'pb:shell:lastRoute';
function getLastRoute(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(LAST_ROUTE_KEY);
}
function saveLastRoute(pathname: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LAST_ROUTE_KEY, pathname);
}

function resolveModuleFromRoute(pathname: string): string | null {
  for (const m of _state.modules) {
    if (!m.route_prefixes) continue;
    for (const prefix of m.route_prefixes) {
      if (prefix === '/') {
        // HOME module: exact match only — otherwise every route matches '/'
        if (pathname === '/') return m.id;
      } else {
        if (pathname === prefix || pathname.startsWith(prefix + '/')) {
          return m.id;
        }
      }
    }
  }
  return null;
}

export const shellNav = {
  get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
  get loading() { return _state.loading; },
  get modules() { return _state.modules; },
  get unreachable() { return _state.unreachable; },
  get error() { return _state.error ?? undefined; },
  get selectedModuleId() { return _state.selectedModuleId; },
  get moduleNav() { return _state.moduleNav; },
  get moduleNavLoading() { return _state.moduleNavLoading; },
  get moduleNavError() { return _state.moduleNavError ?? undefined; },
  loadShellNav,
  selectModule,
  reloadModuleNav,
  syncModuleFromRoute,
  resolveModuleFromRoute,
  getLastRoute,
  saveLastRoute,
};

async function loadShellNav(): Promise<void> {
  _state.loading = true;
  _state.error = null;
  try {
    _state.modules = await fetchModules();
    _state.unreachable = false;
  } catch (e) {
    if (e instanceof ApiUnreachableError) {
      _state.unreachable = true;
      _state.error = null;
    } else {
      _state.unreachable = false;
      _state.error = e instanceof Error ? e.message : 'Failed to load modules';
    }
  } finally {
    _state.loading = false;
  }
}

async function selectModule(moduleId: string): Promise<void> {
  if (_state.selectedModuleId === moduleId && _state.moduleNav) return;
  _state.selectedModuleId = moduleId;
  _state.moduleNav = null;
  _state.moduleNavError = null;
  _state.moduleNavLoading = true;
  try {
    _state.moduleNav = await fetchModuleMeta(moduleId);
  } catch (e) {
    _state.moduleNavError = e instanceof Error ? e.message : 'Failed to load module navigation';
    _state.moduleNav = null;
  } finally {
    _state.moduleNavLoading = false;
  }
}

async function reloadModuleNav(): Promise<void> {
  if (!_state.selectedModuleId) return;
  const id = _state.selectedModuleId;
  _state.selectedModuleId = null;
  await selectModule(id);
}

async function syncModuleFromRoute(pathname: string): Promise<void> {
  if (_state.loading || _state.modules.length === 0) return;
  const moduleId = resolveModuleFromRoute(pathname);
  if (moduleId && moduleId !== _state.selectedModuleId) {
    await selectModule(moduleId);
  }
}
```

**Consumer migration** (empirically verified — all 7 consumers are read-only):
- `AppShell.svelte` — reads `shellNav.loading`, `shellNav.unreachable`, `shellNav.error` — getters transparent.
- `AppSidebar.svelte` — reads `shellNav.loading`, `shellNav.modules`, `shellNav.unreachable`, `shellNav.error` — getters transparent. Being refactored anyway.
- `AppServerBanner.svelte` — reads `shellNav.unreachable`, `shellNav.error` — getters transparent.
- `customers/+page.svelte` — reads `shellNav.modules` — getter transparent.
- `customers/new/+page.svelte` — reads `shellNav.modules` — getter transparent.
- `crm/pipeline/+page.svelte` — reads `shellNav.modules` — getter transparent.
- All writes are inside `modules-shell.svelte.ts` (moving to `_state`). No consumer writes to `shellNav` directly.

### 3.2 New API types + fetch function
**File**: `src/lib/api-types.ts` — add:
```ts
export type ModuleNavLink = {
  id: string;
  label_key: string;
  href: string;
  icon?: string;
  children?: ModuleNavLink[];
};

export type ModuleNav = {
  module: string;
  icon?: string;
  nav: ModuleNavLink[];
};
```
**Extend `ModuleInfo`** (already exists):
```ts
export type ModuleInfo = {
  id: string;
  name: string;
  enabled: boolean;
  icon?: string;
  route_prefixes?: string[];
  is_reserved?: boolean;
};
```

**File**: `src/lib/api.ts` — add:
```ts
export async function fetchModuleMeta(code: string): Promise<ModuleNav> {
  const res = await apiFetch(`/api/v1/modules/${encodeURIComponent(code)}/meta`);
  if (!res.ok) throw new Error(`Module meta request failed (${res.status})`);
  return (await res.json()) as ModuleNav;
}
```
Re-export `ModuleNav`, `ModuleNavLink` from `api.ts` (alongside existing `ModuleInfo` re-export).

### 3.3 BE changes — migration + entity + endpoints + nav meta

**Migration**: `db-meta/fire-and-forget/add_service_registry_is_reserved_and_seed_home_settings.sql` (see §1.4 for full SQL).

**Init patch update**: `db-meta/patches/00000000000000_init_database.sql` — add `is_reserved` column + seed HOME and SETTINGS rows.

**Entity update**: `src/modules/system/service_registry_entity.ts` — add `is_reserved: boolean` field (see §1.4).

**New BE types file**: `src/modules/module-nav-types.ts`:
```ts
export type ModuleNavLink = {
  id: string;
  label_key: string;
  href: string;
  icon?: string;
  children?: ModuleNavLink[];
};

export type ModuleNav = {
  module: string;
  icon?: string;
  nav: ModuleNavLink[];
};

export type ModuleNavWithPrefixes = ModuleNav & {
  route_prefixes: string[];
  is_reserved?: boolean;
};
```

**New BE nav meta file**: `src/modules/module-nav-meta.ts` — `buildModuleNavMeta(code)` returning `ModuleNavWithPrefixes | null` (see §1.4 for full code).

**BE `/modules` handler** (`src/index.ts` line 154): read ALL `service_registry` rows, map to `ModuleInfo` with `route_prefixes` + `is_reserved` from `buildModuleNavMeta` (see §1.4).

**BE `/modules/:code/meta` endpoint**: new route after `/modules` (see §1.4).

### 3.4 New FE component: SidebarModuleSwitcher
**New file**: `src/lib/components/sidebar/SidebarModuleSwitcher.svelte`

Mirrors `SidebarOrgSwitcher.svelte` (103 lines) exactly in structure:
- Props: `{ collapsed: boolean }`
- Reads `shellNav.modules`, `shellNav.selectedModuleId`.
- `$derived`: `selectedModule = shellNav.modules.find(m => m.id === shellNav.selectedModuleId)`.
- Trigger: `Sidebar.MenuButton size="lg"` with `DynamicIcon name={selectedModule?.icon ?? 'layout-grid'}` in a `size-8` rounded box + module name (truncate) + `ChevronsUpDown`.
- Dropdown: `{#each shellNav.modules as m}` — no filtering, no virtual appending. HOME, CRM, SETTINGS, and any future module all appear.
- `onSelect`: `shellNav.selectModule(m.id)` — just select, no auto-navigate.
- Collapsed mode: icon-only.

### 3.5 AppSidebar refactor
**File**: `src/lib/components/AppSidebar.svelte` (319 lines → ~120 lines)

**Remove**:
- `selectedId`, `crmOpen` local state (lines 28–29).
- `hrefForModule`, `customersActive`, `pipelineActive` derives (lines 100–107).
- `iconFor` function (lines 111–117) — replaced by DynamicIcon + module metadata.
- `$effect` that sets `selectedId` (lines 122–128) — replaced by `syncModuleFromRoute` effect.
- Entire modules `Sidebar.Group` (lines 146–250).
- Entire demo settings `Sidebar.Group` (lines 252–302).
- Demo handler functions (lines 34–86).
- Unused Lucide imports (lines 18–26).
- `handleLogout` stays (used by profile menu footer).

**Add**:
- In `Sidebar.Content`, FIRST `Sidebar.Group` with `GroupLabel` = `$t('shell.nav.module')` (singular) containing `SidebarModuleSwitcher`.
- SECOND `Sidebar.Group` (no label) rendering `shellNav.moduleNav.nav` via the `navLink` snippet (see §2.3).
- `$effect` for auto-sync:
  ```ts
  $effect(() => {
    const pathname = page.url.pathname;
    const loading = shellNav.loading;
    const moduleCount = shellNav.modules.length;
    if (loading || moduleCount === 0) return;
    void shellNav.syncModuleFromRoute(pathname);
  });
  ```
- `$state` for `openGroups: Record<string, boolean> = {}`.
- `afterNavigate`: `shellNav.saveLastRoute(page.url.pathname)` + existing mobile/desktop sidebar behavior.

### 3.6 Profile menu update
**File**: `src/lib/components/sidebar/SidebarProfileMenu.svelte` (line 107)
```svelte
onSelect={() => {
  void shellNav.selectModule('settings');
  void goto('/system/settings/profile');
}}
```
Import `shellNav` from `$lib/shell/modules-shell.svelte`.

### 3.7 Last-route restore
**File**: `src/routes/(app)/+layout.svelte` — in `onMount`, after user profile bootstrap:
```ts
import { shellNav } from '$lib/shell/modules-shell.svelte';
import { goto } from '$app/navigation';

// After profile bootstrap...
const lastRoute = shellNav.getLastRoute();
if (lastRoute && lastRoute !== '/login') {
  await goto(lastRoute);
}
```

### 3.8 Settings breadcrumb update
**File**: `src/lib/breadcrumb/settings-breadcrumb.ts` — add the missing email-providers item (7th tab) to the `items` array:
```ts
{
  label: args.t('shell.settings.tabs.emailProviders'),
  href: '/system/settings/email-providers',
  current: pathname === '/system/settings/email-providers'
},
```

---

## 4. Impacted Files (full list)

### FE — `primebrick-fe-v3/`
| File | Action | Notes |
|------|--------|-------|
| `src/lib/components/AppSidebar.svelte` | **Major refactor** (319→~120 lines) | Remove modules group + demo group; add module switcher group + dynamic nav group with snippet + $effect auto-sync. |
| `src/lib/components/sidebar/SidebarModuleSwitcher.svelte` | **New** | Mirrors `SidebarOrgSwitcher.svelte`. Fully dynamic from `shellNav.modules`. |
| `src/lib/components/sidebar/SidebarProfileMenu.svelte` | **Minor edit** | Settings item calls `shellNav.selectModule('settings')` + `goto`. |
| `src/lib/shell/modules-shell.svelte.ts` | **Major refactor** (27→~110 lines) | Composable pattern + `selectModule` + `syncModuleFromRoute` + `resolveModuleFromRoute` + last-route helpers. |
| `src/lib/api-types.ts` | **Add types + extend** | `ModuleNav`, `ModuleNavLink`; extend `ModuleInfo` with `icon`, `route_prefixes`, `is_reserved`. |
| `src/lib/api.ts` | **Add function** | `fetchModuleMeta(code)`. |
| `src/routes/(app)/system/settings/+layout.svelte` | **Delete** | Tab layout removed. Delete ONLY after all 6 sub-pages wrapped + typecheck passes. |
| `src/routes/(app)/system/settings/modules/+page.svelte` | **Wrap in AppPageScaffold** | Replace hand-written outer div with AppPageScaffold + header snippet. |
| `src/routes/(app)/system/settings/email-providers/+page.svelte` | **Wrap in AppPageScaffold** | Add scaffold + breadcrumb + h1. Remove inline h2. |
| `src/routes/(app)/system/settings/users/+page.svelte` | **Wrap in AppPageScaffold** | Add scaffold + breadcrumb + h1 around EntityListTable. |
| `src/routes/(app)/system/settings/organizations/+page.svelte` | **Wrap in AppPageScaffold** | Add scaffold + breadcrumb + h1 around EntityListTable. |
| `src/routes/(app)/system/settings/security/+page.svelte` | **Wrap in AppPageScaffold** | Add scaffold + breadcrumb + h1. Wrap form + footer. |
| `src/routes/(app)/system/settings/templates/+page.svelte` | **Wrap in AppPageScaffold** | Add scaffold + breadcrumb + h1. Remove inline h2. |
| `src/lib/breadcrumb/settings-breadcrumb.ts` | **Minor edit** | Add missing email-providers item (7th tab). |
| `src/routes/(app)/+layout.svelte` | **Minor edit** | Add last-route restore on mount. |
| `src/lib/components/AppShell.svelte` | **No change** | Store API stays compatible (getters transparent). |
| `src/lib/components/AppServerBanner.svelte` | **No change** | Store API stays compatible. |
| `src/routes/(app)/customers/+page.svelte` | **No change** | Store API stays compatible. |
| `src/routes/(app)/customers/new/+page.svelte` | **No change** | Store API stays compatible. |
| `src/routes/(app)/crm/pipeline/+page.svelte` | **No change** | Store API stays compatible. |
| `src/lib/breadcrumb/crm-breadcrumb.ts` | **No change** | Still used by customers/pipeline pages. |
| `src/lib/i18n/messages/en-GB.json` | **Edit** | Remove demo keys; add `shell.nav.module` singular. |
| `src/lib/i18n/messages/it-IT.json` | **Edit** | Same. |
| `src/lib/i18n/messages/de-DE.json` | **Edit** | Same. |
| `src/lib/i18n/messages/es-ES.json` | **Edit** | Same. |
| `src/lib/i18n/messages/fr-FR.json` | **Edit** | Same. |
| `src/lib/i18n/messages/pt-PT.json` | **Edit** | Same. |

### BE — `primebrick-be-v3/`
| File | Action | Notes |
|------|--------|-------|
| `db-meta/fire-and-forget/add_service_registry_is_reserved_and_seed_home_settings.sql` | **New** | Add `is_reserved` column + seed HOME and SETTINGS rows. |
| `db-meta/patches/00000000000000_init_database.sql` | **Edit** | Add `is_reserved` column to CREATE TABLE + seed HOME/SETTINGS rows. |
| `src/modules/system/service_registry_entity.ts` | **Edit** | Add `is_reserved: boolean` field (line 60). |
| `src/index.ts` | **Edit** | Extend `/modules` handler to map `is_reserved` + `route_prefixes`; add `/modules/:code/meta` route. |
| `src/modules/module-nav-meta.ts` | **New** | `buildModuleNavMeta(code)` — static registry for HOME, CRM, SETTINGS. |
| `src/modules/module-nav-types.ts` | **New** | `ModuleNavLink`, `ModuleNav`, `ModuleNavWithPrefixes` types (snake_case). |

### US — `primebrick-us-v3/`
No changes. Microservice self-description of nav metadata is a future enhancement (out of scope).

---

## 5. Acceptance Criteria

1. **Module dropdown**: Sidebar body shows a "Module" group (singular label) with a dropdown listing ALL modules from `GET /api/v1/modules` — including HOME and SETTINGS (reserved DB rows). No FE hardcoding.
2. **No demo group**: The "Settings" demo group is gone. No `demoToast*` i18n keys remain in any locale.
3. **Dynamic links**: Selecting "crm" shows "Customers" and "Pipeline" links from `GET /api/v1/modules/crm/meta`. Clicking navigates and shows active state.
4. **Two-level links**: Nav links with `children` render as collapsible parents with chevron + sub-links. Rendered via recursive Svelte 5 `Snippet`.
5. **HOME module**: Selecting "home" (or navigating to `/`) shows no sidebar links (`nav: []`). The main content shows the empty home page. HOME is a real `service_registry` row with `is_reserved: true`.
6. **SETTINGS as reserved module**: SETTINGS appears in the dropdown naturally (from DB, not FE appending). Its 7 links come from `GET /api/v1/modules/settings/meta`. The tab-layout `+layout.svelte` is deleted; all 12 sub-pages have their own scaffold.
7. **Auto-sync (global shell method)**: Navigating to `/customers` via URL auto-selects CRM in the dropdown and loads its metadata — via `syncModuleFromRoute` called from a `$effect` on `page.url.pathname`. Navigating to `/` auto-selects HOME. Navigating to `/system/settings/profile` auto-selects SETTINGS. No placeholder ever.
8. **Route cache**: Second visit redirects to last-visited route (from `localStorage`). Module dropdown + active link reflect that route via auto-sync.
9. **Svelte 5 reactivity**: `$derived` for all computed nav state; `$effect` for auto-sync; `$state` for open groups; `Snippet` for recursive nav rendering; composable state exposure pattern (`_state` + `DeepReadonly` + mutators).
10. **Single metadata model**: ONE `ModuleNav` / `ModuleNavLink` type used by ALL modules. No separate FE types for settings or home.
11. **Reserved modules in DB**: HOME and SETTINGS are real `service_registry` rows with `is_reserved: true`. They appear in the modules management page. They cannot be disabled or deleted (BE enforces).
12. **i18n**: All 6 locale files compile (no missing keys). `pnpm run check` passes.
13. **Typecheck**: `pnpm run check` (FE) + `pnpm run build` (BE) pass.
14. **No dev server killed**: Existing dev servers on ports 5173 (FE) and 3001 (BE) are not touched.

---

## 6. Open Questions (RESOLVED by user)

1. **First-load module selection**: ~~placeholder vs auto-select~~ → **RESOLVED**: empty homepage. HOME is a reserved `service_registry` record. No placeholder — auto-select from route.
2. **Module meta source**: ~~BE static registry vs NATS~~ → **RESOLVED**: BE static registry now (placeholder), NATS later. HOME and SETTINGS stay BE constants forever.
3. **Settings sub-pages scaffold**: ~~verify empirically~~ → **RESOLVED**: empirically verified at plan level. 6 pages have own scaffold, 6 need wrapping. Full table in §2.5.
4. **Module switcher placement**: ~~header vs body~~ → **RESOLVED**: current position in sidebar body, group label "Module" (singular).
5. **Dropdown onSelect navigation**: ~~auto-navigate vs just select~~ → **RESOLVED**: just select + show links. No auto-navigate.
6. **HOME/SETTINGS as reserved records**: **RESOLVED**: real `service_registry` rows with `is_reserved: true`. One logic for all modules.

---

## 7. Implementation Order (after PROCEED)

1. **BE migration**: create `add_service_registry_is_reserved_and_seed_home_settings.sql` + update init patch. Run migration against dev DB.
2. **BE entity**: add `is_reserved` field to `service_registry_entity.ts`.
3. **BE nav meta**: create `module-nav-types.ts` + `module-nav-meta.ts` (HOME, CRM, SETTINGS).
4. **BE endpoints**: extend `/modules` handler + add `/modules/:code/meta` route. `pnpm run build`.
5. **FE types**: add `ModuleNav`/`ModuleNavLink` to `api-types.ts`; extend `ModuleInfo`; add `fetchModuleMeta` to `api.ts`.
6. **FE store**: refactor `modules-shell.svelte.ts` (composable pattern, `selectModule`, `syncModuleFromRoute`, `resolveModuleFromRoute`, last-route helpers).
7. **FE component**: create `SidebarModuleSwitcher.svelte`.
8. **FE refactor**: rewrite `AppSidebar.svelte` (remove old groups, add module switcher group + dynamic nav with snippet + $effect auto-sync).
9. **FE profile menu**: update `SidebarProfileMenu.svelte` settings item.
10. **FE settings sub-pages**: wrap the 6 sub-pages that lack scaffold in `AppPageScaffold` + breadcrumb + h1. Update `settings-breadcrumb.ts` (add email-providers item).
11. **FE typecheck checkpoint**: `pnpm run check` — must pass before deleting layout.
12. **FE settings layout**: delete `+layout.svelte`. `pnpm run check` again.
13. **FE last-route**: wire `saveLastRoute`/`getLastRoute` in AppSidebar + (app) layout.
14. **i18n**: remove demo keys + add `shell.nav.module` singular in all 6 locale files.
15. **Verify**: `pnpm run check` (FE), `pnpm run build` (BE). Manual smoke test on running dev server (do NOT restart).
16. **Report** results; do NOT commit (per AGENTS.md — wait for explicit user instruction).

---

## 8. Rules Compliance Checklist

- [x] `.devin/rules/` read for FE, BE, US (always-check-rules-first).
- [x] `AGENTS.md` read for FE, BE, US.
- [x] Plan file in `primebrick-workspace/ai-plans/` (workflow rule).
- [x] No source code modified during planning (workflow rule — analysis only).
- [x] Dev server rules acknowledged (no port 5173/3001 changes without checking).
- [x] Data model: `snake_case` for all new BE/FE types (`label_key`, `route_prefixes`, `is_reserved`).
- [x] No DTO rename between BE JSON and FE types.
- [x] Composable state exposure pattern: `_state` + `DeepReadonly` getter + mutators (per AGENTS.md).
- [x] Svelte 5 runes: `$state`, `$derived`, `$effect`, `Snippet` — all used correctly.
- [x] `DynamicIcon` API verified empirically — accepts `name: string`, uses `$effect` + `import.meta.glob` (lines 1-60).
- [x] `AppPageScaffold` API verified empirically — accepts `header` (Snippet) + `children` (Snippet) (lines 1-47).
- [x] `FormPageLayout` API verified empirically — accepts `header` (Snippet) + `children` (Snippet) + `footerActions` (lines 1-35).
- [x] Settings sub-pages empirically audited — 6 have own scaffold, 6 need wrapping. Full table in §2.5.
- [x] `shellNav` consumers empirically mapped (7 files) — all read-only, getter migration transparent.
- [x] `service_registry` entity verified empirically — no `is_reserved` column (needs migration). Entity at `service_registry_entity.ts` lines 1-75.
- [x] DB migration pattern verified empirically — `db-meta/fire-and-forget/*.sql` for existing DBs + `db-meta/patches/` for init.
- [x] `service_registry_code_uq_scaler` unique index verified empirically (init patch lines 314-315) — enables ON CONFLICT for seeded reserved rows.
- [x] `settings-breadcrumb.ts` verified empirically — MISSING email-providers item (only 6 of 7 tabs). Fix included in plan.
- [x] i18n rule: keys removed + added in all 6 locales simultaneously.
- [x] Error notifications via `pushNotification` (not direct `toast.*`).
- [x] No temp files created in project repos.
- [x] No commits without explicit user instruction.
- [x] No hardcoded module identities in the FE — BE is single source of truth.
- [x] Single repeatable `ModuleNav` metadata model for all modules.
- [x] Global shell auto-sync method (`syncModuleFromRoute`) for automatic module identification on page load.
- [x] HOME and SETTINGS as real `service_registry` rows with `is_reserved: true` — one logic for all modules.
- [x] All empirical checks done at plan level — zero assumptions, zero "verify at runtime" deferrals.
