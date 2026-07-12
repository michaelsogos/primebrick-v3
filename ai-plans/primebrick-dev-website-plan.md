---

# Plan: Primebrick Product Website (primebrick.dev)

## Status: AWAITING APPROVAL
## Created: 2026-07-12
## Type: New project scaffold + BE endpoint + CI integration

---

## 1. Objectives

Create a new repository `primebrick-v3-website` containing an Astro-based product website for `primebrick.dev` that serves three purposes:

1. **Institutional / marketing landing pages** — product overview, features, pricing, etc.
2. **Project documentation** — architecture docs, guides, API references sourced from:
   - Hand-written MD files in each repo's `docs/` folder (synced via CI)
   - DeepWiki-generated content (synced from Devin's hosted DeepWiki via MCP)
3. **OpenAPI REPL / API explorer** — interactive API docs with live try-it and multi-language code generation, powered by Scalar, consuming the BE's OpenAPI spec (including aggregated microservice specs).

### Key constraints (empirically verified)

- **Deployment**: Cloudflare Workers free plan (hybrid rendering: prerendered pages served from Assets binding = free/unlimited/0ms CPU; Worker only invoked for SSR/404 = 10ms CPU limit, 100K req/day). No DB, no storage. `nodejs_compat` flag enabled.
- **UI framework**: Svelte (via `@astrojs/svelte`) for interactive components — reuses FE team knowledge.
- **Astro supports React, Vue, Svelte, Solid, Preact, Alpine** — confirmed. Svelte selected.
- **Astro Content Collections** — confirmed. MD/MDX files in `src/content/` are type-checked and rendered. Hot-reloads in dev mode, rebuilds on git push in production.
- **DeepWiki (Devin hosted)**: Wikis for all 5 repos are NOT yet generated (MCP returned "not generated yet"). No `.devin/wiki.json` steering files exist in any repo. Content lives on `app.devin.ai`, accessible via Devin MCP (`https://mcp.devin.ai/mcp`) with API key. **No webhook, no auto-export, no REST API** — sync must be a CI script using the MCP protocol.
- **DeepWiki-Open (self-hosted)**: Has `/export/wiki` → MD/JSON, supports private repos with GitHub token. NOT chosen — too much infra for a free-plan deployment. Devin's hosted DeepWiki + CI sync is sufficient.
- **Repos are public on GitHub** but DeepWiki is in private mode (not published to deepwiki.com community yet).
- **`@modelcontextprotocol/sdk`** (Node.js) supports Streamable HTTP transport — can call Devin MCP from a CI script programmatically.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  primebrick-v3-website  (NEW repo, Astro static site)                      │
│  Deployed to: Cloudflare Pages (free plan)                          │
│  Domain: primebrick.dev                                              │
│                                                                     │
│  src/                                                               │
│  ├── pages/                                                         │
│  │   ├── index.astro              (landing page)                    │
│  │   ├── features/               (marketing pages)                  │
│  │   ├── pricing/                (marketing page)                   │
│  │   ├── docs/                   (Starlight docs root)              │
│  │   │   ├── backend/            (BE docs from DeepWiki + docs/)    │
│  │   │   ├── frontend/           (FE docs from DeepWiki + docs/)    │
│  │   │   ├── microservices/      (US docs from DeepWiki + docs/)    │
│  │   │   ├── dal/                (DAL docs from DeepWiki + docs/)   │
│  │   │   ├── sdk/                (SDK docs from DeepWiki + docs/)   │
│  │   │   └── api-reference/      (OpenAPI REPL page)                │
│  │   └── api-explorer/           (Scalar OpenAPI REPL)              │
│  ├── content/                     (Content Collections — MD files)  │
│  │   ├── docs/                   (synced DeepWiki + in-repo docs)   │
│  │   └── marketing/              (hand-written marketing MD)        │
│  ├── components/                  (Svelte + Astro components)       │
│  │   ├── svelte/                 (interactive Svelte components)   │
│  │   └── astro/                  (static Astro components)          │
│  └── layouts/                                                      │
│                                                                     │
│  scripts/                                                           │
│  └── sync-deepwiki.mjs           (CI sync script — MCP client)      │
│  └── sync-repo-docs.mjs          (CI sync script — in-repo docs)    │
│                                                                     │
│  .github/workflows/                                                 │
│  ├── sync-deepwiki.yml           (triggered on release/cron)        │
│  └── deploy.yml                  (build + deploy to Cloudflare)     │
└─────────────────────────────────────────────────────────────────────┘
         │                                    │
         │ CI sync (MCP)                      │ CI sync (git clone)
         ▼                                    ▼
┌──────────────────────┐          ┌──────────────────────────┐
│  Devin MCP            │          │  GitHub repos             │
│  https://mcp.devin.ai │          │  michaelsogos/            │
│  /mcp                 │          │    primebrick-v3-backend  │
│                       │          │    primebrick-v3-frontend │
│  read_wiki_structure  │          │    primebrick-v3-micro... │
│  read_wiki_contents   │          │    primebrick-v3-dal      │
│                       │          │    primebrick-v3-sdk      │
│  (API key auth)       │          │                           │
│  (5 repos registered) │          │  docs/ folders synced     │
└──────────────────────┘          └──────────────────────────┘

         ┌──────────────────────────────────────────────┐
         │  primebrick-be-v3  (existing, minor change)  │
         │                                              │
         │  NEW endpoint:                               │
         │  GET /api/v1/openapi/aggregated.json         │
         │  → BE spec + merged US specs from registry   │
         │  → paths prefixed with /ws/:serviceCode      │
         │                                              │
         │  EXISTING:                                   │
         │  GET /api/v1/openapi.json (BE spec only)     │
         │  /ws/:serviceCode/v1/... (proxy)             │
         └──────────────────────────────────────────────┘
```

---

## 3. New Repository: `primebrick-v3-website`

### 3.1 Repo creation

- **Location**: `d:\git\primebrick\primebrick-v3-website` (local), `michaelsogos/primebrick-v3-website` (GitHub)
- **Git**: independent repository (same pattern as other Primebrick repos)
- **Package manager**: pnpm (consistent with workspace)
- **Node**: 24 (consistent with FE/BE)

### 3.2 Astro project scaffold

```bash
pnpm create astro@latest primebrick-v3-website -- --template minimal --typescript strict --no-install
cd primebrick-v3-website
pnpm install
```

### 3.3 Dependencies (all FIXED versions, no ranges)

```jsonc
{
  "devDependencies": {
    "astro": "<latest-stable>",
    "@astrojs/svelte": "<latest>",
    "@astrojs/cloudflare": "<latest>",  // REQUIRED — Cloudflare Workers adapter
    "@astrojs/starlight": "<latest>",
    "@astrojs/check": "<latest>",
    "typescript": "<latest>",
    "svelte": "<latest>",
    "@sveltejs/vite-plugin-svelte": "<latest>",
    "tailwindcss": "<latest>",
    "@tailwindcss/vite": "<latest>"
  },
  "dependencies": {
    "@scalar/astro": "<latest>",           // OpenAPI API Reference component
    "@modelcontextprotocol/sdk": "<latest>" // MCP client for DeepWiki sync script
  }
}
```

> Version pinning: all versions must be exact (per workspace rules). Run `pnpm add` for each to get the latest stable, then lock.

### 3.4 Astro config

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import starlight from '@astrojs/starlight';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://primebrick.dev',
  output: 'hybrid',  // prerender by default; per-page opt-in to SSR
  adapter: cloudflare({
    imageService: 'compile',
    platformProxy: { enabled: true },
  }),
  integrations: [
    svelte(),
    starlight({
      title: 'Primebrick',
      logo: { src: './src/assets/logo.svg' },
      social: { github: 'https://github.com/michaelsogos/primebrick-v3-backend' },
      sidebar: [
        // Auto-generated from content collections (see sync scripts)
        { label: 'Getting Started', items: [] },
        { label: 'Backend', items: [] },
        { label: 'Frontend', items: [] },
        { label: 'Microservices', items: [] },
        { label: 'DAL', items: [] },
        { label: 'SDK', items: [] },
        { label: 'API Reference', items: [] },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

### 3.5 Content Collections structure

```
src/content/
├── docs/
│   ├── backend/
│   │   ├── deepwiki/              # synced from Devin DeepWiki
│   │   │   ├── overview.md
│   │   │   ├── architecture.md
│   │   │   ├── modules/
│   │   │   └── ...
│   │   └── manual/                # synced from repo docs/ folder
│   │       ├── gitflow.md
│   │       ├── ai/
│   │       └── modules/
│   ├── frontend/
│   │   ├── deepwiki/
│   │   └── manual/
│   ├── microservices/
│   │   ├── deepwiki/
│   │   └── manual/
│   ├── dal/
│   │   ├── deepwiki/
│   │   └── manual/
│   ├── sdk/
│   │   ├── deepwiki/
│   │   └── manual/
│   └── api-reference/
│       └── overview.md            # hand-written intro to API explorer
├── marketing/
│   ├── features.md
│   ├── pricing.md
│   └── ...
└── config.ts                      # Content Collections schema
```

### 3.6 Content Collections schema

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const docsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    source: z.enum(['deepwiki', 'manual', 'handwritten']),
    repo: z.string().optional(),        // e.g. 'primebrick-v3-backend'
    deepwiki_page_id: z.string().optional(),
    last_synced_at: z.string().optional(), // ISO timestamp
    draft: z.boolean().default(false),
  }),
});

const marketingCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    sort_order: z.number().optional(),
  }),
});

export const collections = {
  docs: docsCollection,
  marketing: marketingCollection,
};
```

---

## 4. OpenAPI REPL / API Explorer Page

### 4.1 Scalar integration

Use `@scalar/astro` — the official Scalar API Reference component for Astro.

```astro
---
// src/pages/api-explorer/index.astro
import { ScalarComponent } from '@scalar/astro';
---

<ScalarComponent
  configuration={{
    spec: {
      url: '/api/openapi-aggregated.json',  // static copy fetched at build or client-side
    },
    hideModels: false,
    showSidebar: true,
    theme: 'default',
    layout: 'modern',
  }}
/>
```

### 4.2 How the OpenAPI spec reaches the explorer

**Architecture for Cloudflare Workers:**

The OpenAPI explorer page is **prerendered** (`export const prerender = true`) — it's a static HTML page. Scalar runs entirely client-side in the browser. The spec is fetched client-side via `fetch()` from the BE URL the user configures in Scalar's server selector.

**Why not SSR for this page?**
- Workers free plan has a 10ms CPU time limit per request. Fetching the BE spec server-side would work (network wait doesn't count as CPU), but there's no benefit — the user wants to configure the BE host dynamically, so the spec URL isn't known at server render time.
- Prerendered = served from Workers Assets binding = 0 Worker CPU, 0 request count, free and unlimited.

**Confirmed approach**: Client-side fetch with Scalar's built-in server selector. The page is prerendered (static), Scalar runs in the browser, and the user configures the BE host + auth in the Scalar UI. Zero Worker CPU cost.

### 4.3 Auth in the REPL

Scalar supports auth configuration in the UI:
- **Bearer token** — user pastes a JWT
- **API key** — header or query param
- **OAuth2 client_credentials** — Scalar supports OAuth2 flows
- **No auth** — for public endpoints

No custom auth code needed — Scalar handles it natively.

---

## 5. BE Change: Aggregated OpenAPI Endpoint

### 5.1 New endpoint in `primebrick-be-v3`

**File**: `src/openapi/aggregated-router.ts` (NEW)
**Route**: `GET /api/v1/openapi/aggregated.json`
**Auth**: Public (mounted before the auth guard, same as existing `/api/v1/openapi.json`)

### 5.2 Logic

```typescript
// src/openapi/aggregated-router.ts
import { Router } from "express";
import { openapi } from "./openapi.js";
import { getPool } from "../db/pool.js";
import { ServiceRegistryRepo } from "../modules/proxy/service-registry-repo.js";

export function aggregatedOpenApiRouter() {
  const router = Router();

  router.get("/api/v1/openapi/aggregated.json", async (_req, res) => {
    const pool = getPool();
    const repo = new ServiceRegistryRepo(pool);
    const services = await repo.findAll();

    // Start with BE's own spec
    const aggregated = JSON.parse(JSON.stringify(openapi));

    // For each online microservice, fetch its OpenAPI and merge
    for (const svc of services) {
      if (svc.status !== "online" || !svc.is_enabled) continue;

      try {
        const specUrl = new URL("/api/openapi.json", svc.base_url).toString();
        const response = await fetch(specUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) continue;

        const svcSpec = await response.json();

        // Prefix microservice paths with /ws/:serviceCode
        // so they match the existing proxy
        for (const [path, methods] of Object.entries(svcSpec.paths || {})) {
          const proxiedPath = `/ws/${svc.code}${path}`;
          aggregated.paths[proxiedPath] = methods;

          // Add server-level metadata
          if (!aggregated.tags) aggregated.tags = [];
          aggregated.tags.push({
            name: svc.code,
            description: svc.description || `${svc.name || svc.code} microservice`,
          });
        }
      } catch (err) {
        console.error(`[openapi-aggregated] Failed to fetch spec for ${svc.code}:`, err);
        // Skip unavailable services — the spec stays partial but valid
      }
    }

    // Add server info
    aggregated.info = {
      ...aggregated.info,
      title: "Primebrick Aggregated API",
      description: "Combined API spec for the Primebrick backend and all online microservices.",
    };

    res.json(aggregated);
  });

  return router;
}
```

### 5.3 Mount in `src/index.ts`

```typescript
// Add after the existing openApiRouter() mount (line ~151)
import { aggregatedOpenApiRouter } from "./openapi/aggregated-router.js";
app.use(aggregatedOpenApiRouter());
```

### 5.4 Caching (optional optimization)

The aggregated endpoint fetches from all online microservices on every request. For production, add a short in-memory cache (e.g. 30-60 seconds) to avoid hammering microservices:

```typescript
let cachedSpec: { spec: unknown; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000;

// In the handler:
if (cachedSpec && Date.now() - cachedSpec.timestamp < CACHE_TTL_MS) {
  res.json(cachedSpec.spec);
  return;
}
// ... build spec ...
cachedSpec = { spec: aggregated, timestamp: Date.now() };
res.json(aggregated);
```

### 5.5 Impacted files in BE

| File | Change |
|------|--------|
| `src/openapi/aggregated-router.ts` | NEW — aggregated OpenAPI endpoint |
| `src/index.ts` | MODIFY — mount the new router (1 import + 1 app.use) |

No other BE files touched. No signature changes. No shared state changes.

---

## 6. DeepWiki Sync Mechanism

### 6.1 Prerequisites (must be done FIRST, manually by user)

1. **Generate wikis** for all 5 repos on `app.devin.ai`:
   - Visit `https://app.devin.ai/wiki/michaelsogos/primebrick-v3-backend` and trigger generation
   - Repeat for: frontend, microservices, dal, sdk
   - Verify each wiki appears and has content

2. **Add `.devin/wiki.json`** steering file to each repo (optional but recommended):
   ```json
   {
     "repo_notes": [
       {
         "content": "Primebrick v3 backend. Express + TypeScript. RBAC with Casdoor IDP. Service registry for microservices. DAL via @primebrick/dal-pg.",
         "author": "maintainer"
       }
     ]
   }
   ```
   This steers DeepWiki to focus on the right architecture. Without it, DeepWiki uses auto-planning which may miss important modules.

3. **Generate a Devin API key**:
   - Go to Devin account settings → Service users → Create service user key
   - Key prefix: `cog_`
   - Store as GitHub secret: `DEVIN_API_KEY` in the `primebrick-v3-website` repo

### 6.2 Sync script: `scripts/sync-deepwiki.mjs`

```javascript
#!/usr/bin/env node
/**
 * Sync DeepWiki content to Astro content collections.
 * Calls Devin MCP (https://mcp.devin.ai/mcp) with API key.
 * Fetches wiki structure + contents for each repo, writes MD files.
 *
 * Usage: node scripts/sync-deepwiki.mjs
 * Requires: DEVIN_API_KEY environment variable
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const REPOS = [
  { name: 'michaelsogos/primebrick-v3-backend',    slug: 'backend',       dir: 'src/content/docs/backend/deepwiki' },
  { name: 'michaelsogos/primebrick-v3-frontend',   slug: 'frontend',     dir: 'src/content/docs/frontend/deepwiki' },
  { name: 'michaelsogos/primebrick-v3-microservices', slug: 'microservices', dir: 'src/content/docs/microservices/deepwiki' },
  { name: 'michaelsogos/primebrick-v3-dal',         slug: 'dal',          dir: 'src/content/docs/dal/deepwiki' },
  { name: 'michaelsogos/primebrick-v3-sdk',         slug: 'sdk',          dir: 'src/content/docs/sdk/deepwiki' },
];

const API_KEY = process.env.DEVIN_API_KEY;
if (!API_KEY) throw new Error('DEVIN_API_KEY environment variable required');

async function syncRepo(client, repo) {
  console.log(`Syncing DeepWiki for ${repo.name}...`);

  // 1. Get wiki structure (TOC)
  const structureResult = await client.callTool({
    name: 'read_wiki_structure',
    arguments: { repoName: repo.name },
  });
  const structureText = structureResult.content?.[0]?.text || '';
  const structure = JSON.parse(structureText);

  // 2. Get full wiki contents
  const contentsResult = await client.callTool({
    name: 'read_wiki_contents',
    arguments: { repoName: repo.name },
  });
  const contentsText = contentsResult.content?.[0]?.text || '';

  // 3. Write structure as a navigation index
  const indexDir = join(process.cwd(), repo.dir);
  mkdirSync(indexDir, { recursive: true });

  // 4. Parse structure and write individual MD files
  // The structure contains page slugs/titles; contents contains the full text.
  // Split contents by page sections and write individual files.
  // (Implementation detail: parse the structure to extract page slugs,
  //  then split the contents text by section headers matching those slugs.)

  const timestamp = new Date().toISOString();
  const pages = structure.pages || structure.topics || [];

  for (const page of pages) {
    const slug = page.slug || page.id || String(page.title).toLowerCase().replace(/\s+/g, '-');
    const title = page.title || slug;
    const content = page.content || extractSection(contentsText, slug);

    const md = `---
title: "${title}"
source: deepwiki
repo: "${repo.name}"
deepwiki_page_id: "${slug}"
last_synced_at: "${timestamp}"
---

${content}
`;

    const filePath = join(indexDir, `${slug}.md`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, md, 'utf-8');
    console.log(`  Wrote ${filePath}`);
  }

  // 5. Write full contents as a fallback single file
  const fullMd = `---
title: "${repo.slug} — Full DeepWiki"
source: deepwiki
repo: "${repo.name}"
last_synced_at: "${timestamp}"
---

${contentsText}
`;
  writeFileSync(join(indexDir, '_full.md'), fullMd, 'utf-8');
}

function extractSection(fullText, slug) {
  // Simple section extraction — split by markdown headers
  // Refine during implementation based on actual DeepWiki output format
  const sections = fullText.split(/^#{1,2} /m);
  for (const section of sections) {
    if (section.toLowerCase().includes(slug.toLowerCase())) {
      return `# ${section.trim()}`;
    }
  }
  return fullText; // fallback: return everything
}

