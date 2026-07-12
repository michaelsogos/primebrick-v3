# Plan: Settings Modules Page Revamp

**Created:** 2026-07-11  
**Status:** DRAFT — Awaiting Approval  
**Scope:** BE + DAL + SDK + US (emailsender) + FE

---

## 1. Objectives

Revamp the Settings > Modules page to:

1. **Inherit content wrapper** consistent with profile page (padding, border, page title pattern).
2. **Remove LOAD MODULE section** and replace with two primary buttons: "IMPORT MODULE" and "OPEN MARKETPLACE" — both emit a `pushNotification` error saying "NOT IMPLEMENTED YET!".
3. **Add toggle switch** per module row that flips `is_enabled` boolean (new field) via a PATCH endpoint. **Trash button** performs hard delete via DELETE endpoint with a confirm dialog (standard `DeleteDialog` pattern).
4. **Add icon support** per module via two new columns: `icon` (text) + `icon_type` (enum: `url`, `svg`, `base64`, `icon`). FE renders dynamically. Show service name, description, and version badge.
5. **Add config page link** (icon button) per module row → navigates to `/system/settings/modules/:code` config page with 2 tabs:
   - Tab 1: service_registry fields form (name, description, base_url, icon, icon_type, etc.)
   - Tab 2: module-specific config (proxied via BE `/ws/:serviceCode/api/v1/config`)
6. **Verify registration timing**: module creates first `service_registry` record when microservice sends `service.register` NATS event on startup. Document this clearly.
7. **Empty state**: when no modules installed, show standard empty-state pattern (TriangleAlert icon + message), consistent with `TableBody.svelte` empty state.

---

## 2. User Decisions (from clarifying questions)

| Decision | Choice |
|----------|--------|
| Icon strategy | Two fields: `icon` (value) + `icon_type` (enum: `url`, `svg`, `base64`, `icon`) |
| Toggle mechanism | New `is_enabled` boolean column (NOT soft delete). Toggle switch flips this value via PATCH endpoint. |
| Config page route | Follow orgs/profile pattern: list at `/modules`, config page at `/modules/:code` |
| Config tab 2 data source | Proxy via BE `/ws/:serviceCode/api/v1/config` → forwards to microservice |

---

## 3. Current State Analysis (Empirical Findings)

### 3.1 FE Modules Page (Current)
**File:** `primebrick-fe-v3/src/routes/(app)/system/settings/modules/+page.svelte` (94 lines)

- **Does NOT use `FormPageLayout`** — uses bare `<div class="space-y-6">` with `<h2>` title
- **No padding, no border, no breadcrumb** (unlike profile page)
- **LOAD MODULE section** (lines 43-66): file upload Input + Install button with mock `handleInstall()`
- **Hardcoded mock data** (lines 13-17): 3 fake modules, no API call
- **Module row** (lines 87-105): Package icon + name + version text + Active/Inactive Badge + trash button
- **No toggle, no config link, no real API**

### 3.2 FE Profile Page (Reference)
**File:** `primebrick-fe-v3/src/routes/(app)/system/settings/profile/+page.svelte` (556 lines)

- Uses `FormPageLayout` with `header`, `children`, `footerActions` snippets
- Header: `AppPageBreadcrumb` + `<h1 class="truncate text-xl font-semibold leading-tight">`
- Content: `<div class="flex-1 overflow-auto p-4"><div class="space-y-6">`
- `FormPageLayout` provides: `h-full p-2 sm:p-3` outer padding + `rounded-md border bg-background` container

### 3.3 Settings Layout
**File:** `primebrick-fe-v3/src/routes/(app)/system/settings/+layout.svelte` (79 lines)

- Uses `AppPageScaffold` with header (breadcrumb + "Settings" h1)
- Left sidebar: tab navigation (profile, organizations, users, security, modules, templates, email-providers)
- Content area: `<div class="flex-1 flex flex-col min-h-0 overflow-auto">{@render children()}</div>`
- Each tab page renders directly inside this content area

### 3.4 BE service_registry Entity
**File:** `primebrick-be-v3/src/modules/system/service_registry_entity.ts`

Current fields:
- `id`, `uuid`, `code`, `base_url`, `endpoints` (jsonb), `name`, `description`, `author`, `github_repo_url`, `service_version`, `is_behind_scaler`, `status`, `last_health_check_at`
- Audit: `created_at`, `created_by`, `updated_at`, `updated_by`, `version`
- **NO** `is_enabled` field
- **NO** `icon` / `icon_type` fields
- **NO** soft-delete fields (`@DeletableField`)

### 3.5 BE Endpoints (Current)
- `GET /api/v1/modules` → simplified `{ id, name, enabled }` (in `src/index.ts` line 152)
- `GET /api/v1/system/services` → full `ServiceInfo[]` (in `system-router.ts` line 78)
- **NO** POST/DELETE/PATCH/PUT for service_registry
- Proxy: `router.all("/ws/:serviceCode/*", ...)` in `proxy-router.ts`

### 3.6 BE Registration Logic
**File:** `primebrick-be-v3/src/modules/proxy/service-lifecycle-subscriber.ts`

- Event-driven via NATS: `service.register`, `service.heartbeat`, `service.unregister`
- On `service.register`: if record exists (by code or code+base_url) → update; else → insert
- **First record created when microservice sends `service.register` NATS event on startup**
- BE starts NATS subscriber in `startServiceLifecycle()` at `src/index.ts` line 217

### 3.7 NATS Payload Type
**File:** `primebrick-v3-sdk/src/service/service-lifecycle-subjects.ts`

```typescript
interface ServiceRegisterPayload extends ServiceHeartbeatPayload {
  endpoints: Record<string, unknown>;
}
// ServiceHeartbeatPayload has: code, base_url, service_version, name, description,
//   author, github_repo_url, is_behind_scaler, http_healthy, nats_connected, checks
```
- **NO** `is_enabled`, `icon`, `icon_type` in payload

### 3.8 US Emailsender Registration
**File:** `primebrick-us-v3/emailsender/src/index.ts` (lines 96-137)

- Sends: `serviceCode`, `baseUrl`, `endpoints` (webhook, health), `service_version`, `name` ("Email Sender"), `description` ("Email sending microservice"), `is_behind_scaler: false`
- **NO** icon info sent
- **NO** config API endpoint exists (only providers CRUD + webhook + openapi)

### 3.9 FE API Client & Types
**File:** `primebrick-fe-v3/src/lib/api.ts`
- `fetchModules()` → calls `/api/v1/modules`, returns `ModuleInfo[]`
- `fetchServices()` → calls `/api/v1/system/services`, returns `ServiceInfo[]`

