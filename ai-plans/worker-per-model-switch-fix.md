# Plan: Worker-per-model switch (no page reload)

## Objective
Replace `switchModel()` page-reload approach with worker-per-model: terminate old worker + create new worker + load new model. This frees VRAM deterministically (GPUDevice dies with the worker) without losing page state.

## Root cause
`switchModel()` at `use-regex-ai.svelte.ts:549-567` calls `window.location.reload()`. This works but:
- Loses all page state (HMR, navigation, user context)
- Requires sessionStorage roundtrip
- Slow UX

The underlying reason for reload: ORT maintains a single WebGPU backend per worker. `dispose()` releases sessions + tensors but the `GPUDevice` stays alive. Next model load hits VRAM fragmentation. Worker termination kills the GPUDevice deterministically.

## Fix — worker-per-model in `switchModel()`

### File: `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`

Replace `switchModel()` (lines 549-567) with:

```ts
async function switchModel(new_model_id: string): Promise<void> {
  if (new_model_id === _state.model_id && _state.is_ready) return;
  if (!new_model_id) return;

  // 1. Destroy current worker (dispose + terminate) — frees GPUDevice
  await destroyWorker();

  // 2. Reset state for new model
  _state.model_id = new_model_id;
  _state.is_ready = false;
  _state.is_loading_model = false;
  _state.load_progress = 0;
  _state.load_phase = 'idle';
  _state.file_progress = {};
  _state.total_files = 0;
  _state.completed_files = 0;
  _state.current_file = null;
  _state.loaded_info = null;
  _state.worker_nonce = null;
  _state.messages = [];
  _state.pending_choices = null;
  _state.streaming_text = '';
  _state.error = null;
  _state.measurements = null;

  // 3. Create fresh worker + init (loads new model)
  await init();
}
```

### Why this works
- `destroyWorker()` posts `dispose` (releases ONNX sessions + tensors), waits up to 3s, then `worker.terminate()` kills the worker context. The GPUDevice dies with the worker.
- `init()` creates a new worker (`createWorker()`), which gets a fresh GPUDevice from `navigator.gpu`.
- No page reload — preserves HMR state, user context, navigation.

### Edge cases
- If `init()` fails (load error), the worker is already created but model not loaded. User can retry via UI.
- If `destroyWorker()` times out (3s), `terminate()` is still called — hard kill.
- The `sessionStorage` roundtrip is removed — no longer needed.

## VRAM debug measurements

### Constraints
WebGPU does NOT expose direct VRAM usage via standard APIs. We use a **combined proxy**:
1. **JS heap** via `performance.measureUserAgentSpecificMemory()` (Chrome/Edge 89+) — includes ONNX tensors mapped to JS
2. **Model file sizes** from Cache API — proxy for VRAM footprint (q4f16 weights ≈ VRAM)
3. **GPUDevice.lost** detection — confirms device died after worker terminate
4. **Timestamps** for load/dispose cycles

### Helper: `measureVram()` in composable

```ts
async function measureVram(label: string): Promise<{
  label: string;
  timestamp: number;
  js_heap_mb: number | null;
  cache_bytes: number | null;
  gpu_adapter: string | null;
}> {
  const timestamp = Date.now();

  // 1. JS heap (Chrome/Edge only)
  let js_heap_mb: number | null = null;
  try {
    if (typeof performance !== 'undefined' && 'measureUserAgentSpecificMemory' in performance) {
      const result = await (performance as any).measureUserAgentSpecificMemory();
      js_heap_mb = result.bytes / (1024 * 1024);
    } else if ((performance as any).memory) {
      js_heap_mb = (performance as any).memory.usedJSHeapSize / (1024 * 1024);
    }
  } catch { /* noop */ }

  // 2. Cache API bytes (model files = proxy for VRAM)
  let cache_bytes: number | null = null;
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      let total = 0;
      for (const name of names) {
        if (!name.includes('transformers') && !name.includes('onnx') && !name.includes('hf')) continue;
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const key of keys) {
          const resp = await cache.match(key);
          if (resp) {
            const blob = await resp.blob();
            total += blob.size;
          }
        }
      }
      cache_bytes = total;
    }
  } catch { /* noop */ }

  // 3. GPU adapter info
  let gpu_adapter: string | null = null;
  try {
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        const info = await adapter.requestAdapterInfo();
        gpu_adapter = `${info.vendor} ${info.architecture}`.trim();
      }
    }
  } catch { /* noop */ }

  const measurement = { label, timestamp, js_heap_mb, cache_bytes, gpu_adapter };
  console.log('[VRAM]', label, measurement);
  return measurement;
}
```

### Debug logging in `switchModel()`

