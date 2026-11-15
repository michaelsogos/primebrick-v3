# Docs Pipeline — release wiring, site auto-deploy, in-product docs browser

> Gaps verificati empiricamente (2026-10-16): (1) docs generation non cablata —
> `extract-docs`/`generate:docs` mai invocati da build/rituali → artefatti stale;
> (2) **deploy docs-site ROTTO**: trigger CF su push:main esiste (build log reale)
> ma `main` esegue ancora `generate-reference-docs.mjs` — script ritirato su develop,
> crasha su `roleMappingMeta`→`roleMappingsMeta` (rename refactor BE) → fix su develop
> mai rilasciato; (3) pannello browse-docs nel prodotto non esiste (→ file separato).
> KB=user-guide-only è by-design (verified), NON un gap.
> Zero assunzioni: ogni fatto sotto ha evidenza file:line / log / API call.

## Status: � DONE — Plan date: 2026-10-17 — updated 2026-10-18: tutti i task chiusi (A/B/N/D/C + Track P P1–P9 + residui A1)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| A1 | Extraction cablata in `prebuild` di ogni repo (dal/sdk extract+render, be/us generate:docs, fe extract-components, decimal extract-docs) | ✅ | 2026-10-17 | Rilasciato: dal/sdk 3.0.2, be v3.0.2, fe/us 3.0.1. Residui chiusi 2026-10-18: step `extract-docs` già presente in tutti gli skill make-docs; freshness gate in publish CI dal/sdk — con fix `gitRevision:"main"` in typedoc.json (URL `blob/<sha>` rendevano api.json dirty ad ogni commit) |
| A2 | — **fuso in A1** | 🚫 | | merged |
| A3 | **decimal: `docs/dev-guide/` completo** + typedoc→`_extracted/api.json` + render-api-reference.mjs MDX-safe + `_order.json` + entry in `repos.mjs` | ✅ | 2026-10-17 | 11 pagine + 40 simboli renderizzati. Rilasciato decimal `3.0.1` (hotfix docs-only); REPOS entry su main via docs `3.10.3`. NO user-guide/KB — verificato |
| A4 | Backfill artefatti stale via `feature/*` → develop | ✅ | 2026-10-17 | Tutti committati e portati a main via hotfix/release |
| A5 | Doc agente: be make-docs SKILL §7 riscritto, docs AGENTS allineato, **nuova rule condivisa `docs-pipeline.md` propagata a tutti i repo** + `package-versioning` rafforzata (razionale certificazione) | ✅ | 2026-10-17 | Rules propagate via feature branches → develop su be/dal/sdk/fe/us/website/docs/decimal |
| A6 | Pin `"@primebrick/decimal": "3.0.0"` in dal + propagazione package-versioning a decimal | ✅ | 2026-10-17 | Committato in dal 3.0.2; rule ora presente in decimal |
| B0 | Release docs repo → sblocco deploy rotto (script ritirato su main) | ✅ | 2026-10-17 | `3.10.1` rilasciato → CF deploy `33c3ef57` → docs.primebrick.dev live (194 route, tutte le pagine ex-crash OK) |
| B1 | Trigger CF su push:main esiste e funziona | ✅ | | documentato |
| B2 | `docs-release.yml` GH Action (cron 6h + dispatch): drift → sync → patch bump → merge main → tag → CF | ✅ | 2026-10-17 | Su main via docs `3.10.2` (`0f99317`). **Verificato live**: primo auto-run `github-actions[bot]` → docs `3.10.5` → CF deploy — ciclo drift→sync→bump→merge→deploy chiuso senza intervento umano |
| B3 | Backfill verso main: dal/sdk 3.0.2 npm, be v3.0.2, fe/us 3.0.1 | ✅ | 2026-10-17 | Tutti pushati |
| C1 | ~~Lib docs → product KB~~ **DROPPED** | 🚫 | | KB=user-guide-only by design |
| C2-C4 | In-product docs browser | ✅ | 2026-10-18 | → `docs-pipeline-release-wiring--product-browser.md` 🟢 DONE: C0-C10 implementati, E2E `docs-browser.spec.ts` 6/6 headless+headed, merged su develop (us `d94cb70`, fe `cca5e33`+`400c0e8`, be `a3ed62b`, sdk `5d220e1`) |
| N1 | "Libraries" nav: decimal mancante — `generate-nav.mjs` ha REPOS hardcoded separata da `repos.mjs` → unificare single-source (label/icon/group in repos.mjs) + regen + release | ✅ | 2026-10-18 | `label/icon/group` in repos.mjs, generate-nav importa la lista condivisa. Rilasciato docs `3.10.6`, CF deploy `7249ab7f` — sidebar live verificata (DAL/Decimal/SDK Library) |
| D0 | DAL audit duplication: `IAuditableEntity extends IDeletableEntity` + 7 campi copy-paste × ~26 entity (BE 12, US 15) | ✅ | 2026-10-18 | → `dal-audit-entity-base.md` 🟢 DONE: mixin `Auditable()`/`Deletable()` su `EntityBase`, estrattore schema esteso (inherited-member merge), zero diff DDL. **Rilasciato** dal `3.1.0` + be `v3.1.0` + us `3.1.0` su main |
| P1 | Render fidelity: `<Mermaid chart={...}/>` JSX multi-line corrompe lo strip (chart contiene `>`) → leak testo + tabelle `|---` non parsate. Fix: JSX→```mermaid fence pre-strip + test | ✅ | 2026-10-18 | §Track P. **Root cause più profonda trovata e risolta**: i chunk KB riuniti erano lossy → nuova row `chunk_idx=-1` (`doc_source`) con il raw body completo; `getDocByPath` la preferisce, search la esclude (`>=0`). E2E rbac: tabelle renderizzate, zero leak |
| P2 | See-also: label = path file (`generated/organizations`) → mostrare **titolo pagina** risolvendo via docs index | ✅ | 2026-10-18 | `path→title` lookup dall'index + fallback umanizzato; path resta hint secondario |
| P3 | Back in-sheet: salvare `scrollTop` nel nav stack per-entry e ripristinare post-render | ✅ | 2026-10-18 | `scrollTop` sul view-state, restore dopo `tick()`; E2E coperto |
| P4 | "Apri pagina intera" → vera anchor `target="_blank" rel="noopener noreferrer"` (tab nuova + focus nativo browser) | ✅ | 2026-10-18 | anchor nativa `/docs/<repo>/<path>`; E2E verifica nuova tab + URL |
| P5 | "Tutta la documentazione" + "Apri pagina intera" spostati in sub-header sotto la search input | ✅ | 2026-10-18 | strip azioni nel toolbar slot sotto l'input |
| P6 | Search input: icona `Search` inner-leading (absolute, `pl-8`) | ✅ | 2026-10-18 | |
| P7 | Index CTA: icona `library-big` + label "Indice della Guida" (i18n `app.docs.index`, patch firmata) | ✅ | 2026-10-18 | patch `20261018153000_seed_translations_docs_browser_polish.sql` firmata, manifest aggiornato |
| P8 | Search results: hit per-chunk appaiono duplicati → group by `repo+path`, titolo + best snippet, "+N matches" | ✅ | 2026-10-18 | `app.docs.more_matches` con `{n}`; E2E coperto |
| P9 | Search→doc: evidenziatore `<mark>` post-mount (DOM traversal post-sanitize) + navigator prev/next "k/N" con scroll-into-view | ✅ | 2026-10-18 | multi-word query → match per-termine; navigator floating con counter attivo + clear; E2E coperto |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Risposte utente (2026-10-16) — open questions risolte

1. **CF secret/token**: non serve più — il trigger CF su push:main esiste e funziona (B1 risolto, zero secret). Il "build token" sul dashboard resta inerte ma innocuo; `DEVIN_API_KEY cog_*` = Cognition, irrilevante qui.
2. **Trigger deploy**: push su `main` → CF build+deploy — **ESISTE e funziona** (build log `/opt/buildhome` mostrato dall'utente; la mia query API era endpoint sbagliato — ritirato). Il break è lo script morto su `main`, non il trigger.
3. **decimal**: doc completa standalone allo stesso livello di dal/sdk → A3 — **corretto a dev-guide only** (audience rule: end-user tier è per comportamento prodotto; una lib non ha utenti finali).
4. **bun**: RESTA — il fix tsx era solo per CI ubuntu senza bun (sdk/dal publish). US non pubblica su npm, `generate:docs` gira in dev dove bun c'è. Nessuna conversione.
5. **Priorità**: spiegato → 2 workstream: `feature/docs-pipeline` (A+B = plumbing release/site) POI `feature/docs-browser-panel` (C2-C4 — piano separato `--product-browser.md`).

---

## Verified current state (empirical, no assumptions)

### 1. Docs-site deploy — trigger CF ESISTE, il break è nella build

- **CF build agent gira davvero su push:main** — build log utente (`/opt/buildhome/repo/`, `npx tsx _extract-ref.ts`) 2026-10-16. La mia query API `12040` era endpoint sbagliato — conclusone ritirata.
- **IL BREAK**: `main` del docs repo ha ancora `generate-reference-docs.mjs` in `build:full` (script ritirato su develop, la generazione è entrata nel codice BE via `generateReferenceDocs` → `docs/user-guide/generated/` — 20 pagine committate su BE main). Lo script importa `roleMappingMeta` ma BE main esporta `roleMappingsMeta` (rename nel refactor) → **SyntaxError → build:full muore → deploy muore**.
- Il fix esiste su `develop` del docs repo (−509 righe, chain senza ref-docs) — **mai rilasciato a main**. Risoluzione = release del docs repo.

### 2. Site content model — `sync-repo-docs.mjs` + `fetch-openapi.mjs`

- `REPOS[]` (line 35-41): backend, frontend, microservices, dal, sdk → **decimal ASSENTE dalla lista**
- `TIERS[]`: `docs/user-guide→guide`, `docs/dev-guide→dev` — clona `--depth 1 --branch main`, salta `_extracted/` (fuel AI), **copia `_order.json`** (line 99-103, serve a generate-nav)
- Tier mancanti gestiti gracefully: `copyDirRecursive` return 0 + `syncRepo` skip/rimuove stale (line 84, 151-160) → decimal safe anche con un solo tier
- `fetch-openapi.mjs`: legge `.tmp-repo-sync/backend/src/openapi/openapi.ts` + `microservices/*/src/server/openapi-route.ts` via tsx → sempre fresco; **non tocca decimal/dal/sdk/fe** → entry decimal in REPOS non lo rompe

### 3. Generazione docs — solo manuale (verified: zero `-S extract-docs` in .github history di tutti i repo)

| Repo | Script | Output | Destinazione |
|---|---|---|---|
| decimal | `extract-docs`=typedoc | `docs/_extracted/api.json` | fuel AI — **ma `docs/` non esiste** |
| dal/sdk | `extract-docs` + `render-api-reference` | api.json + `dev-guide/api-reference.mdx` | mdx→sito, json→fuel |
| fe | `extract-docs` | components.json + mdx | idem |
| be | `generate:docs`=generate-docs-pack.ts | `dist/docs-pack/` | product pack (non committato) |
| us ×4 | `generate:docs`=`bun scripts/build-docs-pack.ts` | `dist/docs-pack/` | product pack |

Stale su main: dal api.json/api-ref (Oct 15, no DomainService), fe components (Oct 11), decimal (mai generato).

### 4. Product-side pipeline — GIÀ COSTRUITA

- SDK `src/docs-pack/`: buildDocsPack→`dist/docs-pack/{manifest,docs/**,openapi.json}`, serve-docs-pack, docs-pack-client; sha256/file = ingest incrementale
- BE `DocsPackService`→`GET /api/v1/system/docs/pack` (system.router)
- ai `docs-pack-subscriber`: `service.register`+`docs_pack` capability → pull→`pullAndIngest`→chunking→`ai.docs_kb`(repo/path/title/chunk_idx/content+vector(1024) hnsw); `unregister`→deleteRepoDocs; `gateway_online`→re-pull BE
- `docs-search-route`: `POST /docs/search` (hybrid vector+lexical, filtri repo/path_prefix) + `POST /docs/document`
- Admin page `system/settings/docs-index` (index-status/reindex/probes) + FE `marked@18`+`shiki@4` in deps
- **KB invariant (VERIFIED)**: ogni pack dichiara `docsDir: "docs/user-guide"` (ai `build-docs-pack.ts:10`, BE `generate-docs-pack.ts:16`) → KB = **solo doc utente**. Le lib non hanno pack: le loro doc vivono solo sul sito (entrambi i tier) + `_extracted/` fuel. Corretto così.

---

## Track A — Generazione cablata nella release

### A1 — Generazione a build-time (desiderata: automatica, zero rituali da ricordare)

L'utente vuole il processo **trigger-based, invisibile**: la doc generata si rigenera ad ogni `pnpm build` (dev + CI), gli artefatti committati cavalcano feature→develop→main senza che nessuno debba ricordarselo. Fallback accettato: chi non builda mai non produce drift committato — chiuso dalla safety net sotto.

- **Wiring**: `prebuild` di ogni repo guadagna il proprio step di generazione: decimal/dal/sdk/fe → `extract-docs`(+`render-api-reference`); be/us → `generate:docs` (pack **e** `docs/user-guide/generated/*.mdx` committati — BE main ne ha 20)
- **Effetto**: artefatti sempre freschi quando il codice cambia → diff visibile nel working tree → committato con la feature (deterministico: no diff se il codice non tocca la superficie documentata)
- **Prosa**: resta il rituale `make-docs`/`docs-sync-on-close` a feature-close (surgical, anti-rewrite) — la regola esiste già; lo skill guadagna lo step `extract-docs` esplicito (oggi la description lo promette ma gli step non lo eseguono)
- **Safety net**: `pnpm extract-docs && git diff --exit-code docs/` nella publish CI (dal/sdk) → fail se stale → chiude il caso "mai buildato prima del merge"

### ~~A2~~ — fuso in A1 (stesso meccanismo: `generate:docs` in `prebuild` di BE+US)

### A3 — decimal docs completi — **solo `docs/dev-guide/`** (audience rule: lib = dev-doc al 100%)
- `docs/dev-guide/`: index, getting-started, how-it-works (precision model), when-to-use / when-NOT-to-use, use-cases + esempi runnable, `api-reference.mdx` (da typedoc)
- `docs/_extracted/api.json` via typedoc (config già in typedoc.json) — fuel make-docs
- `docs/dev-guide/_order.json` per nav; aggiungere `{git:'…/primebrick-decimal', slug:'decimal'}` a `REPOS[]` — tier mancante (user-guide) è skippato gracefully (verified sync:84,151-160)
- **NON in KB prodotto**: non è un servizio + è dev-doc — invariante KB=user-guide-only rispettato
- Pointer agente (tier "agent" della audience rule): riga in AGENTS.md decimal + link dai repo che la usano

### A4 — Backfill one-shot → vedi B3
`feature/docs-backfill` su dal/fe/sdk → `pnpm extract-docs` (+render) → `develop`. Verso main via hotfix+tag (B3 — patch publish accettata).

### A5 — Fix documentazione agente stale + documentare la pipeline end-to-end
- **Claim "auto-deploy on push:main" nelle AGENTS: VERO** (trigger CF reale) — non toccare quella parte
- BE `.devin/skills/make-docs/SKILL.md` §7: cita `scripts/generate-reference-docs.mjs` (RITIRATO — ora `generateReferenceDocs` vive in BE `scripts/generate-reference-docs.ts`, dentro `generate:docs`) + "CI on push to main + 6h cron" (`sync-docs.yml` rimossa in `68a6e53`) → riscrivere con la procedura corretta
- `primebrick-v3-docs/AGENTS.md`: cita `sync-docs.yml` + cron rimossi; la chain `build:full` documentata manca `compliance-scan`/`generate-compliance-pdf` → allineare
- **Nuovo: scrivere la procedura pipeline completa** (dev-guide o rule `docs-pipeline.md` nei repo dove ha senso — utente: "rafforzare doc e devin rules, agente e dev"): chain prebuild-generation → artefatti committati → feature-close prose ritual → release upstream → release docs repo (warmup trigger) → CF build+deploy → KB ingest automatica via service.register

### A6 — Violazione `package-versioning` shippata (debito mio)
- `primebrick-dal-v3`: `"@primebrick/decimal": "^3.0.0"` — la regola vieta `^` (exceptions: `workspace:*`/`file:`/`catalog:`). Fix: `"3.0.0"` pinned su develop, ride sulla prossima release. Il 3.0.1 pubblicato funziona (npm risolve il range) — non serve republish urgente, ma la repo resta fuori regola finché non pinnato.

## Track B — Deploy docs-site

### B0 — SBLOCCO (il break reale)
Docs repo `main` ha `build:full` con `generate-reference-docs.mjs` — script ritirato su develop, crasha su `roleMappingMeta` (rinominato `roleMappingsMeta` su BE main nel refactor). **Fix = GitFlow release del docs repo**: `release/<ver>` da develop → merge main + tag → push → CF builda la chain nuova. Sync clona i `main` upstream (già rilasciati) → sito si aggiorna con tutto il backlog (+7333 righe pending su develop, incluse le pagine generated da BE).

### B1 — Trigger: ESISTE GIÀ, niente da costruire
CF build agent su push:main del docs repo — verificato via build log reale. La chain (`build:full`) clona upstream main → sync → openapi → nav → compliance → `zudoku build` → deploy. **`wrangler deploy` non è nemmeno necessario a mano** — CF deploya lei.

### B2 — Chi/quando triggera: automatico, non checklist-dependant

Utente: "manuale significa che tu poi non lo fai" → il trigger NON deve dipendere da un passo ricordato.

**`docs-release.yml` GH Action in primebrick-v3-docs** — `on: schedule(cron */6h) + workflow_dispatch`:
1. Per ogni repo in `REPOS[]`: `git ls-remote origin main` → SHA upstream
2. Confronta con gli SHA registrati all'ultimo docs-release (file `upstream-pins.json` committato, o `git show <last-tag>:…`)
3. Se drift → patch bump (`3.10.x`) → `release/<ver>` → merge `--no-ff` main → tag → push (il merge push È il trigger CF) → back-merge develop → delete branch

Worst case: sito aggiornato ≤6h dopo ogni release upstream — **nessuno deve fare nulla**. Per sync immediato a fine release-train: `gh workflow run docs-release.yml` (o `pnpm release:docs` locale — stesso script). Versioning docs repo: patch bumps ora (3.10.x), minor alla prossima release-train (3.11.0) — come deciso dall'utente.

### B3 — Backfill immediato verso main
Utente accetta patch publish: `hotfix/3.0.2`+tag su dal e sdk (npm pubblica una versione docs-only — accettato), `hotfix/3.0.1`+tag su fe (nessun publish — FE non è npm).

## Rischi / note

- ~~Sync-site dir mancanti~~ **verificato**: skip graceful (sync-repo-docs.mjs:84,151-160) — sicuro aggiungere decimal.
- `generate:docs` in `prebuild` di BE/US: gira a ogni build — pack sempre allineato al codice.

## Track P — Product browser polish (feedback utente 2026-10-18)

Home: stessa codebase del track C — `primebrick-fe-v3/src/lib/shell/docs/docs-render.ts`,
`src/lib/shell/sheets/panels/DocsPanel.svelte`, `src/routes/(app)/docs/[...path]/+page.svelte`.
Estendere `src/e2e/docs-browser.spec.ts` per coprire ogni punto.

### P1 — Render fidelity (root cause verificata sul DB live)

Il rendering **non è un componente**: `renderDoc()` è una pipeline funzione —
`mdx → stripMdxDirectives → marked(gfm) custom renderer → token code→shiki →
mermaid placeholder → DOMPurify → {@html}`.

Bug reale trovato: `stripMdxDirectives` usa `/<\/?[A-Z][A-Za-z0-9]*[^>]*>/g` —
`[^>]*` si ferma al **primo `>`**. I doc KB contengono `<Mermaid chart={...}/>`
con il chart multilinea che contiene `-->` (frecce) → il regex mangia solo
l'apertura fino al primo `>` del chart, lascia il resto del diagramma come
markdown grezzo, e corrompe tutto il parsing a valle (in `rbac.mdx`: 4 tabelle
emesse come testo `|---`, TOC persa, fence rotti). Census live su `ai.docs_kb`:
unico componente PascalCase nel corpus = `Mermaid` (5 occorrenze).

Fix:
1. Pre-strip mirato PRIMA dello strip generico: replace di
   `<Mermaid chart={\`...\`}/>` (multi-line, backtick attr) con fenced
   ```` ```mermaid ```` block → il diagramma passa nel path normale
   (`code` renderer → `.docs-mermaid` placeholder → `hydrateMermaid`).
   Renderizza davvero, non solo "non rompe".
2. Strip generico invariato per il resto (import/export, tag single-line).
3. Test unitari `docs-render`: table→`<table>`, `-`/`*` e `1.`→`<ul>/<ol>`,
   fence→shiki html (`class="shiki"`), `Mermaid JSX`→`.docs-mermaid`,
   nessun `|---`/`-->` leakato nel `html` finale.
4. Verifica su tutti i 24 doc backend: nessun match di `/\|---|` nell'output.

### P2 — See-also con titoli pagina

`metadata.links` sono path (`generated/organizations`). Il panel ha già
l'index (`fetchDocsIndex` → `{path,title}`). Implementazione: memoized map
`path→title` dall'index del repo corrente; label = `title` (fallback:
filename umanizzato — strip `generated/`, kebab→Title Case); il path resta
come hint secondario (subtitle/tooltip). Se il link punta a repo diverso
(namespace `<repo>/guide/`), title lookup nel repo target.

### P3 — Scroll restore su back

Nav stack entry oggi: `{repo, path, title}`. Aggiungere `scrollTop` —
catturato dallo scroll container del contenuto (`.docs-panel-body` o il
`SheetPanelLayout` scroll area) in `openDoc()` prima di rimpiazzare il doc.
Su back: `pop()` → `await tick()` → `el.scrollTop = entry.scrollTop`.
Profondità arbitraria gratis (stack di entry). Stesso meccanismo nel
full-page? No — lì il back è browser history (gestito dal browser).

### P4 — "Apri pagina intera" in `_blank` + focus

Oggi `goto('/docs/...')` nella stessa tab. Fix: anchor nativa
`<a href="/docs/{repo}/{path}" target="_blank" rel="noopener noreferrer">`
— da user gesture il browser apre E focalizza la tab (affidabile; 
`window.open().focus()` è bloccato/dipende da popup-blocker in alcuni browser).
Costruire l'href dalla stessa logica usata ora (encode path segments).

### P5 — Sub-header azioni sotto la search

Righe azioni spostate dal body/topbar a una sub-header strip sotto l'input:
[📚 Indice della Guida] · [↗ Apri pagina intera] — `Button variant="ghost"
size="sm"` o link style coerente con `SheetPanelLayout`. Restano visibili in
tutte le view (context/index/doc).

### P6 — Icona dentro la search input

Wrapper `relative`; `<Search class="absolute left-2.5 top-1/2 -translate-y-1/2
size-4 text-muted-foreground"/>` + input `pl-8`.

### P7 — Icona index = `library-big` + label "Indice della Guida"

`BookOpen` → `LibraryBig` (lucide, già in `lucide-svelte`). Chiavi i18n:
`app.docs.index` → it "Indice della Guida" / en "Guide Index" (+ 5 lingue
resto). Patch seed + manifest sign con dev-key come fatto per C7.

### P8 — Search results: group per documento

`/docs/search` ritorna hit **per chunk** (doc N-chunk → N hit con stesso
titolo). Group FE-side in `onSearch`: `Map<`${repo}|${path}`, hit[]>` —
entry = title (da hit metadata o index) + snippet del chunk con score
migliore; se >1 chunk: "+N altri match in questa pagina". Click → apre doc
con query (→ P9) e opzionalmente `chunk_idx` per scrollare sul chunk
rilevan te (gated da P9 — lo scroll va al primo `<mark>`).

### P9 — Highlight ricerca + match navigator

Stato: `openDoc(repo,path,{ highlight: query })`. Post-render + `tick()`:
1. DOM traversal su `.docs-content` — `TreeWalker` sui text node
   (skip `PRE`,`CODE`,`SCRIPT`,`STYLE` — non evidenziare dentro il codice);
   per ogni match case-insensitive del termine (escape regex) split del
   text node + wrap in `<mark class="docs-search-hit">`; il match attivo
   prende `docs-search-hit-active`. Safe: opera sul DOM **dopo** DOMPurify,
   nessuna stringa HTML ricostruita, nessun rischio injection.
2. Navigator floating (sticky top nel body doc): `‹ ›` + "k/N"; next/prev
   aggiornano l'indice attivo → `.scrollIntoView({block:'center'})` +
   classe active. Visibile solo se `highlight` è settato; X lo chiude.
3. Cleanup su cambio doc/search clear.

### P-track — E2E (estendere `docs-browser.spec.ts`)

- render: doc con mermaid JSX → `.docs-mermaid-diagram` svg, tabella renderizzata
- see-also mostra titoli (non path)
- back → scrollTop ripristinato (scrollare, navigare, back, assert posizione)
- "Apri pagina intera" → `context.waitForEvent('page')` → nuova tab con URL
- search: 2 hit stesso doc → 1 risultato grouped; click → `<mark>` presenti,
  next/prev cambia active + counter "k/N"
