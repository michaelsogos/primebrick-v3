# Metadata-Driven Page System — Page Types, Route Meta & Module Pages

> Continuation of `dynamic-form-pages-pre-plan.md` — expands scope from form pages
> to the full page-type system (table, list, form, kanban, timeline, custom),
> route-level page metadata, and module-provided pages.
> Related plans: `COMPLETED/collaboration-visual-merge.md` (DONE — presence/merge UI),
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

## Status: 🟡 IN PROGRESS — Plan date: 2026-10-19 00:12 UTC / 02:12 CEST · deep drift audit 2026-11-05 · session 2026-11-10 (tasks 31–40: RFC-extras pipeline, `listColumnKeys`, system-column flag derivation + actor-join query surface, anti-restatement enforcer; residual: Date-pgType decision at task 37, job-handler `enabled` drift at 38, DAL test debt at 39) · session 2026-12-22 (task 37 closed — `jsType:"instant"` semantic pin wired into pgType cascade + `synchronizableType` callsite fix, 27 props; task 38 closed — drift was stale, column already absent) · session 2026-11-10b (type-audit closed: jsonb `jsType:<Ctor>` class-revival + `@Calculated{pgType,nullable}` + lint named-annotation/multi-line rules — 0 drift, 586/586 DAL tests; **NEW: tasks 31–36 marked done but implementing code sits UNCOMMITTED in working trees**, see residual block below)

> **Deep audit 2026-11-05 (empirical, code-verified):** the route layer,
> contract types, archetype renderers, census, catch-all and remote-chunk
> delivery all landed since this table was last updated — often through a
> *different mechanism than designed* (`page-resolver` kind-dispatch instead
> of `PAGE_REGISTRY`; `component_url` remote chunks instead of an FE
> `component_key` registry; `EntityTablePage` instead of `EntityListPage`).
> Function delivered ≠ letter of the plan; rows below say which.
> **Remaining real scope:** (a) 9 hand-rolled form pages still await
> `EntityFormPage` migration (~3.5k dup LOC — task 18); (b) kanban+timeline
> archetypes never started (crm pipeline still a mock); (c) the standing
> collaboration rule was only answered for forms — list/kanban/timeline/
> custom archetypes have ZERO presence/merge answer (verified: no presence
> refs in `EntityTablePage`/`useEntityList`); (d) hardening: AuditBar
> extraction, census↔impl check, /ws presence decision, ui extraction of
> EntityTablePage/useEntityList, useEntitySync v2.
>
> **⚠️ UNCOMMITTED DONE-WORK (verified 2026-11-10b, blocks nothing but lands
> nowhere until staged):** the implementing code of tasks 31–36 exists only
> in working trees — sdk `rpc-router/entity-router/entity-field-validator/
> nats-routes` (+42), core `columns.ts` `listColumnKeys` (+18), dal
> `entity-service`/`query-builder` (+51) + UNTRACKED
> `entity-service-actors.test.ts`, us-v3 73 files (task-32/36 list-config +
> dead-flag removal, +364/−873), be-v3 MANIFEST (4 signed patches:
> combo_count, powered_switch, easy/meaning_hint) + generated docs, fe-v3
> dict-page batch in flight (TableFooter/TranslationKeyCell deletions +
> renames). A `git clean` loses the "done" column entirely.
>
> **Session 2026-11-10b additions (type-audit fallout, new residual):**
> (e) dict entities are heterogeneous — 9/10 re-declare `sort` locally vs
> one real `DictEntityBase` subclass (`CustomerTypeEntity`) — same parallel
> pattern as `config_entry.reserved`; consolidation is a decision, not a
> fix. (f) `@Calculated` gained `pgType`/`nullable` (this session) but NOT
> `jsType` — a class-valued projection can't declare revival today.
> (g) `db:check` runs in `prebuild` only — stale snapshots shipped twice
> (job-handler `enabled`/`next_run_at`); a pre-commit or commit-time gate
> would have caught it. (h) `primebrick_db migration_failed → online` —
> RESOLVED 2026-11-11 (sdk `5b4b2da`): the admin transition route always
> existed (`system/db-migration/*`); the real gaps were a boot-time-wired
> 503 gate + lost onReady. Now: live-read gate + deferred init + heartbeat
> auto-recovery — self-heal without respawn.

> **Drift reconciliation 2026-10-28:** parts of this plan already landed via
> `entity-form-archetype-pilot.md`, `root-page-skeleton.md` and the package
> extractions — task 1 (`PageRouteDeclaration` + `description_key` + `chrome`,
> rename to `Declaration`) done; task 2 (`withColumnConstraints`, authored
> props, `page_props.form` domain model) done per pilot; task 8
> (`EntityFormPage` renderer) done for the create-pilot — full field/widget
> coverage per `form-pages-anatomy-audit.md` still open; tasks 26–27
> (`@primebrick/core`, `@primebrick/ui`) shipped; task 20 (nav decls via
> `service.register` → census) live. **Presence status corrected 2026-11-05:**
> `collaboration-visual-merge` is COMPLETE — BE chain (DAL lock, SDK presence,
> BE module + meta inject + audit hook) AND FE side (F10 `usePresenceChannel`/
> `PresenceAvatars` in `PageHeader`, F11 `useCollaborativeForm` + version
> write-path + conflict/merge UI on `job_rule`, F13 session-keyed presence)
> all shipped and E2E-verified. F12 `CollaborationPanel` was descoped —
> conflict resolution lives in the `PresenceStatusChip` popover. Tasks 15–16
> here are effectively delivered. Inverse: `docs-generation-per-service-split`
> task 5 is blocked on this plan's form-meta maturity; `page-chrome-enforcement.spec.ts`
> now pins the mandatory-header contract for whatever dispatches pages (task 21).
>
> **Standing rule (user, 2026-10-28):** for EVERY page archetype designed or
> migrated under this plan, the question MUST be asked: *"how do we render
> the collaboration feature?"* — presence avatars + channel are defined for
> update surfaces only (`collaboration-visual-merge` §6.4/§6.6); create gets
> nothing; list/kanban/timeline/custom each need an explicit answer in their
> task row — never default to "same as forms".