async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.devin.ai/mcp'),
    {
      requestInit: {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
        },
      },
    }
  );

  const client = new Client(
    { name: 'primebrick-v3-website-sync', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('Connected to Devin MCP server');

  for (const repo of REPOS) {
    try {
      await syncRepo(client, repo);
    } catch (err) {
      console.error(`Failed to sync ${repo.name}:`, err.message);
      // Continue with other repos — partial sync is OK
    }
  }

  await client.close();
  console.log('DeepWiki sync complete');
}

main().catch(console.error);
```

### 6.3 GitHub Actions workflow: `.github/workflows/sync-deepwiki.yml`

```yaml
name: Sync DeepWiki Content

on:
  # Manual trigger
  workflow_dispatch:
  # On release/hotfix tags in any Primebrick repo
  repository_dispatch:
    types: [primebrick-release]
  # Scheduled: daily at 06:00 UTC
  schedule:
    - cron: '0 6 * * *'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Sync DeepWiki
        env:
          DEVIN_API_KEY: ${{ secrets.DEVIN_API_KEY }}
        run: node scripts/sync-deepwiki.mjs

      - name: Commit synced content
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/content/docs/
          git diff --staged --quiet && echo "No changes" && exit 0
          git commit -m "chore: sync DeepWiki content [skip ci]"
          git push
```

### 6.4 Important limitations to acknowledge

1. **No webhook from Devin**: DeepWiki does not notify when wiki content changes. The sync is triggered by:
   - Manual `workflow_dispatch`
   - `repository_dispatch` (requires a webhook from release CI in other repos)
   - Daily cron schedule
2. **Wiki must be generated first**: If the wiki for a repo hasn't been generated on app.devin.ai, the sync script will get a "not found" error and skip that repo.
3. **Content format**: The exact format of `read_wiki_contents` output needs to be verified during implementation. The script includes a fallback (`_full.md`) that stores the entire content as one file if per-page splitting fails.
4. **Section extraction**: The `extractSection()` function is a placeholder. The actual DeepWiki output format must be inspected during implementation to write a proper parser.

---

## 7. In-Repo Docs Sync

### 7.1 Sync script: `scripts/sync-repo-docs.mjs`

Clones each repo's `docs/` folder and copies MD files into the Astro content collection.

```javascript
#!/usr/bin/env node
/**
 * Sync in-repo docs/ folders to Astro content collections.
 * Shallow-clones each repo, copies docs/ + README.md + AGENTS.md.
 *
 * Usage: node scripts/sync-repo-docs.mjs
 */
import { execSync } from 'child_process';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const REPOS = [
  { git: 'https://github.com/michaelsogos/primebrick-v3-backend.git',    slug: 'backend',       dir: 'src/content/docs/backend/manual' },
  { git: 'https://github.com/michaelsogos/primebrick-v3-frontend.git',   slug: 'frontend',     dir: 'src/content/docs/frontend/manual' },
  { git: 'https://github.com/michaelsogos/primebrick-v3-microservices.git', slug: 'microservices', dir: 'src/content/docs/microservices/manual' },
  { git: 'https://github.com/michaelsogos/primebrick-v3-dal.git',         slug: 'dal',          dir: 'src/content/docs/dal/manual' },
  { git: 'https://github.com/michaelsogos/primebrick-v3-sdk.git',         slug: 'sdk',          dir: 'src/content/docs/sdk/manual' },
];

const TMP_DIR = join(process.cwd(), '.tmp-repo-sync');

for (const repo of REPOS) {
  console.log(`Syncing docs for ${repo.slug}...`);
  const cloneDir = join(TMP_DIR, repo.slug);

  rmSync(cloneDir, { recursive: true, force: true });
  mkdirSync(cloneDir, { recursive: true });

  // Shallow clone (depth 1, no history)
  execSync(`git clone --depth 1 ${repo.git} ${cloneDir}`, { stdio: 'inherit' });

  const targetDir = join(process.cwd(), repo.dir);
  mkdirSync(targetDir, { recursive: true });

  // Copy docs/ folder if it exists
  const docsDir = join(cloneDir, 'docs');
  if (existsSync(docsDir)) {
    cpSync(docsDir, targetDir, { recursive: true });
  }

  // Copy README.md as overview
  const readme = join(cloneDir, 'README.md');
  if (existsSync(readme)) {
    let content = readFileSync(readme, 'utf-8');
    // Add frontmatter for Content Collections
    if (!content.startsWith('---')) {
      content = `---
title: "${repo.slug} — Overview"
source: manual
repo: "${repo.git.replace('.git', '').replace('https://github.com/', '')}"
---

${content}`;
    }
    writeFileSync(join(targetDir, 'overview.md'), content, 'utf-8');
  }

  // Copy AGENTS.md as architecture reference
  const agents = join(cloneDir, 'AGENTS.md');
  if (existsSync(agents)) {
    let content = readFileSync(agents, 'utf-8');
    if (!content.startsWith('---')) {
      content = `---
title: "${repo.slug} — AI Agent Guide"
source: manual
repo: "${repo.git.replace('.git', '').replace('https://github.com/', '')}"
---

${content}`;
    }
    writeFileSync(join(targetDir, 'agents-guide.md'), content, 'utf-8');
  }
}

// Cleanup
rmSync(TMP_DIR, { recursive: true, force: true });
console.log('In-repo docs sync complete');
```

### 7.2 GitHub Actions workflow: `.github/workflows/sync-repo-docs.yml`

```yaml
name: Sync Repo Docs

on:
  workflow_dispatch:
  repository_dispatch:
    types: [primebrick-release]
  schedule:
    - cron: '0 6 * * *'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Sync repo docs
        run: node scripts/sync-repo-docs.mjs

      - name: Commit synced content
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/content/docs/
          git diff --staged --quiet && echo "No changes" && exit 0
          git commit -m "chore: sync in-repo docs [skip ci]"
          git push
```

---

## 8. Cloudflare Workers Deployment

### 8.1 Architecture: Hybrid rendering on Workers free plan

Astro `output: 'hybrid'` with `@astrojs/cloudflare` adapter:

| Page type | Rendering | Worker cost |
|-----------|-----------|-------------|
| Landing, marketing, docs pages | Prerendered at build time | 0ms CPU, 0 request count (served from Assets binding) |
| OpenAPI REPL (`/api-explorer`) | Prerendered (Scalar runs client-side) | 0ms CPU, 0 request count |
| Any future SSR page | On-demand in Worker | Uses 10ms CPU budget, counts toward 100K/day |

**Key insight**: Static asset requests on Workers are **free and unlimited** — they don't invoke the Worker and don't count toward the 100,000/day request limit. Only on-demand (SSR) pages invoke the Worker. Since our entire site can be prerendered, the Worker is essentially a fallback for 404 handling and any future SSR needs.

### 8.2 `wrangler.jsonc` configuration

```jsonc
{
  "name": "primebrick-v3-website",
  "main": "./dist/_worker.js/index.js",
  "compatibility_date": "2026-07-12",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist"
  },
  "observability": {
    "enabled": true
  }
}
```

- `main` — entry point generated by the Astro Cloudflare adapter (powers SSR/404 handling)
- `assets.directory` — static assets served directly by the Workers runtime (free, unlimited)
- `nodejs_compat` — enables Node.js API compatibility in the Workers runtime (needed by some Astro internals)

### 8.3 Build and deploy commands

```bash
# Build the Astro site (prerenders all pages, generates Worker entry)
pnpm run build

