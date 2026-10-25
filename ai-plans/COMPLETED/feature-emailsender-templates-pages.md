# Emailsender email_templates pages + settings/templates placeholder restore

> User directive: "email template di emailsender si intendevo quella e poi
> ripristina il placeholder in settings, è un monito per me". Two independent
> work items in one plan: (A) real email-template pages owned by the
> emailsender service module — same architecture as providers; (B) restore
> the deleted Settings → Templates mock page verbatim as a reminder.

## Status: 🟢 DONE — Plan date: 2026-10-24 21:20 UTC / 23:20 CEST — completed 2026-10-25 00:05 UTC

| # | Task (detail level) | Status | When | Notes |
|---|---------------------|--------|------|-------|
| A1 | SDK: add `EMAILSENDER_TEMPLATE_*` permission entries (`emailsender.email_template.*`) to `src/auth/permissions.ts` | ✅ done | 2026-10-24 | 14 entries; sdk rebuilt + api docs regenerated |
| A2 | US: `emailsender/src/modules/templates/template.meta.ts` — EntityMeta `email_template`, `entities_ns:"emailsender"` | ✅ done | 2026-10-24 | columns: code, language_iso, subject, updated_at |
| A3 | US: `templates.service.ts` — `getDal().entityService(EmailTemplateEntity)`, auditPort suppressed, filterable set | ✅ done | 2026-10-24 | providers.service.ts precedent |
| A4 | US: `entities-route.ts` — add `email_template` EntityRouteDecl (permissions + `{entity}` write body) | ✅ done | 2026-10-24 | `providerBody` renamed `entityBody` (shared) |
| A5 | US: `nav-declaration.ts` — `templatesPaths` via entityPaths; nav leaf + list/create/detail routes | ✅ done | 2026-10-24 | icon `layout-template`; nav-declaration.test updated (6 passed) |
| A6 | US: `fe/src/TemplateFormPage.svelte` + route dispatch in `fe/src/index.ts` | ✅ done | 2026-10-24 | dispatches on ctx.nav.route `/templates` prefix |
| A7 | US: db patch — seed `emailsender.nav.templates` + `emailsender.entities.email_template.*` ×7 languages + sign manifest | ✅ done | 2026-10-24 | patch 20261025015000_templates_pages.sql (119 rows) |
| A7b | **Follow-up fix**: `EmailTemplateEntity` → `Deletable(Auditable(EntityBase))` + generated patch `20261024235935_addcols_emailsender_email_templates.sql` (deleted_at/deleted_by) | ✅ done | 2026-10-25 | DELETE was 500 — entity had no @DeletableField; mirrors ProviderEntity; signed + applied |
| A7c | BE i18n patch `20261025020000_emailsender_error_scope_keys.sql` — `app.entities.emailsender.{provider,email_template}.error.{singular,plural}` ×7 | ✅ done | 2026-10-24 | templates keys were missing; providers keys were a latent gap — both fixed |
| A8 | FE: `ENTITY_SERVICE_MAP` += `email_template: 'emailsender'` | ✅ done | 2026-10-24 | api.ts |
| A9 | FE: static host-rendered list `system/emailsender/templates/+page.svelte` (EntityTablePage) | ✅ done | 2026-10-24 | providers/+page.svelte precedent |
| B1 | FE: restore `(app)/system/settings/templates/+page.svelte` verbatim from `dbee2ea^` | ✅ done | 2026-10-24 | byte-identical mock — "monito" |
| B2 | BE: `module-nav-meta.ts` — add templates route decl (`kind:"page"`) + nav leaf | ✅ done | 2026-10-24 | |
| V1 | Verify: unit/integration tests, svelte-check 0/0, nav-declaration validator test, live walkthrough | ✅ done | 2026-10-25 | see Verification |

---

## Context — what was found

`/system/settings/templates` was deleted in `dbee2ea` (emailsender
migration commit — same sweep that removed `settings/email-providers`); it
was a pure mock (`$state` fake rows, `console.log`/`// TODO` handlers).
The real domain entity `emailsender.email_templates`
(EmailTemplateEntity: code, language_iso, subject, body_html, body_text,
mjml_source, variables) is registered in the service entity registry but
has never had meta/service/routes/pages declared — orphan plumbing.

## Part A — emailsender `email_template` pages (providers architecture)

Mirror of the providers surface, verbatim conventions:

- **Entity CRUD** via `entities:` decl → `makeEntityRouter` →
  `/ws/emailsender/api/v1/entities/email_template/{meta|list|:uuid}`.
  Write envelope `{entity}`-only (translations are gateway-owned).
  Permissions: NEW SDK entries `emailsender.email_template.{meta,list,
  read.single/all,create,update,delete}` — provider grants are NOT reused.
