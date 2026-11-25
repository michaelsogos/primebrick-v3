# Plan: arch-nats-durability-campaign

**Branch**: `arch/nats-durability` (da creare) | **Stato**: FASE 1 — TIC censimento
**Dottrina ratificata dall'utente**: per questo prodotto NESSUN messaggio è non-mission-critical; la perdita silenziosa di un payload non è mai accettabile → **qualsiasi uso di NATS non-durable va bloccato by default**. Il censimento precede ogni scelta.
**Origine**: cascata bigint → census.callables stale in JH → scoperta che lifecycle + fire paths viaggiano core-NATS fire-and-forget mentre entity-events/webhooks sono già JetStream-durable. Contraddizione di fabbrica da risolvere una volta per tutte.

## Scope incluso (tutto, chiusura a cerniera)
1. FASE 1 — studio motore/naming/registration/lifecycle da doc + censimento completo pub non-durable tutti i repo (QUESTO FILE)
2. FASE 2 — lifecycle durable: register/unregister/heartbeat → JetStream; census distribution: Redis read-through nel BE davanti a service_registry + L1 in-memory con TTL disciplinato + negative-trigger nei consumatori (+ emitSubjects)
3. FASE 3 — campagna fire-and-forget: migrazione fire paths (emailsender.send primo) a JetStream durable secondo il censimento
4. I1 — cascata us-v3 bigint (27 errori tsc: job-handler 21, ai 4, boilerplate 1, emailsender 1) + dedupe config-entries ×3 (decisione architetturale SEQ-lock-like vs inheritance)
5. I3-fix — spec elt migrate a preset popolato + copertura empirica prova-del-9 di TUTTE le viste outcome
6. I4 — investigazione resumable-fetch (mock degradation vs bug reale)

---

## FASE 1 — DOC STUDY (lifecycle/registration/naming)

(in progress — i ritrovamenti si appendono qui)

## FASE 1 — CENSIMENTO NATS non-durable per repo

Legenda classificazione:
- **REQREP** — request/reply sincrono: il caller sa subito se fallisce, perdita non silenziosa — categoria separata dal fire-and-forget
- **F&F-pub** — publish fire-and-forget: PERICOLOSO, perdita silenziosa possibile
- **F&F-sub** — subscription core-NATS: il lato consumo; pericoloso se il pub è F&F
- **DURABLE** — già JetStream: conforme
- **BCAST** — broadcast lifecycle/presenza: fire-and-forget per costruzione

(per repo, in progress)

### FASE 1 — ritrovamenti doc (completato blocco 1)

**La doc canonica DOCUMENTA il difetto come design** (`nats-client.mdx`): `emailsender.send` è l'esempio canonico di "work item" su core-NATS queue subscription; broadcast lifecycle documentati come core-NATS. Il gap è nella dottrina scritta, non solo nel codice — la campagna deve riscrivere la dottrina nelle doc, non solo migrare subscription.

**Lifecycle contract** (`service-registration.mdx`): register/heartbeat(30s)/unregister + `service.stale` watchdog + `service.gateway_online` — il BE al boot broadcasta e ogni servizio si re-registra: self-heal parziale ESISTE per il caso restart-BE (e come effetto collaterale inonda i consumer di delta freschi). Il buco residuo: consumer down/restart SENZA restart del BE, e ogni finestra di disconnessione NATS.

### FASE 1 — CENSIMENTO blocco 1 (primitive + publisher) — risultati

**SMOKING GUN strutturale** — la catena fire dei job è durable OVUNQUE TRANNE CHE ALL'ULTIMO MIGLIO:
- `triggers-engine.ts:290` — commento esplicito: "jetstreamPublish, not core publish" → il forward interno è JetStream-durable. Qualcuno SAPEVA.
- `due-forwarder.ts:282` — il forwarder consuma durable ma consegna al target finale (`envelope.target` = es. `emailsender.send`) con `NatsClient.publish` CORE fire-and-forget. **Se il target è down, il lavoro si perde dopo essere sopravvissuto a tutto il resto della catena.** La durability costruita a monte viene gettata alla consegna.

**Censimento publisher core-NATS per repo:**

| Repo | Subject | Tipo | Mission-critical? |
|---|---|---|---|
| be | `emailsender.send` (email-sender.ts auth) | F&F work-item | **SÌ — email di auth/sistema perse silenti** |
| be | `client_shield_registry.changed` | BCAST invalidazione | SÌ — miss = cache stale di sicurezza |
| be | `config.changed` | BCAST invalidazione | SÌ — miss = config stale |
| be | `service.gateway_online` | BCAST lifecycle | medio — è esso stesso un meccanismo di heal |
| be | `service.stale` | lifecycle watchdog | SÌ — semantica di stato servizi |
| be | presence/collab publishes | BCAST effimero | **DA CLASSIFICARE** — vedi sotto |
| be | telemetry.ts | osservabilità | **DA CLASSIFICARE** |
| sdk | presence deltas + entity-changed markers (presence/nats-subjects.ts:46,60) | BCAST collab | **entity-changed guida merge/lock state — SÌ; presence heart effimero — forse l'unico lossy-legit** |
| sdk | `secret.rotated` | BCAST sicurezza | **SÌ — miss = secret stale nei consumatori** |
| sdk | `service.heartbeat` / `service.unregister` (+ register) | lifecycle | SÌ — semantica stato servizi |
| us | `envelope.target` delivery (due-forwarder) | F&F work-item | **SÌ — il fire dei job** |
| us | `emailsender.response.<id>` | F&F response | medio — response pattern, il caller ha timeout |
| us | `jobs.ctl.triggers.changed` | BCAST invalidazione | SÌ — stessa classe |

**Già conformi (JetStream-durable)**: entity-events dal/sdk, sequence-revive, partition-maintenance, webhook inbound emailsender, forward interno triggers-engine, crm fake-event-emitter.

**REQREP** (categoria separata — perdita non silenziosa per il caller): `service.registry.get`, auth.*, system.dict.get, ecc. — da censire ma non violano la dottrina se il timeout è gestito.

