# Translation Editor Sheet Redesign — Plan

## Status: 🟡 PARTIALLY DONE — updated 2026-11-09

V2 shipped and iterated to V3 anatomy (see TURN LOG at bottom — the
doc below describes the original V2 design; the live anatomy drifted
with each approved iteration). Open items live in the TURN LOG's
"Pending" block — nothing floats untracked.

## Objective

Rebuild `i18n.translationEditor` (`TranslationEditorPanel.svelte`) from the
per-language selector + invisible-work model into the user's specified
4-line anatomy: the edited key leads, the EN base is always a visible
reference, the selected language is a real editable textarea, and AI
generation produces reviewable suggestions instead of silent writes.

The combobox + sheet become a **reusable create+update translation unit**:
translations are NEVER a standalone CRUD — they always ride the owning
page's save (delayed pending queue → gateway flush).

## User decisions (locked — all answered)

1. **Create AND update** — existing rows editable; writes ride the owning
   page's save only (never standalone CRUD).
2. Results container = **list**.
3. Missing-language chips in HEAD = clickable flags.
4. EN preview hidden when selected lang == the shown EN base (no echo).
5. Width stays **w-[420px]**.
6. Pending queue = **owner-tagged** (B) — drains only owner's rows.
7. Conflicts: **never silent, never merge** — ERR01/04/05 → notification +
   requeue; resync ONLY on sheet reopen (user sees both values, decides).
   No refetch+retry inside the flush — CAS never eluded. ERR04/ERR05 are
   unique-constraint conflicts (not version-based), surfaced identically.
8. Status colors: Saved=emerald+Check · Missing=amber+CircleHelp ·
   **Modified=sky/info · Draft=sky/info** (same semantic — pending).
   Icon for pending states: `Clock` (proposed, vetoable).
9. Key-badge palette confirmed: ns=sky · entities=muted · entity=violet ·
   facet=amber · leaf=fg-semibold.
10. Cell generalization: whatever is needed for drift-free testability.
11. No MFA on update (only delete has step-up today); rows readonly when
    the user lacks `translation.update.single`.
12. **PENDING** — BE `key` filter on `/entities/translation/list`
    (one zod field + one `Filter.eq`) vs client-side paging fallback
    (breaks >100 rows/lang).

## Verified wire facts (empirical — read, not assumed)

| Fact | Source |
|---|---|
| Dict-page flush = per-row `createTranslation(module,{key,language,value})` → `POST /api/v1/entities/translation?module=X` on the **BE gateway** — NOT the `{entity,translations}` envelope (US routes strip it: "translation writes are gateway-owned") | `EntityDictPage.svelte:349-365`, `entities-route.ts:9` |
| `PUT /entities/translation/:uuid?module=` exists — **needs uuid + `version`** (DAL optimistic lock) | `translations.router.ts:163` |
| Gateway resolves module → `<schema>.translations` — BE-owned (app/system/settings/custom) + **service_registry discovery** for `crm` & co | `translations.service.ts:151-176` |
| Permissions are distinct: `translation.create.single` / `translation.update.single` / delete / restore | `translations.router.ts:146-186`, `permissions.ts:382-391` |
| `fetchTranslationList` filters **language only — no `key` filter** | `ListQuerySchema:66`, `service.list:239` |
| `fetchModuleTranslations` returns flat `{key:value}` — no row identity | `api.ts:783` |
| `service.create` default `onConflict:"raise"` — the POST route doesn't pass "ignore" → **duplicate (key,language) → 409** | `translations.service.ts:270-287` |
| Pending store is **session-global** — any page's save drains EVERYTHING | `pending-translations.svelte.ts` |
| `AiIcon` = animated gradient sparkles (sky-400→indigo-400); `CopyButton`; `Accordion`; Textarea already `border-primary-gradient`; Badge has NO semantic variants (token/classes like the iana-badge pattern) | UI lib |
| Icon CTA chrome: ghost button + `AiIcon size={16}` + title/aria-label | `JsonPreviewEditor.svelte:107` |

## Anomalies / gaps / short-circuits (for the create+update extension)

| # | Severity | Issue |
|---|---|---|
| S1 | **short-circuit (pre-existing)** | Create is NOT idempotent: `onConflict:"raise"` → a retried create (partial-flush failure → drain+requeue → next save) hits **409 on rows that already landed** → stuck forever. Fix: flush-layer 409 → refetch → convert to update; or `onConflict:"ignore"` on the POST route. |
| S2 | **short-circuit** | Stale `version` → 409 → drain+requeue retries with the SAME stale version → infinite 409. Fix: on conflict refetch the row (fresh uuid+version) → retry once → else surface conflict notification. |
| G3 | **gap — BE change** | No `key` filter on `/list` → can't fetch row identity for one key. Add `key` to `ListQuerySchema` + `service.list` (one `Filter.eq`) → `fetchTranslationList(module,{key,page_size:25})` returns **all langs' rows in ONE call** (uuid+version+value). |
| G4 | **gap** | `PendingTranslationRow` has no identity → extend `{key, language, value, uuid?, version?}`; flush splits update (uuid) vs create. Sheet emits only dirty langs (draft ≠ server value). |
| G5 | **gap/short-circuit** | Owner-less global queue — a leftover sheet queues rows that flush inside an UNRELATED page's save → cross-owner contamination/orphans. For universal reuse: owner-scoped drain OR a shared `flushPendingTranslations()` helper every host calls (still manual wiring). |
| G6 | **gap** | The drain→create→requeue loop lives inline in `EntityDictPage` — not reusable → extract shared flush helper owning the create/update split + conflict policy (S1/S2). |
| G7 | **contract** | `translation.update.single` is a DISTINCT permission — a creator may not update → sheet must render saved rows readonly when the perm is absent (read perms from auth store like `can_update` today). |
| G8 | **UI states** | New shadow state needed: `saved-untouched` (Saved ✓) vs `saved-edited` (**Modified** — new badge, proposed info-sky) vs `missing` (Missing ?). Empty edit on existing = ignored — **no delete through this surface** (non-CRUD holds). |
| G9 | **boundary (accepted)** | Entity write + translations are sequential HTTP calls — not atomic; progressive commit already exists (entity first → translations never attempted on entity failure → consistent). |
| G10 | **reuse boundary** | `TranslationKeyCell` is dict-coupled (`dict-cell-*` testids, `entities.<entity>.rows.<code>` suggestion, display_field binding). Reuse needs prop-generalization (suggestion pattern, allowed ns, testid prefix). The sheet itself is already generic (`i18n_key` only). |

