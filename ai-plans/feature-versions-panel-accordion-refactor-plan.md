# Plan: Versions Panel — 3-Accordion Refactor

## Objective
Refactor the Versions panel (app sidebar sheet) from its current flat layout
(first block of architecture modules → microservices subsection → divider →
system info) into **3 accordions**: **Core Modules**, **Installed Modules**,
**System Info**. The "Installed Modules" accordion renders a card list styled
like the Modules settings page, with module icons, but **no actions** — only
the read-only data currently shown in the version-panel microservices section
(status/version/healthy-count badges, endpoint rows with status-dot bullets).

## Confirmed decisions (from user)
1. **Core Modules** accordion contains all 5 current first-block rows: Web Shell,
   Backend, Identity Provider, Redis, NATS — unchanged content.
2. **Installed Modules** cards **show the module icon** (DynamicIcon / url /
   base64 / svg), mirroring the Modules settings page card layout.
3. **All 3 accordions expanded by default** (`type="multiple"`, all values set).
4. **Endpoint/bullet rows shown for ALL cards** (including reserved and
   behind-scaler services), not only non-reserved direct-mode ones.

## Impacted files
| File | Change |
|------|--------|
| `primebrick-fe-v3/src/lib/components/ui/accordion/` | NEW — install via shadcn-svelte CLI |
| `primebrick-fe-v3/src/lib/shell/sheets/panels/VersionsPanel.svelte` | REWRITE body into 3 Accordions |
| `primebrick-fe-v3/src/lib/i18n/messages/{en-GB,it-IT,pt-PT,fr-FR,es-ES,de-DE}.json` | ADD 3 keys under `shell.health` |

No backend, no API, no store, no type changes. `services-store.svelte.ts`,
`api-types.ts` (`ServiceInfo`), `useHealthChip`, `BrowserClientInfo` are reused
unchanged.

## Step 1 — Install shadcn-svelte accordion
Run from `primebrick-fe-v3/`:
```
pnpm dlx shadcn-svelte@latest add accordion
```
This creates `src/lib/components/ui/accordion/` (index.js + Accordion.svelte
etc.), depending on `bits-ui` (already present). Verify with `Test-Path` after.

## Step 2 — i18n keys
Add 3 keys to `shell.health` in all 6 locale files. The existing `shell.health`
namespace is uniformly camelCase (versionsTitle, microservicesTitle,
shellVersion, backendVersion, identityProvider, clientTitle, ianaTimezone…).
The snake_case-singular convention rule applies to **entity** segments, not to
this shell-UI namespace, so new keys follow the existing camelCase style for
consistency.

| Key | en-GB | it-IT | pt-PT | fr-FR | es-ES | de-DE |
|-----|-------|-------|-------|-------|-------|-------|
| `coreModulesTitle` | Core Modules | Moduli Core | Módulos Core | Modules Core | Módulos Core | Kernmodule |
| `installedModulesTitle` | Installed Modules | Moduli Installati | Módulos Instalados | Modules Installés | Módulos Instalados | Installierte Module |
| `systemInfoTitle` | System Info | Info Sistema | Info do Sistema | Infos Système | Info del Sistema | Systeminfo |

Keep existing keys (`microservicesTitle`, `noMicroservices`, `online`,
`going_live`, `offline`, `unknown`, `clientTitle`, `shellVersion`,
`backendVersion`, `identityProvider`, `redis`, `nats`, …) — they are reused
inside the accordions.

## Step 3 — Rewrite VersionsPanel.svelte
Keep the `<script>` block imports + add:
```ts
import * as Accordion from '$lib/components/ui/accordion/index.js';
import DynamicIcon from '$lib/components/ui/dynamic-icon/DynamicIcon.svelte';
import Package from '@lucide/svelte/icons/package';
import Layers from '@lucide/svelte/icons/layers';
```
Keep `statusBadgeClass`, `statusDotClass`, all `$derived` (healthChip,
groupedServices, …). Add an icon-render snippet helper mirroring the modules
page (`DynamicIcon` / `<img url>` / `<img base64>` / `{@html svg}` / `Package`
fallback).

