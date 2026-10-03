# Feature: Easter Egg Themes ("mangify" & co.) — Plan

## Objective

Add a global, extensible easter-egg engine to `primebrick-fe-v3`:

1. **Global cheat-code listener** — key sequences typed anywhere in the app
   activate an easter egg. Guarded so it never fires while the user is typing
   in an input/textarea/contenteditable.
2. **Monothematic themes** — each code unlocks a theme that is *what it is*
   (no light/dark variant). Themes override the base CSS custom properties,
   may load custom fonts and extra CSS/JS, and **everything loads lazily —
   only when the egg is activated**.
3. **First egg: `mangify`** — swaps the login hero images (and later error
   page illustrations) with manga/comic-style images + punchy manga copy
   (speech bubbles, onomatopoeia). Comic imagery is user-generated; the
   mechanism ships with placeholders.
4. **Console command** — `mangify()` in DevTools console toggles the egg;
   `unmangify()` / `easteregg.reset()` restores. A styled console hint is
   printed once per session.

The user will describe the 3 starting themes later; this plan builds the
engine so a theme is a *registration entry*, not new plumbing.

---

## Current state (verified)

- SvelteKit + Svelte 5 (runes), Tailwind v4, tokens in `src/app.css`:
  `:root { --background: … }` and `.dark { … }` inside `@layer base`
  (lines ~622-740). Colors consumed via `--color-*: hsl(var(--*))` in `@theme`.
- Light/dark toggle: `ThemeToggle.svelte` writes `pb.theme` to localStorage
  and toggles `.dark` on `<html>`; `app.html` has a pre-paint script reading
  `pb.theme` (lines 10-21).
- Root layout `src/routes/+layout.svelte` is minimal — `onMount` calls
  `loadAuthConfig()` + `registerRegexAiSw()`. **Best host for the global
  keydown listener.**
- Login hero: `src/routes/login/+page.svelte` lines 43-67 — `heroes` array
  of 4 `{ image, quote, author }` Unsplash entries, random index on mount,
  `{#key currentHero.image}` swap with opacity transition. Quote rendered in
  a `<blockquote>` (lines 147-156).
- Error pages: `src/routes/+error.svelte` → `ErrorPage.svelte`
  (`src/lib/components/error-page/`). Currently **no hero image** — manga
  version can add an illustration slot.
- Fonts: `@fontsource-variable/inter` imported in `app.css` (line 6).
- Lazy-loading precedent exists: Smart components dynamic-`import()` engines
  (SmartRegexInput pattern in AGENTS.md).
- Composable convention (MANDATORY): single `_state` object, getters,
  mutators — see AGENTS.md "Composable state exposure pattern".
- i18n rule: BE owns translations; FE fallback English-only `app.*` keys.
  Easter-egg copy stays **inside the theme module** (not product copy) —
  acceptable, flagged here explicitly.

---

## Architecture

```
src/lib/easter-eggs/
├── registry.ts                    # code → theme manifest (data only)
├── easter-egg-store.svelte.ts     # runes store: active egg, persistence
├── key-sequence-listener.ts       # global keydown matcher + input guard
├── console-commands.ts            # window.mangify() + styled hint
├── themes/
│   ├── manga/
│   │   ├── index.ts               # manifest + activate()/deactivate()
│   │   ├── theme.css              # token overrides (lazy-imported)
│   │   ├── heroes.ts              # manga hero data (images + copy)
│   │   └── MangaBubble.svelte     # speech bubble / onomatopoeia overlay
│   ├── theme-b/
│   └── theme-c/
static/
└── easter-eggs/
    └── manga/                     # user-generated comic images
        ├── hero-1.webp … hero-4.webp
        └── error-page.webp
```

### 1. Registry — `registry.ts`

```ts
export interface EasterEggTheme {
  id: string;                    // 'manga'
  /** key sequence, e.g. ['m','a','n','g','i','f','y'] or Konami arrows */
  sequence: string[];
  console_command?: string;      // 'mangify'
  /** lazy loader — called exactly once on first activation */
  load: () => Promise<EasterEggThemeModule>;
}

export interface EasterEggThemeModule {
  activate: () => void | Promise<void>;
  deactivate: () => void;
}

export const EASTER_EGGS: EasterEggTheme[] = [
  {
    id: 'manga',
    sequence: ['m', 'a', 'n', 'g', 'i', 'f', 'y'],
    console_command: 'mangify',
    load: () => import('./themes/manga'),
  },
  // theme-b, theme-c — one entry each once defined
];
```

