# Feature Plan: Use Cases Pages for primebrick-v3-website

## 1. Objective

Add a **Use Cases section** to the Primebrick website organized entirely around the **people** who choose and use Primebrick. The section is a small multi-page hub:

- **One index page** — short, strict, just persona cards that link to dedicated pages.
- **One dedicated page per persona** (6 total) — richer content with an SVG illustration, expanded benefits, a capabilities chip list, and a "next persona" navigation link.
- **A mega menu** in the site nav to jump between personas from any page.

The six personas:

1. **Developer**
2. **Tech Leader**
3. **Solution Architect**
4. **CTO**
5. **Visionary Entrepreneur**
6. **SOC Team**

All pages reuse the existing dark design language, require no new runtime dependencies, are fully prerendered, and are integrated into navigation and sitemap.

## 2. Proposed URL & Routing

- Index: `src/pages/[lang]/use-cases/index.astro` → `/en/use-cases/`
- Persona pages (kebab-case):
  - `src/pages/[lang]/use-cases/developer.astro` → `/en/use-cases/developer`
  - `src/pages/[lang]/use-cases/tech-leader.astro` → `/en/use-cases/tech-leader`
  - `src/pages/[lang]/use-cases/solution-architect.astro` → `/en/use-cases/solution-architect`
  - `src/pages/[lang]/use-cases/cto.astro` → `/en/use-cases/cto`
  - `src/pages/[lang]/use-cases/visionary-entrepreneur.astro` → `/en/use-cases/visionary-entrepreneur`
  - `src/pages/[lang]/use-cases/soc-team.astro` → `/en/use-cases/soc-team`

All pages follow the existing `[lang]` dynamic-route pattern:

```ts
export const prerender = true;

export function getStaticPaths() {
  return LANGUAGES.map((lang) => ({
    params: { lang: lang.code === 'en' ? 'en' : lang.code },
  }));
}
```

## 3. Proposed Page Content

### 3.1 Index page (`use-cases/index.astro`) — short and strict

- Hero: badge, title `The right backoffice for the right seat.`, one-line subtitle.
- A 3-column grid of 6 persona cards. Each card: icon, persona name, tagline, one-line description, and an "Explore →" link to the dedicated page.
- No long-form content. The index is a directory, not a brochure.

### 3.2 Persona pages — rich, detailed, illustrated

Each persona page is a long-form, content-rich page (40–47 KB of HTML) with the following structure. Pages are intentionally detailed — every section has real explanatory prose, not just bullet points.

1. **Hero** — persona number badge (`Persona 0X / 06`), persona name as `h1`, tagline in accent color, one-paragraph description, and two CTA buttons (accent-gradient "Get in touch" + outline "Read the docs").
2. **Illustration** — a custom inline SVG wireframe/diagram per persona (see §3.3), wrapped in a `rounded-2xl border border-slate-800/50 bg-slate-950/80 shadow-2xl` card.
3. **"What changes for you"** — **8 benefit cards** in a 2-column grid (expanded from the original 4). Each card has an accent-colored icon, a title, a detailed 3–4 sentence paragraph, and a row of small capability chips.
4. **Persona-specific deep-dive section** — one or more additional sections per persona (see §3.3a):
   - Developer: "A day in the life" 8-step timeline + "Before vs. with Primebrick" comparison table + typed SDK code snippet.
   - Tech Leader: "Onboarding a new developer" 4-step flow + "Standards matrix" table + "Migrating from legacy" 4-phase path.
   - Solution Architect: "The five layers, in detail" expanded card list + "Deployment matrix" table + "Compliance from code to auditor" report sample.
   - CTO: "ROI breakdown" table + "Risk matrix" 6-card grid + "From code to auditor" 4-step flow.
   - Visionary Entrepreneur: "Launch playbook" 4-phase timeline + "AI stack" diagram + "SaaS scaling path" table + "Funding math" comparison.
   - SOC Team: "Audit log schema" code block + "Incident response workflow" 5-step flow + "Compliance report sample" code block + "RBAC review panel" table.