### Body structure
```svelte
<div class="flex h-full flex-col">
  <SheetHeader title={headerTitle} actions={headerActions} />
  <div class="min-h-0 flex-1 overflow-auto pb-4">
    <Accordion.Root type="multiple" class="w-full" value={['core','installed','system']}>

      <!-- 1. Core Modules -->
      <Accordion.Item value="core">
        <Accordion.Trigger>{$t('shell.health.coreModulesTitle')}</Accordion.Trigger>
        <Accordion.Content>
          <!-- EXISTING first block: Shell, Backend, IDP, Redis, NATS rows
               (lines 80-165 of current file), unchanged markup -->
        </Accordion.Content>
      </Accordion.Item>

      <!-- 2. Installed Modules -->
      <Accordion.Item value="installed">
        <Accordion.Trigger>{$t('shell.health.installedModulesTitle')}</Accordion.Trigger>
        <Accordion.Content>
          {#if servicesState.loading}
            <div class="text-xs text-muted-foreground">{$t('common.loading')}</div>
          {:else if groupedServices.size === 0}
            <div class="text-xs text-muted-foreground">{$t('shell.health.noMicroservices')}</div>
          {:else}
            <div class="space-y-2">
              {#each groupedServices as [code, instances] (code)}
                {@const isReserved = instances[0].is_reserved === true}
                {@const aggStatus = aggregateStatus(instances)}
                {@const behindScaler = instances[0].is_behind_scaler}
                {@const healthyCount = instances.filter((i) => i.status === 'online').length}
                {@const module = instances[0]}
                <div class="rounded-lg border p-3">
                  <!-- card header: icon + name/code/desc (left) + badges (right) -->
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                      <!-- icon block from modules page -->
                      ...DynamicIcon/url/base64/svg/Package fallback...
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <p class="font-medium truncate">{module.name || code}</p>
                          {#if module.service_version}
                            <Badge ...>v{module.service_version}</Badge>
                          {/if}
                          {#if isReserved}
                            <Badge ...>{$t('shell.settings.modules.reserved')}</Badge>
                          {/if}
                          {#if module.name && module.name !== code}
                            <span class="font-mono text-[10px] text-muted-foreground/70">{code}</span>
                          {/if}
                        </div>
                        {#if module.description}
                          <p class="text-sm text-muted-foreground truncate">
                            {module.description.length > 255 ? module.description.slice(0,255)+'…' : module.description}
                          </p>
                        {/if}
                      </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <!-- status badge: reserved → healthChip badge; else aggStatus badge -->
                      ...same as current version panel + modules page...
                      {#if !isReserved && !behindScaler}
                        <Badge ...>{healthyCount}/{instances.length}</Badge>
                      {/if}
                      {#if !isReserved && behindScaler}
                        <Badge ...><Layers .../>{$t('shell.settings.modules.behindScaler')}</Badge>
                      {/if}
                    </div>
                  </div>
                  <!-- endpoint rows: SHOW FOR ALL (per user decision) -->
                  <div class="mt-2 ml-4 space-y-1">
                    {#each instances as inst (inst.base_url)}
                      <div class="flex items-center justify-between gap-3 text-xs">
                        <div class="truncate text-muted-foreground">{inst.base_url}</div>
                        <div class={cn('size-2 rounded-full', statusDotClass(inst.status))}></div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </Accordion.Content>
      </Accordion.Item>

      <!-- 3. System Info -->
      <Accordion.Item value="system">
        <Accordion.Trigger>{$t('shell.health.systemInfoTitle')}</Accordion.Trigger>
        <Accordion.Content>
          <BrowserClientInfo />
        </Accordion.Content>
      </Accordion.Item>

    </Accordion.Root>
  </div>
</div>
```

### Notes
- The `reserved` and `behindScaler` translation keys already exist under
  `shell.settings.modules.*` — reuse them (read-only display, no conflict).
- Remove the old `<div class="h-px bg-border">` separator and the standalone
  microservices `<div class="px-4 py-3">` wrapper — replaced by accordion items.
- No Switch / Settings / Delete buttons (read-only panel).
- `data-testid`: add `versions-accordion-core`, `versions-accordion-installed`,
  `versions-accordion-system` on the `Accordion.Item` elements per the E2E
  testid convention.

## Step 4 — Svelte MCP validation
Before finalizing, pass the rewritten `VersionsPanel.svelte` to the
`svelte-autofixer` MCP tool and fix any returned `issues`. Use
`get-documentation` for authoritative Accordion snippets if needed.

## Step 5 — Verify
1. `pnpm run check` (typecheck) — must pass.
2. `pnpm run build` — must pass (catches `state_referenced_locally` elevated
   errors).
3. Visual check on the running dev server (reuse existing on port 5173 per
   dev-server rule — do NOT start a new one, do NOT kill the existing PID):
   open the Versions sheet from the sidebar, confirm 3 accordions all expanded,
   Core Modules shows 5 rows, Installed Modules shows cards with icons +
   badges + endpoint bullets, System Info shows browser info.

## Acceptance criteria
- [ ] `src/lib/components/ui/accordion/` exists (shadcn-svelte installed).
- [ ] VersionsPanel renders 3 accordions: Core Modules, Installed Modules,
      System Info — all expanded by default.
- [ ] Core Modules accordion contains the 5 original rows unchanged.
- [ ] Installed Modules accordion renders one card per service code, styled
      like the Modules settings page (rounded-lg border, icon, name, version
      badge, reserved badge, description), with status/version/healthy-count
      badges and per-instance endpoint rows + status-dot bullets for ALL cards.
- [ ] No action controls (Switch/Settings/Delete) in Installed Modules cards.
- [ ] System Info accordion wraps `BrowserClientInfo` unchanged.
- [ ] 3 new i18n keys present in all 6 locale files.
- [ ] `pnpm run check` and `pnpm run build` pass.
- [ ] Svelte MCP autofixer reports no issues.
- [ ] `data-testid` attributes on the 3 accordion items.

## Out of scope
- No backend / API / store / type changes.
- No changes to the Modules settings page.
- No new dependencies beyond shadcn-svelte accordion (bits-ui already present).
---
