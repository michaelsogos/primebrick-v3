# User Manager UI Fixes Plan — v2

**Date:** 2026-06-21
**Stack:** SvelteKit + Svelte 5 + TypeScript + shadcn-svelte + bits-ui (frontend) + Express + PostgreSQL (backend)
**Scope:** Frontend (`primebrick-fe-v3`) + backend (`primebrick-be-v3`) — section 1 (fix existing check-username endpoint + DAL cleanup), section 6 (metadata-driven tooltips: extend backend metadata + frontend MetaColumn type + i18n keys).
**Previous session:** `user-manager-ui-fixes-plan.md` (v1) — already implemented.

### User decisions (confirmed this session)

| Decision | Choice |
|---|---|
| MultiSelect clear-all X button placement (section 9) | **Next to chevron (bottom-right)** — X appears left of the chevron, only when values selected |
| Username async validation backend endpoint (section 1) | **Fix the existing endpoint** — `GET /api/v1/auth/users/check-username` already exists in `primebrick-be-v3`; make `idp_org` required and replace raw-SQL `getByUsernameAndOrg` with `listUsers` + filter DSL |
| Roles required scope (section 8) | **Both CREATE and EDIT** — `roles.min(1)` on both pages |

---

## Translation policy (applies to ALL sections)

Every translation change in this plan MUST be applied to **ALL 6 language files** in `primebrick-fe-v3/src/lib/i18n/messages/`:

| File | Language |
|---|---|
| `en-GB.json` | British English (default; also serves `en-US`) |
| `it-IT.json` | Italian |
| `fr-FR.json` | French |
| `es-ES.json` | Spanish |
| `de-DE.json` | German |
| `pt-PT.json` | Portuguese |

**Rule:** Whenever a section says "add key X" or "change key X", apply it to all 6 files with the appropriate localized value.

---

## Empirical evidence summary (gathered this session)

| Fact | Source |
|---|---|
| `AppSidebar.svelte` = 591 lines | `src/lib/components/AppSidebar.svelte` |
| ONLINE/health badge at lines 543–573 (Tooltip.Trigger, NOT clickable) | AppSidebar.svelte |
| Version badge at lines 575–587 (clickable button → `openSheet('shell.versions', ...)`) | AppSidebar.svelte |
| `VersionsPanel.svelte` = 100 lines, close button in `headerActions` snippet (top-right X) | `src/lib/shell/sheets/panels/VersionsPanel.svelte` |
| AppTopbar uses `shadow-md` (no `border-b`) at line 119 | `src/lib/components/AppTopbar.svelte` |
| Profile menu "Notifiche" item at lines 519–522 (disabled `DropdownMenu.Item` with `Bell`) | AppSidebar.svelte |
| Tooltip.Content wraps bits-ui, supports HTML children | `src/lib/components/ui/tooltip/tooltip-content.svelte` |
| `FormLabelWithHelp.svelte` uses `HelpCircle` icon, plain text tooltip | `src/lib/components/forms/FormLabelWithHelp.svelte` |
| CREATE page checkboxes: horizontal `flex items-center space-x-2` (checkbox first) | `users/create/+page.svelte` lines 468–521 |
| PROFILE page checkboxes: vertical `space-y-2` (label first, checkbox below, disabled) | `profile/+page.svelte` lines 620–673 |
| Org dropdown in CREATE: HARDCODED `[{ value: 'acme', label: 'Acme', idp_name: 'acme' }]` | `users/create/+page.svelte` line 426 |
| `/api/v1/system/organizations/active` endpoint exists (used in AppSidebar line 56) | AppSidebar.svelte |
| Username field: NO async validation, only Zod (min 3, max 255, alphanumeric) | `users/create/+page.svelte` lines 111–114 |
| Org create `idp_name`: uses `AsyncValidatedInput` + `checkIdpNameAvailability`, endpoint hardcoded | `organizations/create/+page.svelte` lines 227–259 |
| `AsyncValidatedInput` component is generic: `validateFn: (value: string) => Promise<ValidationResult>` | `src/lib/components/ui/input/async-validated-input.svelte` |
| Email validation uses `validation.invalidUrl` key (WRONG — should be email-specific) | `users/create/+page.svelte` line 124 |
| No `invalidEmail` i18n key exists; need to create one | all 6 i18n files `validation` section |
| Roles field: `MultiSelect` component, NOT required (`z.array(z.string()).default([])`), no clear-all button, no `aria-invalid` support | `users/create/+page.svelte` line 128; `multi-select.svelte` |
| `EntityMetadata` has `formDescription` (i18n key) but NO `required` or validation config — being replaced by unified `tooltip` field | `src/lib/composables/useEntityMetadata.svelte.ts`; `src/lib/entity-list/types.ts` |
| Lucide import style: `import X from '@lucide/svelte/icons/x'` (kebab-case) | project-wide |
| All 6 requested lucide icons exist: `badge-info`, `badge-alert`, `badge-x`, `badge-question-mark`, `lightbulb`, `badge-check` | verified on lucide.dev |
| Project has full semaphoric color system: `text-info`, `text-warning`, `text-success`, `text-critical`, `text-destructive` defined in `src/app.css` `@theme` block via CSS variables (`--info`, `--warning`, `--success`, `--critical`, `--destructive`) | `src/app.css` lines 24–46, 102–226; used in `AppTopbar.impactBadgeClass()`, `dialog-bordered.svelte`, `TableRow.svelte`, `BulkActionsToolbar.svelte` |

---

## 1. Backend: fix existing username check-availability endpoint (use DAL primitives, no new methods)

### Empirical finding: the endpoint ALREADY EXISTS

**File:** `src/modules/auth/router.ts` lines 941–997

There is already a `GET /api/v1/auth/users/check-username` endpoint that:
- Accepts `username` and `idp_org` query params
- Falls back to `process.env.CASDOOR_ORGANIZATION || "acme"` if `idp_org` is not provided
- Calls `getDal().getByUsernameAndOrg(username, org)` to check local DB
- ALSO checks Casdoor if the user is not found locally (bonus — catches users synced from Casdoor but not yet in local DB)
- Returns `{ available: boolean, username, idp_org, existing_uuid? }` or `{ available: false, exists_in_casdoor: true }`

**We do NOT need to create a new endpoint.** We need to FIX the existing one.

### Problems with the current implementation

1. **`idp_org` is optional** (falls back to env var) — per user decision, it must be REQUIRED. Username uniqueness is scoped per-org.
2. **Uses `getByUsernameAndOrg`** (DAL line 166) — this is a raw SQL method (`this.pool.query`) that bypasses the DAL's query DSL. This is the spaghetti pattern to avoid. It should use the existing `listUsers` method with the filter DSL instead.
3. **`getByUsernameAndOrg` is raw SQL** — it should be removed and replaced with a call to `listUsers` using `Filter.fieldValue` via the existing `translateFilterConditions` pipeline.

### Changes

#### 1a. DAL: add `idp_username` and `idp_org` to allowed filter fields

**File:** `src/modules/auth/user-profiles-dal.ts` line 329

**BEFORE:**
```typescript
const allowedFields = new Set(["display_name", "email", "idp_code", "is_active", "is_admin", "is_verified"]);
```

**AFTER:**
```typescript
const allowedFields = new Set(["display_name", "email", "idp_code", "idp_username", "idp_org", "is_active", "is_admin", "is_verified"]);
```

This is a one-line change. It allows `listUsers` to accept filters on `idp_username` and `idp_org` via the existing `translateFilterConditions` → `Filter.fieldValue` → `repo.findByPage` pipeline. No new DAL methods.

#### 1b. DAL: remove `getByUsernameAndOrg` (raw SQL spaghetti)

**File:** `src/modules/auth/user-profiles-dal.ts` lines 166–173

Remove the entire method:
```typescript
// DELETE THIS — raw SQL bypass of the DAL query DSL:
async getByUsernameAndOrg(username: string, idpOrg: string): Promise<UserProfileDetailDto | null> {
  const result = await this.pool.query(
    `SELECT * FROM public.user_profiles WHERE idp_username = $1 AND idp_org = $2 AND deleted_at IS NULL LIMIT 1`,
    [username, idpOrg]
  );
  if (result.rows.length === 0) return null;
  return this.toDto(result.rows[0]);
}
```

**Safety check:** `getByUsernameAndOrg` is only called from one place — `router.ts` line 964 (the check-username endpoint). After fixing that endpoint (section 1c below), this method has zero callers and can be safely deleted.

#### 1c. Router: fix the existing check-username endpoint

**File:** `src/modules/auth/router.ts` lines 941–997

**BEFORE:**
```typescript
  // GET /api/v1/auth/users/check-username - Check username availability
  router.get(
    "/api/v1/auth/users/check-username",
    rbacHandler([Permission.USERS_READ_ALL]),
    asyncHandler(async (req, res) => {
      const { username, idp_org } = req.query;

      // Validate required parameters
      if (!username) {
        res.status(400).json({
          type: "/errors/bad-request",
          title: "Missing required parameter",
          status: 400,
          detail: "username parameter is required",
          internal_code: "MISSING_PARAMETER",
          severity: "LOW",
        });
        return;
      }

      const org = (idp_org as string) || process.env.CASDOOR_ORGANIZATION || "acme";

      // Check if user exists in local DB by username + org combination
      const existing = await getDal().getByUsernameAndOrg(username as string, org);

      if (existing) {
        res.json({
          available: false,
          username,
          idp_org: org,
          existing_uuid: existing.uuid,
        });
      } else {
        // Also check Casdoor if client available
        const cdClient = await getCasdoorClient();
        if (cdClient) {
          // Casdoor API uses {org}/{username} format for query
          const casdoorQueryId = `${org}/${username}`;
          const casdoorUser = await cdClient.getUser(casdoorQueryId);
          if (casdoorUser) {
            res.json({
              available: false,
              username,
              idp_org: org,
              exists_in_casdoor: true,
            });
            return;
          }
        }
        res.json({
          available: true,
          username,
          idp_org: org,
        });
      }
    })
  );
```

**AFTER:**
```typescript
  // GET /api/v1/auth/users/check-username - Check username availability (org-scoped)
  router.get(
    "/api/v1/auth/users/check-username",
    rbacHandler([Permission.USERS_READ_ALL]),
    asyncHandler(async (req, res) => {
      const { username, idp_org } = req.query;

      // Both parameters are REQUIRED — username uniqueness is scoped per-org
      // (two users with the same username can exist in different orgs, matching Casdoor's idp_owner/idp_name model)
      if (!username || !idp_org) {
        res.status(400).json({
          type: "/errors/bad-request",
          title: "Missing required parameters",
          status: 400,
          detail: "Both username and idp_org are required",
          internal_code: "MISSING_PARAMETERS",
          severity: "LOW",
        });
        return;
      }

      // Check if user exists in local DB using the existing listUsers + filter DSL (no custom DAL method)
      const result = await getDal().listUsers({
        filters: [
          { field: "idp_username", op: "=", value: username as string },
          { field: "idp_org", op: "=", value: idp_org as string },
        ],
        connector: "AND",
        page: 1,
        page_size: 1,
        deleted_records: "EXCLUDED",
      });

      if (result.rows.length > 0) {
        res.json({
          available: false,
          username: username as string,
          idp_org: idp_org as string,
          existing_uuid: result.rows[0].uuid,
        });
      } else {
        // Also check Casdoor if client available (catches users synced from Casdoor but not yet in local DB)
        const cdClient = await getCasdoorClient();
        if (cdClient) {
          const casdoorQueryId = `${idp_org}/${username}`;
          const casdoorUser = await cdClient.getUser(casdoorQueryId);
          if (casdoorUser) {
            res.json({
              available: false,
              username: username as string,
              idp_org: idp_org as string,
              exists_in_casdoor: true,
            });
            return;
          }
        }
        res.json({
          available: true,
          username: username as string,
          idp_org: idp_org as string,
        });
      }
    })
  );
```