5. **"Capabilities you'll use"** — accent-colored chip list (12–15 chips per persona).
6. **Quote** — a blockquote from a relevant role (developer, manager, architect, CTO, founder, SOC lead) with a large quotation-mark SVG.
7. **FAQ** — 5 expandable `<details>` questions per persona, with detailed answers.
8. **Footer block** — a "Next persona →" card linking to the next persona in the sequence, plus a CTA card with "Get in touch" and "Read the docs" buttons.

### 3.3 Per-persona illustrations (inline SVG)

| Persona | Illustration |
|---------|--------------|
| Developer | IDE wireframe showing a `customer.entity.ts` file with `@Entity`, `@Auditable`, `@Cached`, `@RBAC` decorators and a `pnpm primebrick generate-crud` command. |
| Tech Leader | Team standards dashboard: onboarding time, standards-enforced percentages, and a module/brick list. |
| Solution Architect | Layered architecture diagram (Frontend → Backend → Microservices + Libraries → PostgreSQL) with arrows and labels. |
| CTO | Executive metrics dashboard: time-to-deploy, license cost ($0), compliance coverage, vendor lock-in (zero), plus a feature-velocity line chart comparing Primebrick vs. legacy. |
| Visionary Entrepreneur | Launch trajectory timeline: Day 1 (Idea) → Day 3 (MVP) → Week 2 (AI features) → Month 2 (Multi-tenant SaaS) → Scale, with a "$0 MIT" license cost label. |
| SOC Team | Audit log + live security signals panel: tamper-evident audit entries (UPDATE / RBAC / MFA / ALERT), live OpenTelemetry/log/health signal indicators, and a downloadable compliance report card. |

### 3.3a Persona-specific deep-dive sections

In addition to the shared structure, each persona page includes one or more dedicated long-form sections:

- **Developer** — "A day in the life" 8-step timeline + "Before vs. with Primebrick" comparison table + typed SDK code snippet.
- **Tech Leader** — "Onboarding a new developer" 4-step flow + "Standards matrix" table + "Migrating from legacy" 4-phase path.
- **Solution Architect** — "The five layers, in detail" expanded card list + "Deployment matrix" table + "Compliance from code to auditor" report sample.
- **CTO** — "ROI breakdown" 8-row table + "Risk matrix" 6-card grid + "From code to auditor" 4-step flow.
- **Visionary Entrepreneur** — "Launch playbook" 4-phase timeline + "AI stack" 4-card diagram + "SaaS scaling path" 3-row table + "Funding math" side-by-side comparison.
- **SOC Team** — "Audit log schema" TypeScript interface code block + "Incident response workflow" 5-step flow + "Compliance report sample" annotated code block + "RBAC review panel" generated table.

### 3.4 Persona sequence (for "next persona" links)

Developer → Tech Leader → Solution Architect → CTO → Visionary Entrepreneur → SOC Team → (back to Developer)

## 4. Mega Menu

A mega menu is added to the site nav on **every** page (home, contact, thank-you, and all use-cases pages). It drops down from the "Use Cases" nav item and shows:

- A link to "All Use Cases" (the index page).
- A 2-column grid of 6 persona links, each with icon, name, and tagline.
- The current persona (if on a persona page) is highlighted with an accent border.

Implementation: a small Svelte component `src/components/svelte/UseCasesMegaMenu.svelte` with `client:load` (or pure CSS hover + a tiny inline script). The mega menu data (persona id, name, tagline, accent, href) is derived from the `useCases` translation object so it stays in sync with content.

## 5. Translation Object Schema

Add a `useCases` section to **all six** language objects (`en`, `it`, `de`, `es`, `pt`, `fr`) in `src/i18n/translations.ts`.

Shape:

```ts
useCases: {
  // Index page
  index: {
    badge: string;
    title: string;
    subtitle: string;
    exploreLabel: string; // e.g. "Explore"
  };
  // Shared persona list (used by index, mega menu, and persona pages)
  personas: Array<{
    id: 'developer' | 'techLeader' | 'solutionArchitect' | 'cto' | 'visionaryEntrepreneur' | 'socTeam';
    name: string;
    tagline: string;
    description: string; // one paragraph, used on the persona page hero
    shortDescription: string; // one line, used on the index card and mega menu
    accent: 'sky' | 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose';
    icon: string; // SVG path identifier handled in the component
    cases: Array<{ title: string; text: string }>;
    capabilities: string[]; // chip labels
    illustrationAlt: string;
  }>;
  // Shared UI labels
  ui: {
    personaLabel: string; // e.g. "Persona"
    personaOf: string; // e.g. "/ 06"
    whatChangesTitle: string; // e.g. "What changes for you"
    capabilitiesTitle: string; // e.g. "Capabilities you'll use"
    nextPersonaLabel: string; // e.g. "Next persona →"
    backToStartLabel: string; // e.g. "Back to start →"
    allUseCasesLabel: string; // e.g. "All Use Cases"
  };
  // Final CTA on each persona page
  finalCta: {
    title: string;
    text: string;
    ctaContact: string;
    ctaDocs: string;
  };
}
```

### 5.1 English content (full example)

