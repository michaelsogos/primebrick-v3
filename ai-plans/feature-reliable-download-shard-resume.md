# Feature: reliable chunked download con resume a shard (model files)

> **STATUS: IMPLEMENTED** — 2026-09-22. `resumable-fetch.ts` via hook `env.fetch`; resume verificato live con 2 interruzioni reali su granite-4.0-micro + prompt misto nav/CTA ok. Fix post-review: niente cleanup su `cancel()` (i shard sopravvivono), cleanup solo a completamento genuino. Test: `src/lib/__tests__/resumable-fetch.test.ts` 7/7.

## Contesto — evidenze (tutte verificate empiricamente)

| Evidenza | Fonte |
|---|---|
| Limite già noto: *"HF resume is per-file, a mid-file interruption restarts that file"* | commento spec E2E `ai-json-schema-*.spec.ts` |
| **HF CDN supporta Range**: `Range: bytes=0-0` su `…/resolve/main/onnx/model_q4f16.onnx` → 302 → `us.aws.cdn.hf.co` → **206**, `content-range: bytes 0-0/271268174`, `Accept-Ranges: bytes` | test curl live, 2026-09 |
| Validator stabile: `X-Linked-ETag` (sha256 LFS) su resolve URL; `ETag` = content-hash sul CDN | stesso test curl |
| transformers.js usa già `Range: bytes=0-0` come probe di size | `utils/hub.js` vendored |
| Extension point: **`env.fetch`** — `getFile` chiama `env.fetch(url, {redirect:'follow'})` per ogni file remoto | `env.js:281` + `hub.js:70` |

## Perché il design "customCache" è stato scartato (correzione)

`loadResourceFile` (hub.js:327-427): transformers fa `env.fetch(remoteURL)`
→ `readResponse()` consuma il body in UN `Uint8Array` →
`storeCachedResource()` chiama `cache.put(cacheKey, new Response(result))`.

→ `put()` vede solo il buffer COMPLETO. L'interruzione avviene in
`readResponse`, prima di `put`. Un `env.customCache` **non può** fare
resume mid-file. Il resume va nel layer fetch, non nel layer cache.

## Architettura — `resumableFetch` (wrapper di `env.fetch`)

Nuovo `src/lib/ai/resumable-fetch.ts`. In `ai-worker.ts` e
`embed-worker.ts`, prima di `pipeline()`:

```ts
env.allowLocalModels = false;
env.useBrowserCache = true;
env.fetch = resumableFetch;   // hook documentato
```

Flusso per ogni `fetch(url)`:

```
url è huggingface resolve?
├─ no → passthrough a fetch nativo
└─ sì:
   ├─ manifest esiste e shard parziali presenti?
   │   ├─ etag/size coerenti → resume: Range: bytes={offset}-
   │   └─ etag cambiato → drop shard, restart
   ├─ nessun manifest → fetch normale, stream→shard
   └─ ritorna Response(ReadableStream shard+live, status 200,
       Content-Length totale) a transformers
```

### Dettagli implementativi (tutti verificati nei sorgenti)

1. **Stream composito**: `new Response(readableStream, { status: 200,
   headers })` — lo stream emette prima i shard già in cache (pull
   lazy, no spike RAM), poi il resto dal fetch live con `Range:`.
   Transformers lo consuma con `readResponse` come una fetch normale;
   `progress_callback` vede `loaded/total` corretti (Content-Length =
   size totale del file, non del segmento).
2. **Persistenza shard**: Cache API dedicata `'hf-resumable'`:
   - `{url}?__shard_manifest` → Response JSON `{ etag, size, shard_size, done: number[] }`
   - `{url}?__shard={i}` → Response col blob dello shard
   - Chiavi = URL validi con query sintetica (Cache API accetta qualsiasi
     URL valido come Request key — verificato pattern usato da HF stesso).
   - Shard size default **64MB**.
3. **Durante il fetch live**: chunk dello stream accumulati fino a
   `shard_size` → `cache.put(url?__shard=N)` → manifest update. Se il
   processo muore, i shard completati restano.
4. **Resume**: `offset = done.length * shard_size`; fetch
   `Range: bytes={offset}-`; se la risposta è `200` (server ignora Range)
   → skip: si streama comunque ma si scrivono solo shard mancanti.
5. **Soglia**: file < `shard_size` → passthrough puro (config/tokenizer —
   nessun overhead, nessun shard).
6. **Validazione**: al resume, `etag`/`x-linked-etag` del manifest vs
   header della nuova risposta; mismatch → shard drop + restart pulito.
7. **Completamento**: quando l'ultimo shard arriva, transformers stesso
   salva il file completo in `transformers-cache` (via `storeCachedResource`
   come oggi) → gli shard diventano ridondanti → cleanup `url?__shard=*`
   + manifest (evita doppio storage permanente).
