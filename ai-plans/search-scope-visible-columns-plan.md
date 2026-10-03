# Plan: canonical EntityMeta schema (closed, snake_case) + actions full-vocabulary + search scope = visible columns + DAL search-keys convergence

## Final schema (all decisions consolidated)

```jsonc
// EntityMeta — static meta file shape (*.meta.ts)
{
  "entity": "user_profile",              // REQUIRED
  "translation_key": "user_profile",     // REQUIRED
  "title_key": "system.entities.user_profile.title", // REQUIRED
  "uid": "uuid",                         // REQUIRED
  "display_field": "display_name",       // REQUIRED — canonical column key (first + sticky identity)
  "display_name": "${display_name}",     // OPTIONAL in meta, REQUIRED in response
                                         // assembleMeta defaults to "${" + display_field + "}"
  "actions_overrides": {},               // OPTIONAL — only toggles enabled on route-backed ops

  "columns": [                           // REQUIRED — entity field dictionary (root,
    {                                    //  transversal: table + forms + any page type)
      "key": "display_name",             // REQUIRED
      "label_key": "...",                // REQUIRED
      "type": "text",                    // REQUIRED: text|badge|boolean|color|datetime|number
      "order": 0,                        // REQUIRED — 0..N, deterministic display order
      // table flags (optional):
      "sortable": true, "filterable": true, "searchable": true,
      "default_visible": true, "sticky": true, "hideable": false, "audited": false,
      // form/list tooltip flags (optional):
      "tooltip": "...", "tooltip_priority": "WARNING|HINT", "tooltip_title": "...",
      "show_form_tooltip": true, "show_list_tooltip": true,
      // badge type only:
      "badge": { "values": { "ACTIVE": { "label_key": "...", "color": "emerald-300" } } }
    }
  ],

  "table": {                             // OPTIONAL — only entities with a list/table page
    "default_view": "table",             // table|cards|cards_list
    "default_sort": { "key": "created_at", "dir": "desc" },
    "default_page_size": 25,
    "page_size_options": [10, 25, 50, 100],
    "row_custom_actions": [              // UI config for non-standard row ops
      { "action_name": "change_password", "translation_key": "...",
        "icon": "key-round", "text_color": "", "disabled_when_deleted": true,
        "required_permission": "AUTHENTICATED_ADMIN" }
    ]
  }
}

// EntityMetaResponse = EntityMeta & {
//   display_name: string,              // materialized (never absent)
//   actions: EntityAction[],           // injected by router — full op vocabulary
//   collaboration: {...}               // injected by assembleMeta
// }

// ConfigEntryMeta extends EntityMeta { type_capabilities: TypeCapabilitiesMap }
// meMeta (auth-session) converges into plain EntityMeta — no table, subset of columns.
```

## Rendering order rule

`orderedColumns` = `columns.filter(sticky) → columns.filter(!sticky && !audited) → columns.filter(audited)`, each group sorted by `order`. Column array order in the meta file should match `order` (readability), but `order` wins.

## Actions contract — full vocabulary

`deriveEntityActions` emits every standard op; missing route → `enabled:false`
(explicit). Ops: `list, meta, get, create.single, update.single, delete.single,
restore.single, read.audit, export, delete.bulk, restore.bulk, duplicate.bulk`
+ bare ops from non-standard routes (`change_password`, …).
`actions_overrides[op].enabled === false` → forces disabled on existing route.
Single flag `enabled` = op unavailable → FE hides everywhere.

Note: `"duplicate.single"` in orgs overrides was already a no-op (a
`POST /:uuid/duplicate` route yields bare op `"duplicate"`).

## Removed props (verified dead/redundant)

`sticky_columns`, `auditing_columns` (duplicated column defs → `sticky`/`audited`
flags), `view_visibility` (only `table` view ever configured → flags suffice),
`search_placeholder_key` (same key everywhere → hardcoded in SearchBar),
`enable_create_action` (zero FE consumers), `row_actions` booleans
(= `actions` ops; survives only as `row_custom_actions`).

