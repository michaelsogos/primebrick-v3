# Feature — Event source UX: label umanizzate, filter builder, convenzione subject

## 0. Contesto e trigger

Segue `feature-entity-events-choreography` (chiusa). Tre richieste utente:

1. La combo **Sorgente Evento** del trigger form mostra `events.crm.customer.>` grezzo — l'utente deve leggere "Tutti gli eventi di Cliente di CRM", non la sintassi NATS.
2. Il campo **Filtro** è un editor JSON grezzo — serve un builder guidato.
3. Il vocabolario dei subject emessi in giro (`crm.customer_changed`, `crm.customer_high_value`, `crm.customer_payload`, …) non ha una convenzione soddisfacente.
4. L'ordine di visualizzazione dei source event nel create trigger non è definito.

## 1. Censimento TIC — stato reale (file:linea)

### 1a. Emit dichiarate esistenti (`service_registry.endpoints.events`)

| Servizio | Subject | Note |
|---|---|---|
| crm | `crm.customer_changed`, `crm.customer_high_value`, `crm.customer_payout` | PoC hand-declared in `crm/src/events-declaration.ts` — label_key/description_key/schema/entity pointer completi; **nessuna emissione reale**, solo `crm.emit_fake_event` li pubblica (`fake-event-emitter.ts:35-36`) |
| ai | `jobs.result.ai.*` | transport-plane, no label |
| emailsender | `emailsender.response.*` | transport-plane, no label |
| webhook | `webhook.*.received` | ingress capture, no label |
| job-handler | `jobs.ctl.triggers.changed` | control-plane, ha label_key |
| **tutti gli US** | `events.<svc>.<entity>.>` | AUTO-dichiarate da `create-microservice.ts:771-774` — **solo subject+payload_schema, nessun label_key/entity pointer** |

BE (`api`): nessun `endpoints.events` e **nessun wiring eventPort** (`src/db/dal-gateway.ts:44` — `initDal()` è sync void). Gap noto.

### 1b. Rendering della combo (`use-census-subject-options.svelte.ts`)

- `emitDecls` = `modules().flatMap(m => m.events?.emits)` (line 58) — **ordine = ordine `modules()` = `service_registry.findAll()` SENZA ORDER BY** (`service-registry.service.ts:125-131`) → ordine instabile/DB-order.
- Option render: `label = e.label_key ? tr(label_key) : e.subject`, `_desc`, `_sub` = subject grezzo, icona `zap` amber (lines 62-69).
- Dict dei contributor caricati automaticamente via `loadModuleTranslations(code)` (lines 82-92) → label_key risolvibili anche da moduli estranei.
- Le entity label esistono già: `crm.entities.customer.singular` = "Cliente"/"customer" (verificato in `crm.translations` — convenzione `<entities_ns>.entities.<translation_key>.{plural|singular}`, `entity-meta.ts:892`).

### 1c. Campo Filtro (`job.meta.ts:100-108`)

