# CRM migration completion — entities ex-novo + existing, all on new-arch

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN. IT IS THE WORKFLOW.

Every turn, in this order, NO EXCEPTIONS:
1. Read this whole plan — this block IS the operative workflow.
2. Fill in DOC RECEIPTS below before any action (cite doc:line).
3. State of the world = VERIFICATION LEDGER, never your memory.
4. Execute only the declared scope. Anomaly → STOP → report, max 2 retries.
5. Output waits ≤30s. Beyond that = anomaly, not "still running".
6. Before closing: write verdict + ledger + next step into the plan.
7. Prova del 9: every state claim carries `file:line` — if you cannot
   cite it, you did not verify it, it is an assumption.

## DOC RECEIPTS (fill before acting)
| doc:line | what it says | how it applies this turn |
|---|---|---|
| primebrick-workspace/ai-plans/_template.md:1-17 | turn protocol — plan-first, ledger is truth, file:line citations | this plan exists because the CRM audit was started WITHOUT a plan (user correction 2026-11-27 — workflow violation, not to be repeated) |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-27 | inventory crm schema vs entities-route | data plane COMPLETE | 19 tables in `primebrick-us-v3/crm/db-meta/snapshot-database.json` — every one served: 16 explicit decls in `primebrick-us-v3/crm/src/controllers/http/entities-route.ts` (grep `entityName:`) + `sequence` builtin via dal-pg registry + `sequence_counters` internal + `config_entries` config-standard + translations gateway-owned; `customer_consent` read/audit-only BY DESIGN (entities-route.ts comment) | verify FE plane |
| 2026-11-27 | inventory FE surfaces | ONE hardcoded leftover | `primebrick-fe-v3/src/routes/(app)/crm/customers/+page.svelte` is the ONLY hardcoded crm page (find verified); remote bundle `primebrick-us-v3/crm/fe/src/` carries CustomerCreatePage.svelte + PipelinePage.svelte | task 1 |
| 2026-11-27 | check BE residue | none | `primebrick-be-v3/src/modules/crm` does not exist (ls verified) — monolith crm module fully gone | — |

## Status: 🟠 WIP — Plan date: 2026-11-27 / TOC session 8

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Audit `routes/(app)/crm/customers/+page.svelte` — what it renders, whether its features exist in the new-arch generic/remote surfaces; migrate or document as deliberate custom | ⏳ not done | — | the only hardcoded crm page left in FE |
| 2 | Inventory ex-novo entities still to CREATE (user: "prima creiamo tutte le ex-novo") — cross-check the campaign intent: which entities were planned but never created in CRM | ⏳ not done | — | user says existing ones should all be migrated — data-plane audit CONFIRMS (ledger row 1); ex-novo inventory still open |
| 3 | When 1+2 close: migration-completion verdict + user-guide/dev docs reconciliation | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Context — the stepwise wire-up campaign

The big-plan doctrine (user, 2026-11-27): everything moves to the new
microservice wire architecture in steps — JH was first, CRM is the current
step. CRM introduced many new entities; the campaign order is:

1. create the ex-novo entities directly in new-arch;
2. migrate the pre-existing ones — the user expects these ALL migrated
   already (data-plane audit confirms: every crm table is served in
   new-arch; see ledger).

Open question the user must answer or the audit must close: the ex-novo
creation inventory (task 2) — is there a list of planned-but-never-created
CRM entities? No master campaign plan file was found in ai-plans — if it
exists elsewhere, link it here.

---

## 2026-11-27 — THE REAL GAP (user correction: entities are MISSING = unreachable)

Lazy-audit verdict reversed: route existence is NOT user reachability.
`primebrick-us-v3/crm/src/nav-declaration.ts` declares exactly 2 dictDecl
leaves (customer_types, customer_link_types) + customers + pipeline —
while the service serves 16 entities. UNREACHABLE (served but no nav
leaf): company_dimension, consent_type, contact_type, account_kind,
customer_account, customer_consent, customer_contact, customer_link,
legal_form, local_address, local_address_type, marketing_qualification,
qualification. Sequences surface via builtinNavContributions (dal-pg) —
verify separately. TASK 2 REDEFINED: nav completion IS the migration
gap — every served entity needs its dictDecl leaf + label keys +
E2E verification of user-visible reachability.

---

## 2026-11-27 TIC — NAV AUTO-WIRE investigation (user question: why hand-authored at all?)

### Evidence gathered (file:line)