**File:** `primebrick-fe-v3/src/lib/api-types.ts`
- `ModuleInfo` = `{ id, name, enabled }` (simplified)
- `ServiceInfo` = full service_registry fields (snake_case)

### 3.10 FE Components Available
- **FormPageLayout**: `$lib/components/FormPageLayout.svelte` — header/children/footerActions snippets
- **DeleteDialog**: `$lib/components/entity-list-table/dialogs/DeleteDialog.svelte` — destructive confirm dialog
- **Switch**: `$lib/components/ui/switch/switch.svelte` — toggle with optional `thumbIcons` snippet
- **Badge**: `$lib/components/ui/badge/badge.svelte` — variants: default, secondary, destructive, outline
- **DynamicIcon**: `$lib/components/ui/dynamic-icon/DynamicIcon.svelte` — loads lucide icon by name at runtime
- **Tabs**: `$lib/components/ui/tabs/` — Tabs, TabsList, TabsTrigger, TabsContent
- **Button**: `$lib/components/ui/button/button.svelte` — variants: default (primary), destructive, outline, ghost, etc.
- **pushNotification**: `$lib/errors/app-errors.ts` — unified error notification (toast + error panel)
- **Empty state pattern**: `TableBody.svelte` lines 153-169 — centered TriangleAlert icon + message

### 3.11 SDK Shared Types
**File:** `primebrick-v3-sdk/src/service/service-registry.ts`
- `IServiceRegistry` interface (canonical shape)
**File:** `primebrick-v3-sdk/src/auth/permissions.ts`
- `MODULES_READ_ALL` exists. **NO** MODULES_UPDATE, MODULES_DELETE, MODULES_READ_SINGLE

### 3.12 i18n
**File:** `primebrick-fe-v3/src/lib/i18n/messages/en-GB.json` (lines 363-372)
- 6 languages: en-GB, de-DE, es-ES, fr-FR, it-IT, pt-PT
- Current module keys: title, uploadModule, selectModuleFile, installButton, installedModules, version, active, inactive

### 3.13 Navigation Pattern (Organizations)
**File:** `primebrick-fe-v3/src/routes/(app)/system/settings/organizations/+page.svelte` (lines 702-710)
- Edit: `window.open('/system/settings/organizations/${row.uuid}', '_blank')`
- Create: `window.open('/system/settings/organizations/create', '_blank')`
- Uses `EntityListTable` with `onEditAction` callback

---

## 4. Implementation Plan

### Phase 1: Database Schema Changes

#### 1.1 Update the Initial Patch (NOT a new patch file)
**File (EDIT):** `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql`

Update the existing `service_registry` CREATE TABLE block (lines 285-316) to include the new columns directly in the initial schema:

```sql
CREATE TABLE IF NOT EXISTS "public"."service_registry" (
  "id" bigint generated always as identity NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(100) NOT NULL,
  "base_url" text NOT NULL,
  "endpoints" jsonb NOT NULL,
  "name" text,
  "description" text,
  "author" text,
  "github_repo_url" text,
  "service_version" text,
  "is_behind_scaler" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'unknown',
  "last_health_check_at" timestamptz,
  -- NEW COLUMNS:
  "is_enabled" boolean NOT NULL DEFAULT true,
  "icon" text,
  "icon_type" text NOT NULL DEFAULT 'icon',
  -- END NEW COLUMNS
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text,
  "version" integer DEFAULT 1,
  PRIMARY KEY ("id")
);
```

**icon_type values:** `'url'` (remote image URL), `'svg'` (raw SVG XML), `'base64'` (base64-encoded image), `'icon'` (lucide icon name, rendered via DynamicIcon).

#### 1.2 Fire-and-Forget Patch (for existing DBs that already ran the initial)
**File (EDIT):** `primebrick-be-v3/db-meta/fire-and-forget/add_service_registry_metadata_columns.sql`

Append the new columns to the EXISTING fire-and-forget file (do NOT create a new one):

```sql
-- Add is_enabled and icon columns (for existing databases that already ran the initial patch)
ALTER TABLE public.service_registry
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS icon_type text NOT NULL DEFAULT 'icon';
```

---

### Phase 2: SDK Changes

#### 2.1 Update IServiceRegistry Interface
**File:** `primebrick-v3-sdk/src/service/service-registry.ts`

Add fields:
```typescript
export interface IServiceRegistry {
  code: string;
  base_url: string;
  endpoints: Record<string, unknown>;
  name?: string;
  description?: string;
  author?: string;
  github_repo_url?: string;
  service_version?: string;
  is_behind_scaler?: boolean;
  status?: string;
  last_health_check_at?: Date;
  // NEW FIELDS:
  is_enabled?: boolean;
  icon?: string;
  icon_type?: 'url' | 'svg' | 'base64' | 'icon';
}
```

#### 2.2 Update ServiceRegisterPayload
**File:** `primebrick-v3-sdk/src/service/service-lifecycle-subjects.ts`

Add optional icon fields to `ServiceHeartbeatPayload`:
```typescript
export interface ServiceHeartbeatPayload {
  // ... existing fields ...
  // NEW FIELDS (optional, sent by microservice on register):
  icon?: string;
  icon_type?: 'url' | 'svg' | 'base64' | 'icon';
}
```

Note: `is_enabled` is NOT in the payload — it's admin-controlled only, set by BE on first insert.

#### 2.3 Add New Permissions
**File:** `primebrick-v3-sdk/src/auth/permissions.ts`

Add after `MODULES_READ_ALL`:
```typescript
MODULES_READ_SINGLE: "modules.read.single",
MODULES_UPDATE: "modules.update.single",
MODULES_DELETE: "modules.delete.single",
MODULES_CONFIG_READ: "modules.config.read",
MODULES_CONFIG_UPDATE: "modules.config.update",
```

---

### Phase 3: BE Entity & Repository Changes

#### 3.1 Update ServiceRegistryEntity
**File:** `primebrick-be-v3/src/modules/system/service_registry_entity.ts`

Add new columns:
```typescript
@Column({ nullable: false, defaultSql: "true" })
is_enabled: boolean;

@Column({ nullable: true })
icon?: string;

@Column({ nullable: false, defaultSql: "'icon'" })
icon_type: string;
```

#### 3.2 Update Service Registry Mirror Entity (US)
**File:** `primebrick-us-v3/emailsender/src/domain/entities/service_registry_entity.ts`

Add same three fields to maintain parity with BE entity.

