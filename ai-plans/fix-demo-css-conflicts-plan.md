# Fix Plan: Demo Pages CSS Conflicts (v3.9.0 hotfix)

## Problem

The demo pages (`/en/demo/` and `/en/demo/shell`) are visually broken because the
prototype CSS files (`demo.css` and `shell.css`) were copied verbatim into the Astro
website. They contain **global selectors** that override the website's Tailwind design
system:

| Conflict | File | Lines | Impact |
|----------|------|-------|--------|
| `* { margin:0; padding:0; box-sizing:border-box }` | demo.css | 76 | Destroys ALL Tailwind preflight/base |
| `body { font-family: 'Inter Variable'... }` | demo.css | 78-83 | Overrides website font |
| `:root { --background, --foreground... }` | demo.css | 7-41 | Injects light-theme HSL tokens globally |
| `.dark { ... }` | demo.css | 44-73 | Unused dark-theme tokens |
| `html { ... }` | demo.css | 77 | Global html styles |
| `.site-nav { position:fixed; top:0; z-index:100 }` | demo.css | 88-112 | Prototype nav styles (unused but loaded) |
| `.site-footer { ... }` | demo.css | 114-118 | Prototype footer styles (unused but loaded) |
| `.ambient-blob { position:fixed }` | demo.css | 121-126 | Conflicts with website's ambient gradient |
| `:root { --pb-* }` | shell.css | 2-20 | Injects light-theme --pb-* tokens globally |
| `.demo-body { font-family: var(--pb-font) }` | shell.css | 23-29 | Overrides website font |
| `.demo-title-bar { position:fixed; top:0; z-index:100 }` | shell.css | 32-39 | Covers the website nav (z-50) |
| `.demo-scroll-hint { position:fixed; top:140px }` | shell.css | 49-56 | Overlaps nav area |
| `.ambient-blob { position:fixed }` | shell.css | 63-68 | Duplicate ambient blobs |
| `.demo-footer { ... }` | shell.css | 807-810 | Prototype footer (unused but loaded) |

## Website nav stack (for positioning reference)

```
TopBanner  — sticky top-0 z-60  (~40px tall)
Nav        — sticky top-9 z-50  (~64px tall, py-4)
─────────────────────────────────────────
Total nav stack height: ~104px (top-9 = 2.25rem = 36px offset + ~64px nav)
```

The `.demo-title-bar` at `position:fixed; top:0; z-index:100` covers ALL of this.

## Fix strategy

**Scope all demo CSS to a wrapper class** (`.demo-scope`) so it cannot leak to the
website's nav, footer, or any other element. Strip every global selector.

### 1. demo.css — strip globals, keep demo-specific styles

**Remove entirely:**
- Lines 1-83: `:root` tokens, `.dark` tokens, `*` reset, `html` styles, `body` styles
- Lines 85-126: `.site-nav`, `.site-footer`, `.ambient-blob`, `.blob-1`, `.blob-2`
  (all prototype shell styles — replaced by website nav/footer/ambient)

**Keep as-is (demo-specific, no global conflicts):**
- Lines 128-190: `.hub-hero`, `.hub-badge`, `.hub-title`, `.hub-subtitle`,
  `.hub-cards`, `.hub-card`, `.hub-card.preview` — hub page styles with hardcoded
  colors, no global selectors
- Lines 192+: `.scroll-track`, `.scroll-stage`, `.scene-dot`, etc. — scroll-jacking
  styles (only loaded on pages that use them)

**Add:**
- `.hub-card.coming-soon` style — opacity, cursor, disabled state for the 8
  unported demo cards

### 2. shell.css — strip globals, scope tokens, reposition title bar

**Remove entirely:**
- Lines 1-20: `:root { --pb-* }` → move tokens to `.demo-scope` selector
- Lines 22-29: `.demo-body` (font-family override — website body already styled)
- Lines 62-68: `.ambient-blob`, `.blob-1`, `.blob-2` (duplicate ambient)
- Lines 806-810: `.demo-footer` (prototype footer — use website footer)

**Fix:**
- Lines 32-39: `.demo-title-bar` — change from `position:fixed; top:0; z-index:100`
  to `position:sticky; top:104px; z-index:30` (sits below the website nav stack)
- Lines 49-56: `.demo-scroll-hint` — change `top:140px` to `top:180px` (below the
  repositioned title bar)

**Scope:**
- Add `.demo-scope { --pb-sidebar: #f8fafc; --pb-bg: #ffffff; ... }` at the top,
  replacing the `:root` block. All `var(--pb-*)` references inside the demo content
  will resolve from this scoped selector.

**Keep as-is:**
- All `.screen-mock`, `.pb-sidebar`, `.pb-header`, `.sb-*`, `.ann-*`, `.conn-*`,
  `.scroll-track`, `.scroll-stage`, `.scroll-canvas`, `.section-claim*` styles —
  these are all demo-specific classes that don't conflict with Tailwind

### 3. shell.astro — remove duplicates, wrap content, fix body class

**Changes:**
- `<body class="demo-body">` → `<body class="min-h-screen bg-slate-950 text-slate-100 antialiased">`
  (match website's body class)
- Remove `<div class="ambient-blob blob-1"></div>` and `<div class="ambient-blob blob-2"></div>`
  (website already has ambient gradient background)
- Wrap ALL demo content (from `.demo-title-bar` through the end of `.scroll-track`)
  in `<div class="demo-scope">` ... `</div>` — this scopes the `--pb-*` tokens
- Remove `<footer class="demo-footer">...</footer>` (website footer already present)

### 4. index.astro (demo hub) — remove duplicate ambient blobs

**Changes:**
- Remove `<div class="ambient-blob blob-1"></div>` and `<div class="ambient-blob blob-2"></div>`
  (website already has ambient gradient background)
- No other changes needed — the hub page already uses the website's body class,
  nav, and footer. The `.hub-*` styles in demo.css use hardcoded colors and don't
  conflict with Tailwind.

### 5. No changes needed to:
- `VirtualTourMegaMenu.svelte` — component is scoped, works correctly
- `translations.ts` — translations are correct
- `icons.ts`, `scroll.ts`, `shell-scroll.ts` — scripts work correctly
- `public/_redirects` — redirects work correctly
- 3 existing pages (index/contact/thank-you) — nav edits are correct

## Verification

1. `pnpm run build` — must succeed with 0 errors
2. Playwright test at https://primebrick.dev:
   - `/en/demo/` — website nav visible, hub cards visible, no layout breakage
   - `/en/demo/shell` — website nav visible, demo-title-bar BELOW nav (not covering it),
     scroll-jacking works, no console errors
   - Home page (`/en/`) — nav still shows "Virtual Tour" button, no regression
3. Visual check: demo pages should look like they belong to the same site (same
   nav, same font, same ambient background, same footer)

## Release

Hotfix release **v3.9.1** via GitFlow:
- Create `feature/fix-demo-css-conflicts` from `develop`
- Apply fixes, commit, merge to `develop`
- Create `release/3.9.1`, merge to `main`, tag `v3.9.1`, push
- Merge `main` back to `develop`
- Delete branches
