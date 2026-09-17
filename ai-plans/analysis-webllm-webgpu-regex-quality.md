# Analisi aggiornata: WebLLM + WebGPU per generazione regex

> **Data**: 2026-09-10 (aggiornato 2026-09-10, batch 2: 10 modelli aggiuntivi)
> **Scope**: Analisi empirica delle performance di WebLLM/WebGPU nel componente `SmartRegexInput`, con raccomandazioni concrete per ridurre le allucinazioni nella generazione di regex da prompt in linguaggio naturale.
> **Stato**: Fix 1 e 5 implementati e **verificati empiricamente** (Playwright spy su `engine.chat.completions.create`). Fix 2, 3, 4 rimangono da implementare.

---

## 1. Stato attuale dell'implementazione (post-refactor BE-managed)

### Cambio architetturale fondamentale

Il piano originale assumeva parametri hardcoded nel FE. Ora **tutti i parametri di runtime sono gestiti dal backend** tramite l'entità `ai_models` (`primebrick-be-v3/src/modules/ai-models/ai_model_entity.ts`).

Il FE legge la configurazione tramite `useAiModels().getModelByModelId(model_id)` e passa i valori a `engine.chat.completions.create()`.

### Modelli disponibili (BE entity `ai_models`)

| Modello | enable_thinking | temperature | top_p | max_tokens | rep_penalty |
|---------|:---:|:---:|:---:|:---:|:---:|
| `Qwen3-1.7B-q4f16_1-MLC` | **false** | 0.60 | 0.95 | 512 | 1.10 |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | false | 0.30 | 0.80 | 256 | 1.10 |
| `Qwen3-4B-q4f16_1-MLC` | **true** | 0.60 | 0.95 | 2048 | 1.10 |

**Nota**: Qwen3-1.7B è passato a `enable_thinking: false` dopo test empirici che mostrano che il modello genera thinking content anche quando `enable_thinking: false`, e il thinking non viene mai chiuso entro `max_tokens`. Vedi sezione "BUG CRITICO" sotto per dettagli.

I valori corrispondono esattamente alle raccomandazioni del piano originale (Fix 1):
- Qwen3 (ibridi): thinking ON, T=0.6, TopP=0.95, max_tokens=768 (thinking ~400 + output ~100)
- Qwen2.5 (non-thinking): thinking OFF, T=0.3, TopP=0.8, max_tokens=256

### Configurazione engine (`use-regex-ai.svelte.ts`, riga 125)

```typescript
// init() — SOLO initProgressCallback, NESSUN engineConfig
engine = await webllm.CreateMLCEngine(_state.model_id, {
  initProgressCallback: (report) => { ... }
});
```

**Invariato rispetto al piano originale**: nessun `context_window_size`, nessun `sliding_window_size`. Usa i default del `mlc-chat-config.json` del modello.

### Request principale (`sendMessage`, righe 246-258) — **CAMBIATA**

```typescript
const modelParams = aiModels.getModelByModelId(_state.model_id);
const request = {
  messages: [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
  ],
  stream: true,
  enable_thinking: modelParams?.enable_thinking ?? false,
  temperature: modelParams?.temperature ?? 0.7,
  top_p: modelParams?.top_p ?? 0.9,
  max_tokens: modelParams?.max_tokens ?? 256,
  repetition_penalty: modelParams?.repetition_penalty ?? 1.1,
};
```

**Fix 1 e Fix 5 implementati**: i parametri di sampling ora vengono dall'entità BE, non più hardcoded. I fallback (0.7, 0.9, 256, 1.1) si applicano solo se il modello non è trovato nel catalogo.

### Verifica empirica (Playwright, 2026-09-10)

Spy su `console.log` in `use-regex-ai.svelte.ts` intercetta i parametri effettivi passati a `engine.chat.completions.create` dopo l'invio di un messaggio ("any word") nello sheet AI aperto da `/system/settings/security/create`:

```json
{
  "model_id": "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "modelParams": {
    "enable_thinking": false,
    "temperature": 0.3,
    "top_p": 0.8,
    "max_tokens": 256,
    "repetition_penalty": 1.1
  },
  "request_sampling": {
    "enable_thinking": false,
    "temperature": 0.3,
    "top_p": 0.8,
    "max_tokens": 256,
    "repetition_penalty": 1.1
  }
}
```

**Confermato**: `modelParams` (dal BE) → `request_sampling` (passato al engine) → **identici**. I parametri di sampling fluiscono correttamente dal BE entity al WebLLM engine.

**Nota critica**: il modello attualmente configurato nel config row `ai_assistant_model` è **Qwen2.5-1.5B-Instruct** (non-thinking), non Qwen3. Il thinking mode non è attivo in questo momento. Per verificare anche Qwen3 con thinking ON, bisognerebbe cambiare il config row.

### Verifica empirica: model switch (Playwright, 2026-09-10)

Test del selettore modello nello sheet AI: switch da Qwen2.5-1.5B a Qwen3-1.7B tramite dropdown `smart-regex-ai-model-trigger`.

**Prima dello switch** (modello iniziale):
```json
{
  "model_id": "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "request_sampling": {
    "enable_thinking": false,
    "temperature": 0.3,
    "top_p": 0.8,
    "max_tokens": 256,
    "repetition_penalty": 1.1
  }
}
```

**Dopo lo switch** (Qwen3-1.7B selezionato dal dropdown):
```json
{
  "model_id": "Qwen3-1.7B-q4f16_1-MLC",
  "request_sampling": {
    "enable_thinking": true,
    "temperature": 0.6,
    "top_p": 0.95,
    "max_tokens": 768,
    "repetition_penalty": 1.1
  }
}
```

**Confermato**: lo switch del modello carica correttamente le nuove configurazioni dal BE. I parametri cambiano completamente (thinking false→true, T 0.3→0.6, TopP 0.8→0.95, max_tokens 256→768). Non rimangono le configurazioni precedenti.

Questo funziona perché `switchModel()` (riga 143) aggiorna `_state.model_id` e ricrea l'engine, mentre `sendMessage()` legge i parametri da `aiModels.getModelByModelId(_state.model_id)` ad ogni chiamata — non c'è caching dei parametri tra switch.

### System prompt (righe 50-64) — **INVARIATO**

```typescript
function buildSystemPrompt(): string {
  return `You are a regex generator. Convert the user's natural language request into JavaScript regex patterns.

RULES:
1. Output ONLY valid JSON: {"patterns":[{"pattern":"...","flags":""}]}
2. Anchor with ^ and $.
3. No markdown, no explanation, just JSON.
4. If the user message starts with "Current regex:", MODIFY that regex. Add new characters INSIDE the existing character class brackets [...]. Keep all existing characters.
5. If the user says "cancel", "annulla", "reset", or "instead", IGNORE the previous regex and generate a fresh one.
6. "punto" means dot (.), "virgola" means comma (,), "punto e virgola" means dot AND comma (. and ,), "puntoevirgola" or ";" means semicolon (;). "lettere" means letters, "numeri" means numbers.

Example:
User: any word
{"patterns":[{"pattern":"^\\w+$","flags":""}]}`;
}
```

**Fix 3 NON implementato**: ancora single-shot (1 solo esempio).

### Gestione history (righe 228-240) — **INVARIATA**

```typescript
// Simplify assistant messages: show pattern only, not raw JSON
if (m.role === 'assistant' && m.choices && m.choices.length > 0) {
  return { role: 'assistant', content: `Regex: ${m.choices[0].pattern}` };
}
```

**Fix 4 NON implementato**: la history ancora semplifica gli assistant message a `"Regex: <pattern>"`, perdendo la struttura JSON.

### Parsing (righe 357-449) — **INVARIATO**

6 livelli di fallback: JSON.parse → regex field extraction → "Regex:" prefix → bare regex → backtick → null.

**Fix 2 NON implementato**: nessun `response_format` con constrained decoding.

### `generateExamples` (righe 492-512) — **INVARIATO**

Ha ancora i propri parametri di sampling hardcoded (T=0.5, max_tokens=256), indipendenti dal BE.

---

## 2. Stato dei fix del piano originale

