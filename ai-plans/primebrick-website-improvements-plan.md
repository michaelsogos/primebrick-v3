# Plan: Primebrick Website Improvements

## Date: 2026-07-12
## Status: Awaiting Approval

## Objectives

Improve the primebrick-v3-website based on user feedback:
1. Redesign landing page — PaaS positioning, not SaaS; target audience = Devs, CTOs, Tech Leaders, Software Architects
2. Remove the features page (merge key content into landing page)
3. Fix the Docs (Starlight sidebar is empty, no content, /docs returns 404)
4. Enhance the API Explorer with auth UI, endpoint descriptions, intro pages, and language logos

## Reference
- User's reference design: https://primebrick-core-stack.lovable.app/it
- Key positioning: "Opinionated open-source backoffice framework (MIT)", multi-cloud, no vendor lock-in
- Target audience: Devs (less boilerplate, more value) and CTOs (software selection without risk)

---

## 1. Landing Page Redesign (`src/pages/index.astro`)

### Current problems
- Reads like a SaaS product page ("open-source business platform")
- Too specific (mentions Casdoor, NATS, SvelteKit by name in hero)
- No PaaS positioning, no multi-cloud message
- Missing the "opinionated framework" angle

### New design (inspired by reference site)

**Hero section:**
- Headline: "The opinionated backoffice framework for serious teams"
- Subheadline: "Primebrick v3 is an open-source framework that defines infrastructure, architecture, and coding rules according to best practices. MIT license: use it in commercial projects, no strings attached."
- CTAs: "See on GitHub" + "Discover the architecture"
- Stats bar: "MIT License" | "6+ Deploy targets" | "Zero vendor lock-in"

**Multi-cloud section:**
- "Multi-cloud, truly." headline
- "Your infrastructure, your rules. No vendor lock-in: Primebrick runs identically from your laptop to the enterprise datacenter, from K8s cluster to the public cloud closest to your users."
- Cloud provider cards/logos: AWS, GCP, Azure, Alibaba Cloud, Docker Swarm, Kubernetes/On-prem

**The concept section:**
- "A backoffice that starts with its own rules."
- "Every backoffice starts well and ends in chaos. Primebrick v3 flips the perspective: we start from best practices and enforce them through the framework."
- 4 numbered cards:
  1. Infrastructure as Code — K8s manifests, Helm charts, Terraform templates ready for staging and production
  2. Layered architecture — Clean separation between domain, application, infrastructure, and UI. Testable by construction
  3. Opinionated coding rules — Linting, strict types, mandatory patterns: technical debt is prevented, not paid later
  4. Native observability — OpenTelemetry, structured logging, health-checks integrated from the first commit

**Features/Bricks section (replaces separate features page):**
- "Everything you need. Nothing you don't."
- "We made the hard decisions once, so your teams don't make them every sprint. Every brick is tested, integrated, and documented."
- Cards with code-prefix labels:
  - `/ AUTH` — Identity & RBAC: OIDC, role management, granular schema-level permissions
  - `/ DATA` — Persistence layer: PostgreSQL adapter, soft-delete, audit fields, bulk operations
  - `/ UI` — Backoffice engine: CRUD, tables, forms, filters generated from domain schemas
  - `/ OBS` — Full observability: OpenTelemetry integrated, tracing, metrics, correlated logs
  - `/ MULTI` — Multi-tenant ready: logical and physical isolation for thousands of organizations
  - `/ SDK` — Type-safe SDK: TypeScript clients generated from endpoints, end-to-end type safety

**For Devs section:**
- "Less boilerplate, more value."
- "Clear structure, objective coding rules, DX designed for speed. Clone, run, and you're already in a best-practice environment — CI/CD, linting, types, tests, observability all ready."
- Bullet points:
  - Onboarding in hours, not weeks
  - Zero discussions about "how we do things here"
  - Modern, typed, tested stack

