# Internal trust & transports — HTTP hardening, NATS doctrine, edge topology

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
| <fill in> | | |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-26 | benchmark bench-nats-vs-http.mts | ✅ measured | numbers in §3 | doctrine rewrite |
| 2026-11-26 | plan opened | ✅ | this file | decision round with Micha |

## Status: 🟠 WIP — Plan date: 2026-11-26 / analysis & decision phase

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Benchmark HTTP vs NATS correlation (real measurement) | ✅ done | 2026-11-26 | §3 — numbers kill the "1.5×" ghost and the migration case |
| 2 | Detail threat model + current HTTP defense holes | ✅ done | 2026-11-26 | §2 — verified at file:line in census |
| 3 | Edge topology analysis — STANDALONE vs GATEWAY-authoritative | ✅ done | 2026-11-26 | §5 — Micha's GW insight integrated |
| 4 | Decision round with Micha on D1–D8 | ⏳ not done | — | §8 — the open decisions, nothing closed yet |
| 5 | Doctrine rewrite in controller-boundary.md + client-shield-and-secrets.mdx | ⏳ not done | — | after decisions — real numbers replace the ghost benchmark |
| 6 | HMAC provenance design detail (post-decisions) | ⏳ not done | — | §6 is direction, not spec — spec follows D1/D2/D5/D6 |
| 7 | Implementation | ⏳ not done | — | scoped after decision round |

---

## 1. Perché questo piano esiste — la sintesi della discussione

Threat model ratificato da Micha: **l'attaccante è un processo vivo nella VLAN**
(es. python compromesso) — esterno a noi, sconosciuto, non autorizzato, ma con
reach di rete diretta su tutti i servizi. NON un postman dall'esterno: il
frontline (BE/AFD/APIGW) per lui è irrilevante perché è già dentro.

Verificato a file:line (censimento esaustivo BE↔US, 2026-11-26): oggi un
singolo pacchetto sniffato BE→US consegna TUTTO il necessario per la
compromissione totale:

- `x-client-shield-secret` — il segreto rotating (valido fino a ~65 min, e se
  sniffa in continuazione, ogni rotazione successiva → validità infinita);
- `x-primebrick-client-shield-key` — la chiave client statica (validità indefinita);
- il formato UA atteso e gli header identità `x-user-*` in cleartext —
  inclusi `x-user-permissions` e `x-user-is-admin`.

Con quel pacchetto l'attaccante forja richieste admin verso OGNI US,
indistinguibili dal BE legittimo. Il meccanismo rotating-secret NON difende
da questo: reshape della finestra, non barriera — contro sniffer persistente
è neutro. **Difesa attuale contro il threat model ratificato: zero pratico.**

Asimmetria originaria che ha aperto la discussione: post-A7 il wire NATS è
envelope-only AES-256-GCM (la busta è la prova di provenienza), mentre HTTP
interno restava cleartext+segreti-trasmessi. Cifrare un trasporto e lasciare
l'altro cleartext è teatrale.

---

## 2. Censimento dei fatti (base empirica, già verificata)

Fonte: subagent census esaustivo primebrick-be-v3 (+ verifiche incrociate
us-v3/sdk), 2026-11-26. Solo i punti che contano per le decisioni:

- **BE→US sync è 100% HTTP** — zero `callNats` in BE domain code. Caller
  legittimo degli US in produzione: solo il BE (proxy + MCP loopback +
  openapi aggregation) — UN solo client da governare.
- **US→BE sync è ~95% NATS correlation** (`config.get`, `secret.get`,
  `service.register`, `registry.get`, `clientShieldRegistry.get`,
  `auth.mfa.consume`, `auth.apikey.byHash`, `auth.ctl.resolve_user`,
  `system.dict.get`, `system.translations.find`) + UN solo path HTTP
  (ai service che pulla il docs-pack del BE).
- **US→US HTTP esiste**: job-handler `map-key-schemas.ts` legge cataloghi
  degli altri servizi via `internalFetch` su `base_url`.
