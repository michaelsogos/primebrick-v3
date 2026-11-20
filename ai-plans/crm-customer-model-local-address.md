# Plan — CRM customer model + local_address + geo components

## Status

- [x] **Step 1 — entities + patches + seeds + modules + routes: DONE**
  (verified: snapshot-check clean, tsc clean, standards clean, tests green)
  - 15 entity classes (10 dict — `consent_types` added as 10th — + 5 data),
    ENTITY_REGISTRY updated
  - 15 tables + 15 audit partitions applied; FKs (children→customer CASCADE,
    account→LA/contact RESTRICT), partial-unique `is_default`, LA dedupe,
    link edge-unique + no-self check, `UNIQUE(country,elf_code)`
  - `customers` ALTER: `display_name`, `customer_type_uuid`,
    `qualification_uuid`, `marketing_qualification_uuid`,
    `company_dimension_uuid`
  - Seeds: dict rows + row labels 7 langs (`crm.entities.<e>.rows.<code>`),
    versionHistory keys ×7 langs, ISO 20275 legal_forms = **3,597 rows /
    129 jurisdictions / ACTV+INAC both kept** (sentinels excluded)
  - 15 modules (list-config + meta + dto + service), audit labels via
    `system.common.fields.*`, `crm.<entity>.*` permission families (15×14),
    route decls in `entities-route.ts` (consents read-only + audit)
  - Schema fix shipped: `legal_forms.abbreviation` → `text` (GLEIF lists
    are semicolon-separated, up to ~320 chars)
  - Generator defects patched by hand (NOT fixed in emit-sql-patch):
    missing `DEFAULT gen_random_uuid()`, wrong `partman.create_parent`
    signature, audit tables unpartitioned w/ bad PK

> NOTE: sections below are the *historical* scope doc — where they
> conflict with the locked decisions above (e.g. `name` vs `display_name`,
> `country` on customer, ACTV-only), the locked decisions + code win.

- [x] **Step 2 — `depends_on` contract: DONE**
  (verified: DAL 525 tests, FE svelte-check+eslint clean, 145 FE tests,
  CRM tsc+standards clean, all 16 metas pass at import time)
  - Core: `MetaColumn.depends_on` + `MetaColumnDependsCondition` —
    `{field, filter_field, disabled_when, control_prop}` on the existing
    `{equals|not|values}` condition vocabulary
  - DAL `withColumnConstraints`: pivot must be physical; `filter_field`
    only on `type:"ref"`; prop-facets require a ref-declared pivot;
    `control_prop` banned on ref columns
  - FE: `entity_ref` now resolves on the FORM surface too (single-mode,
    same paged/search delegate — previously filter-only); `useEntityRefOptions`
    accepts scope filters; new `usePivotRow` (pivot row fetch by uid);
    `depends-on.ts` pure resolvers; dispatcher gates/resets/selects
  - CRM consumers wired: `customer_account.legal_form_uuid → country`
    (options filter), `customer_contact.value → type_uuid.value_kind`
    (control switch), `customer.company_dimension_uuid →
    customer_type_uuid.code=private` (gate)
  - Step-1 defect fixed in passing: all 16 CRM metas now wrapped in
    `withColumnConstraints` (job-handler convention) — derived
    nullable/pg_type/managed + boot validation actually run
  - Remaining gap noted: bigint-FK pickers (`local_address_id`/
    `contact_id`) store `id`, `type:"ref"` carries uuid — needs its own
    contract decision (step 3)