# Deploy to Cloudflare Workers
npx wrangler deploy

# Or combined:
pnpm run build && npx wrangler deploy
```

### 8.4 Deploy workflow: `.github/workflows/deploy.yml`

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm run build

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

### 8.5 Custom domain

- Add `primebrick.dev` as a custom domain (route) in the Workers dashboard
- Add DNS record (CNAME or AAAA) pointing to the Workers project
- Cloudflare manages DNS if domain is on Cloudflare

### 8.6 Workers free plan limits (verified from Cloudflare docs)

| Limit | Workers Free | Our usage |
|-------|-------------|-----------|
| Worker requests | 100,000/day | ~0 (all pages prerendered; only 404s invoke Worker) |
| CPU time per request | 10 ms | N/A (prerendered pages don't invoke Worker) |
| Memory | 128 MB | N/A (prerendered pages don't invoke Worker) |
| Worker size | 3 MB | Small (Astro adapter entry + minimal SSR code) |
| Static asset files | 20,000 | ~100-500 MD + built HTML |
| Static asset file size | 25 MiB | MD files are KB-sized |
| Static asset requests | **Free, unlimited** | All page views = static asset requests |
| Cron Triggers | 5 per account | 0 (sync runs in GitHub Actions, not Workers) |
| Subrequests | 50/request | N/A for prerendered pages |

**Cost estimate: $0/month.** The entire site is prerendered. Static asset requests are free and unlimited. The Worker is only invoked for 404 handling or future SSR pages.

### 8.7 Workers runtime constraints (important)

The Workers runtime is a **V8 isolate** (`workerd`), NOT Node.js. This affects any server-side code:

- **No `fs` module** — cannot read files at runtime (but prerendered pages read files at build time in Node.js, which is fine)
- **No `child_process`** — cannot spawn processes
- **Limited `node:crypto`** — some APIs available via `nodejs_compat` flag
- **No `node:path`** — use Web APIs instead

**Impact on this project**: Minimal. All pages are prerendered (built in Node.js at build time). The sync scripts run in GitHub Actions CI (full Node.js), not on the Worker. The Worker only handles 404s and any future SSR routes. If SSR is added later, server-side code must be Workers-compatible.

---

## 9. `.devin/wiki.json` Steering Files

Add to each repo's root to guide DeepWiki generation. These ensure the wiki covers the right modules and doesn't hit generation limits on large repos.

### 9.1 `primebrick-be-v3/.devin/wiki.json`

```json
{
  "repo_notes": [
    {
      "content": "Primebrick v3 backend. Express + TypeScript. RBAC with Casdoor IDP. Service registry for microservices with round-robin proxy at /ws/:serviceCode. DAL via @primebrick/dal-pg. OpenAPI spec at /api/v1/openapi.json. Key modules: customers, auth, system, proxy. Snake_case everywhere.",
      "author": "maintainer"
    }
  ]
}
```

### 9.2 `primebrick-fe-v3/.devin/wiki.json`

```json
{
  "repo_notes": [
    {
      "content": "Primebrick v3 frontend. SvelteKit + TypeScript. Tailwind CSS + shadcn-svelte. Auth via BE JWT + refresh token cookie. Entity list table component with server-side sort/filter/pagination. Snake_case from BE JSON to FE components.",
      "author": "maintainer"
    }
  ]
}
```

### 9.3 `primebrick-us-v3/.devin/wiki.json`

```json
{
  "repo_notes": [
    {
      "content": "Primebrick v3 microservices. Node.js + TypeScript. Each microservice is self-contained. Uses @primebrick/sdk for registration, heartbeat, config, NATS. EmailSender is the first microservice. OpenAPI at /api/openapi.json per service. RFC 7807 error responses.",
      "author": "maintainer"
    }
  ]
}
```

### 9.4 `primebrick-dal-v3/.devin/wiki.json`

```json
{
  "repo_notes": [
    {
      "content": "Primebrick v3 Data Access Layer. @primebrick/dal-pg. TypeScript decorators (@Entity, @Column, @Key, @Unique, @AuditableField, @DeletableField). Metadata-driven Repository generates parameterized SQL. Soft-delete, audit fields, bulk operations via temp tables. Leaf dependency — no imports from BE or US.",
      "author": "maintainer"
    }
  ]
}
```

### 9.5 `primebrick-v3-sdk/.devin/wiki.json`

```json
{
  "repo_notes": [
    {
      "content": "Primebrick v3 SDK. @primebrick/sdk. Shared microservice infrastructure: ConfigLoader, MigrationRunner, ServiceRegistrar, GracefulShutdown, NatsClient, HttpServer, HealthCheck, EnvValidator. Port interfaces for DB-agnostic design.",
      "author": "maintainer"
    }
  ]
}
```

---

## 10. Implementation Phases

### Phase 1: Scaffold + Landing Pages (no external dependencies)
1. Create `primebrick-v3-website` repo and Astro project
2. Add Svelte + Starlight + Tailwind integrations
3. Create landing page, features, pricing pages
4. Set up Content Collections schema
5. Deploy to Cloudflare Pages (verify `primebrick.dev` works)

### Phase 2: OpenAPI REPL
1. Add `@scalar/astro` dependency
2. Create `/api-explorer` page with ScalarComponent
3. Add BE aggregated OpenAPI endpoint (`primebrick-be-v3`)
4. Verify the explorer loads and can execute requests against a running BE

### Phase 3: In-Repo Docs Sync
1. Write `scripts/sync-repo-docs.mjs`
2. Add GitHub Actions workflow
3. Run sync, verify MD files appear in content collections
4. Configure Starlight sidebar to render synced docs

### Phase 4: DeepWiki Sync
1. **User action**: Generate wikis for all 5 repos on app.devin.ai
2. **User action**: Add `.devin/wiki.json` to each repo (Phase 1 deliverables)
3. **User action**: Create Devin API key, add as GitHub secret `DEVIN_API_KEY`
4. Write `scripts/sync-deepwiki.mjs`
5. Add GitHub Actions workflow
6. Run sync, verify DeepWiki content appears in content collections
7. Inspect actual DeepWiki output format, refine section parser

### Phase 5: Polish
1. Starlight sidebar configuration (auto-generated from content collections)
2. Search functionality (Starlight built-in Pagefind)
3. Dark/light theme
4. SEO meta tags, sitemap, robots.txt
5. Logo and branding

---

## 11. Acceptance Criteria

### Phase 1
- [ ] `primebrick-v3-website` repo exists at `d:\git\primebrick\primebrick-v3-website`
- [ ] `pnpm run dev` starts the Astro dev server without errors
- [ ] Landing page renders at `/`
- [ ] `pnpm run build` produces static output in `dist/`
- [ ] Site deploys to Cloudflare Workers via `wrangler deploy`
- [ ] `primebrick.dev` resolves and serves the site via Workers

### Phase 2
- [ ] `/api-explorer` page renders Scalar API Reference
- [ ] Scalar loads the OpenAPI spec from a configurable BE URL
- [ ] User can select server URL in the Scalar UI
- [ ] User can configure auth (bearer/API key/OAuth2) in the Scalar UI
- [ ] "Try it" executes a real request against a running BE
- [ ] Multi-language code generation (curl, JS, Python, etc.) works
- [ ] BE `/api/v1/openapi/aggregated.json` returns merged spec (BE + online microservices)
- [ ] BE existing `/api/v1/openapi.json` still works unchanged

### Phase 3
- [ ] `scripts/sync-repo-docs.mjs` runs without errors
- [ ] MD files from each repo's `docs/` folder appear in `src/content/docs/*/manual/`
- [ ] README.md and AGENTS.md from each repo appear as overview/agents-guide pages
- [ ] Starlight sidebar shows synced docs pages
- [ ] GitHub Actions workflow commits synced content automatically

### Phase 4
- [ ] Wikis generated for all 5 repos on app.devin.ai (user action)
- [ ] `.devin/wiki.json` added to each repo (user action)
- [ ] `DEVIN_API_KEY` GitHub secret set (user action)
- [ ] `scripts/sync-deepwiki.mjs` runs without errors
- [ ] DeepWiki content appears as MD files in `src/content/docs/*/deepwiki/`
- [ ] DeepWiki pages render correctly in Starlight
- [ ] GitHub Actions workflow syncs on schedule + manual trigger

### Phase 5
- [ ] Starlight search works (Pagefind)
- [ ] Dark/light theme toggle works
- [ ] Sitemap.xml generated
- [ ] SEO meta tags present on all pages

---

## 12. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| DeepWiki output format unknown | Script includes fallback (`_full.md`); parser refined during Phase 4 implementation after inspecting actual output |
| DeepWiki wikis not generated | Phase 4 blocked on user action; Phases 1-3 proceed independently |
| Devin MCP API changes | Sync script is isolated; failures don't break the site (stale content stays) |
| Cloudflare Workers 10ms CPU limit | All pages prerendered = 0ms Worker CPU; limit only applies to SSR pages (none currently) |
| Microservice specs unavailable during aggregated fetch | 5s timeout per service; unavailable services skipped; partial spec is valid |
| DeepWiki content stale | Sync runs daily + on release; content has `last_synced_at` frontmatter for visibility |
| MCP SDK compatibility | `@modelcontextprotocol/sdk` is the official TypeScript SDK; Streamable HTTP is the recommended transport |

---

## 13. What is NOT included in this plan

- **Self-hosting DeepWiki-Open** — ruled out (too much infra for free plan)
- **SSR pages** — not needed currently (all pages prerendered); Workers adapter is installed for future SSR if needed
- **Database / storage** — not needed (all content is static MD files)
- **User authentication on the docs site** — not needed (public docs + public API explorer)
- **CMS integration** — not needed (MD files in git, synced via CI)
- **Changes to FE repo** — none (the FE is untouched)
- **Changes to US microservices** — none (they already expose `/api/openapi.json`)
- **Changes to DAL or SDK repos** — none (only `.devin/wiki.json` steering files added, which are DeepWiki config, not source code)

---

## 14. Files created/modified summary

### NEW repo: `primebrick-v3-website`
| File | Purpose |
|------|---------|
| `package.json` | Dependencies (Astro, Svelte, Starlight, Scalar, MCP SDK) |
| `astro.config.mjs` | Astro config with Svelte + Starlight integrations |
| `tsconfig.json` | TypeScript strict config |
| `src/content/config.ts` | Content Collections schema |
| `src/pages/index.astro` | Landing page |
| `src/pages/features/*.astro` | Marketing pages |
| `src/pages/api-explorer/index.astro` | Scalar OpenAPI REPL |
| `src/content/docs/**` | Synced docs (DeepWiki + in-repo) |
| `src/content/marketing/**` | Hand-written marketing content |
| `src/components/svelte/**` | Interactive Svelte components |
| `scripts/sync-deepwiki.mjs` | DeepWiki sync script (MCP client) |
| `scripts/sync-repo-docs.mjs` | In-repo docs sync script |
| `.github/workflows/sync-deepwiki.yml` | DeepWiki sync CI |
| `.github/workflows/sync-repo-docs.yml` | In-repo docs sync CI |
| `.github/workflows/deploy.yml` | Cloudflare Pages deploy CI |
| `wrangler.jsonc` | Cloudflare Workers config (REQUIRED) |
| `AGENTS.md` | AI agent instructions for this repo |
| `.devin/rules/*.md` | Devin rules (10 files — see Section 16) |

### MODIFIED: `primebrick-be-v3`
| File | Change |
|------|--------|
| `src/openapi/aggregated-router.ts` | NEW — aggregated OpenAPI endpoint |
| `src/index.ts` | +2 lines (import + app.use) |

### MODIFIED: each repo (`.devin/wiki.json` only — DeepWiki steering, not source code)
| Repo | File |
|------|------|
| `primebrick-be-v3` | `.devin/wiki.json` |
| `primebrick-fe-v3` | `.devin/wiki.json` |
| `primebrick-us-v3` | `.devin/wiki.json` |
| `primebrick-dal-v3` | `.devin/wiki.json` |
| `primebrick-v3-sdk` | `.devin/wiki.json` |

---

## 15. Open questions for user (to resolve before PROCEED)

1. **Domain ownership**: Do you already own `primebrick.dev`? Is it on Cloudflare DNS?
2. **Devin API key**: Do you have a Devin service user API key (`cog_` prefix), or do you need to create one?
3. **Wiki generation**: Are you ready to trigger wiki generation for all 5 repos on app.devin.ai, or should Phase 4 be deferred?
4. **Repository_dispatch webhook**: Do you want the sync to trigger on releases in other repos (requires a webhook from each repo's release CI), or is daily cron + manual trigger sufficient?
5. **Starlight vs custom layout**: Use Astro Starlight for docs (recommended, fast to set up), or build a custom docs layout?

---

## 16. AI Docs Structure (`.devin/rules/` + `AGENTS.md`)

The `primebrick-v3-website` repo mirrors the same AI docs pattern used in all other Primebrick repos. The following files must be created during Phase 1 scaffolding.

### 16.1 Standard rules (copied from other repos, adapted for this project)

These are the same rule files that exist in BE/FE/US/DAL repos, adapted for the website project:

| File | Source | Adaptation needed |
|------|--------|-------------------|
| `.devin/rules/workflow.md` | Copy from BE | Same content — Tic-Toc planning, plan files in `primebrick-workspace/ai-plans/` |
| `.devin/rules/always-check-rules-first.md` | Copy from BE | Same content verbatim |
| `.devin/rules/code-guardrails.md` | Copy from BE | Same content verbatim |
| `.devin/rules/dev-server.md` | Copy from FE | Change port from 5173 to **4321** (Astro default dev port) |
| `.devin/rules/file-operations.md` | Copy from BE | Same content verbatim |
| `.devin/rules/temp-files.md` | Copy from BE | Add `primebrick-v3-website` to the forbidden repos list |
| `.devin/rules/package-versioning.md` | Copy from BE | Same content verbatim |
| `.devin/rules/verify-file-creation.md` | Copy from BE | Same content verbatim |

### 16.2 Project-specific rules (NEW — website/Astro specific)

These are new rule files created specifically for this project:

#### `.devin/rules/astro-conventions.md`

```markdown
---
trigger: always_on
---
# Devin Rule: Astro Development Conventions

## Trigger
- Applies to ALL code in this repository: `.astro` files, `.svelte` files, `.ts` files, content collections, config files.

## Astro Architecture
1. **Hybrid rendering**: `output: 'hybrid'` with `@astrojs/cloudflare` adapter. Pages are prerendered by default. Only opt into SSR (`export const prerender = false`) when a page genuinely needs server-side data.
2. **Prerender by default**: All marketing pages, docs pages, and the OpenAPI explorer MUST be prerendered. This keeps Worker CPU at 0ms and requests free/unlimited on Cloudflare's free plan.
3. **No Node.js APIs in SSR code**: The Workers runtime is a V8 isolate (`workerd`), NOT Node.js. No `fs`, no `child_process`, no `node:path` in any server-rendered code. Use Web APIs instead. The `nodejs_compat` flag enables some Node APIs but not all.
4. **Svelte for interactivity**: Use `@astrojs/svelte` for interactive components. Svelte components are hydrated client-side via Astro islands (`client:load`, `client:visible`, `client:idle`).
5. **Astro components for static content**: Use `.astro` files for static content and layout. Do not use Svelte for content that doesn't need interactivity.

## Content Collections
1. **All docs content lives in `src/content/docs/`**: Organized by source repo (`backend/`, `frontend/`, `microservices/`, `dal/`, `sdk/`) and by source type (`deepwiki/`, `manual/`).
2. **Frontmatter is REQUIRED**: Every MD file in a content collection MUST have frontmatter with at minimum `title`, `source`, and `repo` fields (see `src/content/config.ts` schema).
3. **Never hand-edit synced content**: Files under `src/content/docs/*/deepwiki/` and `src/content/docs/*/manual/` are generated by sync scripts. Do NOT edit them manually — changes will be overwritten on next sync. Hand-written content goes in `src/content/docs/*/handwritten/` or `src/content/marketing/`.
4. **Content collection schema is the source of truth**: The Zod schema in `src/content/config.ts` defines what fields are allowed. Do not add fields to MD frontmatter without updating the schema first.

## File Naming
1. **kebab-case for all files**: `api-explorer.astro`, `sync-deepwiki.mjs`, not `apiExplorer.astro` or `sync_deepwiki.mjs`.
2. **Index files**: Use `index.astro` for route directories (e.g., `src/pages/features/index.astro`).

## Styling
1. **Tailwind CSS 4**: Via `@tailwindcss/vite` plugin. No PostCSS config needed.
2. **Starlight custom CSS**: Override Starlight styles via `customCss` in `astro.config.mjs`, not by editing Starlight's source.
3. **No CSS-in-JS**: Use Tailwind classes or `.css` files. No styled-components, emotion, or similar.

## Enforcement
- AI agent MUST set `export const prerender = true` on all new pages unless SSR is explicitly needed.
- AI agent MUST NOT use `fs`, `child_process`, or `node:path` in any server-rendered code.
- AI agent MUST NOT hand-edit files under `src/content/docs/*/deepwiki/` or `src/content/docs/*/manual/`.
- AI agent MUST use kebab-case for all filenames.
- AI agent MUST use Svelte only for interactive components, Astro for static content.
```

