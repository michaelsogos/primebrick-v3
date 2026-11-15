# Plan: FE UI Stack & Component Catalog Documentation

> **Status: DRAFT — awaiting user approval. Do NOT execute until the user replies `PROCEED`.**

## 1. Goal

Two documentation outcomes for the Primebrick frontend (`primebrick-fe-v3`), surfaced
on `docs.primebrick.dev`:

1. **UI stack page** — make it unambiguous that the FE is built on **BITS UI**,
   **shadcn-svelte**, **more-shadcn-svelte** (kevwpl), **shadcn-svelte-extras**
   (ieedan), and **Tailwind CSS**, with links to each official site so devs can
   learn the basics upstream.
2. **Component catalog with per-component pages** — one MDX page per
   "custom" or "wrapped" own component, starting from `EntityListTable` as the
   flagship model, linked from a catalog index that groups components by origin.

## 2. Empirical findings (verified, not assumed)

### 2.1 Libraries in use (from `primebrick-fe-v3/package.json` + `components.json`)

| Library | Evidence | Website |
|---|---|---|
| **bits-ui** | `package.json` devDep `"bits-ui": "2.18.1"` — the headless primitive layer shadcn-svelte is built on | https://www.bits-ui.org |
| **shadcn-svelte** | `components.json` present, `$schema: shadcn-svelte.com/schema.json`, `registry: shadcn-svelte.com/registry`, `style: "nova"`, `iconLibrary: "lucide"`; primitives vendored in `src/lib/components/ui/` | https://www.shadcn-svelte.com |
| **more-shadcn-svelte** | User-confirmed = `kevwpl/more-shadcn-svelte`. Registry at `more-shadcn.noair.fun`. **No attribution comments found in `src/`** — provenance must be audited | https://more-shadcn.noair.fun · https://github.com/kevwpl/more-shadcn-svelte |
| **shadcn-svelte-extras** | User-confirmed = `ieedan/shadcn-svelte-extras`. **No attribution comments in `src/`** — provenance must be audited. Strong structural matches exist (e.g. `ui/password/` has `password.svelte.ts` hook + `password-input`/`password-strength`/`password-toggle-visibility`/`password-copy`, matching the extras "Password" component; `ui/window/`, `ui/copy-button/` also resemble extras) | https://www.shadcn-svelte-extras.com · https://github.com/ieedan/shadcn-svelte-extras |
| **Tailwind CSS** | `package.json` `"tailwindcss": "4.3.2"` + `@tailwindcss/vite`, `tw-animate-css`, `tailwind-merge`, `tailwind-variants`, `class-variance-authority`; `components.json` `tailwind.css: "src/app.css"` | https://tailwindcss.com |

Related vendored helpers in `package.json`: `formsnap` (shadcn-svelte form layer),
`paneforge` (shadcn-svelte splitter), `runed` (Svelte 5 runes utilities),
`svelte-sonner` (toast), `sveltekit-superforms` + `zod` (forms).

### 2.2 Current docs-from-code logic (FE repo)

- `scripts/extract-component-docs.mjs` → `pnpm extract-docs` runs **sveld** over
  every `.svelte` file under `src/lib/components/` and writes
  `docs/user-guide/_extracted/components.json` (~1.2 MB).
- `docs/user-guide/api-reference.mdx` (~143 KB) is a **mechanical, AUTO-GENERATED**
  listing of every component, grouped into 8 `## ` sections: `Root`, `auth`,
  `date-dropper`, `entity-list-table`, `forms`, `sidebar`, `toasts`, `ui`.
  Wrapped in `<!-- AUTO-GENERATED:reference -->` / `<!-- END -->`.
- The `make-docs` skill (`.devin/skills/make-docs/SKILL.md`) regenerates
  `api-reference.mdx` from the JSON and surgically updates prose pages.
- `docs-sync-on-close.md` rule runs extraction + anti-rewrite check on GitFlow close.

### 2.3 Docs site CI (`primebrick-v3-docs`)

