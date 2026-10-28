# Entity Form Archetype — pilot `job_rule` + platform standardization

> Sub-plan of `metadata-driven-page-system.md` (task 2 — form archetype) and
> continuation of `form-pages-anatomy-audit.md` (§11–§18 design decisions).
> Scope: first host-rendered entity create form (`/system/job/rules/create`),
> plus the under-the-hood standardization it exposes: served column
> constraints, form widget registry, `format` closed vocabulary, module
> emitted-events declaration.

## Status: ✅ DONE (pilot green end-to-end, anatomy pass verified) — Plan date: 2026-10-24 · last update 2026-10-27

### Anatomy-correction pass (2026-10-27, post-review)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 8 | core/sdk: `ModuleEventsDecl.emits` → `EmitDecl[] {subject, description_key?}` (full structured); `validateFormPage` accepts `description_key`; wire-int checks accept ext-json BigInt (`isPositiveWireInt`); vendor-plane += `svelte/transition` | ✅ | copy-button's `scale` import needed the new specifier — VENDOR_ENTRIES + `entries/svelte-transition.ts` + app.html import-map entry |
| 9 | ui: `ScheduleSpecInput` → `ClipboardClock` (no lexical collision with `calendar-clock`=datetime); assist CTA in documented second trailing slot (dynamic `right-10`/`right-3`, `pr-16`/`pr-10`); `parent-sync.ts` (`isChildTab`/`notifyParentAndClose`) | ✅ | rebuilt; remote chunks rebuilt (jobs-page, emailsender-pages) |
| 10 | fe: `EntityTablePage navStrategy` default `'popup'` (settings pages cleaned of redundant prop); `EntityFormPage` canonical anatomy (header snippet: `AppPageBreadcrumb`+h1+desc, footer `flex gap-2` outline cancel, `{...props}`→controls, `FormLabelWithPriorityHelp` tooltip contract); `FormFieldDispatcher` (`controlProps` spread, JsonEditor `minRows=10`/`maxHeight=24rem`, census emits → `detailed` options: description + raw subject) | ✅ | svelte-check 0/0 |
| 11 | us: 4 `events-declaration.ts` migrated to EmitDecl (job adds `description_key`); remote child contract on SchedulePage/ProviderFormPage/TemplateFormPage + `syncChannel` receivers on job-schedules/providers/templates lists; `jobRuleMeta` tooltips on 6 fields + signed i18n patch `20261027200000` (MANIFEST 17 patches, dev-micha-2) | ✅ | registration verified live: emits `{subject, description_key}`, `span:2`, `description_key` all persisted |
| 12 | e2e: lifecycle spec → REAL popup contract (`waitForEvent('page')`, child closes itself, parent BroadcastChannel refresh, stray-dialog collection asserted EMPTY); contract spec CTA → popup + anatomy | ✅ | lifecycle 2/2; jobs-pages 13/13 (schedule CTA test updated to popup too) |
| 13 | rules: Pre-Implementation Anatomy Protocol codified — canonical `docs/ai/pre-implementation-anatomy.md` + `.devin/rules/` pointer + README index, in fe-v3 / v3-ui / us-v3 | ✅ | 6 gates: reference lock, contract read, allocation check, product-contract E2E, visual gate, signed checklist |
| 14 | visual gate: Playwright screenshots of `/system/job/rules/create` vs reference `configurations/create` — full anatomy verified rendered (breadcrumb, 8 fields, tooltips, JSON 10-rows, dual trailing CTAs, footer spacing) | ✅ | `test-results/anatomy-*.png`; tail capture after inner-scroll confirms all 8 fields |

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | core: `MetaColumn` += derived (`nullable`, `max_length`, `pg_type`) + authored (`format`, `pattern`, `min_length`, `min`, `max`, `secret`, `json_schema`) props; `FormPageDecl`/`FormFieldPlacement` types for `page_props.form`; `PageRouteDeclaration.presentation?: "page"\|"sheet"` | ✅ | 2026-10-24 | `MetaColumnFormat` closed union; `ModuleEventsDecl` in page-route.ts; core dist rebuilt |
| 2 | dal-pg: `withColumnConstraints(meta, EntityClass)` helper — projects `getEntityPersistenceMeta` onto `meta.columns`; throws at boot on unknown column key | ✅ | 2026-10-24 | `dal-pg/src/meta/column-constraints.ts`, 4/4 tests |
| 3 | sdk+be: `MicroserviceOptions.events` → `endpoints.events.emits` (existing JSONB envelope — **no db patch**) → `validateEventsDeclaration` enrollment gate → `DiscoveredModule.events` → `/modules`; full emits scan: ai/emailsender/job-handler/webhook declared, crm emits nothing, BE gap (no registry row) | ✅ | 2026-10-24 | 6/6 sdk tests; module-domain metadata, feeds subject pickers via census (already client-side at resolve time) |
| 4 | ui: extract pilot widget set → `@primebrick/ui` — CONTROLS: `TextInput` (ui/input), `JsonEditor`+`JsonCodeBlock` (CodeMirror deps, already lazy `import()` in onMount), new `ScheduleSpecInput`; FIELD WRAPPERS: `FormField` family (formsnap+sveltekit-superforms → ui deps), `PrimeField` (resolve `$lib/i18n` coupling → `getT()`) | ✅ | 2026-10-27 | extracted: Input/TextInput, Label, CopyButton(+UseClipboard), JsonEditor/JsonCodeBlock(+shiki), FormField family, PrimeField; 45 FE consumers redirected to @primebrick/ui, FE copies deleted |
| 5a | ui: `ScheduleSpecInput` — text input + live interpreter strip + assist popover (approved design, §F) + `parseScheduleSpec` util | ✅ | 2026-10-27 | croner@10.0.1 + cronstrue@3.35.0 (≥7d rule); parser+nextRuns+describe, 11/11 tests; i18n seed patch PENDING (keys echo raw until BE patch lands) |
| 5 | fe: resolver `archetype` branch (`kind+entity`, no `component_url` → `EntityFormPage`) + `FormFieldDispatcher` (format/type → widget, FE-local) + `buildEntityFormSchema` (FE-local, mirrors `buildConfigValueSchema`) | ✅ | 2026-10-27 | `EntityFormPage` in `src/lib/entity-form/`; 9/9 schema tests; preserved behaviors: `useSyncChannel` sender (`primebrick_<entity>_sync`) + `window.opener` close + `useUnsavedChangesGuard`/`useFormGuard` on superforms `tainted` + `reset({newState:$form})` rebaseline before leaving |
| 5b | be/dal: BigInt-over-wire fixes — `service_registry.endpoints` pinned `pgType:"jsonb"` (inferred `text` → raw obj hit node-pg `JSON.stringify`) + `delta-calculator` deep bigint normalization | ✅ | 2026-10-27 | `span:2` integers decode to `2n` via ext-json → both crash sites fixed; 5/5 dal tests |
| 6 | us/job: `meta: withColumnConstraints(jobRuleMeta, JobRuleEntity)` + authored props on columns + `events.emits` declaration + nav-decl `page_props.form` on rules/create + drop `component_url` + delete `RuleFormPage.svelte` | ✅ | 2026-10-27 | registration verified live (`span:2` preserved); `filter`+`source_subject` declared; i18n patch `20261027000000_job_rule_form_fields.sql` signed; SchedulePage stays remote (`/actions/`) |
| 7 | e2e: lifecycle spec (UI create → row visible → DELETE `uuid?version`, only created row) + contract spec (route resolves archetype, not remote/error) | ✅ | 2026-10-27 | `job-rule-form-lifecycle.spec.ts` 2/2; `jobs-pages.spec.ts` 13/13 incl. archetype contract; residue cleaned (0 live `e2e-rule-*`) |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## A — Verified architecture facts (no assumptions)

