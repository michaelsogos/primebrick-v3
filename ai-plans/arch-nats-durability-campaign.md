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