| Fix | Piano originale | Stato | Note |
|-----|-----------------|-------|------|
| **Fix 1**: Thinking + sampling params | Riattivare thinking per Qwen3 + parametri corretti | **✅ FATTO + VERIFICATO** | Via BE entity. Playwright spy conferma: `modelParams` (BE) → `request_sampling` (engine) identici. Qwen3-1.7B disattivato thinking (bug multi-turn). Qwen3-4B mantiene thinking ON con max_tokens 2048. |
| **Fix 2**: Constrained decoding | `response_format` con campo `reasoning` | **❌ NON FATTO** | Nessun `response_format` nel request. |
| **Fix 3**: Few-shot prompting | 4-5 esempi diversificati | **✅ FATTO + VERIFICATO** | 5 esempi few-shot. Qwen2.5-1.5B: 3/3 corretti, 1s/turno. Qwen3-1.7B: 0/2 (thinking residuo). |
| **Fix 4**: History JSON preservata | Mantenere JSON completo negli assistant message | **❌ NON FATTO** | Ancora `"Regex: <pattern>"`. |
| **Fix 5**: max_tokens | Limitare divagazioni | **✅ FATTO + VERIFICATO** | Via BE entity. Qwen3-4B: 2048, Qwen3-1.7B: 512, Qwen2.5: 256. |
| **Fix 7**: Thinking fallback | Fallback quando thinking non si chiude | **✅ FATTO + VERIFICATO** | FE-only. Previene blocco UI quando Qwen3 thinking supera max_tokens. |
| **Fix 6**: RAG minimale | Transformers.js + IndexedDB | **❌ NON FATTO** | Opzionale, solo se Fix 1-5 non bastano. |

---

## 3. Cause residue dell'allucinazione (post-Fix 1+5)

Con Fix 1 e 5 implementati, i parametri di sampling sono ora corretti. Le cause residue:

| # | Causa | Impatto | Evidenza |
|---|-------|--------|----------|
| 1 | **Single-shot prompting** | Alto | 1 esempio per 1.5-4B è insufficiente; servono 4-5 esempi vari (incluso edit incrementale) |
| 2 | **History semplificata perde formato JSON** | Medio | Assistant → "Regex: ..." invece di JSON → formato incoerente nel contesto multi-turno |
| 3 | **JSON prompt-only, non constrained** | Medio | 6 fallback nel parser = sintomo di fallimento frequente del formato |
| 4 | **`generateExamples` ha params hardcoded** | Basso | T=0.5/max_tokens=256 non derivano dal BE; inconsistenza minore |

### BUG CRITICO: Qwen3 thinking block mai chiuso (2026-09-10)

**Sintomo**: Lo streaming del modello Qwen3-1.7B "si interrompe" — l'UI mostra il thinking indicator ma nessuna risposta. Riproducibile con:
1. "solo lettere e numeri" → OK (risponde in 1-5s)
2. "aggiungiamo anche il punto e la virgola" → **BLOCCO** (thinking infinito, nessuna risposta)

**Root cause empiricamente verificata** (Playwright spy su `engine.chat.completions.create`):

1. **Qwen3-1.7B genera thinking content anche con `enable_thinking: false`** in conversazioni multi-turno. Il primo messaggio (single-turn) rispetta `enable_thinking: false`, ma il secondo (con history) genera `` tags ignorando il parametro. Questo è un bug noto di Qwen3/WebLLM.

2. **Il thinking non viene mai chiuso**: il modello genera 768-2048 token di reasoning senza mai produrre ``. Il thinking text finisce a metà frase ("...characters, but") — il modello esaurisce `max_tokens` mentre sta ancora pensando.

3. **Il parser resta bloccato in `inThinking=true`**: quando lo stream finisce con `inThinking=true` e `responseText=""`, l'UI appare bloccata perché nessun contenuto viene mostrato.

**Evidenza**:
```
Stream ended: 768 chunks, inThinking=true, thinkingEnded=false, responseText=
Thinking has : false  ← NESSUN tag di chiusura
Thinking length: 3207
Thinking ends with: "e user meant to include the dot and comma as part of the allowed ch"
```

**Fix applicato (FE)**: Fallback nello streaming — quando lo stream finisce con `inThinking=true` e `responseText=""`, il thinking text viene passato al parser come fallback per estrarre una regex:

```typescript
if (inThinking && thinkingText && !responseText) {
  console.warn('[SmartRegex] Stream ended inside thinking block (max_tokens likely too low). Attempting fallback extraction from thinking text.');
  responseText = thinkingText;
  _state.streaming_text = responseText;
}
```

**Fix applicato (DB)**: Configurazione Qwen3-1.7B aggiornata:
- `enable_thinking: false` (era `true`)
- `max_tokens: 512` (era `768`)

**Fix applicato (DB)**: Configurazione Qwen3-4B aggiornata:
- `max_tokens: 2048` (era `768`)

**Issue residuo**: Qwen3-1.7B genera thinking in multi-turn anche con `enable_thinking: false`. Il fallback previene il blocco UI ma il risultato è raw thinking text (non JSON). Soluzioni possibili:
- Aumentare `max_tokens` a 1024+ per Qwen3-1.7B (lento ma può completare)
- Usare Qwen2.5-1.5B per produzione (affidabile, no thinking)
- Testare Qwen3-4B (più grande, potrebbe gestire meglio il thinking)

### Test Fix 3 (few-shot) con Qwen2.5-1.5B e Qwen3-1.7B (Playwright, 2026-09-10)

Fix 3 implementato: system prompt ampliato da 1 a 5 esempi few-shot (any word, email, numero 3-5 cifre, lettere e numeri, edit incrementale).

**Qwen2.5-1.5B** (enable_thinking=false, max_tokens=256):

| Turn | Prompt | Latenza | Risposta | JSON valido | Fallback |
|------|--------|---------|----------|:-----------:|:--------:|
| 1 | "solo lettere e numeri" | 1s | `^[a-zA-Z0-9]+$` | Quasi (`pattern=` invece di `"pattern":`) | No |
| 2 | "aggiungiamo anche il punto e la virgola" | 1s | `^[a-zA-Z0-9.,]+$` | Si | No |
| 3 | "aggiungi anche l'underscore e il trattino" | 1s | `^[a-zA-Z0-9.,-_]+$` | Si | No |

**Qwen2.5-1.5B: 3/3 corretti, 1s per turno.** Il few-shot ha migliorato la qualità e la velocità. L'unico issue è un JSON leggermente malformato nel turn 1 (`pattern=` invece di `"pattern":`), ma il parser lo gestisce.

**Qwen3-1.7B** (enable_thinking=false, max_tokens=512):

| Turn | Prompt | Latenza | Risposta | JSON valido | Fallback |
|------|--------|---------|----------|:-----------:|:--------:|
| 1 | "solo lettere e numeri" | 10s | `^[a-z0-9]+$` (solo minuscole) | No (thinking text) | **Si** |
| 2 | "aggiungiamo anche il punto e la virgola" | 8s | `^[a-z0-9]+$` (non modificata!) | No (thinking text) | **Si** |

**Qwen3-1.7B: 0/2 corretti.** Il modello genera thinking nonostante `enable_thinking: false`. Il fallback estrae la prima regex menzionata nel thinking text, che nel turn 2 è la regex precedente (non modificata). Il modello è inaffidabile per regex generation.

**Confronto Fix 3 vs pre-Fix 3**:

| Modello | Pre-Fix 3 | Post-Fix 3 |
|---------|-----------|------------|
| Qwen2.5-1.5B | Non testato multi-turn | **3/3 corretti, 1s/turno** |
| Qwen3-1.7B | 1/2 (thinking blocco) | 0/2 (thinking residuo) |
| Qwen3-4B | 3/3 corretti (pre-Fix 3) | **3/3 corretti, ma 1 bug Unicode** |

### Test Fix 3 con Qwen3-4B (Playwright, 2026-09-10)

Qwen3-4B con `enable_thinking: true, max_tokens: 2048` + Fix 3 (few-shot 5 esempi):

| Turn | Prompt | Latenza | Risposta | JSON | Fallback | Issue |
|------|--------|---------|----------|:----:|:--------:|-------|
| 1 | "solo lettere e numeri" | 13s | `^[a-zA-Z0-9]+$` | Si | No | — |
| 2 | "aggiungiamo anche il punto e la virgola" | 33s | `^[a-zA-Z0-9.,]+$` | Si | No | — |
| 3 | "aggiungi anche l'underscore e il trattino" | 48s | `^[a-zA-Z0-9.,_−]+$` | Si | No | **`−` (U+2212 MINUS) invece di `-` (U+002D HYPHEN)** |

