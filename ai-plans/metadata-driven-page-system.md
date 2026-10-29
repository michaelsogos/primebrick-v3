# Metadata-Driven Page System — Page Types, Route Meta & Module Pages

> Continuation of `dynamic-form-pages-pre-plan.md` — expands scope from form pages
> to the full page-type system (table, list, form, kanban, timeline, custom),
> route-level page metadata, and module-provided pages.
> Related plans: `collaboration-visual-merge.md` (DRAFT — presence/merge UI),
> `module-installation-process.md` (module manifest), `be-endpoint-anatomy-taxonomy-standard.md`
> (endpoint taxonomy + deferred module-route moves).
> Hard dependency surfaced: `entity-validation-autoderive.md` — referenced by
> `entity-type-contract.md` task 18 and `db-migration-engine.md`, **but the file
> does not exist yet**. Writing it (or folding it into this plan) is a blocker
> for the Form page type.
> Sub-plans: `table-pages-merge.md` — detail plan for tasks 5, 6, 17
> (merge the 5 EntityListTable pages into `EntityListPage` without losing
> capability) + module page delivery mechanism incl. the jobs pilot
> (remote-chunk spike verified in a real browser 2026-10-19).
> `form-pages-anatomy-audit.md` — empirical audit of EVERY form surface
> (host + remote + sheets) delivering the P0 evidence base for tasks 2–3:
> widget/validation/label-wiring conformance matrix, remote capability gap
> (input family not in `@primebrick/ui`), page-vs-sheet + ESPANDI analysis,
> and the derived `FormMeta` field requirements (2026-10-27).
> `entity-form-archetype-pilot.md` — corrected domain model + pilot cut:
> form layout lives in `page_props.form` (page domain), NOT `EntityMeta.form`;
> served columns gain class-derived constraints via `withColumnConstraints`;
> `events.emits` module declaration feeds subject pickers; pilot =
> `/system/job/rules/create` host-rendered, `RuleFormPage.svelte` deleted.

## Status: ⚪ TODO — Plan date: 2026-10-19 00:12 UTC / 02:12 CEST · updated 2026-10-23