#### `.devin/rules/docs-sync.md`

```markdown
---
trigger: always_on
---
# Devin Rule: Documentation Sync

## Trigger
- Applies whenever the docs sync scripts (`scripts/sync-deepwiki.mjs`, `scripts/sync-repo-docs.mjs`) are modified, run, or debugged.
- Applies when content collection files under `src/content/docs/*/deepwiki/` or `src/content/docs/*/manual/` are involved.

## Sync Architecture
Two independent sync pipelines feed MD files into Astro Content Collections:

1. **In-repo docs sync** (`scripts/sync-repo-docs.mjs`):
   - Shallow-clones each Primebrick repo (depth 1)
   - Copies `docs/` folder, `README.md`, `AGENTS.md` into `src/content/docs/<repo>/manual/`
   - Adds frontmatter (`title`, `source: manual`, `repo`) to files that lack it
   - Runs in GitHub Actions CI (full Node.js), NOT on the Worker

2. **DeepWiki sync** (`scripts/sync-deepwiki.mjs`):
   - Calls Devin MCP (`https://mcp.devin.ai/mcp`) with `DEVIN_API_KEY`
   - Uses `read_wiki_structure` + `read_wiki_contents` MCP tools
   - Writes MD files into `src/content/docs/<repo>/deepwiki/`
   - Runs in GitHub Actions CI, NOT on the Worker