- Il proxy BE→US è text-only per costruzione (`extJsonStringify`/
  `response.text()`) — zero multipart, zero binary passthrough.
- Ogni richiesta proxata paga una query PG per il registry lookup
  (nessuna cache) + il MCP loopback attraversa lo stack due volte nello
  stesso processo.
- `/health` è pubblico per design su ogni US (sonda docker intra-container,
  loopback — non superficie VLAN).
- Buco deliberato: il proxy inoltra `/api/v1/system/db-migration*` anche a
  istanze `migration_failed` — exemption documentata nell'offline-wall.

---

## 3. La misurazione vera — benchmark 2026-11-26

Script: `primebrick-workspace/temp/bench-nats-vs-http.mts`. Condizioni:
stessa macchina, loopback; NATS path con crypto A7 reale attiva (4 operazioni
AES-GCM per roundtrip: client-seal, server-open, server-seal, client-open);
HTTP con `node:http` — lo stesso stack di produzione degli US; payload
rappresentativo (req 84B, res 830B entity-row-shaped). 2000 iterazioni
seriali + parallel throughput 100×30.

```
HTTP direct (floor)    mean 0.091ms  p50 0.075  p95 0.176  p99 0.271  | 16.679 ops/s
NATS corr current      mean 1.231ms  p50 1.164  p95 1.748  p99 2.320  | 11.842 ops/s
NATS corr muxed        mean 1.146ms  p50 1.087  p95 1.541  p99 2.309  | 11.374 ops/s
```

Letture definitive:

1. **muxed-inbox non cambia NULLA** (1.15 vs 1.23ms = rumore) — l'ipotesi
   che il costo fosse il setup della subscription è smentita. Il costo è
   strutturale: NATS è broker-mediated → 4 traversate TCP per roundtrip
   contro le 2 di HTTP diretto. Nessuna ottimizzazione client elimina il
   broker hop.
2. **HTTP vince sulla latenza punto-punto per topologia, non per
   implementazione** — ~13× più veloce al floor, e anche caricando il path
   HTTP reale (proxy hop + PG lookup + auth chain) resta sotto il ms base
   di NATS.
3. **il "1.5× slower" di controller-boundary.md era un fantasma** — nessun
   benchmark mai esistito nei repo; la direzione era giusta ma i numeri e
   la motivazione erano sbagliati. Va riscritto con questi numeri.
4. Throughput irrilevante in entrambi i casi (11-16k ops/s vs carico reale
   di decine/centinaia al secondo).

Nota di onestà di metodo: HTTP misurato è il FLOOR (niente proxy, niente
auth chain, server in-process) — il production HTTP è più lento di quanto
misurato, ma il gap strutturale del broker hop rende la conclusione robusta
in entrambe le direzioni.

---

## 4. Dottrina trasporti — la linea definitiva (proposta, da ratificare)

**NATS = durable + event-driven. HTTP = tutto il REQ/RES, per sempre.**

- NATS REQ/RES non ha alcun vantaggio residuo per nuovi usi: latenza
  peggiore per topologia, meccanismo non standard, e post-hardening HTTP la
  cifratura non è più un differenziale.
- Le rotte infra NATS esistenti (§2, la lista US→BE) restano dove sono:
  costo zero tenerle, sono interne/invisibili (l'argomento lock-in non si
  applica — nessun developer le vede), già cifrate post-A7. Eliminarle è
  churn senza beneficio funzionale.
- Vietato introdurre NUOVE rotte NATS correlation developer-facing. La
  superficie di prodotto (entity CRUD, actions, OpenAPI) è HTTP, sempre —
  coerente con la promessa no-lock-in di primebrick.dev: il developer
  consuma OpenAPI standard, non un facade proprietario su NATS.
- Invariato e non in discussione: NATS JetStream per durable jobs, trigger,
  event emission, broadcasts — è il suo regno e la cifratura envelope A7
  resta la prova di provenienza lì.

