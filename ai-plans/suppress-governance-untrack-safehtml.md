# suppress-governance — untrack() + SafeHtml + reason-comment enforcement

Status: ✅ EXECUTED — verifica empirica completa 2026-11-22 (vedi "Esito" in coda)

## Obiettivo

Riportare le 33 soppressioni residue dentro l'architettura (idiomi nativi /
componente governato) e dentro lo standard (regola check-standards enforced),
invece di lasciarle come convenzione "soppressione + commento".

## Censimento empirico (tutte le soppressioni, con causa)

Fonte: grep `svelte-ignore|eslint-disable|@ts-ignore` su fe `src/` (excl. `__tests__`),
be `src/`, us `*/fe/`, sdk `src/`+`tools/`, dal `src/` — 2026-11-19.

**Copertura cross-repo (verificata)**:
- `primebrick-us-v3` remote bundles `ai/fe`, `crm/fe`, `emailsender/fe`,
  `job-handler/fe` → **0 soppressioni**. In scope solo per la regola
  (le stesse convenzioni devono valere lì — enforced identiche).
- `primebrick-v3-sdk` → **13 soppressioni** (vedi classe G sotto).
- `primebrick-dal-v3` → **0**.

### Classe A+B — `svelte-ignore state_referenced_locally` (24)

| Sottoclasse | Causa | Siti |
|---|---|---|
| A — draft/snapshot mutabile | `let x = $state(prop)` su prop mount-stabile (panel remount via `keepMountedState:false`/`{#key}`), copia locale editabile | BadgeValuePanel ×4, regex-flags-panel ×3, modules/[code] ×2, EntityDictPage ×2, MfaChallenge ×2, EntityRecordSheet ×2, JsonPreviewEditor, ConfigList, EntityTablePage, ai-chat-panel:118, json-schema-choice-card, EntityFormField, EntityRecordSheetBody, anchor-tabs (registration), useTypeCapabilities (module singleton) |

**Prova eseguita (svelte-autofixer MCP)**:
- `let draft = $state(props.value)` → warning `state_referenced_locally` (baseline confermata)
- `let draft = $state(untrack(() => props.value))` → **0 issues** — `untrack`
  è l'escape hatch sanctioned: stessa semantica (read-once, no subscription)
  espressa nel codice, non nel commento.

### Classe C — `svelte/no-at-html-tags` con DOMPurify (3)

`ai-chat-panel.svelte:527`, `DocsPanel.svelte:529`, `docs/[...path]/+page.svelte:150`
— tutte già sanitize (`mdToHtml`/`renderDoc` con DOMPurify). Il lint è corretto
(`{@html}` è un boundary XSS), la soppressione è un commento onesto ma il
sanitize può essere dimenticato altrove domani.

### Classe D — `no-var` in `declare global` (2)

`browser-translator.ts:22,41` — `var` è **obbligatorio** nelle ambient
declaration TS (let/const vietati). Legit-by-language, come `no-namespace`
in express-augmentation.

### Classe E — `no-explicit-any` boundary onesto (2)

`be:aggregated-router.ts:34` (`-- spec merge mutates...`), `SheetHost.svelte:43`
(`Component<any>` registry, commento di contratto sopra). Keep: il boundary
è genuinamente eterogeneo.

### Classe F — `no-empty-pattern` e2e (1)

`smart-regex-model-selector.spec.ts:37` — Playwright fixture `async ({}, use)`.
Fix banale: destrutturare un fixture reale (`browserName`) o usare il file-level.

### Classe G — SDK `no-explicit-any` (13, 11 senza motivo)

- `src/microservice/db-migration-step.ts` ×9 — port boundary vs `dal-pg`
  (pool/logger concreti vivono là, SDK non può importarli): onesto, 2 già
  motivati (`-- port boundary`), gli altri 7 ricevono lo stesso tail.
- `src/docs-gen/extract-svelte.ts` ×4 — manipolazione AST svelte/sveld dove
  i tipi sono opachi: boundary onesto, motivo da scrivere; valutare se un
  `unknown`+narrowing è preferibile caso per caso.

## Cambiamenti

### TOC-1 — `untrack()` sostituisce le 24 soppressioni (fe)

Per ogni sito classe A+B: `let x = $state(expr)` → `let x = $state(untrack(() => expr))`;
`const x = expr` (letture one-time) → `untrack(() => expr)` dove il warning persiste;
rimuovere la riga `// svelte-ignore`. Il commento esplicativo resta se documenta
semantica (es. "panel remounts on each open") ma come doc, non come licenza.

Casi da valutare in esecuzione:
- `useTypeCapabilities` module singleton — `const _state = $state({...})`: verificare
  perché il warning scatta su init letterale; se falso positivo del linter su
  `const` non-prop, la soppressione resta con motivo (classe E analoga).
- `anchor-tabs` `ctx.registerTab(value)` — chiamata di registrazione, non read:
  `untrack(() => ctx.registerTab(value))` ha semantica corretta (effetto una tantum).

### TOC-2 — `SafeHtml` in `@primebrick/ui` (ui + fe)

Nuovo `src/lib/components/safe-html/SafeHtml.svelte`:
```svelte
<script>
  import DOMPurify from 'dompurify';
  let { html, profile = 'docs' }: { html: string; profile?: 'docs' | 'chat' } = $props();
  const PROFILES = { docs: {...}, chat: {...} }; // portati dai due call-site esistenti
  const clean = $derived(DOMPurify.sanitize(html, PROFILES[profile]));
</script>
<!-- eslint-disable-next-line svelte/no-at-html-tags — SafeHtml owns the sanitize boundary -->
{@html clean}
```
- `dompurify` dep fissata in `primebrick-v3-ui/package.json` (versione pinnata, rule
  package-versioning)