### FASE 1 — blocco 2: la scoperta che raffina la dottrina (consumatori invalidazioni)

**Il pattern invalidazione è GIÀ hint+repull**: `config.changed` broadcast porta solo `{keys}` — nessuno stato. I consumatori ri-fetccano via `config.get` REQREP (affidabile) e applicano. La verità vive in PG, il broadcast è solo un hint di latenza. STESSO pattern per shield-registry e secrets.

**Conseguenza architetturale profonda**: per le invalidazioni la cura NON è JetStream — è **TTL+repull nei consumatori**. Con il TTL il broadcast diventa genuinamente lossy-legit (passa tutte e 3 le condizioni del criterio: zero stato portato, auto-superante al prossimo tick, perdita invisibile perché il TTL chiude il buco a prescindere). JetStream su broadcast a N consumatori richiederebbe N durable consumer — complessità sproporzionata per messaggi che non portano stato. **Le work-item invece (fire job, emailsender.send) non hanno questa via di scampo: il work item È lo stato, non c'è niente da ri-pullare — JetStream durable non negoziabile.**

### LA DOTTRINA RAFFINATA (proposta per ratifica — da scrivere in nats-client.mdx)

| Classe | Trasporto | Ragione |
|---|---|---|
| **Work item / eventi portatori di stato** (fire job, callable send, entity events, lifecycle register/unregister) | **JetStream durable — SEMPRE** | il messaggio È lo stato; perdita = fallimento sistemico silenzioso |
| **Invalidation hints** (config.changed, shield.changed, secret.rotated) | core-NATS legittimo **SOLO SE** il consumatore ha TTL+repull disciplinato | lo stato è re-pullable da PG; il broadcast è hint di latenza |
| **Ephemeral presence** (heartbeat/typing) | core-NATS — eccezione governata documentata | passa il test a 3 condizioni per costruzione |
| **REQREP** | core-NATS OK | perdita visibile al caller via timeout |

### ENFORCEMENT per costruzione (ratifica utente: publish FnF non esposto)

Design proposto:
1. `NatsClient.publish` **eliminato dalla superficie pubblica** — rinominato `publishEphemeralLossy` con docstring deterrente esplicito. `jetstreamPublish` rinominato/alias `publish` → **il default è durable**, la scorciatoia non esiste più
2. check-standards lint rule `no-fnf-nats-publish`: banna `publishEphemeralLossy(` e `nc.publish(` e `.publish(` su connessioni nats raw — `allowPaths` dichiara le sole eccezioni (presence heartbeats, invalidation hints dopo migration TTL)
3. raw `getConnection()` resta per REQREP/subscribe interne — la lint copre l'uso diretto di publish
4. stessa disciplina subscription side: `subscribe` core solo per le classi legittime

### Censimento da completare (blocco 3)
- inventory REQREP completo (conferma che il timeout sia sempre gestito)
- presence internals: separare heartbeat/typing (effimero) da entity-changed (durable!)
- collab service nel be: cosa pubblica esattamente
- telemetry: verifica alerting-dipendenza

### FASE 1 — censimento blocco 3 (completato — inventory finale)

**Presence internals — la separazione è netta a livello API** (sdk presence/nats-subjects.ts):
- `publishPresence` — presence delta (chi sta editando cosa): **effimero per design**. E soprattutto: presence ha GIÀ la reliability alternativa — Redis TTL per entry + keyspace-listener su expiry per ghost cleanup + SSE-liveness refresh ("best-effort: a failed TTL refresh only shortens ghost lifetime"). Passa il test a 3 condizioni per costruzione → **resta core-NATS, eccezione governata** (come ratificato)
- `publishEntityChanged` — entity-changed marker: guida merge/conflict state del collab editing. Fallisce condizione 1 del criterio → **JetStream durable**

**Telemetry**: il publish di config.changed è già avvolto in try/catch con commento "NATS down?" — sapevano della perdita silenziosa anche qui. Telemetry stessa non è NATS-pub mission critical (è osservabilità push verso OTLP, non via NATS subjects) — da verificare in blocco successivo se esistono subjects telemetrici.

**REQREP inventory** (core-NATS accettabile — timeout visibile al caller):
- be responders: `auth.apikey.byHash`, `auth.ctl.resolve_user`, `service.registry.get`, `system.dict.get`, `system.translations.find` (internal-request-routes), + secrets engine responders
- us responders: `jobs.ctl.triggers.materialize` (job-handler), crm fake-event emitters
- sdk infra: shared-config (`config.get`), service-shield, callables-declaration, callable-registry
- NOTA: le registration lifecycle (`service.register` al BE) — la doc dice "the queue also prevents duplicate replies" → implica REQREP anche per register! Da verificare: se register è REQREP, il publish-con-ack esiste già e la durability del lifecycle è meno critica del previsto — MA il caller (servizio) sa solo che il BE ha ricevuto; la propagation ai consumer resta broadcast F&F.

### Censimento — gap residui per blocco 4 (se serve)
- subscriptions side completa (chi consuma cosa — la maggior parte inferibile dal publish-side)
- us services minori (boilerplate/webhook) publisher non ancora enumerati se esistono
- verifica `service.register` REQREP vs F&F (cambia la classificazione del lifecycle!)

### Sintesi decisionale pronta per FASE 2
1. **JetStream migration — prima ondata** (work-item puri): `envelope.target` delivery in due-forwarder, `emailsender.send` publisher in be auth, entity-changed collab markers
2. **TTL+repull — seconda ondata** (hints): config.changed consumers (shared-config.ts), shield-registry, secret.rotated → il broadcast resta core come hint lossy-legit DOPO che i consumatori hanno TTL
3. **Enforcement**: rename publish→publishEphemeralLossy, jetstreamPublish→publish, lint no-fnf-nats-publish + allowPaths
4. **Eccezione presence**: documentata, allowPath specifico
5. Lifecycle: decidere dopo verifica REQREP-ness di register — se REQREP, la posta in gioco è solo la propagation ai consumer (broadcast) — TTL catalog nei consumer (già analizzato con I2) resta la cura strutturale

### FASE 1 — censimento blocco 4 (esaustivo — chiusura censimento)

