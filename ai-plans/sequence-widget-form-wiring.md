# Sequence widget — form/bulk-editor wiring

## Obiettivo

`format:"sequence"` su una colonna (es. `crm.customers.code`, oggi plain `type:"text"`) → `FORM_CONTROLS` chiude `sequence` → il widget replica l'anatomia `ScheduleSpecInput`: text + inner-right CTA → Popover `Choicebox` con mini-widget per modo. Il campo trasporta una **directive** `{seq:{…}}` che il write path risolve via `sequenceAllocate` nella tx del caller — mai un literal pre-generato.

## Evidenze empiriche (TIC)

### UI — anatomia PoC (`primebrick-v3-ui/src/lib/components/schedule-spec-input/schedule-spec-input.svelte`)

- `TextInput` con `trailing_ctas=[{icon:'clipboard-clock', label, onclick:open}]` — la CTA vive nella geometria del field, non nel popover
- `Popover.Root` ancorato a `inputWrap` (`customAnchor`) — `Choicebox.Root` radio-group: ogni `Choicebox.Item` (title+desc+indicator) contiene il mini-widget del modo, renderizzato `{#if mode===…}`
- 3 modi: interval→`NumericInput`+uom, once→`DateWheelPicker`+min bound, cron→`CronInput` con `valid` callback → `canApply` gate su Apply
- `seedFromValue()` al popover-open reidrata i builder dal valore canonico — un solo wire string, due vie per riempirlo
- i18n: `app.widgets.schedule_spec.*` — fe `en-GB-fallback.json` + seed patch
- **Props nuove per noi**: `modes`/`default_mode`/disabled-modes — 1 solo modo → niente choicebox, mini-widget diretto

### FE — wiring verificato

| Pezzo | File | Fatto |
|---|---|---|
| Closed control set | `FormFieldDispatcher.svelte:243-258` | `column.widget ?? deriveControl(format)` → `FORM_CONTROLS` throw; `filter` surface: `sequence`→`text` come schedule_spec |
| entity_ref combo | `FormFieldDispatcher:861`, `use-entity-ref-options.svelte.ts` | ComboSelect paged/search su `{entityApiBase}/list`, `allow_create` esiste (inline-create da search, NON new-tab) |
| ComboSelect | `ui/.../combo-select.svelte:521` | `allowCreate` item "Create \"…\"" da search — per seq serve CTA diversa: new-tab dict page |
| Bulk editor | `entity-list/sheets/panels/BulkEditorPanel.svelte:273` | monta `FormFieldDispatcher` `surface="form"` per ogni colonna scelta; wire `{items:[{uuid,version}],set:{col:value}}` |
| Service ambiguity | `api.ts entityApiBase(entity, service?)` | builtin su OGNI servizio → il dict page passa `decl.module` parent; **il dispatcher non ha prop service** — `useEntityRefOptions` usa il global map → STESSO bug emailsender: serve `service` prop threaded |
| Sync | `useSyncChannel.svelte.ts` | `primebrick_<entity>_sync`; receiver in `useEntityList:725`; sender in `EntityFormPage:405` |
| **GAP sender dict** | `EntityDictPage` | NON posta il sync su saveAll — da aggiungere (generico `primebrick_<entity>_sync`) |
| Module context | `CensusRoute.module` | `crm-settings` → parent `crm` via `split('-')[0]` |

### BE — write path

- `DomainService.create/update(body, tx)` è **pass-through puro** a `svc` — NESSUN hook per-field esiste (verificato: domain-service.ts:168-177)
- `sequenceAllocate(spec, tx)` vive in `dal Repository` — il resolver legge le colonne `format:"sequence"` del meta, trova il valore directive nel body, alloca `SequenceCounterEntity` (schema = `domain.primary` del servizio, sempre il modulo owner), sostituisce col literal — dentro `dal.transaction` del write
- Dove: `EntityService` create/update/bulkUpdate oppure hook nuovo su DomainService — **decisione TOC**

### Meta — `crm.customers.code`

- Oggi `{key:"code", type:"text"}` plain — nessun `format`/`widget`/`sequence` dichiarato
- Nuovo contract: `format:"sequence"` + `sequence:{modes,default_mode,allow_create}` su MetaColumn (core type)