**Key changes:**
1. `idp_org` is now **required** (removed the `process.env.CASDOOR_ORGANIZATION || "acme"` fallback). Missing either param → 400 error.
2. Replaced `getDal().getByUsernameAndOrg(username, org)` with `getDal().listUsers({ filters: [...], page: 1, page_size: 1, deleted_records: "EXCLUDED" })` — uses the existing `listUsers` method with the filter DSL (`Filter.fieldValue` via `translateFilterConditions`). No custom DAL method, no raw SQL.
3. The `deleted_records: "EXCLUDED"` filter ensures soft-deleted users are not counted as "taken" (same behavior as the old raw SQL `deleted_at IS NULL`).
4. The Casdoor fallback check is preserved — it catches users that exist in Casdoor but haven't been synced to the local DB yet.
5. The response shape is unchanged: `{ available, username, idp_org, existing_uuid? }` or `{ available: false, exists_in_casdoor: true }`.

**Notes:**
- Permission: `Permission.USERS_READ_ALL` (unchanged).
- The endpoint path stays `/api/v1/auth/users/check-username` (unchanged) — the frontend already knows this path or will be updated to use it (see section 11).
- The `listUsers` method with `page_size: 1` is efficient — it stops after finding the first match. The `translateFilterConditions` pipeline translates the filter objects into `Filter.fieldValue(field(UserProfileEntity, "idp_username"), "=", username)` and `Filter.fieldValue(field(UserProfileEntity, "idp_org"), "=", idp_org)`, combined with AND. The `deleted_records: "EXCLUDED"` adds a `deleted_at IS NULL` filter. All via the existing DAL primitive `repo.findByPage`.

**Verification (backend):**
- `pnpm run build` succeeds.
- `GET /api/v1/auth/users/check-username?username=admin&idp_org=acme` → `{ available: false, ... }` (if admin exists in acme org).
- `GET /api/v1/auth/users/check-username?username=admin&idp_org=other-org` → `{ available: true, ... }` (if admin does NOT exist in other-org, even if it exists in acme — proves org-scoped check).
- `GET /api/v1/auth/users/check-username?username=nonexistentuser123&idp_org=acme` → `{ available: true, ... }`.
- `GET /api/v1/auth/users/check-username?username=admin` (missing idp_org) → 400 error.
- `GET /api/v1/auth/users/check-username` (no params) → 400 error.
- Verify `getByUsernameAndOrg` is no longer referenced anywhere in the codebase after removal.

## 2. Custom tooltip component with TITLE and PRIORITY/SEVERITY

### Goal
Create a customized version of the tooltip that accepts:
- `title?: string` — optional title rendered with the icon
- `priority?: TooltipPriority` — determines icon + text color
- `children: Snippet` — the content (can be complex HTML)

### Priority mapping

| Priority | Lucide icon | Import path | Text color class |
|---|---|---|---|
| `INFORMATION` | `badgeInfo` | `@lucide/svelte/icons/badge-info` | `text-info` |
| `WARNING` | `badgeAlert` | `@lucide/svelte/icons/badge-alert` | `text-warning` |
| `ERROR` | `badgeX` | `@lucide/svelte/icons/badge-x` | `text-destructive` |
| `QUESTION` | `badgeQuestionMark` | `@lucide/svelte/icons/badge-question-mark` | `text-info` |
| `HINT` | `lightbulb` | `@lucide/svelte/icons/lightbulb` | `text-warning` |
| `SUCCESS` | `badgeCheck` | `@lucide/svelte/icons/badge-check` | `text-success` |

### Empirical evidence: project semaphoric color system (verified)

The project defines a complete semaphoric color system in `src/app.css` with CSS variables mapped to Tailwind v4 theme colors. **No hardcoded Tailwind colors (`text-blue-600` etc.) are needed** — the project's own classes are used.

**CSS variables** (`src/app.css` lines 102–165, light mode; 167–226, dark mode):
```css
:root {
  --destructive: 0 84.2% 60.2%;
  --critical: 0 86% 57%;
  --success: 142.1 76.2% 36.3%;
  --warning: 38 92% 50%;
  --info: 199 89% 48%;
}
.dark {
  --destructive: 0 62.8% 30.6%;
  --critical: 0 64% 38%;
  --success: 142.1 70.6% 45.3%;
  --warning: 47.9 95.8% 53.1%;
  --info: 199 89% 60%;
}
```

**Tailwind theme mapping** (`src/app.css` lines 24–46, `@theme` block):
```css
@theme {
  --color-destructive: hsl(var(--destructive));
  --color-critical: hsl(var(--critical));
  --color-success: hsl(var(--success));
  --color-warning: hsl(var(--warning));
  --color-info: hsl(var(--info));
}
```

This means the Tailwind utility classes `text-info`, `text-warning`, `text-success`, `text-critical`, `text-destructive` (and their `bg-*`, `border-*` variants) are all available project-wide. They adapt automatically to light/dark mode via the CSS variables.

**Existing usage examples in the codebase:**
- `AppTopbar.svelte` `impactBadgeClass()`: `bg-critical text-critical-foreground`, `bg-destructive text-destructive-foreground`, `bg-warning text-warning-foreground`, `bg-info text-info-foreground`
- `dialog-bordered.svelte` `ColorVariant`: `border-t-info`, `border-t-warning`, `border-t-success`, `border-t-destructive`
- `TableRow.svelte` dropdown items: `text-warning` (restore), `text-destructive` (delete)
- `BulkActionsToolbar.svelte`: `bg-warning/10 text-warning`, `bg-destructive/10 text-destructive`
- `AppServerBanner.svelte`: `border-destructive/25 bg-destructive/10 text-destructive`, `border-warning/30 bg-warning/10`

**Conclusion:** Use `text-info`, `text-warning`, `text-success`, `text-destructive` directly — they are the project standard. No fallbacks needed.

### New file: `src/lib/components/ui/tooltip/priority-tooltip-content.svelte`

This is a new Content variant that renders the priority icon + optional title + content. It wraps the existing bits-ui `TooltipPrimitiveContent`.

```svelte
<script lang="ts">
  import { Content as TooltipPrimitiveContent } from '$lib/vendor/bits-ui-tooltip-exports';
  import type { ContentProps } from '$lib/vendor/bits-ui-tooltip-exports';
  import { cn } from '$lib/utils.js';
  import type { Snippet } from 'svelte';
  import BadgeInfo from '@lucide/svelte/icons/badge-info';
  import BadgeAlert from '@lucide/svelte/icons/badge-alert';
  import BadgeX from '@lucide/svelte/icons/badge-x';
  import BadgeQuestionMark from '@lucide/svelte/icons/badge-question-mark';
  import Lightbulb from '@lucide/svelte/icons/lightbulb';
  import BadgeCheck from '@lucide/svelte/icons/badge-check';

  export type TooltipPriority =
    | 'INFORMATION'
    | 'WARNING'
    | 'ERROR'
    | 'QUESTION'
    | 'HINT'
    | 'SUCCESS';

  type Props = ContentProps & {
    priority?: TooltipPriority;
    title?: string;
    children: Snippet;
  };

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 4,
    priority = 'INFORMATION',
    title,
    children,
    ...restProps
  }: Props = $props();

  const iconMap = { INFORMATION: BadgeInfo, WARNING: BadgeAlert, ERROR: BadgeX, QUESTION: BadgeQuestionMark, HINT: Lightbulb, SUCCESS: BadgeCheck };
  // Project semaphoric colors — defined in src/app.css @theme block (text-info, text-warning, text-success, text-destructive)
  const colorMap = {
    INFORMATION: 'text-info',
    WARNING: 'text-warning',
    ERROR: 'text-destructive',
    QUESTION: 'text-info',
    HINT: 'text-warning',
    SUCCESS: 'text-success'
  };

  const Icon = $derived(iconMap[priority]);
  const colorClass = $derived(colorMap[priority]);
</script>

<TooltipPrimitiveContent
  bind:ref
  {sideOffset}
  class={cn(
    'bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-[100] overflow-hidden rounded-md border border-border/60 px-3 py-2 text-xs font-medium shadow-md max-w-xs',
    className
  )}
  {...restProps}
>
  <div class="flex items-start gap-2">
    <div class={cn('shrink-0', colorClass)}>
      <Icon class="size-4" />
    </div>
    <div class="min-w-0 flex-1">
      {#if title}
        <div class={cn('mb-1 font-semibold', colorClass)}>{title}</div>
        <div class="text-background/70 text-xs font-normal">
          {@render children()}
        </div>
      {:else}
        <div class="text-background/90 text-xs font-normal">
          {@render children()}
        </div>
      {/if}
    </div>
  </div>
</TooltipPrimitiveContent>
```

**Anatomy when `title` is provided:**
```
[ICON] [TITLE — same color as icon]
[CONTENT — text-muted-foreground (here text-background/70 on dark bg)]
```

**Anatomy when `title` is NOT provided:**
```
[ICON] [CONTENT]
```

### Export from tooltip index

**File:** `src/lib/components/ui/tooltip/index.ts`

**AFTER (add to existing exports):**
```typescript
import PriorityTooltipContent from './priority-tooltip-content.svelte';
export { PriorityTooltipContent };
export type { TooltipPriority } from './priority-tooltip-content.svelte';
```

### New component: `src/lib/components/forms/FormLabelWithPriorityHelp.svelte`

A priority-aware version of `FormLabelWithHelp` that uses `PriorityTooltipContent`:

```svelte
<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { PriorityTooltipContent, type TooltipPriority } from '$lib/components/ui/tooltip';
  import HelpCircle from '@lucide/svelte/icons/help-circle';

  let {
    text,
    priority = 'INFORMATION',
    title
  }: { text: string; priority?: TooltipPriority; title?: string } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <button type="button" class="inline-flex" {...props} aria-label="Help">
        <HelpCircle class="size-3.5 text-muted-foreground" />
      </button>
    {/snippet}
  </Tooltip.Trigger>
  <PriorityTooltipContent {priority} {title}>
    {text}
  </PriorityTooltipContent>
</Tooltip.Root>
```

**Note:** The trigger icon stays `HelpCircle` (muted) — the priority icon appears INSIDE the tooltip content, as the first element. This matches the user's spec: "ICON always as first element of the tooltip".

### Verification
- Create a temporary test page or use an existing form field.
- Pass `priority="WARNING"` and `title="Test"` → tooltip shows badgeAlert icon (yellow), "Test" title (yellow), then content in muted text.
- Test all 6 priorities.
- Test without `title` → icon + content only.

---

## 3. Email validation error: `invalidUrl` → email-specific message

### Current state
- CREATE + EDIT pages: `email: z.string().email({ message: 'validation.invalidUrl' })` — uses the URL validation key for an email field (WRONG).
- PROFILE page: `email: z.string().email("Invalid email address")` — hardcoded English string (also wrong, not translated).
- No `validation.invalidEmail` key exists in any i18n file.

### Change

#### 3a. New i18n key `validation.invalidEmail` — ALL 6 files

| File | Value |
|---|---|
| `en-GB.json` | `"Invalid email format"` |
| `it-IT.json` | `"Formato email non valido"` |
| `fr-FR.json` | `"Format d'e-mail non valide"` |
| `es-ES.json` | `"Formato de email no válido"` |
| `de-DE.json` | `"Ungültiges E-Mail-Format"` |
| `pt-PT.json` | `"Formato de email inválido"` |

#### 3b. Update Zod schemas

**CREATE page** (`users/create/+page.svelte` line 124):
```typescript
// BEFORE
email: z.string()
  .email({ message: 'validation.invalidUrl' })
  .max(320, { message: 'validation.tooLong' })
  .optional()
  .or(z.literal('')),
// AFTER
email: z.string()
  .email({ message: 'validation.invalidEmail' })
  .max(320, { message: 'validation.tooLong' })
  .optional()
  .or(z.literal('')),
```