**Catch-all `.publish(` su tutti i repo: NESSUN publisher nascosto** — la lista conferma esattamente il censimento dei blocchi 1-3, zero sorprese.

**Per servizio us (mappa completa)**:
| Servizio | NATS usage | Stato |
|---|---|---|
| boilerplate | zero publisher | conforme |
| webhook | solo JetStream + callNats | conforme |
| ai | solo callNats ×2 | conforme |
| crm | JetStream (fake-event-emitter) + callNats | conforme |
| emailsender | sub di emailsender.send core + publish response core | **da migrare (sub side del fire)** |
| job-handler | due-forwarder delivery core + jobs.ctl.triggers.changed core | **da migrare — il buco critico** |

**Stream topology esistente**: `ENTITY_EVENTS`, `JOBS_STREAM`, `WEBHOOK_STREAM` — create via `NatsClient.ensureStream(name, subjects, config)` (primitive completa). La migrazione aggiungerà stream o estenderà la topologia esistente — decisione FASE 2.

**Macchinari sdk completi (la campagna è applicazione, non invenzione)**:
- `jetstreamPublish` — ack + seq bigint ritornato
- `jetstreamSubscribe` — durable consumer completo: batch/fetchExpires/ackWait/maxDeliver/maxAckPending tunables + auth verify hook
- `ensureStream` — stream management
- dedup hot-reload subscription già gestito (subject::queue dedup per bun --hot)

**Consumer-side critici**:
- `config.changed`: i consumatori us passano TUTTI da sdk `shared-config.ts` — **un solo punto di fix TTL per tutta la flotta**. BE-side: index.ts, config-entries.service.ts, telemetry.ts
- entity-events SSE feed: be consuma durable già ora
- entity-changed collab markers: publishPresence/publishEntityChanged distinti a livello API — la classificazione può applicarsi per-export, non per-individuazione-callsite

**REQREP timeout audit**: tutti i callNats censiti passano timeoutMs esplicito (es. register 3000ms) — la categoria è conforme alla dottrina.

## CENSIMENTO COMPLETO — la mappa finale a una pagina

