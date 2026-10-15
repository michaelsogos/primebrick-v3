# Schema Sovereignty — one module, one PG schema, no exceptions

> Continuation of `db-migration-engine.md` — drift evidence surfaced a deeper
> architectural hole: microservices can reach other services' schemas, env
> contract is unenforced, and service_registry has no schema-ownership claim.
> This plan closes the domain-data boundary at the platform level.
> Non-goal: tenant isolation (future), multi-DB, network-level security.
> Analysis evidence collected 2026-10-13 — see "Verified current state".

## Status: 🟠 WIP — Plan date: 2026-10-13 22:30 UTC / updated 2026-10-14 08:45 UTC (only task 8 open — phase-2 role hardening gated on module-installation process)

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | sdk env contract: closed-set validation — exactly `DATABASE_URL` + `DATABASE_SCHEMA`, both required non-empty, conn-string parseable, `DATABASE_SCHEMA` → `string[]` (single, CSV, or JSON array); any extra/missing/empty/invalid prop → boot crash with clear console error | ✅ done | 2026-10-13 | §1 — `assertDbEnv()` in `sdk/src/env/db-env.ts` (9 unit tests), called in `createMicroservice` + BE `index.ts` pre-listen; all 4 US + BE wired (`envSchema:{}`, `dal.ts`/`dbPatches`/`scripts` on `assertDbEnv().schemas[0]`); `DB_SCHEMA`→`DATABASE_SCHEMA` renamed everywhere incl .env/.env.example/docker-compose/terraform; BE `.env` gained `DATABASE_SCHEMA=public,system,custom`; verified live — all services boot + register |
| 2 | dal `DalConfig.schemas: string[]` (replaces `schema?: string`): `search_path` = declared schemas + `public` tail (extension types only); entity `tableSchema` must ∈ allowed set — boot guard `assertEntitySchemaDomain` (SDK dbPatches step, hard crash outside try) + runtime guard `resolveEntitySchema` inside `getQualifiedTableName`/`getEntityPersistenceMeta` → `SchemaDomainViolationError` before SQL is built | ✅ done | 2026-10-14 | §2 — `meta/schema-domain.ts` + `schema-domain-assert.ts`; `Dal` ctor calls `configureSchemaDomain`; 12 unit tests; all callers migrated (`schema:`→`schemas:`) | 
| 3 | Remove cross-schema entity reads in US: delete `ai`/`emailsender` `public.service_registry`+`public.config_entries` entities; ai docs-discovery moved to BE governed route `service.registry.get {capability:"docs_pack"}` (replaced direct `findAll(public.service_registry)`); `redis_url` etc. already via BE config pull | ✅ done | 2026-10-14 | §3 — deleted 3 entity classes (2 unused, 1 replaced by NATS call); BE handler extended with `capability` filter returning online+enabled rows; stale `docs_kb` "public schema" comment fixed | 
| 4 | emailsender entities `email_templates`/`sender_log` — tables already exist under `emailsender` (drift was false: default `public` pin); pinned `@Entity(...,"emailsender")` — no CREATE needed | ✅ done | 2026-10-14 | §3 |
| 5 | service_registry `schemas text[]` column + register payload `schemas[]`; BE rejects registration when a claimed schema is owned by a *different* code or is platform-owned (BE's own DATABASE_SCHEMA) → `SCHEMA_OWNERSHIP_CONFLICT`; claim released only on unregister (schemas cleared) or purge | ✅ done | 2026-10-14 | §4 — patch `20261014003000_service_registry_schemas` signed+applied; entity/repo/payload/subscriber wired; **verified live**: claims landed for all 4 US; rogue `service.register` claiming `ai`/`public`/`custom` all rejected before persistence (0 rows, 0 enrollment) |
| 6 | Registry-row lifecycle: heartbeat TTL sweeper marks `stale`→`offline`→purgeable; admin can delete a single instance row (not whole module); the July `new-host:4000` row is the canonical case | ✅ done | 2026-10-14 | §5 — sweeper: >90s→`stale`, >1h→`offline`, ages from `created_at` when never heartbeated, `is_reserved` excluded, rows never auto-deleted; `DELETE /api/v1/system/services/instances/:uuid` (MODULES_DELETE_SINGLE); FE: `stale` agg status + badge, per-group instances expander (base_url/status/last-seen) + per-instance purge dialog; seed patch `20261014003756_modules_instance_translations` applied live; **verified**: dead `new-host:4000` row transitioned `unknown`→`offline` then purged via `hardDeleteByUuid`; route returns 401 unauthenticated |
| 7 | `custom` schema: user-created translations live in global `custom.translations` (by design — keeps app/system translation tables lean). Runtime access = BE (`schemas` includes `custom`); excluded from patch management AND drift ownership — its rows are user data, structure is ours | ✅ done | 2026-10-14 | §5b — verified: BE-only access (entity `custom` pin passes guard; service claim rejected), creation patch historical only, entity-scoped drift never sees it; roles note folded into §6 |
| 8 | Phase-2 DB-level hardening (documented, optional rollout): per-schema PG roles `svc_<schema>` owning exactly their schema, REVOKE data rights on `public`/`custom`/other service schemas for non-BE, password via secret engine | ⏳ not done | — | §6 |
| 9 | Unit tests: env validator matrix ✅, schema-guard ✅ — ownership conflict at register verified **live** (rogue `service.register` claiming `ai`/`public`/`custom` all rejected, 0 side effects); a dedicated unit test for `checkSchemaOwnership` remains nice-to-have | ✅ done | 2026-10-14 | `db-env.test.ts` 9 + `schema-domain.test.ts` 12 unit tests; conflict path proven via live NATS register attempts |
| 10 | Docs: `AGENTS.md` + `.devin/rules/env-policy.md` (already exists in BE — align), dal dev-guide (schemas option), us dev-guide (env contract), user-guide n/a | ✅ done | 2026-10-14 | env-policy rules (BE+US): DATABASE_URL+DATABASE_SCHEMA pair; dal docs `schema:`→`schemas:` + guard notes (connections/entities/getting-started/repository/repository-pattern); US docs DB_SCHEMA→DATABASE_SCHEMA + assertDbEnv (adding-a-service/architecture/overview); BE environment-configuration.mdx + AGENTS.md (BE/US); SDK api-reference.mdx |
| 11 | emailsender `public.api_keys` cross-schema read → `NatsApiKeyPort` (BE `auth.apikey.byHash` governed route — same path webhook already uses via `CachedApiKeyPort`) | ✅ done | 2026-10-14 | `EmailSenderApiKeyPort` now delegates to `NatsApiKeyPort(3000)` keeping the shared Redis cache wrap; `getDal`/`pg` import gone from the adapter; hot-reload verified live (re-registered, subscribed, clean) |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Part 0 — Verified current state (empirical, 2026-10-13)

- **The `, public` tail**: `dal.ts` sets `SET search_path TO <schema>, public`
  on every connection — needed today for extension type resolution
  (`vector`), but it silently falls back to public *data* tables.
- **Explicit cross-schema entities exist**: `ai` maps
  `@Entity("service_registry","public")` + `@Entity("config_entries","public")`
  (read-only projections; emailsender has a service_registry copy too).
  ai already subscribes to `service lifecycle events` — the registry read is
  redundant with the event-driven cache.
- **`.env` today**: job-handler/emailsender/webhook have `DATABASE_URL` +
  `DATABASE_SCHEMA`; `ai` is missing `DATABASE_SCHEMA` (would crash under new contract —
  fix its .env); BE has `DATABASE_URL` only.
- **`envSpec` mechanism exists** (`validateEnv`/`requireEnv` in SDK,
  `{ required, description, default }` per key) — but permissive: extras
  allowed, DATABASE_SCHEMA optional with string default.
- **`service_registry` unique model**: `code` unique WHERE `is_behind_scaler`,
  `(code,base_url)` unique WHERE NOT → multi-instance = multiple rows per code.
  FE `/system/settings/modules` groups by code + `aggregateStatus`
  (online/going_live/offline/unknown). A stale `emailsender@new-host:4000`
  row (July) permanently shows `unknown` and inflates instance count 1/2.
- **Schemas present**: `public`(BE), `system`(translations+client_registry —
  BE-owned), `custom`(translations — owner TBD), `job`, `ai`, `emailsender`,
  `webhook`, `partman`, `pg_catalog`.

## Part 1 — ENV contract (SDK init, task 1)

Every service (BE + all US) validates at boot, BEFORE any DB connect:

```
process.env keys present ≠ {DATABASE_URL, DATABASE_SCHEMA}        → crash
DATABASE_URL empty / unparseable as postgres URL            → crash
DATABASE_SCHEMA empty / not string|CSV|JSON-array of valid names  → crash
DATABASE_SCHEMA parses to empty list                              → crash
```

Plain `if`s on top of existing `validateEnv` — closed set enforced by
comparing `process.env` keys (minus system/runtime noise like PATH, NODE_*,
npm_* — allowlist, not blocklist: only OUR two keys matter; unknown extra
`PB_*`/`DATABASE_*`/`DB_*` keys crash, generic runtime keys ignored).
Single source: `assertDbEnv()` in SDK returns `{ url, schemas: string[] }`;
every index.ts calls it first thing; DAL receives `schemas` (never reads env
itself — libs don't own env).

Schema-name regex: `^[a-z][a-z0-9_]*$` (PG identifier, lowercase).

## Part 2 — DAL schema domain (task 2)

`DalConfig.schemas: string[]` (required, non-empty):
- `search_path = <own schemas>, public` — the `public` tail STAYS, on purpose:
  extension types (`vector`, future extension types) live in `public` and name
  resolution must see them. Own schemas come FIRST so same-name tables always
  resolve to the service's own. Residual risk (missing own table silently
  falls back to a public one) is closed by the entity guard below now, and by
  PG-role REVOKE in phase 2 — search_path governs *naming*, roles govern
  *access*. (Alternative considered and rejected: moving extensions to an
  `ext` schema — relocation risk on live vector columns for zero extra
  protection.)
- `initDal` walks the entity registry: every `tableSchema` ∉ `schemas` →
  throw listing `[EntityClass → schema]` offenders. Bare-schema entities
  resolve inside own schemas only.
- Same check powers drift: `checkDrift` only diffs tables in own schemas —
  kills the `public.*` noise in US drift reports automatically.

## Part 3 — Kill cross-schema reads (tasks 3-4)

- ai `service_registry` entity → replaced by the lifecycle subscriber's
  in-memory registry cache (already receives register/heartbeat/offline
  events — `docs_pack` capability is in the payload).
- ai `public_config_entry` entity → deleted; global config arrives via the
  existing BE config pull (`redis_url, telemetry` — already working).
- emailsender `public.email_templates`/`public.sender_log` entities → repin
  to `emailsender` schema; CREATE TABLE patches land in emailsender db-meta
  (tables don't exist yet — fresh creates, no data migration).

## Part 4 — Schema ownership claim (task 5)

Register payload gains `schemas: string[]` (from `DATABASE_SCHEMA`):
- `public.service_registry.schemas text[] NOT NULL DEFAULT '{}'`
- On register/heartbeat: for each claimed schema, if another row with a
  *different* `code` claims it → refuse registration,
  `SCHEMA_OWNERSHIP_CONFLICT` + log + SSE event (admin sees the collision).
- Same code re-claiming (multi-instance/restart) → fine.
- **Claim persists while the row exists** — including offline/stale. It is
  released ONLY by explicit `unregister` (graceful shutdown) or admin purge
  of the row. Rationale: a down service must not lose ownership — otherwise
  any new/buggy/malicious module could grab its schema while it is down and
  boot straight into its tables. Cost: a legit code-rename keeping the same
  schema is blocked until an admin removes the old row — intended: ownership
  handoff is an explicit admin act, never automatic.

## Part 5 — Registry lifecycle (task 6) — IMPLEMENTED 2026-10-14

- `StaleDetectionJob` (30s tick, DB-only): age = `last_health_check_at ??
  created_at` (instances that never heartbeated still decay). >90s → `stale`;
  >1h → `offline`. `is_reserved` rows are excluded (no heartbeats by design).
  **Status transitions are automatic; deletion is never automatic** — a dead
  row keeps holding its schema claim until an admin purges it (see Part 4).
  `service.stale` NATS event now carries the assigned `status` and fires on
  each transition; FE SSE upserts the refreshed row.
- BE: `DELETE /api/v1/system/services/instances/:uuid`
  (`MODULES_DELETE_SINGLE`) → `deleteServiceInstance` → `hardDeleteByUuid` —
  deleting the row releases the claim (claims live on the row).
- FE `/system/settings/modules`: per-group chevron expands an instances list
  (base_url, per-instance status badge, `last_health_check_at` formatted —
  "last seen"), per-instance trash opens the delete dialog in instance mode.
  `aggregateStatus` gained `stale` (no online + ≥1 stale → `stale`); badge
  colors amber; i18n `app.health.stale` + `system.settings.modules.instances`
  / `lastSeen` (seed patch `20261014003756`, signed+applied).
- **Verified live**: the July `emailsender|new-host:4000` row decayed
  `unknown` → `offline` (created_at fallback), stayed in the registry, then
  was purged through `hardDeleteByUuid` — the canonical case closed.
  Endpoint returns 401 unauthenticated.

## Part 5b — `custom` schema policy (task 7) — VERIFIED 2026-10-14

`custom` is a user-owned translation namespace: every user-created
translation row lands in the single global `custom.translations` table
(keys MUST start `custom.` — enforced in `translations-dal.ts`), keeping
per-module translation tables lean. Empirically verified:

- **Access**: only BE declares `custom` in `DATABASE_SCHEMA`
  (`public,system,custom`) — `CustomTranslationEntity`
  `@Entity("translations","custom")` passes the domain guard; any service
  claiming `custom` is rejected as platform-owned (verified live).
- **Patches**: creation was historical (`00000000000009_create_custom_schema`);
  no other patch writes `custom.` objects — and none ever should: rows are
  user data. Policy: `custom` objects are out of scope for all future patches.
- **Drift**: `checkDrift` is entity-scoped — it introspects only registry
  tables. `custom.translations` is not in `ENTITY_REGISTRY` (translation
  entities are served by `translations-dal`, not generic CRUD) so it is
  never introspected, never flagged DB-only. No code change needed.
- **Roles (phase 2)**: `svc_*` roles get no grants on `custom` — BE runtime
  user only (§6).

## Part 6 — DB-level enforcement (phase 2) — ANALISI APPROFONDITA

### 6.1 Cosa chiude davvero lo strato 3

Strati 1-2 fermano *il codice onesto e lo sviluppatore distratto*: entity meta,
repository, migration engine — tutto il percorso strutturato passa dal guard.
Ciò che NON fermano:

1. **Raw SQL**: `db.query("SELECT * FROM public.users")` — il testo SQL non è
   ispezionato (parsare SQL a runtime è fragile: CTE, `set_config`, funzioni
   `SECURITY DEFINER`, quote dinamici).
2. **Creds leak**: `DATABASE_URL` del servizio è lo stesso utente `primebrick`
   per TUTTI i servizi — un leak del `.env` di emailsender dà lettura/scrittura
   su TUTTO il database (incluse le tabelle auth del BE!).
3. **Codice compromesso**: una dipendenza avvelenata dentro un servizio eredita
   le sue credenziali full-access.

Questo è il "data-plane authorization" mancante dello stack: abbiamo già
client shield (identità trasporto), secret engine (rotazione), NATS shield
(auth sui subjects), RBAC (user auth), firma Ed25519 sulle patch — ma il DB
è l'ultimo layer con un unico account condiviso full-access.

### 6.2 Il problema vero: chi può CREARE i ruoli

`CREATE ROLE`/`GRANT` richiedono `CREATEROLE` o superuser. Chi detiene quel
privilegio è il cuore del threat model — valutiamo tutte le opzioni:

| Opzione | Chi crea i ruoli | Attacco | Verdetto |
|---|---|---|---|
| (a) Self-creation a boot | Ogni servizio detiene creds `CREATEROLE` e si crea il proprio ruolo | Un servizio compromesso può fare `CREATE ROLE x SUPERUSER`, `GRANT pg_read_all_data` — escalation totale, zero audit | ❌ PEGGIORE dello status quo — distribuisce privilegi forti a N processi |
| (b) BE-mediated | BE espone `system.db.provision` e crea ruoli per i moduli che si installano | BE diventa un role-factory network-exposed: bug/identity-confusion → ruoli con grants arbitrari. Inoltre il BE deve avere `CREATEROLE` permanentemente residente | ⚠️ Controllabile ma amplifica il blast radius del BE — un solo bug nel BE = privilegio DB totale |
| (c) Provisioning out-of-band (install-time) | Un flow di installazione/provisioning (script, terraform, futura "module install" UI) usa credenziali admin *separate* che NON sono mai residenti nei processi runtime | L'unico attacco è rubare le creds di provisioning — che non sono in nessun `.env` di servizio | ✅ Raccomandato — il privilegio esiste solo durante l'install |

### 6.3 Design raccomandato — provisioning dichiarativo, runtime passivo

**Principio chiave:** i ruoli si creano quando il modulo si *installa*, non
quando il servizio *parte*. Il runtime non deve MAI poter creare ruoli —
né i servizi, né il BE.

- `svc_<schema>` — role name derivato deterministicamente dal claim
  `code ↔ schema` registrato a install-time (mai input libero): il nome è
  *calcolato*, non accettato.
- Provisioning path: script/CLI/tooling che gira con un DSN admin dedicato
  (es. `PRIMEBRICK_PROVISION_DSN` su una console operatore, o terraform in
  prod) — fuori dai runtime. Output: `svc_ai` con password random,
  `CREATE SCHEMA ai AUTHORIZATION svc_ai` (se nuovo), grant/revoke matrix.
- Attributi del ruolo runtime: `LOGIN NOCREATEROLE NOCREATEDB NOSUPERUSER
  NOBYPASSRLS NOREPLICATION`. Grant minimi:
  - `USAGE,CREATE ON SCHEMA <own>` + ownership degli oggetti (migration
    engine gira come owner → CREATE/ALTER/DROP liberi dentro il proprio
    schema, impossibili fuori);
  - `USAGE ON SCHEMA public` SOLO per tipi/funzioni (pgvector) — le tabelle
    in `public` non hanno grant verso svc_* di default (PG15+ public non
    concede più nulla a PUBLIC);
  - `custom`: USAGE solo a BE.
- `.env` dei servizi → `DATABASE_URL=postgres://svc_ai:…@…` — una cred
  compromessa vede solo il proprio schema.
- Rotation password: `ALTER ROLE svc_ai PASSWORD` via secret-engine — chi
  ruota ha bisogno di membership admin su QUEI ruoli (`GRANT svc_ai TO
  primebrick_admin`), non superuser.
- Migration registry/drift: invariati — girano dentro lo schema del
  servizio, owner = svc_*, tutto coerente.
- Esistente: una tantum `ALTER SCHEMA/ALTER TABLE … OWNER TO svc_*`
  (REASSIGN OWNED è pericoloso su oggetti condivisi — preferire ALTER
  puntuale per oggetto, scriptato).

### 6.4 Residui di rischio anche con strato 3

- Il guard app-level resta necessario: il role impedisce il *risultato*,
  il guard impedisce di *provare* e dà errore leggibile invece di `42501`.
- `SECURITY DEFINER`: una funzione DEFINER esegue con i privilegi del suo
  OWNER, non del chiamante — è un tunnel che scavalca l'intera grant matrix
  (`svc_ai` con zero grant su `public.users` può leggere via
  `SELECT privileged_fn()`). Il provisioning script audita il catalogo
  (`pg_proc.prosecdef = true`) sugli schemi raggiungibili e la regola è
  "nessuna DEFINER non intenzionale"; le pochissime legittime (alcune
  extension) vanno riviste e documentate.
- `REASSIGN OWNED BY x TO y`: VIETATO nel rollout — trasferisce TUTTI gli
  oggetti di `x` nell'intero database (oggi `primebrick` possiede tutto →
  regalerebbe gli schemi altrui al nuovo role). Il trasferimento esistente
  usa ALTER puntuale per oggetto (`ALTER SCHEMA/TABLE/SEQUENCE … OWNER TO`)
  enumerando `pg_class`/`pg_namespace` del solo schema target; index e
  constraint seguono l'owner della tabella e non vanno toccati.
- `search_path` injection: con schemi qualificati ovunque + path dichiarato
  il rischio è già chiuso; con ruoli diventa anche inerte.
- Extensions future installate con `ALTER EXTENSION … SET SCHEMA` o superuser
  → ops-level, non service-level.

### 6.5 Sequenza consigliata

1. Ora (fatto): strati 1-2 — dichiarazione + guard app-level.
2. **Module-installation process (to design — prerequisite of strato 3)**:
   un flusso di installazione modulo che, prima del primo avvio del
   servizio, esegue il provisioning `svc_<schema>` + `CREATE SCHEMA …
   AUTHORIZATION svc_*` + grant matrix. Le credenziali admin vivono solo
   dentro questo processo (prompt/CLI operatore o secrets manager) — mai
   nei processi runtime, mai nei `.env` dei servizi.
3. Modulo install UI (futuro): richiama lo stesso provisioning ma con
   approvazione admin esplicita — il BE orchestration chiama il provisioner
   locale, non crea ruoli via SQL diretto.
4. Rollout: nuovi servizi partono con svc_*; migrazione dei servizi
   esistenti = script di ownership transfer + nuove credenziali.
   **Nessuna patch applicativa per la role-surgery** — le patch CREATE
   esistenti si correggono alla fonte (edit + sha256 rigenerato nel
   manifest/registry), il fix sul DB live è one-shot out-of-system da
   `temp/` (fire-and-forget è già ritirato — nessuna cartella/codice FnF
   esiste più; verificato 2026-10-14). Patches già per-repo
   (`<svc>/db-meta/patches/`) — confermato su tutti e 5 i servizi.

Verdetto: lo strato 3 è la chiusura fisica del modello, ma il privilegio
di role-creation va tenuto **fuori dai processi di runtime** — dentro
l'install-time provisioning. Questo lo rende forte quanto l'identity
boundary senza introdurre una nuova superficie network-exposed.

## Part 8 — Raw-SQL surface

Full census moved to **`dal-pgvector-repository.md`** (tasks 5a–g +
"Raw-SQL census" appendix) — that plan already owns "debbellare l'uso
di pool e di qualsiasi altro accesso che non passi dalla DAL", and its
enforcement design (task 5/6b standards-check) is the right continuation.

Only sovereignty-relevant item stays here: **emailsender's
`public.api_keys` raw read** (task 11) — it is a live cross-schema
violation of THIS plan's boundary and is fixed by wiring
`NatsApiKeyPort`, not by the DAL refactor.

## Part 7 — Module model assessment (answers question 7)

Current model is sound and consistent: **module = `code`**, **instance =
row** (code+base_url), `is_behind_scaler` flips uniqueness to code-only,
core module `settings` is `is_reserved` with health-chip status mirroring
BE. What is broken is only *lifecycle hygiene*: dead instances never die
(`new-host:4000` since July). Fix = task 5+6, not a model redesign.
Recommendation: add per-instance badge "last seen X ago" so staleness is
visible in FE.