```ts
useCases: {
  index: {
    badge: 'Use Cases • Primebrick for the people who build',
    title: 'The right backoffice for the right seat.',
    subtitle: 'Six teams. One framework. Pick your seat and see what Primebrick does for you.',
    exploreLabel: 'Explore',
  },
  personas: [
    {
      id: 'developer',
      name: 'Developer',
      tagline: 'Ship code, not ceremony.',
      description: 'Stop fighting scaffolding and start in a best-practice environment from minute one. Typed SDK, enforced conventions, CRUD, RBAC, and observability ready from the first commit. Code locally in your IDE or let an AI agent do the boilerplate in the browser.',
      shortDescription: 'Stop fighting scaffolding. Start in a best-practice environment from minute one.',
      accent: 'sky',
      icon: 'code',
      illustrationAlt: 'IDE wireframe showing a Primebrick entity with decorators and CRUD generation',
      cases: [
        { title: 'Start with auth, RBAC and CRUD already solved', text: 'Identity, permissions and entity tables ship as first-class bricks. Your first commit is product code, not plumbing.' },
        { title: 'Code in your IDE or describe it to an agent', text: 'Use VS Code, Cursor or Windsurf locally — or use the Agentic GUI in the browser. Both produce the same typed, linted conventions.' },
        { title: 'Debug with traces and structured logs', text: 'OpenTelemetry, type-safe SDK and health checks are the foundation, not an afterthought.' },
        { title: 'Ship on day one', text: 'Install, run, and you already have a backoffice. Conventions are enforced, so you spend time on features, not debates.' },
      ],
      capabilities: ['Type-safe SDK', 'Entity CRUD generation', 'RBAC decorators', 'Agentic GUI', 'OpenTelemetry', 'Strict TypeScript', 'OpenAPI meta', 'Health checks'],
    },
    {
      id: 'techLeader',
      name: 'Tech Leader',
      tagline: 'Conventions, not committee meetings.',
      description: 'Your job is to move the team forward, not referee architecture debates. Primebrick gives you objective rules: linting, strict types, layered architecture, and a module system that keeps work aligned across teams and sprints.',
      shortDescription: 'Move the team forward without refereeing architecture debates.',
      accent: 'indigo',
      icon: 'team',
      illustrationAlt: 'Team standards dashboard showing onboarding time, enforced standards, and module list',
      cases: [
        { title: 'Onboard new hires in hours', text: 'A single, documented way to build features. New developers read the conventions once and produce consistent code.' },
        { title: 'Enforce standards across teams', text: 'No custom CRUD, auth or validation implementations. Every brick inherits ConfigEntityBase, typed loaders and OpenAPI meta.' },
        { title: 'Replace legacy panels brick by brick', text: 'Migrate from ad-hoc admin panels one module at a time. Each brick maps to a clean domain boundary.' },
        { title: 'Keep technical debt off the balance sheet', text: 'Linting, strict types and mandatory patterns prevent debt instead of paying it later.' },
      ],
      capabilities: ['ConfigEntityBase', 'Typed ConfigLoader', 'OpenAPI meta', 'Module isolation', 'Strict linting', 'CI/CD pipelines', 'ConfigTable component'],
    },
    {
      id: 'solutionArchitect',
      name: 'Solution Architect',
      tagline: 'Architecture that survives the next migration.',
      description: 'You design systems that must outlast vendors, teams, and product pivots. Primebrick gives you a clean layered architecture, multi-cloud deployment, and compliance evidence generated from code — not from questionnaires.',
      shortDescription: 'Design systems that outlast vendors, teams and product pivots.',
      accent: 'violet',
      icon: 'grid',
      illustrationAlt: 'Layered architecture diagram from Frontend to PostgreSQL',
      cases: [
        { title: 'Multi-cloud, zero vendor lock-in', text: 'Run identically on a laptop, in Docker, on Kubernetes or on any public cloud. Terraform-ready templates keep production portable.' },
        { title: 'Clean layered architecture', text: 'Frontend, Backend, Microservices, Libraries and Data each have a clear responsibility and defined protocol.' },
        { title: 'Compliance evidence from code', text: 'ISO 27001 Annex A, NIS2 Article 21(2) and OWASP controls are mapped to file:line evidence on every build.' },
        { title: 'Scale from laptop to K8s', text: 'Redis-backed cache, multi-instance state, and the DAL abstraction scale horizontally behind any load balancer.' },
      ],
      capabilities: ['Layered architecture', 'Terraform templates', 'Docker / K8s', 'Redis cache layer', 'DAL abstraction', 'NATS service registry', 'ISO 27001 scanner', 'NIS2 mapping', 'OpenTelemetry'],
    },
    {
      id: 'cto',
      name: 'CTO',
      tagline: 'Speed without lock-in.',
      description: 'You own speed, cost, and risk. Primebrick is MIT-licensed, inspectable, deployable anywhere, and ships with the security and compliance features your auditors will ask for — without a platform team to build and maintain them.',
      shortDescription: 'Own time-to-market, cost and risk with an MIT-licensed, auditable foundation.',
      accent: 'emerald',
      icon: 'shield',
      illustrationAlt: 'Executive metrics dashboard with time-to-deploy, license cost, compliance, and a velocity chart',
      cases: [
        { title: 'Ship faster without a platform team', text: 'Auth, RBAC, multi-tenancy, observability and compliance scanning are already built. Your product team ships from day one.' },
        { title: 'De-risk vendor choices', text: 'MIT-licensed open source. Public code, documented decisions, no per-seat fees. Audit and host it yourself.' },
        { title: 'Pass audits with generated reports', text: 'Security, accessibility and compliance posture reports are generated from real scan data, not self-assessment spreadsheets.' },
        { title: 'Scale from MVP to enterprise', text: 'Start with a single container. Move to multi-instance, multi-region or on-prem without changing the code.' },
      ],
      capabilities: ['MIT License', 'Multi-tenancy', 'Compliance scanner', 'VPAT accessibility', 'Passkeys / MFA', 'Self-hostable', 'Multi-cloud deploy', 'Redis scaling'],
    },
    {
      id: 'visionaryEntrepreneur',
      name: 'Visionary Entrepreneur',
      tagline: 'Turn the idea into infrastructure.',
      description: 'You need to validate fast and scale faster. Primebrick turns your backoffice from a cost center into a competitive edge: private AI, multi-tenant SaaS readiness, and an architecture that grows with your ambition — without license fees eating your runway.',
      shortDescription: 'Validate fast and scale faster, while keeping full control of the stack.',
      accent: 'amber',
      icon: 'lightning',
      illustrationAlt: 'Launch trajectory from idea to enterprise scale with $0 MIT license',
      cases: [
        { title: 'Launch an AI-native backoffice in days', text: 'Private LLM container, vector search and agentic development mean your product can be AI-first without third-party APIs.' },
        { title: 'Own the stack end to end', text: 'Open source, self-hostable and multi-cloud. Your IP, data and infrastructure decisions stay under your control.' },
        { title: 'Scale to multi-tenant SaaS', text: 'Built-in tenant isolation and a ConfigTable that renders settings automatically for every organization.' },
        { title: 'Fund product, not license fees', text: 'MIT license: use, modify, redistribute and embed in commercial products with no royalties.' },
      ],
      capabilities: ['Private LLM container', 'pgvector', 'Agentic GUI', 'Multi-tenant isolation', 'ConfigTable', 'MIT License', 'Self-hostable', 'Multi-cloud'],
    },
    {
      id: 'socTeam',
      name: 'SOC Team',
      tagline: 'Evidence, not promises.',
      description: 'You watch the system, investigate incidents, and answer to auditors. Primebrick gives you a tamper-evident audit trail, field-level access reviews, real-time security signals, and downloadable compliance evidence with file:line references — not marketing claims.',
      shortDescription: 'Get a tamper-evident audit trail and real signals for incident response.',
      accent: 'rose',
      icon: 'lock',
      illustrationAlt: 'Audit log with live security signals and a downloadable compliance report',
      cases: [
        { title: 'Tamper-evident audit logs', text: 'Every entity change is logged with actor, timestamp and before/after values. Audit fields are enforced by the framework, not by convention.' },
        { title: 'Field-level access reviews', text: 'RBAC and schema-level permissions are discoverable and reviewable. Remove access with confidence, not guesswork.' },
        { title: 'Real-time security signals', text: 'OpenTelemetry traces, structured logs and health checks give the SOC team live visibility into what the system is doing.' },
        { title: 'Downloadable compliance evidence', text: 'ISO 27001, NIS2 and OWASP mappings ship with file:line references as PDF reports — ready for auditors.' },
      ],
      capabilities: ['Tamper-evident audit', 'RBAC reviews', 'Step-up auth', 'OpenTelemetry', 'Structured logs', 'Health checks', 'ISO 27001 reports', 'NIS2 mapping', 'OWASP scanner'],
    },
  ],
  ui: {
    personaLabel: 'Persona',
    personaOf: '/ 06',
    whatChangesTitle: 'What changes for you',
    capabilitiesTitle: "Capabilities you'll use",
    nextPersonaLabel: 'Next persona →',
    backToStartLabel: 'Back to start →',
    allUseCasesLabel: 'All Use Cases',
  },
  finalCta: {
    title: 'Which seat are you sitting in?',
    text: 'Tell us your role and we\'ll point you to the Primebrick brick that moves the needle for you.',
    ctaContact: 'Get in touch',
    ctaDocs: 'Read the docs',
  },
}
```

