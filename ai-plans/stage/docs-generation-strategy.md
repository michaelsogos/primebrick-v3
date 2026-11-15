# Plan: Documentation Generation Strategy (B+C Hybrid)

## Status: DRAFT — awaiting user approval

## Context and decision history

The Primebrick docs site (`docs.primebrick.dev`, repo `primebrick-v3-docs`) currently
uses DeepWiki auto-generated content for per-repo documentation. This approach has
two problems:

1. **Format inconsistency**: DeepWiki produces Mermaid diagrams wrapped in ` ```Code `
   fenced blocks instead of ` ```mermaid ` or `<Mermaid chart={...} />`, so they don't
   render on the Zudoku site.
2. **Wrong audience**: DeepWiki content is a code-structure map (internal-facing),
   not user-facing developer documentation. The goal is docs that explain to a dev:
   how to call the API, how auth works, how to create a microservice, how to register
   a service, how NATS messaging works, what the MCP server can do, component usage,
   layout structures — with code examples and flow diagrams for complex flows.

### Decision (locked in with user, 2026-07-15)

- **Strategy**: B+C hybrid — docs-as-code in repo `docs/user-guide/` subdirectories
  (B), with AI-assisted generation via manual Devin sessions (C).
- **DeepWiki sync**: removed entirely. `sync-deepwiki.mjs` and `pages/*/deepwiki/`
  directories are deleted.
- **AI sessions**: launched manually by the user. No programmatic session creation
  via API. The user triggers a Devin session on a repo when docs need updating.
- **Deterministic extraction where possible**: use libs to extract structured facts
  (props, types, endpoints) from code, feed those to the AI session as context.
  This reduces variance — the AI writes narrative around deterministic facts,
  not the facts themselves.
- **Ordering**: page order in the sidebar is controlled by a `_order.json` manifest
  in each repo's `docs/user-guide/` directory, NOT alphabetical.

## Objectives

1. Replace DeepWiki auto-generated content with user-facing developer documentation
   written as MDX files, synced from per-repo `docs/user-guide/` directories.
2. Use deterministic extraction libraries to produce structured JSON facts from code:
   - **TypeDoc** for DAL and SDK (TypeScript libraries)
   - **`@svelte-docgen/extractor`** for Frontend (Svelte 5 components with runes)
   - **OpenAPI** for Backend (already integrated via Zudoku API Catalog)
   - Microservices: no extraction lib needed (docs are conceptual guides)
3. AI-generated narrative (guides, flow diagrams, code examples) is produced by
   manual Devin sessions with guardrails:
   - Diff-based: only pages whose source files changed are regenerated
   - Anchor to existing: prompt includes current MDX, instructs minimal edits
   - Marked sections: `<!-- AUTO-GENERATED:reference -->` blocks for extracted facts,
     human-written prose outside those blocks is never touched by AI
4. Sidebar navigation ordered by `_order.json` manifest (logical reading order),
   not alphabetical.
