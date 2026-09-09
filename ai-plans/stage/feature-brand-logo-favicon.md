# Plan: PrimeBrick Brand Logo & Favicon System

## Objective

Create a unified brand identity system for PrimeBrick across 3 sites (Astro website, FE SvelteKit, Docs Zudoku):
- A hexagon icon (favicon) — flat-top regular hexagon, gradient sky-500→indigo-500 (oblique top-left→bottom-right), "PB" monogram inside
- A text logo — "PrimeBrick" (B uppercase) with gradient
- A full logo — hexagon + "PrimeBrick" text horizontally (hexagon left)

Grafia confirmed: **PrimeBrick** (B maiuscola) ovunque, immagini e testo HTML header.

## Design specs (approved preview)

Source of truth: `D:/git/primebrick/temp/favicon-preview.svg` (approved by user).

- **Hexagon**: regular flat-top, circumradius R=64, viewBox 0 0 128 128
  - Vertices: `128,64 96,8.57 32,8.57 0,64 32,119.43 96,119.43`
- **Gradient**: oblique top-left → bottom-right (`x1=0 y1=0` → `x2=128 y2=128`)
  - Icon (large area): `#0ea5e9` (sky-500) → `#6366f1` (indigo-500) — more saturated to compensate for large area
  - Text logo (small area, matches existing site): `#38bdf8` (sky-400) → `#818cf8` (indigo-400) — matches current index.astro:57
- **Monogram "PB"**: font-weight 700, font-size 62, fill `#0b1220` (slate-950), letter-spacing -2, centered

## Asset inventory to generate

### SVG templates (in workspace, source of truth)
Location: `D:/git/primebrick/primebrick-workspace/assets/logo/`

1. `favicon.svg` — hexagon icon only (the approved preview, copy of temp/favicon-preview.svg)
2. `logo-text-light.svg` — "PrimeBrick" text, gradient sky-500→indigo-500 (for light backgrounds)
3. `logo-text-dark.svg` — "PrimeBrick" text, gradient sky-400→indigo-400 (for dark backgrounds)
4. `logo-full-light.svg` — hexagon + "PrimeBrick" text, light-bg variant
5. `logo-full-dark.svg` — hexagon + "PrimeBrick" text, dark-bg variant

### Raster derivatives (generated from SVGs via sharp)
Formats: WEBP, PNG (256x256, 512x512, 32x32, 16x16), ICO (multi-size for legacy)
Generated into each repo's static/public directory as needed.

## Application per site

### 1. Astro website (`primebrick-v3-website`)

**Favicon** (esagono only):
- Replace `public/favicon.svg` with the approved hexagon icon
- No change needed to `<link rel="icon">` tags (already point to `/favicon.svg`)
  - `src/pages/[lang]/index.astro:35`
  - `src/pages/[lang]/contact.astro:35`

**Header logo** (full logo, esagono + text):
- `src/pages/[lang]/index.astro:56-58` — replace the gradient text span with full logo image
- Current:
  ```html
  <a href={isEn ? '/' : `/${langCode}/`} class="flex items-center gap-2 text-xl font-bold transition-all duration-300" id="nav-logo">
    <span class="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">Primebrick</span>
  </a>
  ```
- New: use `logo-full-dark.svg` image (site is dark-themed) + alt text "PrimeBrick"
- Also update `<title>` line 36: "Primebrick — ..." → "PrimeBrick — ..."

**Contact page**: check `src/pages/[lang]/contact.astro` for any logo/title references, update grafia.

### 2. FE SvelteKit (`primebrick-fe-v3`)

**Favicon** (esagono only):
- Replace `static/favicon.svg` (currently a purple lightning bolt) with the approved hexagon icon
- No change to `src/app.html:5` (already points to `%sveltekit.assets%/favicon.svg`)