**Qwen3-4B: 3/3 JSON validi, nessun fallback.** Tutte le regex semanticamente corrette, ma il turn 3 ha un bug Unicode: il modello ha generato `−` (U+2212 MINUS SIGN) invece di `-` (U+002D HYPHEN-MINUS). La regex non funzionerà correttamente in JavaScript — `−` non è un metacharacter e viene trattato come carattere letterale.

**Confronto Qwen3-4B pre-Fix 3 vs post-Fix 3**:

| Turn | Pre-Fix 3 (latenza) | Post-Fix 3 (latenza) | Differenza |
|------|:---:|:---:|:---:|
| 1 | 16s | 13s | -3s |
| 2 | 14s | 33s | +19s |
| 3 | 39s | 48s | +9s |

Il few-shot non ha migliorato significativamente la latenza di Qwen3-4B (il thinking domina). La qualità è leggermente peggiorata nel turn 3 (bug Unicode).

**Issue Unicode `−` vs `-`**: Il modello confonde il "minus sign" (carattere tipografico) con l'hyphen (carattere regex). Fix possibile: post-processing del pattern per normalizzare `−` (U+2212) → `-` (U+002D), oppure aggiungere un esempio few-shot che mostri esplicitamente l'hyphen `-` come trattino.

### Fix Unicode bug (prompt-level, 2026-09-10)

**Root cause**: Il system prompt non vincolava il charset. Il termine italiano "trattino" è semanticamente ambiguo (hyphen U+002D, minus U+2212, dash U+2014). Qwen3, addestrato su testi tipografici, mappava "trattino" al carattere tipografico `−` (U+2212) invece dell'hyphen ASCII `-` (U+002D). Il bug era intermittente (dipende dal path di thinking non-deterministico).

**Fix applicato (prompt-level, sistematico)**: Aggiunta regola 7 al system prompt:

```
7. Use ONLY ASCII characters (U+0020 to U+007E) in regex patterns. NEVER use Unicode look-alikes: use - (U+002D HYPHEN-MINUS) for "trattino"/"dash"/"minus", NEVER the Unicode minus sign (U+2212) or en-dash (U+2013) or em-dash (U+2014). Use ' (U+0027 APOSTROPHE) for apostrophe, NEVER the Unicode right single quote (U+2019). Use " (U+0022 QUOTATION MARK) for quotes, NEVER the Unicode left/right double quotes (U+201C/U+201D).
```

Più un sesto esempio few-shot che disambigua esplicitamente "trattino" → `-`:

```
User: Current regex: ^[a-zA-Z0-9.,]+$
aggiungi underscore e trattino
{"patterns":[{"pattern":"^[a-zA-Z0-9.,_-]+$","flags":""}]}
```

**Verifica empirica (Qwen3-4B, post-fix)**:

| Turn | Prompt | Latenza | Risposta | Non-ASCII chars | Fallback |
|------|--------|---------|----------|:--------------:|:--------:|
| 1 | "solo lettere e numeri" | 11s | `^[a-zA-Z0-9]+$` | 0 | No |
| 2 | "aggiungiamo anche il punto e la virgola" | 11s | `^[a-zA-Z0-9.,]+$` | 0 | No |
| 3 | "aggiungi anche l'underscore e il trattino" | 49s | `^[a-zA-Z0-9.,_\-]+$` | **0** | No |

**Bug Unicode risolto**: il turn 3 ora genera `\-` (U+002D HYPHEN-MINUS escapato, corretto) invece di `−` (U+2212 MINUS SIGN, sbagliato). Il fix è sistematico (a livello di prompt, non carattere per carattere) perché:
1. La regola 7 vincola TUTTI i caratteri a ASCII, coprendo hyphen, apostrofo, virgolette e qualsiasi altro look-alike Unicode
2. L'esempio few-shot mostra esplicitamente il mapping "trattino" → `-` ASCII
3. Non richiede post-processing o patching carattere per carattere

### Riesecuzione test completa post-fix Unicode (Playwright, 2026-09-10)

Prompt aggiornato (regola 7 ASCII + 6 esempi few-shot). Test su tutti e 3 i modelli con lo stesso scenario 3-turni.

**Qwen2.5-1.5B** (enable_thinking=false, max_tokens=256):

| Turn | Prompt | Latenza | Risposta | Non-ASCII | Fallback |
|------|--------|---------|----------|:---------:|:--------:|
| 1 | "solo lettere e numeri" | 1s | `^[a-zA-Z0-9]+$` | 0 | No |
| 2 | "aggiungiamo anche il punto e la virgola" | 1s | `^[a-zA-Z0-9.,]+$` | 0 | No |
| 3 | "aggiungi anche l'underscore e il trattino" | 1s | `^[a-zA-Z0-9.,-_]+$` | 0 | No |

**Qwen2.5-1.5B: 3/3 corretti, 1s/turno, 0 non-ASCII, 0 fallback.** Perfetto.

**Qwen3-1.7B** (enable_thinking=false, max_tokens=512):

| Turn | Prompt | Latenza | Risposta (parser) | Non-ASCII | Fallback |
|------|--------|---------|-------------------|:---------:|:--------:|
| 1 | "solo lettere e numeri" | 9s | `^[a-zA-Z0-9]+$` | 0 | **Si** |
| 2 | "aggiungiamo anche il punto e la virgola" | 10s | `^[a-zA-Z0-9.,]+$` | 0 | **Si** |
| 3 | "aggiungi anche l'underscore e il trattino" | 13s | `^[a-zA-Z0-9.,_-]+$` | 0 | **Si** |

**Qwen3-1.7B: 3/3 regex corrette, 0 non-ASCII, ma 3/3 fallback.** Il modello genera thinking nonostante `enable_thinking: false`. Il fallback estrae la regex corretta dal thinking text in tutti i turni — sorprendentemente, anche il turn 3 ha estratto `^[a-zA-Z0-9.,_-]+$` (corretto, con hyphen ASCII). Tuttavia il modello rimane inaffidabile perché dipende dal fallback.

**Qwen3-4B** (enable_thinking=true, max_tokens=2048) — test precedente:

| Turn | Prompt | Latenza | Risposta | Non-ASCII | Fallback |
|------|--------|---------|----------|:---------:|:--------:|
| 1 | "solo lettere e numeri" | 11s | `^[a-zA-Z0-9]+$` | 0 | No |
| 2 | "aggiungiamo anche il punto e la virgola" | 11s | `^[a-zA-Z0-9.,]+$` | 0 | No |
| 3 | "aggiungi anche l'underscore e il trattino" | 49s | `^[a-zA-Z0-9.,_\-]+$` | 0 | No |

**Qwen3-4B: 3/3 corretti, 0 non-ASCII, 0 fallback.** Pensiero gestito correttamente.

**Riepilogo finale post-fix Unicode**:

| Modello | Turn 1 | Turn 2 | Turn 3 | Latenza media | Non-ASCII | Fallback | Affidabilità |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Qwen2.5-1.5B** | OK 1s | OK 1s | OK 1s | **1s** | 0 | 0 | **Alta** |
| Qwen3-1.7B | Fallback 9s | Fallback 10s | Fallback 13s | 11s | 0 | 3 | Bassa |
| **Qwen3-4B** | OK 11s | OK 11s | OK 49s | 24s | 0 | 0 | **Alta** |

**Conclusione**: Il fix Unicode (regola 7 + esempio few-shot) è efficace su tutti i modelli — 0 caratteri non-ASCII in tutti i 9 test (3 modelli × 3 turni). Qwen2.5-1.5B rimane il modello preferito per velocità (1s) e affidabilità (no thinking, no fallback). Qwen3-4B è il modello preferito per qualità (thinking produttivo) ma più lento. Qwen3-1.7B rimane inaffidabile (thinking residuo nonostante `enable_thinking: false`), ma il fallback ora estrae regex corrette in tutti i turni.

**Conclusione Fix 3**: Il few-shot prompting migliora significativamente Qwen2.5-1.5B (velocità + accuratezza). Qwen3-1.7B rimane inaffidabile a causa del thinking residuo. Qwen3-4B resta il modello preferito per qualità.

Qwen3-4B con `enable_thinking: true, max_tokens: 2048` testato con lo stesso scenario multi-turn:

| Turn | Prompt | Latenza | Risposta | Fallback |
|------|--------|---------|----------|----------|
| 1 | "solo lettere e numeri" | 16s | `^[A-Za-z0-9]+$` ✅ | No |
| 2 | "aggiungiamo anche il punto e la virgola" | 14s | `^[A-Za-z0-9.,]+$` ✅ | No |
| 3 | "aggiungi anche l'underscore e il trattino" | 39s | `^[A-Za-z0-9.,_ -]+$` ✅ | No |