8. **Concorrenza**: transformers scarica file in parallelo → Map per-URL
   di stato; ogni URL ha manifest indipendente, nessun lock cross-file.
9. **Redirect**: env.fetch è chiamato con `redirect:'follow'`; il nostro
   wrapper usa la stessa option — il `Range` sopravvive al redirect verso
   il CDN (verificato: la 206 arriva dal CDN).
10. **Quota**: `QuotaExceededError` su `cache.put(shard)` → catch: smetti
    di persistere shard ma continua lo stream (download comunque completo,
    solo non resumable). Warn via postMessage debug.

## Impatto FE — progress bar e resume (verificato sui sorgenti)

### Pipeline progress oggi

`ai-worker.ts:181-211` → `post({type:'load_progress', file, progress, file_progress})`
→ `use-ai-assistant.svelte.ts:252-272` → `_state.file_progress`,
`load_progress` (media), `slowest_file` → `ai-chat-panel.svelte:353-383`.

### Perché il resume aggiorna la barra al % giusto — senza logica extra

`readResponse` (hub/utils.js:88-125) calcola `progress = loaded/total*100`
contando i byte che FLUISCONO nello stream, non i byte scaricati dalla
rete. Il nostro `resumableFetch` restituisce uno stream che emette **prima
i shard già in cache** (veloci, da Cache API) poi il fetch live: il
progress salta subito al % del resume e continua fluido → la barra
"riparte da dove era" automaticamente, senza flag o stati speciali.
Inoltre `file_progress[file]` usa `Math.max` monotonic (worker:193) →
nessuna regressione visibile.

### Progress bar — requisito: primary gradient animata OVUNQUE

Stato attuale (`ai-chat-panel.svelte`):

| Barra | Oggi | Target |
|---|---|---|
| Aggregate download (357) | gradiente + `animate-gradient-pan` ✓ | invariata |
| VRAM (348) | gradiente statico, non animato | gradiente + `animate-gradient-pan` (coerente) |
| **Per-file (376)** | `bg-primary/60` flat | `animate-gradient-pan` + stesso gradiente multi-stop dell'aggregate |

Le barre per-file sono corte (`h-1`): il pan resta visibile perché
`animate-gradient-pan` (`app.css:538`, verificato) imposta già
`background-size: 200% 100%` + keyframe `gradient-pan` — le stesse classi
dell'aggregate si riusano verbatim, nessun CSS nuovo.

### Reattività FE — casi coperti

| Evento | Comportamento |
|---|---|
| Download fresco | barre crescono normalmente (stream live) |
| Retry dopo interruzione | progress parte dal % degli shard salvati, salita istantanea+live — nessun reset a 0 |
| `load_progress` re-issue da transformers al retry | idempotente: stesso `file`, monotonic guard in worker |
| File < soglia | passthrough — progress come oggi |
| Cancel/load interrotto | shard parziali restano in `'hf-resumable'` → il PROSSIMO load riprende (anche dopo reload pagina) |
| Quota piena | warn → stream continua senza persistere (barra ok, resume perso) |

## File impattati

| File | Modifica |
|---|---|
| `src/lib/ai/resumable-fetch.ts` | NUOVO — wrapper fetch + manifest/shard store |
| `src/lib/ai/ai-worker.ts` | `env.fetch = resumableFetch` (una riga) |
| `src/lib/ai/embed-worker.ts` | idem |
| `src/lib/components/ui/smart-ai/ai-chat-panel.svelte` | barre per-file + VRAM: gradiente primario animato (classi dell'aggregate) |
| `src/lib/ai/use-model-cache.svelte.ts` | `TRANSFORMERS_CACHE_PREFIXES` += `'hf-resumable'` (byte contati nella storage bar); `deleteModel` elimina anche `?__shard*` del modello |
| `src/lib/ai/sw-manager.ts` | `isModelCached` — stesso prefisso |

## Verifica

1. **Unit test Vitest**: resumable-fetch con `caches`/`fetch` mock —
   resume da manifest parziale, etag mismatch, quota fallback,
   stream riassembly.
2. **Empirico manuale**: DevTools → Network → download modello →
   throttling/offline a metà → ripresa: la seconda fetch parte con header
   `Range: bytes=N-` (verificabile nel pannello Network) e la progress bar
   parte già dal byte corretto.
3. **E2E**: profilo persistente esistente mantiene Cache API tra run —
   aggiungere step kill+resume opzionale.
4. `pnpm check` verde.

## Fuori scope

- Solo URL `huggingface.co` (o `env.remoteHost`); altri host passthrough.
- Nessun Service Worker, nessun OPFS, nessun customCache.
- Xet protocol nativo non toccato — usiamo Range HTTP standard.
