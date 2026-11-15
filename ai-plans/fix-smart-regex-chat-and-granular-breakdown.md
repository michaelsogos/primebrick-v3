# Plan: Fix Smart Regex Chat Behavior + Granular Breakdown

## Objective

Fix 4 issues in the Smart Regex AI assistant and improve the regex explanation to be more "per dummies" (granular, element-by-element).

## Issues

| # | Issue | Root Cause (empirically verified) |
|---|-------|-----------------------------------|
| 1 | Same response every time regardless of input | `sendMessage` (line 160-163) sends full message history including previous assistant JSON responses. The 0.5B model gets confused by accumulated JSON and repeats the first response. |
| 2 | Previous responses disappear, only latest shown at bottom | `pending_choices` is a single state variable overwritten on each new message (line 157). Preview + breakdown are rendered as a separate section outside the message loop, not per-message. Previous previews vanish. |
| 3 | Choice B has no breakdown | Variable shadowing bug: inner `{#each breakdown as part, i (i)}` at line 438 shadows outer `{#each ai.state.pending_choices as choice, i (i)}` at line 394. Also, if the LLM returns an invalid pattern for B, `explainRegex` returns `[]` and the `{#if breakdown.length > 0}` block is skipped. |
| 4 | Breakdown too high-level | `describeCharacterClassKey` (line 153-175) collapses all class elements into a single comma-separated string. The AST (`@eslint-community/regexpp` v4.12.2) exposes individual `CharacterClassRange`, `Character`, and `CharacterSet` nodes inside `CharacterClass.elements[]`, so granular expansion is feasible. |

## Empirical Evidence

### Issue 1 — History poisoning

**File:** `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts`
**Lines 160-163:**
```ts
const completion = await engine.chat.completions.create({
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    ..._state.messages.map((m) => ({ role: m.role, content: m.content }) as const),
  ],
```

The `_state.messages` array includes ALL previous assistant messages, which are raw JSON like `{"patterns":[{"pattern":"^[a-zA-Z0-9.!]+$",...}]}`. The 0.5B model sees this accumulated JSON and tends to repeat the first pattern.

### Issue 2 — Single `pending_choices` state

**File:** `use-regex-ai.svelte.ts`, line 89: `pending_choices: null as RegexChoice[] | null`
**File:** `use-regex-ai.svelte.ts`, line 157: `_state.pending_choices = null;` (cleared on each new message)
**File:** `regex-ai-chat-panel.svelte`, lines 312-386 (single choice) and 389-453 (multiple choices): rendered OUTSIDE the message loop, driven by `ai.state.pending_choices`.

Previous assistant messages DO store `choices` in `message.choices` (line 182), but the panel only renders "Here you are!" for those (line 277), not the preview+breakdown.

### Issue 3 — Variable shadowing

**File:** `regex-ai-chat-panel.svelte`
- Line 394: `{#each ai.state.pending_choices as choice, i (i)}` — outer loop, `i` = choice index
- Line 438: `{#each breakdown as part, i (i)}` — inner loop, `i` = breakdown part index (SHADOWS outer `i`)

This means inside the inner loop, `i` refers to the part index, not the choice index. While this doesn't directly prevent B's breakdown from rendering (the `{#each}` creates its own scope), it IS a code smell. The real issue for "B has no breakdown" is more likely that the LLM generates an invalid pattern for B, causing `explainRegex` to return `[]`.

### Issue 4 — Current character class handling

**File:** `regex-explainer.ts`, lines 153-175:
```ts
function describeCharacterClassKey(node: AST.CharacterClass): KeyResult {
  const descriptions: string[] = [];
  for (const el of elements) {
    if (el.type === 'CharacterClassRange') {
      descriptions.push(`${min}\u2013${max}`);  // e.g. "a–z"
    } else if (el.type === 'Character') {
      descriptions.push(el.raw.replace('\\', ''));
    }
  }
  const content = descriptions.join(', ');
  return { key: `${K}.char_class`, params: { content } };
}
```

This produces a single line like: `Qualsiasi carattere in: a–z, A–Z, 0–9, .`