DRY: adding a theme = one registry entry + one folder. No engine changes.

### 2. Store — `easter-egg-store.svelte.ts`

Follows the mandatory composable pattern. State shape (snake_case per
data-model-conventions):

```ts
const STORAGE_KEY = 'pb.easter_egg';

const _state = $state({
  active_id: null as string | null,
  loaded_ids: [] as string[],
});
```

Mutators: `activate(id)`, `deactivate()`, `reset()`. Getter:
`get active_id()`, `get is_active(id)`.

- Persistence: `localStorage['pb.easter_egg'] = id`. On boot, if a saved id
  exists → `load()` + `activate()` (assets fetch lazily here too).
- `activate` sets `document.documentElement.dataset.pbTheme = id` **and
  removes `.dark`** (themes are monothematic — they set `color-scheme`
  themselves). `deactivate` removes the attribute and restores `.dark` from
  `pb.theme` + `prefers-color-scheme` (same logic as `ThemeToggle.apply`).
- **ThemeToggle interaction**: while an egg is active, `ThemeToggle` is a
  no-op (guard: `if (document.documentElement.dataset.pbTheme) return`) or
  visually hidden — decide in review. Restoring `.dark` on deactivate reuses
  the existing toggle logic, no duplication.

### 3. Key listener — `key-sequence-listener.ts`

Mounted once from root `+layout.svelte` `onMount` (returns cleanup).

```ts
const IGNORED = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return IGNORED.has(el.tagName) || el.isContentEditable ||
         el.getAttribute('role') === 'textbox';
}
```

- Maintains a rolling buffer (`max(sequence.length)` across registry) of
  `e.key.toLowerCase()`; ignores modifier keys, `e.ctrlKey/altKey/metaKey`
  combos (so Ctrl+B etc. never advances a sequence).
- On buffer-suffix match → `activate(id)`, clear buffer, show a small
  styled `console.log` (and optionally a `pushNotification` NONE-impact
  toast? — open question, see below).
- SSR-safe: only attached in `onMount` (browser).

### 4. Console commands — `console-commands.ts`

```ts
window.mangify = () => easterEggs.activate('manga');
window.unmangify = () => easterEggs.deactivate();
```

Plus a once-per-session hint:

```ts
console.log('%cBrick by brick… try mangify()', 'color:#0ea5e9;font-weight:bold');
```

Printed from the same onMount (guarded `import.meta.env.DEV`? — decide:
keeping it in prod is the point of an easter egg; recommend prod too).

### 5. Theme module contract — `themes/manga/index.ts`

```ts
export async function activate() {
  await import('./theme.css');          // Vite code-splits → lazy <link>
  // font loading via FontFace / fontsource css inside theme.css
  document.documentElement.dataset.pbTheme = 'manga';
  document.documentElement.classList.remove('dark');
}
export function deactivate() {
  delete document.documentElement.dataset.pbTheme;
  // restore dark/light from pb.theme (shared helper with ThemeToggle)
}
```

- **`theme.css`** — `html[data-pb-theme='manga'] { --background: …; --primary: …;
  --font-sans: 'Comic …'; color-scheme: dark; }` overriding every token in
  the `:root`/`.dark` blocks that the theme wants to own. Because Tailwind
  colors resolve via `var(--*)`, all components re-theme automatically —
  zero component edits for colors.
- **Fonts**: `@font-face` in `theme.css` pointing at
  `static/easter-eggs/manga/fonts/*.woff2` (self-hosted, consistent with
  fontsource approach) — downloads only when the CSS loads. No font in the
  base bundle.
- **DRY**: the `.dark`-restore helper gets extracted into a shared
  `src/lib/theme/dark-mode.ts` used by both `ThemeToggle.svelte` and egg
  modules (removes the existing duplication between `app.html` inline script
  and ThemeToggle — keep `app.html` inline as-is since it must run
  pre-paint; add `pb.easter_egg` read there too so an active theme survives
  reload without flash: if saved egg → set `data-pb-theme` early, actual
  CSS arrives when module loads — accepted minor FOUC, or add tiny
  `data-pb-theme` gate… flag as implementation detail to tune).