### 5.2 Other locales

The same shape must be populated for `it`, `de`, `es`, `pt`, `fr`. The `id`, `accent`, `icon`, and `illustrationAlt` fields are the same across all languages; only `index.*`, `personas[].name/tagline/description/shortDescription/cases/capabilities`, `ui.*`, and `finalCta.*` are translated.

## 6. Impacted Files

### 6.1 New

- `src/pages/[lang]/use-cases/index.astro`
- `src/pages/[lang]/use-cases/developer.astro`
- `src/pages/[lang]/use-cases/tech-leader.astro`
- `src/pages/[lang]/use-cases/solution-architect.astro`
- `src/pages/[lang]/use-cases/cto.astro`
- `src/pages/[lang]/use-cases/visionary-entrepreneur.astro`
- `src/pages/[lang]/use-cases/soc-team.astro`
- `src/components/svelte/UseCasesMegaMenu.svelte` (mega menu component)

### 6.2 Modified

- `src/i18n/translations.ts` — add `useCases` section to all six language objects; add `useCases: 'Use Cases'` to each `nav` object.
- `src/pages/[lang]/index.astro` — add Use Cases nav item (rendering the mega menu) between Home and Docs.
- `src/pages/[lang]/contact.astro` — same nav update.
- `src/pages/[lang]/thank-you.astro` — same nav update.
- `src/pages/sitemap.xml.ts` — add the 7 new paths to `PAGE_PATHS` (or extend the path generation to cover the `use-cases/*` subtree).