#### 3.3 Update ServiceRegistryRepo
**File:** `primebrick-be-v3/src/modules/proxy/service-registry-repo.ts`

Add methods:
```typescript
async findByCodeDetailed(code: string): Promise<ServiceRegistryEntry | null> {
  // Same as findByCode but includes ALL fields (is_enabled, icon, icon_type)
  // Use full projection including new fields
}

async toggleEnabled(code: string, isEnabled: boolean): Promise<void> {
  // Update is_enabled field by code
  // Use repo.update with matchBy: "code"
}

async hardDeleteByCode(code: string): Promise<void> {
  // Hard delete by code
  // Use repo.hardDelete with matchBy: "code"
}

async updateByCodeAdmin(code: string, row: Partial<ServiceRegistryEntry>): Promise<void> {
  // Admin update (from config page tab 1)
  // Updates: name, description, base_url, icon, icon_type, github_repo_url, author
  // Does NOT touch: is_enabled (separate toggle), status (health-controlled)
}
```

Update `fullProjection()` to include `is_enabled`, `icon`, `icon_type`.

#### 3.4 Update ServiceLifecycleSubscriber
**File:** `primebrick-be-v3/src/modules/proxy/service-lifecycle-subscriber.ts`

In `handleRegister()`:
- **On insert (new record):** set `is_enabled = true` (default), `icon` and `icon_type` from payload
- **On update (existing record):** update `icon` and `icon_type` from payload, but **DO NOT touch `is_enabled`** (admin-controlled)

```typescript
// In the insert branch:
await this.repo.insert({
  code, base_url, endpoints: payload.endpoints,
  service_version: payload.service_version,
  name: payload.name, description: payload.description,
  author: payload.author, github_repo_url: payload.github_repo_url,
  icon: payload.icon, icon_type: payload.icon_type || 'icon',
  is_behind_scaler: true, is_enabled: true,  // <-- is_enabled defaults to true
  status, last_health_check_at: now,
});

// In the update branch:
await this.repo.updateByCode(code, {
  ...payload,
  icon: payload.icon,           // <-- icon updated from payload
  icon_type: payload.icon_type, // <-- icon_type updated from payload
  // is_enabled is NOT included in update — preserved from DB
  status, last_health_check_at: now,
});
```

---

### Phase 4: BE API Endpoints

#### 4.1 New Endpoints in System Router
**File:** `primebrick-be-v3/src/modules/system/system-router.ts`

Add these endpoints:

```typescript
// GET /api/v1/system/services/:code — single service by code
router.get(
  "/api/v1/system/services/:code",
  rbacHandler([Permission.MODULES_READ_SINGLE]),
  asyncHandler(async (req, res) => {
    const repo = new ServiceRegistryRepo(getPool());
    const service = await repo.findByCodeDetailed(req.params.code);
    if (!service) {
      res.status(404).json({ type: "about:blank", status: 404, title: "Not Found", detail: `Service '${req.params.code}' not found` });
      return;
    }
    res.json({ service });
  })
);

// PATCH /api/v1/system/services/:code/toggle — toggle is_enabled
router.patch(
  "/api/v1/system/services/:code/toggle",
  rbacHandler([Permission.MODULES_UPDATE]),
  asyncHandler(async (req, res) => {
    const repo = new ServiceRegistryRepo(getPool());
    const existing = await repo.findByCodeDetailed(req.params.code);
    if (!existing) {
      res.status(404).json({ type: "about:blank", status: 404, title: "Not Found" });
      return;
    }
    const newEnabled = !existing.is_enabled;
    await repo.toggleEnabled(req.params.code, newEnabled);
    res.json({ code: req.params.code, is_enabled: newEnabled });
  })
);

// DELETE /api/v1/system/services/:code — hard delete
router.delete(
  "/api/v1/system/services/:code",
  rbacHandler([Permission.MODULES_DELETE]),
  asyncHandler(async (req, res) => {
    const repo = new ServiceRegistryRepo(getPool());
    const existing = await repo.findByCodeDetailed(req.params.code);
    if (!existing) {
      res.status(404).json({ type: "about:blank", status: 404, title: "Not Found" });
      return;
    }
    await repo.hardDeleteByCode(req.params.code);
    res.json({ code: req.params.code, deleted: true });
  })
);

// PUT /api/v1/system/services/:code — update service_registry fields (config tab 1)
router.put(
  "/api/v1/system/services/:code",
  rbacHandler([Permission.MODULES_UPDATE]),
  asyncHandler(async (req, res) => {
    const repo = new ServiceRegistryRepo(getPool());
    const { name, description, base_url, icon, icon_type, author, github_repo_url } = req.body;
    await repo.updateByCodeAdmin(req.params.code, {
      name, description, base_url, icon, icon_type, author, github_repo_url,
    });
    const updated = await repo.findByCodeDetailed(req.params.code);
    res.json({ service: updated });
  })
);
```

#### 4.2 Update Existing GET /api/v1/system/services
**File:** `primebrick-be-v3/src/modules/system/system-router.ts`

The existing `GET /api/v1/system/services` already calls `repo.findAll()`. After updating `fullProjection()` to include new fields, the response will automatically include `is_enabled`, `icon`, `icon_type`.

#### 4.3 Update GET /api/v1/modules
**File:** `primebrick-be-v3/src/index.ts` (line 152)

Update mapping to use `is_enabled` instead of hardcoded `true`:
```typescript
apiRouter.get("/modules", rbacHandler([Permission.MODULES_READ_ALL]), async (_req, res) => {
  const repo = new ServiceRegistryRepo(getPool());
  const services = await repo.findAll();
  res.json({
    modules: services.map((s) => ({
      id: s.code.toLowerCase(),
      name: s.name || s.code,
      enabled: s.is_enabled,  // <-- was hardcoded true
    })),
  });
});
```

---

### Phase 5: US Emailsender Changes

#### 5.1 Add icon to Registration Payload
**File:** `primebrick-us-v3/emailsender/src/index.ts` (lines 96-137)

Add icon info to the `ServiceRegistrar` constructor:
```typescript
const registrar = new ServiceRegistrar(
  NatsClient,
  {
    serviceCode,
    baseUrl,
    endpoints: { webhook: `${baseUrl}/webhook`, health: `${baseUrl}/health` },
    service_version: serviceVersion,
    name: "Email Sender",
    description: "Email sending microservice",
    is_behind_scaler: false,
    // NEW:
    icon: "mail",           // lucide icon name
    icon_type: "icon",      // type: lucide icon
  },
  // ... health check function ...
);
```