5. Devin rules in each repo guide AI agents on documentation conventions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  PER-REPO (BE, FE, US, DAL, SDK)                                    │
│                                                                     │
│  docs/                                                              │
│  ├── ai/              # existing — AI agent instructions (internal) │
│  ├── skills/          # existing — Devin skills (internal)          │
│  ├── gitflow.md       # existing — GitFlow rules (internal)         │
│  └── user-guide/      # NEW — user-facing docs, synced to site      │
│      ├── _order.json  # manifest: logical page order                │
│      ├── overview.mdx                                             │
│      ├── authentication.mdx                                       │
│      ├── creating-a-microservice.mdx                               │
│      └── ...                                                      │
│                                                                     │
│  .devin/rules/                                                      │
│  ├── docs-user-guide.md  # NEW — editorial conventions              │
│  └── docs-order.md       # NEW — _order.json usage                  │
│                                                                     │
│  AGENTS.md               # UPDATED — add "User-facing docs" section │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ manual Devin session (user-triggered)
                              │ reads code + existing MDX + extraction JSON
                              │ updates MDX with guardrails
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DOCS REPO (primebrick-v3-docs)                                     │
│                                                                     │
│  CI pipeline (GitHub Actions):                                      │
│  1. sync-repo-docs.mjs (extended)                                   │
│     - shallow clone each repo (--depth 1)                           │
│     - copy docs/user-guide/** → pages/<repo>/guide/                 │
│     - add frontmatter if missing                                    │
│     - ~30s total, pure I/O, no API calls                            │
│                                                                     │
│  2. generate-nav.mjs (extended)                                     │
│     - read _order.json from each pages/<repo>/guide/                │
│     - generate sidebar in logical order (fallback: alphabetical)    │
│     - write src/generated-nav.ts                                    │
│     - <1s, pure I/O                                                 │
│                                                                     │
│  3. zudoku build → deploy to Cloudflare Worker                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Deterministic extraction pipeline (per repo)

```
┌──────────────────────────────────────────────────────────────────┐
│ Backend (Express/TS)                                             │
│   OpenAPI spec (already exists) → Zudoku API Catalog             │
│   No additional extraction needed.                               │
│   AI writes: auth guide, RBAC guide, error handling guide,       │
│   service registry guide, proxy guide, OpenAPI aggregation guide │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Frontend (Svelte 5 + SvelteKit)                                  │
│   @svelte-docgen/extractor → JSON (props, types, snippets,       │
│   bindable, ARIA, data-attrs)                                    │
│   Uses svelte/compiler (Svelte 5 if svelte@5 installed)          │
│   → NO custom parser, delegates to official compiler             │
│   → recognizes $props(), $bindable(), Snippet, etc.              │
│   AI writes: component usage guides, layout patterns, i18n,      │
│   theming, routing, entity forms, with extracted props as facts  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Microservices (Docker/Node)                                      │
│   No extraction lib (docs are conceptual guides)                 │
│   AI writes: how to create a microservice, registration,        │
│   heartbeat, NATS messaging, OpenAPI scaffolding                 │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ DAL (TypeScript library)                                         │
│   TypeDoc → JSON (classes, methods, types, TSDoc comments)       │
│   AI writes: usage guide, connection management, repository      │
│   pattern, multi-tenant isolation, with extracted API as facts   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ SDK (TypeScript library)                                         │
│   TypeDoc → JSON (classes, methods, types, TSDoc comments)       │
│   AI writes: service registration guide, NATS helpers, auth      │
│   middleware, RFC 7807 error handling, with extracted API as facts│
└──────────────────────────────────────────────────────────────────┘
```

### AI generation flow (manual, user-triggered)

```
[User modifies code in a repo]
        │
        ▼
[User launches a Devin session on that repo]
   Prompt: "Review recent commits and update docs/user-guide/ MDX files
            that are affected by the changes. Use the extraction JSON
            for factual data (props, types, endpoints). Preserve existing
            prose structure. Use <Mermaid chart={...} /> for diagrams.
            Do NOT use ```Code blocks for Mermaid. Only edit files whose
            source has changed. If nothing changed, do nothing."
        │
        ▼
[Devin reads: code + existing MDX + .devin/rules/ + extraction JSON]
        │
        ▼
[Devin updates only affected MDX files in docs/user-guide/]
        │
        ▼
[User reviews diff, commits/merges to repo]
        │
        ▼
[CI: sync-repo-docs.mjs copies docs/user-guide/ → pages/<repo>/guide/]
[CI: generate-nav.mjs regenerates sidebar from _order.json]
        │
        ▼
[Deploy to docs.primebrick.dev]
```

## Impacted files

### Docs repo (primebrick-v3-docs)

| File | Action | Description |
|------|--------|-------------|
| `scripts/sync-deepwiki.mjs` | **DELETE** | Remove DeepWiki sync entirely |
| `scripts/sync-repo-docs.mjs` | **MODIFY** | Extend to copy `docs/user-guide/**` → `pages/<repo>/guide/` |
| `scripts/generate-nav.mjs` | **MODIFY** | Read `_order.json`, replace `deepwiki` with `guide` in SUBDIRS |
| `src/generated-nav.ts` | **REGENERATE** | Output of updated generate-nav.mjs |
| `pages/*/deepwiki/` (5 dirs) | **DELETE** | Remove all DeepWiki placeholder pages |
| `zudoku.config.tsx` | **MODIFY** | Update navigation references from `deepwiki` to `guide` |
| `AGENTS.md` | **MODIFY** | Remove DeepWiki references, document new sync flow |
| `package.json` | **MODIFY** | Remove `DEVIN_API_KEY` dependency note if present |

### Per-repo (BE, FE, US, DAL, SDK) — 5 repos × same changes

| File | Action | Description |
|------|--------|-------------|
| `docs/user-guide/` | **CREATE** | New directory for user-facing MDX docs |
| `docs/user-guide/_order.json` | **CREATE** | Page order manifest |
| `docs/user-guide/*.mdx` | **CREATE** | Initial page set (generated by first Devin session) |
| `.devin/rules/docs-user-guide.md` | **CREATE** | Editorial conventions rule |
| `.devin/rules/docs-order.md` | **CREATE** | `_order.json` usage rule |
| `AGENTS.md` | **MODIFY** | Add "User-facing documentation" section |

### Frontend repo only (primebrick-fe-v3)

| File | Action | Description |
|------|--------|-------------|
| `package.json` | **MODIFY** | Add `@svelte-docgen/extractor` as devDependency (pinned version) |
| `scripts/extract-component-docs.mjs` | **CREATE** | Script to run svelte-docgen extractor → JSON output |

### DAL repo only (primebrick-dal-v3)

| File | Action | Description |
|------|--------|-------------|
| `package.json` | **MODIFY** | Add `typedoc` as devDependency (pinned version) |
| `typedoc.json` | **CREATE** | TypeDoc config for JSON output |
| `scripts/extract-api-docs.mjs` | **CREATE** | Script to run TypeDoc → JSON output |

### SDK repo only (primebrick-v3-sdk)

| File | Action | Description |
|------|--------|-------------|
| `package.json` | **MODIFY** | Add `typedoc` as devDependency (pinned version) |
| `typedoc.json` | **CREATE** | TypeDoc config for JSON output |
| `scripts/extract-api-docs.mjs` | **CREATE** | Script to run TypeDoc → JSON output |

## `_order.json` schema

```json
{
  "$schema": "https://primebrick.dev/schemas/docs-order.json",
  "pages": [
    "overview",
    "authentication",
    "rbac",
    "creating-a-microservice",
    "registering-a-service",
    "nats-messaging",
    "mcp-server"
  ]
}
```

- `pages`: array of page slugs (filename without `.mdx`), in logical reading order.
- Pages not listed in `_order.json` are appended at the end, alphabetically.
- If `_order.json` is missing, fallback to full alphabetical order.
- `index` is always excluded from ordering (it's the category landing page).

## Devin rules content

### `.devin/rules/docs-user-guide.md` (per repo)

```markdown
# Devin Rule: User-Facing Documentation

## Trigger
- Applies whenever AI agent creates or updates files in `docs/user-guide/`.

## Editorial conventions

1. **Audience**: external developers using Primebrick. Not internal team, not
   AI agents. Write as if explaining to a dev who just cloned the repo.
2. **Tone**: direct, technical, no marketing language. "The auth middleware
   validates JWT tokens on every request" — not "Our amazing auth system
   beautifully handles security."
3. **Code examples**: always complete and runnable. Show imports, show
   context. Never partial snippets that won't compile.
4. **Diagrams**: use `<Mermaid chart={...} />` component (Zudoku client-side
   rendering). NEVER use ` ```Code ` or ` ```mermaid ` fenced blocks for
   Mermaid — they will not render on the docs site.
5. **Structure**: each page has:
   - Frontmatter: `title`, `description`
   - H2 sections with clear headings
   - Code examples in fenced blocks with correct language tags
   - "Next steps" links at the bottom to related pages
6. **Language**: English only (per AGENTS.md).
7. **Incremental updates**: when updating an existing page, preserve the
   existing prose structure. Make minimal edits. Do NOT rewrite the entire
   page unless the source code has fundamentally changed.
8. **Marked sections**: blocks wrapped in `<!-- AUTO-GENERATED:reference -->`
   ... `<!-- END -->` contain extracted API facts. Update these from the
   extraction JSON. Never modify prose outside these blocks unless the
   underlying concept has changed.

## Forbidden
- ❌ ` ```Code ` blocks for Mermaid diagrams
- ❌ ` ```mermaid ` fenced blocks (use `<Mermaid chart={...} />` instead)
- ❌ Rewriting unchanged pages (creates git diff churn)
- ❌ Inventing APIs, props, or endpoints not in the extraction JSON or code
- ❌ Marketing language or superlatives
```

### `.devin/rules/docs-order.md` (per repo)

```markdown
# Devin Rule: Documentation Page Order

## Trigger
- Applies whenever AI agent creates or deletes a page in `docs/user-guide/`.

## Actions
1. When creating a new `.mdx` page, add its slug to `docs/user-guide/_order.json`
   in the logical reading position (not at the end, not alphabetically).
2. When deleting a page, remove its slug from `_order.json`.
3. The `_order.json` `pages` array defines the sidebar order on
   docs.primebrick.dev. Pages not listed are appended alphabetically after
   listed pages.
4. `index.mdx` is always excluded — it's the category landing page, not a
   sidebar item.

## _order.json format
```json
{
  "pages": ["overview", "authentication", "rbac", "..."]
}
```
```

## Implementation phases

### Phase 1: Docs repo cleanup + script updates

1. Delete `scripts/sync-deepwiki.mjs`
2. Delete `pages/*/deepwiki/` directories (5 dirs)
3. Extend `scripts/sync-repo-docs.mjs`:
   - Add `docs/user-guide/` copy logic (recursive, preserves subdirectories)
   - Keep README copy as `overview.md` in `pages/<repo>/guide/` if no
     `overview.mdx` exists in `docs/user-guide/`
4. Extend `scripts/generate-nav.mjs`:
   - Replace `SUBDIRS = ['deepwiki', 'manual']` with `SUBDIRS = ['guide']`
   - Add `_order.json` reading logic
   - Order pages by manifest, fallback alphabetical
5. Update `zudoku.config.tsx` navigation references
6. Update `AGENTS.md` (remove DeepWiki, document new flow)
7. Test: run scripts, verify `generated-nav.ts` output

### Phase 2: Per-repo scaffolding (5 repos)

For each of BE, FE, US, DAL, SDK:
1. Create `docs/user-guide/` directory
2. Create `docs/user-guide/_order.json` (empty pages array initially)
3. Create `.devin/rules/docs-user-guide.md`
4. Create `.devin/rules/docs-order.md`
5. Update `AGENTS.md` with "User-facing documentation" section

### Phase 3: Extraction tooling (FE, DAL, SDK only)

**Frontend**:
1. `pnpm add -D @svelte-docgen/extractor` (pin exact version)
2. Create `scripts/extract-component-docs.mjs`:
   - Scan `src/lib/components/**/*.svelte`
   - Run `parse()` + analyze via svelte-docgen
   - Output JSON to `docs/user-guide/_extracted/components.json`
3. Add to `package.json` scripts: `"extract-docs": "node scripts/extract-component-docs.mjs"`

**DAL**:
1. `pnpm add -D typedoc` (pin exact version)
2. Create `typedoc.json` with JSON output mode
3. Create `scripts/extract-api-docs.mjs`
4. Output to `docs/user-guide/_extracted/api.json`
5. Add to `package.json` scripts: `"extract-docs": "node scripts/extract-api-docs.mjs"`

**SDK**: same as DAL.

### Phase 4: Initial documentation generation (manual Devin sessions)

For each repo, the user launches a Devin session with a repo-specific prompt:

**Backend prompt template**:
```
Generate the initial user-facing documentation for the Primebrick backend
in docs/user-guide/. The backend is an Express + TypeScript API that handles
auth (Casdoor OIDC), RBAC, service registry, round-robin proxy, and OpenAPI
aggregation.

