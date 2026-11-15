# Plan: Scalable Multi-Turn Context for Smart Regex

> **Date**: 2026-09-10
> **Status**: Revised v3 after deep empirical source-code verification — awaiting approval
> **Scope**: FE-only change. No BE changes needed.

---

## Problem

The current `use-regex-ai.svelte.ts` has two issues:

1. **Code quality**: Rebuilds the entire message history every turn via `.filter().map()`, which is unnecessary and makes the code harder to maintain.

2. **Inconsistency**: Stores raw `responseText` as `content` but sends simplified `Regex: <pattern>` via `.map()`. The stored content doesn't match what's sent, creating confusion.

The user's concern: *"non può essere che ogni volta dobbiamo pasare la precedente history, non sarebbe una soluzione scalabile"*

---

## Empirical findings from source code deep-dive

### Finding 1: The FE already sends simplified content — overflow was test-only

The current `.map()` at line 255-256 already simplifies assistant content:

```typescript
if (m.role === 'assistant' && m.choices && m.choices.length > 0) {
  return { role: 'assistant', content: `Regex: ${m.choices[0].pattern}` };
}
```

So the content SENT to WebLLM is already `"Regex: ^[a-zA-Z0-9]+$"` (~10 tokens), not raw JSON (~30 tokens) or thinking blocks (~500-2000 tokens).

**Measured token estimates** (from `count-tokens.mjs` empirical test):

| Scenario | Chars | Est. tokens (chars/4) |
|----------|------:|---------------------:|
| System prompt | 1705 | ~427 |
| 5-turn with simplified assistant | 2394 | ~599 |
| 5-turn with raw JSON assistant | 2599 | ~650 |
| 5-turn with thinking assistant | 3531 | ~883 |

With chat template overhead (~150 tokens for 11 messages), the 5-turn total with simplified content is **~750 tokens** — well within 4096.

The 4137-token overflow measured during testing was because **the test helper** stored and sent raw responses (including thinking blocks), NOT because the FE code does. The FE code already simplifies via `.map()`.

### Finding 2: KV cache reuse was NEVER working in the FE

WebLLM's `compareConversationObject()` does exact string matching on every message. Two mismatches break it every turn:

**Mismatch 1 — User messages**: The FE injects "Current regex:" + JSON reminder into the LAST user message. But for PREVIOUS user messages, it sends the original text. The pipeline's internal conversation has the INJECTED version (from the previous turn). So:
- Pipeline has: `"Current regex: ^[a-zA-Z0-9]+$\naggiungiamo anche il punto e la virgola\n[Respond ONLY with JSON: ...]"`
- New request has: `"aggiungiamo anche il punto e la virgola"` (original, no injection)
- **Mismatch → reset → no KV cache reuse**

**Mismatch 2 — Assistant messages**: The FE sends simplified `"Regex: <pattern>"` but the pipeline stored the raw response (including empty thinking block prefix + JSON). So:
- Pipeline has: `"imdi\n\n\n\n{"patterns":[{"pattern":"^[a-zA-Z0-9]+$","flags":""}]}`
- New request has: `"Regex: ^[a-zA-Z0-9]+$"`
- **Mismatch → reset → no KV cache reuse**

**Conclusion**: Every turn already does a full reset + reprocess. This has been the case since the feature was built. It works because the simplified content is small enough that reprocessing is fast (~0.5-1s for ~750 tokens).

### Finding 3: KV cache reuse is incompatible with our requirements

To get KV cache reuse, we would need to:
1. Store the EXACT `engine.getMessage()` response (including thinking blocks + JSON)
2. Store the INJECTED user content (with "Current regex:" + JSON reminder)
3. Pass both back unmodified in subsequent turns

This is unacceptable because:
- Thinking blocks are 500-2000 tokens → context overflow at 3-4 turns
- Verbose JSON confuses small models (≤1.5B) → they generate JSON-within-JSON
- Injected user content includes "Current regex:" which is only relevant for the CURRENT turn, not future turns

### Finding 4: The approach IS scalable without KV cache reuse

| Turns | Est. tokens (with simplified content) | Prefill time | Context window |
|------:|--------------------------------------:|-------------|---------------:|
| 5 | ~750 | ~0.5s | 4096 |
| 10 | ~1100 | ~0.7s | 4096 |
| 20 | ~1800 | ~1.2s | 4096 |
| 30 | ~2500 | ~1.5s | 4096 |

