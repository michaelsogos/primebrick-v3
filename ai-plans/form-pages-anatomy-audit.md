# Form Pages Anatomy Audit — every surface, every repo

> Sub-plan of `metadata-driven-page-system.md` — delivers the P0 evidence base
> for tasks 2–3 (`EntityMeta.form` + validation vocabulary) and feeds tasks
> 7–8, 17–18, and the remote-form capability gap.
> Method: empirical file-by-file audit of EVERY form surface — host FE,
> host sheets, remote chunks (ai/crm/emailsender/job) — verified 2026-10-27.

## Status: 🟢 ANALYSIS COMPLETE — 2026-10-27

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Inventory all form surfaces (host + remote + sheets) | ✅ done | §1 |
| 2 | Anatomy audit: header/content/footer, scroll owner, grid rules | ✅ done | §2, §3 |
| 3 | Widget audit: ui components vs raw HTML; checkbox-vs-switch | ✅ done | §4 |
| 4 | Validation audit: zod/superforms/formsnap vs manual; submit shape | ✅ done | §5 |
| 5 | Page-vs-sheet + enlarge CTA analysis | ✅ done | §6 |
| 6 | Non-form pattern mining | ✅ done | §7 |
| 7 | Config-entry runtime-meta form | ✅ done | §8 |
| 8 | label_key/metadata wiring state | ✅ done | §9 |
| 9 | Implications for `FormMeta` schema + sequencing | ✅ done | §10 |

---

## §1 Inventory — every form-bearing surface

### A. Host static form pages (`primebrick-fe-v3/src/routes/(app)/`)

| Page | Lines | Shell | superform+zod4 | Notable widgets | Bool widget | Pinned footer |
|---|---|---|---|---|---|---|
| `profile` | 556 | FormPageLayout | ✅ | TextInput×7, ComboSelect×2 | ⚠️ Checkbox×3 (readonly) | ✅ |
| `users/create` | 711 | FormPageLayout | ✅ | TextInput, ComboSelect×5, PasswordInput, AsyncValidatedInput×2 | ⚠️ **Checkbox×5 (editable!)** | ✅ |
| `users/[uuid]` | 476 | FormPageLayout | ✅ | TextInput×7, ComboSelect×3 | ⚠️ Checkbox×5 | ✅ |
| `organizations/create` | 334 | FormPageLayout | ✅ | TextInput×5, AsyncValidatedInput | — | ✅ |
| `organizations/[uuid]` | 325 | FormPageLayout | ✅ | TextInput×6 | — | ✅ |
| `clients/create` | 264 | FormPageLayout | ✅ | TextInput×3 | ✅ Switch×2 | ✅ |
| `clients/[uuid]` | 443 | FormPageLayout | ✅ | TextInput×4 | ✅ Switch×2 | ✅ |
| `configurations/create` | 634 | FormPageLayout | ✅ **+ runtime zod** | ComboSelect×10, TypeConfigBuilder×4, ConfigValueInput×4, Switch×2, Select×2 | ✅ Switch | ✅ |
| `roles/create` | 290 | ⚠️ **AppPageScaffold** | ❌ **manual `$state`+regex** | TextInput×3, ComboSelect×2 | ⚠️ Checkbox×4 + Switch×2 mixed | ❌ buttons at template tail |
| `roles/[uuid]` | 318 | ⚠️ AppPageScaffold | ❌ manual | TextInput×4, ComboSelect | ⚠️ Checkbox×4 + Switch×2 | ❌ |
| `modules/[code]` | 275 | FormPageLayout (no audit) | ❌ manual `<form onsubmit>` per section | **PrimeField×17**, TextInput×8, **raw `<select>`×1** | n/a | ✅ (no audit box) |
| `credentials` | 33 | AppPageScaffold | ❌ per-card saves | — | — | per-card |

### B. Host sheets (all use canonical `SheetPanelLayout` from `@primebrick/ui`)

Entity sheets: `PreviewPanel` (read-only, same `cell` snippet machinery →
labels meta-driven), `VersionHistoryPanel`, `ColumnsPanel`, `FiltersPanel`,
`SearchInPanel`. Shell panels: `DocsPanel` (**the only expand consumer**),
`AiChatPanel`, `ErrorsPanel`, `VersionsPanel`, `BadgeValuePanel`,
`CurrencySelectPanel`, `PhonePrefixSelectPanel`, `ProtocolSelectPanel`.
No host sheet contains an entity form today — sheets are utility panels.