Create these pages (add them to _order.json in this order):
1. overview.mdx — what the backend does, architecture summary
2. authentication.mdx — JWT flow, Casdoor OIDC integration, token refresh
3. rbac.mdx — permission system, roles, how to check permissions
4. service-registry.mdx — how services register, heartbeat protocol
5. proxy.mdx — round-robin proxy at /ws/:code, load balancing
6. error-handling.mdx — RFC 7807 format, common error codes
7. openapi-aggregation.mdx — how specs are merged, /openapi/aggregated.json

Follow .devin/rules/docs-user-guide.md for conventions.
Use <Mermaid chart={...} /> for flow diagrams.
Include runnable code examples (curl, fetch, SDK calls).
```

**Frontend prompt template**:
```
Generate the initial user-facing documentation for the Primebrick frontend
in docs/user-guide/. The frontend is a Svelte 5 + SvelteKit admin UI.

First run: pnpm extract-docs
This produces docs/user-guide/_extracted/components.json with props, types,
snippets for all components.

Create these pages (add them to _order.json in this order):
1. overview.mdx — frontend architecture, tech stack
2. project-structure.mdx — directory layout, conventions
3. components.mdx — UI component library, how to use them (use extracted props)
4. entity-forms.mdx — form system, audit, validation
5. entity-list.mdx — table system, filtering, column management
6. i18n.mdx — internationalization, message bundles, locale config
7. theming.mdx — theme system, dark mode, CSS variables
8. routing.mdx — route structure, modules, lazy loading