## Architecture proposal (to confirm)

- **Flush path**: translations ALWAYS go via the dedicated gateway routes
  (`/entities/translation`), never the `{entity,translations}` envelope —
  one shared `flushPendingTranslations()` helper owns: drain → per-row
  create/update split (uuid present?) → 409 refetch-convert → requeue on
  failure. Hosts call it from their save + `clearPendingTranslations()` on
  destroy (same contract as today, but shared code).
- **Sheet read model**: on mount ONE `fetchTranslationList(module,{key})`
  call (needs the `key` filter, G3) → `existing: Record<lang,{uuid,version,value}>`;
  textarea binds `draft[lang] ?? existing[lang]?.value`; dirty = differs.
- **PendingRow**: `{key,language,value,uuid?,version?}` — store shape
  unchanged (`Map<key, Record<lang, PendingRow>>` grows fields).
- **Owner scoping (G5)**: open question — simplest is keeping the global
  queue but tagging entries with an `owner` token (host id) so the flush
  drains only its own rows. Decision needed.

## Anatomy (content stack — toolbar strip removed)

```
HEAD    [Languages] Translations            [4/7 ✓] [it?][fr?] [X]
        ─────────────────────────────────────────────
LINE 1  [badge: crm.entities.customer_type.rows.private]   (colored segments)
LINE 2  TextArea EN — read-only preview of the base value
        header row: [Base] (info badge) ............ [copy]
LINE 3  [language combobox]
LINE 4  TextArea — selected language (editable — saved rows included when
        the user holds translation.update.single; readonly otherwise)
        header row: [flag + lang label] [Saved ✓ | Modified | Missing ?]
        trailing overlay: [AiIcon] [copy]   (copy rightmost, AI at its left)
        ── below, outside the textarea ──
        [AI suggestion card: text + accept/reject CTAs]
FOOT    [Genera tutte le mancanti (outline primary)]        [Save]
        results list: [flag lang — text][accept] + [ACCETTA TUTTO]
```

- **LINE 1** — full-path badge, `variant="outline"` + code-badge chrome,
  `title={i18n_key}`, per-segment semantic colors (below).
