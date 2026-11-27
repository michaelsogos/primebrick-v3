# JH standard migration — route canoniche, cosmetici authored

**Status**: 🟠 WIP — decisione utente 2026-11-27: "voglio le route standard, tutto standard,
ma le authored labels e icons" + precisazione scope: SOLO labels/icons nelle leaf nav.
Esecuzione a turni: l'utente verifica visivamente dopo il GREEN E2E, prima del commit.

## End-state ratificato
1. path canonici table-snake: `/system/job/job_triggers`, `/system/job/job_schedules`, `/system/job/job_runs` — i nomi corti (triggers/runs/job-schedules) muoiono
2. UN set di leaf: merge cosmetico per href — label_key `job.jobs.nav*` custom (già tradotte ×7) + icone list-checks/list-clock/play + default su triggers
3. zero duplicati, zero raw keys in sidebar/popover
4. TRIGGER_FORM intatta: la rotta create/detail authored vince il suo href esatto (merge rotte già nel SDK) — nessuna eccezione nuova
5. create leaf derivata nel popover con chiave canonica `job.job_triggers.nav.create` seedata ×7

## Doc receipts
- `be-v3/docs/dev-guide/module-navigation.mdx:36-52` — route-shape enforcement: plural leaf, `/create` suffix, `[param]` detail; entityPaths unico costruttore
- `module-navigation.mdx` access axis — gerarchico: `access.system.job` copre TUTTO il sottoalbero a prescindere dal nome segmento → migrazione access-safe; `is_admin` implica `access.system` (test actor coperto)
- `module-navigation.mdx` — seeds in `*.translations` schema del servizio: job.translations (colonna `language`, non `lang` — schema diverso da crm!)
- `sdk/src/service/nav-declaration.ts:56` — entityPaths(prefix, listLeaf) literal segment constructor
- `sdk/src/http/derive-entity-nav.ts` — merge cosmetico create leaf implementato (CRM slice); list leaf authored-wins per href; route dedupe exact-path authored wins
- `job-handler/src/nav-declaration.ts:25-27` — i 3 pathset custom correnti
- vocabolario DB job.translations: trigger = de "Trigger", en "Trigger", es "Triggers", fr "Déclencheurs", it "Attivatori", pt "Triggers"

## Composizioni create leaf ×7 (stile CRM per lingua)
de "Neuer Trigger" · en-GB/US "New Trigger" · es "Nuevo trigger" · fr "Nouveau déclencheur" · it "Nuovo Attivatore" · pt "Novo trigger"

## Superficie codemod path (censita)
- fe-v3 jobs-pages.spec.ts: ~50 refs · access-filtering 7 · elt-columns-filter-ux 8 · entity-list-table-interactions 8 · elt-filters-parity 4 · bulk-editor/collaboration-form/elt-json-cell/elt-numeric-cell-ux/entity-form-submit-gating 2 cad · elt-list-wire-attack/entity-events-choreography/entity-op-confirm-gate 1 cad (+ altre sotto la soglia)
- fe-v3 lib: AppSidebar.svelte:65-67 + EntityTablePage.svelte:172 — solo commenti esemplificativi (aggiornare per accuratezza)
- fe-v3 unit tests: access-guard/entity-links/modules-shell (3 file)
- us-v3 job-handler/src: zero riferimenti interni fuori da nav-declaration ✓

## Rischi chiusi
- access: gerarchico, chiuso da doc — nessuna migrazione grant necessaria
- shadow create CTA: morte dei path corti = morte delle ombre — la CTA torna unica

## Turni
1. ✅ receipts + censimento + vocabolario
2. spec RED end-user dimostrata
3. implementazione: nav-declaration + seed patch ×7 firmata + codemod test
4. GREEN in sessione + prova del 9 → PAUSA verifica utente
5. ledger + commit + push solo dopo il via dell'utente

## GREEN — turno 4 completato in sessione (2026-11-27)
- RED dimostrato: payload senza leaf set canonico (test 1 fallito esatto pre-implementazione)
- implementazione: nav-declaration path migrati ai canonici table-snake; seed patch
  `20270101190000_job_trigger_create_leaf_x7.sql` (7 INSERT) firmata devin-agent, applicata
  (1 applied, 0 failed), redis flush ×7; codemod 39 file plain + escaped regex forms
  (nota tecnica: il canale shell collassa i backslash — String.raw obbligatorio negli script)