Even at 30 turns, the prompt fits in 4096 and prefill takes ~1.5s. The user waits for generation (1-3s) anyway, so the prefill overhead is acceptable.

### Finding 5: `max_history_size` is RNNState-only

From `llm_chat.ts` lines 385-397 and 445-456:

```typescript
if (config.max_history_size !== undefined && config.max_history_size !== null) {
  this.maxHistorySize = config.max_history_size;
} else if (this.resolvedModelABI.needsRNNState) {
  log.info("max_history_size is not set. Using browser-safe default: 1");
}

// maxHistorySize is used ONLY to create RNN state:
if (this.resolvedModelABI.needsRNNState) {
  this.rnnState = createRNNState(
    this.tvm.makeShapeTuple([defaultMaxNumSequence]),
    this.tvm.makeShapeTuple([this.maxHistorySize]),
  );
}
```

`needsRNNState` is `false` for 8 of our 10 models (all non-hybrid). For Qwen3.5-2B and Qwen3.5-4B (hybrid), it's already set to `1` in prebuiltAppConfig. Setting it to 3-4 would allocate 3-4x more RNN state memory — more VRAM, risk of OOM, and **does NOT limit chat history**.

### Finding 6: `sliding_window_size` is mutually exclusive with `context_window_size`

From `llm_chat.ts` lines 256-278:

```typescript
if (this.contextWindowSize !== -1 && this.slidingWindowSize !== -1) {
  throw new WindowSizeConfigurationError(this.contextWindowSize, this.slidingWindowSize);
}
```

All 10 compatible models use `context_window_size: 4096` in prebuiltAppConfig. Setting `sliding_window_size` would require also setting `context_window_size: -1`, which changes the KV cache strategy and risks VRAM issues.

### Finding 7: UI is safe with the content change

From `regex-ai-chat-panel.svelte`:

- **Line 442**: When `message.choices` exist → UI uses `choices` (NOT `content`) → **safe**
- **Line 623**: When `message.choices` don't exist → UI uses `content` → our fix keeps raw `responseText` as fallback → **safe**
- **Line 436**: User messages display `message.content` → our fix doesn't change user content → **safe**

From `use-regex-ai.svelte.ts`:
- **Line 223**: `lastRegex` lookup uses `m.choices[0]` (NOT `m.content`) → **safe**
- **Line 487**: `applyChoice` uses `msg.choices[index]` (NOT `msg.content`) → **safe**

---

## Solution: FE-only code quality fix

The fix has three changes in one file: `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`

### Change 1: Store simplified assistant content at insertion time

**Before** (line ~363):
```typescript
const assistantMessage: ChatMessage = {
  uuid: crypto.randomUUID(),
  role: 'assistant',
  content: responseText,  // raw JSON (without thinking blocks, but still verbose)
  choices: choices ?? undefined,
};
```

**After**:
```typescript
// Store the SIMPLIFIED content (just the regex pattern) when choices are parsed.
// This makes stored content = sent content, eliminating the need for .map()
// transformation at send time. When choices are not parsed, keep raw responseText
// as fallback (UI displays it in the fallback path at line 623).
//
// NOTE: This does NOT enable KV cache reuse. The pipeline's internal conversation
// has the raw response (including empty thinking block prefix), which differs
// from our simplified content. KV cache reuse requires storing the exact
// engine.getMessage() output, which is incompatible with our content
// transformation needs. Each turn does a full reset + reprocess, which is
// fast (~0.5-1s for ~750 tokens at 5 turns).
const assistantMessage: ChatMessage = {
  uuid: crypto.randomUUID(),
  role: 'assistant',
  content: choices && choices.length > 0
    ? `Regex: ${choices[0].pattern}`
    : responseText,
  choices: choices ?? undefined,
};
```

### Change 2: Build messages directly instead of .filter().map()

**Before** (lines ~247-277):
```typescript
const historyMessages = _state.messages
  .filter((m) => m.role === 'user' || m.role === 'assistant')
  .map((m, i, arr) => {
    if (i === arr.length - 1 && m.role === 'user') {
      return { role: 'user', content: userContentForModel };
    }
    if (m.role === 'assistant' && m.choices && m.choices.length > 0) {
      return { role: 'assistant', content: `Regex: ${m.choices[0].pattern}` };
    }
    return { role: m.role, content: m.content };
  });

const request = {
  messages: [{ role: 'system', content: systemPrompt }, ...historyMessages],
  // ...
};
```