Follow .devin/rules/docs-user-guide.md for conventions.
Use <Mermaid chart={...} /> for flow diagrams.
Use extracted component data from _extracted/components.json for props tables.
Include runnable Svelte code examples.
```

**Microservices prompt template**:
```
Generate the initial user-facing documentation for Primebrick microservices
in docs/user-guide/. Microservices are independent Docker/Node services that
self-register with the backend and communicate via NATS.

Create these pages (add them to _order.json in this order):
1. overview.mdx — microservice architecture, lifecycle
2. creating-a-microservice.mdx — step-by-step: scaffold, SDK setup, Docker
3. registering-a-service.mdx — registration protocol, heartbeat, health checks
4. nats-messaging.mdx — pub/sub, request/reply, subject conventions
5. openapi-scaffolding.mdx — how to expose /api/v1/openapi.json
6. deployment.mdx — Docker, environment variables, scaling

Follow .devin/rules/docs-user-guide.md for conventions.
Use <Mermaid chart={...} /> for sequence diagrams (registration, NATS flow).
Include runnable code examples using @primebrick/sdk.
```

**DAL prompt template**:
```
Generate the initial user-facing documentation for @primebrick/dal in
docs/user-guide/. DAL is a TypeScript data access layer library for PostgreSQL.

First run: pnpm extract-docs
This produces docs/user-guide/_extracted/api.json with TypeDoc output.