### C. Remote chunk forms (`primebrick-us-v3/<svc>/fe/src/`)

| File | Lines | superform/zod | Inputs | Bool | Notes |
|---|---|---|---|---|---|
| `crm/CustomerCreatePage` | 41 | — | — | — | **STUB**: breadcrumb (mount_host) + title + `app.common.soon` — awaiting this plan |
| `crm/PipelinePage` | ~40 | — | — | — | placeholder scroll stub |
| `job/RuleFormPage` | 202 | ❌ none | **raw `<input>`×5, `<select>`×1** | ⚠️ **raw `<input type=checkbox>`** | manual `disabled`-until-filled; Cancel = styled `<a>`; Button via HostLeaf |
| `job/SchedulePage` | 197 | ❌ | raw `<input>`×4, `<select>`×1 | ⚠️ raw checkbox | same pattern |
| `emailsender/ProviderFormPage` | 269 | ❌ | raw `<input>`×6 | — | `ctx.nav.kind==='create'` mode detect; **secret-field UX** (api_key blank-on-edit = keep stored) |
| `emailsender/TemplateFormPage` | 285 | ❌ | raw `<input>`×3, `<textarea>`×4 | — | same pattern |
| `ai/AiSettingsPage` | 736 | ❌ (not a single-submit form) | ComboSelect×2 (bundled ui) | — | remote-owned scaffold hand-replicating AppPageScaffold classes; sticky section headers; segmented ButtonGroup; writes via `ctx.api` toggles |
| `ai/CerebellumSheet` | 317 | ❌ | ComboSelect×6 | ✅ Switch×5 | `SheetPanelLayout` ✓ |
| `ai/ModelImportSheet` | 566 | ❌ | ComboSelect×7 | ✅ Switch×5 | SheetPanelLayout ✓ |
| `ai/ModelCacheSheet` | 37 | — | — | — | SheetPanelLayout ✓ (display-only) |
| `ai/ModelTestReportSheet` | 200 | — | — | — | SheetPanelLayout ✓ |
| `job/RunDetailSheet` | 144 | — | — | — | ⚠️ **hand-rolled header+close** — pre-dates `SheetPanelLayout` in ui; must migrate |

---

## §2 The three host shells — anatomy contract (verified in code)

```
AppPageScaffold                FormPageLayout                  SheetPanelLayout (@primebrick/ui)
┌──────────────────────┐      ┌──────────────────────┐         ┌────────────────────┐
│ h-full p-2 sm:p-3    │      │ h-full p-2 sm:p-3    │         │ HEAD icon+title+   │
│ ┌ header shrink-0 ─┐ │      │ ┌ header shrink-0 ─┐ │         │      actions/close │
│ │ breadcrumb+h1 /  │ │      │ │ breadcrumb+h1 /  │ │         ├────────────────────┤
│ │ title+headerExtras│ │     │ │ title+headerExtras│ │         │ TOOLBAR (optional) │
│ └──────────────────┘ │      │ └──────────────────┘ │         ├────────────────────┤
│ ┌ bordered box ────┐ │      │ ┌ bordered box ────┐ │         │ CONTENT            │
│ │ children (NO     │ │      │ │ scroll: flex-1   │ │         │ min-h-0 flex-1     │
│ │  internal scroll │ │      │ │  overflow-auto ◄─┼─┼─ scroll │  overflow-auto     │
│ │  mgmt, NO footer)│ │      │ ├──────────────────┤ │         │  (ONLY scrollable) │
│ └──────────────────┘ │      │ │ FOOTER pinned    │ │         ├────────────────────┤
│                      │      │ │ bg-muted/50      │ │         │ FOOT (optional,    │
│                      │      │ │ border-t p-4     │ │         │  never scrolls)    │
│                      │      │ │ grid-cols-2:     │ │         └────────────────────┘
│                      │      │ │  audit|actions   │ │
│                      │      │ └──────────────────┘ │
└──────────────────────┘      └──────────────────────┘
```

- Scroll owner: **FormPageLayout owns scroll inside the bordered box**;
  AppPageScaffold leaves it to children (each consumer re-adds
  `min-h-0 flex-1 overflow-auto` by hand — verified: credentials does,
  roles lets the page flow, AiSettingsPage clones it).
- `AppPageLayout` (breadcrumb + title + right-side actions) exists in
  `$lib/components` but **zero routes use it** — the header-actions slot
  is real infrastructure awaiting consumers.