- **Meta** (`template.meta.ts`): `entities_ns:"emailsender"`, `uid:"uuid"`,
  `display_field:"code"`, columns code/language_iso/subject (+audit cols
  `default_visible:false`), `default_sort updated_at desc` — identical
  table block to providerMeta.
- **Service** (`templates.service.ts`): lazy `entityService` facade;
  `auditPort.writeAudit = noop` (no `email_templates_audit` trail —
  providers requirement precedent); filterable/searchable = code,
  language_iso, subject.
- **Nav** (`nav-declaration.ts`): `entityPaths("/system/emailsender",
  "templates")` → nav leaf `emailsender.nav.templates` (icon TBD,
  lucide-verified) + routes:
  - `templates` — `kind:"list"`, `entity:"email_template"` (host-rendered,
    NO component_url — EntityTablePage archetype)
  - `templates/create` — `kind:"create"` + `component_url` →
    emailsender-pages.js
  - `templates/[uuid]` — `kind:"detail"` + `component_url` →
    emailsender-pages.js
- **Remote form** (`fe/`): `TemplateFormPage.svelte` — fields code,
  language_iso, subject, body_html, body_text, mjml_source (textarea),
  variables (JSON textarea, optional). `index.ts` mountPage dispatches on
  `ctx.nav.route` prefix: `/templates` → TemplateFormPage, else
  ProviderFormPage. Reuses HostLeaf + EmailsenderComponents contract.
- **i18n patch**: `emailsender.nav.templates` +
  `emailsender.entities.email_template.{title,singular,plural,
  fields.*}` ×7 langs (de-DE, en-GB, en-US, es-ES, fr-FR, it-IT, pt-PT) +
  `emailsender.templates.*` form vocabulary. Signed manifest via
  `primebrick-db sign`.
- **FE glue**: `ENTITY_SERVICE_MAP['email_template']='emailsender'`;
  `system/emailsender/templates/+page.svelte` = providers list clone
  (census-derived edit_path, `storageKeyPrefix pb:emailsender:templates:`).
  The catch-all mounts create/[uuid] — zero route files for the remote
  forms (proven by task 21A).

## Part B — settings/templates placeholder restore (monito)

- `git show dbee2ea^:src/routes/(app)/system/settings/templates/+page.svelte`
  → restore byte-identical. It stays a mock — that IS the point.
- BE `module-nav-meta.ts` settings block: `routes` +=
  `{route:"/system/settings/templates", kind:"page"}` (required — the
  access guard denies paths absent from the census) and `nav` +=
  `{id:"templates", label_key:"system.settings.tabs.templates",
  href:"/system/settings/templates", icon:<lucide-verified>}`.
- i18n: `system.settings.tabs.templates` + `system.settings.templates.*`
  already seeded in 6 languages (May seeds); verify en-US parity row
  exists (patch 20261020173000 precedent) — add only if missing.

## Acceptance

- Nav shows "Templates" under Emailsender module; list renders via
  EntityTablePage from live census; create/edit mount the remote form;
  `email_template` CRUD flows over `/ws/emailsender`.
- Settings nav shows "Templates" again; page renders the mock verbatim.
- `pnpm test` green in US; `svelte-check` 0/0 FE; nav-declaration
  validator passes; signed db patch applied cleanly.
- Live matrix: `/system/emailsender` → providers (default leaf
  unchanged), `/system/emailsender/templates` → list,
  `/create` + `/[uuid]` → remote forms, `/system/settings/templates` →
  mock page through the guard.

## Verification (2026-10-25)

- SDK build ✅ · US svelte-check 0/0 ✅ · fe bundle build ✅ (js/css/deps/sha256)
- US vitest 31/31 ✅ · check:standards clean ✅ · `db:check` clean ✅
- BE module-nav-meta test ✅ · FE svelte-check 0/0 ✅ · FE vitest 493/493 ✅
- Live (authenticated): `/system/emailsender` → providers (default);
  sidebar shows Provider email + Template; list renders 6 seeded rows with
  IT labels; `/create` mounts remote form (7 fields); `/[uuid]` hydrates
  real data; `/system/settings/templates` renders the restored mock + nav.
- CRUD via `/ws/emailsender/api/v1/entities/email_template`: POST 201 →
  PUT 200 (v2) → DELETE `?version=2` **500** → root cause: entity lacked
  `Deletable` and table lacked `deleted_at`/`deleted_by` (only
  `emailsender.providers`/`config_entries`/`translations` had them).
  Fixed via `Deletable(Auditable(EntityBase))` + generated ALTER patch →
  DELETE 200 (v3, `deleted_at` stamped) → GET 404 · probe row `e2e_probe`
  soft-deleted and correctly filtered from the list (6 rows).

## Explicit non-goals

- No MJML preview/render pipeline — plain textarea editing only.
- No changes to `system.settings.templates.*` i18n values.
- Phase-B generic list archetype remains out of scope (the static list
  file is the current standard, same as providers).
