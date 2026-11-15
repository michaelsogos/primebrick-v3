# Plan: Top Banner + Contact Page (Brevo + Turnstile)

## Status: APPROVED — user sent PROCEED on 2026-07-14

## Secrets handling (locked in per user decision 2026-07-14)

- `PUBLIC_TURNSTILE_SITEKEY` — **build-time** env (`import.meta.env.PUBLIC_*`).
  Public value, must reach the browser bundle. Set via `.env` or
  `astro.config.mjs` `vite.define`.
- `TURNSTILE_SECRET_KEY` — **Worker env** (Wrangler secret). Read at runtime
  in the SSR endpoint via `astro.locals.runtime.env.TURNSTILE_SECRET_KEY`.
- `BREVO_API_KEY` — **Worker env** (Wrangler secret). Read at runtime in the
  SSR endpoint via `astro.locals.runtime.env.BREVO_API_KEY`.

Both secrets are handled identically: Wrangler secrets, read from
`runtime.env` at request time, never baked into the build artifact, never
committed. The sitekey is the lone build-time exception because it is public
and must reach the client.

## Objectives

1. Add a **sticky, non-dismissible top banner** to the Primebrick website that
   reads (EN example): "We're in early-stage — get in touch!" and links to the
   new contact page.
2. Add a **contact page** (`/[lang]/contact`) with a form (Name, Email, Message)
   protected by **Cloudflare Turnstile** anti-bot, that sends an email to
   `about@primebrick.dev` via the **Brevo API** from a server-side Astro
   endpoint.

## Architecture (approved flow by user)

```
[User Form] ──(data + Turnstile token)──▶ [Astro SSR endpoint /api/contact]
                                              │
                                              │ 1. Verify Turnstile token with Cloudflare
                                              │ 2. Validate + sanitize Name, Email, Message
                                              │ 3. Read BREVO_API_KEY from Worker Secrets
                                              ▼
                                         [Brevo API] ──▶ about@primebrick.dev inbox
```

## Current codebase context

- Astro `output: 'static'` (astro.config.mjs) with `@astrojs/cloudflare` adapter.
  All pages prerendered by default. The contact **page** stays prerendered
  (static HTML form). Only the **API endpoint** opts into SSR via
  `export const prerender = false`.
- Single page today: `src/pages/[lang]/index.astro` (self-contained, no layout
  file). Nav + footer are inline in this file.
- i18n: `src/i18n/translations.ts` — 6 languages (en, it, de, es, pt, fr).
  Each language object has `nav`, `hero`, …, `footer` keys.
- Svelte is used for interactivity (`src/components/svelte/`), Astro for static.
- Tailwind CSS 4 via `@tailwindcss/vite`. Dark slate theme
  (`bg-slate-950 text-slate-100`).
- Wrangler config: `wrangler.jsonc` with `nodejs_compat` flag, `ASSETS` binding.
- Rules: kebab-case filenames; no Node.js APIs in SSR code (use Web APIs);
  prerender by default; Svelte only for interactive components.

## Impacted files

### New files

1. `src/components/astro/TopBanner.astro`
   - Pure static Astro component (no interactivity needed — non-dismissible).
   - Renders a slim sticky bar above the nav. Uses Tailwind, matches dark theme.
   - Accepts props: `text: string`, `href: string`.
   - `position: sticky; top: 0; z-index: 60` (above nav which is z-50).
   - Full-width, gradient accent (sky/indigo), small icon + text + chevron link.

2. `src/components/svelte/ContactForm.svelte`
   - Interactive Svelte island (`client:load`).
   - Fields: Name (text, required), Email (email, required), Message (textarea,
     required, min length). Client-side validation + inline error states.
   - Renders Cloudflare Turnstile widget (`cf-turnstile` div + script
     `https://challenges.cloudflare.com/turnstile/v0/api.js` with `render`
     via explicit mode so we control the sitekey).
   - On submit: POST JSON `{ name, email, message, turnstileToken }` to
     `/api/contact`. Shows loading / success / error UI states.
   - Sitekey read from a public runtime env (`import.meta.env.PUBLIC_TURNSTILE_SITEKEY`).
   - No secrets on the client.

3. `src/pages/[lang]/contact.astro`
   - Prerendered (`export const prerender = true`).
   - `getStaticPaths()` mirrors `[lang]/index.astro` (iterates `LANGUAGES`).
   - Reuses the same nav + footer markup pattern as `index.astro` (kept
     inline for now, consistent with existing structure).
   - Includes `<TopBanner />` at the very top (same as home page).
   - Hero: title + subtitle from `t.contact.*` translations.
   - Body: `<ContactForm client:load />` island.
   - Also shows a fallback "email us directly at about@primebrick.dev" link.