**After**:
```typescript
// Build messages array directly from stored state.
// Assistant content is already simplified at insertion time (Change 1),
// so no transformation is needed. The only special case is the LAST user
// message, which gets the "Current regex:" prefix + JSON reminder injected.
const modelMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
  { role: 'system', content: systemPrompt },
];

for (const m of _state.messages) {
  if (m.role === 'user') {
    if (m.uuid === userMessage.uuid) {
      modelMessages.push({ role: 'user', content: userContentForModel });
    } else {
      modelMessages.push({ role: 'user', content: m.content });
    }
  } else if (m.role === 'assistant') {
    modelMessages.push({ role: 'assistant', content: m.content });
  }
}

const request = {
  messages: modelMessages,
  stream: true as const,
  enable_thinking: modelParams?.enable_thinking ?? false,
  temperature: modelParams?.temperature ?? 0.7,
  top_p: modelParams?.top_p ?? 0.9,
  max_tokens: modelParams?.max_tokens ?? 256,
  repetition_penalty: modelParams?.repetition_penalty ?? 1.1,
};
```

### Change 3: Add resetConversation() for explicit KV cache clearing

```typescript
async function resetConversation(): Promise<void> {
  if (engine) {
    try {
      await engine.resetChat();
    } catch {
      // Ignore — engine may not be loaded
    }
  }
  _state.messages = [];
  _state.pending_choices = null;
  _state.streaming_text = '';
  _state.ai_status = 'idle';
}
```

Call when:
- User switches model (`switchModel()` already unloads/reloads, which clears KV cache)
- User starts a completely new regex (panel reopened, "reset" clicked)

---

## What this fix does NOT do

| Claim | Reality |
|-------|---------|
| Enables KV cache reuse | ❌ No — content transformation breaks `compareConversationObject` |
| Reduces latency | ❌ No — each turn still does full reset + reprocess (was already happening) |
| Prevents context overflow | ⚠️ Partially — FE already simplified via `.map()`, but now stores simplified too |
| Improves code quality | ✅ Yes — no more `.filter().map()` rebuild |
| Ensures consistency | ✅ Yes — stored content = sent content |
| Better fallback UI | ✅ Yes — fallback shows "Regex: ..." instead of raw JSON |

---

## Acceptance Criteria

1. ✅ `sendMessage()` builds messages directly (no `.filter().map()`)
2. ✅ Assistant messages stored with simplified content (`"Regex: <pattern>"`) when choices exist
3. ✅ Assistant messages stored with raw `responseText` when choices don't exist (fallback)
4. ✅ Previous user messages use original stored content
5. ✅ Only the LAST user message gets "Current regex:" prefix + JSON reminder
6. ✅ `resetConversation()` clears both messages and KV cache
7. ✅ UI displays correctly (choices path uses `choices`, fallback path uses `content`)
8. ✅ `lastRegex` lookup still works (uses `m.choices[0]`, not `m.content`)
9. ✅ `applyChoice` still works (uses `msg.choices[index]`, not `msg.content`)
10. ✅ No BE changes
11. ✅ `pnpm run check` passes on FE

---

## Testing Plan

After implementation:
1. Run `pnpm run check` on FE
2. Browser test: load any model, run 5-turn scenario
3. Verify assistant messages in chat panel display correctly (choices rendered, not raw JSON)
4. Verify "Current regex:" injection still works for incremental edits
5. Verify fallback path (when model returns unparseable output) still shows raw text
6. Verify `resetConversation()` clears the chat when switching models

---

## References

- [`engine.ts` prefill()](https://github.com/mlc-ai/web-llm/blob/main/src/engine.ts) — multi-round detection via `compareConversationObject`
- [`conversation.ts` compareConversationObject()](https://github.com/mlc-ai/web-llm/blob/main/src/conversation.ts) — exact string match on every message
- [`llm_chat.ts` prefillStep()](https://github.com/mlc-ai/web-llm/blob/main/src/llm_chat.ts) — pipeline stores raw `outputMessage` in internal conversation
- [`config.ts` ChatConfig](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts) — `max_history_size` is RNNState-only, `sliding_window_size` mutually exclusive with `context_window_size`
- [multi-round-chat example](https://github.com/mlc-ai/web-llm/blob/main/examples/multi-round-chat/src/multi_round_chat.ts) — official pattern (stores raw `getMessage()`, unmodified)
- [`config.ts` prebuiltAppConfig](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts) — all 10 models use `context_window_size: 4096`