- Remote pages CANNOT use either shell — `AppPageScaffold` is FE-local —
  so ai/emailsender hand-replicate its class stack verbatim (documented
  comments). → needs a `RemotePageScaffold` equivalent in `@primebrick/ui`.

## §3 Grid & positioning rules (the "3 containers")

- Content grid: `grid grid-cols-2 gap-6 p-4`, columns = `space-y-4` stacks,
  fields manually assigned to col1/col2 markup order — **no section
  abstraction, no span control** (clients uses `grid-cols-1` — divergence).
- modules/[code] uses `grid-cols-2` inside `PrimeField` rows with
  `class="col-span-2"` for wide fields — the span primitive exists as
  ad-hoc class, not a decl.
- `grid-cols-2` is **fixed, not responsive** — inside a sheet (≈mobile
  width) it would squish; expanded sheet (50vw ≈ tablet) tolerates 2-col.
  → `FormFieldDecl.col/span` must emit responsive classes
  (`grid-cols-1 sm:grid-cols-2`, field `sm:col-span-2`), not fixed.

## §4 Widget conformance — CORRECTED (empirical)

> **Correction of my earlier claim**: the "capability gap" framing was
> wrong. The infrastructure for host-provided widgets in remotes is
> COMPLETE and verified: (a) remote chunks bundle `@primebrick/ui` via
> the vendor import map — `Button`, `Checkbox`, `Switch`, `SwitchField`,
> `ComboSelect`, `SliderField`, `Sheet*`/`SheetPanelLayout`, `Dialog`,
> `Popover`, `Tooltip`, `Command`, `SelectableFieldset`,
> `FormLabelWithPriorityHelp`, `input-chrome` CSS helpers are all
> importable inline TODAY; (b) `ctx.mount_host` + `ctx.components` mount
> ANY host component as a separate root (proven: `AppPageBreadcrumb`,
> `Button`). The divergence is therefore **non-conformance, not
> incapacity** — remote form authors hand-rolled raw `<input>` even
> though `Switch` was right there.

- **Remote forms use RAW HTML everywhere** (`<input>`, `<select>`,
  `<textarea>`) with hand-copied Tailwind input chrome — including a
  **raw `<input type="checkbox">` in `RuleFormPage` for `enabled`**,
  when `Switch`/`SwitchField` are bundled in the same chunk's vendor
  plane. Unjustified divergence.
- What remote chunks genuinely cannot use *inline* yet:
  `TextInput`, `PasswordInput`, `AsyncValidatedInput`, `PrimeField`,
  `FormField`/`FormControl`/`FormLabel`/`TranslatedFieldErrors`,
  `Label`, `Select`, `Textarea` — still FE-local. Extraction is one
  `mv` + export away (they're already plain components, no host deps
  beyond `$lib/i18n` which ui bridges handle via props).
- **BUT the end goal makes the remote-inline question moot for forms**:
  entity forms become HOST-RENDERED archetypes (see §12) — remote
  chunks keep only genuinely custom pages.
- **Checkbox-vs-switch violations**: `users/create`×5 + `users/[uuid]`×5 +
  `profile`×3 (readonly) + `roles`×4 + job remote raw checkboxes — the
  conforming precedent is clients (`Switch`×2) and ai sheets (Switch×5).
  → `MetaColumn.type:"boolean"` must default `widget:"switch"`.
- modules/[code] has **one raw `<select>`** inside the host — the only
  raw widget in host FE.

## §5 Validation & submit

- **Standard recipe** (8 pages): `superForm(defaults(zod4(schema)))`,
  `SPA:true`, `validationMethod:'oninput'`, `invalidateAll:false`,
  `resetForm:false`, `use:enhance` + `form` attr on footer Save →
  single-submit. Zod schema is **hand-written per page**, literally
  duplicating BE rules (`display-name.ts` fe ↔ `validation.ts` be).
- **No validation on remote forms** — only HTML `required` +
  `disabled`-until-nonempty on the submit CTA. No zod, no superform,
  no field-level errors.
- **roles**: manual `validate()` with regex + `$t` error keys — the only
  host page with neither zod nor superform; ALSO no FormGuard/unsaved
  protection (a navigation away loses work silently).
- **Non-single-submit surfaces** (must stay `custom` or gain a declared
  `submit_strategy`): roles (matrix submit), modules/[code] (per-section
  `<form onsubmit>`), credentials (per-card saves), AiSettingsPage
  (immediate toggle writes). → EntityFormPage default = single submit;
  the others remain custom — do NOT generalize them in v1.