Questa linea RISPONDE alla domanda di Micha "possiamo eliminare REQ/RES
per sempre?": sì come destinazione developer-facing, no come demolizione
dell'esistente interno. La scrittura finale della dottrina dipende da D4 (§8).

---

## 5. Edge topology — il punto di Micha che ridisegna il perimetro

Due topologie possibili per il BE, GIÀ previste dall'auth config
(`AuthMode.STANDALONE` vs `AuthMode.GATEWAY` in sdk/src/auth):

### 5.1 STANDALONE (com'è ora in dev, e opzione deploy possibile)

Browser → BE diretto (o tramite proxy stupido che non autentica). Il BE fa
TUTTO: verifica JWT via OIDC discovery contro Casdoor, risolve utente,
espande permessi. Il hop browser→BE è già crypto-sicuro per costruzione:
il Bearer è un JWT firmato Casdoor — forgiarlo richiede le chiavi dell'IdP,
non uno sniff (la token-theft per replay resta il rischio classico, mitigato
da TLS all'edge + expiry breve — problema standard, non nostro).

### 5.2 GATEWAY-authoritative (AFD/APIM/Kong che autentica)

Il GW termina l'auth utente e scrive identity headers verso il BE. Il BE
non verifica più il JWT — si fida degli header del GW (verifyGatewayWithPorts).

**L'insight critico di Micha**: il GW autoritativo è un prodotto terzo —
NON È IN GRADO di applicare il nostro scheme (né HMAC custom, né la nostra
derivazione vault). Qualunque cosa il GW scriva negli header viaggia nel
formato che il GW sa produrre: header statici, segreti iniettati da config,
al più un JWT firmato con chiave configurata sul GW (APIM validate-jwt /
injection policies lo supportano; Front Door no, è solo L7 proxy+WAF).

### 5.3 Conseguenza architetturale — il perimetro corretto del design

Il chain di fiducia si spezza in due hop INDIPENDENTI:

```
hop EDGE:      browser/GW → BE     — il problema del frontline
hop INTERNAL:  BE → US, US → US, US → BE   — il problema nostro
```

**Il design di hardening INTERNAL è ORTOPHONALE alla scelta edge**: nel
tratto interno il caller è sempre codice nostro (BE o US), quindi possiamo
sempre firmare — non importa come l'utente sia stato autenticato all'edge.
Il BE ri-serializza l'AuthUser e firma verso gli US con la nostra scheme;
gli US si fidano della firma del BE, mai della provenienza originale.

Il hop EDGE invece dipende dalla topologia:
- STANDALONE: già risolto (JWT Casdoor firmato — verifica crypto completa).
- GATEWAY-authoritative: serve una risposta SEPARATA per GW→BE — opzioni
  standard in D8. NON è un problema che il design interno deve risolvere.

### 5.4 La domanda aperta di Micha — BE sempre STANDALONE o GW-capable?

È la decisione D1. Argomenti raccolti nella discussione:

- STANDALONE sempre: un solo modo di operare, auth completa nel nostro
  codice, nessuna dipendenza dalle capability crypto del GW — il GW resta
  sempre e solo proxy L7. Semplicità dottrinale.
- GW-capable: in deployment enterprise il cliente può imporre il suo
  frontline authoritativo (SSO aziendale terminato al GW, WAF centralizzato).
  Il codice lo supporta già (`AuthMode.GATEWAY` esiste e funziona) —
  chiuderlo sarebbe una regressione di capability, non una semplificazione.
- Costo di tenere entrambi: il verify-chain già li distingue; il design
  interno è identico in entrambi i modi (§5.3). Il costo reale è solo la
  risposta edge in modo GATEWAY (D8) — che esiste solo quando qualcuno
  deploya così.

---

## 6. Design direction — INTERNAL hardening, proof-of-possession

⚠️ DIREZIONE, NON SPEC — i dettagli finali seguono le decisioni D1/D2/D5/D6.

Principio cardine (la frase di Micha): **"I KNOW WHO YOU ARE"** — non si
trasmette il segreto, si trasmette la prova di possederlo. Oggi facciamo
l'opposto: il segreto stesso viaggia nell'header.

### 6.1 Meccanica proposta

```
x-pb-signature:  HMAC-SHA256(signing_key, canonical)
x-pb-timestamp:  epoch ms
x-pb-nonce:      uuid per-richiesta

canonical = method + "\n" + path + "\n" + timestamp + "\n" + nonce
          + "\n" + sha256(body) + "\n" + sha256(canonicalized x-user-* headers)
```

- La chiave NON transita mai. Un pacchetto sniffato consegna una firma
  valida per UNA forma di richiesta (stesso method+path+body+identità),
  entro la finestra temporale, una sola volta se c'è nonce-cache.
- Forgiare una richiesta diversa — altro path, altro body, altra identità
  (`x-user-is-admin: true`) — richiede la chiave. Fine del vettore.
- Gli `x-user-*` nel materiale firmato: l'identità diventa non-forgiabile
  E non-modificabile (integrity), pur restando leggibile (confidenzialità
  separata — decisione D2).

### 6.2 Key distribution — la macchina esiste già

Il vault ha già: derivazione HMAC per-generazione, rotation oraria,
finestra 7 giorni, provisioning via NATS cifrato, reactive-refresh. Il
message-key-provider è la prova che funziona. Le chiavi di firma HTTP
possono nascere dallo stesso canale — una derivation separata (label
diversa) ma stessa infrastruttura, stessa rotation, stesso trimming.

Questo chiude anche la decisione pendente di Micha sullo shield-secret nel
vault: non solo lo shield — TUTTA la fiducia interna va per quel canale.

### 6.3 Anti-replay — livelli possibili (decisione D6)

- minimo: timestamp ±30s skew — replay possibile dentro 30s per la stessa
  identica richiesta (idempotenza la rende quasi innocua per GET, meno per
  scritture);
- medio: + nonce-cache nel verifier (sliding window, in-memory o Redis) —
  replay impossibile anche dentro la finestra;
- massimo: + sequenza per-caller — overkill per il threat model.

### 6.4 Punto di enforcement

Il verify-chain esiste già (`verifyAuthGatewayResolved` /
`verifyClientShieldSecret` in sdk/src/auth/verify.ts): la firma si verifica
ALLO STESSO PUNTO — un middleware, nessuna riscrittura di superficie,
OpenAPI intatta, developer ergonomics intatta, lock-in intatto. Lato
publisher: `internalFetch`/`backendIdentityHeaders` diventano i punti di
firma centralizzati — già esistono come funnel.

### 6.5 Cosa succede alla macchina shield esistente (decisione D3)

Oggi: rotating-secret engine (Redis+TTL) + client-shield-registry (chiavi
statiche per-client con UA allowlist) + enrollment flow. Con la firma HMAC
vault-derived la domanda è cosa resta:

- il rotating-secret trasmesso in cleartext muore per definizione (è il
  buco) — sostituito dalla firma;
- il registry/chiavi statiche: potrebbero RESTARE come livello identity
  (chi sei) con la firma che diventa il livello proof (dimostralo) —
  oppure essere assorbite nella stessa derivation vault;
- la rotation resta — ma finalmente difende davvero: colmato il canale di
  trasmissione, ruotare riduce la finestra di compromissione di una chiave,
  non è più neutro.

### 6.6 Confidenzialità (decisione D2 — separata dall'autenticità)

La firma protegge autenticità/integrità ma il contenuto resta leggibile:
`x-user-*` porta PII (email, nome) e permessi in chiaro. Se il threat model
include la confidentiality contro lo sniffer (non solo la forgery), le
opzioni:
- sigillare gli header sensibili in AES-GCM con la stessa derivation vault
  — la busta esiste già come pattern (wire NATS), applicabile qui;
- TLS interno — PKI da operare, più pesante in standalone-dev;
- decidere che la confidentiality interna non è in scope (l'attaccante
  leggerebbe email/nomi ma non potrebbe comunque AGIRE).

---

## 7. Verification approach (quando si implementa)

Prova-del-9 obbligatoria per ogni chiusura, nello stile A7:
1. replay di una richiesta sniffata integralmente → DEVE fallire;
2. forgiatura admin (header modificati, firma copiata) → DEVE fallire;
3. richiesta legittima BE→US → passa, latenza misurata (costo HMAC ~µs);
4. skew clock oltre finestra → fallisce;
5. rotation con firma in-flight → grace window la salva;
6. boot senza chiave → fail-closed (mai unsigned sul wire), stessa dottrina A7.

---

## 8. LE DECISIONI APERTE — niente è chiuso, tutto da ratificare

| # | decisione | opzioni | implicazioni |
|---|-----------|---------|--------------|
| D1 | BE: sempre STANDALONE o anche GW-capable? | (a) solo STANDALONE — un solo modo, GW sempre e solo proxy; (b) entrambi come oggi | (a) semplicità dottrinale, ma chiude deployment enterprise con frontline authoritativo imposto dal cliente; (b) nessun costo interno (§5.3), richiede risposta D8 solo quando qualcuno deploya in GATEWAY |
| D2 | confidentiality interna o solo autenticità? | (a) firma HMAC sola — headers leggibili; (b) + sigillo AES-GCM headers sensibili via vault; (c) TLS interno | (a) sniffer legge PII ma non può agire; (b) riusa il pattern busta, niente PKI; (c) standard industry ma PKI interna da operare, pesante in dev-standalone |
| D3 | destino della macchina shield (rotating-secret + registry)? | (a) assorbita nel vault-HMAC; (b) registry resta come identity-layer, firma come proof-layer | (a) massima semplificazione — un solo canale di trust; (b) due livelli ma più parti in movimento |
| D4 | dottrina NATS REQ/RES finale? | (a) keep infra esistente + ban nuovi usi dev-facing (§4); (b) migrazione totale a HTTP anche delle infra | (a) zero churn, linea pulita per il futuro; (b) purezza massima ma lavoro senza beneficio funzionale, e perde location-independence dove serve |
| D5 | derivation chiavi firma: stesso canale message-key o separato? | (a) stessa infrastruttura vault, label separata; (b) provider indipendente | (a) rotation/trimming/reactive-refresh gratis; (b) isolamento ma duplicazione |
| D6 | anti-replay a che livello? | (a) solo timestamp ±30s; (b) + nonce-cache | (a) replay 30s possibile sulla stessa richiesta identica; (b) costo: stato nel verifier (memory o Redis — Redis già presente) |
| D7 | il path HTTP US→BE (docs-pack pull) e US→US (map-key-schemas)? | (a) stesso scheme HMAC — uniforme; (b) migrarli a NATS correlation dove già esiste | (a) una sola scheme per tutto l'HTTP interno; (b) riduce superficie HTTP ma rompe l'uniformità della dottrina §4 |
| D8 | GW→BE trust in modo GATEWAY-authoritative (solo se D1=b)? | (a) JWT firmato iniettato dal GW (APIM lo supporta); (b) mTLS edge; (c) shared-secret statico + network restriction | dipende dal GW concreto del deployment — forse va risposta PER-DEPLOYMENT, non nella dottrina; (a) è lo stesso principio proof-of-possession, il più allineato |

---

## 8bis. ESITI DELLA DECISION ROUND (2026-11-26)

| # | esito | note |
|---|-------|------|
| D1 | **(b) entrambi i modi** | STANDALONE + GW-capable restano — nessuna chiusura di capability enterprise |
| D2 | **(b) firma + sigillo AES-GCM headers sensibili** | autenticità E confidenzialità, stesso canale vault, pattern busta NATS riusato |
| D3 | **analisi richiesta prima di decidere** — vedi §10 | impatti reali a regime di (a) vs (b) |
| D4 | **(a) keep infra esistente + ban nuovi usi dev-facing** | dottrina §4 ratificata così com'è |
| D5 | **(a) stesso canale vault, label separata** | niente provider duplicato |
| D6 | **(b) timestamp + nonce-cache** | replay chiuso completamente — costo analizzato in §10.4 (rileva) |
| D7 | **censimento richiesto prima di decidere** — vedi §11 | i due path in dettaglio |
| D8 | **separato in piano dedicato, DEFERRED** | → arch-edge-gateway-trust.md — si affronta nella fase di cloud testing; vincolo dottrinale ratificato: in GATEWAY mode il BE DEVE verificare il frontline crittograficamente, static-secret come unica barriera NON accettabile |

---

## 10. D3 — analisi impatti reali: assorbimento totale (a) vs registry identity-layer (b)

### 10.1 La macchina esistente — cosa c'è in campo oggi

- **rotating-secret engine**: segreto in Redis+TTL, distribuito via secret.get,
  broadcast secret.rotated, grace window — MUORE IN ENTRAMBE LE OPZIONI (è il
  buco: il segreto non si trasmette più, punto).
- **client-shield-registry**: tabella system.client_shield_registry, chiavi
  statiche per-client (config service_client_shield_key), allowlist UA-prefix,
  enrollment flow a service.register (con allowNewPrefix — finestra in cui un
  nuovo servizio enrolla senza prova pregressa), cache verifier 60s, broadcast
  client_registry.changed, rotta di distribuzione clientShieldRegistry.get.

### 10.2 Opzione (a) — assorbimento totale: l'identità È la chiave

Design: chiavi di firma PER-SERVICE derivate via vault —
`signing_key = HMAC(vault_material, "http-sign:" + service_code + ":" + gen)`.
Il caller dichiara il proprio service-code in header; il verifier deriva la
chiave di QUEL servizio e verifica. Provenienza granulare per costruzione:
sai CHI ha firmato, non solo CHE la firma è valida. Blast radius di una
compromissione = una sola identità di servizio.

Cosa muore: enrollment flow (e la sua finestra di vulnerabilità), registry
machinery, allowlist UA (era self-declared comunque — difesa debole per
costruzione), broadcast invalidation, la rotta di distribuzione, e soprattutto
**le chiavi statiche in config_entries** — che sono esse stesse un segreto
bootstrap da proteggere e seedare manualmente per ambiente.

Boot semplificato: niente handshake di enrollment — il servizio deriva la
chiave dal vault esattamente come fa per i message-key. Meno boot-ordering,
meno race conditions.

### 10.3 Opzione (b) — registry resta come identity-layer

Analisi del valore marginale di sicurezza, onesta:

1. Entrambi i livelli collassano sulla stessa root of trust: compromissione
   vault → chiavi di firma compromesse comunque — il registry non aggiunge
   nulla contro lo scenario primario.
2. Se la chiave registry continua a transitare in cleartext → sniffabile →
   valore zero. Se la proteggiamo dentro la firma → circolare: la protezione
   è la firma stessa, il secondo segreto non verifica nulla di indipendente.
3. L'UNICO scenario residuo coperto: leak isolato di una signing key (memory
   disclosure) SENZA compromissione vault E senza leak della registry key —
   slice estremamente stretta, e comunque limitata alla finestra di rotation.
