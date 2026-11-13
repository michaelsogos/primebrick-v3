# Clone-audit contract: badge/labels/self-ref (DONE) + audit order + Clonable→Duplicate gating + clone display joins

> Continuation of the previous session's version-cell badge / actor-hero /
> clone-audit seeds work (commits `7c2b9ce` fe, `25a43c7` be, `00ca1ba` dal).
> Phase 1 (chat-requested fixes) is DONE; Phase 2 collects the follow-up
> requirements from chat 2026-11-13 — analysis evidence inline, awaiting
> PROCEED. Session 2 (same day): created_at repairs + customer icon went
> TOC on user approval; remaining Phase-2 items still TIC.

## Status: 🟡 PARTIALLY DONE — Plan date: 2026-11-13 15:10 UTC / 16:10 CET (rev. 20:10 UTC) · session 2026-11-13c (tasks 5+6 closed — derived capabilities end-to-end + display-join projections via `JoinExpr.display`; residual: be router same-derivation eval)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `version` column badge on white background | ✅ done | 2026-11-13 | fe `838095d` — cell badge only; footer/FormPageLayout/ConfigListRow keep transparent outline (uniform surfaces) |
| 2 | Fix identical clone labels — `cloned_by`→"Clonato da", `cloned_from`→"Clone di" | ✅ done | 2026-11-13 | be `7746197` — patch `20261113141900` (DELETE+INSERT); de-DE collision fixed too; manifest re-signed; applied + Redis busted + DB-verified |
| 3 | `cloned_from` ref → same entity, no circular refs | ✅ done | 2026-11-13 | dal `ceaacea` — `servedRefEntity()` unifies self-ref on ALL paths (was auto-derive-only); name-only ref → cannot recurse by construction |
| 4 | Forced canonical audit order by construction (meta-overridable) | ✅ done | 2026-11-13 | dal — `STANDARD_AUDIT_RANK` bands (extras 2000+ → pairs → clone 2160+ → `version` 2900 last); authored `order` = escape hatch; verified on REAL metas: customer + user_profile emit canonical sequence |
| 5 | `duplicate` route/CTA only when entity uses `Clonable` mixin — wired through facade + generated docs | ✅ done | 2026-11-13 | dal `19b5021` + sdk `d659712` + us `a44b275` — see §C-post: implemented as **service-level capability** (`DomainService.auditable/.clonable` getters → `EntityServiceLike`), superseding the §C `meta.clonable` design (no core closed-schema bump needed; same enforcement). Scope extended per user: `auditable` consolidated the same way — `EntityRouteDecl.auditable` deleted, `collaboration.enabled` derives from `@AuditTrail()`. **Residual**: be's own `entity-router` (non-SDK) still authors `duplicate:false` — evaluate same derivation there. |
| 6 | `cloned_by_name` / `cloned_from_name` display joins from DAL | ✅ done | 2026-11-13 | core `c597cf4` (`resolveDisplayTemplate`) + dal `eed5133` (`JoinExpr.display` — joins carry their projection contract; alias-map convention deleted; `clone_src` self-join renders the entity's own `display_name` template → `cloned_from_name`; `includeCloner` → `cloned_by_name`; search/sort via projected name + raw fallback; unknown `${key}` throws at construction) + sdk `ddd6fdd` (`assembleMeta` delegates) + us `e8051af` (4 clonable services `display: resolveDisplayTemplate(meta)`; authored templates customer `"${display_name} (${code})"`, address `"${street} (${city})"`, account `"${company_name} (${country})"`). Verified live: `cloned_from_name` = "E2E Lifecycle (E2E-…)" on a real duplicate; 616/616 dal tests |
| 7 | `created_at > updated_at` inverted rows — repair via trail-aligned patches | ✅ done | 2026-11-13 | us `e32a0e0` (patch 0009, all 138 seeded rows → trail INSERT) + be `be9782e` (42 translations → updated_at); manifests re-signed; live sweep 0 inverted |
| 8 | Record-sheet ref icon collision: customers vs user_profile both render `user` | ✅ done | 2026-11-13 | us `6b1ff9d` — customers leaf + module icon → `users-round`; fe `3af8fa9` — uniqueness rule 13 in both icon docs |
| 9 | Clone version-history action — exists but VIOLET, user asked warning color | ⏳ decision | — | see §H — `clone` already maps Copy+violet end-to-end (8 real CLONE audit rows); recolor decision needed (amber collides with restore → orange?) |
| 10 | Non-standard audit fields (`last_synced_at`, `suspended_*`) reach audit section first | ✅ done | 2026-11-13 | dal — `isSynchronizable`→`audited` injected on BOTH paths (class fact, undroppable); sync stamps land extras band. NOTE: suspended_*/last_synced_at on user_profile were ALREADY audited via authored meta — §I corrected |
| 11 | Icon sweep across module leaves — evidence only, NO changes without approval | ✅ evidence | 2026-11-13 | see §H-sweep — zero remaining entity-leaf collisions; settings/templates is `kind:"page"` (legal glyph reuse) |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## A — Done work (Phase 1 recap)

- **Badge**: `TableCell.svelte` version badge → `bg-white dark:bg-black` (dock idiom); `svelte-check` clean. Open offer: same class on the other 3 canonical sites if wanted.
- **Labels**: `cloned_from` it-IT "Clone Di" / de-DE "Klon Von"; `cloned_by` keeps "Clonato Da"/"Geklont Von". Verified live in DB.
- **Self-ref**: `customerMeta.cloned_from` → `{type:"ref", ref:{entity:"customer"}}`; `cloned_by` → `user_profile`. 91 dal tests green.

---

## B — Forced canonical audit order (requirement 4)

### Ordering mechanism — the answer to "perché nel DAL?"
The FE does NOT use the columns array index: `EntityRecordSheetBody:74`
runs `orderedColumns(meta.columns)` which sorts by the **served `order`
field** (sticky → normal → audited, each by `order`; array index is only
the no-`order` fallback). The `order` VALUE is what the dal emits —
`withColumnConstraints` auto-derives `order: 1000 + derivedIdx` following
`persistence.columns` entry order = **mixin declaration chain**
(`Auditable` → `Deletable` → `Clonable`). So "by construction in the DAL"
means: the emitted `order` mirrors class declaration order. Fixing order
= assigning canonical `order` values at derivation — the FE needs zero
changes (it already sorts by `order` faithfully).

### Problem
`version` is declared **inside `Auditable`** (entity-base.ts:60, position
5 of 5 audit fields) → emitted order puts it before `deleted_*` and
`cloned_*`:
`created_at, created_by, updated_at, updated_by, version, deleted_at, deleted_by, cloned_from, cloned_at, cloned_by`
→ `version` mid-audit, cloned_* last.

### Required canonical sequence (per user)
`[extra/non-standard audited cols]` → `created_by, created_at` →
`updated_by, updated_at` → `deleted_by, deleted_at` →
`cloned_from, cloned_at, cloned_by` → `version` (ALWAYS last)

### Design
- **dal `column-constraints.ts`**: canonical audit rank map; audited
  physical columns not in the map (the "extra" group, declaration order
  among themselves) rank BEFORE `created_by`. Assign audit columns a
  dedicated order base (e.g. `2000 + rank*10`) so the audit block also
  groups last in the column picker — same `order` contract, one lever.
- **Override escape hatch**: an authored `order` on an audit column still
  wins (user asked "override possibile nei meta se serve"). Document it.
- **`version` rank is unconditional** — it can never outrank a sibling
  audit field again, meta authors included unless they override.
- Consumers needing zero changes: audit accordion
  (`EntityRecordSheetBody` already sorts by `order`), column picker.
- Test-as-deliverable: extend `record-sheet-order.test.ts`-adjacent dal
  spec — `withColumnConstraints` output order == canonical sequence for a
  Clonable+Deletable+Auditable entity with an extra audited column.

### Non-standard audit fields — resolved per user (2026-11-13)
Fields like `last_synced_at` (`@SynchronizableField`, user_profile_entity.ts:74)
and the suspension pair (`suspended_at`/`suspended_by`, plain @Column, :98-102)
ARE audit fields semantically — but today `isAudit`
(column-constraints.ts:435-439 = `isAuditable || isDeletable || isClone || cloneType`)
excludes `isSynchronizable` and plain columns → they render as BUSINESS
columns and never reach the audit section. Required: mark them `audited`
(sync decorator → audited at derivation; plain columns via authored
`audited:true` in meta) — they land in the "extra" group = FIRST of the
audit section by rank design above.
- `uuid` → the entity PKEY, never audit (correct — struck from candidates).
- `id` surrogate → dead, never crosses the domain boundary (skipped at
  column-constraints.ts:434) — struck.
- `changed_*` on audit-trail entities → different surface, out of scope.
- `*_name` wire siblings → not columns; ordering N/A.

---

## C — `duplicate` gated by `Clonable` mixin (requirement 5)

### Current state (the hidden bug)
- SDK `entity-router.ts`: `duplicate` is **ON by default** (opt-OUT,
  `duplicate:false`); conventional `<entity>.duplicate.bulk` permission
  when undeclared.
- dal `entity-service.ts:614` → `repo.clone` runs on ANY entity — on a
  non-`Clonable` entity it clones **without writing `cloned_from`/`cloned_at`/`cloned_by`**
  (no isClone column exists) → silently untracked clones + `CLONE` audit rows.
- Exposure today: every CRM entity (~16) except those with `duplicate:false`;
  only `customer` is `Clonable`. BE `client-registry` already opts out —
  other BE routers likely expose it too.

### Design (strict — "SOLO se viene usata la classe CLONABLE")
1. **core `entity-meta.ts`**: add derived-only `clonable?: boolean` facet
   (closed schema — type extension required; authored `clonable` must
   throw in `withColumnConstraints`, same as `managed`/`pg_type`).
2. **dal `withColumnConstraints`**: inject `clonable: true` when
   persistence meta carries any `cloneType`/`isClone` column.
3. **SDK `makeEntityRouter`/`makeServiceRoutes`**: register `/duplicate`
   iff `decl.meta.clonable === true`. `permissions.duplicate` on a
   non-clonable entity → boot throw (drift, not silent skip).
   `duplicate:false` stays legal (clonable entity may hide the CTA).
4. **dal `entity-service.duplicate()`**: guard — entity without clone
   columns → throw (`entity is not clonable`); enforcement under the route.
5. **docs-gen `collect.ts`**: derives from decls → follows automatically;
   regenerate affected doc packs.
6. **FE**: zero gate changes — `meta.actions` already drives
   `opAllowed('duplicate.bulk')` → row menu + bulk CTA + CardActions hide.
7. **Impact/migration**: non-Clonable entities lose `/duplicate` + CTA —
   by design (their clones were untracked). Any entity that should keep
   duplicate must adopt `Clonable` + ship a `db-meta` patch adding the
   three columns. List per service in TOC.

---

## D — Clone display names via DAL joins (requirement 3 promotion)

- **`cloned_by_name`**: extend the actor-join map
  (`entity-service.ts` `AUDIT_ACTOR_JOIN_ALIAS` /
  `buildAuditableJoinsSelective`) — `cloned_by → user_profile.display_name`,
  COALESCE → raw actor. Same projection/decorations as `created_by_name`
  (search + sort aliases already parameterize the join map).
- **`cloned_from_name`**: NEW self-join — `LEFT JOIN <same table> src ON
  src.<uid> = self.cloned_from` projecting `src.<display_field>`;
  COALESCE → raw uuid on miss (matches actor convention). Driven by the
  served `ref.entity === meta.entity` self-ref + `meta.display_field`.
  Scope: self-ref joins only — generic cross-entity ref names is a
  bigger, separate project.
- Search/sort on the joined name — same treatment as actor columns.

---

## E — `created_at > updated_at` — DONE (trail-aligned repair)

- **Root cause (final)**: not a runtime bug, not the seed script
  (`crm/scripts/seed-customers.ts` verified clean — `dal.add` writes both
  stamps = `now()`). A since-deleted one-off history fabrication wrote
  audit trail entries at ROUND minutes (10:00–12:17 on 2026-05-16) plus
  matching `updated_at`, while `created_at` kept the REAL single-transaction
  seed instant `19:37:55.813234` (all 138 `created_by='system'` rows).
  Any row "updated" before 19:37 reads inverted; the 25 "healthy" ones
  were equally inconsistent with their trail (INSERT ~12:xx vs row 19:37).
- **`public.translations`**: separate event — 42 `app.smart.regex.explainer.*`
  rows re-stamped `created_at=2026-09-08 21:08:44` over the original
  `updated_at=2026-05-18 14:27` seed pair. No audit table exists there.
- **Fix shipped**: crm patch `0009_customers_created_at_trail_repair.sql`
  — `created_at := trail.INSERT.changed_at` for all 138 mass-rewrite
  victims (trail IS the canonical demo story; "impatta anche i trail" →
  row and trail now agree). be patch `20261113143000` — translations
  `created_at := updated_at` (earliest surviving evidence, no trail).
- **Verified live**: whole-DB sweep `created_at > updated_at` → 0 tables.
  Sample customer `01a1cbeb…c44f`: created=updated=trail 10:04.
- **Residual (not done, flag)**: fabricated audit rows remain a demo
  trail by design; preventive CHECK `updated_at >= created_at` was
  evaluated and skipped — a legit backfill could violate it transiently;
  the invariant stays a review-time check, not a constraint.

---

## G — Ref-sheet header icon collision — DONE

- Mechanism verified healthy (nav-leaf icon → route icon →
  `RECORD_ICON_VARIANTS` singular → null-no-fallback); the collision was
  authored data: `customers` and `user_profile` both declared `users` →
  both sheets rendered `user`.
- Fix: customers leaf (`nav-declaration.ts:52`) AND the CRM module icon
  (`index.ts:44` — launcher/module menu, same family) → `users-round`;
  record sheets now render `user-round` via the existing variant pair.
  nav-declaration tests + `tsc --noEmit` green. Registry payload refreshes
  on next service boot.
- Doc: rule 13 "entity list icons are UNIQUE per entity family" added to
  `docs/ai/icon-conventions.md` + `docs/dev-guide/icon-conventions.mdx`
  (fe `3af8fa9`). Non-entity leaves may reuse glyphs freely.
- Derivatives for related CRM entities (`user-round-*` for
  customer_account/contact/etc.) — open, decision at TOC.

---

## H — Clone version-history action + icon sweep (evidence)

### Clone action — EXISTS, wrong color?
End-to-end already live: `repo.clone` writes `action='CLONE'` audit rows
(8 real rows in `crm.customers_audit`, Oct 26), and
`VersionHistoryPanel.svelte:140/158/176` maps `clone` → `Copy` icon +
**violet** (`text-violet-600`/`border-violet-600`). The dedicated action
exists; only the color differs from the request ("Warning color").
Decision: `amber` is taken by `restore` → propose `orange` for clone, or
keep violet. Micro-change when approved (3 lines in the panel).

### Icon sweep — all module nav leaves (evidence only, NO changes made)
| Module | Entity leaf | Icon | Sheet glyph | Collision |
|--------|-------------|------|-------------|-----------|
| crm | customer | `users-round` | `user-round` | — (fixed) |
| crm | customer_type (dict) | none → `list` default | `list` | — |
| settings | user_profile | `users` | `user` | was vs customer |
| settings | organization | `building-complex` | as authored | — |
| settings | role_mapping | `user-key` | as authored | — |
| settings | config_entry | `settings-2` | as authored | — |
| settings | service_registry | `package` | as authored | — |
| settings | client_registry | `shield-check` | as authored | — |
| emailsender | providers | `mail` | as authored | — |
| emailsender | templates | `layout-template` | as authored | legal* |
| job | schedules/runs/triggers | `list-clock`/`play`/`list-checks` | as authored | — |

\* `settings/templates` is `kind:"page"` (no entity) — same glyph as the
emailsender templates entity is ALLOWED under rule 13 (pages never feed
`RECORD_ICON_VARIANTS`). Non-entity leaves also sharing glyphs: pipeline
`git-branch`, profile `square-user`, credentials `key-round`, migrations
`database-zap`, translations `languages`, ai `brain-circuit`/`book-search`,
webhook module `webhook` — all pages/module icons, all legal.
**Verdict: zero remaining entity-leaf collisions.** No changes pending.

---

## I — Non-standard audit fields — DONE (evidence corrected)

CORRECTION of the earlier finding: `user-profiles.meta.ts` already
authored `audited:true` on `last_synced_at`(14), `suspended_at`(18),
`suspended_by`(19) — they DID reach the audit section (extras-first by
luck of low authored orders). The REAL gap was narrower: derived-path
`isSynchronizable` did not mark `audited` and injectDerived didn't
inject it on declared columns — fixed: sync is now a class fact on both
paths (`column-constraints.ts` inject condition + `auditedField`).

Verified on REAL metas (tsx import of the served meta modules):
- `userProfileMeta` → `last_synced_at:14 | suspended_at:18 |
  suspended_by:19 | created_by:2100 | … | deleted_at:2150 | version:2900`
  (extras authored orders kept = escape hatch works)
- `customerMeta` → `created_by:2100 | created_at:2110 | updated_by:2120
  | updated_at:2130 | deleted_by:2140 | deleted_at:2150 |
  cloned_from:2160 | cloned_at:2170 | cloned_by:2180 | version:2900`
Live `/meta` endpoints re-emit this on next service boot (dal dist is
workspace-linked).

---

## F — Deferred notes (re-evaluated, still non-blocking)

- The other 3 canonical version-badge sites (sheet footer, FormPageLayout,
  ConfigListRow) stay transparent — offer stands.
- `EntityMeta` closed-schema change (`clonable`) bumps core → dal → sdk →
  consumers — the cross-repo release order rule applies (build sequence:
  core → dal → sdk → us/be → fe).
- Workflow ack: this plan is TIC output — no code touched for Phase 2;
  TOC starts on `PROCEED`.

## 2026-11-13 — TIC findings (checkbox border + task-5 inventory + doc drift)

### Checkbox border (resolved — user was right)
ELT row checkbox passes `checkboxInteractiveClass` = `checkboxBaseClass` (`ui/.../checkbox/index.ts`):
`data-[state=checked]:border-primary` — a REAL 1px solid primary border when checked
(twMerge: className beats component `border-transparent`). Button `default` (new/bulk CTAs):
same sky→indigo gradient bg, NO border. Different by construction, not perception.

### Task 5 inventory — who keeps/loses /duplicate (TIC)
- KEEP: `customer` (only `Clonable` entity in workspace; has permission + duplicateBody)
- LOSE (expose mute /duplicate today — default-on, no `duplicate:false`): 15 CRM entities
  customer_type, company_dimension, legal_form, local_address_type, qualification,
  marketing_qualification, contact_type, account_kind, customer_link_type, consent_type,
  local_address, customer_account, customer_contact, customer_link, customer_consent
- ALREADY OFF (no change): emailsender ×2, job-handler ×3, ai ×2, be ×4 — all `duplicate:false`
- Router: `entity-router.ts:196-199` opt-out flag; `:596` registers unconditionally.

### Doc-generator drift (TIC)
- DRIFT-1: `generate-page-docs.ts` exists in be/ai/job-handler — NOT in crm/emailsender/webhook.
  `docs/user-guide/generated/customers.mdx` moved with the entity (fa83f69, Oct 26) but its
  generator did NOT follow → page frozen, cannot regenerate in crm. Clonable added 168832a
  AFTER generation → page predates clone provenance.
- DRIFT-2: `sdk/docs-gen/render.ts:695` mirrors router default-on (`duplicate === false ? …`)
  → generated pages advertise /duplicate for non-clonable entities. With `meta.clonable`
  the generator must consume the facet, not the opt-out flag.
- DRIFT-3 (self-healing): openapi spec derives from registered routes — gating the router
  auto-removes the 15 /duplicate paths (verified: spec emits all 16 today).

## 2026-11-13 (2) — clonable opt-in confirmed + deep docs-pipeline audit

### Task 5 — CONFIRMED design (user decision)
`Clonable` is opt-IN: no entity exposes /duplicate unless it adopts the mixin.
CRM adoption set: customer + **local_address + customer_account + customer_contact**
(the 3 user-approved additions). All other 12 CRM entities lose /duplicate.
Work per adopted entity: mixin on entity class + patch for cloned_* columns
(check existing cloned audit patch 0008) + duplicate permission/body if wanted.

### Docs pipeline — REAL picture (was: lazy analysis)
Pipeline = 2 stages:
- A. generate-page-docs.ts (thin ~180-line wiring over sdk docs-gen engine):
  present ONLY in be/ai/job-handler. crm + emailsender lack it.
- B. build-docs-pack.ts: all 6. Serving IS already intrinsic:
  createMicroservice auto-mounts GET /api/v1/system/docs/pack when
  dist/docs-pack/manifest.json exists + registrar advertises docs_pack cap.
- Runtime: ai service pulls packs (NATS service.register + gateway_online +
  startup for BE), ingests into user KB (docs-pack-ingest.ts).

History: per-service scripts ARE the recent design (sdk feature/docs-gen-engine +
us/be feature/docs-gen-wiring → release 3.5.0), NOT legacy leftovers. Landed the
same week as fa83f69 — crm got a COPIED frozen customers.mdx, never a generator.

### Full drift inventory (D1–D10)
- D1 crm generated/customers.mdx frozen since fa83f69 (pre-Clonable, pre-uuid tweaks)
- D2 emailsender: EMAILSENDER_NAV 6 routes + entity decls + remote fe pages → ZERO docs
- D3 emailsender fe/src/index.ts mountPage uses ternary over ctx.nav.route →
  parseRemoteDispatch cannot resolve (needs PAGES record normalization)
- D4 collectDocRoutes iterates nav.routes only — CRM_NAV.siblings[] (settings dict
  pages) never documented even with the script
- D5 dead imports AI_EVENTS/JOB_EVENTS in both scripts (census comes from registry DB)
- D6 be emits thin pages for no-facts surfaces (credentials/migrations/templates/
  translations) — verify real prose not stubs
- D7 be _order.json has generated/migrations.mdx AND manual/migrations.mdx
- D8 be keep_files fragility: 5 reference docs live in generated/ owned by the
  ghost-cleaner; only survive via keep_files + re-emission in a second script
- D9 NO check-standards rule: service with routes/fe without docs decl = silent drift
- D10 build requires live DATABASE_URL (registry+translations) — no-DB build = no docs

### Docs-gen refactor — DONE 2026-11-14 (design approved, implemented)

Shipped: shared `docs-gen/service-docs.ts` in sdk (loadDocsCompilers /
loadDocsDbContext / applyRemoteFacts / applyHostFacts / printDocsReport —
the ~70% boilerplate once). Per-service scripts reduced to thin config
wiring (~80 lines: decls + service_code + schema + fe mode + extras).
Commits: sdk `5a09fa2` + `0920c29` (api-ref regen), be `238768d`,
us `84a3db4`.

Closed drifts:
- D1 FIXED — crm/scripts/generate-page-docs.ts exists; customers.mdx
  regenerated live (frozen copy unfrozen: cols now Code/Display Name/
  Status/Onboarded At, access-grant line, create section)
- D2 FIXED — emailsender generates 6 pages (providers + templates
  list/create/edit), docsDir wired into build-docs-pack
- D3 FIXED — emailsender fe/src/index.ts ternary → typed PAGES dispatcher
  (ai/crm precedent); route→source resolution works
- D4 FIXED — collectDocRoutes traverses nav.siblings[].routes;
  crm customer_types.mdx (settings dict page) now generated
- D5 FIXED — dead AI_EVENTS/JOB_EVENTS imports gone with the thin scripts
- D6 thin pages — MOVED to parent plan metadata-driven-page-system.md:
  resolves WITH the LIST/DICT/FORM standard migration (no-facts branch
  disappears by construction; no transient suppression mechanism)
- D7 _order.json generated+manual migrations dup — same: dies with D6
- D8 FIXED — reference docs moved to own dir reference/ (sdk 8c210af,
  be 4cb5267): keep_files REMOVED from RenderContext, ghost-clean is now
  unconditional, reconcileOrder prefix = dir basename so generators never
  share out_dir or touch each other's order entries; inline reconcile
  copy deleted; module-navigation.mdx path updated
- D9 IMPLEMENTED (sdk 351c71b, us 14d285a) — docs emission is now an
  intrinsic capability of the service bootstrap, not a script:
  * emitServiceDocs (src/docs-gen/emit.ts) derives page docs + OpenAPI +
    docs pack from the literal MicroserviceOptions — nav, routeHandler
    .entityDecls (new brand next to .spec), fe/ auto-discovery
  * createMicroservice: --emit-docs flag emits + exits before NATS/HTTP;
    normal boot emits a stale/missing pack BEFORE registrar → docs_pack
    capability always backed in dev (verified live: crm restart emitted
    before registration)
  * generate:docs = `bun src/index.ts --emit-docs` identical in all 5
    services; 10 scripts deleted (generate-page-docs ×5, build-docs-pack ×5)
  * --check mode: diffs committed generated/ vs fresh emit, EOL-normalized
  * check-standards docs-wiring repo rule: nav-declaration ⇒ generate:docs
    runs emit; fe/ ⇒ fe/vite.config.ts (negative-tested: fires on drift)
  * post-merge hook: hardcoded list (missing crm) → auto-discovery glob
  * render.test ghost-cleanup updated to single-owner contract
  * platform schema ordering restored in lexicon (system/public/custom
    suffix) — preserves UUID label
- D10 UNCHANGED — generation still needs live DATABASE_URL (registry +
  translations); acceptable (matches previous build-docs-pack behavior)
- D9 residuals moved to metadata-driven-page-system.md for evaluation
  (be host path, --check release gate, repo:=service_code)

Also shipped: parseRemoteDispatch normalizes PAGES keys [param]→{param}
so remote detail routes resolve source files.

Verification: ai regen = zero diff; jh/be regen diffs = decl drift
corrected (committed pages were stale); crm + emailsender regen clean;
fe tsc clean; consumer standards clean; sdk tests 517 pass (1 pre-existing
IPv6 env failure, unrelated — verified on clean HEAD).