**For CTOs section:**
- "Software selection without risk."
- "MIT license, open and inspectable code, deploy where you decide. Reduce time-to-market and technical debt from minute zero. No vendor lock-in, no contractual surprises."
- Bullet points:
  - Free commercial use (MIT)
  - Host it where needed: cloud or on-prem
  - Verifiable standards, not promises

**Open source section:**
- "Open source. Even for commercial use."
- "Primebrick v3 is released under the MIT license: you can use, modify, redistribute, and integrate it in commercial products without royalties. Code is public on GitHub, design decisions are documented, contributions are welcome."
- Links: GitHub repository, License text

**Final CTA:**
- "Build your next backoffice with the right rules."
- "Clone the repo, follow the quick-start, and you're in production with an architecture your future developers will thank you for choosing."
- CTAs: "Start on GitHub" + "Read the architecture"

### Technical notes
- Keep the same dark theme (slate-950 bg, sky-400 accents)
- Use Tailwind classes throughout
- All content in English (the reference is Italian, we translate)
- `export const prerender = true`
- Import `../styles/global.css`

---

## 2. Remove Features Page

### Actions
- Delete `src/pages/features/index.astro`
- Remove the "Features" link from the nav in all pages
- The features content is now integrated into the landing page (section 1)

---

## 3. Fix Docs (Starlight)