- [x] **Step 3 — data migration + flat-column drops: DONE**
  (verified: migration patch applied — 140 LA / 268 contacts / 35 legal
  accounts / 0 null display_name; db:check clean; CRM tsc+standards+13
  tests green; FE eslint+svelte-check+tests green; DAL 36 tests)
  - Patch `20261125000000_customer_flat_to_children.sql` (atomic):
    LA `civic`→`street2` (line1/line2 convention) + dedupe index rebuild;
    `local_*`→LA(type=legal, 'Italia'→'IT' explicit map); email/phone→
    customer_contacts EMAIL/VOICE is_default; company_name→legal
    customer_accounts (LA+email-contact linked); display_name backfill
    (first+last → company_name → code); DROP 10 flat columns; children
    of soft-deleted customers inherit deleted_at; label cleanup
    (street2 ×7 langs in, 11 orphaned keys deleted)
  - `ref.value_field` contract (core): non-uid stored values for true-FK
    pickers — `route:"none"` added to the union; `withColumnConstraints`
    throws on `value_field`+`route:"detail"` and on `route:"list"`
    without `filter_field`
  - FE: `useEntityRefOptions`/`usePivotRow` resolve the value column via
    `ref.value_field ?? meta.uid`; `entityRefHref` honors `route:"none"`
  - Account pickers wired: `local_address_id`/`contact_id` → `type:"ref"`
    `value_field:"id"` + `route:"list"`+`filter_field:"id"` +
    `depends_on customer_id` (customer-scoped options)
  - Event snapshot: `email`/`phone` DERIVED (default contacts — rule
    paths `$.customer.email` keep working); `display_name` +
    `legal_address{}` + `account{}` replace first/last/company/local_*;
    fake emitter + e2e spec + seed script + export template updated
  - dto/list-config/LA module updated (street2, no civic); seed-customers
    writes customer + contacts + legal account
- [~] **Step 4 — `dict` archetype: IN PROGRESS** (design consolidated
  2026-11-25; marker rebased 2026-11-22 — "not started" was stale:
  machinery shipped, adoption 2/10)
  - ✅ Machinery live: `DictEntityBase`+`@Dict()` marker → `dict` facet →
    `kind:"dict"` route kind → `EntityDictPage` (reorder/bulk-save/
    taint/`EntityDictRow`) + `dictDecl` factory + `/crm/settings`
    prefix + `crm-settings` virtual sibling nav node (modules-shell
    test) + e2e (`entity-dict-page{,-lifecycle}.spec.ts`)
  - ✅ Migrated: `customer_type`, `customer_link_type`
  - ⏳ Remaining 8 hand-rolled: `account_kinds`, `company_dimensions`,
    `consent_types`, `contact_types`, `legal_forms`,
    `local_address_types`, `marketing_qualifications`, `qualifications`
  - ⏳ `config_entry` re-base onto `DictEntityBase` (the drift-proof
    test — `key`→`code` rename + `sort` adoption; still
    `ConfigEntityBase` today)
  - 🔀 **Sub-plan extracted 2026-11-22**: `dict-page-create-flow-anatomy.md`
    — create-flow polish (discard CTA, single-draft gate, state-vocabulary
    chips, labeled inputs, validation, code-uniqueness probe, label_key
    commit convention, required-extras fix) + E2E. The dict page must be
    perfected BEFORE migrating the remaining 8 entities — the
    required-extras bug (L1) blocks `contact_types` today.
- [ ] Steps 5–10 — as listed below

## Scope (approved decisions — locked)

### LOCKED contract decisions
- Permissions: per-entity Permission families (option A) — SDK enum grows
  one family per new entity.
- FK: TRUE FK = bigint `*_id REFERENCES (id)` for parent-child
  (local_address/contact/consent/links.customer_id); LAZY refs = `*_uuid`
  uuid no-constraint + meta `type:"ref"` for lookup pointers.
- Dict row labels: `label_key` column + `display_field:"label_key"` +
  FE gap to close: ref options i18n-resolve label_key (like badges do).
  Seed rows translated via patch; user rows via `{entity, translations}`.
- `customer.country` DROPPED — country lives in LA + accounts (jurisdiction).
- `customer_accounts` ONE table + `kind_uuid → account_kinds` dict
  (runtime-editable; seed invoice/legal).
- Hierarchy: N-N edge table `customer_links` (adjacency, not closure —
  closure table only later as derived index if subtree reads go hot).
- Contacts = customer sub-array (like LA); `account.contact_id` picks one.
- `display_name` on customer (dirty ok); `company_name`+`legal_form_uuid`+
  `country` on the ACCOUNT (fiscal identity), not on customer.
- `legal_form`/`company_dimension` disabled when customer_type=private.
- Seeds ALWAYS via db patches; FE fresh-import CTA = separate future feature.
- `is_default` on accounts proposed (one per customer).