## Configurazioni

| Modo | Mini-widget | Directive |
|---|---|---|
| `generate` | pattern+step+start+sez inline → `renderSequenceValue` preview live | `{seq:{code?,pattern,step,start,sez,at}}` |
| `select` | combobox `sequence` del modulo (paged/search + preview next) + CTA new-tab | `{seq:{code:"<chosen>"}}` |

## New-tab create flow

CTA nel combo → `window.open('/{ns}/settings/sequences','_blank')` → dict inline save → `primebrick_sequence_sync` → combobox receiver rifà solo il fetch opzioni.

## Task

| # | Task | Repo |
|---|---|---|
| 1 | `MetaColumn.sequence` contract + `format:"sequence"` vocab | core |
| 2 | `SequenceInput` widget — anatomy ScheduleSpecInput, modes/disabled-collapse, i18n `app.widgets.sequence.*` | ui |
| 3 | Dispatcher: control `sequence` + `service` prop threaded (fix ambiguity builtin) | fe |
| 4 | Sequences-combobox + new-tab CTA + sync receiver puntuale | fe |
| 5 | Dict page sync sender `primebrick_<entity>_sync` | fe |
| 6 | Directive resolver nel write path (create/update/bulk) — `sequenceAllocate` in-tx | dal |
| 7 | `crm.customers.code` meta → `format:"sequence"` + bulk wiring | crm |
| 8 | E2E: sheet bulk generate+select, new-tab create, combobox reactive refresh | fe |

## Gap architetturali — TUTTI CHIUSI tranne segnati

- **A. Wire contract — CHIUSA**: il punto di validazione è `checkEntityFields`/`checkFieldValue` (`core/field-validation.ts`) — predicato CONDIVISO (BE zod `entityFieldsBody` + FE `fieldSpecToZod` + US routers). La regola seq si estende lì, per `format:"sequence"`. `MetaColumnFormat` è closed union → `"sequence"` literal additivo.
- **B. Counter read — CHIUSA**: proiezione `next` (counter join) su `sequence` list/get — plain CRUD, FE fa forecast con `renderSequenceRange`, mai alloca.
- **C. Materializzazione — CHIUSA**: `@SequenceField(decl)` porta la DECL (dato, non logica); `code` DERIVATO `<entity>.<field>` (mai ripetere `@Column`). Boot-ensure idempotente: seq dichiarata esiste a boot → visibile nel selector prima del primo write. Direttiva `{seq:{pattern,…}}` expr → materializza+alloca in-tx.
- **D. Wire shape — CHIUSA**: direttiva in-tx (vedi wire semantics sotto).
- **E. Lock — CHIUSA**: row lock `UPDATE..RETURNING` held-until-commit basta.
- **F. Resolver — CHIUSA (raffinato)**: **Repository-nativo**, non EntityService — `add`/`update`/`updateMany` leggono la persistence meta e risolvono la direttiva internamente: `updateMany` dentro la sua tx dedicata esistente (gap vero trovato: oggi non accetta tx esterna — su txRepo `BEGIN` nesta + `COMMIT` chiude la tx esterna, hazard documentato); `add`/`update` aprono mini-tx interna **solo quando serve** (lazy). txRepo join della tx esistente (runEntityWrite/translations). Update-omit = untouched = zero tx/zero allocazione.

## Wire semantics seq-bound (chiusa — nessun literal MAI)

| Payload | Significato |
|---|---|
| omesso su create | alloca seq default dichiarata (derivata o explicit-code) |
| omesso su update | untouched — niente allocazione |
| `{seq:{code:"…"}}` / `{seq:"<uuid>"}` | alloca da quella seq → literal in-tx |
| `{seq:{pattern,step,start,…}}` | expr → materializza+alloca in-tx |
| `"random-text"` | **400** — neanche client esterni |
| seq missing (default o esplicita) | `SEQUENCE_NOT_FOUND` + code/uuid nell'errore — **MAI fallback** |

## D2 — case matrix binding (decisa)