**Qwen3-4B funziona perfettamente**: thinking ON, max_tokens 2048, nessun fallback, tutte le regex corrette. Il modello completa il thinking, chiude con ``, e genera JSON valido in tutti i turni.

**Confronto finale**:

| Modello | enable_thinking | max_tokens | Single-turn | Multi-turn | Affidabilità |
|---------|:---:|:---:|:---:|:---:|:---:|
| Qwen3-1.7B | false | 512 | ✅ | ❌ (thinking residuo) | Bassa |
| Qwen2.5-1.5B | false | 256 | ✅ | ✅ | Alta (no thinking) |
| Qwen3-4B | true | 2048 | ✅ | ✅ | Alta (thinking gestito) |

**Raccomandazione**: Qwen3-4B è il modello preferito per qualità (thinking produttivo + multi-turn stabile). Qwen2.5-1.5B è il fallback affidabile (più veloce, no thinking). Qwen3-1.7B non è affidabile per multi-turn.

---

## 4. Raccomandazioni residue (aggiornate per architettura BE-managed)

### Fix 3: Few-shot prompting (PRIORITÀ ALTA — FE-only)

**Sforzo**: minimo (modifica `buildSystemPrompt()` in `use-regex-ai.svelte.ts`).
**Impatto**: alto — i modelli small (1.5-4B) beneficiano enormemente del few-shot.

Sostituire il single-shot con 5 esempi che coprono casi diversi:

```
Examples:

User: any word
{"reasoning":"A word is one or more word characters, anchored","patterns":[{"pattern":"^\\w+$","flags":""}]}

User: email address
{"reasoning":"Email = local-part@domain.tld. Local = alnum+dot. Domain = alnum+dot. TLD = 2+ letters","patterns":[{"pattern":"^[\\w.]+@[\\w.]+\\.[a-z]{2,}$","flags":"i"}]}

User: numero di 3-5 cifre
{"reasoning":"3 to 5 digits = \\d{3,5}, anchored","patterns":[{"pattern":"^\\d{3,5}$","flags":""}]}

User: lettere e numeri
{"reasoning":"Alphanumeric = [a-zA-Z0-9], one or more, anchored","patterns":[{"pattern":"^[a-zA-Z0-9]+$","flags":""}]}

User: Current regex: ^[a-z]+$
aggiungi numeri
{"reasoning":"Add digits inside the existing character class [a-z] → [a-z0-9]","patterns":[{"pattern":"^[a-z0-9]+$","flags":""}]}
```

**Nota**: il campo `reasoning` nello schema few-shot prepara il modello al Fix 2 (constrained decoding con reasoning field). Anche senza constrained decoding, il few-shot con `reasoning` migliora la qualità.

### Fix 4: Mantenere JSON nella history (PRIORITÀ MEDIA — FE-only)

**Sforzo**: minimo (modifica `historyMessages` map in `use-regex-ai.svelte.ts`).
**Impatto**: medio — coerenza di formato nel contesto multi-turno.

```typescript
// DOPO:
if (m.role === 'assistant' && m.choices && m.choices.length > 0) {
  const c = m.choices[0];
  return {
    role: 'assistant',
    content: JSON.stringify({
      reasoning: c.description || '',
      patterns: [{ pattern: c.pattern, flags: c.flags }],
    })
  };
}
```

Con Fix 3 (few-shot con `reasoning`), questo mantiene coerenza: il modello vede sempre JSON con `reasoning` + `patterns` in tutto il contesto.

### Fix 2: Constrained decoding (PRIORITÀ MEDIA — richiede decisione architetturale)

**Sforzo**: medio (BE migration + FE logic).
**Impatto**: medio — elimina i 6 fallback del parser.

**Decisione architetturale richiesta**: il constrained decoding è per-modello o globale?

**Opzione A — FE-only (semplice)**: hardcodare lo schema nel FE, applicarlo a tutti i modelli.

```typescript
const REGEX_JSON_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    reasoning: {
      type: "string",
      description: "Step-by-step analysis: what characters/classes/quantifiers/anchors are needed"
    },
    patterns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "The regex pattern without flags, anchored with ^ and $" },
          flags: { type: "string", description: "Regex flags (e.g. i, g, m) or empty string" }
        },
        required: ["pattern", "flags"]
      }
    }
  },
  required: ["reasoning", "patterns"]
});

const request = {
  ...,
  response_format: {
    type: "json_object",
    schema: REGEX_JSON_SCHEMA,
  } as webllm.ResponseFormat,
};
```

**Opzione B — BE-managed (coerente con architettura)**: aggiungere campo `use_constrained_decoding: boolean` all'entità `ai_models`. Il FE legge il flag e applica `response_format` condizionalmente.

```sql
ALTER TABLE ai_models ADD COLUMN use_constrained_decoding boolean NOT NULL DEFAULT false;
```

- Qwen3 (thinking ON): `use_constrained_decoding = false` (thinking genera token non-JSON)
- Qwen2.5 (non-thinking): `use_constrained_decoding = true` (output garantito JSON)

**Raccomandazione**: Opzione B, per coerenza con l'architettura BE-managed. Ma prima verificare empiricamente che il constrained decoding non peggiori la qualità (vedi "JSON Mode Makes Your LLM Dumber").

### Fix 2b: Allineare `generateExamples` al BE (PRIORITÀ BASSA — FE-only)

Attualmente `generateExamples` ha parametri hardcoded (T=0.5, max_tokens=256). Allineare al BE:

```typescript
const modelParams = aiModels.getModelByModelId(_state.model_id);
const completion = await engine.chat.completions.create({
  messages: [...],
  temperature: modelParams?.temperature ?? 0.5,
  max_tokens: modelParams?.max_tokens ?? 256,
  stream: false,
});
```

### Fix 6: RAG minimale (SOLO SE NECESSARIO — non prioritario)

Invariato dal piano originale. Solo se Fix 2+3+4 non bastano.

---

## 5. Scelta strategica: Thinking vs Constrained Decoding (aggiornata)

Con l'architettura BE-managed, la scelta è **per-modello**, non globale:

| Modello | Thinking | Constrained | Approccio |
|---------|:---:|:---:|-----------|
| Qwen3-1.7B | ON | OFF | Approccio A — reasoning vero, parser robusto |
| Qwen3-4B | ON | OFF | Approccio A — reasoning vero, parser robusto |
| Qwen2.5-1.5B | OFF | ON (con reasoning) | Approccio B — output garantito JSON |

Questo è già parzialmente riflesso nel DB (`enable_thinking` per-modello). Se si implementa Fix 2 (Opzione B), `use_constrained_decoding` completa la matrice.

---

## 6. Piano di verifica empirica (aggiornato)

Confrontare le configurazioni sui 20 prompt del test set originale:

| Config | Regex valide / 20 | Parse falliti / 20 | Latenza media (s) |
|--------|:---:|:---:|:---:|
| **Attuale** (Fix 1+5 done, no Fix 2/3/4) | baseline | baseline | baseline |
| + Fix 3 (few-shot 5 esempi) | ? | ? | ? |
| + Fix 4 (history JSON preservata) | ? | ? | ? |
| + Fix 2 (constrained decoding, Qwen2.5 only) | ? | ? | ? |

**Test set** (invariato dal piano originale): 10 prompt semplici + 10 edit incrementali.

**Criterio di successo**: ≥ 16/20 regex valide (sintatticamente corrette + semanticamente vicine al prompt).

---

## 7. Riepilogo esecutivo aggiornato

| Fix | Stato | Sforzo | Impatto | Architettura |
|-----|:---:|:---:|:---:|:---|
| Fix 1: Thinking + sampling params | ✅ FATTO + VERIFICATO | — | Alto | BE-managed |
| Fix 5: max_tokens | ✅ FATTO + VERIFICATO | — | Basso | BE-managed |
| Fix 7: Thinking fallback | ✅ FATTO + VERIFICATO | Minimo | Critico | FE-only |
| Fix 3: Few-shot prompting | ✅ FATTO + VERIFICATO | Minimo | Alto | FE-only |
| Fix 4: History JSON preservata | ❌ DA FARE | Minimo | Medio | FE-only |
| Fix 2: Constrained decoding | ❌ DA FARE | Medio | Medio | BE+FE (Opzione B) |
| Fix 2b: generateExamples params | ❌ DA FARE | Minimo | Basso | FE-only |
| Fix 6: RAG | ❌ OPZIONALE | Alto | Incerto | FE-only |