4. `src/pages/api/contact.ts`
   - **SSR endpoint**: `export const prerender = false`.
   - Exports `POST` handler (Astro API route convention).
   - Steps:
     1. Parse JSON body (`name`, `email`, `message`, `turnstileToken`).
     2. **Turnstile verification**: POST to
        `https://challenges.cloudflare.com/turnstile/v0/siteverify`
        with `secret` = `import.meta.env.TURNSTILE_SECRET_KEY` (server secret,
        from Wrangler secret) and `response` = `turnstileToken`. Reject if
        `success !== true`.
     3. **Validate + sanitize**: trim, length limits (name ≤ 100, email ≤ 254
        and regex, message ≤ 5000). Reject on invalid.
     4. **Brevo send**: `fetch('https://api.brevo.com/v3/smtp/email', …)`
        with `api-key` header = `import.meta.env.BREVO_API_KEY` (Wrangler
        secret). Body: sender = a verified Brevo sender (e.g.
        `no-reply@primebrick.dev`), to = `about@primebrick.dev`, replyTo =
        submitter email, subject = `[primebrick.dev contact] …`,
        htmlContent = formatted message.
     5. Return JSON `{ ok: true }` or appropriate error (400 for validation,
        429 for rate-limit, 500 for Brevo failure). Do NOT leak Brevo errors
        to the client.
   - Uses only Web APIs (`fetch`, `Request`, `Response`) — no Node.js APIs.

### Modified files

5. `src/pages/[lang]/index.astro`
   - Import `TopBanner` and render `<TopBanner text={t.banner.text} href={contactHref} />`
     as the first child of `<body>` (before the `<nav>`). The nav stays z-50;
     banner is sticky top-0 z-60 so it sits above nav while scrolling.
   - `contactHref` = `isEn ? '/contact' : `/${langCode}/contact``.
   - No other changes to the home page content.

6. `src/i18n/translations.ts`
   - Add a `banner` key to each of the 6 languages:
     `{ text: "We're in early-stage — get in touch!" }` (translated per lang).
   - Add a `contact` key to each of the 6 languages with:
     `{ title, subtitle, form: { name, namePlaceholder, email, emailPlaceholder, message, messagePlaceholder, submit, sending, success, error, required }, directEmailLabel }`.
   - Add `nav.contact = 'Contact'` (translated) to each language's `nav` object,
     and add a corresponding nav link in `index.astro` and `contact.astro`.

7. `astro.config.mjs`
   - No change to `output` (keep `'static'`). SSR is opted-in per-route via
     `prerender = false` on the API endpoint, which Astro + Cloudflare adapter
     supports in static mode.

8. `wrangler.jsonc`
   - No structural change. Runtime secrets (`BREVO_API_KEY`,
     `TURNSTILE_SECRET_KEY`) are set in the Cloudflare dashboard under the
     deployed Worker's "Variables and Secrets" (NOT via `wrangler secret put`,
     since this repo deploys via Cloudflare Workers Builds, not local
     `wrangler deploy`). The public Turnstile sitekey
     (`PUBLIC_TURNSTILE_SITEKEY`) is set as a build-time variable/secret in
     the Workers Builds build settings, so Vite inlines it into the
     prerendered HTML at build time.

9. `src/env.d.ts` (create if not present) or extend existing
   - Declare `import.meta.env.PUBLIC_TURNSTILE_SITEKEY` (build-time, client-safe).
   - The two secrets (`TURNSTILE_SECRET_KEY`, `BREVO_API_KEY`) are NOT
     `import.meta.env` — they are read from `astro.locals.runtime.env` at
     runtime. Type them via the Cloudflare adapter's `RuntimeEnv` interface
     (extend `RuntimeEnv` in `env.d.ts` if needed) so `astro check` passes.

10. `.gitignore` — `.env` and `.dev.vars` are ignored (verified + `.dev.vars`
    added in this implementation). `.dev.vars` is the local Wrangler secrets
    file for `astro dev` / `wrangler dev`.

## Secrets & env setup — CI-specific (Cloudflare Workers Builds)

This repo deploys via **Cloudflare Workers Builds** (native git integration),
NOT via GitHub Actions and NOT via local `wrangler deploy`. Push to `main`
triggers CF to build and deploy automatically. Build command (set in CF
dashboard): `node scripts/sync-repo-docs.mjs && node scripts/sync-deepwiki.mjs
&& pnpm install --frozen-lockfile && pnpm run build`.

Two Workers exist in this workspace:
- **`primebrick-v3-website`** — the Astro site (THIS repo, the one changed
  by this feature). All variables below go here.