**Da migrare a JetStream (FASE 3, ordine per gravità)**:
1. `due-forwarder` delivery → envelope.target (il fire dei job — il buco critico dell'ultimo miglio)
2. `emailsender.send` publisher be-auth + subscription emailsender (la coppia fire completa)
3. `publishEntityChanged` collab markers (merge/conflict state)
4. lifecycle propagation consumatori — risolta NON via JetStream ma via TTL+negative-trigger catalog (I2) perché broadcast-a-N su JetStream è complessità sproporzionata e lo stato è re-pullable

**Restano core-NATS per design (lossy-legit dopo cure collaterali)**:
- presence heartbeat/typing (eccezione governata, già affidabile via Redis TTL)
- config/shield/secret invalidation hints — SOLO DOPO che i consumatori hanno TTL+repull
- heartbeat servizi (auto-superante), REQREP (timeout gestito)

**Enforcement (FASE 2 preliminare)**: rename publish→publishEphemeralLossy, jetstreamPublish→publish, lint no-fnf-nats-publish + allowPaths — PRIMA delle migrazioni così nessun nuovo F&F entra mentre migriamo.

---

# FASE 2 — DESIGN DOCUMENT (per ratifica utente)

## D2.1 — Meccanica di migrazione zero-loss (semantica NATS verificata)

Proprietà chiave JetStream: **la cattura è per-subject, non per-API-publisher**. Un publish core su un subject catturato da uno stream VIENE memorizzato nello stream comunque; `js.publish` serve solo per il PubAck (seq/dedupe lato publisher). Conseguenza — la migrazione non richiede lockstep:
1. `ensureStream` per primo → da quel momento OGNI publish (anche core legacy) viene catturato
2. consumer migra a durable quando pronto — unico accorgimento: unsubscription core contestuale all'avvio del durable per evitare doppia consegna nella finestra di overlap
3. publisher migra a `js.publish` per ultimo, indipendentemente
**REGOLA DI TOPOLOGIA (dal commento JOBS_STREAM)**: i subject REQREP non devono MAI essere catturati da stream — il PubAck impersonerebbe la reply di correlazione. Wildcard narrow sempre.

## D2.2 — CRITICAL FINDING: idempotenza consumer obbligatoria

JetStream è **at-least-once**: redelivery dopo ack-timeout, restart mid-processing, nak. Il core F&F odierno è at-most-once — il problema duplicati NON ESISTE OGGI e nasce con la migrazione. Verificato: `email-send.ts` NON ha nessun guard su requestId — una redelivery manderebbe l'email due volte. **Ogni consumer migrato deve avere idempotency-by-requestId** (dedupe table o unique constraint naturale):
- emailsender: dedupe su `requestId` — sender_log ha già request_id? DA VERIFICARE in FASE 3; se sì, unique constraint + INSERT ON CONFLICT DO NOTHING come guard di costruzione
- due-forwarder targets generici: il contract callable ha già requestId nel payload schema — la dedupe è responsabilità del consumatore per-contratto, la piattaforma fornisce l'helper
- entity-changed collab: i marker hanno version — dedupe naturale (versione già vista = skip)

## D2.3 — Stream topology proposta

| Stream | Subjects catturati | Razionale |
|---|---|---|
| `JOBS_STREAM` (esistente) | jobs.schedule.>, jobs.due.>, jobs.result.>, jobs.cancel.> | immutato |
| `EMAILSENDER` (nuovo) | `emailsender.send` (ESATTO — non wildcard: `emailsender.response.>` è REQREP-corrispettivo e NON va catturato) | service-owned, come WEBHOOK_STREAM per webhook |
| `ENTITY_CHANGED` (nuovo) | `entity.*.*.changed` | collab markers — retention limits-policy breve (sono superseding per version) |

Domanda aperta Q-D1: `emailsender.send` catturato in stream service-owned `EMAILSENDER` vs stream condiviso `CALLABLES` per tutti i callable futuri? Io propendo service-owned (precedente webhook, isolamento failure-domain) — il pattern scala: ogni servizio con callable dichiara il suo stream come dichiara i callable stessi.

## D2.4 — Ordine di lavoro proposto (work packages)

- **WP0 enforcement-first**: rename `publish`→`publishEphemeralLossy` + `jetstreamPublish`→`publish` in sdk + lint `no-fnf-nats-publish` + allowPaths. Blast radius stimato ~15 file (censimento). CI protegge da nuovi F&F durante tutta la campagna
- **WP1 fire path**: ensureStream EMAILSENDER (boot emailsender) → consumer emailsender migrate a jetstreamSubscribe (template webhook-subscriber) + idempotency guard requestId → publishers (be auth email-sender, due-forwarder) migrano a publish durable. **Verifica E2E: kill emailsender → fire → restart → email consegnata**
- **WP2 due-forwarder generalizzato**: la consegna envelope.target diventa durable per OGNI callable — design: il catalog dei callable guida quali subject vengono catturati (stream config dinamica? ogni servizio dichiara il suo stream all'avvio — syncSubjects esiste già in JOBS_STREAM!)
- **WP3 entity-changed collab**: stream ENTITY_CHANGED + consumer be durable + dedupe per version
- **WP4 TTL+repull invalidations**: sdk shared-config.ts TTL 5min + shield-registry + secrets — i broadcast restano core come hint (dottrina ratificata)
- **WP5 catalog lifecycle consumatori (I2)**: TTL 5min + negative-trigger in callable-catalog.ts + emitSubjects
- **WP6 doctrine docs**: riscrittura nats-client.mdx con dottrina 4-classi + service-registration.mdx + enforcement rule doc

## Domande per l'utente (bloccanti per TOC)

- **Q-D1**: stream per-servizio vs condiviso CALLABLES? (io: per-servizio)
- **Q-D2**: WP0 rename è breaking su ~15 file in 4 repo — tutto nella stessa PR/branch o commit sequenziali per repo? (io: un branch, commit per repo in ordine sdk→be→us)
- **Q-D3**: idempotency emailsender — verifico se sender_log può ospitare la unique su request_id o serve dedupe table dedicata? (investigo in TOC, ma la strategia ON CONFLICT va ratificata)
- **Q-D4**: retention degli stream — proposta: workqueue policy per callable (consumato = eliminato) vs limits con TTL? Io propendo **workqueue** per i fire (semantica esatta del work-item) e **limits 24h** per entity-changed (replay window per consumer restart)
- **Q-D5**: le onde WP4/WP5/WP6 in questo piano o piano separato? Il piano è già grande — io terrei tutto qui come da tua decisione "cerniera e tutto"

## D2.5 — CORREZIONE ARCHITETTURALE UTENTE (ratificata — sostituisce D2.2/D3)

### Il contratto ACK corretto: ACK = PRESO IN CARICO, non eseguito

NATS non deve sapere nulla del side effect esterno. L'ack comunica una sola cosa: "il task è stato preso in carico in modo durevole". La semantica corretta del flusso callable:

```
1. consumer riceve il fire
2. PERSISTE LO STATO DEL LAVORO nel proprio dominio (sender_log con stato iniziale "pending")
   — l'insert stesso è il dedupe: UNIQUE(request_id), conflitto = redelivery → salta al passo 4
3. ACK — solo ora, dopo il persist: "preso in carico"
4. l'ESECUZIONE (chiamata Brevo) è asincrona e responsabilità del servizio:
   state machine su sender_log (pending → sending → sent/failed)
   + sweep-on-restart dei record pending/incomplete — il servizio rende reliable SE STESSO
```

**Perché questo chiude la finestra di redelivery molto meglio del mio approccio**: l'ack arriva dopo millisecondi (un insert locale), non dopo 3 secondi di chiamata SMTP. La redelivery resta possibile solo per crash-tra-ricezione-e-persist — finestra minuscola — e anche in quel caso il dedupe la copre: al re-deliver, l'insert va in conflitto → ack senza riprocessare. Crash-dopo-ack-prima-dell'esecuzione? Coperto dal sweeper, non da NATS: **la verità dello stato di esecuzione vive nel dominio, non nel broker**. NATS è solo il meccanismo di consegna della presa in carico.

### Il dedupe a due layer — la distinzione che mi era sfuggita

- **Domain-native (per servizio)**: sender_log fa dedupe come effetto naturale della presa in carico — È logica di dominio, vive nel dominio, corretto che stia lì. Non è "dedupe sistemico su PG": è il record di lavoro del servizio che per costruzione non può esistere due volte.
- **Systemic (SE serve per consumatori generici senza record di dominio naturale)**: MAI su PG entity logic — le chiavi di dedupe sono metadata effimeri di trasporto, non stato di dominio. Sede corretta: **REDIS** con TTL calibrato sulla finestra di redelivery (ackWait × maxDeliver + margine — ore, non giorni), completamente avulso dalle logiche entity. Garanzia di sistema, non del dominio. Da valutare in WP2 (due-forwarder/callable generici) se serve davvero — per consumer che hanno un record di lavoro naturale non serve affatto.

### Il principio generalizzato (da scrivere nella dottrina)

Ogni consumer durable deve rispondere a: "dov'è lo stato di questo lavoro dopo che ho dato ack?" — se la risposta è "da nessuna parte", il design è sbagliato. L'ack sincrono sul side effect esterno (il mio approccio iniziale) è un anti-pattern: lega la finestra di redelivery alla latenza del sistema esterno e spinge la responsabilità di reliability sul broker invece che sul servizio.

### D4 ratificato: ENTITY_CHANGED retention limits 1h (non 24h — finestra blip operativo)

---
# TOC — execution log

## Branch strategy: `arch/nats-durability` creata da `feature/ext-json-strict-codec` in sdk/be/us (dipendenza dal bigint cascade). Commit sequenziali sdk→be→us per D2.

## Decisioni finali ratificate: chiave dedupe `stream:seq` transport-native; lease ackWait 30s / heartbeat 10s / DONE-TTL 6h; retention entity-changed 1h; stream per-servizio; dedupe sistemico in jetstreamSubscribe wrapper sdk (Redis WACK/DONE state machine, inProgress automatico, dev trasparente).

## WP0 — enforcement-first (in corso)

### WP0 — DONE (committed sdk/be/us su arch/nats-durability)
- rename eseguito: `NatsClient.publish`→`publishEphemeralLossy` (lossy, deterrent), `jetstreamPublish`→`publish` (durable default)
- lint `no-fnf-nats-publish` in tools/check-standards.ts (GATED) — verificata positiva+negativa empiricamente
- config attivate: sdk (4 allowPaths interni), be (6), us job-handler (2) + emailsender (1)
- sdk tests 626/626 verdi, build verde, tsc be verde; us: crm/webhook puliti, emailsender/job-handler errori SOLO bigint-I1 sospeso (preesistenti, non dal rename)
- NOTA: commit us ha incluso docs/user-guide generated preesistenti untracked (crm/emailsender/job-handler) — artefatti di generazione doc benigni, non parte della modifica
- i siti allowlistati destinati a migrare a durable (WP1/WP2): be modules/auth/services/email-sender.ts, us emailsender controllers/nats-sub/email-send.ts, us job-handler services/due-forwarder.ts — devono USCIRE dall'allowlist alla migrazione

## WP1 — emailsender migration (IN CORSO) — step tecnici
1. sdk: wrapper dedupe sistemico in jetstreamSubscribe — Redis state machine WACK/DONE, chiave stream:seq, inProgress automatico, lease 30s/heartbeat 10s/DONE-TTL 6h. Serve accesso Redis nell'sdk: verificare come sdk accede a Redis oggi (cache-port-holder nel be — sdk ha client redis proprio? VERIFICARE)
2. emailsender: stream EMAILSENDER workqueue cattura `emailsender.send` (+ `emailsender.response.>` NO — responses vedere design), consumer migrato a jetstreamSubscribe con wrapper
3. sender_log: aggiungere colonna request_id UNIQUE (patch db-meta) — presa in carico = INSERT pending poi ack; state machine pending→sending→sent/failed; sweeper on-boot + interval per pending/incomplete
4. be: publisher auth email-sender.ts migrato a publish durable → esce da allowlist
5. response path: `emailsender.response.<requestId>` resta effimero? — la response è per il caller sincrono; con il fire durable la response diventa asincrona — valutare: il be auth NON attende response oggi? VERIFICARE il flusso

### WP1 progresso — sdk dedupe wrapper DONE (committed)
- implementato in jetstreamSubscribe: gate Redis `natsjs:dedupe:<stream>:<seq>`, stati WACK(implicit timestamp)/DONE, heartbeat 10s con working()+lease refresh, DONE 6h prima di ack, del-key su failure, fail-closed su redis error, warn-and-process se redis assente
- sdk 626/626 test verdi, tsc pulito — committed
- VERIFICA RUNTIME MANCANTE: serve test E2E con nats+redis live (redelivery → no re-execute) — da fare prima della chiusura WP1
- prossimi step: 1) emailsender ensureStream EMAILSENDER workqueue + migrazione consumer 2) sender_log patch request_id UNIQUE + state machine + sweeper 3) be publisher durable 4) response-flow decision

