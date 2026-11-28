# Customers full autowire — niente superfici speciali in CRM

**Status**: 🟠 WIP — ratificato dall'utente 2026-11-27 (verbatim: "NON CE NIENTE IN CRM CHE
NON POSSA ESSERE STANDARD — la ELT come sempre, la form create come sempre, voglio la leaf
per create page con la sua icona e users-round, voglio la form classica").

## End-state ratificato (non negoziabile)
1. customers entity completamente derivata/autowired come ogni altra entità standard
2. icona `users-round` sulla leaf customers — l'icona authored NON deve sopprimere nulla
3. create leaf presente nel popover (sidebar:false, pairing prima della list) con icona
4. create page `/crm/customers/create` = form standard entity_form host-rendered — lo stub
   remote "coming soon" muore
5. pinning: customers first resta (nav-leaf-ordering.spec lo pinna già)

## Doc receipts
- `primebrick-v3-sdk/src/http/derive-entity-nav.ts:84-91` — soppressione corrente:
  `owned` = qualsiasi rotta authored per entityName → skip TUTTO (all-or-nothing)
- `primebrick-us-v3/crm/src/nav-declaration.ts:33` — il commento stesso ammette:
  "Authoring a route for an entity here suppresses its derivation — the author owns it"
- `derive-entity-nav.ts:168-175` — la derivazione emette GIÀ create route con
  `page_props.form.fields` (form standard host-rendered) + create leaf sidebar:false
- `module-discovery.service.ts:160` — authored icon wins: il canale override icone esiste già

## Design scelto (derivato dalla direttiva utente)
soppressione GRANULARE per surface, non per entità: authored sopprime solo l'href esatto
che dichiara; tutto il resto deriva normalmente. La leaf customers authored resta SOLO per
ciò che la derivazione non può sapere (icon, order, default) — list route/form/create vengono
derivati. Lo stub remote CustomerCreatePage muore con la sua rotta authored.

## Domande tecniche risolte internamente (non utente)
- remote-failure-recovery test vehicle: da riposizionare se /crm/customers/create non è più remote
- collision tests esistenti: la semantica cambia da per-entity a per-href — spec da aggiornare

## GREEN — slice chiuso in sessione (2026-11-27)
- RED dimostrato pre-implementazione: nessuna create leaf customers nel payload (spec falliva esatta)
- implementazione definitiva in `derive-entity-nav.ts`: soppressione ownership RIMOSSA — derivazione
  totale e incondizionata; authored leaf merge = solo cosmetico (icon/label/order/default);
  dedupe per href su list leaf/route e create route (authored wins sul path esatto — preserva
  le surface genuinely custom tipo emailsender provider create remote)
- crm nav-declaration: rotte authored list+create RIMOSSE — derivazione emette entrambe standard;
  leaf customers resta come solo override cosmetico (icon users-round, order 1, default)
- GREEN `crm-customers-autowire.spec.ts` 3/3 in 29.5s — popover rows reali it-IT:
  "Nuovo Cliente"→"Lista Clienti" in cima, pairing perfetto su tutte le entità; create page
  renderizza la entity form standard (mai più stub); sidebar ZERO create leaf
- regressione nav core: nav-derive-crm 14/14, nav-leaf-ordering 3/3, nav-popover-creates verde
  (popover en-US: "New Customer" posizione 0, pairing create-before-list su 9 rows)
- SDK unit: 668/668 verdi — contratto sano a livello unit

## Blast radius cross-modulo — TROVATO e gestito
- i failure jobs-pages (7) erano TRANSITORI: rebuild SDK a metà run — verificato: run-detail
  sheet test ripassa singolarmente (13.5s)
- re-vehicle necessario: remote-vendor-drift + jobs-pages usavano `/crm/customers/create` come
  veicolo di pagina remote — non più remote per design. Re-vehicled su
  `/system/emailsender/providers/create` (remote esm-mount confermato). vendor-drift 3/3 GREEN.