1. **The auto-wire machinery EXISTS and runs in production for builtins**:
   `primebrick-v3-sdk/src/microservice/create-microservice.ts:651` —
   `const nav = mergeBuiltinNav(options.nav, schemas)` at boot merges
   builtin-contributed leaves into the module nav automatically. Sequences
   appear in CRM nav with ZERO hand-written leaves — proof the pattern works.
2. **Module entities have no equivalent path** — their leaves are hand-written
   in `nav-declaration.ts`, a SECOND declaration parallel to `entities-route.ts`.
3. **Validation is one-directional**: `validateNavDeclaration` checks nav→route
   (every nav link resolves to a declared route) but NEVER route/entity→nav
   (every served entity must surface). Drift was structurally guaranteed.
4. **dictDecl is already a pure function of (table, entity)** — zero extra
   information needed; and entity decls already carry everything:
   `entityName` (wire), `spec.tag` (plural table), meta, permissions.
5. **Translation gap compounds**: only 2 `crm.settings.nav.<table>` keys are
   seeded (db-meta patches) — auto-wire must seed labels too.
6. JH comparison: its nav is also hand-authored — no service has the
   derivation yet; only builtins do.

### Design options (presented to user, awaiting ratification)

- **A — service-level derivation**: nav-declaration imports crmEntityDecls
  and derives settings leaves programmatically. Kills duplication in crm only.
- **B — universal SDK auto-wire (user vision: "la classe in pasto al facade")**:
  entity decls carry optional nav metadata; createMicroservice derives leaves
  for every entity BY DEFAULT (opt-out, never opt-in) — same merge seam as
  builtins extended to module entities. Every service present/future free.
- **Recommended path**: implement the derivation as an SDK helper
  (`deriveEntityNav(decls, opts)`) — one shared implementation, adopted by crm
  first, promotable to default-on inside createMicroservice later without
  breaking shape.

### Open design sub-questions for ratification