Create these pages (add them to _order.json in this order):
1. overview.mdx — what DAL does, architecture
2. connection-management.mdx — pool config, multi-tenant connections
3. repository-pattern.mdx — how to define and use repositories
4. multi-tenant-isolation.mdx — tenant scoping, how it works
5. migrations.mdx — schema management approach
6. api-reference.mdx — use extracted TypeDoc data for classes/methods

Follow .devin/rules/docs-user-guide.md for conventions.
Use <Mermaid chart={...} /> for data flow diagrams.
Include runnable TypeScript code examples.
```

**SDK prompt template**:
```
Generate the initial user-facing documentation for @primebrick/sdk in
docs/user-guide/. SDK is the shared toolkit for Primebrick microservices.

First run: pnpm extract-docs
This produces docs/user-guide/_extracted/api.json with TypeDoc output.

Create these pages (add them to _order.json in this order):
1. overview.mdx — what the SDK provides
2. service-registration.mdx — registerService(), heartbeat management
3. nats-helpers.mdx — publish(), subscribe(), requestReply()
4. auth-middleware.mdx — JWT validation middleware, RBAC middleware
5. error-handling.mdx — RFC 7807 helpers, standardized errors
6. openapi-scaffolding.mdx — OpenAPI spec generation helpers
7. api-reference.mdx — use extracted TypeDoc data for classes/methods

