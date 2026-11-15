# Plan — Potenza macchina (misurata) + potenza modello (agnostica) in `/system/settings/ai`

## Obiettivo (scope finale concordato)

1. **Misurare la potenza della macchina** che ospiterà i modelli, in browser.
2. **Rivedere la potenza dei modelli** con grandezze agnostiche derivate da
   HuggingFace `config.json` (non da misure sulla macchina di dev).

Due scale, entrambe espresse in grandezze fisiche (bytes, ops/s, bytes/s),
comparabili per costruzione. Nessun gate di fit, nessun confronto automatico,
nessun tok/s esposto, nessuna tabella GPU da mantenere.

## Prova empirica già eseguita — cosa il browser espone davvero

Test headed su questa macchina (RTX 5080 Laptop 16GB, 32GB RAM, 24 core) —
Edge 153, Opera GX 135, Chromium bundled 149:

| Variabile | Risultato | Usabile? |
|---|---|---|
| `adapter.info.vendor` / `architecture` | `nvidia` / `blackwell` | sì — famiglia GPU |
| `adapter.info.device` / `description` | `""` — mascherato ovunque | no |
| `adapter.info.type` / `driver` / `memoryHeaps` | assenti | no |
| WebGL `UNMASKED_RENDERER` | `"ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 Laptop GPU, D3D11)"` — identico sui 3 browser | sì — **unica fonte del nome GPU** |
| `device.limits.maxBufferSize` | 256MB default, cap richiesta 2GB | no — minimum spec, NON VRAM |
| `device.limits.maxStorageBufferBindingSize` | 128MB default, cap 2GB | no — idem |
| `navigator.deviceMemory` | 32 GB | sì — **RAM OS, non VRAM** |
| `navigator.hardwareConcurrency` | 24 | sì — logical CPU cores |
| `navigator.storage.estimate()` | quota 16.5GB / usage 7GB | sì — budget cache |
| `adapter.features` | 18 (`shader-f16`, `subgroups`, `timestamp-query`…) | sì — capability |

Note: `navigator.gpu` richiede secure context (localhost/HTTPS ok). Headless
Chromium cade su SwiftShader — non rappresentativo. Opera GX = Chromium puro,
risultati identici al byte. iOS fuori scope (no HW di test).

## Potenza macchina — misurazioni empiriche (metodologia VALIDATA)

Prototipo `temp/gpu-bench.cjs` + `temp/gpu-vram-knee.cjs`, eseguiti headed su
Edge 153 / Opera GX 135 / Chromium 149. Iterati 7 versioni per eliminare tutti
gli artefatti di misura.

### Vincoli WebGPU scoperti (empirici)

| Vincolo | Valore | Conseguenza |
|---|---|---|
| `maxStorageBufferBindingSize` | 128MB per binding | working buffer ≤128MB per binding |
| `maxComputeWorkgroupsPerDimension` | 65,535 | grid-stride loop obbligatorio |
| `timestamp-query` | feature presente ma **azzerata** (privacy) | timing solo wall-clock |
| `mapAsync` su buffer indipendente | NON è una fence di coda | fence = `copyBufferToBuffer(output) + mapAsync` |
| `onSubmittedWorkDone` | risolve prima del completamento | inutilizzabile come fence |
| Validation errors | dispatch diventa no-op **silenzioso** | `uncapturederror` obbligatorio come guardia |
| Compilazione pipeline | lazy al primo uso | warm-up submit prima di misurare |
| First-touch buffer | ~150ms vs ~0.7ms dopo | primo rep sempre scartato (page-in) |
| Drift sotto carico | tempi crescono dentro la run (clock decay) | riportare primi rep / min+mediana |

### Le tre misure