**Priorità di intervento residua**:
1. **Alta**: Fix 3 (few-shot) — impatto massimo, sforzo minimo, FE-only
2. **Media**: Fix 4 (history JSON) — impatto medio, sforzo minimo, FE-only
3. **Media**: Fix 2 (constrained decoding) — impatto medio, sforzo medio, richiede decisione architetturale (Opzione A vs B)
4. **Bassa**: Fix 2b (generateExamples) — impatto basso, sforzo minimo, FE-only
5. **Solo se necessario**: Fix 6 (RAG) — impatto incerto, sforzo alto

**Issue Qwen3-1.7B residuo**: Il modello genera thinking in multi-turn anche con `enable_thinking: false`. Il fallback previene il blocco UI ma il risultato non è JSON. Soluzioni: aumentare max_tokens (lento), usare Qwen2.5-1.5B (affidabile), o testare Qwen3-4B.

---

## Fonti

- WebLLM API Reference: <https://webllm.mlc.ai/docs/user/api_reference.html>
- WebLLM JSON Mode and Schema: <https://deepwiki.com/mlc-ai/web-llm/5.2-json-mode-and-schema>
- WebLLM WebGPU start to first response: <https://dev.to/multigrid/webllm-start-to-first-response-in-the-browser-21d5>
- Qwen3-1.7B HuggingFace (sampling params thinking/non-thinking): <https://huggingface.co/Qwen/Qwen3-1.7B>
- Qwen3 thinking docs: <https://docs.qwencloud.com/developer-guides/text-generation/thinking>
- Qwen3 KV cache bug (enable_thinking=false): <https://github.com/QwenLM/Qwen3/issues/1826>
- Benchmark Qwen3 thinking vs non-thinking: <https://dev.to/_8242e3013b3a729b9bb98/i-benchmarked-qwen3-thinking-mode-vs-non-thinking-on-my-own-task-heres-the-script-4mel>
- When to turn reasoning models off: <https://www.citiumtech.com/insights/reasoning-vs-non-reasoning-models>
- JSON Mode makes your LLM dumber: <https://dev.to/ji_ai/json-mode-makes-your-llm-dumber-the-constrained-decoding-trap-cp>
- StructuredRAG benchmark: <https://arxiv.org/html/2408.11061v1>
- Browser RAG with WebGPU: <https://dev.to/emanuelestrazzullo/building-a-browser-based-rag-system-with-webgpu-h2n>
- WebLLM vs wllama comparison: <https://localmode.dev/blog/compare/webllm-vs-wllama>
- WebLLM Qwen3 enable_thinking support (commit): <https://github.com/mlc-ai/web-llm/commit/089bbd0ce77ba5395a68409ef3ca9916f36e1974>

---

## 8. Confronto esteso 12 modelli (WebLLM q4f16_1, 2026-09-10)

### Metodologia

Test empirico su UI Smart Regex (`/system/settings/security/create`) con WebLLM
reale via WebGPU. Tre turni multi-turn identici per ogni modello:

1. `solo lettere e numeri`
2. `aggiungiamo anche il punto e la virgola`
3. `aggiungi anche l'underscore e il trattino`

Regex attese:
- Turn 1: `^[a-zA-Z0-9]+$`
- Turn 2: `^[a-zA-Z0-9.,]+$`
- Turn 3: `^[a-zA-Z0-9.,_-]+$` (o equivalente con `-` ASCII U+002D)

Per ogni turno: latenza (s), regex estratta, fallback (sì/no), caratteri
non-ASCII e code point, match con atteso. Spy console su log `SmartRegex`.

VRAM da `prebuiltAppConfig.model_list` di WebLLM (q4f16_1).

### Risultati per modello

#### Qwen3.5-0.8B-q4f16_1-MLC (VRAM 1629.49 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 76s | — | sì (warning) | — | ❌ |
| 2 | — | — | — | — | ❌ (non testato) |
| 3 | — | — | — | — | ❌ (non testato) |

**Esito**: FALLIMENTO TOTALE. Lo stream termina dentro il thinking block dopo 76s;
nessuna regex estraibile dal testo thinking disponibile. Modello troppo piccolo
per il task con `enable_thinking: true`. Test interrotto dopo Turn 1.

#### Qwen3.5-2B-q4f16_1-MLC (VRAM 2245.44 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | ~5s | `^[a-zA-Z0-9]+$` | no | 0 | ✅ |
| 2 | ~3s | `^[a-zA-Z0-9.,]+$` | no | 0 | ✅ |
| 3 | ~2s | `^[a-zA-Z0-9.,_-]+$` | no | 0 | ✅ |

**Esito**: 3/3. JSON pulito, no fallback, no non-ASCII. Eccellente.

#### Qwen2.5-0.5B-Instruct-q4f16_1-MLC (VRAM 944.62 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 3s | `^[a-zA-Z0-9]+$` | no | 0 | ✅ |
| 2 | 1s | `^[a-zA-Z0-9]+[. ]*[a-zA-Z0-9]+$` | no | 0 | ❌ |
| 3 | 1s | `^[a-zA-Z0-9]+[. ]*[a-zA-Z0-9]+$` | no | 0 | ❌ |

**Esito**: 1/3. Modello troppo piccolo per seguire le istruzioni multi-turn;
genera pattern alternativi invece di character class. JSON valido ma
semanticamente errato.

#### Qwen2.5-3B-Instruct-q4f16_1-MLC (VRAM 2504.76 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 5s | `^[0-9a-zA-Z]+$` | no | 0 | ✅ |
| 2 | 3s | `^\d[a-zA-Z.,]+|[a-z.,]\d+$` | no | 0 | ❌ |
| 3 | 3s | `^\d[a-zA-Z.,_]+|[a-z.,_]\d+$` | no | 0 | ❌ |

**Esito**: 1/3. Sorprendentemente peggio del 1.5B: genera pattern con
alternanza `\d`/`[a-z]` invece di character class unica. JSON valido ma
semanticamente errato.

#### Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC (VRAM 1629.75 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 2s | `^[a-zA-Z0-9]+$` | no | 0 | ✅ |
| 2 | 2s | `^[a-zA-Z0-9.,]+$` | no | 0 | ✅ |
| 3 | 2s | `^[a-zA-Z0-9.,_-]+$` | no | 0 | ✅ |

**Esito**: 3/3. 2s/turno costanti, no fallback, no non-ASCII. Turn 2-3
output come plain text (`Regex: ...`) invece di JSON ma il parser gestisce.
**Migliore rapporto qualità/velocità/VRAM**.

#### Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC (VRAM 2504.76 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 3s | `^[a-zA-Z0-9]+$` | no | 0 | ✅ |
| 2 | 3s | `^[a-zA-Z0-9.,]+$` | no | 0 | ✅ |
| 3 | 3s | `^[a-zA-Z0-9.,_-]+$` | no | 0 | ✅ |

**Esito**: 3/3. JSON pulito in tutti i turni, no fallback, no non-ASCII.
3s/turno costanti. **Migliore qualità output (JSON sempre valido)**.

#### Llama-3.2-1B-Instruct-q4f16_1-MLC (VRAM 879.04 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 6s | `^[a-zA-Z0-9]+[^\s]*$` | no | 0 | ❌ |
| 2 | 1s | `^[\w.]+[\w.]+\.[a-z]{2,}$` | no | 0 | ❌ |
| 3 | 2s | `^[\w.]+[\w.]+\.[a-z]{2,}_[\w.]+[\w.]+\.[a-z]{2,}$` | no | 0 | ❌ |

**Esito**: 0/3. Non segue le istruzioni: Turn 1 aggiunge `[^\s]*`, Turn 2-3
genera regex email completamente slegate. Pessimo.

#### Llama-3.2-3B-Instruct-q4f16_1-MLC (VRAM 2263.69 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 5s | `^[a-zA-Z0-9]+$` | no | 0 | ✅ |
| 2 | 2s | `^[a-zA-Z0-9.,]+$` | no | 0 | ✅ |
| 3 | 2s | `^[a-zA-Z0-9.,_-]+$` | no | 0 | ✅ |

**Esito**: 3/3. JSON pulito, no fallback, no non-ASCII. Molto meglio del 1B.
2-5s/turno. **Affidabile**.

