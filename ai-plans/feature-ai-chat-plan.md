# Primebrick AI Chat — Piano Architetturale v1

> Documento vivente. Versione: 1.2 (2026-07-26). Stato: piano consolidato con
> verifiche empiriche complete (template microservizio, SDK abstraction, KB
> analysis, PG compatibility, version panel). In attesa di approvazione per
> implementazione.
>
> Scope: aggiungere nella app topbar una CTA che apre un pannello di destra dedicato
> a una chat con AI. L'AI risponde a due macro-temi: (1) "come funziona X" con
> risposte dalla knowledge base docs + eventuale navigazione alla pagina rilevante;
> (2) ricerca/domande complesse sulle entità ("trova l'utente con ruolo
> administrators", "quante volte l'utente X ha fatto login") con eventuale
> navigazione alla pagina con filtri preimpostati, oppure risposta concreta in chat
> quando non esiste una pagina per le evidenze.

## 1. Decisioni consolidate

| Decisione | Scelta | Motivazione |
|---|---|---|
| **Framework orchestrazione** | Vercel AI SDK 7.x (`ai` + `@ai-sdk/mcp` + `@ai-sdk/openai-compatible`) | Apache-2.0 (MIT-compatible), MCP client nativo, agent loop con `maxSteps`/`ToolLoopAgent`, streaming SSE first-class, provider pluggable, maturo (25k+ star, 18M download/sett). Confronto empirico in §6. |
| **LLM runtime default (CPU-only Docker)** | **mistral.rs** (`mistral.rs server`) + Qwen3-4B-Instruct-2507 **Q4_K_M** con **constrained tool calling** (`strict: true`) | MIT, CPU-native, ~2.5GB RAM, ~14% più veloce di llama.cpp su CPU, **schema validity 100% garantita** via LLGuidance token masking (il modello fisicamente non può emettere tool call JSON non valido), tool calling deterministico anche su modelli non-OpenAI, MCP client nativo con strict mode automatico. La quantizzazione Q4_K_M diventa viable perché l'engine garantisce validità sintattica (benchmark: Qwen3-1.7B Q4_K_M FCR 0.844 vs Q8_0 0.842 — statisticamente indistinguibile). Confronto empirico in §7. **Fallback documentato**: llama.cpp + Qwen3-4B Q8_0 (~5.5GB, più maturo, de facto standard). **Lightweight**: mistral.rs + Qwen3-1.7B-FC Q4_K_M (~1.0GB, per RAM molto stretta). |
| **LLM provider pluggability** | OpenAI-compatible (`base_url` + `api_key` + `model` via config) | Standard de facto. L'utente finale può puntare a OpenAI, Anthropic (via proxy), Zhipu GLM, Moonshot Kimi, DeepSeek, Groq, Ollama, vLLM, LM Studio, ecc. |
| **Embedding KB default (CPU, zero costo)** | `@xenova/transformers.js` + `Xenova/all-MiniLM-L6-v2` (384-dim) | MIT, ~22MB, veloce su CPU, zero API key, zero GPU. Pluggable a OpenAI-compatible embeddings endpoint. |
| **Vector store** | pgvector su PostgreSQL esistente | Zero nuove dipendenze, query con metadati (repo, path, title), filtraggio nativo. **Verificato**: l'immagine PG attuale è `postgres:18-bookworm` (vanilla, NO pgvector). **Azione richiesta**: switch a `pgvector/pgvector:0.8.5-pg18-bookworm` (stessa base PG 18 + pgvector precompilato, pin versione per sicurezza CVE-2026). Aggiornare `infra/docker-compose.postgres.yml` riga 31. |
| **Orchestratore** | Microservizio dedicato `primebrick-us-v3/ai/` (**Bun + TS + Docker**, sottodirectory in `primebrick-us-v3/` come `emailsender/`), registrato via NATS service registry | Scalabilità GPU separata in futuro, isolamento, riuso service registry esistente. **Runtime: Bun** (non Node) — coerente con `emailsender`. **Repo: sottodirectory `primebrick-us-v3/ai/`** (consistenza con pattern esistente, workspace condiviso). |
| **SDK microservice blueprint** | **NUOVO**: `createMicroservice(options)` builder function in `@primebrick/sdk` che astrae ~140 linee di boilerplate (env validation, DAL init, ConfigLoader, auth config, NATS, ServiceRegistrar, HealthCheck, createHttpServer, GracefulShutdown) | Analisi empirica: `emailsender/src/index.ts` = 183 linee, ~140 sono puro boilerplate copy-paste. Con `createMicroservice()`: 183 → ~35 linee (-81%). **Prerequisito Fase 2**: refactoring SDK prima di scaffoldare il 2° microservizio. Vedi §12. **Pattern: builder/factory (NON decorator)** — procedurale async init con ordering stretto, coerente con BE (`runStartupTasks()`). |
| **LLM Docker** | `docker-compose.ai-llm.yml` in `primebrick-be-v3/infra/` (insieme a `docker-compose.postgres.yml`) | LLM è infrastruttura core, non microservizio. Stessa cartella delle altre infra. |
| **Version panel LLM** | LLM in sezione **Core Modules** di `VersionsPanel.svelte`, via BE health endpoint `checkLlm()` → `checks.llm: { ok, version, model }` | Pattern consistente con Redis/NATS/Casdoor. L'AI microservice espone LLM info nel suo health check, il BE lo aggrega. Zero nuove API call nel FE. Mostra versione mistral.rs + modello attivo (es. `Qwen3-4B-Instruct-2507 Q4_K_M`). |
| **Patch DDL** | **Modifica `00000000000000_init_database.sql` in-place** (NO patch incrementale) + script fire-and-forget per aggiornare `content_sha256` su DB live | Early stage: nessun DB production critico. Pattern documentato in `.devin/rules/patch-sha256-management.md`. Aggiunge `CREATE EXTENSION vector` + tabelle `docs_kb`, `ai_conversations`, `ai_messages`, `auth_events` all'init esistente. |
| **PG image swap** | Custom Dockerfile `FROM pgvector/pgvector:0.8.5-pg18-bookworm` + compile pg_partman 5.4.3 da sorgente, in `infra/postgres-custom/Dockerfile` | **Verificato**: pgvector image è basata su `postgres:18-bookworm` (stesso base, stesso PG 18.x, stesso layout volume `/var/lib/postgresql/18/docker`). Volume `primebrick_pg18_data` compatibile unchanged, zero data migration. **Bloccante risolto**: pgvector image non ha repo PGDG (li rimuove), repo PGDG PG18 sono broken — quindi pg_partman va compilato da sorgente nel Dockerfile custom. Niente entrypoint override. |
| **FE ↔ AI path** | Via BE reverse proxy `/api/v1/ai/*` (auth centralizzata, JWT utente forwardato) | Single entry point, RBAC centralizzato, no esposizione diretta del microservizio. **Verificato**: il proxy attuale (`proxy-service.ts` riga 131) bufferizza con `await response.text()` — serve nuova fn `proxyRequestSse` che pipea lo stream. |
| **Tool execution** | AI microservice = MCP **client** verso BE MCP server (`POST /mcp`, Streamable HTTP, Bearer JWT utente). RBAC enforced lato BE per ogni tool call. | **Verificato**: il MCP server (`src/modules/mcp/index.ts`) usa `NodeStreamableHTTPServerTransport` stateless, `requireBearerAuth` con token verifier Casdoor. L'AI microservice forwarda il JWT utente in `Authorization: Bearer`. Riuso totale degli 11 tool MCP esistenti. **Filosofia design**: tutti i tool sono generici (parameterized by `module, entity`), massima riusabilità, minimo context space. **NO tool specifici** come `count_auth_events` — vedi §15. **`auth_events`** è una entità registrata, queryable via `list_entities` con aggregazione. **`user_profiles`** esposto via MCP, **`role_mappings`** NO (ha solo REST API) — per "trova utente con ruolo X" si usa `list_entities` su `user_profiles` con filtro su campo `roles` (jsonb array, operatore `@>` da aggiungere all'enum). |
| **Accesso RBAC alla feature** | `AUTHENTICATED_USER` (tutti gli autenticati) | Massima adozione. I tool restano gated dai permensi utente (difesa in profondità). |
| **Scope v1** | RAG docs + navigate ✓ · Ricerca entità + navigate con filtri ✓ · Query audit login ✓ · Persistenza conversazione ✓ | MVP completo end-to-end sui due macro-temi + storico. |
| **KB docs** | 3 fonti vettorizzate in pgvector `docs_kb`: (1) **MDX docs** esistenti (95 file), (2) **OpenAPI specs** chunked per endpoint (`apis/*.json`), (3) **4 doc critiche AUTO-GENERATE** da codice (Entity Field Reference, Filter Operator Reference, Filter Syntax Guide, Navigation Map). Re-index manuale in v1. | **Verificato**: 95 MDX file, buoni per how-to/conceptual ma **mancano 4 doc critiche** per AI. Fonti di verità empiriche: `*.meta.ts` + `*_entity.ts` (Entity Field Reference), `src/db/repository/dsl.ts` SqlOperator type (Filter Operator Reference), `dto.ts` FilterConditionSchema (Filter Syntax Guide), FE routes + meta endpoints (Navigation Map). **Processo auto-generation**: nuovo script `generate-reference-docs.mjs` nella build chain docs, estende skill `make-docs` — vedi §14. Query data ("chi ha fatto più login") NON usa KB, usa solo MCP tools con aggregazione. Vedi §13, §14, §15. |
| **Conversazioni** | PG tabelle `ai_conversations` + `ai_messages`. Redis per rate-limit + cache embedding. | Persistenza duratura, audit, Redis per il volatile. |
| **NATS** | Service registry (registrazione microservizio). Non per tool call in v1 (HTTP MCP). | Riuso infrastruttura esistente. Tool call via HTTP MCP è più semplice e standard. |

### 1.1 Cosa NON facciamo in v1 (e perché)

- **Fine-tuning**: KB piccola (92 file), cambia spesso (sync da repo), costo alto, rigidità. RAG basta. Si misura prima.
- **CrewAI / LangChain / LangGraph**: overkill per v1. Il loop agent è ~100 righe con Vercel AI SDK. La porta resta aperta per v2 (sub-agenti, workflow complessi).
- **Modello WASM in browser (WebLLM/transformers.js FE)**: non pronto per tool-calling affidabile, download 1-4GB, richiede WebGPU. Rivalutare in v2 per routing on-device.
- **Federazione MCP per-modulo (KB delegata ai moduli)**: idea giusta per il futuro, prematura in v1. L'MCP è già federabile per design.
- **vLLM come default**: CPU-only è sperimentale, pensato per GPU.
- **LM Studio come default**: licenza proprietaria, non OSS.

## 2. Architettura

```
┌─────────────── FE (SvelteKit) ─────────────────────────────┐
│ AppTopbar.svelte                                            │
│   └─ CTA "AI" → openSheet('shell.aiChat')                   │
│                                                              │
│ sheet-manager.svelte.ts                                      │
│   └─ nuovo panelId 'shell.aiChat'                            │
│                                                              │
│ AiChatPanel.svelte (sheet destra, side='right')             │
│   ├─ message thread (streaming SSE, markdown, citations)    │
│   ├─ tool-call confirmation UI (navigate)                   │
│   ├─ input box                                               │
│   └─ ClientToolRegistry                                      │
│       └─ navigate({route, query}) → goto()                  │
│         (con filter DSL serializzato in query string)       │
│                                                              │
│ entity-list pages (customers, users, ...)                   │
│   └─ useUrlFiltersSync (NUOVO composable)                   │
│       legge filters[] da page.url.searchParams on mount     │
└──────────────────────┬──────────────────────────────────────┘
                       │ POST /api/v1/ai/chat (SSE)
                       │ Authorization: Bearer <JWT utente Casdoor>
┌──────────────────────▼──────────────────────────────────────┐
│ BE (primebrick-be-v3)                                        │
│   proxy-router.ts                                            │
│     └─ NUOVA route /api/v1/ai/* (rbacHandler AUTHENTICATED)  │
│   proxy-service.ts                                           │
│     └─ NUOVA fn proxyRequestSse (pipe stream, no buffer)     │
│   service_registry lookup per code='ai' → base_url           │
│   forwarda JWT utente (Authorization header)                 │
│                                                              │
│   mcp/ (esistente, riusato)                                  │
│     └─ NUOVO: auth_events come entità registrata + aggregazione su list_entities│
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/SSE (internal network, JWT utente)
┌──────────────────────▼──────────────────────────────────────┐
│ NUOVO microservizio: primebrick-ai-v3                        │
│   (Node 24 + TS + Docker, registrato via NATS)              │
│                                                              │
│   AiOrchestrator (Vercel AI SDK)                             │
│     ├─ streamText({ model, tools, maxSteps, messages })      │
│     ├─ RAG retrieval: pgvector search su docs_kb             │
│     ├─ ServerTools: MCP client → BE /mcp (JWT utente)        │
│     │   list_entities, get_entity, get_entity_audit,         │
│     │   list_entities + aggregate (esteso)                     │
│     ├─ ClientTools: navigate (emesso come evento SSE)        │
│     └─ LLM provider: createOpenAICompatible({baseURL,key})   │
│                                                              │
│   Embedding pipeline                                         │
│     ├─ default: @xenova/transformers.js (CPU, all-MiniLM)    │
│     └─ pluggable: OpenAI-compatible embeddings endpoint      │
│     legge MDX da docs repo (path config), splitta, upsert    │
│                                                              │
│   Conversation store (PG: ai_conversations, ai_messages)     │
│   Rate limiter (Redis token bucket per-user)                 │
│   Embedding cache (Redis, key = hash chunk)                  │
└──────────────────────────────────────────────────────────────┘

                       ┌──────────────────────────────────────┐
                       │ LLM runtime (pluggable)               │
                       │  default Docker: llama.cpp + Qwen2.5  │
                       │  3B Q4_K_M (CPU, MIT, OpenAI /v1)     │
                       │  oppure: Ollama, OpenAI, Claude, GLM, │
                       │  Kimi, DeepSeek, Groq, ...            │
                       └──────────────────────────────────────┘
```

### 2.1 Flusso di una richiesta

1. Utente scrive "Trova l'utente con ruolo administrators" nel pannello AI.
2. FE `POST /api/v1/ai/chat` con `Authorization: Bearer <JWT>` e body `{conversationId, message}`.
3. BE: `rbacHandler([AUTHENTICATED_USER])` valida JWT → lookup `service_registry` per `code='ai'` → `proxyRequestSse` pipea la richiesta al microservizio AI, forwardando l'header `Authorization`.
4. AI microservice:
   a. Carica la conversazione da PG (o ne crea una nuova).
   b. Recupera contesto RAG da `docs_kb` (se la domanda è "come funziona X") — opzionale, deciso dal LLM via tool `search_docs`.
   c. Chiama `streamText({ model, tools, messages, maxSteps: 8 })`.
   d. Il LLM emette tool call `list_entities({entity: 'user_profile', filter: {roles: {contains: 'administrators'}}})`.
   e. L'orchestratore esegue il tool via MCP client verso BE `/mcp`, forwardando il JWT utente. Il BE applica RBAC: se l'utente non ha `users.read.all`, il tool fallisce e il LLM riceve un errore.
   f. Il LLM riceve i risultati, genera la risposta + (opzionale) tool call `navigate({route: '/system/settings/users', query: {filters:[{field:'roles',op:'@>',value:['administrators']}]}})`.
   g. `navigate` è un **client tool**: l'orchestratore NON lo esegue, lo emette come evento SSE `{type:'tool_call', tool:'navigate', args:{...}}`.
   h. Il testo della risposta viene streammato come eventi SSE `{type:'text-delta', text:'...'}`.