| Misura | Metodo validato | Risultato questa macchina |
|---|---|---|
| **Bandwidth GB/s** | buffer 128MB `read_write` in-place (`a[i]+=1`), N pass serializzati ping-pong/self-dep, fence readback, mediana reps | ~300–430 GB/s stabile |
| **GFLOPS fp32** | FMA chain data-dependent ×8 accumulators (anti constant-folding), wgx=4096, calibrazione adattiva a ~50ms | ~13–15.7 TFLOPS |
| **VRAM dedicata** | **knee detection**: chunk 128MB, footprint crescente, bandwidth per taglia → crollo = fine dedicata | **~14.3 GB** |
| **Budget totale** | alloc incrementale fino a `device_lost`/OOM | **~32.7 GB** (dedicata + shared) |

### Curva VRAM misurata (questa macchina, Edge headed)

| Footprint | GB/s | Regione |
|---|---|---|
| ≤14 GB | 570–620 | dedicata |
| 15 GB | 165 | ginocchio |
| 16–24 GB | 33–110 | shared |
| 32.7 GB+ | — | `MakeResident failed` = OOM reale |

Interpretazione: dedicata = fino al ginocchio; oltre = shared system memory
(~10-20× più lenta). Su iGPU pura la curva sarebbe piatta = tutta shared.

### VRAM probe — metodologia leggera (v3, validata + caso iGPU)

Due fasi, perché i casi hardware divergono:

**Fase 1 — Knee probe (bandwidth ladder + early-stop)**

- Ladder ascendente a step 1GB da 2GB, chunk 128MB riusati
- **Early-stop**: 2 punti consecutivi sotto il 50% del plateau → ginocchio
  trovato, stop immediato (~4s, max ~knee+2GB allocati)
- Caso dGPU: VRAM dedicata = ginocchio. Fine.

**Fase 2 — Alloc-only sweep (solo se nessun ginocchio)**

- Caso iGPU/shared-only: la curva resta piatta → nessun knee compare
- Passa a `createBuffer` incrementale **senza pass di calcolo** (commit
  virtuale, molto più leggero) fino a `out-of-memory`/`device_lost`
- Il massimo raggiunto = budget shared totale
- Safety cap: `min(deviceMemory × 0.75 + plateauGB, hardcap)` per driver
  che non vanno mai in OOM
- `device_lost` è gestito come segnale normale di fine probe (device
  temporaneo dedicato, `destroy()` dopo; nessun impatto su altri device)

Output: `{ vram_dedicated_mb | null, gpu_budget_mb, mode: 'dedicated'|'shared' }`

### Esecuzione

- **Bench leggero** (bandwidth 128MB + GFLOPS ~50ms) automatico al primo
  load `/ai`, risultato cached, re-bench manuale.
- **VRAM probe** (ladder + early-stop): on-demand dal bottone, ~4s, max
  ~knee+2GB allocati temporaneamente.
- Fallback senza WebGPU: RAM + cores + nome GPU se disponibile.

### Rank macchina 1–5

Derivato da (VRAM dedicata, bandwidth, GFLOPS) con soglie tarate sulle
grandezze del catalogo (power_level 2–5, vram 1.6–8.6GB) — NON sulle misure
di questa macchina. Soglie conservative per il target business.

## Potenza modello — grandezze agnostiche da HuggingFace

Verificato su `onnx-community/Qwen2.5-Coder-3B-Instruct/config.json`:

```json
num_hidden_layers: 36, num_key_value_heads: 2, num_attention_heads: 16,
hidden_size: 2048, max_position_embeddings: 32768,
transformers.js_config.kv_cache_dtype: "float16"
```

Derivabili con formule standard, valide su qualsiasi macchina:

| Grandezza | Formula | Qwen2.5-3B q4f16 |
|---|---|---|
| Peso | `vram_mb` / `download_size_mb` (già in DB) | ~2.2 GB |
| KV cache per token | `2 × layers × kv_heads × (hidden/heads) × dtype_bytes` | ~36 KB/token |
| Working set @ ctx | peso + KV/token × ctx_len | ~2.5 GB @ 8K |
| Costo compute per token | `≈ 2 × params` FLOP | ~6.2 GFLOP |
| Bytes da leggere per token (decode) | ≈ bytes dei pesi | ~2.2 GB |