### The metadata chain, all existing pieces

```
JobRuleEntity (@Entity/@Column)        — physical truth: nullable, length, pgType, defaultSql
  └─ getEntityPersistenceMeta(ctor)    — dal-pg introspection (migration tooling uses it)
jobRuleMeta (*.meta.ts)                — authored enrichment: label_key, type, badge.values, order
  └─ assembleMeta (sdk entity-router:361) — serves + display_name + collaboration + actions
nav-declaration.ts → routes[].page_props — page domain: layout/policy/placement
  └─ census /modules → verbatim        — routesCensusFromModules spreads {...r, module}
catch-all [...path]                    — resolver → archetype branch → EntityFormPage
```

### Today's verified gaps

- Served `meta.columns` carry **zero constraint info** — class facts never reach FE (zod rules duplicated be↔fe, e.g. `DISPLAY_NAME_MAX = 255` copied literally).
- `service.register` has **no subjects/events field** — `NatsRoute[]` subscriptions are internal-only; `service_registry` never sees them. Emitted-event vocabulary is a missing module-metadata domain.
- `EntityServiceLike` (sdk, structural contract — sdk cannot import dal-pg) does NOT expose the entity class → constraints merge must happen **service-side at decl time** via a dal-pg helper, NOT inside `assembleMeta`.
- Resolver: declaration without `component_url` → `contract error` "until the generic archetypes exist" (explicit comment — the branch was always planned).
- job_rule live DB == entity class == meta (verified `information_schema`): `name` varchar(200) NN, `event_subject` text NN, `schedule_spec` text NN, `target_subject` text NN, `execution_context` varchar(10) NN default `'user'`, `enabled` bool NN default `true`, `filter` jsonb NULL, `source_subject` text NULL.
- `schedule_spec` grammar = **NATS JetStream native** (`Nats-Schedule` header, nats-server 2.14.3, ADR-51): `"@every <duration>"` | `"@at <RFC3339>"` | 5-field cron. BE classifies `schedule_type` on `startsWith("@at")` only.
- `filter` grammar closed (rules-engine.ts `matchFilter`): `{field: string, op?: "eq"|"neq"|"exists"|"contains"|"gt"|"lt", value?: unknown}[]`; `field` = dot-path into event payload (`getPath`).
- `source_subject` semantics (ADR-51): `Nats-Schedule-Source` — at fire time the scheduler reads the LATEST message on that subject and fires IT as payload (fire-time state indirection).
- Widgets inventory verified: `json-code-block/json-editor.svelte` (CodeMirror, `schema` prop → JSON Schema lint+completion), `config-list/ConfigValueInput.svelte` (per-type dispatcher incl. `type_config.api_url`-fed ComboSelect), SwitchField/ComboSelect/etc.
- No zod exists on job_rule today (raw `required` HTML only). Existing host zods (display_name min3/max255/alnum-edges, email 320, avatar hex, client_key 256, url 2048) are *correct authored semantics* — they merge into the format/props vocabulary, they are not drift refusi.

