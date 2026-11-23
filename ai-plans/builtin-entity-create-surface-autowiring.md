# Record-sheet edit + form surfaces — auto-wiring gaps (sequence registry)

## Status: 🟢 TOC PARZIALE CONSEGNATO — T1/T4/T5(sheet-via) ✅ live 13/13 e2e; T2/T3 pending; **TIC-2 (validation autowiring) in corso — drift architetturale confermato**

## TIC-2 — VALIDATION/RESET/FOOTER AUTOWIRING (utente: create sheet senza zod/superform)

### Verdetto empirico — il motore DECISO non è mai stato estratto

`elt-ref-cell-sheet-plan.md` (piano canonico, decisioni utente) dichiara
esplicitamente: **"`EntityFormSurface` (dispatcher + zod + superform +
placement grid) is the ONLY renderer"** — task 3d "extract chrome-agnostic
form surface from `EntityFormPage`; EntityFormPage refactors onto it;
sheet renders it disabled-by-default + pencil toggle".

**`EntityFormSurface` non esiste** — mai estratto. La record sheet è
stata costruita col FIELD component (`EntityFormField`, raw draft-bound)
saltando tutto il FORM machinery. La create-mode ha ereditato il drift.

### Censimento superfici form — TRE motori oggi

| Superficie | zod schema | superForm | error chrome | reset | Stato |
|---|---|---|---|---|---|
| `EntityFormPage` (create/detail routes) | ✅ `buildEntityFormSchema` zod4 | ✅ tainted/isTainted | ✅ `TranslatedFormFieldErrors` per-campo | ✅ `entity-form-reset` (eraser) | CANONICO |
| `entity.record` update+create | ❌ nessuno | ❌ | ❌ solo stringa `save_failed` | ❌ | raw draft + apiFetch — DRIFT |
| `EntityDictPage` + `DictExtrasPanel` | ❌ | ❌ | ⚠️ `composerErrors` proprio | ❌ | TERZO motore |
| `BulkEditorPanel` | ❌ (solo write-schema server) | ❌ | — | ❌ | server-400 |
| `SequenceSetDialog`/dialog custom | ❌ | ❌ | — | ❌ | op custom |
| Settings page (users/clients/orgs create) | ✅ zod authored | ✅ | ✅ | — | lib canonica, schema custom |

### Perché `name` non è required (risposta precisa)

1. Il FATTO arriva sul filo: `withColumnConstraints` auto-deriva
   `nullable:false` da `@Column({nullable:false})` su `SequenceEntity.name`
   (`column-constraints.ts:6,94` — `undefined ⇒ NOT NULL`)
2. `buildEntityFormSchema:165` mappa `nullable===false && !managed` →
   `required` nello zod
3. **La sheet non costruisce mai uno schema** → required mai
   materializzato, mai cromato, mai bloccante. L'autowiring esiste sul
   filo — la superficie lo ignora.

### Footer canonico (FormPageLayout/EntityFormPage:615-638)