### WP1 — DESIGN STRUTTURALE CRITICO: durable nella factory makeNatsRoutes
Il consumer emailsender usa `makeNatsRoutes` (factory che registra endpoints.callables + shield verify + payload_schema validation). La migrazione durable NON può essere hand-rolled per servizio — perderebbe la registration. DESIGN:
- makeNatsRoutes guadagna opzione per-route `durable: true` — la factory internamente usa jetstreamSubscribe invece di core subscribe, stesso verify/handler/validation wiring
- stream per-service: `<SERVICECODE uppercase>` (es. EMAILSENDER), retention workqueue, subjects = tutti i subject durable del servizio (aggregati dalla factory in una sola ensureStream)
- workqueue + consumer multipli OK perché filter_subject disgiunti per route (vincolo nats: overlapping filters vietati, disjoint OK)
- durable name = `<servicecode>-<subject sanitized>`
- chi crea lo stream: la factory stessa a boot (ensureStream idempotente) — publisher indipendente grazie a capture-per-subject
RESPONSE PATH: `emailsender.response.<requestId>` resta core/effimero (è correlazione per caller live; il fire è durable ma la response no — chi ascolta è online per definizione o perde interesse)
SENDER_LOG state machine: request_id UNIQUE colonna nuova; handler INSERT pending (presa in carico) → poi dispatch brevo async → update sending/sent/failed; sweeper on-boot + interval 60s riprende pending/sending incomplete

### WP1 progresso 2 — factory durable + isTerminal DONE (committed sdk)
- NatsRoute.durable:true → subscribeDurableRoute: stream `<SERVICECODE uppercase sanitized>` workqueue, union-merge subjects, durable name `<svc>-<subject sanitized>`, verify adapter (AuthError/RbacDenied→null terminal), isTerminal ValidationError, handler adapter con runContract
- jetstreamSubscribe.isTerminal hook: term() invece di nak-loop per poison messages, lease rilasciato senza DONE (terminal≠success)
- ensureStream retention passthrough (limits/workqueue)
- tsc+test+standards verdi
- PROSSIMO TURN: emailsender migrazione vera — 1) email-send.ts: aggiungere `durable: true` alla route (una riga — la factory fa tutto) 2) sender_log patch request_id UNIQUE + state machine + sweeper 3) be email-sender.ts publisher→publish durable + uscita allowlist 4) runtime verification con dev servers (publish kill-consumer redelivery dedupe) 5) poi WP2 due-forwarder (stessa una-riga via durable:true ma serve census triggers fire chain check)

### WP1 progresso 3 — emailsender migration DONE (committed be+us)
- email-send.ts durable:true; handler = acceptSend + detached dispatchRow; response publish spostato in dispatch completion
- sender_log patch 20270102100000 (request_id UNIQUE + request_payload jsonb) firmata dev-micha-3
- email-service.ts riscritto: acceptSend/dispatchRow/sweepPending state machine; sendEmail legacy compone i due per i test (34/34 verdi)
- sweeper boot+60s in index.ts; stale-sending 10min re-dispatch (duplicate-risk > loss per dottrina)
- be publisher emailsender.send → durable publish, uscito da allowlist; es allowlist: email-service.ts (outcome response legit-ephemeral)
- MANCANTE: runtime verification E2E (kill consumer → redelivery → no re-execute; crash post-accept → sweeper recovery) — PROSSIMO STEP