5. FE: renderizza lo streaming, mostra la risposta, e quando riceve `tool_call navigate` chiede conferma all'utente ("Vuoi che apra la pagina con i filtri preimpostati?"). Se confermato, `ClientToolRegistry.navigate()` chiama `goto('/system/settings/users?filters[0][field]=roles&filters[0][op]=@>&filters[0][value]=administrators')`.
6. La pagina users legge i filtri dall'URL via `useUrlFiltersSync` e pre-popolal la lista.
7. AI microservice: persiste i messaggi (user + assistant + tool calls + tool results) in `ai_messages`.

### 2.2 Casi speciali

- **"Quante volte l'utente X ha fatto login"**: il LLM chiama `list_entities({ entity: 'auth_events', filters: { event_type: 'login', user_profile_uuid: '...' }, aggregate: { type: 'count' } })` (estensione generica di `list_entities`, vedi §15). Non c'è pagina per le evidenze → il LLM riporta il dato in chat. Nessun `navigate`.
- **"Come si cambia la password"**: RAG retrieval su `docs_kb` → il LLM compone la risposta citando la fonte + (opzionale) `navigate` alla pagina settings.
- **Tool non permesso per RBAC**: il tool fallisce lato BE con 403. Il LLM riceve l'errore e risponde "Non hai i permessi per questa operazione" (o simile). Nessun leak di dati.

## 3. Sicurezza & RBAC

- **Identità**: l'AI gira **come l'utente**. Il BE forwarda il JWT utente ai tool MCP. L'AI non vede né fa nulla che l'utente non potrebbe.
- **Prompt injection**: difesa in profondità. Anche se l'utente tenta di far chiamare tool non permessi, il tool fallisce lato server (RBAC). Il filtro avviene al tool, non al prompt.
- **Dati sensibili**: l'AI può mostrare solo dati che l'utente è autorizzato a vedere — comportamento corretto. Mai dati fuori dal perimesso RBAC.
- **Audit**: ogni tool call AI va loggato (chi, cosa, risultato) — riusa l'audit trail esistente del MCP server. Le conversazioni sono persistite in PG (`ai_messages`) con `user_uuid`.
- **Cost/abuso**: rate limit Redis (token bucket per-user, es. 20 msg/min, 1000 token/min), cap token per richiesta (es. 4096), cap turni per conversazione (`maxSteps: 8`), cap conversazioni attive per utente.
- **Accesso alla feature**: sentinel `AUTHENTICATED_USER`. Configurabile in futuro a permission dedicata `ai.chat.use` se serve restringere.
- **Dati in uscita verso LLM esterno**: se l'utente configura un LLM cloud (OpenAI/Claude/...), i prompt escono dall'infra. Documentare chiaramente. Default bundled (llama.cpp) tiene i dati in casa. Considerare un'opzione di redaction/mascheramento campi sensibili prima dell'invio al LLM (v1.1).

## 4. Modello dati (nuove tabelle PG)

```sql
-- Abilita pgvector (nuova patch DDL)
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base docs (chunked + embedded)
CREATE TABLE docs_kb (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  repo        text NOT NULL,          -- 'backend' | 'frontend' | 'sdk' | 'dal' | 'microservices' | 'docs'
  path        text NOT NULL,          -- 'pages/api/mcp-server.mdx'
  title       text NOT NULL,          -- dal frontmatter
  chunk_idx   int  NOT NULL,          -- indice chunk dentro il file
  content     text NOT NULL,          -- testo del chunk
  embedding   vector(384) NOT NULL,   -- all-MiniLM-L6-v2 = 384 dim
  metadata    jsonb NOT NULL DEFAULT '{}',
  content_hash text NOT NULL,         -- sha256 del content, per re-index incrementale
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo, path, chunk_idx)
);
CREATE INDEX ON docs_kb USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON docs_kb (repo);
CREATE INDEX ON docs_kb (content_hash);

-- Conversazioni AI
CREATE TABLE ai_conversations (
  uuid         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid    uuid NOT NULL,
  title        text,                   -- auto-generato dal primo messaggio o dal LLM
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ai_conversations (user_uuid, updated_at DESC);

-- Messaggi AI (include user, assistant, tool_call, tool_result)
CREATE TABLE ai_messages (
  uuid             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_uuid uuid NOT NULL REFERENCES ai_conversations(uuid) ON DELETE CASCADE,
  role             text NOT NULL,      -- 'user' | 'assistant' | 'tool'
  content          jsonb NOT NULL,     -- testo + tool calls + tool results (formato Vercel AI SDK)
  tokens_in        int,
  tokens_out       int,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ai_messages (conversation_uuid, created_at);

-- Audit auth events (per "quante volte ha fatto login")
CREATE TABLE auth_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_profile_uuid uuid,                  -- NULL per failed login (no JWT, no UUID risolvibile)
  attempted_username text,                 -- username tentato (presente per login_failed, NULL per eventi dove non applicabile)
  event_type      text NOT NULL,       -- 'login' | 'logout' | 'mfa_verify' | 'passkey_signin' | 'login_failed'
  event_at        timestamptz NOT NULL DEFAULT now(),
  ip_address      inet,
  user_agent      text,
  success         boolean NOT NULL,
  failure_reason  text
);
CREATE INDEX ON auth_events (user_profile_uuid, event_at DESC);
CREATE INDEX ON auth_events (event_type, event_at DESC);
CREATE INDEX ON auth_events (attempted_username, event_at DESC);
```

## 5. Piano di implementazione (fasi)

### Fase 1 — Verifiche tecniche ✅ COMPLETATA

Risultati empirici (vedi §8 per dettagli):

| Verifica | Esito | Azione richiesta |
|---|---|---|
| Entity-list deep-link filtri | ❌ Non esiste | Aggiungere composable `useUrlFiltersSync` + parsing in `bootstrapCustomersList()`/`init()` |
| Audit login | ❌ Non loggato | Nuova tabella `auth_events` (entità registrata) + insert in 3 punti flow auth + estensione `list_entities` con aggregazione (NO nuovo tool specifico) |
| Proxy HTTP/SSE | ❌ Solo WS, bufferizza | Nuova route `/api/v1/ai/*` + fn `proxyRequestSse` (pipe stream) |
| pgvector | ❌ Non installato | Patch DDL `CREATE EXTENSION vector` |

### Fase 2 — Microservizio AI, fondamenta

**Template di riferimento**: `primebrick-us-v3/emailsender/` (microservizio esistente, stesso pattern). Tutti i dettagli empirici in §8. **Repo**: sottodirectory `primebrick-us-v3/ai/` (confermato).

#### Fase 2.0 — SDK microservice blueprint (PREREQUISITO)

**Prima di scaffoldare il 2° microservizio**, estrarre il boilerplate comune in SDK. Vedi §12 per dettagli completati.

- [ ] **Nuova funzione `createMicroservice(options)`** in `primebrick-v3-sdk/src/microservice/create-microservice.ts`:
  - Astrae: `readServiceVersion()`, env validation, DAL init, ConfigLoader wiring, auth config init, NATS connection, ServiceRegistrar setup, HealthCheck setup, createHttpServer setup, GracefulShutdown setup, main() wrapper.
  - Ritorna `MicroserviceContext` con `{ configLoader, dal, natsClient, registrar, healthCheck, server, shutdown, authConfig }`.
  - Opzioni service-specific: `routeHandler`, `natsSubscriptions`, `authDependencySetters`, `customHealthChecks`, adapters (config, auth, apikey, healthcheck).
- [ ] **Refactoring `emailsender/src/index.ts`** per usare `createMicroservice()` — 183 → ~35 linee. Questo valida il pattern sul 1° microservizio prima di usarlo sul 2°.
- [ ] **Export `createMicroservice`** da `primebrick-v3-sdk/src/index.ts`.
- [ ] **Test**: emailsender esistente continua a funzionare (stesso behavior, stesso health check, stessa registrazione NATS).

#### Fase 2.1 — PG custom Dockerfile (pgvector + pg_partman)

- [ ] **Crea `primebrick-be-v3/infra/postgres-custom/Dockerfile`**:
  ```dockerfile
  FROM pgvector/pgvector:0.8.5-pg18-bookworm
  RUN apt-get update && \
      apt-get install -y --no-install-recommends build-essential postgresql-server-dev-18 git && \
      rm -rf /var/lib/apt/lists/*
  ARG PG_PARTMAN_VERSION=v5.4.3
  RUN git clone --branch ${PG_PARTMAN_VERSION} https://github.com/pgpartman/pg_partman.git /tmp/pg_partman && \
      cd /tmp/pg_partman && make && make install && rm -rf /tmp/pg_partman
  RUN apt-get remove -y build-essential postgresql-server-dev-18 git && \
      apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
  ```
- [ ] **Aggiorna `primebrick-be-v3/infra/docker-compose.postgres.yml`**:
  - Riga 31: `image: postgres:18-bookworm` → `build: context: ./postgres-custom, dockerfile: Dockerfile`
  - Rimuovi entrypoint override (righe 46-52) — extensions pre-installate
  - Aggiungi `command: postgres -c shared_preload_libraries=pg_partman_bgw`
  - Volume `primebrick_pg18_data:/var/lib/postgresql` unchanged (compatibile, zero data migration)
- [ ] **Verifica empirica**: `docker compose build` + `docker compose up -d` + `psql -c "CREATE EXTENSION vector; CREATE EXTENSION pg_partman;"` → entrambe OK.

#### Fase 2.2 — Patch DDL in-place (NO patch incrementale)

- [ ] **Modifica `primebrick-be-v3/db-meta/patches/00000000000000_init_database.sql` in-place**:
  - Aggiungi `CREATE EXTENSION IF NOT EXISTS vector;` (dopo pgcrypto/pg_partman, riga ~20)
  - Aggiungi tabella `docs_kb` (schema §4, embedding dimension 384 per all-MiniLM-L6-v2, indice ivfflat cosine)
  - Aggiungi tabelle `ai_conversations`, `ai_messages` (schema §4)
  - Aggiungi tabella `auth_events` (schema adattato da `customers_audit`: PARTITION BY RANGE + pg_partman 1 month, campi `user_profile_uuid`, `event_type`, `ip_address inet`, `user_agent text`, `success boolean`, `failure_reason text`, indici su `user_profile_uuid, changed_at DESC` e `event_type, changed_at DESC`)
- [ ] **Script fire-and-forget** `primebrick-be-v3/scripts/update-init-patch-sha256.ts`:
  - Aggiorna `content_sha256` nel registry `public.primebrick_database_patches` per `patch_id='00000000000000_init_database.sql'`
  - Pattern documentato in `.devin/rules/patch-sha256-management.md`
  - Esegui manualmente su DB live esistenti dopo deploy

#### Fase 2.3 — Scaffold microservizio `primebrick-us-v3/ai/`