`entity-form-reset` (eraser icon, `disabled={!hasChanges}`) + Cancel +
`entity-form-submit` (plain Save — **nessuna icona Check**). La sheet ha
un `<Check>` sul save (drift preesistente) e un Cancel in create che non
ha senso (non c'è readonly a cui tornare — la ✕ della sheet copre abort).

### Task aggiunti

| # | Task | Repo |
|---|------|------|
| T7 | **`EntityFormSurface.svelte`** — estrarre da `EntityFormPage`: `buildEntityFormSchema` + placement grid + `EntityFormField`/`FormField`+`TranslatedFormFieldErrors` + superForm (tainted/errors/reset/isTainted) + commit PUT/POST. `EntityFormPage` refactora sopra; `entity.record` lo monta (update: disabled+record baseline; create: empty baseline). UN motore | fe |
| T8 | Footer sheet canonico: niente Check icon; **Cancel via** (pencil toggle = cancel in update; create aborta via ✕ sheet); `entity-record-sheet-reset` eraser `disabled={!hasChanges}` | fe |
| T9 | `name`+`pattern`+`step`+`start` required-chrome via schema (gratis con T7 — `nullable:false` già servito) | — |
| T10 | E2E: required blocking, error chrome per-campo, reset behavior, footer anatomy | fe |

> TIC plan — trigger: revisione utente della **sheet modifica SEQ**
> (`entity.record` in edit mode, aperta da kebab "Modifica" su
> `/crm/settings/sequences`). Verdetto utente confermato: la modifica È la
> stessa machinery della create — `EntityFormField`/`FormFieldDispatcher`
> guidano EntityFormPage, record sheet, dict rows, bulk editor. I gap sono
> nel wiring meta→form, non nelle singole superfici: chiuderli nel
> dispatcher/contratto li sistema ovunque.

## Evidenze empiriche (TIC) — il path edit verificato

### Il path: kebab "Modifica" → `entity.record` edit mode

| Pezzo | File | Fatto |
|---|---|---|
| Apertura | `EntityTablePage.svelte:218-219` | `openSheet('entity.record', {entity, value: row[uid], service, edit:true})` — la fallback Modifica per entità senza `kind:"detail"` route |
| Mode | `EntityRecordSheetBody.svelte:163-175` | `EntityFormField` riceve `disabled={!editing}` ma **mai `mode`** → default `'update'` → `immutable` disabled |
| Selezione campi (fallback) | `EntityRecordSheetBody.svelte:87-91` | `allColumns.filter(c => c.audited !== true && c.key !== uid && c.key !== 'version')` — i virtuali PASSANO → widget |
| Selezione campi (dichiarata) | `EntityRecordSheet.svelte:74-82` | `page_props.form` placements se la route censita le dichiara — la route builtin `kind:"list"` non ha `page_props` → sempre fallback |
| PUT keys | `EntityRecordSheet.svelte:225-232` | `!audited && !immutable && key!==uid && key!=='version'` → **i virtuali viaggiano nel PUT** → `SEQUENCE_WRITE_KEYS` (`sequence-decl.ts:363`) li scarta server-side → **dead widget**: editabile, salva, nessun effetto |
| Disabled derivation | `EntityFormField.svelte:111-115` | `disabled \|\| kind==='calculated' \|\| (immutable && mode!=='create')` — **`kind:"virtual"` assente** |

### Sintomo 1 — `name` non editabile

| Pezzo | File | Fatto |
|---|---|---|
| Flag | `sequence-decl.ts:67` | `immutable:true` → disabled su update, editabile solo su `kind:"create"` |
| Contratto | `entity-metadata.mdx:113` | `immutable` = "set once at creation OR derived by a process" |
| Righe bound | materializzazione det-uuid | `name` = `<table>.<field>` derivato → `immutable` CORRETTO |
| Righe operator | create via API | `name` = display data, non identity (uuid lo è) → `immutable` blocca rename legittimo. Utente: "non è chiave univoca è solo display-name" |
| Wire | `SEQUENCE_WRITE_KEYS:363` | `name` è accettato dal PUT — il freeze è solo UI, incoerente anche così |

### Sintomo 2 — `emitted_*`/`value_*` modificabili (dead widgets)

| Pezzo | File | Fatto |
|---|---|---|
| Colonne | `sequence-decl.ts:74-78` | `value_actual`, `value_next`, `emitted_actual`, `emitted_next` — `kind:"virtual"`, proiezioni `attachCounterProjection` |
| Contratto | `entity-metadata.mdx:112` | `virtual`: "no physical backing — value arrives via service-side decoration" → mai scrivibile per costruzione |
| Enforcement | — | `BulkEditorPanel:76` fa `!c.kind` (corretto); record-sheet fallback NO; `EntityFormField` disabled NO; PUT keys NO |
| Doc gap | `entity-record-sheet.mdx` | tabella "Meta-driven behavior" non menziona `kind:"virtual"` — gap anche documentale |

### Sintomo 3 — `description_key` widget sbagliato

| Pezzo | File | Fatto |
|---|---|---|
| Dichiarazione | `sequence-decl.ts:82` | `format:"i18n_key"` — il contratto ESISTE (TIC round 3 piano precedente) |
| Cell | `TableCell` + `entity-meta-schema.md:79-85` | badge `languages` + `$t(value)` + raw-key — OK |
| Form | `FormFieldDispatcher.deriveControl:314-348` | branch `i18n_key` **assente** → fallback `text` |
| Widget esistente | `TranslationKeyCell.svelte` + `TranslationEditorPanel.svelte` | key pick/create + languages CTA + editor — vive solo in `DictRow`/`DictDraftRow` |

### Sintomo 4 — `pattern` plain text, nessun composer

| Pezzo | File | Fatto |
|---|---|---|
| Colonna | `sequence-decl.ts:76` | `type:"text"` plain → Input |
| Validazione | `vPattern:349` | `parseSequencePattern` a save-time — zero assist |
| Precedente | `format:"schedule_spec"` → `ScheduleSpecInput` | composer via format semantico |
| Preview già esistente | `sequence.forecast` RPC + `emitted_*` projection | il composer può dare preview live governata |

## Il wiring che manca — risposta sistemica

1. **`kind:"virtual"` senza contratto form** — cell OK, bulk editor OK
   (`!c.kind`), record sheet / `EntityFormField` / PUT-keys NO. Regola unica:
   i virtuali **non sono mai widget** — nel record sheet restano informativi
   (readonly) o esclusi; mai nel form, mai nel PUT.
2. **`deriveControl` non copre `i18n_key`** — ogni format con semantica
   write deve avere il control; il widget dict esiste, va montato per format.
3. **`format:"sequence_pattern"` non esiste** — vocab + composer.
4. **`immutable` su `name` semantica sbagliata per operator rows** — il flag
   non distingue provenienza riga; `name` è display data → editabile.
5. **Nessuna superficie create/detail per i builtin** (gap adiacente, stessa
   famiglia): `mergeBuiltinNav` (`builtin-entities.ts:134`) emette solo
   `kind:"list"` → `create.single` enabled ma irraggiungibile da UI — il
   record-sheet edit è de facto l'unica superficie campi (e per questo il
   modifica "è comunque la create"). Fuori scope stretto ma da registrare:
   `BuiltinNavContribution` dovrebbe poter dichiarare `kind:"create"` +
   `page_props.form` per costruzione.