### WP1 — RUNTIME VERIFICATION (parziale, live stack 2026-11-25)
PROVATO LIVE:
- EMAILSENDER stream creato dalla factory al boot: subjects ["emailsender.send"], retention workqueue ✅
- capture→consume chain: publish probe → delivered:1 ack_floor:1, stream svuotato (workqueue semantics) ✅
- denial TERMINAL: publisher non autenticato → UNIDENTIFIED_CLIENT → term, `redelivered: 0` — anti-loop verificato empiricamente ✅
- be restartato con publisher durable (health 200), emailsender idem — stack vivo e detached
NON ancora provato (richiede fire autenticato reale):
- positive path: fire valido → acceptSend → pending row → dispatch async → sent/failed + outcome response
- dedupe-on-redelivery a runtime (chiavi Redis natsjs:dedupe)
- sweeper recovery dopo crash
TRIGGER per la prova finale: reset password/invito dalla UI, oppure probe script in be con buildNatsAuthHeaders (prossimo turno)
FIX MINOR notato: la log line "Subscribed to emailsender.send" in email-send.ts è fuorviante (sembra una seconda subscription core — è solo log legacy, la subscription reale è solo quella durable della factory)

## CHECKPOINT 2026-11-25 (fine sessione — E2E PROVATO)

### WP1 emailsender — POSITIVE PATH VERIFICATO LIVE (17:00 UTC)
- probe6 (trigger author-lane admin reale): job_runs=succeeded, sender_log row
  request_id=probe6-fixed-0001 status=failed (Brevo no-rete dev — atteso),
  dedupe key natsjs:dedupe:EMAILSENDER:7 in Redis.
- Catena provata end-to-end: arm, fire, forwarder, stream capture, durable consume,
  shield/user/RBAC/contract pass, acceptSend INSERT taken-charge, ack, dispatch async,
  outcome report.

### FIX SISTEMICO TROVATO E COMMITTATO (ac6d434 us-v3)
- BUG PREESISTENTE: 2050 run fallite dal 19 nov — AUTH_CLIENT_SHIELD_SECRET_INVALID.
  Root cause: forwarder ripubblicava header arm-time verbatim; rotating secret
  (orario, grace 5min) moriva prima del fire. Fix: re-stamp fire-time in due-forwarder.
- system lane per design NON passa callable user-gated — serve author/originator lane.
- DECISIONE APERTA PER MICHA: system lane verso callable user-gated — il BE usa
  systemAuthUser sintetico; valutare se trigger system-lane debba stamparlo uguale.

### Note dev-loop
- dev-stack restart: bun --hot respawna child, pidfile diverge — kill per netstat pid+parent.
- triggers.changed shielded: insert manuali richiedono restart JH.
- probe cleanup fatto (probe6 deleted).

### Prossimi step
- WP2 due-forwarder durable migration (sbloccato — fix auth era prerequisito)
- sequence_revive materialize failed: ext-json unclosed @0 — errore preesistente separato
- WP3 entity-changed, WP4 TTL invalidations, WP5 catalog, WP6 docs
- Ripulire log line legacy in email-send.ts (doppia riga subscribe)

## DESIGN RATIFICATO 2026-11-25/26 — architettura sicurezza+durability unificata

D discussione completa con Micha. Questi sono i pilastri concordati — ogni WP sotto
implementa un pezzo di questo disegno, niente è standalone.

### Pilastro 1 — split-key AEAD encryption (IL KEYSTONE)
- payload + user-header DENTRO busta cifrata AES-256-GCM; sul wire solo subject + blob opaco
- chiave = derive(parte_A service-local injected MAI in repo/PG, parte_B in PG config table
  letta SOLO via DAL diretto — MAI transitare su NATS/config.broadcast!, generation)
- dual-control: serve compromissione DOPPIA indipendente (service+PG) per decifrare
- AEAD dà autenticità gratis: niente più freshness-header rotating nel user-layer
- KEY RETENTION = MESSAGE RETENTION + margine rotation (containment bidirezionale):
  chiavi vecchie versionate in PG finché vivono i messaggi che cifrano; al purge dei
  messaggi muore la generazione — forward secrecy a scaglioni
- derivation per generazione (infrastruttura ESISTENTE inutilizzata: deriveClientKey,
  key_mode derived, generation handshake nel registry) — estendere quella, non parallelare

### Pilastro 2 — governance RBAC dichiarativa
- _system_process sentinel (naming serie _public/_authenticated_user/_authenticated_admin)
- RIMOZIONE bypass isSystem da checkRbac — RBAC sempre in gioco, system passa SOLO
  dove la route dichiara il sentinel; endpoints non-dichiarati = user-ware only per costruzione
- vincolo costruttivo trigger: creato da SYSTEM actor → run_as SOLO system;
  author/originator richiedono creatore umano risolvibile
- isSystem API-key eredita lo stesso perimetro (backdoor dormiente chiusa per costruzione)
- nota dottrinale: isAdmin resta bypass ma è accettato — authority esterna, scadenza,
  identità reale attribuita, audit trail. Il problema era solo il FORGERY non governabile

### Pilastro 3 — durability contract onesto
- retention bound ESPLICITO per stream (Micha: ~7 giorni — DA RATIFICARE il numero)
- durable = contingenza/revive entro il bound, NON eternità
- workqueue cancella su ack (niente pressure) — già implementato
- nessuna freshness-proof sui messaggi: user-header sono DATI nella busta cifrata

### Pilastro 4 — perimetro fabric
- NATS SIMPLE auth: UNA credenziale condivisa di fabric injected at deploy, in nats-server.conf
  — chiude il foreign-client VLAN puro (ack-theft, stream vandalism, purge)
  — NO full per-service ACL (overhead ingiustificato)