Follow .devin/rules/docs-user-guide.md for conventions.
Use <Mermaid chart={...} /> for sequence diagrams.
Include runnable TypeScript code examples.
```

### Phase 5: CI integration

1. Update GitHub Actions workflow in docs repo:
   - Remove `sync-deepwiki.mjs` step
   - Update `sync-repo-docs.mjs` step (now copies `docs/user-guide/`)
   - Keep `generate-nav.mjs` step
   - Remove `DEVIN_API_KEY` secret requirement
2. Verify CI pipeline runs: sync → nav → build → deploy

## Acceptance criteria

1. `sync-deepwiki.mjs` is deleted, no DeepWiki content on the docs site.
2. `pages/*/deepwiki/` directories are removed.
3. `sync-repo-docs.mjs` copies `docs/user-guide/**` → `pages/<repo>/guide/`.
4. `generate-nav.mjs` reads `_order.json` and produces logical-order sidebar.
5. Each of the 5 repos has `docs/user-guide/` with `_order.json` and initial pages.
6. Each repo has `.devin/rules/docs-user-guide.md` and `.devin/rules/docs-order.md`.
7. FE repo has `@svelte-docgen/extractor` + extraction script producing JSON.
8. DAL and SDK repos have TypeDoc + extraction scripts producing JSON.
9. All Mermaid diagrams use `<Mermaid chart={...} />`, never ` ```Code `.
10. CI pipeline deploys docs site with new content, no DeepWiki references.
11. Sidebar shows pages in `_order.json` order, not alphabetical.

## Key design decisions

1. **`sveld` over `@svelte-docgen/extractor`** (changed during implementation):
   svelte-docgen@0.1.0 has `peerDependencies: { typescript: "^5.7.0" }` but the
   FE repo uses TypeScript 6.0.3 — all 264 components failed with "render fn
   not found". sveld@0.36.0 bundles its own Svelte 5 compiler with no TypeScript
   peer dependency. Result: 264 components parsed, 0 errors, 253 with props.
   sveld's `ComponentParser.parseSvelteComponent()` produces JSON with props
   (array), slots, events, typedefs, contexts, moduleExports, syntaxMode
   ("runes"), scriptLanguage ("ts").
2. **`@svelte-docgen/extractor` over `veld`**: veld uses Svelte 4 compiler
   with TS fallback — partial rune support only (props, no slots/events/
   snippets). svelte-docgen uses `svelte/compiler` directly — full rune support.
3. **`_order.json` over frontmatter `order: N`**: manifest is easier to
   reorder (move one line vs edit numbers across files), doesn't pollute
   frontmatter, and is a single source of truth for ordering.
4. **`docs/user-guide/` subdirectory over root `docs/`**: the `docs/`
   directory already contains `ai/`, `skills/`, `gitflow.md` used by AI
   agents. A subdirectory avoids mixing user-facing content with internal
   AI instructions.
5. **Manual Devin sessions over programmatic API**: the user launches
   sessions manually. No `generate-docs.mjs` script that calls
   `devin_session_create`. This keeps the AI generation under human control
   and avoids unbounded API costs.
6. **Marked sections (`<!-- AUTO-GENERATED:reference -->`)**: extracted API
   facts go in marked blocks. AI updates only those blocks. Human-written
   prose outside the blocks is preserved across regenerations. This is the
   primary guardrail against git diff churn.
7. **TypeDoc for DAL/SDK**: both are TypeScript libraries where the API
   reference IS the documentation. TypeDoc extracts it deterministically.
   No AI needed for the reference — only for the usage guides around it.
8. **No extraction lib for Microservices**: microservice docs are
   conceptual (how-to guides, protocols, flows). There's no API surface
   to extract — the SDK provides the API, the microservice consumes it.

## Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| AI regenerates unchanged pages → git diff churn | Diff-based prompt + marked sections + "if nothing changed, do nothing" instruction |
| AI invents APIs not in code | Extraction JSON provides ground truth; rule says "never invent" |
| svelte-docgen is beta | It uses `svelte/compiler` (official, stable). The beta is in the docgen layer, not the parser. Fallback: `sveld` (production-grade, Carbon Design System) |
| TypeDoc output format changes between versions | Pin exact version in package.json (per project rules) |
| `_order.json` gets out of sync with actual files | generate-nav.mjs handles missing entries (appends alphabetically) and ignores extra entries |
| Extraction scripts slow down CI | Extraction runs on-demand (manual), NOT in CI. CI only does file copy + nav generation. |