### Entities
DICT (9): `customer_types`, `company_dimensions`, `legal_forms` (ISO 20275
GLEIF seed), `local_address_types`, `qualifications` (LEAD,PROSPECT,
CUSTOMER,LOST,UNQUALIFIED), `marketing_qualifications` (MQL,SAL,SQL,PQL),
`contact_types` (SMS,VOICE,EMAIL), `account_kinds` (invoice,legal),
`customer_link_types` (subsidiary,employee,consultant,referent).
DATA (5): `local_addresses` (customer_id FK, type_uuid, street, civic,
postal_code, city, province, country, lat, lng, poi_name),
`customer_accounts` (customer_id FK, kind_uuid, company_name,
legal_form_uuid, country, local_address_id, contact_id, is_default),
`customer_contacts` (customer_id FK, type_uuid, value, is_default),
`customer_consents` (customer_id FK, consent_type, doc_version, granted_at,
revoked_at, channel, ip, user_agent, seal),
`customer_links` (parent_customer_id FK, child_customer_id FK, type_uuid).
CUSTOMER adds: display_name, customer_type_uuid, qualification_uuid,
marketing_qualification_uuid, company_dimension_uuid.

### customers changes
- + customer_type_id, company_dimension_id, legal_form_id, country (ISO-2 pivot),
  qualification_id, marketing_qualification_id, name (single field).
- Migrate: first+last_name / company_name → name; local_* flat → local_address(type=legal);
  then DROP: first_name, last_name, company_name, local_address, local_city,
  local_state, local_country, local_zip.

## Deferred (separate plans)
- **Field-level security** — MetaColumn.required_permission/sensitive; DAL+API
  enforcement server-side; own plan doc, to be scheduled after this feature.
- **Geo infra choice** — Photon/Nominatim (Italy vs planet) deferred; components
  designed against a `/geo` proxy contract so the backend engine is swappable.

## Contacts — `crm.contact` (1-N customer→contacts)
- Columns: customer_id FK, type_id → `crm.contact_type` (TABLE, seed SMS/VOICE/
  EMAIL, user-editable), value, is_default, label (optional).
- Only one default per (customer,type): partial unique index
  `UNIQUE(customer_id, type_id) WHERE is_default`.
- Type-dependent validation+control: value format follows the selected
  type's `code` (email → zod email + EmailInput; SMS/VOICE → E.164 +
  PhoneInput/PhonePrefixSelect) — resolved via the SAME `depends_on`
  contract below (control/validation driven by sibling value).

## Lookup/enum-like tables — `dict` surface + auto-nav (decided, consolidated 2026-11-25)
- Every registered entity gets ELT+create+update by default (convention).
- **Marker = class identity, not a flag**: `DictEntityBase` (NEW abstract
  in `primebrick-dal-v3/src/entities/`, sibling of `ConfigEntityBase` —
  same proven pattern) carrying `{id, uuid, code, label_key, sort}` +
  `@AuditTrail()` + `@Cached(300_000)`, `extends Deletable(Auditable(
  EntityBase))`. Decorators propagate via `collectMetaChain` parent-first
  (verified in `entity-base.ts`); the concrete class declares only its
  extras (`contact_types.value_kind`, `contact_types.category`,
  `legal_forms.*`…). `@Entity("<table>","<schema>")` on the concrete class
  overrides the abstract's anchor — ConfigEntityBase convention.
  - The 10 dict entities today hand-repeat the same shape
    (`customer_type_entity.ts` vs `contact_type_entity.ts` identical minus
    `value_kind`) — refactor into the base kills that duplication.
  - `instanceof DictEntityBase` → `withColumnConstraints`/registry injects
    the `dict` facet into served meta → nav-derivation emits
    `kind:"dict"` route + leaf. ONE declaration point, zero hand-placed.
  - `kind:"dict"` added to `PAGE_ROUTE_KINDS` + `PageRouteKind` (core+SDK);
    `page-resolver`: `entity` + `kind:"dict"` → `archetype:'entity_dict'`.
- **`ConfigEntityBase extends DictEntityBase` is the END-STATE wire** —
  config_entry inherits the marker → `/system/settings/configurations`
  becomes the dict kind and the bespoke page dies. Column reconciliation
  is THAT step's destructive part: dict base carries `code`+`sort`,
  config tables carry `key` (unique) and no `sort` → `key`→`code` rename
  (blast radius: `ConfigLoader WHERE key=`, every service's
  `config-route.ts`, seeds, FE `entry.key` refs) + `sort` adoption
  decision. Recommended: full base + rename at migration step.
  Alternative if rejected: minimal base `{uuid,label_key}` + enums keep
  `code`/`sort` per-class (marker still propagates, zero config schema
  change, weaker dedup).