- **LINE 2** — readonly bordered Textarea; `Base` badge (info/sky) +
  CopyButton. Visible iff `baseValue !== ''` **and** `selectedLang !== baseLang`
  (decision 4 — no echo when you're editing the EN shown).
- **LINE 3** — unchanged lang ComboSelect.
- **LINE 4** — bordered Textarea; `readonly` iff (row saved AND no update
  perm). Status badges: `Saved` emerald+`Check`, `Modified` sky (new),
  `Missing` amber+`CircleHelp`. Trailing overlay top-right: `AiIcon`
  then `CopyButton`.
- **HEAD actions** — `{translated}/{total}` badge + flag chips of the
  missing langs (click → select that lang).
- **FOOT** — outline-primary `Genera tutte le mancanti` + `Save`
  (Save gated on EN — below).

## Behaviors (user-specified + update extension)

| Condition | Result |
|---|---|
| Nothing translated | LINE 2 hidden; selector defaults `en-GB`; EN required — **Save disabled until an EN (en-GB or en-US) value exists** (existing or draft); `*` required affordance |
| EN present or being set | LINE 2 visible (unless selected IS that EN) |
| Selector default | `en-GB` when no EN, else `uiLang` |
| Empty lang selected | editable bordered Textarea |
| Saved lang selected | editable (update perm) or readonly (no perm) + `Saved ✓`; edited → `Modified` |
| Per-textarea AI CTA | suggestion for selected lang (source = EN base, else selected text); card below textarea, accept→fills, reject→dismiss; disabled without source |
| `Genera tutte le mancanti` | fills all missing via Browser Translator → results list + `ACCETTA TUTTO` / per-lang accept; failures shown, never silent |
| Save | emits only dirty langs (uuid+version for updates) → pending queue → owning page save flushes |

## Key badge — color proposal (dot-notation semantics)

| Role | Example | Color |
|---|---|---|
| namespace/schema | `crm` `custom` `system` `app` | `text-sky-600 dark:text-sky-400` |
| vocab marker | `entities` | `text-muted-foreground` |
| entity | `customer_type` | `text-violet-600 dark:text-violet-400` |
| facet | `rows` `fields` `actions` | `text-amber-600 dark:text-amber-400` |
| leaf / code | `private` | `text-foreground font-semibold` |

Non-`entities.*` keys degrade positionally (first=ns, last=leaf, middle=muted);
vocab keywords take accents only when matched.

## New i18n keys (BE-owned → db-meta patch + sign)

To add under `app.common.translations.*`: `generateAll`, `acceptAll`,
`accept`, `reject`, `aiSuggestion`, `missing`, `modified`, `enRequired`,
`translatedOf`. Verify reuse first: `base`, `managed`(Saved?), `generate`,
`generating`, `value`, `aiUnavailable`, `aiSkipped` already seeded.

## E2E strategy (empirical, every step)

- `page.addInitScript` stubs `self.Translator` (deterministic
  `available`/`create → '[MT] '+t`) → full AI surface testable; a second
  stub covers `unavailable`.
- Per-step assertions: badge DOM order + segment colors, LINE 2 matrix,
  Save EN-gate, selector default, editable/readonly split, status badges,
  suggestion accept/reject, results list + accepts, HEAD summary.

## Implementation order

1. BE: `key` filter on `/entities/translation/list` + tests.
2. FE: `PendingTranslationRow` + shared `flushPendingTranslations()` +
   owner-tag decision → migrate `EntityDictPage` flush (no behavior change).
3. Sheet read model → `fetchTranslationList(module,{key})` (uuid+version);
   editable saved rows gated on `translation.update.single`.
4. LINE 1 colored badge + HEAD summary strip.
5. LINE 2 EN preview (Base badge + copy) + visibility rules.
6. LINE 4 status badges + EN-mandatory save gate + selector default.
7. Trailing overlay (AiIcon + copy) + per-language suggestion card.
8. Footer `Genera tutte le mancanti` + results list + accepts.
9. i18n patch + sign + E2E per step.

## Open questions

1. ~~Owner scoping (G5)~~ — RESOLVED: `pending_owner` token, owner-scoped drain.
2. **Conflict UX (S2)**: on a stale-version 409 — silent refetch+retry once
   (proposed) or surface to the user immediately? (still open)
3. ~~`Modified` badge color~~ — RESOLVED: sky/info pill.
4. **TranslationKeyCell generalization (G10)**: in-scope for this round or
   follow-up? (the sheet alone is already generic) — still open.

---

## TURN LOG — V3 anatomy iterations (2026-11-09, all committed)

### Done

- **Multi-lang editor rows**: LINE 3 = two comboboxes — preview picker
  (single, ALL 7 langs — no fixed base language; "Base" badge removed)
  and update-langs multi-select (1..n → one textarea row each). Default
  update set: `en-GB` when no EN exists, else app language.
- **Swap CTA**: ghost icon button between the combos — `ArrowLeftRight`
  in `text-primary` (icon stroke convention, same as `Languages` glyph);
  swaps preview↔update, disabled/greyed unless update holds exactly 1.
- **LINE 2**: left = `missing_none`/"Missing translations:" copy + flag
  chips; right = ratio badge — CircleCheck+emerald at 7/7,
  TriangleAlert+destructive below.
- **Preview surfaces (BOTH)**: disabled-looking box (`bg-muted/50`,
  `text-muted-foreground`, `cursor-not-allowed`, flat border — NOT a
  Textarea: `border-primary-gradient` never switches off); text from
  char 0 of line 1; icon cluster on `float-right` AFTER the text —
  docks right on the text's last line, wraps only when flow requires.
- **Editor row chrome** (inside textarea, pt-9): left = status pill
  (Saved emerald/Modified sky/Draft/Missing amber) + `*` en-required;
  right = AiIcon suggest + Eraser clear + CopyButton + flag.
- **`AiTypingDots`** — extracted the chat-panel's scoped 3-dot CSS into
  `@primebrick/ui`; sheet shows canonical busy anatomy (AiIcon +
  `app.common.translations.generating` + dots + `aiStep` pair/progress
  tail) while `aiBusy`; results render directly — no "here you go".
- **Accept-all gate**: `disabled={aiBusy}` — a race the slowed E2E stub
  exposed (mid-flight click silently accepted a partial result set).
- **Sheet title**: `system.settings.translations.title` → management
  phrasing ("Manage Translations"/"Gestione delle Traduzioni") —
  patch `20261212000000` (first attempt hit `public.translations` —
  `system.*` keys live in `system.translations`, per-schema ownership).
- **Eraser CTA** per editable row (email-input convention), pre-seeded
  `valueRefs` (bind:ref crash fix).
- **i18n patches**: `20261209000000` (missing_none/missing_list),
  `20261210000000` (preview/swap), `20261211000000`+`20261212000000`
  (title). All signed dev-micha-2 + applied.
- **E2E**: `entity-dict-page.spec.ts` 3/3 green covering all of the
  above; svelte-check clean; ui `check-standards` clean.

### Pending (need your go / open decisions)

- **ComboSelect `multiBadge` + `multiSummaryAt`** — moved to its own
  plan: `combo-select-multi-badge-and-summary.md` (TIC done; the "N
  selected" counter never existed — documented there).
- **AI translation context + multi-variant** — RESOLVED via history
  `6b95dc40` + codebase evidence: dedicated seq2seq MT models were
  surveyed (NLLB-200-distilled-600M = canonical but context-blind +
  WebGPU-q8 gibberish bug; Opus-MT per-pair = N models + EN pivot;
  MADLAD-400-3B = too heavy) — **the chosen engine is the instruct SLM
  already loaded** (`granite-4.0-micro` via `ai_assistant_model` config)
  through `useAiAssistant.generateOneOff(system, user, params)` — zero
  extra download, context/glossary/tone ride in the prompt (seq2seq MT
  can't take any). PRECEDENT IN CODE: the JSON-schema assistant's
  `key_picker → generateOneOff → JSON ×7 langs → translations_preview
  card (per-lang approve/narrow) → on_accept_translations →
  addPendingTranslation` — the exact queue the sheet already uses.
  Design to finalize with you:
  * context payload: key-path segments (entity+facet+leaf semantics) +
    entity display_name + sibling same-facet translations as glossary;
  * multi-variant: `{variants:[{text,register}]}` structured output →
    choicebox (regex A/B/C precedent) vs N sampled generations;
  * single `{lang:text}` JSON call for generate-all vs per-lang calls;
  * fallback: tier-0 Browser Translator when model not loaded;
    tier-2 `/api/v1/ai/chat` service LLM later (dep `llm` currently down).
  EMPIRICAL FACTS (dev DB census, ai schema):
  * `onnx-community/granite-4.0-micro-ONNX-web` `q4f16` — ENABLED
    (is_compatible=t, not deleted): 1500MB download / 800MB VRAM,
    temp 0.2, top_p 0.9, max_tokens 1024, rep 1.1, thinking off,
    sliding_window+intent_detection+max_history_turns 6.
  * Already benchmarked: `regex_test_score` (KV reuse 91-94.5%,
    0.6-1.6s/turn, 1 systematic fail) + `guide_react_test_score`;
    cerebellum-listed for regex and json assistants (temp 0.1/max 256).
    Guide uses granite-4.0-h-micro (different hybrid variant).
  * ⚠️ Current `ai_assistant_model` config (ai.config_entries) =
    `onnx-community/Qwen2.5-Coder-3B-Instruct#q4` — a CODE model, not
    the right pick for multilingual UI translation. Translations
    should get their own cerebellum preset
    (`app.smart.translations.ai.cerebellum_name`) — the per-assistant
    tuning mechanism already exists.
  * Language coverage — VERIFIED on the IBM base card
    (`ibm-granite/granite-4.0-micro`): supported languages are
    English, German, Spanish, French, Japanese, Portuguese, Arabic,
    Czech, Italian, Korean, Dutch, Chinese → all 7 target langs
    covered. 3B params, Apache-2.0, instruct + tool-calling.
    Remaining open question is register/label quality on our domain,
    not coverage.
  MODEL DECISION — DEDICATED MT vs INSTRUCT SLM (verified 2026-12):
  * Per-assistant default mechanism CONFIRMED:
    `modelId = sessionSwitch ?? cerebellum.is_default ?? ai_assistant_model
    config` (ai-chat-panel.svelte:236-263). guide/json/regex cerebellums
    all default to `Qwen2.5-Coder-3B-Instruct#q4f16` today. A new
    `app.smart.translations.ai.cerebellum_name` with is_default row =
    the translation feature auto-loads its own model without touching
    the global default. This is the sanctioned extension point.
  * ⚠️ ARCHITECTURE FACT: `src/lib/ai/ai-worker.ts:393` is hardcoded
    `pipeline('text-generation', ...)`. Any seq2seq MT model needs a
    NEW `translation`/`text2text-generation` pipeline path in the
    worker (src_lang/tgt_lang forced-BOS, per-component dtype —
    ai_models.dtype is single-valued, seq2seq wants
    {encoder_model, decoder_model_merged} dtypes).
  * Option A — dedicated MT `Xenova/m2m100_418M` (seq2seq, 100 langs
    incl. all 7): decoder_merged_q4f16 379MB + encoder_q4f16 → ~0.5GB
    total; deterministic text output (no JSON parse); n-best possible
    via num_return_sequences. COSTS: zero context/glossary (text→text),
    new worker pipeline path, per-language calls for generate-all,
    WebGPU untested in-house.
  * Option B — instruct SLM `onnx-community/granite-4.0-micro-ONNX-web`
    q4f16 (enabled+compatible, benchmarked on regex+guide): ~1.5GB,
    context/glossary/register in prompt, `{lang:text}` or
    `{variants:[{text,register}]}` structured output in ONE call,
    worker pipeline 100% reused, translations_preview precedent exists.
  * Option C — REJECTED: `Xenova/nllb-200-distilled-600M` q4f16 ~0.9GB
    — upstream transformers.js issue #1286 + our own history
    (608a5fd4): q8 decoder on WebGPU produces GIBBERISH (WASM fine).
    Would force WASM backend → too slow.
  * Opus-MT per-pair dismissed: N models + EN pivot for 6 targets.
  * DECISION (user, 2026-12): TWO-track architecture —
    - EASY = the current default: browser native `Translator` API
      only. NOT a cerebellum/ai_model/brain concept — just the native
      API. Already implemented; stays the default and the fallback.
    - POWERED = POC phase, explicitly OFF-STANDARD (`fuori standard`):
      `Xenova/m2m100_418M` seq2seq MT, hardcoded constants (model_id,
      per-component dtype, locale→lang-code map), new `translation`
      pipeline branch in `ai-worker.ts`, wired into
      `suggest`/`generateAll`. NO cerebellum/ai_models row yet.
      If the POC works → refactor into the standard: cerebellum
      `app.smart.translations.ai.cerebellum_name` + ai_models row +
      first-class transformers.js translation engine.
      If it fails → granite-4.0-micro instruct SLM remains the shelved
      option B.
    - UX: easy⇄powered toggle inside the sheet so both engines are
      testable on the same field; no global config/default changes.
    - Option A vs B vs C superseded by this two-track decision.
  POC IMPLEMENTED (turn 4, all green):
  * `src/lib/ai/mt-worker.ts` — dedicated POC worker: `pipeline(
    'translation', 'Xenova/m2m100_418M', {dtype:{encoder_model:'q4f16',
    decoder_model_merged:'q4f16'}, device})`; webgpu→wasm retry on load
    failure; minimal load/translate/unload protocol; m2m100 ISO codes
    ('en','it',…) — same `toMtLang` normalization as the easy path.
  * `src/lib/ai/mt-translator.ts` — module singleton lifecycle
    (mtSupported/mtStatus/mtDevice/onMtStatus/mtEnsureLoaded/
    translateMt); same-lang pairs short-circuit verbatim like easy.
  * Panel: `powered` state + per-engine derived `aiSupported`; powered
    branches in `suggestLang`/`generateAll` (results/suggestions reuse
    the same review anatomy); load progress rides `aiStep`.
  * HEADER toggle — ONE for all rows: canonical `ButtonGroup segmented`
    + ghost `icon-sm` buttons + `aria-pressed` (ViewModeToggle anatomy)
    in the `actions` snippet; Globe=easy, Brain=powered, disabled while
    aiBusy; trailing dot mirrors MT status (loading pulse / ready /
    error) with device in title.
  * ENFORCER CORRECTION learned: raw `Switch` is composite-internal
    only (raw-switch: labelled booleans → SwitchField; panel-switch:
    panel mode toggles → ButtonGroup segmented). Initial Switch impl
    was rejected by check-standards and rewritten — documented so the
    same mistake isn't repeated.
  * i18n patches signed+applied: `20261214 powered+powered_hint`,
    `20261215 easy_hint` (×7 each).
  * Verify: svelte-check 0/0, check-standards clean, E2E 3/3 with new
    header pins.
  POC FIELD RESULTS (turn 5):
  * 'private'→IT produced 'priv' in-browser — node probe proved the raw
    model outputs 'privato' correctly → WebGPU seq2seq corruption (NLLB
    bug family). POC pinned to `wasm` device — label texts are short,
    latency a non-issue. BUT even on CPU: 'Rows'→'R', 'Customer types'→
    'Tipo' — seq2seq context-blindness is model-intrinsic.
  * Icons: easy=Cpu, powered=CpuAi (lucide has both). mtEnsureLoaded()
    prefetches in BG on sheet open. Accept icon → ThumbsUp standard
    (GradientIcon check removed).
  MODEL RESEARCH — purpose-built translation + context-capable + <3B:
  * `onnx-community/translategemma-text-4b-it-ONNX` — Google's
    purpose-built TRANSLATION instruct (chat-format → context-capable,
    works on our existing text-generation path: gemma3_text supported
    in vendored 4.3.1). BUT q4f16 ≈2.7GB — BIGGER than granite, not
    smaller. License: Gemma ToU.
  * `Unbabel/Tower-Plus-2B` — ideal profile (2B, MT-specialized
    instruct, all 7 langs incl pt-PT) but NO ONNX web port → custom
    export required, out of POC scope.
  * VERDICT: no purpose-built translation model is both context-
    capable AND smaller than granite. The context+small frontier is
    general multilingual instruct models already cataloged:
    Qwen3-0.6B-ONNX q4f16 570MB (disabled), Qwen2.5-0.5B 512MB
    (disabled), gemma-3-1b-it 763MB (disabled), Qwen3.5-2B q4f16
    1384MB (ENABLED+compatible), granite-4.0-micro 1500MB (enabled,
    benchmarked).
  * DECISION (user): powered POC = **A — onnx-community/Qwen3-0.6B-ONNX
    q4f16** (570MB, instruct, 119 langs, enable_thinking=f in catalog).
    Wired via the SHARED text-generation worker + `useAiAssistant` +
    `generateOneOff` — hardcoded `POWERED_MODEL_ID` constant, still
    off-standard until the cerebellum refactor. The dedicated mt-worker
    (m2m100) becomes DORMANT POC code — kept as the saved context-free
    baseline; its panel wiring was removed.
    SAVED OPTIONS (user has a later idea — do not lose):
    A1) `Unbabel/Tower-Plus-2B` — purpose-built MT-instruct 2B, all 7
        langs incl pt-PT — **NON-ONNX** today: requires a custom
        onnxruntime-genai/optimum export, then publish to a public HF
        repo to ride the same transformers.js path (self-published
        repos work identically — supported arch + onnx/model_<dtype>
        .onnx naming + tokenizer files + ops within onnxruntime-web).
    A2) `onnx-community/translategemma-text-4b-it-ONNX` — purpose-built
        Google translation instruct, q4f16 ~2.7GB, gemma3_text supported.
    A3) `onnx-community/Qwen3.5-2B-ONNX` q4f16 1.4GB — already enabled.
    A4) `onnx-community/granite-4.0-micro-ONNX-web` — proven, 1.5GB.
    A5) m2m100_418M dormant seq2seq baseline (wasm-pinned).
  * Context payload SHIPPED in the POC: system prompt carries
    module/entity/facet/leaf key segments + free-form `meaning` input
    (powered-only UI row, `meaning_hint` key x7 via patch
    20261216000000). Params: temp 0.1, max_new_tokens 128, rep 1.05.
    Powered prefetch = `assistant.init()` on mount; dispose on unmount
    (canonical VRAM release). Status dot remapped mtState→assistant
    state (testid i18n-editor-powered-status).
  FIELD VERDICT 0.6B → 2B (user-caught "eson eson", turn 7):
  * In-browser powered on Qwen3-0.6B produced "eson eson" on
    private→IT+meaning. Node probes (CPU, vendored transformers.js):
    verbose system prompt → echoes the label instead of translating;
    minimal prompt → correct "Privata" but label set still ~50% wrong:
    Rows→"Fili" (threads), Save→"Sapere" (to know), Private→"Presti".
    VERDICT: 0.6B too weak AND prompt-shape-unstable — capability, not
    tuning.
  * Qwen3.5-2B-ONNX q4f16 (~1.4GB, already cataloged, is_compatible=f
    but not deleted) — same probe, compact prompt: 9/9 clean —
    Privato/Privat/Privé/Righe/Salva/Tip di cliente (lieve refuso), and
    the ctx/meaning lines did NOT degrade output. New POC model.
  * Prompt shape switched to the proven COMPACT form: one-line system
    contract + user message carrying instruction, `Key: <i18n_key>`,
    `entity <e>, <facet> facet`, `meaning: <hint>` — the verbose
    rules/context system prompt is dead weight (and broke 0.6B).
  * POWERED_MODEL_ID = onnx-community/Qwen3.5-2B-ONNX, params temp 0.1,
    max_new_tokens 32, rep 1.05. Node probe artifacts live in OS temp
    (probe-qwen06/qwen35-translate.mts — not committed).
  * ANOMALIES REPORTED (not touched): admin-login.ts helper holds
    waitForURL timeout:15000 + waitFor 10000 — >5s violations of the
    documented e2e-browser-session budget, shared across ALL specs;
    sweeping it is a wider blast-radius call. E2E spec itself swept to
    the mandatory 5s budget (11 sites) — 4/4 green.
  SEEDED-EXPRESSION BUG (user-caught, turn 6):
  * `app.common.selected_count` shipped values like
    "{count} {count === 1 ? 'selezionato' : 'selezionati'}" — a JS
    ternary that $t NEVER evaluates (interpolate() covers \{(\w+)\}
    only; there is no "seeded expression contract" — it was invented).
    Rendered literally in it/es/fr/pt. The canonical mechanism already
    existed: `.one`/`.other` key pairs picked IN CODE (schedule-spec
    precedent).
  * FIX shipped: patch 20261217000000 retires `selected_count`, seeds
    `.one`/`.other` x7; combo-select picks the key by
    `selectedValues.length`; ui dist rebuilt.
  * E2E GAP THAT HID IT: the en-GB value was correct — the pin asserted
    "3 selected" and passed while it/es/fr/pt broke. NEW NET: dedicated
    `test.use({ locale: "it-IT" })` describe — real Italian dict, chip
    must show "2 selezionati" and never `{`/`===`. Lesson: any seeded
    value used with params MUST be pinned in a non-EN locale.
  * ANOMALY RESOLVED (user go, destructive): `app.common.changes_pending`
    soft-deleted via patch 20261218000000_changes_pending_dead_key.sql
    (signed + applied). SUPER-SURE evidence before the hit:
    zero call sites across fe-v3/v3-ui/sdk/be-v3/us-v3/core/dal/website;
    only DB hits were the seed patches + snake-cleanup rename; the live
    vocabulary is `system.settings.configurations.changes_pending_*`.
    The camelCase twin `changesPending` was already DB-dead — only
    stale inside the GENERATED en-GB-fallback.json (generated artifact,
    public.translations = single source of truth — never hand-edited).
    Regen via scripts/i18n-fallback.mjs: 360 camelCase keys removed
    (all pre-snake-cleanup names, renamed in DB, zero camelCase refs
    left in FE src), 397 current snake keys added — file now mirrors
    live DB exactly (1034 keys = endpoint = DB count). Side-effect:
    the whole stale camelCase floor got cleaned — legitimate because
    every removed key was provably dead. svelte-check 0/0.