```ts
async function switchModel(new_model_id: string): Promise<void> {
  if (new_model_id === _state.model_id && _state.is_ready) return;
  if (!new_model_id) return;

  // ── VRAM debug: baseline before switch ──
  const vram_before = await measureVram('before_switch');
  const old_model = _state.model_id;

  // 1. Destroy current worker (dispose + terminate) — frees GPUDevice
  await destroyWorker();

  // ── VRAM debug: after destroy, before new load ──
  const vram_after_destroy = await measureVram('after_destroy');

  // 2. Reset state for new model
  _state.model_id = new_model_id;
  _state.is_ready = false;
  // ... (reset all state fields)

  // 3. Create fresh worker + init (loads new model)
  await init();

  // ── VRAM debug: after new model loaded ──
  const vram_after_load = await measureVram('after_new_load');

  // ── Report deltas ──
  const heap_delta_destroy = vram_before.js_heap_mb != null && vram_after_destroy.js_heap_mb != null
    ? vram_before.js_heap_mb - vram_after_destroy.js_heap_mb : null;
  const heap_delta_load = vram_after_destroy.js_heap_mb != null && vram_after_load.js_heap_mb != null
    ? vram_after_load.js_heap_mb - vram_after_destroy.js_heap_mb : null;
  const heap_net = vram_before.js_heap_mb != null && vram_after_load.js_heap_mb != null
    ? vram_after_load.js_heap_mb - vram_before.js_heap_mb : null;

  console.log('[VRAM] ── SWITCH REPORT ──');
  console.log('[VRAM] old model:', old_model, '→ new model:', new_model_id);
  console.log('[VRAM] JS heap before switch:', vram_before.js_heap_mb?.toFixed(2), 'MB');
  console.log('[VRAM] JS heap after destroy:', vram_after_destroy.js_heap_mb?.toFixed(2), 'MB');
  console.log('[VRAM] JS heap after new load:', vram_after_load.js_heap_mb?.toFixed(2), 'MB');
  console.log('[VRAM] Heap freed by destroy:', heap_delta_destroy?.toFixed(2), 'MB');
  console.log('[VRAM] Heap used by new model:', heap_delta_load?.toFixed(2), 'MB');
  console.log('[VRAM] Net heap delta:', heap_net?.toFixed(2), 'MB');
  console.log('[VRAM] Cache bytes before:', vram_before.cache_bytes);
  console.log('[VRAM] Cache bytes after:', vram_after_load.cache_bytes);
  console.log('[VRAM] GPU adapter:', vram_before.gpu_adapter);

  // Warn if destroy didn't free memory
  if (heap_delta_destroy != null && heap_delta_destroy < 10) {
    console.warn('[VRAM] ⚠️ Destroy freed < 10MB — possible VRAM leak!');
  }
  if (heap_net != null && heap_net > 50) {
    console.warn('[VRAM] ⚠️ Net heap grew > 50MB after switch — old model may not be fully released!');
  }
}
```

### What the debug output looks like

```
[VRAM] ── SWITCH REPORT ──
[VRAM] old model: onnx-community/Qwen3-0.6B-ONNX#q4f16 → new model: onnx-community/gemma-3-1b-it-ONNX#q4f16
[VRAM] JS heap before switch: 450.23 MB
[VRAM] JS heap after destroy: 120.45 MB
[VRAM] JS heap after new load: 380.67 MB
[VRAM] Heap freed by destroy: 329.78 MB
[VRAM] Heap used by new model: 260.22 MB
[VRAM] Net heap delta: -69.56 MB
[VRAM] Cache bytes before: 1234567890
[VRAM] Cache bytes after: 1456789012
[VRAM] GPU adapter: nvidia RTX 4060
```

### Interpretation
- **Heap freed by destroy** > 0 = worker termination released memory ✅
- **Heap freed by destroy** < 10MB = ⚠️ possible leak (GPUDevice not dead)
- **Net heap delta** near 0 = perfect cleanup, new model replaced old ✅
- **Net heap delta** > 50MB = ⚠️ old model not fully released

### Limitations (honest)
- `performance.measureUserAgentSpecificMemory()` measures JS heap, NOT GPU VRAM directly
- ONNX WebGPU buffers may not be fully tracked by JS heap
- The Cache API bytes measure disk cache, not VRAM — but they tell us which models are resident
- For TRUE GPU VRAM, the only option is `edge://gpu/` (manual, not scriptable)
- The JS heap delta is a **proxy** — if it drops significantly after destroy, that's strong evidence the model was released

## Verification
1. `pnpm run check` passes (svelte-check)
2. Manual E2E test via Playwright:
   - Open AI panel with model A
   - Switch to model B via selector
   - Verify no page reload
   - Verify VRAM debug logs show heap drop after destroy
   - Verify model B loads + generates
   - Switch back to model A
   - Verify no crash
   - Verify VRAM debug logs show consistent pattern
3. Cross-check with `edge://gpu/` tab (manual visual)

## Files impacted
- `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`:
  - `switchModel()` rewrite (worker-per-model, no reload)
  - Add `measureVram()` helper
  - Add debug logging in `switchModel()`

## No other files changed
- Worker (`regex-ai-worker.ts`) — already handles dispose correctly
- `api-types.ts` — no changes
- BE — no changes