- Migrazione: i 3 call site passano html **raw** a `<SafeHtml>` e perdono il
  sanitize locale — il boundary è dentro il componente, non dimenticabile.
  `docs-render.ts`/`mdToHtml` continuano a produrre html raw (sanitize spostato).

### TOC-3 — Fix banali

- e2e `no-empty-pattern`: fixture reale al posto di `{}` vuoto
- `browser-translator` ×2: keep con motivo esplicito già presente (legit-by-language)
- SheetHost/aggregated-router: keep (motivo già presente)

### TOC-4 — Regola check-standards `suppress-reason` (sdk)

Nuova regola in `tools/check-standards.ts` (profili be/fe/us):
- `eslint-disable*` / `@ts-ignore` / `@ts-expect-error` senza tail ` -- <motivo>`
  o commento `//` esplicativo nella riga precedente → **violation**
- `svelte-ignore` senza lo stesso requisito → **violation**
- `svelte-ignore state_referenced_locally` → **violation sempre** una volta
  completata TOC-1 (untrack esiste — la soppressione non è più ammessa)
- baseline: le entrate correnti post-migrazione entrano nella baseline solo se
  motivate

### TOC-5 — Doc (regole, non prosa nuova)

- `fe:docs/ai/svelte-runes.md` + `.devin/rules/svelte-runes.md` (pointer):
  `untrack()` = THE idioma per snapshot/draft/letture one-time; `svelte-ignore`
  non è più un meccanismo ammesso per `state_referenced_locally`
- `docs/ai/commit-verification.md` o AGENTS.md: riga sulla convenzione
  "soppressione solo con motivo" → ora enforced da `suppress-reason`

## Acceptance

- [ ] `grep state_referenced_locally fe:src` → **0** (eccetto eventuale falso
      positivo `useTypeCapabilities` documentato)
- [ ] `grep no-at-html-tags fe:src` → 1 sola, dentro `SafeHtml.svelte`
- [ ] `pnpm check` fe + `svelte-check` ui puliti; `check:standards` pass con
      la nuova regola attiva
- [ ] E2E panel apre con draft funzionanti (BadgeValuePanel/regex-flags) —
      verifica render, non solo typecheck. Spec persistente:
      `fe:src/e2e/regex-flags-panel.spec.ts` — contratto draft-snapshot
      (remount → re-init da prop). **Headed sempre** — `use.headless:false`
      enforced in playwright.config.ts (regola utente: mai headless).
- [ ] `{@html}` call site: markdown sanitizzato ancora corretto (test manuale
      docs + chat panel)

## Rischi

- **Semantica untrack**: identica alla soppressione attuale (read-once) — il
  rischio è solo cosmetico su `const` puri; mitigato valutando caso per caso.
- **SafeHtml**: doppia sanitizzazione se un call site dimenticasse di droppare
  la sua — idempotente, non dannoso; la migrazione rimuove il sanitize locale.
- **Version bump**: `SafeHtml` in ui + consumatori fe → coordinare ordine
  (ui prima, fe dopo — come da convenzione cross-repo).

## Esito (empirico, 2026-11-22)

**46 soppressioni censite → 8 residue, tutte con reason esplicita:**

| Repo/superficie | Prima | Dopo | Dettaglio |
|---|---|---|---|
| fe `src/` | 31 | **1** | SheetHost `Component<any>` registry — reason tail |
| be `src/` | 2 | 2 | express-augmentation + aggregated-router — già `--`-tagged |
| sdk `src/` | 13 | **2** | db-migration-step: 7→1 block-disable con reason; extract-svelte: 3 eliminate via narrowing strutturale, 1 `any`+reason (walkTemplate AST union) |
| ui `src/` | 0→3 scoperte | **3** | remote-mount ×2 (reason tail), wheel-picker a11y (già spiegata, multi-line) |
| us `*/fe/` | 0 | 0 | — |

**Evidence:**
- `regex-flags-panel.spec.ts` persistente — BEFORE headed 2/2, AFTER headed
  3/3 (+BadgeValuePanel): contratto draft-snapshot identico pre/post
- `docs-browser.spec.ts` headed **6/6** — docs render path via SafeHtml E2E
- `safe-html.test.ts` nuovo (persistente) — strict/docs profile sanitize
  contract, 13 test con docs-render, jsdom
- `svelte-check` fe+ui 0/0; eslint clean; `tsc` sdk clean
- `suppress-no-reason` in `tools/check-standards.ts` — always-on, tutti i
  profili: 8 rule-test + 2 regression multi-line-comment, 45/45 tool tests
- check-standards clean su sdk, fe, ui, be, dal, ai/crm/emailsender/job-handler
- Doc aggiornate: `docs/ai/svelte-runes.md` (untrack idioma), pointer rule,
  AGENTS.md §6, `docs/ai/check-standards-gate.md` (+ fix stale
  `--write-baseline`), headed-E2E rule docs (turno precedente)

**Commits:** fe `bc5d5b2`, `cceefe2` — ui `9a45c80`, `841f625` —
sdk `43ff157` (tutti su `feature/*` branches, GitFlow).