4. La UA-allowlist è self-declared per costruzione — chiunque setta un header.

Costo a regime di (b): TUTTO il costo di (a) PIÙ enrollment handshake ad ogni
boot, cache+invalidazione, gestione chiavi statiche in config_entries con
seeding manuale per ambiente, e la doppia verifica per richiesta.

### 10.4 Costi di throughput a regime — la misura onesta (comune a entrambe)

Per richiesta, lato publisher: sha256(body) + HMAC-SHA256(canonical).
Lato verifier: le stesse due operazioni. Con SHA-NI (hardware moderno):
SHA-256 viaggia a svariati GB/s per core → 1-2KB di canonical ≈ 0.5-2µs;
body 50KB ≈ 10-20µs worst case. Contro il floor HTTP misurato (90µs) è
rumore: overhead ~2-5% worst case, tipicamente invisibile. Key derivation:
una HMAC per servizio per rotation — ammortizzata a zero.

**Costo che invece RILEVA — la nonce-cache (D6 ratificato)**: un roundtrip
Redis per richiesta scrivente. Su loopback ~100-300µs, su VLAN ~0.5-1ms —
contro un floor di 90µs questo può raddoppiare-decuplicare il costo del path
diretto. Mitigazione proposta: nonce obbligatorio solo sui metodi scriventi
(POST/PUT/PATCH/DELETE); GET esenti — il replay di una lettura è inerte per
costruzione (idempotenza). Così il costo si paga solo dove il rischio esiste.
In-memory va bene per istanza singola (dev/standalone); Redis solo per
multi-replica — e in quel caso il costo è intrinseco alla replica stessa.