- `scripts/sync-repo-docs.mjs` shallow-clones each repo, copies
  `docs/user-guide/**` → `pages/<repo>/guide/**` **recursively**, preserving
  subdirectories, and **skips `_extracted/`** and hidden dirs.
- `scripts/generate-nav.mjs` reads `_order.json`, recurses into subdirs, and
  groups subdir pages into **nested sidebar categories** (slug includes the
  subdir path, e.g. `components/combo-select`).
- Runs on push to `main` + every 6h cron (`sync-docs.yml`), commits changes back.

**Conclusion: a new `components/` subdirectory and new top-level pages flow
through the existing CI with ZERO changes to sync-repo-docs.mjs or
generate-nav.mjs.** The `_order.json` manifest controls ordering.

### 2.4 Existing FE user-guide pages

`_order.json`: `overview, getting-started, app-shell, authentication,
entity-list-table, settings, ui-components, api-reference`.

`ui-components.mdx` already hand-lists: ComboSelect, DynamicIcon, ColorSelector,
AvatarPreview, FormLabelWithHelp, FormLabelWithPriorityHelp, PasswordChecklist,
tooltip system, AsyncValidatedInput, TextInput, EventCard, sidebar badges.
`entity-list-table.mdx` is the existing flagship per-component page (188 lines,
Mermaid diagram, composable table, dialogs, panels, column types, persistence).

## 3. Decisions (locked from clarifying questions)

1. **MORE SHADCN** = `kevwpl/more-shadcn-svelte` (more-shadcn.noair.fun).
2. **more-shadcn & shadcn-svelte-extras are BOTH used (copy-pasted into
   `src/lib/components/ui/`) AND referenced** as knowledge sources. Because
   there is **zero attribution in `src/`**, the plan includes a **provenance
   audit** as execution step 1.
3. **Per-component pages** (one MDX per custom/wrapped component), linked from a
   catalog index. `EntityListTable` is the model.
4. **Stack docs**: new dedicated page **+** short mention in `overview.mdx`.

## 4. Architecture of the solution

### 4.1 New pages

| Path (FE repo `docs/user-guide/`) | Type | Auto block? |
|---|---|---|
| `ui-stack.mdx` | Stack & libraries page (BITS UI, shadcn-svelte, more-shadcn, extras, Tailwind + official links + when to use each) | No — pure prose |
| `components/index.mdx` | Catalog index: table of all custom/wrapped components grouped by origin, with one-line purpose + link to the per-component page + link to `api-reference` anchor | No — hand-maintained (optionally semi-auto in phase 2) |
| `components/<slug>.mdx` | One per custom/wrapped component: purpose, origin/provenance, what we customized, usage example, "Props" link to `api-reference.mdx#anchor` | No — prose only; props live in api-reference (single source of truth) |

### 4.2 Why per-component pages link to `api-reference.mdx` instead of embedding props

- `api-reference.mdx` is already auto-generated from sveld by `pnpm extract-docs`
  via the `make-docs` skill. Embedding prop tables in each per-component page
  would duplicate the data and require extending make-docs to update N pages.
- Linking to `api-reference.mdx#entitylisttable` (Zudoku anchors) keeps props as
  a single source of truth and means **zero changes to the docs-from-code
  pipeline or CI**.
- Each per-component page therefore contains only human context (purpose, origin,
  customization, usage) — exactly what sveld cannot generate.

### 4.3 Provenance manifest (hand-maintained, like `_order.json`)

New file: `docs/user-guide/_extracted/component-provenance.json`