## B — Domain boundaries (no contamination)

| Domain | Declares | Lives in |
|---|---|---|
| Entity class | `nullable`, `length`, `pgType`, `defaultSql` | `job_rule_entity.ts` decorators |
| Entity meta (authored) | `label_key`, `type`, `badge.values`, `format`, `pattern`, `secret`, `json_schema`, order/visibility | `job.meta.ts` |
| Served column | authored ∪ derived (class-injected) | `withColumnConstraints` merge |
| Page decl | `page_props.form.fields[]` placement: `key`, `col`, `span`, `row_span`, `section`, `default_value`, `placeholder_key`, `required`, `readonly`, `widget` override; `validators` closed-vocab | `nav-declaration.ts` |
| Module | `events.emits`, nav/routes, schemas | register payload → `service_registry` |
| FE | widget archetype map, schema builder, validators registry | archetype implementation |

## C — Target field table (`/system/job/rules/create`, 8 fields)

| Field | Widget | Derived (class→served meta) | Authored (meta) | Page decl |
|---|---|---|---|---|
| `name` | `TextInput` | required, `max_length:200` | — | `placeholder_key` |
| `event_subject` | `ComboSelect` api-fed (free-entry allowed for wildcards) | required | `format:"nats_subject"` | options from `events.emits` census |
| `schedule_spec` | `ScheduleSpecInput` | required | `format:"schedule_spec"` | `default_value:'@every 5m'`, `placeholder_key` |
| `target_subject` | `TextInput` | required | `format:"nats_subject"` | `placeholder_key`; `validators:["target_matches_lane"]` |
| `filter` | `JsonEditor` (schema-aware) | optional (nullable) | `format:"json"` + `json_schema` (RuleFilter grammar) | `col:2` (full width) |
| `source_subject` | `ComboSelect` api-fed (free-entry) | optional | `format:"nats_subject"` | options from `events.emits` census |
| `execution_context` | `ComboSelect` | required | options derived from `badge.values` (single source) | `default_value:'user'` |
| `enabled` | `SwitchField` | required | — | `default_value:true` |

