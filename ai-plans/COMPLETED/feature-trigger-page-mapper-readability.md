# ELT trigger page — mapper viewer readability, i18n, CTA icon, validation gap

> Continuation of `COMPLETED/feature-mapper-viewer.md` — the shipped viewer
> works contractually but is visually illegible (3-col grid wraps field names
> mid-word inside a narrow sheet), `app.widgets.mapper.*` was never seeded in
> the DB so non-English locales fall back to English, and the create CTA lost
> its icon during the `job_rule→job_trigger` rename.

## Status: ✅ DONE — Plan date: 2026-11-16 00:45 UTC / 01:45 CET — executed 2026-11-16

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | **CTA icon — decoupled design (user-approved)**: `EntityListToolbar` renders `Plus` (static lucide import) when `create_cta?.icon` is absent → "+" always; `EntityTablePage`/`EntityListTable` stop forwarding `censusCreateRoute.icon`; resolution chain = `create_cta.icon` prop → `meta.actions["create.single"].icon` → Plus. Remove authored `icon:"plus"` from crm + emailsender create routes (revert to materialized `text-cursor-input` page-icon — correct for nav-leaf inheritance) | ✅ done | 2026-11-16 | `actions_overrides["create.single"].icon` already merges into meta.actions on US SDK router (`entity-router.ts:428-434`); job.meta.ts already uses the pattern (exec-stop overrides). ZERO non-plus authored create icons exist today — only historical `calendar-plus` (job_schedule create, dropped in `c4786d3`) |
| 2 | Seed `app.widgets.mapper.*` in `public.translations` — be-v3 `db-meta` patch (7 langs): `view`, `title`, `empty`, `unmapped` ({count}), `not_mapped` + new `source`/`dest_event` badge labels; `primebrick-db sign`; `pnpm db:migrate`; **Redis invalidate `translations:i18n:public:*` all langs**; mirror new keys in `en-GB-fallback.json` | ✅ done | 2026-11-16 | Mandatory per `i18n.md`: always seed, migrate, invalidate — all languages |
| 3 | `MapperViewerPanel.svelte`: SOURCE + DEST EVENT full-width badge blocks above `PayloadMapViewer` — `Label` + `Badge variant="secondary" h-9 w-full` anatomy like `EntityRecordUid`; translated census label via `subjectDecl`, raw subject in tooltip; icons `zap` amber-500 / `send` sky-500 | ✅ done | 2026-11-16 | `event_subject` absent → muted em-dash |
| 4 | `payload-map-viewer.svelte` (v3-ui): rows 3-col → 2-col `grid-cols-2`. Left: type icon + `*` + field name + help. Right: line 1 kind icon + label; line 2 value. `map` sub-entries + fallback below grid. Unmapped accordion → same 2-col. Keep testids | ✅ done | 2026-11-16 | svelte-autofixer after edit |
| 5 | `mapper-viewer.spec.ts` rewrite: pin `pb.lang=it-IT`; localized CTA/labels; `svg.lucide-plus` on create CTA; badges + resolved labels; 2-col anatomy; 1600×900 screenshot | ✅ done | 2026-11-16 | Old spec = EN DOM text only |
| 6 | Typecheck per repo + live verification + commit per repo | ✅ done | 2026-11-16 | fe-v3 (toolbar+panel+spec+fallback), v3-ui (viewer), us-v3 (nav cleanup + gate if approved), be-v3 (patch), v3-core only if B kept |
| 7 | **Wire-gate closure (scope decision pending)** — C.3 empty-map coverage + `assertEmitSubject` + optional `x_map_keys` via `internalFetch` | ✅ done | 2026-11-16 | See Part C — flow/cost/responsibility written |
| 8 | Report BE/SDK drift: be-v3 `deriveEntityActions` applies ONLY `enabled` from `actions_overrides` (SDK merges full chrome) — BE-served entities can't use the icon override until aligned | ✅ done | 2026-11-16 | One-line fix candidate — user decides |

---

## Part A — CTA icon: final design (verified)

**Resolution chain (user decision):**
```
EntityListToolbar create CTA icon =
    create_cta?.icon              (page-level explicit prop — existing)
 ?? meta.actions["create.single"].icon  (entity-level authored override — EXISTING channel)
 ?? <Plus/>                       (static default in the renderer — NEW, always "+")
```

- `meta.actions_overrides["create.single"].icon` is the designed authored
  channel (`entity-meta.ts:853`; SDK `deriveActions` merges chrome at
  `entity-router.ts:428-434`). job_trigger already uses `actions_overrides`
  for delete/restore chrome → zero contract additions for US entities.
- `route.icon` fully decoupled: `EntityTablePage` drops
  `censusCreateRoute.icon` from `createCta`; `label_key` stays nav-sourced
  (the CTA label "Nuovo attivatore" is correct as-is).