**EDIT page** (`users/[uuid]/+page.svelte` line 80):
```typescript
// BEFORE
email: z.string()
  .email({ message: 'validation.invalidUrl' })
  .max(320, { message: 'validation.tooLong' })
  .optional()
  .or(z.literal('')),
// AFTER
email: z.string()
  .email({ message: 'validation.invalidEmail' })
  .max(320, { message: 'validation.tooLong' })
  .optional()
  .or(z.literal('')),
```

**PROFILE page** (`profile/+page.svelte` line 47):
```typescript
// BEFORE
email: z.string().email("Invalid email address"),
// AFTER
email: z.string().email({ message: 'validation.invalidEmail' }),
```

### Verification
- Type an invalid email in CREATE/EDIT/PROFILE → error shows "Formato email non valido" (IT) / "Invalid email format" (EN), NOT "Formato URL non valido".
- Test in all 6 languages.

---

## 4. Remove "Notifiche" menu item from profile menu

### Change — AppSidebar.svelte

**BEFORE** (lines 517–523):
```svelte
<DropdownMenu.Group>
  <DropdownMenu.Item closeOnSelect={true} onSelect={() => { void goto('/system/settings/profile'); }}>
    <Settings class="size-4 shrink-0" />
    <span>{$t('shell.userMenu.itemSettings')}</span>
  </DropdownMenu.Item>
  <DropdownMenu.Item disabled>
    <Bell class="size-4 shrink-0" />
    <span>{$t('shell.userMenu.itemNotifications')}</span>
  </DropdownMenu.Item>
</DropdownMenu.Group>
```

**AFTER:**
```svelte
<DropdownMenu.Group>
  <DropdownMenu.Item closeOnSelect={true} onSelect={() => { void goto('/system/settings/profile'); }}>
    <Settings class="size-4 shrink-0" />
    <span>{$t('shell.userMenu.itemSettings')}</span>
  </DropdownMenu.Item>
</DropdownMenu.Group>
```

**Cleanup:** Remove the `Bell` import from `@lucide/svelte/icons/bell` if it's no longer used elsewhere in AppSidebar.svelte. (Check: `Bell` is only used for this menu item — safe to remove.)

**i18n:** The key `shell.userMenu.itemNotifications` can remain in the files (harmless) or be removed. Recommendation: leave it (no harm, avoids breaking any other reference).

### Verification
- Open the profile menu in the sidebar.
- Only "Settings" and "Sign out" items appear. No "Notifiche" / "Notifications".

---

## 5. Remove shadow on app top bar bottom, add border instead

### Change — AppTopbar.svelte

**BEFORE** (line 119):
```svelte
<header
  class="sticky top-0 z-30 min-w-0 w-full overflow-visible bg-background text-foreground shadow-md dark:bg-muted/25 dark:backdrop-blur-xs"
>
```

**AFTER:**
```svelte
<header
  class="sticky top-0 z-30 min-w-0 w-full overflow-visible border-b border-border bg-background text-foreground dark:bg-muted/25 dark:backdrop-blur-xs"
>
```

**Change:** `shadow-md` → `border-b border-border`.

### Verification
- Visual: the top bar has a thin bottom border line instead of a drop shadow.
- Works in light and dark mode (`border-border` adapts via CSS variables).

---

## 6. Metadata-driven priority tooltips for is_admin, is_verified, is_email_verified

### Goal
Replace `FormLabelWithHelp` with `FormLabelWithPriorityHelp` for these three fields, with priority, title, and help text **all driven by backend metadata** — not hardcoded in the form pages.

### Empirical findings (metadata system)

| Fact | Source |
|---|---|
| Backend metadata is **hardcoded** in router endpoints (not auto-generated from entity decorators) | `router.ts` line 1322–1403 |
| 3 columns already have `formDescription` and `listDescription`: `is_admin`, `is_verified`, `email_verified` — being replaced by unified `tooltip` field | `router.ts` lines 1343–1345 |
| `formDescription` references `entities.userProfile.hints.*` i18n keys that **DO NOT EXIST** in the frontend i18n files | `router.ts` line 1343 vs grep of `en-GB.json` (0 matches for `entities.userProfile.hints`) |
| Frontend `MetaColumn` type already has `formDescription?: string` and `listDescription?: string` — being replaced by unified `tooltip` field | `src/lib/entity-list/types.ts` lines 46–48 |
| `formDescription` is **NEVER consumed** in any form page (defined but unused) | grep: 0 matches in `src/routes/` |
| `listDescription` IS consumed in `TableHeader.svelte` and `CardField.svelte` | lines 82–84 and 58–60 |
| Form pages hardcode all labels/hints using `shell.settings.users.create.*Hint` keys | CREATE/EDIT/PROFILE pages |
| `/api/v1/auth/me/meta` (PROFILE page) has **NO columns array** — only `auditingColumns` | `router.ts` lines 846–873 |
| CREATE page declares `meta` but **NEVER LOADS** it (no `loadMetadata()` call) | `users/create/+page.svelte` lines 230–231 |
| EDIT page loads metadata via `loadMeta()` in `onMount` | `users/[uuid]/+page.svelte` lines 244–255, 46 |

### 6a. Backend: extend metadata with unified `tooltip` fields

#### File: `primebrick-be-v3/src/modules/auth/router.ts`

**Change 1 — `/api/v1/entities/user_profiles/meta` (line 1343–1345):**

**BEFORE:**
```typescript
{ key: "is_admin", labelKey: "entities.userProfile.fields.is_admin", type: "boolean", sortable: true, defaultVisible: true, filterable: true, formDescription: "entities.userProfile.hints.is_admin", listDescription: "entities.userProfile.hints.is_admin" },
{ key: "is_verified", labelKey: "entities.userProfile.fields.is_verified", type: "boolean", sortable: true, defaultVisible: false, filterable: true, formDescription: "entities.userProfile.hints.is_verified", listDescription: "entities.userProfile.hints.is_verified" },
{ key: "email_verified", labelKey: "entities.userProfile.fields.email_verified", type: "boolean", sortable: true, defaultVisible: true, filterable: true, formDescription: "entities.userProfile.hints.email_verified", listDescription: "entities.userProfile.hints.email_verified" },
```

**AFTER:**
```typescript
{ key: "is_admin", labelKey: "entities.userProfile.fields.is_admin", type: "boolean", sortable: true, defaultVisible: true, filterable: true, tooltip: "entities.userProfile.hints.is_admin", tooltipPriority: "WARNING", tooltipTitle: "entities.userProfile.hints.is_admin_title", showFormTooltip: true, showListTooltip: true },
{ key: "is_verified", labelKey: "entities.userProfile.fields.is_verified", type: "boolean", sortable: true, defaultVisible: false, filterable: true, tooltip: "entities.userProfile.hints.is_verified", tooltipPriority: "HINT", tooltipTitle: "entities.userProfile.hints.is_verified_title", showFormTooltip: true, showListTooltip: true },
{ key: "email_verified", labelKey: "entities.userProfile.fields.email_verified", type: "boolean", sortable: true, defaultVisible: true, filterable: true, tooltip: "entities.userProfile.hints.email_verified", tooltipPriority: "HINT", tooltipTitle: "entities.userProfile.hints.email_verified_title", showFormTooltip: true, showListTooltip: true },
```

**New fields added to each column:**
- `tooltip: string` — i18n key for tooltip content. Primary field: if set, a tooltip renders even without priority/title (plain text, no icon).
- `tooltipPriority: "WARNING" | "HINT"` — priority/severity for the tooltip icon + title color. Optional/advanced.
- `tooltipTitle: string` — i18n key for the tooltip title (shown in priority color). Optional/advanced.
- `showFormTooltip: boolean` — show tooltip in form context. Default: true if `tooltip` is set.
- `showListTooltip: boolean` — show tooltip in list/table/card context. Default: true if `tooltip` is set.

**Change 2 — `/api/v1/auth/me/meta` (line 846–873): add `columns` array**

The PROFILE page uses `/api/v1/auth/me/meta` which currently only returns `auditingColumns`. It needs the `columns` array (at minimum the 3 hint-bearing columns) so the PROFILE page can also read `tooltip`/`tooltipPriority`/`tooltipTitle` from metadata.

**BEFORE:**
```typescript
const meta = {
  entity: "user_profiles",
  titleKey: "entities.userProfile.title",
  updatePageTitle: "${display_name}",
  uid: "uuid",
  list: {
    auditingColumns: [ ... ]
  }
};
```

**AFTER:**
```typescript
const meta = {
  entity: "user_profiles",
  titleKey: "entities.userProfile.title",
  updatePageTitle: "${display_name}",
  uid: "uuid",
  list: {
    columns: [
      { key: "is_admin", labelKey: "entities.userProfile.fields.is_admin", type: "boolean", tooltip: "entities.userProfile.hints.is_admin", tooltipPriority: "WARNING", tooltipTitle: "entities.userProfile.hints.is_admin_title", showFormTooltip: true },
      { key: "is_verified", labelKey: "entities.userProfile.fields.is_verified", type: "boolean", tooltip: "entities.userProfile.hints.is_verified", tooltipPriority: "HINT", tooltipTitle: "entities.userProfile.hints.is_verified_title", showFormTooltip: true },
      { key: "email_verified", labelKey: "entities.userProfile.fields.email_verified", type: "boolean", tooltip: "entities.userProfile.hints.email_verified", tooltipPriority: "HINT", tooltipTitle: "entities.userProfile.hints.email_verified_title", showFormTooltip: true },
    ],
    auditingColumns: [ ... ] // unchanged
  }
};
```

**Note:** Only the 3 hint-bearing columns are added to `/api/v1/auth/me/meta`. The full column list is not needed for the PROFILE page — it only needs the columns that have `tooltip` for rendering tooltips. The auditing columns are already present and unchanged.

#### File: `primebrick-be-v3/src/openapi/openapi.ts`

Update the OpenAPI schema to document the new fields. Find the column schema definition (around line 590) and add:

```typescript
tooltip: { type: "string", description: "i18n key for tooltip content shown in form and/or list contexts" },
tooltipPriority: { type: "string", enum: ["INFORMATION", "WARNING", "ERROR", "QUESTION", "HINT", "SUCCESS"], description: "Priority/severity for tooltip icon and title color" },
tooltipTitle: { type: "string", description: "i18n key for tooltip title (shown in priority color)" },
showFormTooltip: { type: "boolean", description: "Show tooltip in form context (default: true if tooltip is set)" },
showListTooltip: { type: "boolean", description: "Show tooltip in list/table/card context (default: true if tooltip is set)" },
```

### 6b. Frontend: extend `MetaColumn` type

#### File: `primebrick-fe-v3/src/lib/entity-list/types.ts`

**BEFORE (lines 21–49):**
```typescript
export type MetaColumn = {
  key: string;
  labelKey: string;
  type: 'text' | 'badge' | 'date' | 'datetime' | 'color' | string;
  // ... other fields ...
  /** i18n key shown next to form labels as a help tooltip. */
  formDescription?: string;
  /** i18n key shown next to table/card headers as a help tooltip. */
  listDescription?: string;
};
```

**AFTER:**
```typescript
import type { TooltipPriority } from '$lib/components/ui/tooltip/priority-tooltip-content.svelte';

export type MetaColumn = {
  key: string;
  labelKey: string;
  type: 'text' | 'badge' | 'date' | 'datetime' | 'color' | string;
  // ... other fields ...
  /** i18n key for tooltip content. If set, a tooltip renders in form and/or list contexts (per show flags). Works as plain tooltip even without priority/title. */
  tooltip?: string;
  /** Priority/severity for the tooltip icon + title color. Optional/advanced. */
  tooltipPriority?: TooltipPriority;
  /** i18n key for tooltip title (shown in priority color). Optional/advanced. */
  tooltipTitle?: string;
  /** Show tooltip in form context. Default: true if `tooltip` is set. */
  showFormTooltip?: boolean;
  /** Show tooltip in list/table/card context. Default: true if `tooltip` is set. */
  showListTooltip?: boolean;
};
```