- **Nav model (verified)**: `settings`/`Impostazioni` is a SIBLING NODE
  of the module, not a child — the reserved BE-owned `settings` module is
  the precedent (`module:"settings"`, `route_prefixes:["/system/
  settings"]`, own namespace `access.system.settings`). For CRM: dict
  routes under `/crm/settings/<entity_plural>` (added to
  `route_prefixes`), composer mounts a sibling "Impostazioni" node
  aggregating the module's dict leaves; access `access.crm.settings.*`
  derived per leaf. Virtual-sibling mechanics TBD in implementation
  (declaration field vs auto-composition from `kind:"dict"` routes).
- **Page = ConfigList ported, NOT from zero** (live-verified via
  Playwright on `/system/settings/configurations`): `EntityDictPage` +
  `DictRow` FE-local (`$lib/components/entity-dict-page/` — host-rendered
  only, remote bundles never render it → ui promotion only if needed).
  - Shell: `SelectableToolbar` (select-all + bulk CTAs left, add-row CTA
    right), scrollable flat row sequence — **grouped fieldsets ONLY when
    `dict.group_field` declared** (config_entry.group_key compat).
  - Footer = FormPageLayout/ConfigList standard: left = taint status
    ("N righe modificate" + row badges), right = atomic bulk Save.
  - `DictRow` anatomy (ConfigListRow port): `[✓] title(display_field)
    + badges │ desc|tooltip (both, distinct, when both exist) │
    N dynamic cells │ undo+actions`. Audit strip: `v{version}` +
    updated_at + `updated_by_name` — **already served on `/list`**
    (`entity-service.joinsFor()` → `buildAuditableJoinsSelective` on
    EVERY auditable list+get — verified, zero BE work).
  - Cells = `FormFieldDispatcher` mounted per editable column
    (`column`/`value`/`record`/`columns` props — standalone verified):
    THE single control resolution (depends_on/control_prop/entity_ref
    work unchanged — kills the ConfigValueInput-drift question for dict).
  - Editable = non-managed non-uid non-audit columns; `code`/`value_kind`
    editable (admin responsibility; delete/restore cover the rest —
    soft-delete already on all dict entities via Deletable mixin).
  - Data = `useEntityList` (meta + paged/search `/list`);
    `default_page_size:10`, `page_size_options:[10,25,50]` via TableMeta.
  - Taint map (draft vs original per row), undo per-row, bulk revert,
    selection + bulk delete/restore (existing bulk ops); `meta.actions`
    drives CTA visibility — RBAC free.
  - Row CTAs = ELT `RowActionsMenu` contract (`row_custom_actions` +
    standard ops from `meta.actions`, `visible_on`, `required_permission`)
    — extract once (today duplicated 4× inside ELT), dict consumes.
  - Reorder: chevron up/down (PayloadMapEditor precedent) → row marked
    tainted → persists in the SAME atomic bulk save (no dedicated
    endpoint); drag'n'drop handler later. No row icon v1 (slot stays).
  - Add-row = DictRow "new" mode → `POST /entities/{e}` `{entity:{...}}`.
- **Labels = the translation standard, never copied**:
  - Label cell renders `t(label_key)`; **editing a label = writing a
    `translation` row** — `PUT/POST /api/v1/entities/translation
    ?module=crm` `{entity:{key,language,value}}`, gateway-owned
    (`entityOnlyWriteBody` rejects piggyback on US routes — verified).
  - Add-row: `label_key` auto `crm.entities.<e>.rows.<code>` +
    `addPendingTranslation` queue → save orchestrator: entity POST →
    `/svc/crm`, then translation POSTs → BE. Non-atomic BY DESIGN
    (cross-service); orphan `label_key` tolerated + resolvable later.
  - Save orchestrator splits: entity-writes → `/svc/crm`,
    label-writes → BE translation route (key→{uuid,version} via
    translation list). Two standard write paths, one orchestrator —
    zero invention.