- MOTIVAZIONE registrata: crittografia copre lettura/forgery ma NON custody/distruzione
  (ack-theft silenzioso = anti-durability perfetta, solo il fabric lo impedisce)

### Pilastro 5 — endgame futuro (registrato, non in scope)
- EXTERNAL AUTHORITY verification alla registration (SPIFFE/cloud-attestation pattern):
  il root of trust vive FUORI dal sistema — chiude emulazione-via-SDK
- residuo accettato nel frattempo: SDK emulation con compromissione multipla completa

### Dev=prod
- static key in dev config_entries (4ee3d069...) = CAZZATA DA RIMUOVERE (verdetto Micha)
- derivation secret injected in entrambi gli ambienti — dev lavora come prod

### Ordine di lavoro ratificato
- WP-A encryption foundation sdk (keystone — tutto dipende dal wire format)
- WP-B _system_process + rimozione bypass + sweep dichiarazioni
- WP-C retention bounds + vincolo trigger
- WP-D WP2 forwarder migration sopra le fondamenta corrette
- WP-E SIMPLE NATS auth (infra)
- WP-F..WP-Z: WP3-6 campagna originaria (entity-changed, TTL, catalog, docs)

### Decisioni micro aperte (default proposti — correggere se sbagliati)
- retention messaggi: 7 giorni
- rotation parte_B: ad ogni boot BE + cadenzata (proposta: giornaliera)

### Verifiche TOC necessarie prima di WP-A
- come funziona deriveClientKey/generation handshake oggi (estendere vs riscrivere)
- dove vive/può vivere parte_B in PG config e chi la scrive (secret engine oggi scrive Redis!)
- come config hot-reload propaga senza far transitare parte_B su NATS

## WP-A SPEC IMPLEMENTATIVA — encryption foundation (scritta 2026-11-25 sera)

### Modello chiavi (ratificato)

Motivo chiave: il secret engine ESISTENTE oggi scrive Redis e distribuisce via secret.get
(NATS — circolare!). Il fix non e nuovo engine: e cambio di canale — persistenza PG,
distribuzione via DAL-read + config.changed come solo-hint (mai valori su NATS).

### Envelope format


### Key history e retention
- consumer decifra con current+previous N generazioni (finestra = retention messaggi)
- publisher cifra SOLO con current
- secret-engine: rotation boot-BE + cadenzata; vecchie generazioni purgate con i messaggi

### Incrementi di implementazione
- A1 MessageKeyProvider sdk: lettura PG via dal, derivation, cache generazioni, hook config.changed
- A2 envelope crypto primitives (seal/open) + unit test roundtrip/tamper/wrong-key
- A3 publish path: encrypt-by-default in NatsClient.publish*; headers sensibili dentro busta
- A4 subscribe path: decrypt in jetstreamSubscribe/subscribe/callNats prima di verify
- A5 secret-engine re-channel: persistenza PG system schema, rotation, history pruning
- A6 sweep boot servizi + rimozione static key da config_entries dev (dev=prod)
- A7 rimozione rotating-secret-check dal user-layer NATS (resta edge HTTP)

### Note implementative critiche
- parte_B MAI in payload/header/broadcast NATS — enforced: il distribution path e solo DAL
- config.changed resta hint senza valori — i servizi re-leggono PG
- verify chain nella factory: decrypt envelope PRIMA di verifyNatsPublisher/RBAC
- envelope plaintext-fallback solo nella finestra di transizione, poi lint/enforcement

## WP-A TIC COMPLETO (2026-11-26) — encryption foundation, pronto per TOC

### Doc deep-dive eseguito (doc first, code second)
- `sdk/docs/dev-guide/client-shield-and-secrets.mdx` — governing doc del dominio: documenta
  rotating secret come anti-spoofing stamp, NESSUNA menzione di key-derivation/encryption.
  WP-A lo supera: doc update obbligatorio alla chiusura (docs-sync-on-close).
- `sdk/docs/dev-guide/nats-client.mdx` — wire contract: publish/subscribe usano ext-json
  automatico, consumers passano plain objects. Encryption deve restare trasparente a questa
  interfaccia — i consumer NON cambiano.

### Censimento empirico touchpoint (file:linea, verificato)
SDK plumbing — la cifratura vive in questi 6 punti, nessun altro:
- `sdk/src/nats/nats-client.ts:240` publishEphemeralLossy (ephemeral path)
- `sdk/src/nats/nats-client.ts:422` publish (durable JetStream path)
- `sdk/src/nats/nats-client.ts:304` deserialize in subscribe
- `sdk/src/nats/nats-client.ts:559` deserialize in subscribeRequest
- `sdk/src/nats/nats-client.ts:626` deserialize in jetstreamSubscribe
- `sdk/src/nats/nats-routes.ts:202` deserialize reply in callNats

Auth chain da spostare dentro la busta:
- `sdk/src/auth/auth-user-serializer.ts:38` serializeAuthUserToHeaders
- `sdk/src/auth/auth-user-serializer.ts:85` deserializeAuthUserFromHeaders
- verifyNatsPublisher consumers: session-context.ts, create-microservice.ts, job-schedule.ts, nats-routes.ts

Consumer impact (trasparente — nessuna modifica richiesta):
- 16 publish call sites (8 be-v3 + 8 us-v3), 9 file con callNats, 4 consumer jetstreamSubscribe,
  1 factory makeNatsRoutes — tutti passano per il plumbing sdk.

Storage parte_B — verificato empiricamente:
- `system.config_entries` ESISTE (fleet-shared, stessa shape delle per-service)
- `system.client_shield_registry` esiste accanto — precedente cross-schema system schema
- per-service schemas: ai, boilerplate, crm, emailsender, job — ognuna la propria config_entries