## Rules
1. **Sync scripts run in CI only**: Never run sync scripts from the Worker. They require Node.js APIs (`fs`, `child_process`) that are not available in the Workers runtime.
2. **DEVIN_API_KEY is a secret**: Store as GitHub Actions secret. NEVER commit it. NEVER log it. NEVER expose it in client-side code.
3. **Partial sync is OK**: If one repo's wiki is unavailable or the MCP call fails, the sync script MUST skip that repo and continue with the others. Do NOT abort the entire sync on a single repo failure.
4. **Frontmatter must match schema**: Synced files MUST have frontmatter that matches the Zod schema in `src/content/config.ts`. If the schema changes, update the sync scripts to match.
5. **Commit synced content**: Sync workflows MUST commit the synced files to git with `[skip ci]` in the commit message to avoid triggering a deploy on every sync. The deploy workflow runs on push to `main` only.
6. **No manual edits to synced files**: Files under `src/content/docs/*/deepwiki/` and `src/content/docs/*/manual/` are auto-generated. Manual edits will be overwritten. For hand-written docs, use `src/content/docs/*/handwritten/` or `src/content/marketing/`.
7. **DeepWiki output format is not guaranteed**: The exact format of `read_wiki_contents` output may change. The sync script includes a fallback (`_full.md`) that stores the entire content as one file if per-page splitting fails. If the parser breaks, inspect the actual MCP output and fix the parser — do NOT blame the content.
8. **Wiki must be generated first**: DeepWiki sync will fail for repos whose wiki hasn't been generated on `app.devin.ai`. The script logs a warning and skips that repo. This is expected behavior, not a bug.