### 6.3 Not impacted

- No new assets or images: all illustrations are inline SVG.
- No `package.json` changes.

## 7. Page Structure (shared pattern)

All 7 pages mirror `src/pages/[lang]/contact.astro` as the closest single-content-page pattern:

1. Frontmatter imports: `translations`, `LANGUAGES`, `LangCode`, `LanguageSwitcher`, `GitHubDropdown`, `GitHubIcon`, `TopBanner`, `UseCasesMegaMenu`, `pkg`, `../../styles/global.css`.
2. `export const prerender = true;`
3. `getStaticPaths()` returning one path per language.
4. Resolve `langCode`, `t`, `isEn`, `homeHref`, `contactHref`, `thankyouHref`, `useCasesIndexHref`, `docsPath`.
5. Full HTML document with `lang={langCode}`.
6. `<head>` with canonical/description, title, and `hreflang` alternates pointing to the relevant `/[lang]/use-cases/...` path.
7. Ambient gradient background div.
8. `<TopBanner>`.
9. Sticky nav with the `UseCasesMegaMenu` component between Home and Docs.
10. Inline scroll-condense script copied from existing pages.
11. Page-specific content (index grid or persona hero + illustration + benefits + capabilities + next-persona/CTA).
12. `<footer>` matching existing footer.

### 7.1 Persona page layout

- **Hero section**: persona number badge, `h1` persona name, tagline in accent color, description paragraph.
- **Illustration section**: full-width card (`rounded-2xl border border-slate-800/50 bg-slate-950/80 shadow-2xl`) containing the inline SVG wireframe/diagram.
- **Benefits section**: `h2` "What changes for you", 2-column grid of 4 cards (`rounded-2xl border border-slate-800/50 bg-slate-900/30 p-6 backdrop-blur-sm`), each with an accent-colored icon, title, and text.
- **Capabilities section**: `h2` "Capabilities you'll use", flex-wrap chip list with accent-colored borders/backgrounds.
- **Footer block**: 2-column grid — left card is the "Next persona →" link, right card is the CTA with "Get in touch" and "Read the docs" buttons.

### 7.2 Accent mapping

| Persona | Tailwind accent | Icon |
|---------|-----------------|------|
| Developer | `sky` | code brackets |
| Tech Leader | `indigo` | team / users |
| Solution Architect | `violet` | grid / layers |
| CTO | `emerald` | shield / check |
| Visionary Entrepreneur | `amber` | lightning |
| SOC Team | `rose` | lock / eye |

## 8. Nav Link & Mega Menu Decision

Add `useCases: 'Use Cases'` to `nav` in all six languages. Render the `UseCasesMegaMenu` component in the nav between **Home** and **Docs** on every page. The mega menu shows "All Use Cases" + the 6 persona links, with the current persona highlighted when applicable.

## 9. Sitemap Update

In `src/pages/sitemap.xml.ts`, extend `PAGE_PATHS` to include the 7 new paths:

```ts
const PAGE_PATHS = [
  '',
  'contact',
  'thank-you',
  'use-cases/',
  'use-cases/developer',
  'use-cases/tech-leader',
  'use-cases/solution-architect',
  'use-cases/cto',
  'use-cases/visionary-entrepreneur',
  'use-cases/soc-team',
] as const;
```