| # | Caso | Esito |
|---|---|---|
| 1 | colonna seq-bound, `code` derivato `<entity>.<field>` | ✅ canonico (PoC `customers.code` → `customer.code`) |
| 2 | stessa entity, 2 colonne, decl diverse | ✅ 2 seq derivate a boot |
| 3 | stessa entity, 2 colonne, stessa decl | ✅ legale — code derivati distinti `<table>.<f1>`/`<table>.<f2>` → 2 seq identiche (duplicazione dato, non coupling) |
| 4 | entity diverse, campi, STESSA seq logica | ✅ condivisione = DATO: seq creata nel registry e referenziata a write-time via `{seq:{code}}`; il decoratore non ha `code` |
| 5 | stesso campo, seq diversa per contesto riga (fattura vs nota credito) | ✅ direttiva esplicita `{seq:{code}}` — problema risolto dal contratto, non gap |

## Chiuso

- **Import legacy — CHIUSA**: nessun escape hatch. Pre-esistente = affare della unique constraint (collisione futura → unique violation naturale). **Compensazione attiva**: overlap pre-check read-only — il sistema anticipa l'errore invece di subirlo:
  - `sequence.analyze` RPC read-only `{seq_code|uuid, entity, column}` → `{in_use, max_value, next_proposed, suggested_start, conflicts, ambiguous}` — mai alloca
  - meccanica **pattern-exact** (NO LIKE bare — seq simili non si inquinano): `parseSequencePattern` → regex full-anchored — letterali esatti, `{seq:W}`→`\d{W,}` (zero-pad W + overflow), `{YYYY}`→`\d{4}`, `{sez}`→segmento partition — scan sulla colonna bound → max segmento numerico vs `start`/`counter`
  - ambiguità irriducibile `{seq:W}` vs `{seq:W+k}` stesso prefix → flag `ambiguous` con seq candidate, NON silenzio
  - superfici: boot-ensure auto-analyze su decl (warning), selector-bind analyze (warning inline), dict-create con contesto campo (`?for=entity.field`)
  - **aperto minore**: warning boot-ensure → solo log o persistito su seq row (`last_overlap_warning`)?

## Disegno finale concordato