- ⚠️ SUPERFICI OMBRA scoperte in job/emailsender: path authored custom (`triggers` vs table-derived
  `job_triggers`, `templates` vs `email_templates`) → la derivazione emette route+leaf parallele
  ai path table-derived (es. create route `/system/job/job_triggers/create` + leaf ombra nel
  popover). Nessuna collisione (dedupe per href esatto) ma superfici duplicate di fatto.
  **DECISIONE UTENTE PENDENTE**: (a) migrare i moduli ai path standard table-derived;
  (b) `nav:false` escape hatch su quelle entity (mai ri-ratificato); (c) derivazione adotta
  i path authored via campo entity (correlazione). Evidenza in temp/payload-modules.json
- nota icona: utente disse "round-user" — in Lucide non esiste; esiste `user-round` (singolare)
  e `users-round` (plurale, corrente sulla leaf). Interpretato come users-round resta — conferma utente pendente
- cleanup pendente: crm/fe chunk remoto (CustomerCreatePage stub) ora non referenziato —
  infrastruttura intatta, rimozione = decisione utente

## Icona create leaf — user-round ratificata e GREEN (2026-11-27)
- utente: "la icona della leaf CREATE CUSTOMER fosse user-round" — verificato empirico:
  `user-round` esiste in Lucide ed è già in uso nel FE (EntityRecordSheet); `round-user` non esiste
- RED dimostrato: assertion icona falliva — leaf materializzava file-plus dal kind default
- SDK derive-entity-nav: merge cosmetico sulla create leaf — authored contribuisce SOLO
  icon/label_key/order/default; struttura (id/href/sidebar:false) resta della derivazione, mai overridable
- crm nav-declaration: leaf authored `customers-create` = solo override cosmetico icon user-round
- GREEN 3/3 in 26.7s — payload assertion + popover pairing + form standard tutti verdi

## DECISIONE UTENTE (2026-11-27): route standard ovunque, labels/icone authored
"ok, allora voglio le route standard, tutto standard, ma le authored labels e icons"
- JH migra ai path canonici table-snake: /system/job/job_triggers, job_schedules, job_runs
  (niente più triggers/runs/job-schedules corti — la divergenza nominale muore)
- leaves JH restano authored SOLO come cosmetici: label_key job.jobs.nav_* custom + icone
  list-checks/list-clock/play — merge cosmetico già implementato nel SDK
- evidenza screenshot utente: duplicati REALI funzionanti — leaf authored tradotte +
  leaf ombra raw-key (job.job_triggers.nav non seedata) entrambe visibili in sidebar,
  entrambe funzionanti (stessa lista da due URL). Radice: correlazione per href esatto
  non cattura divergenza nominale; i seed translation mancano delle chiavi canoniche