- drift riparato in corso d'opera: testid `entity-form-page` fantasma (pinnato da 9 spec, mai
  emesso da alcun componente) → allineato al reale `entity-form-surface`; keys.json job-handler
  esteso con devin-agent (stesso pattern crm già accettato)
- GREEN `job-nav-standard.spec.ts` 4/4 in 35-38s: payload contract, sidebar trio tradotto,
  popover rows reali it-IT, create form con layout TRIGGER_FORM (payload_map col 2, default @every 5m)
- unit test FE sui file codemodded: 32/32 verdi
- ORDINE workflow ratificato dall'utente dopo verifica visiva: triggers → schedules → runs
  (non alfabetico — alfabetico rimescolerebbe per lingua). RED dimostrato, pin order 1/2/3
  come cosmetici authored, GREEN 4/4 — popover: Nuovo Attivatore/Attivatori/Pianificazioni/Esecuzioni
- utente ha verificato visivamente: "è perfetto" + correzione ordine (poi applicata)

## ANOMALIA regressione — interferenza run paralleli (colpa mia)
- primo run jobs-pages: 9 passed incluse TUTTE le prove migration-critical (create CTA :320,
  list tables, meta), poi 18 failure a cascata per TIMEOUT DI LOGIN — i miei run job-nav-standard
  in parallelo hanno clobberato l'attore effimero condiviso (teardown incrociato). Canon violato:
  mai run playwright concorrenti. Rilancio pulito senza parallelismo.

## Regressione jobs-pages pulita (seriale, zero parallelismo) — 22/27 VERDI
- test 1-9 TUTTI verdi incluse le prove migration-critical: create CTA → EntityFormPage,
  list tables, meta column order/visibility, outcome preset wire request
- 5 failure classificati con evidenza DB — ROT pre-esistente da crescita dataset, NON regressione:
  1. `:945` cerca riga `e2e-callable-dispatch` — esiste nel DB (31 ott) ma è alla posizione 38
     in ordine created_at desc → fuori pagina 1, il test non pagina né cerca
  2. `:1048` cerca `api-partition-maintenance` — posizione 28 → stessa classe
  3. `:1140` cerca schedule del trigger orfano `e2e-gate-1793665359607` — esiste nel DB (1 riga),
     53 schedule totali, fixture del 3 nov sepolto → stessa classe
  4. `:564` error_code badge — click su cella della prima riga failed, dataset-order-dipendente
  5. `:608` visibleKeys v2 — logica FE/sessionStorage: il runtime FE è INTATTO in questo slice
     (zero modifiche ai componenti) → non può essere causato dalla migrazione per costruzione
- meccanismo rot: fixture hardcoded scritti quando erano righe fresche (top pagina); il dataset
  è cresciuto (bulkedit 21 nov in cima) e i fixture sono scivolati oltre pagina 1. I test non
  paginano né usano search — time-bomb scritta nel test, indipendente dai path nav
- decisione utente richiesta: committare la migrazione + slice separato per il rot dei test,
  oppure fixare il rot prima del commit

## Slice rot-repair (decisione utente: opzione 2 — fix prima del commit)
Doc receipts:
- `fe-v3/docs/ai/e2e-browser-session.md` — assertions of completeness: expected set dalla source
  of truth dell'app stessa; determinismo evidence-not-sleeps; 5s expectation budget
- `jobs-pages.spec.ts:1096-1106` — search primitive canonica: testid `entity-search` input +
  waitForResponse `search=` server-side narrowing (prova esistente nel file)
- RED già dimostrato: i 5 failure del run pulito 22/27 (evidenza DB: righe esistono ma oltre pagina 1)
Riparazioni (robustezza dataset-independent, comportamento end-user reale):
1. `:945` lazy ref — generalizzato: prima riga visibile trigger-owned (ogni schedule lo è),
   asserzioni comportamentali identiche, zero fixture hardcoded