- **`primebrick-v3-docs`** — the Zudoku docs site (separate repo, untouched).
  Nothing to configure here.

Cloudflare distinguishes **build-time** settings (consumed during the build
step, e.g. by sync scripts or Vite) from **runtime** settings (available to
the deployed Worker at request time via `locals.runtime.env`). The three
variables split across these two scopes:

### Build settings (Cloudflare dashboard → Workers Builds → primebrick-v3-website → Settings → Build → Variables and Secrets)

These are consumed during `pnpm run build`, not at request time.

| Variable | Type | Notes |
|---|---|---|
| `PUBLIC_TURNSTILE_SITEKEY` | Variable (plaintext) | Public value, safe as plaintext. Vite inlines it into the prerendered contact page HTML via `import.meta.env.PUBLIC_TURNSTILE_SITEKEY`. |
| `DEVIN_API_KEY` | Secret (already set) | Existing, used by `sync-deepwiki.mjs`. Unchanged. |

### Runtime settings (Cloudflare dashboard → Workers & Pages → primebrick-v3-website → Settings → Variables and Secrets)

These are read by the Worker at request time via `locals.runtime.env.*` in
`src/pages/api/contact.ts`. They do NOT exist at build time.

| Variable | Type | Notes |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | Secret (encrypted) | Paired with the public sitekey. Verified server-side against Cloudflare's siteverify endpoint. |
| `BREVO_API_KEY` | Secret (encrypted) | Brevo API key for sending transactional email. |

### Local development (`.dev.vars` in repo root, gitignored)

For `astro dev` / `wrangler dev`, Astro's Cloudflare adapter reads runtime
secrets from `.dev.vars` (gitignored). Create it with:

```
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
BREVO_API_KEY=your-brevo-key
```

And a `.env` file (gitignored) for the build-time public sitekey:

```
PUBLIC_TURNSTILE_SITEKEY=1x00000000000000000000AA
```

The `1x0000…AA` values are Cloudflare's published **test keys** (always pass,
safe for local dev). Replace with real keys for production.

### Brevo sender verification

The endpoint sends from `no-reply@primebrick.dev` (the `SENDER` constant in
`src/pages/api/contact.ts`). This sender address must be verified in the
Brevo dashboard under Senders & IP. If you prefer a different sender domain,
update the `SENDER` constant and verify that domain in Brevo first.

### Turnstile widget creation

Create a Turnstile widget in the Cloudflare dashboard (Turnstile tab) to get
a real sitekey + secret pair for production. The widget's hostname must match
`primebrick.dev`. For local dev, use the test keys above (no widget needed).

## Acceptance criteria

1. Home page (`/en/` and all 6 lang variants) shows a sticky top banner that
   remains visible while scrolling, is non-dismissible, and links to
   `/{lang}/contact`.
2. `/en/contact` (and all 6 lang variants) loads a prerendered contact page
   with the form, Turnstile widget, and a direct email fallback link.
3. Submitting the form with valid data and a solved Turnstile challenge
   results in an email arriving at `about@primebrick.dev` from Brevo, with
   the submitter's email as Reply-To.
4. Submitting without solving Turnstile, or with invalid fields, returns a
   user-friendly error and no email is sent.
5. No secrets are committed to the repo; `.dev.vars` and `.env` (if holding
   secrets) are gitignored.
6. `pnpm run build` succeeds and `pnpm run check` (astro check) passes with
   no type errors.
7. The API endpoint uses only Web APIs (no `fs`, `child_process`, `node:path`).
8. All new filenames are kebab-case. The contact page is prerendered; only
   the API route is SSR.
9. Banner + contact page text is translated in all 6 languages.
10. Banner does not overlap/break the existing sticky section headers inside
    the home page (z-index and sticky offsets reviewed).

## Out of scope (explicit)

- No layout refactor (extracting nav/footer into a shared `BaseLayout.astro`).
  Kept inline to match current structure. Can be a follow-up.
- No rate-limiting beyond Turnstile (Turnstile itself mitigates bots). A
  simple in-Worker IP rate limit can be added later if abuse occurs.
- No analytics on form submissions.
- No i18n for the API endpoint error messages (errors are keyed by code, the
  Svelte form maps codes to translated strings).

## Risks / notes

- Brevo free tier allows 300 emails/day — sufficient for early-stage contact
  form. Verify the sender domain in Brevo first.
- Turnstile requires JS on the client; the form degrades to a `mailto:` link
  if JS is disabled (the direct-email link is always visible).
- Cloudflare Workers free plan: 100k requests/day, 10ms CPU. The endpoint
  does 2 fetches (Turnstile + Brevo) — well within limits.

---
