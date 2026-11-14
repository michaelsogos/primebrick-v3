# Plan — Entity identity-column standard + job_schedule column contract

> TIC output per workflow.md (`primebrick-dal-v3/docs/ai/workflow.md`).
> Analysis only — no source changes until PROCEED.

## User requirements (verbatim, numbered)

1. **UUID v7 pkey**: always `sticky`, always `default_visible:false`, always
   user-toggleable. Documented + enforced + linted standard, not just
   convention.
2. **Pinned identity column**: the `display_field` is NOT necessarily the
   pinned column — but at least one column MUST be
   `sticky:true + hideable:false` (always visible, never toggleable). When
   `uuid` is toggled visible it becomes the **second** column — pinned stays
   first. Enforcer + lint required.
3. **Labels first**: "Pianificazione" is wrong for a Source Event — propose
   correct translations BEFORE patching.
4. **`schedule_subject` MUST behave like `event_subject` on `job_trigger`** —
   an order, not a question: normal data column with full chrome parity
   (icon, color, format, tooltip) — not just aesthetic.
5. **`target_subject` same thing** — parity with `job_trigger.target_subject`.
6. **`job_name` column**: "Job" label is wrong (untranslated seed, all 7
   locales read "Job"). User suspects it is the real `name`/display_field —
   verify and answer honestly.

## Doc findings (cited per workflow gate)

| Source | Finding |
|---|---|
| `primebrick-dal-v3/docs/ai/workflow.md` | TIC = analysis + plan file + blocker + HALT for PROCEED. Tests are deliverables — no throwaway probes. |
| `primebrick-dal-v3/docs/ai/enforcement-over-verification.md` | Enforcement hierarchy: unrepresentable > mandatory checkpoint > lint > compile > tests. `withColumnConstraints` IS the checkpoint (throws at boot). |
| `primebrick-dal-v3/src/meta/column-constraints.ts:440-501` | uid column auto-derived: `order:-1, sticky:true, default_visible:false` — but an AUTHORED uid column can deviate without error. The enforcer file is the right place for both new invariants. |
| `primebrick-fe-v3/docs/ai/entity-meta-schema.md:36-38` | Canonical doc says "`uuid` is `order:-1` … (**first** sticky); the `display_field` column is `order: 0` + `sticky`". **DOC-VS-SPEC CONFLICT**: requirement 2 wants pinned first / uuid second → doc + `orderedColumns` convention must change (conflict surfaced, not silently resolved). |
| `primebrick-fe-v3/docs/ai/entity-meta-schema.md:69-75` | `format:"nats_subject"` → badge + link cell (module-page resolution via census). `format` is the renderer discriminator. |
| `primebrick-us-v3/job-handler/docs/dev-guide/index.mdx` | `job_schedules` is a **read-only mirror** of NATS declarations → `options_source` (form vocabulary) is meaningless on its columns; parity = format+icon+color+tooltip only. |
| `primebrick-v3-sdk/.devin/rules/check-standards-gate.md` + `tools/check-standards.ts` | Lint rules live ONLY in `tools/check-standards.ts` (LINE_RULES / config-gated via `.devin/check-standards.json`), never vendored. Structural invariants (≥1 pinned column) are semantic → belong in `withColumnConstraints` (boot gate), not regex lint. |
| `primebrick-us-v3/.devin/rules/db-patches.md` | New patch file + re-sign MANIFEST + commit patch/manifest/keys/snapshots together. Never edit shipped patches. |
| `primebrick-fe-v3/docs/ai/icon-conventions.md` | Icons are authored semantic; uuid surfaces = `file-key`; verify names on lucide.dev. |
| `primebrick-dal-v3/docs/ai/commit-verification.md` | Commit per turn; empirical verification mandatory; plan file updated BEFORE each commit. |

## Current real state (uncommitted — from the violated execution, kept per "no revert")

