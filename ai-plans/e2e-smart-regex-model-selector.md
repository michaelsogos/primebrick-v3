# E2E Spec — Smart Regex model selector (rank meter + sort)

## Obiettivo

Spec Playwright E2E deterministico per il selettore modello del pannello Smart
Regex AI: ordinamento di default per rank, RankMeter per riga, e submenu di
sorting che riordina istantaneamente **senza chiudere** il dropdown.

File: `primebrick-fe-v3/src/e2e/smart-regex-model-selector.spec.ts` (già creato,
da correggere secondo questo piano).

## Evidenze raccolte dal codice (non supposizioni)

DOM state machine, da `regex-ai-chat-panel.svelte`:

| Stato app | Condizione | Testid presenti |
|---|---|---|
| Pagina pronta | — | `smart-regex-brain-cta` |
| Pannello aperto, modello in caricamento | `ai.state.is_loading_model` | `smart-regex-ai-loading`, `smart-regex-ai-progress-bar`, `smart-regex-ai-loading-files`, `smart-regex-ai-loading-model-name`, `smart-regex-ai-cancel-load` |
| Modello pronto / errore | `is_ready \|\| error` (e `error !== 'webgpu_required'`) | `smart-regex-ai-disclaimer`, `smart-regex-ai-input-wrapper`, `smart-regex-ai-input`, `smart-regex-ai-model-trigger`, `smart-regex-ai-send`, `smart-regex-ai-cache-trigger`, `smart-regex-ai-model-details-trigger` |
| No WebGPU | `error === 'webgpu_required'` | nessuna input area → skip test |

**Causa radice dei fallimenti precedenti**: `smart-regex-ai-model-trigger` NON
esiste durante il load — il waitFor 20s scadeva mentre il modello scaricava nel
profilo E2E fresco. Il click sul brain CTA ha sempre funzionato.

## Autenticazione

- Nessuna automazione del login (MFA/WebAuthn dell'utente — vietata).
- Contesto **persistent** Edge headed: `chromium.launchPersistentContext` con
  `channel: 'msedge'`, profilo `D:\git\primebrick\temp\pw-edge-profile`.
- La sessione è già stata autenticata manualmente dall'utente (login fatto) →
  `gotoAuthed()` verifica l'evidenza: se `page.url()` contiene `/login` attende
  il redirect post-login manuale (timeout 120s, unico caso in cui si attende
  un'azione umana), altrimenti prosegue subito.

## Struttura dello spec (ogni step = attesa su evidenza DOM, zero sleep fissi)

### beforeEach
1. `gotoAuthed(page, '/system/settings/security/create')`.
2. `waitFor` su `smart-regex-brain-cta` visibile → prova che auth+hydration ok.
3. WebGPU: `navigator.gpu.requestAdapter()` → se `null` o assente,
   `test.skip` (evidenza, non supposizione).
4. Click `smart-regex-brain-cta`.
5. Attesa stato terminale, **evidence-driven**: `Promise.race` tra
   `smart-regex-ai-model-trigger` (ready/error) e nient'altro — timeout bounded
   (vedi domanda aperta sul download). Se scade → il test fallisce stampando
   quale testid è presente nel DOM (`loading`, `progress-bar`, …) come
   evidenza dello stato reale.

### Test 1 — default rank ordering + RankMeter
1. Click `smart-regex-ai-model-trigger` → attendo `[role="menuitem"]` count > 1
   (prova menu aperto).
2. Leggo gli score da ogni `[role="menuitem"] [data-testid="rank-meter"]` span
   → asserisco non-crescente.
3. Per ogni meter, la fill `.h-full` ha `style.width ≈ rank/5*100%` →
   asserisco la proporzionalità sul primo elemento.
4. Asserisco `smart-regex-ai-power-circle` presente con `background` non vuoto
   (dot rank-driven).

### Test 2 — sort istantaneo senza chiusura
1. Apro il dropdown (come sopra).
2. Click `smart-regex-ai-sort-trigger` → attendo che
   `smart-regex-ai-sort-alphabetic` (`[role="menuitemradio"]`) sia visibile
   → prova submenu aperto.
3. Click `smart-regex-ai-sort-alphabetic`.
4. Evidenze post-click (tutte e tre, nessuna sleep):
   a. `smart-regex-ai-sort-alphabetic` ancora visibile → menu NON chiuso.
   b. `[role="menuitem"]` ancora visibile → popover padre aperto.
   c. Nomi righe (primo testo di ogni menuitem) === copia ordinata
      `localeCompare` A→Z.
5. Click `smart-regex-ai-sort-rank` → stesse prove di apertura + righe
   non-crescenti per rank.
6. `speed`, `quality`, `power`: asserisco menu aperto + radio checked;
   l'ordine numerico non è verificabile dal DOM (speed/quality non renderizzate)
   → asserisco determinismo ri-selezionando e confrontando l'ordine.

### Convenzioni
- Solo `data-testid` + `role` ARIA (brittle-on-purpose, vedi
  `docs/ai/e2e-testid-convention.md`).
- Timeout: solo `waitFor` su condizioni; nessun `waitForTimeout` nello spec.
- Nessuna modifica al codice app per favorire il test.

## Domande aperte (decisione richiesta)

1. **Cold-cache first run**: nel profilo E2E il modello (~2.3GB) deve scaricare
   una volta. Opzioni:
   a. Timeout bounded lungo solo su quell'attesa (es. 5 min) con messaggio
      esplicito;
   b. Pre-warm: un primo step che apre il pannello e attende il load completo
      fuori dai test;
   c. Saltare l'attesa richiedendo che il profilo sia già caldo.
   → Quale preferisci?
2. Modello selezionato all'apertura = default config (granite micro q4f16) —
   il test non cambia modello, verifica solo ordinamento. OK?

## Acceptance criteria

- `npx playwright test smart-regex-model-selector --workers=1` → 2 passed.
- Se il modello non è in cache, il fallimento riporta quale testid DOM è
  rimasto attivo (evidenza dello stato, non timeout cieco).
- Il dropdown resta aperto dopo ogni selezione di sort (regressione coperta).
