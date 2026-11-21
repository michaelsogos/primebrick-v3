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
- **SET**: `Repository.sequenceSet` tx-only → RPC `sequence.set` permission+confirm+MFA.
- **Forecast**: `next` projection su list/get + `renderSequenceRange` client.