- DA DEFINIRE (domanda all'utente): destino TRIGGER_FORM — layout col/row payload_map,
  default values, validators job_trigger_shape/payload_map_conformance. La form derivata
  standard emette solo {key} nudi. Opzioni: (a) form declaration sul decl entity come
  canale standard della derivazione [lavoro SDK]; (b) eccezione authored controllata;
  (c) si perde — form minimale derivata
- emailsender: stessa migrazione da applicare dopo JH (providers/templates custom paths)
- impatto tests: jobs-pages.spec naviga i vecchi path ovunque — codemod necessario

## PRECISEZIONE SCOPE utente (2026-11-27) — labels/icone nelle leaf, NON le pagine
La decisione riguarda SOLO le leaf nav (popover/sidebar/tutte le navs): le 3 leaf standard
derivate devono portare le LABELS e ICONE authored (job.jobs.nav_* tradotte + list-checks/
list-clock/play). Nello screenshot: 3 authored corrette + 3 standard con label raw-key e
icone sbagliate — lo stato finale è UN SET di leaf ai path standard con cosmetici authored.
Meccanica: migrando i path authored ai canonici table-snake, gli href coincidono → il merge
cosmetico per href (già nel SDK) trasferisce label_key+icon sulle leaf derivate, duplicati
impossibili. Le raw-key shadow muoiono coi path custom. La form trigger NON era in scope:
la rotta create/detail authored vince il suo href esatto (merge rotte già implementato) —
TRIGGER_FORM sopravvive senza eccezioni né canali nuovi. Domanda form: RITIRATA.

## Slice closeout B — CRM perfect closure (2026-11-27)
Doc receipts:
- `us-v3/crm/src/nav-declaration.ts:44-48` — NO authored routes, derivation total:
  /crm/customers/create risolve come entity_form standard host-rendered → il chunk
  remoto crm-pages non è referenziato da nessuna rotta del census
- `us-v3/crm/fe/src/index.ts` — il chunk monta solo CustomerCreatePage per
  /crm/customers/create: morto per costruzione dopo la migrazione standard
- `us-v3/crm/package.json` — prebuild include `pnpm fe:build` + script fe:build/fe:check:
  la deletion del chunk DEVE includere lo scabio degli script o il build si rompe
- `us-v3/crm/src/controllers/http/module-assets-route.ts` — serving infra generica
  per tutti i moduli: RESTA, non è debito crm-specifico
- `fe-v3/src/lib/entity-form/EntityFormPage.svelte:113-117` — onsaved create → goto(listHref):
  la prova end-user del submit è la riga visibile nella lista dopo il redirect
- `fe-v3/src/lib/entity-form/EntityFormPage.svelte:182` — hook submit `entity-form-submit`;
  campi `entity-form-field-<key>` (EntityFormSurface:655)
RED atteso: mai provato prima — se il submit loop è rotto la spec è RED e si implementa;
se passa al primo colpo è la prova che la feature era già sana e il closeout è solo deletion.

### STOP-ANOMALIA 2026-11-27 — sequence validation blocca il designed auto-allocate path
Evidenza a tenaglia (screenshot + codice):
1. design contract in DUE posti indipendenti: sequence-input.svelte header
   ("''/undefined while untouched — omitted on create = the column's default
   sequence allocates in the write tx") + EntityFormSurface.svelte:272-275
   (payload builder: sequence vuota → omessa dal payload, mai null-written)
2. il placeholder stesso promette all'utente: "Generated automatically from customers.code"
3. MA la validazione zod blocca: build-entity-form-schema.ts:186 — required =
   nullable===false → code è required → fieldSpecToZod sequence branch
   (z.unknown().superRefine(emitIssues)) passa '' a checkFieldValue che risponde
   "Expected a sequence directive" → form invalid → updateForm.valid false →
   il payload builder corretto NON viene mai raggiunto
4. risultato end-user reale: il bottone Create resta disabled con code vuoto —
   l'unico path possibile è l'assist popover (select/generate directive manualmente)
Stato test: display_name fill OK, status select OK (Active chip), submit disabled
su code vuoto. La spec create-e2e in crm-customers-autowire.spec.ts è il RED vivo.
Domanda aperta per l'utente: fix validazione (sequence vuota valida in create
sempre — required è meaningless perché il server alloca) vs design cambiato.

## TIC — system_generated design analysis (2026-11-27, user-ratified direction)
Doc receipts:
- `core/src/entity-meta.ts:568-573` — `managed`: DB-filled identity keys ONLY,
  derived-never-authored, never client-supplied. MA `EntityFormSurface.svelte:148-149`:
  managed è ESCLUSO dalle form per contratto (synthesizeFormDecl) → viola il
  requisito visibilità. NON riusabile
- `core/src/entity-meta.ts:577-581` — `immutable`: editable in create, disabled in
  update — esattamente il 50% che l'utente ha identificato (update giusta, create sbagliata)
- `core/src/entity-meta.ts:683-700` — `seq` prop: uuid DERIVED del bound default
  (`<table>.<field>` deterministico) — la PRESENZA di seq+uuid È il segnale di
  rilevamento: quella colonna sarà auto-generata in create
- `crm/src/domain/entities/customer_entity.ts:49` — `@SequenceField({pattern:"CUST-{seq:5}"})`:
  il binding è dichiarativo a livello entity, il default materializza lazily
- forecast già esistente: `emitted_next` nelle righe registry + endpoint
  sequence-forecast (sequence-input.svelte header:30-36) — la preview NON alloca,
  il valore reale si stacca al save nella write tx (user-verbatim)
Risposta alle domande utente:
- bool esistenti: hidden (invisibile — no), immutable (50%), managed (escluso dalle
  form — no), audited (escluso — no). SystemGenerated NON ESISTE — gap vero nel vocabolario meta
- autowire: il rilevamento è banale (format sequence + seq.uuid bound) — la proposta
  è derivare il bool come `managed` (withColumnConstraints, authors MUST NOT set it)

### TOC step 1 DONE (2026-11-27) — doc-first: entity-meta.mdx full reference
`core/docs/dev-guide/entity-meta.mdx` esteso (111→246 righe): matrice bool a due
assi (visibility vs ownership — overlap hidden/managed dissolto), contratto
system_generated completo (4 punti: create disabled+preview, update come immutable,
mai required, payload omesso), reference di tutte le ~40 props con impatti BE/FE.
system_generated nasce specificato QUI — il codice segue la doc.
PROSSIMO SLICE (implementazione, 4 layer):
1. core/entity-meta.ts — bool system_generated + commento canonico
2. dal-pg/withColumnConstraints — derivazione (format sequence + seq.uuid presente)
3. ui/sequence-input — modo disabled-create: ghost preview forecast in-field + hint,
   zero assist chrome; update invariato (readonly existing)
4. fe-v3/build-entity-form-schema.ts — esenzione required come managed + exclusion
   da synthesizeFormDecl NO: il campo RESTA nelle form (visibile) ma exempt required
5. spec RED viva in crm-customers-autowire.spec.ts aggiornata al contratto nuovo
   (code disabled visibile + submit enabled) → GREEN → prova browser → fe/ deletion

## TOC turn 2026-11-28 — system_generated implementation slice

### DOC RECEIPTS (filled before acting)
| doc:line | what it says | how it applies this turn |
|---|---|---|
| `primebrick-v3-core/docs/ai/workflow.md:17-23` | docs are the contract; code is only the proof | il contratto `system_generated` parte da `entity-meta.mdx`, non dal codice esistente |
| `primebrick-v3-core/docs/ai/workflow.md:48-63` | doubt protocol: docs → user, never guess | qualsiasi contratto ambiguo (preview/hint/disabled) ferma il turno invece di essere indovinato |
| `primebrick-fe-v3/docs/ai/workflow.md:116-123` | E2E specs require pre-read of browser-session + testid docs; 5s budget non-negotiable | vale per l'aggiornamento e l'esecuzione di `crm-customers-autowire.spec.ts` |
| `primebrick-fe-v3/docs/ai/workflow.md:133-140` | BE/FE/job-handler/CRM stay running via detached `dev-stack.ps1` | la spec e la prova del 9 girano sullo stack reale, mai su server effimeri di shell |
| `primebrick-v3-core/docs/dev-guide/entity-meta.mdx:131-139` | ownership matrix: `system_generated` visible+disabled in create/update, never required | è il risultato end-user da codificare nella spec RED prima degli edit implementativi |
| `primebrick-v3-core/docs/dev-guide/entity-meta.mdx:155-184` | `system_generated` deriva da `format:"sequence"` + `seq.uuid`; preview forecast non alloca; payload omesso se untouched | definisce i 4 layer: core tipo, derivazione DAL, widget UI, validazione/payload FE |
| `primebrick-v3-core/docs/dev-guide/entity-meta.mdx:206-210` | `nullable`, `max_length`, `pg_type`, `managed`, `system_generated` sono derived by `withColumnConstraints`; authors MUST NOT set them | la derivazione va in DAL e deve rifiutare override authored |
| `primebrick-v3-core/docs/dev-guide/entity-meta.mdx:226-228` | `seq.uuid` presence implies `system_generated` | detection rule precisa, nessuna euristica alternativa |
| `primebrick-dal-v3/docs/dev-guide/api-reference.mdx:6734-6741` | `@SequenceField` marks a physical business-owned text column sequence-bound; invalid shapes are boot errors | sorgente entity-level del binding che la derivazione deve leggere |
| `primebrick-dal-v3/docs/dev-guide/api-reference.mdx:6116-6122` | only sequence directive shapes are writable; literals rejected, repository resolves in-transaction | il campo disabilitato non deve emettere literal né richiedere directive manuale |
| `primebrick-dal-v3/docs/dev-guide/sequences.mdx:141-147` | `binding_key` is written only by the system when `@SequenceField` materializes; `name` is display data | la preview usa l'identità bound/sequence, non chiavi display inventate |
| `primebrick-v3-ui/docs/dev-guide/sequence-input.mdx:16-31` | `''` means untouched/omitted so the bound default allocates; persisted literal renders through `existing` | crea la distinzione create/update richiesta dal contratto |
| `primebrick-v3-ui/docs/dev-guide/sequence-input.mdx:56-64` | current anatomy: readonly input + assist popover + forecast strip; forecast never allocates | lo slice deve sopprimere l'assist chrome solo per `system_generated` in create, preservando la forecast read-only |
| `primebrick-fe-v3/docs/ai/entity-meta-schema.md:117-130` | physical columns are auto-derived; validation is one core predicate and surfaces own only required exemptions | la validazione FE deve esentare `system_generated` senza reimplementare regole sequence |
| `primebrick-fe-v3/docs/ai/field-hints.md:1-7` | non-error help lives only in label tooltip; inline hint text deprecated | la spiegazione "valore indicativo/generato al save" va nel canale hint governato, non in una riga inline inventata |
| `primebrick-fe-v3/docs/ai/e2e-browser-session.md:12-24` | every Playwright E2E run is headed, no exceptions | la spec GREEN viene eseguita headed come da contratto |
| `primebrick-fe-v3/docs/ai/e2e-browser-session.md:78-99` | 5s expectation budget; hydration gate; probe `localhost` not `127.0.0.1` per IPv6 | la spec userà evidenza DOM e wait budget governati |
| `primebrick-fe-v3/docs/ai/e2e-testid-convention.md:23-44` | testids are semantic, unique, brittle-on-purpose | la spec aggiorna/usa solo testid esistenti o nuovi testid deliberati |
| `primebrick-fe-v3/docs/ai/commit-verification.md:8-23` | every modification turn commits; typecheck alone never verifies; plan updated before commit | chiusura solo dopo spec GREEN + prova reale + ledger allineato |
| `primebrick-fe-v3/docs/gitflow.md:147-156` | agent commit trailer must carry model name | ogni commit userà `Generated by Devin (SWE-2.1 Max)` + Co-Authored-By corretto |
| `primebrick-workspace/ai-plans/PLAN-CONVENTIONS.md:102-113` | update task table as work lands; commit plan changes | il piano resta ledger vivo prima dei commit finali |

### VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-28 14:00 UTC | doc re-read workflow+piano+docs canonici | ✅ done | receipts table above | audit git/status, poi spec RED prima degli edit implementativi |
| 2026-11-28 14:10 UTC | `npx playwright test src/e2e/crm-customers-autowire.spec.ts --workers=1` | ✅ RED atteso | 3/4 pass; create e2e fallisce perché `code` è enabled/readonly invece che disabled — contratto `system_generated` non ancora implementato | implementare core+DAL+UI+FE |
| 2026-11-28 14:22 UTC | typecheck/build core, DAL, UI, FE | ✅ pass | `tsc`/`svelte-check` verdi dopo implementazione dei 4 layer | E2E GREEN |
| 2026-11-28 14:23 UTC | `npx playwright test src/e2e/crm-customers-autowire.spec.ts --workers=1` | ✅ GREEN pre-cleanup | 4/4 pass (37.7s); DB proof `CUST-00272` / `E2E Customer 1795875784814` allocato in write tx | deletion `crm/fe` + verifica CRM |
| 2026-11-28 14:28 UTC | `pnpm test` in `primebrick-us-v3/crm` | ✅ pass | typecheck clean; standards clean; vendor-drift clean (`no fe/dist`); docs-check fresh emit match; 24/24 unit test | risolvere docs generation senza remote chunk |
| 2026-11-28 14:28 UTC | SDK docs-gen typecheck+tests | ✅ pass | fix minimo: pagine standard generate da `src/` anche senza `fe/src`; `system_generated` non required in user docs; docs-gen tests 8/8 | rigenerare docs CRM |
| 2026-11-28 14:29 UTC | `pnpm generate:docs && pnpm docs:check` in CRM | ✅ pass | 20 pagine emesse; `customers-create` ora required solo **Status**, `Code` optional + “generated automatically when you save”; check pulito | E2E finale post-deletion |
| 2026-11-28 14:30 UTC | prima rerun post-deletion | ⚠️ transitorio | create alloca `CUST-00273`, ma lista va 500 durante hot-reload/restart multiplo CRM; debug isolato successivo mostra meta+list+tabella sane | rerun a stack stabilizzato |
| 2026-11-28 14:32 UTC | `npx playwright test src/e2e/crm-customers-autowire.spec.ts --workers=1` | ✅ GREEN finale post-cleanup | 4/4 pass (33.9s); popover pairing, form standard, code visible-disabled+ghost preview, submit enabled, redirect lista, riga allocata | ledger + commit multi-repo |
| 2026-11-28 14:33 UTC | DB read `crm.customers` | ✅ pass | latest rows: `CUST-00274` (run finale), `CUST-00273` (run transitorio), `CUST-00272` (primo GREEN) — allocation server-side ripetuta e monotona | commit |

## Slice closeout C — system_generated + remote chunk death (2026-11-28)

Implementato il contratto user-ratificato end-to-end:

- core: vocabolario `MetaColumn.system_generated` documentato come derived-never-authored.
- DAL: `withColumnConstraints` deriva/enforza `system_generated` dalla coppia fisica
  `format:"sequence"` + identità bound `seq.uuid`; authored override rifiutato.
- UI: `sequence-input` ha modo generated-preview: campo visibile ma disabled in create,
  ghost forecast in-field, zero assist chrome; update resta literal readonly.
- FE: validazione esenta i generated untouched dal required fisico; il payload omette
  il campo untouched. Fix correlato: nullable refs mai toccate restano omesse; `null` è
  scritto solo quando l'utente svuota un valore preesistente.
- CRM: `crm/fe` eliminato (stub create remoto morto); `package.json` ripulito dal
  veicolo remote; test nav aggiornati alla semantica authored-cosmetic/derived-routes.
- SDK docs-gen: deletion `fe/` ha rivelato un gap infrastrutturale — le pagine standard
  non devono dipendere da `fe/src`. Ora la generazione pagine si ancora alla sorgente
  `src/` del servizio; `fe/src` resta solo extraction dei remote facts. Renderer docs
  allineato: `system_generated` non è required e viene spiegato come generated at save.

Evidenza finale: spec `crm-customers-autowire.spec.ts` GREEN 4/4 dopo cleanup;
DB proof `CUST-00274` allocato dal write transaction nella run finale.

Post-closeout dependency cleanup: removing the dead CRM remote build chain exposed a second docs-gen coupling — the Svelte compiler was loaded even when no `fe/src` existed. SDK now loads DB/TS drivers separately and resolves the Svelte compiler only for remote-fact extraction. Final CRM verification after dependency removal: `pnpm test` GREEN (standards + vendor-drift + docs:check + 24/24 unit).