- **Collab**: presence hints ON the dynamic input (not the key column):
  "UTENTE A sta modificando…" + "Tu — altro browser" (form-page standard).
  `mergeDelta` per cell: untouched → silent merge + untaint + emerald
  flash (`PresenceStatusChip` counter); tainted → `FieldConflict` →
  manual resolution UI (form standard). Header zone: dict declares its
  `collab-status-store`/`PresenceStatusChip` state = aggregated presence
  over visible rows.
  - ⚠️ REMINDER (user): **list-page collab header zone is not designed
    yet** — the dict header-zone contract is drafted to also template
    ELT's later; do not bake dict-only assumptions into it.
  - Transport: entity-scoped channel — ONE SSE per entity, server
    multiplexes `{uuid, session_id, field}` (per-record
    `presence-channel-registry` pattern lifted one level; SDK
    `streaming:"sse"` route kind exists). Phase 1: entity-changed →
    debounced `refreshRows()` (no row-matching — refetch recomposes
    correctly under sort/filter/insert/delete). Phase 2: per-row
    presence markers via same channel. NATS/Redis semantics unchanged
    (second fan-out on the same source).
  - Own-tab `syncChannel` BroadcastChannel stays (family refresh).
- **Anatomy convergence noted, not forced**: ConfigListRow /
  PayloadMapEditor fieldRow / ComboSelect detailed share the anatomy
  family — a `RichListItem`/`EditableRow` in @primebrick/ui MAY emerge;
  extraction only if natural, never coerced.
- **`label_key`→i18n display gap closes here** (pre-existing bug):
  `display_field:"label_key"` renders the raw key today in ref
  options/selected labels/cells — FE i18n-resolves when the resolved
  display field is `label_key`.
- **Slice order**: `customer_type` vertical first (meta→route→page→row
  live via Playwright E2E), then the other 9 = facet/route lines each.
  Then config_entry migration as the drift-proof test.
- **Open investigations (this session)**: boot-time runtime drift
  warning on CRM entities (`typeMismatches` text-vs-int8/uuid/timestamptz
  + onlyInDatabase indexes/FKs on customer_consents/links) vs `db:check`
  clean — reconcile the two drift detectors; client-shield 401 on
  `/system/docs/pack` + heartbeat errors (transient?).

## Queryability tiers + column-shard storage (solves encrypted-vs-searchable)
JOIN expressions CAN reference non-join pii columns — "JOINs unaffected"
was too lazy; WHERE/SELECT on joined rows can touch pii → the storage
layout must isolate crypto cost to when pii is actually involved.

### Vertical split — `<entity>_pii` 1-1 extension table (CARNE)
```
customers                    customers_pii        customers_pii_hot (tmpfs)
id / name / country / …      customer_id PK·FK    customer_id PK·FK
qualification_id …           email   enc:v1:…     email   plaintext + real idx
                             tax_code enc:v1:…    tax_code plaintext + real idx
```
- Queries not touching pii cols never even READ the ext/hot tables —
  crypto cost only when the census says a pii column is in
  projection/predicate; `hot` columns answer via real indexes in RAM.
- Shred = destroy DEK (or drop ext row) — instant, backups stay ciphertext.
- Different retention/ACL/tablespace possible on the ext table later
  (true sharding is the same pattern at a different boundary).

### Decrypt-in-projection (MEZZA CARNE — tier, not default)
`SELECT decrypt(col)` + WHERE on the result preserves the
"backups-hold-ciphertext" property BUT hands keys+plaintext to the DB
process during execution (visible in pg_stat_activity/logs; seq-scan
decrypt, no index ever). Acceptable tier `db_decrypt` for fields where
live-DB transient exposure is tolerable — documented, not the default.

### Materialized view of decrypted data — REJECTED as disk object,
### RESURFACES as RAM-resident derived cache (the correct version)
On a persistent tablespace it fails (physical backups/WAL/snapshots
capture it; insider SELECTs it). Made TRUE by storage, not policy:
**tablespace on tmpfs/RAM volume** (`CREATE TABLESPACE pii_hot LOCATION
'/dev/shm/pii'`) holding derived plaintext tables — rebuilt from
ciphertext at boot and maintained by the DAL write-path dual-write
(ciphertext row → ext table + plaintext row → RAM table in one flow).
- Never on persistent media → backups/WAL/replicas/snapshots contain
  ciphertext only; RAM dies with the host — erasure physically complete.