### 6c. Frontend: create `entities.userProfile.hints.*` i18n keys — ALL 6 files

The backend metadata references `entities.userProfile.hints.is_admin`, `entities.userProfile.hints.is_verified`, `entities.userProfile.hints.email_verified`, plus the new `*_title` keys. These **do not exist** in any frontend i18n file. They must be created.

Add a `hints` section inside `entities.userProfile` (after the existing `fields` section):

#### `entities.userProfile.hints.is_admin` (help text, without "WARNING:"/"ATTENZIONE:" prefix)

| File | Value |
|---|---|
| `en-GB.json` | `"The Identity Administrator flag allows the user to access the IDP system to make administrative-level changes, but does not grant administration rights to this application. To grant application administration access, set the application roles."` |
| `it-IT.json` | `"L'amministratore dell'identità consente all'utente di accedere al sistema IDP per poter fare modifiche a livello amministrativo, ma non concede i diritti di amministrazione a questa applicazione; per dare accessi di amministrazione all'applicazione impostare i ruoli applicativi."` |
| `fr-FR.json` | `"L'indicateur d'administrateur d'identité permet à l'utilisateur d'accéder au système IDP pour effectuer des modifications de niveau administratif, mais n'accorde pas de droits d'administration à cette application. Pour accorder des accès d'administration à l'application, définissez les rôles applicatifs."` |
| `es-ES.json` | `"El indicador de administrador de identidad permite al usuario acceder al sistema IDP para realizar cambios de nivel administrativo, pero no otorga derechos de administración a esta aplicación. Para otorgar accesos de administración a la aplicación, establezca los roles aplicativos."` |
| `de-DE.json` | `"Das Kennzeichen des Identitätsadministrators ermöglicht dem Benutzer den Zugriff auf das IDP-System, um Änderungen auf administrativer Ebene vorzunehmen, gewährt jedoch keine Verwaltungsrechte für diese Anwendung. Um Administrationszugriffe auf die Anwendung zu gewähren, legen Sie die Anwendungsrollen fest."` |
| `pt-PT.json` | `"O indicador de administrador de identidade permite que o utilizador aceda ao sistema IDP para fazer alterações de nível administrativo, mas não concede direitos de administração a esta aplicação. Para conceder acessos de administração à aplicação, defina os papéis aplicativos."` |

#### `entities.userProfile.hints.is_admin_title`

| File | Value |
|---|---|
| `en-GB.json` | `"Not an administrative role"` |
| `it-IT.json` | `"Non è un ruolo amministrativo"` |
| `fr-FR.json` | `"Ce n'est pas un rôle administratif"` |
| `es-ES.json` | `"No es un rol administrativo"` |
| `de-DE.json` | `"Keine Administratorrolle"` |
| `pt-PT.json` | `"Não é um papel administrativo"` |

#### `entities.userProfile.hints.is_verified`

| File | Value |
|---|---|
| `en-GB.json` | `"Indicates whether the identity verification process has been successfully completed. It may depend on a KYC process or other type of verification."` |
| `it-IT.json` | `"Indica se il processo di verifica dell'identità è stato completato con successo. Può dipendere da un processo KYC o da altro tipo di verifica."` |
| `fr-FR.json` | `"Indique si le processus de vérification de l'identité a été mené à bien. Il peut dépendre d'un processus KYC ou d'un autre type de vérification."` |
| `es-ES.json` | `"Indica si el proceso de verificación de identidad se ha completado con éxito. Puede depender de un proceso KYC u otro tipo de verificación."` |
| `de-DE.json` | `"Gibt an, ob der Identitätsverifikationsprozess erfolgreich abgeschlossen wurde. Er kann von einem KYC-Prozess oder einer anderen Art der Verifikation abhängen."` |
| `pt-PT.json` | `"Indica se o processo de verificação da identidade foi concluído com sucesso. Pode depender de um processo KYC ou de outro tipo de verificação."` |

#### `entities.userProfile.hints.is_verified_title`

| File | Value |
|---|---|
| `en-GB.json` | `"Identity verification"` |
| `it-IT.json` | `"Verifica dell'identità"` |
| `fr-FR.json` | `"Vérification de l'identité"` |
| `es-ES.json` | `"Verificación de la identidad"` |
| `de-DE.json` | `"Identitätsverifikation"` |
| `pt-PT.json` | `"Verificação da identidade"` |

#### `entities.userProfile.hints.email_verified`

| File | Value |
|---|---|
| `en-GB.json` | `"Indicates whether the email has been verified, typically via a link sent to the email inbox that is presumed to be readable only by the user whose profile we are configuring."` |
| `it-IT.json` | `"Indica se l'email è stata verificata, in genere tramite un link inviato alla casella di posta che si presume leggibile solo dall'utente di cui stiamo configurando il profilo."` |
| `fr-FR.json` | `"Indique si l'e-mail a été vérifié, généralement via un lien envoyé à la boîte de réception qui est censé être lisible uniquement par l'utilisateur dont nous configurons le profil."` |
| `es-ES.json` | `"Indica si el email ha sido verificado, generalmente mediante un enlace enviado a la bandeja de entrada que se supone que solo puede ser leído por el usuario cuyo perfil estamos configurando."` |
| `de-DE.json` | `"Gibt an, ob die E-Mail verifiziert wurde, in der Regel über einen Link, der an den Posteingang gesendet wird, der vermutlich nur vom Benutzer gelesen werden kann, dessen Profil wir konfigurieren."` |
| `pt-PT.json` | `"Indica se o email foi verificado, geralmente através de um link enviado para a caixa de entrada que se presume ser legível apenas pelo utilizador cujo perfil estamos a configurar."` |

#### `entities.userProfile.hints.email_verified_title`

| File | Value |
|---|---|
| `en-GB.json` | `"Email verification"` |
| `it-IT.json` | `"Verifica della email"` |
| `fr-FR.json` | `"Vérification de l'e-mail"` |
| `es-ES.json` | `"Verificación del email"` |
| `de-DE.json` | `"E-Mail-Verifikation"` |
| `pt-PT.json` | `"Verificação do email"` |

**i18n structure** (add inside `entities.userProfile`, after `fields`):
```json
"userProfile": {
  "title": "Users",
  "singular": "User",
  "plural": "Users",
  "fields": { ... },
  "hints": {
    "is_admin": "...",
    "is_admin_title": "...",
    "is_verified": "...",
    "is_verified_title": "...",
    "email_verified": "...",
    "email_verified_title": "..."
  }
}
```

### 6d. Frontend: also update `tooltip` consumers to use priority

#### File: `src/lib/components/entity-list-table/table/TableHeader.svelte` (lines 82–84)

**BEFORE:**
```svelte
{#if col.listDescription}
  <FormLabelWithHelp text={$t(col.listDescription)} />
{/if}
```

**AFTER:**
```svelte
{#if col.tooltip && col.showListTooltip !== false}
  <FormLabelWithPriorityHelp
    text={$t(col.tooltip)}
    priority={col.tooltipPriority}
    title={col.tooltipTitle ? $t(col.tooltipTitle) : undefined}
  />
{/if}
```

Note: `showListTooltip !== false` means it shows by default when `tooltip` is set, unless explicitly set to `false`.

#### File: `src/lib/components/entity-list-table/cards/CardField.svelte` (lines 58–60)

Same change as TableHeader — replace `FormLabelWithHelp` with `FormLabelWithPriorityHelp`, reading `tooltipPriority` and `tooltipTitle` from the column metadata.

**Import change** in both files:
```svelte
// BEFORE
import FormLabelWithHelp from '$lib/components/forms/FormLabelWithHelp.svelte';
// AFTER
import FormLabelWithPriorityHelp from '$lib/components/forms/FormLabelWithPriorityHelp.svelte';
```

### 6e. Frontend: make form pages read from metadata

#### CREATE page (`users/create/+page.svelte`)

**Step 1 — Load metadata (currently NOT loaded):**

Add to script section:
```typescript
import { useEntityMetadata } from '$lib/composables/useEntityMetadata.svelte';

const { meta, loadMetadata } = useEntityMetadata({
  endpoint: '/api/v1/entities/user_profiles/meta',
  entityName: 'user_profiles'
});

onMount(() => {
  loadMetadata();
});
```

**Step 2 — Helper to find column metadata:**
```typescript
function getColMeta(key: string) {
  return $derived(meta?.list?.columns?.find(c => c.key === key));
}
```

**Step 3 — Replace hardcoded tooltips with metadata-driven:**