| Repo | Files | State |
|---|---|---|
| `primebrick-v3-core` | `src/columns.ts`, `src/columns.test.ts` | `sanitizeVisibleKeys` re-injects `hideable:false` keys; 19/19 unit tests green. **This fix is still correct and required** — it is the runtime half of requirement 2 (a pinned column can never be dropped by stale persisted state). Uncommitted. |
| `primebrick-us-v3` | `job-handler/db-meta/patches/0010_schedule_spec_label.sql` + `MANIFEST.json` | `schedule_spec` → "Cadenza/Cadence/…" ×7 — wording invented by me, **never approved**; applied to local DB, uncommitted in git. Awaits label decision (see §3). |
| `primebrick-fe-v3` | `src/e2e/sticky-hideable-columns.spec.ts` | New spec, half-repaired; will be rewritten to the final anatomy. Uncommitted. |

## Empirical findings

- `withColumnConstraints` derives uid as `order:-1, sticky, default_visible:false` — sticky+hideable:FALSE on `schedule_subject` was AUTHORED (commit `537df82`), matching the existing identity pattern (`customers.code`, `organizations.display_name`, `ua_prefix`, `idp_role`, `model_id` — all `sticky+hideable:false`).
- `sanitizeVisibleKeys` (core) previously dropped pinned keys from stale `visibleKeys` → the dead "unchecked disabled" column in the screenshot. Root cause confirmed and already fixed (uncommitted).
- `orderedColumns` sorts the sticky group by `order` → uuid (-1) renders BEFORE a pinned column (0). Requirement 2 needs pinned-first → mechanism change required.
- `job_schedule` column facts (DB verified):
  - `schedule_subject` = `jobs.schedule.<svc>.<key>` — @Unique, the rollup subject = schedule identity.
  - `job_name` = "job kind inside the service namespace" (`self-test`, `partition-maintenance`, trigger uuid for mirrors). NOT `name`, NOT display_field — `display_field` is currently `schedule_subject`.
  - `target_subject` = `jobs.due.*` / callable subject.
- Dict state (7 locales, DB verified):
  - `job_schedule.schedule_subject` = "Pianificazione/Schedule/Zeitplan/…" (entity title semantics — wrong for a source event).
  - `job_schedule.schedule_spec` = my unconfirmed "Cadenza" patch values.
  - `job_schedule.job_name` = **"Job" in all 7 locales** (lazy seed — confirms requirement 6).
  - `job_schedule.target_subject` = "Soggetto Destinazione/Target Subject/…" — diverges from `job_trigger.target_subject` = "Destinazione Evento/Destination Event/…".
  - `job_trigger.event_subject` = "Sorgente Evento/Listening Event/Ereignisquelle/Source de l'événement/Origen del evento/Origem do evento".