- `DEFAULT_ROUTE_ICONS.create` **stays `text-cursor-input`** — with the CTA
  decoupled, route.icon returns to pure page-icon duty (nav-leaf
  inheritance), where the form glyph is right. Option B as originally
  scoped is superseded — the "+" default lives in the toolbar renderer,
  not the materialization. (If "+"-as-route-default is still wanted for
  its own sake: one-line core change — flag, don't assume.)
- Authored `icon:"plus"` removal: crm customer create, emailsender
  provider + email_template create — all redundant; after removal they
  materialize `text-cursor-input` (page icon — semantically fine).
  **Non-plus authored create icons: NONE exist today.** Historical
  `calendar-plus` (job_schedule create) was the only override ever —
  dropped in `c4786d3`, route no longer exists.
- Toolbar: `{#if create_cta?.icon}<DynamicIcon/>{:else}<Plus/>{/if}` —
  static `Plus` import via `@primebrick/ui/vendor/lucide` (wildcard
  re-export, verified) — no `?? 'literal'` → lint-clean vs
  `icon-no-fallback`.
- BE drift: be-v3 `deriveEntityActions` applies only `enabled` from
  `actions_overrides` (SDK merges full chrome) — BE entities can't use
  icon override until aligned. Report; fix = mirror the 5-line chrome
  merge.

## Part B — i18n (doc-verified)

`docs/ai/i18n.md`: BE owns ALL translations; `app.*` → `public.translations`;
FE fallback English-only; **always seed + migrate + invalidate Redis, all
languages**. `app.widgets.mapper.*` never seeded → patch fixes it.

## Part C — Validation gap: flow, cost, responsibility

### C.1 The write-path flow (where checks plug in)

```
POST/PUT /svc/job/api/v1/entities/job_trigger
  → job-handler entity router (SDK makeEntityRouter)
  → hooks.beforeCreate / beforeUpdate (jobs.service.ts)
      assertSystemTriggerMutable   frozen fields on system_key rows
      assertTriggerShape           core jobTriggerShapeIssues (event|schedule, run_as, @at-past)
      assertCallableTarget         target_subject ∈ callable catalog
      assertPayloadMapConformance  map vs callable schema (+ emit schema for kind:"path")
  → DAL write → afterWrite → publishTriggerChanged (NATS)
```

### C.2 Data provenance — isolation respected

- **Declarations travel for free**: the OWNING service publishes
  `endpoints.callables[].payload_schema` / `endpoints.events.emits[]`
  inside `service.register`; JH's `callable-catalog` caches them
  (broadcast-driven + `service.registry.get` cold fetch). No cross-schema
  reads — declarations are the sanctioned interchange.
- **Data rows travel only via the owner's public surface**: template rows
  live in `emailsender.email_templates` — JH must never read the table;
  it acts as a governed client of `/api/v1/entities/email_template`
  (internalFetch — same call the FE makes through `/svc/`).

### C.3 What the wire CAN check today (zero new infra)

| Check | Data needed | Cost | Owner |
|---|---|---|---|
| `assertEmitSubject` — event ∈ declared emits (wildcards need pattern match) | emitCatalog (already loaded) | µs in-memory | JH hook |
| Empty-map coverage — uncovered requireds provably present in `emitSchema` (event) or impossible (schedule-only) | callable + emit schema (already resolved in the hook) | µs in-memory | JH hook |
| `x_map_keys` — template `variables` declaration for the `const` templateCode | owning service's entity list API via `internalFetch` | ~1 HTTP call/write, only for x_map_keys callables with const `from` | JH consumes; owner exposes (already does); core predicate already accepts `mapKeySchemas` |

### C.4 Runtime remains the last net

`applyPayloadMap` → NATS publish → `SendEmailSchema.parse` at the callable
still rejects missing `to`/`templateCode`/`languageIso` at fire time —
but NOT `variables` subkeys (optional record) nor template-level var
requirements (renderer-level → silently broken email).

### C.5 FE↔wire drift (proven)

FE validator comment (`build-entity-form-schema.ts:107-110`): *"the JH
write hook rejects the write server-side — no drift"* — FALSE: hook
early-returns on empty maps. Form blocks; API accepts. Closing C.3 makes
the comment true again.

## Part D — Implementation order

1. **fe-v3**: toolbar Plus default + EntityTablePage decoupling +
   EntityListTable meta-icon resolution; panel badges; fallback keys;
   spec rewrite.
2. **v3-ui**: viewer 2-col; svelte-autofixer; `pnpm check`.
3. **us-v3**: remove 3 authored `icon:"plus"` (crm, emailsender×2);
   if approved — `assertEmitSubject` + empty-map coverage in
   `assertPayloadMapConformance` + optional internalFetch mapKeySchemas.
4. **be-v3**: i18n patch + sign + migrate + Redis invalidation;
   optional `deriveEntityActions` chrome merge (task 8).
5. Commit per repo (GitFlow + Devin trailer).