- `filter`: `type:"text"`, `format:"json"`, `json_schema:TRIGGER_FILTER_SCHEMA` → `JsonValueEditor` grezzo + `ruleCompletions` (path `$.` dallo schema dell'evento selezionato, candidati `value` da enum sibling — `rule-schema-completions.ts`).
- `RuleFilter` vocabulary: `{field, op?: eq|neq|exists|contains|gt|lt, value?}` — `.every()` = solo AND (`jsonb-contracts.ts:17-21`, `triggers-engine.ts:97-115`).
- `payload_schema` delle auto-emits: `after`/`before`/`delta` = `object` non tipizzato → i path suggeriti si fermano a `$.after` senza campi reali.
- Precedenti per editor dedicati su colonna JSON: `PayloadMapEditor` (format risolto `payload_map` in `FormFieldDispatcher.svelte:290,756`), `ScheduleSpecInput` (`format:"schedule_spec"`).
- `MetaColumnFormat` (`entity-meta.ts:226-252`) ha già `nats_subject`, `schedule_spec`, `json`, `dotted_glob` — nessun `rule_filter`.

### 1d. Trigger live con event_subject (job.job_triggers)

- `crm.customer_changed`: ~8 righe LIVE (e2e-probe, e2e-rule, e2e-gate-uncovered…) + ~40 soft-deleted
- `crm.customer_high_value`: `e2e-filter-demo` (live)
- `emailsender.response.*`, `webhook.*.received`, `e2e.collab.fired`, `e2e.draft.fired`, `e2e.chain.*`, `e2e.manual.*` — subject ad-hoc di test (alcuni non dichiarati in nessun census)
- `events.job.job_trigger.>`: i 2 trigger della nuova spec E2E
- **Blast radius rename**: `crm.customer_changed` è referenziato in ≥6 spec FE (`payload-map-widget`, `mapper-viewer`, `job-trigger-form-lifecycle`, `entity-form-submit-gating`, `entity-events-choreography`, `entity-events-choreography`+docs) e in test JH (`payload-map-gate.test.ts:68-137`).

### 1e. Contratto EmitDecl (`core/src/page-route.ts:338-365`)

`{subject, label_key?, description_key?, payload_schema?, entity?{key,entity,table}}` — `entity.table` è **required** ma `EntityRouteDecl` non espone la tabella fisica (la sa solo il decoratore `@Entity`, `EntityServiceLike` è facciata senza classe).

## 2. Design

### R1 — Label umanizzate per le auto-emits (sdk + core + FE)

**sdk** `create-microservice.ts` autoEmits → arricchire:

```ts
const autoEmits = (branded?.entityDecls ?? []).map((d) => ({
  subject: `events.${serviceCode}.${d.entityName}.>`,
  label_key: `${d.meta?.entities_ns ?? "system"}.entities.${d.meta?.translation_key ?? d.entityName}.singular`,
  description_key: `${serviceCode}.events.entity_lifecycle.desc`,   // chiave convenzionale nuova
  payload_schema: entityEventPayloadSchema(d.meta),                  // R3
  entity: { key: "after", entity: d.entityName },                    // table → opzionale (core)
}));
```

- `label_key` riusa il singular ESISTENTE ("Cliente") — zero nuove traduzioni.
- `description_key`: chiave convenzionale per-servizio `<code>.events.entity_lifecycle.desc` ("Create, update, delete, restore and purge events on {entity}") — se manca, FE fallback (vedi sotto). Seed via patch traduzioni del servizio? **Decidere**: chiave per-entità non serve — un solo valore per modulo con `{entity}` interpolato? i18n `t` non interpola le chiavi di EmitDecl — quindi o desc statica per modulo (no entity name) o FE compone.
- **core** `EmitDecl.entity.table` → `table?: string` (additivo).
- **FE** `use-census-subject-options`: per emit con `entity` pointer (o `label_key` risolto), la label resta `t(label_key)`; il `_desc` se `description_key` non risolve usa fallback FE-localized `app.widgets.census.entity_events_desc` interpolato con nome modulo. La riga `_sub` mantiene il subject grezzo (trasparenza del wire).

### R2 — Ordine deterministico delle options (FE)

`use-census-subject-options`: `emitsOptions`/`callablesOptions` ordinati per `label` tradotta (`localeCompare` su `lang.current`), tiebreak `subject` asc. Un punto solo — tutte le superfici ereditano.

### R3 — payload_schema tipizzato per auto-emits (sdk)

`entityEventPayloadSchema(meta)`: clona `ENTITY_EVENT_PAYLOAD_SCHEMA` e popola:

- `after`/`before` → `{type:"object", properties: <da meta.columns>}` — mappa `MetaColumn.type/pg_type` → JSON type (text/uuid/identifier→string, number/money/integer→number, boolean→boolean, date/datetime→string, json/jsonb→object).
- `delta` → `{type:"object", properties:{<col>:{type:"object", properties:{old:{},new:{}}}}}` (shape verificata `delta-calculator.ts:32-40`).
- Effetto: `schemaDotPaths` propone `$.after.name`, `$.delta.status.new`, `$.before.status` — nel JsonValueEditor **e** nel builder R4.

### R4 — RuleFilterEditor (FE) + format `rule_filter` — pattern ELT advanced-filter

Decisione UX (approvata utente): copiare l'anatomia dell'advanced filter di
`FiltersPanel.svelte` — composer `PrimeField` × 3 (field / operator / value)
+ lista committed — adattata al vocabolario RuleFilter (schema-driven, non
MetaColumn-driven). **Un solo componente** riusabile in ogni superficie:
la differenza sheet-vs-form è solo l'ordine visivo delle due sezioni
(`flex-col` → ribaltabile via CSS; valutazione post-componente se adottare
la forma form anche nello sheet ELT).

- **core**: `MetaColumnFormat` += `"rule_filter"`.
- **JH** `job.meta.ts` colonna `filter`: `format:"rule_filter"` (resta `json_schema` per validazione submit).
- **FE** `FormFieldDispatcher`: `format === 'rule_filter'` → `RuleFilterEditor`.
- **`RuleFilterEditor.svelte`** (nuovo): composer SOPRA, badge committed SOTTO —
  - `field`: ComboSelect con `schemaDotPaths(sourceEmit.payload_schema)` (R3 → `$.after.<col reale>`, `$.action`, `$.uuid`, `$.actor`, `$.delta.<col>.{old,new}`…)
  - `op`: ComboSelect dei 6 op RuleFilter — label riusando `system.entities.list.operators.*` dove esistono (eq→`=`, neq→`!=`, contains, gt→`>`, lt→`<`), nuova chiave solo per `exists`. **Nessun toggle AND/OR** — matchFilter è `.every()`, mostrare OR mentirebbe.
  - `value`: **MetaColumn sintetico derivato dal leaf dello schema** (enum→`badge`+`badge.values`, boolean→`boolean`, number→`number`, string→`text`) passato a `FormFieldDispatcher surface="filter"` — riuso totale del parco widget (~30 righe di mapper). `exists` → nessun controllo.
  - committed: `Badge variant="secondary"` `w-fit`/`flex flex-wrap` in stile FilterBar — bold path (`after.name`, nomi contratto onesti) + primary op + italic value + **X rimuove, nessun edit** (remove+re-add).
  - toggle "Modifica JSON" → JsonValueEditor esistente (escape hatch, same wire value).
- Il valore wire resta `RuleFilter[]` — l'editor è una proiezione, zero cambi JH.

### R5 — Convenzione vocabolario subject (doc + migrazione crm PoC)

Tassonomia proposta (da scrivere in `docs/dev-guide` JH/sdk + `.devin/rules` puntatore — testo proposto nel piano, approvazione = approvazione piano):

| Piano | Grammatica | Chi lo usa |
|---|---|---|
| Entity lifecycle | `events.<svc>.<entity>.<uuid>` (bind `.>`) | auto, DAL |
| Evento semantico su entità | `events.<svc>.<entity>.<semantic_name>` | codice dominio (`customer.high_value`) — **annidato nel sottoalbero entità**: `events.crm.customer.>` cattura lifecycle+semantici; il payload `action`/`kind` discrimina |
| Evento semantico di dominio | `events.<svc>.<topic>` | non legato a un'entità |
| Control plane | `jobs.ctl.*` | broadcast reload — mai trigger source onesta |
| Work lanes / results | `jobs.due.*`, `jobs.result.*`, `webhook.*.received`, `emailsender.response.*` | transport subjects — dichiarabili come emits solo se triggerabili per design |

**R5b — Migrazione PoC crm**: `crm.customer_changed` → `events.crm.customer.changed`? ⚠️ collisione: `changed` occuperebbe lo slot uuid (`events.crm.customer.*` lo matcha come fosse uuid). Alternative:
- **(a) `events.crm.customer.high_value`** — annidata, `events.crm.customer.>` la prende (proprietà subtree); distinguibile via payload schema. Collisione collo slot uuid accettata per design.
- **(b) `events.crm.customer_high_value`** — piatta, peer dell'entità, zero ambiguità; perde il raggruppamento subtree.
- Raccomandazione: **(a)** — semanticamente "evento su customer" è vero sia per lifecycle che high_value; `matchFilter` sul payload discrimina (schema diverso).
- Rename impatta: `events-declaration.ts` (subjects+label keys ok), `fake-event-emitter.ts`, test JH `payload-map-gate.test.ts`, spec FE (≥6 file con `crm.customer_changed`), e le righe live (aggiornare `event_subject` su ~9 righe non-deleted — SQL update controllato in patch? o lasciarle scadere: sono e2e residue, meglio un UPDATE mirato o cancellazione — **decidere**).
- `entity.*.*.changed` presence markers (BE core NATS): legacy, restano — documentati come non-domain.

### R6 — Gap collaterali registrati (non bloccano)

- **BE `api` non emette**: `initDal()` sync, nessun `wireEntityEventEmission` → entità BE (config_entries, translations…) silenti. Wiring = `await wireEntityEventEmission(getDal(), "api")` post-initDal + emits declaration nel self-registration — da pianificare a parte o qui come task separato (R6b).
- `job_runs.trigger_uuid` sempre null — insertRun non popola il link (osservato in E2E) — fuori scope, registrato.
- Deferred tx `svc.beginTransaction`: nessun evento (capture layer non passa dai metodi repo) — già nel piano precedente.

## 3. File impattati

| Repo | File | Modifica |
|---|---|---|
| core | `src/page-route.ts` | `EmitDecl.entity.table` → `table?: string` |
| core | `src/entity-meta.ts` | `MetaColumnFormat` += `"rule_filter"` |
| sdk | `src/microservice/create-microservice.ts` | autoEmits: label_key/desc/entity pointer + schema tipizzato |
| sdk | `src/nats/entity-events.ts` | `entityEventPayloadSchema(meta)` (column→JSON type map) |
| us job-handler | `src/modules/jobs/job.meta.ts` | `filter` → `format:"rule_filter"` |
| us crm | `src/events-declaration.ts`, `src/controllers/nats-sub/fake-event-emitter.ts`, `src/__tests__/events-declaration.test.ts` | rename subjects (se R5b approvato) |
| FE | `src/lib/entity-form/use-census-subject-options.svelte.ts` | sort per label + fallback desc entity-events |
| FE | `src/lib/entity-form/RuleFilterEditor.svelte` (nuovo) | builder filtri |
| FE | `src/lib/entity-form/FormFieldDispatcher.svelte` | risoluzione `rule_filter` |
| FE | `src/lib/entity-form/rule-schema-completions.ts` | riuso schemaAtPath/valueCandidates (export) |
| FE | `public`/`db-meta` translations | nuove chiavi `app.widgets.rule_filter.*` + `*.events.entity_lifecycle.desc` |
| FE | `src/e2e/*` | update `crm.customer_changed` refs (se rename) + nuova spec filter builder |
| docs | `docs/dev-guide/entity-events.mdx` (sdk o us) | convenzione vocabolario |

## 4. Criteri di accettazione

1. Combo event_subject mostra "Cliente — Gestione Processi..." (label tradotta + desc + subject grezzo su riga _sub) — mai un `.>` isolato senza label.
2. Options ordinate per label tradotta — stesso ordine a ogni apertura.
3. Filtro: builder visuale con field da schema evento, op tradotti, value tipizzato; il JSON persistito resta `RuleFilter[]` identico alla validazione JH.
4. Su `events.<svc>.<entity>.>` il builder offre `$.after.<colonna reale>` (schema arricchito).
5. Vocabolario documentato + emit crm migrati (o decisione esplicita di non migrare) senza spec rotte.
6. Suite verdi: FE tsc+e2e mirate, us tsc+test, sdk tsc+test.

## 5. Punti decisionali (default proposti — veto in review)

| # | Scelta | Proposta |
|---|---|---|
| D11 | Grammatica eventi semantici | (a) annidata `events.crm.customer.high_value` (subtree property) — vedi R5 |
| D12 | Label auto-emits | `label_key` → `<ns>.entities.<tk>.singular` esistente; desc FE-localized con nome modulo |
| D13 | `EmitDecl.entity.table` | rendere opzionale (la tabella non è raggiungibile da EntityRouteDecl; il payload porta già `table`) |
| D14 | Filter builder | nuovo format `rule_filter` + `RuleFilterEditor` con toggle JSON |
| D15 | Rename `crm.customer_*` + righe live | sì + UPDATE mirato sulle ~9 righe non-deleted (o delete: sono tutte e2e residue — **confermare**) |
| D16 | Wiring BE `api` | includere qui come task R6b o piano separato — **confermare** |

## TOC — stato

✅ **CHIUSO** — implementato e verificato live (sessione 2026-11-18).

| Task | Stato | Commit |
|---|---|---|
| core `EmitDecl.entity.table` opzionale + `MetaColumnFormat:"rule_filter"` | ✅ | `aeac7c3` + `1184acb` |
| sdk `entityEventPayloadSchema(meta)` + autoEmits label/entity/desc | ✅ | `a218881` |
| JH `job_trigger.filter` → `format:"rule_filter"` | ✅ | `3187b08` |
| crm emits → `events.crm.customer.on.{changed,high_value,payout}` + fake emitter + test | ✅ | `3187b08` |
| FE sort options per label + desc fallback entity-events | ✅ | `122c314` |
| FE `RuleFilterEditor` + dispatcher `rule_filter` + MetaColumn sintetico | ✅ | `122c314` + `897f47c` (ui) |
| Spec/test refs + UPDATE 4 righe live | ✅ | `122c314` + DB |
| Docs `docs/dev-guide/entity-events.mdx` (sdk) + `_order.json` | ✅ | `6d4481e` |
| BE `api` `wireEntityEventEmission` (post-identity, retry-safe) | ✅ | `b7b1484` |

**Verifica live**: census `service_registry` reale — crm/ai/job/emailsender emits con `label_key` (`<ns>.entities.<tk>.singular`) + `entity` pointer + `.on.` semantici; **zero** `crm.customer_*` residui; E2E spec `entity-events-choreography` 3/3 verde.

### Divergenze trovate in verifica live (fixati in sessione)

1. **`validateEntityPointer` (sdk) richiedeva `table`** — ogni emit con `entity:{key,entity}` veniva rifiutato al `service.register` → retry loop infinito, registry stale. Fix: `table` opzionale nel validatore (commit `93a8740`).
2. **`schemaHonestyIssue` (census gate) rifiutava gli auto-emits** — le colonne `*_at`/`email`/`*_by` senza `format` non passano il gate name-vs-format. Fix in `entityEventPayloadSchema` (commit `d957b4b`): format onesto derivato da `pg_type`/`ref`/name-hints, e gli **stamp audit DAL** (`created_*`, `updated_*`, `deleted_*`, `cloned_at/by`) esclusi dallo snapshot — già espressi dalla busta evento (`actor`, `changed_at`, `version`) e `created_by` text non può onestamente dichiarare `uuid` (token `system:<code>` legali).
3. **`bun --hot` non ri-importa `node_modules`** — i servizi dev con dist SDK stale vanno riavviati (kill+dev-stack), il touch di `index.ts` non basta per i cambi dist.

### Debito noto (fuori scope, tracciato)

- **Emits census per `api`**: il BE non ha `entityDecls` (router proprio, non `makeServiceRoutes`) — serve un feed parallelo di dichiarazione entità BE (o enumeration esplicita). L'emissione è wired: `events.api.<entity>.<uuid>` esce sullo stream, ma gli emits non sono censiti → non selezionabili come trigger source dalla UI.
- `emailsender.response.*` / `webhook.*.received` restano emit transport-plane dichiarate a mano — da valutare se toglierle dal census trigger-source (decisione architetturale, non bloccante).
- `svc.beginTransaction` (capture layer): nessun evento emesso — gap noto dal piano precedente.