- FULL correct query power: real PG indexes, exact ILIKE, JOIN, sort —
  no approximate indexes anywhere (user veto: deterministic only).
- Cost isolation preserved: queries not touching pii never join it;
  RAM-table rows exist only for `pii` columns (vertical split).
- Honest exposure window: a live DB session with SELECT on the RAM
  tablespace reads plaintext — same class as decrypt-in-projection;
  mitigated by a dedicated PG role (only the DAL service account
  reaches the hot tablespace).
- Resilience: derived-only → crash/restart just rebuilds; boot cost =
  decrypt+load of pii volume (measurable, documented); optional
  incremental sync via write-path dual-write or logical trigger.

### Final tier model — TWO tiers only (lookupable/bidx REMOVED)
Real workflows always search partially (users type fragments of VAT,
email, names — never only full values). Equality-only indexing has no
real use case → no bidx, no n-gram, no approximate index anywhere.
- `encrypted` opaque — ciphertext in ext table only; never queried;
  display = app-decrypt for permitted roles. Cheapest, zero plaintext.
- `encrypted`+`hot` — ciphertext in ext + plaintext mirror in
  RAM-tablespace → EXACT full query (UNIQUE, `=`, ILIKE, JOIN, sort)
  via real PG indexes; RAM dies with host (fallback only); backups stay
  ciphertext. Unique constraints live on the RAM table.
  OBLIO: `anonymize` MUST DELETE the subject's hot rows immediately —
  volatile-RAM-on-restart is the physical fallback, never the mechanism.
- `db_decrypt` (optional future tier) — ciphertext at rest, DB-side
  decrypt in projection for ad-hoc queries; transient execution
  exposure. Documented, not v1.
Census drives: write-route (ext only vs ext+hot), query-plan (join hot
when pii cols involved, never otherwise), read-decrypt (app layer,
permitted roles), `anonymize` (destroy DEK → all ciphertext `[[erased]]`
everywhere incl. backups; hot row wiped).

## Docs/website commitments
- ISO 20275 (GLEIF ELF) + NIST SP 800-57 mentioned on landing site
  ([lang] pages) — standards/compliance section; thank-you.astro credits
  is OSS-only (ISO may get an acknowledgment line, not an OSS credit).
- dev-guide: FLE/crypto-shredding mechanics + depends_on contract.
- user-guide: GDPR explainer (what it protects, why, standards covered,
  interim backup coverage via key destruction).
- Document honestly: no WHERE/sort/ILIKE on encrypted columns — blind
  index answers equality only.

## Three-layer vocabulary (NOT conflated)
- `pii`/`protected` column = encrypted at rest (storage protection).
- Field security = role→field permission: DAL decrypts server-side
  pre-response ONLY when the role grants the field; else masked/absent.
  (separate plan, same `pii` census)
- Anonymization = destroy subject DEK → `[[erased]]` everywhere incl.
  backups. One pipeline: pii mark → encrypt on write → decrypt on read
  if permitted → shred on erasure.