**BEFORE** (e.g., `is_admin` lines 468–480):
```svelte
<FormField form={superFormObj} name="is_admin">
  <FormControl>
    {#snippet children({ props })}
      <div class="flex items-center space-x-2">
        <Checkbox {...props} bind:checked={$form.is_admin} id="is_admin" />
        <label for="is_admin" class="inline-flex items-center gap-1 text-sm font-medium leading-none ...">
          {$t('shell.settings.users.create.idpAdmin')}
          <FormLabelWithHelp text={$t('shell.settings.users.create.idpAdminHint')} />
        </label>
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

**AFTER:**
```svelte
<FormField form={superFormObj} name="is_admin">
  <FormControl>
    {#snippet children({ props })}
      {@const colMeta = getColMeta('is_admin')}
      <div class="flex items-center space-x-2">
        <Checkbox {...props} bind:checked={$form.is_admin} id="is_admin" />
        <label for="is_admin" class="inline-flex items-center gap-1 text-sm font-medium leading-none ...">
          {$t('shell.settings.users.create.idpAdmin')}
          {#if colMeta?.tooltip && colMeta?.showFormTooltip !== false}
            <FormLabelWithPriorityHelp
              text={$t(colMeta.tooltip)}
              priority={colMeta.tooltipPriority}
              title={colMeta.tooltipTitle ? $t(colMeta.tooltipTitle) : undefined}
            />
          {/if}
        </label>
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

Apply the same pattern to `is_verified` (key `'is_verified'`) and `email_verified` (key `'email_verified'`).

**Key points:**
- The label text (`$t('shell.settings.users.create.idpAdmin')`) stays hardcoded for now — only the tooltip is metadata-driven. Migrating labels to metadata is a separate concern (the `labelKey` field exists but form pages use different i18n keys than the list metadata).
- The `{#if colMeta?.tooltip && colMeta?.showFormTooltip !== false}` guard ensures the tooltip only renders if the metadata provides a `tooltip`. If metadata fails to load, no tooltip appears (graceful degradation).
- The `priority` and `title` come directly from `colMeta.tooltipPriority` and `colMeta.tooltipTitle` — no hardcoding.

#### EDIT page (`users/[uuid]/+page.svelte`)

The EDIT page already loads metadata (`loadMeta()` in `onMount`). Apply the same `getColMeta` + `FormLabelWithPriorityHelp` pattern as the CREATE page.

#### PROFILE page (`profile/+page.svelte`)

The PROFILE page already loads metadata via `useEntityMetadata({ endpoint: '/api/v1/auth/me/meta', ... })`. After section 6a adds the `columns` array to `/api/v1/auth/me/meta`, the PROFILE page can use the same `getColMeta` pattern. See section 7 for the PROFILE page checkbox layout change (which includes this metadata-driven tooltip).

### 6f. Cleanup: remove old hardcoded hint i18n keys (optional)

The old `shell.settings.users.create.idpAdminHint`, `idpVerifiedHint`, `idpEmailVerifiedHint` keys are no longer referenced by the form pages after this change (they now read from `entities.userProfile.hints.*` via metadata). They can be:
- **Option A (recommended):** Leave them in the i18n files as unused keys — harmless, avoids breaking any unknown references.
- **Option B:** Remove them and grep to verify no other references exist.

**Note:** The old `idpAdminHint` text had a "WARNING:"/"ATTENZIONE:" prefix. The new `entities.userProfile.hints.is_admin` text does NOT have the prefix (the prefix is replaced by the `WARNING` priority icon + title). Do NOT copy the old text with the prefix — use the values from the i18n table in section 6c (which are prefix-free).

### Verification
- `pnpm run build` succeeds (backend).
- `pnpm run check` passes (frontend, no type errors).
- Hover the help icon for `is_admin` in CREATE form → tooltip shows badgeAlert (yellow) icon, "Non è un ruolo amministrativo" title (yellow via `text-warning`), then the help text (without "ATTENZIONE:").
- Hover `is_verified` → lightbulb (yellow) icon, "Verifica dell'identità" title, help text.
- Hover `is_email_verified` → lightbulb (yellow) icon, "Verifica della email" title, help text.
- Same tooltips appear in EDIT and PROFILE pages.
- The list table header tooltips for these 3 columns also show the priority icon + title (via `tooltipPriority`/`tooltipTitle`).
- Test in all 6 languages.
- **Metadata failure:** Stop the backend → form pages still render (no tooltip, no crash). The `{#if colMeta?.tooltip && colMeta?.showFormTooltip !== false}` guard handles this.

---

## 7. PROFILE page checkbox layout = CREATE page layout

### Goal
Make the PROFILE page checkbox layout match the CREATE page: `{checkbox} {label} {tooltip}` on ONE row, no wrapping.

### Change — PROFILE page (`profile/+page.svelte`)

**BEFORE** (e.g., `is_admin` lines 620–637):
```svelte
<FormField form={superFormObj} name="is_admin">
  <FormControl>
    {#snippet children({ props })}
      <div class="space-y-2">
        <label for={props.id} class="inline-flex items-center gap-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {$t("shell.settings.profile.idpAdmin")}
          <FormLabelWithHelp text={$t('shell.settings.users.create.idpAdminHint')} />
        </label>
        <div class="mt-2 flex items-center gap-2">
          <Checkbox
            checked={$form.is_admin === true}
            disabled
          />
        </div>
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

**AFTER:**
```svelte
<FormField form={superFormObj} name="is_admin">
  <FormControl>
    {#snippet children({ props })}
      {@const colMeta = getColMeta('is_admin')}
      <div class="flex items-center space-x-2">
        <Checkbox {...props} checked={$form.is_admin === true} disabled id={props.id} />
        <label for={props.id} class="inline-flex items-center gap-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {$t("shell.settings.profile.idpAdmin")}
          {#if colMeta?.tooltip && colMeta?.showFormTooltip !== false}
            <FormLabelWithPriorityHelp
              text={$t(colMeta.tooltip)}
              priority={colMeta.tooltipPriority}
              title={colMeta.tooltipTitle ? $t(colMeta.tooltipTitle) : undefined}
            />
          {/if}
        </label>
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

**Key changes:**
1. `space-y-2` → `flex items-center space-x-2` (horizontal layout)
2. Checkbox moved to FIRST position (before label)
3. Removed the nested `<div class="mt-2 flex items-center gap-2">` wrapper
4. Added `{...props}` to Checkbox (passes formsnap aria-invalid etc.)
5. Added `id={props.id}` to Checkbox for label association
6. Replaced `FormLabelWithHelp` with `FormLabelWithPriorityHelp` reading from metadata (section 6e pattern)
7. The `getColMeta` helper and `useEntityMetadata` are already set up in the PROFILE page (it loads from `/api/v1/auth/me/meta` — section 6a adds the `columns` array to this endpoint)

Apply the same transformation to `is_verified` (lines 639–656) and `email_verified` (lines 658–673) in the PROFILE page.

**Note:** The checkboxes remain `disabled` (readonly) in PROFILE — only the layout changes, not the editability.

### Verification
- Open PROFILE page → `is_admin`, `is_verified`, `email_verified` checkboxes are on the SAME row as their label + tooltip icon.
- Layout matches CREATE page.

---

## 8. RUOLI APPLICATIVI: required from metadata + formsnap/superform validation states

### Current state
- Roles field uses `MultiSelect` component.
- Zod schema: `roles: z.array(z.string()).default([])` — NOT required (empty array allowed).
- `MultiSelect` does NOT accept `aria-invalid` prop, does NOT pass formsnap `props` to the trigger.
- Validation errors are displayed via `TranslatedFormFieldErrors` (works), but the component itself shows no invalid visual state.

### Goal
1. Make `roles` required (at least one role) — config should come from metadata.
2. Verify the `MultiSelect` component handles formsnap/superform validation states (aria-invalid, error styling).

### 8a. Make roles required (BOTH CREATE and EDIT — per user decision)

**Investigation:** The `EntityMetadata` / `MetaColumn` interface has NO `required` field. Adding metadata-driven required-ness is a larger refactor (Phase 2, like section 11).

**Phase 1 (this plan):** Make roles required in the Zod schema (client-side) on BOTH the CREATE and EDIT pages, with a note that this should eventually come from metadata.

**BEFORE** (`users/create/+page.svelte` line 128):
```typescript
roles: z.array(z.string()).default([]),
```

**AFTER:**
```typescript
roles: z.array(z.string()).min(1, { message: 'validation.rolesRequired' }).default([]),
```

**EDIT page** (`users/[uuid]/+page.svelte`): apply the same `.min(1, { message: 'validation.rolesRequired' })` to the roles field in the EDIT Zod schema. Per user decision, roles are required on both pages. Existing users with no roles will fail validation on edit — this is intentional.

#### New i18n key `validation.rolesRequired` — ALL 6 files

| File | Value |
|---|---|
| `en-GB.json` | `"At least one role is required"` |
| `it-IT.json` | `"Almeno un ruolo applicativo è obbligatorio"` |
| `fr-FR.json` | `"Au moins un rôle est requis"` |
| `es-ES.json` | `"Al menos un rol es obligatorio"` |
| `de-DE.json` | `"Mindestens eine Rolle ist erforderlich"` |
| `pt-PT.json` | `"Pelo menos um papel é obrigatório"` |

### 8b. Make MultiSelect handle formsnap validation states

**BEFORE** (`src/lib/components/ui/multi-select/multi-select.svelte` lines 9–18):
```typescript
type Props = {
  value?: string[];
  onChange?: (value: string[]) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  name?: string;
};
```

**AFTER:**
```typescript
type Props = {
  value?: string[];
  onChange?: (value: string[]) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  name?: string;
  'aria-invalid'?: string | boolean;
  'aria-describedby'?: string;
  'aria-required'?: string | boolean;
  'data-fs-error'?: string;
};
```

**BEFORE** (trigger div, lines 75–83):
```svelte
<div
  class={cn(
    "min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
    "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "cursor-pointer flex flex-wrap gap-2 items-center"
  )}
  // ... no aria props
>
```

**AFTER:**
```svelte
<div
  class={cn(
    "min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
    "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "cursor-pointer flex flex-wrap gap-2 items-center",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"
  )}
  aria-invalid={restProps['aria-invalid']}
  aria-describedby={restProps['aria-describedby']}
  aria-required={restProps['aria-required']}
  data-fs-error={restProps['data-fs-error']}
>
```

**Update the pages to pass formsnap props to MultiSelect:**

**BEFORE** (CREATE page lines 400–414):
```svelte
<FormField form={superFormObj} name="roles">
  <FormControl>
    {#snippet children({ props })}
      <div class="space-y-2">
        <FormLabel for={props.id}>{$t('shell.settings.users.create.roles')}</FormLabel>
        <MultiSelect
          bind:value={$form.roles}
          options={availableRoles.length > 0 ? availableRoles : [...]}
          placeholder={$t('shell.settings.users.create.rolesPlaceholder')}
        />
        <TranslatedFormFieldErrors />
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

**AFTER:**
```svelte
<FormField form={superFormObj} name="roles">
  <FormControl>
    {#snippet children({ props })}
      <div class="space-y-2">
        <FormLabel for={props.id}>{$t('shell.settings.users.create.roles')}</FormLabel>
        <MultiSelect
          {...props}
          bind:value={$form.roles}
          options={availableRoles.length > 0 ? availableRoles : [...]}
          placeholder={$t('shell.settings.users.create.rolesPlaceholder')}
        />
        <TranslatedFormFieldErrors />
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

Apply the same `{...props}` addition to the EDIT page roles field.

### Verification
- Submit the CREATE form with no roles selected → validation error "Almeno un ruolo applicativo è obbligatorio" appears, and the MultiSelect border turns destructive (red).
- Select one role → error clears, border returns to normal.

---

## 9. RUOLI APPLICATIVI dropdown: add clear-all (X) button

### Goal
Add an X (clear-all) button to the `MultiSelect` component that clears all selected values at once.

### Placement decision
The user offers two options:
1. X anchored top-right (chevron stays bottom-right) — good when the input grows tall with many tags.
2. X next to the chevron (bottom-right) — simpler, both controls in one place.

**Recommendation:** Option 2 (X next to chevron, bottom-right) is simpler and consistent. The X only appears when there are selected values. The chevron always shows. Both are in the `ml-auto` container at the bottom-right.

**However**, the user's concern is that as tags increase, the input height grows and the chevron stays anchored bottom-right. If we put X next to the chevron, it's also bottom-right — which is fine. The X is only visible when `internalValue.length > 0`.

### Change — `src/lib/components/ui/multi-select/multi-select.svelte`

**BEFORE** (lines 104–110):
```svelte
<div class="ml-auto">
  {#if loading}
    <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
  {:else}
    <ChevronDown class="h-4 w-4 text-muted-foreground" />
  {/if}
</div>
```

**AFTER:**
```svelte
<div class="ml-auto flex items-center gap-1 shrink-0">
  {#if internalValue.length > 0 && !disabled}
    <button
      type="button"
      onclick={(e) => { e.stopPropagation(); handleChange([]); }}
      class="inline-flex items-center justify-center rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      aria-label={$t('common.clearAll')}
      title={$t('common.clearAll')}
    >
      <X class="h-3.5 w-3.5" />
    </button>
  {/if}
  {#if loading}
    <div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
  {:else}
    <ChevronDown class="h-4 w-4 text-muted-foreground" />
  {/if}
</div>
```

**Required additions:**
- Import `X` from `@lucide/svelte/icons/x` (if not already imported — it IS already imported for the per-tag X button, line ~91).
- Import `t` from `$lib/i18n` for the aria-label/title.
- The `common.clearAll` key already exists (confirmed in en-GB.json line 65: `"clearAll": "Clear all filters"`). Verify it's appropriate or add a new `common.clearSelection` key. Recommendation: reuse `common.clearAll` or add `common.clearSelection`:

#### Optional new i18n key `common.clearSelection` — ALL 6 files

| File | Value |
|---|---|
| `en-GB.json` | `"Clear selection"` |
| `it-IT.json` | `"Cancella selezione"` |
| `fr-FR.json` | `"Effacer la sélection"` |
| `es-ES.json` | `"Borrar selección"` |
| `de-DE.json` | `"Auswahl löschen"` |
| `pt-PT.json` | `"Limpar seleção"` |

**Recommendation:** Add `common.clearSelection` (more precise than "Clear all filters" which is filter-context).

### Alternative: X anchored top-right (option 1)

If the user prefers the X at top-right (anchored independently of the chevron), restructure the trigger:

```svelte
<div class="relative w-full">
  {#if internalValue.length > 0 && !disabled}
    <button
      type="button"
      onclick={(e) => { e.stopPropagation(); handleChange([]); }}
      class="absolute right-2 top-2 z-10 inline-flex items-center justify-center rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      aria-label={$t('common.clearSelection')}
    >
      <X class="h-3.5 w-3.5" />
    </button>
  {/if}
  <div class="flex flex-wrap items-center gap-2 pr-8">
    <!-- tags -->
    <div class="ml-auto">
      <!-- chevron / loading -->
    </div>
  </div>
</div>
```

**User decision (confirmed):** Option 2 — X next to chevron, bottom-right. The code block above (Option 2) is the implementation. The alternative (Option 1, top-right) is NOT used.

### Verification
- Select 3+ roles → X button appears next to the chevron.
- Click X → all selected roles are cleared, X disappears.
- Chevron remains visible at all times.
- When input grows tall (many tags), X stays next to chevron at bottom-right (Option 2) or stays at top-right (Option 1).

---

## 10. Organization dropdown: fetch from `/system/organizations/active` with client-side first-page approach

### Current state
- CREATE page (`users/create/+page.svelte` line 426): HARDCODED `[{ value: 'acme', label: 'Acme', idp_name: 'acme' }]`
- EDIT page: org is readonly (no dropdown)
- PROFILE page: org is readonly (no dropdown)

### Endpoint
`GET /api/v1/system/organizations/active` — already used in `AppSidebar.svelte` line 56. Returns:
```typescript
{
  organizations: Array<{
    uuid: string;
    idp_code: string;
    display_name: string;
    avatar: string | null;
  }>;
}
```

### Change — CREATE page

**BEFORE** (lines 419–433):
```svelte
<FormField form={superFormObj} name="idp_org">
  <FormControl>
    {#snippet children({ props })}
      <div class="space-y-2">
        <FormLabel for={props.id}>{$t('shell.settings.users.create.idpOrg')}</FormLabel>
        <Select
          bind:value={$form.idp_org}
          options={[{ value: 'acme', label: 'Acme', idp_name: 'acme' }]}
          placeholder={$t('shell.settings.users.create.idpOrgPlaceholder')}
        />
        <TranslatedFormFieldErrors />
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

**AFTER:**
```svelte
<FormField form={superFormObj} name="idp_org">
  <FormControl>
    {#snippet children({ props })}
      <div class="space-y-2">
        <FormLabel for={props.id}>{$t('shell.settings.users.create.idpOrg')}</FormLabel>
        <Select
          bind:value={$form.idp_org}
          options={orgOptions}
          loading={orgsLoading}
          placeholder={$t('shell.settings.users.create.idpOrgPlaceholder')}
        />
        <TranslatedFormFieldErrors />
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

**Add to script section of CREATE page:**
```typescript
import { apiFetch } from '$lib/api';

let availableOrgs = $state<Array<{ uuid: string; idp_code: string; display_name: string; avatar: string | null }>>([]);
let orgsLoading = $state(true);

const orgOptions = $derived(
  availableOrgs.map(o => ({ value: o.idp_code, label: o.display_name, idp_name: o.idp_code }))
);

onMount(async () => {
  try {
    const res = await apiFetch('/api/v1/system/organizations/active');
    if (res.ok) {
      const data = await res.json();
      availableOrgs = data.organizations ?? [];
    }
  } catch (e) {
    console.error('Failed to load active organizations:', e);
  } finally {
    orgsLoading = false;
  }
});
```

**Client-side first-page approach:** The `/system/organizations/active` endpoint returns the first page of active orgs. The `Select` component already does client-side filtering (confirmed in `select.svelte` lines 52–59: filters `options` by `search` string). So we load the first page once and filter client-side. No pagination/infinite-scroll needed for the dropdown.

**Note:** Verify the `Select` component accepts a `loading` prop. If not, either add it or omit it (the dropdown will just show empty options until loaded). Check `src/lib/components/ui/select/select.svelte` for a `loading` prop.

### EDIT and PROFILE pages
These display `idp_org` as readonly — no dropdown change needed. The readonly input already shows the org value from the user record.

### Verification
- Open CREATE user page → org dropdown loads active orgs from API (not hardcoded 'acme').
- Type in the dropdown search → client-side filters the loaded orgs.
- If API fails → dropdown is empty, no crash.

---

## 11. Username field: async validation (frontend) + metadata-driven validation config

### Current state
- CREATE page `idpUsername` field: standard `Input` + Zod only (min 3, max 255, alphanumeric). NO async validation.
- Org create `idp_name` field: uses `AsyncValidatedInput` + `checkIdpNameAvailability` calling `/api/v1/entities/organization/check-availability?idp_owner=...&idp_name=...`. Endpoint is HARDCODED in the page.
- **Backend:** `GET /api/v1/entities/organization/check-availability` exists in `primebrick-be-v3/src/modules/auth/organizations_router.ts` lines 144–184. It checks `getDal().getByIdpCode(idp_code)` and returns `{ available: boolean, idp_code, existing_uuid? }`.
- **Backend:** `GET /api/v1/auth/users/check-username` ALREADY EXISTS in `primebrick-be-v3/src/modules/auth/router.ts` lines 941–997. It accepts `username` and `idp_org` query params, checks local DB + Casdoor. Section 1 fixes it to make `idp_org` required and replace the raw-SQL `getByUsernameAndOrg` with `listUsers` + filter DSL.

### Goal
1. Use the EXISTING backend endpoint `GET /api/v1/auth/users/check-username?username=...&idp_org=...` (fixed in section 1) — **both params required**.
2. Add async validation to the username field in CREATE using `AsyncValidatedInput` (same pattern as org create `idp_name`).
3. **The username field MUST be disabled until an organization is selected** — since the availability check is org-scoped, accepting username input without an org would be semantically invalid.
4. Document the metadata-driven approach as a future Phase 2 (not implemented now).


**File:** `primebrick-fe-v3/src/routes/(app)/system/settings/users/create/+page.svelte`

**Add to script section:**
```typescript
import AsyncValidatedInput from '$lib/components/ui/input/async-validated-input.svelte';
import { ValidationResult, type ValidationStatus } from '$lib/types/validation';

// The username field is disabled until an org is selected — the availability check is org-scoped.
// When the org changes, any previously-entered username is cleared and validation resets,
// because the previous check result was for a different org scope.
const isUsernameEnabled = $derived(!!$form.idp_org);

// Reset username when org changes (the old username may be available in the new org, or taken — user must re-check)
function onOrgChange(newOrg: string) {
  $form.idp_org = newOrg;
  $form.idpUsername = '';        // clear username — it was validated against a different org
  usernameValidationStatus = 'idle';
}

async function checkUsernameAvailability(username: string): Promise<ValidationResult> {
  const idpOrg = $form.idp_org;
  if (!idpOrg) return ValidationResult.ERROR_API;  // safety guard — should never happen since field is disabled

  try {
    const params = new URLSearchParams({ username, idp_org: idpOrg });
    const response = await apiFetch(
      `/api/v1/auth/users/check-username?${params.toString()}`
    );
    if (!response.ok) return ValidationResult.ERROR_API;
    const data = await response.json();
    return data.available === true ? ValidationResult.VALID : ValidationResult.NOT_VALID;
  } catch (error) {
    console.error('Error checking username availability:', error);
    return ValidationResult.ERROR_API;
  }
}

let usernameValidationStatus = $state<ValidationStatus>('idle');
let hasAsyncError = $derived(usernameValidationStatus === 'not-valid');
function handleUsernameStatusChange(status: ValidationStatus) {
  usernameValidationStatus = status;
}
```

**BEFORE** (CREATE page username field, lines 435–449):
```svelte
<FormField form={superFormObj} name="idpUsername">
  <FormControl>
    {#snippet children({ props })}
      <div class="space-y-2">
        <FormLabel for={props.id}>{$t('shell.settings.users.create.idpUsername')}</FormLabel>
        <Input
          {...props}
          bind:value={$form.idpUsername}
          placeholder={$t('shell.settings.users.create.usernamePlaceholder')}
        />
        <TranslatedFormFieldErrors />
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

**AFTER:**
```svelte
<FormField form={superFormObj} name="idpUsername">
  <FormControl>
    {#snippet children({ props })}
      {@const hasZodError = props['aria-invalid'] === 'true' || props['aria-invalid'] === true}
      <div class="space-y-2">
        <FormLabel for={props.id}>{$t('shell.settings.users.create.idpUsername')}</FormLabel>
        <AsyncValidatedInput
          {...props}
          bind:value={$form.idpUsername}
          validateFn={checkUsernameAvailability}
          placeholder={isUsernameEnabled
            ? $t('shell.settings.users.create.usernamePlaceholder')
            : $t('shell.settings.users.create.usernameDisabledPlaceholder')}
          onStatusChange={handleUsernameStatusChange}
          externalInvalid={hasZodError}
          disabled={!isUsernameEnabled}
          aria-invalid={hasAsyncError ? true : props['aria-invalid']}
          data-fs-error={hasAsyncError ? 'true' : props['data-fs-error']}
        />
        {#if !isUsernameEnabled}
          <p class="text-muted-foreground text-xs">{$t('shell.settings.users.create.usernameSelectOrgFirst')}</p>
        {/if}
        <TranslatedFormFieldErrors />
        {#if hasAsyncError && !hasZodError}
          <div class="text-destructive text-xs font-medium">
            {$t('validation.nameTaken')}
          </div>
        {/if}
      </div>
    {/snippet}
  </FormControl>
</FormField>
```

**Key behavioral changes:**
- `disabled={!isUsernameEnabled}` — the `AsyncValidatedInput` is disabled (greyed out, not focusable) until `$form.idp_org` has a value.
- When the org dropdown changes, `onOrgChange()` clears the username and resets validation status. This prevents a stale "available" result from a previous org being shown.
- The placeholder text changes to a "select org first" hint when disabled.
- A helper text line appears below the field when disabled, telling the user to select an org first.

**Org dropdown wiring:** The org `Select` component (section 10) must call `onOrgChange` when the value changes. Update the org field's `onChange`/`onSelect` handler:

```svelte
<Select
  bind:value={$form.idp_org}
  options={orgOptions}
  loading={orgsLoading}
  placeholder={$t('shell.settings.users.create.idpOrgPlaceholder')}
  onChange={onOrgChange}
/>
```

**EDIT page:** Username is readonly in EDIT (displayed as a readonly input at lines 476–486). No async validation needed there — the org is already assigned and cannot change.

#### New i18n keys — ALL 6 files

##### `shell.settings.users.create.usernameDisabledPlaceholder`

| File | Value |
|---|---|
| `en-GB.json` | `"Select an organization first"` |
| `it-IT.json` | `"Seleziona prima un'organizzazione"` |
| `fr-FR.json` | `"Sélectionnez d'abord une organisation"` |
| `es-ES.json` | `"Seleccione primero una organización"` |
| `de-DE.json` | `"Wählen Sie zuerst eine Organisation"` |
| `pt-PT.json` | `"Selecione primeiro uma organização"` |

##### `shell.settings.users.create.usernameSelectOrgFirst`

| File | Value |
|---|---|
| `en-GB.json` | `"You must select an organization before entering a username."` |
| `it-IT.json` | `"Devi selezionare un'organizzazione prima di inserire il nome utente."` |
| `fr-FR.json` | `"Vous devez sélectionner une organisation avant de saisir un nom d'utilisateur."` |
| `es-ES.json` | `"Debe seleccionar una organización antes de ingresar un nombre de usuario."` |
| `de-DE.json` | `"Sie müssen eine Organisation auswählen, bevor Sie einen Benutzernamen eingeben."` |
| `pt-PT.json` | `"Deve selecionar uma organização antes de inserir um nome de utilizador."` |

### 11a. Investigation: is the validation config from metadata?

**Finding:** NO. The `EntityMetadata` / `MetaColumn` interface (in `src/lib/entity-list/types.ts`) has NO validation config field. The `AsyncValidatedInput` component is generic (`validateFn` prop), but the function and endpoint are hardcoded in each page.

### 11b. Phase 2 (design proposal, NOT implemented now): Metadata-driven validation

Extend `MetaColumn` with an optional validation config:

```typescript
export type MetaColumn = {
  // ... existing fields ...
  validation?: {
    /** Async validation — name of a client-side function to call, resolved via a registry. */
    asyncFn?: string;  // e.g., 'checkUsernameAvailability'
    /** Or a direct endpoint URL template with {value} placeholder. */
    asyncEndpoint?: string;  // e.g., '/api/v1/auth/users/check-username?username={value}&idp_org={org}' — supports {value} and {org} placeholders for org-scoped checks
    /** Expected response shape — standardized. */
    asyncResponseShape?: 'availability';  // { available: boolean }
  };
};
```

Then create a validation function registry:
```typescript
// src/lib/composables/useAsyncValidation.svelte.ts
const validators: Record<string, (value: string) => Promise<ValidationResult>> = {
  checkUsernameAvailability: async (v) => { /* ... */ },
  checkIdpNameAvailability: async (v) => { /* ... */ },
};

export function getValidator(name: string) {
  return validators[name];
}
```

The form pages would then read `meta.columns.find(c => c.key === 'idpUsername')?.validation?.asyncFn` and resolve it via the registry. **This is a larger refactor and is NOT part of this implementation plan.** It's documented as the recommended future direction.

### Verification (frontend)
- Open CREATE user page → username field is DISABLED (greyed out), placeholder says "Seleziona prima un'organizzazione", helper text says "Devi selezionare un'organizzazione prima di inserire il nome utente."
- Select an org → username field becomes ENABLED, placeholder switches to the normal username placeholder, helper text disappears.
- Type a username that already exists in the selected org → async error icon (TicketX) appears, "This name is already taken" message shows.
- Type a unique username → green checkmark (CircleCheckBig).
- Type < 3 chars → no async validation (Zod handles it, AsyncValidatedInput has MIN_CHARS=3).
- **Change the org after entering a username** → username field is CLEARED, validation resets to idle. The previous "available"/"taken" result was for a different org scope and is no longer valid.
- **Same username in different orgs:** Select org "acme", type "admin" → "taken". Change to org "other-org", type "admin" → "available" (if no admin exists in other-org). This proves the check is org-scoped.

---

## 12. Extract useHealthChip composable

Extract the health chip derivation (currently lines 138–183 in AppSidebar.svelte):

```typescript
// src/lib/composables/useHealthChip.svelte.ts
import { backendState } from '$lib/backend-availability';
import { t } from '$lib/i18n';
import { APP_VERSION } from '$lib/version';

export type HealthChip = 'ok' | 'backend_offline' | 'db_offline' | 'idp_offline' | 'loading';

export function useHealthChip() {
  const health = $derived(backendState.health);
  const healthChip = $derived(backendState.chip as HealthChip);

  const healthChipLabel = $derived(
    healthChip === 'backend_offline' ? $t('shell.health.beOffline')
      : healthChip === 'db_offline' ? $t('shell.health.dbOffline')
      : healthChip === 'idp_offline' ? $t('shell.health.idpOffline')
      : healthChip === 'ok' ? $t('shell.health.beOnline')
      : $t('common.loading')
  );

  const healthChipClass = $derived(
    healthChip === 'backend_offline' ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
      : healthChip === 'db_offline' ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
      : healthChip === 'idp_offline' ? 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
      : healthChip === 'ok' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : 'border-border/60 bg-muted/30 text-muted-foreground'
  );

  const healthChipTextClass = $derived(
    healthChip === 'backend_offline' ? 'text-destructive'
      : healthChip === 'db_offline' ? 'text-destructive'
      : healthChip === 'idp_offline' ? 'text-warning'
      : healthChip === 'ok' ? 'text-success'
      : 'text-muted-foreground'
  );

  return { health, healthChip, healthChipLabel, healthChipClass, healthChipTextClass, APP_VERSION };
}
```

**Note:** Verify `backendState.chip` exists; if the chip is computed inline in AppSidebar today, move `computeHealthChip` into `backend-availability.svelte.ts` and expose `backendState.chip`. Check `backend-availability.svelte.ts` for the exact field name.

## 13. VERSION PANEL sheet: add ONLINE badge near close button + make sidebar ONLINE badge clickable

### Goal
- Add an ONLINE status badge inside the VersionsPanel sheet header, next to the X close button, mirroring all possible statuses of the sidebar health badge.
- Make the sidebar ONLINE/health badge clickable to open the version panel sheet (same as the version badge does today).

### 13a. Make sidebar ONLINE badge clickable

**BEFORE** (`src/lib/components/AppSidebar.svelte` lines 543–573):
```svelte
<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props: tooltipProps })}
      <Badge
        variant="outline"
        class={cn(
          'w-fit gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
          'group-data-[collapsible=icon]:size-8! ...',
          healthChipClass
        )}
        {...tooltipProps}
      >
        {#if healthChip === 'backend_offline'}
          <CloudOff class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
        {:else if healthChip === 'db_offline'}
          <Database class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
        {:else if healthChip === 'idp_offline'}
          <ShieldAlert class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
        {:else}
          <Cloud class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
        {/if}
        {#if !collapsed}
          <span>{healthChipLabel}</span>
        {/if}
      </Badge>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content>
    {$t('shell.health.statusTooltip', { status: healthChipLabel, version: APP_VERSION })}
  </Tooltip.Content>
</Tooltip.Root>
```

**AFTER** — wrap the Badge in a `<button>` that opens the sheet, keep the tooltip:
```svelte
<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props: tooltipProps })}
      <button
        type="button"
        class="inline-flex h-auto cursor-pointer rounded-full border-0 bg-transparent p-0 shadow-none ring-offset-background hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={$t('shell.health.versionsTitle')}
        onclick={() => openSheet('shell.versions', {}, { contentClass: 'w-[420px] p-0' })}
        {...tooltipProps}
      >
        <Badge
          variant="outline"
          class={cn(
            'w-fit gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
            'group-data-[collapsible=icon]:size-8! ...',
            healthChipClass
          )}
        >
          {#if healthChip === 'backend_offline'}
            <CloudOff class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
          {:else if healthChip === 'db_offline'}
            <Database class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
          {:else if healthChip === 'idp_offline'}
            <ShieldAlert class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
          {:else}
            <Cloud class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
          {/if}
          {#if !collapsed}
            <span>{healthChipLabel}</span>
          {/if}
        </Badge>
      </button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content>
    <!-- see section 14 for the new rich tooltip content -->
  </Tooltip.Content>
</Tooltip.Root>
```

**Note:** The `tooltipProps` (which include the tooltip trigger's aria/hover handlers) move to the `<button>`. The `Badge` becomes purely visual. This matches the existing version badge pattern (lines 575–587) which already uses a `<button>` + `openSheet`.

### 13b. Add ONLINE badge inside VersionsPanel sheet header (next to X)

**BEFORE** (`src/lib/shell/sheets/panels/VersionsPanel.svelte` lines 20–28):
```svelte
{#snippet headerActions()}
  <Sheet.Close
    class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden"
    onclick={() => closeSheet()}
  >
    <XIcon class="size-4" />
  </Sheet.Close>
{/snippet}
```

**AFTER** — add a health badge to the LEFT of the close button:
```svelte
{#snippet headerActions()}
  <div class="flex items-center gap-2">
    <Badge
      variant="outline"
      class={cn(
        'gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        healthChipClass
      )}
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
    <Sheet.Close
      class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:text-accent-foreground hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden"
      onclick={() => closeSheet()}
    >
      <XIcon class="size-4" />
    </Sheet.Close>
  </div>
{/snippet}
```

**Required imports in VersionsPanel.svelte:**
- `import { Badge } from '$lib/components/ui/badge';`
- `import { cn } from '$lib/utils';`
- `import { backendState } from '$lib/backend-availability';` (already imported for `health`)
- Lucide icons: `Cloud`, `CloudOff`, `Database`, `ShieldAlert`
- The `healthChip`, `healthChipLabel`, `healthChipClass` derivations — see section 12 (refactoring): extract these into a composable `useHealthChip` so both AppSidebar and VersionsPanel can use them without duplication.

**If refactoring is deferred (section 12 not done first):** duplicate the derivation logic in VersionsPanel.svelte:
```typescript
import { backendState } from '$lib/backend-availability';
import { t } from '$lib/i18n';

const health = $derived(backendState.health);
const healthChip = $derived(backendState.chip); // or computeHealthChip(backendState)
const healthChipLabel = $derived(
  healthChip === 'backend_offline' ? $t('shell.health.beOffline')
    : healthChip === 'db_offline' ? $t('shell.health.dbOffline')
    : healthChip === 'idp_offline' ? $t('shell.health.idpOffline')
    : healthChip === 'ok' ? $t('shell.health.beOnline')
    : $t('common.loading')
);
const healthChipClass = $derived(
  healthChip === 'backend_offline' ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
    : healthChip === 'db_offline' ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
    : healthChip === 'idp_offline' ? 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
    : healthChip === 'ok' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : 'border-border/60 bg-muted/30 text-muted-foreground'
);
```

### Verification
- Click the ONLINE badge in the sidebar → version panel sheet opens.
- Open the version panel sheet (via version badge) → ONLINE badge appears next to the X button, with correct icon/color/label for the current status.
- Test all 4 statuses (online, backend offline, db offline, idp offline) by stopping backend/db/idp.

---

## 14. Improve ONLINE badge tooltip: rich multi-line content with status color + version badges

### Goal
Replace the single-line `shell.health.statusTooltip` text with a rich tooltip:
- Line 1: `Stato: ONLINE` (where `ONLINE` is colored according to status, same text-color as the badge)
- Line 2: `Shell Version` + badge `v{APP_VERSION}`
- Line 3: `Backend Version` + badge `v{health.version}` (or `—`)

The tooltip must render HTML (badges inside). The existing `Tooltip.Content` already supports HTML children (confirmed empirically).

### Change — AppSidebar.svelte tooltip content

**BEFORE** (line 570–572):
```svelte
<Tooltip.Content>
  {$t('shell.health.statusTooltip', { status: healthChipLabel, version: APP_VERSION })}
</Tooltip.Content>
```

**AFTER:**
```svelte
<Tooltip.Content class="max-w-xs">
  <div class="space-y-1.5">
    <div class="text-xs font-medium">
      <span class="text-background/80">{$t('shell.health.statusLabel')}:</span>
      <span class={healthChipTextClass}>
        {healthChipLabel}
      </span>
    </div>
    <div class="flex items-center justify-between gap-3">
      <span class="text-background/80 text-xs">{$t('shell.health.shellVersion')}</span>
      <Badge variant="outline" class="font-mono text-[10px] font-medium tabular-nums border-background/30">
        v{APP_VERSION}
      </Badge>
    </div>
    <div class="flex items-center justify-between gap-3">
      <span class="text-background/80 text-xs">{$t('shell.health.backendVersion')}</span>
      <Badge variant="outline" class="font-mono text-[10px] font-medium tabular-nums border-background/30">
        {health?.version ? `v${health.version}` : '—'}
      </Badge>
    </div>
  </div>
</Tooltip.Content>
```

**Note on text color:** The tooltip default is `bg-foreground text-background` (dark background, light text). To color the status label with the same hue as the badge, we use `healthChipTextClass` (a dedicated derived value returning only the text color class — `text-destructive`, `text-warning`, `text-success`, or `text-muted-foreground`). These are the project's standard semaphoric classes from `src/app.css` `@theme`. The `text-background/80` gives a muted light-text for the "Stato:" label and version labels.

**Alternative (cleaner):** Add a dedicated `healthChipTextClass` derived value that returns only the text color, using the project's semaphoric classes (`text-destructive`, `text-warning`, `text-success` — defined in `src/app.css` `@theme`):
```typescript
const healthChipTextClass = $derived(
  healthChip === 'backend_offline' ? 'text-destructive'
    : healthChip === 'db_offline' ? 'text-destructive'
    : healthChip === 'idp_offline' ? 'text-warning'
    : healthChip === 'ok' ? 'text-success'
    : 'text-muted-foreground'
);
```
Use `healthChipTextClass` for the status label span. This is the RECOMMENDED approach (avoids regex hacks, uses project standard semaphoric colors).

### New i18n key — ALL 6 files

Add `shell.health.statusLabel`:

| File | Value |
|---|---|
| `en-GB.json` | `"Status"` |
| `it-IT.json` | `"Stato"` |
| `fr-FR.json` | `"Statut"` |
| `es-ES.json` | `"Estado"` |
| `de-DE.json` | `"Status"` |
| `pt-PT.json` | `"Estado"` |

The existing `shell.health.statusTooltip` key can remain for backwards compat or be removed (it's only used here).

### Verification
- Hover the ONLINE badge in the sidebar (expanded and collapsed).
- Tooltip shows: "Stato: ONLINE" (ONLINE in emerald), then "Shell" + `vX.Y.Z` badge, then "Backend" + `vX.Y.Z` badge.
- Change status to offline → "Stato: Offline" in red, badges still show.

---

## 15. AppSidebar refactoring: extract sub-components

### Current state
`AppSidebar.svelte` = 591 lines. It mixes: org switcher logic, profile menu, health badge derivation, version badge, nav modules, demo menu.

### Refactoring strategy (incremental, low-risk)

Extract pure logic into a composable, and extract self-contained UI blocks into child components. The AppSidebar becomes a thin orchestrator.

#### 15a. New component: `src/lib/components/sidebar/SidebarHealthBadge.svelte`

Extracts lines 543–573 (the health badge + tooltip + click-to-open-sheet):

```svelte
<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { useHealthChip } from '$lib/composables/useHealthChip.svelte';
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import Database from '@lucide/svelte/icons/database';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';

  let { collapsed }: { collapsed: boolean } = $props();
  const { health, healthChip, healthChipLabel, healthChipClass, healthChipTextClass, APP_VERSION } = useHealthChip();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props: tooltipProps })}
      <button
        type="button"
        class="inline-flex h-auto cursor-pointer rounded-full border-0 bg-transparent p-0 shadow-none ring-offset-background hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={$t('shell.health.versionsTitle')}
        onclick={() => openSheet('shell.versions', {}, { contentClass: 'w-[420px] p-0' })}
        {...tooltipProps}
      >
        <Badge variant="outline" class={cn('w-fit gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium', 'group-data-[collapsible=icon]:size-8! ...', healthChipClass)}>
          {#if healthChip === 'backend_offline'}<CloudOff class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
          {:else if healthChip === 'db_offline'}<Database class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
          {:else if healthChip === 'idp_offline'}<ShieldAlert class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />
          {:else}<Cloud class="size-3.5 opacity-90 group-data-[collapsible=icon]:size-4" />{/if}
          {#if !collapsed}<span>{healthChipLabel}</span>{/if}
        </Badge>
      </button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content class="max-w-xs">
    <!-- rich tooltip from section 14 -->
  </Tooltip.Content>
</Tooltip.Root>
```

#### 15b. New component: `src/lib/components/sidebar/SidebarVersionBadge.svelte`

Extracts lines 575–587:

```svelte
<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { openSheet } from '$lib/shell/sheets/sheet-manager.svelte';
  import { t } from '$lib/i18n';
  import { APP_VERSION } from '$lib/version';
  let { collapsed, isMobile }: { collapsed: boolean; isMobile: boolean } = $props();
</script>

{#if !collapsed || isMobile}
  <button type="button" class="..." aria-label={$t('shell.health.versionsTitle')} onclick={() => openSheet('shell.versions', {}, { contentClass: 'w-[420px] p-0' })}>
    <Badge variant="outline" class="font-mono text-[11px] font-medium tabular-nums">v{APP_VERSION}</Badge>
  </button>
{/if}
```

#### 15c. New component: `src/lib/components/sidebar/SidebarProfileMenu.svelte`

Extracts lines 446–532 (profile menu). Props: `user`, `collapsed`, `onLogout`.

#### 15d. New component: `src/lib/components/sidebar/SidebarOrgSwitcher.svelte`

Extracts lines 220–282 (org switcher dropdown).

#### 15e. (Optional) New component: `src/lib/components/sidebar/SidebarNavModules.svelte`

Extracts lines 285–390 (navigation modules).

### Result
AppSidebar.svelte shrinks from ~591 lines to ~150–200 lines (orchestrator + layout).

### Recommendation
Do this refactoring AFTER sections 1–4 and 6–13 are implemented and verified, to avoid merge conflicts. Alternatively, do 5a/5b/5c first (small, safe extractions) since sections 1 and 2 modify exactly those blocks.

**Suggested order:** 5a (composable) → 1+2 (modify health badge, using composable) → 5b/5c (extract) → 3, 4, 6–13 → 5d/5e/5f (optional further extraction).

### Verification
- `pnpm run check` passes (no type errors).
- Sidebar behavior unchanged: org switcher, nav, profile menu, health badge, version badge all work.
- No visual regression.

---

## Implementation order (recommended)

**Rationale:** Start with small isolated changes and foundational components (priority tooltip). Then form-level changes (email, checkboxes, roles, org dropdown, username). Then sidebar health badge work (which needs the composable). AppSidebar refactoring (section 15 sub-component extraction) is LAST to avoid merge conflicts with all other sidebar-touching sections.

### Backend (primebrick-be-v3) — do first so frontend can test against it
1. **Section 1** — Fix existing `GET /api/v1/auth/users/check-username` endpoint: make `idp_org` required, replace `getByUsernameAndOrg` raw SQL with `listUsers` + filter DSL, add `idp_username`/`idp_org` to DAL `allowedFields`, remove `getByUsernameAndOrg`. Run `pnpm run build` to verify.

### Frontend (primebrick-fe-v3) — foundational & isolated changes first
2. **Section 2** — Create `priority-tooltip-content.svelte` + `FormLabelWithPriorityHelp.svelte` (foundation for 6, 7). Uses project semaphoric classes `text-info`/`text-warning`/`text-success`/`text-destructive`.
3. **Section 3** — Email validation: new `validation.invalidEmail` i18n key (all 6 files) + Zod schema fixes in CREATE/EDIT/PROFILE (small, isolated)
4. **Section 4** — Remove "Notifiche" menu item from AppSidebar profile menu (small, isolated)
5. **Section 5** — AppTopbar: `shadow-md` → `border-b border-border` (small, isolated)

### Frontend — form field changes (depend on section 2 for priority tooltips)
6. **Section 6** — Metadata-driven priority tooltips: (a) Backend: add `tooltip`/`tooltipPriority`/`tooltipTitle`/`showFormTooltip`/`showListTooltip` to 3 columns in `/api/v1/entities/user_profiles/meta` + add `columns` array to `/api/v1/auth/me/meta` + update OpenAPI schema. (b) Frontend: extend `MetaColumn` type, create `entities.userProfile.hints.*` i18n keys (all 6 files, 6 keys × 6 files = 36 values), update `TableHeader`/`CardField` to use `FormLabelWithPriorityHelp` from metadata, make CREATE/EDIT pages load metadata and read tooltips from it (depends on 2 for `FormLabelWithPriorityHelp` + `TooltipPriority` type)
7. **Section 7** — PROFILE page checkbox layout: vertical → horizontal (matches CREATE). Uses `FormLabelWithPriorityHelp` from step 6. (depends on 6)
8. **Section 8** — Roles required (`min(1)`) on BOTH CREATE + EDIT Zod schemas + new `validation.rolesRequired` i18n key + MultiSelect `aria-invalid` support + pass `{...props}` to MultiSelect
9. **Section 9** — MultiSelect clear-all X button next to chevron (same component as 8 — do immediately after)
10. **Section 10** — Org dropdown in CREATE: replace hardcoded array with fetch from `/api/v1/system/organizations/active` (isolated)
11. **Section 11** — Username async validation in CREATE page using `AsyncValidatedInput` (depends on 1 backend endpoint)

### Frontend — sidebar health badge work (needs composable)
12. **Section 12** — Extract `useHealthChip` composable (uses `text-destructive`/`text-warning`/`text-success` for `healthChipTextClass`)
13. **Section 13** — Health badge clickable (opens version sheet) + ONLINE badge in VersionsPanel header next to X (depends on 12)
14. **Section 14** — Rich health badge tooltip: "Stato:" + colored status + Shell/Backend version badges (depends on 12 for `healthChipTextClass`)

### Frontend — AppSidebar refactoring (LAST, after all functional changes verified)
15. **Section 15** — Extract sub-components: `SidebarHealthBadge.svelte` (after sections 13, 14 verified), `SidebarVersionBadge.svelte`, `SidebarProfileMenu.svelte` (after section 4 verified), `SidebarOrgSwitcher.svelte`, `SidebarNavModules.svelte` (optional)

## Verification (global)

After all changes:
- [ ] Backend: `pnpm run build` succeeds (primebrick-be-v3)
- [ ] Frontend: `pnpm run check` passes (no type errors)
- [ ] Frontend: `pnpm run build` succeeds
- [ ] Manual test in all 6 languages (at least IT + EN)
- [ ] Test all 4 health statuses (online, backend offline, db offline, idp offline)
- [ ] Test sidebar collapsed + expanded
- [ ] Test CREATE user form end-to-end (validation, org dropdown, roles required, username async)
- [ ] Test EDIT user form (roles required)
- [ ] Test PROFILE page (checkbox layout, tooltips, email validation)
- [ ] Test version panel sheet (ONLINE badge, close button)
- [ ] Test username check-username endpoint with curl/Postman (`/api/v1/auth/users/check-username?username=...&idp_org=...`)

## Risks / Considerations

- **Section 1 (backend endpoint):** The endpoint `GET /api/v1/auth/users/check-username` ALREADY EXISTS — no new route needed. The fix makes `idp_org` required (removes env-var fallback), replaces the raw-SQL `getByUsernameAndOrg` method with `listUsers` + filter DSL (adding `idp_username` and `idp_org` to the `allowedFields` whitelist in `translateFilterConditions`), and removes the now-unused `getByUsernameAndOrg` method. Permission `USERS_READ_ALL` is required (unchanged). **Both `username` and `idp_org` are required** — username uniqueness is scoped per-org (matching Casdoor's idp_owner/idp_name model). The frontend (section 11) disables the username field until an org is selected, and clears the username when the org changes. The Casdoor fallback check is preserved (catches users in Casdoor not yet synced to local DB).
- **Section 2 (text colors):** RESOLVED — the project defines `text-info`, `text-warning`, `text-success`, `text-destructive` in `src/app.css` `@theme` block (CSS variables `--info`, `--warning`, `--success`, `--destructive`). These are used directly, no hardcoded Tailwind color fallbacks needed. Verified empirically against `AppTopbar.impactBadgeClass()`, `dialog-bordered.svelte`, `TableRow.svelte`, `BulkActionsToolbar.svelte`.
- **Section 6 (metadata-driven):** The backend metadata is hardcoded in router endpoints (not auto-generated). The `entities.userProfile.hints.*` i18n keys referenced by the backend metadata DO NOT EXIST in the frontend i18n files — they must be created (section 6c). The CREATE page currently does NOT load metadata — it must be wired up (section 6e). The `/api/v1/auth/me/meta` endpoint (PROFILE page) has no `columns` array — it must be added (section 6a, Change 2). The `FormLabelWithHelp` component is still used by `TableHeader` and `CardField` — both must be updated to `FormLabelWithPriorityHelp` (section 6d). Graceful degradation: if metadata fails to load, the `{#if colMeta?.tooltip && colMeta?.showFormTooltip !== false}` guard ensures no tooltip renders (no crash).
- **Section 15 (refactoring):** Risk of regression. Do it incrementally, after functional changes are verified. Run `pnpm run check` after each extraction.
- **Section 8 (roles required — BOTH pages per user decision):** Making roles required on EDIT means existing users with no roles will fail validation when edited. This is intentional per user decision. If this causes issues with legacy data, consider a migration to assign a default role.
- **Section 10 (org dropdown):** The `/system/organizations/active` endpoint returns orgs for the current user's accessible orgs. Verify this is the right source for the user-create form (an admin creating a user may need to see ALL orgs, not just their own). If so, a different endpoint may be needed.
- **i18n:** All 6 language files must be updated for every new/changed key. Missing a file causes fallback to the key path string.
- **Atomic commits:** Per `code-guardards` rule, apply changes iteratively and run linter/build after each module rather than editing multiple files at once. Max 2 self-correction attempts on failures before halting.
