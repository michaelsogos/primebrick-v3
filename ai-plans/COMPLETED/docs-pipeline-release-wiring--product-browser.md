# Docs Browser Panel — in-product user-docs browser (Track C)

> Split da docs-pipeline-release-wiring.md — workstream `feature/docs-browser-panel`.
> Dipendenze GIÀ LIVE: `ai.docs_kb` popolata dai service packs, endpoint
> `POST /api/v1/system/docs/search` + `/docs/document` funzionanti (ai service,
> `AUTHENTICATED_USER`, `makeRpcRouter`), FE ha `marked@18` + `shiki` già in deps.
> **Rev 2** — requisiti utente: context-aware "on this page", nav history
> in-sheet, expand toggle in HEAD (centrale), view-full-page low-prominence.

## Status: 🟢 DONE — Plan date: 2026-10-18 (rev: E2E playwright 6/6)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| C0 | Ingest `_order.json` come KB row speciale (self-updating via content_hash) | ✅ | 2026-10-18 | **verificato live**: row `backend/_order.json` `order_manifest:true` in docs_kb |
| C1 | `POST /api/v1/system/docs/index` — repo→pages tree ordinato + `entity` per entry | ✅ | 2026-10-18 | **verificato live**: backend 25 entries ordinati manifest (rbac=0…), entity propagata |
| C2 | `docs-context.svelte.ts` + hook in `EntityListTable` — pagina→entity→doc | ✅ | 2026-10-18 | claim/release con ownership token; `mode:'create'` per create pages |
| C3 | FE `DocsPanel.svelte` — VIEWER sheet: context-doc/TOC, index, search, nav history, see-also | ✅ | 2026-10-18 | `shell.docs`, modal:false; CTA topbar BookOpen |
| C4 | Sheet expansion centrale: `sheetState.expanded` + width override in SheetHost + SheetHeaderAction toggle | ✅ | 2026-10-18 | `setSheetExpanded()` + `w-1/2 sm:max-w-none` via twMerge |
| C5 | MDX renderer: marked + shiki + mermaid + heading anchors + link resolver KB-path | ✅ | 2026-10-18 | `docs-render.ts`; mermaid@12.1.0 pinned (12.2.0 <7gg) |
| C6 | Full-page route `/docs/[...path]` — low-prominence, doc tree page-local | ✅ | 2026-10-18 | nessuna entry nav globale; tree colonna sinistra in-page |
| C7 | i18n `app.docs.*` — 13 chiavi × 7 lingue | ✅ | 2026-10-18 | patch `20261018143000_seed_translations_docs_browser.sql` + manifest firmato (dev-micha), BE develop |
| C8 | Verifica E2E su dev server + `order_manifest` rows al prossimo ingest | ✅ | 2026-10-18 | `src/e2e/docs-browser.spec.ts` **6/6** (context doc, see-also+back, search, index+expand, view-full, route diretta); merge su develop US+FE+BE |
| C10 | Fix SDK `serve-docs-pack` — `extJsonParse` bigint-ificava `schema` → ogni pack endpoint 500 (ai self-pull incluso) | ✅ | 2026-10-18 | `JSON.parse` + exemption (come il fix BE); sdk develop `5d220e1` |
| C9 | **Fix link namespace** — extractor mappava `/docs/user-guide/x`→`frontend/guide/x` (repo inesistente); ora `<repo>/guide/x` | ✅ | 2026-10-18 | us `docs-loader.ts` + FE `resolveDocTarget`/`data-docrepo`; re-ingest live confermato |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Fatti verificati empiricamente (base del design)

### KB — `ai.docs_kb` (letta via MCP postgres)

- Row per chunk: `(repo, path, chunk_idx)` unique; `metadata` jsonb ha `source`
  (`mdx`|`openapi`), `title`, `content_type`, `links[]`, **`entity`**, `description`.
