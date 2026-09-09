# SmartRegexInput — AI-Powered Regex Component with WebLLM

## Summary

Build `SmartRegexInput` — the first "Smart" (AI-powered) FE component. It replaces the plain `TextInput` for the regex pattern field in `ValidationRulesSection.svelte`. Two inner CTAs sit on the right inside the input:

1. **Flags CTA** — opens a right-panel sheet (reusing `sheet-manager`) to toggle regex flags `g`, `i`, `m`. Flags are stored as a separate `flags` field in `type_config.validation.rules.regex`.
2. **Brain CTA** — opens a right-panel chat sheet (reusing `sheet-manager`) where the user describes the validation they want in natural language. A browser-only LLM (Qwen2.5-0.5B-Instruct via WebLLM, WebGPU) converts the description to a regex. If one regex is produced, the assistant asks "Use this?"; if 2–3 valid regexes are produced, a choicebox (A/B/C) is shown. The user can also ask the assistant to test the regex against sample values or generate up to 5 positive + 5 negative examples.

A Service Worker pre-downloads the model (~278MB q4f16) in the background on app load using the Cache API. The model is NOT loaded into memory until the user clicks the brain CTA, at which point a progress bar shows "Loading model X%" in the panel. On subsequent uses, the model is already cached and a "Qwen2.5-0.5B is ready!" message appears.

Non-WebGPU browsers show "AI regex assistant requires WebGPU (Chrome 113+/Edge 113+). Please type the regex manually." The flags CTA works without AI.

---

## Decisions (locked from clarifying questions)