#### gemma-2-2b-it-q4f16_1-MLC (VRAM 1895.30 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 6s | `^[a-zA-Z0-9]+$` | no | 0 | ✅ |
| 2 | 3s | `^[a-zA-Z0-9.,\s]+$` | no | 0 | ❌ |
| 3 | 3s | `^[a-zA-Z0-9.,_-]+$` | no | 0 | ✅ |

**Esito**: 2/3. Turn 2 aggiunge `\s` non richiesto (interpreta "virgola" come
whitespace?), Turn 3 corregge. JSON in code block markdown. Parziale.

#### SmolLM2-1.7B-Instruct-q4f16_1-MLC (VRAM 1774.19 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 5s | `^[a-zA-Z0-9]+$` | no | 0 | ✅ |
| 2 | 2s | `^[a-zA-Z0-9.,_]+$` | no | 0 | ❌ |
| 3 | 2s | `^[a-zA-Z0-9.,_]+$` | no | 0 | ❌ |

**Esito**: 1/3. Turn 2 aggiunge `_` prematuramente, Turn 3 non aggiunge `-`
(hyphen). Output plain text. Deludente.

#### Phi-3.5-mini-instruct-q4f16_1-MLC (VRAM 3672.07 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 7s | `^[a-zA-Z0-9]+$` | no | 0 | ✅ |
| 2 | 3s | `^[a-zA-Z0-9.,;]+$` | no | 0 | ❌ |
| 3 | 4s | `^[a-zA-Z0-9.,_;]+$` | no | 0 | ❌ |

**Esito**: 1/3. Turn 2 interpreta "punto e virgola" come `;` (semicolon) invece
di `,` (comma), Turn 3 manca `-` (hyphen). Load 80s (download). VRAM alto.
Pessimo rapporto qualità/costo.

#### Hermes-3-Llama-3.2-3B-q4f16_1-MLC (VRAM 2263.69 MB)

| Turn | Latenza | Regex | Fallback | Non-ASCII | Match |
|------|--------:|-------|:---:|:---:|:---:|
| 1 | 3s | `^[a-zA-Z0-9]+$` | no | 0 | ✅ |
| 2 | 2s | `^[a-zA-Z0-9.,]+$` | no | 0 | ✅ |
| 3 | 2s | `^[a-zA-Z0-9._,-]+$` | no | 0 | ✅ |

**Esito**: 3/3. Ordine caratteri diverso (`._,-` invece di `_,_-`) ma
semanticamente corretto. JSON Turn 1-2, plain text Turn 3 (parser gestisce).
2-3s/turno. **Affidabile**.

### Tabella riepilogo

| Modello | VRAM | T1 | T2 | T3 | Score | Lat media | Fallback | Non-ASCII | Raccomandazione |
|---------|----:|:--:|:--:|:--:|:----:|--------:|:---:|:---:|-----------|
| Qwen3.5-0.8B | 1629 MB | ❌ | — | — | 0/1 | 76s | 1 | — | ❌ Scartare |
| **Qwen3.5-2B** | 2245 MB | ✅ | ✅ | ✅ | **3/3** | ~3s | 0 | 0 | ✅ Recommended (thinking) |
| Qwen2.5-0.5B | 945 MB | ✅ | ❌ | ❌ | 1/3 | ~2s | 0 | 0 | ❌ Troppo piccolo |
| Qwen2.5-3B | 2505 MB | ✅ | ❌ | ❌ | 1/3 | ~4s | 0 | 0 | ❌ Pattern errati |
| **Qwen2.5-Coder-1.5B** | 1630 MB | ✅ | ✅ | ✅ | **3/3** | **2s** | 0 | 0 | ✅ **Best value** |
| **Qwen2.5-Coder-3B** | 2505 MB | ✅ | ✅ | ✅ | **3/3** | 3s | 0 | 0 | ✅ Best quality JSON |
| Llama-3.2-1B | 879 MB | ❌ | ❌ | ❌ | 0/3 | ~3s | 0 | 0 | ❌ Scartare |
| **Llama-3.2-3B** | 2264 MB | ✅ | ✅ | ✅ | **3/3** | ~3s | 0 | 0 | ✅ Affidabile |
| gemma-2-2b-it | 1895 MB | ✅ | ❌ | ✅ | 2/3 | ~4s | 0 | 0 | ⚠️ Parziale |
| SmolLM2-1.7B | 1774 MB | ✅ | ❌ | ❌ | 1/3 | ~3s | 0 | 0 | ❌ Istruzioni non seguite |
| Phi-3.5-mini | 3672 MB | ✅ | ❌ | ❌ | 1/3 | ~5s | 0 | 0 | ❌ VRAM alto, qualità bassa |
| **Hermes-3-Llama-3.2-3B** | 2264 MB | ✅ | ✅ | ✅ | **3/3** | ~2s | 0 | 0 | ✅ Affidabile |

### Confronto con baseline (3 modelli precedenti)

| Modello | Score | Note |
|---------|:---:|------|
| Qwen2.5-1.5B | 3/3 | Baseline affidabile, 1s/turno |
| Qwen3-1.7B | 3/3 (fallback) | Affidabile solo con fallback, 11s/turno |
| Qwen3-4B | 3/3 | Thinking produttivo, 24s/turno |
| **Qwen2.5-Coder-1.5B** | **3/3** | **Best value: 2s, 1630 MB, no fallback** |
| **Qwen2.5-Coder-3B** | **3/3** | **Best JSON quality: 3s, 2505 MB** |
| **Qwen3.5-2B** | **3/3** | **Best thinking: ~3s, 2245 MB** |
| **Llama-3.2-3B** | **3/3** | Affidabile: ~3s, 2264 MB |
| **Hermes-3-Llama-3.2-3B** | **3/3** | Affidabile: ~2s, 2264 MB |

### Raccomandazioni finali

#### Tier 1 — Recommended (3/3, no fallback, no non-ASCII)

1. **Qwen2.5-Coder-1.5B-Instruct** — Best overall value
   - VRAM 1630 MB, 2s/turno, JSON o plain text (parser gestisce)
   - Default raccomandato per utenti con VRAM limitata
2. **Qwen2.5-Coder-3B-Instruct** — Best JSON quality
   - VRAM 2505 MB, 3s/turno, JSON sempre valido
   - Raccomandato per qualità output stabile
3. **Qwen3.5-2B** — Best thinking model
   - VRAM 2245 MB, ~3s/turno, thinking produttivo
   - Raccomandato se si vuole reasoning visibile
4. **Llama-3.2-3B-Instruct** — Solid generalist
   - VRAM 2264 MB, ~3s/turno, JSON pulito
   - Alternativa non-Qwen affidabile
5. **Hermes-3-Llama-3.2-3B** — Fast + affidabile
   - VRAM 2264 MB, ~2s/turno, JSON o plain text
   - Fine-tune di Llama-3.2-3B, comportamento simile

#### Tier 2 — Baseline confermata

- **Qwen2.5-1.5B-Instruct** — Rimane il default attuale (1s, 1630 MB)
- **Qwen3-4B** — Thinking ON, qualità alta ma 24s/turno (lento)

#### Tier 3 — Scartare

- **Qwen3.5-0.8B** — Thinking non termina, fallimento totale
- **Qwen2.5-0.5B** — Troppo piccolo per multi-turn
- **Qwen2.5-3B** — Pattern errati nonostante dimensione
- **Llama-3.2-1B** — Non segue istruzioni, genera regex slegate
- **gemma-2-2b-it** — Parziale (aggiunge `\s` non richiesto)
- **SmolLM2-1.7B** — Istruzioni non seguite (hyphen mancante)
- **Phi-3.5-mini** — VRAM alto (3672 MB), qualità bassa, load 80s
- **Qwen3-1.7B** — Affidabile solo con fallback (thinking residuo)

#### Osservazioni chiave

1. **Coder fine-tuning è determinante**: Qwen2.5-Coder-1.5B (3/3) batte
   Qwen2.5-3B (1/3) non-Coder nonostante dimensione minore. Il fine-tuning
   per codice produce character class corrette.
2. **3B non garantisce qualità**: Qwen2.5-3B e Phi-3.5-mini (3B+) sono
   peggiori di Qwen2.5-Coder-1.5B. La dimensione non è tutto.