**`power_level` aggiornato** sulla base di working set + costo per token —
la potenza del modello è "quanto spazio e quanto movimento gli serve", non la
qualità (quella resta nel `rank` dei test, invariato).

### Persistenza: DB, non runtime

I campi derivati vanno persistiti in `ai_models` via patch SQL — offline,
versionati, un solo punto di verità (niente fetch runtime di config.json dal
client). Colonne proposte:

- `kv_cache_bytes_per_token` (int)
- `flops_per_token` (numeric) — o params miliardi se preferiamo il dato grezzo
- `working_set_mb` a ctx di riferimento (documentata quale)

I valori si calcolano una tantum leggendo i `config.json` dei modelli censiti
(script one-shot in `temp/` + patch `fire-and-forget` con i risultati).

## Analisi `ai_model.is_enabled` — implicazioni della rimozione

### Usi reali (verificati)

| Dove | Uso |
|---|---|
| BE `ai_model_entity`, DAL, DTO (`default(true)`), list-config badge | solo persistenza + badge — **nessun filtro WHERE** |
| FE `getEnabledModels()` | selettore chat, ModelCachePanel/Section, /ai (modelRanks, cerebellum create, star CTA, badge "disabled", opacity) |
| DB | 111 righe `enabled=false` alive · 12 `enabled=true` alive · 46 `false`+deleted |

### Rimozione → soft delete come "disable"

- Le 111 righe disabled → **soft-deleted** (ripristinabili, ancora nel catalog
  per name resolution/orphan check). Decisione dati da confermare.
- `/ai` perde badge/opacity/gate `is_enabled` → assorbiti dallo stato deleted
  (restore CTA già esistente).
- `getEnabledModels()` → non-deleted; i call-site cache passano allo snapshot
  COMPATIBLE (sezione sotto).
- Patch: drop colonna + entity/DTO/DAL/list-config + chiavi
  `fields.is_enabled`/`enabled.*` hard-deleted.

## Refactor: snapshot "modelli compatibili" per la cache

### Requisito (utente)

- `DeletionFilterToggle` in `/ai` filtra **solo** la lista modelli — non la
  `ModelCacheSection`.
- La cache si confronta con uno **snapshot dei modelli COMPATIBLE**,
  indipendente da `is_enabled` e dai filtri UI.
- Lo snapshot si aggiorna su **modifiche dati** (create/update/delete/
  restore), mai per via dei filtri.

### Bug trovati in codice (verificati)

1. `reload()` ri-fetcha solo `_state.models` — `_catalog` resta stale dopo
   delete/restore.
2. `ModelCacheSection.onMount` passa `getEnabledModels()` a
   `refreshCacheStatus` → toggle deleted + `is_enabled` spostano modelli tra
   "censiti"/"non censiti".
3. `model_ranks` derivato da `getEnabledModels()` → stessa contaminazione.

### Cambiamenti

1. `useAiModels`: `reload()` invalida anche `_catalog`; nuovo
   `getCompatibleModels()` = `_catalog.models.filter(compatibility_status === 'COMPATIBLE')`.
2. `ModelCacheSection.onMount`: `refreshCacheStatus(compatibleIds, allIds)`
   dallo snapshot.
3. `+page.svelte`: `model_ranks` dallo snapshot, non da `getEnabledModels()`.
4. Test: toggle deleted → lista cambia, cache immutata; soft-delete modello →
   resta "censito".

## File impattati

- `src/lib/ai/machine-capabilities.svelte.ts` (nuovo — misure + rank)
- `src/lib/components/ui/smart-ai/machine-capabilities-card.svelte` (nuovo)
- `src/routes/(app)/system/settings/ai/+page.svelte`
- `src/lib/composables/useAiModels.svelte.ts` (snapshot + is_enabled)
- `src/lib/components/ui/smart-regex-input/ModelCacheSection.svelte`,
  `ModelCachePanel.svelte`
