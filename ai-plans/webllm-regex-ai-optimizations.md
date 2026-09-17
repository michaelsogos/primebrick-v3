# WebLLM Regex AI Optimizations

## Objective
Apply 4 empirically-validated optimizations from the KV cache test harness to the production `use-regex-ai.svelte.ts` composable.

## Background
Extensive testing across 7 WebLLM models (Qwen2.5, Qwen2.5-Coder, Qwen3, Qwen3.5 families) confirmed 4 optimizations that improve reliability, correctness, and performance of the Smart Regex AI chat.

## Optimizations

### 1. `/no_think` per-turn (Qwen3 reasoning suppression)
**Problem**: Qwen3 models (1.7B, 4B) generate unbounded reasoning text without `<think>` tags even with `enable_thinking=false`. This is a known bug — `enable_thinking=false` is ignored by WebLLM/vLLM for Qwen3. The model fills the entire `max_tokens` budget with reasoning, never producing JSON. Test result: 45+ min hang, 127 tokens of reasoning, 0% correctness.

**Fix**: Add `/no_think` directive to the system prompt AND to every user message (JSON_REMINDER). This is the official Qwen-recommended soft switch for per-turn thinking suppression.

**Before**: `enable_thinking=false` (ignored by Qwen3)
**After**: `/no_think` in system prompt + `/no_think` in JSON_REMINDER

**Impact**: Qwen3-1.7B went from 45+ min hang → 6 min completion. Qwen3-4B went from 50+ min hang → 10 min completion. Both now generate clean JSON (22-25 tokens) instead of reasoning text (127-512 tokens).

**Files**: `use-regex-ai.svelte.ts` — `buildSystemPrompt()` and `JSON_REMINDER` constant

### 2. Raw content for KV cache prefix matching
**Problem**: The production code stores simplified assistant content (`"Regex: <pattern>"`) but sends raw JSON to the model. This breaks WebLLM's automatic prefix KV cache reuse because the stored history doesn't match what was actually sent. Every turn does a full prompt reprocess (686 tokens instead of ~50).

**Fix**: Store the raw model response (after stripping thinking blocks) as the assistant message content. The UI already handles both JSON and simplified content via `parseRegexChoices()`. The `Regex: <pattern>` prefix is no longer stored — the raw JSON is stored instead.

**Before**: `content: choices ? "Regex: ${choices[0].pattern}" : responseText`
**After**: `content: responseText` (always raw, after thinking strip)

**Impact**: KV cache hits went from 0/4 to 3-4/5 in Scenarios B and C. Avg prompt tokens dropped from 686 to ~160-250.

**Files**: `use-regex-ai.svelte.ts` — `sendMessage()` assistant message construction

### 3. Exact user content storage for KV prefix stability
**Problem**: The production code stores only the bare user text (`text`) but sends `Current regex: ...\n${text}${JSON_REMINDER}` to the model. On subsequent turns, the stored user content doesn't match what was sent, breaking the KV prefix.

**Fix**: Store the full user content sent to the model (including `Current regex:` prefix and `JSON_REMINDER`) in the `ChatMessage.content`. The UI needs to display the original text, so we add a separate `display_content` field to `ChatMessage` for UI rendering.

**Before**: `userMessage.content = text` (bare text)
**After**: `userMessage.content = userContentForModel` (full content sent); `userMessage.display_content = text` (for UI)

**Impact**: Scenarios B and C achieve KV cache hits on all turns after the first. Avg prompt tokens: 160-250 (vs 686 without KV).

**Files**: `use-regex-ai.svelte.ts` — `ChatMessage` interface, `sendMessage()` user message construction

### 4. Semantic regex equivalence for character class ordering
**Problem**: The production code doesn't compare regexes semantically. A regex like `^[a-zA-Z0-9.,;-_]+$` would be considered different from `^[a-zA-Z0-9.,;_-]+$` even though they accept the same language. This doesn't affect the AI chat directly, but it affects any test/scoring logic that compares expected vs generated regexes.

**Fix**: This is primarily a test-harness optimization. The production code doesn't compare regexes — it parses JSON and displays choices. No production change needed for this optimization. It's documented here for completeness and for future test/scoring integration.

**Files**: No production change. Test harness only.

## Implementation Plan

### File: `D:\git\primebrick\primebrick-fe-v3\src\lib\components\ui\smart-regex-input\use-regex-ai.svelte.ts`

#### Change 1: Add `/no_think` to system prompt
- `buildSystemPrompt()`: prepend `/no_think\n` to the returned string

#### Change 2: Add `/no_think` to JSON_REMINDER
- `sendMessage()`: change `JSON_REMINDER` to include `/no_think` prefix

#### Change 3: Store raw responseText as assistant content
- `sendMessage()`: change assistant message `content` to always be `responseText` (after thinking strip), not `"Regex: <pattern>"`
- Remove the conditional `choices ? "Regex: ..." : responseText` logic

#### Change 4: Store full user content for KV prefix matching
- `ChatMessage` interface: add `display_content?: string` field
- `sendMessage()`: store `userContentForModel` as `userMessage.content`, store `text` as `userMessage.display_content`
- Update the modelMessages loop to use `m.content` directly (no more special-casing the last user message — it's already stored with the full content)

#### Change 5: Simplify modelMessages construction
- Since user messages now store the full content sent to the model, the loop can use `m.content` directly for ALL messages
- Remove the `if (m.uuid === userMessage.uuid)` special case — all user messages already have the correct content
- Remove the `userContentForModel` local variable — it's now stored in the message itself

## Acceptance Criteria

1. `/no_think` appears in the system prompt and in every user message sent to WebLLM
2. Assistant messages store raw responseText (after thinking strip), not simplified "Regex: ..." prefix
3. User messages store the full content sent to the model (including Current regex prefix and JSON_REMINDER)
4. `ChatMessage.display_content` holds the original user text for UI rendering
5. The modelMessages loop uses `m.content` directly for all messages (no special-casing)
6. No regression in the UI — the chat panel still shows the original user text and parsed regex choices
7. `pnpm run check` passes with no new errors