The user wants instead:
```
• [ e ]     Qualsiasi carattere contenuto nelle parentesi
• a-z       tutti i caratteri minuscoli dalla A alla Z
• A-Z       tutti i caratteri maiuscoli dalla A alla Z
• 0-9       tutti i caratteri numerici da 0 a 9
• +         qualsiasi ripetizione di carattere rispetto a ciò che sta alla sua sinistra
• $         fino alla fine della stringa
```

### AST capabilities (verified from regexpp v4.12.2)

`CharacterClass.elements` returns `CharacterClassElement[]` where each element is:
- `CharacterClassRange` — has `min: Character` and `max: Character` (both have `.value` = code point)
- `Character` — has `.value` (code point) and `.raw`
- `CharacterSet` — has `.kind` ('digit', 'space', 'word', 'any') and `.negate`

This is sufficient to emit one `RegexPart` per element inside a character class.

## Changes

### Phase 1: Fix chat behavior (issues 1, 2, 3)

#### 1.1 `use-regex-ai.svelte.ts` — Send only current message to LLM

**Change:** In `sendMessage`, replace the full-history message array with only `[system, userMessage]`.

**Before (lines 160-163):**
```ts
messages: [
  { role: 'system', content: SYSTEM_PROMPT },
  ..._state.messages.map((m) => ({ role: m.role, content: m.content }) as const),
],
```

**After:**
```ts
messages: [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: text },
],
```

**Rationale:** The 0.5B model is too small for multi-turn conversation with JSON context. Each request is independent: system prompt + current user message. This ensures different inputs produce different outputs.