#### 5.2 Add Config API Endpoint (for Tab 2)
**File (NEW):** `primebrick-us-v3/emailsender/src/server/config-route.ts`

```typescript
import { getDal } from "../dal/dal-instance";
import { ConfigEntryEntity } from "../domain/entities/config_entry_entity";
import { Repository } from "@primebrick/dal-pg";

export async function configRouteHandler(req, res, url): Promise<boolean> {
  const path = url.pathname;
  const method = req.method;

  // GET /api/v1/config — list all config entries
  if (path === "/api/v1/config" && method === "GET") {
    const repo = new Repository(getDal().getPool());
    const entries = await repo.findAll(ConfigEntryEntity, [
      // projection: key, value, label_key, description_key, uuid
    ]);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ config: entries }));
    return true;
  }

  // PUT /api/v1/config/:key — update single config value
  const putMatch = path.match(/^\/api\/v1\/config\/([^/]+)$/);
  if (putMatch && method === "PUT") {
    // Parse body, update config entry by key
    // ...
    return true;
  }

  return false;
}
```

**File:** `primebrick-us-v3/emailsender/src/server/composite-route.ts`

Add config route handler:
```typescript
export async function compositeRouteHandler(req, res, url): Promise<boolean> {
  if (await openapiRouteHandler(req, res, url)) return true;
  if (await providersRouteHandler(req, res, url)) return true;
  if (await configRouteHandler(req, res, url)) return true;  // NEW
  if (await webhookRouteHandler(req, res, url)) return true;
  return false;
}
```

---

### Phase 6: FE Types & API Client

#### 6.1 Update ServiceInfo Type
**File:** `primebrick-fe-v3/src/lib/api-types.ts`

```typescript
export type IconType = 'url' | 'svg' | 'base64' | 'icon';

export type ServiceInfo = {
  code: string;
  base_url: string;
  endpoints: Record<string, unknown>;
  name?: string;
  description?: string;
  author?: string;
  github_repo_url?: string;
  service_version?: string;
  is_behind_scaler: boolean;
  status: string;
  last_health_check_at?: string;
  // NEW FIELDS:
  is_enabled: boolean;
  icon?: string;
  icon_type: IconType;
};

export type ModuleConfigEntry = {
  uuid: string;
  key: string;
  value: string | null;
  label_key?: string;
  description_key?: string;
};
```

#### 6.2 Add API Functions
**File:** `primebrick-fe-v3/src/lib/api.ts`

```typescript
// Fetch single service by code
export async function fetchService(code: string): Promise<ServiceInfo> {
  const res = await apiFetch(`/api/v1/system/services/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`Service request failed (${res.status})`);
  const data = await res.json() as { service: ServiceInfo };
  return data.service;
}