- BE: `ai_models` entity/DAL/DTO/list-config (drop `is_enabled`, add campi
  derivati)
- Patch SQL: colonne derivate + drop `is_enabled` + soft-delete 111 righe +
  chiavi i18n `system.settings.ai.machine.*` ×7 + invalidazione Redis

## Acceptance criteria

- Card macchina in /ai con le tre misure reali + rank 1–5 + re-bench.
- `power_level` modelli ricalcolato da dati agnostici persistiti in DB.
- Cache sezione indipendente dal filtro deleted; snapshot aggiornato sui
  write path.
- Degrado pulito senza WebGPU.
- `pnpm check` 0 errori.

## Decisioni chiuse

- ❌ Niente tabella GPU→specs (nessuna manutenzione).
- ❌ Niente `test_scores`/tok/s come riferimento (misure locali, troppe
  variabili, non agnostiche).
- ❌ Niente fit gate / confronto automatico — scope ridotto a misura +
  potenza.
- ✅ Bench al primo load + cache + re-bench manuale.
- ✅ Campi derivati persistiti in DB.

## Domanda aperta residua

- Soft-delete delle 111 righe `is_enabled=false` — conferma finale prima
  della patch.

---

## Implementation status (final)

### Done

- **Catalog snapshot**: `_catalog` (deleted_records=INCLUDED) is separate from the
  visible list; `reload()` refreshes both; `getCompatibleModels()` /
  `getAliveCompatibleModels()` / `getAllModels()` read the snapshot. The
  deletion-filter toggle only re-slices `state.models` — cache attribution and
  ranks are untouched.
- **`is_enabled` removed** end-to-end: FE type/composable/UI, BE entity/DAL/DTO/
  list-config. Patch `drop_ai_models_is_enabled_add_agnostic_metrics.sql`
  applied: 111 `is_enabled=false` rows soft-deleted (recoverable, still
  cataloged), column dropped, dead translation keys removed, Redis invalidated.
- **Agnostic model metrics** persisted: `kv_cache_bytes_per_token`,
  `flops_per_token`, `working_set_mb` (ctx ref 8192) derived from HF
  `config.json` for ~140 rows; `power_level` recalculated deterministically on
  working-set buckets (<2.2→2, <4→3, <7→4, ≥7GB→5). Fixes: Phi-3.5 3→4,
  Phi-4-mini-web 3→4, Llama-3.2-fp16 4→5.
- **useMachineCapabilities composable** (`src/lib/composables/
  useMachineCapabilities.svelte.ts`): validated methodology — readback fence,
  grid-stride ≤128MB bindings, uncapturederror guard, warmup+median, adaptive
  FMA depth. `measure()` light (auto on mount), `probeVram()` on-demand ladder
  with knee early-stop → alloc-only sweep for shared-only systems.
- **Machine section** in /ai (`machine-capabilities-section.svelte`): GPU name,
  bandwidth, GFLOPS, dedicated/shared VRAM, machine rank 1-5 (highest model
  power_level whose working-set requirement fits measured memory −1.5GB
  headroom). i18n patch applied (7 languages).
- **Cache sheet**: `shell.aiModelCache` registered — details CTA in the cache
  popover opens the lateral sheet reusing `ModelCacheSection`.
- **Verified E2E** (Playwright, Edge headed, dev server): 9 cataloged rows,
  GPU name detected, 377 GB/s, 11 TFLOPS, VRAM knee 14.0 GB, zero leaked keys,
  FE check clean, BE tsc clean.

### Known notes

- BE `listAiModels` pre-filters `compatibility_status=COMPATIBLE` by default —
  the 3 alive NOT_COMPATIBLE Phi-4-mini rows don't appear in the list (by
  design); they remain in the catalog snapshot for cache attribution.
- MLC-legacy model ids have no HF config → metrics NULL (skipped, not faked).