> **Drift reconciliation 2026-10-28:** parts of this plan already landed via
> `entity-form-archetype-pilot.md`, `root-page-skeleton.md` and the package
> extractions — task 1 (`PageRouteDeclaration` + `description_key` + `chrome`,
> rename to `Declaration`) done; task 2 (`withColumnConstraints`, authored
> props, `page_props.form` domain model) done per pilot; task 8
> (`EntityFormPage` renderer) done for the create-pilot — full field/widget
> coverage per `form-pages-anatomy-audit.md` still open; tasks 26–27
> (`@primebrick/core`, `@primebrick/ui`) shipped; task 20 (nav decls via
> `service.register` → census) live. **Presence status corrected:** task 15
> note "BE is 100% implemented; FE has zero consumers" is accurate —
> `collaboration-visual-merge.md` backend (DAL lock, SDK presence, BE module +
> meta inject + audit hook) landed; FE side (F10–F13: `usePresenceChannel`,
> `useCollaborativeForm`, `PresenceAvatars`, `CollaborationPanel`) is the open
> dependency for tasks 15–16 here. Inverse: `docs-generation-per-service-split`
> task 5 is blocked on this plan's form-meta maturity; `page-chrome-enforcement.spec.ts`
> now pins the mandatory-header contract for whatever dispatches pages (task 21).
>
> **Standing rule (user, 2026-10-28):** for EVERY page archetype designed or
> migrated under this plan, the question MUST be asked: *"how do we render
> the collaboration feature?"* — presence avatars + channel are defined for
> update surfaces only (`collaboration-visual-merge` §6.4/§6.6); create gets
> nothing; list/kanban/timeline/custom each need an explicit answer in their
> task row — never default to "same as forms".

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Extend `ModuleRouteDecl` → `PageRouteDeclaration` (`page_type`, `entity`, `page_props`, `component_key`) in BE `module-nav-types.ts` + FE mirror | ⏳ not done | — | vocabulary already exists: `kind: list\|detail\|create\|page`; also rename `ModuleRouteDecl` → `ModuleRouteDeclaration` — no `Decl` abbreviations |
| 2 | Extend `MetaColumn` with derived constraint props (`nullable`, `max_length`, `pg_type` via dal `withColumnConstraints`) + authored props (`format` closed vocab, `pattern`, `secret`, `json_schema`); `page_props.form` = `FormPageDecl`/`FormFieldPlacement` (page-domain layout) — NOT `EntityMeta.form`; `kanban`/`timeline` remain EntityMeta sections when they arrive | ⏳ not done | — | corrected model in `entity-form-archetype-pilot.md` §B/§D/§E; pilot = job_rule create |
| 3 | Validation: `format`/`pattern`/constraint props on `MetaColumn` → `buildEntityFormSchema` (mirrors `buildConfigValueSchema`); cross-field rules via `page_props.form.validators` closed vocab — NOT serialized zod | ⏳ not done | — | absorbs `entity-validation-autoderive.md` scope; `buildConfigValueSchema` is the shipped Path-C precedent |
| 4 | Build `PageRouteDeclaration` → component dispatch: `PAGE_REGISTRY: Record<PageType, Component>` (SheetHost pattern) + `useEntityPage(decl)` driver composable | ⏳ not done | — | driver = `useEntityMetadata` + `useEntityList` + `usePresence` + `useSyncChannel` |
| 5 | Consolidate the ~500–700 duplicated lines in the 5 EntityListTable pages onto `useEntityList` (already exists, only adopted by jobs) | ⏳ not done | — | prerequisite refactor for `PageType.Table` |
| 6 | `PageType.Table` generic page (`EntityListPage`): `{ entity }` → full meta-driven page incl. `table.default_view` sub-view (table/cards/cards_list) | ⏳ not done | — | collapses table pages to near-zero code |
| 7 | Extract `AuditBar` standalone component out of `FormPageLayout` (lines ~68–195) so the footer is composable per page type | ⏳ not done | — | audit footer is currently baked into FormPageLayout |
| 8 | `PageType.Form` (`EntityFormPage`): dynamic form renderer on superforms+formsnap, fields/layout/sections from `meta.form`, 2-col grid positions from field decls, audit bar + CTAs by design | ⏳ not done | — | Path C hybrid: generated zod base + `superRefine` for cross-field/dynamic rules |
| 9 | `PageType.List` unified list archetype: options for toolbar/search/pagination off-on, custom row renderer, sectioned multi-list (`sections: ListSpec[]`), optional footer CTA zone | ⏳ not done | — | must cover ai/migrations/modules/email-providers/docs-index divergences; `ConfigList` stays a separate archetype or becomes a `ListSpec` preset |
| 10 | Kanban spike: `@svar-ui/svelte-kanban@2.6.0` (MIT, peer svelte ^5.54.0 — we run 5.56.4) vs in-house on `@thisux/sveltednd@0.8.0`/`svelte-dnd-action@0.9.80` — validate theming with our Tailwind tokens | ⏳ not done | — | versions verified via `pnpm view` 2026-10-19 |
| 11 | `PageType.Kanban` (`EntityKanbanPage`): `meta.kanban` field mapping (status/badge col → columns, title, desc short/long, tags); drag = PATCH status field, optimistic + rollback | ⏳ not done | — | first real page: `/crm/pipeline` (today a placeholder stub) |
| 12 | Timeline spike: `@svar-ui/svelte-gantt@2.8.1` (MIT) vs lighter alternative — validate read-only rendering from entity rows | ⏳ not done | — | gantt-like horizontal bars; `ui/timeline` (vertical, presentational) is a different component |
| 13 | `PageType.Timeline` (`EntityTimelinePage`): `meta.timeline` mapping (start/end datetime, row/dimension, title, metric, color) | ⏳ not done | — | read-only v1; draggable bars deferred |
| 14 | `PageType.Custom`: `component_key` → FE component registry; custom pages stay static routes in core FE, declared in census | ⏳ not done | — | my proposal — awaiting user's own idea before deciding |
| 15 | `usePresence(entity, uuid)` composable consuming `meta.collaboration` — SSE `presence/events`, READING/EDITING/LEAVE/HEARTBEAT signals, `PresenceAvatars` in form-page `headerExtras` | ⏳ not done | — | BE is 100% implemented; FE has zero consumers today; the generated page shells make this free for every dynamic page |
| 16 | Central write-path handling of collab contracts: `version` optimistic locking + `ERR01`/`ERR02`/`ERR03` → conflict/merge UI hooks in `EntityFormPage` | ⏳ not done | — | per `collaboration-visual-merge.md`; `CollaborationPanel` sheet id reserved |
| 17 | Migrate the 5 core table pages (users, customers, organizations, roles, clients) to `EntityListPage` | ⏳ not done | — | pure dedup, can go first — biggest LOC win |
| 18 | Migrate standard form pages (profile, users/create+[uuid], organizations create+[uuid], clients create+[uuid], configurations/create) to `EntityFormPage`, entity by entity | ⏳ not done | — | roles create/[uuid] (non-standard manual forms) assessed separately |
| 19 | Migrate AI-module-owned pages (settings/ai, docs-index, jobs, email-providers, migrations, templates, translations) out of hardcoded settings module → declared pages of their owning service | ⏳ not done | — | requires task 20 transport; `ENTITY_SERVICE_MAP` hardcoding must become census-driven `service_code` |
| 20 | Module page self-description: extend `ServiceRegisterPayload`/`service_registry.endpoints` with `nav` + `pages` decls; `RoutesCensusService` aggregates them; BE `module-nav-meta.ts` remains fallback (documented placeholder intent) | ⏳ not done | — | the register-payload channel already exists, unused for nav today |
| 21 | Dynamic route realization: `(app)` catch-all resolving `PageRouteDeclaration` via census → `PageRenderer` dispatch; static routes keep precedence | ⏳ not done | — | `docs/[...path]` is the only catch-all today; must not shadow login/mcp/welcome or static pages |
| 22 | Meta caching: replace `globalThis` no-TTL cache in `useEntityMetadata` with ETag/localStorage strategy | ⏳ not done | — | deferred Phase-2 item in `cache-invalidation-etag-plan.md` — becomes load-bearing with generated pages |
| 23 | Census↔implementation consistency check (build/test): declared `entity` routes must resolve a live `/meta`; catches drift like the `templates` mock declaring `entity: 'template'` | ⏳ not done | — | silent drift already observed once |
| 24 | Decide presence transport for `/ws/` entities (BE-only presence today — module entities have none) | ⏳ not done | — | open design question; gateway proxy vs per-service implementation |
| 25 | Update rules + docs: `entity-meta-schema.md` (new sections), `entity-list-pages.md` (page-type policy), `docs/dev-guide/entity-metadata.mdx`, `patterns.md`, ai-plans cross-refs; write `entity-validation-autoderive.md` or mark absorbed | ⏳ not done | — | closed-schema rule: extend types first, then consume |
| 26 | Create `@primebrick/core` package — env-agnostic shared code (EntityMeta family, `PageRouteDeclaration`/`ModuleRouteDeclaration`, presence types, config vocab + validators, write envelope, STANDARD_OPS/permission/sentinel constants, RFC7807, snake_case helpers) | ⏳ partial | — | kills the 3-copy EntityMeta (BE/FE/job.meta.ts) + mirrored validators — Part I |
| 27 | Create `@primebrick/ui` package (`@sveltejs/package`): components, composables, non-rune utils, `ModulePageHost` + `mountPage` helper + base stylesheet | ⏳ partial | — | FE + module `fe/` sources consume it identically — Part I |
| 28 | Extraction waves + publish wiring (GitFlow release → npm, same train as dal/sdk): types→core first, validators/helpers→core, components/composables→ui as they stabilize | ⏳ not done | — | EntityListPage + useEntityList are the first ui citizens (jobs remote pilot consumes them) |
| 29 | Entity-sync channels v2 — **decision A+B taken 2026-10-19**: structured local BroadcastChannel + unified `useEntitySync` surface; **extract a dedicated sub-plan from Part J** | ⏳ not done | — | Part J; replaces per-family `useSyncChannel` names; collaboration SSE plugs into same surface later |
| 30 | `EntityAction.endpoint` extension (BE+FE closed-schema): emit method+path per op from the route scan incl. `metaExtraScans` → FE write dispatch uses declared endpoints | ⏳ not done | — | discovered 2026-10-19 — fixes latent users-page 404 (writes under `/api/v1/auth/users`); kills `ENTITY_SERVICE_MAP`; entity-level meta — Part J |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Empirical findings (verified 2026-10-19)

### A.1 The "facade" — a naming correction

The routes compiled at runtime are **not** a FE facade (zero `facade` matches in
`primebrick-fe-v3/src`). Two different runtime mechanisms exist:

1. **BE route table**: `makeEntityRouter(config)` in `primebrick-be-v3/src/http/entity-router.ts`
   compiles the canonical CRUD+meta route set at boot from `*.meta.ts` +
   permissions; `assembleMeta` (`src/http/meta-assembler.ts`) injects
   `display_name` + `collaboration` into every `/meta` response;
   `deriveEntityActions` (`entity-actions.ts`) emits the full op vocabulary
   with `enabled:false` for absent routes. A twin lives in the SDK for
   microservices (`primebrick-v3-sdk/src/http/entity-router.ts`).
2. **Module nav + route census**: `module-nav-meta.ts` (static `MODULE_NAV`
   registry, documented placeholder) → `GET /api/v1/modules/:code/meta`,
   `GET /api/v1/system/routes` (`RoutesCensusService`, 30s cache). Powers
   sidebar, `resolveModuleFromRoute` (route_prefixes matching), per-module i18n
   dicts, `safe-home`, AI `search_routes`, generated `navigation-map.mdx`.

