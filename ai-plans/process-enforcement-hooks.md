# Process enforcement hooks — prova del 9 meccanica nel lifecycle dell'agente

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN. IT IS THE WORKFLOW.

Every turn, in this order, NO EXCEPTIONS:
1. Read this whole plan — this block IS the operative workflow.
2. Fill in DOC RECEIPTS below before any action (cite doc:line).
3. State of the world = VERIFICATION LEDGER, never your memory.
4. Execute only the declared scope. Anomaly → STOP → report, max 2 retries.
5. Output waits ≤30s. Beyond that = anomaly, not "still running".
6. Before closing: write verdict + ledger + next step into the plan.
7. Prova del 9: every state claim carries `file:line` — if you cannot
   cite it, you did not verify it, it is an assumption.

## DOC RECEIPTS (fill before acting)
| doc:line | what it says | how it applies this turn |
|---|---|---|
| hooks/overview.mdx (devin-cli docs) | `.devin/hooks.v1.json` standalone, project+ancestors discovery; exit 2 o decision:block bloccano; updatedInput riscrive | il config vivrà in `D:\git\primebrick\.devin\hooks.v1.json` |
| hooks/lifecycle-hooks.mdx | stdin porta session_id/prompt_id/tool_input; Stop ha `stop_hook_active`; UserPromptSubmit accetta additionalContext | lo stato per-sessione è costruibile via file in temp keyed by session_id; anti-loop via stop_hook_active |
| workflow.md fe-v3 | spec-first, prova del 9 end-user, ledger, commit-cadence | sono gli invarianti che il gate enforcea meccanicamente |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-27 | ls .devin root workspace | esiste con config.local.json, rules/, skills/ | `D:\git\primebrick\.devin` | hooks.v1.json va lì |
| 2026-11-27 | grep hooks user config | zero hook configurati oggi | %APPDATA%\devin\config.json | partenza pulita |

## Status: 🟠 WIP — Plan date: 2026-11-27 / tic completato, in attesa ratifica design

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | TIC: doc hooks + evidenza discovery + piano | ✅ done | 2026-11-27 | questo file |
| 2 | Ratifica design utente (domande sotto) | ⏳ not done | — | |
| 3 | `hooks/protocol-inject.mjs` + config `.devin/hooks.v1.json` | ⏳ not done | — | config richiede approvazione esplicita (workspace governance) |
| 4 | `hooks/session-ledger.mjs` — osservatore PostToolUse | ⏳ not done | — | |
| 5 | `hooks/stop-gate.mjs` — gate di fine turno | ⏳ not done | — | |
| 6 | Verifica empirica end-to-end: sessione reale, violazione provocata, gate che blocca | ⏳ not done | — | la prova del 9 del meccanismo stesso |
| 7 | Doc utente in dev-guide workspace + commit/push | ⏳ not done | — | |

---

## Scopo (perché questo piano esiste)

Fallimento documentato in crm-migration-completion.md: workflow letta e non applicata
per mesi; l'unico enforcement che ha funzionato empiricamente è quello fisico
(gitflow pre-commit hook → compliance immediata). Obiettivo: spostare gli invarianti
del workflow dalla disciplina di lettura alla barriera meccanica nel lifecycle.

## Design ratificabile — i tre hook

### A. `protocol-inject.mjs` — eventi UserPromptSubmit + PostCompaction
Inietta ad ogni prompt utente (e dopo ogni compaction) il protocollo operativo
compatto — 14 righe, non la doc intera (la diluizione è il nemico):

```
PROTOCOLLO OPERATIVO — ogni task governed segue il wrapper, niente eccezioni:
1. doc receipts nel piano (doc:line) prima di agire
2. spec definitiva RED che codifica il risultato END-USER — prima dell'implementazione
3. implementazione (il task vero)
4. spec GREEN
5. prova del 9 end-user sullo stack reale — guarda il risultato come lo vede
   l'utente (browser/HTTP/DB), mai il meccanismo
6. ledger + commit + push — lo stop-gate verifica 2/4/6 meccanicamente
Domande aperte → l'utente decide, mai indovinare. Anomalia → STOP → report.
```

### B. `session-ledger.mjs` — evento PostToolUse (observer, mai blocca)
Registra in `primebrick/temp/hookstate/<session_id>.json` ogni evento rilevante:
- edit/write di file → classificato: `spec` (*.{spec,test}.ts) vs `impl` (src/**) vs `plan` (ai-plans/**) vs altro
- exec di comandi test (`playwright test`, `vitest`) → run registrato con esito
Ledger meccanico per-sessione: niente forensi git, stato perfetto per costruzione.

### C. `stop-gate.mjs` — evento Stop (il gate)
Legge il ledger di sessione. Se `stop_hook_active` è già true → non bloccare
(anti-loop, lo dice la doc). Invarianti meccanici:
```
impl toccati E zero commit nuovi nei repo toccati     → BLOCK "committa o spiega"
impl toccati E zero spec nel ledger                   → BLOCK "spec-first violato:
                                                         la spec end-user prima"
spec scritte/modificate E mai eseguite                → BLOCK "esegui la spec"
impl toccati E ai-plans mai toccato                   → BLOCK "ledger del piano"
```
Dopo 2 blocchi consecutivi nella stessa sessione sulla stessa classe → warning
visibile invece di blocco (anti-loop di coda). Turni di sola chat/zero edit: passa tutto.

## Cosa NON enforcea (onestà di design, ratifica esplicita richiesta)
- La semantica end-user delle asserzioni — non è verificabile meccanicamente;
  resta la ratifica TIC. Il gate enforcea l'ORDINE (spec-first), che è il proxy
  strutturale: una spec scritta prima non può codificare l'artefatto.
- La prova del 9 visiva — il gate ricorda/obbliga la dichiarazione, non può
  guardare lo screenshot al posto dell'agente.

## Files impattati
- `primebrick-workspace/hooks/*.mjs` — i tre script (repo workspace, content normale)
- `D:\git\primebrick\.devin\hooks.v1.json` — config governance: RICHIEDE APPROVAZIONE ESPLICITA
- `primebrick/temp/hookstate/` — runtime state (gitignored)

## Criteri di accettazione (il risultato atteso END-USER del meccanismo)
1. `/hooks` mostra i tre hook caricati dalla sorgente giusta
2. Provocando una violazione (edit impl senza spec + stop) il gate BLOCCA con reason leggibile
3. Scaricando l'obbligo il turno si chiude — niente loop infinito
4. Ogni prompt utente mostra il protocollo iniettato nel contesto agente
5. Turno di sola chat: zero blocchi (no falsi positivi)

## Domande per la ratifica
Q1. Soglia spec-first: blocco duro anche per fix typo/refactor? Proposta: sì —
    il gate non distingue, l'agente spiega all'utente nel reason-response.
    Alternativa: matcher solo su feat/behavioral — non distinguibile meccanicamente.
Q2. Il blocco "ai-plans mai toccato" vale anche per micro-edit? Proposta: sì,
    il ledger è sempre dovuto in presenza di impl — altrimenti il gate ha una scappatoia larga quanto il mondo.
Q3. config in `.devin/hooks.v1.json` alla root workspace (condiviso da ogni
    sessione nel tree, discovery antenati) — ok?