### Modello chiavi definitivo
```
parte_A = MESSAGE_KEY_ROOT — env-injected, fleet-common, MAI in repo/PG/config_entries
parte_B = system.config_entries row, key = 'service_message_key_material'
          value json: { generation, current, previous?, rotated_at }
enc_key(gen) = HMAC-SHA256(parte_A).update(parte_B_gen + ":" + gen) → 32 byte raw
```
- writer di parte_B: RotatingSecretEngine sul BE (re-channeled da Redis a PG — vedi A5)
- reader: ogni servizio via DAL diretto su system.config_entries — MAI via NATS
- distribution hint: config.changed broadcast resta solo-hint (nessun valore su NATS)

### Envelope wire format definitivo
```
inner frame (mai sul wire in chiaro): ext-json({ p: payload, h: { sensitiveHeaders } })
wire payload: ext-json({ enc: 1, gen: N, iv: b64(12B random), data: b64(ciphertext||tag) })
  cipher = AES-256-GCM(enc_key(gen), iv)
detection: parsed object con enc === 1 → envelope; altrimenti legacy plaintext (transizione)
header NATS esterni (restano in chiaro — routing/transport, non confidenziali):
  otel traceparent, job correlation ids, shield stamps (fino ad A7)
header SENSIBILI dentro la busta: x-user-id, x-user-roles, x-user-permissions,
  x-user-session e ogni altro claim di auth-user-serializer
```

### Pseudo-codice per modulo (TOC = trascrizione)

A2 — `sdk/src/nats/message-envelope.ts` (nuovo, puro):
```
sealEnvelope(key: Buffer, generation: number, payload: unknown, headers: Record<string,string>): string
  iv = randomBytes(12); plaintext = extJsonStringify({ p: payload, h: headers })
  cipher = createCipheriv('aes-256-gcm', key, iv)
  data = concat([cipher.update(plaintext,'utf8'), cipher.final(), cipher.getAuthTag()])
  return extJsonStringify({ enc: 1, gen: generation, iv: b64(iv), data: b64(data) })

isEnvelope(parsed: unknown): boolean  — parsed.enc === 1 && typeof parsed.gen === 'number'

openEnvelope(envelope, keyResolver: (gen) => Buffer|null): { payload, headers }
  key = keyResolver(envelope.gen) — null → throw KEY_GENERATION_UNKNOWN
  split data: ciphertext = data[:-16], tag = data[-16:]
  decipher.setAuthTag(tag) — GCM verify failure = throw MESSAGE_INTEGRITY_VIOLATION
  frame = extJsonParse(deciphered) → { payload: frame.p, headers: frame.h }
```

A1 — `sdk/src/nats/message-key-provider.ts` (nuovo):
```
class MessageKeyProvider:
  configure({ dal, rootSecret }): void   — chiamato da createMicroservice al boot
  refresh(): Promise<void>  — SELECT value FROM system.config_entries WHERE key=...
    deriva key per generation corrente + previous; cache in memory Map<gen, Buffer>
  currentKey(): { key, generation } | null
  keyForGeneration(gen): Buffer | null
  ready(): boolean — rootSecret presente AND almeno una generazione caricata
hook: createMicroservice sottoscrive config.changed → refresh() (già esiste il punto)
```

A3 — publish path (nats-client.ts:240,422):
```
se keyProvider.ready():
  split headers: sensitive = x-user-*, transport = resto
  wire = sealEnvelope(key, gen, data, sensitive)
  publish(subject, encode(wire), transportHeaders)
altrimenti: legacy plaintext + warn-once 'MESSAGE_KEY_UNAVAILABLE plaintext fallback'
```

A4 — subscribe path (nats-client.ts:304,559,626 + nats-routes.ts:202):
```
parsed = extJsonParse(text)
se isEnvelope(parsed):
  { payload, headers } = openEnvelope(parsed, gen => keyProvider.keyForGeneration(gen))
  merge inner headers nella view esposta a handler/factory — interfaccia identica a oggi
  decrypt failure → term/nak + error log; MAI consegnare al handler
se legacy plaintext: passthrough + deprecation warn-once
```

A5 — secret-engine re-channel (be-v3, rotating-secret.ts):
```
nuovo ref: { scope: 'global', name: 'service_message_key_material' }
persist: UPSERT system.config_entries row (generation, current, previous, rotated_at)
  — NON piu Redis slot per questo ref; NON servire via secret.get (chiusura circolarita)
rotation: boot-BE + interval 24h (DA RATIFICARE — proposta)
previous mantenuto per la finestra retention messaggi (7gg — DA RATIFICARE)
```

A6 — bootstrap/dev-prod parity:
```
MESSAGE_KEY_ROOT injected env in tutti gli ambienti; dev-stack legge file gitignored
rimozione service_client_shield_key statico da config_entries dev (patch correttiva)
fail-fast al boot se MESSAGE_KEY_ROOT assente (no fallback insicuro)
```

A7 — rimozione rotating-check dal user-layer NATS (dopo A3/A4 live):
```
validClientShieldSecrets smette di essere verificato sui messaggi NATS stream
resta all'edge HTTP dove il threat model e reale
```

### Test deliverables (persistenti, canonici — sdk/src/nats/__tests__/)
- message-envelope.test.ts: roundtrip, tamper detection (bit-flip → integrity violation),
  wrong-key rejection, wrong-generation rejection, legacy plaintext detection, bigint preservation
- message-key-provider.test.ts: derivation deterministica, generation cache, refresh mock-dal
- integrazione publish→subscribe cifrato end-to-end in nats-client.test.ts esistente

### Acceptance criteria
1. payload + user-header illeggibili sul wire (verifica empirica: capture stream content = opaque)
2. rogue subscriber con credenziali NATS ma senza chiavi: solo byte opachi
3. messaggi consumabili per tutta la finestra retention (generazioni precedenti decifrabili)
4. tampered ciphertext → rejection, mai delivery
5. consumer call sites invariati (trasparenza)
6. sdk 626/626+ test verdi, nuovi test deliverable inclusi
7. doc update: client-shield-and-secrets.mdx + nats-client.mdx riscritti al nuovo modello

### Decisioni da ratificare al PROCEED (default proposti)
- retention messaggi/chiavi: 7 giorni
- rotation cadence parte_B: boot-BE + 24h
- MESSAGE_KEY_ROOT: nome env var definitivo
- dev: file gitignored per la root key, letto da dev-stack scripts