// Toggle is_enabled
export async function toggleModule(code: string): Promise<{ is_enabled: boolean }> {
  const res = await apiFetch(`/api/v1/system/services/${encodeURIComponent(code)}/toggle`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error(`Toggle failed (${res.status})`);
  return await res.json();
}

// Hard delete
export async function deleteModule(code: string): Promise<void> {
  const res = await apiFetch(`/api/v1/system/services/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

// Update service_registry fields (config tab 1)
export async function updateService(code: string, data: Partial<ServiceInfo>): Promise<ServiceInfo> {
  const res = await apiFetch(`/api/v1/system/services/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Update failed (${res.status})`);
  const result = await res.json() as { service: ServiceInfo };
  return result.service;
}

// Fetch module config (tab 2 — proxied to microservice)
export async function fetchModuleConfig(code: string): Promise<ModuleConfigEntry[]> {
  const res = await apiFetch(`/ws/${encodeURIComponent(code)}/api/v1/config`);
  if (!res.ok) throw new Error(`Config fetch failed (${res.status})`);
  const data = await res.json() as { config: ModuleConfigEntry[] };
  return data.config;
}

// Update module config entry (tab 2)
export async function updateModuleConfigKey(code: string, key: string, value: string): Promise<void> {
  const res = await apiFetch(`/ws/${encodeURIComponent(code)}/api/v1/config/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`Config update failed (${res.status})`);
}
```

---

### Phase 7: FE Modules List Page (Revamp)

#### 7.1 Rewrite Modules Page
**File:** `primebrick-fe-v3/src/routes/(app)/system/settings/modules/+page.svelte`

Complete rewrite. Structure:

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import { DynamicIcon } from '$lib/components/ui/dynamic-icon';
  import Package from '@lucide/svelte/icons/package';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Settings from '@lucide/svelte/icons/settings';
  import Download from '@lucide/svelte/icons/download';
  import Store from '@lucide/svelte/icons/store';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Hourglass from '@lucide/svelte/icons/hourglass';
  import { pushNotification } from '$lib/errors/app-errors';
  import { fetchServices, toggleModule, deleteModule } from '$lib/api';
  import type { ServiceInfo } from '$lib/api-types';
  import DeleteDialog from '$lib/components/entity-list-table/dialogs/DeleteDialog.svelte';

  // State
  let services = $state<ServiceInfo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Delete dialog state
  let deleteDialogOpen = $state(false);
  let deleteTarget = $state<ServiceInfo | null>(null);
  let isDeleting = $state(false);

  onMount(async () => {
    await loadServices();
  });

  async function loadServices() {
    loading = true;
    error = null;
    try {
      services = await fetchServices();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load modules';
      pushNotification({
        impact: 'HIGH',
        messageKey: 'shell.settings.modules.loadFailed',
        scope: $t('shell.settings.modules.title'),
        detail: error,
      });
    } finally {
      loading = false;
    }
  }

  function handleImportModule() {
    pushNotification({
      impact: 'MEDIUM',
      messageKey: 'shell.settings.modules.notImplemented',
      scope: $t('shell.settings.modules.importModule'),
    });
  }

  function handleOpenMarketplace() {
    pushNotification({
      impact: 'MEDIUM',
      messageKey: 'shell.settings.modules.notImplemented',
      scope: $t('shell.settings.modules.openMarketplace'),
    });
  }

  async function handleToggle(module: ServiceInfo) {
    try {
      const result = await toggleModule(module.code);
      // Update local state
      services = services.map(s =>
        s.code === module.code ? { ...s, is_enabled: result.is_enabled } : s
      );
      pushNotification({
        impact: 'NONE',
        messageKey: result.is_enabled
          ? 'shell.settings.modules.moduleEnabled'
          : 'shell.settings.modules.moduleDisabled',
        scope: $t('shell.settings.modules.title'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'shell.settings.modules.toggleFailed',
        scope: $t('shell.settings.modules.title'),
        detail: e instanceof Error ? e.message : undefined,
      });
    }
  }

  function openDeleteDialog(module: ServiceInfo) {
    deleteTarget = module;
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    isDeleting = true;
    try {
      await deleteModule(deleteTarget.code);
      services = services.filter(s => s.code !== deleteTarget!.code);
      deleteDialogOpen = false;
      deleteTarget = null;
      pushNotification({
        impact: 'NONE',
        messageKey: 'shell.settings.modules.moduleDeleted',
        scope: $t('shell.settings.modules.title'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'shell.settings.modules.deleteFailed',
        scope: $t('shell.settings.modules.title'),
        detail: e instanceof Error ? e.message : undefined,
      });
    } finally {
      isDeleting = false;
    }
  }

  function openConfigPage(module: ServiceInfo) {
    const url = `/system/settings/modules/${encodeURIComponent(module.code)}`;
    const childWindow = window.open(url, '_blank');
    if (childWindow) {
      childWindow.focus();
    }
  }

  // Icon rendering helper
  function renderModuleIcon(module: ServiceInfo) {
    // Returns { type, value } for template logic
    if (!module.icon) return { kind: 'fallback' };
    switch (module.icon_type) {
      case 'url': return { kind: 'url', value: module.icon };
      case 'base64': return { kind: 'base64', value: module.icon };
      case 'svg': return { kind: 'svg', value: module.icon };
      case 'icon': return { kind: 'icon', value: module.icon };
      default: return { kind: 'fallback' };
    }
  }
</script>

<!-- Content wrapper: consistent with profile page padding/border pattern -->
<div class="h-full p-2 sm:p-3">
  <div class="flex h-full w-full flex-col gap-4 min-h-0">
    <!-- Header: breadcrumb + title (page-specific, within settings tab) -->
    <header class="shrink-0">
      <h1 class="truncate text-xl font-semibold leading-tight">
        {$t('shell.settings.modules.title')}
      </h1>
    </header>

    <!-- Content container: bordered, like FormPageLayout -->
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
      <div class="flex-1 overflow-auto p-4">
        <div class="space-y-6">
          <!-- Action buttons row -->
          <div class="flex items-center justify-end gap-2">
            <Button variant="default" onclick={handleImportModule}>
              <Download class="size-4" />
              {$t('shell.settings.modules.importModule')}
            </Button>
            <Button variant="outline" onclick={handleOpenMarketplace}>
              <Store class="size-4" />
              {$t('shell.settings.modules.openMarketplace')}
            </Button>
          </div>

          <!-- Loading state -->
          {#if loading}
            <div class="grid min-h-56 place-items-center p-3">
              <div class="relative flex flex-col items-center gap-2 text-center">
                <div class="pb-watermark-empty">
                  <Hourglass class="size-20 text-info" />
                </div>
                <div class="text-sm font-medium text-muted-foreground">
                  {$t('common.loading')}
                </div>
              </div>
            </div>
          {:else if error}
            <!-- Error state -->
            <div class="grid min-h-56 place-items-center p-3">
              <div class="relative flex flex-col items-center gap-2 text-center">
                <div class="pb-watermark-empty">
                  <TriangleAlert class="size-20 text-warning" />
                </div>
                <div class="text-sm font-medium text-muted-foreground">
                  {$t('shell.settings.modules.loadFailed')}
                </div>
              </div>
            </div>
          {:else if services.length === 0}
            <!-- Empty state: no modules installed -->
            <div class="grid min-h-56 place-items-center p-3">
              <div class="relative flex flex-col items-center gap-2 text-center">
                <div class="pb-watermark-empty">
                  <TriangleAlert class="size-20 text-warning" />
                </div>
                <div class="text-sm font-medium text-muted-foreground">
                  {$t('shell.settings.modules.noModules')}
                </div>
                <div class="text-xs text-muted-foreground">
                  {$t('shell.settings.modules.noModulesHint')}
                </div>
              </div>
            </div>
          {:else}
            <!-- Installed modules list -->
            <div class="space-y-2">
              {#each services as module (module.code)}
                <div class="flex items-center justify-between rounded-lg border p-3">
                  <!-- Left: icon + name + description + version badge -->
                  <div class="flex items-center gap-3">
                    <!-- Icon rendering -->
                    {#if renderModuleIcon(module).kind === 'icon'}
                      <DynamicIcon name={renderModuleIcon(module).value} size={20} class="text-primary" />
                    {:else if renderModuleIcon(module).kind === 'url'}
                      <img src={renderModuleIcon(module).value} alt={module.name || module.code} class="size-5 rounded" />
                    {:else if renderModuleIcon(module).kind === 'base64'}
                      <img src="data:image/png;base64,{renderModuleIcon(module).value}" alt={module.name || module.code} class="size-5 rounded" />
                    {:else if renderModuleIcon(module).kind === 'svg'}
                      <div class="size-5">{@html renderModuleIcon(module).value}</div>
                    {:else}
                      <Package class="size-5 text-muted-foreground" />
                    {/if}

                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="font-medium truncate">{module.name || module.code}</p>
                        {#if module.service_version}
                          <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">
                            v{module.service_version}
                          </Badge>
                        {/if}
                      </div>
                      {#if module.description}
                        <p class="text-sm text-muted-foreground truncate">{module.description}</p>
                      {/if}
                    </div>
                  </div>

                  <!-- Right: toggle + config link + trash -->
                  <div class="flex items-center gap-2">
                    <!-- Toggle switch (is_enabled) -->
                    <Switch
                      checked={module.is_enabled}
                      onCheckedChange={() => handleToggle(module)}
                    />

                    <!-- Config page link -->
                    <Button
                      variant="ghost"
                      size="icon"
                      onclick={() => openConfigPage(module)}
                      title={$t('shell.settings.modules.configure')}
                    >
                      <Settings class="size-4" />
                    </Button>

                    <!-- Hard delete with confirm dialog -->
                    <Button
                      variant="ghost"
                      size="icon"
                      onclick={() => openDeleteDialog(module)}
                      title={$t('common.delete')}
                    >
                      <Trash2 class="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Delete confirm dialog (standard pattern) -->
<DeleteDialog
  open={deleteDialogOpen}
  onOpenChange={(open) => { if (!open) { deleteDialogOpen = false; deleteTarget = null; } }}
  isDeleting={isDeleting}
  onConfirm={confirmDelete}
  onCancel={() => { deleteDialogOpen = false; deleteTarget = null; }}
/>
```

**Key changes from current page:**
- Content wrapper with `p-2 sm:p-3` + `rounded-md border bg-background` (matches FormPageLayout visual pattern)
- `<h1>` instead of `<h2>` (matches profile page title style)
- LOAD MODULE section removed → replaced with IMPORT MODULE + OPEN MARKETPLACE buttons
- Mock data replaced with `fetchServices()` API call
- Module row: icon (DynamicIcon/img/SVG), name, version badge, description
- Toggle Switch replaces Active/Inactive badge
- Config page link button (Settings icon) added
- Trash button now opens DeleteDialog confirm dialog
- Empty state with TriangleAlert icon when no modules
- Loading state with Hourglass icon
- Error state with TriangleAlert icon

---

### Phase 8: FE Module Config Page (NEW)

#### 8.1 Route Structure
```
primebrick-fe-v3/src/routes/(app)/system/settings/modules/[code]/
  +page.ts      — load function (fetch service by code)
  +page.svelte  — config page with 2 tabs
```

#### 8.2 Load Function
**File (NEW):** `primebrick-fe-v3/src/routes/(app)/system/settings/modules/[code]/+page.ts`

```typescript
import { fetchService } from '$lib/api';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
  const service = await fetchService(params.code);
  return { service };
};
```

#### 8.3 Config Page Component
**File (NEW):** `primebrick-fe-v3/src/routes/(app)/system/settings/modules/[code]/+page.svelte`

Structure:
- Uses `FormPageLayout` (consistent with profile/orgs edit pages)
- Header snippet: breadcrumb + h1 with module name
- Children snippet: 2 tabs
  - Tab 1 "Service Info": form with service_registry fields (name, description, base_url, icon, icon_type, author, github_repo_url, service_version)
  - Tab 2 "Module Config": dynamic key-value form from proxied config API
- Footer actions snippet: Save button

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
  import { page } from '$app/state';
  import FormPageLayout from '$lib/components/FormPageLayout.svelte';
  import AppPageBreadcrumb from '$lib/components/AppPageBreadcrumb.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs';
  import { pushNotification } from '$lib/errors/app-errors';
  import { updateService, fetchModuleConfig, updateModuleConfigKey } from '$lib/api';
  import type { ServiceInfo, ModuleConfigEntry, IconType } from '$lib/api-types';

  let { data } = $props();
  let service = $state<ServiceInfo>(data.service);

  // Tab 1 form state
  let formData = $state({
    name: service.name || '',
    description: service.description || '',
    base_url: service.base_url,
    icon: service.icon || '',
    icon_type: service.icon_type || 'icon',
    author: service.author || '',
    github_repo_url: service.github_repo_url || '',
  });

  // Tab 2 config state
  let configEntries = $state<ModuleConfigEntry[]>([]);
  let configLoading = $state(false);
  let configError = $state<string | null>(null);
  let activeTab = $state('service-info');

  async function loadConfig() {
    configLoading = true;
    configError = null;
    try {
      configEntries = await fetchModuleConfig(service.code);
    } catch (e) {
      configError = e instanceof Error ? e.message : 'Failed to load config';
      // If microservice doesn't expose config API, show graceful message
    } finally {
      configLoading = false;
    }
  }

  // Load config when tab 2 is first activated
  $effect(() => {
    if (activeTab === 'module-config' && configEntries.length === 0 && !configLoading && !configError) {
      loadConfig();
    }
  });

  async function handleSaveServiceInfo() {
    try {
      const updated = await updateService(service.code, formData);
      service = updated;
      pushNotification({
        impact: 'NONE',
        messageKey: 'common.saveSuccess',
        scope: $t('shell.settings.modules.config.serviceInfo'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'common.saveFailed',
        scope: $t('shell.settings.modules.config.serviceInfo'),
        detail: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleSaveConfigKey(entry: ModuleConfigEntry, newValue: string) {
    try {
      await updateModuleConfigKey(service.code, entry.key, newValue);
      configEntries = configEntries.map(e =>
        e.key === entry.key ? { ...e, value: newValue } : e
      );
      pushNotification({
        impact: 'NONE',
        messageKey: 'common.saveSuccess',
        scope: $t('shell.settings.modules.config.moduleConfig'),
      });
    } catch (e) {
      pushNotification({
        impact: 'HIGH',
        messageKey: 'common.saveFailed',
        scope: $t('shell.settings.modules.config.moduleConfig'),
        detail: e instanceof Error ? e.message : undefined,
      });
    }
  }
</script>

<FormPageLayout
  entity="service_registry"
  rowUuid={service.code}
  auditData={{}}
  auditingColumns={[]}
>
  {#snippet header()}
    <div class="min-w-0 space-y-1">
      <AppPageBreadcrumb
        segments={[
          { label: $t('shell.system') },
          { label: $t('shell.settings.title'), href: '/system/settings/modules' },
          { label: $t('shell.settings.modules.title'), href: '/system/settings/modules' },
          { label: service.name || service.code },
        ]}
      />
      <h1 class="truncate text-xl font-semibold leading-tight">
        {service.name || service.code}
      </h1>
    </div>
  {/snippet}

  {#snippet children()}
    <div class="flex-1 overflow-auto p-4">
      <Tabs bind:value={activeTab}>
        <TabsList>
          <TabsTrigger value="service-info">
            {$t('shell.settings.modules.config.serviceInfo')}
          </TabsTrigger>
          <TabsTrigger value="module-config">
            {$t('shell.settings.modules.config.moduleConfig')}
          </TabsTrigger>
        </TabsList>

        <!-- Tab 1: Service Registry Fields -->
        <TabsContent value="service-info" class="flex-1 overflow-y-auto p-4">
          <form id="service-info-form" onsubmit={handleSaveServiceInfo}>
            <div class="grid grid-cols-2 gap-6">
              <!-- name -->
              <!-- description -->
              <!-- base_url -->
              <!-- icon -->
              <!-- icon_type (select: url, svg, base64, icon) -->
              <!-- author -->
              <!-- github_repo_url -->
              <!-- service_version (read-only display) -->
            </div>
          </form>
        </TabsContent>

        <!-- Tab 2: Module-Specific Config (dynamic key-value) -->
        <TabsContent value="module-config" class="flex-1 overflow-y-auto p-4">
          {#if configLoading}
            <div>{$t('common.loading')}</div>
          {:else if configError}
            <div class="text-sm text-muted-foreground">
              {$t('shell.settings.modules.config.configNotAvailable')}
            </div>
          {:else if configEntries.length === 0}
            <div class="text-sm text-muted-foreground">
              {$t('shell.settings.modules.config.noConfigEntries')}
            </div>
          {:else}
            <div class="space-y-4">
              {#each configEntries as entry (entry.key)}
                <div class="space-y-2">
                  <label class="text-sm font-medium">
                    {entry.label_key ? $t(entry.label_key) : entry.key}
                  </label>
                  {#if entry.description_key}
                    <p class="text-xs text-muted-foreground">{$t(entry.description_key)}</p>
                  {/if}
                  <Input
                    value={entry.value || ''}
                    onchange={(e) => handleSaveConfigKey(entry, e.target.value)}
                  />
                </div>
              {/each}
            </div>
          {/if}
        </TabsContent>
      </Tabs>
    </div>
  {/snippet}

  {#snippet footerActions()}
    {#if activeTab === 'service-info'}
      <Button type="submit" form="service-info-form">
        {$t('common.save')}
      </Button>
    {/if}
  {/snippet}
</FormPageLayout>
```

---

### Phase 9: i18n Translations

#### 9.1 Update All 6 Language Files
**Files:**
- `primebrick-fe-v3/src/lib/i18n/messages/en-GB.json`
- `primebrick-fe-v3/src/lib/i18n/messages/de-DE.json`
- `primebrick-fe-v3/src/lib/i18n/messages/es-ES.json`
- `primebrick-fe-v3/src/lib/i18n/messages/fr-FR.json`
- `primebrick-fe-v3/src/lib/i18n/messages/it-IT.json`
- `primebrick-fe-v3/src/lib/i18n/messages/pt-PT.json`

Update `shell.settings.modules` section:

```json
"modules": {
  "title": "Modules",
  "importModule": "Import Module",
  "openMarketplace": "Open Marketplace",
  "notImplemented": "NOT IMPLEMENTED YET!",
  "installedModules": "Installed Modules",
  "version": "Version",
  "active": "Active",
  "inactive": "Inactive",
  "enabled": "Enabled",
  "disabled": "Disabled",
  "configure": "Configure",
  "noModules": "No modules installed",
  "noModulesHint": "Start a microservice to see it appear here automatically.",
  "loadFailed": "Could not load modules",
  "moduleEnabled": "Module enabled",
  "moduleDisabled": "Module disabled",
  "moduleDeleted": "Module deleted",
  "toggleFailed": "Failed to toggle module",
  "deleteFailed": "Failed to delete module",
  "config": {
    "serviceInfo": "Service Info",
    "moduleConfig": "Module Config",
    "configNotAvailable": "Configuration API not available for this module.",
    "noConfigEntries": "No configuration entries for this module."
  }
}
```

Remove obsolete keys: `uploadModule`, `selectModuleFile`, `installButton`.

**IMPORTANT:** Translations must be added to ALL 6 language files immediately (per AGENTS.md i18n rule). English values above are reference — other languages need proper translations.

---

### Phase 10: Registration Timing Documentation

#### 10.1 When Does a Module Create Its First Record?

**Answer (empirically verified):** A module creates its first record in `service_registry` when the microservice starts up and publishes a `service.register` NATS event. The BE `ServiceLifecycleSubscriber` receives this event and inserts a new row.

**Flow:**
1. Microservice (e.g., emailsender) starts → connects to NATS
2. Microservice calls `registrar.register()` → publishes `service.register` NATS event with payload
3. BE `ServiceLifecycleSubscriber` receives event → checks if record exists (by code or code+base_url)
4. If not exists → **INSERT** new row with `is_enabled = true` (default), icon from payload
5. If exists → **UPDATE** existing row (icon from payload, `is_enabled` preserved from DB)

**Implication for modules page:** The page will not be empty as long as at least one microservice is running and connected to NATS. If no microservices are running, the empty state is shown.

**No changes needed to this flow** — the existing NATS registration mechanism is correct. We only add `icon`/`icon_type` to the payload and `is_enabled` defaults to `true` on insert.

---

## 5. Impacted Files Summary

### SDK (`primebrick-v3-sdk`)
| File | Change |
|------|--------|
| `src/service/service-registry.ts` | Add `is_enabled`, `icon`, `icon_type` to `IServiceRegistry` |
| `src/service/service-lifecycle-subjects.ts` | Add `icon`, `icon_type` to `ServiceHeartbeatPayload` |
| `src/auth/permissions.ts` | Add `MODULES_READ_SINGLE`, `MODULES_UPDATE`, `MODULES_DELETE`, `MODULES_CONFIG_READ`, `MODULES_CONFIG_UPDATE` |

### BE (`primebrick-be-v3`)
| File | Change |
|------|--------|
| `db-meta/patches/00000000000000_init_database.sql` | EDIT — add `is_enabled`, `icon`, `icon_type` columns to existing `service_registry` CREATE TABLE block |
| `db-meta/fire-and-forget/add_service_registry_metadata_columns.sql` | EDIT — append ALTER TABLE for new columns to existing fire-and-forget file |
| `src/modules/system/service_registry_entity.ts` | Add `is_enabled`, `icon`, `icon_type` columns |
| `src/modules/proxy/service-registry-repo.ts` | Add `findByCodeDetailed`, `toggleEnabled`, `hardDeleteByCode`, `updateByCodeAdmin`; update `fullProjection()` |
| `src/modules/proxy/service-lifecycle-subscriber.ts` | Handle `icon`/`icon_type` in register; set `is_enabled=true` on insert only |
| `src/modules/system/system-router.ts` | Add GET single, PATCH toggle, DELETE, PUT update endpoints |
| `src/index.ts` | Update GET /api/v1/modules mapping to use `is_enabled` |

### US (`primebrick-us-v3`)
| File | Change |
|------|--------|
| `emailsender/src/domain/entities/service_registry_entity.ts` | Add `is_enabled`, `icon`, `icon_type` fields (mirror) |
| `emailsender/src/index.ts` | Add `icon: "mail"`, `icon_type: "icon"` to registration payload |
| `emailsender/src/server/config-route.ts` | NEW — config API endpoint (GET list, PUT update) |
| `emailsender/src/server/composite-route.ts` | Register config route handler |

### FE (`primebrick-fe-v3`)
| File | Change |
|------|--------|
| `src/lib/api-types.ts` | Add `is_enabled`, `icon`, `icon_type` to `ServiceInfo`; add `IconType`, `ModuleConfigEntry` |
| `src/lib/api.ts` | Add `fetchService`, `toggleModule`, `deleteModule`, `updateService`, `fetchModuleConfig`, `updateModuleConfigKey` |
| `src/routes/(app)/system/settings/modules/+page.svelte` | Complete rewrite (list page) |
| `src/routes/(app)/system/settings/modules/[code]/+page.ts` | NEW — load function |
| `src/routes/(app)/system/settings/modules/[code]/+page.svelte` | NEW — config page with 2 tabs |
| `src/lib/i18n/messages/en-GB.json` | Update module translations |
| `src/lib/i18n/messages/de-DE.json` | Update module translations |
| `src/lib/i18n/messages/es-ES.json` | Update module translations |
| `src/lib/i18n/messages/fr-FR.json` | Update module translations |
| `src/lib/i18n/messages/it-IT.json` | Update module translations |
| `src/lib/i18n/messages/pt-PT.json` | Update module translations |

---

## 6. Acceptance Criteria

### AC-1: Content Wrapper Consistency
- [ ] Modules list page uses `p-2 sm:p-3` outer padding (same as FormPageLayout)
- [ ] Modules list page has `rounded-md border bg-background` content container
- [ ] Page title uses `<h1>` with `text-xl font-semibold leading-tight` (not `<h2>`)
- [ ] Visual consistency with profile page padding/border pattern

### AC-2: LOAD MODULE Removed, Buttons Added
- [ ] File upload section (LOAD MODULE) completely removed
- [ ] "IMPORT MODULE" primary button (variant="default") present
- [ ] "OPEN MARKETPLACE" button present
- [ ] Both buttons call `pushNotification` with "NOT IMPLEMENTED YET!" message
- [ ] No file Input, no Install button, no uploadedFile state

### AC-3: Toggle Switch (is_enabled)
- [ ] Each module row has a Switch component bound to `is_enabled`
- [ ] Toggling calls PATCH `/api/v1/system/services/:code/toggle`
- [ ] Toggle updates local state reactively
- [ ] Success/failure shows `pushNotification`
- [ ] Active/Inactive badge removed (replaced by toggle)

### AC-4: Trash Button with Confirm Dialog
- [ ] Trash button opens `DeleteDialog` (standard destructive confirm dialog)
- [ ] Confirm calls DELETE `/api/v1/system/services/:code` (hard delete)
- [ ] Dialog shows loading state during deletion
- [ ] Success removes module from list; failure shows error notification

### AC-5: Module Row Display
- [ ] Left side: icon (DynamicIcon for `icon` type, `<img>` for `url`/`base64`, `{@html}` for `svg`, Package fallback)
- [ ] Service name shown (falls back to `code` if `name` is null)
- [ ] Service description shown (if present)
- [ ] Version badge: `<Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">v{service_version}</Badge>`
- [ ] Right side: Switch toggle + Settings config link button + Trash delete button

### AC-6: Config Page Link
- [ ] Settings icon button opens `/system/settings/modules/:code` in new window (follows orgs pattern)
- [ ] Config page uses `FormPageLayout` with header/children/footerActions
- [ ] Tab 1 "Service Info": form with service_registry editable fields
- [ ] Tab 1 Save calls PUT `/api/v1/system/services/:code`
- [ ] Tab 2 "Module Config": fetches from `/ws/:code/api/v1/config` (proxied)
- [ ] Tab 2 renders dynamic key-value form fields using `label_key`/`description_key`
- [ ] Tab 2 gracefully handles missing config API (error message, not crash)

### AC-7: Registration Timing
- [ ] `is_enabled` defaults to `true` on first NATS registration (insert)
- [ ] `is_enabled` is NOT overwritten on subsequent registrations (update)
- [ ] `icon` and `icon_type` are persisted from NATS payload on both insert and update
- [ ] Modules page is NOT empty when at least one microservice is running

### AC-8: Empty State
- [ ] When `services.length === 0`, shows centered TriangleAlert icon (size-20, text-warning)
- [ ] Shows "No modules installed" message
- [ ] Shows hint text about starting a microservice
- [ ] Layout matches `TableBody.svelte` empty state pattern (min-h-56 grid, centered)

### AC-9: Loading & Error States
- [ ] Loading state: Hourglass icon (size-20, text-info) + "Loading..." message
- [ ] Error state: TriangleAlert icon + error message + pushNotification

### AC-10: i18n
- [ ] All new translation keys added to ALL 6 language files
- [ ] Obsolete keys (`uploadModule`, `selectModuleFile`, `installButton`) removed
- [ ] No hardcoded English strings in components

### AC-11: Data Model Conventions
- [ ] All new fields use `snake_case` (`is_enabled`, `icon_type` — not `isEnabled`, `iconType`)
- [ ] No DTO transformation between BE JSON and TS types
- [ ] No fake defaults on read path (except DB-level `DEFAULT true` / `DEFAULT 'icon'`)

### AC-12: Error Notifications
- [ ] All errors use `pushNotification()` from `$lib/errors/app-errors`
- [ ] NO direct `toast.*()` calls
- [ ] Success notifications use `impact: 'NONE'`

---

## 7. Implementation Order

1. **Phase 1**: DB migration patch (schema changes)
2. **Phase 2**: SDK type updates (IServiceRegistry, payload, permissions)
3. **Phase 3**: BE entity + repo + lifecycle subscriber updates
4. **Phase 4**: BE API endpoints (GET single, PATCH toggle, DELETE, PUT update)
5. **Phase 5**: US emailsender (icon in registration + config API endpoint)
6. **Phase 6**: FE types + API client functions
7. **Phase 7**: FE modules list page rewrite
8. **Phase 8**: FE module config page (new route)
9. **Phase 9**: i18n translations (all 6 languages)
10. **Phase 10**: Verification (typecheck, build, manual test)

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| SVG rendering via `{@html}` is XSS-prone | Only admin can set icon values via config page. Consider sanitizing SVG in BE before persisting. Document risk. |
| Microservice may not expose config API | Tab 2 gracefully handles 404/error with informative message. Not all modules need config. |
| `is_enabled=false` doesn't actually stop proxying | This is a UI-level enable/disable. Actual proxy blocking is out of scope for this plan. Document as future work. |
| Hard delete removes service_registry row but microservice may re-register | Expected behavior — microservice will re-register on next NATS heartbeat. Document this. |
| Entity mirror in US needs manual sync | Known tech debt — documented in US code. SDK extraction planned separately. |

---

## 9. Out of Scope

- Actual module import/export functionality (buttons emit "NOT IMPLEMENTED YET")
- Marketplace functionality (button emits "NOT IMPLEMENTED YET")
- Proxy-level enforcement of `is_enabled` (blocking requests to disabled modules)
- Dynamic module discovery / plugin system
- Module installation from ZIP/TAR files
- EntityListTable integration for modules (custom list is simpler and more appropriate)
