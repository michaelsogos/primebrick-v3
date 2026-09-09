# Plan: Docs + Website Cleanup — Complete Audit Fix

## Target

Fix ALL remaining issues from the Zudoku migration across two repos:
- `D:\git\primebrick\primebrick-v3-docs` (Zudoku docs site)
- `D:\git\primebrick\primebrick-v3-website` (Astro landing page)

The previous session implemented the migration but left broken links, outdated references, missing sections, stale config, AND **mermaid diagram rendering is completely broken**. This plan fixes every issue found by empirical audit (4 parallel subagents + DeepWiki MCP + Zudoku docs + build output inspection).

## CRITICAL: Mermaid Rendering Is BROKEN

**Empirical proof**: Built `dist/getting-started/infrastructure.html` contains `graph TB` as plain text inside `<code class="language-text shiki">`. There is NO `<pre>` element in Zudoku's code block output — it uses `<div class="code-block-wrapper">`. The `PreComponent` override in `zudoku.config.tsx` never fires because:
1. Zudoku renders code blocks as `<div class="code-block-wrapper"><code>`, NOT `<pre><code>`
2. Shiki converts `mermaid` to `language-text` because mermaid is not a registered Shiki language
3. The `PreComponent` checks for `language-mermaid` class which never exists

**Zudoku has a BUILT-IN `<Mermaid>` component** (verified in `node_modules/zudoku/dist/declarations/lib/components/Mermaid.d.ts`):
```ts
export type MermaidProps = {
    chart: string;
    config?: MermaidConfig;
} & ComponentProps<"div">;
export declare const Mermaid: ({ chart, config, ...props }: MermaidProps) => import("react").JSX.Element;
```

Import: `import { Mermaid } from "zudoku/mermaid";`
Usage in MDX: `<Mermaid chart={`graph TD; A-->B;`} />`
The `mermaid` npm package is already installed (v11.16.0).

**Two approaches available** (per `node_modules/zudoku/docs/guides/mermaid.mdx`):

| Approach | Pros | Cons |
|----------|------|------|
| **Client-Side** (`<Mermaid />`) | Fast builds, can be dynamic, no build deps | Requires client-side JS, slight render delay |
| **Build-Time** (rehype-mermaid) | Faster page loads, no client JS, SEO friendly | Requires playwright, slower builds, static only |

**Chosen approach: Client-Side (`<Mermaid chart={...} />`)** — keeps the site static, mermaid renders in the browser after page load, no Worker CPU cost, no playwright dependency. The `mermaid` npm package (v11.16.0) is already installed.

---

## Part A: Docs Repo (`primebrick-v3-docs`)

### A0. Fix Mermaid rendering (CRITICAL — currently broken)

**Where**: `zudoku.config.tsx` + all MDX files with mermaid blocks

**Step 1**: Remove the broken `PreComponent` from `zudoku.config.tsx`:
- Delete lines 8-19 (PreComponent function)
- Delete line 5 (`import Mermaid from "./src/Mermaid"`)
- Delete `src/Mermaid.tsx` (no longer needed — Zudoku has built-in)
- Remove `pre: PreComponent` from `mdx.components`

**Step 2**: Register Zudoku's built-in `<Mermaid>` component in `zudoku.config.tsx`:
```tsx
import { Mermaid } from "zudoku/mermaid";

// in config:
mdx: {
  components: {
    Mermaid,
  },
},
```

**Step 3**: In `pages/getting-started/infrastructure.mdx`: Replace ALL 3 ` ```mermaid ` code blocks with `<Mermaid chart={...} />` JSX:
- Block 1 (line ~10): `graph TB` infrastructure overview
- Block 2 (line ~169): `sequenceDiagram` request flow
- Block 3 (line ~204): `sequenceDiagram` service lifecycle

Example transformation:

BEFORE (in MDX):
~~~mermaid
graph TB
  A --> B
~~~

AFTER (in MDX):
~~~mdx
<Mermaid chart={`graph TB
  A --> B