Every field renders inside `FormField` (superforms wrapper: label + constraints + errors + tainted); the "Widget" column is the CONTROL archetype emitted by `FormFieldDispatcher` into the `control` snippet. Non-form surfaces would use `PrimeField` — the archetype form is always a true form.

Cross-field rule `target_subject` must match `jobs.due.<execution_context>.*`: expressed as closed-vocab validator `target_matches_lane` in `page_props.form.validators` — UX-level check; authoritative enforcement stays BE-side at arm time.

## D — `format` closed vocabulary (MetaColumn, authored)

Controls widget + zod mapping. Closed union in core — unknown value = compile error in `*.meta.ts`:

```
"text" | "textarea" | "email" | "url" | "phone" | "secret" |
"nats_subject" | "schedule_spec" | "json" | "display_name" |
"idp_name" | "color_hex" | "number" | "money" | "date" | "datetime" | "time"
```

`format` absent → widget falls back to `type` (`text`→TextInput, `boolean`→SwitchField, `badge`→options ComboSelect, `datetime`→readonly display…).

`json_schema` (authored): JSON Schema object for `format:"json"` — drives JsonEditor lint/completion AND `buildEntityFormSchema` structural validation.

`secret` (authored bool): masks input (Password widget) + excluded from echo/preview.

## E — `page_props.form` (page domain)

```ts
interface FormPageDecl {
  fields: FormFieldPlacement[];          // ordered; only declared keys render
  validators?: FormValidatorKey[];       // closed vocab, FE-implemented
}
interface FormFieldPlacement {
  key: string;                           // must exist in served meta.columns → boot-checked FE
  col?: 1 | 2;                           // grid column (2-col standard)
  span?: 1 | 2;                          // colspan
  row_span?: number;
  section?: string;                      // groups fields under a section header (label_key)
  default_value?: unknown;
  placeholder_key?: string;              // i18n
  required?: boolean;                    // override: class-derived nullable wins by default
  readonly?: boolean;
  widget?: WidgetKey;                    // explicit override of format-derived widget
}
```

## F — `ScheduleSpecInput` widget (`format:"schedule_spec"`) — APPROVED

One control for the whole NATS grammar, wrapped in FormField like every field. Value stays a plain string.

```
┌─────────────────────────────────────────────┐
│ */5 * * * *                            [📅] │  ← TextInput + assist icon-button
├─────────────────────────────────────────────┤
│ ✓ At every 5th minute                       │  ← interpreter strip (always visible)
│ next: 14:35 · 14:40 · 14:45                 │     valid → describe + next-3 runs
└─────────────────────────────────────────────┘     invalid → ✗ reason + field invalid state
```

- **Free text primary** — `@every 5m`, `@at 2025-12-01T09:00:00Z`, `*/5 * * * *`
- **Interpreter strip** per keystroke: `cronstrue` describe (cron), parser proprio per `@every`/durata e `@at`/RFC3339, `croner` next-3 runs (aritmetica per `@every`, singola per `@at`)
- **Assist icon-button** → popover segmented `Intervallo | Una tantum | Cron`: mini-editor strutturato che scrive la stringa nel field (Interval `[n][unit s/m/h/d]`→`@every`; Once `DateWheelPicker`→`@at <RFC3339>`; Cron 5-campi/testo+preview)
- `parseScheduleSpec` util: closed 3-branch grammar → zod `.refine` via `buildEntityFormSchema`
- Deps: `croner` + `cronstrue` (versions via `pnpm view`, pinned); `@every`/`@at` = estensioni NATS → parser proprio, no lib

**i18n** (verified): `getT()`/`bindI18n()` slot (bridges.ts — host binds at boot, remote via `bindRemoteCtx`). Keys `app.widgets.schedule_spec.*` seeded in `public.translations` **all 7 UI langs** (en-GB/en-US/it-IT/fr-FR/es-ES/de-DE/pt-PT) — NO per-key en fallback exists (missing key = raw key; `en-GB-fallback.json` is BE-unreachable bootstrap only). One BE seed patch.

## G — Module `events.emits` declaration (module-domain metadata)