1. Surface class per entity: vocabularies → settings `dict` archetype;
   operational composites (customer_account/contact/link/consent,
   local_address) — standalone `list` leaves too, or customer-detail-only
   (detail pages don't exist yet)? Proposal: EVERYTHING visible by default,
   refine later — visibility first.
2. Opt-out semantics: entities that must never surface standalone declare it
   explicitly on the decl (`nav: false` + reason) — enforcement by construction.
3. Label keys: seed `crm.settings.nav.<table>` translations for all tables
   (patch) — keys already conventional.

---

## 2026-11-27 TIC-2 — ENTITY CENSUS (user doctrine ratified)

### Ratified doctrine (user, verbatim)

- ALL entities in their archetypes are visible BY DEFAULT; opt-out on the
  nav leaf only (does not impact the route).
- UPDATE/DELETE are NEVER nav leaves; CREATE and LIST are.
- DICT/derived/standard entities: leaf by default.
- Bridge / extended tables (audit trails, N-N bridges): NO leaf, not
  directly consultable — explicit exclusion class.

### Census — 16 module entities + builtins (evidence: entity classes, entities-route.ts)

**CLASS A — vocabularies (dict archetype → settings leaves) — 10**
customer_type ✓in-nav, customer_link_type ✓in-nav, company_dimension,
legal_form, qualification, marketing_qualification, contact_type,
account_kind, consent_type, local_address_type

**CLASS B — standard operational (list+create leaves) — 1**
customer ✓in-nav (list + create-stub already declared)

**CLASS C — dependent operational 1-N (customer sub-data) — THE FORK — 4**
customer_account (customer_uuid+legal_form+kind), customer_contact
(customer_uuid+contact_type), customer_consent (customer_uuid+consent_type —
read/audit-only wire, domain-written with seal), local_address
(customer_uuid+type_uuid). Evidence: FK columns in the entity classes.

**CLASS D — bridge N-N — NO leaf per doctrine — 1**
customer_link — declared `@Relation` edge (parent_customer_uuid,
child_customer_uuid, type_uuid): "the identity is the composite, the
relation facet owns the display" (customer_link_entity.ts header).
NOTE: the entity CRUD route exists with full create/update/delete
permissions (entities-route.ts) — doctrine says "not directly
consultable" — open question whether route stays API-only or restricts.

**CLASS E — builtin/internal (never leaf-authored)**
sequence (builtin, auto-wired via mergeBuiltinNav), sequence_counters
(internal), config_entries (config standard), translations (gateway-owned).

### Open questions for ratification (see chat — explained)

Q1 dependent-operational class: leaf-or-not + is it the "tabella estesa"
exclusion class? Q2 consent list-only leaf (no create exists)? Q3 bridge
route scope: API-only consultable vs restricted?

---

## 2026-11-27 TIC-3 — RE-VERIFICATION of the 2026-11-25 dict/auto-nav decision

### What survived implementation vs what is paper (file-verified today)

| Piece of the old decision | State 2026-11-27 |
|---|---|
| `DictEntityBase` in dal-v3 | ✅ EXISTS (`primebrick-dal-v3/src/entities/dict-entity-base.ts`) |
| 10 vocabulary entities extend it | ❌ **2/10 only** — customer_type + customer_link_type; the other 8 still `extends Deletable(Auditable(...))` hand-repeating the shape (grep-verified per file) |
| `kind:"dict"` in `PageRouteKind` | ✅ core `page-route.ts:16` |
| FE page-resolver `entity_dict` archetype | ✅ `page-resolver.ts:102` |
| `DictFacet` meta contract | ✅ core `entity-meta.ts:1114` — runtime-injected when class carries the marker |
| **nav derivation from class identity** | ❌ **NEVER IMPLEMENTED** — zero trace in sdk/core; the 2 hand-written dictDecl leaves (the SAME 2 entities that extend the base) are the surviving stopgap |

### The recognition pattern — revised, complete, mechanical

1. `instanceof DictEntityBase` → dict leaf in the settings sibling
   (inline-editing archetype: the leaf IS list+create in one surface)
2. `@Relation` marker → bridge — NO leaf, never standalone-consultable
   (customer_link already carries it — verified in its entity class);
   API routes stay for machine consumers
3. everything else = standard entity → list leaf + create leaf, derived
   from the DECLARED PERMISSION SURFACE (no create permission → no create
   leaf: customer_consent mechanically becomes list-only — zero special-casing)
4. opt-out: explicit `nav:false` on the decl, reason required
5. internal tables never enter the pipeline (sequence_counters is not an
   entity decl at all)

CONSEQUENCE FOR CLASS C: under this pattern customer_account/contact/
consent/local_address are STANDARD entities → leaf by default — matching
the user's own fallback ("if we can't find the pattern, they show").
The pattern recognizes them; no ad-hoc decision needed.

### TOC sketch (pending user ratification)

1. Complete DictEntityBase migration for the 8 vocabularies (mechanical)
2. Verify dict-facet injection path end-to-end (served meta)
3. THE FACADE WIRE: nav derivation inside the route-facade seam
   (makeServiceRoutes/createMicroservice already receives the entity
   decls — same input feeds routes AND nav; one declaration point)
4. Seed `crm.settings.nav.<table>` labels (only 2/10 exist today)
5. E2E: every entity visible+reachable in real browser, correct archetype

---

## 2026-06-09 — NAV AUTO-DERIVATION WIRE: design investigato e ratificato (fase TOC)

### Evidenza architetturale raccolta (tutta verificata file:line)

- Riconoscimento classi: `@Dict()`/`@Relation()` decoratori su entity class, ereditati via prototype chain — `getDictFacet`/`getRelationFacet` (dal `src/meta/entity-decorators.ts`). `DictEntityBase` porta `@Dict()` (dal `src/entities/dict-entity-base.ts:46`) — i sottotipi ereditano. Oggi solo customer_type + customer_link_type coperti (2/10).
- Il service espone i facet: `DomainService.dictFacet`/`relationFacet` getter (dal `src/entity/domain-service.ts:100/105`); l'SDK li legge in `assembleMeta` (`entity-router.ts:585-586`) — `EntityServiceLike` dittipl/relationFacet già tipizzati (entity-router.ts:92-95). **L'SDK non importa dal: recognition strutturale via service, non instanceof.**
- Facet `dict`/`relation` su EntityMeta (core entity-meta.ts:~1170).
- `mergeBuiltinNav` (sdk `src/http/builtin-entities.ts`) — il precedente: builtin nav merge in `createMicroservice` (`src/microservice/create-microservice.ts:651`), collisione module-authored = boot error, sibling find-or-create.
- `EntityRouteDecl` = EntityRouterConfig + spec: entityName, service, permissions (presenza chiave = rotta registrata), meta. `createMicroservice` legge `branded.entityDecls` dal route handler (create-microservice.ts:670) — **la seam: stesso input di rotte e nav**.
- Nav shape CRM (us-v3 `crm/src/nav-declaration.ts`): nav leaves {id,label_key,href,icon,default}, routes {route,kind,entity,label_key,component_url?}, siblings settings con dict leaves. kind list/dict senza component_url = host archetypes `entity_list`/`entity_dict`; form archetype richiede `page_props.form.fields` non vuoto (FE `page-resolver.ts:124`, core `page-route.ts:155-165` — fields è la lista ORDINATA, solo le chiavi dichiarate renderizzano).
- TableMeta (entity-meta.ts:988) è solo view config — NON porta il nome tabella. **Il plurale/path source manca dal contratto**: lo espone il service.

### Design ratificato + decisioni di dettaglio (questo turno)

1. **dal-v3**: `DomainService` guadagna `tableName` getter — stessa fonte di `getEntityPersistenceMeta(entity)` (derivato, mai ridichiarato).
2. **v3-sdk**: `EntityServiceLike.tableName?: string` (strutturale opzionale); nuovo `src/http/derive-entity-nav.ts` — funzione pura `deriveEntityNav(decls, nav, opts)`:
   - `decl.nav === false` → skip (opt-out esplicito sul decl — campo nuovo `nav?: false` su EntityRouteDecl)
   - `service.relationFacet` presente → MAI leaf (bridge: API resta, zero superficie UI)
   - `service.dictFacet` presente → dict leaf in sibling settings: id/label/href da tableName, kind "dict", label_key `<mod>.settings.nav.<table>`
   - altrimenti standard → list leaf in nav root (`<mod>.<table>.nav`, `/prefix/<table>`, kind "list") + create route (`/prefix/<table>/create`, kind "create", page_props.form.fields GENERATI da meta.columns: colonne editabili in create — non uid/managed/audited/hidden — ordinate per `order`) solo se `permissions.create` presente e non false (customer_consent → list-only automatico)
   - suppression: qualsiasi route module-authored che nomina l'entity (root o sibling) sopprime la derivazione PER QUELLA entity — l'autore la possiede (customers/pipeline restano scritte a mano)
   - collisione leaf id residua = boot error (stesso contratto dei builtin)
3. **Wire**: createMicroservice — nav = mergeBuiltinNav(deriveEntityNav(entityDecls, options.nav), schemas).
4. **CRM**: rimosse le 2 dict scritte a mano (niente di speciale — la derivazione le possiede); restano customers (default+icon+create remota) e pipeline.
5. Seed label `crm.settings.nav.<table>` mancanti + `crm.<table>.nav` — task separato nel piano.
6. E2E browser: visibilità/raggiungibilità/archetipo per ogni entità.

### 2026-11-27 — WIRE IMPLEMENTATO E VERIFICATO RUNTIME ✅

**Commit:**
- dal-v3 `feature/sequence-revive-docs` — `DomainService.tableName` getter (derivato da getEntityPersistenceMeta, mai ridichiarato)
- v3-sdk `feature/nav-derive-entity` (NUOVA branch — develop è merge-only, gitflow enforced) — `src/http/derive-entity-nav.ts` + wire in create-microservice.ts + `EntityServiceLike.tableName` + `EntityRouterConfig.nav?:false` + export index
- us-v3 `feature/sequence-revive-docs` — CRM adotta: rimosse le 2 dict scritte a mano, test riscritto sul contratto derivato (9/9 verdi)

**Verifica runtime (service_registry.endpoints.nav dopo re-registration):**
- Root nav: customers+pipeline (authored) + 12 foglie DERIVATE (8 vocabolari non migrati come standard — temporaneo fino a migrazione DictEntityBase; class C customer_accounts/contacts + local_addresses list+create)
- `customer_consents` — SOLO list, niente create (no create permission) ✅ per costruzione
- `customer_link` — ASSENTE ovunque (@Relation soppresso) ✅
- Settings sibling: customer_types/customer_link_types dict DERIVATE + sequences builtin appended last ✅
- Docs emit ha generato automaticamente le pagine user-guide di ogni entità derivata (account_kinds.mdx, *-create.mdx…) — la documentazione segue lo stesso wire

**Spec E2E permanente scritta:** `primebrick-fe-v3/src/e2e/nav-derive-crm.spec.ts` — sidebar/raggiungibilità/archetipi/bridge-assenza/consent-list-only. NON ancora eseguita (FE down al momento del lancio — restart in corso).

**APERTO — ordine dei prossimi slice:**
1. Eseguire nav-derive-crm.spec.ts a stack su — chiude la verifica TOC (5)
2. Migrazione 8 vocabolari a DictEntityBase (meccanica — TOC 1) → le loro foglie si spostano da root-standard a settings-dict automaticamente
3. Seed label `crm.<table>.nav` + `crm.settings.nav.<table>` mancanti (TOC 4) — oggi le foglie renderizzano chiavi raw
4. Verificare la forma del create derivato nel browser (entity_form archetype con fields generati)