## BE changes (primebrick-be-v3) — file by file

1. **NEW `src/http/entity-meta.types.ts`** — `EntityMeta`, `TableMeta`,
   `MetaColumn` (full vocabulary above), `ConfigEntryMeta`,
   `EntityMetaResponse`. Closed interfaces, no index signatures.
2. **`src/http/meta-assembler.ts`** — `assembleMeta(meta: EntityMeta, …)`;
   materialize `display_name ?? \`\${${meta.display_field}}\``.
3. **`src/http/entity-actions.ts`** — `STANDARD_OPS` constant; emit
   `enabled:false` for route-missing ops.
4. **7 meta files** → canonical shape (`: EntityMeta`/`ConfigEntryMeta`):
   `user-profiles`, `organizations`, `role-mappings`, `config-entries`,
   `customers`, `ai_models`, `ai_cerebellum`. Per-entity values:
   - user_profile: `display_field: "display_name"`; display_name col
     `order:0, sticky, hideable:false`; `idp_code` `default_visible:false`;
     `roles` `searchable:false`; audit cols `audited:true`.
   - organization: same pattern; `idp_code` hidden.
   - role_mapping: `display_field: "idp_role"`.
   - config_entry: `ConfigEntryMeta`; `display_field` = main col.
   - customers/ai_*: `display_field` primary col; `default_view` → `table.*`;
     `*_STICKY/AUDITING_COLUMN_KEYS` constants → column flags.
5. **6 routers** — `meta.list.actions_overrides` → `meta.actions_overrides`;
   meta response typed `EntityMetaResponse`.
6. **`auth-session.router.ts`** — `meMeta: EntityMeta` (drop `list` wrapper,
   `audited` flags, add `display_field`; `display_name` auto-defaults).
7. **DAL search-keys** — `organizations_dal`, `user-profiles-dal`,
   `role-mapping-repo`: replace hardcoded arrays with
   `meta.columns.filter(c => c.searchable !== false && c.type === "text")`
   ∩ entity dbType ∈ {varchar,text,uuid}. Shared helper
   (`src/lib/search-keys.ts`); reuse for `*_SEARCHABLE_KEYS` list-configs.
8. **`rbac-convention.test.ts`** — update expectations for full vocabulary.

## FE changes (primebrick-fe-v3) — file by file

9. **`src/lib/entity-list/types.ts`** — `EntityListMeta`→`EntityMeta`, full
   snake_case shape; `orderedColumnsFromListMeta` → `orderedColumns(meta)`
   flag-based; `defaultVisibleColumnKeys`/`sanitizeVisibleKeys` → flags only
   (no view_visibility).
10. **`src/lib/composables/useEntityMetadata.svelte.ts`** — local
    `EntityMetadata` → `EntityMeta`; guardrail check `data.list.auditingColumns`
    → `data.columns` presence.
11. **`src/lib/utils/entity-meta.ts`** — `resolvePageTitle` reads
    `meta.display_name`; `getColMeta` reads `meta.columns` (root).
12. **`EntityListTable.svelte` + children** — props re-sourced:
    `entityRowActions` ← `meta.table.row_custom_actions`; drop `viewVisibility`
    and `searchPlaceholderKey` props; `stickyColumnsGroup` derived from flags;
    `effectiveRowActions` booleans removed → pure `opAllowed()` + custom_actions
    permission filter.
13. **`SearchBar.svelte`** — hardcoded `system.entities.list.searchPlaceholder`.
14. **Pages**: `customers`, `organizations`, `roles`, `users` `+page.svelte`
    + `[uuid]`/`create`/`profile` pages — `meta.list.*` → `meta.table.*`,
    `translationKey`→`translation_key`, `titleKey`→`title_key`, `uid`
    unchanged, `labelKey`→`label_key`, `defaultVisible`→`default_visible`,
    etc.; `viewMode` init `meta?.table?.default_view ?? 'table'`.