2. `:1048` system:api — search end-user "api-partition-maintenance" (server-side) poi assert
3. `:1140` orphan — seek paginando (next-page bounded) fino alla riga fixture
4. `:564` error_code — primo button nella colonna error su TUTTE le righe, non solo la prima
5. `:608` visibleKeys — diagnosi empirica nel run filtrato prima di toccare

## Rot-repair — diagnosi finale (evidenze empiriche)
- `:1048` system:api → VERDE con search end-user server-side (18.2s) — riparazione confermata
- `:945` lazyref: il drill FUNZIONA — il fallimento era assertion errata: il nome trigger
  renderizza in un input (mai in textContent); ora pinna "Job Trigger ID" (uuid line)
- `:1140` orphan: menu page-size di schedules NON ha opzione 100 → crawl paginazione bounded ×8
- `:564` error_code: badge sparsi su più pagine → stesso crawl bounded
- `:611` visibleKeys: assertion v:2 letterale — l'app scrive shape intent evoluta (v2→v3 migration
  documentata in useEntityList.svelte.ts:280-289, bootstrap-polluted hidden droppato). Riparata
  su CONTRATTO (non bare array, shown/hidden array, hidden non-empty) + auto-diagnosi raw nel
  messaggio. NOTA: $effect auto-persiste dopo metaLoaded (useEntityList:388-404)
- run filtrato --workers=1 in corso per i 4 restanti

## STOP-ANOMALIA rot-repair (fine sessione per budget contesto) — il rot è più profondo della paginazione
Run filtrato 4 test --workers=1: TUTTI e 4 ancora rossi, ma con diagnosi precise:
- `:1140` orphan crawl ×8 pagine: riga MAI visibile — ipotesi forte: filtro deletion/active di
  default NASCONDE la schedule orfana (o il nome trigger non è nel text della riga ref-cell).
  NON è paginazione: investigare deletion-filter e rendering ref-cell nel prossimo slice
- `:611` visibleKeys auto-diagnosi riuscita: "still a bare v1 array" dopo 10s — la riscrittura
  non avviene MAI nonostante la $effect auto-persist (useEntityList:388). Restore funziona
  (gli header rispettano il seed) ma persist non riscrive. Contraddizione da investigare:
  possibile bug reale app (v2→v3 refactor) oppure storage key mismatch nel write path
- `:564` error_code: NESSUN button in td colonna error su nessuna pagina — il contratto
  badge-as-button potrebbe essere morto nel refactor ELT, oppure errIdx disallineato
  (expander td senza th), oppure nessuna riga failed con error_code nel range crawlato
- `:958` lazyref: il drill APRE il record sheet corretto (verificato: uuid + contenuto trigger
  reale nel log!) — ma `visualOrder.indexOf("name")` = -1: il campo name NON ha id
  `record-sheet-field-name` — drift meccanica collapse-contract assertion
STATO FISICO NON COMMITTATO: tutto il lavoro è nell'albero (sdk e956dd0..6dd82f5 già pushati
per CRM; JH slice: us-v3 nav-declaration+keys+patch, fe-v3 codemod+specs+rot-fix parziali,
workspace piano). MIGRAZIONE JH PROVATA VERDE sulla sua superficie (job-nav-standard 4/4,
browser utente, regression migration-critical 1-9 verdi). Il rot restante è debito pre-esistente
che richiede slice dedicato con investigazione app-level, NON meccanica di test.
DECISIONE UTENTE RICHIESTA: committare migrazione + registrare rot-debt, oppure tutto in sospeso.

## HANDOFF prossima sessione — sonde decisive già eseguite, piste precise
Utente ha scelto opzione 2: NIENTE COMMIT finché il rot non è risolto. Lavoro nell'albero, mai committare parziale.
- `:1140` SMOKING GUN TROVATO: la schedule orfana è status=disarmed (solo 3 disarmed + 6 fired vs
  44 armed in job_schedules). La tabella schedules applica presumibilmente un preset/filtro status
  di default che esclude disarmed — per questo il crawl non la trova MAI. NON è paginazione.
  PROSSIMO PASSO: leggere la meta servita di job_schedule (table.presets/default) e disattivare
  il preset via UI end-user (click preset "tutti") prima di cercare la riga, oppure verificare se
  il default è una regressione app — doc: jobs-pages.spec.ts:85 (schedule_kind preset meta-declared)