**What is NOT dynamic today**: every FE page is a static `+page.svelte`; the only
catch-all is `docs/[...path]`; there is no `export const meta`, no route registry,
no page-component dispatch (only `SheetHost`'s `Record<SheetPanelId, Component>`).

So the goal reframes to: **make the census's `ModuleRouteDecl` generative** —
declared pages resolve a renderer instead of a hand-authored file.

### A.2 EntityMeta — mature, closed, already transversal

`EntityMeta` (BE `src/http/entity-meta.types.ts`, FE mirror
`src/lib/entity-list/types.ts`) is a closed schema: root `columns` is explicitly
documented as the field dictionary **shared by ALL page types** (docs/dev-guide/
entity-metadata.mdx), `table` is an optional section (absent on form-only metas),
`actions`/`collaboration` are runtime-injected. Extension path is established:
extend BE + FE types first (`ConfigEntryMeta extends EntityMeta` adds
`type_capabilities` — the capability-matrix precedent).

`MetaColumn` already carries form-relevant props: `tooltip`, `tooltip_priority`,
`tooltip_title`, `show_form_tooltip`, `show_list_tooltip`, `audited`, `badge`
(enum→column mapping for kanban!), `datetime_iana_toggle`.
`PrimeField` already accepts a `MetaColumn` for tooltips — the form-schema hook
is half-seeded.

### A.3 Page inventory (35 routes, verified)

| Archetype | Count | Pages |
|---|---|---|
| Entity table (`EntityListTable`) | 5 (+4 sub-tables on jobs) | users, customers, organizations, roles, clients |
| Config list (`ConfigList`) | 1 | configurations |
| Form (superforms) | 8 standard + 3 non-standard | profile, users create/[uuid], organizations create/[uuid], clients create/[uuid], configurations/create (+ roles create/[uuid], modules/[code] mixed) |
| Custom list (not ELT/ConfigList) | 8 | jobs, migrations, ai, docs-index, email-providers, modules, templates, translations |
| Custom / bespoke | 8 | home(empty), crm/pipeline(stub), docs/[...path], credentials, customers/new(stub), login, mcp/consent, welcome |
| Redirects | 2 | /system, /system/settings |

### A.4 Duplication pain points (quantified)

- Each EntityListTable page re-implements **~500–700 lines**: meta fetch with
  `globalThis` cache+in-flight, `ApiListError`, abort handling, `loadRows`,
  sessionStorage persistence, debounced search, ~60-prop wiring. `useEntityList`
  already consolidates all of this — adopted only by jobs pages.
- Form pages duplicate: zod schema (literal FE/BE duplication found —
  `src/lib/validation/display-name.ts` vs BE `src/modules/auth/validation.ts`),
  the same superforms SPA recipe, `useFormGuard`, `useUnsavedChangesGuard`,
  hardcoded `grid-cols-2` field placement.
- The footer CTA strip (`bg-muted/50 border-t p-4`) is hand-cloned in
  `modules` and `docs-index`; the audit footer is baked into `FormPageLayout`
  (no standalone `AuditBar` exists).
- `ENTITY_SERVICE_MAP` (`api.ts:41-49`) hardcodes `ai_model|ai_cerebellum → ai`;
  entity→service ownership should come from census `service_code`.
- Drift already happened: `templates` declares `entity: 'template'` in census
  but renders a static mock.

### A.5 Collaboration state — BE done, FE absent

BE: complete (`collaboration.router.ts` — presence POST/GET/SSE `events`,
Redis presence store, NATS bus bridge, keyspace-expiry LEAVE, `/audit/:id`
field deltas, `ERR01`/`ERR02`/`ERR03`; SDK `presence/` contract;
`EntityAuditPort` change markers). `collaboration.enabled` is auto-derived from
`@AuditTrail()` via `assembleMeta`.
FE: **only the `CollaborationMeta` type exists — zero consumers.** No presence
UI, no `usePresence`, no calls to `/presence`. `createSseConnection` is the
ready-made transport seam. `collaboration-visual-merge.md` (DRAFT) prescribes
`PresenceAvatars` in `FormPageLayout.headerExtras` + `CollaborationPanel` sheet.
**Implication**: implementing presence inside the generated page shells delivers
it once, for every dynamic page — the page system is the delivery vehicle, not
a risk to preserve.

### A.6 Module pages today

"Module-provided pages" today = static FE routes under the settings nav calling
`/ws/<svc>` (ai, docs-index, jobs→`job`, email-providers→`emailsender`,
migrations→per-service, templates, translations). The microservice has zero say
in nav/routes; `module-nav-meta.ts` is an acknowledged placeholder until
services self-describe via `service_registry.endpoints` jsonb — the channel
exists (`ServiceRegisterPayload.endpoints`, populated at `service.register`)
but nothing reads it for nav. Entity *APIs* already self-register: gateway
`discoverEntitiesFromService` parses each service's `/api/v1/openapi.json`
(MCP tool registry). Entity metas are already served via `/ws/:svc/entities/:e/meta`.

---

## Part B — Target architecture

### B.1 Three metadata layers (separation of concerns)

| Layer | Lives in | Answers | Transport |
|---|---|---|---|
| **Entity metadata** | BE `*.meta.ts` → `EntityMeta` | what the entity is, who can do what, field dictionary, per-page-type data sections (`table`, `form`, `kanban`, `timeline`) | `GET /entities/:e/meta` (incl. `/ws/`) |
| **Page declaration** | `ModuleRouteDecl` → `PageRouteDeclaration` | which page type renders which route, entity binding, per-page overrides | `GET /system/routes` census + `/modules/:code/meta` |
| **Module manifest** | `service_registry.endpoints` / future `module.json` | which pages/nav a module contributes | `service.register` payload → registry → census |

This matches the pre-plan's two-layer model (Form Schema + Entity Metadata) and
adds the route layer the user asked for (point 3): **the route's page decl is
the main per-page configuration point** — it selects the renderer and may carry
`page_props` overrides without touching entity metadata.

### B.2 PageRouteDeclaration — route-level page metadata (extends `ModuleRouteDecl`)

```ts
// be-v3/src/modules/module-nav-types.ts (+ FE mirror in api-types.ts)
export type PageType = 'table' | 'list' | 'form' | 'kanban' | 'timeline' | 'custom';

export type PageRouteDeclaration = {
  route: string;                       // existing convention, incl. [uuid]/[code]
  page_type: PageType;                 // replaces kind as the renderer selector
  entity?: string;                     // bound CRUD entity (meta source)
  label_key?: string;
  form_mode?: 'create' | 'edit';       // form only
  component_key?: string;              // custom only → FE registry id
  page_props?: Record<string, unknown>;// per-page overrides (validated per type)
};
```

Migration of the existing `kind` vocabulary: `list` → `table` (+`entity`),
`detail|create` → `form` (+`form_mode`), `page` → `custom` (+`component_key`).
Keep `kind` readable during transition or hard-cut — decision at implementation.

### B.3 EntityMeta — per-page-type sections (closed-schema extension)

Root `columns` stays the single field dictionary. New optional siblings of `table`:

```ts
type EntityMeta = {
  /* ...existing fields... */
  table?: TableMeta;
  form?: FormMeta;          // absent → no generated form for this entity
  kanban?: KanbanMeta;
  timeline?: TimelineMeta;
};

type FormMeta = {
  layouts: { create?: FormLayout; edit?: FormLayout };  // edit defaults to create
  validation?: FormValidationDecl;   // cross-field rules (superRefine material)
};

type FormLayout = {
  columns: 1 | 2;                      // default 2 per current anatomy
  sections: FormSection[];             // ordered; unnamed section = flat grid
};

type FormSection = {
  key: string;
  title_key?: string;                  // rendered section header when present
  fields: FormFieldDecl[];
};

type FormFieldDecl = {
  key: string;                         // → MetaColumn key (labels/tooltips/type reuse)
  col?: 1 | 2;                         // column placement in the 2-col grid
  span?: 1 | 2;                        // full-width rows allowed
  widget?: string;                     // widget registry key; default from column.type
  required?: boolean;
  readonly?: boolean;
  visible_if?: { field: string; equals: unknown };   // conditional visibility v1
  default_value?: unknown;
  validation?: FieldValidationDecl;    // promoted type_config.validation vocabulary
};

type KanbanMeta = {
  status_field: string;     // → MetaColumn with badge.values = board columns
  title_field: string;
  desc_short_field?: string;
  desc_long_field?: string;
  tags_field?: string;
  order_field?: string;     // manual ordering persistence (optional v1)
};

type TimelineMeta = {
  start_field: string;      // datetime
  end_field?: string;       // absent → point-in-time items
  row_field?: string;       // group-by dimension (swimlane rows)
  title_field: string;
  metric_field?: string;    // progress fill
  color_field?: string;     // badge color field
};
```

Validation: promote the proven `type_config.validation` shape (`required`,
`required_error_label_key`, `unsigned`, `rules.{min,max,url,email,regex}`) —
already mirrored FE (`src/lib/validation/config-validation.ts` builds zod) ↔
SDK (`config-validator.ts`). Generalize it onto `MetaColumn.validation` and
`FormMeta.validation` (cross-field: `match`, `required_if`, custom rule keys).
**Path C from the pre-plan**: FE builds a real zod object schema from field
decls once per (entity, mode); `superRefine` covers cross-field and
DB-sourced dynamic rules. No runtime zod-per-keystroke; no serialized schemas
over the wire.

### B.4 FE dispatch — registry + driver

```
census PageRouteDeclaration ──► resolvePageRouteDeclaration(pathname) ──► PAGE_REGISTRY[page_type]
                                                      │
        ┌──────────────┬──────────┬──────────┬────────┴───────┬──────────────┐
   EntityListPage  EntityFormPage EntityList* EntityKanban  EntityTimeline  CustomPage
     (table/        (dynamic      (config-    Page           Page           (registry
      cards/         form)         style)                                    component)
      cards_list)
```

- `PAGE_REGISTRY: Record<PageType, Component>` — SheetHost pattern (the only
  existing dispatch precedent in the codebase).
- `useEntityPage(decl)` — single driver composable: `useEntityMetadata` →
  `useEntityList` (data pages) → `usePresence` (when `meta.collaboration.enabled`)
  → `useSyncChannel` (`primebrick_<entity>_sync` popup refresh) →
  `claimDocsContext({entity, mode: page_type})` (the embryonic mode field becomes
  the real page-type signal).
- Route realization: a `(app)`-level catch-all resolves `PageRouteDeclaration` via census
  and renders `PageRenderer`. Static routes keep precedence during migration —
  catch-all only serves declared pages with no static file. `route_prefixes`
  keep driving module selection + i18n dict loading unchanged.
- Breadcrumbs keep the existing helpers; generated pages get
  `moduleMenuSegment` + `label_key` resolution from the decl.

---

## Part C — Per-type design notes

### C.1 Table (`EntityListPage`)
`useEntityPage` + `EntityListTable`, `meta.table.default_view` continues to pick
the sub-view (`table|cards|cards_list` — the user's "tabella by default, domani
card list" is already a shipped mechanism). `page_props` can override
`default_view`, `page_size`, `fixed_filters` (jobs-style), `toolbar` toggles.
Target: a table route becomes `{ route, page_type: 'table', entity: 'user_profile' }` — zero Svelte.

### C.2 List (`EntityListViewPage` / config-style)
Unify the 8 custom-list pages into one archetype with options:
`sections: ListSpec[]` (multi-list dashboards: jobs, migrations, docs-index),
`row_renderer` snippet registry key (ai cards, module cards), `toolbar`,
`search`, `pagination`, `footer` CTA zone (extracted from FormPageLayout/footer
clones). `ConfigList` remains the type-driven-input specialization — evaluate
making it a `ListSpec` preset rather than a fourth list system.
**Design work required**: read the 8 pages, extract the common denominator
(scaffold + Toolbar + right CTAs + DeleteDialog/MfaStepUpDialog + watermark
states already shared) and codify the options matrix. jobs/migrations/docs-index
may stay `custom` if `sections` over-generalizes — decide per page.

### C.3 Form (`EntityFormPage`)
- Shell: `FormPageLayout` anatomy by design — 2-col grid, footer = `AuditBar`
  (extracted) + `footerActions` (Cancel/Save), `useFormGuard` +
  `useUnsavedChangesGuard` preserved, SPA `superForm` + `apiFetch` PUT/POST,
  `{entity, translations?}` write envelope, `version` locking.
- Fields: `meta.form.layouts[mode]` → sections → `FormFieldDecl` grid placement
  (`col`, `span`, `order` implied by array order). Widget resolution:
  `widget` decl → widget registry (`Record<string, Component>` — Switch,
  ComboSelect, DateWheelPicker, Password.Input, ConfigValueInput,
  AsyncValidatedInput, TypeConfigBuilder…) → fallback by `MetaColumn.type`.
  Labels/tooltips/errors come from the same `MetaColumn` (`label_key`,
  `tooltip*`, `show_form_tooltip`) — no duplication.
- Validation: `buildEntityFormSchema(meta, mode)` — zod object from field decls
  + `superRefine` cross-field rules; `validationMethod:'oninput'`, same recipe
  as today.
- Escape hatches: `page_props.slots` (e.g. avatar header block, roles tab) and
  `custom_actions` for entity-specific extras (AsyncValidatedInput
  check-availability, key-rotation section). Anything non-generalizable stays a
  `custom` page — the archetype must not absorb every bespoke block.

### C.4 Kanban (`EntityKanbanPage`)
`meta.kanban.status_field` must resolve to a `MetaColumn` with `badge.values`
(existing enum→label/color map) → board columns. Cards render
title/desc/tags/badge colors from mapped fields. Drag → PATCH `{entity:{[status_field]: v}, version}` with optimistic update + rollback on error;
`meta.actions` gates create/edit/move CTAs the same way (`update.single` absent
→ read-only board). First page: `/crm/pipeline` (currently a stub — perfect
clean adoption).

### C.5 Timeline (`EntityTimelinePage`)
Gantt-like horizontal bars: `meta.timeline.start_field`/`end_field` (datetime —
`datetime_iana_toggle` convention reusable), `row_field` groups into swimlanes
("matrice/dimensione"), `title_field` labels bars, `metric_field` fills progress,
`color_field` tints. Read-only v1 (click → detail sheet via `useSheetPanels`);
drag-reschedule = deferred v2 (needs duration/partial-update semantics).

### C.6 Custom (`PageRouteDeclaration.component_key`)
My proposal (user's own idea pending): custom pages remain **static FE
artifacts** — a `CUSTOM_PAGE_REGISTRY: Record<string, Component>` in core FE,
routes declared in census with `component_key`. This covers
login/welcome/mcp/consent (no shell), docs browser, credentials, dashboards —
full fidelity, zero remote-code risk, no Svelte serialization fantasy.
For *module* custom pages: **remote ESM chunks are now validated** — vite lib
mode → self-contained chunk → `import(/* @vite-ignore */)` → self-mount via
`mountPage(el, ctx)` (spike verified in-browser; see `table-pages-merge.md`
Part I). Served same-origin via the existing verbatim `/ws/<code>` proxy, or
deposited by the `.pbm` installer. Descriptor-composed pages remain preferred
whenever an archetype suffices; remote chunks are the escape hatch.

---

## Part D — Collaboration preservation (and delivery)

The page system *carries* collaboration rather than competing with it:

1. `useEntityPage` reads `meta.collaboration.enabled`; when true, generated
   detail/form pages auto-attach `usePresence(entity, uuid)` (keyed off route
   params) — SSE `presence/events` via `createSseConnection`, READING on mount,
   EDITING per focused field (`expose_editing_value` honored), HEARTBEAT 15s,
   LEAVE on unload.
2. `PresenceAvatars` rendered in the form page's `headerExtras` — the exact
   injection point `collaboration-visual-merge.md` prescribes.
3. Write path: `EntityFormPage` always sends `version`; `ERR01` (409) →
   conflict UI → `/audit/:auditLogId` delta fetch → `CollaborationPanel` sheet;
   `ERR02`/`ERR03` mapped to existing notification channel.
4. Known gap to decide: presence endpoints exist only on BE `/api/v1/entities/*`
   — `/ws/` entities have no transport. Options: gateway-proxied presence vs
   per-service implementation via SDK port (contract already exists).

---

## Part E — Module-provided pages

Phased, matching what the infra already supports:

- **Phase E1 (now)**: all pages declared in BE `module-nav-meta.ts` `PageRouteDeclaration`s —
  including pages owned by ai/job/emailsender modules. Their *declaration*
  moves to the owning module entry; implementation stays FE (registry/generic
  renderers). `ENTITY_SERVICE_MAP` replaced by `service_code` on the decl/entity
  registration. This migrates the settings-embedded AI pages without any new
  transport.
- **Phase E2 (self-description)**: extend `ServiceRegisterPayload` (or a
  dedicated `GET /api/v1/module-meta` per service) with `nav` + `pages` decls →
  `service_registry.endpoints` → `RoutesCensusService` merges per-service pages
  into the census → FE catch-all renders them with generic page types (entity
  APIs + metas already work via `/ws/`). Custom module pages resolve
  `component_url` (remote chunk) or `component_key` (FE registry) — remote
  chunk mechanism spike-verified (`table-pages-merge.md` Part I).
- **Phase E3 (`.pbm` packaging)**: zip module bundle (`module.json` + `us/` +
  `fe/` chunks + `db-meta/` + `docs/`) installed via the installer → assets
  deposited where the FE serves them; alternative live path = service-served
  assets via `/ws/` proxy. Ties to `module-installation-process.md`.

---

## Part F — Library evaluation (verified via `pnpm view`, 2026-10-19)

| Need | Recommendation | Verified facts | Alternatives |
|---|---|---|---|
| Kanban board | **`@svar-ui/svelte-kanban@2.6.0`** — spike first | MIT; Svelte 5 native (peer `svelte@^5.54.0`, we run 5.56.4); built-in dnd, editor, sort/filter/group; restyle via CSS (verify Tailwind-token theming in spike) | in-house on `@thisux/sveltednd@0.8.0` (MIT) or `svelte-dnd-action@0.9.80` (MIT, mature) — more work, full token control |
| Timeline/gantt | **`@svar-ui/svelte-gantt@2.8.1`** — spike first | MIT; Svelte 5 v2 line; virtualization, custom task bars/tooltips, scales — heavier than a pure timeline but covers swimlanes+dnd later | `vis-timeline` (framework-agnostic, mature) if gantt proves too heavy; leo-gantt-svelte (early) |
| Dynamic form | **keep superforms@2.30.2 + formsnap@2.0.1 + zod@4.4.3** | already installed/pinned; dynamic-zod precedent exists in-house (`config-validation.ts`); SPA mode already the house pattern | `@tanstack/svelte-form@1.29.1` (MIT, standard-schema) — rejected: big migration, marginal gain over working stack |
| Card-view virtualization | `@tanstack/svelte-virtual@3.13.47` if needed | MIT; only adopt when card-list perf actually degrades | — |

Versioning rule: pin exact versions per `.devin/rules/package-versioning.md`.

---

## Part G — Gaps & pain points (consolidated)

1. No route/page metadata mechanism on FE (verified zero) → `PageRouteDeclaration` + catch-all + registry.
2. ~2.5–3.5k duplicated lines across 5 table pages → consolidate on `useEntityList`.
3. No form section in meta; zod duplicated FE/BE literally → `meta.form` + shared validation vocabulary (absorbs the missing `entity-validation-autoderive.md`).
4. `AuditBar` not standalone; footer CTA strip hand-cloned twice → extract.
5. `ENTITY_SERVICE_MAP` hardcoded → census `service_code`.
6. `kind` vocabulary descriptive not generative; census↔impl drift already observed → consistency check task.
7. `MetaColumn.type` closed on BE, open on FE (`| string`) — needed for custom renderers (`run_stats_sparkline` precedent): keep FE-open, document custom cell renderers via `cell` snippet registry for generated pages.
8. Meta fetch cache is `globalThis` no-TTL → ETag strategy (existing plan).
9. FE collaboration = 0 consumers of a finished BE → delivered via generated shells.
10. `/ws/` entities: no presence transport → decide in D.4.
11. Catch-all must not shadow `login|mcp|welcome|docs` or any static route; SvelteKit precedence verified during implementation.
12. Widget registry must cover: Switch, ComboSelect, DateWheelPicker, Password.Input, ConfigValueInput, AsyncValidatedInput, TypeConfigBuilder, PrimeField-based customs — inventory during task 8.

---

## Part H — Phased execution & acceptance

| Phase | Scope | Acceptance |
|---|---|---|
| **P0 contracts** | Tasks 1–3 | Types compile BE+FE; one entity meta ships `form`+`kanban`+`timeline` sections; `PageRouteDeclaration` served by census; rules updated (extend-first rule preserved) |
| **P1 consolidation** | Tasks 5–7, 17 | 5 table pages ≤ 50 lines each; zero behavior regressions; `useEntityList` adopted everywhere; `AuditBar` standalone |
| **P2 form** | Tasks 8, 15–16, 18 | `EntityFormPage` renders profile+users create/edit from `meta.form`; guards/tainted/CTA parity; zod parity FE↔BE (single vocabulary); presence avatars live on form pages |
| **P3 list** | Task 9 | ≥6 of 8 custom-list pages expressed as `list` decls (or justified `custom`); footer/toolbar dedup removed |
| **P4 kanban** | Tasks 10–11 | `/crm/pipeline` live on `meta.kanban`; drag→PATCH works; actions gating respected |
| **P5 timeline** | Tasks 12–13 | one entity renders timeline view from `meta.timeline`; read-only; iana toggle honored |
| **P6 module pages** | Tasks 14, 19–21, 23 | AI-module pages owned by `ai` decls; catch-all serves a declared page with no static file; census consistency check green in CI |
| **P7 hardening** | Tasks 22, 24–25 | meta ETag cache; presence decision for `/ws/`; docs+rules shipped |

Non-goals v1: drag-reschedule on timeline, remote/module-shipped Svelte
components, presence for `/ws/` entities (decision only), converting `ConfigList`
into `ListSpec` (evaluate, don't force), converting roles/modules bespoke pages
if they resist generalization (stay `custom`).

## Part I — Shared package layer (`@primebrick/core` + `@primebrick/ui`)

User decision 2026-10-19: introduce a layered package model to organize
repeated/shared code and let module pages build on the same base the FE uses.

Verified dependency graph today (`package.json` deps):

```
@primebrick/decimal   (leaf — proto-core: env-agnostic money/decimal)
@primebrick/dal-pg    → decimal
@primebrick/sdk       (leaf — no primebrick deps)
primebrick-api        → dal-pg + sdk
us/{ai,emailsender,job-handler,webhook} → dal-pg + sdk
frontend              → ZERO primebrick deps (everything shared is copy-pasted)
```

Evidence this layer is overdue (copies already exist):

- `EntityMeta`/`MetaColumn`: **three local copies** — `be-v3/src/http/entity-meta.types.ts`,
  `fe-v3/src/lib/entity-list/types.ts`, `us-v3/job-handler/src/modules/jobs/job.meta.ts`.
- Validators intentionally mirrored: fe `config-validation.ts` ↔ sdk
  `config-validator.ts`; literal dup `display-name.ts` (fe) ↔ `validation.ts` (be).
- `module-nav-types.ts` (`ModuleRouteDeclaration`) — one BE-local type with three
  consumers: BE serves it, FE consumes it, US declares it in the manifest.
- Presence contract (`sdk/src/presence/`) — BE-only today; the FE collab client
  needs the same shapes.
- Write envelope `{entity, translations?}`, `STANDARD_OPS`, permission grammar,
  RFC7807 shapes, snake_case brand — all shared concepts with duplicated types.

### Layering: CORE → {DAL, SDK, UI}

- **`@primebrick/core`** (new npm package, same publish train as dal/sdk):
  pure env-agnostic code ONLY — types, data models, zod vocab builders, pure
  helpers. Rule: no `fs`/`process`/DOM/fetch-bound code; runs identically in
  node and browser. Wave-1 contents: `EntityMeta` family +
  `PageRouteDeclaration`/`ModuleRouteDeclaration`, presence types, config
  `type`/`type_config` schema + validation builders, write envelope,
  `STANDARD_OPS`/permission/sentinel constants, RFC7807 shapes, snake_case
  brand + `asSnakeCaseSingular`, `DeepReadonly`, ext-json, display-name
  validators.
- **`@primebrick/ui`** (new package built with `@sveltejs/package` — ships
  `.svelte`/`.ts` sources + `d.ts`; the consumer's vite-plugin-svelte compiles
  them, exactly like bits-ui works today): components (`entity-list-table`,
  `config-list`, `ui` families, shells incl. the extracted `AuditBar`,
  dialogs), composables (`useEntityList` v2, `useEntityMetadata`, `useFormGuard`,
  `useUnsavedChangesGuard`, `usePresence`), non-rune utils (`apiFetch` factory,
  `list-filter-params`, `orderedColumns`…), and a `module-page` entry exporting
  `ModulePageHost` + the `mountPage` helper + a base stylesheet.

### Why this is the real enabler for module pages

A remote chunk's own vite build **bundles its own copy of `@primebrick/ui` +
`@primebrick/core`** — so a module page uses the *same* components and
composables the shell uses, compiled against its own svelte copy. The rune
boundary (§I.4 of the sub-plan) only limits live host↔remote objects, not
shared source: inside the remote bundle everything is coherent. The host
`ModulePageHost` ctx shrinks to `{nav, meta?, bound api, i18n, notify,
callbacks}` — no `ctx.components` needed for the common case (still available
as an option for host-coupled needs).

### Sequencing

1. `@primebrick/core` first — types/pure helpers, zero-runtime-risk move
   (BE type file moves to core; FE/US copies become re-exports then imports).
2. Build `EntityListPage`/`useEntityList` v2 in `fe-v3` (sub-plan P1) — prove
   against the 6 pages with fast iteration, no publish cycle.
3. Create `@primebrick/ui` skeleton early; extract into it when the remote
   jobs pilot needs the shared base (first real consumer) — mechanical move.
4. CSS: design tokens live in the host stylesheet; `ui` exports a base
   `tokens.css` remote chunks link (remote pages live in our DOM — no shadow
   DOM by design).
5. Naming: `@primebrick/core`, `@primebrick/ui`; `@primebrick/decimal` stays
   domain-specific, not subsumed. `@sveltejs/package` already in the toolchain
   family (bits-ui precedent).

## Part J — Entity sync channels (decisions A+B taken 2026-10-19)

Two mechanisms deliver "entity changed → refresh" today; they are **not true
duplicates** (different scope and granularity) but their surfaces fragment.
Decision: adopt **both A and B** — one structured local channel + one unified
composable surface — and keep the cross-user list stream (C) as declared
collaboration-parity work.

### Verified facts (why the tiers stay separate)

- `BroadcastChannel` is **origin-wide, same-browser** — reaches every context
  on the same channel name, not just `window.opener`'s tree. Zero server
  cost, instant. Today: per-family channel names + bare `'refresh'` strings
  (fragile contract; receiver=list, sender=form pages).
- Collaboration is **record-level only** (`:entity/:uuid`): presence SSE,
  `presence.{type}.{uuid}` + `entity.{type}.{uuid}.changed` NATS subjects.
  `session_id`/`tab_count` already dedupe tabs server-side.
- Presence `presence-update` echoes are **filtered for the same `user_uuid`**
  (`collaboration.router.ts:~97`) → same-user's other tab is blind via SSE;
  `entity.changed` markers are NOT filtered → they would arrive if the FE
  subscribed (no FE consumer exists today — only generic
  `createSseConnection` + the `CollaborationMeta` type).
- **No entity-level stream exists** — no `entity.{type}.>` wildcard bridged
  to SSE. A list page cannot subscribe to "any user_profile changed" server-
  side. Local broadcast is the ONLY list-level mechanism today.

### Decision A — one structured local channel

Single `BroadcastChannel('primebrick_entity_sync')`, messages
`{entity, uuid?, op, at}` posted after every confirmed write (list row-ops via
`onRowActionComplete`, form saves, bulk ops). Pages subscribe filtered on
`{entity}` (+`uuid` for record pages). Wins:

- kills the per-family channel-name contract (`primebrick_users_sync`…);
- sibling tabs on the same list refresh (the dead-code intent — resolved);
- a form tab seeing `{uuid:X, op:'delete'}` can warn/close → prevents ERR01
  stale-version conflicts for same-user multi-tab editing;
- event shape deliberately mirrors `EntityChangedMarker` vocabulary → server
  SSE deltas map onto the same `onChanged` surface later (B).

### Decision B — unified composable surface

`useEntitySync` (working name): consumers see one API —
`onChanged(cb)`/`notifyWrite({entity, uuid?, op})`. Internally:

1. local structured broadcast (A) — always on;
2. SSE presence/`entity.changed` per uuid — activates when
   `meta.collaboration.enabled` (the deferred FE collaboration consumer).

Local tier ships first; collaboration plugs into the same event surface —
"2 piccioni con una fava" without collapsing tiers that serve different
scopes (local-only vs cross-user) and granularities (list vs record).

### Context for C — cross-user list invalidation (NOT this merge)

What C would need: an entity-level changed stream — NATS wildcard
`entity.{type}.>` bridged to `GET /entities/{entity}/events` SSE. It covers
OTHER users' writes reaching my open list. It belongs to collaboration parity
work: it needs the FE collaboration consumer first, plus a server cost
decision (one refcounted bus per entity per connected list). Evaluate when
the collaboration FE lands — declared gap, not forgotten.

### Stale-state UX (user design — decision detail, 2026-10-19)

Post-write events drive a two-level staleness surface on list/table pages
(later: all page types). Rationale: high-traffic entities would make toasts/
banners permanently distracting → the indicator is **passive state**, not an
alarm. Only consolidated post-action events participate (in-progress signals
remain the SSE/presence tier's domain).

Scope of this design: the table page is sized for **high write traffic at the
dataset level** — many writes spread across different records, where per-row
churn follows seasonality/event spikes rather than continuous mutation. A
single record changing continuously is a different domain (stock-ticker /
measurement feeds) → that would be a future **live-update table** page
archetype with a dedicated push mechanism, not an extension of this one.
The developer picks the archetype for the data's churn profile; this table's
passive stale-state is the right fit for its intended traffic shape.

1. **"Stale" mini-badge on the Refresh CTA** — tiny counter/label (micro-key,
   must stay short in every language) shown when ≥1 write event for the
   page's entity arrived since last refresh. **No op distinction** — ANY
   consolidated write marks stale (an UPDATE can change row membership under
   an active filter/sort on the edited field, so filtering by op would be
   false confidence). Clears on refresh or page change.
2. **Per-row semaphore icon** — for rows whose `uid` value matches an event's
   `uuid`: icon at the **left of the three-dot row-menu CTA** denoting the
   action. Composite reusable icons — filled gradient shape + centered inner
   glyph (not strokes-only):
   - `CREATED` → filled info-gradient triangle + white plus centered
   - `CHANGED` → filled warning-gradient triangle + black pencil centered
   - `DELETED` → filled destructive-gradient circle + white cross centered
     (or `octagon-x`/`ban` — decide at implementation)
   - `RESTORED` → filled warning-gradient triangle + black `arrow-up-from-line` centered
   - Tooltip (existing tooltip components/style) shows **WHO / WHEN / WHAT
     ACTION** — `changed_by` + `at` from the event payload, formatted with the
     existing formatting utilities — plus a CTA opening the **version-history
     panel** (`entity.versionHistory` sheet, already exists).
   - Row carries transient `isStale: true` + `staleAction` — **non-permanent**:
     clears on pagination change or refresh (refetched rows are fresh).
   - While `isStale`: write row-menu items are **pre-blocked** (edit, delete,
     restore, custom write CTAs like `change_password`); read CTAs stay
     (preview panel, version history). Prevents ERR01 optimistic-concurrency
     failures *before* they happen — our held `version` is provably stale.
3. **Payload extension**: local broadcast becomes `{entity, uuid?, op, at,
   changed_by?}` — the posting tab knows the current user; `changed_by` powers
   the WHO in tooltips.
4. **`CREATED` cannot match a visible row** (uuid not in the page) → counts
   only toward the Stale badge. `CHANGED`/`DELETED`/`RESTORED` on visible rows
   take the semaphore AND count toward the badge.
5. **Coalescing**: rapid/bulk events accumulate into the badge counter —
   no stacked indicators.

### Per-op endpoint contract (discovered 2026-10-19 — sub-plan task 9b)

`EntityAction` carries `{op, permissions, sentinel, enabled}` — **no
endpoint**. Precedent `user_profile`: entity prefix is READ-ONLY; writes live
under `/api/v1/auth/users` (Casdoor-coordinated ordering) and are reported
`enabled` via `metaExtraScans` — but the FE cannot know *where* they live, so
ELT computes `/api/v1/entities/user_profile/{uuid}` → **latent 404 on
delete/restore today**. Fix (entity-level meta, BE derives from route scan):
`EntityAction.endpoint` (method + path template). Also kills
`ENTITY_SERVICE_MAP` for `/ws/` module ops and enables page-agnostic write
dispatch. Interim fallback for the merge: per-page op-endpoint override map.

### Sub-plan extraction

A dedicated sub-plan (`entity-sync-channels.md`) will be extracted from this
section covering: structured message shape + `op` vocabulary, `useEntitySync`
API, `useSyncChannel` migration path (legacy names as `legacy_channel`
dual-listen during transition), list/record subscription filters, and the
collaboration plug-in contract. **Until extracted, `table-pages-merge.md`
treats `sync_channel` as a legacy-compat input (dual-listen) plus the
automatic `{entity}`-scoped subscription.**

## Open questions for the user

1. **Custom pages** — you have an idea; mine is the `component_key` registry +
   descriptor-composition-later (C.6). Your move.
2. Form schema location: inside `EntityMeta.form` (recommended — one fetch,
   closed schema) vs separate `/form-schema` endpoint (pre-plan question)?
3. `kind` → `page_type`: keep both during transition or hard-cut the vocabulary?
4. Presence for `/ws/` entities: gateway proxy vs per-service SDK port?
5. Kanban write-back: is drag→PATCH the only write on the board, or also
   in-column reorder persistence (`order_field`)?

---

## Deferred follow-ups (parked 2026-10-21 — sub-plans to be extracted)

> Surfaced during the `table-pages-merge` stream; deliberately parked here —
> the root plan — so they stay visible until each gets its own sub-plan.
>
> **Extraction status 2026-10-26**: D2 + D4 + D5 → sub-plan
> `docs-generation-per-service-split.md` (per-service repo-local generation,
> declared-census route sourcing, byte-parity gate vs `dbd2eb2`) — 🔴 BLOCKED
> on this plan: doc facts for create/edit pages come from the archetype/form
> metadata this plan produces.

| # | Item | Why it matters | Status |
|---|------|----------------|--------|
| D1 | **Access-grant management UI** — `access.{app}.{module}.{page}` grants are today assignable only via `role_mappings` rows / raw SQL (see `feature-access-axis-and-module-discovery-consolidation.md`). Needs an admin surface in Settings to grant/revoke per module/page. | The access axis is enforced server-side but has no operable UI — unusable in production without it. | ⏳ deferred |
| D2 | **User-guide docs pipeline is stale** — `docs/user-guide` generated entity manuals (e.g. `customers.mdx`) carry pre-migration paths (`/system/customers/*` vs real `/crm/*`). The generator that produces them has not run since the route/ownership migrations; locate it, fix route sourcing (must read declared routes/nav, not hardcoded settings paths), re-run, and wire it into the release/docs train. **Evidence 2026-10-27**: generator located = `us-v3/ai/scripts/{docs-extract,docs-render,docs-generate}.ts`; route source is AST-scan of `fe-v3/src/routes/(app)/**/+page.svelte` — cross-repo, now doubly wrong (host pages are virtualized behind `[...path]` catch-all + remote pages never were `+page.svelte`). Correct source = nav-declaration / `service_registry.endpoints.nav` census + `module-nav-meta` + `EntityMeta` — all repo-local, route truth already declared. `be-v3/scripts/generate-reference-docs.ts` is the repo-local pattern to mirror. | User-facing docs silently diverge from shipped routes — detected empirically, no gate exists today. | ⏳ deferred |
| D3 | **Job service 502 flakiness under parallel E2E load** — `ApiUnreachableError` on `/ws/job/*` during Playwright suites (bun `--hot` service / proxy). Isolated as flake (single re-runs green) but it poisons jobs-pages/ownership/access-filtering runs at random. | Blocks trusting E2E as regression signal; needs root-cause (bun hot-reload stability vs http-proxy timeouts). | ⏳ deferred |
| D4 | **Per-service page-doc render** — `docs-render.ts` (ai/scripts) renders entity user-guide pages only for entities the running service owns (meta/router scan of its own `src/`). job-handler entities (`job_schedule`/`job_rule`/`job_run`) are correctly skipped by the BE render but have NO render of their own: needs the same extractor+renderer parameterized per service (`META_DIR`, `ROUTER_DIR`, `OUT_DIR=<svc>/docs/user-guide/generated`), `EntityRouteDecl` perms-resolution (`readPerms`/`writePerms` identifiers, not `Permission.X` literals), `RemotePageMount` page facts from `nav-declaration.ts` route→`component_url` → `<svc>/fe/src/*.svelte`, and its own `generate:docs` wiring so the pages ship in the job-handler docs pack. **Evidence 2026-10-27**: `docs-generate.ts` defaults `OUT_DIR` → `be-v3/docs/user-guide/generated` AND `docs-render.ts` reads `be-v3/src/**` from `us-v3/ai` — the only render in the fleet is itself cross-repo and must be split, not just re-parameterized. ai service remote pages (`ai-models` create/update etc.) live in `ai/fe/src/*.svelte`, invisible to ANY host scan — same for emailsender (`emailsender-pages.js`) and job (`jobs-page.js`). List routes `kind:"list"` need no component facts (host archetype). Baseline gate: `users-create/edit.mdx` and the other 17 generated pages are byte-identical to `dbd2eb2` (verified by full regen + diff) — the per-service refactor MUST preserve that output verbatim (diff as regression gate). | Without it, every module-owned page produces zero user-guide docs — the assistant's KB silently lacks module pages (detected 2026-10-23 via coverage warnings). Isolation stays per-service; NO cross-repo aggregation. | ⏳ not done |
| D5 | **Docs-render ghost emission** — `docs-render.ts` emits `[...path].mdx` ("List, search and manage all [...path]") from the FE docs-viewer catch-all route `/docs/[...path]`. `429c2d0` deleted the artifact + purged KB but the only guard lives in `_order.json` (`[` → skip nav listing) — nothing stops EMISSION, so every regen re-adds the file (verified empirically 2026-10-27). Needs a documentability rule in the renderer (exclude framework catch-alls / `[]`-segment routes / non-content routes) — or it evaporates with D4's metadata-sourced routes (declared routes never include framework internals). | Silent junk re-pollutes `docs/user-guide/generated/` + docs KB on every regen; deletion-only fixes don't stick. | ⏳ not done |

## Part I.2 — Extraction audit 2026-10-21 (empirical — verified in code)

Reality vs tasks 26-28: the packages **exist** (`core`: entity-meta, page-route,
list wire, filter-presets, search-gate, list-filter-params, ext-json,
translation-keys, columns, decimal; `ui`: SparklineBars + cn + re-export of
core). FE `entity-list/types.ts` is already a re-export shim; BE `ModuleRouteDecl`
aliases the sdk→core type; the job `remote-list.svelte.ts` mirror is deleted.
What remains is a concrete extraction backlog:

### Wave-1 — move to `@primebrick/core` now (small, pure, duplicated verbatim)

| # | Duplicate today | Locations | Action |
|---|-----------------|-----------|--------|
| E1 | **Access evaluator** — `isAccessGranted` (sdk `auth/access.ts`) vs FE `hasAccess` (permissions.svelte.ts — explicit "local mirror") | sdk + fe | evaluator + `ADMIN_INHERITED_ACCESS` + `isAccessKey`/`accessGrantCovers` → core; sdk re-exports (callers untouched); FE imports via ui |
| E2 | **Permission wildcard matching** — sdk `wildcardToRegex`/`permissionMatches` vs FE `isPermissionGranted`/`accessGrantCovers` | sdk `auth/permissions.ts` + fe | unify matcher in core; both sides import |
| E3 | **Route contract** — `entityPaths` + `validateNavDeclaration` (R1/R2/R3) | sdk `service/nav-declaration.ts` | → core; sdk re-exports. `pluralize` is isomorphic — acceptable core dep |
| E4 | **Config vocab** — `TYPE_CAPABILITIES`/`TypeCapabilities` ("canonical in @primebrick/sdk" per fe api-types.ts:178 — doc-mirror) | sdk + fe api-types.ts:185-198 | vocab + validators → core |
| E5 | **Module wire types** — fe-local `ModuleNavLink`/`ModuleNav`/`ModuleInfo` vs core `ModuleNavDeclaration`/`ModuleNavLink` | fe api-types.ts:54-79 | alias to core types |
| E6 | **List-wire helpers** — `ApiListError`, `readApiErrorDetails`, `isBackendGatewayUnreachable`, `backendOfflineTags`, `isAbortError`, `findActionEndpoint`, `fillActionPath` | fe `entity-list/` | → core (remote lists/forms need them — the deleted job mirror proves it) |
| E7 | **RFC7807** — no canonical `ProblemDetails` type anywhere; sdk emits and fe parses ad-hoc shapes | sdk rpc-router + fe api.ts | type + `isProblemDetails` guard → core |

### Wave-2 → `@primebrick/ui` (remote-page UX kit — needed by AI pages, D4)

`useEntityList` v2 · `EntityTablePage`/`EntityListTable` suite (largest lift) ·
`DeleteDialog`/`DeletionFilterToggle` · `ModelCacheSection`/`ModelCachePanel` +
`StorageBreakdownBar` · `ScoreGauge`/`ModelIcon`/`cerebellum-recommendation-badge`
· `formatDatetimeCellDisplay` (cell helper — borderline core/ui).

### Wave-3 — module wire contracts

Per-service wire types (`AiModel`, `AiCerebellum`, `JobSchedule`…) live in
`fe/api-types.ts` today — namespace drift. Target: each service exports its
contract types (shared subpath or bundled into its remote chunk's
`host-contract`), FE imports from the owning module — not a central copy.
`component_key` registry for host-rendered custom pages stays task 14.