```json
{
  "version": 1,
  "components": [
    {
      "slug": "entity-list-table",
      "dir": "src/lib/components/entity-list-table",
      "origin": "custom",
      "source_url": null,
      "category": "entity-list",
      "summary": "Generic controlled list/table/card system used by every module."
    },
    {
      "slug": "combo-select",
      "dir": "src/lib/components/ui/combo-select",
      "origin": "custom",
      "source_url": null,
      "category": "form",
      "summary": "Searchable single/multi select on Popover + Command."
    },
    {
      "slug": "password",
      "dir": "src/lib/components/ui/password",
      "origin": "shadcn-svelte-extras",
      "source_url": "https://www.shadcn-svelte-extras.com/components/password",
      "category": "form",
      "summary": "Password input with strength + toggle + copy (extras Password, customized)."
    }
  ]
}
```

`origin` ∈ `custom | shadcn-svelte | more-shadcn | shadcn-svelte-extras | bits-ui-wrapper`.
This manifest is the input to the catalog index (and, in phase 2, an optional
generator script). It is **not** synced to the docs site (lives under
`_extracted/`, which sync-repo-docs.mjs already skips).

### 4.4 `_order.json` change

```json
{
  "pages": [
    "overview",
    "getting-started",
    "ui-stack",
    "app-shell",
    "authentication",
    "entity-list-table",
    "settings",
    "ui-components",
    "components/combo-select",
    "components/dynamic-icon",
    "components/color-selector",
    "components/avatar-preview",
    "components/event-card",
    "components/command-palette",
    "...",
    "api-reference"
  ]
}
```

`components/index` is excluded from nav (it's the category landing page, like
`index.mdx` per `docs-order.md`). Subdir pages auto-group into a "Components"
nested sidebar category via `generate-nav.mjs`.

## 5. Execution plan (phased)

### Phase 0 — Provenance audit (BLOCKING, no doc writes yet)

For every directory under `src/lib/components/` (and the loose `.svelte` files at
the component root), determine origin by comparing source against the three
registries. Tooling available during execution:

- `mcp_call_tool` on the **shadcn-svelte MCP** (`shadcn-svelte-mcp`) to query
  official component APIs/examples and confirm whether a ui/ component matches
  the vendored shadcn-svelte primitive.
- `webfetch` against `shadcn-svelte-extras.com/components/<x>` and
  `more-shadcn.noair.fun/r/<x>.json` to compare structure.
- `read` each component source + `grep` for tell-tale imports/structure.
- **Svelte MCP** (`svelte`) to validate any usage examples written in the pages.

Output: the completed `component-provenance.json` manifest. **Every entry's
`origin` must be backed by evidence (file structure match or registry URL
match); if uncertain, mark `origin: "unknown"` and surface to the user.**

Candidate component inventory (to be attributed during the audit):

- **Root (loose files)**: `AppPageBreadcrumb`, `AppPageLayout`, `AppPageScaffold`,
  `AppServerBanner`, `AppShell`, `AppSidebar`, `AppTopbar`, `BrowserClientInfo`,
  `button.svelte`, `CommandPalette`, `FormPageLayout`, `LangSelect`, `ThemeToggle`
- **`auth/`**: `LoginForm`, `PasskeyButton`, `PasskeyEnrollment`,
  `PasskeyPromptDialog`, `SessionExpiredDialog`
- **`date-dropper/`**: `date-wheel-picker`
- **`entity-list-table/`**: `EntityListTable` + ~30 sub-components
  (`BulkActions`, `CardView`, `TableView`, `Dialogs`, `Panels`, `Pagination`, …)
- **`forms/`**: `FormLabelWithHelp`, `FormLabelWithPriorityHelp`,
  `PasswordChecklist`
- **`sidebar/`**: `SidebarHealthBadge`, `SidebarModuleSwitcher`,
  `SidebarOrgSwitcher`, `SidebarProfileMenu`, `SidebarVersionBadge`