`} />
~~~

**Step 4**: In `pages/getting-started/architecture.mdx`: Replace the ASCII art diagram (lines 10-33) with a `<Mermaid chart={...} />` diagram.

**Step 5**: Build and verify `dist/getting-started/infrastructure.html` contains mermaid rendering (SVG or mermaid container), NOT `language-text` with `graph TB`.

**How**: `edit`/`write` tools.

---

## Part A: Docs Repo (`primebrick-v3-docs`)

### A1. Fix 7 broken `[API Explorer](/api)` links → `[API Catalog](/catalog)`

**Where** (7 occurrences across 5 files):
| File | Line | Current | Fixed |
|------|------|---------|-------|
| `pages/index.mdx` | 14 | `[API Explorer](/api)` | `[API Catalog](/catalog)` |
| `pages/api/error-handling.mdx` | 178 | `[API Explorer](/api)` | `[API Catalog](/catalog)` |
| `pages/api/authentication-how-to.mdx` | 322 | `[API Explorer](/api)` | `[API Catalog](/catalog)` |
| `pages/api/authentication.mdx` | 78 | `[API Explorer](/api)` | `[API Catalog](/catalog)` |
| `pages/api/authentication.mdx` | 107 | `[API Explorer](/api)` | `[API Catalog](/catalog)` |
| `pages/api/introduction.mdx` | 59 | `[API Explorer](/api)` | `[API Catalog](/catalog)` |
| `pages/api/introduction.mdx` | 89 | `[API Explorer](/api)` | `[API Catalog](/catalog)` |

**How**: `edit` tool with `replace_all: false` for each occurrence. The string `[API Explorer](/api)` → `[API Catalog](/catalog)` is unique enough per file.

### A2. Fix 4 outdated `/api/openapi.json` → `/api/v1/openapi.json` in microservice-standard.mdx

**Where** (4 occurrences in 1 file):
| File | Line | Current | Fixed |
|------|------|---------|-------|
| `pages/api/microservice-standard.mdx` | 16 | `/api/openapi.json` | `/api/v1/openapi.json` |
| `pages/api/microservice-standard.mdx` | 31 | `/api/openapi.json` | `/api/v1/openapi.json` |
| `pages/api/microservice-standard.mdx` | 97 | `/api/openapi.json` | `/api/v1/openapi.json` |
| `pages/api/microservice-standard.mdx` | 130 | `/api/openapi.json` | `/api/v1/openapi.json` |

**How**: `edit` tool with `replace_all: true` on the file for the string `/api/openapi.json` → `/api/v1/openapi.json`.

### A3. Fix 5 wrong port 3000 → 3001 in authentication docs

**Where** (5 occurrences across 2 files):
| File | Line | Current | Fixed |
|------|------|---------|-------|
| `pages/api/authentication-how-to.mdx` | 155 | `http://localhost:3000/api/v1/auth/token` | `http://localhost:3001/api/v1/auth/token` |
| `pages/api/authentication-how-to.mdx` | 181 | `http://localhost:3000/api/v1/auth/token` | `http://localhost:3001/api/v1/auth/token` |
| `pages/api/authentication-how-to.mdx` | 206 | `http://localhost:3000` | `http://localhost:3001` |
| `pages/api/authentication-how-to.mdx` | 231 | `http://localhost:3000/api/v1/auth/token` | `http://localhost:3001/api/v1/auth/token` |
| `pages/api/authentication.mdx` | 58 | `http://localhost:3000/api/v1/auth/token` | `http://localhost:3001/api/v1/auth/token` |

**How**: `edit` tool with `replace_all: true` on each file for `localhost:3000` → `localhost:3001`.

### A4. Fix repo name inconsistencies in quick-start.mdx

**Where**: `pages/getting-started/quick-start.mdx` lines 23-32, 40, 55, 58, 67, 87, 93

**Current** (wrong names):
- `primebrick-be-v3` → should be `primebrick-v3-backend`
- `primebrick-fe-v3` → should be `primebrick-v3-frontend`
- `primebrick-us-v3` → should be `primebrick-v3-microservices`
- `primebrick-dal-v3` → should be `primebrick-v3-dal`