### Modello create surface — deciso con l'utente

- **Update/detail MAI leaf di nav** — parametrici (`[uuid]`), esclusi per
  costruzione; vivono nel record sheet (o route `kind:"detail"` per
  `openEdit` `:uuid`).
- **Create DEVE comparire** — non parametrica → CTA + route censita.
- **SHEET vs FORM è authoring sul META** (`meta.create.surface`), mai
  prop Svelte: `onCreateAction` è escape-hatch, non il path governato.
  - `surface:"form"` (default) → census `kind:"create"` + `page_props.form`
    → `EntityFormPage` page.
  - `surface:"sheet"` → nessuna route (non leaf); CTA →
    `openSheet('entity.record', {entity, service, mode:'create'})`.
- **`entity.record` UN panel, mode-driven** — non un secondo
  `entity.create`: `mode:'create'` → niente fetch, draft da baseline
  defaults, sezioni record-only (uid badge/version/audit/lifecycle)
  assenti, commit POST via `create.single` endpoint, `mode:'create'`
  passato a `EntityFormField` → `immutable` editabile.

## Decisioni — BLOCCATE dall'utente

| # | Domanda | Decisione |
|---|---|---|
| Q1 | `name` `immutable` | **DROP** — "Name è mutabile quante volte voglio, non è unique e non è immutable" |
| Q2 | `kind` nel record sheet | **Le regole sono già nel contratto** — core `entity-meta.ts:480-488`: `kind` = "Read-only: never required on write, never belongs in `page_props.form`". `calculated` = SQL projection; `virtual` = post-query enrichment (NATS/decorate). → **mai widget form, mai in PUT**; esclusi da `formColumns` (il list li mostra già; `suspended` vive via lifecycle chip). Utente: "non dobbiamo decidere più nulla" |
| Q3 | Widget `i18n_key` in form | montare il control per format — riusa la machinery TranslationKeyCell/`TranslationEditorPanel` |
| Q4 | `format:"sequence_pattern"` | composer assistito + preview forecast — autorizzato |
| Q5 | Sequence `create.surface` | **`"sheet"`** → `entity.record` `mode:'create'` via CTA meta-driven (`meta.create.surface:"sheet"`), nessuna route create serve |

## Task proposti

| # | Task | Repo |
|---|---|---|
| T1 | ✅ DONE — `kind` escluso da `formColumns`/`saveKeys` + `EntityFormField` `column.kind !== undefined` → disabled + doc allineata | fe (commit `6aebc7e`) |
| T2 | ⏳ PENDING — `i18n_key` → form control: `deriveControl` branch + component che riusa `TranslationKeyCell`/`TranslationEditorPanel` | fe |
| T3 | ⏳ PENDING — `format:"sequence_pattern"` + `SequencePatternInput` (ui) + `deriveControl` branch + decl `pattern` format | core, ui, fe, dal |
| T4 | ✅ DONE — `name` drop `immutable` | dal (commit `7b73ed6`) |
| T5 | ✅ DONE (sheet-via) — `meta.create.surface` su `EntityMeta` (core `73c5a2a`), `entity.record` `mode:'create'` (morph→update), CTA meta-driven in `EntityTablePage`. La via `"form"` (census `kind:"create"` per builtin) resta il default documentato ma non implementata — nessun builtin la usa | core, fe, dal |
| T6 | ✅ DONE (parziale) — nuovo test `create.surface sheet` copre CTA→create→POST→morph + kind mai widget + name mutabile (13/13 suite). Mancano: `description_key` widget (dopo T2), `pattern` composer (dopo T3) | fe |

## Verifiche (empirical or nothing)

- Record sheet edit: `value_*`/`emitted_*` non widget (esclusi o readonly) — mai nel PUT
- `name` editabile → rename persiste via PUT
- `description_key` → widget translation-key, mai text input
- `pattern` → composer con preview `forecast` live + validazione inline
- Census: `kind:"create"` route con `page_props.form` → CTA toolbar → create via UI funziona (riga operator)
- E2E `sequences.spec.ts` esteso, seriale, su stack live

## Note

- `SequenceSetDialog` fuori scope — op parametrica, surface propria.
- Doc gap da chiudere nello stesso giro: `kind:"virtual"` comportamento-form non specificato in `entity-record-sheet.mdx` né `entity-metadata.mdx`.
- `create.single`/`update.single` API + permissions già esistono — zero lavoro BE endpoint.