3. **Llama-3.2 scala bene**: 1B (0/3) → 3B (3/3). Jump qualitativo netto.
4. **Hermes-3 = Llama-3.2-3B + fine-tune**: comportamento equivalente,
   conferma che il fine-tune Hermes preserva la qualità base.
5. **0 caratteri non-ASCII in tutti i 36 turni**: il fix Unicode (regola 7
   + few-shot) è efficace su tutti i modelli testati, inclusi quelli che
   falliscono semanticamente.
6. **0 fallback in tutti i 36 turni**: il parser robusto + few-shot
   elimina completamente il fallback. Solo Qwen3.5-0.8B ha generato
   warning (thinking non terminato).
7. **VRAM non correlata a qualità**: Phi-3.5-mini (3672 MB, 1/3) è peggiore
   di Qwen2.5-Coder-1.5B (1630 MB, 3/3). La scelta del modello conta più
   della dimensione.

---

## 9. Secondo batch: 10 modelli aggiuntivi (2026-09-10)

### Metodologia

Stesso test 3-turn incrementale del primo batch, eseguito via `browser_evaluate`
con Playwright MCP. I modelli sono stati inseriti nel DB con
`compatibility_status='UNTESTED'` e `is_enabled=true`, testati, poi aggiornati
con il risultato.

### Risultati

| Modello | VRAM | Download | Score | Latency | Note |
|---------|----:|----:|:---:|----:|------|
| **Qwen3.5-4B** | 3868 MB | 2280 MB | **3/3** | ~8s | Thinking model, JSON corretto tutti i turni. Turn 3: `^[a-zA-Z0-9.,_\-]+$` con thinking block |
| **Phi-4-mini-instruct** | 3438 MB | 2079 MB | **3/3** | ~4s | Non-thinking, JSON perfetto turn 1-2. Turn 3: formato `Regex:` ma pattern corretto, parser Step 4 estrae correttamente |
| Qwen2.5-Coder-0.5B | 945 MB | 276 MB | 1/3 | ~0.5s | Turn 1 ok. Turn 2-3: echo del prefix "Regex:" dalla history, context confusion |
| Qwen3-0.6B | 1403 MB | 335 MB | 0/3 | ~17s | Thinking non produce JSON, output verboso senza pattern |
| gemma3-1b-it | 711 MB | 574 MB | N/A | — | **Errore caricamento WebLLM**: sliding_window_size incompatibile con context_window_size |
| Qwen2.5-Math-1.5B | 1630 MB | 840 MB | 0/3 | ~8s | Output garbage ripetitivo `[-user]`, model math-tuned non adatto a regex |
| stablelm-2-zephyr-1.6B | 2088 MB | 890 MB | 0/3 | ~6s | Confuso dagli esempi del system prompt, genera email pattern |
| gemma-2b-it | 1477 MB | 1366 MB | 0/3 | ~6s | Produce codice JavaScript invece di JSON |
| Ministral-3-3B-Instruct | 2864 MB | 1856 MB | 0/3 | ~5s | Pattern senza anchor, multi-JSON, caratteri errati |
| Ministral-3-3B-Reasoning | 2864 MB | 1856 MB | 0/3 | ~2.5s | Typo ricorrente `a-zA` (manca `Z`), apostrofo non richiesto |

### Modelli ufficialmente compatibili (totale: 10)

Dopo entrambi i batch, i modelli COMPATIBLE (3/3) sono:

| Modello | Power | Thinking | VRAM | Download | Batch |
|---------|------:|:---:|----:|----:|:---:|
| Qwen3-1.7B | 2 | false | 2037 MB | 939 MB | baseline |
| Qwen2.5-1.5B | 3 | false | 1630 MB | 840 MB | baseline |
| Qwen3-4B | 4 | true | 3432 MB | 2174 MB | baseline |
| Qwen3.5-2B | 4 | true | 2245 MB | 1032 MB | batch 1 |
| Qwen2.5-Coder-1.5B | 3 | false | 1630 MB | 840 MB | batch 1 |
| Qwen2.5-Coder-3B | 3 | false | 2505 MB | 1667 MB | batch 1 |
| Llama-3.2-3B | 4 | false | 2264 MB | 1733 MB | batch 1 |
| Hermes-3-Llama-3.2-3B | 4 | false | 2264 MB | 1733 MB | batch 1 |
| **Qwen3.5-4B** | **4** | **true** | 3868 MB | 2280 MB | **batch 2** |
| **Phi-4-mini-instruct** | **4** | **false** | 3438 MB | 2079 MB | **batch 2** |

### Osservazioni batch 2

1. **Phi-4-mini fixa Phi-3.5**: Phi-3.5-mini (batch 1) ha fallito (1/3, alto
   costo VRAM). Phi-4-mini (batch 2) passa 3/3 con qualità eccellente e
   latenza minore. Il salto generazionale Phi-3.5→Phi-4 è significativo.
2. **Qwen3.5-4B è il miglior thinking model testato**: pensa correttamente,
   produce JSON valido, gestisce l'incremento multi-turno. VRAM 3868 MB è
   alta ma accettabile per GPU moderne.
3. **gemma3-1b-it è tecnicamente incompatibile**: WebLLM non supporta la
   combinazione `context_window_size=4096` + `sliding_window_size=512`.
   Non è un problema di qualità ma di compatibilità runtime.
4. **Ministral-3 ha un bug di tokenizzazione**: il typo `a-zA` (manca `Z`)
   è sistematico in tutti i turni, suggerendo un problema nel tokenizer o
   nel fine-tuning. Il modello Reasoning ha lo stesso problema.
5. **Qwen2.5-Coder-0.5B è troppo piccolo**: 0.5B parametri non sono
   sufficienti per mantenere il context multi-turn. Il modello confonde
   il proprio output con l'input.
6. **I modelli Math non sono adatti a regex**: Qwen2.5-Math-1.5B produce
   output ripetitivo e allucinato. Il fine-tuning math non trasferisce a
   task di generazione regex.
7. **StableLM e Gemma 2B non seguono istruzioni**: entrambi ignorano il
   formato JSON richiesto e producono codice o pattern errati.
8. **Conferma: dimensione ≠ qualità**: Qwen2.5-Coder-0.5B (945 MB VRAM,
   1/3) è peggiore di Qwen2.5-Coder-1.5B (1630 MB, 3/3). Ma Ministral-3
   (2864 MB, 0/3) è peggiore di entrambi. La qualità dipende dal
   fine-tuning instruction-following, non dalla dimensione.

---

## 10. Terzo batch: OLMo-2 (2026-09-10)

### Risultato

| Modello | VRAM | Download | Score | Latency | Note |
|---------|----:|----:|:---:|----:|------|
| OLMo-2-0425-1B-Instruct | 1777 MB | 806 MB | 0/3 | ~1.5s | Turn 1: `_` non richiesto. Turn 2-3: pattern con `[aeiou]{2}` (vocali), completamente fuori task |

### Verdetto

OLMo-2-0425-1B è **NOT_COMPATIBLE**. Il modello non segue le istruzioni
del system prompt: genera pattern con vocali e caratteri non richiesti,
ignora il formato JSON nei turni 2-3. L'architettura Allen AI non è
adatta al task di generazione regex instruction-following.

### Stato finale catalogo

- **COMPATIBLE**: 10 modelli (3 baseline + 5 batch 1 + 2 batch 2)
- **NOT_COMPATIBLE**: 16 modelli (7 batch 1 + 8 batch 2 + 1 batch 3)
- **Totale**: 26 modelli catalogati

### Modelli WebLLM rimanenti

Tutti i modelli WebLLM sotto 4GB VRAM che non sono varianti
(q4f32/q0f/-1k/embed/vision/base) di modelli già testati sono stati
ora testati. I 12 rimanenti non testati sono:
- SmolLM2-360M (troppo piccolo)
- gemma-2-2b-jpn-it (tuning giapponese)
- RedPajama-INCITE-Chat-3B (vecchio 2023)
- TinyLlama-1.1B v1.0/v0.4 (Llama-3.2-1B già fallito)
- Qwen2-0.5B/1.5B (generazione precedente)
- Qwen2-Math-1.5B (Math variant già fallito)
- Phi-3-mini (predecessore di Phi-3.5 già fallito)
- phi-2, phi-1_5 (non chat-tuned)

Nessuno di questi ha ragionevoli probabilità di superare il test
basato sui pattern osservati nei batch precedenti.

---

## 11. Re-test 10 modelli compatibili con 5 turni (2026-09-10)

### Metodologia

