# ELT `type:"ref"` Cell — Sheet Detail + External List CTA

## Status: ✅ DONE — verified 2026-11-13 (implementation + E2E green)

All phases landed (naming realized differently: `EntityRecordSheet` +
`EntityRecordSheetBody` + `EntityFormField` instead of a monolithic
`EntityFormSurface`; `CellAffordance` shared by ref + JSON cell
anatomies). `@Ref("user_profile")` on Auditable/Deletable mixins →
`withColumnConstraints` auto-derives `type:"ref"` — every audit `*_by`
column is a ref for free. `ref.presentation:"link"|"badge"` contract in
core. Verified: `ref-cell-sheet.spec.ts` **14/14** on the live stack.
This session also repaired 3 stale pins: display_name lives on the
input `value` attribute (not innerText), the audit section sits in a
collapsed-by-default Accordion (expand before asserting), and the
not-found state pins `entity-record-sheet-missing-hero` rather than
translated copy.

### Recon refresh 2026-12-22 — post-H3 + drift-closure, verified empirically

**Landed since this plan was written (all verified in code):**
- H3 uuid-PK migration DONE — every ref value IS a `uuid`; `local_address_id`→`local_address_uuid`, `contact_id`→`contact_uuid`, `customer_id`→`customer_uuid` in crm list-configs. G2 fully resolved; `ref.value_field` leftovers (`value_field:"uuid"` on `customer_accounts`) are now vestigial duplicates of the default — teardown candidate, not a blocker.
- `entity.record` NOT in `SHEET_PANEL_IDS`; `CellAffordance`/`EntityRecordSheet`/`EntityFormSurface`/`MetaValueCell` do not exist; `MetaColumn.ref` has no `presentation` field — Phases 3-5 all greenfield, no partial work to salvage.
- **POC path confirmed**: `user_profile` route decls exist (`list`/`detail`/`create`, `module-nav-meta.ts:82-84`) but carry NO `page_props.form` → fallback layout IS exercised, as planned.
- Audit `*_by` columns are NOT authored — auto-derived in `withColumnConstraints` (`column-constraints.ts:355-405`): `type` resolved from pgType (currently `text`), `options_source:"audit.actors"` + `audited` injected there, label `system.common.fields.*`. **The `@Ref` injection point is this exact block** — `phys.refEntity` → `type:"ref"` + `ref:{entity}` — same "class fact, never authored" doctrine as `audit.actors`.
- `created_by_name`/`updated_by_name`/`deleted_by_name` joins already serve resolved display names (`entity-service.ts:346-348`) — cells show names today, they just aren't links yet.
- Decorator home: `@AuditableField`/`@DeletableField` on mixins in `dal/src/entities/entity-base.ts`; persistence slot = `ColumnRegistration` (`entity-decorators.ts:79`). `@Ref` takes the entity NAME string (`"user_profile"` lives in BE — dal cannot thunk a class it doesn't own); meta-only ref, no DDL FK (audit actor = app-level join by design, cross-schema).

**Simplifications the new state allows:**
- Business-key ref resolution (`schedule_subject` etc.) unchanged — still `filter_field`→`rows[0].uuid`→GET.
- `ref.value_field`/`"id"` vocabulary deletion becomes pure teardown (no consumers left post-H3).
- Baseline/CI gate (`check-standards`) is now live on all repos — new FE code is gated from the first commit.

## Objective

When a column is decorated `type:"ref"` (lazy refs via `uuid`, strong FKs via `id`),
the cell renders a link-like value with TWO affordances:

1. **Text click** → opens a **sheet panel** (NOT the detail pane, NOT navigation)
   showing the associated record read-only, fetched via the target entity's GET,
   laid out by the same metadata-driven form machinery — but through a
   **formatter mapper** (all text/semantic display, no widgets).
2. **External-link icon at right edge of cell** → opens the target entity's
   `/list` page pre-filtered by the referenced key, in a **new browser tab**.

All behaviour derives from `MetaColumn.ref` metadata — never field-name
heuristics (`_uuid`/`_id` suffixes).

---

## Empirical audit — what already exists

| Layer | Asset | State |
|---|---|---|
| Meta contract | `MetaColumn.ref { entity, route?, filter_field?, value_field? }` in `primebrick-v3-core/src/entity-meta.ts:506-536` | **EXISTS** — `route:"detail"⏐"list"⏐"none"`, `value_field` default uid, `"id"` for true-FK pickers |
| Meta contract | `MetaColumn.reverse_ref` (1:N children links) | EXISTS — do NOT conflate |
| Constraints | `withColumnConstraints` validates ref invariants (`value_field`⇒route compat, `route:"list"`⇒`filter_field`, target field exists) | EXISTS in `primebrick-dal-v3/src/meta/column-constraints.ts` |
| Declarations | `list-config.ts` per module: `customer.customer_type_uuid → {entity:"customer_type"}` (uid→detail); `customer_account.local_address_id → {entity:"local_address", value_field:"id", route:"list", filter_field:"id"}` + `depends_on` | EXISTS |
| FE link builder | `src/lib/entity-list/entity-links.ts` — `entityRefHref` (detail→`[param]` substitution; list→`filters[i][field|op|value|connector]` deep-link), `reverseRefHref`, `filteredEntityListHref`, `appendListFilterTerm` (canonical wire format) | EXISTS + unit-tested |
| FE cell renderer | `TableCell.svelte:237-253` — `type:"ref"` renders a Badge `<a target="_blank">` to census-resolved route; `ref_count` plain text link | EXISTS — but is ONE link doing everything (wrong anatomy for the new spec) |
| Shared renderer | `CardField.svelte` delegates to `TableCell` | EXISTS — table + BOTH card views share ONE cell renderer already |
| Sheet infra | `openSheet('entity.<panel>', props)` host registry in `sheet-manager.svelte.ts`; panels: `searchIn`, `columns`, `filters`, `versionHistory`, `jsonViewer`… | EXISTS — new panel needs registry key + component |
| GET detail | `GET /api/v1/entities/:entity/:uuid` per entity (SDK `makeEntityRouter`, us `entities-route.ts`) | EXISTS — **uuid-only** |
| Form machinery | `EntityFormPage` + `FormFieldDispatcher` + `build-entity-form-schema` — meta→schema→dispatch | EXISTS — widget outputs only; `readonly` prop exists on dispatcher (for placement) but fields still render INPUT widgets |
| Ref pickers | `use-entity-ref-options.svelte.ts` — paged `/list` fetch, `depends_on` pivot scoping, label resolution | EXISTS (form surface only) |
| Display name | `displayValue = row[key + "_name"] ?? value` in TableCell:42 | Contract exists; audit `*_by_name` joins only cover audit actors — **generic ref `_name` joins do NOT exist** (raw uuid/id displayed today) |

## Gaps — mapped to requirement

### G1. Cell anatomy — DECIDED (user, 2026-11-11)

`type:"ref"` gets an explicit **presentation** contract:
- `ref.presentation?: "link" | "badge"` — new field on `MetaColumn.ref`
  (core contract + `withColumnConstraints` validation)
- **`"link"` = DEFAULT** — the new two-affordance anatomy, shared with the
  JSON renderer via ONE cell-link component (`CellAffordance`):
  - **Text**: `text-foreground` + `font-medium` (semi-bold FROM REST) +
    `underline` **on hover only** (`hover:underline`, per user correction).
    Base: `CELL_TEXT_LINK_CLASS`.
  - **Trailing icon**: rightmost cell edge, `opacity-0
    group-hover:opacity-100` (always in layout → no reflow).
  - **ref**: text click → record SHEET; icon `ExternalLink` click →
    target `/list` filtered, `target="_blank"`, `stopPropagation`.
  - **json** (`format:"json"`, `JsonCellViewer` rebuild): text click →
    `entity.jsonViewer` sheet; trailing `braces` icon is the same
    affordance (single click — everything opens the sheet, NO `_blank`).
    Icon moves from BEGIN-text (today) to trailing hover position.
    Text label stays `app.common.view` (open micro-question: could become
    a compact value preview).
  - Pure sheet-openers keep this shared anatomy — the trailing-icon
    SEPARATE action (`_blank`) exists ONLY on ref cells.
- **`"badge"` = OPT-IN** — the CURRENT anatomy preserved verbatim: badge pill
  as a single link → new page (`ref.route` decides detail-vs-list),
  `column.icon` rendered inside the badge. Never the default — must be
  declared explicitly in meta (`ref.presentation:"badge"`).

`route:"none"` under `"link"` presentation → label only, no affordances.
Under `"badge"` it already degrades to a plain badge.

### G2. `value_field:"id"` refs — RESOLVED by H3 → see `uuid-pk-h3-migration-plan.md`

The user caught the deeper truth: `id` leaking into refs at all is a
*construction bug*, not a fetch problem. Final decision: **eliminate
`id` entirely** — uuid becomes the PK (uuidv7, PG18 native) and every
FK column physically stores `*_uuid`.

With H3 landed:
- every ref value IS a target `uuid` → sheet fetch = canonical
  `GET /entities/{entity}/{uuid}` — no `/ref/` endpoint needed
- CTA = uniform `target/list?filters[0][field]=uuid&op==&value=…`
  (`uuid` is `@Unique` ⇒ always filterable) — the id-ref CTA
  micro-question evaporates
- `ref.value_field`/`"id"` contract is deleted; `@Ref` decorator on the
  entity class becomes the single source of truth
- the previously-broken `filter_field:"id"` links and id-pickers are
  removed, not fixed

Until H3 ships, uuid refs work end-to-end with today's machinery; the
9 `*_id` FK columns are the only ones gated on the sub-plan.

### G3. Record sheet — corrected analysis (layout is PAGE meta, not entity meta)

**Layout source (user correction)**: the placement contract lives on the
**page declaration** — `page_props.form` on a route decl (`kind:"create"`/
`"detail"` + `page_props.form`, e.g. JH create trigger in
`nav-declaration.ts`). It is NOT entity meta. The record sheet therefore
resolves the target entity's **form-bearing route from the route census**
and reuses THAT `FormPageDecl` (placement/order/sections/validators).
Only when NO route in the census declares a form for the entity does the
synthesized fallback apply (dict entities — see below).

**Existing sheet/create-update assets (user's prompt to look — found):**
- `config.badgeValueEdit` → `BadgeValuePanel.svelte` — STATIC hand-written
  add/edit sheet form (fields, footer CTA, live preview).
- `CurrencySelectPanel`/`PhonePrefixSelectPanel`/`ProtocolSelectPanel`/
  `TranslationEditorPanel` — more static sheet surfaces.
- `EntityDictPage` — the dict archetype: **create and update are ONE
  surface**, inputs generated at runtime from `meta.columns` via
  `FormFieldDispatcher` + `buildEntityFormSchema` — proves the dispatcher
  + zod engine already runs generated-forms outside page chrome.
- `EntityFormPage` — `kind:"create"|"detail"` + `page_props.form`
  archetype (zod + superforms + optimistic `version` PUT).
- `job.runDetail` / `RunDetailSheet` — remote module-owned sheet via
  `mountSheet(el, ctx)`, `ctx.api` fetch, loading/error states (the
  owner-service sheet precedent).

**Renderer engine naming (user correction)**: `TableCell` name is
ELT-coupled — value display is NOT an ELT-exclusive feature. Plan:
extract the per-type display core into a neutral component
(`MetaValueCell` — badge/bool/json/ref/datetime-IANA/nats_subject/
schedule_spec/sparkline/text), keep `TableCell` as the ELT `<td>` chrome
wrapper delegating to it. `CardField`, `PreviewPanel`, record sheets and
any future surface all consume `MetaValueCell`. ONE display engine.

**Sheet panel `entity.record`** (host registry — `entity.jsonViewer` pattern):
- Props: `{ entity, uuid, ref: ColumnRef }`; owner base via service registry
- Fetch: value resolves to target uuid — uuid/business refs by `uid`:
  the value IS the uuid → canonical `GET /entities/{entity}/{uuid}`;
  business-key refs (e.g. `schedule_subject`): `GET {entity}/list?
  filters[0][field]=<ref.filter_field>&[op]==&[value]=<v>` →
  `rows[0].uuid` → canonical GET — uniform, no new endpoints
- Layout: census `page_props.form` → synthesized fallback
- States: loading / 404 / 403 / missing-deleted / network error

**Render mode — DECIDED (user)**: the sheet renders the **form surface,
not formatters**. If editability exists, passing through TableCell's
string formatters is the wrong base — the same surface must flip to
widgets. So: `EntityFormSurface` (dispatcher + zod + superform +
placement grid) is the ONLY renderer; **read-only = every field
auto-disabled**, pencil toggles to write mode. Guards that must hold:
- fields declared `readonly`/`disabled` in placement/meta stay disabled
  ALWAYS (both modes)
- protected fields auto-disable in write mode too (e.g. dict `code`
  keys — the customer_type edit-mode precedent)

**Fallback layout** (no form-bearing route in census — dict entities):
synthesize `FormPageDecl` from `meta.columns` order — ALL columns in
declared order (system/audit columns are already positioned by the meta
machinery). DECIDED by user.

**Pencil-toggle — the "bomba"**: extract `EntityFormSurface` — schema
(`buildEntityFormSchema`) + placement grid + `FormFieldDispatcher`
(`surface:"form"`) + superform submit + optimistic `version` PUT —
chrome-agnostic (EntityFormPage page OR EntityRecordSheet sheet).
`EntityDictPage` is the existence proof for generated edit surfaces.

### G3b. `type:"ref"` semantics — what it feeds today (empirical)
`ref` is the FK semantic declaration, consumed by THREE surfaces:
- **form** — `entity_ref` control: server-paged combobox on
  `/{ref.entity}/list`, value=`uid`, label=`display_field`,
  `depends_on.filter_field` cascade scoping (kind→legal_form by country)
- **filter** — same combobox in FiltersPanel (IN semantics)
- **display** — cell link via `entityRefHref` census resolution

Business-key refs are a third species (user-confirmed legit):
`job_run.schedule_subject → job_schedule` stores the SUBJECT TEXT, not
uuid/id. Uniform resolution: **`filter_field` = "the target column the
stored value identifies"** → sheet fetch = `GET target/list?
filters[0][field]=<ff>&[op]==&[value]=<v>` → `rows[0].uuid` → canonical
`GET /:uuid`. Covers uuid (`filter_field:"uuid"`) AND business-key with
zero new endpoints. `route:"detail"` remains banned for business-key
(detail params are uuids — validator already enforces).

### G4. In-sheet link rule — DECIDED (user): `_blank` only, no nesting
Inside ANY sheet context, every link affordance navigates
`target="_blank"` to its canonical URL when one exists; affordances that
would open another sheet are DISABLED (sheets aren't URL-addressable —
feature loss accepted as the cost of a single standard):
- Nested ref cell in a record sheet: text AND icon → `entityRefHref`
  resolved `_blank` (detail route or filtered list) — never a nested sheet.
- JSON cell in a sheet: no canonical URL → affordance disabled (plain text).
- Record-sheet header CTA (resolved uuid): `_blank` filtered list.
Enforcement: a sheet-context flag propagated through `MetaValueCell` props
(or context) — link affordances map to `_blank` or disabled by rule, not
per-call-site judgment.

### G5. Icon CTA — filtered list URL
- `filteredEntityListHref(census, ref.entity, [{field, op:'=', value}])` — EXISTS
- field: `ref.filter_field ?? meta.uid` (uid refs filter `uuid=<uuid>`)
- value: `String(value)` — bigint-safe (`String(bigint)` → digits)
- `<a target="_blank" rel="noopener noreferrer">`, `stopPropagation`/`stopImmediatePropagation` on click so sheet doesn't open
- `routeCensus` already prop-drilled into TableCell

### G6. Meta coverage audit
- `type:"ref"` exists on: customer (type/qualification/marketing_qualification uuid), customer_accounts (kind_uuid, legal_form_uuid, customer_id?, local_address_id, contact_id), consents/contacts/links/local_addresses (type_uuid). **Audit every `*_uuid`/`*_id` column across all metas to flag refs declared only in comments** (e.g. `customer_account.customer_id` comment "strong FK" — check list-config coverage).
- Lazy uuid refs with no `route` → default `detail` — icon then needs `filter_field` default → uid column name from target meta (`meta.uid`, typically `uuid`). Confirm uid resolution path at runtime (target meta fetch — already needed for the sheet anyway).

### G7. i18n keys
- Sheet title/empty/error/loading keys — new keys under `system.common` or per-module `entities_ns` — follow snake_case convention + patch + `redis-cli DEL` invalidation (doc: `.devin/rules/translations-cache-invalidation.md`)

### G8. E2E coverage
- Table cell: text click → sheet opens, shows target record read-only
- Icon click → new tab `/<target>/list?filters[0]...` (assert URL + filtered state)
- Event isolation: icon click does NOT open sheet
- uid ref + id ref (`local_address_id`) both resolve
- null value → no affordance, plain `-`
- deleted/missing target → empty state
- dict page surfaces (CardField shares TableCell — verify both card modes)

---

## Proposed implementation phases

### Phase 1 — Contract decisions
- ✅ **G1 DECIDED** — `ref.presentation?: "link"|"badge"`, default `"link"`:
  `font-medium` at rest + `hover:underline`; text→sheet; rightmost
  `ExternalLink` CTA appears only on hover → filtered list `_blank`.
  `"badge"` = today's single-link badge verbatim, explicit opt-in only.
- ✅ **JSON renderer unified** — `JsonCellViewer` rebuilt on the SAME
  cell-link anatomy (shared `CellAffordance` component): text click →
  `entity.jsonViewer` sheet, trailing `braces` icon on hover (was
  begin-text), single click affordance, no `_blank`.
- ✅ **G2 DECIDED** — H3 sub-plan (`uuid-pk-h3-migration-plan.md`): `id`
  eliminated, uuid=PK (uuidv7). All refs are uuid → canonical `GET
  /:uuid` + uniform `filter=uuid` CTA. `/ref/` endpoint deleted.
- ✅ **G3 layout DECIDED** — layout is PAGE meta: census `page_props.form`
  first; fallback = ALL `meta.columns` in declared order (user).
- ✅ **G3 render DECIDED (user)** — sheet renders `EntityFormSurface`
  (widgets, not formatters): readonly = all fields auto-disabled;
  declared `readonly`/`disabled` and protected fields stay locked in
  write mode too. `MetaValueCell` out of scope for the sheet.
- ✅ **G4 DECIDED** — in-sheet links: `_blank` canonical navigation only;
  sheet-opening affordances disabled. No nested sheets.
- ✅ **Ref source DECIDED** — `@Ref` decorator on the entity class drives
  DDL FK + served meta + nav (sub-plan A6); list-config stops carrying
  `ref:` for decorated columns.
- ✅ **Pencil-toggle DECIDED (user)** — IN this phase, as POC. The POC
  case: **audit `_by` columns → `user_profile`**, declared ONCE via
  `@Ref` on the `Auditable`/`Deletable` mixin base (auto-inherited by
  every entity — no repeating). `user_profile` has no `page_props.form`
  → exercises the **fallback layout** first. Bonus coverage: it is a
  cross-service ref (crm/jh → BE-owned `user_profiles`), values are
  already `user_profiles.uuid`, and the `UserProfileRefEntity` join
  machinery already exists.
- ✅ **POC surface DECIDED** — `EntityFormSurface` renders the record:
  readonly = all fields auto-disabled; declared `readonly`/`disabled` +
  protected fields stay locked in write mode; pencil toggles.

### Phase 2 — H3 migration (sub-plan `uuid-pk-h3-migration-plan.md`)
uuid→PK uuidv7, `id` removal, `*_id`→`*_uuid` FK conversion, `@Ref`
decorator, `meta.uid` teardown — **gate: this must land before the
record sheet supports id-FK refs; uuid refs work today**

### Phase 3 — Record sheet + form surface — POC FIRST
**Order: contract (dal+core) → fe machinery → cell anatomy**

- **3a. `@Ref(entity)` decorator** (dal `entity-decorators.ts`): writes
  `refEntity` on `ColumnRegistration`; applied to `created_by`/`updated_by`
  (Auditable) + `deleted_by` (Deletable) in `entity-base.ts` → every
  entity inherits `type:"ref" → user_profile` for free.
- **3b. Injection in `withColumnConstraints`**: auto-derive block emits
  `type:"ref"` + `ref:{entity: phys.refEntity}` when the class declares it;
  authored restatement banned (same doctrine as `audit.actors`).
- **3c. `MetaColumn.ref.presentation?: "link"|"badge"`** (core contract +
  `withColumnConstraints` validation) — default `"link"`.
- **3d. `EntityFormSurface.svelte`** — extract chrome-agnostic surface
  from `EntityFormPage` (schema + placement grid + dispatcher + superform
  + optimistic `version` PUT); EntityFormPage refactors onto it.
- **3e. `EntityRecordSheet.svelte` + `entity.record` registry**: resolve
  value→uuid (direct for uuid refs; `filter_field`→`rows[0].uuid` for
  business-key), census `page_props.form` or fallback layout, read-only
  = all fields disabled + pencil toggle, sheet-header `_blank` CTA,
  loading/404/403/deleted states + i18n patch + redis DEL.
- **3f. Sheet-context flag** for the `_blank`-only in-sheet rule.
- **3g. `CellAffordance.svelte`** shared text+trailing-icon anatomy;
  `TableCell` ref branch → text→`entity.record` sheet, `ExternalLink`→
  filtered list `_blank`; `JsonCellViewer` → same anatomy (`braces`
  trailing, →`entity.jsonViewer`); `route:"none"`→label, null→`-`.
- `EntityFormSurface.svelte` — extract chrome-agnostic form surface
  (schema + placement grid + dispatcher + superform + version PUT) —
  EntityFormPage refactors onto it; sheet renders it disabled-by-default
  + pencil toggle
- `EntityRecordSheet.svelte` + `entity.record` registry: uuid resolve
  (canonical GET; business-key via filter_field→rows[0].uuid), census
  `page_props.form` or synthesized fallback, sheet-header `_blank`
  filtered-list CTA
- Sheet-context propagation for the in-sheet `_blank`-only rule
- loading/404/403/missing-deleted states + i18n patch + redis DEL

### Phase 4 — merged into 3g (cell anatomy ships WITH the POC)

### Phase 5 — Coverage + tests
- audit `*_uuid` columns → `type:"ref"` where missing (`*_id` no longer exists)
- `ref.value_field`/`"id"` vocabulary teardown (vestigial post-H3 — no consumers)
- E2E `ref-cell-sheet.spec.ts` + unit tests + svelte-check + check-standards green

## Files touched (fe-v3 unless noted)

- `src/lib/components/entity-list-table/table/TableCell.svelte` — ref + json branches → `CellAffordance`; display core → `MetaValueCell`
- `src/lib/components/entity-list-table/table/CellAffordance.svelte` — NEW shared text+trailing-icon cell component
- `src/lib/components/entity-list-table/table/JsonCellViewer.svelte` — rebuild on CellAffordance (trailing hover braces)
- `src/lib/shell/sheets/panels/EntityRecordSheet.svelte` — NEW
- `src/lib/shell/sheets/sheet-manager.svelte.ts` — registry entry `entity.record`
- `src/lib/entity-form/EntityFormSurface.svelte` — NEW extracted chrome-agnostic form surface (pencil toggle; EntityFormPage refactors onto it)
- `src/lib/entity-list/entity-links.ts` — maybe `refSheetProps()` helper; likely unchanged
- `primebrick-v3-core/src/entity-meta.ts` — `ref.presentation?: "link"|"badge"`; `value_field`/`uid` removal (sub-plan)
- `be-v3` i18n patch + manifest re-sign + redis DEL
- `us-v3/crm` list-config coverage fixes (if audit finds undeclared refs)
- E2E spec + unit tests

## Acceptance criteria

1. Clicking ref **text** opens sheet with the record rendered read-only via metadata layout — no inputs anywhere
2. Clicking the **external-link icon** opens `target/list?filters[0][field]=<ff>&[op]==&[value]=<v>` in a NEW TAB — sheet stays closed
3. Default `"link"` anatomy: `font-medium` text at rest, `underline` on hover only; rightmost `ExternalLink` CTA appears only on hover, no layout shift
4. JSON cells share the same component: `braces` icon trailing on hover (was begin-text), single click → `entity.jsonViewer` sheet, no `_blank`
5. `ref.presentation:"badge"` → EXACTLY today's behaviour (badge single-link → new page, `column.icon` inside badge) — only when explicit in meta
6. All refs are uuid (post-H3) → canonical `GET /entities/{entity}/{uuid}`; CTA uniform `filter=uuid`; `id` eliminated entirely
7. Table + both card views identical behaviour (shared renderer)
8. All formatting semantics identical to cell display (badge colors, datetime IANA, bool icons, JSON viewer)
9. Null ref → plain cell, no affordances; `route:"none"` → label only
10. No field-name heuristics; routes census-resolved; filter wire format canonical
11. E2E green; svelte-check clean; no regressions on ref_count

## TURN LOG — 2026-12-22

### Phase 3a-3c LANDED (contract layer)
- **3a `@Ref` decorator** — dal `entity-decorators.ts`: `refEntity` slot on
  `ColumnRegistration` + `EntityPersistenceMeta` pass-through + `@Ref(entity)`
  applied to `created_by`/`updated_by`/`deleted_by` on `Auditable`/`Deletable`
  mixins (`entity-base.ts`). Every entity inherits refs → `user_profile`.
- **3b injection** — `withColumnConstraints` auto-derive emits `type:"ref"`
  + `ref:{entity}`; `injectDerived` force-injects on authored entries;
  authored `ref`/`type`≠"ref" on @Ref columns → throw (class-fact doctrine);
  system-col type validator resolves `refEntity`→`"ref"`.
- **3c `ref.presentation?: "link"|"badge"`** — core `MetaColumn.ref`, `"link"`
  default per the decided contract.
- **Tests**: 4 new cases in `column-constraints.test.ts` (auto-derive, authored
  tuning keeps ref, restatement/contradiction throws, domain @Ref) —
  69/69 file, **602/602 dal suite**, tsc+standards clean, builds green.
- **Live-verified**: crm `customerMeta` serves all three actor columns as
  `type:"ref"` + `ref:{entity:"user_profile"}` + `audit.actors` vocab.
- Commits: dal `224043a`, core `3523acc`.
- **Interim anatomy note**: cells already render (badge single-link → user
  detail `_blank`) until Phase 3g's CellAffordance lands — working, not final.