- **Write-path divergence**: users/create → `/api/v1/auth/users`
  (Casdoor-coordinated), orgs/clients → `/api/v1/entities/<e>`, remotes →
  `ctx.api`. Generated forms need `EntityAction.endpoint` (plan task 30)
  or an explicit `write_endpoint` in the decl — otherwise the generator
  cannot know where POST goes.
- Escape behaviors to preserve via `page_props`/slots: slug auto-derive
  on blur (org `idp_name`), AsyncValidatedInput availability check,
  computed readonly display field (`idp_code`), secret-blank-on-edit
  (emailsender `api_key`), roles permission matrix tab.

## §6 Page vs sheet + the enlarge CTA

- `SheetPanelLayout` is already canonical and **remote-safe**
  (`onClose` required because Dialog context doesn't cross the remote
  mount boundary). Scroll rule identical to FormPageLayout: CONTENT is
  the only scrollable region; HEAD/FOOT never scroll.
- **Expand mechanism exists**: `setSheetExpanded(bool)` →
  `Sheet.Content` gets `w-1/2 sm:max-w-none` (+ becomes modal).
  Only `DocsPanel` implements the toggle today (title attr
  `app.docs.expand`/`app.docs.collapse`, `docs-panel-expand` testid).
- **Requested addition**: the same ESPANDI CTA on form-bearing sheets —
  generalize it as an opt-in `SheetPanelLayout` feature (e.g. `expandable`
  prop → standard header action), NOT per-panel reimplementation.
- **Responsive consequence for `meta.form`**: a form rendered in a sheet
  (≈mobile width) must collapse to 1-col; the SAME form enlarged (50vw)
  or rendered as a page needs 2-col. → `FormFieldDecl.col/span` map to
  responsive variants; `FormLayout.columns` is a *max*, collapsing under
  container width (container-query or `sm:` breakpoint rule decided at
  impl — container queries preferred: the sheet is an element context,
  not a viewport).
- job `RunDetailSheet` predates `SheetPanelLayout` in ui (hand-rolled
  header+close) → migrate to canonical layout.

## §7 Non-form pattern mining (adopt or leave)

| Pattern | Where | Verdict for FormMeta |
|---|---|---|
| Sticky section headers inside scroll (`sticky top-0 -mx-4 bg-background`) | ai console | Adopt as `FormSection.sticky?: boolean` |
| `AnchorTabs` + `AnchorTabsModeSwitch` (show-all/hide) | roles | Keep as page-level `slots`/custom — tabs inside a form are entity-specific |
| Segmented `ButtonGroup` toggles | ai console | Adopt as a widget (`segmented` — bool/enum selector) |
| Per-card saves (credentials: ChangePasswordCard/PasskeyEnrollment/MfaManagement) | credentials | Stays `custom` — independent mini-forms, not one entity form |
| Footer CTA strip clones (`bg-muted/50 border-t p-4`) | modules page, roles/[uuid], auth cards, ConfigListRow | Extract once (task 7 AuditBar + footer strip) — 6+ clones exist |
| `FormLabelWithPriorityHelp` (hint tooltip on label) | roles | Already the MetaColumn.tooltip mechanism — wire `tooltip*` into generated labels |
| `idp_code`-style computed readonly display | organizations | `FormFieldDecl.computed` or `kind:"display"` — a non-input field kind is needed |

## §8 The config-entry special form

`configurations/create` is the **runtime-metadata form precedent** —
already shipped and working:

- Static meta part: `name`, `type`, `type_config` (JSON), `label_key`,
  `value` — zod schema is hand-written BUT `value` is validated by
  **`buildConfigValueSchema(type, type_config)` — a zod schema BUILT AT
  RUNTIME from the declared `type_config.validation` vocabulary**
  (required/min/max/url/email/regex/unsigned…). This IS "Path C" from
  the pre-plan, proven in production.
- `TypeConfigBuilder` edits `type_config` (per-type rule panels);
  `ConfigValueInput` renders the correct widget for the selected `type`
  (18 types: string/text/boolean/bigint/number/money/badge/single_select/
  multi_select/url/secret/json/date/datetime/time/email/phone).
- `label_key` placeholder auto-derived; type switch revalidates via
  `validateForm({update:true, focusOnError:false})`.