### 10.5 Verdetto dell'analisi (Micha decide)

(a) domina su sicurezza (chiude la finestra enrollment, elimina i segreti
statici bootstrap), su complessità operativa (un sottosistema in meno), e a
parità di throughput. Il valore marginale di (b) è circolare o nullo nei
casi realistici. La decisione resta aperta — vedi §8bis D3.

---

## 11. D7 — censimento dei due path HTTP fuori perimetro BE→US

### 11.1 Path A — docs-pack pull (ai-service → BE + altri US docs-capable)

- COSA: replicazione bulk dei documentation pack — manifest JSON con contenuto
  markdown embedded (dev-guide/user-guide). Potenzialmente GRANDE: centinaia
  di KB fino a oltre 1MB per pack.
- FREQUENZA: boot dell'ai-service + trigger di reindex (lifecycle events,
  manuale) — RARO, mai hot path.
- DISCOVERY: già NATS (service.registry.get capability=docs_pack); il data
  fetch è HTTP GET su {base_url}/api/v1/system/docs/pack.
- Fonte: ai/src/services/docs-pack-reindex.service.ts:120-150,
  sdk/src/docs-pack/docs-pack-client.ts:9-25.
- Migrazione a NATS: il payload può superare il max-payload 1MB → servirebbe
  chunking → complessità nuova per un path raro. HTTP è il fit naturale per
  bulk replication.