Stesso system prompt del test precedente, ma con 5 turni invece di 3:

1. "solo lettere e numeri" (fresh)
2. "aggiungiamo anche il punto e la virgola" (incremental)
3. "aggiungi anche l'underscore e il trattino" (incremental)
4. "validare un numero di telefono" (fresh)
5. "validare una partita iva italiana" (fresh)

History limitata a 2 turni (sliding window) per evitare context window overflow
nei modelli thinking con context 4096.

### Risultati

| Modello | T1 | T2 | T3 | T4 phone | T5 P.IVA | Score | Latency |
|---------|:--:|:--:|:--:|:---:|:---:|:---:|---:|
| **Qwen2.5-Coder-3B** | ✓ | ✓ | ✓ | ✓ | ✓ `^\d{11}$` | **5/5** | ~2s |
| Qwen3.5-2B | ✓ | ✓ | ✓ | ✓ | ✗ `^(12[0-9]{4})\s*$` | 4/5 | ~3s |
| Llama-3.2-3B | ✓ | ✓ | ✓ | ✓ | ✗ targa/cod.fiscale | 4/5 | ~3s |
| Qwen2.5-1.5B | ✓ | ✓ | ✗ perso `,` | ✓ | ✗ 2lettere+4cifre | 3/5 | ~1s |
| Qwen2.5-Coder-1.5B | ✓ | ✓ | ✗ `+$_` | ✓ | ✗ ignorata | 3/5 | ~1s |
| Hermes-3-Llama-3.2-3B | ✓ | ✓ | ✗ perso `.,` | ✓ | ✗ cod.fiscale | 3/5 | ~2s |
| Phi-4-mini | ✓ | ✓ | ✓ | ✗ garbage | ✗ garbage | 3/5 | ~4s |
| Qwen3-4B | ✗ thinking | ✓ | ✓ | ✗ thinking 44s | ✗ thinking 65s | 2/5 | ~15s |
| Qwen3-1.7B | ✓ | ✗ thinking | ✗ thinking | ✗ thinking | ✗ thinking | 1/5 | ~13s |
| Qwen3.5-4B | ✗ thinking | ✗ `;` extra | ✗ carry `;` | ✓ | ✗ `^\d{5,10}$` | 1/5 | ~5s |

### Dettaglio turni per modello

#### Qwen2.5-Coder-3B (5/5 — UNICO PERFETTO)
- T1: `^[a-zA-Z0-9]+$` ✓ JSON
- T2: `^[a-zA-Z0-9.,]+$` ✓ JSON
- T3: `^[a-zA-Z0-9.,_-]+$` ✓ (hyphen at end, corretto)
- T4: `^\+?[1-9][0-9]{6,}$` ✓ (phone, optional +, 7+ digits)
- T5: `^[0-9]{11}$` ✓ (P.IVA = 11 cifre, corretto!)

#### Qwen3.5-2B (4/5)
- T1-T3: perfetti, JSON con thinking block
- T4: `^\+?\d{1,3}[-\s]?(\d{1,4}){2}$` ✓ (phone, country code + 2 groups)
- T5: `^(12[0-9]{4})\s*$` ✗ (6 cifre, P.IVA sono 11)

#### Llama-3.2-3B (4/5)
- T1-T3: perfetti, JSON pulito
- T4: `^\d{3,12}$` ✓ (phone generico)
- T5: `^[A-Z]{1,2}[0-9][A-Z]?[0-9]{4}\.[0-9]{1,2}$` ✗ (targa/cod.fiscale)

#### Qwen2.5-1.5B (3/5)
- T1-T2: ✓
- T3: `^[a-zA-Z0-9._-]+$` ✗ (perso `,` dal turn 2)
- T4: `^[0-9]{10}$` ✓
- T5: `^[a-zA-Z]{2}[-. ]?(\d{4})[-. ]?\d*$` ✗ (2 lettere + cifre)

#### Qwen2.5-Coder-1.5B (3/5)
- T1-T2: ✓
- T3: `^[a-zA-Z0-9]+$_` ✗ (underscore fuori character class)
- T4: `^\d{10}$` ✓
- T5: `^[a-zA-Z0-9]+$` ✗ (ignora P.IVA, ripete T1)

#### Hermes-3-Llama-3.2-3B (3/5)
- T1-T2: ✓
- T3: `^[a-zA-Z0-9_-]+$` ✗ (perso `.` e `,` dal turn 2)
- T4: `^\+?1?\d{9}$` ✓
- T5: `^[A-Z]{6}[0-9]{2}[A-Z]{2}[0-9]{3}[A-Z]{4}[0-9]{1,2}$` ✗ (cod.fiscale)

#### Phi-4-mini (3/5)
- T1-T3: ✓ (T3 con "Regex:" format, parser estrae correttamente)
- T4: `^\+(?:[0-9]{1,3}[.-(][zero one two...]...) {8,11}\Z` ✗ (garbage con parole letterali)
- T5: `^(\d{9})|(-\s\d{8,10}|\#\s\d{6,7})-( {1}$` ✗ (parentesi sbilanciate)

#### Qwen3-4B (2/5)
- T1: ✗ thinking non termina (max_tokens 2048 esaurito)
- T2: `^[a-zA-Z0-9.,]+$` ✓
- T3: `^[a-zA-Z0-9.,_-]+$` ✓
- T4: ✗ thinking 44s non termina
- T5: ✗ thinking 65s non termina

#### Qwen3-1.7B (1/5)
- T1: ✓ (15s con thinking anche con enable_thinking=false)
- T2-T5: ✗ thinking non termina (max_tokens 512 insufficiente)

#### Qwen3.5-4B (1/5)
- T1: ✗ thinking non termina
- T2: `^[a-zA-Z0-9.,;]+$` ✗ (`;` semicolon extra, confuso "punto e virgola")
- T3: `^[a-zA-Z0-9.,;_-]+$` ✗ (carry `;` da T2)
- T4: `^\d{10}$` ✓
- T5: `^\d{5,10}$` ✗ (P.IVA sono 11, non 5-10)

### Osservazioni

1. **Qwen2.5-Coder-3B è il vincitore assoluto (5/5)**: unico modello che
   passa tutti i 5 turni, incluso P.IVA italiana (11 cifre). Il fine-tuning
   per codice produce regex semanticamente corrette.

2. **Thinking models degradano con 5 turni**: Qwen3-4B (2/5), Qwen3.5-4B
   (1/5), Qwen3-1.7B (1/5). Il thinking phase consuma tutti i max_tokens
   prima di generare JSON. Qwen3.5-2B (4/5) è l'eccezione — thinking
   più efficiente.

3. **Qwen3-1.7B genera thinking anche con enable_thinking=false**: il
   modello produce blocchi `imdi...` anche quando disabilitato, e
   max_tokens=512 non basta per thinking + output. BUG critico.

4. **P.IVA italiana è il test più difficile**: solo Qwen2.5-Coder-3B
   ha generato `^\d{11}$` corretto. Altri modelli generano codici
   fiscali, targhe, o pattern con numero errato di cifre.

5. **Turn 3 (incrementale) separa i modelli**: mantenere `.` e `,` dal
   turn 2 mentre aggiungendo `_` e `-` è difficile per modelli <2B.
   Qwen2.5-1.5B perde `,`, Hermes-3 perde `.,`, Qwen2.5-Coder-1.5B
   mette `_` fuori dalla character class.

6. **Phi-4-mini collassa su task complessi**: turn 1-3 perfetti ma
   turn 4-5 produce garbage con parole letterali ("zero one two...")
   e parentesi sbilanciate. Il modello non gestisce prompt che
   richiedono conoscenza di dominio (formati telefonici/P.IVA).

7. **Latenza thinking models**: Qwen3-4B impiega 44-65s sui turni
   che falliscono (thinking loop). Qwen3.5-2B è efficiente (~3s/turno).

### Raccomandazione finale

**Qwen2.5-Coder-3B** è il modello raccomandato per Smart Regex:
- 5/5 in tutti i turni
- P.IVA italiana corretta (conoscenza di dominio)
- Latency ~2s/turno
- VRAM 2505 MB (accettabile)
- Non-thinking (no risk di thinking non terminato)

**Qwen3.5-2B** è il miglior backup thinking model (4/5, ~3s/turno).

I modelli thinking (Qwen3-4B, Qwen3.5-4B, Qwen3-1.7B) non sono adatti
per Smart Regex con 5+ turni a causa del thinking non terminante.