**How**: `edit` tool with `replace_all: true` for each old name → new name. Verified against `scripts/sync-repo-docs.mjs` REPOS array (lines 24-29).

### A5. Fix repo name inconsistencies in dal/manual/overview.md

**Where**: `pages/dal/manual/overview.md` lines 19-20

**Current**: `primebrick-us-v3` → `primebrick-v3-microservices`, `primebrick-be-v3` → `primebrick-v3-backend`

**How**: `edit` tool.

### A6. Rewrite README.md (remove template leftover)

**Where**: `README.md` — entire file is a `create-zudoku` template leftover.

**Current issues**:
- Line 17: `http://localhost:3000` → should be `http://localhost:5173` (Zudoku dev port)
- Line 19: `pages/intro.mdx` → should be `pages/index.mdx`
- Title: "Zudoku App" → should be "Primebrick Docs"

**How**: `write` tool to replace entire file with Primebrick-specific README.

### A7. Fix architecture.mdx ASCII art + OpenAPI aggregation contradiction

**Where**: `pages/getting-started/architecture.mdx`

**Issues**:
1. Lines 25-27: ASCII art uses `(repo A)`, `(repo B)`, `(repo C)` → replace with real names (`EmailSender`, `Billing`, `Inventory`)
2. Lines 45, 93, 112-113: Describes OpenAPI aggregation at `/api/v1/openapi/aggregated.json` — this contradicts infrastructure.mdx which only mentions individual specs. The aggregated endpoint STILL EXISTS in the BE code (confirmed by DeepWiki), so the fix is to ADD the aggregated endpoint to infrastructure.mdx, not remove it from architecture.mdx.
3. Line 115: Already fixed to `[API Catalog](/catalog)` ✅

**How**: `edit` tool to fix ASCII art service names. Add a note to infrastructure.mdx mentioning the aggregated endpoint alongside individual specs.

### A8. Fix infrastructure.mdx docker-compose example + add aggregated endpoint

**Where**: `pages/getting-started/infrastructure.mdx`