**Login page logo** (full logo, esagono + text) — ONLY login page, no app shell logo:
- `src/routes/login/+page.svelte:105-113` (desktop) — replace text avatar + "PrimeBrick" span with full logo image
- `src/routes/login/+page.svelte:160-169` (mobile) — same replacement
- Current uses `Avatar` + `AvatarFallback` with `userAvatarSeed = 'PB'` (line 22) and `avatarChromeFallbackClass`
- New: `<img src="/logo-full-dark.svg" alt="PrimeBrick" class="h-8" />` (or appropriate size)
- The `userAvatarSeed` const and related avatar imports may become unused — clean up if so

### 3. Docs Zudoku (`primebrick-v3-docs`)

**Favicon** (esagono only) — currently NOT configured:
- Add `public/favicon.svg` (the approved hexagon icon)
- Add `metadata` section to `zudoku.config.tsx`:
  ```tsx
  metadata: {
    favicon: "/favicon.svg",
  },
  ```

**Header + Footer logo** (full logo, esagono + text):
- Replace `public/logo-light.svg` with `logo-full-light.svg`
- Replace `public/logo-dark.svg` with `logo-full-dark.svg`
- Update `zudoku.config.tsx:13` alt text: "Primebrick" → "PrimeBrick"
- Update `zudoku.config.tsx:30` alt text: "Primebrick" → "PrimeBrick"
- Config already references `/logo-light.svg` and `/logo-dark.svg` — no path change needed

## Implementation order

1. Create SVG templates in `primebrick-workspace/assets/logo/`
2. Generate raster derivatives (WEBP/PNG/ICO) using sharp in temp dir
3. Copy SVG + raster assets to each repo's static/public dir
4. Apply code changes per site (header markup, favicon links, config)
5. Verify each site visually (dev server or build)
6. Clean up temp files

## Acceptance criteria

- [ ] `primebrick-workspace/assets/logo/` contains 5 SVG templates
- [ ] Astro website: favicon is hexagon icon, header shows full logo, title says "PrimeBrick"
- [ ] FE: favicon is hexagon icon, login page (desktop+mobile) shows full logo image
- [ ] Docs: favicon configured and shows hexagon icon, header+footer show full logo, alt text "PrimeBrick"
- [ ] No "Primebrick" (lowercase b) remains in logo text or titles across the 3 sites
- [ ] All SVGs valid (render correctly in browser)
- [ ] No temp files left in repos

## Files impacted

### primebrick-workspace
- NEW `assets/logo/favicon.svg`
- NEW `assets/logo/logo-text-light.svg`
- NEW `assets/logo/logo-text-dark.svg`
- NEW `assets/logo/logo-full-light.svg`
- NEW `assets/logo/logo-full-dark.svg`

### primebrick-v3-website
- MODIFY `public/favicon.svg`
- NEW `public/logo-full-dark.svg` (and light variant if needed)
- MODIFY `src/pages/[lang]/index.astro` (lines 36, 56-58)
- MODIFY `src/pages/[lang]/contact.astro` (title/logo if present)

### primebrick-fe-v3
- MODIFY `static/favicon.svg`
- NEW `static/logo-full-dark.svg` (and light variant)
- MODIFY `src/routes/login/+page.svelte` (lines 22, 105-113, 160-169)

### primebrick-v3-docs
- NEW `public/favicon.svg`
- MODIFY `public/logo-light.svg`
- MODIFY `public/logo-dark.svg`
- MODIFY `zudoku.config.tsx` (lines 13, 30, add metadata section)

## Notes

- The FE `avatar-hex` clip-path (`src/app.css:91-94`) is NOT used for the new logo — the logo uses a real SVG hexagon shape, not a clip-path on a square. This is intentional: the favicon/logo needs a real geometric hexagon, not a clipped square.
- The login page currently uses the `avatarChromeFallbackClass` (deterministic color from seed). The new logo image replaces this entirely with the brand gradient.
- Sharp is available in `primebrick-v3-website/node_modules` for raster generation.