- **For `meta.form`**: `buildEntityFormSchema(meta, mode)` follows the
  identical pattern — field zod from `MetaColumn.type` +
  `MetaColumn.validation` (promoted `type_config.validation` vocabulary),
  `superRefine` for cross-field. The config form itself migrates to
  `EntityFormPage` via `page_props.slots` for the type builder.

## §9 label_key / metadata wiring state (the important one)

| Surface | Wiring | State |
|---|---|---|
| Table columns | `col.label_key` → `$t` | ✅ meta-driven, correct |
| Audit box (FormPageLayout footer) | `auditingColumns[].label_key` | ✅ meta-driven |
| Page titles | `entityPageTitle(meta, 'create'\|'edit', $t)` | ✅ meta-driven |
| ELT action/preview labels | `meta.actions`/`label_key` | ✅ meta-driven |
| **Host form field labels** | `$t('system.settings.<m>.<page>.<Field>')` — **page-scoped literals** | ❌ **NOT wired to `col.label_key`** — every field label is duplicated: once as `<schema>.entities.<entity>.fields.<f>` (meta) AND again as a page key (dict). Drift already possible; translation authors maintain two parallel key sets. |
| Remote form labels | `FL(f)` = `<schema>.entities.<entity>.fields.<f>` | ✅ uses the entity-field convention — but resolved from module dict, NOT read from meta.columns (no lookup; the key pattern is hand-written in the page) |
| modules/[code] PrimeField labels | `$t('system.settings.modules.config.*')` | ❌ page-scoped |
| roles labels | `$t('system.settings.roles.*')` | ❌ page-scoped |

**Conclusion**: `MetaColumn.label_key` already exists and is explicit
(not derived — authors write the full key in `*.meta.ts`; convention
`<schema>.entities.<entity>.fields.<f>`). The generated form must read
labels/tooltips/errors from `meta.columns[key]` — closing the
duplication — with `FormFieldDecl.label_key`/`label` as overrides.
`entities_ns` on meta gives the namespace when a form needs
entity-scoped but non-field strings (e.g. section titles →
`<ns>.sections.*` convention to codify).

## §10 Implications — `FormMeta` schema & sequencing

Derived requirements for task 2/3 (they must all be true):

1. `FormFieldDecl` needs: `key`, `widget` (registry key; default from
   `MetaColumn.type` — `boolean→switch`, `datetime→DateWheelPicker`, …),
   `col`/`span` (responsive), `required`, `readonly`,
   `visible_if`, `default_value`, `validation` (promoted vocab),
   `computed`/`display`-only kind, `secret_policy` (never-reshow),
   `async_check` (availability-style async validator reference),
   `derive_from` (slug-from-display_name rule).
2. `FormLayout` needs `sections[]` with `sticky`, `title_key`,
   `columns:1|2` (max — responsive collapse in sheet context).
3. `EntityFormPage` needs `page_props.slots` for: avatar header,
   roles tab, permission matrix, type-config builder, key-rotation
   section — and `submit` override for non-entities write paths
   (`/api/v1/auth/users`) pending task 30.
4. **Prerequisite extraction (Wave-2, blocks everything remote)**:
   input family → `@primebrick/ui`: TextInput, PasswordInput,
   AsyncValidatedInput, PrimeField/FormLabel/FormControl/
   TranslatedFormFieldErrors (the formsnap bridge), Label, Select,
   Textarea, + a `RemotePageScaffold` (AppPageScaffold classes exported
   as a component). Until then remote forms CANNOT conform.
5. Sequencing (respecting plan phases):
   **P0a** — extract input family + `RemotePageScaffold` to ui
   (kills the remote capability gap AND hand-rolled scaffold clones);
   **P0b** — `meta.form` closed-schema types in `@primebrick/core` +
   `buildEntityFormSchema` (Path C, mirroring `buildConfigValueSchema`);
   **P1** — `EntityFormPage` in ui (FormPageLayout anatomy, AuditBar
   extracted, responsive grid, FormGuard/UnsavedGuard inside the
   driver) — prove on `organizations` create+edit (the cleanest pair);
   then migrate entity by entity; roles/modules/credentials stay
   `custom`; remote forms adopt after Wave-2 lands.
6. Enlarge CTA: add `expandable` to `SheetPanelLayout` (one-line feature
   — `setSheetExpanded` already exists) when form-in-sheet lands.

## §11 PG schema drift — empirical findings (live DB, 2026-10-27)