## Enforcement
- AI agent MUST NOT run sync scripts from the Worker runtime.
- AI agent MUST NOT commit `DEVIN_API_KEY` or any credentials.
- AI agent MUST NOT abort sync on a single repo failure — use try/catch per repo.
- AI agent MUST NOT manually edit files under `deepwiki/` or `manual/` directories.
- AI agent MUST include `[skip ci]` in sync commit messages.
```

#### `.devin/rules/openapi-repl.md`

```markdown
---
trigger: always_on
---
# Devin Rule: OpenAPI REPL / API Explorer

## Trigger
- Applies whenever the OpenAPI explorer page (`src/pages/api-explorer/`) or the Scalar integration is modified.
- Applies when the BE aggregated OpenAPI endpoint is involved.

## Architecture
1. **Scalar API Reference**: The explorer uses `@scalar/astro` (`ScalarComponent`). It renders an interactive API reference with try-it, code generation, server selector, and auth configuration.
2. **Prerendered page**: The `/api-explorer` page MUST be prerendered (`export const prerender = true`). Scalar runs entirely client-side. No Worker CPU cost.
3. **Client-side spec fetch**: The OpenAPI spec is fetched client-side via `fetch()` from the BE URL the user configures in Scalar's server selector. No build-time fetch, no SSR fetch.
4. **User-configurable BE host**: The user can point the explorer at any BE: `http://localhost:3001`, `https://api.primebrick.dev`, staging, on-prem. Scalar's built-in server selector handles this.
5. **User-configurable auth**: Scalar supports bearer token, API key, and OAuth2 client_credentials. No custom auth code on the website side.

