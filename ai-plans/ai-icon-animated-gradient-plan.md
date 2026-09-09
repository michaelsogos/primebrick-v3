# Plan: Reusable Animated Gradient AI Icon + Dynamic AI Assistant Title

## Objective

Create a standard reusable AI icon component based on Lucide's `sparkles` SVG with an animated shimmer-sweep gradient stroke. Replace the brain icon in the Smart Regex Input CTA and sheet panel header. Introduce a reusable title pattern where "AI Assistant" has a static gradient text color and the topic (e.g. "Regex") is plain — establishing a standard for future AI assistant verticals.

---

## 1. New CSS utilities in `src/app.css`

### 1a. Animated gradient stroke for SVG icons

Add a CSS class `ai-icon-gradient-stroke` that applies an SVG gradient as the stroke color with a shimmer sweep animation.

**Approach:** Since Lucide icons use `stroke="currentColor"` by default, we cannot use a CSS `linear-gradient` directly on `stroke`. Instead, we define an SVG `<linearGradient>` inside the component and reference it via `stroke="url(#ai-gradient)"`. The shimmer is achieved by animating the gradient's `x1`/`x2` or `gradientTransform` via CSS animation on the `<linearGradient>` element (CSS animations on SVG gradient stops/transforms are supported in modern browsers).

**New keyframe + utility in `src/app.css`:**