- **`toasts/`**: `EventToast`
- **`ui/` (47 dirs + 4 loose files)**: `alert`, `avatar`, `avatar-preview`,
  `badge`, `breadcrumb`, `button`, `button-group`, `card`, `checkbox`,
  `choicebox`, `color-picker`, `color-selector`, `combo-select`, `command`,
  `copy-button`, `dialog`, `dialog-bordered.svelte`, `dock`, `dropdown-menu`,
  `dynamic-icon`, `event-card`, `form`, `input` (incl. `async-validated-input`,
  `text-input`), `input-group`, `JsonTableViewer.svelte`, `kbd`, `label`,
  `loading-bar`, `menu-row-chrome.ts`, `metadata-loading`, `password`,
  `popover`, `resizable`, `rfc-error-dialog.svelte`, `scroll-area`,
  `separator`, `sheet`, `sidebar`, `skeleton`, `sonner`, `sortable`, `spinner`,
  `switch`, `table`, `tabs`, `textarea`, `timeline`, `toggle`, `tooltip`,
  `wheel-picker`, `window`

### Phase 1 — Stack page + catalog skeleton + flagship pages

1. Create `docs/user-guide/ui-stack.mdx`:
   - H2 per library: BITS UI, shadcn-svelte, more-shadcn-svelte,
     shadcn-svelte-extras, Tailwind. For each: what it is, our version/style
     (`style: "nova"`, `baseColor: zinc`), where it lives in the repo, the
     official URL, and "learn the basics here" framing.
   - A Mermaid layering diagram (BITS UI → shadcn-svelte → more/extras → our
     custom wrappers → app components) using `<Mermaid chart={...} />`.
   - "When to use which" guidance (don't reinvent primitives; check shadcn-svelte
     → extras → more-shadcn before writing custom).
2. Update `docs/user-guide/overview.mdx`: add a short "UI stack" paragraph +
   link to `/docs/user-guide/ui-stack` (minimal edit, anti-rewrite compliant).
3. Create `docs/user-guide/components/index.mdx`: catalog landing page with a
   table grouped by origin, populated from the provenance manifest. Lists every
   custom/wrapped component with a one-line summary and links.
4. Create per-component pages for the **flagship custom** set first:
   - `components/entity-list-table.mdx` — **migrate** the existing
     `entity-list-table.mdx` content here (move file into `components/`), and
     replace the old top-level file with a short stub that links to the new
     location **OR** keep it in place and only link from the catalog. **Default:
     keep `entity-list-table.mdx` at top level (preserves the existing
     `/docs/user-guide/entity-list-table` URL referenced by overview,
     ui-components, app-shell) and do NOT duplicate; the catalog links to it.**
     → No migration in phase 1 to avoid link churn.
   - New pages: `components/combo-select.mdx`, `components/dynamic-icon.mdx`,
     `components/color-selector.mdx`, `components/avatar-preview.mdx`,
     `components/event-card.mdx`, `components/command-palette.mdx`.
5. Update `_order.json`: insert `ui-stack` after `getting-started`; append the
   new `components/*` slugs before `api-reference`.

### Phase 2 — Remaining per-component pages

One MDX page per remaining custom/wrapped component from the audit, in priority
order: app-shell family (`AppShell`, `AppSidebar`, `AppTopbar`,
`AppPageScaffold`, `AppPageLayout`, `AppPageBreadcrumb`), then `auth/*`, then
the `ui/*` wrappers (password, window, copy-button, dock, wheel-picker,
sortable, timeline, choicebox, spinner, kbd, sonner, color-picker,
button-group, dialog-bordered, rfc-error-dialog, JsonTableViewer,
async-validated-input, text-input, metadata-loading), then `forms/*`,
`sidebar/*`, `toasts/*`, `date-dropper/*`.

Each page follows the `entity-list-table.mdx` shape (frontmatter, purpose,
origin, customization, **multiple usage snippets for different cases** —
default / disabled / loading / custom-renderer etc., one per variant — props
link, next steps). The number of variants per page is dictated by the
component's real usage surface; not every component needs four.

### Phase 3 (optional) — Semi-auto catalog generation

If the hand-maintained catalog becomes a maintenance burden, add
`scripts/generate-component-catalog.mjs` to the FE repo that reads
`component-provenance.json` + sveld `components.json` and emits the catalog
`index.mdx` inside an `<!-- AUTO-GENERATED:catalog -->` block. Wire into
`pnpm extract-docs` or a new `pnpm generate-catalog` script. **Deferred** — only
if phase 1/2 proves the manual approach doesn't scale.