- **Binding — IMPLEMENTATO (core `6e12cfa`, dal `16fcfa4`, crm `a13b8aa`)**: `@SequenceField({pattern,step,start,tz?})` — decl sola, **nessun `code` authored mai**; il code default è SEMPRE derivato `<table>.<field>` (`customers.code`). Sharing = dato runtime via direttiva `{seq:{code:"shared_seq"}}`, non decoratore. `format:"sequence"` + `seq:{code, modes, default_mode, allow_create}` derivati da `withColumnConstraints` → MetaColumn (modes/default_mode/allow_create authorabili = config superficie; `code` authored o `format` authored → construction error).
- **Lint `unique-text-guard`**: unique+text DEVE essere `immutable` e/o `@SequenceField` — tricotomia chiusa; scope PoC solo `customers.code` (updatable); altre entità = anomalie in report, classificazione congiunta.
- **GAP — partial unique RISOLTO diversamente**: `customers_code_alive_uidx` parziale è semanticamente ROTTO (deleted+alive stesso code → restore impossibile). DB verificato: unico duplicato = residuo E2E (`E2E-1795100939242`, 2 righe deleted). Fix: cleanup residuo → unique PIENO `customers_code_uq` → `customers.code` `@Unique()` normale + `@SequenceField`. Niente `UniqueOptions.where` — unique assoluta è la semantica corretta; le uniche parziali legittime sono i DEFAULT-slot.
- **Facet `@Default(scope)` — nuovo, stessa famiglia `@SequenceField`**: `is_default` oggi è plain boolean + indice DDL hand-authored + zero semantica write (23505 su slot occupato, restore sempre fallito). Il decorator dichiara scope (`customer_id` / `customer_id+type_uuid`) → emette `UNIQUE(scope) WHERE is_default AND deleted_at IS NULL` + repo-native in-tx: set→unset siblings atomico (un write, mai 23505), restore → yield `is_default=false` se slot occupato (restore non ruba mai a riga viva — da confermare vs reclaim). Entity impattate: `customer_accounts`, `customer_contacts`. `crm_translations_key_language_uidx` = stesso rischio restore, segnalato.
- **Meccaniche**: `reg.seqBound` su persistence registry (pattern `auditableType`) → `injectDerived` emette `format:"sequence"` + `seq` block; authored `format:"sequence"` senza decorator → throw (pattern ref/type). Boot-ensure: registry globale dei binding + pass post-migrations nel boot path (punto esatto: verificare initDal vs migration order in TOC).
- **Validazione direttive — IMPLEMENTATO (core `05ee0d6`, dal `ec50b42`, ui `d2e24d4`, crm `94febf3`, be i18n patch)**: `SequenceDirective`/`SequenceDecl` canonici in `core/sequence.ts` — 4 forme: `{seq:"<uuid>"}`, `{seq:{uuid}}`, `{seq:{code}}`, expr `{seq:{pattern,step,start,tz?}}` (bigint-only, closed key sets). `parseSequenceDirective` + branch `format:"sequence"` in `checkFieldValue` (literal → `schema_mismatch` + `app.common.validation.sequence_directive` ×7 applicato) + D4-A rendered-length guard (`too_big` se render start > max_length; D4-B nel resolver a write-time). `checkEntityFields`: seq-bound omesso su create esentato da required (default allocation). `fieldSpecToZod` → `z.unknown()`; `CustomerBaseSchema.code` → `z.unknown().optional()` (predicato unico source). Verificato E2E: omit→ok, direttiva→ok, literal→rejected. **GAP emerso**: `duplicate` salta `isUnique` → customer duplicate rotto oggi → resolver allowerà allocazione seq anche nel clone path.
- **Resolver repo-nativo — Step 4 IMPLEMENTATO + verificato E2E** (dal `c9e1026`+`c2f455e`): `sequenceAllocateOn(q,spec)` interna componibile. `withSeqTx`: pool→mini-tx BEGIN/COMMIT + post-commit event drain; txRepo→join caller tx. `updateMany`/`addMany` risolvono sul `client` della bulk tx — direttiva UNIFORME per set-column (mista → ValidationError); `clone` alloca default per seq-bound (fixa il duplicate rotto); `deferred-transaction` + seq-bound → throw a buffer-time (CTE non esprimibile). Literal al repo → strict reject sempre (D9). `actor` = actor dell'azione, mai fallback (D10). Expr materialization code = `<table>.<field>@expr_<sha16(decl)>` — field-scoped sempre (D7-b): 2 campi NON condividono seq se non via mapping campo→seq (dato rebindable, FE checks lo anticipano). Error: `SequenceNotFoundError` code `SEQUENCE_NOT_FOUND` + `identity`. Direttiva: `sez`/`sez2`/`sez3` + `at` nelle forme oggetto (opt); partizioni su counter (seq,period,partition_key). **Empirico (probe reali)**: `poolBound()` usa `release` come discriminatore (`PoolClient.connect` esiste nel prototype — il check `in` misdettava); claim actor bound 2× (`$7` varchar last_alloc_by / `$8` text audit) per lo schema reale; `loadOrMaterializeBound` self-provisioning del default dalla decl su registry vuoto (ON CONFLICT → operator row wins). 15 spec dal 788/788 — lazy tx, tutte le forme direttiva, strict literal, identità missing, expr idempotenza, update/clone/bulk, rollback atomicità, actor attribution, length guard, deferred forbid. CRM probe: omitted→`CUST-00139`, directive→`CUST-00140`, literal→reject, missing→`SEQUENCE_NOT_FOUND(bogus.seq)`, `last_alloc_by=probe`.
- **INCREMENT mai routed**: `sequenceAllocate` solo dentro write tx; bulk = `count:N` un UPDATE.
- **SET — Step 5 IMPLEMENTATO + verificato**: `Repository.sequenceSet({seq,next,sez*,at,actor})` primitive UPSERT tx-componibile (mai alloca). RPC `POST /api/v1/actions/sequence-set` (builtin): permesso `<ns>.sequence.set.single`, `auth:"user"`, `mfa:{action:"sequence.set",target_resource:"sequence"}`, `entity_op` → row CTA `sequence_set` con icon `sequence-numeric-right` + `confirm_key:<ns>.actions.sequence_set_confirm` (i18n ×7 patch crm `20261228100000`). Service path = `SequencesService.setCounter` via `svcFor(SequenceCounterEntity)` (governed door, audit cols stampati, version bump su update) — `DomainService.dal` è privato per costruzione, `svcFor` ora propaga `actor`+`searchableKeys`. Body `{uuid,next:bigint,sez?,sez2?,sez3?,at?}` — period derivato da `at`??now, partition da `sez*`; missing uuid → NotFound; backward SET ammesso (op governed). Counter row: `last_alloc_*` MAI toccati dal SET (non è un claim).
- **Forecast — Step 5 IMPLEMENTATO**: doppia superficie. (a) `next` su `sequence` list/get rows — batch counters della pagina su partition `""` + period@now → rendered; `null` se pattern ha `sez_slots` (serve contesto). (b) RPC `POST /api/v1/actions/sequence-forecast` `{uuid|code,sez*,at}` → `{period_key,partition_key,counter,next}` per il widget on-change combobox/partizione — permesso `read.single`. READ-ONLY verificato empiricamente: forecast non crea né tocca counter rows.
- **Registry builtin esteso**: `BuiltinDeclFactory.rpc?(ctx)` → `builtinRpcRoutes()` sdk → merge in `makeServiceRoutes` (entity_op scan + mount + OpenAPI identici alle route module-authored).
- **Analyze — Step 6 IMPLEMENTATO (dal `5ca8a7d`)**: `POST /api/v1/actions/sequence-analyze` `{uuid|code, table?, column?, sez*, at}` → `{table,column,in_use,max_value,suggested_start,next_proposed,next_in_use,conflicts_above,partitions[],ambiguous[]}` — perm `read.single`, read-only per costruzione. Target: `table`/`column` fisici validati via `information_schema` nello schema del modulo (entity-name→class IRRISOLVIBILE dal dal per costruzione — WeakMap non enumerabile), derivati dal code `<table>.<field>` quando assenti. Regex PG POSIX full-anchored da `pattern.segments`: `{seq:W}`→`([0-9]{W,})`, date→width fissi, `{sez}`→charset catturato → GROUP BY per-partizione. `next_in_use` = probe esatto sul literal next; `conflicts_above` = count conservativo (over-warning periodi vecchi accettato); `ambiguous` = sibling registry rows la cui regex matcha (corrupt-skipped). Counter-context fields `null` su partizioni non determinate. Hardening trovato via probe reale: `step`/`start` arrivano string su pool senza INT8 parser → coerce BigInt in `querySequence` (suggested_start era "1141" string-concat).
- **Widget + surfaces — Step 7 IMPLEMENTATO + e2e verificato**: `SequenceInput` (ui `8a618f6`) — readonly display + assist popover (generate pattern-builder / select registry-combobox, forecast strip, reset/apply, `primebrick_sequence_sync` BroadcastChannel). Wiring fe (`94ee14e`): `FormFieldDispatcher` `format:"sequence"` + `service` prop esplicito; seq-bound seed `''` + OMIT (mai null) su create/update/bulk/dirty-diff/dict. i18n `app.widgets.sequence.*` ×7 (be patch `20261229130000`, firmata).
- **Bug reali trovati dagli e2e**: (a) seed `$effect` ri-firing su `seqOptions`/`optLoading` change → `mode` tornava default e Apply restava disabled per sempre → edge-guard `assistOpen` false→true. (b) locator test errati (option case-sensitive, combobox self-not-descendant, NumericInput testid-on-input). (c) assertion errata `existing` su bulk mixed-values. (d) expr-seq counter persiste tra run → assert adjacency non seed. (e) bigint wire: `version`/`page`/`total`/`user_count` revivono bigint per codec → payload JSON via `Number()`, assert aggiornati.
- **Infra remediation (crm degraded)**: patch i18n `20261228100000` fallita su duplicate-key (seed manuale probe precedente) → boot degraded → 502. Fix per-provenance: `resolveManually` registry (escape hatch engine, non hand-edit), revert dell'emendamento ON CONFLICT (sha mismatch = immutability violation → degrade permanente), heartbeat auto-recovery → `status:online`. **Lezione**: mai emendare una patch dopo che il registry ne ha registrato lo sha (applied/failed/resolved che sia).
- **E2E suite**: `sequences.spec.ts` 5/5 (meta/list builtin, no-route `sequence_counter`, governed CRUD+gates, bulk SequenceInput select+generate con server-truth contigua, settings dict page), `entity-crud-lifecycle` 6/6 (customer.code omesso → `CUST-\d{5}`), `bulk-editor` 3/3 regressione zero.
- **Archetype `entity_list` — IMPLEMENTATO (fe `977f255`, sdk `d0f95b7`, dal `be7f5f2`, be `0908d17`)**: il kind `dict` hardcoded nel builtin nav merge era una scelta unilaterale errata — `kind:"list" + entity` è il contratto dichiarato dell'EntityTablePage archetype ("standard archetype", crm nav-decl). `page-resolver` ora risolve `list`+entity+no component_url → `entity_list` archetype → `EntityTablePage` (basePath da `entityApiBase(entity, decl.module.split('-')[0])`, storageKey service-scoped). La `sequence_set` CTA appare nel row kebab via entity_op→`row_custom_actions`→`useRowActions`→`runEntityOp` (e2e provato). **Bug trovato via pageerror capture**: `audited:true` autoriato sulle colonne dati del sequence meta → `code` sticky+audited doppia nei gruppi ELT (`each_key_duplicate`, tabella morta) — `audited` resta solo derivato dalla classe.
- **`sequence_set` parametric surface — CHIUSO (opzione B: dialog autoriale analyze-assisted, fe `3e8fc69`, sdk `6f7b435`, be `dcc80db`)**: `SequenceSetDialog` montato via `BuiltinEntityListPage` (wrapper archetype: props derivate + `customActionHandlers{{sequence_set: open}}` + `extraDialogs` — il pattern `users/change_password`). Il dialog raccoglie `next` + contesto opzionale (`sez`/`sez2`/`sez3` resi solo se il pattern li dichiara, `at` period ref), monta lo strip `sequence-analyze` live (in_use, max, `next_proposed`, conflitti overlap su altre seq) e prefill `suggested_start` **solo al primo render** (mai clobberare l'edit operatore; re-analyze debounced 250ms su cambio contesto). Submit → `runEntityOp` con executor esplicito `{uuid,next:bigint,sez*,at?}` → `primebrick_<entity>_sync` refresh. **Bug SDK trovato dall'e2e**: `deriveActions` droppava tutta la chrome (`confirm_key` incluso) dai custom op non-crud → `meta.actions[op]` senza `confirm_key` → `runEntityOp` gated=false → dispatch NON confermato dritto a MFA. Fix: chrome fields propagati nel mapping custom (entity-router) + regression test `service-routes-cta` (11/11). E2E: kebab → dialog → analysis strip → submit → confirm gate → cancel → chiusura — 5/5 suite.

## TIC — review tabelle `/{svc}/settings/sequences` (probe e2e `sequence-tic-probe.spec.ts`, evidenze captured)

| # | Report | Verdetto | Evidenza empirica |
|---|--------|----------|-------------------|
| 1 | "Modifica" no-op | **GAP route** — il leaf builtin contribuisce solo `kind:"list"`; `openEdit` richiede `editPath`/`kind:"detail"` → `onEditAction` undefined → click silenzioso | `URL AFTER EDIT` invariato, 0 dialog |
| 2 | Delete sì, bulk no | **GAP decl** — `permissions` dichiara `delete`/`restore` (single) ma non `bulkDelete`/`bulkRestore` → `meta.actions` senza `delete.bulk` → CTA assente by construction | sequence-decl.ts:401-410 |
| 3 | Confirm delete "sempre in loading" | **BUG SERVIZIO** — DELETE a `/svc/emailsender/api/v1/entities/sequence/:uuid` → **500** (uuid inesistente nello schema emailsender) | `DELETE SEEN: /svc/emailsender/...?version=1 → 500` |
| 4 | "Edit Log" (registro modifiche) KO | **STESSO BUG** — `VersionHistoryPanel` fetcha `entityApiBase(entity)` senza service → audit a `/svc/emailsender/.../audit` → 500 | `AUDIT SEEN: /svc/emailsender/.../audit → 500` |
| 5 | MFA DOPO il confirm, non prima | **STANDARD** — `runEntityOp`: `askConfirm` (intento) → `stepUp.executeWithToken` (identità) → dispatch. Confirm→MFA è l'ordine governed ovunque, non un bug | use-entity-op.svelte.ts:195-233 |
| 6 | `label_key`/`description_key` raw in colonna | **CONVENTIONE esistente** — le dict entity (`account_kind`, `consent_type`…) mostrano la key raw `type:"text"`: l'operatore GESTISCE la chiave. I pattern "tradotti" sono per-format (`service_registry`, `idp_role`, `nats_subject`, badge options) → `$t(value)`; nessuna convenzione generica "stored-key → translated cell" | account_kind.meta.ts:13 |
| 7 | Mancano current/next/last emitted/last_alloc_at | **DESIGN** — counter state vive in `sequence_counters` (mai routed): `counter` (next-to-emit), `last_alloc_at/by/count` esistono ma il list non li proietta. "Valore attuale" ambiguo: N period_key × M partition_key per riga — serve contratto di proiezione (default-partition@now? aggregate MAX(last_alloc_at)?). "Interpolated next" richiede materializzazione pattern+counter lato service (forecast già lo fa per-chiamata) | sequence-counter-entity.ts, forecastRow |
| 8 | Soft/hard delete | **SOFT, funziona come atteso** — `SequenceEntity extends Deletable` → `deleted_at`; `querySequence` filtra `deleted_at IS NULL` → direttiva su seq deleted → `SequenceNotFoundError` (cascata voluta, mai fallback); counters persistono (Auditable, no deleted_at) → `restore` resuscita lo stato intero | probe: DELETE 200 → write `{seq:{code}}` → 500 SequenceNotFoundError → RESTORE 200 |

**Root cause sistemica (1·3·4 + dispatch generico)**: i builtin entities montano su OGNI servizio → il census `entity→service` (`module.entities` flatMap, last-wins) assegna `sequence→emailsender`. La TABELLA funziona perché `basePath` è esplicito (`/svc/crm/…`); tutte le side-path che ri-derivano da `entity` sola — `entityApiBase(entity)`, `serviceApiPrefix(entity)`, `runEntityOp.defaultRequest`, `VersionHistoryPanel`, `useAuditBox` — risolvono il servizio sbagliato. Fix: `service` deve viaggiare col surface — `decl.module` → `BuiltinEntityListPage` → `EntityTablePage.service` prop → `EntityListTable` → `useRowActions` → `runEntityOp({service})`/`openSheet({service})`/`runEndpointAction` svc-prefix esplicito.

**`tz` spiegazione**: IANA zone per i token data del pattern + il confine `period_key` (es. `CUST-{YYYY}-{seq:4}` materializza la data e decide "a che anno appartiene questa allocazione" nel fuso dichiarato; `null` → UTC).

### Decisioni prodotto aperte (post-TIC)

- **Edit surface**: `kind:"detail"` builtin + `page_props.form` → `entity_form` archetype, oppure `EntityRecordSheet` inline via `onEditAction` dedicato.
- **Bulk delete/restore**: dichiarare `bulkDelete`/`bulkRestore` nel decl per parità con le altre entity?
- **Colonne counter**: quale proiezione? (default-partition@now vs aggregate; "interpolated next" = materializzazione read-only in list).
- **label_key display**: raw (convenzione dict, l'operatore gestisce la key) vs nuovo formato cell "translate-on-display" (`$t(value)` con fallback raw).
- **`SequenceNotFoundError` status**: oggi 500 `INTERNAL_ERROR` con title typed — accettabile (rottura contratto dati lato server) o va mappato a 4xx + `internal_code:"SEQUENCE_NOT_FOUND"`?