## BE Dependency
1. **Aggregated OpenAPI endpoint**: The BE (`primebrick-be-v3`) exposes `GET /api/v1/openapi/aggregated.json` which merges the BE spec + all online microservice specs from the `service_registry`.
2. **Microservice paths are prefixed**: Paths from microservice specs are prefixed with `/ws/:serviceCode` to match the existing BE proxy.
3. **Partial spec is valid**: If some microservices are offline, the aggregated spec includes only the online ones. The explorer still works — unavailable endpoints just won't be in the spec.
4. **The BE endpoint is public**: Mounted before the auth guard (same as the existing `/api/v1/openapi.json`). No authentication required to fetch the spec.

## Rules
1. **Do NOT fetch the spec at build time**: The spec URL is user-configurable. Build-time fetch would bake in a specific BE URL. The spec must be fetched client-side.
2. **Do NOT add auth logic to the website**: Auth is handled by Scalar's built-in auth UI. The website does not store tokens, manage sessions, or proxy requests.
3. **Do NOT proxy API requests through the Worker**: The "try it" feature sends requests directly from the browser to the BE. CORS must be configured on the BE, not on the website.
4. **CORS is a BE concern**: The BE must allow CORS from `primebrick.dev` (and `localhost:4321` for dev). This is configured in the BE, not in the website repo.
5. **Scalar version pinning**: `@scalar/astro` must be pinned to an exact version (per package-versioning rule). Scalar updates can change the UI/UX — test after upgrading.