### Current problems
- Starlight sidebar has empty `items: []` arrays — no pages linked
- No actual doc content exists in `src/content/docs/`
- `/docs` returns 404 because Starlight has no index page
- The `src/content/docs/` directory is empty (sync scripts haven't run yet)

### Fix approach

#### 3a. Create handwritten intro docs
Create actual Markdown content files in `src/content/docs/` that Starlight can render. These are hand-written (not synced), so they go in a `handwritten/` subdirectory or directly in the Starlight content collection.

Starlight uses its own content collection — it doesn't use the `docs` collection we defined in `src/content.config.ts`. Starlight expects files in `src/content/docs/` by default and manages its own sidebar via the `sidebar` config.

**Files to create:**

1. `src/content/docs/index.mdx` — Docs landing page (overview, what is Primebrick, architecture diagram)
2. `src/content/docs/getting-started/introduction.mdx` — What is Primebrick, philosophy, who is it for
3. `src/content/docs/getting-started/quick-start.mdx` — Clone, install, run
4. `src/content/docs/getting-started/architecture.mdx` — Layered architecture, microservices, proxy, service registry
5. `src/content/docs/api/introduction.mdx` — API overview, how to use the API explorer, base URLs
6. `src/content/docs/api/authentication.mdx` — Auth system: Casdoor IDP, OIDC, JWT, refresh tokens, how to get a token
7. `src/content/docs/api/rbac.mdx` — RBAC system: wildcard permissions, role mappings, admin bypass, examples
8. `src/content/docs/api/microservice-standard.mdx` — Microservice standard: registration, heartbeat, OpenAPI, proxy, error format (RFC 7807)
9. `src/content/docs/api/error-handling.mdx` — RFC 7807 Problem Details, error codes, impact field

#### 3b. Fix Starlight sidebar config
Update `astro.config.mjs` to use `AutogenerateSidebarGroups` or link actual pages:

```javascript
import { AutogenerateSidebarGroups } from '@astrojs/starlight';

sidebar: AutogenerateSidebarGroups([
  { title: 'Getting Started', items: ['getting-started/introduction', 'getting-started/quick-start', 'getting-started/architecture'] },
  { title: 'API Reference', items: ['api/introduction', 'api/authentication', 'api/rbac', 'api/microservice-standard', 'api/error-handling'] },
]),
```

Or use manual sidebar with actual page references.

#### 3c. Remove the separate `docs` content collection
The `docs` collection in `src/content.config.ts` conflicts with Starlight's own content collection. Remove it and let Starlight manage `src/content/docs/`. Keep only the `marketing` collection.

---

## 4. API Explorer Enhancements

### 4a. Auth UI
**Problem**: Scalar has built-in auth (bearer token, API key, OAuth2) but the user didn't find it. It may need to be more prominent or configured differently.

**Fix**: 
- Review Scalar's auth configuration options
- Add a visible auth panel or button before the API reference
- Consider a custom Svelte component that lets users:
  - Enter username/password → call `/api/v1/auth/login` → get JWT → inject as bearer token
  - Enter API key directly
  - Enter bearer token directly
- This component would sit above the Scalar component and pass the token to it

### 4b. Endpoint descriptions
**Problem**: Endpoints have no descriptions. This is a BE OpenAPI spec issue — the spec itself needs `description` fields on operations.

**Fix**: This requires updating the BE's OpenAPI spec to include descriptions for each endpoint. This is a BE-side change, not a website change. The website can only display what the spec contains.

**Website-side mitigation**: Add intro pages (section 3a) that explain the API structure, common patterns, and examples. These serve as documentation even if the spec itself is sparse.

### 4c. Introduction pages
Covered by section 3a — the `api/` docs section will have introduction, authentication, RBAC, microservice standard, and error handling pages.

### 4d. Language logos in syntax selector
**Problem**: Scalar's code generation language selector shows text names, not logos.

**Fix**: 
- Check if Scalar supports custom language icons/logos
- If not, this is a Scalar limitation — we may need to file a feature request or use a custom wrapper
- Investigate Scalar's `configuration` options for `clients` or `codeSamples` customization
- If Scalar doesn't support it, document it as a known limitation

---

## 5. Files to create/modify

### NEW files
| File | Purpose |
|------|---------|
| `src/content/docs/index.mdx` | Docs landing page |
| `src/content/docs/getting-started/introduction.mdx` | What is Primebrick |
| `src/content/docs/getting-started/quick-start.mdx` | Quick start guide |
| `src/content/docs/getting-started/architecture.mdx` | Architecture overview |
| `src/content/docs/api/introduction.mdx` | API intro |
| `src/content/docs/api/authentication.mdx` | Auth system docs |
| `src/content/docs/api/rbac.mdx` | RBAC docs |
| `src/content/docs/api/microservice-standard.mdx` | Microservice standard |
| `src/content/docs/api/error-handling.mdx` | Error handling |
| `src/components/svelte/AuthPanel.svelte` | Auth panel for API explorer |

### MODIFIED files
| File | Change |
|------|--------|
| `src/pages/index.astro` | Complete redesign of landing page |
| `src/pages/api-explorer/index.astro` | Add auth panel, improve intro |
| `astro.config.mjs` | Fix Starlight sidebar with actual page links |
| `src/content.config.ts` | Remove `docs` collection (Starlight manages it) |

### DELETED files
| File | Reason |
|------|--------|
| `src/pages/features/index.astro` | Merged into landing page |

---

## 6. Acceptance criteria

1. Landing page reflects PaaS positioning with multi-cloud, opinionated framework messaging
2. Features page is removed; its content is integrated into the landing page
3. `/docs` returns a real page with a populated sidebar and readable content
4. API explorer has a visible auth mechanism (login form or token input)
5. API docs include introduction, authentication, RBAC, microservice standard, and error handling pages
6. Build succeeds and all pages render with styles
7. No truncated files created (per verify-file-creation rule)

---

## 7. Open questions

1. **Language**: The reference site is in Italian. Should the website be English-only, or do we need i18n (IT + EN)?
2. **Auth panel**: Should the auth panel call the BE's `/api/v1/auth/login` endpoint directly from the browser (requires CORS), or should we proxy through the Worker?
3. **Endpoint descriptions**: Should we also update the BE OpenAPI spec to add descriptions to all endpoints? (This is a separate BE task.)
4. **Language logos**: If Scalar doesn't support custom logos in the language selector, should we build a custom code generation panel, or accept the text-only dropdown?

---

END OF PLAN