- `:611` visibleKeys: restore ok, rewrite mai. Pista: leggere TUTTO il guard della $effect persist
  (useEntityList.svelte.ts:380-405) — commento a riga 388 "writes can't clobber stored prefs before
  they are applied" suggerisce un guard che sopprime il primo write. Verificare se intenzionale
  (allora il test deve interagire: toggle colonna per innescare persist) o bug del refactor v3.
- `:564` error_code: verificare nel DOM reale se i badge error_code renderizzano button o testo
  (contratto badge-as-button forse morto nel refactor ELT) — sonda: snapshot page yaml completo
  del test-results + grep button in cella. Se contratto morto: regressione app vera, non test.
- `:958` lazyref: gli id record-sheet-field-* NON compaiono nello yaml snapshot (sono attributi,
  non testo) — riprodurre con evaluate nel test o leggere EntityRecordSheet.svelte per l'id pattern
  reale del campo name (forse wrapping copy-field cambia struttura)
REGOLA OBTORTO COLLO: mai run playwright in parallelo; letture output ≤30s; niente sleep nei test.

## UPDATE — investigazione continuata (utente: "no finisci")
- `:1140` ESCLUSIONE RAFFINATA: la schedule orfana È schedule_type=recurring — il preset default
  schedule_type NON la esclude. Restano due ipotesi: (a) filtro status aggiuntivo di default
  (disarmed escluso — verificare filters[1+] sulla wire reale, il test :85 asserisce solo filters[0]);
  (b) il join di proiezione trigger ESCLUDE i trigger soft-deleted lato SQL → la riga esce del tutto
  dalla list → REGRESSIONE APP reale (il test fu scritto proprio per pinnare che il join sopravvive).
  PROSSIMO PASSO DECISIVO: leggere la list API servita — query entities/job_schedule/list con
  filtri disattivati e cercare la riga orfana (uuid trigger 347a736e-48ea-4ad0-9c5a-720d025be861
  dal schedule_subject jobs.schedule.job.347a736e-...). Se assente → bug app nel join/proiezione.
  Il serving è generico (entities route SDK/dal), non in job-handler/src.
- `:958` i record-sheet-field-* id esistono SOLO in FieldEcho.svelte (__tests__) — MAI in produzione:
  l'assertion visual-order è drift completo da refactor. Riparare leggendo la struttura reale di
  EntityRecordSheet (pannelli in entity-list/sheets/panels/) e pinna su hook reali.
- `:611` fix deciso: toggle colonna end-user (columns-toggle) per innescare il persist — onesto
  a prescindere dal guard: "first persist rewrites" richiede un persist, che è azione utente.
- `:564` sonda pendente: grep button nel yaml snapshot completo della pagina.

## `:611` — PROVA DEL 9 DECISIVA: candidato BUG APP reale, non test rot
Interazione end-user inserita nel test (columns-toggle-run_as click — il toggle era visibile e
cliccato, il test fallisce DOPO sul predicato). RISULTATO: anche dopo un persist reale la chiave
`pb:jobs:runs:visibleKeys` resta il bare v1 array `["uuid","name","status"]` per 10s interi.
IPOTESI FORTE: il write path persiste su una CHIAVE DIVERSA da quella letta dal restore (key
mismatch) — il restore legge la legacy key (per questo il seed si applica agli header) ma
persistState scrive altrove, così la legacy non viene mai riscritta. OPPURE storageSet fallisce
silenzioso. PROSSIMO PASSO: leggere la derivazione di skVisibleKeys e storageSet/storageGet in
useEntityList.svelte.ts (righe 190-200 e 372-376) e confrontarle con la chiave del test —
poi leggere deriveVisibleKeyPrefs in @primebrick/ui. Se mismatch confermato → FIX APP, non test.
Il test con l'interazione inserita è già la spec finale corretta: non toccarlo più, riparare l'app.

