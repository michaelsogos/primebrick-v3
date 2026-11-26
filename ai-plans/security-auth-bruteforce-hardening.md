# Security — Auth brute-force / credential-stuffing / DDoS hardening

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
| primebrick-be-v3/docs/ai/workflow.md:84-107 | TIC è empirico — censimenti e pseudo-codice nel piano, zero discovery in TOC | il censimento completo è in "Censimento empirico" sotto; TOC è trascrizione |
| primebrick-be-v3/docs/dev-guide/authentication.mdx:297 | "IP rate limiting for public endpoints is configured at the infra level" | dottrina attuale: questo piano la emenda esplicitamente (vedi § Dottrina) — va aggiornato nel TOC |
| primebrick-be-v3/docs/ai/logging-telemetry.md:8-14 | mai console.*, meta strutturati snake_case, no segreti/PII nei log | il middleware e la detection emettono `security_event` strutturati (precedente: NATS `nats_message_integrity_violation`) |
| primebrick-be-v3/docs/ai/casdoor-integration.md:10-24 | due coppie di credenziali client diverse; il lockout è di Casdoor | il lockout per-account resta di Casdoor — il piano NON lo reimplementa, lo integra |
| primebrick-be-v3/AGENTS.md — Config Table Standard | config_entries è il sistema di configurazione canonico, typed values, reserved rows | tutte le soglie sono config rows, mai costanti hardcoded |
| primebrick-be-v3/AGENTS.md — Package Versioning | versioni pinned esatte, no range | `rate-limiter-flexible@11.5.0` (11.6.1 escluso: pubblicato il 2026-11-25, < 7 giorni) |
| OWASP Bot Management cheat sheet | dual-bucket: per-username E per-IP indipendenti; 429 generico; no fixed-window ingenuo | è la specifica normativa esterna del design in § Fase 1 |
| OWASP Credential Stuffing Prevention | MFA è la difesa primaria (99.9% compromissioni evitate — dato Microsoft) | giustifica la Fase 3 (MFA enforcement) come complemento strutturale |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-26 | grep `rate.?limit\|lockout\|throttle\|brute` su src/ BE | NESSUN rate limiting applicativo esiste | solo 2 hit non correlati (`auth-invitation.router.ts` commento, `internal-request-routes.ts`) | gap confermato → Fase 1 |
| 2026-11-26 | lettura `auth-session.service.ts:92-122` | login = OAuth password grant a Casdoor; fallimenti loggati in auth_events con ip/ua | `src/modules/auth/services/auth-session.service.ts:96-122` | i dati detection esistono già |
| 2026-11-26 | lettura `auth-session.service.ts:476-503` | lockout per-account è di Casdoor ("too many times" → `account_locked` + minuti) | `src/modules/auth/services/auth-session.service.ts:488-494` | non reimplementare, integrare |
| 2026-11-26 | lettura `auth_event_entity.ts` | schema auth_events: ip_address(inet), user_agent, attempted_username, event_type, success, failure_reason; indici su event_type/username + event_at | `src/modules/auth/auth_event_entity.ts:26-66` | detection fattibile; manca indice su ip_address |
| 2026-11-26 | lettura `cache-port-holder.ts` + SDK `cache-port.ts` | Redis è infrastruttura mandatoria; CachePort = get/set/del/delByPrefix — NESSUN INCR atomico | `src/cache/cache-port-holder.ts:1-60`, `primebrick-v3-sdk/src/cache/cache-port.ts:21-46` | il rate limiter usa il redis client raw (già disponibile via SDK `createRedisClient`), non CachePort |
| 2026-11-26 | lettura `auth-session.router.ts:267-290` | composizione rotte dichiarativa: `registerRoutes` con `permission` + `middlewares[]` per rotta | `src/controllers/http/auth/auth-session.router.ts:267-290` | punto di innesto middleware a construction-time — allineato a enforcement-over-verification |
| 2026-11-26 | grep rotte auth | superficie pubblica completa censita (vedi § Superficie) | `src/controllers/http/auth/*.router.ts` | scope Fase 1 definito |
| 2026-11-26 | lettura client-shield (`http-server.ts` SDK) | lo shield client-key è service-to-service — il browser NON può portare segreti, login è pubblico per costruzione | `primebrick-v3-sdk/src/http/http-server.ts:22-33` | lo shield NON è una difesa per la login — confermato gap |
| 2026-11-26 | `pnpm view rate-limiter-flexible time` | 11.6.1 pubblicato 2026-11-25 (< 7gg — supply-chain rule violata); 11.5.0 = 2026-11-15 ✅ | output pnpm in sessione | pin `11.5.0` |
| 2026-11-26 | web research (MDN/W3C/OWASP/crawlex) | `isTrusted` non falsificabile ma CDP/Playwright/Selenium producono eventi trusted; paste sintetico non riempie i campi per spec W3C | fonti in § Analisi opzioni, Opzione G | escluso client-side paste filtering |