- Chrome parity gap (req 4-5): `job_trigger.event_subject` = `format:"nats_subject", icon:"zap", color:"amber-500", options_source:"census.emits", tooltip×3`; `job_trigger.target_subject` = `format:"nats_subject", icon:"send", color:"sky-500", options_source:"census.callables", tooltip×3`. `job_schedule.schedule_subject` has only `format:"nats_subject"`; `job_schedule.target_subject` has nothing (not even the format).
- Pinned-column census: entities WITHOUT any `hideable:false` column include `job_trigger` (display_field `name`), `job_run` (display_field `job_name`), `config_entries`, emailsender `provider`/`template`, crm `customer_consents`/`customer_links`/`customer_contacts`(?), and more — the enforcer will flag them all at boot; a per-entity sweep is part of this plan.
- FE ordering: `applyKeyOrder` falls back to `orderedColumns` order; sessionStorage manual reorder can still move uuid first (user override — acceptable "per norma": enforcement covers the DEFAULT, not a hard UI lock).
- **`initiator`/`created_by`/`job_name` consumer census (DB + grep verified)**:
  - `initiator` (job_schedules): **write-only** — never served in meta, never filtered/searched. Written `trigger:<name>` (triggers-engine:237,261), `service:<caller>` (schedule-request:85), `user:<uuid>` (manual). Feeds the audit actor at write time (`schedule-service.ts:293` `actor = input.caller_service ?? input.initiator`) → stamps `created_by`.
  - `created_by` **already stores the armer**, in BETTER form: `382c50ae-uuid` (manual→user — resolvable via the DAL's automatic user_profile `*_display_name` join), `trigger:e2e-gate-…`/`rule:…` (triggers), `ai`/`job`/`service:job` (services). `initiator` is a denormalized `tipo:valore` string — 100% redundant provenance.
  - `job_name` (job_schedules): the `<name>` subject segment, derivable from `schedule_subject` (`sm[2]`). Consumers: entity prop, writer (`schedule-service.ts:275`), meta column, `SCHEDULE_FILTERABLE` + `searchableKeys` (jobs.service.ts:192).
  - `job_run.job_name` is a DIFFERENT meaning — the invoked callable/action name parsed from the due target (`run-recorder.ts:70-74,122`); `job_run.display_field` is already `job_name`. Unaffected by a schedule-side drop.
  - `job_run.initiator` is also write-only, redundant with `job_runs.service_code` (`run-recorder.ts:130` writes `initiator: parsed?.service_code`).
- `@Calculated` cross-table subselect precedent confirmed: `job_trigger.runs`/`last_run`/`next_run` (`job_trigger_entity.ts:99-117`) all project via `(SELECT … FROM job.job_runs …)` — a resolved `armed_by` column is feasible at the SQL level.
- Nav order: `nav-declaration.ts:57-60` currently `[schedules (default:true), runs, triggers]`; routes array follows same order. User wants triggers → schedules → runs.
- `kind` badge keys are `job.entities.job_schedule.status.{infra_derived,manual,trigger}` (`V()` helper → `status.<v>`). Current DB: infra_derived="Derivata/Infra-derived/Dérivée/…" — user rejects "derived" semantics; manual="Manuale/Manual/…" — user reframes as "user-created".

## User decisions (received — refined rules)

1. **Pinned-column rule (as dictated)**: every entity MUST define ≥1
   `sticky + always-visible` column. If none is declared explicitly, the
   **display_field column auto-derives the pin** (`sticky:true +
   hideable:false`) — display_field is mandatory (`EntityMeta.display_field:
   string`, core `entity-meta.ts:809`), so a pin always exists. Explicit
   pins on columns OTHER than display_field are allowed; multiple pins are
   allowed; zero is impossible (derivation covers it — crash only if
   display_field itself is absent/unresolvable). Any additional sticky
   column must be explicit (authored `sticky:true` — as today).
2. **uid**: enforced — `sticky:true + default_visible:false + hideable !==
   false + order:-1`. Toggled visible → uuid is FIRST, the pinned main
   column becomes the SECOND sticky column (`order:-1` vs `order:0` —
   existing sort already produces this; `orderedColumns` untouched).
3. **Sticky-count warning**: >3 sticky columns = allowed but discouraged —
   a WARNING linter fires at ≥4 sticky (not an error).
4. **job_schedule pinned = `armed_by`** (NEW calculated column — supersedes
   the earlier `job_name` pin decision). `display_field:"armed_by"` +
   auto-pin derivation; `display_name` derives `${armed_by}`. The armer is
   polymorphic (trigger | user | service) — a single `@Ref` cannot express
   it, so it resolves as ONE calculated meaning:
   ```sql
   COALESCE(
     (SELECT jt.name FROM job.job_triggers jt WHERE jt.uuid = {self}.trigger_uuid AND jt.deleted_at IS NULL),
     (SELECT up.display_name FROM <auth-schema>.user_profiles up WHERE up.uuid::text = {self}.created_by),
     {self}.service_code
   )
   ```
   trigger mirror → fresh trigger name (rename-proof); manual → the user's
   display name (uuid in `created_by` resolved via user_profile — same
   mechanism as the audit `*_display_name` join); infra/manual-service →
   service code. Column key `armed_by` (matches `created_by`/`updated_by`
   family) — user coined `schedule_armer`; key name flagged for
   confirmation.
5. **`job_name` → DROP** (user's binary: drop OR meaning+display_field —
   with `armed_by` as display_field it is stupid redundancy): physical
   `ALTER TABLE job.job_schedules DROP COLUMN job_name` + entity prop +
   writer stops setting `job_name: sm[2]` (subject still parsed/validated)
   + `SCHEDULE_FILTERABLE`/`searchableKeys` shrink + meta column + dict
   keys removed. Data is derivable from `schedule_subject`. `job_run.job_name`
   KEEPS (different meaning — the invoked action name, its display_field).
6. **`initiator` → DROP on `job_schedules`** (write-only denormalized
   `tipo:valore`; `created_by` is strictly better provenance — bare user
   uuid / `trigger:<name>` / service code) + entity prop + writers stop
   persisting it; the `initiator`/`caller_service` INPUT param survives as
   the actor source that stamps `created_by` (API contract unchanged).
   `job_runs.initiator` drops too (write-only, redundant with
   `job_runs.service_code`).
6. **`service_code` → module badge**: new additive literal
   `format:"service_code"` in `MetaColumnFormat` (closed union — additive
   only). `TableCell` resolves `shellNav.modules.find(m => m.id === value)`
   → Badge + `DynamicIcon(module.icon)` UNCOLORED (no `column.color` →
   default icon color) + `$t(label_key ?? name)` + link to
   `/system/settings/modules` (no per-module detail route exists).
   Unresolved module (offline service) → raw code, graceful. Apply to
   `job_schedule.service_code` AND `job_run.service_code` for coherence.
7. **Labels** — §E table; `job_name` label "Nome Processo" family
   (user-formalized "Job"→"Processo") regardless of field rename.
8. **Doc edit approved** — convention text updated to the new contract.
9. **Nav reorder (new user decision)**: `nav-declaration.ts` nav →
   `[triggers, schedules, runs]` (logical flow trigger→schedule→runs) +
   `routes` reordered to match; `default:true` moves to `triggers`
   (the GOTO(module) landing page — "prima la pagina Trigger").
   `id`/`href`/`icon`/`label_key` unchanged; nav-declaration test should
   still pass (order-agnostic validator — verify).
10. **`kind` badge relabel (new user decision)**: `status.infra_derived` →
    "Sistema" family (code-owned schedules — user says "Derived" is
    misleading, there is no config table to consult from that page);
    `status.manual` → "Utente" family (user-created schedules);
    `status.trigger` unchanged.
11. **TOC order (user-set)**: 1) pin derivation+invariants, 2) uid enforced,
    3) sticky-count warning — then D/E/F/G. `service_code` badge: approved.