## Geo components — provider contract (approved)
`AddressProvider` interface + `AddressSuggestion` (street/houseNumber/
postcode/city/province/country/lat/lng/raw); injectable `provider`,
debounce=250, minChars=3, country/biasLat/Lng, AbortController per
search, in-memory cache, bind:value vs bind:selected, combobox a11y.
Ship: PhotonProvider (in-house `/geo` proxy), GooglePlacesProvider,
GisGeoProvider stub. Parse structured fields — never trust label
(IT: wrong CAP is bug #1). WaypointMap shares provider.reverse().

## Anonymization (diritto all'oblio) — crypto-shredding v1, NOT tombstone
Envelope encryption, application layer (never pgcrypto — it leaks keys into
queries/logs; never client-side — keys never reach the browser; wire stays
plaintext over TLS for authorized users, TLS already covers transit).
- DEK per data subject (customer_uuid), AES-256-GCM; KEK wraps DEKs and
  lives outside the DB (KMS/HSM/service secret); wrapped DEKs in a
  `crypto_keys` table (subject_id, wrapped_dek, destroyed_at).
- Self-describing ciphertext `enc:v1:<subject>:<b64>` — after key destruction
  reads render the `[[erased]]` sentinel with NO update needed anywhere.
- Declaration: `pii` tier (`encrypted` / `encrypted+hot`) on MetaColumn —
  the SAME census feeds: write-path routing (ext vs ext+hot), read-path
  decryption, query-plan joins on the hot table, and anonymize census
  (which entities carry the subject's ciphertext).
- `anonymize` op = destroy subject DEK + DELETE the subject's hot rows
  immediately (step-up MFA + permission + audit): every ciphertext of
  that subject — live rows, backups, replicas, logs — becomes permanently
  unreadable. NIST SP 800-57 cryptographic sanitization. RAM volatility
  is the fallback, not the erasure path.
- Costs (honest): µs/field decrypt + cached DEK fetch (negligible per row);
  real cost = hot-table RAM footprint + boot rebuild time + KMS/key-cache
  ops. Bulk exports need caps.
- Single record at a time by design; documented in dev-guide when built.

## Consent seal (fingerprint)
Server-generated `seal = sha256(doc_version ‖ customer_uuid ‖ granted_at ‖
actor ‖ ip ‖ user_agent)` stored on the consent row — tamper-evident proof of
which document version was accepted, by whom, when. Not user-provided.

## Field dependency — ONE contract, `depends_on`
The existing `x_map_keys` is payload_map-internal: it derives a sibling map
key's vocabulary from the picked option's `_raw` row — it does NOT cover
"this field's options depend on another form field". We generalize, not
duplicate: `MetaColumn.depends_on: { field: string }` —
- entity-ref combo: parametrizes /list fetch (`filters[col]=<form value>`),
  disabled until the pivot has a value, stale selection reset on change
- payload_map api_url: parametrizes the request the same way
- contact.value: selects validation schema + control via the type's code
- `country → legal_form` is the first consumer (`filters[country]=<country>`).

## UX components (@primebrick/ui)
- `AddressAutocompleteInput` — debounced search via BE `/geo/search` proxy
  (lang from session/customer locale), fills all local_address fields + poi_name.
- `WaypointMap` — MapLibre GL + OpenFreeMap (or self-host tiles); draggable pin;
  `/geo/reverse` fills address fields back.

## Execution order (tic-toc)
1. **Entities + patches + seeds** — 9 lookup/child entities (registry,
   conventions, i18n labels), customer column adds, ISO 20275 legal_form
   importer (CSV→seed patch, ACTV only, sentinels out), table seeds.
2. **`depends_on` contract** — core MetaColumn field + docs; FE entity_ref
   options `/list` parametrized by pivot field value; disabled-until-pivot
   + stale-reset; contact.value control/validation via sibling type code.
3. **Customer form restructure + data migration** — `name` semantics by
   type, concat/copy migration, flat local_* → local_address(type=legal),
   drop old columns; country→legal_form cascade live.
4. **`dict` archetype** — `DictEntityBase` (class marker) → `kind:"dict"`
   route → `EntityDictPage` (ConfigList shell on `useEntityList` +
   FormFieldDispatcher cells); nav sibling "Impostazioni" derived;
   collab on inputs via entity-scoped SSE; customer_type slice first,
   then config_entry migration as drift-proof test. Design consolidated
   in the "Lookup/enum-like tables" section above.
5. **Contacts 1-N** — crm.contact + sub-form section; one default per
   type (partial unique); type-driven value validation/renderer.
6. **Consents** — customer_consent + server-side seal on grant.
7. **Geo components** — AddressProvider contract, PhotonProvider +
   GooglePlacesProvider, AddressAutocompleteInput, WaypointMap, /geo proxy.
8. **FLE/crypto-shredding infra** — crypto_keys, ext/hot tables, DAL
   write-route/decrypt/query-plan, anonymize op. (Largest chunk —
   likely its own feature branch.)
9. **Field security** — separate plan, role→field gated decrypt/mask.
10. **Docs + website** — dev-guide (FLE, depends_on, dict), user-guide
    (GDPR/consents/erasure), landing standards section (ISO 20275,
    NIST SP 800-57) across [lang] pages.