## `:611` — MISTERO RISOLTO (useEntityList.svelte.ts:212-232)
storageSet scrive SOLO su persistMedium; storageGet legge persistMedium poi legacyMedium in
fallback. Il test seeda/legge sessionStorage ma la migrazione medium è: legacy sessionStorage →
persist localStorage (o viceversa — verificare la derivazione di persistMedium/legacyMedium nel
file, righe ~150-180). Il contratto NON è "riscrivi la legacy key in-place" ma "leggi legacy una
volta, persisti sul nuovo medium". FIX TEST (già corretto il resto): asserire la shape intent sul
PERSIST MEDIUM (localStorage?) non su sessionStorage. Il seed resta su sessionStorage per provare
il percorso di migrazione legacy→nuovo. Tutto il resto del test è già a posto (interazione
columns-toggle inserita). NESSUN BUG APP — il comportamento è by-design: medium migration.

## `:611` medium-verità finale (useEntityList:128-130)
persistMedium default 'session', legacyMedium default 'local'. Quindi persist scrive SESSION per
default — la medium theory regge SOLO se il caller passa persist:'local'. Di fatto: nessuna write
raggiunge sessionStorage entro 10s manco dopo toggle reale. PROSSIMO PASSO UNICO: trovare dove
useEntityList viene istanziato per le entity table (NON in entity-table-page/*) e leggere le opts
persist/storageKeyPrefix reali — grep `useEntityList` in tutto src/lib + EntityTablePage:294-310.
Poi il fix test è asserire sul medium effettivo. Fine budget sessione — continuazione automatica.

## PROGRESSIONE rot-repair (sessione continuata)
- `:611` RISOLTO alla radice: la chiave storage reale è `pb:job-job_run:list:visibleKeys`
  (derivazione BuiltinEntityListPage:48 `pb:${service}-${entity}:list:`) — il test pinnava
  `pb:jobs:runs:*` chiave morta da refactor prefix. Gli header passavano per coincidenza coi
  default. Riparata chiave + flusso end-user completo (toggle ON run_as + OFF status) +
  semantica v3 corretta: shown=intent non-default, hidden=default nascoste dall'utente.
  Shape finale provata: {"v":3,"shown":["uuid","run_as"],"hidden":["status"]} — trappola
  bigint ext-json gestita (Number() nell'assertion)
- `:958` VERDE (11.6s): hook reale `entity-form-field-<key>` (EntityFormSurface:655) —
  i record-sheet-field-* erano drift completo, mai esistiti in produzione
- `:564` riparato su hook reale `ref-cell-error_code-text` (CellAffordance, TableCell:511) —
  la vecchia anatomia td>button era drift del refactor affordance
- `:1140` sonda API auto-diagnosticante dentro il test: il messaggio dirà se la riga orfana
  è servita (join regression app) o no — run in corso

## ROT-REPAIR: 4/5 VERDI — `:564` è FEATURE MANCANTE, decisione utente
VERDI confermati in run seriali questa sessione:
- `:1048` system:api (search) · `:958` lazyref (hook entity-form-field-*) · `:611` visibleKeys
  (chiave reale pb:job-job_run:list:visibleKeys + semantica v3 + bigint fix) · `:1140` orphan
  (crawl paginazione — la riga è servita e trovata, 15.2s verde)
`:564` error_code — VERDETTO DEFINITIVO con evidenza codice:
- il badge error_code RENDERIZZA come Badge colorato non cliccabile (TableCell.svelte:341-350,
  branch column.badge?.values — zero onclick, zero button, zero drill)
- la meta dichiara INTENTO: job.meta.ts:437 "the run-detail sheet is its surface" — il drill
  badge→job.runDetail è design voluto ma MAI implementato (o morto in refactor): nessun canale
  meta dichiara il target di drill, nessun wiring FE lo apre
- la remote sheet job.runDetail ESISTE ed è viva (nav-declaration:102, RunDetailSheet.svelte)
- NON è test rot: è una feature mancante/regredita. Opzioni per l'utente:
  1. implementare il drill (slice feature: canale meta badge.drill + wiring FE openSheet
     job.runDetail con context row uuid) — il test è già la spec RED perfetta
  2. la superficie canonica entity.record ha sostituito runDetail per design → riscrivere il
     test sul contratto reale (row click / ref drill) o ritirarlo