- **Orphaned key `app.common.translations.base`** — no callsite after
  the Base badge removal. Remove via DELETE patch or leave dormant —
  your call.
- **Stale open questions above**: conflict-UX retry policy (S2) and
  TranslationKeyCell generalization (G10) still unanswered.
- Dict-page batch (from i18n plan): TableFooter/i18n keys/
  TranslationKeyCell/save gate/aria/read-only code/bulkRevert.

## Field labels (2026-12-19)

- Three `*_label` keys seeded (patch `20261219000000_translations_field_labels.sql`,
  signed+applied): `preview_label` ("Example translation" / "Traduzione di
  esempio"), `meaning_label` ("Provide a meaning" / "Fornisci un significato"),
  `update_label` ("Translations in the selected languages" — ONE section label
  for the one-time multi-select, "una tantum").
- Panel: each LINE-3 picker sits under a `<Label for>` (ui `Label` component,
  `text-xs text-muted-foreground` matching the LINE-1 key label); ComboSelect
  `id` lands on the `role="combobox"` trigger so the association is real.
  Meaning input got the same anatomy; `meaning_hint` ("…optional") moved to
  the input placeholder — info preserved, no duplicate text.
- Verify: svelte-check 0/0 · check-standards clean · E2E 4/4 (testids unchanged).

## Powered speed — empirical evidence (2026-12-19, real stack)

Measured via NEW committed spec `src/e2e/ai-translation-powered.spec.ts`
(edge-ai project: persistent Edge profile + WebGPU + Cache API). Evidence
persisted to `ai_models.test_scores.translation_test_score` = **4.00**
(rank=4) on `onnx-community/Qwen3.5-2B-ONNX` q4f16.

| Phase | Wall time | Result |
|---|---|---|
| model ready (cold ~1.4GB) | 76.9s | ready |
| suggest en-GB→it-IT "Private" | 30.4s | "Privato" exact |
| suggest en-GB→fr-FR | 25.3s | "Privé" exact |
| suggest en-GB→de-DE | 25.3s | "Privat" exact |

**Verdict**: quality perfect (3/3 gold), speed unacceptable (~25-30s/call
→ generate-all over 6 missing langs ≈ 2.5min). Root cause = the known
`qwen3_5`-arch unsupported-op CPU fallback on WebGPU (prior DB evidence:
~75s+/call at 2B on heavier prompts; our compact prompt lands at ~25s —
same pathology, not a tuning problem). Node-side WASM probes were blind
to this — they run pure CPU.

Spec registered in EDGE_SPECS; re-runnable for future model candidates
(POWERED_MODEL_ID const kept in sync with the panel constant by comment).

### Open options (user's call)
- **WASM pin**: worker accepts `payload.device`; use-ai-assistant does not
  expose it today — small extension needed, then re-probe (pure WASM may
  beat the GPU↔CPU ping-pong but 2B WASM is still ~seconds/call).
- **Model swap**: Qwen3-0.6B has proven 14-21 tps on WebGPU (its own
  e2e_5turn_s1_fixed_v2 scores) but failed label quality ~50%; other
  instruct candidates exist in catalog — re-run THIS spec for A/B.
- **Accept + UX**: keep powered as-is; generation is honest but slow —
  not viable for per-lang click UX.

## Granite 4 — measured + SELECTED (2026-12-19, real stack)

`POWERED_MODEL_ID = onnx-community/granite-4.0-micro-ONNX-web` (q4f16) —
third candidate, A/B via the SAME committed spec. Evidence persisted to
`ai_models.test_scores.translation_test_score` = **4.60** (rank=3.3).

| Phase | Wall time | Result |
|---|---|---|
| model ready (COLD ~5.4GB download+init) | 172.6s | ready |
| suggest en-GB→it-IT "Private" | 10.2s | "Privato" exact |
| suggest en-GB→fr-FR | 5.4s | "Privé" exact |
| suggest en-GB→de-DE | 5.1s | "Privat" exact |

vs Qwen3.5-2B: **3-5× faster per call** at identical 3/3 quality. Node/WASM
probe also 7/7 gold (incl. context+meaning prompts). Subsequent suggests
benefit from warm ONNX session + KV path (regex evidence: 0.6-1.6s/turn on
short prompts, KV reuse 91-94%). generate-all ≈ ~30s for 6 langs — viable.

**Root cause of the two 15-min "stall" runs — NOT the model**: the
"Secure your account" MFA-enforcer modal overlays the page (survives the
DB flag — session-level state); every click beneath it auto-waits forever.
Zero bytes were ever fetched (profile cache contained only Qwen). Fixed
in-spec via the canonical `auth-method-enforcer-dismiss-button` dismissal
(ai-regex-quality pattern) — then load+3 suggests completed in 3.6m.
LESSON: any spec driving UI through an overlay-prone flow must dismiss the
enforcer explicitly; the silent-hang signature = no testids + no cache
growth.

**Custom ONNX (user question, answered)**: transformers.js loads ANY
public HF repo — `model_id` IS the repo id, so a self-converted export
works identically to onnx-community repos. Requirements: architecture
supported by vendored 4.3.1 (granitemoehybrid/qwen3/gemma3_text/m2m100…),
`onnx/model_<dtype>.onnx` naming (+ external `_data` shards under the 2GB
browser ArrayBuffer limit), tokenizer+config files, opset compatible with
onnxruntime-web WebGPU. Export via `optimum-cli export onnx` or
onnxruntime-genai; unsupported archs need a runtime impl, not a DB row.
Public HF publication is license-bound (Tower-Plus is non-commercial).
Non-ONNX alternative still tracked in the decision record.

## Dead trans-key cleanup (2026-12-19 — live soft-delete, user-authorized no-patch)

Deleted (100% proven dead — zero refs in code, DB metadata, specs, docs;
live UPDATE deleted_at, no patch per user instruction, reversible):
- `app.common.translations.ai_skipped` · `app.common.translations.base`
  (the flagged orphan — Base badge removed) ·
  `app.common.translations.generate` (superseded by generate_all) ·
  `app.common.translations.managed` — 4 keys ×7 langs = 28 rows.
- `en-GB-fallback.json` regenerated → 1033 keys (was 1034+3 labels−4 dead).
  Live keys preserved (generate_all, preview_label, …).

### Census state (evidence for future per-family cleanups)
1873 live keys audited (1037 app.* + 836 system.*) across ALL repos +
DB metadata columns (config_entries, ai_models, cerebellum,
service_registry, role_mappings — zero references to any candidate).
Method lessons recorded: (a) `rg -oF` prefix-shadows keys that are
prefixes of others (accept hides accept_all) → quote-bounded matching
required; (b) the generated en-GB-fallback.json must be EXCLUDED from
the consumer corpus — it mirrors the DB and makes every live key look
consumed.

Remaining candidates (~420) sit in DYNAMIC-consumption families — NOT
deleted, not yet 100% sure:
- `app.smart.{regex,json,guide}.ai.*` (~267): `${ns}`-template
  consumption, suffix-level audit per namespace needed.
- `app.common.validation.*` (20): type-driven resolution.
- `app.widgets.*`, `app.health.*`, `app.nav.roots.*`,
  `app.auth.passkeys.transport.*`, `app.widgets.schedule_spec.unit.*`:
  confirmed `${prefix}` templates — alive.
- `system.*` (323): metadata-driven (entity meta, config_entries,
  list.operators.${key}, migrations status enums) — needs per-namespace
  metadata join, almost certainly all consumed.
- Suspicious singles flagged for review: `app.error.title.*` (16 — no
  template prefix found), `app.common.tooltip_title.*` (6),
  `app.user_menu.*` (7), `app.title/subtitle/system`,
  `app.org.{acme,john_doe}` (demo strings),
  `app.common.{prev,next,all,actions,errors,enter_value,no_changes,
  select_row,row_actions}`, `app.errors.{close,error_details}`,
  `app.mcp.consent.*` (3), `app.auth.roles.*` (5),
  `app.collaboration.{you,you_other_tab,editing_field_multi,
  updated_automatically_desc,updated_by_desc}`.

## Field anatomy + meaning hint — 2026-12-20

### Done
- **PrimeField anatomy everywhere**: meaning → `TextInput` (eraser
  structural), preview → disabled `Textarea` under `PrimeField`, update
  rows → `PrimeField` per row. Group label "Traduzioni nelle lingue
  selezionate" rides the FIRST row's label (`*` + WARNING help for the
  EN gate); later rows label-less (flag suffices). Language-name labels
  removed per user instruction.
