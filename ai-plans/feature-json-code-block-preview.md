# Feature: JSON preview with syntax highlight, line numbers, copy — config create page

## Context

The `type_config` JSON preview on `/system/settings/configurations/create`
(left column bottom, inside `TypeConfigBuilder`) is a plain `<pre>` with no
highlight, no copy button, no line numbers, capped at `max-h-48` (≈6 rows).

User asks: ≥10 visible rows, Shiki syntax highlight, copy CTA, line numbers —
"like the AI assistant sheet previews".

## Empirical findings

- **Shiki 4.3.1** is already a dependency (package.json, pinned).
- Shiki is used ad-hoc in 2 places, each creating its own highlighter instance
  with the same boilerplate (`createHighlighter({themes:['light-plus'],
  langs:['json']})` + `codeToHtml` + fallback `<pre>`):
  - `src/lib/components/ui/rfc-error-dialog.svelte` (lines 53–78)
  - `src/lib/entity-list/sheets/panels/VersionHistoryPanel.svelte` (lines 53–79)
- **No** existing component renders line numbers or copy CTA for code.
- `CopyButton` exists: `src/lib/components/ui/copy-button/copy-button.svelte`
  (props: `text`, ghost/icon default, animated check feedback).
- Target file: `src/lib/components/config-builder/JsonPreviewEditor.svelte`
  — the read-only `<pre data-testid="tcb-json-preview">` at line 64.
- Both current usages hardcode theme `light-plus` — **dark mode is unhandled**
  (known limitation). Shiki supports dual themes via `codeToHtml(code,
  {themes:{light,dark}})` emitting `--shiki-light/--shiki-dark` CSS vars that
  follow the app's `.dark` class.

## Plan — one reusable `JsonCodeBlock` for ALL JSON display

### 1. Shared highlighter composable — `src/lib/highlight/shiki.svelte.ts`

```ts
let highlighter: Highlighter | null = null;   // module singleton
let pending: Promise<Highlighter> | null = null;
const htmlCache = new Map<string, string>();  // keyed by code string

export async function highlightJson(code: string): Promise<string> {
  const hit = htmlCache.get(code);
  if (hit) return hit;
  pending ??= createHighlighter({ themes: ['light-plus', 'github-dark-default'],
    langs: ['json'] });
  const hl = (highlighter ??= await pending);
  const html = hl.codeToHtml(code, { lang: 'json',
    themes: { light: 'light-plus', dark: 'github-dark-default' } });
  htmlCache.set(code, html);
  return html;
}
```

- Single lazy instance, deduped concurrent loads (`pending`).
- **Module-level html cache keyed by code string** — replaces
  VersionHistoryPanel's per-component `jsonHighlightCache`/`jsonHtmlCache`
  (identical JSON payloads across delta entries share the same html for free).
- Dual themes → spans carry `--shiki-light/--shiki-dark` CSS vars; a `.dark`
  override swaps them (standard shiki dual-theme trick). Fixes the existing
  dark-mode limitation instead of propagating it.

### 2. `JsonCodeBlock.svelte` — `src/lib/components/ui/json-code-block/`

Props: `{ code: string; lineNumbers?: boolean; copyable?: boolean;
minRows?: number; maxHeight?: string; class?: string }`.
Defaults: `lineNumbers=false, copyable=false` — the component is the *minimal*
common denominator; each call site opts in.

- Internally: `highlightJson(code)` in `$effect` → `{@html}` or "Loading…"
  placeholder (absorbs VHP's loading branch) → plain `<pre>` on failure.
- **Line numbers**: CSS counter on shiki's `.line` spans
  (`counter-reset/increment` on `pre` + `.line::before` gutter) — zero JS,
  works with dual themes.
- **Copy**: `CopyButton` absolute top-right in `relative` wrapper when
  `copyable`; copies raw `code`.
- `minRows` → `min-height`; scrollable `overflow-auto` + `maxHeight`.
- testids: `json-code-block`, `json-code-block-copy`.
- Dark-mode CSS: `.dark` overrides for `--shiki-*` vars + transparent bg.

### 3. Rewire all three call sites to `JsonCodeBlock`

| File | Change |
|---|---|
| `JsonPreviewEditor.svelte` | `<JsonCodeBlock code={builder.json} lineNumbers copyable minRows={10} />`; keep collapse toggle + `tcb-json-preview` testid |
| `rfc-error-dialog.svelte` | replace `highlightJson()`/`highlightedJson`/`$effect` with `<JsonCodeBlock code={jsonString} />`; delete local shiki boilerplate |
| `VersionHistoryPanel.svelte` | delete `getShikiHighlighter`/`highlightJson`/`jsonHtmlCache`/`jsonHighlightCache` (~40 lines); both `{@html}`+Loading branches → `<JsonCodeBlock code={…} maxHeight="15rem" />` |

Result: **one** component, **one** highlighter, **one** cache — the three
renderers had diverged only in cosmetics, which are now props.

### 4. i18n

Copy button uses existing `app.common.copy` (already used by CopyButton/tooltips
elsewhere — verify key exists; CopyButton handles its own success animation,
no new keys needed).

## Acceptance criteria

- `/system/settings/configurations/create` → type_config preview shows ≥10
  rows, JSON syntax highlighted (light + dark), line numbers in a gutter,
  copy icon top-right with success feedback.
- `tcb-json-preview` testid preserved; `pnpm check` 0 errors; svelte-autofixer
  clean on touched components.
- No new dependencies (shiki already present; CSS counters for line numbers —
  no `@shikijs/transformers` needed unless already in package.json).

## Out of scope

- Line numbers/highlight for the *editable* raw-JSON Textarea (advanced mode)
  stays a plain textarea.
- Syntax highlight for other languages — component accepts `lang` but only
  `json` is bundled; adding langs later = extend `getJsonHighlighter`.