| Decision | Choice | Rationale |
|---|---|---|
| Component prefix | `Smart` | User-selected. Establishes convention: all AI-powered components use `Smart` prefix. |
| Component name | `SmartRegexInput` | PascalCase, matches `TextInput`/`UrlInput`/`PhoneInput` convention. File: `smart-regex-input.svelte` |
| NLP engine | WebLLM (`@mlc-ai/web-llm` v0.2.85) | WebGPU-only, fastest (40-70 tok/s), smallest npm footprint (~14MB, 1 dep). No WASM fallback — non-WebGPU shows graceful message. |
| Model | `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | ~278MB download, ~300MB VRAM, 4096 context. Best size/quality balance at sub-1B scale. |
| Flags | `g`, `i`, `m` only | `g`+`i` for single-line input (TYPE string), `m` for textarea (TYPE text). Excludes `s`, `u`, `y`. |
| Flags storage | Separate `flags` field in regex rule | `new RegExp(pattern)` does NOT parse flags from pattern string (verified empirically). Must pass as 2nd arg: `new RegExp(pattern, flags)`. |
| AI panel | Reuse `sheet-manager` | DRY. New panel ID `config.regexAiChat`. Props carry callbacks. |
| Background download | Service Worker + Cache API | Pre-download on app load, lazy-load to memory on brain CTA click. No existing SW/WW in codebase — this introduces both. |
| Regex validation semantics | Invalid pattern → `invalidRegexPattern`; mismatch → `regexMismatch` or custom key | Established in prior session. Invalid pattern errors always use `invalidRegexPattern`, even if custom regex error key exists. |

---

## NLP Engine: Deep Analysis

### Why WebLLM over transformers.js

| Dimension | WebLLM (@mlc-ai/web-llm) | transformers.js (@huggingface/transformers) |
|---|---|---|
| npm size | ~14MB unpacked, 45 files, 1 dep (`loglevel`) | ~9.5MB unpacked, 1339 files, 5 deps (onnxruntime-web 142MB, onnxruntime-node, sharp, jinja, tokenizers) |
| Engine | MLC compiler → WebGPU compute shaders. Purpose-built for LLM inference. | ONNX Runtime Web. General-purpose ML runtime. |
| Speed | 40-70 tok/s on WebGPU (M3 Max: Phi 3.5 ~71 tok/s) | 20-60 tok/s on WebGPU |
| WASM fallback | ❌ None — WebGPU required | ✅ Automatic WASM fallback (5-15 tok/s) |
| Memory | GPU VRAM only (~300MB for Qwen2.5-0.5B q4f16) | WebGPU: VRAM. WASM: PC RAM (~600-800MB) |
| Model catalog | 32 curated MLC-compiled models (SmolLM2 135M → Qwen 3.5 9B) | 16+ ONNX models, broader task coverage (vision, audio, embeddings) |
| Streaming | ✅ Built-in `TextStreamer` | ✅ |
| OpenAI API compat | ✅ | ❌ |

**Decision rationale**: WebLLM is purpose-built for LLM chat in the browser. It's faster, smaller (npm), and uses GPU VRAM (not PC RAM) — directly addressing the user's concern about PC throttling. The WebGPU-only limitation is acceptable because:
1. Chrome 113+/Edge 113+ have WebGPU enabled by default (covers ~70%+ of users as of 2026).
2. Non-WebGPU users still get the flags CTA and manual regex entry.
3. Adding transformers.js as a fallback would double the bundle size and complexity for a minority use case.

### Model: Qwen2.5-0.5B-Instruct-q4f16_1-MLC

| Metric | Value |
|---|---|
| Download size | ~278MB (q4f16 quantization) |
| VRAM usage | ~300MB (without KV cache), ~800MB (with 4K KV cache) |
| Context window | 4096 tokens |
| Speed | ~85 tok/s (M3 Max benchmark), ~40-60 tok/s (typical WebGPU) |
| First load | ~2s (after download) |
| Quality | "Best balance of size and quality at sub-1B scale" (LocalMode docs) |

### Resource impact

- **Download**: 278MB one-time, cached in browser Cache API (Service Worker). Subsequent loads are instant from cache.
- **Memory**: ~300MB VRAM when active. Released when the panel closes (engine unloaded).
- **CPU**: Minimal — inference runs on GPU via WebGPU compute shaders.
- **Bundle**: +14MB npm package (`@mlc-ai/web-llm`), loaded lazily via dynamic import only when brain CTA is clicked. Not in the main bundle.

---

## Implementation Steps

### Phase 1: Schema & SDK changes (regex flags field)

#### 1.1 SDK — Add `flags` to regex rule type

**File**: `primebrick-v3-sdk/src/config/iconfig-entity.ts`
- Add `flags?: string` to the `regex` rule in `ConfigValidation.rules`.

**File**: `primebrick-v3-sdk/src/config/config-validator.ts`
- Line 208: Change `new RegExp(rules.regex.pattern)` → `new RegExp(rules.regex.pattern, rules.regex.flags ?? '')`.
- Line 212: Invalid pattern error MUST use `app.common.validation.invalidRegexPattern` (not custom key). Fix: remove `rules.regex.error_label_key ??` from the invalid-pattern branch.
- Line 218: Mismatch error MUST use `rules.regex.error_label_key ?? 'app.common.validation.regexMismatch'` (add fallback).

**File**: `primebrick-v3-sdk/src/config/__tests__/config-validator.test.ts`
- Update test at line 412-415: invalid pattern `[invalid` with custom `error_label_key: "err.regex"` should throw `invalidRegexPattern`, NOT `err.regex`.
- Add test: regex with flags `{ pattern: "^[a-z]+$", flags: "i" }` validates `"ABC"` as valid.
- Add test: regex with flags `{ pattern: "^[a-z]+$", flags: "g" }` — `g` flag with `test()` has lastIndex statefulness; document expected behavior.
- Add test: mismatch without custom error key uses `regexMismatch` fallback.

#### 1.2 FE — Mirror schema changes

**File**: `primebrick-fe-v3/src/lib/config/type-config-schema.ts`
- Line 27: Add `flags?: string` to the `regex` rule interface.

**File**: `primebrick-fe-v3/src/lib/config/type-config-builder.svelte.ts`
- `setRegex(pattern, flags?, errorLabelKey?)` — add `flags` parameter. Store in `v.rules.regex.flags`.

**File**: `primebrick-fe-v3/src/lib/validation/config-validation.ts`
- Line 215: Change `new RegExp(pattern)` → `new RegExp(pattern, rules.regex.flags ?? '')`.
- Line 219: Invalid pattern uses `app.common.validation.invalidRegexPattern` (already correct).
- Line 225: Mismatch uses `regexKey ?? 'app.common.validation.regexMismatch'` (add fallback).

**File**: `primebrick-fe-v3/src/lib/__tests__/type-config-builder.test.ts`
- Add test: `setRegex('^[a-z]+$', 'i')` stores `flags: 'i'`.
- Add test: `setRegex('^[a-z]+$', '')` does NOT store `flags` field (empty = omitted).

**File**: `primebrick-fe-v3/src/lib/__tests__/config-validation.test.ts`
- Add test: regex with `flags: 'i'` validates case-insensitively.
- Add test: mismatch without custom key uses `regexMismatch`.

### Phase 2: SmartRegexInput component

#### 2.1 Component structure

**New directory**: `primebrick-fe-v3/src/lib/components/ui/smart-regex-input/`

**Files**:
- `smart-regex-input.svelte` — main component (input + 2 CTAs)
- `regex-flags-panel.svelte` — flags selector right-panel (registered in sheet-manager as `config.regexFlags`)
- `regex-ai-chat-panel.svelte` — AI chat right-panel (registered in sheet-manager as `config.regexAiChat`)
- `use-regex-ai.svelte.ts` — composable managing WebLLM engine lifecycle, chat state, model loading progress
- `index.ts` — exports

#### 2.2 SmartRegexInput.svelte

Props (snake_case per data-model-conventions rule):
```ts
interface SmartRegexInputProps {
  value?: string;           // bindable — the regex pattern
  flags?: string;          // bindable — the regex flags (e.g. 'gi')
  on_change?: (value: string, flags: string) => void;
  oninput?: (e: Event) => void;
  placeholder?: string;
  disabled?: boolean;
  readonly?: boolean;
  id?: string;
  class?: string;
  'data-testid'?: string;
  /** Config type context — 'string' shows g+i, 'text' shows g+i+m */
  config_type?: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
}
```

Layout: `InputGroup` with:
- Main `InputGroupInput` (text, `bind:value`, `oninput` handler)
- Flags CTA `InputGroupButton` (shows active flags as badges, chevron-down icon, opens `config.regexFlags` sheet)
- Brain CTA `InputGroupButton` (Brain icon from `@lucide/svelte/icons/brain`, opens `config.regexAiChat` sheet)

Validation: on `oninput`, try `new RegExp(value, flags ?? '')`. On catch, show `regexPatternError` below input (red text, `data-testid="smart-regex-input-error"`).

#### 2.3 RegexFlagsPanel.svelte

Registered in `sheet-manager.svelte.ts` as `config.regexFlags`.

Props:
```ts
interface RegexFlagsPanelProps {
  current_flags: string;
  config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
  on_flags_change: (flags: string) => void;
}
```

UI: list of toggle switches for each flag:
- `g` — Global (always shown)
- `i` — Ignore case (always shown)
- `m` — Multiline (shown only when `config_type === 'text'`)

Uses existing `Switch` component. On toggle, calls `on_flags_change` with the new flags string (sorted: `g` first, then `i`, then `m`).

#### 2.4 RegexAiChatPanel.svelte

Registered in `sheet-manager.svelte.ts` as `config.regexAiChat`.

Props:
```ts
interface RegexAiChatPanelProps {
  on_apply_regex: (pattern: string, flags: string) => void;
  config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
}
```

UI structure (modeled on existing `AiChatPanel.svelte`):
- `SheetHeader` with title "AI Regex Assistant" + close button
- Message thread (scrollable, `ScrollArea`)
- Loading state: "Loading model X%" progress bar (when model is downloading/loading to memory)
- Ready state: "Qwen2.5-0.5B is ready!" message, then input box appears
- Input box (`Textarea`, Enter to send, Shift+Enter for newline)
- Streaming responses via WebLLM `TextStreamer`

Chat flow:
1. User types description (e.g. "only lowercase letters, 3 to 5 characters")
2. LLM generates response. System prompt instructs it to:
   - Return 1-3 valid regex patterns, each on a separate line, wrapped in backticks
   - Explain each pattern briefly
3. Parser extracts regex patterns from the response:
   - If 1 pattern: show "Per verificare che il valore inserito sia ..., la regex è `{regex}`. Vuoi utilizzare questa soluzione?" with Yes/No buttons
   - If 2-3 patterns: show choicebox (A/B/C) using existing `Choicebox` component, each option shows the regex + description
4. User confirms → `on_apply_regex(pattern, flags)` called → panel closes
5. User can also type "test {regex} with: val1, val2, val3" → assistant tests each value and reports pass/fail
6. User can type "generate examples for {regex}" → assistant generates up to 5 positive + 5 negative examples

#### 2.5 use-regex-ai.svelte.ts composable

Follows the composable state exposure pattern (mandatory rule in AGENTS.md).

```ts
export function useRegexAi() {
  const _state = $state({
    is_loading_model: false,
    load_progress: 0,        // 0-100
    is_ready: false,
    is_streaming: false,
    messages: [] as ChatMessage[],
    streaming_text: '',
    error: null as string | null,
    pending_choices: null as RegexChoice[] | null,  // 1-3 regex options
    webgpu_available: false,
  });

  // WebLLM engine (lazy-loaded)
  let engine: any = null;

  async function init() {
    // Check WebGPU availability
    _state.webgpu_available = await checkWebGpu();
    if (!_state.webgpu_available) return;
    // Check if model is cached (Service Worker)
    const cached = await isModelCached();
    if (cached) {
      _state.is_ready = true;
      return;
    }
    // Start loading to memory
    _state.is_loading_model = true;
    engine = await createMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC', {
      init_progress_callback: (progress: number) => {
        _state.load_progress = Math.round(progress * 100);
      },
    });
    _state.is_loading_model = false;
    _state.is_ready = true;
  }

  async function sendMessage(text: string) { /* ... */ }
  function applyChoice(index: number) { /* ... */ }
  async function testRegex(pattern: string, samples: string[]) { /* ... */ }
  async function generateExamples(pattern: string) { /* ... */ }
  function dispose() { /* unload engine, free VRAM */ }

  return {
    get state(): DeepReadonly<typeof _state> { return _state as DeepReadonly<typeof _state>; },
    init,
    sendMessage,
    applyChoice,
    testRegex,
    generateExamples,
    dispose,
  };
}
```

### Phase 3: Service Worker for background model download

#### 3.1 Service Worker registration

**New file**: `primebrick-fe-v3/static/sw-regex-ai.js`
- Service Worker that listens for `install` event
- On install, fetches the model files from HuggingFace CDN and stores in Cache API
- Uses `caches.open('webllm-models')` and `cache.put()` for each model shard
- Reports progress via `postMessage` to clients

**New file**: `primebrick-fe-v3/src/lib/ai/sw-manager.ts`
- `registerRegexAiSw()` — registers the service worker on app load
- `getDownloadProgress()` — returns observable progress (0-100)
- `isModelCached()` — checks Cache API for model files

**File**: `primebrick-fe-v3/src/app.html`
- Add `<script>` to register SW on page load (or register in `+layout.svelte` `onMount`)

#### 3.2 WebLLM model configuration

WebLLM can use custom model URLs. Configure it to load from Cache API (the SW pre-populates the cache):

```ts
const modelConfig = {
  model: 'https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC/resolve/main/',
  model_id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Qwen2.5-0.5B-Instruct-q4f16_1-MLC.wasm',
  vram_required_MB: 800,
  low_resource_required: true,
  overrides: {
    context_window_size: 4096,
    prefill_chunk_size: 512,
  },
};
```

### Phase 4: Wire into ValidationRulesSection

#### 4.1 Replace TextInput with SmartRegexInput

**File**: `primebrick-fe-v3/src/lib/components/config-builder/ValidationRulesSection.svelte`
- Line 405-412: Replace `TextInput` with `SmartRegexInput`
- Pass `config_type={type}` to control which flags are available
- Bind `value={regexPattern}` and `flags={regexFlags}`
- Add `regexFlags` local state: `let regexFlags = $state<string>('');`
- Update `handleRegexChange` to pass flags to `builder.setRegex(regexPattern, regexFlags, regexErrorKey || undefined)`
- Update the sync `$effect` to read `v.rules.regex.flags` into `regexFlags`

#### 4.2 Update builder setRegex signature

**File**: `primebrick-fe-v3/src/lib/config/type-config-builder.svelte.ts`
- `setRegex(pattern: string, flags?: string, errorLabelKey?: string)` — flags is optional, empty string = omitted

### Phase 5: Sheet manager registration

**File**: `primebrick-fe-v3/src/lib/shell/sheets/sheet-manager.svelte.ts`
- Add `'config.regexFlags'` and `'config.regexAiChat'` to `SheetPanelId` union
- Add props types to `SheetPanelPropsMap`:
  ```ts
  'config.regexFlags': {
    current_flags: string;
    config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
    on_flags_change: (flags: string) => void;
  };
  'config.regexAiChat': {
    on_apply_regex: (pattern: string, flags: string) => void;
    config_type: 'string' | 'text' | 'secret' | 'url' | 'email' | 'phone';
  };
  ```

**File**: `primebrick-fe-v3/src/lib/shell/sheets/SheetHost.svelte`
- Import `RegexFlagsPanel` and `RegexAiChatPanel`
- Add to registry:
  ```ts
  'config.regexFlags': RegexFlagsPanel,
  'config.regexAiChat': RegexAiChatPanel,
  ```

### Phase 6: Translations

**File**: `primebrick-fe-v3/src/lib/i18n/messages/en-GB-fallback.json`
- Add keys:
  ```json
  "app.smart.regex.flags.title": "Regex Flags",
  "app.smart.regex.flags.global": "Global (g)",
  "app.smart.regex.flags.globalHelp": "Match all occurrences, not just the first",
  "app.smart.regex.flags.ignoreCase": "Ignore case (i)",
  "app.smart.regex.flags.ignoreCaseHelp": "Case-insensitive matching",
  "app.smart.regex.flags.multiline": "Multiline (m)",
  "app.smart.regex.flags.multilineHelp": "^ and $ match at line boundaries",
  "app.smart.regex.ai.title": "AI Regex Assistant",
  "app.smart.regex.ai.welcome": "Describe the validation you want in plain language. The AI will generate a regex for you.",
  "app.smart.regex.ai.placeholder": "e.g. only lowercase letters, 3 to 5 characters",
  "app.smart.regex.ai.loadingModel": "Loading model {progress}%",
  "app.smart.regex.ai.modelReady": "Qwen2.5-0.5B is ready!",
  "app.smart.regex.ai.webgpuRequired": "AI regex assistant requires WebGPU (Chrome 113+/Edge 113+). Please type the regex manually.",
  "app.smart.regex.ai.useThis": "Use this regex?",
  "app.smart.regex.ai.yes": "Yes",
  "app.smart.regex.ai.no": "No",
  "app.smart.regex.ai.chooseOption": "Choose a regex option:",
  "app.smart.regex.ai.send": "Send",
  "app.smart.regex.ai.stop": "Stop",
  "app.smart.regex.ai.brainCta": "AI assistant",
  "app.smart.regex.ai.flagsCta": "Flags"
  ```

### Phase 7: Documentation & rules updates

#### 7.1 Establish "Smart" prefix convention

**File**: `primebrick-fe-v3/AGENTS.md`
- Add section: "## Smart Components (AI-powered)"
- Document: "Components with AI capabilities (NLP, LLM, ML inference) use the `Smart` prefix. Example: `SmartRegexInput`. File naming: `smart-regex-input.svelte`. Directory: `src/lib/components/ui/smart-regex-input/`."

**File**: `primebrick-fe-v3/.devin/rules/` — new rule file `smart-components.md`
- Document the Smart prefix convention for AI-powered components.

**File**: `primebrick-v3-docs/docs/user-guide/` — new MDX page for SmartRegexInput
- Component extraction via `pnpm extract-docs`
- User-facing documentation of the AI regex assistant feature

### Phase 8: Tests

#### 8.1 Unit tests

**File**: `primebrick-fe-v3/src/lib/__tests__/smart-regex-input.test.ts` (new)
- Test: invalid pattern `[a-` shows error
- Test: valid pattern `^[A-Z]{3}$` with flags `i` validates `abc`
- Test: flags CTA opens sheet with correct flags based on config_type
- Test: brain CTA opens AI chat sheet
- Test: non-WebGPU shows "WebGPU required" message

**File**: `primebrick-fe-v3/src/lib/__tests__/type-config-builder.test.ts` (update)
- Test: `setRegex('^[a-z]+$', 'i')` stores `flags: 'i'`
- Test: `setRegex('^[a-z]+$', '')` omits `flags` field

**File**: `primebrick-fe-v3/src/lib/__tests__/config-validation.test.ts` (update)
- Test: regex with `flags: 'i'` validates case-insensitively
- Test: mismatch without custom key uses `regexMismatch` fallback

#### 8.2 SDK tests

**File**: `primebrick-v3-sdk/src/config/__tests__/config-validator.test.ts` (update)
- Test: invalid pattern `[invalid` with custom `error_label_key` throws `invalidRegexPattern` (not custom key)
- Test: regex with `flags: 'i'` validates case-insensitively
- Test: mismatch without custom key uses `regexMismatch` fallback

---

## Files to Modify

### SDK
- `primebrick-v3-sdk/src/config/iconfig-entity.ts` — add `flags?: string` to regex rule
- `primebrick-v3-sdk/src/config/config-validator.ts` — use flags, fix invalid-pattern/mismatch error keys
- `primebrick-v3-sdk/src/config/__tests__/config-validator.test.ts` — update + add tests

### FE — Schema & validation
- `primebrick-fe-v3/src/lib/config/type-config-schema.ts` — add `flags?: string` to regex rule interface
- `primebrick-fe-v3/src/lib/config/type-config-builder.svelte.ts` — `setRegex(pattern, flags?, errorLabelKey?)`
- `primebrick-fe-v3/src/lib/validation/config-validation.ts` — use flags, add mismatch fallback

### FE — New component
- `primebrick-fe-v3/src/lib/components/ui/smart-regex-input/smart-regex-input.svelte` — main component
- `primebrick-fe-v3/src/lib/components/ui/smart-regex-input/regex-flags-panel.svelte` — flags selector panel
- `primebrick-fe-v3/src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte` — AI chat panel
- `primebrick-fe-v3/src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` — WebLLM composable
- `primebrick-fe-v3/src/lib/components/ui/smart-regex-input/index.ts` — exports

### FE — Sheet manager
- `primebrick-fe-v3/src/lib/shell/sheets/sheet-manager.svelte.ts` — add 2 new panel IDs + props
- `primebrick-fe-v3/src/lib/shell/sheets/SheetHost.svelte` — register 2 new panels

### FE — Service Worker
- `primebrick-fe-v3/static/sw-regex-ai.js` — background model download
- `primebrick-fe-v3/src/lib/ai/sw-manager.ts` — SW registration + cache check
- `primebrick-fe-v3/src/app.html` — SW registration script (or in +layout.svelte onMount)

### FE — Wire into existing
- `primebrick-fe-v3/src/lib/components/config-builder/ValidationRulesSection.svelte` — replace TextInput with SmartRegexInput
- `primebrick-fe-v3/package.json` — add `@mlc-ai/web-llm` dep (pinned: `"0.2.85"`)

### FE — Tests
- `primebrick-fe-v3/src/lib/__tests__/smart-regex-input.test.ts` — new test file
- `primebrick-fe-v3/src/lib/__tests__/type-config-builder.test.ts` — update regex tests
- `primebrick-fe-v3/src/lib/__tests__/config-validation.test.ts` — update regex tests

### FE — Translations
- `primebrick-fe-v3/src/lib/i18n/messages/en-GB-fallback.json` — add Smart regex keys

### Documentation
- `primebrick-fe-v3/AGENTS.md` — add Smart components section
- `primebrick-fe-v3/.devin/rules/smart-components.md` — new rule file
- `primebrick-v3-docs/docs/user-guide/smart-regex-input.mdx` — user-facing docs

---

## Verification

- [ ] SDK: `pnpm test` in `primebrick-v3-sdk` — all 253+ tests pass, new regex flags tests pass
- [ ] SDK: `pnpm run build` — TypeScript build passes
- [ ] FE: `pnpm run check` — svelte-check 0 errors (3 pre-existing warnings OK)
- [ ] FE: `pnpm test` — all 225+ tests pass, new SmartRegexInput tests pass
- [ ] FE: `pnpm run build` — production build passes (WebLLM is dynamic import, not in main bundle)
- [ ] Manual: type `[a-` in regex field → red error appears
- [ ] Manual: type `^[a-z]+$` with flag `i` → `ABC` validates as valid
- [ ] Manual: flags CTA opens right panel, toggles persist in JSON preview
- [ ] Manual: brain CTA opens AI chat, model loads with progress bar
- [ ] Manual: describe "only lowercase 3-5 chars" → AI returns regex, confirm applies it
- [ ] Manual: non-WebGPU browser shows "WebGPU required" message, flags CTA still works
- [ ] Manual: Service Worker pre-downloads model in background (check DevTools → Cache Storage)

---

## Risks / Considerations

1. **WebGPU adoption**: ~70% browser support as of 2026. Non-WebGPU users lose AI but keep flags + manual regex. Acceptable per user decision.

2. **Model download size (278MB)**: Mitigated by Service Worker background pre-download + Cache API. First visit: download in background. Subsequent visits: instant from cache. The model is NOT loaded into memory until brain CTA is clicked.

3. **VRAM usage (~300MB)**: Released when the AI panel closes (`engine.unload()`). No persistent memory pressure.

4. **`g` flag statefulness**: `new RegExp(pattern, 'g').test()` has a stateful `lastIndex`. The SDK and FE validators must create a new RegExp instance per validation call (already the case — they construct `new RegExp()` inside the validation function). Document this in tests.

5. **Backward compatibility**: Existing `type_config` rows without `flags` field → `flags ?? ''` defaults to no flags. No migration needed. Existing regex patterns behave identically.

6. **Service Worker scope**: SW must be registered at root (`/sw-regex-ai.js`) to intercept all fetches. SvelteKit serves `static/` at root, so the SW file is accessible at `/sw-regex-ai.js`.

7. **CORS for HuggingFace CDN**: Model files are served from `huggingface.co` with CORS enabled. The Service Worker can fetch and cache them. WebLLM's `CreateMLCEngine` fetches from the configured URL — if cached, the SW serves from Cache API.

8. **Bundle size**: `@mlc-ai/web-llm` is ~14MB but loaded via dynamic `import()` only when brain CTA is clicked. Not in the main bundle. Vite code-splits it automatically.

9. **Svelte MCP tool**: Per AGENTS.md rule 7, all `.svelte` files MUST be passed to `svelte-autofixer` MCP tool before writing. This will be done during implementation.