> **Auto-determinism hardening 2026-11-14:** closed the last hand-written
> seams in the entity-meta pipeline. `withColumnConstraints` now auto-derives
> every physical column missing from authored `columns` (uid first,
> audit/deletable → `audited`, auto-injected → `default_visible:false`;
> `hidden:true` is the only opt-out). `RpcRoute.entity_op.cta` synthesizes
> `row_custom_actions`/`bulk_custom_actions` in served meta — placement,
> row_key, translation keys, permissions, step-up all inferred from the route;
> authored meta.table CTAs reduced to explicit overrides (boot fails on
> dead CTAs). Cell renderers are `format`-keyed: `schedule_spec` (shared
> `@primebrick/ui` badge+prose), `nats_subject` (census-linked),
> `json` (readable chips). `ref`/`reverse_ref`/`ref_count` reference columns
> link entity↔children through the census + `filters[]` URL params — never
> hardcoded paths. Null-proto `String()` crashes fixed class-wide via
> `toDisplayString` + `@typescript-eslint/no-base-to-string` (type-aware,
> enforced at lint). Boolean cells: centered CircleCheck/CircleX + tooltips —
> fixed standard, documented. Trigger entity: `last_run`/`next_run`/
> `run_stats` virtual columns (service-decorated, trigger-keyed stats via
> `trigger_uuids` on `/actions/job-run-stats`; `next_run` evaluates
> `@every`/`@at` in core `nextScheduleFire`, cron returns null — NATS owns
> cron). enable/disable trigger ops declared as `entity_op` (auto CTAs).
> **Near future:** `event_subject`/`target_subject` currently link to the
> modules page (`/system/settings/modules/[code]`); a dedicated module
> capabilities page (capabilities/events/schedules overview — the "know"
> page to author jobs/workflows from) is a planned task — update the
> `nats_subject` link target in `entity-links.ts` when it lands.

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Extend `ModuleRouteDecl` → `PageRouteDeclaration` (`page_type`, `entity`, `page_props`, `component_key`) in BE `module-nav-types.ts` + FE mirror | ✅ done | 2026-11-05 audit | done-in-reality: `PageRouteDeclaration` lives in `@primebrick/core` `page-route.ts:32` (kind vocabulary `list\|detail\|create\|page` retained — the `page_type` rename was NOT done and is no longer needed); `component_url`/`component_format`/`integrity` deliver remote chunks; `ModuleRouteDeclaration` rename done; be `module-nav-types.ts` re-exports |
| 2 | Extend `MetaColumn` with derived constraint props + authored props; `page_props.form` = `FormPageDecl` | ✅ done | — | done-in-reality: DERIVED section `entity-meta.ts:198` (`withColumnConstraints` injects at serve time); `FormPageDecl` at `page-route.ts:149` |
| 3 | Validation: `format`/`pattern`/constraints → `buildEntityFormSchema`; cross-field via `page_props.form.validators` | ✅ done | — | `build-entity-form-schema.ts` (fe) + `field-spec-to-zod.ts` (ui) — validators closed vocab enforced (throw on unknown) |
| 4 | `PageRouteDeclaration` → component dispatch: `PAGE_REGISTRY` + `useEntityPage` driver | ✅ done | 2026-11-05 audit | done-in-reality via DIFFERENT mechanism: `page-resolver.ts` maps decl → archetype component in the `(app)/[...path]` catch-all — no literal registry/driver, same function delivered |
| 5 | Consolidate the ~500–700 duplicated lines in the 5 EntityListTable pages onto `useEntityList` | ✅ done | — | verified: pages now 11–46 lines via `EntityTablePage` (which owns `useEntityList`) — users 43L, customers 11L, roles 46L, clients 14L |
| 6 | `PageType.Table` generic page | ✅ done | — | shipped as `EntityTablePage.svelte` (fe `$lib/components/entity-table-page`) — name differs, function identical |
| 7 | Extract `AuditBar` standalone component out of `FormPageLayout` | ⏳ not done | — | VERIFIED ABSENT: no `AuditBar` anywhere; audit footer still baked into `FormPageLayout` (`auditData` prop in `EntityFormPage:595`) |
| 8 | `PageType.Form` (`EntityFormPage`) | ✅ done | — | `entity-form/EntityFormPage.svelte` — live for `job_trigger` create+detail archetypes (TRIGGER_FORM shared) |
| 9 | `PageType.List` unified list archetype | 🚫 dropped | 2026-11-05 | dead-by-decision (evolution): the divergent custom-list pages resolved via remote chunks (ai/docs/crm) or `EntityTablePage` (emailsender providers/templates, job lists) — no `ListSpec` archetype needed; residual customs (migrations/templates/translations/modules/credentials) stay hand-rolled legitimately |
| 10 | Kanban spike: svar-kanban vs in-house dnd | ⏳ not done | — | never started — `/system/crm/pipeline` remote page is still a static mock preview (PipelinePage.svelte "no data writes") |
| 11 | `PageType.Kanban` (`EntityKanbanPage` + `meta.kanban`) | ⏳ not done | — | no `KanbanMeta` in core; blocked on task 10 |
| 12 | Timeline spike (svar-gantt vs lighter) | ⏳ not done | — | never started; only presentational `ui/timeline` exists |
| 13 | `PageType.Timeline` (`EntityTimelinePage` + `meta.timeline`) | ⏳ not done | — | no `TimelineMeta` in core; blocked on task 12 |
| 14 | `PageType.Custom`: `component_key` → FE component registry | 🚫 dropped | 2026-11-05 | dead-by-decision (better path won): `component_url` remote ESM chunks are THE custom delivery — ai-pages.js, crm-pages.js, jobs-page.js, *-sheets.js registered live; FE registry unnecessary since host customs stay static routes |
| 15 | `usePresence(entity, uuid)` composable consuming `meta.collaboration` — SSE `presence/events`, READING/EDITING/LEAVE/HEARTBEAT signals, `PresenceAvatars` in form-page `headerExtras` | ✅ done | 2026-10-28/31 | delivered by `collaboration-visual-merge` F10/F13: `usePresenceChannel` + presence-channel-registry + `PresenceAvatars` mounted in `PageHeader` slot; session-keyed identity |
| 16 | Central write-path handling of collab contracts: `version` optimistic locking + `ERR01`/`ERR02`/`ERR03` → conflict/merge UI hooks in `EntityFormPage` | ✅ done | 2026-10-29/31 | delivered by `collaboration-visual-merge` F11: `useCollaborativeForm` + `handleVersionConflict` + `PresenceStatusChip` popover (F12 `CollaborationPanel` sheet descoped → chip popover is the conflict surface); E2E 2/2 + 3/3 live |
| 17 | Migrate the 5 core table pages to `EntityListPage` | ✅ done | — | done-in-reality: all 5 on `EntityTablePage`, 11–46 lines each |
| 18 | Migrate standard form pages (profile, users/create+[uuid], organizations create+[uuid], clients create+[uuid], configurations/create) to `EntityFormPage` | ⏳ not done | — | **BIGGEST RESIDUAL**: all 9 pages still hand-rolled (profile 527L, users/create 679L, users/[uuid] 439L, orgs create 313L/[uuid] 293L, clients create 253L/[uuid] 421L, configurations/create 597L, roles 273L/285L — ~3.9k dup LOC). `EntityFormPage` exists and works (job_trigger proves it); needs per-entity `page_props.form` decls + escape-hatch coverage (avatars, roles tabs, key-rotation) |
| 19 | Migrate AI-module-owned pages out of hardcoded settings → owning service decls | ✅ done | — | done-in-reality + better: `ai` pages are remote chunks (`ai-pages.js`/`ai-sheets.js`), job pages = host archetypes + remote, emailsender providers/templates = `EntityTablePage` on `/svc/` entities; `ENTITY_SERVICE_MAP` killed by task 30 (`EntityAction.endpoint` + `serviceApiPrefix`); residual statics (migrations/templates/translations/modules/credentials) are legit core pages |
| 20 | Module page self-description via `service.register` → census | ✅ done | — | live-verified this session: crm registered with `routes`+`callables`+`emits`; `nav-declaration.ts` per service is THE mechanism |
| 21 | Dynamic route realization: `(app)` catch-all → decl resolution → renderer dispatch | ✅ done | — | `routes/(app)/[...path]/+page.ts` + `page-resolver.ts`: redirect/denied/not-found/component resolution; remote mount + error panel verified live (19/19 e2e) |
| 22 | Meta caching: ETag/localStorage strategy | ✅ done | — | `getCachedETag`/`setCachedETag` in `@primebrick/ui/cache`, wired in `api.ts` (If-None-Match send + 304 reuse) |
| 23 | Census↔implementation consistency check | ⏳ not done | — | VERIFIED ABSENT: no drift check exists; the `templates`-mock class of drift can still happen silently |
| 24 | Decide presence transport for `/ws/` entities | ⏳ not done | — | decision never taken — no presence in us-v3 (verified: zero `presence` refs in job-handler) |
| 25 | Update rules + docs; `entity-validation-autoderive.md` write/absorbed | ⏳ partial | — | docs updated piecemeal alongside each landing plan; `entity-meta-schema.md`/`entity-list-pages.md` policy alignment + `entity-validation-autoderive.md` resolution still open |
| 26 | Create `@primebrick/core` package — env-agnostic shared code (EntityMeta family, `PageRouteDeclaration`/`ModuleRouteDeclaration`, presence types, config vocab + validators, write envelope, STANDARD_OPS/permission/sentinel constants, RFC7807, snake_case helpers) | ✅ done | — | `@primebrick/core` shipped — EntityMeta family, presence types, schedule validators (`isValidScheduleSpec`/`jobTriggerShapeIssues`), payload-map types, ext-json codec; consumed by BE/FE/US/SDK |
| 27 | Create `@primebrick/ui` package (`@sveltejs/package`): components, composables, non-rune utils, `ModulePageHost` + `mountPage` helper + base stylesheet | ✅ done | — | `@primebrick/ui` shipped — components/composables + `mountPage` remote-mount helper; consumed by FE + remote `fe/` bundles identically |
| 28 | Extraction waves + publish wiring: types→core, validators/helpers→core, components/composables→ui | ⏳ partial | — | packages ship with `publishConfig` (core 3.2.0, ui 3.3.0); **`EntityTablePage`/`useEntityList`/`EntityFormPage` are still FE-local** — the "first ui citizens" extraction never happened; a remote chunk needing a table archetype can't import it today (host-rendered archetypes don't need it — the need shrank but the letter stands) |
| 29 | Entity-sync channels v2: unified `useEntitySync` surface; extract dedicated sub-plan from Part J | ⏳ partial | — | `useSyncChannel.svelte.ts` exists as the per-channel primitive (BroadcastChannel refresh, entity-named); unified v2 surface + dedicated sub-plan never materialized |
| 30 | `EntityAction.endpoint` extension (BE+FE closed-schema) → FE write dispatch uses declared endpoints | ✅ done | 2026-11-05 | delivered by `COMPLETED/schedule-lifecycle-actions`: `RpcRoute.entity_op` → `meta.actions[].endpoint` emitted by `makeServiceRoutes`; FE `handleCustomAction`/`handleBulkCustomAction` dispatch via `serviceApiPrefix`+`ep.path`; `ENTITY_SERVICE_MAP` no longer needed for writes |
| 31 | RFC 7807 validation errors: human-readable `detail` + native `extra.issues` + severity `HIGH` — `toValidationError` (structural `e.issues` detection, sdk stays zod-free) wired across `rpc-router`/`entity-router`/`nats-routes`/`entity-field-validator` + `error-detail-stringify` lint rule | ✅ done | 2026-11-10 | repro-verified live (same request path as the user's broken 400): `detail` = `path: message` join, `extra.issues` → `JsonTableViewer` table; permanent E2E `fe/src/e2e/rfc-error-extras.spec.ts` (intercept 400 → ErrorsPanel → View Details → issues rendered) |
| 32 | `listColumnKeys(columns)` in `@primebrick/core` `columns.ts` — sort/search/filter wire key-sets derived from RESOLVED `xMeta.columns`, replacing duplicated `*_SORT/SEARCHABLE/FILTERABLE_KEYS` consts in list-config (18 modules: 16 crm + 2 ai) | ✅ done | 2026-11-10 | fixes `sort_key=updated_at` rejection (key set outlived the meta); bogus keys still fail closed; audit cols now correctly inside FILTERABLE (latent 400 on `created_by`/datetime filters fixed) |
| 33 | System-column query-flag derivation rewrite (dal `column-constraints.ts`): `uuid` all-ON; `id` NEVER emitted in meta.columns (join/fkey plumbing only — authored `id` → throw, excluded from `sortableUniverse` unless it IS the uid); `version` filterable/!searchable/!sortable; audit actors all-ON; `type:"date"\|"datetime"` default `searchable:false` — **type-aware, not phys-aware**: un-pinned business `Date` props infer `"text"` at runtime (annotation pipeline is static-only), the authored/derived meta type is the only honest signal | ✅ done | 2026-11-10 | 63/63 `column-constraints.test.ts`; defaults verified on resolved crm/job metas |
| 34 | Actor-column query surface via the existing `user_profile` join: `search`/`search_in` on `created_by`/`updated_by`/`deleted_by` resolves `COALESCE("<alias>".display_name, base.<col>::text)` ILIKE; `sort_key=<actor>` → `ORDER BY "<actor>_by_name"` (already-projected alias) | ✅ done | 2026-11-10 | `entity-service.ts` — without the mapping every `?search=` on an auditable list was a latent 42883; 5/5 `entity-service-actors.test.ts` on real PG (name match, `system` raw fallback, name-order asc/desc) |
| 35 | General ILIKE/LIKE text-cast in `renderFilterExpr` — non-text pg columns render `CAST(col AS text)` (was hardcoded `key==="uuid"` only) | ✅ done | 2026-11-10 | kills the 42883 class for `version`/actor/datetime explicit filters; required by task 33's searchable semantics |
| 36 | Anti-restatement enforcer in `withColumnConstraints`: authored query flag equal to the derived default → throw ("author flags only to narrow or to override a derived false") | ✅ done | 2026-11-10 | ~290 dead flags removed across 33 meta/list-config files (116+176); 5 be-v3 `uuid filterable:true` deleted for free (now the default); 0 throws on full rescan; batch-script comment-collapse collateral repaired manually in 3 crm list-configs + 2 job.meta entries |
| 37 | Runtime `Date`→`timestamptz` resolution **without files/reflection** — user-chosen option E: `jsType:"instant"` is the code-level semantic pin for business Date props. Added `JS_TYPE_PINS` level (`instant→timestamptz`, `decimal→numeric`, `vector→vector`) in `inferPgTypeFromEntityColumn` cascade (explicit pgType → semantic pins → **jsType** → annotation → text); `jsType` added to `EntityColumnTypeHints` + wired in `getEntityPersistenceMeta`. **Bonus fix found same class:** `synchronizableType` was declared in hints but never passed at the callsite — `last_synced_at` resolved `"text"` despite the pin existing (now wired). `jsType:"instant"` added to 29 Date props (13 be-v3 + 14 us-v3 + `mcp_oauth_client` manual `created_at`/`updated_at` caught by the new lint). **Enforcement:** `entity-date-type-declared` rule in `check-standards.ts` (consumer profile) — Date-annotated column props must carry `jsType:`/`pgType:` or a semantic-pin decorator, else the column silently resolves `"text"`; shared `ENTITY_PROP_OPTIONAL` regex extended to `[?!]` (`prop!: T` props escaped both entity rules before) | ✅ done | 2026-12-22 | served meta verified live: `disarmed_at`/`fired_at`/`expires_at`/`armed_at`/`next_run_at` now `type:datetime pg_type:timestamptz searchable:false`; `last_synced_at` `timestamptz` via pin; 44/44 meta resolve, 570/570 DAL tests; `@Calculated` `last_run`/`next_run` left out (driver-OID hydration, not in meta.columns) |
| 38 | ~~job-handler `db:check` drift~~ — **verified already resolved**: `information_schema` on the live DB shows no `enabled` column anywhere in `job` schema; entity comment confirms intentional removal ("disable = soft-delete") | ✅ done | 2026-12-22 | drift entry was stale — closed after live-DB check |
| 39 | DAL test-suite debt (verified pre-existing — 33 fail on HEAD vs 18 with the change): `test/benchmark/bulk-benchmark.test.ts` ×6 `MissingVersionError` — the bulk version guard (352f339) postdates the test, which never re-fetches `version` after `addMany`; `entity-capability-mixins` composed-instance fails on HEAD | ⏳ not done | — | real residual → also tracked in `dal-v3-bulk-expected-version.md` |
| 40 | Extend `extra` payload to more SDK error classes (e.g. `NotFoundError {entity, uuid}`) — the RFC extras pipeline now carries `extra` end-to-end to the Error Detail Viewer; more error kinds should feed it | ⏳ not done | — | offered in session, not yet scoped |

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
ready-made transport seam. `collaboration-visual-merge` (COMPLETED) shipped
`PresenceAvatars` in `PageHeader` + `PresenceStatusChip` popover conflict UI.
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

> **Status note (2026-10-29, F11 pilot):** the update mode of `entity_form` is
> already implemented under the CURRENT vocabulary — `kind:"detail"` +
> `entity` + `page_props.form` resolves to `EntityFormPage` in update mode
> (GET record → defaults → PUT `{entity:{…,version}}`), sharing the same form
> declaration as `kind:"create"`. Reference: `job-handler/nav-declaration.ts`
> `RULE_FORM` used by both `rulesPaths.create` and `rulesPaths.detail`. The
> `page_type`/`form_mode` rename above stays a pure vocabulary migration —
> no behavior gap remains. A separate `layouts.edit` form-shape override
> (detail-only placement/policy) is NOT implemented: `page_props.form` is
> verbatim-shared; if a real need arises, extend `FormPageDecl` — do not
> fork the declaration.

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
2. `PresenceAvatars` rendered in the form page's `headerExtras` — shipped via
   `collaboration-visual-merge` F10 (`PageHeader` presence zone).
3. Write path: `EntityFormPage` always sends `version`; `ERR01` (409) →
   conflict UI → `PresenceStatusChip` popover (keep-mine/use-new) — shipped via
   F11; `CollaborationPanel` sheet descoped. `ERR02`/`ERR03` mapped to the
   notification channel.
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

## 2026-11-19 — UX doctrine fixes + enable↔soft-delete design

### Done this session
- `MetaColumn.color` → ICON tint only (badges stay `secondary` muted); canonical census values: src `zap`/`amber-500`, dst `send`/`sky-500` (same as create-form `subject_combo`).
- Filter condition chips use canonical FilterBar anatomy + translated ops (`system.entities.list.operators.*` via op-vocabulary map `eq→=`…); `exists` op key seeded.
- Cell links: ghost-hover bg + persistent underline + `text-primary` (`CELL_LINK_CLASS`, one const).
- `ref_count`/`runs`: grouped `count(*)` in `decorate()` — shows 0 explicitly.
- `<key>_name` display convention: universal in `TableCell` (was audit-gated only) — created_by/updated_by resolve display names.
- Auto-derived system columns → `system.common.fields.*` shared dict (BE patch `20261119000000`, applied + signed). Per-entity audit keys are dict duplication (33 hand-declared keys → migrate).
- `MetaColumn.null_label` contract; `next_run` → "Trigger disabilitato" when `enabled=false` (JH patch `20261115000000`, applied + signed).
- SparklineBars: always exactly 10 fixed-width slots (right-aligned tail); `skipped` → `fill-neutral-400`.
- `ScheduleSpecCell`: prose first, spec badge second.
- REGRESSION FIX: `actions-route.actorOf` fabricated `user:<email>` actors — DAL convention is `user_profiles.uuid`/`"system"`; fixed to `ctx.user.id`. Leftover bad rows exist in DB (e2e actors too) — writers now correct.
- Verified: delete/restore ALWAYS funnel through confirm dialogs (`useDialogs.openDeleteDialog` sole entry; impl only from `confirmDeleteRow`); step-up MFA = optional layer, off by default (BE 403 → dialog → retry).

### Pending
- **#9 JSON explorer**: `format:"json"` generic → braces CTA + "Visualizza" label → right Sheet; inside: `JsonValueEditor` readonly + new third "explorer" tree view in `json-code-block`. `filter`/payload_map keep specific renderers.
- **#8** subject display_name text beside badge (needs census `display_name` in module contract).
- **Lint additions**: rules to catch contract elusions (TBD inventory).
- **Docs**: agent/dev/user updates for all new contracts (`color`, `null_label`, `ref` conventions, common-fields dict, soft-delete GUARD, crud_override).
- BE metas: migrate 33 hand-declared audit `label_key`s to common keys (JH `job_trigger`/`job_schedule` done this session).
- e2e actor strings (`e2e-admin`) — same audit convention violation as `user:` (test infra).

## 2026-11-19 (cont.) — #16 soft-delete-as-disable EXECUTED

### Done
- **`enabled` column dropped** (`job_trigger_entity`, JH patch `20261117000000` — applied live: 44 disabled→deleted rows migrated, column dropped, signed).
- **`deleted_at` IS the disable**: engine `loadTrigger`/`onEvent`/`refresh` gate on row presence (deleted rows never load); `jobs.service` `next_run` gate → `deleted_at == null`; `TRIGGER_FILTERABLE` − `enabled`; nav `default_value` removed.
- **Standard CTAs with chrome**: `meta.actions_overrides` on `job_trigger` — `delete.single/bulk` → "Disattiva"+`square`+destructive; `restore.single/bulk` → "Attiva"+`play`+warning. Label keys seeded (7 langs, same patch).
- **FE chrome contract**: `EntityAction.label_key/icon/text_color` → `EntityRowActions.delete_chrome/restore_chrome` → `TableRow` menu renders chrome (icon via `DynamicIcon`, `text_color` on item+icon). Defaults unchanged when no override.
- **Custom enable/disable RPC routes DELETED** (`/actions/enable-trigger`, `/actions/disable-trigger`) — standard delete/restore does the work; `afterWrite` publishes `jobs.ctl.triggers.changed`, engine re-derives. `setTriggerEnabled` → `setTriggerDeleted` (repo `delete`/`restore`, canonical `deleted_by`).
- **`crud_action` override mechanism** (SDK, prior session): `entity_op.crud_action` merges an RPC route into the standard `meta.actions` entry (endpoint+chrome) — the documented override path for cases like users+cascade. Triggers don't need it (standard ops suffice).
- **Verified**: `tsc` clean, 93/93 JH tests, check-standards clean, svelte-check clean; served meta contract verified at source (`jobTriggerMeta` — no `enabled` col, overrides present, `next_run` null_label on `deleted_at`, zap/amber-500 + send/sky-500).
- JH restarted on 3006 after crash on entity hot-reload; stack alive (3001/3003-3007/5173).

### Still pending
- Browser E2E of the live table (needs authenticated session — MFA flow).
- `run_stats` sparkline on restored trigger rows; ghost-row/restore UX manual check.
- Docs (agent/dev/user) for soft-delete-as-disable GUARD + chrome override + `crud_action`.

## 2026-11-20 — sheet-system enforcement + cell UX corrections + deletion-filter E2E

### Done
- **Sheet drift made impossible at lint time**: `no-restricted-imports` blocks now COMPOSE
  shared ban fragments per file scope (B1 vendor → B2 +sheet → B3 infra+switch →
  B4 +switch → B5 routes+chrome → B6 allowlisted routes). Root cause of the
  silent bypass: flat config is last-match-wins per rule — each later block's
  options REPLACED earlier ones, so the vendor/sheet bans were dead code
  (proven: only the last block's `Switch` ban fired). Union fragments +
  `mergeBans()` fix it structurally; probes flag `Sheet` from `@primebrick/ui`
  and `ui/sheet/*` paths, while SHEET_INFRA dirs stay exempt.
- **JsonViewerPanel** (`entity.jsonViewer`): registered in `SHEET_PANEL_IDS` +
  `SheetPanelPropsMap` + `SheetHost`; canonical `SheetPanelLayout` anatomy
  (braces icon matching the CTA, `SheetHeaderAction` explorer/raw toggle,
  `Sheet.Close`). `JsonCellViewer` is now a CTA-only component →
  `openSheet('entity.jsonViewer', { value })`. Direct `Sheet.Root` mount removed.
- **src/dst badges**: display name (census `label_key`, same source as the
  create-form combo) renders INSIDE the badge; the raw subject path lives in
  the canonical black `Tooltip` — repetitive tooltip when no display name is
  by design. Icon tint via `colorCssFromToken` inline style (Tailwind JIT
  never sees meta strings).
- **Filter condition chips**: badge keeps FilterBar prose anatomy (bold field
  + translated op + italic value); hover shows the canonical black `Tooltip`
  with that condition's own JSON fragment pretty-printed.
- **Text-link CTA style** (ref_count executions, viewer CTA):
  `CELL_TEXT_LINK_CLASS` = foreground text + `hover:bg-accent` (ghost token)
  + `hover:underline` — no persistent underline, no invented bg.
- **`filteredEntityListHref(census, entity, terms)`** — standard deep-link
  builder: entity name + wire terms → canonical `filters[i][...]` URL;
  `filteredListHref`/`reverseRefHref`/`entityRefHref` route through the same
  term writer. Documented in `docs/ai/entity-meta-schema.md`.
- **Translations seeded** (BE patch `20261120000000`, applied + signed):
  `app.common.explorer`, `app.common.raw` ×7 langs; `app.common.view` ×7
  verified already live in `public.translations`.
- **Deletion-filter regression — NOT a code bug**: new E2E
  `job-triggers-deletion-filter.spec.ts` proves ONLY/INCLUDED/EXCLUDED
  re-query with correct `deleted_records` AND the service honors it
  (`deletedTotal + nonDeletedTotal === allTotal`). User's observation was the
  pre-`deletionFilter={true}` bundle (param skipped → identical rows).
- Region/Priority mystery resolved: seed had pointed the demo trigger at a
  nonexistent subject (`e2e.source.dispatched`) → census misses → raw field
  fallback. Re-pointed at `crm.customer_high_value`; `subjectFieldLabel` now
  walks nested `properties` and uses `title ?? description`.

### Verified
- eslint probes: Sheet name + path imports flagged outside infra; infra files clean.
- `npx eslint` clean on all touched files; svelte-check 0/0.
- Vitest: entity-links 7/7, list-filter-params 8/8.
- Playwright chromium: deletion-filter spec 1/1 pass.

### Pending
- E2E for the JSON viewer panel (sheet open via registered id) + nats badge
  tooltip display-name rendering once a session auths as admin.
- Docs (dev-guide mdx + user-guide) for soft-delete-as-disable, `crud_action`,
  `filteredEntityListHref`, sheet-panel registration rules.
- BE metas: remaining hand-declared audit `label_key`s → `system.common.fields.*`.

## 2026-11-20b — virtual-column crash: root cause triplo + recovery design (TIC, approved study)

### Empirical findings — WHY `sort_key=next_run` produced a 500 + 15s crash loop

**`next_run` is a DECORATED virtual, not a projected one.** `JobTriggersService`
overrides `list`/`get` (`jobs.service.ts:203-213`): `svc.list()` returns the
page, then `decorate(rows)` mutates row objects adding `last_run`, `runs`,
`next_run` — two extra governed queries (grouped `job_runs` max/count +
`job_schedules` mirrors) + pure-TS `nextScheduleFire(schedule_spec)`.
The keys exist only on the wire; `ORDER BY`/`WHERE` on them → PG 42703 → 500.
How it passed every guard: the decoration uses `getDal().findAll` +
`Project.expr` on REAL columns of other tables (legal); `row.next_run = ...`
is legal on `JobTriggerEntity & Record<string, unknown>`; meta `virtual:true`
is honest but does not encode *query capability*. No lint can see it — the
contract itself lacks the distinction.

**Two kinds of `virtual` exist in the platform today, unmarked:**
- **Projected** — `cfg.list.aggregates` (`entity-service.ts:356-380`): LEFT
  JOIN + `Project.expr` + groupBy inside the list query → real result column.
  Precedent: `organizations.user_count` (`COUNT(u.id)`, declared
  `sortable:false, virtual:true`). ORDER BY on the alias works natively;
  WHERE needs a master-query wrapper / HAVING.
- **Decorated** — post-page TS mutation (JH `decorate()`): `runs`, `last_run`,
  `next_run`, `run_stats` on triggers; `live`, `drift` on schedules. Never
  in SQL → non-queryable, period.

**Server-side asymmetry (the missing enforcer):**
- Filters ARE gated: `translateFilterConditions(entity, filters,
  { allowedFields: cfg.list.filterableKeys })` — undeclared field rejected.
- `sort_key` is NOT gated: `entity-service.ts:390` sends it straight into
  `field(cfg.entity, sort_key as never)` → `ORDER BY <arbitrary string>`.
  No `sortableKeys` config exists. Any FE/meta drift = production 500s.
- `isColumnSortable`/`isColumnFilterable` are fail-open (`!== false`) —
  virtuals need explicit opt-out today (`user_count` is the lone correct one).

**The ~15s self-crash loop:** `useServiceAvailability.stamp` =
`status:last_health_check_at` — every service heartbeat mutates it.
`useEntityList.svelte.ts:592-603` refetches when `avail && changed &&
_state.error` — designed for down→up recovery, but JH is ONLINE (500 is
app-level) → degenerates into retry-every-heartbeat while error persists.
Docstring claim "once per real change" is wrong: stamp changes every ~15s.

**Why the page never healed:** `persistState` writes `skSort` to
sessionStorage — survives F5; every bootstrap replays the poisoned sort.
Only closing the tab clears it. Same poisoning path exists for
filters/search/page_size.

### Approved design — `lastKnownGood` + reset (generic list-error recovery)

- `_state.lastGoodConfig` = snapshot `{sortKey, sortDir, page, pageSize,
  filterValues, advancedFilters, search, searchInKeys, deletionFilterMode}`
  taken on every successful `loadRows` (memory-only; applying it re-writes
  the persisted keys via `persistState` → self-un-poisoning).
- Default ELT error view gains two actions (same ghost CTA style):
  **"Ripristina configurazione precedente"** (only when a lastGood exists —
  absent on failed first bootstrap) and **"Reimposta vista"** (clears all
  `sk*` keys + meta defaults + refresh = first load).
- Covers ANY failed list call (sort, filter, search, paging) — not just the
  virtual-column class. Two new i18n keys ×7.

### Fix candidates queued (ARCH + ENFORCER, post-study)
- `sortableKeys` in entity-service list config (symmetric with
  `filterableKeys`) → undeclared `sort_key` → 400, never SQL.
- `virtual` kind in meta contract: `projected` (queryable, sortable OK;
  filterable when wrapper lands) vs `decorated` (fail-closed) — replaces
  ambiguous `virtual: true`.
- `isColumnSortable`/`isColumnFilterable` → fail-closed for decorated
  virtuals (explicit `sortable:true`/`filterable:true` opt-in only).
- JH `runs`/`last_run` → `aggregates` projections (the same SQL decorate()
  already builds) → honestly sortable; `next_run`, `run_stats`, `live`,
  `drift` stay decorated → declared non-queryable.
- Recovery effect → one-shot on `available` false→true transition only.
- Master-query wrapper in query-builder so projected columns become
  filterable too (HAVING/WHERE-on-alias) — separate larger task.

### Remaining queued UI work (user-reported, this round)
- Keyboard-focus row border: always rendered (invisible→primary) to kill the
  2px flick; primary gradient + `rounded-md` (input-standard radius).
- Bulk "Elimina" on triggers → map to disarm-all RPC + dialog "tutte vs
  selezionate" (choice box); chrome override icon+label (precedent: exports
  dialog on customers).
- Column-selector + "Cerca in" panels: field icons, alignment-safe for
  iconless fields; standard filters panel: icon left of label; advanced
  filter field+operator comboboxes: icons.
- src/dst `event_subject` in standard+advanced filters must render the same
  subject combobox as create/update form (census-driven), not a raw text
  input — audit ALL fields rendered with the wrong widget.
- E2E sorting sweep: all columns visible → ASC/DESC/NONE per column → assert
  request params + compare result order with live DB.

### 2026-11-20c — next_run equivalence suite + cron truth (verified)

**SQL↔TS equivalence PROVEN**: `primebrick-workspace/temp/next-run-sql-equivalence.cjs`
— 28/28 cases identical (epoch ms) between core `nextScheduleFire()` and the
candidate `@Calculated` SQL expression: all units, exact-boundary ±1ms,
first-fire, negative elapsed, NULL armed_at, TZ offsets, multi-space,
`@at` no-space edge, cron/garbage → NULL.
**The suite caught a real drift**: PG timestamptz keeps µs, JS Date truncates
to ms → sub-ms `armed_at`/`now` shifts `floor(elapsed/iv)` at exact
boundaries (up to a FULL interval off). Fix inside the expr:
`date_trunc('milliseconds', ...)` on base AND now — mandatory, now proven.

**Cron truth — NO second interpreter needed**: NATS maintains
`Nats-Schedule-Next` on the stored schedule message with the server-computed
next fire (ADR-51, nats-server #7170, docs.nats.io headers ref) for
recurring schedules; `@at` singles get `purge` post-fire. The engine already
reads stored messages (`readStoredSchedule`). Design upgrade:
`job_schedules.next_run_at` PHYSICAL column, engine-materialized at arm /
after each fire / cleared on disarm → covers cron + @every + @at with the
scheduler's own truth, zero interpretation. Trigger `next_run` then =
calculated subquery on the mirror — sortable/filterable honestly.
Fallback (no engine work): calculated expr for @every/@at + NULL for cron
(today's exact semantics).

**Meta contract (agreed)**: `MetaColumn.kind` — physical (default) |
`calculated` (expr lives as `@Calculated` on the entity class prop; DAL
projects it in list/get; sortable+filterable default ON, opt-out allowed) |
`virtual` (post-query enrichment — decorate(); sortable+filterable FORCED
OFF; declaring `sortable:true`/`filterable:true` on a virtual column is a
construction-time error — validator + lint, impossible to build, not just
detectable). `isColumnSortable`/`isColumnFilterable` become kind-aware.
WHERE on calculated: v1 substitutes raw expr (scalars); aggregates need
HAVING/master-wrapper (separate task). `sortableKeys` server-side gate
(400, never SQL) — symmetric with existing `filterableKeys`.

## 2026-11-08 — Dict list-item anatomy (USER-DICTATED SPEC) + drift evidence

### The spec (verbatim requirements — contract, not suggestion)

**Row = 3-line list item, near-identical to the config-entries row (`ConfigListRow`):**

- **LINE 1**: `CHECKBOX | ICON | DISPLAY_NAME | TOOLTIP-ICON | TAGS` → far right: `CHEVRON UP/DOWN` + item-menu.
  - Version is **NOT** a tag — the **dict key** (`code`) is a tag.
- **LINE 2**: `DESC` — rendered only when the meta provides a description; **hidden entirely** when absent.
- **LINE 3**: `VERSION BADGE | LAST UPDATE | WHEN | WHO` (audit line).
- **1.1** The dict key is **not editable after creation** → it renders as a **TAG**, never a field.
- **1.2** The only field in the row is **VALUE** — for dict entities always `label_key`
  (config entries inherit the same concept; their value control varies by `type` internally).
- **1.3** ORDER is conveyed by **visual position** — no numeric input, no number printed as label.
- **1.4** The page must be **very close to the config entries list page**.

**Item-menu / CTA evaluation (user-dictated):**

- `EDIT` — absent on dict pages: the page itself IS the editor. Valid while the dict entity
  exposes only VALUE for update; **revisit if a dict entity ever needs >1 editable field.**
- `PREVIEW PANE` — does not apply (ELT-only surface).
- `DELETE` — currently the ONLY item CTA.
- `VERSION HISTORY` — opens from the version badge (same UX as forms); never in the menu.
- No custom actions / other entity actions assumed.
- **RULE: when the item menu has exactly ONE CTA, render that action's icon directly
  (no 3-dot menu); only when >1 CTA render the dropdown menu.** Deleted rows: delete→restore,
  still a single CTA → direct icon.

**Field-chrome rule violated (user-dictated):**

- Auxiliary CTAs on an input/combo go **inner-right** — canonical mechanisms already exist:
  `input-group` addon family (`input-group-addon`, `input-group-button`, `align="inline-end"`),
  `input/input-chrome.ts` trailing-icon classes, and `ComboSelect`'s own `trailing` snippet.
  **Never** a sibling button outside the control.

### Drift evidence (what was actually built vs spec — verified 2026-11-08)

| Spec | Built (violation) |
|---|---|
| version badge → LINE 3 audit zone; dict `code` = the tag | version badge next to title; `code` rendered as an editable field (since made readonly — still a field, not a tag) |
| LINE 2 desc conditional | no desc line at all |
| LINE 3 `version | updated | when | who` | audit partially present; version badge misplaced on LINE 1 |
| ICON + TOOLTIP-ICON + TAGS on LINE 1 | missing entirely |
| one VALUE field only | per-column labeled `FormFieldDispatcher` grid (form-card anatomy) — `sort` numeric input included |
| order = visual position | `sort` editable numeric input + printed value |
| CTA rule 1→icon / >1→menu | undo+trash inline ad hoc — correct only by accident, rule unenforced |
| languages CTA inner-right (trailing) | sibling `<Button>` OUTSIDE the ComboSelect (`TranslationKeyCell.svelte:85-118`) |
| near-identical to ConfigListRow | stacked mini-form ~4-5 lines tall; nothing matches |

### Pending

- Rebuild `DictRow`/`DictDraftRow` to the 3-line anatomy above (spec-first, no invention).
- CTA evaluation: single-CTA → direct icon; future >1 → menu (design decision recorded).
- Languages CTA → inner-right via canonical trailing mechanism.
- ENFORCEMENT (open — see chat): make the item anatomy + CTA-count rule construction-time
  (component contract), not a review-time hope.

### Optional row data (icon / desc / tooltip) — the wire contract (decided 2026-11-08)

These are **row data, not meta** — the meta describes the entity, not the row, and
mirroring row content in meta would be a 1:1 DB echo. The wire is the standard list
response: physical columns travel in the row JSON; the meta only *detects* them via
`columns_map` (DB columns are auto-reflected — zero meta duplication).

| Attr | Wire | Source |
|---|---|---|
| `icon` | physical `icon` column (raw lucide name — icons are NOT i18n) | per-entity opt-in column, like `label_key` — never on `DictEntityBase` |
| `desc` | **convention-derived** — `<label_key>.description` | the row's label_key IS its i18n address; descendants hang on the same stem |
| `tooltip` | **convention-derived** — `<label_key>.tooltip` | same suffix composition (analogy to `.description`) |
| non-keyed dicts (`name_local` family) | raw `description`/`tooltip` text columns | explicit column wins over derivation |

**Label-key composition standard (seeded, already decided — evidence):**

- Row label: `<ns>.entities.<tk>.rows.<code>` → `crm.entities.customer_type.rows.private`
- Description: `<label-stem>.description` → `entities.ai_model.qwen3_4b.description`,
  `entities.crm.pipeline.description`, `app.auth.*.description`
- Field hints: `<ns>.entities.<tk>.hints.<name>` (+ `_title`) →
  `entities.user_profile.hints.email_verified`

Presence rule: `$t(k)` returns the raw key when missing → element renders iff
resolved ≠ key. Absent data → absent element — never an invented fallback (icon,
tooltip, desc alike; enforced by `icon-no-fallback` in check-standards).

Derivation uses the LIVE `values[display_field]`: re-pointing `label_key` to a
`custom.*` key keeps derived keys inside `custom.*` — write boundary preserved.

### Audit-line sentence keys → `app.common.*` (decided 2026-11-08)

DictRow's LINE-3 audit was rendering `system.common.fields.updated_at`/
`updated_by` pairs — field-label vocabulary, muted, two separate pairs —
vs the reference `ConfigListRow` sentence anatomy (`text-primary`
connectors + italic muted values, who only rides with when).

User verdict: reuse the sentence keys BUT move them out of the
settings/config namespace — they are **audit vocabulary** → `app.common.*`:

- `system.settings.configurations.lastUpdatedPrefix` → `app.common.lastUpdatedPrefix`
- `system.settings.configurations.lastUpdatedByMid` → `app.common.lastUpdatedByMid`
- Patch `20261201000000_audit_line_keys_app_common.sql`: DELETE from
  `system.translations`, INSERT into `public.translations` ×7 langs
  (en-US included — old keys lacked it; signed dev-micha-2, applied).
- `ConfigListRow` re-pointed (6 sites); `DictRow` L3 rebuilt to the same
  sentence anatomy. Convention documented in `docs/ai/patterns.md`
  (list-item audit line + dict-row optionals wire contract).

### Seed audit-trail rule (enforced 2026-11-08 — user-raised)

Version-history on dict rows opened EMPTY: the dict seeds inserted rows
but never wrote `<table>_audit` — SQL seeds bypass the DAL so
`@AuditTrail` never fires. Rule (now in dal-pg `migrations.mdx`): **every
seed INSERT must be followed by the matching audit rows** — INSERT
action, `initial-setup`, full-column delta, `WHERE NOT EXISTS` idempotent.

Backfill `20261202000000_crm_dict_audit_backfill.sql` covers the 10 CRM
dict tables (customer_types, company_dimensions, legal_forms,
local_address_types, qualifications, marketing_qualifications,
contact_types, account_kinds, customer_link_types, consent_types) —
signed + applied; version-history sheet verified populated E2E.

OPEN GAP (flagged, not fixed): `20261125000000_customer_flat_to_children`
migrated customer rows into child tables (local_addresses,
customer_accounts, customer_contacts, customer_consents, customer_links)
with ZERO audit writes — same empty-history gap for child rows.
Backfilling those needs a migration-provenance decision (action=INSERT
with changed_by=migration? or the original row's actor) — user's call.

### Seed audit-trail — enforcement (2026-11-08)

Two levels, per user direction (lint + patcher code only, tests are the
second net):

1. **check-standards `seed-audit-trail`** (sdk tool) — scans
   `db-meta/patches/*.sql`: `INSERT INTO s.t` where `snapshot-entities.json`
   marks `s.t` `isAuditable` and the file lacks the `s.t_audit` INSERT →
   violation. Verified live: flags `customer_types` seed, passes
   `contact_types` seed that carries its audit rows.
   `seed_audit_exempt` in `.devin/check-standards.json` grandfathers the 3
   shipped violating files (crm seed_dictionaries, legal_forms_iso20275,
   customer_flat_to_children — data remediated by the backfill patch).
2. **`runMigrations` enforcer** (`assertSeedAuditTrail` in dal-pg
   `engine.ts`) — pre-SQL, per pending patch: collects `INSERT INTO s.t`
   targets, probes `to_regclass('s.t_audit')` in the catalog; audited
   target without its audit INSERT → patch `failed` BEFORE anything
   executes, `degraded` + ordering stop (same lane as a SQL error).
   Escape: `-- pb:no-audit-trail` pragma (third patch pragma, next to
   `requires-review`/`no-transaction`).

Both honor the pragma; `primebrick_database_patches` and `*_audit`
targets are never flagged. Doc: dal-pg `migrations.mdx` patch-semantics
bullet. Engine tests cover fail/apply/pragma/no-twin (22/22).

### Children audit backfill — CLOSED (2026-11-08)

`20261203000000_crm_children_audit_backfill.sql` backfills the 3 tables
`flat_to_children` populated (local_addresses 140, customer_contacts
268, customer_accounts 35 — verified 1:1 vs row counts). Provenance
rule (user-stated): **the trail author is the actor stamped in
`created_by`/`updated_by`** → `changed_by = t.created_by`,
`changed_at = t.created_at` for INSERT events. `'initial-setup'` stays
the seed-time convention only (config_entries precedent); a migration
is not a seed.