### 11.2 Path B — map-key-schemas (job-handler → US proprietari dei vocabolari)

- COSA: quando un job schedulato fa fire di un callable il cui payload schema
  dichiara map-keys hints, job-handler legge righe entity-list dal servizio
  proprietario per risolvere le dichiarazioni di schema.
- FREQUENZA: per job firing con hints — moderato, event-driven a raffiche.
- SIZE: list-response piccole-medie.
- NOTA ARCHITETTURALE: riusa gli endpoint entity-list developer-facing — non
  esiste una rotta NATS di entity-read; crearla violerebbe D4 ratificato
  (ban nuove rotte correlation).
- Fonte: job-handler/src/services/map-key-schemas.ts:1-46. Discovery già
  via NATS; solo il data fetch è HTTP.

### 11.3 Lettura per la decisione

Entrambi i path passano già per internalFetch — il funnel esiste: firmare
HMAC uniformemente costa quasi zero ed è coerente con "una sola scheme per
tutto l'HTTP interno". Migrarli a NATS richiederebbe nuove rotte correlation
(contro D4) e per il docs-pack anche chunking oltre 1MB. L'evidenza pende
forte verso D7=(a) — la decisione resta a Micha.

---


## 9. Cosa NON è in scope (esplicito)

- NATS wire encryption — chiuso in A7, non si riapre.
- JetStream/durable/event-driven — nessuna modifica.
- La superficie developer-facing HTTP (OpenAPI, entity CRUD, actions) —
  resta com'è; il hardening è nel verify-chain, trasparente.
- MCP loopback cost/optimizations — emersi nel censimento, notati qui per
  completezza ma non in scope (possibile piano separato di semplificazione).
- Il benchmark artifact — `primebrick-workspace/temp/bench-nats-vs-http.mts`
  resta in temp come prova riproducibile, non è codice di prodotto.

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