15. **`FormPageLayout.svelte`, `BulkActionsToolbar.svelte`,
    `useSheetPanels.svelte.ts`, `permissions.svelte.ts`** — field renames.
16. **`api-types.ts` / `useTypeCapabilities`** — `type_capabilities` unchanged
    (already snake); type updated if it referenced list shape.
17. **Effective search keys** — scope null → `search_in = visibleKeys ∩
    searchable text cols`; explicit scope wins verbatim. Shared
    `computeSearchInKeys` helper used by all 4 list pages.

## Docs

18. `.devin/rules/` (BE+FE) + `docs/user-guide/` — entity meta anatomy: root
    fields, `columns` dictionary (table+form flags), `table.*` options,
    `actions` derivation + `actions_overrides` semantics,
    `display_field` vs `display_name`, `collaboration`, closed schema,
    `order` semantics.

## Acceptance criteria

- `tsc` fails on any meta missing `display_field`/`order` or with undeclared props.
- `meta.actions` lists all standard ops; missing routes → `enabled:false`.
- `/users` & orgs: first column `display_name` (sticky, not hideable);
  `uuid`, `idp_code` hidden but selectable.
- Search "all fields": uuid matched only when column shown; explicit scope wins.
- `roles` (jsonb) never searched → no PG error.
- meMeta still serves profile form (tooltips intact).
- `pnpm run check` (FE) + `tsc` (BE) clean; zero camelCase meta readers left
  (`translationKey|titleKey|updatePageTitle|defaultView|defaultVisible|
  labelKey|rowActions|actions_overrides` grep → only types/history).

## Documentation deliverables (agent + user)

### Agent docs (`.devin/rules/` + `AGENTS.md`)

**`primebrick-be-v3/.devin/rules/entity-meta-schema.md`** (new):
- Full canonical schema anatomy (root/table/columns, required vs optional,
  response-only fields) with the JSON blueprint
- `EntityMeta`/`TableMeta`/`MetaColumn`/`ConfigEntryMeta`/`EntityMetaResponse`
  type map — where defined, how metas are annotated, closed-schema rule
- `display_field` vs `display_name` semantics + assembleMeta defaulting
- `actions` derivation rules: STANDARD_OPS vocabulary, route→op mapping,
  enabled=false for missing routes, actions_overrides can only toggle enabled
- Column `order` semantics: sticky→normal→audited groups, order wins
- Search-keys derivation rule: searchable∩text∩dbType(varchar|text|uuid)
- Rule: "never add props outside the type — extend the type first"

**`primebrick-fe-v3/.devin/rules/entity-meta-schema.md`** (new):
- Mirror anatomy (FE consumer view), `meta.table.*` paths, `meta.columns`
  flag semantics, `opAllowed()` as sole gating mechanism
- Search scope contract: visible∩searchable default, explicit scope wins
- Code examples: reading meta in a page, `resolvePageTitle`,
  `computeSearchInKeys`, `orderedColumns`

**AGENTS.md** (both repos): one-line pointer to the new rules.

### User docs (`docs/user-guide/`)

**`entity-metadata.mdx`** (new, BE repo): "Entity metadata contract" —
- What meta is, where it comes from (`GET /api/v1/entities/{entity}/meta`,
  derived `actions`, runtime `collaboration`)
- Full anatomy table: every prop, path, required/optional, effect
- `table.*` options sheet, `columns` props sheet (table flags vs form
  tooltips vs badge values)
- `display_field`/`display_name` examples (incl. `${first_name} ${last_name}`)
- `actions`/`actions_overrides`: what ops exist, how enablement works,
  why missing routes appear as enabled:false
- Worked example: annotated user_profile meta JSON end-to-end
- Mermaid: meta file → assembleMeta → deriveEntityActions → response → FE

**`api-conventions.mdx`** (BE repo): add meta endpoint contract section +
link; update bulk/verbs section unchanged.

**FE user-guide** (if an entity-list page exists there): update prop names
snake_case + `table.*` paths; otherwise note in entity-metadata.mdx.
