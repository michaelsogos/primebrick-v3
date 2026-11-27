# Gap: error_code badge → job.runDetail drill mai implementato

> Origine: scoperto durante il rot-repair di `jobs-pages.spec.ts` (slice job-handler-standard-migration,
> 2026-11-27). Non è debito di test — è una feature di prodotto assente nel codice.

## Cosa si voleva testare e dove

`primebrick-fe-v3/src/e2e/jobs-pages.spec.ts:564` — *"/system/job/job_runs error_code badge opens
the run-detail remote sheet"*:

1. end-user apre `/system/job/job_runs`
2. filtra i run failed via outcome preset
3. **clicca il badge error_code nella cella** (es. EXECUTION_ERROR, rosso)
4. si apre la remote sheet `job.runDetail` (mount esm del chunk `jobs-page.js` del modulo)
   con il contenuto del run — error_code/error_detail in evidenza

Il test è la specifica end-user corretta del contratto voluto: resta come riferimento RED
quando la feature verrà implementata (attualmente `test.skip` con puntatore a questo piano).

## Dove FUNZIONA tutto il resto

- **Il badge renderizza correttamente**: `TableCell.svelte:341-350` — branch
  `column.badge?.values` — colori e label tradotte per tutti i valori
  (EXECUTION_ERROR rosso, VALIDATION_ERROR amber, SCHEDULE_PAUSED grigio, ecc.)
- **La remote sheet esiste ed è viva**: `job-handler/src/nav-declaration.ts:102` dichiara
  `job.runDetail` con `component_url` esm-mount; `job-handler/fe/src/RunDetailSheet.svelte`
  renderizza status/error_code/error_detail del run
- **La meta dichiara l'intento**: `job-handler/src/modules/jobs/job.meta.ts:437` —
  *"Free-form detail behind the badge — never a column: the run-detail sheet is its surface"*

## Il GAP — preciso e verificato riga per riga

Manca interamente il **ponte click → sheet**:

1. **Nessun canale meta**: la dichiarazione `badge: { values: {...} }` (job.meta.ts:420-430)
   non ha alcun campo per il target di drill — né sheet, né panel, né ref
2. **Nessun rendering cliccabile**: il branch badge di TableCell emette un `<Badge>` puro —
   zero onclick, zero button, zero affordance (verificato: nessun branch `type === 'badge'`
   con drill; i drill esistenti sono hardcoded per casi speciali — roles via `options_source`,
   version column)
3. **Nessun wiring FE**: `openSheet` non viene mai chiamato con `job.runDetail` in tutto il FE
   (grep vuoto su src/lib e src/lib/shell)

Conseguenza end-user: **cliccare il badge error_code non fa nulla** — per ogni utente, oggi,
in produzione. L'unico modo di vedere il dettaglio errore è la `entity.record` canonica
(drill da ref cell o row), che però non mostra la superficie ricca del RunDetailSheet.

## Nota di design da risolvere nell'implementazione

`job.meta.ts:518` dice: *"The run's detail surface is the canonical `entity.record` sheet,
reached automatically when a ref cell resolves a run elsewhere"* — coesiste con il contratto
del badge: entity.record è la superficie **generica** del record, runDetail è la superficie
**diagnostica** del fallimento. Non sono in conflitto, ma l'implementazione deve decidere la
precedenza del row-click.

## Implementazione proposta (quando schedulata)

1. **Canale meta**: estendere la dichiarazione badge con drill target, es.
   `badge: { values: {...}, drill: { sheet: "job.runDetail" } }` — validato nel meta-schema
   (sdk entity-meta contract)
2. **FE wiring**: nel branch badge di TableCell, se `column.badge.drill?.sheet` esiste →
   renderizzare come CellAffordance/button che chiama `openSheet(sheet, { uuid: row[metaUid] })`
   — la sheet remota riceve la riga/uuid come contesto (verificare il contratto props di
   RunDetailSheet: accetta `run` o `uuid`?)
3. **Spec**: rimuovere lo skip in jobs-pages.spec.ts:564 — il test è già la RED/GREEN finale
4. **Verifica end-user**: click su badge EXECUTION_ERROR → sheet remota con error detail

## Riferimenti

- Ledger madre: `ai-plans/job-handler-standard-migration.md` (sezione rot-repair)
- RunDetailSheet props contract: `job-handler/fe/src/RunDetailSheet.svelte:22`
- Badge rendering: `primebrick-fe-v3/src/lib/components/entity-list-table/table/TableCell.svelte:341-350`
- Sheet engine: `primebrick-fe-v3/src/lib/shell/sheets/sheet-manager.svelte` (openSheet)