- `MicroserviceOptions.events?: ModuleEventsDecl` → verbatim into `endpoints.events` (existing JSONB envelope — **NO db patch**, same channel as `endpoints.nav`); `ServiceRegisterPayload.endpoints` carries it untyped (Record)
- `validateEventsDeclaration` (sdk) — enrollment gate in `service-lifecycle-subscriber` (same block as `validateNavDeclaration`): NATS grammar check (`*`/`>` wildcards), dedupe, unknown-key reject → malformed decl never reaches `service_registry`
- `module-discovery.service` → `DiscoveredModule.events` served verbatim on `/modules` — **zero new API/route/DAL**: the catch-all load already fetches `/modules`, so options are client-side at render time
- Picker convention verified: purpose RPC dropdown endpoints exist (`GET /api/v1/system/{organizations,roles}/active`) but are NOT needed here — census is the metadata carrier
- `event_subject`/`source_subject` → ComboSelect `options_source:"census.emits"` + `allowCreate` (native free-entry — wildcards and undeclared subjects stay valid)
- **Emits scan = accurate full scan** (done): `NatsClient.publish`/`jetstreamPublish`/`callNats` across BE + every US. Declared: `webhook.*.received` (webhook), `emailsender.response.*` (emailsender), `jobs.ctl.rules.changed` (job-handler), `jobs.result.ai.*` (ai). `crm` publishes nothing. Excluded by design: `jobs.due.*` (nats-server publishes at fire-time), `jobs.ctl.schedule.request` (callNats RPC, not an event)
- **BE emits = known gap**: BE publishes `config.changed`, `service.gateway_online`, `service.stale`, `emailsender.send`, `system.client_shield_registry.changed` — but BE never sends `service.register` and has NO `service_registry` row → no declaration channel today (free-entry covers; follow-up: BE self-declaration mechanism)
- `target_subject`: NOT emits-fed — structural pattern `jobs.due.<lane>.<svc>.<action>` (lane, not event)

## H — Work sequence (5 repos + e2e)

1. **core**: `MetaColumn` props (§D + derived trio), `FormPageDecl`/`FormFieldPlacement`, `presentation`
2. **dal-pg**: `withColumnConstraints(meta, EntityClass)` — maps `getEntityPersistenceMeta` columns → injects `nullable`/`max_length`/`pg_type`; throws on unknown `key` (boot-time drift enforcement)
3. **sdk+be**: `events.emits` via `endpoints.events` (no patch) → enrollment validation → `/modules`; per-service `events-declaration.ts` in ai/emailsender/job-handler/webhook
4. **ui**: extract pilot widgets — `TextInput`, `JsonEditor`/`JsonCodeBlock` (lazy CodeMirror), `FormField` family, `PrimeField`; build `ScheduleSpecInput`
5. **fe**: `format`/`pg_type`-aware `FormFieldDispatcher` + `buildEntityFormSchema` + `EntityFormPage` archetype (FormPageLayout shell, superForm, guards, POST `{entity:{…}}` on `entityApiBase`, notify, goto list) + resolver `archetype` branch
6. **us/job**: enriched `jobRuleMeta` (format/json_schema authored props) + `withColumnConstraints` + `events.emits` + nav-decl `page_props.form` + drop `component_url` + delete `RuleFormPage.svelte` + its dispatch entry (SchedulePage untouched — `/actions/` workflow, stays remote)
7. **e2e**: contract spec (route resolves archetype) + lifecycle spec (create via UI → row in list → `DELETE /svc/job/api/v1/entities/job_rule/:uuid?version=…`, only the created row)

## I — Open decisions (user)

- [x] `filter`: JsonEditor schema-aware (confirmed: widget exists in project)
- [x] `source_subject`/`event_subject`: census `events.emits`-fed ComboSelect + `allowCreate` (confirmed: source = registration facade, read via census — no new API)
- [x] Widget ownership: all referenceable widgets → `@primebrick/ui`; builder logic (dispatcher/schema-builders/validators) stays FE HOST (confirmed)
- [x] `events.emits` scope: full scan across services (confirmed — "accurata")
- [x] `ScheduleSpecInput`: approved — text + interpreter strip + assist popover (§F); tune during impl
- [x] Widget i18n: `app.widgets.schedule_spec.*` in `public.translations`, all 7 langs (no per-key en fallback exists — verified `i18n/index.ts:74`)
- [x] `FormField` family deps → **regular deps in ui** (decided): peerDeps would need import-map entries on every remote build (past pain); formsnap context must resolve to ONE instance — bundled inside ui guarantees it. Rule: never `import formsnap`/`sveltekit-superforms` directly in pages — always via ui `FormField` family