- **Icon chrome unified**: icon-only controls use
  `inputTrailingIconColorClasses` (16px glyph mandate); CopyButton keeps
  its 28px chrome.
- **Cerebellum wired**: `assistant_key: 'translation'` + live
  `ai_cerebellum` row (granite q4f16, T=0.3, max_tokens 64,
  kv_cache_reuse=false) → `effective_params` → `generateOneOff`.
  `POWERED_PARAMS` constant deleted. T=0.7 measured REGRESSION (score
  2.89, paraphrase + key-bleed) → reverted to 0.3 (4.60, 3/3 gold).
- **Enforcers added** (`check-standards`, FE profile): `panel-raw-label`
  extended to `<Label>`; `panel-chrome-class` (class= carries layout
  only on stock components — 31 findings, open policy question on
  mini-badge/mini-button vocabulary); `panel-raw-input` (bare `<Input>`
  in panels → TextInput/SearchInput; caught DocsPanel hand-rolled
  search).
- **E2E hardened**: all interactions 5s-bounded; WebGPU gate moved
  AFTER page-render proof (cold-session requestAdapter could hang or
  crash the renderer → blank page); `dict-toolbar-add` mount poll 45s;
  meaning pin uses a never-suggested lang (stale-read trap: mounted
  suggestion box returns old text at 0.5s).
- **Status dot title** now shows `loading · downloading|vram` — warm
  load measured: ~5s Cache-API replay + ~11s ONNX session init (~16s
  total, NOT a re-download; user confirmed keep-as-is).

### ⏸️ STAND-BY — meaning hint (open question, user-parked 2026-12-20)
**Question**: does the free-form `meaning` provide REAL context to the
model, or is it dead weight? User's own tests don't show it working.

**Evidence collected** (node probes, granite q4f16 T=0.3):
- Meaning as side-context (`Key:… · meaning:…`) in the translate-label
  prompt → IGNORED or worse (one run translated the whole prompt).
- Reframed prompt "label is ambiguous, write the target label for its
  intended meaning" → meaning DRIVES output 8/8 in probes
  ("Public Administration" + "sports association" → "Associazione
  Sportiva Non Statale"; E2E real-stack es-ES "Private"+person →
  "Persona").
- Panel ships the reframed two-shape prompt (meaning present → reframe;
  absent → current translate-label shape).
- **Unresolved**: whether the reframed meaning output is what users
  WANT (it translates the meaning phrase, not a disambiguated label),
  and whether real-world usage shows benefit. Parked pending more
  real usage evidence / a discriminating test set.