## Status: ⚪ TODO — Plan date: 2026-11-26 / TIC completato in sessione, in attesa di PROCEED

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | **Fase 1a** — Middleware rate limiting dual-bucket (per-IP + per-username) su `/api/v1/auth/login`, `/refresh`, `/mfa/verify`, `/welcome/*` — Redis-backed, config-driven | ⏳ not done | — | core OWASP; vedi § Fase 1 |
| 2 | **Fase 1b** — Error contract 429 generico + `internal_code: rate_limited` + mapping FE i18n (nessun dettaglio diagnostico sull bucket) | ⏳ not done | — | OWASP: no info leak |
| 3 | **Fase 1c** — Config rows in `config_entries` (soglie/finestre/block durations) + invalidation path esistente | ⏳ not done | — | mai costanti hardcoded |
| 4 | **Fase 1d** — Test: vitest unit su bucket logic + E2E/runtime verification (429 dopo N tentativi reali sul dev stack) | ⏳ not done | — | tests are deliverables |
| 5 | **Fase 1e** — Doc update: emendare `authentication.mdx:297` (dottrina infra-only → defense-in-depth) + dev-guide sezione rate limiting | ⏳ not done | — | doc-vs-reality divergence attuale |
| 6 | **Fase 2a** — Detection pipeline su `auth_events`: job schedulato che aggrega e rileva spraying (1 IP → N username) e brute-force distribuito (1 username → N IP) | ⏳ not done | — | dati già presenti; usa job-handler esistente |
| 7 | **Fase 2b** — Security alerting: `security_event` structured logs + notifica admin (canale da decidere in TOC con utente) | ⏳ not done | — | precedente: pattern NATS security_event |
| 8 | **Fase 2c** — Indice `auth_events(ip_address, event_at)` — patch DB per detection queries | ⏳ not done | — | mai editare patch shipped; nuovo patch file |
| 9 | **Fase 3a** — CAPTCHA escalation adattiva (Cloudflare Turnstile o altro), config-gated, OPZIONALE per on-prem air-gapped | ⏳ not done | — | decisione prodotto — vedi opinione Opzione D |
| 10 | **Fase 3b** — MFA enforcement policy per admin + valutazione risk-based step-up | ⏳ not done | — | la difesa statisticamente più efficace |
| 11 | **Fase 4** — Deployment hardening guide: reference config nginx `limit_req` / Cloudflare WAF per clienti self-hosted | ⏳ not done | — | docs primebrick-v3-docs |
| 12 | **NON-FARE** — documentare perché paste-filtering client-side è escluso (in dev-guide authentication) | ⏳ not done | — | chiude la domanda originale in modo permanente |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Threat model (perimetro concordato con l'utente)

Attacchi automatizzati contro la superficie di autenticazione pubblica:

| Attacco | Pattern | Stato attuale |
|---|---|---|
| **Brute force** | N password × 1 account | ⚠️ parziale — lockout Casdoor scatta, ma ogni tentativo è gratis e il lockout è arma di DoS contro la vittima |
| **Credential stuffing** | coppie user/pass da breach | ⚠️ parziale — MFA ferma la compromissione SE attivo, ma i tentativi sono illimitati e non rilevati |
| **Password spraying** | 1 password × N account | ❌ scoperto — lockout per-account non scatta MAI (1 tentativo per account) |
| **Application-layer DDoS** | flood su endpoint costosi | ❌ scoperto — ogni login costa una password grant a Casdoor + hash bcrypt; zero throttling |
| **OTP/email bombing** | flood su `/welcome/send-otp` | ❌ scoperto — endpoint pubblico che spedisce email |

## Superficie pubblica censita (file:line)

Tutte `Permission.PUBLIC`, nessuna throttled oggi:

| Endpoint | Rischio | Evidenza |
|---|---|---|
| `POST /api/v1/auth/login` | brute force, stuffing, spraying, costoso (bcrypt Casdoor) | `auth-session.router.ts:270-274` |
| `POST /api/v1/auth/refresh` | token abuse, volumetrico | `auth-session.router.ts:276-280` |
| `POST /api/v1/auth/mfa/verify` | TOTP brute force (6 cifre = 10⁶, fattibile online senza throttle!) | `auth-mfa.router.ts:189-193` |
| `POST /api/v1/auth/mfa/step-up/verify` | idem | `auth-mfa.router.ts:209-213` |
| `POST /api/v1/auth/welcome/verify` + `/verify-otp` | OTP brute force | `auth-invitation.router.ts:153-175` |
| `POST /api/v1/auth/welcome/send-otp` | email bombing | `auth-invitation.router.ts:160-164` |
| `GET /api/v1/auth/users/check-email` / `check-username` | **user enumeration** | `auth-check.router.ts:60-68` |
| passkey signin begin/finish | volumetrico | `auth-webauthn.router.ts` |

⚠️ Nota critica emersa in TIC: **`/mfa/verify` senza throttle rende il TOTP attaccabile online** — 6 cifre su endpoint illimitato è un brute force di complessità bassa. La Fase 1 chiude anche questo.

## Analisi opzione per opzione — opinioni

### Opzione A — Rate limiting applicativo dual-bucket (BE middleware)

**Tecnica**: middleware Express che prima di ogni rotta auth consuma da due bucket indipendenti per richiesta: uno chiavato su username (o challenge token), uno su IP. Redis-backed (obbligatorio: il BE è multi-pod per design — vedi commenti cross-pod in `config.ts:9-16` — contatori in-memory per pod moltiplicherebbero il limite effettivo per il numero di repliche).

**Librerie valutate**:
- `rate-limiter-flexible@11.5.0` — store Redis atomico via LUA, `consume(key)` per bucket indipendenti, `blockDuration` nativo. *Caveat onesto*: su Redis implementa fixed-window+block, non true sliding window — worst case burst 2× threshold ai confini di finestra; mitigabile con finestre corte + blockDuration lungo. È il compromesso standard dell'industria.
- `express-rate-limit@8.7.5` + `rate-limit-redis` — più semplice ma modellato sul singolo limiter per rotta; il dual-bucket richiederebbe comunque due istanze coordinate e la gestione "quale bucket ha sparato" senza leak è più scomoda.
- Hand-rolled su `CachePort` — **scartato**: `CachePort` non ha INCR atomico (`cache-port.ts:21-46` = solo get/set/del); reimplementare la concorrenza su Redis è reinventare la ruota con race condition incluse.

**Mia opinione**: ✅ **RACCOMANDATA — è il core del piano**. È l'unica misura che copre simultaneamente brute force, spraying, stuffing-sweep e volumetrico applicativo. `rate-limiter-flexible` è la scelta giusta: il dual-bucket è il suo caso d'uso naturale, il redis client raw è già disponibile via SDK `createRedisClient` (stesso usato da `initCache`). Enforcement a construction-time dentro `middlewares[]` di `registerRoutes` — allineato alla dottrina enforcement-over-verification: una rotta auth senza il bucket dichiarato è un errore di composizione visibile, non un check saltabile.

### Opzione B — Progressive delay / backoff (tar-pit)

**Tecnica**: ritardo crescente prima di rispondere ai tentativi falliti ripetuti.

**Mia opinione**: ⚠️ **complemento minore, non pilastro**. Il sleep in-process lega connessioni e worker — sotto flood diventa auto-DoS (effetto slowloris inverso). La versione sana è già coperta dal `blockDuration` del bucket (delay temporale = blocco). Non implementare come meccanismo separato; la sua funzione è assorbita dalla Fase 1.

### Opzione C — Detection pipeline su `auth_events`

**Tecnica**: job schedulato (infrastruttura job-handler già esistente) che aggrega `auth_events` — le query sono fattibili oggi: `AuthEventsService.aggregateEvents` esiste (`auth-events.service.ts:146-164`) e lo schema ha tutti i campi. Pattern: 1 IP → N username distinti/5min = spraying; 1 username → N IP/5min = brute force distribuito; spike login_failed globale = campaign in corso.

**Mia opinione**: ✅ **raccomandata come Fase 2, mai come prima linea**. È detection, non prevention — per dottrina è la "seconda rete". Ma costa poco perché i dati li abbiamo già e trasforma un log morto in telemetria di sicurezza attiva. Il precedente `security_event` strutturato (NATS `nats_message_integrity_violation`, vedi fix A7 recente) è il formato canonico da riusare. Attenzione: serve l'indice `(ip_address, event_at)` — patch DB nuovo.

### Opzione D — CAPTCHA escalation adattiva (Turnstile)

**Tecnica**: dopo X fallimenti da un IP, il BE esige un token Turnstile verificato server-side; la FE mostra il widget solo quando richiesto (friction zero per utenti legittimi al primo tentativo).

**Mia opinione**: 🟡 **valida ma NON nel core — Fase 3, config-gated opzionale**. Pro: è l'unica misura che scala contro credential stuffing massivo con IP rotanti residenziali. Contro: (1) dipendenza esterna Cloudflare — deployment on-prem/air-gapped (target clienti Primebrick) potrebbero non avere internet; (2) complessità FE+BE non banale; (3) con MFA + dual-bucket il valore aggiunto è incrementale, non critico. Se implementata: mai obbligatoria, sempre config row disattivabile.

### Opzione E — Protezione infrastrutturale (WAF/reverse proxy/CDN)

**Tecnica**: nginx `limit_req` / Cloudflare WAF davanti al BE.

**Mia opinione**: ✅ **necessaria ma insufficiente da sola — e non è governabile dal prodotto**. La dottrina attuale (`authentication.mdx:297`) dice "configurata a livello infra" — ma questo è un *wishful contract*: nulla verifica che l'infra del cliente ce l'abbia davvero, e in dev sicuramente non c'è. Il volumetrico DDoS serio (L3/L4, flood L7 massivo) NON è fermabile in Express — serve per forza quel layer. Risoluzione: defense-in-depth — app-layer come baseline governata e testata (Fase 1), infra-layer come deployment guide documentata (Fase 4). La doc va emendata: da "è compito dell'infra" a "l'app ha la sua baseline; l'infra aggiunge il volumetrico".

### Opzione F — MFA enforcement / risk-based step-up

**Mia opinione**: ✅ **la singola misura statisticamente più efficace** (Microsoft: 99.9% compromissioni da password evitate) — e l'infrastruttura c'è già tutta (TOTP, step-up, passkey). La leva rimasta è di *policy*: config per rendere MFA obbligatorio almeno per admin, enforcement a enrollment. Il risk-based adaptiveness (step-up solo su segnali: IP nuovo, paese insolito) è potente ma complesso — lo terrei come evoluzione, non come prerequisito. Fase 3.

### Opzione G — Paste filtering / isTrusted client-side (la domanda originale)

**Mia opinione**: ❌ **security theater per questo threat model — NON implementare**. Evidenza empirica raccolta: (1) il paste sintetico da `dispatchEvent` non riempie nemmeno i campi per spec W3C ("will not affect the contents of the document") — la minaccia naive non funziona già da sola; (2) Playwright/Selenium/CDP producono eventi con `isTrusted: true` — bypass gratis; (3) i bot non incollano: impostano `.value` (zero eventi) o iniettano keystroke; (4) bloccare il paste è anti-pattern esplicito NIST SP 800-63B / NCSC ("SPP") / audit Lighthouse — danneggia i password manager che sono la difesa #1 anti-phishing degli utenti. Da documentare come decisione chiusa (task 12) così non torna.

### Opzione H — Honeypot fields/endpoints

**Mia opinione**: 🟡 **marginalmente utile, costo quasi zero, priorità bassa**. Un campo invisibile nel form compilato solo da bot naive è un segnale di detection quasi gratis — ma i bot seri non compilano form, chiamano l'API. Valutare dentro la Fase 2 come segnale aggiuntivo, mai come feature a sé.

### Opzione I — Tuning lockout Casdoor

**Mia opinione**: 🟡 **da verificare, non da assumere**. Il lockout per-account di Casdoor resta utile come ultimo miglio, ma (1) non copre spraying, (2) è arma di DoS contro la vittima se le soglie sono troppo aggressive. In TOC pre-flight: leggere la config corrente dell'app Casdoor `primebrick-api` e valutare se i valori (failed attempts, freeze minutes) sono sensati rispetto ai bucket della Fase 1 — idealmente il bucket per-username spara PRIMA del lockout Casdoor, rendendo il lockout residuale e raro.

## Raccomandazione finale e phasing

```
Fase 1 (core, autonoma)     → dual-bucket rate limiting + 429 contract + config rows + test
Fase 2 (detection)          → job su auth_events + security_event alerting + indice ip
Fase 3 (rafforzamento)      → MFA enforcement policy + CAPTCHA adattivo opzionale
Fase 4 (deployment)         → guida infra-layer per self-hosted
Trasversale                 → doc: niente paste-filtering, dottrina defense-in-depth
```

**Perché questo ordine**: la Fase 1 è l'unica che chiude tutti e cinque gli attacchi del threat model simultaneamente con enforcement costruttivo; le altre fasi sono additive e indipendenti — ognuna shippabile separatamente. La Fase 1 non dipende da nulla che non esista già (Redis, redis client SDK, registerRoutes, config_entries, auth config cache invalidation).

## Fase 1 — design detail (pseudo-codice per TOC = trascrizione)

### Config rows proposte (config_entries, group `security`)

| key | type | default | reserved |
|---|---|---|---|
| `security_login_rate_limit_ip_points` | bigint | `20` | sì |
| `security_login_rate_limit_ip_duration_sec` | bigint | `300` | sì |
| `security_login_rate_limit_ip_block_sec` | bigint | `900` | sì |
| `security_login_rate_limit_user_points` | bigint | `5` | sì |
| `security_login_rate_limit_user_duration_sec` | bigint | `300` | sì |
| `security_login_rate_limit_user_block_sec` | bigint | `900` | sì |
| `security_mfa_verify_rate_limit_points` | bigint | `5` | sì |
| `security_welcome_otp_rate_limit_points` | bigint | `3` | sì |

Razionale valori: 5 tentativi/5min per username spara PRIMA del lockout Casdoor tipico (che conta fallimenti, non tentativi — il bucket conta anche i successi, volutamente); 20/5min per IP consente un ufficio dietro NAT ma ferma sweep. Tuning post-UAT via config, mai redeploy.

### Middleware shape (construction-time enforcement)

```ts
// src/http/auth-rate-limit.middleware.ts — trasporto, no business logic
// factory chiamata in wiring.ts, inserita in middlewares[] per ogni rotta auth pubblica
export function makeAuthRateLimitMiddleware(opts: {
  userKeyExtractor: (req: Request) => string | null; // username, challenge token, o null
  ipLimiter: RateLimiterRedis;    // bucket per-IP
  userLimiter: RateLimiterRedis;  // bucket per-username/challenge
}): RequestHandler {
  return asyncHandler(async (req, res, next) => {
    // 1. fail-closed se Redis down? NO — decisone: fail-open + security_event log
    //    (Redis down è già 503-wide per /health; chiudere login renderebbe
    //    l'outage Redis un outage totale di auth. OWASP-aligned: availability first,
    //    ma l'evento È un security_event strutturato — mai silenzioso)
    // 2. consume su ENTRAMBI i bucket indipendentemente (OWASP: mai chiave combinata)
    // 3. se uno spara → 429 generico, RFC7807, internal_code "rate_limited",
    //    STESSO body per entrambi i bucket (no oracle su quale bucket)
  });
}
```

### Decisioni di design da ratificare con l'utente in TOC (STOP items)

1. **Fail-open vs fail-closed quando Redis è down** — raccomandazione: fail-open + `security_event` (Redis down è già incidente visibile via /health; chiudere login amplifica l'outage)
2. **x-forwarded-for trust** — oggi `request_ctx.ip_address` usa `x-forwarded-for` senza validazione (`auth-session.router.ts:98`): spoofabile! Per il rate limiting serve decidere: trust proxy configurato o IP socket. Rischio: bucket keyed su header spoofabile = attacker evade il bucket per-IP ruotando l'header. **Punto critico da risolvere nel design TOC** — probabile soluzione: `app.set('trust proxy', ...)` configurabile + keying sul primo IP della chain solo se proxy fidato.
3. **MFA verify**: keyed su challenge token (non username — il token è il contesto), con consumo anche a successo.
4. **check-email/check-username**: user enumeration — valutare se chiuderle dietro autenticazione o bucket per-IP stretto. Decisione prodotto (rompe flussi UX?).

### Acceptance criteria Fase 1

- [ ] 6° tentativo login stesso username in 5min → 429 `rate_limited` anche da IP diversi (2 shell/curl distinti)
- [ ] 21° tentativo login stesso IP in 5min su username diversi → 429 anche se nessun username ha superato il suo bucket
- [ ] 429 identico nei due casi (byte-comparable body — no oracle)
- [ ] Redis down → login funziona + `security_event` `rate_limiter_degraded` nei log
- [ ] config row change → invalidateAuthConfig → nuovo threshold attivo senza restart
- [ ] test vitest: bucket logic unit + test runtime sul dev stack (spec persistente, canonical location — mai probe usa-e-getta)
- [ ] `pnpm run check` verde; doc `authentication.mdx` emendata nella stessa PR

### Scope esplicitamente FUORI dalla Fase 1

Niente CAPTCHA, niente MFA policy change, niente modifica lockout Casdoor, niente paste/client-side filtering. Deviazione = STOP + update piano.

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