- [ ] **Struttura** (stesso pattern di `emailsender/`):
  - `package.json`: `"type": "module"`, `"engines": { "node": "24" }`, runtime **Bun**, build `tsc`, deps `@primebrick/sdk` + `@primebrick/dal-pg` (workspace), `pg`, `dotenv`, `reflect-metadata`. **Nuove deps AI**: `ai` (Vercel AI SDK 7.x), `@ai-sdk/mcp`, `@ai-sdk/openai-compatible`, `@xenova/transformers`, `zod`. **Versioni fissate**.
  - `tsconfig.json`: `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `strict: true`, `experimentalDecorators: true`, `emitDecoratorMetadata: true`.
  - `Dockerfile`: multi-stage `oven/bun:1.1.0-alpine`, `EXPOSE 3004` (porta AI dedicata).
  - `docker-compose.dev.yml`: hot reload `bun --hot`, network `primebrick-infra-net`.
- [ ] **Main entry `src/index.ts`** usando `createMicroservice()` (Fase 2.0):
  ```typescript
  import "dotenv/config";
  import "reflect-metadata";
  import { createMicroservice } from "@primebrick/sdk";
  // ... adapters specifici AI ...
  async function main() {
    const ctx = await createMicroservice({
      serviceName: "primebrick-ai",
      serviceCode: "ai",
      serviceDescription: "Primebrick AI chat assistant",
      icon: "sparkles",
      iconType: "icon",
      envSchema: { DATABASE_URL, DB_SCHEMA: "ai", SERVICE_BASE_URL, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, EMBEDDING_PROVIDER, EMBEDDING_MODEL, BE_MCP_URL, DOCS_PATH },
      dbSchema: "ai",
      configRepositoryAdapter: new ConfigRepositoryAdapter(),
      authConfigPort: new AiAuthConfigPort(),
      healthCheckPort: new HealthCheckAdapter(getDal().getPool()),
      routeHandler: aiRouteHandler,
      customHealthChecks: { llm: () => checkLlmHealth() },  // ping mistral.rs /health
      endpoints: { chat: "/chat", health: "/health" },
    });
    // ... init embedding model, MCP client, etc ...
    console.log("Primebrick AI microservice started");
  }
  main().catch((error) => { console.error("Fatal:", error); process.exit(1); });
  ```
  **Target: ~40 linee** (vs 183 di emailsender pre-refactor).

#### Fase 2.4 — LLM Docker in /infra

- [ ] **Crea `primebrick-be-v3/infra/docker-compose.ai-llm.yml`**:
  ```yaml
  services:
    ai-llm:
      image: ghcr.io/ericlbuehler/mistral.rs:latest
      container_name: primebrick-ai-llm
      ports: ["127.0.0.1:${AI_LLM_HOST_PORT:-8082}:1234"]
      volumes:
        - primebrick_ai_llm_cache:/data
        - ./models:/models:ro
      command: >
        serve --cpu --format gguf
        -m /models
        -f qwen3-4b-instruct-2507-q4_k_m.gguf
        --port 1234
      environment:
        HF_HUB_OFFLINE: "1"
      restart: unless-stopped
      healthcheck:
        test: ["CMD-SHELL", "wget -qO- http://localhost:1234/health || exit 1"]
        interval: 30s
        timeout: 10s
        retries: 3
      networks:
        - primebrick-infra-net
  volumes:
    primebrick_ai_llm_cache:
      name: primebrick_ai_llm_cache
  ```
- [ ] **Download modello GGUF** Q4_K_M da `bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF` → `infra/models/qwen3-4b-instruct-2507-q4_k_m.gguf` (~2.5GB, git-lfs o download script).

#### Fase 2.5 — Embedding pipeline

- [ ] **`src/embedding/pipeline.ts`**: leggi MDX da `DOCS_PATH` + OpenAPI da `apis/*.json`, chunking, embedding transformers.js, upsert `docs_kb` con `content_hash` per re-index incrementale. Vedi §13 per struttura KB.
- [ ] **Comando `npm run index-docs`** nel `package.json` del microservizio AI.

#### Fase 2.6 — Version panel LLM

- [ ] **BE: `checkLlm()` in `primebrick-be-v3/src/index.ts`** (dopo `checkNats()` ~riga 146):
  - Chiama AI microservice health endpoint (via service_registry lookup `code='ai'`)
  - L'AI microservice health include LLM info (pinga mistral.rs `/v1/models`, estrae model name + versione mistral.rs)
  - Ritorna `{ ok, version: <mistral.rs version>, model: <active model> }`
  - Aggiungi `llm: await checkLlm()` al `checks` object in `healthPayload()`
- [ ] **FE: `VersionsPanel.svelte`** sezione Core Modules (dopo NATS, riga ~195):
  - Leggi `backendState.health.checks.llm`
  - Mostra "AI LLM" + status badge + `model` + `version`
  - Translation keys in `en-GB.json`

### Fase 3 — Orchestrazione AI

- [ ] `LlmProvider` factory: `createOpenAICompatible({baseURL, apiKey}).chatModel(model)`.
- [ ] `EmbeddingProvider` factory: transformers.js default + OpenAI-compatible pluggable.
- [ ] `AiOrchestrator`:
  - system prompt (ruolo, tono, istruzioni RAG, istruzioni tool, formato citazioni).
  - tool `search_docs({query})` → pgvector cosine search top-k=4 con metadati.
  - MCP client (`@ai-sdk/mcp`) verso `BE_MCP_URL` con `Authorization: Bearer <JWT utente>` → espone `list_entities` (con aggregazione), `get_entity`, `get_entity_audit`, `get_entity_meta`, `list_available_entities` come AI SDK tools. **Nessun tool specifico per auth_events** — `auth_events` è una entità registrata, queryable via `list_entities` generico.
  - client tool `navigate({route, query})` (non eseguito, emesso come evento SSE).
  - `streamText({ model, tools, messages, maxSteps: 8 })` con `onStepFinish` per persistere tool calls.
- [ ] Endpoint `POST /chat` (SSE): streamma `text-delta` + `tool_call` (per client tools) + `finish`.
- [ ] Endpoint `GET /conversations` + `GET /conversations/:uuid` (storico).
- [ ] Rate limiter Redis (token bucket per-user via JWT sub).
- [ ] Persistenza messaggi in `ai_messages`.

### Fase 4 — BE integrazione

**Tutti i dettagli empirici verificati in §8.**

- [ ] **Nuova route `/api/v1/ai/*`** in `src/modules/proxy/proxy-router.ts` (dopo riga 22):
  ```typescript
  router.all("/api/v1/ai/*", rbacHandler([Permission.AUTHENTICATED_USER]), proxyRequestSse);
  ```
  **NOTA**: a differenza di `/ws/:serviceCode/*`, questa route ha `serviceCode` hardcoded (`'ai'`) nel handler, non nell'URL. Alternativa: route `/api/v1/ai/:serviceCode/*` per futura multi-AI. In v1 hardcoded `'ai'`.
- [ ] **Fn `proxyRequestSse`** in `src/modules/proxy/proxy-service.ts` (nuova funzione, ~30 righe):
  - Lookup `service_registry` per `code='ai'` (riusa `ServiceRegistryRepo.findAllByCode('ai')` riga 59, filtra `status='online'` riga 73, round-robin righe 100-102).
  - Build target URL: `{base_url}/api{pathAfterAi}` dove `pathAfterAi = req.url.replace(/^\/api\/v1\/ai/, '')` (es. `/api/v1/ai/chat` → `{ai_base_url}/api/chat`).
  - Forward headers: `Authorization` (JWT utente, già su `req.headers.authorization`), `Content-Type: application/json`.
  - **Streaming**: invece di `await response.text()` (riga 131 — da NON usare per SSE), pipeare `response.body` (ReadableStream) a `res`:
    ```typescript
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    response.body.pipe(res);  // se response.body è Node Readable
    // oppure: for await (const chunk of response.body) res.write(chunk); res.end();
    ```
  - Gestisci abort client: `req.on('close', () => controller.abort())` con `AbortController`.
- [ ] **Estensione `list_entities` con aggregazione** (NO nuovo tool specifico — vedi §15 per dettagli):
  - Aggiungere parametro `aggregate` allo Zod schema di `list_entities` in `generic-tools.ts` (riga 158-220):
    ```typescript
    aggregate?: z.object({
      type: z.enum(["count", "sum", "avg", "min", "max"]),
      field: z.string().optional(),        // per sum/avg/min/max
      group_by: z.array(z.string()).optional(),
      having: z.record(z.string(), z.unknown()).optional(),
    }).optional()
    ```
  - Aggiungere `"aggregate"` a `Operation` type in `entity-registry.ts` (riga 21-29)
  - Aggiungere `dispatchBeAggregate` in `dispatch.ts` (nuova fn, ~40 righe) — build SQL `SELECT {aggregate_expr} FROM {entity} WHERE {filters} GROUP BY {group_by} HAVING {having} ORDER BY {sort} LIMIT {limit}`
  - Aggiungere `dispatchProxyAggregate` per microservice entities (proxy path `/ws/{module}/api/v1/entities/{entity}/aggregate`)
  - Aggiornare DAL/repository layer: nuova fn `aggregateByPage(entity, filters, aggregate, sort, pagination)` con GROUP BY support
  - **Aggiungere operatore `@>` (jsonb contains) a `SqlOperator` enum** in `src/db/repository/dsl.ts` (riga 3-17) — necessario per filtrare `roles @> ["administrators"]` su `user_profiles`. Aggiornare query-builder.ts riga 156-205 per gestire `@>`.
  - Registrare `auth_events` in `entity-registry.ts` con `supported_operations: ['list', 'aggregate']` (no create/update/delete via MCP — eventi scritti solo dal flow auth interno)
  - RBAC per `auth_events` aggregate: `rbacHandler([Permission.USERS_READ_ALL])` (o nuovo permesso `auth.read.audit` — vedi §11)
- [ ] **Insert `auth_events`** in 3 punti del flow auth (verificato):
  - `src/modules/auth/services/auth-session.service.ts` **dopo riga 119** (post `decodeJwtPayload(data.access_token)`, pre email-verified guard): insert **SUCCESS** evento. Risolvere `user_uuid` via `resolveInternalUuid` (pattern da MFA branch righe 146-155: `claims.sub` → idp_code → `resolveInternalUuid({ idp_code, email, display_name, ... })` → `userUuid`). Usare `requireActor(userUuid)` come actor context (NON `runAsSystem()` — l'utente è identificato dal JWT). `changed_by` = user UUID.
  - `src/modules/auth/services/auth-session.service.ts` **riga 109-112** (post `!response.ok`, pre `throw`): insert **FAILED** evento. Qui NON abbiamo il JWT (Casdoor ha rifiutato le credenziali), quindi NON possiamo risolvere l'UUID. Usare `runAsSystem()` — `changed_by` = `input.username` (l'username tentato, per audit value). `success: false`, `failure_reason: <casdoor error text>`.
  - `src/modules/auth/services/mfa.service.ts` **dopo riga 711** (post `verifyAtLogin`): insert `event_type='mfa_verify'`. L'utente è già autenticato al primo fattore → abbiamo il suo UUID (passato come arg a `verifyAtLogin`). Usare `requireActor(userUuid)`, NON `runAsSystem()`.
  - `src/modules/auth/services/webauthn.service.ts` **dopo riga 433** (post `signinFinish`): insert `event_type='passkey_signin'`. L'utente è autenticato via passkey → abbiamo il suo UUID. Usare `requireActor(userUuid)`, NON `runAsSystem()`.
  - **Pattern actor**: `requireActor(userUuid)` da `@primebrick/sdk` (importato in `webauthn.service.ts` riga 48, `invitation.service.ts` riga 19). Imposta `changed_by` = user UUID per audit accuracy. `runAsSystem()` SOLO per FAILED login (no JWT, no UUID risolvibile).
  - Campi: `user_profile_uuid`, `event_type` ('login'|'login_failed'|'mfa_verify'|'passkey_signin'), `ip_address` (da `req.ip` o `x-forwarded-for`), `user_agent` (da `req.headers['user-agent']`), `success` (boolean), `failure_reason` (text, opzionale).
- [ ] **Registrazione microservizio** automatica via `ServiceRegistrar` all'avvio di `primebrick-ai-v3` (verificato: il BE ascolta `service.register` via NATS e persiste in `service_registry` table). Nessuna modifica BE richiesta — il microservizio si registra da solo.

### Fase 5 — FE

**Tutti i dettagli empirici verificati in §8.**

- [ ] **CTA "AI" in `AppTopbar.svelte`** — inserire dopo riga 175 (dopo Notifications button, prima di `ThemeToggle` riga 177):
  ```svelte
  <Button
    type="button"
    variant="ghost"
    size="icon"
    class="relative"
    aria-label={$t('shell.aiChat.aria')}
    title={$t('shell.aiChat.aria')}
    onclick={() => openSheet('shell.aiChat', {}, { contentClass: 'w-[600px] p-0' })}
  >
    <MessageSquare class="size-4" />
  </Button>
  ```
  Import `MessageSquare` da `@lucide/svelte` (già usato nel progetto). Import `openSheet` già presente riga 22.
- [ ] **Aggiungi `'shell.aiChat'` al sheet system**:
  - `src/lib/shell/sheets/sheet-manager.svelte.ts` riga 3-9: aggiungi `| 'shell.aiChat'` al `SheetPanelId` union type.
  - `src/lib/shell/sheets/sheet-manager.svelte.ts` riga 21-40: aggiungi `'shell.aiChat': Record<string, never>;` al `SheetPanelPropsMap`.
  - `src/lib/shell/sheets/SheetHost.svelte.ts` riga 12: import `AiChatPanel` da `./panels/AiChatPanel.svelte`.
  - `src/lib/shell/sheets/SheetHost.svelte.ts` riga 18-25: aggiungi `'shell.aiChat': AiChatPanel` al registry.
- [ ] **Crea `src/lib/shell/sheets/panels/AiChatPanel.svelte`**:
  - Layout: header (titolo + close), message thread (scrollable), input box (footer).
  - Message thread: render streaming SSE via `fetch('/api/v1/ai/chat', { method: 'POST', body, headers: { Authorization: `Bearer ${token}` }, signal })` + `ReadableStream` reader per parse SSE events (`text-delta`, `tool_call`, `finish`).
  - Markdown render: verificare se esiste lib markdown nel FE (altrimenti aggiungere `marked` + `dompurify`).
  - Citation chips: link al doc MDX (URL docs site o path interno).
  - Tool-call confirmation UI: quando riceve `tool_call` con `tool='navigate'`, mostra card "Vuoi che apra la pagina X? [Sì] [No]". Su "Sì", chiama `ClientToolRegistry.navigate(args)`.
  - Input box: `Textarea` (già in `src/lib/components/ui/textarea/`), invio su Enter (Shift+Enter per newline).
  - Sidebar conversazioni: lista (`GET /api/v1/ai/conversations`), new conversation button, switch.
  - Side: `right` (via `openSheet` options `side: 'right'`).
- [ ] **`ClientToolRegistry`** (`src/lib/shell/ai-chat/client-tool-registry.ts`):
  - Tool `navigate({ route: string, query?: Record<string, string> })`: chiama `goto(`${route}?${new URLSearchParams(query)}`)` da `$app/navigation`.
  - Architettura: registry pattern, l'AI chat panel registra i client tools, l'orchestratore (via SSE events) li invoca.
- [ ] **Composable `useUrlFiltersSync`** (`src/lib/entity-list-table/composables/use-url-filters-sync.svelte.ts`):
  - On mount: parse `page.url.searchParams` per `filters[*][field|op|value|connector]` + `connector` + `search` + `search_in` → popola `filterValues` (Record<string, any>) e `advancedFilters` (AdvancedFilter[]).
  - Format di parsing (verificato in `customers/+page.svelte` righe 359-458): `filters[0][field]=roles&filters[0][op]=@>&filters[0][value]=administrators&filters[0][connector]=AND`.
  - Applicare in `bootstrapCustomersList()` (customers riga 541) e `init()` (users riga 354) — chiamare `useUrlFiltersSync({ filterValues, advancedFilters, columns })` prima del restore da sessionStorage.
  - Generalizzare per tutte le list pages.
- [ ] **Stato `useAiChat()`** (`src/lib/shell/ai-chat/use-ai-chat.svelte.ts`): composable Svelte 5 runes, pattern DeepReadonly (come `userProfileStore`, `shellNav`). Stato: `conversations`, `currentConversation`, `messages`, `isStreaming`, `pendingToolCall`.

### Fase 6 — Affinamento

- [ ] Re-index pipeline automatica su sync docs (hook post-sync).
- [ ] Telemetria: latency, token usage, tool call success rate, RAG hit rate.
- [ ] Eval suite: dataset di domande + risposte attese (es. 20 casi), script di valutazione.
- [ ] Feedback UI (thumbs up/down) → tabella `ai_feedback`.
- [ ] Citazioni cliccabili al doc MDX (link ai docs site).
- [ ] Redaction campi sensibili prima dell'invio al LLM cloud (opzione config).

### Fase 7 — Futuro (non in v1)

- Federazione MCP per-modulo (KB delegata ai moduli, ognuno espone il suo `/mcp` con tool + risorse docs).
- Sub-agenti per research complessa (LangGraph o supervisor pattern con Vercel AI SDK).
- Modello WASM on-device (WebLLM/transformers.js FE) per routing/intent classification offload.
- Fine-tuning solo se RAG non basta (misurare con eval suite prima).
- Streaming tool results parziali (es. progress di query lunghe).
- Multi-modale (screenshot della pagina corrente come contesto).

## 6. Confronto framework AI (empirico, 2026-07)

| Framework | Ver. | Licenza | ⭐ | MCP built-in | Agent loop | RAG | Streaming | Verdetto |
|---|---|---|---|---|---|---|---|---|
| **Vercel AI SDK** | 7.0.37 | Apache-2.0 | 25.8k | ✅ `@ai-sdk/mcp` 2.0 | ✅ `ToolLoopAgent`, `maxSteps` | ✅ | ✅ SSE | **Scelto** |
| Mastra | 1.51.0 | Apache-2.0 (core) | 26.5k | ✅ `@mastra/mcp` | ✅ `Agent` | ✅ best-in-class | ✅ | Strong contender, più opinionated, feature enterprise non-OSS |
| OpenAI JS SDK | 6.49.0 | Apache-2.0 | 11.1k | ❌ | ❌ thin client | ❌ | ✅ | No (manca agent loop + MCP) |
| LlamaIndex.TS | 0.12.1 | MIT | 3.1k | ❌ | ✅ | ✅ | ✅ | **Deprecato/archiviato** |
| LangGraph.js | 1.4.8 | MIT | 3.1k | ✅ `@langchain/mcp-adapters` | ✅ StateGraph | ✅ | ✅ | Overkill per v1, utile per workflow complessi in v2 |
| OpenAI Agents SDK | 0.13.5 | MIT | 3.5k | ✅ built-in | ✅ `Runner` | ❌ | ✅ | Promettente, meno maturo di Vercel AI SDK |
| PocketFlow | 0.0.7 | MIT | ~100 | ⚠️ partial | ✅ graph | ⚠️ | ✅ | Troppo immaturo |

**Perché Vercel AI SDK e non Mastra**: entrambi validi. Vercel AI SDK è meno opinionated, più diffuso (18M download/sett vs Mastra), MCP client nativo leggero, agent loop flessibile senza imporre una classe `Agent`. Mastra ha RAG best-in-class ma per 92 file non serve un framework RAG pesante — pgvector + un tool `search_docs` bastano. Se in v2 serve RAG più sofisticato (re-ranking, hybrid search, multi-store), rivalutare Mastra.

## 7. Confronto LLM runtime + modello + quantizzazione (empirico, 2026-07)

### 7.1 Server di inferenza

| Server | Ver. | Licenza | CPU | OpenAI API | Tool calling | Constrained output | Docker | Verdetto |
|---|---|---|---|---|---|---|---|---|
| **mistral.rs** | 0.9.0 | MIT | ✅ nativo, **~14% più veloce** | ✅ `/v1` + SSE | ✅ + agentic loop + MCP nativo | **✅ LLGuidance token masking (strict mode)** | ✅ `ghcr.io/ericlbuehler/mistral.rs` | **Default** |
| llama.cpp | b10099 | MIT | ✅ nativo | ✅ `/v1` + SSE | ✅ base (`--jinja`) | ✅ lazy grammars + GBNF (meno integrato per MCP) | ✅ `ghcr.io/ggml-org/llama.cpp:server` | Fallback (de facto standard, ~60k star) |
| Ollama | 0.32.1 | MIT | ✅ | ✅ `/v1` | ✅ | ⚠️ limitato | ✅ `ollama/ollama` | Alternativa semplice |
| vLLM | 0.26.0 | Apache-2.0 | ⚠️ sperimentale | ✅ | ✅ | ✅ | ❌ no CPU image | No per CPU |
| LocalAI | 4.7.1 | MIT | ✅ | ✅ | ✅ | ⚠️ | ✅ | Troppo pesante |
| LM Studio | 0.4.0 | Proprietary | ✅ | ✅ | ✅ | ✅ | ⚠️ preview | Non OSS |

### 7.2 Constrained tool calling: il game-changer di mistral.rs

**Come funziona (verificato nel codice `mistralrs-core/src/pipeline/sampling.rs` righe 502-612):**
1. LLGuidance calcola una token mask (~50μs per tokenizer 128k) che restrict quali token il modello può emettere.
2. Token non validi ricevono bias `-∞` → sono fisicamente esclusi dalla distribuzione di sampling.
3. Il modello **non può** emettere JSON che viola lo schema del tool. Non è post-processing, è constraint a sampling time.
4. Attivazione mid-stream: il grammar si attiva quando il modello inizia un tool call, si disattiva a tool call completato.
5. `strict: true` sui tool → enforce property names, value types, enum values, nested objects, required fields.
6. **MCP tools con input schema → strict mode automatico**.
7. Funziona via endpoint OpenAI-compatible `/v1/chat/completions` — l'orchestratore (Vercel AI SDK) passa i tool con `strict: true`, mistral.rs enforce lo schema.

**Nota su Zod**: mistral.rs accetta **JSON Schema**, non Zod direttamente. Ma Vercel AI SDK converte già Zod → JSON Schema quando chiama l'endpoint OpenAI-compatible. Il risultato finale è identico: schema enforced a token level.

**llama.cpp equivalente**: ha lazy grammars + `json_schema_to_grammar.py` + `--json-schema` flag. Anche lui può enforce JSON schema, ma è meno integrato per MCP (richiede setup manuale del grammar, non automatico per MCP tools).

**Impatto sulla quantizzazione (dato empirico chiave)**:
Benchmark Happynood/quant-toolcall-bench su Qwen3-1.7B:
| Quant | FCR (Function-Calling Reliability) | SVR (Schema-Validity Rate) |
|---|---|---|
| Q4_K_M | 0.844 [0.814, 0.875] | 0.883 |
| Q8_0 | 0.842 [0.805, 0.873] | 0.880 |

**Statisticamente indistinguibile**. Con constrained tool calling, Q4_K_M diventa viable per il tool calling perché l'engine garantisce validità sintattica. Questo dimezza la RAM e aumenta la velocità.

### 7.3 Modelli small (≤8B) per CPU + tool calling

| Modello | Params | RAM Q4_K_M | RAM Q8_0 | Tool calling (BFCL) | Contesto | Licenza | Verdetto |
|---|---|---|---|---|---|---|---|
| **Qwen3-4B-Instruct-2507** | 4B | **2.50GB** | 4.28GB | v3 61.9% | 262K | Apache 2.0 | **Default** |
| MiniCPM3-4B | 4B | 2.47GB | 4.33GB | v2 76.0% | 32K | Apache 2.0 | Score più alto (v2≠v3) |
| Phi-4-mini-instruct | 3.8B | 2.49GB | 4.08GB | v4 ~low-mid 80s | 128K | **MIT** | Alternativa MIT, stessa dimensione |
| Qwen3-1.7B-FC | 1.7B | **1.0GB** | 1.8GB | v3 54.2% | 32K | Apache 2.0 | Ultra-leggero, fine-tuned per FC |
| Qwen3-1.7B | 1.7B | 1.0GB | 2.17GB | v3 50.0% | 32K | Apache 2.0 | Leggero, reasoning più debole |
| Qwen3.5-4B | 4B | ~2.5GB | ~4.3GB | v4 50.3% | 262K | Apache 2.0 | ❌ GGUF rotto in mistral.rs (#2125), ibrido instabile |
| Qwen3.5-2B | 2B | ~1.3GB | ~2.2GB | v4 43.6% | 262K | Apache 2.0 | ❌ Stesso problema architettura ibrida |
| Gemma 4 E4B | 4B | ~3.0GB | ~4.7GB | v4 ~mid-high 80s | 128K | ⚠️ Gemma license | ❌ Non OSS (licenza custom Google) |
| Llama 3.2 3B-FC | 3B | ~3.5GB | ~6GB | n.d. | 128K | ⚠️ Llama license | ❌ Non MIT/Apache |
| SmolLM2-1.7B | 1.7B | ~2GB | ~3.5GB | 27% | — | Apache 2.0 | ❌ Tool calling troppo debole |

**MoE small**: non esistono MoE 4-8B totali con ~1-2B attivi adatti a CPU. Qwen3-30B-A3B (19GB+), Granite 4.0-H-Tiny (Mamba2 non supportato in llama.cpp). Nessuna alternativa viable.

**Qwen3-1.7B vs Qwen3-4B (confronto diretto):**
| Metrica | Qwen3-1.7B | Qwen3-4B-Instruct-2507 |
|---|---|---|
| BFCL v3 | 50.0% | **61.9%** |
| MikeVeerman agent score | **0.960** (12 prompt, community) | 0.880 (rimosso Round 3, latenza 63s) |
| GSM8K | 44% | **91%** |
| HumanEval+ | 16% | **73%** |
| RAM Q4_K_M | **1.0GB** | 2.5GB |
| Contesto | 32K (sufficiente per ~15K budget) | 262K (overkill) |

Il 0.960 di Qwen3-1.7B (MikeVeerman) è reale ma: benchmark community (12 prompt), testa giudizio/restraint più che reasoning complesso. Per catene multi-step ("trova → filtra → naviga") il 4B è più affidabile. **1.7B è opzione lightweight, 4B è default.**

### 7.4 Raccomandazione finale

**Default: mistral.rs + Qwen3-4B-Instruct-2507 Q4_K_M + constrained tool calling (strict mode)**

| Fattore | Valore |
|---|---|
| RAM | ~2.5GB (modello) + ~1GB (Node orchestratore) = ~3.5GB totali |
| Schema validity | 100% garantita (LLGuidance token masking) |
| CPU speed | ~14% più veloce di llama.cpp |
| Tool calling | strict mode automatico per MCP tools |
| Reasoning | BFCL v3 61.9%, GSM8K 91% |
| Licenza | MIT (mistral.rs) + Apache 2.0 (Qwen3) |

**Fallback documentato: llama.cpp + Qwen3-4B Q8_0** (~5.5GB, de facto standard, più maturo, per chi preferisce stabilità massima).

**Lightweight: mistral.rs + Qwen3-1.7B-FC Q4_K_M** (~1.0GB, per RAM molto stretta, reasoning più debole ma tool calling fine-tuned).

**Alternativa MIT pura: mistral.rs + Phi-4-mini Q4_K_M** (~2.49GB, licenza MIT anche sul modello, qualità simile a Qwen3-4B).

**Cloud (pluggable via `LLM_BASE_URL`)**: OpenAI, Anthropic, Zhipu GLM, Kimi, DeepSeek, Groq, Ollama, ecc. I cloud provider hanno il loro strict mode nativo.

### 7.5 Docker default (aggiornato)

```yaml
# docker-compose.yml (estratto)
ai-llm:
  image: ghcr.io/ericlbuehler/mistral.rs:latest
  container_name: primebrick-ai-llm
  ports: ["8082:1234"]
  volumes:
    - ./models/qwen3-4b-instruct-2507-q4_k_m.gguf:/models/model.gguf:ro
  command: >
    serve --cpu
    -m /models/model.gguf
    --port 1234
  restart: unless-stopped
  # RAM: ~4GB consigliati (2.5GB modello + overhead)

ai:
  build: ./primebrick-ai-v3
  environment:
    LLM_BASE_URL: http://ai-llm:1234/v1
    LLM_API_KEY: not-used
    LLM_MODEL: qwen3-4b-instruct-2507
    LLM_STRICT_TOOLS: "true"   # abilita strict mode su tutti i tool
    # ... resto
  depends_on: [ai-llm, postgres, redis, nats]
```

**Fallback llama.cpp:**
```yaml
ai-llm:
  image: ghcr.io/ggml-org/llama.cpp:server
  command: >
    -m /models/qwen3-4b-instruct-2507-q8_0.gguf
    --host 0.0.0.0 --port 8080
    -t 4 -c 8192 --jinja
  # RAM: ~6GB
```

Swap runtime = cambio `LLM_BASE_URL` + `ai-llm` image nella config. Zero modifiche al codice dell'orchestratore.

### 7.6 Nota architetturale: orchestratore vs runtime

L'architettura resta ibrida:
- **Vercel AI SDK orchestratore** (nel microservizio AI): agent loop, RAG retrieval (pgvector), MCP client verso BE, persistenza conversazione, streaming SSE al FE, client tool events (navigate).
- **mistral.rs runtime** (container separato): inferenza + constrained tool calling (schema enforcement a token level).

L'orchestratore chiama mistral.rs via `/v1/chat/completions` passando i tool con `strict: true`. mistral.rs enforce lo schema. L'orchestratore riceve tool call garantiti validi, li esegue (server tools via MCP, client tools via eventi SSE).

**Perché non usare l'agentic loop nativo di mistral.rs?** Potrebbe bypassare l'orchestratore per casi semplici, ma:
- RAG (pgvector) non è gestito da mistral.rs → serve comunque l'orchestratore.
- Persistenza conversazione non è gestita da mistral.rs.
- Client tool events (navigate al FE) non sono gestibili da mistral.rs (l'engine non può inviare eventi al FE).
- Provider pluggability: se usiamo l'agentic loop di mistral.rs, siamo locked-in al runtime locale. Con l'orchestratore, possiamo swap a cloud LLM mantenendo RAG + MCP + persistenza.

**Ibrido è la scelta giusta**: orchestratore pluggable + runtime con garanzia forte.

## 8. Verifiche empiriche complete (Fase 1 + template microservizio + BE + FE)

### 8.0 Template microservizio (da `primebrick-us-v3/emailsender`)

**Repo structure**: ogni microservice è una sottodirectory self-contained (`emailsender/`). Workspace config a livello parent (`primebrick-workspace/pnpm-workspace.yaml`).

**Runtime**: **Bun** (non Node). Dev: `bun --hot src/index.ts`. Prod: `bun dist/index.js`. Build: `tsc`.
**Docker**: `oven/bun:1.1.0-alpine` multi-stage. Package manager: `pnpm` (installato via npm nell'image).
**Porte**: emailsender=3003. AI=3004 (dedicata).
**package.json**: `"type": "module"`, `"engines": { "node": "24" }`, versioni fissate (no `^`/`~`), deps `@primebrick/sdk` + `@primebrick/dal-pg` (workspace).
**tsconfig.json**: `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `strict: true`, `experimentalDecorators: true`, `emitDecoratorMetadata: true`.

**Main entry pattern** (`emailsender/src/index.ts`):
1. `import "dotenv/config"; import "reflect-metadata";`
2. `requireEnv({...})` — validazione env vars centralizzata via SDK
3. `initDal()` — DAL gateway
4. `ConfigLoader(new ConfigRepositoryAdapter())` — config da DB table
5. `initAuthConfig()` + `loadAuthConfig()` — auth config (GATEWAY-RESOLVED mode)
6. `NatsClient.getConnection(natsUrl)` — NATS connection (URL da config table)
7. `new ServiceRegistrar(NatsClient, config, healthCheckFn)` + `registrar.register()` + `registrar.startHeartbeat()`
8. `createHttpServer({ port, healthCheck, serviceName, routeHandler })` — HTTP server con health check built-in
9. `GracefulShutdown` — cleanup (unregister, close NATS, end pool)

**Health check**: `HealthCheck` class da SDK, costruttore `(dbPing: HealthCheckPort, customChecks: Record<string, fn>)`. `/health` endpoint built-in in `createHttpServer`. Response: `{ ok, service, version, url, checks }`.

**HTTP routing**: `createHttpServer` usa **native Node `http`** (NON Express, NON Hono). Route handler custom via `options.routeHandler: (req, res, url) => Promise<boolean>`. **NO SSE out of the box** — l'AI microservice implementa SSE manualmente nel routeHandler.

**ServiceRegistrar** (`primebrick-v3-sdk/src/service/service-registrar.ts`):
- Config: `{ serviceCode, baseUrl, endpoints, heartbeatIntervalMs?, name?, description?, service_version?, icon?, icon_type? }`
- `register()`: publish NATS subject `service.register` con payload `{ code, base_url, endpoints, ... }`
- `startHeartbeat()`: setInterval (default 30s) publish `service.heartbeat`
- `unregister()`: publish `service.unregister`
- Health check fn: opzionale, ritorna `{ http_healthy, checks }`

**NatsClient** (`primebrick-v3-sdk/src/nats/nats-client.ts`):
- `getConnection(url?)`: connect + auto JetStream init. URL da `NATS_URL` env o default `nats://127.0.0.1:4222`
- `publish(subject, data, hdrs?)`, `request<T>(subject, data, timeoutMs)`, `getJetStream()`

### 8.1 Entity-list deep-link filtri — ❌ NON esiste

**Evidenza**:
- `src/routes/(app)/customers/+page.svelte` righe 90-94: `filterValues` e `advancedFilters` inizializzati vuoti.
- `tryRestoreListUiStateFromSession()` (righe 228-265) restaura solo da sessionStorage, non tocca i filtri.
- `useFilterPersistence.svelte.ts` righe 17-53: `readFilterValues`/`readAdvancedFilters` leggono solo da sessionStorage.
- `page` (`$app/state`) importato ma usato solo per breadcrumb pathname (righe 762-763), non per `searchParams`.
- 30 chiamate `goto()` nel codebase, **nessuna** con query params.

**Cosa serve**:
- Composable `useUrlFiltersSync` che:
  1. on mount: parse `page.url.searchParams` per `filters[*][field|op|value|connector]` + `connector` + `search` + `search_in` → popola `filterValues`/`advancedFilters`.
  2. on filter change (opzionale in v1): aggiorna URL con `replaceState` (no navigation).
- Applicare in `bootstrapCustomersList()` (customers) e `init()` (users), e generalizzare per le altre list pages.
- La query DSL è già serializzabile (`filters[0][field]=roles&filters[0][op]=@>&filters[0][value]=administrators`), quindi il parsing è diretto.

### 8.2 Audit login — ❌ NON loggato

**Evidenza**:
- Tabelle audit esistenti: `customers_audit`, `user_profiles_audit`, `role_mappings_audit`, `organizations_audit` (init_database.sql righe 67-420). **Nessuna** tabella auth/login.
- `AuthSessionService.login()` (`auth-session.service.ts` righe 91-192): exchange credentials con Casdoor, ritorna token. **Nessun audit write**.
- `MfaService.verifyAtLogin()` (`mfa.service.ts` righe 628-721): verify TOTP, aggiorna `last_used_at` su `user_mfa_factors` (riga 711, con audit su quella tabella). **Nessun login event audit**.
- `WebauthnService.signinFinish()` (`webauthn.service.ts` righe 266-433): completa passkey, aggiorna `last_used_at` su `user_passkeys` (riga 451, con audit). **Nessun login event audit**.

**Cosa serve**:
- Nuova tabella `auth_events` (vedi §4).
- Insert in 4 punti (3 SUCCESS + 1 FAILED). **SUCCESS**: `requireActor(userUuid)` — l'utente è identificato dal JWT, `changed_by` = user UUID. **FAILED login**: `runAsSystem()` — no JWT (Casdoor rifiutato), `changed_by` = `input.username` tentato. Endpoint pubblici ma l'actor è noto dal JWT post-success:
  - `AuthSessionService.login()` riga ~183 (post token-exchange).
  - `MfaService.verifyAtLogin()` riga ~711 (post verify).
  - `WebauthnService.signinFinish()` riga ~433 (post finish).
- Nuova entità `auth_events` registrata in entity-registry.ts con operazioni `list`, `aggregate` (no create/update/delete via MCP — scritta solo dal flow auth interno). Queryable via `list_entities` con parametro `aggregate` (estensione generica, vedi §15). RBAC: `Permission.USERS_READ_ALL` o nuovo `auth.read.audit`.

### 8.3 Proxy HTTP/SSE — ❌ Solo WS, bufferizza

**Evidenza**:
- `proxy-router.ts` righe 13-22: unica route `/ws/:serviceCode/*`.
- `proxy-service.ts` riga 131: `await response.text()` — bufferizza tutta la risposta. Righe 126-128: forwarda body come JSON. **Non supporta SSE streaming**.

**Cosa serve**:
- Nuova route `/api/v1/ai/*` in `proxy-router.ts` con `rbacHandler([Permission.AUTHENTICATED_USER])`.
- Fn `proxyRequestSse` in `proxy-service.ts`:
  - lookup `service_registry` per `code='ai'` (riusa logica esistente righe 43-107).
  - forwarda `Authorization` header (già fatto per WS proxy).
  - pipe `response.body` (ReadableStream) a `res` **senza** `await text()`.
  - set header `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
  - gestisci abort client (`req.on('close')` → abort fetch).

### 8.4 pgvector — ❌ Non installato

**Evidenza**:
- `init_database.sql` righe 6-20: solo `pgcrypto` + `pg_partman`.
- Nessun match per `vector`/`pgvector`/`embedding` in `db-meta/patches/` o `src/` (i match in `totp.test.ts` sono RFC 6238 test vectors, non correlati).
- **Immagine PG attuale**: `postgres:18-bookworm` (vanilla, `infra/docker-compose.postgres.yml` riga 31). **NO pgvector**.

**Cosa serve**:
- Swap immagine: `postgres:18-bookworm` → `pgvector/pgvector:0.8.5-pg18-bookworm` (stessa base PG 18 + pgvector 0.8.5 precompilato, pin versione per CVE-2026). Aggiornare `infra/docker-compose.postgres.yml` riga 31.
- **Rischio**: l'entrypoint attuale (righe 46-52) installa `postgresql-18-partman` via apt. L'immagine pgvector potrebbe non avere i repo Debian per pg_partman. **Da verificare empiricamente** in Fase 2:
  - Test 1: `docker pull pgvector/pgvector:0.8.5-pg18-bookworm` + `docker run ... apt-get install postgresql-18-partman` → funziona?
  - Test 2 (fallback): build custom Dockerfile da `postgres:18-bookworm` + compile pgvector da sorgente + apt pg_partman.
- Nuova patch DDL `00000000000003_ai_chat.sql`: `CREATE EXTENSION IF NOT EXISTS vector;` + tabelle §4.

### 8.5 MCP server BE — ✅ Verificato, riusabile

**File**: `src/modules/mcp/index.ts`, `src/modules/mcp/mcp-server.ts`, `src/modules/mcp/token-verifier.ts`, `src/modules/mcp/tools/generic-tools.ts`, `src/modules/mcp/tools/dispatch.ts`, `src/modules/mcp/tools/entity-registry.ts`.

**Transport**: `NodeStreamableHTTPServerTransport` (Streamable HTTP, **stateless**, `sessionIdGenerator: undefined`). Endpoint: `POST /mcp` (solo POST, GET ritorna 405).

**Auth**: `requireBearerAuth` con custom `tokenVerifier` che chiama `verifyAuth()` da SDK (valida Casdoor JWT). `requiredScopes: []` — RBAC enforced per-tool, non per-endpoint. **L'AI microservice forwarda il JWT utente in `Authorization: Bearer <token>`**.

**11 tool MCP** (mcp-server.ts righe 17-29): `list_entities`, `get_entity`, `create_entity`, `update_entity`, `delete_entity`, `restore_entity`, `get_entity_audit`, `list_available_entities`, `get_entity_meta`, `bulk_entity_action`, `manage_service`.

**Entity registry** (entity-registry.ts righe 178-227): 3 BE entity registrate:
- `customer` — operazioni: list, get, create, update, delete, restore, audit, meta + bulk_delete, bulk_restore
- `organization` — operazioni: list, get, create, update, delete, restore, audit, meta
- `user_profiles` — operazioni: list, get, update, restore, audit, meta (**NO create/delete**)

**`role_mappings` NON è esposto via MCP** — ha solo REST API (`src/modules/auth/routers/role-mappings.router.ts`). Per "trova utente con ruolo administrators": usare `list_entities` su `user_profiles` con filtro su campo `roles` (jsonb array, operatore `@>`).

**RBAC per tool call** (dispatch.ts righe 37-68): `checkRbac(authInfo, module, entity, operation)`. Admin bypass (`user.is_admin`). Microservice entity skip RBAC (enforced dal microservice). BE entity check `entry.permissions?.[operation]` vs `isPermissionGranted(userPerms, p)` (wildcard matching).

**Dispatch**: BE entity → in-process (`dispatchBe*` righe 114-308). Microservice entity → HTTP loopback proxy (`dispatchProxy*` righe 310-436).

### 8.6 Proxy BE — ❌ Solo WS, bufferizza (verificato)

**File**: `src/modules/proxy/proxy-router.ts`, `src/modules/proxy/proxy-service.ts`.

**Route attuale**: `router.all("/ws/:serviceCode/*", rbacHandler([Permission.AUTHENTICATED_USER]), proxyRequest)` (riga 19).

**Service registry lookup**: `ServiceRegistryRepo.findAllByCode(serviceCode)` (riga 59) → filtra `status='online'` (riga 73) → round-robin (righe 100-102).

**Target URL**: `{base_url}/api{pathAfterService}` (righe 105-107). Es. `/ws/emailsender/v1/send` → `http://localhost:3003/api/v1/send`.

**Headers forwardati**: `Content-Type: application/json` + auth headers via `serializeAuthUserToHeaders(req.user, cfg)` (GATEWAY-RESOLVED mode, righe 110-114).

**Buffering**: riga 131 `const body = await response.text();` — **bufferizza tutta la risposta**. Righe 150-162: `res.send(body)`.

**Cosa serve per SSE**: nuova fn `proxyRequestSse` (~30 righe) — vedi Fase 4 per dettagli implementativi. Pipe `response.body` a `res` senza bufferizzare, set header SSE, gestisci abort.

### 8.7 Service registry entity — ✅ Verificato

**File**: `src/modules/system/service_registry_entity.ts`.

**Colonne**: `id bigint`, `uuid string`, `code varchar(100)`, `base_url text`, `endpoints jsonb`, `name text?`, `description text?`, `service_version text?`, `is_behind_scaler boolean`, `status text` ('unknown'|'online'|'going_live'|'offline'), `last_health_check_at timestamptz?`, `is_enabled boolean`, `icon text?`, `icon_type text`, `is_reserved boolean`, + audit fields (`created_at`, `created_by`, `updated_at`, `updated_by`, `version`).

**Routing**: lookup per `code` → round-robin tra istanze `status='online'` → `{base_url}/api{path}`. L'AI microservice si registra con `code='ai'`, `base_url='http://ai:3004'`.

### 8.8 Auth flow login audit — ✅ Verificato, punti di insert identificati

**File**: `src/modules/auth/services/auth-session.service.ts`.

**Login function**: `async login(input: LoginBody): Promise<LoginOutcome>` (riga 91).
**Token exchange**: righe 93-107, fetch a `${cfg.casdoor_endpoint}/api/login/oauth/access_token`.
**Claims decode**: riga 119 `const claims = this.decodeJwtPayload(data.access_token)`.
**Insert point**: dopo riga 119 (post claims decode, pre email-verified guard riga 121). Risolvere `user_uuid` via `resolveInternalUuid` (pattern da MFA branch righe 148-155).

**Actor context**: `requireActor(userUuid)` per SUCCESS (utente identificato dal JWT, `changed_by` = user UUID). `runAsSystem()` SOLO per FAILED login (no JWT, `changed_by` = `input.username` tentato). Entrambi importati da `@primebrick/sdk` (verificato in `webauthn.service.ts` riga 48, `invitation.service.ts` riga 19, `mfa.service.ts` riga 29).

**Altri 2 insert point**: `mfa.service.ts` post riga 711 (verifyAtLogin), `webauthn.service.ts` post riga 433 (signinFinish).

### 8.9 Database patches — ✅ Verificato

**File in `db-meta/patches/`**:
1. `00000000000000_init_database.sql`
2. `00000000000001_create_api_keys_table.sql`
3. `00000000000002_add_service_registry_is_reserved.sql`

**Naming convention**: `NNNNNNNNNNNNNN_description.sql` (14 digit timestamp + snake_case desc).
**Nuova patch**: `00000000000003_ai_chat.sql`.

**Apply**: `pnpm run db:migrate` — applica pending `.sql` in ordine, usa `public.primebrick_database_patches` (patch_id + content_sha256) per skip già applicati.

**Audit table convention** (customers_audit, init_database.sql righe 66-84):
```sql
CREATE TABLE IF NOT EXISTS "public"."customers_audit" (
  "id" bigint generated always as identity NOT NULL,
  "entity_id" bigint NOT NULL,
  "entity_uuid" uuid NOT NULL,
  "action" text NOT NULL,
  "changed_at" timestamptz NOT NULL,
  "changed_by" text NOT NULL DEFAULT 'system',
  "version" integer NOT NULL,
  "delta" jsonb NOT NULL,
  PRIMARY KEY ("id", "changed_at")
) PARTITION BY RANGE ("changed_at");
-- + partman.create_parent('public.customers_audit', 'changed_at', '1 month')
-- + index su entity_uuid, action
```

**`auth_events` adattamento**: non è un audit di entità ma un log eventi. Schema: `id bigint`, `user_profile_uuid uuid`, `event_type text` ('login'|'login_failed'|'mfa_verify'|'passkey_signin'), `changed_at timestamptz DEFAULT now()`, `changed_by text DEFAULT 'system'`, `ip_address inet`, `user_agent text`, `success boolean`, `failure_reason text`, `PRIMARY KEY (id, changed_at)` PARTITION BY RANGE (changed_at) + pg_partman 1 month. Indici su `user_profile_uuid, changed_at DESC` e `event_type, changed_at DESC`.

### 8.10 Docs sync + KB — ✅ Verificato

**Sync script**: `primebrick-v3-docs/scripts/sync-repo-docs.mjs`.
- 5 repo synced: backend, frontend, microservices, dal, sdk (GitHub URLs).
- Source: `docs/user-guide/**` in each repo.
- Dest: `pages/<repo>/guide/**` in docs repo.
- Frontmatter aggiunto: `title` (auto), `source: guide`, `repo: <slug>`.
- **Nessun hook post-sync** — re-index va triggerato manualmente o via cron in v1.

**95 file MDX totali**:
- getting-started: 12
- api: 7
- backend/guide: 4
- frontend/guide: 56 (51 components + 5 root)
- dal/guide: 4
- sdk/guide: 8
- microservices/guide: 4

**Frontmatter metadata** (sample `sdk/guide/service-registration.mdx`):
```yaml
---
title: Service Registration
description: NATS™-based microservice registration, heartbeats, and lifecycle events.
source: guide
repo: sdk
---
```
**Filtri vector search**: `repo` (backend|frontend|sdk|dal|microservices), `title`, `description`, `source`.

### 8.11 FE sheet system + topbar — ✅ Verificato

**Sheet manager** (`src/lib/shell/sheets/sheet-manager.svelte.ts`):
- `SheetPanelId` union (righe 3-9): `'shell.errors' | 'shell.versions' | 'entity.searchIn' | 'entity.columns' | 'entity.filters' | 'entity.versionHistory'`
- `SheetPanelPropsMap` (righe 21-40): props per ogni panel
- `openSheet<T>(panelId, props, options?)` (righe 75-93)
- `SheetOpenOptions`: `{ side?, contentClass?, keepMountedState?, modal? }`

**SheetHost** (`src/lib/shell/sheets/SheetHost.svelte`):
- Registry (righe 18-25): `Record<SheetPanelId, any>` mappa panel ID → componente
- Render (riga 48): `<Panel {...panelProps} modal={sheetState.modal} />`

**Cosa aggiungere per `'shell.aiChat'`**:
- `sheet-manager.svelte.ts` riga 3-9: + `| 'shell.aiChat'`
- `sheet-manager.svelte.ts` riga 21-40: + `'shell.aiChat': Record<string, never>;`
- `SheetHost.svelte` riga 12: + import `AiChatPanel`
- `SheetHost.svelte` riga 18-25: + `'shell.aiChat': AiChatPanel`

**AppTopbar** (`src/lib/components/AppTopbar.svelte`):
- Colonna destra CTAs (righe 131-178): timezone, LangSelect, Errors button, Notifications button, ThemeToggle.
- **Insert AI button**: dopo riga 175 (Notifications button close), prima riga 177 (ThemeToggle).
- Pattern: `<Button variant="ghost" size="icon" onclick={() => openSheet('shell.aiChat', {}, { contentClass: 'w-[600px] p-0' })}>` + icon `MessageSquare` da `@lucide/svelte`.

### 8.12 mistral.rs Docker — ✅ Verificato

**Image**: `ghcr.io/ericlbuehler/mistral.rs:latest` (CPU, multi-arch amd64+arm64). CUDA tags separati.
**Entrypoint**: `mistralrs` binary. Comandi: `serve`, `run`, `bench`, `quantize`.
**Port**: 1234 default (EXPOSE). Cambiare con `serve -p <port>` + mapping.
**CPU-only**: `serve --cpu -m <model>`. Per GGUF: `serve --format gguf --cpu -m <repo> -f <file.gguf>`.
**ISQ (in-situ quantization)**: `serve --isq 4 --cpu -m Qwen/Qwen3-4B` (quantizza a Q4 al load time da safetensors). Alternativa a GGUF pre-quantizzato.
**HF cache**: `HF_HOME=/data` nell'image. Mount volume `/data` per persistere weights.
**Offline**: `HF_HUB_OFFLINE=1` per air-gapped (pre-download weights).
**Config file**: supporta TOML config (`mistralrs-config.toml`) con sezioni `[server]`, `[[models]]`, `[models.quantization]`, `[models.device]`.

## 9. Costi

### 9.1 Default bundled (zero costo)

- mistral.rs + Qwen3-4B Q4_K_M: costo marginale zero (CPU/RAM esistenti).
- transformers.js embedding: zero costo, CPU.
- pgvector: zero costo, su PG esistente (richiede swap immagine a `pgvector/pgvector:0.8.5-pg18-bookworm`).
- Redis: già presente.
- NATS: già presente.
- Vercel AI SDK: Apache-2.0, zero costo.
- mistral.rs: MIT, zero costo.

**Costo totale v1 default: 0€/mese.**

### 9.2 Se l'utente configura LLM cloud

- OpenAI GPT-4o-mini: ~$0.15/1M input, $0.60/1M output. Per uso interno basso, ~$1-5/mese.
- Claude Haiku 3.5: ~$0.25/1M input, $1.25/1M output.
- Zhipu GLM-4-Flash: free tier disponibile.
- DeepSeek V3: ~$0.14/1M input, $0.28/1M output.
- Groq Llama 3.3 70B: free tier generoso.

Documentare le opzioni nel README del microservizio.

### 9.3 Costi infrastrutturali

- RAM aggiuntiva per il microservizio AI + mistral.rs: ~4-5GB totali (2.5GB modello Qwen3-4B Q4_K_M + 1GB Node + overhead). Con Qwen3-1.7B-FC Q4_K_M lightweight: ~2-3GB. Con fallback llama.cpp + Q8_0: ~7-8GB.
- CPU: 4+ core per latenza accettabile (mistral.rs ~14% più veloce di llama.cpp).
- Storage PG: ~50MB per 92 file MDX embedded (384-dim × ~500 chunk × 4 bytes ≈ 0.8MB vettori + testo + metadati).
- Storage modello GGUF: ~2.5GB (Qwen3-4B Q4_K_M) o ~4.3GB (Q8_0 fallback).

## 10. Lacune e rischi aperti

| Rischio | Mitigazione |
|---|---|
| Qualità reasoning di Qwen3-4B Q4_K_M su CPU non sufficiente | Eval suite (Fase 6); fallback a Q8_0 (qualità superiore, più RAM); fallback a cloud LLM via config. Constrained tool calling garantisce validità sintattica anche a Q4_K_M. |
| Maturità mistral.rs (7.5k star vs 60k llama.cpp) | Fallback documentato a llama.cpp + Q8_0 (swap = cambio config). Eval suite per validare affidabilità in produzione. |
| Latenza streaming su CPU | mistral.rs ~14% più veloce di llama.cpp. Streaming SSE mostra token man mano. Fallback Qwen3-1.7B-FC Q4_K_M (~1.0GB) se latenza inaccettabile. |
| Prompt injection da parte utente | RBAC enforced lato tool (BE). L'AI non può fare nulla che l'utente non potrebbe. |
| Leak dati sensibili verso LLM cloud | Documentare chiaramente; default bundled tiene dati in casa; v1.1 redaction opzionale. |
| pgvector non nell'immagine PG in uso | Verificare immagine PG; switchare a `pgvector/pgvector:pg16` o build custom se necessario. |
| Re-index docs su sync | Pipeline `npm run index-docs` + hook post-sync (Fase 6). |
| Costo LLM cloud per abuso | Rate limit Redis + cap token + cap turni. |

## 11. Decisioni ancora aperte (da ridefinire iterativamente)

- [x] **Immagine PG in uso include pgvector?** ❌ NO — `postgres:18-bookworm` vanilla. **Risolto**: custom Dockerfile `FROM pgvector/pgvector:0.8.5-pg18-bookworm` + compile pg_partman da sorgente. Volume compatibile unchanged.
- [x] **Repo del microservizio AI**: sottodirectory `primebrick-us-v3/ai/` (confermato).
- [ ] **Strategia chunking docs**: heading-based vs fixed-size? Inclinazione heading-based (migliore contesto, heading_path come metadata), ma verificare empiricamente con eval.
- [ ] **Dimensione embedding**: 384 (all-MiniLM) vs 768 (bge-large)? 384 default per leggerezza; 768 se qualità retrieval insufficiente.
- [ ] **Top-k RAG**: 4 default, tunable.
- [ ] **System prompt**: iterare con eval suite.
- [ ] **Permesso per `auth_events`**: **NUOVO permesso `AUTH_EVENTS_READ_ALL` = `"auth_events.read.all"`** in `Permission` enum (`primebrick-v3-sdk/src/auth/permissions.ts`, blocco "Users module (admin)" dopo `USERS_RESTORE_SINGLE` riga 57). **Pattern `entity.action.granularity`** (NON `module.action`): `auth_events` è l'entità, `read` è l'azione, `all` è la granularità. Coerente con `customers.read.all`, `users.read.all`, `organizations.read.all`, `role_mappings.read.all`, `modules.read.all`. **NON usare `.read.audit`** — quello significherebbe "leggi l'audit trail DI auth_events" (tabella `auth_events_audit`), ma `auth_events` È essa stessa un log, non ha un audit trail proprio. **NUOVO ruolo RBAC `auth_auditor`** (snake_case, conforme Casdoor) — ruolo dedicato read-only per audit auth, seed in `init_database.sql` insieme a `administrators` (riga 460): `INSERT INTO public.role_mappings (idp_role, permissions, is_admin, ...) VALUES ('auth_auditor', '["auth_events.read.all"]'::jsonb, false, ...) ON CONFLICT DO NOTHING;`. Admin (`is_admin=true`) bypassa come sempre. RBAC su entity in `entity-registry.ts`: `auth_events: { list: [Permission.AUTH_EVENTS_READ_ALL], aggregate: [Permission.AUTH_EVENTS_READ_ALL] }`.
- [ ] **Persistenza conversazione**: PG (scelto) vs Redis TTL. PG per durabilità + audit.
- [ ] **UI conferma tool call `navigate`**: sempre, o auto-eseguito per navigazioni "sicure"? Scelto: sempre conferma (controllo utente).
- [x] **mistral.rs: GGUF pre-quantizzato vs ISQ da safetensors?** GGUF Q4_K_M (file `bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF`): più veloce startup, community-tested. ISQ (`--isq 4 -m Qwen/Qwen3-4B`): più flessibile, ma quantizza al load (startup più lento). **Decisione**: GGUF pre-quantizzato, scaricato automaticamente da HF Hub al primo avvio del container (mistral.rs supporta `serve --format gguf -m <repo> -f <file.gguf>`). Cache persistente su volume Docker `primebrick_ai_llm_cache` (HF_HOME=/data). Primo avvio: ~2-5 min download. Avvii successivi: cache hit, ~10s load. Zero download manuale.
- [ ] **Markdown render nel FE**: verificare se esiste lib markdown nel FE. Se no, aggiungere `marked` + `dompurify` (MIT).
- [ ] **Schema DB AI**: dedicato `ai` (via `DB_SCHEMA=ai`) o `public`? Inclinazione: schema dedicato `ai` per isolamento (pattern emailsender usa `DB_SCHEMA=emailsender`).
- [ ] **Nuovi docs KB da scrivere**: Entity Field Reference, Filter Operator Reference, Filter Syntax Guide, Navigation Map (vedi §13). Priorità: critica per AI usefulness.
- [ ] **OpenAPI chunking**: un chunk per endpoint (path+method+summary+params+response) vs un chunk per tag/group? Inclinazione: per endpoint (granularità fine per vector search).

---

## 12. SDK microservice blueprint — analisi empirica

### 12.1 Problema

`emailsender/src/index.ts` = 183 linee, di cui **~140 sono puro boilerplate** copy-paste che ogni nuovo microservizio deve replicare:
1. `readServiceVersion()` (5 linee) — identico ovunque
2. `requireEnv({...})` (5 linee) — pattern identico, solo schema varia
3. `initDal()` (2 linee + dal.ts 15 linee) — solo schema/app name varia
4. `ConfigLoader + ConfigRepositoryAdapter` (8 linee) — wiring identico
5. `initAuthConfig + loadAuthConfig + setAuthDependencies` (23 linee) — wiring identico, solo port impl varia
6. `NatsClient.getConnection` (9 linee) — wiring identico
7. `ServiceRegistrar setup` (47 linee) — struttura identica, solo config object varia
8. `HealthCheck + createHttpServer` (13 linee) — wiring identico
9. `GracefulShutdown` (10 linee) — cleanup list varia leggermente
10. `main() wrapper` (6 linee) — identico

### 12.2 Soluzione: `createMicroservice(options)` builder

**File**: `primebrick-v3-sdk/src/microservice/create-microservice.ts`

```typescript
export interface MicroserviceOptions {
  serviceName: string;
  serviceCode: string;
  serviceDescription?: string;
  icon?: string;
  iconType?: 'url' | 'svg' | 'base64' | 'icon';
  isBehindScaler?: boolean;
  envSchema: EnvSchema;
  dbSchema?: string;
  applicationName?: string;
  configRepositoryAdapter: ConfigRepositoryPort;
  authConfigPort: AuthConfigPort;
  apiKeyPort?: ApiKeyPort;
  healthCheckPort: HealthCheckPort;
  routeHandler?: (req, res, url) => Promise<boolean>;
  natsSubscriptions?: Array<{ subject: string; handler: (data, msg) => Promise<void> }>;
  customHealthChecks?: Record<string, () => Promise<HealthCheckResult>>;
  authDependencySetters?: Array<(cfg: AuthConfig, apiKeyPort: ApiKeyPort) => void>;
  endpoints?: Record<string, string>;
}

export interface MicroserviceContext {
  configLoader: ConfigLoader;
  dal: typeof getDal;
  natsClient: typeof NatsClient;
  registrar: ServiceRegistrar;
  healthCheck: HealthCheck;
  server: Server;
  shutdown: GracefulShutdown;
  authConfig: AuthConfig;
}

export async function createMicroservice(options: MicroserviceOptions): Promise<MicroserviceContext>
```

### 12.3 Perché builder/factory e NON decorator

- **Ordering stretto**: ENV → DAL → Config → Auth → NATS → HTTP. Decorator rende l'ordine implicito e difficile da debuggare.
- **Async init**: DB/NATS/HTTP sono async. Decorator sono compile-time, non aiutano per init async.
- **Error handling non-fatal**: try/catch per "config table empty" è non-fatal. Decorator rendono questo difficile da esprimere.
- **Convenzione Primebrick**: BE usa pattern procedurale (`runStartupTasks()` in `primebrick-be-v3/src/index.ts:252-267`). Builder è evoluzione naturale.

### 12.4 Cosa va nel SDK (generico) vs cosa resta nel microservizio (specifico)

**Generico (va nel SDK)**:
- `readServiceVersion()` — 100% identico
- `HealthCheckAdapter` — 95% generico (solo `SELECT 1` universale)
- `DatabaseAdapter` — 100% generico (pg.Pool wrapper)
- `ConfigRepositoryAdapter` — 90% generico (solo entity type varia, può essere parametrico)
- Tutta l'orchestrazione init/shutdown

**Specifico (resta nel microservizio)**:
- Route handlers (composite, webhook, providers, config, ai-chat)
- NATS subscription handlers (business logic)
- AuthConfigPort impl (chiavi config specifiche: `auth_mode`, `gateway_secret`, ecc.)
- ApiKeyPort impl (schema tabella `api_keys` specifico)
- Business logic services

### 12.5 Risultato atteso

`emailsender/src/index.ts`: **183 → ~35 linee (-81%)**.
`ai/src/index.ts`: **~40 linee** (più setup AI-specific: embedding model, MCP client).

### 12.6 Implementazione

1. Creare `createMicroservice()` in SDK
2. Refattorizzare `emailsender` per usarla (validazione sul 1° microservizio)
3. Test: emailsender behavior unchanged (health, NATS, routes)
4. Usare `createMicroservice()` per `ai/src/index.ts`

---

## 13. KB analysis — struttura e gap

### 13.1 Fonti KB vettorizzate (3)

| Fonte | Path | Chunk count stimato | Tipo | Use case |
|---|---|---|---|---|
| **MDX docs** | `primebrick-v3-docs/pages/**/*.mdx` | ~300 chunk (95 file × ~3 chunk) | How-to, conceptual, tutorial | "Come configuro Redis?", "Come uso EntityListTable?" |
| **OpenAPI specs** | `primebrick-v3-docs/apis/{system,mcp,emailsender}.json` | ~80 chunk (endpoint per chunk) | Endpoint discovery | "Quali endpoint esistono per customers?", "Come filtro un customer?" |
| **NUOVI docs** | da scrivere in `docs/user-guide/` dei rispettivi repo | ~50 chunk | Reference critica | "Cosa significa il campo is_active?", "Come filtro per ruolo?" |

### 13.2 MDX docs — assessment qualità

**Punti di forza**: buoni per how-to (quick-start, getting-started, service-registration), conceptual (architecture, rbac), tutorial (auth flows, MCP config).

**Gap critici** (4 doc mancanti, PRIORITÀ ALTA per AI usefulness):

1. **Entity Field Reference** — per ogni entità (`user_profiles`, `customers`, `organizations`), documentare tutti i campi con significato business. L'AI non sa cosa vuol dire `is_active`, `roles`, `last_synced_at`, `oidc_issuer_url`. Senza questo, l'AI non può costruire filtri semanticamente corretti.
2. **Filter Operator Reference** — operatori disponibili (`=`, `!=`, `<>`, `<`, `<=`, `>`, `>=`, `ILIKE`, `LIKE`, `IN`, `NOT IN`, `BETWEEN`, `IS`, `IS NOT`, `@>` per jsonb) con esempi per tipo (string, number, date, array, jsonb).
3. **Filter Syntax Guide** — come costruire `filters[0][field]=roles&filters[0][op]=@>&filters[0][value]=["administrators"]&filters[0][connector]=AND`. Come filtrare array fields, come usare AND/OR connectors.
4. **Navigation Map** — quali pagine FE esistono, quali filtri supportano, qual è il route path. **CRITICO per il tool `navigate`**: l'AI deve sapere che `/customers` supporta filtri `status`, `created_at_range`, mentre `/system/settings/users` supporta filtri `roles`, `is_active`. Senza questo, l'AI non può navigare con filtri preimpostati.

### 13.3 OpenAPI specs — assessment

**File**: `apis/system.json` (BE endpoints), `apis/mcp.json` (MCP endpoints), `apis/emailsender.json` (microservice endpoints).

**Contenuto verificato**: endpoint paths, methods, summaries, parameters (inclusi filter operators enum), request/response schemas, pagination params.

**Chunking strategy**: un chunk per endpoint (path + method + summary + description + parameters + request body + response schema). Metadata: `{ api: 'system'|'mcp'|'emailsender', path, method, tag }`.

**Vantaggi**: AI scopre dinamicamente quali endpoint esistono, comprende la struttura dei parametri, matcha domande utente agli endpoint rilevanti.

**Limiti**: OpenAPI NON descrive significato business dei campi (per quello serve Entity Field Reference), NON descrive business logic (per quello serve Business Logic Guide).

### 13.4 Query routing — quando KB vs quando MCP tools

| Tipo di query | Route | Perché |
|---|---|---|
| "Come configuro Redis?" | **KB (MDX)** | How-to, documentazione concettuale |
| "Come uso EntityListTable?" | **KB (MDX)** | Reference componente |
| "Come filtro per ruolo?" | **KB (Filter Syntax Guide)** | Sintassi filtri |
| "Cosa significa is_active?" | **KB (Entity Field Reference)** | Significato campi |
| "Quali endpoint esistono per customers?" | **KB (OpenAPI)** | Endpoint discovery |
| "Dammi tutti i clienti attivi" | **MCP tools** | `list_entities` con filtro `is_active=true` |
| "Trova l'utente con ruolo administrators" | **MCP tools** | `list_entities` su `user_profiles` con filtro `roles @> ["administrators"]` |
| "Dammi l'utente che ha fatto più login nell'ultimo mese" | **MCP tools** | `list_entities` con `aggregate: {type:'count', group_by:['user_profile_uuid']}` su `auth_events` + `get_entity` (NO KB) |
| "Naviga alla pagina clienti con filtro status=active" | **KB (Navigation Map)** + client tool | KB dice route + filtri supportati, `navigate` tool esegue |

**Chiave**: query su dati = MCP tools (no KB). Query how-to/conceptual = KB. Query che richiedono navigazione = KB (Navigation Map) + client tool (`navigate`).

### 13.5 Caso studio: "Dammi l'utente che ha effettuato più login nell'ultimo mese"

**Flow AI** (puro tool-calling, KB non coinvolta):
1. AI riceve la query → riconosce intent "login frequency query"
2. AI chiama `list_entities` MCP tool con aggregazione: `{ entity: 'auth_events', filters: { event_type: 'login', changed_at: { op: 'BETWEEN', value: ['2026-06-26', '2026-07-26'] } }, aggregate: { type: 'count', group_by: ['user_profile_uuid'] }, sort_key: 'count', sort_dir: 'desc', page_size: 1 }`
3. MCP tool esegue `SELECT user_profile_uuid, count(*) FROM auth_events WHERE event_type='login' AND changed_at BETWEEN ... GROUP BY user_profile_uuid ORDER BY count DESC LIMIT 1`
4. AI riceve `{ user_profile_uuid: '...', count: 47 }`
5. AI chiama `get_entity` su `user_profiles` con `uuid='...'`
6. AI riceve `{ email: 'admin@primebrick.dev', first_name: 'Admin', ... }`
7. AI risponde in chat: "Trovato: Admin (admin@primebrick.dev) — 47 login nell'ultimo mese"
8. AI offre: "Vuoi navigare alla pagina utenti con filtro?" → se sì, `navigate({ route: '/system/settings/users', query: { 'filters[0][field]': 'roles', ... } })`

**KB non serve qui**. Serve per "come filtro per ruolo?" (Filter Syntax Guide) ma non per la query dati stessa. La KB è complementare, non sostitutiva dei tool.

### 13.6 Struttura KB finale

```
AI Knowledge Base (pgvector docs_kb)
├── MDX docs (95 file, ~300 chunk)
│   ├── getting-started (12 file)
│   ├── api (7 file)
│   ├── backend/guide (4 file)
│   ├── frontend/guide (56 file)
│   ├── dal/guide (4 file)
│   ├── sdk/guide (8 file)
│   └── microservices/guide (4 file)
├── OpenAPI specs (~80 chunk)
│   ├── system.json (BE endpoints)
│   ├── mcp.json (MCP endpoints)
│   └── emailsender.json (microservice endpoints)
└── NUOVI docs (~50 chunk, da scrivere)
    ├── entity-field-reference.mdx (user_profiles, customers, organizations)
    ├── filter-operator-reference.mdx
    ├── filter-syntax-guide.mdx
    └── navigation-map.mdx