### 6. mangify — login heroes

- `heroes` array in `login/+page.svelte` becomes theme-aware:

```ts
const heroes = $derived(
  easterEggs.active_id === 'manga' ? MANGA_HEROES : DEFAULT_HEROES
);
```

- `MANGA_HEROES` lives in `themes/manga/heroes.ts`: same 4 value-prop
  situations, `{ image: '/easter-eggs/manga/hero-N.webp', quote, sfx }`
  where `sfx` is the onomatopoeia string ("BRICK!", "ZOOM!", …).
- Manga copy rendered by `MangaBubble.svelte`: jagged-edged speech bubble
  (SVG/CSS `clip-path`), rotated sfx burst, comic font — replaces the
  `<blockquote>` only when manga theme active (`{#if}` branch, keeps the
  default DOM untouched).
- **Images**: user generates 4 comic panels → drops them in
  `static/easter-eggs/manga/`. Contract: `hero-1..4.webp`, ~1200×1600
  portrait (object-cover), ≤300KB each. Placeholders: 4 `.webp` stubs or
  reuse existing photos with a CSS halftone filter until real art arrives —
  placeholder decision deferred to user.

### 7. mangify — error pages

`ErrorPage.svelte`: when manga active, render
`/easter-eggs/manga/error-page.webp` illustration + sfx bubble above the
status card. Same conditional pattern, one small block.

### 8. data-testid

New interactive/adventitious elements get testids per convention:
`easter-egg-manga-hero`, `easter-egg-manga-bubble` (registry update in
`docs/ai/e2e-testid-convention.md` if needed).

---

## Impacted files

| File | Change |
|---|---|
| `src/routes/+layout.svelte` | mount key listener + console commands in `onMount` |
| `src/lib/easter-eggs/**` | NEW — engine + manga theme |
| `src/lib/theme/dark-mode.ts` | NEW — shared `.dark` apply/restore (DRY with ThemeToggle) |
| `src/lib/components/ThemeToggle.svelte` | use shared helper; no-op while egg active |
| `src/app.html` | pre-paint script also honors `pb.easter_egg` |
| `src/routes/login/+page.svelte` | theme-aware heroes + MangaBubble branch |
| `src/lib/components/error-page/ErrorPage.svelte` | optional manga illustration |
| `static/easter-eggs/manga/**` | NEW — art + fonts (user-provided art) |
| `package.json` | possibly a comic fontsource pkg — pinned exact version, verify via `pnpm view` |

No BE changes. No new product dependencies strictly required (font can be
self-hosted asset).

## Verification

- `pnpm run check` clean; no `state_referenced_locally` warnings.
- Manual: type `mangify` on any page → theme applies, no reload; refresh →
  persists; `unmangify()` → previous light/dark restored.
- Guard test: typing "mangify" into login email input does NOT trigger.
- Network tab: theme CSS/font/image requests appear only after activation.
- Dev server per rule: check :5173 first; reuse running instance.

## Acceptance criteria

1. `mangify` sequence or `mangify()` console call activates manga theme
   app-wide without reload; survives refresh; `unmangify()` reverts.
2. Listener never fires while typing in inputs/textareas/contenteditable.
3. Zero theme assets in the initial bundle (verify via build output /
   network).
4. Adding theme-b/theme-c requires only: new folder + one registry entry.
5. Light/dark toggle behaves normally when no egg is active.
6. Login heroes and error page show manga art + copy only while active.

## Open questions for the user

1. **Toast on activation?** A subtle `pushNotification` NONE-impact toast
   ("Manga mode on!") or keep it silent/console-only for secrecy?
2. **ThemeToggle while egg active**: disable, hide, or make it exit the
   theme back to normal?
3. **Placeholder art**: ship CSS-filtered versions of current Unsplash
   photos as placeholders, or wait for real generated images?
4. **Console hint in production**: print the "try mangify()" teaser in prod
   builds too, or dev only?
5. Sequences for theme-b/theme-c — to be provided with the theme briefs.