Dumped `information_schema` + `pg_constraint` for every form-backed
table. **Verdict: the schema is right** — its limits are deliberate
(varchar 255 names, 320 email per RFC 5321, 2048 URL, 7 hex color,
10-30 enums with CHECK constraints, 20 customer code). The code is
*partially aligned* — and where it is, it was aligned **by hand, in
two places**: `DISPLAY_NAME_MAX = 255` exists identically in
`be-v3/modules/auth/validation.ts` and `fe-v3/validation/display-name.ts`
— literal mirror copies that can drift silently.

| Entity.field | PG constraint | Form today | Drift |
|---|---|---|---|
| `organizations.display_name` | varchar(255) NULL | zod required 3–255 | form stricter — intended (Casdoor needs it) |
| `organizations.website_url` | varchar(2048) NULL | optional url, max 2048 | ✅ aligned |
| `organizations.idp_owner`/`idp_name` | varchar(255) NULL | required 3–255 | stricter, intended |
| `user_profiles.email` | varchar(320) NULL | required+email+max 320 | ✅ aligned (RFC) |
| `user_profiles.avatar_color` | varchar(7) | regex `#[0-9a-f]{6}` = 7ch | ✅ aligned |
| `role_mappings.idp_role` | varchar(255) NOT NULL | manual regex | ⚠️ max 255 unchecked |
| `customers.code` | varchar(20) NOT NULL | form is a stub | meta must declare max 20 |
| `customers.email`/`phone` | varchar(320)/varchar(64) NULL | — | meta must declare |
| `job_rule.name` | varchar(200) NOT NULL | HTML `required` only | ❌ **max unchecked → PG error on overflow** |
| `job_rule.execution_context` | varchar(10) NOT NULL | raw `<select>` | meta badge values ✓ but unenforced |
| `job_schedule.kind`/`lane`/`status`/`schedule_type` | varchar(30/10/20/10) NOT NULL | raw selects | meta badge values exist, input unconstrained |
| `providers.provider` | varchar(50) NOT NULL | `required` | ❌ max 50 unchecked |
| `email_templates.code` | varchar(100) NOT NULL | `required` | ❌ max 100 unchecked |
| `email_templates.language_iso` | varchar(10) NOT NULL | `required` | ❌ max 10 unchecked |
| `client_shield.source`/`key_mode` | varchar + **CHECK enums** | form max 120/256 | CHECK constrains exist DB-side only |

**Consequence for the design**: `MetaColumn` must carry the column's
real constraints (`max_length`, `pattern`, `options`, `nullable` →
form `required`) — declared ONCE in `*.meta.ts` (the service's own
schema), consumed by `buildEntityFormSchema` for zod AND by the widget
for HTML attrs (`maxlength`, `min`, `max`). A lint can diff
`MetaColumn.validation` vs `information_schema` — enforcement, not
audit. The hand-mirrored `displayNameSchema`/`idpNameSchema` pairs die;
they become `format: "display_name"`/`format: "idp_name"` archetypes
(min 3, max 255, alphanumeric-edges refine) declared in ONE place.

## §12 The end state — host-rendered form archetype (user's directive)

> "in FE definiamo il renderer form page, e tutto verrebbe costruito da
> FE HOST come ELT, niente più remote page."

Entity forms are rendered BY THE HOST from `meta.form`, exactly like
ELT renders tables from `meta.table`. Remote `component_url` pages are
reserved for genuinely custom pages (pipeline, settings console) —
**every remote FORM page gets deleted**:

- `job` `RuleFormPage`, `SchedulePage` → `meta.form` decls
- `emailsender` `ProviderFormPage`, `TemplateFormPage` → `meta.form`
- `crm` `CustomerCreatePage` (stub today) → `meta.form` — never built as remote
- Delivery declared via route census: `kind: "create"|"detail"` + entity
  binding → host resolves to the archetype, no chunk needed.

## §13 `FormPageLayout` → `@primebrick/ui` — the FORM archetype shell

Parallel to `EntityTablePage` (table) — the canonical form chrome:

- Moves to `@primebrick/ui` (with `EntityFormPage` above it that binds
  `meta.form` + fetch + guards).
- Props (bool opts on the chrome, never on anatomy):
  - `hide_footer?: boolean` — footer slot omitted entirely
  - `hide_audit?: boolean` — audit BAR hidden; the footer grid keeps
    its 50/50 geometry and the CTA cell position is UNCHANGED (the
    audit cell renders empty — verified layout: `grid-cols-2`, actions
    cell `justify-end`; hiding must not reflow CTAs).