## 6. Per-component page template

```mdx
---
title: ComboSelect
description: Searchable single/multi select built on Popover + Command primitives.
---

# ComboSelect

`src/lib/components/ui/combo-select/combo-select.svelte`

## Purpose
One paragraph: what it does and where it's used.

## Origin
custom | shadcn-svelte | more-shadcn | shadcn-svelte-extras
Source: <link or "fully custom">
Customizations we made: …

## Usage

### Default (single select)
\`\`\`svelte
<ComboSelect
  mode="single"
  bind:value
  options={roles}
  valueField="idp_role"
  labelField="label_key"
  isLabelTranslated
  placeholder={$t('settings.selectRole')}
/>
\`\`\`

### Multi select
\`\`\`svelte
<ComboSelect mode="multi" bind:value={selectedRoles} options={roles} … />
\`\`\`

### Disabled options
\`\`\`svelte
<ComboSelect
  mode="single"
  bind:value
  options={roles}
  isOptionDisabled={(o) => o.idp_role === 'admin'}
/>
\`\`\`

### Custom item rendering
\`\`\`svelte
<ComboSelect mode="single" bind:value options={roles}>
  {#snippet item(option)}
    <span class="flex items-center gap-2">{option.label_key}</span>
  {/snippet}
</ComboSelect>
\`\`\`

## Props
Full prop table: see [API reference — combo-select](/docs/user-guide/api-reference#combo-select).

## Next steps
- [Component catalog](/docs/user-guide/components)
- [UI stack](/docs/user-guide/ui-stack)
```

## 7. Files to create / modify

### Create (FE repo `primebrick-fe-v3`)
- `docs/user-guide/ui-stack.mdx`
- `docs/user-guide/components/index.mdx`
- `docs/user-guide/components/<slug>.mdx` (per phase 1 + 2 list)
- `docs/user-guide/_extracted/component-provenance.json`

### Modify (FE repo)
- `docs/user-guide/_order.json` — add `ui-stack` + `components/*` slugs
- `docs/user-guide/overview.mdx` — add UI-stack paragraph + link (minimal edit)

### No changes required
- `scripts/extract-component-docs.mjs` — unchanged
- `docs/user-guide/api-reference.mdx` — unchanged (still auto-generated by make-docs)
- `primebrick-v3-docs/scripts/sync-repo-docs.mjs` — unchanged (recursive copy + skip `_extracted/`)
- `primebrick-v3-docs/scripts/generate-nav.mjs` — unchanged (nested categories already supported)
- `primebrick-v3-docs/.github/workflows/sync-docs.yml` — unchanged

## 8. How the existing docs-from-code & CI help (summary for the user)

- **sveld extraction** already produces a complete, mechanical prop reference
  (`api-reference.mdx`) for every component. We reuse it as the single source of
  props and **link to it** from each per-component page — no duplication.
- **`_order.json`** already controls sidebar order and supports subdir slugs.
- **`sync-repo-docs.mjs`** already copies `docs/user-guide/**` recursively and
  skips `_extracted/`, so the new `components/` subdir + `ui-stack.mdx` +
  `component-provenance.json` (under `_extracted/`) flow through with no code
  changes.
- **`generate-nav.mjs`** already groups subdir pages into a nested "Components"
  sidebar category.
- **`make-docs` skill** + **`docs-sync-on-close`** rule already refresh
  `api-reference.mdx` on GitFlow close; the new prose pages are edited
  surgically per the anti-rewrite rule.
- **Limit**: sveld extracts props, not **provenance** (which registry a
  component came from). That gap is filled by the hand-maintained
  `component-provenance.json` manifest + the phase-0 audit. This is the only
  genuinely new artifact; everything else reuses existing machinery.