```css
/* ─── AI icon shimmer sweep ─── */
@keyframes ai-shimmer-sweep {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

The actual gradient definition and animation will be inline SVG inside the component (see step 2), because each component instance needs its own gradient ID to avoid collisions. The keyframe will be in `app.css` for reusability.

### 1b. Static gradient text for "AI Assistant" prefix

The existing `text-primary-gradient` utility (lines 202-207) already does this:

```css
@utility text-primary-gradient {
  background: linear-gradient(to bottom right, #38bdf8, #818cf8);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

No new CSS needed — reuse `text-primary-gradient` for the "AI Assistant" text.

---

## 2. New component: `src/lib/components/ui/ai-icon/`

### Files to create:

```
src/lib/components/ui/ai-icon/
├── ai-icon.svelte       # The reusable icon component
└── index.ts             # Re-export
```

### `ai-icon.svelte` — component spec

**Props (snake_case per data-model-conventions):**

```ts
interface $$Props {
  /** Icon size in pixels (passed to Lucide size prop). */
  size?: number;           // default: 24
  /** Stroke width (passed to Lucide strokeWidth prop). */
  stroke_width?: number;   // default: 2
  /** Additional CSS classes. */
  class?: string;
  /** Disable the shimmer animation (static gradient stroke only). */
  no_animation?: boolean;  // default: false
}
```

**Implementation:**

The component renders the sparkles SVG inline (not via Lucide's `Icon` wrapper, because we need to inject a gradient definition and set `stroke="url(#...)"`). It uses the same SVG path data as Lucide's sparkles icon:

```
path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
path d="M20 2v4"
path d="M22 4h-4"
circle cx="4" cy="20" r="2"
```

**SVG structure:**

```svelte
<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="url(#{gradient_id})"
  stroke-width={stroke_width}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={cn('lucide-icon lucide lucide-sparkles', className)}
  aria-hidden="true"
>
  <defs>
    <linearGradient id={gradient_id} x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#38bdf8" />
      {#if !no_animation}
      <animate
        attributeName="x1"
        values="-50%;100%"
        dur="2s"
        repeatCount="indefinite"
      />
      <animate
        attributeName="x2"
        values="50%;150%"
        dur="2s"
        repeatCount="indefinite"
      />
      {/if}
    </linearGradient>
  </defs>
  <!-- sparkles paths -->
</svg>
```

**Gradient ID uniqueness:** Use a module-level counter or `crypto.randomUUID()` truncated to ensure unique IDs when multiple instances are on the same page.

**Shimmer mechanism:** The `<animate>` SMIL elements shift the gradient's `x1`/`x2` coordinates, creating a shimmer sweep across the stroke. SMIL is well-supported in Chromium/Firefox/Safari. This is simpler and more reliable than CSS animation on SVG gradient attributes.

### `index.ts`

```ts
export { default as AiIcon } from './ai-icon.svelte';
```

---

## 3. New translation keys

### 3a. Reusable prefix key (for all future AI assistant verticals)

| Key | en-GB | it-IT | fr-FR | es-ES | de-DE | pt-PT |
|-----|-------|-------|-------|-------|-------|-------|
| `app.common.ai.assistant_prefix` | `AI Assistant` | `Assistente AI` | `Assistant IA` | `Asistente IA` | `KI-Assistent` | `Assistente IA` |

### 3b. Topic key for regex

| Key | en-GB | it-IT | fr-FR | es-ES | de-DE | pt-PT |
|-----|-------|-------|-------|-------|-------|-------|
| `app.smart.regex.ai.topic` | `Regex` | `Regex` | `Regex` | `Regex` | `Regex` | `Regex` |

### 3c. Update existing keys

- `app.smart.regex.ai.brainCta` → keep as is ("AI assistant" / "Assistente AI") — this is the tooltip for the CTA button, no change needed.

### 3d. Deprecate old key

- `app.smart.regex.ai.title` ("AI Regex Assistant") — will be replaced by the prefix + topic composition. Keep the key in the DB for backward compat but stop using it in the component.

---

## 4. Update `src/lib/components/ui/smart-regex-input/smart-regex-input.svelte`

### 4a. Replace Brain import with AiIcon

**Line 19:** Remove `import Brain from '@lucide/svelte/icons/brain';`
**Add:** `import { AiIcon } from '$lib/components/ui/ai-icon';`

### 4b. Replace Brain usage in CTA

**Line 183:** Replace `<Brain class="size-4" />` with `<AiIcon size={16} />`

The CTA button keeps its existing classes, `data-testid`, `title`, `aria-label`.

---

## 5. Update `src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte`

### 5a. Replace Brain import with AiIcon

**Line 37:** Remove `import Brain from '@lucide/svelte/icons/brain';`
**Add:** `import { AiIcon } from '$lib/components/ui/ai-icon';`

### 5b. Update sheet header title

**Lines 195-200:** Replace the `headerTitle` snippet:

```svelte
{#snippet headerTitle()}
  <div class="flex items-center gap-2">
    <AiIcon size={16} />
    <span class="text-primary-gradient font-semibold">{$t('app.common.ai.assistant_prefix')}</span>
    <span>{$t('app.smart.regex.ai.topic')}</span>
  </div>
{/snippet}
```

- `text-primary-gradient` applies the static sky→indigo gradient to "AI Assistant" / "Assistente AI"
- `font-semibold` emphasizes the AI prefix
- "Regex" stays plain (no gradient, no bold)

### 5c. Replace Brain in WebGPU error state

**Line 226:** Replace `<Brain class="size-8 text-muted-foreground ai-icon-pulse" />` with `<AiIcon size={32} no_animation />` — the error state uses a static gradient (no shimmer) + keep the existing `ai-icon-pulse` class via the `class` prop.

Actually, since AiIcon takes a `class` prop:
```svelte
<AiIcon size={32} no_animation class="ai-icon-pulse" />
```

### 5d. Keep other Brain uses as-is

- Line 233: `BrainCircuit` (loading model state) — keep as-is, it's a different icon
- Line 347: `Brain` in breakdown section — this is a different context (breakdown icon, not the AI assistant icon). **Replace with AiIcon** for consistency: `<AiIcon size={16} />`

---

## 6. Update `en-GB-fallback.json`

Add the two new keys:

```json
"app.common.ai.assistant_prefix": "AI Assistant",
"app.smart.regex.ai.topic": "Regex",
```

---

## 7. Database translations (fire-and-forget + seed patches)

### 7a. Fire-and-forget SQL

Create `db-meta/fire-and-forget/add_ai_assistant_translations.sql` with:

- `app.common.ai.assistant_prefix` × 6 languages (6 INSERTs)
- `app.smart.regex.ai.topic` × 6 languages (6 INSERTs)
- Total: 12 INSERTs

### 7b. Apply to live DB + invalidate Redis

### 7c. Seed patches

Add the 2 new keys to all 6 seed patches + create 6 SHA256 fire-and-forget scripts.

---

## 8. Files impacted

| File | Change |
|------|--------|
| `src/app.css` | Add `ai-shimmer-sweep` keyframe |
| `src/lib/components/ui/ai-icon/ai-icon.svelte` | **NEW** — reusable animated gradient sparkles icon |
| `src/lib/components/ui/ai-icon/index.ts` | **NEW** — re-export |
| `src/lib/components/ui/smart-regex-input/smart-regex-input.svelte` | Replace Brain → AiIcon in CTA |
| `src/lib/components/ui/smart-regex-input/regex-ai-chat-panel.svelte` | Replace Brain → AiIcon in header + error state; update title to prefix+topic |
| `src/lib/i18n/messages/en-GB-fallback.json` | Add 2 new translation keys |
| `primebrick-be-v3/db-meta/fire-and-forget/add_ai_assistant_translations.sql` | **NEW** — 12 INSERTs |
| `primebrick-be-v3/db-meta/fire-and-forget/update_seed_translations_sha256_ai_*.sql` | **NEW** — 6 SHA256 update scripts |
| `primebrick-be-v3/db-meta/patches/00000000000001..06_seed_translations_*.sql` | Add 2 keys per language |

---

## 9. Acceptance criteria

1. The sparkles icon renders with a sky→indigo gradient stroke that shimmers continuously
2. The shimmer animation is smooth and infinite
3. `no_animation` prop produces a static gradient stroke (no shimmer)
4. Multiple AiIcon instances on the same page don't collide (unique gradient IDs)
5. The Smart Regex Input CTA shows the animated gradient sparkles icon instead of the brain
6. The sheet panel header shows the animated gradient sparkles icon
7. The sheet title reads "AI Assistant Regex" (en) / "Assistente AI Regex" (it)
8. "AI Assistant" / "Assistente AI" has the static primary gradient text color
9. "Regex" is plain text (no gradient)
10. The WebGPU error state shows a static (non-animated) gradient sparkles icon
11. `svelte-check` passes with 0 errors
12. All existing tests pass
13. Browser verification confirms the visual result