- `metadata.entity` valorizzato sui doc generati: `user_profile`, `organization`,
  `customer`, `role_mapping`, `config_entry` (11 pagine `generated/*.mdx` BE).
  I doc authored (`collaboration.mdx`, `rbac.mdx`, …) non hanno entity.
- **Path = relativo a `docs/user-guide/`** del pack (es. `generated/users.mdx`,
  `collaboration.mdx`) — NO prefisso `guide/`. Attenzione: filename ≠ entity
  (`generated/users.mdx` → `entity: user_profile`); il match pagina→doc deve
  passare per `metadata->>'entity'` nell'index, non dal filename.
- Repo reali oggi: `backend` (24 doc), `ai` (1 doc + openapi chunks
  `ai-openapi#METHOD /path` con `source='openapi'` — esclusi dall'index).
- `_order.json`: nei pack files (`cpSync` verbatim) ma **skippato in ingest**
  (`DOC_EXT` filter in docs-pack-ingest.ts:25) → ordering non è in KB.
- `content_hash` = `provider + embedding_input + links + entity` — metadata
  extra NON cambia l'hash → `metadata.order_index` non si propagherebbe.
  **Scartata** l'opzione order-in-metadata.

### Endpoint esistenti (ai/src/controllers/http/docs-search-route.ts)

- `POST /api/v1/system/docs/search` — body zod `{query?, embedding?, keywords?,
  limit(1-20), repo, path_prefix, ...}` → `{results: DocsSearchResult[]}`
  (chunk-level: repo,path,title,chunk_idx,content,metadata,similarity).
- `POST /api/v1/system/docs/document` — `{path, repo?}` → `{document:{repo,
  path,title,content,metadata}}` | 404 RFC7807. `getDocByPath` riassembla i
  chunk in `chunk_idx` order → contenuto MDX completo (frontmatter già
  strippato da `loadedDocFromMdx`).
- Convenzione: POST via `makeRpcRouter`, `AUTHENTICATED_USER`.
  FE chiama `/ws/ai/api/v1/system/docs/*` (proxy BE puro).

### `_order.json` — formato

```json
{ "pages": ["rbac", "collaboration", "modules", "generated/users", ...] }
```

Extensionless, relativo al tier root. BE `docs/user-guide/_order.json` ha 20+
voci. Il sito lo usa per `generate-nav.mjs`.

### Sheet system FE — architettura ENFORCED (docs/dev-guide/components/sheet-panel.mdx + docs/ai/sheets.md)

- **ESLint `no-restricted-imports`**: importare `$lib/components/ui/sheet`
  fuori da `components/ui|sidebar`, `shell/sheets`, `entity-list/sheets` →
  lint error. Architettura non bypassabile — UN host, UN registry.
- Registrazione pannello (checklist canonica): id in `SheetPanelId`
  (`'shell.*'`), props in `SheetPanelPropsMap` (**snake_case**, nessuna prop →
  `Record<string, never>`), component in `src/lib/shell/sheets/panels/`,
  entry in `registry` di `SheetHost.svelte`, apertura via `openSheet()` da
  click handler (MAI da `$effect` su flag bindable → loop).
- `SheetPanelLayout` OBBLIGATORIO: HEAD (icon snippet mandatory — **stessa
  icona della CTA che apre**) / TOOLBAR (tools only: search, tabs) / CONTENT
  (unica region scrollabile) / FOOT (primary CTA dei FORM).
- Tre archetipi: PICKER / FORM / **VIEWER** — DocsPanel è VIEWER (read-only,
  per-row actions, no commit footer).
- HEAD actions: `SheetHeaderAction` (chrome canonico `size-8` icon button) —
  **solo secondary utilities icon-only** (reset, clear, toggle). Se si passa
  `actions` snippet va ri-aggiunta esplicitamente la close `Sheet.Close`.
- Larghezza uniforme **384px** (`w-3/4 sm:max-w-sm` nel variant `side` di
  `sheetVariants`, `ui/sheet/sheet-content.svelte:9-10`). Doc: "a wider sheet
  is a central change to Sheet.Content, never via per-call contentClass
  hacks" → l'expansion si implementa in `sheet-manager` + `SheetHost`,
  non nel pannello.
- `SheetOpenOptions.modal` esiste già (default true) — `Sheet.Content` riceve
  `modal={sheetState.modal}` (SheetHost:72); il pannello riceve `modal` prop.
- Panel props passate spread + `modal={sheetState.modal}` (SheetHost:74).

### Context detection — pagina → entity

- `EntityListTable` riceve `entity="customer"` esplicito da OGNI entity page
  (es. `system/customers/+page.svelte:697`) → UN solo hook nel componente
  condiviso copre tutte le list pages. Le form pages (new/edit) usano gli
  stessi componenti entity con prop `entity`.
- `resolveModuleFromRoute(pathname)` in `modules-shell.svelte.ts:36` risolve
  modulo da `route_prefixes` — non serve per entity detection ma conferma
  che il context va preso dal componente, non dalla route.
- KB `metadata.entity` ↔ `EntityListTable.entity` match diretto
  (`customer`, `user_profile`, `organization`, `role_mapping`, `config_entry`).

### Link nei contenuti KB

I sorgenti user-guide contengono: link relativi (`./x`, `x.md`), repo-rooted
(`/docs/user-guide/x`) e site-scheme (`/<repo>/guide/x`). Resolver FE:

- `generated/users` relativo → stesso repo, `generated/users.mdx`
- `/docs/user-guide/x` → stesso repo, `x.mdx`
- `/<repo>/guide/x` → `{repo, x+'.mdx'}`
- `/<repo>/dev/*` → NON in KB → `docs.primebrick.dev` nuova tab
  (dev docs non entrano nel prodotto, by design)

---

## C0 — `_order.json` nella KB (ai/docs-pack-ingest.ts)

In `ingestDocsPack`, whitelist `_order.json` come LoadedDoc sintetico
(JSON senza frontmatter — non passare per `loadedDocFromMdx`):

```ts
if (basename(file.path) === '_order.json') {
  docs.push({
    repo, path: `${dirname(file.path) === '.' ? '' : dirname(file.path) + '/'}_order.json`,
    title: '_order', content: file.content,
    metadata: { source: 'mdx', repo, path: file.path, title: '_order',
                content_type: 'reference', order_manifest: true },
  });
  continue;
}
```

`content_hash` copre `embedding_input` → cambio `_order.json` nel pack =
re-ingest automatico della row. **Zero schema change.**

## C1 — `POST /api/v1/system/docs/index` (ai service)

Nuova route in `docs-search-route.ts` + service `DocsSearchService.getIndex()`:

```ts
{ repos: [
  { repo: "backend", entries: [
    { path: "generated/users.mdx", title: "Users List", order: 4,
      entity: "user_profile", headings: ["Fields", "Row actions"] }, ...
  ]},
  { repo: "ai", entries: [ ... ] }
]}
```

- SQL: `metadata->>'source' = 'mdx'` AND `chunk_idx = 0` (una riga per doc —
  metadata completo già su chunk 0: title/entity/description/links) +
  le `_order.json` rows per l'ordering map.
- `headings`: derivato FE-side dal documento fetchato (vedi C3) — NON
  nell'index (index leggero, headings solo on-demand). Entry espone solo
  `entity` per il context matching.
- Ordering: parse `_order.json` → `pages[]` → order = index (match path
  senza `.mdx`); non in lista → `null` → sort dopo, alfabetico per title.
- Escludere `order_manifest` rows da entries.
- Permessi: `AUTHENTICATED_USER`.

## C2 — Context detection (`src/lib/shell/docs/docs-context.svelte.ts`)

Modulo `$state` minimale — nessun tocco alle singole page:

```ts
export const docsContext = $state<{ entity: string | null }>({ entity: null });
export function setDocsEntity(entity: string | null) { docsContext.entity = entity; }
```

- `EntityListTable` (componente condiviso, prop `entity` già presente):
  `onMount(() => setDocsEntity(entity))` + cleanup `onDestroy(() => setDocsEntity(null))`.
  Copre TUTTE le entity list pages senza edit per-pagina.
- Stesso hook nel root component delle entity form pages (create/edit) —
  da censire il componente condiviso (probabilmente un `EntityForm`/`ViewLayout`
  comune) e hookare lì; se non esiste un singolo root, fallback pathname→entity
  map minuscola per le route `/new`/`/edit` (oggi 5 entity coperte in KB).
- Pagine non-entity (settings, crm/pipeline, …): `entity=null` → il pannello
  apre su index+search (comportamento degratato corretto).

## C3 — FE `DocsPanel.svelte` — VIEWER sheet

`src/lib/shell/sheets/panels/DocsPanel.svelte`. Registrazione canonica:
`'shell.docs'` in `SheetPanelId`, `SheetPanelPropsMap['shell.docs'] =
Record<string, never>` (v1 — `initial_path` futuro per link dal Guide AI),
component + registry entry in `SheetHost`.

**Apertura**: `openSheet('shell.docs', {}, { modal: false })` — overlay
NON modale: l'utente legge la doc MENTRE interagisce con la pagina
(requisito esplicito: "non modale e in overlay… come le altre sheet" — le
altre sono modal:true di default; questa è l'eccezione deliberata by-design).
Entry point: icona `BookOpen` in `AppTopbar` → HEAD icon = `BookOpen`
(stessa icona, obbligatorio).

**Anatomia** (SheetPanelLayout):

- **HEAD**: icon BookOpen + title `{$t('app.docs.title')}` + `actions`:
  - `SheetHeaderAction` expand/collapse (`Maximize2`/`Minimize2`) → C4
  - `SheetHeaderAction` back (`ArrowLeft`) — visibile solo quando navStack > 1
  - `Sheet.Close` standard (ri-aggiunta esplicita — actions sostituisce default)
- **TOOLBAR**: search input debounced 300ms (tools only, da spec TOOLBAR)
- **CONTENT**: la view corrente (context-doc / index / results / doc)
- **FOOT**: nessuno (VIEWER — no commit CTA)

**Nav history in-sheet** (requisito 2):

```ts
type DocsNav = { view: 'context'|'index'|'results'|'doc', repo?: string,
                 path?: string, anchor?: string, query?: string };
let navStack = $state<DocsNav[]>([{ view: 'context' }]); // o index se no entity
function push(n: DocsNav) { navStack.push(n); }
function back() { if (navStack.length > 1) navStack.pop(); }
```

Back CTA in HEAD abilitato su `navStack.length > 1` — sempre ritorno
al view precedente (doc→context, doc→results, results→context, …).

**Viste**:

1. **context** (default quando `docsContext.entity` matcha un entry):
   fetch `index` una volta → find `entity == docsContext.entity` →
   fetch `document` → render + in cima al contenuto un box
   **"On this page"** (TOC: headings `##`/`###` estratti dal doc → click =
   scroll anchor dentro il CONTENT scroll div). Sotto: bottone ghost
   `{$t('app.docs.browse_all')}` → push index view.
2. **index**: accordion per repo → entries ordinate (order, title);
   click → push `{view:'doc', repo, path}`.
3. **results**: lista `title` + repo badge + snippet (~140ch stripped);
   click → push `{view:'doc', repo, path, anchor?}` (anchor da
   `metadata.heading_path` se presente, else top).
4. **doc**: titolo, breadcrumb `repo / path`, contenuto renderizzato (C5),
   prev/next dalla entries list (order-based), e in fondo:

   - **"See also"** — `metadata.links` del doc → link in-panel (stesso
     resolver di C5; esterni → nuova tab). Requisito: related/see-also CTA.
   - **"View full page"** — link testuale discreto
     (`{$t('app.docs.view_full')}` → `goto('/docs/<repo>/<path>')`) —
     low-prominence per requisito utente.

**Context refresh**: se il pannello resta aperto mentre l'utente naviga tra
entity pages, `docsContext.entity` cambia → `$effect` su `docsContext.entity`
aggiorna la vista context SOLO se l'utente è ancora sulla view `context`
(se sta leggendo un doc specifico, non disturbare — la doc non segue la
navigazione una volta che l'utente ha scelto).

**i18n** `app.docs.*`: title, search_placeholder, on_this_page, browse_all,
see_also, view_full, empty_index, no_results, prev, next, expand, collapse,
open_site_docs (per dev-links). **testid**: `docs-panel`, `docs-search-input`,
`docs-toc`, `docs-back`, `docs-expand`, `docs-tree-<repo>`,
`docs-entry-<path>`, `docs-doc-content`, `docs-see-also`, `docs-view-full`.

## C4 — Sheet expansion CENTRALE (requisito 3)

La doc vieta width via `contentClass` per-panel ("central change"). Design
conforme — nel sistema sheet, non nel pannello:

```ts
// sheet-manager.svelte.ts
type SheetState = { ...; expanded: boolean };
export const sheetState = $state<SheetState>({ ..., expanded: false });

export function setSheetExpanded(expanded: boolean) {
  sheetState.expanded = expanded;
  sheetState.modal = expanded; // expanded = modal per spec utente
}
```

```svelte
<!-- SheetHost.svelte — Sheet.Content class -->
class={cn(sheetState.contentClass,
  "shadow-[4px_0_24px_-4px_rgba(0,0,0,0.3)]",
  sheetState.expanded && "sm:max-w-none w-1/2")}
```

`cn` = twMerge → `sm:max-w-none`/`w-1/2` risolvono contro il `w-3/4
sm:max-w-sm` del variant (conflitto class risolto, ultima vince). Verificare
cn() = twMerge nel `$lib/utils` prima di implementare; se non twMerge,
sostituire con variabile `$derived` di class string.

Reset: `closeSheet()` e `openSheet()` resettano `expanded=false` (il toggle
è per-sessione del pannello corrente, non persistente). Il DocsPanel chiama
`setSheetExpanded(!sheetState.expanded)` dal suo SheetHeaderAction
(`Maximize2` ↔ `Minimize2` secondo stato). Altri pannelli non toccati —
flag inutilizzato da loro, zero regressioni.

**Legality check** (requisito: "controlla se è legale"):
- HEAD secondary icon-only utility via `SheetHeaderAction` → ✅ esplicitamente
  permesso ("HEAD = close ✕ + secondary icon utilities only").
- Width central change → ✅ esattamente la via indicata dalla doc
  ("implement it centrally e.g. a width variant on Sheet.Content").
- modal:false per un pannello VIEWER → ✅ `modal` è SheetOpenOptions
  ufficiale, non hack; usato per non bloccare l'interazione sottostante.
- Aggiornare `docs/ai/sheets.md` + `sheet-panel.mdx` con il nuovo
  `expanded`/`setSheetExpanded` una volta implementato (doc-as-code: le
  doc sheet vanno tenute allineate — nota make-docs).

## C5 — MDX renderer + TOC anchors

`src/lib/shell/docs/render-doc.ts`:

1. **Mermaid extract**: `<Mermaid chart={\`([\s\S]*?)\`}\s*/>` → token
   `<!--MERMAID:n-->` + chart strings (unico JSX nel corpus — 5 occorrenze,
   verificato).
2. **Headings**: pre-parse `^#{2,4} ` sul markdown → `headings[]` con
   anchor slug (github-style) → usati dal box "On this page" e per lo
   scroll-anchor da search results.
3. **marked.parse** `gfm:true, breaks:false`; heading ids inject via
   custom renderer (`<h2 id="slug">`) per lo scroll anchoring.
4. **Shiki**: post-process `<pre><code class="language-*">` via wrapper
   `src/lib/highlight/shiki.svelte.ts` (linguaggi mancanti → plain text,
   come sul sito).
5. **Mermaid mount**: post `{@html}` tick → querySelector marker →
   `mermaid.render` → svg inline. Dep `mermaid` pinned exact (≥7gg).
6. **Link resolver**: click delegation sul container (tabella mapping in
   "Fatti verificati"); `#anchor` → scroll interno; KB path →
   `push({view:'doc', repo, path})` (entra nella nav history); `/dev/*` →
   `docs.primebrick.dev` nuova tab.
7. **Images**: `src` relativi → non in KB → render alt text + placeholder
   icon (corpus attuale: 0 immagini nei user-guide — verificare).

## C6 — Full-page route `/docs/[...path]` (low-prominence)

"View full page" apre una vera route nella content area con shell completa:

- `src/routes/(app)/docs/[...path]/+page.svelte` — path =
  `<repo>/<doc-path>` (es. `/docs/backend/generated/users`) → fetch
  `document` → stesso renderer C5 + TOC laterale.
- **Left sidebar**: `resolveModuleFromRoute('/docs/...')` → nessun modulo
  matcha → `syncModuleFromRoute` no-op → sidebar mantiene modulo corrente
  (accettabile: la docs page non "appartiene" a un modulo).
  Scelta design: quando pathname inizia con `/docs`, la sidebar mostra il
  **doc tree** (index già fetchato, FE-local — NON un DB module): sezione
  "Documentation" con repo→entries. Implementazione: in
  `AppSidebar`/nav component, branch `if (pathname.startsWith('/docs'))`
  → render docs nav invece di `module_nav`. Self-contained in FE, zero
  cambi BE/modules.
- Importanza volutamente bassa: entry solo dal link "View full page" del
  panel — nessuna voce nav, nessuna topbar CTA dedicata.

## Acceptance criteria

- [ ] `POST /docs/index` ritorna repos+entries ordinati (`_order.json`) con
      `entity` esposto (backend: rbac, collaboration, modules, …)
- [ ] Apertura da `BookOpen` topbar: su `/system/customers` il pannello mostra
      DIRETTAMENTE il doc `customer` con TOC "On this page"; click "Fields"
      scrolla alla tabella campi renderizzata in-sheet
- [ ] Su pagina non-entity → index view con accordion repo
- [ ] Back CTA percorre la nav history (doc→context→index); "See also" lista
      `metadata.links`; link interni doc→doc restano in-sheet
- [ ] Expand toggle: 384px non-modal → 50% viewport modal → toggle back;
      altri pannelli invariati
- [ ] "View full page" → `/docs/backend/generated/users` full-shell con
      doc tree nella sidebar
- [ ] Mermaid svg + shiki highlight funzionano; dev-links → sito esterno
- [ ] `_order.json` rows NON compaiono come pagine nell'index
- [ ] Nessun LLM coinvolto — solo POST index/search/document
- [ ] ESLint pulito (nessun Sheet.Root nuovo), i18n en/it, testid, build FE

## Rischi / note

- **Re-ingest** per C0: la row `_order.json` appare al prossimo pack pull;
  il pannello funziona anche senza (fallback path-sort).
- **Doc per form pages**: `generated/<entity>-create.mdx` esiste
  (`organizations-create`, `configurations-create`) — il context match può
  preferire `-create` quando la route è `…/new`; match: entity → cerca
  `generated/<entity>*` tra le entries della stessa entity, preferisci la
  variante "create" su form pages se `docsContext` espone anche `view`
  (`'list'|'form'`) — estendere docsContext a `{entity, view}` quando si
  hooka il form component.
- **`cn()` deve essere twMerge** — verificare `$lib/utils` prima di C4.
- **`modal:false` è una eccezione deliberata** alla default `modal:true`
  degli altri sheet — documentarla nel codice e in sheet-panel.mdx.
- **OpenAPI chunks** esclusi dall'index — futura "API reference" view
  fuori scope.
- **Pack per-service** (emailsender/webhook user-guide) entrano come repo
  separati nell'index — by design.