## Enforcement
- AI agent MUST set `export const prerender = true` on the api-explorer page.
- AI agent MUST NOT add server-side fetch logic for the OpenAPI spec.
- AI agent MUST NOT add auth/token management code to the website.
- AI agent MUST NOT proxy API requests through the Cloudflare Worker.
- AI agent MUST pin `@scalar/astro` to an exact version.
```

### 16.3 `AGENTS.md`

```markdown
# AI AGENT INSTRUCTIONS - Primebrick Website (primebrick.dev)

## ⚠️ CRITICAL: NEVER COMMIT AUTOMATICALLY

**AI agents MUST NEVER commit changes without explicit user instruction.**

- WAIT for the user to explicitly tell you to commit before running any `git commit` command
- This applies to ALL situations - no exceptions

## Repository overview

`primebrick-v3-website` is the product website for Primebrick, deployed at `primebrick.dev`.
It is an Astro static site (hybrid rendering) deployed to Cloudflare Workers free plan.

The site serves three purposes:
1. **Institutional / marketing landing pages** — product overview, features, pricing
2. **Project documentation** — architecture docs, guides sourced from DeepWiki + in-repo `docs/` folders
3. **OpenAPI REPL / API explorer** — interactive API docs with live try-it, powered by Scalar

**Tech stack**: Astro + @astrojs/svelte + @astrojs/starlight + @scalar/astro + Tailwind CSS 4
**Deployment**: Cloudflare Workers (free plan) via `wrangler deploy`
**Rendering**: Hybrid — all pages prerendered by default (0ms Worker CPU, free unlimited static asset requests)

**Documentation language:** All `*.md` files must use **English** for team-facing prose.

## Commands

| Action | Command |
|--------|---------|
| Install | `pnpm install` |
| Dev | `pnpm run dev` (port 4321) |
| Build | `pnpm run build` |
| Preview | `pnpm run preview` |
| Deploy | `pnpm run build && npx wrangler deploy` |
| Sync in-repo docs | `node scripts/sync-repo-docs.mjs` |
| Sync DeepWiki | `DEVIN_API_KEY=xxx node scripts/sync-deepwiki.mjs` |

## Dev server

Uses **Astro dev server** on port **4321**. Do NOT start a second instance. If the user
already runs the dev server, test against `http://localhost:4321` instead of spawning another.

## Conventions

- **kebab-case** for all filenames
- **Prerender by default** — `export const prerender = true` on all pages unless SSR is explicitly needed
- **No Node.js APIs in SSR code** — Workers runtime is V8 isolate, not Node.js
- **Svelte for interactivity, Astro for static content**
- **Tailwind CSS 4** via `@tailwindcss/vite` — no PostCSS config needed
- **Content Collections** — all docs in `src/content/docs/`, schema in `src/content/config.ts`
- **Synced content is read-only** — never hand-edit files under `deepwiki/` or `manual/` directories

## Sync scripts

Two sync scripts run in GitHub Actions CI (NOT on the Worker):
1. `scripts/sync-repo-docs.mjs` — clones repos, copies `docs/` folders
2. `scripts/sync-deepwiki.mjs` — calls Devin MCP, writes DeepWiki content as MD

Both commit synced content with `[skip ci]` to avoid deploy loops.

## Package Versioning — FIXED versions only (MANDATORY)

All package versions in `package.json` MUST be pinned to exact versions (e.g.
`"astro": "5.13.2"`). NO ranges (`^`, `~`, `>=`, `*`, `latest`) are allowed
for registry packages.

See [.devin/rules/package-versioning.md](./.devin/rules/package-versioning.md)
for the full rule and upgrade procedure.

## Further documentation

- [.devin/rules/](./.devin/rules/) — always-on rules for Devin agents
- [AGENTS.md](./AGENTS.md) — this file

## GitFlow rules

This repository follows GitFlow. AI agents MUST follow these rules.
Ensure you follow branch management, version tagging, and commit protocols.
```

### 16.4 Complete `.devin/rules/` file listing for `primebrick-v3-website`

```
.devin/rules/
├── always-check-rules-first.md   (copied from BE, verbatim)
├── astro-conventions.md          (NEW — Astro/Astro-specific conventions)
├── code-guardrails.md            (copied from BE, verbatim)
├── dev-server.md                 (copied from FE, port changed to 4321)
├── docs-sync.md                  (NEW — sync script rules)
├── file-operations.md            (copied from BE, verbatim)
├── openapi-repl.md               (NEW — Scalar/OpenAPI explorer rules)
├── package-versioning.md         (copied from BE, verbatim)
├── temp-files.md                 (copied from BE, primebrick-v3-website added to forbidden list)
├── verify-file-creation.md       (copied from BE, verbatim)
└── workflow.md                   (copied from BE, verbatim)
```

Total: **11 rule files** (8 standard + 3 new project-specific).

---

END OF PLAN

---