**Side effect:** The model loses conversation context (can't reference "make it stricter" referring to a previous pattern). This is acceptable for a 0.5B model — the alternative (repeating the same answer) is worse. The user can always describe the full requirement in one message.

#### 1.2 `regex-ai-chat-panel.svelte` — Render preview+breakdown per-message in history

**Change:** Move the preview+breakdown rendering INSIDE the message loop, using `message.choices` instead of `ai.state.pending_choices`.

**Current structure (simplified):**
```
{#each ai.state.messages as message}
  {#if assistant && isJsonResponse}
    "Here you are!"   ← no preview shown
  {/if}
{/each}

{#if pending_choices.length === 1}   ← OUTSIDE loop, only latest
  preview + breakdown + yes/no
{/if}
{#if pending_choices.length > 1}     ← OUTSIDE loop, only latest
  A/B/C choices with breakdown
{/if}
```

**New structure:**
```
{#each ai.state.messages as message}
  {#if message.role === 'user'}
    user bubble
  {:else if message.role === 'assistant' && message.choices}
    "Here you are!" bubble
    {#if message.choices.length === 1}
      preview + breakdown + yes/no   ← per-message, stays in history
    {:else if message.choices.length > 1}
      A/B/C choices with breakdown    ← per-message, stays in history
    {/if}
  {/if}
{/each}

{#if ai.state.is_streaming}  ← streaming indicator stays outside
  typing dots
{/if}
```

**Key changes:**
- `pending_choices` state is still used to track the "active" set, but rendering is driven by `message.choices` in the loop.
- The Yes/No buttons and A/B/C click handlers need to reference the message's choices, not the global `pending_choices`.
- `applyChoice` needs to accept the message UUID or the choices array directly, not just an index into `pending_choices`.

#### 1.3 `regex-ai-chat-panel.svelte` — Fix variable shadowing

**Change:** Rename inner loop variable from `i` to `j` (or `part_idx`).

**Line 438:** `{#each breakdown as part, i (i)}` → `{#each breakdown as part, j (j)}`

Also check line 351 (single choice breakdown): `{#each breakdown as part, i (i)}` — this one is NOT nested inside another `{#each}` with `i`, so it's safe, but rename for consistency.

#### 1.4 `use-regex-ai.svelte.ts` — Adjust `applyChoice` for per-message choices

**Current (line 282-289):**
```ts
function applyChoice(index: number): RegexChoice | null {
  if (!_state.pending_choices || index < 0 || index >= _state.pending_choices.length) return null;
  const choice = _state.pending_choices[index];
  _state.pending_choices = null;
  return choice;
}
```

**New:** Add an overload that accepts a message UUID + index:
```ts
function applyChoice(index: number, message_uuid?: string): RegexChoice | null {
  // If message_uuid provided, find choices in that message
  if (message_uuid) {
    const msg = _state.messages.find(m => m.uuid === message_uuid);
    if (!msg || !msg.choices || index < 0 || index >= msg.choices.length) return null;
    return msg.choices[index];
  }
  // Fallback: use pending_choices
  if (!_state.pending_choices || index < 0 || index >= _state.pending_choices.length) return null;
  const choice = _state.pending_choices[index];
  _state.pending_choices = null;
  return choice;
}
```

### Phase 2: Granular breakdown (issue 4)

#### 2.1 `regex-explainer.ts` — Expand CharacterClass into individual parts

**Change:** Replace `onCharacterClassEnter` to emit multiple parts instead of one.

**Current (lines 91-95):**
```ts
onCharacterClassEnter: (node: AST.CharacterClass) => {
  if (quantifierDepth > 0) return;
  const desc = describeCharacterClassKey(node);
  parts.push({ fragment: node.raw, meaning_key: desc.key, meaning_params: desc.params });
},
```

**New:**
```ts
onCharacterClassEnter: (node: AST.CharacterClass) => {
  if (quantifierDepth > 0) return;
  // Emit opening bracket
  parts.push({
    fragment: node.negate ? '[^' : '[',
    meaning_key: node.negate ? `${K}.char_class_negated_open` : `${K}.char_class_open`,
  });
  // Emit one part per element
  for (const el of node.elements) {
    if (el.type === 'CharacterClassRange') {
      const minChar = String.fromCharCode(el.min.value);
      const maxChar = String.fromCharCode(el.max.value);
      parts.push({
        fragment: el.raw,
        meaning_key: `${K}.char_range`,
        meaning_params: { min: minChar, max: maxChar },
      });
    } else if (el.type === 'Character') {
      const desc = describeCharacterKey(el);
      parts.push({
        fragment: el.raw,
        meaning_key: desc.key,
        meaning_params: desc.params,
      });
    } else if (el.type === 'CharacterSet') {
      const desc = describeCharacterSetKey(el);
      parts.push({
        fragment: el.raw,
        meaning_key: desc.key,
        meaning_params: desc.params,
      });
    }
  }
  // Emit closing bracket
  parts.push({
    fragment: ']',
    meaning_key: `${K}.char_class_close`,
  });
},
```

**Keep `describeCharacterClassKey`** unchanged — it's still used by `describeElementKey` for quantifier descriptions (when a CharacterClass is quantified, e.g. `[a-z]+`).

#### 2.2 New translation keys

Add these keys to `en-GB-fallback.json` and all 6 seed patches:

| Key | en-GB | it-IT | fr-FR | es-ES | de-DE | pt-PT |
|-----|-------|-------|-------|-------|-------|-------|
| `app.smart.regex.explainer.char_class_open` | Any character contained in the brackets | Qualsiasi carattere contenuto nelle parentesi | Tout caractère contenu dans les crochets | Cualquier caracter contenido entre corchetes | Beliebiges Zeichen in den Klammern | Qualquer caractere contido entre colchetes |
| `app.smart.regex.explainer.char_class_negated_open` | Any character NOT contained in the brackets | Qualsiasi carattere NON contenuto nelle parentesi | Tout caractère NON contenu dans les crochets | Cualquier caracter NO contenido entre corchetes | Beliebiges Zeichen NICHT in den Klammern | Qualquer caractere NAO contido entre colchetes |
| `app.smart.regex.explainer.char_class_close` | End of character class | Fine della classe di caratteri | Fin de la classe de caracteres | Fin de la clase de caracteres | Ende der Zeichenklasse | Fim da classe de caracteres |
| `app.smart.regex.explainer.char_range` | Characters from {min} to {max} | Caratteri da {min} a {max} | Caracteres de {min} a {max} | Caracteres de {min} a {max} | Zeichen von {min} bis {max} | Caracteres de {min} a {max} |

**Note:** The existing `char_class` and `char_class_negated` keys are KEPT (still used by `describeCharacterClassKey` for quantifier descriptions).

#### 2.3 Update existing tests

**File:** `src/lib/__tests__/regex-explainer.test.ts`

The test `explains anchored character class with quantifier` (lines 16-27) expects:
```ts
const parts = explainRegex("^[a-z]{3,5}$", "");
expect(parts.length).toBe(4);
```

With the new granular breakdown, `[a-z]` expands to 3 parts (`[`, `a-z`, `]`) instead of 1, so `parts.length` changes. This test must be updated.

All tests that involve character classes need their expected `parts.length` and `parts[N]` assertions updated.

### Phase 3: Database + translations

#### 3.1 Fire-and-forget SQL

Create `db-meta/fire-and-forget/add_granular_breakdown_translations.sql` with INSERT statements for the 4 new keys × 6 languages = 24 rows.

#### 3.2 Apply to live DB + Redis invalidation

Run the SQL against the live database and invalidate the translation cache.

#### 3.3 Update 6 seed patches

Append the 4 new keys to each of the 6 seed patch files.

#### 3.4 Update SHA256

Calculate new SHA256 for each modified seed patch, create fire-and-forget SHA256 update scripts, apply to live DB.

## Files Impacted

### Frontend (primebrick-fe-v3)

| File | Change |
|------|--------|
| `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` | Fix sendMessage to send only current message; update applyChoice to accept message_uuid |
| `src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte` | Move preview+breakdown inside message loop; fix variable shadowing; update handlers |
| `src/lib/components/ui/smart-regex-input/regex-explainer.ts` | Expand CharacterClass into individual parts |
| `src/lib/i18n/messages/en-GB-fallback.json` | Add 4 new translation keys |
| `src/lib/__tests__/regex-explainer.test.ts` | Update assertions for granular breakdown |

### Backend (primebrick-be-v3)

| File | Change |
|------|--------|
| `db-meta/fire-and-forget/add_granular_breakdown_translations.sql` | New — 24 INSERT rows |
| `db-meta/fire-and-forget/update_seed_translations_sha256_granular_*.sql` | New — 6 SHA256 update scripts |
| `db-meta/patches/00000000000001_seed_translations_en_gb.sql` | Append 4 keys |
| `db-meta/patches/00000000000002_seed_translations_it_it.sql` | Append 4 keys |
| `db-meta/patches/00000000000003_seed_translations_fr_fr.sql` | Append 4 keys |
| `db-meta/patches/00000000000004_seed_translations_es_es.sql` | Append 4 keys |
| `db-meta/patches/00000000000005_seed_translations_de_de.sql` | Append 4 keys |
| `db-meta/patches/00000000000006_seed_translations_pt_pt.sql` | Append 4 keys |

## Verification

1. **Svelte autofixer** — pass modified `.svelte` files through the svelte MCP autofixer
2. **svelte-check** — `pnpm run check` (0 errors expected)
3. **Unit tests** — `pnpm test` (update regex-explainer tests first, all must pass)
4. **Browser test** — verify:
   - Different inputs produce different regex outputs (issue 1)
   - Previous Q&A stays in chat history with preview+breakdown (issue 2)
   - All choices (A, B, C) show breakdown (issue 3)
   - Character classes expand to individual elements (issue 4)
   - Italian text shows granular breakdown correctly

## Open Questions

1. **Multi-turn context:** By sending only the current message (fix for issue 1), the model loses conversation context. The user can't say "make it stricter" referring to a previous pattern. Is this acceptable, or should we try a middle ground (e.g. send only user messages, not assistant JSON responses, as context)?

2. **Quantifier + CharacterClass interaction:** When a CharacterClass is quantified (e.g. `[a-z]+`), the current quantifier handler emits the inner element description + the quantifier. With granular expansion, should the quantifier handler still use the summary form (`[a-z]` → "Qualsiasi carattere in: a–z") for the element part, or should it also expand? My recommendation: keep the summary for quantified classes (the `+` line already says "una o piu volte"), and only expand non-quantified classes. This avoids redundancy.

3. **Yes/No buttons in history:** When preview+breakdown moves inside the message loop, previous Q&A will also show Yes/No buttons. Should those be disabled/hidden for already-answered questions? My recommendation: hide Yes/No for messages that aren't the latest (only show on the most recent assistant message).