## 9. Acceptance criteria

1. `ui-stack.mdx` documents all 5 libraries with correct versions, repo paths,
   and working official URLs; Mermaid diagram renders via `<Mermaid />`.
2. `overview.mdx` links to `ui-stack` without rewriting existing prose.
3. `component-provenance.json` exists and every entry has an `origin` backed by
   audit evidence (no `unknown` left un-flagged to the user).
4. `components/index.mdx` lists every custom/wrapped component grouped by
   origin, each linking to its per-component page and its `api-reference` anchor.
5. Phase-1 per-component pages exist and each: states origin, shows a runnable
   usage example, links to api-reference for props, follows the template.
6. `_order.json` lists `ui-stack` and all `components/*` slugs in logical order;
   the docs site sidebar shows a nested "Components" category.
7. `pnpm extract-docs` still runs clean; `api-reference.mdx` unchanged in
   structure (still 8 sections, still AUTO-GENERATED).
8. No new files created outside `docs/user-guide/` (FE repo) — respects
   `temp-files.md` and `file-operations.md`.
9. Nothing committed until the user explicitly says to commit (per `AGENTS.md`).

## 10. Out of scope

- Auto-generating per-component prose pages (prose stays AI/human-written).
- Migrating the existing `entity-list-table.mdx` URL (kept at top level in
  phase 1 to avoid link churn; revisit in phase 2 if desired).
- Documenting shadcn-svelte primitives that are used **unmodified** (e.g. plain
  `button`, `card`, `dialog`) beyond a one-line catalog entry — those are
  covered by the official shadcn-svelte docs which `ui-stack.mdx` links to.
- Changes to the docs repo CI or the `make-docs` skill.
- Phase 3 catalog generator (deferred).
- **Live component previews** (Storybook built in docs CI, Storybook on its own
  subdomain, StackBlitz iframes, or Svelte→web-component bridge). Deferred to a
  separate future plan. This plan ships **code snippets only** (multiple
  variants per page, syntax-highlighted via Zudoku's existing `svelte` language
  registration). When preview support is added later, the per-component pages
  already have the variant structure to host iframe/embed tags between the
  existing code snippets.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Provenance audit mis-attributes a component | Require evidence per entry; mark `unknown` and ask the user when unsure; the user explicitly authorized an audit step |
| Per-component pages drift from code | Props are linked to auto-generated `api-reference.mdx`, not duplicated; only prose needs manual sync (covered by `docs-sync-on-close`) |
| URL churn from moving `entity-list-table.mdx` | Default: do NOT move it in phase 1; catalog links to the existing URL |
| Large page count (~40) | Phased rollout; phase 1 ships the flagship set, phase 2 the rest |
| `components/index.mdx` excluded from nav but needed as landing | Per `docs-order.md`, `index` files are category landings, not sidebar items — consistent with existing behavior |
| Code snippets drift from real component API | Snippets are prose and not auto-checked; mitigated by linking props to the auto-generated `api-reference.mdx` (single source of truth) and by the `docs-sync-on-close` anti-rewrite check on GitFlow close |

## 12. Tooling to use during execution

- `read` / `grep` / `find_file_by_name` — component source inspection
- `mcp_call_tool` on **shadcn-svelte-mcp** — verify official shadcn-svelte component APIs
- `mcp_call_tool` on **svelte** — validate Svelte 5 runes usage in examples
- `webfetch` — fetch `shadcn-svelte-extras.com/components/<x>` and
  `more-shadcn.noair.fun/r/<x>.json` for provenance comparison
- `web_search` — resolve exact registry URLs
- `write` / `edit` — create/modify MDX + manifest + `_order.json`
- `pnpm extract-docs` (via `exec`) — refresh sveld JSON if needed; do NOT start
  the dev server (per `dev-server.md`)

---

**Planning complete. I have created the plan file inside your ai-plans folder.
Awaiting approval.** Reply `PROCEED` to begin execution (starting with the
phase-0 provenance audit).