The existing `urlForPath` and alternate-generation logic then automatically emits all locales with correct `hreflang` and `x-default`.

## 10. Architectural Constraints

- `export const prerender = true` on all 7 new pages.
- No Node.js APIs in any `.astro` file.
- Tailwind CSS classes only; inline SVGs for illustrations and icons.
- kebab-case filenames.
- The only new Svelte component is `UseCasesMegaMenu.svelte` (small interactivity: open/close on click, close on outside click). Everything else is static Astro.
- No new runtime dependencies.

## 11. Acceptance Criteria

- [ ] All 7 pages are created and render for all 6 locales.
- [ ] `src/i18n/translations.ts` has a `useCases` section for `en`, `it`, `de`, `es`, `pt`, `fr`.
- [ ] The `UseCasesMegaMenu` component is rendered on home, contact, thank-you, and all use-cases pages.
- [ ] `src/pages/sitemap.xml.ts` includes all 7 new paths.
- [ ] `pnpm run build` succeeds with no errors.
- [ ] `pnpm astro check` passes (or introduces no new type errors).
- [ ] The design visually matches the PoC HTML previews in `D:\git\primebrick\temp\`.
- [ ] All pages are responsive on mobile, tablet, and desktop.
- [ ] All external links point to `https://docs.primebrick.dev` or the contact page.
- [ ] No new `package.json` dependencies.
- [ ] All commits include the required model trailer per `AGENTS.md`.

## 12. Out of Scope

- Creating the long-planned `/features` page.
- Additional Svelte interactivity beyond the mega menu open/close.
- Content collections or sync-script changes.
- Cloudflare Worker config changes.
- Release branch creation / deployment.

## 13. Suggested Implementation Order

1. Add the `useCases` translation block and `nav.useCases` label for all six locales in `src/i18n/translations.ts`.
2. Create `src/components/svelte/UseCasesMegaMenu.svelte`.
3. Create `src/pages/[lang]/use-cases/index.astro`.
4. Create the 6 persona pages.
5. Add the `UseCasesMegaMenu` to `index.astro`, `contact.astro`, `thank-you.astro`.
6. Update `src/pages/sitemap.xml.ts`.
7. Run `pnpm run build` and `pnpm astro check`.
8. Fix any build/type errors.
9. Verify the PoC HTML matches the final pages visually.
10. Commit after user approval and follow the normal GitFlow release process.

## 14. PoC Reference

Self-contained HTML previews have been created in `D:\git\primebrick\temp\`. All persona pages are long-form (40–47 KB each) with 8 benefit cards, persona-specific deep-dive sections, a quote, a 5-question FAQ, and a "Next persona →" footer link.

- `use-cases-index.html` — the short, strict index page with persona cards.
- `use-cases-developer.html` — Developer persona: IDE wireframe, "A day in the life" timeline, before/after comparison, SDK code snippet, FAQ.
- `use-cases-tech-leader.html` — Tech Leader persona: standards dashboard, onboarding flow, standards matrix, migration path, FAQ.
- `use-cases-solution-architect.html` — Solution Architect persona: 5-layer architecture diagram, layer deep-dive, deployment matrix, compliance report sample, FAQ.
- `use-cases-cto.html` — CTO persona: executive metrics + velocity chart, ROI breakdown, risk matrix, code-to-auditor flow, FAQ.
- `use-cases-visionary-entrepreneur.html` — Visionary Entrepreneur persona: launch trajectory, launch playbook, AI stack, SaaS scaling path, funding math, FAQ.
- `use-cases-soc-team.html` — SOC Team persona: audit log terminal, audit schema, incident response workflow, compliance report sample, RBAC review panel, FAQ.

Open `use-cases-index.html` first and click through the persona cards, or use the mega menu in the nav of any page to jump between personas. The PoCs intentionally omit the exact TopBanner component and full footer to keep the previews focused on the use-case content while preserving the overall Primebrick visual style.