## Proposed changes

### A — Core contract (`primebrick-v3-core`) — ✅ DONE

1. ✅ `sanitizeVisibleKeys` re-injects `hideable:false` keys (committed —
   133/133 tests, tsc+build+check-standards green).
2. ✅ `"service_code"` added to `MetaColumnFormat` union (after
   `nats_subject`; additive literal).

### B — Boot enforcer + warning (`primebrick-dal-v3` — `withColumnConstraints`) — ✅ DONE

3. ✅ **uid invariant**: `enforceIdentityColumnContract` — uid must be
   served (hidden:true/absent → throw) and resolve `order:-1, sticky:true,
   default_visible:false, hideable!==false`; contradictions throw with the
   authored props listed; conformant/missing props injected.
4. ✅ **Pin derivation**: 0 pins → `display_field` column gains
   `sticky:true + hideable:false`; display_field absent → throw; names no
   served column → throw; `=== uid` → throw (uid can never carry the pin);
   authored `hideable:true`/`sticky:false` with no other pin → throw.
   Explicit pins elsewhere skip derivation (author's choice).
5. ✅ **Sticky-count warning**: ≥4 sticky → `console.warn` at construction.

Verified: `test/column-constraints.test.ts` +13 cases (91/91 file,
**636/636 suite**, tsc+build+check-standards green). Fixture repairs:
`CcRuleEntity` gained `@Unique uuid` (its meta always declared
`uid:"uuid"` — the "uid must be served" check exposed the missing column,
a real fixture bug); `pricedMeta` dropped its bogus `uid:"amount"`;
`cc_ref_domain` gained `display_field`; the uuid `default_visible:true`
test moved its visibility-override proof to `created_at`.

**Empirical census (all 28+ metas)**: every authored uuid column already
conforms (`order:-1, sticky, default_visible:false`) — zero uid
violations. Pins are assembled two ways: literal `hideable:false` +
`STICKY_KEYS` spread (CRM list-configs) or full literal (be metas).
**ANOMALY found — `customer_link` declares `display_field:"uuid"`**: the
pin can never derive onto the uid → the service THROWS at boot after the
dal upgrade (verified empirically on the live meta).

**TIC — relation-entity investigation (DECIDED: declared `@Relation`
type — directed parent→child edge, NOT an N-N junction)**
`customer_link` is a SECONDARY entity, never a standalone page: no
single read key (viewpoint-dependent), no meaningful single
`display_field`. The directional display needs TWO composites: from the
parent's page `$t(type.label_key) + child_name`, from the child's page
`$t(type.inverse_label_key) + parent_name`. Facts established:

- `customer_link_types` carries ONE vocabulary (`label_key`) — the
  inverse (`inverse_label_key` + seeds ×7) is a NEW schema column.
- `@Unique(indexName)` composite already exists → `(a,type,b)` edge
  uniqueness is declarable today.
- `@Ref` on class ends → free `{a}_name`/`{b}_name`/`{type}_name` joins;
  but class-`@Ref` then FORBIDS authored meta `type:"ref"`/`ref` (drift
  throw) — meta columns revert to visibility tuning only.
- Contract: `EntityMeta.display_field: string` required → must become
  `?:` (forbidden on relations, still required on main entities);
  `EntityMetaResponse.display_name: string` → `string | null` (relations
  serve null; FE consumers already guard falsy — verified).
- Facet flow mirrors dict exactly: `@Relation(opts)` class marker →
  `getRelationFacet` chain-walk → `DomainService.relationFacet`
  (duck-typed `EntityServiceLike.relationFacet`) → `assembleMeta`
  injects `relation:`.
- `registerRefDisplay` → null for relations: no `_name` join onto an
  edge (correct — nothing should @Ref a relation; lint/throw optional).
- No embedded-relation UI exists yet — the facet ENABLES it (direction =
  which end-column is filtered).
- Lint has zero meta rules — the construction gate is the enforcer.

**DECIDED — the entity kind is a DIRECTED PARENT→CHILD RELATION, not an
N-N junction.** `customer_link`'s own column names say it
(`parent_customer_uuid`/`child_customer_uuid`); N-N cardinality is
incidental, the model is directed typed edges. Marker `@Relation` with
facet `{ parent_field, child_field, type_field?, hierarchical? }` —
validated at construction (fields resolve to physical `@Ref` columns,
parent≠child as fields). Relation contract: `display_field` FORBIDDEN,
pinned-column requirement EXEMPT (uid invariants kept), columns kept,
generic CRUD endpoints stay. Ends immutable: `withColumnConstraints`
INJECTS `immutable:true` on parent/child columns unconditionally —
repoint = delete+create (existing `MetaColumn.immutable` contract:
create-set, frozen afterwards).

**DECIDED — non-directional uniqueness is DERIVED, not declared.** The
`@Relation` facet makes `getEntityPersistenceMeta` emit a derived unique
index `UNIQUE(LEAST(parent, child), GREATEST(parent, child), type?)` —
atomic 2-cycle rejection covering exact-dup AND reverse-dup in ONE
constraint (no check-insert race possible; `version` can't guard inserts
— no shared row exists). Requires `expressions` support in
`SchemaIndexMeta`/`EntityPersistenceMeta.indexes` + verbatim emission in
`indexDdl` + indexdef handling in the DB snapshot. Errors mapped
service-side: reverse-direction collision → `ERR_CIRCULAR_REFERENCE`,
same-direction → `ERR_DUPLICATE_RELATION`. `hierarchical: true` adds the
deep-cycle (3+ hops, same-type edges) recursive check on insert —
best-effort, race window documented (only serializable tx fully closes
it).

**DECIDED — no `symmetric` flag.** `inverse_label_key` NULL = self-inverse
(construction+convention, not configuration). `inverse_label_key` is
NULLABLE (dict create-draft supplies only code+label_key; extras go to
the update-sheet surface). `DictFacet` gains
`directional?: { forward_label_field, inverse_label_field }` — the TYPE
entity declares its pair. Dict VALUE stays the ONLY inline editor.

**TOC sequence — relation entity**:

1. **core**: `EntityMeta.display_field?` (required by enforcer on
   non-relations); `EntityMetaResponse.display_name: string | null`;
   `RelationFacet` type + `relation?:` on the response;
   `DictFacet.directional?`.
2. **dal**: `@Relation`/`getRelationFacet` + `DomainService.relationFacet`;
   `withColumnConstraints` relation branch (display_field→throw, pin
   exempt, ends→`immutable` inject, facet fields must be physical `@Ref`
   columns); `SchemaIndexMeta`/`indexes` gain expression keys;
   `indexDdl` emits expressions verbatim (parenthesized); DB snapshot
   `parseIndexColumns`/diff handles expression indexes; the derived
   pair-unique index emitted in `getEntityPersistenceMeta`.
3. **sdk**: `EntityServiceLike.relationFacet` duck-type + `assembleMeta`
   `relation:` injection; `display_name` null on relations.
4. **crm**: `CustomerLinkEntity` — `@Relation` + `@Ref("customer")` on
   both ends + `@Ref("customer_link_type")` on type_uuid + ends→immutable
   via injection; meta without display_field; update DTO drops ends;
   service maps unique violation → circular/duplicate errors;
   `hierarchical` deep-cycle check. `CustomerLinkTypeEntity` →
   `DictEntityBase` + `inverse_label_key` + `@Dict({directional})` +
   nav `dictDecl` entry; patch: new column + seeds/translations ×7 +
   the derived pair index (patcher-generated, never hand-written).
5. **fe**: `display_field`/`display_name` optional in FE types (call
   sites already guard falsy); dict extras update-sheet = FUTURE work
   (first consumer: `inverse_label_key`).
6. **docs**: `display_field` optionality + relation facet contract in
   dal/core dev-guides.

**TOC status — ALL DONE (2026-11-14)**: 1 core `7850431`+`73d0108` · 2 dal
`2c7cef7`+`0cb17f7` · 3 sdk `0a2d753` · 4 crm `d79f1fe` (patches applied:
pair index `customer_links_pair_uq` LIVE — exact+reversed dup rejected
atomically, drift-free vs `pg_get_indexdef`; `inverse_label_key` +
translations ×7 seeded) · 5 fe `c788f4c` (display_field guard + icon
fallback fix, 671 tests) · 6 dal dev-guide `@Relation` section. be-v3
`7916976` seeded `app.common.validation.immutable` ×7. dal `ba4a575` —
23505→ERR mapping IS the conflict CTE, derived from the facet:
same-direction → ERR04/ERR05, reversed → **ERR11** circular reference
(new `DalErrorCodes` entry; add+update+addMany covered; verified live on
crm). NOT done: `hierarchical` deep-cycle insert check (declared,
unimplemented — flag NOT set on customer_link), dict extras
update-sheet, embedded-relation UI.

**TOC JH-schedules — ALL DONE (2026-11-14)**: ① `68aa7e3` patch `0010`
("Cadenza" ×7) → ②③④ `0393390` entity+writer+meta+nav (`armed_by`
@Calculated COALESCE trigger→`public.user_profiles`→service_code; drops
shipped; nav `[triggers(def),schedules,runs]`) → ⑤ FE `e3e1974`
`format:"service_code"` module badge → ⑥ `6b4c129` patch `0011` —
patcher refuses DROP COLUMN by design (warn-only), so DDL authored:
3 drops applied live + labels/tooltips ×7 seeded; `armed_by` resolves on
all 6 live schedules (trigger-name + service-code branches proven) →
⑦ `e8e4f4c` e2e rewrite — **PASSED live** (pinned armed_by checked+
disabled, uuid enabled, zap badge, "Source Queue"/"Cadence" labels) +
`service_code` documented in `entity-meta-schema.md`.

**TIC round 3 — dict extensibility (facts kept)**:

- `DictEntityBase`/`ConfigEntityBase` are SIBLING bases; the polymorphic
  VALUE concept lives in config (`type`→widget + `type_config`).
- Dict row edits ONE inline VALUE (`display_field`→TranslationKeyCell→
  `i18n.translationEditor` sheet); extra physical columns compute into
  `editable_columns` but render NOWHERE — extras go to the update-sheet
  surface (to be built; `inverse_label_key` is its first consumer).
- `customer_link_type` was NOT a dict (hand-rolled uuid/code/label_key/
  sort, seed-only, no surface) → re-base onto `DictEntityBase` + extras
  `inverse_label_key` + dictDecl nav = consolidation AND user-manageable
  directional vocabularies.
- `customer_link` is the ONLY directed-edge table today — this design is
  the precedent for all future relation entities.

### D — job_schedule entity + meta (`primebrick-us-v3`)

6. **`armed_by` column** (`@Calculated`, `armed_by?: string` on
   `JobScheduleEntity`); `display_field:"armed_by"` → auto-pin via B.4.
   `order:0`, label `fields.armed_by` ×7 (proposed "Armed da"/"Armed By"
   family — wording to confirm), searchable if the DAL supports ILIKE on
   calculated projections (verify — else subject+service_code cover).
7. **`job_name` + `initiator` physical drop** — patch
   `ALTER TABLE job.job_schedules DROP COLUMN job_name, DROP COLUMN initiator`
   (and `job_runs.initiator` — decide same patch); entity props removed;
   `schedule-service.ts` stops writing both (keeps actor stamping from
   `input.initiator`/`caller_service`); `run-recorder.ts` stops writing
   `initiator`; `jobs.service.ts` SCHEDULE_FILTERABLE/searchableKeys
   shrink; meta columns + dict keys removed.
8. `service_code` → `format:"service_code"` (new literal — core union +
   TableCell branch + doc); module badge + uncolored icon + link. Same on
   `job_run.service_code`.
9. `schedule_subject` → NORMAL column: drop `sticky`/`hideable:false`;
   `order:15` (after armed_by, before service_code);
   `format:"nats_subject"` (kept) + `icon:"zap"` + `color:"amber-500"` +
   `tooltip`/`tooltip_title`/`tooltip_priority:"HINT"` (new dict keys ×7).
   NO `options_source` — read-only mirror, no forms.
10. `target_subject` → `format:"nats_subject"`, `icon:"send"`,
    `color:"sky-500"`, tooltip triple ×7; keep `order:50,
    default_visible:false`.

### D2 — Nav reorder (`nav-declaration.ts`)

11. `nav` → `[{id:"triggers", default:true}, {id:"schedules"}, {id:"runs"}]`
    and `routes` reordered to match. The nav-declaration test
    (`src/__tests__/nav-declaration.test.ts`) verifies structure — re-run;
    served `service_registry.endpoints.nav` changes → FE sidebar/app-nav
    reorder lands via census on next registration.

### E — Translations (decided wording; new patch `0011_*` covers all)

| Key | it-IT | en-GB/US | fr-FR | es-ES | de-DE | pt-PT |
|---|---|---|---|---|---|---|
| `schedule_subject` | Coda di Ingresso | Source Queue | File source | Cola de origen | Quell-Queue | Fila de origem |
| `schedule_spec` | Cadenza (applied, confirmed) | Cadence | Cadence | Cadencia | Kadenz | Cadência |
| `target_subject` | Destinazione Evento | Destination Event | Destination de l'événement | Destino del evento | Ereignisziel | Destino do evento |
| `fields.armed_by` | Armato da | Armed By | Armé par | Activado por | Aktiviert von | Ativado por |
| `status.infra_derived` | Sistema | System | Système | Sistema | System | Sistema |
| `status.manual` | Utente | User | Utilisateur | Usuario | Benutzer | Utilizador |
| ~~`job_name`~~ | dropped | dropped | dropped | dropped | dropped | dropped |
| `job_run.job_name` | Nome Processo | Job Name | Nom du job | Nombre del job | Jobname | Nome do job |

(+ `schedule_subject`/`target_subject` `*.hint`/`*.hint_title` tooltip keys
×7 — copy drafted in the patch, final wording reviewed with the label run.)

New tooltip keys ×7 also needed for schedule_subject + target_subject
(`*.fields.<f>.hint` / `.hint_title`).

→ Implementation = ONE new patch `0011_*` covering all label+tooltip changes
(decisions folded in); patch 0010 keeps or gets corrected depending on your
`schedule_spec` call — 0010 is applied-but-uncommitted; if wording changes
it's rewritten before first commit (never shipped) — still a NEW patch file
if the DB must change after commit.

### F — Tests (persistent, first-write deliverables)

- `columns.test.ts` (already): sanitize re-injects pinned; UUID stays
  user-controlled. Extend for A.2 ordering (pinned-first sticky sort).
- `column-constraints.test.ts` (dal): uid invariant throws; ≥1-pinned
  invariant throws and passes on fixtures.
- FE e2e `sticky-hideable-columns.spec.ts` (rewrite to final anatomy):
  pinned column first + checked-disabled; uuid enabled toggle, hidden by
  default, second when shown; schedule_subject normal column with
  zap/amber badge; labels deduplicated per chosen wording.
- Sweep-regression: every entity's served meta has ≥1 pinned column
  (cheap vitest over meta fixtures where they exist).

### G — Docs

- `entity-meta.ts` convention comment (core), `entity-meta-schema.md` (fe),
  `entity-metadata.mdx` (fe dev-guide) — new identity-column contract.
- `check-standards` doc note if C lands.
- `make-docs` extraction refresh where diffs touch dev-guide surfaces.

## Acceptance criteria

- uid column enforced `sticky + order:-1 + hidden-default + toggleable`
  on EVERY entity (boot throw on contradiction; negative fixture test).
- ≥1 pinned `sticky+hideable:false` column guaranteed per served meta —
  explicit or auto-derived from `display_field`; uuid FIRST when toggled
  visible, pinned SECOND (`order:-1` vs `order:0`, existing sort).
- ≥4 sticky columns → construction warning (allowed, discouraged).
- job_schedule: `armed_by` (calculated) pinned via display_field
  derivation; `job_name`+`initiator` columns dropped; subject columns
  carry full event/target chrome; `service_code` renders as module badge
  (uncolored icon); `kind` badge reads Sistema/Utente/Trigger; no
  duplicated labels.
- Nav order triggers→schedules→runs live in sidebar + module menu.
- All translation values per approved table before the patch lands.
- Empirical verification on `/system/job/job-schedules` (screenshot) +
  e2e green; commit per repo per commit-verification.md.

## Remaining open items

1. **New-column key name**: `armed_by` (recommended — `*_by` family) vs
   user's coinage `schedule_armer`. Also label wording "Armato da"/"Armed
   By" family ×7.
2. **`job_schedules` drop scope**: `job_name` + `initiator` drop together
   in one patch — also `job_runs.initiator` (write-only, redundant with
   `service_code`) — confirm same patch or separate.
3. **`user_profiles` schema name** for the `armed_by` subquery — resolved
   at TOC (BE-owned entity, likely `system`/`auth`; verify via DAL audit
   join target).
4. **Labels final sign-off**: `schedule_subject`→"Coda di Ingresso" family,
   `armed_by`→"Armato da" family, `target_subject`→"Destinazione Evento"
   family, `status.infra_derived`→"Sistema", `status.manual`→"Utente",
   `job_run.job_name`→"Nome Processo", `schedule_spec`→"Cadenza" (applied).
5. **Sticky-warning channel**: construction `console.warn`/logger
   (recommended) vs file-count rule in `check-standards` (heavier).
6. **Nav `default:true`**: moves to `triggers` (recommended — matches
   "prima la pagina Trigger") or stays on schedules.
7. **Relation entity type (`customer_link`) — DECIDED + APPROVED**:
   `@Relation` marker, facet `{parent_field, child_field, type_field?,
   hierarchical?}`; `display_field` forbidden; pin exempt; ends
   `immutable` injected; derived unordered-pair+type unique index
   (patcher-generated); no `symmetric` (NULL `inverse_label_key` =
   self-inverse); `DictFacet.directional` declares the label pair;
   extras via update-sheet (future FE work). Residual: deep-cycle check
   scope (`hierarchical` opt-in).