- Internal scroll: **always** — `flex-1 overflow-auto` inside the
  bordered box is anatomical, never opt-out.
- The audit block (currently ~120 lines of hand-grid inside the footer)
  extracts to `AuditBar` (plan task 7) — shared by page footer and the
  sheet's reduced variant.
- i18n/audit inputs arrive via props (ui is app-coupling-free —
  `t`, `entities_ns`, `meta` injected).

## §14 Page ↔ Sheet duality — ONE form, two chrome hosts

**Sheet forms are NOT separate definitions.** The form archetype is a
body (`EntityFormBody`); the route's *presentation* picks the shell:

```
                  ┌──────────────────────────────┐
                  │        EntityFormBody        │  fields, sections,
                  │  (meta.form → widgets+zod)   │  validation, submit
                  └──────────────┬───────────────┘
        ┌────────────────────────┴─────────────────────────┐
        │                                                  │
┌───────▼─────────┐                            ┌───────────▼──────────┐
│ FormPageLayout   │  PAGE chrome              │ SheetPanelLayout     │  SHEET chrome
│  HEAD: breadcrumb+title+headerExtras         │  HEAD: icon+title+   │
│  BODY: scroll    │                            │        actions+close │
│  FOOT: audit bar │ audit bar full            │  BODY: scroll        │
│        + CTAs    │                            │  FOOT: version badge │
│                  │                            │        only + CTAs   │
└──────────────────┘                            └──────────────────────┘
```

- **Header mapping**: page `header/breadcrumb/title/headerExtras` →
  sheet HEAD `icon + title + actions + close`. Icon/title are already
  part of `PageRouteDeclaration` (`icon`, `label_key`) — the same decl
  feeds both shells. Today unused-in-page fields stay declared (a
  future page header may render icon/description).
- **Footer maps 1:1** — same `footerActions` slot; in sheet the audit
  cell renders ONLY the version badge (the `v{n}` element already
  opens `entity.versionHistory` — sheet reduces to exactly that).
- **ELT primary CTA** (`New …`) gains a presentation choice —
  the action stays in the entity domain, but *which chrome* is a
  page-domain decision: `PageRouteDeclaration` gets
  `presentation?: "page" | "sheet"` (default `page` — breaking-free
  because absent = current behavior). The CTA resolves the route decl:
  `page` → `goto`, `sheet` → `openSheet` with the host-owned
  `entity.form` panel (parameterized by entity+mode — NOT a remote
  `nav.sheets[]` chunk; the host owns form sheets once forms are
  host-rendered).
- **Sheet geometry**: normal ≈ mobile width → 1-col; expanded (50vw ≈
  tablet) → 2-col where declared. `FormLayout.columns` is a MAX;
  collapse by container width (container queries preferred — the sheet
  is an element context, not a viewport).

## §15 Two-slot sheet stack — pinned + swappable secondary

Problem: a form sheet may contain CTAs opening ANOTHER sheet (guide,
picker) — today `openSheet` REPLACES `sheetState.panelId`, unmounting
the form and losing typed input.

Mechanism (on `sheet-manager.svelte.ts`):

- `SheetOpenOptions.pinned?: boolean` — when set, the sheet enters the
  **pinned slot**. A second `openSheet` (non-pinned) goes to the
  **secondary slot** instead of replacing it.
- Max TWO slots: `pinned` (kept) + `secondary` (interchangeable — each
  subsequent `openSheet` swaps the secondary's content, pinned stays
  mounted with its state intact).
- Close semantics:
  - pinned sheet: **only via its own X CTA** — outside-close and ESC
    are suppressed while a secondary is on top (they close the
    secondary first; when no secondary is open, outside-close on the
    pinned sheet is a no-op or also closes it — DECIDE: user's guess
    was "outside-close goes back to the pinned sheet" ⇒ outside-close
    NEVER closes pinned, X only).
  - secondary sheet: normal close (X, outside, ESC); closing it leaves
    the pinned sheet active.
- Rendering: secondary stacks visually over/beside the pinned surface
  (offset `Sheet.Content` — e.g. secondary slightly wider or shifted
  left so both edges are visible; exact geometry at impl).
- `ctx.components.openSheet` passes `pinned` through `options` — remote
  sheets can request it too (or is it host-policy only? DECIDE:
  probably a decl-time flag `ModuleSheetDecl.default_options.pinned`
  + runtime override, same precedence as `side`/`modal`).

## §16 Input conformance sweep (the replacement plan)