**Issues**:
1. Line 43: `+ pgvector` in mermaid diagram — KEEP (user confirmed it's a planned feature, add note "(planned)")
2. Line 239: `postgres:17` → `postgres:18-bookworm` (per DeepWiki)
3. Line 242: `casbin/casdoor` → `casbin/casdoor:3.75.0` (per DeepWiki)
4. Line 245: `nats:2` → `nats:latest` with JetStream note (per DeepWiki)
5. Missing: aggregated OpenAPI endpoint `/api/v1/openapi/aggregated.json` — add to OpenAPI section

**How**: `edit` tool for each fix.

---

## Part B: Website Repo (`primebrick-v3-website`)

### B1. Update AGENTS.md — remove Scalar/Starlight references

**Where**: `AGENTS.md` lines 18, 20

**Current**:
- Line 18: "powered by Scalar" → "powered by Zudoku (external docs site)"
- Line 20: "Astro + @astrojs/svelte + @astrojs/starlight + @scalar/astro + Tailwind CSS 4" → "Astro + @astrojs/svelte + Tailwind CSS 4"

**How**: `edit` tool.

### B2. Delete outdated `.devin/rules/` files

**Where**:
- `.devin/rules/openapi-repl.md` — DELETE (describes non-existent Scalar integration)
- `.devin/rules/docs-sync.md` — DELETE (describes non-existent sync scripts and content collections)

**How**: `exec` tool with `Remove-Item`.

### B3. Fix `.devin/rules/astro-conventions.md` — remove Starlight reference

**Where**: `.devin/rules/astro-conventions.md` line 28

**Current**: "2. **Starlight custom CSS**: Override Starlight styles via `customCss` in `astro.config.mjs`, not by editing Starlight's source."

**How**: `edit` tool to remove this line.

### B4. Remove Starlight CSS from GitHubDropdown.svelte

**Where**: `src/components/svelte/GitHubDropdown.svelte` lines 163-185

**Current**: CSS block targeting `.starlight-header` which will never be used.

**How**: `edit` tool to remove the Starlight-specific CSS block.

### B5. Rename `apiExplorerPath` → `apiCatalogPath`

**Where**: `src/pages/[lang]/index.astro` line 25 (definition), line 57 (usage)

**How**: `edit` tool with `replace_all: true` for `apiExplorerPath` → `apiCatalogPath`.

### B6. Rename translation key `apiExplorer` → `apiCatalog`

**Where**: `src/i18n/translations.ts` — 6 occurrences (one per language)

**How**: `edit` tool with `replace_all: true` for `apiExplorer:` → `apiCatalog:`. Also update the usage in `index.astro` from `t.nav.apiExplorer` → `t.nav.apiCatalog`.

### B7. Add Architecture section to landing page

**Where**: `src/pages/[lang]/index.astro` — new section after Infrastructure section

**What**: User explicitly requested BOTH "infrastructure AND architecture" sections. Only infrastructure was added. The architecture section should show the layered architecture (BE → FE → Microservices → DAL → SDK) as a visual diagram, distinct from the infrastructure section which shows ports and connections.

**Content**: A static SVG or styled HTML showing the layered architecture:
- Layer 1: Frontend (SvelteKit)
- Layer 2: Backend (Express — Auth, RBAC, Proxy, Registry)
- Layer 3: Microservices (Docker, NATS)
- Layer 4: Shared Libraries (SDK, DAL)
- Layer 5: Data (PostgreSQL)

**Translations**: Add `architecture` key to all 6 languages in `translations.ts` with `badge`, `title`, `text`.

**How**: `edit` tool to insert new section + translations.

---

## Part C: Build & Commit

### C1. Build docs repo
```bash
cd D:\git\primebrick\primebrick-v3-docs
pnpm install  # regenerate lock file
pnpm run build  # verify 31+ routes build
```

### C2. Build website repo
```bash
cd D:\git\primebrick\primebrick-v3-website
pnpm install  # regenerate lock file
pnpm run build  # verify 7 pages build
```

### C3. Commit and push both repos
- Docs: `fix: broken links, outdated paths, port errors, repo names, README, architecture diagram`
- Website: `fix: remove Scalar/Starlight refs, rename apiCatalog, add architecture section`

---

## Acceptance Criteria

0. ✅ Mermaid diagrams RENDER as SVG client-side — verify `dist/getting-started/infrastructure.html` contains `<Mermaid` component or mermaid SVG, NOT `language-text` with `graph TB`
1. ✅ Zero occurrences of `[API Explorer](/api)` in docs pages
2. ✅ Zero occurrences of `/api/openapi.json` (without v1) in docs pages
3. ✅ Zero occurrences of `localhost:3000` in authentication docs
4. ✅ All repo names in quick-start.mdx match `scripts/sync-repo-docs.mjs` REPOS array
5. ✅ README.md has Primebrick-specific content, not template
6. ✅ architecture.mdx ASCII art uses real service names
7. ✅ infrastructure.mdx docker-compose uses correct image versions
8. ✅ No references to Scalar or Starlight in website AGENTS.md or .devin/rules/
9. ✅ `apiExplorerPath` renamed to `apiCatalogPath`
10. ✅ Translation key `apiExplorer` renamed to `apiCatalog`
11. ✅ Architecture section exists on landing page (distinct from infrastructure section)
12. ✅ Both repos build successfully
13. ✅ Lock files regenerated before commit

---

## Verification Commands

```powershell
# Docs: verify no broken links remain
cd D:\git\primebrick\primebrick-v3-docs
Select-String -Path "pages\**\*.mdx" -Pattern "\[API Explorer\]\(/api\)"  # should return nothing
Select-String -Path "pages\**\*.mdx" -Pattern "/api/openapi\.json"  # should return nothing (only /api/v1/openapi.json)
Select-String -Path "pages\**\*.mdx" -Pattern "localhost:3000"  # should return nothing

# Website: verify no Scalar/Starlight refs
cd D:\git\primebrick\primebrick-v3-website
Select-String -Path "AGENTS.md" -Pattern "Scalar|Starlight"  # should return nothing
Select-String -Path "src\**\*.ts" -Pattern "apiExplorer"  # should return nothing (renamed to apiCatalog)
```