```

**Metadata per chunk**: `{ source: 'mdx'|'openapi'|'new', repo, path, title, heading_path, content_type: 'tutorial'|'reference'|'conceptual', entity?, endpoint? }`.

---

## 14. Docs auto-generation — 4 doc critiche nel processo build/deploy

### 14.1 Processo docs attuale (verificato empiricamente)

**2 fasi**:
1. **make-docs skill** (manuale, BE-side, `.devin/skills/make-docs/SKILL.md`): aggiornamento chirurgico MDX basato su git diff. Rileva branch, determina diff base, aggiorna `docs/user-guide/` seguendo editorial conventions. **NON automatizzato** — trigger manuale.
2. **Docs repo build chain** (CI/CD, Cloudflare Worker on push to main + cron 6h):
   ```
   sync-repo-docs.mjs → sync-vpat-data.mjs → fetch-openapi.mjs → generate-nav.mjs → Zudoku build (SSG)
   ```
   `sync-repo-docs.mjs`: clona 5 repo (main branch), copia `docs/user-guide/**` → `pages/<repo>/guide/**`, aggiunge frontmatter.
   `fetch-openapi.mjs`: estrae OpenAPI da `src/openapi/openapi.ts` → `apis/system.json` + `apis/mcp.json` + microservice specs.

**Gap**: nessun doc è auto-generato da metadata entità. I 4 doc critici non esistono.

### 14.2 Fonti di verità empiricali per i 4 doc

| Doc | Source of truth | Path | Cosa estrae |
|---|---|---|---|
| **Entity Field Reference** | `src/modules/*/*.meta.ts` + `src/modules/*/*_entity.ts` | BE repo | Campi entità (nome, tipo, nullable, label key, tooltip, filterable, sortable, JSDoc description). Endpoint `GET /api/v1/entities/{entity}/meta` espone già la meta. |
| **Filter Operator Reference** | `src/db/repository/dsl.ts` righe 3-17 (`SqlOperator` type) + `src/db/repository/query-builder.ts` righe 156-205 (logica per operatore) | BE repo | Operatori: `=`, `!=`, `<>`, `<`, `<=`, `>`, `>=`, `ILIKE`, `LIKE`, `IN`, `NOT IN`, `BETWEEN`, `IS`, `IS NOT`. **`@>` NON è nell'enum** — va aggiunto per jsonb array filtering (vedi §15). |
| **Filter Syntax Guide** | `src/modules/customers/dto.ts` (FilterConditionSchema) + `src/modules/*/list-config.ts` (FILTERABLE_KEYS) | BE repo | Sintassi filter array: `{ field, op, value, connector }`. Esempi per operatore. Campi filterable per entità. |
| **Navigation Map** | FE routes `src/routes/(app)/*` + meta endpoints (`/api/v1/entities/{entity}/meta`) | FE repo + BE meta | Route path, entity associata, filterable fields, sortable fields, default sort, row actions. **Pattern verificato**: ogni list page chiama meta endpoint ed estrae `filterableColumns` da `meta.list.columns.filter(c => c.filterable !== false)`. Nessun registro centralizzato — va generato scansionando route + meta. |

### 14.3 Soluzione: `generate-reference-docs.mjs` nella build chain

**Nuovo script** in `primebrick-v3-docs/scripts/generate-reference-docs.mjs`, eseguito nella build chain dopo `fetch-openapi.mjs`:

```
sync-repo-docs.mjs → fetch-openapi.mjs → generate-reference-docs.mjs (NUOVO) → generate-nav.mjs → Zudoku build
```

**Cosa fa**:
1. Legge BE repo clonato (in `.tmp-repo-sync/backend/` da sync-repo-docs.mjs)
2. Scansiona `src/modules/**/*.meta.ts` → estrae entity metadata (campi, label, filterable, sortable)
3. Legge `src/db/repository/dsl.ts` → estrae `SqlOperator` enum
4. Legge `src/db/repository/query-builder.ts` → estrae logica per operatore (ESCAPE '#', IN array, BETWEEN 2 values, IS null/bool)
5. Scansiona FE repo clonato (`.tmp-repo-sync/frontend/`) `src/routes/(app)/**/+page.svelte` → estrae route paths + entity association (da `apiFetchWithTimeout('/api/v1/entities/{entity}/meta')`)
6. Genera 4 MDX file in `pages/backend/guide/`:
   - `entity-field-reference.mdx`
   - `filter-operator-reference.mdx`
   - `filter-syntax-guide.mdx`
   - `navigation-map.mdx`
7. Aggiorna `pages/backend/guide/_order.json` con i 4 nuovi entry

**Template MDX**: ogni doc ha marker `<!-- AUTO-GENERATED -->` per indicare che è generato da codice (non editare manualmente). Frontmatter standard: `title`, `description`, `source: guide`, `repo: backend`.

### 14.4 Estensione skill `make-docs`

**Skill `make-docs` attuale**: aggiorna docs descrittive basato su git diff.

**Estensione proposta**: quando l'utente dice "aggiorna la documentazione", l'AI sa che deve:
1. **Fase 1 — Docs descrittive** (make-docs attuale): aggiorna `docs/user-guide/*.mdx` basato su diff codice (API endpoints, RBAC, error handling, schema DB)
2. **Fase 2 — Docs auto-generate** (NUOVO): esegue `generate-reference-docs.mjs` localmente (o lo triggera nella CI docs) per rigenerare i 4 doc critici da metadata corrente

**Implementazione**: aggiungere sezione "Auto-generated reference docs" allo SKILL.md con istruzioni per:
- Eseguire `node scripts/generate-reference-docs.mjs` nel docs repo (o nel BE repo se lo script vive lì)
- Verificare che i 4 file siano aggiornati
- Commit + push (la CI docs li sincronizza e builda)

**Build/deploy integration**: lo script gira automaticamente nella CI docs (Cloudflare Worker) ad ogni push to main + cron 6h. I 4 doc sono **sempre aggiornati** con il codice. L'AI non deve generarli manualmente — la CI lo fa. L'AI li rigenera localmente solo se serve validarli prima di un commit.

### 14.5 Template structure per i 4 doc

Vedi §14.2 per le fonti. Ogni doc segue questo pattern:

```markdown
---
title: "Entity Field Reference"
description: "Complete field reference for all Primebrick entities"
source: guide
repo: "backend"
---

# Entity Field Reference

<!-- AUTO-GENERATED:entity-fields — DO NOT EDIT MANUALLY -->
## Customer
| Field | Type | Nullable | Description | Label Key | Filterable | Sortable |
|-------|------|----------|-------------|-----------|------------|----------|
| uuid | string | false | Unique identifier | entities.customer.fields.uuid | yes | yes |
| code | string | false | Customer code | entities.customer.fields.code | yes | yes |
...

## Organization
...

## User Profile
...
<!-- END -->
```

Stesso pattern per Filter Operator Reference (tabella operatori con esempi), Filter Syntax Guide (esempi per operatore + campi filterable per entità), Navigation Map (route + entity + filterable + sortable + default sort + row actions).

---

## 15. `list_entities` aggregation — approccio generico (NO tool specifico)

### 15.1 Filosofia design MCP tools (verificata empiricamente)

I 11 tool MCP esistenti sono **tutti generici** (parameterized by `module, entity`), funzionano su qualsiasi entità registrata via dispatch layer unificato (BE in-process + microservice proxy). La filosofia è: **minimo numero di tool, massima riusabilità, minimo context space**.

**`count_auth_events` è una VIOLAZIONE di questa filosofia**: tool specifico per una entità specifica, non riusabile, ruba context space.

### 15.2 Soluzione: estendere `list_entities` con parametro `aggregate`

**Tool count resta a 11** (zero nuovo tool). `list_entities` esistente viene esteso con parametro opzionale `aggregate`:

```typescript
// Nuovo parametro in list_entities Zod schema (generic-tools.ts riga 158-220)
aggregate: z.object({
  type: z.enum(["count", "sum", "avg", "min", "max"]),
  field: z.string().optional(),        // per sum/avg/min/max (non necessario per count)
  group_by: z.array(z.string()).optional(),  // GROUP BY fields
  having: z.record(z.string(), z.unknown()).optional(),  // HAVING filters
}).optional()
```

**Response quando `aggregate` è presente**:
```typescript
{
  results: Array<{
    group: Record<string, unknown>,  // group_by field values
    value: number | bigint,          // aggregated value
  }>,
  total: bigint  // total number of groups
}
```

### 15.3 Implementazione

1. **`entity-registry.ts`**: aggiungere `"aggregate"` a `Operation` type (riga 21-29)
2. **`generic-tools.ts`**: aggiungere parametro `aggregate` allo Zod schema di `list_entities` (riga 158-220). Handler: se `aggregate` presente, dispatch a `dispatchBeAggregate`/`dispatchProxyAggregate` invece di `dispatchBeList`/`dispatchProxyList`
3. **`dispatch.ts`**: aggiungere `dispatchBeAggregate` (~40 righe) — build SQL `SELECT {aggregate_expr}, {group_by} FROM {entity} WHERE {filters} GROUP BY {group_by} HAVING {having} ORDER BY {sort} LIMIT {limit}`. Aggiungere `dispatchProxyAggregate` (proxy path `/ws/{module}/api/v1/entities/{entity}/aggregate`)
4. **DAL/repository**: nuova fn `aggregateByPage(entity, filters, aggregate, sort, pagination)` con GROUP BY + HAVING support
5. **`SqlOperator` enum** (`src/db/repository/dsl.ts` riga 3-17): aggiungere `@>` (jsonb contains) — necessario per `roles @> ["administrators"]`. Aggiornare `query-builder.ts` riga 156-205 per gestire `@>` (value è array JSON, usa `@>` operator su jsonb column)
6. **`auth_events` entity**: registrare in `entity-registry.ts` con `supported_operations: ['list', 'aggregate']` (no create/update/delete via MCP — eventi scritti solo dal flow auth interno con `requireActor(userUuid)` per SUCCESS, `runAsSystem()` solo per FAILED login)

### 15.4 Esempio: "Dammi l'utente che ha effettuato più login nell'ultimo mese"

**AI chiama `list_entities`** (tool esistente, esteso):
```json
{
  "module": "be",
  "entity": "auth_events",
  "filters": {
    "event_type": "login",
    "changed_at": { "op": "BETWEEN", "value": ["2026-06-26", "2026-07-26"] }
  },
  "aggregate": {
    "type": "count",
    "group_by": ["user_profile_uuid"]
  },
  "sort_key": "count",
  "sort_dir": "desc",
  "page": 1,
  "page_size": 1
}
```

**SQL generato**:
```sql
SELECT user_profile_uuid, count(*) as count
FROM auth_events
WHERE event_type = 'login' AND changed_at BETWEEN '2026-06-26' AND '2026-07-26'
GROUP BY user_profile_uuid
ORDER BY count DESC
LIMIT 1
```

**Response**: `{ results: [{ group: { user_profile_uuid: '...' }, value: 47 }], total: 23 }`

**AI poi chiama `get_entity`** su `user_profiles` con `uuid='...'` → ottiene `email`, `first_name`, ecc.

**AI risponde**: "Trovato: Admin (admin@primebrick.dev) — 47 login nell'ultimo mese"

### 15.5 Vantaggi dell'approccio generico

| Fattore | Tool specifico `count_auth_events` | `list_entities` con `aggregate` |
|---|---|---|
| Tool count | 12 (rubà context space) | **11** (zero nuovo) |
| Riusabilità | Solo auth_events | **ANY entity** (customers, organizations, auth_events, microservice entities) |
| Context space | +1 tool definition | **+0** (parametro opzionale su tool esistente) |
| Dispatch | Nuovo handler specifico | **Riusa dispatch layer esistente** |
| Future-proof | Ogni nuova aggregation = nuovo tool | **Zero nuovo tool per nuove aggregation** |
| Filosofia design | VIOLATA | **RISPETTATA** |

### 15.6 Altri use case abilitati (senza nuovo tool)

- "Quanti clienti attivi ho?" → `list_entities({ entity: 'customer', filters: { status: 'ACTIVE' }, aggregate: { type: 'count' } })` (oppure `page_size: 1` e leggi `total` — già possibile oggi)
- "Qual è il cliente con più organizzazioni?" → `list_entities({ entity: 'organization', aggregate: { type: 'count', group_by: ['customer_uuid'] }, sort_key: 'count', sort_dir: 'desc', page_size: 1 })`
- "Somma del valore di tutti i clienti attivi" → `list_entities({ entity: 'customer', filters: { status: 'ACTIVE' }, aggregate: { type: 'sum', field: 'revenue' } })` (se il campo esiste)
- "Login falliti per utente in ultima settimana" → `list_entities({ entity: 'auth_events', filters: { event_type: 'login_failed', changed_at: { op: 'BETWEEN', value: [...] } }, aggregate: { type: 'count', group_by: ['user_profile_uuid'] } })`

**Tutti questi use case con ZERO nuovo tool** — solo estensione del parametro `aggregate` su `list_entities`.

---

## 16. Casdoor records vs `auth_events` locale + nuovo ruolo RBAC `auth_auditor`

### 16.1 Casdoor records API — verificato, non adatta

**Casdoor espone** un'API records che logga automaticamente tutte le chiamate non-GET:
- `GET /api/get-records` — fetch con query params (`offset`, `limit`, `field`, `value`, `sortField`, `sortOrder`)
- `POST /api/get-records-filter` — fetch con filtro complesso
- `POST /api/add-record` — aggiunta custom

**Record structure** (Go struct `casdoor/object/record.go`): `Id`, `Owner`, `Name`, `CreatedTime`, `Organization`, `ClientIp`, `User` (formato `org/username`), `Method`, `RequestUri`, `Action`, `Language`, `Object` (request body), `Response`, `StatusCode`, `Detail`, `IsTriggered`. Beego filter `RecordMessage` crea record automaticamente per ogni POST/PUT/DELETE.

**Primebrick NON la usa** (verificato: zero riferimenti a `get-records` in tutto il BE; `casdoor-api-client.ts` non wrappa endpoint records).

**3 bloccanti per adottarla come fonte di login log**:

1. **User ID mismatch**: Casdoor `user` = `org/username` (es. `ACME/admin`), NON il nostro `user_profile_uuid`. Per query "chi ha fatto più login" dovremmo mappare ogni record via `idp_code` → `resolveInternalUuid` → `user_profile_uuid`. Latenza extra, complessità, rischio mismatch su rename utente.
2. **Rumore**: Casdoor records logga **tutte** le API call (login, updateUser, MFA setup, passkey delete, application update, ecc.), non solo auth events. Bisogna filtrare per `request_uri` (`/api/login`, `/api/webauthn/signin/finish`, `/api/mfa/verify`) o `action`.
3. **Non integrabile con MCP generico**: `list_entities` + `aggregate` funziona su entità PG registrate nel `entity-registry.ts`. Per query Casdoor servirebbe un tool custom (violando la filosofia generica del §15 — tool specifico ruba context space).

**Decisione**: `auth_events` table locale resta la scelta corretta (Option A). Fonte di verità = il nostro flow auth, `user_profile_uuid` nativo, queryabile via `list_entities` con `aggregate`, zero dipendenza esterna, schema controllato da noi. I 4 insert point (3 SUCCESS con `requireActor(userUuid)` + 1 FAILED con `runAsSystem()`) sono il costo minimo per avere dati strutturati e queryabili.

### 16.2 Nuovo ruolo RBAC `auth_auditor` + nuovo permesso `auth_events.read.all`

**Verificato empiricamente** il `Permission` enum in `primebrick-v3-sdk/src/auth/permissions.ts` riga 29-99. **Pattern: `entity.action.granularity`** (NON `module.action`). L'entità è il primo segmento, l'azione il secondo, la granularità il terzo.

**Distinzione critica** (errore corretto):
- `.read.all` = "lista tutti i record dell'entità X" (es. `customers.read.all` lista i customer) — operazione di list standard su un'entità
- `.read.audit` = "leggi l'audit trail DELL'entità X" (es. `customers.read.audit` legge `customers_audit`, la tabella che traccia le modifiche ai customer) — l'entità X HA un audit trail proprio

`auth_events` **È essa stessa un log** (tabella di eventi auth), non ha un `auth_events_audit`. È paragonabile a `customers` (entità), non a `customers_audit` (audit trail di customers). Quindi il permesso corretto è `.read.all` (lista tutti gli auth_event), NON `.read.audit` (che significherebbe "leggi l'audit trail di auth_events" — tabella che non esiste).

**Permessi `.read.all` esistenti** (pattern da seguire):
- `MODULES_READ_ALL` = `"modules.read.all"` (riga 39)
- `USERS_READ_ALL` = `"users.read.all"` (riga 52)
- `ORGANIZATIONS_READ_ALL` = `"organizations.read.all"` (riga 60)
- `CUSTOMERS_READ_ALL` = `"customers.read.all"` (riga 69)
- `EMAILSENDER_PROVIDERS_READ_ALL` = `"emailsender.providers.read.all"` (riga 84)
- `ROLE_MAPPINGS_READ_ALL` = `"role_mappings.read.all"` (riga 93)

**Nuovo permesso**: `AUTH_EVENTS_READ_ALL` = `"auth_events.read.all"` — da aggiungere in `primebrick-v3-sdk/src/auth/permissions.ts` nel blocco "Users module (admin)" dopo `USERS_RESTORE_SINGLE` (riga 57):
```typescript
// --- Users module (admin) ---
USERS_READ_ALL: "users.read.all",
USERS_READ_SINGLE: "users.read.single",
USERS_CREATE_SINGLE: "users.create.single",
USERS_UPDATE_SINGLE: "users.update.single",
USERS_DELETE_SINGLE: "users.delete.single",
USERS_RESTORE_SINGLE: "users.restore.single",
AUTH_EVENTS_READ_ALL: "auth_events.read.all",   // NUOVO — auth_events è entità log, non auditable
```

**Nuovo ruolo RBAC**: `auth_auditor` (snake_case, conforme convenzione Casdoor ruoli) — ruolo dedicato read-only per audit auth (security team, compliance officer). Seed in `init_database.sql` subito dopo il seed `administrators` (riga 460):
```sql
INSERT INTO public.role_mappings (idp_role, permissions, is_admin, created_at, created_by, updated_at, updated_by, version)
VALUES ('auth_auditor', '["auth_events.read.all"]'::jsonb, false, '2026-05-18T14:27:00Z', 'initial-setup', '2026-05-18T14:27:00Z', 'initial-setup', 1)
ON CONFLICT (idp_role) DO NOTHING;
```
+ record audit trail in `role_mappings_audit` (pattern identico alle righe 464-479 per `administrators`).

**RBAC su `auth_events` entity** in `primebrick-be-v3/src/modules/mcp/tools/entity-registry.ts`:
```typescript
auth_events: {
  list: [Permission.AUTH_EVENTS_READ_ALL],
  aggregate: [Permission.AUTH_EVENTS_READ_ALL],
  // no create/update/delete/restore/audit/meta via MCP — eventi scritti solo dal flow auth interno
  supported_operations: ["list", "aggregate"],
}
```

**Admin bypass**: `administrators` con `is_admin=true` continua a bypassare tutti i check (verificato in `rbac.middleware.ts` riga 31 e `expandPermissions` in `permissions.ts` riga 195-197). Il nuovo ruolo `auth_auditor` è per utenti non-admin che devono ispezionare i login.

**Casdoor side**: creare il ruolo `auth_auditor` in Casdoor (UI o API `addRole`) e assegnarlo agli utenti security/compliance. Il JWT di quegli utenti includerà `auth_auditor` nell'array `roles_path`, l'auth middleware lo espande in `["auth_events.read.all"]` via `role_mappings`.

### 16.3 Implementazione (Fase 4)

- [ ] Aggiungere `AUTH_EVENTS_READ_ALL` al `Permission` enum in SDK
- [ ] Build + publish SDK (GitFlow release → CI npm publish)
- [ ] Bump `@primebrick/sdk` dep nel BE
- [ ] Seed `auth_auditor` role in `init_database.sql` (in-place, stesso approccio patch §3)
- [ ] Aggiornare `entity-registry.ts` con entry `auth_events` + RBAC
- [ ] Creare ruolo `auth_auditor` in Casdoor (manuale o via `casdoor-api-client.ts` `addRole()`)
- [ ] Test: utente con ruolo `auth_auditor` può fare `list_entities({ entity: 'auth_events' })` e `aggregate`; utente senza ruolo ottiene 403.

---

> Prossimo passo: Fase 2 (SDK blueprint → PG custom Dockerfile → patch in-place → scaffold microservizio → LLM Docker → embedding pipeline → version panel → docs auto-generation → website update).

---

## 17. Website landing page — AI section update (Fase 2.9)

### 17.1 Contesto

Il website (`primebrick-v3-website`) ha già una sezione AI nel landing page (`src/pages/[lang]/index.astro` riga 179-211, sezione `<!-- AI Section -->`). La sezione attuale è **generica e focus su code generation** ("AI-Native", "Schema-to-page in minutes", "Convention-aware", "Tests included"). Non menziona il nuovo AI Chat feature con RAG, privacy on-premise, Qwen3, OpenAI compatibility.

L'update deve **sostituire/estendere** la sezione AI esistente con contenuti specifici del nuovo feature, mantenendo il design system esistente (dark theme, gradient cards, sticky headers).

### 17.2 Messaggi chiave da comunicare

1. **Integrated, not bolted-on**: AI chat è integrato nel backoffice, non è un prodotto separato. L'AI conosce lo schema, le API, i filtri, le entity — perché legge la knowledge base generata dal codice stesso.

2. **Privacy by design — no data leaves your infrastructure**:
   - LLM runtime (mistral.rs) gira come container Docker **locale**, nella stessa rete degli altri servizi
   - Prompt, risposte, embedding, conversazioni **non escono mai** dalla tua infrastruttura
   - Zero chiamate a OpenAI/Anthropic/etc. nella configurazione default
   - Knowledge base (pgvector) è nel tuo PostgreSQL — non su un vector DB esterno
   - Conversazioni persistono nel tuo database — non su storage cloud
   - **Air-gapped ready**: dopo il primo download del modello, `HF_HUB_OFFLINE=1` per uso completamente offline

3. **Qwen3 as first choice — Apache 2.0 licensed**:
   - Default: **Qwen3-4B-Instruct-2507** (Alibaba Cloud, Apache 2.0)
   - Quantizzazione Q4_K_M (~2.5GB RAM, CPU-only, zero GPU required)
   - Constrained tool calling via mistral.rs LLGuidance (schema enforcement a token level)
   - Licenza permissiva: commerciale, modifica, redistribuzione senza restrizioni

4. **OpenAI-compatible — pluggable models**:
   - mistral.rs espone endpoint `/v1/chat/completions` (OpenAI-compatible API)
   - Swap runtime = cambio `LLM_BASE_URL` nella config table. Zero modifiche al codice
   - Supportati: OpenAI, Anthropic, Zhipu GLM, Kimi, DeepSeek, Groq, Ollama, qualsiasi provider OpenAI-compatible
   - Cloud LLM opzionale per chi vuole latenza zero / modelli più grandi, ma **non è il default**

5. **Compliance & licensing**:
   - **mistral.rs**: MIT license
   - **Qwen3-4B-Instruct-2507**: Apache 2.0 (Copyright 2024 Alibaba Cloud)
   - **Vercel AI SDK**: Apache 2.0
   - **pgvector**: PostgreSQL License (BSD-like)
   - **transformers.js** (embedding): Apache 2.0
   - Tutto lo stack AI è **OSI-approved open source**, zero licenze commerciali
   - **GDPR-aligned**: dati non lasciano l'infrastruttura → nessun transfer a terzi paesi, nessun data processor agreement con LLM provider
   - **On-premise / air-gapped**: valido per ambienti regulated (healthcare, finance, government) dove cloud LLM non sono ammessi

6. **What it disrupts** (value proposition):
   - **Backoffice AI assistant che conosce il tuo dominio**: non è un chatbot generico, è un assistant che ha letto la tua documentazione API, i tuoi entity schema, le tue filter syntax
   - **RAG on your own docs**: pgvector + embedding dei tuoi MDX docs + OpenAPI specs → l'AI risponde con riferimenti reali alla tua API, non allucinazioni
   - **Tool calling deterministico**: l'AI può eseguire azioni sul backoffice (listare customer, creare record, filtrare dati) via MCP tools generici — con schema enforcement garantito
   - **Zero "AI tax"**: il default è CPU-only, zero costo cloud LLM, zero costo GPU. Funziona sullo stesso hardware del backoffice

### 17.3 Implementazione

**File da modificare**:
- `primebrick-v3-website/src/i18n/translations.ts` — aggiornare `ai:` block per tutte le 5 lingue (en, it, de, es, fr). Nuovi campi: `ai.badge`, `ai.title`, `ai.text`, `ai.cards[]` (4 cards: Integrated & Private, Qwen3 Apache 2.0, OpenAI-compatible, Compliance), `ai.privacyNote`, `ai.modelNote`
- `primebrick-v3-website/src/pages/[lang]/index.astro` — aggiornare la sezione `<!-- AI Section -->` (riga 179-211) con:
  - 4 cards invece di 3
  - Privacy callout banner sotto le cards (badge "No data leaves your infrastructure")
  - Model badge "Powered by Qwen3 — Apache 2.0"
  - OpenAI-compatible badge "Pluggable: OpenAI, Anthropic, GLM, and more"
- `primebrick-v3-website/src/components/astro/` — nuovo componente `AiPrivacyBadge.astro` (badge visivo per il privacy claim)

**Design system** (rispettare l'esistente):
- Dark theme (`bg-slate-950`, `text-slate-100`, `border-slate-800/50`)
- Gradient cards (`from-indigo-500/20 to-sky-500/20`)
- Sticky section header (`sticky top-9 z-20 bg-slate-950/80 backdrop-blur-sm`)
- Indigo accent per AI (già usato nella sezione attuale)
- Badge style: `rounded-full border border-<color>-500/30 bg-<color>-500/10 px-4 py-1.5 text-xs font-medium text-<color>-300`

**Contenuto cards (4)**:
1. **Integrated & Private** — "AI chat lives inside your backoffice. Prompts, responses, and conversations never leave your infrastructure. The LLM runs as a local container — zero cloud calls by default."
2. **Qwen3 — Apache 2.0** — "Default model: Qwen3-4B-Instruct-2507, licensed under Apache 2.0. Runs on CPU with ~2.5GB RAM. No GPU required, no commercial licenses, no vendor lock-in."
3. **OpenAI-compatible** — "The runtime exposes an OpenAI-compatible API. Swap to OpenAI, Anthropic, Zhipu GLM, DeepSeek, Groq, or any compatible provider by changing one config key. Your code stays the same."
4. **Compliance-ready** — "All-Apache-2.0 stack (mistral.rs, Qwen3, Vercel AI SDK, pgvector). Air-gapped deployment supported. GDPR-aligned: no data transfer to third-party LLM providers. Suitable for regulated industries."

**Privacy callout** (sotto le cards):
- Badge: "No data leaves your infrastructure" con icona lucchetto
- Text: "Default configuration runs 100% on-premise. Cloud LLM is optional and opt-in — you explicitly configure it if you want it."

**Model badge** (footer della sezione):
- "Powered by Qwen3-4B-Instruct-2507 · Apache 2.0 · mistral.rs · OpenAI-compatible"

### 17.4 Verification

- [ ] `pnpm run build` OK nel website repo
- [ ] Sezione AI renderizzata correttamente in tutte le 5 lingue
- [ ] Privacy badge visibile e prominente
- [ ] Model badge menziona Qwen3 + Apache 2.0
- [ ] OpenAI-compatible claim presente
- [ ] Nessun claim fuorviante (es. "free" senza contesto, "GDPR certified" senza audit reale)
- [ ] Compliance claims accurate: "GDPR-aligned" (non "GDPR certified"), "Apache 2.0" verificato per ogni componente

### 17.5 Note legali (verificato empiricamente)

| Componente | Licenza | Verificato |
|---|---|---|
| mistral.rs | MIT | ✅ github.com/EricLBuehler/mistral.rs |
| Qwen3-4B-Instruct-2507 | Apache 2.0 | ✅ huggingface.co/Qwen/Qwen3-4B-Instruct-2507/LICENSE (Copyright 2024 Alibaba Cloud) |
| Vercel AI SDK | Apache 2.0 | ✅ github.com/vercel/ai |
| pgvector | PostgreSQL License | ✅ github.com/pgvector/pgvector (BSD-like, OSI-approved) |
| transformers.js | Apache 2.0 | ✅ huggingface.co/docs/transformers.js |

**Disclaimer compliance**: usare "GDPR-aligned" (non "GDPR certified" — non c'è stato audit formale). Usare "suitable for regulated industries" (non "compliant with" — la compliance dipende dal deployment specifico). Usare "air-gapped supported" (non "air-gapped certified").

---
> **Prerequisiti in ordine**:
> 1. Fase 2.0: `createMicroservice()` in SDK + refactoring emailsender (validazione pattern)
> 2. Fase 2.1: PG custom Dockerfile (pgvector + pg_partman)
> 3. Fase 2.2: Patch DDL in-place + fire-and-forget script
> 4. Fase 2.3: Scaffold `primebrick-us-v3/ai/`
> 5. Fase 2.4: LLM Docker in `/infra`
> 6. Fase 2.5: Embedding pipeline (MDX + OpenAPI + 4 doc auto-generate)
> 7. Fase 2.6: Version panel LLM
> 8. Fase 2.7: `generate-reference-docs.mjs` script + estensione skill make-docs
> 9. Fase 2.8: Estensione `list_entities` con `aggregate` + `@>` operator + `auth_events` entity registration
> 10. Fase 2.9: Website landing page — AI section update (privacy, Qwen3, OpenAI-compatible, compliance)
> **Decisioni ancora aperte da chiudere prima di Fase 2**: permesso `auth_events` aggregate, chunking strategy, embedding dim, markdown lib FE.