Two canonical input wrappers — everywhere, no third way:

| Context | Wrapper | Used for |
|---|---|---|
| Inside a `superForm` | `FormField`+`FormControl`+`FormLabel`+`TranslatedFieldErrors` (formsnap bridge) | all real entity forms |
| Standalone/non-form | `PrimeField` | modules/[code] sections, credentials cards, settings toggles |

Sweep inventory (becomes host-rendered or fixed):
- **Host**: roles create/[uuid] → superForm+zod (drops manual
  `validate()`); modules/[code] → keeps per-section but inputs already
  `PrimeField` except **1 raw `<select>`** → `ComboSelect`;
  credentials → PrimeField inside each card.
- **Remote → host-rendered**: job/emailsender/crm forms deleted as
  remote chunks; their `meta.form` decls get the standard widget set —
  the raw-HTML pages never migrate, they're replaced.
- **Checkbox→Switch**: `type:"boolean"` ⇒ `Switch`/`SwitchField`.
  Checkbox survives ONLY for multi-select/matrix semantics (roles
  permission grid — selection semantics, not a boolean field) and
  readonly display (decide: profile's 3 disabled checkboxes → disabled
  Switch or badge — prefer disabled Switch, same widget read-write).

## §17 Metadata domains — the three vocabularies stay separate

| Domain | Lives in | Owns | Example |
|---|---|---|---|
| **Entity meta** | `EntityMeta`/`MetaColumn` (`@primebrick/core`) | WHAT fields exist, type, constraints, labels, widget default, validation | `MetaColumn.type`, new `MetaColumn.validation`/`max_length`, `label_key` |
| **Page meta** | `PageRouteDeclaration` + `page_props`/`layout` | WHERE/WHAT placement — sections, grid, presentation mode | `page_props.layout.sections`, new `presentation: page\|sheet` |
| **Module meta** | `ModuleNavDeclaration` (`endpoints.nav`) | WHICH routes exist, delivery, nav placement | `routes[]`, `sheets[]`, `component_url` |

`meta.form` sits on the ENTITY (field composition) but its layout
shape references PAGE placement rules — the two stay distinct: the
form decl says "section security, 2 cols"; the page decl says "this
route is a create form for entity X rendered as page|sheet".

**Widget archetypes (closed schema)**: every ui widget used by forms
gets a registered archetype — `type→widget` default map + a typed
`widget_options` contract per widget (`ComboSelect.options`,
`Switch`, `DateWheelPicker`, `ConfigValueInput`, …). Declaring an
option a widget doesn't own = **type error in the service's
`*.meta.ts`** — the closed schema IS the US→FE options contract.

**`MetaColumn` enrichment** (new props, snake_case):
`nullable?: boolean` (drives `required`), `max_length`,
`min_length`, `min`, `max`, `pattern`, `format` (`display_name`/
`idp_name`/`email`/`url`/`phone`/`hex_color` archetypes),
`options` (enum → select/badge values), `secret` (never-reshow
policy). These feed BOTH the input attrs and
`buildEntityFormSchema` — one declaration, two consumers, zero drift.

## §18 Revised sequencing

- **P0a** `@primebrick/ui` gains: `TextInput`, `PasswordInput`,
  `AsyncValidatedInput`, `Select`, `Textarea`, `Label`,
  `PrimeField` + formsnap bridge (`FormField`/`FormControl`/
  `FormLabel`/`TranslatedFieldErrors`), `AppPageScaffold` classes as
  `PageScaffold`, `FormPageLayout` (+`hide_footer`/`hide_audit`,
  audit → `AuditBar`), `EntityFormPage`/`EntityFormBody`,
  `input-chrome` already there ✓.
- **P0b** core: `MetaColumn` validation props + widget archetype
  registry + `meta.form`/`FormMeta`/`FormLayout`/`FormFieldDecl` +
  `PageRouteDeclaration.presentation`; FE: `buildEntityFormSchema`.
- **P1** two-slot sheet engine (`pinned` slot + swappable secondary);
  `expandable` on `SheetPanelLayout`; ELT CTA → `presentation`
  routing; migrate `organizations` create/edit first (cleanest pair).
- **P2** remote form pages → `meta.form` decls + host archetype;
  roles/modules/credentials stay `custom` for v1.

## Non-goals for this audit phase
- Rewriting any form (audit only — implementation follows P0b/P1).
- The per-section/immediate-submit surfaces stay `custom` in v1.
